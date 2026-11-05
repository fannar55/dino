// The flight alone, for review (?chapter=flug): chapter 4's flight on Flugeðla's back (chapters/kafli4-flight.js), from Egill seated
// on her on top of the white snag to her glide down over the far pool, in Árdalurinn (world/ardalur). The full chapter (kafli4.js,
// later) plays the same flight after its first scenes; this plays it on its own, so the owner can judge each chunk of it.
//
//   ?chapter=flug               the grey animatic
//   ?chapter=flug&flugedla=10   Flugeðla 10 m from wingtip to wingtip instead of 7.5 (the owner picks one: spec 11)
//   ?chapter=flug&lit=1         the real valley instead of grey (from chunk 2)
//   ?chapter=flug&reduced=1     as a tablet that asks for less motion sees it: no orbit, no slow second, half the bank
//   ?chapter=flug&play=track1   a child's hands on it: steering, the calls and „Hraðar!“ at fixed times (flug-track.js), for a recording
import { createRoute, TREE } from './kafli4-route.js';
import { theFlight, FLIGHT_WORDS, createFlightSong } from './kafli4-flight.js';
import { lineQueue } from './kafli4-flight-play.js';
import { track1 } from './flug-track.js';
import { createArdalur } from '../world/ardalur/index.js';
import { createFlier, rideFlier } from '../engine/flier.js';
import { createFlightCamera } from '../engine/camera/flight-camera.js';
import { createFlightSounds, loadFlightRecordings } from '../engine/audio/flight-sounds.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const WINGSPAN = Number(params.get('flugedla')) || 7.5;
const route = createRoute({ wingspan: WINGSPAN });

/** Less motion: the page's ask (prefers-reduced-motion), ?reduced=1, or what a test's world says. */
function reducedMotion(world) {
  if (typeof world.reduced === 'boolean') return world.reduced;
  return params.get('reduced') === '1' || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export const chapter = {
  id: 'flug',
  title: 'Flugið',
  next: null,
  look: 'earlyAfternoon', // spec 2: early afternoon; the flight turns it golden over the falls
  // The page's theme, which the forest dances to; it is silent here: the flight plays its own song (kafli4-flight.js SONG)
  theme: 'kafli2/theme.json',
  start: 'ardalur',
  locations: {
    ardalur: {
      build: world => createArdalur(world, { grey: !params.has('lit'), route }),
      shots: {
        // While the start button waits: the white snag on the Fen, with her on top of it and Egill on her back.
        flug_snag: { position: [17, 5, 13], target: [...TREE].map((v, i) => (i === 1 ? v + 1.5 : v)), fov: 42 },
      },
    },
  },
  actors: {
    flugedla: { url: '../assets/characters/pteranodon.glb', position: [...TREE], heading: 0, scale: WINGSPAN / 7.5 },
    egill: { url: '../assets/characters/egill.glb', position: [...TREE], heading: 0 }, // on her back: the script seats him
    mosi: { url: '../assets/characters/mosi.glb', position: [0, 0, 30], heading: 0 }, // out of sight until his cameos
  },
  // Caption names; the colour is the dark tone of each character's main hue (STYLE.md section 3: her crest's raspberry).
  cast: {
    mosi: { name: 'Mosi', colour: '#4f5433' },
    egill: { name: 'Egill', colour: '#355774' },
    flugedla: { name: 'Flugeðla', colour: '#955055' },
  },
  // the flight's lines, each with its recording (Task 15: the kafli4 set)
  lines: Object.fromEntries(Object.entries(FLIGHT_WORDS).map(([id, text]) => [id, { text, audio: id }])),
  startShot: 'flug_snag',
  shots: {},

  /**
   * What the warm-up draws once behind the start button (engine/warm-up.js), so that nothing is drawn for the first time mid-flight
   * (a material's first draw is a stall of 0.2 to 0.6 s on the laptop): the actors (Mosi waits out of sight), the falls, the far land
   * and the animal groups. Grameðla's model is made after the button, and drawn once in the black then (script, below).
   */
  warmUp(world) {
    const objects = [...world.actors.values()].map(actor => actor.root);
    const place = world.forest;
    for (const part of [place?.waterfall, place?.farLand, place?.animals]) if (part?.group) objects.push(part.group);
    return { objects, dispose() {} };
  },

  *script(s) {
    const flugedla = s.actor('flugedla');
    const egill = s.actor('egill');
    const mosi = s.actor('mosi');
    const world = flugedla.raw.world;
    world.chapterTimeline = [];
    const reduced = reducedMotion(world);
    const flier = createFlier(flugedla.raw, route, { world, reduced });
    flier.update(0); // on top of the snag, wings folded
    const riding = rideFlier(egill.raw, flier);
    const camera = createFlightCamera(world.director, flier, { world, egill: egill.raw, reduced });
    const context = world.sound?.context ?? null;
    const sounds = createFlightSounds({ context, output: world.sound?.output ?? null, recordings: loadFlightRecordings(context) });
    const c = { s, world, flugedla, egill, mosi, route, flier, riding, camera, sounds, reduced, flight: null };
    // only the flight's song: the page's theme is silent from the start, and the song is made now, so its file is there by the flight
    world.music?.setLevel?.(0, 0);
    c.song = createFlightSong(world);
    // the voices one at a time (a line waits for the one playing), and the page the „Hraðar!“ button goes on
    const lines = lineQueue(s);
    c.say = lines.say;
    Object.defineProperty(c, 'speaking', { get: () => lines.speaking });
    c.doc = world.page ?? globalThis.document ?? null;
    c.mark = scene => {
      c.flight.beat = scene;
      world.chapterTimeline.push({ scene, at: s.time });
    };
    world.chapterState = c; // for captures and probes
    mosi.raw.root.visible = false;
    yield s.camera.cut('flug_snag');
    // Grameðla's model for the far land (world/ardalur/far-land.js), fetched while the start button waits and made behind it (a long
    // frame nobody sees: the flight starts in black); a capture goes on at once and has her long before she is seen at 116 s
    const far = world.forest?.farLand ?? null;
    far?.prefetch();
    yield s.ready(); // the start button; immediate in captures
    if (far) {
      if (s.seeking) far.load();
      else {
        yield far.load();
        if (far.gramedla.shadow) world.warmObjects?.([far.gramedla.shadow]); // main.js: one draw with her, under the black
      }
    }
    if (params.get('play') === 'track1') s.after(0, () => track1(s, c)); // a child's hands for the review video (flug-track.js)
    yield* theFlight(s, c);
    // over the far pool: the review ends in black (the full chapter lands her there: scene 7)
    yield s.fade(1, 1);
    riding.stop();
    flier.stop();
  },
};
