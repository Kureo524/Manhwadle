// Démarrage commun Electron / navigateur.
// - Electron : le preload a déjà exposé window.manhwadle.
// - Navigateur (GitHub Pages) : on charge les données par le réseau.
// Puis on charge le jeu, script par script, dans l'ordre.
(async function () {
  'use strict';
  const SCRIPTS = ['i18n.js', 'logic.js', 'sky.js', 'glass-light.js', 'online.js',
    'game/state.js', 'game/grid.js', 'game/scenario.js', 'game/app.js'];

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
    setupPwa();
  }

  // PWA : le service worker (sw.js, à la racine du site) garde le jeu en cache pour le hors-ligne.
  // Le chemin est relatif à <base href="src/">. Absent en développement local sans build du site.
  // Une nouvelle version se télécharge en arrière-plan, puis le jeu affiche le même message que l'appli de bureau.
  function setupPwa() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    const CHECK_EVERY_MS = 60 * 60e3;
    const sw = navigator.serviceWorker;
    let waiting = null;
    let restarting = false; // le joueur a demandé le redémarrage (rien à recharger à la première installation)
    let notify = null;
    const show = (worker) => {
      waiting = worker;
      notify?.({ state: 'ready' });
    };
    // Appelés par app.js, qui affiche le message et le bouton de redémarrage.
    window.manhwadle.onUpdate = (callback) => {
      notify = callback;
      if (waiting) callback({ state: 'ready' });
    };
    window.manhwadle.installUpdate = () => {
      restarting = true;
      waiting?.postMessage('skip-waiting');
    };
    sw.addEventListener('controllerchange', () => {
      if (!restarting) return;
      restarting = false;
      location.reload();
    });
    sw.register('../sw.js').then((reg) => {
      if (reg.waiting && sw.controller) show(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && sw.controller) show(worker);
        });
      });
      // Une appli installée reste souvent en mémoire : la rouvrir ne recharge pas la page.
      const check = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('online', check);
      setInterval(check, CHECK_EVERY_MS);
    }).catch(() => {});
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
