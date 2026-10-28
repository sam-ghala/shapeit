import test from "node:test";
import assert from "node:assert/strict";
import { nextPencilColor, trainingHint } from "../src/game/assistance.js";
import { emptyBoard, solutionDrawing } from "../src/game/engine.js";
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
      "blue",
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
      "red",
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
  const { mobilePlayer } = await import("../src/game/device.js");
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
