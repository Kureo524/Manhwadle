// Client de l'API (src/online.js), chargé comme dans la page avec un navigateur simulé.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const path = require('node:path');
const Logic = require('../src/logic.js');
const { captureRect } = require('../share-rect.js');

const code = readFileSync(path.join(__dirname, '../src/online.js'), 'utf8');
const TOKEN = 'a'.repeat(43);
const KEY = 'manhwadle.session';

function load({ hash = '', stored = null, standalone = false, responses = [], manhwadle = {} } = {}) {
  const data = new Map(stored ? [[KEY, stored]] : []);
  const page = {
    data,
    calls: [],
    opened: [],
    replaced: 0,
    localStorage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    },
  };
  const window = {
    manhwadle,
    Logic,
    matchMedia: () => ({ matches: standalone }),
    open: (url) => page.opened.push(url),
  };
  const fetch = async (url, init = {}) => {
    page.calls.push({ url, ...init });
    const next = responses.length > 1 ? responses.shift() : responses[0] ?? { status: 200, body: {} };
    if (next.throws) throw new Error('réseau');
    const status = next.status ?? 200;
    return { ok: status < 400, status, json: async () => next.body ?? {} };
  };
  vm.runInNewContext(code, {
    window, fetch, crypto, btoa, TextEncoder, URLSearchParams, console, localStorage: page.localStorage,
    location: { hash, pathname: '/', search: '' },
    history: { replaceState: () => { page.replaced++; } },
    navigator: {},
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    setTimeout: (fn) => setImmediate(fn),
    clearTimeout: () => {},
  });
  page.online = window.Online;
  page.window = window;
  return page;
}

test('retour de connexion : le jeton est gardé et retiré de l\'adresse', () => {
  const p = load({ hash: `#session=${TOKEN}` });
  assert.equal(p.data.get(KEY), TOKEN);
  assert.equal(p.replaced, 1);
  assert.equal(p.online.signedIn, true);
  assert.equal(p.online.takeJustLoggedIn(), true);
  assert.equal(p.online.takeJustLoggedIn(), false);
});

test('retour de connexion : jeton mal formé refusé, codes d\'erreur limités', () => {
  const bad = load({ hash: '#session=<script>' });
  assert.equal(bad.online.signedIn, false);
  assert.equal(bad.online.takeNotice(), 'erreur');
  assert.equal(bad.online.takeNotice(), null);
  assert.equal(load({ hash: '#login=annule' }).online.takeNotice(), 'annule');
  assert.equal(load({ hash: '#login=nimporte' }).online.takeNotice(), 'erreur');
  assert.equal(load().replaced, 0);
});

test('requêtes : jeton envoyé, erreurs avec statut et code', async () => {
  const p = load({ stored: TOKEN, responses: [{ status: 400, body: { error: 'Inconnu', code: 'update' } }] });
  await assert.rejects(p.online.dailyGuess('x', '2026-11-05'), (e) => e.status === 400 && e.code === 'update' && e.message === 'Inconnu');
  assert.equal(p.calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(p.calls[0].method, 'POST');
  assert.equal(JSON.parse(p.calls[0].body).id, 'x');
  assert.equal(p.online.signedIn, true); // une erreur ordinaire ne déconnecte pas
});

test('session refusée par le serveur (401) : jeton oublié', async () => {
  const p = load({ stored: TOKEN, responses: [{ status: 401 }] });
  await assert.rejects(p.online.me(), (e) => e.status === 401);
  assert.equal(p.online.signedIn, false);
});

test('déconnexion : tout est oublié, même si le serveur ne répond pas', async () => {
  let cleared = 0;
  const p = load({ stored: TOKEN, responses: [{ throws: true }], manhwadle: { clearLogin: () => { cleared++; } } });
  await assert.rejects(p.online.logout());
  assert.equal(p.online.signedIn, false);
  assert.equal(cleared, 1);
});

test('déconnexion de tous les appareils et suppression : le jeton reste si le serveur refuse', async () => {
  for (const action of ['logoutAll', 'deleteAccount']) {
    const p = load({ stored: TOKEN, responses: [{ status: 500 }] });
    await assert.rejects(p.online[action]());
    assert.equal(p.online.signedIn, true, action);
  }
});

test('appli installée : le code d\'abord, la page seulement au clic, puis la session', async () => {
  const p = load({ standalone: true, responses: [{ body: { pending: true } }, { body: { session: TOKEN } }] });
  let shown = null;
  const done = p.online.login((c) => {
    shown = c;
    assert.equal(p.opened.length, 0);
    p.online.openLoginPage();
  });
  assert.equal(await done, null);
  assert.equal(p.opened.length, 1);
  const hash = new URL(p.opened[0]).searchParams.get('poll');
  assert.equal(shown, Logic.loginCode(hash));
  assert.equal(p.online.signedIn, true);
  // Le code secret ne passe qu'en POST ; seule son empreinte est dans l'adresse.
  const secret = JSON.parse(p.calls[0].body).poll;
  assert.ok(!p.opened[0].includes(secret));
  assert.equal(createHash('sha256').update(secret).digest('hex'), hash);
});

test('appli installée : annulation et erreur de connexion', async () => {
  const cancelled = load({ standalone: true, responses: [{ body: { pending: true } }] });
  assert.equal(await cancelled.online.login(() => cancelled.online.cancelLoginPage()), 'annule');
  assert.equal(cancelled.online.signedIn, false);
  const refused = load({ standalone: true, responses: [{ body: { error: 'annule' } }] });
  assert.equal(await refused.online.login(), 'annule');
  const unknown = load({ standalone: true, responses: [{ body: { error: 'autre' } }] });
  assert.equal(await unknown.online.login(), 'erreur');
});

test('appli installée : une coupure réseau pendant l\'attente ne fait pas échouer la connexion', async () => {
  const p = load({ standalone: true, responses: [{ throws: true }, { body: { session: TOKEN } }] });
  assert.equal(await p.online.login(), null);
  assert.equal(p.online.signedIn, true);
});

test('appli de bureau : la connexion passe par la fenêtre du processus principal', async () => {
  const ok = load({ manhwadle: { login: async () => ({ session: TOKEN }) } });
  assert.equal(await ok.online.login(), null);
  assert.equal(ok.online.signedIn, true);
  assert.equal(await load({ manhwadle: { login: async () => null } }).online.login(), 'annule');
  assert.equal(await load({ manhwadle: { login: async () => ({ session: 'court' }) } }).online.login(), 'erreur');
  assert.equal(await load({ manhwadle: { login: async () => ({ error: 'expire' }) } }).online.login(), 'expire');
});

test('partage en image : rectangle converti en px de fenêtre, avec marge', () => {
  assert.deepEqual(captureRect({ x: 32, y: 60, w: 1296, h: 500, vw: 1360 }, 1360, 860, 16),
    { x: 16, y: 44, width: 1328, height: 532 });
  // Fenêtre mise à l'échelle : 680 px réels pour 1360 px CSS.
  assert.deepEqual(captureRect({ x: 32, y: 60, w: 1296, h: 500, vw: 1360 }, 680, 430, 16),
    { x: 8, y: 22, width: 664, height: 266 });
});

test('partage en image : jamais hors de la fenêtre', () => {
  const r = captureRect({ x: 4, y: 4, w: 1400, h: 900, vw: 1360 }, 1360, 860, 16);
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
  assert.equal(r.width, 1360);
  assert.equal(r.height, 860);
});
