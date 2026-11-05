const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require('electron');
const path = require('node:path');
const { loadGameData } = require('./data-loader');
const { fitToWindow } = require('./window-fit');
const { copyGameArea } = require('./share-image');
const { setupUpdates } = require('./updater');

// Connexion Discord : l'API renvoie vers le site avec #session=<jeton> ; l'appli intercepte ce retour.
const API_URL = 'https://manhwadle-api.kureo.workers.dev';
const SITE_URL = 'https://kureo524.github.io/Manhwadle/';

// Une seule instance : relancer l'appli ramène la fenêtre déjà ouverte au premier plan.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  start();
}

// Mise en place de l'appli (première instance seulement).
function start() {
  const gameData = loadGameData();
  ipcMain.on('manhwadle:data', (event) => { event.returnValue = gameData; });
  ipcMain.on('manhwadle:quit', () => app.quit());
  ipcMain.handle('manhwadle:share-image', (event) => copyGameArea(event.sender).catch((e) => {
    console.error('[partage]', e);
    return false;
  }));
  ipcMain.handle('manhwadle:login', (event) => discordLogin(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.on('manhwadle:login-cancel', () => loginWindow?.close());

  // Aucune permission web (caméra, micro, notifications…) n'est utile au jeu.
  app.whenReady().then(() => {
    // Le jeu est toujours sombre : le flou du système (Acrylic sous Windows, vibrancy sous macOS)
    // suit le thème choisi ici, et non le thème clair éventuel du système.
    nativeTheme.themeSource = 'dark';
    const { session } = require('electron');
    for (const s of [session.defaultSession, session.fromPartition('persist:discord')]) {
      s.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
    }
    setupUpdates(createWindow());
  });
  app.on('window-all-closed', () => app.quit());
}

// Apparence de la fenêtre selon le système.
// - Linux (Hyprland) : fenêtre transparente ; le compositeur floute le fond d'écran, gère les bords,
//   la taille et la position.
// - Windows et macOS : une fenêtre transparente y perd son cadre (ni redimensionnable, ni déplaçable,
//   coins carrés). On garde le cadre natif, avec un effet de flou du système (Acrylic sous
//   Windows 11 : le fond flouté reste visible, comme sous Hyprland ; vibrancy sous macOS) et une
//   barre de titre intégrée à l'en-tête du jeu.
const WINDOW_LOOK = {
  linux: { transparent: true, backgroundColor: '#00000000' },
  win32: {
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#a3a6b6', height: 44 },
  },
  darwin: {
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    trafficLightPosition: { x: 16, y: 16 },
  },
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    ...(WINDOW_LOOK[process.platform] ?? WINDOW_LOOK.linux),
    title: 'Manhwadle',
    // Icône de la fenêtre (barre des tâches Windows, Linux X11). macOS prend celle du paquet .app.
    icon: path.join(__dirname, 'assets/icons/icon-512.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());

  // La page ne quitte jamais l'appli ; seuls les liens https s'ouvrent dans le navigateur.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  // Pas de barre de titre sous un gestionnaire en tuiles : Ctrl+Q quitte, même depuis la recherche.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta) && input.key.toLowerCase() === 'q') {
      event.preventDefault();
      app.quit();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  fitToWindow(win);
  win.loadFile(path.join(__dirname, 'src/index.html'));
  return win;
}

// Fenêtre de connexion Discord (une seule à la fois). Elle a sa propre session, sans preload :
// la page Discord n'a aucun accès à l'appli. Renvoie { session } ou { error }, ou null si elle est fermée.
// Fenêtre normale (pas modale) : sous macOS, une fenêtre modale devient une « feuille » collée au jeu,
// sans barre de titre ni bouton pour la fermer. Échap la ferme aussi.
let loginWindow = null;
let loginPending = null;
function discordLogin(parent) {
  if (loginWindow) {
    loginWindow.focus();
    return loginPending;
  }
  loginPending = new Promise((resolve) => {
    // Centrée sur la fenêtre du jeu.
    const size = { width: 520, height: 780 };
    const at = parent && !parent.isDestroyed() ? parent.getBounds() : null;
    const win = new BrowserWindow({
      ...size,
      ...(at ? { x: Math.round(at.x + (at.width - size.width) / 2), y: Math.round(at.y + Math.max(0, (at.height - size.height) / 2)) } : {}),
      title: 'Discord · Manhwadle',
      autoHideMenuBar: true,
      backgroundColor: '#1e1f22',
      webPreferences: { partition: 'persist:discord', contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    loginWindow = win;
    win.removeMenu();
    let result = null;
    const intercept = (event, legacyUrl) => {
      const url = event.url ?? legacyUrl;
      if (typeof url !== 'string' || !url.startsWith(SITE_URL)) return;
      event.preventDefault();
      const params = new URLSearchParams(new URL(url).hash.slice(1));
      result = params.get('session') ? { session: params.get('session') } : { error: params.get('login') ?? 'erreur' };
      win.close();
    };
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') { event.preventDefault(); win.close(); }
    });
    win.webContents.on('will-redirect', intercept);
    win.webContents.on('will-navigate', intercept);
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.on('closed', () => {
      loginWindow = null;
      resolve(result);
    });
    win.loadURL(`${API_URL}/auth/discord`);
  });
  return loginPending;
}
