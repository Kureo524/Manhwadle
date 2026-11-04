// Met l'interface à l'échelle de la fenêtre (comme un zoom), par exemple quand elle est en
// tuile à côté d'une autre sous Hyprland.
// - Fenêtre assez large : la mise en page complète (prévue pour 1360 px de large) rétrécit d'un
//   bloc, jusqu'à 60 %. Jamais d'agrandissement au-delà de 100 %. Seule la largeur compte : une
//   fenêtre basse garde une taille lisible et la page défile verticalement.
// - Fenêtre trop étroite pour ça : rétrécir davantage rendrait le texte illisible. On passe à la
//   mise en page compacte du CSS (celle du site sur téléphone, sous 760 px CSS), à taille lisible.
const BASE_WIDTH = 1360;
const MIN_ZOOM = 0.6;
const COMPACT_WIDTH = 680; // largeur CSS visée en mise en page compacte
const COMPACT_ZOOM = [0.7, 1.2];

function zoomFor(width) {
  if (width / BASE_WIDTH >= MIN_ZOOM) return Math.min(1, width / BASE_WIDTH);
  const [lo, hi] = COMPACT_ZOOM;
  return Math.max(lo, Math.min(hi, width / COMPACT_WIDTH));
}

function fitToWindow(win) {
  const apply = () => {
    if (win.isDestroyed()) return;
    const [w] = win.getContentSize();
    win.webContents.setZoomFactor(zoomFor(w));
  };
  win.on('resize', apply);
  win.webContents.on('did-finish-load', apply);
  apply();
}

module.exports = { fitToWindow, zoomFor, BASE_WIDTH, MIN_ZOOM, COMPACT_WIDTH };
