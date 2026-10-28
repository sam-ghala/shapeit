import { useEffect, useRef } from "react";
import { PCOLORS } from "../constants/gameConstants.js";
import { getLabel } from "../game/engine.js";
import { PiecePreview } from "./PiecePreview.jsx";
export function ColorPicker({ pieces, value, onChange, disabled = false }) {
  return (
    <div className="color-picker" role="group" aria-label="Drawing color">
      {[...new Set(pieces.map((p) => p.color)), "x"].map((color) => (
        <button
          key={color}
          className={`color-button ${value === color ? "selected" : ""}`}
          style={{ "--swatch": PCOLORS[color] || "#fff" }}
          disabled={disabled}
          aria-label={color === "x" ? "Mark empty" : `${color} pencil`}
          aria-pressed={value === color}
          title={color === "x" ? "Mark empty" : color}
          onClick={() => onChange(color)}
        >
          {color === "x" ? "×" : color === "transparent" ? "◇" : ""}
        </button>
      ))}
    </div>
  );
}
export function PieceList({ pieces }) {
  return (
    <div className="piece-list">
      {pieces.map((p) => (
        <div key={p.id} title={`${p.color} ${p.name}`}>
          <PiecePreview piece={p} size={18} />
          <small>{p.name}</small>
        </div>
      ))}
    </div>
  );
}
export function QueryLog({
  history,
  cols,
  rows,
  onSelect,
  selected,
  players = null,
}) {
  const list = useRef(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [history.length]);
  return (
    <div className="query-log">
      <h3>
        Laser log <span>{history.length}</span>
      </h3>
      {history.length === 0 ? (
        <p className="muted">No lasers yet.</p>
      ) : (
        <ol ref={list}>
          {history.map((h, i) => (
            <li key={i}>
              <button
                className={selected === i ? "selected" : ""}
                disabled={!onSelect}
                onClick={() => onSelect?.(i)}
                aria-label={`Query ${i + 1}: ${getLabel(h.side, h.idx, cols, rows)} to ${h.absorbed ? "absorbed" : getLabel(h.exitSide, h.exitIdx, cols, rows)}`}
              >
                <span className="query-number">{i + 1}</span>
                {players && (
                  <span className="query-player">
                    {players[h.player]?.name}
                  </span>
                )}
                <strong>
                  {getLabel(h.side, h.idx, cols, rows)} →{" "}
                  {h.absorbed
                    ? "Absorbed"
                    : getLabel(h.exitSide, h.exitIdx, cols, rows)}
                </strong>
                <span className="query-colors">
                  {h.absorbed
                    ? "No signal"
                    : h.colors.length === 0
                      ? "Colorless"
                      : h.colors.map((color) => (
                          <span
                            key={color}
                            className="color-dot"
                            style={{ background: PCOLORS[color] }}
                            role="img"
                            aria-label={color}
                            title={color}
                          />
                        ))}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
