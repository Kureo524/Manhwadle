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
