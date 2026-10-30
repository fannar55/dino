// The notes that fall for the child in a v2 song (format.js), section by section as the song is played: a stem's notes are data
// (song.chart, from tools/sloedla-stem-chart.mjs), a composed part's are its '!' marks (barn) or all its notes (fullordinn). They
// are thinned as the first songs' were: the strongest places in the bar first, no two closer than the level's gap
// in beats (twice that in a calm section), none in the first 2.5 s, and none in the last gap of a section, so the gap holds
// across the start of the next one too.

import { FIRST_NOTE, ROLES, timelineOf } from './format.js';
import { partNotes, pitchOfKey } from './parts.js';

export const GAP = { barn: 2, fullordinn: 0.5 }; // beats

/** How strong a place in the bar is: the bar's first beat most, then the third, the beats, the 8ths. */
function weightOf(beat, dur, beatLength) {
  const p = beat % 4;
  const place = p === 0 ? 4 : p === 2 ? 3 : Number.isInteger(p) ? 2 : Number.isInteger(p * 2) ? 1 : 0;
  return place + (dur >= beatLength * 1.5 ? 0.5 : 0);
}

/**
 * The notes of section `index`, played as `variant`, that fall for the child at `level` in the lanes `roles`:
 * [{ t, beat, role, layer, freq, dur, section, index, part }] by time. `part` is true for a composed note, whose `index` is its place
 * in partNotes(song, layer, index, variant, transpose); a stem note's index is null.
 */
export function sectionChart(song, index, variant = 'normal', { level = 'barn', roles = ROLES, transpose = 0 } = {}) {
  const { beat, sections } = timelineOf(song);
  const section = sections[index];
  const endBeat = section.startBeat + section.bars * 4;
  const gap = GAP[level] * (variant === 'calm' ? 2 : 1);
  const pitch = pitchOfKey(song.key, transpose);
  const grown = level === 'fullordinn';
  const candidates = [];
  // the child's level leans to Slóeðla's tune; the grown-ups' keeps every note the child has ('!') and shares the rest fairly
  const add = (note, extra = 0) => {
    if (note.t < FIRST_NOTE - 1e-9 || note.beat > endBeat - gap + 1e-9) return;
    const lean = grown ? (note.mark ? 1 : 0) : note.role === 'a' ? 0.25 : 0;
    candidates.push({ ...note, section: index, weight: weightOf(note.beat, note.dur, beat) + lean + extra });
  };
  for (const entry of song.chart?.[level] ?? []) {
    if (!roles.includes(entry.owner) || entry.beat < section.startBeat || entry.beat >= endBeat) continue;
    const freq = entry.pitch === null || entry.pitch === undefined ? pitch(0) : pitch(entry.pitch);
    add({ t: entry.beat * beat, beat: entry.beat, role: entry.owner, layer: entry.layer, freq, step: entry.pitch ?? null, vel: 1, dur: (entry.dur ?? 0.5) * beat, index: null, part: false }, entry.pinned ? 10 : 0);
  }
  for (const layer of song.layers) {
    if (!layer.part || !roles.includes(layer.owner)) continue;
    partNotes(song, layer, index, variant, transpose).forEach((note, i) => {
      if (level !== 'fullordinn' && !note.mark) return;
      add({ t: note.t, beat: note.beat, role: layer.owner, layer: layer.id, freq: note.freq, step: note.step, vel: note.vel, dur: note.dur, index: i, part: true, mark: note.mark });
    });
  }
  // the strongest first; among equally strong ones, the dinosaur with the fewest notes kept so far, then the earliest
  const pending = candidates.sort((x, y) => y.weight - x.weight || x.t - y.t);
  const kept = [];
  const counts = {};
  while (pending.length) {
    let pick = 0;
    for (let i = 1; i < pending.length && pending[i].weight === pending[0].weight; i++) {
      if ((counts[pending[i].role] ?? 0) < (counts[pending[pick].role] ?? 0)) pick = i;
    }
    const [note] = pending.splice(pick, 1);
    if (kept.some(other => Math.abs(other.beat - note.beat) < gap - 1e-6)) continue;
    kept.push(note);
    counts[note.role] = (counts[note.role] ?? 0) + 1;
  }
  return kept.sort((x, y) => x.t - y.t).map(({ weight, mark, ...note }) => note);
}

/** How many notes the child meets if every section plays as written. */
export function expectedOf(song, { level = 'barn', roles = ROLES } = {}) {
  return timelineOf(song).sections.reduce((n, _, i) => n + sectionChart(song, i, 'normal', { level, roles }).length, 0);
}

/**
 * What is wrong with a list of the child's notes: two closer than the gap; and over a `whole` song, at either level, a
 * dinosaur with lanes who has fewer than 8.
 */
export function chartProblems(notes, { level = 'barn', beat, roles = ROLES, calm = false, whole = true } = {}) {
  const problems = [];
  const gap = GAP[level] * (calm ? 2 : 1);
  const sorted = [...notes].sort((x, y) => x.t - y.t);
  for (let i = 1; i < sorted.length; i++) {
    const apart = (sorted[i].t - sorted[i - 1].t) / beat;
    if (apart < gap - 1e-6) problems.push(`notes at ${sorted[i - 1].t.toFixed(2)} s and ${sorted[i].t.toFixed(2)} s are ${apart.toFixed(2)} beats apart (at least ${gap})`);
  }
  if (whole) {
    for (const role of roles) {
      const count = notes.filter(n => n.role === role).length;
      if (count < 8) problems.push(`${role} has ${count} notes (at least 8)`);
    }
  }
  for (const note of notes) if (!roles.includes(note.role)) problems.push(`a note for ${note.role}, who has no lane`);
  return problems;
}
