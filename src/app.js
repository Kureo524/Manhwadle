// Interface du jeu : modes, saisie, tableau des essais, indices et statistiques.
(function () {
  'use strict';
  const { manhwas, characters } = window.manhwadle;
  const L = window.Logic;

  const SITE_URL = 'https://kureo524.github.io/Manhwadle/';
  const HINT_AT = 6;        // essais avant l'indice (portrait flouté)
  const HINT_CLEAR_AT = 10; // essais avant un flou plus léger
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
  let stats = store.get('stats', { daily: emptyStats(), endless: emptyStats() });
  let mode = store.get('mode', 'daily');
  let enabled = new Set(store.get('filters', manhwas.map((m) => m.id)).filter((id) => manhwaById.has(id)));
  if (!enabled.size) enabled = new Set(manhwas.map((m) => m.id));

  let game = null; // { target, guesses: [ids], done, won, day? }

  // Compte en ligne (facultatif, jamais en mode démo) : la série du jour est vérifiée et gardée par le serveur.
  const online = window.manhwadle.demo ? null : window.Online;
  let view = 'game';      // 'game' | 'ranking' | 'account'
  let profile = null;     // profil renvoyé par l'API quand le joueur est connecté
  let board = null;       // classement chargé
  let boardError = null;
  let accountMsg = online?.takeNotice() ?? '';
  let loggingIn = false;
  let confirmDelete = false;

  const poolFor = (m) => (m === 'daily' ? characters : characters.filter((c) => enabled.has(c.manhwa)));

  // Copie dans le presse-papiers (API moderne, sinon sélection + copie).
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* repli */ }
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }

  const dailyStreak = () => L.liveStreak(stats.daily);

  // ---------- Parties ----------
  function loadGame() {
    if (mode === 'daily') {
      const day = L.dayKey();
      const target = L.dailyCharacter(characters, day);
      const saved = store.get(`daily.${day}`, null);
      game = { day, target, guesses: saved?.guesses?.filter((id) => byId.has(id)) ?? [], done: !!saved?.done, won: !!saved?.won };
    } else {
      const saved = store.get('endless.current', null);
      const target = saved && byId.get(saved.target);
      if (target && enabled.has(target.manhwa)) {
        game = { target, guesses: saved.guesses.filter((id) => byId.has(id)), done: saved.done, won: saved.won };
      } else newEndlessGame();
    }
  }

  function newEndlessGame() {
    const pool = poolFor('endless');
    const previous = game?.target?.id;
    let target = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1) while (target.id === previous) target = pool[Math.floor(Math.random() * pool.length)];
    game = { target, guesses: [], done: false, won: false };
    saveGame();
  }

  function saveGame() {
    const data = { guesses: game.guesses, done: game.done, won: game.won };
    if (mode === 'daily') store.set(`daily.${game.day}`, data);
    else store.set('endless.current', { ...data, target: game.target.id });
  }

  function finish(won) {
    game.done = true;
    game.won = won;
    const s = stats[mode];
    s.played++;
    if (won) {
      s.won++;
      s.coins = (s.coins ?? 0) + reward(game.guesses.length);
      s.totalGuesses += game.guesses.length;
      // En mode « jour », la série casse si un jour a été sauté.
      const yesterday = L.dayKey(new Date(Date.now() - 864e5));
      s.streak = mode === 'daily' && s.lastDay !== yesterday ? 1 : s.streak + 1;
      s.best = Math.max(s.best, s.streak);
    } else s.streak = 0;
    if (mode === 'daily') s.lastDay = game.day;
    store.set('stats', stats);
    saveGame();
    if (mode === 'daily' && online?.signedIn) syncAccount();
  }

  // ---------- Synchronisation avec le serveur ----------
  // Le serveur fait foi pour la série du jour : ses statistiques remplacent celles de l'appareil
  // (les pièces restent locales).
  function applyProfile(p) {
    profile = p;
    stats.daily = {
      ...stats.daily, played: p.played, won: p.won, streak: p.streak, best: p.best, totalGuesses: p.guesses, lastDay: p.lastDay,
    };
    store.set('stats', stats);
  }

  // Envoie les scénarios du jour terminés sur cet appareil (hier, aujourd'hui) que le serveur n'a pas encore.
  async function pushDailyGames() {
    for (const day of [L.dayKey(new Date(Date.now() - 864e5)), L.dayKey()]) {
      if (profile.lastDay && day <= profile.lastDay) continue;
      const saved = store.get(`daily.${day}`, null);
      if (!saved?.done || !saved.guesses?.length) continue;
      try {
        applyProfile(await online.submitDaily(day, saved.guesses));
      } catch (e) {
        // 409 : déjà joué ailleurs ; 400 : scénario refusé (trop ancien…). Le reste est réessayé plus tard.
        if (e.status !== 409 && e.status !== 400) throw e;
      }
    }
  }

  async function syncAccount() {
    if (!online?.signedIn) { profile = null; render(); return; }
    try {
      applyProfile(await online.me());
      await pushDailyGames();
    } catch (e) {
      if (e.status === 401) { profile = null; accountMsg = 'Session expirée : reconnecte-toi.'; }
      else if (!profile) accountMsg = 'Serveur injoignable : la série reste sur cet appareil pour l\'instant.';
    }
    render();
    if (view === 'ranking') loadBoard();
  }

  async function loadBoard() {
    if (!online) return;
    try {
      board = (await online.leaderboard()).players;
      boardError = null;
    } catch {
      boardError = 'Classement injoignable pour l\'instant.';
    }
    renderView();
  }

  async function login() {
    // Déjà en cours : on ramène la fenêtre Discord au premier plan (appli).
    if (loggingIn) { window.manhwadle.login?.(); return; }
    loggingIn = true;
    accountMsg = typeof window.manhwadle.login === 'function'
      ? 'Connexion dans la fenêtre Discord… (Échap pour la fermer)' : 'Connexion à Discord…';
    view = 'account';
    render();
    const error = await online.login();
    loggingIn = false;
    accountMsg = error ?? '';
    if (error) { renderAccount(); renderView(); return; }
    setView('account');
    await syncAccount();
  }

  async function logout() {
    await online.logout().catch(() => {});
    profile = null;
    accountMsg = 'Déconnecté. Ta série reste sur cet appareil.';
    render();
  }

  async function deleteAccount() {
    if (!confirmDelete) { confirmDelete = true; renderView(); return; }
    confirmDelete = false;
    try {
      await online.deleteAccount();
      profile = null;
      accountMsg = 'Compte supprimé : toutes tes données en ligne ont été effacées.';
    } catch (e) {
      accountMsg = `Suppression impossible : ${e.message}`;
    }
    render();
    loadBoard();
  }

  function setView(v) {
    view = v;
    confirmDelete = false;
    if (v === 'ranking') loadBoard();
    render();
    if (v === 'game') $('search').focus();
  }

  function submitGuess(id) {
    if (game.done || game.guesses.includes(id)) return;
    game.guesses.push(id);
    const won = id === game.target.id;
    if (won) finish(true); else saveGame();
    closeSuggestions();
    $('search').value = '';
    render({ animateFirst: true });
  }

  // ---------- Rendu ----------
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const initials = (name) => name.split(/[\s,'-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  function portrait(c, size = '') {
    const p = el('div', `portrait ${size ? `portrait--${size}` : ''}`);
    if (c.image) {
      const img = el('img');
      img.src = c.image; img.alt = ''; img.loading = size === 'lg' || size === 'xl' ? 'eager' : 'lazy'; img.draggable = false;
      p.append(img);
    } else p.append(el('span', 'portrait__mono', initials(c.name)));
    return p;
  }

  const ARROW = {
    up: '<svg class="cell__arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M4 7l4-4 4 4"/></svg>',
    down: '<svg class="cell__arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M4 9l4 4 4-4"/></svg>',
  };

  function cell(result) {
    const c = el('div', `cell cell--${result.state}`);
    const v = result.value;
    if (result.key === 'manhwa') c.append(el('span', 'cell__line', manhwaById.get(v)?.short ?? v));
    else if (result.key === 'chapter') {
      c.append(el('span', 'cell__num', v ?? '?'));
      if (result.dir) c.insertAdjacentHTML('beforeend', ARROW[result.dir]);
      c.title = result.dir === 'up' ? 'Apparaît plus tard' : result.dir === 'down' ? 'Apparaît plus tôt' : '';
    } else if (Array.isArray(v)) v.forEach((x) => c.append(el('span', 'cell__line', x)));
    else c.append(el('span', 'cell__line', v));
    return c;
  }

  function renderGrid(animateFirst) {
    const grid = $('grid');
    grid.replaceChildren();
    grid.append(el('div', 'grid__head', 'Personnage'));
    for (const col of L.COLUMNS) grid.append(el('div', 'grid__head', col.label));

    if (!game.guesses.length) {
      const empty = el('div', 'grid__empty');
      empty.append(el('span', '', 'Aucune incarnation nommée pour l\'instant.'));
      grid.append(empty);
      return;
    }

    [...game.guesses].reverse().forEach((id, row) => {
      const c = byId.get(id);
      const who = el('div', 'who');
      who.append(portrait(c));
      const txt = el('div');
      txt.append(el('div', 'who__name', c.name), el('div', 'who__manhwa', manhwaById.get(c.manhwa).title));
      who.append(txt);
      const cells = [who, ...L.compare(c, game.target).map(cell)];
      cells.forEach((node, i) => {
        if (row === 0 && animateFirst) { node.classList.add('reveal'); node.style.animationDelay = `${i * 70}ms`; }
        grid.append(node);
      });
    });
  }

  // ---------- Ambiance ORV : scénario, récompense, constellations ----------
  const REWARD_MAX = 1000;
  const reward = (n) => Math.max(100, REWARD_MAX - 100 * Math.max(0, n - 1));
  const DIFFICULTY = ['F', 'D', 'C', 'B', 'A', 'S'];

  // Constellations inventées pour le jeu (modificateurs à la façon d'ORV).
  const CONSTELLATIONS = [
    'Lectrice des dernières pages', 'Démon aux mille masques', 'Prisonnier de la tour sans fin',
    'Juge des braises', 'Gardien des histoires oubliées', 'Conteur sans nom', 'Épéiste qui compte les étoiles',
  ];
  const pickOf = (list, seed) => list[L.hash(seed) % list.length];

  function reaction(guessId, index) {
    const r = L.compare(byId.get(guessId), game.target);
    const ok = r.filter((x) => x.state === 'ok').length;
    const sameStory = r[0].state === 'ok';
    const who = pickOf(CONSTELLATIONS, `${game.target.id}:${index}`);
    const seed = `${guessId}:${index}`;
    if (guessId === game.target.id) return ['Toutes les constellations applaudissent.', null];
    if (ok >= 7) return [pickOf(['retient son souffle.', 'se penche vers l\'écran.', 'murmure que vous y êtes presque.'], seed), who];
    if (sameStory && ok >= 4) return [pickOf(['a reconnu cette histoire.', 'hoche lentement la tête.'], seed), who];
    if (ok >= 4) return [pickOf(['s\'intéresse à votre choix.', 'vous fait signe de continuer.'], seed), who];
    if (ok >= 2) return [pickOf(['penche la tête, perplexe.', 'feuillette un autre chapitre.'], seed), who];
    return [pickOf(['bâille.', 'détourne le regard.', 'trouve ce choix audacieux.'], seed), who];
  }

  function renderFeed(animate) {
    const box = $('feed');
    box.replaceChildren();
    const lines = game.guesses.map((id, i) => reaction(id, i));
    const live = dailyStreak();
    const playedElsewhere = mode === 'daily' && !game.done && profile?.lastDay && profile.lastDay >= game.day;
    if (mode === 'daily' && !game.done && !game.guesses.length && live && !playedElsewhere) {
      lines.push([`Votre série de ${live} jour${live > 1 ? 's' : ''} est en jeu. Le scénario se termine à minuit.`, null]);
    }
    if (playedElsewhere) {
      lines.push(['Ce scénario a déjà été joué depuis un autre appareil : cette partie ne changera pas votre série.', null]);
    }
    if (game.done && !game.won) lines.push(['Les constellations sont déçues.', null]);
    if (game.done && game.won) lines.push([`${reward(game.guesses.length)} pièces ont été sponsorisées.`, null]);
    if (game.done && mode === 'daily') {
      const s = stats.daily;
      if (game.won && s.streak > 1 && s.streak === s.best) lines.push([`Nouveau record : ${s.streak} jours consécutifs.`, null]);
      else if (game.won) lines.push([`Série : ${s.streak} jour${s.streak > 1 ? 's' : ''}.`, null]);
      else lines.push(['La série est rompue.', null]);
    }
    lines.slice(-3).reverse().forEach(([text, who], i) => {
      const msg = el('div', `feed__msg ${i === 0 && animate ? 'is-new' : ''}`);
      if (who) {
        msg.append('[La constellation ', Object.assign(el('em'), { textContent: `« ${who} »` }), ` ${text}]`);
      } else msg.textContent = `[${text}]`;
      box.append(msg);
    });
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

  // Ligne « Série » de la fenêtre de scénario (mode jour).
  function streakRow() {
    const live = dailyStreak();
    const best = stats.daily.best;
    const days = (k) => `jour${k > 1 ? 's' : ''}`;
    if (!live) return ['Série', best ? `aucune en cours · record ${best} ${days(best)}` : 'aucune en cours'];
    return ['Série', `${days(live)} consécutif${live > 1 ? 's' : ''} · record ${best}`, live];
  }

  function renderScenario() {
    const box = $('scenario');
    box.replaceChildren();
    const n = game.guesses.length;
    const pool = poolFor(mode);
    const main = el('div');
    const side = el('div', 'scenario__side');

    if (game.done) {
      const t = game.target;
      main.append(el('h2', 'scenario__title', game.won ? '[Le scénario principal est terminé.]' : '[Échec du scénario.]'));
      const res = el('div', 'result');
      const txt = el('div');
      txt.append(el('div', 'result__name', t.name), el('div', 'result__manhwa', manhwaById.get(t.manhwa).title));
      res.append(txt);
      main.append(res);
      main.append(rows([
        ['Essais', '', n],
        ['Récompense', game.won ? 'pièces' : 'aucune', game.won ? reward(n) : undefined],
        ...(mode === 'daily' ? [streakRow(), ['Prochain scénario', `dans ${untilMidnight()}`]] : []),
      ]));
      const actions = el('div', 'scenario__actions');
      const share = el('button', 'link link--strong', '[Partager le résultat]');
      share.addEventListener('click', async () => {
        // Appli de bureau : image de la zone de jeu. Navigateur : texte (une page ne peut pas se capturer).
        if (typeof window.manhwadle.shareImage === 'function') {
          closeSuggestions();
          share.textContent = (await window.manhwadle.shareImage()) ? '[Image copiée.]' : '[Copie impossible.]';
          setTimeout(() => { share.textContent = '[Partager le résultat]'; }, 1800);
          return;
        }
        const text = L.shareText({
          daily: mode === 'daily', day: game.day, won: game.won, streak: dailyStreak(), url: SITE_URL,
          rows: game.guesses.map((id) => L.compare(byId.get(id), game.target).map((r) => r.state)),
        });
        share.textContent = (await copyText(text)) ? '[Résultat copié.]' : '[Copie impossible.]';
        setTimeout(() => { share.textContent = '[Partager le résultat]'; }, 1800);
      });
      actions.append(share);
      if (mode === 'endless') {
        const again = el('button', 'link link--strong', '[Scénario suivant]');
        again.addEventListener('click', () => { newEndlessGame(); render(); $('search').focus(); });
        actions.append(again);
      }
      main.append(actions);
      side.append(portrait(t, 'lg'));
    } else {
      const level = mode === 'daily' ? 'A' : DIFFICULTY[Math.min(enabled.size, DIFFICULTY.length - 1)];
      main.append(el('h2', 'scenario__title', mode === 'daily' ? '[Scénario principal — Le personnage du jour]' : '[Scénario secondaire — Incarnation inconnue]'));
      main.append(rows([
        ['Catégorie', mode === 'daily' ? 'Principal' : 'Secondaire'],
        ['Difficulté', level],
        ['Condition de réussite', `Identifier le personnage mystère parmi ${pool.length} incarnations.`],
        ['Temps limite', mode === 'daily' ? `${untilMidnight()} (minuit)` : 'Aucun'],
        ['Récompense', 'pièces', reward(n + 1)],
        ...(mode === 'daily' ? [streakRow()] : []),
        ['Échec', mode === 'daily' ? '???' : 'Abandon'],
      ]));
      if (n >= HINT_AT) {
        const p = portrait(game.target, 'lg');
        p.classList.add('hint__img');
        p.style.setProperty('--blur', n >= HINT_CLEAR_AT ? '6px' : '14px');
        side.append(p, el('div', 'scenario__note system', n >= HINT_CLEAR_AT ? '[Indice : silhouette presque nette.]' : `[Indice : silhouette floue. Plus nette à ${HINT_CLEAR_AT} essais.]`));
      } else {
        const left = HINT_AT - n;
        side.append(el('div', 'hint__locked', left), el('div', 'scenario__note system', `[Indice dans ${left} essai${left > 1 ? 's' : ''}.]`));
      }
    }
    box.append(main, side);
  }

  function untilMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const m = Math.ceil((next - now) / 60000);
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  }

  function renderStats() {
    const s = stats[mode];
    const items = [
      ['Scénarios', s.played],
      ['Réussis', s.played ? `${Math.round((s.won / s.played) * 100)} %` : '–'],
      ['Série', mode === 'daily' ? dailyStreak() : s.streak],
      ['Record', s.best],
      ['Essais moyens', s.won ? (s.totalGuesses / s.won).toFixed(1).replace('.', ',') : '–'],
      ['Pièces', (s.coins ?? 0).toLocaleString('fr-FR')],
    ];
    $('stats').replaceChildren(...items.map(([label, value]) => {
      const d = el('span', '', `[${label}`);
      d.append(el('b', '', value), ']');
      return d;
    }));
  }

  function renderFilters() {
    const box = $('filters');
    box.hidden = mode !== 'endless';
    box.replaceChildren();
    for (const m of manhwas) {
      const count = characters.filter((c) => c.manhwa === m.id).length;
      const chip = el('button', `filter ${enabled.has(m.id) ? 'is-on' : ''}`, `${m.short.replace(/\.$/, '')} · ${count}`);
      chip.title = `${m.title} — ${enabled.has(m.id) ? 'retirer de la partie' : 'ajouter à la partie'}`;
      chip.addEventListener('click', () => {
        if (enabled.has(m.id)) { if (enabled.size === 1) return; enabled.delete(m.id); } else enabled.add(m.id);
        store.set('filters', [...enabled]);
        // Changer les manhwa en jeu relance une partie si la cible n'est plus dans la sélection.
        if (!enabled.has(game.target.manhwa) || !game.guesses.length || game.done) newEndlessGame();
        render();
      });
      box.append(chip);
    }
  }

  // ---------- Compte et classement ----------
  function avatar(p, size) {
    const box = el('span', `avatar avatar--${size}`);
    if (typeof p.avatar === 'string' && p.avatar.startsWith('https://cdn.discordapp.com/')) {
      const img = el('img');
      img.src = p.avatar; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.draggable = false;
      box.append(img);
    } else box.textContent = initials(p.name) || '?';
    return box;
  }

  // En-tête : avatar et pseudo une fois connecté, sinon un lien de connexion.
  function renderAccount() {
    const box = $('account');
    box.replaceChildren();
    if (!online) return;
    if (profile) {
      const me = el('button', 'account__me');
      me.title = 'Mon compte';
      me.append(avatar(profile, 'sm'), el('span', 'account__name', profile.name));
      me.addEventListener('click', () => setView('account'));
      box.append(me);
    } else if (online.signedIn) {
      box.append(el('span', 'account__wait', '[Connexion…]'));
    } else {
      const b = el('button', 'link', loggingIn ? '[Connexion…]' : '[Se connecter]');
      b.title = 'Se connecter avec Discord : série synchronisée et classement';
      b.addEventListener('click', login);
      box.append(b);
    }
  }

  function boardRow(cells, cls = '') {
    const row = el('div', `board__row ${cls}`);
    row.append(...cells);
    return row;
  }

  function renderBoard() {
    const wrap = el('div', 'board');
    if (boardError) { wrap.append(el('p', 'board__empty system', `[${boardError}]`)); return wrap; }
    if (!board) { wrap.append(el('p', 'board__empty system', '[Chargement du classement…]')); return wrap; }
    if (!board.length) {
      wrap.append(el('p', 'board__empty system', '[Aucune incarnation classée pour l\'instant. Réussis le perso du jour pour ouvrir le classement.]'));
      return wrap;
    }
    wrap.append(boardRow(['#', 'Incarnation', 'Record', 'Série', 'Réussis', 'Essais moyens'].map((t) => el('span', 'board__head', t)), 'board__row--head'));
    board.forEach((p, i) => {
      const who = el('span', 'board__who');
      who.append(avatar(p, 'sm'), el('span', 'board__name', p.name));
      const num = (v) => el('span', 'board__num', v);
      wrap.append(boardRow([
        el('span', `board__rank ${i < 3 ? `board__rank--${i + 1}` : ''}`, i + 1),
        who,
        num(p.best),
        num(p.streak),
        num(`${p.won}/${p.played}`),
        num(p.won ? (p.guesses / p.won).toFixed(1).replace('.', ',') : '–'),
      ], profile?.id === p.id ? 'is-me' : ''));
    });
    return wrap;
  }

  const NOTE = 'Données gardées sur le serveur : ton identifiant, ton pseudo et ton avatar Discord, et pour chaque perso du jour '
    + 'la date, le nombre d\'essais et la réussite. Rien d\'autre n\'est lu sur ton compte Discord. '
    + 'Supprimer le compte efface tout, définitivement.';

  function panel(title, ...children) {
    const box = el('div', 'panel');
    box.append(el('h2', 'scenario__title', title), ...children);
    return box;
  }

  function actionsOf(...buttons) {
    const box = el('div', 'panel__actions');
    box.append(...buttons);
    return box;
  }

  function button(cls, text, onClick) {
    const b = el('button', cls, text);
    b.addEventListener('click', onClick);
    return b;
  }

  // Onglet « Compte » : connexion Discord, ou fiche du joueur connecté.
  function accountView() {
    const msg = accountMsg ? [el('p', 'panel__msg system', `[${accountMsg}]`)] : [];
    const note = el('p', 'panel__note', NOTE);
    if (profile) {
      const who = el('div', 'panel__who');
      const txt = el('div');
      txt.append(el('div', 'panel__name', profile.name), el('div', 'panel__sub', 'Connecté avec Discord · série synchronisée entre le site et l\'appli'));
      who.append(avatar(profile, 'md'), txt);
      const days = (k) => `jour${k > 1 ? 's' : ''}`;
      return panel('[Fiche de l\'incarnation]', who, rows([
        ['Série en cours', days(profile.streak), profile.streak],
        ['Record', days(profile.best), profile.best],
        ['Scénarios réussis', `sur ${profile.played}`, profile.won],
        ['Essais moyens', profile.won ? (profile.guesses / profile.won).toFixed(1).replace('.', ',') : '–'],
        ['Dernier scénario', profile.lastDay ? `n° ${L.dayNumber(profile.lastDay)} (${profile.lastDay.split('-').reverse().join('/')})` : 'aucun'],
      ]), actionsOf(
        button('link link--strong', '[Se déconnecter]', logout),
        button('link link--danger', confirmDelete ? '[Confirmer : tout supprimer]' : '[Supprimer mon compte]', deleteAccount),
      ), ...msg, note);
    }
    if (online.signedIn) return panel('[Connexion à la Star Stream]', el('p', 'panel__text', 'Connexion au serveur…'), ...msg);
    return panel('[Connexion à la Star Stream]',
      el('p', 'panel__text', 'Connecte-toi avec Discord : ta série du perso du jour est vérifiée par le serveur, '
        + 'retrouvée sur le site comme dans l\'appli, et inscrite au classement. Sans compte, tout reste sur cet appareil.'),
      actionsOf(
        button('link link--strong', loggingIn ? '[Connexion…]' : '[Se connecter avec Discord]', login),
        // Appli : la fenêtre Discord peut se retrouver derrière le jeu ; on peut l'annuler d'ici.
        ...(loggingIn && typeof window.manhwadle.cancelLogin === 'function'
          ? [button('link', '[Annuler]', () => window.manhwadle.cancelLogin())] : []),
      ),
      ...msg, note);
  }

  function rankingView() {
    const parts = [
      el('p', 'panel__text', 'Meilleures séries de scénarios principaux réussis. Chaque partie est vérifiée par le serveur.'),
      renderBoard(),
    ];
    if (!profile && !online.signedIn) {
      parts.push(actionsOf(button('link', '[Se connecter pour apparaître au classement]', () => setView('account'))));
    }
    return panel('[Classement des incarnations — Perso du jour]', ...parts);
  }

  function renderView() {
    const box = $('view');
    box.hidden = view === 'game';
    if (box.hidden) return;
    box.replaceChildren(view === 'ranking' ? rankingView() : accountView());
  }

  function renderMode() {
    const nav = $('mode');
    const items = [...nav.querySelectorAll('.tabs__item')];
    nav.querySelectorAll('[data-view]').forEach((b) => { b.hidden = !online; });
    items.forEach((b) => b.classList.toggle('is-active', view === 'game' ? b.dataset.mode === mode : b.dataset.view === view));
    const active = items.find((b) => b.classList.contains('is-active'));
    document.querySelector('.app').classList.toggle('is-view', view !== 'game');
    const line = nav.querySelector('.tabs__line');
    line.style.left = `${active.offsetLeft + 10}px`;
    line.style.width = `${active.offsetWidth - 20}px`;
    const pool = poolFor(mode);
    const tracked = new Set(pool.map((c) => c.manhwa)).size;
    $('pool-info').textContent = `[${pool.length} incarnations · ${tracked} histoires]`;
  }

  function render({ animateFirst = false } = {}) {
    renderMode();
    renderAccount();
    renderView();
    renderFilters();
    renderScenario();
    renderFeed(animateFirst);
    renderGrid(animateFirst);
    renderStats();
    const input = $('search');
    input.disabled = game.done;
    input.placeholder = game.done ? (mode === 'daily' ? 'Le prochain scénario commence à minuit.' : 'Scénario terminé.') : 'Nomme une incarnation…  (@ORV pour lister un manhwa)';
    $('give-up').hidden = mode !== 'endless' || game.done;
  }

  // ---------- Suggestions ----------
  // Éléments : { char } (un personnage) ou { manhwa } (choix de filtre après « @ »).
  let suggestionList = [];
  let active = 0;

  function closeSuggestions() { $('suggestions').hidden = true; suggestionList = []; }

  function pick(item) {
    if (!item) return;
    if (item.char) return submitGuess(item.char.id);
    const input = $('search');
    input.value = `@${item.manhwa.short.replace(/\.$/, '')} `;
    active = 0;
    openSuggestions();
  }

  function openSuggestions() {
    const input = $('search');
    const box = $('suggestions');
    if (!input.value.trim() || game.done) return closeSuggestions();
    const pool = poolFor(mode);
    const guessed = new Set(game.guesses);
    const inPool = manhwas.filter((m) => pool.some((c) => c.manhwa === m.id));
    const q = L.parseQuery(input.value, inPool);
    let header = null;
    if (q.choices) {
      suggestionList = q.choices.map((m) => ({ manhwa: m }));
      header = 'Filtrer par manhwa';
    } else {
      const chars = L.search(pool, q.text, guessed, q.manhwa ? Infinity : 8, q.manhwa?.id ?? null);
      suggestionList = chars.map((c) => ({ char: c }));
      if (q.manhwa) header = `${q.manhwa.title} · ${chars.length} personnage${chars.length > 1 ? 's' : ''}`;
    }
    active = Math.min(active, Math.max(suggestionList.length - 1, 0));
    box.replaceChildren();
    const list = el('div', 'suggestions__list');
    box.append(list);
    if (header) list.append(el('div', 'suggestions__header system', `[${header}]`));
    if (!suggestionList.length) list.append(el('div', 'suggestions__empty', q.choices ? 'Aucun manhwa ne correspond.' : 'Aucun personnage ne correspond.'));
    suggestionList.forEach((item, i) => {
      const b = el('button', `suggestion ${i === active ? 'is-active' : ''}`);
      b.setAttribute('role', 'option');
      if (item.char) {
        const c = item.char;
        const txt = el('span', 'suggestion__text');
        txt.append(el('span', 'suggestion__name', c.name), el('span', 'suggestion__sub', manhwaById.get(c.manhwa).title));
        b.append(portrait(c, 'md'), txt);
      } else {
        const m = item.manhwa;
        const left = pool.filter((c) => c.manhwa === m.id && !guessed.has(c.id)).length;
        b.append(el('span', 'suggestion__tag', `@${m.short.replace(/\.$/, '')}`), el('span', 'suggestion__name', m.title), el('span', 'suggestion__meta', `${left} persos`));
      }
      b.addEventListener('mousedown', (e) => { e.preventDefault(); pick(item); });
      b.addEventListener('mouseenter', () => { active = i; highlight(); });
      list.append(b);
    });
    // Grand aperçu du personnage surligné, à droite de la liste.
    if (suggestionList.some((x) => x.char)) box.append(el('div', 'suggestions__preview'));
    renderPreview();
    const r = input.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.bottom + 6}px`, width: `${r.width}px` });
    box.hidden = false;
  }

  function renderPreview() {
    const box = $('suggestions').querySelector('.suggestions__preview');
    const c = suggestionList[active]?.char;
    if (!box) return;
    box.replaceChildren();
    if (!c) return;
    box.append(portrait(c, 'xl'), el('div', 'preview__name', c.name), el('div', 'preview__manhwa', manhwaById.get(c.manhwa).title));
  }

  function highlight() {
    [...$('suggestions').querySelectorAll('.suggestion')].forEach((b, i) => {
      b.classList.toggle('is-active', i === active);
      if (i === active) b.scrollIntoView({ block: 'nearest' });
    });
    renderPreview();
  }

  // ---------- Événements ----------
  const input = $('search');
  input.addEventListener('input', () => { active = 0; openSuggestions(); });
  input.addEventListener('focus', openSuggestions);
  // Changer de fenêtre ne ferme pas la liste ; cliquer ailleurs dans l'appli, si.
  input.addEventListener('blur', () => setTimeout(() => { if (document.hasFocus()) closeSuggestions(); }, 80));
  input.addEventListener('keydown', (e) => {
    const n = suggestionList.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); active = (active + 1) % n; highlight(); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); active = (active - 1 + n) % n; highlight(); }
    else if (e.key === 'Enter' && suggestionList[active]) { e.preventDefault(); pick(suggestionList[active]); }
    // Tab complète le tag de manhwa sélectionné.
    else if (e.key === 'Tab' && suggestionList[active]?.manhwa) { e.preventDefault(); pick(suggestionList[active]); }
    else if (e.key === 'Escape') closeSuggestions();
  });
  window.addEventListener('resize', () => { if (!$('suggestions').hidden) openSuggestions(); renderMode(); });

  $('mode').addEventListener('click', (e) => {
    const b = e.target.closest('.tabs__item');
    if (!b) return;
    if (b.dataset.view) { if (view !== b.dataset.view) setView(b.dataset.view); return; }
    if (b.dataset.mode === mode) { if (view !== 'game') setView('game'); return; }
    mode = b.dataset.mode;
    view = 'game';
    store.set('mode', mode);
    loadGame();
    render();
  });

  $('give-up').addEventListener('click', () => { if (!game.done) { finish(false); render(); } });

  // Le perso du jour change à minuit : on recharge si l'appli reste ouverte.
  setInterval(() => {
    if (mode === 'daily' && game.day !== L.dayKey()) { loadGame(); render(); }
    else if (mode === 'daily') renderScenario();
  }, 60000);

  // Mises à jour (appli de bureau) : message système quand une version est téléchargée / prête.
  if (typeof window.manhwadle.onUpdate === 'function') {
    window.manhwadle.onUpdate(({ state, version }) => {
      const box = $('update');
      const v = version ? ` v${version}` : '';
      box.replaceChildren();
      if (state === 'downloading') box.append(el('span', '', `[Une mise à jour${v} est en cours de téléchargement.]`));
      else if (state === 'ready') {
        box.append(el('span', '', `[La mise à jour${v} est prête. Elle s'installera à la fermeture.]`));
        const now = el('button', 'link link--strong', '[Redémarrer maintenant]');
        now.addEventListener('click', () => window.manhwadle.installUpdate());
        box.append(now);
      } else return;
      box.hidden = false;
    });
  }

  // Appli de bureau uniquement : la fenêtre n'a pas de barre de titre.
  if (typeof window.manhwadle.quit === 'function') {
    $('quit').hidden = false;
    $('quit').addEventListener('click', () => window.manhwadle.quit());
  }

  loadGame();
  // Retour de connexion (site) : on affiche le compte.
  if (online && (online.takeJustLoggedIn() || accountMsg)) view = 'account';
  if (view === 'ranking') loadBoard();
  render();
  document.fonts.ready.then(renderMode);
  input.focus();
  if (online?.signedIn) syncAccount();

  const demo = window.manhwadle.demo;
  if (demo) {
    if (demo.guesses.length) {
      mode = 'endless';
      newEndlessGame();
      demo.guesses.filter((id) => byId.has(id) && id !== game.target.id).forEach(submitGuess);
    }
    // Démo : garde la liste ouverte malgré les changements de focus du compositeur.
    if (demo.type) { input.value = demo.type; setInterval(() => { if ($('suggestions').hidden) openSuggestions(); }, 400); }
  }
})();
