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

  const emptyStats = () => ({ played: 0, won: 0, streak: 0, best: 0, totalGuesses: 0, lastDay: null });
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
      img.src = c.image; img.alt = ''; img.loading = 'lazy'; img.draggable = false;
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
      empty.append(el('p', 'system', '[Un personnage mystère a été choisi.]'));
      const pool = poolFor(mode);
      empty.append(el('p', 'section__desc', `${pool.length} personnages possibles. Propose un nom pour commencer.`));
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

  function renderSide() {
    const box = $('side-state');
    box.replaceChildren();
    const n = game.guesses.length;

    if (game.done) {
      const t = game.target;
      box.append(el('h2', 'section__title', game.won ? 'Personnage identifié' : 'Personnage révélé'));
      const res = el('div', 'result');
      const who = el('div', 'result__who');
      who.append(portrait(t, 'lg'));
      const txt = el('div');
      txt.append(el('div', 'result__name', t.name), el('div', 'result__manhwa', manhwaById.get(t.manhwa).title));
      who.append(txt);
      const sys = el('div', 'status-window system');
      sys.append(el('p', '', game.won ? `[Trouvé en ${n} essai${n > 1 ? 's' : ''}.]` : '[Le scénario a échoué.]'));
      if (mode === 'daily') sys.append(el('p', '', `[Prochain personnage dans ${untilMidnight()}.]`));
      res.append(who, sys);
      if (mode === 'endless') {
        const actions = el('div', 'result__actions');
        const again = el('button', 'btn btn--primary', 'Nouveau personnage');
        again.addEventListener('click', () => { newEndlessGame(); render(); $('search').focus(); });
        actions.append(again);
        res.append(actions);
      }
      box.append(res);
      return;
    }

    box.append(el('h2', 'section__title', 'Personnage mystère'));
    box.append(el('p', 'section__desc', mode === 'daily' ? 'Le même pour tout le monde aujourd\'hui.' : 'Tiré parmi les manhwa sélectionnés.'));
    const sys = el('div', 'status-window system');
    sys.append(el('p', '', `[Essais : ${n}]`));
    box.append(sys);

    const hint = el('div', 'hint');
    hint.style.marginTop = '12px';
    if (n >= HINT_AT) {
      const p = portrait(game.target, 'lg');
      p.classList.add('hint__img');
      p.style.setProperty('--blur', n >= HINT_CLEAR_AT ? '6px' : '14px');
      hint.append(p, el('p', 'hint__text', n >= HINT_CLEAR_AT ? 'Indice : portrait presque net.' : `Indice : portrait flouté. Plus net à ${HINT_CLEAR_AT} essais.`));
    } else {
      const wrap = el('div');
      wrap.style.flex = '1';
      wrap.append(el('p', 'hint__text', `Indice débloqué dans ${HINT_AT - n} essai${HINT_AT - n > 1 ? 's' : ''}.`));
      const meter = el('div', 'meter');
      const fill = el('div', 'meter__fill');
      meter.append(fill);
      wrap.append(meter);
      hint.append(wrap);
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${(n / HINT_AT) * 100}%`; }));
    }
    box.append(hint);
  }

  function untilMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const m = Math.ceil((next - now) / 60000);
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  }

  function renderStats() {
    const s = stats[mode];
    $('stats-desc').textContent = mode === 'daily' ? 'Mode « Perso du jour ».' : 'Mode « Infini ».';
    const items = [
      ['Parties', s.played],
      ['Victoires', s.played ? `${Math.round((s.won / s.played) * 100)} %` : '–'],
      ['Série', s.streak],
      ['Meilleure série', s.best],
      ['Essais moyens', s.won ? (s.totalGuesses / s.won).toFixed(1).replace('.', ',') : '–'],
    ];
    const box = $('stats');
    box.replaceChildren(...items.map(([label, value]) => {
      const d = el('div', 'stat');
      d.append(el('div', 'stat__label', label), el('div', 'stat__value', value));
      return d;
    }));
  }

  function renderFilters() {
    const box = $('filters');
    box.hidden = mode !== 'endless';
    box.querySelectorAll('.chip').forEach((c) => c.remove());
    for (const m of manhwas) {
      const count = characters.filter((c) => c.manhwa === m.id).length;
      const chip = el('button', `chip ${enabled.has(m.id) ? 'is-on' : ''}`);
      chip.append(el('span', 'chip__dot'), document.createTextNode(`${m.title} · ${count}`));
      chip.title = enabled.has(m.id) ? 'Retirer de la partie' : 'Ajouter à la partie';
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
    const items = [...nav.querySelectorAll('.segmented__item')];
    items.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
    const active = items.find((b) => b.dataset.mode === mode);
    const pill = nav.querySelector('.segmented__pill');
    pill.style.left = `${active.offsetLeft}px`;
    pill.style.width = `${active.offsetWidth}px`;
    const pool = poolFor(mode);
    const tracked = new Set(pool.map((c) => c.manhwa)).size;
    $('pool-info').textContent = `[${pool.length} personnages · ${tracked} manhwa]`;
  }

  function render({ animateFirst = false } = {}) {
    renderMode();
    renderFilters();
    renderGrid(animateFirst);
    renderSide();
    renderStats();
    const input = $('search');
    input.disabled = game.done;
    input.placeholder = game.done ? (mode === 'daily' ? 'Reviens demain pour un nouveau personnage.' : 'Partie terminée.') : 'Tape le nom d\'un personnage…  (@ORV pour lister un manhwa)';
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
    if (header) box.append(el('div', 'suggestions__header system', `[${header}]`));
    if (!suggestionList.length) box.append(el('div', 'suggestions__empty', q.choices ? 'Aucun manhwa ne correspond.' : 'Aucun personnage ne correspond.'));
    suggestionList.forEach((item, i) => {
      const b = el('button', `suggestion ${i === active ? 'is-active' : ''}`);
      b.setAttribute('role', 'option');
      if (item.char) {
        const c = item.char;
        b.append(portrait(c, 'sm'), el('span', 'suggestion__name', c.name));
        if (!q.manhwa) b.append(el('span', 'suggestion__meta', manhwaById.get(c.manhwa).short));
      } else {
        const m = item.manhwa;
        const left = pool.filter((c) => c.manhwa === m.id && !guessed.has(c.id)).length;
        b.append(el('span', 'suggestion__tag', `@${m.short.replace(/\.$/, '')}`), el('span', 'suggestion__name', m.title), el('span', 'suggestion__meta', `${left} persos`));
      }
      b.addEventListener('mousedown', (e) => { e.preventDefault(); pick(item); });
      b.addEventListener('mouseenter', () => { active = i; highlight(); });
      box.append(b);
    });
    const r = input.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.bottom + 6}px`, width: `${r.width}px` });
    box.hidden = false;
  }

  function highlight() {
    [...$('suggestions').querySelectorAll('.suggestion')].forEach((b, i) => {
      b.classList.toggle('is-active', i === active);
      if (i === active) b.scrollIntoView({ block: 'nearest' });
    });
  }

  // ---------- Événements ----------
  const input = $('search');
  input.addEventListener('input', () => { active = 0; openSuggestions(); });
  input.addEventListener('focus', openSuggestions);
  input.addEventListener('blur', () => setTimeout(closeSuggestions, 80));
  input.addEventListener('keydown', (e) => {
    const n = suggestionList.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); active = (active + 1) % n; highlight(); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); active = (active - 1 + n) % n; highlight(); }
    else if (e.key === 'Enter' && suggestionList[active]) { e.preventDefault(); pick(suggestionList[active]); }
    // Tab complète le tag de manhwa sélectionné.
    else if (e.key === 'Tab' && suggestionList[active]?.manhwa) { e.preventDefault(); pick(suggestionList[active]); }
    else if (e.key === 'Escape') closeSuggestions();
  });
  window.addEventListener('resize', () => { closeSuggestions(); renderMode(); });

  $('mode').addEventListener('click', (e) => {
    const b = e.target.closest('.segmented__item');
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
    else if (mode === 'daily' && game.done) renderSide();
  }, 60000);

  loadGame();
  render();
  document.fonts.ready.then(renderMode);
  input.focus();
})();
