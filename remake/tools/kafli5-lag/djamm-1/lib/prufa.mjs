// The trial "prufa 2" (render.mjs --prufa, into qa/remake/kafli5/lag/djamm/2/): the mix review's three fixes, for the owner's ear.
// Without --prufa nothing here runs and the tool makes the shipped set.
//   1. The four drops carry their weight where small speakers play: the bass drop (`sub`) is pitched up and driven (its body at
//      about 50-120 Hz, its harmonics at 150-500 Hz), the deep original stays only as a remnant well under the kick and the bass,
//      and the drop's one gets a bright layer: the reverse crash played forwards (a crash) and a volley of the crowd's real claps.
//      Only the samples the tool already has; no event moves and no cue changes.
//   2. The animals stem (with her wing flaps) is high-passed at 30 Hz before its own limiter, so an 11-16 Hz rumble nobody hears
//      no longer turns the animals down on her wing beats.
//   3. A gentle split-band de-esser on her stem (before her limiter): only the part above 4.5 kHz, and only while it is louder than
//      the rest of her voice (an "s"), is turned down, at most PRUFA.deEss.maxDb.
import { Biquad } from './dsp.mjs';
import { SR } from './io.mjs';

export const PRUFA = {
  name: 'prufa-2',
  out: 'qa/remake/kafli5/lag/djamm/2',
  drop: { remnantDb: -12, remnantHp: 25, upRate: 2.5, upDrive: 2.5, upHp: 45, upDb: -3, crashDb: -9, crashLen: 3, clapsDb: 0, clapPeople: 16, hitDb: 0 },
  animalsHp: 30,
  deEss: { splitHz: 4500, thresholdDb: -10, ratio: 2, maxDb: 6, attackMs: 1, releaseMs: 45 },
};

/** Fix 1: the score's fx list with each drop's `sub` replaced by the trial's layers (the `hit` and everything else as they are). */
export function dropLayers(events, o = PRUFA.drop) {
  const out = [];
  for (const e of events) {
    if (e.snd === 'hit') {
      out.push({ ...e, db: (e.db ?? 0) + o.hitDb });
      continue;
    }
    if (e.snd !== 'sub') {
      out.push(e);
      continue;
    }
    const db = e.db ?? 0; // the drop's own level (impact(beat, db) gave the sub db - 1)
    // the deep original as a remnant for big speakers (and nothing under 20 Hz)
    out.push({ ...e, db: db + o.remnantDb, hp: o.remnantHp });
    // the same bass drop pitched up and driven: a body small speakers can play
    out.push({ snd: 'sub', beat: e.beat, db: db + o.upDb, rate: o.upRate, drive: o.upDrive, hp: o.upHp, len: e.len / o.upRate + 0.4 });
    // the bright layer on the one: the reverse crash forwards, and the crowd's claps
    out.push({ snd: 'revCymbal', beat: e.beat, db: db + o.crashDb, reverse: true, len: o.crashLen });
    out.push({ claps: [e.beat], db: db + o.clapsDb, people: o.clapPeople, seed: 500 + Math.round(e.beat) });
  }
  return out;
}

/** A 4th-order Butterworth high-pass, in place, on each channel. */
export function highpass4(chs, hz) {
  for (const ch of chs) for (const f of [new Biquad('hp', hz, 0.5412), new Biquad('hp', hz, 1.3066)]) f.run(ch);
}

/**
 * Fix 3: split-band de-esser on a stereo stem, in place. The top (above splitHz, an exact complement: low = x - top) is turned down
 * by (topDb - allDb - thresholdDb) * (1 - 1/ratio), at most maxDb, where topDb and allDb are fast envelopes of the top and of the
 * whole voice: so it acts on an "s" (a burst of pure top) and not on a bright vowel or a loud line as such.
 */
export function deEss(st, o = PRUFA.deEss) {
  const n = st.L.length;
  const top = { L: Float32Array.from(st.L), R: Float32Array.from(st.R) };
  for (const ch of [top.L, top.R]) for (const f of [new Biquad('hp', o.splitHz, 0.5412), new Biquad('hp', o.splitHz, 1.3066)]) f.run(ch);
  const att = 1 - Math.exp(-1 / ((o.attackMs / 1000) * SR)), rel = 1 - Math.exp(-1 / ((o.releaseMs / 1000) * SR));
  let eT = 0, eA = 0, most = 0, frames = 0;
  const k = 1 - 1 / o.ratio;
  // look-ahead of 1 ms so the gain is down when the s starts
  const la = Math.round(0.001 * SR);
  const gr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.max(Math.abs(top.L[i]), Math.abs(top.R[i])), a = Math.max(Math.abs(st.L[i]), Math.abs(st.R[i]));
    eT += (t - eT) * (t > eT ? att : rel);
    eA += (a - eA) * (a > eA ? att : rel);
    const over = 20 * Math.log10(Math.max(eT, 1e-9) / Math.max(eA, 1e-9)) - o.thresholdDb;
    const g = eT > 1e-5 && over > 0 ? Math.min(o.maxDb, over * k) : 0;
    gr[Math.max(0, i - la)] = Math.max(gr[Math.max(0, i - la)], g);
    if (g > most) most = g;
    if (g > 0.5) frames++;
  }
  for (let i = 0; i < n; i++) {
    const g = 10 ** (-gr[i] / 20) - 1; // x - top + top * gain = x + top * (gain - 1)
    if (g === 0) continue;
    st.L[i] += top.L[i] * g;
    st.R[i] += top.R[i] * g;
  }
  return { mostDb: most, secondsOver05Db: frames / SR };
}
