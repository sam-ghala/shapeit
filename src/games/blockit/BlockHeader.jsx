import { SoundToggle } from "../../shared/components/SoundToggle.jsx";
export function BlockHeader({ onHome, onRules, onMenu }) {
  return (
    <header className="block-topbar">
      <button
        className="block-wordmark"
        aria-label="BlockIt home"
        onClick={onHome}
      >
        Block<span>It</span>
      </button>
      <div>
        <SoundToggle compact />
        <button
          className="block-help"
          aria-label="How to play"
          onClick={onRules}
        >
          ?
        </button>
        {onMenu && <button onClick={onMenu}>Menu</button>}
      </div>
    </header>
  );
}
