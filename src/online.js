// Compte en ligne (facultatif) : connexion Discord, série du jour synchronisée, classement.
// Parle à l'API Cloudflare (server/). Sans connexion, le jeu reste entièrement local.
(function () {
  'use strict';
  const API = 'https://manhwadle-api.kureo.workers.dev';
  const KEY = 'manhwadle.session';

  const LOGIN_ERRORS = {
    annule: 'Connexion annulée.',
    expire: 'La demande de connexion a expiré. Réessaie.',
    erreur: 'Discord n\'a pas pu confirmer la connexion. Réessaie.',
  };

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
    else notice = LOGIN_ERRORS[params.get('login')] ?? LOGIN_ERRORS.erreur;
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
    if (!res.ok) throw Object.assign(new Error(data.error ?? `Erreur ${res.status}`), { status: res.status });
    return data;
  }

  window.Online = {
    get signedIn() { return !!readToken(); },
    /** Message à afficher une fois (retour de connexion), puis oublié. */
    takeNotice() { const n = notice; notice = null; return n; },
    /** Vrai une seule fois, juste après une connexion réussie sur le site. */
    takeJustLoggedIn() { const v = justLoggedIn; justLoggedIn = false; return v; },

    /**
     * Connexion Discord. Appli : fenêtre de connexion gérée par le processus principal,
     * renvoie un message d'erreur ou null. Site : la page part vers Discord et revient avec #session=.
     */
    async login() {
      if (typeof window.manhwadle.login === 'function') {
        const r = await window.manhwadle.login();
        if (!r) return LOGIN_ERRORS.annule;
        if (validToken(r.session)) { writeToken(r.session); return null; }
        return LOGIN_ERRORS[r.error] ?? LOGIN_ERRORS.erreur;
      }
      location.href = `${API}/auth/discord`;
      return new Promise(() => {}); // la page change
    },
    me: () => call('GET', '/me'),
    leaderboard: () => call('GET', '/leaderboard'),
    submitDaily: (day, guesses) => call('POST', '/games/daily', { day, guesses }),
    async logout() {
      try { await call('POST', '/auth/logout'); } finally { writeToken(null); }
    },
    async deleteAccount() {
      await call('DELETE', '/me');
      writeToken(null);
    },
  };
})();
