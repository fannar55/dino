// Stjörnuhátíðin (the Star Festival), the story's finale, docs/superpowers/specs/2026-11-21-stjornuhatidin-design.md. On Grameðla's
// mountain top, where chapter 6 ends: the five friends come up out of the sea of cloud, the child waves the sun to sleep, Grameðla
// roars, the six stars are lit, a party of four and a half minutes plays locked to the festival's song (a show: no tap does anything
// in it), and a seventh star lifts Egill away into the ride back (hatid-ride.js, a stub until the ride is built).
//
// Built in stages (the plan's tasks): scenes 1 and 2 are real (the night's light hatid-looks.js HATID_LOOKS, the night sky, the
// constellations, the six stars and the moon: Task 12); still grey are the seventh star (a pale disc on the sky), the stage (a disc
// of light under whoever has the solo) and the dance (each friend's idle with a gentle bob on the beat and her `happy` in her solo).
// The structure, the timing and the rules stay when later tasks put the real pictures in.
//
// Four scenes (`mark` names them in world.chapterTimeline):
//   arrival   the top as chapter 6 leaves it; "Hvar eru allir?"; the five come up, 15 s each, with her line; all turn to the sun; the
//             sun's tap (hatid-stars.js createOneTap), its wave and hug, "Góða nótt, sól!", the light to dark over 12 s, the wind alone
//   stars     the dark, the first star, Grameðla's roar (one tap) and the ring over the sea, the six stars out of the book (createStars:
//             any order, tones rising; each lit draws her constellation), the hundreds and "Gleðilega Stjörnuhátíð!", Egill floats down
//             to Mosi, everyone to the party, the moon peeks up, smiles and blows "Tút!"
//   party     theParty: the song from its first note to its last chord's tail, and everything in it a pure function of its beat
//   seventh   everyone round Egill, "Takk, Egill", the seventh star, Egill lifted with his and Mosi's four lines, the ride back
//
// The party alone (`party`, chapters/veisla.js, the book's tile) puts everyone where the chapter has them as the song starts (asParty)
// and plays the very same theParty, then the end card.
import * as THREE from 'three';
import { createTop } from '../world/fjall/index.js';
import {
  FRIENDS8, MODELS, LENGTH, standsOf, arrivalOf, ARRIVALS, SKY, STAR_TAP, SUN_TAP, SHOTS, tallShot, BUDGET, partyPlace,
} from './hatid-route.js';
import { createOneTap, createStars, createSkyStars, starTone, TAP_HELP } from './hatid-stars.js';
import { BEAT, END_BEAT, beatAt, secondsAt, sectionAt, soloAt, energyAt, pulseAt, CAMERA } from './hatid-score.js';
import { SONG } from './hatid-song.js';
import { gramedlaLife } from './kafli6-gramedla.js';
import { HEAD_SEAT } from './kafli6-seat.js';
import { beckon, unbeckon, BECKON } from './kafli6-glitter.js';
import { lineQueue } from './kafli4-flight-play.js';
import { ride as rideBack } from './hatid-ride.js';
import { demoAsked, startDemoChild } from './hatid-demo.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { createSeat, ride, floatTo, floatDown } from '../engine/riding.js';
import { createSong } from '../engine/audio/song.js';
import { createRings } from '../engine/show/rings.js';
import { LOOKS } from '../engine/looks.js';
import { easeLight, lightTo } from '../engine/light-blend.js';
import { SUN_DISTANCE } from '../engine/sun-face.js';
import { endCard, playStart } from '../engine/book/show-cards.js';
import { arrive, seatedWave, hornOf } from './hatid-arrival.js';
import { createGuests } from './hatid-guests.js';
import { loadCritters } from '../world/ardalur/animals.js';
import { SUNSET, lookAt, HATID_LOOKS } from './hatid-looks.js';
import { createNightSky, skyDirection as skyWay, SKY_DISTANCE } from '../engine/night-sky.js';
import { createConstellations } from '../engine/constellations.js';
import { createMoonFace, moonPose, MOON_ACTS } from '../engine/moon-face.js';
import { LAUNCH } from '../engine/scene/journal.js';
import { FJALL } from '../world/fjall/ground.js';
import { createCloudCards } from '../world/fjall/look.js';
import { leaveShow } from '../engine/book/show-player.js';

export const WORDS = {
  h_egill_where: 'Hvar eru allir?', h_mosi_wait: 'Bíddu bara. Þau koma.',
  h_flugedla_forest: 'Allur skógurinn er á leiðinni!', h_kambedla_light: 'Ég kom með ljósið!', h_uggedla_river: 'Allir komnir yfir ána!',
  h_thorsedla_late: 'Er ég of sein?', h_sloedla_song: 'Ég man lagið!',
  h_mosi_sleep: 'Sólin er að fara að sofa. Vinkaðu henni, Egill!', h_mosi_wave: 'Vinkaðu henni, Egill!', h_mosi_goodnight: 'Góða nótt, sól!',
  h_mosi_first: 'Nú bíðum við eftir fyrstu stjörnunni.', h_thorsedla_there: 'Þarna! Ég sé hana!', h_mosi_now: 'Núna, Egill!',
  h_mosi_light: 'Kveiktu á þeim, Egill!', h_mosi_summer: 'Fyrstu stjörnur sumarsins! Gleðilega Stjörnuhátíð!',
  h_sloedla_up: 'Hendur upp!', h_sloedla_stomp: 'Stappa!', h_sloedla_spin: 'Snúa!', h_sloedla_hop: 'Hoppa!',
  h_mosi_thanks: 'Takk, Egill. Þetta var besti dagur í heimi.', h_thorsedla_more: 'Bíddu … þarna er ein í viðbót.',
  h_egill_fly: 'Mosi, sjáðu! Ég flýg!', h_mosi_where: 'Egill! Hvert ertu að fara?', h_egill_bye: 'Ég veit það ekki! Sjáumst!', h_mosi_find: 'Ég finn þig, Egill!',
};
/** Slóeðla's four calls in the dance (SONG.song.calls' moves), said on the call's beat. */
const CALL_LINES = { up: 'h_sloedla_up', stomp: 'h_sloedla_stomp', spin: 'h_sloedla_spin', hop: 'h_sloedla_hop' };
const LINES = Object.fromEntries(Object.entries(WORDS).map(([id, text]) => [id, { text, audio: id }]));

const EGILL_HEAD = { actor: 'egill', part: 'head' };
const HER_HEAD = { actor: 'gramedla', part: 'head' };
const UP = new THREE.Vector3(0, 1, 0);
const deg = Math.PI / 180;
const way = heading => [Math.cos(heading * deg), Math.sin(heading * deg)];
const headingTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / deg;
const SUN_HEADING = SKY.sun.azimuth;

// ---------------------------------------------------------------------------------------------
// Times (s). The child-touches-nothing budget is 630 s from the first frame to the lift (spec 10, the plan's Review Focus 3); the tap
// helps (hatid-stars.js TAP_HELP), the five arrivals' 15 s each and the song are not this file's to shorten.
const OPEN = { before: 1.4, between: 0.4 }; // scene 1: the empty top before Egill asks, and between the two opening lines
// the cut to the sun's face after the wave begins; "Góða nótt, sól!" this many degrees before the sun's drop is whole (its top goes
// under); the wind alone after it has gone
const SUN = { faces: 0.4, goodnight: 2, wind: 4 };
const DUSK = { evening: 5, dark: 7, theme: 8 }; // the light to LOOKS.evening, on to DARK; the theme to nothing (spec: the one silent moment)
// scene 2: the dark before Mosi whispers (the night sky's dark eased in over it); the first star's light eased in; after the six have
// landed on the sky, before Mosi asks; after the sixth tone, before his wish; the hundreds come out over `many` s
const STARS = { wait: 2, first: 1.2, settle: 0.2, after: 0.6, many: 5 };
const FIRST = { rate: 1.75, line: 3 }; // Þórseðla's liftUp at `rate` (as she came up out of the sea), her line once it is high
const HIDE = { seconds: 3 }; // the guests run behind Mosi (and back) in this
// her roar: the camera's tremble; the ring sets out this far into it, `strength`, runs out over `sea` s; the shot holds `hold` s more
// `front`: the ring's (top.js wave), a pale light on its crest
const ROAR = {
  shake: 0.5, ring: 1.2, strength: 4, sea: 6, hold: 4,
  front: { speed: 40, width: 30, glow: '#c8d4ff', glowLevel: 3 },
};
// Kambeðla's plates in the dark: 50 beats a minute from `low` to full; a flare of `flare` s with a fast bright pulse when her star lights
const PLATES = { bpm: 50, low: 0.45, flare: 1.6, flarePulse: { hz: 3, swing: 1.6 } };
// Egill rides her head down over `head` s (chapter 6's 4.2 s took his feet down at 1.2 m/s at the quickest), then floats down to
// `beside` m from Mosi: at least `float` s and `perMetre` s a metre he comes down (floatDown's quickest moment is some 3.5 times its
// mean: so under 1 m/s); everyone's walk to the party (s), at most this fast (m/s); the stars gather over the party in `gather` s
const DOWN = { head: 6, float: 3, perMetre: 4.2, beside: 3, walk: 9, most: 4.5, gather: 3 };
const MOON = { light: 3, smile: 1.5, heapGlow: 0.6 }; // the party's light comes over `light` s from its peek; its smile, before it blows
// the heaps the moon peeks over, [azimuth from moon_peek's lens, metres off, height, width]: an upright card's cloud shows to some
// 0.45 of its height over the sea, so their tops stand 1 to 1.5 degrees over the lens (the moon's eye shows over them as it looks
// about, its lower half behind them), under its disc once it is up (its foot 3.6 degrees up)
const MOON_HEAPS = [[42, 175, 34, 70], [48, 195, 36, 76], [45, 225, 40, 64]];
/** The moon's "Tút!" to the song's first sound (s). */
export const TOOT_GAP = 1.2;
const GATHER = { walk: 7, most: 4, after: 0.6 }; // scene 4: everyone round Egill
const LIFT = { seconds: 6, up: 9, star: 1 }; // Egill floats `up` m over `seconds`; the seventh star shows this long before
const BOB = 0.05; // m: the party's bob on the beat (gentle: the owner's calm night, the chunk's ruling 5)
/** The party alone: the black lifts over `fadeIn` s with the moon's "Tút!", and the song starts `toot` s after it. */
export const ALONE = { fadeIn: 0.8, toot: 2 };
/** The tile's second (from its start) of the party's beat `beat`: for `?chapter=veisla&t=`. */
export const partyTime = beat => ALONE.toot + secondsAt(beat);
/** The song's whole file, from beat 0's offset to its last chord's tail (s). */
const SONG_LENGTH = secondsAt(END_BEAT) + SONG.song.tail;
const SONG_BASE = new URL('../assets/audio/hatid/song/', import.meta.url).href;

// ---------------------------------------------------------------------------------------------

function* story(s, c) {
  yield* arrival(s, c);
  yield* theStars(s, c);
  yield* theParty(s, c);
  yield* seventh(s, c);
}

/** As chapter 6 leaves the top (its last stop, topEnd): Grameðla with Egill on her head, Mosi beside her, the sunset, the cap on. */
function asChapter6Left(s, c) {
  const { world } = c;
  c.top = world.forest;
  c.stands = standsOf(c.top);
  const { start } = c.stands;
  c.her.show();
  c.her.place(start.gramedla.at, start.gramedla.heading);
  c.mosi.place(...start.mosi.at, start.mosi.heading);
  for (const { friend } of ARRIVALS) {
    const { at, heading } = start[friend];
    c[friend].place(...at, heading);
    c[friend].raw.root.visible = false; // under the sea of cloud until she comes
  }
  seatEgill(c);
  lightTo(world, LOOKS.sunset);
  s.sun.cap(1);
  music(c, 0.5, 0); // Mosi's travel theme, low, as chapter 6 ends (the plan's "Music before the song")
  // the guests are away until they come with their friends
  for (const group of Object.keys(c.guests?.counts ?? {})) c.guests.set(group, 'away');
}

/** Egill on her head, astride (kafli6-seat.js HEAD_SEAT), riding. */
function seatEgill(c) {
  c.seat ??= createSeat(c.gramedla.raw, HEAD_SEAT);
  const egill = c.egill.raw;
  egill.root.position.copy(c.seat.update());
  c.riding = ride(egill, c.seat, { settle: 0 });
}

// 1. The arrival, and the sun says goodbye.
function* arrival(s, c) {
  mark(c, 'arrival');
  const { world, stands } = c;
  sound(s, c, 'mountainWind', { level: 0.35 });
  cut(s, c, 'top_empty');
  yield s.wait(OPEN.before);
  yield* say(s, c, 'egill', 'h_egill_where');
  yield s.wait(OPEN.between);
  yield* say(s, c, 'mosi', 'h_mosi_wait');
  // the five, one after another, 15 s each, each known by her sign first (hatid-arrival.js); Grameðla and Mosi go to their places
  // on the arc while the first comes
  const first = s.time;
  ARRIVALS.forEach((entry, k) => {
    s.after(k * entry.seconds, function* comes() { yield* arrive(s, c, entry); });
  });
  s.after(0.5, function* making() {
    const herWay = c.gramedla.raw.walkTo([stands.farewell.gramedla.at], { speed: 1.8, turnRate: 30 });
    const hisWay = c.mosi.raw.walkTo([stands.farewell.mosi.at], { speed: 2.2, turnRate: 40 });
    yield s.all(herWay, hisWay);
    yield s.all(c.gramedla.raw.turnTo(SUN_HEADING, { rate: 30 }), c.mosi.raw.turnTo(SUN_HEADING, { rate: 40 }));
  });
  yield s.until(() => s.time >= first + ARRIVALS.reduce((sum, a) => sum + a.seconds, 0) - 1e-9);
  // everyone in a row facing the sun (scene 1's farewell stands)
  yield s.until(() => FRIENDS8.every(who => !c[who].raw.walking && !c[who].raw.turning));
  cut(s, c, 'lineup_sun');
  yield* say(s, c, 'mosi', 'h_mosi_sleep');
  yield* oneTap(s, c, 'sun', TAP_HELP.sun, {
    aims: [['sun', 'sun', SUN_DISTANCE * Math.tan(SUN_TAP * deg)]],
    glitter: { size: 20, spread: 50, around: 30, up: 0, clear: true },
    hint: () => c.lines.say('mosi', 'h_mosi_wave'),
  });
  yield* sunGoodbye(s, c);
}

/**
 * The sun's goodbye, from the tap: it waves with both hands and all eight wave with it, each in her own way; it yawns and hugs
 * itself; it sinks into the sea of cloud over SUNSET.seconds while the light goes from the sunset to the dark (hatid-looks.js
 * lookAt 0 to 3) and the theme goes to nothing; "Góða nótt, sól!" as its top goes under; then the wind alone (the one silent moment).
 */
function* sunGoodbye(s, c) {
  const { world } = c;
  const waving = s.sun.waveBoth();
  c.log({ type: 'wave', both: true });
  c.waving = { at: s.time };
  everyoneWaves(s, c);
  s.after(SUN.faces, () => { cut(s, c, 'sun_faces'); return null; });
  yield waving;
  c.waving = null;
  yield s.sun.yawn();
  yield s.sun.hug();
  // it sinks, the light goes with it, the theme to nothing
  music(c, 0, SUNSET.seconds);
  c.log({ type: 'sinking' });
  const from = s.time;
  let said = false;
  for (;;) {
    const k = Math.min(1, (s.time - from) / SUNSET.seconds);
    const e = smooth(k);
    s.sun.drop(SUNSET.under * e);
    lightTo(world, lookAt(3 * e));
    if (!said && SUNSET.under * e >= SUNSET.under - SUN.goodnight) {
      said = true;
      s.after(0, function* goodnight() { yield* say(s, c, 'mosi', 'h_mosi_goodnight'); });
    }
    if (k >= 1) break;
    yield;
  }
  hideSun(c); // gone under the sea of cloud: its pieces (and the Mosi cloud, which glowed in the dark) are put away
  cut(s, c, 'lineup_sun');
  yield s.wait(SUN.wind);
}

/** The theme's level (Mosi's travel theme under scene 1), noted in the chapter's log. */
function music(c, level, seconds) {
  c.log({ type: 'music', level, seconds });
  c.world.music?.setLevel?.(level, seconds);
}

/**
 * Everyone waves with the sun, each in her own way: Egill his wave where he sits (his sit with his wave's arm: the seat keeps him),
 * Grameðla a nod, Mosi a lift of his head to it, the five their glad clip (Flugeðla's lifts her wings).
 */
function everyoneWaves(s, c) {
  for (const who of FRIENDS8) {
    let how;
    if (who === 'gramedla') { c.her.nod(); how = 'nod'; }
    else if (who === 'egill') {
      const clip = seatedWave(c.egill.raw);
      if (clip) {
        c.egill.raw.play(clip, { fade: 0.3 });
        s.after(WAVE_WITH, () => { if (c.riding) c.egill.raw.play('sit', { fade: 0.4 }); return null; });
      }
      how = 'wave';
    } else if (who === 'mosi') {
      c.mosi.raw.lookAt('sun', { weight: 0.8, maxPitch: 25 });
      s.after(WAVE_WITH, () => { c.mosi.raw.lookAt(null); return null; });
      how = 'head';
    } else { cheer(s, c, who, WAVE_WITH); how = 'happy'; }
    c.log({ type: 'waveWith', who, how });
  }
}
const WAVE_WITH = 2.6; // s: as long as the sun's wave, and a little
/** A friend's cheer (her happy clip, then her idle again). */
function cheer(s, c, who, seconds = 2.4) {
  const actor = c[who].raw;
  if (!actor.clips.has('happy')) return;
  actor.play('happy', { fade: 0.3 });
  s.after(seconds, () => { if (!c.inParty) actor.play('idle', { fade: 0.5 }); return null; });
}

// 2. The dark, the roar and the stars (spec scene 2, "Myrkrið, öskrið og stjörnurnar"): the dark, Kambeðla's plates beating the only
// light; Mosi's whisper and Þórseðla, highest of them all, sees the first star; Grameðla glitters, the tap, and she breathes in as
// the guests run behind Mosi, roars up at the sky and a ring rolls out over the sea of cloud; six stars fly out of the book onto the
// sky; the child lights them in any order, tones rising, each friend glad, her constellation drawing itself out of her star; the
// hundreds come out and Mosi wishes a glad festival; Egill floats down to Mosi and everyone goes to the party; the moon peeks up
// over the sea of cloud, smiles and blows its blower, and the party starts TOOT_GAP s after.
function* theStars(s, c) {
  mark(c, 'stars');
  const { world, stands, top } = c;
  nightOf(s, c);
  lightTo(world, HATID_LOOKS.dark);
  easeNight(s, c, 'dark', STARS.wait);
  platesBeat(s, c);
  cut(s, c, 'dark_wait');
  yield s.wait(STARS.wait);
  yield* say(s, c, 'mosi', 'h_mosi_first');
  // Þórseðla stretches her neck to its full height, highest of them all, and sees the first star
  cut(s, c, 'first_star');
  const thor = c.thorsedla.raw;
  thor.play('liftUp', { fade: 0.6, timeScale: FIRST.rate, once: true });
  const first = out => skyWay(SKY.first.azimuth, SKY.first.elevation, out).multiplyScalar(SKY_DISTANCE).add(world.camera.position);
  thor.lookAt(first, { weight: 0.8, maxPitch: 60 });
  yield s.wait(FIRST.line);
  if (c.lines.queue.speaking) yield s.until(() => !c.lines.queue.speaking);
  c.log({ type: 'firstStar' });
  easeNight(s, c, 'first', STARS.first);
  yield* say(s, c, 'thorsedla', 'h_thorsedla_there');
  thor.lookAt(null);
  thor.play('idle', { fade: 1.2 });
  // the roar: Egill still on her head, nearest the sky; the guests run behind Mosi while she waits for the tap
  cut(s, c, 'roar_up');
  const hidden = hideGuests(s, c, 'in');
  yield* say(s, c, 'mosi', 'h_mosi_now');
  yield* oneTap(s, c, 'roar', TAP_HELP.roar, {
    aims: [['gramedla', HER_HEAD, 3.5], ['egill', EGILL_HEAD, 1.2]],
    glitter: BECKON.head,
    hint: () => c.lines.say('mosi', 'h_mosi_now'),
  });
  yield s.until(() => hidden.done);
  const shake = !c.reduced;
  let roaredAt = null;
  yield* c.her.roarYes({
    roared: () => {
      roaredAt = s.time;
      c.log({ type: 'roared', handheld: shake });
      if (shake) {
        s.camera.handheld(ROAR.shake, { duration: 0.3 });
        s.after(1.6, () => s.camera.handheld(0, { duration: 1 }));
      }
      s.after(ROAR.ring, () => {
        cut(s, c, 'sea_ring');
        const { x, z } = c.gramedla.raw.root.position;
        const ring = { from: [x, z], strength: ROAR.strength, seconds: ROAR.sea };
        c.log({ type: 'ring', ...ring });
        top.sea?.wave?.({ ...ring, ...ROAR.front });
        return null;
      });
    },
  });
  yield s.until(() => s.time >= roaredAt + ROAR.ring + ROAR.hold - 1e-9);
  hideGuests(s, c, 'out');
  // the six stars fly out of the book onto the sky, each over her friend; the stars' taps are heard from now (none counts in the air)
  cut(s, c, 'stars_wide');
  const task = createStars({ help: TAP_HELP.stars });
  c.starTask = task;
  const keys = FRIENDS.map(f => f.key);
  const offs = keys.map(key => s.onTap(`star-${key}`, () => {
    const { counted } = task.tap(key, s.time);
    c.log({ type: 'tap', task: 'stars', friend: key, counted });
  }));
  offs.push(s.onTap(null, () => { task.tap(null, s.time); c.log({ type: 'tap', task: 'stars', friend: null, counted: false }); }));
  let landed = 0;
  const land = k => {
    if (k >= keys.length || c.skyStars.state(keys[k]).phase !== 'away') return;
    c.skyStars.arrive(keys[k]);
    c.log({ type: 'arrived', friend: keys[k] });
    sound(s, c, 'starBell', { frequency: SONG.motif[0] * 2, level: 0.25 });
    landed++;
    if (landed === keys.length) c.launching = false;
  };
  c.launching = true;
  c.log({ type: 'launch' });
  const points = keys.map(key => c.skyStars.pointOf(key));
  const launch = typeof s.journal?.launchStars === 'function' ? s.journal.launchStars(points, { onLand: land }) : null;
  if (!launch) keys.forEach((key, k) => s.after(LAUNCH_AT(k), () => { land(k); return null; })); // no journal on this page
  yield s.until(() => landed === keys.length);
  yield s.wait(STARS.settle);
  yield* say(s, c, 'mosi', 'h_mosi_light');
  const all = yield* starsTask(s, c, task, offs);
  c.stars = c.skyStars.stars; // the six, lit: kept for the tests and probes
  yield s.until(() => s.time >= all + STARS.after - 1e-9);
  yield* say(s, c, 'mosi', 'h_mosi_summer');
  yield s.until(() => keys.every(key => c.drawn?.[key]) && c.many >= 1); // the whole sky out before the cut
  // Egill floats down beside Mosi, so they can dance together; the stars gather over the party as he does
  cut(s, c, 'egill_down');
  // the tablet's budget (BUDGET.limits): from here to the party nobody casts a sun shadow (the sun is down; egill_down and moon_peek
  // came to 272k and 320k triangles with them, 239k and 244k without); the party then keeps its own four out (theParty)
  const shadows = noShadows(c, FRIENDS8);
  c.skyStars.gather(partyPlace, { seconds: DOWN.gather, span: SKY.party.span });
  yield* c.her.headDown({ seconds: DOWN.head }); // slower than chapter 6's: Egill rides it down, his feet under 1 m/s
  sound(s, c, 'float');
  const egill = c.egill.raw;
  const spot = besideMosi(c);
  const drop = Math.max(0, c.seat.update().y - world.heightAt(spot[0], spot[1]));
  const duration = Math.max(DOWN.float, DOWN.perMetre * drop);
  c.log({ type: 'floatDown', drop, duration });
  c.floating = true;
  const down = floatDown(egill, c.seat, spot, { duration, heading: headingTo(spot, [c.mosi.raw.root.position.x, c.mosi.raw.root.position.z]) });
  c.riding = null;
  yield down;
  c.floating = false;
  yield* c.her.rise();
  // everyone to the party
  cut(s, c, 'party_high');
  const walks = FRIENDS8.map(who => {
    const actor = c[who].raw;
    const to = stands.party[who].at;
    const d = Math.hypot(actor.root.position.x - to[0], actor.root.position.z - to[1]);
    return s.after(0, function* walk() {
      if (d > 0.3) yield actor.walkTo([to], { speed: Math.min(DOWN.most, Math.max(1.2, d / DOWN.walk)), turnRate: 60 });
      yield actor.turnTo(stands.party[who].heading, { rate: 60 });
    });
  });
  yield s.all(...walks);
  // the half moon peeks up over the sea of cloud behind the top in its party hat, smiles, and blows its blower; the party's light comes
  cut(s, c, 'moon_peek');
  easeLight(world, HATID_LOOKS.night, MOON.light);
  moonAct(s, c, 'peek');
  yield s.wait(MOON_ACTS.peek);
  moonAct(s, c, 'smile', { seconds: MOON.smile });
  yield s.wait(MOON.smile);
  toTheParty(c);
  toot(s, c, 'blower');
  yield s.wait(TOOT_GAP);
  shadows.restore();
}

/** The moon's party blower: the sign the party starts on (`sound`: the chapter's blower, the tile's horn). */
function toot(s, c, name = 'horn') {
  if (c.moon) moonAct(s, c, 'toot');
  sound(s, c, name);
  c.log({ type: 'toot' });
}

/** The moon does `kind` (engine/moon-face.js moonPose's acts) from now, noted in the chapter's log. */
function moonAct(s, c, kind, extra = {}) {
  const moon = moonOf(s, c);
  moon.acts.push({ kind, at: s.time, ...extra });
  moon.update(s.time);
  c.log({ type: 'moon', act: kind });
}

/** A star's place k lands (s after the launch) where there is no journal to fly it: as the journal's flight would. */
const LAUNCH_AT = k => LAUNCH.swell + k * LAUNCH.gap + LAUNCH.seconds;

/** Where Egill comes down: on the ground beside Mosi, DOWN.beside m from him toward her (they dance together from there). */
function besideMosi(c) {
  const m = c.mosi.raw.root.position, h = c.gramedla.raw.root.position;
  const d = Math.hypot(h.x - m.x, h.z - m.z) || 1;
  return [m.x + ((h.x - m.x) / d) * DOWN.beside, m.z + ((h.z - m.z) / d) * DOWN.beside];
}

/**
 * The guests to their spots behind Mosi's back (`way` 'in': before her roar, so he stands between them and it) or back to their seats
 * ('out'), over HIDE.seconds, each step in the chapter's log; { done } once they are there.
 */
function hideGuests(s, c, way) {
  const handle = { done: false };
  const g = c.guests;
  c.log({ type: 'hide', phase: way });
  if (!g) { handle.done = true; return handle; }
  if (way === 'in') {
    const mosi = c.mosi.raw;
    const p = mosi.root.position, her = c.gramedla.raw.root.position;
    const h = mosi.heading * deg;
    g.setHide({ at: [p.x, p.z], back: [-Math.cos(h), -Math.sin(h)], face: [her.x, her.z] });
  }
  const groups = Object.keys(g.counts).filter(group => g.counts[group]);
  const from = s.time;
  s.after(0, function* scurry() {
    for (;;) {
      const u = Math.min(1, (s.time - from) / HIDE.seconds);
      for (const group of groups) g.set(group, 'hiding', way === 'in' ? u : 1 - u);
      if (u >= 1) break;
      yield;
    }
    if (way === 'out') for (const group of groups) g.set(group, 'there');
    handle.done = true;
  });
  return handle;
}

/**
 * Kambeðla's plates in the dark (engine/plate-glow.js): beating slowly, PLATES.bpm a minute between PLATES.low and 1 (their own pulse
 * stilled), the only light on the top, until the party; flared bright as her star is lit (c.plateFlare). c.plateLevel is the level.
 */
function platesBeat(s, c) {
  const plates = c.plates;
  if (!plates) return;
  plates.setPulse({ swing: 0 });
  const from = s.time;
  s.after(0, function* beat() {
    while (!c.ended && !c.inParty) {
      const k = 0.5 + 0.5 * Math.sin(2 * Math.PI * (PLATES.bpm / 60) * (s.time - from));
      let level = PLATES.low + (1 - PLATES.low) * k;
      const flare = c.plateFlare != null && s.time - c.plateFlare < PLATES.flare;
      if (flare) level = 1;
      plates.setPulse(flare ? PLATES.flarePulse : { swing: 0 });
      c.plateLevel = level;
      plates.setAll(level, { duration: 0 });
      yield;
    }
    c.plateLevel = null;
    plates.setPulse();
    plates.setAll(1, { duration: 0.5 });
  });
}

/** The night sky's `what` ('dark', 'first' or 'many') eased 0 to 1 over `seconds`; c.many follows 'many'. */
function easeNight(s, c, what, seconds) {
  const from = s.time;
  s.after(0, function* ease() {
    for (;;) {
      const u = seconds > 0 ? Math.min(1, (s.time - from) / seconds) : 1;
      const v = what === 'dark' ? u : smooth(u);
      c.night.set({ [what]: v });
      if (what === 'many') c.many = v;
      if (u >= 1) break;
      yield;
    }
  });
}

/**
 * The night's sky as the festival has it, made once (scene 2, or the party alone): the night sky (engine/night-sky.js, its first
 * star SKY.first, cleared round the six's places in scene 2 and in the party and round the moon), the six constellations
 * (engine/constellations.js), the six stars (hatid-stars.js createSkyStars) and, when it first peeks, the moon (moonOf). Each frame
 * the scene's clock goes into them; each is hung from the camera that draws it just before the render.
 */
function nightOf(s, c) {
  if (c.night) return;
  const { world } = c;
  const keys = FRIENDS.map(f => f.key);
  const clear = [
    ...keys.map(key => ({ ...SKY.stars[key], degrees: STAR_TAP + 1 })),
    ...keys.map(key => ({ ...partyPlace(key), degrees: STAR_TAP })),
    { ...SKY.moon, degrees: 6 },
  ];
  c.night = createNightSky(world, { clear, first: SKY.first, reduced: c.reduced });
  c.many = 0;
  c.figures = createConstellations(world, { capacity: 6 });
  c.skyStars = createSkyStars(world, { sky: c.night, constellations: c.figures, actors: Object.fromEntries(keys.map(key => [key, c[key].raw])) });
  c.drawn = {};
  const before = world.scene.onBeforeRender;
  c.unhang = () => { world.scene.onBeforeRender = before; };
  world.scene.onBeforeRender = function hang(renderer, scene, camera, target) {
    c.night?.update(camera);
    c.figures?.update(camera);
    c.moon?.face.update(camera);
    before?.call(this, renderer, scene, camera, target);
  };
  s.after(0, function* skyFrames() {
    while (!c.ended) {
      c.skyStars.update(world.camera, s.time);
      c.night.set({ time: s.time });
      c.moon?.update(s.time);
      yield;
    }
  });
}

/**
 * The moon (engine/moon-face.js) at SKY.moon, made as it first peeks: { face, heaps, acts, pose, update(time) } (pose: moonPose's
 * now). `heaps`: MOON_HEAPS, standing heaps of the sea of cloud (world/fjall/look.js cloud cards, as the top's own) between
 * moon_peek's lens and the moon, so it peeks up from behind cloud, not out of a straight line.
 */
function moonOf(s, c) {
  if (c.moon) return c.moon;
  const face = createMoonFace({ scene: c.world.scene, ...SKY.moon });
  const [px, , pz] = SHOTS.toppur.moon_peek.position;
  const heaps = createCloudCards(c.world, MOON_HEAPS.map(([azimuth, distance, h, w], k) => ({
    x: px + Math.cos(azimuth * deg) * distance, z: pz + Math.sin(azimuth * deg) * distance, y: FJALL.top.sea + h * 0.15,
    w, h, opacity: 0.95, seed: 3.1 + k * 1.7,
  })), { name: 'Hátíð: the heaps the moon peeks over', renderOrder: 11, fogShare: 0.4 });
  heaps.setGlow(MOON.heapGlow, '#9aa6d8'); // lit pale by the moon behind them, so they read as cloud and not as a dark cut
  c.world.scene.add(heaps.mesh);
  const moon = {
    face, heaps, acts: [], pose: null,
    update(time) {
      moon.pose = moonPose(moon.acts, time);
      face.set(moon.pose);
      heaps.update(0, time);
    },
  };
  c.moon = moon;
  return moon;
}

/** The six stars (hatid-stars.js createStars, its taps heard since `offs`): when the sixth tone sounds (s, the game clock's). */
function* starsTask(s, c, task, offs) {
  const keys = FRIENDS.map(f => f.key);
  let all = s.time;
  const bell = { sfx: (name, detail) => sound(s, c, name, detail) };
  const onStar = event => {
    c.task('stars', event);
    switch (event.type) {
      case 'want': {
        const unlit = keys.filter(k => !task.state().lit.includes(k));
        for (const k of unlit) aim(s, c, `star-${k}`, c.skyStars.pointOf(k), SKY_DISTANCE * Math.tan(STAR_TAP * deg));
        wait(s, c, 'stars', unlit.map(k => `star-${k}`));
        break;
      }
      case 'help':
        c.skyStars.glow(event.friend, true);
        break;
      case 'light': {
        const { friend, n, at } = event;
        aim(s, c, `star-${friend}`, null);
        const { colour } = FRIENDS.find(f => f.key === friend);
        const drawing = c.skyStars.light(friend, colour);
        c.log({ type: 'lit', friend, colour });
        s.after(0, function* whole() {
          yield s.until(() => drawing.done);
          c.drawn[friend] = true;
          c.log({ type: 'drawn', friend });
        });
        let how = 'happy';
        if (friend === 'gramedla') { c.her.nod(); how = 'nod'; }
        else if (friend === 'kambedla') { c.plateFlare = s.time; cheer(s, c, friend); how = 'plates'; }
        else cheer(s, c, friend);
        c.log({ type: 'glad', friend, how });
        const rate = SONG.motif[n] / SONG.motif[0];
        s.after(Math.max(0, at - s.time), () => {
          starTone(bell, n);
          c.log({ type: 'tone', n, rate, friend });
          return null;
        });
        break;
      }
      case 'all':
        all = event.at;
        // the hundreds come out as the sixth tone sounds
        s.after(Math.max(0, event.at - s.time), () => {
          c.log({ type: 'many' });
          easeNight(s, c, 'many', STARS.many);
          return null;
        });
        break;
      default:
        break;
    }
  };
  try {
    task.start(s.time);
    while (!task.state().done) {
      task.update(s.time);
      for (const event of task.events()) onStar(event);
      yield;
    }
    for (const event of task.events()) onStar(event);
  } finally {
    for (const off of offs) off();
    unaim(s, c);
  }
  return all;
}

/**
 * One tap (the sun's wave, her roar: hatid-stars.js createOneTap): `aims` [name, point, radius] glitter from the moment it waits;
 * the help's hint is `hint()`; done when it goes, by the child or the help.
 */
function* oneTap(s, c, task, help, { aims, glitter, hint }) {
  const machine = createOneTap({ help });
  c[`${task}Task`] = machine;
  const names = aims.map(([name]) => name);
  const offs = names.map(name => s.onTap(name, () => c.log({ type: 'tap', task, on: name, counted: machine.tap(s.time).counted })));
  try {
    machine.start(s.time);
    const onEvent = event => {
      c.task(task, event);
      if (event.type === 'want') {
        for (const [name, point, radius] of aims) aim(s, c, name, point, radius);
        wait(s, c, task, names);
        beckon(s, c, names, glitter);
      } else if (event.type === 'help') hint();
    };
    while (!machine.state().done) {
      machine.update(s.time);
      for (const event of machine.events()) onEvent(event);
      yield;
    }
    for (const event of machine.events()) onEvent(event);
  } finally {
    for (const off of offs) off();
    unaim(s, c);
    unbeckon(c);
  }
}

// ---------------------------------------------------------------------------------------------
// 3. The party: the song from its first note to its last chord's tail. Everything that moves is a pure function of the song's beat
// (hatid-score.js beatAt of the seconds since the song started: beat 0 is SONG.beatOffset into the file), so a pause holds the
// picture with the song, `?t=` lands on the same frame as a play, and the book's tile plays the same show. No tap does anything.

/** Everyone on her party stand, facing the child, standing still in her idle: what the party starts from, in the chapter and alone. */
function toTheParty(c) {
  const { stands } = c;
  c.riding?.stop?.();
  c.riding = null;
  for (const who of FRIENDS8) {
    const actor = c[who].raw;
    actor.stop();
    if (actor.controlled) actor.control(null);
    const { at, heading } = stands.party[who];
    actor.place(at[0], at[1], heading);
    actor.root.visible = true;
    actor.play('idle', { fade: 0 });
  }
  c.her.show();
  c.guests?.seated(); // the guests in their seats on the rim, as they sat down in the arrival
}

// The party's events by beat: the cut first (what happens on its beat is seen in the new shot), then the section, the call, the cues.
const PARTY_BEATS = (() => {
  const events = [
    ...CAMERA.map(shot => ({ ...shot, kind: 'camera' })),
    ...SONG.song.sections.map(section => ({ beat: section.startBeat, kind: 'section', section })),
    ...SONG.song.calls.map(call => ({ beat: call.beat, kind: 'call', call })),
    ...SONG.song.cues.map(cue => ({ beat: cue.beat, kind: 'cue', cue })),
  ].sort((a, b) => a.beat - b.beat);
  const beats = [];
  for (const event of events) {
    if (beats.at(-1)?.beat === event.beat) beats.at(-1).events.push(event);
    else beats.push({ beat: event.beat, events: [event] });
  }
  return beats;
})();

function* theParty(s, c) {
  mark(c, 'party');
  const start = s.time;
  c.partyStart = start;
  c.partyBeat = beatAt(0);
  c.inParty = true;
  c.song.play(0);
  c.log({ type: 'party' });
  c.stage = greyStage(c);
  c.band = greyBand(c);
  c.dance = greyDance(c);
  const shadows = noShadows(c, BUDGET.noShadow);
  const frame = () => {
    const beat = beatAt(s.time - start);
    c.partyBeat = beat;
    c.stage.update(beat);
    c.band.update(beat);
    c.dance.update(beat);
    c.top?.standIns?.update(beat, c.world.camera); // the measurement's light points (?gestir: hatid-standins.js), never else
  };
  frame();
  let over = false;
  s.after(0, function* everyFrame() {
    while (!over && !c.ended) {
      frame();
      yield;
    }
  });
  try {
    for (const { beat, events } of PARTY_BEATS) {
      yield s.until(() => s.time >= start + secondsAt(beat) - 1e-9);
      for (const event of events) onParty(s, c, event);
    }
    yield s.until(() => s.time >= start + SONG_LENGTH - 1e-9); // the last chord dies away
    c.log({ type: 'partyEnd' });
  } finally {
    over = true;
    c.inParty = false;
    shadows.restore();
    c.stage.dispose();
  }
}

/** One event of the party, as the child sees it (the sound is the song's own). */
function onParty(s, c, event) {
  const at = s.time;
  switch (event.kind) {
    case 'camera': {
      const { cut: shot, then, beat } = event;
      c.partyLog.push({ type: 'cut', beat, shot, at });
      cut(s, c, shot, { check: false });
      if (!then || c.reduced) break;
      const duration = then.beats * BEAT;
      if (then.push !== undefined) s.camera.push({ distance: then.push, duration });
      else if (then.orbit !== undefined) s.camera.orbit({ degrees: then.orbit, duration });
      else if (then.zoom !== undefined) s.camera.zoom(then.zoom, { duration });
      break;
    }
    case 'section':
      c.partyLog.push({ type: 'section', beat: event.beat, id: event.section.id, at });
      break;
    case 'call': {
      const { call } = event;
      c.partyLog.push({ type: 'call', beat: call.beat, move: call.move, at });
      s.say('sloedla', CALL_LINES[call.move], { hold: 0.15, listen: false });
      break;
    }
    case 'cue':
      c.partyLog.push({ type: 'cue', beat: event.beat, kind: event.cue.kind, at });
      break;
    default:
      break;
  }
}

/**
 * The tablet's budget in the party (hatid-route.js BUDGET, measured in Task 6): `who` cast no sun shadow while it lasts (their skins'
 * userData.noShadow: engine/character-lod.js keeps their shadow casters out of the sun's pass), and cast again after.
 */
function noShadows(c, who) {
  const skins = [];
  for (const name of who) c[name].raw.model.traverse(o => { if (o.isSkinnedMesh && !o.name.endsWith(' shadow')) skins.push(o); });
  for (const skin of skins) skin.userData.noShadow = true;
  return {
    restore() { for (const skin of skins) delete skin.userData.noShadow; },
  };
}

/** Grey stage: a disc of light (engine/show/rings.js) under whoever has the solo, brighter on the beat. */
function greyStage(c) {
  const rings = createRings(c.world, { capacity: 4, name: 'Hátíð grey stage' });
  let now = { section: null, solo: null, energy: 0 };
  return {
    update(beat) {
      const section = sectionAt(beat)?.id ?? null;
      const solo = soloAt(beat);
      now = { section, solo: solo?.who ?? null, energy: Math.round(energyAt(beat) * 1000) / 1000 };
      rings.begin();
      if (solo) {
        const { x, y, z } = c[solo.who].raw.root.position;
        const colour = new THREE.Color(FRIENDS.find(f => f.key === solo.who)?.colour ?? '#ffffff');
        const level = 0.55 + 0.35 * pulseAt(beat);
        rings.disc(x, y + 0.08, z, LENGTH[solo.who] / 2 + 1.5, colour.r, colour.g, colour.b, level);
      }
      rings.end();
    },
    state: () => ({ ...now }),
    dispose: () => rings.dispose(),
  };
}
/** Grey band: nothing of its own yet (Task 15 gives each friend her part). */
function greyBand() {
  return { update() {}, state: () => ({}) };
}
/**
 * Grey dance: each friend in her idle with a gentle bob on the beat, and her happy in her solo (Grameðla her roar). The clip's time
 * is set from the beat every frame, so the pose is the beat's, wherever the party was started from.
 */
function greyDance(c) {
  const held = new Map(); // who -> { clip, action, from }
  return {
    update(beat) {
      const solo = soloAt(beat);
      for (const who of FRIENDS8) {
        const actor = c[who].raw;
        const mine = solo?.who === who;
        const clip = mine ? (actor.clips.has('happy') ? 'happy' : 'roar') : 'idle';
        let state = held.get(who);
        if (state?.clip !== clip) {
          const action = actor.play(clip, { fade: 0.3, once: false });
          state = { clip, action, from: mine ? soloStart(beat) : 0 };
          held.set(who, state);
        }
        const duration = state.action?.getClip().duration ?? 0;
        if (duration > 0) state.action.time = ((((beat - state.from) * BEAT) % duration) + duration) % duration;
        const { at } = c.stands.party[who];
        actor.root.position.y = c.world.heightAt(at[0], at[1]) + BOB * pulseAt(beat);
      }
    },
  };
}
const soloStart = beat => SONG.song.solos.find(slot => beat >= slot.startBeat && beat < slot.startBeat + slot.beats)?.startBeat ?? beat;

/**
 * What the tests and probes compare of a party frame: each actor's root and heading and the turn of her Head, Neck and Tail1 bones,
 * the camera's place and aim, and the stage's state.
 */
export function partyFrame(c) {
  const { world } = c;
  const actors = {};
  for (const who of FRIENDS8) {
    const actor = world.actors.get(who);
    actor.root.updateMatrixWorld(true);
    actors[who] = {
      at: actor.root.position.toArray(), heading: actor.heading,
      bones: Object.fromEntries(['Head', 'Neck', 'Tail1'].map(bone => [bone, actor.model.getObjectByName(bone)?.quaternion.toArray() ?? null])),
    };
  }
  const rig = world.director?.rig;
  const target = rig?.target?.toArray?.() ?? world.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(world.camera.position).toArray();
  return { actors, camera: { position: world.camera.position.toArray(), target }, stage: c.stage?.state() ?? null };
}

// ---------------------------------------------------------------------------------------------
// 4. The seventh star: everyone round Egill, his thanks, a star of another colour, and he is lifted away.
function* seventh(s, c) {
  mark(c, 'seventh');
  const { stands } = c;
  cut(s, c, 'gather');
  const walks = FRIENDS8.map(who => {
    const actor = c[who].raw;
    const { at: to, heading } = stands.gather[who];
    const d = Math.hypot(actor.root.position.x - to[0], actor.root.position.z - to[1]);
    return s.after(0, function* walk() {
      if (d > 0.3) yield actor.walkTo([to], { speed: Math.min(GATHER.most, Math.max(1.2, d / GATHER.walk)), turnRate: 60 });
      yield actor.turnTo(heading, { rate: 60 });
    });
  });
  yield s.all(...walks);
  yield s.wait(GATHER.after);
  yield* say(s, c, 'mosi', 'h_mosi_thanks');
  cut(s, c, 'seventh_sky');
  c.sky.show('seventh', SKY.seventh, { colour: '#c8b6ff', size: 12, fade: LIFT.star });
  yield* say(s, c, 'thorsedla', 'h_thorsedla_more');
  yield s.wait(LIFT.star);
  // the soft light lifts him (grey: floatTo a point LIFT.up m over him), and he laughs and waves
  cut(s, c, 'lift_side');
  const egill = c.egill.raw;
  const from = egill.root.position.clone();
  const high = from.clone().addScaledVector(UP, LIFT.up);
  const holder = { heading: egill.heading, lookYawLimit: Infinity, lookUpLimit: Infinity };
  const light = { seat: high, update: () => high, host: holder };
  c.log({ type: 'lifted', at: from.toArray() });
  if (typeof s.journal?.seen === 'function') s.journal.seen('hatid'); // Task 19 makes it real; until then it is not there
  sound(s, c, 'float');
  const up = floatTo(egill, light, { duration: LIFT.seconds });
  yield* say(s, c, 'egill', 'h_egill_fly');
  cut(s, c, 'mosi_up');
  yield* say(s, c, 'mosi', 'h_mosi_where');
  yield* say(s, c, 'egill', 'h_egill_bye');
  yield* say(s, c, 'mosi', 'h_mosi_find');
  yield up;
  const hand = {
    egill, moth: null, mosi: c.mosi.raw, top: c.top, sky: c.night ?? null, constellations: c.figures ?? null, moon: c.moon?.face ?? null,
    seventh: { ...SKY.seventh, colour: '#c8b6ff' }, lifted: { at: from.toArray(), time: s.time },
  };
  yield* rideBack(s, c, hand);
  mark(c, 'end');
  s.journal.open('dinosaurs');
  yield s.wait(1);
}

// ---------------------------------------------------------------------------------------------
// The grey sky: pale discs hung on the sky sphere (DISTANCE m from the camera, as the sun's face is), each at an azimuth and
// elevation of hatid-route.js SKY, so wherever the camera goes they stand where the sky has them.

/** A soft round disc, made of numbers (no page needed). */
let discTexture = null;
function disc() {
  if (discTexture) return discTexture;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const a = Math.max(0, Math.min(1, (1 - r) * 3));
      data.set([255, 255, 255, Math.round(a * 255)], (y * n + x) * 4);
    }
  }
  discTexture = new THREE.DataTexture(data, n, n);
  discTexture.needsUpdate = true;
  return discTexture;
}
const skyDirection = ({ azimuth, elevation }, out = new THREE.Vector3()) => out.set(
  Math.cos(elevation * deg) * Math.cos(azimuth * deg), Math.sin(elevation * deg), Math.cos(elevation * deg) * Math.sin(azimuth * deg),
);

function greySky(c) {
  const { world } = c;
  const DISTANCE = 450;
  const items = new Map(); // name -> { sprite, place: { azimuth, elevation }, size, level, born, fade, rise, from, to, moveFrom, moveSeconds, hinted }
  let clock = 0;
  const at = new THREE.Vector3();
  function hang(item, camera = world.camera) {
    const place = item.place;
    item.sprite.position.copy(camera.position).addScaledVector(skyDirection(place, at), DISTANCE);
  }
  const effect = {
    label: 'hátíð grey sky',
    update(dt) {
      clock += dt;
      for (const item of items.values()) {
        const age = clock - item.born;
        if (item.rise) item.place = { azimuth: item.to.azimuth, elevation: item.to.elevation - 14 * (1 - smooth(age / item.rise)) };
        if (item.move) {
          const k = smooth((clock - item.move.from) / item.move.seconds);
          item.place = { azimuth: item.move.a.azimuth + (item.move.b.azimuth - item.move.a.azimuth) * k, elevation: item.move.a.elevation + (item.move.b.elevation - item.move.a.elevation) * k };
        }
        const shown = item.fade ? smooth(age / item.fade) : 1;
        const hint = item.hinted && !c.reduced ? 1 + 0.35 * (0.5 + 0.5 * Math.sin(clock * 5)) : item.hinted ? 1.3 : 1;
        item.sprite.material.opacity = item.level * shown;
        item.sprite.scale.setScalar(item.size * hint);
        hang(item);
      }
      return !c.ended;
    },
  };
  world.effects?.add?.(effect);
  return {
    distance: DISTANCE,
    show(name, place, { colour, size, fade = 0, rise = 0 } = {}) {
      items.get(name)?.sprite.removeFromParent();
      const material = new THREE.SpriteMaterial({ map: disc(), color: colour, transparent: true, depthWrite: false, fog: false, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.name = `Hátíð grey sky ${name}`;
      sprite.renderOrder = 2;
      sprite.onBeforeRender = (renderer, scene, camera) => { const item = items.get(name); if (item) { hang(item, camera); sprite.updateMatrixWorld(true); } };
      world.scene.add(sprite);
      const item = { sprite, place: { ...place }, to: { ...place }, size, level: rise || fade ? 0.85 : 0.85, born: clock, fade, rise, move: null, hinted: false };
      items.set(name, item);
      if (rise) item.place = { ...place, elevation: place.elevation - 14 };
      hang(item);
      return sprite;
    },
    move(name, to, seconds) {
      const item = items.get(name);
      if (item) item.move = { a: { ...item.place }, b: { ...to }, from: clock, seconds };
    },
    /** Lit: her own colour, brighter and bigger. */
    light(name, colour) {
      const item = items.get(name);
      if (!item) return;
      item.sprite.material.color.set(colour);
      item.level = 1;
      item.size *= 1.5;
      item.hinted = false;
    },
    hint(name) { const item = items.get(name); if (item) item.hinted = true; },
    /** Where it hangs now from the camera (a live point for a tap target). */
    point(name) {
      return out => {
        const item = items.get(name);
        const place = item?.to ?? SKY.stars[name] ?? SKY.first;
        return out.copy(world.camera.position).addScaledVector(skyDirection(place, new THREE.Vector3()), DISTANCE);
      };
    },
    get stars() { return Object.fromEntries(FRIENDS.map(f => [f.key, items.get(f.key)]).filter(([, item]) => item)); },
    dispose() {
      for (const item of items.values()) { item.sprite.removeFromParent(); item.sprite.material.dispose(); }
      items.clear();
    },
  };
}
const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

// The sky's own sun and Mosi cloud (engine/sun-face.js, added by main.js): gone after it says good night (grey for its sinking), back at the end.
const SUN_DECOR = ['SunFace', 'SunHandsAndMouth', 'SunNightcap', 'MosiCloud']; // the Mosi cloud too: it glowed white in the night (stills)
function hideSun(c) {
  if (c.sunHidden) return;
  c.sunHidden = new Map();
  for (const name of SUN_DECOR) {
    const object = c.world.scene.getObjectByName(name);
    if (!object) continue;
    c.sunHidden.set(object, object.visible);
    object.visible = false;
  }
  c.log({ type: 'sunGone' });
}
function showSun(c) {
  if (!c.sunHidden) return;
  for (const [object, visible] of c.sunHidden) object.visible = visible;
  c.sunHidden = null;
}

// ---------------------------------------------------------------------------------------------

/** A shot of hatid-route.js SHOTS.toppur, its upright frame where it has one (tallShot), labelled. */
function cut(s, c, name, options = { check: false }) {
  c.shotLabel = name;
  const tall = c.world.camera.aspect < 1 ? tallShot(name) : null;
  return s.camera.cut(tall ? { ...tall, label: name } : name, options);
}

/** Less motion: the page's ask (prefers-reduced-motion), ?reduced=1, or what a test's world says. */
function reducedMotion(world) {
  if (typeof world.reduced === 'boolean') return world.reduced;
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  return params.get('reduced') === '1' || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** A scene's own line, one voice at a time (as kafli6.js): it waits for a help's line under way. */
function* say(s, c, speaker, id, options) {
  c.saying = (c.saying ?? 0) + 1;
  try {
    if (c.lines.queue.speaking) yield s.until(() => !c.lines.queue.speaking);
    yield s.say(speaker, id, options);
  } finally {
    c.saying--;
  }
}
/** The help's lines, one at a time and never over a scene's own line (as kafli6.js helpLines). */
function helpLines(s, c) {
  const queue = lineQueue(s);
  const held = [];
  return {
    queue,
    say(speaker, id, options = {}) {
      if (!c.saying && !held.length) return queue.say(speaker, id, options);
      held.push([speaker, id, options]);
      if (held.length === 1) {
        s.after(0, function* afterTheLine() {
          yield s.until(() => !c.saying);
          while (held.length) queue.say(...held.shift());
        });
      }
      return null;
    },
  };
}

/** A sound effect, noted in the chapter's log. */
function sound(s, c, name, detail) {
  c.log({ type: 'sound', name, ...(detail ?? {}) });
  s.sfx(name, detail);
}
/** A tap target (`point` null: none), kept in `c.aims` by name for the demo child and the tests. Never in the party. */
function aim(s, c, name, point, radius) {
  if (point && c.inParty) c.log({ type: 'partyAim', name });
  s.target(name, point ? { point, radius } : null);
  if (point) c.aims[name] = point;
  else delete c.aims[name];
}
function unaim(s, c) {
  for (const name of Object.keys(c.aims)) aim(s, c, name, null);
  c.waiting = null;
}
/** A task waits for one of `names` from now (the tests look that each is on the screen). */
function wait(s, c, task, names) {
  c.waiting = { task, names, since: s.time };
}
/** Note when a scene starts (world.chapterTimeline, for captures, probes and tests). */
function mark(c, scene) {
  c.scene = scene;
  c.world.chapterTimeline?.push({ scene, at: c.s.time });
}

// ---------------------------------------------------------------------------------------------

/** The scenes' shared state `c` (world.chapterState: for captures, probes and tests). `c.run()` starts what runs every frame. */
function setUp(s) {
  const c = { s, saying: 0, aims: {}, waiting: null, taskLog: [], chapterLog: [], partyLog: [], partyStart: null, partyBeat: null, inParty: false };
  for (const who of FRIENDS8) c[who] = s.actor(who);
  const world = c.mosi.raw.world;
  c.world = world;
  world.chapterTimeline = [];
  c.log = entry => c.chapterLog.push({ ...entry, at: s.time, scene: c.scene });
  c.task = (task, event) => c.taskLog.push({ task, ...event, at: event.time ?? s.time });
  c.reduced = reducedMotion(world);
  c.lines = helpLines(s, c);
  c.sfx = (name, detail) => sound(s, c, name, detail);
  c.footfall = () => sound(s, c, 'gramedlaThump', { level: 0.5 });
  c.her = gramedlaLife(s, c);
  c.sky = greySky(c);
  c.seat = createSeat(c.gramedla.raw, HEAD_SEAT); // Egill's place on her head (the party alone has it too, unused)
  c.top = world.forest;
  c.stands = standsOf(c.top);
  // the arrival's tools (hatid-arrival.js) and the guests (hatid-guests.js: built with the top, drawn every frame from here)
  c.cut = name => cut(s, c, name);
  c.say = (speaker, id, options) => say(s, c, speaker, id, options);
  c.sound = (name, detail) => sound(s, c, name, detail);
  const horn = hornOf(world);
  c.horn = seconds => { c.log({ type: 'sound', name: 'sloedlaHorn', clear: true }); horn(seconds); };
  c.guests = guestsOf(s, c);
  // the song, held with the game's sound (a book open, a hidden tab) as chapter 5's set is
  const context = world.sound?.context ?? null;
  const output = world.sound?.output ?? null;
  const clock = world.clock ?? { get time() { return s.time; } };
  const releases = new Map();
  let ours = false; // nothing holds it (no page): the script gives it its frame itself
  const make = () => {
    const song = createSong({ context, output, clock, src: SONG.song.src, base: SONG_BASE, ...(world.sound?.createElement ? { createElement: world.sound.createElement } : {}) });
    if (!s.seeking) {
      const off = world.sound?.hold?.(song) ?? null;
      if (off) releases.set(song, off);
      else ours = true;
    } else ours = true;
    return song;
  };
  c.song = make();
  /** The song once more from its top (the party alone, "Aftur"): a song plays once, so the old one goes and a new one is made. */
  c.newSong = () => {
    const old = c.song;
    old.stop(0.3);
    releases.get(old)?.();
    releases.delete(old);
    c.song = make();
  };
  world.chapterState = c;
  c.run = () => {
    s.after(0, function* songFrames() {
      while (!c.ended) {
        if (ours) c.song.update();
        yield;
      }
    });
    return () => {
      c.ended = true;
      for (const name of Object.keys(c.aims)) aim(s, c, name, null);
      unbeckon(c);
      c.song.stop(0.5);
      for (const off of releases.values()) off();
      releases.clear();
      c.sky.dispose();
      c.unhang?.();
      c.skyStars?.dispose();
      c.figures?.dispose();
      c.moon?.face.dispose();
      c.moon?.heaps.dispose();
      c.night?.dispose();
      showSun(c);
      try { s.sun?.drop?.(0); } catch { /* no sun on this page */ } // the sun back where every other chapter has it
      c.plates?.dispose?.();
      c.guests?.stop();
      c.her.dispose();
      world.music?.setLevel?.(1, 1);
    };
  };
  return c;
}

/**
 * The guests as the scenes use them (the top's: guestsWith): `come(which, seconds)` sends a group ('hoppers': the frogs, turtles and
 * lizards) along its way over `seconds` and seats it, each step in the chapter's log; drawn every frame, on the scene's clock (in the
 * party on the song's, so a pause and a seek hold them as the friends). Nothing where the top has none (no critters to be had).
 */
function guestsOf(s, c) {
  const core = c.top?.guests ?? null;
  if (!core) return null;
  const { world } = c;
  const way = friend => () => {
    const { way: [under, rim, inside] } = arrivalOf(c.top, friend);
    return [under, rim, inside].map(([x, z]) => [x, c.top.heightAt(x, z), z]);
  };
  core.setWays({
    flyers: () => { const [under] = way('flugedla')(); return [[under[0] * 3, FJALL.top.sea + 24, under[2] * 3], [under[0] * 1.4, FJALL.top.sea + 18, under[2] * 1.4]]; },
    hoppers: () => c.guestBack?.() ?? way('uggedla')().slice(2),
    grazers: way('sloedla'),
  });
  let running = true;
  s.after(0, function* drawGuests() {
    while (running && !c.ended) {
      const time = c.partyStart != null && c.partyBeat != null ? c.partyBeat * BEAT : s.time;
      core.update(world.camera, time);
      yield;
    }
  });
  return {
    counts: core.counts,
    set: (group, phase, u) => core.set(group, phase, u),
    setHide: place => core.setHide(place),
    where: () => core.where(),
    come(which, seconds) {
      const groups = which === 'hoppers' ? ['frogs', 'turtles', 'lizards'] : [which];
      for (const group of groups) {
        if (!core.counts[group]) continue;
        c.log({ type: 'guests', group, phase: 'coming' });
        const from = s.time;
        core.set(group, 'coming', 0);
        s.after(0, function* coming() {
          while (s.time - from < seconds) {
            core.set(group, 'coming', (s.time - from) / seconds);
            yield;
          }
          core.set(group, 'there');
          c.log({ type: 'guests', group, phase: 'there' });
        });
      }
    },
    /** Everyone in her seat at once (the party, and the party alone). */
    seated() { for (const group of Object.keys(core.counts)) core.set(group, 'there'); },
    stop() { running = false; },
  };
}

/** The top with its guests (hatid-guests.js), the valley's critters loaded for them first. */
function guestsWith(world, top) {
  return loadCritters(world).then(models => {
    const guests = createGuests(world, { top, models, budget: BUDGET.guests });
    top.guests = guests;
    const dispose = top.dispose?.bind(top);
    top.dispose = () => { top.guests?.dispose(); top.guests = null; dispose?.(); };
    return guests.ready.then(() => top);
  });
}

/**
 * The top, with the measurement's stand-ins on it where the page asks for them (?gestir=<n>: hatid-standins.js, Task 6's measurement
 * and the owner's stills of where everyone stands); else the top as it is, built at once.
 */
function withStandIns(world, top) {
  const asked = new URLSearchParams(globalThis.location?.search ?? '').get('gestir');
  if (asked === null) return top;
  return import('./hatid-standins.js').then(async ({ loadStandIns, standInsAsked }) => {
    top.standIns = await loadStandIns(world, top, standInsAsked());
    const dispose = top.dispose?.bind(top);
    top.dispose = () => { top.standIns?.dispose(); top.standIns = null; dispose?.(); };
    return top;
  });
}

const cast = {
  mosi: { name: 'Mosi', colour: '#4f5433' },
  egill: { name: 'Egill', colour: '#355774' },
  ...Object.fromEntries(FRIENDS.filter(f => f.key !== 'gramedla').map(f => [f.key, { name: f.name, colour: f.colour }])),
};

export const chapter = {
  id: 'hatid',
  title: 'Stjörnuhátíðin',
  next: null, // the ride back is the festival's last scene (hatid-ride.js), and it ends the story
  look: 'sunset', // as chapter 6 ends on the top; the night is eased in by the script
  theme: 'kafli2/theme.json', // Mosi's travel theme, low under the arrival, to nothing as the sun goes; the party has its own song
  start: 'toppur',
  locations: {
    toppur: { build: world => Promise.resolve(withStandIns(world, createTop(world))).then(top => guestsWith(world, top)), shots: SHOTS.toppur },
  },
  actors: Object.fromEntries(FRIENDS8.map(who => [who, { url: `../assets/characters/${MODELS[who]}.glb`, position: [0, 0, 0], heading: 0 }])),
  cast, // Grameðla speaks no line: she roars, snorts and nods
  lines: LINES,
  startShot: 'top_empty',

  warmUp(world) {
    const objects = [...world.actors.values()].map(actor => actor.root);
    return { objects, shots: ['top_empty', ...ARRIVALS.flatMap(({ friend }) => [`arrive_${friend}`, `home_${friend}`])], dispose() {} };
  },
  shots: {}, // every shot belongs to its place: chapter.locations.toppur.shots

  *script(s) {
    const c = setUp(s);
    const close = c.run();
    try {
      asChapter6Left(s, c);
      yield s.camera.cut('top_empty', { check: false });
      yield s.ready(); // the start button; immediate in captures
      if (demoAsked()) startDemoChild(s, c); // a child's hands for the owner's videos (?hatid=pikk)
      yield s.fade(0, 0.8);
      yield* story(s, c);
    } finally {
      close();
    }
  },
};

// ---------------------------------------------------------------------------------------------
// The party alone: the book's tile "Stjörnuhátíðin" (chapters/veisla.js, `?chapter=veisla`), from the moon's "Tút!" to the last
// chord, as chapter 5's music show is on its tile (kafli5.js `show`). No story, no star, no line but Slóeðla's four calls, nothing
// the save keeps; then the end card ("Aftur" plays it again with a new song, "Hætta" leaves).

/** Everyone where the chapter has them as the song starts, behind the black: the party's light, the six lit at their party places with their constellations, the hundreds out, the moon up. */
function asParty(s, c) {
  const { world } = c;
  lightTo(world, HATID_LOOKS.night);
  s.sun.cap(1);
  hideSun(c);
  world.music?.setLevel?.(0, 0);
  nightOf(s, c);
  c.night.set({ dark: 1, first: 1, many: 1 });
  c.many = 1;
  for (const { key } of FRIENDS) c.skyStars.arrive(key);
  c.skyStars.gather(partyPlace, { seconds: 0, span: SKY.party.span });
  c.skyStars.update(world.camera, s.time);
  for (const { key, colour } of FRIENDS) c.skyStars.light(key, colour, { at: -Infinity });
  c.skyStars.update(world.camera, s.time);
  moonOf(s, c);
  c.moon.update(s.time);
  c.stars = c.skyStars.stars;
  toTheParty(c);
}

export const party = {
  ...chapter,
  id: 'veisla',
  title: 'Stjörnuhátíðin',
  next: null,
  lines: Object.fromEntries(Object.values(CALL_LINES).map(id => [id, LINES[id]])), // only Slóeðla's four calls
  startShot: 'moon_peek',
  // It starts as a video does: at once where the browser lets sound begin (the tap on its tile), else from a round play button.
  startsItself: true,
  startButton: playStart,

  warmUp(world) {
    const objects = [...world.actors.values()].map(actor => actor.root);
    return { objects, shots: ['moon_peek', ...new Set(CAMERA.filter(shot => shot.beat < 140).map(shot => shot.cut))], dispose() {} };
  },

  *script(s) {
    const c = setUp(s);
    const doc = c.world.page ?? globalThis.document;
    const close = c.run();
    try {
      asParty(s, c);
      yield s.camera.cut('moon_peek', { check: false });
      yield s.ready(); // the tap on the tile, or on the play button; immediate in captures
      for (;;) {
        mark(c, 'moon');
        s.fade(0, ALONE.fadeIn);
        toot(s, c);
        yield s.wait(ALONE.toot);
        yield* theParty(s, c);
        mark(c, 'end');
        let again = false;
        const card = endCard(doc, { onAgain: () => { again = true; }, onQuit: () => { c.song.stop(0.1); leaveShow(globalThis.window); } });
        doc.body.append(card.element);
        try {
          yield s.until(() => again);
        } finally {
          card.element.remove();
        }
        yield s.fade(1, 0.6);
        c.newSong();
        asParty(s, c);
        yield s.camera.cut('moon_peek', { check: false });
      }
    } finally {
      close();
    }
  },
};
