const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/logic.js');
const chars = require('../data/characters.json');
const manhwas = require('../data/manhwas.json');

test('comparaison exacte', () => {
  assert.equal(L.compareValue('exact', 'Homme', 'Homme').state, 'ok');
  assert.equal(L.compareValue('exact', 'Homme', 'Femme').state, 'no');
});

test('comparaison d\'ensembles : identique, partielle, différente', () => {
  assert.equal(L.compareValue('set', ['Épée', 'Aura'], ['Aura', 'Épée']).state, 'ok');
  assert.equal(L.compareValue('set', ['Épée'], ['Épée', 'Aura']).state, 'partial');
  assert.equal(L.compareValue('set', ['Magie'], ['Épée']).state, 'no');
});

test('chapitres : flèche vers la bonne réponse, proche si écart <= 10', () => {
  assert.deepEqual(L.compareValue('chapter', 10, 10), { state: 'ok' });
  assert.deepEqual(L.compareValue('chapter', 10, 15), { state: 'partial', dir: 'up' });
  assert.deepEqual(L.compareValue('chapter', 100, 15), { state: 'no', dir: 'down' });
});

test('valeur inconnue : pas de verdict', () => {
  assert.equal(L.compareValue('set', ['?'], ['Noir']).state, 'unknown');
  assert.equal(L.compareValue('chapter', null, 3).state, 'unknown');
});

test('jour du perso du jour : le même partout, en UTC', () => {
  assert.equal(L.utcDayKey(new Date('2026-11-04T23:59:59Z')), '2026-11-04');
  assert.equal(L.utcDayKey(new Date('2026-11-05T00:00:00Z')), '2026-11-05');
  assert.equal(L.utcDayKey(new Date('2026-11-05T00:30:00+02:00')), '2026-11-04');
});

test('recherche insensible aux accents, préfixe en premier', () => {
  const r = L.search(chars, 'sofia');
  assert.equal(r[0].id, 'sofia-vargera');
  assert.equal(L.search(chars, 'kim')[0].name.startsWith('Kim'), true);
});

test('données : ids uniques, manhwa connu, champs complets', () => {
  const ids = new Set();
  const known = new Set(manhwas.map((m) => m.id));
  for (const c of chars) {
    assert.ok(!ids.has(c.id), `id en double : ${c.id}`);
    ids.add(c.id);
    assert.ok(known.has(c.manhwa), `${c.id} : manhwa inconnu`);
    for (const k of ['species', 'affiliations', 'powers', 'hair']) assert.ok(Array.isArray(c[k]) && c[k].length, `${c.id}.${k}`);
    assert.ok(['Homme', 'Femme', 'Inconnu'].includes(c.gender), `${c.id}.gender`);
    assert.ok(['Protagoniste', 'Allié', 'Antagoniste', 'Neutre'].includes(c.role), `${c.id}.role`);
    assert.ok(['Vivant', 'Mort', 'Inconnu'].includes(c.status), `${c.id}.status`);
    assert.ok(c.chapter === null || Number.isInteger(c.chapter), `${c.id}.chapter`);
  }
});

test('portraits : aucun doublon (erreur fréquente des wikis)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const seen = new Map();
  for (const c of chars) {
    const file = path.join(__dirname, '..', 'assets/characters', c.manhwa, `${c.id}.webp`);
    if (!fs.existsSync(file)) continue;
    const h = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
    assert.ok(!seen.has(h), `${c.id} a le même portrait que ${seen.get(h)}`);
    seen.set(h, c.id);
  }
});

test('recherche @manhwa : tag exact, début de tag, choix ambigu', () => {
  assert.equal(L.parseQuery('@ORV', manhwas).manhwa.id, 'orv');
  assert.equal(L.parseQuery('@orv kim', manhwas).text, 'kim');
  assert.equal(L.parseQuery('@tb', manhwas).manhwa.id, 'tbate');
  assert.equal(L.parseQuery('@reincarnator', manhwas).manhwa.id, 'rein');
  assert.equal(L.parseQuery('@', manhwas).choices.length, manhwas.length);
  assert.deepEqual(L.parseQuery('@t', manhwas).choices.map((m) => m.id).sort(), ['sashimi', 'tbate', 'traits', 'twatf']);
  assert.equal(L.parseQuery('kim dokja', manhwas).text, 'kim dokja');
  const orv = L.search(chars, '', new Set(), Infinity, 'orv');
  assert.equal(orv.length, chars.filter((c) => c.manhwa === 'orv').length);
  assert.ok(L.search(chars, 'kim', new Set(), Infinity, 'orv').every((c) => c.manhwa === 'orv'));
});

test('nouvelles œuvres : retrouvées sous leurs autres titres', () => {
  for (const [tag, id] of [['@solo', 'solo'], ['@suicide', 'sss'], ['@revival', 'sss'], ['@ranker', 'rgl'], ['@blinker', 'blink'], ['@genius', 'ags'], ['@sashimi', 'sashimi'], ['@13', 'traits']]) {
    assert.equal(L.parseQuery(tag, manhwas).manhwa?.id, id, tag);
  }
});

test('personnages des romans : hors perso du jour, sans chapitre de webtoon', () => {
  const novels = chars.filter((c) => c.novel);
  assert.ok(novels.length > 0);
  for (const c of novels) assert.equal(c.chapter, null, c.id);
  const daily = L.dailyCharacters(chars);
  assert.equal(daily.length, chars.length - novels.length);
  assert.ok(daily.every((c) => !c.novel));
  // Chaque œuvre garde au moins un personnage hors romans : son filtre n'est jamais vide.
  for (const m of manhwas) assert.ok(daily.some((c) => c.manhwa === m.id), m.id);
});

test('réponse possible : pas de fiche trop lacunaire', () => {
  const base = { species: ['Humain'], affiliations: ['?'], powers: ['?'], hair: ['Noir'] };
  assert.equal(L.isTargetable(base), true);
  assert.equal(L.isTargetable({ ...base, hair: ['?'] }), false);
  // Chaque œuvre sauf 13HT (une seule fiche, encore lacunaire) a des réponses possibles.
  const daily = L.dailyCharacters(chars).filter(L.isTargetable);
  for (const m of manhwas) if (m.id !== 'traits') assert.ok(daily.some((c) => c.manhwa === m.id), m.id);
});

test('série vivante : comptée aujourd\'hui et demain, rompue après', () => {
  const s = { streak: 4, lastDay: '2026-11-04' };
  assert.equal(L.liveStreak(s, '2026-11-04'), 4);
  assert.equal(L.liveStreak(s, '2026-11-05'), 4);
  assert.equal(L.liveStreak(s, '2026-11-06'), 0);
  assert.equal(L.liveStreak({ streak: 0, lastDay: '2026-11-04' }, '2026-11-04'), 0);
  assert.equal(L.liveStreak(s, '2026-12-01'), 0);
});

test('numéro du scénario du jour', () => {
  assert.equal(L.dayNumber('2026-11-04'), 1);
  assert.equal(L.dayNumber('2026-11-05'), 2);
  assert.equal(L.dayNumber('2027-01-01'), 59);
});

test('partage : grille sans spoiler', () => {
  const t = L.shareText({ daily: true, day: '2026-11-05', won: true, streak: 3, url: 'https://x',
    rows: [['no', 'ok', 'partial', 'unknown'], ['ok', 'ok', 'ok', 'ok']] });
  assert.equal(t, 'Manhwadle — Scénario #2\n[Réussi en 2 essais · série de 3 jours]\n🟥🟩🟨⬜\n🟩🟩🟩🟩\nhttps://x');
  assert.ok(L.shareText({ daily: false, won: false, rows: [['no']] }).includes('[Échec après 1 essai]'));
  const en = L.shareText({ daily: true, day: '2026-11-05', won: true, streak: 3, url: 'https://x', lang: 'en',
    rows: [['no', 'ok'], ['ok', 'ok']] });
  assert.equal(en, 'Manhwadle — Scenario #2\n[Cleared in 2 guesses · 3-day streak]\n🟥🟩\n🟩🟩\nhttps://x');
  assert.ok(L.shareText({ daily: false, won: false, rows: [['no']], lang: 'en' }).includes('[Failed after 1 guess]'));
});

test('mise à l\'échelle de la fenêtre : complète, puis compacte quand trop étroite', () => {
  const { zoomFor, BASE_WIDTH, MIN_ZOOM } = require('../window-fit.js');
  assert.equal(zoomFor(1858), 1);
  assert.equal(zoomFor(BASE_WIDTH), 1);
  assert.ok(Math.abs(zoomFor(930) - 930 / BASE_WIDTH) < 1e-9);
  assert.equal(zoomFor(Math.ceil(BASE_WIDTH * MIN_ZOOM)) >= MIN_ZOOM, true);
  // Trop étroite : mise en page compacte (< 760 px CSS), texte jamais sous 70 %.
  for (const w of [400, 458, 600, 700, 800]) {
    const z = zoomFor(w);
    assert.ok(z >= 0.7 && w / z < 760, `${w} px → zoom ${z}`);
  }
});

test('traductions : mêmes clés en français et en anglais, aucune valeur de fiche restée en français', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const ctx = {
    window: {}, document: { documentElement: {} }, navigator: { languages: ['en-US'] },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/i18n.js'), 'utf8'), ctx);
  const I = ctx.window.I18n;
  assert.equal(I.lang, 'en');
  assert.deepEqual([...I.missingKeys()], []);
  const chars = require('../data/characters.json');
  const values = new Set(chars.flatMap((c) => ['gender', 'role', 'species', 'affiliations', 'powers', 'status', 'hair']
    .flatMap((k) => (Array.isArray(c[k]) ? c[k] : [c[k]]))));
  // Une valeur affichée telle quelle en anglais ne doit pas avoir l'air française.
  const french = /[àâçéèêëîïôûùœ]|\b(de|du|des|la|le|les|et|Famille|Clan)\b/i;
  const left = [...values].filter((v) => I.value(v) === v && french.test(v));
  assert.deepEqual(left, []);
  assert.equal(I.value('Famille Glayder'), 'Glayder Family');
});

test('loginCode : code court, stable et sans caractère ambigu', () => {
  const hash = 'b1343b5c8b899314c71c1b33393d647496126fc5173376742907103c089ccd2c';
  const code = L.loginCode(hash);
  assert.match(code, /^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/);
  assert.equal(L.loginCode(hash), code);
  assert.notEqual(L.loginCode('00'.repeat(32)), L.loginCode('01'.repeat(32)));
});

test('difficulté : chaque fiche a un rang connu', () => {
  for (const c of chars) assert.ok(L.RANKS[c.rank], `${c.id} : rang ${c.rank}`);
  assert.equal(L.rankOf({}), L.DEFAULT_RANK);
  assert.equal(L.rankOf(undefined), L.DEFAULT_RANK);
  assert.equal(L.rankOf({ rank: 'Z' }), L.DEFAULT_RANK);
});

test('difficulté : plus le personnage est obscur, plus il rapporte, à tout nombre d\'essais', () => {
  const order = ['C', 'B', 'A', 'S'];
  for (let n = 1; n <= 60; n++) {
    const pay = order.map((r) => L.rewardFor(n, r));
    assert.deepEqual(pay, [...pay].sort((a, b) => a - b), `essai ${n}`);
    assert.equal(new Set(pay).size, order.length, `essai ${n}`);
  }
  for (const r of order) {
    assert.equal(L.rewardFor(1, r), L.RANKS[r].reward);
    assert.equal(L.rewardFor(60, r), L.RANKS[r].floor);
    assert.ok(L.rewardFor(0, r) === L.RANKS[r].reward);
  }
});

test('difficulté : le rang B garde les règles historiques, et le rang par défaut est B', () => {
  assert.equal(L.DEFAULT_RANK, 'B');
  for (let n = 1; n <= 30; n++) assert.equal(L.rewardFor(n, 'B'), Math.max(100, 1000 - 100 * (n - 1)));
  assert.deepEqual(L.hintsAt('B'), [6, 10]);
  assert.equal(L.rewardFor(1, 'inconnu'), 1000);
});

test('difficulté : l\'indice arrive plus tôt pour un personnage obscur', () => {
  const firsts = ['C', 'B', 'A', 'S'].map((r) => L.hintsAt(r)[0]);
  assert.deepEqual(firsts, [...firsts].sort((a, b) => b - a));
  for (const r of Object.keys(L.RANKS)) {
    const [first, clear] = L.hintsAt(r);
    assert.ok(first < clear);
    assert.equal(L.hintLevel(first - 1, r), 0);
    assert.equal(L.hintLevel(first, r), 1);
    assert.equal(L.hintLevel(clear - 1, r), 1);
    assert.equal(L.hintLevel(clear, r), 2);
  }
});
