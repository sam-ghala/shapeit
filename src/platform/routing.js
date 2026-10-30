import { GAMES, PRIMARY_DOMAIN } from "../games/catalog.js";

export function resolveGame({ pathname = "/", hostname = "" } = {}) {
  const pathGame = pathname.split("/")[1];
  if (GAMES.some((game) => game.id === pathGame)) return pathGame;
  const subdomain = hostname.split(".")[0];
  return GAMES.some((game) => game.id === subdomain) ? subdomain : "shapeit";
}
export function gamePath(id, loc = globalThis.location) {
  const hostname = loc?.hostname || "";
  return hostname.split(".")[0] === id || id === "shapeit" ? "/" : `/${id}`;
}
export function gameHref(
  id,
  loc = globalThis.location,
  subdomains = import.meta.env?.VITE_GAME_SUBDOMAINS === "true",
) {
  const hostname = loc?.hostname || "";
  if (
    subdomains &&
    (hostname === PRIMARY_DOMAIN || hostname.endsWith(`.${PRIMARY_DOMAIN}`))
  )
    return `https://${id === "shapeit" ? "" : `${id}.`}${PRIMARY_DOMAIN}/`;
  // Local development and preview deployments use paths; no DNS setup needed.
  if (hostname.endsWith(`.${PRIMARY_DOMAIN}`))
    return `https://${PRIMARY_DOMAIN}${id === "shapeit" ? "/" : `/${id}`}`;
  return id === "shapeit" ? "/" : `/${id}`;
}
