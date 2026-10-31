import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useCaptureRoom } from "../src/games/captureit/useCaptureRoom.js";

const profile = { id: "capture-client-player", name: "Robin" };
const access = { profileId: profile.id, code: "0123", token: "private-token" };
const storage = new Map();
let requests, view, latest;
const response = (room, extra = {}) => ({
  ok: true,
  json: async () => ({ room, ...extra }),
});
const room = (revision = 1, code = "0123") => ({
  code,
  revision,
  phase: "lobby",
  players: [{ id: profile.id, name: profile.name, color: "white" }],
  you: 0,
});
function Probe({ currentProfile = profile, code = "", active = true }) {
  latest = useCaptureRoom(currentProfile, code, active);
  return null;
}
function mount(props = {}) {
  act(() => {
    view = TestRenderer.create(React.createElement(Probe, props));
  });
}
async function deliver(request, value) {
  await act(async () => {
    request.resolve(value);
  });
}
function pending() {
  return requests.filter((request) => !request.done);
}

beforeEach(() => {
  requests = [];
  latest = null;
  view = null;
  storage.clear();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.location = { hostname: "localhost", pathname: "/captureit" };
  globalThis.window = new EventTarget();
  window.history = { replaceState() {} };
  globalThis.fetch = (url, options) =>
    new Promise((resolve, reject) => {
      const request = {
        url,
        options,
        ignoreAbort: false,
        done: false,
        resolve(value) {
          request.done = true;
          resolve(value);
        },
      };
      options.signal.addEventListener("abort", () => {
        if (request.ignoreAbort) return;
        request.done = true;
        reject(new DOMException("Aborted", "AbortError"));
      });
      requests.push(request);
    });
});
afterEach(async () => {
  await act(async () => {
    view?.unmount();
    for (const request of pending()) request.resolve(response(room()));
  });
});

test("room entry is serialized and persists only the clean public profile", async () => {
  mount();
  let first, duplicate;
  act(() => {
    first = latest.enter("", { ...profile, privateData: "never-send" });
    duplicate = latest.enter("0123", profile);
  });
  assert.equal(requests.length, 1);
  assert.equal(latest.busy, true);
  assert.equal(await duplicate, null);
  assert.deepEqual(JSON.parse(requests[0].options.body), { profile });
  await deliver(requests[0], response(room(), { token: access.token }));
  assert.equal((await first).code, "0123");
  assert.deepEqual(latest.credentials, access);
  assert.deepEqual(JSON.parse(storage.get("captureit:room")), access);
  assert.equal(latest.busy, false);
});

test("forget fences a delayed entry even when the transport ignores abort", async () => {
  mount();
  let oldEntry;
  act(() => {
    oldEntry = latest.enter("0123", profile);
  });
  const oldRequest = requests[0];
  oldRequest.ignoreAbort = true;
  act(() => latest.forget());
  assert.equal(oldRequest.options.signal.aborted, true);
  let newEntry;
  act(() => {
    newEntry = latest.enter("5678", profile);
  });
  await deliver(oldRequest, response(room(), { token: "old-token" }));
  assert.equal(await oldEntry, null);
  assert.equal(latest.room, null);
  assert.equal(latest.credentials, null);
  assert.equal(latest.busy, true);
  await deliver(requests[1], response(room(2, "5678"), { token: "new-token" }));
  assert.equal((await newEntry).code, "5678");
  assert.equal(latest.room.code, "5678");
  assert.equal(latest.credentials.token, "new-token");
});

test("a move supersedes polling and a stale response cannot roll the room back", async () => {
  storage.set("captureit:room", JSON.stringify(access));
  mount();
  await deliver(requests[0], response(room(1)));
  act(() => window.dispatchEvent(new Event("focus")));
  const oldPoll = requests[1];
  oldPoll.ignoreAbort = true;
  let move;
  act(() => {
    move = latest.send({ type: "start" });
  });
  assert.equal(oldPoll.options.signal.aborted, true);
  assert.equal(requests[2].options.method, "POST");
  assert.equal(JSON.parse(requests[2].options.body).revision, 1);
  await deliver(requests[2], response(room(2)));
  await move;
  await deliver(oldPoll, response(room(1)));
  assert.equal(latest.room.revision, 2);
  act(() => {
    void latest.send({ type: "color", color: "black", revision: 0 });
  });
  assert.equal(JSON.parse(requests[3].options.body).revision, 2);
});

test("concurrent action clicks issue one mutation and reconnect signals never overlap it", async () => {
  storage.set("captureit:room", JSON.stringify(access));
  mount();
  await deliver(requests[0], response(room()));
  let duplicate;
  act(() => {
    void latest.send({ type: "start" });
    duplicate = latest.send({ type: "start" });
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
  });
  assert.equal(requests.length, 2);
  assert.equal(await duplicate, null);
  assert.equal(latest.busy, true);
  await deliver(requests[1], response(room(2)));
  assert.equal(latest.busy, false);
});

test("leaving the online screen cancels mutations and ignores late responses", async () => {
  storage.set("captureit:room", JSON.stringify(access));
  mount();
  await deliver(requests[0], response(room()));
  act(() => {
    void latest.send({ type: "start" });
  });
  requests[1].ignoreAbort = true;
  act(() => view.update(React.createElement(Probe, { active: false })));
  assert.equal(requests[1].options.signal.aborted, true);
  assert.equal(latest.busy, false);
  await deliver(requests[1], response(room(2)));
  assert.equal(latest.room.revision, 1);
  act(() => window.dispatchEvent(new Event("focus")));
  assert.equal(requests.length, 2);
  act(() => view.update(React.createElement(Probe, { active: true })));
  assert.equal(requests.length, 3);
  await deliver(requests[2], response(room(2)));
  assert.equal(latest.room.revision, 2);
});

test("changing public player identity discards access and pending entry", async () => {
  mount();
  act(() => {
    void latest.enter("0123", profile);
  });
  requests[0].ignoreAbort = true;
  act(() =>
    view.update(
      React.createElement(Probe, {
        currentProfile: { id: "different-player", name: "Sam" },
      }),
    ),
  );
  await deliver(requests[0], response(room(), { token: access.token }));
  assert.equal(latest.room, null);
  assert.equal(latest.credentials, null);
  assert.equal(storage.has("captureit:room"), false);
});

test("saved access is rejected for another profile or an explicit different invitation", () => {
  storage.set("captureit:room", JSON.stringify(access));
  mount({ code: "5678" });
  assert.equal(latest.credentials, null);
  assert.equal(requests.length, 0);
  act(() => view.unmount());
  mount({ currentProfile: { id: "another-player", name: "Sam" } });
  assert.equal(latest.credentials, null);
  assert.equal(requests.length, 0);
});

test("invalid entry responses never save a partial credential", async () => {
  mount();
  act(() => {
    void latest.enter("0123", profile);
  });
  await deliver(requests[0], response(room()));
  assert.equal(latest.credentials, null);
  assert.equal(latest.room, null);
  assert.match(latest.error, /could not be joined/);
  assert.equal(storage.has("captureit:room"), false);
});

test("forget with leave clears access only after the server confirms closure", async () => {
  storage.set("captureit:room", JSON.stringify(access));
  mount();
  await deliver(requests[0], response(room()));
  let leaving;
  act(() => {
    leaving = latest.forget(true);
  });
  assert.deepEqual(latest.credentials, access);
  assert.equal(latest.room.code, "0123");
  assert.equal(latest.busy, true);
  assert.equal(requests[1].url, "/api/captureit/rooms/0123/action");
  assert.equal(
    requests[1].options.headers.Authorization,
    "Bearer private-token",
  );
  assert.deepEqual(JSON.parse(requests[1].options.body), { type: "leave" });
  await deliver(requests[1], response({ ...room(2), phase: "closed" }));
  assert.equal(await leaving, true);
  assert.equal(latest.credentials, null);
  assert.equal(latest.room, null);
  assert.equal(JSON.parse(storage.get("captureit:room")), null);
});

test("failed departure preserves credentials and reports an actionable error", async () => {
  storage.set("captureit:room", JSON.stringify(access));
  mount();
  await deliver(requests[0], response(room()));
  let leaving;
  act(() => {
    leaving = latest.forget(true);
  });
  await deliver(requests[1], {
    ok: false,
    json: async () => ({ error: "Connection failed. Try again." }),
  });
  assert.equal(await leaving, false);
  assert.deepEqual(latest.credentials, access);
  assert.deepEqual(JSON.parse(storage.get("captureit:room")), access);
  assert.equal(latest.room.code, "0123");
  assert.match(latest.error, /Connection failed/);
  assert.equal(latest.busy, false);
});

test("timeout reports a connection error even when fetch rejects on abort first", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  mount();
  let entry;
  act(() => {
    entry = latest.enter("0123", profile);
  });
  await act(async () => t.mock.timers.tick(12000));
  assert.equal(await entry, null);
  assert.match(latest.error, /Connection timed out/);
  assert.equal(latest.busy, false);
  assert.equal(requests[0].options.signal.aborted, true);
  t.mock.timers.reset();
});

test("unmount prevents a delayed request from writing credentials or navigation", async () => {
  mount();
  let navigation = 0;
  window.history.replaceState = () => navigation++;
  let entry;
  act(() => {
    entry = latest.enter("0123", profile);
  });
  requests[0].ignoreAbort = true;
  act(() => view.unmount());
  view = null;
  await deliver(requests[0], response(room(), { token: access.token }));
  assert.equal(await entry, null);
  assert.equal(storage.has("captureit:room"), false);
  assert.equal(navigation, 0);
});

test("rematch sends the current game identity with its revision", async () => {
  storage.set("captureit:room", JSON.stringify(access));
  mount();
  await deliver(
    requests[0],
    response({ ...room(8), phase: "finished", gameId: "finished-game-1" }),
  );
  act(() => {
    void latest.send({ type: "rematch", revision: 1, gameId: "old-game" });
  });
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    type: "rematch",
    revision: 8,
    gameId: "finished-game-1",
  });
});
