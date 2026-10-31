import { cellName, colorName, legalMoves } from "./engine.js";

function Wall({ wall, className = "" }) {
  const horizontal = wall.orientation === "h";
  return (
    <rect
      className={`block-wall ${className}`}
      x={wall.col * 10 + (horizontal ? -0.4 : 8.2)}
      y={wall.row * 10 + (horizontal ? 8.2 : -0.4)}
      width={horizontal ? 18.8 : 1.6}
      height={horizontal ? 1.6 : 18.8}
      rx="0.7"
    />
  );
}
export function BlockBoard({
  game,
  wallMode,
  preview,
  invalid,
  interactive,
  onMove,
  onPreview,
}) {
  const moves = interactive && !wallMode ? legalMoves(game) : [];
  const activate = (event, action, id, size) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
    const offsets = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -size,
      ArrowDown: size,
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const next = id + offset;
    if (
      next < 0 ||
      next >= size * size ||
      (Math.abs(offset) === 1 &&
        Math.floor(next / size) !== Math.floor(id / size))
    )
      return;
    event.currentTarget.ownerSVGElement
      .querySelector(`[data-slot="${next}"]`)
      ?.focus();
  };
  const last = game.lastAction;
  return (
    <div className="block-board-wrap">
      <svg
        className="block-board"
        viewBox="-2 -5 92 98"
        role="group"
        aria-label="BlockIt board. White races to the top; Black races to the bottom."
      >
        <title>BlockIt board</title>
        <rect
          className="block-goal block-goal-white"
          x="0"
          y="-4"
          width="88"
          height="2"
          rx="1"
        />
        <rect
          className="block-goal block-goal-black"
          x="0"
          y="90"
          width="88"
          height="2"
          rx="1"
        />
        {Array.from({ length: 81 }, (_, id) => {
          const pawn = ["white", "black"].find(
            (color) => game.pawns[color] === id,
          );
          const highlighted =
            last?.type === "move" && (last.from === id || last.to === id);
          const enabled = moves.includes(id);
          return (
            <g
              key={id}
              transform={`translate(${(id % 9) * 10} ${Math.floor(id / 9) * 10})`}
              role="button"
              tabIndex={wallMode ? -1 : 0}
              data-slot={!wallMode ? id : undefined}
              data-cell={id}
              aria-label={`${cellName(id)}${pawn ? `, ${colorName(pawn)} pawn` : ""}${enabled ? ", move here" : ""}`}
              aria-disabled={!enabled}
              className={`block-cell ${highlighted ? "block-last-cell" : ""} ${enabled ? "block-move-target" : ""}`}
              onClick={() => enabled && onMove(id)}
              onKeyDown={(event) =>
                activate(event, () => enabled && onMove(id), id, 9)
              }
            >
              <rect width="8" height="8" rx="1" />
              {enabled && (
                <circle className="block-move-dot" cx="4" cy="4" r="1.1" />
              )}
              {pawn && (
                <circle
                  className={`block-pawn block-pawn-${pawn} ${!game.winner && game.current === pawn ? "block-pawn-active" : ""}`}
                  cx="4"
                  cy="4"
                  r="2.65"
                />
              )}
            </g>
          );
        })}
        <g className="block-walls" aria-hidden="true">
          {game.walls.map((wall, i) => (
            <Wall
              key={i}
              wall={wall}
              className={
                last?.type === "wall" &&
                last.row === wall.row &&
                last.col === wall.col &&
                last.orientation === wall.orientation
                  ? "block-last-wall"
                  : ""
              }
            />
          ))}
        </g>
        {wallMode && interactive && (
          <g className="block-slots">
            {Array.from({ length: 64 }, (_, id) => {
              const row = Math.floor(id / 8),
                col = id % 8;
              const choose = () => onPreview({ row, col });
              return (
                <g
                  key={id}
                  role="button"
                  tabIndex="0"
                  data-slot={id}
                  data-wall-slot={id}
                  aria-label={`Wall slot ${cellName(row * 9 + col)}`}
                  aria-pressed={preview?.row === row && preview?.col === col}
                  onClick={choose}
                  onKeyDown={(event) => activate(event, choose, id, 8)}
                >
                  <rect
                    x={col * 10 + 4}
                    y={row * 10 + 4}
                    width="10"
                    height="10"
                    fill="transparent"
                  />
                  <circle cx={col * 10 + 9} cy={row * 10 + 9} r="1.5" />
                </g>
              );
            })}
          </g>
        )}
        {preview && wallMode && interactive && (
          <g className="block-preview" aria-hidden="true">
            <Wall
              wall={preview}
              className={invalid ? "block-wall-invalid" : "block-wall-valid"}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
