#!/usr/bin/env node
// Grameðla kemur!'s recorded thump: her footfall and beat 2's far thumps, cut and levelled from the Freesound previews the owner said
// yes to fetching (all CC0 1.0, each page checked, in qa/thrividd/gramedla/hljod/freesound/<id>/<id>.mp3 with sources.json; git
// ignores qa/) into remake/assets/audio/gramedla3d/hljod/, with sounds.json (each layer's source id, seconds and gain) and
// gramedla3d/CREDITS.md made from the same list. The show plays it at her distance (chapters/gramedla3d/sounds.js).
//
//   node remake/tools/gramedla-sounds.mjs          make thump.mp3 from the chosen candidate (ffmpeg and ffprobe on the PATH)
//   node remake/tools/gramedla-sounds.mjs --dry    print what it would make
//
// He is choosing among five cuts by ear (2026-11-12). Until he answers it is C; his choice is the one line below.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHOICE = 'C';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCES = 'qa/thrividd/gramedla/hljod/freesound';
export const OUT = 'remake/assets/audio/gramedla3d/hljod';
const SHOT_PEAK = -3; // dBFS of the made file's peak; the show sets its level from there

const freesound = (id, name, author) => ({ id, name, author, licence: 'CC0 1.0', page: `https://freesound.org/s/${id}/` });
const SOURCE = {
  77027: freesound(77027, 'DinoSteps1.wav', 'andysm'),
  826333: freesound(826333, 'Reverberating thud - heavy reverbating footsteps', 'renrenrenrenren'),
  531725: freesound(531725, 'giant footsteps.mp3', 'Beefmaster69'),
  721601: freesound(721601, 'Giant step', 'DasWaff'),
};
/** The five candidates: each a list of layers, [source id, from s, to s, gain dB] of the preview. */
export const CANDIDATES = {
  A: [[77027, 0, 0.95, 0]], // very deep
  B: [[826333, 0.76, 2.51, 0]], // with its tail
  C: [[531725, 1.31, 2.07, 0]], // about half its energy under 120 Hz, a knock in the middle: it carries on a tablet
  D: [[721601, 0.43, 1.09, 0]],
  E: [[77027, 0, 0.95, -2], [531725, 1.31, 2.07, -7]], // A under C
};

const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });

function peakDb(file) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const match = /max_volume: (-?[\d.]+) dB/.exec(result.stderr ?? '');
  if (!match) throw new Error(`ffmpeg found no peak in ${file}`);
  return Number(match[1]);
}

/** thump.mp3 from the layers: each cut (faded only enough not to click), set to its gain, mixed, mono, its peak at SHOT_PEAK. */
function make(layers) {
  const out = path.join(ROOT, OUT, 'thump.mp3');
  const tmp = out.replace(/\.mp3$/, '.tmp.wav');
  const inputs = [], chains = [];
  layers.forEach(([id, a, b, gain], i) => {
    const src = path.join(ROOT, SOURCES, String(id), `${id}.mp3`);
    if (!fs.existsSync(src)) throw new Error(`its source ${SOURCES}/${id}/${id}.mp3 is not here (qa/ is not in the repo)`);
    const l = b - a, fade = Math.min(0.02, l / 8);
    inputs.push('-i', src);
    chains.push(`[${i}:a]atrim=${a}:${b},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,afade=t=in:d=${fade},afade=t=out:st=${(l - fade * 3).toFixed(3)}:d=${(fade * 3).toFixed(3)},volume=${gain}dB[l${i}]`);
  });
  const mix = layers.length > 1 ? `${layers.map((_, i) => `[l${i}]`).join('')}amix=inputs=${layers.length}:normalize=0:duration=longest[m]` : '[l0]anull[m]';
  ffmpeg([...inputs, '-filter_complex', `${chains.join(';')};${mix}`, '-map', '[m]', '-ac', '1', '-ar', '44100', tmp]);
  const level = SHOT_PEAK - peakDb(tmp);
  ffmpeg(['-i', tmp, '-af', `volume=${level.toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-b:a', '96k', out]);
  fs.rmSync(tmp);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }));
  return { seconds: Math.round(seconds * 1000) / 1000, level: +level.toFixed(2) };
}

function creditsMarkdown(manifest) {
  const t = manifest['thump.mp3'];
  const rows = t.layers.map(l => `| \`hljod/thump.mp3\` | ${t.what} | "${l.source.name}" by ${l.source.author}, ${l.source.page} (${l.from}–${l.to} s of its preview${l.gain ? `, at ${l.gain} dB` : ''}) | ${l.source.licence} |`);
  return `# Sounds in Grameðla kemur!

## Egill's lines

\`g3_egill_kemur.mp3\` ("Hún kemur!") and \`g3_egill_bless.mp3\` ("Bless, Grameðla!"): Egill's voice, made with the game's voice
tools (line set \`gramedla3d\`, \`lines.json\`).

## Her footfall

Her footfall and beat 2's far thumps, cut (candidate ${t.candidate}) and levelled by \`node remake/tools/gramedla-sounds.mjs\` from a Freesound
recording the owner said yes to fetching; the cut is in \`hljod/sounds.json\`. CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/):
no credit is asked; it is given here all the same.

| File | In the show | Source | Licence |
|---|---|---|---|
${rows.join('\n')}

## The rest

Her roar and her breath are chapter 2's recordings (\`assets/audio/kafli2/CREDITS.md\`), the wing beats and the air of the flock are
chapter 4's (\`assets/audio/kafli4/CREDITS.md\`), and the forest's wind and birds are made in the game (\`engine/audio/sfx.js\`).
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dry = process.argv.includes('--dry');
  const layers = CANDIDATES[CHOICE];
  if (!layers) throw new Error(`CHOICE ${CHOICE} is not one of ${Object.keys(CANDIDATES)}`);
  if (dry) {
    console.log(`would make ${OUT}/thump.mp3 from candidate ${CHOICE}: ${layers.map(([id, a, b, g]) => `${id} ${a}–${b} s${g ? ` ${g} dB` : ''}`).join(' + ')}`);
  } else {
    fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
    const { seconds, level } = make(layers);
    const manifest = {
      'thump.mp3': {
        what: 'her footfall, and beat 2\'s far thumps (played at her distance: quieter and duller far off)',
        candidate: CHOICE,
        seconds,
        level, // dB the mix was raised or lowered to put its peak at SHOT_PEAK
        layers: layers.map(([id, from, to, gain]) => ({ id: String(id), from, to, seconds: +(to - from).toFixed(3), gain, source: SOURCE[id] })),
      },
    };
    fs.writeFileSync(path.join(ROOT, OUT, 'sounds.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(ROOT, 'remake/assets/audio/gramedla3d/CREDITS.md'), creditsMarkdown(manifest));
    console.log(`thump.mp3 (candidate ${CHOICE}): ${seconds} s, levelled ${level} dB; sounds.json and gramedla3d/CREDITS.md written`);
  }
}
