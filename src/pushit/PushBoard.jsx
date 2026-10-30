import { useLayoutEffect, useRef, useState } from "react";
import { coordinate, DIRECTIONS, forwardMove } from "./engine.js";

export function PushPiece({ color, facing = 0, angle = facing * 90 }) {
  return (
    <span
      className={`push-piece ${color}`}
      style={{ "--facing": `${angle}deg` }}
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
export function PushBoard({
  game,
  selected,
  onSelect,
  onForward,
  onRotate,
  interactive = false,
  small = false,
  perspective = "white",
  boardAngle = perspective === "black" ? 180 : 0,
  rotating = false,
}) {
  const flipped = perspective === "black";
  const move = selected ? forwardMove(game, selected) : null;
  const destination =
    interactive && !rotating && move?.legal ? move.destination : null;
  const chosen = game.pieces.find(
    (p) => p.id === selected && p.color === game.current,
  );
  const angles = useRef(new Map());
  const previous = useRef(game);
  const [ghosts, setGhosts] = useState([]);
  const [motionSettled, setMotionSettled] = useState(true);
  const firstMotion = useRef(true);
  useLayoutEffect(() => {
    if (firstMotion.current) {
      firstMotion.current = false;
      return;
    }
    setMotionSettled(false);
    // Safari can suspend CSS animation frames in an occluded tab.
    // The final board position must still become visible on wall-clock time.
    const timer = setTimeout(() => setMotionSettled(true), 360);
    return () => clearTimeout(timer);
  }, [game.step]);
  useLayoutEffect(() => {
    if (previous.current === game || previous.current.step === game.step)
      return;
    const removed = (game.lastAction?.changes || []).filter(
      (p) =>
        p.removed && previous.current.pieces.some((old) => old.id === p.id),
    );
    previous.current = game;
    if (!removed.length) {
      setGhosts([]);
      return;
    }
    setGhosts(removed);
    const timer = setTimeout(() => setGhosts([]), 1000);
    return () => clearTimeout(timer);
  }, [game.step, game.winner]);
  // Keep a continuous angle so a turn from west to north animates a quarter-turn.
  const tokens = game.pieces.map((p) => {
    const old = angles.current.get(p.id);
    let angle = p.facing * 90;
    if (old) {
      const delta = ((p.facing - old.facing + 6) % 4) - 2;
      angle = old.angle + delta * 90;
    }
    angles.current.set(p.id, { facing: p.facing, angle });
    return { ...p, angle };
  });
  return (
    <div
      className={`push-board-frame ${small ? "push-board-small" : ""} ${ghosts.length && game.winner ? "is-winning" : ""}`}
    >
      <div
        className="push-board-stage"
        style={{ "--board-angle": `${boardAngle}deg` }}
        data-rotating={rotating}
        data-motion-settled={motionSettled}
      >
        <div
          className="push-board"
          role="group"
          aria-label="PushIt 4 by 4 board"
          data-perspective={perspective}
        >
          {Array.from({ length: 16 }, (_, i) => {
            const x = i % 4,
              y = Math.floor(i / 4);
            const piece = game.pieces.find((p) => p.x === x && p.y === y);
            const target = destination?.[0] === x && destination?.[1] === y;
            const active =
              interactive && !rotating && piece?.color === game.current;
            const isSelected = !!piece && piece.id === selected;
            const facing = piece ? (piece.facing + (flipped ? 2 : 0)) % 4 : 0;
            const label = `${coordinate(x, y)}${piece ? `, ${piece.color}, facing ${DIRECTIONS[facing]}` : ", empty"}${target ? ", move here" : ""}`;
            return (
              <div
                key={i}
                className="push-square"
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
                  <span
                    className="push-cell-coordinate"
                    aria-hidden="true"
                    style={{ transform: `rotate(${-boardAngle}deg)` }}
                  >
                    {coordinate(x, y)}
                  </span>
                  {target && (
                    <span className="push-target" aria-hidden="true">
                      {piece ? "⇢" : "+"}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className="push-token-layer" aria-hidden="true">
          {tokens.map((p) => (
            <div
              key={p.id}
              className={`push-token ${p.id === selected && interactive ? "is-selected" : ""}`}
              data-token={p.id}
              style={{ left: `${p.x * 25}%`, top: `${p.y * 25}%` }}
            >
              <PushPiece color={p.color} angle={p.angle} />
            </div>
          ))}
          {ghosts.map((p) => (
            <div
              key={`ghost:${p.id}:${game.step}`}
              className="push-token push-ejected"
              data-ejected={p.id}
              style={{
                left: `${p.from.x * 25}%`,
                top: `${p.from.y * 25}%`,
                "--exit-x": `${(p.to.x - p.from.x) * 170}%`,
                "--exit-y": `${(p.to.y - p.from.y) * 170}%`,
              }}
            >
              <PushPiece color={p.color} facing={p.from.facing} />
            </div>
          ))}
        </div>
      </div>
      {chosen && interactive && !rotating && onRotate && (
        <div className="push-control-layer">
          <div
            className="push-orbit-controls"
            style={{
              left: `${(flipped ? 3 - chosen.x : chosen.x) * 25}%`,
              top: `${(flipped ? 3 - chosen.y : chosen.y) * 25}%`,
            }}
          >
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
        </div>
      )}
    </div>
  );
}
