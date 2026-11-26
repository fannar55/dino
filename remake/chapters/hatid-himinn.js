// Look-check page for the festival's night sky (?chapter=hatid-himinn): the top at night (hatid-looks.js HATID_LOOKS.dark) with the
// night sky (engine/night-sky.js) at many 1, and the constellations (engine/constellations.js) each over her friend. Never part of the
// game: not in the book, not in the save, not linked from anything; only this address opens it. Stills: remake/tools/capture.mjs with
// t to freeze it (.tools/hatid-merki/stills.mjs).
//
//   ?chapter=hatid-himinn&show=merki&friend=sloedla&t=2
//
//   ?chapter=hatid-himinn&show=tungl&face=vinkar&t=2
//
//   show     merki (default): the constellations; tungl: the moon (engine/moon-face.js) with one of its faces
//   friend   <key>: one of the six large, she standing under hers on the top seen from her right side; all (default): all six where
//            the festival has them (hatid-route.js SKY.stars, each over her friend's star), everyone as scene 2 has them, from
//            stars_wide (its upright frame on an upright screen)
//   pose     drawn (default): each held in the pose her drawing was traced in (constellation-figures.js FIGURES[key].pose); idle |
//            walk | happy: the clip she plays (walk on the spot); any other clip of hers (fly, glide, roar, stride, liftUp, call...):
//            that clip held at `hold` s (fly and glide default to the frame that spreads Flugeðla's wings widest, WINGS below); one
//            without that clip falls back to her drawn pose
//   hold     seconds into the held clip (with hold, idle, walk and happy are held too)
//   drawn    0 to 1 (default 1): how much of her constellation is drawn
//   span     degrees of sky her drawing's longest side covers (default 16, the engine's)
//   nedar    degrees every row of stars is lowered by with friend=all (default 0: hatid-route.js SKY.stars as they are)
//   saman    with friend=all, each star's azimuth off the middle of the shot's view times this (default 1: as they are; 0.6 brings
//            them 40 % closer together, for the wide party shot, which cannot hold them all side by side)
//   face     the moon's face, one of MOON_FACES below (default brosir)
//   figur    a try's drawings instead of the game's (DRAWINGS below)
//   lens     show=tungl: close (default: the moon large), party_wide or moon_peek; show=merki&friend=all: stars_wide (default) or
//            party_wide. With party_wide everyone stands where the party has them, else where the dark has them
import { createTop } from '../world/fjall/index.js';
import { FRIENDS8, MODELS, LENGTH, SHOTS, SKY, STAR_TAP, standsOf, tallShot, floorPoint } from './hatid-route.js';
import { HATID_LOOKS } from './hatid-looks.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { lightTo } from '../engine/light-blend.js';
import { createNightSky } from '../engine/night-sky.js';
import { createConstellations, FIGURES, STAR_BONE } from '../engine/constellations.js';
import { createMoonFace, moonPose } from '../engine/moon-face.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const SHOW = params.get('show') || 'merki';
const FRIEND = params.get('friend') || 'all';
const POSE = params.get('pose') || 'drawn';
const DRAWN = params.has('drawn') ? Number(params.get('drawn')) : 1;
const SPAN = params.has('span') ? Number(params.get('span')) || 16 : 16;
const LOWER = Number(params.get('nedar')) || 0;
const TOGETHER = params.has('saman') ? Number(params.get('saman')) : 1;
const FACE = params.get('face') || 'brosir';
const LENS = params.get('lens'); // not 'shot': main.js takes ?shot= for its own
const MOON_SHOT = LENS || 'close';
/**
 * Flugeðla's wings spread (.tools/hatid-tungl/wings.mjs, 2026-11-26): her fly clip at 1.015 s spreads them widest of her clips,
 * 6.55 m tip to tip (glide 6.35 at its end, idle 0.67: folded).
 */
const WINGS = { fly: 1.015, glide: 6 };
const HOLD = params.has('hold') ? Number(params.get('hold')) : WINGS[POSE] ?? 0;
/**
 * figur=<name>: the drawings of a try (remake/tools/hatid-merki.mjs --set ... --write --out qa/remake/hatid/butur4/merki2/figures_<name>.js)
 * instead of the game's, for a still of another view or pose; a word of letters only.
 */
const TRY = /^[a-z0-9_]+$/.test(params.get('figur') ?? '') ? params.get('figur') : null;
const DRAWINGS = TRY ? (await import(`../../qa/remake/hatid/butur4/merki2/figures_${TRY}.js`)).FIGURES : FIGURES;

/** The moon's faces for the owner's stills: each the acts and the time moonPose is asked at (and an eye held shut for the blink). */
const BEAT = 60 / 84;
export const MOON_FACES = {
  brosir: { acts: [], t: 0.5 },
  blikkar: { acts: [], t: 0.5, eye: 'shut' },
  glottir: { acts: [{ kind: 'smile', at: 0 }], t: 0.6 },
  o: { acts: [{ kind: 'oh', at: 0 }], t: 0.6 },
  blaes: { acts: [{ kind: 'toot', at: 0 }], t: 0.45 },
  hattur_skakkur: { acts: [{ kind: 'askew', at: 0 }], t: 1.2 },
  hond_a_hatti: { acts: [{ kind: 'rock', at: 0, seconds: 8, bpm: 84 }], t: 1.5 * BEAT },
  vinkar: { acts: [{ kind: 'wave', at: 0 }], t: 1.0 },
  hattur_lyft: { acts: [{ kind: 'tipHat', at: 0 }], t: 1.0 },
  kikir: { acts: [{ kind: 'peek', at: 0 }], t: 1.25 },
};
/** The moon large: from by the rim behind the stage's place (moon_close's spot), a long lens on it; lower for its peek. Upright the
 * director keeps the lens's width across, so its fov is narrower there. */
function moonShot(world, face, upright) {
  const [x, z] = floorPoint(0, 41);
  const y = (world.forest.heightAt?.(x, z) ?? 1.2) + 1.4;
  const elevation = face === 'kikir' ? 1.2 : SKY.moon.elevation + 0.95;
  const a = SKY.moon.azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
  const target = [x + Math.cos(a) * Math.cos(e) * 40, y + Math.sin(e) * 40, z + Math.sin(a) * Math.cos(e) * 40];
  return { position: [x, y, z], target, fov: upright ? 10 : 16, label: `moon_${face}` };
}
const SIX = FRIENDS.map(f => f.key);
const HUE = Object.fromEntries(FRIENDS.map(f => [f.key, f.colour]));

/**
 * One friend large: she at the top's middle facing +X, the lens on her right, she on the frame's left and her constellation on its
 * right, `span` degrees of sky across (16 by default, as in the festival), her drawing's middle at `CLOSE.sky`.
 */
const CLOSE = { at: [0, 4], back: 2.3, up: 0.35, lookRight: 21, pitch: 13, fov: 50, sky: { right: 34, up: 24 } };
function closeShot(world, who) {
  const actor = world.actors.get(who);
  const [x, z] = CLOSE.at;
  const length = LENGTH[who];
  const d = length * CLOSE.back;
  const y = world.forest.heightAt?.(x, z) ?? 1.2;
  const height = actor.size.y;
  const position = [x, y + height * CLOSE.up + 1.2, z + d];
  // from her right she lies toward -Z (azimuth -90); the lens looks `lookRight` degrees to the right of her
  const azimuth = -90 + CLOSE.lookRight;
  const a = azimuth * Math.PI / 180, p = CLOSE.pitch * Math.PI / 180;
  const target = [position[0] + Math.cos(a) * Math.cos(p) * 40, position[1] + Math.sin(p) * 40, position[2] + Math.sin(a) * Math.cos(p) * 40];
  return { shot: { position, target, fov: CLOSE.fov, label: `close_${who}` }, sky: { azimuth: -90 + CLOSE.sky.right, elevation: CLOSE.sky.up } };
}

/** Her star's place for a wide look: SKY.stars lowered by `nedar`, its azimuth off the shot's middle times `saman`. */
function placeFor(who, shot) {
  const [px, , pz] = shot.position, [tx, , tz] = shot.target;
  const middle = Math.atan2(tz - pz, tx - px) * 180 / Math.PI;
  const { azimuth, elevation } = SKY.stars[who];
  return { azimuth: middle + wrap(azimuth - middle) * TOGETHER, elevation: elevation - LOWER };
}

/** Hers `span` wide with her drawing's middle at `centre`: added there, measured, then added again moved by what was off. */
function addLarge(sky, who, actor, centre, span) {
  const first = { colour: HUE[who], ...centre, span, figure: DRAWINGS[who] };
  sky.add(who, actor, first);
  const box = boxOf(sky.outlineOf(who), centre);
  const placed = { azimuth: centre.azimuth - (box.midAz - centre.azimuth), elevation: centre.elevation - (box.midEl - centre.elevation) };
  sky.add(who, actor, { ...first, ...placed });
  return { span, ...placed };
}
function boxOf(points, centre) {
  const az = points.map(p => wrap(p.azimuth - centre.azimuth) + centre.azimuth);
  const el = points.map(p => p.elevation);
  const lo = [Math.min(...az), Math.min(...el)], hi = [Math.max(...az), Math.max(...el)];
  const mid = (lo[1] + hi[1]) / 2;
  return { wide: (hi[0] - lo[0]) * Math.cos(mid * Math.PI / 180), high: hi[1] - lo[1], midAz: (lo[0] + hi[0]) / 2, midEl: mid };
}
const wrap = a => ((a + 540) % 360) - 180;

export const chapter = {
  id: 'hatid-himinn',
  title: 'Næturhiminn hátíðarinnar',
  look: 'sunset',
  start: 'toppur',
  locations: { toppur: { build: world => createTop(world), shots: SHOTS.toppur } },
  actors: Object.fromEntries(FRIENDS8.map(who => [who, { url: `../assets/characters/${MODELS[who]}.glb`, position: [0, 0, 0], heading: 0 }])),
  startShot: 'stars_wide',
  shots: {},

  *script(s) {
    const world = s.actor('mosi').raw.world;
    const top = world.forest;
    lightTo(world, HATID_LOOKS.dark);
    for (const name of ['SunFace', 'SunHandsAndMouth', 'SunNightcap']) {
      const o = world.scene.getObjectByName(name);
      if (o) o.visible = false;
    }
    const actors = Object.fromEntries(FRIENDS8.map(who => [who, s.actor(who).raw]));
    // party_wide sees everyone where the party has them; the rest as the dark has them
    const stands = LENS === 'party_wide' ? standsOf(top).party : standsOf(top).dark;
    const one = SHOW === 'merki' && FRIEND !== 'all' && SIX.includes(FRIEND);
    for (const who of FRIENDS8) {
      const stand = stands[who];
      // Egill sits on Grameðla's head in the dark (no seat on this page: he is left out), and with one large only she is there
      if (stand.on || (one && who !== FRIEND)) actors[who].root.visible = false;
      else actors[who].place(...stand.at, stand.heading);
    }
    if (one) actors[FRIEND].place(...CLOSE.at, 0);
    for (const who of SIX) {
      const a = actors[who];
      const playing = !params.has('hold') && (POSE === 'idle' || POSE === 'walk' || (POSE === 'happy' && a.clips.has('happy')));
      // held: the pose her drawing was traced in, or the clip asked for at `hold`
      const [clip, time] = playing ? [POSE, 0] : POSE !== 'drawn' && a.clips.has(POSE) ? [POSE, HOLD] : [DRAWINGS[who].pose.clip, DRAWINGS[who].pose.time];
      const action = a.play(clip, { fade: 0, timeScale: playing ? 1 : 0 });
      if (!playing) {
        action.time = time; // one frame, held
        a.mixer.update(0);
      }
    }
    yield s.wait(0.1);

    // the sky: many 1, cleared round the six stars and the moon as Task 9's look-check has it
    const clear = [...Object.values(SKY.stars).map(p => ({ ...p, degrees: STAR_TAP + 1 })), { ...SKY.moon, degrees: 6 }];
    const night = createNightSky(world, { clear, first: SKY.first });
    night.set({ dark: 1, first: 1, many: 1, time: 4 });
    const sky = createConstellations(world, { capacity: 6 });
    const upright = (globalThis.innerWidth ?? 16) < (globalThis.innerHeight ?? 10);
    let shot;
    let moon = null;
    const placed = {};
    if (SHOW === 'merki') {
      if (one) {
        const close = closeShot(world, FRIEND);
        shot = close.shot;
        placed[FRIEND] = addLarge(sky, FRIEND, actors[FRIEND], close.sky, SPAN);
      } else {
        const wide = LENS === 'party_wide' ? 'party_wide' : 'stars_wide';
        shot = { ...((upright && tallShot(wide)) || SHOTS.toppur[wide]), label: wide };
        for (const who of SIX) {
          const at = placeFor(who, shot);
          sky.add(who, actors[who], { colour: HUE[who], ...at, span: SPAN, figure: DRAWINGS[who] });
          placed[who] = { ...at, span: SPAN };
        }
      }
      for (const who of Object.keys(placed)) sky.set(who, { drawn: DRAWN });
    } else {
      // the moon, where the festival has it (SKY.moon), with one face
      const face = MOON_FACES[FACE] ?? MOON_FACES.brosir;
      moon = createMoonFace({ scene: world.scene, ...SKY.moon });
      moon.set({ ...moonPose(face.acts, face.t), ...(face.eye ? { eye: face.eye } : {}) });
      shot = MOON_SHOT === 'close' ? moonShot(world, FACE, upright)
        : { ...((upright && tallShot(MOON_SHOT)) || SHOTS.toppur[MOON_SHOT] || SHOTS.toppur.party_wide), label: MOON_SHOT };
    }
    // hung from the camera after everything else has moved this frame, just before it is drawn
    const before = world.scene.onBeforeRender;
    world.scene.onBeforeRender = function hang(renderer, scene, camera, target) {
      night.update(camera);
      sky.update(camera);
      moon?.update(camera);
      before?.call(this, renderer, scene, camera, target);
    };
    world.chapterState = { night, sky, moon, placed, actors, show: SHOW, friend: FRIEND, face: FACE, starBone: STAR_BONE };
    yield s.camera.cut(shot, { check: false });
    yield s.ready();
    yield s.fade(0, 0.3);
    yield s.wait(1e6);
  },
};
