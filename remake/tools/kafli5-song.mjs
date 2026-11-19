#!/usr/bin/env node
// Chapter 5's song in the game (Task 7): the owner's pick of 2026-11-11, DJ Flugeðla's set "Stóra sviðið" on the real disco-funk
// band (tools/kafli5-lag/djamm-1, rendered into qa/remake/kafli5/lag/djamm/1/, which git ignores). This tool carries what the game
// plays from there into remake/assets/audio/kafli5/song/:
//
//   djamm.mp3        the whole set, as rendered (scene 6 streams it: engine/audio/song.js)
//   loop-<layer>.mp3 the set's loop (its beats 64-96: the band alone, one whole chord cycle) a layer a file, for scenes 4-5
//                    (engine/audio/stems.js): drums, bass, music, and far (the three together, muffled, as heard from far away);
//                    and calm, eight bars of the set's quiet record (the one under her horn: no drums, the song's key and
//                    tempo), which plays low under the chapter's first scenes and its last (kafli5-song.js CALM).
//                    Each file is the loop's last bar, the loop, and its first bar again, so the loop's two ends are in the file
//                    with what comes round before and after them, and a decoder that starts a few milliseconds off still loops
//                    cleanly; song.json says where the loop starts in the file and how long it is.
//   song.json        the tempo and the key (as theme.json has them: five notes of the major pentatonic, root first), the loop, and
//                    the set's sections, her lines and its cues by beat, which scene 6 is cut to
//   CREDITS.md       every sound in the set that is not the game's own, with its licence
// and remake/chapters/kafli5-set.js, the same song.json as a module, which the chapter's script and its tests read without a fetch.
// song.json is the chapter's theme too (chapters/kafli5.js theme): it names no file, so the page plays no theme of its own, and the
// forest dances and the effects ring on this song's tempo and key.
//
//   node remake/tools/kafli5-song.mjs          writes all of it
//   node remake/tools/kafli5-song.mjs --check  writes nothing: says whether the files are what the render would give
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FROM = path.join(ROOT, 'qa/remake/kafli5/lag/djamm/1');
const TO = path.join(ROOT, 'remake/assets/audio/kafli5/song');
const MODULE = path.join(ROOT, 'remake/chapters/kafli5-set.js');
const moduleOf = song => `// Chapter 5's song as the script reads it: assets/audio/kafli5/song/song.json as a module. Written by tools/kafli5-song.mjs: do not
// edit it by hand.
export const SONG = ${song.trimEnd()};
`;
const RATE = 44100;
/** The loop's layers and the stems of the render each is made of; `muffle` is a low-pass (Hz) and `gain` a level (dB). */
export const LAYERS = {
  drums: { stems: ['drums'] },
  bass: { stems: ['bass'] },
  music: { stems: ['music'] },
  far: { stems: ['drums', 'bass', 'music'], muffle: 420, gain: 3 },
  // the quiet record itself (SOURCES.md says where it is kept): its bars 8 to 15, two turns of its four chords, so the loop is as
  // long as the band's. It is a record of long notes, so its end is blended over `seam` s into what comes before its start in
  // the record, and the loop comes round with no step in the sound.
  calm: { record: 'remake/assets/audio/sloedla/v2/djamm-rolegt', fromBar: 8, seam: 0.1, gain: -6 },
};
/** The cues the music video is cut to: every cue of the render but her lines (they are `lines`), each without the name of its sound. */
const NOT_SHOWN = ['dj'];

const run = (command, args) => execFileSync(command, args, { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
const md5 = file => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');

/** What song.json says, from the render's own. */
export function songOf(render) {
  const beat = 60 / render.bpm;
  const bar = 4 * beat;
  const key = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'].map(group => render.tones[group]);
  return {
    about: 'Chapter 5\'s song (tools/kafli5-song.mjs): DJ Flugeðla\'s set "Stóra sviðið" on a real disco-funk band, the owner\'s pick of 2026-11-11. Beats are counted from the set\'s start; the loop is the band alone.',
    name: render.name,
    bpm: render.bpm,
    beatOffset: 0,
    danceBeats: 2, // the forest dances every second beat, as it does to Dino Trail (engine/beat.js danceGrid)
    key,
    loop: {
      layers: Object.fromEntries(Object.keys(LAYERS).map(layer => [layer, `loop-${layer}.mp3`])),
      startSec: bar, // the file opens with the loop's last bar
      seconds: render.loop.beats * beat,
      beats: render.loop.beats,
    },
    set: {
      src: 'djamm.mp3',
      seconds: render.lengthSec,
      endBeat: render.cues.find(cue => cue.kind === 'end').beat,
      loudness: render.loudness,
      sections: render.sections.map(({ id, nameIs, feature, startBeat, beats, record }) => ({ id, nameIs, feature, startBeat, beats, record })),
      lines: render.dj.map(({ id, beat: at, text }) => ({ id, beat: at, text })),
      tune: render.tuneNotes,
      cues: render.cues.filter(cue => !NOT_SHOWN.includes(cue.kind)).map(({ sound, ...cue }) => cue),
    },
  };
}

/** CREDITS.md: the render's sources that are not the chapter's own files. */
export function creditsOf(render) {
  const fetched = render.sources.filter(source => /freesound|ElevenLabs sound generation/.test(source) && !source.startsWith('remake/assets/audio/kafli5/hljod/'));
  const line = source => {
    const [, what] = /^\S+ \((.*)\)$/s.exec(source) ?? [null, source];
    return `- ${what}`;
  };
  const credit = fetched.filter(source => /CC BY/.test(source));
  return [
    '# The sounds in chapter 5\'s song',
    '',
    'DJ Flugeðla\'s set "Stóra sviðið" (`djamm.mp3` and the `loop-*.mp3` layers; `node remake/tools/kafli5-song.mjs`). The band and its',
    'other records are ElevenLabs Music, composed for this game (`tools/sloedla-music.mjs`, presets `djamm` and `djamm-*`), cut from',
    'their stems by `tools/kafli5-lag/djamm-1`. Her lines are the game\'s own voice (`k5_dj_*`), the animals and the horn the chapter\'s',
    'recorded tones (`../CREDITS.md`). The crowd and the DJ\'s sounds are the recordings below, cut, layered and levelled into the set.',
    '',
    '## Recordings that ask for credit',
    '',
    ...credit.map(line),
    '',
    '## Every recording in the set',
    '',
    ...fetched.map(line),
    '',
  ].join('\n');
}

/** A layer cut from a record of its own (LAYERS.calm): the loop's last bar, the loop, its first bar, the loop's end blended round. */
function writeRecordLayer({ record, fromBar, seam, gain = 0 }, render, file) {
  const beat = Math.round((60 / render.bpm) * RATE), bar = 4 * beat;
  const { beatOffset, bpm } = JSON.parse(fs.readFileSync(path.join(ROOT, record, 'song.json'), 'utf8'));
  if (Math.abs(bpm - render.bpm) > 0.01) throw new Error(`${record} is at ${bpm} beats a minute, the set at ${render.bpm}`);
  const a = Math.round(beatOffset * RATE) + fromBar * bar, b = a + render.loop.beats * beat, x = Math.round(seam * RATE);
  const cut = (from, to) => `atrim=start_sample=${from}:end_sample=${to},asetpts=PTS-STARTPTS`;
  const graph = `[0:a]volume=${gain}dB,asplit=4[p][q][r][s];`
    + `[p]${cut(a, b - x)}[body];`
    + `[q]${cut(b - x, b)},afade=t=out:d=${seam}:curve=qsin[out];`
    + `[r]${cut(a - x, a)},afade=t=in:d=${seam}:curve=qsin[in];`
    + '[out][in]amix=inputs=2:normalize=0[end];'
    + '[body][end]concat=n=2:v=0:a=1,asplit=2[loop][again];'
    + `[again]${cut(render.loop.beats * beat - bar, render.loop.beats * beat)}[last];`
    + `[s]${cut(a, a + bar)}[first];`
    + '[last][loop][first]concat=n=3:v=0:a=1[file]';
  run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(ROOT, record, 'song.mp3'), '-filter_complex', graph, '-map', '[file]', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', String(RATE), '-ac', '2', file]);
}

/** One layer's file: the loop's last bar, the loop, its first bar. */
function writeLayer(layer, { stems, muffle, gain = 0, ...other }, render, file) {
  if (other.record) return writeRecordLayer({ ...other, gain }, render, file);
  const beat = Math.round((60 / render.bpm) * RATE), bar = 4 * beat; // 125 bpm: a beat is 21168 samples
  const a = render.loop.startBeat * beat, b = a + render.loop.beats * beat;
  const inputs = stems.flatMap(stem => ['-i', path.join(FROM, 'stems', `${stem}.mp3`)]);
  const sum = stems.length > 1 ? `${stems.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${stems.length}:normalize=0[sum];[sum]` : '[0:a]';
  const tone = muffle ? `lowpass=f=${muffle},lowpass=f=${muffle},` : '';
  const graph = `${sum}${tone}volume=${gain}dB,asplit=3[x][y][z];`
    + `[x]atrim=start_sample=${b - bar}:end_sample=${b},asetpts=PTS-STARTPTS[last];`
    + `[y]atrim=start_sample=${a}:end_sample=${b},asetpts=PTS-STARTPTS[loop];`
    + `[z]atrim=start_sample=${a}:end_sample=${a + bar},asetpts=PTS-STARTPTS[first];`
    + '[last][loop][first]concat=n=3:v=0:a=1[out]';
  run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', String(RATE), '-ac', '2', file]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const render = JSON.parse(fs.readFileSync(path.join(FROM, 'song.json'), 'utf8'));
  const check = process.argv.includes('--check');
  const song = `${JSON.stringify(songOf(render), null, 2)}\n`;
  const credits = creditsOf(render);
  if (check) {
    const same = (file, text) => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text;
    const ok = same(path.join(TO, 'song.json'), song) && same(MODULE, moduleOf(song)) && same(path.join(TO, 'CREDITS.md'), credits) && md5(path.join(TO, 'djamm.mp3')) === md5(path.join(FROM, 'mix.mp3'));
    console.log(ok ? 'the song in the game is the render\'s' : 'the song in the game is NOT the render\'s: run without --check');
    process.exit(ok ? 0 : 1);
  }
  fs.mkdirSync(TO, { recursive: true });
  fs.copyFileSync(path.join(FROM, 'mix.mp3'), path.join(TO, 'djamm.mp3'));
  for (const [layer, how] of Object.entries(LAYERS)) writeLayer(layer, how, render, path.join(TO, `loop-${layer}.mp3`));
  fs.writeFileSync(path.join(TO, 'song.json'), song);
  fs.writeFileSync(MODULE, moduleOf(song));
  fs.writeFileSync(path.join(TO, 'CREDITS.md'), credits);
  for (const name of fs.readdirSync(TO)) console.log(`${name}  ${fs.statSync(path.join(TO, name)).size} bytes`);
}
