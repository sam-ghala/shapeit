import test from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  joinRoom,
  applyAction,
  advanceRoom,
  roomView,
  FINAL_MS,
  RACE_COUNTDOWN_MS,
  MAX_RACE_PLAYERS,
} from "../src/games/shapeit/server/duel.js";
import {
  SIZES,
  solutionDrawing,
  emptyBoard,
  generatePuzzle,
  buildPieces,
  boardFromPlaced,
  fireLaser,
} from "../src/games/shapeit/game/engine.js";
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
  return solutionDrawing(
    r.players[r.settings.mode === "random" ? player : 1 - player].placed,
    cols,
    rows,
  );
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
  const { calcScore } = await import("../src/games/shapeit/game/engine.js");
  const r = raceRoom(true);
  assert.equal(roomView(r, 0, 3000).startedAt, 6000);
  applyAction(r, 1 - r.turn, { type: "laser", side: "top", idx: 0 }, 7000);
  applyAction(r, r.turn, { type: "laser", side: "top", idx: 0 }, 7001);
  applyAction(
    r,
    0,
    { type: "submit", drawing: correct(r, 0), score: 10000, seconds: 0 },
    123000,
  );
  assert.equal(r.phase, "playing");
  assert.equal(r.deadline, null);
  assert.equal(r.players[0].submission.score, calcScore(117, 1, true));
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
      applyAction(r, i, { type: "laser", side: "top", idx: 0 }, 7000);
    applyAction(r, 1, { type: "draft", drawing: correct(r, 1) }, 7500);
    for (let i = 0; i < 2; i++) {
      const v = roomView(r, i, 7500);
      assert.equal(v.queries.length, 1);
      assert.equal(v.queries[0].player, i);
      assert.ok(
        v.players.every((p) => p.placed === undefined && p.draft === undefined),
      );
    }
    applyAction(r, 0, { type: "submit", drawing: correct(r, 0) }, 8000);
    assert.equal(roomView(r, 0).players[1].draft, undefined);
    assert.equal(roomView(r, 0).players[1].placed, undefined);
    applyAction(r, 1, { type: "submit", drawing: correct(r, 1) }, 9000);
    assert.ok(roomView(r, 0).players[1].submission);
    assert.equal(roomView(r, 0).queries.length, 2);
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
    assert.equal(r.startedAt, 5000);
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

test("either player can close a room in every phase without awarding an unplayed win", () => {
  for (const phase of ["lobby", "setup", "playing", "final", "finished"]) {
    const r = playing();
    r.phase = phase;
    r.deadline = phase === "final" ? 60000 : null;
    const wins = [...r.wins];
    applyAction(r, 1, { type: "leave" }, 5000);
    assert.equal(r.phase, "closed");
    assert.equal(r.deadline, null);
    assert.equal(roomView(r, 0).closedBy, 1);
    assert.deepEqual(r.wins, wins);
    assert.throws(() => applyAction(r, 0, { type: "rematch" }, 5001), /closed/);
    assert.throws(
      () => applyAction(r, 0, { type: "laser", side: "top", idx: 0 }, 5001),
      /closed/,
    );
    advanceRoom(r, 100000);
    assert.equal(r.phase, "closed");
  }
});

test("race countdown blocks shots, drawings and submissions, and is excluded from scoring", () => {
  for (const mode of ["race", "random"]) {
    const r =
      mode === "race"
        ? raceRoom()
        : createRoom("2468", profiles[0], true, { mode }, 1000);
    if (mode === "random") {
      joinRoom(r, profiles[1], false);
      applyAction(r, 0, { type: "start" }, 3000);
    }
    assert.equal(r.startedAt, 3000 + RACE_COUNTDOWN_MS);
    for (const type of ["laser", "draft", "submit"])
      assert.throws(
        () =>
          applyAction(
            r,
            0,
            { type, side: "top", idx: 0, drawing: correct(r, 0) },
            r.startedAt - 1,
          ),
        /countdown/,
      );
    assert.equal(r.players[0].submission, null);
    assert.equal(r.queries.length, 0);
    applyAction(r, 0, { type: "laser", side: "top", idx: 0 }, r.startedAt);
    applyAction(
      r,
      0,
      { type: "submit", drawing: correct(r, 0) },
      r.startedAt + 120000,
    );
    assert.equal(r.players[0].submission.seconds, 120);
  }
});
function groupRoom(count = 8) {
  const r = createRoom("8642", profiles[0], false, { mode: "random" }, 1000);
  for (let i = 1; i < count; i++)
    joinRoom(
      r,
      { id: `group-player-${i}`, name: `Player ${i}` },
      i === count - 1,
    );
  return r;
}
test("Random race admits eight distinct players and locks membership and mode after start", () => {
  const r = groupRoom();
  assert.equal(r.players.length, MAX_RACE_PLAYERS);
  assert.equal(r.size, "compact");
  assert.equal(new Set(r.players.map((p) => p.token)).size, 8);
  assert.deepEqual(r.wins, Array(8).fill(0));
  assert.throws(() => joinRoom(r, { id: "player-nine", name: "Ninth" }, false));
  assert.throws(() =>
    applyAction(r, 0, { type: "settings", settings: { mode: "turns" } }, 2000),
  );
  applyAction(r, 0, { type: "start" }, 3000);
  assert.ok(
    r.players.every(
      (p) => JSON.stringify(p.placed) === JSON.stringify(r.players[0].placed),
    ),
  );
  assert.throws(() => joinRoom(r, { id: "late-player", name: "Late" }, false));
  for (let i = 0; i < 8; i++) {
    applyAction(r, i, { type: "laser", side: "top", idx: 0 }, 6000);
    const v = roomView(r, i, 6000);
    assert.equal(v.you, i);
    assert.equal(v.queries.length, 1);
    assert.equal(v.queries[0].player, i);
    assert.ok(
      v.players.every(
        (p) =>
          p.placed === undefined &&
          p.submission === undefined &&
          p.token === undefined,
      ),
    );
  }
  assert.ok(
    r.queries.every(
      (q) => JSON.stringify(q.colors) === JSON.stringify(r.queries[0].colors),
    ),
  );
});
test("eight-player race compares all scores, reveals all attempts and logs only at the end, and retains wins on rematch", () => {
  const r = groupRoom();
  applyAction(r, 0, { type: "start" }, 3000);
  const original = structuredClone(r.players[0].placed);
  for (let i = 0; i < 8; i++)
    applyAction(r, i, { type: "laser", side: "top", idx: 0 }, 6000);
  // Player 7 is the quickest correct player; submitting them last must not pick a two-player winner.
  for (let i = 0; i < 8; i++) {
    applyAction(
      r,
      i,
      {
        type: "submit",
        drawing:
          i === 6 ? { guess: emptyBoard(7, 5), edges: {} } : correct(r, i),
      },
      i === 7 ? 66000 : 126000,
    );
    if (i < 7) {
      assert.equal(r.phase, "playing");
      assert.equal(roomView(r, 0).players[i].submission, undefined);
      assert.equal(roomView(r, 0).queries.length, 1);
    }
  }
  assert.equal(r.winner, 7);
  assert.deepEqual(r.winners, [7]);
  assert.deepEqual(r.wins, [0, 0, 0, 0, 0, 0, 0, 1]);
  const final = roomView(r, 4);
  assert.equal(final.queries.length, 8);
  assert.ok(final.players.every((p) => p.submission && p.placed));
  assert.equal(final.players[6].submission.score, 0);
  for (let i = 0; i < 7; i++) applyAction(r, i, { type: "rematch" }, 130000);
  assert.equal(r.phase, "finished");
  applyAction(r, 7, { type: "rematch" }, 130000);
  assert.equal(r.phase, "playing");
  assert.equal(r.startedAt, 133000);
  assert.notDeepEqual(r.players[0].placed, original);
  assert.deepEqual(r.wins, [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.ok(r.players.every((p) => p.submission === null && p.draft === null));
});
test("group ties include only the top scorers, and a departing guest does not close everyone’s race", () => {
  const r = groupRoom(4);
  applyAction(r, 0, { type: "start" }, 3000);
  applyAction(r, 1, { type: "leave" }, 7000);
  assert.equal(r.phase, "playing");
  assert.equal(r.players[1].left, true);
  assert.equal(r.players[1].submission.score, 0);
  for (const i of [0, 2, 3])
    applyAction(
      r,
      i,
      { type: "submit", drawing: correct(r, i) },
      i === 0 ? 126000 : 66000,
    );
  assert.equal(r.winner, "draw");
  assert.deepEqual(r.winners, [2, 3]);
  assert.deepEqual(r.wins, [0, 0, 0, 0]);
  for (const i of [0, 2, 3]) applyAction(r, i, { type: "rematch" }, 130000);
  assert.equal(r.phase, "playing");
  assert.equal(r.players.length, 3);
  assert.equal(
    r.players.some((p) => p.left),
    false,
  );
  assert.deepEqual(r.wins, [0, 0, 0]);
});

test("a guest leaving after the others accept a rematch releases the remaining players", () => {
  const r = groupRoom(3);
  applyAction(r, 0, { type: "start" }, 1000);
  for (let i = 0; i < 3; i++)
    applyAction(r, i, { type: "submit", drawing: correct(r, i) }, 124000);
  applyAction(r, 0, { type: "rematch" }, 125000);
  applyAction(r, 1, { type: "rematch" }, 125000);
  applyAction(r, 2, { type: "leave" }, 125001);
  assert.equal(r.phase, "playing");
  assert.equal(r.players.length, 2);
  assert.equal(r.startedAt, 128001);
  assert.deepEqual(
    r.players.map((p) => p.id),
    [profiles[0].id, "group-player-1"],
  );
});

test("multiplayer retains absorption feedback but exposes no diamond-hit hint, including legacy rooms", () => {
  for (const color of ["transparent", "black"]) {
    const room = raceRoom(true),
      target = room.players[1],
      board = boardFromPlaced(target.placed, 7, 5),
      id = target.pieces.find((p) => p.color === color).id;
    let entry;
    for (const [side, count] of [
      ["top", 7],
      ["bottom", 7],
      ["left", 5],
      ["right", 5],
    ]) {
      for (let idx = 0; idx < count; idx++) {
        const shot = fireLaser(board, side, idx);
        if (
          color === "black"
            ? shot.absorbed
            : shot.hits.includes(id) && !shot.absorbed
        ) {
          entry = { side, idx };
          break;
        }
      }
      if (entry) break;
    }
    assert.ok(entry);
    applyAction(room, 0, { type: "laser", ...entry }, 7000);
    const clue = roomView(room, 0, 7000).queries[0];
    assert.equal(clue.absorbed, color === "black");
    assert.equal(clue.extraColors, undefined);
    assert.equal(clue.hits, undefined);
    assert.equal(clue.points, undefined);
    assert.equal(clue.path, undefined);
    assert.equal(clue.colors.includes("transparent"), false);
    room.queries[0].extraColors = ["transparent"];
    advanceRoom(room, 8000);
    assert.equal(roomView(room, 0, 8000).queries[0].extraColors, undefined);
    assert.equal(room.queries.length, 1);
  }
});

test("an active race spanning the bonus update uses the same scoring version for both submissions", () => {
  const room = raceRoom(true);
  applyAction(room, 0, { type: "submit", drawing: correct(room, 0) }, 126000);
  room.players[0].submission.score = 5600;
  room.players[0].submission.bonus = 600;
  room.players[0].submission.scoreVersion = 2;
  applyAction(room, 1, { type: "submit", drawing: correct(room, 1) }, 126000);
  assert.equal(room.players[0].submission.score, 6000);
  assert.equal(room.players[1].submission.score, 6000);
  assert.equal(room.players[0].submission.scoreVersion, 3);
  assert.equal(room.winner, "draw");
});
