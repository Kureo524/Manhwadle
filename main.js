const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { loadGameData } = require('./data-loader');
const { fitToWindow } = require('./window-fit');
const { copyGameArea } = require('./share-image');

const gameData = loadGameData();
ipcMain.on('manhwadle:data', (event) => { event.returnValue = gameData; });
ipcMain.on('manhwadle:quit', () => app.quit());
ipcMain.handle('manhwadle:share-image', (event) => copyGameArea(event.sender).catch(() => false));

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
}

// Aucune permission web (caméra, micro, notifications…) n'est utile au jeu.
app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
