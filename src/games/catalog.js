// The only registry to edit when adding another independent game.
// Runtime imports live in platform/App.jsx so this metadata is safe on the server.
export const GAMES = [
  {
    id: "shapeit",
    name: "ShapeIt",
    icon: "◈",
    status: "ready",
    modes: ["daily", "training", "duel"],
    sizes: ["compact", "classic"],
  },
  {
    id: "pushit",
    name: "PushIt",
    icon: "↟",
    status: "ready",
    modes: ["local", "online"],
    sizes: ["4x4"],
  },
  {
    id: "chessit",
    name: "ChessIt",
    icon: "♞",
    status: "coming-soon",
    modes: ["preview"],
    sizes: ["8x8"],
  },
];
export const gameInfo = (id) => GAMES.find((game) => game.id === id);
export const PRIMARY_DOMAIN = "playshapeit.com";
