import { cleanProfile } from "../../shared/server/profile.js";
import { gameInfo } from "../../games/catalog.js";
export function recordEvent(sql, input, now) {
  const profile = cleanProfile({ id: input.profileId, name: input.name });
  const game = gameInfo(input.game || "shapeit");
  if (
    !game ||
    typeof input.id !== "string" ||
    !input.id ||
    input.id.length > 128 ||
    !["start", "finish", "visit"].includes(input.kind) ||
    !game.modes.includes(input.mode) ||
    !game.sizes.includes(input.size) ||
    (input.kind === "visit" && game.status !== "coming-soon")
  )
    throw new Error("Invalid activity event.");
  const event = {
    id: input.id,
    game: game.id,
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
  if (["won", "lost", "draw", "completed"].includes(input.result))
    event.result = input.result;
  if (game.id === "pushit" && ["black", "white"].includes(input.winnerColor))
    event.winnerColor = input.winnerColor;
  for (const key of [
    "queries",
    "seconds",
    "score",
    "turns",
    "round",
    "bestOf",
    "blackWins",
    "whiteWins",
  ])
    if (Number.isFinite(input[key]) && input[key] >= 0 && input[key] < 1e8)
      event[key] = Math.round(input[key]);
  sql.exec(
    "INSERT OR IGNORE INTO events (id, at, data) VALUES (?, ?, ?)",
    event.id,
    now,
    JSON.stringify(event),
  );
}
export function activityView(sql, params) {
  const player = params.get("player"),
    game = params.get("game");
  if (game && !gameInfo(game)) throw new Error("Unknown game.");
  const gameFilter = game
    ? "WHERE COALESCE(json_extract(data, '$.game'), 'shapeit') = ?"
    : "";
  const args = game ? [game] : [];
  const where = [
    game ? "COALESCE(json_extract(data, '$.game'), 'shapeit') = ?" : "",
    player ? "json_extract(data, '$.profileId') = ?" : "",
  ].filter(Boolean);
  return {
    players: [
      ...sql.exec(
        `
      WITH activity AS (
        SELECT data, json_extract(data, '$.profileId') AS profileId, json_extract(data, '$.occurredAt') AS playedAt,
          row_number() OVER (PARTITION BY json_extract(data, '$.profileId') ORDER BY json_extract(data, '$.occurredAt') DESC, at DESC, id DESC) AS position
        FROM events ${gameFilter}
      )
      SELECT profileId, MAX(CASE WHEN position = 1 THEN json_extract(data, '$.name') END) AS name,
        MAX(playedAt) AS lastPlayed,
        COUNT(DISTINCT CASE WHEN json_extract(data, '$.kind') != 'visit' THEN COALESCE(json_extract(data, '$.game'), 'shapeit') || ':' || COALESCE(NULLIF(json_extract(data, '$.sessionId'), ''), json_extract(data, '$.id')) END) AS games,
        SUM(CASE WHEN json_extract(data, '$.kind') = 'finish' THEN 1 ELSE 0 END) AS finishes
      FROM activity GROUP BY profileId ORDER BY lastPlayed DESC, profileId
    `,
        ...args,
      ),
    ],
    events: [
      ...sql.exec(
        `SELECT data FROM events ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC LIMIT 500`,
        ...args,
        ...(player ? [player] : []),
      ),
    ].map((row) => ({ game: "shapeit", ...JSON.parse(row.data) })),
  };
}
