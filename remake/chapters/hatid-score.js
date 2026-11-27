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

// (Task 20, the owner's word of 2026-11-27: "það er ekkert öskur í grameðlu") Every sound of the party over the song, one row each:
// { beat, sample (sfx.js SAMPLES), level (the play's detail.level), who, what }. The party plays a row on its beat and nothing else
// (the song and Slóeðla's four calls aside), so striking a row takes its sound away. A seek plays none it passed (the scene is
// silent while seeking) and every one from where it lands. The solos' beats are hatid-band.js's: Grameðla's giant stomps land on her
// solo's beats 2, 4 and 6 (PRINTS.at) and she roars at 6.4 (PRINTS.roar); Flugeðla rises off her stand over beats 0 to 2.2 and comes
// down over 9.3 to 10.8 (LAP), and her trick's shot opens on beat 7 (TRICK_CUT), high over the floor.
const SOLO_START = Object.fromEntries(song.solos.map(slot => [slot.who, slot.startBeat]));
const GIANT = [2, 4, 6];
const CHORD = song.sections.find(part => part.id === 'chord').startBeat; // the last chord's first beat
export const PARTY_SOUNDS = [
  // Grameðla: her drum foot in her solo (a thump on each of its stomps, the giant three louder), her solo's roar, and her roar on
  // each of the last chorus's roar cues
  ...cuesIn('stomp', SOLO_START.gramedla, SOLO_START.gramedla + 12).map(({ beat }) => {
    const giant = GIANT.includes(beat - SOLO_START.gramedla);
    return { beat, sample: 'gramedlaThump', level: giant ? 0.55 : 0.3, who: 'gramedla', what: giant ? 'a giant stomp' : 'her drum foot' };
  }),
  { beat: SOLO_START.gramedla + 6.4, sample: 'gramedlaRoar', level: 0.5, who: 'gramedla', what: 'her solo\'s roar' },
  ...cuesIn('roar', 0, Infinity).map(({ beat }) => ({ beat, sample: 'gramedlaRoar', level: 0.5, who: 'gramedla', what: 'her roar on the cue' })),
  // Flugeðla: her wings as she takes off and as she lands, and her glad cry high over the floor (chapter 4's: the gorge's flyers'
  // cry, her kind's; she says no words in the party)
  ...[0, 1, 2].map(b => ({ beat: SOLO_START.flugedla + b, sample: 'wingbeat', level: 0.5, who: 'flugedla', what: 'her wings as she takes off' })),
  { beat: SOLO_START.flugedla + 7, sample: 'flyers', level: 0.5, who: 'flugedla', what: 'her glad cry at the top of her lap' },
  ...[9.5, 10.5].map(b => ({ beat: SOLO_START.flugedla + b, sample: 'wingbeat', level: 0.4, who: 'flugedla', what: 'her wings as she lands' })),
  // The recordings the owner allowed and left the pick of to the controller (2026-11-27; assets/audio/hatid/CREDITS.md): a small
  // clap as each solo ends, fireworks far off under the last chorus's bursts of light (with her roar), and as the last chord rings
  // the forest claps, its animals call and a party blower sounds
  ...song.solos.map(({ who, startBeat }) => ({ beat: startBeat + 10.5, sample: 'applauseShort', level: 0.35, who: 'guests', what: `a small clap as ${who}'s solo ends` })),
  ...cuesIn('burst', 0, Infinity).map(({ beat }) => ({ beat, sample: 'fireworkFar', level: 0.5, who: 'sky', what: 'fireworks far off with the burst of light' })),
  { beat: CHORD + 2, sample: 'applause', level: 0.6, who: 'guests', what: 'the forest claps as the last chord rings' },
  { beat: CHORD + 2.5, sample: 'grazers', level: 0.4, who: 'guests', what: 'the herd calls with the clapping' },
  { beat: CHORD + 3.5, sample: 'lizards', level: 0.4, who: 'guests', what: 'the small ones call with the clapping' },
  { beat: CHORD + 4, sample: 'partyBlower', level: 0.6, who: 'moon', what: 'a party blower as the song ends' },
  { beat: CHORD + 5, sample: 'flyers', level: 0.4, who: 'guests', what: 'the flyers call with the clapping' },
].sort((a, b) => a.beat - b.beat);

// The party's camera (spec 6, "eins og tónleikamyndband": wide shots of everyone, closes in the solos, cut on the beat), by the song's
// beat, as chapter 5's music video (kafli5-video.js CAMERA): a cut on a beat, and a shot lasts a bar at least unless `quick`; `then`
// a push (m), orbit (degrees) or zoom (a lens) over so many beats while the shot lasts, inside STYLE.md 8's speeds; with less motion
// only the cuts. The shots are hatid-route.js SHOTS.toppur's. The first grey cut: Slóeðla alone on the stage at the first beat, a cut
// to each friend as she enters (the choir, the song's own voices, has none), everyone wide on the first beat of the dance and of the
// last chorus, each friend close on her solo's first beat, the sky in the quiet part, and everyone's last pose on the chord. No shot
// holds longer than four bars.
// (Task 16) each solo's first shot on its first beat, its trick's own (`trick_<who>`, hatid-band.js SOLO_TRICKS) on its seventh
// (Task 17 fix of Task 16's: Flugeðla's trick shot on her solo's eighth beat, b 7, where she is in frame: from b 6 it opened on
// a beat and a half of empty sky)
export const TRICK_CUT = { flugedla: 7, others: 6 };
const SOLO_CUTS = song.solos.flatMap(({ who, startBeat }) => [{ beat: startBeat, cut: `solo_${who}` }, { beat: startBeat + (TRICK_CUT[who] ?? TRICK_CUT.others), cut: `trick_${who}` }]);
const ENTRY_CUTS = song.entries.filter(e => e.who !== 'choir' && e.beat > 0).map(({ who, beat }) => ({ beat, cut: `solo_${who}` }));
const at = id => song.sections.find(part => part.id === id).startBeat;
// Task 17, the final cut (chunk-6 rulings 17 and 18). Each call: party_wide on its beat, so Slóeðla is in frame as she calls and no
// cut falls in its gap; on the move's first beat a shot of Egill whole and big with Mosi beside him doing the move (dance_egill,
// dance_egill_b), held four dance beats or more; then the band close (the solos' own lenses on each friend at her stand: Grameðla's
// drum foot, Kambeðla's lizards on her plates, Flugeðla at her deck, Uggeðla's tail) or the floor from high. In the last chorus each
// move's third bar is the sky (chorus_sky) on the burst cue, where the volley bursts, Grameðla roars and the moon's hat goes askew,
// and then Egill again; quick runs of two beats only there. The quiet part is a small story (fix 1, below). The chord: Egill's end pose
// close, then everyone wide while the lights die.
const CALL_BLOCK = (call, egill, gap) => [
  { beat: call, cut: 'party_wide' },
  { beat: call + 4, cut: egill },
  ...gap.map(([b, cut]) => ({ beat: call + b, cut })),
];
const CHORUS_BLOCK = (call, first, second, tail) => [
  { beat: call, cut: 'party_wide' },
  { beat: call + 4, cut: first }, // the move from its first beat, the volley rising over them in its last two beats
  { beat: call + 12, cut: 'chorus_sky' }, // the burst cue: the volley bursts, Grameðla roars, the moon's hat is knocked askew
  { beat: call + 16, cut: second }, // the move's last bar
  ...tail.map(([b, cut, quick]) => ({ beat: call + b, cut, ...(quick ? { quick: true } : {}) })),
];
export const CAMERA = [
  { beat: 0, cut: 'stage_front', then: { push: 2, beats: 16 } }, // (Task 17: over by the cut at 16; it ran 24)
  { beat: 16, cut: 'solo_sloedla' },
  ...ENTRY_CUTS,
  { beat: 68, cut: 'stage_front' },
  // the first dance
  ...CALL_BLOCK(at('dance'), 'dance_egill', [[12, 'solo_gramedla']]), // up; then her drum foot
  ...CALL_BLOCK(88, 'dance_egill_b', [[12, 'trick_kambedla']]), // stomp; then the lizards on her plates
  ...CALL_BLOCK(104, 'dance_egill', [[12, 'solo_flugedla']]), // spin; then Flugeðla at her deck
  ...CALL_BLOCK(120, 'dance_egill_b', [[12, 'party_high']]), // hop; then the floor from high
  ...SOLO_CUTS,
  // the quiet part as a small story (Task 17 fix 1; it was one push on the sky for 44 beats): everyone swaying under the breathing
  // drawings, the spotlights out; Slóeðla lifting her horn to the sky (her cue at 217) close; the moon rocking and blinking; Egill and
  // Mosi looking up as the fireflies gather behind them (230-236) and the first go up; the stream spiralling up to the seventh star's
  // place (236-251) with the one slow push; everything on the chorus's first beat
  { beat: at('quiet'), cut: 'quiet_wide' },
  { beat: at('quiet') + 8, cut: 'trick_sloedla' },
  { beat: at('quiet') + 16, cut: 'moon_close' },
  { beat: at('quiet') + 24, cut: 'quiet_egill' },
  { beat: at('quiet') + 32, cut: 'sky_dance', then: { push: 3, beats: 12 } },
  // the last chorus: everything at once
  ...CHORUS_BLOCK(at('chorus'), 'dance_egill_b', 'dance_egill', [[20, 'solo_gramedla', true], [22, 'trick_kambedla', true]]), // up
  ...CHORUS_BLOCK(276, 'dance_egill_b', 'dance_egill', [[20, 'party_high']]), // stomp
  ...CHORUS_BLOCK(300, 'dance_egill_b', 'dance_egill', [[20, 'solo_uggedla', true], [22, 'solo_flugedla', true]]), // spin
  ...CHORUS_BLOCK(324, 'dance_egill_b', 'dance_egill', [[20, 'party_high']]), // hop
  // the chord: Egill's end pose close, then everyone wide as the lights die
  { beat: at('chord'), cut: 'dance_egill_b' },
  { beat: at('chord') + 8, cut: 'final_pose' }, // (Task 17 fix 1: still; its 3 m push brought Mosi to full detail, about 258k triangles)
].sort((a, b) => a.beat - b.beat);
