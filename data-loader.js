// Données du jeu, lues par le processus principal : la page tourne en bac à sable sans accès disque.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function loadGameData(root = __dirname) {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const manhwas = read('data/manhwas.json');
  const characters = read('data/characters.json').map((c) => {
    const file = path.join(root, 'assets/characters', c.manhwa, `${c.id}.webp`);
    return { ...c, image: fs.existsSync(file) ? pathToFileURL(file).href : null };
  });
  // Mode démo (dev) : MANHWADLE_DEMO="id1,id2" rejoue des essais, MANHWADLE_TYPE="@orv" pré-remplit
  // la recherche. Lecture seule côté page ; sans ces variables, rien ne change.
  const { MANHWADLE_DEMO: guesses, MANHWADLE_TYPE: type } = process.env;
  const demo = guesses || type ? { guesses: (guesses ?? '').split(',').filter(Boolean), type: type ?? '' } : null;
  return { manhwas, characters, demo };
}

module.exports = { loadGameData };
