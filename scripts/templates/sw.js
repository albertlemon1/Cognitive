// Service worker de Barra Sepia (generado por scripts/build.mjs; no editar en netlify/).
// Caché primero con actualización en segundo plano: el juego funciona sin conexión.

const CACHE = "barra-sepia-__VERSION__";
const PRECACHE = __PRECACHE__;
const CDN = __CDN__;
const CDN_HOSTS = ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      // Phaser desde el CDN: mejor esfuerzo (respuesta opaca).
      await Promise.all(
        CDN.map(async (url) => {
          try {
            const res = await fetch(url, { mode: "no-cors" });
            await cache.put(url, res);
          } catch {
            // Se intentará de nuevo en la próxima visita.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("barra-sepia-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = req.mode === "navigate" ? "./" : req;
      const hit = await cache.match(key, { ignoreSearch: req.mode === "navigate" });
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(key, res.clone());
          return res;
        })
        .catch(() => hit);
      if (hit) {
        event.waitUntil(network.catch(() => undefined));
        return hit;
      }
      return network;
    })(),
  );
});
