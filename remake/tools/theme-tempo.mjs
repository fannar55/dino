#!/usr/bin/env node
// Measures the theme music once and writes what the beat clock and the sound effects need to
// remake/assets/audio/theme.json: the tempo (bpm), the time of a strong beat (beatOffset, seconds
// from the start of the file; every second beat after it is strong too) and the key, as five notes
// of its major pentatonic scale in a bell register (Hz), which the bell sounds are tuned to
// (engine/audio/sfx.js). The game never listens to the music: the beat is the same pure function
// of the music's time on every run (engine/beat.js).
//   node remake/tools/theme-tempo.mjs [--encode] [--no-mix]        (needs ffmpeg on the PATH)
//   node remake/tools/theme-tempo.mjs --theme kafli2 [--key] [--no-mix]
//   node remake/tools/theme-tempo.mjs --file remake/assets/audio/eitt/music.mp3 [--key] [--no-mix]
//
// --theme <folder> measures a chapter's own theme instead (chapters/<id>.js `theme`): remake/assets/audio/<folder>/theme.mp3, as
// it is (it was cut to loop by hand, so there is nothing to encode), into remake/assets/audio/<folder>/theme.json, whose other
// fields (name, danceBeats, comment) it keeps, and its key too unless --key is given (the owner picks a key by ear; the measured
// one is printed); its click track, on the key in the json, goes to qa/remake/<folder>/theme-click-track.mp3.
// --file <mp3 under remake/assets/audio/> does the same for any track, a game's own music: <track>.json beside it (music.json for
// music.mp3, which the game's effects are tuned to: engine/audio/game-music.js), its click track in qa/remake/<folder>/. A track's
// json also says its tuning (tuningCents, against A4 = 440).
//
// The music that plays is not the game's own file (dist/assets/audio/little-dino-green-valley.mp3,
// which is never changed) but a compressed copy of it, remake/assets/audio/theme.mp3: an MP3 at
// 96 kbps, stereo, 44.1 kHz, about 4 MB instead of 7, which is enough for a tablet's speakers.
// --encode makes that copy first. The measurement is always made on the copy, since an encoder
// moves the first beat by its delay: beatOffset has to come from the file that plays. theme.json's
// src is read against theme.json itself (engine/audio/music.js), so it is just "theme.mp3".
//
// Tempo: ffmpeg decodes the theme, a spectral-flux curve marks its onsets, and the tempo is picked
// from the curve's autocorrelation between 60 and 180 bpm (with a mild liking for 120). The pick is
// then refined by folding the curve over the whole file at trial tempi and keeping the one that
// stacks the onsets best, which fixes the bpm to a few thousandths and the offset to a few
// milliseconds. Folded over two beats, the stronger of the two becomes beat 0.
// Key: the strongest spectral peaks of each 0.37 s window make a chromagram, which is matched to the
// Krumhansl-Kessler major and minor profiles; a minor key gives its relative major's pentatonic.
//
// A person confirms the result by ear: unless --no-mix is given, qa/remake/kafli1-t9/
// theme-click-track.mp3 is the theme with a click on every beat and, on every second beat, a
// stronger click and a bell on a note of the key.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_FILE = 'dist/assets/audio/little-dino-green-valley.mp3'; // the game's own theme
const THEME_FILE = 'remake/assets/audio/theme.mp3'; // the copy that plays, and the file the tempo is measured on
const THEME_SRC = 'theme.mp3'; // beside theme.json
const RATE = 22050; // the analysis runs on mono at this rate

const WINDOW = 512; // onset curve: 23 ms windows every 5.8 ms
const HOP = 128;
const BANDS = 36;
const ONSET_LAG = 0.004; // s: the curve peaks this much before the onset it marks (measured on synthetic clicks)
const BPM_RANGE = [60, 180];
const SEGMENTS = 12; // the steadiness check folds this many stretches of the file on their own

// ---------------------------------------------------------------------------------------------
// Signal helpers

/** Decodes `file` with ffmpeg to interleaved 32-bit float samples. */
function decode(file, sampleRate, channels) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', String(channels), '-ar', String(sampleRate), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const aligned = pcm.byteOffset % 4 === 0 ? pcm.buffer : pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length);
  return new Float32Array(aligned, aligned === pcm.buffer ? pcm.byteOffset : 0, pcm.length / 4);
}

/** Encodes the compressed copy that plays from the game's own theme, and says how much smaller it is. */
function encodeTheme() {
  const source = path.join(ROOT, SOURCE_FILE), target = path.join(ROOT, THEME_FILE);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vn', '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '2', '-ar', '44100', target]);
  const bytes = file => fs.statSync(file).size;
  console.log(`encoded ${THEME_FILE}: ${bytes(source)} -> ${bytes(target)} bytes (96 kbps, stereo, 44.1 kHz)`);
}

/** An in-place radix-2 FFT of size n (a power of two): transform(re, im) leaves the spectrum in re and im. */
function fftPlan(n) {
  const bits = Math.log2(n);
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  const reversed = new Uint32Array(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); reversed[i] = r; }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = reversed[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const a = start + k, b = a + half;
          const tr = re[b] * cos[t] + im[b] * sin[t], ti = im[b] * cos[t] - re[b] * sin[t];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}

const hann = n => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));

/** Triangular mel bands over the FFT bins: [{ first, weights }]. */
function melFilters(n, rate, bands, lowHz, highHz) {
  const mel = f => 2595 * Math.log10(1 + f / 700);
  const hz = m => 700 * (10 ** (m / 2595) - 1);
  const edge = i => hz(mel(lowHz) + ((mel(highHz) - mel(lowHz)) * i) / (bands + 1));
  return Array.from({ length: bands }, (_, b) => {
    const lo = edge(b), mid = edge(b + 1), hi = edge(b + 2);
    const first = Math.max(1, Math.ceil((lo * n) / rate));
    const last = Math.min(n / 2, Math.floor((hi * n) / rate));
    const weights = [];
    for (let k = first; k <= last; k++) { const f = (k * rate) / n; weights.push(f < mid ? (f - lo) / (mid - lo) : (hi - f) / (hi - mid)); }
    return { first, weights };
  });
}

/** Offset of a spectrum or curve peak from the middle sample, from its two neighbours (-0.5..0.5). */
const parabolic = (a, b, c) => (a - 2 * b + c === 0 ? 0 : (0.5 * (a - c)) / (a - 2 * b + c));

// ---------------------------------------------------------------------------------------------
// Rhythm

/**
 * The onsets of `samples` (mono) as a curve: how much louder each band got since the frame before,
 * summed over bands, minus its own local average. Frame i is the window centred on sample i * HOP.
 */
export function onsetCurve(samples, sampleRate) {
  const fft = fftPlan(WINDOW);
  const window = hann(WINDOW);
  const filters = melFilters(WINDOW, sampleRate, BANDS, 40, 8000);
  const frames = Math.floor(samples.length / HOP);
  const re = new Float64Array(WINDOW), im = new Float64Array(WINDOW);
  let before = new Float64Array(BANDS), now = new Float64Array(BANDS);
  const flux = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP - WINDOW / 2;
    for (let k = 0; k < WINDOW; k++) { const j = start + k; re[k] = j >= 0 && j < samples.length ? samples[j] * window[k] : 0; im[k] = 0; }
    fft(re, im);
    let sum = 0;
    for (let b = 0; b < BANDS; b++) {
      const { first, weights } = filters[b];
      let energy = 0;
      for (let k = 0; k < weights.length; k++) energy += weights[k] * Math.sqrt(re[first + k] * re[first + k] + im[first + k] * im[first + k]);
      now[b] = Math.log1p((400 * energy) / WINDOW); // a full-scale sine puts 100 in its band
      if (f > 0 && now[b] > before[b]) sum += now[b] - before[b];
    }
    flux[f] = sum / BANDS;
    [before, now] = [now, before];
  }
  const rate = sampleRate / HOP;
  // keep what stands out from the surroundings (0.4 s either side), in units of its spread
  const reach = Math.round(rate * 0.4);
  const total = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) total[i + 1] = total[i] + flux[i];
  const curve = new Float32Array(frames);
  let mean = 0;
  for (let i = 0; i < frames; i++) {
    const a = Math.max(0, i - reach), b = Math.min(frames, i + reach + 1);
    curve[i] = Math.max(0, flux[i] - (total[b] - total[a]) / (b - a));
    mean += curve[i] / frames;
  }
  let spread = 0;
  for (let i = 0; i < frames; i++) spread += (curve[i] - mean) ** 2 / frames;
  for (let i = 0; i < frames; i++) curve[i] = (curve[i] - mean) / (Math.sqrt(spread) || 1);
  return { curve, rate };
}

/** The curve folded onto one period: the mean of the frames at each phase, in `bins` bins (frames share between neighbours). */
function fold(curve, rate, period, bins, from = 0, to = curve.length) {
  const sum = new Float64Array(bins), weight = new Float64Array(bins);
  const framesPerPeriod = period * rate;
  for (let i = from; i < to; i++) {
    const at = ((i / framesPerPeriod) % 1) * bins - 0.5; // the centre of bin b is at b
    const lo = Math.floor(at), share = at - lo;
    const a = (lo + bins) % bins, b = (lo + 1) % bins;
    sum[a] += curve[i] * (1 - share); weight[a] += 1 - share;
    sum[b] += curve[i] * share; weight[b] += share;
  }
  return Float64Array.from(sum, (s, i) => s / (weight[i] || 1));
}

const smooth = h => Float64Array.from(h, (v, i) => (h[(i + h.length - 1) % h.length] + 2 * v + h[(i + 1) % h.length]) / 4);
const spreadOf = h => { const mean = h.reduce((a, b) => a + b, 0) / h.length; return h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length; };
const argmax = h => h.reduce((best, v, i) => (v > h[best] ? i : best), 0);
/** `d` moved by whole `length`s into [-length / 2, length / 2). */
const wrapped = (d, length) => ((((d + length / 2) % length) + length) % length) - length / 2;

/**
 * Where in `length` seconds the folded curve `h` peaks, to a fraction of a bin (bin b is centred on
 * (b + 0.5) / bins). With `near` = { at, within } only phases within `within` seconds of `at` count.
 */
function peakPhase(h, length, near = null) {
  const bins = h.length;
  let i = -1;
  for (let b = 0; b < bins; b++) {
    if (near && Math.abs(wrapped(((b + 0.5) / bins) * length - near.at, length)) > near.within) continue;
    if (i < 0 || h[b] > h[i]) i = b;
  }
  return ((i + 0.5 + parabolic(h[(i + bins - 1) % bins], h[i], h[(i + 1) % bins])) / bins) * length;
}

/** The tempo the curve's autocorrelation likes best between 60 and 180 bpm, weighted toward 120 (within about 1 %). */
function coarseTempo(curve, rate) {
  const minLag = Math.floor((rate * 60) / BPM_RANGE[1]) - 1, maxLag = Math.ceil((rate * 60) / BPM_RANGE[0]) + 1;
  const acf = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < curve.length; i++) sum += curve[i] * curve[i + lag];
    acf[lag] = sum / (curve.length - lag);
  }
  let best = { bpm: 0, score: -Infinity };
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (!(acf[lag] > acf[lag - 1] && acf[lag] >= acf[lag + 1])) continue;
    const bpm = (60 * rate) / (lag + parabolic(acf[lag - 1], acf[lag], acf[lag + 1]));
    if (bpm < BPM_RANGE[0] || bpm > BPM_RANGE[1]) continue;
    const score = acf[lag] * Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.6) ** 2);
    if (score > best.score) best = { bpm, score };
  }
  if (!best.bpm) throw new Error('No rhythm found between 60 and 180 bpm');
  return best.bpm;
}

/**
 * Tempo and beat grid of mono `samples`: { bpm, beatOffset, ... }. beatOffset is in [0, 2 beats) and
 * is a strong beat. The rest says how sure it is: peakToNoise (how much better the best trial tempo
 * stacks the onsets than a typical one), strongToWeak (the stronger of two neighbouring beats over
 * the other) and driftMs (how far, in ms, each twelfth of the file's own beats sit from the grid).
 */
export function measureRhythm(samples, sampleRate = RATE) {
  const { curve, rate } = onsetCurve(samples, sampleRate);
  const coarse = coarseTempo(curve, rate);

  // trial tempi within 1.5 % of the pick: the one that stacks the whole file's onsets best
  const scores = [];
  for (let bpm = coarse * 0.985; bpm <= coarse * 1.015; bpm += 0.004) scores.push({ bpm, score: spreadOf(smooth(fold(curve, rate, 60 / bpm, 128))) });
  const top = argmax(scores.map(s => s.score));
  const near = [scores[Math.max(0, top - 1)].score, scores[top].score, scores[Math.min(scores.length - 1, top + 1)].score];
  const bpm = scores[top].bpm + parabolic(...near) * 0.004;
  const period = 60 / bpm;
  const sorted = scores.map(s => s.score).sort((a, b) => a - b);

  // the beat's phase from one beat folded, which of two neighbouring beats is stronger from two
  const phase = peakPhase(smooth(fold(curve, rate, period, 256)), period);
  const pair = smooth(fold(curve, rate, 2 * period, 512));
  const around = at => Math.max(...[-3, -2, -1, 0, 1, 2, 3].map(d => pair[(Math.round((at / (2 * period)) * 512 - 0.5) + d + 512) % 512]));
  const first = around(phase), second = around(phase + period);
  const strong = second > first ? phase + period : phase;

  // steadiness: each stretch of the file folded alone at this tempo, how far its beat (the peak nearest
  // the whole file's, a stretch may lean on the off-beats) is from the grid
  const driftMs = Array.from({ length: SEGMENTS }, (_, s) => {
    const own = peakPhase(smooth(fold(curve, rate, period, 128, Math.floor((curve.length * s) / SEGMENTS), Math.floor((curve.length * (s + 1)) / SEGMENTS))), period, { at: phase, within: period / 4 });
    return Math.round(wrapped(own - phase, period) * 10000) / 10; // ms, to a tenth
  });
  return {
    bpm,
    beatOffset: (strong + ONSET_LAG) % (2 * period),
    peakToNoise: scores[top].score / (sorted[Math.floor(sorted.length / 2)] || 1e-9),
    strongToWeak: Math.max(first, second) / Math.max(Math.min(first, second), 1e-9),
    driftMs,
  };
}

// ---------------------------------------------------------------------------------------------
// Key

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Krumhansl-Kessler probe-tone profiles, tonic first
const PROFILES = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};
const KEY_WINDOW = 8192; // 0.37 s, so a semitone is several bins wide down to the low notes
const KEY_HOP = 4096;

function pearson(a, b) {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
  return ab / (Math.sqrt(aa * bb) || 1);
}

/** All 24 keys ranked by how well a 12-bin chroma fits their profile: [{ tonic, mode, name, r }]. */
function rankKeys(chroma) {
  const keys = [];
  for (const [mode, profile] of Object.entries(PROFILES)) {
    for (let tonic = 0; tonic < 12; tonic++) {
      keys.push({ tonic, mode, name: `${NAMES[tonic]} ${mode}`, r: pearson(chroma, Array.from({ length: 12 }, (_, pc) => profile[(pc - tonic + 12) % 12])) });
    }
  }
  return keys.sort((a, b) => b.r - a.r);
}

/**
 * The key of mono `samples`: { tonic (0 = C), mode, name, r, runnerUp, tuningCents, agreeing } where
 * runnerUp is the best other key, tuningCents how far the music sits from A = 440 Hz, and agreeing
 * how many of SEGMENTS stretches of the file pick the same key on their own.
 */
export function measureKey(samples, sampleRate = RATE) {
  const fft = fftPlan(KEY_WINDOW);
  const window = hann(KEY_WINDOW);
  const re = new Float64Array(KEY_WINDOW), im = new Float64Array(KEY_WINDOW), mag = new Float64Array(KEY_WINDOW / 2 + 1);
  const lo = Math.ceil((65 * KEY_WINDOW) / sampleRate), hi = Math.floor((4000 * KEY_WINDOW) / sampleRate);
  const frames = [];
  for (let start = 0; start + KEY_WINDOW <= samples.length; start += KEY_HOP) {
    for (let k = 0; k < KEY_WINDOW; k++) { re[k] = samples[start + k] * window[k]; im[k] = 0; }
    fft(re, im);
    let loudest = 0;
    for (let k = lo - 1; k <= hi + 1; k++) { mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]); loudest = Math.max(loudest, mag[k]); }
    const peaks = []; // [pitch in fractional semitones from A4, weight]
    for (let k = lo; k <= hi; k++) {
      if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > 0.05 * loudest && loudest > 1e-6) {
        const hz = ((k + parabolic(Math.log(mag[k - 1] + 1e-12), Math.log(mag[k] + 1e-12), Math.log(mag[k + 1] + 1e-12))) * sampleRate) / KEY_WINDOW;
        peaks.push([12 * Math.log2(hz / 440), mag[k] / loudest]);
      }
    }
    frames.push(peaks);
  }
  // how far the peaks sit from the equal-tempered semitones, on average (around the circle, weighted)
  let x = 0, y = 0;
  for (const peaks of frames) for (const [semis, w] of peaks) { const d = semis - Math.round(semis); x += w * Math.cos(2 * Math.PI * d); y += w * Math.sin(2 * Math.PI * d); }
  const tuningCents = (Math.atan2(y, x) / (2 * Math.PI)) * 100;
  const chromaOf = list => {
    const chroma = new Array(12).fill(0);
    for (const peaks of list) {
      const total = peaks.reduce((s, p) => s + p[1], 0) || 1;
      for (const [semis, w] of peaks) chroma[(((Math.round(semis - tuningCents / 100) + 9) % 12) + 12) % 12] += w / total; // A4 is pitch class 9
    }
    return chroma;
  };
  const ranked = rankKeys(chromaOf(frames));
  let agreeing = 0;
  for (let s = 0; s < SEGMENTS; s++) {
    const own = rankKeys(chromaOf(frames.slice(Math.floor((frames.length * s) / SEGMENTS), Math.floor((frames.length * (s + 1)) / SEGMENTS))))[0];
    if (own.name === ranked[0].name) agreeing++;
  }
  return { ...ranked[0], runnerUp: ranked[1], tuningCents, agreeing };
}

const PENTATONIC = [0, 2, 4, 7, 9]; // semitones above the tonic: 1 2 3 5 6
const BELL_CENTRE = 76.5; // MIDI: the middle of C5 to A5, where the chimes sit

/** Frequencies (Hz, rounded to 0.01) of the major pentatonic scale on pitch class `tonic`, in the octave nearest the bell register. */
export function bellNotes(tonic, tuningCents = 0) {
  const mean = PENTATONIC.reduce((s, d) => s + d, 0) / PENTATONIC.length;
  const root = [4, 5, 6, 7].map(o => 12 * o + tonic).reduce((best, m) => (Math.abs(m + mean - BELL_CENTRE) < Math.abs(best + mean - BELL_CENTRE) ? m : best));
  return PENTATONIC.map(d => Math.round(440 * 2 ** ((root + d - 69) / 12 + tuningCents / 1200) * 100) / 100);
}

/** The pentatonic of a measured key: its own for a major key, its relative major's (three semitones up) for a minor one. */
export const keyNotes = key => bellNotes(key.mode === 'minor' ? (key.tonic + 3) % 12 : key.tonic, key.tuningCents);

// ---------------------------------------------------------------------------------------------
// Click track

const MIX_RATE = 44100;
const CHIME_ORDER = [0, 2, 1, 3, 2, 4, 3, 1]; // which of the five notes each strong beat rings

/** Adds `shape(t)` (mono, t in seconds since `at`) to both channels of interleaved `mix` for `seconds`. */
function addSound(mix, at, seconds, shape) {
  const first = Math.round(at * MIX_RATE);
  for (let i = 0; i < seconds * MIX_RATE; i++) {
    const frame = first + i;
    if (frame < 0 || frame * 2 + 1 >= mix.length) continue;
    const v = shape(i / MIX_RATE);
    mix[frame * 2] += v; mix[frame * 2 + 1] += v;
  }
}

/** The theme with a tick on every beat, a louder tock and a bell on every second beat. */
function writeClickTrack(file, out, { bpm, beatOffset, key }) {
  const mix = decode(file, MIX_RATE, 2).map(v => v * 0.7);
  const period = 60 / bpm, sine = (hz, t) => Math.sin(2 * Math.PI * hz * t);
  for (let n = beatOffset >= period ? -1 : 0, t = beatOffset + n * period; t < mix.length / 2 / MIX_RATE; n++, t = beatOffset + n * period) {
    if (n % 2) addSound(mix, t, 0.04, s => 0.2 * sine(1800, s) * Math.exp(-s / 0.006));
    else {
      addSound(mix, t, 0.06, s => 0.4 * (sine(1000, s) + 0.5 * sine(2000, s)) * Math.exp(-s / 0.01));
      const note = key[CHIME_ORDER[(n / 2) % CHIME_ORDER.length]];
      addSound(mix, t, 2.5, s => 0.15 * Math.min(1, s / 0.003) * (sine(note, s) * Math.exp(-s / 0.9) + 0.35 * sine(note * 2.76, s) * Math.exp(-s / 0.25) + 0.12 * sine(note * 5.4, s) * Math.exp(-s / 0.1)));
    }
  }
  const peak = mix.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (peak > 0.7) mix.forEach((v, i) => { mix[i] = (v * 0.7) / peak; }); // headroom: mp3 coding overshoots a click by up to 3 dB
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(MIX_RATE), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-q:a', '3', out], { input: Buffer.from(mix.buffer, mix.byteOffset, mix.byteLength), maxBuffer: 1 << 28 });
}

// ---------------------------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const themeAt = process.argv.indexOf('--theme');
  const fileAt = process.argv.indexOf('--file');
  if (themeAt > 0 && fileAt > 0) throw new Error('--theme and --file each name the track: give one');
  if (themeAt > 0 && !/^[a-z0-9_-]+$/i.test(process.argv[themeAt + 1] ?? '')) throw new Error('--theme takes a folder under remake/assets/audio/, as --theme kafli2');
  // a track of its own (a chapter's theme, a game's music), measured as it is, its json beside it: repo-relative, with / between
  const own = themeAt > 0 ? `remake/assets/audio/${process.argv[themeAt + 1]}/theme.mp3`
    : fileAt > 0 ? path.relative(ROOT, path.resolve(ROOT, process.argv[fileAt + 1] ?? '')).replace(/\\/g, '/') : null;
  if (own && !/^remake\/assets\/audio\/[a-z0-9_-]+\/[a-z0-9_-]+\.mp3$/i.test(own)) throw new Error(`--file takes an mp3 in a folder under remake/assets/audio/, not ${own}`);
  const folder = own ? own.split('/').at(-2) : null;
  if (own && process.argv.includes('--encode')) throw new Error('--encode makes chapter 1\'s copy; a track of its own is measured as it is');
  if (process.argv.includes('--encode')) encodeTheme();
  const themeFile = own ?? THEME_FILE;
  const file = path.join(ROOT, themeFile);
  if (!fs.existsSync(file)) throw new Error(own ? `${themeFile} does not exist` : `${THEME_FILE} does not exist: run this with --encode to make it from ${SOURCE_FILE}`);
  const samples = decode(file, RATE, 1);
  const rhythm = measureRhythm(samples);
  const key = measureKey(samples);
  const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;
  const theme = { src: own ? path.posix.basename(own) : THEME_SRC, bpm: round(rhythm.bpm, 3), beatOffset: round(rhythm.beatOffset, 4), key: keyNotes(key) };
  if (own) theme.tuningCents = round(key.tuningCents, 1);
  const target = path.join(ROOT, own ? own.replace(/\.mp3$/i, '.json') : 'remake/assets/audio/theme.json');
  // a chapter's theme.json keeps what is not measured (its name, danceBeats, comment), each field where it was, and the key the owner
  // picked by ear (a song's notes can name two roots, as Dino Trail's do): --key writes the measured key over it
  const kept = own && fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
  const keepKey = Array.isArray(kept?.key) && !process.argv.includes('--key');
  const fields = kept ? { ...kept, ...theme, ...(keepKey ? { key: kept.key } : {}) } : theme;
  const line = ([name, value]) => ` ${JSON.stringify(name)}: ${Array.isArray(value) ? `[${value.join(', ')}]` : JSON.stringify(value)}`;
  const json = `{\n${Object.entries(fields).map(line).join(',\n')}\n}\n`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, json);
  const drift = Math.max(...rhythm.driftMs.map(Math.abs));
  console.log(`${(samples.length / RATE).toFixed(1)} s: ${theme.bpm} bpm, a strong beat at ${theme.beatOffset} s (then every ${round(120 / theme.bpm, 4)} s)`);
  console.log(`  sure of the tempo: onsets stack ${round(rhythm.peakToNoise, 0)}x better at the pick than at a typical trial tempo; strong beat ${round(rhythm.strongToWeak, 2)}x the weak one; beats stay within ${round(drift, 1)} ms of the grid across ${SEGMENTS} stretches`);
  if (rhythm.peakToNoise < 8 || drift > 25) console.warn('  WARNING: the tempo is not steady or not clear; a single bpm and offset will not hold for the whole file');
  console.log(`  key ${key.name} (r ${round(key.r, 2)}, then ${key.runnerUp.name} ${round(key.runnerUp.r, 2)}; ${key.agreeing} of ${SEGMENTS} stretches agree; tuning ${key.tuningCents >= 0 ? '+' : ''}${round(key.tuningCents, 1)} cents)`);
  console.log(`  bell notes (Hz): ${theme.key.join(', ')}${keepKey ? ` (not written: the json keeps its key, ${kept.key.join(', ')}; --key writes these)` : ''}`);
  console.log(`wrote ${path.relative(ROOT, target).replace(/\\/g, '/')}`);
  if (!process.argv.includes('--no-mix')) {
    const out = path.join(ROOT, own ? `qa/remake/${folder}/${path.posix.basename(own, '.mp3')}-click-track.mp3` : 'qa/remake/kafli1-t9/theme-click-track.mp3');
    writeClickTrack(file, out, { bpm: theme.bpm, beatOffset: theme.beatOffset, key: fields.key });
    console.log(`wrote ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
  }
}
