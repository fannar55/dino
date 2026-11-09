// Round two's party sounds, the `fx` stem: a real crowd (cheers, children, claps in time), air horns, the drop's impact and sub,
// reverse cymbals, scratches, a vinyl rewind and a needle lift. Every sound is a fetched recording (Freesound CC0 / CC BY, read on
// its own page) or an ElevenLabs sound generation made for this game, fetched by fetch-sounds.mjs into
// qa/remake/kafli5/lag/djamm/1/sounds/<source>/ (not committed); each cut is levelled to a -1 dBFS peak and placed by beat.
// Claps in time are layered from real claps: single claps cut from an audience recording (25293) and one close clap (344962),
// a dozen per hit, each a little early or late, higher or lower, left or right, like a crowd of children clapping along.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SR, decode } from './io.mjs';
import { stereo, panGains, rng, reverb, addStereo } from './dsp.mjs';
import { onsets } from './analyze.mjs';
import { resample } from './takes.mjs';
import { SPB } from './score.mjs';

export const SOUND_DIR = 'qa/remake/kafli5/lag/djamm/1/sounds';
const fs_ = id => `freesound/${id}/${id}.mp3`;
/** The sounds by name: file under SOUND_DIR, the cut used (s), and the id their source is listed under. */
export const SOUNDS = {
  cheerSwell: { file: fs_(221568), id: '221568', cut: [0.7, 14.2] }, // a crowd's cheer swelling into clapping (peaks 1.8 s in)
  cheerBig: { file: fs_(397434), id: '397434', cut: [0, 20.4] },
  cheerShort: { file: fs_(182571), id: '182571', cut: [0.35, 7.8] },
  crowdBed: { file: fs_(736924), id: '736924', cut: [0.2, 18.6] }, // a hundred young people cheering, steady
  kidsCheer: { file: 'eleven/kids-cheer-big.mp3', id: 'kids-cheer-big', cut: [0, 6] },
  kidsYay: { file: 'eleven/kids-yay.mp3', id: 'kids-yay', cut: [0, 3] },
  kidsLaugh: { file: 'eleven/kids-laugh.mp3', id: 'kids-laugh', cut: [0, 3] },
  kidsWoah: { file: fs_(397317), id: '397317', cut: [0.38, 2.15] },
  kidsShout: { file: fs_(243406), id: '243406', cut: [0, 2.9] },
  yay: { file: fs_(252808), id: '252808', cut: [0, 2.6] },
  airPulse: { file: fs_(557337), id: '557337', cut: [0.04, 2.6] }, // the dancehall air horn: three short blasts and a long one
  airLong: { file: fs_(68999), id: '68999', cut: [0.22, 2.4] },
  hit: { file: fs_(648534), id: '648534', cut: [0.6, 4.2] }, // a transition hit: its peak (1.7 s in) on the beat
  sub: { file: fs_(212768), id: '212768', cut: [0, 4.0] }, // a bass drop: full at once, falling and fading over 3 s
  subDeep: { file: fs_(856174), id: '856174', cut: [0.35, 4.0] },
  revCymbal: { file: fs_(165154), id: '165154', cut: [0, 3.06] }, // a reverse crash: its end on the beat
  revCymbal2: { file: fs_(110218), id: '110218', cut: [0, 3.06] },
  scratch1: { file: fs_(151822), id: '151822', cut: [0, 0.2] },
  scratch2: { file: fs_(151822), id: '151822', cut: [0.25, 0.37] },
  scratch3: { file: fs_(151822), id: '151822', cut: [0.55, 0.9] },
  scratchClean: { file: fs_(269476), id: '269476', cut: [0, 0.65] },
  vinylRewind: { file: fs_(162493), id: '162493', cut: [0, 2.45] },
  needle: { file: fs_(575239), id: '575239', cut: [0, 0.45] },
  clapGrains: { file: fs_(25293), id: '25293', cut: [0.5, 8.1] },
  clapOne: { file: fs_(344962), id: '344962', cut: [0, 0.4] },
};

const cache = new Map();
function load(ROOT, name) {
  if (cache.has(name)) return cache.get(name);
  const s = SOUNDS[name];
  const file = join(ROOT, SOUND_DIR, s.file);
  if (!existsSync(file)) throw new Error(`${file} is missing: run node remake/tools/kafli5-lag/djamm-1/fetch-sounds.mjs --fetch (and --eleven)`);
  const [L0, R0] = decode(file, 2);
  const a = Math.round(s.cut[0] * SR), b = Math.min(L0.length, Math.round(s.cut[1] * SR));
  const L = L0.slice(a, b), R = R0.slice(a, b);
  let pk = 0, pi = 0;
  for (let i = 0; i < L.length; i++) {
    const v = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (v > pk) {
      pk = v;
      pi = i;
    }
  }
  const g = 10 ** (-1 / 20) / (pk || 1);
  const f = Math.round(0.003 * SR), fo = Math.round(0.02 * SR);
  for (let i = 0; i < L.length; i++) {
    let e = g;
    if (i < f && s.cut[0] > 0) e *= i / f;
    if (i > L.length - fo) e *= (L.length - i) / fo;
    L[i] *= e;
    R[i] *= e;
  }
  const out = { L, R, peakAt: pi };
  cache.set(name, out);
  return out;
}

/** The single claps: each onset of the audience recording cut short (70 ms), and the close clap. */
function clapPool(ROOT) {
  if (cache.has('clapPool')) return cache.get('clapPool');
  const src = load(ROOT, 'clapGrains');
  const m = new Float32Array(src.L.length);
  for (let i = 0; i < m.length; i++) m[i] = 0.5 * (src.L[i] + src.R[i]);
  const on = onsets(m);
  const pool = [];
  const len = Math.round(0.07 * SR);
  for (let k = 0; k < on.length; k++) {
    if (k + 1 < on.length && on[k + 1] - on[k] < 0.05) continue; // two claps on top of each other: skip
    const a = Math.max(0, Math.round(on[k] * SR) - Math.round(0.004 * SR));
    const g = new Float32Array(len);
    let pk = 0;
    for (let i = 0; i < len && a + i < m.length; i++) {
      const env = Math.min(1, i / (0.002 * SR)) * Math.exp(-Math.max(0, i - 0.012 * SR) / (0.018 * SR));
      g[i] = m[a + i] * env;
      pk = Math.max(pk, Math.abs(g[i]));
    }
    for (let i = 0; i < len; i++) g[i] /= pk || 1;
    pool.push(g);
  }
  const one = load(ROOT, 'clapOne');
  const c1 = new Float32Array(one.L.length);
  for (let i = 0; i < c1.length; i++) c1[i] = 0.5 * (one.L[i] + one.R[i]);
  pool.push(c1);
  cache.set('clapPool', pool);
  return pool;
}

const sampleOf = beat => Math.round(beat * SPB);

/**
 * Render the fx events into a stereo buffer of n samples. Events:
 *   { snd, beat, db = 0, align = 'start' | 'end' | 'peak', pan = 0 (mono sources), rate = 1, len (s, then a 50 ms fade) }
 *   { claps: [beats], db = 0, people = 12, seed }
 */
export function renderFx(events, n, ROOT) {
  const out = stereo(n);
  const room = stereo(n);
  const used = new Set();
  for (const e of events) {
    if (e.claps) {
      const pool = clapPool(ROOT);
      used.add('25293').add('344962');
      const r = rng(e.seed ?? 77);
      const people = e.people ?? 12;
      for (const beat of e.claps) {
        for (let p = 0; p < people; p++) {
          const g0 = pool[Math.floor(r() * pool.length)];
          const g = resample(g0, 0.88 + 0.24 * r());
          const at = sampleOf(beat) + Math.round((r() * 2 - 1) * 0.012 * SR) - Math.round(0.002 * SR);
          const [gl, gr] = panGains((r() * 2 - 1) * 0.8);
          const v = 10 ** ((e.db ?? 0) / 20) * (0.55 + 0.45 * r()) / Math.sqrt(people);
          for (let i = 0; i < g.length; i++) {
            const j = at + i;
            if (j < 0 || j >= n) continue;
            out.L[j] += g[i] * v * gl;
            out.R[j] += g[i] * v * gr;
            room.L[j] += g[i] * v * gl * 0.5;
            room.R[j] += g[i] * v * gr * 0.5;
          }
        }
      }
      continue;
    }
    const s = load(ROOT, e.snd);
    used.add(SOUNDS[e.snd].id);
    let L = s.L, R = s.R, peakAt = s.peakAt;
    if (e.rate && e.rate !== 1) {
      L = resample(L, e.rate);
      R = resample(R, e.rate);
      peakAt = Math.round(peakAt / e.rate);
    }
    const len = Math.min(L.length, e.len ? Math.round(e.len * SR) : Infinity);
    const off = e.align === 'end' ? len : e.align === 'peak' ? peakAt : 0;
    const at = sampleOf(e.beat) - off;
    const v = 10 ** ((e.db ?? 0) / 20);
    const mono = s.L === s.R || isMonoish(s);
    const [pl, pr] = panGains(e.pan ?? 0);
    const fo = Math.round(0.05 * SR);
    for (let i = 0; i < len; i++) {
      const j = at + i;
      if (j < 0 || j >= n) continue;
      const f = e.len && i > len - fo ? (len - i) / fo : 1;
      if (mono) {
        out.L[j] += L[i] * v * f * pl * Math.SQRT2;
        out.R[j] += L[i] * v * f * pr * Math.SQRT2;
      } else {
        out.L[j] += L[i] * v * f;
        out.R[j] += R[i] * v * f;
      }
    }
  }
  // the claps in a small room, so the crowd stands somewhere
  addStereo(out, reverb(room, { decay: 0.9, damp: 6000, predelay: 0.012, lowcut: 300, seed: 41, size: 0.7 }), 0, 0.6);
  return { stem: out, used: [...used] };
}
function isMonoish(s) {
  let d = 0, t = 0;
  for (let i = 0; i < s.L.length; i += 7) {
    d += (s.L[i] - s.R[i]) ** 2;
    t += s.L[i] ** 2;
  }
  return d < 1e-6 * (t || 1);
}

/** Every fetched or made sound's record (sources.json), by id. */
export function soundSources(ROOT) {
  const all = {};
  for (const dir of ['freesound', 'eleven']) {
    const f = join(ROOT, SOUND_DIR, dir, 'sources.json');
    if (!existsSync(f)) continue;
    for (const s of JSON.parse(readFileSync(f, 'utf8'))) all[String(s.id)] = s;
  }
  return all;
}
