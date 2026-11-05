// Compte en ligne (facultatif) : connexion Discord, série du jour synchronisée, classement.
// Parle à l'API Cloudflare (server/). Sans connexion, le jeu reste entièrement local.
(function () {
  'use strict';
  const API = 'https://manhwadle-api.kureo.workers.dev';
  const KEY = 'manhwadle.session';

  const LOGIN_ERRORS = ['annule', 'expire', 'erreur']; // codes renvoyés par l'API (#login=…), traduits par i18n.js
  const loginCode = (c) => (LOGIN_ERRORS.includes(c) ? c : 'erreur');

  // Le jeton de session reste dans ce navigateur (ou cette appli) ; le serveur n'en garde que l'empreinte.
  const readToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const writeToken = (t) => {
    try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* ignoré */ }
  };
  const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(t);

  // Retour de connexion sur le site : #session=<jeton> ou #login=<erreur>, retiré aussitôt de l'adresse.
  let notice = null;
  let justLoggedIn = false;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('session') || params.has('login')) {
    if (validToken(params.get('session'))) { writeToken(params.get('session')); justLoggedIn = true; }
    else notice = loginCode(params.get('login'));
    history.replaceState(null, '', location.pathname + location.search);
  }

  async function call(method, path, body) {
    const token = readToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    // Session expirée ou supprimée : on oublie le jeton.
    if (res.status === 401 && token) writeToken(null);
    if (!res.ok) throw Object.assign(new Error(data.error ?? `Erreur ${res.status}`), { status: res.status, code: data.code });
    return data;
  }

  // Appli installée sur téléphone (PWA) : quitter la page vers Discord ne revient pas dans l'appli
  // (le lien s'ouvre dans le navigateur ou l'appli Discord). On ouvre donc Discord à côté, et l'appli
  // récupère la session auprès du serveur avec un code secret, dont seule l'empreinte part dans l'adresse.
  const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const POLL_MS = 2000;
  const POLL_LIMIT_MS = 10 * 60e3;
  const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  // Code préparé d'avance : window.open doit partir tout de suite après le toucher (sinon iOS le bloque).
  let nextPair = null;
  const preparePair = () => {
    if (!window.crypto?.subtle) return;
    const key = randomKey();
    sha256(key).then((hash) => { nextPair = { key, hash }; }).catch(() => {});
  };
  if (standalone()) preparePair();
  let pending = null; // connexion en cours : { url }

  async function loginByPoll(onCode) {
    const pair = nextPair ?? await (async () => { const key = randomKey(); return { key, hash: await sha256(key) }; })();
    nextPair = null;
    preparePair();
    pending = { url: `${API}/auth/discord?poll=${pair.hash}` };
    window.open(pending.url, '_blank');
    onCode?.(window.Logic.loginCode(pair.hash));
    const started = Date.now();
    try {
      while (Date.now() - started < POLL_LIMIT_MS) {
        // On attend le prochain tour, ou le retour dans l'appli (vérification immédiate).
        await new Promise((resolve) => {
          const done = () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); resolve(); };
          const onVisible = () => { if (document.visibilityState === 'visible') done(); };
          const timer = setTimeout(done, POLL_MS);
          document.addEventListener('visibilitychange', onVisible);
        });
        if (document.visibilityState !== 'visible') continue;
        let r;
        try { r = await call('POST', '/auth/poll', { poll: pair.key }); } catch { continue; } // réseau coupé : on réessaie
        if (r.pending) continue;
        if (validToken(r.session)) { writeToken(r.session); return null; }
        return loginCode(r.error);
      }
      return 'expire';
    } finally {
      pending = null;
    }
  }

  window.Online = {
    get signedIn() { return !!readToken(); },
    /** Code d'erreur de connexion à afficher une fois (retour sur le site), puis oublié. */
    takeNotice() { const n = notice; notice = null; return n; },
    /** Vrai une seule fois, juste après une connexion réussie sur le site. */
    takeJustLoggedIn() { const v = justLoggedIn; justLoggedIn = false; return v; },

    /**
     * Connexion Discord. Appli : fenêtre de connexion gérée par le processus principal,
     * renvoie un code d'erreur (annule, expire, erreur) ou null. Site : la page part vers Discord et revient avec #session=.
     * Appli installée (PWA) : Discord s'ouvre à côté, l'appli attend la session (voir loginByPoll).
     * onCode reçoit le code court à afficher, à comparer avec celui de la page de confirmation.
     */
    async login(onCode) {
      if (typeof window.manhwadle.login === 'function') {
        const r = await window.manhwadle.login();
        if (!r) return 'annule';
        if (validToken(r.session)) { writeToken(r.session); return null; }
        return loginCode(r.error);
      }
      if (standalone()) return loginByPoll(onCode);
      location.href = `${API}/auth/discord`;
      return new Promise(() => {}); // la page change
    },
    /** Rouvre la page Discord de la connexion en cours (appli installée). */
    reopenLogin() { if (pending) window.open(pending.url, '_blank'); },
    me: () => call('GET', '/me'),
    leaderboard: () => call('GET', '/leaderboard'),
    daily: () => call('GET', '/games/daily'),
    dailyGuess: (id, day) => call('POST', '/games/daily/guess', { id, day }),
    /** Image d'indice du perso du jour : adresse locale à libérer, ou null s'il n'y en a pas. */
    async dailyHint() {
      const res = await fetch(`${API}/games/daily/hint`, { headers: { Authorization: `Bearer ${readToken()}` } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      return URL.createObjectURL(await res.blob());
    },
    async logout() {
      try { await call('POST', '/auth/logout'); } finally { writeToken(null); }
    },
    async deleteAccount() {
      await call('DELETE', '/me');
      writeToken(null);
    },
  };
})();
