// Partage en image (appli de bureau) : capture la zone de jeu — de la fenêtre de scénario
// au dernier essai, sans la barre du haut ni la ligne de statistiques — et la copie dans
// le presse-papiers. La page passe d'abord en « mode capture » (voir .is-capturing dans le CSS).
const { BrowserWindow, clipboard } = require('electron');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PAD = 16; // marge autour de la zone, en px CSS

// Rectangle de la zone de jeu, en px CSS, et taille de la fenêtre CSS.
const MEASURE = `(() => {
  const kids = [...document.querySelectorAll('.stage > *')].filter((k) => k.offsetParent && k.getBoundingClientRect().height > 0);
  const a = kids[0].getBoundingClientRect(), b = kids[kids.length - 1].getBoundingClientRect();
  return { x: a.left, y: a.top, w: a.width, h: b.bottom - a.top, vw: innerWidth, vh: innerHeight };
})()`;

/** Capture la zone de jeu et renvoie l'image (NativeImage). */
async function captureGameArea(wc) {
  const win = BrowserWindow.fromWebContents(wc);
  const zoom = wc.getZoomFactor();
  await wc.executeJavaScript(`document.documentElement.classList.add('is-capturing'); document.querySelector('.stage').scrollTop = 0;`);
  try {
    await wait(120);
    let m = await wc.executeJavaScript(MEASURE);
    // Liste d'essais plus haute que la fenêtre : on dézoome le temps de la capture.
    if (m.y + m.h + PAD > m.vh) {
      wc.setZoomFactor(zoom * (m.vh - PAD) / (m.y + m.h + PAD));
      await wait(250);
      m = await wc.executeJavaScript(MEASURE);
    }
    const [cw, ch] = win.getContentSize();
    const k = cw / m.vw; // px CSS → px fenêtre
    const x = Math.max(0, Math.floor((m.x - PAD) * k));
    const y = Math.max(0, Math.floor((m.y - PAD) * k));
    const rect = {
      x, y,
      width: Math.min(cw - x, Math.ceil((m.w + 2 * PAD) * k)),
      height: Math.min(ch - y, Math.ceil((m.h + 2 * PAD) * k)),
    };
    return await wc.capturePage(rect);
  } finally {
    wc.setZoomFactor(zoom);
    await wc.executeJavaScript(`document.documentElement.classList.remove('is-capturing')`).catch(() => {});
  }
}

/** Capture la zone de jeu et la copie dans le presse-papiers. */
async function copyGameArea(wc) {
  clipboard.writeImage(await captureGameArea(wc));
  return true;
}

module.exports = { captureGameArea, copyGameArea };
