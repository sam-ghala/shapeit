import React, { useState, useMemo, useEffect } from "react";
import { PCOLORS, PFILL } from "../constants/gameConstants";
import {
  fillPoints,
  diagLine,
  computeOutlineEdges,
  isFull,
} from "../utils/gameUtils";
import { fireLaser as traceLaser, checkSolution } from "../game/engine.js";
import { Dialog } from "./Dialog.jsx";
import { PiecePreview } from "./PiecePreview";

/* ─── Interactive Training & Example ─── */
const fireLaserLocal = (board, side, idx) => traceLaser(board, side, idx);

const TRAIN_COLS = 5,
  TRAIN_ROWS = 4;
const TRAIN_PIECES = [
  {
    color: "red",
    absCells: [
      [0, 0, "/b"],
      [0, 1, "/f"],
      [0, 2, "/"],
    ],
  },
  {
    color: "white",
    absCells: [
      [1, 1, "/b"],
      [1, 2, "\\b"],
      [2, 1, "\\"],
      [2, 2, "/"],
    ],
  },
  {
    color: "blue",
    absCells: [
      [2, 3, "\\f"],
      [2, 4, "/"],
      [3, 3, "/"],
    ],
  },
];
function buildTrainBoard() {
  const b = Array.from({ length: TRAIN_ROWS }, () =>
    Array(TRAIN_COLS).fill(null),
  );
  for (const p of TRAIN_PIECES) {
    for (const [r, c, t] of p.absCells) b[r][c] = { color: p.color, type: t };
  }
  return b;
}
const TRAIN_BOARD = buildTrainBoard();
const TRAIN_TOP = ["1", "2", "3", "4", "5"];
const TRAIN_LEFT = ["A", "B", "C", "D"];
const TRAIN_RIGHT = ["6", "7", "8", "9"];
const TRAIN_BOT = ["E", "F", "G", "H", "I"];
function trainLabel(side, idx) {
  if (side === "top") return TRAIN_TOP[idx];
  if (side === "left") return TRAIN_LEFT[idx];
  if (side === "right") return TRAIN_RIGHT[idx];
  return TRAIN_BOT[idx];
}

const EX_COLS = 4,
  EX_ROWS = 3;
const EX_PIECE = {
  id: "ex0",
  color: "red",
  name: "Sm tri",
  cells: [
    [0, 0, "\\f"],
    [0, 1, "/"],
    [1, 0, "/"],
  ],
};
const EX_ABS = [
  [1, 1, "\\f"],
  [1, 2, "/"],
  [2, 1, "/"],
];
function buildExBoard() {
  const b = Array.from({ length: EX_ROWS }, () => Array(EX_COLS).fill(null));
  for (const [r, c, t] of EX_ABS) b[r][c] = { color: "red", type: t };
  return b;
}
const EX_BOARD = buildExBoard();

function TrainingAndExample() {
  const [mode, setMode] = useState("training");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setMode("training")}
          style={{
            flex: 1,
            padding: "10px 8px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            cursor: "pointer",
            border: "none",
            background: mode === "training" ? "#1E88E5" : "#f0f0f0",
            color: mode === "training" ? "#fff" : "#666",
          }}
        >
          Training
        </button>
        <button
          onClick={() => setMode("example")}
          style={{
            flex: 1,
            padding: "10px 8px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            cursor: "pointer",
            border: "none",
            background: mode === "example" ? "#1E88E5" : "#f0f0f0",
            color: mode === "example" ? "#fff" : "#666",
          }}
        >
          Small example
        </button>
      </div>
      {mode === "training" ? <TrainingMode /> : <ExampleMode />}
    </div>
  );
}

function TrainingMode() {
  const [log, setLog] = useState([]);
  const [laserPath, setLaserPath] = useState(null);
  const [activeEntry, setActiveEntry] = useState(null);
  const [activeExit, setActiveExit] = useState(null);
  const Z = 36,
    PM = 24;
  const gw = TRAIN_COLS * Z,
    gh = TRAIN_ROWS * Z;
  const gx = (c) => PM + c * Z;
  const gy = (r) => PM + r * Z;

  const fire = (side, idx) => {
    const res = fireLaserLocal(TRAIN_BOARD, side, idx, TRAIN_COLS, TRAIN_ROWS);
    const shuffled = res.colors;
    setLaserPath(res.points);
    const ek = `${side}-${idx}`;
    setActiveEntry(ek);
    setActiveExit(`${res.exitSide}-${res.exitIdx}`);
    setLog((prev) => [
      ...prev,
      {
        entry: trainLabel(side, idx),
        exit: trainLabel(res.exitSide, res.exitIdx),
        colors: shuffled,
      },
    ]);
    setTimeout(() => {
      setLaserPath(null);
      setActiveEntry(null);
      setActiveExit(null);
    }, 3000);
  };

  const buildPolyline = () =>
    laserPath?.map(([x, y]) => `${PM + x * Z},${PM + y * Z}`);

  const pathPoints = buildPolyline();

  return (
    <div>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 10px" }}>
        Click the labels to fire lasers. The laser bounces off piece edges.
        Watch the query log to see which colors were hit.
      </p>
      <div
        style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}
      >
        <svg
          width={gw + PM * 2}
          height={gh + PM * 2}
          viewBox={`0 0 ${gw + PM * 2} ${gh + PM * 2}`}
          style={{ maxWidth: "100%", height: "auto" }}
        >
          <rect x={PM} y={PM} width={gw} height={gh} fill="#fff" />
          {Array.from({ length: TRAIN_COLS + 1 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={gx(i)}
              y1={PM}
              x2={gx(i)}
              y2={PM + gh}
              stroke="#ddd"
              strokeWidth={i === 0 || i === TRAIN_COLS ? 1.5 : 0.5}
            />
          ))}
          {Array.from({ length: TRAIN_ROWS + 1 }, (_, i) => (
            <line
              key={`h${i}`}
              x1={PM}
              y1={gy(i)}
              x2={PM + gw}
              y2={gy(i)}
              stroke="#ddd"
              strokeWidth={i === 0 || i === TRAIN_ROWS ? 1.5 : 0.5}
            />
          ))}

          {TRAIN_PIECES.map((piece, pi) => (
            <g key={pi}>
              {piece.absCells.map(([r, c, t], ci) => (
                <polygon
                  key={ci}
                  points={fillPoints(gx(c), gy(r), Z, t)}
                  fill={PFILL[piece.color]}
                />
              ))}
              {piece.absCells
                .filter(([, , t]) => !isFull(t))
                .map(([r, c, t], ci) => {
                  const dl = diagLine(gx(c), gy(r), Z, t);
                  return (
                    <line
                      key={`d${ci}`}
                      {...dl}
                      stroke={PCOLORS[piece.color]}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                  );
                })}
              {computeOutlineEdges(piece.absCells).map((ek, ei) => {
                const [kind, aStr, bStr] = ek.split("-");
                const a = parseInt(aStr),
                  b = parseInt(bStr);
                const ln =
                  kind === "h"
                    ? { x1: gx(b), y1: gy(a), x2: gx(b) + Z, y2: gy(a) }
                    : { x1: gx(b), y1: gy(a), x2: gx(b), y2: gy(a) + Z };
                return (
                  <line
                    key={`e${ei}`}
                    {...ln}
                    stroke={PCOLORS[piece.color]}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          ))}

          {pathPoints && (
            <polyline
              points={pathPoints.join(" ")}
              fill="none"
              stroke="#1E88E5"
              strokeWidth={2}

              opacity={0.7}
            />
          )}

          {TRAIN_TOP.map((l, i) => {
            const k = `top-${i}`;
            const a = activeEntry === k || activeExit === k;
            return (
              <g key={`t${i}`}>
                <rect
                  x={gx(i)}
                  y={0}
                  width={Z}
                  height={PM - 2}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => fire("top", i)}
                />
                {a && (
                  <circle
                    cx={gx(i) + Z / 2}
                    cy={PM / 2}
                    r={12}
                    fill="rgba(30,136,229,0.15)"
                  />
                )}
                <text
                  x={gx(i) + Z / 2}
                  y={PM / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontWeight={a ? 700 : 500}
                  fill={a ? "#1E88E5" : "#666"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {l}
                </text>
              </g>
            );
          })}
          {TRAIN_BOT.map((l, i) => {
            const k = `bottom-${i}`;
            const a = activeEntry === k || activeExit === k;
            return (
              <g key={`b${i}`}>
                <rect
                  x={gx(i)}
                  y={PM + gh + 2}
                  width={Z}
                  height={PM - 2}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => fire("bottom", i)}
                />
                {a && (
                  <circle
                    cx={gx(i) + Z / 2}
                    cy={PM + gh + PM / 2}
                    r={12}
                    fill="rgba(30,136,229,0.15)"
                  />
                )}
                <text
                  x={gx(i) + Z / 2}
                  y={PM + gh + PM / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontWeight={a ? 700 : 500}
                  fill={a ? "#1E88E5" : "#666"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {l}
                </text>
              </g>
            );
          })}
          {TRAIN_LEFT.map((l, i) => {
            const k = `left-${i}`;
            const a = activeEntry === k || activeExit === k;
            return (
              <g key={`l${i}`}>
                <rect
                  x={0}
                  y={gy(i)}
                  width={PM - 2}
                  height={Z}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => fire("left", i)}
                />
                {a && (
                  <circle
                    cx={PM / 2}
                    cy={gy(i) + Z / 2}
                    r={12}
                    fill="rgba(30,136,229,0.15)"
                  />
                )}
                <text
                  x={PM / 2}
                  y={gy(i) + Z / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontWeight={a ? 700 : 500}
                  fill={a ? "#1E88E5" : "#666"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {l}
                </text>
              </g>
            );
          })}
          {TRAIN_RIGHT.map((l, i) => {
            const k = `right-${i}`;
            const a = activeEntry === k || activeExit === k;
            return (
              <g key={`r${i}`}>
                <rect
                  x={PM + gw + 2}
                  y={gy(i)}
                  width={PM - 2}
                  height={Z}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => fire("right", i)}
                />
                {a && (
                  <circle
                    cx={PM + gw + PM / 2}
                    cy={gy(i) + Z / 2}
                    r={12}
                    fill="rgba(30,136,229,0.15)"
                  />
                )}
                <text
                  x={PM + gw + PM / 2}
                  y={gy(i) + Z / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontWeight={a ? 700 : 500}
                  fill={a ? "#1E88E5" : "#666"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {l}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#999",
          marginBottom: 4,
          fontWeight: 600,
        }}
      >
        QUERY LOG
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1.5px solid #ddd" }}>
            {["#", "In", "Out", "Colors"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "4px 6px",
                  color: "#aaa",
                  fontSize: 11,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {log.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                style={{ padding: "10px 6px", color: "#ccc", fontSize: 12 }}
              >
                Click a label to fire
              </td>
            </tr>
          ) : (
            log.map((h, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "4px 6px", color: "#bbb" }}>{i + 1}</td>
                <td style={{ padding: "4px 6px", fontWeight: 600 }}>
                  {h.entry}
                </td>
                <td style={{ padding: "4px 6px", fontWeight: 600 }}>
                  {h.exit}
                </td>
                <td style={{ padding: "4px 6px" }}>
                  {h.colors.length === 0 ? (
                    <span style={{ color: "#ccc" }}>none</span>
                  ) : (
                    <div style={{ display: "flex", gap: 3 }}>
                      {h.colors.map((col, j) => (
                        <div
                          key={j}
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: PCOLORS[col],
                            border:
                              col === "white" ? "1.5px solid #ccc" : "none",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>
        Click any label as many times as you want. The color list does not
        reveal the order in which pieces were hit.
      </p>
    </div>
  );
}

function ExampleMode() {
  const [guess, setGuess] = useState(() =>
    Array.from({ length: EX_ROWS }, () => Array(EX_COLS).fill(null)),
  );
  const [edgeColors, setEdgeColors] = useState({});
  const [selColor, setSelColor] = useState("red");
  const [solved, setSolved] = useState(false);
  const [log, setLog] = useState([]);
  const [activeEntry, setActiveEntry] = useState(null);
  const [activeExit, setActiveExit] = useState(null);
  const [usedLabels, setUsedLabels] = useState(new Set());
  const Z = 40,
    PM = 24;
  const gw = EX_COLS * Z,
    gh = EX_ROWS * Z;
  const gx = (c) => PM + c * Z;
  const gy = (r) => PM + r * Z;
  const EHIT = 14;
  const EX_TOP = ["1", "2", "3", "4"];
  const EX_LEFT = ["A", "B", "C"];
  const EX_RIGHT = ["5", "6", "7"];
  const EX_BOT = ["D", "E", "F", "G"];
  const exLabel = (side, idx) => {
    if (side === "top") return EX_TOP[idx];
    if (side === "left") return EX_LEFT[idx];
    if (side === "right") return EX_RIGHT[idx];
    return EX_BOT[idx];
  };

  const exOutline = useMemo(() => computeOutlineEdges(EX_ABS), []);
  const isSolved = useMemo(
    () =>
      checkSolution(
        guess,
        edgeColors,
        [{ ...EX_PIECE, absCells: EX_ABS }],
        EX_COLS,
        EX_ROWS,
      ),
    [guess, edgeColors],
  );

  useEffect(() => {
    if (isSolved && !solved) setSolved(true);
  }, [isSolved, solved]);

  const fireLaser = (side, idx) => {
    if (solved) return;
    const key = `${side}-${idx}`;
    if (usedLabels.has(key)) return;
    const res = fireLaserLocal(EX_BOARD, side, idx, EX_COLS, EX_ROWS);
    const shuffled = res.colors;
    setLog((prev) => [
      ...prev,
      {
        entry: exLabel(side, idx),
        exit: exLabel(res.exitSide, res.exitIdx),
        colors: shuffled,
      },
    ]);
    setActiveEntry(key);
    setActiveExit(`${res.exitSide}-${res.exitIdx}`);
    setUsedLabels((prev) => {
      const n = new Set(prev);
      n.add(key);
      n.add(`${res.exitSide}-${res.exitIdx}`);
      return n;
    });
    setTimeout(() => {
      setActiveEntry(null);
      setActiveExit(null);
    }, 3000);
  };

  const clickCell = (r, c) => {
    if (solved) return;
    setGuess((prev) => {
      const next = prev.map((row) => [...row]);
      const cur = next[r][c];
      if (!cur) next[r][c] = { color: selColor, type: "\\" };
      else if (cur.color === selColor && cur.type === "\\")
        next[r][c] = { color: selColor, type: "/" };
      else if (cur.color === selColor && cur.type === "/") next[r][c] = null;
      else next[r][c] = { color: selColor, type: "\\" };
      return next;
    });
  };
  const clickEdge = (key) => {
    if (solved) return;
    setEdgeColors((prev) => {
      const n = { ...prev };
      if (n[key] === selColor) delete n[key];
      else n[key] = selColor;
      return n;
    });
  };

  const hEdges = [];
  for (let line = 0; line <= EX_ROWS; line++) {
    for (let c = 0; c < EX_COLS; c++)
      hEdges.push({ key: `h-${line}-${c}`, x: gx(c), y: gy(line) });
  }
  const vEdges = [];
  for (let r = 0; r < EX_ROWS; r++) {
    for (let line = 0; line <= EX_COLS; line++)
      vEdges.push({ key: `v-${r}-${line}`, x: gx(line), y: gy(r) });
  }

  const renderLabels = (labels, side) =>
    labels.map((l, i) => {
      const k = `${side}-${i}`;
      const a = activeEntry === k || activeExit === k;
      const u = usedLabels.has(k);
      let x, y, w, h;
      if (side === "top") {
        x = gx(i);
        y = 0;
        w = Z;
        h = PM - 2;
      } else if (side === "bottom") {
        x = gx(i);
        y = PM + gh + 2;
        w = Z;
        h = PM - 2;
      } else if (side === "left") {
        x = 0;
        y = gy(i);
        w = PM - 2;
        h = Z;
      } else {
        x = PM + gw + 2;
        y = gy(i);
        w = PM - 2;
        h = Z;
      }
      const cx =
        side === "left"
          ? PM / 2
          : side === "right"
            ? PM + gw + PM / 2
            : gx(i) + Z / 2;
      const cy =
        side === "top"
          ? PM / 2
          : side === "bottom"
            ? PM + gh + PM / 2
            : gy(i) + Z / 2;
      return (
        <g key={`${side}${i}`}>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="transparent"
            style={{ cursor: solved ? "default" : "pointer" }}
            onClick={() => fireLaser(side, i)}
          />
          {a && <circle cx={cx} cy={cy} r={12} fill="rgba(30,136,229,0.15)" />}
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={a ? 700 : 500}
            fill={a ? "#1E88E5" : u ? "#ccc" : "#666"}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {l}
          </text>
        </g>
      );
    });

  return (
    <div>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 10px" }}>
        Find the hidden red triangle. Fire lasers and draw its outline using
        diagonals and edges.
      </p>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          margin: "8px 0",
        }}
      >
        <svg
          width={gw + PM * 2}
          height={gh + PM * 2}
          viewBox={`0 0 ${gw + PM * 2} ${gh + PM * 2}`}
          style={{ maxWidth: "100%", height: "auto" }}
        >
          <rect x={PM} y={PM} width={gw} height={gh} fill="#fff" />
          {Array.from({ length: EX_COLS + 1 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={gx(i)}
              y1={PM}
              x2={gx(i)}
              y2={PM + gh}
              stroke="#ddd"
              strokeWidth={i === 0 || i === EX_COLS ? 1.5 : 0.5}
            />
          ))}
          {Array.from({ length: EX_ROWS + 1 }, (_, i) => (
            <line
              key={`h${i}`}
              x1={PM}
              y1={gy(i)}
              x2={PM + gw}
              y2={gy(i)}
              stroke="#ddd"
              strokeWidth={i === 0 || i === EX_ROWS ? 1.5 : 0.5}
            />
          ))}

          {solved &&
            EX_ABS.map(([r, c, t], i) => (
              <polygon
                key={i}
                points={fillPoints(gx(c), gy(r), Z, t)}
                fill={PFILL.red}
              />
            ))}

          {guess.map((row, r) =>
            row.map((cell, c) => {
              if (!cell) return null;
              const x = gx(c),
                y = gy(r);
              const dl = diagLine(x, y, Z, cell.type);
              return (
                <line
                  key={`g${r}-${c}`}
                  {...dl}
                  stroke={PCOLORS[cell.color]}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              );
            }),
          )}

          {hEdges.map(({ key, x, y }) => {
            const ec = edgeColors[key];
            if (!ec) return null;
            return (
              <line
                key={`ec-${key}`}
                x1={x}
                y1={y}
                x2={x + Z}
                y2={y}
                stroke={PCOLORS[ec]}
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}
          {vEdges.map(({ key, x, y }) => {
            const ec = edgeColors[key];
            if (!ec) return null;
            return (
              <line
                key={`ec-${key}`}
                x1={x}
                y1={y}
                x2={x}
                y2={y + Z}
                stroke={PCOLORS[ec]}
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}

          {solved &&
            exOutline.map((ek, i) => {
              const [kind, aStr, bStr] = ek.split("-");
              const a = parseInt(aStr),
                b = parseInt(bStr);
              const ln =
                kind === "h"
                  ? { x1: gx(b), y1: gy(a), x2: gx(b) + Z, y2: gy(a) }
                  : { x1: gx(b), y1: gy(a), x2: gx(b), y2: gy(a) + Z };
              return (
                <line
                  key={`so${i}`}
                  {...ln}
                  stroke={PCOLORS.red}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              );
            })}

          {renderLabels(EX_TOP, "top")}
          {renderLabels(EX_BOT, "bottom")}
          {renderLabels(EX_LEFT, "left")}
          {renderLabels(EX_RIGHT, "right")}

          {!solved &&
            hEdges.map(({ key, x, y }) => (
              <rect
                key={`ht-${key}`}
                x={x}
                y={y - EHIT / 2}
                width={Z}
                height={EHIT}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  clickEdge(key);
                }}
              />
            ))}
          {!solved &&
            vEdges.map(({ key, x, y }) => (
              <rect
                key={`ht-${key}`}
                x={x - EHIT / 2}
                y={y}
                width={EHIT}
                height={Z}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  clickEdge(key);
                }}
              />
            ))}

          {Array.from({ length: EX_ROWS }, (_, r) =>
            Array.from({ length: EX_COLS }, (_, c) => (
              <rect
                key={`cl${r}-${c}`}
                x={gx(c) + EHIT / 2}
                y={gy(r) + EHIT / 2}
                width={Z - EHIT}
                height={Z - EHIT}
                fill="transparent"
                style={{ cursor: solved ? "default" : "crosshair" }}
                onClick={() => clickCell(r, c)}
              />
            )),
          )}
        </svg>

        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#999",
              marginBottom: 6,
            }}
          >
            FIND THIS
          </div>
          <div
            style={{ opacity: solved ? 0.2 : 1, transition: "opacity 0.5s" }}
          >
            <PiecePreview piece={EX_PIECE} found={false} size={28} />
          </div>
        </div>
      </div>

      {!solved && (
        <div
          style={{
            display: "flex",
            gap: 6,
            justifyContent: "center",
            margin: "8px 0",
          }}
        >
          {Object.entries(PCOLORS).map(([name, hex]) => (
            <button
              key={name}
              aria-label={`${name} pencil`}
              onClick={() => setSelColor(name)}
              style={{
                width: 26,
                height: 26,
                minWidth: 26,
                minHeight: 26,
                borderRadius: "50%",
                background: hex,
                padding: 0,
                flexShrink: 0,
                border:
                  selColor === name
                    ? "2.5px solid #212121"
                    : "2.5px solid transparent",
                cursor: "pointer",
                outline: "none",
              }}
            />
          ))}
        </div>
      )}

      <div
        style={{
          fontSize: 12,
          color: "#999",
          marginBottom: 4,
          fontWeight: 600,
        }}
      >
        QUERY LOG
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1.5px solid #ddd" }}>
            {["#", "In", "Out", "Colors"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "4px 6px",
                  color: "#aaa",
                  fontSize: 11,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {log.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                style={{ padding: "10px 6px", color: "#ccc", fontSize: 12 }}
              >
                Click a label to fire
              </td>
            </tr>
          ) : (
            log.map((h, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "4px 6px", color: "#bbb" }}>{i + 1}</td>
                <td style={{ padding: "4px 6px", fontWeight: 600 }}>
                  {h.entry}
                </td>
                <td style={{ padding: "4px 6px", fontWeight: 600 }}>
                  {h.exit}
                </td>
                <td style={{ padding: "4px 6px" }}>
                  {h.colors.length === 0 ? (
                    <span style={{ color: "#ccc" }}>none</span>
                  ) : (
                    <div style={{ display: "flex", gap: 3 }}>
                      {h.colors.map((col, j) => (
                        <div
                          key={j}
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: PCOLORS[col],
                            border:
                              col === "white" ? "1.5px solid #ccc" : "none",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {solved && (
        <div
          style={{
            textAlign: "center",
            background: "#e8f5e9",
            borderRadius: 10,
            padding: "14px 20px",
            margin: "8px 0",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: "#2e7d32" }}>
            Great, you are ready to play!
          </div>
          <div style={{ fontSize: 12, color: "#66bb6a", marginTop: 4 }}>
            You found the red triangle
          </div>
        </div>
      )}
    </div>
  );
}

export function HowToPlayModal({ onClose, pieces, cols = 10, rows = 8 }) {
  const S = 28;
  const c1 = "#E53935",
    c2 = "#1E88E5",
    c3 = "#FBC02D",
    c4 = "#9E9E9E";
  const dot = (color, sz = 10) => (
    <span
      style={{
        display: "inline-block",
        width: sz,
        height: sz,
        borderRadius: "50%",
        background: color,
        verticalAlign: "middle",
        margin: "0 2px",
        border: color === "#9E9E9E" ? "1.5px solid #ccc" : "none",
      }}
    />
  );
  const sec = {
    fontSize: 16,
    fontWeight: 700,
    margin: "22px 0 10px",
    display: "flex",
    alignItems: "center",
    gap: 8,
  };
  const p = {
    fontSize: 14,
    lineHeight: 1.7,
    color: "#444",
    margin: "0 0 12px",
  };
  const fig = {
    background: "#fafafa",
    borderRadius: 10,
    padding: 12,
    margin: "10px 0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 8,
  };

  function MiniGrid({ w, h, children, label }) {
    const gw = w * S,
      gh = h * S,
      m = 4;
    return (
      <div style={{ textAlign: "center" }}>
        <svg
          width={gw + m * 2}
          height={gh + m * 2}
          viewBox={`0 0 ${gw + m * 2} ${gh + m * 2}`}
        >
          <rect x={m} y={m} width={gw} height={gh} fill="#fff" rx={2} />
          {Array.from({ length: w + 1 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={m + i * S}
              y1={m}
              x2={m + i * S}
              y2={m + gh}
              stroke="#ddd"
              strokeWidth={i === 0 || i === w ? 1.5 : 0.5}
            />
          ))}
          {Array.from({ length: h + 1 }, (_, i) => (
            <line
              key={`h${i}`}
              x1={m}
              y1={m + i * S}
              x2={m + gw}
              y2={m + i * S}
              stroke="#ddd"
              strokeWidth={i === 0 || i === h ? 1.5 : 0.5}
            />
          ))}
          {children(m)}
        </svg>
        {label && (
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            {label}
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog title="How to play" onClose={onClose}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
          <span style={{ color: c1 }}>S</span>
          <span style={{ color: c2 }}>h</span>
          <span style={{ color: c3 }}>a</span>
          <span style={{ color: c4 }}>p</span>
          <span style={{ color: c1 }}>e</span>
          <span style={{ color: c2 }}>I</span>
          <span style={{ color: c3 }}>t</span>
        </div>
        <div style={{ fontSize: 14, color: "#888" }}>
          Find {pieces.length} hidden pieces on the grid
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            justifyContent: "center",
            marginTop: 8,
          }}
        >
          {pieces.map((pc, i) => (
            <React.Fragment key={pc.id || i}>
              {dot(PCOLORS[pc.color], 14)}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={sec}>
        {dot(c1, 12)}
        {dot(c2, 12)}
        {dot(c3, 12)} The {pieces.length} hidden pieces
      </div>
      <p style={p}>
        Each puzzle hides these {pieces.length} colored pieces somewhere on the{" "}
        {cols}×{rows} grid. Your job is to find exactly where each one is.
        Pieces may rotate or mirror. They may touch at a point, but never share
        an edge. Every piece must be reachable by a laser.
      </p>
      <div style={{ ...fig, flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {pieces.map((pc) => (
          <div key={pc.id} style={{ textAlign: "center" }}>
            <PiecePreview piece={pc} found={false} size={20} />
          </div>
        ))}
      </div>

      <div style={sec}>{dot(c2, 12)} Fire lasers to gather clues</div>
      <p style={p}>
        Click any numbered or lettered label around the grid to shoot a laser
        into that row or column. The laser travels in a straight line until it
        hits a piece edge.
      </p>

      <div style={fig}>
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 4,
            fontWeight: 600,
          }}
        >
          Laser enters from "4", bounces off diagonal, exits at "C"
        </div>
        <MiniGrid w={5} h={3}>
          {(m) => {
            const h = S / 2;
            return (
              <>
                <polygon
                  points={`${m + 3 * S},${m + 3 * S} ${m + 5 * S},${m + S} ${m + 5 * S},${m + 3 * S}`}
                  fill="rgba(251,192,45,0.2)"
                />
                <line
                  x1={m + 3 * S}
                  y1={m + 3 * S}
                  x2={m + 5 * S}
                  y2={m + S}
                  stroke={c3}
                  strokeWidth={2.5}
                />
                <line
                  x1={m + 5 * S}
                  y1={m + S}
                  x2={m + 5 * S}
                  y2={m + 3 * S}
                  stroke={c3}
                  strokeWidth={2.5}
                />
                <line
                  x1={m + 5 * S}
                  y1={m + 3 * S}
                  x2={m + 3 * S}
                  y2={m + 3 * S}
                  stroke={c3}
                  strokeWidth={2.5}
                />
                <line
                  x1={m + 3 * S + h}
                  y1={m}
                  x2={m + 3 * S + h}
                  y2={m + 2 * S + h}
                  stroke={c2}
                  strokeWidth={2}

                  opacity={0.7}
                />
                <line
                  x1={m + 3 * S + h}
                  y1={m + 2 * S + h}
                  x2={m}
                  y2={m + 2 * S + h}
                  stroke={c2}
                  strokeWidth={2}

                  opacity={0.7}
                />
                <circle
                  cx={m + 3 * S + h}
                  cy={m + 2 * S + h}
                  r={3}
                  fill={c2}
                  opacity={0.5}
                />
                <circle cx={m + 3 * S + h} cy={m - 1} r={4} fill={c2} />
                <circle cx={m - 1} cy={m + 2 * S + h} r={4} fill={c2} />
                <text
                  x={m + 3 * S + h}
                  y={m - 10}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#666"
                  fontWeight={600}
                >
                  4
                </text>
                <text
                  x={m - 10}
                  y={m + 2 * S + h + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#666"
                  fontWeight={600}
                >
                  C
                </text>
              </>
            );
          }}
        </MiniGrid>
        <div style={{ fontSize: 12, color: "#888" }}>
          The diagonal edge reflects the laser 90 degrees
        </div>
      </div>

      <div style={fig}>
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 4,
            fontWeight: 600,
          }}
        >
          Flat edge bounces laser straight back
        </div>
        <MiniGrid w={5} h={4}>
          {(m) => {
            const h = S / 2;
            return (
              <>
                <polygon
                  points={`${m + S},${m + 3 * S} ${m + 2 * S},${m + 2 * S} ${m + 4 * S},${m + 2 * S} ${m + 3 * S},${m + 3 * S}`}
                  fill="rgba(229,57,53,0.2)"
                />
                <line
                  x1={m + S}
                  y1={m + 3 * S}
                  x2={m + 2 * S}
                  y2={m + 2 * S}
                  stroke={c1}
                  strokeWidth={2.5}
                />
                <line
                  x1={m + 2 * S}
                  y1={m + 2 * S}
                  x2={m + 4 * S}
                  y2={m + 2 * S}
                  stroke={c1}
                  strokeWidth={2.5}
                />
                <line
                  x1={m + 4 * S}
                  y1={m + 2 * S}
                  x2={m + 3 * S}
                  y2={m + 3 * S}
                  stroke={c1}
                  strokeWidth={2.5}
                />
                <line
                  x1={m + 3 * S}
                  y1={m + 3 * S}
                  x2={m + S}
                  y2={m + 3 * S}
                  stroke={c1}
                  strokeWidth={2.5}
                />
                <line
                  x1={m + 2 * S + h - 2}
                  y1={m}
                  x2={m + 2 * S + h - 2}
                  y2={m + 2 * S}
                  stroke={c2}
                  strokeWidth={2}

                  opacity={0.7}
                />
                <line
                  x1={m + 2 * S + h + 2}
                  y1={m + 2 * S}
                  x2={m + 2 * S + h + 2}
                  y2={m}
                  stroke={c2}
                  strokeWidth={2}

                  opacity={0.5}
                />
                <circle cx={m + 2 * S + h} cy={m - 1} r={4} fill={c2} />
                <text
                  x={m + 2 * S + h}
                  y={m - 10}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#666"
                  fontWeight={600}
                >
                  3
                </text>
              </>
            );
          }}
        </MiniGrid>
        <div style={{ fontSize: 12, color: "#888" }}>
          Laser enters "3" and exits "3", bounced off the flat top of the
          parallelogram
        </div>
      </div>

      <div style={sec}>{dot(c3, 12)} Reading the query log</div>
      <p style={p}>
        After each laser, the log shows the entry point, exit point, and which
        piece colors the laser touched (listed without revealing their order).
      </p>

      <div style={fig}>
        <div
          style={{
            background: "white",
            borderRadius: 8,
            padding: "8px 16px",
            border: "1px solid #e8e8e8",
            fontSize: 13,
            display: "flex",
            gap: 20,
            alignItems: "center",
            width: "100%",
            maxWidth: 340,
          }}
        >
          <span style={{ color: "#999", fontSize: 12 }}>1</span>
          <span style={{ fontWeight: 700 }}>P</span>
          <span style={{ fontWeight: 700 }}>3</span>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            {dot(c3, 14)}
            {dot(c1, 14)}
            {dot(c4, 14)}
            {dot(c2, 14)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
          Laser entered at P, exited at 3. Hit {dot(c3)} yellow, {dot(c1)} red,{" "}
          {dot(c4)} white, and {dot(c2)} blue
        </div>
      </div>

      <p style={p}>
        The color list tells you <em>which</em> colors were hit, but not their
        sequence or how often they were hit. Without extra pieces, no colors
        means a clear path. With extras enabled, a transparent diamond can
        reflect the laser without adding a color.
      </p>

      <div style={sec}>{dot(c1, 12)} Drawing your guess</div>
      <p style={p}>Select a color, then build piece outlines on the grid:</p>

      <div style={{ ...fig, flexDirection: "row", gap: 24, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <MiniGrid w={2} h={2} label="Click cell: diagonal">
            {(m) => (
              <>
                <line
                  x1={m + 2}
                  y1={m + 2}
                  x2={m + S - 2}
                  y2={m + S - 2}
                  stroke={c1}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              </>
            )}
          </MiniGrid>
        </div>
        <div style={{ textAlign: "center" }}>
          <MiniGrid w={2} h={2} label="Click again: flip">
            {(m) => (
              <>
                <line
                  x1={m + 2}
                  y1={m + S - 2}
                  x2={m + S - 2}
                  y2={m + 2}
                  stroke={c1}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              </>
            )}
          </MiniGrid>
        </div>
        <div style={{ textAlign: "center" }}>
          <MiniGrid w={2} h={2} label="Click grid line: edge">
            {(m) => (
              <>
                <line
                  x1={m}
                  y1={m + S}
                  x2={m + S}
                  y2={m + S}
                  stroke={c2}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                />
              </>
            )}
          </MiniGrid>
        </div>
      </div>

      <div style={fig}>
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 4,
            fontWeight: 600,
          }}
        >
          Complete outline and the piece fills in
        </div>
        <div
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <MiniGrid w={3} h={1} label="Red parallelogram">
            {(m) => (
              <>
                <polygon
                  points={`${m},${m + S} ${m + S},${m} ${m + 3 * S},${m} ${m + 2 * S},${m + S}`}
                  fill="rgba(229,57,53,0.3)"
                />
                <line
                  x1={m}
                  y1={m + S}
                  x2={m + S}
                  y2={m}
                  stroke={c1}
                  strokeWidth={2}
                />
                <line
                  x1={m + S}
                  y1={m}
                  x2={m + 3 * S}
                  y2={m}
                  stroke={c1}
                  strokeWidth={2}
                />
                <line
                  x1={m + 3 * S}
                  y1={m}
                  x2={m + 2 * S}
                  y2={m + S}
                  stroke={c1}
                  strokeWidth={2}
                />
                <line
                  x1={m + 2 * S}
                  y1={m + S}
                  x2={m}
                  y2={m + S}
                  stroke={c1}
                  strokeWidth={2}
                />
              </>
            )}
          </MiniGrid>
          <MiniGrid w={2} h={2} label="White diamond">
            {(m) => (
              <>
                <polygon
                  points={`${m + S},${m} ${m + 2 * S},${m + S} ${m + S},${m + 2 * S} ${m},${m + S}`}
                  fill="rgba(158,158,158,0.2)"
                />
                <line
                  x1={m + S}
                  y1={m}
                  x2={m + 2 * S}
                  y2={m + S}
                  stroke={c4}
                  strokeWidth={2}
                />
                <line
                  x1={m + 2 * S}
                  y1={m + S}
                  x2={m + S}
                  y2={m + 2 * S}
                  stroke={c4}
                  strokeWidth={2}
                />
                <line
                  x1={m + S}
                  y1={m + 2 * S}
                  x2={m}
                  y2={m + S}
                  stroke={c4}
                  strokeWidth={2}
                />
                <line
                  x1={m}
                  y1={m + S}
                  x2={m + S}
                  y2={m}
                  stroke={c4}
                  strokeWidth={2}
                />
              </>
            )}
          </MiniGrid>
        </div>
      </div>

      <div style={sec}>{dot(c4, 12)} Submit when ready</div>
      <p style={p}>
        Once you've placed all {pieces.length} pieces, hit{" "}
        <span
          style={{
            background: "#1E88E5",
            color: "white",
            padding: "2px 10px",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Submit solution
        </span>
        . Every piece must be in the <em>exact</em> correct position to win.
      </p>

      <div
        style={{
          display: "flex",
          gap: 16,
          justifyContent: "center",
          margin: "14px 0 8px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 12,
            padding: "18px 24px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            minWidth: 180,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            <span style={{ color: c1 }}>S</span>
            <span style={{ color: c2 }}>o</span>
            <span style={{ color: c3 }}>l</span>
            <span style={{ color: c4 }}>v</span>
            <span style={{ color: c1 }}>e</span>
            <span style={{ color: c2 }}>d</span>
            <span style={{ color: c3 }}>!</span>
          </div>
          <div style={{ fontSize: 12, color: "#333", fontWeight: 600 }}>
            Solved in 2:34
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
            with 12 queries
          </div>
          <div
            style={{
              marginTop: 8,
              background: "#1E88E5",
              color: "white",
              padding: "4px 14px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              display: "inline-block",
            }}
          >
            Share result
          </div>
        </div>
        <div
          style={{
            background: "white",
            borderRadius: 12,
            padding: "18px 24px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            minWidth: 180,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: c1,
              marginBottom: 6,
            }}
          >
            Incorrect
          </div>
          <div style={{ fontSize: 11, color: "#666" }}>12 queries used</div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            The correct solution
            <br />
            is shown on the board
          </div>
        </div>
      </div>
      <p style={{ ...p, textAlign: "center", fontSize: 13, color: "#999" }}>
        If wrong, the correct answer is shown. One shot, make it count.
      </p>

      {/* ── TRY IT ── */}
      <div style={sec}>{dot(c1, 12)} Try it</div>
      <TrainingAndExample />

      {/* ── TIPS ── */}
      <div style={sec}>{dot(c2, 12)} Tips</div>
      <div
        style={{
          background: "#f8f8f8",
          borderRadius: 10,
          padding: "14px 16px",
          margin: "0 0 16px",
          fontSize: 13,
          lineHeight: 1.8,
          color: "#555",
        }}
      >
        <span style={{ fontWeight: 600 }}>Start with edges.</span> Fire lasers
        along the borders to figure out which rows and columns contain pieces.
        <br />
        <br />
        <span style={{ fontWeight: 600 }}>Count the colors.</span> If a laser
        hits 3+ colors, it has reflected off pieces of at least three different
        colors. They need not be in the same row or column.
        <br />
        <br />
        <span style={{ fontWeight: 600 }}>Use the dimmed labels.</span>{" "}
        Already-queried labels are grayed out. Click them again to re-highlight
        the results.
        <br />
        <br />
        <span style={{ fontWeight: 600 }}>Shapes fill automatically.</span> When
        you complete an outline, it fills with color. Helpful to track your
        progress.
      </div>

      <div
        style={{
          textAlign: "center",
          fontSize: 13,
          color: "#aaa",
          marginTop: 12,
        }}
      >
        Good luck! {dot(c1)}
        {dot(c2)}
        {dot(c3)}
      </div>
      <details className="advanced-guide">
        <summary>Advanced · scoring, special pieces & duels</summary>
        <h3>Daily & timed training</h3>
        <p>
          The clock starts with your first laser or pencil mark. It keeps
          running when you leave or reload. You get one submission per round.
          Closing the result never restarts a finished round.
        </p>
        <p>
          Your score is the time factor × the laser factor, rounded to the
          nearest whole point. The time factor is 200 ÷ (minutes + 2). Up to 5
          lasers gives a laser factor of 100; lasers 6–10 subtract 4 each (96
          down to 80). Above 10, the factor is 80 × exp(−0.3 × (lasers − 10)).
        </p>
        <p>
          Example: 2 minutes and 5 lasers = 5,000 points. 2 minutes and 10
          lasers = 4,000. Reopening an existing laser clue costs nothing.
          Training hints reveal an area, a starting cell, then an outline;
          results using hints are marked assisted. Relaxed training has no
          score. Daily puzzles reset at 00:00 UTC and are shared by players
          using the same board size.
        </p>
        <h3>Transparent diamond</h3>
        <p>
          The cyan dashed outline is your pencil color. The piece reflects
          normally but adds no color to the laser. A colorless result does not
          necessarily mean an empty path.
        </p>
        <h3>Black body</h3>
        <p>
          The black piece absorbs the laser: no exit and no colors are reported.
          In ShapeIt it is a one-cell square, so only its position matters. Draw
          its four outside edges.
        </p>
        <h3>1 vs 1</h3>
        <p>
          Join with a link or a four-digit code. Two computers use 10×8; if
          either player uses a phone, both use 7×5. You have 60 seconds to
          arrange a legal board; both players can finish early. An initial legal
          arrangement is supplied and your latest accepted arrangement is used
          when time runs out.
        </p>
        <p>
          Take turns firing one laser. Both players see each query and its
          feedback, but never the hidden laser path. After a submission the
          opponent has 60 seconds for one final solution, without another laser.
          Both correct: draw. One correct: that player wins. Both wrong: both
          lose. Afterwards you can inspect both drawings, solutions and laser
          paths.
        </p>
        <p>
          ShapeIt shows individual colors rather than Orapa's mixed color, and
          does not currently use direct cell scans.
        </p>
      </details>
    </Dialog>
  );
}
