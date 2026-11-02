// Speed lines for „Hraðar!“ (chapter 4, spec 6: "hraðalínur birtast"): thin pale streaks rushing past round the edges of the view while
// she bursts. One draw call: a mesh of thin quads in the camera's own frame (drawn where the camera is, whatever moved it this frame),
// each streak bright at its head and gone at its tail, and faded where it comes in and where it goes by. Never lit, never in the fog,
// never casting a shadow. They fade in over 0.3 s and out over 0.6 s: only their strength changes, a frame at a time, so they never
// flash (spec 5: "Ekkert blikk").
//
//   const lines = createSpeedLines(world, camera);   // camera: the one the world is drawn with
//   lines.show(true);    // on (they fade in), or off (they fade out)
//   lines.update(dt);    // every frame: they rush on, and fade
//   lines.level          // 0..1: how strong they are now
//   lines.dispose();
import * as THREE from 'three';

export const SPEED_LINES = {
  count: 36,
  fadeIn: 0.3, // seconds
  fadeOut: 0.6,
  opacity: 0.45, // at full strength
  depth: [-8.5, -0.8], // metres in front of the camera where a streak comes in and goes by
  radius: [1.5, 3.1], // metres off the view's middle, wider across by the aspect: round the edges, clear of her and Egill
  length: [1.4, 2.8], // metres
  width: 0.022,
  speed: 30, // m/s toward the camera
  colour: '#fffaf0', // the journal's card white, a little warm
};

const ease = x => x * x * (3 - 2 * x);

export function createSpeedLines(world, camera, { aspect = 1.6, seed = 7 } = {}) {
  const S = SPEED_LINES;
  const n = S.count;
  let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  const streaks = Array.from({ length: n }, (_, i) => {
    const angle = ((i + random() * 0.8) / n) * Math.PI * 2;
    const radius = S.radius[0] + random() * (S.radius[1] - S.radius[0]);
    return {
      x: Math.cos(angle) * radius * aspect, y: Math.sin(angle) * radius,
      tx: -Math.sin(angle), ty: Math.cos(angle), // across the streak: round the view's middle
      length: S.length[0] + random() * (S.length[1] - S.length[0]),
      z: S.depth[0] + random() * (S.depth[1] - S.depth[0]),
    };
  });
  const positions = new Float32Array(n * 4 * 3);
  const colours = new Float32Array(n * 4 * 4);
  const index = [];
  for (let i = 0; i < n; i++) index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({
    color: S.colour, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  material.name = 'speed-lines';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Speed lines';
  mesh.frustumCulled = false; // it is always in front of the camera
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 20; // over the water (8) and the spray
  mesh.visible = false;
  // drawn in the camera's frame as the camera stands for this very draw (the director moves it after the world's update)
  mesh.onBeforeRender = (renderer, scene, drawnWith) => { mesh.matrixWorld.copy((drawnWith ?? camera).matrixWorld); };
  world.scene?.add(mesh);

  let on = false;
  let level = 0;
  const fadeAt = z => { // in where a streak comes in, out where it goes by
    const k = (z - S.depth[0]) / (S.depth[1] - S.depth[0]);
    return ease(Math.max(0, Math.min(1, k / 0.25, (1 - k) / 0.2)));
  };

  function write() {
    for (let i = 0; i < n; i++) {
      const s = streaks[i];
      const head = s.z;
      const tail = s.z - s.length;
      const w = S.width / 2;
      const p = i * 12;
      // head left, head right, tail left, tail right
      positions.set([s.x - s.tx * w, s.y - s.ty * w, head, s.x + s.tx * w, s.y + s.ty * w, head,
        s.x - s.tx * w, s.y - s.ty * w, tail, s.x + s.tx * w, s.y + s.ty * w, tail], p);
      const a = fadeAt(head);
      const b = 0; // gone at its tail
      const q = i * 16;
      colours.set([1, 1, 1, a, 1, 1, 1, a, 1, 1, 1, b, 1, 1, 1, b], q);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }
  write();

  return {
    get level() { return level; },
    mesh,
    show(value) { on = Boolean(value); },
    update(dt) {
      const step = Math.max(0, dt || 0);
      level = on ? Math.min(1, level + step / S.fadeIn) : Math.max(0, level - step / S.fadeOut);
      material.opacity = S.opacity * ease(level);
      mesh.visible = level > 0;
      if (!mesh.visible) return;
      const span = S.depth[1] - S.depth[0];
      for (const s of streaks) {
        s.z += S.speed * step;
        if (s.z > S.depth[1]) s.z -= span;
      }
      write();
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
