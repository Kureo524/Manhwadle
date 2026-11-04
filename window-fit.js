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

// Applique le zoom pour une largeur de fenêtre donnée (en px réels), sans rien faire si
// le zoom est déjà le bon (évite une boucle : changer le zoom redimensionne la page).
function applyZoom(wc, width) {
  const zoom = zoomFor(width);
  if (Math.abs(wc.getZoomFactor() - zoom) > 0.005) wc.setZoomFactor(zoom);
}

function fitToWindow(win) {
  const wc = win.webContents;
  const fromWindow = () => { if (!win.isDestroyed()) applyZoom(wc, win.getContentSize()[0]); };
  win.on('resize', fromWindow);
  wc.on('did-finish-load', fromWindow);
  // Sous Wayland, un gestionnaire en tuiles (Hyprland) redimensionne la fenêtre sans que
  // l'événement « resize » arrive toujours ici. La page, elle, voit toujours sa largeur
  // changer : elle envoie sa largeur CSS, convertie en px réels avec le zoom courant.
  wc.ipc.on('manhwadle:fit', (_event, cssWidth) => {
    if (!win.isDestroyed() && Number.isFinite(cssWidth) && cssWidth > 0) applyZoom(wc, cssWidth * wc.getZoomFactor());
  });
  fromWindow();
}

module.exports = { fitToWindow, zoomFor, BASE_WIDTH, MIN_ZOOM, COMPACT_WIDTH };
