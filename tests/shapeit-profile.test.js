import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  createRoom,
  joinRoom,
  roomView,
} from "../src/games/shapeit/server/duel.js";

const require = createRequire(import.meta.url);
const output = await build({
  entryPoints: ["src/games/shapeit/ShapeIt.jsx"],
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
globalThis.window = Object.assign(new EventTarget(), {
  scrollTo() {},
  matchMedia: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { onLine: false, userAgent: "Safari", platform: "MacIntel" },
});
const ShapeIt = (
  await import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  )
).default;
function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index],
  };
}
const profile = { id: "profile-entry-test", name: "Robin" };
let requests;
function setup(name = "", path = "/", restore = false) {
  globalThis.localStorage = memoryStorage();
  globalThis.sessionStorage = memoryStorage();
  localStorage.setItem("shapeit:profile", JSON.stringify({ ...profile, name }));
  if (restore)
    sessionStorage.setItem("shapeit:view", JSON.stringify({ screen: "duel" }));
  globalThis.location = new URL(path, "http://localhost");
  globalThis.history = {
    replaceState(_state, _title, path) {
      location.href = new URL(path, location).href;
    },
  };
  window.location = location;
  window.history = history;
  requests = [];
  let room;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, ...options });
    if (options.body) {
      const body = JSON.parse(options.body);
      if (url.endsWith("/join")) {
        room = createRoom(
          "2468",
          { id: "other-room-host", name: "Host" },
          false,
          {},
        );
        const token = joinRoom(room, body.profile, false);
        return Response.json({ room: roomView(room, 1), token });
      }
      room = createRoom("2468", body.profile, false, {});
    }
    return Response.json({
      room: roomView(room, room.players.length - 1),
      token: room.players.at(-1).token,
    });
  };
  let view;
  act(() => {
    view = TestRenderer.create(React.createElement(ShapeIt), {
      createNodeMock: () => ({ showModal() {}, close() {} }),
    });
  });
  return view;
}
const text = (node) =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const button = (view, label) =>
  view.root.findAllByType("button").find((b) => text(b).includes(label));
const nameInput = (view) => view.root.findByProps({ autoComplete: "nickname" });
function submitName(view, value) {
  act(() => nameInput(view).props.onChange({ target: { value } }));
  act(() =>
    view.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
}
function assertNoNameEditor(view) {
  assert.equal(
    view.root.findAllByProps({ autoComplete: "nickname" }).length,
    0,
  );
  assert.equal(view.root.findAllByType("dialog").length, 0);
}

test("ShapeIt multiplayer inherits the latest shared profile and has no name editor", async () => {
  const view = setup("Robin");
  try {
    act(() => button(view, "Multiplayer").props.onClick());
    assertNoNameEditor(view);
    assert.ok(button(view, "Create room"));
    act(() => {
      localStorage.setItem(
        "shapeit:profile",
        JSON.stringify({ ...profile, name: "Sam" }),
      );
      window.dispatchEvent(new Event("playit:profile"));
    });
    await act(async () => button(view, "Create room").props.onClick());
    const sent = JSON.parse(requests.find((r) => r.body).body);
    assert.deepEqual(sent.profile, { ...profile, name: "Sam" });
    assertNoNameEditor(view);
  } finally {
    act(() => view.unmount());
  }
});

test("unnamed players must choose a name before entering multiplayer", () => {
  const view = setup();
  try {
    act(() => button(view, "Multiplayer").props.onClick());
    assert.ok(view.root.findByProps({ "aria-label": "Your name" }));
    assert.equal(button(view, "Create room"), undefined);
    assert.equal(requests.length, 0);
    submitName(view, "   ");
    assert.equal(button(view, "Create room"), undefined);
    submitName(view, "  New player  ");
    assertNoNameEditor(view);
    assert.ok(button(view, "Create room"));
    assert.deepEqual(JSON.parse(localStorage.getItem("shapeit:profile")), {
      ...profile,
      name: "New player",
    });
  } finally {
    act(() => view.unmount());
  }
});

test("direct room links preserve the invite while requiring the shared name first", async () => {
  const view = setup("", "/?room=2468", { screen: "menu", dialog: "howto" });
  try {
    assert.equal(button(view, "Join room"), undefined);
    assert.equal(view.root.findAllByType("dialog").length, 1);
    assert.equal(
      view.root.findByType("dialog").props["aria-label"],
      "Your name",
    );
    assert.equal(requests.length, 0);
    submitName(view, "Guest");
    assertNoNameEditor(view);
    assert.equal(
      view.root.findByProps({ className: "room-code" }).props.value,
      "2468",
    );
    await act(async () => {
      const form = view.root.findByType("form");
      form.props.onSubmit({ preventDefault() {} });
      await Promise.resolve();
    });
    const sent = requests.find((r) => r.body);
    assert.equal(sent.url, "/api/rooms/2468/join");
    assert.deepEqual(JSON.parse(sent.body).profile, {
      ...profile,
      name: "Guest",
    });
  } finally {
    act(() => view.unmount());
  }
});

test("restored unnamed multiplayer tabs prompt for a name and can return to the menu", () => {
  const view = setup("", "/", true);
  try {
    assert.ok(view.root.findByType("dialog"));
    assert.equal(button(view, "Create room"), undefined);
    act(() => view.root.findByType("dialog").props.onCancel());
    assert.equal(view.root.findAllByType("dialog").length, 0);
    assert.ok(button(view, "Multiplayer"));
    assert.equal(button(view, "Create room"), undefined);
    assert.equal(
      JSON.parse(sessionStorage.getItem("shapeit:view")).screen,
      "menu",
    );
    assert.equal(JSON.parse(localStorage.getItem("shapeit:profile")).name, "");
  } finally {
    act(() => view.unmount());
  }
});
