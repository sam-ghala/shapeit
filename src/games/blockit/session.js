import { createGame, drawStarter, play, restoreGame } from "./engine.js";
export function createSession(
  id = crypto.randomUUID(),
  now = Date.now(),
  starter = drawStarter(),
) {
  return {
    version: 1,
    id,
    startedAt: now,
    endedAt: null,
    game: createGame(starter),
    history: [],
  };
}
export function playSession(session, action, now = Date.now()) {
  const game = play(session.game, action);
  return {
    ...session,
    game,
    endedAt: game.winner ? now : null,
    history: [...session.history, session.game].slice(-50),
  };
}
export function undoSession(session) {
  if (session.game.winner || !session.history.length) return session;
  return {
    ...session,
    game: session.history.at(-1),
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
  const game = restoreGame(value.game),
    history = value.history.map(restoreGame);
  if (
    !game ||
    history.some((item) => !item || item.winner) ||
    (game.winner &&
      (!Number.isFinite(value.endedAt) || value.endedAt < value.startedAt))
  )
    return null;
  return {
    version: 1,
    id: value.id,
    startedAt: value.startedAt,
    endedAt: game.winner ? value.endedAt : null,
    game,
    history,
  };
}
