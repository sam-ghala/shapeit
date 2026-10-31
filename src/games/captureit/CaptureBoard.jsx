import { useRef } from "react";
import { TILES, CELLS, BOARD_BOUNDS } from "./engine.js";

const points = (vertices) => vertices.map((point) => point.join(",")).join(" ");
const inset = (cell, scale) =>
  points(
    cell.points.map(([x, y]) => [
      cell.x + (x - cell.x) * scale,
      cell.y + (y - cell.y) * scale,
    ]),
  );
const cap = (color) => (color === "white" ? "White" : "Black");

export function CaptureBoard({
  game,
  selected = null,
  targets = [],
  exchanging = false,
  onCell,
  preview = false,
  zoomed = false,
  disabled = false,
}) {
  const nodes = useRef(new Map());
  const tiles = new Set(game.tiles);
  const pieces = new Map(game.pieces.map((piece) => [piece.cell, piece]));
  const available = new Set(targets);
  const enabled = (cell) =>
    !preview &&
    !disabled &&
    !game.winner &&
    (exchanging
      ? pieces.has(cell.id) && pieces.get(cell.id).color !== game.current
      : pieces.get(cell.id)?.color === game.current || available.has(cell.id));
  const cells = CELLS.filter((cell) => tiles.has(cell.tile));
  const focusNext = (event, cell) => {
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const next = cells
      .filter((other) => enabled(other) && other.id !== cell.id)
      .map((other) => {
        const dx = other.x - cell.x,
          dy = other.y - cell.y;
        const along = dx * direction[0] + dy * direction[1];
        const across = Math.abs(dx * direction[1] - dy * direction[0]);
        return { other, along, score: Math.hypot(dx, dy) + across * 2 };
      })
      .filter((candidate) => candidate.along > 0.01)
      .sort((a, b) => a.score - b.score)[0];
    if (next) nodes.current.get(next.other.id)?.focus();
  };
  const { x, y, width, height } = BOARD_BOUNDS;
  return (
    <div className={`capture-board-scroll ${zoomed ? "capture-zoomed" : ""}`}>
      <svg
        className="capture-board"
        viewBox={`${x - 0.15} ${y - 0.15} ${width + 0.3} ${height + 0.3}`}
        role={preview ? "img" : "group"}
        aria-label={
          preview
            ? "CaptureIt starting board"
            : "CaptureIt board. Select a piece, then a highlighted field. Use Tab or arrow keys and Enter."
        }
      >
        {cells.map((cell) => {
          const piece = pieces.get(cell.id);
          const active = enabled(cell);
          const label = `${cap(cell.color)} field ${cell.id}${piece ? `, ${cap(piece.color)} piece` : ", empty"}${selected === cell.id ? ", selected" : available.has(cell.id) ? ", move here" : exchanging && active ? ", exchange to capture" : active ? ", select piece" : ""}`;
          return (
            <g
              key={cell.id}
              ref={(node) =>
                node
                  ? nodes.current.set(cell.id, node)
                  : nodes.current.delete(cell.id)
              }
              className={`capture-cell capture-field-${cell.color} ${active ? "capture-interactive" : ""} ${selected === cell.id ? "capture-selected" : ""} ${available.has(cell.id) ? "capture-target" : ""} ${exchanging && active ? "capture-exchange-target" : ""}`}
              role={active ? "button" : undefined}
              tabIndex={active ? 0 : undefined}
              aria-label={preview ? undefined : label}
              aria-pressed={
                active && !exchanging && piece
                  ? selected === cell.id
                  : undefined
              }
              data-cell-id={cell.id}
              onClick={active ? () => onCell(cell.id) : undefined}
              onKeyDown={
                active
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onCell(cell.id);
                      } else focusNext(event, cell);
                    }
                  : undefined
              }
            >
              <polygon className="capture-field" points={points(cell.points)} />
              {available.has(cell.id) && (
                <circle
                  className="capture-move-dot"
                  cx={cell.x}
                  cy={cell.y}
                  r=".105"
                />
              )}
              {piece && (
                <g
                  className={`capture-piece capture-piece-${piece.color}`}
                  aria-hidden="true"
                >
                  <polygon
                    className="capture-piece-shadow"
                    points={inset(cell, 0.65)}
                    transform="translate(0 .035)"
                  />
                  <polygon
                    className="capture-piece-body"
                    points={inset(cell, 0.65)}
                  />
                  <polygon
                    className="capture-piece-inlay"
                    points={inset(cell, 0.36)}
                  />
                </g>
              )}
              <polygon
                className="capture-cell-focus"
                points={inset(cell, 0.88)}
              />
            </g>
          );
        })}
        <g className="capture-tile-outlines" aria-hidden="true">
          {TILES.filter((tile) => tiles.has(tile.id)).map((tile) => (
            <polygon key={tile.id} points={points(tile.points)} />
          ))}
        </g>
      </svg>
    </div>
  );
}
