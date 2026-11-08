#!/usr/bin/env node
// Söngur Slóeðlu: instrumental backing tracks, made with the ElevenLabs Music API (model music_v2_5) and measured.
// One preset = one track: a style, a bpm, a key, a four-chord loop and eight sections of whole 4/4 bars (STRUCTURE), or a form of
// its own. A preset for the new kind of song (engine/sloedla/v2) may have:
//   form      [[name, kind, bars, styles?]], its sections in place of STRUCTURE; styles are added to that section's
//   kinds     { kind: [styles] }, over KINDS        negative  [styles], in place of NEGATIVE
//   folder    its files go to remake/assets/audio/sloedla/<folder>/: song.mp3, song.json and the stems <stem>.mp3 (a later
//             version: song-N.mp3, <stem>-N.mp3) The game plays the
// backing (drums, bass, chords) and its dinosaur instruments play the lead melody on top, in time and in key, so a backing has
// to keep one tempo, stay in one key and leave room for a lead.
//   node remake/tools/sloedla-music.mjs --list                     the presets, with the sections' times
//   node remake/tools/sloedla-music.mjs --credits                  what the account has left (asks for nothing to be made)
//   node remake/tools/sloedla-music.mjs <preset> --plan            writes nothing, asks nothing: prints the composition plan
//   node remake/tools/sloedla-music.mjs <preset> [--version N] [--seed N] [--cache <dir>] [--force]
//                                                                  composes the track (its folder's song.mp3) and its .json
//   node remake/tools/sloedla-music.mjs <preset> --measure [--version N]
//                                                                  runs tools/theme-tempo.mjs on it, adds driftMs, the key it heard,
//                                                                  where the planned sections sit on the beat grid and how loud each is
//   node remake/tools/sloedla-music.mjs <preset> --stems [--version N] [--cache <dir>]
//                                                                  asks the API to split the track: <stem>.mp3 beside it
//   node remake/tools/sloedla-music.mjs <preset> --vocals [--version N]
//                                                                  speech-to-text on the track, to find out whether anyone sings in it
// <id> is the preset's name, and "-N" after it for a later version (--version 2 makes song-2.mp3 in its folder; a preset's
// `revisions` map says what version N asks for differently). A track that exists is never made again (that costs credits) unless
// --force is given.
// A stem that comes back as digital silence (the separator found nothing of that kind) is not worth keeping: delete it by hand.
//
// The plan: music_v2_5 takes a composition plan of chunks with exact durations ("for v2 models section durations are always
// enforced"), so every section is one chunk of bars x 4 x 60000 / bpm ms and the boundaries are known. A plan cannot be combined
// with force_instrumental, so a chunk says "instrumental" in its styles, has no lyric lines, and lists vocals among its negative
// styles. The endpoint is POST /v1/music/detailed, which answers multipart/mixed: the audio, and JSON with the plan the model used
// and the song's metadata. The raw answer is saved to the cache directory before anything is read from it.
//
// theme-tempo.mjs rewrites the json beside the mp3 and keeps its other fields, but it flattens an array at the top of the json
// into "a, b" text, so every array here sits inside an object ("structure", "requested", "request"). The json's "bpm", "beatOffset",
// "key" (five bell notes, Hz) and "tuningCents" are theme-tempo's; what was asked for is in "requested".
//
// The key is read from ELEVENLABS_API_KEY and from nowhere else. It goes into one request header; it is never printed, logged,
// written to a file or put in a URL, and without it the tool stops before it asks for anything.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FOLDER = 'remake/assets/audio/sloedla';
const API = 'https://api.elevenlabs.io/v1';
const MODEL = 'music_v2_5';
const OUTPUT_FORMAT = 'mp3_44100_128';
const TIMEOUT = 15 * 60 * 1000; // ms for one request: a two minute song takes a while

// ---------------------------------------------------------------------------------------------
// The presets

/** Sections every song has, in bars: about two minutes. */
const STRUCTURE = [
  ['Intro', 'intro', 4], ['Verse 1', 'verse', 8], ['Chorus 1', 'chorus', 8], ['Verse 2', 'verse', 8],
  ['Chorus 2', 'chorus', 8], ['Bridge', 'bridge', 8], ['Final Chorus', 'final', 8], ['Outro', 'outro', 4],
];

/** What every section of a kind adds to the styles (the section name in the plan is "[Intro]", "[Verse 1]" ...). */
const KINDS = {
  intro: ['intro', 'starts with just drums and bass', 'builds gradually, sparse and inviting'],
  verse: ['verse', 'steady groove, medium energy', 'leaves open space for a lead melody'],
  chorus: ['chorus', 'full band at high energy', 'bigger drums, fuller and brighter sound', 'leaves open space for a lead melody'],
  bridge: ['bridge', 'stripped back breakdown', 'drums keep exactly the same steady tempo', 'rising energy and tension in the last two bars'],
  final: ['final chorus', 'the biggest and most energetic section', 'full band with extra percussion', 'leaves open space for a lead melody'],
  outro: ['outro', 'winds down on the same groove without slowing down', 'ends cleanly on the key chord, no fade out'],
};

/** Styles no section may have (the plan has no force_instrumental). */
const NEGATIVE = [
  'vocals', 'singing', 'lyrics', 'humming', 'choir', 'rap', 'spoken words', 'vocal chops', 'prominent lead melody', 'lead solo',
  'tempo changes', 'tempo drift', 'slowing down', 'rubato', 'key changes', 'silence at the start',
];

export const PRESETS = {
  // the new song system (2026-10-30, engine/sloedla/v2): songs with a form, words and a folder of their own
  // Rokkhopp: a recording only, a rock-and-roll trio; the piano is Slóeðla's, the double bass Kambeðla's, the drums Þórseðla's
  boogie: {
    name: 'Boogie rock and roll',
    style: 'happy 1950s rock and roll boogie-woogie',
    bpm: 150,
    key: 'C major',
    keyWords: 'C major',
    folder: 'v2/boogie',
    chords: { roman: 'I-I-I-I-IV-IV-I-I-V-IV-I-V', names: ['C', 'C', 'C', 'C', 'F', 'F', 'C', 'C', 'G', 'F', 'C', 'G'], words: 'the twelve-bar blues: C, C, C, C, F, F, C, C, G, F, C, G', perBar: 1 },
    bridgeChords: { roman: 'IV-IV-I-I-V-IV-I-V', names: ['F', 'F', 'C', 'C', 'G', 'F', 'C', 'G'], words: 'F, F, C, C, G, F, C, G', perBar: 1 },
    form: [
      ['Intro', 'intro', 4, ['solo boogie-woogie piano alone with a rolling left-hand bass pattern', 'the double bass and the drums come in on the last bar']],
      ['Verse 1', 'verse', 12],
      ['Verse 2', 'verse', 12],
      ['Bridge', 'bridge', 8, ['stop-time: the whole band hits together on beat one of each bar and the piano answers with a fill']],
      ['Verse 3', 'final', 12],
      ['Outro', 'outro', 4, ['a classic rock and roll ending: a last piano run down the keys and the band hits the final chord together']],
    ],
    kinds: {
      intro: ['intro', 'builds up over four bars'],
      verse: ['verse', 'steady swinging groove, high energy', 'the boogie-woogie piano plays rolling riffs and bright licks over the twelve-bar blues'],
      bridge: ['stop-time bridge', 'drums keep exactly the same steady tempo'],
      final: ['last verse', 'the biggest and most energetic section', 'the piano plays its wildest boogie licks and glissandos'],
      outro: ['outro', 'ends cleanly on the C chord, no fade out'],
    },
    core: [
      'happy, bouncy 1950s rock and roll for kids', 'a real live trio of boogie-woogie piano, upright double bass and drums',
      'boogie-woogie piano with a rolling eighth-note left hand and bright right-hand licks', 'slapped upright double bass walking in quarter notes',
      'swinging drum kit with a strong snare backbeat on two and four', 'shuffle swing feel', 'fun, cheeky and playful',
    ],
    negative: [...NEGATIVE.filter(style => !['prominent lead melody', 'lead solo'].includes(style)), 'electric guitar', 'saxophone', 'synthesizer', 'horns', 'organ'],
  },
  // Fönkhopp: a hybrid; the recording gives the drums (Þórseðla's) and the bass (Kambeðla's), Slóeðla's tune is composed in the game
  fonk: {
    name: 'Funky hip-hop beat',
    style: 'funky hip-hop beat',
    bpm: 95,
    key: 'E minor',
    keyWords: 'E minor',
    folder: 'v2/fonk',
    chords: { roman: 'i-VI-III-VII', names: ['Em', 'C', 'G', 'D'], words: 'E minor, C, G, D', perBar: 1 },
    form: [
      ['Intro', 'intro', 2, ['the drums alone: a funky breakbeat']],
      ['Verse 1', 'verse', 8],
      ['Hook 1', 'chorus', 4],
      ['Verse 2', 'verse', 8],
      ['Hook 2', 'chorus', 4],
      ['Bridge', 'bridge', 4, ['the drums and bass break down to a kick and a few bass notes, then build back up']],
      ['Hook 3', 'final', 4],
      ['Outro', 'outro', 2],
    ],
    kinds: {
      intro: ['intro', 'only drums'],
      verse: ['verse', 'steady head-nodding groove', 'leaves open space for a lead melody'],
      chorus: ['hook', 'fuller and punchier drums with extra hand claps', 'leaves open space for a lead melody'],
      bridge: ['breakdown', 'drums keep exactly the same steady tempo'],
      final: ['last hook', 'the biggest and punchiest section', 'leaves open space for a lead melody'],
      outro: ['outro', 'ends cleanly on a last kick and bass note, no fade out'],
    },
    core: [
      'a funky hip-hop beat for kids, playful and bouncy', 'crisp boom-bap drums with a punchy kick, a snappy snare on two and four and swung sixteenth-note hi-hats',
      'a deep funky electric bass guitar with slides and ghost notes, following the chords', 'only drums and bass, nothing else', 'clean modern production',
    ],
    negative: [...NEGATIVE, 'piano', 'keys', 'guitar', 'synth lead', 'strings', 'melody', 'pads', 'brass'],
  },
  // Lag Slóeðlu (chapter 5, docs/superpowers/plans/2026-11-07-kafli-5-sloedla.md Task 7): her own song's backing. The chapter plays
  // it in stems that join one by one as the child plays her four phrases (a pad first, alone and low), so each of its four parts is
  // one instrument the stem separator knows (other = the pad, piano or guitar = the chords, bass, drums), and the verses and choruses
  // (bars 4 to 36) have all four, the same calm way, so the chapter can loop them. The animals and her horn sing the lead on top, in
  // F major's pentatonic (kafli5-song.js). The four versions are the candidates the owner picks from by ear.
  sloedla: {
    name: 'Lag Slóeðlu',
    style: 'calm, warm lullaby-like song for children',
    bpm: 84,
    key: 'F major',
    keyWords: 'F major',
    folder: 'v2/sloedla',
    chords: { roman: 'I-vi-IV-V', names: ['F', 'Dm', 'Bb', 'C'], words: 'F, D minor, B flat, C', perBar: 1 },
    form: [
      ['Intro', 'intro', 4, ['the warm string pad alone for two bars, very soft', 'the chords and the bass come in on the third bar, the drums on the fourth']],
      ['Verse 1', 'verse', 8],
      ['Chorus 1', 'chorus', 8],
      ['Verse 2', 'verse', 8],
      ['Chorus 2', 'chorus', 8],
      ['Outro', 'outro', 4],
    ],
    kinds: {
      intro: ['intro', 'very soft and sparse, builds gently'],
      verse: ['verse', 'gentle steady groove, all four instruments playing softly', 'leaves open space for a lead melody'],
      chorus: ['chorus', 'a little fuller and warmer, the same instruments and the same calm energy', 'leaves open space for a lead melody'],
      outro: ['outro', 'winds down on the same gentle groove without slowing down', 'ends cleanly on a soft F major chord, no fade out'],
    },
    core: [
      'a calm, warm and gentle song for young children, like a lullaby on a golden afternoon by a quiet pond',
      'exactly four instruments: soft felt piano, a warm string pad, upright bass and light brushed drums',
      'soft felt piano playing gentle broken chords', 'a warm soft string pad holding each chord',
      'a round, soft upright bass on the root of each chord', 'very light brushed drums with a soft shaker keeping a steady gentle beat',
      'simple and sparse with lots of space', 'acoustic, intimate and clean warm production',
    ],
    negative: [...NEGATIVE, 'guitar', 'electric guitar', 'synth lead', 'flute', 'whistling', 'bells', 'marimba', 'xylophone', 'brass', 'saxophone', 'loud drums', 'heavy bass', 'sad', 'dark', 'dramatic', 'minor key'],
    revisions: {
      2: {
        core: [
          'a calm, warm and gentle song for young children, like a lullaby on a golden afternoon by a quiet pond',
          'exactly four instruments: a mellow Rhodes electric piano, a warm soft synth pad, a round electric bass and soft hand percussion',
          'a mellow Rhodes electric piano playing gentle chords', 'a warm soft synth pad holding each chord',
          'a round, soft electric bass on the root of each chord', 'soft hand percussion, a gentle shaker and a quiet rim click keeping a steady beat',
          'simple and sparse with lots of space', 'dreamy, warm and clean production',
        ],
        revision: 'a Rhodes electric piano, a synth pad and hand percussion in place of the felt piano, the strings and the brushes',
      },
      3: {
        core: [
          'a calm, warm and gentle song for young children, like a lullaby on a golden afternoon by a quiet pond',
          'exactly four instruments: a fingerpicked nylon-string guitar, a warm string pad, upright bass and light brushed drums',
          'a fingerpicked nylon-string acoustic guitar playing gentle broken chords', 'a warm soft string pad holding each chord',
          'a round, soft upright bass on the root of each chord', 'very light brushed drums with a soft shaker keeping a steady gentle beat',
          'simple and sparse with lots of space', 'acoustic, intimate and clean warm production',
        ],
        negative: [...NEGATIVE, 'piano', 'electric guitar', 'synth lead', 'flute', 'whistling', 'bells', 'marimba', 'xylophone', 'brass', 'saxophone', 'loud drums', 'heavy bass', 'sad', 'dark', 'dramatic', 'minor key'],
        revision: 'a fingerpicked nylon-string guitar in place of the felt piano',
      },
      4: {
        core: [
          'a calm, warm and sunny song for young children, a gentle stroll on a golden afternoon by a quiet pond',
          'exactly four instruments: a softly strummed ukulele, a warm string pad, upright bass and light brushed drums',
          'a softly strummed ukulele playing the chords in a gentle swaying rhythm', 'a warm soft string pad holding each chord',
          'a round, soft upright bass on the root of each chord', 'very light brushed drums with a soft shaker keeping a steady gentle beat',
          'simple and sparse with lots of space', 'acoustic, happy and clean warm production',
        ],
        negative: [...NEGATIVE, 'piano', 'electric guitar', 'synth lead', 'flute', 'whistling', 'bells', 'marimba', 'xylophone', 'brass', 'saxophone', 'loud drums', 'heavy bass', 'sad', 'dark', 'dramatic', 'minor key'],
        revision: 'a softly strummed ukulele in place of the felt piano, a little sunnier',
      },
    },
  },
};

/** A preset as it is for a version: version 2 and later may override fields (a `revisions` map: core, extra, revision = what was changed). */
/** A preset by name (or a preset itself) as it is for a version. */
const baseOf = preset => (typeof preset === 'string' ? PRESETS[preset] : preset);
export const presetOf = (preset, version = 1) => ({ ...baseOf(preset), ...(baseOf(preset).revisions?.[version] ?? {}) });

/** The song's id (the file is el-<id>.mp3): the preset's name, and "-N" for a later version. */
export const trackId = (preset, version = 1) => (version > 1 ? `${preset}-${version}` : preset);

const barMs = bpm => (4 * 60000) / bpm;

/**
 * The sections of a preset with their times. A chunk's length is the difference of two rounded times, so the rounding never adds up:
 * every boundary is within half a millisecond of its bar.
 */
export function sectionsOf(preset) {
  const p = baseOf(preset);
  let bar = 0;
  return (p.form ?? STRUCTURE).map(([name, kind, bars, styles = []]) => {
    const startBar = bar;
    bar += bars;
    const startMs = Math.round(startBar * barMs(p.bpm)), endMs = Math.round(bar * barMs(p.bpm));
    return { name, kind, startBar, bars, styles, startSec: startMs / 1000, seconds: (endMs - startMs) / 1000, durationMs: endMs - startMs };
  });
}

/** The composition plan (music_v2_5: chunks): one chunk a section, no lyric lines. */
export function planOf(preset, version = 1) {
  const p = presetOf(preset, version);
  const kinds = { ...KINDS, ...(p.kinds ?? {}) };
  const chunks = sectionsOf(preset).map(section => {
    const chords = section.kind === 'bridge' ? p.bridgeChords ?? p.chords : p.chords;
    return {
      text: `[${section.name}]`,
      duration_ms: section.durationMs,
      positive_styles: [
        `${p.bpm} BPM`, `steady tempo, never speeds up or slows down`, `in ${p.keyWords}`,
        `simple chord progression ${chords.roman} in ${p.keyWords}: ${chords.words}, one chord per bar, repeating`,
        ...p.core, ...(p.extra ?? []), 'instrumental backing track', 'no vocals', ...kinds[section.kind], ...section.styles,
      ],
      negative_styles: p.negative ?? NEGATIVE,
    };
  });
  return { chunks };
}

// ---------------------------------------------------------------------------------------------
// ElevenLabs

/** Hides the key wherever a server or the network might have repeated it. */
const hide = (text, key) => String(text).replaceAll(key, '[redacted]');

function keyOf(env = process.env) {
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('Set ELEVENLABS_API_KEY in the local environment. No request was made.');
  return key;
}

/** One request; the key travels in a header only and no message of an error carries it. */
async function ask(key, url, init) {
  let response;
  try {
    response = await fetch(url, { ...init, headers: { 'xi-api-key': key, ...init.headers }, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (error) {
    throw new Error(`ElevenLabs could not be reached: ${hide(error.message, key)}`);
  }
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${hide(await response.text(), key).slice(0, 2000)}`);
  return response;
}

/** What the account has: the tier and the credits used and allowed (the music costs credits). */
async function credits(key) {
  const r = await (await ask(key, `${API}/user/subscription`, { method: 'GET', headers: {} })).json();
  return { tier: r.tier, used: r.character_count, limit: r.character_limit, resetsAtUnix: r.next_character_count_reset_unix };
}

/** The parts of a multipart/mixed body: [{ headers: {lowercase name: value}, body: Buffer }]. */
export function multipartParts(body, contentType) {
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (!boundary) throw new Error('The answer has no multipart boundary.');
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let at = body.indexOf(delimiter);
  while (at >= 0) {
    const from = at + delimiter.length;
    if (body.subarray(from, from + 2).toString() === '--') break; // the closing delimiter
    const next = body.indexOf(delimiter, from);
    if (next < 0) break;
    let part = body.subarray(from, next);
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    else if (part[0] === 10) part = part.subarray(1);
    if (part.subarray(part.length - 2).toString() === '\r\n') part = part.subarray(0, part.length - 2);
    else if (part[part.length - 1] === 10) part = part.subarray(0, part.length - 1);
    const split = part.indexOf('\r\n\r\n') >= 0 ? part.indexOf('\r\n\r\n') : part.indexOf('\n\n');
    const gap = part.indexOf('\r\n\r\n') >= 0 ? 4 : 2;
    const headers = {};
    for (const line of part.subarray(0, split).toString('utf8').split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    parts.push({ headers, body: part.subarray(split + gap) });
    at = next;
  }
  return parts;
}

/** The headers of an answer worth keeping (the song's id among them). */
const keptHeaders = (headers, key) => Object.fromEntries([...headers].filter(([name]) => !/^(set-cookie|authorization|xi-api-key)$/i.test(name)).map(([name, value]) => [name, hide(value, key)]));

// ---------------------------------------------------------------------------------------------
// Files

const run = (command, args, options = {}) => execFileSync(command, args, { maxBuffer: 1 << 28, ...options });
const probe = file => JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());
const fileOf = (id, ext) => path.join(ROOT, FOLDER, `el-${id}.${ext}`);
/** A track's files: its mp3 and json, and where a stem of it goes. */
function filesOf(preset, version = 1) {
  const p = baseOf(preset);
  const id = trackId(preset, version);
  if (!p.folder) return { mp3: fileOf(id, 'mp3'), json: fileOf(id, 'json'), stem: name => fileOf(`${id}-${name}`, 'mp3') };
  const dir = path.join(ROOT, FOLDER, p.folder);
  const tail = version > 1 ? `-${version}` : '';
  return { mp3: path.join(dir, `song${tail}.mp3`), json: path.join(dir, `song${tail}.json`), stem: name => path.join(dir, `${name}${tail}.mp3`) };
}
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

/** Composes one track: the mp3 and its json. */
async function compose({ preset, version, seed, cache, force }) {
  const id = trackId(preset, version);
  const { mp3, json, stem: stemFile } = filesOf(preset, version);
  if (fs.existsSync(mp3) && !force) throw new Error(`${path.relative(ROOT, mp3)} exists: --force makes it again (that costs credits).`);
  const key = keyOf();
  const p = presetOf(preset, version);
  const plan = planOf(preset, version);
  const body = { composition_plan: plan, model_id: MODEL, ...(seed === undefined ? {} : { seed }) };
  const before = await credits(key);
  console.log(`asking for ${id}: ${p.name}, ${p.bpm} bpm, ${p.key}, ${plan.chunks.length} sections, ${(plan.chunks.reduce((s, c) => s + c.duration_ms, 0) / 1000).toFixed(1)} s (credits used ${before.used} of ${before.limit})`);
  const started = Date.now();
  const response = await ask(key, `${API}/music/detailed?output_format=${OUTPUT_FORMAT}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const contentType = response.headers.get('content-type') ?? '';
  const raw = Buffer.from(await response.arrayBuffer());
  const seconds = Math.round((Date.now() - started) / 1000);
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, `${id}.raw`), raw); // before anything is read from it: the credits are spent
  fs.writeFileSync(path.join(cache, `${id}.raw.content-type`), contentType);
  const headers = keptHeaders(response.headers, key);
  console.log(`answer in ${seconds} s: ${contentType.split(';')[0]}, ${raw.length} bytes`);

  let audio, details = null;
  if (/^multipart\//i.test(contentType)) {
    const parts = multipartParts(raw, contentType);
    for (const part of parts) {
      const type = part.headers['content-type'] ?? '';
      if (/^audio\//i.test(type) || /^application\/octet-stream/i.test(type)) audio = part.body;
      else if (/json/i.test(type)) details = JSON.parse(part.body.toString('utf8'));
    }
    console.log(`  ${parts.length} parts: ${parts.map(part => part.headers['content-type'] ?? '?').join(', ')}`);
  } else if (/^audio\//i.test(contentType)) audio = raw;
  else throw new Error(`Unexpected answer (${contentType}); the raw bytes are in ${path.join(cache, `${id}.raw`)}`);
  if (!audio || audio.length < 10000) throw new Error(`No audio in the answer; the raw bytes are in ${path.join(cache, `${id}.raw`)}`);

  fs.mkdirSync(path.dirname(mp3), { recursive: true });
  const received = path.join(cache, `${id}.received.mp3`);
  fs.writeFileSync(received, audio);
  const info = probe(received).streams.find(s => s.codec_type === 'audio');
  const plain = info.codec_name === 'mp3' && Number(info.sample_rate) === 44100 && info.channels === 2 && Math.abs(Number(info.bit_rate) - 128000) < 2000;
  if (plain) fs.copyFileSync(received, mp3);
  else run('ffmpeg', ['-v', 'error', '-y', '-i', received, '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', mp3]);

  const sections = sectionsOf(preset);
  const song = {
    name: p.name,
    src: path.basename(mp3),
    id,
    style: p.style,
    structure: {
      bars: sections.reduce((s, x) => s + x.bars, 0),
      plannedSeconds: sections.reduce((s, x) => s + x.seconds, 0),
      sections: sections.map(({ name, kind, startBar, bars, startSec, seconds }) => ({ name, kind, startBar, bars, startSec, seconds })),
    },
    requested: {
      bpm: p.bpm, key: p.key, chords: { ...p.chords }, bridgeChords: { ...p.bridgeChords },
    },
    revision: p.revision ?? null,
    request: { endpoint: 'POST /v1/music/detailed', model_id: MODEL, output_format: OUTPUT_FORMAT, ...(seed === undefined ? {} : { seed }), composition_plan: plan },
    api: {
      songId: headers['song-id'] ?? null,
      headers,
      answerSeconds: seconds,
      reencoded: !plain,
      received: { codec: info.codec_name, sampleRate: Number(info.sample_rate), channels: info.channels, bitRate: Number(info.bit_rate) },
      credits: { tier: before.tier, usedBefore: before.used, limit: before.limit, note: 'the account counter lags a generation behind: a track cost the credits that the next one saw used beyond this one' },
      composition_plan: details?.composition_plan ?? null,
      song_metadata: details?.song_metadata ?? null,
    },
  };
  writeJson(json, song);
  const out = probe(mp3);
  console.log(`wrote ${path.relative(ROOT, mp3)} (${out.format.duration.slice(0, 6)} s, ${out.format.size} bytes) and ${path.relative(ROOT, json)}`);
  console.log(`  song id ${song.api.songId ?? '(no song-id header)'}; credits used before this ${before.used} of ${before.limit} (the counter lags: see --credits afterwards)`);
}

/** Decodes `file` to mono float samples at `rate`. */
function decode(file, rate) {
  const bytes = run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(rate), '-'], {});
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

const db = v => (v > 0 ? Math.round(20 * Math.log10(v) * 10) / 10 : -120);

const PITCH_CLASSES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
/** 'exact' when two key names ("A# major", "Bb major") are the same key, 'relative' when one is the other's relative major/minor, else false. */
export function sameKey(a, b) {
  const [ta, ma] = a.split(' '), [tb, mb] = b.split(' ');
  const pa = PITCH_CLASSES[ta], pb = PITCH_CLASSES[tb];
  if (pa === pb && ma === mb) return 'exact';
  if (ma === 'minor' && mb === 'major' && (pa + 3) % 12 === pb) return 'relative';
  if (ma === 'major' && mb === 'minor' && (pb + 3) % 12 === pa) return 'relative';
  return false;
}

/** Runs theme-tempo on the track and adds to its json what it printed and what the planned sections look like on the grid. */
function measure({ preset, version }) {
  const id = trackId(preset, version);
  const { mp3, json, stem: stemFile } = filesOf(preset, version);
  if (!fs.existsSync(mp3) || !fs.existsSync(json)) throw new Error(`el-${id} has not been made yet.`);
  const before = readJson(json);
  const printed = run(process.execPath, [path.join(ROOT, 'remake/tools/theme-tempo.mjs'), '--file', path.relative(ROOT, mp3).replace(/\\/g, '/'), '--key', '--no-mix'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  console.log(printed.trimEnd());
  const tempo = readJson(json); // theme-tempo's fields over ours
  const drift = Number(/within ([\d.]+) ms of the grid/.exec(printed)?.[1]);
  const measuredKey = /^\s+key (\S+ \S+) \(r ([\d.]+), then (\S+ \S+) \(?([\d.]+)?/m.exec(printed);
  const agreeing = Number(/(\d+) of 12 stretches agree/.exec(printed)?.[1]);
  const steadier = /sure of the tempo: onsets stack (\d+)x/.exec(printed);
  const warning = /WARNING/.test(printed);

  // where the planned sections sit on the measured beat grid, and how loud each is
  const beat = 60 / tempo.bpm;
  const grid = t => { let d = (t - tempo.beatOffset) % beat; if (d < -beat / 2) d += beat; if (d > beat / 2) d -= beat; return Math.round(d * 1000); };
  const t0 = ((tempo.beatOffset % beat) + beat) % beat, downbeat = t0 <= beat / 2 ? t0 : t0 - beat; // the beat nearest the file's start: bar 1, beat 1 (the plan starts on a bar)
  const rate = 22050, samples = decode(mp3, rate);
  const rms = (a, b) => { let s = 0, n = 0; for (let i = Math.max(0, Math.floor(a * rate)); i < Math.min(samples.length, Math.floor(b * rate)); i++, n++) s += samples[i] * samples[i]; return n ? Math.sqrt(s / n) : 0; };
  let leadIn = 0;
  while (leadIn < samples.length && Math.abs(samples[leadIn]) < 0.003) leadIn++; // about -50 dBFS
  const lengthSec = samples.length / rate;
  const brightness = (a, b) => { let crossings = 0, n = 0; for (let i = Math.max(1, Math.floor(a * rate)); i < Math.min(samples.length, Math.floor(b * rate)); i++, n++) if ((samples[i - 1] < 0) !== (samples[i] < 0)) crossings++; return n ? Math.round(crossings / 2 / (n / rate) / 10) * 10 : 0; };
  const sections = before.structure.sections.map(section => ({
    ...section,
    gridOffsetMs: grid(section.startSec),
    levelDb: db(rms(section.startSec, section.startSec + section.seconds)),
    brightnessHz: brightness(section.startSec, section.startSec + section.seconds),
  }));
  const lastEnd = sections.at(-1).startSec + sections.at(-1).seconds;
  const merged = {
    ...before,
    ...tempo,
    driftMs: drift,
    steady: !warning && drift <= 25,
    measured: {
      bpm: tempo.bpm,
      bpmDifference: Math.round((tempo.bpm - before.requested.bpm) * 1000) / 1000,
      key: measuredKey?.[1] ?? null,
      keyR: measuredKey ? Number(measuredKey[2]) : null,
      keyRunnerUp: measuredKey?.[3] ?? null,
      keyStretchesAgreeing: agreeing,
      keyMatchesRequest: measuredKey ? sameKey(measuredKey[1], before.requested.key) : null,
      tempoSureness: steadier ? Number(steadier[1]) : null,
      lengthSeconds: Math.round(lengthSec * 1000) / 1000,
      plannedSeconds: before.structure.plannedSeconds,
      lastSectionEndsAtSec: lastEnd,
      leadInSeconds: Math.round((leadIn / rate) * 1000) / 1000,
      beatSeconds: Math.round(beat * 10000) / 10000,
      downbeatSec: Math.round(downbeat * 10000) / 10000,
      note: 'bpm, beatOffset, key (bell notes, Hz) and tuningCents come from tools/theme-tempo.mjs; gridOffsetMs is how far a section\'s planned start is from the nearest measured beat; downbeatSec is the beat nearest the start of the file, where bar 1 begins (a planned section start is a whole number of bars after it); levelDb is the section\'s RMS (dBFS); brightnessHz is its zero-crossing rate / 2, a rough brightness',
    },
    structure: { ...before.structure, sections },
  };
  // keep the field order: name, src first, then the measured tempo fields, then the rest
  const { name, src, id: songId, style, bpm, beatOffset, key, tuningCents, driftMs, steady, ...rest } = merged;
  writeJson(json, { name, src, id: songId, style, bpm, beatOffset, key, tuningCents, driftMs, steady, ...rest });
  console.log(`  ${id}: asked ${before.requested.bpm} bpm / ${before.requested.key}; heard ${tempo.bpm} bpm / ${merged.measured.key}; drift ${drift} ms (${merged.steady ? 'steady' : 'NOT steady'}); ${lengthSec.toFixed(1)} s, lead-in ${merged.measured.leadInSeconds} s`);
  console.log(`  sections (start, grid offset, level): ${sections.map(s => `${s.name} ${s.startSec}s ${s.gridOffsetMs >= 0 ? '+' : ''}${s.gridOffsetMs}ms ${s.levelDb}dB ${s.brightnessHz}Hz`).join(' | ')}`);
}

/** The files of a zip (stored or deflated): [{ name, data }]. Only the API's own zip goes through this. */
export function unzip(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not a zip file.');
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('Broken zip directory.');
    const method = buffer.readUInt16LE(at + 10), size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28), extraLength = buffer.readUInt16LE(at + 30), commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const data = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const packed = buffer.subarray(data, data + size);
    if (!name.endsWith('/')) files.push({ name, data: method === 0 ? packed : zlib.inflateRawSync(packed) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/**
 * Asks the API to split the track into stems: the zip it answers with is kept in the cache (and used again, since the request costs
 * credits) and each stem in it becomes el-<id>-<stem>.mp3.
 */
async function stems({ preset, version, cache, force }) {
  const id = trackId(preset, version);
  const { mp3, json, stem: stemFile } = filesOf(preset, version);
  if (!fs.existsSync(mp3)) throw new Error(`${path.relative(ROOT, mp3)} has not been made yet.`);
  const zip = path.join(cache, `${id}-stems.zip`);
  fs.mkdirSync(cache, { recursive: true });
  if (!fs.existsSync(zip) || force) {
    const key = keyOf();
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(mp3)], { type: 'audio/mpeg' }), path.basename(mp3));
    console.log(`asking for the stems of ${id} ...`);
    const response = await ask(key, `${API}/music/stem-separation?output_format=${OUTPUT_FORMAT}`, { method: 'POST', headers: {}, body: form });
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(zip, bytes); // before anything is read from it: the credits are spent
    console.log(`answer: ${response.headers.get('content-type')}, ${bytes.length} bytes`);
  }
  const dir = path.join(cache, `${id}-stems`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const made = [];
  for (const { name, data } of unzip(fs.readFileSync(zip))) {
    const file = path.join(dir, path.basename(name));
    fs.writeFileSync(file, data);
    const stem = path.parse(name).name.toLowerCase().replace(/^el-[a-z0-9-]*?-?(?=[a-z]+$)/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stem';
    const target = stemFile(stem);
    run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', target]);
    made.push({ stem, from: path.basename(name), src: path.basename(target), bytes: fs.statSync(target).size });
    console.log(`wrote ${path.relative(ROOT, target)} (from ${path.basename(name)})`);
  }
  if (fs.existsSync(json)) writeJson(json, { ...readJson(json), stems: { files: made } });
}

/**
 * A check for vocals without listening: the track goes to ElevenLabs speech-to-text (scribe_v2), and the words it finds are written
 * to the json as vocalCheck. Music with no singing should come back with no words (only audio events such as "(music)"); a few
 * words from a drum loop or a synth are a hallucination, a line of text in time with the track is a voice.
 */
async function vocals({ preset, version }) {
  const id = trackId(preset, version);
  const { mp3, json, stem: stemFile } = filesOf(preset, version);
  if (!fs.existsSync(mp3)) throw new Error(`el-${id}.mp3 has not been made yet.`);
  const key = keyOf();
  const form = new FormData();
  form.append('model_id', 'scribe_v2');
  form.append('tag_audio_events', 'true');
  form.append('timestamps_granularity', 'word');
  form.append('file', new Blob([fs.readFileSync(mp3)], { type: 'audio/mpeg' }), path.basename(mp3));
  const answer = await (await ask(key, `${API}/speech-to-text`, { method: 'POST', headers: {}, body: form })).json();
  const words = (answer.words ?? []).filter(w => w.type === 'word');
  const events = (answer.words ?? []).filter(w => w.type === 'audio_event');
  const check = {
    model: 'scribe_v2',
    words: words.length,
    text: hide(answer.text ?? '', key).slice(0, 500),
    audioEvents: events.map(e => `${e.text} ${Math.round(e.start)}-${Math.round(e.end)} s`).slice(0, 40),
    languageGuess: answer.language_code ?? null,
  };
  console.log(`${id}: ${check.words} words found; events ${check.audioEvents.length}; text ${JSON.stringify(check.text.slice(0, 200))}`);
  if (fs.existsSync(json)) writeJson(json, { ...readJson(json), vocalCheck: check });
}

// ---------------------------------------------------------------------------------------------

function argsOf(argv) {
  const value = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const preset = argv.find(a => !a.startsWith('--') && Object.hasOwn(PRESETS, a));
  const unknown = argv.find((a, i) => !a.startsWith('--') && !Object.hasOwn(PRESETS, a) && !['--version', '--seed', '--cache'].includes(argv[i - 1]));
  if (unknown) throw new Error(`Not a preset: ${unknown}. The presets: ${Object.keys(PRESETS).join(', ')}`);
  const version = value('--version') === undefined ? 1 : Number(value('--version'));
  const seed = value('--seed') === undefined ? undefined : Number(value('--seed'));
  if (!Number.isInteger(version) || version < 1) throw new Error('--version takes a whole number from 1');
  if (seed !== undefined && !Number.isInteger(seed)) throw new Error('--seed takes a whole number');
  return { preset, version, seed, cache: path.resolve(value('--cache') ?? path.join(os.tmpdir(), 'sloedla-music')), force: argv.includes('--force'), flags: argv.filter(a => a.startsWith('--')) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = argsOf(process.argv.slice(2));
  const has = flag => args.flags.includes(flag);
  if (has('--list')) {
    for (const [name, p] of Object.entries(PRESETS)) {
      console.log(`${name}: ${p.name}, ${p.bpm} bpm, ${p.key}, ${p.chords.roman} (${p.chords.names.join(' ')})${p.bridgeChords ? `, bridge ${p.bridgeChords.roman} (${p.bridgeChords.names.join(' ')})` : ''}${p.folder ? `, files in ${p.folder}/` : ''}`);
      console.log(`  ${sectionsOf(name).map(s => `${s.name} ${s.bars} bars from ${s.startSec} s (${s.seconds} s)`).join('; ')}`);
    }
  } else if (has('--credits')) {
    console.log(await credits(keyOf()));
  } else if (!args.preset) {
    throw new Error(`Name a preset: ${Object.keys(PRESETS).join(', ')} (or --list, --credits)`);
  } else if (has('--plan')) {
    console.log(JSON.stringify({ composition_plan: planOf(args.preset, args.version), model_id: MODEL }, null, 2));
  } else if (has('--measure')) {
    measure(args);
  } else if (has('--stems')) {
    await stems(args);
  } else if (has('--vocals')) {
    await vocals(args);
  } else {
    await compose(args);
  }
}
