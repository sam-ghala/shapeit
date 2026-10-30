import { normalizeExtras } from "../game/extras.js";
export function ExtraOptions({ value, onChange, disabled = false }) {
  const extras = normalizeExtras(value);
  return (
    <fieldset className="extra-options" disabled={disabled}>
      <legend>Extra pieces</legend>
      {[
        [
          "diamond",
          "◇",
          "Diamond",
          "Reflects the laser without adding a color.",
        ],
        [
          "black",
          "■",
          "Black body",
          "Absorbs the laser: no exit and no colors.",
        ],
      ].map(([key, icon, name, help]) => (
        <label key={key} title={help} className="extra-choice">
          <input
            type="checkbox"
            checked={extras[key]}
            onChange={(e) => onChange({ ...extras, [key]: e.target.checked })}
          />
          <span className={`extra-icon ${key}`}>{icon}</span>
          <span>
            <strong>{name}</strong>
            <small>{help}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
