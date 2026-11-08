import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Logic from '../../src/logic.js';
import { dailyCharacters, nextStats, liveStreak, pickDailyId, guessResults } from '../src/game.js';

const characters = JSON.parse(readFileSync(new URL('../../data/characters.json', import.meta.url)));
const NOW = Date.UTC(2026, 10, 10, 12); // 2026-11-10 12:00 UTC
const DAY = '2026-11-10';
const digest = (n) => { const b = new ArrayBuffer(4); new DataView(b).setUint32(0, n); return b; };

test('personnage du jour : jamais un personnage propre aux romans', () => {
  const pool = dailyCharacters(characters);
  assert.ok(pool.length < characters.length);
  const novels = new Set(characters.filter((c) => c.novel).map((c) => c.id));
  for (let n = 0; n < 500; n++) assert.ok(!novels.has(pickDailyId(pool, digest(n))));
});

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
