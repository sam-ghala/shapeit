// Per-tab navigation: refreshing resumes this view without moving other tabs.
// A second duel player still needs a separate browser identity.
export function readTabState(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeTabState(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
