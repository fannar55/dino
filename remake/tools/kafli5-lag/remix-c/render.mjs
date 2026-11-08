// remix-c: "Leikjadjamm", DJ Flugeðla's party-games remix of Ljósfluguballið (smidur-e). Run from anywhere:
//   node remake/tools/kafli5-lag/remix-c/render.mjs [--quick]
// Writes qa/remake/kafli5/lag/remix/remix-c/: mix.mp3, stems/{pad,bass,beat,lead,animals,dj}.mp3, song.json, spectrogram.png,
// waveform.png, checks.json. Deterministic: every random choice is seeded; the takes are measured afresh on each run.
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, writeWav, encodeMp3, ebur128, decode, spawnText } from './lib/io.mjs';
import { stereo, mtof, peakOf } from './lib/dsp.mjs';
import { lufs, limit, kLoudness } from './lib/master.mjs';
import { BPM, SPB, KEY, TONE, TUNE, SECTIONS, LOOP, END_BEAT, TAIL_SEC, buildScore } from './lib/score.mjs';
import { kickSamples, renderPad, renderBass, renderBeat, renderLead, renderAnimals, sampleOf } from './lib/parts.mjs';
import { TAKES, loadTake, resample } from './lib/takes.mjs';
import { renderDj, loadLine } from './lib/dj.mjs';
import { sectionStats, loopSeam, callCheck, barRms, mono, lowpassed, biggestJump } from './lib/analyze.mjs';
import { steady, cents } from './lib/pitch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../../..');
const AUDIO = join(ROOT, 'remake/assets/audio');
const HLJOD = join(AUDIO, 'kafli5/hljod');
const DJDIR = join(AUDIO, 'kafli5');
const OUT = join(ROOT, 'qa/remake/kafli5/lag/remix/remix-c');
const WORK = join(OUT, 'work');
const SLOT = 'remix-c';
const QUICK = process.argv.includes('--quick'); // while composing: skip the stems' R128 readings and the pictures
const t0 = Date.now();
const say = msg => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const LINES = JSON.parse(readFileSync(join(here, 'lines.json'), 'utf8'));
// the texts as she says them (the coordinator's changes of 2026-11-08)
const SAID = { 'count-in': 'Einn! Tveir! Þrír! Fjórir!', dansa: 'Dansið!' };
for (const l of LINES) if (SAID[l.id]) l.text = SAID[l.id];

mkdirSync(join(OUT, 'stems'), { recursive: true });
mkdirSync(WORK, { recursive: true });

// ---------------------------------------------------------------- the takes, measured
const takeInfo = {};
for (const [g, list] of Object.entries(TAKES))
  takeInfo[g] = list.map(t => {
    const k = loadTake(HLJOD, t);
    return { file: t.file, hz: +k.hz.toFixed(2), steady: [+k.steadyFrom.toFixed(3), +k.steadyTo.toFixed(3)], clarity: +k.clarity.toFixed(3) };
  });
const djTakes = {};
for (const l of LINES) {
  const t = loadLine(DJDIR, l.id);
  djTakes[l.id] = t.real ? { file: t.file, sec: +(t.x.length / SR).toFixed(3), words: t.words.map(w => [+(w.start / SR).toFixed(3), +(w.attack / SR).toFixed(3), +(w.to / SR).toFixed(3)]) } : { file: t.file, missing: true };
}
say(`dj takes: ${Object.values(djTakes).filter(t => !t.missing).length} of ${LINES.length} found`);

// ---------------------------------------------------------------- render the music stems
const score = buildScore();
const n = Math.ceil((END_BEAT * 0.48 + TAIL_SEC) * SR);
const kicks = kickSamples(score);
const callLog = [], synthLog = [];
const stems = {};
stems.pad = renderPad(score, n, kicks); say('pad');
stems.bass = renderBass(score, n, kicks); say('bass');
stems.beat = renderBeat(score, n, AUDIO); say('beat');
stems.lead = renderLead(score, n, kicks, HLJOD); say('lead');
stems.animals = renderAnimals(score, n, kicks, HLJOD, callLog, synthLog); say('animals');

const easeEnd = st => {
  // the very end: the last hit rings for TAIL_SEC; only its last 0.3 s is eased to zero (no musical fade-out)
  const easeN = Math.round(0.3 * SR);
  for (let i = 0; i < easeN; i++) {
    const g = i / easeN;
    st.L[n - 1 - i] *= g;
    st.R[n - 1 - i] *= g;
  }
};
for (const st of Object.values(stems)) easeEnd(st);

// balance: each music stem to its own loudness (gated, so a stem is judged where it plays), then one gain for all so their sum
// sits near -18.5 LUFS before her voice and the master
const BALANCE = { pad: -26, bass: -25, beat: -23.5, lead: -22, animals: -21.5 };
const stemGainDb = {};
const scale = (st, g) => {
  for (let i = 0; i < n; i++) {
    st.L[i] *= g;
    st.R[i] *= g;
  }
};
for (const [k, st] of Object.entries(stems)) {
  const g = 10 ** ((BALANCE[k] - lufs(st.L, st.R)) / 20);
  stemGainDb[k] = +(20 * Math.log10(g)).toFixed(2);
  scale(st, g);
}
const sumOf = list => {
  const s = stereo(n);
  for (const st of list) for (let i = 0; i < n; i++) {
    s.L[i] += st.L[i];
    s.R[i] += st.R[i];
  }
  return s;
};
let music = sumOf(Object.values(stems));
const g0 = 10 ** ((-18.5 - lufs(music.L, music.R)) / 20);
for (const st of Object.values(stems)) scale(st, g0);
music = sumOf(Object.values(stems));
say(`music stems balanced (dB): ${JSON.stringify(stemGainDb)}, all ${(20 * Math.log10(g0)).toFixed(2)}`);

// ---------------------------------------------------------------- her voice: placed, coloured, set over the music, the music ducked
const dj = renderDj(score, n, music, DJDIR, LINES);
for (const st of Object.values(stems)) for (let i = 0; i < n; i++) {
  st.L[i] *= dj.duck[i];
  st.R[i] *= dj.duck[i];
}
easeEnd(dj.dj);
stems.dj = dj.dj;
say(`dj placed: ${dj.placed.length} (${dj.placed.filter(p => p.real).length} real takes)`);
const music2 = sumOf(['pad', 'bass', 'beat', 'lead', 'animals'].map(k => stems[k]));
const pre = sumOf(Object.values(stems));
say(`pre-master ${lufs(pre.L, pre.R).toFixed(2)} LUFS`);
const stemPeaks = {};
for (const [k, st] of Object.entries(stems)) stemPeaks[k] = +(20 * Math.log10(peakOf(st))).toFixed(2);
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
  say(`master pass ${it}: ${l.toFixed(2)} LUFS, most gain reduction ${(20 * Math.log10(mix.lim.most)).toFixed(2)} dB`);
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
const sections = SECTIONS.map(s => ({
  name: s.name, nameIs: s.nameIs, startBeat: s.bar * 4, beats: s.bars * 4, startSec: +(s.bar * 4 * 0.48).toFixed(3), feature: s.feature, what: s.what,
}));
const k4 = JSON.parse(readFileSync(join(AUDIO, 'kafli4/hljod/sounds.json'), 'utf8'));
const LIC = {
  'grazers-2.mp3': 'ElevenLabs sound generation, made for this game', 'grazers-3.mp3': 'CC0 1.0, "z-moo01.wav" by Zozzy',
  'turtles-2.mp3': 'ElevenLabs sound generation, made for this game', 'frogs-1.mp3': 'ElevenLabs sound generation, made for this game',
  'frogs-5.mp3': 'CC0 1.0, "Frog.ogg" by egomassive', 'lizards-1.mp3': 'ElevenLabs sound generation, made for this game',
  'flyers-3.mp3': 'CC BY 4.0, "Curlew .wav" by Benboncan, https://freesound.org/people/Benboncan/sounds/72892/',
  'horn-1.mp3': 'CC0 1.0, "Alpenhorn.aiff" by Danjocross', 'marimba.mp3': 'CC0 1.0, "Marimba - C5" by sgossner',
};
const k4lic = f => {
  const s = k4[f]?.source ?? {};
  return [s.licence, s.name ? `"${s.name}"` : null, s.author ? `by ${s.author}` : null, s.page].filter(Boolean).join(', ');
};
const used = [...new Set(callLog.map(c => c.file)), 'horn-1.mp3', 'marimba.mp3'];
const k4used = [...new Set(score.sample.map(s => s.file))];
const sources = [
  ...used.map(f => `remake/assets/audio/kafli5/hljod/${f} (${LIC[f] ?? '?'})`),
  ...k4used.map(f => `remake/assets/audio/${f} (${k4lic(f.split('/').pop())})`),
  ...Object.values(djTakes).filter(t => !t.missing).map(t => `remake/assets/audio/kafli5/${t.file} (DJ Flugeðla's voice, the game's own line)`),
  'everything else synthesized in remake/tools/kafli5-lag/remix-c (from smidur-e\'s synths and score)',
];
const WELCOME = 'Velkomin á Stjörnuhátíðina! Ég er DJ Flugeðla!';
const djList = dj.placed.map(p => {
  const t = loadLine(DJDIR, p.id);
  let text = p.id === 'welcome' ? WELCOME : p.text;
  if (p.seg !== undefined && t.real) {
    const words = text.split(/(?<=[!.?])\s+/);
    text = p.seg < 0 ? words[words.length + p.seg] : words[p.seg];
  }
  if (p.head) text = `${text.replace(/!$/, '').slice(0, 3)}-`;
  return { id: p.id, beat: p.beat, sec: p.sec, text, file: `remake/assets/audio/kafli5/${t.file}` };
});
const cues = score.cues.slice();
const song = {
  slot: SLOT,
  name: 'Leikjadjamm',
  nameEn: 'Games party',
  style: 'Ljósfluguballið (French-touch filter disco, smidur-e) remixed as a kids\' party-games DJ set: the music does what DJ Flugeðla says (stomp, slow, quick, hop, faster, higher, freeze, dance), with her wings and the wind for the take-off',
  of: 'smidur-e: Ljósfluguballið',
  bpm: BPM,
  beatZeroSec: 0,
  key: KEY,
  lengthSec,
  tune: TUNE,
  sections,
  tuneNotes: score.tuneNotes.map(t => ({ group: t.group, beat: t.beat })),
  cues,
  loop: LOOP,
  dj: djList,
  newAnimals: [
    { id: 'snail', nameIs: 'snigill', what: 'A tiny snail, late for the party all song long, slides in during the last held chord; its sound is a slide whistle (made in code) that climbs to do (G6) and lands on the last hit.' },
    { id: 'beetles', nameIs: 'bjöllur', what: 'Beetles keep the beat while everyone is frozen in the freeze dance: woody clicks, tick on G6 and tock on D6 (made in code).' },
  ],
  stems: { pad: 'stems/pad.mp3', bass: 'stems/bass.mp3', beat: 'stems/beat.mp3', lead: 'stems/lead.mp3', animals: 'stems/animals.mp3', dj: 'stems/dj.mp3' },
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
const checks = { takes: takeInfo, djTakes, stemGainDb, stemSamplePeakFloat: stemPeaks, mp3: { mix: loud, stems: stemLoud } };
const [dl, dr] = decode(join(OUT, 'mix.mp3'), 2);
const secList = SECTIONS.map(s => ({ id: s.id, startBeat: s.bar * 4, beats: s.bars * 4 }));
checks.sections = sectionStats(dl, dr, secList, SPB);
const bars = Math.ceil(END_BEAT / 4) + 1;
checks.barRms = barRms(mono(dl, dr), SPB, bars);
checks.barRmsLow = barRms(lowpassed(mono(dl, dr)), SPB, bars);
checks.biggestJump = biggestJump(mono(dl, dr).subarray(Math.round(2 * SR)));
checks.biggestJump.sec += 2;
checks.biggestJump.beat = +((checks.biggestJump.sec * SR) / SPB).toFixed(2);
{
  let best = 0, bestLag = 0;
  const a = Math.round(16 * SPB), len = SR * 2;
  for (let lag = -3000; lag <= 3000; lag++) {
    let s = 0;
    for (let i = 0; i < len; i += 4) s += mix.L[a + i] * dl[a + i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  checks.mp3OffsetSamples = bestLag;
}
// the loop seam: each music stem's last 2 loop bars against the same bars one loop earlier (float, before the mp3); the mix and the
// dj stem on the last bar (her greeting's tail lies in the bar before that, long gone when the loop starts), and the dj stem's
// loudest sample anywhere in the loop and the bar before it
checks.loop = {};
const S0 = LOOP.startBeat * SPB, LN = LOOP.beats * SPB;
for (const k of ['pad', 'bass', 'beat', 'lead', 'animals']) checks.loop[k] = loopSeam(stems[k], S0, LN, 8 * SPB);
checks.loop.mix = loopSeam(mix, S0, LN, 12 * SPB);
let djInLoop = 0;
for (let i = S0 - 4 * SPB; i < S0 + LN; i++) djInLoop = Math.max(djInLoop, Math.abs(stems.dj.L[i]), Math.abs(stems.dj.R[i]));
checks.loop.djPeakDb = +(20 * Math.log10(djInLoop || 1e-12)).toFixed(1);
// her tune as the animals sing it, and every call
const tuneSet = new Set(score.tuneNotes.map(t => `${t.group}@${t.beat}`));
checks.tune = callLog.filter(c => c.mode === 'onset' && tuneSet.has(`${c.group}@${c.beat}`)).map(c => ({
  group: c.group, beat: c.beat, file: c.file, ...callCheck(c, mtof(TONE[c.group]), sampleOf(c.beat)),
}));
checks.calls = callLog.map(c => ({ group: c.group, beat: c.beat, mode: c.mode, file: c.file, ...callCheck(c, mtof(TONE[c.group]), sampleOf(c.beat)) }));
const horn = loadTake(HLJOD, TAKES.horn[0]);
checks.horn = [...new Set(score.horn.map(h => h.midi))].map(m => {
  const y = resample(horn.x, mtof(m) / horn.hz);
  const s = steady(y, { fmin: 100, fmax: 700, win: 1024, hop: 256 });
  return { midi: m, target: +mtof(m).toFixed(2), hz: +s.hz.toFixed(2), cents: Math.round(cents(s.hz, mtof(m))) };
});
// the snail's landing note
checks.snail = synthLog.filter(s => s.check).map(s => {
  const held = s.y.subarray(Math.round(s.glideSec * SR), Math.round((s.glideSec + s.hold) * SR));
  const st = steady(held, { fmin: 800, fmax: 3000, win: 1024, hop: 128, tol: 25 });
  return { beat: s.beat, lands: +(s.beat + (s.glideSec * SR) / SPB).toFixed(2), target: +mtof(s.check).toFixed(1), hz: st ? +st.hz.toFixed(1) : null, cents: st ? Math.round(cents(st.hz, mtof(s.check))) : null };
});
// each line of hers against the music under it, in the final stems: her voice (with its effects) and the ducked music over the
// span of her words, and how far the music was ducked there
checks.dj = dj.placed.map(p => {
  const t = loadLine(DJDIR, p.id);
  const a = p.at + Math.round(p.attackSec * SR), b = Math.min(n, p.at + p.len);
  const v = kLoudness(stems.dj.L, stems.dj.R, a, b), m = kLoudness(music2.L, music2.R, a, b);
  let dmin = 1;
  for (let i = a; i < b; i++) dmin = Math.min(dmin, dj.duck[i]);
  return { id: p.id, beat: p.beat, real: t.real, voiceLufs: +v.toFixed(1), musicLufs: +m.toFixed(1), overDb: +(v - m).toFixed(1), duckDb: +(20 * Math.log10(dmin)).toFixed(1), gainDb: p.gainDb, attackSec: p.attackSec };
});
const bad = checks.calls.filter(c => c.cents === null || Math.abs(c.cents) > 20);
const late = checks.calls.filter(c => c.mode === 'onset' && Math.abs(c.attackMs) > 25);
checks.summary = {
  lengthSec, lufs: loud.lufs, truePeak: loud.truePeak, stemsMaxTruePeak: QUICK ? null : Math.max(...Object.values(stemLoud).map(s => s.truePeak)),
  calls: checks.calls.length, callsOff20c: bad.length, worstCallCents: Math.max(...checks.calls.filter(c => c.cents !== null).map(c => Math.abs(c.cents))),
  tuneNotes: checks.tune.length, tuneWorstCents: Math.max(...checks.tune.map(c => Math.abs(c.cents ?? 999))), tuneWorstAttackMs: Math.max(...checks.tune.map(c => Math.abs(c.attackMs))),
  onsetCallsOff25ms: late.length, hornWorstCents: Math.max(...checks.horn.map(h => Math.abs(h.cents))),
  snailCents: checks.snail.map(s => s.cents),
  loopWorstDiffDb: Math.max(...['pad', 'bass', 'beat', 'lead', 'animals', 'mix'].map(k => checks.loop[k].worstDiffDb)), loopDjPeakDb: checks.loop.djPeakDb,
  djOverMin: Math.min(...checks.dj.map(d => d.overDb)), djOverMax: Math.max(...checks.dj.map(d => d.overDb)),
  biggestJumpDb: checks.biggestJump,
};
writeFileSync(join(OUT, 'checks.json'), JSON.stringify(checks, null, 1) + '\n');
console.log(JSON.stringify({ summary: checks.summary, sections: checks.sections, loop: checks.loop, snail: checks.snail, mp3OffsetSamples: checks.mp3OffsetSamples }, null, 1));
console.log('dj:', checks.dj.map(d => `${d.id}@${d.beat} ${d.overDb >= 0 ? '+' : ''}${d.overDb} (duck ${d.duckDb})`).join(', '));
if (bad.length) console.log('off-pitch calls:', JSON.stringify(bad.slice(0, 20)));
rmSync(WORK, { recursive: true, force: true });
say('done');
