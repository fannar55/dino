// The pitch of a recorded animal call or a horn note (chapter 5's tones, tools/kafli5-sounds.mjs and the listening page
// qa/remake/kafli5/hljod/index.html): YIN (de Cheveigné and Kawahara, 2002) on the loud frames, their median, so the game can play
// the take at the rate that puts it on its tone. Pure: samples in, numbers out; it runs in node and in a browser alike.

const RATE = 22050; // analysed at this rate (the calls sit well under its 11 kHz)
const WINDOW = 1024;
const HOP = 256;

/** `samples` (mono, at `sampleRate`) brought down to about RATE by averaging, which also takes the top off. */
function decimate(samples, sampleRate) {
  const step = Math.max(1, Math.round(sampleRate / RATE));
  if (step === 1) return { data: samples, rate: sampleRate };
  const data = new Float32Array(Math.floor(samples.length / step));
  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    for (let k = 0; k < step; k++) sum += samples[i * step + k];
    data[i] = sum / step;
  }
  return { data, rate: sampleRate / step };
}

/** One frame's YIN: its period in samples (between `minLag` and `maxLag`) and how aperiodic it is (0 clean .. 1 noise). */
function yinFrame(data, start, minLag, maxLag, threshold) {
  const diff = new Float32Array(maxLag + 2);
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let i = 0; i < WINDOW; i++) {
      const d = data[start + i] - data[start + i + lag];
      sum += d * d;
    }
    diff[lag] = sum;
  }
  // the cumulative mean normalised difference
  const norm = new Float32Array(maxLag + 2);
  norm[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    running += diff[lag];
    norm[lag] = running > 0 ? (diff[lag] * lag) / running : 1;
  }
  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (norm[lag] < threshold) {
      while (lag + 1 <= maxLag && norm[lag + 1] < norm[lag]) lag++;
      best = lag;
      break;
    }
  }
  if (best < 0) {
    // no dip under the threshold: the deepest one, marked as rough
    best = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) if (norm[lag] < norm[best]) best = lag;
  }
  // a parabola through the dip and its neighbours
  const [a, b, c] = [norm[best - 1] ?? norm[best], norm[best], norm[best + 1] ?? norm[best]];
  const bend = a - 2 * b + c;
  const shift = bend > 0 ? (a - c) / (2 * bend) : 0;
  return { period: best + Math.max(-0.5, Math.min(0.5, shift)), aperiodic: b };
}

/**
 * The pitch of `samples`: `hz` (null when no steady pitch is found), `clarity` (1 minus the loud frames' median aperiodicity: over
 * about 0.7 a clear note, under 0.5 mostly noise) and `voiced` (the share of loud frames with a clear period).
 */
export function pitchOf(samples, sampleRate, { min = 55, max = 3500, threshold = 0.2, floor = 0.12 } = {}) {
  const { data, rate } = decimate(samples, sampleRate);
  const minLag = Math.max(2, Math.floor(rate / max));
  const maxLag = Math.ceil(rate / min);
  const frames = [];
  let peak = 0;
  for (let start = 0; start + WINDOW + maxLag + 2 < data.length; start += HOP) {
    let sum = 0;
    for (let i = 0; i < WINDOW; i++) sum += data[start + i] * data[start + i];
    const rms = Math.sqrt(sum / WINDOW);
    frames.push({ start, rms });
    peak = Math.max(peak, rms);
  }
  const loud = frames.filter(f => f.rms >= peak * floor * 2.5 && peak > 0);
  if (loud.length < 2) return { hz: null, clarity: 0, voiced: 0 };
  const found = loud.map(f => ({ ...yinFrame(data, f.start, minLag, maxLag, threshold), rms: f.rms }));
  const median = list => {
    const sorted = [...list].sort((x, y) => x - y);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  const clear = found.filter(f => f.aperiodic < threshold);
  const clarity = 1 - median(found.map(f => f.aperiodic));
  const voiced = clear.length / found.length;
  if (clear.length < 2) return { hz: null, clarity: Number(clarity.toFixed(3)), voiced: Number(voiced.toFixed(3)) };
  // the median period of the clear frames, the louder counted more (each frame counted by its share of the peak, at least once)
  const weighted = clear.flatMap(f => Array.from({ length: Math.max(1, Math.round((f.rms / peak) * 4)) }, () => f.period));
  const hz = rate / median(weighted);
  return { hz: Number(hz.toFixed(2)), clarity: Number(clarity.toFixed(3)), voiced: Number(voiced.toFixed(3)) };
}

/** Cents from `from` Hz up to `to` Hz. */
export const cents = (from, to) => 1200 * Math.log2(to / from);

/**
 * The rate to play a take of pitch `hz` so it sings `toneHz`, in the octave of the tone nearest the take's own pitch (so no take is
 * moved more than half an octave): { rate, target, cents }. A take with no pitch plays as it is.
 */
export function rateFor(hz, toneHz) {
  if (!(hz > 0) || !(toneHz > 0)) return { rate: 1, target: null, cents: 0 };
  const octave = Math.round(Math.log2(hz / toneHz));
  const target = toneHz * 2 ** octave;
  return { rate: target / hz, target, cents: cents(hz, target) };
}
