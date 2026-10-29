import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  createGame,
  forwardMove,
  validGame,
} from "../src/pushit/engine.js";
import {
  applyPushAction,
  createPushRoom,
  joinPushRoom,
  pushRoomView,
} from "../src/pushit/rooms.js";

const profile = (id) => ({ id: `pushit-player-${id}`, name: `Player ${id}` });
const piece = (id, x, y, facing) => ({
  id,
  color: id[0] === "b" ? "black" : "white",
  x,
  y,
  facing,
});
const position = (pieces, used = 0) => ({ ...createGame(), pieces, used });
const action = (type, pieceId = "b1") => ({ type, pieceId });

test("PushIt uses the exact six-piece setup and permits either starting color", () => {
  const game = createGame("white");
  assert.equal(game.current, "white");
  assert.deepEqual(
    game.pieces.map((p) => [p.id, p.x, p.y, p.facing]),
    [
      ["b1", 0, 0, 2],
      ["b2", 1, 1, 2],
      ["b3", 3, 0, 2],
      ["w1", 0, 3, 0],
      ["w2", 2, 2, 0],
      ["w3", 3, 3, 0],
    ],
  );
  assert.ok(validGame(game));
  assert.throws(() => createGame("red"));
});

test("turns must contain exactly one or three actions, shared across any own pieces", () => {
  const initial = createGame();
  assert.throws(() => act(initial, { type: "end" }), /exactly one or three/);
  const one = act(initial, action("left"));
  assert.equal(one.pieces[0].facing, 1);
  assert.equal(
    initial.pieces[0].facing,
    2,
    "actions must not mutate earlier positions",
  );
  assert.equal(one.used, 1);
  const end = act(one, { type: "end" });
  assert.deepEqual([end.current, end.used, end.turn], ["white", 0, 2]);
  const two = act(one, action("right", "b2"));
  assert.equal(two.current, "black");
  assert.throws(() => act(two, { type: "end" }), /cannot stop after two/);
  const three = act(two, action("forward", "b3"));
  assert.deepEqual([three.current, three.used, three.turn], ["white", 0, 2]);
  assert.throws(() => act(initial, action("left", "w1")), /own pieces/);
  assert.throws(() => act(initial, action("teleport")), /Unknown action/);
});

test("a quarter-turn costs one action and a half-turn costs two", () => {
  let game = createGame();
  game = act(game, action("right"));
  game = act(game, action("right"));
  assert.equal(game.pieces[0].facing, 0);
  assert.equal(game.used, 2);
});

test("pushing moves the complete contiguous row one space without rotating pieces", () => {
  const game = position([
    piece("b1", 0, 1, 1),
    piece("w1", 1, 1, 0),
    piece("b2", 2, 1, 1),
    piece("w2", 3, 3, 0),
  ]);
  const move = forwardMove(game, "b1");
  assert.deepEqual(move.pushed, ["w1", "b2"]);
  const next = act(game, action("forward"));
  assert.deepEqual(
    next.pieces.map((p) => [p.x, p.y, p.facing]),
    [
      [1, 1, 1],
      [2, 1, 0],
      [3, 1, 1],
      [3, 3, 0],
    ],
  );
  assert.equal(next.used, 1);
  assert.equal(next.winner, null);
});

test("any front-facing piece in a push chain blocks the entire push, including friendly pieces", () => {
  for (const id of ["b2", "w2"]) {
    const game = position([
      piece("b1", 0, 1, 1),
      piece("w1", 1, 1, 0),
      piece(id, 2, 1, 3),
    ]);
    const before = JSON.stringify(game);
    assert.equal(forwardMove(game, "b1").legal, false);
    assert.throws(() => act(game, action("forward")), /faces you/);
    assert.equal(JSON.stringify(game), before);
  }
});

test("opponent ejection wins immediately on action one, two or three, in all four directions", () => {
  for (let facing = 0; facing < 4; facing++)
    for (const used of [0, 1, 2]) {
      const starts = [
        [1, 1, 1, 0],
        [2, 1, 3, 1],
        [1, 2, 1, 3],
        [1, 1, 0, 1],
      ];
      const [x, y, tx, ty] = starts[facing];
      const game = position(
        [piece("b1", x, y, facing), piece("w1", tx, ty, facing)],
        used,
      );
      const next = act(game, action("forward"));
      assert.equal(next.winner, "black");
      assert.equal(next.current, "black");
      assert.equal(next.pieces.length, 1);
      assert.equal(next.turn, game.turn);
      assert.throws(() => act(next, action("left")), /finished/);
    }
});

test("a piece cannot move itself off; friendly ejection does not award a win", () => {
  const edge = position([piece("b1", 0, 1, 3)]);
  assert.throws(() => act(edge, action("forward")), /cannot move itself off/);
  const friendly = position([
    piece("b1", 2, 1, 1),
    piece("b2", 3, 1, 1),
    piece("w1", 0, 0, 0),
  ]);
  const next = act(friendly, action("forward"));
  assert.equal(next.winner, null);
  assert.equal(next.pieces.length, 2);
  assert.equal(next.log.at(-1).removed, "black");
});

test("saved positions reject corrupt directions, overlapping pieces and invalid identities", () => {
  assert.equal(validGame(null), false);
  assert.equal(
    validGame({ ...createGame(), pieces: [piece("b1", 0, 0, 4)] }),
    false,
  );
  assert.equal(
    validGame({
      ...createGame(),
      pieces: [piece("b1", 0, 0, 0), piece("b2", 0, 0, 0)],
    }),
    false,
  );
  assert.equal(
    validGame({ ...createGame(), pieces: [piece("x1", 0, 0, 0)] }),
    false,
  );
});

function room() {
  const value = createPushRoom("0123", profile(1), "white", "black", 1000);
  joinPushRoom(value, profile(2));
  return value;
}
const send = (room, index, body) =>
  applyPushAction(room, index, { ...body, revision: room.revision });

test("private rooms assign opposite colors, hide all tokens and reject extra or duplicate players", () => {
  const r = createPushRoom("0123", profile(1));
  assert.equal(
    createPushRoom("0123", profile(1), "black", "black", 1000).expiresAt,
    7201000,
  );
  assert.throws(() => joinPushRoom(r, profile(1)), /different browser/);
  const token = joinPushRoom(r, profile(2));
  assert.equal(token, r.players[1].token);
  assert.deepEqual(
    r.players.map((p) => p.color),
    ["black", "white"],
  );
  assert.throws(() => joinPushRoom(r, profile(3)), /full/);
  const view = pushRoomView(r, 1);
  assert.equal(view.you, 1);
  for (const p of r.players) assert.ok(!JSON.stringify(view).includes(p.token));
});

test("the server enforces turns, revisions and action legality without changing rejected positions", () => {
  const r = room();
  assert.throws(() => send(r, 0, action("forward")), /opponent/);
  assert.throws(() => send(r, -1, action("left")), /access denied/);
  const revision = r.revision;
  send(r, 1, action("left"));
  const snapshot = JSON.stringify(r);
  assert.throws(
    () => applyPushAction(r, 1, { ...action("left"), revision }),
    /board changed/,
  );
  assert.equal(JSON.stringify(r), snapshot);
  send(r, 1, { type: "end" });
  assert.equal(r.game.current, "white");
});

test("wins count once; rematches and consensual resets require both players", () => {
  const r = room();
  r.game = position([piece("b1", 2, 1, 1), piece("w1", 3, 1, 1)]);
  send(r, 1, action("forward"));
  assert.equal(r.phase, "finished");
  assert.equal(r.wins.black, 1);
  assert.throws(() => send(r, 1, action("forward")), /Wait for/);
  send(r, 1, { type: "rematch" });
  assert.equal(r.phase, "finished");
  send(r, 0, { type: "rematch" });
  assert.equal(r.phase, "playing");
  assert.equal(r.round, 2);
  assert.equal(r.wins.black, 1);
  send(r, 0, { type: "reset" });
  assert.equal(r.round, 2);
  send(r, 1, { type: "reset" });
  assert.equal(r.round, 3);
  assert.equal(r.wins.black, 1);
  assert.deepEqual(r.game, createGame("black"));
});

test("leaving a room closes play without inventing a winner", () => {
  const r = room();
  send(r, 1, { type: "leave" });
  assert.equal(r.phase, "closed");
  assert.equal(r.left, "Player 2");
  assert.deepEqual(r.wins, { black: 0, white: 0 });
  assert.equal(r.game.winner, null);
  assert.throws(() => send(r, 0, action("forward")), /closed/);
});

test("many legal action sequences preserve board and turn invariants", () => {
  let seed = 47239;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let round = 0; round < 40; round++) {
    let game = createGame(round % 2 ? "white" : "black");
    for (let n = 0; n < 150 && !game.winner; n++) {
      const legal = game.pieces
        .filter((p) => p.color === game.current)
        .flatMap((p) => [
          action("left", p.id),
          action("right", p.id),
          ...(forwardMove(game, p.id).legal ? [action("forward", p.id)] : []),
        ]);
      if (game.used === 1) legal.push({ type: "end" });
      const next = act(game, legal[random() % legal.length]);
      assert.ok(validGame(next));
      if (next.current !== game.current)
        assert.ok(game.used === 1 || game.used === 2);
      assert.ok(next.log.length <= 90);
      game = next;
    }
  }
});
