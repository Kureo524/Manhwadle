// Reflet du curseur (DA §5) : un seul halo, inséré dans le verre le plus imbriqué sous le pointeur.
(function () {
  'use strict';
  const light = document.createElement('div');
  light.className = 'glass-light';
  let host = null;

  document.addEventListener('pointermove', (e) => {
    const target = e.target instanceof Element ? e.target.closest('.glass') : null;
    if (target !== host) {
      host = target;
      light.classList.remove('is-on');
      if (host) {
        host.prepend(light);
        requestAnimationFrame(() => light.classList.add('is-on'));
      } else light.remove();
    }
    if (host) {
      const r = host.getBoundingClientRect();
      light.style.left = `${e.clientX - r.left + host.scrollLeft}px`;
      light.style.top = `${e.clientY - r.top + host.scrollTop}px`;
    }
  });
  document.addEventListener('pointerleave', () => { host = null; light.classList.remove('is-on'); light.remove(); });
})();
