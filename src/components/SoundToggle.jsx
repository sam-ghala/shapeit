import { useSyncExternalStore } from "react";
import {
  getSoundEnabled,
  setSoundEnabled,
  subscribeSound,
  unlockAudio,
} from "../game/audio.js";
export function SoundToggle({ compact = false }) {
  const enabled = useSyncExternalStore(subscribeSound, getSoundEnabled);
  return (
    <button
      className={compact ? "sound-icon" : "sound-toggle"}
      aria-label={`Sound ${enabled ? "on" : "off"}`}
      aria-pressed={enabled}
      title={`Sound ${enabled ? "on" : "off"}`}
      onClick={() => {
        if (!enabled) void unlockAudio();
        setSoundEnabled(!enabled);
      }}
    >
      {compact ? (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 5 6 9H3v6h3l5 4Z" />
          {enabled ? (
            <>
              <path d="M15 8a6 6 0 0 1 0 8" />
              <path d="M18 5a10 10 0 0 1 0 14" />
            </>
          ) : (
            <path d="m16 9 5 6m0-6-5 6" />
          )}
        </svg>
      ) : (
        `Sound ${enabled ? "on" : "off"}`
      )}
    </button>
  );
}
