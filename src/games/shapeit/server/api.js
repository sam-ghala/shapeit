import { json, bearer } from "../../../platform/server/http.js";
import {
  createRoom,
  joinRoom,
  playerIndex,
  applyAction,
  advanceRoom,
  roomView,
  cleanProfile,
} from "./duel.js";
export function handleShapeIt(service, request, url, body, now) {
  if (url.pathname === "/api/rooms" && request.method === "POST") {
    let code;
    for (let i = 0; i < 100; i++) {
      const candidate = String(
        crypto.getRandomValues(new Uint32Array(1))[0] % 10000,
      ).padStart(4, "0");
      if (
        ![
          ...service.sql.exec(
            "SELECT code FROM rooms WHERE code = ?",
            candidate,
          ),
        ].length
      ) {
        code = candidate;
        break;
      }
    }
    if (!code)
      return json({ error: "All room codes are busy. Try again later." }, 503);
    const room = createRoom(
      code,
      body.profile,
      body.mobile,
      body.settings,
      now,
    );
    service.sql.exec(
      "INSERT INTO rooms (code,data,expires) VALUES (?,?,?)",
      code,
      JSON.stringify(room),
      room.expiresAt,
    );
    return json(
      { room: roomView(room, 0, now), token: room.players[0].token },
      201,
    );
  }
  const match = url.pathname.match(
    /^\/api\/rooms\/(\d{4})(?:\/(join|action))?$/,
  );
  if (!match) return json({ error: "Not found." }, 404);
  const row = [
    ...service.sql.exec("SELECT data FROM rooms WHERE code = ?", match[1]),
  ][0];
  if (!row)
    return json(
      { error: "Room not found or expired. Ask your friend for a new code." },
      404,
    );
  const room = JSON.parse(row.data),
    oldPhase = room.phase;
  advanceRoom(room, now);
  let token = bearer(request),
    index = playerIndex(room, token),
    joined = false;
  if (match[2] === "join" && request.method === "POST") {
    token = joinRoom(room, body.profile, body.mobile);
    index = room.players.length - 1;
    joined = true;
  } else if (index < 0)
    return json(
      { error: "Room access denied. Join with the room code first." },
      403,
    );
  if (match[2] === "action" && request.method === "POST")
    applyAction(room, index, body, now);
  else if (!joined && request.method !== "GET")
    return json({ error: "Method not allowed." }, 405);
  if (oldPhase !== "playing" && room.phase === "playing")
    room.players.forEach((p, i) =>
      service.event(
        {
          id: `${room.id}:${i}:start`,
          sessionId: room.id,
          profileId: p.id,
          name: p.name,
          kind: "start",
          mode: "duel",
          size: room.size,
        },
        now,
      ),
    );
  if (oldPhase !== "finished" && room.phase === "finished")
    room.players.forEach((p, i) =>
      service.event(
        {
          id: `${room.id}:${i}:finish`,
          sessionId: room.id,
          profileId: p.id,
          name: p.name,
          kind: "finish",
          mode: "duel",
          size: room.size,
          result:
            room.winner === "draw" && (room.winners || [0, 1]).includes(i)
              ? "draw"
              : room.winner === i
                ? "won"
                : "lost",
          queries: room.queries.filter((q) => q.player === i).length,
          seconds:
            p.submission?.seconds ?? Math.floor((now - room.startedAt) / 1000),
          ...(["race", "random"].includes(room.settings.mode)
            ? { score: p.submission?.score ?? 0 }
            : {}),
        },
        now,
      ),
    );
  service.sql.exec(
    "UPDATE rooms SET data = ?, expires = ? WHERE code = ?",
    JSON.stringify(room),
    room.expiresAt,
    room.code,
  );
  index = playerIndex(room, token);
  if (body.type === "draft" || index < 0) return json({ ok: true });
  return json({
    room: roomView(room, index, now),
    ...(joined ? { token } : {}),
  });
}
