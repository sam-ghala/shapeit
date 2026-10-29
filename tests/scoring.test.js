import test from "node:test";
import assert from "node:assert/strict";
import { calcScore, scoreBreakdown } from "../src/game/engine.js";

test("scoring preserves early clues and time curve, with a smooth penalty beyond ten lasers", () => {
  assert.equal(calcScore(120, 5), 5000);
  assert.equal(calcScore(120, 10), 4000);
  assert.equal(calcScore(120, 15), 3115);
  assert.ok(calcScore(120, 10) - calcScore(120, 11) < 200);
  for (const extras of [false, { diamond: true }, { black: true }, true]) {
    for (let seconds = 0; seconds < 3600; seconds += 13) {
      for (let q = 0; q < 36; q++) {
        const score = calcScore(seconds, q, extras);
        assert.ok(score >= calcScore(seconds + 1, q, extras));
        assert.ok(score >= calcScore(seconds, q + 1, extras));
        assert.ok(score >= 0 && score <= 10000);
      }
    }
  }
});
test("extras give a bounded bonus without making 9000 easy", () => {
  assert.deepEqual(scoreBreakdown(120, 10, { diamond: true }), {
    base: 4000,
    bonus: 288,
    total: 4288,
  });
  assert.equal(calcScore(120, 10, { black: true }), 4288);
  assert.deepEqual(scoreBreakdown(120, 10, true), {
    base: 4000,
    bonus: 576,
    total: 4576,
  });
  assert.equal(scoreBreakdown(120, 5, true).bonus, 600);
  assert.equal(scoreBreakdown(0, 0, true).bonus, 0);
  assert.ok(calcScore(13, 5) > 9000);
  assert.ok(calcScore(14, 5) < 9000);
  assert.ok(calcScore(17, 5, true) > 9000);
  assert.ok(calcScore(18, 5, true) < 9000);
});
