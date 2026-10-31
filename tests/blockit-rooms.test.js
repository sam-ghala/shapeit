import test from "node:test";
import assert from "node:assert/strict";
import {
  createBlockRoom,
  joinBlockRoom,
  blockRoomView,
  applyBlockAction,
} from "../src/games/blockit/rooms.js";
import { legalMoves } from "../src/games/blockit/engine.js";
const host = { id: "block-host-player", name: "Host" },
  guest = { id: "block-guest-player", name: "Guest" };
const action = (room, index, body) =>
  applyBlockAction(room, index, { revision: room.revision, ...body });
const current = (room) =>
  room.players.findIndex((p) => p.color === room.game.current);
const setup = () => {
  const room = createBlockRoom("0042", host);
  joinBlockRoom(room, guest);
  action(room, 0, { type: "start" });
  return room;
};
test("BlockIt private rooms protect seats, host settings and server-owned turns", () => {
  const room = createBlockRoom("0042", host);
  assert.throws(() => action(room, 0, { type: "start" }));
  assert.throws(() => joinBlockRoom(room, host));
  joinBlockRoom(room, guest);
  assert.throws(() =>
    joinBlockRoom(room, { id: "third-player", name: "Third" }),
  );
  assert.throws(() => action(room, 1, { type: "color", color: "black" }));
  action(room, 0, { type: "color", color: "black" });
  assert.deepEqual(
    room.players.map((p) => p.color),
    ["black", "white"],
  );
  action(room, 0, { type: "start", current: "red", winner: "black" });
  assert.ok(["black", "white"].includes(room.game.current));
  assert.equal(room.game.winner, null);
  assert.throws(() => action(room, -1, { type: "leave" }));
  assert.throws(() =>
    action(room, 1 - current(room), { type: "move", to: 67 }),
  );
  const view = blockRoomView(room, 0);
  assert.equal(view.undoStack, undefined);
  room.players.forEach((player) =>
    assert.ok(!JSON.stringify(view).includes(player.token)),
  );
});
test("latest author requests undo; only opponent approval restores the full state", () => {
  const room = setup(),
    first = current(room),
    before = structuredClone(room.game);
  action(room, first, { type: "wall", row: 3, col: 3, orientation: "h" });
  const revision = room.revision;
  assert.throws(() =>
    action(room, 1 - first, {
      type: "move",
      to: legalMoves(room.game)[0],
      revision: revision - 1,
    }),
  );
  assert.throws(() => action(room, 1 - first, { type: "undo" }));
  action(room, first, { type: "undo" });
  assert.throws(() =>
    action(room, first, { type: "undo-response", accept: true }),
  );
  assert.throws(() =>
    action(room, 1 - first, { type: "move", to: legalMoves(room.game)[0] }),
  );
  action(room, 1 - first, { type: "undo-response", accept: false });
  assert.equal(room.game.walls.length, 1);
  action(room, first, { type: "undo" });
  action(room, 1 - first, { type: "undo-response", accept: true });
  assert.deepEqual(room.game, before);
});
test("rematches swap sides and alternate the starting person; stale same-round votes commute", () => {
  const room = setup(),
    first = current(room),
    starter = room.game.starter;
  action(room, 1 - first, { type: "resign" });
  assert.equal(room.phase, "finished");
  assert.equal(room.wins[first], 1);
  assert.throws(() => action(room, first, { type: "undo" }));
  const vote = {
    type: "rematch",
    gameId: room.gameId,
    revision: room.revision,
  };
  action(room, 0, vote);
  action(room, 1, vote);
  assert.equal(room.phase, "playing");
  assert.equal(current(room), 1 - first);
  assert.equal(room.game.starter, starter);
  assert.equal(room.round, 2);
  assert.throws(() => action(room, 0, vote));
});
test("consensual restart keeps starter and score; leaving closes without a win", () => {
  const room = setup(),
    before = room.gameId,
    starter = room.game.starter;
  action(room, 0, { type: "reset" });
  assert.throws(() =>
    action(room, 0, { type: "reset-response", accept: true }),
  );
  action(room, 1, { type: "reset-response", accept: false });
  assert.equal(room.gameId, before);
  action(room, 0, { type: "reset" });
  action(room, 1, { type: "reset-response", accept: true });
  assert.notEqual(room.gameId, before);
  assert.equal(room.game.current, starter);
  assert.deepEqual(room.wins, [0, 0]);
  action(room, 1, { type: "leave", revision: -1 });
  assert.equal(room.phase, "closed");
  assert.equal(room.game.winner, null);
  assert.throws(() => action(room, 0, { type: "start" }));
});
