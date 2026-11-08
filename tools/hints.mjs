#!/usr/bin/env node
// Génère les indices du perso du jour (server/hints/) à partir des portraits : images très réduites,
// servies uniquement par le Worker. Le joueur ne reçoit jamais le portrait d'origine ni son nom de fichier.
//   node tools/hints.mjs     (nécessite ImageMagick)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'server/hints');
const LEVELS = { 1: 14, 2: 40 }; // niveau d'indice → côté de l'image, en pixels
// Les personnages propres aux romans ne sont jamais personnage du jour : pas d'indice à servir.
const characters = JSON.parse(readFileSync(join(root, 'data/characters.json'), 'utf8')).filter((c) => !c.novel);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let count = 0;
for (const c of characters) {
  const source = join(root, `assets/characters/${c.manhwa}/${c.id}.webp`);
  if (!existsSync(source)) continue;
  for (const [level, size] of Object.entries(LEVELS)) {
    execFileSync('magick', [source, '-strip', '-resize', `${size}x${size}`, '-quality', '60', join(out, `${c.id}-${level}.webp`)]);
  }
  count++;
}
console.log(`server/hints/ prêt (${count} personnages sur ${characters.length})`);
