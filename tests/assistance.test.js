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

test("only absorption selects black; transparent metadata never changes color selection", () => {
  const empty = emptyBoard(7, 5),
    all = [...pieces, ...EXTRA_PIECES];
  const absorbed = {
    colors: ["red"],
    extraColors: ["transparent"],
    absorbed: true,
  };
  assert.deepEqual(laserPencilColors(absorbed), ["black"]);
  assert.equal(
    nextPencilColor(laserPencilColors(absorbed), all, empty, {}, "red"),
    "black",
  );
  const diamond = { colors: [], extraColors: ["transparent"], absorbed: false };
  assert.deepEqual(laserPencilColors(diamond), []);
  assert.equal(
    nextPencilColor(laserPencilColors(diamond), all, empty, {}, "red"),
    "red",
  );
  const mixed = {
    colors: ["red", "blue"],
    extraColors: ["transparent"],
    absorbed: false,
  };
  assert.deepEqual(laserPencilColors(mixed), ["red", "blue"]);
  assert.equal(
    nextPencilColor(
      laserPencilColors(mixed),
      all,
      empty,
      {},
      "white",
      () => 0.99,
    ),
    "blue",
  );
  assert.equal(
    nextPencilColor(laserPencilColors(mixed), all, empty, {}, "red"),
    "red",
  );
});
