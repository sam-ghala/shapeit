import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  createGame,
  forwardMove,
  validGame,
} from "../src/games/pushit/engine.js";
import {
  applyPushAction,
  createPushRoom,
  joinPushRoom,
  pushRoomView,
} from "../src/games/pushit/rooms.js";

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

const send = (room, index, body) =>
  applyPushAction(room, index, { ...body, revision: room.revision });
const actor = (r) => r.players.findIndex((p) => p.color === r.game.current);
function room(bestOf = 0) {
  const r = createPushRoom("0123", profile(1), 1000);
  joinPushRoom(r, profile(2));
  if (bestOf) send(r, 0, { type: "format", bestOf });
  send(r, 0, { type: "start" });
  return r;
}
function win(r, color) {
  const other = color === "black" ? "white" : "black";
  r.game = {
    ...createGame(color),
    pieces: [piece(`${color[0]}1`, 2, 1, 1), piece(`${other[0]}1`, 3, 1, 0)],
  };
  send(r, actor(r), action("forward", `${color[0]}1`));
}
const next = (r) => {
  send(r, 0, { type: "rematch" });
  send(r, 1, { type: "rematch" });
};

test("rooms require a name, begin in a lobby, and do not start on joining", () => {
  assert.throws(
    () => createPushRoom("1234", { id: "valid-player", name: "" }),
    /name/,
  );
  const r = createPushRoom("0123", profile(1), 1000);
  assert.equal(r.expiresAt, 7201000);
  assert.equal(r.phase, "lobby");
  assert.throws(() => send(r, 0, { type: "start" }), /both players/);
  assert.throws(() => joinPushRoom(r, profile(1)), /different browser/);
  joinPushRoom(r, profile(2));
  assert.equal(r.phase, "lobby");
  assert.throws(() => joinPushRoom(r, profile(3)), /full/);
  assert.throws(() => send(r, 1, { type: "start" }), /host/);
});

test("only the host can switch colors and set the odd series length", () => {
  const r = createPushRoom("0123", profile(1));
  send(r, 0, { type: "color", color: "white" });
  joinPushRoom(r, profile(2));
  assert.deepEqual(
    r.players.map((p) => p.color),
    ["white", "black"],
  );
  assert.throws(() => send(r, 1, { type: "color", color: "white" }), /host/);
  send(r, 0, { type: "color", color: "black" });
  assert.deepEqual(
    r.players.map((p) => p.color),
    ["black", "white"],
  );
  assert.throws(() => send(r, 1, { type: "format", bestOf: 3 }), /host/);
  for (const bestOf of [0, 3, 5, 7, 9, 15, 99]) {
    send(r, 0, { type: "format", bestOf });
    assert.equal(r.bestOf, bestOf);
  }
  for (const bestOf of [1, 2, 4, 100, 101, -3, "3"])
    assert.throws(() => send(r, 0, { type: "format", bestOf }));
  send(r, 0, { type: "start", starter: "forged" });
  assert.ok(["black", "white"].includes(r.starter));
  assert.equal(r.game.current, r.starter);
  assert.throws(() => send(r, 0, { type: "color", color: "white" }), /locked/);
  assert.throws(() => send(r, 0, { type: "format", bestOf: 0 }), /lobby/);
});

test("room views never expose credentials or undo snapshots and enforce turns and revisions", () => {
  const r = room();
  const index = actor(r),
    id = `${r.game.current[0]}1`;
  assert.throws(() => send(r, 1 - index, action("left", id)), /opponent/);
  assert.throws(() => send(r, -1, action("left", id)), /access denied/);
  const revision = r.revision;
  send(r, index, action("left", id));
  const snapshot = JSON.stringify(r);
  assert.throws(
    () => applyPushAction(r, index, { ...action("left", id), revision }),
    /board changed/,
  );
  assert.equal(JSON.stringify(r), snapshot);
  for (let i = 0; i < 2; i++) {
    const view = pushRoomView(r, i);
    assert.equal(view.you, i);
    assert.equal(view.canUndo, i === index);
    assert.equal(view.undoStack, undefined);
    for (const p of r.players)
      assert.ok(!JSON.stringify(view).includes(p.token));
  }
});

test("undo freezes play and requires the opponent's approval, including after the turn ends", () => {
  const r = room(),
    index = actor(r),
    id = `${r.game.current[0]}1`;
  const before = structuredClone(r.game);
  send(r, index, action("forward", id));
  const moved = structuredClone(r.game);
  send(r, index, { type: "undo" });
  assert.deepEqual(r.game, moved);
  assert.throws(
    () => send(r, index, { type: "undo-response", accept: true }),
    /opponent must approve/,
  );
  assert.throws(() => send(r, index, action("left", id)), /Resolve/);
  assert.throws(() => send(r, 1 - index, { type: "reset" }), /Resolve/);
  send(r, 1 - index, { type: "undo-response", accept: false });
  assert.deepEqual(r.game, moved);
  send(r, index, { type: "undo" });
  send(r, 1 - index, { type: "undo-response", accept: true });
  assert.deepEqual(r.game, before);
  assert.equal(r.undoRequest, null);
  send(r, index, action("left", id));
  send(r, index, { type: "end" });
  assert.equal(actor(r), 1 - index);
  send(r, index, { type: "undo" });
  send(r, 1 - index, { type: "undo-response", accept: true });
  assert.equal(actor(r), index);
  assert.equal(r.game.used, 1);
});

test("finished games cannot be undone, including the final round of a series", () => {
  const r = room(3);
  for (let round = 0; round < 2; round++) {
    win(r, "black");
    assert.equal(r.wins.black, round + 1);
    for (let i = 0; i < 2; i++) {
      assert.equal(pushRoomView(r, i).canUndo, false);
      assert.throws(() => send(r, i, { type: "undo" }), /latest move/);
      assert.throws(
        () => send(r, i, { type: "undo-response", accept: true }),
        /approve/,
      );
    }
    assert.equal(r.undoStack.length, 0);
    if (!round) next(r);
  }
  assert.equal(r.phase, "complete");
  assert.equal(r.matchWinner, "black");
});

test("free play keeps scores, alternates starters and waits for both rematch votes", () => {
  const r = room(),
    starter = r.starter;
  win(r, "black");
  assert.deepEqual(r.wins, { black: 1, white: 0 });
  send(r, 0, { type: "rematch" });
  assert.equal(r.phase, "finished");
  send(r, 1, { type: "rematch" });
  assert.equal(r.starter, starter === "black" ? "white" : "black");
  win(r, "black");
  next(r);
  win(r, "white");
  assert.deepEqual(r.wins, { black: 2, white: 1 });
  assert.equal(r.phase, "finished");
  next(r);
  assert.equal(r.round, 4);
  assert.equal(r.matchWinner, null);
});

test("best-of 3, 5, 7 and 15 return to the lobby before the host starts a fresh series", () => {
  for (const bestOf of [3, 5, 7, 15]) {
    const r = room(bestOf),
      target = (bestOf + 1) / 2;
    for (let n = 1; n <= target; n++) {
      win(r, "white");
      assert.equal(r.wins.white, n);
      assert.equal(r.phase, n === target ? "complete" : "finished");
      if (n < target) next(r);
    }
    assert.equal(r.matchWinner, "white");
    assert.throws(() => send(r, 0, { type: "rematch" }), /not available/);
    send(r, 0, { type: "return-lobby" });
    assert.equal(r.phase, "complete");
    assert.deepEqual(r.lobbyReady, [0]);
    assert.throws(() => send(r, 0, { type: "start" }), /host/);
    send(r, 1, { type: "return-lobby" });
    assert.equal(r.phase, "lobby");
    assert.equal(r.wins.white, target);
    send(r, 0, { type: "color", color: "white" });
    send(r, 0, { type: "start" });
    assert.equal(r.phase, "playing");
    assert.equal(r.round, 1);
    assert.deepEqual(r.wins, { black: 0, white: 0 });
    assert.equal(r.bestOf, bestOf);
  }
});

test("reset needs both players and preserves score, round and starter", () => {
  const r = room();
  win(r, "black");
  next(r);
  const { starter, round } = r;
  send(r, 0, { type: "reset" });
  assert.equal(r.reset.length, 1);
  send(r, 1, { type: "reset" });
  assert.equal(r.starter, starter);
  assert.equal(r.round, round);
  assert.deepEqual(r.wins, { black: 1, white: 0 });
  assert.deepEqual(r.game, createGame(starter));
});

test("leaving closes the room without inventing a winner", () => {
  const r = room();
  send(r, 1, { type: "leave" });
  assert.equal(r.phase, "closed");
  assert.equal(r.left, "Player 2");
  assert.deepEqual(r.wins, { black: 0, white: 0 });
  assert.throws(() => send(r, 0, { type: "start" }), /closed/);
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
