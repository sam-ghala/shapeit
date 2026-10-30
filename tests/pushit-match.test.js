import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/games/pushit/engine.js";
import {
  newMatch,
  playMatch,
  nextRound,
  undoMatch,
  restoreLocalMatch,
} from "../src/games/pushit/match.js";
import { upgradePushRoom, pushRoomView } from "../src/games/pushit/rooms.js";

test("local undo restores complete turns and scores without approval", () => {
  const m = newMatch(3, "black"),
    before = structuredClone(m.game);
  playMatch(m, { type: "left", pieceId: "b1" }, "black");
  playMatch(m, { type: "end" }, "black");
  assert.equal(m.game.current, "white");
  undoMatch(m);
  assert.equal(m.game.current, "black");
  assert.equal(m.game.used, 1);
  undoMatch(m);
  assert.deepEqual(m.game, before);
  assert.throws(() => undoMatch(m), /no move/);
});
test("local migration preserves the board and new match saves preserve wins and undo", () => {
  const old = createGame("white");
  const migrated = restoreLocalMatch(null, old);
  assert.deepEqual(migrated.game, old);
  assert.equal(migrated.starter, "white");
  const m = newMatch(5, "white");
  m.wins = { black: 2, white: 1 };
  playMatch(m, { type: "left", pieceId: "w1" }, "white");
  const restored = restoreLocalMatch(JSON.parse(JSON.stringify(m)), null);
  assert.deepEqual(restored.wins, { black: 2, white: 1 });
  assert.equal(restored.bestOf, 5);
  assert.equal(restored.undoStack.length, 1);
  undoMatch(restored);
  assert.equal(restored.game.used, 0);
  assert.equal(restoreLocalMatch({ game: { bad: true } }, null), null);
});
test("older active online rooms keep tokens, board and points across the upgrade", () => {
  const r = {
    id: "old-room",
    phase: "playing",
    round: 3,
    game: createGame("white"),
    wins: { black: 2, white: 0 },
    players: [
      { id: "player-old", name: "Host", color: "black", token: "secret" },
    ],
    starter: "black",
  };
  upgradePushRoom(r);
  assert.equal(r.version, 2);
  assert.equal(r.phase, "playing");
  assert.equal(r.players[0].token, "secret");
  assert.equal(r.game.current, "white");
  assert.deepEqual(r.wins, { black: 2, white: 0 });
  assert.equal(pushRoomView(r, 0).players[0].token, undefined);
  assert.equal(pushRoomView(r, 0).undoStack, undefined);
});
test("a valid restored local game with malformed undo data starts with a safe undo stack", () => {
  const m = newMatch();
  m.undoStack = "bad";
  const restored = restoreLocalMatch(m, null);
  assert.deepEqual(restored.undoStack, []);
});
