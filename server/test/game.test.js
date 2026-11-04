import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Logic from '../../src/logic.js';
import { validateDailyGame, nextStats, liveStreak, addDays } from '../src/game.js';

const characters = JSON.parse(readFileSync(new URL('../../data/characters.json', import.meta.url)));
const NOW = Date.UTC(2026, 10, 10, 12); // 2026-11-10 12:00 UTC
const DAY = '2026-11-10';
const target = Logic.dailyCharacter(characters, DAY).id;
const others = characters.map((c) => c.id).filter((id) => id !== target);

test('partie gagnée : le serveur reconnaît le personnage du jour', () => {
  assert.deepEqual(validateDailyGame({ day: DAY, guesses: [others[0], others[1], target] }, characters, NOW),
    { day: DAY, guesses: 3, won: true });
});

test('partie perdue (abandon) acceptée sans la bonne réponse', () => {
  assert.equal(validateDailyGame({ day: DAY, guesses: [others[0]] }, characters, NOW).won, false);
});

test('triches et erreurs refusées', () => {
  const bad = (body, re) => assert.throws(() => validateDailyGame(body, characters, NOW), re);
  bad({ day: DAY, guesses: [target, others[0]] }, /dernier essai/);
  bad({ day: DAY, guesses: [others[0], others[0]] }, /double/);
  bad({ day: DAY, guesses: ['inconnu'] }, /inconnu/);
  bad({ day: DAY, guesses: [] }, /invalide/);
  bad({ day: '2026-11-07', guesses: [others[0]] }, /plus/);   // trop ancien
  bad({ day: '2026-11-13', guesses: [others[0]] }, /plus/);   // dans le futur
  bad({ day: '2026-02-31', guesses: [others[0]] }, /Jour invalide/);
  bad({ day: '2026-10-01', guesses: [others[0]] }, /sortie/);
});

test('fuseaux : la veille et le lendemain UTC sont acceptés', () => {
  for (const d of [addDays(DAY, -1), addDays(DAY, 1)]) {
    assert.doesNotThrow(() => validateDailyGame({ day: d, guesses: [others[0]] }, characters, NOW));
  }
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
