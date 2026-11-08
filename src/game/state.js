// État partagé de l'interface et petits outils communs. Premier script du jeu : les suivants s'y branchent par window.App.
(function () {
  'use strict';
  const { manhwas, characters } = window.manhwadle;
  const L = window.Logic;
  const I = window.I18n;
  const t = I.t;

  const SITE_URL = 'https://kureo524.github.io/Manhwadle/';
  const byId = new Map(characters.map((c) => [c.id, c]));
  const manhwaById = new Map(manhwas.map((m) => [m.id, m]));
  const $ = (id) => document.getElementById(id);

  // ---------- Stockage (try/catch : ne doit jamais bloquer le jeu) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(`manhwadle.${key}`); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(`manhwadle.${key}`, JSON.stringify(value)); } catch { /* ignoré */ } },
  };

  // Le mode démo (dev) ne doit jamais toucher aux parties ni aux stats du joueur.
  if (window.manhwadle.demo) store.set = () => {};

  const emptyStats = () => ({ played: 0, won: 0, streak: 0, best: 0, totalGuesses: 0, lastDay: null, coins: 0 });
  const storedMode = store.get('mode', 'daily');
  let storedFilters = new Set(store.get('filters', manhwas.map((m) => m.id)).filter((id) => manhwaById.has(id)));
  if (!storedFilters.size) storedFilters = new Set(manhwas.map((m) => m.id));
  // Une œuvre ajoutée après le dernier passage du joueur entre en jeu d'elle-même ; une œuvre qu'il a retirée reste retirée.
  const knownFilters = new Set(store.get('filtersKnown', ['orv', 'twatf', 'tbate', 'rein', 'sesm']));
  for (const m of manhwas) if (!knownFilters.has(m.id)) storedFilters.add(m.id);
  store.set('filtersKnown', manhwas.map((m) => m.id));
  store.set('filters', [...storedFilters]);

  // Compte en ligne (facultatif, jamais en mode démo) : le perso du jour se joue sur le serveur.
  const online = window.manhwadle.demo ? null : window.Online;
  const loginNotice = online?.takeNotice();

  const S = {
    stats: store.get('stats', { daily: emptyStats(), endless: emptyStats() }),
    // Sans compte, l'appli s'ouvre sur le mode infini, sans toucher au mode enregistré.
    mode: online?.signedIn ? storedMode : 'endless',
    enabled: storedFilters,
    novels: store.get('novels', false), // mode infini : inclure les personnages propres aux romans
    // Infini : { target, guesses: [ids], done, won }, tout est calculé ici.
    // Perso du jour : { day, guesses: [ids], results: Map(id → états), done, won, target, hint }, tout vient du serveur :
    // le jeu ne connaît pas la réponse avant la fin de la partie.
    game: null,
    dailyStatus: 'locked', // 'locked' (sans compte) | 'loading' | 'offline' (serveur injoignable) | 'ready'
    dailyGame: null,       // dernière partie du jour reçue du serveur
    dailyMsg: '',          // erreur à afficher sous la recherche
    dailyBusy: false,      // essai en cours d'envoi
    dailyHint: null,       // { key, url } image d'indice déjà chargée (url null : pas d'image pour ce scénario)
    openingDaily: storedMode === 'daily' && !!online?.signedIn,
    view: 'game',          // 'game' | 'ranking' | 'account'
    profile: null,         // profil renvoyé par l'API quand le joueur est connecté
    board: null,           // classement chargé
    boardError: null,
    accountMsg: loginNotice ? t(`login.${loginNotice}`) : '',
    loggingIn: false,
    loginCodeShown: null,  // appli installée : code à comparer avant d'ouvrir la page Discord
    confirmDelete: false,
  };

  const inEndless = (c) => S.enabled.has(c.manhwa) && (S.novels || !c.novel);
  const poolFor = (m) => (m === 'daily' ? L.dailyCharacters(characters) : characters.filter(inEndless));
  const dailyStreak = () => L.liveStreak(S.stats.daily, L.utcDayKey());

  // ---------- Éléments d'interface ----------
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const initials = (name) => name.split(/[\s,'-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  function button(cls, text, onClick) {
    const b = el('button', cls, text);
    b.addEventListener('click', onClick);
    return b;
  }

  function rows(list) {
    const dl = el('dl', 'scenario__rows');
    for (const [k, v, num] of list) {
      dl.append(el('dt', '', k));
      const dd = el('dd');
      if (num !== undefined) dd.append(el('span', 'num', num), ` ${v}`);
      else dd.textContent = v;
      dl.append(dd);
    }
    return dl;
  }

  // Difficulté d'une partie : celle du personnage. Perso du jour : annoncée par le serveur, qui garde la cible secrète.
  const gameRank = (game = S.game) => L.rankOf({ rank: game?.difficulty ?? game?.target?.rank });

  // Récompense d'une partie, selon le nombre d'essais et la difficulté du personnage.
  const reward = (n, game = S.game) => L.rewardFor(n, gameRank(game));

  window.App = {
    manhwas, characters, L, I, t, SITE_URL, byId, manhwaById, $, store, online, S,
    inEndless, poolFor, dailyStreak, el, initials, button, rows, gameRank, reward,
  };
})();
