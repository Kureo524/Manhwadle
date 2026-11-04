// Capture hors écran de l'appli, pour vérifier le rendu sans ouvrir de fenêtre.
//   npx electron tools/screenshot.cjs sortie.png [mode] [id1,id2,...]
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const [out = 'screenshot.png', mode = 'daily', guesses = ''] = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('screenshot.cjs') && a !== '.');
const root = path.join(__dirname, '..');

app.whenReady().then(async () => {
  setTimeout(() => { console.error('délai dépassé'); app.exit(1); }, 30000);
  const win = new BrowserWindow({
    width: 1360, height: 860, show: false, backgroundColor: '#0c0c12',
    webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true, sandbox: false, offscreen: true },
  });
  await win.loadFile(path.join(root, 'src/index.html'));
  await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('manhwadle.mode', ${JSON.stringify(JSON.stringify(mode))}); location.reload();`);
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  for (const id of guesses.split(',').filter(Boolean)) {
    await win.webContents.executeJavaScript(`(() => { const i = document.getElementById('search'); const c = window.manhwadle.characters.find(c => c.id === ${JSON.stringify(id)}); i.value = c.name; i.dispatchEvent(new Event('input')); const b = [...document.querySelectorAll('.suggestion')].find(b => b.querySelector('.suggestion__name').textContent === c.name); if (b) b.dispatchEvent(new MouseEvent('mousedown', {bubbles: true})); })()`);
  }
  if (process.env.TYPE) await win.webContents.executeJavaScript(`(() => { const i = document.getElementById('search'); i.focus(); i.value = ${JSON.stringify(process.env.TYPE)}; i.dispatchEvent(new Event('input')); })()`);
  await new Promise((r) => setTimeout(r, 1500));
  if (process.env.SKIP) await win.webContents.executeJavaScript(`document.getElementById('give-up').click()`);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  console.log('capture :', out);
  app.quit();
});
