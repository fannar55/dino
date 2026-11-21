// THROWAWAY check page for chapter 6 (Tasks 5 and 8): the belt of cloud on the mountain's side, proven on the page. Not a chapter:
// nothing links to it, and it goes before merge. Mosi stands in the belt (world/fjall/belt.js) with her prints laid as the chapter
// lays them (kafli6-route.js PRINTS), Grameðla (trex.glb) `dist` m up the way in the cloud, and the camera as asked.
//
//   ?chapter=fjall-sky&level=0.5&at=0&t=2       a still at that level of the cloud (set at once), Mosi at print `at` (0 to 6)
//   size=5|11                                   the prints' size (kafli6-route.js PRINT_SIZE)
//   view=print (the chapter's printShot at `at`) | up (behind Mosi, up the prints) | low | sky (into the cloud's sky) |
//        sun (toward the sun, low) | after (behind him, the way the call left him, after the blow: the bank and the top)
//   blow=1   her roar blows the cloud away at BLOW s;  done=1  as it is once the blow is over;  hop=1  the pebbles hop at 1 s
//   her=0    no Grameðla;  glow=1  the golden glow toward her;  swirl=1  a swirl at the next print;  reduced=1  reduced motion
import { createBelt } from '../world/fjall/belt.js';
import { LOOKS } from '../engine/looks.js';
import { lightTo, easeLight } from '../engine/light-blend.js';
import { createSaddle, ride } from '../engine/riding.js';
import { PRINTS, mosiAt, printShot, callStand, herAt, CLOUD_BY_PRINT } from './kafli6-route.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const SIZE = Number(params.get('size') ?? 5);
const AT = Math.min(6, Math.max(0, Number(params.get('at') ?? 0)));
const LEVEL = params.has('level') ? Number(params.get('level')) : CLOUD_BY_PRINT[AT];
const DIST = Number(params.get('dist') ?? 18);
const BLOW = 1.5;
const VIEW = params.get('view') || 'print';
const WATER = ['none', 'none', 'none', 'pool', 'rippling', 'none'];
const prints = PRINTS.map((p, k) => ({ ...p, water: WATER[k] }));
const deg = Math.PI / 180;
// Mosi's front feet 1 m inside her heel (the heel's back is 0.36 of a print's size behind its middle), his root 2.3 m behind them
const back = SIZE * 0.36 - 1 + 2.3;
const standAt = k => {
  if (k >= 6) return mosiAt(6);
  const m = mosiAt(k);
  const [dx, dz] = [Math.cos(m.heading * deg), Math.sin(m.heading * deg)];
  const [px, pz] = prints[k].position;
  return { x: px - dx * back, z: pz - dz * back, heading: m.heading };
};
const MOSI = standAt(AT);
const fwd = (s, d, r = 0) => [s.x + Math.cos(s.heading * deg) * d - Math.sin(s.heading * deg) * r, s.z + Math.sin(s.heading * deg) * d + Math.cos(s.heading * deg) * r];
const HER = fwd(MOSI, DIST);
const p3 = ([x, z], y) => [x, y, z];
const MEET = callStand(3, []);
// the call's walks, where she stands and the march: nothing grows there (kafli6-route.js will hold this)
function clearSpots() {
  const out = [];
  const ways = ['left', 'ahead', 'right'];
  const walk = (walked) => {
    const r = walked.length;
    const from = callStand(r, walked), stands = [];
    if (r === 3) {
      out.push({ at: fwd(from, 9 + 4.5), r: 6 }, { from: [from.x, from.z], to: fwd(from, 21), r: 5 }, { from: fwd(from, 9, 5), to: fwd(from, 21, 5), r: 3.5 });
      return;
    }
    for (const w of ways) {
      const to = callStand(r + 1, [...walked, w]);
      out.push({ from: [from.x, from.z], to: [to.x, to.z], r: 3.5 });
      if (r === 1) out.push({ at: herAt(from, w, 1), r: 5 });
      stands.push(w);
      walk([...walked, w]);
    }
  };
  walk([]);
  return out;
}
const VIEWS = {
  print: printShot(Math.min(AT, 5)),
  up: { position: p3(fwd(MOSI, -9, -3), 5.2), target: p3(fwd(MOSI, 12), 2.4), fov: 50 },
  low: { position: p3(fwd(MOSI, -4, -1.5), 2.6), target: p3(fwd(MOSI, 12), 3), fov: 50 },
  sky: { position: p3(fwd(MOSI, -5, -2), 3), target: p3(fwd(MOSI, 8), 9), fov: 50 },
  sun: { position: [MOSI.x + 3, 3.4, MOSI.z + 2], target: [MOSI.x + 3 - 40 * 0.82, 2.2, MOSI.z + 2 - 40 * 0.57], fov: 54 },
  after: { position: p3(fwd(MEET, -11, -5), 3.5), target: p3(fwd(MEET, 9), 5.4), fov: 52 },
};
const reduced = () => params.get('reduced') === '1';

export const chapter = {
  id: 'fjall-sky',
  title: 'Skýið (prófun)',
  look: 'lowSun',
  start: 'belt',
  locations: {
    belt: {
      build: world => createBelt(world, { prints, printSize: SIZE, reduced: reduced(), clear: clearSpots() }),
      shots: VIEWS,
    },
  },
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', position: [VIEW === 'after' ? MEET.x : MOSI.x, 0, VIEW === 'after' ? MEET.z : MOSI.z], heading: VIEW === 'after' ? MEET.heading : MOSI.heading },
    egill: { url: '../assets/characters/egill.glb', position: [MOSI.x, 0, MOSI.z], heading: MOSI.heading },
    ...(params.get('her') === '0' ? {} : { gramedla: { url: '../assets/characters/trex.glb', position: VIEW === 'after' ? [fwd(MEET, 9)[0], 0, fwd(MEET, 9)[1]] : [HER[0], 0, HER[1]], heading: (VIEW === 'after' ? MEET.heading : MOSI.heading) + 180 } }),
  },
  startShot: VIEW in VIEWS ? VIEW : 'print',
  shots: {},

  *script(s) {
    const mosi = s.actor('mosi').raw;
    const world = mosi.world;
    const belt = world.forest;
    const cloud = belt.cloud;
    const saddle = createSaddle(mosi);
    saddle.show();
    ride(s.actor('egill').raw, saddle, { settle: 0 });
    lightTo(world, LOOKS.inCloud);
    cloud.setLevel(LEVEL, 0);
    if (VIEW === 'after') belt.summit.place(MEET);
    world.chapterState = globalThis.__fjallSky = { belt, cloud }; // for probes
    if (params.get('glow') === '1') cloud.glow({ x: HER[0], y: 9, z: HER[1] }, 1);
    if (params.get('swirl') === '1') cloud.swirlAt(prints[Math.min(AT + 1, 5)].position);
    yield s.camera.cut(VIEW in VIEWS ? VIEW : 'print', { check: false });
    yield s.ready();
    if (params.get('done') === '1') {
      cloud.blowAway({ from: fwd(MEET, 9), seconds: 0.05 });
      cloud.update(0.1);
      lightTo(world, { ...LOOKS.sunset, fog: { ...LOOKS.sunset.fog, density: Number(params.get('haze') ?? LOOKS.sunset.fog.density) } });
    }
    yield s.fade(0, 0.3);
    if (params.get('hop') === '1') { yield s.wait(1); belt.pebbles.hop(); }
    if (params.get('blow') !== '1') { yield s.wait(1e6); return; }
    yield s.wait(BLOW);
    world.chapterState.blowAt = s.time;
    cloud.blowAway({ from: VIEW === 'after' ? fwd(MEET, 9) : HER });
    easeLight(world, LOOKS.sunset, 3);
    yield s.wait(6 - BLOW - 0.3);
  },
};
