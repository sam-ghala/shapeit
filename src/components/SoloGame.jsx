import { useState, useEffect } from "react";
import { useGameSession } from "../hooks/useGameSession.js";
import { nextPencilColor, trainingHint } from "../game/assistance.js";
import { dailyDate, fireLaser } from "../game/engine.js";
import { GameBoard } from "./GameBoard.jsx";
import { ColorPicker, PieceList, QueryLog } from "./GameControls.jsx";
import { HowToPlayModal } from "./HowToPlayModal.jsx";
import { Dialog } from "./Dialog.jsx";

export function SoloGame({ config, profile, effects, onHome, onDaily }) {
  const state = useGameSession(config, profile);
  const { game, pieces, puzzle, history, cols, rows, storageError } = state;
  const [color, setColor] = useState(pieces[0].color),
    [howTo, setHowTo] = useState(false),
    [confirm, setConfirm] = useState(null);
  const [review, setReview] = useState("drawing"),
    [selected, setSelected] = useState(null),
    [now, setNow] = useState(Date.now()),
    [shareMessage, setShareMessage] = useState("");
  const finished = game.status !== "playing";
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setSelected(null);
    setReview(game.status === "playing" ? "drawing" : "solution");
    setColor(pieces[0].color);
  }, [game.id, pieces]);
  const seconds = game.startedAt
    ? Math.max(
        0,
        Math.floor(((game.finishedAt ?? now) - game.startedAt) / 1000),
      )
    : 0;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const share = async () => {
    const text = `ShapeIt ${game.mode === "daily" ? game.date : "Training"} · ${cols}×${rows}\n${game.status === "won" ? "Solved" : "Not solved"} in ${time} with ${history.length} lasers${game.score !== null ? ` · ${game.score.toLocaleString()} points` : ""}${game.hintStep ? " · Assisted" : ""}\nhttps://playshapeit.com`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShareMessage("Result copied.");
      }
    } catch (e) {
      if (e.name !== "AbortError")
        setShareMessage(
          "Sharing is unavailable. You can copy the result from this screen.",
        );
    }
  };
  const hint =
    game.mode === "training"
      ? trainingHint(puzzle.placed, game.hintStep, cols, rows)
      : null;
  const fire = (side, idx) => {
    const existing = history.findIndex(
      (h) =>
        (h.side === side && h.idx === idx) ||
        (h.exitSide === side && h.exitIdx === idx),
    );
    setSelected(existing < 0 ? history.length : existing);
    if (!finished) {
      const result =
        existing < 0 ? fireLaser(puzzle.board, side, idx) : history[existing];
      setColor(
        nextPencilColor(result.colors, pieces, game.guess, game.edges, color),
      );
      if (existing < 0) state.fire(side, idx);
    }
  };
  return (
    <main className="app-shell game-shell">
      <header className="topbar">
        <button className="text-button" onClick={onHome}>
          ← Menu
        </button>
        <div>
          <strong>ShapeIt</strong>
          <span className="badge">
            {game.mode === "daily"
              ? `Daily · ${game.date}`
              : game.timed
                ? "Timed training"
                : "Relaxed training"}
          </span>
        </div>
        <button onClick={() => setHowTo(true)}>How to play</button>
      </header>
      {storageError && (
        <p className="notice" role="status">
          This browser cannot save your progress. Keep this tab open to finish
          your game.
        </p>
      )}
      {game.mode === "daily" && game.date !== dailyDate(new Date(now)) && (
        <p className="notice">
          A new daily puzzle is available. This board stays here for your
          review. <button onClick={onDaily}>Open today's puzzle</button>
        </p>
      )}
      <div className="session-bar">
        <span>
          {cols} × {rows} · {pieces.length} pieces
        </span>
        <span>
          {history.length} lasers{game.timed ? ` · ${time}` : ""}
        </span>
      </div>
      {finished && (
        <div className="review-tabs compact-result" aria-live="polite">
          <strong>
            {game.status === "won" ? "Solved" : "Incorrect"}
            {game.score !== null
              ? ` · ${game.score.toLocaleString()} points`
              : ""}
            {game.hintStep ? " · Assisted" : ""}
          </strong>
          <button
            aria-pressed={review === "solution"}
            onClick={() => setReview("solution")}
          >
            Solution
          </button>
          <button
            aria-pressed={review === "drawing"}
            onClick={() => setReview("drawing")}
          >
            Your drawing
          </button>
          <button onClick={share}>Share</button>
          <button onClick={state.newTraining}>New training</button>
          {shareMessage && <span role="status">{shareMessage}</span>}
        </div>
      )}
      <div className="play-layout">
        <section className="board-panel">
          <GameBoard
            cols={cols}
            rows={rows}
            guess={game.guess}
            edges={game.edges}
            pieces={pieces}
            revealed={finished && review === "solution" ? puzzle.placed : null}
            hintPiece={!finished && hint?.level === 3 ? hint.piece : null}
            locked={finished}
            onCell={(r, c) => state.cell(r, c, color)}
            onEdge={(key) => state.edge(key, color)}
            onLaser={fire}
            selectedColor={color}
            activeLaser={
              finished && review === "solution" && selected !== null
                ? history[selected]
                : null
            }
            animate={effects}
            queries={history}
            highlight={selected !== null ? history[selected] : null}
          />
        </section>
        <div className="game-sidebar">
          <aside className="tools-panel">
            {!finished && (
              <>
                <ColorPicker
                  pieces={pieces}
                  value={color}
                  onChange={setColor}
                />
              </>
            )}
            <PieceList pieces={pieces} />
            {!finished && (
              <>
                <button
                  className="primary"
                  onClick={() => {
                    state.submit();
                    setReview("solution");
                  }}
                >
                  Submit solution
                </button>
                <div className="button-row">
                  <button onClick={() => setConfirm("clear")}>
                    Clear drawing
                  </button>
                  {game.mode === "training" && (
                    <>
                      <button onClick={() => setConfirm("new")}>
                        New round
                      </button>
                      <button
                        disabled={game.hintStep >= pieces.length * 3}
                        onClick={state.hint}
                      >
                        Hint{hint ? ` · ${hint.level}/3` : ""}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            {!finished && hint && (
              <p className="hint" role="status">
                {hint.text}
              </p>
            )}
          </aside>
          <QueryLog
            history={history}
            cols={cols}
            rows={rows}
            selected={selected}
            onSelect={(i) => {
              setSelected(i);
              if (finished) setReview("solution");
            }}
          />
        </div>
      </div>
      {howTo && (
        <HowToPlayModal
          pieces={pieces}
          cols={cols}
          rows={rows}
          onClose={() => setHowTo(false)}
        />
      )}
      {confirm && (
        <Dialog
          title={
            confirm === "clear" ? "Clear your drawing?" : "Start another round?"
          }
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm === "clear"
              ? "Only your pencil marks will be cleared. Laser clues and the timer are kept."
              : "Your current training round will be replaced."}
          </p>
          <div className="button-row">
            <button onClick={() => setConfirm(null)}>Keep playing</button>
            <button
              className="primary"
              onClick={() => {
                if (confirm === "clear") state.clear();
                else state.newTraining();
                setConfirm(null);
              }}
            >
              {confirm === "clear" ? "Clear drawing" : "New round"}
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
