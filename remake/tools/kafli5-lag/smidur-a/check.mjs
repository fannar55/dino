// The checks for what cannot be heard: loudness and peaks, per-unit RMS (all, and under 150 Hz) and drum onsets (rises of a
// 23 ms envelope under 150 Hz and over 5 kHz), per-stem levels per unit, the pitch and timing of every animal call and every
// chorus note, and the loop's seam. Writes qa/remake/kafli5/lag/keppni/smidur-a/check.json and prints a summary.
// `node remake/tools/kafli5-lag/smidur-a/check.mjs`
import { readFileSync, writeFileSync } from 'node:fs';
import { SR, decode, loudness } from './lib/io.mjs';
import { eq, hz } from './lib/dsp.mjs';
import { medianF0, centsToPitchClass } from './lib/pitch.mjs';
import { take, TONE_HZ } from './lib/takes.mjs';
import { compose, BEAT_SAMPLES, SPB, LOOP } from './score.mjs';
import { OUT, STEMS, renderStems, finishStems } from './render.mjs';

const song = JSON.parse(readFileSync(`${OUT}song.json`, 'utf8'));
const report = { loudness: loudness(`${OUT}mix.mp3`) };
const mono = chans => {
  const x = new Float32Array(chans[0].length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (chans[0][i] + chans[1][i]);
  return x;
};
const mix = mono(decode(`${OUT}mix.mp3`, 2));
const stems = Object.fromEntries(STEMS.map(s => [s, decode(`${OUT}stems/${s}.mp3`, 2)]));
report.stemPeaksDb = Object.fromEntries(STEMS.map(s => {
  let p = 0;
  for (const c of stems[s]) for (const v of c) p = Math.max(p, Math.abs(v));
  return [s, Number((20 * Math.log10(p)).toFixed(2))];
}));
const db = v => Number((20 * Math.log10(v + 1e-12)).toFixed(1));
const rms = (x, a, b) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const low = eq(Float32Array.from(mix), [['lp', 150, 0.7], ['lp', 150, 0.7]]);
const high = eq(Float32Array.from(mix), [['hp', 5000, 0.7], ['hp', 5000, 0.7]]);
/** Onsets: rises of a 23 ms RMS envelope (hop 5.8 ms) by 4 dB over the last 23 ms, above a floor, 90 ms apart. */
function onsets(x, floorDb) {
  const win = 1014;
  const hop = 256;
  const n = Math.floor((x.length - win) / hop);
  const e = new Float32Array(n);
  for (let k = 0; k < n; k++) e[k] = 20 * Math.log10(rms(x, k * hop, k * hop + win) + 1e-9);
  const list = [];
  let last = -1e9;
  for (let k = 4; k < n; k++) {
    let m = Infinity;
    for (let j = k - 4; j < k; j++) m = Math.min(m, e[j]);
    if (e[k] > floorDb && e[k] - m > 4 && (k - last) * hop > 0.09 * SR) { list.push((k * hop + win / 2) / SR); last = k; }
  }
  return list;
}
// floors relative to the loudest second of each band
const loudest = x => { let m = 0; for (let i = 0; i + SR < x.length; i += SR / 2) m = Math.max(m, rms(x, i, i + SR)); return 20 * Math.log10(m); };
const onLow = onsets(low, loudest(low) - 35);
const onHigh = onsets(high, loudest(high) - 35);
report.units = song.sections.map(s => {
  const a = Math.round(s.startBeat * BEAT_SAMPLES);
  const b = Math.min(mix.length, Math.round((s.startBeat + s.beats) * BEAT_SAMPLES));
  const t0 = a / SR;
  const t1 = b / SR;
  const bars = s.beats / 4;
  const nl = onLow.filter(t => t >= t0 && t < t1).length;
  const nh = onHigh.filter(t => t >= t0 && t < t1).length;
  return {
    unit: s.nameIs, from: Number(t0.toFixed(2)), rmsDb: db(rms(mix, a, b)), lowDb: db(rms(low, a, b)), highDb: db(rms(high, a, b)),
    onsetsLow: nl, onsetsHigh: nh, perBarLow: Number((nl / bars).toFixed(2)), perBarHigh: Number((nh / bars).toFixed(2)),
    stems: Object.fromEntries(STEMS.map(st => [st, db(rms(mono(stems[st]), a, b))])),
  };
});

// ---- the calls and the chorus notes: pitch (YIN on each placed call, as rendered) and placement on the beat ----
const { events } = compose();
const calls = events.filter(e => e.inst === 'take');
const pitchRows = [];
for (const e of calls) {
  const t = take(e.take, e.f || null);
  const target = e.f || TONE_HZ[e.group];
  const seconds = Math.min(e.dur * SPB, 0.6);
  const m = medianF0(t.x, t.onset, Math.min(t.x.length, t.onset + Math.round(seconds * SR)), { minHz: 50, maxHz: 3800, floor: 0.002 });
  const startSample = Math.round(e.beat * BEAT_SAMPLES) - t.onset; // as render.mjs places it
  const heardAt = (startSample + t.onset) / SR;
  pitchRows.push({ beat: e.beat, take: e.take, group: e.group, f0: Number(m.toFixed(1)), cents: m ? Number(centsToPitchClass(m, target).toFixed(0)) : null,
    offBeatMs: Number(((heardAt - e.beat * SPB) * 1000).toFixed(2)) });
}
report.calls = {
  count: pitchRows.length,
  worstCents: pitchRows.filter(r => r.cents !== null && r.take !== 'flyers-3').reduce((w, r) => Math.max(w, Math.abs(r.cents)), 0),
  byTake: Object.fromEntries([...new Set(pitchRows.map(r => r.take))].map(tk => {
    const rows = pitchRows.filter(r => r.take === tk);
    return [tk, { n: rows.length, cents: [...new Set(rows.map(r => r.cents))], offBeatMs: Math.max(...rows.map(r => Math.abs(r.offBeatMs))) }];
  })),
};
// the chorus notes in the stems: the animals stem and the lead stem at each note, YIN against the note
const aMono = mono(stems.animals);
const lMono = mono(stems.lead);
report.chorus = song.chorusMelody.map(c => {
  const dur = c.beat % 1 === 0 ? 1 : 0.5;
  const a = Math.round(c.beat * BEAT_SAMPLES) + Math.round(0.03 * SR);
  const b = a + Math.round(dur * 0.8 * SPB * SR);
  const fa = medianF0(aMono, a, b, { minHz: 60, maxHz: 3800, floor: 0.001 });
  const fl = medianF0(lMono, a, b, { minHz: 100, maxHz: 2000, floor: 0.001 });
  const want = hz(c.note);
  return { beat: c.beat, group: c.group, note: c.note, animalF0: Number(fa.toFixed(1)), animalCents: fa ? Number(centsToPitchClass(fa, want).toFixed(0)) : null,
    leadF0: Number(fl.toFixed(1)), leadCents: fl ? Number(centsToPitchClass(fl, want).toFixed(0)) : null };
});
// how far each sung chorus note stands over the orchestra at the same moment (1-5 kHz, where the calls live)
const band = x => eq(Float32Array.from(x), [['hp', 1000, 0.7], ['lp', 5000, 0.7]]);
const aBand = band(aMono);
const restBand = band(mono([0, 1].map(ch => { const o = new Float32Array(mix.length); for (const st of ['pad', 'bass', 'beat', 'lead']) { const a = stems[st][ch]; for (let i = 0; i < o.length && i < a.length; i++) o[i] += a[i]; } return o; })));
for (const r of report.chorus) {
  const a = Math.round(r.beat * BEAT_SAMPLES);
  const b = a + Math.round(0.9 * SPB * SR);
  r.overOrchestraDb = Number((db(rms(aBand, a, b)) - db(rms(restBand, a, b))).toFixed(1));
}
report.chorusOverOrchestraDb = { min: Math.min(...report.chorus.map(r => r.overOrchestraDb)), mean: Number((report.chorus.reduce((s, r) => s + r.overOrchestraDb, 0) / report.chorus.length).toFixed(1)) };
const chorusBad = report.chorus.filter(r => r.animalCents === null || Math.abs(r.animalCents) > 30 || r.leadCents === null || Math.abs(r.leadCents) > 30);

// ---- the loop's seam: bar 5 must equal bar 9 in every stem, and what bars 4 and 8 leave ringing past bars 6 and 10 must be tiny
const strip = e => JSON.stringify({ ...e, beat: Number((e.beat % 4).toFixed(4)), swell: undefined });
const bar5 = events.filter(e => e.beat >= 20 && e.beat < 24).map(strip).sort();
const bar9 = events.filter(e => e.beat >= 36 && e.beat < 40).map(strip).sort();
const same = bar5.length === bar9.length && bar5.every((v, i) => v === bar9[i]);
// render bars 4 and 8 alone (each into its own window) and measure what is left one bar after their next bar ends
function aloneTail(barStartBeat) {
  const offset = Math.round(barStartBeat * BEAT_SAMPLES) - Math.round(2 * BEAT_SAMPLES);
  const length = Math.round(16 * BEAT_SAMPLES);
  const st = finishStems(renderStems(events, length, e => e.beat >= barStartBeat && e.beat < barStartBeat + 4, offset));
  const a = Math.round(2 * BEAT_SAMPLES) + Math.round(8 * BEAT_SAMPLES); // two bars after the bar's start
  let s = 0;
  for (const name of STEMS) for (const c of st[name]) for (let i = a; i < length; i++) s += c[i] * c[i];
  return Math.sqrt(s / ((length - a) * 10));
}
const tail4 = aloneTail(16);
const tail8 = aloneTail(32);
let loopRms = 0;
{
  const a = Math.round(LOOP.startBeat * BEAT_SAMPLES);
  const b = Math.round((LOOP.startBeat + LOOP.beats) * BEAT_SAMPLES);
  let s = 0;
  for (const name of STEMS) for (const c of stems[name]) for (let i = a; i < b; i++) s += c[i] * c[i];
  loopRms = Math.sqrt(s / ((b - a) * 10));
}
// the decoded stems are at the mix's unmastered scale; the alone renders are before that common scale, so compare by ratio to a
// render of the loop's own bar 8 at the same scale
const ref = (() => {
  const offset = Math.round(32 * BEAT_SAMPLES);
  const length = Math.round(4 * BEAT_SAMPLES);
  const st = finishStems(renderStems(events, length, e => e.beat >= 24 && e.beat < 40, offset));
  let s = 0;
  for (const name of STEMS) for (const c of st[name]) for (let i = 0; i < length; i++) s += c[i] * c[i];
  return Math.sqrt(s / (length * 10));
})();
report.loop = { bars: '6-9', bar5EqualsBar9: same, eventsInBar5: bar5.length, tailOfBar4IntoLoopDb: db(tail4 / ref), tailOfBar8PastLoopEndDb: db(tail8 / ref),
  loopRmsDb: db(loopRms) };

// per-bar RMS of the whole song (the arc), and the bass stem's mids (a tablet hears 200 Hz - 2 kHz, not the fundamentals)
report.barsDb = [];
for (let bar = 0; bar * 4 * BEAT_SAMPLES < mix.length; bar++) {
  const a = bar * 4 * BEAT_SAMPLES;
  report.barsDb.push(db(rms(mix, a, Math.min(mix.length, a + 4 * BEAT_SAMPLES))));
}
{
  const bm = mono(stems.bass);
  const mids = eq(Float32Array.from(bm), [['hp', 200, 0.7], ['lp', 2000, 0.7]]);
  report.bassMidsDb = db(rms(mids, 0, mids.length)) - db(rms(bm, 0, bm.length));
}
writeFileSync(`${OUT}check.json`, `${JSON.stringify({ ...report, callRows: pitchRows }, null, 2)}\n`);
console.log('loudness', report.loudness, 'stem peaks', report.stemPeaksDb);
console.log('unit                      from   rms   <150  >5k  onL/bar onH/bar | pad bass beat lead animals');
for (const u of report.units) {
  console.log(`${u.unit.padEnd(22)} ${String(u.from).padStart(7)} ${String(u.rmsDb).padStart(6)} ${String(u.lowDb).padStart(6)} ${String(u.highDb).padStart(6)} ${String(u.perBarLow).padStart(6)} ${String(u.perBarHigh).padStart(6)} | ${STEMS.map(s => u.stems[s]).join(' ')}`);
}
console.log(`calls: ${report.calls.count}, worst pitch ${report.calls.worstCents} c (curlew glide excluded)`);
for (const [tk, v] of Object.entries(report.calls.byTake)) console.log(`  ${tk.padEnd(10)} n ${v.n} cents ${v.cents.join(',')} off beat ${v.offBeatMs} ms`);
console.log(`chorus notes: ${report.chorus.length}, off (>30 c or unvoiced): ${chorusBad.length}`);
for (const r of chorusBad) console.log('  ', JSON.stringify(r));
console.log('loop', report.loop);
console.log('bars (dB):', report.barsDb.map((v, i) => (i % 8 === 0 ? `
  ${String(i).padStart(2)}: ` : '') + v).join(' '));
console.log('chorus notes over the orchestra (1-5 kHz):', report.chorusOverOrchestraDb);
{ const z = mix.length - Math.round(0.25 * SR); console.log('last 0.25 s of the mix:', db(rms(mix, z, mix.length)), 'dBFS'); }
console.log('bass stem 200 Hz-2 kHz relative to all of it:', report.bassMidsDb.toFixed(1), 'dB');
