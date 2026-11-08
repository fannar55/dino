// smidur-d: "Skrúðganga dýranna", a cheeky cartoon parade march of the forest animals, for the end of chapter 5.
// `node remake/tools/kafli5-lag/smidur-d/render.mjs` writes the song from scratch into qa/remake/kafli5/lag/keppni/smidur-d/:
// mix.mp3 (mastered), stems/*.mp3 (pre-master, they sum to the mix before its master), song.json (sections, cues, chorus notes,
// the loop), checks.json (pitch and beat checks of every chorus note and call), spectrogram.png and waveform.png.
//
// Written as the music video's shots, unit by unit (see UNITS): the forest wakes, the band pops in, the parade (the loop), each
// group's "here I come!" turn low to high with choruses between, the tiptoe ("engines off"), her horn, the riser, the drop (the
// chorus bigger), and the walk home with its comic tag and one last F. One tempo (125 bpm: a beat is exactly 21168 samples, so every
// 16th, 32nd and sixteenth-triplet is a whole sample), F major, equal temperament, A4 = 440.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as D from './dsp.mjs';
import * as I from './instruments.mjs';

const { SR, hz, hash } = D;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const OUT = join(ROOT, 'qa/remake/kafli5/lag/keppni/smidur-d');
const HLJOD = join(ROOT, 'remake/assets/audio/kafli5/hljod');
const REL_HLJOD = 'remake/assets/audio/kafli5/hljod';

export const BPM = 125;
export const SPB = (SR * 60) / BPM; // 21168
export const BEATS = 276; // 68 bars of music (272 beats) and the last hit's ring
const LEN = BEATS * SPB;
const SEC = beats => (beats * 60) / BPM;
const WET = 2.4; // the reverb's return (Freeverb's wet scale)
const STEMS = ['pad', 'bass', 'beat', 'lead', 'animals'];

// ---------------------------------------------------------------- the key
const TONE = { grazers: 65, turtles: 67, frogs: 69, lizards: 72, flyers: 74 }; // F4 G4 A4 C5 D5 (MIDI)
const GROUP_PAN = { grazers: -0.38, turtles: -0.19, frogs: 0, lizards: 0.19, flyers: 0.38 };
const PAD = {
  F: [53, 57, 60, 65], Bb: [53, 58, 62, 65], C7: [55, 58, 60, 64], C: [55, 60, 64, 67], Dm: [53, 57, 62, 65], Gm: [55, 58, 62, 67],
};
const PAH = { F: [57, 60, 65], Bb: [58, 62, 65], C7: [58, 60, 64], C: [55, 60, 64], Dm: [57, 62, 65], Gm: [58, 62, 67] };
const ROOT5 = { F: [41, 36], Bb: [34, 41], C7: [36, 43], C: [36, 43], Dm: [38, 45], Gm: [43, 38] };
/** Her song, as this march sings it: [beat in the chorus, group, beats]. sol mi / re mi do / la sol mi sol / la sol mi re do. */
const CHORUS = [
  [0, 'lizards', 2], [2, 'frogs', 2],
  [8, 'turtles', 1], [9, 'frogs', 1], [10, 'grazers', 2],
  [16, 'flyers', 1], [17, 'lizards', 1], [18, 'frogs', 1], [19, 'lizards', 1],
  [24, 'flyers', 1], [25, 'lizards', 1], [26, 'frogs', 1], [27, 'turtles', 1], [28, 'grazers', 3],
];
const CHORUS_CHART = [[0, 'F', 4], [4, 'F', 2], [6, 'C7', 2], [8, 'C7', 2], [10, 'F', 2], [12, 'F', 4], [16, 'Bb', 2], [18, 'F', 2], [20, 'Gm', 2],
  [22, 'C7', 2], [24, 'Bb', 2], [26, 'F', 1], [27, 'C7', 1], [28, 'F', 4]];
const CHORUS_TAKE = { grazers: 'grazers-3.mp3', turtles: 'turtles-2.mp3', frogs: 'frogs-1.mp3', lizards: 'lizards-2.mp3', flyers: 'flyers-1.mp3' };
const HORN_TAKE = 'horn-1.mp3';

// ---------------------------------------------------------------- the brightness arc (Hz of the band's lowpass, by beat)
const ARC = [[0, 1100], [12, 6000], [32, 6000], [34, 6500], [64, 6500], [65, 7200], [96, 7200], [97, 6800], [144, 7000], [145, 7800], [176, 7800],
  [177, 2100], [192, 2400], [208, 3400], [224, 9500], [256, 9500], [266, 4800], [268, 6000], [270, 9000], [BEATS, 9000]];
function arcAt(beat) {
  for (let k = 1; k < ARC.length; k++) {
    const [b1, f1] = ARC[k];
    const [b0, f0] = ARC[k - 1];
    if (beat <= b1) return f0 * (f1 / f0) ** ((beat - b0) / (b1 - b0 || 1));
  }
  return ARC[ARC.length - 1][1];
}

// ---------------------------------------------------------------- the recordings
const SOUNDS = JSON.parse(readFileSync(join(HLJOD, 'sounds.json'), 'utf8')).files;
const takeCache = new Map();
/** A recording on `midi`'s pitch class in the octave nearest its own (my own YIN median sets the rate), RMS-levelled, with its onset. */
function tuned(file, midi, { exact = false, even = false } = {}) {
  const key = `${file}:${midi}:${exact}:${even}`;
  if (takeCache.has(key)) return takeCache.get(key);
  const raw = D.decode(join(HLJOD, file));
  const own = D.pitchOf(raw, 50, 3500).hz;
  const target = hz(midi);
  const rate = !own ? 1 : exact ? target / own : (target * 2 ** Math.round(Math.log2(own / target))) / own;
  const x = D.resample(raw, rate);
  if (even) evenOut(x);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  let sum = 0;
  let count = 0;
  for (const v of x) if (Math.abs(v) > peak * 0.05) { sum += v * v; count++; }
  const rms = Math.sqrt(sum / Math.max(1, count));
  const level = Math.min(0.15 / rms, 0.85 / peak);
  for (let i = 0; i < x.length; i++) x[i] *= level;
  const after = D.pitchOf(x, 50, 3500);
  const t = { file, x, rate, own, listed: SOUNDS[file]?.hz ?? null, onset: D.onsetOf(x), hzAfter: after.hz, cents: after.hz ? D.centsOff(after.hz, target) : null,
    spread: after.hz ? 1200 * Math.log2(after.q3 / after.q1) : null };
  takeCache.set(key, t);
  return t;
}
/** Her horn's take swells and sags; past its first 0.3 s, pull a 60 ms envelope most of the way to its median so a held note holds. */
function evenOut(x) {
  const w = Math.round(0.06 * SR);
  const env = new Float32Array(x.length);
  let acc = 0;
  for (let i = 0; i < x.length; i++) {
    acc += x[i] * x[i] - (i >= w ? x[i - w] * x[i - w] : 0);
    env[i] = Math.sqrt(Math.max(acc, 0) / w);
  }
  const centred = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) centred[i] = env[Math.min(x.length - 1, i + (w >> 1))];
  const start = Math.round(0.3 * SR);
  const body = [...centred.slice(start, x.length - w)].sort((a, b) => a - b);
  const median = body[body.length >> 1] || 1;
  for (let i = start; i < x.length; i++) {
    const g = Math.min(2.2, Math.max(0.45, (median / (centred[i] + 1e-9)) ** 0.7));
    const blend = Math.min(1, (i - start) / (0.1 * SR));
    x[i] *= 1 + (g - 1) * blend;
  }
}

// ---------------------------------------------------------------- the song being written
class Song {
  constructor() {
    this.stems = Object.fromEntries(STEMS.map(s => [s, { dry: [new Float32Array(LEN), new Float32Array(LEN)], send: new Float32Array(LEN) }]));
    this.cues = [];
    this.melody = [];
    this.checks = { chorus: [], calls: [], horn: [] };
    this.padSegs = [];
    this.used = new Set();
  }
  at(beat) {
    const s = beat * SPB;
    const r = Math.round(s);
    if (Math.abs(s - r) > 1e-6) throw new Error(`beat ${beat} is not on a whole sample`);
    return r;
  }
  put(stem, x, beat, { gain = 1, pan = 0, send = 0.15, offset = 0, from = 0 } = {}) {
    const start = this.at(beat) - offset;
    const th = ((pan + 1) * Math.PI) / 4;
    const gl = Math.cos(th) * Math.SQRT2 * gain;
    const gr = Math.sin(th) * Math.SQRT2 * gain;
    const { dry, send: sd } = this.stems[stem];
    for (let i = from; i < x.length; i++) {
      const j = start + i;
      if (j < 0) continue;
      if (j >= LEN) break;
      const v = x[i];
      dry[0][j] += v * gl;
      dry[1][j] += v * gr;
      sd[j] += v * gain * send;
    }
  }
  cue(beat, kind, extra = {}) { this.cues.push({ beat, kind, ...extra }); }

  // --- the band (b = beat, n = beats long, m = MIDI, v = velocity)
  tuba(b, n, m, v = 0.8, { stem = 'bass', legato = 0.78, gain = 0.4, pan = 0, send = 0.07 } = {}) {
    this.put(stem, I.tuba(hz(m), SEC(n) * legato, v, hash('tuba', m, b % 16)), b, { gain, pan, send });
  }
  bassoon(b, n, m, v = 0.75, { stem = 'lead', legato = 0.85, gain = 0.34, pan = -0.08, send = 0.12 } = {}) {
    this.put(stem, I.bassoon(hz(m), SEC(n) * legato, v, hash('bn', m, b % 16)), b, { gain, pan, send });
  }
  clar(b, n, m, v = 0.7, { stem = 'lead', legato = 0.88, gain = 0.26, pan = -0.24, send = 0.16 } = {}) {
    this.put(stem, I.clarinet(hz(m), SEC(n) * legato, v, hash('cl', m, b % 16)), b, { gain, pan, send });
  }
  picc(b, n, m, v = 0.6, { stem = 'lead', legato = 0.85, gain = 0.13, pan = 0.3, send = 0.2 } = {}) {
    this.put(stem, I.piccolo(hz(m), SEC(n) * legato, v, hash('pc', m, b % 16)), b, { gain, pan, send });
  }
  tpt(b, n, m, v = 0.7, { stem = 'lead', legato = 0.86, gain = 0.2, pan = 0.14, send = 0.14, check = null } = {}) {
    const x = I.trumpet(hz(m), SEC(n) * legato, v, hash('tp', m, b % 16));
    if (check) {
      const p = D.pitchOf(x, hz(m) / 1.4, hz(m) * 1.4);
      this.checks.chorus.push({ ...check, beat: b, instrument: 'trumpet', midi: m, targetHz: +hz(m).toFixed(2), measuredHz: +p.hz.toFixed(2),
        cents: +D.centsOff(p.hz, hz(m)).toFixed(1), startSample: this.at(b) });
    }
    this.put(stem, x, b, { gain, pan, send });
  }
  stab(b, chord, v = 0.75, n = 0.5) { for (const m of PAH[chord]) this.tpt(b, n, m + 12, v, { legato: 0.6, gain: 0.11 }); }
  glk(b, m, v = 0.5, { gain = 0.13, pan = -0.32, send = 0.28, t60 = 1.3 } = {}) { this.put('lead', I.glock(hz(m), v, { t60 }), b, { gain, pan, send }); }
  pz(b, m, v = 0.5, { stem = 'pad', t60 = 0.45, gain = 0.2, pan = 0, send = 0.2, bright = 0.5 } = {}) {
    this.put(stem, I.pizz(hz(m), v, { t60, bright, seed: hash('pz', m, b % 16) }), b, { gain, pan, send });
  }
  pahChord(b, chord, v = 0.7, { gain = 0.09, n = 0.36 } = {}) {
    for (const [k, m] of PAH[chord].entries()) this.put('bass', I.pah(hz(m), SEC(n), v, hash('pah', m, b % 16)), b, { gain, pan: (k - 1) * 0.25, send: 0.12 });
  }
  /** One bar of oompah: tuba on 1 and 3 (root, fifth), the pah horns on 2 and 4. */
  oompah(b, chord, { v = 0.8, vp = 0.7, tuba = [0, 2], pah = [1, 3] } = {}) {
    const [r, f] = ROOT5[chord];
    tuba.forEach((t, k) => this.tuba(b + t, 1, k % 2 ? f : r, v));
    pah.forEach(t => this.pahChord(b + t, chord, vp));
  }
  chord(b, n, name, opts = {}) { this.padSegs.push({ b, n, notes: opts.notes ?? PAD[name], ...opts }); }

  // --- the drums
  bd(b, v = 0.7) { this.put('beat', I.bassDrum(v, hash('bd', Math.round(b * 48) % 768)), b, { gain: 0.55, send: 0.05 }); }
  sn(b, v = 0.6, life = 0.17) { this.put('beat', I.snare(v, hash('sn', Math.round(b * 48) % 768), { life }), b, { gain: 0.3, pan: 0.06, send: 0.1 }); }
  rimTap(b, v = 0.4) { this.put('beat', I.rim(v, hash('rim', Math.round(b * 48) % 768)), b, { gain: 0.26, pan: 0.1, send: 0.12 }); }
  cym(b, v = 0.3, t60 = 1.1) { this.put('beat', I.cymbal(v, hash('cy', Math.round(b * 48) % 768), { t60 }), b, { gain: 0.11, pan: -0.12, send: 0.12 }); }
  /** One bar of march drums. */
  march(b, { v = 0.75, ghosts = true, bdAll = false, cymOn = [], ruff = false, snOn = [1, 3] } = {}) {
    this.bd(b, v);
    this.bd(b + 2, v * 0.82);
    if (bdAll) { this.bd(b + 1, v * 0.6); this.bd(b + 3, v * 0.6); }
    snOn.forEach(t => this.sn(b + t, v * 0.8));
    if (ghosts) [0.5, 1.5, 2.5].forEach(t => this.sn(b + t, v * 0.22, 0.1));
    if (ruff) { this.sn(b + 3.5, v * 0.38, 0.1); this.sn(b + 3.75, v * 0.52, 0.1); }
    else if (ghosts) this.sn(b + 3.5, v * 0.22, 0.1);
    cymOn.forEach(t => this.cym(b + t, v * 0.32, 0.35));
  }

  // --- the animals and her horn
  /** `group` sings its call on its tone, its onset exactly on beat b; cut to n beats (and faded) when n is given. */
  call(group, b, { take, n = null, gain = 1, send = 0.16, chorus = null } = {}) {
    take ??= CHORUS_TAKE[group];
    const t = tuned(take, TONE[group]);
    this.used.add(take);
    let x = t.x;
    if (n != null) {
      const keep = Math.min(x.length, t.onset + Math.round(SEC(n) * SR));
      const fade = Math.min(Math.round(0.07 * SR), keep);
      x = x.slice(0, keep);
      for (let i = 0; i < fade; i++) x[keep - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    }
    this.put('animals', x, b, { gain, pan: GROUP_PAN[group], send, offset: t.onset });
    this.cue(b, 'call', { group, take });
    this.checks.calls.push({ beat: b, group, take, rate: +t.rate.toFixed(4), ownHz: t.own && +t.own.toFixed(1), listedHz: t.listed, toneHz: +hz(TONE[group]).toFixed(2),
      hzAfter: t.hzAfter && +t.hzAfter.toFixed(1), cents: t.cents == null ? null : +t.cents.toFixed(1), spreadCents: t.spread == null ? null : Math.round(t.spread),
      onsetSample: this.at(b), chorus });
  }
  /** Her horn (the recorded alphorn-like pipe) on `group`'s tone an octave down, n beats, onset on the beat. */
  horn(b, n, group, { gain = 0.55, send = 0.3 } = {}) {
    // all five in the octave around mi, as the game sets her horn (setRate): F3 G3 A3 C4 D4, so do stays the lowest
    const t = tuned(HORN_TAKE, TONE[group] - 12, { exact: true, even: true });
    this.used.add(HORN_TAKE);
    const keep = Math.min(t.x.length, t.onset + Math.round(SEC(n) * SR));
    const x = t.x.slice(0, keep);
    const fade = Math.round(0.14 * SR);
    for (let i = 0; i < fade; i++) x[keep - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    this.put('lead', x, b, { gain, pan: 0, send, offset: t.onset });
    this.cue(b, 'horn', { group });
    this.checks.horn.push({ beat: b, group, toneHz: +(hz(TONE[group]) / 2).toFixed(2), hzAfter: +t.hzAfter.toFixed(1), cents: +t.cents.toFixed(1), beats: n });
  }

  /** The pad: strings on the chord chart, a voice held over the bar line when it keeps its note, re-bowed at the loop's edges. */
  renderPad() {
    const breaks = new Set([12, 16, 28, 32]);
    const segs = this.padSegs.sort((a, b) => a.b - b.b);
    const voices = [];
    for (const s of segs) {
      s.notes.forEach((m, k) => {
        const open = voices.find(v => v.k === k && v.m === m && Math.abs(v.b + v.n - s.b) < 1e-9 && !breaks.has(s.b) && !s.retrig && v.tie !== false && s.tie !== false);
        if (open) open.n += s.n;
        else voices.push({ k, m, b: s.b, n: s.n, v: s.v ?? 0.5, attack: s.attack ?? 0.35, release: s.release ?? 0.7, tie: s.tie });
      });
    }
    for (const v of voices) {
      const x = I.strings(hz(v.m), SEC(v.n), v.v, { attack: v.attack, release: v.release, cut: 5000, seed: hash('str', v.m, v.b % 16) });
      this.put('pad', x, v.b, { gain: 0.2, pan: (v.k - 1.5) * 0.22, send: 0.22 });
    }
  }
}

// ---------------------------------------------------------------- the units (the music video's shots)
const S = new Song();
const bar = n => (n - 1) * 4;

/** Bar 4 and bar 8, the same bar: the C7 turnaround the band pops in on (and the loop turns on). */
function turnaround(b) {
  S.chord(b, 4, 'C7', { v: 0.5, retrig: true });
  S.tuba(b, 1, 36, 0.82);
  S.tuba(b + 2, 1, 40, 0.75);
  S.tuba(b + 3, 0.5, 43, 0.72);
  S.tuba(b + 3.5, 0.5, 40, 0.72);
  S.pahChord(b + 1, 'C7');
  S.bd(b, 0.7);
  S.bd(b + 2, 0.6);
  S.sn(b + 1, 0.55);
  [2, 2.25, 2.5, 2.75, 3, 3.25, 3.5].forEach((t, i) => S.sn(b + t, 0.28 + i * 0.07, 0.12));
  [[0, 79], [0.5, 77], [1, 76], [1.5, 74]].forEach(([t, m]) => { S.clar(b + t, 0.5, m, 0.62); S.picc(b + t, 0.5, m + 12, 0.42, { gain: 0.08 }); });
  S.clar(b + 2, 1, 72, 0.66);
  S.picc(b + 2, 1, 84, 0.42, { gain: 0.08 });
  [3, 3.5].forEach(t => { S.tpt(b + t, 0.5, 70, 0.72, { legato: 0.5, gain: 0.13 }); S.tpt(b + t, 0.5, 76, 0.72, { legato: 0.5, gain: 0.13 }); });
}

/** Bar 4 of a turn: stop time. The band's hit, silence, the animal alone ("here I come!"), a snare pickup into the next. */
function stopBar(b, chord, group, calls, pickup) {
  const [r] = ROOT5[chord];
  S.chord(b, 4, chord, { v: 0.36 });
  S.tuba(b, 0.5, r, 0.92, { legato: 0.9 });
  S.pahChord(b, chord, 0.85, { n: 0.45 });
  S.stab(b, chord, 0.8);
  S.bd(b, 0.8);
  S.sn(b, 0.5);
  S.cym(b, 0.28, 0.7);
  S.cue(b, 'hit');
  calls.forEach(([t, take, n]) => S.call(group, b + t, { take, n, gain: 1.1 }));
  [3, 3.25, 3.5, 3.75].forEach((t, i) => S.sn(b + t, 0.3 + 0.1 * i, 0.12));
  pickup?.(b);
}

const UNITS = [];
function unit(meta, play) { UNITS.push(meta); play(meta.startBeat); }

unit({ name: 'Intro: the forest wakes', nameIs: 'Skógurinn vaknar', startBeat: 0, beats: 16, feature: null,
  what: 'The pad alone and muffled, opening; glockenspiel twinkles; a frog, a curlew and a yawning grazer wake up; pizzicato tiptoes in, rim taps and a soft bass-drum heartbeat; on bar 4 the whole band pops in on a C7 turnaround.' }, b => {
  S.chord(b, 12, 'F', { v: 0.55, attack: 1.6 });
  [[1, 84], [2, 81], [3, 89]].forEach(([t, m]) => S.glk(b + t, m, 0.42));
  [[4, 84], [4.5, 86], [5, 89], [6, 84], [7, 81]].forEach(([t, m]) => S.glk(b + t, m, 0.45));
  [77, 81, 84, 89, 84, 81, 77, 81].forEach((m, i) => S.glk(b + 8 + i * 0.5, m, 0.35 + 0.02 * i));
  S.call('frogs', b + 3, { take: 'frogs-1.mp3', gain: 0.5 });
  S.call('flyers', b + 7, { take: 'flyers-3.mp3', gain: 0.5 });
  S.call('grazers', b + 9, { take: 'grazers-3.mp3', n: 2.4, gain: 0.55 });
  const arp = [53, 57, 60, 65, 69, 65, 60, 57];
  [4, 8].forEach((s, k) => arp.forEach((m, i) => S.pz(b + s + i * 0.5, m, 0.38 + 0.12 * k + 0.02 * i, { gain: 0.17 })));
  for (let i = 0; i < 8; i++) S.rimTap(b + 8 + i * 0.5, 0.18 + i * 0.045);
  S.bd(b + 8, 0.3);
  S.bd(b + 10, 0.36);
  S.cue(b + 12, 'hit', { what: 'the band pops in' });
  turnaround(b + 12);
});

unit({ name: 'The parade marches in (the loop)', nameIs: 'Skrúðgangan kemur', startBeat: 16, beats: 16, feature: 'all',
  what: 'The band marches in: oompah tuba and pah horns, march drums, the clarinet-and-piccolo parade tune over F Bb F C7. Beats 16-31 are the seamless loop (bar 4 is the same bar as bar 8).' }, b => {
  ['F', 'Bb', 'F'].forEach((ch, k) => {
    S.chord(b + 4 * k, 4, ch, { v: 0.5 });
    S.oompah(b + 4 * k, ch);
    S.march(b + 4 * k, { v: 0.72 });
  });
  S.cym(b, 0.3, 1.0);
  const theme = [[0, 72, 1], [1, 69, 0.5], [1.5, 72, 0.5], [2, 77, 1], [3, 72, 1], [4, 74, 1], [5, 70, 0.5], [5.5, 74, 0.5], [6, 77, 2],
    [8, 72, 1], [9, 69, 0.5], [9.5, 72, 0.5], [10, 77, 0.5], [10.5, 79, 0.5], [11, 81, 1]];
  theme.forEach(([t, m, n]) => { S.clar(b + t, n, m, 0.66); S.picc(b + t, n, m + 12, 0.42, { gain: 0.08 }); });
  turnaround(b + 12);
});

unit({ name: 'The grazers step in', nameIs: 'Grasbítarnir', startBeat: 32, beats: 16, feature: 'grazers',
  what: 'The tuba steps forward ("BWAMP, pa-pa POM"), the bassoon on its shoulder; the grazers moo on F on beats 1 and 3; the tuba tumbles down; stop time: the band hits, the big grazer moos alone, a snare pickup.' }, b => {
  S.chord(b, 8, 'F', { v: 0.45 });
  S.chord(b + 8, 4, 'Bb', { v: 0.45 });
  [[0, 41, 1, 0.95], [2, 45, 0.5, 0.8], [2.5, 48, 0.5, 0.8], [3, 53, 0.5, 0.85]].forEach(([t, m, n, v]) => {
    S.tuba(b + t, n, m, v, { stem: 'lead', gain: 0.46, legato: 0.82 });
    S.bassoon(b + t, n, m + 12, v * 0.85);
  });
  S.pahChord(b + 1, 'F');
  S.pahChord(b + 3, 'F');
  S.march(b, { v: 0.6, ghosts: false });
  S.call('grazers', b + 4, { take: 'grazers-3.mp3', n: 2 });
  S.call('grazers', b + 6, { take: 'grazers-2.mp3', n: 2 });
  S.oompah(b + 4, 'F', { v: 0.7 });
  S.bassoon(b + 5.5, 0.5, 48, 0.6, { legato: 0.6 });
  S.bassoon(b + 7.5, 0.5, 53, 0.6, { legato: 0.6 });
  S.march(b + 4, { v: 0.6, ghosts: false });
  [[0, 53], [1, 50], [2, 46], [3, 41]].forEach(([t, m], i) => {
    S.tuba(b + 8 + t, 1, m, 0.8 + 0.04 * i, { stem: 'lead', gain: 0.46, legato: 0.7 });
    S.bassoon(b + 8 + t, 1, m + 12, 0.7, { legato: 0.7 });
  });
  S.pahChord(b + 9, 'Bb');
  S.pahChord(b + 11, 'Bb');
  S.march(b + 8, { v: 0.62, ghosts: false, ruff: true });
  stopBar(b + 12, 'F', 'grazers', [[1, 'grazers-3.mp3', 2]], s => { S.bassoon(s + 3, 0.5, 43, 0.7, { legato: 0.7 }); S.bassoon(s + 3.5, 0.5, 46, 0.75, { legato: 0.7 }); });
});

unit({ name: 'The turtles plod in', nameIs: 'Skjaldbökurnar', startBeat: 48, beats: 16, feature: 'turtles',
  what: 'A lazy bassoon solo (C-E-G, taa-daa), the turtles sing G on beats 1 and 3, the bassoon plods down; stop time: hit, the turtle alone, a trumpet pickup into the chorus.' }, b => {
  [['C7', 0], ['C', 4], ['Gm', 8]].forEach(([ch, t]) => S.chord(b + t, 4, ch, { v: 0.45 }));
  [[0, 48, 1], [1, 52, 1], [2, 55, 2]].forEach(([t, m, n]) => S.bassoon(b + t, n, m, 0.8, { legato: 0.92, gain: 0.38 }));
  S.oompah(b, 'C7', { v: 0.55, vp: 0.55 });
  S.march(b, { v: 0.5, ghosts: false });
  S.call('turtles', b + 4, { take: 'turtles-2.mp3', n: 2 });
  S.call('turtles', b + 6, { take: 'turtles-1.mp3', n: 2 });
  S.oompah(b + 4, 'C', { v: 0.6 });
  S.march(b + 4, { v: 0.5, ghosts: false });
  [[0, 55], [1, 53], [2, 50], [3, 46]].forEach(([t, m]) => S.bassoon(b + 8 + t, 1, m, 0.78, { legato: 0.75, gain: 0.38 }));
  S.oompah(b + 8, 'Gm', { v: 0.55, vp: 0.55 });
  S.march(b + 8, { v: 0.52, ghosts: false, ruff: true });
  stopBar(b + 12, 'C7', 'turtles', [[1, 'turtles-2.mp3', 2]], s => { S.tpt(s + 3, 0.5, 69, 0.7, { legato: 0.7 }); S.tpt(s + 3.5, 0.5, 70, 0.75, { legato: 0.7 }); });
});

/** A chorus: her 14 notes, each by its animal with a trumpet on it; the band answers in the gaps. Level 1, 2 or 3 (the drop). */
function chorus(b, level) {
  const vPad = [0.5, 0.56, 0.66][level - 1];
  for (const [t, ch, n] of CHORUS_CHART) {
    S.chord(b + t, n, ch, { v: vPad });
    if (level === 3) S.chord(b + t, n, ch, { v: vPad * 0.6, notes: PAD[ch].slice(1).map(m => m + 12) });
  }
  // oompah: the tuba on each chord's root (and its fifth on 3 when the chord holds), the pah on 2 and 4
  for (const [t, ch, n] of CHORUS_CHART) {
    const [r, f] = ROOT5[ch];
    if (t === 12) { S.tuba(b + 12, 1, 41, 0.85); S.tuba(b + 14, 1, 43, 0.82); S.tuba(b + 15, 1, 45, 0.84); continue; }
    S.tuba(b + t, 1, r, level === 3 ? 0.92 : 0.82);
    if (n === 4) S.tuba(b + t + 2, 1, f, 0.78);
    if (level === 3) S.bassoon(b + t, 1, r + 12, 0.6, { stem: 'bass', legato: 0.7, gain: 0.22 });
  }
  const chordAt = t => [...CHORUS_CHART].reverse().find(([s]) => s <= t)[1];
  for (let t = 1; t < 32; t += 2) S.pahChord(b + t, chordAt(t), level === 3 ? 0.8 : 0.7);
  // drums
  for (let k = 0; k < 8; k++) {
    S.march(b + 4 * k, { v: [0.7, 0.76, 0.84][level - 1], ghosts: true, bdAll: level === 3, ruff: level >= 2 && k % 2 === 1, cymOn: level === 3 ? [1, 3] : [] });
  }
  S.cym(b, [0.3, 0.36, 0.44][level - 1], level === 3 ? 1.5 : 1.1);
  S.cym(b + 16, 0.3, 1.0);
  // her song: each note its animal, a trumpet (and more as it grows) on it
  CHORUS.forEach(([t, g, n], k) => {
    const m = TONE[g];
    const tag = { chorus: level, note: k + 1, group: g };
    S.call(g, b + t, { n: n + 0.3, gain: 1, chorus: tag });
    S.melody.push({ group: g, beat: b + t });
    S.tpt(b + t, n, m, 0.74, { legato: n > 1 ? 0.94 : 0.9, gain: level === 3 ? 0.22 : 0.21, check: tag });
    if (level >= 2) S.clar(b + t, n, level === 3 ? m + 12 : m, 0.6, { legato: 0.9, gain: level === 3 ? 0.16 : 0.13 });
    if (level === 3 || n >= 2) S.glk(b + t, m + 24, level === 3 ? 0.5 : 0.42, { gain: 0.11 });
    if (level === 3) S.horn(b + t, n, g, { gain: 0.46 });
  });
  // the band's answers in the gaps
  const ansA = [[5, 77], [5.5, 76], [6, 79], [6.5, 76], [7, 72]];
  const ansB = [[12, 77], [12.5, 72], [13, 69], [13.5, 72]];
  const ansC = [[20.5, 67], [21, 70], [21.5, 74], [22, 76, 1], [23, 72]];
  for (const [t, m, n = 0.5] of ansA) {
    S.clar(b + t, n, m, 0.62, { legato: 0.6 });
    if (level >= 2) S.picc(b + t, n, m + 12, 0.45, { legato: 0.6, gain: 0.09 });
    if (level === 3) S.tpt(b + t, n, m, 0.6, { legato: 0.6, gain: 0.1 });
  }
  for (const [t, m] of ansB) { S.glk(b + t, m + 12, 0.45); S.clar(b + t, 0.5, m, 0.55, { legato: 0.6, gain: 0.2 }); }
  S.clar(b + 14, 1, 77, 0.6, { legato: 0.8, gain: 0.2 });
  for (const [t, m, n = 0.5] of ansC) {
    S.tpt(b + t, n, m, 0.68, { legato: 0.6, gain: 0.15 });
    if (level >= 2) S.clar(b + t, n, m + 12, 0.5, { legato: 0.6, gain: 0.12 });
    if (level === 3) S.picc(b + t, n, m + 12, 0.45, { legato: 0.6, gain: 0.09 });
  }
  if (level === 3) {
    // the drop's piccolo descant over the long notes: a high line of its own
    [[0, 89, 2], [2, 88, 2], [8, 86, 2], [10, 84, 2], [16, 86, 2], [18, 84, 2], [24, 86, 2], [26, 84, 2], [28, 89, 3]].forEach(([t, m, n]) =>
      S.picc(b + t, n, m, 0.4, { gain: 0.07, legato: 0.92 }));
  }
  if (level < 3) { S.tpt(b + 30.5, 0.5, 72, 0.72, { legato: 0.6, gain: 0.16 }); S.tpt(b + 31, 0.5, 77, 0.8, { legato: 0.6, gain: 0.17 }); S.sn(b + 31, 0.6); }
}

unit({ name: 'Chorus 1: everyone sings her song', nameIs: 'Viðlag 1', startBeat: 64, beats: 32, feature: 'all',
  what: 'Her 14 notes (sol mi / re mi do / la sol mi sol / la sol mi re do), each sung by its animal with a trumpet on it; clarinet and glockenspiel answer in the gaps; oompah and march drums.' }, b => {
  S.cue(b, 'hit', { what: 'chorus' });
  chorus(b, 1);
});

unit({ name: 'The frogs hop in', nameIs: 'Froskarnir', startBeat: 96, beats: 16, feature: 'frogs',
  what: 'A hopping staccato clarinet (A-C-A-F-A, boing!), the frogs ribbit on A on beats 1, 2 and 3, the clarinet hops down; stop time: hit, two frogs alone, a trumpet pickup.' }, b => {
  [['F', 0], ['Dm', 4], ['Bb', 8]].forEach(([ch, t]) => S.chord(b + t, 4, ch, { v: 0.45 }));
  [[0, 69, 0.5], [0.5, 72, 0.5], [1, 69, 0.5], [1.5, 65, 0.5], [2, 69, 1], [3, 81, 0.5]].forEach(([t, m, n]) =>
    S.clar(b + t, n, m, 0.72, { legato: n < 1 ? 0.55 : 0.85, gain: 0.3 }));
  S.oompah(b, 'F');
  S.march(b, { v: 0.66 });
  S.call('frogs', b + 4, { take: 'frogs-5.mp3', n: 1 });
  S.call('frogs', b + 5, { take: 'frogs-5.mp3', n: 1 });
  S.call('frogs', b + 6, { take: 'frogs-1.mp3', n: 2 });
  S.clar(b + 7.5, 0.5, 69, 0.6, { legato: 0.5, gain: 0.26 });
  S.oompah(b + 4, 'Dm');
  S.march(b + 4, { v: 0.66 });
  [[0, 74], [0.5, 72], [1, 69], [1.5, 65], [2, 62], [2.5, 65]].forEach(([t, m]) => S.clar(b + 8 + t, 0.5, m, 0.7, { legato: 0.55, gain: 0.3 }));
  S.clar(b + 11, 1, 69, 0.7, { legato: 0.8, gain: 0.3 });
  S.call('frogs', b + 11, { take: 'frogs-2.mp3', n: 1, gain: 0.7 });
  S.oompah(b + 8, 'Bb');
  S.march(b + 8, { v: 0.68, ruff: true });
  stopBar(b + 12, 'F', 'frogs', [[1, 'frogs-5.mp3', 1], [2, 'frogs-1.mp3', 1]], s => { S.tpt(s + 3, 0.5, 65, 0.7, { legato: 0.7 }); S.tpt(s + 3.5, 0.5, 69, 0.75, { legato: 0.7 }); });
});

unit({ name: 'The small lizards scurry in', nameIs: 'Smáeðlurnar', startBeat: 112, beats: 16, feature: 'lizards',
  what: 'Quick staccato trumpets (ta-ta-ta TAA), the lizards chirp on C (one, two, three-and), the trumpets skip about; stop time: hit, two lizards alone, a piccolo pickup.' }, b => {
  [['F', 0], ['C', 4], ['F', 8]].forEach(([ch, t]) => S.chord(b + t, 4, ch, { v: 0.45 }));
  [[0, 72, 0.5], [0.5, 72, 0.5], [1, 72, 0.5], [2, 77, 1], [3, 72, 0.5], [3.5, 69, 0.5]].forEach(([t, m, n]) =>
    S.tpt(b + t, n, m, 0.78, { legato: n < 1 ? 0.5 : 0.85, gain: 0.22 }));
  S.oompah(b, 'F');
  S.march(b, { v: 0.7 });
  [[4, 1], [5, 1], [6, 0.5], [6.5, 1.5]].forEach(([t, n]) => S.call('lizards', b + t, { take: 'lizards-2.mp3', n }));
  S.oompah(b + 4, 'C');
  S.march(b + 4, { v: 0.7 });
  [[0, 69], [0.5, 72], [1, 77], [1.5, 79], [2, 77], [2.5, 72]].forEach(([t, m]) => S.tpt(b + 8 + t, 0.5, m, 0.75, { legato: 0.5, gain: 0.22 }));
  S.tpt(b + 11, 1, 69, 0.75, { legato: 0.8, gain: 0.22 });
  S.oompah(b + 8, 'F');
  S.march(b + 8, { v: 0.7, ruff: true });
  stopBar(b + 12, 'C7', 'lizards', [[1, 'lizards-2.mp3', 1], [2, 'lizards-1.mp3', 1]], s => { S.picc(s + 3, 0.5, 81, 0.6, { legato: 0.7 }); S.picc(s + 3.5, 0.5, 84, 0.65, { legato: 0.7 }); });
});

unit({ name: 'The small flyers flutter in', nameIs: 'Flugdýrin', startBeat: 128, beats: 16, feature: 'flyers',
  what: 'A fluttering piccolo trill and a glockenspiel, the flyers whistle on D on beats 1 and 3, the piccolo runs up to G6; stop time: hit, the flyer alone, a trumpet pickup into chorus 2.' }, b => {
  [['Bb', 0], ['Gm', 4], ['Bb', 8]].forEach(([ch, t]) => S.chord(b + t, 4, ch, { v: 0.42 }));
  [[0, 86, 0.25], [0.25, 88, 0.25], [0.5, 86, 0.25], [0.75, 88, 0.25], [1, 89, 0.5], [1.5, 86, 0.5], [2, 82, 1], [3, 86, 0.5], [3.5, 89, 0.5]].forEach(([t, m, n]) =>
    S.picc(b + t, n, m, 0.66, { legato: 0.85, gain: 0.15 }));
  [[0, 86], [2, 82], [3.5, 89]].forEach(([t, m]) => S.glk(b + t, m, 0.5));
  S.oompah(b, 'Bb', { v: 0.6, vp: 0.6 });
  S.march(b, { v: 0.56 });
  S.call('flyers', b + 4, { take: 'flyers-1.mp3', n: 2 });
  S.call('flyers', b + 6, { take: 'flyers-3.mp3', n: 2 });
  [[4.5, 86], [5.5, 82], [6.5, 79], [7.5, 86]].forEach(([t, m]) => S.glk(b + t, m, 0.38));
  S.oompah(b + 4, 'Gm', { v: 0.6, vp: 0.6 });
  S.march(b + 4, { v: 0.56 });
  [[0, 82], [0.5, 84], [1, 86], [1.5, 89], [2, 91], [2.5, 89]].forEach(([t, m]) => S.picc(b + 8 + t, 0.5, m, 0.66, { legato: 0.7, gain: 0.15 }));
  S.picc(b + 11, 1, 86, 0.66, { legato: 0.85, gain: 0.15 });
  [[0, 82], [1, 86], [2, 91]].forEach(([t, m]) => S.glk(b + 8 + t, m, 0.45));
  S.oompah(b + 8, 'Bb', { v: 0.6, vp: 0.6 });
  S.march(b + 8, { v: 0.58, ruff: true });
  stopBar(b + 12, 'Gm', 'flyers', [[1, 'flyers-1.mp3', 2]], s => { S.tpt(s + 3, 0.5, 69, 0.7, { legato: 0.7 }); S.tpt(s + 3.5, 0.5, 70, 0.75, { legato: 0.7 }); });
});

unit({ name: 'Chorus 2: her song again, brighter', nameIs: 'Viðlag 2', startBeat: 144, beats: 32, feature: 'all',
  what: 'The same 14 notes by the animals, now trumpet and clarinet on each, glockenspiel two octaves up on the long notes, piccolo in the answers, snare ruffs.' }, b => {
  S.cue(b, 'hit', { what: 'chorus' });
  chorus(b, 2);
});

unit({ name: 'Tiptoe: the animals sneak past (drums off)', nameIs: 'Læðst á tánum', startBeat: 176, beats: 16, feature: null,
  what: 'Engines off: every drum stops. Only a soft dark pad, pizzicato on the beats (D minor colours, still F major) and a sneaky staccato clarinet; at the end the line hangs and one frog peeps "oops".' }, b => {
  const chs = ['Dm', 'Gm', 'Dm', 'C'];
  chs.forEach((ch, k) => {
    S.chord(b + 4 * k, 4, ch, { v: 0.36, attack: 0.6 });
    const [r, f] = ROOT5[ch];
    S.pz(b + 4 * k, r, 0.62, { stem: 'bass', t60: 0.55, gain: 0.46, bright: 0.35 });
    S.pz(b + 4 * k + 2, f, 0.5, { stem: 'bass', t60: 0.5, gain: 0.4, bright: 0.35 });
    [1, 3].forEach(t => PAH[ch].forEach((m, i) => S.pz(b + 4 * k + t, m, 0.32, { gain: 0.17, pan: (i - 1) * 0.3, bright: 0.4 })));
  });
  const sneak = [[0, 62], [1, 65], [2, 69], [2.5, 67], [3, 65], [4, 67], [5, 70], [6, 74], [6.5, 72], [7, 70], [8, 69], [9, 65], [10, 62], [10.5, 64], [11, 65], [12, 64], [13, 67]];
  sneak.forEach(([t, m]) => S.clar(b + t, 0.5, m, 0.45, { legato: 0.45, gain: 0.33, pan: -0.15 }));
  S.clar(b + 14, 1, 72, 0.42, { legato: 0.7, gain: 0.3, pan: -0.15 });
  S.call('frogs', b + 15, { take: 'frogs-2.mp3', n: 1, gain: 0.55 });
});

unit({ name: "Slóeðla's horn sings", nameIs: 'Horn Slóeðlu', startBeat: 192, beats: 16, feature: 'sloedla',
  what: 'Still no drums: her recorded horn sings the start of her song slowly (sol - mi - re mi do), the strings warm under it, pizzicato keeps the heartbeat, the glockenspiel answers each phrase and climbs into the build.' }, b => {
  S.chord(b, 4, 'F', { v: 0.48, attack: 0.8 });
  S.chord(b + 4, 4, 'Dm', { v: 0.48 });
  S.chord(b + 8, 2, 'Gm', { v: 0.48 });
  S.chord(b + 10, 2, 'F', { v: 0.48 });
  S.chord(b + 12, 4, 'F', { v: 0.52 });
  [[0, 4, 'lizards'], [4, 4, 'frogs'], [8, 2, 'turtles'], [10, 2, 'frogs'], [12, 4, 'grazers']].forEach(([t, n, g]) => S.horn(b + t, n, g));
  ['F', 'Dm', 'Gm', 'F'].forEach((ch, k) => {
    const [r, f] = ROOT5[ch];
    S.pz(b + 4 * k, r, 0.5, { stem: 'bass', t60: 0.55, gain: 0.3, bright: 0.35 });
    S.pz(b + 4 * k + 2, f, 0.42, { stem: 'bass', t60: 0.5, gain: 0.26, bright: 0.35 });
  });
  [[3, 84], [3.5, 81], [7, 81], [7.5, 77], [14, 77], [14.5, 81], [15, 84], [15.5, 89]].forEach(([t, m]) => S.glk(b + t, m, 0.4));
});

unit({ name: 'The build: everyone gathers', nameIs: 'Allir safnast saman', startBeat: 208, beats: 16, feature: 'all',
  what: 'The riser: snares gathering (8ths, 16ths, sixteenth-triplets, a 32nd roll), the bass drum filling in, the tuba pumping octaves, clarinets climbing the scale, trumpets swelling, a noise sweep; her horn calls sol; in the last bar the five animals rise F G A C D, a rat-a-tat and one breath before the drop.' }, b => {
  S.cue(b, 'riser');
  S.chord(b, 8, 'Bb', { v: 0.5 });
  S.chord(b + 8, 4, 'C', { v: 0.6 });
  S.chord(b + 12, 3.5, 'C7', { v: 0.7 });
  for (let i = 0; i < 8; i++) S.sn(b + i * 0.5, 0.18 + i * 0.02, 0.12);
  for (let i = 0; i < 16; i++) S.sn(b + 4 + i * 0.25, 0.3 + i * 0.012, 0.11);
  for (let i = 0; i < 24; i++) S.sn(b + 8 + i / 6, 0.4 + i * 0.008, 0.09);
  for (let i = 0; i < 24; i++) S.sn(b + 12 + i / 8, 0.5 + i * 0.01, 0.08);
  [3, 3.25, 3.5].forEach((t, i) => S.sn(b + 12 + t, 0.72 + 0.06 * i, 0.12));
  [0, 2].forEach((t, i) => S.bd(b + t, 0.4 + 0.05 * i));
  [0, 1, 2, 3].forEach((t, i) => S.bd(b + 4 + t, 0.45 + 0.03 * i));
  for (let i = 0; i < 8; i++) S.bd(b + 8 + i * 0.5, 0.52 + 0.015 * i);
  for (let i = 0; i < 6; i++) S.bd(b + 12 + i * 0.5, 0.62 + 0.03 * i);
  S.bd(b + 15, 0.82);
  S.put('beat', I.sweep(SEC(15.5), 1, hash('sweep')), b, { gain: 0.09, send: 0.2 });
  for (let i = 0; i < 30; i++) {
    const t = i * 0.5;
    const m = (t < 8 ? 34 : 36) + (i % 2 ? 12 : 0);
    S.tuba(b + t, 0.5, m, 0.6 + 0.01 * i, { legato: 0.6, gain: 0.36 });
  }
  S.tuba(b + 15, 0.5, 36, 0.92, { legato: 0.7 });
  [65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 82, 84].forEach((m, i) => S.clar(b + i, 1, m, 0.5 + 0.025 * i, { legato: 0.9, gain: 0.2 }));
  S.clar(b + 12, 3, 84, 0.75, { legato: 0.95, gain: 0.16 });
  [[0, [62, 65, 70], 0.42], [2, [62, 65, 70], 0.48], [4, [65, 70, 74], 0.52], [6, [65, 70, 74], 0.58], [8, [64, 67, 72], 0.64], [10, [64, 67, 72], 0.7], [12, [64, 70, 72], 0.78]].forEach(([t, ms, v]) =>
    ms.forEach(m => S.tpt(b + t, t === 12 ? 3 : 2, m, v, { legato: 0.96, gain: 0.08 })));
  S.horn(b + 8, 4, 'lizards', { gain: 0.6 });
  [['grazers', 0], ['turtles', 0.5], ['frogs', 1], ['lizards', 1.5], ['flyers', 2]].forEach(([g, t]) => S.call(g, b + 12 + t, { n: 1, gain: 1.05 }));
  S.stab(b + 15, 'C7', 0.85);
  S.pahChord(b + 15, 'C7', 0.85, { n: 0.4 });
});

unit({ name: 'The drop: the final chorus, everyone', nameIs: 'Lokaviðlag', startBeat: 224, beats: 32, feature: 'all',
  what: 'The same chorus bigger: the five animals and her horn on every note, trumpets, clarinets an octave up, glockenspiel two octaves up, a piccolo descant, strings in octaves, the bassoon doubling the tuba, bass drum on every beat and the cymbals on 2 and 4.' }, b => {
  S.cue(b, 'drop');
  chorus(b, 3);
});

unit({ name: 'Outro: the walk home and the last hit', nameIs: 'Heim á leið', startBeat: 256, beats: 16, feature: 'all',
  what: 'A written cadence: the tuba walks home (F E D C, Bb A G C) under held chords with the trumpets falling, then the comic tag ("shave and a haircut ... two bits") in unison, a beat of silence, and one F hit with every animal and her horn on beat 270.' }, b => {
  const walk = [[0, 41, 'F'], [1, 40, 'C'], [2, 38, 'Dm'], [3, 36, 'F'], [4, 34, 'Bb'], [5, 33, 'F'], [6, 31, 'Gm'], [7, 36, 'C7']];
  const fall = [72, 72, 69, 69, 74, 72, 70, 67];
  walk.forEach(([t, m, ch], i) => {
    S.tuba(b + t, 1, m, 0.85, { legato: 0.85 });
    S.chord(b + t, 1, ch, { v: 0.5, attack: 0.1, release: 0.35, tie: false });
    S.tpt(b + t, 1, fall[i], 0.66, { legato: 0.88, gain: 0.16 });
    S.clar(b + t, 1, fall[i] - 3 - (i % 2), 0.5, { legato: 0.88, gain: 0.12 });
    S.bd(b + t, 0.62);
    if (t % 2) S.sn(b + t, 0.5);
  });
  [[0, 84], [2, 81], [4, 86], [6, 82]].forEach(([t, m]) => S.glk(b + t, m, 0.42));
  S.cym(b, 0.3, 1.0);
  // the tag: F C-C D C | (rest) E F!
  const tag = [[8, 65, 'F', 41], [9, 60, 'C', 36], [9.5, 60, 'C', 36], [10, 62, 'Bb', 34], [11, 60, 'C', 36], [13, 64, 'C7', 36]];
  tag.forEach(([t, m, ch, r]) => {
    S.tpt(b + t, 0.5, m + 12, 0.8, { legato: 0.6, gain: 0.2 });
    S.clar(b + t, 0.5, m + 12, 0.65, { legato: 0.6, gain: 0.16 });
    S.picc(b + t, 0.5, m + 24, 0.45, { legato: 0.6, gain: 0.07 });
    S.tuba(b + t, 0.5, r, 0.85, { legato: 0.6 });
    S.pahChord(b + t, ch, 0.75, { n: 0.3 });
    S.sn(b + t, 0.58);
    S.bd(b + t, 0.55);
  });
  // the last hit, beat 270
  const h = b + 14;
  S.cue(h, 'hit');
  S.cue(h, 'end');
  S.tuba(h, 2.2, 41, 0.92, { legato: 1 });
  [65, 69, 72, 77].forEach(m => S.tpt(h, 2.2, m, 0.75, { legato: 1, gain: 0.1 }));
  [77, 81].forEach(m => S.clar(h, 2.2, m, 0.65, { legato: 1, gain: 0.14 }));
  S.picc(h, 2.2, 89, 0.5, { legato: 1, gain: 0.07 });
  [89, 93, 96].forEach(m => S.glk(h, m, 0.5, { t60: 2 }));
  S.chord(h, 2.2, 'F', { v: 0.6, attack: 0.02, release: 1.1, tie: false });
  S.pahChord(h, 'F', 0.65, { n: 1.5 });
  S.bd(h, 0.7);
  S.sn(h, 0.5);
  S.cym(h, 0.32, 1.8);
  S.horn(h, 2.5, 'grazers', { gain: 0.5 });
  ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'].forEach(g => S.call(g, h, { n: 2.2, gain: 0.6 }));
});

// ---------------------------------------------------------------- mix and master
function render() {
  S.renderPad();
  const arc = new Float32Array(LEN);
  for (let i = 0; i < LEN; i += 16) {
    const f = arcAt(i / SPB);
    for (let j = i; j < i + 16 && j < LEN; j++) arc[j] = f;
  }
  const bassArc = arc.map(f => Math.max(1700, Math.min(7000, f * 0.75)));
  const out = {};
  for (const name of STEMS) {
    const { dry, send } = S.stems[name];
    const cut = name === 'pad' || name === 'lead' ? arc : name === 'bass' ? bassArc : null;
    for (const x of [dry[0], dry[1], send]) {
      if (cut) D.svf(x, cut, 0.6);
      D.filt(x, D.biquad('hp', 32, 0.7), D.biquad('hs', 8500, 0.7, -6));
    }
    const wet = D.reverb([send, send], { room: 0.8, damp: 0.4 });
    out[name] = [new Float32Array(LEN), new Float32Array(LEN)];
    for (let c = 0; c < 2; c++) for (let i = 0; i < LEN; i++) out[name][c][i] = dry[c][i] + WET * wet[c][i];
  }
  return out;
}

/** BS.1770 integrated loudness of [L, R] (K-weighting and the two gates), for the first guess of the master gain. */
function lufs([L, R]) {
  const k = x => D.filt(Float32Array.from(x), D.biquad('hs', 1681.97, 0.7071, 4), D.biquad('hp', 38.13, 0.5));
  const a = k(L);
  const b = k(R);
  const block = Math.round(0.4 * SR);
  const hop = Math.round(0.1 * SR);
  const z = [];
  for (let s = 0; s + block <= a.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + block; i++) e += a[i] * a[i] + b[i] * b[i];
    z.push(e / block);
  }
  const L_ = e => -0.691 + 10 * Math.log10(e);
  const abs = z.filter(e => L_(e) > -70);
  const mean = xs => xs.reduce((s, e) => s + e, 0) / xs.length;
  const rel = L_(mean(abs)) - 10;
  return L_(mean(abs.filter(e => L_(e) > rel)));
}

/** A lookahead limiter on 4x-oversampled peaks: the gain reaches what the peak needs before it, and lets go in 90 ms. */
function limit([L, R], gain, ceilDb) {
  const ceil = 10 ** (ceilDb / 20);
  const n = L.length;
  const taps = 8;
  const kernels = [0.25, 0.5, 0.75].map(fr => {
    const k = [];
    for (let j = -taps + 1; j <= taps; j++) {
      const d = fr - j;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / taps);
      k.push((Math.sin(Math.PI * d) / (Math.PI * d)) * w);
    }
    return k;
  });
  const peakAt = new Float32Array(n);
  for (const x of [L, R]) {
    for (let i = 0; i < n; i++) {
      let p = Math.abs(x[i]);
      if (i >= taps && i < n - taps) {
        for (const k of kernels) {
          let s = 0;
          for (let j = 0; j < k.length; j++) s += x[i + j - taps + 1] * k[j];
          if (Math.abs(s) > p) p = Math.abs(s);
        }
      }
      if (p > peakAt[i]) peakAt[i] = p;
    }
  }
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) need[i] = Math.min(1, ceil / (peakAt[i] * gain + 1e-12));
  const W = Math.round(0.004 * SR);
  const m = new Float32Array(n);
  const dq = [];
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length && need[dq[dq.length - 1]] >= need[i]) dq.pop();
    dq.push(i);
    while (dq[0] > i + W) dq.shift();
    m[i] = need[dq[0]];
  }
  // the mean of m over the last W+1 samples (ones before the start): never above what any peak in reach needs
  const g = new Float32Array(n);
  let run = W + 1;
  for (let i = 0; i < n; i++) {
    run += m[i] - (i - W - 1 >= 0 ? m[i - W - 1] : 1);
    g[i] = run / (W + 1);
  }
  const rel = 1 - Math.exp(-1 / (0.09 * SR));
  let y = 1;
  let reduced = 0;
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    y = Math.min(g[i], y + (1 - y) * rel);
    if (y < 0.999) reduced++;
    out[0][i] = L[i] * gain * y;
    out[1][i] = R[i] * gain * y;
  }
  return { out, reducedSec: reduced / SR };
}

function main() {
  const t0 = Date.now();
  mkdirSync(join(OUT, 'stems'), { recursive: true });
  const tmp = join(OUT, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const stems = render();
  const mixPre = [new Float32Array(LEN), new Float32Array(LEN)];
  for (const name of STEMS) for (let c = 0; c < 2; c++) for (let i = 0; i < LEN; i++) mixPre[c][i] += stems[name][c][i];
  // one scale for every stem so the pre-master mix peaks at -4 dBFS (the stems keep their sum)
  let peak = 0;
  for (const x of mixPre) for (const v of x) peak = Math.max(peak, Math.abs(v));
  const pre = 10 ** (-4 / 20) / peak;
  for (const x of mixPre) for (let i = 0; i < LEN; i++) x[i] *= pre;
  const stemPeaks = {};
  for (const name of STEMS) {
    let p = 0;
    for (const x of stems[name]) for (let i = 0; i < LEN; i++) { x[i] *= pre; p = Math.max(p, Math.abs(x[i])); }
    stemPeaks[name] = +(20 * Math.log10(p)).toFixed(2);
    D.writeWav(join(tmp, `${name}.wav`), stems[name]);
    D.mp3(join(tmp, `${name}.wav`), join(OUT, 'stems', `${name}.mp3`));
  }
  D.writeWav(join(tmp, 'premaster.wav'), mixPre);
  // master: gain to -16 LUFS, true peak under -1 dBTP; measured on the mp3 itself and corrected
  let gainDb = -16 - lufs(mixPre);
  let ceilDb = -1.6;
  let meas = null;
  let limited = null;
  for (let pass = 0; pass < 4; pass++) {
    limited = limit(mixPre, 10 ** (gainDb / 20), ceilDb);
    D.writeWav(join(tmp, 'mix.wav'), limited.out);
    D.mp3(join(tmp, 'mix.wav'), join(OUT, 'mix.mp3'));
    meas = D.loudness(join(OUT, 'mix.mp3'));
    console.log(`master pass ${pass}: gain ${gainDb.toFixed(2)} dB, ceiling ${ceilDb} -> ${meas.lufs} LUFS, ${meas.truePeak} dBTP, limiting ${limited.reducedSec.toFixed(2)} s`);
    const okL = Math.abs(meas.lufs + 16) <= 0.3;
    const okP = meas.truePeak <= -1.1;
    if (okL && okP) break;
    if (!okL) gainDb += -16 - meas.lufs;
    if (!okP) ceilDb -= meas.truePeak + 1.2;
  }
  // pictures of the mix
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(OUT, 'mix.mp3'), '-lavfi', 'showspectrumpic=s=1600x600:legend=1:scale=log:stop=12000', join(OUT, 'spectrogram.png')]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(OUT, 'mix.mp3'), '-lavfi', 'showwavespic=s=1600x300:split_channels=0:colors=#3a6ea5', join(OUT, 'waveform.png')]);
  // song.json
  const sections = UNITS.map(u => ({ name: u.name, nameIs: u.nameIs, startBeat: u.startBeat, beats: u.beats, startSec: +SEC(u.startBeat).toFixed(3), feature: u.feature, what: u.what }));
  const sources = [...S.used].sort().map(f => {
    const e = SOUNDS[f];
    return `${REL_HLJOD}/${f} (${e.source.licence}${e.source.author ? `, "${e.source.name}" by ${e.source.author}` : ''})`;
  });
  const song = {
    slot: 'smidur-d',
    name: 'Skrúðganga dýranna',
    style: 'A cheeky cartoon parade march: oompah tuba and bassoon, clarinets, piccolo, trumpets, glockenspiel, march drums and pizzicato, every animal stepping forward for its own "here I come!" turn.',
    bpm: BPM,
    beatZeroSec: 0,
    key: 'F major',
    lengthSec: +SEC(BEATS).toFixed(3),
    sections,
    chorusMelody: S.melody,
    loop: { startBeat: 16, beats: 16, bars: '5-8', note: 'The parade groove (F Bb F C7). Bar 4 is the same bar as bar 8 in every stem, so the seam is clean; no animals in it.' },
    stems: Object.fromEntries(STEMS.map(s => [s, `stems/${s}.mp3`])),
    cues: S.cues.sort((a, b) => a.beat - b.beat || a.kind.localeCompare(b.kind)),
    sources,
    loudness: { lufs: meas.lufs, truePeak: meas.truePeak },
  };
  writeFileSync(join(OUT, 'song.json'), `${JSON.stringify(song, null, 2)}\n`);
  writeFileSync(join(OUT, 'checks.json'), `${JSON.stringify({ stemPeaksDbfs: stemPeaks, premasterScale: pre, masterGainDb: gainDb, ceilingDb: ceilDb,
    limitingSec: limited.reducedSec, ...S.checks }, null, 2)}\n`);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${song.lengthSec} s, ${meas.lufs} LUFS, ${meas.truePeak} dBTP; stem peaks`, stemPeaks);
}

main();
