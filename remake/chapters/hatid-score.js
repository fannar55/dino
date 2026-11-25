// Stjörnuhátíðin's clock: every picture of the party reads the song through these helpers, and they read only the beat map
// (hatid-song.js, which is assets/audio/hatid/song/song.json). Pure: no three.js, no clock of its own, no audio. A beat is the
// song's (beat 0 is the first bar line, `SONG.beatOffset` seconds into the file); the tempo is fixed, so the time of beat b is
// beatOffset + b x BEAT.
//
//   BEAT, END_BEAT             seconds a beat; the beat the last bar ends on (the final chord rings on after it for `tail` s)
//   beatAt, secondsAt          the song's clock both ways
//   sectionAt(beat)            the section at a beat ({ id, nameIs, startBeat, beats }); the chord through its tail; null outside
//   soloAt(beat)               { who, u } in a solo slot (u 0..1 through it), else null
//   callAt(beat)               { move, u, doing } from a call's gap to the end of its move: u runs 0..1 through the gap
//                              (doing false), then 0..1 through the move (doing true) from its doBeat for up to 8 dance beats,
//                              never past the next call or the end of its section
//   entered(who, beat)         0..1, how far a friend (or the choir) has come in: eased over a bar from her entry
//   energyAt(beat)             0 in the quiet part … 1 in the last chorus, from each bar's measured loudness
//   pulseAt(beat)              1 on a beat, falling to the next
//   cuesIn(kind, from, to)     the cues of a kind with from <= beat < to
import { SONG } from './hatid-song.js';

const { song } = SONG;
export const BEAT = 60 / SONG.bpm;
export const END_BEAT = song.endBeat;
const TAIL_BEATS = song.tail / BEAT;
const BAR = SONG.beatsPerBar;

const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { const k = clamp01(x); return k * k * (3 - 2 * k); };

export const beatAt = seconds => (seconds - SONG.beatOffset) / BEAT;
export const secondsAt = beat => SONG.beatOffset + beat * BEAT;

export function sectionAt(beat) {
  if (!(beat >= 0) || beat >= END_BEAT + TAIL_BEATS) return null;
  if (beat >= END_BEAT) return song.sections.at(-1);
  return song.sections.find(part => beat >= part.startBeat && beat < part.startBeat + part.beats) ?? null;
}

export function soloAt(beat) {
  const solo = song.solos.find(slot => beat >= slot.startBeat && beat < slot.startBeat + slot.beats);
  return solo ? { who: solo.who, u: (beat - solo.startBeat) / solo.beats } : null;
}

/** Where each call's move ends: 8 dance beats after its doBeat, or the next call, or the end of its section, whichever is first. */
const MOVE_ENDS = song.calls.map((call, i) => {
  const section = song.sections.find(part => part.id === call.section);
  const next = song.calls[i + 1];
  return Math.min(call.doBeat + 8 * SONG.danceBeats, section.startBeat + section.beats, next ? next.beat : Infinity);
});

export function callAt(beat) {
  const i = song.calls.findIndex((call, k) => beat >= call.beat && beat < MOVE_ENDS[k]);
  if (i < 0) return null;
  const call = song.calls[i];
  if (beat < call.doBeat) return { move: call.move, u: (beat - call.beat) / (call.doBeat - call.beat), doing: false };
  return { move: call.move, u: (beat - call.doBeat) / (MOVE_ENDS[i] - call.doBeat), doing: true };
}

export function entered(who, beat) {
  const entry = song.entries.find(e => e.who === who);
  if (!entry) return 0;
  return smooth((beat - entry.beat) / BAR);
}

/** Each bar's loudness (LUFS) mapped so the quiet part is 0 and the last chorus 1; between bars' middles it eases. */
const LOW = song.loudness.sections.quiet, HIGH = song.loudness.sections.chorus;
const BARS = song.loudness.bars.map(lu => clamp01((lu - LOW) / (HIGH - LOW)));
export function energyAt(beat) {
  if (!(beat >= 0)) return 0;
  const x = beat / BAR - 0.5;
  if (x >= BARS.length - 1) return BARS.at(-1) * clamp01(1 - (beat - END_BEAT) / Math.max(TAIL_BEATS, 1e-9));
  if (x <= 0) return BARS[0];
  const i = Math.floor(x);
  return BARS[i] + (BARS[i + 1] - BARS[i]) * smooth(x - i);
}

export function pulseAt(beat) {
  if (!(beat >= 0) || beat >= END_BEAT) return 0;
  return Math.exp(-4 * (beat - Math.floor(beat)));
}

export const cuesIn = (kind, from, to) => song.cues.filter(cue => cue.kind === kind && cue.beat >= from && cue.beat < to);

// The party's camera (spec 6, "eins og tónleikamyndband": wide shots of everyone, closes in the solos, cut on the beat), by the song's
// beat, as chapter 5's music video (kafli5-video.js CAMERA): a cut on a beat, and a shot lasts a bar at least unless `quick`; `then`
// a push (m), orbit (degrees) or zoom (a lens) over so many beats while the shot lasts, inside STYLE.md 8's speeds; with less motion
// only the cuts. The shots are hatid-route.js SHOTS.toppur's. The first grey cut: Slóeðla alone on the stage at the first beat, a cut
// to each friend as she enters (the choir, the song's own voices, has none), everyone wide on the first beat of the dance and of the
// last chorus, each friend close on her solo's first beat, the sky in the quiet part, and everyone's last pose on the chord. No shot
// holds longer than four bars.
const SOLO_CUTS = song.solos.map(({ who, startBeat }) => ({ beat: startBeat, cut: `solo_${who}` }));
const ENTRY_CUTS = song.entries.filter(e => e.who !== 'choir' && e.beat > 0).map(({ who, beat }) => ({ beat, cut: `solo_${who}` }));
const at = id => song.sections.find(part => part.id === id).startBeat;
export const CAMERA = [
  { beat: 0, cut: 'stage_front', then: { push: 2, beats: 24 } },
  { beat: 16, cut: 'solo_sloedla' },
  ...ENTRY_CUTS,
  { beat: 68, cut: 'stage_front' },
  // the first dance: wide on each call, the floor between
  { beat: at('dance'), cut: 'party_wide' },
  { beat: 80, cut: 'egill_mosi' },
  { beat: 88, cut: 'party_wide' },
  { beat: 96, cut: 'party_high' },
  { beat: 104, cut: 'party_wide' },
  { beat: 112, cut: 'floor_low' },
  { beat: 120, cut: 'party_wide' },
  { beat: 128, cut: 'party_high' },
  ...SOLO_CUTS,
  // the quiet part: the sky and the moon
  { beat: at('quiet'), cut: 'sky_dance' },
  { beat: 222, cut: 'moon_close' },
  { beat: 236, cut: 'sky_dance' },
  // the last chorus: everything at once
  { beat: at('chorus'), cut: 'party_wide' },
  { beat: 264, cut: 'party_high' },
  { beat: 276, cut: 'party_wide' },
  { beat: 288, cut: 'egill_mosi' },
  { beat: 300, cut: 'party_wide' },
  { beat: 312, cut: 'floor_low' },
  { beat: 324, cut: 'party_wide' },
  { beat: 336, cut: 'party_high' },
  { beat: at('chord'), cut: 'final_pose' },
].sort((a, b) => a.beat - b.beat);
