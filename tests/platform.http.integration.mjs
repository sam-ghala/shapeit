// Local Worker only: node tests/platform.http.integration.mjs
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
const key = process.env.TEST_ADMIN_KEY || "local-test-only";
const id = crypto.randomUUID(),
  name = "Shared profile test";
let calls = 0;
async function request(path, body, expected = 200) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(path.startsWith("/api/admin/")
        ? { Authorization: `Bearer ${key}` }
        : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  calls++;
  const data = await res.json();
  assert.equal(res.status, expected, JSON.stringify(data));
  return data;
}
for (const game of ["shapeit", "pushit", "chessit"]) {
  for (const kind of game === "chessit" ? ["visit"] : ["start", "finish"]) {
    await request("/api/events", {
      id: `${id}:${game}:${kind}`,
      sessionId: id,
      profileId: id,
      name,
      ...(game === "shapeit" ? {} : { game }), // Preserve legacy client event support.
      kind,
      mode:
        game === "shapeit" ? "daily" : game === "pushit" ? "local" : "preview",
      size: game === "shapeit" ? "compact" : game === "pushit" ? "4x4" : "8x8",
      ...(kind === "finish"
        ? game === "shapeit"
          ? { result: "won", queries: 5, score: 5000 }
          : {
              result: "completed",
              winnerColor: "black",
              blackWins: 2,
              whiteWins: 1,
              turns: 9,
            }
        : {}),
    });
  }
}
const all = await request(`/api/admin/events?player=${id}`);
assert.deepEqual(
  new Set(all.events.map((e) => e.game)),
  new Set(["shapeit", "pushit"]),
);
assert.equal(all.events.length, 2);
assert.ok(all.events.every((e) => e.kind === "finish"));
assert.equal(all.players.find((p) => p.profileId === id).games, 2);
for (const game of ["shapeit", "pushit", "chessit"]) {
  const data = await request(`/api/admin/events?game=${game}&player=${id}`);
  assert.ok(data.events.every((e) => e.game === game && e.profileId === id));
  const player = data.players.find((p) => p.profileId === id);
  if (game === "chessit") assert.equal(player, undefined);
  else {
    assert.equal(player.games, 1);
    assert.equal(player.finishes, 1);
  }
}
const push = await request("/api/admin/events?game=pushit");
assert.ok(
  push.events.some(
    (e) =>
      e.mode === "online" &&
      e.kind === "finish" &&
      e.blackWins === 2 &&
      e.whiteWins === 1,
  ),
  "run pushit.http.integration.mjs first to create an authoritative series",
);
assert.ok(!JSON.stringify(push).includes('"token"'));
await request(
  "/api/events",
  {
    id: `${id}:forged`,
    profileId: id,
    name,
    game: "pushit",
    kind: "finish",
    mode: "online",
    size: "4x4",
  },
  400,
);
await request("/api/admin/events?game=unknown", null, 400);
const beforeDelete = await request(`/api/admin/events?player=${id}`);
assert.equal(beforeDelete.events.length, 2);
const deleted = await request("/api/admin/events/delete-player", {
  profileId: id,
});
assert.equal(deleted.deleted, 5); // Hidden starts and the preview visit are removed as well.
const afterDelete = await request(`/api/admin/events?player=${id}`);
assert.deepEqual(afterDelete.events, []);
assert.ok(!afterDelete.players.some((p) => p.profileId === id));
await request("/api/admin/events/delete-player", { profileId: "" }, 400);

console.log(
  `PASS: ${calls} shared-platform API requests; three games, legacy events, combined game/player filters, player totals, authoritative PushIt series and forged-online rejection.`,
);
