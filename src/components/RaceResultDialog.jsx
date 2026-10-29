import { useEffect, useState } from "react";
import { Dialog } from "./Dialog.jsx";
import { resultSound, resultProgress, RESULT_DURATION } from "../game/audio.js";
import { SoundToggle } from "./SoundToggle.jsx";

export function RaceResultDialog({
  players,
  title,
  won,
  animate = true,
  onReveal,
  onClose,
  onNext,
  nextLabel,
  nextDisabled,
}) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [progress, setProgress] = useState(animate && !reduced ? 0 : 1);
  const complete = progress === 1;
  const group = players.length > 2;
  const entries = players.map((player, index) => ({
    ...player,
    you: player.you ?? index === 0,
    originalIndex: index,
  }));
  if (group && complete)
    entries.sort(
      (a, b) => (b.submission?.score || 0) - (a.submission?.score || 0),
    );
  useEffect(() => {
    if (!animate || reduced) {
      setProgress(1);
      onReveal();
      return;
    }
    let frame, finish;
    const duration = 3;
    const stop = resultSound(
      won,
      duration,
      (elapsed) => {
        const done = () => {
          cancelAnimationFrame(frame);
          setProgress(1);
          onReveal();
        };
        const tick = () => {
          const seconds = elapsed();
          setProgress(resultProgress((seconds * RESULT_DURATION) / duration));
          if (seconds < duration) frame = requestAnimationFrame(tick);
          else done();
        };
        frame = requestAnimationFrame(tick);
        finish = setTimeout(done, duration * 1000 + 50);
      },
      true,
      true,
    );
    return () => {
      stop();
      cancelAnimationFrame(frame);
      clearTimeout(finish);
    };
  }, [animate, reduced, won, onReveal]);
  return (
    <Dialog
      title={complete ? title : "Counting points…"}
      onClose={onClose}
      className={`race-result-dialog ${group ? "group-race-result" : ""} ${complete && won ? "success" : ""}`}
    >
      <div className="race-meters">
        {entries.map((player) => {
          const score = player.submission?.score || 0,
            value = Math.round(score * progress),
            rank = player.submission?.correct
              ? 1 +
                players.filter((p) => (p.submission?.score || 0) > score).length
              : null;
          return (
            <section
              className={`race-meter-card player-${player.you ? 0 : 1} ${complete && player.winner ? "race-winner" : ""}`}
              key={player.playerIndex ?? player.originalIndex}
            >
              <h3>
                {group && complete && (
                  <span className="race-rank">{rank || "–"}</span>
                )}
                {player.you ? "You" : player.name}
              </h3>
              <strong className="race-points">{value.toLocaleString()}</strong>
              <div
                className="race-meter-track"
                role="progressbar"
                aria-label={`${player.you ? "Your" : player.name + "’s"} score`}
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={10000}
              >
                <div
                  style={
                    group
                      ? { width: `${value / 100}%` }
                      : { height: `${value / 100}%` }
                  }
                />
              </div>
              <div className="race-stats">
                <span>{player.submission?.queries ?? 0} lasers</span>
                <span>
                  {Math.floor((player.submission?.seconds ?? 0) / 60)}:
                  {String((player.submission?.seconds ?? 0) % 60).padStart(
                    2,
                    "0",
                  )}
                </span>
              </div>
              <p>
                {complete
                  ? player.submission?.correct
                    ? "Correct"
                    : player.left
                      ? "Left · 0 points"
                      : "Incorrect · 0 points"
                  : "points"}
              </p>
            </section>
          );
        })}
      </div>
      {complete && (
        <div className="race-result-actions">
          <button
            className="primary next-board"
            disabled={nextDisabled}
            onClick={onNext}
          >
            {nextLabel} →
          </button>
          <button onClick={onClose}>See board</button>
        </div>
      )}
      <SoundToggle />
    </Dialog>
  );
}
