#!/usr/bin/env node
// Stjörnuhátíðin's song in the game: the owner's pick H (2026-11-24) as tools/hatid-lag/render.mjs arranged and mixed it, rendered
// into qa/remake/hatid/lag/hatid-h/ (git ignores qa/). This tool carries what the game plays from there into
// remake/assets/audio/hatid/song/:
//
//   hatid.mp3    the whole song, as rendered (the party plays this one file; the stems are never played side by side)
//   song.json    its beat map: the tempo, the key, the six stars' tones, the six sections, the entries, the solos, the calls and
//                the cues, each by the song's beat, and its loudness section by section and bar by bar
//   CREDITS.md   the song and every recording laid on it, with their licences
//   SOURCES.md   every file the render is made from (under qa/remake/hatid/lag/, not in git), with its bytes and md5, so a new
//                render can be checked against them; nothing is uploaded anywhere without the owner's word
// and remake/chapters/hatid-song.js, the same song.json as a module, which the party and its tests read without a fetch (through
// chapters/hatid-score.js). After this the beat map is the only source of truth for where anything is in the song.
//
//   node remake/tools/hatid-song.mjs          writes all of it
//   node remake/tools/hatid-song.mjs --check  writes nothing: says whether the files are what the render gives
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LAG = path.join(ROOT, 'qa/remake/hatid/lag');
const FROM = path.join(LAG, 'hatid-h');
const TO = path.join(ROOT, 'remake/assets/audio/hatid/song');
const MODULE = path.join(ROOT, 'remake/chapters/hatid-song.js');
// The seventh star's motif (render.mjs --stef): the candidate the game plays, carried to assets/audio/hatid/seventh.mp3 with its
// notes in song.json (`seventh`: the ride back ends on its two last tones). 'a' until the owner picks by ear (Task 18: the first).
export const STEF_PICK = 'a';
const STEF = path.join(LAG, 'stef');
const SEVENTH = path.join(ROOT, 'remake/assets/audio/hatid/seventh.mp3');
function stefOf() {
  const { notes, seconds } = JSON.parse(fs.readFileSync(path.join(STEF, 'stef.json'), 'utf8'))[STEF_PICK];
  return { src: '../seventh.mp3', pick: STEF_PICK, notes, seconds };
}
const moduleOf = song => `// Stjörnuhátíðin's song as the party reads it: assets/audio/hatid/song/song.json as a module (read it through hatid-score.js).
// Written by tools/hatid-song.mjs: do not edit it by hand.
export const SONG = ${song.trimEnd()};
`;
const md5 = file => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
const rel = file => path.relative(ROOT, file).replace(/\\/g, '/');

/** song.json from the render's beat map. */
export function songOf(render, seventh = null) {
  return {
    about: 'Stjörnuhátíðin\'s song (tools/hatid-song.mjs): the owner\'s pick H of 2026-11-24, composed by ElevenLabs Music from a description of the scene, arranged from its own stems and mixed for small speakers by tools/hatid-lag/render.mjs. Beats are counted from the first bar line (beatOffset seconds into the file); the tempo is fixed: beat b is at beatOffset + b * 60 / bpm. Read it through chapters/hatid-score.js.',
    name: 'Stjörnuhátíðin',
    bpm: render.bpm,
    beatOffset: render.beatOffset,
    beatsPerBar: 4,
    danceBeats: 2,
    driftMs: render.driftMs,
    key: render.key,
    keyName: render.keyName,
    tuningCents: render.tuningCents,
    motif: render.motif,
    song: {
      src: 'hatid.mp3',
      seconds: render.seconds,
      endBeat: render.endBeat,
      tail: render.tail,
      loudness: render.loudness,
      sections: render.sections.map(({ id, nameIs, startBeat, beats }) => ({ id, nameIs, startBeat, beats })),
      entries: render.entries.map(({ who, sound, beat }) => ({ who, sound, beat })),
      solos: render.solos,
      calls: render.calls,
      cues: render.cues,
    },
    ...(seventh ? { seventh } : {}),
  };
}

/** CREDITS.md: the song and the recordings laid on it. */
export function creditsOf(render) {
  return [
    '# The sounds in Stjörnuhátíðin\'s song',
    '',
    '`hatid.mp3` (`node remake/tools/hatid-lag/render.mjs`, then `node remake/tools/hatid-song.mjs`).',
    '',
    '## The song',
    '',
    'Composed for this game by ElevenLabs Music (`tools/sloedla-music.mjs`, preset `hatid-h`, from a description of the scene; the',
    'owner\'s pick of 2026-11-24), and split into its six stems by ElevenLabs\' stem separator. The game plays it as composed, bar for',
    `bar, but for its solo passage (bars 34-42), played twice on the owner's word, as its bars ${(render.cut?.hRuns ?? [[34, 42]]).map(([a, b]) => `${a}-${b}`).join(', ')},`,
    'so each friend\'s solo is three bars long. Besides that only its stems\' levels change over time (the calls\' gaps, the lighter',
    'solos, the quiet part without drums, the last chorus lifted), and the friends\' sounds below are laid on top. Its voices are the',
    'song\'s own wordless chant.',
    '',
    '## The friends\' sounds',
    '',
    'The game\'s own recordings, cut and levelled where they were first used; here moved onto the beat, levelled again, and (the deep',
    'tone) moved in pitch onto the bass note under it. Flugeðla\'s scratches are no recording: they are the song\'s own chant pushed',
    'back and forth like a record.',
    '',
    '| Sound | File | Source | Licence |',
    '|---|---|---|---|',
    `| Grameðla's stomp | \`${render.sources.stomp}\` | "giant footsteps.mp3" by Beefmaster69, https://freesound.org/s/531725/ | CC0 1.0 |`,
    `| Kambeðla's plates | \`${render.sources.plate}\` | "Footsteps_Mountain_Boots_Rock_Jump_Sequence_Mono.wav" by Nox_Sound, https://freesound.org/people/Nox_Sound/sounds/558477/ (a stone struck) | CC0 1.0 |`,
    `| Uggeðla's tail | \`${render.sources.tail}\` | "Fish Jumping Splash 2.wav" by paulprit, https://freesound.org/people/paulprit/sounds/507091/ | CC0 1.0 |`,
    `| Þórseðla's deep tone | \`${render.sources.deep}\` | "z-moo01.wav" by Zozzy, https://freesound.org/people/Zozzy/sounds/59245/ | CC0 1.0 |`,
    `| Grameðla's roar | \`${render.sources.roar}\` | Sound Effect: Dinosaur creature moan. Download from https://tunetank.com | free for non-commercial use with credit |`,
    '',
    'CC0 asks for no credit; it is given all the same.',
    '',
  ].join('\n');
}

/** SOURCES.md: every file of H's folder and the pick, with bytes and md5. */
export function sourcesOf() {
  const files = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else files.push(file);
    }
  };
  walk(FROM);
  files.push(path.join(LAG, 'lag-val.json'));
  const rows = files.map(file => `| \`${rel(file)}\` | ${fs.statSync(file).size} | \`${md5(file)}\` |`);
  const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  return [
    '# Where the song\'s sources are',
    '',
    'The files Stjörnuhátíðin\'s song is made from are not in git and not in the game: they are under `qa/remake/hatid/lag/` in the',
    'checkout that made them (git ignores `qa/`), and nowhere else until the owner says where they may be kept. `hatid-h/` holds the',
    'song as composed (`song.mp3`; `song.json`, the request and the model\'s plan), its six stems as separated, `measure.json`',
    '(`tools/hatid-lag/measure.mjs`), and the render (`tools/hatid-lag/render.mjs`): `mix.mp3` (this folder\'s `hatid.mp3`), `click.mp3`,',
    '`render.json`, `checks.json` and `stems/` (drums, bass, music, choir and the friends\' sounds, for the ride back\'s remix).',
    '`lag-val.json` is the owner\'s pick. The other candidates (hatid-a to hatid-g) are there too and are no source of this song.',
    '',
    `${files.length} files, ${(bytes / 1e6).toFixed(1)} MB.`,
    '',
    '| File | Bytes | md5 |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const render = JSON.parse(fs.readFileSync(path.join(FROM, 'render.json'), 'utf8'));
  const check = process.argv.includes('--check');
  const song = `${JSON.stringify(songOf(render, stefOf()), null, 2)}\n`;
  const credits = creditsOf(render);
  const sources = sourcesOf();
  if (check) {
    const same = (file, text) => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text;
    const differ = [
      same(path.join(TO, 'song.json'), song) ? null : 'song.json',
      same(MODULE, moduleOf(song)) ? null : 'chapters/hatid-song.js',
      same(path.join(TO, 'CREDITS.md'), credits) ? null : 'CREDITS.md',
      same(path.join(TO, 'SOURCES.md'), sources) ? null : 'SOURCES.md',
      fs.existsSync(path.join(TO, 'hatid.mp3')) && md5(path.join(TO, 'hatid.mp3')) === md5(path.join(FROM, 'mix.mp3')) ? null : 'hatid.mp3',
      fs.existsSync(SEVENTH) && md5(SEVENTH) === md5(path.join(STEF, `${STEF_PICK}.mp3`)) ? null : 'seventh.mp3',
    ].filter(Boolean);
    console.log(differ.length ? `the song in the game is NOT the render's (${differ.join(', ')}): run without --check` : 'the song in the game is the render\'s');
    process.exit(differ.length ? 1 : 0);
  }
  fs.mkdirSync(TO, { recursive: true });
  fs.copyFileSync(path.join(FROM, 'mix.mp3'), path.join(TO, 'hatid.mp3'));
  fs.copyFileSync(path.join(STEF, `${STEF_PICK}.mp3`), SEVENTH);
  console.log(`seventh.mp3 (motif ${STEF_PICK})  ${fs.statSync(SEVENTH).size} bytes`);
  fs.writeFileSync(path.join(TO, 'song.json'), song);
  fs.writeFileSync(MODULE, moduleOf(song));
  fs.writeFileSync(path.join(TO, 'CREDITS.md'), credits);
  fs.writeFileSync(path.join(TO, 'SOURCES.md'), sources);
  for (const name of fs.readdirSync(TO)) console.log(`${name}  ${fs.statSync(path.join(TO, name)).size} bytes`);
}
