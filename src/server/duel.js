import { normalizeExtras } from "../game/extras.js";
import {
  SIZES,
  buildPieces,
  validatePlacements,
  boardFromPlaced,
  fireLaser,
  checkSolution,
  scoreBreakdown,
} from "../game/engine.js";
export const FINAL_MS = 60_000,
  ROOM_MS = 2 * 60 * 60_000;
export function cleanProfile(input) {
  if (
    !input ||
    typeof input.id !== "string" ||
    !/^[a-zA-Z0-9-]{8,64}$/.test(input.id) ||
    typeof input.name !== "string"
  )
    throw new Error("Choose a player name first.");
  const name = input.name
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 24);
  if (!name) throw new Error("Choose a player name first.");
  return { id: input.id, name };
}
export function roomSettings(input = {}) {
  return {
    sameShapes: true,
    mode: input.mode === "race" ? "race" : "turns",
    extras: normalizeExtras(input.extras),
  };
}
function player(profile, mobile) {
  return {
    ...cleanProfile(profile),
    token: crypto.randomUUID() + crypto.randomUUID(),
    mobile: mobile === true,
    ready: false,
    placed: null,
    pieces: [],
    submission: null,
    draft: null,
  };
}
export function createRoom(code, profile, mobile, settings, now = Date.now()) {
  return {
    code,
    id: crypto.randomUUID(),
    createdAt: now,
    expiresAt: now + ROOM_MS,
    phase: "lobby",
    size: mobile ? "compact" : "classic",
    players: [player(profile, mobile)],
    settings: roomSettings(settings),
    queries: [],
    turn: 0,
    lastActor: null,
    winner: null,
    round: 1,
    rematch: [],
    wins: [0, 0],
  };
}
export function joinRoom(room, profile, mobile) {
  if (room.phase !== "lobby" || room.players.length !== 1)
    throw new Error("This room is full or already playing.");
  if (room.players[0].id === profile?.id)
    throw new Error(
      "You are already in this room. Use the original browser tab.",
    );
  room.players.push(player(profile, mobile));
  room.size = room.players.some((p) => p.mobile) ? "compact" : "classic";
  return room.players[1].token;
}
export function playerIndex(room, token) {
  return room.players.findIndex((p) => p.token === token);
}
export function advanceRoom(room, now = Date.now()) {
  if (room.phase === "setup") room.deadline = null;
  if (room.phase === "setup" && room.players.every((p) => p.ready)) {
    room.phase = "playing";
    room.startedAt = now;
    room.turn = room.starter;
    room.lastActor = null;
    room.deadline = null;
  }
  const race = room.settings.mode === "race";
  if (
    (race &&
      room.phase === "playing" &&
      room.players.every((p) => p.submission !== null)) ||
    (!race &&
      room.phase === "final" &&
      (room.players.every((p) => p.submission !== null) ||
        now >= room.deadline))
  ) {
    room.phase = "finished";
    room.finishedAt = now;
    const correct = room.players.map((p) => p.submission?.correct === true);
    if (correct[0] && correct[1]) {
      const scores = room.players.map((p) => p.submission.score);
      room.winner =
        !race || scores[0] === scores[1]
          ? "draw"
          : scores[0] > scores[1]
            ? 0
            : 1;
    } else room.winner = correct[0] ? 0 : correct[1] ? 1 : "none";
    room.wins ||= [0, 0];
    if (typeof room.winner === "number") room.wins[room.winner]++;
    room.deadline = null;
  }
}

function validateDrawing(drawing, cols, rows) {
  const colors = ["red", "blue", "yellow", "white", "transparent", "black"];
  if (
    !drawing ||
    !Array.isArray(drawing.guess) ||
    drawing.guess.length !== rows ||
    drawing.guess.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== cols ||
        row.some(
          (c) =>
            c !== null &&
            (!c ||
              ![...colors, "x"].includes(c.color) ||
              !["/", "\\", "x"].includes(c.type) ||
              (c.color === "x") !== (c.type === "x")),
        ),
    )
  )
    throw new Error("Invalid drawing.");
  if (
    !drawing.edges ||
    typeof drawing.edges !== "object" ||
    Array.isArray(drawing.edges) ||
    Object.keys(drawing.edges).length > 200 ||
    Object.entries(drawing.edges).some(([key, color]) => {
      if (!/^[hv]-\d+-\d+$/.test(key) || !colors.includes(color)) return true;
      const [kind, r, c] = key.split("-");
      return kind === "h" ? +r > rows || +c >= cols : +r >= rows || +c > cols;
    })
  )
    throw new Error("Invalid drawing edges.");
  return structuredClone({ guess: drawing.guess, edges: drawing.edges });
}

export function applyAction(room, index, action, now = Date.now()) {
  advanceRoom(room, now);
  const p = room.players[index],
    { cols, rows } = SIZES[room.size];
  if (!p) throw new Error("Room access denied.");
  if (action.roundId && action.roundId !== room.id)
    throw new Error("This round has ended. Refresh the room.");
  const race = room.settings.mode === "race";
  switch (action.type) {
    case "rematch": {
      if (room.phase !== "finished")
        throw new Error("Finish this round first.");
      room.rematch ||= [];
      if (!room.rematch.includes(index)) room.rematch.push(index);
      if (room.rematch.length === 2) {
        const nextStarter = 1 - room.starter;
        room.id = crypto.randomUUID();
        room.round = (room.round || 1) + 1;
        room.expiresAt = now + ROOM_MS;
        room.players.forEach((p) => {
          p.ready = false;
          p.submission = null;
          p.draft = null;
        });
        room.queries = [];
        room.winner = null;
        room.lastActor = null;
        room.startedAt = null;
        room.finishedAt = null;
        room.firstSubmitter = null;
        room.rematch = [];
        room.phase = "lobby";
        applyAction(room, 0, { type: "start" }, now);
        room.starter = nextStarter;
      }
      break;
    }
    case "settings":
      if (index !== 0 || room.phase !== "lobby")
        throw new Error("Only the host can change lobby settings.");
      room.settings = roomSettings(action.settings);
      break;
    case "start": {
      if (index !== 0 || room.phase !== "lobby" || room.players.length !== 2)
        throw new Error("Two players are needed to start.");
      room.settings = roomSettings(room.settings);
      room.players.forEach((member) => {
        member.pieces = buildPieces(
          `${room.id}:shared`,
          room.size,
          room.settings.extras,
        );
        member.placed = [];
      });
      room.starter = crypto.getRandomValues(new Uint8Array(1))[0] % 2;
      room.phase = "setup";
      room.deadline = null;
      break;
    }
    case "place":
    case "ready":
      if (room.phase !== "setup" || p.ready)
        throw new Error("Your board is already locked.");
      p.placed = validatePlacements(
        action.placed,
        p.pieces,
        cols,
        rows,
        action.type === "place",
      );
      if (action.type === "ready") p.ready = true;
      break;
    case "laser": {
      if (
        room.phase !== "playing" ||
        p.submission !== null ||
        (!race && room.turn !== index)
      )
        throw new Error("Wait for your turn.");
      const opponent = room.players[1 - index];
      const result = fireLaser(
        boardFromPlaced(opponent.placed, cols, rows),
        action.side,
        action.idx,
      );
      if (
        room.queries.some(
          (q) =>
            q.player === index &&
            ((q.side === action.side && q.idx === action.idx) ||
              (q.exitSide === action.side && q.exitIdx === action.idx)),
        )
      )
        throw new Error("You already have this clue. Pick another laser.");
      room.queries.push({
        player: index,
        side: action.side,
        idx: action.idx,
        exitSide: result.exitSide,
        exitIdx: result.exitIdx,
        colors: result.colors,
        absorbed: result.absorbed,
      });
      room.lastActor = index;
      if (!race) room.turn = 1 - index;
      break;
    }
    case "draft": {
      if (!["playing", "final"].includes(room.phase) || p.submission !== null)
        throw new Error("Your drawing is locked.");
      p.draft = validateDrawing(action.drawing, cols, rows);
      break;
    }
    case "submit":
    case "pass": {
      if (p.submission !== null)
        throw new Error("Your solution is already submitted.");
      if (room.phase !== "playing" && room.phase !== "final")
        throw new Error("You cannot submit now.");
      if (
        !race &&
        room.phase === "playing" &&
        room.turn !== index &&
        room.lastActor !== index
      )
        throw new Error("Wait for your turn.");
      if (action.type === "pass" && room.phase !== "final")
        throw new Error("Only the final response can be skipped.");
      const drawing =
        action.type === "pass"
          ? null
          : validateDrawing(action.drawing, cols, rows);
      const correct = drawing
        ? checkSolution(
            drawing.guess,
            drawing.edges,
            room.players[1 - index].placed,
            cols,
            rows,
          )
        : false;
      const seconds = Math.max(0, Math.floor((now - room.startedAt) / 1000));
      const queries = room.queries.filter((q) => q.player === index).length;
      const points = correct
        ? scoreBreakdown(seconds, queries, room.settings.extras)
        : { total: 0, bonus: 0 };
      p.submission = {
        drawing,
        correct,
        seconds,
        queries,
        score: points.total,
        bonus: points.bonus,
        at: now,
      };
      if (!race && room.phase === "playing") {
        room.phase = "final";
        room.deadline = now + FINAL_MS;
        room.firstSubmitter = index;
      }
      break;
    }
    default:
      throw new Error("Unknown room action.");
  }
  advanceRoom(room, now);
  return room;
}
export function roomView(room, index, now = Date.now()) {
  const done = room.phase === "finished";
  return {
    code: room.code,
    id: room.id,
    size: room.size,
    phase: room.phase,
    settings: room.settings,
    you: index,
    turn: room.turn,
    lastActor: room.lastActor,
    deadline: room.deadline ?? null,
    serverNow: now,
    expiresAt: room.expiresAt,
    winner: room.winner,
    round: room.round || 1,
    wins: room.wins || [0, 0],
    startedAt: room.startedAt ?? null,
    rematch: room.rematch || [],
    queries: room.queries,
    players: room.players.map((p, i) => ({
      name: p.name,
      mobile: p.mobile,
      ready: p.ready,
      pieces: p.pieces,
      submitted: p.submission !== null,
      ...(i === index || done ? { placed: p.placed } : {}),
      ...(done ? { submission: p.submission } : {}),
      ...(i === index && p.submission ? { submittedAt: p.submission.at } : {}),
      // Only a player whose own attempt is irreversibly locked may spectate.
      ...(!done && i !== index && room.players[index].submission !== null
        ? { draft: p.submission?.drawing || p.draft || null }
        : {}),
    })),
  };
}
