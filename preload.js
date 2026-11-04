// Pont entre le processus principal et la page (bac à sable, sans accès disque) :
// données du jeu en lecture seule, et deux actions : quitter, copier une image du résultat.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('manhwadle', {
  ...ipcRenderer.sendSync('manhwadle:data'),
  quit: () => ipcRenderer.send('manhwadle:quit'),
  shareImage: () => ipcRenderer.invoke('manhwadle:share-image'),
});
