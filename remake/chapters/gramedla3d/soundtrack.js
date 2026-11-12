// Grameðla kemur!'s sound (step 3 of the spec), as data: what plays at which second of the show, hung on the timeline's cues
// (timeline.js CUES and cues(rig)), so it follows the motion when the motion changes. Pure: sounds.js plays it on the page, the
// chapter's loop hands each event out as the show's second passes it, and tests/gramedla3d-sound.test.mjs checks the order.
//
// No music (the theme is held at nothing for the show). Under everything the game's forest (sfx.js: its wind and the birds over it),
// dropping away for beat 2's thumps and for beat 7's stillness. Her footfalls by her distance from the camera: far ones quiet and
// dull (a low-pass at 260 Hz), near ones full (none). Egill's two lines are sound only (spec rule 8: no text on the screen).
//
// An event is one of
//   { t, sound, db, cutoff?, pan?, rate?, offset?, duration?, reverse?, what }   a recording (SOUND_FILES), at db (0 dB: gain 1) into
//                                                                                the page's output, `cutoff` Hz of a low-pass (none:
//                                                                                null), from `offset` s of it for `duration` s
//   { t, sfx, detail, what }                                                     one of the game's made sounds (s.sfx)
//   { t, bed, seconds, what }                                                    the forest's level (1 as the game lays it), reached
//                                                                                over `seconds`
//   { t, line, what }                                                            Egill says a line (LINES), no caption
import { CUES, FLOCK, FLIGHT, LENGTH, FADE, BEATS, cues, gramAt, flugedlaAt } from './timeline.js';

/** Egill's two lines (line set gramedla3d in lines.json, made with the voice tool): id → its text. */
export const LINES = { g3_egill_kemur: 'Hún kemur!', g3_egill_bless: 'Bless, Grameðla!' };

const kafli4 = file => `assets/audio/kafli4/hljod/${file}`;
/** Each recording the show plays, against remake/: the thump is made by tools/gramedla-sounds.mjs, the rest are the game's. */
export const SOUND_FILES = {
  thump: 'assets/audio/gramedla3d/hljod/thump.mp3',
  roar: 'assets/audio/kafli2/gramedla-roar.mp3',
  exhale: 'assets/audio/kafli2/gramedla-exhale.mp3',
  wing1: kafli4('wing-1.mp3'),
  wing2: kafli4('wing-2.mp3'),
  wing3: kafli4('wing-3.mp3'),
  flutter: kafli4('flutter.mp3'),
  whoosh: kafli4('whoosh-3.mp3'),
};

// The numbers, in one place: her footfall by distance (the candidates page's −18 to −3 dB, and its low-pass from 260 Hz to none).
export const SOUND = {
  camera: 8, // m: the camera's z (stage.js CAMERA); her distance is from it
  near: 7.5, // m: at frame 5 (her snout out of the screen) a footfall is full
  far: 31, // m: at frame 4a (far up the lane) it is quiet and dull
  step: { near: -3, far: -18 }, // dB
  stepCutoff: 260, // Hz at `far`; it opens as she comes, and is gone (null) near
  open: 16000, // Hz: the low-pass counts as gone at or above this
  underLine: -4, // dB off what plays while Egill speaks, so every word is heard
  lineSeconds: 1.8, // s: about how long each of his lines lasts (1.61 and 1.69)
  bed: { thumps: 0.3, still: 0.25 }, // the forest's level for beat 2's thumps and beat 7's stillness
  roarLead: 0.28, // s after the roar cue the recording starts, so its loudest (0.6–0.8 s in) meets her widest jaw (key 6)
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const round = (x, n = 3) => +x.toFixed(n);
/** A little higher or lower each time, the same each run (so the list is the same each time and a test can hold it). */
const vary = (i, by = 0.04) => round(1 + by * Math.sin(i * 2.3 + 0.7), 3);

/** Her footfall's level and low-pass at d metres from the camera. */
export function stepAt(d) {
  const e = clamp(Math.log(d / SOUND.near) / Math.log(SOUND.far / SOUND.near), 0, 1);
  const db = SOUND.step.near + (SOUND.step.far - SOUND.step.near) * e;
  const hz = SOUND.stepCutoff * (SOUND.open / SOUND.stepCutoff) ** (1 - e);
  return { db: round(db, 1), cutoff: hz >= SOUND.open * 0.8 ? null : Math.round(hz) };
}

/** Every event of the show, in order of its second (`rig`: her solved key poses, as for cues(rig)). */
export function soundEvents(rig) {
  const all = cues(rig);
  const list = [];
  const add = event => list.push(event);

  // ---- the forest under everything: laid at the start, down for the thumps, back with the birds, down for the stillness, out ----
  add({ t: 0, bed: 1, seconds: 0.5, what: 'the forest: wind and birds' });
  add({ t: all.thump[0] - 0.5, bed: SOUND.bed.thumps, seconds: 0.5, what: 'the forest drops away for the thumps' });
  add({ t: FLOCK.arrive - 0.6, bed: 1, seconds: 2.5, what: 'the forest comes back with the birds' });
  add({ t: BEATS[6].from, bed: SOUND.bed.still, seconds: 2, what: 'the forest drops away: beat 7, the stillness' });
  add({ t: FADE.out[0], bed: 0, seconds: FADE.out[1] - FADE.out[0], what: 'the forest goes with the fade' });

  // ---- beat 1: a bird or two over the forest's wind ----
  add({ t: 3.2, sfx: 'birds', detail: { pan: -0.4 }, what: 'two birds, one answering the other' });
  add({ t: 6.1, sfx: 'birds', detail: { pan: 0.45 }, what: 'two birds again, the other side' });

  // ---- beat 2: two thumps far up the lane (the trees shake), then the flock bursts from the crowns ----
  all.thump.forEach((t, i) => add({ t, sound: 'thump', db: i ? -9 : -12, cutoff: i ? 450 : 350, rate: 0.85, what: `far thump ${i + 1} up the lane` }));
  add({ t: all.birdsUp, sound: 'flutter', db: 2, offset: 2, duration: 1.8, what: 'the flock bursts from the crowns' });
  for (let i = 0; i < 6; i++) {
    add({ t: round(all.birdsUp + 0.08 * i), sound: `wing${(i % 3) + 1}`, db: -14, rate: round(1.55 + 0.05 * (i % 4), 2), pan: round(0.6 * Math.sin(i * 1.9), 2), what: 'small wings, one bird after another' });
  }
  add({ t: round(all.birdsUp + 0.05), sfx: 'birds', detail: { pan: -0.3 }, what: 'alarm calls' });
  add({ t: round(all.birdsUp + 0.55), sfx: 'birds', detail: { pan: 0.35 }, what: 'alarm calls' });
  add({ t: FLOCK.up[0], sound: 'flutter', db: -4, offset: 6, duration: 1.4, what: 'the flock flies up and away' });

  // ---- beat 3: Flugeðla's wing beats at her distance, her brake, Egill's line ----
  for (const t of all.wings) {
    const f = flugedlaAt(t);
    const [u, , k] = f?.beak ?? [0.5, 0.5, 6];
    const e = clamp(Math.log(Math.max(1, k)) / Math.log(6), 0, 1);
    const n = Math.round(t * 10) % 3;
    add({ t, sound: `wing${n + 1}`, db: round(-6 - 10 * e, 1), pan: round(clamp((u - 0.5) * 1.2, -0.6, 0.6), 2), rate: vary(n), what: 'Flugeðla\'s wing beat' });
  }
  add({ t: FLIGHT.brake[0], sound: 'whoosh', db: -8, what: 'Flugeðla brakes, wings up' });
  add({ t: all.hunKemur, line: 'g3_egill_kemur', what: 'Egill points: "Hún kemur!"' });
  add({ t: all.flugedlaUp, sound: 'whoosh', db: -11, rate: 0.9, what: 'Flugeðla lifts off' });

  // ---- beats 4 to 7: her footfalls, by her distance ----
  all.steps.forEach((step, i) => {
    const g = gramAt(step.t, rig);
    const d = Math.hypot(g?.x ?? 0, step.depth);
    const { db, cutoff } = stepAt(d);
    const pan = round(clamp((g?.x ?? 0) / Math.max(d, 1) * 2, -0.5, 0.5) + (step.foot === 'left' ? -0.08 : 0.08), 2);
    add({ t: step.t, sound: 'thump', db, cutoff, pan, rate: vary(i, 0.05), what: `her ${step.foot} foot at ${d.toFixed(1)} m` });
  });

  // ---- beat 5: she sniffs (her breath, soft and short); beat 6: she breathes in and roars ----
  all.sniff.forEach((t, i) => add({ t, sound: 'exhale', db: -10, offset: 0.05, duration: 0.5, rate: round(1.2 + 0.04 * i, 2), what: 'a sniff' }));
  add({ t: all.breathIn, sound: 'exhale', db: -11, reverse: true, rate: 0.95, what: 'she breathes in (her breath backwards)' });
  add({ t: round(all.roar + SOUND.roarLead), sound: 'roar', db: 0, what: 'the roar' });

  // ---- beat 7: the soft huff that lifts the butterfly, and Egill's goodbye as she backs away ----
  add({ t: all.huff, sound: 'exhale', db: -13, duration: 0.8, rate: 1.1, what: 'a soft huff' });
  add({ t: all.bless, line: 'g3_egill_bless', what: 'Egill: "Bless, Grameðla!"' });

  // under a line, the rest a little lower
  const lines = list.filter(e => e.line).map(e => e.t);
  for (const e of list) {
    if (e.sound && lines.some(t => e.t >= t && e.t < t + SOUND.lineSeconds)) e.db = round(e.db + SOUND.underLine, 1);
  }
  return list.filter(e => e.t >= 0 && e.t < LENGTH).sort((a, b) => a.t - b.t);
}

export { CUES };
