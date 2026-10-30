import { readJSON, writeJSON } from "./storage.js";
import { PRIMARY_DOMAIN } from "../games/catalog.js";

// Preserve the legacy key and IDs so existing scores and room seats still belong
// to the same player. Only this public name/ID is shared between subdomains.
export const PROFILE_KEY = "shapeit:profile";
const COOKIE = "playit_profile";
function normalize(value) {
  return value &&
    /^[a-zA-Z0-9_-]{8,64}$/.test(value.id) &&
    typeof value.name === "string"
    ? {
        id: value.id,
        name:
          value.name === "Explorer"
            ? ""
            : value.name
                .trim()
                .replace(/[\u0000-\u001f\u007f]/g, "")
                .slice(0, 24),
      }
    : null;
}
function cookieDomain() {
  const hostname = globalThis.location?.hostname || "";
  return hostname === PRIMARY_DOMAIN || hostname.endsWith(`.${PRIMARY_DOMAIN}`)
    ? PRIMARY_DOMAIN
    : null;
}
function readCookie() {
  if (!cookieDomain() || typeof document === "undefined") return null;
  try {
    const value = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${COOKIE}=`));
    return value
      ? normalize(
          JSON.parse(decodeURIComponent(value.slice(COOKIE.length + 1))),
        )
      : null;
  } catch {
    return null;
  }
}
function persist(profile) {
  writeJSON(PROFILE_KEY, profile);
  const domain = cookieDomain();
  if (domain && typeof document !== "undefined") {
    try {
      document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(profile))}; Domain=${domain}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    } catch {}
  }
  return profile;
}
export function getProfile() {
  const cookie = readCookie(),
    saved = normalize(readJSON(PROFILE_KEY, null));
  return persist(
    cookie?.name
      ? cookie
      : saved?.name
        ? saved
        : cookie || saved || { id: crypto.randomUUID(), name: "" },
  );
}
export function saveProfile(value) {
  const profile = normalize(value);
  if (!profile) throw new Error("Choose a valid player name.");
  persist(profile);
  globalThis.window?.dispatchEvent(new Event("playit:profile"));
  return profile;
}
