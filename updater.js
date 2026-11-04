// Mises à jour automatiques depuis les releases GitHub (electron-updater).
// - Windows (installateur) et Linux (AppImage) : téléchargement en arrière-plan, seulement des
//   parties modifiées (blockmap), installation à la fermeture ou sur demande.
// - macOS : désactivé, Apple refuse la mise à jour automatique d'une appli non signée.
// - Hors build installée (npm start, dossier décompressé) : rien.
const { app, ipcMain } = require('electron');

function updatesSupported() {
  if (!app.isPackaged || process.platform === 'darwin') return false;
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE); // seule l'AppImage se remplace
  return true;
}

function setupUpdates(win) {
  if (!updatesSupported()) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (state, info = {}) => {
    if (!win.isDestroyed()) win.webContents.send('manhwadle:update', { state, version: info.version ?? null });
  };
  autoUpdater.on('update-available', (info) => send('downloading', info));
  autoUpdater.on('update-downloaded', (info) => send('ready', info));
  autoUpdater.on('error', () => {}); // hors ligne, GitHub indisponible… : on réessaiera au prochain lancement

  ipcMain.on('manhwadle:install-update', () => autoUpdater.quitAndInstall());
  win.webContents.once('did-finish-load', () => { autoUpdater.checkForUpdates().catch(() => {}); });
}

module.exports = { setupUpdates, updatesSupported };
