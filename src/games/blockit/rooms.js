import { createGame, drawStarter, opposite, play } from "./engine.js";
import { cleanProfile } from "../../shared/server/profile.js";

const ROOM_MS = 2 * 60 * 60_000;
const makePlayer = (profile, color) => ({
  ...cleanProfile(profile),
  color,
  token: crypto.randomUUID() + crypto.randomUUID(),
});

export function createBlockRoom(code, profile, now = Date.now()) {
  return {
    version: 1,
    code,
    id: crypto.randomUUID(),
    expiresAt: now + ROOM_MS,
    players: [makePlayer(profile, "white")],
    phase: "lobby",
    revision: 0,
    game: createGame(),
    gameId: null,
    round: 1,
    wins: [0, 0],
    undoStack: [],
    undoRequest: null,
    rematch: [],
    reset: [],
  };
}

export function joinBlockRoom(room, profile) {
  if (room.phase !== "lobby" || room.players.length !== 1)
    throw new Error("This room is full or already playing.");
  if (profile?.id === room.players[0].id)
    throw new Error("Use a different browser or device for the second player.");
  room.players.push(makePlayer(profile, opposite(room.players[0].color)));
  room.revision++;
  return room.players[1].token;
}

export function blockRoomView(room, index) {
  const { undoStack, ...publicRoom } = room;
  return {
    ...publicRoom,
    players: room.players.map(({ id, name, color }) => ({ id, name, color })),
    you: index,
    canUndo:
      room.phase === "playing" &&
      undoStack.at(-1)?.actor === index &&
      !room.undoRequest &&
      !room.reset.length,
  };
}

function startRound(room) {
  room.game = createGame(room.gameId ? room.game.starter : drawStarter());
  room.gameId = crypto.randomUUID();
  room.phase = "playing";
  room.undoStack = [];
  room.undoRequest = null;
  room.rematch = [];
  room.reset = [];
}

export function applyBlockAction(room, index, body) {
  if (!Number.isInteger(index) || index < 0 || index >= room.players.length)
    throw new Error("Room access denied.");
  if (body.type === "leave") {
    if (room.phase !== "closed") {
      room.phase = "closed";
      room.left = room.players[index].name;
      room.undoStack = [];
      room.undoRequest = null;
      room.revision++;
    }
    return;
  }
  if (room.phase === "closed") throw new Error("This room has closed.");
  // Votes for the same completed game commute, so polling cannot lose a
  // simultaneous rematch request. Moves still require the exact revision.
  const sameGameRematch =
    body.type === "rematch" &&
    room.phase === "finished" &&
    body.gameId === room.gameId &&
    Number.isInteger(body.revision) &&
    body.revision >= 0 &&
    body.revision < room.revision;
  if (
    (body.type === "rematch" &&
      body.gameId !== undefined &&
      body.gameId !== room.gameId) ||
    (body.revision !== room.revision && !sameGameRematch)
  )
    throw new Error("The board changed. Please try again.");
  if (body.type === "color") {
    if (index !== 0) throw new Error("Only the host can choose colors.");
    if (room.phase !== "lobby")
      throw new Error("Colors are locked during a game.");
    if (!["black", "white"].includes(body.color))
      throw new Error("Choose Black or White.");
    room.players[0].color = body.color;
    if (room.players[1]) room.players[1].color = opposite(body.color);
  } else if (body.type === "start") {
    if (index !== 0 || room.phase !== "lobby" || room.players.length !== 2)
      throw new Error("The host can start when both players have joined.");
    startRound(room);
  } else if (body.type === "undo") {
    if (
      room.phase !== "playing" ||
      room.undoRequest ||
      room.reset.length ||
      room.undoStack.at(-1)?.actor !== index
    )
      throw new Error("Only your latest move can be taken back.");
    room.undoRequest = { by: index };
  } else if (body.type === "undo-response") {
    if (!room.undoRequest || room.undoRequest.by === index)
      throw new Error("Your opponent must approve the undo.");
    if (typeof body.accept !== "boolean")
      throw new Error("Accept or decline the undo.");
    if (body.accept) {
      room.game = room.undoStack.pop().game;
      room.reset = [];
    }
    room.undoRequest = null;
  } else if (body.type === "reset-response") {
    if (
      room.phase !== "playing" ||
      !room.reset.length ||
      room.reset.includes(index)
    )
      throw new Error("Your opponent must answer the restart request.");
    if (typeof body.accept !== "boolean")
      throw new Error("Accept or decline the restart.");
    if (body.accept) startRound(room);
    else room.reset = [];
  } else if (body.type === "rematch" || body.type === "reset") {
    if (room.undoRequest) throw new Error("Resolve the undo request first.");
    const key = body.type;
    if (room.phase !== (key === "reset" ? "playing" : "finished"))
      throw new Error("That request is not available now.");
    if (!room[key].includes(index)) room[key].push(index);
    if (room[key].length === 2) {
      if (key === "rematch") {
        room.round++;
        for (const player of room.players)
          player.color = opposite(player.color);
      }
      startRound(room);
    }
  } else {
    if (room.undoRequest && body.type !== "resign")
      throw new Error("Resolve the undo request first.");
    if (room.phase !== "playing") throw new Error("This game is not playing.");
    if (room.reset.length && body.type !== "resign")
      throw new Error("Resolve the restart request first.");
    const color = room.players[index].color;
    if (body.type !== "resign" && color !== room.game.current)
      throw new Error("It is your opponent's turn.");
    // Either seated player can resign, even while the opponent has the turn.
    const before = room.game;
    const game = play(
      body.type === "resign" ? { ...before, current: color } : before,
      body,
    );
    room.game = game;
    room.reset = [];
    if (game.winner) {
      room.phase = "finished";
      room.wins[room.players.findIndex((p) => p.color === game.winner)]++;
      room.undoStack = [];
      room.undoRequest = null;
    } else {
      room.undoStack = [
        ...room.undoStack,
        { actor: index, game: before },
      ].slice(-50);
    }
  }
  room.revision++;
}
