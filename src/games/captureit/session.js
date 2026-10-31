import { createGame, play, restoreGame } from "./engine.js";

export function createSession(id = crypto.randomUUID(), now = Date.now()) {
  return {
    version: 1,
    id,
    startedAt: now,
    endedAt: null,
    game: createGame(),
    history: [],
    notice: "White starts. Select a white piece.",
  };
}

export function playSession(session, action, now = Date.now()) {
  const game = play(session.game, action);
  if (game === session.game) return session;
  const color = session.game.current;
  const name = color === "white" ? "White" : "Black";
  const captures = session.game.pieces.length - game.pieces.length;
  const collected = game.collected[color] - session.game.collected[color];
  const removed = session.game.tiles.length - game.tiles.length;
  const messages = [
    action.type === "resign"
      ? `${name} resigned.`
      : action.type === "exchange"
        ? `${name} exchanged two tiles.`
        : `${name} moved.`,
  ];
  if (captures)
    messages.push(
      `Captured ${captures} ${captures === 1 ? "piece" : "pieces"}.`,
    );
  if (collected > 0)
    messages.push(
      `Collected ${collected} ${collected === 1 ? "tile" : "tiles"}.`,
    );
  const discarded = removed - Math.max(0, collected);
  if (discarded)
    messages.push(
      `${discarded} empty ${discarded === 1 ? "tile" : "tiles"} removed.`,
    );
  return {
    ...session,
    game,
    endedAt: game.winner ? now : null,
    history: [
      ...session.history,
      { game: session.game, notice: session.notice },
    ].slice(-50),
    notice: messages.join(" "),
  };
}

export function undoSession(session) {
  if (session.game.winner || !session.history.length) return session;
  const previous = session.history.at(-1);
  return {
    ...session,
    game: previous.game,
    notice: "Last turn undone.",
    history: session.history.slice(0, -1),
    endedAt: null,
  };
}

export function restoreSession(value) {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id) ||
    !Number.isFinite(value.startedAt) ||
    value.startedAt < 0 ||
    !Array.isArray(value.history) ||
    value.history.length > 50
  )
    return null;
  const game = restoreGame(value.game);
  if (
    !game ||
    (game.winner &&
      (!Number.isFinite(value.endedAt) || value.endedAt < value.startedAt))
  )
    return null;
  const history = value.history.map((item) => ({
    game: restoreGame(item?.game),
    notice: typeof item?.notice === "string" ? item.notice.slice(0, 300) : "",
  }));
  if (history.some((item) => !item.game || item.game.winner)) return null;
  return {
    version: 1,
    id: value.id,
    startedAt: value.startedAt,
    endedAt: game.winner ? value.endedAt : null,
    game,
    history,
    notice:
      typeof value.notice === "string"
        ? value.notice.slice(0, 300)
        : "Select a piece to continue.",
  };
}
