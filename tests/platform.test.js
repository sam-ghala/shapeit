import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resolveGame, gameHref, gamePath } from "../src/platform/routing.js";
import { recordEvent, activityView } from "../src/platform/server/activity.js";
import { getProfile, saveProfile, PROFILE_KEY } from "../src/shared/profile.js";

test("subdomains select independent games while existing paths and preview links keep working", () => {
  for (const id of ["shapeit", "pushit", "chessit"]) {
    assert.equal(
      resolveGame({ hostname: `${id}.playshapeit.com`, pathname: "/" }),
      id,
    );
    assert.equal(
      resolveGame({ hostname: "127.0.0.1", pathname: `/${id}` }),
      id,
    );
    assert.equal(gamePath(id, { hostname: `${id}.playshapeit.com` }), "/");
  }
  assert.equal(
    resolveGame({ hostname: "playshapeit.com", pathname: "/" }),
    "shapeit",
  );
  assert.equal(
    resolveGame({ hostname: "pushit.playshapeit.com", pathname: "/chessit" }),
    "chessit",
  );
  assert.equal(
    gameHref("pushit", { hostname: "playshapeit.com" }, true),
    "https://pushit.playshapeit.com/",
  );
  assert.equal(
    gameHref("shapeit", { hostname: "chessit.playshapeit.com" }, true),
    "https://playshapeit.com/",
  );
  assert.equal(gameHref("chessit", { hostname: "127.0.0.1" }), "/chessit");
  assert.equal(
    gameHref("pushit", { hostname: "playshapeit.com" }, false),
    "/pushit",
  );
});

test("the public profile migrates and shares across game subdomains without sharing game storage", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
  };
  globalThis.location = { hostname: "playshapeit.com" };
  let cookie = "",
    attributes = "";
  globalThis.document = {
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      attributes = value;
      cookie = value.split(";")[0];
    },
  };
  store.set(
    PROFILE_KEY,
    JSON.stringify({ id: "existing-player", name: "Robin" }),
  );
  store.set("pushit:room", JSON.stringify({ token: "private-seat-token" }));
  assert.deepEqual(getProfile(), { id: "existing-player", name: "Robin" });
  assert.match(
    attributes,
    /Domain=playshapeit.com; Path=\/; Max-Age=31536000; SameSite=Lax; Secure/,
  );
  assert.ok(!attributes.includes("private-seat-token"));
  store.clear();
  location.hostname = "pushit.playshapeit.com";
  assert.equal(getProfile().name, "Robin");
  assert.equal(getProfile().id, "existing-player");
  saveProfile({ ...getProfile(), name: "Sam" });
  store.clear();
  location.hostname = "chessit.playshapeit.com";
  assert.equal(getProfile().name, "Sam");
  assert.equal(getProfile().id, "existing-player");
  assert.equal(store.has("pushit:room"), false);
  location.hostname = "localhost";
  cookie = "";
  store.clear();
  store.set(PROFILE_KEY, JSON.stringify({ id: "local-player", name: "Local" }));
  assert.equal(getProfile().name, "Local");
  assert.equal(cookie, "");
  delete globalThis.document;
  delete globalThis.location;
  delete globalThis.localStorage;
});

test("admin filters events and player totals by game and keeps legacy ShapeIt activity", () => {
  const db = new DatabaseSync(":memory:");
  const sql = { exec: (query, ...args) => db.prepare(query).all(...args) };
  sql.exec(
    "CREATE TABLE events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL)",
  );
  const now = Date.now(),
    common = {
      profileId: "shared-player",
      name: "Robin",
      sessionId: "same-round",
      at: new Date(now).toISOString(),
    };
  const old = {
    ...common,
    id: "legacy",
    kind: "finish",
    mode: "daily",
    size: "compact",
    occurredAt: common.at,
  };
  sql.exec(
    "INSERT INTO events VALUES (?,?,?)",
    old.id,
    now,
    JSON.stringify(old),
  );
  recordEvent(
    sql,
    {
      ...common,
      id: "push-start",
      game: "pushit",
      kind: "start",
      mode: "online",
      size: "4x4",
    },
    now,
  );
  recordEvent(
    sql,
    {
      ...common,
      id: "push-finish",
      game: "pushit",
      kind: "finish",
      mode: "online",
      size: "4x4",
      result: "won",
      turns: 5,
      blackWins: 2,
      whiteWins: 1,
      token: "secret",
    },
    now,
  );
  recordEvent(
    sql,
    {
      ...common,
      id: "chess-preview",
      game: "chessit",
      kind: "visit",
      mode: "preview",
      size: "8x8",
    },
    now,
  );
  const all = activityView(sql, new URLSearchParams());
  assert.equal(all.events.length, 4);
  assert.equal(all.players.length, 1);
  assert.equal(all.players[0].games, 2); // Same session ID in two games is still two games.
  assert.equal(all.players[0].finishes, 2);
  assert.equal(all.events.find((e) => e.id === "legacy").game, "shapeit");
  const push = activityView(
    sql,
    new URLSearchParams("game=pushit&player=shared-player"),
  );
  assert.equal(push.events.length, 2);
  assert.equal(push.players[0].games, 1);
  assert.equal(push.events.find((e) => e.kind === "finish").turns, 5);
  assert.ok(!JSON.stringify(push).includes("secret"));
  const shape = activityView(sql, new URLSearchParams("game=shapeit"));
  assert.equal(shape.events.length, 1);
  assert.equal(shape.events[0].id, "legacy");
  assert.equal(
    activityView(sql, new URLSearchParams("game=chessit")).players[0].games,
    0,
  );
  assert.throws(
    () => activityView(sql, new URLSearchParams("game=bad")),
    /Unknown game/,
  );
  assert.throws(
    () =>
      recordEvent(
        sql,
        {
          ...common,
          id: "bad",
          game: "pushit",
          kind: "finish",
          mode: "daily",
          size: "compact",
        },
        now,
      ),
    /Invalid activity/,
  );
  db.close();
});

test("games and shared building blocks never import another game's implementation", async () => {
  async function files(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((e) =>
          e.isDirectory()
            ? files(path.join(dir, e.name))
            : [path.join(dir, e.name)],
        ),
      )
    ).flat();
  }
  for (const owner of ["shapeit", "pushit", "chessit", "shared"]) {
    const dir = owner === "shared" ? "src/shared" : `src/games/${owner}`;
    for (const file of await files(dir)) {
      if (!/\.(jsx?|css)$/.test(file)) continue;
      const source = await readFile(file, "utf8");
      for (const [, target] of source.matchAll(
        /(?:from\s*|import\s*)["'](\.[^"']+)["']/g,
      )) {
        const resolved = path.normalize(path.join(path.dirname(file), target));
        const other = resolved.match(
          /^src\/games\/(shapeit|pushit|chessit)\//,
        )?.[1];
        assert.ok(!other || other === owner, `${file} imports ${resolved}`);
      }
    }
  }
});
