export const PCOLORS = {
  red: "#E53935",
  blue: "#1E88E5",
  yellow: "#FBC02D",
  white: "#757575",
  transparent: "#00838f",
  black: "#212121",
};

export const PFILL = {
  red: "rgba(229,57,53,0.45)",
  blue: "rgba(30,136,229,0.45)",
  yellow: "rgba(251,192,45,0.45)",
  white: "rgba(158,158,158,0.30)",
  transparent: "rgba(0,131,143,0.08)",
  black: "rgba(33,33,33,0.80)",
};

export const ROTATE_MAP = {
  "/": "\\",
  "\\": "/b",
  "/b": "\\b",
  "\\b": "/",
  "/f": "\\f",
  "\\f": "/f",
};

export const MIRROR_MAP = {
  "/": "\\",
  "\\": "/",
  "/b": "\\b",
  "\\b": "/b",
  "/f": "\\f",
  "\\f": "/f",
};

export const FLAT_SIDES = {
  "/": ["top", "left"],
  "\\": ["top", "right"],
  "/b": ["bottom", "right"],
  "\\b": ["bottom", "left"],
  "/f": ["top", "bottom", "left", "right"],
  "\\f": ["top", "bottom", "left", "right"],
};

export const DIR_TO_ENTRY = {
  right: "left",
  left: "right",
  down: "top",
  up: "bottom",
};

export const BOUNCE = {
  right: "left",
  left: "right",
  down: "up",
  up: "down",
};

export const DESKTOP_PIECES = [
  {
    id: "wl",
    color: "white",
    name: "Lg pyramid",
    cells: [
      [0, 1, "/b"],
      [0, 2, "\\b"],
      [1, 0, "/b"],
      [1, 1, "/f"],
      [1, 2, "\\f"],
      [1, 3, "\\b"],
    ],
  },
  {
    id: "bl",
    color: "blue",
    name: "Lg pyramid",
    cells: [
      [0, 1, "/b"],
      [0, 2, "\\b"],
      [1, 0, "/b"],
      [1, 1, "/f"],
      [1, 2, "\\f"],
      [1, 3, "\\b"],
    ],
  },
  {
    id: "ws",
    color: "white",
    name: "Diamond",
    cells: [
      [0, 0, "/b"],
      [0, 1, "\\b"],
      [1, 0, "\\"],
      [1, 1, "/"],
    ],
  },
  {
    id: "yl",
    color: "yellow",
    name: "Sm triangle",
    cells: [
      [0, 0, "\\f"],
      [0, 1, "/"],
      [1, 0, "/"],
    ],
  },
  {
    id: "rd",
    color: "red",
    name: "Parallelogram",
    cells: [
      [0, 0, "/b"],
      [0, 1, "/f"],
      [0, 2, "/"],
    ],
  },
];
