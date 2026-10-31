import assert from "node:assert/strict";
import { legalMoves, goalRow } from "../src/games/blockit/engine.js";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname),
  "Only run integration tests against a local Worker.",
);
const adminKey = process.env.TEST_ADMIN_KEY || "local-test-only";
let calls = 0;
async function request(path, token, body, expected = 200) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  calls++;
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
const profile = (name) => ({ id: crypto.randomUUID(), name }),
  host = profile("Block host"),
  guest = profile("Block guest");
const rooms = "/api/blockit/rooms";
await request(rooms, null, { profile: profile("") }, 400);
const created = await request(rooms, null, { profile: host }, 201),
  path = `${rooms}/${created.room.code}`;
assert.match(created.room.code, /^\d{4}$/);
await request(path, null, null, 403);
await request(path, "wrong-token", null, 403);
await request(`${path}/join`, null, { profile: host }, 400);
const joined = await request(`${path}/join`, null, { profile: guest });
await request(`${path}/join`, null, { profile: profile("Third") }, 400);
const tokens = [created.token, joined.token];
let room = joined.room;
const send = async (index, body, expected = 200) => {
  const data = await request(
    `${path}/action`,
    tokens[index],
    { revision: room.revision, gameId: room.gameId, ...body },
    expected,
  );
  if (data.room) room = data.room;
  return data;
};
const current = () =>
  room.players.findIndex((player) => player.color === room.game.current);
await send(1, { type: "start" }, 400);
await send(1, { type: "color", color: "black" }, 400);
await send(0, { type: "color", color: "black" });
await send(0, { type: "start", current: "red", winner: "black" });
assert.equal(room.phase, "playing");
assert.ok(["white", "black"].includes(room.game.current));
assert.equal(room.game.winner, null);
const firstGameId = room.gameId,
  first = current(),
  starter = room.game.starter,
  before = structuredClone(room.game);
await send(0, { type: "color", color: "white" }, 400);
await send(1 - first, { type: "move", to: legalMoves(room.game)[0] }, 400);
await send(first, { type: "move", to: -1 }, 400);
await send(first, { type: "wall", row: 3, col: 3, orientation: "h" });
assert.equal(room.game.walls.length, 1);
assert.equal(room.canUndo, true);
await send(1 - first, { type: "wall", row: 3, col: 3, orientation: "v" }, 400);
await send(
  1 - first,
  { type: "move", to: legalMoves(room.game)[0], revision: room.revision - 1 },
  400,
);
await send(1 - first, { type: "undo" }, 400);
await send(first, { type: "undo" });
await send(first, { type: "undo-response", accept: true }, 400);
await send(1 - first, { type: "move", to: legalMoves(room.game)[0] }, 400);
await send(1 - first, { type: "undo-response", accept: false });
await send(first, { type: "undo" });
await send(1 - first, { type: "undo-response", accept: true });
assert.deepEqual(room.game, before);
const resumed = await request(path, tokens[first]);
assert.deepEqual(resumed.room.game, before);
assert.equal(resumed.room.undoStack, undefined);
for (const token of tokens)
  assert.ok(!JSON.stringify(resumed.room).includes(token));
// Play a complete race through the actual HTTP endpoint. The second pawn steps aside.
for (let step = 0; step < 20 && !room.game.winner; step++) {
  const index = current(),
    color = room.game.current,
    from = room.game.pawns[color];
  const to =
    index === first
      ? from + (goalRow(color) === 0 ? -9 : 9)
      : from % 9 === 4
        ? from - 1
        : from % 9 === 3
          ? from - 1
          : from + 1;
  await send(index, { type: "move", to });
}
assert.equal(room.phase, "finished");
assert.equal(room.game.winner, starter);
assert.equal(room.game.reason, "goal");
assert.equal(room.wins[first], 1);
await send(first, { type: "undo" }, 400);
const vote = { type: "rematch", revision: room.revision, gameId: room.gameId };
await send(0, vote);
await send(1, vote);
assert.equal(room.phase, "playing");
assert.equal(current(), 1 - first);
assert.equal(room.round, 2);
await send(0, vote, 400);
const secondGameId = room.gameId;
await send(0, { type: "reset" });
await send(0, { type: "reset-response", accept: true }, 400);
await send(1, { type: "reset-response", accept: false });
assert.equal(room.gameId, secondGameId);
await send(0, { type: "reset" });
await send(1, { type: "reset-response", accept: true });
assert.notEqual(room.gameId, secondGameId);
assert.equal(room.game.current, starter);
const thirdGameId = room.gameId;
await send(1, { type: "leave", revision: -1 });
await send(0, { type: "leave" });
assert.equal(room.phase, "closed");
await send(0, { type: "start" }, 400);
await request(
  "/api/events",
  null,
  {
    id: crypto.randomUUID(),
    game: "blockit",
    sessionId: firstGameId,
    profileId: host.id,
    name: host.name,
    kind: "finish",
    mode: "online",
    size: "9x9",
  },
  400,
);
for (const [index, person] of [host, guest].entries()) {
  const activity = await request(
    `/api/admin/events?game=blockit&player=${person.id}`,
    adminKey,
  );
  assert.equal(activity.events.length, 3);
  const finish = activity.events.find((e) => e.kind === "finish");
  assert.equal(finish.sessionId, firstGameId);
  assert.equal(finish.result, index === first ? "won" : "lost");
  assert.equal(finish.winnerColor, starter);
  assert.deepEqual(
    new Set(
      activity.events.filter((e) => e.kind === "abort").map((e) => e.sessionId),
    ),
    new Set([secondGameId, thirdGameId]),
  );
  assert.equal(
    activity.players.find((p) => p.profileId === person.id).games,
    3,
  );
  for (const token of tokens)
    assert.ok(!JSON.stringify(activity).includes(token));
}
const local = profile("Block local");
await request("/api/events", null, {
  id: crypto.randomUUID(),
  game: "blockit",
  sessionId: crypto.randomUUID(),
  profileId: local.id,
  name: local.name,
  kind: "finish",
  mode: "local",
  size: "9x9",
  result: "completed",
  winnerColor: "white",
});
const localEvents = await request(
  `/api/admin/events?game=blockit&player=${local.id}`,
  adminKey,
);
assert.equal(localEvents.events[0].winnerColor, "white");
for (const route of ["/blockit", "/blockit/", "/blockit?room=0042"]) {
  const response = await fetch(base + route);
  calls++;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="root"/);
}
console.log(
  `BlockIt HTTP integration passed (${calls} requests): private rooms, walls, turns, undo, goal win, rematch, restart, reconnect, leave and activity.`,
);
