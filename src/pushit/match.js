import { act, createGame, opposite, validGame } from "./engine.js";

export const randomColor = () =>
  crypto.getRandomValues(new Uint32Array(1))[0] % 2 ? "white" : "black";
export function matchFormat(value = 0) {
  if (
    value === 0 ||
    (Number.isInteger(value) && value >= 3 && value <= 99 && value % 2 === 1)
  )
    return value;
  throw new Error("Choose free play or an odd best-of length from 3 to 99.");
}
export function newMatch(bestOf = 0, starter = randomColor()) {
  return {
    matchId: crypto.randomUUID(),
    gameId: crypto.randomUUID(),
    bestOf: matchFormat(bestOf),
    starter,
    round: 1,
    game: createGame(starter),
    phase: "playing",
    wins: { black: 0, white: 0 },
    matchWinner: null,
    undoStack: [],
  };
}
export function playMatch(match, action, actor) {
  if (match.phase !== "playing") throw new Error("This round has ended.");
  const next = act(match.game, action);
  const before = {
    game: match.game,
    wins: { ...match.wins },
    phase: match.phase,
    matchWinner: match.matchWinner,
    actor,
  };
  match.undoStack = [...(match.undoStack || []), before].slice(-24);
  match.game = next;
  if (next.winner) {
    match.wins = { ...match.wins, [next.winner]: match.wins[next.winner] + 1 };
    match.matchWinner =
      match.bestOf && match.wins[next.winner] >= (match.bestOf + 1) / 2
        ? next.winner
        : null;
    match.phase = match.matchWinner ? "complete" : "finished";
  }
}
export function undoMatch(match) {
  const previous = match.undoStack?.at(-1);
  if (!previous) throw new Error("There is no move to undo.");
  Object.assign(match, {
    game: previous.game,
    wins: previous.wins,
    phase: previous.phase,
    matchWinner: previous.matchWinner,
  });
  match.undoStack = match.undoStack.slice(0, -1);
}
export function nextRound(match) {
  if (match.phase !== "finished") throw new Error("Finish this round first.");
  match.starter = opposite(match.starter);
  match.game = createGame(match.starter);
  match.gameId = crypto.randomUUID();
  match.round++;
  match.phase = "playing";
  match.matchWinner = null;
  match.undoStack = [];
}
export function resetRound(match) {
  if (match.phase !== "playing") throw new Error("This round has ended.");
  match.game = createGame(match.starter);
  match.gameId = crypto.randomUUID();
  match.undoStack = [];
}
export function restoreLocalMatch(saved, legacy) {
  if (
    saved &&
    validGame(saved.game) &&
    ["playing", "finished", "complete"].includes(saved.phase) &&
    ["black", "white"].includes(saved.starter) &&
    typeof saved.gameId === "string" &&
    Number.isInteger(saved.round) &&
    saved.round > 0 &&
    Number.isInteger(saved.wins?.black) &&
    saved.wins.black >= 0 &&
    Number.isInteger(saved.wins?.white) &&
    saved.wins.white >= 0 &&
    (saved.bestOf === 0 ||
      (Number.isInteger(saved.bestOf) &&
        saved.bestOf >= 3 &&
        saved.bestOf <= 99 &&
        saved.bestOf % 2 === 1))
  ) {
    return {
      ...saved,
      undoStack: (Array.isArray(saved.undoStack) ? saved.undoStack : [])
        .filter(
          (s) =>
            s &&
            validGame(s.game) &&
            s.wins &&
            ["playing", "finished", "complete"].includes(s.phase),
        )
        .slice(-24),
    };
  }
  if (validGame(legacy)) {
    const value = newMatch();
    value.game = legacy;
    value.starter = legacy.log[0]?.color || legacy.current;
    if (legacy.winner) {
      value.wins[legacy.winner] = 1;
      value.phase = "finished";
    }
    return value;
  }
  return null;
}
