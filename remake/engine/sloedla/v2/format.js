// Songs of Slóeðla's song game, the new way (2026-10-30, docs/superpowers/specs/2026-10-30-sloedla-lagakerfi-design.md): a song
// owns everything it plays. It is a list of layers, each a recorded stem (a file in its folder) or a composed part (notes on one
// of the song's own instruments), owned by a dinosaur ('a' Slóeðla, 'b' Kambeðla, 'c' Þórseðla) or by the song (null). The song
// plays whole from its first beat; the child's hits keep a dinosaur's layers in and play her note louder, a miss leaves a hole.
//
// A song (v2/songs/<id>.js, its sounds in assets/audio/sloedla/v2/<id>/):
//   { version: 2, id, name, tempo: { bpm, offset }, key: { root, scale, cents? }, gain?, sections: [{ name, bars, fixed?, lift? }],
//     instruments: { name: tools => play }, layers: [...], chart?: { barn: [...], fullordinn: [...] } }
//   tempo.offset  s from the start of the stems to the first beat (0 for a song with no stems)
//   key.cents     composed parts tuned to a recording (theme-tempo's tuningCents)
//   gain          how loud the whole song plays, its hits alike (1): every song's music about as loud as the others (measured with
//                 the side notes' loudness.mjs; the crowd and the DJ are set against it)
//   a section     whole 4/4 bars; fixed: never bigger or calmer; lift: semitones up from here when it plays big (no stems)
//   a layer       { id, owner, gain?, tier?: 1-3 (a star layer, the song's), when?: 'big'|'calm' (a part), stem: file | part,
//                   accent?: how strongly a hit on a stem stands out (1; more for a stem that is quiet in its recording) }
//   a part        { instrument, unit?: 8|16, octave?, vel?, sections: { name | 'name/big' | 'name/calm': line } } (parts.js)
//   a chart note  { beat (from the first beat), owner, layer, dur? (beats, 0.5), pitch? (scale step or null), pinned? }
//                 for stems; a composed part's notes for the child are its '!' marks (chart.js)

import { rootHz } from '../song.js';

export const ROLES = ['a', 'b', 'c'];
export const FIRST_NOTE = 2.5; // s: no note for the child before this (it must have time to fall)
const SCALES = ['major', 'minor', 'dorian', 'mixolydian'];
const LEVELS = ['barn', 'fullordinn'];

/** The song's beat, bar and sections in time (s from the first beat): [{ index, name, bars, start, end, startBeat, fixed, lift }]. */
export function timelineOf(song) {
  const beat = 60 / song.tempo.bpm;
  const bar = 4 * beat;
  let beats = 0;
  const sections = song.sections.map((section, index) => {
    const startBeat = beats;
    beats += section.bars * 4;
    return { index, name: section.name, bars: section.bars, start: startBeat * beat, end: beats * beat, startBeat, fixed: Boolean(section.fixed), lift: section.lift ?? 0 };
  });
  return { beat, bar, length: beats * beat, sections };
}

/** What is wrong with `song`, a line each (none: it is a song). */
export function validateSong(song) {
  const problems = [];
  const say = text => problems.push(`${song?.id ?? '?'}: ${text}`);
  if (song?.version !== 2) say('version is not 2');
  if (!/^[a-z0-9-]+$/.test(song?.id ?? '')) say('the id must be lower-case letters, digits and dashes');
  if (!song?.name) say('the song has no name');
  const bpm = song?.tempo?.bpm;
  if (!(bpm >= 60 && bpm <= 200)) say(`tempo: bpm ${bpm} is outside 60-200`);
  if (!(song?.tempo?.offset >= 0)) say('tempo: offset must be 0 or more');
  try { rootHz(song?.key?.root); } catch { say(`key: no note called ${song?.key?.root}`); }
  if (!SCALES.includes(song?.key?.scale ?? 'major')) say(`key: no scale called ${song?.key?.scale}`);
  if (song?.key?.cents !== undefined && !Number.isFinite(song.key.cents)) say('key: cents must be a number');
  if (song?.gain !== undefined && !(song.gain > 0)) say('gain (how loud the whole song plays) must be more than 0');
  if (!Array.isArray(song?.sections) || !song.sections.length) {
    say('the song has no sections');
    return problems;
  }
  for (const section of song.sections) if (!(Number.isInteger(section.bars) && section.bars >= 1)) say(`section ${section.name}: bars must be a whole number from 1`);
  if (problems.length) return problems;
  const { beat, length } = timelineOf(song);
  if (!(length >= 60 && length <= 240)) say(`length: ${length.toFixed(1)} s is outside 60-240 s`);

  const layers = song.layers ?? [];
  const names = new Set(song.sections.map(s => s.name));
  const ids = new Set();
  let stems = 0;
  for (const layer of layers) {
    const where = `layer ${layer.id}`;
    if (!layer.id || ids.has(layer.id)) say(`${where}: every layer needs an id of its own`);
    ids.add(layer.id);
    if (Boolean(layer.stem) === Boolean(layer.part)) say(`${where}: a layer is a stem or a part, one of them`);
    if (layer.owner !== null && !ROLES.includes(layer.owner)) say(`${where}: owner must be a, b, c or null`);
    if (layer.tier !== undefined && (layer.owner !== null || ![1, 2, 3].includes(layer.tier))) say(`${where}: a tier (1-3) is for a layer of the song's own (owner null)`);
    if (layer.when !== undefined && (layer.stem || !['big', 'calm'].includes(layer.when))) say(`${where}: when (big or calm) is for a part`);
    if (layer.accent !== undefined && !(layer.accent > 0)) say(`${where}: accent (how strongly a hit stands out) must be more than 0`);
    if (layer.stem) stems++;
    if (layer.part) {
      if (!Object.hasOwn(song.instruments ?? {}, layer.part.instrument)) say(`${where}: the instrument ${layer.part.instrument} is not one of the song's own`);
      for (const key of Object.keys(layer.part.sections ?? {})) {
        const [name, variant] = key.split('/');
        if (!names.has(name) || (variant !== undefined && !['big', 'calm'].includes(variant))) say(`${where}: a line for a section the song does not have (${key})`);
      }
    }
  }
  for (const role of ROLES) if (!layers.some(layer => layer.owner === role)) say(`dinosaur ${role} owns nothing`);
  if (stems && song.sections.some(s => s.lift)) say('lift: a song with a recording cannot change key');

  const owned = new Map(layers.map(layer => [layer.id, layer.owner]));
  const ownedStems = layers.some(layer => layer.stem && layer.owner);
  for (const level of LEVELS) {
    const notes = song.chart?.[level];
    if (notes === undefined) {
      if (ownedStems) say(`chart: the dinosaurs' stems need chart.${level}`);
      continue;
    }
    for (const note of notes) {
      const at = `chart.${level} beat ${note.beat}`;
      if (!owned.has(note.layer) || owned.get(note.layer) !== note.owner || !note.owner) say(`${at}: layer ${note.layer} is not owned by ${note.owner}`);
      if (note.beat * beat < FIRST_NOTE - 1e-9) say(`${at}: before 2.5 s`);
      if (!(note.beat * beat < length)) say(`${at}: past the song's length`);
    }
  }
  return problems;
}
