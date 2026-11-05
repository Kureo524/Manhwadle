// Connexion de l'appli installée : exécutée sur le vrai Worker, avec une base D1 locale jetable.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Logic from '../../src/logic.js';

// wrangler exige Node 22 ou plus.
const skip = Number(process.versions.node.split('.')[0]) < 22 && 'wrangler exige Node 22 ou plus';
const server = join(dirname(fileURLToPath(import.meta.url)), '..');
const persist = mkdtempSync(join(tmpdir(), 'manhwadle-d1-'));
let worker;
let origin;

const newPoll = () => {
  const key = randomBytes(32).toString('base64url');
  return { key, hash: createHash('sha256').update(key).digest('hex') };
};
const confirm = (hash, from = origin) => worker.fetch('/auth/discord/confirm', {
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(from ? { Origin: from } : {}) },
  body: new URLSearchParams({ poll: hash }).toString(),
});
const poll = async (key) => (await worker.fetch('/auth/poll', { method: 'POST', body: JSON.stringify({ poll: key }) })).json();

before(async () => {
  if (skip) return;
  const wrangler = join(server, 'node_modules/wrangler/bin/wrangler.js');
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'manhwadle', '--local', '--persist-to', persist], { cwd: server, stdio: 'ignore' });
  const { unstable_dev: dev } = await import('wrangler');
  worker = await dev(join(server, 'src/index.js'), {
    config: join(server, 'wrangler.toml'), local: true, persistTo: persist, logLevel: 'none',
    experimental: { disableExperimentalWarning: true },
  });
  // L'origine vue par le Worker, celle de sa propre redirect_uri.
  const first = await worker.fetch('/auth/discord', { redirect: 'manual' });
  origin = new URL(new URL(first.headers.get('Location')).searchParams.get('redirect_uri')).origin;
});

after(async () => {
  await worker?.stop();
  rmSync(persist, { recursive: true, force: true });
});

test('un lien ?poll= affiche une page de confirmation avec le code, sans partir chez Discord', { skip }, async () => {
  const { hash } = newPoll();
  const res = await worker.fetch(`/auth/discord?poll=${hash}`, { redirect: 'manual' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  const html = await res.text();
  assert.ok(html.includes(Logic.loginCode(hash)));
  assert.ok(!html.includes('discord.com/oauth2'));
});

test('une empreinte mal formée est refusée', { skip }, async () => {
  assert.equal((await worker.fetch('/auth/discord?poll=xyz', { redirect: 'manual' })).status, 400);
  assert.equal((await confirm('xyz')).status, 400);
});

test('la confirmation doit venir de la page elle-même', { skip }, async () => {
  const { hash } = newPoll();
  assert.equal((await confirm(hash, 'https://exemple.test')).status, 403);
  assert.equal((await confirm(hash, null)).status, 403);
});

test('après confirmation, Discord redemande toujours l\'autorisation', { skip }, async () => {
  const res = await confirm(newPoll().hash);
  assert.equal(res.status, 303);
  const url = new URL(res.headers.get('Location'));
  assert.equal(url.hostname, 'discord.com');
  assert.equal(url.searchParams.get('prompt'), 'consent');
});

test('la connexion du site et de l\'appli de bureau ne change pas', { skip }, async () => {
  const res = await worker.fetch('/auth/discord', { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(new URL(res.headers.get('Location')).searchParams.get('prompt'), 'none');
});

test('le résultat ne revient qu\'au détenteur du code, une seule fois', { skip }, async () => {
  const { key, hash } = newPoll();
  const state = new URL((await confirm(hash)).headers.get('Location')).searchParams.get('state');
  assert.deepEqual(await poll(key), { pending: true });
  const done = await worker.fetch(`/auth/discord/callback?error=access_denied&state=${state}`, { redirect: 'manual' });
  assert.equal(done.status, 400);
  assert.deepEqual(await poll(hash), { pending: true }); // l'empreinte seule ne donne rien
  assert.deepEqual(await poll(key), { error: 'annule' });
  assert.deepEqual(await poll(key), { pending: true });
});
