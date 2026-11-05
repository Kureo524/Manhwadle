// Compte en ligne : connexion, réglages, classement et onglets correspondants.
(function () {
  'use strict';
  const A = window.App;
  const { L, I, t, SITE_URL, $, online, S, el, initials, button, rows } = A;

  async function syncAccount() {
    if (!online?.signedIn) { S.profile = null; A.render(); return; }
    try {
      A.applyProfile(await online.me());
      if (S.mode === 'daily' && S.dailyStatus !== 'loading') { await A.loadDaily(); return; }
    } catch (e) {
      if (e.status === 401) { S.profile = null; S.accountMsg = t('msg.sessionExpired'); }
      else if (!S.profile) S.accountMsg = t('msg.offline');
    }
    A.render();
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
    A.render();
    const error = await online.login((code) => {
      S.loginCodeShown = code;
      S.accountMsg = '';
      renderView();
    });
    S.loggingIn = false;
    S.loginCodeShown = null;
    S.accountMsg = error ? t(`login.${error}`) : '';
    if (error) { renderAccount(); renderView(); return; }
    A.setView('account');
    await syncAccount();
  }

  // Plus de compte sur cet appareil : la partie du jour ne doit plus s'afficher.
  function forgetDaily() {
    S.dailyGame = null;
    if (S.dailyHint?.url) URL.revokeObjectURL(S.dailyHint.url);
    S.dailyHint = null;
    if (S.mode === 'daily') A.loadGame();
  }

  async function logout() {
    await online.logout().catch(() => {});
    S.profile = null;
    forgetDaily();
    S.accountMsg = t('msg.loggedOut');
    A.render();
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
    A.render();
  }

  async function toggleBoard() {
    try {
      A.applyProfile(await online.setShowOnBoard(S.profile.showOnBoard === false));
      S.accountMsg = t(S.profile.showOnBoard ? 'msg.boardOn' : 'msg.boardOff');
    } catch {
      S.accountMsg = t('msg.actionFailed');
    }
    A.render();
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
      A.render();
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
    A.render();
    loadBoard();
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
      me.addEventListener('click', () => A.setView('account'));
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
      parts.push(actionsOf(button('link', t('rank.join'), () => A.setView('account'))));
    }
    return panel(t('rank.title'), ...parts);
  }

  function renderView() {
    const box = $('view');
    box.hidden = S.view === 'game';
    if (box.hidden) return;
    box.replaceChildren(S.view === 'ranking' ? rankingView() : accountView());
  }

  Object.assign(A, { syncAccount, loadBoard, login, renderAccount, renderView });
})();
