import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_BOUNDS,
  CELLS,
  CELL_BY_ID,
  TILES,
  TILE_BY_ID,
  canExchange,
  createGame,
  isEnclosed,
  legalMoves,
  play,
  removableTile,
  restoreGame,
  validGame,
} from "../src/games/captureit/engine.js";

const piece = (id, cell) => ({
  id,
  cell,
  color: id[0] === "w" ? "white" : "black",
});
const position = (pieces, options = {}) => ({
  ...createGame(),
  tiles: [...new Set(pieces.map((p) => CELL_BY_ID[p.cell].tile))],
  pieces,
  ...options,
});
const move = (from, to) => ({ type: "move", from, to });

test("CaptureIt starts in the rulebook's 19-tile Laurentius position, with White first", () => {
  const game = createGame();
  assert.equal(game.current, "white");
  assert.equal(game.tiles.length, 19);
  assert.equal(CELLS.length, 114);
  assert.ok(validGame(game));
  assert.equal(new Set(game.pieces.map((p) => p.cell)).size, 36);
  for (const color of ["white", "black"]) {
    assert.equal(game.pieces.filter((p) => p.color === color).length, 18);
    assert.ok(
      game.pieces
        .filter((p) => p.color === color)
        .every((p) => CELL_BY_ID[p.cell].color === color),
    );
  }
  assert.deepEqual(
    game.pieces
      .filter((p) => p.color === "white")
      .map((p) => p.cell)
      .sort(),
    [
      "0,-2:3",
      "0,-2:5",
      "-1,-1:5",
      "1,-2:3",
      "0,-1:3",
      "0,-1:5",
      "2,0:5",
      "2,0:1",
      "2,-1:1",
      "1,1:5",
      "1,0:5",
      "1,0:1",
      "-2,2:1",
      "-2,2:3",
      "-1,2:3",
      "-2,1:1",
      "-1,1:1",
      "-1,1:3",
    ].sort(),
  );
  for (const white of game.pieces.filter((p) => p.color === "white")) {
    const cell = CELL_BY_ID[white.cell];
    assert.ok(
      game.pieces.some(
        (p) =>
          p.color === "black" &&
          Math.abs(CELL_BY_ID[p.cell].x + cell.x) < 1e-10 &&
          Math.abs(CELL_BY_ID[p.cell].y + cell.y) < 1e-10,
      ),
    );
  }
});

test("geometry has six corner-adjacent moves and three edge-adjacent enclosure fields", () => {
  for (const cell of CELLS) {
    assert.equal(cell.points.length, 3);
    assert.equal(cell.neighbors.length, 3);
    assert.ok(cell.moves.length <= 6);
    for (const id of cell.moves) {
      const other = CELL_BY_ID[id];
      assert.equal(other.color, cell.color);
      assert.ok(other.moves.includes(cell.id));
      assert.equal(
        other.vertices.filter((vertex) => cell.vertices.includes(vertex))
          .length,
        1,
      );
    }
    for (const id of cell.neighbors.filter(Boolean)) {
      assert.notEqual(CELL_BY_ID[id].color, cell.color);
      assert.ok(CELL_BY_ID[id].neighbors.includes(cell.id));
    }
    for (const [x, y] of cell.points) {
      assert.ok(
        x >= BOARD_BOUNDS.x && x <= BOARD_BOUNDS.x + BOARD_BOUNDS.width,
      );
      assert.ok(
        y >= BOARD_BOUNDS.y - 1e-10 &&
          y <= BOARD_BOUNDS.y + BOARD_BOUNDS.height + 1e-10,
      );
    }
  }
  assert.equal(CELL_BY_ID["0,0:1"].moves.length, 6);
  assert.deepEqual(CELL_BY_ID["0,0:0"].neighbors, ["0,0:5", "1,0:3", "0,0:1"]);
  assert.equal(
    TILES.filter((tile) => tile.neighbors.filter(Boolean).length === 6).length,
    7,
  );
});

test("moves use empty neighboring fields, retain input state, and alternate exactly once", () => {
  const game = createGame();
  const from = "0,-1:3";
  const before = JSON.stringify(game);
  assert.ok(legalMoves(game, from).includes("0,-1:1"));
  assert.deepEqual(legalMoves(game, "0,2:0"), []);
  assert.deepEqual(legalMoves(game, "missing"), []);
  assert.ok(
    !legalMoves(game, from).includes("0,-1:5"),
    "occupied fields are unavailable",
  );
  assert.throws(
    () => play(game, move(from, "0,-1:4")),
    /empty neighboring field/,
  );
  assert.throws(
    () => play(game, move(from, "-2,2:5")),
    /empty neighboring field/,
  );
  assert.throws(() => play(game, { type: "pass" }), /Passing is not allowed/);
  const next = play(game, move(from, "0,-1:1"));
  assert.equal(next.current, "black");
  assert.equal(next.turn, 2);
  assert.equal(JSON.stringify(game), before);
  assert.ok(validGame(next));
  assert.equal(next.lastAction.from, from);
  assert.equal(next.log.length, 1);
});

test("removed tiles cannot be destinations; remaining corner neighbors stay reachable", () => {
  const game = position([piece("w1", "0,0:1"), piece("b1", "0,0:0")]);
  assert.deepEqual(legalMoves(game, "0,0:1").sort(), ["0,0:3", "0,0:5"]);
  assert.throws(
    () => play(game, move("0,0:1", "0,1:3")),
    /empty neighboring field/,
  );
});

test("three edge neighbors capture an interior opponent; a board edge supplies a missing side", () => {
  const interior = position([
    piece("b1", "0,0:0"),
    piece("b2", "1,0:0"),
    piece("w1", "0,0:5"),
    piece("w2", "1,0:3"),
    piece("w3", "0,0:3"),
  ]);
  assert.equal(isEnclosed(interior, "0,0:0"), false);
  const next = play(interior, move("0,0:3", "0,0:1"));
  assert.deepEqual(
    next.lastAction.captured.map((p) => p.id),
    ["b1"],
  );
  assert.equal(next.winner, null);
  assert.ok(next.pieces.some((p) => p.id === "b2"));

  const edge = position([
    piece("b1", "0,0:4"),
    piece("b2", "0,0:0"),
    piece("w1", "0,0:3"),
    piece("w2", "0,0:1"),
  ]);
  const edgeNext = play(edge, move("0,0:1", "0,0:5"));
  assert.deepEqual(
    edgeNext.lastAction.captured.map((p) => p.id),
    ["b1"],
  );
  assert.equal(edgeNext.collected.white, 0);
});

test("one move can capture multiple opponents simultaneously", () => {
  const game = position([
    piece("b1", "0,0:0"),
    piece("b2", "0,0:2"),
    piece("b3", "0,1:0"),
    piece("w1", "0,0:3"),
    piece("w2", "0,0:5"),
    piece("w3", "1,0:3"),
    piece("w4", "-1,1:5"),
    piece("w5", "0,1:3"),
  ]);
  const next = play(game, move("0,1:3", "0,0:1"));
  assert.deepEqual(next.lastAction.captured.map((p) => p.id).sort(), [
    "b1",
    "b2",
  ]);
});

test("moving into enclosure is neutral, and an unrelated opponent turn preserves it", () => {
  const game = position([
    piece("w1", "0,0:1"),
    piece("w2", "1,-1:5"),
    piece("b1", "0,0:0"),
    piece("b2", "0,0:4"),
    piece("b3", "1,-1:2"),
    piece("b4", "1,-1:0"),
  ]);
  const neutral = play(game, move("0,0:1", "0,0:5"));
  assert.equal(isEnclosed(neutral, "0,0:5"), true);
  assert.ok(neutral.pieces.some((p) => p.id === "w1"));
  const unrelated = play(neutral, move("1,-1:0", "1,-1:4"));
  assert.ok(unrelated.pieces.some((p) => p.id === "w1"));
  assert.equal(unrelated.lastAction.captured.length, 0);
});

test("a neutral opponent can be captured after its enclosure is opened and made anew", () => {
  const game = position(
    [
      piece("w1", "0,0:5"),
      piece("w2", "1,-1:5"),
      piece("b1", "0,0:0"),
      piece("b2", "0,0:4"),
      piece("b3", "1,-1:2"),
    ],
    { current: "black" },
  );
  assert.equal(isEnclosed(game, "0,0:5"), true);
  const opened = play(game, move("0,0:4", "0,0:2"));
  assert.equal(isEnclosed(opened, "0,0:5"), false);
  const white = play(opened, move("1,-1:5", "1,-1:3"));
  const closed = play(white, move("0,0:2", "0,0:4"));
  assert.ok(!closed.pieces.some((p) => p.id === "w1"));
  assert.deepEqual(
    closed.lastAction.captured.map((p) => p.id),
    ["w1"],
  );
});

test("moving away and then removing that tile creates a new enclosure within one turn", () => {
  const game = position([
    piece("b1", "0,0:0"),
    piece("b2", "0,1:0"),
    piece("w1", "0,0:1"),
    piece("w2", "0,0:5"),
    piece("w3", "1,0:3"),
  ]);
  assert.equal(isEnclosed(game, "0,0:0"), true);
  const next = play(game, move("1,0:3", "0,1:5"));
  assert.deepEqual(next.lastAction.collected, ["1,0"]);
  assert.deepEqual(
    next.lastAction.captured.map((p) => p.id),
    ["b1"],
  );
});

test("only empty tiles with one circular run of at most three neighbors are removable", () => {
  const around = TILE_BY_ID["0,0"].neighbors;
  for (const [indices, expected] of [
    [[], true],
    [[0], true],
    [[0, 1], true],
    [[5, 0], true],
    [[0, 1, 2], true],
    [[5, 0, 1], true],
    [[0, 2], false],
    [[0, 3], false],
    [[0, 1, 3], false],
    [[0, 2, 4], false],
    [[0, 1, 2, 3], false],
    [[0, 1, 2, 3, 4, 5], false],
  ]) {
    const game = position([], {
      tiles: ["0,0", ...indices.map((i) => around[i])],
    });
    assert.equal(
      removableTile(game, "0,0"),
      expected,
      `neighbor sides ${indices}`,
    );
    game.pieces.push(piece("w1", "0,0:1"));
    assert.equal(removableTile(game, "0,0"), false, "occupied tiles remain");
  }
});

test("moving off a tile collects that tile and recursively exposed empty tiles", () => {
  const game = position(
    [
      piece("w1", "1,0:3"),
      piece("b1", "0,1:0"),
      piece("b2", "-1,1:0"),
      piece("b3", "-1,0:0"),
    ],
    { tiles: ["0,0", "1,0", "0,1", "-1,1", "-1,0"] },
  );
  assert.equal(removableTile(game, "0,0"), false);
  const next = play(game, move("1,0:3", "0,1:5"));
  assert.deepEqual(next.lastAction.collected, ["1,0", "0,0"]);
  assert.equal(next.collected.white, 2);
  assert.deepEqual(next.lastAction.discarded, []);
  assert.ok(validGame(next));
});

test("tile removals recalculate connectivity after each removal instead of deleting a batch", () => {
  const game = position(
    [piece("w1", "-2,0:1"), piece("b1", "-2,1:0"), piece("b2", "-1,-1:0")],
    { tiles: ["-1,0", "-2,0", "-2,1", "-1,-1"] },
  );
  assert.equal(removableTile(game, "-1,0"), true);
  const next = play(game, move("-2,0:1", "-2,1:5"));
  assert.deepEqual(next.lastAction.collected, ["-2,0"]);
  assert.ok(
    next.tiles.includes("-1,0"),
    "the vacated source is removed first, preserving the resulting bridge",
  );
  assert.equal(removableTile(next, "-1,0"), false);
});

test("tile exchanges cost exactly two, discard emptied tiles, and can cause further captures", () => {
  const game = position(
    [
      piece("b1", "1,0:0"),
      piece("b2", "0,1:4"),
      piece("b3", "-1,1:0"),
      piece("b4", "-1,0:0"),
      piece("w1", "0,1:3"),
      piece("w2", "0,1:5"),
    ],
    {
      tiles: ["0,0", "1,0", "0,1", "-1,1", "-1,0"],
      collected: { white: 3, black: 1 },
    },
  );
  const before = JSON.stringify(game);
  assert.ok(canExchange(game));
  assert.throws(
    () =>
      play(
        { ...game, collected: { white: 1, black: 0 } },
        { type: "exchange", target: "1,0:0" },
      ),
    /two tiles/,
  );
  assert.throws(
    () => play(game, { type: "exchange", target: "0,1:3" }),
    /opponent/,
  );
  const next = play(game, { type: "exchange", target: "1,0:0" });
  assert.equal(JSON.stringify(game), before);
  assert.deepEqual(next.collected, { white: 1, black: 1 });
  assert.deepEqual(next.lastAction.collected, []);
  assert.deepEqual(next.lastAction.discarded, ["1,0", "0,0"]);
  assert.deepEqual(
    next.lastAction.captured.map((p) => p.id),
    ["b1", "b2"],
  );
  assert.deepEqual(
    next.pieces.filter((p) => p.color === "white"),
    game.pieces.filter((p) => p.color === "white"),
  );
  assert.equal(next.current, "black");
  assert.equal(next.turn, 2);
  assert.ok(validGame(next));
});

test("last capture wins immediately; resignation awards the opponent and closes play", () => {
  const game = position([
    piece("b1", "0,0:4"),
    piece("w1", "0,0:3"),
    piece("w2", "0,0:1"),
  ]);
  const won = play(game, move("0,0:1", "0,0:5"));
  assert.equal(won.winner, "white");
  assert.equal(won.reason, "capture");
  assert.equal(won.current, "white");
  assert.ok(validGame(won));
  assert.deepEqual(legalMoves(won, "0,0:3"), []);
  assert.equal(canExchange(won), false);
  assert.throws(() => play(won, { type: "resign" }), /finished/);
  const resigned = play(createGame(), { type: "resign" });
  assert.equal(resigned.winner, "black");
  assert.equal(resigned.reason, "resignation");
  assert.ok(validGame(resigned));
});

test("saved games round-trip independently and reject malformed or impossible state", () => {
  const game = play(createGame(), move("0,-1:3", "0,-1:1"));
  const saved = restoreGame(JSON.stringify(game));
  assert.deepEqual(saved, game);
  assert.notEqual(saved.pieces, game.pieces);
  saved.pieces[0].cell = "invalid";
  assert.ok(validGame(game));
  const corruptions = [
    null,
    {},
    "not JSON",
    { ...game, version: 2 },
    { ...game, current: "red" },
    { ...game, turn: NaN },
    { ...game, turn: 0 },
    { ...game, tiles: ["__proto__"] },
    { ...game, tiles: ["constructor"] },
    { ...game, tiles: [...game.tiles, game.tiles[0]] },
    { ...game, pieces: [...game.pieces, game.pieces[0]] },
    { ...game, pieces: [{ ...game.pieces[0], cell: "0,0:0" }] },
    { ...game, pieces: [{ ...game.pieces[0], id: "w19" }] },
    { ...game, pieces: [{ ...game.pieces[0], cell: "__proto__" }] },
    { ...game, tiles: ["0,0"] },
    { ...game, collected: { white: 20, black: 0 } },
    { ...game, collected: { white: -1, black: 0 } },
    { ...game, collected: { white: 0.5, black: 0 } },
    { ...game, log: [null] },
    { ...game, lastAction: { type: "move" } },
    { ...game, winner: "white", reason: "capture" },
    { ...game, winner: null, reason: "resignation" },
  ];
  for (const corrupted of corruptions)
    assert.equal(restoreGame(corrupted), null);
});

test("saved coordinates cannot resolve inherited object names or coerced array keys", () => {
  assert.equal(Object.getPrototypeOf(CELL_BY_ID), null);
  assert.equal(Object.getPrototypeOf(TILE_BY_ID), null);
  const game = createGame();
  for (const name of ["__proto__", "constructor", "toString", "valueOf"]) {
    assert.equal(CELL_BY_ID[name], undefined);
    assert.equal(TILE_BY_ID[name], undefined);
    // Replace the unoccupied central tile without disturbing any pieces. The
    // only invalid part is the tile name, so other validation cannot mask it.
    assert.equal(
      restoreGame({
        ...game,
        tiles: game.tiles.map((id) => (id === "0,0" ? name : id)),
      }),
      null,
    );
    assert.equal(
      restoreGame({
        ...game,
        pieces: game.pieces.map((p, i) => (i ? p : { ...p, cell: name })),
      }),
      null,
    );
  }
  assert.equal(
    restoreGame({
      ...game,
      tiles: game.tiles.map((id) => (id === "0,0" ? [id] : id)),
    }),
    null,
  );
  assert.equal(
    restoreGame({
      ...game,
      pieces: game.pieces.map((p, i) => (i ? p : { ...p, cell: [p.cell] })),
    }),
    null,
  );
});

test("legal play preserves identities, connected tiles, valid saves, and tile accounting", () => {
  let seed = 41;
  const random = (length) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % length;
  };
  for (let run = 0; run < 8; run++) {
    let game = createGame();
    let spent = 0;
    let discarded = 0;
    for (let step = 0; step < 120 && !game.winner; step++) {
      const actions = game.pieces.flatMap((p) =>
        legalMoves(game, p.cell).map((to) => move(p.cell, to)),
      );
      if (canExchange(game))
        actions.push(
          ...game.pieces
            .filter((p) => p.color !== game.current)
            .map((p) => ({ type: "exchange", target: p.cell })),
        );
      if (!actions.length) break;
      const action = actions[random(actions.length)];
      game = play(game, action);
      if (action.type === "exchange") spent += 2;
      discarded += game.lastAction.discarded.length;
      assert.ok(validGame(game));
      assert.equal(
        game.tiles.length +
          game.collected.white +
          game.collected.black +
          spent +
          discarded,
        19,
      );
      const seen = new Set([game.tiles[0]]);
      const pending = [...seen];
      while (pending.length) {
        for (const id of TILE_BY_ID[pending.pop()].neighbors) {
          if (game.tiles.includes(id) && !seen.has(id)) {
            seen.add(id);
            pending.push(id);
          }
        }
      }
      assert.equal(seen.size, game.tiles.length);
    }
  }
});
