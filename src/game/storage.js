import { ENGINE_VERSION, SIZES, emptyBoard, dailySeed } from "./engine.js";

export function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function getProfile() {
  const saved = readJSON("shapeit:profile", null);
  return saved &&
    /^[a-zA-Z0-9_-]{8,64}$/.test(saved.id) &&
    typeof saved.name === "string"
    ? {
        id: saved.id,
        name: saved.name === "Explorer" ? "" : saved.name.trim().slice(0, 24),
      }
    : { id: crypto.randomUUID(), name: "" };
}
export function sessionKey(mode, size, date) {
  return `shapeit:v${ENGINE_VERSION}:${mode}:${size}${mode === "daily" ? `:${date}` : ""}`;
}
export function createSession({
  mode,
  size,
  date,
  extras = false,
  timed = true,
}) {
  const { cols, rows } = SIZES[size];
  return {
    version: ENGINE_VERSION,
    id: crypto.randomUUID(),
    mode,
    size,
    date,
    extras: mode === "daily" ? false : extras,
    timed: true,
    seed:
      mode === "daily"
        ? dailySeed(size, new Date(`${date}T12:00:00Z`))
        : crypto.randomUUID(),
    guess: emptyBoard(cols, rows),
    edges: {},
    history: [],
    status: "playing",
    startedAt: null,
    finishedAt: null,
    score: null,
  };
}
export function validSession(value, config) {
  const size = SIZES[config.size];
  return (
    value?.version === ENGINE_VERSION &&
    value.mode === config.mode &&
    value.size === config.size &&
    (config.mode !== "daily" || value.date === config.date) &&
    (value.hintStep === undefined ||
      (Number.isInteger(value.hintStep) &&
        value.hintStep >= 0 &&
        value.hintStep <= 21)) &&
    typeof value.seed === "string" &&
    typeof value.id === "string" &&
    ["playing", "won", "lost"].includes(value.status) &&
    Array.isArray(value.guess) &&
    value.guess.length === size.rows &&
    value.guess.every(
      (row) =>
        Array.isArray(row) &&
        row.length === size.cols &&
        row.every(
          (c) =>
            c === null ||
            (c &&
              [
                "red",
                "blue",
                "yellow",
                "white",
                "transparent",
                "black",
                "x",
              ].includes(c.color) &&
              ["/", "\\", "x"].includes(c.type)),
        ),
    ) &&
    value.edges &&
    typeof value.edges === "object" &&
    !Array.isArray(value.edges) &&
    Object.entries(value.edges).every(
      ([key, color]) =>
        /^[hv]-\d+-\d+$/.test(key) &&
        ["red", "blue", "yellow", "white", "transparent", "black"].includes(
          color,
        ),
    ) &&
    Array.isArray(value.history) &&
    value.history.length <= 2 * (size.cols + size.rows) &&
    value.history.every(
      (h) =>
        h &&
        ["top", "bottom", "left", "right"].includes(h.side) &&
        Number.isInteger(h.idx) &&
        h.idx >= 0 &&
        h.idx < (["top", "bottom"].includes(h.side) ? size.cols : size.rows),
    ) &&
    (value.startedAt === null || Number.isFinite(value.startedAt)) &&
    (value.finishedAt === null || Number.isFinite(value.finishedAt))
  );
}
export function loadSession(config) {
  const saved = readJSON(
    sessionKey(config.mode, config.size, config.date),
    null,
  );
  return validSession(saved, config)
    ? { ...saved, timed: true }
    : createSession(config);
}
export function queueEvent(event, profile) {
  const item = {
    ...event,
    profileId: profile.id,
    name: profile.name || "Player",
    at: event.at || new Date().toISOString(),
  };
  const pending = readJSON("shapeit:events", []);
  const list = Array.isArray(pending) ? pending : [];
  if (!list.some((e) => e.id === item.id))
    writeJSON("shapeit:events", [...list, item].slice(-50));
  void flushEvents();
}
let flushing = false;
export async function flushEvents() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const list = readJSON("shapeit:events", []);
    for (const item of Array.isArray(list) ? list : []) {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) break;
      const current = readJSON("shapeit:events", []);
      writeJSON(
        "shapeit:events",
        current.filter((e) => e.id !== item.id),
      );
    }
  } catch {
  } finally {
    flushing = false;
  }
}
