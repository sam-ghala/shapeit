import { coordinate, DIRECTIONS, forwardMove } from "./engine.js";

export function PushPiece({ color, facing = 0 }) {
  return (
    <span
      className={`push-piece ${color}`}
      style={{ "--facing": `${facing * 90}deg` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="13" r="5" fill="currentColor" />
        <path
          d="M32 23v28M22 33l10-10 10 10M21 44h22"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function RotateArrow({ right }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={right ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M7 9a9 9 0 1 1-1 10M7 9V3M7 9h6" />
    </svg>
  );
}

// Only the view rotates; coordinates and all actions remain in server space.
export function PushBoard({
  game,
  selected,
  onSelect,
  onForward,
  onRotate,
  interactive = false,
  small = false,
  perspective = "white",
}) {
  const flipped = perspective === "black";
  const move = selected ? forwardMove(game, selected) : null;
  const destination = interactive && move?.legal ? move.destination : null;
  return (
    <div className={`push-board-frame ${small ? "push-board-small" : ""}`}>
      <div
        className="push-board"
        role="group"
        aria-label="PushIt 4 by 4 board"
        data-perspective={perspective}
      >
        {Array.from({ length: 16 }, (_, i) => {
          const column = i % 4,
            row = Math.floor(i / 4);
          const x = flipped ? 3 - column : column,
            y = flipped ? 3 - row : row;
          const piece = game.pieces.find((p) => p.x === x && p.y === y);
          const target = destination?.[0] === x && destination?.[1] === y;
          const active = interactive && piece?.color === game.current;
          const isSelected = !!piece && piece.id === selected;
          const facing = piece ? (piece.facing + (flipped ? 2 : 0)) % 4 : 0;
          const label = `${coordinate(x, y)}${piece ? `, ${piece.color}, facing ${DIRECTIONS[facing]}` : ", empty"}${target ? ", move here" : ""}`;
          return (
            <div
              key={coordinate(x, y)}
              className={`push-square ${isSelected && interactive ? "has-controls" : ""}`}
              data-coordinate={coordinate(x, y)}
            >
              <button
                className={`push-cell ${(x + y) % 2 ? "tinted" : ""} ${isSelected ? "selected" : ""} ${target ? "destination" : ""}`}
                aria-label={label}
                aria-pressed={piece ? isSelected : undefined}
                disabled={!active && !target}
                data-piece-id={piece?.id}
                data-facing={piece ? facing : undefined}
                onClick={() => (target ? onForward() : onSelect(piece.id))}
              >
                <span className="push-cell-coordinate" aria-hidden="true">
                  {coordinate(x, y)}
                </span>
                {piece && <PushPiece color={piece.color} facing={facing} />}
                {target && (
                  <span className="push-target" aria-hidden="true">
                    {piece ? "⇢" : "+"}
                  </span>
                )}
              </button>
              {isSelected && active && onRotate && (
                <div className="push-orbit-controls">
                  <button
                    className="push-rotate push-rotate-left"
                    aria-label="Rotate left 90°"
                    onClick={() => onRotate("left")}
                  >
                    <RotateArrow />
                  </button>
                  <button
                    className="push-rotate push-rotate-right"
                    aria-label="Rotate right 90°"
                    onClick={() => onRotate("right")}
                  >
                    <RotateArrow right />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
