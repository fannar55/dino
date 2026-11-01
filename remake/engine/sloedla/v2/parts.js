// The composed parts of a v2 song (format.js): a line of notes per section on one of the song's own instruments, in the notation
// of the first songs: scale steps (0 do, 1 re ... 7 the next do, negative below), '_' hold, '.' rest, '!' after a step
// marks a note the child taps, '|' only for the eye; 8ths unless unit: 16. A line repeats to fill its section. A section may have
// its own line for a big or a calm version ('vers/big'); a section with no line is silent for that part.

import { pitchOf } from '../key.js';
import { timelineOf } from './format.js';

/** A function from scale step (0 do, negative below) to Hz in `key` (do in octave 3), `transpose` semitones up, tuned by key.cents. */
export function pitchOfKey(key, transpose = 0) {
  const pitch = pitchOf({ root: key.root, scale: key.scale ?? 'major' }, transpose);
  const tune = 2 ** ((key.cents ?? 0) / 1200);
  return (step, octave = 0) => pitch(step, octave) * tune;
}

const tokens = line => line.replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);

/**
 * The notes of `layer`'s part in section `index` of the song, played as `variant`, `transpose` semitones up:
 * [{ t, beat, dur, freq, step, mark, vel }], `t` and `dur` in s, `beat` from the song's first beat.
 */
export function partNotes(song, layer, index, variant = 'normal', transpose = 0) {
  const part = layer.part;
  if (!part || (layer.when && layer.when !== variant)) return [];
  const { beat, sections } = timelineOf(song);
  const section = sections[index];
  const line = tokens(part.sections?.[`${section.name}/${variant}`] ?? part.sections?.[section.name] ?? '');
  if (!line.length) return [];
  const unit = part.unit ?? 8;
  const slot = 4 / unit; // beats a slot
  const slots = section.bars * unit;
  const pitch = pitchOfKey(song.key, transpose);
  const octave = part.octave ?? 0;
  const vel = part.vel ?? 1;
  const notes = [];
  let open = null; // the note being held
  const close = s => {
    if (open) open.dur = (section.startBeat + s * slot - open.beat) * beat;
    open = null;
  };
  for (let s = 0; s < slots; s++) {
    const token = line[s % line.length];
    if (token === '_') continue;
    close(s);
    if (token === '.') continue;
    const mark = token.endsWith('!');
    const step = Number(mark ? token.slice(0, -1) : token);
    if (!Number.isFinite(step)) throw new TypeError(`v2/parts.js: ${song.id} ${layer.id} ${section.name}: cannot read ${token}`);
    const at = section.startBeat + s * slot;
    open = { t: at * beat, beat: at, dur: 0, freq: pitch(step, octave), step, mark, vel };
    notes.push(open);
  }
  close(slots);
  return notes;
}
