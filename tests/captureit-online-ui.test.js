import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { legalMoves } from "../src/games/captureit/engine.js";
import { createSession } from "../src/games/captureit/session.js";
import {
  createCaptureRoom,
  joinCaptureRoom,
  captureRoomView,
  applyCaptureAction,
} from "../src/games/captureit/rooms.js";

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
  roots = new Set(),
  intervals = new Map(),
  locations = [];
let intervalId = 0;
const originalFetch = globalThis.fetch;
const storage = (map) => ({
  getItem: (key) => map.get(key) ?? null,
  setItem: (key, value) => map.set(key, value),
  removeItem: (key) => map.delete(key),
});
globalThis.localStorage = storage(local);
globalThis.sessionStorage = storage(tabs);
globalThis.window = Object.assign(new EventTarget(), {
  history: {
    replaceState(state, unused, url) {
      locations.push(url);
      location.search = new URL(url, location.origin).search;
    },
  },
});
globalThis.location = {
  pathname: "/captureit",
  hostname: "shapeit.test",
  origin: "https://shapeit.test",
  search: "",
};
globalThis.document = { title: "", cookie: "", querySelector: () => null };
globalThis.setInterval = (callback) => {
  intervals.set(++intervalId, callback);
  return intervalId;
};
globalThis.clearInterval = (id) => intervals.delete(id);
Object.defineProperty(navigator, "onLine", {
  configurable: true,
  value: false,
});

const host = { id: "capture-online-host", name: "Host" },
  guest = { id: "capture-online-guest", name: "Guest" };
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
        candidate.props["aria-label"] === label ||
        candidate
          .findAllByType("strong")
          .some((strong) => text(strong) === label),
    );
const click = async (view, label) =>
  act(async () => {
    const target = button(view, label);
    assert.ok(target, `Missing button: ${label}`);
    assert.notEqual(target.props.disabled, true, `Disabled button: ${label}`);
    await target.props.onClick();
  });
const cell = (view, id) => view.root.findByProps({ "data-cell-id": id });
const select = async (view, id) =>
  act(async () => {
    const target = cell(view, id);
    assert.equal(target.props.role, "button", `Field ${id} is not interactive`);
    await target.props.onClick();
  });
const interactableCells = (view) =>
  view.root.findAll((node) => node.props["data-cell-id"] && node.props.onClick);
const saved = () => JSON.parse(local.get("captureit:session:v1"));
const events = () =>
  JSON.parse(local.get("shapeit:events") || "[]").filter(
    (event) => event.game === "captureit",
  );
const action = (room, index, body) =>
  applyCaptureAction(room, index, { ...body, revision: room.revision });
const move = (game) => {
  const piece = game.pieces.find(
    (candidate) =>
      candidate.color === game.current &&
      legalMoves(game, candidate.cell).length,
  );
  assert.ok(piece, "Fixture must have a legal move");
  return {
    type: "move",
    from: piece.cell,
    to: legalMoves(game, piece.cell)[0],
  };
};

function clean(profile = host) {
  local.clear();
  tabs.clear();
  intervals.clear();
  locations.length = 0;
  location.search = "";
  document.cookie = "";
  if (profile) local.set("shapeit:profile", JSON.stringify(profile));
  local.set("shapeit:sound", "false");
}
async function render() {
  let view;
  await act(async () => {
    view = TestRenderer.create(React.createElement(CaptureIt), {
      createNodeMock: () => ({ showModal() {}, close() {}, focus() {} }),
    });
  });
  roots.add(view);
  return view;
}
async function poll() {
  await act(async () => {
    for (const callback of [...intervals.values()]) await callback();
  });
}
function serve(room, index) {
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    assert.ok(String(url).startsWith("/api/captureit/rooms"));
    const body = options.body && JSON.parse(options.body);
    if (body) requests.push({ url, ...body });
    try {
      if (String(url).endsWith("/rooms")) {
        room = createCaptureRoom("2345", body.profile);
        return Response.json({
          room: captureRoomView(room, 0),
          token: room.players[0].token,
        });
      }
      if (String(url).endsWith("/join")) {
        const token = joinCaptureRoom(room, body.profile);
        return Response.json({ room: captureRoomView(room, 1), token });
      }
      assert.equal(
        options.headers.Authorization,
        `Bearer ${room.players[index].token}`,
      );
      if (body) applyCaptureAction(room, index, body);
      return Response.json({ room: captureRoomView(room, index) });
    } catch (problem) {
      return Response.json({ error: problem.message }, { status: 400 });
    }
  };
  return {
    requests,
    get room() {
      return room;
    },
  };
}
async function online({ index = 0, phase = "playing", game } = {}) {
  clean(index ? guest : host);
  const localSession = createSession("capture-saved-local");
  local.set("captureit:session:v1", JSON.stringify(localSession));
  const room = createCaptureRoom("1234", host);
  joinCaptureRoom(room, guest);
  if (phase === "playing") action(room, 0, { type: "start" });
  if (game) room.game = game;
  local.set(
    "captureit:room",
    JSON.stringify({
      profileId: room.players[index].id,
      code: room.code,
      token: room.players[index].token,
    }),
  );
  tabs.set("captureit:view", JSON.stringify("online"));
  const server = serve(room, index);
  const view = await render();
  return { room, view, localSession, ...server };
}
async function enterName(view, value) {
  const input = view.root.findByType("input");
  act(() => input.props.onChange({ target: { value } }));
  await act(async () => {
    await view.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
}

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  intervals.clear();
  globalThis.fetch = originalFetch;
});

test("online mode requests a shared name before opening the connection screen", async () => {
  clean(null);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected request");
  };
  const view = await render();
  await click(view, "Play a friend");
  assert.ok(view.root.findByProps({ "aria-label": "Your name" }));
  assert.equal(calls, 0);
  await enterName(view, "Robin");
  assert.ok(button(view, "Create room →"));
  assert.equal(JSON.parse(local.get("shapeit:profile")).name, "Robin");
  assert.equal(calls, 0);
});

test("an invite waits for a public name and then joins only the invited room", async () => {
  clean(null);
  location.search = "?room=1234";
  const room = createCaptureRoom("1234", host);
  const { requests } = serve(room, 1);
  const view = await render();
  assert.ok(view.root.findByProps({ "aria-label": "Your name" }));
  assert.equal(requests.length, 0);
  await enterName(view, "Robin");
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/captureit/rooms/1234/join");
  assert.equal(requests[0].profile.name, "Robin");
  assert.equal(room.players.length, 2);
  assert.equal(JSON.parse(local.get("captureit:room")).code, "1234");
  assert.equal(
    view.root.findAllByProps({ "aria-label": "Your color" }).length,
    0,
  );
  assert.ok(text(view.root).includes("Black"));
});

test("forgetting saved access from an invite does not immediately rejoin the abandoned room", async () => {
  clean();
  location.search = "?room=1234";
  local.set(
    "captureit:room",
    JSON.stringify({ profileId: host.id, code: "1234", token: "saved-access" }),
  );
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method });
    return Response.json({ error: "Room unavailable." }, { status: 503 });
  };
  const view = await render();
  assert.ok(button(view, "Use another room"));
  await click(view, "Use another room");
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  assert.deepEqual(requests, [
    { url: "/api/captureit/rooms/1234", method: "GET" },
  ]);
  assert.ok(button(view, "Create room →"));
  assert.equal(JSON.parse(local.get("captureit:room")), null);
  assert.equal(location.search, "");
});

test("hosting reveals color choice and waits for a guest while preserving the local save", async () => {
  clean();
  const localSession = createSession("capture-host-local-save");
  local.set("captureit:session:v1", JSON.stringify(localSession));
  const server = serve(null, 0);
  const view = await render();
  await click(view, "Play a friend");
  await click(view, "Create room →");
  assert.deepEqual(Object.keys(server.requests[0]).sort(), ["profile", "url"]);
  assert.equal(button(view, "Start game →").props.disabled, true);
  await click(view, "Play as Black");
  assert.equal(server.room.players[0].color, "black");
  joinCaptureRoom(server.room, guest);
  await poll();
  assert.equal(button(view, "Start game →").props.disabled, false);
  await click(view, "Start game →");
  assert.equal(server.room.phase, "playing");
  assert.equal(server.room.game.current, "white");
  assert.equal(interactableCells(view).length, 0);
  assert.deepEqual(saved(), localSession);
  assert.equal(events().filter((event) => event.kind !== "visit").length, 0);
});

test("a guest cannot choose colors or start and gains controls only after the host's turn", async () => {
  const { room, view } = await online({ index: 1, phase: "lobby" });
  assert.equal(button(view, "Play as White"), undefined);
  assert.equal(button(view, "Play as Black"), undefined);
  assert.equal(button(view, "Start game →"), undefined);
  action(room, 0, { type: "start" });
  await poll();
  assert.equal(interactableCells(view).length, 0);
  action(room, 0, move(room.game));
  await poll();
  assert.ok(interactableCells(view).length > 0);
  const ownMove = move(room.game);
  await select(view, ownMove.from);
  await select(view, ownMove.to);
  assert.equal(room.game.current, "white");
  assert.equal(interactableCells(view).length, 0);
});

test("moving sends a revision and requesting undo waits for the opponent before restoring play", async () => {
  const { room, view, requests, localSession } = await online();
  const before = structuredClone(room.game),
    nextMove = move(room.game),
    revision = room.revision;
  await select(view, nextMove.from);
  await select(view, nextMove.to);
  assert.deepEqual(requests.at(-1), {
    url: "/api/captureit/rooms/1234/action",
    ...nextMove,
    revision,
    gameId: room.gameId,
  });
  assert.equal(room.game.current, "black");
  assert.equal(interactableCells(view).length, 0);
  const moved = structuredClone(room.game);
  await click(view, "Request undo");
  assert.deepEqual(room.game, moved);
  assert.equal(interactableCells(view).length, 0);
  action(room, 1, { type: "undo-response", accept: true });
  await poll();
  assert.deepEqual(room.game, before);
  assert.ok(interactableCells(view).length > 0);
  assert.deepEqual(saved(), localSession);
});

test("the receiving player cannot move during an undo request and can decline or allow it", async () => {
  const { room, view } = await online({ index: 1 });
  const before = structuredClone(room.game);
  action(room, 0, move(room.game));
  action(room, 0, { type: "undo" });
  await poll();
  assert.equal(interactableCells(view).length, 0);
  await click(view, "Decline");
  assert.notDeepEqual(room.game, before);
  assert.ok(interactableCells(view).length > 0);
  action(room, 0, { type: "undo" });
  await poll();
  await click(view, "Allow undo");
  assert.deepEqual(room.game, before);
  assert.equal(interactableCells(view).length, 0);
});

test("online exchange cancellation is local and capture submits only an opponent target", async () => {
  const game = createSession("capture-online-exchange").game;
  game.tiles = ["0,0"];
  game.collected.white = 2;
  game.pieces = [
    { id: "w1", color: "white", cell: "0,0:3" },
    { id: "b1", color: "black", cell: "0,0:0" },
    { id: "b2", color: "black", cell: "0,0:2" },
  ];
  const { room, view, requests } = await online({ game });
  await click(view, "Exchange 2 tiles");
  assert.equal(cell(view, "0,0:3").props.onClick, undefined);
  assert.ok(cell(view, "0,0:0").props.onClick);
  await click(view, "Cancel exchange");
  assert.equal(requests.length, 0);
  assert.equal(room.game.collected.white, 2);
  await click(view, "Exchange 2 tiles");
  await select(view, "0,0:0");
  assert.equal(requests.at(-1).type, "exchange");
  assert.equal(requests.at(-1).target, "0,0:0");
  assert.equal(room.game.collected.white, 0);
  assert.equal(
    room.game.pieces.some((piece) => piece.id === "b1"),
    false,
  );
  assert.equal(interactableCells(view).length, 0);
});

test("polled results require both rematch votes and never enqueue browser-authored online results", async () => {
  const { room, view, localSession } = await online();
  const firstGameId = room.gameId;
  action(room, 1, { type: "resign" });
  await poll();
  assert.ok(view.root.findByProps({ "aria-label": "Host wins!" }));
  assert.equal(interactableCells(view).length, 0);
  assert.equal(button(view, "Request undo"), undefined);
  assert.equal(events().filter((event) => event.kind === "finish").length, 0);
  await click(view, "Play again");
  assert.equal(room.phase, "finished");
  assert.equal(room.gameId, firstGameId);
  action(room, 1, { type: "rematch" });
  await poll();
  assert.equal(room.phase, "playing");
  assert.notEqual(room.gameId, firstGameId);
  assert.equal(room.players[0].color, "black");
  assert.deepEqual(room.wins, [1, 0]);
  assert.equal(interactableCells(view).length, 0);
  assert.deepEqual(saved(), localSession);
  assert.equal(events().filter((event) => event.kind !== "visit").length, 0);
});

test("a restart request pauses play until the other player declines or accepts", async () => {
  const { room, view } = await online({ index: 1 });
  action(room, 0, move(room.game));
  const played = structuredClone(room.game),
    gameId = room.gameId;
  action(room, 0, { type: "reset" });
  await poll();
  assert.equal(interactableCells(view).length, 0);
  await click(view, "Keep playing");
  assert.deepEqual(room.game, played);
  assert.equal(room.gameId, gameId);
  assert.ok(interactableCells(view).length > 0);
  action(room, 0, { type: "reset" });
  await poll();
  await click(view, "Restart round");
  assert.notEqual(room.gameId, gameId);
  assert.equal(room.game.turn, 1);
  assert.equal(room.players[1].color, "black");
  assert.deepEqual(room.wins, [0, 0]);
  assert.equal(interactableCells(view).length, 0);
});

test("returning home retains room access; leaving needs confirmation and preserves the local game", async () => {
  const { room, view, requests, localSession } = await online();
  const access = JSON.parse(local.get("captureit:room"));
  await click(view, "CaptureIt home");
  assert.ok(button(view, "Rejoin room"));
  assert.equal(room.phase, "playing");
  assert.deepEqual(JSON.parse(local.get("captureit:room")), access);
  assert.equal(location.search, "");
  await click(view, "Rejoin room");
  assert.ok(interactableCells(view).length > 0);
  await click(view, "Menu");
  await click(view, "Leave room");
  assert.ok(view.root.findByProps({ "aria-label": "Leave this room?" }));
  assert.equal(
    requests.filter((request) => request.type === "leave").length,
    0,
  );
  await click(view, "Stay");
  assert.equal(room.phase, "playing");
  await click(view, "Menu");
  await click(view, "Leave room");
  await click(view, "Leave room now");
  assert.equal(room.phase, "closed");
  assert.equal(
    requests.filter((request) => request.type === "leave").length,
    1,
  );
  assert.equal(JSON.parse(local.get("captureit:room")), null);
  assert.ok(button(view, "Play a friend"));
  assert.deepEqual(saved(), localSession);
  assert.equal(events().filter((event) => event.kind !== "visit").length, 0);
});

test("a failed departure retains room access and can be retried", async () => {
  const { room, view, localSession } = await online();
  const access = JSON.parse(local.get("captureit:room"));
  const fetchRoom = globalThis.fetch;
  let fail = true;
  globalThis.fetch = async (url, options) => {
    if (fail && options.body && JSON.parse(options.body).type === "leave") {
      fail = false;
      return Response.json(
        { error: "Connection unavailable." },
        { status: 503 },
      );
    }
    return fetchRoom(url, options);
  };
  await click(view, "Menu");
  await click(view, "Leave room");
  await click(view, "Leave room now");
  assert.equal(room.phase, "playing");
  assert.deepEqual(JSON.parse(local.get("captureit:room")), access);
  assert.ok(text(view.root).includes("Connection unavailable."));
  assert.ok(interactableCells(view).length > 0);
  await click(view, "Menu");
  await click(view, "Leave room");
  await click(view, "Leave room now");
  assert.equal(room.phase, "closed");
  assert.equal(JSON.parse(local.get("captureit:room")), null);
  assert.ok(button(view, "Play a friend"));
  assert.deepEqual(saved(), localSession);
});

test("resigning while awaiting undo confirms the player's own loss without fabricating activity", async () => {
  const { room, view } = await online();
  const ownMove = move(room.game);
  await select(view, ownMove.from);
  await select(view, ownMove.to);
  await click(view, "Request undo");
  await click(view, "Menu");
  await click(view, "Resign");
  assert.equal(room.phase, "playing");
  await click(view, "Resign game");
  assert.equal(room.phase, "finished");
  assert.equal(room.game.winner, "black");
  assert.equal(room.undoRequest, null);
  assert.ok(view.root.findByProps({ "aria-label": "Guest wins!" }));
  assert.ok(text(view.root).includes("You resigned."));
  assert.equal(events().filter((event) => event.kind === "finish").length, 0);
});
