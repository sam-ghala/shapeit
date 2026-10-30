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
} from "../src/games/shapeit/game/storage.js";
import {
  buildPieces,
  generatePuzzle,
  solutionDrawing,
  emptyBoard,
} from "../src/games/shapeit/game/engine.js";
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
const SoloGame = await component(
  "src/games/shapeit/components/SoloGame.jsx",
  "SoloGame",
);
const GameBoard = await component(
  "src/games/shapeit/components/GameBoard.jsx",
  "GameBoard",
);
const QueryLog = await component(
  "src/games/shapeit/components/GameControls.jsx",
  "QueryLog",
);
const PieceList = await component(
  "src/games/shapeit/components/GameControls.jsx",
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
    "src/games/shapeit/components/ResultDialog.jsx",
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
  const App = await component("src/games/shapeit/ShapeIt.jsx", "default");
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
  const App = await component("src/games/shapeit/ShapeIt.jsx", "default");
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
    "src/games/shapeit/components/ResultDialog.jsx",
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
    "src/games/shapeit/components/HowToPlayModal.jsx",
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

const DuelBoard = await component(
  "src/games/shapeit/components/DuelGame.jsx",
  "DuelBoard",
);
const duel = await import("../src/games/shapeit/server/duel.js");
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
    room: duel.roomView(
      room,
      you,
      Math.max(
        4000,
        room.startedAt || 0,
        ...room.players.map((p) => p.submission?.at || 0),
      ),
    ),
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
    7000,
  );
  const draft = { guess: emptyBoard(7, 5), edges: { "h-0-0": "red" } };
  duel.applyAction(room, 1, { type: "draft", drawing: draft }, 7500);
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
  duel.applyAction(room, 0, { type: "laser", side: "top", idx: 0 }, 7000);
  duel.applyAction(room, 1, { type: "laser", side: "left", idx: 0 }, 7000);
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
    .findByProps({ "aria-label": "Choose player attempt" })
    .findAllByType("button");
  act(() => choices[1].props.onClick());
  assert.equal(choices[1].props["aria-pressed"], true);
  assert.deepEqual(duelBoard(rendered).props.revealed, room.players[0].placed);
  assert.deepEqual(duelBoard(rendered).props.edges, wrong.edges);
  const opponentLog = rendered.root.findAll(
    (n) => typeof n.type === "function" && n.type.name === "QueryLog",
  )[0];
  assert.equal(opponentLog.props.title, "Sam");
  assert.ok(opponentLog.props.history.every((q) => q.player === 1));
  act(() => opponentLog.props.onSelect(0));
  assert.equal(duelBoard(rendered).props.activeLaser.side, "left");
  assert.equal(duelBoard(rendered).props.queries[0].player, 1);
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
  const room = duelFixture("turns"),
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
    "src/games/shapeit/components/HowToPlayModal.jsx",
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
  "src/games/shapeit/components/RaceResultDialog.jsx",
  "RaceResultDialog",
);
test("race meters animate together, show incorrect as zero and reveal the verdict only when complete", async () => {
  let revealed = 0;
  const rendered = mount(RaceResultDialog, {
    players: [
      {
        name: "Robin",
        submission: { score: 4200, correct: true, queries: 8, seconds: 125 },
      },
      {
        name: "Sam",
        submission: { score: 0, correct: false, queries: 11, seconds: 183 },
      },
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
    assert.ok(text(rendered.root).includes("8 lasers2:05"));
    assert.ok(text(rendered.root).includes("11 lasers3:03"));
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

const AdminPage = await component(
  "src/platform/admin/AdminPage.jsx",
  "AdminPage",
);
test("admin lists distinct player IDs, searches names and requests activity for the selected player", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const events = [
    {
      id: "one",
      profileId: "player-one",
      name: "Sam",
      mode: "daily",
      size: "compact",
      kind: "finish",
      occurredAt: "2026-10-29T12:00:00Z",
    },
    {
      id: "two",
      profileId: "player-two",
      name: "Robin",
      mode: "training",
      size: "classic",
      kind: "abort",
      occurredAt: "2026-10-29T11:00:00Z",
    },
  ];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const player = new URL(url, "https://shapeit.test").searchParams.get(
      "player",
    );
    return Response.json({
      players: events.map((e) => ({
        profileId: e.profileId,
        name: e.name,
        games: 1,
        finishes: e.kind === "finish" ? 1 : 0,
        lastPlayed: e.occurredAt,
      })),
      events: events.filter((e) => !player || e.profileId === player),
    });
  };
  const rendered = mount(AdminPage, { onHome() {} });
  try {
    act(() =>
      rendered.root
        .findByProps({ type: "password" })
        .props.onChange({ target: { value: "Admin" } }),
    );
    await act(async () =>
      rendered.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
    const playerList = () =>
      rendered.root.findByProps({ className: "admin-player-list" });
    assert.equal(playerList().findAllByType("li").length, 2);
    act(() =>
      rendered.root
        .findByProps({ type: "search" })
        .props.onChange({ target: { value: "rob" } }),
    );
    assert.equal(playerList().findAllByType("li").length, 1);
    assert.ok(text(playerList()).includes("Robin"));
    await act(async () => {
      playerList()
        .findByProps({ className: "admin-player-select" })
        .props.onClick();
      await Promise.resolve();
    });
    assert.equal(calls.at(-1), "/api/admin/events?player=player-two");
    assert.equal(
      rendered.root.findByType("tbody").findAllByType("tr").length,
      1,
    );
    assert.ok(text(rendered.root.findByType("tbody")).includes("Robin"));
    await act(async () => {
      button(rendered, "All players").props.onClick();
      await Promise.resolve();
    });
    assert.equal(
      rendered.root.findByType("tbody").findAllByType("tr").length,
      2,
    );
    await act(async () =>
      rendered.root
        .findByType("select")
        .props.onChange({ target: { value: "pushit" } }),
    );
    assert.equal(calls.at(-1), "/api/admin/events?game=pushit");
    await act(async () =>
      playerList()
        .findByProps({ className: "admin-player-select" })
        .props.onClick(),
    );
    assert.equal(
      calls.at(-1),
      "/api/admin/events?player=player-two&game=pushit",
    );
    act(() => button(rendered, "Sign out").props.onClick());
    assert.ok(rendered.root.findByProps({ type: "password" }));
  } finally {
    act(() => rendered.unmount());
    globalThis.fetch = previousFetch;
  }
});

const DuelGame = await component(
  "src/games/shapeit/components/DuelGame.jsx",
  "DuelGame",
);
test("leave room works even while reconnecting and ignores a late server response", async () => {
  entries.clear();
  const previousFetch = globalThis.fetch;
  const previousHistory = window.history;
  const previousLocation = window.location;
  const requests = [];
  let resolvePoll,
    home = 0;
  window.history = { replaceState() {} };
  window.location = { origin: "https://shapeit.test" };
  writeJSON("shapeit:room", {
    code: "2468",
    token: "test-token",
    profileId: "host-test",
  });
  globalThis.fetch = (url, options) => {
    requests.push({ url, options });
    if (options.method === "GET")
      return new Promise((resolve) => {
        resolvePoll = resolve;
      });
    return Promise.resolve(Response.json({ room: { phase: "closed" } }));
  };
  const rendered = mount(DuelGame, {
    profile: { id: "host-test", name: "Robin" },
    onProfileChange() {},
    mobile: false,
    onHome() {
      home++;
    },
    effects: false,
  });
  try {
    assert.ok(text(rendered.root).includes("Reconnecting"));
    act(() => button(rendered, "Leave room").props.onClick());
    assert.equal(home, 1);
    assert.equal(readJSON("shapeit:room", "missing"), null);
    assert.equal(JSON.parse(requests.at(-1).options.body).type, "leave");
    await act(async () => {
      resolvePoll(Response.json({ room: duel.roomView(duelFixture(), 0) }));
      await Promise.resolve();
    });
    assert.ok(button(rendered, "Create room"));
    assert.equal(readJSON("shapeit:room", "missing"), null);
  } finally {
    act(() => rendered.unmount());
    globalThis.fetch = previousFetch;
    window.history = previousHistory;
    window.location = previousLocation;
  }
});

test("race countdown locks drawing, submission and shots, then releases them at the shared start time", async () => {
  entries.clear();
  const room = duelFixture("race");
  let actions = 0;
  const props = {
    ...duelProps(room),
    room: duel.roomView(room, 0, room.startedAt - 3000),
    action: async () => {
      actions++;
    },
  };
  const rendered = mount(DuelBoard, props);
  try {
    assert.ok(rendered.root.findByProps({ "aria-label": "Race starts in 3" }));
    assert.equal(duelBoard(rendered).props.newLaserLocked, true);
    assert.equal(duelBoard(rendered).props.locked, true);
    assert.equal(button(rendered, "Submit solution").props.disabled, true);
    act(() => duelBoard(rendered).props.onCell(0, 0));
    await act(async () => duelBoard(rendered).props.onLaser("top", 0));
    assert.equal(actions, 0);
    assert.equal(duelBoard(rendered).props.guess[0][0], null);
    act(() =>
      rendered.update(
        React.createElement(DuelBoard, {
          ...props,
          room: duel.roomView(room, 0, room.startedAt),
        }),
      ),
    );
    assert.equal(duelBoard(rendered).props.newLaserLocked, false);
    assert.equal(button(rendered, "Submit solution").props.disabled, false);
    const unused = Array.from({ length: 7 }, (_, idx) => idx).find(
      (idx) =>
        !duelBoard(rendered).props.queries.some(
          (q) =>
            (q.side === "top" && q.idx === idx) ||
            (q.exitSide === "top" && q.exitIdx === idx),
        ),
    );
    await act(async () => duelBoard(rendered).props.onLaser("top", unused));
    assert.equal(actions, 1);
  } finally {
    act(() => rendered.unmount());
  }
});

function eightPlayerFixture() {
  const room = duel.createRoom(
    "2468",
    { id: "group-host", name: "Robin" },
    true,
    { mode: "random" },
    1000,
  );
  for (let i = 1; i < 8; i++)
    duel.joinRoom(room, { id: `group-member-${i}`, name: `Player ${i}` }, true);
  duel.applyAction(room, 0, { type: "start" }, 2000);
  return room;
}
test("eight-player random race works for the last guest and reviews each player’s drawing and laser log", async () => {
  entries.clear();
  const room = eightPlayerFixture();
  for (let i = 0; i < 8; i++)
    duel.applyAction(
      room,
      i,
      { type: "laser", side: "left", idx: i % 5 },
      5000,
    );
  const props = duelProps(room, 7);
  let actions = 0;
  const rendered = mount(DuelBoard, {
    ...props,
    action: async () => {
      actions++;
    },
  });
  try {
    assert.equal(duelBoard(rendered).props.locked, false);
    assert.equal(duelBoard(rendered).props.revealed, null);
    assert.equal(
      rendered.root.findAllByProps({ "aria-label": "Choose player attempt" })
        .length,
      0,
    );
    assert.equal(duelBoard(rendered).props.queries.length, 1);
    assert.equal(duelBoard(rendered).props.queries[0].player, 7);
    const unused = Array.from({ length: 7 }, (_, idx) => idx).find(
      (idx) =>
        !duelBoard(rendered).props.queries.some(
          (q) =>
            (q.side === "top" && q.idx === idx) ||
            (q.exitSide === "top" && q.exitIdx === idx),
        ),
    );
    await act(async () => duelBoard(rendered).props.onLaser("top", unused));
    assert.equal(actions, 1);
    for (let i = 0; i < 8; i++)
      duel.applyAction(
        room,
        i,
        {
          type: "submit",
          drawing:
            i === 3
              ? { guess: emptyBoard(7, 5), edges: { "v-0-3": "red" } }
              : solutionDrawing(room.players[i].placed, 7, 5),
        },
        125000 + i * 1000,
      );
    act(() =>
      rendered.update(React.createElement(DuelBoard, duelProps(room, 7))),
    );
    act(() => rendered.root.findByType("dialog").props.onCancel());
    const buttons = rendered.root
      .findByProps({ "aria-label": "Choose player attempt" })
      .findAllByType("button");
    assert.equal(buttons.length, 8);
    act(() => buttons[3].props.onClick());
    assert.deepEqual(duelBoard(rendered).props.edges, { "v-0-3": "red" });
    const logs = rendered.root.findAll(
      (n) => typeof n.type === "function" && n.type.name === "QueryLog",
    );
    assert.equal(logs.length, 1);
    assert.equal(logs[0].props.title, "Player 3");
    assert.ok(logs[0].props.history.every((q) => q.player === 3));
    act(() => logs[0].props.onSelect(0));
    assert.equal(duelBoard(rendered).props.activeLaser.side, "left");
    assert.equal(duelBoard(rendered).props.activeLaser.idx, 3);
    assert.equal(duelBoard(rendered).props.queries[0].player, 3);
    act(() => buttons[7].props.onClick());
    assert.equal(duelBoard(rendered).props.queries[0].player, 7);
    assert.deepEqual(
      duelBoard(rendered).props.edges,
      room.players[7].submission.drawing.edges,
    );
  } finally {
    act(() => rendered.unmount());
  }
});
test("group race results rank every player and keep incorrect attempts at zero", () => {
  const players = Array.from({ length: 8 }, (_, i) => ({
    name: `Player ${i}`,
    you: i === 7,
    playerIndex: i,
    winner: i === 6,
    submission: {
      correct: i !== 0,
      score: i === 0 ? 0 : i === 6 ? 6000 : 1000,
      seconds: 120,
      queries: 10,
    },
  }));
  const rendered = mount(RaceResultDialog, {
    players,
    title: "Player 6 wins",
    won: false,
    animate: false,
    onReveal() {},
    onClose() {},
    onNext() {},
    nextLabel: "Rematch",
  });
  try {
    assert.equal(
      rendered.root.findAllByProps({ role: "progressbar" }).length,
      8,
    );
    assert.equal(text(rendered.root.findAllByType("h3")[0]), "1Player 6");
    assert.ok(text(rendered.root).includes("Incorrect · 0 points"));
    assert.ok(text(rendered.root).includes("You"));
  } finally {
    act(() => rendered.unmount());
  }
});

test("admin hides cached starts and confirms player-wide deletion, including error and retry", async () => {
  const previousFetch = globalThis.fetch,
    calls = [];
  let removed = false,
    fail = true;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") {
      if (fail)
        return Response.json({ error: "Delete failed" }, { status: 500 });
      removed = true;
      return Response.json({ ok: true, deleted: 4 });
    }
    return Response.json({
      players: removed
        ? []
        : [
            {
              profileId: "delete-ui-player",
              name: "Sam",
              games: 1,
              finishes: 1,
              aborts: 0,
              lastPlayed: "2026-10-30T10:00:00Z",
            },
          ],
      events: removed
        ? []
        : [
            {
              id: "start",
              kind: "start",
              profileId: "delete-ui-player",
              name: "Sam",
            },
            {
              id: "finish",
              kind: "finish",
              profileId: "delete-ui-player",
              name: "Sam",
              mode: "daily",
              size: "compact",
              occurredAt: "2026-10-30T10:00:00Z",
            },
          ],
    });
  };
  const view = mount(AdminPage, { onHome() {} });
  try {
    act(() =>
      view.root
        .findByProps({ type: "password" })
        .props.onChange({ target: { value: "Admin" } }),
    );
    await act(async () =>
      view.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
    assert.equal(view.root.findByType("tbody").findAllByType("tr").length, 1);
    const trash = () =>
      view.root.findByProps({ "aria-label": "Delete all events for Sam" });
    act(() => trash().props.onClick());
    assert.equal(calls.filter((c) => c.options.method === "POST").length, 0);
    act(() => button(view, "Cancel").props.onClick());
    assert.equal(view.root.findAllByType("dialog").length, 0);
    act(() => trash().props.onClick());
    await act(async () => button(view, "Delete all events").props.onClick());
    assert.ok(view.root.findByType("dialog"));
    assert.ok(text(view.root).includes("Delete failed"));
    assert.equal(removed, false);
    fail = false;
    await act(async () => button(view, "Delete all events").props.onClick());
    const deletion = calls.find((c) => c.options.method === "POST");
    assert.equal(deletion.url, "/api/admin/events/delete-player");
    assert.equal(deletion.options.headers.Authorization, "Bearer Admin");
    assert.deepEqual(JSON.parse(deletion.options.body), {
      profileId: "delete-ui-player",
    });
    assert.equal(view.root.findAllByType("dialog").length, 0);
    assert.equal(
      view.root
        .findByProps({ className: "admin-player-list" })
        .findAllByType("li").length,
      0,
    );
    assert.equal(view.root.findByType("tbody").findAllByType("tr").length, 0);
  } finally {
    act(() => view.unmount());
    globalThis.fetch = previousFetch;
  }
});
