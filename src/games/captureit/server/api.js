import { json, bearer } from "../../../platform/server/http.js";
import {
  createCaptureRoom,
  joinCaptureRoom,
  captureRoomView,
  applyCaptureAction,
} from "../rooms.js";

export function handleCaptureIt(service, request, url, body, now) {
  if (url.pathname === "/api/captureit/rooms") {
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
            "SELECT code FROM captureit_rooms WHERE code = ?",
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
    const room = createCaptureRoom(code, body.profile, now);
    service.sql.exec(
      "INSERT INTO captureit_rooms (code,data,expires) VALUES (?,?,?)",
      code,
      JSON.stringify(room),
      room.expiresAt,
    );
    return json(
      { room: captureRoomView(room, 0), token: room.players[0].token },
      201,
    );
  }
  const match = url.pathname.match(
    /^\/api\/captureit\/rooms\/(\d{4})(?:\/(join|action))?$/,
  );
  if (!match) return json({ error: "Not found." }, 404);
  if (request.method !== (match[2] ? "POST" : "GET"))
    return json({ error: "Method not allowed." }, 405);
  const row = [
    ...service.sql.exec(
      "SELECT data FROM captureit_rooms WHERE code = ?",
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
    token = joinCaptureRoom(room, body.profile);
    index = room.players.length - 1;
  } else if (index < 0) {
    return json({ error: "Join with the room code first." }, 403);
  }
  if (match[2] === "action") applyCaptureAction(room, index, body);
  if (
    previous.phase === "playing" &&
    (room.phase === "closed" || room.gameId !== previous.gameId)
  )
    recordCaptureEvents(service, previous, "abort", now);
  if (
    room.phase === "playing" &&
    (previous.phase !== "playing" || previous.gameId !== room.gameId)
  ) {
    room.startedAt = now;
    recordCaptureEvents(service, room, "start", now);
  }
  if (previous.phase === "playing" && room.phase === "finished")
    recordCaptureEvents(service, room, "finish", now);
  if (request.method === "POST")
    service.sql.exec(
      "UPDATE captureit_rooms SET data = ? WHERE code = ?",
      JSON.stringify(room),
      room.code,
    );
  return json({
    room: captureRoomView(room, index),
    ...(joined ? { token } : {}),
  });
}

function recordCaptureEvents(service, room, kind, now) {
  room.players.forEach((player, index) =>
    service.event(
      {
        id: `captureit:${room.gameId}:${index}:${kind}`,
        game: "captureit",
        sessionId: room.gameId,
        profileId: player.id,
        name: player.name,
        kind,
        mode: "online",
        size: "classic",
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

export function expireCaptureItRooms(service, now) {
  for (const row of service.sql.exec(
    "SELECT data, expires FROM captureit_rooms WHERE expires <= ?",
    now,
  )) {
    const room = JSON.parse(row.data);
    if (room.phase === "playing")
      recordCaptureEvents(service, room, "abort", row.expires);
  }
  service.sql.exec("DELETE FROM captureit_rooms WHERE expires <= ?", now);
}
