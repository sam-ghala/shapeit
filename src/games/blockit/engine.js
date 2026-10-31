export const SIZE = 9;
export const COLORS = ["white", "black"];
export const opposite = (color) => (color === "white" ? "black" : "white");
export const colorName = (color) => (color === "white" ? "White" : "Black");
export const goalRow = (color) => (color === "white" ? 0 : 8);
export const cellName = (cell) =>
  `${"ABCDEFGHI"[cell % 9]}${9 - Math.floor(cell / 9)}`;
const validCell = (cell) => Number.isInteger(cell) && cell >= 0 && cell < 81;
const directions = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const neighbor = (cell, dr, dc) => {
  const r = Math.floor(cell / 9) + dr,
    c = (cell % 9) + dc;
  return r >= 0 && r < 9 && c >= 0 && c < 9 ? r * 9 + c : null;
};
const edge = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export function createGame(starter = "white") {
  if (!COLORS.includes(starter)) throw new Error("Choose a starting player.");
  return {
    version: 1,
    starter,
    current: starter,
    pawns: { white: 76, black: 4 },
    walls: [],
    remaining: { white: 10, black: 10 },
    turn: 1,
    winner: null,
    reason: null,
    lastAction: null,
  };
}
export function drawStarter() {
  return COLORS[crypto.getRandomValues(new Uint8Array(1))[0] % 2];
}
function blockedEdges(walls) {
  const blocked = new Set();
  for (const { row, col, orientation } of walls) {
    const a = row * 9 + col;
    if (orientation === "h") {
      blocked.add(edge(a, a + 9));
      blocked.add(edge(a + 1, a + 10));
    } else {
      blocked.add(edge(a, a + 1));
      blocked.add(edge(a + 9, a + 10));
    }
  }
  return blocked;
}
export function legalMoves(game, color = game.current) {
  if (game.winner || !COLORS.includes(color)) return [];
  const from = game.pawns[color],
    enemy = game.pawns[opposite(color)];
  const blocked = blockedEdges(game.walls),
    moves = new Set();
  for (const [dr, dc] of directions) {
    const next = neighbor(from, dr, dc);
    if (next === null || blocked.has(edge(from, next))) continue;
    if (next !== enemy) {
      moves.add(next);
      continue;
    }
    const behind = neighbor(enemy, dr, dc);
    if (behind !== null && !blocked.has(edge(enemy, behind))) {
      moves.add(behind);
    } else {
      // Side steps are only allowed when the straight jump is blocked.
      for (const sign of [-1, 1]) {
        const side = neighbor(enemy, dc * sign, dr * sign);
        if (side !== null && !blocked.has(edge(enemy, side))) moves.add(side);
      }
    }
  }
  return [...moves];
}
export function hasPath(game, color) {
  const blocked = blockedEdges(game.walls);
  const queue = [game.pawns[color]],
    seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (Math.floor(cell / 9) === goalRow(color)) return true;
    for (const [dr, dc] of directions) {
      const next = neighbor(cell, dr, dc);
      if (next !== null && !seen.has(next) && !blocked.has(edge(cell, next))) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}
function validWall(wall) {
  return (
    wall &&
    Number.isInteger(wall.row) &&
    wall.row >= 0 &&
    wall.row < 8 &&
    Number.isInteger(wall.col) &&
    wall.col >= 0 &&
    wall.col < 8 &&
    ["h", "v"].includes(wall.orientation)
  );
}
function overlaps(a, b) {
  if (a.orientation !== b.orientation)
    return a.row === b.row && a.col === b.col;
  return a.orientation === "h"
    ? a.row === b.row && Math.abs(a.col - b.col) < 2
    : a.col === b.col && Math.abs(a.row - b.row) < 2;
}
export function wallError(game, wall) {
  if (game.winner) return "This game is over.";
  if (!validWall(wall)) return "Choose a wall slot on the board.";
  if (!game.remaining[game.current])
    return "You have no walls left. Move your pawn.";
  if (game.walls.some((other) => overlaps(wall, other)))
    return "Walls cannot overlap or cross.";
  const next = { ...game, walls: [...game.walls, wall] };
  if (COLORS.some((color) => !hasPath(next, color)))
    return "Both players must have a path to their goal.";
  return "";
}
export function play(game, action) {
  if (game.winner) throw new Error("This game is over.");
  const color = game.current;
  let next = { ...game, turn: game.turn + 1, current: opposite(color) };
  if (action?.type === "move") {
    if (!legalMoves(game).includes(action.to))
      throw new Error("Choose a highlighted square.");
    next.pawns = { ...game.pawns, [color]: action.to };
    next.lastAction = {
      type: "move",
      color,
      from: game.pawns[color],
      to: action.to,
      turn: game.turn,
    };
    if (Math.floor(action.to / 9) === goalRow(color)) {
      next.winner = color;
      next.reason = "goal";
    }
  } else if (action?.type === "wall") {
    const problem = wallError(game, action);
    if (problem) throw new Error(problem);
    const wall = {
      row: action.row,
      col: action.col,
      orientation: action.orientation,
      color,
    };
    next.walls = [...game.walls, wall];
    next.remaining = { ...game.remaining, [color]: game.remaining[color] - 1 };
    next.lastAction = { type: "wall", ...wall, turn: game.turn };
  } else if (action?.type === "resign") {
    next.winner = opposite(color);
    next.reason = "resignation";
    next.lastAction = { type: "resign", color, turn: game.turn };
  } else throw new Error("Choose a pawn move or a wall.");
  return next;
}
export function describeAction(action) {
  if (!action) return "Move your pawn or place a wall.";
  const name = colorName(action.color);
  if (action.type === "move")
    return `${name}: ${cellName(action.from)} → ${cellName(action.to)}.`;
  if (action.type === "wall")
    return `${name} placed a ${action.orientation === "h" ? "horizontal" : "vertical"} wall at ${cellName(action.row * 9 + action.col)}.`;
  return `${name} resigned.`;
}
export function restoreGame(value) {
  if (
    !value ||
    value.version !== 1 ||
    !COLORS.includes(value.current) ||
    !COLORS.includes(value.starter) ||
    !Number.isSafeInteger(value.turn) ||
    value.turn < 1 ||
    !COLORS.every((color) => validCell(value.pawns?.[color])) ||
    value.pawns.white === value.pawns.black ||
    !Array.isArray(value.walls) ||
    value.walls.length > 20
  )
    return null;
  const walls = [];
  for (const wall of value.walls) {
    if (
      !validWall(wall) ||
      !COLORS.includes(wall.color) ||
      walls.some((other) => overlaps(wall, other))
    )
      return null;
    walls.push({
      row: wall.row,
      col: wall.col,
      orientation: wall.orientation,
      color: wall.color,
    });
  }
  const game = {
    ...createGame(value.starter),
    current: value.current,
    turn: value.turn,
    pawns: { white: value.pawns.white, black: value.pawns.black },
    walls,
    remaining: { white: value.remaining?.white, black: value.remaining?.black },
  };
  if (
    COLORS.some(
      (color) =>
        !Number.isInteger(game.remaining[color]) ||
        game.remaining[color] < 0 ||
        game.remaining[color] +
          walls.filter((wall) => wall.color === color).length !==
          10 ||
        !hasPath(game, color),
    )
  )
    return null;
  if (value.winner !== null) {
    if (
      !COLORS.includes(value.winner) ||
      !["goal", "resignation"].includes(value.reason)
    )
      return null;
    if (
      value.reason === "goal" &&
      Math.floor(game.pawns[value.winner] / 9) !== goalRow(value.winner)
    )
      return null;
    game.winner = value.winner;
    game.reason = value.reason;
  } else if (
    value.reason !== null ||
    COLORS.some((color) => Math.floor(game.pawns[color] / 9) === goalRow(color))
  )
    return null;
  const action = value.lastAction;
  if (action !== null) {
    if (
      !action ||
      !COLORS.includes(action.color) ||
      action.turn !== game.turn - 1
    )
      return null;
    if (action.type === "move") {
      if (
        !validCell(action.from) ||
        !validCell(action.to) ||
        action.from === action.to ||
        action.to !== game.pawns[action.color]
      )
        return null;
      game.lastAction = {
        type: "move",
        color: action.color,
        from: action.from,
        to: action.to,
        turn: action.turn,
      };
    } else if (action.type === "wall") {
      if (
        !validWall(action) ||
        !walls.some(
          (wall) =>
            wall.row === action.row &&
            wall.col === action.col &&
            wall.orientation === action.orientation &&
            wall.color === action.color,
        )
      )
        return null;
      game.lastAction = {
        type: "wall",
        row: action.row,
        col: action.col,
        orientation: action.orientation,
        color: action.color,
        turn: action.turn,
      };
    } else if (
      action.type === "resign" &&
      game.reason === "resignation" &&
      opposite(action.color) === game.winner
    )
      game.lastAction = {
        type: "resign",
        color: action.color,
        turn: action.turn,
      };
    else return null;
  } else if (game.turn !== 1 || game.winner) return null;
  return game;
}
