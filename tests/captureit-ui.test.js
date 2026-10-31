import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { legalMoves } from "../src/games/captureit/engine.js";
import { createSession } from "../src/games/captureit/session.js";

const require = createRequire(import.meta.url);
const bundle = await build({
  entryPoints: ["src/games/captureit/CaptureIt.jsx"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "shared-react",
      setup(builder) {
        builder.onResolve({ filter: /^react(?:\/.*)?$/ }, (args) => ({
          path: pathToFileURL(require.resolve(args.path)).href,
          external: true,
        }));
      },
    },
  ],
});
const { default: CaptureIt } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const local = new Map(),
  tabs = new Map(),
  roots = new Set();
const storage = (map) => ({
  getItem: (key) => map.get(key) ?? null,
  setItem: (key, value) => map.set(key, value),
  removeItem: (key) => map.delete(key),
});
globalThis.localStorage = storage(local);
globalThis.sessionStorage = storage(tabs);
globalThis.window = new EventTarget();
globalThis.location = {
  pathname: "/captureit",
  hostname: "shapeit.test",
  origin: "https://shapeit.test",
  search: "",
};
globalThis.document = { title: "", cookie: "", querySelector: () => null };
Object.defineProperty(navigator, "onLine", {
  configurable: true,
  value: false,
});

const text = (node) =>
  node.children
    .map((child) => (typeof child === "string" ? child : text(child)))
    .join("");
const button = (view, label) =>
  view.root
    .findAllByType("button")
    .find(
      (candidate) =>
        text(candidate) === label ||
        candidate
          .findAllByType("strong")
          .some((strong) => text(strong) === label),
    );
const cell = (view, id) => view.root.findByProps({ "data-cell-id": id });
const click = async (view, label) =>
  act(async () => {
    const target = button(view, label);
    assert.ok(target, `Missing button: ${label}`);
    assert.notEqual(target.props.disabled, true, `Disabled button: ${label}`);
    target.props.onClick();
  });
const select = async (view, id) =>
  act(async () => {
    const target = cell(view, id);
    assert.equal(target.props.role, "button", `Field ${id} is not interactive`);
    target.props.onClick();
  });
const saved = () => JSON.parse(local.get("captureit:session:v1"));
const events = (kind) =>
  JSON.parse(local.get("shapeit:events") || "[]").filter(
    (event) => event.game === "captureit" && (!kind || event.kind === kind),
  );

function clean() {
  local.clear();
  tabs.clear();
  local.set(
    "shapeit:profile",
    JSON.stringify({ id: "capture-ui-player", name: "Robin" }),
  );
  local.set("shapeit:sound", "false");
}
function render() {
  let view;
  act(() => {
    view = TestRenderer.create(React.createElement(CaptureIt), {
      createNodeMock: () => ({ showModal() {}, close() {}, focus() {} }),
    });
  });
  roots.add(view);
  return view;
}
function unmount(view) {
  act(() => view.unmount());
  roots.delete(view);
}
function mount(session = createSession("capture-ui-session")) {
  clean();
  local.set("captureit:session:v1", JSON.stringify(session));
  tabs.set("captureit:view", JSON.stringify("game"));
  return render();
}
function collectionFixture() {
  const session = createSession("capture-ui-collection");
  session.game.tiles = ["0,0", "0,-1"];
  session.game.pieces = [
    { id: "w1", color: "white", cell: "0,-1:1" },
    { id: "b1", color: "black", cell: "0,0:2" },
  ];
  return session;
}
function exchangeFixture() {
  const session = createSession("capture-ui-exchange");
  session.game.tiles = ["0,0"];
  session.game.collected.white = 2;
  session.game.pieces = [
    { id: "w1", color: "white", cell: "0,0:3" },
    { id: "b1", color: "black", cell: "0,0:0" },
    { id: "b2", color: "black", cell: "0,0:2" },
  ];
  return session;
}
afterEach(() => {
  for (const view of roots) act(() => view.unmount());
  roots.clear();
});

test("preview starts no game; starting, moving, and resuming retain the session and turn", async () => {
  clean();
  let view = render();
  assert.equal(local.has("captureit:session:v1"), false);
  assert.equal(events("visit").length, 1);
  assert.equal(events("start").length, 0);
  await click(view, "Same device");
  assert.equal(saved().game.pieces.length, 36);
  assert.equal(events("start").length, 1);
  assert.equal(document.title, "CaptureIt");
  const before = saved();
  const piece = before.game.pieces.find(
    (candidate) => legalMoves(before.game, candidate.cell).length,
  );
  const target = legalMoves(before.game, piece.cell)[0];
  assert.equal(
    cell(view, before.game.pieces.find((p) => p.color === "black").cell).props
      .onClick,
    undefined,
  );
  await select(view, piece.cell);
  assert.equal(cell(view, piece.cell).props["aria-pressed"], true);
  assert.ok(cell(view, target).props["aria-label"].endsWith("move here"));
  await select(view, target);
  assert.equal(saved().game.current, "black");
  assert.equal(saved().game.turn, 2);
  assert.equal(saved().game.pieces.find((p) => p.id === piece.id).cell, target);
  const played = saved();
  await click(view, "Menu");
  await click(view, "Save & go home");
  assert.ok(button(view, "Continue game"));
  unmount(view);
  view = render();
  await click(view, "Continue game");
  assert.deepEqual(saved(), played);
  assert.equal(events("start").length, 1);
  assert.equal(events("abort").length, 0);
  assert.ok(text(view.root).includes("Black’s turn"));
});

test("undo restores a removed tile, its bank balance, and the moved piece", async () => {
  const initial = collectionFixture();
  const view = mount(initial);
  await select(view, "0,-1:1");
  await select(view, "0,0:3");
  assert.deepEqual(saved().game.tiles, ["0,0"]);
  assert.equal(saved().game.collected.white, 1);
  assert.equal(saved().game.current, "black");
  await click(view, "Undo last turn");
  assert.deepEqual(saved().game, initial.game);
  assert.equal(saved().history.length, 0);
  assert.equal(button(view, "Undo last turn").props.disabled, true);
  assert.equal(cell(view, "0,-1:1").props.role, "button");
});

test("exchange can be cancelled without spending tiles, then targets only opponents", async () => {
  const initial = exchangeFixture();
  const view = mount(initial);
  await click(view, "Exchange 2 tiles");
  assert.equal(cell(view, "0,0:3").props.onClick, undefined);
  assert.ok(
    cell(view, "0,0:0").props["aria-label"].endsWith("exchange to capture"),
  );
  await click(view, "Cancel exchange");
  assert.deepEqual(saved(), initial);
  assert.equal(cell(view, "0,0:0").props.onClick, undefined);
  await click(view, "Exchange 2 tiles");
  await select(view, "0,0:0");
  assert.equal(saved().game.collected.white, 0);
  assert.equal(
    saved().game.pieces.some((piece) => piece.id === "b1"),
    false,
  );
  assert.equal(saved().game.current, "black");
  assert.equal(saved().game.winner, null);
  await click(view, "Undo last turn");
  assert.deepEqual(saved().game, initial.game);
});

test("resignation needs confirmation and emits the finished result only once across reload", async () => {
  let view = mount();
  const original = saved();
  await click(view, "Menu");
  await click(view, "Resign");
  assert.ok(view.root.findByProps({ "aria-label": "White resigns?" }));
  assert.equal(saved().game.winner, null);
  await click(view, "Keep playing");
  assert.deepEqual(saved(), original);
  await click(view, "Menu");
  await click(view, "Resign");
  await click(view, "Resign game");
  assert.equal(saved().game.winner, "black");
  assert.equal(saved().game.reason, "resignation");
  assert.ok(view.root.findByProps({ "aria-label": "Black wins!" }));
  assert.equal(button(view, "Undo last turn"), undefined);
  assert.equal(events("finish").length, 1);
  assert.equal(events("finish")[0].winnerColor, "black");
  assert.equal(events("finish")[0].sessionId, original.id);
  assert.equal(events("finish")[0].profileId, "capture-ui-player");
  assert.equal(events("finish")[0].mode, "local");
  assert.equal(events("finish")[0].size, "classic");
  await click(view, "View board");
  unmount(view);
  view = render();
  assert.equal(saved().game.winner, "black");
  assert.equal(events("finish").length, 1);
  assert.equal(view.root.findAllByProps({ role: "button" }).length, 0);
  await click(view, "Play again");
  assert.equal(events("finish").length, 1);
  assert.equal(events("abort").length, 0);
  assert.equal(events("start").length, 1);
});

test("replacing an active game emits one abort and starts a new session after confirmation", async () => {
  const view = mount();
  const original = saved();
  await click(view, "Menu");
  await click(view, "New game");
  assert.equal(events("abort").length, 0);
  await click(view, "Keep playing");
  assert.deepEqual(saved(), original);
  await click(view, "New game");
  await click(view, "Start new game");
  assert.notEqual(saved().id, original.id);
  assert.equal(saved().game.turn, 1);
  assert.equal(events("abort").length, 1);
  assert.equal(events("abort")[0].sessionId, original.id);
  assert.equal(events("start").length, 1);
  assert.equal(events("start")[0].sessionId, saved().id);
  assert.equal(events("finish").length, 0);
});

test("corrupted saved games fall back to a playable home screen without counting an abort", async () => {
  const invalid = createSession("capture-corrupted");
  invalid.history = [{ game: { pieces: [] } }];
  for (const value of ["{invalid JSON", JSON.stringify(invalid)]) {
    clean();
    local.set("captureit:session:v1", value);
    tabs.set("captureit:view", JSON.stringify("game"));
    const view = render();
    assert.ok(button(view, "Same device"));
    assert.equal(button(view, "Continue game"), undefined);
    await click(view, "Same device");
    assert.equal(saved().game.pieces.length, 36);
    assert.equal(events("abort").length, 0);
    assert.equal(events("start").length, 1);
    unmount(view);
  }
});
