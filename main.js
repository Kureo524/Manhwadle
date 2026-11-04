const { app, BrowserWindow, ipcMain, shell } = require('electron');
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
  ipcMain.handle('manhwadle:share-image', (event) => copyGameArea(event.sender).catch(() => false));
  ipcMain.handle('manhwadle:login', (event) => discordLogin(BrowserWindow.fromWebContents(event.sender)));

  // Aucune permission web (caméra, micro, notifications…) n'est utile au jeu.
  app.whenReady().then(() => {
    const { session } = require('electron');
    for (const s of [session.defaultSession, session.fromPartition('persist:discord')]) {
      s.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
    }
    setupUpdates(createWindow());
  });
  app.on('window-all-closed', () => app.quit());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    // Fenêtre transparente : le compositeur (Hyprland) floute le fond d'écran derrière.
    transparent: true,
    backgroundColor: '#00000000',
    title: 'Manhwadle',
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
let loginWindow = null;
let loginPending = null;
function discordLogin(parent) {
  if (loginWindow) {
    loginWindow.focus();
    return loginPending;
  }
  loginPending = new Promise((resolve) => {
    const win = new BrowserWindow({
      parent: parent ?? undefined,
      modal: !!parent,
      width: 520,
      height: 780,
      title: 'Connexion Discord · Manhwadle',
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
