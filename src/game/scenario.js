// Fenêtre de scénario et messages des constellations (ambiance ORV).
(function () {
  'use strict';
  const A = window.App;
  const { L, I, t, SITE_URL, manhwaById, $, store, online, S, poolFor, dailyStreak, el, rows, gameRank, reward } = A;

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

  // Constellations inventées pour le jeu (modificateurs à la façon d'ORV) : voir i18n.js.
  const pickOf = (list, seed) => list[L.hash(seed) % list.length];

  function reaction(guessId, index) {
    const r = A.resultsFor(guessId);
    const ok = r.filter((x) => x.state === 'ok').length;
    const sameStory = r[0].state === 'ok';
    const who = pickOf(t('constellations'), `${S.game.day ?? S.game.target.id}:${index}`);
    const seed = `${guessId}:${index}`;
    if (guessId === S.game.target?.id) return [t('react.win'), null];
    if (ok >= 7) return [pickOf(t('react.close'), seed), who];
    if (sameStory && ok >= 4) return [pickOf(t('react.story'), seed), who];
    if (ok >= 4) return [pickOf(t('react.warm'), seed), who];
    if (ok >= 2) return [pickOf(t('react.lukewarm'), seed), who];
    return [pickOf(t('react.cold'), seed), who];
  }

  function renderFeed(animate) {
    const box = $('feed');
    box.replaceChildren();
    const lines = S.game.guesses.map((id, i) => reaction(id, i));
    const live = dailyStreak();
    if (S.mode === 'daily' && S.dailyStatus === 'ready' && !S.game.done && !S.game.guesses.length && live) {
      lines.push([t('feed.streakAtStake', { n: live }), null]);
    }
    if (S.mode === 'daily' && S.dailyMsg) lines.push([S.dailyMsg, null]);
    if (S.game.done && !S.game.won) lines.push([t('feed.lost'), null]);
    if (S.game.done && S.game.won) lines.push([t('feed.coins', { n: I.integer(reward(S.game.guesses.length)) }), null]);
    if (S.game.done && S.mode === 'daily') {
      const s = S.stats.daily;
      if (S.game.won && s.streak > 1 && s.streak === s.best) lines.push([t('feed.record', { n: s.streak }), null]);
      else if (S.game.won) lines.push([t('feed.streak', { n: s.streak }), null]);
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

  // Ligne « Série » de la fenêtre de scénario (mode jour).
  function streakRow() {
    const live = dailyStreak();
    const best = S.stats.daily.best;
    if (!live) return [t('sc.streak'), best ? t('sc.noStreakBest', { best }) : t('sc.noStreak')];
    return [t('sc.streak'), t('sc.streakRun', { n: live, best }), live];
  }

  // Perso du jour indisponible : sans compte, en chargement, ou serveur injoignable.
  function renderDailyGate(box) {
    const main = el('div');
    const action = (label, fn) => {
      const b = el('button', 'link link--strong', label);
      b.addEventListener('click', fn);
      return b;
    };
    const toEndless = () => { S.mode = 'endless'; store.set('mode', S.mode); A.loadGame(); A.render(); };
    if (S.dailyStatus === 'loading') {
      main.append(el('h2', 'scenario__title', t('daily.loading')));
    } else {
      const locked = S.dailyStatus === 'locked';
      main.append(el('h2', 'scenario__title', t(locked ? 'daily.lockedTitle' : 'daily.offlineTitle')));
      main.append(el('p', 'panel__text', t(locked ? 'daily.lockedText' : 'daily.offlineText')));
      const actions = el('div', 'scenario__actions');
      actions.append(
        locked ? action(S.loggingIn ? t('acc.connecting') : t('acc.loginDiscord'), A.login) : action(t('daily.retry'), () => { S.dailyStatus = 'loading'; A.render(); A.loadDaily(); }),
        action(t('daily.playEndless'), toEndless),
      );
      main.append(actions);
    }
    box.append(main);
  }

  // Indice du perso du jour : image fournie par le serveur, chargée une fois par niveau.
  function dailyHintImage(side) {
    const key = `${S.game.day}:${S.game.hint}`;
    if (S.dailyHint?.key !== key) {
      if (S.dailyHint?.url) URL.revokeObjectURL(S.dailyHint.url);
      S.dailyHint = { key, url: undefined };
      online.dailyHint().then((url) => {
        if (S.dailyHint?.key === key) { S.dailyHint.url = url; renderScenario(); } else if (url) URL.revokeObjectURL(url);
      }).catch(() => { if (S.dailyHint?.key === key) S.dailyHint = null; });
    }
    if (S.dailyHint?.url) {
      const p = el('div', 'portrait portrait--lg hint__img');
      const img = el('img');
      img.src = S.dailyHint.url; img.alt = ''; img.draggable = false;
      p.style.setProperty('--blur', '3px');
      p.append(img);
      side.append(p);
    } else side.append(el('div', 'hint__locked', '?'));
  }

  function renderScenario() {
    const box = $('scenario');
    box.replaceChildren();
    if (S.mode === 'daily' && S.dailyStatus !== 'ready') { renderDailyGate(box); return; }
    const main = el('div');
    const side = el('div', 'scenario__side');
    if (S.game.done) renderFinished(main, side);
    else renderRunning(main, side);
    box.append(main, side);
  }

  // Partie terminée : le personnage, le résultat et le partage.
  function renderFinished(main, side) {
    const n = S.game.guesses.length;
    const target = S.game.target ?? { name: '???', manhwa: null };
    main.append(el('h2', 'scenario__title', S.game.won ? t('sc.won') : t('sc.lost')));
    const res = el('div', 'result');
    const txt = el('div');
    txt.append(el('div', 'result__name', target.name), el('div', 'result__manhwa', manhwaById.get(target.manhwa)?.title ?? ''));
    res.append(txt);
    main.append(res);
    main.append(rows([
      [t('sc.guesses'), '', n],
      [t('sc.reward'), S.game.won ? t('sc.coins') : t('sc.noReward'), S.game.won ? I.integer(reward(n)) : undefined],
      ...(S.mode === 'daily' ? [streakRow(), [t('sc.next'), t('sc.in', { time: untilMidnight() })]] : []),
    ]));
    const actions = el('div', 'scenario__actions');
    actions.append(shareButton());
    if (S.mode === 'endless') {
      const again = el('button', 'link link--strong', t('sc.nextScenario'));
      again.addEventListener('click', () => { A.newEndlessGame(); A.render(); $('search').focus(); });
      actions.append(again);
    }
    main.append(actions);
    side.append(A.portrait(target, 'lg'));
  }

  function shareButton() {
    const share = el('button', 'link link--strong', t('sc.share'));
    share.addEventListener('click', async () => {
      // Appli de bureau : image de la zone de jeu. Navigateur : texte (une page ne peut pas se capturer).
      if (typeof window.manhwadle.shareImage === 'function') {
        A.closeSuggestions();
        share.textContent = (await window.manhwadle.shareImage()) ? t('sc.imageCopied') : t('sc.copyFailed');
        setTimeout(() => { share.textContent = t('sc.share'); }, 1800);
        return;
      }
      const text = L.shareText({
        daily: S.mode === 'daily', day: S.game.day, won: S.game.won, streak: dailyStreak(), url: SITE_URL, lang: I.lang,
        rows: S.game.guesses.map((id) => A.resultsFor(id).map((r) => r.state)),
      });
      share.textContent = (await copyText(text)) ? t('sc.textCopied') : t('sc.copyFailed');
      setTimeout(() => { share.textContent = t('sc.share'); }, 1800);
    });
    return share;
  }

  // Partie en cours : les conditions du scénario et l'indice.
  function renderRunning(main, side) {
    const n = S.game.guesses.length;
    const pool = poolFor(S.mode);
    main.append(el('h2', 'scenario__title', S.mode === 'daily' ? t('sc.titleDaily') : t('sc.titleEndless')));
    main.append(rows([
      [t('sc.category'), S.mode === 'daily' ? t('sc.main') : t('sc.side')],
      [t('sc.difficulty'), t(`rank.${gameRank()}`)],
      [t('sc.goal'), t('sc.goalText', { n: pool.length })],
      [t('sc.timeLimit'), S.mode === 'daily' ? t('sc.untilMidnight', { time: untilMidnight() }) : t('sc.none')],
      [t('sc.reward'), t('sc.coins'), I.integer(reward(n + 1))],
      ...(S.mode === 'daily' ? [streakRow()] : []),
      [t('sc.failure'), S.mode === 'daily' ? '???' : t('sc.giveUp')],
    ]));
    renderHint(side, n);
  }

  function renderHint(side, n) {
    const [first, clear] = L.hintsAt(gameRank());
    if (n < first) {
      const left = first - n;
      side.append(el('div', 'hint__locked', left), el('div', 'scenario__note system', t('hint.locked', { n: left })));
      return;
    }
    if (S.mode === 'daily') dailyHintImage(side);
    else {
      const p = A.portrait(S.game.target, 'lg');
      p.classList.add('hint__img');
      p.style.setProperty('--blur', n >= clear ? '6px' : '14px');
      side.append(p);
    }
    const noImage = S.mode === 'daily' && S.dailyHint?.url === null;
    side.append(el('div', 'scenario__note system', noImage ? t('hint.none') : n >= clear ? t('hint.clear') : t('hint.blurry', { at: clear })));
  }

  function untilMidnight() {
    // Le perso du jour change à minuit UTC, pour tout le monde.
    const now = new Date();
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const m = Math.ceil((next - now.getTime()) / 60000);
    return t('time', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
  }

  Object.assign(A, { renderFeed, renderScenario });
})();
