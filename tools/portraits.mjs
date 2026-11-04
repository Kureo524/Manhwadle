#!/usr/bin/env node
// Portraits des personnages, en deux temps (le CDN d'images de Fandom refuse les scripts) :
//
//   node tools/portraits.mjs galerie   # crée assets/inbox/galerie.html : à ouvrir dans ton navigateur,
//                                      # puis clic droit > « Enregistrer l'image sous… » avec l'id comme nom,
//                                      # dans le dossier assets/inbox/
//   node tools/portraits.mjs import    # recadre chaque assets/inbox/<id>.<ext> en 320x320 WebP
//                                      # vers assets/characters/<manhwa>/<id>.webp
//
// Options : --tous (galerie : inclut aussi les persos qui ont déjà un portrait).
// Prérequis : ImageMagick 7 (`magick`). Les sources sont notées dans data/credits.json.

import { readFile, writeFile, mkdir, access, readdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inbox = join(root, 'assets/inbox');
const UA = 'Manhwadle/0.1 (jeu de fan, usage personnel)';
const SIZE = 320;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp']);

const [command, ...rest] = process.argv.slice(2);
const all = rest.includes('--tous');

const readJson = async (p, fallback) => readFile(join(root, p), 'utf8').then(JSON.parse).catch(() => fallback);
const manhwas = await readJson('data/manhwas.json');
const characters = await readJson('data/characters.json');
const byId = new Map(characters.map((c) => [c.id, c]));
const manhwaOf = Object.fromEntries(manhwas.map((m) => [m.id, m]));
const exists = (p) => access(p).then(() => true, () => false);
const portraitPath = (c) => join(root, 'assets/characters', c.manhwa, `${c.id}.webp`);
const wikiPage = (c) => manhwaOf[c.manhwa].wiki.replace(/api\.php$/, `wiki/${encodeURIComponent(c.page.replace(/ /g, '_'))}`);

async function api(wiki, params) {
  const res = await fetch(`${wiki}?${new URLSearchParams({ format: 'json', ...params })}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// URL de l'image : image principale de la page, sinon premier champ image*= de l'infobox.
async function findImage(c) {
  const wiki = manhwaOf[c.manhwa].wiki;
  const d = await api(wiki, {
    action: 'query', titles: c.page, redirects: 1,
    prop: 'pageimages|revisions', piprop: 'original', rvprop: 'content', rvslots: 'main',
  });
  const p = Object.values(d.query.pages)[0];
  if (!p || 'missing' in p) return null;
  if (p.original?.source) return p.original.source;
  const text = p.revisions?.[0]?.slots?.main?.['*'] ?? '';
  const m = text.match(/\|\s*image\d*\s*=\s*(?:<gallery>\s*)?([^|\n<}]+\.(?:png|jpe?g|webp|gif))/i);
  if (!m) return null;
  const f = await api(wiki, { action: 'query', titles: `File:${m[1].trim()}`, prop: 'imageinfo', iiprop: 'url' });
  return Object.values(f.query.pages)[0]?.imageinfo?.[0]?.url ?? null;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

async function galerie() {
  const todo = [];
  for (const c of characters) if (all || !(await exists(portraitPath(c)))) todo.push(c);
  if (!todo.length) return console.log('Tous les personnages ont déjà un portrait (--tous pour tout réafficher).');

  const sources = {};
  for (const c of todo) {
    try { sources[c.id] = await findImage(c); } catch (e) { sources[c.id] = null; console.warn(`api  ${c.id} : ${e.message}`); }
    process.stdout.write('.');
  }
  console.log();
  await mkdir(inbox, { recursive: true });
  await writeFile(join(inbox, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');

  const cards = todo.map((c) => {
    const src = sources[c.id];
    const img = src
      ? `<a href="${esc(src)}" target="_blank" rel="noreferrer"><img src="${esc(src)}" alt="${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer"></a>`
      : `<div class="none">Pas d'image sur le wiki</div>`;
    return `<article class="card" data-id="${esc(c.id)}">${img}
  <div class="meta"><b>${esc(c.name)}</b><span>${esc(manhwaOf[c.manhwa].short)}</span></div>
  <button class="id" title="Copier le nom de fichier">${esc(c.id)}</button>
  <a class="wiki" href="${esc(wikiPage(c))}" target="_blank" rel="noreferrer">page wiki</a>
</article>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Manhwadle · portraits à enregistrer</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #0c0c12; color: #e8eefa; font: 13px/1.5 system-ui, sans-serif; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  p { color: #a3a6b6; margin: 0 0 4px; max-width: 900px; }
  code, .id { font-family: ui-monospace, monospace; }
  code { color: #a9c4f0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 18px; }
  .card { background: rgba(22,22,30,.9); border: 1px solid rgba(232,238,250,.09); border-top-color: rgba(232,238,250,.24); border-left-color: rgba(232,238,250,.24); border-radius: 18px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  .card.done { opacity: .35; }
  img, .none { width: 100%; aspect-ratio: 1; object-fit: cover; object-position: top; border-radius: 12px; background: rgba(232,238,250,.06); display: grid; place-items: center; color: #8a8a9c; }
  .meta { display: flex; justify-content: space-between; gap: 6px; } .meta span { color: #8a8a9c; }
  .id { all: unset; cursor: pointer; padding: 4px 8px; border-radius: 8px; background: rgba(138,168,224,.16); color: #a9c4f0; text-align: center; }
  .id:hover { background: rgba(138,168,224,.28); }
  .wiki { color: #8a8a9c; font-size: 11px; text-align: center; }
</style></head><body>
<h1>${todo.length} portraits à enregistrer</h1>
<p>1. Clique sur l'identifiant bleu sous l'image : il est copié.</p>
<p>2. Clic droit sur l'image &gt; « Enregistrer l'image sous… », colle l'identifiant comme nom (garde l'extension), et enregistre dans <code>${esc(inbox)}</code>.</p>
<p>3. Quand c'est fait : <code>npm run portraits:import</code>. Les cartes cliquées passent en grisé pour suivre où tu en es.</p>
<p>Image absente ou mauvaise ? Le lien « page wiki » ouvre la page du perso : n'importe quelle image fait l'affaire tant que le nom est l'identifiant.</p>
<div class="grid">
${cards}
</div>
<script>
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.id');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.textContent); } catch {
      const r = document.createRange(); r.selectNodeContents(b); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy');
    }
    b.closest('.card').classList.add('done');
    const old = b.textContent; b.textContent = 'copié'; setTimeout(() => (b.textContent = old), 900);
  });
</script>
</body></html>
`;
  const out = join(inbox, 'galerie.html');
  await writeFile(out, html);
  const missing = todo.filter((c) => !sources[c.id]).map((c) => c.id);
  console.log(`Galerie : ${pathToFileURL(out).href}`);
  console.log(`${todo.length} perso(s) listé(s)${missing.length ? `, dont ${missing.length} sans image sur le wiki : ${missing.join(', ')}` : ''}`);
}

async function importer() {
  const files = (await readdir(inbox).catch(() => [])).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()));
  if (!files.length) return console.log(`Aucune image dans ${inbox}`);
  const sources = await readJson('assets/inbox/sources.json', {});
  const credits = await readJson('data/credits.json', {});
  let ok = 0;
  const unknown = [];
  for (const f of files) {
    // Tolère « kim-dokja (1).png » ou « Kim-Dokja.PNG ».
    const id = basename(f, extname(f)).toLowerCase().replace(/\s*\(\d+\)$/, '').trim();
    const c = byId.get(id);
    if (!c) { unknown.push(f); continue; }
    const out = portraitPath(c);
    await mkdir(dirname(out), { recursive: true });
    await run('magick', [`${join(inbox, f)}[0]`, '-resize', `${SIZE}x${SIZE}^`, '-gravity', 'north',
      '-extent', `${SIZE}x${SIZE}`, '-strip', '-quality', '82', out]);
    await rm(join(inbox, f));
    credits[id] = { source: sources[id]?.replace(/\/revision\/latest.*$/, '') ?? wikiPage(c), page: c.page, manhwa: c.manhwa };
    ok++;
    console.log(`ok   ${id}`);
  }
  const sorted = Object.fromEntries(Object.entries(credits).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(join(root, 'data/credits.json'), JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\n${ok} portrait(s) importé(s).`);
  if (unknown.length) console.log(`Nom de fichier ≠ identifiant, ignoré(s) : ${unknown.join(', ')}`);
}

if (command === 'galerie') await galerie();
else if (command === 'import') await importer();
else {
  console.log('Usage : node tools/portraits.mjs galerie [--tous] | import');
  process.exitCode = 1;
}
