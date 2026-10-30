import React from "react";
import { PCOLORS, PFILL } from "../constants/gameConstants";
import {
  computeOutlineEdges,
  fillPoints,
  isFull,
  diagLine,
} from "../utils/gameUtils";

export function PiecePreview({ piece, found, size = 22 }) {
  const cells = piece.cells;
  const maxR = Math.max(...cells.map((c) => c[0])) + 1;
  const maxC = Math.max(...cells.map((c) => c[1])) + 1;
  const outEdges = computeOutlineEdges(cells);
  const p = 2;
  const w = maxC * size + p * 2,
    h = maxR * size + p * 2;
  return (
    <svg
      role="img"
      aria-label={`${piece.color} ${piece.name}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ opacity: found ? 0.15 : 1, flexShrink: 0 }}
    >
      <rect
        x={p}
        y={p}
        width={maxC * size}
        height={maxR * size}
        fill="#f8f8f8"
        rx={2}
      />
      {Array.from({ length: maxC + 1 }, (_, i) => (
        <line
          key={`gv${i}`}
          x1={p + i * size}
          y1={p}
          x2={p + i * size}
          y2={p + maxR * size}
          stroke="#ddd"
          strokeWidth={i === 0 || i === maxC ? 1 : 0.5}
        />
      ))}
      {Array.from({ length: maxR + 1 }, (_, i) => (
        <line
          key={`gh${i}`}
          x1={p}
          y1={p + i * size}
          x2={p + maxC * size}
          y2={p + i * size}
          stroke="#ddd"
          strokeWidth={i === 0 || i === maxR ? 1 : 0.5}
        />
      ))}
      {cells.map(([r, c, t], i) => (
        <polygon
          key={i}
          points={fillPoints(p + c * size, p + r * size, size, t)}
          fill={PFILL[piece.color]}
        />
      ))}
      {cells
        .filter(([, , t]) => !isFull(t))
        .map(([r, c, t], i) => {
          const dl = diagLine(p + c * size, p + r * size, size, t);
          return (
            <line
              key={`d${i}`}
              {...dl}
              stroke={PCOLORS[piece.color]}
              strokeDasharray={
                piece.color === "transparent" ? "4 2" : undefined
              }
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}
      {outEdges.map((ek, i) => {
        const [kind, aStr, bStr] = ek.split("-");
        const a = parseInt(aStr),
          b = parseInt(bStr);
        const ln =
          kind === "h"
            ? {
                x1: p + b * size,
                y1: p + a * size,
                x2: p + b * size + size,
                y2: p + a * size,
              }
            : {
                x1: p + b * size,
                y1: p + a * size,
                x2: p + b * size,
                y2: p + a * size + size,
              };
        return (
          <line
            key={`e${i}`}
            {...ln}
            stroke={PCOLORS[piece.color]}
            strokeDasharray={piece.color === "transparent" ? "4 2" : undefined}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
