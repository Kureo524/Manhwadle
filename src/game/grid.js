// Tableau des essais : portraits, cases et comparaison de chaque essai.
(function () {
  'use strict';
  const A = window.App;
  const { L, I, t, byId, manhwaById, $, S, el, initials } = A;

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

  // Comparaison d'un essai : calculée ici en infini, reçue du serveur pour le perso du jour.
  function resultsFor(id) {
    const c = byId.get(id);
    if (!S.game.results) return L.compare(c, S.game.target);
    const states = S.game.results.get(id);
    return L.COLUMNS.map((col) => ({ ...col, value: c[col.key], ...states.find((r) => r.key === col.key) }));
  }

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

    if (!S.game.guesses.length) {
      const empty = el('div', 'grid__empty');
      empty.append(el('span', '', t('grid.empty')));
      grid.append(empty);
      return;
    }

    [...S.game.guesses].reverse().forEach((id, row) => {
      const c = byId.get(id);
      const who = el('div', 'who');
      who.append(portrait(c));
      const txt = el('div');
      txt.append(el('div', 'who__name', c.name), el('div', 'who__manhwa', manhwaById.get(c.manhwa).title));
      who.append(txt);
      const cells = [who, ...resultsFor(id).map(cell)];
      cells.forEach((node, i) => {
        if (row === 0 && animateFirst) { node.classList.add('reveal'); node.style.animationDelay = `${i * 70}ms`; }
        // Nom de la colonne (repris de l'en-tête), affiché dans les cartes d'essai sur téléphone.
        if (i > 0) node.dataset.label = grid.children[i].textContent;
        grid.append(node);
      });
    });
  }

  Object.assign(A, { portrait, resultsFor, renderGrid });
})();
