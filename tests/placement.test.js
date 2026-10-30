import test from "node:test";
import assert from "node:assert/strict";
import { previewPlacement } from "../src/games/shapeit/game/placement.js";
import {
  buildPieces,
  rotateCells,
  validatePlacements,
} from "../src/games/shapeit/game/engine.js";
test("placement preview uses the selected orientation and rejects overlaps and off-board drops", () => {
  const pieces = buildPieces("placement", "compact");
  const piece = pieces[0],
    cells = rotateCells(piece.cells, 1);
  const preview = previewPlacement(piece, cells, 1, 1, [], 7, 5);
  assert.equal(preview.error, null);
  assert.deepEqual(
    validatePlacements(preview.placed, pieces, 7, 5, true),
    preview.placed,
  );
  const moved = previewPlacement(piece, cells, 0, 0, preview.placed, 7, 5);
  assert.equal(moved.placed.length, 1);
  assert.ok(previewPlacement(piece, cells, 4, 6, [], 7, 5).error);
  const overlap = previewPlacement(
    pieces[1],
    pieces[1].cells,
    1,
    1,
    preview.placed,
    7,
    5,
  );
  assert.ok(overlap.error);
});
