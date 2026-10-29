import { readTabState, writeTabState } from "../game/navigation.js";
import { MenuButton } from "./MenuButton.jsx";
import { SoundToggle } from "./SoundToggle.jsx";
import { personalBests, readScores } from "../game/scores.js";
import { ResultDialog } from "./ResultDialog.jsx";
import { ExtraOptions } from "./ExtraOptions.jsx";
import { writeJSON } from "../game/storage.js";
import { unlockAudio, playSound } from "../game/audio.js";
import { useState, useEffect, useMemo, useRef } from "react";
import { useGameSession } from "../hooks/useGameSession.js";
import { nextPencilColor, trainingHint } from "../game/assistance.js";
import { dailyDate, fireLaser } from "../game/engine.js";
import { GameBoard } from "./GameBoard.jsx";
import { ColorPicker, PieceList, QueryLog } from "./GameControls.jsx";
import { HowToPlayModal } from "./HowToPlayModal.jsx";
import { Dialog } from "./Dialog.jsx";

export function SoloGame({
  config,
  profile,
  effects,
  onHome,
  onDaily,
  onConfigChange,
}) {
  const state = useGameSession(config, profile);
  const { game, pieces, puzzle, history, cols, rows, storageError } = state;
  const [savedView] = useState(() =>
    readTabState(`shapeit:solo-view:${game.id}`, {}),
  );
  const previousGame = useRef(game.id);
  useEffect(() => {
    onConfigChange?.({
      mode: game.mode,
      size: game.size,
      date: game.date,
      extras: game.extras,
      timed: true,
    });
  }, [game.id]);
  const [color, setColor] = useState(pieces[0].color),
    [howTo, setHowTo] = useState(!!savedView.howTo),
    [confirm, setConfirm] = useState(null);
  const [review, setReview] = useState(
      savedView.review === "solution" ? "solution" : "compare",
    ),
    [replay, setReplay] = useState(null),
    [resultOpen, setResultOpen] = useState(!!savedView.resultOpen),
    [freshResult, setFreshResult] = useState(false),
    [selectionVersion, setSelectionVersion] = useState(0),
    [optionsOpen, setOptionsOpen] = useState(!!savedView.optionsOpen),
    [nextExtras, setNextExtras] = useState(config.extras),
    [selected, setSelected] = useState(null),
    [now, setNow] = useState(Date.now()),
    [shareMessage, setShareMessage] = useState("");
  const bestScore = useMemo(
    () =>
      personalBests(readScores(), game.mode, game.size).find(
        (s) => s.id !== game.id,
      )?.score ?? null,
    [game.id],
  );
  const finished = game.status !== "playing";
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (previousGame.current === game.id) return;
    previousGame.current = game.id;
    setSelected(null);
    setReplay(null);
    setReview("compare");
    setResultOpen(false);
    setShareMessage("");
    setColor(pieces[0].color);
  }, [game.id, pieces]);
  useEffect(() => {
    writeTabState(`shapeit:solo-view:${game.id}`, {
      howTo,
      review,
      resultOpen,
      optionsOpen,
    });
  }, [game.id, howTo, review, resultOpen, optionsOpen]);
  const seconds = game.startedAt
    ? Math.max(
        0,
        Math.floor(((game.finishedAt ?? now) - game.startedAt) / 1000),
      )
    : 0;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const share = async () => {
    const text = `ShapeIt ${game.mode === "daily" ? game.date : "Training"} · ${game.size === "compact" ? "Small board" : "Big board"}\n${game.status === "won" ? "Solved" : "Not solved"} in ${time} with ${history.length} lasers${game.score !== null ? ` · ${game.score.toLocaleString()} points` : ""}${game.hintStep ? " · Assisted" : ""}\nhttps://playshapeit.com`;
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
  const newBoard = () => {
    setResultOpen(false);
    state.newTraining(nextExtras);
  };
  const submit = () => {
    unlockAudio();
    state.submit();
    setReview("compare");
    setFreshResult(true);
    setResultOpen(true);
  };
  const fire = (side, idx) => {
    playSound("laser");
    const existing = history.findIndex(
      (h) =>
        (h.side === side && h.idx === idx) ||
        (h.exitSide === side && h.exitIdx === idx),
    );
    if (finished) {
      setSelected(existing < 0 ? null : existing);
      setSelectionVersion((v) => v + 1);
      setReplay({ ...fireLaser(puzzle.board, side, idx), side, idx });
      return;
    }
    setSelected(existing < 0 ? history.length : existing);
    setSelectionVersion((v) => v + 1);
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
        <MenuButton onClick={onHome} />
        <div>
          <strong>ShapeIt</strong>
          <span className="badge">
            {game.mode === "daily" ? `Daily · ${game.date}` : "Train mode"}
          </span>
        </div>
        <div className="header-actions">
          <SoundToggle compact />
          <button
            aria-label="How to play"
            title="How to play"
            onClick={() => setHowTo(true)}
          >
            ?
          </button>
        </div>
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
      <div className="play-layout">
        <section className="board-panel">
          <div className="board-stats">
            <span>◷ {time}</span>
            <span>
              ↗ {history.length} {history.length === 1 ? "laser" : "lasers"}
            </span>
          </div>
          <GameBoard
            cols={cols}
            rows={rows}
            guess={game.guess}
            edges={game.edges}
            pieces={pieces}
            revealed={finished ? puzzle.placed : null}
            compare={finished && review === "compare"}
            hideNotes={finished}
            hintPiece={!finished && hint?.level === 3 ? hint.piece : null}
            locked={finished}
            onCell={(r, c) => {
              playSound("draw");
              state.cell(r, c, color);
            }}
            onEdge={(key) => {
              playSound("draw");
              state.edge(key, color);
            }}
            onLaser={fire}
            selectedColor={color}
            activeLaser={finished ? replay : null}
            replayVersion={selectionVersion}
            animate={effects}
            queries={history}
            highlight={
              finished ? replay : selected !== null ? history[selected] : null
            }
          />
        </section>
        <div className="game-sidebar">
          <aside className="tools-panel">
            <PieceList
              pieces={pieces}
              guess={game.guess}
              edges={game.edges}
              onColor={!finished ? setColor : undefined}
            />
            {finished && (
              <>
                <strong className="inline-result">
                  {game.status === "won" ? "Solved!" : "Incorrect"} ·{" "}
                  {(game.score ?? 0).toLocaleString()} points
                </strong>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={review === "compare"}
                    onChange={(e) =>
                      setReview(e.target.checked ? "compare" : "solution")
                    }
                  />
                  Overlay your drawing
                </label>
                {shareMessage && <p role="status">{shareMessage}</p>}
              </>
            )}
            {!finished && (
              <>
                <ColorPicker
                  pieces={pieces}
                  value={color}
                  onChange={(next) => {
                    playSound();
                    setColor(next);
                  }}
                />
                <button className="primary" onClick={submit}>
                  Submit solution
                </button>
              </>
            )}
          </aside>
          <QueryLog
            history={history}
            cols={cols}
            rows={rows}
            selected={selected}
            selectionVersion={selectionVersion}
            onSelect={(i) => {
              if (finished) fire(history[i].side, history[i].idx);
              else {
                setSelected(i);
                setSelectionVersion((v) => v + 1);
              }
            }}
          />
          <div className="secondary-tools">
            {finished ? (
              <>
                <button className="primary next-board" onClick={newBoard}>
                  New board →
                </button>
                <div className="button-row">
                  <button
                    onClick={() => {
                      setFreshResult(false);
                      setResultOpen(true);
                    }}
                  >
                    Result
                  </button>
                  <button onClick={share}>Share</button>
                </div>
              </>
            ) : (
              <>
                <div className="button-row">
                  <button onClick={() => setConfirm("clear")}>
                    Clear drawing
                  </button>
                  {game.mode === "training" && (
                    <>
                      <button onClick={() => setConfirm("new")}>
                        New board
                      </button>
                      <button onClick={() => setOptionsOpen(true)}>
                        Settings
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
          </div>
        </div>
      </div>
      {finished && resultOpen && (
        <ResultDialog
          title={game.status === "won" ? "Solved!" : "Not solved"}
          won={game.status === "won"}
          score={game.score ?? 0}
          bestScore={bestScore}
          scoreEligible={!game.hintStep}
          detail={`${time} · ${history.length} lasers`}
          onClose={() => setResultOpen(false)}
          onNext={newBoard}
          onShare={share}
          message={shareMessage}
          animate={freshResult}
        />
      )}
      {optionsOpen && (
        <Dialog title="Training settings" onClose={() => setOptionsOpen(false)}>
          <ExtraOptions
            value={nextExtras}
            onChange={(value) => {
              setNextExtras(value);
              writeJSON("shapeit:training-extras", value);
            }}
          />
          <p className="muted small">Applies to your next board.</p>
          <button className="primary" onClick={() => setOptionsOpen(false)}>
            Done
          </button>
        </Dialog>
      )}
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
                if (confirm === "clear") {
                  playSound("clear");
                  state.clear();
                } else newBoard();
                setConfirm(null);
              }}
            >
              {confirm === "clear" ? "Clear drawing" : "New board"}
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
