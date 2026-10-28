import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useGameSession } from "../src/hooks/useGameSession.js";
import {
  loadSession,
  createSession,
  sessionKey,
  writeJSON,
} from "../src/game/storage.js";
import { solutionDrawing } from "../src/game/engine.js";

const entries = new Map();
globalThis.localStorage = {
  getItem: (k) => entries.get(k) ?? null,
  setItem: (k, v) => entries.set(k, v),
  removeItem: (k) => entries.delete(k),
};
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: false },
  configurable: true,
});
const profile = { id: "test-player", name: "Test" };
const config = {
  mode: "daily",
  size: "compact",
  date: "2026-10-28",
  extras: false,
  timed: true,
};
let current;
function Harness() {
  current = useGameSession(config, profile);
  return null;
}
function mount() {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Harness));
  });
  return renderer;
}
test("reload restores strokes, laser history and the original start time", () => {
  entries.clear();
  let renderer = mount();
  act(() => current.cell(0, 0, "red"));
  act(() => current.edge("h-0-0", "red"));
  act(() => current.fire("top", 1));
  const before = structuredClone(current.game);
  act(() => renderer.unmount());
  renderer = mount();
  assert.deepEqual(current.game, before);
  assert.equal(current.history.length, 1);
  assert.ok(current.game.startedAt);
  act(() => renderer.unmount());
});
test("losing freezes the round and repeated submissions cannot change it", () => {
  entries.clear();
  const renderer = mount();
  act(() => current.submit());
  const done = structuredClone(current.game);
  assert.equal(done.status, "lost");
  act(() => {
    current.cell(0, 0, "red");
    current.edge("h-0-0", "red");
    current.fire("top", 0);
    current.clear();
    current.submit();
  });
  assert.deepEqual(current.game, done);
  act(() => renderer.unmount());
});
test("winning remains won after reload and review, with no duplicate result events", () => {
  entries.clear();
  let renderer = mount();
  const drawing = solutionDrawing(current.puzzle.placed, 7, 5);
  const prepared = {
    ...current.game,
    guess: drawing.guess,
    edges: drawing.edges,
    startedAt: Date.now() - 120000,
  };
  act(() => renderer.unmount());
  writeJSON(sessionKey("daily", "compact", config.date), prepared);
  renderer = mount();
  act(() => current.submit());
  const done = structuredClone(current.game);
  assert.equal(done.status, "won");
  assert.ok(done.score > 0);
  act(() => renderer.unmount());
  renderer = mount();
  act(() => current.submit());
  assert.deepEqual(current.game, done);
  const pending = JSON.parse(entries.get("shapeit:events"));
  assert.equal(pending.filter((e) => e.kind === "finish").length, 1);
  act(() => renderer.unmount());
});
test("new day gets a fresh puzzle and preserves yesterday; malformed saves reset safely", () => {
  entries.clear();
  const old = createSession(config);
  writeJSON(sessionKey("daily", "compact", config.date), old);
  const next = loadSession({ ...config, date: "2026-10-29" });
  assert.notEqual(old.seed, next.seed);
  assert.ok(entries.has(sessionKey("daily", "compact", config.date)));
  writeJSON(sessionKey("daily", "compact", config.date), {
    ...old,
    guess: [null],
  });
  assert.equal(loadSession(config).guess.length, 5);
  writeJSON(sessionKey("daily", "compact", config.date), {
    ...old,
    history: [null],
  });
  assert.deepEqual(loadSession(config).history, []);
});
