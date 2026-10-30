import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

async function access(key, secret) {
  const env = {
    ADMIN_KEY: secret,
    GAME_SERVICE: {
      idFromName: (name) => name,
      get: () => ({ fetch: () => Response.json({ events: [] }) }),
    },
  };
  return worker.fetch(
    new Request("https://shapeit.test/api/admin/events", {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    }),
    env,
  );
}

test("temporary admin key works only when no server secret is configured", async () => {
  assert.equal((await access("Admin")).status, 200);
  assert.equal((await access()).status, 401);
  assert.equal((await access("wrong")).status, 401);
  assert.equal((await access("Admin", "private-test-secret")).status, 401);
  assert.equal(
    (await access("private-test-secret", "private-test-secret")).status,
    200,
  );
});

test("player event deletion requires the configured admin key before any storage access", async () => {
  let calls = 0;
  const env = {
    ADMIN_KEY: "private-delete-key",
    GAME_SERVICE: {
      idFromName: (name) => name,
      get: () => ({
        fetch: () => {
          calls++;
          return Response.json({ ok: true, deleted: 3 });
        },
      }),
    },
  };
  const remove = (token) =>
    worker.fetch(
      new Request("https://shapeit.test/api/admin/events/delete-player", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profileId: "delete-player" }),
      }),
      env,
    );
  assert.equal((await remove()).status, 401);
  assert.equal((await remove("Admin")).status, 401);
  assert.equal(calls, 0);
  assert.equal((await remove("private-delete-key")).status, 200);
  assert.equal(calls, 1);
});
