import { cleanProfile } from "../../../shared/server/profile.js";
export { cleanProfile } from "../../../shared/server/profile.js";
import { normalizeExtras } from "../game/extras.js";
import {
  SIZES,
  generatePuzzle,
  emptyBoard,
  buildPieces,
  validatePlacements,
  boardFromPlaced,
  fireLaser,
  checkSolution,
  scoreBreakdown,
} from "../game/engine.js";
export const FINAL_MS = 60_000,
  RACE_COUNTDOWN_MS = 3_000,
  MAX_RACE_PLAYERS = 8,
  ROOM_MS = 2 * 60 * 60_000;
export function roomSettings(input = {}) {
  return {
    sameShapes: true,
    mode: ["race", "random"].includes(input.mode) ? input.mode : "turns",
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
    wins: [0],
  };
}
export function joinRoom(room, profile, mobile) {
  const limit = room.settings.mode === "random" ? MAX_RACE_PLAYERS : 2;
  if (room.phase !== "lobby" || room.players.length >= limit)
    throw new Error("This room is full or already playing.");
  if (room.players.some((p) => p.id === profile?.id))
    throw new Error(
      "You are already in this room. Use the original browser tab.",
    );
  room.players.push(player(profile, mobile));
  room.wins = room.players.map((_, i) => room.wins?.[i] || 0);
  room.size = room.players.some((p) => p.mobile) ? "compact" : "classic";
  return room.players.at(-1).token;
}
export function playerIndex(room, token) {
  return room.players.findIndex((p) => p.token === token);
}
export function advanceRoom(room, now = Date.now()) {
  if (room.phase === "setup") room.deadline = null;
  if (room.phase === "setup" && room.players.every((p) => p.ready)) {
    room.phase = "playing";
    room.startedAt =
      now +
      (["race", "random"].includes(room.settings.mode) ? RACE_COUNTDOWN_MS : 0);
    room.turn = room.starter;
    room.lastActor = null;
    room.deadline = null;
  }
  const race = ["race", "random"].includes(room.settings.mode);
  if (!race && room.phase === "final" && now >= room.deadline) {
    const { cols, rows } = SIZES[room.size];
    room.players.forEach((p, index) => {
      if (p.submission === null) {
        p.submission = evaluateSubmission(
          room,
          index,
          p.draft || { guess: emptyBoard(cols, rows), edges: {} },
          room.deadline,
        );
        p.submission.automatic = true;
      }
    });
  }

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
    const correct = room.players.flatMap((p, i) =>
      p.submission?.correct && !p.left ? [i] : [],
    );
    const best = Math.max(
      ...correct.map((i) => room.players[i].submission.score),
    );
    room.winners = race
      ? correct.filter((i) => room.players[i].submission.score === best)
      : correct;
    room.winner =
      room.winners.length > 1 ? "draw" : (room.winners[0] ?? "none");
    room.wins ||= room.players.map(() => 0);
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

function evaluateSubmission(room, index, drawing, now) {
  const { cols, rows } = SIZES[room.size];
  const correct = drawing
    ? checkSolution(
        drawing.guess,
        drawing.edges,
        room.players[room.settings.mode === "random" ? index : 1 - index]
          .placed,
        cols,
        rows,
      )
    : false;
  const seconds = Math.max(0, Math.floor((now - room.startedAt) / 1000));
  const queries = room.queries.filter((q) => q.player === index).length;
  const points = correct
    ? scoreBreakdown(seconds, queries, room.settings.extras)
    : { total: 0, bonus: 0 };
  return {
    drawing: structuredClone(drawing),
    correct,
    seconds,
    queries,
    score: points.total,
    bonus: points.bonus,
    at: now,
  };
}

export function applyAction(room, index, action, now = Date.now()) {
  advanceRoom(room, now);
  const p = room.players[index],
    { cols, rows } = SIZES[room.size];
  if (!p) throw new Error("Room access denied.");
  if (action.roundId && action.roundId !== room.id)
    throw new Error("This round has ended. Refresh the room.");
  if (action.type === "leave") {
    if (room.phase === "closed") return room;
    if (
      room.settings.mode === "random" &&
      room.players.length > 2 &&
      index !== 0
    ) {
      if (room.phase === "lobby") {
        room.players.splice(index, 1);
        room.wins.splice(index, 1);
        room.size = room.players.some((member) => member.mobile)
          ? "compact"
          : "classic";
      } else {
        p.left = true;
        if (room.phase !== "finished") {
          p.submission ||= evaluateSubmission(
            room,
            index,
            p.draft || { guess: emptyBoard(cols, rows), edges: {} },
            now,
          );
          p.submission.correct = false;
          p.submission.score = 0;
          p.submission.bonus = 0;
        }
        advanceRoom(room, now);
        const staying = room.players.flatMap((member, i) =>
          member.left ? [] : [i],
        );
        if (
          room.phase === "finished" &&
          staying.length >= 2 &&
          staying.every((i) => room.rematch?.includes(i))
        )
          applyAction(room, 0, { type: "rematch" }, now);
      }
      return room;
    }
    room.phase = "closed";
    room.closedBy = index;
    room.deadline = null;
    return room;
  }
  if (room.phase === "closed") throw new Error("This room is closed.");
  const race = ["race", "random"].includes(room.settings.mode);
  if (p.left) throw new Error("You have left this room.");
  if (
    race &&
    ["laser", "draft", "submit"].includes(action.type) &&
    now < room.startedAt
  )
    throw new Error("Wait for the countdown to finish.");
  switch (action.type) {
    case "rematch": {
      if (room.phase !== "finished")
        throw new Error("Finish this round first.");
      room.rematch ||= [];
      if (!room.rematch.includes(index)) room.rematch.push(index);
      const remaining = room.players.flatMap((member, i) =>
        member.left ? [] : [i],
      );
      if (remaining.length < 2)
        throw new Error("At least two players are needed for a rematch.");
      if (remaining.every((i) => room.rematch.includes(i))) {
        room.wins = remaining.map((i) => room.wins[i] || 0);
        room.players = remaining.map((i) => room.players[i]);
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
        room.winners = [];
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
      {
        const settings = roomSettings(action.settings);
        if (settings.mode !== "random" && room.players.length > 2)
          throw new Error("More than two players need Random race.");
        room.settings = settings;
      }
      break;
    case "start": {
      const limit = room.settings.mode === "random" ? MAX_RACE_PLAYERS : 2;
      if (
        index !== 0 ||
        room.phase !== "lobby" ||
        room.players.length < 2 ||
        room.players.length > limit
      )
        throw new Error("At least two players are needed to start.");
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
      if (room.settings.mode === "random") {
        // This seed is never sent to clients: knowing the room ID cannot reveal the puzzle.
        const placed = generatePuzzle(
          crypto.randomUUID(),
          room.players[0].pieces,
          cols,
          rows,
        ).placed;
        for (const member of room.players) {
          member.placed = structuredClone(placed);
          member.ready = true;
        }
      }
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
      const opponent =
        room.players[room.settings.mode === "random" ? index : 1 - index];
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
      p.submission = evaluateSubmission(room, index, drawing, now);
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
  const race = ["race", "random"].includes(room.settings.mode);
  return {
    code: room.code,
    id: room.id,
    size: room.size,
    phase: room.phase,
    closedBy: room.closedBy ?? null,
    settings: room.settings,
    you: index,
    turn: room.turn,
    lastActor: room.lastActor,
    deadline: room.deadline ?? null,
    serverNow: now,
    expiresAt: room.expiresAt,
    winner: room.winner,
    winners:
      room.winners ||
      (typeof room.winner === "number"
        ? [room.winner]
        : room.winner === "draw"
          ? [0, 1]
          : []),
    round: room.round || 1,
    wins: room.wins || [0, 0],
    startedAt: room.startedAt ?? null,
    rematch: room.rematch || [],
    queries:
      race && !done
        ? room.queries.filter((q) => q.player === index)
        : room.queries,
    players: room.players.map((p, i) => ({
      name: p.name,
      mobile: p.mobile,
      ready: p.ready,
      left: p.left === true,
      pieces: p.pieces,
      submitted: p.submission !== null,
      ...(done || (i === index && (!race || room.phase === "setup"))
        ? { placed: p.placed }
        : {}),
      ...(done ? { submission: p.submission } : {}),
      ...(i === index && p.submission ? { submittedAt: p.submission.at } : {}),
      // Only a player whose own attempt is irreversibly locked may spectate.
      ...(!race &&
      !done &&
      i !== index &&
      room.players[index].submission !== null
        ? { draft: p.submission?.drawing || p.draft || null }
        : {}),
    })),
  };
}
