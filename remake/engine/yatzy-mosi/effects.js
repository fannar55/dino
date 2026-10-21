import * as THREE from 'three';
import { createTableSparks } from './sparks.js';

// Two fixed instance pools: airborne dust/glints and brief contact waves on felt.
//
// `lively` (the junior game, "Litla Yatzy við Mosa") draws the effects as point clouds instead (sparks.js), and adds what a
// six-year-old's table has round it: a dust puff and a ring where each die lands, gold stars round a kept die and a trail of glitter
// behind it on its way to the kept row (trail), a gold burst for a Yatzy, confetti and two volleys of fireworks for a win
// (celebrate), leaves drifting down behind Mosi now and then and motes in the light (ambient), and a butterfly that lands on the
// table's rim between turns and flies off when the cup lifts (betweenTurns, wake). Mosi Yatzy keeps the two pools as they were.
export function createYatzyEffects(world, { lively = false } = {}) {
  if (lively) return createLivelyEffects(world);
  const count = 120, waveCount = 12;
  const particles = Array.from({length: count}, () => ({life: 0, age: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, flat: 1, gravity: 2.7, color: new THREE.Color()}));
  const waves = Array.from({length: waveCount}, () => ({life: 0, age: 0, x: 0, z: 0, radius: 0, color: new THREE.Color()}));
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: .82, depthWrite: false});
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const ringGeometry = new THREE.RingGeometry(.87, 1, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({transparent: true, opacity: .38, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true});
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, waveCount);
  const initialColor = new THREE.Color();
  for (const draw of [mesh, rings]) { for(let i=0;i<draw.count;i++)draw.setColorAt(i,initialColor);draw.instanceMatrix.setUsage(THREE.DynamicDrawUsage); draw.frustumCulled = false; draw.count = 0; world.scene.add(draw); }
  let cursor = 0, waveCursor = 0, seed = 71, disposed = false;
  const dummy = new THREE.Object3D(), fadeColor = new THREE.Color();
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  function emit(position, {kind = 'impact', strength = 1, reduced = false} = {}) {
    if (reduced || disposed) return;
    const celebration = ['score', 'great', 'yatzy'].includes(kind);
    const dust = kind === 'impact' || kind === 'sweep';
    const total = kind === 'yatzy' ? 78 : celebration ? 44 : kind === 'hold' ? 12 : kind === 'bad' ? 4 : kind === 'settle' ? 5 : kind === 'release' ? 3 : Math.ceil(Math.max(0, strength) * 9);
    for (let i = 0; i < total; i++) {
      const p = particles[cursor++ % count], angle = random() * Math.PI * 2;
      p.age = 0; p.life = (celebration ? 1.1 : dust ? .25 : .4) + random() * (celebration ? .7 : .3);
      p.x = position.x; p.y = position.y + .025; p.z = position.z;
      const speed = (celebration ? .85 : dust ? .40 : .18) * (random() + .35);
      p.vx = Math.cos(angle) * speed; p.vz = Math.sin(angle) * speed;
      p.vy = (celebration ? 1.5 : dust ? .15 : .3) + random() * (celebration ? 1 : .25);
      p.size = (celebration ? .034 : kind === 'release' ? .010 : .014) * (random() + .5);
      p.flat = celebration ? .25 : dust ? .45 : 1; p.gravity = celebration ? 2.7 : dust ? 1.5 : .7;
      p.color.set(dust ? (i % 2 ? '#a3bb89' : '#d5d3ad') : kind === 'bad' ? '#b7c8bf' : i % 4 === 0 ? '#c1eee0' : i % 3 ? '#ffd46c' : '#fff4c7');
    }
    if (['impact', 'hold', 'settle', 'great', 'yatzy', 'bad'].includes(kind)) {
      const w = waves[waveCursor++ % waveCount];
      w.life = kind === 'great' || kind === 'yatzy' ? .75 : .42; w.age = 0; w.x = position.x; w.z = position.z;
      w.radius = kind === 'great' || kind === 'yatzy' ? .75 : kind === 'hold' ? .34 : .16 + .18 * strength;
      w.color.set(kind === 'bad' ? '#86a7a0' : kind === 'impact' ? '#b8c2a1' : '#ffe0a0');
    }
  }
  function update(dt) {
    if (dt <= 0 || disposed) return;
    let active = 0;
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.age += dt; if (p.age >= p.life) { p.life = 0; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= p.gravity * dt;
      if (p.y < world.table.y + .015) { p.y = world.table.y + .015; p.vy = Math.abs(p.vy) * .2; p.vx *= .7; p.vz *= .7; }
      const size = p.size * Math.min(1, (1 - p.age / p.life) * 2);
      dummy.position.set(p.x, p.y, p.z); dummy.scale.set(size, size * p.flat, size);
      dummy.rotation.set(p.age * 2, p.age * 3, p.age); dummy.updateMatrix();
      mesh.setMatrixAt(active, dummy.matrix); mesh.setColorAt(active++, p.color);
    }
    flush(mesh, active);
    active = 0;
    for (const w of waves) {
      if (w.life <= 0) continue;
      w.age += dt; if (w.age >= w.life) { w.life = 0; continue; }
      const t = w.age / w.life, size = .045 + w.radius * (1 - (1 - t) ** 2);
      dummy.position.set(w.x, world.table.y + .014, w.z); dummy.scale.setScalar(size); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.updateMatrix();
      rings.setMatrixAt(active, dummy.matrix); rings.setColorAt(active++, fadeColor.copy(w.color).multiplyScalar((1 - t) ** 2));
    }
    flush(rings, active);
  }
  function flush(draw, active) {
    if (draw.count || active) { draw.count = active; draw.instanceMatrix.needsUpdate = true; if (draw.instanceColor) draw.instanceColor.needsUpdate = true; }
    draw.visible = active > 0; // an empty pool costs no draw call
  }
  function clear() { for (const p of particles) p.life = 0; for (const w of waves) w.life = 0; mesh.count = rings.count = 0; }
  return {
    emit, update, clear,
    getStats: () => ({active: mesh.count, capacity: count, waves: rings.count, waveCapacity: waveCount}),
    dispose() { if (disposed) return; disposed = true; clear(); for (const draw of [mesh, rings]) { draw.removeFromParent(); draw.dispose(); draw.geometry.dispose(); draw.material.dispose(); } },
  };
}

// Where a butterfly may sit on the rail's top, in the table's frame: on the far rail right of Mosi, and on the right-hand rail, both
// over the wood beside the felt, clear of the dice, the cup and the cards.
const PERCHES = [[1.72, -2.03], [2.32, -2.03], [3.03, -.6]];

function createLivelyEffects(world) {
  const { table } = world, sparks = createTableSparks(world.scene, world.camera, world.renderer);
  const trails = [], at = new THREE.Vector3(), perch = new THREE.Vector3();
  let leafTime = 1.5, moteTime = 0, ambient = false, disposed = false, seed = 4111, butterfly = null, turns = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rand = (a, b) => a + random() * (b - a);
  const felt = (position, lift = 0) => at.set(position.x, table.y + .012 + lift, position.z);

  function emit(position, { kind = 'impact', strength = 1, reduced = false } = {}) {
    if (reduced || disposed || !position) return;
    const s = THREE.MathUtils.clamp(Number(strength) || 0, 0, 1);
    if (kind === 'impact') { sparks.dust(felt(position), s); if (s > .25) sparks.ring(felt(position), .1 + .12 * s, { alpha: .55 + .35 * s }); }
    else if (kind === 'settle') { sparks.dust(felt(position), .12); sparks.ring(felt(position), .08, { alpha: .35, life: .4 }); }
    else if (kind === 'sweep') sparks.dust(felt(position), .2);
    else if (kind === 'hold') { sparks.stars(felt(position, .08)); sparks.ring(felt(position), .13, { colour: new THREE.Color('#ffe08a'), alpha: .85, life: .5 }); }
    else if (kind === 'lift') sparks.stars(felt(position, .12), { count: 5, rise: .9, radius: .12 });
    else if (kind === 'good' || kind === 'score') sparks.burst(felt(position, .05), { scale: kind === 'score' ? .8 : .65 });
    else if (kind === 'great') sparks.burst(felt(position, .05), { scale: 1.1 });
    else if (kind === 'yatzy') sparks.gold(felt(position));
  }
  /** Glitter left behind `object` (a die mesh) for `seconds` as it moves. */
  function trail(object, seconds = .36) { if (!disposed && object) trails.push({ object, t: 0, seconds, wait: 0 }); }
  /** A win: confetti over the table, and two volleys of fireworks over it, left and right of Mosi. */
  function celebrate() {
    if (disposed) return;
    const centre = at.set(-.2, table.y, -.1).clone();
    sparks.confetti(centre);
    const volley = (delay, xs) => xs.forEach((x, i) => sparks.firework(new THREE.Vector3(x, table.y + .2, -1.45 + i * .25), { height: rand(1.45, 1.9), delay: delay + i * .28 }));
    volley(.25, [-1.7, 1.55, -.6]);
    volley(1.55, [1.1, -1.25, 2.1]);
    sparks.later(1.4, () => sparks.confetti(centre, { count: 50, spread: 1 }));
  }
  /** Now and then, as a turn passes, a butterfly from the clearing comes to sit on the table's rim. */
  function betweenTurns() {
    const flock = world.forest?.butterflies;
    if (disposed || !flock || butterfly || turns++ % 3 !== 1) return false;
    const [x, z] = PERCHES[Math.floor(random() * PERCHES.length)];
    perch.set(x, table.y + .118, z);
    try { const handle = flock.land(perch.clone(), { duration: 2.4 }); butterfly = handle.label?.split(' ')[0] || null; return true; }
    catch { butterfly = null; return false; }
  }
  /** The cup lifts: a butterfly sitting on the rim flies off. */
  function wake() {
    if (!butterfly) return;
    try { world.forest?.butterflies?.flutter(butterfly); } catch { /* the forest may be gone */ }
    butterfly = null;
  }
  function update(dt) {
    if (disposed || !(dt > 0)) return;
    for (let i = trails.length - 1; i >= 0; i--) {
      const trail = trails[i]; trail.t += dt; trail.wait -= dt;
      if (trail.wait <= 0) { trail.wait = .028; sparks.glitter(trail.object.position, 2); }
      if (trail.t >= trail.seconds) trails.splice(i, 1);
    }
    if (ambient) {
      // A leaf let go high behind Mosi every few seconds, and a handful of motes drifting in the light over the table.
      if ((leafTime -= dt) <= 0) { leafTime = rand(2.6, 5.4); sparks.leaf(at.set(rand(-2.8, 2.8), rand(3.45, 3.8), rand(-4.4, -2.9))); }
      if ((moteTime -= dt) <= 0) { moteTime = rand(.45, .75); sparks.mote(at.set(rand(-2.6, 2.4), table.y + rand(.25, 1.1), rand(-1.6, 1.3))); }
    }
    sparks.update(dt);
  }
  function clear() { trails.length = 0; sparks.clear(); wake(); }
  return {
    emit, update, clear, trail, celebrate, betweenTurns, wake, sparks,
    setAmbient(on) { ambient = Boolean(on); },
    get butterfly() { return butterfly ? perch : null; },
    getStats: () => ({ ...sparks.getStats(), trails: trails.length, ambient, butterfly }),
    dispose() { if (disposed) return; clear(); disposed = true; sparks.dispose(); },
  };
}
