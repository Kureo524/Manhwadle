// Démarrage commun Electron / navigateur.
// - Electron : le preload a déjà exposé window.manhwadle.
// - Navigateur (GitHub Pages) : on charge les données par le réseau.
// Puis on charge le jeu, script par script, dans l'ordre.
(async function () {
  'use strict';
  const SCRIPTS = ['logic.js', 'sky.js', 'glass-light.js', 'online.js', 'app.js'];

  // Windows / macOS : cadre natif et barre de titre intégrée (voir main.js).
  const platform = window.manhwadle?.platform;
  if (platform === 'win32' || platform === 'darwin') {
    document.documentElement.classList.add('has-titlebar', platform === 'win32' ? 'is-windows' : 'is-mac');
  }

  if (!window.manhwadle) {
    document.documentElement.classList.add('is-web');
    const get = (p) => fetch(p).then((r) => {
      if (!r.ok) throw new Error(`${p} : HTTP ${r.status}`);
      return r.json();
    });
    const [manhwas, characters, credits] = await Promise.all([
      get('../data/manhwas.json'), get('../data/characters.json'), get('../data/credits.json').catch(() => ({})),
    ]);
    // Un portrait existe si sa source est notée dans credits.json (rempli à l'import).
    window.manhwadle = {
      manhwas,
      characters: characters.map((c) => ({ ...c, image: credits[c.id] ? `../assets/characters/${c.manhwa}/${c.id}.webp` : null })),
      demo: null,
    };
    // PWA : le service worker (sw.js, à la racine du site) garde le jeu en cache pour le hors-ligne.
    // Le chemin est relatif à <base href="src/">. Absent en développement local sans build du site.
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('../sw.js').catch(() => {});
    }
  }

  for (const src of SCRIPTS) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Chargement impossible : ${src}`));
      document.body.append(s);
    });
  }
})().catch((e) => {
  document.body.insertAdjacentText('beforeend', `[Erreur de chargement : ${e.message}]`);
});
