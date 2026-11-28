// The festival song's plan on H's own bars (task 2 rulings, 2026-11-24): where the six sections fall, who enters when, the solos,
// the calls, every sound laid on top and every gain the stems get over time. Pure: render.mjs measures H and lays the sound; this
// file only says what goes where. Beats are the SONG's (beat 0 is the first bar line after the file's strummed lead-in; render.mjs
// says where that is in seconds). Everything is whole bars of four beats. Bars are the song's: up to the solos they are H's own;
// the solo section is H's bars 34-42 re-cut to 18 (H_RUNS), and from the quiet part on, song bar b is H's bar b - 9.
import { SOLOS, CALLS, ENTRIES, SOUNDS, FORM } from '../form.mjs';

export const BAR = 4;
const NAME_IS = Object.fromEntries(FORM.map(part => [part.id, part.nameIs]));

/**
 * The sections in bars, measured on H (render.mjs prints the bar table they were read from):
 *   intro   bars 0-17   the strummed D drone and the "other" stem's slow line alone (bars 0-6), then bass, piano and hand drums
 *                       (from bar 7, 21.8 s), the drums' build in bar 17; the model's "Intro" + "Arrival of the Friends"
 *   dance   bars 18-33  full drums and the wordless chant from bar 18 (53.2 s): four 4-bar phrases (the chant changes at 26)
 *   solos   bars 34-51  H's bars 34-42 (from the phrase after the dance's, 34, the chant's last faint bar, to the band's stop),
 *                       lengthened to 18 bars on the owner's "Lengja sólóin": H's bars 34-39, 36-41, 37-42 (H_RUNS), six slots of 12
 *   quiet   bars 52-62  (H's 43-53) the band stops on the first beat; no drums, no bass until a soft swell, near silence at the end
 *   chorus  bars 63-86  (H's 54-77) everything back with the chant (to H's bar 73) and the band's outro (H's 74-77)
 *   chord   bars 87-90  (H's 78-81) the drums stop on the final chord, struck again on its last bar; it rings on after it
 */
export const SECTIONS_BARS = [
  { id: 'intro', bars: 18 },
  { id: 'dance', bars: 16 },
  { id: 'solos', bars: 18 },
  { id: 'quiet', bars: 11 },
  { id: 'chorus', bars: 24 },
  { id: 'chord', bars: 4 },
];

/**
 * The solo passage as played: runs of H's bars, chosen by splice.mjs (qa/.../splice.json): of 193 ways to make 18 bars of H's 34-42
 * with at most two jumps, the joins of this one are among the smoothest measured (39 into 36: harmony 0.03, level -0.3 dB, flux
 * 0.86 of H's own bar lines; 41 into 37: 0.17, 0 dB, 0.91), and both fall where one solo hands over to the next (song bars 40, 46).
 */
export const H_RUNS = [[34, 39], [36, 41], [37, 42]];
export const SOLO_FROM_BAR = 34, SOLO_TO_BAR = 42;
export const SOLO_BARS = H_RUNS.reduce((sum, [a, b]) => sum + b - a + 1, 0);

export function sectionsOf(list = SECTIONS_BARS) {
  let beat = 0;
  return list.map(({ id, bars }) => {
    const part = { id, nameIs: NAME_IS[id], startBeat: beat, beats: bars * BAR };
    beat += part.beats;
    return part;
  });
}
export const SECTIONS = sectionsOf();
export const END_BEAT = SECTIONS.at(-1).startBeat + SECTIONS.at(-1).beats;
export const part = id => SECTIONS.find(section => section.id === id);
const inPart = (beat, id) => beat >= part(id).startBeat && beat < part(id).startBeat + part(id).beats;

/** The friends' entries in the intro: the horn (H's own opening) at 0, then one every two bars from bar 7, where the arrival starts. */
const ARRIVAL_BAR = 7, ENTRY_BARS = 2;
export function entriesOf(choirBeat) {
  return ENTRIES.map((who, i) => ({
    who,
    sound: SOUNDS[who],
    beat: who === 'choir' ? choirBeat : i === 0 ? 0 : (ARRIVAL_BAR + (i - 1) * ENTRY_BARS) * BAR,
  }));
}

/** Six equal solo slots filling the solo section. */
export function solosOf() {
  const { startBeat, beats } = part('solos');
  const each = beats / SOLOS.length;
  if (!Number.isInteger(each)) throw new Error(`the solo section's ${beats} beats do not split in six`);
  return SOLOS.map((who, i) => ({ who, startBeat: startBeat + i * each, beats: each }));
}

/** The calls: one a phrase, a bar's gap at its first bar. The dance's four 4-bar phrases; the chorus in four phrases of six bars. */
const PHRASE_BARS = { dance: 4, chorus: 6 };
export function callsOf() {
  return Object.entries(PHRASE_BARS).flatMap(([section, phrase]) => CALLS.map((move, i) => {
    const beat = part(section).startBeat + i * phrase * BAR;
    return { move, section, beat, beats: BAR, doBeat: beat + BAR };
  }));
}

/** Who plays when the band plays: the beat's place in its bar (0-3) for each friend's own sound. */
export const PATTERN = {
  gramedla: { kind: 'stomp', places: [0, 2] }, // a stomp on every dance beat
  kambedla: { kind: 'plate', places: [1] }, // her plates on the bar's second beat
  uggedla: { kind: 'tail', places: [3], everyOther: 0 }, // a splash on the last beat of every other bar
  flugedla: { kind: 'scratch', places: [3], everyOther: 1 }, // a scratch on the last beat of the bars between
  thorsedla: { kind: 'deep', places: [0], everyOther: 0 }, // her deep tone on the first beat of every other bar
};
/** In her own solo slot each friend plays more: these places of the slot's beats (counted from its start). */
const SOLO_PATTERN = {
  gramedla: { every: 1 }, kambedla: { every: 1 }, uggedla: { every: 2 }, flugedla: { every: 1 }, thorsedla: { every: 4 },
};

/**
 * Every sound laid on the song: [{ who, kind, beat, solo? }]. Friends play from their entry to the quiet part (in the solos only
 * the one whose slot it is), not in the quiet, again through the chorus, and not in the final chord. Slóeðla's solo is her own
 * horn, H's "other" stem brought up (gainsOf), so nothing is laid for her.
 */
export function eventsOf(entries) {
  const out = [];
  const solos = solosOf();
  const entry = who => entries.find(e => e.who === who).beat;
  const playing = [[0, part('solos').startBeat], [part('chorus').startBeat, part('chord').startBeat]];
  for (const [who, { kind, places, everyOther }] of Object.entries(PATTERN)) {
    // she comes in with her sound on her entry beat (the bar's first), whatever her pattern's places
    if (!places.includes(0) || everyOther === 1) out.push({ who, kind, beat: entry(who), entry: true });
    for (const [from, to] of playing) {
      for (let beat = Math.max(from, entry(who)); beat < to; beat++) {
        const bar = Math.floor(beat / BAR), place = beat % BAR;
        if (!places.includes(place)) continue;
        if (everyOther !== undefined && (bar - Math.floor(entry(who) / BAR)) % 2 !== everyOther) continue;
        out.push({ who, kind, beat });
      }
    }
  }
  for (const solo of solos) {
    if (!SOLO_PATTERN[solo.who]) continue;
    const { kind } = PATTERN[solo.who];
    for (let k = 0; k < solo.beats; k += SOLO_PATTERN[solo.who].every) out.push({ who: solo.who, kind, beat: solo.startBeat + k, solo: true });
  }
  return out.sort((a, b) => a.beat - b.beat || a.who.localeCompare(b.who));
}

/** Grameðla's roars in the last chorus: the first beat of each chorus phrase's fourth bar (never on a call or its doBeat). */
export function roarsOf() {
  return callsOf().filter(call => call.section === 'chorus').map(call => call.beat + 3 * BAR);
}

/**
 * The stems' gains over time, as breakpoints [beat, gain] (linear between them): what the stems are for.
 *   calls   no ducking (the owner's word, 2026-11-28: dipping the choir under Flugeðla's calls broke the song's groove)
 *   solos   the band a little lighter (music 3 dB, drums 2 dB), the dance's chant tail out; in Slóeðla's slot her horn ("other") up
 *   quiet   no drums: the closing hit of the solos rings one beat, then nothing until the chorus
 * Ramps are short (in beats): RAMP_IN to go down, RAMP_OUT to come back, so no bar starts late and nothing clicks.
 */
const RAMP = 0.06;
export function gainsOf() {
  const g = { drums: [], bass: [], guitar: [], piano: [], other: [], vocals: [] };
  const step = (stem, from, to, gain, ramp = RAMP) => g[stem].push({ from, to, gain, ramp });
  const solos = part('solos');
  const solosEnd = solos.startBeat + solos.beats;
  for (const stem of ['guitar', 'piano', 'other']) step(stem, solos.startBeat, solosEnd, 10 ** (-3 / 20), 0.5);
  step('drums', solos.startBeat, solosEnd, 10 ** (-2 / 20), 0.5);
  step('vocals', solos.startBeat, solosEnd, 0, 0.5);
  // the passage's repeats lean the band a little another way, so they sound as a continuation (stem gains only): the second run
  // the guitar forward and the piano back, the third the other way round (song bars 40-45 and 46-51; H_RUNS)
  let runBeat = solos.startBeat;
  H_RUNS.forEach(([a, b], i) => {
    const beats = (b - a + 1) * BAR;
    if (i > 0) {
      const lean = i % 2 ? 1.5 : -1.5;
      step('guitar', runBeat, runBeat + beats, 10 ** (lean / 20), 0.25);
      step('piano', runBeat, runBeat + beats, 10 ** (-lean / 20), 0.25);
    }
    runBeat += beats;
  });
  const her = solosOf().find(solo => solo.who === 'sloedla');
  step('other', her.startBeat, her.startBeat + her.beats, 10 ** (6 / 20), 0.25);
  for (const stem of ['guitar', 'piano']) step(stem, her.startBeat, her.startBeat + her.beats, 10 ** (-5 / 20), 0.25);
  const quiet = part('quiet');
  step('drums', quiet.startBeat + 1, quiet.startBeat + quiet.beats, 0, 1); // fades over the quiet part's first beat
  return g;
}

/**
 * The value of a stem's gain at a beat: the product of every step over it. A step is wholly in force from its first beat (its ramp
 * ends there) and wholly gone on its last (a short ramp of at most RAMP beats ends there), so a downbeat after it is never cut.
 */
export function gainAt(steps, beat) {
  let v = 1;
  for (const { from, to, gain, ramp } of steps) {
    if (beat <= from - ramp || beat >= to) continue;
    const out = Math.min(ramp, RAMP);
    const k = beat < from ? (beat - (from - ramp)) / ramp : beat > to - out ? (to - beat) / out : 1;
    v *= 1 + (gain - 1) * Math.max(0, Math.min(1, k));
  }
  return v;
}

export const isIn = inPart;
