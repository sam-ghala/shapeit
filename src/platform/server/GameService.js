import { json } from "./http.js";
import { recordEvent, activityView, deletePlayerEvents } from "./activity.js";
import {
  handleShapeIt,
  expireShapeItRooms,
} from "../../games/shapeit/server/api.js";
import {
  handlePushIt,
  expirePushItRooms,
} from "../../games/pushit/server/api.js";
import {
  handleCaptureIt,
  expireCaptureItRooms,
} from "../../games/captureit/server/api.js";
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
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS pushit_rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS captureit_rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)",
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
        this.rateLimit(request, url, body),
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
  rateLimit(request, url, body) {
    const now = Date.now();
    this.sql.exec("DELETE FROM limits WHERE window < ?", now - 60000);
    const category = [
      "/api/rooms",
      "/api/pushit/rooms",
      "/api/captureit/rooms",
    ].includes(url.pathname)
      ? "create"
      : url.pathname.endsWith("/join")
        ? "join"
        : url.pathname.endsWith("/action") && body.type === "draft"
          ? "draft"
          : request.method === "GET"
            ? "read"
            : "write";
    const key = `${request.headers.get("X-Rate-Key")}:${category}`;
    const limit = { create: 6, join: 30, read: 600, write: 480, draft: 400 }[
      category
    ];
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
  event(input, now) {
    recordEvent(this.sql, input, now);
  }
  handle(request, url, body) {
    const now = Date.now();
    expireShapeItRooms(this, now);
    expirePushItRooms(this, now);
    expireCaptureItRooms(this, now);
    this.sql.exec("DELETE FROM events WHERE at < ?", now - 30 * 86400000);
    if (url.pathname === "/api/events" && request.method === "POST") {
      const game = body.game || "shapeit";
      if (
        !(game === "shapeit" && ["daily", "training"].includes(body.mode)) &&
        !(game === "pushit" && body.mode === "local") &&
        !(game === "captureit" && body.mode === "local") &&
        !(
          game === "chessit" &&
          body.mode === "preview" &&
          body.kind === "visit"
        )
      )
        throw new Error("Invalid local activity.");
      this.event(body, now);
      return json({ ok: true });
    }
    if (
      url.pathname === "/api/admin/events/delete-player" &&
      request.method === "POST"
    )
      return json(deletePlayerEvents(this.sql, body.profileId));
    if (url.pathname === "/api/admin/events" && request.method === "GET")
      return json(activityView(this.sql, url.searchParams));
    if (url.pathname.startsWith("/api/pushit/"))
      return handlePushIt(this, request, url, body, now);
    if (url.pathname.startsWith("/api/captureit/"))
      return handleCaptureIt(this, request, url, body, now);
    return handleShapeIt(this, request, url, body, now);
  }
}
