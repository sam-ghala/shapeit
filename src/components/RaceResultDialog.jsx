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
      className={`race-result-dialog ${complete && won ? "success" : ""}`}
    >
      <div className="race-meters">
        {players.map((player, index) => {
          const score = player.submission?.score || 0,
            value = Math.round(score * progress);
          return (
            <section className={`race-meter-card player-${index}`} key={index}>
              <h3>{index === 0 ? "You" : player.name}</h3>
              <strong className="race-points">{value.toLocaleString()}</strong>
              <div
                className="race-meter-track"
                role="progressbar"
                aria-label={`${index === 0 ? "Your" : player.name + "’s"} score`}
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={10000}
              >
                <div style={{ height: `${value / 100}%` }} />
              </div>
              <p>
                {complete
                  ? player.submission?.correct
                    ? "Correct"
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
