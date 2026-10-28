import { useState } from "react";
import { Dialog } from "./Dialog.jsx";
import {
  importSavedResults,
  readScores,
  personalBests,
} from "../game/scores.js";
export function Scoreboard({ onClose, initialSize = "classic" }) {
  const [scores] = useState(() => {
    importSavedResults();
    return readScores();
  });
  const [mode, setMode] = useState("daily"),
    [size, setSize] = useState(initialSize),
    [assisted, setAssisted] = useState(false);
  const best = personalBests(
    scores,
    mode,
    size,
    mode === "training" && assisted,
  );
  return (
    <Dialog title="Your best scores" onClose={onClose}>
      <div className="score-filters">
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="training">Train mode</option>
          </select>
        </label>
        <label>
          Board
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="classic">10 × 8</option>
            <option value="compact">7 × 5</option>
          </select>
        </label>
        {mode === "training" && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={assisted}
              onChange={(e) => setAssisted(e.target.checked)}
            />
            With hints
          </label>
        )}
      </div>
      {best.length ? (
        <ol className="personal-scores">
          {best.slice(0, 20).map((s, i) => (
            <li key={s.id}>
              <span className="rank">{i + 1}</span>
              <div>
                <strong>{s.score.toLocaleString()}</strong>
                <small>
                  {new Date(s.finishedAt).toLocaleDateString()} ·{" "}
                  {Math.floor(s.seconds / 60)}:
                  {String(s.seconds % 60).padStart(2, "0")} · {s.queries} lasers
                  {s.extras?.diamond || s.extras?.black ? " · Extras" : ""}
                </small>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-scores">Solve a board to set your first score.</p>
      )}
      <p className="muted small">Personal scores saved on this device.</p>
    </Dialog>
  );
}
