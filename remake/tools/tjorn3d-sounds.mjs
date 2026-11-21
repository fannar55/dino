#!/usr/bin/env node
// Uggeðla í tjörninni's recordings (step 3b): the real water the owner said yes to fetching (2026-11-21, "Já, sækja": eight Freesound
// HQ previews, all CC0 1.0), cut, shaped and levelled by measure into remake/assets/audio/tjorn3d/hljod/, with their entries in
// sounds.json "files" (what each is in the show, where it came from, its licence, the fingerprints of source and cut, and what was
// done to it, in words and numbers) and tjorn3d/CREDITS.md made from the same list. The show plays them in its slots
// (chapters/tjorn3d/sound.js SLOTS, where their levels are).
//
//   node remake/tools/tjorn3d-sounds.mjs [--sources <folder>]            make every file from its source
//   node remake/tools/tjorn3d-sounds.mjs --only rise.mp3,frog-1.mp3      make only these; the rest stay as they are
//   node remake/tools/tjorn3d-sounds.mjs --dry                           print what it would make
//   node remake/tools/tjorn3d-sounds.mjs --measure                       measure the files that are there (no source needed)
//   node remake/tools/tjorn3d-sounds.mjs --credits                       write CREDITS.md alone, from sounds.json as it is (no source
//                                                                        needed, nothing cut again): its lines section names the show's
//                                                                        lines (chapters/tjorn3d/sound.js LINES), which the game's voice
//                                                                        tools make, not this one
//
// The sources are not in the repo (git ignores qa/): <folder>/<id>-<use>/<id>-hq.mp3 with <folder>/sources.json beside them (title,
// author, page, preview, licence, sourceSha256), by default qa/tjorn3d/hljod/heimildir. They are data from the web: only ffmpeg and
// ffprobe open them (this tool reads their bytes for the fingerprint and no more, and works on the samples ffmpeg hands it), and
// nothing is run from their folders. ffmpeg and ffprobe must be on the PATH.
//
// One-shots are mono, 44.1 kHz, 96 kbps, their peak at SHOT_PEAK dBFS; the bed is stereo (its two sides are only half alike,
// which is what makes a wash wide on a tablet's two speakers) at 128 kbps, levelled by its loudness. Every file is written without
// tags or dates, so the same sources and the same ffmpeg give the same bytes.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOTS, SOUND, LINES } from '../chapters/tjorn3d/sound.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCES = 'qa/tjorn3d/hljod/heimildir';
export const OUT = 'remake/assets/audio/tjorn3d/hljod';
const CREDITS = 'remake/assets/audio/tjorn3d/CREDITS.md';
const RATE = 44100;
const SHOT_PEAK = -3; // dBFS of a one-shot's peak: the show sets its level from there
const BED_RMS = -24; // dBFS of the bed's loudness (each side)
const ROLL = 0.25; // s of the loop laid before its start and after its end (see pond)

// ---------------------------------------------------------------------------------------------
// ffmpeg, and samples

function run(tool, args, input = undefined) {
  const result = spawnSync(tool, args, { input, maxBuffer: 1 << 30 });
  if (result.error) throw new Error(`${tool} could not be run: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${tool} failed: ${String(result.stderr).trim().split('\n').pop()}`);
  return result.stdout;
}
const split = (buffer, n) => {
  const bytes = new Uint8Array(buffer); // (a copy: its own memory, from its start)
  const all = new Float32Array(bytes.buffer, 0, bytes.byteLength >> 2);
  return Array.from({ length: n }, (_, c) => Float32Array.from({ length: Math.floor(all.length / n) }, (_, i) => all[i * n + c]));
};
const join = channels => {
  const n = channels.length, out = new Float32Array(channels[0].length * n);
  for (let c = 0; c < n; c++) for (let i = 0; i < channels[c].length; i++) out[i * n + c] = channels[c][i];
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
};
/** A number of a file's first sound stream, as ffprobe gives it (it may end the line with a comma). */
function probe(file, entry) {
  const value = parseInt(String(run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', `stream=${entry}`, '-of', 'csv=p=0', file])), 10);
  if (!Number.isFinite(value)) throw new Error(`ffprobe gave no ${entry} for ${file}`);
  return value;
}
const sourceRate = file => probe(file, 'sample_rate');

/**
 * Seconds `from` to `to` of a sound file as samples at RATE: `speed` under 1 plays it slower and lower (size comes from slowness
 * and pitch), `filters` are ffmpeg's, after the speed. One array a channel.
 */
function decode(file, { from = 0, to = null, speed = 1, filters = [], channels = 1 } = {}) {
  // (the filters before the cut, so that they have settled when it begins; the cut's seconds are the source's own)
  const chain = [];
  if (speed !== 1) chain.push(`asetrate=${Math.round(sourceRate(file) * speed)}`);
  chain.push(`aresample=${RATE}`, ...filters);
  if (from || to !== null) chain.push(`atrim=${(from / speed).toFixed(5)}${to !== null ? `:${(to / speed).toFixed(5)}` : ''}`, 'asetpts=PTS-STARTPTS');
  return split(run('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-af', chain.join(','), '-f', 'f32le', '-ac', String(channels), '-ar', String(RATE), '-']), channels);
}
/** Samples through ffmpeg filters. */
const through = (channels, filter) => split(run('ffmpeg', ['-v', 'error', '-f', 'f32le', '-ar', String(RATE), '-ac', String(channels.length), '-i', '-', '-af', filter, '-f', 'f32le', '-ac', String(channels.length), '-ar', String(RATE), '-'], join(channels)), channels.length);
/** Samples written as an MP3 with no tags and no dates. */
function encode(channels, out, kbps) {
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', String(channels.length), '-i', '-', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
    '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-ar', String(RATE), '-ac', String(channels.length), '-id3v2_version', '0', out], join(channels));
}

const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const lin = d => 10 ** (d / 20);
const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;
const r3 = x => Math.round(x * 1000) / 1000;
const at = seconds => Math.round(seconds * RATE);
const peakOf = channels => channels.reduce((most, ch) => { let m = most; for (const v of ch) { const a = Math.abs(v); if (a > m) m = a; } return m; }, 0);
const rmsOf = (channels, from = 0, to = channels[0].length) => {
  let sum = 0;
  for (const ch of channels) for (let i = from; i < to; i++) sum += ch[i] * ch[i];
  return Math.sqrt(sum / (channels.length * Math.max(1, to - from)));
};
const scale = (channels, gain) => channels.map(ch => ch.map(v => v * gain));
/** The second, in a stretch of one channel, of the window (`seconds` long) with the most in it. */
function loudestAt(channel, from, to, seconds = 0.02) {
  const n = at(seconds);
  let best = at(from), most = -1;
  for (let s = at(from); s + n <= Math.min(channel.length, at(to)); s += n >> 1) {
    let sum = 0;
    for (let i = s; i < s + n; i++) sum += channel[i] * channel[i];
    if (sum > most) { most = sum; best = s; }
  }
  return (best + n / 2) / RATE;
}
/** The first second, in a stretch of one channel, whose 10 ms window is louder than `over` dBFS. */
function firstOver(channel, from, to, over) {
  const n = at(0.01);
  for (let s = at(from); s + n <= Math.min(channel.length, at(to)); s += n) if (db(rmsOf([channel], s, s + n)) > over) return s / RATE;
  return null;
}
/** In place: up from nothing over `seconds` at the start; down to nothing over the last `seconds` (a quarter of a sine, or straight). */
function fadeIn(channels, seconds, curve = 'sine') {
  const n = Math.min(at(seconds), channels[0].length);
  for (const ch of channels) for (let i = 0; i < n; i++) ch[i] *= curve === 'sine' ? Math.sin((Math.PI / 2) * (i / n)) : i / n;
  return channels;
}
function fadeOut(channels, seconds, curve = 'sine') {
  const length = channels[0].length, n = Math.min(at(seconds), length);
  for (const ch of channels) for (let i = 0; i < n; i++) ch[length - n + i] *= curve === 'sine' ? Math.cos((Math.PI / 2) * (i / n)) : 1 - i / n;
  return channels;
}
/** Two sounds as one: `b` laid over `a` from `offset` s, as long as the longer. */
function mix(a, b, offset = 0) {
  const start = at(offset), length = Math.max(a[0].length, start + b[0].length);
  return a.map((ch, c) => { const out = new Float32Array(length); out.set(ch); for (let i = 0; i < b[c].length; i++) out[start + i] += b[c][i]; return out; });
}
/** `a`, then `b`, the last `seconds` of the one passing into the first of the other at equal power (two unlike noises keep their loudness). */
function crossfade(a, b, seconds) {
  const n = at(seconds);
  return a.map((ch, c) => {
    const out = new Float32Array(ch.length + b[c].length - n);
    out.set(ch.subarray(0, ch.length - n));
    for (let i = 0; i < n; i++) { const u = i / n; out[ch.length - n + i] = ch[ch.length - n + i] * Math.cos((Math.PI / 2) * u) + b[c][i] * Math.sin((Math.PI / 2) * u); }
    out.set(b[c].subarray(n), ch.length);
    return out;
  });
}
/** The peaks shaved: brought to full scale, through a limiter that holds them `shave` dB under it, and what that took off the peak. */
function limit(channels, shave) {
  const full = scale(channels, 1 / peakOf(channels));
  const out = through(full, `alimiter=level_in=1:level_out=1:limit=${lin(-shave).toFixed(4)}:attack=3:release=60:level=0:latency=1`);
  return { channels: out, took: r1(-db(peakOf(out))) };
}
const toPeak = (channels, peak) => scale(channels, lin(peak) / peakOf(channels));

// ---- measures of a finished sound (what `done` and --measure say) ----
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const wr = Math.cos((-2 * Math.PI) / len), wi = Math.sin((-2 * Math.PI) / len);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
        const next = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = next;
      }
    }
  }
}
const EDGES = [0, 150, 500, 2000, 6000, RATE / 2];
/** Percent of a sound's energy in each band of EDGES (the mean of its channels). */
function bands(channels) {
  const N = 4096, sums = new Array(EDGES.length - 1).fill(0);
  const mono = Float32Array.from(channels[0], (_, i) => channels.reduce((s, ch) => s + ch[i], 0) / channels.length);
  for (let s = 0; s < Math.max(1, mono.length - N / 2); s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (mono[s + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 1; k < N / 2; k++) { const f = (k * RATE) / N; sums[EDGES.findIndex((edge, e) => f >= edge && f < EDGES[e + 1])] += re[k] * re[k] + im[k] * im[k]; }
  }
  const total = sums.reduce((a, b) => a + b, 0) || 1;
  return sums.map(v => Math.round((100 * v) / total));
}
/** The loudness of the loudest `seconds` of a sound. */
function loudest(channels, seconds = 0.4) {
  const n = Math.min(at(seconds), channels[0].length);
  let most = 0;
  for (let s = 0; s + n <= channels[0].length; s += n >> 2) most = Math.max(most, rmsOf(channels, s, s + n));
  return most;
}
function measured(file) {
  const n = probe(file, 'channels');
  const channels = decode(file, { channels: n });
  const step = at(0.25);
  const envelope = [];
  for (let s = 0; s < channels[0].length; s += step) envelope.push(Math.round(db(rmsOf(channels, s, Math.min(channels[0].length, s + step)))));
  return { seconds: r3(channels[0].length / RATE), channels: n, peak: r1(db(peakOf(channels))), rms: r1(db(rmsOf(channels))), loudest: r1(db(loudest(channels))), bands: bands(channels), envelope };
}

// ---------------------------------------------------------------------------------------------
// The cuts. Each takes src(id) (the path of a source) and returns { channels, kbps, done, loop? }: the sound, and what was done.

const HIGH = 'highpass=f=%:poles=2,highpass=f=%:poles=2'; // the room's rumble and the wind's off: a tablet's speakers give nothing of it but its harm
const high = hz => HIGH.replaceAll('%', hz);
const shares = channels => { const b = bands(channels); return `${b[0]} % of its energy under 150 Hz, ${b[4]} % over 6 kHz`; };

export const SOUNDS = {
  // ---- the bed ----
  'pond.mp3': {
    slot: 'pond', sources: ['573823'],
    what: 'the bed: the pond\'s still air and water, wind in the reeds far off; a loop',
    make(src) {
      // The recording is 85 s of an even reed-wind wash with small ticks of water all through it, over a rumble (61 % of its energy
      // lies under 80 Hz) and with geese: loud calls at 46-50 s, far ones at 57-60 s and 80-81 s, gusts at 4-6, 19-25 and 41-44 s,
      // a click at 30.7 s. Its two even stretches without a call or a gust are joined into one loop.
      const first = [60.45, 80.35], second = [50.2, 57.1], cross = 1.2, shelf = [4000, -9], ceiling = 17;
      const filters = [high(180), `highshelf=f=${shelf[0]}:g=${shelf[1]}`];
      const before = bands(decode(src('573823'), { from: first[0], to: first[1], filters: [high(180)], channels: 2 }));
      const a = decode(src('573823'), { from: first[0], to: first[1], filters, channels: 2 });
      const b = decode(src('573823'), { from: second[0], to: second[1], filters, channels: 2 });
      // one after the other, and the end passing into the start: what plays round has no seam
      const both = crossfade(a, b, cross);
      const n = at(cross), length = both[0].length - n;
      let loop = both.map(ch => {
        const out = ch.slice(0, length);
        for (let i = 0; i < n; i++) { const u = i / n; out[i] = ch[i] * Math.sin((Math.PI / 2) * u) + ch[length + i] * Math.cos((Math.PI / 2) * u); }
        return out;
      });
      // the few ticks that stand far out of the wash (a plop that would be known the second time round) are turned down to the others
      const wash = rmsOf(loop), win = at(0.01), ramp = at(0.03);
      const gain = new Float32Array(length).fill(1);
      let tamed = 0, most = 0;
      for (let s = 0; s + win <= length; s += win) {
        const peak = peakOf(loop.map(ch => ch.subarray(s, s + win)));
        const over = db(peak / wash) - ceiling;
        if (over <= 0) continue;
        tamed++; most = Math.max(most, over);
        const g = lin(-over);
        for (let i = Math.max(0, s - ramp); i < Math.min(length, s + win + ramp); i++) {
          const w = i < s ? 0.5 - 0.5 * Math.cos((Math.PI * (i - (s - ramp))) / ramp) : i >= s + win ? 0.5 + 0.5 * Math.cos((Math.PI * (i - (s + win))) / ramp) : 1;
          gain[i] = Math.min(gain[i], 1 - (1 - g) * w);
        }
      }
      loop = loop.map(ch => ch.map((v, i) => v * gain[i]));
      // its two sides made as loud as each other, and the whole to the bed's loudness
      const sides = loop.map(ch => rmsOf([ch]));
      const lean = r1(db(sides[0] / sides[1]));
      loop = loop.map((ch, c) => scale([ch], lin(BED_RMS) / sides[c])[0]);
      const raised = r1(BED_RMS - db(Math.sqrt((sides[0] ** 2 + sides[1] ** 2) / 2)));
      let l = 0, r = 0, lr = 0;
      for (let i = 0; i < length; i++) { l += loop[0][i] ** 2; r += loop[1][i] ** 2; lr += loop[0][i] * loop[1][i]; }
      // a little of the loop before its start and after its end: wherever a browser's decoder lays the MP3's first sample, the
      // stretch the show plays round (from ROLL s, the loop's length) lies whole inside what repeats
      const roll = at(ROLL);
      const rolled = loop.map(ch => { const out = new Float32Array(length + 2 * roll); out.set(ch.subarray(length - roll)); out.set(ch, roll); out.set(ch.subarray(0, roll), roll + length); return out; });
      const seconds = r3(length / RATE);
      return {
        channels: rolled, kbps: 128, loop: [ROLL, seconds],
        done: `An 84.8 s recording of a pond, stereo 48 kHz: an even wash of wind in reeds with small ticks of water, over a rumble, with geese calling at 46 to 50 s (far ones at 57 to 60 s and at 80 s) and gusts at 4 to 6, 19 to 25 and 41 to 44 s. ` +
          `Its two even stretches with no call and no gust, ${first[0]} to ${first[1]} s and ${second[0]} to ${second[1]} s, joined with a ${cross} s crossfade at equal power and the end passed into the start the same way: a loop of ${seconds} s. ` +
          `${180} Hz high-pass (the rumble, which a tablet does not play), ${-shelf[1]} dB off above ${shelf[0] / 1000} kHz (the reeds' hiss: ${before[4]} % of its energy lay over 6 kHz, now ${bands(loop)[4]} %), ` +
          `${tamed} ticks more than ${ceiling} dB over the wash turned down to that (the most by ${r1(most)} dB: a plop at 73.3 s that would be known the second time round), ` +
          `the left side was ${Math.abs(lean)} dB ${lean > 0 ? 'louder' : 'softer'} than the right and the two are made as loud as each other (they are only half alike, correlation ${r2(lr / Math.sqrt(l * r))}, which is what makes a wash wide: it stays stereo), ` +
          `raised ${raised} dB to ${BED_RMS} dBFS RMS. ${ROLL} s of the loop's end is laid before it and ${ROLL} s of its start after it, and the show plays round from ${ROLL} s for ${seconds} s, so that no decoder's padding falls in the round. ` +
          `MP3 128 kbps stereo 44.1 kHz with ffmpeg / libmp3lame.`,
      };
    },
  },

  // ---- her head rises ----
  'rise.mp3': {
    slot: 'rise', sources: ['144272', '679410'],
    what: 'her head rises out of the water: a body lifting out of water, the water breaking and pouring off it, the first drips',
    make(src) {
      // Two recordings as one. The body: a person getting out of a bath (144272, mono), small splashes at 9.15 and 9.65 s, the
      // heave at 9.9 s, the water pouring off to 11.7 s, drips after. The break: a head coming up out of water (679410, the same on
      // both sides), muffled swells from 3.6 s (the uploader's filter), the surface breaking at 4.5 s, bright run-off to 5.6 s,
      // drips to 9.5 s. Both slower and lower, for size (modestly: these are MP3 previews, and slowness dulls them); the body's
      // heave a second in, the break just after it, so the pouring peaks after the surge.
      const body = { speed: 0.88, lead: 1.0, until: 13.4, gain: 0 }, top = { speed: 0.92, lead: 1.12, until: 7.6, gain: -4 };
      const shave = 9, out = 1.6, lead = { gain: 5, holds: 0.55, gone: 0.85 };
      const heave = loudestAt(decode(src('144272'), { from: 9.4, to: 10.4 })[0], 0, 1) + 9.4;
      const breaks = loudestAt(decode(src('679410'), { from: 4.2, to: 4.9 })[0], 0, 0.7) + 4.2;
      const cut = (id, { speed, lead, until }, event) => { const from = r3(event - lead * speed); return { from, channels: decode(src(id), { from, to: until, speed, filters: [high(150)] }) }; };
      const a = cut('144272', body, heave), b = cut('679410', top, breaks);
      const highsBefore = bands(decode(src('144272'), { from: a.from, to: body.until, filters: [high(150)] }))[4];
      const mixed = mix(fadeIn(scale(a.channels, lin(body.gain)), 0.06), fadeIn(scale(b.channels, lin(top.gain)), 0.06));
      // the small splashes before the heave are raised, so that the water is heard to move from the first moment and the surge
      // has something to grow out of: by lead.gain dB until lead.holds s, then less, and as it was from lead.gone s
      for (const ch of mixed) for (let i = 0; i < Math.min(ch.length, at(lead.gone)); i++) ch[i] *= lin(lead.gain * Math.min(1, (lead.gone - i / RATE) / (lead.gone - lead.holds)));
      fadeOut(mixed, out);
      const { channels: limited, took } = limit(mixed, shave);
      const channels = toPeak(limited, SHOT_PEAK);
      const fullest = r2(loudestAt(channels[0], 0, 3, 0.2));
      return {
        channels, kbps: 96,
        done: `Two recordings mixed. The body: a person getting out of a bath (18.4 s, mono 48 kHz; the heave measured at ${r2(heave)} s), from ${a.from} to ${body.until} s, played at ${body.speed} of its speed (slower and ${r1(-12 * Math.log2(body.speed))} semitones lower, for size), so the heave is ${body.lead} s in. ` +
          `The break: a head coming up out of water (10.8 s, the same on both sides; the surface breaks at ${r2(breaks)} s), from ${b.from} to ${top.until} s at ${top.speed} of its speed, ${-top.gain} dB under the body, its break ${top.lead} s in: the pouring peaks just after the surge. ` +
          `150 Hz high-pass on both, 60 ms fade-in, the first ${lead.holds} s raised ${lead.gain} dB and less from there to ${lead.gone} s (the small splashes before the heave: the water moves from the first moment, and the surge grows out of it), the last ${out} s faded out, the peaks shaved ${took} dB by a limiter (a splash's one sample is not its loudness), the peak then at ${SHOT_PEAK} dBFS. ` +
          `Its fullest 0.2 s is ${fullest} s in; ${shares(channels)} (the body alone had ${highsBefore} % over 6 kHz before it was slowed). MP3 96 kbps mono 44.1 kHz with ffmpeg / libmp3lame.`,
      };
    },
  },

  // ---- the water running off her, dripping back ----
  'drips.mp3': {
    slot: 'drips', sources: ['138073'],
    what: 'the water still running off her and dripping back through the hold, thinning',
    make(src) {
      // A wet mop held over a bucket: heavy run-off from 0.3 to 3 s, thinning to single drips by 6 s (new wringings after: left out).
      const from = 0.2, to = 6.05, thins = 2.9, shave = 4;
      const cut = decode(src('138073'), { from, to, filters: [high(200)] });
      fadeIn(cut, 0.05);
      fadeOut(cut, to - from - thins, 'straight');
      const { channels: limited, took } = limit(cut, shave);
      const channels = toPeak(limited, SHOT_PEAK);
      return {
        channels, kbps: 96,
        done: `A wet mop dripping into a bucket of water, 14.1 s, the same on both sides, 48 kHz: heavy run-off at 0.3 to 3 s, thinning to single drips by 6 s, wrung again after. ` +
          `Cut from ${from} to ${to} s, mixed to mono, 200 Hz high-pass, 50 ms fade-in, faded out in a straight line from ${thins} s in to the end (the run-off thins to drips and the drips to nothing), the peaks shaved ${took} dB by a limiter, the peak then at ${SHOT_PEAK} dBFS. ` +
          `${shares(channels)}. MP3 96 kbps mono 44.1 kHz with ffmpeg / libmp3lame.`,
      };
    },
  },

  // ---- bubbles reaching the surface: three takes ----
  ...Object.fromEntries([[1.2, 2.25], [2.7, 3.95], [6.95, 8.45]].map(([from, to], i) => [`bubbles-${i + 1}.mp3`, {
    slot: 'bubbles', sources: ['186384'],
    what: `a burst of bubbles reaching the surface (take ${i + 1} of 3)`,
    make(src) {
      const cut = decode(src('186384'), { from, to, filters: [high(150)] });
      fadeIn(cut, 0.02);
      fadeOut(cut, 0.2);
      const channels = toPeak(cut, SHOT_PEAK);
      return {
        channels, kbps: 96,
        done: `Small bubbles blown in water, 18.2 s, stereo 48 kHz (its sides all but the same), six runs of them. The run at ${from} to ${to} s, mixed to mono, 150 Hz high-pass, 20 ms fade-in, 0.2 s fade-out, ` +
          `raised ${r1(SHOT_PEAK - db(peakOf(cut)))} dB so the peak is ${SHOT_PEAK} dBFS. ${shares(channels)}. MP3 96 kbps mono 44.1 kHz with ffmpeg / libmp3lame.`,
      };
    },
  }])),

  // ---- she sinks ----
  'sink.mp3': {
    slot: 'sink', sources: ['679407'],
    what: 'she sinks: the water closing over her head',
    make(src) {
      // A head dipping under water: soft movement from 0.7 s, the water closing over at 3.2 to 3.4 s, a muffled tail to 3.75 s.
      const speed = 0.88, until = 3.86, shave = 9;
      const closes = loudestAt(decode(src('679407'), { from: 3.0, to: 3.6 })[0], 0, 0.6) + 3.0;
      const from = r3(closes - SOUND.sinkLead * speed);
      const cut = decode(src('679407'), { from, to: until, speed, filters: [high(150)] });
      fadeIn(cut, 0.15);
      fadeOut(cut, 0.1);
      const { channels: limited, took } = limit(cut, shave);
      const channels = toPeak(limited, SHOT_PEAK);
      return {
        channels, kbps: 96,
        done: `A head dipping under water, 4.1 s, the same on both sides, 48 kHz: soft movement from 0.7 s, the water closing over it (measured at ${r2(closes)} s), a muffled tail to 3.75 s. ` +
          `Cut from ${from} to ${until} s and played at ${speed} of its speed (slower and ${r1(-12 * Math.log2(speed))} semitones lower, for size), so the closing is ${SOUND.sinkLead} s in, as the show's cue wants it; ` +
          `mixed to mono, 150 Hz high-pass, 0.15 s fade-in, 0.1 s fade-out, the peaks shaved ${took} dB by a limiter, the peak then at ${SHOT_PEAK} dBFS. ${shares(channels)}. MP3 96 kbps mono 44.1 kHz with ffmpeg / libmp3lame.`,
      };
    },
  },

  // ---- the fish's leap ----
  'fish.mp3': {
    slot: 'fish', sources: ['507091'],
    what: 'the fish leaps out of the water: a light splash',
    make(src) {
      // Near silence to 1.0 s, then three swells of splashing, the third a copy of the second: the first swell is the leap.
      const whole = decode(src('507091'))[0];
      const begins = firstOver(whole, 0.7, 1.3, -26);
      const from = r3(begins - 0.03), length = 0.9, fades = 0.5;
      const cut = decode(src('507091'), { from, to: from + length, filters: [high(150)] });
      fadeIn(cut, 0.01);
      fadeOut(cut, fades, 'straight');
      const channels = toPeak(cut, SHOT_PEAK);
      return {
        channels, kbps: 96,
        done: `A fish jumping, 5.2 s, the same on both sides, 48 kHz: water lapping to 1.0 s, then three swells of splashing (the third a copy of the second). The first swell (it begins at ${r2(begins)} s, measured), ` +
          `from ${from} s for ${length} s, mixed to mono, 150 Hz high-pass, 10 ms fade-in, the last ${fades} s faded out in a straight line (a light splash out of the water, not a thrashing), ` +
          `raised ${r1(SHOT_PEAK - db(peakOf(cut)))} dB so the peak is ${SHOT_PEAK} dBFS. ${shares(channels)}. MP3 96 kbps mono 44.1 kHz with ffmpeg / libmp3lame.`,
      };
    },
  },

  // ---- the frog: two croaks ----
  ...Object.fromEntries([[2.3, 3.7, 'the first'], [41.1, 42.1, 'the eighteenth']].map(([a, b, which], i) => [`frog-${i + 1}.mp3`, {
    slot: 'frog', sources: ['397568'],
    what: `the frog on its lily: one croak (take ${i + 1} of 2)`,
    make(src) {
      // 23 croaks, one about every 2.3 s, a rumble between them: one croak, from where it rises out of the quiet to where it is gone.
      const near = decode(src('397568'), { from: a, to: b, filters: [high(300)] })[0];
      const begins = firstOver(near, 0, b - a, -45);
      let ends = begins;
      for (let s = at(begins); s + at(0.01) <= near.length; s += at(0.01)) if (db(rmsOf([near], s, s + at(0.01))) > -45) ends = (s + at(0.01)) / RATE;
      const from = r3(a + begins - 0.02), to = r3(a + ends + 0.05);
      const cut = decode(src('397568'), { from, to, filters: [high(300)] });
      fadeIn(cut, 0.01);
      fadeOut(cut, 0.05);
      const channels = toPeak(cut, SHOT_PEAK);
      return {
        channels, kbps: 96,
        done: `A frog croaking, 54.2 s, mono 48 kHz: 23 croaks, one about every 2.3 s, most of each between 1 and 3 kHz, a rumble between them. ${which[0].toUpperCase()}${which.slice(1)} croak, ${from} to ${to} s (where it rises out of the quiet to where it is gone, measured), ` +
          `300 Hz high-pass, 10 ms fade-in, 50 ms fade-out, ${SHOT_PEAK - db(peakOf(cut)) < 0 ? 'lowered' : 'raised'} ${Math.abs(r1(SHOT_PEAK - db(peakOf(cut))))} dB so the peak is ${SHOT_PEAK} dBFS. ${shares(channels)}. MP3 96 kbps mono 44.1 kHz with ffmpeg / libmp3lame.`,
      };
    },
  }])),
};

// ---------------------------------------------------------------------------------------------
// The record: sounds.json and CREDITS.md

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const NOTE = 'Uggeðla í tjörninni: the real recordings of the show\'s sound (remake/chapters/tjorn3d/sound.js, SLOTS). The show asks only for the files named under "files" here: a slot with no file plays the made sound named by its `instead`. ' +
  'The files are cut, shaped and levelled from Freesound HQ previews by `node remake/tools/tjorn3d-sounds.mjs`, which writes their entries: what each is in the show, its seconds and bytes, where it came from (title, author, page, preview, licence, the day it was fetched and the fingerprint of what was fetched), ' +
  'the fingerprint of the cut and what was done to it; `loop` is the stretch a looping file is played round ([from s, seconds]), and `level`, where a file has one, the gain it plays at instead of its slot\'s. All are CC0 1.0 (public domain): no credit is asked; it is given all the same in ../CREDITS.md. ' +
  'The owner said yes to fetching them on 2026-11-21 ("Já, sækja"); nobody had heard them when they were cut: the cuts are by measure. tests/tjorn3d-sound.test.mjs holds this file against the slots and the folder.';
/** sounds.json's "slots": what the code's slots are, for a reader of the folder. */
export const slotsRecord = () => Object.fromEntries(Object.entries(SLOTS).map(([name, slot]) => [name, { names: slot.urls.map(url => url.split('/').pop()), instead: slot.instead, what: slot.what }]));

function creditsMarkdown(files) {
  const source = s => `"${s.title}" by ${s.author}, ${s.source}`;
  const rows = Object.entries(files).map(([name, entry]) => `| \`hljod/${name}\` | ${entry.what} | ${entry.sources.map(source).join('; and ')} | ${[...new Set(entry.sources.map(s => s.licence))].join(', ')} |`);
  // her lines, as the show has them (chapters/tjorn3d/sound.js LINES): made by the game's voice tools, not by this one
  const said = Object.entries(LINES).map(([id, text]) => `\`${id}.mp3\` ("${text}")`);
  const lines = said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)}` : said[0];
  // (laid in rows as wide as the rest of the file's)
  const rowsOf = (text, width = 131) => text.split(' ').reduce((all, word) => {
    if (all.length && `${all.at(-1)} ${word}`.length <= width) all[all.length - 1] += ` ${word}`;
    else all.push(word);
    return all;
  }, []).join('\n');
  return `# Sounds in Uggeðla í tjörninni

## Uggeðla's lines

${rowsOf(`${lines}: Uggeðla's voice, made with the game's voice tools (line set \`tjorn3d\`, \`lines.json\`).`)}

## The real water

The pond's bed, her rise out of the water, the drips, the bubbles, her sinking, the fish's leap and the frog are cut, shaped and
levelled by \`node remake/tools/tjorn3d-sounds.mjs\` from Freesound recordings the owner said yes to fetching (2026-11-21); each cut
is in \`hljod/sounds.json\`. All are CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/): no credit is asked; it is given
here all the same.

| File | In the show | Source | Licence |
|---|---|---|---|
${rows.join('\n')}

## The rest

The splash as she comes down with the fish, and the fish's small plop when the show is played without the recordings, are Veiddu's
(\`assets/veiddu/splash.json\`, CC0 1.0). Everything else is made in the show as it plays (\`chapters/tjorn3d/sound.js\`), in the manner
and the key of the game's effects (\`engine/audio/sfx.js\`, \`engine/audio/fen-sounds.js\`). The show has no music.
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const out = path.join(ROOT, OUT);
  const manifestFile = path.join(out, 'sounds.json');
  if (args.includes('--measure')) {
    console.log(`${'file'.padEnd(15)} ${'s'.padStart(7)} ch ${'bytes'.padStart(7)} ${'peak'.padStart(6)} ${'RMS'.padStart(6)} ${'0,4 s'.padStart(6)}  <150 -500 -2k -6k >6k  loudness of each quarter second (dBFS)`);
    for (const name of Object.keys(SOUNDS)) {
      const file = path.join(out, name);
      if (!fs.existsSync(file)) { console.log(`${name.padEnd(15)} is not there`); continue; }
      const m = measured(file);
      console.log(`${name.padEnd(15)} ${m.seconds.toFixed(3).padStart(7)} ${String(m.channels).padStart(2)} ${String(fs.statSync(file).size).padStart(7)} ${m.peak.toFixed(1).padStart(6)} ${m.rms.toFixed(1).padStart(6)} ${m.loudest.toFixed(1).padStart(6)}  ${m.bands.map(v => String(v).padStart(4)).join(' ')}  ${m.envelope.slice(0, 26).join(' ')}${m.envelope.length > 26 ? ' …' : ''}`);
    }
  } else if (args.includes('--credits')) {
    // CREDITS.md alone, from the cuts as sounds.json tells of them: nothing is cut again
    const files = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).files ?? {};
    fs.writeFileSync(path.join(ROOT, CREDITS), creditsMarkdown(files));
    console.log(`tjorn3d/CREDITS.md written: ${Object.keys(LINES).length} lines, ${Object.keys(files).length} recordings`);
  } else {
    const dry = args.includes('--dry');
    const only = value('--only') ? new Set(value('--only').split(',')) : null;
    for (const name of only ?? []) if (!SOUNDS[name]) throw new Error(`--only: no such file ${name}`);
    const folder = path.resolve(ROOT, value('--sources') ?? SOURCES);
    const listFile = path.join(folder, 'sources.json');
    if (!fs.existsSync(listFile)) throw new Error(`the sources are not here: ${listFile} (qa/ is not in the repo; give their folder with --sources)`);
    const fetched = new Map(JSON.parse(fs.readFileSync(listFile, 'utf8')).fetched.map(row => [String(row.id), row]));
    const src = id => {
      const row = fetched.get(id);
      if (!row) throw new Error(`sources.json does not name ${id}`);
      const file = path.join(folder, `${id}-${String(row.use).replace(/[^a-z-]/g, '')}`, `${id}-hq.mp3`);
      if (!fs.existsSync(file)) throw new Error(`the source ${file} is not here`);
      if (sha256(file) !== row.sourceSha256) throw new Error(`${file} is not what was fetched: its fingerprint is not sources.json's`);
      return file;
    };
    const text = x => String(x ?? '');
    const sourceRecord = id => { const row = fetched.get(id); return { id, title: text(row.title), author: text(row.author), source: text(row.source), preview: text(row.preview), licence: text(row.licence), licenceUrl: text(row.licenceUrl), downloaded: text(row.downloaded), sourceSha256: text(row.sourceSha256) }; };
    const before = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')).files ?? {} : {};
    const files = {};
    if (!dry) fs.mkdirSync(out, { recursive: true });
    for (const [name, job] of Object.entries(SOUNDS)) {
      if (only && !only.has(name)) {
        if (!before[name]) throw new Error(`${name} is not made yet: make it too (--only ${[...only, name]})`);
        files[name] = before[name];
        continue;
      }
      if (dry) { console.log(`would make ${OUT}/${name} (${job.what}) from ${job.sources.map(id => `${id} "${fetched.get(id)?.title}"`).join(' and ')}`); continue; }
      const made = job.make(src);
      const file = path.join(out, name);
      encode(made.channels, file, made.kbps);
      const m = measured(file);
      let seam = '';
      if (made.loop) {
        // the round as a browser will play it: what follows its end must be its start again
        const heard = decode(file, { channels: m.channels }), [from, seconds] = made.loop, n = at(ROLL - 0.05);
        let aa = 0, bb = 0, ab = 0;
        for (const ch of heard) for (let i = 0; i < n; i++) { const a = ch[at(from) + i], b = ch[at(from + seconds) + i]; aa += a * a; bb += b * b; ab += a * b; }
        const alike = ab / Math.sqrt(aa * bb);
        if (!(alike > 0.9)) throw new Error(`${name}: what follows the round's end is not its start (correlation ${r2(alike)})`);
        seam = ` What follows the round's end in the encoded file is its start again (correlation ${r2(alike)} over ${r2(ROLL - 0.05)} s).`;
      }
      files[name] = {
        slot: job.slot, what: job.what, seconds: m.seconds, bytes: fs.statSync(file).size, channels: m.channels, ...(made.loop ? { loop: made.loop } : {}),
        sources: job.sources.map(sourceRecord), sha256: sha256(file),
        done: `${made.done} Now ${m.seconds} s, its peak ${m.peak} dBFS after encoding.${seam}`,
      };
      console.log(`${name}: ${m.seconds} s, ${files[name].bytes} bytes, peak ${m.peak} dBFS, loudest 0,4 s ${m.loudest} dBFS, bands ${m.bands.join(' | ')} %`);
    }
    if (!dry) {
      fs.writeFileSync(manifestFile, JSON.stringify({ note: NOTE, slots: slotsRecord(), files }, null, 2) + '\n');
      fs.writeFileSync(path.join(ROOT, CREDITS), creditsMarkdown(files));
      const total = Object.values(files).reduce((sum, entry) => sum + entry.bytes, 0);
      console.log(`${Object.keys(files).length} files in ${OUT}, ${total} bytes in all, with sounds.json and tjorn3d/CREDITS.md`);
    }
  }
}
