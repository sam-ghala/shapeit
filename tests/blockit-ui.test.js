import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { legalMoves } from "../src/games/blockit/engine.js";
import { createSession } from "../src/games/blockit/session.js";

const require = createRequire(import.meta.url);
const bundle = await build({
  entryPoints: ["src/games/blockit/BlockIt.jsx"],
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
const { default: BlockIt } = await import(
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
globalThis.window = Object.assign(new EventTarget(), {
  history: { replaceState() {} },
});
globalThis.location = {
  pathname: "/blockit",
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
const cell = (view, id) => view.root.findByProps({ "data-cell": id });
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
const saved = () => JSON.parse(local.get("blockit:session:v1"));
const events = (kind) =>
  JSON.parse(local.get("shapeit:events") || "[]").filter(
    (event) => event.game === "blockit" && (!kind || event.kind === kind),
  );

function clean() {
  local.clear();
  tabs.clear();
  local.set(
    "shapeit:profile",
    JSON.stringify({ id: "block-ui-player", name: "Robin" }),
  );
  local.set("shapeit:sound", "false");
}
function render() {
  let view;
  act(() => {
    view = TestRenderer.create(React.createElement(BlockIt), {
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
function mount(
  session = createSession("block-ui-session", Date.now(), "white"),
) {
  clean();
  local.set("blockit:session:v1", JSON.stringify(session));
  tabs.set("blockit:view", JSON.stringify("game"));
  return render();
}
afterEach(() => {
  for (const view of roots) act(() => view.unmount());
  roots.clear();
});

test("BlockIt home starts no match; local move survives refresh with highlighted endpoints", async () => {
  clean();
  let view = render();
  assert.equal(events("visit").length, 1);
  assert.equal(events("start").length, 0);
  await click(view, "Same device");
  assert.equal(document.title, "BlockIt");
  assert.equal(events("start").length, 1);
  const game = saved().game,
    from = game.pawns[game.current],
    to = legalMoves(game)[0];
  await select(view, to);
  assert.equal(saved().game.lastAction.from, from);
  assert.equal(saved().game.lastAction.to, to);
  for (const id of [from, to])
    assert.match(cell(view, id).props.className, /block-last-cell/);
  assert.equal(view.root.findAllByType("marker").length, 0);
  const before = saved();
  unmount(view);
  view = render();
  assert.deepEqual(saved(), before);
  assert.equal(events("start").length, 1);
  await click(view, "Undo last turn");
  assert.equal(saved().game.lastAction, null);
});
test("wall previews rotate and require confirmation; invalid crossings cannot be committed", async () => {
  const view = mount();
  await click(view, "Place wall");
  await act(async () =>
    view.root.findByProps({ "data-wall-slot": 27 }).props.onClick(),
  );
  assert.equal(saved().game.walls.length, 0);
  await click(view, "Vertical");
  await click(view, "Confirm wall");
  assert.equal(saved().game.walls[0].orientation, "v");
  assert.equal(saved().game.remaining.white, 9);
  await click(view, "Place wall");
  await click(view, "Horizontal");
  await act(async () =>
    view.root.findByProps({ "data-wall-slot": 27 }).props.onClick(),
  );
  assert.equal(button(view, "Confirm wall").props.disabled, true);
  assert.ok(
    view.root
      .findAllByType("p")
      .some((node) => text(node).includes("overlap or cross")),
  );
  await click(view, "Move pawn");
  assert.equal(saved().game.walls.length, 1);
  await click(view, "Undo last turn");
  assert.equal(saved().game.walls.length, 0);
  assert.equal(saved().game.remaining.white, 10);
});
test("an illegal destination does not mutate the session or report a finished game", async () => {
  const view = mount(),
    before = saved();
  await select(view, 0);
  assert.deepEqual(saved(), before);
  assert.equal(events("finish").length, 0);
});
test("resignation records one finish, locks undo, and leaves the final board inspectable", async () => {
  const view = mount();
  await click(view, "Menu");
  await click(view, "Resign");
  await click(view, "Resign game");
  assert.equal(saved().game.winner, "black");
  assert.equal(events("finish").length, 1);
  assert.equal(events("finish")[0].winnerColor, "black");
  await click(view, "View board");
  assert.equal(button(view, "Undo last turn"), undefined);
  unmount(view);
  render();
  assert.equal(events("finish").length, 1);
});
test("returning home retains local play; replacing it records an abort only after confirmation", async () => {
  const view = mount();
  await select(view, 67);
  const id = saved().id;
  await click(view, "Menu");
  await click(view, "Save & go home");
  assert.equal(events("abort").length, 0);
  await click(view, "Continue game");
  assert.equal(saved().id, id);
  await click(view, "Menu");
  await click(view, "New game");
  assert.equal(events("abort").length, 0);
  await click(view, "Start new game");
  assert.equal(events("abort").length, 1);
  assert.notEqual(saved().id, id);
});
