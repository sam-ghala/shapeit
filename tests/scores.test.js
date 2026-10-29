import test from "node:test";
import assert from "node:assert/strict";
import {
  saveResult,
  readScores,
  personalBests,
  importSavedResults,
} from "../src/game/scores.js";
import {
  createSession,
  getProfile,
  sessionKey,
  writeJSON,
  loadSession,
} from "../src/game/storage.js";
const entries = new Map();
globalThis.localStorage = {
  getItem: (k) => entries.get(k) ?? null,
  setItem: (k, v) => entries.set(k, v),
  key: (i) => [...entries.keys()][i],
  get length() {
    return entries.size;
  },
};
const config = {
  mode: "daily",
  size: "compact",
  date: "2026-10-28",
  extras: true,
  timed: false,
};
test("daily never enables extras and all new or restored rounds are timed", () => {
  entries.clear();
  const game = createSession(config);
  assert.equal(game.extras, false);
  assert.equal(game.timed, true);
  writeJSON(sessionKey("daily", "compact", config.date), {
    ...game,
    timed: false,
  });
  assert.equal(loadSession(config).timed, true);
  const train = createSession({ ...config, mode: "training" });
  assert.equal(train.timed, true);
});
test("new profiles have a blank name, while chosen names survive reload", () => {
  entries.clear();
  assert.equal(getProfile().name, "");
  writeJSON("shapeit:profile", { id: "test-player", name: "Robin" });
  assert.equal(getProfile().name, "Robin");
});
test("personal scores survive reload, deduplicate results and separate modes and sizes, excluding hints", () => {
  entries.clear();
  const game = {
    ...createSession(config),
    status: "won",
    score: 4300,
    startedAt: 1000,
    finishedAt: 121000,
  };
  saveResult(game);
  saveResult(game);
  saveResult({ ...game, id: "training", mode: "training", score: 9000 });
  saveResult({ ...game, id: "hints", hintStep: 1, score: 8000 });
  saveResult({ ...game, id: "classic", size: "classic", score: 7000 });
  saveResult({ ...game, id: "loss", status: "lost", score: 0 });
  assert.equal(readScores().length, 4);
  assert.deepEqual(
    personalBests(readScores(), "daily", "compact").map((s) => s.score),
    [4300],
  );
  assert.equal(
    readScores().some((s) => s.id === "hints"),
    false,
  );
  assert.equal(
    entries.get("shapeit:personal-scores").includes('"hints"'),
    false,
  );
  writeJSON(sessionKey("daily", "compact", config.date), {
    ...game,
    id: "older",
    score: 5000,
  });
  importSavedResults();
  assert.deepEqual(
    personalBests(readScores(), "daily", "compact").map((s) => s.score),
    [5000, 4300],
  );
});

test("many assisted rounds cannot evict an older unassisted personal best", () => {
  entries.clear();
  const game = {
    ...createSession({ ...config, mode: "training" }),
    status: "won",
    score: 3000,
    startedAt: 1000,
    finishedAt: 121000,
  };
  saveResult(game);
  for (let i = 0; i < 230; i++)
    saveResult({
      ...game,
      id: `hint-${i}`,
      hintStep: 1,
      score: 9000,
      finishedAt: 122000 + i * 1000,
    });
  assert.equal(
    personalBests(readScores(), "training", "compact")[0].id,
    game.id,
  );
});

test("legacy hinted scores are removed and cannot return through saved-game import", () => {
  entries.clear();
  const game = {
    ...createSession({ ...config, mode: "training" }),
    status: "won",
    score: 4000,
    startedAt: 1000,
    finishedAt: 121000,
  };
  saveResult(game);
  const best = readScores()[0];
  writeJSON("shapeit:personal-scores", [
    best,
    { ...best, id: "old-hint", assisted: true },
  ]);
  writeJSON(sessionKey("training", "compact", config.date), {
    ...game,
    id: "old-hint",
    hintStep: 1,
  });
  importSavedResults();
  assert.deepEqual(
    readScores().map((s) => s.id),
    [game.id],
  );
  assert.equal(
    entries.get("shapeit:personal-scores").includes("old-hint"),
    false,
  );
});
