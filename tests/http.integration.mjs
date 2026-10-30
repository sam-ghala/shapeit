import assert from "node:assert/strict";
import {
  solutionDrawing,
  generatePuzzle,
  emptyBoard,
  calcScore,
} from "../src/games/shapeit/game/engine.js";
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
const boards = [host.players[0], guest.players[1]].map(
  (p, i) => generatePuzzle(`http:${i}`, p.pieces, 7, 5).placed,
);
assert.deepEqual(host.players[0].placed, []);
assert.equal(host.deadline, null);
await action(0, { type: "ready", placed: [] }, 400);
await action(0, { type: "place", placed: boards[0].slice(0, 1) });
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
  kind: "abort",
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
const hostSummary = activity.players.find((p) => p.profileId === p1.id);
assert.equal(hostSummary.name, p1.name);
assert.equal(hostSummary.games, 2);
assert.equal(hostSummary.finishes, 1);
assert.equal(hostSummary.aborts, 1);
const filteredActivity = await request(`/api/admin/events?player=${p1.id}`, {
  token: adminKey,
});
assert.ok(filteredActivity.events.length > 0);
assert.ok(filteredActivity.events.every((e) => e.profileId === p1.id));
assert.ok(filteredActivity.players.some((p) => p.profileId === p2.id));
const emptyActivity = await request("/api/admin/events?player=unknown-player", {
  token: adminKey,
});
assert.deepEqual(emptyActivity.events, []);
assert.equal(
  activity.events.filter((e) => e.sessionId === finished.id).length,
  2,
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
// Exercise the simultaneous mode through the real Worker and durable storage.
const raceCreated = await request("/api/rooms", {
  body: {
    profile: { id: crypto.randomUUID(), name: "Race host" },
    mobile: true,
  },
  status: 201,
});
const raceCode = raceCreated.room.code;
const raceJoined = await request(`/api/rooms/${raceCode}/join`, {
  body: {
    profile: { id: crypto.randomUUID(), name: "Race guest" },
    mobile: false,
  },
});
const raceTokens = [raceCreated.token, raceJoined.token];
const raceAction = (i, body, status = 200) =>
  request(`/api/rooms/${raceCode}/action`, {
    token: raceTokens[i],
    body,
    status,
  });
const raceRead = (i) =>
  request(`/api/rooms/${raceCode}`, { token: raceTokens[i] });
await raceAction(0, {
  type: "settings",
  settings: { mode: "race", extras: { diamond: true } },
});
await raceAction(1, { type: "settings", settings: { mode: "turns" } }, 400);
const setupRace = (await raceAction(0, { type: "start" })).room;
const raceBoards = setupRace.players.map(
  (p, i) => generatePuzzle(`http-race:${i}`, p.pieces, 7, 5).placed,
);
await raceAction(0, { type: "ready", placed: raceBoards[0] });
const raceCountdown = (
  await raceAction(1, { type: "ready", placed: raceBoards[1] })
).room;
assert.ok(raceCountdown.startedAt > raceCountdown.serverNow);
await raceAction(0, { type: "laser", side: "top", idx: 0 }, 400);
await new Promise((resolve) =>
  setTimeout(resolve, Math.max(0, raceCountdown.startedAt - Date.now() + 30)),
);
await raceAction(0, { type: "laser", side: "top", idx: 0 });
await raceAction(1, { type: "laser", side: "top", idx: 0 });
const raceDraft = { guess: emptyBoard(7, 5), edges: { "h-0-0": "red" } };
assert.deepEqual(
  await raceAction(1, {
    type: "draft",
    roundId: setupRace.id,
    drawing: raceDraft,
  }),
  { ok: true },
);
assert.equal((await raceRead(0)).room.players[1].draft, undefined);
const firstRace = (
  await raceAction(0, {
    type: "submit",
    drawing: solutionDrawing(raceBoards[1], 7, 5),
    score: 1,
    seconds: 9999,
  })
).room;
assert.equal(firstRace.phase, "playing");
assert.equal(firstRace.deadline, null);
assert.equal(firstRace.players[1].draft, undefined);
assert.ok(firstRace.players.every((p) => p.placed === undefined));
assert.equal((await raceRead(1)).room.players[0].submission, undefined);
await raceAction(0, { type: "draft", drawing: raceDraft }, 400);
const raceDone = (await raceAction(1, { type: "submit", drawing: raceDraft }))
  .room;
assert.equal(raceDone.phase, "finished");
assert.equal(raceDone.winner, 0);
assert.equal(
  raceDone.players[0].submission.score,
  calcScore(raceDone.players[0].submission.seconds, 1, { diamond: true }),
);
assert.deepEqual(raceDone.wins, [1, 0]);
assert.deepEqual((await raceRead(1)).room.wins, [1, 0]);
await raceAction(0, { type: "rematch" });
await raceAction(1, { type: "rematch" });
const nextRace = (await raceRead(0)).room;
assert.deepEqual(nextRace.wins, [1, 0]);
assert.equal(nextRace.settings.mode, "race");
assert.equal(nextRace.phase, "setup");
await raceAction(
  1,
  { type: "draft", roundId: setupRace.id, drawing: raceDraft },
  400,
);
// Random races must not reveal either copy of the shared puzzle until finished.
const randomCreated = await request("/api/rooms", {
  body: {
    profile: { id: crypto.randomUUID(), name: "Random host" },
    mobile: true,
  },
  status: 201,
});
const randomCode = randomCreated.room.code;
const randomJoined = await request(`/api/rooms/${randomCode}/join`, {
  body: {
    profile: { id: crypto.randomUUID(), name: "Random guest" },
    mobile: false,
  },
});
const randomTokens = [randomCreated.token, randomJoined.token];
const randomAction = (i, body) =>
  request(`/api/rooms/${randomCode}/action`, { token: randomTokens[i], body });
await randomAction(0, {
  type: "settings",
  settings: { mode: "random", extras: true },
});
const randomStart = (await randomAction(0, { type: "start" })).room;
assert.equal(randomStart.phase, "playing");
assert.ok(randomStart.players.every((p) => p.ready && p.placed === undefined));
await new Promise((resolve) =>
  setTimeout(resolve, Math.max(0, randomStart.startedAt - Date.now() + 30)),
);
const randomShots = [];
for (let i = 0; i < 2; i++) {
  const v = (await randomAction(i, { type: "laser", side: "top", idx: 0 }))
    .room;
  assert.equal(v.queries.length, 1);
  assert.equal(v.queries[0].player, i);
  const { player, ...shot } = v.queries[0];
  randomShots.push(shot);
}
assert.deepEqual(randomShots[0], randomShots[1]);
await randomAction(0, {
  type: "submit",
  drawing: { guess: emptyBoard(7, 5), edges: {} },
});
const randomEnd = (
  await randomAction(1, {
    type: "submit",
    drawing: { guess: emptyBoard(7, 5), edges: {} },
  })
).room;
assert.equal(randomEnd.phase, "finished");
assert.deepEqual(randomEnd.players[0].placed, randomEnd.players[1].placed);
await randomAction(0, { type: "rematch" });
const randomRematch = (await randomAction(1, { type: "rematch" })).room;
assert.equal(randomRematch.phase, "playing");
assert.notEqual(randomRematch.id, randomStart.id);
assert.ok(randomRematch.players.every((p) => p.placed === undefined));

// Real deadline: a saved correct final drawing is submitted automatically.
// Eight players share one random puzzle, with private clues until everyone finishes.
const groupCreated = await request("/api/rooms", {
  body: {
    profile: { id: crypto.randomUUID(), name: "Group host" },
    mobile: false,
  },
  status: 201,
});
const groupCode = groupCreated.room.code,
  groupTokens = [groupCreated.token];
const groupAction = (i, body, status = 200) =>
  request(`/api/rooms/${groupCode}/action`, {
    token: groupTokens[i],
    body,
    status,
  });
await groupAction(0, { type: "settings", settings: { mode: "random" } });
for (let i = 1; i < 8; i++) {
  const member = await request(`/api/rooms/${groupCode}/join`, {
    body: {
      profile: { id: crypto.randomUUID(), name: `Guest ${i}` },
      mobile: i === 7,
    },
  });
  groupTokens.push(member.token);
  assert.equal(member.room.you, i);
  assert.equal(member.room.players.length, i + 1);
}
await request(`/api/rooms/${groupCode}/join`, {
  body: { profile: { id: crypto.randomUUID(), name: "Ninth" }, mobile: false },
  status: 400,
});
await groupAction(0, { type: "settings", settings: { mode: "turns" } }, 400);
const groupStart = (await groupAction(0, { type: "start" })).room;
assert.equal(groupStart.size, "compact");
assert.ok(groupStart.players.every((p) => p.placed === undefined));
assert.equal(groupStart.startedAt - groupStart.serverNow, 3000);
await groupAction(7, { type: "laser", side: "top", idx: 0 }, 400);
await groupAction(
  7,
  { type: "submit", drawing: { guess: emptyBoard(7, 5), edges: {} } },
  400,
);
await new Promise((resolve) =>
  setTimeout(resolve, Math.max(0, groupStart.startedAt - Date.now() + 30)),
);
for (let i = 0; i < 8; i++) {
  const shot = (await groupAction(i, { type: "laser", side: "top", idx: 0 }))
    .room;
  assert.equal(shot.queries.length, 1);
  assert.equal(shot.queries[0].player, i);
}
await groupAction(3, { type: "leave" });
assert.equal(
  (await request(`/api/rooms/${groupCode}`, { token: groupTokens[7] })).room
    .phase,
  "playing",
);
let groupEnd;
for (const i of [0, 1, 2, 4, 5, 6, 7])
  groupEnd = (
    await groupAction(i, {
      type: "submit",
      drawing: { guess: emptyBoard(7, 5), edges: { [`v-0-${i}`]: "red" } },
    })
  ).room;
assert.equal(groupEnd.phase, "finished");
assert.equal(groupEnd.winner, "none");
assert.equal(groupEnd.queries.length, 8);
assert.ok(
  groupEnd.players.every(
    (p) =>
      JSON.stringify(p.placed) === JSON.stringify(groupEnd.players[0].placed),
  ),
);
assert.equal(groupEnd.players[7].submission.drawing.edges["v-0-7"], "red");
assert.equal(groupEnd.players[3].left, true);
assert.equal(groupEnd.players[3].submission.score, 0);
for (const i of [0, 1, 2, 4, 5, 6]) await groupAction(i, { type: "rematch" });
const groupRematch = (await groupAction(7, { type: "rematch" })).room;
assert.equal(groupRematch.phase, "playing");
assert.equal(groupRematch.players.length, 7);
assert.equal(groupRematch.you, 6);
assert.ok(groupRematch.startedAt > groupRematch.serverNow);
assert.deepEqual(groupRematch.wins, Array(7).fill(0));

const timeoutCreated = await request("/api/rooms", {
  body: {
    profile: { id: crypto.randomUUID(), name: "Timeout host" },
    mobile: true,
  },
  status: 201,
});
const timeoutCode = timeoutCreated.room.code;
const timeoutJoined = await request(`/api/rooms/${timeoutCode}/join`, {
  body: {
    profile: { id: crypto.randomUUID(), name: "Timeout guest" },
    mobile: true,
  },
});
const timeoutTokens = [timeoutCreated.token, timeoutJoined.token];
const timeoutAction = (i, body) =>
  request(`/api/rooms/${timeoutCode}/action`, {
    token: timeoutTokens[i],
    body,
  });
const timeoutSetup = (await timeoutAction(0, { type: "start" })).room;
const timeoutBoards = timeoutSetup.players.map(
  (p, i) => generatePuzzle(`timeout:${i}`, p.pieces, 7, 5).placed,
);
await timeoutAction(0, { type: "ready", placed: timeoutBoards[0] });
const timeoutPlaying = (
  await timeoutAction(1, { type: "ready", placed: timeoutBoards[1] })
).room;
const firstTimeout = timeoutPlaying.turn,
  lastTimeout = 1 - firstTimeout;
const timeoutFinal = (
  await timeoutAction(firstTimeout, {
    type: "submit",
    drawing: solutionDrawing(timeoutBoards[lastTimeout], 7, 5),
  })
).room;
const finalDrawing = solutionDrawing(timeoutBoards[firstTimeout], 7, 5);
await timeoutAction(lastTimeout, {
  type: "draft",
  drawing: finalDrawing,
  roundId: timeoutFinal.id,
});
console.log("Waiting for the real final-attempt deadline…");
await new Promise((resolve) =>
  setTimeout(resolve, Math.max(0, timeoutFinal.deadline - Date.now() + 100)),
);
const timeoutDone = (
  await request(`/api/rooms/${timeoutCode}`, { token: timeoutTokens[0] })
).room;
assert.equal(timeoutDone.phase, "finished");
assert.equal(timeoutDone.winner, "draw");
assert.equal(timeoutDone.players[lastTimeout].submission.automatic, true);
assert.deepEqual(
  timeoutDone.players[lastTimeout].submission.drawing,
  finalDrawing,
);
await request(`/api/rooms/${timeoutCode}/action`, {
  token: timeoutTokens[0],
  body: { type: "leave" },
});
const closed = (
  await request(`/api/rooms/${timeoutCode}`, { token: timeoutTokens[1] })
).room;
assert.equal(closed.phase, "closed");
assert.equal(closed.closedBy, 0);
await request(`/api/rooms/${timeoutCode}/action`, {
  token: timeoutTokens[1],
  body: { type: "rematch" },
  status: 400,
});
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
  `PASS: ${calls} API requests; real Durable Object rooms, all three duel modes, private drafts, server scoring, persistent rematch wins, auth, activity deduplication and install assets.`,
);
