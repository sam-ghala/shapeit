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
