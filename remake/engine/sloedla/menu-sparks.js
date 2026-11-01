// Sparks over the song cards in the menu of Slóeðla's song game: a burst in the card's colour when one is picked. A canvas of
// its own over the cards; nothing at all when the device asks for less motion.

const COUNT = 24;
const LIFE = 0.6; // s

/** Sparks on `canvas`: burst(x, y, hue), x and y in the canvas's own CSS pixels. */
export function createSparks(canvas, { reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false } = {}) {
  if (!canvas || reduced) return { burst() {} };
  const g = canvas.getContext('2d');
  const sparks = [];
  let last = null;

  function fit() {
    const rect = canvas.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function star(x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const k = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
    }
    g.closePath();
    g.fill();
  }

  function tick(now) {
    const dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life += dt;
      if (s.life >= LIFE) { sparks.splice(i, 1); continue; }
      s.vy += 520 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = 1 - s.life / LIFE;
      g.globalAlpha = k;
      g.fillStyle = s.white ? '#fff6c8' : s.hue;
      g.shadowColor = s.hue;
      g.shadowBlur = 10;
      star(s.x, s.y, s.size * (0.6 + 0.4 * k));
    }
    g.globalAlpha = 1;
    if (sparks.length) requestAnimationFrame(tick);
    else { last = null; g.clearRect(0, 0, canvas.width, canvas.height); }
  }

  return {
    burst(x, y, hue = '#ffd76a') {
      const idle = !sparks.length;
      if (idle) fit();
      for (let i = 0; i < COUNT; i++) {
        const a = Math.random() * Math.PI * 2, speed = 140 + Math.random() * 260;
        sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 160, life: 0, size: 5 + Math.random() * 7, hue, white: i % 3 === 0 });
      }
      if (idle) requestAnimationFrame(tick);
    },
  };
}
