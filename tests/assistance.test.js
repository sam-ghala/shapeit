import test from "node:test";
import assert from "node:assert/strict";
import {
  nextPencilColor,
  laserPencilColors,
  trainingHint,
} from "../src/games/shapeit/game/assistance.js";
import {
  emptyBoard,
  EXTRA_PIECES,
  solutionDrawing,
} from "../src/games/shapeit/game/engine.js";
const pieces = [
  { id: "red", color: "red", name: "Triangle", cells: [[0, 0, "/"]] },
  { id: "blue", color: "blue", name: "Triangle", cells: [[0, 0, "/"]] },
];
test("hit colors choose randomly, excluding shapes completely drawn anywhere", () => {
  const empty = emptyBoard(7, 5);
  assert.equal(
    nextPencilColor(["red", "blue"], pieces, empty, {}, "white", () => 0),
    "red",
  );
  assert.equal(
    nextPencilColor(["red", "blue"], pieces, empty, {}, "white", () => 0.99),
    "blue",
  );
  const drawn = solutionDrawing(
    [{ ...pieces[1], absCells: [[3, 5, "/"]] }],
    7,
    5,
  );
  assert.equal(
    nextPencilColor(
      ["red", "blue"],
      pieces,
      drawn.guess,
      drawn.edges,
      "white",
      () => 0.99,
    ),
    "red",
  );
  delete drawn.edges[Object.keys(drawn.edges)[0]];
  assert.equal(
    nextPencilColor(["blue"], pieces, drawn.guess, drawn.edges, "red"),
    "blue",
  );
  assert.equal(nextPencilColor([], pieces, empty, {}, "yellow"), "yellow");
});
test("a color stays available while any of its different shapes is incomplete", () => {
  const blueSquare = {
    id: "square",
    name: "Square",
    color: "blue",
    cells: [[0, 0, "/f"]],
  };
  const drawn = solutionDrawing(
    [{ ...pieces[1], absCells: [[3, 5, "/"]] }],
    7,
    5,
  );
  assert.equal(
    nextPencilColor(
      ["red", "blue"],
      [...pieces, blueSquare],
      drawn.guess,
      drawn.edges,
      "white",
      () => 0.99,
    ),
    "blue",
  );
});
test("training hints progress from region to position to outline, then next piece", () => {
  const placed = pieces.map((p, i) => ({ ...p, absCells: [[i, 2, "/"]] }));
  assert.equal(trainingHint(placed, 0, 7, 5), null);
  assert.match(trainingHint(placed, 1, 7, 5).text, /upper left/);
  assert.match(trainingHint(placed, 2, 7, 5).text, /A3/);
  assert.equal(trainingHint(placed, 3, 7, 5).level, 3);
  assert.equal(trainingHint(placed, 4, 7, 5).piece.id, "blue");
});

test("duel device classification does not treat a narrow desktop as a phone", async () => {
  const { mobilePlayer } = await import("../src/shared/device.js");
  assert.equal(
    mobilePlayer({
      userAgent: "Mozilla/5.0 (Macintosh) Safari",
      platform: "MacIntel",
      maxTouchPoints: 0,
    }),
    false,
  );
  assert.equal(
    mobilePlayer({
      userAgent: "Mozilla/5.0 (iPhone) Safari",
      platform: "iPhone",
      maxTouchPoints: 5,
    }),
    true,
  );
  assert.equal(
    mobilePlayer({
      userAgent: "Mozilla/5.0 (Macintosh) Safari",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    true,
  );
});

test("keeps the selected hit color, including when that color is already fully drawn", () => {
  const drawn = solutionDrawing(
    [{ ...pieces[1], absCells: [[3, 5, "/"]] }],
    7,
    5,
  );
  assert.equal(
    nextPencilColor(
      ["red", "blue"],
      pieces,
      drawn.guess,
      drawn.edges,
      "blue",
      () => 0,
    ),
    "blue",
  );
  assert.equal(
    nextPencilColor(
      ["red", "blue"],
      pieces,
      emptyBoard(7, 5),
      {},
      "red",
      () => 0.99,
    ),
    "red",
  );
});

test("public extra-piece clues select the matching tool and respect existing hit-color rules", () => {
  const empty = emptyBoard(7, 5),
    all = [...pieces, ...EXTRA_PIECES];
  for (const color of ["transparent", "black"]) {
    const clue = {
      colors: [],
      extraColors: [color],
      absorbed: color === "black",
    };
    assert.equal(
      nextPencilColor(laserPencilColors(clue), all, empty, {}, "red"),
      color,
    );
  }
  assert.deepEqual(laserPencilColors({ colors: [], absorbed: true }), [
    "black",
  ]);
  assert.equal(
    nextPencilColor(
      laserPencilColors({ colors: [], extraColors: [] }),
      all,
      empty,
      {},
      "red",
    ),
    "red",
  );
  const clue = { colors: ["red"], extraColors: ["transparent"] };
  assert.equal(
    nextPencilColor(
      laserPencilColors(clue),
      all,
      empty,
      {},
      "blue",
      () => 0.99,
    ),
    "transparent",
  );
  const diamond = EXTRA_PIECES.find((p) => p.color === "transparent");
  const drawing = solutionDrawing(
    [
      {
        ...diamond,
        absCells: diamond.cells.map(([r, c, t]) => [r + 2, c + 3, t]),
      },
    ],
    7,
    5,
  );
  assert.equal(
    nextPencilColor(
      laserPencilColors(clue),
      all,
      drawing.guess,
      drawing.edges,
      "blue",
      () => 0.99,
    ),
    "red",
  );
  assert.equal(
    nextPencilColor(
      laserPencilColors(clue),
      all,
      drawing.guess,
      drawing.edges,
      "transparent",
    ),
    "transparent",
  );
});
