#!/usr/bin/env node
// Stjörnuhátíðin's song: the owner's pick H (2026-11-24) arranged for the party from its own stems, its friends' sounds laid on
// top, mixed for small speakers, and its beat map. Run from anywhere:
//   node remake/tools/hatid-lag/render.mjs
// Reads qa/remake/hatid/lag/hatid-h/ (song.mp3, song.json, the six stems; git ignores qa/) and the game's own recordings. Writes
// into qa/remake/hatid/lag/hatid-h/: mix.mp3, click.mp3 (the mix with a click on every beat and a bell on every section),
// render.json (the beat map and what was laid, which tools/hatid-song.mjs carries into the game), checks.json, and
// stems/{drums,bass,music,choir,friends}.mp3 for the ride back's remix. (H's own song.json, the record of its composing, is left
// as it is: the beat map is render.json.) Deterministic: no clock, no seed from outside. Nothing is asked of anyone.
//
// The task's rulings (.superpowers/sdd/hatid/task-2-rulings.md): H's timeline is not re-cut, no bar moved, repeated or dropped.
// The mix IS song.mp3 wherever nothing is changed: every control is a stem's gain over time, applied as the difference
// (gain - 1) x stem added to the song, so a stem at gain 1 leaves H exactly as it was; and the friends' sounds are laid on top.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, decode, writeWav, encodeMp3, ebur128 } from './lib/io.mjs';
import { Biquad, stereo, addMono, panGains, peakOf } from './lib/dsp.mjs';
import { lufs, limit, kLoud } from './lib/master.mjs';
import { track, median } from './lib/pitch.mjs';
import { mono } from './lib/analyze.mjs';
import { measureRhythm, measureKey, keyNotes } from '../theme-tempo.mjs';
import { SECTIONS, END_BEAT, BAR, part, isIn, entriesOf, solosOf, callsOf, eventsOf, roarsOf, gainsOf, PATTERN } from './lib/plan.mjs';
import { STEMS, noteName } from './measure.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');
const H = path.join(ROOT, 'qa/remake/hatid/lag/hatid-h');
const WORK = path.join(H, 'work');
const AUDIO = path.join(ROOT, 'remake/assets/audio');
const t0 = Date.now();
const say = msg => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const db = v => 20 * Math.log10(Math.max(v, 1e-12));
const round = (v, k = 1) => Math.round(v * 10 ** k) / 10 ** k;
fs.mkdirSync(path.join(H, 'stems'), { recursive: true });
fs.mkdirSync(WORK, { recursive: true });

// ---------------------------------------------------------------- H and its grid
const H_SONG = JSON.parse(fs.readFileSync(path.join(H, 'song.json'), 'utf8'));
/** The stems sit this many samples late against song.mp3 (measure.mjs: cross-correlation of their sum with the song). */
export const STEM_LAG = 1105;
/** Bar lines fall on every fourth beat of H's measured grid from its beat 2 (measure.mjs: the seams and the harmony). */
export const DOWNBEAT = 2;
const BPM = H_SONG.bpm;
const BEAT_S = 60 / BPM;
const BEAT_OFFSET = round(H_SONG.beatOffset + DOWNBEAT * BEAT_S, 4); // the song's beat 0, in seconds of the file
const at = beat => Math.round((BEAT_OFFSET + beat * BEAT_S) * SR); // the sample of a song beat
const [songL, songR] = decode(path.join(H, 'song.mp3'), 2);
const n = songL.length;
const stem = {};
for (const s of STEMS) {
  const [L, R] = decode(path.join(H, `${s}.mp3`), 2);
  const a = { L: new Float32Array(n), R: new Float32Array(n), n };
  a.L.set(L.subarray(STEM_LAG, STEM_LAG + n));
  a.R.set(R.subarray(STEM_LAG, STEM_LAG + n));
  stem[s] = a;
}
say(`H: ${(n / SR).toFixed(3)} s, ${BPM} bpm, beat 0 at ${BEAT_OFFSET} s, ${END_BEAT} beats to the last bar line (${((at(END_BEAT)) / SR).toFixed(2)} s)`);

const rmsOf = (x, a, b) => {
  let s = 0;
  a = Math.max(0, a); b = Math.min(x.length, b);
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const monoOf = st => mono(st.L, st.R);

// ---------------------------------------------------------------- measured on H: her horn's phrases, the band's accents, the bass
const otherM = monoOf(stem.other), drumsM = monoOf(stem.drums), bassM = monoOf(stem.bass);
const beatRms = x => Array.from({ length: END_BEAT }, (_, k) => db(rmsOf(x, at(k), at(k + 1))));
const otherBeats = beatRms(otherM);
const otherTop = Math.max(...otherBeats);
// a horn phrase starts where the "other" stem (the oboe / cor anglais line, with the soft strings) rises 4 dB over the two beats
// before and is within 20 dB of its loudest, at most one a bar; and on beat 0, where her opening is already sounding
const hornBeats = [0, ...otherBeats.map((v, k) => (k >= 2 && v - Math.max(otherBeats[k - 1], otherBeats[k - 2]) >= 4 && v >= otherTop - 20 ? k : -1)).filter(k => k > 0)].filter((k, i, all) => i === 0 || k - all[i - 1] >= BAR);
// the band's accents: the drums' attack on a beat (broadband RMS just after against just before) at least HIT times the median
// attack of its section and the biggest within two beats either side; none in the quiet part (its drums are muted)
const attackOf = k => Math.max(0, rmsOf(drumsM, at(k) - 0.01 * SR, at(k) + 0.04 * SR) - rmsOf(drumsM, at(k) - 0.15 * SR, at(k) - 0.01 * SR));
const HIT = 1.6; // times the section's median attack
const attacks = Array.from({ length: END_BEAT }, (_, k) => attackOf(k));
const hitBeats = [];
for (const section of SECTIONS) {
  if (section.id === 'quiet') continue;
  const own = attacks.slice(section.startBeat, section.startBeat + section.beats);
  const mid = median(own.filter(v => v > 1e-4)) || 0;
  if (!mid) continue;
  own.forEach((v, i) => {
    const k = section.startBeat + i;
    if (v >= HIT * mid && [-2, -1].every(d => v >= (attacks[k + d] ?? 0)) && [1, 2].every(d => v > (attacks[k + d] ?? 0))) hitBeats.push(k);
  });
}
// the bass note on the first beat of every bar (for Þórseðla's deep tone), MIDI, or null where the bass is silent
const bassNotes = Array.from({ length: END_BEAT / BAR }, (_, bar) => {
  const fr = track(bassM.subarray(at(bar * BAR), at(bar * BAR + 1)), { win: 2048, hop: 512, fmin: 35, fmax: 330 });
  const loud = Math.max(...fr.map(f => f.rms), 1e-9);
  const good = fr.filter(f => f.hz > 0 && f.ap < 0.2 && f.rms > 0.2 * loud && f.rms > 0.004);
  return good.length >= 2 ? Math.round(69 + 12 * Math.log2(median(good.map(f => f.hz)) / 440)) : null;
});
say(`horn phrases at beats ${hornBeats.join(' ')}; band accents at ${hitBeats.join(' ')}; bass notes ${bassNotes.map(m => (m === null ? '-' : noteName(m))).join(' ')}`);

// ---------------------------------------------------------------- the stems' gains over time, applied as differences to H
const gains = gainsOf();
/** A stem's gain at every sample: the product of its steps (plan.mjs gainAt, sample by sample only where a step acts). */
function gainTrack(steps) {
  const g = new Float32Array(n).fill(1);
  for (const { from, to, gain, ramp } of steps) {
    const out = Math.min(ramp, 0.06);
    const a = Math.max(0, at(from - ramp)), b = Math.min(n, at(to));
    for (let i = a; i < b; i++) {
      const beat = (i / SR - BEAT_OFFSET) / BEAT_S;
      const k = beat < from ? (beat - (from - ramp)) / ramp : beat > to - out ? (to - beat) / out : 1;
      g[i] *= 1 + (gain - 1) * Math.max(0, Math.min(1, k));
    }
  }
  return g;
}
const stemGain = Object.fromEntries(STEMS.map(s => [s, gainTrack(gains[s])]));
const base = { L: Float32Array.from(songL), R: Float32Array.from(songR), n };
for (const s of STEMS) {
  const g = stemGain[s];
  for (let i = 0; i < n; i++) {
    if (g[i] === 1) continue;
    base.L[i] += (g[i] - 1) * stem[s].L[i];
    base.R[i] += (g[i] - 1) * stem[s].R[i];
  }
}
say('stem gains applied');

// the choir enters where its voices are first heard in the mix: the first beat of the dance on which the vocals stem, at its gain,
// is over -30 dBFS (the first dance call ducks the chant's first bar)
const voiceAt = k => db(rmsOf(Float32Array.from({ length: at(k + 1) - at(k) }, (_, i) => 0.5 * (stem.vocals.L[at(k) + i] + stem.vocals.R[at(k) + i]) * stemGain.vocals[at(k) + i]), 0, at(k + 1) - at(k)));
let choirBeat = part('dance').startBeat;
while (choirBeat < part('dance').startBeat + part('dance').beats && voiceAt(choirBeat) < -30) choirBeat++;
const entries = entriesOf(choirBeat);
say(`the choir is first heard on beat ${choirBeat} (${voiceAt(choirBeat).toFixed(1)} dBFS)`);

// ---------------------------------------------------------------- the friends' sounds (the game's own recordings)
const loadMono = file => {
  const [x] = decode(file);
  let pk = 0;
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  return x.map(v => v / pk); // peak 1
};
const highpass = (x, hz) => {
  for (const q of [0.5412, 1.3066]) new Biquad('hp', hz, q).run(x);
  return x;
};
const resample = (x, rate) => {
  const out = new Float32Array(Math.floor((x.length - 1) / rate));
  for (let i = 0; i < out.length; i++) {
    const p = i * rate, j = Math.floor(p), f = p - j;
    out[i] = x[j] * (1 - f) + x[j + 1] * f;
  }
  return out;
};
/** The first sample over 12 % of the sound's peak: laid so that this lands on its beat. */
const attackSample = x => {
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < 0.12) i++;
  return i;
};
const SOURCES = {
  stomp: 'remake/assets/audio/gramedla3d/hljod/thump.mp3',
  plate: 'remake/assets/audio/kafli6/hljod/hoofStone-1.mp3',
  tail: 'remake/assets/audio/tjorn3d/hljod/fish.mp3',
  deep: 'remake/assets/audio/kafli5/hljod/grazers-3.mp3',
  roar: 'remake/assets/audio/kafli2/gramedla-roar.mp3',
};
const sound = Object.fromEntries(Object.entries(SOURCES).map(([k, f]) => [k, loadMono(path.join(ROOT, f))]));
// her footfall for small speakers (chapter 5's prufa fix 1 in small): the thump as it is, and a copy 2.5 times faster, driven
// and over 45 Hz, 6 dB under it: a knock where a tablet's speaker can play it
{
  const knock = highpass(resample(sound.stomp, 2.5).map(v => Math.tanh(4 * v) / Math.tanh(4)), 45);
  const s = Float32Array.from(sound.stomp);
  for (let i = 0; i < knock.length; i++) s[i] += knock[i] * 10 ** (-6 / 20);
  sound.stomp = highpass(s, 30);
}
sound.roar = highpass(sound.roar, 80);
// Þórseðla's deep tone: a big animal's low call (a cow's moo, grazers-3, 182.63 Hz) moved to the bass note under it, in the
// octave from C3 (MIDI 48) up
const DEEP_HZ = 182.63;
const deepFor = midi => {
  const m = midi === null ? 50 : 48 + (((midi - 48) % 12) + 12) % 12;
  const hz = 440 * 2 ** ((m - 69 + H_SONG.tuningCents / 100) / 12);
  return { midi: m, y: resample(sound.deep, hz / DEEP_HZ) };
};
// Flugeðla's scratch: a baby scratch on the song's own record, a chant "hey" from the chorus pushed forward and pulled back twice
// in a beat (the record's position follows a raised cosine, so it speeds up and slows to turn, as a hand does)
{
  const from = at(part('chorus').startBeat + 4), len = Math.round(0.3 * SR);
  const rec = Float32Array.from({ length: len }, (_, i) => 0.5 * (stem.vocals.L[from + i] + stem.vocals.R[from + i]));
  const strokes = 2, D = Math.round((BEAT_S / strokes) * SR), out = new Float32Array(strokes * D);
  for (let s = 0; s < strokes; s++) for (let i = 0; i < D; i++) {
    const p = (0.22 * SR * (1 - Math.cos((2 * Math.PI * i) / D))) / 2, j = Math.floor(p), f = p - j;
    const env = Math.min(1, i / (0.004 * SR), (D - i) / (0.004 * SR));
    out[s * D + i] = (rec[j] * (1 - f) + (rec[j + 1] ?? 0) * f) * env;
  }
  let pk = 0;
  for (const v of out) pk = Math.max(pk, Math.abs(v));
  sound.scratch = highpass(out.map(v => v / pk), 150);
}
const SOUND_OF = { stomp: 'stomp', plate: 'plate', tail: 'tail', deep: 'deep', scratch: 'scratch' };
const PAN = { gramedla: 0, kambedla: -0.35, uggedla: 0.35, thorsedla: -0.15, flugedla: 0.45, roar: 0 };
// their levels: each sound's own loudness set this far under the band's in the arrival (bars 7-17, where they enter one by one);
// the same gain plays on in the dance and the chorus, where the band is louder; in her own solo a friend plays 4 dB louder
const UNDER = { stomp: -5, plate: -9, tail: -8, deep: -8, scratch: -9 };
const arrival = [at(7 * BAR), at(part('dance').startBeat)];
const bandArrival = kLoud(base.L, base.R, ...arrival);
const selfLoud = x => kLoud(x, x, 0, x.length) - 3.01; // a mono sound's loudness as both channels at half
const level = {};
// no sound's own peak over PEAK_CAP (each is normalised to a peak of 1): a sharp click that is loud enough by loudness would
// otherwise only be squashed by the limiter; where the cap bites, the sound is quieter than aimed (checks.json levelsUnderBand)
const PEAK_CAP = 10 ** (-6 / 20);
const aimed = {};
for (const k of Object.keys(UNDER)) {
  aimed[k] = 10 ** ((bandArrival + UNDER[k] - selfLoud(k === 'deep' ? deepFor(50).y : sound[k])) / 20);
  level[k] = Math.min(aimed[k], PEAK_CAP);
}
const events = eventsOf(entries);
const friends = stereo(n);
const laid = [];
for (const e of events) {
  const kind = PATTERN[e.who].kind;
  const { y, midi } = kind === 'deep' ? deepFor(bassNotes[Math.floor(e.beat / BAR)]) : { y: sound[SOUND_OF[kind]] };
  const g = level[kind] * (e.solo ? 10 ** (4 / 20) : 1);
  addMono(friends, y, at(e.beat) - attackSample(y), g, PAN[e.who]);
  laid.push({ ...e, kind, midi });
}
// Grameðla's roars in the last chorus, each 4 LU under the band in its bar
const chorusSpan = [at(part('chorus').startBeat), at(part('chorus').startBeat + part('chorus').beats)];
const roarAimed = 10 ** ((kLoud(base.L, base.R, ...chorusSpan) - 4 - selfLoud(sound.roar)) / 20);
const roarGain = Math.min(roarAimed, PEAK_CAP);
const roars = roarsOf();
for (const beat of roars) addMono(friends, sound.roar, at(beat) - attackSample(sound.roar), roarGain, PAN.roar);
// their peaks held under the band's: a look-ahead limiter on the friends alone (chapter 5 did so for its animals), so that a
// stone's click or the roar never turns the whole song down in the master's limiter
const friendsLim = limit(friends.L, friends.R, PEAK_CAP);
say(`laid ${laid.length} friends' sounds and ${roars.length} roars; levels (dB) ${Object.entries(level).map(([k, g]) => `${k} ${db(g).toFixed(1)}`).join(', ')}, roar ${db(roarGain).toFixed(1)}; their limiter at most ${db(friendsLim.most).toFixed(1)} dB`);

// ---------------------------------------------------------------- the whole: H with its stems' gains, the friends, the chorus lifted
const sum = (...parts) => {
  const s = stereo(n);
  for (const p of parts) for (let i = 0; i < n; i++) { s.L[i] += p.L[i]; s.R[i] += p.R[i]; }
  return s;
};
const span = id => [at(part(id).startBeat), at(part(id).startBeat + part(id).beats)];
let pre = sum(base, friends);
const sectionLufs = st => Object.fromEntries(SECTIONS.map(s => [s.id, round(lufs(st.L, st.R, { from: span(s.id)[0], to: span(s.id)[1] }), 2)]));
const before = sectionLufs(pre);
// the last chorus at least 2 LU over the first dance (2.5 aimed): gently, the chorus and the chord after it up by up to 2 dB, and
// the first dance down by the rest (a 2-beat ramp into each, inside the near-silent bar before the chorus)
const need = Math.max(0, 2.5 - (before.chorus - before.dance));
const up = Math.min(2, need), down = need - up;
const lift = new Float32Array(n).fill(1);
{
  const ramp = (a, b, from, to) => { for (let i = a; i < b && i < n; i++) lift[i] = from + (to - from) * ((i - a) / (b - a)); };
  const [c0] = span('chorus');
  ramp(c0 - Math.round(2 * BEAT_S * SR), c0, 1, 10 ** (up / 20));
  lift.fill(10 ** (up / 20), c0);
  if (down > 0) {
    const [d0, d1] = span('dance');
    ramp(d0 - Math.round(2 * BEAT_S * SR), d0, 1, 10 ** (-down / 20));
    lift.fill(10 ** (-down / 20), d0, d1);
    ramp(d1, d1 + Math.round(2 * BEAT_S * SR), 10 ** (-down / 20), 1);
  }
}
for (const st of [pre]) for (let i = 0; i < n; i++) { st.L[i] *= lift[i]; st.R[i] *= lift[i]; }
// for small speakers: nothing under 30 Hz (4th-order high-pass), as chapter 5's prufa fix 2 did for its animals: a rumble no one
// hears only turns the limiter down
const under30 = st => {
  const lo = { L: Float32Array.from(st.L), R: Float32Array.from(st.R) };
  for (const ch of [lo.L, lo.R]) for (const q of [0.5412, 1.3066]) new Biquad('lp', 30, q).run(ch);
  return db(Math.sqrt((rmsOf(lo.L, 0, n) ** 2 + rmsOf(lo.R, 0, n) ** 2) / 2) / Math.sqrt((rmsOf(st.L, 0, n) ** 2 + rmsOf(st.R, 0, n) ** 2) / 2));
};
const sub30Before = under30(pre);
for (const ch of [pre.L, pre.R]) for (const q of [0.5412, 1.3066]) new Biquad('hp', 30, q).run(ch);
// the file ends in silence: the last 0.3 s eased to nothing (H is already near silence there)
const easeN = Math.round(0.3 * SR);
for (let i = 0; i < easeN; i++) { pre.L[n - 1 - i] *= i / easeN; pre.R[n - 1 - i] *= i / easeN; }
say(`sections before the lift (LUFS) ${JSON.stringify(before)}; chorus +${up.toFixed(2)} dB, dance -${down.toFixed(2)} dB; under 30 Hz ${sub30Before.toFixed(1)} dB of the whole, cut`);

// ---------------------------------------------------------------- master: to -16 LUFS, true peak at most -1.5 dBTP after encoding
function master(gain, ceilingDb) {
  const L = Float32Array.from(pre.L, v => v * gain), R = Float32Array.from(pre.R, v => v * gain);
  const lim = limit(L, R, 10 ** (ceilingDb / 20));
  return { L, R, lim };
}
let gain = 10 ** ((-16 - lufs(pre.L, pre.R)) / 20), ceiling = -1.8, mix;
for (let it = 0; it < 4; it++) {
  mix = master(gain, ceiling);
  const l = lufs(mix.L, mix.R);
  if (Math.abs(l + 16) < 0.05) break;
  gain *= 10 ** ((-16 - l) / 20);
}
const MIX = path.join(H, 'mix.mp3');
writeWav(path.join(WORK, 'mix.wav'), mix.L, mix.R);
encodeMp3(path.join(WORK, 'mix.wav'), MIX);
let loud = ebur128(MIX);
for (let it = 0; it < 4 && (loud.truePeak > -1.5 || Math.abs(loud.lufs + 16) > 0.12); it++) {
  if (loud.truePeak > -1.5) ceiling -= loud.truePeak + 1.6;
  gain *= 10 ** ((-16 - loud.lufs) / 20);
  mix = master(gain, ceiling);
  writeWav(path.join(WORK, 'mix.wav'), mix.L, mix.R);
  encodeMp3(path.join(WORK, 'mix.wav'), MIX);
  loud = ebur128(MIX);
}
say(`mix.mp3: ${loud.lufs} LUFS, true peak ${loud.truePeak} dBTP, LRA ${loud.lra} LU; master gain ${db(gain).toFixed(2)} dB, limiter ceiling ${ceiling.toFixed(2)} dBFS, at most ${db(mix.lim.most).toFixed(2)} dB of gain reduction`);

// ---------------------------------------------------------------- the stems kept for the ride back (same gains, same master gain)
const keep = {
  drums: ['drums'], bass: ['bass'], music: ['guitar', 'piano', 'other'], choir: ['vocals'],
};
const keptLoud = {};
for (const [name, list] of Object.entries(keep)) {
  const st = stereo(n);
  for (const s of list) for (let i = 0; i < n; i++) {
    const g = stemGain[s][i] * lift[i] * gain;
    st.L[i] += stem[s].L[i] * g;
    st.R[i] += stem[s].R[i] * g;
  }
  writeWav(path.join(WORK, `${name}.wav`), st.L, st.R);
  encodeMp3(path.join(WORK, `${name}.wav`), path.join(H, 'stems', `${name}.mp3`));
}
{
  const st = stereo(n);
  for (let i = 0; i < n; i++) { st.L[i] = friends.L[i] * lift[i] * gain; st.R[i] = friends.R[i] * lift[i] * gain; }
  writeWav(path.join(WORK, 'friends.wav'), st.L, st.R);
  encodeMp3(path.join(WORK, 'friends.wav'), path.join(H, 'stems', 'friends.mp3'));
}
for (const name of [...Object.keys(keep), 'friends']) keptLoud[name] = ebur128(path.join(H, 'stems', `${name}.mp3`));
say('stems written');

// ---------------------------------------------------------------- the click version: a click on every beat, a bell on every section
{
  const L = Float32Array.from(mix.L), R = Float32Array.from(mix.R);
  const ping = (a, hz, seconds, amp) => {
    for (let i = 0; i < seconds * SR && a + i < n; i++) {
      const t = i / SR, v = amp * Math.exp(-t * (hz > 1500 ? 60 : 4)) * (Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(2 * Math.PI * hz * 2.76 * t));
      L[a + i] += v; R[a + i] += v;
    }
  };
  for (let k = 0; k < END_BEAT; k++) ping(at(k), k % BAR === 0 ? 2400 : 1800, 0.05, k % BAR === 0 ? 0.25 : 0.15);
  for (const s of SECTIONS) ping(at(s.startBeat), 880, 1.6, 0.3);
  ping(at(END_BEAT), 880, 1.6, 0.3);
  limit(L, R, 10 ** (-1.5 / 20));
  writeWav(path.join(WORK, 'click.wav'), L, R);
  encodeMp3(path.join(WORK, 'click.wav'), path.join(H, 'click.mp3'));
}
say('click.mp3');

// ---------------------------------------------------------------- measured on the mix as encoded
const [dl, dr] = decode(MIX, 2);
const dm = mono(dl, dr);
const sections = sectionLufs({ L: dl, R: dr });
const bars = Array.from({ length: END_BEAT / BAR }, (_, b) => round(kLoud(dl, dr, at(b * BAR), at((b + 1) * BAR)), 1));
const lastSecondDb = round(db(rmsOf(dm, dm.length - SR, dm.length)), 1);
const low = Float32Array.from({ length: Math.floor(dm.length / 2) }, (_, i) => dm[2 * i]); // 22050 Hz for the tempo and key tools
const rhythm = measureRhythm(low, 22050);
const key = measureKey(low, 22050);
const driftMs = round(Math.max(...rhythm.driftMs.map(Math.abs)), 1);
const gridShiftMs = round(((((rhythm.beatOffset - BEAT_OFFSET) % BEAT_S) + 1.5 * BEAT_S) % BEAT_S - 0.5 * BEAT_S) * 1000, 1);
say(`the mix measured: ${rhythm.bpm.toFixed(3)} bpm, its grid ${gridShiftMs} ms from H's, drift ${driftMs} ms; key ${key.name} (${key.agreeing}/12 stretches, tuning ${key.tuningCents.toFixed(1)} cents)`);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// the motif: H's opening tune, measured (measure.mjs: the "other" stem's slow line over the strummed D drone, A4 F#4 E4 D4), has
// four distinct notes, fewer than six, so the six stars' tones are the brief's degrees 1 2 3 5 6 8 of D major in that tune's own
// register: D4 E4 F#4 A4 B4 D5, at H's measured tuning (rulings 5)
const TUNE = [{ note: 'A4', from: 0.7, to: 11.5 }, { note: 'F#4', from: 12.0, to: 17.4 }, { note: 'E4', from: 18.0, to: 22.3 }, { note: 'D4', from: 22.4, to: 23.4 }];
const MOTIF_MIDI = [62, 64, 66, 69, 71, 74];
const motif = MOTIF_MIDI.map(m => round(440 * 2 ** ((m - 69 + H_SONG.tuningCents / 100) / 12), 2));

// the cues: each friend's sound where it is laid (the deep tone has no cue of its own), her horn phrases, the band's accents,
// the roars, and a burst of shooting stars on the first band accent of each chorus bar that has one (and on each roar)
const CUE = { stomp: 'stomp', plate: 'plate', tail: 'tail', scratch: 'scratch' };
const cues = [
  ...laid.filter(e => CUE[e.kind]).map(e => ({ beat: e.beat, kind: CUE[e.kind], who: e.who })),
  ...hornBeats.map(beat => ({ beat, kind: 'horn', who: 'sloedla' })),
  ...hitBeats.map(beat => ({ beat, kind: 'hit' })),
  ...roars.map(beat => ({ beat, kind: 'roar', who: 'gramedla' })),
];
const burstBars = new Set();
for (const beat of [...hitBeats, ...roars].sort((a, b) => a - b)) {
  if (!isIn(beat, 'chorus') || burstBars.has(Math.floor(beat / BAR))) continue;
  burstBars.add(Math.floor(beat / BAR));
  cues.push({ beat, kind: 'burst' });
}
cues.sort((a, b) => a.beat - b.beat || a.kind.localeCompare(b.kind));

const seconds = round(n / SR, 3);
const tail = round(seconds - (BEAT_OFFSET + END_BEAT * BEAT_S), 3);
const render = {
  about: 'tools/hatid-lag/render.mjs: H (qa/remake/hatid/lag/hatid-h/song.mp3) as the festival plays it, and its beat map',
  bpm: BPM,
  beatOffset: BEAT_OFFSET,
  driftMs,
  key: keyNotes(key),
  keyName: { root: NAMES[key.tonic], mode: key.mode },
  tuningCents: round(key.tuningCents, 1),
  motif,
  motifNotes: MOTIF_MIDI.map(noteName),
  openingTune: TUNE,
  leadInSeconds: round(BEAT_OFFSET - 0.7, 3),
  seconds,
  endBeat: END_BEAT,
  tail,
  sections: SECTIONS,
  entries,
  solos: solosOf(),
  calls: callsOf(),
  cues,
  loudness: { lufs: loud.lufs, truePeak: loud.truePeak, lra: loud.lra, sections, bars, lastSecondDb },
  laid: laid.map(({ who, kind, beat, solo, midi }) => ({ who, kind, beat, ...(solo ? { solo } : {}), ...(midi !== undefined ? { note: noteName(midi) } : {}) })),
  roars,
  sources: SOURCES,
};
fs.writeFileSync(path.join(H, 'render.json'), JSON.stringify(render, null, 1) + '\n');
say('render.json');

// ---------------------------------------------------------------- checks
const untouched = { L: songL, R: songR };
const kSec = (st, id) => round(kLoud(st.L, st.R, ...span(id)), 1);
const parts = {};
for (const s of SECTIONS) {
  const row = { untouchedH: kSec(untouched, s.id), mix: kSec({ L: dl, R: dr }, s.id) };
  for (const st of STEMS) {
    const g = { L: new Float32Array(0), R: new Float32Array(0) };
    const [a, b] = span(s.id);
    g.L = Float32Array.from({ length: b - a }, (_, i) => stem[st].L[a + i] * stemGain[st][a + i] * lift[a + i] * gain);
    g.R = Float32Array.from({ length: b - a }, (_, i) => stem[st].R[a + i] * stemGain[st][a + i] * lift[a + i] * gain);
    row[st] = round(kLoud(g.L, g.R, 0, b - a), 1);
    row[`${st}InH`] = kSec(stem[st], s.id);
  }
  row.friends = round(kLoud(Float32Array.from(friends.L, v => v * gain), Float32Array.from(friends.R, v => v * gain), ...span(s.id)), 1);
  parts[s.id] = row;
}
// the small speaker: a tablet plays little under about 350 Hz; each section through a 2nd-order high-pass there, and the friends'
// sounds over 200 Hz against the mix over 200 Hz where they play
const hp = (x, hz, order = 2) => {
  const y = Float32Array.from(x);
  if (order === 2) new Biquad('hp', hz, Math.SQRT1_2).run(y);
  else for (const q of [0.5412, 1.3066]) new Biquad('hp', hz, q).run(y);
  return y;
};
const smallL = hp(dl, 350), smallR = hp(dr, 350);
const small = Object.fromEntries(SECTIONS.map(s => [s.id, round(lufs(smallL, smallR, { from: span(s.id)[0], to: span(s.id)[1] }), 2)]));
const fr200 = { L: hp(Float32Array.from(friends.L, v => v * gain * 1), 200, 4), R: hp(Float32Array.from(friends.R, v => v * gain), 200, 4) };
const mix200 = { L: hp(dl, 200, 4), R: hp(dr, 200, 4) };
const friendsOver200 = {};
for (const kind of ['stomp', 'plate', 'tail', 'scratch', 'deep']) {
  const list = laid.filter(e => e.kind === kind && !e.solo).slice(0, 12);
  const vals = list.map(e => kLoud(fr200.L, fr200.R, at(e.beat), at(e.beat) + Math.round(0.25 * SR)) - kLoud(mix200.L, mix200.R, at(e.beat), at(e.beat) + Math.round(0.25 * SR)));
  friendsOver200[kind] = vals.length ? round(median(vals), 1) : null;
}
// the choir's "s": how much of the vocals stem lies over 4.5 kHz
const voc = monoOf(stem.vocals);
const vocTop = hp(voc, 4500, 4);
const choirTopDb = round(db(rmsOf(vocTop, ...span('chorus')) / rmsOf(voc, ...span('chorus'))), 1);
// startle: every rise of the momentary loudness (400 ms, K-weighted) over 7 LU within 400 ms
const M = [];
for (let s = 0; s + 0.4 * SR <= dl.length; s += 0.1 * SR) M.push(kLoud(dl, dr, s, s + 0.4 * SR));
const jumps = [];
for (let i = 4; i < M.length; i++) if (M[i] - M[i - 4] > 7 && M[i] > -40) jumps.push({ lu: round(M[i] - M[i - 4]), sec: round(i * 0.1 + 0.4, 2), beat: round((i * 0.1 + 0.4 - BEAT_OFFSET) / BEAT_S, 2), from: round(M[i - 4]), to: round(M[i]) });
const jumpsKept = jumps.filter((j, k) => !jumps.some((q, m) => m !== k && Math.abs(q.sec - j.sec) < 0.4 && q.lu > j.lu));
// the mp3 against the float mix: the encoder's delay is taken out by the decoder
let bestLag = 0, best = -Infinity;
{
  const a = at(100), len = 2 * SR;
  for (let lag = -3000; lag <= 3000; lag += 1) {
    let s = 0;
    for (let i = 0; i < len; i += 4) s += mix.L[a + i] * dl[a + i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
}
// the calls' gaps: the tune (vocals + other at their gains) in the gap bar against the bar after, dB
const tuneLoud = (beat) => {
  const [a, b] = [at(beat), at(beat + BAR)];
  const L = Float32Array.from({ length: b - a }, (_, i) => (stem.vocals.L[a + i] * stemGain.vocals[a + i] + stem.other.L[a + i] * stemGain.other[a + i]));
  const R = Float32Array.from({ length: b - a }, (_, i) => (stem.vocals.R[a + i] * stemGain.vocals[a + i] + stem.other.R[a + i] * stemGain.other[a + i]));
  return kLoud(L, R, 0, b - a);
};
const callGaps = callsOf().map(c => ({ move: c.move, section: c.section, beat: c.beat, tuneGapLu: round(tuneLoud(c.beat) - tuneLoud(c.doBeat), 1) }));
const quietDrums = round(db(rmsOf(Float32Array.from({ length: span('quiet')[1] - at(part('quiet').startBeat + 1) }, (_, i) => { const j = at(part('quiet').startBeat + 1) + i; return 0.5 * (stem.drums.L[j] + stem.drums.R[j]) * stemGain.drums[j]; }), 0, span('quiet')[1] - at(part('quiet').startBeat + 1))), 1);

const checks = {
  layout: SECTIONS.map(s => ({ id: s.id, nameIs: s.nameIs, firstBar: s.startBeat / BAR, bars: s.beats / BAR, startSec: round(BEAT_OFFSET + s.startBeat * BEAT_S, 2), seconds: round(s.beats * BEAT_S, 2) })),
  grid: { bpm: BPM, beatOffset: BEAT_OFFSET, stemLagSamples: STEM_LAG, downbeat: `H's grid beat ${DOWNBEAT} mod 4`, mixBpm: round(rhythm.bpm, 3), mixGridShiftMs: gridShiftMs, driftMs, driftPerStretch: rhythm.driftMs, peakToNoise: round(rhythm.peakToNoise, 2) },
  key: { name: key.name, r: round(key.r, 3), runnerUp: key.runnerUp.name, agreeing: key.agreeing, tuningCents: round(key.tuningCents, 1) },
  loudness: { mix: loud, sectionsLufs: sections, sectionsBeforeLift: before, chorusOverDance: round(sections.chorus - sections.dance, 2), liftDb: { chorus: round(up, 2), dance: round(-down, 2) }, lastSecondDb, masterGainDb: round(db(gain), 2), limiterCeilingDb: round(ceiling, 2), limiterMostDb: round(db(mix.lim.most), 2), bars },
  stemsKept: keptLoud,
  sectionParts: parts,
  smallSpeaker: { sectionsLufsOver350Hz: small, chorusOverDanceOver350Hz: round(small.chorus - small.dance, 2), friendsOver200HzAgainstMixLu: friendsOver200, under30HzBeforeCutDb: round(sub30Before, 1), choirOver4k5Db: choirTopDb },
  jumpsMomentary: jumpsKept,
  mp3OffsetSamples: bestLag,
  callGaps,
  quietDrumsDbfs: quietDrums,
  hornBeats, hitBeats, bassNotes: bassNotes.map(m => (m === null ? null : noteName(m))),
  friendsLimiterMostDb: round(db(friendsLim.most), 2),
  levelsDb: Object.fromEntries(Object.entries(level).map(([k, g]) => [k, round(db(g), 2)])), roarDb: round(db(roarGain), 2),
  levelsUnderBandLu: { ...Object.fromEntries(Object.keys(UNDER).map(k => [k, round(UNDER[k] + db(level[k] / aimed[k]), 1)])), roarInChorus: round(-4 + db(roarGain / roarAimed), 1) },
  counts: { laid: laid.length, cues: Object.fromEntries([...new Set(cues.map(c => c.kind))].map(k => [k, cues.filter(c => c.kind === k).length])) },
};
fs.writeFileSync(path.join(H, 'checks.json'), JSON.stringify(checks, null, 1) + '\n');
console.log(JSON.stringify({ layout: checks.layout, loudness: { ...checks.loudness, bars: undefined }, smallSpeaker: checks.smallSpeaker, jumps: jumpsKept, callGaps, quietDrums, counts: checks.counts, grid: checks.grid, key: checks.key, mp3OffsetSamples: bestLag }, null, 1));
fs.rmSync(WORK, { recursive: true, force: true });
say('done');
