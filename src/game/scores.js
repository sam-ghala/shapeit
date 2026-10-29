import { readJSON, writeJSON } from "./storage.js";
import { normalizeExtras } from "./extras.js";
const KEY = "shapeit:personal-scores";
export function validScore(s) {
  return (
    s &&
    typeof s.id === "string" &&
    ["daily", "training"].includes(s.mode) &&
    ["compact", "classic"].includes(s.size) &&
    ["won", "lost"].includes(s.status) &&
    Number.isFinite(s.score) &&
    s.score >= 0 &&
    s.score <= 10000 &&
    Number.isFinite(s.finishedAt)
  );
}
export function readScores() {
  const saved = readJSON(KEY, []);
  if (!Array.isArray(saved)) return [];
  const scores = saved.filter((s) => validScore(s) && !s.assisted);
  // Remove legacy assisted results, without touching unassisted personal bests.
  if (saved.some((s) => s?.assisted)) writeJSON(KEY, scores);
  return scores;
}
export function saveResult(game) {
  if (
    game.status === "playing" ||
    game.hintStep ||
    !Number.isFinite(game.finishedAt)
  )
    return;
  const result = {
    id: game.id,
    mode: game.mode,
    size: game.size,
    date: game.date,
    status: game.status,
    score: game.score ?? 0,
    seconds: Math.max(0, Math.floor((game.finishedAt - game.startedAt) / 1000)),
    queries: game.history.length,
    finishedAt: game.finishedAt,
    assisted: false,
    extras: normalizeExtras(game.extras),
  };
  if (!validScore(result)) return;
  const previous = readScores();
  if (previous.some((s) => s.id === result.id)) return;
  // Keep personal bests even after many new rounds, plus recent results.
  const all = [result, ...previous];
  const categories = new Map();
  for (const score of all) {
    const key = `${score.mode}:${score.size}`;
    if (!categories.has(key)) categories.set(key, []);
    categories.get(key).push(score);
  }
  const best = [...categories.values()].flatMap((group) =>
    group
      .filter((s) => s.status === "won")
      .sort((a, b) => b.score - a.score || a.seconds - b.seconds)
      .slice(0, 20),
  );
  const recent = all.sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 200);
  writeJSON(KEY, [
    ...new Map([...best, ...recent].map((s) => [s.id, s])).values(),
  ]);
}
export function importSavedResults() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (/^shapeit:v\d+:(daily|training):/.test(key)) {
        const game = readJSON(key, null);
        if (game && Array.isArray(game.history)) saveResult(game);
      }
    }
  } catch {}
}
export function personalBests(scores, mode, size) {
  return scores
    .filter(
      (s) =>
        s.status === "won" && s.mode === mode && s.size === size && !s.assisted,
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.seconds - b.seconds ||
        b.finishedAt - a.finishedAt,
    );
}
