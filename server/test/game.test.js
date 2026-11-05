import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Logic from '../../src/logic.js';
import { nextStats, liveStreak, pickDailyId, guessResults, hintLevel } from '../src/game.js';

const characters = JSON.parse(readFileSync(new URL('../../data/characters.json', import.meta.url)));
const NOW = Date.UTC(2026, 10, 10, 12); // 2026-11-10 12:00 UTC
const DAY = '2026-11-10';
const digest = (n) => { const b = new ArrayBuffer(4); new DataView(b).setUint32(0, n); return b; };

test('personnage du jour : indépendant de l\'ordre du fichier, suit l\'empreinte', () => {
  assert.equal(pickDailyId(characters, digest(7)), pickDailyId([...characters].reverse(), digest(7)));
  assert.notEqual(pickDailyId(characters, digest(7)), pickDailyId(characters, digest(8)));
});

test('comparaison : seuls la colonne, l\'état et le sens sont renvoyés', () => {
  const [guess, target] = characters;
  const results = guessResults(guess, target);
  assert.equal(results.length, Logic.COLUMNS.length);
  for (const r of results) assert.deepEqual(Object.keys(r).filter((k) => !['key', 'state', 'dir'].includes(k)), []);
});

test('niveaux d\'indice selon le nombre d\'essais', () => {
  assert.equal(hintLevel(Logic.HINT_AT - 1), 0);
  assert.equal(hintLevel(Logic.HINT_AT), 1);
  assert.equal(hintLevel(Logic.HINT_CLEAR_AT - 1), 1);
  assert.equal(hintLevel(Logic.HINT_CLEAR_AT), 2);
});

test('série : continue, rompue, record, doublon refusé', () => {
  const u = { streak: 2, best: 4, played: 5, won: 4, guesses: 20, last_day: '2026-11-09' };
  assert.deepEqual(nextStats(u, { day: DAY, guesses: 3, won: true }),
    { streak: 3, best: 4, played: 6, won: 5, guesses: 23, last_day: DAY });
  assert.equal(nextStats({ ...u, last_day: '2026-11-07' }, { day: DAY, guesses: 3, won: true }).streak, 1);
  assert.equal(nextStats(u, { day: DAY, guesses: 8, won: false }).streak, 0);
  assert.equal(nextStats({ ...u, streak: 4 }, { day: DAY, guesses: 1, won: true }).best, 5);
  assert.throws(() => nextStats({ ...u, last_day: DAY }, { day: DAY, guesses: 1, won: true }), /déjà joué/);
});

test('série affichée rompue après deux jours sans jouer', () => {
  assert.equal(liveStreak({ streak: 3, last_day: '2026-11-09' }, NOW), 3);
  assert.equal(liveStreak({ streak: 3, last_day: '2026-11-07' }, NOW), 0);
});
