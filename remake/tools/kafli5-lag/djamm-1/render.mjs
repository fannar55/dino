// djamm-1: "Stóra sviðið" on the real disco-funk track. DJ Flugeðla's set, the band re-arranged from its own stems. Run from anywhere:
//   node remake/tools/kafli5-lag/djamm-1/render.mjs [--quick]
// Writes qa/remake/kafli5/lag/djamm/1/: mix.mp3, stems/{drums,bass,music,animals,horn,dj,fx}.mp3, song.json, spectrogram.png,
// waveform.png, checks.json (its work files in work/render/, removed at the end; the shifted records stay in work/records/).
// Deterministic: no clock, no outside seed. Needs the fetched sounds (fetch-sounds.mjs --fetch, --eleven) in sounds/.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, writeWav, encodeMp3, ebur128, decode, spawnText } from './lib/io.mjs';
import { stereo, mtof, peakOf } from './lib/dsp.mjs';
import { lufs, limit, kLoud } from './lib/master.mjs';
import { BPM, SPB, KEY, TONE, TUNE, SECTIONS, LOOP, END_BEAT, TAIL_SEC, DJ, DROPS, buildScore, buildBand } from './lib/score.mjs';
import { RECORDS } from './lib/records.mjs';
import { renderFx, soundSources, SOUND_DIR } from './lib/fx.mjs';
import { renderBeat, renderLead, renderAnimals, sampleOf } from './lib/parts.mjs';
import { renderBand, TRACK_DIR, T0_SEC, STEM_LAG } from './lib/band.mjs';
import { TAKES, loadTake, resample } from './lib/takes.mjs';
import { sectionStats, callCheck, barRms, mono, lowpassed, biggestJump, fft } from './lib/analyze.mjs';
import { steady, cents } from './lib/pitch.mjs';
import { renderDj, readLines, SLOT } from './lib/dj.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../../..');
const HLJOD = join(ROOT, 'remake/assets/audio/kafli5/hljod');
const OUT = join(ROOT, 'qa/remake/kafli5/lag/djamm/1');
const WORK = join(OUT, 'work/render');
const QUICK = process.argv.includes('--quick');
const t0 = Date.now();
const say = msg => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
mkdirSync(join(OUT, 'stems'), { recursive: true });
mkdirSync(WORK, { recursive: true });
const db = v => 20 * Math.log10(Math.max(v, 1e-12));
const FX_DB = 6; // the fx stem against the band (each event's own level is in the score)

// ---------------------------------------------------------------- the takes, measured
const takeInfo = {};
for (const [g, list] of Object.entries(TAKES))
  takeInfo[g] = list.map(t => {
    const k = loadTake(HLJOD, t);
    return { file: t.file, hz: +k.hz.toFixed(2), steady: [+k.steadyFrom.toFixed(3), +k.steadyTo.toFixed(3)], clarity: +k.clarity.toFixed(3) };
  });
say(`takes measured: ${Object.values(takeInfo).flat().map(t => `${t.file} ${t.hz}`).join(', ')}`);

// ---------------------------------------------------------------- the band
const score = buildScore();
const plan = buildBand();
const n = Math.ceil((END_BEAT * 0.48 + TAIL_SEC) * SR);
const band = renderBand(plan, ROOT, n, join(OUT, 'work/records'));
say(`band: clips per stem ${JSON.stringify(band.log)}`);
const EMPTY = { kick: [], clap: [], hat: [], ohat: [], shaker: [], conga: [], tom: [], snare: [], cymbal: [], riser: [], crowdClap: [], wing: [], whoosh: [] };
const riser = renderBeat({ ...EMPTY, riser: plan.riser.map(r => ({ beat: r.beat, seconds: r.beats * 0.48, vel: r.vel })) }, n, ROOT);
const add = (dst, src, g = 1) => {
  for (let i = 0; i < n; i++) {
    dst.L[i] += src.L[i] * g;
    dst.R[i] += src.R[i] * g;
  }
};
const music = stereo(n);
for (const s of ['guitar', 'other', 'piano', 'vocals']) add(music, band.stems[s]);
add(music, riser);
// the other records have no stems: each goes whole to the stem it stands for (the percussion record to drums, the rest to music)
const drums = band.stems.drums;
for (const [r, info] of Object.entries(RECORDS)) if (band.stems[r]) add(info.to === 'drums' ? drums : music, band.stems[r]);
const stems = { drums, bass: band.stems.bass, music };

// ---------------------------------------------------------------- the animals (with her wings) and her horn
const callLog = [];
const animals = renderAnimals(score, n, [], HLJOD, callLog);
add(animals, renderBeat({ ...EMPTY, wing: score.wing, whoosh: score.whoosh }, n, ROOT));
const horn = renderLead(score, n, [], HLJOD);
say('animals, horn');

// ---------------------------------------------------------------- balance
const sumOf = list => {
  const s = stereo(n);
  for (const st of list) add(s, st);
  return s;
};
const scale = (st, g) => {
  for (let i = 0; i < n; i++) {
    st.L[i] *= g;
    st.R[i] *= g;
  }
};
const span = (a, b) => [sampleOf(a), Math.min(n, sampleOf(b))];
// the band keeps its own balance (its stems sum to the track); all of it to -19 LUFS before the voices and the master
let bandSum = sumOf([stems.drums, stems.bass, stems.music]);
const gBand = 10 ** ((-19 - lufs(bandSum.L, bandSum.R)) / 20);
for (const st of [stems.drums, stems.bass, stems.music, bandSum]) scale(st, gBand);
// the animals: in the anthem, half a dB under the band there (round two: 1.5 dB up on round one; the tune heard, the band hitting)
const kl = (st, a, b) => kLoud(st.L, st.R, ...span(a, b));
const gAnimals = 10 ** ((kl(bandSum, 324, 356) - 0.5 - kl(animals, 324, 356)) / 20);
scale(animals, gAnimals);
// their peaks (the forest's roars, every group at once) held under the band's own: a look-ahead limiter on the animals alone
const animalsLim = limit(animals.L, animals.R, 10 ** (-7.5 / 20));
// her horn: in the break, 3 dB over the bed there
const gHorn = 10 ** ((kl(bandSum, 232, 264) + 3 - kl(horn, 232, 264)) / 20);
scale(horn, gHorn);
stems.animals = animals;
stems.horn = horn;
// the crowd and the DJ's sounds: each cut levelled to a -1 dBFS peak and placed at its own level (score.mjs); the whole stem moves
// with the band's gain, so the crowd keeps its place against the band
const fxOut = renderFx(score.fx, n, ROOT);
scale(fxOut.stem, gBand * 10 ** (FX_DB / 20));
const fxLim = limit(fxOut.stem.L, fxOut.stem.R, 10 ** (-6 / 20));
stems.fx = fxOut.stem;
say(`fx: ${score.fx.length} events, ${fxOut.used.length} sounds, limiter at most ${db(fxLim.most).toFixed(1)} dB`);
say(`gains (dB): band ${db(gBand).toFixed(2)}, animals ${db(gAnimals).toFixed(2)} (limiter at most ${db(animalsLim.most).toFixed(1)} dB), horn ${db(gHorn).toFixed(2)}`);

// ---------------------------------------------------------------- her voice, and the rest ducked under it
const lines = readLines(join(here, 'lines.json'));
const under = sumOf(Object.values(stems));
const dj = renderDj(DJ, lines, ROOT, n, under);
for (const st of Object.values(stems)) for (let i = 0; i < n; i++) {
  st.L[i] *= dj.duck[i];
  st.R[i] *= dj.duck[i];
}
// her shouts' peaks held under the band's: a look-ahead limiter on her stem alone (her level is set by loudness, not by peak)
const djLim = limit(dj.stem.L, dj.stem.R, 10 ** (-4 / 20));
stems.dj = dj.stem;
// the very end: the last hit rings for TAIL_SEC; only its last 0.3 s is eased to zero
const easeN = Math.round(0.3 * SR);
for (const st of Object.values(stems)) for (let i = 0; i < easeN; i++) {
  const g = i / easeN;
  st.L[n - 1 - i] *= g;
  st.R[n - 1 - i] *= g;
}
say(`dj: ${dj.info.filter(i => i.take).length}/${dj.info.length} lines with takes, her limiter at most ${db(djLim.most).toFixed(1)} dB`);
const pre = sumOf(Object.values(stems));
say(`pre-master ${lufs(pre.L, pre.R).toFixed(2)} LUFS`);
const stemPeaks = {};
for (const [k, st] of Object.entries(stems)) stemPeaks[k] = +db(peakOf(st)).toFixed(2);
say(`stem sample peaks (dBFS): ${JSON.stringify(stemPeaks)}`);

// ---------------------------------------------------------------- master: gain to -16 LUFS, look-ahead true-peak limiter
function master(gain, ceilingDb) {
  const L = Float32Array.from(pre.L, v => v * gain), R = Float32Array.from(pre.R, v => v * gain);
  const lim = limit(L, R, 10 ** (ceilingDb / 20));
  return { L, R, lim };
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

// ---------------------------------------------------------------- write and encode
writeWav(join(WORK, 'mix.wav'), mix.L, mix.R);
encodeMp3(join(WORK, 'mix.wav'), join(OUT, 'mix.mp3'));
for (const [k, st] of Object.entries(stems)) {
  writeWav(join(WORK, `${k}.wav`), st.L, st.R);
  encodeMp3(join(WORK, `${k}.wav`), join(OUT, 'stems', `${k}.mp3`));
}
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
const stemLoud = {};
if (!QUICK) for (const k of Object.keys(stems)) stemLoud[k] = ebur128(join(OUT, 'stems', `${k}.mp3`));
say(`stems mp3: ${JSON.stringify(stemLoud)}`);

// ---------------------------------------------------------------- song.json
const lengthSec = +(n / SR).toFixed(3);
const recordBars = s => {
  const out = [];
  for (let b = s.bar; b < s.bar + s.bars; b++) {
    const c = plan.recs.find(r => r.rec === s.record && r.o <= 4 * b && r.o + r.n > 4 * b);
    out.push(c ? Math.floor((c.s + 4 * b - c.o) / 4) : null);
  }
  return out;
};
const sections = SECTIONS.map(s => ({
  id: s.id, name: s.name, nameIs: s.nameIs, startBeat: s.bar * 4, beats: s.bars * 4, startSec: +(s.bar * 4 * 0.48).toFixed(3), feature: s.feature,
  record: s.record, trackBars: s.record === 'vamp' ? plan.bars.slice(s.bar, s.bar + s.bars).map(b => (b === null ? null : b)) : recordBars(s), what: s.what,
}));
const LIC = {
  'grazers-2.mp3': 'ElevenLabs sound generation, made for this game', 'grazers-3.mp3': 'CC0 1.0, "z-moo01.wav" by Zozzy',
  'turtles-2.mp3': 'ElevenLabs sound generation, made for this game', 'frogs-1.mp3': 'ElevenLabs sound generation, made for this game',
  'frogs-5.mp3': 'CC0 1.0, "Frog.ogg" by egomassive', 'lizards-1.mp3': 'ElevenLabs sound generation, made for this game',
  'flyers-3.mp3': 'CC BY 4.0, "Curlew .wav" by Benboncan, https://freesound.org/people/Benboncan/sounds/72892/',
  'horn-1.mp3': 'CC0 1.0, "Alpenhorn.aiff" by Danjocross',
};
const used = [...new Set(callLog.map(c => c.file)), 'horn-1.mp3'];
const soundSrc = soundSources(ROOT);
const sources = [
  `${TRACK_DIR}/{drums,bass,guitar,other,piano,vocals}.mp3 (the track "Djamm skógarins", ElevenLabs Music, made for this game; its stems from ElevenLabs' separator; read ${STEM_LAG} samples late to line up with song.mp3, the track's beat 0 at ${T0_SEC * 1000} ms)`,
  ...used.map(f => `remake/assets/audio/kafli5/hljod/${f} (${LIC[f] ?? '?'})`),
  ...['wing-1.mp3', 'wing-2.mp3', 'wing-3.mp3'].map(f => `remake/assets/audio/kafli4/hljod/${f} (CC0 1.0, "Large Wings Flapping - Foley.wav" by tothrec2, https://freesound.org/s/596541/)`),
  ...['whoosh-1.mp3', 'whoosh-2.mp3'].map(f => `remake/assets/audio/kafli4/hljod/${f} (ElevenLabs sound generation, made for this game)`),
  ...Object.entries(RECORDS).filter(([r]) => band.stems[r]).map(([r, x]) => `${x.file} (record "${r}": ${x.what}; ElevenLabs Music, made for this game${x.shift ? `; moved up ${x.shift} semitones with rubberband into A major` : ''}; its beat 0 at ${(x.t0 * 1000).toFixed(1)} ms)`),
  ...[...new Set(dj.info.filter(i => i.take).map(i => i.take))].map(f => `${f} (the game's own line: Flugeðla, recorded by the coordinator)`),
  ...fxOut.used.map(id => {
    const x = soundSrc[id];
    if (!x) return `${SOUND_DIR}/${id} (? no sources.json entry)`;
    return x.page ? `${SOUND_DIR}/${x.file} ("${(x.title ?? '').replace(/^Freesound - /, '').replace(/ by [^|]*$/, '')}" by ${x.author}, ${x.licence}, ${x.page}; ${x.purpose})` : `${SOUND_DIR}/${x.file} (${x.source}; ${x.purpose})`;
  }),
  'remake/tools/kafli5-lag/djamm-1/lib/synths.mjs (only the risers and the dragonflies\' wing buzz: synthesized noise and a buzz, no music)',
];
const song = {
  slot: SLOT,
  name: 'Stóra sviðið',
  style: 'DJ Flugeðla\'s main-stage set on a live disco-funk band (four-on-the-floor kit, slap bass, wah guitar, brass and strings): the band\'s own stems cut, muted, filtered, looped and rolled into builds, a breakdown, drops and a last hit; between them she changes records in the open (a half-time funk, a percussion record, a quiet bed for her horn, a carnival samba, a chorus with a brass hook); a real crowd and children cheering and clapping in time, air horns, impacts, a spin-back, a freeze dance and a fake ending; the forest as her crowd answering on its tones',
  remixOf: `${TRACK_DIR}/song.mp3 ("Djamm skógarins", disco-funk), with remix-a's set`,
  bpm: BPM,
  beatZeroSec: 0,
  key: KEY,
  lengthSec,
  tune: TUNE,
  tones: Object.fromEntries(Object.entries(TONE).map(([g, m]) => [g, +mtof(m).toFixed(2)])),
  sections,
  tuneNotes: score.tuneNotes.map(t => ({ group: t.group, beat: t.beat })),
  dj: dj.info.map(i => ({ id: i.key, beat: i.beat, sec: i.sec, text: i.text })),
  cues: score.cues,
  loop: { ...LOOP, sec: +(LOOP.startBeat * 0.48).toFixed(3), endSec: +((LOOP.startBeat + LOOP.beats) * 0.48).toFixed(3), what: 'the band only (the track\'s bars 24-31, one whole chord cycle): nothing of hers, no animals' },
  stems: { drums: 'stems/drums.mp3', bass: 'stems/bass.mp3', music: 'stems/music.mp3', animals: 'stems/animals.mp3', horn: 'stems/horn.mp3', dj: 'stems/dj.mp3', fx: 'stems/fx.mp3' },
  stemNotes: 'the records without stems play whole: the percussion record (slagverk) in drums, the others (fonk, rolegt, vidlag, song3) in music; fx holds the crowd and the DJ\'s sounds',
  records: Object.fromEntries(Object.entries(RECORDS).map(([r, x]) => [r, { file: x.file, what: x.what, shiftSemitones: x.shift, beatZeroMs: +(x.t0 * 1000).toFixed(1) }])),
  cueKinds: {
    call: 'a group sings (group)', roar: 'every group at once', horn: 'her horn', wings: 'her wing beat', whoosh: 'she swoops', hit: 'a section starts', peak: 'a high point',
    rise: 'a build starts', count: 'countdown number (n)', dj: 'her line (id)', record: 'she changes records (from, to, how)', scratch: 'a scratch', impact: 'an impact with a sub',
    'reverse-cymbal': 'a reverse cymbal ends here (it starts about 3 s before)', airhorn: 'the air horn', crowd: 'the crowd or the children cheer (sound)', clap: 'the crowd claps',
    rewind: 'she spins the record back', freeze: 'everything stops: freeze', moved: 'someone moved in the freeze (group)', unfreeze: 'everything slams back',
    'egill-turn': 'the gap for Egill to shout', 'end-fake': 'it sounds like the end (it is not)', end: 'the last hit',
  },
  newAnimals: {
    beetles: 'Bjöllur: the beetles play the percussion record in their four bars (beats 208-224); cues "call" group "beetles" on every beat and off-beat.',
    dragonflies: 'Drekaflugur: dragonflies whose wings buzz on E and A as they fly past the stage; cues "call" group "dragonflies".',
  },
  sources,
  loudness: { lufs: loud.lufs, truePeak: loud.truePeak },
};
writeFileSync(join(OUT, 'song.json'), JSON.stringify(song, null, 2) + '\n');
say('song.json');

// ---------------------------------------------------------------- pictures
if (!QUICK) spawnText(['-y', '-v', 'error', '-i', join(OUT, 'mix.mp3'), '-lavfi', 'showspectrumpic=s=1800x700:legend=1:scale=log:fscale=log:start=40:stop=16000', join(OUT, 'spectrogram.png')]);
if (!QUICK) spawnText(['-y', '-v', 'error', '-i', join(OUT, 'mix.mp3'), '-filter_complex', 'showwavespic=s=1800x360:split_channels=1:filter=peak:colors=#3b6ea8|#c0567a', '-frames:v', '1', join(OUT, 'waveform.png')]);
say('pictures');

// ---------------------------------------------------------------- checks
const checks = { takes: takeInfo, gainsDb: { band: +db(gBand).toFixed(2), animals: +db(gAnimals).toFixed(2), horn: +db(gHorn).toFixed(2), fx: +(db(gBand) + FX_DB).toFixed(2) }, fxSounds: fxOut.used, stemSamplePeakFloat: stemPeaks, mp3: { mix: loud, stems: stemLoud } };
const [dl, dr] = decode(join(OUT, 'mix.mp3'), 2);
const dm = mono(dl, dr);
const secList = SECTIONS.map(s => ({ id: s.id, startBeat: s.bar * 4, beats: s.bars * 4 }));
checks.sections = sectionStats(dl, dr, secList, SPB);
// each part's loudness per section (K-weighted, float stems after the duck), to see what is heard where
checks.sectionParts = SECTIONS.map(s => {
  const a = s.bar * 4, b = (s.bar + s.bars) * 4;
  const row = { id: s.id };
  for (const [k, st] of Object.entries(stems)) row[k] = +kl(st, a, b).toFixed(1);
  const bs = sumOf([stems.drums, stems.bass, stems.music]);
  row.band = +kl(bs, a, b).toFixed(1);
  return row;
});
checks.barRms = barRms(dm, SPB, Math.ceil(END_BEAT / 4) + 1);
checks.barRmsLow = barRms(lowpassed(dm), SPB, Math.ceil(END_BEAT / 4) + 1);
checks.biggestJump = biggestJump(dm.subarray(Math.round(2 * SR)));
checks.biggestJump.sec = +(checks.biggestJump.sec + 2).toFixed(2);
// every 400 ms rise over 7 dB (RMS of the mono mix, windows a quarter apart), with its beat
{
  const w = Math.round(0.4 * SR), hop = Math.round(w / 4), lv = [];
  for (let s = 0; s + w <= dm.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + w; i++) e += dm[i] * dm[i];
    lv.push(db(Math.sqrt(e / w)));
  }
  const jumps = [];
  for (let i = 4; i < lv.length; i++) if (lv[i] - lv[i - 4] > 7 && lv[i] > -40) jumps.push({ db: +(lv[i] - lv[i - 4]).toFixed(1), sec: +((i * hop) / SR).toFixed(2), beat: +((i * hop) / SPB).toFixed(2), fromDb: +lv[i - 4].toFixed(1), toDb: +lv[i].toFixed(1) });
  // keep the biggest of each run
  checks.jumps = jumps.filter((j, k) => !jumps.some((q, m) => m !== k && Math.abs(q.sec - j.sec) < 0.4 && q.db > j.db));
}
// the same with the ear's weighting: momentary loudness (K-weighted, 400 ms windows every 100 ms, as EBU R128), rises over 7 LU
{
  const w = Math.round(0.4 * SR), hop = Math.round(0.1 * SR), M = [];
  for (let s = 0; s + w <= dl.length; s += hop) M.push(kLoud(dl, dr, s, s + w));
  const jm = [];
  for (let i = 4; i < M.length; i++) if (M[i] - M[i - 4] > 7 && M[i] > -40) jm.push({ lu: +(M[i] - M[i - 4]).toFixed(1), sec: +((i * hop + w) / SR).toFixed(2), beat: +((i * hop + w) / SPB).toFixed(2), from: +M[i - 4].toFixed(1), to: +M[i].toFixed(1) });
  checks.jumpsMomentary = jm.filter((j, k) => !jm.some((q, m) => m !== k && Math.abs(q.sec - j.sec) < 0.4 && q.lu > j.lu));
  checks.dropJumpsMomentary = DROPS.map(d => {
    let best = null;
    for (let i = 4; i < M.length; i++) {
      const end = (i * hop + w) / SPB;
      if (end < d.beat - 0.2 || end > d.beat + 1.5) continue;
      if (!best || M[i] - M[i - 4] > best.lu) best = { what: d.what, lu: +(M[i] - M[i - 4]).toFixed(1), beat: +end.toFixed(2), from: +M[i - 4].toFixed(1), to: +M[i].toFixed(1) };
    }
    return best;
  });
  checks.momentaryMax = { lufs: +Math.max(...M).toFixed(1), beat: +((M.indexOf(Math.max(...M)) * hop + w) / SPB).toFixed(1) };
}
{
  let best = 0, bestLag = 0;
  const a = Math.round(64 * SPB), len = SR * 2;
  for (let lag = -3000; lag <= 3000; lag++) {
    let s = 0;
    for (let i = 0; i < len; i += 4) s += mix.L[a + i] * dl[a + i + lag];
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  checks.mp3OffsetSamples = bestLag;
}
// the loop: played end to start, how big is the step at the join against the loop's own bar lines (sample step and spectral
// flux over 23 ms), and is anything but the band inside it
{
  const a = sampleOf(LOOP.startBeat), b = sampleOf(LOOP.startBeat + LOOP.beats);
  const joined = new Float32Array(2 * (b - a));
  for (let i = 0; i < b - a; i++) joined[i] = joined[i + b - a] = (mix.L[a + i] + mix.R[a + i]) / 2;
  const N = 1024;
  const spec = at => {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = joined[at + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    return Array.from({ length: N / 2 }, (_, k) => Math.log1p(Math.hypot(re[k], im[k])));
  };
  const flux = at => {
    const p = spec(at - N), q = spec(at);
    return p.reduce((s, v, k) => s + Math.max(0, q[k] - v), 0);
  };
  const join = b - a;
  const inner = [];
  for (let beat = LOOP.startBeat + 4; beat < LOOP.startBeat + LOOP.beats; beat += 4) inner.push(flux(sampleOf(beat) - a));
  inner.sort((p, q) => p - q);
  let d2 = 0;
  for (let i = 1; i < joined.length; i++) d2 += (joined[i] - joined[i - 1]) ** 2;
  const stepRms = Math.sqrt(d2 / joined.length);
  const others = {};
  for (const k of ['animals', 'horn', 'dj', 'fx']) {
    let e = 0;
    for (let i = a; i < b; i++) e += stems[k].L[i] ** 2 + stems[k].R[i] ** 2;
    others[k] = +db(Math.sqrt(e / (2 * (b - a)))).toFixed(1);
  }
  checks.loop = {
    beats: [LOOP.startBeat, LOOP.startBeat + LOOP.beats],
    joinFlux: +flux(join).toFixed(1), barLineFluxMedian: +inner[inner.length >> 1].toFixed(1), barLineFluxMax: +inner[inner.length - 1].toFixed(1),
    joinSampleStepDb: +db(Math.abs(joined[join] - joined[join - 1]) / stepRms).toFixed(1),
    othersInLoopDbfs: others,
  };
}
// the band on the grid: the kick's attack in the drums stem, averaged over every beat the drums play straight
{
  const lo = lowpassed(mono(stems.drums.L, stems.drums.R), 120);
  const pre = Math.round(0.04 * SR), post = Math.round(0.1 * SR), acc = new Float64Array(pre + post);
  const beats = [];
  for (let k = 64; k < 96; k++) beats.push(k);
  for (let k = 308; k < 356; k++) beats.push(k);
  for (const k of beats) for (let i = -pre; i < post; i++) acc[i + pre] += Math.abs(lo[sampleOf(k) + i]);
  let pk = 0;
  for (const v of acc) pk = Math.max(pk, v);
  const fl = Math.min(...acc.slice(0, Math.round(0.02 * SR)));
  const cross = f => (acc.findIndex(v => v > fl + f * (pk - fl)) - pre) / SR * 1000;
  checks.kickOnGrid = { t10ms: +cross(0.1).toFixed(1), t50ms: +cross(0.5).toFixed(1), note: 'the track itself: t10 10.5 ms, t50 19 ms (a low-passed kick rises late; its click and the hats peak on the beat)' };
}
checks.dj = dj.info.map(i => {
  const a = sampleOf(i.beat), b = Math.min(n, a + Math.round(i.seconds * SR));
  const rest = sumOf(Object.entries(stems).filter(([k]) => k !== 'dj').map(([, st]) => st));
  const v = kLoud(dj.stem.L, dj.stem.R, a, b), m = kLoud(rest.L, rest.R, a, b);
  return { key: i.key, beat: i.beat, text: i.text, seconds: i.seconds, voiceLufs: +v.toFixed(1), musicLufs: +m.toFixed(1), overMusicDb: +(v - m).toFixed(1), gainDb: i.gainDb, fx: i.fx, align: i.align, consonantLeadMs: i.consonantLeadMs };
});
const tuneSet = new Set(score.tuneNotes.map(t => `${t.group}@${t.beat}`));
checks.calls = callLog.map(c => ({ group: c.group, beat: c.beat, mode: c.mode, file: c.file, ...callCheck(c, mtof(TONE[c.group]), sampleOf(c.beat)) }));
checks.tune = checks.calls.filter(c => c.mode === 'onset' && tuneSet.has(`${c.group}@${c.beat}`));
const hornTake = loadTake(HLJOD, TAKES.horn[0]);
checks.horn = [...new Set(score.horn.map(h => h.midi))].map(m => {
  const y = resample(hornTake.x, mtof(m) / hornTake.hz);
  const s = steady(y, { fmin: 100, fmax: 700, win: 1024, hop: 256 });
  return { midi: m, target: +mtof(m).toFixed(2), hz: +s.hz.toFixed(2), cents: Math.round(cents(s.hz, mtof(m))) };
});
const bad = checks.calls.filter(c => c.cents === null || Math.abs(c.cents) > 20);
const late = checks.calls.filter(c => c.mode === 'onset' && Math.abs(c.attackMs) > 25);
const nearDrop = beat => DROPS.some(d => beat > d.beat - 2 && beat < d.beat + 2);
const dropJump = checks.jumps.filter(j => nearDrop(j.beat));
checks.summary = {
  lengthSec, lufs: loud.lufs, truePeak: loud.truePeak, lra: loud.lra, stemsMaxTruePeak: QUICK ? null : Math.max(...Object.values(stemLoud).map(s => s.truePeak)),
  calls: checks.calls.length, callsOff20c: bad.length, worstCallCents: Math.max(...checks.calls.filter(c => c.cents !== null).map(c => Math.abs(c.cents))),
  tuneNotes: checks.tune.length, tuneWorstCents: Math.max(...checks.tune.map(c => Math.abs(c.cents ?? 999))), tuneWorstAttackMs: Math.max(...checks.tune.map(c => Math.abs(c.attackMs))),
  onsetCallsOff25ms: late.length, hornWorstCents: Math.max(...checks.horn.map(h => Math.abs(h.cents))),
  biggestJumpDb: checks.biggestJump, dropJump, jumpsOver9: checks.jumps.filter(j => j.db > 9), dropJumpsMomentary: checks.dropJumpsMomentary, momentaryOver9NotDrops: checks.jumpsMomentary.filter(j => j.lu > 9 && !nearDrop(j.beat)), momentaryMax: checks.momentaryMax,
  djOverMusic: { min: Math.min(...checks.dj.map(d => d.overMusicDb)), max: Math.max(...checks.dj.map(d => d.overMusicDb)) },
};
writeFileSync(join(OUT, 'checks.json'), JSON.stringify(checks, null, 1) + '\n');
console.log(JSON.stringify({ summary: checks.summary, loop: checks.loop, kickOnGrid: checks.kickOnGrid, horn: checks.horn, mp3OffsetSamples: checks.mp3OffsetSamples }, null, 1));
console.log('sections (rms, rms<150, onsets/bar):', checks.sections.map(s => `${s.id} ${s.rmsDb ?? ''} ${JSON.stringify(s)}`).join('\n  '));
console.log('parts (K-weighted, per section):\n  ' + checks.sectionParts.map(r => JSON.stringify(r)).join('\n  '));
console.log('momentary jumps > 7 LU:', checks.jumpsMomentary.map(j => `${j.lu} LU at beat ${j.beat} (${j.from} -> ${j.to})`).join('; '));
console.log('jumps > 7 dB:', checks.jumps.map(j => `${j.db} dB at beat ${j.beat} (${j.fromDb} -> ${j.toDb})`).join('; '));
console.log('dj:\n  ' + checks.dj.map(d => `${d.beat} ${d.key} ${d.voiceLufs}/${d.musicLufs} (+${d.overMusicDb})${d.align === 'vowel' ? ` vowel-aligned, consonant ${d.consonantLeadMs} ms early` : ''}`).join('\n  '));
if (bad.length) console.log('off-pitch calls:', JSON.stringify(bad.slice(0, 20)));
if (late.length) console.log('late calls:', JSON.stringify(late.slice(0, 20)));
rmSync(WORK, { recursive: true, force: true });
say('done');
