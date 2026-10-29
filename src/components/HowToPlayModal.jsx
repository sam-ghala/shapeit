import { GameBoard } from "./GameBoard.jsx";
import { QueryLog, ColorPicker } from "./GameControls.jsx";
import { playSound } from "../game/audio.js";
import { emptyBoard } from "../game/engine.js";
import React, { useState, useMemo } from "react";
import { PCOLORS } from "../constants/gameConstants";
import { fillPoints } from "../utils/gameUtils";
import { fireLaser as traceLaser, checkSolution } from "../game/engine.js";
import { Dialog } from "./Dialog.jsx";
import { PiecePreview } from "./PiecePreview";

/* ─── Interactive Training & Example ─── */

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
    <div className="guide-practice">
      <div className="guide-tabs" role="group" aria-label="Practice example">
        <button
          aria-pressed={mode === "training"}
          onClick={() => setMode("training")}
        >
          Try lasers
        </button>
        <button
          aria-pressed={mode === "example"}
          onClick={() => setMode("example")}
        >
          Try drawing
        </button>
      </div>
      {mode === "training" ? <TrainingMode /> : <ExampleMode />}
    </div>
  );
}

function TrainingMode() {
  const [log, setLog] = useState([]);
  const [active, setActive] = useState(null);
  const [selected, setSelected] = useState(null);
  const [version, setVersion] = useState(0);
  const fire = (side, idx) => {
    playSound("laser");
    const shot = { ...traceLaser(TRAIN_BOARD, side, idx), side, idx };
    const existing = log.findIndex(
      (h) =>
        (h.side === side && h.idx === idx) ||
        (h.exitSide === side && h.exitIdx === idx),
    );
    setSelected(existing < 0 ? log.length : existing);
    if (existing < 0) setLog([...log, shot]);
    setActive(shot);
    setVersion((v) => v + 1);
  };
  return (
    <div>
      <p className="guide-instruction">Tap a label to follow its laser.</p>
      <GameBoard
        cols={TRAIN_COLS}
        rows={TRAIN_ROWS}
        guess={emptyBoard(TRAIN_COLS, TRAIN_ROWS)}
        revealed={TRAIN_PIECES.map((p, i) => ({ ...p, id: i }))}
        locked
        onLaser={fire}
        activeLaser={active}
        highlight={active}
        queries={log}
        animate
        replayVersion={version}
      />
      <QueryLog
        history={log}
        cols={TRAIN_COLS}
        rows={TRAIN_ROWS}
        selected={selected}
        selectionVersion={version}
        onSelect={(i) => fire(log[i].side, log[i].idx)}
      />
    </div>
  );
}

function ExampleMode() {
  const [guess, setGuess] = useState(() => emptyBoard(EX_COLS, EX_ROWS));
  const [edges, setEdges] = useState({});
  const [color, setColor] = useState("red");
  const [log, setLog] = useState([]);
  const [active, setActive] = useState(null);
  const [selected, setSelected] = useState(null);
  const [version, setVersion] = useState(0);
  const solved = useMemo(
    () =>
      checkSolution(
        guess,
        edges,
        [{ ...EX_PIECE, absCells: EX_ABS }],
        EX_COLS,
        EX_ROWS,
      ),
    [guess, edges],
  );
  const fire = (side, idx) => {
    playSound("laser");
    const shot = { ...traceLaser(EX_BOARD, side, idx), side, idx };
    const existing = log.findIndex(
      (h) =>
        (h.side === side && h.idx === idx) ||
        (h.exitSide === side && h.exitIdx === idx),
    );
    setSelected(existing < 0 ? log.length : existing);
    if (existing < 0 && !solved) setLog([...log, shot]);
    setActive(shot);
    setVersion((v) => v + 1);
  };
  return (
    <div>
      <p className="guide-instruction">
        {solved
          ? "Solved! Try the lasers again."
          : "Find and draw the red triangle."}
      </p>
      <GameBoard
        cols={EX_COLS}
        rows={EX_ROWS}
        guess={guess}
        edges={edges}
        pieces={[EX_PIECE]}
        revealed={solved ? [{ ...EX_PIECE, absCells: EX_ABS }] : null}
        locked={solved}
        selectedColor={color}
        onLaser={fire}
        queries={log}
        highlight={active}
        activeLaser={solved ? active : null}
        animate
        replayVersion={version}
        onCell={(r, c) => {
          playSound("draw");
          setGuess((old) => {
            const next = old.map((row) => [...row]);
            const cell = next[r][c];
            next[r][c] =
              color === "x"
                ? cell?.color === "x"
                  ? null
                  : { color: "x", type: "x" }
                : cell?.color !== color
                  ? { color, type: "\\" }
                  : cell.type === "\\"
                    ? { color, type: "/" }
                    : null;
            return next;
          });
        }}
        onEdge={(key) => {
          if (color === "x") return;
          playSound("draw");
          setEdges((old) => {
            const next = { ...old };
            if (next[key] === color) delete next[key];
            else next[key] = color;
            return next;
          });
        }}
      />
      {!solved && (
        <ColorPicker pieces={[EX_PIECE]} value={color} onChange={setColor} />
      )}
      <QueryLog
        history={log}
        cols={EX_COLS}
        rows={EX_ROWS}
        selected={selected}
        selectionVersion={version}
        onSelect={(i) => fire(log[i].side, log[i].idx)}
      />
    </div>
  );
}

export function HowToPlayModal({ onClose, pieces }) {
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
  const p = {
    fontSize: 15,
    lineHeight: 1.6,
    color: "var(--ink)",
    margin: "0 0 12px",
  };
  const fig = {
    background: "#eaf6fc",
    border: "2px solid #263646",
    borderRadius: 14,
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
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {label}
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog title="How to play" onClose={onClose} className="howto-dialog">
      <h3 className="guide-section">
        {dot(c1, 12)}
        {dot(c2, 12)}
        {dot(c3, 12)} Hidden pieces
      </h3>
      <p style={p}>
        Find these pieces on the hidden board. Pieces may rotate or mirror. They
        may touch at a point, but never share an edge. Every piece must be
        reachable by a laser.
      </p>
      <div style={{ ...fig, flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {pieces.map((pc) => (
          <div key={pc.id} style={{ textAlign: "center" }}>
            <PiecePreview piece={pc} found={false} size={20} />
          </div>
        ))}
      </div>

      <h3 className="guide-section">{dot(c2, 12)} Fire lasers</h3>
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
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
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
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Laser enters "3" and exits "3", bounced off the flat top of the
          parallelogram
        </div>
      </div>

      <h3 className="guide-section">{dot(c3, 12)} Laser log</h3>
      <p style={p}>
        After each laser, the log shows the entry point, exit point, and which
        piece colors the laser touched (listed without revealing their order).
      </p>

      <div style={fig}>
        <QueryLog
          cols={10}
          rows={8}
          history={[
            {
              side: "bottom",
              idx: 7,
              exitSide: "top",
              exitIdx: 2,
              colors: ["yellow", "red", "white", "blue"],
            },
          ]}
        />
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
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

      <h3 className="guide-section">{dot(c1, 12)} Draw your guess</h3>
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

      <h3 className="guide-section">{dot(c4, 12)} Submit when ready</h3>
      <p style={p}>
        Submit your drawing to see your result and score. Then compare it with
        the solution, replay any laser, share your result or start a new board.
      </p>

      {/* ── TRY IT ── */}
      <h3 className="guide-section">{dot(c1, 12)} Try it</h3>
      <TrainingAndExample />

      {/* ── TIPS ── */}
      <h3 className="guide-section">{dot(c2, 12)} Tips</h3>
      <div
        style={{
          background: "#fff2cf",
          border: "2px solid #263646",
          borderRadius: 14,
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
    </Dialog>
  );
}
