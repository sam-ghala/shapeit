import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  createSession,
  writeJSON,
  readJSON,
  sessionKey,
} from "../src/game/storage.js";
import {
  buildPieces,
  generatePuzzle,
  solutionDrawing,
  emptyBoard,
} from "../src/game/engine.js";
const require = createRequire(import.meta.url);
async function component(path, name) {
  const output = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
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
  return (
    await import(
      `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
    )
  )[name];
}
const entries = new Map();
globalThis.localStorage = {
  getItem: (k) => entries.get(k) ?? null,
  setItem: (k, v) => entries.set(k, v),
  key: (i) => [...entries.keys()][i],
  get length() {
    return entries.size;
  },
};
globalThis.window = Object.assign(new EventTarget(), {
  matchMedia: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
  scrollTo() {},
});
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: false, userAgent: "Safari", platform: "MacIntel" },
  configurable: true,
});
globalThis.requestAnimationFrame = (fn) =>
  setTimeout(() => fn(performance.now()), 16);
globalThis.cancelAnimationFrame = clearTimeout;
const SoloGame = await component("src/components/SoloGame.jsx", "SoloGame");
const GameBoard = await component("src/components/GameBoard.jsx", "GameBoard");
const QueryLog = await component("src/components/GameControls.jsx", "QueryLog");
const PieceList = await component(
  "src/components/GameControls.jsx",
  "PieceList",
);
const config = {
  mode: "training",
  size: "compact",
  date: "2026-10-28",
  extras: false,
  timed: true,
};
function mount(
  type,
  props,
  nodeMock = () => ({ showModal() {}, close() {}, children: [] }),
) {
  let rendered;
  act(() => {
    rendered = TestRenderer.create(React.createElement(type, props), {
      createNodeMock: nodeMock,
    });
  });
  return rendered;
}
function text(node) {
  return node.children
    .map((c) => (typeof c === "string" ? c : text(c)))
    .join("");
}
function button(rendered, label) {
  return rendered.root.findAllByType("button").find((b) => text(b) === label);
}
test("submit opens score result immediately, comparison hides X notes and board geometry stays unchanged", () => {
  entries.clear();
  const session = createSession(config);
  const pieces = buildPieces(session.seed, "compact", false);
  const puzzle = generatePuzzle(session.seed, pieces, 7, 5);
  const drawing = solutionDrawing(puzzle.placed, 7, 5);
  drawing.guess[4][6] ||= { color: "x", type: "x" };
  writeJSON(sessionKey("training", "compact", config.date), {
    ...session,
    ...drawing,
    startedAt: Date.now() - 120000,
  });
  const view = mount(SoloGame, {
    config,
    profile: { id: "ui-player", name: "Test" },
    effects: true,
    onHome() {},
    onDaily() {},
  });
  const svg = () =>
    view.root
      .findAllByType("svg")
      .find((n) => n.props.className === "game-board");
  const before = svg().props.viewBox;
  act(() => button(view, "Submit solution").props.onClick());
  assert.ok(view.root.findAllByType("h2").some((n) => text(n) === "Solved!"));
  assert.ok(view.root.findByProps({ role: "progressbar" }));
  assert.equal(svg().props.viewBox, before);
  assert.equal(
    svg()
      .findAllByType("text")
      .some((n) => text(n) === "×"),
    false,
  );
  assert.ok(button(view, "Share"));
  assert.ok(button(view, "New board →"));
  act(() => button(view, "See board").props.onClick());
  assert.equal(view.root.findAllByType("dialog").length, 0);
  act(() => button(view, "New board →").props.onClick());
  assert.ok(button(view, "Submit solution"));
  act(() => view.unmount());
});
test("incorrect submission opens an explicit zero-point result without a confirmation step", () => {
  entries.clear();
  const view = mount(SoloGame, {
    config,
    profile: { id: "ui-player", name: "Test" },
    effects: true,
    onHome() {},
    onDaily() {},
  });
  act(() => button(view, "Submit solution").props.onClick());
  assert.ok(
    view.root.findAllByType("h2").some((n) => text(n) === "Not solved"),
  );
  assert.equal(
    view.root.findByProps({ role: "progressbar" }).props["aria-valuenow"],
    0,
  );
  act(() => view.unmount());
});
test("cell hover previews placement; drawn pieces are muted even when placed away from the solution", () => {
  const piece = {
    id: "r",
    name: "Triangle",
    color: "red",
    cells: [[0, 0, "/"]],
  };
  const drawing = solutionDrawing(
    [{ ...piece, absCells: [[3, 5, "/"]] }],
    7,
    5,
  );
  const view = mount(GameBoard, {
    cols: 7,
    rows: 5,
    guess: drawing.guess,
    edges: drawing.edges,
    pieces: [piece],
    selectedColor: "red",
    onCell() {},
    onEdge() {},
  });
  const cell = view.root
    .findAllByType("rect")
    .find((n) => n.props["data-cell"] === "0-0");
  act(() => cell.props.onPointerEnter({ pointerType: "mouse" }));
  assert.ok(
    view.root.findAllByType("rect").some((n) => n.props.fill === "#596b801c"),
  );
  act(() => cell.props.onPointerLeave());
  assert.equal(
    view.root.findAllByType("rect").some((n) => n.props.fill === "#596b801c"),
    false,
  );
  act(() => view.unmount());
  const list = mount(PieceList, {
    pieces: [piece],
    guess: drawing.guess,
    edges: drawing.edges,
    onColor() {},
  });
  assert.match(list.root.findByType("button").props.className, /placed/);
  assert.equal(list.root.findAllByType("small").length, 0);
  act(() => list.unmount());
});
test("selecting an old laser, including the same selection again, scrolls only its log into view", () => {
  const container = {
    scrollTop: 200,
    clientHeight: 80,
    getBoundingClientRect: () => ({ top: 100 }),
    children: Array.from({ length: 10 }, (_, i) => ({
      getBoundingClientRect: () => ({
        top: 100 + i * 40 - container.scrollTop,
      }),
      offsetHeight: 40,
    })),
  };
  const history = Array.from({ length: 10 }, (_, i) => ({
    side: "top",
    idx: i % 7,
    exitSide: "left",
    exitIdx: 0,
    colors: ["red"],
  }));
  const props = {
    history,
    cols: 7,
    rows: 5,
    selected: 0,
    onSelect() {},
    selectionVersion: 0,
  };
  const view = mount(QueryLog, props, (n) =>
    n.type === "ol" ? container : null,
  );
  assert.equal(container.scrollTop, 0);
  act(() =>
    view.update(React.createElement(QueryLog, { ...props, selected: 9 })),
  );
  assert.equal(container.scrollTop, 320);
  container.scrollTop = 0;
  act(() =>
    view.update(
      React.createElement(QueryLog, {
        ...props,
        selected: 9,
        selectionVersion: 1,
      }),
    ),
  );
  assert.equal(container.scrollTop, 320);
  act(() => view.unmount());
});

test("score animation reaches its final value even when background animation frames are suspended", async () => {
  const ResultDialog = await component(
    "src/components/ResultDialog.jsx",
    "ResultDialog",
  );
  const raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  const view = mount(ResultDialog, {
    title: "Solved!",
    won: true,
    score: 5000,
    onClose() {},
    onNext() {},
  });
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2150));
    });
    assert.equal(
      view.root.findByProps({ role: "progressbar" }).props["aria-valuenow"],
      5000,
    );
  } finally {
    act(() => view.unmount());
    globalThis.requestAnimationFrame = raf;
  }
});

test("finished boards allow every laser from its clicked entry without changing the result", () => {
  entries.clear();
  const view = mount(SoloGame, {
    config,
    profile: { id: "replay-test", name: "Test" },
    effects: true,
    onHome() {},
    onDaily() {},
  });
  act(() => button(view, "Submit solution").props.onClick());
  act(() => button(view, "See board").props.onClick());
  const before = readJSON(sessionKey("training", "compact", config.date), null);
  const labels = view.root.findAll(
    (n) =>
      n.props.role === "button" &&
      n.props["aria-label"]?.startsWith("Fire laser"),
  );
  assert.equal(labels.length, 24);
  assert.ok(labels.every((n) => !n.props["aria-disabled"]));
  act(() =>
    labels
      .find((n) => n.props["aria-label"] === "Fire laser F")
      .props.onClick(),
  );
  const path = view.root.findByType("polyline");
  assert.ok(path.props.points.startsWith("56,272"), path.props.points);
  assert.deepEqual(
    readJSON(sessionKey("training", "compact", config.date), null),
    before,
  );
  act(() => view.unmount());
});
test("existing strokes have no diagonal hover preview and touch clears hover without leaving focus marks", () => {
  const guess = emptyBoard(7, 5);
  guess[0][0] = { color: "yellow", type: "\\" };
  const view = mount(GameBoard, {
    cols: 7,
    rows: 5,
    guess,
    onCell() {},
    onEdge() {},
    selectedColor: "yellow",
  });
  const cell = () => view.root.findByProps({ "data-cell": "0-0" });
  const lineCount = view.root.findAllByType("line").length;
  act(() => cell().props.onPointerEnter({ pointerType: "mouse" }));
  assert.equal(view.root.findAllByType("line").length, lineCount);
  act(() =>
    view.root
      .findByType("svg")
      .props.onPointerDownCapture({ pointerType: "touch" }),
  );
  act(() => cell().props.onFocus());
  assert.equal(
    view.root.findAllByType("rect").some((n) => n.props.fill === "#596b801c"),
    false,
  );
  act(() => view.unmount());
});
test("overlay opacity is applied once to the whole drawing, avoiding darker joined corners", () => {
  const guess = emptyBoard(7, 5);
  guess[0][0] = { color: "red", type: "/" };
  const view = mount(GameBoard, {
    cols: 7,
    rows: 5,
    guess,
    edges: { "h-0-0": "red" },
    compare: true,
    revealed: [],
    locked: true,
  });
  const strokes = view.root.findByProps({ className: "drawing-strokes" });
  assert.equal(strokes.props.opacity, 0.42);
  assert.ok(
    strokes.findAllByType("line").every((n) => n.props.opacity === undefined),
  );
  act(() => view.unmount());
});
test("phone menu has no board-size choice and training opens without an extras dialog", async () => {
  entries.clear();
  globalThis.location = { pathname: "/", search: "" };
  const oldAgent = navigator.userAgent;
  navigator.userAgent = "Android";
  const App = await component("src/App.jsx", "default");
  const view = mount(App, {});
  try {
    assert.equal(
      view.root.findAll((n) => n.props["aria-label"] === "Board size").length,
      0,
    );
    act(() => button(view, "△Train mode▶").props.onClick());
    assert.equal(view.root.findAllByType("dialog").length, 0);
    assert.ok(button(view, "Submit solution"));
    const board = view.root
      .findAllByType("svg")
      .find((n) => n.props.className === "game-board");
    assert.equal(board.props.viewBox, "0 0 400 304");
  } finally {
    act(() => view.unmount());
    navigator.userAgent = oldAgent;
  }
});

test("reload retains the training board, drawing, lasers and result/board view", async () => {
  entries.clear();
  const tab = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => tab.get(k) ?? null,
    setItem: (k, v) => tab.set(k, v),
  };
  globalThis.location = { pathname: "/", search: "" };
  const App = await component("src/App.jsx", "default");
  let view = mount(App, {});
  try {
    act(() => button(view, "△Train mode▶").props.onClick());
    const board = () =>
      view.root.findAll((n) => n.props.className === "game-board")[0];
    act(() => board().findByProps({ "data-cell": "0-0" }).props.onClick());
    act(() =>
      board().findByProps({ "aria-label": "Fire laser 1" }).props.onClick(),
    );
    const key = [...entries.keys()].find(
      (k) => k.startsWith("shapeit:v") && k.includes(":training:"),
    );
    const before = readJSON(key, null);
    assert.equal(before.history.length, 1);
    assert.ok(before.guess[0][0]);
    act(() => view.unmount());
    view = mount(App, {});
    assert.ok(button(view, "Submit solution"));
    assert.deepEqual(readJSON(key, null), before);
    act(() => button(view, "Submit solution").props.onClick());
    act(() => view.unmount());
    view = mount(App, {});
    assert.ok(button(view, "See board"));
    act(() => button(view, "See board").props.onClick());
    act(() => view.unmount());
    view = mount(App, {});
    assert.equal(view.root.findAllByType("dialog").length, 0);
    assert.ok(button(view, "New board →"));
    act(() => button(view, "New board →").props.onClick());
    const next = readJSON(key, null);
    assert.notEqual(next.id, before.id);
    act(() => view.unmount());
    view = mount(App, {});
    assert.ok(button(view, "Submit solution"));
    assert.equal(readJSON(key, null).id, next.id);
  } finally {
    act(() => view.unmount());
    delete globalThis.sessionStorage;
  }
});

test("result meter marks the matching previous best and assisted results cannot claim a record", async () => {
  const ResultDialog = await component(
    "src/components/ResultDialog.jsx",
    "ResultDialog",
  );
  const props = {
    title: "Solved!",
    won: true,
    score: 5600,
    bestScore: 6000,
    animate: false,
    onClose() {},
    onNext() {},
  };
  const view = mount(ResultDialog, props);
  assert.equal(
    view.root.findByProps({ className: "best-marker" }).props.style.left,
    "60%",
  );
  assert.ok(text(view.root).includes("400 to go"));
  act(() =>
    view.update(React.createElement(ResultDialog, { ...props, score: 6500 })),
  );
  assert.ok(text(view.root).includes("Personal best!"));
  act(() =>
    view.update(
      React.createElement(ResultDialog, {
        ...props,
        score: 6500,
        scoreEligible: false,
      }),
    ),
  );
  assert.ok(!text(view.root).includes("Personal best!"));
  act(() => view.unmount());
});

test("tutorial uses the live game's animated board and query log, including reverse-entry replays", async () => {
  const Guide = await component(
    "src/components/HowToPlayModal.jsx",
    "HowToPlayModal",
  );
  const view = mount(Guide, {
    onClose() {},
    pieces: buildPieces(42, "compact", false),
  });
  try {
    assert.ok(!text(view.root).includes("Advanced"));
    const board = () =>
      view.root
        .findByProps({ hidden: false })
        .findByProps({ className: "game-board" });
    act(() =>
      board().findByProps({ "aria-label": "Fire laser 1" }).props.onClick(),
    );
    const path = board().findByType("polyline");
    assert.equal(path.props.className, "laser-path animate-laser");
    assert.equal(path.props.style["--laser-length"], 48);
    const firstPath = path.props.points;
    assert.ok(firstPath.startsWith("56,32"), firstPath);
    act(() =>
      board().findByProps({ "aria-label": "Fire laser E" }).props.onClick(),
    );
    assert.ok(board().findByType("polyline").props.points.startsWith("56,224"));
    assert.ok(
      view.root.findAll((n) => n.props.className === "query-route").length >= 2,
    );
    act(() => button(view, "Try game").props.onClick());
    assert.equal(board().findAllByType("polyline").length, 0);
    act(() =>
      board().findByProps({ "aria-label": "Fire laser 1" }).props.onClick(),
    );
    // The hidden example must not leak its path before the drawing is solved.
    assert.equal(board().findAllByType("polyline").length, 0);
  } finally {
    act(() => view.unmount());
  }
});

test("a laser path remains visible if Safari pauses CSS animations in a background tab", async () => {
  const view = mount(GameBoard, {
    cols: 5,
    rows: 4,
    guess: emptyBoard(5, 4),
    locked: true,
    animate: true,
    activeLaser: {
      points: [
        [0.5, 0],
        [0.5, 0.5],
        [0, 0.5],
      ],
    },
    replayVersion: 1,
  });
  try {
    assert.equal(
      view.root.findByType("polyline").props.className,
      "laser-path animate-laser",
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1650));
    });
    assert.equal(
      view.root.findByType("polyline").props.className,
      "laser-path",
    );
    assert.equal(
      view.root.findByType("polyline").props.points,
      "56,32 56,56 32,56",
    );
  } finally {
    act(() => view.unmount());
  }
});

test("solo results use only the personal best from the same mode and size", () => {
  entries.clear();
  const base = {
    status: "won",
    finishedAt: Date.now(),
    seconds: 30,
    assisted: false,
  };
  writeJSON("shapeit:personal-scores", [
    { ...base, id: "same", mode: "training", size: "compact", score: 4000 },
    { ...base, id: "daily", mode: "daily", size: "compact", score: 9000 },
    { ...base, id: "big", mode: "training", size: "classic", score: 8000 },
    {
      ...base,
      id: "hint",
      mode: "training",
      size: "compact",
      score: 7000,
      assisted: true,
    },
  ]);
  const view = mount(SoloGame, {
    config,
    profile: { id: "best-test", name: "Test" },
    onHome() {},
    onDaily() {},
  });
  try {
    act(() => button(view, "Submit solution").props.onClick());
    assert.equal(
      view.root.findByProps({ className: "best-marker" }).props.style.left,
      "40%",
    );
  } finally {
    act(() => view.unmount());
  }
});

const DuelBoard = await component("src/components/DuelGame.jsx", "DuelBoard");
const duel = await import("../src/server/duel.js");
function duelFixture(mode = "turns") {
  const room = duel.createRoom(
    "2468",
    { id: "host-test", name: "Robin" },
    true,
    { mode },
    1000,
  );
  duel.joinRoom(room, { id: "guest-test", name: "Sam" }, false);
  duel.applyAction(room, 0, { type: "start" }, 2000);
  for (let i = 0; i < 2; i++)
    duel.applyAction(
      room,
      i,
      {
        type: "ready",
        placed: generatePuzzle(`ui-duel:${i}`, room.players[i].pieces, 7, 5)
          .placed,
      },
      3000,
    );
  room.turn = 0;
  return room;
}
function duelProps(room, you = 0) {
  return {
    room: duel.roomView(room, you, 4000),
    action: async () => null,
    busy: false,
    effects: true,
    onNewRoom() {},
  };
}
function duelBoard(rendered) {
  return rendered.root.findAll(
    (n) => typeof n.type === "function" && n.type.name === "GameBoard",
  )[0];
}
test("duel splits player logs, clearly signals turns and shows opponent shots on your own board", () => {
  entries.clear();
  const room = duelFixture();
  duel.applyAction(room, 0, { type: "laser", side: "top", idx: 0 }, 4000);
  duel.applyAction(room, 1, { type: "laser", side: "left", idx: 0 }, 4100);
  const rendered = mount(DuelBoard, duelProps(room));
  const logs = rendered.root.findAll(
    (n) => typeof n.type === "function" && n.type.name === "QueryLog",
  );
  assert.deepEqual(
    logs.map((n) => n.props.title),
    ["You", "Sam"],
  );
  assert.deepEqual(
    logs.map((n) => n.props.history.length),
    [1, 1],
  );
  assert.ok(text(rendered.root).includes("Your turn"));
  assert.equal(duelBoard(rendered).props.revealed, null);
  act(() => logs[1].props.onSelect(0));
  assert.deepEqual(duelBoard(rendered).props.revealed, room.players[0].placed);
  assert.equal(duelBoard(rendered).props.activeLaser.side, "left");
  assert.equal(duelBoard(rendered).props.activeLaser.idx, 0);
  assert.equal(duelBoard(rendered).props.locked, true);
  act(() => logs[0].props.onSelect(0));
  assert.equal(duelBoard(rendered).props.revealed, null);
  assert.equal(duelBoard(rendered).props.locked, false);
  room.turn = 1;
  act(() => rendered.update(React.createElement(DuelBoard, duelProps(room))));
  assert.ok(text(rendered.root).includes("Sam's turn"));
  assert.equal(duelBoard(rendered).props.newLaserLocked, true);
  act(() => rendered.unmount());
});
test("race allows independent shots but never displays the other board, logs or live drawing", () => {
  entries.clear();
  const room = duelFixture("race");
  room.turn = 1;
  const rendered = mount(DuelBoard, duelProps(room));
  assert.equal(duelBoard(rendered).props.newLaserLocked, false);
  assert.equal(button(rendered, "Submit solution").props.disabled, false);
  duel.applyAction(
    room,
    0,
    { type: "submit", drawing: solutionDrawing(room.players[1].placed, 7, 5) },
    5000,
  );
  const draft = { guess: emptyBoard(7, 5), edges: { "h-0-0": "red" } };
  duel.applyAction(room, 1, { type: "draft", drawing: draft }, 6000);
  act(() => rendered.update(React.createElement(DuelBoard, duelProps(room))));
  assert.ok(text(rendered.root).includes("Sam is finishing"));
  assert.equal(duelBoard(rendered).props.revealed, null);
  assert.deepEqual(duelBoard(rendered).props.edges, {});
  assert.equal(duelBoard(rendered).props.drawingDashed, false);
  assert.equal(
    rendered.root.findAllByProps({ "aria-label": "Choose board" }).length,
    0,
  );
  assert.equal(
    rendered.root.findAll(
      (n) => typeof n.type === "function" && n.type.name === "QueryLog",
    ).length,
    1,
  );
  assert.equal(duelBoard(rendered).props.locked, true);
  assert.equal(button(rendered, "Solution locked").props.disabled, true);
  act(() => rendered.unmount());
});
test("finished duel has board buttons and distinct original, overlay and submitted drawing views", () => {
  entries.clear();
  const room = duelFixture("race");
  const wrong = { guess: emptyBoard(7, 5), edges: { "h-0-0": "red" } };
  duel.applyAction(
    room,
    0,
    { type: "submit", drawing: solutionDrawing(room.players[1].placed, 7, 5) },
    123000,
  );
  duel.applyAction(room, 1, { type: "submit", drawing: wrong }, 124000);
  const rendered = mount(DuelBoard, duelProps(room));
  act(() => rendered.root.findByType("dialog").props.onCancel());
  assert.equal(rendered.root.findAllByType("select").length, 0);
  const choices = rendered.root
    .findByProps({ "aria-label": "Choose board" })
    .findAllByType("button");
  act(() => choices[1].props.onClick());
  assert.equal(choices[1].props["aria-pressed"], true);
  assert.deepEqual(duelBoard(rendered).props.revealed, room.players[0].placed);
  assert.deepEqual(duelBoard(rendered).props.edges, wrong.edges);
  assert.equal(duelBoard(rendered).props.drawingDashed, true);
  act(() => button(rendered, "Sam's drawing").props.onClick());
  assert.equal(duelBoard(rendered).props.revealed, null);
  assert.deepEqual(duelBoard(rendered).props.edges, wrong.edges);
  act(() => button(rendered, "Solution").props.onClick());
  assert.deepEqual(duelBoard(rendered).props.revealed, room.players[0].placed);
  assert.equal(duelBoard(rendered).props.compare, false);
  assert.equal(duelBoard(rendered).props.newLaserLocked, false);
  assert.equal(
    text(rendered.root.findByProps({ "aria-label": "Room score" })),
    "Robin1 : 0Sam",
  );
  act(() => rendered.unmount());
});

test("duel sync sends changed drawings with the round identity and stops immediately after submit", async () => {
  entries.clear();
  const room = duelFixture("race"),
    sent = [];
  let syncTick;
  const originalInterval = globalThis.setInterval;
  globalThis.setInterval = (fn, ms) => {
    if (ms === 350) syncTick = fn;
    return originalInterval(fn, ms);
  };
  const syncDrawing = async (roundId, drawing, signal) => {
    sent.push({ roundId, drawing, signal });
    return { ok: true };
  };
  let rendered;
  try {
    rendered = mount(DuelBoard, { ...duelProps(room), syncDrawing });
  } finally {
    globalThis.setInterval = originalInterval;
  }
  await act(async () => {
    await syncTick();
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].roundId, room.id);
  await act(async () => {
    await syncTick();
  });
  assert.equal(sent.length, 1);
  act(() => duelBoard(rendered).props.onCell(0, 0));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 370));
    await syncTick();
  });
  assert.equal(sent.length, 2);
  assert.ok(sent[1].drawing.guess[0][0]);
  duel.applyAction(room, 0, { type: "submit", drawing: sent[1].drawing }, 5000);
  act(() =>
    rendered.update(
      React.createElement(DuelBoard, { ...duelProps(room), syncDrawing }),
    ),
  );
  assert.equal(sent[1].signal.aborted, true);
  act(() => rendered.unmount());
});

test("Try game shows its target, keeps the drawing between tabs and celebrates the exact solution", async () => {
  const Guide = await component(
    "src/components/HowToPlayModal.jsx",
    "HowToPlayModal",
  );
  const props = { onClose() {}, pieces: buildPieces(42, "compact", false) };
  let rendered = mount(Guide, props);
  try {
    assert.ok(text(rendered.root).includes("Explore laser paths"));
    act(() => button(rendered, "Try game").props.onClick());
    assert.ok(
      text(
        rendered.root.findByProps({ className: "tutorial-target" }),
      ).includes("red triangle"),
    );
    const board = () =>
      rendered.root
        .findByProps({ hidden: false })
        .findAll(
          (n) => typeof n.type === "function" && n.type.name === "GameBoard",
        )[0];
    act(() => board().props.onCell(1, 2));
    act(() => button(rendered, "Try lasers").props.onClick());
    act(() => button(rendered, "Try game").props.onClick());
    assert.deepEqual(board().props.guess[1][2], { color: "red", type: "\\" });
    act(() => board().props.onCell(1, 2));
    act(() => board().props.onCell(2, 1));
    act(() => board().props.onCell(2, 1));
    const solution = solutionDrawing(
      [
        {
          color: "red",
          absCells: [
            [1, 1, "\\f"],
            [1, 2, "/"],
            [2, 1, "/"],
          ],
        },
      ],
      4,
      3,
    );
    for (const edge of Object.keys(solution.edges))
      act(() => board().props.onEdge(edge));
    assert.equal(board().props.locked, true);
    assert.ok(rendered.root.findByProps({ "aria-label": "Good job!" }));
    assert.ok(text(rendered.root).includes("You are ready to play."));
    act(() => button(rendered, "Continue").props.onClick());
    act(() => rendered.unmount());
    rendered = mount(Guide, props);
    act(() => button(rendered, "Try game").props.onClick());
    assert.deepEqual(board().props.guess, emptyBoard(4, 3));
  } finally {
    act(() => rendered.unmount());
  }
});

const RaceResultDialog = await component(
  "src/components/RaceResultDialog.jsx",
  "RaceResultDialog",
);
test("race meters animate together, show incorrect as zero and reveal the verdict only when complete", async () => {
  let revealed = 0;
  const rendered = mount(RaceResultDialog, {
    players: [
      { name: "Robin", submission: { score: 4200, correct: true } },
      { name: "Sam", submission: { score: 0, correct: false } },
    ],
    title: "You won!",
    won: true,
    onReveal() {
      revealed++;
    },
    onClose() {},
    onNext() {},
    nextLabel: "Rematch",
  });
  try {
    assert.equal(
      rendered.root.findByType("dialog").props["aria-label"],
      "Counting points…",
    );
    assert.equal(text(rendered.root).includes("You won!"), false);
    assert.deepEqual(
      rendered.root
        .findAllByProps({ role: "progressbar" })
        .map((n) => n.props["aria-valuenow"]),
      [0, 0],
    );
    await act(
      async () => await new Promise((resolve) => setTimeout(resolve, 400)),
    );
    const interim = rendered.root
      .findAllByProps({ role: "progressbar" })
      .map((n) => n.props["aria-valuenow"]);
    assert.ok(interim[0] > 0 && interim[0] < 4200);
    assert.equal(interim[1], 0);
    assert.equal(revealed, 0);
    await act(
      async () => await new Promise((resolve) => setTimeout(resolve, 2750)),
    );
    assert.deepEqual(
      rendered.root
        .findAllByProps({ role: "progressbar" })
        .map((n) => n.props["aria-valuenow"]),
      [4200, 0],
    );
    assert.ok(revealed > 0);
    assert.ok(text(rendered.root).includes("Incorrect · 0 points"));
    assert.equal(
      rendered.root.findByType("dialog").props["aria-label"],
      "You won!",
    );
  } finally {
    act(() => rendered.unmount());
  }
});
