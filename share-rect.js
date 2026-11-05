// Rectangle à capturer pour le partage en image, en px de fenêtre. Sans Electron : testé directement.
//   m : zone de jeu mesurée dans la page, en px CSS ({ x, y, w, h, vw }) ; cw, ch : taille de la fenêtre ; pad : marge en px CSS.
function captureRect(m, cw, ch, pad) {
  const k = cw / m.vw; // px CSS → px fenêtre
  const x = Math.max(0, Math.floor((m.x - pad) * k));
  const y = Math.max(0, Math.floor((m.y - pad) * k));
  return {
    x, y,
    width: Math.min(cw - x, Math.ceil((m.w + 2 * pad) * k)),
    height: Math.min(ch - y, Math.ceil((m.h + 2 * pad) * k)),
  };
}

module.exports = { captureRect };
