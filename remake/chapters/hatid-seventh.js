// Stjörnuhátíðin's scene 4 (docs/superpowers/specs/2026-11-21-stjornuhatidin-design.md, "4. Sjöunda stjarnan"): the seventh star and
// the hero butterfly. The scene itself (who walks, who speaks, the cuts) is hatid.js `seventh`; these are its two players.
//
//   SEVENTH              its colour (a hue none of the six friends has), how long it takes to come near and to lift Egill, how
//                        high it lifts him (m over where he stands)
//   createSeventh(c)     the unknown star at SKY.seventh, blinking: { show(level), near(u), light(u), point, place, state(), dispose() }
//                        show: its light 0 to 1; near: 0 where the sky has it, 1 close over the top (growing as it comes); light: its
//                        soft cone falling on Egill (createBeams) and the disc where it lands (createRings), 0 to 1
//   createMoth(world, { horn })  the hero butterfly (assets/critters/butterfly.glb, loaded and posed as chapters/tjorn3d/cast.js does
//                        it): { ready, sitOn(point), follow(point, time), update(time), at, dispose() }; on Mosi's horn from the
//                        festival's first frame, and from the lift flying round Egill as he rises
//
// Nothing here is drawn by hand: the star is the six's own star picture (engine/scene/star-sprite.js, whitened as hatid-stars.js
// does) in its own colour with a light point's halo, the cone and the disc are the stage's own kinds of light.
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { SKY } from './hatid-route.js';
import { whiteStar } from './hatid-stars.js';
import { createStarSprite } from '../engine/scene/star-sprite.js';
import { skyDirection, SKY_DISTANCE } from '../engine/night-sky.js';
import { createBeams } from '../engine/show/beams.js';
import { createRings } from '../engine/show/rings.js';
import { createLightPoints } from '../engine/show/lights.js';
const GROUND = 1.2; // m: the top's ground on its flat (hatid-route.js GROUND), where no heightAt is given

/** The seventh star (first values, the plan's): its hue, its seconds to come near and to lift him, his height in its light (m). */
export const SEVENTH = { colour: '#c8ff5e', seconds: { near: 8, lift: 9 }, height: 14 };
// How it looks: degrees across on the sky where it first shows and when near; how close it comes (m from where Egill stands, along
// SKY.seventh's way, so it stays where the child first saw it); its blink (Hz, and how deep: never a flash, spec's twice a second);
// its cone's width where it lands and the disc there (m), and their light
const LOOK = { far: 2.6, close: 10, distance: 46, blink: { hz: 0.9, depth: 0.3 }, cone: 3.4, disc: 1.9, coneLevel: 0.55, discLevel: 0.6, halo: 3.2 };
const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const rgb = new THREE.Color(SEVENTH.colour);
// as the screen shows it (sRGB 0..1), what beams, rings and light points take
const SRGB = [rgb.r, rgb.g, rgb.b];

/** The seventh star of scene 4, over Egill's place at the gathering (c.stands.gather.egill). */
export function createSeventh(c) {
  const { world } = c;
  const [gx, gz] = c.stands?.gather?.egill?.at ?? [0, 0];
  const heightAt = c.top?.heightAt ?? world.heightAt ?? (() => GROUND);
  const base = new THREE.Vector3(gx, heightAt(gx, gz), gz);
  const way = skyDirection(SKY.seventh.azimuth, SKY.seventh.elevation);
  const star = createStarSprite({ from: new THREE.Vector3() });
  const sprite = star.object;
  sprite.material.map = whiteStar(sprite.material.map);
  sprite.material.color.set(SEVENTH.colour);
  sprite.material.depthTest = true;
  sprite.material.opacity = 0;
  sprite.name = 'Hátíð seventh star';
  sprite.renderOrder = -2;
  sprite.visible = false;
  world.scene.add(sprite);
  const halo = createLightPoints(world, { capacity: 1, name: 'Hátíð seventh halo' });
  const beams = createBeams(world, { capacity: 1, name: 'Hátíð seventh light' });
  const rings = createRings(world, { capacity: 1, name: 'Hátíð seventh disc' });
  const state = { level: 0, near: 0, light: 0 };
  const point = new THREE.Vector3();
  let clock = 0;

  function frame() {
    const k = smooth(state.near);
    const distance = SKY_DISTANCE * (LOOK.distance / SKY_DISTANCE) ** k; // as it comes it seems to come evenly nearer
    point.copy(base).addScaledVector(way, distance);
    const degrees = LOOK.far + (LOOK.close - LOOK.far) * k;
    const size = 2 * distance * Math.tan(THREE.MathUtils.degToRad(degrees) / 2);
    const blink = 1 - LOOK.blink.depth * (0.5 + 0.5 * Math.sin(clock * Math.PI * 2 * LOOK.blink.hz));
    const level = state.level * blink;
    sprite.visible = level > 0.003;
    sprite.position.copy(point);
    sprite.scale.setScalar(size * (1 + 0.04 * Math.sin(clock * 5.3)));
    sprite.material.opacity = Math.min(1, level);
    sprite.material.rotation = 0.12 * Math.sin(clock * 0.9);
    halo.begin();
    halo.add(point.x, point.y, point.z, size * LOOK.halo, ...SRGB, level * 0.8, 0);
    halo.end();
    beams.begin();
    rings.begin();
    if (state.light > 0.003 && state.level > 0.003) {
      const to = [base.x, base.y, base.z];
      beams.beam(point, to, LOOK.cone, ...SRGB, state.light * LOOK.coneLevel);
      rings.disc(base.x, base.y + 0.06, base.z, LOOK.disc, ...SRGB, state.light * LOOK.discLevel);
    }
    beams.end();
    rings.end();
  }
  const effect = { label: 'hátíð seventh star', update(dt) { clock += dt; frame(); return !c.ended && !disposed; } };
  let disposed = false;
  world.effects?.add?.(effect);
  frame();
  return {
    show(level) { state.level = Math.max(0, Math.min(1, level)); frame(); },
    near(u) { state.near = Math.max(0, Math.min(1, u)); frame(); },
    light(u) { state.light = Math.max(0, Math.min(1, u)); frame(); },
    /** Where it is now (a live Vector3), and where it lifts Egill to: SEVENTH.height over his place. */
    point,
    place: { ...SKY.seventh },
    lift: base.clone().add(new THREE.Vector3(0, SEVENTH.height, 0)),
    base,
    colour: SEVENTH.colour,
    state: () => ({ ...state, at: point.toArray() }),
    dispose() {
      disposed = true;
      sprite.removeFromParent();
      star.dispose();
      halo.dispose();
      beams.dispose();
      rings.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The hero butterfly. Its feet on Mosi's right brow horn (chapter 1's POINTS.mosiHorn, the Head bone's frame), its wings opening
// and closing slowly as it sits; from follow()'s time it flies over FLY s to Egill and round him, a loop of LOOP m, its wings beating.
const BUTTERFLY_MODEL = new URL('../assets/critters/butterfly.glb', import.meta.url).href;
export const MOSI_HORN = ['Head', [0.358, 0.618, 0.647]];
const MOTH = { span: 0.42, feet: 0.0756, modelSpan: 0.36, fly: 2.2, loop: 0.85, lapHz: 0.35, up: 0.55 };
const rad = d => (d * Math.PI) / 180;
let loader = null;
const load = (world, url) => (world.loadModel ? world.loadModel(url) : (loader ??= new GLTFLoader()).loadAsync(url));

/** The point on Mosi's horn (a point spec: out => out), from his actor. */
export function hornOf(mosi) {
  const [bone, local] = MOSI_HORN;
  const node = mosi.model.getObjectByName(bone);
  return out => {
    if (!node) return out.copy(mosi.root.position).add(new THREE.Vector3(0, 3, 0));
    node.updateWorldMatrix(true, false);
    return node.localToWorld(out.set(...local));
  };
}

export function createMoth(world, { horn, heading = () => 0 } = {}) {
  const group = new THREE.Group();
  group.name = 'Hátíð moth';
  group.visible = false;
  world.scene.add(group);
  const wings = { L: null, R: null };
  let feet = MOTH.feet, span = MOTH.modelSpan;
  const ready = load(world, BUTTERFLY_MODEL).then(gltf => {
    const model = gltf.scene.clone(true);
    model.traverse(o => { if (o.isMesh) o.castShadow = false; });
    for (const side of ['L', 'R']) wings[side] = model.getObjectByName(`Wing${side}`) ?? null;
    const body = model.getObjectByName('Body');
    feet = body?.userData.feet ?? feet;
    span = body?.userData.span ?? span;
    group.add(model);
  }).catch(error => { console.warn('[hatid] the moth could not be loaded:', error?.message ?? error); });
  const loading = (world.loading ??= new Set());
  loading.add(ready);
  ready.then(() => loading.delete(ready));

  const at = new THREE.Vector3(); // where it is now (its feet / its middle in flight), whether or not its model has come
  const to = new THREE.Vector3(), seat = new THREE.Vector3();
  let mode = { kind: 'sit', point: horn, since: 0 };
  let facing = 0;
  const yaw = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);

  function update(time) {
    let flap;
    if (mode.kind === 'sit') {
      if (!mode.point) return;
      world.resolvePoint?.(mode.point, at) ?? mode.point(at);
      facing = heading();
      flap = 0.35 + 0.35 * Math.sin(time * 1.4);
    } else {
      const age = Math.max(0, time - mode.since);
      const lap = rad(360 * MOTH.lapHz) * age;
      const target = world.resolvePoint?.(mode.point, to) ?? mode.point(to);
      seat.set(target.x + Math.cos(lap) * MOTH.loop, target.y + MOTH.up + 0.25 * Math.sin(age * 1.9), target.z + Math.sin(lap) * MOTH.loop);
      const k = smooth(age / MOTH.fly);
      at.lerpVectors(mode.from, seat, k);
      facing = -(lap * 180) / Math.PI - 90 * k; // along its loop, once it is on it
      flap = 0.25 + 0.75 * Math.abs(Math.sin(time * Math.PI * 2 * 4.5));
    }
    group.visible = true;
    const scale = MOTH.span / span;
    group.scale.setScalar(scale);
    group.quaternion.copy(yaw.setFromAxisAngle(Y, -rad(facing)));
    group.position.copy(at).addScaledVector(Y, feet * scale);
    if (wings.L) wings.L.rotation.x = flap;
    if (wings.R) wings.R.rotation.x = -flap;
  }

  return {
    ready, group, at,
    get mode() { return mode.kind; },
    /** Sits with its feet on `point` (a point spec), from now. */
    sitOn(point) { mode = { kind: 'sit', point, since: 0 }; },
    /** Leaves where it is at `time` and flies round `point` (a point spec: Egill), from then on. */
    follow(point, time) { mode = { kind: 'follow', point, since: time, from: at.clone() }; },
    update,
    dispose() { group.removeFromParent(); },
  };
}
