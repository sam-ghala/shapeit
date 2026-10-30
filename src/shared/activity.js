import { readJSON, writeJSON } from "./storage.js";
export function queueEvent(event, profile) {
  const item = {
    game: "shapeit",
    ...event,
    profileId: profile.id,
    name: profile.name || "Player",
    at: event.at || new Date().toISOString(),
  };
  const pending = readJSON("shapeit:events", []);
  const list = Array.isArray(pending) ? pending : [];
  if (!list.some((e) => e.id === item.id))
    writeJSON("shapeit:events", [...list, item].slice(-50));
  void flushEvents();
}
let flushing = false;
export async function flushEvents() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const list = readJSON("shapeit:events", []);
    for (const item of Array.isArray(list) ? list : []) {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) break;
      const current = readJSON("shapeit:events", []);
      writeJSON(
        "shapeit:events",
        current.filter((e) => e.id !== item.id),
      );
    }
  } catch {
  } finally {
    flushing = false;
  }
}
