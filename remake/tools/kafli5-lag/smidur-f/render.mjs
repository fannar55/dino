// node remake/tools/kafli5-lag/smidur-f/render.mjs
// Renders smidur-f's song from scratch (deterministic: every random choice is keyed): the five stems, the mastered mix, the
// pictures, song.json, and a measurement report (qa.json) of loudness, peaks, the sections' shape, the animals' pitch and
// timing, and the loop's seam.
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { SR, writeWav, encodeMp3, decode } from './lib/io.mjs';
import { Desk, at, BPM, beatSec, B } from './lib/mix.mjs';
import { biquad, dbToGain } from './lib/dsp.mjs';
import { compose, finish, SECTIONS, LOOP, END_BEAT, TAIL_SEC, TUNE } from './score.mjs';
import { call, TAKES, HLJOD_REL, KEY_NAME, toneHz } from './lib/takes.mjs';
import { lufs, ebur, peakDb, truePeakDb, rmsStretch, onsets, pitchAt, attackNear } from './lib/measure.mjs';
import { track } from './lib/pitch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../../..');
const SLOT = 'smidur-f';
const OUT = join(ROOT, 'qa/remake/kafli5/lag/keppni', SLOT);
const WORK = join(OUT, '_work');
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

mkdirSync(join(OUT, 'stems'), { recursive: true });
mkdirSync(WORK, { recursive: true });

// ---------------------------------------------------------------- render
const lengthSec = END_BEAT * beatSec + TAIL_SEC;
const loopS = at(LOOP.startBeat), loopE = at(LOOP.startBeat + LOOP.beats);
const desk = new Desk(lengthSec, { loop: { start: loopS, end: loopE } });
log('composing', lengthSec.toFixed(2), 's');
const { cues, tuneNotes, calls } = compose(desk);
log('sub-buses');
finish(desk);
log('reverbs');
desk.reverbs({
  pad: { t60: 1.7, damp: 5000, pre: 0.02, db: -2 },
  lead: { t60: 1.5, damp: 6000, pre: 0.018, db: -1 },
  animals: { t60: 1.9, damp: 6500, pre: 0.025, db: -2 },
  beat: { t60: 0.9, damp: 7000, pre: 0.008, size: 0.7, db: -3 },
  bass: { t60: 0.5, damp: 2000, pre: 0.005, size: 0.5, db: -20 },
});

// ---------------------------------------------------------------- stems: one common gain so the sum sits at -6 dBFS peak
const names = ['pad', 'bass', 'beat', 'lead', 'animals'];
const n = desk.n;
const sumL = new Float32Array(n), sumR = new Float32Array(n);
for (const s of names) for (let t = 0; t < n; t++) { sumL[t] += desk.stems[s].L[t]; sumR[t] += desk.stems[s].R[t]; }
const sumPeak = peakDb(sumL, sumR);
const stemGain = dbToGain(-6 - sumPeak);
for (const s of names) for (const c of ['L', 'R']) { const b = desk.stems[s][c]; for (let t = 0; t < n; t++) b[t] *= stemGain; }
for (let t = 0; t < n; t++) { sumL[t] *= stemGain; sumR[t] *= stemGain; }
log('pre-master sum peak', (sumPeak).toFixed(2), 'dB; stems scaled', (20 * Math.log10(stemGain)).toFixed(2), 'dB');

// ---------------------------------------------------------------- master: high-pass, glue, gain, look-ahead limiter
function master(L, R, gainDb, ceilingDb) {
  const oL = Float32Array.from(L), oR = Float32Array.from(R);
  const h1 = biquad('hp', 28, 0.7), h2 = biquad('hp', 28, 0.7);
  for (let t = 0; t < n; t++) { oL[t] = h1(oL[t]); oR[t] = h2(oR[t]); }
  // glue: a slow 1.8:1 over a threshold 8 dB under the loudest RMS stretches
  const att = Math.exp(-1 / (0.012 * SR)), rel = Math.exp(-1 / (0.18 * SR));
  let e = 0;
  const thr = -20;
  const g = dbToGain(gainDb);
  for (let t = 0; t < n; t++) {
    const x = (oL[t] * oL[t] + oR[t] * oR[t]) / 2;
    e = x > e ? att * e + (1 - att) * x : rel * e + (1 - rel) * x;
    const lev = 10 * Math.log10(e + 1e-12);
    const gr = lev > thr ? (lev - thr) * (1 - 1 / 1.8) : 0;
    const k = g * dbToGain(-gr);
    oL[t] *= k;
    oR[t] *= k;
  }
  // limiter: gain from the coming 4 ms' peak, smoothed, released over 90 ms
  const ceil = dbToGain(ceilingDb);
  const LA = Math.round(0.004 * SR);
  const tg = new Float32Array(n);
  for (let t = 0; t < n; t++) tg[t] = Math.min(1, ceil / (Math.max(Math.abs(oL[t]), Math.abs(oR[t])) + 1e-12));
  // running min over [t, t+LA] (deque)
  const mn = new Float32Array(n);
  const dq = [];
  let head = 0;
  for (let t = n - 1; t >= 0; t--) {
    while (dq.length > head && tg[dq[dq.length - 1]] >= tg[t]) dq.pop();
    dq.push(t);
    while (dq[head] > t + LA) head++;
    mn[t] = tg[dq[head]];
  }
  // moving average over LA (keeps the gain under every peak) then release
  const relC = 1 - Math.exp(-1 / (0.09 * SR));
  let acc = 0, gg = 1;
  const ring = new Float64Array(LA);
  for (let t = 0; t < n; t++) {
    acc += mn[t] - ring[t % LA];
    ring[t % LA] = mn[t];
    const avg = Math.min(acc / Math.min(t + 1, LA), mn[t]);
    gg = avg < gg ? avg : gg + (avg - gg) * relC;
    oL[t] *= gg;
    oR[t] *= gg;
  }
  return [oL, oR];
}
let gain = 0, mL, mR, measured;
const preLufs = lufs(sumL, sumR);
gain = -16 - preLufs;
let ceiling = -1.9;
for (let it = 0; it < 4; it++) {
  [mL, mR] = master(sumL, sumR, gain, ceiling);
  measured = lufs(mL, mR);
  log(`master pass ${it}: gain ${gain.toFixed(2)} dB → ${measured.toFixed(2)} LUFS`);
  if (Math.abs(measured + 16) < 0.15) break;
  gain += -16 - measured;
}

// ---------------------------------------------------------------- write audio
const wav = (name, L, R) => {
  const f = join(WORK, name + '.wav');
  writeWav(f, [L, R]);
  return f;
};
log('encoding');
encodeMp3(wav('mix', mL, mR), join(OUT, 'mix.mp3'));
for (const s of names) encodeMp3(wav(s, desk.stems[s].L, desk.stems[s].R), join(OUT, 'stems', s + '.mp3'));
let loud = ebur(join(OUT, 'mix.mp3'));
log('mix.mp3', loud);
// keep the true peak under -1 dBTP after encoding
for (let it = 0; it < 3 && loud.TP > -1.15; it++) {
  ceiling -= loud.TP + 1.25;
  [mL, mR] = master(sumL, sumR, gain, ceiling);
  measured = lufs(mL, mR);
  gain += -16 - measured;
  [mL, mR] = master(sumL, sumR, gain, ceiling);
  encodeMp3(wav('mix', mL, mR), join(OUT, 'mix.mp3'));
  loud = ebur(join(OUT, 'mix.mp3'));
  log('re-mastered', ceiling.toFixed(2), loud);
}

// ---------------------------------------------------------------- pictures
log('pictures');
const mixMp3 = join(OUT, 'mix.mp3');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mixMp3, '-lavfi', 'showspectrumpic=s=1600x640:legend=1:scale=log:fscale=lin:stop=12000', join(OUT, 'spectrogram.png')]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mixMp3, '-lavfi', 'showwavespic=s=1600x360:split_channels=1:colors=#2b6cb0|#c05621', join(OUT, 'waveform.png')]);

// ---------------------------------------------------------------- measure
log('measuring');
const qa = { stems: {}, sections: [], tune: [], takes: {}, loop: {}, trimmedPreRolls: desk.trimmed.length };
const [dL, dR] = decode(mixMp3, 2);
// the decoded mp3 carries the encoder's delay: find it against our mix by cross-correlating the start of the music
const lag = (() => {
  let best = 0, bestV = -Infinity;
  const a = Math.round(2 * SR), len = Math.round(1.5 * SR);
  for (let d = 0; d < 3000; d++) {
    let s = 0;
    for (let i = a; i < a + len; i += 3) s += dL[i + d] * mL[i];
    if (s > bestV) { bestV = s; best = d; }
  }
  return best;
})();
qa.mp3DelaySamples = lag;
for (const s of names) {
  const st = desk.stems[s];
  qa.stems[s] = { peakDb: +peakDb(st.L, st.R).toFixed(2), truePeakDb: +truePeakDb(st.L, st.R).toFixed(2), lufs: +lufs(st.L, st.R).toFixed(2) };
  const mp3 = ebur(join(OUT, 'stems', s + '.mp3'));
  qa.stems[s].mp3TruePeak = mp3.TP;
}
const ons = onsets(dL, dR).map(i => i - lag);
for (const sec of SECTIONS) {
  const from = at(B(sec.bars[0])), to = sec.name === 'Ending' ? n : at(B(sec.bars[1] + 1));
  const r = rmsStretch(dL.subarray(lag), dR.subarray(lag), from, Math.min(to, dL.length - lag));
  const bars = sec.bars[1] - sec.bars[0] + 1;
  const count = ons.filter(o => o >= from && o < to).length;
  const lu = lufs(dL.subarray(lag + from, lag + Math.min(to, dL.length - lag)), dR.subarray(lag + from, lag + Math.min(to, dL.length - lag)));
  qa.sections.push({ name: sec.name, bars: sec.bars, lufs: +lu.toFixed(1), rmsDb: +r.rms.toFixed(1), under150Db: +r.low.toFixed(1), onsetsPerBar: +(count / bars).toFixed(1) });
}
// her tune, as heard in the animals stem: the attack (where the stem's energy rises at the note) against the beat, and the
// pitch over the note's held part (from 60 ms after the attack to the next note or 0.5 s), median of the clear frames
const an = new Float32Array(n);
for (let t = 0; t < n; t++) an[t] = (desk.stems.animals.L[t] + desk.stems.animals.R[t]) / 2;
// for the pitch, each note is heard through a band around its own tone (two band-passes), so a neighbour's tail does not lead
const banded = new Map();
const bandFor = hz => {
  const key = Math.round(hz);
  if (!banded.has(key)) {
    const f1 = biquad('bp', hz, 2), f2 = biquad('bp', hz, 2);
    const y = new Float32Array(n);
    for (let t = 0; t < n; t++) y[t] = f2(f1(an[t]));
    banded.set(key, y);
  }
  return banded.get(key);
};
tuneNotes.forEach((tn, i) => {
  const c = calls.find(x => x.tune && Math.abs(x.beat - tn.beat) < 1e-3);
  const s = at(tn.beat);
  const attack = attackNear(an, s);
  const next = tuneNotes[i + 1] ? at(tuneNotes[i + 1].beat) : s + SR;
  const until = Math.min(attack + Math.round(0.5 * SR), next - Math.round(0.03 * SR));
  const ps = [];
  for (let p0 = attack + Math.round(0.06 * SR); p0 + 2048 <= until + 1024; p0 += Math.round(0.015 * SR)) {
    const p = pitchAt(bandFor(c.target), p0, c.target);
    if (p.clarity > 0.8) ps.push(p.hz);
  }
  ps.sort((x, y) => x - y);
  const hz = ps.length ? ps[ps.length >> 1] : null;
  qa.tune.push({ group: tn.group, beat: tn.beat, target: +c.target.toFixed(1), heardHz: hz && +hz.toFixed(1), cents: hz ? +(1200 * Math.log2(hz / c.target)).toFixed(1) : null, attackMs: +(((attack - s) / SR) * 1000).toFixed(1), clearFrames: ps.length });
});
// every take as moved: pitch on its steady part, alone
const seen = new Set();
for (const c of calls) {
  if (seen.has(c.name)) continue;
  seen.add(c.name);
  const cc = call(c.name);
  const fr = track(cc.buf, { fmin: Math.max(50, cc.target / 2.2), fmax: Math.min(4000, cc.target * 2.2) });
  const pk = Math.max(...fr.map(f => f.rms));
  const good = fr.filter(f => f.clarity > 0.8 && f.rms > pk * 0.3).map(f => f.hz * 2 ** Math.round(Math.log2(cc.target / f.hz))).sort((a, b) => a - b);
  const m = good[good.length >> 1];
  qa.takes[c.name] = { group: c.group, own: +cc.own.toFixed(1), target: +cc.target.toFixed(1), rate: +cc.rate.toFixed(4), heard: m ? +m.toFixed(1) : null, cents: m ? +(1200 * Math.log2(m / cc.target)).toFixed(1) : null, uses: calls.filter(x => x.name === c.name).length };
}
// bar by bar: each stem's RMS and the mix's, so the arrangement's story can be read
qa.bars = [];
for (let bar = 1; bar <= END_BEAT / 4 + 1; bar++) {
  const a = at(B(bar)), b = Math.min(n, at(B(bar + 1)));
  const row = { bar };
  for (const s of names) row[s] = +rmsStretch(desk.stems[s].L, desk.stems[s].R, a, b).rms.toFixed(1);
  row.mix = +rmsStretch(mL, mR, a, b).rms.toFixed(1);
  qa.bars.push(row);
}
// the loop's seam: what comes before its start must equal what comes before its end
for (const s of names) {
  const st = desk.stems[s];
  let d = 0, e = 0;
  for (let k = 1; k <= Math.round(2 * SR); k++) {
    d = Math.max(d, Math.abs(st.L[loopS - k] - st.L[loopE - k]), Math.abs(st.R[loopS - k] - st.R[loopE - k]));
    e = Math.max(e, Math.abs(st.L[loopE - k]));
  }
  // and the step across the seam itself
  const jump = Math.max(Math.abs(st.L[loopE - 1] - st.L[loopS - 1]), Math.abs(st.R[loopE - 1] - st.R[loopS - 1]));
  qa.loop[s] = { maxDiffBefore: +d.toExponential(2), peakNear: +e.toFixed(4), seamStep: +jump.toExponential(2) };
}
qa.loudness = { mixLufs: loud.I, mixTruePeak: loud.TP, lra: loud.LRA, ownLufs: +measured.toFixed(2), ceiling: +ceiling.toFixed(2), masterGain: +gain.toFixed(2) };

// ---------------------------------------------------------------- song.json
const sources = [...new Set(calls.map(c => c.name)), 'marimba', 'horn-1', 'horn-2'].map(nm => `${HLJOD_REL}/${nm}.mp3 (${TAKES[nm].licence})`);
const song = {
  slot: SLOT,
  name: 'Kúmbía við tjörnina',
  style: 'Amazonian cumbia (chicha) with a Pacific-coast currulao turn: twang guitar, combo organ, scraper, congas and tambora, the animals in the band',
  bpm: BPM,
  beatZeroSec: 0,
  key: KEY_NAME,
  lengthSec: +(n / SR).toFixed(3),
  tune: TUNE,
  sections: SECTIONS.map(s => {
    const startBeat = B(s.bars[0]);
    const beats = s.name === 'Ending' ? END_BEAT - startBeat + 1 : (s.bars[1] - s.bars[0] + 1) * 4;
    return { name: s.name, nameIs: s.nameIs, startBeat, beats, startSec: +(startBeat * beatSec).toFixed(4), feature: s.feature, what: s.what };
  }),
  tuneNotes,
  cues,
  loop: { startBeat: LOOP.startBeat, beats: LOOP.beats, startSec: +(LOOP.startBeat * beatSec).toFixed(4), endSec: +((LOOP.startBeat + LOOP.beats) * beatSec).toFixed(4) },
  stems: { pad: 'stems/pad.mp3', bass: 'stems/bass.mp3', beat: 'stems/beat.mp3', lead: 'stems/lead.mp3', animals: 'stems/animals.mp3' },
  sources,
  loudness: { lufs: loud.I, truePeak: loud.TP },
};
writeFileSync(join(OUT, 'song.json'), JSON.stringify(song, null, 2) + '\n');
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(qa, null, 2) + '\n');
rmSync(WORK, { recursive: true, force: true });

// ---------------------------------------------------------------- report
console.log('\nsections');
for (const s of qa.sections) console.log(' ', s.name.padEnd(13), `bars ${s.bars.join('-').padEnd(6)} lufs ${String(s.lufs).padStart(6)} rms ${String(s.rmsDb).padStart(6)}  <150Hz ${String(s.under150Db).padStart(6)}  onsets/bar ${s.onsetsPerBar}`);
console.log('tune notes (cents off, attack ms):', qa.tune.map(t => `${t.group[0]}${t.cents ?? '?'}/${t.attackMs}`).join(' '));
console.log('takes:', Object.entries(qa.takes).map(([k, v]) => `${k} ${v.cents}c`).join(', '));
console.log('loop:', JSON.stringify(qa.loop));
console.log('stems:', JSON.stringify(qa.stems));
console.log('loudness:', JSON.stringify(qa.loudness), 'pre-rolls trimmed at the loop end:', qa.trimmedPreRolls);
log('done', relative(ROOT, OUT));
void existsSync; void toneHz;
console.log('bars (rms dB: pad bass beat lead animals | mix)');
for (const r of qa.bars) console.log(`  ${String(r.bar).padStart(2)} ${[r.pad, r.bass, r.beat, r.lead, r.animals].map(v => String(Math.round(v)).padStart(4)).join('')} | ${r.mix}`);
