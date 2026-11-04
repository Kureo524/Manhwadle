// Pont en lecture seule entre le processus principal et la page (bac à sable, sans accès disque).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('manhwadle', ipcRenderer.sendSync('manhwadle:data'));
