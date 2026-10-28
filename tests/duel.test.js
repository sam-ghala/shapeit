import test from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  joinRoom,
  applyAction,
  advanceRoom,
  roomView,
  SETUP_MS,
  FINAL_MS,
} from "../src/server/duel.js";
import { SIZES, solutionDrawing, emptyBoard } from "../src/game/engine.js";
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
    applyAction(r, i, { type: "ready", placed: r.players[i].placed }, 3000);
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
test("deadline uses existing legal placements and rejects late board edits", () => {
  const r = setup(true);
  advanceRoom(r, 2000 + SETUP_MS);
  assert.equal(r.phase, "playing");
  assert.throws(() =>
    applyAction(
      r,
      0,
      { type: "place", placed: r.players[0].placed },
      2000 + SETUP_MS + 1,
    ),
  );
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
      { type: "ready", placed: room.players[i].placed },
      6000,
    );
  assert.equal(room.turn, 1 - starter);
});
