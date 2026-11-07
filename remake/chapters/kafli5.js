// Chapter 5: Boð til Slóeðlu (an invitation for Slóeðla), docs/superpowers/specs/2026-11-07-kafli-5-bod-til-sloedlu-design.md.
// At the far pool where chapter 4 ends, the false horn sounds from the reed again. Slóeðla hides there, shy: she cannot remember her
// song and dares not sing. The animals that came along each sing one tone of it, and Egill leads them, first following a light
// (phrases 1 and 2), then from memory (3 and 4), so her song comes back phrase by phrase and she comes out of the reed a step after
// each. She wades into the pool and plays it whole while Egill taps along, takes the invitation and the fifth star, and Grameðla
// answers from far in the west.
//
// One place, Árdalurinn round the far pool (`tjorn`: world/ardalur built only there, createArdalur's `at`), in chapter 4's frame and
// at real size: metres, +X east and -Z north, headings in degrees (0 faces +X, 90 faces +Z). The pool's spots and shots are in
// kafli5-pool.js, her song in kafli5-song.js, the task's rules in kafli5-choir.js (a state machine on the game clock), her life in
// kafli5-sloedla.js and the tones in engine/audio/choir-sounds.js. The golden afternoon sun (engine/looks.js goldenAfternoon)
// stands at heading 215, 14 degrees up.
//
// Chunk 1 (the plan's Task 4): the place, the animals and her model in their real look, made tones, captions only, no music, and
// her placeholder poses. The scenes:
//   1 the map draws piece e; the false horn from the reed; "Þarna aftur!" "Hún er í sefinu."
//   2 Egill and Mosi walk down to the water across from the reed, her crest over it; a tap on the reed (or 8 s) and she peeks out;
//     the invitation and her answer; as Mosi says the animals remember, they set off round the pool to their places
//   3 the five groups come to their places, and each sings its tone once, low to high; "Hjálpaðu þeim, Egill..."
//   4-5 the choir (kafli5-choir.js): a light, a tap, a tone, a note flying to her crest and her horn; after each phrase she plays it
//     whole and comes a step out of the reed
//   6 out in the pool she plays the whole song, the child taps along on the beat, Flugeðla beats the time; her thanks and the star
//   7 a deep roar far in the west; everyone turns; the lines; the book
import { createRoute, FAR_POOL } from './kafli4-route.js';
import { lineQueue } from './kafli4-flight-play.js';
import { CHOIR, GROUPS, STEPS, SPOTS, WADE, WEST, SHOTS, SHOWS, POOL_LIFE, seatsOf, around, headingTo } from './kafli5-pool.js';
import { MELODY, TEMPO, nextBeat } from './kafli5-song.js';
import { createChoir, ECHO, NOTE, WHOLE } from './kafli5-choir.js';
import { sloedlaLife } from './kafli5-sloedla.js';
import { createArdalur } from '../world/ardalur/index.js';
import { loadCritters } from '../world/ardalur/animals.js';
import { mapMoment } from '../engine/scene/map-moment-scene.js';
import { createChoirSounds } from '../engine/audio/choir-sounds.js';
import { demoAsked, startDemoChild } from './kafli5-demo.js';

const ROUTE = createRoute({ wingspan: 7.5 }); // chapter 4's valley, the very same land (kafli4.js ROUTE)
const LEVEL = FAR_POOL.level;

const WORDS = {
  k5_mosi_again: 'Þarna aftur!',
  k5_flugedla_reed: 'Hún er í sefinu.',
  k5_mosi_map: 'Að tjörninni hennar Slóeðlu.',
  k5_mosi_invite: 'Halló, Slóeðla! Viltu koma á Stjörnuhátíðina í kvöld?',
  k5_sloedla_forgot: 'Ég… ég man ekki lagið mitt. Og ég þori ekki að syngja.',
  k5_mosi_animals: 'Dýrin sungu alltaf með þér. Þau muna það!',
  k5_mosi_help: 'Hjálpaðu þeim, Egill. Pikkaðu á dýrið sem lýsist upp.',
  k5_sloedla_mine: 'Þetta… þetta var lagið mitt!',
  k5_mosi_remember: 'Nú manst þú röðina, Egill!',
  k5_sloedla_thanks: 'Takk, Egill. Ég skal leiða sönginn á hátíðinni!',
  k5_mosi_star: 'Fimmta stjarnan!',
  k5_mosi_gramedla: 'Grameðla… hún heyrði lagið.',
  k5_egill_next: 'Förum við þangað næst?',
  k5_mosi_longest: 'Lengsta ferðin. Yfir ána við fossinn.',
  k5_mosi_grazers: 'Grasbítarnir!', k5_mosi_turtles: 'Skjaldbökurnar!', k5_mosi_frogs: 'Froskarnir!',
  k5_mosi_lizards: 'Smáeðlurnar!', k5_mosi_flyers: 'Flugdýrin!',
};
/** Mosi's name for each group, as he points at it (the help at 10 s). */
export const NAMES = Object.fromEntries(GROUPS.map(group => [group, `k5_mosi_${group}`]));

const EGILL_HEAD = { actor: 'egill', part: 'head' };
const MOSI_HEAD = { actor: 'mosi', part: 'head' };
const HER_HEAD = { actor: 'sloedla', part: 'head' };
const STAR_FROM = { actor: 'sloedla', part: 'head', offset: [0, 1.4, 0] }; // the star rises from over her crest
const REED_POINT = [FAR_POOL.farReed[0], LEVEL + 2.6, FAR_POOL.farReed[1]]; // over the reed, where her crest shows
const REED_RADIUS = 5; // m: the reed's tap circle
const PEEK_AFTER = 8; // s: she peeks out by herself if the reed is not tapped
const PEEK_HOLD = 3; // s her eyes stay over the reed
const GLOW = '#ffd56a'; // the light on a group's place
// How high over its ground each group's tap point is (its middle as the child sees it), m.
const TAP_HEIGHT = { grazers: 1.6, turtles: 0.5, frogs: 0.35, lizards: 0.5, flyers: 0.8 };
// How fast each group goes to its place (m/s), and the shortest and longest the way may take (s).
const GOING = { grazers: 1.6, lizards: 2.6, flyers: 6, turtles: 1, frogs: 1 };
const GOING_SECONDS = [7, 17];
const CHOIR_SIZE = { grazers: 3, lizards: 6, flyers: 4 }; // how many of those that came stand in the choir (the rest stay put)
const BETWEEN = 0.8; // s from a phrase's step out to the next phrase (the choir's clock stands still meanwhile)
const SONG_TIMES = 2; // she plays the whole song twice in scene 6
const ROAR = { level: 0.3 };
// The choir's shot turns gently toward the group that sings: this share of the way from its own aim to the group, over `seconds`
// (all five groups and the reed stay in frame, at 16:10 and upright); with less motion it holds still.
// The share is halved until every group and the reed are inside FRAMED of the frame from its middle (an upright screen turns less).
const LEAN = { share: 0.15, seconds: 1.6, framed: 0.9, tries: 4 };
const TO_THE_MAP = 1.2; // s the book shows its dinosaurs (Slóeðla nodding) before it turns to the map, as chapter 4's

// ---------------------------------------------------------------------------------------------

function* story(s, c) {
  yield* mapAndPool(s, c);
  yield* shyInTheReed(s, c);
  yield* takeTheirPlaces(s, c);
  yield* theChoir(s, c);
  yield* theWholeSong(s, c);
  yield* answerFromAfar(s, c);
}

// 1. The map draws the way from Flugeðla's tree to Slóeðla's pool, over the pool as chapter 4 left it; then the false horn from the
// reed once more.
function* mapAndPool(s, c) {
  mark(c, 1);
  const { mosi, egill, flugedla, world } = c;
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 35 });
  yield s.wait(2.2); // the pool as chapter 4 left it, before the map
  yield* mapMoment(s, c, { pieces: ['e'], line: 'k5_mosi_map', speak: (speaker, id) => say(s, c, speaker, id) });
  yield s.wait(0.8);
  yield s.camera.cut('reed_close');
  yield s.wait(0.4);
  c.sounds.falseHorn({ pan: panOf(world, REED_POINT) });
  c.log({ type: 'falseHorn' });
  for (const who of [mosi, egill, flugedla]) yield who.lookAt(REED_POINT, { weight: 0.8, maxAngle: 70, maxPitch: 30 });
  yield s.wait(4.2);
  yield s.camera.cut('pool_open');
  yield* say(s, c, 'mosi', 'k5_mosi_again');
  yield flugedla.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 45 });
  yield* say(s, c, 'flugedla', 'k5_flugedla_reed');
  yield s.wait(1.2);
}

// 2. Egill and Mosi go down to the water across from the reed; her crest over it. The child taps the reed and she peeks out (by
// herself after 8 s); the invitation and her answer. As Mosi says the animals remember her song, they set off round the pool.
function* shyInTheReed(s, c) {
  mark(c, 2);
  const { mosi, egill, flugedla } = c;
  yield mosi.lookAt(null);
  yield egill.lookAt(null);
  const down = s.all(mosi.walkTo([SPOTS.mosi], { speed: 1, turnRate: 50 }), egill.walkTo([SPOTS.egill], { speed: 0.75, turnRate: 70 }));
  yield s.camera.cut('bank_talk');
  yield down;
  mosi.turnTo(headingTo(SPOTS.mosi, SPOTS.reed), { rate: 40 });
  egill.turnTo(headingTo(SPOTS.egill, SPOTS.reed), { rate: 60 });
  yield mosi.lookAt(REED_POINT, { weight: 0.7, maxAngle: 70, maxPitch: 30 });
  yield egill.lookAt(REED_POINT, { weight: 0.8, maxAngle: 70, maxPitch: 30 });
  yield flugedla.lookAt(REED_POINT, { weight: 0.6, maxAngle: 70, maxPitch: 30 });
  yield s.wait(1.2);
  // her crest over the reed, and the reed is a tap target
  yield s.camera.cut('reed_close');
  aim(s, c, 'reed', REED_POINT, REED_RADIUS);
  const tapped = yield s.race(s.tap('reed'), s.wait(PEEK_AFTER));
  aim(s, c, 'reed', null);
  c.log({ type: 'peek', tapped: tapped === 'reed' });
  c.her.peek(true);
  yield s.wait(PEEK_HOLD);
  yield s.camera.cut('bank_talk');
  yield* say(s, c, 'mosi', 'k5_mosi_invite');
  yield s.camera.cut('reed_close');
  yield s.wait(1.2); // shy: she does not answer at once
  yield* say(s, c, 'sloedla', 'k5_sloedla_forgot');
  c.her.peek(false);
  yield s.wait(1.4); // down again, sad
  yield s.camera.cut('bank_talk');
  sendTheChoir(c); // "they remember": the animals set off for their places
  yield* say(s, c, 'mosi', 'k5_mosi_animals');
  yield s.wait(0.4);
}

// 3. The five groups come to their places in a bow round the pool, and each sings its tone once, low to high.
function* takeTheirPlaces(s, c) {
  mark(c, 3);
  yield s.camera.cut('choir_wide');
  yield s.until(() => GROUPS.every(group => c.members[group].every(b => !b.trip)));
  yield s.wait(1);
  for (const group of GROUPS) {
    sing(s, c, group, { counted: false, log: 'intro' });
    yield s.wait(1.4);
  }
  yield s.wait(0.6);
  for (const group of GROUPS) aim(s, c, `choir-${group}`, tapPoint(c, group), CHOIR[group].radius);
  yield* say(s, c, 'mosi', 'k5_mosi_help');
  yield s.wait(0.3);
}

// 4 and 5. The choir: the task's rules are kafli5-choir.js; here its events become light, sound and motion. Its clock is the game's,
// but it stands still while she steps out of the reed between two phrases (the interlude), so the next phrase waits for her.
function* theChoir(s, c) {
  mark(c, 4);
  const choir = createChoir({ between: BETWEEN });
  c.choir = choir;
  c.clock = 0;
  let last = s.time;
  const off = GROUPS.map(group => s.onTap(`choir-${group}`, () => {
    const { counted } = choir.tap(group, c.clock);
    c.log({ type: 'tap', group, counted });
  }));
  try {
    choir.start(c.clock);
    while (!choir.state().done) {
      if (!c.interlude) c.clock += s.time - last;
      last = s.time;
      choir.update(c.clock);
      for (const event of choir.events()) onChoir(s, c, event);
      yield;
    }
    for (const event of choir.events()) onChoir(s, c, event);
  } finally {
    for (const stop of off) stop();
  }
  for (const group of GROUPS) c.glow.light(group, 0);
}

/** One of the choir's events, as the child sees and hears it. */
function onChoir(s, c, event) {
  c.log({ ...event, choirTime: event.time });
  const { glow } = c;
  switch (event.type) {
    case 'light':
      for (const group of GROUPS) glow.light(group, group === event.group ? 0.65 : 0);
      if (event.again) hop(c, event.group);
      break;
    case 'show':
      // she plays the phrase first: her horn, and the note flies from her crest to the group
      c.her.horn();
      c.sounds.horn(event.group, { seconds: NOTE * 0.95, pan: panOf(c.world, REED_POINT) });
      glow.fly(c, crestPoint(c), tapPoint(c, event.group), NOTE * 0.9, () => glow.flash(event.group));
      if (event.index === MELODY[event.phrase].length - 1) s.after(NOTE, () => { c.her.idle(); return null; });
      break;
    case 'sing':
      sing(s, c, event.group, { counted: event.counted });
      if (event.counted) {
        leanTo(s, c, event.group);
        glow.light(event.group, 0);
        glow.fly(c, tapPoint(c, event.group), crestPoint(c), ECHO * 0.95);
      }
      break;
    case 'echo':
      c.her.horn();
      c.sounds.horn(event.group, { seconds: 0.9, pan: panOf(c.world, REED_POINT) });
      s.after(0.9, () => { c.her.idle(); return null; });
      break;
    case 'help':
      if (event.level === 'glow') {
        glow.light(event.group, 1);
        hop(c, event.group);
      } else if (event.level === 'point') {
        c.lines.say('mosi', NAMES[event.group], { ifQuiet: true });
        c.mosi.lookAt(tapPoint(c, event.group), { weight: 0.7, maxAngle: 80, maxPitch: 30 });
      }
      break;
    case 'phrase':
      s.after(0, () => phraseDone(s, c, event.phrase));
      break;
    default:
      break;
  }
}

/** A phrase is done: she plays it whole, and (but after the last) comes a step out of the reed while the choir's clock waits. */
function* phraseDone(s, c, phrase) {
  const notes = MELODY[phrase];
  c.her.horn();
  for (const group of notes) {
    c.sounds.horn(group, { seconds: WHOLE * 0.95, pan: panOf(c.world, REED_POINT) });
    c.glow.flash(group);
    hop(c, group);
    yield s.wait(WHOLE);
  }
  c.her.idle();
  if (phrase >= MELODY.length - 1) return;
  // the step out: the camera looks at Egill and Mosi as she comes, then at her, further out
  c.interlude = true;
  try {
    yield s.wait(0.3);
    yield s.camera.cut('bank_talk');
    c.her.stepTo(phrase + 1);
    c.log({ type: 'step', step: phrase + 1 });
    if (phrase === 1) yield* say(s, c, 'mosi', 'k5_mosi_remember');
    else yield s.wait(2.6);
    yield s.camera.cut('reed_close');
    if (phrase === 0) yield* say(s, c, 'sloedla', 'k5_sloedla_mine');
    else yield s.wait(2.6);
    yield s.camera.cut('choir_wide');
    if (phrase === 1) mark(c, 5);
  } finally {
    c.interlude = false;
  }
}

// 6. Out in the pool she plays the whole song with her head up, the animals sing along, Egill taps along on the beat, and Flugeðla
// beats the time with her wings in the water. Her thanks, and the fifth star.
function* theWholeSong(s, c) {
  mark(c, 6);
  const { mosi, egill, flugedla, world } = c;
  yield s.camera.cut('sloedla_out');
  c.her.stepTo(STEPS.length - 1);
  yield c.her.wade();
  c.her.happy();
  for (const who of [mosi, egill]) yield who.lookAt(HER_HEAD, { weight: 0.8, maxAngle: 80, maxPitch: 35 });
  yield flugedla.lookAt(HER_HEAD, { weight: 0.6, maxAngle: 80, maxPitch: 35 });
  yield s.wait(0.8);
  yield s.camera.cut('choir_wide');
  // the song on the beat: each phrase's notes a beat apart, a beat's rest between phrases, twice; the child's taps on the next beat
  const beat = 60 / TEMPO.bpm;
  const start = s.time + beat;
  c.songStart = start;
  const offs = GROUPS.map(group => s.onTap(`choir-${group}`, () => {
    const at = start + nextBeat(s.time - start, TEMPO);
    c.log({ type: 'freeTap', group, beat: at });
    s.after(Math.max(0, at - s.time), () => { sing(s, c, group, { counted: false, log: 'free' }); return null; });
  }));
  const beats = [];
  for (let time = 0; time < SONG_TIMES; time++) {
    for (const notes of MELODY) {
      for (const group of notes) beats.push(group);
      beats.push(null);
    }
  }
  flugedla.raw.play('happy', { fade: 0.4 });
  const [fx, fz] = FAR_POOL.landing;
  try {
    for (let k = 0; k < beats.length; k++) {
      yield s.until(() => s.time >= start + k * beat - 1e-9);
      const group = beats[k];
      if (k % 2 === 0) {
        world.forest?.rippleAt?.(fx, fz, 0.6);
        s.sfx('splash');
      }
      if (!group) continue;
      c.her.horn();
      c.sounds.horn(group, { seconds: beat * 0.95, pan: panOf(world, [WADE.at[0], LEVEL + 2.4, WADE.at[1]]) }); // her horn, out in the pool
      sing(s, c, group, { counted: false, level: 0.12, log: 'song' });
      c.glow.flash(group);
    }
    yield s.wait(beat * 3); // the last note dies away
  } finally {
    for (const stop of offs) stop();
  }
  c.her.idle();
  flugedla.raw.play('idle', { fade: 0.6 });
  yield s.camera.cut('sloedla_out');
  yield* say(s, c, 'sloedla', 'k5_sloedla_thanks');
  s.sfx('star');
  const star = s.star('k5_sloedla', STAR_FROM);
  yield s.wait(1.4);
  yield* say(s, c, 'mosi', 'k5_mosi_star');
  yield star;
  s.sfx('journal');
  yield s.wait(0.8);
}

// 7. A deep roar far in the west: Grameðla heard the song. Everyone turns there, the lines, and the chapter ends in the book, as
// chapter 4's.
function* answerFromAfar(s, c) {
  mark(c, 7);
  const { mosi, egill, flugedla, world } = c;
  for (const group of GROUPS) aim(s, c, `choir-${group}`, null);
  yield s.camera.cut('west_listen');
  yield s.wait(1.8);
  const west = [WEST[0], LEVEL + 40, WEST[1]];
  s.sfx('gramedlaRoar', { level: ROAR.level, pan: panOf(world, west) });
  c.log({ type: 'roar' });
  mosi.turnTo(headingTo(SPOTS.mosi, WEST), { rate: 30 });
  egill.turnTo(headingTo(SPOTS.egill, WEST), { rate: 50 });
  c.sloedla.turnTo(headingTo(WADE.at, WEST), { rate: 25 });
  for (const who of [mosi, egill, flugedla]) yield who.lookAt(west, { weight: 0.8, maxAngle: 80, maxPitch: 20 });
  yield s.wait(4.2);
  yield* say(s, c, 'mosi', 'k5_mosi_gramedla');
  yield egill.lookAt(MOSI_HEAD, { weight: 0.7, maxPitch: 30 });
  yield* say(s, c, 'egill', 'k5_egill_next');
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 35 });
  yield* say(s, c, 'mosi', 'k5_mosi_longest');
  yield s.wait(2.4);
  mark(c, 'end');
  s.fade(0.45, 1.6);
  s.journal.open('dinosaurs', { nod: 'sloedla' });
  s.after(TO_THE_MAP, () => s.journal.open('map'));
  yield s.wait(TO_THE_MAP + 0.4);
}

// ---------------------------------------------------------------------------------------------

/** Those that stand in the choir, by group: the pool's frogs and turtles, and the nearest of those that came along. */
function choirMembers(life) {
  if (!life) return Object.fromEntries(GROUPS.map(group => [group, []]));
  const near = (kinds, group) => life.arrivals
    .filter(b => kinds.includes(b.kind))
    .map(b => [b, Math.hypot(b.gather.at.x - CHOIR[group].at[0], b.gather.at.z - CHOIR[group].at[1])])
    .sort((a, b) => a[1] - b[1])
    .slice(0, CHOIR_SIZE[group])
    .map(([b]) => b);
  return {
    grazers: near(['grasbitur'], 'grazers'),
    turtles: life.pool.turtles,
    frogs: life.pool.frogs,
    lizards: near(['smaedla', 'salamander'], 'lizards'),
    flyers: near(['flugdyr'], 'flyers'),
  };
}

/** The way round the pool from `from` ([x, z]) to `to`: points on a ring outside the water, the short way through the south. */
function roundThePool(from, to) {
  const angleOf = ([x, z]) => (Math.atan2(z - FAR_POOL.center[1], x - FAR_POOL.center[0]) * 180) / Math.PI;
  let a = angleOf(from);
  let b = angleOf(to);
  while (b < a) b += 360;
  if (b - a > 180) [a, b] = [b - 360, a]; // the other way round is shorter: never through the water
  const ring = FAR_POOL.radius + 11;
  const via = [];
  for (let angle = a + 25; angle < b - 12; angle += 25) via.push(around(angle, ring));
  return via;
}

/** Each group of the choir sets off for its place (scene 2): round the pool, a flyer over it. */
function sendTheChoir(c) {
  const life = c.world.forest?.life ?? null;
  c.members = choirMembers(life);
  for (const group of GROUPS) {
    const seats = seatsOf(group);
    c.members[group].forEach((b, k) => {
      const seat = seats[k % seats.length];
      const from = [b.gather.at.x, b.gather.at.z];
      const via = group === 'flyers' ? [] : roundThePool(from, seat.at);
      const way = [from, ...via, seat.at];
      const length = way.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - way[i][0], p[1] - way[i][1]), 0);
      const seconds = Math.min(GOING_SECONDS[1], Math.max(GOING_SECONDS[0], length / GOING[group])) + k * 0.7;
      life.moveTo(b, { at: seat.at, via, heading: seat.heading, seconds });
      c.log({ type: 'go', group, id: b.id, length, seconds });
    });
  }
}

/** The choir's shot turns a little toward `group` (not with less motion, nor while she steps out between phrases). */
function leanTo(s, c, group) {
  if (c.reduced || c.interlude || c.scene < 4 || !c.world.camera) return;
  const { target, position } = SHOTS.choir_wide;
  const p = tapPoint(c, group);
  const V3 = c.world.THREE.Vector3;
  const eye = c.world.camera.clone();
  eye.position.set(...position);
  const seen = [...GROUPS.map(g => tapPoint(c, g)), REED_POINT].map(point => new V3(...point));
  const framed = aim => {
    eye.lookAt(...aim);
    eye.updateMatrixWorld(true);
    return seen.every(point => {
      const q = point.clone().project(eye);
      return q.z < 1 && Math.abs(q.x) <= LEAN.framed && Math.abs(q.y) <= LEAN.framed;
    });
  };
  let share = LEAN.share;
  for (let k = 0; k < LEAN.tries; k++, share /= 2) {
    const aim = target.map((v, i) => v + (p[i] - v) * share);
    if (!framed(aim)) continue;
    s.camera.lookAt(aim, { duration: LEAN.seconds });
    return;
  }
}

/** The group sings its tone: its sound, and every member hops. */
function sing(s, c, group, { counted = false, level, log = null } = {}) {
  c.sounds.sing(group, { pan: panOf(c.world, tapPoint(c, group)), ...(level ? { level } : {}) });
  hop(c, group);
  if (log) c.log({ type: log, group, counted });
}
function hop(c, group) {
  const life = c.world.forest?.life;
  c.members[group]?.forEach((b, k) => life?.hop(b, { height: group === 'grazers' ? 0.35 : group === 'frogs' ? 0.7 : 0.45, seconds: 0.4 + 0.04 * k }));
}

/** Where the child taps a group, and where its notes fly from: over the middle of its place. */
function tapPoint(c, group) {
  c.points ??= {};
  if (!c.points[group]) {
    const [x, z] = CHOIR[group].at;
    const turtles = group === 'turtles' ? c.members?.turtles?.[0]?.gather?.at?.y : null;
    const ground = Number.isFinite(turtles) ? turtles : CHOIR[group].on === 'lilies' ? LEVEL : c.world.heightAt(x, z);
    c.points[group] = [x, ground + TAP_HEIGHT[group], z];
  }
  return c.points[group];
}
function crestPoint(c) {
  const p = c.sloedla.raw.headPosition(new c.world.THREE.Vector3());
  return [p.x, p.y + 0.8, p.z];
}

/**
 * The light on the groups' places (a ring on the water or the bank, pulsing) and the notes that fly between a group and her crest.
 * With less motion (world.reduced) a note fades out where it starts and in where it ends instead of flying.
 */
function createGlow(world, { reduced = false } = {}) {
  const THREE = world.THREE;
  const root = new THREE.Group();
  root.name = 'kafli5 glow';
  world.scene?.add?.(root);
  const additive = () => new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const rings = new Map();
  for (const group of GROUPS) {
    const { at, radius, on } = CHOIR[group];
    const geometry = new THREE.RingGeometry(radius * 0.74, radius, 48);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, additive());
    const y = on === 'lilies' ? LEVEL : Math.max(world.heightAt(at[0], at[1]), LEVEL);
    mesh.position.set(at[0], y + 0.08, at[1]);
    mesh.visible = false;
    mesh.renderOrder = 3;
    root.add(mesh);
    rings.set(group, { mesh, level: 0, target: 0, flash: 0 });
  }
  const noteGeometry = new THREE.SphereGeometry(0.42, 16, 12);
  const notes = Array.from({ length: 6 }, () => {
    const mesh = new THREE.Mesh(noteGeometry, additive());
    mesh.visible = false;
    mesh.renderOrder = 4;
    root.add(mesh);
    return { mesh, flight: null };
  });
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  return {
    root,
    /** The ring on `group`'s place: 0 off, about 0.65 lit, 1 the help's stronger glow. */
    light(group, level) {
      rings.get(group).target = level;
    },
    /** A moment's bright ring as a group sings in her phrase. */
    flash(group) {
      rings.get(group).flash = 1;
    },
    /** A note from `a` to `b` ([x, y, z]) in `seconds`; `then()` when it lands. */
    fly(c, a, b, seconds, then = null) {
      const note = notes.find(n => !n.flight) ?? notes[0];
      note.flight = { a, b, start: c.s.time, seconds, then };
      c.log({ type: 'note', reduced, from: a, to: b });
    },
    update(time, dt) {
      const pulse = 0.78 + 0.22 * Math.sin(2 * Math.PI * 1.3 * time);
      for (const ring of rings.values()) {
        ring.level += (ring.target - ring.level) * Math.min(1, dt * 6);
        ring.flash = Math.max(0, ring.flash - dt * 2.2);
        const opacity = Math.min(1, ring.level * pulse + ring.flash * 0.8);
        ring.mesh.material.opacity = opacity;
        ring.mesh.visible = opacity > 0.01;
      }
      for (const note of notes) {
        const f = note.flight;
        if (!f) continue;
        const u = (time - f.start) / f.seconds;
        if (u >= 1) {
          note.flight = null;
          note.mesh.visible = false;
          f.then?.();
          continue;
        }
        from.fromArray(f.a);
        to.fromArray(f.b);
        note.mesh.visible = true;
        if (reduced) {
          note.mesh.position.copy(u < 0.5 ? from : to);
          note.mesh.material.opacity = u < 0.5 ? 1 - 2 * u : 2 * u - 1;
        } else {
          note.mesh.position.lerpVectors(from, to, u);
          note.mesh.position.y += 2.5 * Math.sin(Math.PI * u);
          note.mesh.material.opacity = Math.min(1, 4 * Math.min(u, 1 - u) + 0.3);
        }
      }
    },
    dispose() {
      root.removeFromParent();
      for (const ring of rings.values()) {
        ring.mesh.geometry.dispose();
        ring.mesh.material.dispose();
      }
      noteGeometry.dispose();
      for (const note of notes) note.mesh.material.dispose();
    },
  };
}

/** The still shots' lines of sight, kept clear of plants (createArdalur's `views`), and the choir's places, where nothing grows. */
function viewsOf(world) {
  const V3 = world.THREE.Vector3;
  const point = ([x, z], up = 1.5) => new V3(x, Math.max(world.heightAt(x, z), LEVEL) + up, z);
  const looks = {
    pool_open: [point(FAR_POOL.bank, 1), point(FAR_POOL.mosi, 3), point(FAR_POOL.landing, 2)],
    reed_close: [point(STEPS[0].at, 2.4), ...STEPS.map(step => point(step.at, 2.5))],
    bank_talk: [point(SPOTS.egill, 1), point(SPOTS.mosi, 3)],
    choir_wide: [...GROUPS.map(group => point(CHOIR[group].at, TAP_HEIGHT[group])), point(SPOTS.reed, 2.6)],
    sloedla_out: [point(WADE.at, 2.6)],
    west_listen: [point(SPOTS.egill, 1), point(SPOTS.mosi, 3)],
  };
  return Object.entries(SHOTS).map(([shot, { position }]) => ({ shot, position: new V3(...position), looks: looks[shot] ?? [] }));
}
const KEEP = [
  ...GROUPS.filter(group => group !== 'frogs').flatMap(group => seatsOf(group).map(({ at: [x, z] }) => ({ x, z, r: group === 'grazers' ? 4.2 : 1.6 }))),
  { x: SPOTS.egill[0], z: SPOTS.egill[1], r: 2 },
  { x: SPOTS.mosi[0], z: SPOTS.mosi[1], r: 3 },
];

/** Where `point` is across the speakers from the camera now: -1 on the left to 1 on the right (a little short of the ends). */
function panOf(world, point) {
  const camera = world.camera;
  if (!camera) return 0;
  camera.updateMatrixWorld();
  const local = new world.THREE.Vector3().fromArray(point).applyMatrix4(camera.matrixWorldInverse);
  const across = local.x / (Math.hypot(local.x, local.z) || 1);
  return Math.max(-1, Math.min(1, across)) * 0.8;
}

/** Less motion: the page's ask (prefers-reduced-motion), ?reduced=1, or what a test's world says. */
function reducedMotion(world) {
  if (typeof world.reduced === 'boolean') return world.reduced;
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  return params.get('reduced') === '1' || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** A line, one voice at a time: `c.saying` counts the lines under way. */
function* say(s, c, speaker, id, options) {
  c.saying = (c.saying ?? 0) + 1;
  try {
    yield s.say(speaker, id, options);
    c.lastSaid = id;
  } finally {
    c.saying--;
  }
}

/** A tap target (`point` null: none), kept in `c.aims` by name for the videos' child (kafli5-demo.js). */
function aim(s, c, name, point, radius) {
  s.target(name, point ? { point, radius } : null);
  if (point) c.aims[name] = point;
  else delete c.aims[name];
}

/** Note when a scene starts (world.chapterTimeline, for captures and probes). */
function mark(c, scene) {
  c.scene = scene;
  c.world.chapterTimeline?.push({ scene, at: c.s.time });
}

// ---------------------------------------------------------------------------------------------

export { SHOWS };

export const chapter = {
  id: 'kafli5',
  title: 'Boð til Slóeðlu',
  next: null, // the last chapter so far
  look: 'goldenAfternoon',
  start: 'tjorn',
  locations: {
    // Árdalurinn round the far pool only, in its real look, with the choir's frogs and turtles; built before the start button shows
    tjorn: {
      build: async world => createArdalur(world, {
        grey: false, route: ROUTE, at: FAR_POOL.center, critters: await loadCritters(world), views: viewsOf(world), keep: KEEP, choir: POOL_LIFE,
      }),
      shots: SHOTS,
      warmUp: ['choir_wide', 'reed_close', 'bank_talk'],
    },
  },
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', position: [FAR_POOL.mosi[0], 0, FAR_POOL.mosi[1]], heading: headingTo(FAR_POOL.mosi, FAR_POOL.farReed) },
    egill: { url: '../assets/characters/egill.glb', position: [FAR_POOL.bank[0], 0, FAR_POOL.bank[1]], heading: headingTo(FAR_POOL.bank, FAR_POOL.farReed) },
    sloedla: { url: '../assets/characters/parasaurolophus.glb', position: [STEPS[0].at[0], 0, STEPS[0].at[1]], heading: STEPS[0].heading },
    flugedla: { url: '../assets/characters/pteranodon.glb', position: [FAR_POOL.landing[0], 0, FAR_POOL.landing[1]], heading: FAR_POOL.facing },
  },
  // Caption names; the colour is the dark tone of each character's main hue (STYLE.md section 3): Slóeðla's blue's (engine/sloedla/friends.js).
  cast: {
    mosi: { name: 'Mosi', colour: '#4f5433' },
    egill: { name: 'Egill', colour: '#355774' },
    sloedla: { name: 'Slóeðla', colour: '#4b6fa4' },
    flugedla: { name: 'Flugeðla', colour: '#955055' },
  },
  lines: Object.fromEntries(Object.entries(WORDS).map(([id, text]) => [id, { text, audio: id }])),
  startShot: 'pool_open',

  warmUp(world) {
    const objects = [...world.actors.values()].map(actor => actor.root);
    return { objects, shots: ['pool_open', 'choir_wide', 'reed_close'], dispose() {} };
  },
  shots: {}, // every shot belongs to the place: chapter.locations.tjorn.shots

  *script(s) {
    const mosi = s.actor('mosi');
    const egill = s.actor('egill');
    const sloedla = s.actor('sloedla');
    const flugedla = s.actor('flugedla');
    const world = mosi.raw.world;
    world.chapterTimeline = [];
    const c = { s, world, mosi, egill, sloedla, flugedla, saying: 0, lastSaid: null, interlude: false, members: {}, choirLog: [], aims: {}, melody: MELODY, groups: GROUPS };
    c.log = entry => c.choirLog.push({ ...entry, at: s.time });
    c.reduced = reducedMotion(world);
    c.lines = lineQueue(s); // Mosi's names for the groups, as the child plays: one at a time
    c.sounds = createChoirSounds({ context: world.sound?.context ?? null, output: world.sound?.output ?? null });
    c.glow = createGlow(world, { reduced: c.reduced });
    c.her = sloedlaLife(sloedla);
    world.chapterState = c; // what the scenes share, for captures, probes and tests
    // As chapter 4 ended: Egill on the bank by Flugeðla in the shallows, Mosi out of his reed, the animals on the banks; she hides
    world.forest?.life?.arrive?.();
    mosi.place(FAR_POOL.mosi[0], FAR_POOL.mosi[1], headingTo(FAR_POOL.mosi, FAR_POOL.farReed));
    egill.place(FAR_POOL.bank[0], FAR_POOL.bank[1], headingTo(FAR_POOL.bank, FAR_POOL.farReed));
    flugedla.place(FAR_POOL.landing[0], FAR_POOL.landing[1], FAR_POOL.facing);
    c.her.hide();
    const release = s.seeking ? null : world.sound?.hold?.(c.sounds);
    let last = s.time;
    s.after(0, function* glowing() {
      while (!c.ended) {
        c.glow.update(s.time, s.time - last);
        last = s.time;
        yield;
      }
    });
    try {
      yield s.camera.cut('pool_open');
      yield s.ready(); // the start button; immediate in captures
      if (demoAsked()) startDemoChild(s, c); // a child's hands for the owner's videos (?kafli5=pikk)
      yield s.fade(0, 0.8);
      yield* story(s, c);
    } finally {
      c.ended = true;
      release?.();
      c.sounds.stop();
    }
  },
};
