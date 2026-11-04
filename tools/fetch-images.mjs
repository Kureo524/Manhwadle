#!/usr/bin/env node
// Télécharge le portrait de chaque personnage depuis le wiki de son manhwa (API MediaWiki),
// le recadre en carré 320x320 (cadrage haut, pour garder le visage) et l'enregistre en WebP.
//
//   node tools/fetch-images.mjs            # ne télécharge que les images manquantes
//   node tools/fetch-images.mjs --force    # retélécharge tout
//   node tools/fetch-images.mjs kim-dokja  # un ou plusieurs ids précis
//
// Prérequis : ImageMagick 7 (`magick`) dans le PATH.
// Les sources sont notées dans data/credits.json.

import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// User-Agent configurable : MANHWADLE_UA="..." node tools/fetch-images.mjs
const UA = process.env.MANHWADLE_UA || 'Manhwadle/0.1 (jeu de fan, usage personnel)';
const SIZE = 320;

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = new Set(args.filter((a) => !a.startsWith('--')));

const manhwas = JSON.parse(await readFile(join(root, 'data/manhwas.json'), 'utf8'));
const characters = JSON.parse(await readFile(join(root, 'data/characters.json'), 'utf8'));
const creditsPath = join(root, 'data/credits.json');
const credits = await readFile(creditsPath, 'utf8').then(JSON.parse).catch(() => ({}));
const wikiOf = Object.fromEntries(manhwas.map((m) => [m.id, m.wiki]));

const exists = (p) => access(p).then(() => true, () => false);

async function api(wiki, params) {
  const url = `${wiki}?${new URLSearchParams({ format: 'json', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

// 1) image principale de la page ; 2) sinon le premier champ image*= de l'infobox.
async function findImage(wiki, page) {
  const d = await api(wiki, {
    action: 'query', titles: page, redirects: 1,
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

let ok = 0, skipped = 0;
const missing = [];
for (const c of characters) {
  if (only.size && !only.has(c.id)) continue;
  const out = join(root, 'assets/characters', c.manhwa, `${c.id}.webp`);
  if (!force && (await exists(out))) { skipped++; continue; }
  try {
    const src = await findImage(wikiOf[c.manhwa], c.page);
    if (!src) { missing.push(c.id); continue; }
    const res = await fetch(src, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tmp = join(tmpdir(), `manhwadle-${process.pid}-${c.id}`);
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    await mkdir(dirname(out), { recursive: true });
    await run('magick', [`${tmp}[0]`, '-resize', `${SIZE}x${SIZE}^`, '-gravity', 'north',
      '-extent', `${SIZE}x${SIZE}`, '-strip', '-quality', '82', out]);
    await rm(tmp, { force: true });
    credits[c.id] = { source: src.replace(/\/revision\/latest.*$/, ''), page: c.page, manhwa: c.manhwa };
    ok++;
    console.log(`ok   ${c.id}`);
  } catch (e) {
    missing.push(c.id);
    console.warn(`err  ${c.id}: ${e.message}`);
  }
}

const sorted = Object.fromEntries(Object.entries(credits).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(creditsPath, JSON.stringify(sorted, null, 2) + '\n');
console.log(`\n${ok} téléchargée(s), ${skipped} déjà présente(s), ${missing.length} sans image`);
if (missing.length) console.log(`sans image : ${missing.join(', ')}`);
