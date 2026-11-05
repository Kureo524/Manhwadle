// Service worker de la version web (PWA). Généré par tools/build-site.mjs : ne pas modifier site/sw.js.
// - Installation : tout le jeu est mis en cache (pages, scripts, données, polices, portraits).
// - Ensuite, le cache répond en premier : le jeu se lance et se joue sans réseau.
// - Chaque nouvelle version du site a son propre cache ; l'ancien est supprimé à l'activation.
// - Une nouvelle version attend : le joueur la lance depuis le jeu, sinon elle s'active quand l'appli est fermée.
// - L'API en ligne (connexion, classement) n'est jamais mise en cache.
'use strict';
const CACHE = 'manhwadle-__VERSION__';
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  // cache: 'reload' : jamais le cache HTTP, qui peut encore contenir l'ancienne version (10 min sur GitHub Pages).
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
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
    // Une navigation vers une page inconnue (ex. /index.html) ouvre le jeu.
    const known = await cache.match(req, { ignoreSearch: true });
    const hit = known ?? (req.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && req.mode !== 'navigate') cache.put(req, res.clone());
    return res;
  })().catch(() => fetch(req)));
});
