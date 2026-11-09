// The band: the track's six stems re-arranged on the output grid by the plan from buildBand() (score.mjs).
// Every output bar plays one source bar; overrides replace stretches of chosen stems by other source beats (beat repeats, rolls,
// stabs, the last hit). Each clip starts PRE before its beat, fades in over FADE and out over FADE at its end, so the cut lands in
// the 10 ms before a beat and every attack stays whole; clips that continue each other in the source are joined without a fade.
// Then per stem: gain automation (dB points), low- and high-pass sweeps, echo and reverb throws.
// Round two: the other records (records.mjs) are channels of the band too, each one stereo clip list (B.recs) on its own grid,
// with the same gain, filter and throw automation; and two of the DJ's hands work on what the band has just played: a spin-back
// (B.rewind: the last beats played backwards, faster and faster) and a tape stop (B.tapestop: the music slowing to a halt).
import { join } from 'node:path';
import { SR, decode } from './io.mjs';
import { stereo, SVF, pingPong, reverb, addStereo } from './dsp.mjs';
import { SPB, STEMS } from './score.mjs';
import { RECORDS, REC_NAMES, loadRecord } from './records.mjs';

export const TRACK_DIR = 'remake/assets/audio/sloedla/v2/djamm';
export const T0_SEC = 0.0272; // the track's beat 0 in song.mp3
export const STEM_LAG = 1105; // the stems are this many samples later than song.mp3
const PRE = Math.round(0.01 * SR);
const FADE = Math.round(0.004 * SR);
const outS = beat => Math.round(beat * SPB);

/** Load the stems, aligned to song.mp3's time: { name: {L, R} }. */
export function loadStems(ROOT) {
  const st = {};
  for (const s of STEMS) {
    const [L, R] = decode(join(ROOT, TRACK_DIR, `${s}.mp3`), 2);
    st[s] = { L: L.subarray(STEM_LAG), R: R.subarray(STEM_LAG) };
  }
  return st;
}
const srcAt = t0 => beat => Math.round(t0 * SR) + Math.round(beat * SPB);
const srcS = srcAt(T0_SEC);

/** The clips of one stem: the bar map, with the overrides cut in. Each clip { o, n, s, g, hold, tau }. */
function clipsOf(B, stem) {
  let clips = [];
  if (RECORDS[stem]) for (const c of B.recs) {
    if (c.rec === stem) clips.push({ o: c.o, n: c.n, s: c.s, g: c.g ?? 1, hold: c.hold, tau: c.tau });
  }
  else B.bars.forEach((src, j) => {
    if (src !== null) clips.push({ o: 4 * j, n: 4, s: 4 * src, g: 1 });
  });
  clips.sort((p, q) => p.o - q.o);
  for (const ov of B.over) {
    if (!ov.stems.includes(stem)) continue;
    const a = ov.o, b = ov.o + ov.n;
    const next = [];
    for (const c of clips) {
      const ca = c.o, cb = c.o + c.n;
      if (cb <= a || ca >= b || c.hold !== undefined) {
        // a held clip (a hit) is never cut by a later override, only replaced if it starts inside it
        if (c.hold !== undefined && ca >= a && ca < b) continue;
        next.push(c);
        continue;
      }
      if (ca < a) next.push({ ...c, n: a - ca });
      if (cb > b) next.push({ ...c, o: b, n: cb - b, s: c.s + (b - ca) });
    }
    next.push({ o: ov.o, n: ov.n, s: ov.s, g: ov.g, hold: ov.hold, tau: ov.tau });
    clips = next.sort((p, q) => p.o - q.o);
  }
  return clips;
}

/** Render one stem's clips into a stereo buffer of n samples. */
function renderClips(src, clips, n, srcS) {
  const out = stereo(n);
  // join clips that continue each other in the source (same gain, no envelope)
  const joined = [];
  for (const c of clips) {
    const p = joined[joined.length - 1];
    if (p && p.hold === undefined && c.hold === undefined && Math.abs(p.o + p.n - c.o) < 1e-9 && Math.abs(p.s + p.n - c.s) < 1e-9 && p.g === c.g) p.n += c.n;
    else joined.push({ ...c });
  }
  for (const c of joined) {
    if (c.g === 0) continue;
    const o0 = outS(c.o) - PRE, s0 = srcS(c.s) - PRE;
    const len = outS(c.o + c.n) - outS(c.o) + FADE;
    const holdN = c.hold !== undefined ? Math.round(c.hold * SPB) + PRE : Infinity;
    const tauN = c.tau !== undefined ? c.tau * SR : 0;
    for (let i = 0; i < len; i++) {
      const j = o0 + i, k = s0 + i;
      if (j < 0 || j >= n || k < 0 || k >= src.L.length) continue;
      let g = c.g;
      if (i < FADE) g *= i / FADE;
      if (i >= len - FADE) g *= (len - i) / FADE;
      if (i > holdN) {
        const e = Math.exp(-(i - holdN) / tauN);
        if (e < 1e-4) break;
        g *= e;
      }
      out.L[j] += src.L[k] * g;
      out.R[j] += src.R[k] * g;
    }
  }
  return out;
}

/** dB automation → per-sample gain (points [beat, dB], linear in dB between them; -Infinity is silence). */
function gainCurve(points, n) {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const g = new Float32Array(n);
  const lin = db => (db === -Infinity || db < -80 ? 0 : 10 ** (db / 20));
  let k = 0;
  for (let i = 0; i < n; i++) {
    const beat = i / SPB;
    while (k + 1 < pts.length && pts[k + 1][0] <= beat) k++;
    const [b0, d0] = pts[k];
    if (beat < b0 || k + 1 >= pts.length) {
      g[i] = lin(d0);
      continue;
    }
    const [b1, d1] = pts[k + 1];
    const u = (beat - b0) / (b1 - b0);
    if (d0 === -Infinity || d1 === -Infinity || d0 < -80 || d1 < -80) g[i] = lin(d0) * (1 - u) + lin(d1) * u;
    else g[i] = lin(d0 + (d1 - d0) * u);
  }
  return g;
}

/** A filter sweep over a window: 4-pole (two SVFs), cut-off exponential from f0 to f1, 8 ms crossfades in and out. */
function sweep(st, w, kind, n) {
  const a = Math.max(0, outS(w.from) - PRE), b = Math.min(n, outS(w.to) - PRE);
  const xf = Math.round(0.008 * SR);
  for (const ch of [st.L, st.R]) {
    const f1 = new SVF(), f2 = new SVF();
    for (let i = a; i < b; i++) {
      if ((i - a) % 32 === 0) {
        const u = (i - a) / Math.max(1, b - a);
        const fc = w.f0 * (w.f1 / w.f0) ** u;
        f1.set(fc, 0.54);
        f2.set(fc, 1.31);
      }
      f1.tick(ch[i]);
      const y1 = kind === 'lp' ? f1.lp : f1.hp;
      f2.tick(y1);
      const y = kind === 'lp' ? f2.lp : f2.hp;
      const mix = Math.min(1, (i - a) / xf, (b - i) / xf);
      ch[i] = ch[i] * (1 - mix) + y * mix;
    }
  }
}

/** The spin-back: from `beat`, what was played before it, backwards, the platter sped up from 1x by `accel` per second, for `sec`. */
// a leveller: in a window, the stem's loud hits held down against its quiet off-beats (a peak follower, fast attack, slow
// release; the threshold relative to the window's own loudest hit), then made up to the window's loudness before. Its edges fade
// over 50 ms. It fills the gaps of a record of bare percussion so the hits do not jump out of near silence.
function leveller(st, w, n) {
  const a = Math.max(0, outS(w.from) - PRE), b = Math.min(n, outS(w.to) - PRE);
  const att = Math.exp(-1 / (0.002 * SR)), rel = Math.exp(-1 / ((w.release ?? 0.18) * SR));
  const env = new Float32Array(b - a);
  let e = 0, top = 0;
  for (let i = a; i < b; i++) {
    const x = Math.max(Math.abs(st.L[i]), Math.abs(st.R[i]));
    e = x > e ? att * e + (1 - att) * x : rel * e + (1 - rel) * x;
    env[i - a] = e;
    if (e > top) top = e;
  }
  const thr = top * 10 ** (w.thr / 20), xf = Math.round(0.05 * SR);
  let before = 0, after = 0;
  const g = new Float32Array(b - a);
  for (let i = a; i < b; i++) {
    const v = env[i - a];
    const gc = v > thr ? (v / thr) ** (1 / w.ratio - 1) : 1;
    const m = Math.min(1, (i - a) / xf, (b - i) / xf);
    g[i - a] = 1 + (gc - 1) * m;
    before += st.L[i] * st.L[i] + st.R[i] * st.R[i];
    after += (st.L[i] * g[i - a]) ** 2 + (st.R[i] * g[i - a]) ** 2;
  }
  const up = after > 0 ? Math.sqrt(before / after) : 1;
  for (let i = a; i < b; i++) {
    const m = Math.min(1, (i - a) / xf, (b - i) / xf);
    const k = g[i - a] * (1 + (up - 1) * m);
    st.L[i] *= k;
    st.R[i] *= k;
  }
}
function rewind(st, w) {
  const a = outS(w.beat), len = Math.round(w.sec * SR);
  for (const ch of [st.L, st.R]) {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / SR, back = (t + 0.5 * w.accel * t * t) * SR, p = a - back;
      const k = Math.floor(p), u = p - k;
      if (k < 1) break;
      const fade = Math.min(1, i / (0.004 * SR), (len - i) / (0.06 * SR));
      out[i] = ((ch[k] ?? 0) * (1 - u) + (ch[k + 1] ?? 0) * u) * fade;
    }
    for (let i = 0; i < len && a + i < ch.length; i++) ch[a + i] = out[i];
    for (let i = a + len; i < Math.min(ch.length, a + len + Math.round(0.02 * SR)); i++) ch[i] = 0;
  }
}
/** The tape stop: from `beat`, the music as it was, slowing from 1x to a halt over `sec`; silence after it. */
function tapeStop(st, w) {
  const a = outS(w.beat), len = Math.round(w.sec * SR);
  for (const ch of [st.L, st.R]) {
    const src = ch.slice(a, a + len);
    for (let i = 0; i < len && a + i < ch.length; i++) {
      const t = i / SR, p = (t - (t * t) / (2 * w.sec)) * SR;
      const k = Math.floor(p), u = p - k;
      const fade = Math.min(1, (len - i) / (0.08 * SR));
      ch[a + i] = ((src[k] ?? 0) * (1 - u) + (src[k + 1] ?? 0) * u) * fade;
    }
    for (let i = a + len; i < Math.min(ch.length, a + len + Math.round(0.5 * SPB)); i++) ch[i] = 0;
  }
}

/** The whole band: { stems: {drums, bass, guitar, other, piano, vocals, and each record}, log }. */
export function renderBand(B, ROOT, n, work) {
  const src = loadStems(ROOT);
  for (const r of REC_NAMES) if (B.recs.some(c => c.rec === r)) src[r] = loadRecord(ROOT, r, work);
  const CH = [...STEMS, ...REC_NAMES.filter(r => src[r])];
  // the section levels, stepped like a fader in the 11 ms before each change
  const lv = [[-1, 0]];
  for (const [beat, d] of B.level ?? []) lv.push([beat - 0.035, lv[lv.length - 1][1]], [beat - 0.012, d]);
  const level = gainCurve(lv, n);
  const out = {};
  const log = {};
  for (const s of CH) {
    const clips = clipsOf(B, s);
    const st = renderClips(src[s], clips, n, RECORDS[s] ? srcAt(RECORDS[s].t0) : srcS);
    const g = gainCurve(B.gain[s] ?? [[-1, 0]], n);
    for (let i = 0; i < n; i++) {
      st.L[i] *= g[i] * level[i];
      st.R[i] *= g[i] * level[i];
    }
    for (const w of B.lp[s] ?? []) sweep(st, w, 'lp', n);
    for (const w of B.hp[s] ?? []) sweep(st, w, 'hp', n);
    for (const w of (B.level2 ?? []).filter(x => x.stems.includes(s))) leveller(st, w, n);
    out[s] = st;
    log[s] = clips.length;
  }
  // throws: the stem's sound in a window into a tempo echo or a big room, added to the same stem
  for (const e of B.echo) for (const s of e.stems.filter(x => out[x])) {
    const send = stereo(n);
    const a = Math.max(0, outS(e.from) - PRE), b = Math.min(n, outS(e.to) - PRE);
    for (let i = a; i < b; i++) {
      send.L[i] = out[s].L[i] * e.send;
      send.R[i] = out[s].R[i] * e.send;
    }
    addStereo(out[s], pingPong(send, 0.75 * SPB, e.fb, 5000, 300), 0, 1);
  }
  for (const v of B.verb) {
    const send = stereo(n);
    const a = Math.max(0, outS(v.from) - PRE), b = Math.min(n, outS(v.to) - PRE);
    const xf = Math.round(0.05 * SR);
    const vs = v.stems.filter(x => out[x]);
    for (const s of vs)
      for (let i = a; i < b; i++) {
        const m = Math.min(1, (i - a) / xf, (b - i) / xf) * v.send;
        send.L[i] += out[s].L[i] * m;
        send.R[i] += out[s].R[i] * m;
      }
    const wet = reverb(send, { decay: 2.4, damp: 7000, predelay: 0.025, lowcut: 250, seed: 31, size: 1.2 });
    // the room goes back into the stems it came from, in proportion to what each sent (here: equal shares)
    const share = 1 / vs.length;
    for (const s of vs) addStereo(out[s], wet, 0, share);
  }
  // the DJ's hands on what was just played, on every channel alike (so the stems stay one band)
  for (const w of B.rewind ?? []) for (const s of CH) rewind(out[s], w);
  for (const w of B.tapestop ?? []) for (const s of CH) tapeStop(out[s], w);
  return { stems: out, log };
}
