import { useEffect, useState } from "react";
import { Dialog } from "./Dialog.jsx";
import { resultSound, unlockAudio } from "../game/audio.js";
import { readJSON, writeJSON } from "../game/storage.js";
export function ResultDialog({
  title,
  won,
  score,
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
  const [sound, setSound] = useState(() => readJSON("shapeit:sound", true));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (score === undefined || !animate || reduced) {
      setValue(score ?? 0);
      return;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 2000);
      setValue(Math.round((score ?? 0) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Background tabs can suspend animation frames. Never leave a finished
    // result showing zero when the browser resumes timers.
    const finish = setTimeout(() => {
      cancelAnimationFrame(frame);
      setValue(score ?? 0);
    }, 2100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(finish);
    };
  }, [score, animate, reduced]);
  useEffect(() => {
    if (animate && sound) return resultSound(won);
  }, [animate, won, sound]);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      className={`result-dialog ${won ? "success" : "failure"}`}
    >
      <div className="result-symbol" aria-hidden="true">
        {won ? "✦" : "◇"}
      </div>
      <p className="result-detail">{detail}</p>
      {score !== undefined && (
        <div className="result-score">
          <strong aria-label={`${score.toLocaleString()} points`}>
            {value.toLocaleString()}
          </strong>
          <span>points</span>
          <div
            className="score-meter"
            role="progressbar"
            aria-label="Score"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={10000}
          >
            <div style={{ width: `${Math.min(100, value / 100)}%` }} />
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
      <button
        className="sound-toggle"
        aria-pressed={sound}
        onClick={() => {
          unlockAudio();
          setSound(!sound);
          writeJSON("shapeit:sound", !sound);
        }}
      >
        Sound {sound ? "on" : "off"}
      </button>
    </Dialog>
  );
}
