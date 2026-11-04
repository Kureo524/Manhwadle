// Met l'interface à l'échelle de la fenêtre (comme un zoom) : la mise en page reste celle
// prévue pour 1360 × 860 et rétrécit d'un bloc quand la fenêtre est plus petite, par exemple
// en tuile à côté d'une autre sous Hyprland. Jamais d'agrandissement au-delà de 100 %.
const BASE_WIDTH = 1360;
const BASE_HEIGHT = 820;
const MIN_ZOOM = 0.6;

function zoomFor(width, height) {
  return Math.max(MIN_ZOOM, Math.min(1, width / BASE_WIDTH, height / BASE_HEIGHT));
}

function fitToWindow(win) {
  const apply = () => {
    if (win.isDestroyed()) return;
    const [w, h] = win.getContentSize();
    win.webContents.setZoomFactor(zoomFor(w, h));
  };
  win.on('resize', apply);
  win.webContents.on('did-finish-load', apply);
  apply();
}

module.exports = { fitToWindow, zoomFor, BASE_WIDTH, BASE_HEIGHT, MIN_ZOOM };
