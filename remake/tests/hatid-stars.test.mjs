// The festival's three taps as rules (chapters/hatid-stars.js): the sun's wave, Grameðla's roar and the six stars, in any order,
// with the help at 5/6 s and by itself at 12 s. Nothing here can fail, and a tap at the wrong moment counts nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOneTap, createStars, createSkyStars, starTone, TAP_HELP, TONE_GAP, DRAW_SECONDS } from '../chapters/hatid-stars.js';
import { SKY } from '../chapters/hatid-route.js';
import { skyDirection } from '../engine/night-sky.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { SONG } from '../chapters/hatid-song.js';

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} is not ${b}`);
const keys = FRIENDS.map(f => f.key);

test('the constants are the plan\'s', () => {
  assert.deepEqual(TAP_HELP, { sun: { hint: 6, auto: 12 }, roar: { hint: 6, auto: 12 }, stars: { hint: 5, auto: 12 } });
  assert.equal(TONE_GAP, 0.25);
  assert.equal(SONG.motif.length, 6);
});

test('the stars light in any order and the tones still rise: every order of taps gives motif 0 to 5 in turn', () => {
  for (const order of [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0], [3, 0, 5, 1, 4, 2]]) {
    const stars = createStars(); stars.start(0);
    order.forEach((k, i) => stars.tap(FRIENDS[k].key, 1 + i));
    stars.update(10);
    const lights = stars.events().filter(e => e.type === 'light');
    assert.deepEqual(lights.map(e => e.friend), order.map(k => FRIENDS[k].key));
    assert.deepEqual(lights.map(e => e.tone), SONG.motif);
    assert.deepEqual(lights.map(e => e.n), [0, 1, 2, 3, 4, 5]);
    assert.ok(lights.every(e => e.by === 'child'));
  }
});

test('a child who taps nothing: the first star glows at 5 s and lights itself at 12 s, the rest at 2.5 and 6 s each, in the book\'s order', () => {
  const stars = createStars(); stars.start(0);
  const log = [];
  for (let t = 0; t <= 60; t = Math.round((t + 0.1) * 10) / 10) {
    stars.update(t);
    log.push(...stars.events());
    if (stars.state().done) break;
  }
  const lights = log.filter(e => e.type === 'light');
  assert.deepEqual(lights.map(e => e.friend), keys);
  assert.ok(lights.every(e => e.by === 'help'));
  const hints = log.filter(e => e.type === 'help');
  assert.deepEqual(hints.map(e => e.friend), keys);
  near(hints[0].time, 5, 'first hint');
  near(lights[0].at, 12, 'first light');
  const expectedLights = [12, 18, 24, 30, 36, 42];
  lights.forEach((e, i) => near(e.at, expectedLights[i], `light ${i}`));
  near(hints[1].time, 14.5, 'second hint');
  assert.equal(log.filter(e => e.type === 'all').length, 1);
  assert.equal(log.filter(e => e.type === 'done').length, 1);
  assert.deepEqual(stars.state().lit, keys);
});

test('after a star lit itself the waits are halved, and whole again when the child lights one', () => {
  const stars = createStars(); stars.start(0);
  stars.update(12); // the first lights itself
  stars.events();
  stars.update(14.4);
  assert.equal(stars.events().filter(e => e.type === 'help').length, 0);
  stars.update(14.5);
  assert.equal(stars.events().filter(e => e.type === 'help').length, 1);
  stars.tap('uggedla', 15); // the child lights the third in the book's order out of turn
  stars.events();
  stars.update(15 + 4.99);
  assert.equal(stars.events().filter(e => e.type === 'help').length, 0);
  stars.update(15 + 5);
  const hint = stars.events().filter(e => e.type === 'help');
  assert.equal(hint.length, 1);
  assert.equal(hint[0].friend, 'thorsedla'); // kambedla lit by help, uggedla by the child: the first unlit is thorsedla
  stars.update(15 + 12);
  const light = stars.events().filter(e => e.type === 'light');
  assert.equal(light.length, 1);
  assert.equal(light[0].by, 'help');
  assert.equal(light[0].friend, 'thorsedla');
});

test('a lit star tapped again, a tap on no star and a tap before the stars have arrived count nothing and bring no hint', () => {
  const stars = createStars();
  assert.deepEqual(stars.tap('kambedla', 0.5), { counted: false });
  assert.deepEqual(stars.tap(null, 0.6), { counted: false });
  stars.update(1);
  assert.deepEqual(stars.events(), []);
  stars.start(2);
  stars.events();
  assert.deepEqual(stars.tap('kambedla', 3), { counted: true });
  stars.events();
  assert.deepEqual(stars.tap('kambedla', 4), { counted: false });
  assert.deepEqual(stars.tap(null, 4.1), { counted: false });
  assert.deepEqual(stars.tap('nobody', 4.2), { counted: false });
  assert.deepEqual(stars.events(), []); // no event, no hint
  stars.update(7.99);
  assert.deepEqual(stars.events(), []);
  stars.update(8); // the hint still comes only at 5 s after the light at 3
  const e = stars.events();
  assert.equal(e.length, 1);
  assert.equal(e[0].type, 'help');
  assert.deepEqual(stars.state().lit, ['kambedla']);
});

test('two stars tapped in the same instant light both, their tones 0.25 s apart, the lower first', () => {
  const stars = createStars(); stars.start(0);
  stars.events();
  assert.deepEqual(stars.tap('thorsedla', 1), { counted: true });
  assert.deepEqual(stars.tap('kambedla', 1), { counted: true });
  stars.update(2);
  const lights = stars.events().filter(e => e.type === 'light');
  assert.deepEqual(lights.map(e => e.friend), ['thorsedla', 'kambedla']);
  assert.deepEqual(lights.map(e => e.tone), [SONG.motif[0], SONG.motif[1]]);
  near(lights[0].at, 1, 'first tone');
  near(lights[1].at, 1 + TONE_GAP, 'second tone');
});

test('the sixth star gives `all` once, then `done`', () => {
  const stars = createStars(); stars.start(0);
  keys.forEach((k, i) => stars.tap(k, 1 + i * 2));
  stars.update(30);
  stars.update(31);
  const log = stars.events();
  const tail = log.filter(e => e.type === 'all' || e.type === 'done');
  assert.deepEqual(tail.map(e => e.type), ['all', 'done']);
  near(tail[0].at, 11, 'all at the sixth tone');
  assert.deepEqual(stars.state(), { lit: keys, waiting: false, done: true });
  assert.deepEqual(stars.tap('kambedla', 40), { counted: false });
  stars.update(100);
  assert.deepEqual(stars.events(), []);
});

test('one tap is all the sun and the roar take: a second tap counts nothing; untouched, the line again at 6 s and it happens by itself at 12 s', () => {
  for (const help of [TAP_HELP.sun, TAP_HELP.roar]) {
    const one = createOneTap({ help: createHelpFor(help) }); one.start(0);
    assert.deepEqual(one.events().map(e => e.type), ['want']);
    assert.deepEqual(one.tap(3), { counted: true });
    assert.deepEqual(one.events().map(e => [e.type, e.by]), [['go', 'child']]);
    assert.deepEqual(one.tap(3.5), { counted: false });
    one.update(60);
    assert.deepEqual(one.events(), []);
    assert.deepEqual(one.state(), { waiting: false, done: true });

    const idle = createOneTap({ help: createHelpFor(help) }); idle.start(0);
    idle.events();
    idle.update(5.99);
    assert.deepEqual(idle.events(), []);
    idle.update(6);
    const again = idle.events();
    assert.deepEqual(again.map(e => [e.type, e.level]), [['help', 'hint']]);
    near(again[0].time, 6, 'the line again');
    idle.update(12);
    const go = idle.events();
    assert.deepEqual(go.map(e => [e.type, e.by]), [['go', 'help']]);
    near(go[0].time, 12, 'by itself');
    assert.deepEqual(idle.tap(13), { counted: false });
  }
  const early = createOneTap({ help: createHelpFor(TAP_HELP.sun) });
  assert.deepEqual(early.tap(1), { counted: false });
  early.update(100);
  assert.deepEqual(early.events(), []);
  early.start(101);
  assert.deepEqual(early.events().map(e => e.type), ['want']);
});

test('time that does not pass holds every wait', () => {
  const one = createOneTap({ help: createHelpFor(TAP_HELP.sun) }); one.start(0);
  one.events();
  for (let i = 0; i < 50; i++) one.update(5.9);
  assert.deepEqual(one.events(), []);
  assert.deepEqual(one.state(), { waiting: true, done: false });
  const stars = createStars(); stars.start(0);
  stars.events();
  for (let i = 0; i < 50; i++) stars.update(4.9);
  assert.deepEqual(stars.events(), []);
  assert.deepEqual(stars.state(), { lit: [], waiting: true, done: false });
  // a wrong tap at a standing clock still does not move auto or bring a hint
  stars.tap(null, 4.9); stars.tap('x', 4.9);
  assert.deepEqual(stars.events(), []);
  stars.update(5);
  assert.deepEqual(stars.events().map(e => e.type), ['help']);
});

import { createHelp } from '../chapters/kafli6-help.js';
function createHelpFor(seconds) { return createHelp(seconds); }

// ---- the six on the sky (createSkyStars) and their tones (starTone): the drawing's side of the stars' rules ----

/** A stand-in for engine/constellations.js: what it was asked to add and set, and the star it says she has. */
function figuresSpy() {
  const added = new Map();
  const sets = [];
  return {
    added, sets,
    add(key, actor, options) { added.set(key, { actor, ...options }); },
    set(key, state) { sets.push({ key, ...state }); },
    starOf(key) { const a = added.get(key); return { azimuth: a.azimuth, elevation: a.elevation }; },
  };
}

test('the six on the sky: dim as they arrive, glowing as the hint, and lit in her colour her constellation draws out from her star over DRAW_SECONDS', () => {
  assert.equal(DRAW_SECONDS, 2.6);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 1200);
  const actors = Object.fromEntries(keys.map(k => [k, { name: k }]));
  const figures = figuresSpy();
  const sky = createSkyStars({ scene, camera }, { constellations: figures, actors, span: 9 });
  for (const k of keys) assert.equal(sky.state(k).phase, 'away', `${k} not there before it arrives`);
  sky.arrive('kambedla');
  sky.update(camera, 0.5);
  assert.equal(sky.state('kambedla').phase, 'dim');
  assert.equal(sky.state('uggedla').phase, 'away');
  // her tap point is her place on the sky, hung from the camera
  const p = sky.pointOf('kambedla')(new THREE.Vector3());
  const d = p.clone().sub(camera.position).normalize();
  const want = skyDirection(SKY.stars.kambedla.azimuth, SKY.stars.kambedla.elevation);
  assert.ok(d.angleTo(want) < 1e-6, 'at SKY.stars');
  sky.glow('kambedla', true);
  const glowing = [];
  for (let t = 0.5; t < 2.5; t += 1 / 30) { sky.update(camera, t); glowing.push(sky.state('kambedla').level); }
  assert.ok(Math.max(...glowing) > sky.state('uggedla').level + 0.3 && Math.max(...glowing) - Math.min(...glowing) > 0.1, 'stronger, and it breathes');
  sky.glow('kambedla', false);
  sky.update(camera, 2.6);
  assert.equal(sky.state('kambedla').phase, 'dim');
  // lit: her colour, her constellation added where her star is (its head star is this star), and drawn out over DRAW_SECONDS
  const handle = sky.light('kambedla', '#ab85c1');
  assert.equal(sky.state('kambedla').colour, '#ab85c1');
  const added = figures.added.get('kambedla');
  assert.equal(added.actor, actors.kambedla);
  assert.deepEqual([added.azimuth, added.elevation, added.span, added.still], [SKY.stars.kambedla.azimuth, SKY.stars.kambedla.elevation, 9, true]);
  for (let t = 2.6; t < 2.6 + DRAW_SECONDS - 0.05; t += 1 / 30) sky.update(camera, t);
  assert.equal(handle.done, false, 'not whole before DRAW_SECONDS');
  const drawn = figures.sets.filter(e => e.key === 'kambedla').map(e => e.drawn);
  assert.ok(drawn[0] < 0.05 && drawn.every((v, i) => !i || v >= drawn[i - 1]), 'it grows');
  sky.update(camera, 2.6 + DRAW_SECONDS + 0.01);
  assert.equal(handle.done, true);
  assert.equal(figures.sets.at(-1).drawn, 1);
  assert.equal(sky.state('kambedla').phase, 'lit');
  // a lit star does not glow again or go dim
  sky.glow('kambedla', true);
  sky.dim('kambedla');
  assert.equal(sky.state('kambedla').phase, 'lit');
  sky.dispose();
  assert.equal(scene.children.length, 0, 'it leaves nothing in the scene');
});

test('a star\'s tone is the effects\' bell at SONG.motif[n]', () => {
  const heard = [];
  const s = { sfx: (name, detail) => heard.push([name, detail]) };
  for (let n = 0; n < 6; n++) starTone(s, n);
  assert.deepEqual(heard.map(([name]) => name), Array(6).fill('starBell'));
  assert.deepEqual(heard.map(([, d]) => d.frequency), SONG.motif);
});
