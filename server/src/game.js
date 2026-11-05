// Règles côté serveur : validation d'une partie du jour et mise à jour de la série.
// Pur (sans base ni réseau) : testé directement avec node:test.
import Logic from '../../src/logic.js';

export const MAX_GUESSES = 60;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 864e5;

const dayToTime = (day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
export const addDays = (day, n) => new Date(dayToTime(day) + n * DAY_MS).toISOString().slice(0, 10);
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/**
 * Valide une partie du jour envoyée par un joueur et recalcule son résultat.
 * Le jour est celui du joueur (minuit local) : on accepte la veille, le jour et le lendemain UTC.
 * @returns {{ day, guesses: number, won: boolean }} ou lève une Error avec un message lisible.
 */
export function validateDailyGame(body, characters, now = Date.now()) {
  const day = body?.day;
  const ids = body?.guesses;
  if (typeof day !== 'string' || !DAY_RE.test(day) || utcDay(dayToTime(day)) !== day) throw new Error('Jour invalide.');
  if (day < Logic.LAUNCH_DAY) throw new Error('Jour antérieur à la sortie du jeu.');
  const today = utcDay(now);
  if (day < addDays(today, -1) || day > addDays(today, 1)) throw new Error('Ce scénario n\'est plus (ou pas encore) ouvert.');
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_GUESSES) throw new Error('Liste d\'essais invalide.');

  const known = new Set(characters.map((c) => c.id));
  if (ids.some((id) => typeof id !== 'string' || !known.has(id))) throw new Error('Personnage inconnu.');
  if (new Set(ids).size !== ids.length) throw new Error('Essai en double.');

  // Le serveur connaît le personnage du jour : c'est lui qui décide de la victoire.
  const target = Logic.dailyCharacter(characters, day).id;
  const at = ids.indexOf(target);
  if (at !== -1 && at !== ids.length - 1) throw new Error('Partie incohérente : la bonne réponse doit être le dernier essai.');
  return { day, guesses: ids.length, won: at === ids.length - 1 };
}

/** Choisit le personnage du jour à partir d'une empreinte secrète (octets), indépendamment de l'ordre du fichier. */
export function pickDailyId(characters, digest) {
  const ids = characters.map((c) => c.id).sort();
  return ids[new DataView(digest).getUint32(0) % ids.length];
}

/** Comparaison d'un essai, réduite à ce que le joueur doit savoir : rien sur le personnage mystère au-delà des états. */
export const guessResults = (guess, target) =>
  Logic.compare(guess, target).map(({ key, state, dir }) => ({ key, state, ...(dir ? { dir } : {}) }));

/** Niveau d'indice atteint après n essais : 0 (aucun), 1 (très flou), 2 (plus net). */
export const hintLevel = (n) => (n >= Logic.HINT_CLEAR_AT ? 2 : n >= Logic.HINT_AT ? 1 : 0);

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
