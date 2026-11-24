// Stjörnuhátíðin's song (spec 2026-11-21-stjornuhatidin-design.md §5): the shared words of its form (ENTRIES, SOUNDS, SOLOS, CALLS,
// the section ids and their Icelandic names) and, below them, the bars that were ASKED FOR in candidates A-D (presets hatid-a …
// hatid-d in tools/sloedla-music.mjs, and the first listening page, page.mjs).
// The owner picked H (2026-11-24), which was composed from a description of the scene with its own tempo and form, and the scene
// bends to it. Since then the beat map, assets/audio/hatid/song/song.json (as chapters/hatid-song.js, read through
// chapters/hatid-score.js), is the only source of truth for where anything is in the song: nothing downstream may read bars, beats
// or the tempo from this file. FORM's bars, TEMPO, TAIL_SECONDS, MOTIF's degrees and the helpers below are the request for A-D.
//   intro   instruments enter one at a time: Slóeðla's horn alone for four bars, then one friend every three bars, a two-bar build
//   dance   a simple strong beat; a one-bar call ("up", "stomp", "spin", "hop") opens each eight-bar phrase
//   solos   six equal four-bar slots, one a friend
//   quiet   no drums
//   chorus  bigger than everything before; a call opens each six-bar phrase
//   chord   one final chord that dies into silence
// The song keeps one tempo and one key; its length at bpm b is secondsOf(b), and its last chord rings on for about TAIL_SECONDS.

export const BEATS_PER_BAR = 4;
/** A dance beat (a step, a stomp) is two beats of the song. */
export const DANCE_BEATS = 2;
/** The tempo candidates A-D were asked for (the request, not the song: H is 84 bpm, song.json says it). */
export const TEMPO = { from: 108, to: 122 };
/** How long the final chord rings on after the last bar. */
export const TAIL_SECONDS = 2.5;

/** The sections' ids and names are the song's; their bars are what A-D were asked for (H's are in song.json). */
export const FORM = [
  { id: 'intro', nameIs: 'Inngangur', bars: 24 },
  { id: 'dance', nameIs: 'Fyrsti dans', bars: 32 },
  { id: 'solos', nameIs: 'Sólóin', bars: 24 },
  { id: 'quiet', nameIs: 'Kyrra stundin', bars: 12 },
  { id: 'chorus', nameIs: 'Síðasta viðlagið', bars: 24 },
  { id: 'chord', nameIs: 'Lokahljómur', bars: 4 },
];

/** Who enters in the intro, in order, and the sound each brings. */
export const ENTRIES = ['sloedla', 'gramedla', 'kambedla', 'uggedla', 'thorsedla', 'flugedla', 'choir'];
export const SOUNDS = { sloedla: 'horn', gramedla: 'stomp', kambedla: 'plates', uggedla: 'tail', thorsedla: 'deep tone', flugedla: 'scratches', choir: 'choir' };
const HORN_ALONE_BARS = 4, ENTRY_BARS = 3;

/** The solo slots, in order, four bars each. */
export const SOLOS = ['kambedla', 'uggedla', 'thorsedla', 'flugedla', 'sloedla', 'gramedla'];
const SOLO_BARS = 4;

/** The calls, one a phrase: a one-bar gap in the melody at the first bar of each phrase of dance and of chorus. */
export const CALLS = ['up', 'stomp', 'spin', 'hop'];
const PHRASE_BARS = { dance: 8, chorus: 6 };

/** Degrees of the major scale: six rising notes, the stars' tones and the horn's opening. */
export const MOTIF = [1, 2, 3, 5, 6, 8];

/** Each section's first beat and its length in beats. */
export function beatsOf(form = FORM) {
  let beat = 0;
  return form.map(({ id, bars }) => {
    const part = { id, startBeat: beat, beats: bars * BEATS_PER_BAR };
    beat += part.beats;
    return part;
  });
}

const barsOf = form => form.reduce((sum, part) => sum + part.bars, 0);

/** The song's length in seconds at a tempo, without the final chord's tail. */
export const secondsOf = (bpm, form = FORM) => (barsOf(form) * BEATS_PER_BAR * 60) / bpm;

/** The bar (from the song's start) each section starts on. */
const startBarOf = (id, form = FORM) => beatsOf(form).find(part => part.id === id).startBeat / BEATS_PER_BAR;

/** The intro's entries: [{ id, sound, bar }], bar counted from the song's start. */
export const entriesOf = () => ENTRIES.map((id, i) => ({ id, sound: SOUNDS[id], bar: i === 0 ? 0 : HORN_ALONE_BARS + (i - 1) * ENTRY_BARS }));

/** The solo slots: [{ id, bar, bars }]. */
export const solosOf = () => SOLOS.map((id, i) => ({ id, bar: startBarOf('solos') + i * SOLO_BARS, bars: SOLO_BARS }));

/** The calls: [{ call, section, bar }], one at the first bar of each phrase of dance and chorus. */
export function callsOf() {
  return Object.entries(PHRASE_BARS).flatMap(([section, phrase]) => {
    const { bars } = FORM.find(part => part.id === section);
    return Array.from({ length: bars / phrase }, (_, i) => ({ call: CALLS[i % CALLS.length], section, bar: startBarOf(section) + i * phrase }));
  });
}
