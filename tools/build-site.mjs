#!/usr/bin/env node
// Assemble la version navigateur dans site/ (publiée sur GitHub Pages par la CI).
//   node tools/build-site.mjs
// site/index.html est la page du jeu avec <base href="src/"> : tous les chemins relatifs
// (scripts, styles, données, portraits) restent ceux de la version Electron.
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');

await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
for (const dir of ['src', 'data', 'assets/fonts', 'assets/characters']) {
  await cp(join(root, dir), join(site, dir), { recursive: true });
}
const html = await readFile(join(root, 'src/index.html'), 'utf8');
await writeFile(join(site, 'index.html'), html.replace('<head>', '<head>\n  <base href="src/">'));
await writeFile(join(site, '.nojekyll'), '');
console.log('site/ prêt');
