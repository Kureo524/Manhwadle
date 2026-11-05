// Service worker de la version web (PWA). Généré par tools/build-site.mjs : ne pas modifier site/sw.js.
// - Installation : tout le jeu est mis en cache (pages, scripts, données, polices, portraits).
// - Ensuite, le cache répond en premier : le jeu se lance et se joue sans réseau.
// - Chaque nouvelle version du site a son propre cache ; l'ancien est supprimé à l'activation.
// - L'API en ligne (connexion, classement) n'est jamais mise en cache.
'use strict';
const CACHE = 'manhwadle-__VERSION__';
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('manhwadle-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Toute navigation dans le site ouvre la page du jeu (ex. retour de Discord avec #session=…).
    const hit = req.mode === 'navigate' ? await cache.match('./') : await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && req.mode !== 'navigate') cache.put(req, res.clone());
    return res;
  })().catch(() => fetch(req)));
});
