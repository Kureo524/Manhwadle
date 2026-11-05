// Routes de l'API, exécutées sur le vrai Worker, avec une base D1 locale jetable.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

// Asynchrone : un appel bloquant gèlerait le proxy du Worker, qui tourne dans ce même processus.
const sql = async (command) => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    join(server, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'manhwadle', '--local', '--persist-to', persist, '--json', '--command', command,
  ], { cwd: server, encoding: 'utf8', timeout: 30000 });
  return JSON.parse(stdout)[0].results;
};

before(async () => {
  if (skip) return;
  const wrangler = join(server, 'node_modules/wrangler/bin/wrangler.js');
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'manhwadle', '--local', '--persist-to', persist], { cwd: server, stdio: 'ignore' });
  const { unstable_dev: dev } = await import('wrangler');
  worker = await dev(join(server, 'src/index.js'), {
    config: join(server, 'wrangler.toml'), local: true, persistTo: persist, logLevel: 'none', testScheduled: true,
    vars: { DAILY_SECRET: 'secret-de-test' },
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
  await sql(`INSERT INTO users (id, name) VALUES ('purge', 'Test');
       INSERT INTO sessions VALUES ('vieille', 'purge', '${past}'), ('valide', 'purge', '${future}');
       INSERT INTO oauth_states (state, expires_at) VALUES ('vieux', '${past}'), ('valide', '${future}');
       INSERT INTO login_polls (poll_hash, error, expires_at) VALUES ('vieux', 'annule', '${past}'), ('valide', 'annule', '${future}');`);
  assert.equal((await worker.fetch('/__scheduled?cron=0+4+*+*+*')).status, 200);
  await new Promise((r) => setTimeout(r, 300));
  const left = async (table, col) => (await sql(`SELECT ${col} AS k FROM ${table} WHERE ${col} IN ('vieille', 'vieux', 'valide')`)).map((r) => r.k);
  assert.deepEqual(await left('sessions', 'token_hash'), ['valide']);
  assert.deepEqual(await left('oauth_states', 'state'), ['valide']);
  assert.deepEqual(await left('login_polls', 'poll_hash'), ['valide']);
});

// ---------- Perso du jour ----------
const today = () => new Date().toISOString().slice(0, 10);
const allIds = JSON.parse(readFileSync(join(server, '../data/characters.json'), 'utf8')).map((c) => c.id);
let nextPlayer = 0;
async function newPlayer(extra = '') {
  const id = `joueur${++nextPlayer}`;
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  const publicId = randomBytes(16).toString('hex');
  await sql(`INSERT INTO users (id, name, public_id) VALUES ('${id}', '${id}', '${publicId}'); INSERT INTO sessions VALUES ('${hash}', '${id}', '2099-01-01T00:00:00.000Z'); ${extra}`);
  return { id, publicId, headers: { Authorization: `Bearer ${token}` } };
}
const daily = async (p) => (await worker.fetch('/games/daily', { headers: p.headers })).json();
const guess = (p, id, day = today()) => worker.fetch('/games/daily/guess', { method: 'POST', headers: p.headers, body: JSON.stringify({ id, day }) });
const giveUp = (p) => worker.fetch('/games/daily/give-up', { method: 'POST', headers: p.headers, body: JSON.stringify({ day: today() }) });
const targetId = async () => (await sql(`SELECT character_id AS id FROM daily_targets WHERE day = '${today()}'`))[0].id;
const wrong = async (n) => { const t = await targetId(); return allIds.filter((id) => id !== t).slice(0, n); };

test('perso du jour : connexion obligatoire', { skip }, async () => {
  for (const [path, method] of [['/games/daily', 'GET'], ['/games/daily/guess', 'POST'], ['/games/daily/give-up', 'POST'], ['/games/daily/hint', 'GET']]) {
    assert.equal((await worker.fetch(path, { method })).status, 401, path);
  }
});

test('perso du jour : la réponse n\'est jamais révélée avant la fin', { skip }, async () => {
  const p = await newPlayer();
  const start = await daily(p);
  assert.equal(start.day, today());
  assert.deepEqual(start.guesses, []);
  assert.equal(start.target, null);
  const body = await (await guess(p, (await wrong(1))[0])).text();
  assert.ok(!body.includes(await targetId()));
  const state = JSON.parse(body);
  assert.equal(state.guesses.length, 1);
  assert.deepEqual(Object.keys(state.guesses[0].results[0]).filter((k) => !['key', 'state', 'dir'].includes(k)), []);
});

test('perso du jour : le même personnage pour tous, la partie reprend ailleurs', { skip }, async () => {
  const a = await newPlayer();
  await daily(a);
  const [x, y] = await wrong(2);
  await guess(a, x);
  await guess(a, y);
  assert.deepEqual((await daily(a)).guesses.map((g) => g.id), [x, y]); // autre appareil : même état
  const b = await newPlayer();
  await daily(b);
  assert.equal((await sql(`SELECT COUNT(*) AS n FROM daily_targets WHERE day = '${today()}'`))[0].n, 1);
});

test('ancienne route : réponse claire pour les anciennes versions', { skip }, async () => {
  const p = await newPlayer();
  const res = await worker.fetch('/games/daily', { method: 'POST', headers: p.headers, body: JSON.stringify({ day: today(), guesses: ['kim-dokja'] }) });
  assert.equal(res.status, 410);
  assert.equal((await res.json()).code, 'update');
});

test('perso du jour : essais refusés', { skip }, async () => {
  const p = await newPlayer();
  await daily(p);
  const [x] = await wrong(1);
  assert.equal((await guess(p, 'inconnu')).status, 400);
  assert.equal((await guess(p, x, '2020-01-01')).status, 409);
  assert.equal((await guess(p, x)).status, 200);
  assert.equal((await guess(p, x)).status, 409);
});

test('perso du jour : victoire décidée par le serveur, comptée une seule fois', { skip }, async () => {
  const p = await newPlayer();
  await daily(p);
  await guess(p, (await wrong(1))[0]);
  const t = await targetId();
  const end = await (await guess(p, t)).json();
  assert.equal(end.done, true);
  assert.equal(end.won, true);
  assert.equal(end.target, t);
  assert.equal(end.profile.streak, 1);
  assert.equal(end.profile.guesses, 2);
  assert.equal((await guess(p, (await wrong(2))[1])).status, 409);
  assert.equal((await giveUp(p)).status, 409);
  assert.equal((await sql(`SELECT played FROM users WHERE id = '${p.id}'`))[0].played, 1);
});

test('perso du jour : l\'abandon révèle la réponse et rompt la série', { skip }, async () => {
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const p = await newPlayer();
  await sql(`UPDATE users SET streak = 4, best = 4, played = 4, won = 4, last_day = '${yesterday}' WHERE id = '${p.id}'`);
  const end = await (await giveUp(p)).json();
  assert.equal(end.done, true);
  assert.equal(end.won, false);
  assert.equal(end.profile.streak, 0);
  assert.equal(end.profile.best, 4);
  assert.ok(end.target);
});

test('perso du jour : série conservée d\'un jour à l\'autre', { skip }, async () => {
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const p = await newPlayer();
  await sql(`UPDATE users SET streak = 4, best = 4, played = 4, won = 4, guesses = 8, last_day = '${yesterday}' WHERE id = '${p.id}'`);
  await daily(p);
  assert.equal((await (await guess(p, await targetId())).json()).profile.streak, 5);
});

test('perso du jour : partie déjà comptée par une ancienne version', { skip }, async () => {
  const p = await newPlayer();
  await sql(`INSERT INTO daily_games (user_id, day, guesses, won) VALUES ('${p.id}', '${today()}', 3, 1)`);
  const state = await daily(p);
  assert.equal(state.done, true);
  assert.equal(state.won, true);
});

test('indices : verrouillés au début, puis servis sans révéler le personnage', { skip }, async () => {
  const p = await newPlayer();
  await daily(p);
  assert.equal((await worker.fetch('/games/daily/hint', { headers: p.headers })).status, 403);
  let state;
  for (const id of await wrong(6)) state = await (await guess(p, id)).json();
  assert.equal(state.hint, 1);
  const hint = await worker.fetch('/games/daily/hint', { headers: p.headers });
  const t = await targetId();
  const hasPortrait = existsSync(join(server, `hints/${t}-1.webp`));
  assert.equal(hint.status, hasPortrait ? 200 : 404);
  if (hasPortrait) assert.equal(hint.headers.get('Content-Type'), 'image/webp');
  assert.equal((await worker.fetch(`/${t}-1.webp`)).status, 401);
});

test('classement : un joueur masqué n\'apparaît pas, et la réponse est mise en cache', { skip }, async () => {
  const visible = await newPlayer(`UPDATE users SET played = 1 WHERE id = 'joueur${nextPlayer + 1}';`);
  const masque = await newPlayer(`UPDATE users SET played = 1, hidden = 1 WHERE id = 'joueur${nextPlayer + 1}';`);
  const res = await worker.fetch('/leaderboard');
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=60');
  const ids = (await res.json()).players.map((x) => x.id);
  assert.ok(ids.includes(visible.publicId));
  assert.ok(!ids.includes(masque.publicId));
  assert.ok(!ids.includes(visible.id), 'identifiant Discord absent');
});

test('classement : sans l\'identifiant Discord, et le joueur peut en sortir', { skip }, async () => {
  const p = await newPlayer();
  await sql(`UPDATE users SET played = 1, avatar = 'abc', name = 'Pseudo' WHERE id = '${p.id}'`);
  const me = await (await worker.fetch('/me', { headers: p.headers })).json();
  assert.equal(me.id, p.publicId);
  assert.equal(me.showOnBoard, true);
  assert.equal(me.avatar, `/avatar/${p.publicId}?v=abc`);
  assert.ok(!JSON.stringify(me).includes(p.id));
  const off = await worker.fetch('/me/settings', { method: 'POST', headers: p.headers, body: JSON.stringify({ showOnBoard: false }) });
  assert.equal((await off.json()).showOnBoard, false);
  assert.equal((await sql(`SELECT show_on_board AS v FROM users WHERE id = '${p.id}'`))[0].v, 0);
  assert.equal((await worker.fetch('/me/settings', { method: 'POST', headers: p.headers, body: '{"showOnBoard":"non"}' })).status, 400);
});

test('avatar : identifiant inconnu ou joueur sans avatar', { skip }, async () => {
  const p = await newPlayer();
  assert.equal((await worker.fetch('/avatar/pas-un-id')).status, 404);
  assert.equal((await worker.fetch(`/avatar/${'0'.repeat(32)}`)).status, 404);
  assert.equal((await worker.fetch(`/avatar/${p.publicId}`)).status, 404);
});

test('export : toutes les données du joueur, et seulement les siennes', { skip }, async () => {
  const p = await newPlayer();
  const other = await newPlayer();
  await daily(p);
  await guess(p, (await wrong(1))[0]);
  await sql(`INSERT INTO daily_games (user_id, day, guesses, won) VALUES ('${other.id}', '2026-11-01', 3, 1)`);
  assert.equal((await worker.fetch('/me/export')).status, 401);
  const res = await worker.fetch('/me/export', { headers: p.headers });
  assert.match(res.headers.get('Content-Disposition'), /attachment/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const data = await res.json();
  assert.equal(data.account.discordId, p.id);
  assert.equal(data.dailyGuesses.length, 1);
  assert.equal(data.dailyGames.length, 0);
  assert.equal(data.sessions.length, 1);
  assert.ok(!JSON.stringify(data).includes('token_hash'));
});

test('déconnexion de tous les appareils', { skip }, async () => {
  const p = await newPlayer();
  const token2 = randomBytes(32).toString('base64url');
  await sql(`INSERT INTO sessions VALUES ('${createHash('sha256').update(token2).digest('hex')}', '${p.id}', '2099-01-01T00:00:00.000Z')`);
  const second = { Authorization: `Bearer ${token2}` };
  assert.equal((await worker.fetch('/me', { headers: second })).status, 200);
  assert.equal((await worker.fetch('/auth/logout-all', { method: 'POST', headers: p.headers })).status, 200);
  assert.equal((await worker.fetch('/me', { headers: p.headers })).status, 401);
  assert.equal((await worker.fetch('/me', { headers: second })).status, 401);
});

test('suppression du compte : plus aucune donnée', { skip }, async () => {
  const p = await newPlayer();
  await daily(p);
  await guess(p, (await wrong(1))[0]);
  assert.equal((await worker.fetch('/me', { method: 'DELETE', headers: p.headers })).status, 200);
  for (const table of ['sessions', 'daily_games', 'daily_guesses', 'login_polls']) {
    assert.equal((await sql(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = '${p.id}'`))[0].n, 0, table);
  }
  assert.equal((await sql(`SELECT COUNT(*) AS n FROM users WHERE id = '${p.id}'`))[0].n, 0);
});

test('comptes inactifs depuis 2 ans supprimés, les autres gardés', { skip }, async () => {
  const old = await newPlayer();
  const kept = await newPlayer();
  const recent = new Date(Date.now() - 700 * 864e5).toISOString().slice(0, 10);
  await sql(`UPDATE users SET last_seen = '2020-01-01' WHERE id = '${old.id}'; UPDATE users SET last_seen = '${recent}' WHERE id = '${kept.id}'`);
  assert.equal((await worker.fetch('/__scheduled?cron=0+4+*+*+*')).status, 200);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await sql(`SELECT COUNT(*) AS n FROM users WHERE id = '${old.id}'`))[0].n, 0);
  assert.equal((await sql(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = '${old.id}'`))[0].n, 0);
  assert.equal((await sql(`SELECT COUNT(*) AS n FROM users WHERE id = '${kept.id}'`))[0].n, 1);
});

test('dernière connexion mise à jour à l\'usage', { skip }, async () => {
  const p = await newPlayer();
  await sql(`UPDATE users SET last_seen = '2025-01-01' WHERE id = '${p.id}'`);
  await worker.fetch('/me', { headers: p.headers });
  assert.equal((await sql(`SELECT last_seen AS v FROM users WHERE id = '${p.id}'`))[0].v, today());
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
