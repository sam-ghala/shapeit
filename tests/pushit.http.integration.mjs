// Run against a local Worker: node tests/pushit.http.integration.mjs
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
let calls = 0;
async function request(path, token, body, status = 200) {
  const response = await fetch(`${base}/api/pushit/rooms${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  calls++;
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
const profile = (name) => ({ id: crypto.randomUUID(), name });
await request("", null, { profile: profile("") }, 400);
const created = await request("", null, { profile: profile("Push host") }, 201),
  code = created.room.code;
assert.match(code, /^\d{4}$/);
assert.equal(created.room.phase, "lobby");
await request(`/${code}`, null, null, 403);
const joined = await request(`/${code}/join`, null, {
  profile: profile("Push guest"),
});
assert.equal(joined.room.phase, "lobby");
assert.equal(joined.room.you, 1);
await request(`/${code}/join`, null, { profile: profile("Third") }, 400);
const tokens = [created.token, joined.token];
let room = joined.room;
const send = async (index, body, status = 200) => {
  const data = await request(
    `/${code}/action`,
    tokens[index],
    { ...body, revision: room.revision },
    status,
  );
  if (data.room) room = data.room;
  return data;
};
await send(1, { type: "start" }, 400);
await send(1, { type: "format", bestOf: 3 }, 400);
await send(0, { type: "color", color: "white" });
assert.equal(room.players[0].color, "white");
assert.equal(room.players[1].color, "black");
await send(1, { type: "color", color: "white" }, 400);
await send(0, { type: "color", color: "black" });
assert.equal(room.players[0].color, "black");
await send(0, { type: "format", bestOf: 5 });
assert.equal(room.bestOf, 5);
await send(0, { type: "start", starter: "forged" });
assert.equal(room.phase, "playing");
assert.ok(["black", "white"].includes(room.starter));
assert.equal(room.game.current, room.starter);
await send(0, { type: "color", color: "white" }, 400);
const index = room.players.findIndex((p) => p.color === room.game.current),
  pieceId = `${room.game.current[0]}1`;
await send(1 - index, { type: "left", pieceId }, 400);
await send(index, { type: "end" }, 400);
const before = structuredClone(room.game);
await send(index, { type: "forward", pieceId });
assert.equal(room.game.used, 1);
assert.equal(room.canUndo, true);
const revision = room.revision;
await request(
  `/${code}/action`,
  tokens[index],
  { type: "left", pieceId, revision: revision - 1 },
  400,
);
await send(index, { type: "undo" });
assert.equal(room.undoRequest.by, index);
await send(index, { type: "undo-response", accept: true }, 400);
await send(index, { type: "left", pieceId }, 400);
await send(1 - index, { type: "undo-response", accept: false });
assert.equal(room.game.used, 1);
await send(index, { type: "undo" });
await send(1 - index, { type: "undo-response", accept: true });
assert.deepEqual(room.game, before);
await send(index, { type: "left", pieceId });
await send(index, { type: "end" });
assert.notEqual(room.game.current, before.current);
await send(index, { type: "undo" });
await send(1 - index, { type: "undo-response", accept: true });
assert.equal(room.game.current, before.current);
assert.equal(room.game.used, 1);
const resumed = await request(`/${code}`, tokens[index]);
assert.deepEqual(resumed.room.game, room.game);
for (const token of tokens)
  assert.ok(!JSON.stringify(resumed.room).includes(token));
assert.equal(resumed.room.undoStack, undefined);
await send(0, { type: "reset" });
await send(1, { type: "reset" });
assert.equal(room.round, 1);
assert.equal(room.game.used, 0);
assert.deepEqual(room.wins, { black: 0, white: 0 });
await send(1, { type: "leave" });
assert.equal(room.phase, "closed");
await send(0, { type: "start" }, 400);
// Play an entire best-of-three through the authoritative HTTP API.
const seriesCreated = await request(
  "",
  null,
  { profile: profile("Series host") },
  201,
);
const seriesCode = seriesCreated.room.code;
const seriesJoined = await request(`/${seriesCode}/join`, null, {
  profile: profile("Series guest"),
});
const seriesTokens = [seriesCreated.token, seriesJoined.token];
let series = seriesJoined.room;
const seriesSend = async (index, body, status = 200) => {
  const data = await request(
    `/${seriesCode}/action`,
    seriesTokens[index],
    { ...body, revision: series.revision },
    status,
  );
  if (data.room) series = data.room;
  return data;
};
await seriesSend(0, { type: "format", bestOf: 3 });
await seriesSend(0, { type: "start" });
async function winColor(color) {
  for (let turn = 0; turn < 8 && series.phase === "playing"; turn++) {
    const current = series.game.current,
      index = series.players.findIndex((p) => p.color === current);
    if (current === color)
      await seriesSend(index, {
        type: "forward",
        pieceId: color === "black" ? "b1" : "w3",
      });
    else {
      const defense = color === "black" ? "w1" : "b3",
        initialFacing = color === "black" ? 0 : 2;
      const piece = series.game.pieces.find((p) => p.id === defense);
      await seriesSend(index, {
        type: "left",
        pieceId:
          piece.facing === initialFacing
            ? defense
            : color === "black"
              ? "w2"
              : "b2",
      });
    }
    if (series.phase === "playing") await seriesSend(index, { type: "end" });
  }
  assert.equal(series.game.winner, color);
}
await winColor("black");
assert.deepEqual(series.wins, { black: 1, white: 0 });
const blackIndex = series.players.findIndex((p) => p.color === "black");
await seriesSend(blackIndex, { type: "undo" }, 400);
assert.equal(series.canUndo, false);
assert.equal(series.wins.black, 1);
const firstStarter = series.starter;
await seriesSend(0, { type: "rematch" });
assert.equal(series.phase, "finished");
await seriesSend(1, { type: "rematch" });
assert.notEqual(series.starter, firstStarter);
await winColor("white");
assert.deepEqual(series.wins, { black: 1, white: 1 });
await seriesSend(0, { type: "rematch" });
await seriesSend(1, { type: "rematch" });
assert.equal(series.starter, firstStarter);
await winColor("black");
assert.deepEqual(series.wins, { black: 2, white: 1 });
assert.equal(series.phase, "complete");
assert.equal(series.matchWinner, "black");
await seriesSend(0, { type: "rematch" }, 400);
await seriesSend(0, { type: "return-lobby" });
assert.equal(series.phase, "complete");
await seriesSend(1, { type: "return-lobby" });
assert.equal(series.phase, "lobby");
await seriesSend(0, { type: "color", color: "white" });
await seriesSend(0, { type: "format", bestOf: 5 });
await seriesSend(0, { type: "start" });
assert.equal(series.phase, "playing");
assert.equal(series.round, 1);
assert.deepEqual(series.wins, { black: 0, white: 0 });
await seriesSend(0, { type: "leave" });
for (const path of ["/pushit", "/pushit/", "/pushit?room=1234", "/"]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="root"/);
}
console.log(
  `PushIt HTTP integration passed (${calls} requests; lobby, name validation, colors, format, random start, approval/rejection of undo, reconnect, reset, leave and deep links).`,
);
