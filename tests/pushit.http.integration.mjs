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
const created = await request(
  "",
  null,
  { profile: profile("Push host"), hostColor: "white", starter: "black" },
  201,
);
const code = created.room.code;
assert.match(code, /^\d{4}$/);
assert.equal(created.room.phase, "waiting");
assert.equal(created.room.players[0].color, "white");
await request(`/${code}`, null, null, 403);
await request(
  `/${code}/action`,
  created.token,
  { type: "forward", pieceId: "b1", revision: 0 },
  400,
);
const joined = await request(`/${code}/join`, null, {
  profile: profile("Push guest"),
});
assert.equal(joined.room.phase, "playing");
assert.equal(joined.room.you, 1);
assert.equal(joined.room.players[1].color, "black");
for (const token of [created.token, joined.token])
  assert.ok(!JSON.stringify(joined.room).includes(token));
await request(`/${code}/join`, null, { profile: profile("Third player") }, 400);
let room = joined.room;
const send = async (token, body, status = 200) => {
  const result = await request(
    `/${code}/action`,
    token,
    { ...body, revision: room.revision },
    status,
  );
  if (result.room) room = result.room;
  return result;
};
await send(created.token, { type: "left", pieceId: "b1" }, 400);
await send(joined.token, { type: "end" }, 400);
await send(joined.token, { type: "forward", pieceId: "b1" });
assert.equal(room.game.used, 1);
assert.equal(room.game.pieces.find((p) => p.id === "b1").y, 1);
await request(
  `/${code}/action`,
  joined.token,
  { type: "left", pieceId: "b1", revision: 1 },
  400,
);
const resumed = await request(`/${code}`, created.token);
assert.deepEqual(resumed.room.game, room.game);
await send(joined.token, { type: "end" });
assert.equal(room.game.current, "white");
await send(created.token, { type: "left", pieceId: "w1" });
await send(created.token, { type: "right", pieceId: "w2" });
await send(created.token, { type: "end" }, 400);
await send(created.token, { type: "forward", pieceId: "w3" });
assert.equal(room.game.current, "black");
await send(created.token, { type: "reset" });
assert.equal(room.round, 1);
await send(joined.token, { type: "reset" });
assert.equal(room.round, 2);
assert.equal(room.game.log.length, 0);
await send(joined.token, { type: "leave" });
assert.equal(room.phase, "closed");
assert.deepEqual(room.wins, { black: 0, white: 0 });
await send(created.token, { type: "left", pieceId: "w1" }, 400);
for (const path of ["/pushit", "/pushit/", "/pushit?room=1234", "/"]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="root"/);
}
console.log(
  `PushIt HTTP integration passed (${calls} API requests; deep links and ShapeIt home OK).`,
);
