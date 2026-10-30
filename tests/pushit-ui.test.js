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
function mount(game = createGame(), rotateBoard = false) {
  local.clear();
  session.clear();
  local.set("pushit:local:v1", JSON.stringify(game));
  local.set("shapeit:sound", "false");
  local.set("pushit:rotate-board", JSON.stringify(rotateBoard));
  session.set("pushit:view", JSON.stringify("local"));
  let view;
  act(() => {
    view = TestRenderer.create(React.createElement(PushIt), {
      createNodeMock: () => ({ showModal() {}, close() {} }),
    });
  });
  return view;
}
const selectPiece = (view, id) =>
  act(() => view.root.findByProps({ "data-piece-id": id }).props.onClick());
const forwardButton = (view) =>
  view.root
    .findAllByType("button")
    .find((b) => b.props["aria-label"]?.endsWith(", move here"));
const forward = (view) => act(async () => forwardButton(view).props.onClick());
const rotate = (view, type) =>
  act(async () =>
    view.root
      .findByProps({ "aria-label": `Rotate ${type} 90°` })
      .props.onClick(),
  );

test("PushIt UI permits end after one, requires the third after two, then changes players", async () => {
  const view = mount();
  assert.equal(button(view, "End turn").props.disabled, true);
  selectPiece(view, "b1");
  await rotate(view, "left");
  assert.equal(button(view, "End turn").props.disabled, false);
  assert.equal(button(view, "Undo action").props.disabled, false);
  await rotate(view, "right");
  assert.equal(button(view, "End turn").props.disabled, true);
  assert.ok(text(view.root).includes("One more action"));
  await forward(view);
  assert.ok(text(view.root).includes("White to play"));
  assert.equal(button(view, "Undo action").props.disabled, true);
  assert.equal(JSON.parse(local.get("pushit:local:v1")).current, "white");
  act(() => view.unmount());
});

test("local undo and reload retain the exact board and action budget", async () => {
  let view = mount();
  selectPiece(view, "b1");
  await forward(view);
  act(() => button(view, "Undo action").props.onClick());
  assert.equal(JSON.parse(local.get("pushit:local:v1")).used, 0);
  await forward(view);
  const before = local.get("pushit:local:v1");
  act(() => view.unmount());
  act(() => {
    view = TestRenderer.create(React.createElement(PushIt), {
      createNodeMock: () => ({ showModal() {}, close() {} }),
    });
  });
  assert.equal(local.get("pushit:local:v1"), before);
  assert.equal(button(view, "End turn").props.disabled, false);
  assert.ok(
    view.root
      .findByProps({ "data-piece-id": "b1" })
      .props["aria-label"].startsWith("A3, black"),
  );
  act(() => view.unmount());
});

test("blocked pushes explain the blocking piece and an edge win opens the result immediately", async () => {
  let game = createGame();
  game.pieces = [
    { id: "b1", color: "black", x: 2, y: 1, facing: 1 },
    { id: "w1", color: "white", x: 3, y: 1, facing: 3 },
  ];
  let view = mount(game);
  selectPiece(view, "b1");
  assert.equal(forwardButton(view), undefined);
  assert.ok(text(view.root).includes("faces you"));
  act(() => view.unmount());
  game.pieces[1].facing = 0;
  game.used = 1;
  view = mount(game);
  selectPiece(view, "b1");
  await forward(view);
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
  selectPiece(view, "b1");
  act(() => poll());
  await forward(view);
  assert.equal(requests.length, 3);
  assert.equal(requests[1].options.signal.aborted, true);
  assert.ok(
    view.root
      .findByProps({ "data-piece-id": "b1" })
      .props["aria-label"].startsWith("A3, black"),
  );
  assert.equal(button(view, "End turn").props.disabled, false);
  act(() => view.unmount());
  globalThis.setInterval = originalInterval;
});

test("on-board arrows rotate the selected piece and touch-friendly forward targets move it", async () => {
  const view = mount();
  assert.equal(
    view.root.findAllByProps({ className: "push-orbit-controls" }).length,
    0,
  );
  selectPiece(view, "b1");
  const left = view.root.findByProps({ "aria-label": "Rotate left 90°" });
  assert.equal(left.parent.parent.props["data-coordinate"], "A4");
  assert.equal(
    view.root.findByProps({ "aria-label": "Rotate right 90°" }).parent.parent,
    left.parent.parent,
  );
  await rotate(view, "left");
  assert.equal(JSON.parse(local.get("pushit:local:v1")).pieces[0].facing, 1);
  assert.ok(forwardButton(view).props["aria-label"].startsWith("B4"));
  await forward(view);
  assert.equal(JSON.parse(local.get("pushit:local:v1")).pieces[0].x, 1);
  assert.equal(
    view.root.findByProps({ "aria-label": "Rotate left 90°" }).parent.parent
      .props["data-coordinate"],
    "B4",
  );
  assert.equal(
    view.root.findAllByProps({ className: "push-rotate-controls" }).length,
    0,
  );
  assert.equal(button(view, "Move forward"), undefined);
  act(() => view.unmount());
});

test("same-device rotation is optional, follows complete turns only and survives reload", async () => {
  let view = mount(createGame(), true);
  const board = () =>
    view.root.findByProps({ "aria-label": "PushIt 4 by 4 board" });
  assert.equal(board().props["data-perspective"], "black");
  assert.equal(board().children[0].props["data-coordinate"], "D1");
  selectPiece(view, "b1");
  assert.equal(
    view.root.findByProps({ "data-piece-id": "b1" }).props["data-facing"],
    0,
  );
  await rotate(view, "left");
  assert.equal(board().props["data-perspective"], "black");
  assert.equal(
    view.root.findByProps({ "data-piece-id": "b1" }).props["data-facing"],
    3,
  );
  assert.equal(JSON.parse(local.get("pushit:local:v1")).pieces[0].facing, 1);
  await act(async () => button(view, "End turn").props.onClick());
  assert.equal(board().props["data-perspective"], "white");
  selectPiece(view, "w1");
  await rotate(view, "right");
  await rotate(view, "right");
  assert.equal(board().props["data-perspective"], "white");
  await rotate(view, "right");
  assert.equal(board().props["data-perspective"], "black");
  const toggle = view.root.findByType("input");
  act(() => toggle.props.onChange({ target: { checked: false } }));
  assert.equal(board().props["data-perspective"], "white");
  assert.equal(local.get("pushit:rotate-board"), "false");
  act(() => toggle.props.onChange({ target: { checked: true } }));
  act(() => view.unmount());
  act(() => {
    view = TestRenderer.create(React.createElement(PushIt), {
      createNodeMock: () => ({ showModal() {}, close() {} }),
    });
  });
  assert.equal(view.root.findByType("input").props.checked, true);
  assert.equal(board().props["data-perspective"], "black");
  act(() => view.unmount());
});

test("each online color stays at the bottom across turns and sends canonical coordinates", async () => {
  for (const color of ["black", "white"]) {
    const profile = { id: `pushit-ui-${color}`, name: "Host" };
    const r = createPushRoom("4321", profile, color, color);
    joinPushRoom(r, { id: "pushit-other-player", name: "Friend" });
    local.clear();
    session.clear();
    local.set("shapeit:profile", JSON.stringify(profile));
    local.set("shapeit:sound", "false");
    local.set(
      "pushit:room",
      JSON.stringify({
        profileId: profile.id,
        code: r.code,
        token: r.players[0].token,
      }),
    );
    session.set("pushit:view", JSON.stringify("online"));
    const requests = [];
    globalThis.fetch = async (url, options) => {
      if (options.method === "POST") {
        const body = JSON.parse(options.body);
        requests.push(body);
        const { applyPushAction } = await import("../src/pushit/rooms.js");
        applyPushAction(r, 0, body);
      }
      return Response.json({ room: pushRoomView(r, 0) });
    };
    let view;
    try {
      await act(async () => {
        view = TestRenderer.create(React.createElement(PushIt), {
          createNodeMock: () => ({ showModal() {}, close() {} }),
        });
      });
      const board = () =>
        view.root.findByProps({ "aria-label": "PushIt 4 by 4 board" });
      assert.equal(board().props["data-perspective"], color);
      const bottom = board()
        .children.slice(-4)
        .flatMap((square) => square.findAllByType("button"))
        .filter((b) => b.props["data-piece-id"]);
      assert.equal(bottom.length, 2);
      assert.ok(bottom.every((b) => b.props["data-piece-id"][0] === color[0]));
      assert.ok(
        view.root
          .findByProps({ role: "status" })
          .children.some(
            (c) => typeof c !== "string" && text(c).includes("Your turn"),
          ),
      );
      assert.equal(document.title, "Your turn · PushIt");
      const id = color === "black" ? "b1" : "w1";
      selectPiece(view, id);
      const coordinate = color === "black" ? "A3" : "A2";
      assert.ok(forwardButton(view).props["aria-label"].startsWith(coordinate));
      await forward(view);
      assert.equal(requests[0].pieceId, id);
      assert.equal(requests[0].type, "forward");
      await act(async () => button(view, "End turn").props.onClick());
      assert.equal(board().props["data-perspective"], color);
      assert.equal(document.title, "Opponent’s turn · PushIt");
      assert.ok(
        text(view.root.findByProps({ role: "status" })).includes("WAIT"),
      );
      assert.equal(
        view.root.findAllByType("input").length,
        0,
        "online perspective is automatic",
      );
      assert.equal(
        view.root.findAllByProps({ className: "push-orbit-controls" }).length,
        0,
      );
      assert.equal(
        board()
          .findAllByType("button")
          .filter((b) => !b.props.disabled).length,
        0,
      );
    } finally {
      if (view) act(() => view.unmount());
    }
  }
});

test("the guide and menu use only the PushIt name", () => {
  const view = mount();
  act(() => button(view, "How to play").props.onClick());
  assert.ok(text(view.root).includes("How to play PushIt"));
  assert.equal(
    view.root
      .findAllByType("button")
      .filter(
        (b) =>
          b.props.className?.includes("push-cell selected") ||
          /push-cell .* selected /.test(b.props.className || ""),
      ).length,
    0,
    "empty guide squares must never look selected",
  );
  assert.ok(!/DUAT|Caleb|Unphazed|official 2026/i.test(text(view.root)));
  assert.equal(
    view.root
      .findAllByType("a")
      .filter((a) => a.props.href?.startsWith("https://")).length,
    0,
  );
  act(() =>
    view.root.findByProps({ "aria-label": "Close dialog" }).props.onClick(),
  );
  act(() =>
    view.root.findByProps({ "aria-label": "Back to menu" }).props.onClick(),
  );
  assert.ok(!/DUAT|Caleb|Unphazed|Based on/i.test(text(view.root)));
  act(() => view.unmount());
});

test("a waiting online room never claims that a player can already play", async () => {
  const profile = { id: "pushit-waiting-host", name: "Host" };
  const r = createPushRoom("0012", profile);
  local.clear();
  session.clear();
  local.set("shapeit:profile", JSON.stringify(profile));
  local.set("shapeit:sound", "false");
  local.set(
    "pushit:room",
    JSON.stringify({
      profileId: profile.id,
      code: r.code,
      token: r.players[0].token,
    }),
  );
  session.set("pushit:view", JSON.stringify("online"));
  globalThis.fetch = async () => Response.json({ room: pushRoomView(r, 0) });
  let view;
  try {
    await act(async () => {
      view = TestRenderer.create(React.createElement(PushIt), {
        createNodeMock: () => ({ showModal() {}, close() {} }),
      });
    });
    assert.ok(
      text(view.root.findByProps({ role: "status" })).includes(
        "Waiting for your friend",
      ),
    );
    assert.equal(
      view.root.findAllByProps({ "aria-label": "Current turn" }).length,
      0,
    );
    assert.equal(
      view.root
        .findByProps({ "aria-label": "PushIt 4 by 4 board" })
        .findAllByType("button")
        .filter((b) => !b.props.disabled).length,
      0,
    );
    assert.equal(document.title, "Waiting for your friend · PushIt");
  } finally {
    if (view) act(() => view.unmount());
  }
});
