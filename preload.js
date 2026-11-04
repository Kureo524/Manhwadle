// Pont entre le processus principal et la page (bac à sable, sans accès disque) :
// données du jeu en lecture seule, et quelques actions : quitter, copier une image du résultat,
// suivre et installer une mise à jour.
const { contextBridge, ipcRenderer } = require('electron');

// Le dernier état de mise à jour est gardé : la page peut s'abonner après son arrivée.
let lastUpdate = null;
const updateListeners = new Set();
ipcRenderer.on('manhwadle:update', (_event, data) => {
  lastUpdate = { state: String(data?.state ?? ''), version: data?.version ? String(data.version) : null };
  for (const cb of updateListeners) cb(lastUpdate);
});

contextBridge.exposeInMainWorld('manhwadle', {
  ...ipcRenderer.sendSync('manhwadle:data'),
  quit: () => ipcRenderer.send('manhwadle:quit'),
  shareImage: () => ipcRenderer.invoke('manhwadle:share-image'),
  onUpdate: (cb) => {
    updateListeners.add(cb);
    if (lastUpdate) cb(lastUpdate);
  },
  installUpdate: () => ipcRenderer.send('manhwadle:install-update'),
});
