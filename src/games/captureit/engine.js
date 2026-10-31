const SQRT3 = Math.sqrt(3);
const VERTICES = [
  [2, 0],
  [1, 1],
  [-1, 1],
  [-2, 0],
  [-1, -1],
  [1, -1],
];
const AXIAL_STEPS = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];
const pointKey = ([x, y]) => `${x},${y}`;
const tileId = (q, r) => `${q},${r}`;
const screenPoint = ([x, y]) => [x / 2, (y * SQRT3) / 2];

export const opposite = (color) => (color === "white" ? "black" : "white");

// Integer lattice vertices make shared edges and corners exact. Screen positions
// use a hexagon side length of one, with increasing y pointing down.
export const TILES = [];
export const CELLS = [];
for (let q = -2; q <= 2; q++) {
  for (let r = -2; r <= 2; r++) {
    if (Math.abs(q + r) > 2) continue;
    const center = [3 * q, 2 * r + q];
    const vertices = VERTICES.map(([x, y]) => [center[0] + x, center[1] + y]);
    const id = tileId(q, r);
    const [x, y] = screenPoint(center);
    const tile = {
      id,
      q,
      r,
      x,
      y,
      points: vertices.map(screenPoint),
      cells: [],
      neighbors: AXIAL_STEPS.map(([dq, dr]) => tileId(q + dq, r + dr)),
    };
    for (let sector = 0; sector < 6; sector++) {
      const corners = [center, vertices[sector], vertices[(sector + 1) % 6]];
      const points = corners.map(screenPoint);
      const cell = {
        id: `${id}:${sector}`,
        tile: id,
        sector,
        color: sector % 2 ? "white" : "black",
        x: points.reduce((sum, p) => sum + p[0], 0) / 3,
        y: points.reduce((sum, p) => sum + p[1], 0) / 3,
        points,
        vertices: corners.map(pointKey),
        neighbors: [null, null, null],
        moves: [],
      };
      tile.cells.push(cell.id);
      CELLS.push(cell);
    }
    TILES.push(tile);
  }
}

export const CELL_BY_ID = Object.assign(
  Object.create(null),
  Object.fromEntries(CELLS.map((cell) => [cell.id, cell])),
);
export const TILE_BY_ID = Object.assign(
  Object.create(null),
  Object.fromEntries(TILES.map((tile) => [tile.id, tile])),
);
const edges = new Map();
for (const cell of CELLS) {
  for (let side = 0; side < 3; side++) {
    const key = [cell.vertices[side], cell.vertices[(side + 1) % 3]]
      .sort()
      .join("|");
    const previous = edges.get(key);
    if (previous) {
      cell.neighbors[side] = previous.cell.id;
      previous.cell.neighbors[previous.side] = cell.id;
    } else edges.set(key, { cell, side });
  }
  cell.moves = CELLS.filter(
    (other) =>
      other.id !== cell.id &&
      other.color === cell.color &&
      other.vertices.some((vertex) => cell.vertices.includes(vertex)),
  ).map((other) => other.id);
}
for (const tile of TILES)
  tile.neighbors = tile.neighbors.map((id) => (TILE_BY_ID[id] ? id : null));

export const BOARD_BOUNDS = {
  x: -4,
  y: -2.5 * SQRT3,
  width: 8,
  height: 5 * SQRT3,
};

// The six white pieces at the top of the Laurentius diagram, repeated every
// 120 degrees. A half-turn produces the black pieces and reverses field color.
const TOP_WHITE = [
  [0, -2, 3],
  [0, -2, 5],
  [-1, -1, 5],
  [1, -2, 3],
  [0, -1, 3],
  [0, -1, 5],
];
function rotate([q, r, sector], turns) {
  for (let i = 0; i < turns; i++) [q, r] = [-r, q + r];
  return `${tileId(q, r)}:${(sector + turns) % 6}`;
}

export function createGame() {
  const pieces = [];
  for (const color of ["white", "black"]) {
    for (const turns of [0, 2, 4]) {
      for (const cell of TOP_WHITE) {
        pieces.push({
          id: `${color[0]}${pieces.filter((p) => p.color === color).length + 1}`,
          color,
          cell: rotate(cell, (turns + (color === "black" ? 3 : 0)) % 6),
        });
      }
    }
  }
  return {
    version: 1,
    current: "white",
    turn: 1,
    tiles: TILES.map((tile) => tile.id),
    pieces,
    collected: { white: 0, black: 0 },
    winner: null,
    reason: null,
    log: [],
    lastAction: null,
  };
}

export function legalMoves(game, from) {
  const piece = game.pieces.find((candidate) => candidate.cell === from);
  if (game.winner || !piece || piece.color !== game.current) return [];
  const occupied = new Set(game.pieces.map((candidate) => candidate.cell));
  const tiles = new Set(game.tiles);
  return CELL_BY_ID[from].moves.filter(
    (to) => tiles.has(CELL_BY_ID[to].tile) && !occupied.has(to),
  );
}

export function canExchange(game) {
  return !game.winner && game.collected[game.current] >= 2;
}

export function isEnclosed(game, cellId) {
  const cell = CELL_BY_ID[cellId];
  if (!cell || !game.tiles.includes(cell.tile)) return false;
  const tiles = new Set(game.tiles);
  const opponent = opposite(cell.color);
  return cell.neighbors.every(
    (neighbor) =>
      !neighbor ||
      !tiles.has(CELL_BY_ID[neighbor].tile) ||
      game.pieces.some(
        (piece) => piece.cell === neighbor && piece.color === opponent,
      ),
  );
}

export function removableTile(game, id) {
  const tile = TILE_BY_ID[id];
  if (
    !tile ||
    !game.tiles.includes(id) ||
    game.pieces.some((p) => CELL_BY_ID[p.cell].tile === id)
  )
    return false;
  const attached = tile.neighbors.map(
    (neighbor) => neighbor !== null && game.tiles.includes(neighbor),
  );
  const count = attached.filter(Boolean).length;
  if (count > 3) return false;
  if (count === 0) return true;
  // Exactly one circular run: two separated neighbors retain their bridge tile.
  return (
    attached.filter((present, i) => present && !attached[(i + 5) % 6])
      .length === 1
  );
}

export function play(game, action) {
  if (game.winner) throw new Error("This game is finished.");
  const type = action?.type;
  if (!["move", "exchange", "resign"].includes(type))
    throw new Error(
      "Choose a move, exchange, or resignation. Passing is not allowed.",
    );
  if (type === "move" && !legalMoves(game, action.from).includes(action.to))
    throw new Error(
      "Move your piece to an empty neighboring field of its color.",
    );
  if (type === "exchange") {
    if (!canExchange(game))
      throw new Error("Collect two tiles before exchanging them.");
    if (
      !game.pieces.some(
        (p) => p.cell === action.target && p.color !== game.current,
      )
    )
      throw new Error("Choose an opponent's piece to exchange for two tiles.");
  }
  const next = {
    ...game,
    tiles: [...game.tiles],
    pieces: game.pieces.map((p) => ({ ...p })),
    collected: { ...game.collected },
    log: [...game.log],
  };
  const entry = {
    type,
    color: game.current,
    turn: game.turn,
    captured: [],
    collected: [],
    discarded: [],
  };
  if (type === "resign") {
    next.winner = opposite(game.current);
    next.reason = "resignation";
  } else {
    const other = opposite(game.current);
    // A neutral piece remains safe while continuously enclosed. Moving an
    // enclosing piece away and replacing it with a new board edge can enclose
    // it afresh later in the same turn.
    const neutral = new Set(
      game.pieces
        .filter((p) => p.color === other && isEnclosed(game, p.cell))
        .map((p) => p.id),
    );
    const refreshNeutral = () => {
      for (const id of neutral) {
        const piece = next.pieces.find((p) => p.id === id);
        if (!piece || !isEnclosed(next, piece.cell)) neutral.delete(id);
      }
    };
    if (type === "move") {
      const moving = next.pieces.find((p) => p.cell === action.from);
      moving.cell = action.to;
      entry.from = action.from;
      entry.to = action.to;
      entry.pieceId = moving.id;
    } else {
      entry.target = action.target;
      entry.captured.push({
        ...next.pieces.find((p) => p.cell === action.target),
      });
      next.pieces = next.pieces.filter((p) => p.cell !== action.target);
      next.collected[game.current] -= 2;
    }
    refreshNeutral();
    const removeEmptyTiles = (collect, preferred = []) => {
      let removable;
      while (
        (removable = [...preferred, ...next.tiles].find((id) =>
          removableTile(next, id),
        ))
      ) {
        next.tiles = next.tiles.filter((id) => id !== removable);
        entry[collect ? "collected" : "discarded"].push(removable);
        if (collect) next.collected[game.current]++;
        refreshNeutral();
      }
    };
    removeEmptyTiles(type === "move", [
      CELL_BY_ID[type === "move" ? action.from : action.target].tile,
    ]);
    for (;;) {
      const captured = next.pieces.filter(
        (p) =>
          p.color === other && !neutral.has(p.id) && isEnclosed(next, p.cell),
      );
      if (!captured.length) break;
      const ids = new Set(captured.map((p) => p.id));
      entry.captured.push(...captured.map((p) => ({ ...p })));
      next.pieces = next.pieces.filter((p) => !ids.has(p.id));
      refreshNeutral();
      // A capture never earns tiles, including later empty-tile cascades.
      removeEmptyTiles(
        false,
        captured.map((p) => CELL_BY_ID[p.cell].tile),
      );
    }
    if (!next.pieces.some((p) => p.color === other)) {
      next.winner = game.current;
      next.reason = "capture";
    }
  }
  next.log = [...next.log, entry].slice(-120);
  next.lastAction = entry;
  if (!next.winner) {
    next.current = opposite(game.current);
    next.turn++;
  }
  return next;
}

function validEntry(entry) {
  if (
    !entry ||
    !["move", "exchange", "resign"].includes(entry.type) ||
    !["white", "black"].includes(entry.color) ||
    !Number.isSafeInteger(entry.turn) ||
    entry.turn < 1
  )
    return false;
  if (
    entry.type === "move" &&
    (typeof entry.from !== "string" ||
      typeof entry.to !== "string" ||
      !CELL_BY_ID[entry.from] ||
      !CELL_BY_ID[entry.to] ||
      typeof entry.pieceId !== "string")
  )
    return false;
  if (
    entry.type === "exchange" &&
    (typeof entry.target !== "string" || !CELL_BY_ID[entry.target])
  )
    return false;
  return (
    Array.isArray(entry.captured) &&
    entry.captured.length <= 18 &&
    entry.captured.every(validPiece) &&
    [entry.collected, entry.discarded].every(
      (ids) =>
        Array.isArray(ids) &&
        ids.length <= 19 &&
        ids.every((id) => typeof id === "string" && TILE_BY_ID[id]),
    )
  );
}

function validPiece(piece) {
  return (
    !!piece &&
    typeof piece.id === "string" &&
    /^[wb](?:[1-9]|1[0-8])$/.test(piece.id) &&
    ["white", "black"].includes(piece.color) &&
    piece.id[0] === piece.color[0] &&
    typeof piece.cell === "string" &&
    !!CELL_BY_ID[piece.cell] &&
    CELL_BY_ID[piece.cell].color === piece.color
  );
}

// Saved game data is untrusted. Reject impossible coordinates, identities,
// banks, duplicates, and malformed history before it reaches board rendering.
export function validGame(game) {
  try {
    if (
      !game ||
      game.version !== 1 ||
      !["white", "black"].includes(game.current) ||
      ![null, "white", "black"].includes(game.winner) ||
      ![null, "capture", "resignation"].includes(game.reason) ||
      !Number.isSafeInteger(game.turn) ||
      game.turn < 1 ||
      !Array.isArray(game.tiles) ||
      !game.tiles.length ||
      game.tiles.length > 19 ||
      game.tiles.some((id) => typeof id !== "string" || !TILE_BY_ID[id]) ||
      new Set(game.tiles).size !== game.tiles.length ||
      !Array.isArray(game.pieces) ||
      !game.pieces.length ||
      game.pieces.length > 36 ||
      !game.pieces.every(
        (p) => validPiece(p) && game.tiles.includes(CELL_BY_ID[p.cell].tile),
      ) ||
      new Set(game.pieces.map((p) => p.id)).size !== game.pieces.length ||
      new Set(game.pieces.map((p) => p.cell)).size !== game.pieces.length ||
      !game.collected ||
      !["white", "black"].every(
        (color) =>
          Number.isInteger(game.collected[color]) && game.collected[color] >= 0,
      ) ||
      game.collected.white + game.collected.black > 19 - game.tiles.length ||
      !Array.isArray(game.log) ||
      game.log.length > 120 ||
      !game.log.every(validEntry) ||
      (game.lastAction !== null && !validEntry(game.lastAction))
    )
      return false;
    if (!game.winner)
      return (
        game.reason === null &&
        ["white", "black"].every((color) =>
          game.pieces.some((p) => p.color === color),
        )
      );
    if (!game.reason) return false;
    return game.reason === "resignation"
      ? game.winner === opposite(game.current)
      : game.winner === game.current &&
          !game.pieces.some((p) => p.color !== game.winner);
  } catch {
    return false;
  }
}

export function restoreGame(value) {
  try {
    const saved = typeof value === "string" ? JSON.parse(value) : value;
    if (!validGame(saved)) return null;
    return JSON.parse(JSON.stringify(saved));
  } catch {
    return null;
  }
}

export function describeAction(entry) {
  if (!entry) return "White moves first. Select a white piece.";
  const name = entry.color === "white" ? "White" : "Black";
  if (entry.type === "resign") return `${name} resigned.`;
  const details = [];
  if (entry.captured.length)
    details.push(
      `captured ${entry.captured.length} ${entry.captured.length === 1 ? "piece" : "pieces"}`,
    );
  if (entry.collected.length)
    details.push(
      `collected ${entry.collected.length} ${entry.collected.length === 1 ? "tile" : "tiles"}`,
    );
  if (entry.discarded.length)
    details.push(
      `removed ${entry.discarded.length} empty ${entry.discarded.length === 1 ? "tile" : "tiles"}`,
    );
  return `${name} ${entry.type === "exchange" ? "exchanged two tiles" : "moved"}${details.length ? ` · ${details.join(" · ")}` : ""}.`;
}
