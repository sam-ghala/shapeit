import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { GameService } from "../src/platform/server/GameService.js";
import {
  createPushRoom,
  joinPushRoom,
  applyPushAction,
} from "../src/games/pushit/rooms.js";
import {
  createRoom,
  joinRoom,
  applyAction,
} from "../src/games/shapeit/server/duel.js";

function serviceFixture() {
  const db = new DatabaseSync(":memory:");
  const sql = { exec: (query, ...args) => db.prepare(query).all(...args) };
  const service = new GameService({
    storage: { sql, transactionSync: (fn) => fn() },
  });
  const save = (table, room) =>
    sql.exec(
      `INSERT INTO ${table} (code,data,expires) VALUES (?,?,?)`,
      room.code,
      JSON.stringify(room),
      room.expiresAt,
    );
  const read = (table, code) =>
    JSON.parse(
      [...sql.exec(`SELECT data FROM ${table} WHERE code = ?`, code)][0].data,
    );
  async function action(game, room, index, body) {
    const url = `https://local.test/api/${game === "pushit" ? "pushit/" : ""}rooms/${room.code}/action`;
    const response = await service.fetch(
      new Request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${room.players[index].token}`,
        },
        body: JSON.stringify({
          ...body,
          ...(game === "pushit" ? { revision: room.revision } : {}),
        }),
      }),
    );
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  }
  const events = () =>
    [...sql.exec("SELECT data FROM events")].map((row) => JSON.parse(row.data));
  return { db, sql, service, save, read, action, events };
}
const profile = (i) => ({ id: `activity-player-${i}`, name: `Player ${i}` });
function pushRoom(code = "1001", phase = "playing") {
  const room = createPushRoom(code, profile(0));
  joinPushRoom(room, profile(1));
  if (phase !== "lobby")
    applyPushAction(room, 0, { type: "start", revision: room.revision });
  room.phase = phase;
  return room;
}
function shapeRoom(code = "2001", phase = "setup") {
  const room = createRoom(code, profile(0), true, {});
  joinRoom(room, profile(1), true);
  room.phase = phase;
  return room;
}

test("CaptureIt accepts deduplicated local activity, filters private fields and rejects unsupported modes", async () => {
  const f = serviceFixture();
  const post = (body) =>
    f.service.fetch(
      new Request("https://local.test/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const common = {
    game: "captureit",
    profileId: "capture-player",
    name: "Robin",
    mode: "local",
    size: "classic",
  };
  try {
    for (const kind of ["visit", "start", "finish", "abort"]) {
      const event = {
        ...common,
        id: `captureit:round:${kind}`,
        sessionId: kind === "abort" ? "discarded-round" : "round",
        kind,
        ...(kind === "finish"
          ? {
              result: "completed",
              winnerColor: "white",
              turns: 27,
              seconds: 350,
              board: { private: true },
              token: "private-token",
            }
          : {}),
      };
      for (let retry = 0; retry < 2; retry++) {
        const response = await post(event);
        assert.equal(
          response.status,
          200,
          JSON.stringify(await response.json()),
        );
      }
    }
    assert.equal(f.events().length, 4);
    const response = await f.service.fetch(
      new Request(
        "https://local.test/api/admin/events?game=captureit&player=capture-player",
      ),
    );
    const activity = await response.json();
    assert.equal(response.status, 200);
    assert.equal(activity.events.length, 2);
    assert.equal(activity.players[0].games, 2);
    assert.equal(activity.players[0].finishes, 1);
    assert.equal(activity.players[0].aborts, 1);
    const finish = activity.events.find((event) => event.kind === "finish");
    assert.equal(finish.winnerColor, "white");
    assert.equal(finish.turns, 27);
    assert.equal(finish.seconds, 350);
    assert.equal(finish.result, "completed");
    assert.ok(!JSON.stringify(activity).includes("private"));
    for (const invalid of [
      { mode: "online" },
      { mode: "preview" },
      { size: "4x4" },
      { kind: "move" },
      { game: "pushit", mode: "local", size: "4x4", kind: "visit" },
      { game: "shapeit", mode: "daily", size: "compact", kind: "visit" },
    ]) {
      const response = await post({
        ...common,
        id: crypto.randomUUID(),
        kind: "finish",
        ...invalid,
      });
      assert.equal(response.status, 400, JSON.stringify(invalid));
    }
    assert.equal(f.events().length, 4);
  } finally {
    f.db.close();
  }
});

test("PushIt reset and leave record each unfinished attempt once; finished games and lobbies are not aborted", async () => {
  const f = serviceFixture();
  try {
    let room = pushRoom();
    f.save("pushit_rooms", room);
    const firstId = room.gameId;
    await f.action("pushit", room, 0, { type: "reset" });
    room = f.read("pushit_rooms", room.code);
    assert.equal(f.events().length, 0);
    await f.action("pushit", room, 1, { type: "reset" });
    room = f.read("pushit_rooms", room.code);
    assert.notEqual(room.gameId, firstId);
    assert.equal(
      f.events().filter((e) => e.kind === "abort" && e.sessionId === firstId)
        .length,
      2,
    );
    await f.action("pushit", room, 0, { type: "leave" });
    room = f.read("pushit_rooms", room.code);
    assert.equal(f.events().filter((e) => e.kind === "abort").length, 4);
    await f.action("pushit", room, 0, { type: "leave" });
    assert.equal(f.events().filter((e) => e.kind === "abort").length, 4);
    for (const phase of ["finished", "complete", "lobby"]) {
      const other = pushRoom(
        String(1002 + ["finished", "complete", "lobby"].indexOf(phase)),
        phase,
      );
      f.save("pushit_rooms", other);
      await f.action("pushit", other, 0, { type: "leave" });
    }
    assert.equal(f.events().filter((e) => e.kind === "abort").length, 4);
  } finally {
    f.db.close();
  }
});

test("ShapeIt departures abort active games, with a separate abort for a guest leaving a group race", async () => {
  const f = serviceFixture();
  try {
    const room = shapeRoom();
    f.save("rooms", room);
    await f.action("shapeit", room, 0, { type: "leave" });
    assert.equal(f.events().filter((e) => e.kind === "abort").length, 2);
    const lobby = shapeRoom("2002", "lobby");
    f.save("rooms", lobby);
    await f.action("shapeit", lobby, 0, { type: "leave" });
    assert.equal(f.events().filter((e) => e.kind === "abort").length, 2);
    let group = createRoom("2003", profile(0), true, { mode: "random" });
    joinRoom(group, profile(1), true);
    joinRoom(group, profile(2), true);
    applyAction(group, 0, { type: "start" }, Date.now() - 5000);
    f.save("rooms", group);
    await f.action("shapeit", group, 2, { type: "leave" });
    group = f.read("rooms", group.code);
    assert.equal(group.phase, "playing");
    assert.equal(group.players[2].activityAborted, true);
    const aborts = f
      .events()
      .filter((e) => e.kind === "abort" && e.sessionId === group.id);
    assert.equal(aborts.length, 1);
    assert.equal(aborts[0].profileId, profile(2).id);
    await f.action("shapeit", group, 0, { type: "leave" });
    assert.equal(
      f.events().filter((e) => e.kind === "abort" && e.sessionId === group.id)
        .length,
      3,
    );
  } finally {
    f.db.close();
  }
});

test("expired active rooms become aborted activity on the next admin request, without marking expired lobbies or completed rounds", async () => {
  const f = serviceFixture();
  try {
    for (const room of [
      pushRoom("3001"),
      pushRoom("3002", "finished"),
      pushRoom("3003", "lobby"),
    ]) {
      room.expiresAt = Date.now() - 1;
      f.save("pushit_rooms", room);
    }
    const shape = shapeRoom("4001");
    shape.expiresAt = Date.now() - 1;
    f.save("rooms", shape);
    for (let i = 0; i < 2; i++) {
      const res = await f.service.fetch(
        new Request("https://local.test/api/admin/events"),
      );
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.events.length, 4);
      assert.ok(data.events.every((e) => e.kind === "abort"));
    }
    assert.equal(
      [...f.sql.exec("SELECT count(*) AS count FROM rooms")][0].count,
      0,
    );
    assert.equal(
      [...f.sql.exec("SELECT count(*) AS count FROM pushit_rooms")][0].count,
      0,
    );
  } finally {
    f.db.close();
  }
});

test("an expired room whose final-attempt deadline already passed records a finish rather than an abort", async () => {
  const f = serviceFixture();
  try {
    const room = createRoom("5001", profile(0), true, { mode: "random" });
    joinRoom(room, profile(1), true);
    applyAction(room, 0, { type: "start" }, Date.now() - 120000);
    room.settings.mode = "turns";
    room.phase = "final";
    room.deadline = Date.now() - 60000;
    room.expiresAt = Date.now() - 1;
    room.players[0].submission = { correct: false, seconds: 5, score: 0 };
    f.save("rooms", room);
    const response = await f.service.fetch(
      new Request("https://local.test/api/admin/events"),
    );
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.events.length, 2);
    assert.ok(data.events.every((e) => e.kind === "finish"));
    assert.ok(data.events.every((e) => e.result === "lost"));
  } finally {
    f.db.close();
  }
});
