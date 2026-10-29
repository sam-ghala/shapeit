import { act, createGame, opposite } from "./engine.js";
import { cleanProfile, ROOM_MS } from "../server/duel.js";

const makePlayer = (profile, color) => ({
  ...cleanProfile(profile),
  color,
  token: crypto.randomUUID() + crypto.randomUUID(),
});
export function createPushRoom(
  code,
  profile,
  hostColor = "black",
  starter = "black",
  now = Date.now(),
) {
  if (
    !["black", "white"].includes(hostColor) ||
    !["black", "white"].includes(starter)
  )
    throw new Error("Choose valid player colors.");
  return {
    code,
    id: crypto.randomUUID(),
    expiresAt: now + ROOM_MS,
    players: [makePlayer(profile, hostColor)],
    phase: "waiting",
    game: createGame(starter),
    starter,
    revision: 0,
    round: 1,
    wins: { black: 0, white: 0 },
    rematch: [],
    reset: [],
  };
}
export function joinPushRoom(room, profile) {
  if (room.phase !== "waiting" || room.players.length !== 1)
    throw new Error("This room is full or already playing.");
  if (profile?.id === room.players[0].id)
    throw new Error("Use a different browser or device for the second player.");
  room.players.push(makePlayer(profile, opposite(room.players[0].color)));
  room.phase = "playing";
  room.revision++;
  return room.players[1].token;
}
export function pushRoomView(room, index) {
  return {
    ...room,
    players: room.players.map(({ id, name, color }) => ({ id, name, color })),
    you: index,
  };
}
export function applyPushAction(room, index, body) {
  if (index < 0 || index >= room.players.length)
    throw new Error("Room access denied.");
  if (body.type === "leave") {
    if (room.phase === "closed") return;
    room.phase = "closed";
    room.left = room.players[index].name;
    room.revision++;
    return;
  }
  if (room.phase === "closed") throw new Error("This room has closed.");
  if (body.revision !== room.revision)
    throw new Error("The board changed. Please try again.");
  if (body.type === "rematch" || body.type === "reset") {
    if (
      body.type === "rematch"
        ? room.phase !== "finished"
        : room.phase !== "playing"
    )
      throw new Error("That request is not available now.");
    const key = body.type === "rematch" ? "rematch" : "reset";
    if (!room[key].includes(index)) room[key].push(index);
    if (room[key].length === 2) {
      room.game = createGame(room.starter);
      room.phase = "playing";
      room.round++;
      room.rematch = [];
      room.reset = [];
    }
  } else {
    if (room.phase !== "playing")
      throw new Error("Wait for your opponent to join.");
    if (room.players[index].color !== room.game.current)
      throw new Error("It is your opponent's turn.");
    room.game = act(room.game, body);
    room.reset = [];
    if (room.game.winner) {
      room.phase = "finished";
      room.wins[room.game.winner]++;
    }
  }
  room.revision++;
}
