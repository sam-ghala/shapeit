import { readJSON, writeJSON } from "../../../shared/storage.js";
export { readJSON, writeJSON } from "../../../shared/storage.js";
export { getProfile } from "../../../shared/profile.js";
export { queueEvent, flushEvents } from "../../../shared/activity.js";
import {
  ENGINE_VERSION,
  SCORE_VERSION,
  calcScore,
  SIZES,
  emptyBoard,
  dailySeed,
} from "./engine.js";

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
    ? {
        ...saved,
        timed: true,
        ...(saved.status !== "playing" && saved.scoreVersion !== SCORE_VERSION
          ? {
              score:
                saved.status === "won"
                  ? calcScore(
                      Math.max(
                        0,
                        Math.floor((saved.finishedAt - saved.startedAt) / 1000),
                      ),
                      saved.history.length,
                      saved.extras,
                    )
                  : 0,
              scoreVersion: SCORE_VERSION,
            }
          : {}),
      }
    : createSession(config);
}
