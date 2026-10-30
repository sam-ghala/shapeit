import { json, bearer } from "../../../platform/server/http.js";
import {
  createPushRoom,
  joinPushRoom,
  pushRoomView,
  applyPushAction,
  upgradePushRoom,
} from "../rooms.js";
export function handlePushIt(service, request, url, body, now) {
  if (url.pathname === "/api/pushit/rooms" && request.method === "POST") {
    let code;
    for (let i = 0; i < 100; i++) {
      const candidate = String(
        crypto.getRandomValues(new Uint32Array(1))[0] % 10000,
      ).padStart(4, "0");
      if (
        ![
          ...service.sql.exec(
            "SELECT code FROM pushit_rooms WHERE code = ?",
            candidate,
          ),
        ].length
      ) {
        code = candidate;
        break;
      }
    }
    if (!code)
      return json(
        { error: "All rooms are busy. Please try again later." },
        503,
      );
    const room = createPushRoom(code, body.profile, now);
    service.sql.exec(
      "INSERT INTO pushit_rooms (code,data,expires) VALUES (?,?,?)",
      code,
      JSON.stringify(room),
      room.expiresAt,
    );
    return json(
      { room: pushRoomView(room, 0), token: room.players[0].token },
      201,
    );
  }
  const match = url.pathname.match(
    /^\/api\/pushit\/rooms\/(\d{4})(?:\/(join|action))?$/,
  );
  if (!match) return json({ error: "Not found." }, 404);
  const row = [
    ...service.sql.exec(
      "SELECT data FROM pushit_rooms WHERE code = ?",
      match[1],
    ),
  ][0];
  if (!row)
    return json(
      { error: "Room not found or expired. Ask your friend for a new code." },
      404,
    );
  const room = JSON.parse(row.data);
  upgradePushRoom(room);
  const previous = structuredClone(room);
  const previousGameId = room.gameId,
    previousPhase = room.phase;
  let token = bearer(request),
    index = room.players.findIndex((p) => p.token === token),
    joined = false;
  if (match[2] === "join" && request.method === "POST") {
    token = joinPushRoom(room, body.profile);
    index = room.players.length - 1;
    joined = true;
  } else if (index < 0)
    return json({ error: "Join with the room code first." }, 403);
  if (match[2] === "action" && request.method === "POST")
    applyPushAction(room, index, body);
  else if (!joined && request.method !== "GET")
    return json({ error: "Method not allowed." }, 405);
  if (
    previousPhase === "playing" &&
    (room.phase === "closed" || room.gameId !== previousGameId)
  )
    recordPushAbort(service, previous, now);
  if (
    room.phase === "playing" &&
    (previousPhase !== "playing" || previousGameId !== room.gameId)
  ) {
    room.startedAt = now;
    room.players.forEach((p, i) =>
      service.event(
        {
          id: `pushit:${room.gameId}:${i}:start`,
          game: "pushit",
          sessionId: room.gameId,
          profileId: p.id,
          name: p.name,
          kind: "start",
          mode: "online",
          size: "4x4",
          round: room.round,
          bestOf: room.bestOf,
        },
        now,
      ),
    );
  }
  if (
    previousPhase === "playing" &&
    ["finished", "complete"].includes(room.phase)
  ) {
    room.players.forEach((p, i) =>
      service.event(
        {
          id: `pushit:${room.gameId}:${i}:finish`,
          game: "pushit",
          sessionId: room.gameId,
          profileId: p.id,
          name: p.name,
          kind: "finish",
          mode: "online",
          size: "4x4",
          result: p.color === room.game.winner ? "won" : "lost",
          turns: room.game.turn,
          seconds: Math.max(
            0,
            Math.floor((now - (room.startedAt || now)) / 1000),
          ),
          round: room.round,
          bestOf: room.bestOf,
          blackWins: room.wins.black,
          whiteWins: room.wins.white,
          winnerColor: room.game.winner,
        },
        now,
      ),
    );
  }
  service.sql.exec(
    "UPDATE pushit_rooms SET data = ? WHERE code = ?",
    JSON.stringify(room),
    room.code,
  );
  return json({
    room: pushRoomView(room, index),
    ...(joined ? { token } : {}),
  });
}

function recordPushAbort(service, room, now) {
  if (room.phase !== "playing") return;
  room.players.forEach((p, i) =>
    service.event(
      {
        id: `pushit:${room.gameId}:${i}:abort`,
        game: "pushit",
        sessionId: room.gameId,
        profileId: p.id,
        name: p.name,
        kind: "abort",
        mode: "online",
        size: "4x4",
        turns: room.game.turn,
        seconds: Math.max(
          0,
          Math.floor((now - (room.startedAt || now)) / 1000),
        ),
        round: room.round,
        bestOf: room.bestOf,
      },
      now,
    ),
  );
}
export function expirePushItRooms(service, now) {
  for (const row of service.sql.exec(
    "SELECT data, expires FROM pushit_rooms WHERE expires < ?",
    now,
  )) {
    const room = JSON.parse(row.data);
    upgradePushRoom(room);
    recordPushAbort(service, room, row.expires);
  }
  service.sql.exec("DELETE FROM pushit_rooms WHERE expires < ?", now);
}
