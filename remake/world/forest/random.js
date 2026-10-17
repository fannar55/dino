// Seeded randomness for the forest. Everything is derived from layout.seed, so the same layout
// always grows the same forest. Separate named streams keep species independent: adding a
// flower does not move a single tree.

export function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random stream. `createRng(seed, 'trees')` and `createRng(seed, 'ferns')` never overlap. */
export function createRng(seed, stream = '') {
  const next = mulberry32((Math.imul(seed >>> 0, 2654435761) ^ hashString(stream)) >>> 0);
  const rng = {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: p => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    angle: () => next() * Math.PI * 2,
    pick: list => list[Math.floor(next() * list.length) % list.length],
    /** Pick from [[value, weight], ...]. */
    weighted(entries) {
      let total = 0;
      for (const [, w] of entries) total += w;
      let r = next() * total;
      for (const [value, w] of entries) { r -= w; if (r <= 0) return value; }
      return entries[entries.length - 1][0];
    },
    /** Roughly normal, mean 0, sd 1 (sum of uniforms, bounded). */
    normal: () => (next() + next() + next() + next() - 2) * 1.732,
    fork: name => createRng((seed + hashString(stream)) >>> 0, `${stream}/${name}`),
  };
  return rng;
}

/** Integer lattice hash in [0, 1). */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [0, 1] with fractal sums; deterministic for a seed. */
export function createNoise(seed) {
  const s = seed | 0;
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function noise(x, y, salt = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const k = s + salt * 7919;
    const a = hash2(xi, yi, k), b = hash2(xi + 1, yi, k);
    const c = hash2(xi, yi + 1, k), d = hash2(xi + 1, yi + 1, k);
    const u = fade(fx), v = fade(fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, octaves = 3, salt = 0) {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * f, y * f, salt + o * 13) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }
  /** 3D value noise from two 2D slices (cheap, good enough for lumps on blobs). */
  function noise3(x, y, z, salt = 0) {
    return (noise(x + z * 0.71, y - z * 0.37, salt) + noise(y + x * 0.53, z - x * 0.29, salt + 3)) * 0.5;
  }
  return { noise, fbm, noise3 };
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
