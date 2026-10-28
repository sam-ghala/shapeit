import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createSession, writeJSON, sessionKey } from "../src/game/storage.js";
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
function mount(type, props, nodeMock = () => ({ showModal() {}, close() {} })) {
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
