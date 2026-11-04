// Pont entre le processus principal et la page (bac à sable, sans accès disque) :
// données du jeu en lecture seule, et une seule action, quitter l'appli.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('manhwadle', {
  ...ipcRenderer.sendSync('manhwadle:data'),
  quit: () => ipcRenderer.send('manhwadle:quit'),
});
