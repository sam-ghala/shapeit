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
export function restoreNavigation(
  { pathname, search },
  defaultSize,
  phone = false,
) {
  const saved = readTabState("shapeit:view", {});
  const size = phone
    ? "compact"
    : ["compact", "classic"].includes(saved?.size)
      ? saved.size
      : defaultSize;
  const config = saved?.config;
  const validConfig =
    config &&
    ["daily", "training"].includes(config.mode) &&
    ["compact", "classic"].includes(config.size) &&
    /^\d{4}-\d{2}-\d{2}$/.test(config.date) &&
    Number.isFinite(Date.parse(config.date));
  const room = new URLSearchParams(search).get("room");
  const screen =
    pathname === "/admin"
      ? "admin"
      : /^\d{4}$/.test(room)
        ? "duel"
        : saved?.screen === "solo" && validConfig
          ? "solo"
          : saved?.screen === "duel"
            ? "duel"
            : "menu";
  return {
    screen,
    size,
    config: validConfig
      ? { ...config, size: phone ? "compact" : config.size, timed: true }
      : null,
    dialog: ["scores", "howto", "profile"].includes(saved?.dialog)
      ? saved.dialog
      : null,
  };
}
