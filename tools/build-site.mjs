#!/usr/bin/env node
// Assemble la version navigateur dans site/ (publiée sur GitHub Pages par la CI).
//   node tools/build-site.mjs
// site/index.html est la page du jeu avec <base href="src/"> : tous les chemins relatifs
// (scripts, styles, données, portraits) restent ceux de la version Electron.
// Le site est aussi une PWA installable sur téléphone : manifeste, icônes et service worker
// (sw.js) qui garde tout le jeu en cache pour jouer hors ligne.
import { cp, rm, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
for (const dir of ['src', 'data', 'assets/fonts', 'assets/characters', 'assets/icons']) {
  await cp(join(root, dir), join(site, dir), { recursive: true });
}

// Les chemins de la page sont relatifs à <base href="src/"> : d'où les « ../ ».
const HEAD = `<head>
  <base href="src/">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0c0c12">
  <meta name="description" content="${pkg.description}">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Manhwadle">
  <link rel="manifest" href="../manifest.webmanifest">
  <link rel="icon" type="image/png" href="../assets/icons/favicon-64.png">
  <link rel="apple-touch-icon" href="../assets/icons/apple-touch-icon.png">`;
const html = await readFile(join(root, 'src/index.html'), 'utf8');
await writeFile(join(site, 'index.html'), html.replace('<head>', HEAD));
await writeFile(join(site, '.nojekyll'), '');

await writeFile(join(site, 'manifest.webmanifest'), JSON.stringify({
  id: './',
  name: 'Manhwadle',
  short_name: 'Manhwadle',
  description: pkg.description,
  lang: 'fr',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0c0c12',
  theme_color: '#0c0c12',
  categories: ['games', 'entertainment'],
  icons: [
    { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'assets/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
}, null, 2));

// Service worker : la liste des fichiers et leur empreinte sont figées à chaque build.
// Un contenu modifié change le nom du cache : le téléphone télécharge la nouvelle version
// en arrière-plan et l'utilise au lancement suivant.
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (!e.name.startsWith('.')) out.push(p);
  }
  return out;
}
const files = (await walk(site)).map((p) => relative(site, p).split(sep).join('/')).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(await readFile(join(site, f)));
const version = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
const sw = (await readFile(join(root, 'tools/sw.template.js'), 'utf8'))
  .replace('__VERSION__', version)
  .replace('__FILES__', JSON.stringify(['./', ...files.filter((f) => f !== 'index.html')], null, 2));
await writeFile(join(site, 'sw.js'), sw);

console.log(`site/ prêt (${files.length} fichiers, cache ${version})`);
