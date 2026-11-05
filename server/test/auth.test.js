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

const sql = (command) => JSON.parse(execFileSync(process.execPath, [
  join(server, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'manhwadle', '--local', '--persist-to', persist, '--json', '--command', command,
], { cwd: server, encoding: 'utf8' }))[0].results;

before(async () => {
  if (skip) return;
  const wrangler = join(server, 'node_modules/wrangler/bin/wrangler.js');
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'manhwadle', '--local', '--persist-to', persist], { cwd: server, stdio: 'ignore' });
  const { unstable_dev: dev } = await import('wrangler');
  worker = await dev(join(server, 'src/index.js'), {
    config: join(server, 'wrangler.toml'), local: true, persistTo: persist, logLevel: 'none', testScheduled: true,
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

test('corps trop grand refusé, même sans Content-Length', { skip }, async () => {
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('x'.repeat(2048))); c.close(); } });
  const res = await worker.fetch('/auth/poll', { method: 'POST', body: stream, duplex: 'half' });
  assert.equal(res.status, 413);
});

test('corps illisible : réponse 400, pas d\'erreur interne', { skip }, async () => {
  assert.equal((await worker.fetch('/auth/poll', { method: 'POST', body: 'pas du json' })).status, 400);
});

test('connexion du site : le state est lié au navigateur par un cookie', { skip }, async () => {
  const res = await worker.fetch('/auth/discord', { redirect: 'manual' });
  const cookie = res.headers.get('Set-Cookie');
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(cookie.includes(attr), attr);
  const state = new URL(res.headers.get('Location')).searchParams.get('state');
  assert.ok(cookie.startsWith(`__Host-manhwadle_state=${state};`));
  // Sans le cookie (lien préparé par quelqu'un d'autre), le retour est refusé avant tout appel à Discord.
  const back = await worker.fetch(`/auth/discord/callback?code=x&state=${state}`, { redirect: 'manual' });
  assert.equal(back.status, 302);
  assert.ok(back.headers.get('Location').endsWith('#login=expire'));
});

test('appli installée : aucun cookie, le résultat ne revient qu\'au détenteur du code', { skip }, async () => {
  assert.equal((await confirm(newPoll().hash)).headers.get('Set-Cookie'), null);
});

test('la purge quotidienne retire ce qui est expiré, et seulement cela', { skip }, async () => {
  const past = '2020-01-01T00:00:00.000Z';
  const future = '2099-01-01T00:00:00.000Z';
  sql(`INSERT INTO users (id, name) VALUES ('purge', 'Test');
       INSERT INTO sessions VALUES ('vieille', 'purge', '${past}'), ('valide', 'purge', '${future}');
       INSERT INTO oauth_states (state, expires_at) VALUES ('vieux', '${past}'), ('valide', '${future}');
       INSERT INTO login_polls (poll_hash, error, expires_at) VALUES ('vieux', 'annule', '${past}'), ('valide', 'annule', '${future}');`);
  assert.equal((await worker.fetch('/__scheduled?cron=0+4+*+*+*')).status, 200);
  await new Promise((r) => setTimeout(r, 300));
  const left = (table, col) => sql(`SELECT ${col} AS k FROM ${table} WHERE ${col} IN ('vieille', 'vieux', 'valide')`).map((r) => r.k);
  assert.deepEqual(left('sessions', 'token_hash'), ['valide']);
  assert.deepEqual(left('oauth_states', 'state'), ['valide']);
  assert.deepEqual(left('login_polls', 'poll_hash'), ['valide']);
});

test('au-delà de la limite de débit : 429', { skip }, async () => {
  let res;
  for (let i = 0; i < 80; i++) {
    res = await worker.fetch('/leaderboard');
    if (res.status === 429) break;
  }
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '60');
});
