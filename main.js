const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 640,
    backgroundColor: '#0c0c12',
    title: 'Manhwadle',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  // Les liens externes (crédits wiki) s'ouvrent dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
