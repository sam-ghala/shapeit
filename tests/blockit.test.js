import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  legalMoves,
  play,
  wallError,
  hasPath,
  restoreGame,
  opposite,
} from "../src/games/blockit/engine.js";
import {
  createSession,
  playSession,
  undoSession,
  restoreSession,
} from "../src/games/blockit/session.js";
const wall = (row, col, orientation = "h", color = "white") => ({
  row,
  col,
  orientation,
  color,
});
const position = (white, black, walls = []) => ({
  ...createGame(),
  pawns: { white, black },
  walls,
});
const sorted = (value) => [...value].sort((a, b) => a - b);

test("BlockIt begins with 81 squares, opposite central pawns, ten walls each and either starter", () => {
  for (const color of ["white", "black"]) {
    const game = createGame(color);
    assert.deepEqual(game.pawns, { white: 76, black: 4 });
    assert.deepEqual(game.remaining, { white: 10, black: 10 });
    assert.equal(game.current, color);
    assert.deepEqual(
      sorted(legalMoves(game)),
      color === "white" ? [67, 75, 77] : [3, 5, 13],
    );
    assert.deepEqual(restoreGame(game), game);
  }
});
test("pawns move orthogonally, cannot wrap rows, cross walls or move onto the opponent", () => {
  const game = position(9, 10, [wall(0, 0), wall(1, 0, "v")]);
  assert.deepEqual(legalMoves(game), [18]);
  assert.throws(() => play(game, { type: "move", to: 8 }));
  assert.throws(() => play(game, { type: "move", to: 10 }));
  assert.deepEqual(sorted(legalMoves(position(40, 4))), [31, 39, 41, 49]);
});
test("straight jumps work in all four directions without enabling diagonal alternatives", () => {
  for (const [enemy, target, diagonals] of [
    [31, 22, [30, 32]],
    [49, 58, [48, 50]],
    [39, 38, [30, 48]],
    [41, 42, [32, 50]],
  ]) {
    const moves = legalMoves(position(40, enemy));
    assert.ok(moves.includes(target));
    assert.ok(!moves.includes(enemy));
    assert.ok(diagonals.every((cell) => !moves.includes(cell)));
  }
});
test("blocked jumps allow unblocked diagonal steps, never through walls", () => {
  const game = position(40, 31, [wall(2, 3)]);
  assert.deepEqual(sorted(legalMoves(game)), [30, 32, 39, 41, 49]);
  game.walls.push(wall(2, 3, "v"));
  assert.ok(!legalMoves(game).includes(30));
  assert.ok(legalMoves(game).includes(32));
  // A wall between the pawns prevents both jumping and diagonal detours.
  game.walls = [wall(3, 4)];
  assert.deepEqual(sorted(legalMoves(game)), [39, 41, 49]);
  const sideways = position(40, 41, [wall(4, 5, "v")]);
  assert.ok(legalMoves(sideways).includes(32));
  assert.ok(legalMoves(sideways).includes(50));
});
test("the board edge also permits diagonal steps around an adjacent pawn", () => {
  assert.deepEqual(sorted(legalMoves(position(13, 4))), [3, 5, 12, 14, 22]);
  assert.deepEqual(sorted(legalMoves(position(37, 36))), [27, 28, 38, 45, 46]);
});
test("wall placement blocks exactly two edges, spends one wall, changes turns and preserves the old board", () => {
  const game = createGame(),
    before = structuredClone(game);
  const next = play(game, { type: "wall", ...wall(7, 3) });
  assert.deepEqual(game, before);
  assert.equal(next.remaining.white, 9);
  assert.equal(next.remaining.black, 10);
  assert.equal(next.current, "black");
  assert.ok(!legalMoves(next, "white").includes(67));
  assert.deepEqual(next.lastAction, { type: "wall", ...wall(7, 3), turn: 1 });
  assert.deepEqual(restoreGame(next), next);
});
test("walls cannot overlap or cross; end-to-end and offset walls remain valid", () => {
  const game = play(createGame(), { type: "wall", ...wall(3, 3) });
  for (const candidate of [wall(3, 2), wall(3, 3), wall(3, 4), wall(3, 3, "v")])
    assert.match(wallError(game, candidate), /overlap or cross/);
  for (const candidate of [wall(3, 1), wall(3, 5), wall(2, 3), wall(2, 3, "v")])
    assert.equal(wallError(game, candidate), "");
  const vertical = play(createGame(), { type: "wall", ...wall(3, 3, "v") });
  assert.match(wallError(vertical, wall(4, 3, "v")), /overlap/);
  assert.equal(wallError(vertical, wall(5, 3, "v")), "");
  for (const candidate of [
    wall(-1, 0),
    wall(0, 8),
    wall(0.5, 0),
    wall(0, 0, "diagonal"),
    null,
  ])
    assert.match(wallError(game, candidate), /slot/);
});
test("walls must preserve both players' paths, with pawn occupancy ignored for reachability", () => {
  const barrier = [0, 2, 4, 6].map((col) => wall(0, col));
  barrier.push(wall(1, 7));
  for (const pawns of [
    { white: 76, black: 22 },
    { white: 76, black: 4 },
  ]) {
    const game = { ...createGame(), pawns, walls: barrier };
    assert.ok(hasPath(game, "white"));
    assert.match(wallError(game, wall(0, 7, "v")), /Both players/);
    assert.throws(
      () => play(game, { type: "wall", ...wall(0, 7, "v") }),
      /Both players/,
    );
  }
  const blackOnly = {
    ...createGame(),
    pawns: { white: 8, black: 4 },
    walls: barrier,
  };
  assert.match(wallError(blackOnly, wall(0, 7, "v")), /Both players/);
  const adjacent = position(13, 4);
  assert.ok(hasPath(adjacent, "white"));
});
test("empty wall banks reject wall placement but still permit pawn moves", () => {
  const game = createGame();
  game.remaining.white = 0;
  assert.match(wallError(game, wall(0, 0)), /no walls/);
  assert.throws(() => play(game, { type: "wall", ...wall(0, 0) }), /no walls/);
  assert.equal(play(game, { type: "move", to: 67 }).pawns.white, 67);
});
test("reaching any goal square wins immediately; resignation awards the opponent", () => {
  for (const color of ["white", "black"])
    for (let col = 0; col < 9; col++) {
      const game = {
        ...createGame(color),
        pawns: { white: 9 + col, black: 63 + col },
      };
      const to = color === "white" ? col : 72 + col;
      const next = play(game, { type: "move", to });
      assert.equal(next.winner, color);
      assert.equal(next.reason, "goal");
      assert.deepEqual(legalMoves(next), []);
      assert.throws(() => play(next, { type: "resign" }), /over/);
      assert.deepEqual(restoreGame(next), next);
    }
  assert.equal(play(createGame(), { type: "resign" }).winner, "black");
});
test("restoration rejects corrupt pawns, walls, inventory, results and last actions", () => {
  const game = play(createGame(), { type: "move", to: 67 });
  for (const corrupt of [
    (g) => (g.pawns.white = 81),
    (g) => (g.pawns.white = g.pawns.black),
    (g) => (g.remaining.white = 11),
    (g) => (g.turn = 1.5),
    (g) => (g.current = "red"),
    (g) => (g.starter = "red"),
    (g) => (g.walls = [wall(0, 0), wall(0, 0, "v")]),
    (g) => (g.winner = "white"),
    (g) => (g.lastAction.to = 6),
    (g) => (g.lastAction = null),
  ]) {
    const next = structuredClone(game);
    corrupt(next);
    assert.equal(restoreGame(next), null);
  }
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(game))), game);
});
test("seeded games preserve both routes, wall inventories and restorable immutable states", () => {
  let seed = 435;
  const rand = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let match = 0; match < 12; match++) {
    let game = createGame(match % 2 ? "white" : "black");
    for (let step = 0; step < 160 && !game.winner; step++) {
      const prior = JSON.stringify(game),
        color = game.current;
      let action;
      for (let retry = 0; retry < 10 && rand(3) !== 0; retry++) {
        const candidate = wall(rand(8), rand(8), rand(2) ? "h" : "v");
        if (!wallError(game, candidate)) {
          action = { type: "wall", ...candidate };
          break;
        }
      }
      const moves = legalMoves(game);
      action ||= { type: "move", to: moves[rand(moves.length)] };
      const next = play(game, action);
      assert.equal(JSON.stringify(game), prior);
      assert.equal(next.current, opposite(color));
      for (const player of ["white", "black"]) {
        assert.ok(hasPath(next, player));
        assert.equal(
          next.remaining[player] +
            next.walls.filter((w) => w.color === player).length,
          10,
        );
      }
      assert.deepEqual(restoreGame(next), next);
      game = next;
    }
  }
});
test("local sessions save moves and walls, undo without altering history, and finalize once", () => {
  const start = createSession("block-test", 1000, "white");
  const moved = playSession(start, { type: "move", to: 67 }, 2000);
  const built = playSession(moved, { type: "wall", ...wall(3, 3) }, 3000);
  assert.deepEqual(restoreSession(JSON.parse(JSON.stringify(built))), built);
  assert.deepEqual(undoSession(built), moved);
  assert.equal(built.history.length, 2);
  assert.equal(undoSession(moved).game.lastAction, null);
  const ended = playSession(built, { type: "resign" }, 4000);
  assert.equal(ended.endedAt, 4000);
  assert.equal(undoSession(ended), ended);
  assert.equal(restoreSession({ ...ended, endedAt: 0 }), null);
  assert.equal(restoreSession({ ...built, history: [ended.game] }), null);
});
