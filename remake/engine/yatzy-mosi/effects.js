import * as THREE from 'three';

// Two fixed instance pools: airborne dust/glints and brief contact waves on felt.
export function createYatzyEffects(world) {
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
  }
  function clear() { for (const p of particles) p.life = 0; for (const w of waves) w.life = 0; mesh.count = rings.count = 0; }
  return {
    emit, update, clear,
    getStats: () => ({active: mesh.count, capacity: count, waves: rings.count, waveCapacity: waveCount}),
    dispose() { if (disposed) return; disposed = true; clear(); for (const draw of [mesh, rings]) { draw.removeFromParent(); draw.dispose(); draw.geometry.dispose(); draw.material.dispose(); } },
  };
}
