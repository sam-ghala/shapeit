import { resolveGame } from "../platform/routing.js";
import { readJSON, writeJSON } from "./storage.js";
let context;
const listeners = new Set(),
  voices = new Set();
export const RESULT_DURATION = 2;
export const resultProgress = (seconds) =>
  1 - (1 - Math.min(1, Math.max(0, seconds / RESULT_DURATION))) ** 3;
const soundKey = () => `${resolveGame(globalThis.location)}:sound`;
export function getSoundEnabled() {
  const key = soundKey(),
    saved = readJSON(key, null);
  if (saved !== null) return saved !== false;
  const initial = readJSON("shapeit:sound", true) !== false;
  if (key !== "shapeit:sound") writeJSON(key, initial);
  return initial;
}
export const subscribeSound = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export function setSoundEnabled(value) {
  writeJSON(soundKey(), value);
  if (!value) for (const stop of [...voices]) stop();
  for (const fn of listeners) fn();
}
export async function unlockAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return null;
    context ||= new Audio();
    if (context.state === "suspended") await context.resume();
    return context.state === "running" ? context : null;
  } catch {
    return null;
  }
}
function tone(
  audio,
  frequency,
  when,
  duration = 0.08,
  volume = 0.025,
  end = frequency,
) {
  const oscillator = audio.createOscillator(),
    gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, when);
  oscillator.frequency.exponentialRampToValueAtTime(end, when + duration);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(volume, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  const cleanup = () => {
    oscillator.disconnect?.();
    gain.disconnect();
    voices.delete(stop);
  };
  const stop = () => {
    try {
      oscillator.stop();
    } catch {}
    cleanup();
  };
  voices.add(stop);
  oscillator.onended = cleanup;
  oscillator.start(when);
  oscillator.stop(when + duration + 0.01);
  return stop;
}
export function playSound(kind = "tap") {
  if (!getSoundEnabled()) return;
  const requested = performance.now();
  void unlockAudio()
    .then((audio) => {
      if (!audio || !getSoundEnabled() || performance.now() - requested > 250)
        return;
      const now = audio.currentTime;
      if (kind === "laser") tone(audio, 680, now, 0.12, 0.018, 340);
      else if (kind === "turn") {
        tone(audio, 523, now, 0.08, 0.016);
        tone(audio, 659, now + 0.09, 0.12, 0.016);
      } else if (kind === "draw") tone(audio, 440, now, 0.035, 0.012, 330);
      else if (kind === "clear") tone(audio, 280, now, 0.09, 0.014, 180);
      else tone(audio, 560, now, 0.045, 0.014);
    })
    .catch(() => {});
}
// Animation and tones start on the same clock, after Safari unlocks audio.
// A slow/failed audio unlock must never prevent the visible result appearing.
export function resultSound(
  won,
  duration = RESULT_DURATION,
  onStart = () => {},
  enabled = true,
  countUp = false,
) {
  let cancelled = false,
    started = false,
    stops = [];
  const start = (audio) => {
    if (cancelled || started) return;
    started = true;
    clearTimeout(fallback);
    const visualStart = performance.now();
    try {
      if (audio && enabled && getSoundEnabled()) {
        const now = audio.currentTime;
        if (won || countUp) {
          const notes = [392, 440, 494, 523, 587, 659, 740, 784];
          if (duration > 0)
            notes.forEach((frequency, i) => {
              const progress = i / notes.length;
              const at = duration * (1 - Math.cbrt(1 - progress));
              stops.push(tone(audio, frequency, now + at, 0.09, 0.022));
            });
          if (won)
            [523.25, 659.25, 783.99].forEach((frequency) =>
              stops.push(tone(audio, frequency, now + duration, 0.24, 0.018)),
            );
        }
        if (!won) {
          const end = now + (countUp ? duration : 0);
          stops.push(tone(audio, 294, end, 0.14, 0.028, 261));
          stops.push(tone(audio, 196, end + 0.16, 0.24, 0.024, 164));
        }
      }
    } catch {
      stops.forEach((stop) => stop());
    }
    // The same start instant drives the meter. Wall time also advances in a
    // background tab where AudioContext or requestAnimationFrame may pause.
    onStart(() => (performance.now() - visualStart) / 1000);
  };
  const fallback = setTimeout(() => start(null), 200);
  if (!enabled || !getSoundEnabled()) start(null);
  else void unlockAudio().then(start);
  return () => {
    cancelled = true;
    clearTimeout(fallback);
    stops.forEach((stop) => stop());
  };
}
