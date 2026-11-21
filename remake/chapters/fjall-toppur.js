// The mountain's top alone (world/fjall/top.js createTop), as the festival will build it: under the sunset, the sea of cloud round
// it and its western bank rising to the sun. Not a chapter of the book: a page to see the top by (Task 8, and the festival's
// builders after it).
//
//   ?chapter=fjall-toppur&t=2                 the top empty;  friends=1  the six friends standing in their rooms (top.room)
//   view = wide (across the top) | sun (over the rim to the bank and the sun) | rim (low by the rim, the sea of cloud) | high |
//          above_clouds (chapter 6's shot: back over the south-west rim)
//   veil=<0..1>  the last wisp by the south-west rim;  wave=1  a swell runs out over the sea at 1 s;  glow=<0..1>  the sea's glow
import { createTop } from '../world/fjall/top.js';
import { LOOKS } from '../engine/looks.js';
import { lightTo } from '../engine/light-blend.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const VIEW = params.get('view') || 'wide';
const FRIENDS = params.get('friends') === '1';
const CHARS = '../assets/characters/';
const MODELS = { thorsedla: 'brontosaurus', kambedla: 'stegosaurus', uggedla: 'spinosaurus', sloedla: 'parasaurolophus', flugedla: 'pteranodon', gramedla: 'trex' };
// the rooms as top.js lays them (createTop's room; the page needs them before the place is built, so it asks a grey one)
const ROOMS = createTop({ scene: null }, { grey: true });
const room = ROOMS.room;
ROOMS.dispose();
const facing = ([x, z]) => (Math.atan2(-z, -x) * 180) / Math.PI; // toward the middle

const SHOTS = {
  wide: { position: [27, 5, 31], target: [-6, 2, -8], fov: 55 },
  sun: { position: [22, 4.2, 18], target: [-60, -4, -42], fov: 55 },
  rim: { position: [-30, 3.2, 30], target: [-120, -8, 60], fov: 55 },
  high: { position: [70, 60, 70], target: [0, 0, 0], fov: 55 },
  // chapter 6's above_clouds (kafli6-route.js SHOTS.toppur): from on the top, back over the south-west rim and its veil to the sea
  above_clouds: { position: [-11, 4.6, 16], target: [-24, 3.4, 33], fov: 50 },
};

let built = null; // the world the top was built in

export const chapter = {
  id: 'fjall-toppur',
  title: 'Toppurinn',
  look: 'sunset',
  start: 'toppur',
  locations: {
    toppur: { build: world => { built = world; return createTop(world); }, shots: SHOTS },
  },
  actors: FRIENDS ? Object.fromEntries(room.map(({ friend, at }) => [friend, { url: `${CHARS}${MODELS[friend]}.glb`, position: [at[0], 0, at[1]], heading: facing(at) }])) : {},
  startShot: VIEW in SHOTS ? VIEW : 'wide',
  shots: {},

  *script(s) {
    yield s.camera.cut(VIEW in SHOTS ? VIEW : 'wide', { check: false });
    const w = built;
    if (w) lightTo(w, LOOKS.sunset);
    const top = w?.forest;
    if (top) {
      globalThis.__fjallToppur = top; // for probes
      if (params.has('veil')) top.veil.setLevel(Number(params.get('veil')));
      if (params.has('glow')) top.sea.setGlow(Number(params.get('glow')));
    }
    yield s.ready();
    yield s.fade(0, 0.3);
    if (params.get('wave') === '1' && top) { yield s.wait(1); top.sea.wave({ from: [-40, 30], strength: 3, seconds: 5 }); }
    yield s.wait(1e6);
  },
};
