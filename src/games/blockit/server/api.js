import { json, bearer } from "../../../platform/server/http.js";
import {
  createBlockRoom,
  joinBlockRoom,
  blockRoomView,
  applyBlockAction,
} from "../rooms.js";

export function handleBlockIt(service, request, url, body, now) {
  if (url.pathname === "/api/blockit/rooms") {
    if (request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    let code;
    for (let i = 0; i < 100; i++) {
      const candidate = String(
        crypto.getRandomValues(new Uint32Array(1))[0] % 10000,
      ).padStart(4, "0");
      if (
        ![
          ...service.sql.exec(
            "SELECT code FROM blockit_rooms WHERE code = ?",
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
    const room = createBlockRoom(code, body.profile, now);
    service.sql.exec(
      "INSERT INTO blockit_rooms (code,data,expires) VALUES (?,?,?)",
      code,
      JSON.stringify(room),
      room.expiresAt,
    );
    return json(
      { room: blockRoomView(room, 0), token: room.players[0].token },
      201,
    );
  }
  const match = url.pathname.match(
    /^\/api\/blockit\/rooms\/(\d{4})(?:\/(join|action))?$/,
  );
  if (!match) return json({ error: "Not found." }, 404);
  if (request.method !== (match[2] ? "POST" : "GET"))
    return json({ error: "Method not allowed." }, 405);
  const row = [
    ...service.sql.exec(
      "SELECT data FROM blockit_rooms WHERE code = ?",
      match[1],
    ),
  ][0];
  if (!row)
    return json(
      { error: "Room not found or expired. Ask your friend for a new code." },
      404,
    );
  const room = JSON.parse(row.data);
  const previous = structuredClone(room);
  let token = bearer(request);
  let index = room.players.findIndex((p) => p.token === token);
  const joined = match[2] === "join";
  if (joined) {
    token = joinBlockRoom(room, body.profile);
    index = room.players.length - 1;
  } else if (index < 0) {
    return json({ error: "Join with the room code first." }, 403);
  }
  if (match[2] === "action") applyBlockAction(room, index, body);
  if (
    previous.phase === "playing" &&
    (room.phase === "closed" || room.gameId !== previous.gameId)
  )
    recordBlockEvents(service, previous, "abort", now);
  if (
    room.phase === "playing" &&
    (previous.phase !== "playing" || previous.gameId !== room.gameId)
  ) {
    room.startedAt = now;
    recordBlockEvents(service, room, "start", now);
  }
  if (previous.phase === "playing" && room.phase === "finished")
    recordBlockEvents(service, room, "finish", now);
  if (request.method === "POST")
    service.sql.exec(
      "UPDATE blockit_rooms SET data = ? WHERE code = ?",
      JSON.stringify(room),
      room.code,
    );
  return json({
    room: blockRoomView(room, index),
    ...(joined ? { token } : {}),
  });
}

function recordBlockEvents(service, room, kind, now) {
  room.players.forEach((player, index) =>
    service.event(
      {
        id: `blockit:${room.gameId}:${index}:${kind}`,
        game: "blockit",
        sessionId: room.gameId,
        profileId: player.id,
        name: player.name,
        kind,
        mode: "online",
        size: "9x9",
        round: room.round,
        ...(kind === "start"
          ? {}
          : {
              turns: room.game.turn,
              seconds: Math.max(
                0,
                Math.floor((now - (room.startedAt ?? now)) / 1000),
              ),
            }),
        ...(kind === "finish"
          ? {
              result: player.color === room.game.winner ? "won" : "lost",
              winnerColor: room.game.winner,
            }
          : {}),
      },
      now,
    ),
  );
}

export function expireBlockItRooms(service, now) {
  for (const row of service.sql.exec(
    "SELECT data, expires FROM blockit_rooms WHERE expires <= ?",
    now,
  )) {
    const room = JSON.parse(row.data);
    if (room.phase === "playing")
      recordBlockEvents(service, room, "abort", row.expires);
  }
  service.sql.exec("DELETE FROM blockit_rooms WHERE expires <= ?", now);
}
