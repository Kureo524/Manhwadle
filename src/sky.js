// Ciel de constellations (DA §6) : couche statique précalculée + couche animée à 20 i/s.
(function () {
  'use strict';
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  const STAR = [232, 238, 250];
  const FPS = 20;

  // Générateur pseudo-aléatoire à graine fixe : toujours le même ciel.
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  let W = 0, H = 0, dpr = 1, staticLayer = null, twinklers = [], lavender = [], shooting = null, nextShot = 0;

  function buildStatic() {
    const off = document.createElement('canvas');
    off.width = W * dpr; off.height = H * dpr;
    const c = off.getContext('2d');
    c.scale(dpr, dpr);
    c.fillStyle = 'rgb(12,12,18)';
    c.fillRect(0, 0, W, H);

    // Trois lumières froides diffuses, décroissance linéaire.
    const diag = Math.hypot(W, H);
    for (const [col, x, y, r, a] of [['#8aa8e0', .12, .18, .42, .31], ['#a597c0', .88, .12, .36, .25], ['#9ebd85', .60, 1.0, .42, .19]]) {
      const g = c.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * diag);
      g.addColorStop(0, rgba(hex(col), a));
      g.addColorStop(1, rgba(hex(col), 0));
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }

    const rand = rng(1729);
    const count = Math.round((W * H) / 2400);
    const stars = [];
    for (let i = 0; i < count; i++) {
      const s = { x: rand() * W, y: rand() * H, r: .3 + rand() * 1.3, a: .2 + rand() * .45 };
      stars.push(s);
      c.fillStyle = rgba(STAR, s.a);
      c.beginPath(); c.arc(s.x, s.y, s.r, 0, Math.PI * 2); c.fill();
    }

    // Constellation : jusqu'à 14 étoiles brillantes reliées si proches.
    const bright = stars.filter((s) => s.r > 1.2).slice(0, 14);
    c.strokeStyle = rgba(STAR, .16);
    c.lineWidth = 1;
    const maxD = Math.min(W, H) * .22;
    for (let i = 0; i < bright.length; i++)
      for (let j = i + 1; j < bright.length; j++) {
        const a = bright[i], b = bright[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < maxD) { c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
      }
    staticLayer = off;

    const r2 = rng(4242);
    twinklers = Array.from({ length: 70 }, () => ({
      x: r2() * W, y: r2() * H, r: .5 + r2() * 1.1, size: .8 + r2() * .4, speed: .4 + r2() * 1.2, phase: r2() * Math.PI * 2,
    }));
    // Petite constellation lavande (6 étoiles) en haut à droite.
    const cx = W * .72, cy = H * .26, spread = Math.min(W, H) * .16;
    lavender = Array.from({ length: 6 }, () => ({ x: cx + (r2() - .5) * spread * 2, y: cy + (r2() - .5) * spread }));
    lavender.sort((a, b) => a.x - b.x);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    buildStatic();
    draw(performance.now());
  }

  function draw(now) {
    const t = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const s of twinklers) {
      const tw = (Math.sin(t * s.speed + s.phase) + 1) / 2;
      ctx.fillStyle = rgba(STAR, .12 + .5 * tw);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.size * (.9 + .2 * tw), 0, Math.PI * 2); ctx.fill();
    }

    const breath = .08 + .12 * ((Math.sin((t / 16) * Math.PI * 2) + 1) / 2);
    ctx.strokeStyle = `rgba(165,151,192,${breath})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    lavender.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.fillStyle = 'rgba(165,151,192,.7)';
    for (const p of lavender) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fill(); }

    // Étoile filante toutes les 7 à 14 s dans le tiers haut.
    if (!shooting && t > nextShot) {
      shooting = { x: Math.random() * W * .8 + W * .1, y: Math.random() * H / 3, start: t, angle: Math.PI * (.12 + Math.random() * .1) };
      nextShot = t + 7 + Math.random() * 7;
    }
    if (shooting) {
      const p = (t - shooting.start) / 1.3;
      if (p >= 1) shooting = null;
      else {
        const travel = 260 * p, len = 140, a = Math.sin(p * Math.PI);
        const hx = shooting.x + Math.cos(shooting.angle) * travel, hy = shooting.y + Math.sin(shooting.angle) * travel;
        const tx = hx - Math.cos(shooting.angle) * len, ty = hy - Math.sin(shooting.angle) * len;
        const g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, 'rgba(201,214,245,0)');
        g.addColorStop(1, `rgba(201,214,245,${.55 * a})`);
        ctx.strokeStyle = g; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      }
    }
  }

  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || now - last < 1000 / FPS) return;
    last = now;
    draw(now);
  }

  window.addEventListener('resize', resize);
  resize();
  nextShot = performance.now() / 1000 + 4;
  requestAnimationFrame(loop);
})();
