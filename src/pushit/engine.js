// DUAT, English 2026 rulebook: https://unphazedgames.com/s/Duat-Rulebook-2026-Web.pdf
// Directions run clockwise from north. The sun/front faces in this direction.
export const RULEBOOK =
  "https://unphazedgames.com/s/Duat-Rulebook-2026-Web.pdf";
export const DIRECTIONS = ["north", "east", "south", "west"];
const STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const opposite = (color) => (color === "black" ? "white" : "black");
export const coordinate = (x, y) => `${"ABCD"[x]}${4 - y}`;
const inside = (x, y) => x >= 0 && x < 4 && y >= 0 && y < 4;

export function createGame(starter = "black") {
  if (!["black", "white"].includes(starter))
    throw new Error("Choose a starting side.");
  return {
    version: 1,
    pieces: [
      { id: "b1", color: "black", x: 0, y: 0, facing: 2 },
      { id: "b2", color: "black", x: 1, y: 1, facing: 2 },
      { id: "b3", color: "black", x: 3, y: 0, facing: 2 },
      { id: "w1", color: "white", x: 0, y: 3, facing: 0 },
      { id: "w2", color: "white", x: 2, y: 2, facing: 0 },
      { id: "w3", color: "white", x: 3, y: 3, facing: 0 },
    ],
    current: starter,
    turn: 1,
    used: 0,
    winner: null,
    log: [],
  };
}

export function validGame(game) {
  return (
    !!game &&
    game.version === 1 &&
    ["black", "white"].includes(game.current) &&
    [null, "black", "white"].includes(game.winner) &&
    Number.isInteger(game.turn) &&
    game.turn > 0 &&
    Number.isInteger(game.used) &&
    game.used >= 0 &&
    game.used <= 3 &&
    Array.isArray(game.log) &&
    game.log.length <= 90 &&
    game.log.every(
      (entry) =>
        entry &&
        ["black", "white"].includes(entry.color) &&
        ["left", "right", "forward"].includes(entry.type) &&
        typeof entry.from === "string" &&
        Number.isInteger(entry.turn),
    ) &&
    Array.isArray(game.pieces) &&
    game.pieces.length > 0 &&
    game.pieces.length <= 6 &&
    game.pieces.every((p) => p && typeof p === "object") &&
    new Set(game.pieces.map((p) => p.id)).size === game.pieces.length &&
    new Set(game.pieces.map((p) => `${p.x},${p.y}`)).size ===
      game.pieces.length &&
    game.pieces.every(
      (p) =>
        /^[bw][123]$/.test(p.id) &&
        p.color === (p.id[0] === "b" ? "black" : "white") &&
        Number.isInteger(p.x) &&
        Number.isInteger(p.y) &&
        inside(p.x, p.y) &&
        Number.isInteger(p.facing) &&
        p.facing >= 0 &&
        p.facing < 4,
    )
  );
}

// Inspect the whole contiguous chain, including friendly pieces, before moving any piece.
export function forwardMove(game, pieceId) {
  const piece = game.pieces.find((p) => p.id === pieceId);
  if (!piece || piece.color !== game.current || game.winner)
    return { legal: false, reason: "Select one of your pieces." };
  const [dx, dy] = STEPS[piece.facing];
  let x = piece.x + dx,
    y = piece.y + dy;
  if (!inside(x, y))
    return {
      legal: false,
      reason: "A piece cannot move itself off the board.",
    };
  const pushed = [];
  while (inside(x, y)) {
    const next = game.pieces.find((p) => p.x === x && p.y === y);
    if (!next) break;
    if (next.facing === (piece.facing + 2) % 4)
      return {
        legal: false,
        reason: `Blocked: the ${next.color} piece at ${coordinate(x, y)} faces you.`,
      };
    pushed.push(next.id);
    x += dx;
    y += dy;
  }
  const last = game.pieces.find((p) => p.id === pushed.at(-1));
  return {
    legal: true,
    dx,
    dy,
    pushed,
    destination: [piece.x + dx, piece.y + dy],
    removed: !inside(x, y) && last ? last.id : null,
  };
}

export function act(game, action) {
  if (game.winner) throw new Error("This game is finished.");
  if (action?.type === "end") {
    if (game.used !== 1)
      throw new Error(
        "Take exactly one or three actions. You cannot stop after two.",
      );
    return {
      ...game,
      current: opposite(game.current),
      used: 0,
      turn: game.turn + 1,
    };
  }
  if (!["left", "right", "forward"].includes(action?.type))
    throw new Error("Unknown action.");
  const piece = game.pieces.find((p) => p.id === action.pieceId);
  if (!piece || piece.color !== game.current)
    throw new Error("Select one of your own pieces.");
  const next = {
    ...game,
    pieces: game.pieces.map((p) => ({ ...p })),
    log: [...game.log],
  };
  const moving = next.pieces.find((p) => p.id === piece.id);
  const entry = {
    turn: game.turn,
    color: game.current,
    type: action.type,
    pieceId: piece.id,
    from: coordinate(piece.x, piece.y),
  };
  if (action.type === "forward") {
    const move = forwardMove(game, piece.id);
    if (!move.legal) throw new Error(move.reason);
    for (const p of next.pieces)
      if (p.id === piece.id || move.pushed.includes(p.id)) {
        p.x += move.dx;
        p.y += move.dy;
      }
    entry.to = coordinate(moving.x, moving.y);
    entry.pushed = move.pushed.length;
    if (move.removed) {
      const removed = next.pieces.find((p) => p.id === move.removed);
      // The rulebook awards a win only for pushing an opponent's piece off.
      // Friendly pieces may be pushed too; sacrificing one does not win the game.
      if (removed.color !== game.current) next.winner = game.current;
      entry.removed = removed.color;
      next.pieces = next.pieces.filter((p) => p.id !== removed.id);
    }
  } else
    moving.facing = (moving.facing + (action.type === "right" ? 1 : 3)) % 4;
  next.log.push(entry);
  next.log = next.log.slice(-90);
  next.used++;
  if (next.used === 3 && !next.winner) {
    next.current = opposite(game.current);
    next.used = 0;
    next.turn++;
  }
  return next;
}

export function describeAction(entry) {
  if (!entry) return "Select one of your pieces to begin.";
  if (entry.type === "left" || entry.type === "right")
    return `${entry.from} rotated ${entry.type === "left" ? "↶" : "↷"} 90°`;
  return `${entry.from} → ${entry.to}${entry.pushed ? ` · pushed ${entry.pushed}` : ""}${entry.removed ? ` · ${entry.removed} off the board` : ""}`;
}
