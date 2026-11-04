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

test('perso du jour stable et indépendant de l\'ordre', () => {
  const a = L.dailyCharacter(chars, '2026-11-04');
  const b = L.dailyCharacter([...chars].reverse(), '2026-11-04');
  assert.equal(a.id, b.id);
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
  assert.deepEqual(L.parseQuery('@t', manhwas).choices.map((m) => m.id).sort(), ['tbate', 'twatf']);
  assert.equal(L.parseQuery('kim dokja', manhwas).text, 'kim dokja');
  const orv = L.search(chars, '', new Set(), Infinity, 'orv');
  assert.equal(orv.length, chars.filter((c) => c.manhwa === 'orv').length);
  assert.ok(L.search(chars, 'kim', new Set(), Infinity, 'orv').every((c) => c.manhwa === 'orv'));
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
});

test('sauvegarde : aller-retour, accents, code modifié refusé', () => {
  const stats = { daily: { played: 5, won: 4, streak: 3, best: 4, totalGuesses: 20, lastDay: '2026-11-04', coins: 2500 },
    endless: { played: 2, won: 1, streak: 0, best: 1, totalGuesses: 6, lastDay: null, coins: 700, note: 'é' } };
  const code = L.encodeSave(stats);
  assert.match(code, /^MWD1-[A-Za-z0-9_-]+-[a-z0-9]+$/);
  assert.deepEqual(L.decodeSave(code), stats);
  const tampered = code.replace(/-([a-z0-9]+)$/, (m, c) => `-${c === 'a' ? 'b' : 'a'}`);
  assert.throws(() => L.decodeSave(tampered), /modifié/);
  assert.throws(() => L.decodeSave('bonjour'), /code de sauvegarde/);
  const bad = L.encodeSave({ daily: { played: -1 }, endless: {} });
  assert.throws(() => L.decodeSave(bad), /modifié/);
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
