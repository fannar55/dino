// Stjörnuhátíðin (remake/chapters/hatid.js) in grey, played through by children of several kinds (tests/chapter-harness.mjs): one
// who touches nothing; a busy one who taps the stars backwards and then the screen all over through the party; one whose book stands
// open for 30 s in the first dance (with the game's sound); one on an upright tablet that asks for less motion; and the party alone
// on the book's tile (chapters/veisla.js). Its parts have their own tests: the top as data (hatid-route), the three taps (hatid-stars)
// and the song's map (hatid-song).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as hatid from '../chapters/hatid.js';
import * as veisla from '../chapters/veisla.js';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext } from './fake-audio.mjs';
import { topEnd } from '../chapters/kafli6-route.js';
import { ARRIVALS, BUDGET, FRIENDS8, LENGTH as BODY, STAGE, FLOOR, SKY } from '../chapters/hatid-route.js';
import { SEVENTH, hornOf } from '../chapters/hatid-seventh.js';
import { GUESTS, guestSeat, createGuests, hideSpot } from '../chapters/hatid-guests.js';
import { SUNSET, lookAt, HATID_LOOKS } from '../chapters/hatid-looks.js';
import { DRAW_SECONDS } from '../chapters/hatid-stars.js';
import { FJALL } from '../world/fjall/ground.js';
import { BEAT, END_BEAT, secondsAt, CAMERA, PARTY_SOUNDS } from '../chapters/hatid-score.js';
import { SONG } from '../chapters/hatid-song.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { LOOKS } from '../engine/looks.js';

const { chapter, party, WORDS, partyFrame, ALONE, partyTime, TOOT_GAP } = hatid;
const FRAME = 1 / 30;
const LENGTH = secondsAt(END_BEAT) + SONG.song.tail; // the song's file, from its first sound to its last
const BEATS = [8, 100, 200, 300, 360]; // the party's frames compared (the rulings: 360, as 400 is past the end)
const CALLS = { up: 'h_flugedla_up', stomp: 'h_flugedla_stomp', spin: 'h_flugedla_spin', hop: 'h_flugedla_hop' };

const inFrame = (point, camera) => {
  const p = point.clone().project(camera);
  return p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
};

/**
 * The festival played by `child` (taps with the frame's pointer), with what the run sees on the way: the first frame, every aimed
 * target out of frame while its task waits, the handheld, where everyone is as the song starts, the party's frames at BEATS, and
 * the song and the beat each frame while the game is held.
 */
function playIt(module, { aspect = 1.6, reduced = false, child = null, pauses = [], limit = 700, audio = null, savedWith = null } = {}) {
  const seen = { first: null, out: [], aimChecks: 0, handheld: 0, atSong: null, frames: {}, held: [], after: null, saved: null };
  return playUnattended(module, {
    seeking: false, limit, shaped: true, aspect, reduced, pauses, audio,
    savedWith: save => { savedWith?.(save); seen.saved = JSON.stringify(save.get()); },
    onFrame(frame) {
      const { world, director, t } = frame;
      const c = world.chapterState;
      if (!c) return;
      world.camera.updateMatrixWorld();
      if (!seen.first && c.s.time > 0) seen.first = firstFrame(world, c, frame);
      seen.handheld = Math.max(seen.handheld, director.handheldLevel ?? 0);
      const w = c.waiting;
      if (w && c.s.time - w.since >= 1) {
        for (const name of w.names) {
          const spec = c.aims[name];
          if (!spec) continue;
          seen.aimChecks++;
          if (!inFrame(world.resolvePoint(spec, new THREE.Vector3()), world.camera)) seen.out.push(`${name} (${w.task}) at ${c.s.time.toFixed(1)} s`);
        }
      }
      if (c.partyStart != null && !seen.atSong) {
        seen.atSong = Object.fromEntries([...world.actors].map(([name, a]) => [name, { shown: a.root.visible, at: a.root.position.clone() }]));
      }
      if (c.partyStart != null && c.partyBeat != null) {
        for (const beat of BEATS) if (!seen.frames[beat] && c.partyBeat >= beat) seen.frames[beat] = partyFrame(c);
      }
      for (const pause of pauses) {
        if (t >= pause.at + 1 && t < pause.at + pause.seconds - 1) {
          seen.held.push({ beat: c.partyBeat, position: c.song.position, paused: world.sound?.elements.at(-1)?.paused ?? null });
        }
        if (!seen.after && t >= pause.at + pause.seconds + 3) {
          seen.after = { beat: c.partyBeat, position: c.song.position, paused: world.sound?.elements.at(-1)?.paused ?? null, current: world.sound?.elements.at(-1)?.currentTime ?? null };
        }
      }
      // (Task 17) the party's camera: how far it goes in a frame inside one shot (the reduced run's only cuts)
      if (c.partyStart != null && c.partyBeat != null && c.partyBeat >= 0 && c.partyBeat < END_BEAT + SONG.song.tail * SONG.bpm / 60 && c.scene === (seen.partyScene ??= c.scene)) {
        const m = (seen.partyCamera ??= { frames: 0, most: 0, where: null, last: null });
        const now = { shot: c.shotLabel, at: world.camera.position.clone(), turn: world.camera.quaternion.clone(), fov: world.camera.fov };
        if (m.last && m.last.shot === now.shot) {
          const moved = Math.max(now.at.distanceTo(m.last.at), THREE.MathUtils.radToDeg(now.turn.angleTo(m.last.turn)) / 10, Math.abs(now.fov - m.last.fov));
          if (moved > m.most) Object.assign(m, { most: moved, where: `${now.shot} at beat ${c.partyBeat.toFixed(2)}` });
        }
        m.frames++;
        m.last = now;
      }
      watchArrival(world, c, frame, seen);
      watchNight(world, c, seen);
      watchFour(world, c, frame, seen);
      child?.(c, frame, seen);
    },
  }).then(run => ({ ...run, watched: seen }));
}

// Scene 1 as the child sees it, frame by frame: how near the lens each friend's body comes and how much of the frame she hides, the
// big friends each arrival shot holds, what jumps (a step that differs from the frame before's by more than JUMP, or a turn of more
// than JUMP's degrees), when each of the five is first on the top, Þórseðla's head over the sea and her feet, Slóeðla in the frame,
// the guests, Egill on his seat while everyone waves, and the sun's drop with the light.
const NEAR = 4; // m: no friend's body (her joints) nearer the lens (the chunk's ruling 1)
const JUMP = { metres: 0.15, degrees: 8 };
const FIVE = ARRIVALS.map(a => a.friend);
const BIG = FRIENDS8.filter(who => who !== 'egill');
const FEET = { thorsedla: ['BackFootL', 'BackFootR', 'FrontFootL', 'FrontFootR'] };
const jointsOf = new WeakMap();
const turnOf = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
function watchArrival(world, c, { sunFace }, seen) {
  if (c.scene !== 'arrival' || !c.top) return;
  const a = (seen.arrival ??= { frames: 0, near: [], halves: [], big: {}, jumps: [], last: new Map(), onTop: {}, thorsedla: { headOver: null, feet: null, highest: 0 }, sloedlaSeen: null, seat: 0, drops: [] });
  a.frames++;
  const camera = world.camera;
  camera.updateMatrixWorld();
  const time = c.s.time;
  const shot = c.shotLabel;
  const v = new THREE.Vector3();
  const sea = FJALL.top.sea;
  const on = (x, z) => Math.hypot(x, z) <= c.top.radius;
  // Kambeðla's light in the cloud (top.sea.light): how full it gets in her shot, how wide its lit middle (out to 0.65 of its radius,
  // where it is half) stands in the frame there, and anything of it in any other shot
  const spot = c.top.sea?.spot;
  if (spot) {
    if (shot === 'arrive_kambedla') {
      a.spotMost = Math.max(a.spotMost ?? 0, spot.level);
      if (spot.level > 0.9) {
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize().multiplyScalar(spot.radius * 0.65);
        const middle = new THREE.Vector3(spot.at[0], sea + 2, spot.at[1]);
        const [l, r] = [middle.clone().sub(right).project(camera), middle.clone().add(right).project(camera)];
        const wide = (Math.min(1, Math.max(l.x, r.x)) - Math.max(-1, Math.min(l.x, r.x))) / 2;
        a.spotWide = Math.min(a.spotWide ?? Infinity, wide);
      }
    } else a.spotElsewhere = Math.max(a.spotElsewhere ?? 0, spot.level);
  }
  let bigs = 0;
  for (const who of FRIENDS8) {
    const actor = world.actors.get(who);
    if (!actor.root.visible) { a.last.delete(who); continue; }
    actor.root.updateMatrixWorld(true);
    if (!jointsOf.has(actor)) { const bones = []; actor.model.traverse(o => { if (o.isBone) bones.push(o); }); jointsOf.set(actor, bones); }
    let nearest = Infinity;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const top = new THREE.Vector3(0, -Infinity, 0); // her highest joint
    let joints = 0, shown = 0; // her joints, and those on the screen
    for (const bone of jointsOf.get(actor)) {
      bone.getWorldPosition(v);
      if (v.y > top.y) top.copy(v);
      nearest = Math.min(nearest, v.distanceTo(camera.position));
      const p = v.project(camera);
      joints++;
      if (p.z < 1 && p.z > -1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1) shown++;
      if (p.z >= 1 || p.z <= -1) continue;
      box[0] = Math.min(box[0], Math.max(-1, p.x)); box[1] = Math.min(box[1], Math.max(-1, p.y));
      box[2] = Math.max(box[2], Math.min(1, p.x)); box[3] = Math.max(box[3], Math.min(1, p.y));
    }
    const hides = box[2] > box[0] && box[3] > box[1] ? ((box[2] - box[0]) * (box[3] - box[1])) / 4 : 0;
    if (nearest < NEAR) a.near.push(`${who} ${nearest.toFixed(2)} m from the lens in ${shot} at ${time.toFixed(1)} s`);
    if (hides > 0.5) a.halves.push(`${who} hides ${(hides * 100).toFixed(0)} % of ${shot} at ${time.toFixed(1)} s`);
    const head = actor.headPosition(new THREE.Vector3());
    const h = head.clone().project(camera);
    const inFrame = h.z < 1 && Math.abs(h.x) <= 1 && Math.abs(h.y) <= 1;
    if (BIG.includes(who) && inFrame) bigs++;
    // each of the five as the child sees her in her own two shots: her head on the screen, how much of her is, and how far she is
    // turned from the lens (0: looking at it; her forward way against the way from her head to the lens, on the level)
    if (FIVE.includes(who) && (shot === `arrive_${who}` || shot === `home_${who}`)) {
      const ahead = new THREE.Vector3(1, 0, 0).applyQuaternion(actor.root.quaternion).setY(0).normalize();
      const toLens = camera.position.clone().sub(head).setY(0).normalize();
      ((a.view ??= {})[who] ??= []).push({ time, shot, x: h.x, y: h.y, front: h.z < 1, whole: shown / Math.max(1, joints), turned: THREE.MathUtils.radToDeg(ahead.angleTo(toLens)) });
    }
    // her sign seen in her own shot: her head in the frame (not at its very edge), over the cloud, and the top's ground nowhere over
    // the line from the lens to it (its shoulder hid all of them in the first stills). Kambeðla's sign is her lit plates, which stand
    // some 1.5 m over her back's highest joint: hers is that joint, up to 1.5 m under the cloud's top.
    const sign = who === 'kambedla' ? top : head;
    const s = who === 'kambedla' ? top.clone().project(camera) : h;
    if (shot === `arrive_${who}` && s.z < 1 && Math.abs(s.x) <= 0.92 && Math.abs(s.y) <= 0.85 && sign.y > sea + (who === 'kambedla' ? -1.5 : 0.3)) {
      let clear = true;
      for (let i = 1; i < 40 && clear; i++) {
        v.lerpVectors(camera.position, sign, i / 40);
        if (v.y < c.top.heightAt(v.x, v.z)) clear = false;
      }
      if (clear) (a.signSeen ??= {})[who] = (a.signSeen[who] ?? 0) + 1;
    }
    // what jumps (her heading from her root's forward way: a banked flier's Euler angles flip)
    const at = actor.root.position.clone();
    const ahead = new THREE.Vector3(1, 0, 0).applyQuaternion(actor.root.quaternion);
    const heading = THREE.MathUtils.radToDeg(Math.atan2(ahead.z, ahead.x));
    const was = a.last.get(who);
    if (was) {
      const step = at.clone().sub(was.at);
      if (was.step && step.distanceTo(was.step) > JUMP.metres) a.jumps.push(`${who} jumps ${step.distanceTo(was.step).toFixed(2)} m at ${time.toFixed(2)} s (${shot})`);
      if (turnOf(heading, was.heading) > JUMP.degrees) a.jumps.push(`${who} turns ${turnOf(heading, was.heading).toFixed(1)} degrees in a frame at ${time.toFixed(2)} s`);
      a.last.set(who, { at, step, heading });
    } else a.last.set(who, { at, step: null, heading });
    // first on the top: her root on the flat, on its ground, not sunk
    if (FIVE.includes(who) && a.onTop[who] == null && on(at.x, at.z) && at.y >= c.top.heightAt(at.x, at.z) - 0.3 && actor.model.position.y > -0.05) a.onTop[who] = time;
    if (who === 'thorsedla') {
      const t = a.thorsedla;
      const feetOn = FEET.thorsedla.some(name => { const foot = actor.model.getObjectByName(name).getWorldPosition(v); return on(foot.x, foot.z) && foot.y >= c.top.heightAt(foot.x, foot.z) - 0.5; });
      if (feetOn && t.feet == null) t.feet = time;
      if (t.feet == null) {
        if (head.y > sea + 0.5 && t.headOver == null) t.headOver = time;
        t.highest = Math.max(t.highest, head.y - sea);
      }
    }
    if (who === 'sloedla' && a.sloedlaSeen == null && inFrame && head.y > sea + 0.3) a.sloedlaSeen = time;
  }
  if (/^(arrive|home)_/.test(shot ?? '')) a.big[shot] = Math.max(a.big[shot] ?? 0, bigs);
  for (const g of c.guests?.where?.() ?? []) {
    const key = `${g.group} ${g.k}`;
    const was = a.last.get(key);
    if (!g.shown) { a.last.delete(key); continue; }
    if (was) {
      const step = g.at.clone().sub(was.at);
      if (was.step && step.distanceTo(was.step) > JUMP.metres) a.jumps.push(`the ${key} jumps ${step.distanceTo(was.step).toFixed(2)} m at ${time.toFixed(2)} s`);
      a.last.set(key, { at: g.at.clone(), step });
    } else a.last.set(key, { at: g.at.clone(), step: null });
  }
  if (c.waving) a.seat = Math.max(a.seat, world.actors.get('egill').root.position.distanceTo(c.seat.update()));
  a.drops.push({ at: time, drop: sunFace.dropDeg, look: world.lightLook });
}

// Scene 2 as the child sees it, frame by frame: what gives light in the dark and how Kambeðla's plates beat, everyone's head as
// Þórseðla sees the first star, the first star's light, where the guests and Mosi are as she roars, each constellation as it is
// drawn whole, the hundreds of stars, Egill's float down, and the moon.
const LIGHTS = ['PointLight', 'SpotLight', 'RectAreaLight'];
function watchNight(world, c, seen) {
  if (c.scene !== 'stars') return;
  const n = (seen.night ??= { dark: [], heads: [], first: [], roar: null, whole: {}, many: [], egill: [], atMoon: null, moon: [], logs: 0 });
  const time = c.s.time;
  const shot = c.shotLabel;
  const fresh = c.chapterLog.slice(n.logs);
  n.logs = c.chapterLog.length;
  const roared = c.chapterLog.some(e => e.type === 'roared');
  if (!roared) {
    const lights = [];
    world.scene.traverse(o => { if (LIGHTS.includes(o.type) && o.visible && o.intensity > 0) lights.push(o.name || o.type); });
    n.dark.push({ time, shot, plates: c.plateLevel ?? null, lights, spot: c.top.sea?.spot?.level ?? 0, look: world.lightLook });
  }
  if (shot === 'first_star') {
    const heads = Object.fromEntries([...world.actors].filter(([, a]) => a.root.visible).map(([who, a]) => [who, a.headPosition(new THREE.Vector3()).y]));
    n.heads.push({ time, heads });
    n.first.push({ time, light: c.night?.starAt(0).light ?? null });
  }
  for (const e of fresh) {
    if (e.type === 'roared') {
      const at = actor => { const p = world.actors.get(actor).root.position; return [p.x, p.z]; };
      n.roar = { time, mosi: at('mosi'), mosiHeading: world.actors.get('mosi').heading, her: at('gramedla'), guests: (c.guests?.where() ?? []).filter(g => g.shown).map(g => ({ key: `${g.group} ${g.k}`, at: [g.at.x, g.at.z] })) };
    }
    if (e.type === 'drawn') n.whole[e.friend] = { time, lines: c.figures.linesOf(e.friend).map(l => l.shown) };
    if (e.type === 'moon' && e.act === 'peek') {
      const egill = world.actors.get('egill').root.position, mosi = world.actors.get('mosi').root.position;
      n.atMoon = { time, apart: Math.hypot(egill.x - mosi.x, egill.z - mosi.z), up: egill.y - world.heightAt(egill.x, egill.z), riding: Boolean(c.riding) };
    }
  }
  n.many.push({ time, many: c.many ?? 0 });
  if (shot === 'egill_down') {
    const egill = world.actors.get('egill').root.position;
    n.egill.push({ time, y: egill.y, ground: world.heightAt(egill.x, egill.z), floating: Boolean(c.floating) });
  }
  if (c.moon) n.moon.push({ time, rise: c.moon.pose.rise, mouth: c.moon.pose.mouth });
}

// (Task 18) Scene 4 and the moth, frame by frame: the moth and Mosi's horn from the first frame; from the song's end Egill, Mosi,
// the seventh star, the moon's mouth, each constellation's turn toward the seventh (degrees between her neck-to-star and her
// neck-to-it on the sky) and the black.
const HORN = hornOf;
/** The way from sky place p to sky place q as it leaves p (a great circle's bearing, radians). */
const bearing = (p, q) => {
  const r = Math.PI / 180, d = (q.azimuth - p.azimuth) * r, e1 = p.elevation * r, e2 = q.elevation * r;
  return Math.atan2(Math.sin(d) * Math.cos(e2), Math.cos(e1) * Math.sin(e2) - Math.sin(e1) * Math.cos(e2) * Math.cos(d));
};
function watchFour(world, c, { ui }, seen) {
  const f = (seen.four ??= { moth: [], frames: [] });
  if (c.moth && world.actors.get('mosi')) {
    const horn = world.resolvePoint(HORN(world.actors.get('mosi')), new THREE.Vector3());
    const egill = world.actors.get('egill').centre(new THREE.Vector3());
    f.moth.push({ time: c.s.time, scene: c.scene, horn: c.moth.at.distanceTo(horn), egill: c.moth.at.distanceTo(egill) });
  }
  if (c.scene !== 'seventh' && c.scene !== 'end') return;
  const turns = {};
  if (c.figures) {
    for (const { key } of FRIENDS) {
      try {
        const p = c.figures.lookPivotOf(key), q = c.figures.starOf(key);
        const a = bearing(p, q), b = bearing(p, SKY.seventh); // on the sphere, from her neck's base
        turns[key] = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(a - b), Math.cos(a - b))));
      } catch { /* not in the sky */ }
    }
  }
  f.frames.push({
    time: c.s.time, egill: world.actors.get('egill').root.position.clone(), mosi: world.actors.get('mosi').root.position.clone(),
    seventh: c.seventh?.state() ?? null, mouth: c.moon?.pose?.mouth ?? null, turns, black: ui?.fadeLevel ?? 0,
  });
}

function firstFrame(world, c, { sunFace }) {
  const her = world.actors.get('gramedla'), mosi = world.actors.get('mosi'), egill = world.actors.get('egill');
  return {
    end: topEnd(world.forest), her: { at: her.root.position.clone(), heading: her.heading }, mosi: { at: mosi.root.position.clone(), heading: mosi.heading },
    egill: egill.root.position.distanceTo(c.seat.update()), look: world.lightLook, cap: sunFace.capOn, location: world.location,
  };
}

// The busy child: the stars backwards (the book's last friend first) a second after each is wanted, and from the party's start the
// screen all over every 0.7 s (no target there, and the names of the taps before, which are no longer targets).
const BACKWARDS = FRIENDS.map(f => f.key).reverse();
function busyChild(c, frame, seen) {
  // and while the stars still fly out of the book, a tap on each of them every 0.1 s (they are not to be lit yet)
  if (c.launching && c.s.time - (seen.lastFlying ?? -Infinity) >= 0.1) {
    seen.lastFlying = c.s.time;
    seen.flyingTaps = (seen.flyingTaps ?? 0) + 1;
    frame.pointer.tap(`star-${BACKWARDS[seen.flyingTaps % BACKWARDS.length]}`, { x: 640, y: 200 });
  }
  const w = c.waiting;
  if (w?.task === 'stars' && c.s.time - w.since >= 1 && c.s.time - (seen.lastStar ?? -Infinity) >= 1) {
    const next = BACKWARDS.find(friend => !c.starTask.state().lit.includes(friend));
    if (next) {
      seen.lastStar = c.s.time;
      frame.pointer.tap(`star-${next}`, { x: 640, y: 200 });
    }
  }
  if (c.partyStart == null) return;
  if (c.s.time - (seen.lastTap ?? -Infinity) < 0.7) return;
  seen.lastTap = c.s.time;
  seen.partyTaps = (seen.partyTaps ?? 0) + 1;
  const k = seen.partyTaps;
  frame.pointer.tap([null, 'sun', 'gramedla', 'star-kambedla'][k % 4], { x: (k * 211) % 1280, y: (k * 97) % 800 });
}

const once = new Map();
const play = (name, make) => {
  if (!once.has(name)) once.set(name, make());
  return once.get(name);
};
const untouched = () => play('untouched', () => playIt(hatid));
const busy = () => play('busy', () => playIt(hatid, { child: busyChild }));
const upright = () => play('upright calm', () => playIt(hatid, { aspect: 0.625, reduced: true }));
const paused = async () => {
  const base = await untouched();
  const start = base.world.chapterState.partyStart; // the run's seconds are the scene's when nothing stood still before
  return play('paused', () => playIt(hatid, { audio: createFakeContext({ state: 'running' }), pauses: [{ at: start + secondsAt(80), seconds: 30 }] }));
};
const EARNED = ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla', 'k5_sloedla', 'k6_gramedla'];
const tile = () => play('tile', () => playIt({ ...veisla }, {
  limit: ALONE.fadeIn + ALONE.toot + LENGTH + 4, audio: createFakeContext({ state: 'running' }),
  savedWith: save => EARNED.forEach(id => save.addStar(id)),
}));

const logOf = (run, type) => run.world.chapterState.chapterLog.filter(e => e.type === type);
const tasks = (run, task, type) => run.world.chapterState.taskLog.filter(e => e.task === task && (!type || e.type === type));
const ended = (run, what) => {
  const { task, stage, world } = run;
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.equal(task.done, true, `${what}: still going at ${stage.s.time.toFixed(1)} s`);
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), ['arrival', 'stars', 'party', 'seventh', 'end'], what);
};
/** The party's log relative to its start: what, and on which beat it fell (seconds from its start, as beats of the map). */
const partyLog = run => {
  const c = run.world.chapterState;
  return c.partyLog.map(e => ({ what: [e.type, e.shot ?? e.id ?? e.kind ?? e.move ?? ''].join(' '), beat: e.beat, off: e.at - c.partyStart }));
};
function sameLog(mine, theirs, what) {
  assert.ok(theirs.length > 200, `${what}: ${theirs.length} things in the party`);
  assert.deepEqual(mine.map(e => `${e.what} ${e.beat}`), theirs.map(e => `${e.what} ${e.beat}`), what);
  const late = mine.filter((e, k) => Math.abs(e.off - theirs[k].off) > FRAME + 1e-6);
  assert.deepEqual(late.slice(0, 5), [], `${what}: each in the same frame`);
}
const angle = (a, b) => THREE.MathUtils.radToDeg(new THREE.Quaternion(...a).angleTo(new THREE.Quaternion(...b)));
function sameFrames(a, b, what) {
  for (const beat of BEATS) {
    const [x, y] = [a[beat], b[beat]];
    assert.ok(x && y, `${what}: a frame at beat ${beat}`);
    for (const who of Object.keys(y.actors)) {
      const [p, q] = [x.actors[who], y.actors[who]];
      assert.ok(Math.hypot(...p.at.map((v, i) => v - q.at[i])) < 0.01, `${what} beat ${beat}: ${who} at ${p.at} not ${q.at}`);
      assert.ok(Math.abs(p.heading - q.heading) < 0.5, `${what} beat ${beat}: ${who} faces ${p.heading}`);
      for (const bone of ['Head', 'Neck', 'Tail1']) {
        if (!q.bones[bone]) continue;
        assert.ok(angle(p.bones[bone], q.bones[bone]) < 1, `${what} beat ${beat}: ${who}'s ${bone} ${angle(p.bones[bone], q.bones[bone]).toFixed(2)} degrees off`);
      }
    }
    for (const key of ['position', 'target']) assert.ok(Math.hypot(...x.camera[key].map((v, i) => v - y.camera[key][i])) < 0.01, `${what} beat ${beat}: the camera's ${key}`);
    assert.deepEqual(x.stage, y.stage, `${what} beat ${beat}: the stage`);
  }
}

// -----------------------------------------------------------------------------------------------

test('nobody touching: from the arrival to Egill lifting takes under 10½ minutes, and the festival plays to its end', async () => {
  const run = await untouched();
  ended(run, 'untouched');
  const [lifted] = logOf(run, 'lifted');
  assert.ok(lifted, 'Egill lifts');
  assert.ok(lifted.at < 630, `lifted at ${lifted.at.toFixed(1)} s`);
  assert.deepEqual(run.director.warnings, [], 'the director');
  assert.equal(run.book.opened.at(-1)?.[0], 'dinosaurs', 'it ends in the book, on its dinosaurs');
  assert.deepEqual(run.save.get().stars, [], 'and gives no star');
});

test('nobody touching: the sun waves, she roars and all six stars light, each on its help; all eight are on the top when the song starts', async () => {
  const run = await untouched();
  for (const task of ['sun', 'roar']) {
    const [go] = tasks(run, task, 'go');
    assert.equal(go?.by, 'help', `${task}: by the help`);
    const [want] = tasks(run, task, 'want');
    assert.ok(Math.abs(go.at - want.at - 12) < 0.1, `${task}: 12 s after it was wanted`);
    assert.equal(tasks(run, task, 'help').length, 1, `${task}: one hint`);
  }
  const lights = tasks(run, 'stars', 'light');
  assert.deepEqual(lights.map(e => e.friend), FRIENDS.map(f => f.key), 'the six, in the book\'s order');
  assert.ok(lights.every(e => e.by === 'help'));
  assert.equal(tasks(run, 'stars', 'all').length, 1);
  assert.equal(logOf(run, 'wave').length, 1, 'the sun waved');
  assert.equal(logOf(run, 'roared').length, 1, 'she roared');
  const at = run.watched.atSong;
  assert.deepEqual(Object.keys(at).sort(), ['egill', 'flugedla', 'gramedla', 'kambedla', 'mosi', 'sloedla', 'thorsedla', 'uggedla']);
  for (const [who, { shown, at: p }] of Object.entries(at)) {
    assert.ok(shown, `${who} shows`);
    assert.ok(Math.hypot(p.x, p.z) < 45, `${who} on the top (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
});

test('the first frame is chapter 6\'s last: Grameðla and Mosi within 0.1 m and 2 degrees of topEnd, Egill on her head, LOOKS.sunset, the sun in its cap', async () => {
  const { first } = (await untouched()).watched;
  assert.equal(first.location, 'toppur');
  for (const who of ['her', 'mosi']) {
    const end = first.end[who];
    assert.ok(Math.hypot(first[who].at.x - end.at[0], first[who].at.z - end.at[1]) < 0.1, `${who} at topEnd`);
    assert.ok(Math.abs(((first[who].heading - end.heading + 540) % 360) - 180) < 2, `${who} faces topEnd's way`);
  }
  assert.ok(first.egill < 0.05, `Egill ${first.egill.toFixed(3)} m from the seat on her head`);
  assert.equal(first.look, LOOKS.sunset);
  assert.equal(first.cap, 1);
});

test('the five come in the spec\'s order, 15 s apart, each with her line', async () => {
  const run = await untouched();
  const comes = logOf(run, 'arrive');
  assert.deepEqual(comes.map(e => e.friend), ARRIVALS.map(a => a.friend));
  for (let k = 1; k < comes.length; k++) assert.ok(Math.abs(comes[k].at - comes[k - 1].at - 15) < 0.1, `${comes[k].friend} ${(comes[k].at - comes[k - 1].at).toFixed(2)} s after`);
  comes.forEach(({ friend, at }) => {
    const { line } = ARRIVALS.find(a => a.friend === friend);
    const said = run.seen.said.find(e => e.id === line);
    assert.ok(said && said.at > at && said.at < at + 15, `${friend} says ${line} in her 15 s`);
  });
});

test('each friend is known before she is seen: the plates\' glow, the sail, the head, the horn and the speck come 2 s or more before her body is on the top', async () => {
  const run = await untouched();
  const { onTop } = run.watched.arrival;
  const signs = logOf(run, 'sign');
  assert.deepEqual(signs.map(e => [e.friend, e.sign]), [['flugedla', 'speck'], ['kambedla', 'glow'], ['uggedla', 'sail'], ['thorsedla', 'head'], ['sloedla', 'horn']]);
  for (const { friend, at } of signs) {
    assert.ok(onTop[friend] != null, `${friend} comes onto the top`);
    assert.ok(onTop[friend] - at >= 2, `${friend}: her sign at ${at.toFixed(1)} s, she on the top at ${onTop[friend].toFixed(1)} s`);
  }
});

test('Þórseðla\'s head is over the sea before any of her feet are on the top; Slóeðla\'s note sounds before she is in frame', async () => {
  const run = await untouched();
  const { thorsedla, sloedlaSeen } = run.watched.arrival;
  assert.ok(thorsedla.headOver != null && thorsedla.feet != null && thorsedla.headOver < thorsedla.feet, `her head over the sea at ${thorsedla.headOver}, her feet on the top at ${thorsedla.feet}`);
  assert.ok(thorsedla.highest >= 8.5, `her head ${thorsedla.highest.toFixed(1)} m over the sea before she sets foot on the top`);
  const [horn] = logOf(run, 'sound').filter(e => e.name === 'sloedlaHorn' && e.scene === 'arrival');
  assert.ok(horn, 'her horn in the arrival');
  assert.ok(sloedlaSeen != null && horn.at < sloedlaSeen, `her note at ${horn?.at.toFixed(1)} s, she in frame at ${sloedlaSeen?.toFixed(1)} s`);
});

test('the guests come with their friends: the flyers with Flugeðla, frogs, turtles and lizards with Uggeðla, the grazers with Slóeðla; none stands in a friend\'s stand or on the floor', async () => {
  const run = await untouched();
  assert.deepEqual(GUESTS, { flyers: 6, frogs: 5, turtles: 3, lizards: 6, grazers: 3 });
  assert.equal(Object.values(GUESTS).reduce((a, b) => a + b, 0), BUDGET.guests);
  const comes = Object.fromEntries(logOf(run, 'arrive').map(e => [e.friend, e.at]));
  const WITH = { flyers: 'flugedla', frogs: 'uggedla', turtles: 'uggedla', lizards: 'uggedla', grazers: 'sloedla' };
  const [want] = tasks(run, 'sun', 'want');
  for (const [group, friend] of Object.entries(WITH)) {
    const coming = logOf(run, 'guests').filter(e => e.group === group && e.phase === 'coming');
    const there = logOf(run, 'guests').filter(e => e.group === group && e.phase === 'there');
    assert.equal(coming.length, 1, `the ${group} come once`);
    assert.ok(coming[0].at >= comes[friend] && coming[0].at < comes[friend] + 15, `the ${group} come in ${friend}'s 15 s`);
    assert.ok(there[0]?.at <= want.at, `the ${group} are in their seats by the sun's tap`);
  }
  const { stands, top } = run.world.chapterState;
  for (const [group, n] of Object.entries(GUESTS)) {
    for (let k = 0; k < n; k++) {
      const { at } = guestSeat(group, k);
      const out = Math.hypot(...at);
      assert.ok(out > FLOOR.radius && out <= top.radius, `the ${group} ${k} on the rim, off the floor (${out.toFixed(1)} m out)`);
      assert.ok(Math.hypot(at[0] - STAGE.centre[0], at[1] - STAGE.centre[1]) >= STAGE.radius + 1, `the ${group} ${k} off the stage`);
      for (const [scene, s] of Object.entries(stands)) {
        if (scene === 'start') continue;
        for (const [who, stand] of Object.entries(s)) {
          if (stand.on) continue;
          const d = Math.hypot(at[0] - stand.at[0], at[1] - stand.at[1]);
          assert.ok(d >= BODY[who] / 2 + 0.5, `the ${group} ${k} in ${who}'s ${scene} stand (${d.toFixed(1)} m)`);
        }
      }
    }
  }
});

test('the sun waves with both hands when tapped, and everyone on the top waves with it', async () => {
  const run = await untouched();
  const [go] = tasks(run, 'sun', 'go');
  const waves = logOf(run, 'wave');
  assert.equal(waves.length, 1);
  assert.equal(waves[0].both, true, 'both hands');
  assert.ok(Math.abs(waves[0].at - go.at) < 0.1, 'as it is tapped');
  const with_ = logOf(run, 'waveWith');
  assert.deepEqual(with_.map(e => e.who).sort(), [...FRIENDS8].sort(), 'all eight');
  for (const e of with_) assert.ok(e.at - waves[0].at >= -1e-6 && e.at - waves[0].at < 0.5, `${e.who} waves with it`);
  assert.equal(with_.find(e => e.who === 'egill').how, 'wave', 'Egill with his own wave');
  assert.ok(run.watched.arrival.seat < 0.05, `Egill keeps his seat on her head (${run.watched.arrival.seat.toFixed(3)} m off it)`);
});

test('the sun goes under in SUNSET.seconds and the light is dark when it has; the music is at 0 from then to the song', async () => {
  const run = await untouched();
  const { drops } = run.watched.arrival;
  const from = drops.find(d => d.drop > 0);
  const under = drops.find(d => d.drop >= SUNSET.under - 1e-6);
  assert.ok(from && under, 'it sinks all the way');
  assert.ok(Math.abs(under.at - from.at - SUNSET.seconds) <= 2 * FRAME, `under in ${(under.at - from.at).toFixed(2)} s`);
  const dark = lookAt(3);
  for (const [part, key] of [['sun', 'color'], ['sky', 'zenith'], ['sky', 'horizon'], ['fog', 'color']]) assert.equal(under.look[part][key], dark[part][key], `the light's ${part}.${key} is the dark's`);
  assert.equal(under.look.hemi.intensity, dark.hemi.intensity);
  const music = logOf(run, 'music');
  const quiet = music.findIndex(e => e.level === 0);
  assert.ok(quiet >= 0, 'the music goes');
  assert.ok(Math.abs(music[quiet].at - from.at) <= FRAME + 1e-6 && Math.abs(music[quiet].seconds - SUNSET.seconds) < 1e-9, 'to 0 over the sinking');
  assert.deepEqual(music.slice(quiet + 1).map(e => e.level), [], 'and nothing more till the song');
  const [song] = logOf(run, 'party');
  assert.ok(song.at > under.at);
  // the wind alone after it: 4 s and more of nothing but the wind before scene 2
  const stars = run.world.chapterTimeline.find(m => m.scene === 'stars');
  assert.ok(stars.at - under.at >= 4 - FRAME, `${(stars.at - under.at).toFixed(1)} s of wind alone`);
  assert.ok(!run.seen.said.some(e => e.at > under.at + 0.5 && e.at < stars.at), 'no line in it');
});

test('nothing of anyone jumps more than 8 degrees or 0.15 m in a frame through the arrival', async () => {
  const run = await untouched();
  assert.ok(run.watched.arrival.frames > 3000, `${run.watched.arrival.frames} frames`);
  assert.deepEqual(run.watched.arrival.jumps.slice(0, 8), []);
});

test('no arrival shot holds more than three big friends', async () => {
  for (const run of [await untouched(), await upright()]) {
    const { big } = run.watched.arrival;
    assert.deepEqual(Object.keys(big).sort(), ARRIVALS.flatMap(a => [`arrive_${a.friend}`, `home_${a.friend}`]).sort());
    for (const [shot, n] of Object.entries(big)) assert.ok(n <= 3, `${shot} holds ${n}`);
  }
});

test('nobody walks through the lens: in every frame of the arrival no friend\'s body is within 4 m of the camera and none hides more than half the frame', async () => {
  for (const [what, run] of [['wide', await untouched()], ['upright', await upright()]]) {
    assert.deepEqual(run.watched.arrival.near.slice(0, 6), [], what);
    assert.deepEqual(run.watched.arrival.halves.slice(0, 6), [], what);
    // and each of the five is seen in her own shot (her head in its frame, over the cloud, nothing of the top before it) 2 s or more
    for (const who of FIVE) assert.ok((run.watched.arrival.signSeen?.[who] ?? 0) >= 60, `${who} seen ${run.watched.arrival.signSeen?.[who] ?? 0} frames in arrive_${who} (${what})`);
  }
});

test('each friend is in frame, head and all, when she says her line, wide and upright: in her home shot, her head in the middle 80 %, nine tenths of her on the screen, turned to the lens', async () => {
  for (const [what, run] of [['wide', await untouched()], ['upright', await upright()]]) {
    for (const { friend, line } of ARRIVALS) {
      const said = run.seen.said.find(e => e.id === line);
      assert.ok(said, `${friend}'s line said (${what})`);
      const view = run.watched.arrival.view?.[friend]?.find(f => f.time >= said.at - 1e-6);
      assert.ok(view, `${friend} watched when her line begins (${what})`);
      const where = `${friend} at ${said.at.toFixed(2)} s (${what}): ${view.shot}, head ${view.x.toFixed(2)}, ${view.y.toFixed(2)}, ${(view.whole * 100).toFixed(0)} % on the screen, turned ${view.turned.toFixed(0)} degrees`;
      assert.equal(view.shot, `home_${friend}`, where);
      assert.ok(view.front && Math.abs(view.x) <= 0.8 && Math.abs(view.y) <= 0.8, where);
      assert.ok(view.whole >= 0.9, where);
      assert.ok(view.turned <= 70, where);
    }
  }
});

test('Kambeðla\'s sign reads: the cloud over her lights lilac to full in her shot, its lit middle a tenth of the frame\'s width or more at both sizes, and no light in the cloud in any other shot', async () => {
  for (const [what, run] of [['wide', await untouched()], ['upright', await upright()]]) {
    const { spotMost, spotWide, spotElsewhere } = run.watched.arrival;
    assert.ok(spotMost > 0.99, `${what}: the light at most ${spotMost}`);
    assert.ok(spotWide >= 0.1, `${what}: its lit middle ${(spotWide * 100).toFixed(1)} % of the frame's width`);
    assert.equal(spotElsewhere ?? 0, 0, `${what}: light in the cloud outside her shot`);
  }
});

test('a child who taps the stars backwards hears the six tones rise all the same, and each star takes its own friend\'s colour', async () => {
  const run = await busy();
  ended(run, 'busy');
  const lights = tasks(run, 'stars', 'light');
  assert.deepEqual(lights.map(e => e.friend), BACKWARDS, 'lit as tapped');
  assert.ok(lights.every(e => e.by === 'child'));
  const tones = logOf(run, 'tone');
  assert.deepEqual(tones.map(e => e.n), [0, 1, 2, 3, 4, 5]);
  for (let k = 1; k < tones.length; k++) {
    assert.ok(tones[k].rate > tones[k - 1].rate, 'each tone higher');
    assert.ok(tones[k].at >= tones[k - 1].at + 0.25 - 1e-6, 'and after the one before');
  }
  const stars = run.world.chapterState.stars;
  for (const { key, colour } of FRIENDS) assert.equal(`#${stars[key].sprite.material.color.getHexString()}`, colour, `${key}'s star in her colour`);
});

// ---- scene 2: the dark, the roar, the stars out of the book, the moon ----
const lineAt = (run, id) => run.seen.said.find(e => e.id === id);

test('in the dark only Kambeðla\'s plates give light, beating 45 to 55 times a minute', async () => {
  for (const [what, run] of [['wide', await untouched()], ['upright', await upright()]]) {
    const { dark } = run.watched.night;
    assert.ok(dark.length > 300, `${what}: ${dark.length} frames of the dark before the roar`);
    for (const f of dark) {
      assert.deepEqual(f.lights, [], `${what}: no lamp at ${f.time.toFixed(1)} s`);
      assert.equal(f.spot, 0, `${what}: no light in the cloud at ${f.time.toFixed(1)} s`);
      assert.equal(f.look, HATID_LOOKS.dark, `${what}: the dark's light at ${f.time.toFixed(1)} s`);
    }
    const levels = dark.map(f => f.plates);
    assert.ok(levels.every(v => Number.isFinite(v)), `${what}: her plates are lit all through the dark`);
    assert.ok(Math.max(...levels) > 0.9 && Math.min(...levels) < 0.6, `${what}: they beat (${Math.min(...levels).toFixed(2)} to ${Math.max(...levels).toFixed(2)})`);
    // the beats: each time the level crosses its middle going up
    const mid = (Math.max(...levels) + Math.min(...levels)) / 2;
    const ups = dark.filter((f, k) => k && dark[k - 1].plates < mid && f.plates >= mid).map(f => f.time);
    const perMinute = ((ups.length - 1) / (ups.at(-1) - ups[0])) * 60;
    assert.ok(ups.length >= 8 && perMinute >= 45 && perMinute <= 55, `${what}: ${ups.length} beats, ${perMinute.toFixed(1)} a minute`);
  }
});

test('Þórseðla\'s head is the highest thing on the top when she says she sees it, and the first star lights with her line', async () => {
  for (const [what, run] of [['wide', await untouched()], ['upright', await upright()]]) {
    const said = lineAt(run, 'h_thorsedla_there');
    assert.ok(said, `${what}: her line`);
    const { heads, first } = run.watched.night;
    const at = heads.find(f => f.time >= said.at - 1e-6);
    assert.ok(at, `${what}: watched as she says it`);
    const others = Object.entries(at.heads).filter(([who]) => who !== 'thorsedla');
    for (const [who, y] of others) assert.ok(at.heads.thorsedla > y + 1, `${what}: her head ${at.heads.thorsedla.toFixed(1)} m, ${who}'s ${y.toFixed(1)}`);
    const [star] = logOf(run, 'firstStar');
    assert.ok(star && Math.abs(star.at - said.at) <= FRAME + 1e-6, `${what}: the first star lights at ${star?.at.toFixed(2)} s, her line at ${said.at.toFixed(2)} s`);
    assert.ok(first.filter(f => f.time < said.at - 1e-6).every(f => f.light === 0), `${what}: not before`);
    const full = first.find(f => f.light >= 0.999);
    assert.ok(full && full.time - said.at <= 1.2 + 2 * FRAME, `${what}: whole within 1.2 s of her line`);
  }
});

test('the roar: the guests are behind Mosi before it, a ring runs out over the sea from her, and the stars leave the book after it', async () => {
  for (const [what, run] of [['wide', await untouched()], ['busy', await busy()]]) {
    const { roar } = run.watched.night;
    assert.ok(roar, `${what}: she roars`);
    assert.ok(roar.guests.length >= BUDGET.guests - 2, `${what}: ${roar.guests.length} guests on the top`);
    // behind his back: the other way from where he faces (the sky where the sun went), so he stands between them and her roar
    const back = [-Math.cos(THREE.MathUtils.degToRad(roar.mosiHeading)), -Math.sin(THREE.MathUtils.degToRad(roar.mosiHeading))];
    for (const g of roar.guests) {
      const off = [g.at[0] - roar.mosi[0], g.at[1] - roar.mosi[1]];
      const behind = off[0] * back[0] + off[1] * back[1];
      assert.ok(behind > 2 && Math.hypot(...off) < 14, `${what}: the ${g.key} ${behind.toFixed(1)} m behind Mosi, ${Math.hypot(...off).toFixed(1)} m from him`);
    }
    const [roared] = logOf(run, 'roared');
    const [ring] = logOf(run, 'ring');
    assert.ok(ring && ring.at > roared.at && ring.at - roared.at < 2, `${what}: the ring sets out with her roar`);
    assert.ok(Math.hypot(ring.from[0] - roar.her[0], ring.from[1] - roar.her[1]) < 0.5, `${what}: from her`);
    assert.equal(ring.strength, 4);
    assert.equal(ring.seconds, 6);
    const [launch] = logOf(run, 'launch');
    assert.ok(launch && launch.at > roared.at, `${what}: the stars leave the book after the roar`);
    const arrived = logOf(run, 'arrived');
    assert.deepEqual(arrived.map(e => e.friend), FRIENDS.map(f => f.key), `${what}: all six on the sky, in the book's order`);
    assert.ok(arrived.every(e => e.at > launch.at + 1.9 && e.at < launch.at + 4), `${what}: each 0.6 s + its gap + 1.4 s after the book swells`);
    // and back in their seats after it
    const home = logOf(run, 'hide').find(e => e.phase === 'out');
    assert.ok(home && home.at > roared.at, `${what}: the guests go back to their seats after it`);
  }
});

test('each star lights in its own friend\'s colour, its constellation is whole 2.6 s later, and its friend is glad', async () => {
  assert.equal(DRAW_SECONDS, 2.6);
  for (const [what, run] of [['wide', await untouched()], ['busy', await busy()]]) {
    const lit = logOf(run, 'lit');
    assert.deepEqual(lit.map(e => e.friend).sort(), FRIENDS.map(f => f.key).sort(), `${what}: six lit`);
    const drawn = logOf(run, 'drawn');
    const glad = logOf(run, 'glad');
    const { whole } = run.watched.night;
    for (const { friend, colour, at } of lit) {
      assert.equal(colour, FRIENDS.find(f => f.key === friend).colour, `${what}: ${friend}'s star in her colour`);
      const done = drawn.find(e => e.friend === friend);
      assert.ok(done && Math.abs(done.at - at - DRAW_SECONDS) <= 2 * FRAME, `${what}: ${friend}'s constellation whole ${(done?.at - at).toFixed(2)} s after`);
      assert.ok(whole[friend]?.lines.length > 80 && whole[friend].lines.every(v => v === 1), `${what}: every line of hers drawn then`);
      const joy = glad.find(e => e.friend === friend);
      assert.ok(joy && joy.at - at >= -1e-6 && joy.at - at < 0.5, `${what}: ${friend} glad as it lights`);
      assert.equal(joy.how, friend === 'gramedla' ? 'nod' : friend === 'kambedla' ? 'plates' : 'happy', `${what}: ${friend} glad in her own way`);
    }
  }
});

test('a star tapped while it still flies out of the book does nothing', async () => {
  const run = await busy();
  assert.ok(run.watched.flyingTaps >= 15, `${run.watched.flyingTaps} taps on stars still in the air`);
  const [launch] = logOf(run, 'launch');
  const last = logOf(run, 'arrived').at(-1);
  const early = logOf(run, 'tap').filter(e => e.task === 'stars' && e.at >= launch.at && e.at <= last.at);
  assert.ok(early.length >= 15, `${early.length} of them heard`);
  assert.ok(early.every(e => e.counted === false), 'none counted');
  const [want] = tasks(run, 'stars', 'want');
  const lights = tasks(run, 'stars', 'light');
  assert.ok(lights.every(e => e.at >= want.at), 'no star lit before they are all on the sky and wanted');
  assert.ok(want.at > last.at, 'wanted only after the last has arrived');
  assert.equal(lights[0].friend, BACKWARDS[0], 'the first lit is the one tapped after');
});

test('the hundreds come out only when the sixth is lit, and then Mosi wishes a glad festival', async () => {
  for (const [what, run] of [['wide', await untouched()], ['busy', await busy()]]) {
    const [all] = tasks(run, 'stars', 'all');
    const { many } = run.watched.night;
    assert.ok(many.filter(f => f.time < all.at - 1e-6).every(f => f.many === 0), `${what}: none before the sixth`);
    const full = many.find(f => f.many >= 0.999);
    assert.ok(full && Math.abs(full.time - all.at - 5) <= 2 * FRAME, `${what}: all out ${(full?.time - all.at).toFixed(2)} s after it`);
    const summer = lineAt(run, 'h_mosi_summer');
    assert.ok(summer && summer.at > all.at && summer.at < all.at + 2, `${what}: "Gleðilega Stjörnuhátíð!" ${(summer?.at - all.at).toFixed(2)} s after`);
    const night = run.world.chapterState.night;
    let lit = 0;
    for (let i = 0; i < 700; i++) if (night.starAt(i).light > 0) lit++;
    assert.ok(lit > 500, `${what}: ${lit} stars out`);
  }
});

test('Egill is on the ground beside Mosi before the moon rises, and never falls: his feet come down under 1 m/s', async () => {
  for (const [what, run] of [['wide', await untouched()], ['upright', await upright()]]) {
    const { atMoon, egill } = run.watched.night;
    assert.ok(atMoon, `${what}: the moon peeks`);
    assert.equal(atMoon.riding, false, `${what}: off her head`);
    assert.ok(Math.abs(atMoon.up) < 0.15, `${what}: on the ground (${atMoon.up.toFixed(2)} m)`);
    assert.ok(atMoon.apart < 7, `${what}: ${atMoon.apart.toFixed(1)} m from Mosi`);
    const floating = egill.filter(f => f.floating);
    assert.ok(floating.length > 30, `${what}: ${floating.length} frames of his float`);
    let fastest = 0;
    for (let k = 1; k < egill.length; k++) fastest = Math.max(fastest, (egill[k - 1].y - egill[k].y) / Math.max(1e-6, egill[k].time - egill[k - 1].time));
    assert.ok(fastest < 1, `${what}: down at ${fastest.toFixed(2)} m/s at the most`);
    assert.ok(egill.every(f => f.y >= f.ground - 0.05), `${what}: never under the ground`);
  }
});

test('the moon peeks, smiles and blows, and the song starts 1.2 s after', async () => {
  assert.equal(TOOT_GAP, 1.2);
  for (const [what, run] of [['wide', await untouched()], ['upright', await upright()]]) {
    const acts = logOf(run, 'moon').filter(e => e.scene !== 'seventh'); // (Task 18) scene 4's 'oh' and wave are its own test's
    assert.deepEqual(acts.map(e => e.act), ['peek', 'smile', 'toot'], what);
    for (let k = 1; k < acts.length; k++) assert.ok(acts[k].at > acts[k - 1].at, `${what}: ${acts[k].act} after ${acts[k - 1].act}`);
    const { moon } = run.watched.night;
    assert.ok(moon.filter(f => f.time < acts[0].at - 1e-6).every(f => f.rise === 0), `${what}: under the cloud before it peeks`);
    assert.ok(moon.find(f => f.time >= acts[2].at - 1e-6)?.rise === 1, `${what}: up when it blows`);
    assert.ok(moon.some(f => f.mouth === 'blow' && f.time >= acts[2].at), `${what}: it blows`);
    const blower = run.soundLog.find(e => e.name === 'partyBlower');
    assert.ok(blower && Math.abs(blower.at - acts[2].at) <= FRAME + 1e-6, `${what}: the blower sounds as it blows`);
    const [song] = logOf(run, 'party');
    assert.ok(Math.abs(song.at - acts[2].at - TOOT_GAP) <= FRAME + 1e-6, `${what}: the song ${(song.at - acts[2].at).toFixed(2)} s after the toot`);
  }
});

test('the guests hide behind a place each in a spot of its own (hatid-guests.js hideSpot)', () => {
  // the 'hiding' phase: u 0 in its seat, 1 in its spot behind the place it is told (Mosi's back)
  const top = { heightAt: () => 1 };
  const world = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
  const guests = createGuests(world, { top, models: {}, budget: 23 });
  assert.equal(typeof guests.setHide, 'function');
  assert.deepEqual(hideSpot({ at: [10, 0], back: [1, 0] }, 'frogs', 0).length, 2);
  for (const group of Object.keys(GUESTS)) {
    let was = null;
    for (let k = 0; k < GUESTS[group]; k++) {
      const spot = hideSpot({ at: [10, 0], back: [1, 0] }, group, k);
      assert.ok(spot[0] - 10 > 2, `the ${group} ${k} behind the place`);
      if (was) assert.ok(Math.hypot(spot[0] - was[0], spot[1] - was[1]) > 0.8, `the ${group} ${k} not on top of the one before`);
      was = spot;
    }
  }
});

test('taps in the party change nothing: a child tapping all over the screen every 0.7 s gets the partyLog and the poses of the untouched play', async () => {
  const [run, base] = [await busy(), await untouched()];
  assert.ok(run.watched.partyTaps > 300, `${run.watched.partyTaps} taps in the party`);
  sameLog(partyLog(run), partyLog(base), 'the busy child\'s party');
  sameFrames(run.watched.frames, base.watched.frames, 'the busy child\'s party');
});

test('the party is the song\'s clock: every cut, call and section of partyLog is on its beat of the map, within a frame', async () => {
  const run = await untouched();
  const c = run.world.chapterState;
  const log = c.partyLog;
  for (const e of log) assert.ok(Math.abs(e.at - c.partyStart - secondsAt(e.beat)) <= FRAME + 1e-6, `${e.type} ${e.beat} at ${(e.at - c.partyStart).toFixed(3)} s`);
  assert.deepEqual(log.filter(e => e.type === 'cut').map(e => [e.beat, e.shot]), CAMERA.map(e => [e.beat, e.cut]), 'every cut of CAMERA');
  assert.deepEqual(log.filter(e => e.type === 'call').map(e => [e.beat, e.move]), SONG.song.calls.map(e => [e.beat, e.move]), 'every call');
  assert.deepEqual(log.filter(e => e.type === 'section').map(e => [e.beat, e.id]), SONG.song.sections.map(e => [e.startBeat, e.id]), 'every section');
  assert.equal(log.filter(e => e.type === 'cue').length, SONG.song.cues.length, 'every cue');
  for (const call of SONG.song.calls) {
    const said = run.seen.said.find(e => e.id === CALLS[call.move] && Math.abs(e.at - c.partyStart - secondsAt(call.beat)) <= FRAME + 1e-6);
    assert.ok(said, `Slóeðla calls ${call.move} on beat ${call.beat}`);
  }
  const [over] = logOf(run, 'partyEnd');
  assert.ok(Math.abs(over.at - c.partyStart - LENGTH) <= FRAME + 1e-6, `the party ends ${(over.at - c.partyStart).toFixed(2)} s in, the song ${LENGTH.toFixed(2)}`);
  assert.equal(logOf(run, 'partyAim').length, 0, 'nothing aimed in the party');
});

test('the book open for 30 s in the first dance: the song\'s position and the beat stop together and go on together', async () => {
  const [run, base] = [await paused(), await untouched()];
  ended(run, 'paused');
  const { held, after } = run.watched;
  assert.ok(held.length > 800, `${held.length} frames held`);
  assert.ok(held.every(f => f.beat === held[0].beat && f.position === held[0].position), 'the beat and the song stand still');
  assert.ok(held[0].beat > 72 && held[0].beat < 136, `in the first dance (beat ${held[0].beat.toFixed(1)})`);
  assert.ok(held.every(f => f.paused === true), 'the song is silent');
  assert.equal(after.paused, false, 'and plays on');
  assert.ok(Math.abs(secondsAt(after.beat) - after.position) < 1e-6, `the beat ${after.beat.toFixed(2)} where the song is ${after.position.toFixed(2)} s in`);
  assert.ok(Math.abs(after.current - after.position) < 0.15, `the record ${after.current.toFixed(2)} s in`);
  sameLog(partyLog(run), partyLog(base), 'the party through the pause');
});

test('the party on the tile is the party in the chapter: the same partyFrame at the same beats, and the same partyLog', async () => {
  const [run, base] = [await tile(), await untouched()];
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  sameLog(partyLog(run), partyLog(base), 'the tile\'s party');
  sameFrames(run.watched.frames, base.watched.frames, 'the tile\'s party');
});

test('the party\'s sounds are its table\'s: each row on its beat at its level (none over 0.6), and nothing else plays from the first beat to the last chord', async () => {
  const run = await tile();
  const c = run.world.chapterState;
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  const [over] = logOf(run, 'partyEnd');
  const heard = run.soundLog.filter(e => e.at >= c.partyStart - 1e-6 && e.at <= over.at + 1e-6);
  assert.equal(heard.length, PARTY_SOUNDS.length, `${heard.length} sounds in the party: ${heard.map(e => e.name).join(', ')}`);
  PARTY_SOUNDS.forEach((row, i) => {
    const e = heard[i];
    assert.equal(e.name, row.sample, `row ${i} (beat ${row.beat})`);
    assert.ok(Math.abs(e.at - c.partyStart - secondsAt(row.beat)) <= FRAME + 1e-6, `${row.sample} on beat ${row.beat}`);
    assert.equal(e.detail.level, row.level);
    assert.ok(row.level <= 0.6, `${row.sample} at ${row.level}`);
  });
  for (const cue of [264, 288, 312, 336]) assert.ok(PARTY_SOUNDS.some(r => r.beat === cue && r.sample === 'gramedlaRoar'), `her roar on ${cue}`);
  assert.ok(PARTY_SOUNDS.some(r => r.who === 'flugedla' && r.sample === 'wingbeat') && PARTY_SOUNDS.some(r => r.who === 'flugedla' && r.sample === 'flyers'), 'Flugeðla\'s wings and cry');
  // and scene 2's roar is heard
  const base = await untouched();
  assert.ok(base.soundLog.some(e => e.name === 'gramedlaRoar' && e.scene === 'stars'), 'her roar lights the stars');
});

test('the tile plays from the moon\'s Tút to the last chord, says only the four calls, gives no star and leaves the save as it was', async () => {
  const run = await tile();
  const c = run.world.chapterState;
  const horns = run.soundLog.filter(e => e.name === 'partyBlower');
  const began = run.world.chapterTimeline[0].at;
  assert.equal(horns.length, 2, 'the moon\'s Tút at the start, and again on the last chord');
  assert.ok(Math.abs(horns[0].at - began) < FRAME + 1e-6, 'as the black lifts');
  assert.ok(Math.abs(c.partyStart - horns[0].at - ALONE.toot) < FRAME + 1e-6, 'and the song after it');
  const card = run.doc.body.children.find(element => element.classList.contains('dans-end'));
  assert.ok(card, 'the end card');
  const [over] = logOf(run, 'partyEnd');
  assert.ok(Math.abs(over.at - c.partyStart - LENGTH) <= FRAME + 1e-6, 'it ends on the last chord\'s tail');
  assert.deepEqual([...run.seen.spoken].sort(), Object.values(CALLS).sort(), 'only the four calls');
  assert.deepEqual(Object.keys(party.lines).sort(), Object.values(CALLS).sort());
  assert.equal(JSON.stringify(run.save.get()), run.watched.saved, 'the save untouched');
  assert.deepEqual(run.book.opened, [], 'no book');
  assert.equal(run.sounds.includes('star'), false, 'no star tone');
  assert.equal(party.next, null);
  assert.equal(party.startsItself, true);
  assert.ok(Math.abs(partyTime(100) - (c.partyStart - began + secondsAt(100))) < FRAME + 1e-6, 'partyTime is the tile\'s second of a beat');
});

// (Task 22 fix 1) what a shader is made of, as three keys its program: the kind of object and each material's type and patch (its
// own source for a ShaderMaterial), its maps and colours; not its name
const shaderOf = o => [o.isInstancedMesh && 'instanced', o.isSkinnedMesh && 'skinned', o.isPoints && 'points', o.isSprite && 'sprite',
  o.geometry?.morphAttributes?.position?.length && 'morphs',
  ...[o.material].flat().filter(Boolean).map(m => (m.isShaderMaterial ? `${m.type} ${m.vertexShader} ${m.fragmentShader}` : m.type)
    + ` ${m.customProgramCacheKey?.() ?? ''} ${Boolean(m.vertexColors)} ${Boolean(m.map)} ${Boolean(m.emissiveMap)} ${m.fog}`)].filter(Boolean).join(' / ');
const drawables = root => { const out = []; root.traverse(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) out.push(o); }); return out; };

test('the party\'s first frame builds no shader: everything new from the walk to the party to its third second (the stage, the band\'s things, the moon at its peek) was handed to compileAsync before, in the chapter behind its start button (her plates too) and on the tile; the chapter\'s warm-up has the crowds cast', async () => {
  for (const [what, played, limit] of [['chapter', chapter, 300], ['tile', party, ALONE.fadeIn + ALONE.toot + 4]]) {
    const w = { warmed: null, at: null, seen: new Set(), fresh: [], party: null, walk: null, plates: null, cast: null };
    // the page's renderer links in compileAsync; the harness's records what it was handed (and what the scene had by then), from
    // before the script's first step (the tile warms behind the black, before its first frame)
    const module = { chapter: { ...played, *script(s) {
      const world = s.actor('mosi').raw.world;
      world.renderer.compileAsync = root => {
        if (!w.warmed) { w.warmed = new Set(drawables(world.scene).map(shaderOf)); w.at = s.time; }
        for (const o of drawables(root)) w.warmed.add(shaderOf(o));
        return Promise.resolve(root);
      };
      return yield* played.script.call(this, s);
    } } };
    await playIt(module, {
      limit, audio: createFakeContext({ state: 'running' }),
      child(c, { world }) {
        if (c.partyStart != null) w.party ??= c.partyStart;
        if (w.party != null && c.s.time > w.party + 3) return;
        // (fix 3) the chapter warms behind its start button, so it counts from the walk to the party (all new from there to the
        // song's third second was in its warm); her plate skin was handed in too; its warm-up has every crowd cast, and gives it back
        if (what === 'chapter') {
          if (c.shotLabel === 'party_high') w.walk ??= c.s.time;
          if (w.plates === null && c.plates) w.plates = drawables(c.kambedla.raw.root).some(o => String(o.material?.customProgramCacheKey?.()).endsWith('|plate-glow') && w.warmed?.has(shaderOf(o)));
          const meshes = (world.forest?.guests?.meshes ?? []).filter(m => m.onBeforeShadow);
          if (w.cast === null && meshes.length) {
            const before = meshes.map(m => m.castShadow);
            const warm = played.warmUp(world, { place: world.location }); // as main.js asks before the start button shows
            const during = meshes.every(m => m.castShadow);
            warm.dispose();
            w.cast = during && meshes.every((m, i) => m.castShadow === before[i]);
          }
        }
        for (const o of drawables(world.scene)) {
          if (w.seen.has(o)) continue;
          w.seen.add(o);
          // (what the tile's script makes in its first frames, the moth and the sun's cap, the page draws behind its play button,
          // which the harness presses at once: counted from half a second on)
          if (w.warmed && (what === 'chapter' ? w.walk != null : c.s.time > 0.5) && !w.warmed.has(shaderOf(o))) w.fresh.push(`${o.name}: ${shaderOf(o)} at ${c.s.time.toFixed(2)} s`);
        }
      },
    });
    assert.ok(w.warmed && w.party != null, `${what}: warmed, and the party began`);
    assert.ok(w.at < w.party, `${what}: warmed at ${w.at?.toFixed(2)} s, the song at ${w.party.toFixed(2)} s`);
    assert.deepEqual(w.fresh, [], `${what}: drawn with a shader nobody built before`);
    if (what === 'chapter') {
      // (the page makes it while the start button waits, chapter.later; the harness presses the button at once: at the tap)
      assert.equal(typeof played.later?.make, 'function', 'chapter: made while its start button waits');
      assert.ok(w.at < 0.05, `chapter: warmed at the start, not at ${w.at.toFixed(2)} s`);
      assert.equal(w.plates, true, 'chapter: her plate skin was handed to compileAsync with the party');
      assert.equal(w.cast, true, 'chapter: its warm-up has every crowd cast, and gives them back');
    }
  }
});

test('reduced motion: no handheld, and the festival plays to its end', async () => {
  const run = await upright();
  ended(run, 'reduced');
  assert.equal(run.watched.handheld, 0, 'no handheld');
  assert.equal(run.world.chapterState.reduced, true);
  assert.ok(logOf(run, 'roared').every(e => e.handheld === false), 'her roar without the shake');
  // (Task 17) the camera only cuts in the party: still inside each shot
  const cam = run.watched.partyCamera;
  assert.ok(cam?.frames > 1000, `${cam?.frames} frames of the party`);
  assert.ok(cam.most < 1e-3, `the party's camera moved ${cam.most} in a frame (${cam.where})`);
});

test('upright (aspect 0.625): every aimed target is on the screen whenever its task waits', async () => {
  const run = await upright();
  ended(run, 'upright');
  assert.ok(run.watched.aimChecks > 500, `${run.watched.aimChecks} checks`);
  assert.deepEqual(run.watched.out.slice(0, 12), []);
});

test('every line of WORDS is said in the untouched play but h_mosi_wave, which the help says', async () => {
  const run = await untouched();
  const missing = Object.keys(WORDS).filter(id => !run.seen.spoken.has(id));
  assert.deepEqual(missing, []);
  const [hint] = tasks(run, 'sun', 'help');
  const wave = run.seen.said.find(e => e.id === 'h_mosi_wave');
  assert.ok(Math.abs(wave.at - hint.at) < 0.5, 'Mosi asks again on the sun\'s hint');
  assert.equal(run.seen.said.filter(e => e.id === 'h_mosi_wave').length, 1);
  for (const [id, text] of Object.entries(WORDS)) assert.equal(chapter.lines[id].text, text);
});

test('no wide shot of CAMERA lasts longer than BUDGET.wideBars', () => {
  // a wide shot holds everyone, and costs the most: it is cut away from within BUDGET.wideBars bars (4 beats a bar)
  assert.deepEqual(BUDGET.wide, ['party_wide', 'party_high', 'final_pose']);
  const wide = CAMERA.map((shot, i) => ({ ...shot, until: CAMERA[i + 1]?.beat ?? END_BEAT })).filter(shot => BUDGET.wide.includes(shot.cut));
  assert.ok(wide.some(shot => shot.cut === BUDGET.shot), `the measured shot ${BUDGET.shot} is cut to`);
  for (const shot of wide) assert.ok(shot.until - shot.beat <= BUDGET.wideBars * 4, `${shot.cut} at beat ${shot.beat} holds ${(shot.until - shot.beat) / 4} bars`);
  // the measured frame: one bar into the dance (the rulings: beat 76), the measured shot cut to by hand there (Task 17: CAMERA cuts
  // to Egill at 76, chunk-6 ruling 17; the bar before it is the shot's, from the dance's first beat)
  const held = CAMERA.filter(shot => shot.beat <= BUDGET.beat - 1).at(-1);
  assert.equal(held.cut, BUDGET.shot);
  assert.equal(BUDGET.beat, SONG.song.sections.find(s => s.id === 'dance').startBeat + 4);
});

test('the party is lit by the real stage: by beat 100 every part is on at full, and at beat 200 all four spotlights are on Grameðla', async () => {
  const run = await untouched();
  const { stage } = run.watched.frames[100];
  for (const part of ['cone', 'floor', 'strings', 'sea', 'spots', 'fireflies']) assert.equal(stage.parts[part], 1, `${part} at beat ${stage.beat}`);
  assert.ok(stage.stones.every(r => r === 1), 'the stones up');
  const solo = run.watched.frames[200].stage;
  const her = run.world.chapterState.stands.party.gramedla.at;
  assert.equal(solo.spots.length, 4);
  for (const s of solo.spots) assert.ok(Math.hypot(s.to[0] - her[0], s.to[2] - her[1]) < 1.5 && s.level > 0.2, `a spotlight on her: ${s.to}`);
  assert.equal(run.world.scene.getObjectByName('Hátíð grey stage'), undefined, 'the grey stage is gone');
});

// -----------------------------------------------------------------------------------------------
// Scene 4 (Task 18): the seventh star, the lift, Mosi staying, and the hand-over to the ride.
const hueOf = hex => { const hsl = {}; new THREE.Color(hex).getHSL(hsl); return hsl.h * 360; };
const hueGap = (a, b) => Math.abs(((hueOf(a) - hueOf(b) + 540) % 360) - 180);
const fourOf = run => run.watched.four;
const liftedAt = run => logOf(run, 'lifted')[0].at;
const liftedRun = () => play('lifted', () => playIt({ chapter: hatid.lifted }, { limit: 30 }));

test('the seventh star is none of the six friends\' hues, and it shows only after Mosi\'s thanks', async () => {
  for (const { key, colour } of FRIENDS) assert.ok(hueGap(SEVENTH.colour, colour) > 15, `${key}'s ${colour} is ${hueGap(SEVENTH.colour, colour).toFixed(0)} degrees from it`);
  const run = await untouched();
  const thanks = lineAt(run, 'h_mosi_thanks');
  assert.ok(thanks, 'Mosi thanks him');
  const shown = fourOf(run).frames.find(f => f.seventh?.level > 0.003);
  assert.ok(shown, 'it shows');
  assert.ok(shown.time > thanks.at, `at ${shown.time.toFixed(1)} s, after his thanks at ${thanks.at.toFixed(1)} s`);
  assert.equal(run.world.chapterState.chapterLog.filter(e => e.type === 'seventh' && e.scene !== 'seventh').length, 0, 'nowhere but in scene 4');
});

test('every constellation\'s head turns to it and the moon\'s mouth is "o"', async () => {
  const run = await untouched();
  const [shown] = logOf(run, 'seventh');
  const frame = fourOf(run).frames.find(f => f.time > shown.at + 2.5);
  assert.equal(Object.keys(frame.turns).length, 6, 'all six in the sky');
  for (const [key, off] of Object.entries(frame.turns)) assert.ok(off < 8, `${key}'s head ${off.toFixed(1)} degrees off it`);
  const before = fourOf(run).frames.find(f => f.time > shown.at - 1);
  assert.ok(Object.values(before.turns).some(off => off > 10), 'they turn: before it shows they look elsewhere');
  assert.equal(frame.mouth, 'oh');
});

test('Egill rises slowly (never over 2 m/s), waves, and says his two lines; Mosi stays on the ground, waves and says he will find him', async () => {
  const run = await untouched();
  const at = liftedAt(run);
  const frames = fourOf(run).frames.filter(f => f.time >= at);
  let fastest = 0;
  for (let i = 1; i < frames.length; i++) fastest = Math.max(fastest, frames[i].egill.distanceTo(frames[i - 1].egill) / (frames[i].time - frames[i - 1].time));
  assert.ok(fastest <= 2, `his quickest ${fastest.toFixed(2)} m/s`);
  const rose = frames.at(-1).egill.y - frames[0].egill.y;
  assert.ok(Math.abs(rose - SEVENTH.height) < 0.05, `he rises ${rose.toFixed(2)} m`);
  const said = id => run.seen.said.filter(e => e.id === id && e.at >= at);
  for (const id of ['h_egill_fly', 'h_egill_bye', 'h_mosi_where', 'h_mosi_find']) assert.equal(said(id).length, 1, `${id} once, after the lift`);
  assert.deepEqual(logOf(run, 'waved').map(e => e.who).sort(), ['egill', 'mosi']);
  const ys = frames.map(f => f.mosi.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.3, 'Mosi stays on the ground');
});

test('the moth sits on Mosi\'s horn from the first frame to the lift and is within 3 m of Egill from then on', async () => {
  const run = await untouched();
  const at = liftedAt(run);
  const { moth } = fourOf(run);
  const sitting = moth.filter(m => m.time < at);
  assert.ok(sitting.length > 1000 && sitting[0].time < 0.1, 'watched from the first frame');
  const off = Math.max(...sitting.map(m => m.horn));
  assert.ok(off < 0.05, `on his horn, at the most ${off.toFixed(3)} m off`);
  const flying = moth.filter(m => m.time >= at + 2.2); // its flight to him: 2.2 s (hatid-seventh.js MOTH.fly)
  assert.ok(flying.length > 100);
  const far = Math.max(...flying.map(m => m.egill));
  assert.ok(far < 3, `with Egill, at the most ${far.toFixed(2)} m from him`);
});

test('the ride is handed everything it needs (egill, moth, mosi, top, sky, constellations, moon, the seventh\'s place and hue) and the screen is never black between the lift and the ride', async () => {
  const run = await untouched();
  const { hand } = run.world.chapterState;
  for (const key of ['egill', 'moth', 'mosi', 'top', 'sky', 'constellations', 'moon']) assert.ok(hand[key], `the hand has ${key}`);
  assert.equal(hand.seventh.colour, SEVENTH.colour);
  assert.deepEqual([hand.seventh.azimuth, hand.seventh.elevation], [SKY.seventh.azimuth, SKY.seventh.elevation]);
  const [ride] = logOf(run, 'ride');
  assert.ok(ride && ride.at > liftedAt(run), 'the ride takes over after the lift');
  const black = Math.max(...fourOf(run).frames.filter(f => f.time >= liftedAt(run) && f.time <= ride.at + 1).map(f => f.black));
  assert.ok(black < 0.01, `never black (${black.toFixed(2)})`);
});

test('asLifted gives the state the played festival has at the hand-over: everyone within 0.2 m and the same light', async () => {
  const [played, alone] = await Promise.all([untouched(), liftedRun()]);
  assert.equal(alone.task.failed, false, String(alone.task.error?.stack ?? alone.task.error));
  const a = played.world.chapterState.handState, b = alone.world.chapterState.handState;
  assert.ok(a && b, 'both handed over');
  for (const who of FRIENDS8) {
    const d = Math.hypot(...a.actors[who].map((v, i) => v - b.actors[who][i]));
    assert.ok(d < 0.2, `${who} ${d.toFixed(2)} m from where the played festival has her`);
  }
  assert.deepEqual(b.light, a.light, 'the same light');
  assert.ok(Math.hypot(...a.seventh.at.map((v, i) => v - b.seventh.at[i])) < 0.01, 'the seventh star in the same place');
  assert.ok(b.seventh.light > 0.99 && b.seventh.level > 0.99, 'and shining');
});

test('no tap changes anything after the song: a child tapping through scene 4 gets the untouched play', async () => {
  const [calm, taps] = await Promise.all([untouched(), busy()]);
  assert.ok(taps.watched.partyTaps > 300, `${taps.watched.partyTaps} taps from the party on`);
  const four = run => run.world.chapterState.chapterLog.filter(e => e.scene === 'seventh').map(e => ({ type: e.type, who: e.who ?? e.act ?? e.name ?? '', off: e.at - liftedAt(run) }));
  const [x, y] = [four(taps), four(calm)];
  assert.deepEqual(x.map(e => `${e.type} ${e.who}`), y.map(e => `${e.type} ${e.who}`), 'the same things in scene 4');
  assert.deepEqual(x.filter((e, k) => Math.abs(e.off - y[k].off) > FRAME + 1e-6).slice(0, 5), [], 'each at the same moment of it');
  const d = Math.hypot(...taps.world.chapterState.handState.actors.egill.map((v, i) => v - calm.world.chapterState.handState.actors.egill[i]));
  assert.ok(d < 0.01, 'Egill handed over in the same place');
});

// -----------------------------------------------------------------------------------------------
// The save (Task 19): the festival marks itself seen as Egill lifts, gives no star, and an old save loses nothing.
// A child from chapter 6's end: the six stars, the places, finds, the map's pieces and a video seen, a fossil and stickers.
const OLD = {
  stars: EARNED, findings: ['beetle', 'frog'], places: ['fen', 'sloedla', 'flugedla', 'uggedla'],
  seen: ['map-route-a', 'map-route-f', 'video:djamm'], fossils: ['skull'], stickers: { sloedla: 2 },
};
const fromChapter6 = save => {
  OLD.stars.forEach(id => save.addStar(id));
  OLD.findings.forEach(id => save.addFinding(id));
  OLD.places.forEach(id => save.addPlace(id));
  OLD.seen.forEach(id => save.addSeen(id));
  OLD.fossils.forEach(id => save.addHalsFound(id));
  save.setStickers(OLD.stickers);
};
/** The festival untouched over the old save, watching the save each frame: when hatid came into seen, and the save 2 s after the lift. */
const kept = () => play('old save', () => {
  let save = null;
  return playIt(hatid, {
    savedWith: s => { fromChapter6(s); save = s; },
    child(c, frame, seen) {
      const now = save.get();
      seen.savedAt ??= now.seen.includes('hatid') ? c.s.time : null;
      if (c.lifted && !seen.twoAfter && c.s.time >= c.lifted.time + 2) seen.twoAfter = now;
    },
  }).then(run => ({ ...run, saveAtEnd: save }));
});

test('the festival gives no star: six before, the same six after, in the same order; hatid is in seen once, from the moment Egill lifts', async () => {
  const run = await kept();
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  assert.deepEqual(JSON.parse(run.watched.saved).stars, EARNED, 'six before');
  const end = run.saveAtEnd.get();
  assert.deepEqual(end.stars, EARNED, 'the same six after, in the same order');
  assert.equal(end.seen.filter(id => id === 'hatid').length, 1, 'hatid once');
  const lift = run.world.chapterState.lifted.time;
  assert.ok(Math.abs(run.watched.savedAt - lift) <= FRAME + 1e-6, `seen at ${run.watched.savedAt?.toFixed(2)} s, as he lifts at ${lift.toFixed(2)} s`);
});

test('a child who leaves during the ride has still seen the festival', async () => {
  const run = await kept();
  const left = run.watched.twoAfter;
  assert.ok(left, 'the save 2 s after the lift');
  assert.ok(left.seen.includes('hatid'), 'has the festival seen: the book\'s tile and the seventh slot are open, and the next visit opens chapter 6');
  assert.deepEqual(left.stars, EARNED, 'and its six stars');
});

test('an old save loses nothing: its stars, places, finds and seen are all there at the end', async () => {
  const run = await kept();
  const end = run.saveAtEnd.get();
  assert.deepEqual(end.stars, OLD.stars);
  assert.deepEqual(end.places, OLD.places);
  assert.deepEqual(end.findings.slice(0, OLD.findings.length), OLD.findings, `the finds first, in their order: ${end.findings}`);
  assert.deepEqual(end.seen.slice(0, OLD.seen.length), OLD.seen, `what was seen first, in its order: ${end.seen}`);
  assert.deepEqual(run.saveAtEnd.getHals().found, OLD.fossils, 'the fossils');
  assert.equal(run.saveAtEnd.getStickers().sloedla, 2, 'the stickers');
});
