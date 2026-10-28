import assert from "node:assert/strict";
import { solutionDrawing } from "../src/game/engine.js";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
const adminKey = process.env.TEST_ADMIN_KEY || "local-test-only";
let calls = 0;
async function request(path, { token, body, status = 200, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  calls++;
  const text = await res.text();
  assert.equal(res.status, status, `${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const p1 = { id: crypto.randomUUID(), name: "HTTP host" },
  p2 = { id: crypto.randomUUID(), name: "HTTP guest" };
const created = await request("/api/rooms", {
  body: { profile: p1, mobile: false },
  status: 201,
});
const code = created.room.code,
  tokens = [created.token];
assert.match(code, /^\d{4}$/);
assert.equal(created.room.size, "classic");
await request(`/api/rooms/${code}`, { status: 403 });
const joined = await request(`/api/rooms/${code}/join`, {
  body: { profile: p2, mobile: true },
});
tokens.push(joined.token);
assert.equal(joined.room.size, "compact");
await request(`/api/rooms/${code}/join`, {
  body: { profile: { id: crypto.randomUUID(), name: "Third" }, mobile: false },
  status: 400,
});
const action = (index, body, status = 200) =>
  request(`/api/rooms/${code}/action`, { token: tokens[index], body, status });
await action(1, { type: "settings", settings: {} }, 400);
await action(0, { type: "settings", settings: { extras: true } });
let host = (await action(0, { type: "start" })).room;
let guest = (await request(`/api/rooms/${code}`, { token: tokens[1] })).room;
assert.equal(host.phase, "setup");
assert.equal(host.players[1].placed, undefined);
assert.equal(guest.players[0].placed, undefined);
assert.ok(host.players[0].pieces.some((p) => p.color === "transparent"));
const boards = [host.players[0].placed, guest.players[1].placed];
await action(0, { type: "place", placed: [] }, 400);
await action(0, { type: "ready", placed: boards[0] });
const playing = (await action(1, { type: "ready", placed: boards[1] })).room;
assert.equal(playing.phase, "playing");
const first = playing.turn;
await action(1 - first, { type: "laser", side: "top", idx: 0 }, 400);
const shot = (await action(first, { type: "laser", side: "top", idx: 0 })).room
  .queries[0];
assert.equal(shot.points, undefined);
assert.equal(shot.path, undefined);
const final = (
  await action(first, {
    type: "submit",
    drawing: solutionDrawing(boards[1 - first], 7, 5),
  })
).room;
assert.equal(final.phase, "final");
assert.equal(final.players[first].submission, undefined);
await action(1 - first, { type: "laser", side: "left", idx: 0 }, 400);
const finished = (
  await action(1 - first, {
    type: "submit",
    drawing: solutionDrawing(boards[first], 7, 5),
  })
).room;
assert.equal(finished.phase, "finished");
assert.equal(finished.winner, "draw");
assert.ok(finished.players[1].placed);
assert.ok(finished.players[0].submission.correct);
await action(
  first,
  { type: "submit", drawing: solutionDrawing(boards[1 - first], 7, 5) },
  400,
);
await request("/api/admin/events", { status: 401 });
await request("/api/admin/events", { token: "wrong", status: 401 });
const event = {
  id: `http-${crypto.randomUUID()}`,
  profileId: p1.id,
  name: p1.name,
  sessionId: "http-test",
  kind: "start",
  mode: "training",
  size: "compact",
  at: new Date(Date.now() - 3600000).toISOString(),
  browser: "MUST_NOT_BE_STORED",
};
await request("/api/events", { body: event });
await request("/api/events", { body: event });
const activity = await request("/api/admin/events", { token: adminKey });
assert.equal(activity.events.filter((e) => e.id === event.id).length, 1);
assert.equal(
  activity.events.find((e) => e.id === event.id).occurredAt,
  event.at,
);
assert.equal(JSON.stringify(activity).includes("MUST_NOT_BE_STORED"), false);
assert.equal(
  activity.events.filter((e) => e.sessionId === finished.id).length,
  4,
);
await request("/api/events", {
  body: event,
  headers: { Origin: "https://unrelated.example" },
  status: 403,
});
const waiting = await action(0, { type: "rematch" });
assert.equal(waiting.room.phase, "finished");
const rematched = await action(1, { type: "rematch" });
assert.equal(rematched.room.phase, "setup");
assert.equal(rematched.room.round, 2);
assert.notEqual(rematched.room.id, finished.id);
assert.equal(rematched.room.players[0].placed, undefined);
const reconnected = await request(`/api/rooms/${code}`, { token: tokens[0] });
assert.equal(reconnected.room.id, rematched.room.id);
assert.equal(reconnected.room.queries.length, 0);
const manifest = await fetch(base + "/manifest.webmanifest").then((r) =>
  r.json(),
);
assert.equal(manifest.display, "standalone");
for (const icon of manifest.icons) {
  const bytes = new Uint8Array(
    await fetch(base + icon.src).then((r) => r.arrayBuffer()),
  );
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
}
const sw = await fetch(base + "/sw.js").then((r) => r.text());
assert.match(sw, /shapeit-/);
assert.match(sw, /\/api\//);
console.log(
  `PASS: ${calls} API requests; real Durable Object room, auth, hidden-state protection, final draw, activity deduplication, manifest and install icons.`,
);
