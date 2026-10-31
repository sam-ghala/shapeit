import { findMatch, getLabel } from "./engine.js";

// An absorbed laser selects black; all other clues keep the normal color rules.
export function laserPencilColors(shot) {
  return shot.absorbed ? ["black"] : shot.colors || [];
}

// Inspect the player's drawing only: a complete shape counts even in the wrong place.
export function nextPencilColor(
  colors,
  pieces,
  guess,
  edges,
  current,
  random = Math.random,
) {
  if (!colors.length || colors.includes(current)) return current;
  const unfinished = colors.filter((color) =>
    pieces.some(
      (piece) => piece.color === color && !findMatch(guess, edges, piece),
    ),
  );
  const choices = unfinished.length ? unfinished : colors;
  return choices[
    Math.min(choices.length - 1, Math.floor(random() * choices.length))
  ];
}

export function trainingHint(placed, step, cols, rows) {
  if (!step || !placed.length) return null;
  const index = Math.min(placed.length - 1, Math.floor((step - 1) / 3));
  const level = ((step - 1) % 3) + 1;
  const piece = placed[index];
  const r = Math.min(...piece.absCells.map((c) => c[0]));
  const c = Math.min(...piece.absCells.map((c) => c[1]));
  const label = `${piece.color} ${piece.name}`;
  return {
    level,
    piece,
    text:
      level === 1
        ? `${label}: look in the ${r < rows / 2 ? "upper" : "lower"} ${c < cols / 2 ? "left" : "right"} area.`
        : level === 2
          ? `${label}: its top-left corner is at ${getLabel("left", r, cols, rows)}${c + 1}.`
          : `${label}: outline shown on the board.`,
  };
}
