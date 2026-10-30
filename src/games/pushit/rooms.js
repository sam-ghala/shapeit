import { opposite } from "./engine.js";
import { cleanProfile } from "../../shared/server/profile.js";
const ROOM_MS = 2 * 60 * 60_000;
import {
  matchFormat,
  newMatch,
  nextRound,
  playMatch,
  resetRound,
  undoMatch,
} from "./match.js";

const makePlayer = (profile, color) => ({
  ...cleanProfile(profile),
  color,
  token: crypto.randomUUID() + crypto.randomUUID(),
});
export function createPushRoom(code, profile, now = Date.now()) {
  return {
    ...newMatch(),
    version: 2,
    code,
    id: crypto.randomUUID(),
    expiresAt: now + ROOM_MS,
    players: [makePlayer(profile, "black")],
    phase: "lobby",
    revision: 0,
    rematch: [],
    reset: [],
    undoRequest: null,
  };
}
export function upgradePushRoom(room) {
  room.lobbyReady ||= [];
  if (room.phase !== "playing") {
    room.undoStack = [];
    room.undoRequest = null;
  }
  if (room.version === 2) return;
  room.version = 2;
  room.bestOf = 0;
  room.matchId = room.id;
  room.gameId = `${room.id}:${room.round}`;
  room.matchWinner = null;
  room.undoStack = [];
  room.undoRequest = null;
  if (room.phase === "waiting") room.phase = "lobby";
}
export function joinPushRoom(room, profile) {
  upgradePushRoom(room);
  if (room.phase !== "lobby" || room.players.length !== 1)
    throw new Error("This room is full or already playing.");
  if (profile?.id === room.players[0].id)
    throw new Error("Use a different browser or device for the second player.");
  room.players.push(makePlayer(profile, opposite(room.players[0].color)));
  room.revision++;
  return room.players[1].token;
}
export function pushRoomView(room, index) {
  upgradePushRoom(room);
  const { undoStack, ...publicRoom } = room;
  return {
    ...publicRoom,
    players: room.players.map(({ id, name, color }) => ({ id, name, color })),
    you: index,
    canUndo:
      room.phase === "playing" &&
      undoStack.at(-1)?.actor === index &&
      !room.undoRequest,
  };
}
export function applyPushAction(room, index, body) {
  upgradePushRoom(room);
  if (!Number.isInteger(index) || index < 0 || index >= room.players.length)
    throw new Error("Room access denied.");
  if (body.type === "leave") {
    if (room.phase !== "closed") {
      room.phase = "closed";
      room.left = room.players[index].name;
      room.revision++;
    }
    return;
  }
  if (room.phase === "closed") throw new Error("This room has closed.");
  if (body.revision !== room.revision)
    throw new Error("The board changed. Please try again.");
  if (body.type === "color") {
    if (index !== 0) throw new Error("Only the host can choose colors.");
    if (room.phase !== "lobby")
      throw new Error("Colors are locked during a match.");
    if (!["black", "white"].includes(body.color))
      throw new Error("Choose Black or White.");
    room.players[index].color = body.color;
    if (room.players[1 - index])
      room.players[1 - index].color = opposite(body.color);
  } else if (body.type === "format") {
    if (index !== 0 || room.phase !== "lobby")
      throw new Error(
        "Only the host can change the match format in the lobby.",
      );
    room.bestOf = matchFormat(body.bestOf);
  } else if (body.type === "start") {
    if (index !== 0 || room.phase !== "lobby" || room.players.length !== 2)
      throw new Error("The host can start when both players have joined.");
    Object.assign(room, newMatch(room.bestOf));
    room.rematch = [];
    room.reset = [];
    room.undoRequest = null;
    room.lobbyReady = [];
  } else if (body.type === "return-lobby") {
    if (room.phase !== "complete") throw new Error("Finish the series first.");
    if (!room.lobbyReady.includes(index)) room.lobbyReady.push(index);
    if (room.lobbyReady.length === 2) {
      room.phase = "lobby";
      room.rematch = [];
      room.reset = [];
    }
  } else if (body.type === "undo") {
    if (
      room.undoRequest ||
      room.undoStack.at(-1)?.actor !== index ||
      room.phase !== "playing"
    )
      throw new Error("Only your latest move can be taken back.");
    room.undoRequest = { by: index };
  } else if (body.type === "undo-response") {
    if (!room.undoRequest || room.undoRequest.by === index)
      throw new Error("Your opponent must approve the undo.");
    if (typeof body.accept !== "boolean")
      throw new Error("Accept or decline the undo.");
    if (body.accept) {
      undoMatch(room);
      room.rematch = [];
      room.reset = [];
    }
    room.undoRequest = null;
  } else if (body.type === "rematch" || body.type === "reset") {
    if (room.undoRequest) throw new Error("Resolve the undo request first.");
    const required = body.type === "reset" ? "playing" : "finished";
    if (room.phase !== required)
      throw new Error("That request is not available now.");
    const key = body.type === "reset" ? "reset" : "rematch";
    if (!room[key].includes(index)) room[key].push(index);
    if (room[key].length === 2) {
      if (body.type === "reset") resetRound(room);
      else nextRound(room);
      room.rematch = [];
      room.reset = [];
    }
  } else {
    if (room.undoRequest) throw new Error("Resolve the undo request first.");
    if (room.phase !== "playing") throw new Error("This round is not playing.");
    if (room.players[index].color !== room.game.current)
      throw new Error("It is your opponent's turn.");
    playMatch(room, body, index);
    room.reset = [];
  }
  room.revision++;
}
