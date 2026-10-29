import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createGame } from "../src/pushit/engine.js";
import {
  createPushRoom,
  joinPushRoom,
  pushRoomView,
} from "../src/pushit/rooms.js";

const require = createRequire(import.meta.url);
const bundle = await build({
  entryPoints: ["src/pushit/PushIt.jsx"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "shared-react",
      setup(b) {
        b.onResolve({ filter: /^react(?:\/.*)?$/ }, (args) => ({
          path: pathToFileURL(require.resolve(args.path)).href,
          external: true,
        }));
      },
    },
  ],
});
const { PushIt } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const local = new Map(),
  session = new Map();
const storage = (map) => ({
  getItem: (k) => map.get(k) ?? null,
  setItem: (k, v) => map.set(k, v),
});
globalThis.localStorage = storage(local);
globalThis.sessionStorage = storage(session);
globalThis.window = Object.assign(new EventTarget(), {
  history: { replaceState() {} },
});
globalThis.location = {
  search: "",
  pathname: "/pushit",
  origin: "https://shapeit.test",
};
globalThis.document = { title: "", querySelector: () => null };
const text = (node) =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const button = (view, label) =>
  view.root.findAllByType("button").find((b) => text(b).includes(label));
function mount(game = createGame()) {
  local.clear();
  session.clear();
  local.set("pushit:local:v1", JSON.stringify(game));
  local.set("shapeit:sound", "false");
  session.set("pushit:view", JSON.stringify("local"));
  let view;
  act(() => {
    view = TestRenderer.create(React.createElement(PushIt), {
      createNodeMock: () => ({ showModal() {}, close() {} }),
    });
  });
  return view;
}
const select = (view, label) =>
  act(() => view.root.findByProps({ "aria-label": label }).props.onClick());

test("PushIt UI permits end after one, requires the third after two, then changes players", async () => {
  const view = mount();
  assert.equal(button(view, "End turn").props.disabled, true);
  select(view, "A4, black, facing south");
  await act(async () => button(view, "Left 90°").props.onClick());
  assert.equal(button(view, "End turn").props.disabled, false);
  assert.equal(button(view, "Undo action").props.disabled, false);
  await act(async () => button(view, "Right 90°").props.onClick());
  assert.equal(button(view, "End turn").props.disabled, true);
  assert.ok(text(view.root).includes("One more action"));
  await act(async () => button(view, "Move forward").props.onClick());
  assert.ok(text(view.root).includes("White to play"));
  assert.equal(button(view, "Undo action").props.disabled, true);
  assert.equal(JSON.parse(local.get("pushit:local:v1")).current, "white");
  act(() => view.unmount());
});

test("local undo and reload retain the exact board and action budget", async () => {
  let view = mount();
  select(view, "A4, black, facing south");
  await act(async () => button(view, "Move forward").props.onClick());
  act(() => button(view, "Undo action").props.onClick());
  assert.equal(JSON.parse(local.get("pushit:local:v1")).used, 0);
  await act(async () => button(view, "Move forward").props.onClick());
  const before = local.get("pushit:local:v1");
  act(() => view.unmount());
  act(() => {
    view = TestRenderer.create(React.createElement(PushIt), {
      createNodeMock: () => ({ showModal() {}, close() {} }),
    });
  });
  assert.equal(local.get("pushit:local:v1"), before);
  assert.equal(button(view, "End turn").props.disabled, false);
  assert.ok(view.root.findByProps({ "aria-label": "A3, black, facing south" }));
  act(() => view.unmount());
});

test("blocked pushes explain the blocking piece and an edge win opens the result immediately", async () => {
  let game = createGame();
  game.pieces = [
    { id: "b1", color: "black", x: 2, y: 1, facing: 1 },
    { id: "w1", color: "white", x: 3, y: 1, facing: 3 },
  ];
  let view = mount(game);
  select(view, "C3, black, facing east");
  assert.equal(button(view, "Move forward").props.disabled, true);
  assert.ok(text(view.root).includes("faces you"));
  act(() => view.unmount());
  game.pieces[1].facing = 0;
  game.used = 1;
  view = mount(game);
  select(view, "C3, black, facing east");
  await act(async () => button(view, "Push 1 piece").props.onClick());
  assert.ok(view.root.findByProps({ "aria-label": "Black wins!" }));
  assert.equal(JSON.parse(local.get("pushit:local:v1")).winner, "black");
  act(() => button(view, "See board").props.onClick());
  assert.equal(view.root.findAllByType("dialog").length, 0);
  act(() => view.unmount());
});

test("online actions interrupt a slow poll and ignore its late response", async () => {
  const profile = { id: "pushit-ui-player", name: "Host" };
  const r = createPushRoom("1234", profile);
  joinPushRoom(r, { id: "pushit-ui-guest", name: "Guest" });
  local.clear();
  session.clear();
  local.set("shapeit:profile", JSON.stringify(profile));
  local.set(
    "pushit:room",
    JSON.stringify({
      profileId: profile.id,
      code: r.code,
      token: r.players[0].token,
    }),
  );
  session.set("pushit:view", JSON.stringify("online"));
  const originalInterval = globalThis.setInterval;
  let poll;
  globalThis.setInterval = (fn) => {
    poll = fn;
    return originalInterval(() => {}, 100000);
  };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1)
      return Response.json({ room: pushRoomView(r, 0) });
    if (options.method === "POST") {
      const { act: engineAct } = await import("../src/pushit/engine.js");
      r.game = engineAct(r.game, JSON.parse(options.body));
      r.revision++;
      return Response.json({ room: pushRoomView(r, 0) });
    }
    return new Promise((resolve, reject) =>
      options.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      ),
    );
  };
  let view;
  await act(async () => {
    view = TestRenderer.create(React.createElement(PushIt), {
      createNodeMock: () => ({ showModal() {}, close() {} }),
    });
  });
  select(view, "A4, black, facing south");
  act(() => poll());
  await act(async () => button(view, "Move forward").props.onClick());
  assert.equal(requests.length, 3);
  assert.equal(requests[1].options.signal.aborted, true);
  assert.ok(view.root.findByProps({ "aria-label": "A3, black, facing south" }));
  assert.equal(button(view, "End turn").props.disabled, false);
  act(() => view.unmount());
  globalThis.setInterval = originalInterval;
});
