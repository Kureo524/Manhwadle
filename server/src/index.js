// API de Manhwadle (Cloudflare Worker + D1).
//
//   GET    /auth/discord            → redirige vers Discord (connexion)
//                                       (appli installée, ?poll= : page de confirmation avec un code court)
//   POST   /auth/discord/confirm    → appli installée : après confirmation, redirige vers Discord
//   GET    /auth/discord/callback   → crée la session, renvoie vers le site avec #session=<jeton>
//   POST   /auth/poll               → appli installée (PWA) : récupère la session une fois la connexion faite
//   POST   /auth/logout             → ferme la session
//   GET    /me                      → profil et statistiques du joueur
//   DELETE /me                      → supprime le compte et toutes ses données
//   POST   /games/daily             → ancienne route : partie entière envoyée par le client
//   GET    /games/daily             → partie du jour du joueur (reprise sur n'importe quel appareil)
//   POST   /games/daily/guess       → enregistre un essai, renvoie sa comparaison
//   POST   /games/daily/give-up     → abandonne la partie du jour
//   GET    /games/daily/hint        → image d'indice, selon le nombre d'essais
//   GET    /leaderboard             → classement des séries
//
// Authentification : en-tête « Authorization: Bearer <jeton> » (pas de cookie, donc pas de CSRF).
import characters from '../../data/characters.json';
import Logic from '../../src/logic.js';
import { validateDailyGame, nextStats, liveStreak, pickDailyId, guessResults, hintLevel, MAX_GUESSES, utcDay, addDays } from './game.js';

const SESSION_DAYS = 90;
const STATE_MINUTES = 10;
const STATE_COOKIE = '__Host-manhwadle_state';
const MAX_BODY = 8192;
const LEADERBOARD_SECONDS = 60;
const DAILY_KEEP_DAYS = 7; // durée de conservation du détail des essais
const byId = new Map(characters.map((c) => [c.id, c]));

// Limites de débit par route et par adresse IP (binding déclaré dans wrangler.toml).
const LIMITS = {
  'GET /auth/discord': 'LIMIT_AUTH',
  'POST /auth/discord/confirm': 'LIMIT_AUTH',
  'POST /auth/poll': 'LIMIT_POLL',
  'POST /games/daily': 'LIMIT_API',
  'GET /games/daily': 'LIMIT_API',
  'POST /games/daily/guess': 'LIMIT_API',
  'POST /games/daily/give-up': 'LIMIT_API',
  'GET /games/daily/hint': 'LIMIT_API',
  'GET /leaderboard': 'LIMIT_API',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
const fail = (message, status = 400) => json({ error: message }, status);

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const sha256 = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();

// Lit le corps avec une vraie limite : l'en-tête Content-Length peut être absent ou faux.
async function readBody(request, max = MAX_BODY) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw Object.assign(new Error('Requête trop grande.'), { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(bytes);
}

const readCookie = (request, name) => (request.headers.get('Cookie') ?? '').split(';')
  .map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

async function currentUser(request, env) {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), new Date().toISOString()).first();
}

const publicProfile = (u) => ({
  id: u.id,
  name: u.name,
  avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
  streak: liveStreak(u),
  best: u.best,
  played: u.played,
  won: u.won,
  guesses: u.guesses,
  lastDay: u.last_day,
});

// ---------- Connexion Discord ----------
const callbackUrl = (request) => new URL('/auth/discord/callback', request.url).href;

// Appli installée : ?poll=<SHA-256 hex d'un code secret gardé par l'appli>. La connexion se fait
// dans le navigateur (ou l'appli Discord), puis l'appli récupère la session via POST /auth/poll.
const POLL_HASH = /^[0-9a-f]{64}$/;
const POLL_KEY = /^[A-Za-z0-9_-]{32,128}$/;

async function login(request, env) {
  if (!env.DISCORD_CLIENT_ID) return fail('Connexion Discord non configurée.', 503);
  const poll = new URL(request.url).searchParams.get('poll');
  if (poll === null) return toDiscord(request, env, null, 'none');
  if (!POLL_HASH.test(poll)) return fail('Paramètre poll invalide.');
  return confirmPage(poll);
}

// Appli installée : le joueur a confirmé que le code est bien celui de son appli. Le formulaire doit
// venir de la page de confirmation elle-même, et Discord redemande toujours l'autorisation.
async function confirmLogin(request, env) {
  if (!env.DISCORD_CLIENT_ID) return fail('Connexion Discord non configurée.', 503);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return fail('Origine refusée.', 403);
  const poll = new URLSearchParams(await readBody(request)).get('poll');
  if (poll === null || !POLL_HASH.test(poll)) return fail('Paramètre poll invalide.');
  return toDiscord(request, env, poll, 'consent', 303);
}

async function toDiscord(request, env, poll, prompt, status = 302) {
  const state = randomToken();
  await env.DB.prepare('INSERT INTO oauth_states (state, expires_at, poll_hash) VALUES (?, ?, ?)')
    .bind(state, isoIn(STATE_MINUTES * 60e3), poll).run();
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID, response_type: 'code', scope: 'identify',
    redirect_uri: callbackUrl(request), state, prompt,
  });
  const headers = { Location: url.href };
  // Site et appli de bureau : la session revient dans ce navigateur, le state lui est donc lié.
  // Appli installée : la session ne revient qu'au détenteur du code secret.
  if (!poll) headers['Set-Cookie'] = `${STATE_COOKIE}=${state}; Path=/; Max-Age=${STATE_MINUTES * 60}; HttpOnly; Secure; SameSite=Lax`;
  return new Response(null, { status, headers });
}

const PAGE_STYLE = `body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0c12;color:#e8eefa;font:15px/1.6 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
main{max-width:460px}h1{font:400 16px/1.4 ui-monospace,monospace;color:#a9c4f0;margin:0 0 12px}p{margin:4px 0}.en{color:#8a8a9c;font-size:13px}
.code{font:600 30px/1.2 ui-monospace,monospace;letter-spacing:.08em;margin:18px 0}
button{margin:18px 0;padding:10px 16px;border:1px solid #a9c4f0;border-radius:8px;background:transparent;color:#e8eefa;font:inherit;cursor:pointer}`;
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

// Page de confirmation (appli installée) : rien n'est écrit en base avant la confirmation.
// form-action autorise Discord car le formulaire y est redirigé.
function confirmPage(poll) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manhwadle — Connexion de l'appli</title><style>${PAGE_STYLE}</style></head><body><main>
<h1>[Connexion de l'appli Manhwadle]</h1>
<p>Tu vas connecter l'appli Manhwadle installée, sur cet appareil ou un autre. Vérifie que ce code est bien celui affiché dans ton appli :</p>
<p class="en">You are about to log in the installed Manhwadle app, on this device or another one. Check that this code is the one shown in your app:</p>
<p class="code">${Logic.loginCode(poll)}</p>
<form method="post" action="/auth/discord/confirm"><input type="hidden" name="poll" value="${poll}">
<button type="submit">Le code est le même, continuer avec Discord<br>Same code, continue with Discord</button></form>
<p>Si tu ne vois pas ce code dans ton appli, ferme cette page : quelqu'un d'autre a pu t'envoyer ce lien pour accéder à ton compte.</p>
<p class="en">If you don't see this code in your app, close this page: someone else may have sent you this link to access your account.</p>
</main></body></html>`;
  return new Response(html, { headers: { ...PAGE_HEADERS,
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://discord.com; frame-ancestors 'none'; base-uri 'none'",
  } });
}

// Page affichée à la fin d'une connexion lancée depuis l'appli installée.
const DONE_PAGE = {
  ok: ['Connexion réussie', 'Tu peux revenir dans Manhwadle.', 'Logged in — you can go back to Manhwadle.'],
  annule: ['Connexion annulée', 'Reviens dans Manhwadle pour réessayer.', 'Login cancelled — go back to Manhwadle to try again.'],
  expire: ['Demande expirée', 'Reviens dans Manhwadle pour réessayer.', 'The request expired — go back to Manhwadle to try again.'],
  erreur: ['Connexion impossible', 'Reviens dans Manhwadle pour réessayer.', 'Login failed — go back to Manhwadle to try again.'],
};
function donePage(code) {
  const [title, fr, en] = DONE_PAGE[code];
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manhwadle — ${title}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0c12;color:#e8eefa;font:15px/1.6 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font:400 16px/1.4 ui-monospace,monospace;color:#a9c4f0;margin:0 0 12px}p{margin:4px 0}.en{color:#8a8a9c;font-size:13px}
</style></head><body><main><h1>[${title}]</h1><p>${fr}</p><p class="en">${en}</p></main></body></html>`;
  return new Response(html, { status: code === 'ok' ? 200 : 400, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'Cache-Control': 'no-store',
  } });
}

async function callback(request, env) {
  const params = new URL(request.url).searchParams;

  // L'état doit exister, ne pas être expiré, et ne sert qu'une fois.
  const state = params.get('state') ?? '';
  const row = await env.DB.prepare('DELETE FROM oauth_states WHERE state = ? RETURNING expires_at, poll_hash').bind(state).first();
  const pollHash = row?.poll_hash ?? null;
  // Site : retour vers la page avec #session= ou #login=. Appli installée : résultat mis de côté pour /auth/poll.
  const back = async (code, userId = null) => {
    if (!pollHash) {
      const fragment = code === 'ok' ? `session=${await newSession(env, userId)}` : `login=${code}`;
      return new Response(null, { status: 302, headers: {
        Location: `${env.SITE_URL}#${fragment}`,
        'Set-Cookie': `${STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      } });
    }
    await env.DB.prepare('INSERT OR REPLACE INTO login_polls (poll_hash, user_id, error, expires_at) VALUES (?, ?, ?, ?)')
      .bind(pollHash, userId, code === 'ok' ? null : code, isoIn(STATE_MINUTES * 60e3)).run();
    return donePage(code);
  };
  if (params.get('error')) return back('annule');
  if (!row || row.expires_at < new Date().toISOString()) return back('expire');
  if (!pollHash && readCookie(request, STATE_COOKIE) !== state) return back('expire');

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code', code: params.get('code') ?? '', redirect_uri: callbackUrl(request),
    }),
  });
  if (!tokenRes.ok) return back('erreur');
  const { access_token: accessToken } = await tokenRes.json();
  const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!meRes.ok) return back('erreur');
  const me = await meRes.json();
  const name = String(me.global_name || me.username || 'Incarnation').slice(0, 40);

  await env.DB.prepare(`INSERT INTO users (id, name, avatar) VALUES (?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar`)
    .bind(String(me.id), name, me.avatar ?? null).run();
  return back('ok', String(me.id));
}

// Purge quotidienne (Cron Trigger) : tout ce qui est expiré, indépendamment des connexions.
async function purgeExpired(env) {
  const now = new Date().toISOString();
  const oldDay = addDays(utcDay(), -DAILY_KEEP_DAYS);
  await env.DB.batch([
    ...['sessions', 'oauth_states', 'login_polls'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table} WHERE expires_at < ?`).bind(now)),
    env.DB.prepare('DELETE FROM daily_guesses WHERE day < ?').bind(oldDay),
    env.DB.prepare('DELETE FROM daily_targets WHERE day < ?').bind(oldDay),
  ]);
}

// Nouvelle session : le jeton part chez le joueur, le serveur n'en garde que l'empreinte.
async function newSession(env, userId) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, isoIn(SESSION_DAYS * 864e5)).run();
  return token;
}

// Appli installée : { poll: <code secret> } → { pending: true } tant que la connexion n'est pas finie,
// puis, une seule fois, { session } ou { error }.
async function poll(request, env) {
  let key;
  try { key = JSON.parse(await readBody(request, 1024))?.poll; } catch (e) { if (e.status) throw e; }
  if (typeof key !== 'string' || !POLL_KEY.test(key)) return fail('Paramètre poll invalide.');
  const row = await env.DB.prepare('DELETE FROM login_polls WHERE poll_hash = ? AND expires_at > ? RETURNING user_id, error')
    .bind(await sha256(key), new Date().toISOString()).first();
  if (!row) return json({ pending: true });
  if (row.error || !row.user_id) return json({ error: row.error ?? 'erreur' });
  return json({ session: await newSession(env, row.user_id) });
}

// ---------- Perso du jour (joué côté serveur) ----------
// Le personnage est choisi par HMAC(secret, jour) puis figé en base : ajouter un personnage ou
// redéployer en cours de journée ne le change pas. Le jour change à minuit UTC pour tout le monde.
async function dailyTargetId(env, day) {
  if (!env.DAILY_SECRET) throw Object.assign(new Error('Perso du jour non configuré.'), { status: 503 });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.DAILY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`manhwadle:${day}`));
  await env.DB.prepare('INSERT OR IGNORE INTO daily_targets (day, character_id) VALUES (?, ?)')
    .bind(day, pickDailyId(characters, digest)).run();
  return (await env.DB.prepare('SELECT character_id FROM daily_targets WHERE day = ?').bind(day).first()).character_id;
}

async function dailyGuessIds(env, user, day) {
  const { results } = await env.DB.prepare('SELECT character_id FROM daily_guesses WHERE user_id = ? AND day = ? ORDER BY position')
    .bind(user.id, day).all();
  return results.map((r) => r.character_id);
}

// État de la partie du jour. L'identité du personnage n'en fait partie qu'une fois la partie terminée.
async function dailyState(env, user, now = Date.now()) {
  const day = utcDay(now);
  const targetId = await dailyTargetId(env, day);
  const target = byId.get(targetId);
  const ids = await dailyGuessIds(env, user, day);
  const row = await env.DB.prepare('SELECT won FROM daily_games WHERE user_id = ? AND day = ?').bind(user.id, day).first();
  // last_day après aujourd'hui : partie déjà comptée par une ancienne version de l'appli, sur son jour local.
  const done = !!row || (!!user.last_day && user.last_day > day);
  return {
    day,
    guesses: ids.map((id) => ({ id, results: guessResults(byId.get(id), target) })),
    done,
    won: !!row?.won,
    target: done ? targetId : null,
    hint: done ? 0 : hintLevel(ids.length),
    profile: publicProfile(user),
  };
}

async function readDailyBody(request) {
  try {
    return JSON.parse(await readBody(request)) ?? {};
  } catch (e) {
    if (e.status) throw e;
    return {};
  }
}

// Écrit l'essai éventuel et, si la partie se termine, le résultat et les statistiques, d'un seul bloc.
async function finishDaily(env, user, day, count, won, extra = []) {
  const next = nextStats(user, { day, guesses: count, won });
  await env.DB.batch([
    ...extra,
    env.DB.prepare('INSERT INTO daily_games (user_id, day, guesses, won) VALUES (?, ?, ?, ?)').bind(user.id, day, count, won ? 1 : 0),
    env.DB.prepare(`UPDATE users SET streak = ?, best = ?, played = ?, won = ?, guesses = ?, last_day = ?
                    WHERE id = ? AND (last_day IS NULL OR last_day < ?)`)
      .bind(next.streak, next.best, next.played, next.won, next.guesses, next.last_day, user.id, day),
  ]).catch(() => { throw new Error('conflict'); });
  return { ...user, ...next };
}

async function dailyGuess(request, env, user) {
  const { id, day } = await readDailyBody(request);
  const state = await dailyState(env, user);
  if (day !== state.day) return json({ error: 'Le scénario du jour a changé.', code: 'day-changed' }, 409);
  if (state.done) return fail('Scénario déjà joué.', 409);
  if (typeof id !== 'string' || !byId.has(id)) return json({ error: 'Personnage inconnu : mets à jour le jeu.', code: 'update' }, 400);
  if (state.guesses.some((g) => g.id === id)) return fail('Essai en double.', 409);
  if (state.guesses.length >= MAX_GUESSES) return fail("Trop d'essais.", 409);

  const insert = env.DB.prepare('INSERT INTO daily_guesses (user_id, day, position, character_id) VALUES (?, ?, ?, ?)')
    .bind(user.id, state.day, state.guesses.length, id);
  if (id === await dailyTargetId(env, state.day)) {
    return json(await dailyState(env, await finishDaily(env, user, state.day, state.guesses.length + 1, true, [insert])));
  }
  await insert.run().catch(() => { throw new Error('conflict'); });
  return json(await dailyState(env, user));
}

async function dailyGiveUp(request, env, user) {
  const { day } = await readDailyBody(request);
  const state = await dailyState(env, user);
  if (day !== state.day) return json({ error: 'Le scénario du jour a changé.', code: 'day-changed' }, 409);
  if (state.done) return fail('Scénario déjà joué.', 409);
  return json(await dailyState(env, await finishDaily(env, user, state.day, state.guesses.length, false)));
}

// L'image passe par le Worker, à une adresse fixe : son nom ne dit rien du personnage.
async function dailyHint(request, env, user) {
  const day = utcDay();
  const level = hintLevel((await dailyGuessIds(env, user, day)).length);
  if (!level) return fail('Indice pas encore disponible.', 403);
  const asset = await env.ASSETS.fetch(new URL(`/${await dailyTargetId(env, day)}-${level}.webp`, request.url));
  if (!asset.ok) return fail("Pas d'indice pour ce scénario.", 404);
  return new Response(asset.body, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...CORS } });
}

async function leaderboard(request, env, ctx) {
  const cache = caches.default;
  const key = new Request(new URL('/leaderboard', request.url));
  const cached = await cache.match(key);
  if (cached) return cached;
  const { results } = await env.DB.prepare(
    `SELECT id, name, avatar, streak, best, played, won, guesses, last_day FROM users
     WHERE played > 0 AND hidden = 0 ORDER BY best DESC, streak DESC, won DESC LIMIT 50`,
  ).all();
  const res = json({ players: results.map(publicProfile) });
  res.headers.set('Cache-Control', `public, max-age=${LEADERBOARD_SECONDS}`);
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---------- Routes ----------
async function route(request, env, ctx) {
  const { pathname } = new URL(request.url);
  const method = request.method;

  const limiter = env[LIMITS[`${method} ${pathname}`]];
  if (limiter) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
    const { success } = await limiter.limit({ key: `${pathname}:${ip}` });
    if (!success) return new Response(JSON.stringify({ error: 'Trop de requêtes, réessaie dans une minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60', ...CORS },
    });
  }

  if (method === 'GET' && pathname === '/auth/discord') return login(request, env);
  if (method === 'POST' && pathname === '/auth/discord/confirm') return confirmLogin(request, env);
  if (method === 'GET' && pathname === '/auth/discord/callback') return callback(request, env);
  if (method === 'POST' && pathname === '/auth/poll') return poll(request, env);

  if (method === 'GET' && pathname === '/leaderboard') return leaderboard(request, env, ctx);

  const user = await currentUser(request, env);
  if (!user) return fail('Connexion requise.', 401);

  if (method === 'GET' && pathname === '/me') return json(publicProfile(user));

  if (method === 'POST' && pathname === '/auth/logout') {
    const token = (request.headers.get('Authorization') ?? '').slice(7).trim();
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && pathname === '/me') {
    // Données personnelles : tout est supprimé (sessions et parties suivent par cascade).
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM daily_games WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM daily_guesses WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    ]);
    return json({ ok: true });
  }

  if (method === 'GET' && pathname === '/games/daily') return json(await dailyState(env, user));
  if (method === 'POST' && pathname === '/games/daily/guess') return dailyGuess(request, env, user);
  if (method === 'POST' && pathname === '/games/daily/give-up') return dailyGiveUp(request, env, user);
  if (method === 'GET' && pathname === '/games/daily/hint') return dailyHint(request, env, user);

  if (method === 'POST' && pathname === '/games/daily') {
    const body = await readBody(request);
    let game, next;
    try {
      game = validateDailyGame(JSON.parse(body), characters);
      next = nextStats(user, game);
    } catch (e) {
      return fail(e.message, e.message.startsWith('Scénario déjà joué') ? 409 : 400);
    }
    // La partie et les stats sont écrites ensemble ; la clé (joueur, jour) empêche tout doublon.
    await env.DB.batch([
      env.DB.prepare('INSERT INTO daily_games (user_id, day, guesses, won) VALUES (?, ?, ?, ?)')
        .bind(user.id, game.day, game.guesses, game.won ? 1 : 0),
      env.DB.prepare(`UPDATE users SET streak = ?, best = ?, played = ?, won = ?, guesses = ?, last_day = ?
                      WHERE id = ? AND (last_day IS NULL OR last_day < ?)`)
        .bind(next.streak, next.best, next.played, next.won, next.guesses, next.last_day, user.id, game.day),
    ]).catch(() => { throw new Error('conflict'); });
    return json(publicProfile({ ...user, ...next }));
  }

  return fail('Route inconnue.', 404);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(request, env, ctx);
    } catch (e) {
      if (e.message === 'conflict') return fail('Scénario déjà joué.', 409);
      if (e.status === 413 || e.status === 503) return fail(e.message, e.status);
      console.error(e);
      return fail('Erreur interne.', 500);
    }
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(purgeExpired(env));
  },
};
