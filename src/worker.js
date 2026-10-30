import { json, bearer } from "./platform/server/http.js";
export { GameService } from "./platform/server/GameService.js";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (url.pathname === "/api/log") return new Response(null, { status: 204 });
    if (!env.GAME_SERVICE)
      return json(
        { error: "Online play is not configured on this server yet." },
        503,
      );
    if (request.method !== "GET" && request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin)
      return json({ error: "Origin not allowed." }, 403);
    if (url.pathname.startsWith("/api/admin/")) {
      // Temporary test access requested by the owner; a configured secret takes precedence.
      const adminKey = env.ADMIN_KEY || "Admin";
      const hash = async (s) =>
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
        );
      const [a, b] = await Promise.all([hash(bearer(request)), hash(adminKey)]);
      let difference = 0;
      for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
      if (difference !== 0)
        return json({ error: "Invalid admin access key." }, 401);
    }
    let body;
    if (request.method === "POST") {
      if (!request.headers.get("Content-Type")?.includes("application/json"))
        return json({ error: "JSON required." }, 415);
      if (Number(request.headers.get("Content-Length")) > 65536)
        return json({ error: "Request too large." }, 413);
      const raw = await request.text();
      if (raw.length > 65536) return json({ error: "Request too large." }, 413);
      try {
        body = JSON.stringify(JSON.parse(raw));
      } catch {
        return json({ error: "Invalid JSON." }, 400);
      }
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `${new Date().toISOString().slice(0, 10)}:${request.headers.get("CF-Connecting-IP") || "local"}`,
      ),
    );
    const headers = new Headers(request.headers);
    headers.set(
      "X-Rate-Key",
      Array.from(new Uint8Array(digest))
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
    );
    const stub = env.GAME_SERVICE.get(
      env.GAME_SERVICE.idFromName("shapeit-v2"),
    );
    return stub.fetch(
      new Request(request.url, { method: request.method, headers, body }),
    );
  },
};
