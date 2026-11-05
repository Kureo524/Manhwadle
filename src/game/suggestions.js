// Liste de personnages sous le champ de recherche, et son clavier.
(function () {
  'use strict';
  const A = window.App;
  const { manhwas, L, t, manhwaById, $, S, poolFor, el } = A;

  // ---------- Suggestions ----------
  // Éléments : { char } (un personnage) ou { manhwa } (choix de filtre après « @ »).
  let suggestionList = [];
  let active = 0;

  function closeSuggestions() { $('suggestions').hidden = true; suggestionList = []; }

  function pick(item) {
    if (!item) return;
    if (item.char) return A.submitGuess(item.char.id);
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
    const header = fillSuggestions(q, pool, guessed);
    active = Math.min(active, Math.max(suggestionList.length - 1, 0));
    box.replaceChildren();
    const list = el('div', 'suggestions__list');
    box.append(list);
    if (header) list.append(el('div', 'suggestions__header system', `[${header}]`));
    if (!suggestionList.length) list.append(el('div', 'suggestions__empty', q.choices ? t('sugg.noManhwa') : t('sugg.noChar')));
    suggestionList.forEach((item, i) => list.append(suggestionButton(item, i, pool, guessed)));
    // Grand aperçu du personnage surligné, à droite de la liste.
    if (suggestionList.some((x) => x.char)) box.append(el('div', 'suggestions__preview'));
    renderPreview();
    box.hidden = false;
    placeSuggestions();
  }

  // Remplit la liste selon la recherche, et renvoie son en-tête éventuel.
  function fillSuggestions(q, pool, guessed) {
    if (q.choices) {
      suggestionList = q.choices.map((m) => ({ manhwa: m }));
      return t('sugg.filter');
    }
    const chars = L.search(pool, q.text, guessed, q.manhwa ? Infinity : 8, q.manhwa?.id ?? null);
    suggestionList = chars.map((c) => ({ char: c }));
    return q.manhwa ? t('sugg.count', { title: q.manhwa.title, n: chars.length }) : null;
  }

  function suggestionButton(item, i, pool, guessed) {
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
    return b;
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
  window.addEventListener('resize', () => { if (!$('suggestions').hidden) openSuggestions(); A.renderMode(); });
  document.querySelector('.stage').addEventListener('scroll', placeSuggestions, { passive: true });

  Object.assign(A, { closeSuggestions, openSuggestions });
})();
