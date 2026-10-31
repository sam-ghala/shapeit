import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  createCaptureRoom,
  joinCaptureRoom,
  captureRoomView,
  applyCaptureAction,
} from "../src/games/captureit/rooms.js";
import {
  createGame,
  legalMoves,
  validGame,
} from "../src/games/captureit/engine.js";
import { GameService } from "../src/platform/server/GameService.js";

const profile = (index) => ({
  id: `capture-player-${index}`,
  name: `Player ${index}`,
});
const action = (room, index, body) =>
  applyCaptureAction(room, index, { revision: room.revision, ...body });
function playingRoom() {
  const room = createCaptureRoom("0042", profile(0));
  joinCaptureRoom(room, profile(1));
  action(room, 0, { type: "start" });
  return room;
}
function move(game) {
  for (const piece of game.pieces) {
    const to = legalMoves(game, piece.cell)[0];
    if (to) return { type: "move", from: piece.cell, to };
  }
  throw new Error("No move in fixture.");
}

test("CaptureIt room has private seats, a host-controlled lobby and White always starts", () => {
  assert.throws(
    () => createCaptureRoom("0042", { id: "bad", name: "" }),
    /name/,
  );
  const room = createCaptureRoom("0042", profile(0), 1000);
  assert.equal(room.expiresAt, 1000 + 2 * 60 * 60_000);
  assert.equal(room.players[0].color, "white");
  assert.throws(() => action(room, 0, { type: "start" }), /both players/);
  assert.throws(() => joinCaptureRoom(room, profile(0)), /different browser/);
  action(room, 0, { type: "color", color: "black" });
  const guestToken = joinCaptureRoom(room, profile(1));
  assert.equal(room.players[1].color, "white");
  assert.equal(guestToken, room.players[1].token);
  assert.notEqual(guestToken, room.players[0].token);
  assert.throws(() => joinCaptureRoom(room, profile(2)), /full/);
  assert.throws(
    () => action(room, 1, { type: "color", color: "white" }),
    /host/,
  );
  assert.throws(
    () => action(room, 0, { type: "color", color: "red" }),
    /White/,
  );
  assert.throws(() => action(room, 1, { type: "start" }), /host/);
  action(room, 0, {
    type: "start",
    starter: "black",
    game: { winner: "black" },
  });
  assert.equal(room.phase, "playing");
  assert.deepEqual(room.game, createGame());
  assert.throws(
    () => action(room, 0, { type: "color", color: "white" }),
    /locked/,
  );
  const view = captureRoomView(room, 1);
  assert.equal(view.you, 1);
  assert.equal(view.undoStack, undefined);
  for (const player of room.players)
    assert.ok(!JSON.stringify(view).includes(player.token));
});

test("CaptureIt rejects invalid actors, stale actions, illegal moves and unpaid exchanges without changing the room", () => {
  const room = playingRoom();
  const before = structuredClone(room);
  for (const [index, body, error] of [
    [-1, { type: "leave" }, /access/],
    [2, { type: "move" }, /access/],
    [1, move(room.game), /opponent/],
    [0, { type: "move", from: "fake", to: "fake" }, /neighboring/],
    [
      0,
      {
        type: "exchange",
        target: room.game.pieces.find((p) => p.color === "black").cell,
      },
      /two tiles/,
    ],
    [0, { type: "pass" }, /Passing/],
    [0, { ...move(room.game), revision: room.revision - 1 }, /board changed/],
  ]) {
    assert.throws(() => action(room, index, body), error);
    assert.deepEqual(room, before);
  }
  action(room, 0, {
    ...move(room.game),
    winner: "white",
    collected: { white: 99 },
  });
  assert.equal(room.game.current, "black");
  assert.equal(room.game.winner, null);
  assert.ok(validGame(room.game));
});

test("CaptureIt undo restores a full turn only with the other player's consent", () => {
  const room = playingRoom();
  const before = structuredClone(room.game);
  action(room, 0, move(room.game));
  const after = structuredClone(room.game);
  assert.equal(captureRoomView(room, 0).canUndo, true);
  assert.equal(captureRoomView(room, 1).canUndo, false);
  assert.throws(() => action(room, 1, { type: "undo" }), /latest move/);
  action(room, 0, { type: "undo" });
  assert.equal(captureRoomView(room, 0).canUndo, false);
  assert.throws(
    () => action(room, 0, { type: "undo-response", accept: true }),
    /opponent/,
  );
  assert.throws(
    () => action(room, 1, { type: "undo-response", accept: "yes" }),
    /decline/,
  );
  assert.throws(() => action(room, 1, move(room.game)), /Resolve/);
  action(room, 1, { type: "undo-response", accept: false });
  assert.deepEqual(room.game, after);
  action(room, 0, { type: "undo" });
  action(room, 1, { type: "undo-response", accept: true });
  assert.deepEqual(room.game, before);
  assert.equal(room.undoStack.length, 0);
  action(room, 0, move(room.game));
  action(room, 1, move(room.game));
  assert.throws(() => action(room, 0, { type: "undo" }), /latest move/);
  assert.equal(captureRoomView(room, 1).canUndo, true);
});

test("CaptureIt exchanges use the authoritative tile bank and are reversible by consent", () => {
  const room = playingRoom();
  room.game.collected.white = 2;
  const target = room.game.pieces.find((p) => p.color === "black").cell;
  const before = structuredClone(room.game);
  action(room, 0, { type: "exchange", target });
  assert.equal(room.game.collected.white, 0);
  assert.ok(!room.game.pieces.some((p) => p.cell === target));
  assert.equal(room.game.current, "black");
  action(room, 0, { type: "undo" });
  action(room, 1, { type: "undo-response", accept: true });
  assert.deepEqual(room.game, before);
});

test("CaptureIt resignation awards the opponent, rematch swaps colors and keeps player scores", () => {
  const room = playingRoom();
  const gameId = room.gameId;
  // Black may resign on White's turn; a payload cannot choose the winner.
  action(room, 1, { type: "resign", winner: "black" });
  assert.equal(room.game.winner, "white");
  assert.equal(room.game.current, "black");
  assert.ok(validGame(room.game));
  assert.equal(room.phase, "finished");
  assert.deepEqual(room.wins, [1, 0]);
  assert.equal(room.undoStack.length, 0);
  assert.throws(() => action(room, 1, { type: "undo" }), /latest move/);
  action(room, 0, { type: "rematch" });
  action(room, 0, { type: "rematch" });
  assert.equal(room.phase, "finished");
  assert.deepEqual(room.rematch, [0]);
  action(room, 1, { type: "rematch" });
  assert.equal(room.phase, "playing");
  assert.equal(room.round, 2);
  assert.notEqual(room.gameId, gameId);
  assert.equal(room.players[0].color, "black");
  assert.equal(room.players[1].color, "white");
  assert.equal(room.game.current, "white");
  assert.deepEqual(room.wins, [1, 0]);
  action(room, 0, { type: "resign" });
  assert.deepEqual(room.wins, [1, 1]);
});

test("simultaneous CaptureIt rematch votes apply only to their completed game", () => {
  const room = playingRoom();
  action(room, 0, { type: "resign" });
  const vote = {
    type: "rematch",
    revision: room.revision,
    gameId: room.gameId,
  };
  action(room, 0, vote);
  assert.throws(
    () => action(room, 1, { ...vote, gameId: undefined }),
    /board changed/,
  );
  assert.throws(
    () => action(room, 1, { ...vote, gameId: "another-game" }),
    /board changed/,
  );
  assert.throws(
    () => action(room, 1, { ...vote, revision: room.revision + 1 }),
    /board changed/,
  );
  assert.deepEqual(room.rematch, [0]);
  action(room, 1, vote);
  assert.equal(room.phase, "playing");
  assert.equal(room.round, 2);
  assert.notEqual(room.gameId, vote.gameId);
  assert.deepEqual(room.rematch, []);
  assert.throws(() => action(room, 0, vote), /board changed/);
  action(room, 0, { type: "resign" });
  assert.throws(() => action(room, 0, vote), /board changed/);
  assert.throws(
    () => action(room, 0, { ...vote, revision: room.revision }),
    /board changed/,
  );
  assert.deepEqual(room.rematch, []);
});

test("either CaptureIt player can resign during an undo or restart request", () => {
  for (const request of ["undo", "reset"]) {
    for (const index of [0, 1]) {
      const room = playingRoom();
      action(room, 0, move(room.game));
      action(room, 0, { type: request });
      action(room, index, { type: "resign" });
      assert.equal(room.phase, "finished");
      assert.equal(room.game.winner, room.players[1 - index].color);
      assert.equal(room.wins[1 - index], 1);
      assert.equal(room.undoRequest, null);
      assert.deepEqual(room.reset, []);
      assert.ok(validGame(room.game));
    }
  }
});

test("CaptureIt reset requires both players, and departure closes immediately and idempotently", () => {
  const room = playingRoom();
  action(room, 0, move(room.game));
  action(room, 0, { type: "reset" });
  assert.equal(room.game.turn, 2);
  assert.equal(captureRoomView(room, 0).canUndo, false);
  assert.throws(() => action(room, 0, { type: "undo" }), /latest move/);
  assert.throws(() => action(room, 1, move(room.game)), /restart request/);
  assert.throws(
    () => action(room, 0, { type: "reset-response", accept: false }),
    /opponent/,
  );
  assert.throws(
    () => action(room, 1, { type: "reset-response", accept: "yes" }),
    /decline/,
  );
  action(room, 1, { type: "reset-response", accept: false });
  action(room, 1, move(room.game));
  assert.deepEqual(room.reset, []);
  const gameId = room.gameId;
  action(room, 0, { type: "reset" });
  action(room, 1, { type: "reset" });
  assert.deepEqual(room.game, createGame());
  assert.equal(room.round, 1);
  assert.notEqual(room.gameId, gameId);
  assert.deepEqual(room.wins, [0, 0]);
  action(room, 1, { type: "leave", revision: -1 });
  assert.equal(room.phase, "closed");
  const revision = room.revision;
  action(room, 0, { type: "leave" });
  assert.equal(room.revision, revision);
  assert.throws(() => action(room, 0, { type: "start" }), /closed/);
  assert.throws(() => joinCaptureRoom(room, profile(2)), /full/);
});

function serviceFixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const sql = { exec: (query, ...args) => db.prepare(query).all(...args) };
  const service = new GameService({
    storage: { sql, transactionSync: (fn) => fn() },
  });
  const events = () =>
    [...sql.exec("SELECT data FROM events")].map((r) => JSON.parse(r.data));
  async function request(path, body, token, expected = 200) {
    const response = await service.fetch(
      new Request(`https://local.test${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  }
  return { sql, events, request };
}

test("CaptureIt HTTP authorization and lifecycle produce deduplicated results for both players", async (t) => {
  const f = serviceFixture(t);
  const created = await f.request(
    "/api/captureit/rooms",
    { profile: profile(0) },
    null,
    201,
  );
  const path = `/api/captureit/rooms/${created.room.code}`;
  await f.request(path, null, null, 403);
  await f.request(path, null, "fake-token", 403);
  const joined = await f.request(`${path}/join`, { profile: profile(1) });
  const tokens = [created.token, joined.token];
  let room = joined.room;
  const send = async (index, body, expected = 200) => {
    const response = await f.request(
      `${path}/action`,
      { revision: room.revision, ...body },
      tokens[index],
      expected,
    );
    if (response.room) room = response.room;
  };
  await f.request(
    `${path}/action`,
    { type: "start", revision: room.revision },
    "fake-token",
    403,
  );
  await send(0, { type: "start" });
  const firstId = room.gameId;
  assert.equal(f.events().filter((e) => e.kind === "start").length, 2);
  await send(0, { type: "start" }, 400);
  await send(1, { type: "resign" });
  const finishes = f.events().filter((e) => e.kind === "finish");
  assert.equal(finishes.length, 2);
  assert.deepEqual(
    finishes.map((e) => e.result),
    ["won", "lost"],
  );
  assert.ok(
    finishes.every((e) => e.sessionId === firstId && e.winnerColor === "white"),
  );
  await f.request(path, null, tokens[0]);
  await send(1, { type: "resign" }, 400);
  assert.equal(f.events().length, 4);
  await send(0, { type: "rematch" });
  await send(1, { type: "rematch" });
  const secondId = room.gameId;
  await send(0, { type: "reset" });
  await send(1, { type: "reset" });
  assert.equal(
    f.events().filter((e) => e.sessionId === secondId && e.kind === "abort")
      .length,
    2,
  );
  await send(0, { type: "leave" });
  await send(1, { type: "leave" });
  assert.equal(f.events().filter((e) => e.kind === "abort").length, 4);
  assert.equal(f.events().filter((e) => e.kind === "start").length, 6);
  for (const token of tokens)
    assert.ok(!JSON.stringify(f.events()).includes(token));
  assert.ok(
    f
      .events()
      .every(
        (e) =>
          e.game === "captureit" &&
          e.mode === "online" &&
          !e.gameState &&
          !e.pieces,
      ),
  );
  await f.request(
    "/api/events",
    {
      id: "forged-online-finish",
      game: "captureit",
      profileId: profile(0).id,
      name: profile(0).name,
      kind: "finish",
      mode: "online",
      size: "classic",
    },
    null,
    400,
  );
});

test("CaptureIt expiration records each active abort once and leaves lobbies and results alone", async (t) => {
  const f = serviceFixture(t);
  for (const [index, phase] of ["playing", "lobby", "finished"].entries()) {
    const room = playingRoom();
    room.code = `300${index}`;
    room.phase = phase;
    room.startedAt = Date.now() - 10_000;
    room.expiresAt = Date.now() - 1000;
    f.sql.exec(
      "INSERT INTO captureit_rooms VALUES (?,?,?)",
      room.code,
      JSON.stringify(room),
      room.expiresAt,
    );
  }
  await f.request("/api/captureit/rooms/3000", null, null, 404);
  await f.request("/api/admin/events");
  assert.equal(f.events().length, 2);
  assert.ok(f.events().every((e) => e.kind === "abort" && e.seconds === 9));
  assert.equal(
    [...f.sql.exec("SELECT count(*) AS count FROM captureit_rooms")][0].count,
    0,
  );
});

test("CaptureIt room creation uses the shared create rate limit", async (t) => {
  const f = serviceFixture(t);
  for (let i = 0; i < 6; i++)
    await f.request("/api/captureit/rooms", { profile: profile(i) }, null, 201);
  await f.request("/api/captureit/rooms", { profile: profile(6) }, null, 429);
  assert.equal(
    [...f.sql.exec("SELECT count(*) AS count FROM captureit_rooms")][0].count,
    6,
  );
});
