// The words of Slóeðla's song game, drawn with juice: each letter pops in a moment after the one before it (a "back-out" ease
// that overshoots and settles), may bob on a wave, and is filled with a gradient: gold, mint, sky, lilac, a friend's own colours,
// or a rainbow whose hue runs along the letters and moves with time. A dark outline keeps every word readable on the night sky.
//
// What the game says, and when (game.js draws them):
//   - a word over the dinosaur she tapped, for how close to the beat it was (gradeOf): "Fullkomið!" in the rainbow right on it,
//     "Frábært!" in gold close by, "Fínt!" and "OK!" further off (never a word for a miss: that is the grey puff);
//   - a run's milestones ("10 í röð!", "15 í röð!" ... milestoneOf) rising from low on the screen, in the rainbow from twenty;
//   - the tiers' words in the middle, a friend coming back in her own colours, and the words at the end.

/** The words for a tapped note by how close it was (gradeOf), their colours and their size against a lane's. */
export const GRADES = {
  perfect: { text: 'Fullkomið!', style: 'rainbow', size: 1.12 },
  great: { text: 'Frábært!', style: 'gold', size: 1 },
  fine: { text: 'Fínt!', style: 'mint', size: 0.9 },
  ok: { text: 'OK!', style: 'sky', size: 0.82 },
};

/**
 * How close a tap was to its note's beat, `offset` s from it (negative early), against the level's windows (chart.js LEVELS:
 * `perfect`, `great`, `fine`): 'perfect', 'great', 'fine' or 'ok'.
 */
export function gradeOf(offset, { perfect = 0.07, great = 0.15, fine = 0.24 } = {}) {
  const gap = Math.abs(offset);
  return gap <= perfect ? 'perfect' : gap <= great ? 'great' : gap <= fine ? 'fine' : 'ok';
}

/** Whether a run of `streak` hits is a milestone worth saying out loud: 10, 15, 20 ... 50, then every ten. */
export function milestoneOf(streak) {
  return streak >= 10 && streak % (streak <= 50 ? 5 : 10) === 0;
}

/** Points written the Icelandic way, a full stop between thousands: 4250 → "4.250". */
export function pointsText(n) {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// fills from the top of a letter to its foot
const PALETTES = {
  cream: ['#fffdf0', '#fff0b8'],
  gold: ['#fffbe0', '#ffd24a', '#ff9a1f'],
  mint: ['#f0fff8', '#8ff0c4', '#3fcf95'],
  sky: ['#f2faff', '#a6dcff', '#5bb6f5'],
  lilac: ['#fbf5ff', '#d9bfff', '#a77bf0'],
  grey: ['#e4e0f2', '#b9b4d6'],
};
// a soft light behind the letters, never strong (a flash of light is kept well inside WCAG 2.3.1's limits)
const GLOW = { gold: 'rgba(255, 196, 60, 0.5)', mint: 'rgba(80, 230, 170, 0.45)', sky: 'rgba(110, 190, 255, 0.45)', lilac: 'rgba(190, 150, 255, 0.45)' };

/** The overshooting ease of a pop: 0 at 0, past 1 a little, 1 at 1. */
export function backOut(t) {
  const c = 1.70158;
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function fillOf(g, style, y, size, index, time) {
  const grad = g.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.45);
  if (style === 'rainbow') {
    const hue = (time * 200 + index * 34) % 360;
    grad.addColorStop(0, `hsl(${hue}, 100%, 90%)`);
    grad.addColorStop(0.45, `hsl(${hue}, 100%, 70%)`);
    grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 95%, 58%)`);
    return grad;
  }
  const stops = Array.isArray(style) ? style : PALETTES[style] ?? PALETTES.cream;
  stops.forEach((colour, k) => grad.addColorStop(k / Math.max(1, stops.length - 1), colour));
  return grad;
}

const fontOf = px => `900 ${px}px Nunito, ui-rounded, "Arial Rounded MT Bold", sans-serif`;
const REF = 100; // px: words are laid out once at this size and scaled (a font's spacing grows with its size)
const layouts = new Map();
// a word laid out before the round's font came would keep the fallback font's spacing
globalThis.document?.fonts?.addEventListener?.('loadingdone', () => layouts.clear());

/** Where each letter of `parts` sits at REF px, with the font's own spacing kept: { letters: [{ char, k, centre }], width }. */
function layoutOf(g, parts) {
  const key = parts.map(([str, k]) => `${k}|${str}`).join('\u0000');
  let shape = layouts.get(key);
  if (shape) return shape;
  const widthOf = (str, px) => { g.font = fontOf(px); return g.measureText(str).width; };
  const letters = [];
  let width = 0;
  for (const [str, k] of parts) {
    const px = REF * k;
    let prefix = '';
    for (const char of str) {
      const before = widthOf(prefix, px);
      const after = widthOf(prefix + char, px);
      letters.push({ char, k, centre: width + (before + after) / 2 });
      prefix += char;
    }
    width += widthOf(str, px);
  }
  shape = { letters, width };
  if (layouts.size > 200) layouts.clear();
  layouts.set(key, shape);
  return shape;
}

/**
 * Draws `text` centred on (x, y) at `size` px: a string, or parts in their own sizes ([['10', 1.4], [' í röð!', 0.85]]).
 * `style` is a palette name ('rainbow', 'gold', 'mint', 'sky', 'lilac', 'cream', 'grey') or a list of colours from top to foot.
 * `age` s since it appeared: each letter pops in `stagger` s after the one before (over `pop` s); `wave` (a share of the size)
 * bobs the letters; `time` moves the rainbow and the wave; `glow` lights it from behind; `fit` the widest it may be (it shrinks);
 * `squash` [wide, tall] stretches the whole word about its middle.
 */
export function drawWord(g, text, x, y, size, { style = 'cream', time = 0, age = 1, stagger = 0.035, pop = 0.22, wave = 0, glow = true, fit = Infinity, alpha = 1, squash = null } = {}) {
  if (!text || alpha <= 0) return;
  const parts = Array.isArray(text) ? text : [[text, 1]];
  const shape = layoutOf(g, parts);
  if (shape.width * (size / REF) > fit) size = Math.max(8, Math.floor(size * (fit / (shape.width * (size / REF)))));
  const unit = size / REF;
  const left = shape.width * unit;
  const letters = shape.letters.map(({ char, k, centre }) => ({ char, px: Math.round(size * k), centre: centre * unit }));
  const shine = glow && style !== 'cream' && style !== 'grey' && !Array.isArray(style);
  g.save();
  g.globalAlpha *= alpha;
  if (squash) {
    // the whole word squashed about its middle ([wide, tall]): a word leaving flattens out as it goes
    g.translate(x, y);
    g.scale(squash[0], squash[1]);
    g.translate(-x, -y);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  letters.forEach(({ char, px, centre }, i) => {
    if (char === ' ') return;
    const scale = pop > 0 ? backOut((age - i * stagger) / pop) : 1;
    if (scale <= 0.01) return;
    g.save();
    g.translate(x - left / 2 + centre, y + (wave ? Math.sin(time * 7 + i * 0.7) * px * wave : 0));
    g.scale(scale, scale);
    g.font = fontOf(px);
    g.lineWidth = Math.max(4, px * 0.17);
    g.strokeStyle = 'rgba(30, 18, 64, 0.9)';
    g.strokeText(char, 0, 0);
    if (shine) {
      g.shadowColor = style === 'rainbow' ? `hsla(${(time * 200 + i * 34) % 360}, 100%, 65%, 0.5)` : GLOW[style] ?? 'rgba(255,255,255,0.4)';
      g.shadowBlur = px * 0.35;
    }
    g.fillStyle = fillOf(g, style, 0, px, i, time);
    g.fillText(char, 0, 0);
    g.restore();
  });
  g.restore();
}
