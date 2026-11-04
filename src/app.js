// Interface du jeu : modes, saisie, tableau des essais, indices et statistiques.
(function () {
  'use strict';
  const { manhwas, characters } = window.manhwadle;
  const L = window.Logic;

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

  const poolFor = (m) => (m === 'daily' ? characters : characters.filter((c) => enabled.has(c.manhwa)));

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
    if (game.done && !game.won) lines.push(['Les constellations sont déçues.', null]);
    if (game.done && game.won) lines.push([`${reward(game.guesses.length)} pièces ont été sponsorisées.`, null]);
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
        ...(mode === 'daily' ? [['Prochain scénario', `dans ${untilMidnight()}`]] : []),
      ]));
      if (mode === 'endless') {
        const actions = el('div', 'scenario__actions');
        const again = el('button', 'link link--strong', '[Scénario suivant]');
        again.addEventListener('click', () => { newEndlessGame(); render(); $('search').focus(); });
        actions.append(again);
        main.append(actions);
      }
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
      ['Série', s.streak],
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

  function renderMode() {
    const nav = $('mode');
    const items = [...nav.querySelectorAll('.tabs__item')];
    items.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
    const active = items.find((b) => b.dataset.mode === mode);
    const line = nav.querySelector('.tabs__line');
    line.style.left = `${active.offsetLeft + 10}px`;
    line.style.width = `${active.offsetWidth - 20}px`;
    const pool = poolFor(mode);
    const tracked = new Set(pool.map((c) => c.manhwa)).size;
    $('pool-info').textContent = `[${pool.length} incarnations · ${tracked} histoires]`;
  }

  function render({ animateFirst = false } = {}) {
    renderMode();
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
    if (!b || b.dataset.mode === mode) return;
    mode = b.dataset.mode;
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

  loadGame();
  render();
  document.fonts.ready.then(renderMode);
  input.focus();

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
