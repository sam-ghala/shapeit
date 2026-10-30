import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  SHAPES,
  COMPACT_SHAPES,
  SIZES,
  emptyBoard,
  fireLaser,
  shapeKey,
  buildPieces,
  generatePuzzle,
  solutionDrawing,
  checkSolution,
  placementError,
  validatePlacements,
  dailySeed,
  dailyDate,
  calcScore,
  rotateCells,
  mirrorCells,
} from "../src/games/shapeit/game/engine.js";

test("compact shapes have distinct rotation/reflection classes", () => {
  assert.equal(
    new Set(COMPACT_SHAPES.map((p) => shapeKey(p.cells))).size,
    COMPACT_SHAPES.length,
  );
  for (const shape of SHAPES) {
    assert.equal(
      shapeKey(shape.cells),
      shapeKey(mirrorCells(rotateCells(shape.cells, 3))),
    );
  }
});
test("daily identity uses UTC, board size and engine version", () => {
  assert.equal(dailyDate(new Date("2026-10-29T01:00:00+02:00")), "2026-10-28");
  assert.equal(
    dailySeed("compact", new Date("2026-10-28T23:00:00Z")),
    "v2:2026-10-28:compact",
  );
  assert.notEqual(dailySeed("classic"), dailySeed("compact"));
});
test("flat faces reflect on their boundary, diagonals at their surface", () => {
  const board = emptyBoard(4, 3);
  board[1][1] = { color: "red", type: "/f", pieceId: "a" };
  assert.deepEqual(fireLaser(board, "top", 1).points, [
    [1.5, 0],
    [1.5, 1],
    [1.5, 0],
  ]);
  board[1][1] = { color: "red", type: "/b", pieceId: "a" };
  const diagonal = fireLaser(board, "top", 1);
  assert.deepEqual(diagonal.points, [
    [1.5, 0],
    [1.5, 1.5],
    [0, 1.5],
  ]);
  assert.equal(diagonal.exitSide, "left");
  assert.equal(diagonal.exitIdx, 1);
});
test("transparent and black pieces report their special optical behavior", () => {
  const b = emptyBoard(4, 3);
  b[1][1] = { color: "transparent", type: "/b", pieceId: "t" };
  const t = fireLaser(b, "top", 1);
  assert.deepEqual(t.colors, []);
  assert.deepEqual(t.hits, ["t"]);
  assert.equal(t.exitSide, "left");
  b[1][1] = { color: "black", type: "/f", pieceId: "b" };
  const k = fireLaser(b, "top", 1);
  assert.equal(k.absorbed, true);
  assert.equal(k.exitSide, null);
  assert.deepEqual(k.colors, []);
  assert.deepEqual(k.points, [
    [1.5, 0],
    [1.5, 1],
  ]);
});
test("exact validation rejects extra strokes, missing strokes and empty puzzles, but permits empty-cell notes", () => {
  const p = generatePuzzle(
    "exact-check",
    buildPieces("exact-check", "compact", true),
    7,
    5,
  );
  const d = solutionDrawing(p.placed, 7, 5);
  assert.ok(checkSolution(d.guess, d.edges, p.placed, 7, 5));
  const empty = p.board
    .flatMap((row, r) => row.map((cell, c) => ({ cell, r, c })))
    .find((x) => !x.cell);
  d.guess[empty.r][empty.c] = { color: "x", type: "x" };
  assert.ok(checkSolution(d.guess, d.edges, p.placed, 7, 5));
  d.guess[empty.r][empty.c] = { color: "red", type: "/" };
  assert.equal(checkSolution(d.guess, d.edges, p.placed, 7, 5), false);
  d.guess[empty.r][empty.c] = null;
  d.edges["h-99-99"] = "red";
  assert.equal(checkSolution(d.guess, d.edges, p.placed, 7, 5), false);
  delete d.edges["h-99-99"];
  delete d.edges[Object.keys(d.edges)[0]];
  assert.equal(checkSolution(d.guess, d.edges, p.placed, 7, 5), false);
  assert.equal(checkSolution(emptyBoard(7, 5), {}, [], 7, 5), false);
});
test("placement validation rejects forged pieces and shared edges", () => {
  assert.match(
    placementError(
      [
        { id: "a", color: "red", absCells: [[0, 0, "/f"]] },
        { id: "b", color: "blue", absCells: [[0, 1, "/f"]] },
      ],
      4,
      4,
    ),
    /edge/,
  );
  assert.equal(
    placementError(
      [
        { id: "a", color: "red", absCells: [[0, 0, "/f"]] },
        { id: "b", color: "blue", absCells: [[1, 1, "/f"]] },
      ],
      4,
      4,
    ),
    null,
  );
  const pieces = buildPieces("valid", "compact");
  const p = generatePuzzle("valid", pieces, 7, 5);
  assert.deepEqual(
    validatePlacements(p.placed, pieces, 7, 5),
    p.placed.toSorted(
      (a, b) =>
        pieces.findIndex((p) => p.id === a.id) -
        pieces.findIndex((p) => p.id === b.id),
    ),
  );
  const forged = structuredClone(p.placed);
  forged[0].absCells[0][2] = "wrong";
  assert.throws(() => validatePlacements(forged, pieces, 7, 5));
});
test("generated puzzles are legal and reversible for both sizes, including extras", () => {
  for (const size of Object.keys(SIZES))
    for (const extras of [false, true])
      for (let i = 0; i < 100; i++) {
        const { cols, rows } = SIZES[size],
          seed = `regression:${i}`,
          pieces = buildPieces(seed, size, extras),
          p = generatePuzzle(seed, pieces, cols, rows);
        assert.equal(placementError(p.placed, cols, rows), null);
        assert.deepEqual(p, generatePuzzle(seed, pieces, cols, rows));
        for (const side of ["top", "bottom", "left", "right"])
          for (
            let idx = 0;
            idx < (["top", "bottom"].includes(side) ? cols : rows);
            idx++
          ) {
            const shot = fireLaser(p.board, side, idx);
            assert.equal(shot.loop, false);
            if (!shot.absorbed) {
              const reverse = fireLaser(p.board, shot.exitSide, shot.exitIdx);
              assert.equal(reverse.exitSide, side);
              assert.equal(reverse.exitIdx, idx);
              assert.deepEqual(reverse.colors, shot.colors);
            }
          }
      }
});
test("scoring examples and time penalties stay stable", () => {
  assert.equal(calcScore(120, 5), 5000);
  assert.equal(calcScore(120, 10), 4000);
  assert.ok(calcScore(120, 11) < 4000);
  assert.ok(calcScore(180, 5) < 5000);
});
test("published daily generation fingerprint stays stable", () => {
  const seed = "v2:2026-10-28:compact",
    p = generatePuzzle(seed, buildPieces(seed, "compact"), 7, 5);
  const hash = createHash("sha256").update(JSON.stringify(p)).digest("hex");
  assert.equal(
    hash,
    "ec8da79567a3b5b9b80308e7d2644c7cfe18b4a9585604ec81d638392519b561",
  );
});

test("extra pieces can be enabled independently without changing the normal piece selection", () => {
  const base = buildPieces("extras-independent", "compact", false);
  for (const extras of [
    { diamond: true },
    { black: true },
    { diamond: true, black: true },
  ]) {
    const pieces = buildPieces("extras-independent", "compact", extras);
    assert.deepEqual(pieces.slice(0, base.length), base);
    assert.equal(
      pieces.some((p) => p.color === "transparent"),
      !!extras.diamond,
    );
    assert.equal(
      pieces.some((p) => p.color === "black"),
      !!extras.black,
    );
    assert.equal(
      placementError(
        generatePuzzle("extras-independent", pieces, 7, 5).placed,
        7,
        5,
      ),
      null,
    );
  }
});
