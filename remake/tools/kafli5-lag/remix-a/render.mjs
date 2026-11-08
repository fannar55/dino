// remix-a: "Stóra sviðið" (the main stage), DJ Flugeðla's festival remix of Ljósfluguballið (smidur-e). Run from anywhere:
//   node remake/tools/kafli5-lag/remix-a/render.mjs [--quick]
// Writes qa/remake/kafli5/lag/remix/remix-a/: mix.mp3, stems/{pad,bass,beat,lead,animals,dj}.mp3, song.json, spectrogram.png,
// waveform.png, checks.json. Deterministic: every random choice is seeded; the takes are measured afresh on each run.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, writeWav, encodeMp3, ebur128, decode, spawnText } from './lib/io.mjs';
import { stereo, mtof, peakOf, SVF } from './lib/dsp.mjs';
import { lufs, limit, kLoud } from './lib/master.mjs';
import { BPM, SPB, KEY, TONE, TUNE, SECTIONS, LOOP, END_BEAT, TAIL_SEC, DJ, buildScore } from './lib/score.mjs';
import { kickSamples, renderPad, renderBass, renderBeat, renderLead, renderAnimals, sampleOf } from './lib/parts.mjs';
import { TAKES, loadTake, resample } from './lib/takes.mjs';
import { sectionStats, loopSeam, callCheck, barRms, mono, lowpassed, biggestJump } from './lib/analyze.mjs';
import { steady, cents } from './lib/pitch.mjs';
import { renderDj, readLines, SLOT } from './lib/dj.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../../..');
const HLJOD = join(ROOT, 'remake/assets/audio/kafli5/hljod');
const OUT = join(ROOT, 'qa/remake/kafli5/lag/remix', SLOT);
const WORK = join(OUT, 'work');
const QUICK = process.argv.includes('--quick');
const t0 = Date.now();
const say = msg => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

mkdirSync(join(OUT, 'stems'), { recursive: true });
mkdirSync(WORK, { recursive: true });

// ---------------------------------------------------------------- the takes, measured
const takeInfo = {};
for (const [g, list] of Object.entries(TAKES))
  takeInfo[g] = list.map(t => {
    const k = loadTake(HLJOD, t);
    return { file: t.file, hz: +k.hz.toFixed(2), steady: [+k.steadyFrom.toFixed(3), +k.steadyTo.toFixed(3)], clarity: +k.clarity.toFixed(3) };
  });
say(`takes measured: ${Object.values(takeInfo).flat().map(t => `${t.file} ${t.hz}`).join(', ')}`);

// ---------------------------------------------------------------- render the music stems
const score = buildScore();
const n = Math.ceil((END_BEAT * 0.48 + TAIL_SEC) * SR);
const kicks = kickSamples(score);
const callLog = [];
const music = {};
music.pad = renderPad(score, n, kicks); say('pad');
music.bass = renderBass(score, n, kicks); say('bass');
music.beat = renderBeat(score, n, ROOT); say('beat');
music.lead = renderLead(score, n, kicks, HLJOD); say('lead');
music.animals = renderAnimals(score, n, kicks, HLJOD, callLog); say('animals');

// the DJ's high-pass sweeps into the drops (the same automation on every music stem, so their sum is the swept mix): the cut-off
// climbs from 20 Hz to its top over the window, and the dry signal comes back in 10 ms as the drop lands
for (const w of score.hpf) {
  const a = sampleOf(w.from), b = sampleOf(w.to);
  const xf = Math.round(0.01 * SR);
  for (const st of Object.values(music)) {
    for (const ch of [st.L, st.R]) {
      const f1 = new SVF(), f2 = new SVF();
      for (let i = a; i < b && i < n; i++) {
        const u = (i - a) / (b - a);
        if ((i - a) % 32 === 0) {
          const fc = 20 * (w.hz / 20) ** (u * u);
          f1.set(fc, 0.6);
          f2.set(fc, 0.9);
        }
        f1.tick(ch[i]);
        f2.tick(f1.hp);
        const mix = Math.min(1, (i - a) / xf, (b - i) / xf);
        ch[i] = ch[i] * (1 - mix) + f2.hp * mix;
      }
    }
  }
}

// the very end: the last hit rings for TAIL_SEC; only its last 0.3 s is eased to zero (no musical fade-out)
const easeN = Math.round(0.3 * SR);
const easeEnd = st => {
  for (let i = 0; i < easeN; i++) {
    const g = i / easeN;
    st.L[n - 1 - i] *= g;
    st.R[n - 1 - i] *= g;
  }
};
for (const st of Object.values(music)) easeEnd(st);

// balance: each music stem to its own loudness, then one gain so their sum sits near -19 LUFS before her voice and the master
const BALANCE = { pad: -26, bass: -25, beat: -23.5, lead: -22, animals: -21.5 };
const stemGainDb = {};
for (const [k, st] of Object.entries(music)) {
  const g = 10 ** ((BALANCE[k] - lufs(st.L, st.R)) / 20);
  stemGainDb[k] = +(20 * Math.log10(g)).toFixed(2);
  for (let i = 0; i < n; i++) {
    st.L[i] *= g;
    st.R[i] *= g;
  }
}
const sumOf = list => {
  const s = stereo(n);
  for (const st of list) for (let i = 0; i < n; i++) {
    s.L[i] += st.L[i];
    s.R[i] += st.R[i];
  }
  return s;
};
let musicSum = sumOf(Object.values(music));
const g0 = 10 ** ((-19 - lufs(musicSum.L, musicSum.R)) / 20);
for (const st of [...Object.values(music), musicSum]) for (let i = 0; i < n; i++) {
  st.L[i] *= g0;
  st.R[i] *= g0;
}
say(`stem balance gains (dB): ${JSON.stringify(stemGainDb)}, then ${(20 * Math.log10(g0)).toFixed(2)} dB`);

// ---------------------------------------------------------------- her voice, and the music ducked under it
const lines = readLines(join(here, 'lines.json'));
const dj = renderDj(DJ, lines, ROOT, n, musicSum);
easeEnd(dj.stem);
for (const st of Object.values(music)) for (let i = 0; i < n; i++) {
  st.L[i] *= dj.duck[i];
  st.R[i] *= dj.duck[i];
}
const stems = { ...music, dj: dj.stem };
say(`dj: ${dj.info.filter(i => i.take).length}/${dj.info.length} lines with takes`);
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
  id: s.id, name: s.name, nameIs: s.nameIs, startBeat: s.bar * 4, beats: s.bars * 4, startSec: +(s.bar * 4 * 0.48).toFixed(3), feature: s.feature, what: s.what,
}));
const LIC = {
  'grazers-2.mp3': 'ElevenLabs sound generation, made for this game', 'grazers-3.mp3': 'CC0 1.0, "z-moo01.wav" by Zozzy',
  'turtles-2.mp3': 'ElevenLabs sound generation, made for this game', 'frogs-1.mp3': 'ElevenLabs sound generation, made for this game',
  'frogs-5.mp3': 'CC0 1.0, "Frog.ogg" by egomassive', 'lizards-1.mp3': 'ElevenLabs sound generation, made for this game',
  'flyers-3.mp3': 'CC BY 4.0, "Curlew .wav" by Benboncan, https://freesound.org/people/Benboncan/sounds/72892/',
  'horn-1.mp3': 'CC0 1.0, "Alpenhorn.aiff" by Danjocross', 'marimba.mp3': 'CC0 1.0, "Marimba - C5" by sgossner',
};
const used = [...new Set(callLog.map(c => c.file)), 'horn-1.mp3', 'marimba.mp3'];
const sources = [
  ...used.map(f => `remake/assets/audio/kafli5/hljod/${f} (${LIC[f] ?? '?'})`),
  ...['wing-1.mp3', 'wing-2.mp3', 'wing-3.mp3'].map(f => `remake/assets/audio/kafli4/hljod/${f} (CC0 1.0, "Large Wings Flapping - Foley.wav" by tothrec2, https://freesound.org/s/596541/)`),
  ...['whoosh-1.mp3', 'whoosh-2.mp3'].map(f => `remake/assets/audio/kafli4/hljod/${f} (ElevenLabs sound generation, made for this game)`),
  ...[...new Set(dj.info.filter(i => i.take).map(i => i.take))].map(f => `${f} (the game's own line: Flugeðla, recorded for this remix)`),
  'remake/tools/kafli5-lag/remix-a/lib/synths.mjs (everything else: synthesized here, after smidur-e)',
];
const song = {
  slot: SLOT,
  name: 'Stóra sviðið',
  style: 'Festival main-stage remix of Ljósfluguballið (French-touch filter disco / nu-disco house): DJ Flugeðla as MC, long builds into big drops, a countdown, the forest as the crowd (roars, claps, a choir), her wing beats as a stage drum, beetle click drums and dragonfly-buzz risers',
  remixOf: 'smidur-e: Ljósfluguballið',
  bpm: BPM,
  beatZeroSec: 0,
  key: KEY,
  lengthSec,
  tune: TUNE,
  sections,
  tuneNotes: score.tuneNotes.map(t => ({ group: t.group, beat: t.beat })),
  dj: dj.info.map(i => ({ id: i.id, beat: i.beat, sec: i.sec, text: i.text })),
  cues: score.cues,
  loop: LOOP,
  stems: { pad: 'stems/pad.mp3', bass: 'stems/bass.mp3', beat: 'stems/beat.mp3', lead: 'stems/lead.mp3', animals: 'stems/animals.mp3', dj: 'stems/dj.mp3' },
  newAnimals: {
    beetles: 'Bjöllur: beetles that play the drums (wooden clicks on D and G); a new group for the video, cues "call" group "beetles".',
    dragonflies: 'Drekaflugur: dragonflies whose wings buzz on D and G as they fly past the stage, and as risers; cues "call" group "dragonflies".',
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
const checks = { takes: takeInfo, stemGainDb, stemSamplePeakFloat: stemPeaks, mp3: { mix: loud, stems: stemLoud } };
const [dl, dr] = decode(join(OUT, 'mix.mp3'), 2);
const secList = SECTIONS.map(s => ({ id: s.id, startBeat: s.bar * 4, beats: s.bars * 4 }));
checks.sections = sectionStats(dl, dr, secList, SPB);
checks.barRms = barRms(mono(dl, dr), SPB, Math.ceil(END_BEAT / 4) + 1);
checks.barRmsLow = barRms(lowpassed(mono(dl, dr)), SPB, Math.ceil(END_BEAT / 4) + 1);
checks.biggestJump = biggestJump(mono(dl, dr).subarray(Math.round(2 * SR)));
checks.biggestJump.sec = +(checks.biggestJump.sec + 2).toFixed(2);
{
  let best = 0, bestLag = 0;
  const a = Math.round(64 * SPB), len = SR * 2;
  for (let lag = -3000; lag <= 3000; lag++) {
    let s = 0;
    for (let i = 0; i < len; i += 4) s += mix.L[a + i] * dl[a + i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  checks.mp3OffsetSamples = bestLag;
}
checks.loop = {};
const skip = 8 * SPB;
for (const [k, st] of Object.entries(stems)) checks.loop[k] = loopSeam(st, LOOP.startBeat * SPB, LOOP.beats * SPB, skip);
checks.loop.mix = loopSeam(mix, LOOP.startBeat * SPB, LOOP.beats * SPB, skip);
// her lines: each one's loudness (K-weighted, over its voiced part) against the music under it (after the duck), in the float stems
const musicAfter = sumOf(Object.values(music));
checks.dj = dj.info.map(i => {
  const a = sampleOf(i.beat), b = Math.min(n, a + Math.round(i.seconds * SR));
  const v = kLoud(dj.stem.L, dj.stem.R, a, b), m = kLoud(musicAfter.L, musicAfter.R, a, b);
  return { key: i.key, beat: i.beat, text: i.text, take: !!i.take, seconds: i.seconds, voiceLufs: +v.toFixed(1), musicLufs: +m.toFixed(1), overMusicDb: +(v - m).toFixed(1), gainDb: i.gainDb, fx: i.fx };
});
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
const bad = checks.calls.filter(c => c.cents === null || Math.abs(c.cents) > 20);
const late = checks.calls.filter(c => c.mode === 'onset' && Math.abs(c.attackMs) > 25);
checks.summary = {
  lengthSec, lufs: loud.lufs, truePeak: loud.truePeak, stemsMaxTruePeak: QUICK ? null : Math.max(...Object.values(stemLoud).map(s => s.truePeak)),
  calls: checks.calls.length, callsOff20c: bad.length, worstCallCents: Math.max(...checks.calls.filter(c => c.cents !== null).map(c => Math.abs(c.cents))),
  tuneNotes: checks.tune.length, tuneWorstCents: Math.max(...checks.tune.map(c => Math.abs(c.cents ?? 999))), tuneWorstAttackMs: Math.max(...checks.tune.map(c => Math.abs(c.attackMs))),
  onsetCallsOff25ms: late.length, hornWorstCents: Math.max(...checks.horn.map(h => Math.abs(h.cents))),
  loopWorstDiffDb: Math.max(...Object.values(checks.loop).map(l => l.worstDiffDb)),
  biggestJumpDb: checks.biggestJump,
  djOverMusic: { min: Math.min(...checks.dj.map(d => d.overMusicDb)), max: Math.max(...checks.dj.map(d => d.overMusicDb)) },
};
writeFileSync(join(OUT, 'checks.json'), JSON.stringify(checks, null, 1) + '\n');
console.log(JSON.stringify({ summary: checks.summary, sections: checks.sections, loop: checks.loop, horn: checks.horn, mp3OffsetSamples: checks.mp3OffsetSamples }, null, 1));
console.log('dj:', checks.dj.map(d => `${d.beat} ${d.key} ${d.voiceLufs}/${d.musicLufs} (+${d.overMusicDb})`).join('\n    '));
if (bad.length) console.log('off-pitch calls:', JSON.stringify(bad.slice(0, 20)));
if (late.length) console.log('late calls:', JSON.stringify(late.slice(0, 20)));
rmSync(WORK, { recursive: true, force: true });
say('done');
