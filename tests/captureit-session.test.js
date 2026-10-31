import test from "node:test";
import assert from "node:assert/strict";
import { legalMoves } from "../src/games/captureit/engine.js";
import {
  createSession,
  playSession,
  restoreSession,
  undoSession,
} from "../src/games/captureit/session.js";

function firstMove(game) {
  const piece = game.pieces.find(
    (candidate) => legalMoves(game, candidate.cell).length,
  );
  return {
    type: "move",
    from: piece.cell,
    to: legalMoves(game, piece.cell)[0],
  };
}

test("sessions round-trip a played game and its undo history without retaining input references", () => {
  const initial = createSession("capture-session", 1000);
  const played = playSession(initial, firstMove(initial.game), 2000);
  const restored = restoreSession(JSON.parse(JSON.stringify(played)));
  assert.deepEqual(restored, played);
  assert.equal(initial.game.turn, 1);
  assert.equal(played.game.turn, 2);
  assert.equal(played.endedAt, null);
  const undone = undoSession(restored);
  assert.deepEqual(undone.game, initial.game);
  assert.equal(undone.history.length, 0);
  assert.equal(undone.endedAt, null);
  restored.game.pieces[0].cell = "invalid";
  restored.history[0].game.pieces[0].cell = "invalid";
  assert.notEqual(played.game.pieces[0].cell, "invalid");
  assert.notEqual(played.history[0].game.pieces[0].cell, "invalid");
});

test("a completed session records its end time and cannot be undone or played again", () => {
  const initial = createSession("capture-finished", 1000);
  const finished = playSession(initial, { type: "resign" }, 4500);
  assert.equal(finished.game.winner, "black");
  assert.equal(finished.endedAt, 4500);
  assert.equal(finished.history.length, 1);
  assert.equal(undoSession(finished), finished);
  assert.deepEqual(
    restoreSession(JSON.parse(JSON.stringify(finished))),
    finished,
  );
  assert.throws(() => playSession(finished, { type: "resign" }), /finished/i);
  assert.equal(undoSession(initial), initial);
});

test("restore rejects broken metadata, malformed boards, and unsafe undo snapshots", () => {
  const initial = createSession("capture-restore", 1000);
  const played = playSession(initial, firstMove(initial.game), 2000);
  const complete = playSession(initial, { type: "resign" }, 3000);
  const broken = [
    null,
    "not a session",
    { ...played, version: 2 },
    { ...played, id: "../../unexpected" },
    { ...played, id: "x".repeat(81) },
    { ...played, startedAt: -1 },
    { ...played, startedAt: Infinity },
    { ...played, history: null },
    { ...played, history: Array(51).fill(played.history[0]) },
    { ...played, game: { ...played.game, current: "red" } },
    { ...played, history: [null] },
    { ...played, history: [{ game: { ...initial.game, tiles: ["missing"] } }] },
    { ...played, history: [{ game: complete.game, notice: "Finished" }] },
    { ...complete, endedAt: null },
    { ...complete, endedAt: 999 },
    { ...complete, endedAt: Infinity },
  ];
  for (const value of broken) assert.equal(restoreSession(value), null);
});
