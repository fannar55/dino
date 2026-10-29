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

// fills from the top of a letter to its foot
const PALETTES = {
  cream: ['#fffdf0', '#fff0b8'],
  gold: ['#fffbe0', '#ffd24a', '#ff9a1f'],
  mint: ['#f0fff8', '#8ff0c4', '#3fcf95'],
  sky: ['#f2faff', '#a6dcff', '#5bb6f5'],
  lilac: ['#fbf5ff', '#d9bfff', '#a77bf0'],
  grey: ['#e4e0f2', '#b9b4d6'],
};
const GLOW = { gold: 'rgba(255, 196, 60, 0.75)', mint: 'rgba(80, 230, 170, 0.55)', sky: 'rgba(110, 190, 255, 0.55)', lilac: 'rgba(190, 150, 255, 0.55)' };

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

/**
 * Draws `text` centred on (x, y) at `size` px. `style` is a palette name ('rainbow', 'gold', 'mint', 'sky', 'lilac', 'cream',
 * 'grey') or a list of colours from top to foot. `age` s since it appeared: each letter pops in `stagger` s after the one before;
 * `wave` (a share of the size) bobs the letters; `time` moves the rainbow and the wave; `glow` lights it from behind;
 * `fit` the widest it may be (it shrinks to fit).
 */
export function drawWord(g, text, x, y, size, { style = 'cream', time = 0, age = 1, stagger = 0.035, pop = 0.22, wave = 0, glow = true, fit = Infinity, alpha = 1 } = {}) {
  if (!text || alpha <= 0) return;
  const font = s => `900 ${s}px Nunito, ui-rounded, "Arial Rounded MT Bold", sans-serif`;
  g.font = font(size);
  const natural = g.measureText(text).width;
  if (natural > fit) {
    size = Math.max(8, Math.floor(size * (fit / natural)));
    g.font = font(size);
  }
  const letters = [...text];
  const widths = letters.map(letter => g.measureText(letter).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const outline = Math.max(4, size * 0.17);
  const shine = glow && style !== 'cream' && style !== 'grey' && !Array.isArray(style);
  g.save();
  g.globalAlpha *= alpha;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  let left = x - total / 2;
  letters.forEach((letter, i) => {
    const cx = left + widths[i] / 2;
    left += widths[i];
    if (letter === ' ') return;
    const scale = pop > 0 ? backOut((age - i * stagger) / pop) : 1;
    if (scale <= 0.01) return;
    const cy = y + (wave ? Math.sin(time * 7 + i * 0.7) * size * wave : 0);
    g.save();
    g.translate(cx, cy);
    g.scale(scale, scale);
    g.lineWidth = outline;
    g.strokeStyle = 'rgba(30, 18, 64, 0.9)';
    g.strokeText(letter, 0, 0);
    if (shine) {
      g.shadowColor = style === 'rainbow' ? `hsla(${(time * 200 + i * 34) % 360}, 100%, 65%, 0.8)` : GLOW[style] ?? 'rgba(255,255,255,0.5)';
      g.shadowBlur = size * 0.35;
    }
    g.fillStyle = fillOf(g, style, 0, size, i, time);
    g.fillText(letter, 0, 0);
    g.restore();
  });
  g.restore();
}
