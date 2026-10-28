let context;
export function unlockAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context ||= new Audio();
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch {}
}
export function resultSound(won, duration = 2) {
  if (!context) return () => {};
  let cancelled = false,
    oscillator,
    gain;
  const play = () => {
    if (cancelled || context.state !== "running") return;
    oscillator = context.createOscillator();
    gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(won ? 220 : 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      won ? 880 : 90,
      now + (won ? duration : 0.35),
    );
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.04);
    gain.gain.setValueAtTime(0.045, now + (won ? duration - 0.1 : 0.2));
    gain.gain.linearRampToValueAtTime(0, now + (won ? duration : 0.4));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(now + (won ? duration : 0.4));
  };
  // The first gesture can resume audio asynchronously, particularly in Safari.
  if (context.state === "running") play();
  else
    void context
      .resume()
      .then(play)
      .catch(() => {});
  return () => {
    cancelled = true;
    try {
      oscillator?.stop();
      gain?.disconnect();
    } catch {}
  };
}
