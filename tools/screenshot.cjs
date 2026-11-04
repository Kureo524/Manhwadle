// Capture hors écran de l'appli, pour vérifier le rendu sans ouvrir de fenêtre.
//   npx electron tools/screenshot.cjs sortie.png [mode] [id1,id2,...]
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const [out = 'screenshot.png', mode = 'daily', guesses = ''] = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('screenshot.cjs') && a !== '.');
const root = path.join(__dirname, '..');

app.whenReady().then(async () => {
  const data = require(path.join(root, 'data-loader.js')).loadGameData(root);
  ipcMain.on('manhwadle:data', (event) => { event.returnValue = data; });
  setTimeout(() => { console.error('délai dépassé'); app.exit(1); }, 30000);
  const win = new BrowserWindow({
    width: 1360, height: 860, show: false, backgroundColor: '#0c0c12',
    webPreferences: { preload: process.env.WEB_URL ? undefined : path.join(root, 'preload.js'), contextIsolation: true, sandbox: true, offscreen: true },
  });
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) console.error('[page]', e.message); });
  if (process.env.WEB_URL) await win.loadURL(process.env.WEB_URL);
  else await win.loadFile(path.join(root, 'src/index.html'));
  await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('manhwadle.mode', ${JSON.stringify(JSON.stringify(mode))}); ${process.env.STATS ? `localStorage.setItem('manhwadle.stats', ${JSON.stringify(process.env.STATS)});` : ''} location.reload();`);
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  // Le jeu se charge de façon asynchrone (boot.js) : on attend que la fenêtre de scénario existe.
  for (let i = 0; i < 100; i++) {
    if (await win.webContents.executeJavaScript(`!!document.querySelector('.scenario__title')`)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const id of guesses.split(',').filter(Boolean)) {
    await win.webContents.executeJavaScript(`(() => { const i = document.getElementById('search'); const c = window.manhwadle.characters.find(c => c.id === ${JSON.stringify(id)}); i.value = c.name; i.dispatchEvent(new Event('input')); const b = [...document.querySelectorAll('.suggestion')].find(b => b.querySelector('.suggestion__name').textContent === c.name); if (b) b.dispatchEvent(new MouseEvent('mousedown', {bubbles: true})); })()`);
  }
  if (process.env.TYPE) await win.webContents.executeJavaScript(`(() => { const i = document.getElementById('search'); i.focus(); i.value = ${JSON.stringify(process.env.TYPE)}; i.dispatchEvent(new Event('input')); })()`);
  await new Promise((r) => setTimeout(r, 1500));
  // EVAL : code exécuté dans la page juste avant la capture (ex. ouvrir un panneau).
  if (process.env.EVAL) { await win.webContents.executeJavaScript(process.env.EVAL); await new Promise((r) => setTimeout(r, 600)); }
  if (process.env.SKIP) {
    await win.webContents.executeJavaScript(`document.getElementById('give-up').click()`);
    await new Promise((r) => setTimeout(r, 800));
  }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  console.log('capture :', out);
  app.quit();
});
