import {
  createRoom,
  joinRoom,
  playerIndex,
  applyAction,
  advanceRoom,
  roomView,
  cleanProfile,
} from "./server/duel.js";
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const bearer = (request) =>
  (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (url.pathname === "/api/log") return new Response(null, { status: 204 });
    if (!env.GAME_SERVICE)
      return json(
        { error: "Online play is not configured on this server yet." },
        503,
      );
    if (request.method !== "GET" && request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin)
      return json({ error: "Origin not allowed." }, 403);
    if (url.pathname.startsWith("/api/admin/")) {
      if (!env.ADMIN_KEY)
        return json(
          {
            error:
              "Admin access is not configured. Set the ADMIN_KEY server secret.",
          },
          503,
        );
      const hash = async (s) =>
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
        );
      const [a, b] = await Promise.all([
        hash(bearer(request)),
        hash(env.ADMIN_KEY),
      ]);
      let difference = 0;
      for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
      if (difference !== 0)
        return json({ error: "Invalid admin access key." }, 401);
    }
    let body;
    if (request.method === "POST") {
      if (!request.headers.get("Content-Type")?.includes("application/json"))
        return json({ error: "JSON required." }, 415);
      if (Number(request.headers.get("Content-Length")) > 65536)
        return json({ error: "Request too large." }, 413);
      const raw = await request.text();
      if (raw.length > 65536) return json({ error: "Request too large." }, 413);
      try {
        body = JSON.stringify(JSON.parse(raw));
      } catch {
        return json({ error: "Invalid JSON." }, 400);
      }
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `${new Date().toISOString().slice(0, 10)}:${request.headers.get("CF-Connecting-IP") || "local"}`,
      ),
    );
    const headers = new Headers(request.headers);
    headers.set(
      "X-Rate-Key",
      Array.from(new Uint8Array(digest))
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
    );
    const stub = env.GAME_SERVICE.get(
      env.GAME_SERVICE.idFromName("shapeit-v2"),
    );
    return stub.fetch(
      new Request(request.url, { method: request.method, headers, body }),
    );
  },
};
// Small transactional service for private rooms and recent activity.
export class GameService {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.storage = ctx.storage;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL)",
    );
  }
  event(input, now) {
    const profile = cleanProfile({ id: input.profileId, name: input.name });
    if (
      typeof input.id !== "string" ||
      input.id.length > 128 ||
      !["start", "finish"].includes(input.kind) ||
      !["daily", "training", "duel"].includes(input.mode) ||
      !["compact", "classic"].includes(input.size)
    )
      throw new Error("Invalid activity event.");
    const event = {
      id: input.id,
      sessionId: String(input.sessionId || "").slice(0, 80),
      profileId: profile.id,
      name: profile.name,
      kind: input.kind,
      mode: input.mode,
      size: input.size,
      receivedAt: new Date(now).toISOString(),
      occurredAt: new Date(
        Number.isFinite(Date.parse(input.at)) &&
          Date.parse(input.at) <= now + 60000 &&
          Date.parse(input.at) >= now - 30 * 86400000
          ? Date.parse(input.at)
          : now,
      ).toISOString(),
    };
    if (["won", "lost", "draw"].includes(input.result))
      event.result = input.result;
    for (const key of ["queries", "seconds", "score"])
      if (Number.isFinite(input[key]) && input[key] >= 0 && input[key] < 1e8)
        event[key] = Math.round(input[key]);
    this.sql.exec(
      "INSERT OR IGNORE INTO events (id, at, data) VALUES (?, ?, ?)",
      event.id,
      now,
      JSON.stringify(event),
    );
  }
  async fetch(request) {
    const url = new URL(request.url);
    let body = {};
    if (request.method === "POST") {
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON." }, 400);
      }
    }
    try {
      const limited = this.storage.transactionSync(() =>
        this.rateLimit(request, url),
      );
      if (limited) return limited;
      return this.storage.transactionSync(() =>
        this.handle(request, url, body),
      );
    } catch (error) {
      return json(
        { error: error.message || "The request could not be completed." },
        400,
      );
    }
  }
  rateLimit(request, url) {
    const now = Date.now();
    this.sql.exec("DELETE FROM limits WHERE window < ?", now - 60000);
    const category =
      url.pathname === "/api/rooms"
        ? "create"
        : url.pathname.endsWith("/join")
          ? "join"
          : request.method === "GET"
            ? "read"
            : "write";
    const key = `${request.headers.get("X-Rate-Key")}:${category}`;
    const limit = { create: 6, join: 20, read: 180, write: 120 }[category];
    const current = [
      ...this.sql.exec("SELECT count FROM limits WHERE key = ?", key),
    ][0];
    if (current?.count >= limit)
      return json({ error: "Too many requests. Please wait a minute." }, 429);
    this.sql.exec(
      "INSERT INTO limits (key,window,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1",
      key,
      now,
    );
    return null;
  }
  handle(request, url, body) {
    const now = Date.now();
    this.sql.exec("DELETE FROM rooms WHERE expires < ?", now);
    this.sql.exec("DELETE FROM events WHERE at < ?", now - 30 * 86400000);
    this.sql.exec("DELETE FROM limits WHERE window < ?", now - 60000);
    if (url.pathname === "/api/events" && request.method === "POST") {
      if (!["daily", "training"].includes(body.mode))
        throw new Error("Invalid solo activity.");
      this.event(body, now);
      return json({ ok: true });
    }
    if (url.pathname === "/api/admin/events" && request.method === "GET")
      return json({
        events: [
          ...this.sql.exec(
            "SELECT data FROM events ORDER BY at DESC LIMIT 500",
          ),
        ].map((row) => JSON.parse(row.data)),
      });
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      let code;
      for (let i = 0; i < 100; i++) {
        const candidate = String(
          crypto.getRandomValues(new Uint32Array(1))[0] % 10000,
        ).padStart(4, "0");
        if (
          ![
            ...this.sql.exec(
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
        return json(
          { error: "All room codes are busy. Try again later." },
          503,
        );
      const room = createRoom(
        code,
        body.profile,
        body.mobile,
        body.settings,
        now,
      );
      this.sql.exec(
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
      ...this.sql.exec("SELECT data FROM rooms WHERE code = ?", match[1]),
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
      index = 1;
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
        this.event(
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
        this.event(
          {
            id: `${room.id}:${i}:finish`,
            sessionId: room.id,
            profileId: p.id,
            name: p.name,
            kind: "finish",
            mode: "duel",
            size: room.size,
            result:
              room.winner === "draw"
                ? "draw"
                : room.winner === i
                  ? "won"
                  : "lost",
            queries: room.queries.filter((q) => q.player === i).length,
            seconds: Math.floor((now - room.startedAt) / 1000),
          },
          now,
        ),
      );
    this.sql.exec(
      "UPDATE rooms SET data = ?, expires = ? WHERE code = ?",
      JSON.stringify(room),
      room.expiresAt,
      room.code,
    );
    return json({
      room: roomView(room, index, now),
      ...(joined ? { token } : {}),
    });
  }
}
