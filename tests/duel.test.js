import test from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  joinRoom,
  applyAction,
  advanceRoom,
  roomView,
  FINAL_MS,
} from "../src/server/duel.js";
import {
  SIZES,
  solutionDrawing,
  emptyBoard,
  generatePuzzle,
  buildPieces,
} from "../src/game/engine.js";
const profiles = [
  { id: "player-one", name: "Robin" },
  { id: "player-two", name: "Sam" },
];
function setup(mobile = false) {
  const r = createRoom("0123", profiles[0], false, {}, 1000);
  joinRoom(r, profiles[1], mobile);
  applyAction(r, 0, { type: "start" }, 2000);
  return r;
}
function playing() {
  const r = setup(true);
  for (let i = 0; i < 2; i++)
    applyAction(
      r,
      i,
      {
        type: "ready",
        placed: generatePuzzle(`test:${i}`, r.players[i].pieces, 7, 5).placed,
      },
      3000,
    );
  return r;
}
function correct(r, player) {
  const { cols, rows } = SIZES[r.size];
  return solutionDrawing(r.players[1 - player].placed, cols, rows);
}
test("two computers use classic; either phone switches both to compact", () => {
  assert.equal(setup().size, "classic");
  assert.equal(setup(true).size, "compact");
  const r = createRoom("0001", profiles[0], true, {});
  joinRoom(r, profiles[1], false);
  assert.equal(r.size, "compact");
});
test("tokens and hidden boards are never exposed to the opponent", () => {
  const r = setup(true),
    v = roomView(r, 0);
  assert.ok(v.players[0].placed);
  assert.equal(v.players[1].placed, undefined);
  assert.equal(v.players[1].token, undefined);
  assert.equal(JSON.stringify(v).includes(r.players[1].token), false);
});
test("only host changes settings and starts, then settings lock", () => {
  const r = createRoom("0123", profiles[0], false, {});
  joinRoom(r, profiles[1], false);
  assert.throws(() => applyAction(r, 1, { type: "settings", settings: {} }));
  applyAction(r, 0, { type: "start" });
  assert.throws(() => applyAction(r, 0, { type: "settings", settings: {} }));
  assert.deepEqual(r.players[0].pieces, r.players[1].pieces);
});
test("setup starts empty, has no deadline and accepts legal partial placements", () => {
  const r = setup(true);
  assert.deepEqual(r.players[0].placed, []);
  assert.equal(r.deadline, null);
  advanceRoom(r, 999999);
  assert.equal(r.phase, "setup");
  assert.throws(() =>
    applyAction(r, 0, { type: "ready", placed: [] }, 1000000),
  );
  const placed = generatePuzzle("partial", r.players[0].pieces, 7, 5).placed;
  applyAction(r, 0, { type: "place", placed: placed.slice(0, 1) }, 1000000);
  assert.equal(r.players[0].placed.length, 1);
  assert.throws(() =>
    applyAction(
      r,
      0,
      { type: "place", placed: [placed[0], placed[0]] },
      1000001,
    ),
  );
  applyAction(r, 0, { type: "place", placed: [] }, 1000002);
  assert.deepEqual(r.players[0].placed, []);
});
test("duels use the daily shape pool for their board size, with identical sets", () => {
  for (const mobile of [true, false]) {
    const room = createRoom(
      "0123",
      profiles[0],
      mobile,
      { sameShapes: false, allowed: ["bad"] },
      1000,
    );
    joinRoom(room, profiles[1], mobile);
    applyAction(room, 0, { type: "start" }, 2000);
    assert.deepEqual(
      room.players[0].pieces,
      buildPieces(`${room.id}:shared`, room.size),
    );
    assert.deepEqual(room.players[0].pieces, room.players[1].pieces);
  }
});
test("turns are enforced; public queries omit hidden paths and hit identities", () => {
  const r = playing(),
    turn = r.turn;
  assert.throws(() =>
    applyAction(r, 1 - turn, { type: "laser", side: "top", idx: 0 }, 4000),
  );
  applyAction(r, turn, { type: "laser", side: "top", idx: 0 }, 4000);
  assert.equal(r.turn, 1 - turn);
  assert.equal(r.queries[0].points, undefined);
  assert.equal(r.queries[0].path, undefined);
  assert.equal(r.queries[0].hits, undefined);
});
test("first submission locks lasers and hides correctness until final response", () => {
  const r = playing(),
    first = r.turn;
  applyAction(r, first, { type: "submit", drawing: correct(r, first) }, 4000);
  assert.equal(r.phase, "final");
  assert.throws(() =>
    applyAction(r, 1 - first, { type: "laser", side: "top", idx: 0 }, 4100),
  );
  assert.equal(roomView(r, 1 - first).players[first].submission, undefined);
  applyAction(
    r,
    1 - first,
    { type: "submit", drawing: correct(r, 1 - first) },
    4200,
  );
  assert.equal(r.winner, "draw");
  assert.equal(r.phase, "finished");
  assert.ok(roomView(r, 0).players[1].placed);
  assert.throws(() =>
    applyAction(r, first, { type: "submit", drawing: correct(r, first) }, 4300),
  );
});
test("one correct player wins regardless of who submitted first", () => {
  for (const winner of [0, 1]) {
    const r = playing();
    const { cols, rows } = SIZES[r.size];
    const wrong = { guess: emptyBoard(cols, rows), edges: {} };
    const first = r.turn;
    applyAction(
      r,
      first,
      { type: "submit", drawing: first === winner ? correct(r, first) : wrong },
      4000,
    );
    applyAction(
      r,
      1 - first,
      {
        type: "submit",
        drawing: 1 - first === winner ? correct(r, 1 - first) : wrong,
      },
      4200,
    );
    assert.equal(r.winner, winner);
  }
});
test("both wrong loses both; unanswered final attempt expires", () => {
  const r = playing(),
    { cols, rows } = SIZES[r.size],
    first = r.turn;
  applyAction(
    r,
    first,
    { type: "submit", drawing: { guess: emptyBoard(cols, rows), edges: {} } },
    4000,
  );
  advanceRoom(r, 4000 + FINAL_MS);
  assert.equal(r.winner, "none");
  assert.equal(r.phase, "finished");
  const s = playing(),
    i = s.turn;
  applyAction(s, i, { type: "submit", drawing: correct(s, i) }, 5000);
  applyAction(s, 1 - i, { type: "pass" }, 5001);
  assert.equal(s.winner, i);
});

test("rematch requires both players, keeps room access and alternates the starter", () => {
  const room = playing();
  assert.throws(() => applyAction(room, 0, { type: "rematch" }, 3500));
  const starter = room.starter,
    id = room.id;
  const tokens = room.players.map((p) => p.token);
  const settings = structuredClone(room.settings);
  applyAction(
    room,
    starter,
    { type: "submit", drawing: correct(room, starter) },
    4000,
  );
  applyAction(
    room,
    1 - starter,
    { type: "submit", drawing: correct(room, 1 - starter) },
    4001,
  );
  applyAction(room, 1, { type: "rematch" }, 5000);
  applyAction(room, 1, { type: "rematch" }, 5001);
  assert.equal(room.phase, "finished");
  assert.deepEqual(roomView(room, 0).rematch, [1]);
  applyAction(room, 0, { type: "rematch" }, 5002);
  assert.equal(room.phase, "setup");
  assert.equal(room.round, 2);
  assert.notEqual(room.id, id);
  assert.equal(room.starter, 1 - starter);
  assert.deepEqual(
    room.players.map((p) => p.token),
    tokens,
  );
  assert.deepEqual(room.settings, settings);
  assert.deepEqual(room.queries, []);
  assert.ok(room.players.every((p) => !p.ready && p.submission === null));
  assert.equal(roomView(room, 0).players[1].placed, undefined);
  for (let i = 0; i < 2; i++)
    applyAction(
      room,
      i,
      {
        type: "ready",
        placed: generatePuzzle(`rematch:${i}`, room.players[i].pieces, 7, 5)
          .placed,
      },
      6000,
    );
  assert.equal(room.turn, 1 - starter);
});

test("room options allow either extra independently for both players", () => {
  for (const extras of [
    { diamond: true, black: false },
    { diamond: false, black: true },
  ]) {
    const room = createRoom("1234", profiles[0], true, { extras }, 1000);
    joinRoom(room, profiles[1], false);
    applyAction(room, 0, { type: "start" }, 2000);
    for (const p of room.players) {
      assert.equal(
        p.pieces.some((x) => x.color === "transparent"),
        extras.diamond,
      );
      assert.equal(
        p.pieces.some((x) => x.color === "black"),
        extras.black,
      );
    }
  }
});

function raceRoom(extras = false) {
  const r = createRoom(
    "2468",
    profiles[0],
    true,
    { mode: "race", extras },
    1000,
  );
  joinRoom(r, profiles[1], false);
  applyAction(r, 0, { type: "start" }, 2000);
  for (let i = 0; i < 2; i++)
    applyAction(
      r,
      i,
      {
        type: "ready",
        placed: generatePuzzle(`race:${i}`, r.players[i].pieces, 7, 5).placed,
      },
      3000,
    );
  return r;
}
test("host selects score race; both players act independently and only server time and clues count", async () => {
  const { calcScore } = await import("../src/game/engine.js");
  const r = raceRoom(true);
  assert.equal(roomView(r, 0, 3000).startedAt, 3000);
  applyAction(r, 1 - r.turn, { type: "laser", side: "top", idx: 0 }, 4000);
  applyAction(r, r.turn, { type: "laser", side: "top", idx: 0 }, 4001);
  applyAction(
    r,
    0,
    { type: "submit", drawing: correct(r, 0), score: 10000, seconds: 0 },
    123000,
  );
  assert.equal(r.phase, "playing");
  assert.equal(r.deadline, null);
  assert.equal(r.players[0].submission.score, calcScore(120, 1, true));
  assert.equal(roomView(r, 1).players[0].submission, undefined);
  assert.equal(roomView(r, 0).players[0].submittedAt, 123000);
  assert.throws(() =>
    applyAction(r, 0, { type: "laser", side: "left", idx: 0 }, 124000),
  );
  assert.throws(() =>
    applyAction(r, 0, { type: "submit", drawing: correct(r, 0) }, 124000),
  );
  advanceRoom(r, 300000);
  assert.equal(r.phase, "playing");
  applyAction(r, 1, { type: "submit", drawing: correct(r, 1) }, 303000);
  assert.equal(r.winner, 0);
  assert.deepEqual(r.wins, [1, 0]);
  advanceRoom(r, 400000);
  assert.deepEqual(r.wins, [1, 0]);
});
test("race compares final scores, not submission order; ties and incorrect solutions are explicit", () => {
  const r = raceRoom();
  // A legal long clue history penalizes the faster player enough to lose.
  r.queries = Array.from({ length: 20 }, () => ({ player: 0 }));
  applyAction(r, 0, { type: "submit", drawing: correct(r, 0) }, 123000);
  applyAction(r, 1, { type: "submit", drawing: correct(r, 1) }, 153000);
  assert.equal(r.winner, 1);
  for (const kind of ["draw", "none", 0]) {
    const room = raceRoom();
    const wrong = { guess: emptyBoard(7, 5), edges: {} };
    applyAction(
      room,
      0,
      { type: "submit", drawing: kind === "none" ? wrong : correct(room, 0) },
      123000,
    );
    applyAction(
      room,
      1,
      { type: "submit", drawing: kind === "draw" ? correct(room, 1) : wrong },
      123000,
    );
    assert.equal(room.winner, kind);
    assert.deepEqual(room.wins, kind === 0 ? [1, 0] : [0, 0]);
  }
});
test("live drawings stay private until the viewer submits and stay locked after submission", () => {
  for (const r of [playing()]) {
    const first = r.turn,
      other = 1 - first;
    const draft = { guess: emptyBoard(7, 5), edges: { "h-0-0": "red" } };
    applyAction(r, other, { type: "draft", drawing: draft }, 3500);
    assert.equal(roomView(r, first).players[other].draft, undefined);
    assert.equal(roomView(r, other).players[first].draft, undefined);
    assert.throws(() =>
      applyAction(
        r,
        other,
        { type: "draft", drawing: { ...draft, edges: { "h-8-0": "red" } } },
        3600,
      ),
    );
    assert.deepEqual(r.players[other].draft, draft);
    applyAction(r, first, { type: "submit", drawing: correct(r, first) }, 4000);
    assert.deepEqual(roomView(r, first).players[other].draft, draft);
    assert.equal(roomView(r, other).players[first].draft, undefined);
    assert.equal(roomView(r, first).players[other].placed, undefined);
    const updated = correct(r, other);
    applyAction(r, other, { type: "draft", drawing: updated }, 4200);
    assert.deepEqual(roomView(r, first).players[other].draft, updated);
    assert.throws(() =>
      applyAction(r, first, { type: "draft", drawing: draft }, 4300),
    );
  }
});
test("room wins survive rematch and reconnect; stale round actions cannot alter the new round", () => {
  const r = raceRoom(),
    id = r.id;
  applyAction(r, 0, { type: "submit", drawing: correct(r, 0) }, 123000);
  applyAction(
    r,
    1,
    { type: "submit", drawing: { guess: emptyBoard(7, 5), edges: {} } },
    124000,
  );
  applyAction(r, 0, { type: "rematch" }, 125000);
  applyAction(r, 1, { type: "rematch" }, 125001);
  assert.deepEqual(roomView(r, 0).wins, [1, 0]);
  assert.equal(r.settings.mode, "race");
  assert.ok(r.players.every((p) => p.draft === null && p.submission === null));
  assert.throws(() =>
    applyAction(r, 0, { type: "place", roundId: id, placed: [] }, 126000),
  );
  for (let i = 0; i < 2; i++)
    applyAction(
      r,
      i,
      {
        type: "ready",
        placed: generatePuzzle(`second:${i}`, r.players[i].pieces, 7, 5).placed,
      },
      127000,
    );
  applyAction(
    r,
    0,
    { type: "submit", drawing: { guess: emptyBoard(7, 5), edges: {} } },
    130000,
  );
  applyAction(r, 1, { type: "submit", drawing: correct(r, 1) }, 131000);
  assert.deepEqual(roomView(r, 1).wins, [1, 1]);
});

test("final deadline submits and grades the last saved drawing at the deadline, once", () => {
  for (const complete of [true, false]) {
    const room = playing(),
      first = room.turn,
      other = 1 - first;
    const drawing = complete
      ? correct(room, other)
      : { guess: emptyBoard(7, 5), edges: { "h-0-0": "red" } };
    applyAction(
      room,
      first,
      { type: "submit", drawing: correct(room, first) },
      5000,
    );
    applyAction(room, other, { type: "draft", drawing }, 5000 + FINAL_MS - 1);
    advanceRoom(room, 5000 + FINAL_MS + 10000);
    assert.equal(room.phase, "finished");
    assert.deepEqual(room.players[other].submission.drawing, drawing);
    assert.equal(room.players[other].submission.automatic, true);
    assert.equal(room.players[other].submission.at, 5000 + FINAL_MS);
    assert.equal(room.players[other].submission.correct, complete);
    assert.equal(room.winner, complete ? "draw" : first);
    const wins = [...room.wins];
    advanceRoom(room, 999999);
    assert.deepEqual(room.wins, wins);
  }
});
test("both race modes filter opponent logs, layouts and drafts even after first submission", () => {
  for (const mode of ["race", "random"]) {
    const r =
      mode === "race"
        ? raceRoom()
        : createRoom("1234", profiles[0], true, { mode }, 1000);
    if (mode === "random") {
      joinRoom(r, profiles[1], false);
      applyAction(r, 0, { type: "start" }, 3000);
    }
    for (let i = 0; i < 2; i++)
      applyAction(r, i, { type: "laser", side: "top", idx: 0 }, 4000);
    applyAction(r, 1, { type: "draft", drawing: correct(r, 1) }, 4500);
    for (let i = 0; i < 2; i++) {
      const v = roomView(r, i, 4500);
      assert.equal(v.queries.length, 1);
      assert.equal(v.queries[0].player, i);
      assert.ok(
        v.players.every((p) => p.placed === undefined && p.draft === undefined),
      );
    }
    applyAction(r, 0, { type: "submit", drawing: correct(r, 0) }, 5000);
    assert.equal(roomView(r, 0).players[1].draft, undefined);
    assert.equal(roomView(r, 0).players[1].placed, undefined);
    applyAction(r, 1, { type: "submit", drawing: correct(r, 1) }, 6000);
    assert.ok(roomView(r, 0).players[1].submission);
    assert.equal(roomView(r, 0).queries.length, 1);
  }
});
test("random race skips placement, shares a legal secret board and generates a fresh rematch", () => {
  for (const mobile of [false, true]) {
    const r = createRoom(
      "1234",
      profiles[0],
      mobile,
      { mode: "random", extras: true },
      1000,
    );
    joinRoom(r, profiles[1], mobile);
    applyAction(r, 0, { type: "start" }, 2000);
    assert.equal(r.phase, "playing");
    assert.equal(r.startedAt, 2000);
    assert.deepEqual(r.players[0].placed, r.players[1].placed);
    assert.ok(r.players.every((p) => p.ready));
    assert.throws(() => applyAction(r, 0, { type: "place", placed: [] }, 2500));
    const original = structuredClone(r.players[0].placed);
    applyAction(r, 0, { type: "submit", drawing: correct(r, 0) }, 62000);
    applyAction(r, 1, { type: "submit", drawing: correct(r, 1) }, 122000);
    assert.equal(r.winner, 0);
    applyAction(r, 0, { type: "rematch" }, 123000);
    applyAction(r, 1, { type: "rematch" }, 123001);
    assert.equal(r.phase, "playing");
    assert.deepEqual(r.wins, [1, 0]);
    assert.deepEqual(r.players[0].placed, r.players[1].placed);
    assert.notDeepEqual(r.players[0].placed, original);
    assert.equal(roomView(r, 0).players[0].placed, undefined);
  }
});
