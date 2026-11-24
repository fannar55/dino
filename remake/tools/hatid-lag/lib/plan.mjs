// The festival song's plan on H's own bars (task 2 rulings, 2026-11-24): where the six sections fall, who enters when, the solos,
// the calls, every sound laid on top and every gain the stems get over time. Pure: render.mjs measures H and lays the sound; this
// file only says what goes where. Beats are the SONG's (beat 0 is the first bar line after the file's strummed lead-in; render.mjs
// says where that is in seconds). Everything is whole bars of four beats.
import { SOLOS, CALLS, ENTRIES, SOUNDS, FORM } from '../form.mjs';

export const BAR = 4;
const NAME_IS = Object.fromEntries(FORM.map(part => [part.id, part.nameIs]));

/**
 * The sections in bars, measured on H (render.mjs prints the bar table they were read from):
 *   intro   bars 0-17   the strummed D drone and the "other" stem's slow line alone (bars 0-6), then bass, piano and hand drums
 *                       (from bar 7, 21.8 s), the drums' build in bar 17; the model's "Intro" + "Arrival of the Friends"
 *   dance   bars 18-33  full drums and the wordless chant from bar 18 (53.2 s): four 4-bar phrases (the chant changes at 26)
 *   solos   bars 34-42  from the phrase after the dance's (34; the chant's last faint bar) to the band's stop: six slots of 6 beats
 *   quiet   bars 43-53  the band stops on bar 43's first beat; no drums, no bass until a soft swell in bars 50-51, near silence 52-53
 *   chorus  bars 54-77  everything back at 156.1 s with the chant (to bar 73) and the band's outro (74-77)
 *   chord   bars 78-81  the drums stop on the final chord (224.7 s), struck again at bar 81; it rings on after the last bar
 */
export const SECTIONS_BARS = [
  { id: 'intro', bars: 18 },
  { id: 'dance', bars: 16 },
  { id: 'solos', bars: 9 },
  { id: 'quiet', bars: 11 },
  { id: 'chorus', bars: 24 },
  { id: 'chord', bars: 4 },
];

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
  gramedla: { every: 1 }, kambedla: { every: 1 }, uggedla: { every: 2 }, flugedla: { every: 1 }, thorsedla: { every: 3 },
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
 *   calls   the tune (vocals and the "other" stem) 12 dB down for the call's bar, the rhythm kept
 *   solos   the band a little lighter (music 3 dB, drums 2 dB), the dance's chant tail out; in Slóeðla's slot her horn ("other") up
 *   quiet   no drums: the closing hit of the solos rings one beat, then nothing until the chorus
 * Ramps are short (in beats): RAMP_IN to go down, RAMP_OUT to come back, so no bar starts late and nothing clicks.
 */
const DUCK = 10 ** (-12 / 20), RAMP = 0.06;
export function gainsOf() {
  const g = { drums: [], bass: [], guitar: [], piano: [], other: [], vocals: [] };
  const step = (stem, from, to, gain, ramp = RAMP) => g[stem].push({ from, to, gain, ramp });
  for (const call of callsOf()) for (const stem of ['vocals', 'other']) step(stem, call.beat, call.doBeat, DUCK);
  const solos = part('solos');
  const solosEnd = solos.startBeat + solos.beats;
  for (const stem of ['guitar', 'piano', 'other']) step(stem, solos.startBeat, solosEnd, 10 ** (-3 / 20), 0.5);
  step('drums', solos.startBeat, solosEnd, 10 ** (-2 / 20), 0.5);
  step('vocals', solos.startBeat, solosEnd, 0, 0.5);
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
