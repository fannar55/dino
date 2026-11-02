#!/usr/bin/env node
// Chapter 4's recorded flight sounds (Task 16): the takes the owner ticked on his listening page (2026-11-02, hljod-val.json), cut and
// levelled into remake/assets/audio/kafli4/hljod/, with sounds.json (each file's source, licence and cut) and kafli4/CREDITS.md made
// from the same list. The sources are not in the repo: the ElevenLabs takes (made for this chapter with sound generation, prompts in
// their .json) and the Freesound previews he picked are in qa/remake/kafli4/hljod/ (git ignores qa/); this list is the record of what
// was cut from them.
//
//   node remake/tools/kafli4-sounds.mjs          make every file from its source (ffmpeg and ffprobe on the PATH)
//   node remake/tools/kafli4-sounds.mjs --dry    print what it would make
//
// Loops are stereo, 44.1 kHz, 128 kbps, levelled to LOOP_LUFS; a Freesound slice is made seamless by mixing what follows its end into
// its head (equal-power fades over `xfade` s); an ElevenLabs loop is as generated (it was asked for as a loop). One-shots are mono,
// 44.1 kHz, 96 kbps, faded in and out at their cut, their peak at SHOT_PEAK dBFS. The levels the flight plays them at are its own
// (engine/audio/flight-sounds.js FLIGHT_SOUND, engine/audio/sfx.js SAMPLES).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCES = 'qa/remake/kafli4/hljod';
export const OUT = 'remake/assets/audio/kafli4/hljod';
const LOOP_LUFS = -24;
const SHOT_PEAK = -3;

const ELEVEN = { licence: 'ElevenLabs sound generation, made for this game' };
// as Freesound gives them (each pick's source.json, saved beside it when it was fetched)
const freesound = (id, name, author, licence) => ({ id, name, author, licence, page: `https://freesound.org/s/${id}/` });
const FREESOUND = {
  836086: freesound(836086, 'paragliding wing', 'bruno.auzet', 'CC0 1.0'),
  196699: freesound(196699, 'River - Running water 2', 'vonfleisch', 'CC BY 3.0'),
  596541: freesound(596541, 'Large Wings Flapping - Foley.wav', 'tothrec2', 'CC0 1.0'),
  264438: freesound(264438, 'Woosh', 'lebaston100', 'CC BY 4.0'),
  80937: freesound(80937, 'gust of wind.wav', 'Tony B kksm', 'CC0 1.0'),
  352421: freesound(352421, 'wind_gust.aif', 'joseph.larralde', 'CC0 1.0'),
  511430: freesound(511430, 'Tiny Croc Chirp', 'iwanPlays', 'CC0 1.0'),
  400573: freesound(400573, 'ThằngLằng.wav', 'SieuAmThanh', 'CC0 1.0'),
};
const eleven = (take, what) => ({ from: `eleven/${take}.raw.mp3`, source: { ...ELEVEN, take, prompt: `eleven/${take}.json` }, what });
const free = (id, what, cut = null) => ({ from: `freesound/${id}/${id}.mp3`, source: FREESOUND[id], what, ...(cut ? { cut } : {}) });

/** Each shipped file: its source, what it is in the flight, and, for a recording, the cut ([start, seconds], and `xfade` for a loop). */
export const SOUNDS = {
  // loops
  'airflow.mp3': { loop: true, ...eleven('airflow-2', 'the wind past her ears, its gain following her speed') },
  'flutter.mp3': { loop: true, ...free(836086, 'a paraglider wing in the wind under the airflow: the air on her wings', [8, 20]), xfade: 1.5 },
  'river-a.mp3': { loop: true, ...eleven('river-1', 'the river under her') },
  'river-b.mp3': { loop: true, ...free(196699, 'the river under her, a second layer (a real river)', [10, 20]), xfade: 1.5 },
  'rapids.mp3': { loop: true, ...eleven('rapids-1', 'the white water in the gorge') },
  'falls.mp3': { loop: true, ...eleven('falls-1', 'the waterfall, louder as she nears it') },
  // one-shots
  'wing-1.mp3': free(596541, 'a beat of her wings', [0.14, 0.62]),
  'wing-2.mp3': free(596541, 'a beat of her wings', [1.62, 0.62]),
  'wing-3.mp3': free(596541, 'a beat of her wings', [3.17, 0.62]),
  'whoosh-1.mp3': eleven('whoosh-1', 'a whoosh past trees, rocks or a bank'),
  'whoosh-2.mp3': eleven('whoosh-2', 'a whoosh past trees, rocks or a bank'),
  'whoosh-3.mp3': free(264438, 'a whoosh past trees, rocks or a bank', [0.85, 1.0]),
  'gust-1.mp3': eleven('gust-2', 'a gust (the wind task)'),
  'gust-2.mp3': free(80937, 'a gust (the wind task)', [2.0, 6.5]),
  'gust-3.mp3': free(352421, 'a gust (the wind task)', [11.0, 5.0]),
  'skim-1.mp3': eleven('splash-1', 'her feet skimming the river'),
  'skim-2.mp3': eleven('splash-2', 'her feet skimming the river'),
  'turtle-1.mp3': eleven('turtle-1', 'the turtle answering her call'),
  'turtle-2.mp3': eleven('turtle-2', 'the turtle answering her call'),
  'smalldino-1.mp3': eleven('smalldino-1', 'the small lizards answering her call'),
  'smalldino-2.mp3': eleven('smalldino-2', 'the small lizards answering her call'),
  'smalldino-3.mp3': free(511430, 'the small lizards answering her call', [0, 1.3]),
  'smalldino-4.mp3': free(400573, 'the small lizards answering her call'),
};

const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });

/** The peak (dBFS) of a file, from ffmpeg's volumedetect (which reports on stderr). */
function peakDb(file) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const match = /max_volume: (-?[\d.]+) dB/.exec(result.stderr ?? '');
  if (!match) throw new Error(`ffmpeg found no peak in ${file}`);
  return Number(match[1]);
}

function make(name, job) {
  const src = path.join(ROOT, SOURCES, job.from);
  if (!fs.existsSync(src)) throw new Error(`${name}: its source ${SOURCES}/${job.from} is not here (qa/ is not in the repo).`);
  const out = path.join(ROOT, OUT, name);
  const tmp = out.replace(/\.mp3$/, '.tmp.wav');
  const channels = job.loop ? '2' : '1';
  if (job.loop && job.cut) {
    const [a, l] = job.cut;
    const x = job.xfade;
    ffmpeg(['-i', src, '-filter_complex',
      `[0:a]asplit=2[s1][s2];` +
      `[s1]atrim=${a}:${a + l},asetpts=PTS-STARTPTS,afade=t=in:d=${x}:curve=qsin[head];` +
      `[s2]atrim=${a + l}:${a + l + x},asetpts=PTS-STARTPTS,afade=t=out:d=${x}:curve=qsin[tail];` +
      '[head][tail]amix=inputs=2:normalize=0:duration=first[m]', '-map', '[m]', '-ac', channels, '-ar', '44100', tmp]);
  } else if (job.cut) {
    const [a, l] = job.cut;
    // a short cut (a flap, a whoosh, a chirp) is faded only enough not to click; a long one (a gust cut from a longer wind) swells in
    // and dies away
    const fadeIn = l > 2 ? 0.4 : Math.min(0.03, l / 6);
    const fadeOut = l > 2 ? 0.8 : fadeIn * 3;
    ffmpeg(['-i', src, '-af', `atrim=${a}:${a + l},asetpts=PTS-STARTPTS,afade=t=in:d=${fadeIn},afade=t=out:st=${(l - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`, '-ac', channels, '-ar', '44100', tmp]);
  } else {
    ffmpeg(['-i', src, '-ac', channels, '-ar', '44100', tmp]);
  }
  if (job.loop) {
    ffmpeg(['-i', tmp, '-af', `loudnorm=I=${LOOP_LUFS}:TP=-2:LRA=11`, '-ar', '44100', '-ac', '2', '-b:a', '128k', out]);
  } else {
    const gain = SHOT_PEAK - peakDb(tmp);
    ffmpeg(['-i', tmp, '-af', `volume=${gain.toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-b:a', '96k', out]);
  }
  fs.rmSync(tmp);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }));
  return Math.round(seconds * 1000) / 1000;
}

function creditsMarkdown(manifest) {
  const rows = Object.entries(manifest).map(([name, entry]) => {
    const s = entry.source;
    const from = s.page ? `"${s.name}" by ${s.author}, ${s.page}` : `ElevenLabs take ${s.take}`;
    const cut = entry.cut ? ` (${entry.cut[0]}–${+(entry.cut[0] + entry.cut[1]).toFixed(2)} s)` : '';
    return `| \`hljod/${name}\` | ${entry.what} | ${from}${cut} | ${s.licence} |`;
  });
  return `# Recorded sounds in chapter 4

The flight's sounds (engine/audio/flight-sounds.js) and the skim, the turtle and the small lizards (engine/audio/sfx.js), as the owner
picked them by ear on 2026-11-02. \`node remake/tools/kafli4-sounds.mjs\` cuts and levels them; each cut is in \`hljod/sounds.json\`.
The ElevenLabs takes were generated for this game with its sound generation. The Freesound recordings are under the licences named
here. The two that ask for credit:

- "River - Running water 2" by vonfleisch (https://freesound.org/s/196699/), licensed under CC BY 3.0
  (https://creativecommons.org/licenses/by/3.0/); cut, looped and levelled.
- "Woosh" by lebaston100 (https://freesound.org/s/264438/), licensed under CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/); one whoosh cut and levelled.

| File | In the game | Source | Licence |
|---|---|---|---|
${rows.join('\n')}
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dry = process.argv.includes('--dry');
  if (!dry) fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  const manifest = {};
  for (const [name, job] of Object.entries(SOUNDS)) {
    if (dry) { console.log(`would make ${OUT}/${name} from ${SOURCES}/${job.from}${job.cut ? ` [${job.cut}]` : ''}`); continue; }
    const seconds = make(name, job);
    manifest[name] = { what: job.what, loop: Boolean(job.loop), seconds, from: job.from, ...(job.cut ? { cut: job.cut } : {}), ...(job.xfade ? { xfade: job.xfade } : {}), source: job.source };
    console.log(`${name}: ${seconds} s`);
  }
  if (!dry) {
    fs.writeFileSync(path.join(ROOT, OUT, 'sounds.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(ROOT, 'remake/assets/audio/kafli4/CREDITS.md'), creditsMarkdown(manifest));
    console.log(`${Object.keys(manifest).length} files in ${OUT}, with sounds.json and kafli4/CREDITS.md`);
  }
}
