// Run against a local Worker: node tests/captureit.http.integration.mjs
import assert from "node:assert/strict";
import { legalMoves } from "../src/games/captureit/engine.js";

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
const profile = (name) => ({ id: crypto.randomUUID(), name });
const host = profile("Capture host");
const guest = profile("Capture guest");
const rooms = "/api/captureit/rooms";
await request(rooms, null, { profile: profile("") }, 400);
const created = await request(rooms, null, { profile: host }, 201);
assert.match(created.room.code, /^\d{4}$/);
assert.equal(created.room.phase, "lobby");
assert.equal(created.room.players[0].color, "white");
const path = `${rooms}/${created.room.code}`;
await request(path, null, null, 403);
await request(path, "not-a-room-token", null, 403);
await request(`${path}/join`, null, { profile: host }, 400);
const joined = await request(`${path}/join`, null, { profile: guest });
assert.equal(joined.room.you, 1);
assert.equal(joined.room.phase, "lobby");
await request(`${path}/join`, null, { profile: profile("Third player") }, 400);
const tokens = [created.token, joined.token];
let room = joined.room;
const send = async (index, body, expected = 200) => {
  const data = await request(
    `${path}/action`,
    tokens[index],
    { revision: room.revision, ...body },
    expected,
  );
  if (data.room) room = data.room;
  return data;
};
await send(1, { type: "start" }, 400);
await send(1, { type: "color", color: "black" }, 400);
await send(0, { type: "color", color: "black" });
assert.equal(room.players[0].color, "black");
assert.equal(room.players[1].color, "white");
await send(0, { type: "start", starter: "black", winner: "black" });
assert.equal(room.phase, "playing");
assert.equal(room.game.current, "white");
const firstGameId = room.gameId;
await send(0, { type: "color", color: "white" }, 400);
const before = structuredClone(room.game);
const piece = room.game.pieces.find(
  (p) => legalMoves(room.game, p.cell).length,
);
const move = {
  type: "move",
  from: piece.cell,
  to: legalMoves(room.game, piece.cell)[0],
};
await send(0, move, 400);
await send(
  1,
  {
    type: "exchange",
    target: room.game.pieces.find((p) => p.color === "black").cell,
  },
  400,
);
await send(1, { type: "move", from: "fake", to: "fake" }, 400);
await send(1, move);
assert.equal(room.game.current, "black");
assert.equal(room.canUndo, true);
await send(1, { ...move, revision: room.revision - 1 }, 400);
await send(0, { type: "undo" }, 400);
await send(1, { type: "undo" });
assert.deepEqual(room.undoRequest, { by: 1 });
await send(1, { type: "undo-response", accept: true }, 400);
await send(0, { type: "undo-response", accept: false });
assert.equal(room.game.current, "black");
await send(1, { type: "undo" });
await send(0, { type: "undo-response", accept: true });
assert.deepEqual(room.game, before);
const resumed = await request(path, tokens[1]);
assert.deepEqual(resumed.room.game, before);
assert.equal(resumed.room.undoStack, undefined);
for (const token of tokens)
  assert.ok(!JSON.stringify(resumed.room).includes(token));
await send(0, { type: "resign", winner: "black" });
assert.equal(room.phase, "finished");
assert.equal(room.game.winner, "white");
assert.deepEqual(room.wins, [0, 1]);
assert.equal(room.canUndo, false);
await send(1, { type: "undo" }, 400);
const rematchVote = {
  type: "rematch",
  revision: room.revision,
  gameId: room.gameId,
};
await send(0, rematchVote);
await send(0, { type: "rematch" });
assert.equal(room.phase, "finished");
await send(1, rematchVote);
assert.equal(room.phase, "playing");
assert.equal(room.round, 2);
assert.notEqual(room.gameId, firstGameId);
assert.equal(room.players[0].color, "white");
assert.equal(room.game.current, "white");
assert.deepEqual(room.wins, [0, 1]);
await send(0, rematchVote, 400);
const secondGameId = room.gameId;
await send(0, { type: "reset" });
assert.equal(room.gameId, secondGameId);
await send(0, { type: "reset-response", accept: false }, 400);
await send(1, { type: "reset-response", accept: false });
assert.deepEqual(room.reset, []);
await send(0, { type: "reset" });
await send(1, { type: "reset" });
assert.notEqual(room.gameId, secondGameId);
assert.equal(room.round, 2);
assert.deepEqual(room.wins, [0, 1]);
const thirdGameId = room.gameId;
await send(1, { type: "leave", revision: -1 });
await send(0, { type: "leave" });
assert.equal(room.phase, "closed");
await send(0, { type: "start" }, 400);
await request(path, tokens[0]);
await request(
  "/api/events",
  null,
  {
    id: crypto.randomUUID(),
    game: "captureit",
    sessionId: firstGameId,
    profileId: host.id,
    name: host.name,
    kind: "finish",
    mode: "online",
    size: "classic",
  },
  400,
);
for (const [person, result] of [
  [host, "lost"],
  [guest, "won"],
]) {
  const activity = await request(
    `/api/admin/events?game=captureit&player=${person.id}`,
    adminKey,
  );
  assert.equal(activity.events.length, 3);
  const finish = activity.events.find((e) => e.kind === "finish");
  assert.equal(finish.sessionId, firstGameId);
  assert.equal(finish.result, result);
  assert.equal(finish.winnerColor, "white");
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
for (const route of ["/captureit", "/captureit/", "/captureit?room=0042"]) {
  const response = await fetch(base + route);
  calls++;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="root"/);
}
console.log(
  `CaptureIt HTTP integration passed (${calls} requests; private rooms, colors, White starts, authoritative turns, consensus undo, player scores, rematch, reset, reconnect, close and activity).`,
);
