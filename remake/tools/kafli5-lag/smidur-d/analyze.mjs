// smidur-d's ears: what the render cannot hear, measured. `node remake/tools/kafli5-lag/smidur-d/analyze.mjs` reads the rendered
// mix, stems, song.json and checks.json and prints (and writes analysis.json beside them):
// - per section: the mix's RMS overall and under 150 Hz, drum onsets a second (rises of a 23 ms envelope under 150 Hz and over 5 kHz),
//   and each stem's RMS;
// - the loudness (ffmpeg ebur128) and every file's sample peak (no clipping);
// - the chorus notes and calls: pitch against their tone, and the animals stem rising on each chorus beat;
// - the loop's seam: every stem at the end of the loop against the bar before the loop.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './dsp.mjs';

const { SR } = D;
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(resolve(HERE, '../../../..'), 'qa/remake/kafli5/lag/keppni/smidur-d');
const song = JSON.parse(readFileSync(join(OUT, 'song.json'), 'utf8'));
const checks = JSON.parse(readFileSync(join(OUT, 'checks.json'), 'utf8'));
const SPB = (SR * 60) / song.bpm;
const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const r1 = x => Math.round(x * 10) / 10;

const mono = ([L, R]) => L.map((v, i) => (v + R[i]) / 2);
const mix = D.decodeStereo(join(OUT, 'mix.mp3'));
const m = mono(mix);
const low = D.filt(Float32Array.from(m), D.biquad('lp', 150, 0.54), D.biquad('lp', 150, 1.31));
const high = D.filt(Float32Array.from(m), D.biquad('hp', 5000, 0.54), D.biquad('hp', 5000, 1.31));

function rms(x, a, b) {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}
/** Onsets: a 23 ms RMS envelope (hop 5.8 ms) rising 6 dB over its least of the last 23 ms, above (loudest - 40 dB), 60 ms apart. */
function onsets(x, rise = 6, floor = 40) {
  const w = Math.round(0.023 * SR);
  const hop = 256;
  const env = [];
  for (let s = 0; s + w <= x.length; s += hop) env.push(db(rms(x, s, s + w)));
  const top = Math.max(...env.filter(Number.isFinite));
  const back = Math.round(w / hop);
  const found = [];
  let last = -1e9;
  for (let k = back; k < env.length; k++) {
    let least = Infinity;
    for (let j = k - back; j < k; j++) least = Math.min(least, env[j]);
    if (env[k] - least > rise && env[k] > top - floor && env[k] >= env[k - 1] && (k - last) * hop > 0.06 * SR) {
      found.push((k * hop + w / 2) / SR);
      last = k;
    }
  }
  return found;
}
const onLow = onsets(low);
const onHigh = onsets(high);
const strongLow = onsets(low, 10, 25);
const strongHigh = onsets(high, 10, 25);
const stems = Object.fromEntries(Object.keys(song.stems).map(s => [s, D.decodeStereo(join(OUT, song.stems[s]))]));
const stemMono = Object.fromEntries(Object.entries(stems).map(([s, x]) => [s, mono(x)]));

const sections = song.sections.map(sec => {
  const a = Math.round(sec.startBeat * SPB);
  const b = Math.min(m.length, Math.round((sec.startBeat + sec.beats) * SPB));
  const t0 = a / SR;
  const t1 = b / SR;
  const count = xs => xs.filter(t => t >= t0 && t < t1).length;
  return {
    section: sec.nameIs, beats: `${sec.startBeat}-${sec.startBeat + sec.beats}`, sec: `${t0.toFixed(1)}-${t1.toFixed(1)}`,
    rmsDb: r1(db(rms(m, a, b))), under150Db: r1(db(rms(low, a, b))), over5kDb: r1(db(rms(high, a, b))),
    lowOnsetsPerSec: r1(count(onLow) / (t1 - t0)), highOnsetsPerSec: r1(count(onHigh) / (t1 - t0)),
    strongLowPerSec: r1(count(strongLow) / (t1 - t0)), strongHighPerSec: r1(count(strongHigh) / (t1 - t0)),
    stemsDb: Object.fromEntries(Object.entries(stemMono).map(([s, x]) => [s, r1(db(rms(x, a, b)))])),
  };
});

// peaks
const peaks = { mix: r1(db(Math.max(...mix.map(x => x.reduce((p, v) => Math.max(p, Math.abs(v)), 0))))) };
for (const [s, x] of Object.entries(stems)) peaks[s] = r1(db(Math.max(...x.map(c => c.reduce((p, v) => Math.max(p, Math.abs(v)), 0)))));
const loud = D.loudness(join(OUT, 'mix.mp3'));

// the chorus calls rise on their beats in the animals stem: the loudest 5 ms rise within +-60 ms of the beat
const an = stemMono.animals;
function riseNear(beat) {
  const c = Math.round(beat * SPB);
  const w = 220;
  let best = { at: null, jump: -Infinity };
  for (let i = c - Math.round(0.06 * SR); i < c + Math.round(0.06 * SR); i += 44) {
    const before = rms(an, i - w, i);
    const after = rms(an, i, i + w);
    const jump = db(after + 1e-9) - db(before + 1e-9);
    if (jump > best.jump) best = { at: (i - c) / SR, jump };
  }
  return best;
}
const chorusCalls = checks.calls.filter(c => c.chorus);
const rise = chorusCalls.map(c => ({ beat: c.beat, group: c.group, ...riseNear(c.beat) }));
const pitch = {
  chorusTrumpetCentsMaxAbs: r1(Math.max(...checks.chorus.map(c => Math.abs(c.cents)))),
  chorusNotes: checks.chorus.length,
  calls: Object.values(Object.fromEntries(checks.calls.map(c => [c.take + c.group, { group: c.group, take: c.take, rate: c.rate, ownHz: c.ownHz, listedHz: c.listedHz,
    hzAfter: c.hzAfter, toneHz: c.toneHz, cents: c.cents, spreadCents: c.spreadCents }]))),
  horn: checks.horn.map(h => ({ beat: h.beat, group: h.group, toneHz: h.toneHz, hzAfter: h.hzAfter, cents: h.cents })),
};
// the grid: every call's onset sample is its beat's sample
const offGrid = checks.calls.filter(c => c.onsetSample !== Math.round(c.beat * SPB)).length;

// the loop's seam, per stem: the last 50 ms before the loop's end against the last 50 ms before its start
const L0 = Math.round(song.loop.startBeat * SPB);
const L1 = Math.round((song.loop.startBeat + song.loop.beats) * SPB);
const seam = {};
for (const [s, [Lc, Rc]] of Object.entries(stems)) {
  const w = Math.round(0.05 * SR);
  let diff = 0;
  let ref = 0;
  for (const x of [Lc, Rc]) for (let i = 1; i <= w; i++) { diff += (x[L1 - i] - x[L0 - i]) ** 2; ref += x[L1 - i] ** 2; }
  const jump = Math.max(Math.abs(Lc[L1 - 1] - Lc[L0 - 1]), Math.abs(Rc[L1 - 1] - Rc[L0 - 1]));
  seam[s] = { differenceDb: r1(db(Math.sqrt(diff / (2 * w))) - db(Math.sqrt(ref / (2 * w)) + 1e-12)), levelDb: r1(db(Math.sqrt(ref / (2 * w)))), lastSampleJump: +jump.toFixed(5) };
}

// the stems sum to the mix before its master: mix - masterGain * (sum of stems), relative to the mix (the limiter and mp3 are the rest)
let stemSum;
{
  const g = 10 ** (checks.masterGainDb / 20);
  let res = 0;
  let ref = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < mix[c].length; i++) {
      let s = 0;
      for (const x of Object.values(stems)) s += x[c][i] ?? 0;
      res += (mix[c][i] - g * s) ** 2;
      ref += mix[c][i] ** 2;
    }
  }
  stemSum = { residualDb: r1(10 * Math.log10(res / ref)) };
}
// startle check: where a 100 ms RMS rises most over the mean of the second before it (a child jumps at a big sudden rise)
const startle = [];
{
  const hop = Math.round(0.05 * SR);
  const w = Math.round(0.1 * SR);
  const e = [];
  for (let s = 0; s + w <= m.length; s += hop) e.push(db(rms(m, s, s + w) + 1e-9));
  for (let k = 20; k < e.length; k++) {
    const before = 20 * Math.log10(e.slice(k - 20, k).reduce((s, v) => s + 10 ** (v / 20), 0) / 20);
    startle.push({ sec: +((k * hop) / SR).toFixed(2), rise: r1(e[k] - before), level: r1(e[k]) });
  }
  startle.sort((a, b) => b.rise - a.rise);
  startle.splice(8);
}
// per bar of the build and the drop: RMS, so the riser can be seen growing
const bars = [];
for (let b = 52; b < 60; b++) {
  const a = Math.round(b * 4 * SPB);
  bars.push({ bar: b + 1, rmsDb: r1(db(rms(m, a, Math.round((b + 1) * 4 * SPB)))), beatStemDb: r1(db(rms(stemMono.beat, a, Math.round((b + 1) * 4 * SPB)))) });
}

const report = { loudness: loud, peaksDbfs: peaks, stemSum, sections, buildBars: bars, startle, pitch, offGrid, chorusRise: rise, seam,
  cues: song.cues.reduce((o, c) => ({ ...o, [c.kind]: (o[c.kind] ?? 0) + 1 }), {}) };
writeFileSync(join(OUT, 'analysis.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('loudness', loud, 'peaks dBFS', peaks);
console.table(sections.map(({ stemsDb, ...s }) => s));
console.table(sections.map(s => ({ section: s.section, ...s.stemsDb })));
console.log('chorus trumpet max |cents|', pitch.chorusTrumpetCentsMaxAbs, 'of', pitch.chorusNotes, 'notes; calls off the grid:', offGrid);
console.table(pitch.calls);
console.table(pitch.horn);
const weak = rise.filter(r => r.jump < 3 || Math.abs(r.at) > 0.03);
console.log(`chorus calls rising on their beat: ${rise.length - weak.length}/${rise.length}`, weak.length ? weak : '');
console.log('stems against the mix (before its master)', stemSum);
console.log('build and drop by bar', bars);
console.log('biggest sudden rises (100 ms over the second before)', startle);
console.log('loop seam', seam);
console.log('cues', report.cues);
