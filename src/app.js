// Interface du jeu : modes, saisie, tableau des essais, indices et statistiques.
(function () {
  'use strict';
  const { manhwas, characters } = window.manhwadle;
  const L = window.Logic;
  const I = window.I18n;
  const t = I.t;

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
  const loginNotice = online?.takeNotice();
  let accountMsg = loginNotice ? t(`login.${loginNotice}`) : '';
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
      if (e.status === 401) { profile = null; accountMsg = t('msg.sessionExpired'); }
      else if (!profile) accountMsg = t('msg.offline');
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
      boardError = true;
    }
    renderView();
  }

  async function login() {
    // Déjà en cours : on ramène la fenêtre Discord au premier plan (appli).
    // Appli installée sur téléphone : on rouvre la page Discord.
    if (loggingIn) { if (window.manhwadle.login) window.manhwadle.login(); else online.reopenLogin(); return; }
    loggingIn = true;
    accountMsg = t(typeof window.manhwadle.login === 'function' ? 'msg.loginWindow' : online.waitingForApp ? 'msg.loginApp' : 'msg.loginRedirect');
    view = 'account';
    render();
    const error = await online.login();
    loggingIn = false;
    accountMsg = error ? t(`login.${error}`) : '';
    if (error) { renderAccount(); renderView(); return; }
    setView('account');
    await syncAccount();
  }

  async function logout() {
    await online.logout().catch(() => {});
    profile = null;
    accountMsg = t('msg.loggedOut');
    render();
  }

  async function deleteAccount() {
    if (!confirmDelete) { confirmDelete = true; renderView(); return; }
    confirmDelete = false;
    try {
      await online.deleteAccount();
      profile = null;
      accountMsg = t('msg.deleted');
    } catch {
      accountMsg = t('msg.deleteFailed');
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
      c.title = result.dir === 'up' ? t('cell.later') : result.dir === 'down' ? t('cell.earlier') : '';
    } else if (Array.isArray(v)) v.forEach((x) => c.append(el('span', 'cell__line', I.value(x))));
    else c.append(el('span', 'cell__line', I.value(v)));
    return c;
  }

  function renderGrid(animateFirst) {
    const grid = $('grid');
    grid.replaceChildren();
    grid.append(el('div', 'grid__head', t('col.character')));
    for (const col of L.COLUMNS) grid.append(el('div', 'grid__head', t(`col.${col.key}`)));

    if (!game.guesses.length) {
      const empty = el('div', 'grid__empty');
      empty.append(el('span', '', t('grid.empty')));
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
        // Nom de la colonne (repris de l'en-tête), affiché dans les cartes d'essai sur téléphone.
        if (i > 0) node.dataset.label = grid.children[i].textContent;
        grid.append(node);
      });
    });
  }

  // ---------- Ambiance ORV : scénario, récompense, constellations ----------
  const REWARD_MAX = 1000;
  const reward = (n) => Math.max(100, REWARD_MAX - 100 * Math.max(0, n - 1));
  const DIFFICULTY = ['F', 'D', 'C', 'B', 'A', 'S'];

  // Constellations inventées pour le jeu (modificateurs à la façon d'ORV) : voir i18n.js.
  const pickOf = (list, seed) => list[L.hash(seed) % list.length];

  function reaction(guessId, index) {
    const r = L.compare(byId.get(guessId), game.target);
    const ok = r.filter((x) => x.state === 'ok').length;
    const sameStory = r[0].state === 'ok';
    const who = pickOf(t('constellations'), `${game.target.id}:${index}`);
    const seed = `${guessId}:${index}`;
    if (guessId === game.target.id) return [t('react.win'), null];
    if (ok >= 7) return [pickOf(t('react.close'), seed), who];
    if (sameStory && ok >= 4) return [pickOf(t('react.story'), seed), who];
    if (ok >= 4) return [pickOf(t('react.warm'), seed), who];
    if (ok >= 2) return [pickOf(t('react.lukewarm'), seed), who];
    return [pickOf(t('react.cold'), seed), who];
  }

  function renderFeed(animate) {
    const box = $('feed');
    box.replaceChildren();
    const lines = game.guesses.map((id, i) => reaction(id, i));
    const live = dailyStreak();
    const playedElsewhere = mode === 'daily' && !game.done && profile?.lastDay && profile.lastDay >= game.day;
    if (mode === 'daily' && !game.done && !game.guesses.length && live && !playedElsewhere) {
      lines.push([t('feed.streakAtStake', { n: live }), null]);
    }
    if (playedElsewhere) {
      lines.push([t('feed.playedElsewhere'), null]);
    }
    if (game.done && !game.won) lines.push([t('feed.lost'), null]);
    if (game.done && game.won) lines.push([t('feed.coins', { n: I.integer(reward(game.guesses.length)) }), null]);
    if (game.done && mode === 'daily') {
      const s = stats.daily;
      if (game.won && s.streak > 1 && s.streak === s.best) lines.push([t('feed.record', { n: s.streak }), null]);
      else if (game.won) lines.push([t('feed.streak', { n: s.streak }), null]);
      else lines.push([t('feed.broken'), null]);
    }
    lines.slice(-3).reverse().forEach(([text, who], i) => {
      const msg = el('div', `feed__msg ${i === 0 && animate ? 'is-new' : ''}`);
      if (who) {
        const [before, name, after] = t('feed.constellation', { who, text });
        msg.append(before, Object.assign(el('em'), { textContent: name }), after);
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
    if (!live) return [t('sc.streak'), best ? t('sc.noStreakBest', { best }) : t('sc.noStreak')];
    return [t('sc.streak'), t('sc.streakRun', { n: live, best }), live];
  }

  function renderScenario() {
    const box = $('scenario');
    box.replaceChildren();
    const n = game.guesses.length;
    const pool = poolFor(mode);
    const main = el('div');
    const side = el('div', 'scenario__side');

    if (game.done) {
      const target = game.target;
      main.append(el('h2', 'scenario__title', game.won ? t('sc.won') : t('sc.lost')));
      const res = el('div', 'result');
      const txt = el('div');
      txt.append(el('div', 'result__name', target.name), el('div', 'result__manhwa', manhwaById.get(target.manhwa).title));
      res.append(txt);
      main.append(res);
      main.append(rows([
        [t('sc.guesses'), '', n],
        [t('sc.reward'), game.won ? t('sc.coins') : t('sc.noReward'), game.won ? I.integer(reward(n)) : undefined],
        ...(mode === 'daily' ? [streakRow(), [t('sc.next'), t('sc.in', { time: untilMidnight() })]] : []),
      ]));
      const actions = el('div', 'scenario__actions');
      const share = el('button', 'link link--strong', t('sc.share'));
      share.addEventListener('click', async () => {
        // Appli de bureau : image de la zone de jeu. Navigateur : texte (une page ne peut pas se capturer).
        if (typeof window.manhwadle.shareImage === 'function') {
          closeSuggestions();
          share.textContent = (await window.manhwadle.shareImage()) ? t('sc.imageCopied') : t('sc.copyFailed');
          setTimeout(() => { share.textContent = t('sc.share'); }, 1800);
          return;
        }
        const text = L.shareText({
          daily: mode === 'daily', day: game.day, won: game.won, streak: dailyStreak(), url: SITE_URL, lang: I.lang,
          rows: game.guesses.map((id) => L.compare(byId.get(id), game.target).map((r) => r.state)),
        });
        share.textContent = (await copyText(text)) ? t('sc.textCopied') : t('sc.copyFailed');
        setTimeout(() => { share.textContent = t('sc.share'); }, 1800);
      });
      actions.append(share);
      if (mode === 'endless') {
        const again = el('button', 'link link--strong', t('sc.nextScenario'));
        again.addEventListener('click', () => { newEndlessGame(); render(); $('search').focus(); });
        actions.append(again);
      }
      main.append(actions);
      side.append(portrait(target, 'lg'));
    } else {
      const level = mode === 'daily' ? 'A' : DIFFICULTY[Math.min(enabled.size, DIFFICULTY.length - 1)];
      main.append(el('h2', 'scenario__title', mode === 'daily' ? t('sc.titleDaily') : t('sc.titleEndless')));
      main.append(rows([
        [t('sc.category'), mode === 'daily' ? t('sc.main') : t('sc.side')],
        [t('sc.difficulty'), level],
        [t('sc.goal'), t('sc.goalText', { n: pool.length })],
        [t('sc.timeLimit'), mode === 'daily' ? t('sc.untilMidnight', { time: untilMidnight() }) : t('sc.none')],
        [t('sc.reward'), t('sc.coins'), I.integer(reward(n + 1))],
        ...(mode === 'daily' ? [streakRow()] : []),
        [t('sc.failure'), mode === 'daily' ? '???' : t('sc.giveUp')],
      ]));
      if (n >= HINT_AT) {
        const p = portrait(game.target, 'lg');
        p.classList.add('hint__img');
        p.style.setProperty('--blur', n >= HINT_CLEAR_AT ? '6px' : '14px');
        side.append(p, el('div', 'scenario__note system', n >= HINT_CLEAR_AT ? t('hint.clear') : t('hint.blurry', { at: HINT_CLEAR_AT })));
      } else {
        const left = HINT_AT - n;
        side.append(el('div', 'hint__locked', left), el('div', 'scenario__note system', t('hint.locked', { n: left })));
      }
    }
    box.append(main, side);
  }

  function untilMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const m = Math.ceil((next - now) / 60000);
    return t('time', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
  }

  function renderStats() {
    const s = stats[mode];
    const items = [
      [t('stats.played'), s.played],
      [t('stats.won'), s.played ? I.percent(Math.round((s.won / s.played) * 100)) : '–'],
      [t('stats.streak'), mode === 'daily' ? dailyStreak() : s.streak],
      [t('stats.best'), s.best],
      [t('stats.avg'), s.won ? I.decimal(s.totalGuesses / s.won) : '–'],
      [t('stats.coins'), I.integer(s.coins ?? 0)],
    ];
    $('stats').replaceChildren(...items.map(([label, value]) => {
      const d = el('span', '', `[${label}`);
      d.append(el('b', '', value), ']');
      return d;
    }));
    // Langue : [FR · EN], la langue active en gras.
    const langs = el('span', 'lang');
    langs.setAttribute('aria-label', t('acc.language'));
    I.LANGS.forEach((code, i) => {
      if (i) langs.append(' · ');
      const b = button(`link lang__item ${code === I.lang ? 'is-active' : ''}`, code.toUpperCase(), () => setLang(code));
      b.setAttribute('aria-pressed', String(code === I.lang));
      langs.append(b);
    });
    $('stats').append(langs);
  }

  function renderFilters() {
    const box = $('filters');
    box.hidden = mode !== 'endless';
    box.replaceChildren();
    for (const m of manhwas) {
      const count = characters.filter((c) => c.manhwa === m.id).length;
      const chip = el('button', `filter ${enabled.has(m.id) ? 'is-on' : ''}`, `${m.short.replace(/\.$/, '')} · ${count}`);
      chip.title = `${m.title} — ${enabled.has(m.id) ? t('filter.remove') : t('filter.add')}`;
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
      me.title = t('acc.me');
      me.append(avatar(profile, 'sm'), el('span', 'account__name', profile.name));
      me.addEventListener('click', () => setView('account'));
      box.append(me);
    } else if (online.signedIn) {
      box.append(el('span', 'account__wait', t('acc.connecting')));
    } else {
      const b = el('button', 'link', loggingIn ? t('acc.connecting') : t('acc.login'));
      b.title = t('acc.loginTitle');
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
    if (boardError) { wrap.append(el('p', 'board__empty system', t('rank.error'))); return wrap; }
    if (!board) { wrap.append(el('p', 'board__empty system', t('rank.loading'))); return wrap; }
    if (!board.length) {
      wrap.append(el('p', 'board__empty system', t('rank.empty')));
      return wrap;
    }
    wrap.append(boardRow(t('rank.head').map((h) => el('span', 'board__head', h)), 'board__row--head'));
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
        num(p.won ? I.decimal(p.guesses / p.won) : '–'),
      ], profile?.id === p.id ? 'is-me' : ''));
    });
    return wrap;
  }

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
    const note = el('p', 'panel__note', t('acc.note'));
    if (profile) {
      const who = el('div', 'panel__who');
      const txt = el('div');
      txt.append(el('div', 'panel__name', profile.name), el('div', 'panel__sub', t('acc.sub')));
      who.append(avatar(profile, 'md'), txt);
      return panel(t('acc.titleIn'), who, rows([
        [t('acc.streak'), t('acc.days', { n: profile.streak }), profile.streak],
        [t('acc.best'), t('acc.days', { n: profile.best }), profile.best],
        [t('acc.won'), t('acc.outOf', { n: profile.played }), profile.won],
        [t('acc.avg'), profile.won ? I.decimal(profile.guesses / profile.won) : '–'],
        [t('acc.last'), profile.lastDay ? t('acc.lastValue', { n: L.dayNumber(profile.lastDay), date: I.date(profile.lastDay) }) : t('acc.never')],
      ]), actionsOf(
        button('link link--strong', t('acc.logout'), logout),
        button('link link--danger', confirmDelete ? t('acc.deleteConfirm') : t('acc.delete'), deleteAccount),
      ), ...msg, note);
    }
    if (online.signedIn) return panel(t('acc.titleOut'), el('p', 'panel__text', t('acc.connectingServer')), ...msg);
    return panel(t('acc.titleOut'),
      el('p', 'panel__text', t('acc.intro')),
      actionsOf(
        button('link link--strong', loggingIn ? t('acc.connecting') : t('acc.loginDiscord'), login),
        // Appli : la fenêtre Discord peut se retrouver derrière le jeu ; on peut l'annuler d'ici.
        ...(loggingIn && typeof window.manhwadle.cancelLogin === 'function'
          ? [button('link', t('acc.cancel'), () => window.manhwadle.cancelLogin())] : []),
      ),
      ...msg, note);
  }

  function rankingView() {
    const parts = [
      el('p', 'panel__text', t('rank.intro')),
      renderBoard(),
    ];
    if (!profile && !online.signedIn) {
      parts.push(actionsOf(button('link', t('rank.join'), () => setView('account'))));
    }
    return panel(t('rank.title'), ...parts);
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
    $('pool-info').textContent = t('pool', { n: pool.length, stories: tracked });
  }

  // Textes fixes de la page (index.html) : data-i18n, data-i18n-title, data-i18n-aria.
  function renderStatic() {
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
    for (const n of document.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(n.dataset.i18nAria));
  }

  function setLang(next) {
    if (next === I.lang) return;
    I.setLang(next);
    accountMsg = '';
    renderStatic();
    render();
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
    input.placeholder = game.done ? (mode === 'daily' ? t('search.doneDaily') : t('search.doneEndless')) : t('search.placeholder');
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
      header = t('sugg.filter');
    } else {
      const chars = L.search(pool, q.text, guessed, q.manhwa ? Infinity : 8, q.manhwa?.id ?? null);
      suggestionList = chars.map((c) => ({ char: c }));
      if (q.manhwa) header = t('sugg.count', { title: q.manhwa.title, n: chars.length });
    }
    active = Math.min(active, Math.max(suggestionList.length - 1, 0));
    box.replaceChildren();
    const list = el('div', 'suggestions__list');
    box.append(list);
    if (header) list.append(el('div', 'suggestions__header system', `[${header}]`));
    if (!suggestionList.length) list.append(el('div', 'suggestions__empty', q.choices ? t('sugg.noManhwa') : t('sugg.noChar')));
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
        b.append(el('span', 'suggestion__tag', `@${m.short.replace(/\.$/, '')}`), el('span', 'suggestion__name', m.title), el('span', 'suggestion__meta', t('sugg.left', { n: left })));
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
      if (state === 'downloading') box.append(el('span', '', t('update.downloading', { v })));
      else if (state === 'ready') {
        box.append(el('span', '', t('update.ready', { v })));
        const now = el('button', 'link link--strong', t('update.restart'));
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

  renderStatic();
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
