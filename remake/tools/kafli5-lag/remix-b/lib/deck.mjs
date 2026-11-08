// The decks: the record (the source stems) read at any position and speed, through moves that the DJ makes with her hands.
// Every move is a segment of the output: samples [a, b), and for each sample the record's position (source samples) and its
// speed (source samples per output sample). Segments meet with a 2 ms equal-gain crossfade, so a cut never clicks and a move
// that continues the position (play into brake) is seamless.
import { SR } from './io.mjs';
import { SPB } from './score.mjs';

// ---------------------------------------------------------------- reading the record at any speed
// Kaiser-windowed sinc; its cutoff follows the speed (a record played fast must not alias), its width follows the cutoff.
function bessel0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 30; k++) {
    t *= (x / (2 * k)) ** 2;
    s += t;
  }
  return s;
}
const HALF = 12;
const BETA = 7.5;
const I0B = bessel0(BETA);
const WT = 4096;
const WIN = new Float64Array(WT + 2).map((_, k) => (k > WT ? 0 : bessel0(BETA * Math.sqrt(Math.max(0, 1 - (k / WT) ** 2))) / I0B));

/** One sample of x at fractional position p, as heard with the record moving at `speed` (anti-aliased by |speed|). */
export function readAt(x, p, speed) {
  const a = Math.abs(speed);
  const c = Math.floor(p);
  if (p === c && a === 1) return c >= 0 && c < x.length ? x[c] : 0;
  const cut = a > 1 ? 0.94 / a : 0.94;
  const half = Math.min(72, Math.ceil(HALF / cut));
  let s = 0;
  const lo = Math.max(0, c - half + 1), hi = Math.min(x.length - 1, c + half);
  for (let k = lo; k <= hi; k++) {
    const d = p - k;
    const au = (Math.abs(d) / half) * WT;
    if (au >= WT) continue;
    const ki = au | 0;
    const w = WIN[ki] + (WIN[ki + 1] - WIN[ki]) * (au - ki);
    const arg = Math.PI * d * cut;
    s += x[k] * (arg === 0 ? 1 : Math.sin(arg) / arg) * w;
  }
  return s * cut;
}

// ---------------------------------------------------------------- moves
const S = b => Math.round(b * SPB);

/** Play from source beat `src` at a fixed rate (1, or 0.5 / 2: an octave down / up, half- / double-time on the same grid). */
export function play(o0, o1, src, rate = 1, opts = {}) {
  const a = S(o0), b = S(o1), s0 = src * SPB;
  return { kind: rate === 1 ? 'play' : rate < 1 ? 'half' : 'double', a, b, o0, o1, src, rate, posAt: i => s0 + rate * (i - a), speedAt: () => rate, ...opts };
}

/** A move whose speed follows v(u), u from 0 to 1 over the segment; the position is the running sum of the speed. */
function curve(kind, o0, o1, src, v, opts = {}) {
  const a = S(o0), b = S(o1), N = b - a;
  const pos = new Float64Array(N + 1), spd = new Float32Array(N + 1);
  let p = src * SPB;
  for (let i = 0; i <= N; i++) {
    const s = v(i / N);
    spd[i] = s;
    pos[i] = p;
    p += s;
  }
  const end = pos[N];
  return {
    kind, a, b, o0, o1, src, srcEnd: end / SPB,
    posAt: i => (i <= a ? pos[0] + spd[0] * (i - a) : i >= b ? end + spd[N] * (i - b) : pos[i - a]),
    speedAt: i => spd[Math.max(0, Math.min(N, i - a))],
    level: true,
    ...opts,
  };
}

/** Brake / tape stop: the record slows from `from` (1) to rest over the segment (p = curve shape; 1 is the turntable's brake). */
export function brake(o0, o1, src, { p = 1.25, from = 1, ...opts } = {}) {
  return curve('brake', o0, o1, src, u => from * (1 - u) ** p, opts);
}

/**
 * Rewind: her hand stops the record, spins it back fast and lets it come to rest exactly on the cue point `to` (source beat) at
 * the segment's end. The forward motion dies in the first `grab` of the segment; the spin back rises fast and eases to rest.
 */
export function rewind(o0, o1, from, to, { grab = 0.08, rise = 0.15, ease = 1.1, ...opts } = {}) {
  const c0 = u => (u < grab ? (1 - u / grab) ** 2 : 0);
  const u0 = grab * 0.55;
  const g = u => {
    if (u <= u0) return 0;
    const r = (u - u0) / (1 - u0);
    return r < rise ? Math.sin((Math.PI / 2) * (r / rise)) ** 2 : (1 - (r - rise) / (1 - rise)) ** ease;
  };
  const a = S(o0), b = S(o1), N = b - a;
  let sc = 0, sg = 0;
  for (let i = 0; i < N; i++) {
    sc += c0(i / N);
    sg += g(i / N);
  }
  const delta = (to - from) * SPB;
  const vm = (sc - delta) / sg; // so that the running sum lands exactly on `to`
  const seg = curve('rewind', o0, o1, from, u => c0(u) - vm * g(u), opts);
  seg.peakSpeed = -vm;
  seg.to = to;
  return seg;
}

/** Stutter: the slice [src, src + len) (beats) played again and again, `times` times, from o0 on. */
export function stutter(o0, src, len, times, opts = {}) {
  const out = [];
  for (let k = 0; k < times; k++) out.push(play(o0 + k * len, o0 + (k + 1) * len, src, 1, { kind: 'stutter', ...opts }));
  return out;
}

/**
 * Beat juggle over one bar: `steps` = [[outStep, srcStep, lenSteps], ...] in sixteenths from the bar starts `outBar` and
 * `srcBar` (beats): two copies of the record, cut between with the crossfader, each played at its own speed (1).
 */
export function juggle(outBar, srcBar, steps, opts = {}) {
  return steps.map(([o, s, len]) => play(outBar + o / 4, outBar + (o + len) / 4, srcBar + s / 4, 1, { kind: 'juggle', ...opts }));
}

// ---------------------------------------------------------------- rendering a deck
const XF = Math.round(0.001 * SR); // half the crossfade (1 ms each side of a boundary)

/**
 * Render one stem through a list of segments into an output stereo buffer of n samples.
 * Each segment may carry `gains` ({ stem: g }) and `level` (stylus level follows speed: silent at rest; `fastSoft` holds a
 * fast spin down: 1 / (1 + fastSoft (|speed| - 1))).
 */
export function renderDeck(stemName, src, segs, n, { levelPow = 0.8, fastSoft = 0 } = {}) {
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const sg of segs) {
    const g0 = sg.gains?.[stemName] ?? sg.gain ?? 1;
    if (g0 === 0) continue;
    const fadeIn = sg.noFadeIn ? 0 : sg.fin ?? XF, fadeOut = sg.noFadeOut ? 0 : sg.fout ?? XF;
    const from = Math.max(0, sg.a - fadeIn), to = Math.min(n, sg.b + fadeOut);
    const p0 = sg.posAt(sg.a);
    const fast = p0 === Math.round(p0) && sg.rate === 1 && !sg.level;
    const off = fast ? Math.round(p0) - sg.a : 0;
    for (let i = from; i < to; i++) {
      let w = 1;
      if (fadeIn && i < sg.a + fadeIn) w = 0.5 - 0.5 * Math.cos((Math.PI * (i - (sg.a - fadeIn))) / (2 * fadeIn));
      if (fadeOut && i >= sg.b - fadeOut) w *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (sg.b - fadeOut))) / (2 * fadeOut));
      if (w <= 0) continue;
      let l, r, sp = 1;
      if (fast) {
        const j = i + off;
        if (j < 0 || j >= src.L.length) continue;
        l = src.L[j];
        r = src.R[j];
      } else {
        const p = sg.posAt(i);
        sp = sg.speedAt(i);
        if (sg.level && Math.abs(sp) < 1e-4) continue;
        l = readAt(src.L, p, sp);
        r = readAt(src.R, p, sp);
      }
      let g = g0 * w;
      if (sg.level) {
        // the stylus level follows the record's speed: silent at rest, and a fast spin is held down smoothly (no step at 1)
        const a = Math.abs(sp);
        g *= a <= 1 ? a ** levelPow : 1 / (1 + fastSoft * (a - 1));
      }
      L[i] += l * g;
      R[i] += r * g;
    }
  }
  return { L, R, n };
}

/**
 * Settle the crossfades: where one segment ends exactly where the next begins, both use the wider of their two widths
 * (`xf` in ms, half on each side of the boundary), so the two fades always sum to one.
 */
export function prepare(segs) {
  const s = [...segs].sort((p, q) => p.a - q.a);
  for (const sg of s) sg.fin = sg.fout = Math.round(((sg.xf ?? 1) / 1000) * SR);
  for (let k = 1; k < s.length; k++) {
    const p = s[k - 1], q = s[k];
    if (p.b === q.a) {
      const w = Math.max(p.fout, q.fin);
      p.fout = q.fin = w;
    }
  }
  return s;
}

/** Where a source beat is heard in the output: every output beat that plays it at speed 1 (for cues and checks). */
export function mapBeat(segs, srcBeat) {
  const out = [];
  for (const sg of segs) {
    if (sg.rate !== 1 || sg.level) continue;
    const ob = sg.o0 + (srcBeat - sg.src);
    if (ob >= sg.o0 - 1e-9 && ob < sg.o1 - 1e-9) out.push(+ob.toFixed(6));
  }
  return out;
}
