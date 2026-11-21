// THROWAWAY check page for chapter 6's chunk 1 (Task 5, step 5): the cloud on the mountain's side, proven on the page. Not a chapter:
// nothing links to it, and it goes once the cloud is judged. Mosi stands in the grey belt (world/fjall/belt.js) at the first print,
// Grameðla (trex.glb, as chapters/gramedla3d.js loads her) `dist` m up the prints in the cloud, and the camera looks past him to her.
//
//   ?chapter=fjall-sky&level=0.5&dist=18&t=2            a still at that level of the cloud (set at once)
//   ?chapter=fjall-sky&level=1&blow=1                   the blow-away: at BLOW s she "roars", the ring flies out from her and the light
//                                                       eases to the sunset's over CLOUD.blow; the script ends 6 s in (for a clip)
//   view=game (default: behind Mosi, looking up the prints) | low (at his height) | up (looking up into the cloud's sky)
//   glow=1   the golden glow toward her;  swirl=1  a swirl at the second print;  reduced=1  the cloud's reduced motion
import { createBelt } from '../world/fjall/belt.js';
import { LOOKS } from '../engine/looks.js';
import { lightTo, easeLight } from '../engine/light-blend.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const LEVEL = Number(params.get('level') ?? 0.5);
const DIST = Number(params.get('dist') ?? 18);
const BLOW = 1.5;
const VIEW = params.get('view') || 'game';
// six prints about 9 m apart along a gentle path from the origin, up the belt (+X)
const PRINTS = Array.from({ length: 6 }, (_, i) => ({
  position: [4 + i * 9, Math.sin(i * 0.6) * 2 + (i % 2 ? 0.8 : -0.8)], heading: Math.atan2(Math.cos(i * 0.6) * 0.12, 1), foot: i % 2 ? 'left' : 'right',
}));
const MOSI = [1, 0];
const HER = [MOSI[0] + DIST, 0.5];
const VIEWS = {
  game: { position: [-7, 4.6, -4], target: [10, 2.2, 0], fov: 45 },
  low: { position: [-3.5, 2.2, -1.6], target: [12, 3, 0.5], fov: 45 },
  up: { position: [-5, 2.5, -3], target: [6, 9, 0], fov: 50 },
};
const reduced = () => params.get('reduced') === '1';

export const chapter = {
  id: 'fjall-sky',
  title: 'Skýið (prófun)',
  look: 'lowSun',
  start: 'belt',
  locations: {
    belt: {
      build: world => createBelt(world, { grey: true, prints: PRINTS, printSize: 5, reduced: reduced() }),
      shots: { game: VIEWS.game, low: VIEWS.low, up: VIEWS.up },
    },
  },
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', position: [MOSI[0], 0, MOSI[1]], heading: 0 },
    gramedla: { url: '../assets/characters/trex.glb', position: [HER[0], 0, HER[1]], heading: 180 },
  },
  startShot: VIEW in VIEWS ? VIEW : 'game',
  shots: {},

  *script(s) {
    const mosi = s.actor('mosi').raw;
    const world = mosi.world;
    const belt = world.forest;
    const cloud = belt.cloud;
    lightTo(world, LOOKS.inCloud);
    cloud.setLevel(LEVEL, 0);
    world.chapterState = globalThis.__fjallSky = { belt, cloud }; // for probes
    if (params.get('glow') === '1') cloud.glow({ x: HER[0] + 4, y: 5, z: HER[1] }, 1);
    if (params.get('swirl') === '1') cloud.swirlAt({ x: PRINTS[1].position[0], z: PRINTS[1].position[1] });
    yield s.camera.cut(VIEW in VIEWS ? VIEW : 'game', { check: false });
    yield s.ready();
    yield s.fade(0, 0.3);
    if (params.get('blow') !== '1') { yield s.wait(1e6); return; }
    yield s.wait(BLOW);
    world.chapterState.blowAt = s.time;
    cloud.blowAway({ from: { x: HER[0], y: 0, z: HER[1] } });
    easeLight(world, LOOKS.sunset, 3);
    yield s.wait(6 - BLOW - 0.3);
  },
};
