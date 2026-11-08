// smidur-a's entry in the chapter 5 song contest: "Skógarhljómsveitin", a storybook film orchestra synthesized in Node.
// `node remake/tools/kafli5-lag/smidur-a/render.mjs` writes, from scratch and deterministically, to
// qa/remake/kafli5/lag/keppni/smidur-a/: mix.mp3 (mastered, -16 LUFS, true peak <= -1 dBTP), stems/{pad,bass,beat,lead,animals}.mp3
// (unmastered, summing to the mix before its master), song.json, spectrogram.png and waveform.png.
// Options: --fast (skip the PNGs), --check (run check.mjs after).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SR, writeWav, encodeMp3, loudness, ffmpeg } from './lib/io.mjs';
import { seedOf, addTo, hall, eq, peakOf } from './lib/dsp.mjs';
import * as I from './lib/instruments.mjs';
import { call, TAKES, HLJOD } from './lib/takes.mjs';
import { compose, brightAt, SECTIONS, LOOP, END_BEAT, BPM, BEAT_SAMPLES, SPB } from './score.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
export const OUT = `${ROOT}qa/remake/kafli5/lag/keppni/smidur-a/`;
const TMP = `${OUT}tmp/`;
const args = new Set(process.argv.slice(2));
export const STEMS = ['pad', 'bass', 'beat', 'lead', 'animals'];
const TAIL_SEC = 4.6; // the last hit rings this long after beat 304 (no fade: the sounds end by themselves)

/** Each stem's level into the mix, its hall send, and its tone (tamed over 8 kHz). */
const STEM = {
  pad: { gain: 0.5, wet: 0.34, eq: [['highshelf', 7500, 0.7, -3], ['lp', 10000, 0.6]] },
  bass: { gain: 0.62, wet: 0.12, eq: [['lp', 6000, 0.7]] },
  beat: { gain: 0.62, wet: 0.2, eq: [['highshelf', 7000, 0.7, -3], ['lp', 9500, 0.6]] },
  lead: { gain: 0.52, wet: 0.26, eq: [['highshelf', 7500, 0.7, -2.5], ['lp', 10000, 0.6]] },
  animals: { gain: 0.6, wet: 0.2, eq: [['highshelf', 7000, 0.7, -3], ['lp', 9500, 0.6]] },
};
/** Where each instrument sits (orchestral seating, kept narrow enough for a tablet). */
function panOf(e) {
  switch (e.inst) {
    case 'strings':
      if (e.section === 'vln') return e.part === 'pad2' || e.part === 'desc' || e.part === 'trem2' ? -0.12 : -0.38;
      return { vla: 0.15, vc: 0.32, cb: 0.42 }[e.section];
    case 'brass': return { horn: -0.28, trumpet: 0.2, trombone: 0.32, tuba: 0.38 }[e.kind];
    case 'wind': return { flute: -0.08, piccolo: -0.14, clarinet: 0.1, oboe: 0.04, bassoon: 0.2 }[e.kind];
    case 'harp': return -0.48;
    case 'pizz': return e.part === 'cb' ? 0.38 : -0.2;
    case 'glock': return 0.3;
    case 'timpani': return -0.2;
    case 'granCassa': return 0.08;
    case 'cymbal': case 'cymbalSwell': return -0.1;
    case 'tambourine': return 0.22;
    case 'shaker': return -0.22;
    case 'triangle': return 0.3;
    case 'woodblock': return 0.18;
    case 'take': return { grazers: -0.28, turtles: -0.14, frogs: 0.04, lizards: 0.18, flyers: 0.3, sloedla: 0 }[e.group];
    default: return 0;
  }
}

/** Renders one event to { x (mono), at (sample where x starts) }. */
function renderEvent(e) {
  const dur = e.dur * SPB;
  const seed = seedOf(e.inst, e.kind ?? '', e.section ?? '', e.part ?? '', e.note ?? '', e.take ?? '', (e.beat % 16).toFixed(4), e.dur, e.vel.toFixed(4));
  const b0 = brightAt(e.beat) * (e.bright ?? 1);
  const bright = dur > 2 * SPB ? i => brightAt(e.beat + i / BEAT_SAMPLES) * (e.bright ?? 1) : b0;
  const at = Math.round(e.beat * BEAT_SAMPLES);
  const p = { f: e.f, dur, vel: e.vel, seed, bright };
  let x;
  switch (e.inst) {
    case 'strings':
      x = I.strings({ ...p, section: e.section, voices: e.voices, attack: e.attack, release: e.release, tremolo: e.tremolo,
        swell: e.swell, bite: e.bite, vibDepth: e.vibDepth });
      break;
    case 'pizz': x = I.pizz({ ...p, bright: b0, players: e.players }); break;
    case 'harp': x = I.harp({ ...p, bright: b0 }); break;
    case 'brass': x = I.brass({ ...p, kind: e.kind, swell: e.swell }); break;
    case 'wind': x = I.wind({ ...p, bright: b0, kind: e.kind, trill: e.trill }); break;
    case 'timpani': x = I.timpani({ ...p, bright: Math.min(1.2, b0) }); break;
    case 'granCassa': x = I.granCassa(p); break;
    case 'snare': x = I.snare({ ...p, bright: Math.min(1.1, b0) }); break;
    case 'cymbal': x = I.cymbal({ ...p, t60: e.t60 }); break;
    case 'cymbalSwell': x = I.cymbalSwell({ ...p, dur: e.swellSec }); break;
    case 'triangle': x = I.triangle(p); break;
    case 'glock': x = I.glock({ ...p, soft: e.soft }); break;
    case 'woodblock': x = I.woodblock({ ...p, f: e.pitch }); break;
    case 'tambourine': x = I.tambourine(p); break;
    case 'shaker': x = I.shaker(p); break;
    case 'take': {
      const seconds = e.take === 'horn-1' ? dur + 0.25 : dur + 0.06;
      const c = call(e.take, { target: e.f || null, seconds, fade: e.take === 'horn-1' ? 0.22 : 0.05, gain: e.vel });
      return { x: c.x, at: at - c.onset };
    }
    default: throw new Error(`no instrument ${e.inst}`);
  }
  return { x, at };
}

/** Renders the events (or those `keep` lets through) into the five stems, dry. */
export function renderStems(events, length, keep = () => true, offset = 0) {
  const stems = Object.fromEntries(STEMS.map(s => [s, [new Float32Array(length), new Float32Array(length)]]));
  for (const e of events) {
    if (!keep(e)) continue;
    const { x, at } = renderEvent(e);
    addTo(stems[e.stem], x, at - offset, STEM[e.stem].gain, panOf(e));
  }
  return stems;
}
/** Each stem's tone and its own hall (so the stems sum to the mix). */
export function finishStems(stems) {
  for (const s of STEMS) {
    const [L, R] = stems[s];
    eq(L, STEM[s].eq);
    eq(R, STEM[s].eq);
    const [wl, wr] = hall([L, R], { rt60: s === 'beat' ? 1.7 : 2.1 });
    for (let i = 0; i < L.length; i++) { L[i] += STEM[s].wet * wl[i]; R[i] += STEM[s].wet * wr[i]; }
  }
  return stems;
}

/** A lookahead peak limiter (3 ms), its ceiling in dBFS, its release 120 ms. */
function limit([L, R], ceilingDb) {
  const c = 10 ** (ceilingDb / 20);
  const n = L.length;
  const la = Math.round(0.003 * SR);
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    req[i] = a > c ? c / a : 1;
  }
  // window minimum over [i - la, i + la], then a moving average of half-width la/2
  const wmin = new Float32Array(n);
  const dq = new Int32Array(n);
  let h = 0;
  let t = 0;
  for (let i = 0; i < n + la; i++) {
    if (i < n) {
      while (t > h && req[dq[t - 1]] >= req[i]) t--;
      dq[t++] = i;
    }
    const centre = i - la;
    if (centre >= 0) {
      while (dq[h] < centre - la) h++;
      wmin[centre] = req[dq[h]];
    }
  }
  const half = Math.round(la / 2);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + wmin[i];
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    g[i] = (pre[b] - pre[a]) / (b - a);
  }
  const rel = 1 - Math.exp(-1 / (0.12 * SR));
  let prev = 1;
  let reduced = 0;
  for (let i = 0; i < n; i++) {
    const target = g[i];
    prev = target < prev ? target : prev + (target - prev) * rel;
    if (prev < 0.999) reduced++;
    L[i] *= prev;
    R[i] *= prev;
  }
  return reduced / n;
}

function main() {
  const t0 = Date.now();
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(`${OUT}stems`, { recursive: true });
  mkdirSync(TMP, { recursive: true });
  const { events, cues, chorusMelody } = compose();
  const length = Math.round(END_BEAT * BEAT_SAMPLES + TAIL_SEC * SR);
  console.log(`${events.length} events, ${(length / SR).toFixed(2)} s`);
  const stems = finishStems(renderStems(events, length));
  console.log(`stems rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // one common scale keeps the stems' sum: stems peak no higher than -3 dBFS
  const mixPre = [new Float32Array(length), new Float32Array(length)];
  for (const s of STEMS) for (let c = 0; c < 2; c++) { const a = stems[s][c]; const m = mixPre[c]; for (let i = 0; i < length; i++) m[i] += a[i]; }
  const stemPeak = Math.max(...STEMS.map(s => peakOf(stems[s])), peakOf(mixPre));
  const scale = 10 ** (-3 / 20) / stemPeak;
  for (const s of STEMS) for (const ch of stems[s]) for (let i = 0; i < length; i++) ch[i] *= scale;
  for (const ch of mixPre) for (let i = 0; i < length; i++) ch[i] *= scale;
  const peaks = {};
  for (const s of STEMS) {
    peaks[s] = 20 * Math.log10(peakOf(stems[s]));
    writeWav(`${TMP}${s}.wav`, stems[s]);
    encodeMp3(`${TMP}${s}.wav`, `${OUT}stems/${s}.mp3`);
  }
  writeWav(`${TMP}premaster.wav`, mixPre);
  // master: gain to -16 LUFS, then the limiter; measured again after the mp3
  const pre = loudness(`${TMP}premaster.wav`);
  let gainDb = -16 - pre.lufs;
  let ceiling = -2.0;
  let result = null;
  let reduced = 0;
  for (let pass = 0; pass < 4; pass++) {
    const g = 10 ** (gainDb / 20);
    const m = [Float32Array.from(mixPre[0], v => v * g), Float32Array.from(mixPre[1], v => v * g)];
    reduced = limit(m, ceiling);
    writeWav(`${TMP}mix.wav`, m);
    encodeMp3(`${TMP}mix.wav`, `${OUT}mix.mp3`);
    result = loudness(`${OUT}mix.mp3`);
    console.log(`master pass ${pass}: gain ${gainDb.toFixed(2)} dB, ceiling ${ceiling} -> ${result.lufs} LUFS, TP ${result.truePeak} dBTP, limited ${(100 * reduced).toFixed(2)}% of samples`);
    const okL = Math.abs(result.lufs + 16) <= 0.3;
    const okP = result.truePeak <= -1.1;
    if (okL && okP) break;
    if (!okP) ceiling -= result.truePeak + 1.2;
    gainDb += -16 - result.lufs;
  }
  // song.json
  const lengthSec = Number((length / SR).toFixed(3));
  const sections = SECTIONS.map(s => ({ ...s, startSec: Number((s.startBeat * SPB).toFixed(3)),
    beats: s.name === 'Home' ? Number((lengthSec / SPB - s.startBeat).toFixed(2)) : s.beats }));
  const used = new Set(events.filter(e => e.inst === 'take').map(e => e.take));
  const song = {
    slot: 'smidur-a',
    name: 'Skógarhljómsveitin',
    style: 'A storybook film orchestra synthesized in code (swelling strings, pizzicato, blooming brass, breathy woodwinds, timpani, harp glissandos) with the animals singing on top, like the joyful finale of an animated family film.',
    bpm: BPM,
    beatZeroSec: 0,
    key: 'F major',
    lengthSec,
    sections,
    chorusMelody,
    loop: { ...LOOP, startSec: Number((LOOP.startBeat * SPB).toFixed(3)), endSec: Number(((LOOP.startBeat + LOOP.beats) * SPB).toFixed(3)),
      note: 'Bars 6-9 (beats 24-40, samples 504000-840000 at 44.1 kHz). Bar 5 is the same as bar 9 in every stem, so what rings into the loop start is what rings out of its end.' },
    stems: Object.fromEntries(STEMS.map(s => [s, `stems/${s}.mp3`])),
    stemPeaksDb: Object.fromEntries(Object.entries(peaks).map(([k, v]) => [k, Number(v.toFixed(2))])),
    sources: [...used].sort().map(t => `${HLJOD}${t}.mp3 (${TAKES[t].licence})`),
    cues,
    loudness: { lufs: result.lufs, truePeak: result.truePeak, lra: result.lra },
    master: { gainDb: Number(gainDb.toFixed(2)), limiterCeilingDb: Number(ceiling.toFixed(2)), limitedFraction: Number(reduced.toFixed(5)) },
  };
  writeFileSync(`${OUT}song.json`, `${JSON.stringify(song, null, 2)}\n`);
  if (!args.has('--fast')) {
    ffmpeg(['-i', `${OUT}mix.mp3`, '-lavfi', 'showspectrumpic=s=1800x600:legend=1:scale=log:fscale=lin:stop=12000', `${OUT}spectrogram.png`]);
    ffmpeg(['-i', `${OUT}mix.mp3`, '-filter_complex', 'showwavespic=s=1800x400:split_channels=1:colors=0x3a6ea5|0x5a9e5a', '-frames:v', '1', `${OUT}waveform.png`]);
  }
  rmSync(TMP, { recursive: true, force: true });
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${result.lufs} LUFS, TP ${result.truePeak}, stem peaks ${JSON.stringify(song.stemPeaksDb)}`);
  if (args.has('--check')) spawnSync(process.execPath, [fileURLToPath(new URL('./check.mjs', import.meta.url))], { stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
