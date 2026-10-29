import { rotateCells, placementError } from "./engine.js";

export function previewPlacement(piece, cells, row, col, placed, cols, rows) {
  const candidate = {
    ...piece,
    absCells: rotateCells(cells, 0).map(([r, c, t]) => [row + r, col + c, t]),
  };
  const next = [...placed.filter((p) => p.id !== piece.id), candidate];
  return {
    piece: candidate,
    placed: next,
    error: placementError(next, cols, rows),
  };
}
