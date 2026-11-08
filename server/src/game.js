// Règles côté serveur : personnage du jour, comparaison des essais et mise à jour de la série.
// Pur (sans base ni réseau) : testé directement avec node:test.
import Logic from '../../src/logic.js';

export const MAX_GUESSES = 60;
const DAY_MS = 864e5;

const dayToTime = (day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
export const addDays = (day, n) => new Date(dayToTime(day) + n * DAY_MS).toISOString().slice(0, 10);
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Personnages du perso du jour : ceux du webtoon, les personnages propres aux romans restent au mode infini. */
export const dailyCharacters = Logic.dailyCharacters;

/** Choisit le personnage du jour à partir d'une empreinte secrète (octets), indépendamment de l'ordre du fichier. */
export function pickDailyId(characters, digest) {
  const ids = characters.map((c) => c.id).sort();
  return ids[new DataView(digest).getUint32(0) % ids.length];
}

/** Comparaison d'un essai, réduite à ce que le joueur doit savoir : rien sur le personnage mystère au-delà des états. */
export const guessResults = (guess, target) =>
  Logic.compare(guess, target).map(({ key, state, dir }) => ({ key, state, ...(dir ? { dir } : {}) }));

/** Nouvelles statistiques d'un joueur après une partie du jour (déjà validée). */
export function nextStats(user, game) {
  if (user.last_day && game.day <= user.last_day) throw new Error('Scénario déjà joué (ou plus ancien que le dernier joué).');
  const continues = user.last_day === addDays(game.day, -1);
  const streak = game.won ? (continues ? user.streak + 1 : 1) : 0;
  return {
    streak,
    best: Math.max(user.best, streak),
    played: user.played + 1,
    won: user.won + (game.won ? 1 : 0),
    guesses: user.guesses + (game.won ? game.guesses : 0),
    last_day: game.day,
  };
}

/** Série affichée : rompue si le dernier jour joué date d'avant-hier (marge d'un jour pour les fuseaux). */
export const liveStreak = (user, now = Date.now()) =>
  user.last_day && user.last_day >= addDays(utcDay(now), -2) ? user.streak : 0;
