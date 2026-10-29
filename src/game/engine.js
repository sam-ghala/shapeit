import { normalizeExtras } from "./extras.js";
import {
  DESKTOP_PIECES,
  ROTATE_MAP,
  MIRROR_MAP,
  FLAT_SIDES,
  DIR_TO_ENTRY,
  BOUNCE,
} from "../constants/gameConstants.js";

export const ENGINE_VERSION = 2;
export const SIZES = {
  compact: { cols: 7, rows: 5 },
  classic: { cols: 10, rows: 8 },
};
// Each compact shape is distinct under every rotation and reflection.
export const SHAPES = [
  {
    key: "diamond",
    name: "Diamond",
    cells: [
      [0, 0, "/b"],
      [0, 1, "\\b"],
      [1, 0, "\\"],
      [1, 1, "/"],
    ],
  },
  {
    key: "triangle",
    name: "Triangle",
    cells: [
      [0, 0, "\\f"],
      [0, 1, "/"],
      [1, 0, "/"],
    ],
  },
  {
    key: "parallelogram",
    name: "Parallelogram",
    cells: [
      [0, 0, "/b"],
      [0, 1, "/"],
    ],
  },
  {
    key: "trapezoid",
    name: "Trapezoid",
    cells: [
      [0, 0, "/b"],
      [0, 1, "/f"],
      [0, 2, "\\b"],
    ],
  },
  {
    key: "rectangle",
    name: "Rectangle",
    cells: [
      [0, 0, "/f"],
      [0, 1, "/f"],
    ],
  },
  { key: "pyramid", name: "Large pyramid", cells: DESKTOP_PIECES[0].cells },
];
export const COMPACT_SHAPES = SHAPES.filter((s) => s.key !== "pyramid");
export const EXTRA_PIECES = [
  {
    id: "transparent",
    color: "transparent",
    name: "Transparent diamond",
    cells: SHAPES[0].cells,
  },
  { id: "black", color: "black", name: "Black body", cells: [[0, 0, "/f"]] },
];
export const emptyBoard = (cols, rows) =>
  Array.from({ length: rows }, () => Array(cols).fill(null));
export const diagOf = (t) => (t[0] === "/" ? "/" : "\\");
export const isFull = (t) => t.endsWith("f");
export function mulberry32(s) {
  let t = s | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++)
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h;
}
export function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function dailyDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
export function dailySeed(size, now = new Date()) {
  return `v${ENGINE_VERSION}:${dailyDate(now)}:${size}`;
}
export function rotateCells(cells, rot) {
  let result = cells.map((c) => [...c]);
  for (let i = 0; i < rot; i++)
    result = result.map(([r, c, t]) => [c, -r, ROTATE_MAP[t]]);
  const mr = Math.min(...result.map((c) => c[0])),
    mc = Math.min(...result.map((c) => c[1]));
  return result.map(([r, c, t]) => [r - mr, c - mc, t]);
}
export function mirrorCells(cells) {
  const max = Math.max(...cells.map((c) => c[1]));
  return cells.map(([r, c, t]) => [r, max - c, MIRROR_MAP[t]]);
}
export function cellsEqual(a, b) {
  const key = (x) =>
    x
      .map((c) => c.join(","))
      .sort()
      .join("|");
  return key(a) === key(b);
}
export function shapeKey(cells) {
  return [cells, mirrorCells(cells)]
    .flatMap((base) =>
      [0, 1, 2, 3].map((rot) =>
        rotateCells(base, rot)
          .map((c) => c.join(","))
          .sort()
          .join("|"),
      ),
    )
    .sort()[0];
}
export function exposedSides(t) {
  return FLAT_SIDES[t] || [];
}
export function sideToEdgeKey(r, c, s) {
  return s === "top"
    ? `h-${r}-${c}`
    : s === "bottom"
      ? `h-${r + 1}-${c}`
      : s === "left"
        ? `v-${r}-${c}`
        : `v-${r}-${c + 1}`;
}
export function neighborRC(r, c, s) {
  return s === "top"
    ? [r - 1, c]
    : s === "bottom"
      ? [r + 1, c]
      : s === "left"
        ? [r, c - 1]
        : [r, c + 1];
}
export function computeOutlineEdges(cells) {
  const occupied = new Set(cells.map(([r, c]) => `${r},${c}`));
  return cells.flatMap(([r, c, t]) =>
    exposedSides(t)
      .filter((s) => !occupied.has(neighborRC(r, c, s).join(",")))
      .map((s) => sideToEdgeKey(r, c, s)),
  );
}
export function reflect(dir, t) {
  if (exposedSides(t).includes(DIR_TO_ENTRY[dir])) return BOUNCE[dir];
  return (
    diagOf(t) === "\\"
      ? { right: "down", down: "right", left: "up", up: "left" }
      : { right: "up", up: "right", left: "down", down: "left" }
  )[dir];
}
export function getLabel(side, idx, cols = 10, rows = 8) {
  return side === "top"
    ? String(idx + 1)
    : side === "right"
      ? String(cols + idx + 1)
      : String.fromCharCode(65 + (side === "bottom" ? rows : 0) + idx);
}

// Coordinates are in grid units. Flat faces reflect at the cell boundary;
// diagonals reflect at the cell centre. Paths never travel inside a solid.
export function fireLaser(board, side, idx) {
  const rows = board.length,
    cols = board[0].length;
  if (
    !["top", "bottom", "left", "right"].includes(side) ||
    !Number.isInteger(idx) ||
    idx < 0 ||
    idx >= (["top", "bottom"].includes(side) ? cols : rows)
  )
    throw new Error("Invalid laser entry");
  let r = side === "bottom" ? rows - 1 : side === "top" ? 0 : idx;
  let c = side === "right" ? cols - 1 : side === "left" ? 0 : idx;
  let dir = { top: "down", bottom: "up", left: "right", right: "left" }[side];
  const start = {
    top: [idx + 0.5, 0],
    bottom: [idx + 0.5, rows],
    left: [0, idx + 0.5],
    right: [cols, idx + 0.5],
  }[side];
  const points = [start],
    path = [],
    hits = new Set(),
    colors = new Set(),
    visited = new Set();
  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    const key = `${r},${c},${dir}`;
    if (visited.has(key))
      return {
        exitSide: null,
        exitIdx: null,
        colors: [],
        points,
        path,
        hits: [...hits],
        loop: true,
        absorbed: false,
      };
    visited.add(key);
    path.push([r, c]);
    const cell = board[r][c];
    if (cell) {
      hits.add(cell.pieceId ?? `${r},${c}`);
      const flat = exposedSides(cell.type).includes(DIR_TO_ENTRY[dir]);
      const collision = flat
        ? {
            down: [c + 0.5, r],
            up: [c + 0.5, r + 1],
            right: [c, r + 0.5],
            left: [c + 1, r + 0.5],
          }[dir]
        : [c + 0.5, r + 0.5];
      points.push(collision);
      if (cell.color === "black")
        return {
          exitSide: null,
          exitIdx: null,
          colors: [],
          points,
          path,
          hits: [...hits],
          absorbed: true,
          loop: false,
        };
      if (cell.color !== "transparent") colors.add(cell.color);
      dir = reflect(dir, cell.type);
    }
    if (dir === "down") r++;
    else if (dir === "up") r--;
    else if (dir === "right") c++;
    else c--;
  }
  const exitSide =
    r < 0 ? "top" : r >= rows ? "bottom" : c < 0 ? "left" : "right";
  const exitIdx = exitSide === "top" || exitSide === "bottom" ? c : r;
  points.push(
    {
      top: [c + 0.5, 0],
      bottom: [c + 0.5, rows],
      left: [0, r + 0.5],
      right: [cols, r + 0.5],
    }[exitSide],
  );
  return {
    exitSide,
    exitIdx,
    colors: [...colors].sort(),
    points,
    path,
    hits: [...hits],
    absorbed: false,
    loop: false,
  };
}
export function buildPieces(
  seed,
  size = "compact",
  extras = false,
  allowed = null,
) {
  const rng = mulberry32(hashSeed(`${seed}:pieces`));
  let pieces;
  if (size === "classic" && !allowed)
    pieces = DESKTOP_PIECES.map((p) => ({ ...p }));
  else {
    const bank = allowed
      ? SHAPES.filter((s) => allowed.includes(s.key))
      : COMPACT_SHAPES;
    const count = size === "classic" ? 5 : 4;
    if (bank.length < count)
      throw new Error(`Choose at least ${count} shapes.`);
    const shapes = shuffle(bank, rng).slice(0, count);
    const colors = shuffle(["red", "blue", "yellow", "white"], rng);
    pieces = shapes.map((s, i) => ({
      ...s,
      id: `p${i}`,
      color: colors[i % colors.length],
    }));
  }
  const enabled = normalizeExtras(extras);
  return [
    ...pieces,
    ...EXTRA_PIECES.filter((p) =>
      p.color === "transparent" ? enabled.diamond : enabled.black,
    ),
  ];
}
export function boardFromPlaced(placed, cols, rows) {
  const board = emptyBoard(cols, rows);
  for (const p of placed)
    for (const [r, c, t] of p.absCells) {
      if (
        !Number.isInteger(r) ||
        !Number.isInteger(c) ||
        r < 0 ||
        c < 0 ||
        r >= rows ||
        c >= cols ||
        !FLAT_SIDES[t] ||
        board[r][c]
      )
        throw new Error("Pieces must fit without overlapping.");
      board[r][c] = { color: p.color, type: t, pieceId: p.id };
    }
  return board;
}
export function placementError(placed, cols, rows, requireReachable = true) {
  let board;
  try {
    board = boardFromPlaced(placed, cols, rows);
  } catch (e) {
    return e.message;
  }
  const edges = new Set();
  for (const p of placed)
    for (const edge of computeOutlineEdges(p.absCells)) {
      if (edges.has(edge))
        return "Pieces may touch at a point, but must not share an edge.";
      edges.add(edge);
    }
  if (requireReachable) {
    const hit = new Set();
    for (const side of ["top", "bottom", "left", "right"])
      for (
        let i = 0;
        i < (["top", "bottom"].includes(side) ? cols : rows);
        i++
      ) {
        const laser = fireLaser(board, side, i);
        if (laser.loop) return "This placement creates a laser loop.";
        laser.hits.forEach((id) => hit.add(id));
      }
    if (placed.some((p) => !hit.has(p.id)))
      return "Every piece must be reachable by a laser from the border.";
  }
  return null;
}
export function validatePlacements(input, pieces, cols, rows, partial = false) {
  if (
    !Array.isArray(input) ||
    input.length > pieces.length ||
    (!partial && input.length !== pieces.length)
  )
    throw new Error("Place every piece.");
  const ids = input.map((p) => p?.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !pieces.some((p) => p.id === id))
  )
    throw new Error("Invalid piece selection.");
  const placed = pieces
    .filter((p) => ids.includes(p.id))
    .map((p) => {
      const candidate = input.find((v) => v.id === p.id);
      if (
        !candidate ||
        !Array.isArray(candidate.absCells) ||
        candidate.absCells.length !== p.cells.length
      )
        throw new Error("Invalid piece.");
      if (
        candidate.absCells.some(
          (c) =>
            !Array.isArray(c) ||
            c.length !== 3 ||
            !Number.isInteger(c[0]) ||
            !Number.isInteger(c[1]) ||
            !FLAT_SIDES[c[2]],
        )
      )
        throw new Error("Invalid cell.");
      const norm = rotateCells(candidate.absCells, 0);
      if (shapeKey(norm) !== shapeKey(p.cells))
        throw new Error("A piece has the wrong shape.");
      return { ...p, absCells: candidate.absCells };
    });
  const error = placementError(placed, cols, rows);
  if (error) throw new Error(error);
  return placed;
}
export function generatePuzzle(seed, pieces, cols = 10, rows = 8) {
  for (let retry = 0; retry < 120; retry++) {
    const rng = mulberry32(hashSeed(`${seed}:${retry}`)),
      placed = [];
    for (const p of shuffle(pieces, rng)) {
      for (let attempt = 0; attempt < 400; attempt++) {
        const cells = rotateCells(
          rng() < 0.5 ? mirrorCells(p.cells) : p.cells,
          Math.floor(rng() * 4),
        );
        const h = Math.max(...cells.map((c) => c[0])) + 1,
          w = Math.max(...cells.map((c) => c[1])) + 1;
        if (h > rows || w > cols) break;
        const r = Math.floor(rng() * (rows - h + 1)),
          c = Math.floor(rng() * (cols - w + 1));
        const candidate = {
          ...p,
          absCells: cells.map(([dr, dc, t]) => [r + dr, c + dc, t]),
        };
        if (!placementError([...placed, candidate], cols, rows, false)) {
          placed.push(candidate);
          break;
        }
      }
      if (placed.length === 0 || placed.at(-1).id !== p.id) break;
    }
    if (placed.length === pieces.length && !placementError(placed, cols, rows))
      return { board: boardFromPlaced(placed, cols, rows), placed };
  }
  throw new Error(
    "Could not create a legal board. Please choose fewer large shapes.",
  );
}
export function solutionDrawing(placed, cols, rows) {
  const guess = emptyBoard(cols, rows),
    edges = {};
  for (const p of placed) {
    for (const [r, c, t] of p.absCells)
      if (!isFull(t)) guess[r][c] = { color: p.color, type: diagOf(t) };
    for (const edge of computeOutlineEdges(p.absCells)) edges[edge] = p.color;
  }
  return { guess, edges };
}
export function checkSolution(guess, edges, placed, cols, rows) {
  if (
    !placed.length ||
    !Array.isArray(guess) ||
    guess.length !== rows ||
    guess.some((row) => !Array.isArray(row) || row.length !== cols) ||
    !edges ||
    typeof edges !== "object"
  )
    return false;
  const expected = solutionDrawing(placed, cols, rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const actual = guess[r][c]?.color === "x" ? null : guess[r][c],
        wanted = expected.guess[r][c];
      if (
        (actual?.color ?? null) !== (wanted?.color ?? null) ||
        (actual?.type ?? null) !== (wanted?.type ?? null)
      )
        return false;
    }
  const keys = Object.keys(edges);
  return (
    keys.length === Object.keys(expected.edges).length &&
    keys.every((k) => edges[k] === expected.edges[k])
  );
}
export function findMatch(guess, edges, piece) {
  const rows = guess.length,
    cols = guess[0].length;
  for (const base of [piece.cells, mirrorCells(piece.cells)])
    for (let rot = 0; rot < 4; rot++) {
      const cells = rotateCells(base, rot),
        h = Math.max(...cells.map((c) => c[0])) + 1,
        w = Math.max(...cells.map((c) => c[1])) + 1;
      for (let r = 0; r <= rows - h; r++)
        for (let c = 0; c <= cols - w; c++) {
          const abs = cells.map(([dr, dc, t]) => [r + dr, c + dc, t]);
          if (
            abs.every(
              ([ar, ac, t]) =>
                isFull(t) ||
                (guess[ar][ac]?.color === piece.color &&
                  guess[ar][ac]?.type === diagOf(t)),
            ) &&
            computeOutlineEdges(abs).every((k) => edges[k] === piece.color)
          )
            return abs;
        }
    }
  return null;
}
export function calcTimeScore(seconds) {
  return 200 / (Math.max(0, seconds) / 60 + 2);
}
export function calcQueryScore(q) {
  return q <= 5 ? 100 : q <= 10 ? 120 - 4 * q : 80 * Math.exp(-0.3 * (q - 10));
}
export function calcScore(seconds, queries) {
  return Math.round(calcTimeScore(seconds) * calcQueryScore(queries));
}
