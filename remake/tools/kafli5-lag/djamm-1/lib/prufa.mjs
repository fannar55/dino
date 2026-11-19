// The trial "prufa 2" (render.mjs --prufa, into qa/remake/kafli5/lag/djamm/2/): the mix review's three fixes, for the owner's ear.
// Without --prufa nothing here runs and the tool makes the shipped set.
//   1. The four drops carry their weight where small speakers play: the bass drop (`sub`) is pitched up and driven (its body at
//      about 50-120 Hz, its harmonics at 150-500 Hz), the deep original stays only as a remnant well under the kick and the bass,
//      and the drop's one gets a bright layer: the reverse crash played forwards (a crash) and a volley of the crowd's real claps;
//      the drop's own crowd is louder for its first bar, and the fx limiter's ceiling is 2 dB higher around the drops so the new
//      layers are not squashed. Only the samples the tool already has; no event moves and no cue changes.
//   2. The animals stem (with her wing flaps) is high-passed at 30 Hz (8th order) before its own limiter, so an 11-16 Hz rumble
//      nobody hears no longer turns the animals down on her wing beats.
//   3. A gentle split-band de-esser on her stem (after her limiter): only the part above 4.5 kHz, and only while it is about as
//      loud as the rest of her voice (an "s"), is turned down, at most PRUFA.deEss.maxDb.
// Her levels and her duck are set against the music as shipped (render.mjs), so they do not move.
import { Biquad } from './dsp.mjs';
import { SR } from './io.mjs';
import { truePeakTrack } from './master.mjs';

export const PRUFA = {
  name: 'prufa-2',
  out: 'qa/remake/kafli5/lag/djamm/2',
  // tuned with qa/remake/kafli5/hljodblanda/prufa/proto.mjs against maeling's drop targets (prufa.md has the runs)
  drop: {
    remnantDb: -12, remnantHp: 30, // the original bass drop 12 dB down, nothing under 30 Hz
    upRate: 2.5, upDrive: 4, upHp: 45, upDb: -1, // pitched up 2.5 times (about 16 semitones), driven, over 45 Hz
    hitDb: 0, hitHp: 30, // the impact as it is, its rumble under 30 Hz off
    crashDb: -2, crashLen: 3, // the reverse crash forwards: a crash on the one
    clapsDb: 6, clapPeople: 16, clapBeats: 1, // one volley of sixteen real claps on the one
    crowdDb: 9, crowdLen: 2.6, // the drop's own crowd 9 dB up for its first bar (a copy in step on top, 2.6 s)
    extra: { 428: [{ snd: 'kidsCheer', at: 0.3, db: -10 }] }, // the last drop's children, as the slam has them
    dropCeilDb: -4, dropCeilBeats: 8, // the fx limiter's ceiling 2 dB higher from half a beat before each drop to 8 beats after
  },
  animalsHp: 30, animalsHpOrder: 8,
  // an "s" (top about as loud as the whole voice) is turned down about 4.5-6 dB on its top; tuned with prufa/desib.mjs
  deEss: { splitHz: 4500, thresholdDb: -12, ratio: 2.5, maxDb: 6, attackMs: 1, releaseMs: 45 },
};

/** Fix 1: the score's fx list with each drop's `sub` replaced by the trial's layers (the `hit` and everything else as they are). */
export function dropLayers(events, o = PRUFA.drop) {
  const out = [];
  const drops = events.filter(e => e.snd === 'sub').map(e => e.beat);
  // the one drop without a children's cheer of its own gets the one the others have (o.extra: { beat: [events] })
  events = [...events, ...Object.entries(o.extra ?? {}).flatMap(([b, list]) => list.map(x => ({ ...x, beat: +b + (x.at ?? 0) })))];
  const onDrop = e => e.snd && /^(cheer|crowd|kids|yay)/.test(e.snd) && drops.some(d => e.beat >= d && e.beat < d + 1);
  for (const e of events) {
    if (o.crowdDb && onDrop(e)) {
      // the drop's own crowd as it is, and a copy of it on top for the drop bar only (in step with it, so the two add up to
      // crowdDb louder and the copy's 50 ms fade-out is just the crowd settling back to its shipped level)
      out.push(e);
      const k = 10 ** (o.crowdDb / 20) - 1;
      out.push({ ...e, db: (e.db ?? 0) + 20 * Math.log10(k), len: Math.min(e.len ?? Infinity, o.crowdLen) });
      continue;
    }
    if (e.snd === 'hit') {
      out.push({ ...e, db: (e.db ?? 0) + o.hitDb, hp: o.hitHp });
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
    out.push({ claps: Array.from({ length: o.clapBeats }, (_, k) => e.beat + k), db: db + o.clapsDb, people: o.clapPeople, seed: 500 + Math.round(e.beat) });
  }
  return out;
}

/**
 * The fx stem's limiter for the trial: the shipped one (true-peak, 4 ms look-ahead, 90 ms release, ceiling -6 dBFS), but with its
 * ceiling at o.dropCeilDb from half a beat before each drop to o.dropCeilBeats after it, so the drop's new layers are not
 * squashed. Outside those windows it is the shipped limiter (its work is local: 4 ms ahead, 90 ms release).
 */
export function limitFx(L, R, drops, o = PRUFA.drop, shippedDb = -6) {
  const n = L.length, spb = 0.48 * SR;
  const ceil = new Float32Array(n).fill(10 ** (shippedDb / 20));
  for (const d of drops) for (let i = Math.max(0, Math.round((d - 0.5) * spb)); i < Math.min(n, Math.round((d + o.dropCeilBeats) * spb)); i++) ceil[i] = 10 ** (o.dropCeilDb / 20);
  const tl = truePeakTrack(L), tr = truePeakTrack(R);
  const gr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(tl[i], tr[i]);
    gr[i] = p > ceil[i] ? ceil[i] / p : 1;
  }
  // the rest exactly as lib/master.mjs limit()
  const La = Math.max(1, Math.round(0.004 * SR));
  const m = new Float32Array(n), dq = new Int32Array(n + La + 1);
  let h = 0, t = 0, next = 0;
  for (let i = 0; i < n; i++) {
    while (next < n && next <= i + La) {
      while (t > h && gr[dq[t - 1]] >= gr[next]) t--;
      dq[t++] = next++;
    }
    while (dq[h] < i) h++;
    m[i] = gr[dq[h]];
  }
  const g = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += m[i];
    if (i - La - 1 >= 0) acc -= m[i - La - 1];
    g[i] = acc / Math.min(i + 1, La + 1);
  }
  const a = 1 - Math.exp(-1 / (0.09 * SR));
  let y = 1, most = 1;
  for (let i = 0; i < n; i++) {
    y = Math.min(g[i], y + (1 - y) * a);
    if (y < most) most = y;
    L[i] *= y;
    R[i] *= y;
  }
  return { most };
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
  // the top split off with no phase shift (a Butterworth high-pass run forwards and then backwards), so x - top + top * gain is
  // x itself where nothing is turned down and never louder than x anywhere (a one-way filter's phase made the first try brighter)
  const top = { L: Float32Array.from(st.L), R: Float32Array.from(st.R) };
  for (const ch of [top.L, top.R]) {
    new Biquad('hp', o.splitHz, Math.SQRT1_2).run(ch);
    ch.reverse();
    new Biquad('hp', o.splitHz, Math.SQRT1_2).run(ch);
    ch.reverse();
  }
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
