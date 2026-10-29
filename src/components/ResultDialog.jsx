import { useEffect, useState } from "react";
import { Dialog } from "./Dialog.jsx";
import { resultSound, resultProgress, RESULT_DURATION } from "../game/audio.js";
import { SoundToggle } from "./SoundToggle.jsx";
export function ResultDialog({
  title,
  won,
  score,
  bonus = 0,
  bestScore = null,
  scoreEligible = true,
  detail,
  onClose,
  onNext,
  nextLabel = "New board",
  nextDisabled = false,
  onShare,
  message,
  animate = true,
}) {
  const [value, setValue] = useState(animate ? 0 : (score ?? 0));
  const [complete, setComplete] = useState(!animate);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!animate) {
      setValue(score ?? 0);
      setComplete(true);
      return;
    }
    let frame, finish;
    const duration =
      won && score !== undefined && !reduced ? RESULT_DURATION : 0;
    const stop = resultSound(won, duration, (elapsed) => {
      const done = () => {
        cancelAnimationFrame(frame);
        setValue(score ?? 0);
        setComplete(true);
      };
      if (!duration) {
        done();
        return;
      }
      const tick = () => {
        const seconds = elapsed();
        setValue(Math.round((score ?? 0) * resultProgress(seconds)));
        if (seconds < duration) frame = requestAnimationFrame(tick);
        else done();
      };
      frame = requestAnimationFrame(tick);
      finish = setTimeout(done, duration * 1000 + 50);
    });
    return () => {
      stop();
      cancelAnimationFrame(frame);
      clearTimeout(finish);
    };
  }, [score, won, animate, reduced]);
  const record =
    scoreEligible &&
    won &&
    score !== undefined &&
    (bestScore === null || score > bestScore);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      className={`result-dialog ${won ? "success" : "failure"}`}
    >
      {won && animate && !reduced && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => (
            <i
              key={i}
              style={{
                "--x": `${(i * 37) % 100}%`,
                "--drift": `${(i % 2 ? 1 : -1) * (20 + (i % 5) * 12)}px`,
                "--delay": `${(i % 7) * 0.06}s`,
                "--turn": `${180 + i * 41}deg`,
                "--confetti": ["#ffc94a", "#65c9ea", "#fa9180", "#80cca4"][
                  i % 4
                ],
              }}
            />
          ))}
        </div>
      )}
      <div className="result-symbol" aria-hidden="true">
        <svg viewBox="0 0 80 80" width="80" height="80" fill="none">
          <path
            d="m40 4 32 25-12 37H20L8 29Z"
            fill={won ? "#ffd253" : "#eaf2fb"}
            stroke="#263646"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {won ? (
            <path
              d="m25 37 10 10 21-23"
              stroke="#263646"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="m29 26 22 22m0-22L29 48"
              stroke="#697b8d"
              strokeWidth="5"
              strokeLinecap="round"
            />
          )}
        </svg>
      </div>
      <p className="result-detail">{detail}</p>
      {score !== undefined && (
        <div className={`result-score ${complete ? "complete" : "counting"}`}>
          <strong aria-label={`${score.toLocaleString()} points`}>
            {value.toLocaleString()}
          </strong>
          <span>
            points{bonus > 0 ? ` · +${bonus.toLocaleString()} from extras` : ""}
          </span>
          <div className="score-track">
            <div
              className="score-meter"
              role="progressbar"
              aria-label="Score"
              aria-valuenow={value}
              aria-valuemin={0}
              aria-valuemax={10000}
            >
              <div
                className="score-fill"
                style={{ width: `${Math.min(100, value / 100)}%` }}
              />
            </div>
            {bestScore !== null && (
              <span
                className="best-marker"
                title={`Personal best: ${bestScore.toLocaleString()}`}
                style={{ left: `${Math.min(100, bestScore / 100)}%` }}
                aria-hidden="true"
              >
                <i>★</i>
              </span>
            )}
          </div>
          <div className="score-benchmark">
            <span>
              {bestScore !== null ? `★ Best ${bestScore.toLocaleString()}` : ""}
            </span>
            <span>
              {complete && record
                ? "Personal best!"
                : bestScore !== null && value < bestScore
                  ? `${(bestScore - value).toLocaleString()} to go`
                  : ""}
            </span>
          </div>
        </div>
      )}
      <button
        className="primary next-board"
        onClick={onNext}
        disabled={nextDisabled}
      >
        {nextLabel} →
      </button>
      <div className="result-actions">
        <button onClick={onClose}>See board</button>
        {onShare && <button onClick={onShare}>Share</button>}
      </div>
      {message && <p role="status">{message}</p>}
      <SoundToggle />
    </Dialog>
  );
}
