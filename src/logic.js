// Logique pure du jeu (sans DOM) : comparaison des catégories, tirage du jour, recherche.
// Chargé tel quel dans la page (window.Logic) et par les tests Node (module.exports).
(function (global) {
  'use strict';

  /** Écart de chapitres en dessous duquel une apparition est jugée « proche ». */
  const CHAPTER_CLOSE = 10;
  const UNKNOWN = '?';

  // Colonnes affichées, dans l'ordre. `kind` choisit la règle de comparaison ; les titres affichés
  // sont traduits par i18n.js (clé col.<key>).
  const COLUMNS = [
    { key: 'manhwa', label: 'Manhwa', kind: 'exact' },
    { key: 'gender', label: 'Genre', kind: 'exact' },
    { key: 'role', label: 'Rôle', kind: 'exact' },
    { key: 'species', label: 'Espèce', kind: 'set' },
    { key: 'affiliations', label: 'Affiliation', kind: 'set' },
    { key: 'powers', label: 'Pouvoir', kind: 'set' },
    { key: 'status', label: 'Statut', kind: 'exact' },
    { key: 'chapter', label: '1re apparition', kind: 'chapter' },
    { key: 'hair', label: 'Cheveux', kind: 'set' },
  ];

  const isUnknown = (v) =>
    v === null || v === undefined || v === UNKNOWN || (Array.isArray(v) && (v.length === 0 || v.includes(UNKNOWN)));

  /**
   * Compare une valeur proposée à celle du personnage mystère.
   * @returns {{state: 'ok'|'partial'|'no'|'unknown', dir?: 'up'|'down'}}
   *   dir : la bonne réponse est plus haute (up) ou plus basse (down).
   */
  function compareValue(kind, guess, target) {
    if (isUnknown(guess) || isUnknown(target)) return { state: 'unknown' };
    if (kind === 'exact') return { state: guess === target ? 'ok' : 'no' };
    if (kind === 'set') {
      const t = new Set(target);
      const common = guess.filter((g) => t.has(g)).length;
      if (common === t.size && common === new Set(guess).size) return { state: 'ok' };
      return { state: common > 0 ? 'partial' : 'no' };
    }
    if (kind === 'chapter') {
      if (guess === target) return { state: 'ok' };
      const dir = target > guess ? 'up' : 'down';
      return { state: Math.abs(target - guess) <= CHAPTER_CLOSE ? 'partial' : 'no', dir };
    }
    throw new Error(`Type de colonne inconnu : ${kind}`);
  }

  function compare(guess, target) {
    return COLUMNS.map((col) => ({ ...col, value: guess[col.key], ...compareValue(col.kind, guess[col.key], target[col.key]) }));
  }

  /** Date locale au format AAAA-MM-JJ (le perso du jour change à minuit, heure locale). */
  function dayKey(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }

  // Hachage FNV-1a 32 bits puis mélange : stable d'une machine à l'autre.
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return h >>> 0;
  }

  /** Personnage du jour : même résultat pour tout le monde à date et liste égales. */
  function dailyCharacter(characters, key = dayKey()) {
    const sorted = [...characters].sort((a, b) => a.id.localeCompare(b.id));
    return sorted[hash(`manhwadle:${key}`) % sorted.length];
  }

  const normalize = (s) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const manhwaKeys = (m) => [m.id, m.short, ...(m.tags ?? [])].map(normalize).filter(Boolean);

  /**
   * Analyse une saisie « @tag texte ». Sans @ : { text }.
   * Avec @ : { manhwa } si le tag désigne un seul manhwa (exact, ou début de tag unique),
   * sinon { choices } = manhwa possibles (tous si le tag est vide).
   */
  function parseQuery(query, manhwas) {
    const m = /^\s*@(\S*)\s*(.*)$/s.exec(query);
    if (!m) return { text: query };
    const tag = normalize(m[1]);
    const text = m[2];
    if (!tag) return { choices: manhwas, text };
    const exact = manhwas.filter((x) => manhwaKeys(x).includes(tag));
    if (exact.length === 1) return { manhwa: exact[0], text };
    const partial = manhwas.filter((x) => manhwaKeys(x).some((k) => k.startsWith(tag)) || normalize(x.title).startsWith(tag));
    if (partial.length === 1) return { manhwa: partial[0], text };
    return { choices: partial, text };
  }

  /** Suggestions pour la saisie : préfixe d'un mot d'abord, puis sous-chaîne. */
  function search(characters, query, exclude = new Set(), limit = 8, manhwa = null) {
    const q = normalize(query);
    if (!q && !manhwa) return [];
    const scored = [];
    for (const c of characters) {
      if (exclude.has(c.id) || (manhwa && c.manhwa !== manhwa)) continue;
      if (!q) { scored.push([0, c]); continue; }
      const n = normalize(c.name);
      let score = -1;
      if (n.startsWith(q)) score = 0;
      else if (n.split(' ').some((w) => w.startsWith(q))) score = 1;
      else if (n.includes(q)) score = 2;
      if (score >= 0) scored.push([score, c]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
    return scored.slice(0, limit).map(([, c]) => c);
  }

  // ---------- Série, partage ----------

  /** Date de sortie : le scénario du jour n° 1. */
  const LAUNCH_DAY = '2026-11-04';
  const DAY_MS = 864e5;
  const dayIndex = (key) => Math.round(Date.UTC(...key.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) / DAY_MS);

  /** Numéro du scénario du jour (1 le jour de la sortie). */
  const dayNumber = (key = dayKey()) => dayIndex(key) - dayIndex(LAUNCH_DAY) + 1;

  /**
   * Série en cours du mode « jour » : elle ne compte que si le dernier scénario réussi date
   * d'aujourd'hui ou d'hier (sinon elle est déjà rompue, même si le joueur n'a pas rejoué).
   */
  function liveStreak(daily, today = dayKey()) {
    if (!daily || !daily.streak || !daily.lastDay) return 0;
    const gap = dayIndex(today) - dayIndex(daily.lastDay);
    return gap === 0 || gap === 1 ? daily.streak : 0;
  }

  const SQUARE = { ok: '🟩', partial: '🟨', no: '🟥', unknown: '⬜' };

  const plural = (n, word, many = `${word}s`) => `${n} ${n > 1 ? many : word}`;
  const SHARE = {
    fr: {
      daily: (k) => `Manhwadle — Scénario #${k}`, side: 'Manhwadle — Scénario secondaire',
      won: (n, streak) => `[Réussi en ${plural(n, 'essai')}${streak ? ` · série de ${plural(streak, 'jour')}` : ''}]`,
      lost: (n) => `[Échec après ${plural(n, 'essai')}]`,
    },
    en: {
      daily: (k) => `Manhwadle — Scenario #${k}`, side: 'Manhwadle — Sub Scenario',
      won: (n, streak) => `[Cleared in ${plural(n, 'guess', 'guesses')}${streak ? ` · ${streak}-day streak` : ''}]`,
      lost: (n) => `[Failed after ${plural(n, 'guess', 'guesses')}]`,
    },
  };

  /** Texte à partager : une ligne de carrés par essai, sans nommer aucun personnage. */
  function shareText({ daily, day, won, rows, streak, url, lang = 'fr' }) {
    const tr = SHARE[lang] ?? SHARE.fr;
    const title = daily ? tr.daily(dayNumber(day)) : tr.side;
    const n = rows.length;
    const result = won ? tr.won(n, daily ? streak : 0) : tr.lost(n);
    const grid = rows.map((states) => states.map((st) => SQUARE[st] ?? SQUARE.unknown).join(''));
    return [title, result, ...grid, url].filter(Boolean).join('\n');
  }

  /**
   * Code court affiché à la fois dans l'appli installée et sur la page de confirmation du serveur,
   * dérivé de l'empreinte de connexion (64 caractères hexadécimaux). Sans I, O, 0 ni 1 : facile à comparer.
   */
  function loginCode(hash) {
    const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const chars = [];
    for (let i = 0; i < 6; i++) chars.push(ALPHABET[parseInt(hash.slice(i * 2, i * 2 + 2), 16) % ALPHABET.length]);
    return `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`;
  }

  const api = { COLUMNS, CHAPTER_CLOSE, compare, compareValue, dayKey, dailyCharacter, hash, normalize, parseQuery, search,
    LAUNCH_DAY, dayNumber, liveStreak, shareText, loginCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
