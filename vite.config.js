import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";

function offlineApp() {
  return {
    name: "shapeit-offline",
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter(
        (name) => name.endsWith(".js") || name.endsWith(".css"),
      );
      const version = createHash("sha256")
        .update(assets.join("|"))
        .digest("hex")
        .slice(0, 12);
      const files = [
        "/",
        "/manifest.webmanifest",
        "/favicon.svg",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        ...assets.map((name) => "/" + name),
      ];
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `
const CACHE = 'shapeit-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('shapeit-') && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/admin') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
  } else if (FILES.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineApp()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
