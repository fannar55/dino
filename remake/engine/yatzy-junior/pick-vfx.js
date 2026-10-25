import * as THREE from 'three';

// "Pick these dice": when the lesson (or the idle hint) wants the child to keep certain dice, each of them gets, on the table under
// it, a soft gold glow that pulses, a ring that breathes out, a few sparkles rising beside it, and a little hop of the die itself,
// every 1.5 s until the child acts. Under reduced motion only the glow shows, steady. Everything lies on the table or rises from
// it, so nothing is a box that can meet the cards.
//
//   createPickEffects(world)  ->  { show(indices), update(dt, dice, reduced), lift(dice, sign), dispose() }
//     show(indices)       the dice to point at (an array of indices, empty for none)
//     update(dt, dice, r) follows the dice (their meshes) and advances the pulse; r: reduced motion
//     lift(dice, sign)    adds (+1) or takes back (-1) the hop on the die meshes, around a render only, so the hit areas stay still
const CYCLE = 1.5, SPARKS = 4, GOLD = new THREE.Color('#ffd66e');

function radialTexture(stops) {
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'), gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  g.fillStyle = gradient; g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createPickEffects(world) {
  const group = new THREE.Group(); group.name = 'Pick these dice'; world.scene.add(group);
  const tableY = world.table.y;
  // Normal blending, not additive: gold added onto green felt turns lime.
  const glowTexture = radialTexture([[0, 'rgba(255,228,140,1)'], [.35, 'rgba(255,206,84,.85)'], [.7, 'rgba(246,186,52,.35)'], [1, 'rgba(242,182,48,0)']]);
  const sparkTexture = radialTexture([[0, 'rgba(255,255,235,1)'], [.3, 'rgba(255,224,130,.9)'], [1, 'rgba(255,200,80,0)']]);
  const glowGeometry = new THREE.PlaneGeometry(.82, .82).rotateX(-Math.PI / 2);
  const ringGeometry = new THREE.RingGeometry(.205, .232, 48).rotateX(-Math.PI / 2);
  const slots = Array.from({ length: 5 }, () => {
    const glow = new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0, toneMapped: false }));
    const sparks = Array.from({ length: SPARKS }, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
    for (const object of [glow, ring, ...sparks]) { object.visible = false; object.frustumCulled = false; object.renderOrder = 2; group.add(object); }
    return { glow, ring, sparks, on: false, time: 0, hop: 0 };
  });
  let disposed = false;

  function show(indices = []) {
    const wanted = new Set(indices);
    slots.forEach((slot, i) => {
      const on = wanted.has(i);
      if (on && !slot.on) slot.time = 0; // a fresh call starts its beat from the top
      slot.on = on;
    });
  }

  function update(dt, dice, reduced) {
    if (disposed) return;
    slots.forEach((slot, i) => {
      const die = dice[i], on = slot.on && die?.visible;
      slot.glow.visible = on; slot.ring.visible = on && !reduced;
      for (const spark of slot.sparks) spark.visible = on && !reduced;
      slot.hop = 0;
      if (!on) return;
      slot.time += dt;
      const { x, z } = die.position, phase = (slot.time % CYCLE) / CYCLE;
      slot.glow.position.set(x, tableY + .004, z);
      if (reduced) { slot.glow.material.opacity = .7; slot.glow.scale.setScalar(1); return; }
      const pulse = .5 - .5 * Math.cos(phase * Math.PI * 2); // 0 → 1 → 0 over a beat
      slot.glow.material.opacity = .6 + .4 * pulse; slot.glow.scale.setScalar(.92 + .16 * pulse);
      // The ring breathes out from the die's foot and fades.
      slot.ring.position.set(x, tableY + .006, z); slot.ring.scale.setScalar(1 + .55 * phase); slot.ring.material.opacity = 1 - phase * phase;
      // Sparkles rise beside the die, one after another.
      slot.sparks.forEach((spark, k) => {
        const t = (phase + k / SPARKS) % 1, angle = (k / SPARKS) * Math.PI * 2 + i;
        spark.position.set(x + Math.cos(angle) * .2, tableY + .06 + t * .34, z + Math.sin(angle) * .2);
        spark.scale.setScalar(.065 * (1 - t * .45)); spark.material.opacity = Math.sin(t * Math.PI);
      });
      // A little hop at the top of each beat.
      slot.hop = phase < .22 ? Math.sin((phase / .22) * Math.PI) * .07 : 0;
    });
  }

  function lift(dice, sign) {
    slots.forEach((slot, i) => { if (slot.hop && dice[i]) { dice[i].position.y += sign * slot.hop; dice[i].updateMatrixWorld(); } });
  }

  function dispose() {
    if (disposed) return; disposed = true;
    group.removeFromParent();
    for (const slot of slots) for (const object of [slot.glow, slot.ring, ...slot.sparks]) object.material.dispose();
    glowGeometry.dispose(); ringGeometry.dispose(); glowTexture.dispose(); sparkTexture.dispose();
  }

  return { show, update, lift, dispose };
}
