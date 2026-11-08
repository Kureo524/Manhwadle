// Interface du jeu : onglets, rendu d'ensemble, événements et démarrage.
(function () {
  'use strict';
  const A = window.App;
  const { manhwas, characters, L, I, t, byId, $, store, online, S, inEndless, poolFor, dailyStreak, el, button } = A;

  Object.assign(A, { setView, renderMode, render });

  const input = $('search');

  function setView(v) {
    S.view = v;
    S.confirmDelete = false;
    if (v === 'ranking') A.loadBoard();
    render();
    if (v === 'game') $('search').focus();
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
      const count = characters.filter((c) => c.manhwa === m.id && (S.novels || !c.novel)).length;
      const chip = el('button', `filter ${S.enabled.has(m.id) ? 'is-on' : ''}`, `${m.short.replace(/\.$/, '')} · ${count}`);
      chip.title = `${m.title} — ${S.enabled.has(m.id) ? t('filter.remove') : t('filter.add')}`;
      chip.addEventListener('click', () => {
        if (S.enabled.has(m.id)) { if (S.enabled.size === 1) return; S.enabled.delete(m.id); } else S.enabled.add(m.id);
        store.set('filters', [...S.enabled]);
        // Changer les manhwa en jeu relance une partie si la cible n'est plus dans la sélection.
        if (!inEndless(S.game.target) || !S.game.guesses.length || S.game.done) A.newEndlessGame();
        render();
      });
      box.append(chip);
    }
    box.append(novelsChip());
  }

  // Option du mode infini : ajoute les personnages qui n'existent que dans les romans.
  function novelsChip() {
    const count = characters.filter((c) => c.novel && S.enabled.has(c.manhwa)).length;
    const chip = el('button', `filter filter--option ${S.novels ? 'is-on' : ''}`, `${t('filter.novels')} · ${count}`);
    chip.title = t('filter.novelsHint');
    chip.setAttribute('aria-pressed', String(S.novels));
    chip.addEventListener('click', () => {
      S.novels = !S.novels;
      store.set('novels', S.novels);
      if (!inEndless(S.game.target) || !S.game.guesses.length || S.game.done) A.newEndlessGame();
      render();
    });
    return chip;
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
    A.renderAccount();
    A.renderView();
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

  // ---------- Événements ----------

  $('mode').addEventListener('click', (e) => {
    const b = e.target.closest('.tabs__item');
    if (!b) return;
    if (b.dataset.view) { if (S.view !== b.dataset.view) setView(b.dataset.view); return; }
    if (b.dataset.mode === S.mode) { if (S.view !== 'game') setView('game'); return; }
    S.mode = b.dataset.mode;
    S.view = 'game';
    store.set('mode', S.mode);
    A.loadGame();
    render();
  });

  $('give-up').addEventListener('click', () => { if (!S.game.done) { A.finish(false); render(); } });

  // Le perso du jour change à minuit : on recharge si l'appli reste ouverte.
  setInterval(() => {
    if (S.mode === 'daily' && S.dailyStatus === 'ready' && S.game.day !== L.utcDayKey()) { A.loadGame(); render(); }
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
  A.loadGame();
  // Retour de connexion (site) : on affiche le compte.
  if (online && (online.takeJustLoggedIn() || S.accountMsg)) S.view = 'account';
  if (S.view === 'ranking') A.loadBoard();
  render();
  document.fonts.ready.then(renderMode);
  input.focus();
  if (online?.signedIn) A.syncAccount();

  const demo = window.manhwadle.demo;
  if (demo) {
    if (demo.guesses.length) {
      S.mode = 'endless';
      A.newEndlessGame();
      demo.guesses.filter((id) => byId.has(id) && id !== S.game.target.id).forEach(A.submitGuess);
    }
    // Démo : garde la liste ouverte malgré les changements de focus du compositeur.
    if (demo.type) { input.value = demo.type; setInterval(() => { if ($('suggestions').hidden) A.openSuggestions(); }, 400); }
  }
})();
