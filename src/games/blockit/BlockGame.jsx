import { useEffect, useState } from "react";
import { colorName, describeAction, wallError } from "./engine.js";
import { BlockBoard } from "./BlockBoard.jsx";

export function BlockGame({
  game,
  interactive = true,
  players = [],
  you,
  busy = false,
  paused = false,
  status,
  canUndo,
  onUndo,
  onAction,
  children,
  footer,
}) {
  const [wallMode, setWallMode] = useState(false);
  const [orientation, setOrientation] = useState("h");
  const [slot, setSlot] = useState(null);
  // A revision, undo or opponent request must clear any uncommitted preview.
  useEffect(() => {
    setWallMode(false);
    setSlot(null);
  }, [game.turn, game.current, interactive]);
  const preview = slot ? { ...slot, orientation } : null;
  const invalid = preview ? wallError(game, preview) : "";
  const enabled = interactive && !busy && !game.winner;
  const currentName =
    players.find((player) => player.color === game.current)?.name ||
    colorName(game.current);
  const winnerName =
    players.find((player) => player.color === game.winner)?.name ||
    colorName(game.winner);
  return (
    <section
      className="block-game"
      aria-label={players.length ? "Online game" : "Same-device game"}
    >
      <div className="block-arena">
        <div className="block-scoreboard">
          {["white", "black"].map((color) => {
            const index = players.findIndex((player) => player.color === color);
            return (
              <div
                key={color}
                className={`block-player ${!game.winner && game.current === color ? "block-player-current" : ""}`}
              >
                <i
                  className={`block-token block-token-${color}`}
                  aria-hidden="true"
                />
                <div>
                  <strong>
                    {players[index]?.name || colorName(color)}
                    {index >= 0 && index === you ? " (you)" : ""}
                  </strong>
                  <span>
                    {game.remaining[color]} walls ·{" "}
                    {color === "white" ? "Top" : "Bottom"} goal
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="block-turn" role="status" aria-live="polite">
          <strong>
            {game.winner ? `${winnerName} wins!` : `${currentName}’s turn`}
          </strong>
          <span>
            {status ||
              (wallMode
                ? "Tap a dot to preview a wall."
                : "Tap a green dot to move.")}
          </span>
        </div>
        <BlockBoard
          game={game}
          wallMode={wallMode}
          preview={preview}
          invalid={!!invalid}
          interactive={enabled}
          onMove={(to) => onAction({ type: "move", to })}
          onPreview={setSlot}
        />
        <p className="block-last-turn" aria-label="Last turn">
          {describeAction(game.lastAction)}
        </p>
      </div>
      <aside className="block-controls">
        {children}
        {!game.winner && !paused && (
          <div className="block-action-panel">
            {!wallMode && (
              <div
                className="block-mode-buttons"
                role="group"
                aria-label="Turn action"
              >
                <button
                  className={!wallMode ? "primary" : ""}
                  disabled={!enabled}
                  aria-pressed={!wallMode}
                  onClick={() => {
                    setWallMode(false);
                    setSlot(null);
                  }}
                >
                  Move pawn
                </button>
                <button
                  className={wallMode ? "primary" : ""}
                  disabled={!enabled || !game.remaining[game.current]}
                  aria-pressed={wallMode}
                  onClick={() => {
                    setWallMode(true);
                    setSlot(null);
                  }}
                >
                  Place wall
                </button>
              </div>
            )}
            {wallMode ? (
              <>
                <div
                  className="block-orientation"
                  role="group"
                  aria-label="Wall direction"
                >
                  <button
                    aria-pressed={orientation === "h"}
                    disabled={!enabled}
                    onClick={() => setOrientation("h")}
                  >
                    Horizontal
                  </button>
                  <button
                    aria-pressed={orientation === "v"}
                    disabled={!enabled}
                    onClick={() => setOrientation("v")}
                  >
                    Vertical
                  </button>
                </div>
                <p
                  className={`block-wall-hint ${invalid ? "block-invalid-hint" : ""}`}
                  role="status"
                >
                  {invalid ||
                    (slot
                      ? "Ready to place. Both routes stay open."
                      : "Choose a slot on the board.")}
                </p>
                <div className="block-wall-buttons">
                  <button
                    disabled={!enabled}
                    onClick={() => {
                      setWallMode(false);
                      setSlot(null);
                    }}
                  >
                    Move pawn
                  </button>
                  <button
                    className="primary block-confirm"
                    disabled={!enabled || !preview || !!invalid}
                    onClick={() => onAction({ type: "wall", ...preview })}
                  >
                    Confirm wall
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="block-action-hint">
                  Race to the opposite edge. Use your walls to slow your
                  opponent.
                </p>
                <button disabled={!canUndo || busy} onClick={onUndo}>
                  {players.length ? "Request undo" : "Undo last turn"}
                </button>
              </>
            )}
          </div>
        )}
        {game.winner && (
          <p className="block-result-note">
            {game.reason === "goal"
              ? "Reached the opposite edge."
              : "The other player resigned."}
          </p>
        )}
        {footer}
      </aside>
    </section>
  );
}
