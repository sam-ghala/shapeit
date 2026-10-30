import test from "node:test";
import assert from "node:assert/strict";
import {
  restoreNavigation,
  writeTabState,
} from "../src/games/shapeit/game/navigation.js";

test("reload resumes valid solo routes and dialogs; phones stay compact and direct links take priority", () => {
  const saved = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => saved.get(k) ?? null,
    setItem: (k, v) => saved.set(k, v),
  };
  const location = { pathname: "/", search: "" };
  const config = {
    mode: "training",
    size: "classic",
    date: "2026-10-29",
    extras: { black: true },
  };
  writeTabState("shapeit:view", {
    screen: "solo",
    size: "classic",
    config,
    dialog: "howto",
  });
  const restored = restoreNavigation(location, "compact");
  assert.equal(restored.screen, "solo");
  assert.equal(restored.config.mode, "training");
  assert.equal(restored.dialog, "howto");
  assert.equal(restored.config.timed, true);
  assert.equal(
    restoreNavigation(location, "classic", true).config.size,
    "compact",
  );
  assert.equal(
    restoreNavigation({ ...location, search: "?room=1234" }, "classic").screen,
    "duel",
  );
  assert.equal(
    restoreNavigation({ ...location, pathname: "/admin" }, "classic").screen,
    "admin",
  );
  for (const value of [
    "broken",
    "null",
    JSON.stringify({ screen: "solo", config: { mode: "oops" } }),
  ]) {
    saved.set("shapeit:view", value);
    assert.equal(restoreNavigation(location, "compact").screen, "menu");
  }
  globalThis.sessionStorage = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  assert.doesNotThrow(() => writeTabState("shapeit:view", restored));
  assert.equal(restoreNavigation(location, "compact").screen, "menu");
});
