// The band: the track's six stems re-arranged on the output grid by the plan from buildBand() (score.mjs).
// Every output bar plays one source bar; overrides replace stretches of chosen stems by other source beats (beat repeats, rolls,
// stabs, the last hit). Each clip starts PRE before its beat, fades in over FADE and out over FADE at its end, so the cut lands in
// the 10 ms before a beat and every attack stays whole; clips that continue each other in the source are joined without a fade.
// Then per stem: gain automation (dB points), low- and high-pass sweeps, echo and reverb throws.
import { join } from 'node:path';
import { SR, decode } from './io.mjs';
import { stereo, SVF, pingPong, reverb, addStereo } from './dsp.mjs';
import { SPB, STEMS } from './score.mjs';

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
const srcS = beat => Math.round(T0_SEC * SR) + Math.round(beat * SPB);

/** The clips of one stem: the bar map, with the overrides cut in. Each clip { o, n, s, g, hold, tau }. */
function clipsOf(B, stem) {
  let clips = [];
  B.bars.forEach((src, j) => {
    if (src !== null) clips.push({ o: 4 * j, n: 4, s: 4 * src, g: 1 });
  });
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
function renderClips(src, clips, n) {
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

/** The whole band: { stems: {drums, bass, guitar, other, piano, vocals}, log }. */
export function renderBand(B, ROOT, n) {
  const src = loadStems(ROOT);
  // the section levels, stepped like a fader in the 11 ms before each change
  const lv = [[-1, 0]];
  for (const [beat, d] of B.level ?? []) lv.push([beat - 0.035, lv[lv.length - 1][1]], [beat - 0.012, d]);
  const level = gainCurve(lv, n);
  const out = {};
  const log = {};
  for (const s of STEMS) {
    const clips = clipsOf(B, s);
    const st = renderClips(src[s], clips, n);
    const g = gainCurve(B.gain[s], n);
    for (let i = 0; i < n; i++) {
      st.L[i] *= g[i] * level[i];
      st.R[i] *= g[i] * level[i];
    }
    for (const w of B.lp[s]) sweep(st, w, 'lp', n);
    for (const w of B.hp[s]) sweep(st, w, 'hp', n);
    out[s] = st;
    log[s] = clips.length;
  }
  // throws: the stem's sound in a window into a tempo echo or a big room, added to the same stem
  for (const e of B.echo) for (const s of e.stems) {
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
    for (const s of v.stems)
      for (let i = a; i < b; i++) {
        const m = Math.min(1, (i - a) / xf, (b - i) / xf) * v.send;
        send.L[i] += out[s].L[i] * m;
        send.R[i] += out[s].R[i] * m;
      }
    const wet = reverb(send, { decay: 2.4, damp: 7000, predelay: 0.025, lowcut: 250, seed: 31, size: 1.2 });
    // the room goes back into the stems it came from, in proportion to what each sent (here: equal shares)
    const share = 1 / v.stems.length;
    for (const s of v.stems) addStereo(out[s], wet, 0, share);
  }
  return { stems: out, log };
}
