// THROWAWAY check page for chapter 6 (Task 8): the slope (world/fjall/slope.js) on its own, Mosi and Egill where kafli6-route.js's
// STANDS put them, under the chapter's red-gold low sun. Not a chapter: nothing links to it, and it goes before merge.
//
//   ?chapter=fjall-hlid&view=view_east&t=2      view = slope_ride | view_east | clouds_up (kafli6-route.js SHOTS.hlid) | wide
//   glade=1  the glade's lilac glow held on;  grey=1  the grey stage;  at=<s>  the far friends' clock (Þórseðla walks west)
import { createSlope } from '../world/fjall/slope.js';
import { LOOKS } from '../engine/looks.js';
import { lightTo } from '../engine/light-blend.js';
import { createSaddle, ride } from '../engine/riding.js';
import { SHOTS, STANDS, SLOPE } from './kafli6-route.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const VIEW = params.get('view') || 'view_east';
const SHOWS = { ...SHOTS.hlid, wide: { position: [-2330, 300, 260], target: [-2400, 236, 124], fov: 55 } };
// cam=x,y,z,tx,ty,tz,fov: the view's camera moved, to try a shot
if (params.get('cam')) { const [x, y, z, tx, ty, tz, fov] = params.get('cam').split(',').map(Number); SHOWS[params.get('view') || 'view_east'] = { position: [x, y, z], target: [tx, ty, tz], fov }; }
const stand = (STANDS[VIEW] ?? STANDS.view_east).mosi;

export const chapter = {
  id: 'fjall-hlid',
  title: 'Hlíðin (prófun)',
  look: 'lowSun',
  start: 'hlid',
  locations: {
    hlid: { build: world => createSlope(world, { grey: params.get('grey') === '1' }), shots: SHOWS },
  },
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', position: [stand.at[0], 0, stand.at[1]], heading: stand.heading ?? 0 },
    egill: { url: '../assets/characters/egill.glb', position: [stand.at[0], 0, stand.at[1]], heading: stand.heading ?? 0 },
  },
  startShot: VIEW in SHOWS ? VIEW : 'view_east',
  shots: {},

  *script(s) {
    const mosi = s.actor('mosi').raw;
    const world = mosi.world;
    const slope = world.forest;
    const saddle = createSaddle(mosi);
    saddle.show();
    ride(s.actor('egill').raw, saddle, { settle: 0 });
    lightTo(world, LOOKS.redGold);
    if (params.get('glade') === '1') slope.glade?.(true);
    world.chapterState = globalThis.__fjallHlid = { slope, SLOPE };
    yield s.camera.cut(VIEW in SHOWS ? VIEW : 'view_east', { check: false });
    yield s.ready();
    yield s.fade(0, 0.3);
    yield s.wait(1e6);
  },
};
