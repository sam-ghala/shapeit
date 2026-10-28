import test from "node:test";
import assert from "node:assert/strict";
import { createInstallStore } from "../src/game/install.js";
function environment(standalone = false) {
  const win = new EventTarget();
  const display = new EventTarget();
  display.matches = standalone;
  win.matchMedia = () => display;
  return { win, store: createInstallStore(win, {}) };
}
function offer(win, outcome = "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  let calls = 0;
  event.prompt = async () => {
    calls++;
  };
  event.userChoice = Promise.resolve({ outcome });
  win.dispatchEvent(event);
  return { event, calls: () => calls };
}
test("install control is hidden until the real event, prompts once, then discards the event", async () => {
  const { win, store } = environment();
  assert.equal(store.getSnapshot().prompt, null);
  const { event, calls } = offer(win);
  assert.ok(event.defaultPrevented);
  assert.equal(store.getSnapshot().prompt, event);
  await Promise.all([store.prompt(), store.prompt()]);
  assert.equal(calls(), 1);
  assert.equal(store.getSnapshot().prompt, null);
  const second = offer(win, "accepted");
  await store.prompt();
  assert.equal(second.calls(), 1);
  assert.equal(store.getSnapshot().installed, true);
  store.destroy();
});
test("standalone and appinstalled suppress the installation control", () => {
  const first = environment(true);
  offer(first.win);
  assert.equal(first.store.getSnapshot().prompt, null);
  first.store.destroy();
  const second = environment();
  offer(second.win);
  second.win.dispatchEvent(new Event("appinstalled"));
  assert.equal(second.store.getSnapshot().prompt, null);
  assert.equal(second.store.getSnapshot().installed, true);
  second.store.destroy();
});
