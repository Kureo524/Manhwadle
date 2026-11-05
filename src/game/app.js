// Interface du jeu : onglets, rendu d'ensemble, événements et démarrage.
(function () {
  'use strict';
  const A = window.App;
  const { manhwas, characters, L, I, t, SITE_URL, byId, manhwaById, $, store, online, S, poolFor, dailyStreak, el, initials, button, rows, reward } = A;

  Object.assign(A, { loadGame, newEndlessGame, loadDaily, login, render, closeSuggestions });

  // ---------- Parties ----------
  function loadGame() {
    if (S.mode === 'daily') {
      S.game = S.dailyGame?.day === L.utcDayKey() ? S.dailyGame : { guesses: [], results: new Map(), done: false, won: false, target: null, hint: 0 };
      if (!online?.signedIn) { S.dailyStatus = 'locked'; return; }
      if (S.game !== S.dailyGame) S.dailyStatus = 'loading';
      loadDaily();
    } else {
      const saved = store.get('endless.current', null);
      const target = saved && byId.get(saved.target);
      if (target && S.enabled.has(target.manhwa)) {
        S.game = { target, guesses: saved.guesses.filter((id) => byId.has(id)), done: saved.done, won: saved.won };
      } else newEndlessGame();
    }
  }

  function newEndlessGame() {
    const pool = poolFor('endless');
    const previous = S.game?.target?.id;
    let target = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1) while (target.id === previous) target = pool[Math.floor(Math.random() * pool.length)];
    S.game = { target, guesses: [], done: false, won: false };
    saveGame();
  }

  function saveGame() {
    store.set('endless.current', { guesses: S.game.guesses, done: S.game.done, won: S.game.won, target: S.game.target.id });
  }

  function finish(won) {
    S.game.done = true;
    S.game.won = won;
    const s = S.stats.endless;
    s.played++;
    if (won) {
      s.won++;
      s.coins = (s.coins ?? 0) + reward(S.game.guesses.length);
      s.totalGuesses += S.game.guesses.length;
      s.streak += 1;
      s.best = Math.max(s.best, s.streak);
    } else s.streak = 0;
    store.set('stats', S.stats);
    saveGame();
  }

  // ---------- Synchronisation avec le serveur ----------
  // Le serveur fait foi pour la série du jour : ses statistiques remplacent celles de l'appareil
  // (les pièces restent locales).
  function applyProfile(p) {
    S.profile = p;
    S.stats.daily = {
      ...S.stats.daily, played: p.played, won: p.won, streak: p.streak, best: p.best, totalGuesses: p.guesses, lastDay: p.lastDay,
    };
    store.set('stats', S.stats);
  }

  // Partie du jour renvoyée par le serveur.
  function applyDaily(s) {
    S.dailyGame = {
      day: s.day,
      guesses: s.guesses.filter((g) => byId.has(g.id)).map((g) => g.id),
      results: new Map(s.guesses.map((g) => [g.id, g.results])),
      done: s.done,
      won: s.won,
      target: s.target ? byId.get(s.target) ?? { name: '???', manhwa: null } : null,
      hint: s.hint,
    };
    applyProfile(s.profile);
    S.dailyStatus = 'ready';
    if (S.mode === 'daily') S.game = S.dailyGame;
  }

  async function loadDaily() {
    const opening = S.openingDaily;
    S.openingDaily = false;
    try {
      applyDaily(await online.daily());
      S.dailyMsg = '';
    } catch (e) {
      if (e.status === 401) { S.profile = null; S.dailyStatus = 'locked'; S.accountMsg = t('msg.sessionExpired'); }
      else {
        S.dailyStatus = 'offline';
        // Au lancement, sans réseau : on ouvre le mode infini plutôt qu'un scénario impossible à jouer.
        if (opening && S.mode === 'daily') { S.mode = 'endless'; loadGame(); }
      }
    }
    render();
  }

  async function submitDailyGuess(id) {
    if (S.dailyBusy) return;
    S.dailyBusy = true;
    closeSuggestions();
    $('search').value = '';
    try {
      applyDaily(await online.dailyGuess(id, S.dailyGame.day));
      S.dailyMsg = '';
      if (S.dailyGame.done && S.dailyGame.won) {
        S.stats.daily.coins = (S.stats.daily.coins ?? 0) + reward(S.dailyGame.guesses.length);
        store.set('stats', S.stats);
      }
      S.dailyBusy = false;
      render({ animateFirst: true });
      return;
    } catch (e) {
      if (e.code === 'day-changed' || e.status === 409) await loadDaily();
      else if (e.status === 401) await loadDaily();
      else S.dailyMsg = t(e.code === 'update' ? 'daily.update' : 'daily.sendFailed');
    }
    S.dailyBusy = false;
    render();
  }

  async function syncAccount() {
    if (!online?.signedIn) { S.profile = null; render(); return; }
    try {
      applyProfile(await online.me());
      if (S.mode === 'daily' && S.dailyStatus !== 'loading') { await loadDaily(); return; }
    } catch (e) {
      if (e.status === 401) { S.profile = null; S.accountMsg = t('msg.sessionExpired'); }
      else if (!S.profile) S.accountMsg = t('msg.offline');
    }
    render();
    if (S.view === 'ranking') loadBoard();
  }

  async function loadBoard() {
    if (!online) return;
    try {
      S.board = (await online.leaderboard()).players;
      S.boardError = null;
    } catch {
      S.boardError = true;
    }
    renderView();
  }

  async function login() {
    // Déjà en cours : on ramène la fenêtre Discord au premier plan (appli).
    // Appli installée sur téléphone : on ouvre la page Discord.
    if (S.loggingIn) { if (window.manhwadle.login) window.manhwadle.login(); else online.openLoginPage(); return; }
    S.loggingIn = true;
    S.accountMsg = t(typeof window.manhwadle.login === 'function' ? 'msg.loginWindow' : 'msg.loginRedirect');
    S.view = 'account';
    render();
    const error = await online.login((code) => {
      S.loginCodeShown = code;
      S.accountMsg = '';
      renderView();
    });
    S.loggingIn = false;
    S.loginCodeShown = null;
    S.accountMsg = error ? t(`login.${error}`) : '';
    if (error) { renderAccount(); renderView(); return; }
    setView('account');
    await syncAccount();
  }

  // Plus de compte sur cet appareil : la partie du jour ne doit plus s'afficher.
  function forgetDaily() {
    S.dailyGame = null;
    if (S.dailyHint?.url) URL.revokeObjectURL(S.dailyHint.url);
    S.dailyHint = null;
    if (S.mode === 'daily') loadGame();
  }

  async function logout() {
    await online.logout().catch(() => {});
    S.profile = null;
    forgetDaily();
    S.accountMsg = t('msg.loggedOut');
    render();
  }

  async function logoutAll() {
    try {
      await online.logoutAll();
      S.profile = null;
      forgetDaily();
      S.accountMsg = t('msg.loggedOutAll');
    } catch {
      S.accountMsg = t('msg.actionFailed');
    }
    render();
  }

  async function toggleBoard() {
    try {
      applyProfile(await online.setShowOnBoard(S.profile.showOnBoard === false));
      S.accountMsg = t(S.profile.showOnBoard ? 'msg.boardOn' : 'msg.boardOff');
    } catch {
      S.accountMsg = t('msg.actionFailed');
    }
    render();
  }

  async function exportData() {
    try {
      const url = URL.createObjectURL(await online.exportData());
      const a = el('a');
      a.href = url; a.download = 'manhwadle-donnees.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      S.accountMsg = t('msg.actionFailed');
      render();
    }
  }

  async function deleteAccount() {
    if (!S.confirmDelete) { S.confirmDelete = true; renderView(); return; }
    S.confirmDelete = false;
    try {
      await online.deleteAccount();
      S.profile = null;
      forgetDaily();
      S.accountMsg = t('msg.deleted');
    } catch {
      S.accountMsg = t('msg.deleteFailed');
    }
    render();
    loadBoard();
  }

  function setView(v) {
    S.view = v;
    S.confirmDelete = false;
    if (v === 'ranking') loadBoard();
    render();
    if (v === 'game') $('search').focus();
  }

  function submitGuess(id) {
    if (S.game.done || S.game.guesses.includes(id)) return;
    if (S.mode === 'daily') { submitDailyGuess(id); return; }
    S.game.guesses.push(id);
    const won = id === S.game.target.id;
    if (won) finish(true); else saveGame();
    closeSuggestions();
    $('search').value = '';
    render({ animateFirst: true });
  }

  // ---------- Rendu ----------

  // ---------- Ambiance ORV : scénario, récompense, constellations ----------

  function renderStats() {
    const s = S.stats[S.mode];
    const items = [
      [t('stats.played'), s.played],
      [t('stats.won'), s.played ? I.percent(Math.round((s.won / s.played) * 100)) : '–'],
      [t('stats.streak'), S.mode === 'daily' ? dailyStreak() : s.streak],
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
    box.hidden = S.mode !== 'endless';
    box.replaceChildren();
    for (const m of manhwas) {
      const count = characters.filter((c) => c.manhwa === m.id).length;
      const chip = el('button', `filter ${S.enabled.has(m.id) ? 'is-on' : ''}`, `${m.short.replace(/\.$/, '')} · ${count}`);
      chip.title = `${m.title} — ${S.enabled.has(m.id) ? t('filter.remove') : t('filter.add')}`;
      chip.addEventListener('click', () => {
        if (S.enabled.has(m.id)) { if (S.enabled.size === 1) return; S.enabled.delete(m.id); } else S.enabled.add(m.id);
        store.set('filters', [...S.enabled]);
        // Changer les manhwa en jeu relance une partie si la cible n'est plus dans la sélection.
        if (!S.enabled.has(S.game.target.manhwa) || !S.game.guesses.length || S.game.done) newEndlessGame();
        render();
      });
      box.append(chip);
    }
  }

  // ---------- Compte et classement ----------
  function avatar(p, size) {
    const box = el('span', `avatar avatar--${size}`);
    if (online && typeof p.avatar === 'string' && p.avatar.startsWith('/avatar/')) {
      const img = el('img');
      img.src = online.avatarUrl(p.avatar); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.draggable = false;
      box.append(img);
    } else box.textContent = initials(p.name) || '?';
    return box;
  }

  // En-tête : avatar et pseudo une fois connecté, sinon un lien de connexion.
  function renderAccount() {
    const box = $('account');
    box.replaceChildren();
    if (!online) return;
    if (S.profile) {
      const me = el('button', 'account__me');
      me.title = t('acc.me');
      me.append(avatar(S.profile, 'sm'), el('span', 'account__name', S.profile.name));
      me.addEventListener('click', () => setView('account'));
      box.append(me);
    } else if (online.signedIn) {
      box.append(el('span', 'account__wait', t('acc.connecting')));
    } else {
      const b = el('button', 'link', S.loggingIn ? t('acc.connecting') : t('acc.login'));
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
    if (S.boardError) { wrap.append(el('p', 'board__empty system', t('rank.error'))); return wrap; }
    if (!S.board) { wrap.append(el('p', 'board__empty system', t('rank.loading'))); return wrap; }
    if (!S.board.length) {
      wrap.append(el('p', 'board__empty system', t('rank.empty')));
      return wrap;
    }
    wrap.append(boardRow(t('rank.head').map((h) => el('span', 'board__head', h)), 'board__row--head'));
    S.board.forEach((p, i) => {
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
      ], S.profile?.id === p.id ? 'is-me' : ''));
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

  // Onglet « Compte » : connexion Discord, ou fiche du joueur connecté.
  function accountView() {
    const msg = S.accountMsg ? [el('p', 'panel__msg system', `[${S.accountMsg}]`)] : [];
    const note = el('p', 'panel__note', t('acc.note'));
    const privacy = el('a', '', t('acc.privacy'));
    privacy.href = `${SITE_URL}privacy.html`; privacy.target = '_blank'; privacy.rel = 'noopener';
    note.append(' ', privacy);
    if (S.profile) {
      const who = el('div', 'panel__who');
      const txt = el('div');
      txt.append(el('div', 'panel__name', S.profile.name), el('div', 'panel__sub', t('acc.sub')));
      who.append(avatar(S.profile, 'md'), txt);
      return panel(t('acc.titleIn'), who, rows([
        [t('acc.streak'), t('acc.days', { n: S.profile.streak }), S.profile.streak],
        [t('acc.best'), t('acc.days', { n: S.profile.best }), S.profile.best],
        [t('acc.won'), t('acc.outOf', { n: S.profile.played }), S.profile.won],
        [t('acc.avg'), S.profile.won ? I.decimal(S.profile.guesses / S.profile.won) : '–'],
        [t('acc.last'), S.profile.lastDay ? t('acc.lastValue', { n: L.dayNumber(S.profile.lastDay), date: I.date(S.profile.lastDay) }) : t('acc.never')],
      ]), actionsOf(
        button('link', t(S.profile.showOnBoard === false ? 'acc.boardOff' : 'acc.boardOn'), toggleBoard),
        button('link', t('acc.export'), exportData),
        button('link link--strong', t('acc.logout'), logout),
        button('link', t('acc.logoutAll'), logoutAll),
        button('link link--danger', S.confirmDelete ? t('acc.deleteConfirm') : t('acc.delete'), deleteAccount),
      ), ...msg, note);
    }
    if (online.signedIn) return panel(t('acc.titleOut'), el('p', 'panel__text', t('acc.connectingServer')), ...msg);
    // Appli installée : le code d'abord, car la page Discord s'ouvre par-dessus l'appli.
    if (S.loginCodeShown) {
      return panel(t('acc.titleOut'),
        el('p', 'panel__text', t('acc.codeIntro')),
        el('p', 'login-code system', S.loginCodeShown),
        actionsOf(
          button('link link--strong', t('acc.openDiscord'), () => online.openLoginPage()),
          button('link', t('acc.cancel'), () => online.cancelLoginPage()),
        ),
        el('p', 'panel__note', t('acc.codeAfter')),
      );
    }
    return panel(t('acc.titleOut'),
      el('p', 'panel__text', t('acc.intro')),
      actionsOf(
        button('link link--strong', S.loggingIn ? t('acc.connecting') : t('acc.loginDiscord'), login),
        // Appli : la fenêtre Discord peut se retrouver derrière le jeu ; on peut l'annuler d'ici.
        ...(S.loggingIn && typeof window.manhwadle.cancelLogin === 'function'
          ? [button('link', t('acc.cancel'), () => window.manhwadle.cancelLogin())] : []),
      ),
      ...msg, note);
  }

  function rankingView() {
    const parts = [
      el('p', 'panel__text', t('rank.intro')),
      renderBoard(),
    ];
    if (!S.profile && !online.signedIn) {
      parts.push(actionsOf(button('link', t('rank.join'), () => setView('account'))));
    }
    return panel(t('rank.title'), ...parts);
  }

  function renderView() {
    const box = $('view');
    box.hidden = S.view === 'game';
    if (box.hidden) return;
    box.replaceChildren(S.view === 'ranking' ? rankingView() : accountView());
  }

  function renderMode() {
    const nav = $('mode');
    const items = [...nav.querySelectorAll('.tabs__item')];
    nav.querySelectorAll('[data-view]').forEach((b) => { b.hidden = !online; });
    items.forEach((b) => b.classList.toggle('is-active', S.view === 'game' ? b.dataset.mode === S.mode : b.dataset.view === S.view));
    const active = items.find((b) => b.classList.contains('is-active'));
    document.querySelector('.app').classList.toggle('is-view', S.view !== 'game');
    const line = nav.querySelector('.tabs__line');
    line.style.left = `${active.offsetLeft + 10}px`;
    line.style.width = `${active.offsetWidth - 20}px`;
    const pool = poolFor(S.mode);
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
    S.accountMsg = '';
    renderStatic();
    render();
  }

  function render({ animateFirst = false } = {}) {
    renderMode();
    renderAccount();
    renderView();
    renderFilters();
    A.renderScenario();
    A.renderFeed(animateFirst);
    A.renderGrid(animateFirst);
    renderStats();
    const input = $('search');
    const gated = S.mode === 'daily' && S.dailyStatus !== 'ready';
    input.disabled = S.game.done || gated;
    input.placeholder = gated ? t('search.dailyGated') : S.game.done ? (S.mode === 'daily' ? t('search.doneDaily') : t('search.doneEndless')) : t('search.placeholder');
    $('give-up').hidden = S.mode !== 'endless' || S.game.done;
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
    if (!input.value.trim() || S.game.done) return closeSuggestions();
    const pool = poolFor(S.mode);
    const guessed = new Set(S.game.guesses);
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
        b.append(A.portrait(c, 'md'), txt);
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
    box.hidden = false;
    placeSuggestions();
  }

  // La liste est posée en position fixe sous le champ : on la recale quand la page défile,
  // et on la ferme si le champ sort de la zone visible.
  function placeSuggestions() {
    const box = $('suggestions');
    if (box.hidden) return;
    const r = $('search').getBoundingClientRect();
    const stage = document.querySelector('.stage').getBoundingClientRect();
    if (r.bottom < stage.top || r.top > stage.bottom) return closeSuggestions();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.bottom + 6}px`, width: `${r.width}px` });
    // Hauteur limitée à la place restante sous le champ (petit écran, clavier du téléphone).
    const list = box.querySelector('.suggestions__list');
    if (list) list.style.maxHeight = `${Math.max(160, Math.min(420, innerHeight - r.bottom - 22))}px`;
  }

  function renderPreview() {
    const box = $('suggestions').querySelector('.suggestions__preview');
    const c = suggestionList[active]?.char;
    if (!box) return;
    box.replaceChildren();
    if (!c) return;
    box.append(A.portrait(c, 'xl'), el('div', 'preview__name', c.name), el('div', 'preview__manhwa', manhwaById.get(c.manhwa).title));
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
  document.querySelector('.stage').addEventListener('scroll', placeSuggestions, { passive: true });

  $('mode').addEventListener('click', (e) => {
    const b = e.target.closest('.tabs__item');
    if (!b) return;
    if (b.dataset.view) { if (S.view !== b.dataset.view) setView(b.dataset.view); return; }
    if (b.dataset.mode === S.mode) { if (S.view !== 'game') setView('game'); return; }
    S.mode = b.dataset.mode;
    S.view = 'game';
    store.set('mode', S.mode);
    loadGame();
    render();
  });

  $('give-up').addEventListener('click', () => { if (!S.game.done) { finish(false); render(); } });

  // Le perso du jour change à minuit : on recharge si l'appli reste ouverte.
  setInterval(() => {
    if (S.mode === 'daily' && S.dailyStatus === 'ready' && S.game.day !== L.utcDayKey()) { loadGame(); render(); }
    else if (S.mode === 'daily') A.renderScenario();
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
  if (online && (online.takeJustLoggedIn() || S.accountMsg)) S.view = 'account';
  if (S.view === 'ranking') loadBoard();
  render();
  document.fonts.ready.then(renderMode);
  input.focus();
  if (online?.signedIn) syncAccount();

  const demo = window.manhwadle.demo;
  if (demo) {
    if (demo.guesses.length) {
      S.mode = 'endless';
      newEndlessGame();
      demo.guesses.filter((id) => byId.has(id) && id !== S.game.target.id).forEach(submitGuess);
    }
    // Démo : garde la liste ouverte malgré les changements de focus du compositeur.
    if (demo.type) { input.value = demo.type; setInterval(() => { if ($('suggestions').hidden) openSuggestions(); }, 400); }
  }
})();
