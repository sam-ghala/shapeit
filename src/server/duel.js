import {
  SIZES,
  SHAPES,
  buildPieces,
  generatePuzzle,
  validatePlacements,
  boardFromPlaced,
  fireLaser,
  checkSolution,
} from "../game/engine.js";
export const SETUP_MS = 60_000,
  FINAL_MS = 60_000,
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
  const allowed = Array.isArray(input.allowed)
    ? [...new Set(input.allowed.filter((k) => SHAPES.some((s) => s.key === k)))]
    : SHAPES.map((s) => s.key);
  return {
    sameShapes: input.sameShapes !== false,
    extras: input.extras === true,
    allowed,
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
  if (
    room.phase === "setup" &&
    (now >= room.deadline || room.players.every((p) => p.ready))
  ) {
    room.phase = "playing";
    room.startedAt = now;
    room.turn = room.starter;
    room.lastActor = null;
    room.deadline = null;
  }
  if (
    room.phase === "final" &&
    (room.players.every((p) => p.submission !== null) || now >= room.deadline)
  ) {
    room.phase = "finished";
    room.finishedAt = now;
    const correct = room.players.map((p) => p.submission?.correct === true);
    room.winner =
      correct[0] && correct[1]
        ? "draw"
        : correct[0]
          ? 0
          : correct[1]
            ? 1
            : "none";
    room.deadline = null;
  }
}
export function applyAction(room, index, action, now = Date.now()) {
  advanceRoom(room, now);
  const p = room.players[index],
    { cols, rows } = SIZES[room.size];
  if (!p) throw new Error("Room access denied.");
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
      const count = room.size === "classic" ? 5 : 4;
      if (room.settings.allowed.length < count)
        throw new Error(`Choose at least ${count} allowed shapes.`);
      room.players.forEach((member, i) => {
        member.pieces = buildPieces(
          `${room.id}:${room.settings.sameShapes ? "shared" : i}`,
          room.size,
          room.settings.extras,
          room.settings.allowed,
        );
        member.placed = generatePuzzle(
          `${room.id}:board:${i}`,
          member.pieces,
          cols,
          rows,
        ).placed;
      });
      room.starter = crypto.getRandomValues(new Uint8Array(1))[0] % 2;
      room.phase = "setup";
      room.deadline = now + SETUP_MS;
      break;
    }
    case "place":
    case "ready":
      if (room.phase !== "setup" || p.ready)
        throw new Error("Your board is already locked.");
      p.placed = validatePlacements(action.placed, p.pieces, cols, rows);
      if (action.type === "ready") p.ready = true;
      break;
    case "laser": {
      if (room.phase !== "playing" || room.turn !== index)
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
      room.turn = 1 - index;
      break;
    }
    case "submit":
    case "pass": {
      if (p.submission !== null)
        throw new Error("Your solution is already submitted.");
      if (room.phase !== "playing" && room.phase !== "final")
        throw new Error("You cannot submit now.");
      if (
        room.phase === "playing" &&
        room.turn !== index &&
        room.lastActor !== index
      )
        throw new Error("Wait for your turn.");
      if (action.type === "pass" && room.phase !== "final")
        throw new Error("Only the final response can be skipped.");
      const drawing = action.type === "pass" ? null : action.drawing;
      if (
        drawing &&
        (!Array.isArray(drawing.guess) ||
          drawing.guess.length !== rows ||
          drawing.guess.some(
            (row) =>
              !Array.isArray(row) ||
              row.length !== cols ||
              row.some(
                (c) =>
                  c !== null &&
                  (!c ||
                    ![
                      "red",
                      "blue",
                      "yellow",
                      "white",
                      "transparent",
                      "black",
                      "x",
                    ].includes(c.color) ||
                    !["/", "\\", "x"].includes(c.type)),
              ),
          ))
      )
        throw new Error("Invalid drawing.");
      if (
        drawing &&
        (!drawing.edges ||
          typeof drawing.edges !== "object" ||
          Object.keys(drawing.edges).length > 200 ||
          Object.entries(drawing.edges).some(
            ([k, v]) =>
              !/^[hv]-\d+-\d+$/.test(k) ||
              ![
                "red",
                "blue",
                "yellow",
                "white",
                "transparent",
                "black",
              ].includes(v),
          ))
      )
        throw new Error("Invalid drawing edges.");
      if (action.type === "submit" && !drawing)
        throw new Error("Submit a drawing.");
      p.submission = {
        drawing,
        correct: drawing
          ? checkSolution(
              drawing.guess,
              drawing.edges,
              room.players[1 - index].placed,
              cols,
              rows,
            )
          : false,
        at: now,
      };
      if (room.phase === "playing") {
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
    })),
  };
}
