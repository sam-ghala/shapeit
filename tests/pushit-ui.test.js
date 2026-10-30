import test, { afterEach } from "node:test";
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
  applyPushAction,
} from "../src/pushit/rooms.js";

import { newMatch } from "../src/pushit/match.js";

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
const locations = [];
globalThis.window = Object.assign(new EventTarget(), {
  history: {
    replaceState(a, b, url) {
      locations.push(url);
    },
  },
});
globalThis.location = {
  search: "",
  pathname: "/pushit",
  origin: "https://shapeit.test",
};
globalThis.document = { title: "", querySelector: () => null };
const roots = new Set(),
  originalFetch = globalThis.fetch,
  originalInterval = globalThis.setInterval,
  originalTimeout = globalThis.setTimeout,
  originalClearTimeout = globalThis.clearTimeout;
let polls = [];
globalThis.setInterval = (fn) => {
  polls.push(fn);
  return originalInterval(() => {}, 100000);
};
const text = (node) =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const button = (view, label) =>
  view.root
    .findAllByType("button")
    .find(
      (b) =>
        text(b) === label ||
        b.findAllByType("strong").some((s) => text(s) === label),
    );
const aria = (view, label) => view.root.findByProps({ "aria-label": label });
const click = async (view, label) =>
  act(async () => button(view, label).props.onClick());
const press = async (view, label) =>
  act(async () => aria(view, label).props.onClick());
const select = (view, id) =>
  act(() => view.root.findByProps({ "data-piece-id": id }).props.onClick());
const forward = async (view) =>
  act(async () =>
    view.root
      .findAllByType("button")
      .find((b) => b.props["aria-label"]?.endsWith(", move here"))
      .props.onClick(),
  );
function clean() {
  local.clear();
  session.clear();
  polls = [];
  locations.length = 0;
  location.search = "";
  local.set("shapeit:sound", "false");
}
function render() {
  let view;
  act(() => {
    view = TestRenderer.create(React.createElement(PushIt), {
      createNodeMock: () => ({ showModal() {}, close() {} }),
    });
  });
  roots.add(view);
  return view;
}
function mount(m = newMatch(0, "black"), rotation = false) {
  clean();
  local.set("pushit:match:v2", JSON.stringify(m));
  local.set("pushit:rotate-board", JSON.stringify(rotation));
  session.set("pushit:view", JSON.stringify("local"));
  return render();
}
function clock() {
  let now = 0,
    id = 0;
  const tasks = new Map();
  globalThis.setTimeout = (fn, delay = 0) => {
    tasks.set(++id, { at: now + delay, fn });
    return id;
  };
  globalThis.clearTimeout = (id) => tasks.delete(id);
  return {
    async tick(ms) {
      await act(async () => {
        const end = now + ms;
        while (true) {
          const next = [...tasks]
            .filter(([, t]) => t.at <= end)
            .sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          now = next[1].at;
          tasks.delete(next[0]);
          next[1].fn();
        }
        now = end;
      });
    },
  };
}
const saved = () => JSON.parse(local.get("pushit:match:v2"));
const fixture = (bestOf = 0) => {
  const m = newMatch(bestOf, "black");
  m.game.pieces = [
    { id: "b1", color: "black", x: 2, y: 1, facing: 1 },
    { id: "w1", color: "white", x: 3, y: 1, facing: 0 },
  ];
  return m;
};
async function online({ color = "black", index = 0, phase = "playing" } = {}) {
  clean();
  const host = { id: "pushit-ui-host", name: "Host" },
    guest = { id: "pushit-ui-guest", name: "Guest" };
  const r = createPushRoom("1234", host);
  joinPushRoom(r, guest);
  if (color === "white")
    applyPushAction(r, 0, { type: "color", color, revision: r.revision });
  if (phase === "playing") {
    applyPushAction(r, 0, { type: "start", revision: r.revision });
    r.starter = color;
    r.game = createGame(color);
  }
  const profile = index ? guest : host;
  local.set("shapeit:profile", JSON.stringify(profile));
  local.set(
    "pushit:room",
    JSON.stringify({
      profileId: profile.id,
      code: r.code,
      token: r.players[index].token,
    }),
  );
  session.set("pushit:view", JSON.stringify("online"));
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (options.method === "POST") {
      const body = JSON.parse(options.body);
      requests.push(body);
      applyPushAction(r, index, body);
    }
    return Response.json({ room: pushRoomView(r, index) });
  };
  let view;
  await act(async () => {
    view = render();
  });
  return {
    r,
    view,
    requests,
    async poll() {
      await act(async () => {
        await polls.at(-1)();
      });
    },
  };
}

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

test("local on-board controls enforce one or three actions; undo also works across a turn boundary", async () => {
  const view = mount();
  assert.equal(button(view, "End turn →").props.disabled, true);
  select(view, "b1");
  await press(view, "Rotate left 90°");
  assert.equal(saved().game.used, 1);
  assert.equal(button(view, "End turn →").props.disabled, false);
  await press(view, "Rotate right 90°");
  assert.equal(saved().game.used, 2);
  assert.equal(button(view, "End turn →").props.disabled, true);
  await forward(view);
  assert.equal(saved().game.current, "white");
  assert.equal(saved().game.turn, 2);
  await press(view, "Undo action");
  assert.equal(saved().game.current, "black");
  assert.equal(saved().game.used, 2);
  assert.equal(
    view.root.findAllByProps({ className: "push-history" }).length,
    0,
  );
});

test("local rotation waits a full second, animates 180 degrees, then unlocks the board", async () => {
  const time = clock(),
    view = mount(newMatch(0, "black"), true);
  assert.equal(
    aria(view, "PushIt 4 by 4 board").props["data-perspective"],
    "black",
  );
  select(view, "b1");
  await press(view, "Rotate left 90°");
  await click(view, "End turn →");
  await time.tick(999);
  assert.equal(
    aria(view, "PushIt 4 by 4 board").props["data-perspective"],
    "black",
  );
  await time.tick(1);
  assert.equal(
    aria(view, "PushIt 4 by 4 board").props["data-perspective"],
    "white",
  );
  assert.equal(
    view.root.findByProps({ className: "push-board-stage" }).props[
      "data-rotating"
    ],
    true,
  );
  assert.equal(
    view.root.findByProps({ "data-piece-id": "w1" }).props.disabled,
    true,
  );
  await time.tick(440);
  assert.equal(
    view.root.findByProps({ "data-piece-id": "w1" }).props.disabled,
    false,
  );
  assert.equal(
    view.root.findByProps({ className: "push-board-stage" }).props.style[
      "--board-angle"
    ],
    "360deg",
  );
});

test("a winning push animates the ejected piece before the result; undo restores series score", async () => {
  const time = clock(),
    m = fixture(3);
  m.wins.black = 1;
  m.round = 2;
  const view = mount(m);
  select(view, "b1");
  await forward(view);
  assert.equal(saved().phase, "complete");
  assert.equal(saved().wins.black, 2);
  assert.ok(view.root.findByProps({ "data-ejected": "w1" }));
  assert.equal(view.root.findAllByType("dialog").length, 0);
  await time.tick(1100);
  assert.ok(aria(view, "Black wins!"));
  assert.ok(text(view.root).includes("SERIES WON"));
  await click(view, "Undo");
  assert.equal(saved().wins.black, 1);
  assert.equal(saved().phase, "playing");
  assert.equal(saved().game.winner, null);
  select(view, "b1");
  await forward(view);
  await time.tick(1100);
  await click(view, "New series →");
  assert.deepEqual(saved().wins, { black: 0, white: 0 });
  assert.equal(saved().round, 1);
  assert.equal(saved().bestOf, 3);
});

test("free-play points and completed results survive reload without counting a win twice", async () => {
  const time = clock(),
    view = mount(fixture());
  select(view, "b1");
  await forward(view);
  await time.tick(1100);
  const before = saved();
  assert.equal(before.wins.black, 1);
  act(() => view.unmount());
  roots.delete(view);
  const restored = render();
  assert.equal(saved().wins.black, 1);
  await time.tick(1100);
  await click(restored, "Next round →");
  assert.equal(saved().round, 2);
  assert.equal(saved().starter, "white");
  assert.equal(saved().wins.black, 1);
});

test("movement and celebration settle even if Safari suspends CSS frames", async () => {
  const time = clock(),
    view = mount(fixture());
  select(view, "b1");
  await forward(view);
  const stage = () => view.root.findByProps({ className: "push-board-stage" });
  assert.equal(stage().props["data-motion-settled"], false);
  await time.tick(360);
  assert.equal(stage().props["data-motion-settled"], true);
  assert.equal(
    view.root.findByProps({ "data-token": "b1" }).props.style.left,
    "75%",
  );
  await time.tick(740);
  assert.ok(aria(view, "Black wins!"));
  await time.tick(1000);
  assert.ok(
    view.root.findAllByType("dialog")[0].props.className.includes("is-settled"),
  );
});

test("profile entry happens in the menu before the online connection screen", async () => {
  clean();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected request");
  };
  const view = render();
  await click(view, "Play a friend");
  assert.ok(aria(view, "Your name"));
  assert.equal(calls, 0);
  const input = view.root.findByType("input");
  act(() => input.props.onChange({ target: { value: "Robin" } }));
  await act(async () =>
    view.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.ok(button(view, "Create room →"));
  assert.equal(view.root.findAllByType("select").length, 0);
  assert.equal(
    view.root.findAllByProps({ "aria-label": "Match format" }).length,
    0,
  );
  assert.equal(JSON.parse(local.get("shapeit:profile")).name, "Robin");
  await press(view, "PushIt main menu");
  assert.ok(text(view.root).includes("Robin"));
  assert.ok(button(view, "Play a friend"));
});

test("creating a room sends only the profile, then reveals color switches and series settings", async () => {
  clean();
  const profile = { id: "pushit-ui-create", name: "Robin" };
  local.set("shapeit:profile", JSON.stringify(profile));
  session.set("pushit:view", JSON.stringify("online"));
  let room, createdBody;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/rooms")) {
      createdBody = JSON.parse(options.body);
      room = createPushRoom("2345", createdBody.profile);
      return Response.json({
        room: pushRoomView(room, 0),
        token: room.players[0].token,
      });
    }
    if (options.method === "POST")
      applyPushAction(room, 0, JSON.parse(options.body));
    return Response.json({ room: pushRoomView(room, 0) });
  };
  const view = render();
  await click(view, "Create room →");
  assert.deepEqual(Object.keys(createdBody), ["profile"]);
  assert.ok(aria(view, "Your color"));
  assert.ok(aria(view, "Match format"));
  assert.equal(view.root.findAllByType("select").length, 0);
  assert.equal(button(view, "Start match →").props.disabled, true);
  await press(view, "Play as White");
  assert.equal(room.players[0].color, "white");
  await click(view, "Best of 5");
  assert.equal(room.bestOf, 5);
  assert.ok(!text(view.root).includes("Starting side"));
  assert.ok(!text(view.root).includes("sunrise"));
});

test("online views keep each player's color at the bottom and require approval for an undo", async () => {
  for (const color of ["black", "white"]) {
    const { r, view, requests, poll } = await online({ color });
    assert.equal(
      aria(view, "PushIt 4 by 4 board").props["data-perspective"],
      color,
    );
    assert.equal(document.title, "Your turn · PushIt");
    select(view, `${color[0]}1`);
    await forward(view);
    assert.equal(requests.at(-1).pieceId, `${color[0]}1`);
    const moved = structuredClone(r.game);
    await press(view, "Request undo");
    assert.ok(aria(view, "Undo request"));
    assert.deepEqual(r.game, moved);
    assert.equal(button(view, "End turn →").props.disabled, true);
    applyPushAction(r, 1, {
      type: "undo-response",
      accept: true,
      revision: r.revision,
    });
    await poll();
    assert.equal(r.game.used, 0);
    assert.equal(
      aria(view, "PushIt 4 by 4 board").props["data-perspective"],
      color,
    );
    act(() => view.unmount());
    roots.delete(view);
  }
});

test("the opponent can decline or approve undo and pending requests hide a result dialog", async () => {
  const time = clock(),
    { r, view, poll } = await online({ index: 1 });
  const winner = fixture();
  r.game = winner.game;
  r.starter = "black";
  applyPushAction(r, 0, {
    type: "forward",
    pieceId: "b1",
    revision: r.revision,
  });
  await poll();
  await time.tick(1100);
  assert.ok(aria(view, "Host wins!"));
  applyPushAction(r, 0, { type: "undo", revision: r.revision });
  await poll();
  assert.equal(view.root.findAllByType("dialog").length, 0);
  assert.ok(button(view, "Allow undo"));
  await click(view, "Decline");
  assert.equal(r.game.winner, "black");
  applyPushAction(r, 0, { type: "undo", revision: r.revision });
  await poll();
  await click(view, "Allow undo");
  assert.equal(r.game.winner, null);
  assert.equal(r.wins.black, 0);
  assert.equal(r.phase, "playing");
});

test("online turn changes never rotate a fixed player perspective", async () => {
  const { view } = await online();
  select(view, "b1");
  await forward(view);
  await click(view, "End turn →");
  assert.equal(document.title, "Opponent’s turn · PushIt");
  assert.equal(
    aria(view, "PushIt 4 by 4 board").props["data-perspective"],
    "black",
  );
  assert.equal(
    view.root
      .findAllByProps({ "aria-pressed": true })
      .filter((n) => n.props.className === "push-auto-rotate").length,
    0,
  );
  assert.equal(
    view.root.findAllByProps({ className: "push-orbit-controls" }).length,
    0,
  );
});

test("the logo returns to the menu without losing the saved match, and the guide is short and paged", async () => {
  const view = mount();
  select(view, "b1");
  await forward(view);
  const before = saved();
  await press(view, "PushIt main menu");
  assert.ok(button(view, "Continue game"));
  assert.deepEqual(saved(), before);
  assert.equal(locations.at(-1), "/pushit");
  await click(view, "How to play");
  assert.ok(text(view.root).includes("Push one opponent off"));
  await click(view, "Next →");
  assert.ok(text(view.root).includes("Push a whole row"));
  await click(view, "Next →");
  assert.ok(text(view.root).includes("One action, or all three"));
  assert.ok(
    !/sunrise|Duat|Caleb|littl[e] rivalry|Move history|The sun marks/i.test(
      text(view.root),
    ),
  );
  await click(view, "Play →");
  assert.equal(view.root.findAllByType("dialog").length, 0);
});

test("an empty-name invitation opens the name popup before joining", () => {
  clean();
  location.search = "?room=1234";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("Unexpected");
  };
  const view = render();
  assert.ok(aria(view, "Your name"));
  assert.equal(called, false);
});
