// Renders "Tjarnarsveiflan" from scratch: the five stems, the master, the mp3s, song.json and the pictures.
//   node remake/tools/kafli5-lag/smidur-g/render.mjs
// Deterministic: every random choice is seeded. Writes to qa/remake/kafli5/lag/keppni/smidur-g/.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, Bus, rng, seedOf, midiHz, reverb, compress, limit, lufs, truePeak, writeWav, hp, lowshelf, peak as peakEq, highshelf } from './lib/dsp.mjs';
import * as I from './lib/inst.mjs';
import { loadSingers, MAIN } from './lib/animals.mjs';
import { build, BPM, swing, BEATS, LENGTH_BEATS, KEY, GROUP_TONE, TUNE } from './score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../../..');
const OUT = path.join(ROOT, 'qa/remake/kafli5/lag/keppni/smidur-g');
const HLJOD = path.join(ROOT, 'remake/assets/audio/kafli5/hljod');
const SLOT = 'smidur-g';
const SPB = (SR * 60) / BPM; // 17640 samples a beat, exact
const STEMS = ['pad', 'bass', 'beat', 'lead', 'animals'];
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

mkdirSync(path.join(OUT, 'stems'), { recursive: true });
const TMP = path.join(OUT, 'tmp');
mkdirSync(TMP, { recursive: true });

const score = build();
const N = Math.ceil(LENGTH_BEATS * SPB);
const dry = Object.fromEntries(STEMS.map(s => [s, new Bus(N)]));
const send = Object.fromEntries(STEMS.map(s => [s, new Bus(N)]));
const SEND = { pad: 0.2, bass: 0.03, beat: 0.12, lead: 0.24, animals: 0.16 };
const singers = loadSingers(HLJOD);
log('score', score.events.length, 'events; horn take', singers.hornPitch().toFixed(1), 'Hz; marimba', singers.marimbaPitch().toFixed(1), 'Hz');

// instrument levels into their stems
const LV = {
  trumpet: 0.17, trombone: 0.15, alto: 0.15, tenor: 0.13, bari: 0.12, clarinet: 0.3,
  solo: { trumpet: 0.21, trombone: 0.27, clarinet: 0.36, vibes: 0.46 },
  vibes: 0.46, piano: 0.36, guitar: 0.42, bass: 0.36, sloedla: 0.46,
  call: 0.9, marimba: 0.24,
  ride: 0.52, hatfoot: 0.52, kick: 0.45, snare: 0.46, rim: 0.42, tom: 0.45, crash: 0.3, snap: 0.62, sweep: 0.42, btap: 0.45, block: 0.62,
};

// time of a notated beat, in samples (swung eighths), with a small human push for horns (never for the grid's own parts)
const sampleAt = t => Math.round(swing(t) * SPB);
const durS = (t, d) => ((swing(t + d) - swing(t)) * SPB) / SR;

// a pool of drum hits per kind (rendered once, picked by seed), so the kit is consistent and fast
const pools = new Map();
function drum(kind, vel, seed, opts) {
  const key = `${kind}:${opts?.hz ?? ''}:${opts?.bell ?? ''}`;
  if (!pools.has(key)) {
    const make = s => {
      switch (kind) {
        case 'ride': return I.ride(1, s, { bell: opts?.bell ?? 0.3 });
        case 'hatfoot': return I.hat('foot', 1, s);
        case 'kick': return I.kick(1, s);
        case 'snare': return I.snare(1, s);
        case 'rim': return I.snare(1, s, { rim: true });
        case 'tom': return I.tom(opts.hz, 1, s);
        case 'crash': return I.crash(1, s);
        case 'snap': return I.snap(1, s);
        case 'sweep': return I.brush('sweep', 1, s, 0.38);
        case 'btap': return I.brush('tap', 1, s);
        default: throw new Error(kind);
      }
    };
    pools.set(key, Array.from({ length: 6 }, (_, i) => make(seedOf(`${key}#${i}`))));
  }
  const pool = pools.get(key);
  return pool[seed % pool.length];
}

// her horn's pitch curve from its note flags
function hornCents(dur, o, r) {
  const ph = r() * 6.283;
  return t => {
    let c = 0;
    if (o.from) c += o.from * Math.exp(-t / 0.05); // scoop up into the note
    else c += -22 * Math.exp(-t / 0.03);
    if (o.vib && t > 0.25) c += o.vib * Math.min(1, (t - 0.25) / 0.3) * Math.sin(6.283 * 5.2 * t + ph);
    if (o.doit && t > dur - 0.05) c += o.doit * Math.min(1, (t - dur + 0.05) / 0.16) ** 1.6;
    return c;
  };
}

const callLog = [];
let done = 0;
for (const e of score.events) {
  const r = rng(seedOf(`${e.stem}|${e.inst}|${e.t < 32 ? (e.t % 16) + 100 : e.t}|${e.midi}|${e.pan}`));
  let at = sampleAt(e.t);
  const dur = durS(e.t, e.d);
  let y = null;
  let gain = 1;
  const o = e.opts ?? {};
  switch (e.inst) {
    case 'trumpet': case 'trombone': case 'alto': case 'tenor': case 'bari': case 'clarinet': {
      const hum = o.section ? (r() - 0.5) * 0.014 : (r() - 0.35) * 0.012; // section players spread, soloists a hair behind
      at += Math.round(hum * SR);
      const det = o.section ? 2 ** (((r() - 0.5) * 7) / 1200) : 1;
      const hold = o.staccato ? Math.min(dur, 0.16) : Math.max(0.06, dur - 0.03);
      y = I.horn(e.inst, midiHz(e.midi) * det, hold, e.vel, { ...o, seed: seedOf(`${e.t < 32 ? (e.t % 16) + 100 : e.t}|${e.midi}|${e.pan}`) });
      gain = o.solo ? LV.solo[e.inst] ?? LV[e.inst] : LV[e.inst];
      break;
    }
    case 'vibes': {
      at += Math.round((r() - 0.4) * 0.006 * SR);
      y = I.vibes(midiHz(e.midi), Math.max(0.12, dur - 0.04), e.vel, { at: at / SR, ring: o.ring, seed: seedOf(`v${e.t}`) });
      gain = LV.vibes;
      break;
    }
    case 'piano': {
      at += Math.round((r() - 0.5) * 0.004 * SR);
      y = I.piano(midiHz(e.midi), Math.max(0.08, dur), e.vel, { seed: seedOf(`p${e.midi}`) });
      gain = LV.piano;
      break;
    }
    case 'bass': {
      y = I.bass(midiHz(e.midi), Math.max(0.1, dur - 0.02), e.vel, { seed: seedOf(`b${e.t < 32 ? e.t % 16 : e.t}`) });
      gain = LV.bass;
      break;
    }
    case 'guitar': {
      y = I.guitarChunk(o.chord, Math.min(0.17, dur), e.vel, { seed: seedOf(`g${e.t < 32 ? e.t % 16 : e.t}`) });
      gain = LV.guitar;
      break;
    }
    case 'block': {
      y = I.block(midiHz(e.midi), e.vel, seedOf(`k${e.t}`));
      gain = LV.block;
      break;
    }
    case 'sloedla': {
      const soft = dur > 1.2;
      y = singers.horn(midiHz(e.midi), Math.max(0.12, dur - 0.02), { cents: hornCents(dur, o, r), soft });
      gain = LV.sloedla * e.vel ** 1.2;
      break;
    }
    case 'call': {
      const tone = GROUP_TONE[o.group];
      const name = o.take ?? MAIN[o.group];
      const toneHz = midiHz(60 + ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(tone));
      const c = singers.take(name, toneHz);
      const maxLen = Math.round((dur + 0.08) * SR);
      y = c.y.length > maxLen ? c.y.slice(0, maxLen) : c.y;
      if (c.y.length > maxLen) {
        const fo = Math.round(0.06 * SR);
        y = Float32Array.from(y);
        for (let i = 0; i < fo; i++) y[y.length - 1 - i] *= i / fo;
      }
      gain = LV.call * e.vel;
      callLog.push({ beat: e.t, group: o.group, take: name, cents: c.cents });
      break;
    }
    case 'marimba': {
      y = singers.marimba(midiHz(e.midi), Math.max(0.2, dur));
      gain = LV.marimba * e.vel;
      break;
    }
    default: {
      // drums
      y = drum(e.inst, e.vel, Math.floor(r() * 1e6), o);
      gain = LV[e.inst] * e.vel;
    }
  }
  dry[e.stem].add(y, at, gain, e.pan);
  const sendLevel = e.inst === 'kick' || e.inst === 'bass' ? 0.02 : e.inst === 'ride' ? 0.06 : SEND[e.stem];
  send[e.stem].add(y, at, gain * sendLevel, e.pan);
  if (++done % 500 === 0) log('rendered', done);
}
log('notes rendered');

// the room: one hall for everyone (per stem, so the stems still add up to the song)
const stems = {};
for (const s of STEMS) {
  const wet = reverb(send[s], { decay: 1.5, size: 1.05, damp: 6500, pre: 0.02 });
  const b = dry[s];
  b.mix(wet, 1);
  // each stem's own clean-up: no rumble under 35 Hz
  hp(b.L, 32); hp(b.R, 32);
  stems[s] = b;
  log('stem', s, 'peak', b.peak().toFixed(3));
}

// the stems share one scale so that their sum (the song before the master) peaks at -1 dBFS
const sum = new Bus(N);
for (const s of STEMS) sum.mix(stems[s]);
const pre = Math.max(sum.peak(), ...STEMS.map(s => stems[s].peak()));
const scale = 10 ** (-1 / 20) / pre;
for (const s of STEMS) stems[s].scale(scale);
sum.scale(scale);
log('pre-master peak', pre.toFixed(3), 'scale', scale.toFixed(3));

// the master: tablet-minded EQ, a gentle glue compressor, loudness to -16 LUFS, a true-peak limiter at -1.5 dBTP
const master = new Bus(N);
master.mix(sum);
for (const ch of [master.L, master.R]) {
  hp(ch, 40);
  lowshelf(ch, 150, -2.5);
  peakEq(ch, 320, 0.9, -1.5);
  peakEq(ch, 2500, 0.7, 2.0);
  highshelf(ch, 8000, 1.0);
}
compress(master, { threshold: -20, ratio: 1.8, attack: 0.025, release: 0.3 });
let L0 = lufs(master.L, master.R);
let g = 10 ** ((-16 - L0) / 20);
master.scale(g);
const CEIL = 10 ** (-1.6 / 20);
limit(master, CEIL, { lookahead: 3, release: 0.15 });
let L1 = lufs(master.L, master.R);
// one more nudge after the limiter took its share
master.scale(10 ** ((-16 - L1) / 20));
limit(master, CEIL, { lookahead: 3, release: 0.15 });
L1 = lufs(master.L, master.R);
const tp = 20 * Math.log10(truePeak(master.L, master.R));
log('master', L1.toFixed(2), 'LUFS, true peak', tp.toFixed(2), 'dBTP');

// files
const enc = (wav, mp3) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2', mp3]);
writeWav(path.join(TMP, 'mix.wav'), master.L, master.R);
enc(path.join(TMP, 'mix.wav'), path.join(OUT, 'mix.mp3'));
for (const s of STEMS) {
  writeWav(path.join(TMP, `${s}.wav`), stems[s].L, stems[s].R);
  enc(path.join(TMP, `${s}.wav`), path.join(OUT, 'stems', `${s}.mp3`));
}
writeWav(path.join(TMP, 'premaster.wav'), sum.L, sum.R);
log('mp3s written');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(OUT, 'mix.mp3'), '-lavfi', 'showspectrumpic=s=1800x720:legend=1:fscale=log:scale=log:color=intensity', path.join(OUT, 'spectrogram.png')]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(OUT, 'mix.mp3'), '-lavfi', 'showwavespic=s=1800x360:split_channels=1:colors=0x2b6cb0|0x2f855a', '-frames:v', '1', path.join(OUT, 'waveform.png')]);

// measured loudness of the mp3 (ffmpeg's ebur128)
const sumText = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(OUT, 'mix.mp3'), '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const I_ = /I:\s+(-?[\d.]+) LUFS/g;
let mI = null; let m;
while ((m = I_.exec(sumText))) mI = Number(m[1]);
const pk = /Peak:\s+(-?[\d.]+) dBFS/g;
let mP = null;
while ((m = pk.exec(sumText))) mP = Number(m[1]);
log('mp3 ebur128:', mI, 'LUFS, true peak', mP, 'dBTP');

// song.json
const secOf = b => (swing(b) * SPB) / SR;
const song = {
  slot: SLOT,
  name: 'Tjarnarsveiflan',
  style: 'Big band jump swing (Basie riffs, a Louis Prima bounce): walking bass, ride cymbal, horn riffs, a stop-time chorus for her horn, a shout chorus and a Basie plink ending',
  bpm: BPM,
  beatZeroSec: 0,
  key: KEY.name,
  lengthSec: Number((N / SR).toFixed(3)),
  tune: TUNE,
  sections: score.sections.map(s => ({ ...s, startSec: Number(secOf(s.startBeat).toFixed(3)) })),
  tuneNotes: score.tuneNotes,
  cues: score.cues,
  loop: score.loop,
  stems: Object.fromEntries(STEMS.map(s => [s, `stems/${s}.mp3`])),
  sources: [
    ...new Set(callLog.map(c => c.take)), 'horn-1', 'marimba',
  ].sort().map(n => {
    const lic = { 'grazers-3': 'CC0 1.0', 'turtles-3': 'CC BY 4.0', 'frogs-4': 'CC0 1.0', 'frogs-5': 'CC0 1.0', 'lizards-3': 'CC0 1.0', 'flyers-2': 'CC BY 4.0 (Benboncan)', 'flyers-3': 'CC BY 4.0 (Benboncan)', marimba: 'CC0 1.0', 'horn-1': 'CC0 1.0' }[n] ?? 'ElevenLabs sound generation, made for this game';
    return `remake/assets/audio/kafli5/hljod/${n}.mp3 (${lic})`;
  }),
  loudness: { lufs: mI ?? Number(L1.toFixed(2)), truePeak: mP ?? Number(tp.toFixed(2)) },
};
writeFileSync(path.join(OUT, 'song.json'), `${JSON.stringify(song, null, 2)}\n`);
writeFileSync(path.join(TMP, 'calls.json'), `${JSON.stringify({ calls: callLog, takes: singers.info }, null, 2)}\n`);
log('song.json written; length', song.lengthSec, 's; beat', BEATS);
void rmSync;
