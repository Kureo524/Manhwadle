// Parties : mode infini calculé ici, perso du jour joué sur le serveur.
(function () {
  'use strict';
  const A = window.App;
  const { L, t, byId, $, store, online, S, poolFor, reward } = A;

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
    A.render();
  }

  async function submitDailyGuess(id) {
    if (S.dailyBusy) return;
    S.dailyBusy = true;
    A.closeSuggestions();
    $('search').value = '';
    try {
      applyDaily(await online.dailyGuess(id, S.dailyGame.day));
      S.dailyMsg = '';
      if (S.dailyGame.done && S.dailyGame.won) {
        S.stats.daily.coins = (S.stats.daily.coins ?? 0) + reward(S.dailyGame.guesses.length);
        store.set('stats', S.stats);
      }
      S.dailyBusy = false;
      A.render({ animateFirst: true });
      return;
    } catch (e) {
      if (e.code === 'day-changed' || e.status === 409) await loadDaily();
      else if (e.status === 401) await loadDaily();
      else S.dailyMsg = t(e.code === 'update' ? 'daily.update' : 'daily.sendFailed');
    }
    S.dailyBusy = false;
    A.render();
  }

  function submitGuess(id) {
    if (S.game.done || S.game.guesses.includes(id)) return;
    if (S.mode === 'daily') { submitDailyGuess(id); return; }
    S.game.guesses.push(id);
    const won = id === S.game.target.id;
    if (won) finish(true); else saveGame();
    A.closeSuggestions();
    $('search').value = '';
    A.render({ animateFirst: true });
  }

  Object.assign(A, { loadGame, newEndlessGame, finish, applyProfile, loadDaily, submitGuess });
})();
