// remix-b: "Aftur! Aftur!", DJ Flugeðla's turntable remix of Ljósfluguballið (smidur-e). Run from anywhere:
//   node remake/tools/kafli5-lag/remix-b/render.mjs [--quick] [--fresh]
// 1. Renders E's song from my copy of its score and synths into seven source stems (the record): kick, the rest of the drums,
//    pad, bass, lead, animals, and the record's own crackle (cached in work/ by a hash of the code; --fresh renders anew).
// 2. Plays that record through her moves on the decks (lib/remix.mjs): rewinds, brakes, half and double speed, juggles,
//    stutters; every stem through the same moves, so the record moves as one.
// 3. Adds the output's own layers: crowd claps, kicks, the animals' answers and cut-up riffs, beetles, dragonflies, her wings,
//    the needle; her scratches; her lines on the grid with echo throws and stutters, the music ducked under her.
// 4. Masters to -16 LUFS, true peak under -1 dBTP; writes mix.mp3, stems/*.mp3, song.json, checks.json and the pictures.
// Deterministic: every random choice is seeded.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SR, writeWav, encodeMp3, ebur128, decode, spawnText } from './lib/io.mjs';
import { stereo, mtof, peakOf, addMono, addStereo, reverb, Biquad } from './lib/dsp.mjs';
import { lufs, limit, kweight } from './lib/master.mjs';
import { BPM, SPB, KEY, TONE, TUNE, END_BEAT, buildScore } from './lib/score.mjs';
import { kickSamples, renderPad, renderBass, renderBeat, renderLead, renderAnimals, sampleOf, setLoopEnd } from './lib/parts.mjs';
import { TAKES, loadTake, moved, resample } from './lib/takes.mjs';
import { sectionStats, loopSeam, callCheck, barRms, mono, lowpassed, biggestJump } from './lib/analyze.mjs';
import { steady, cents } from './lib/pitch.mjs';
import * as V from './lib/synths.mjs';
import { renderDeck, prepare, mapBeat } from './lib/deck.mjs';
import { recordCrackle, needleDrop, needleLift, scratch, beetleClick, dragonfly } from './lib/turntable.mjs';
import { loadLine, placeLine, measureTake } from './lib/dj.mjs';
import { OUT_SECTIONS, OUT_LOOP, LAST_HIT, END_SEC, VINYL, buildMoves, buildLayers, buildScratches, PLACES } from './lib/remix.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../../..');
const HLJOD = join(ROOT, 'remake/assets/audio/kafli5/hljod');
const HLJOD4 = join(ROOT, 'remake/assets/audio/kafli4/hljod');
const VOICES = join(ROOT, 'remake/assets/audio/kafli5');
const OUT = join(ROOT, 'qa/remake/kafli5/lag/remix/remix-b');
const WORK = join(OUT, 'work');
const SLOT = 'remix-b';
const QUICK = process.argv.includes('--quick');
const FRESH = process.argv.includes('--fresh');
const t0 = Date.now();
const say = msg => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
mkdirSync(join(OUT, 'stems'), { recursive: true });
mkdirSync(WORK, { recursive: true });
const db = v => (v > 0 ? 20 * Math.log10(v) : -120);
const r1 = v => +v.toFixed(1);

// ================================================================ 1. the record (E's song, my copy), cached
const SRC_STEMS = ['kick', 'rest', 'pad', 'bass', 'lead', 'animals', 'vinyl'];
const codeHash = createHash('sha1');
for (const f of ['score', 'synths', 'parts', 'takes', 'dsp', 'pitch', 'analyze', 'master']) codeHash.update(readFileSync(join(here, 'lib', `${f}.mjs`)));
codeHash.update(recordCrackle.toString());
const HASH = codeHash.digest('hex').slice(0, 12);
const score = buildScore();
const srcN = Math.ceil((END_BEAT * 0.48 + 3.0) * SR);
let src = {}, srcInfo;
const metaFile = join(WORK, 'source.json');
if (!FRESH && existsSync(metaFile) && JSON.parse(readFileSync(metaFile, 'utf8')).hash === HASH) {
  srcInfo = JSON.parse(readFileSync(metaFile, 'utf8'));
  for (const k of SRC_STEMS) {
    const b = readFileSync(join(WORK, `src-${k}.f32`));
    const all = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    src[k] = { L: all.slice(0, srcN), R: all.slice(srcN, 2 * srcN), n: srcN };
  }
  say(`record from cache (${HASH})`);
} else {
  const kicks = kickSamples(score);
  const callLog = [];
  src.kick = renderBeat(score, srcN, 'kick'); say('record: kick');
  src.rest = renderBeat(score, srcN, 'rest'); say('record: drums');
  src.pad = renderPad(score, srcN, kicks); say('record: pad');
  src.bass = renderBass(score, srcN, kicks); say('record: bass');
  src.lead = renderLead(score, srcN, kicks, HLJOD); say('record: lead');
  src.animals = renderAnimals(score, srcN, kicks, HLJOD, callLog); say('record: animals');
  src.vinyl = recordCrackle(srcN); say('record: crackle');
  // E's balance: each stem to its own loudness, the drums judged as one, then one gain so their sum sits at -18.5 LUFS
  const BALANCE = { pad: -26, bass: -25, beat: -23.5, lead: -22, animals: -21.5 };
  const gains = {};
  const beatSum = stereo(srcN);
  addStereo(beatSum, src.kick);
  addStereo(beatSum, src.rest);
  for (const k of ['pad', 'bass', 'lead', 'animals']) gains[k] = 10 ** ((BALANCE[k] - lufs(src[k].L, src[k].R)) / 20);
  gains.kick = gains.rest = 10 ** ((BALANCE.beat - lufs(beatSum.L, beatSum.R)) / 20);
  const sum = stereo(srcN);
  for (const k of SRC_STEMS.slice(0, 6)) for (let i = 0; i < srcN; i++) {
    sum.L[i] += src[k].L[i] * gains[k];
    sum.R[i] += src[k].R[i] * gains[k];
  }
  const g0 = 10 ** ((-18.5 - lufs(sum.L, sum.R)) / 20);
  for (const k of SRC_STEMS.slice(0, 6)) gains[k] *= g0;
  gains.vinyl = 0.05; // the crackle: far under everything (its automation lifts it in the intro and at the end)
  for (const k of SRC_STEMS) for (let i = 0; i < srcN; i++) {
    src[k].L[i] *= gains[k];
    src[k].R[i] *= gains[k];
  }
  // the record's calls, measured once (pitch on the call itself, attack against its own beat)
  const tuneSet = new Set(score.tuneNotes.map(t => `${t.group}@${t.beat}`));
  const calls = callLog.map(c => ({ group: c.group, beat: c.beat, mode: c.mode, file: c.file, tune: c.mode === 'onset' && tuneSet.has(`${c.group}@${c.beat}`), ...callCheck(c, mtof(TONE[c.group]), sampleOf(c.beat)) }));
  srcInfo = { hash: HASH, gainsDb: Object.fromEntries(Object.entries(gains).map(([k, v]) => [k, +db(v).toFixed(2)])), gains, calls, files: [...new Set(callLog.map(c => c.file))] };
  for (const k of SRC_STEMS) {
    const both = new Float32Array(2 * srcN);
    both.set(src[k].L, 0);
    both.set(src[k].R, srcN);
    writeFileSync(join(WORK, `src-${k}.f32`), Buffer.from(both.buffer));
  }
  writeFileSync(metaFile, JSON.stringify(srcInfo));
  say(`record rendered and balanced (dB): ${JSON.stringify(srcInfo.gainsDb)}`);
}

// ================================================================ 2. the decks
const n = Math.round(END_SEC * SR);
const moves = prepare(buildMoves());
setLoopEnd(OUT_LOOP.startBeat + OUT_LOOP.beats);
const deck = {};
for (const k of SRC_STEMS) deck[k] = renderDeck(k, src[k], moves, n, { fastGain: k === 'vinyl' ? 1 : 0.5 });
say('decks played');
// the copy is exact where the record plays at speed 1: her song in the output against her song on the record
const exact = (() => {
  let worst = 0;
  const a = Math.round(57 * SPB), b = Math.round(87 * SPB), off = Math.round(-8 * SPB);
  for (const k of ['animals', 'pad', 'kick']) for (let i = a; i < b; i++) worst = Math.max(worst, Math.abs(deck[k].L[i] - src[k].L[i + off]));
  return worst;
})();
say(`deck copy check (her song, out 57-87 vs record 49-79): worst difference ${exact}`);
for (const k of SRC_STEMS) src[k] = null;

// the crackle's automation
{
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = i / SPB;
    let k = 0;
    while (k < VINYL.length - 2 && VINYL[k + 1][0] <= b) k++;
    const [b0, v0] = VINYL[k], [b1, v1] = VINYL[k + 1];
    const u = Math.max(0, Math.min(1, (b - b0) / Math.max(1e-9, b1 - b0)));
    g[i] = v0 + (v1 - v0) * u;
  }
  for (let i = 0; i < n; i++) {
    deck.vinyl.L[i] *= g[i];
    deck.vinyl.R[i] *= g[i];
  }
}

// ================================================================ 3. the output's own layers
const G = srcInfo.gains;
const layers = buildLayers();
const cues = [];
const outBeat = stereo(n), outAnimals = stereo(n), djFx = stereo(n);
// kicks on the output grid (E's kick, the record's level)
{
  const sc = { kick: layers.kick, clap: [], hat: [], ohat: [], shaker: [], conga: [], tom: [], snare: [], cymbal: [], riser: [] };
  const k = renderBeat(sc, n, 'kick');
  addStereo(outBeat, k, 0, G.kick);
}
// the crowd: five animals clapping, the first on the beat, the others a few ms after, spread left and right
for (const c of layers.crowd) {
  [[0, 0, 0.3], [0.004, -0.6, 0.85], [0.009, 0.55, 0.8], [0.014, -0.3, 0.7], [0.019, 0.7, 0.6]].forEach(([dt, pan, v], k) => {
    const y = V.clap({ vel: c.vel * v, seed: 41 + k });
    addMono(outBeat, y, sampleOf(c.beat) + Math.round(dt * SR), 0.42 * G.rest * 0.45, pan);
  });
  cues.push({ beat: c.beat, kind: 'clap' });
}
// the animals' answers and riffs, through E's own animal part (each call measured and trimmed onto its tone)
const PAN = { grazers: -0.35, turtles: -0.18, frogs: 0.18, lizards: 0.35, flyers: 0 };
const outLog = [];
{
  const sc = { calls: layers.calls.map(c => ({ take: 0, octave: 0, pan: PAN[c.group] * 0.7, ...c })) };
  const a = renderAnimals(sc, n, [], HLJOD, outLog);
  addStereo(outAnimals, a, 0, G.animals);
  for (const c of layers.calls) cues.push({ beat: c.beat, kind: 'call', group: c.group });
}
// beetles
{
  const cache = new Map();
  const send = stereo(n);
  layers.beetles.forEach((b, k) => {
    const key = `${b.vel.toFixed(3)}|${b.tone}`;
    if (!cache.has(key)) cache.set(key, beetleClick({ vel: b.vel, tone: b.tone, seed: 3 + (k % 3) }));
    const y = cache.get(key);
    const pan = (k % 2 ? 0.55 : -0.45) * (b.accent ? 0.7 : 1);
    addMono(outAnimals, y, sampleOf(b.beat), 0.5 * G.animals * 4, pan);
    addMono(send, y, sampleOf(b.beat), 0.5 * G.animals, pan);
    if (b.accent) cues.push({ beat: b.beat, kind: 'call', group: 'beetles' });
  });
  addStereo(outAnimals, reverb(send, { decay: 0.8, damp: 7000, lowcut: 800, seed: 21 }), 0, 0.5);
}
// dragonflies
const dfCheck = [];
{
  const send = stereo(n);
  layers.dragonflies.forEach((d, k) => {
    const y = dragonfly(d.dur * 0.48, { from: d.from, vel: d.vel, seed: 4 + k, swoop: 0.05 });
    const pan = [-0.5, 0.4, -0.2, 0.6, -0.6, 0.2][k % 6];
    addMono(outAnimals, y, sampleOf(d.beat), 0.16 * G.animals * 6, pan);
    addMono(send, y, sampleOf(d.beat), 0.16 * G.animals * 2, pan);
    cues.push({ beat: d.beat, kind: 'call', group: 'dragonflies' });
    if (d.dur >= 0.5) {
      const s = steady(y.subarray(Math.round(0.12 * SR), Math.max(Math.round(0.12 * SR) + 4096, y.length - Math.round(0.06 * SR))), { fmin: 400, fmax: 1400, win: 1024, hop: 128 });
      dfCheck.push({ beat: d.beat, hz: s ? +s.hz.toFixed(1) : null, cents: s ? Math.round(cents(s.hz, mtof(76))) : null });
    }
  });
  addStereo(outAnimals, reverb(send, { decay: 1.4, damp: 6000, lowcut: 400, seed: 23 }), 0, 0.6);
}
// her wings beat time (kafli 4's recordings of her wing beats)
{
  const W = ['wing-1.mp3', 'wing-2.mp3', 'wing-3.mp3'].map(f => {
    const x = decode(join(HLJOD4, f))[0];
    let pk = 0, on = 0;
    for (const v of x) pk = Math.max(pk, Math.abs(v));
    while (on < x.length && Math.abs(x[on]) < 0.2 * pk) on++;
    const y = Float32Array.from(x.subarray(Math.max(0, on - Math.round(0.03 * SR)))); // its whoosh peaks on the beat
    new Biquad('hp', 120, 0.7).run(y);
    return { y, pre: Math.min(on, Math.round(0.03 * SR)), pk };
  });
  layers.wings.forEach((w, k) => {
    const s = W[k % 3];
    addMono(outBeat, s.y, sampleOf(w.beat) - s.pre, (0.09 / s.pk) * w.vel * G.rest * 6, k % 2 ? 0.25 : -0.25);
    cues.push({ beat: w.beat, kind: 'wing' });
  });
}
// the needle
addMono(outBeat, needleDrop(), 0, 0.06, 0);
addMono(outBeat, needleLift(), sampleOf(363.25), 0.05, 0);
cues.push({ beat: 0, kind: 'needle' }, { beat: 363.25, kind: 'needle' });

// how loud each new layer is against the record's music where it plays (sample peak and RMS over its zone)
const layerLevels = {};
function levelIn(name, st, from, to) {
  const a = Math.round(from * SPB), b = Math.round(to * SPB);
  let pk = 0, s2 = 0, m2 = 0;
  for (let i = a; i < b; i++) {
    pk = Math.max(pk, Math.abs(st.L[i]), Math.abs(st.R[i]));
    s2 += st.L[i] ** 2 + st.R[i] ** 2;
    let m = 0;
    for (const k of ['kick', 'rest', 'pad', 'bass', 'lead', 'animals']) m += deck[k].L[i];
    m2 += m * m * 2;
  }
  layerLevels[name] = { peakDb: r1(db(pk)), rmsDb: r1(db(Math.sqrt(s2 / (2 * (b - a))))), musicRmsDb: r1(db(Math.sqrt(m2 / (2 * (b - a))))) };
}

// ================================================================ her lines
const lines = JSON.parse(readFileSync(join(here, 'lines.json'), 'utf8'));
const L = Object.fromEntries(lines.map(l => [l.id, loadLine(VOICES, SLOT, l)]));
for (const l of Object.values(L)) {
  const f = Math.round(0.003 * SR); // every take eased in over 3 ms (two start with voice on their first sample)
  for (let i = 0; i < f && i < l.x.length; i++) l.x[i] *= i / f;
}
say(`lines: ${Object.values(L).filter(l => l.placeholder).length} placeholders, ${Object.values(L).filter(l => !l.placeholder).length} takes`);

// her scratches (the "Djamm!" take, and the animals' calls moved onto their tones)
const scratchSrc = {};
{
  const d = L.djamm;
  scratchSrc.djamm = Float32Array.from(d.x.subarray(Math.max(0, d.m.attack - Math.round(0.006 * SR))));
  for (const g of Object.keys(TONE)) {
    const t = loadTake(HLJOD, TAKES[g][0]);
    const m = moved(t, mtof(TONE[g]), 0);
    const s0 = Math.max(0, Math.round(m.steadyFrom * SR - 0.006 * SR));
    const y = Float32Array.from(m.y.subarray(s0));
    let pk = 0;
    for (let i = 0; i < Math.min(y.length, SR * 0.5); i++) pk = Math.max(pk, Math.abs(y[i]));
    for (let i = 0; i < y.length; i++) y[i] /= pk || 1;
    scratchSrc[g] = y;
  }
}
const djScratch = stereo(n);
const scratchLog = [];
for (const [k, s] of buildScratches().entries()) {
  const x = scratchSrc[s.src];
  const { y, at0 } = scratch(x, s.strokes.map(q => ({ ...q, t0: q.t0 + s.at, t1: q.t1 + s.at })), { seed: 50 + k });
  const isDj = s.src === 'djamm';
  const dst = isDj ? djScratch : outAnimals;
  const gain = isDj ? s.gain : s.gain * 0.15 * G.animals;
  addMono(dst, y, at0, gain, isDj ? (k % 2 ? 0.15 : -0.15) : PAN[s.src] ?? 0);
  cues.push({ beat: s.at, kind: 'scratch', src: s.src });
  let peak = 0;
  for (const v of y) peak = Math.max(peak, Math.abs(v));
  scratchLog.push({ src: s.src, beat: s.at, strokes: s.strokes.length, peak: r1(db(peak * gain)) });
}

levelIn('outBeat-intro-needle', outBeat, 0, 2);
levelIn('outBeat-crowd-22', outBeat, 22, 24);
levelIn('outBeat-wings-solo', outBeat, 176, 184);
levelIn('outAnimals-dragonflies', outAnimals, 168, 176);
levelIn('outAnimals-beetles+riff', outAnimals, 184, 192);
levelIn('outAnimals-answers', outAnimals, 198, 200);
levelIn('outAnimals-grazer-drag', outAnimals, 100, 102);
levelIn('djScratch-solo', djScratch, 181, 184);
levelIn('vinyl-intro', deck.vinyl, 0, 16);
levelIn('vinyl-groove', deck.vinyl, 24, 56);
say(`layer levels: ${JSON.stringify(layerLevels)}`);

// ================================================================ the music stems (before the duck)
const stems = {
  pad: deck.pad,
  bass: deck.bass,
  beat: stereo(n),
  lead: deck.lead,
  animals: stereo(n),
};
for (const s of [deck.kick, deck.rest, deck.vinyl, outBeat]) addStereo(stems.beat, s);
for (const s of [deck.animals, outAnimals]) addStereo(stems.animals, s);

// place her lines (dry at unity), duck the music under each, then set each line a few dB over the music under it
const placed = {};
for (const [id, p] of Object.entries(PLACES)) placed[id] = placeLine(L[id], p, n);
const DUCK = { pad: 4.5, lead: 4.5, animals: 3.5, bass: 2, beat: 1.5 };
const duck = new Float32Array(n).fill(1); // 1 where she is silent, down to 0 under her loudest (the deepest line wins)
for (const p of Object.values(placed)) {
  let pk = 0;
  for (let i = p.from; i < p.to; i++) pk = Math.max(pk, Math.abs(p.dry[i]));
  const att = 1 - Math.exp(-1 / (0.012 * SR)), rel = 1 - Math.exp(-1 / (0.25 * SR));
  let env = 0;
  const a = Math.max(0, p.from - Math.round(0.02 * SR)), b = Math.min(n, p.to + Math.round(0.8 * SR));
  for (let i = a; i < b; i++) {
    const v = Math.min(1, Math.abs(p.dry[i]) / (0.3 * pk));
    env += (v - env) * (v > env ? att : rel);
    duck[i] = Math.min(duck[i], 1 - env);
  }
}
for (const [k, dB] of Object.entries(DUCK)) {
  const floor = 10 ** (-dB / 20);
  for (let i = 0; i < n; i++) {
    const g = 1 - (1 - floor) * (1 - duck[i]);
    stems[k].L[i] *= g;
    stems[k].R[i] *= g;
  }
}
say('music ducked under her');
// each line a few dB over the music under it (K-weighted RMS over the line's voiced span)
const TARGET = 4; // dB over the music
const musicK = (() => {
  const m = new Float32Array(n);
  for (const s of Object.values(stems)) for (let i = 0; i < n; i++) m[i] += (s.L[i] + s.R[i]) * 0.5;
  return kweight(m);
})();
const rmsK = (x, a, b) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const lineInfo = [];
const dj = stereo(n);
const djSend = stereo(n);
for (const [id, p] of Object.entries(placed)) {
  const vk = kweight(p.dry.subarray(p.from, p.to));
  const vDb = db(rmsK(vk, 0, vk.length));
  const mDb = db(rmsK(musicK, p.from, p.to));
  const gDb = Math.max(-6, Math.min(10, mDb + TARGET - vDb));
  const g = 10 ** (gDb / 20);
  for (let i = 0; i < n; i++) {
    const v = p.dry[i];
    if (v === 0 && p.fx.L[i] === 0 && p.fx.R[i] === 0) continue;
    dj.L[i] += v * g * 0.71 + p.fx.L[i] * g;
    dj.R[i] += v * g * 0.71 + p.fx.R[i] * g;
    djSend.L[i] += v * g * 0.71;
    djSend.R[i] += v * g * 0.71;
  }
  const where = PLACES[id];
  const beat = where.beat ?? where.beats[0];
  // measured attack of the placed voice against its beat
  const m = measureTake(p.dry.subarray(Math.max(0, p.at - Math.round(0.1 * SR)), p.to));
  const attackMs = ((Math.max(0, p.at - Math.round(0.1 * SR)) + m.attack - p.at) / SR) * 1000;
  lineInfo.push({ id, beat, sec: +(beat * 0.48).toFixed(3), text: L[id].text, file: L[id].file, placeholder: L[id].placeholder, gainDb: r1(gDb), voiceOverMusicDb: r1(vDb + gDb - mDb), musicUnderDb: r1(mDb), attackMs: Math.round(attackMs), beats: where.beats ?? null });
  cues.push({ beat, kind: 'dj', id });
}
addStereo(dj, reverb(djSend, { decay: 0.9, damp: 6500, predelay: 0.015, lowcut: 500, seed: 31, size: 0.7 }), 0, 0.14);
const medGain = 10 ** ([...lineInfo.map(l => l.gainDb)].sort((p, q) => p - q)[lineInfo.length >> 1] / 20);
addStereo(dj, djScratch, 0, medGain * 0.8);
stems.dj = dj;
say(`lines placed: ${lineInfo.map(l => `${l.id} ${l.voiceOverMusicDb}`).join(', ')}`);

// the very end: the needle has lifted; ease the last 0.3 s to zero (no musical fade-out: the record has stopped)
{
  const e = Math.round(0.3 * SR);
  for (const st of Object.values(stems)) for (let i = 0; i < e; i++) {
    st.L[n - 1 - i] *= i / e;
    st.R[n - 1 - i] *= i / e;
  }
}

// ================================================================ 4. master
const sumOf = list => {
  const s = stereo(n);
  for (const st of list) for (let i = 0; i < n; i++) {
    s.L[i] += st.L[i];
    s.R[i] += st.R[i];
  }
  return s;
};
let pre = sumOf(Object.values(stems));
const g0 = 10 ** ((-18.5 - lufs(pre.L, pre.R)) / 20);
for (const st of Object.values(stems)) for (let i = 0; i < n; i++) {
  st.L[i] *= g0;
  st.R[i] *= g0;
}
pre = sumOf(Object.values(stems));
say(`pre-master ${lufs(pre.L, pre.R).toFixed(2)} LUFS`);
const stemPeaks = Object.fromEntries(Object.entries(stems).map(([k, st]) => [k, r1(db(peakOf(st)))]));
say(`stem sample peaks (dBFS): ${JSON.stringify(stemPeaks)}`);
function master(gain, ceilingDb) {
  const Lm = Float32Array.from(pre.L, v => v * gain), Rm = Float32Array.from(pre.R, v => v * gain);
  const lim = limit(Lm, Rm, 10 ** (ceilingDb / 20));
  return { L: Lm, R: Rm, lim, n };
}
let gain = 10 ** ((-16 - lufs(pre.L, pre.R)) / 20);
let ceiling = -1.7;
let mix;
for (let it = 0; it < 4; it++) {
  mix = master(gain, ceiling);
  const l = lufs(mix.L, mix.R);
  say(`master pass ${it}: ${l.toFixed(2)} LUFS, most gain reduction ${db(mix.lim.most).toFixed(2)} dB`);
  if (Math.abs(l + 16) < 0.05) break;
  gain *= 10 ** ((-16 - l) / 20);
}
writeWav(join(WORK, 'mix.wav'), mix.L, mix.R);
encodeMp3(join(WORK, 'mix.wav'), join(OUT, 'mix.mp3'));
let loud = ebur128(join(OUT, 'mix.mp3'));
say(`mix.mp3: ${loud.lufs} LUFS, true peak ${loud.truePeak} dBTP`);
for (let it = 0; it < 3 && (loud.truePeak > -1.1 || Math.abs(loud.lufs + 16) > 0.12); it++) {
  if (loud.truePeak > -1.1) ceiling -= loud.truePeak + 1.25;
  gain *= 10 ** ((-16 - loud.lufs) / 20);
  mix = master(gain, ceiling);
  writeWav(join(WORK, 'mix.wav'), mix.L, mix.R);
  encodeMp3(join(WORK, 'mix.wav'), join(OUT, 'mix.mp3'));
  loud = ebur128(join(OUT, 'mix.mp3'));
  say(`mix.mp3 again: ${loud.lufs} LUFS, true peak ${loud.truePeak} dBTP (ceiling ${ceiling.toFixed(2)})`);
}
for (const [k, st] of Object.entries(stems)) {
  writeWav(join(WORK, `${k}.wav`), st.L, st.R);
  encodeMp3(join(WORK, `${k}.wav`), join(OUT, 'stems', `${k}.mp3`));
}
const stemLoud = {};
if (!QUICK) for (const k of Object.keys(stems)) stemLoud[k] = ebur128(join(OUT, 'stems', `${k}.mp3`));
say(`stems mp3: ${JSON.stringify(stemLoud)}`);

// ================================================================ song.json
const lengthSec = +(n / SR).toFixed(3);
const mapAll = b => {
  const out = [];
  for (const sg of moves) {
    if (sg.level || !(sg.rate > 0)) continue;
    const ob = sg.o0 + (b - sg.src) / sg.rate;
    if (ob >= sg.o0 - 1e-9 && ob < sg.o1 - 1e-9) out.push({ beat: +ob.toFixed(4), rate: sg.rate, kind: sg.kind });
  }
  return out;
};
for (const c of score.cues) for (const o of mapAll(c.beat)) cues.push({ ...c, beat: o.beat, ...(o.rate !== 1 ? { rate: o.rate } : {}) });
for (const sg of moves) {
  if (sg.kind === 'rewind') cues.push({ beat: sg.o0, kind: 'rewind', to: sg.to });
  if (sg.kind === 'brake') cues.push({ beat: sg.o0, kind: 'brake' });
  if (sg.kind === 'half' || sg.kind === 'double') cues.push({ beat: sg.o0, kind: 'speed', rate: sg.rate });
}
for (const b of [136, 140, 188]) cues.push({ beat: b, kind: 'juggle' });
cues.push({ beat: 272, kind: 'stutter' });
cues.sort((p, q) => p.beat - q.beat || p.kind.localeCompare(q.kind));
const tuneNotes = [];
for (const t of score.tuneNotes) for (const ob of mapBeat(moves, t.beat)) tuneNotes.push({ group: t.group, beat: ob });
tuneNotes.sort((p, q) => p.beat - q.beat);
const LIC = {
  'grazers-2.mp3': 'ElevenLabs sound generation, made for this game', 'grazers-3.mp3': 'CC0 1.0, "z-moo01.wav" by Zozzy',
  'turtles-2.mp3': 'ElevenLabs sound generation, made for this game', 'frogs-1.mp3': 'ElevenLabs sound generation, made for this game',
  'frogs-5.mp3': 'CC0 1.0, "Frog.ogg" by egomassive', 'lizards-1.mp3': 'ElevenLabs sound generation, made for this game',
  'flyers-3.mp3': 'CC BY 4.0, "Curlew .wav" by Benboncan, https://freesound.org/people/Benboncan/sounds/72892/',
  'horn-1.mp3': 'CC0 1.0, "Alpenhorn.aiff" by Danjocross', 'marimba.mp3': 'CC0 1.0, "Marimba - C5" by sgossner',
};
const used = [...new Set([...srcInfo.files, ...outLog.map(c => c.file), 'horn-1.mp3', 'marimba.mp3'])];
const song = {
  slot: SLOT,
  name: 'Aftur! Aftur!',
  nameEn: 'Again! Again! (Ljósfluguballið, on DJ Flugeðla\'s decks)',
  remixOf: 'smidur-e: Ljósfluguballið',
  style: 'Turntablist party remix of a French-touch filter-disco song: pull-up rewinds, brakes, half- and double-speed record tricks on the grid, beat juggles, stutter builds, baby / chirp / transformer / flare scratches of the DJ\'s own shout and of the animals\' calls, animal-call cut-ups, call and response',
  bpm: BPM,
  beatZeroSec: 0,
  key: KEY,
  lengthSec,
  tune: TUNE,
  sections: OUT_SECTIONS.map(s => ({ name: s.name, nameIs: s.nameIs, startBeat: s.from, beats: s.to - s.from, startSec: +(s.from * 0.48).toFixed(3), feature: s.feature, what: s.what })),
  tuneNotes,
  cues,
  loop: OUT_LOOP,
  stems: { pad: 'stems/pad.mp3', bass: 'stems/bass.mp3', beat: 'stems/beat.mp3', lead: 'stems/lead.mp3', animals: 'stems/animals.mp3', dj: 'stems/dj.mp3' },
  dj: lineInfo.map(l => ({ id: l.id, beat: l.beat, sec: l.sec, text: l.text, ...(l.beats ? { words: l.beats } : {}) })),
  newAnimals: {
    beetles: 'bjöllur: clicking along in sixteenths in her solo, softly in the last peak (synthesized clicks)',
    dragonflies: 'drekaflugur: wing buzz swooping onto la (E5) with the flyers and in the last peak (synthesized)',
  },
  sources: [
    ...used.map(f => `remake/assets/audio/kafli5/hljod/${f} (${LIC[f] ?? '?'})`),
    'remake/assets/audio/kafli4/hljod/wing-1.mp3, wing-2.mp3, wing-3.mp3 (CC0 1.0, "Large Wings Flapping - Foley.wav" by tothrec2, https://freesound.org/s/596541/): her wing beats',
    ...lineInfo.filter(l => l.file).map(l => `remake/assets/audio/kafli5/${l.file} (Flugeðla, the game's own line)`),
    'everything else synthesized in remake/tools/kafli5-lag/remix-b (from smidur-e\'s score and synths)',
  ],
  loudness: { lufs: loud.lufs, truePeak: loud.truePeak },
};
writeFileSync(join(OUT, 'song.json'), JSON.stringify(song, null, 2) + '\n');
say('song.json');

// ================================================================ pictures
if (!QUICK) {
  spawnText(['-y', '-v', 'error', '-i', join(OUT, 'mix.mp3'), '-lavfi', 'showspectrumpic=s=1800x700:legend=1:scale=log:fscale=log:start=40:stop=16000', join(OUT, 'spectrogram.png')]);
  spawnText(['-y', '-v', 'error', '-i', join(OUT, 'mix.mp3'), '-filter_complex', 'showwavespic=s=1800x360:split_channels=1:filter=peak:colors=#3b6ea8|#c0567a', '-frames:v', '1', join(OUT, 'waveform.png')]);
  spawnText(['-y', '-v', 'error', '-i', join(OUT, 'stems', 'dj.mp3'), '-filter_complex', 'showwavespic=s=1800x200:split_channels=0:filter=peak:colors=#c0567a', '-frames:v', '1', join(OUT, 'waveform-dj.png')]);
  say('pictures');
}

// ================================================================ checks
const checks = { layerLevels, hash: HASH, recordGainsDb: srcInfo.gainsDb, deckCopyWorstDiff: exact, stemSamplePeakDb: stemPeaks, mp3: { mix: loud, stems: stemLoud } };
const [dl, dr] = decode(join(OUT, 'mix.mp3'), 2);
let mp3Peak = 0;
for (let i = 0; i < dl.length; i++) mp3Peak = Math.max(mp3Peak, Math.abs(dl[i]), Math.abs(dr[i]));
checks.mp3DecodedPeakDb = r1(db(mp3Peak));
const secList = OUT_SECTIONS.map(s => ({ id: s.id, startBeat: s.from, beats: s.to - s.from }));
checks.sections = sectionStats(dl, dr, secList, SPB);
const bars = Math.ceil(LAST_HIT / 4) + 1;
checks.barRms = barRms(mono(dl, dr), SPB, bars);
checks.barRmsLow = barRms(lowpassed(mono(dl, dr)), SPB, bars);
checks.biggestJump = biggestJump(mono(dl, dr).subarray(Math.round(2 * SR)));
checks.biggestJump.sec = +(checks.biggestJump.sec + 2).toFixed(2);
checks.biggestJumpFrom0 = biggestJump(mono(dl, dr));
{
  let best = 0, bestLag = 0;
  const a = Math.round(28 * SPB), len = SR * 2;
  for (let lag = -3000; lag <= 3000; lag++) {
    let s = 0;
    for (let i = 0; i < len; i += 4) s += mix.L[a + i] * dl[a + i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  checks.mp3OffsetSamples = bestLag;
}
checks.loop = {};
const skip = 8 * SPB;
for (const [k, st] of Object.entries(stems)) checks.loop[k] = loopSeam(st, OUT_LOOP.startBeat * SPB, OUT_LOOP.beats * SPB, skip);
checks.loop.mix = loopSeam(mix, OUT_LOOP.startBeat * SPB, OUT_LOOP.beats * SPB, skip);
// her tune as the animals sing it, where the output plays it (speed 1: the record's own pitch and timing, sample for sample)
checks.tune = [];
for (const c of srcInfo.calls.filter(c => c.tune)) for (const ob of mapBeat(moves, c.beat)) checks.tune.push({ group: c.group, beat: ob, cents: c.cents, attackMs: c.attackMs });
checks.tune.sort((p, q) => p.beat - q.beat);
// every call of the record heard at speed 1, 1/2 or 2 (an octave down / up keeps its tone)
checks.recordCalls = { speed1: 0, half: 0, double: 0, worstCents: 0, worstAttackMs: 0 };
for (const c of srcInfo.calls) for (const o of mapAll(c.beat)) {
  checks.recordCalls[o.rate === 1 ? 'speed1' : o.rate < 1 ? 'half' : 'double']++;
  if (c.cents !== null) checks.recordCalls.worstCents = Math.max(checks.recordCalls.worstCents, Math.abs(c.cents));
  if (c.mode === 'onset') checks.recordCalls.worstAttackMs = Math.max(checks.recordCalls.worstAttackMs, Math.abs(c.attackMs));
}
checks.newCalls = outLog.map(c => ({ group: c.group, beat: c.beat, mode: c.mode, file: c.file, ...callCheck(c, mtof(TONE[c.group]), sampleOf(c.beat)) }));
checks.dragonflies = dfCheck;
const horn = loadTake(HLJOD, TAKES.horn[0]);
checks.horn = [...new Set(score.horn.map(h => h.midi))].map(m => {
  const y = resample(horn.x, mtof(m) / horn.hz);
  const s = steady(y, { fmin: 100, fmax: 700, win: 1024, hop: 256 });
  return { midi: m, target: +mtof(m).toFixed(2), hz: +s.hz.toFixed(2), cents: Math.round(cents(s.hz, mtof(m))) };
});
checks.dj = lineInfo;
checks.scratches = scratchLog;
checks.moves = moves.filter(m => m.kind !== 'play').map(m => ({ kind: m.kind, from: m.o0, to: m.o1, src: +m.src.toFixed(3), ...(m.peakSpeed ? { peakSpeed: +m.peakSpeed.toFixed(2) } : {}), ...(m.srcEnd ? { srcEnd: +m.srcEnd.toFixed(3) } : {}) }));
const lt = l => Math.abs(l);
checks.summary = {
  lengthSec, lufs: loud.lufs, truePeak: loud.truePeak, stemsMaxTruePeak: QUICK ? null : Math.max(...Object.values(stemLoud).map(s => s.truePeak)),
  mp3DecodedPeakDb: checks.mp3DecodedPeakDb,
  tuneNotes: checks.tune.length, tuneWorstCents: Math.max(...checks.tune.map(c => lt(c.cents ?? 999))), tuneWorstAttackMs: Math.max(...checks.tune.map(c => lt(c.attackMs))),
  recordCalls: checks.recordCalls,
  newCalls: checks.newCalls.length, newCallsWorstCents: Math.max(...checks.newCalls.map(c => lt(c.cents ?? 999))), newCallsWorstAttackMs: Math.max(...checks.newCalls.filter(c => c.mode === 'onset').map(c => lt(c.attackMs))),
  dragonfliesWorstCents: Math.max(...dfCheck.map(d => lt(d.cents ?? 999))),
  hornWorstCents: Math.max(...checks.horn.map(h => lt(h.cents))),
  djOverMusicDb: [Math.min(...lineInfo.map(l => l.voiceOverMusicDb)), Math.max(...lineInfo.map(l => l.voiceOverMusicDb))],
  djWorstAttackMs: Math.max(...lineInfo.map(l => lt(l.attackMs))),
  loopWorstDiffDb: Math.max(...Object.values(checks.loop).map(l => l.worstDiffDb)),
  biggestJumpDb: checks.biggestJump,
};
writeFileSync(join(OUT, 'checks.json'), JSON.stringify(checks, null, 1) + '\n');
console.log(JSON.stringify({ summary: checks.summary, sections: checks.sections, loop: checks.loop, mp3OffsetSamples: checks.mp3OffsetSamples, dj: lineInfo.map(l => [l.id, l.beat, l.voiceOverMusicDb, l.gainDb, l.attackMs]) }, null, 1));
for (const f of ['mix.wav', ...Object.keys(stems).map(k => `${k}.wav`)]) rmSync(join(WORK, f), { force: true });
say('done');
