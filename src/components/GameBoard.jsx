import { useMemo, useState } from "react";
import { PCOLORS, PFILL } from "../constants/gameConstants.js";
import {
  computeOutlineEdges,
  diagOf,
  isFull,
  getLabel,
  findMatch,
} from "../game/engine.js";
import { fillPoints, diagLine } from "../utils/gameUtils.js";

const Z = 48,
  M = 32;
export function GameBoard({
  cols,
  rows,
  guess,
  edges = {},
  pieces = [],
  revealed = null,
  onCell,
  onEdge,
  onLaser,
  locked = false,
  laserLocked = false,
  newLaserLocked = false,
  selectedColor = "red",
  activeLaser = null,
  animate = false,
  label = "Puzzle board",
  selectedPiece = null,
  queries = [],
  highlight = null,
  hintPiece = null,
  compare = false,
  hideNotes = false,
}) {
  const [focus, setFocus] = useState([0, 0]);
  const [hover, setHover] = useState(null);
  const hoverCell = hover ? guess[hover[0]]?.[hover[1]] : null;
  const previewType =
    selectedColor === "x"
      ? null
      : hoverCell?.color !== selectedColor
        ? "\\"
        : hoverCell.type === "\\"
          ? "/"
          : null;
  const filled = useMemo(
    () =>
      revealed ??
      pieces
        .map((p) => ({ ...p, absCells: findMatch(guess, edges, p) }))
        .filter((p) => p.absCells),
    [revealed, pieces, guess, edges],
  );
  const line = (key) => {
    const [kind, a, b] = key.split("-");
    return kind === "h"
      ? { x1: M + b * Z, y1: M + a * Z, x2: M + b * Z + Z, y2: M + a * Z }
      : { x1: M + b * Z, y1: M + a * Z, x2: M + b * Z, y2: M + a * Z + Z };
  };
  const keyboard = (event, action) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };
  const edgeTargets = [];
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c < cols; c++) edgeTargets.push(`h-${r}-${c}`);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c <= cols; c++) edgeTargets.push(`v-${r}-${c}`);
  return (
    <svg
      className="game-board"
      role="group"
      aria-label={label}
      viewBox={`0 0 ${cols * Z + 2 * M} ${rows * Z + 2 * M}`}
    >
      <rect x={M} y={M} width={cols * Z} height={rows * Z} fill="white" />
      {edgeTargets.map((k) => (
        <line key={k} {...line(k)} stroke="#d7dce1" strokeWidth="1" />
      ))}
      {filled.map((p) => (
        <g
          key={p.id}
          opacity={selectedPiece && selectedPiece !== p.id ? 0.65 : 1}
        >
          {p.absCells.map(([r, c, t], i) => (
            <polygon
              key={i}
              points={fillPoints(M + c * Z, M + r * Z, Z, t)}
              fill={PFILL[p.color]}
            />
          ))}
          {p.absCells
            .filter(([, , t]) => !isFull(t))
            .map(([r, c, t], i) => (
              <line
                key={`d${i}`}
                {...diagLine(M + c * Z, M + r * Z, Z, t)}
                stroke={PCOLORS[p.color]}
                strokeDasharray={p.color === "transparent" ? "5 3" : undefined}
                strokeWidth={selectedPiece === p.id ? 4 : 2.5}
              />
            ))}
          {computeOutlineEdges(p.absCells).map((k) => (
            <line
              key={k}
              {...line(k)}
              stroke={PCOLORS[p.color]}
              strokeWidth={selectedPiece === p.id ? 4 : 2.5}
              strokeDasharray={p.color === "transparent" ? "5 3" : undefined}
            />
          ))}
        </g>
      ))}
      {hintPiece && (
        <g opacity="0.5" pointerEvents="none" aria-label="Hint outline">
          {hintPiece.absCells
            .filter(([, , t]) => !isFull(t))
            .map(([r, c, t], i) => (
              <line
                key={i}
                {...diagLine(M + c * Z, M + r * Z, Z, t)}
                stroke={PCOLORS[hintPiece.color]}
                strokeWidth="5"
                strokeDasharray="4 3"
              />
            ))}
          {computeOutlineEdges(hintPiece.absCells).map((k) => (
            <line
              key={k}
              {...line(k)}
              stroke={PCOLORS[hintPiece.color]}
              strokeWidth="5"
              strokeDasharray="4 3"
            />
          ))}
        </g>
      )}
      {(!revealed || compare) &&
        guess.map((row, r) =>
          row.map(
            (cell, c) =>
              cell &&
              (cell.color === "x" ? (
                hideNotes ? null : (
                  <text
                    key={`${r},${c}`}
                    x={M + c * Z + Z / 2}
                    y={M + r * Z + Z / 2 + 5}
                    textAnchor="middle"
                    fill="#8c959e"
                    fontSize="17"
                  >
                    ×
                  </text>
                )
              ) : (
                <line
                  key={`${r},${c}`}
                  {...diagLine(M + c * Z, M + r * Z, Z, diagOf(cell.type))}
                  stroke={PCOLORS[cell.color]}
                  strokeDasharray={
                    cell.color === "transparent" ? "5 3" : undefined
                  }
                  strokeWidth={compare ? 5 : 3}
                  opacity={compare ? 0.4 : 1}
                  strokeLinecap="round"
                />
              )),
          ),
        )}
      {(!revealed || compare) &&
        Object.entries(edges).map(([k, color]) => (
          <line
            key={k}
            {...line(k)}
            stroke={PCOLORS[color]}
            strokeDasharray={color === "transparent" ? "5 3" : undefined}
            strokeWidth={compare ? 5 : 3}
            opacity={compare ? 0.4 : 1}
            strokeLinecap="round"
          />
        ))}
      {compare &&
        revealed &&
        pieces
          .map((p) => ({ ...p, absCells: findMatch(guess, edges, p) }))
          .filter((p) => p.absCells)
          .map((p) => (
            <g key={`overlay-${p.id}`} opacity="0.3" pointerEvents="none">
              {p.absCells.map(([r, c, t], i) => (
                <polygon
                  key={i}
                  points={fillPoints(M + c * Z, M + r * Z, Z, t)}
                  fill={PFILL[p.color]}
                />
              ))}
            </g>
          ))}
      {!locked && hover && (
        <g pointerEvents="none" aria-hidden="true">
          <rect
            x={M + hover[1] * Z + 1}
            y={M + hover[0] * Z + 1}
            width={Z - 2}
            height={Z - 2}
            fill="#596b801c"
          />
          {onEdge && previewType && (
            <line
              {...diagLine(M + hover[1] * Z, M + hover[0] * Z, Z, previewType)}
              stroke={PCOLORS[selectedColor]}
              strokeWidth="3"
              opacity="0.5"
            />
          )}
        </g>
      )}
      {activeLaser?.points && (
        <polyline
          key={JSON.stringify(activeLaser.points)}
          className={animate ? "laser-path animate-laser" : "laser-path"}
          points={activeLaser.points
            .map(([x, y]) => `${M + x * Z},${M + y * Z}`)
            .join(" ")}
          pathLength="1"
          fill="none"
          stroke="#7c3aed"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {!locked &&
        onEdge &&
        edgeTargets.map((k) => (
          <line
            key={`target-${k}`}
            {...line(k)}
            className="edge-target"
            stroke="transparent"
            strokeWidth="12"
            role="button"
            tabIndex={0}
            aria-label={`Draw ${selectedColor} ${k[0] === "h" ? "horizontal" : "vertical"} edge ${k.slice(2)}`}
            onClick={() => onEdge(k)}
            onKeyDown={(e) => keyboard(e, () => onEdge(k))}
          />
        ))}
      {onCell &&
        !locked &&
        Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => (
            <rect
              key={`cell-${r}-${c}`}
              x={M + c * Z + 7}
              y={M + r * Z + 7}
              width={Z - 14}
              height={Z - 14}
              fill="transparent"
              className="cell-target"
              role="button"
              tabIndex={focus[0] === r && focus[1] === c ? 0 : -1}
              aria-label={`Cell ${String.fromCharCode(65 + r)}${c + 1}, ${guess[r]?.[c]?.color || "empty"}`}
              data-cell={`${r}-${c}`}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setHover([r, c]);
              }}
              onPointerLeave={() => setHover(null)}
              onFocus={() => {
                setFocus([r, c]);
                setHover([r, c]);
              }}
              onBlur={() => setHover(null)}
              onClick={() => onCell(r, c)}
              onKeyDown={(e) => {
                const dirs = {
                  ArrowUp: [-1, 0],
                  ArrowDown: [1, 0],
                  ArrowLeft: [0, -1],
                  ArrowRight: [0, 1],
                };
                if (dirs[e.key]) {
                  e.preventDefault();
                  const [dr, dc] = dirs[e.key],
                    nr = (r + dr + rows) % rows,
                    nc = (c + dc + cols) % cols;
                  setFocus([nr, nc]);
                  e.currentTarget.ownerSVGElement
                    .querySelector(`[data-cell="${nr}-${nc}"]`)
                    ?.focus();
                } else keyboard(e, () => onCell(r, c));
              }}
            />
          )),
        )}
      {["top", "bottom", "left", "right"].flatMap((side) =>
        Array.from(
          { length: ["top", "bottom"].includes(side) ? cols : rows },
          (_, i) => {
            const horizontal = ["top", "bottom"].includes(side);
            const x = horizontal
              ? M + i * Z + Z / 2
              : side === "left"
                ? M / 2
                : M + cols * Z + M / 2;
            const y = horizontal
              ? side === "top"
                ? M / 2
                : M + rows * Z + M / 2
              : M + i * Z + Z / 2;
            const used = queries.some(
              (q) =>
                (q.side === side && q.idx === i) ||
                (q.exitSide === side && q.exitIdx === i),
            );
            const lit =
              highlight &&
              ((highlight.side === side && highlight.idx === i) ||
                (highlight.exitSide === side && highlight.exitIdx === i));
            const clickable =
              onLaser && !laserLocked && (!newLaserLocked || used);
            return (
              <g
                key={`${side}-${i}`}
                role={onLaser ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-disabled={onLaser ? !clickable : undefined}
                aria-label={`Fire laser ${getLabel(side, i, cols, rows)}`}
                className={clickable ? "laser-label" : ""}
                onClick={() => clickable && onLaser(side, i)}
                onKeyDown={(e) =>
                  clickable && keyboard(e, () => onLaser(side, i))
                }
              >
                <rect
                  x={x - (horizontal ? Z / 2 : 15)}
                  y={y - (horizontal ? 15 : Z / 2)}
                  width={horizontal ? Z : 30}
                  height={horizontal ? 30 : Z}
                  rx="5"
                  fill={lit ? "#dceafa" : "transparent"}
                />
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fontSize="13"
                  fill={
                    lit
                      ? "#1e70ce"
                      : used
                        ? "#b5bdc6"
                        : clickable
                          ? "#445466"
                          : "#7b8794"
                  }
                  pointerEvents="none"
                >
                  {getLabel(side, i, cols, rows)}
                </text>
              </g>
            );
          },
        ),
      )}
    </svg>
  );
}
