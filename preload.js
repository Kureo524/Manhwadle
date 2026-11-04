// Charge les données du jeu depuis le disque et les expose au rendu (lecture seule).
const { contextBridge } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = __dirname;
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const manhwas = read('data/manhwas.json');
const characters = read('data/characters.json').map((c) => {
  const file = path.join(root, 'assets/characters', c.manhwa, `${c.id}.webp`);
  return { ...c, image: fs.existsSync(file) ? pathToFileURL(file).href : null };
});

// Mode démo (dev) : MANHWADLE_DEMO="id1,id2" rejoue des essais en mode Infini,
// MANHWADLE_TYPE="@orv" pré-remplit la recherche. Sans ces variables, rien ne change.
const demo = process.env.MANHWADLE_DEMO
  ? { guesses: process.env.MANHWADLE_DEMO.split(',').filter(Boolean), type: process.env.MANHWADLE_TYPE ?? '' }
  : process.env.MANHWADLE_TYPE ? { guesses: [], type: process.env.MANHWADLE_TYPE } : null;

contextBridge.exposeInMainWorld('manhwadle', { manhwas, characters, demo });
