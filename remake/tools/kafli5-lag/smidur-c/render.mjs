// smidur-c: renders "Dansinn við tjörnina" from scratch, deterministically: the five stems, the mastered mix, song.json, the
// spectrogram and the waveform, then measures it all (check.mjs). `node remake/tools/kafli5-lag/smidur-c/render.mjs`
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SR, hz, stereo, mixIn, mixStereo, reverb, echo, svfLowpass, seedOf, writeWav, encodeMp3, peakOf } from './dsp.mjs';
import * as I from './instruments.mjs';
import * as A from './animals.mjs';
import { score, BPM, SPB, END_BEAT, TAIL_BEATS } from './score.mjs';
import { master } from './master.mjs';
import { checkAll } from './check.mjs';

const OUT = fileURLToPath(new URL('../../../../qa/remake/kafli5/lag/keppni/smidur-c/', import.meta.url));
mkdirSync(OUT + 'stems', { recursive: true });
const SPBs = 60 / BPM; // seconds a beat
const t0 = performance.now();
const log = (...a) => console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const song = score();
const LEN = Math.round((END_BEAT + TAIL_BEATS) * SPB);
const STEMS = ['pad', 'bass', 'beat', 'lead', 'animals'];
const bus = Object.fromEntries(STEMS.map(s => [s, { dry: stereo(LEN), send: stereo(LEN) }]));
const valley = stereo(LEN); // her horn's send to the valley echo
const dryAnimals = new Float32Array(LEN); // for the pitch and onset checks
const renders = []; // what the checks read: { e, y, at }

// the stems' own levels (into the pre-master sum)
const LEVEL = { pad: 0.75, bass: 0.62, beat: 0.55, lead: 0.5, animals: 0.6 };
const KIND_GAIN = { strum: 0.55, harp: 0.5, strings: 0.32, drone: 0.22, bass: 0.7, bodhran: 0.85, stomp: 0.8, clap: 0.55, riser: 0.4, fiddle: 1.5, whistle: 0.42, horn: 0.6, pick: 0.6, call: 0.62 };

const SHAPES = {
  bar: d => [[0, 0], [0.09, 0.7], [Math.max(0.1, d - 0.1), 1], [d + 0.3, 0]],
  swell: d => [[0, 0], [d * 0.6, 0.6], [d - 0.05, 1], [d + 0.4, 0]],
  slow: d => [[0, 0], [d * 0.4, 0.7], [d * 0.8, 1], [d + 1.2, 0]],
  rise: d => [[0, 0.25], [d, 1], [d + 0.15, 0]],
  end: d => [[0, 0], [0.06, 1], [0.7, 0.75], [d + 0.8, 0]],
};
const cache = new Map();
function renderEvent(e) {
  const seed = seedOf(e.kind, e.key ?? `${e.beat}|${e.f ?? ''}|${e.group ?? ''}`);
  const ck = e.key ? JSON.stringify({ ...e, beat: 0, gain: 0, pan: 0, send: 0 }) : null;
  if (ck && cache.has(ck)) return cache.get(ck);
  let y, pre = 0;
  switch (e.kind) {
    case 'fiddle': {
      const notes = e.notes.map(n => ({ t: n.b * SPBs, d: n.d * SPBs, f: A_hz(n.n), v: n.v, slur: n.slur, spic: n.spic, vib: n.vib, press: e.press }));
      y = I.fiddle(notes, { seed, cello: e.cello });
      break;
    }
    case 'whistle': {
      const notes = e.notes.map(n => ({ t: n.b * SPBs, d: n.d * SPBs, f: A_hz(n.n), v: n.v, slur: n.slur, orn: n.orn, up: n.up, vib: n.vib }));
      y = I.whistle(notes, { seed });
      break;
    }
    case 'harp': y = I.harp({ f: e.f, v: 0.8, seed }); break;
    case 'pick': y = I.strum([e.f], { v: 0.8, down: true, dur: e.beats * SPBs + 0.5, damp: e.beats * SPBs + 0.25, seed, bright: 0.62, t60: 1.2 }); break;
    case 'strum': y = I.strum(e.freqs, { v: e.v, down: e.down, dur: e.dampBeats * SPBs + 0.25, damp: e.dampBeats * SPBs, seed, spread: e.down ? 0.011 : 0.008 }); break;
    case 'bass': y = I.bass({ f: e.f, d: e.beats * SPBs, v: e.v, seed }); break;
    case 'bodhran': y = I.bodhran({ v: e.v, tone: e.tone, up: e.up, seed }); break;
    case 'stomp': y = I.stomp({ v: e.v, seed }); break;
    case 'clap': y = I.clap({ v: e.v, seed }); break;
    case 'riser': y = I.riser({ dur: e.beats * SPBs, seed, v: e.v }); break;
    case 'drone': y = I.drone(e.freqs, { dur: e.beats * SPBs, attack: e.attack, release: e.release, seed }); break;
    case 'strings': {
      const d = e.beats * SPBs;
      const shape = SHAPES[e.shape](d);
      const dur = shape[shape.length - 1][0];
      const a = I.strings(e.freqs, { dur, shape, seed, players: 3, tremolo: e.tremolo });
      const b = I.strings(e.freqs, { dur, shape, seed: seed + 1, players: 3, tremolo: e.tremolo });
      y = { stereo: [a, b] };
      break;
    }
    case 'call': {
      const c = A.call(e.group, { long: e.long, heard: e.beats * SPBs * 0.9 });
      const keep = Math.min(c.y.length, c.onset + Math.round(e.beats * SPB * 0.96));
      // a call that must not reach back over a boundary (the loop's end) starts on its beat
      const from = e.noPreroll ? c.onset : 0;
      y = c.y.slice(from, keep);
      if (from) for (let i = 0; i < 132 && i < y.length; i++) y[i] *= i / 132;
      const rel = Math.min(Math.round(0.05 * SR), y.length);
      for (let i = 0; i < rel; i++) y[y.length - 1 - i] *= i / rel;
      pre = c.onset - from;
      break;
    }
    case 'horn': {
      const h = A.horn(e.f);
      const keep = Math.min(h.y.length, h.onset + Math.round(e.beats * SPB * 0.98));
      y = h.y.slice(0, keep);
      const rel = Math.min(Math.round(0.12 * SR), y.length);
      for (let i = 0; i < rel; i++) y[y.length - 1 - i] *= (i / rel) ** 1.5;
      pre = h.onset;
      break;
    }
    default: throw new Error(`no kind ${e.kind}`);
  }
  const out = { y, pre };
  if (ck) cache.set(ck, out);
  return out;
}
const NOTE = /^([A-G])([b#]?)(-?\d)$/;
function A_hz(n) { if (typeof n === 'number') return n; if (!NOTE.test(n)) throw new Error(n); return hz(n); }

log(`score: ${song.events.length} events, ${LEN} samples (${(LEN / SR).toFixed(2)} s)`);
let k = 0;
for (const e of song.events) {
  const { y, pre } = renderEvent(e);
  const at = Math.round(e.beat * SPB) - Math.round(pre);
  const g = (e.gain ?? 1) * (KIND_GAIN[e.kind] ?? 1);
  const b = bus[e.stem];
  if (y.stereo) {
    mixIn(b.dry, y.stereo[0], at, g, -0.45 + (e.pan ?? 0)); mixIn(b.dry, y.stereo[1], at, g, 0.45 + (e.pan ?? 0));
    mixIn(b.send, y.stereo[0], at, g * e.send, -0.45); mixIn(b.send, y.stereo[1], at, g * e.send, 0.45);
  } else {
    mixIn(b.dry, y, at, g, e.pan ?? 0);
    mixIn(b.send, y, at, g * (e.send ?? 0.2), e.pan ?? 0);
    if (e.kind === 'horn' && e.valley) mixIn(valley, y, at, g, 0);
    if (e.kind === 'call') {
      for (let i = 0; i < y.length; i++) { const j = at + i; if (j >= 0 && j < LEN) dryAnimals[j] += y[i] * g; }
      renders.push({ e, at, len: y.length, pre, y, g });
    }
    if (e.kind === 'whistle' && /^tune/.test(e.key ?? '')) renders.push({ e, at, y });
  }
  if (++k % 400 === 0) log(`rendered ${k}/${song.events.length}`);
}
log('events rendered; brightness arcs, reverbs, the valley echo');

// the pad's brightness arc: dark as the forest wakes, open in the dance and the choruses, dark in the middle, opening through the
// build, wide open in the final choruses, closing a little as it walks home (constant over the loop and the bar before it)
const ARC = [[0, 700], [8, 2200], [20, 6500], [40, 6500], [41, 9000], [72, 9000], [73, 6000], [104, 6000], [105, 10000], [136, 10000],
  [137, 7000], [184, 7000], [185, 1800], [216, 1500], [232, 12000], [296, 12000], [304, 6000], [999, 6000]];
const arc = i => {
  const beat = i / SPB;
  for (let s = 0; s + 1 < ARC.length; s++) {
    const [b0, f0] = ARC[s], [b1, f1] = ARC[s + 1];
    if (beat <= b1) return f0 * (f1 / f0) ** Math.min(1, Math.max(0, (beat - b0) / (b1 - b0)));
  }
  return 6000;
};
for (const part of [bus.pad.dry, bus.pad.send]) for (const ch of part) svfLowpass(ch, arc, 0.6);

const VERB = {
  pad: { rt60: 2.1, damp: 0.35, size: 1.1 }, bass: { rt60: 1.2, damp: 0.5, size: 0.8 }, beat: { rt60: 1.1, damp: 0.45, size: 0.8 },
  lead: { rt60: 1.9, damp: 0.38, size: 1.05 }, animals: { rt60: 1.6, damp: 0.4, size: 1 },
};
const stems = {};
for (const s of STEMS) {
  const wet = reverb(bus[s].send, VERB[s]);
  const out = bus[s].dry;
  mixStereo(out, wet, 0, 1);
  stems[s] = out;
}
// the valley: her horn comes back a bar later, darker, from the other side, and once more fainter
const vm = new Float32Array(LEN); for (let i = 0; i < LEN; i++) vm[i] = (valley[0][i] + valley[1][i]) * 0.5;
const vEcho = echo(vm, { delay: 4 * SPB, feedback: 0.42, lp: 2000, repeats: 2, pan: 0.7, gain: 0.42 });
const vWet = reverb(vEcho, { rt60: 2.8, damp: 0.5, size: 1.3 });
mixStereo(stems.lead, vEcho, 0, 1); mixStereo(stems.lead, vWet, 0, 0.6);
log('stems mixed');

// stem levels, then one scale for all so the pre-master sum has headroom
for (const s of STEMS) for (const ch of stems[s]) for (let i = 0; i < LEN; i++) ch[i] *= LEVEL[s];
const sum = stereo(LEN);
for (const s of STEMS) mixStereo(sum, stems[s]);
const sp = peakOf(sum);
const scale = 0.7 / sp;
for (const s of [...STEMS.map(n => stems[n]), sum]) for (const ch of s) for (let i = 0; i < LEN; i++) ch[i] *= scale;
const stemPeaks = Object.fromEntries(STEMS.map(s => [s, 20 * Math.log10(peakOf(stems[s]))]));
log('pre-master peak', (20 * Math.log10(peakOf(sum))).toFixed(2), 'dBFS; stem peaks', JSON.stringify(Object.fromEntries(Object.entries(stemPeaks).map(([a, b]) => [a, +b.toFixed(2)]))));

// write the stems
const TMP = OUT + 'tmp/'; mkdirSync(TMP, { recursive: true });
for (const s of STEMS) { writeWav(TMP + `${s}.wav`, stems[s]); encodeMp3(TMP + `${s}.wav`, OUT + `stems/${s}.mp3`); }
writeWav(TMP + 'premaster.wav', sum);
log('stems written');

// master: tame the top, glue, limit, -16 LUFS
const { mix, lufs, truePeak } = master(sum, TMP);
writeWav(TMP + 'mix.wav', mix);
encodeMp3(TMP + 'mix.wav', OUT + 'mix.mp3');
log('mix written');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', OUT + 'mix.mp3', '-lavfi', 'showspectrumpic=s=1600x700:legend=1:scale=log:fscale=lin:stop=12000', OUT + 'spectrogram.png']);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', OUT + 'mix.mp3', '-filter_complex', 'showwavespic=s=1600x400:split_channels=0:filter=peak:colors=0x3a7bd5', '-frames:v', '1', OUT + 'waveform.png']);

// song.json
const secs = b => +(b * SPBs).toFixed(3);
const json = {
  slot: 'smidur-c',
  name: 'Dansinn við tjörnina',
  style: 'A joyful Nordic-Celtic folk reel in 4/4: synthesized fiddle, tin whistle, guitar, harp, bodhrán, stomps, claps, drone and swelling strings, with the animals answering in call and response.',
  bpm: BPM, beatZeroSec: 0, key: 'F major', lengthSec: +(LEN / SR).toFixed(3),
  sections: song.sections.map(s => ({ ...s, startSec: secs(s.startBeat) })),
  chorusMelody: song.melody,
  loop: { ...song.loop, startSec: secs(song.loop.startBeat), endSec: secs(song.loop.startBeat + song.loop.beats), what: 'bars 7-10: the full groove with the fiddle riff; the animals stem is silent there, so Egill\'s taps are the animals; the bar before the loop is the same as its last bar, so it wraps without a seam' },
  cues: song.cues,
  stems: Object.fromEntries(STEMS.map(s => [s, `stems/${s}.mp3`])),
  sources: [...new Set(renders.filter(r => r.e.kind === 'call').map(r => A.TAKES[r.e.group][r.e.long ? 'long' : 'short'].file)), A.HORN.file]
    .sort().map(f => `remake/assets/audio/kafli5/hljod/${f} (${A.licence(f)})`),
  synthesized: 'Everything else is synthesized in remake/tools/kafli5-lag/smidur-c (no samples): fiddle (waveguide bowed string), tin whistle, guitar, harp and double bass (Karplus-Strong), bodhrán (modal), stomps, claps, reed drone, string section, reverb.',
  loudness: { lufs, truePeak },
};
writeFileSync(OUT + 'song.json', JSON.stringify(json, null, 2) + '\n');
log('song.json written');
const report = checkAll({ OUT, song, json, stems, dryAnimals, renders, LEN, stemPeaks });
writeFileSync(OUT + 'check.json', JSON.stringify(report, null, 2) + '\n');
rmSync(TMP, { recursive: true, force: true });
log('done');
