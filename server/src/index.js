// API de Manhwadle (Cloudflare Worker + D1).
//
//   GET    /auth/discord            → redirige vers Discord (connexion)
//   GET    /auth/discord/callback   → crée la session, renvoie vers le site avec #session=<jeton>
//   POST   /auth/poll               → appli installée (PWA) : récupère la session une fois la connexion faite
//   POST   /auth/logout             → ferme la session
//   GET    /me                      → profil et statistiques du joueur
//   DELETE /me                      → supprime le compte et toutes ses données
//   POST   /games/daily             → enregistre la partie du jour (vérifiée par le serveur)
//   GET    /leaderboard             → classement des séries
//
// Authentification : en-tête « Authorization: Bearer <jeton> » (pas de cookie, donc pas de CSRF).
import characters from '../../data/characters.json';
import { validateDailyGame, nextStats, liveStreak } from './game.js';

const SESSION_DAYS = 90;
const STATE_MINUTES = 10;

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
  if (poll !== null && !POLL_HASH.test(poll)) return fail('Paramètre poll invalide.');
  const state = randomToken();
  await env.DB.prepare('INSERT INTO oauth_states (state, expires_at, poll_hash) VALUES (?, ?, ?)')
    .bind(state, isoIn(STATE_MINUTES * 60e3), poll).run();
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID, response_type: 'code', scope: 'identify',
    redirect_uri: callbackUrl(request), state, prompt: 'none',
  });
  return Response.redirect(url.href, 302);
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
    if (!pollHash) return Response.redirect(`${env.SITE_URL}#${code === 'ok' ? `session=${await newSession(env, userId)}` : `login=${code}`}`, 302);
    await env.DB.prepare('INSERT OR REPLACE INTO login_polls (poll_hash, user_id, error, expires_at) VALUES (?, ?, ?, ?)')
      .bind(pollHash, userId, code === 'ok' ? null : code, isoIn(STATE_MINUTES * 60e3)).run();
    return donePage(code);
  };
  if (params.get('error')) return back('annule');
  if (!row || row.expires_at < new Date().toISOString()) return back('expire');

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

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, name, avatar) VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar`)
      .bind(String(me.id), name, me.avatar ?? null),
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM login_polls WHERE expires_at < ?').bind(now),
  ]);
  return back('ok', String(me.id));
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
  if (Number(request.headers.get('Content-Length') ?? 0) > 1024) return fail('Requête trop grande.', 413);
  const key = (await request.json().catch(() => ({})))?.poll;
  if (typeof key !== 'string' || !POLL_KEY.test(key)) return fail('Paramètre poll invalide.');
  const row = await env.DB.prepare('DELETE FROM login_polls WHERE poll_hash = ? AND expires_at > ? RETURNING user_id, error')
    .bind(await sha256(key), new Date().toISOString()).first();
  if (!row) return json({ pending: true });
  if (row.error || !row.user_id) return json({ error: row.error ?? 'erreur' });
  return json({ session: await newSession(env, row.user_id) });
}

// ---------- Routes ----------
async function route(request, env) {
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (method === 'GET' && pathname === '/auth/discord') return login(request, env);
  if (method === 'GET' && pathname === '/auth/discord/callback') return callback(request, env);
  if (method === 'POST' && pathname === '/auth/poll') return poll(request, env);

  if (method === 'GET' && pathname === '/leaderboard') {
    const { results } = await env.DB.prepare(
      `SELECT id, name, avatar, streak, best, played, won, guesses, last_day FROM users
       WHERE played > 0 ORDER BY best DESC, streak DESC, won DESC LIMIT 50`,
    ).all();
    return json({ players: results.map(publicProfile) });
  }

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
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    ]);
    return json({ ok: true });
  }

  if (method === 'POST' && pathname === '/games/daily') {
    if (Number(request.headers.get('Content-Length') ?? 0) > 8192) return fail('Requête trop grande.', 413);
    let game, next;
    try {
      game = validateDailyGame(await request.json(), characters);
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
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(request, env);
    } catch (e) {
      if (e.message === 'conflict') return fail('Scénario déjà joué.', 409);
      console.error(e);
      return fail('Erreur interne.', 500);
    }
  },
};
