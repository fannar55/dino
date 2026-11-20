// The fast trial's speed you can see (fjor.js), all code-made and cheap: flecks (pollen and bits of leaf) hanging still in the air
// along the line, so they stream past the camera at its speed; leaves bursting off the crowns she clips, flung out and drifting;
// and pale streaks hanging in the air of the climb and the dive, so they rush down (or up) the picture. Each is a function of the
// trial's second (a seek lands on its frame).
import * as THREE from 'three';

const hash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const COLOURS = ['#8fbf4e', '#c9c24a', '#e8a33a', '#a8c95a', '#7fae45', '#f2ecd0', '#e9f2c8'];
const FLECK = { count: 110, spacing: 0.9, behind: 6, ahead: 90 };
const BURST = { count: 150, per: 16, life: 1.9 };
const STREAK = { count: 110, window: 70, length: 3.2 };

export function createFjorFx(world) {
  const scene = world.scene;
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.quadraticCurveTo(-0.1, 0.32, 0.5, 0);
  shape.quadraticCurveTo(-0.1, -0.32, -0.5, 0);
  const geometry = new THREE.ShapeGeometry(shape, 3);
  const make = (count, name) => {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), count);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.count = 0;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) mesh.setColorAt(i, c.set(COLOURS[Math.floor(hash(i, 3) * COLOURS.length)]));
    scene.add(mesh);
    return mesh;
  };
  const flecks = make(FLECK.count, 'fjor flecks');
  const leaves = make(BURST.count, 'fjor leaves');
  // the streaks: thin pale lines, upright
  const pos = new Float32Array(STREAK.count * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const streaks = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
  streaks.name = 'fjor streaks';
  streaks.frustumCulled = false;
  scene.add(streaks);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();

  /**
   * frame: { t, cam: {x, y, z, up, back}, low (the camera near the floor), white, sAt(t) the path's metres flown, placeAt(s) the
   * low line's place [x, y, z, yaw] at s metres (null where it is high), bursts: [{ t, x, y, z, dx, dz }] }.
   */
  function update({ t, cam, low, white, sCam, placeAt, bursts, view: viewCam = null }) {
    // flecks: index j hangs at s = j · spacing along the line, a little to its side and above the floor
    let n = 0;
    // (polish: a fleck shrinks away before it comes nearer than 4.5 m along the view, 6 % out: one did at 15.65 s, 7.6 %)
    const view = viewCam ?? world.camera, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(view.quaternion);
    if (low) {
      const j0 = Math.ceil((sCam - FLECK.behind) / FLECK.spacing), j1 = Math.floor((sCam + FLECK.ahead) / FLECK.spacing);
      for (let j = j0; j <= j1 && n < FLECK.count; j++) {
        const at = placeAt(j * FLECK.spacing);
        if (!at) continue;
        const [x, y, z, yaw] = at;
        const side = (hash(j, 1) - 0.5) * 14, lift = -2.8 + hash(j, 2) * 5.5;
        if (Math.hypot(side, lift) < 3.4) continue; // never close by the camera's line (they would come too far out)
        const psi = (yaw * Math.PI) / 180;
        p.set(x + Math.cos(psi) * side, y + lift, z + Math.sin(psi) * side);
        const spin = t * (1 + hash(j, 4) * 2) + j;
        q.setFromEuler(e.set(spin * 1.3, spin * 2.1, spin * 0.7));
        const depth = (p.x - view.position.x) * fwd.x + (p.y - view.position.y) * fwd.y + (p.z - view.position.z) * fwd.z;
        const fade = depth <= 0 ? 1 : Math.min(1, Math.max(0, (depth - 4.5) / 1.5));
        if (fade <= 0) continue;
        flecks.setMatrixAt(n++, m4.compose(p, q, sc.setScalar((0.08 + 0.08 * hash(j, 5)) * fade * fade * (3 - 2 * fade))));
      }
    }
    flecks.count = n;
    flecks.instanceMatrix.needsUpdate = true;

    // leaves bursting off a crown she clipped: flung out to her side and back, then drifting down and spinning
    n = 0;
    for (const b of bursts) {
      const age = t - b.t;
      if (age < 0 || age > BURST.life) continue;
      for (let i = 0; i < BURST.per && n < BURST.count; i++) {
        const k = b.id * 31 + i;
        const sp = 3 + 5 * hash(k, 6);
        const a = (hash(k, 7) - 0.5) * 2.2;
        const vx = b.dx * Math.cos(a) - b.dz * Math.sin(a), vz = b.dx * Math.sin(a) + b.dz * Math.cos(a);
        const drag = (1 - Math.exp(-2.2 * age)) / 2.2;
        p.set(b.x + vx * sp * drag, b.y + (hash(k, 8) - 0.3) * 3 * drag - 0.6 * age * age, b.z + vz * sp * drag);
        const spin = age * (4 + 6 * hash(k, 9)) + k;
        q.setFromEuler(e.set(spin, spin * 1.7, spin * 0.6));
        const grow = Math.min(1, age / 0.12) * Math.min(1, (BURST.life - age) / 0.4);
        leaves.setMatrixAt(n++, m4.compose(p, q, sc.setScalar((0.2 + 0.15 * hash(k, 10)) * grow)));
      }
    }
    leaves.count = n;
    leaves.instanceMatrix.needsUpdate = true;

    // streaks: hanging at fixed heights round the camera's column, seen while it climbs or dives
    const fast = Math.min(1, Math.max(0, (Math.abs(cam.up) - 6) / 14)) * (1 - white);
    streaks.material.opacity = 0.55 * fast;
    streaks.visible = fast > 0.01;
    if (streaks.visible) {
      for (let i = 0; i < STREAK.count; i++) {
        const r = 5 + 8 * hash(i, 11), a = hash(i, 12) * Math.PI * 2;
        const span = STREAK.window;
        // its height: fixed in the world, wrapped into the window round the camera
        const base = hash(i, 13) * span;
        let y = base + Math.floor((cam.y - base) / span + 0.5) * span;
        if (y - cam.y > span / 2) y -= span;
        const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
        pos.set([x, y, z, x, y + STREAK.length, z], i * 6);
      }
      lineGeo.attributes.position.needsUpdate = true;
    }
  }
  return { update, flecks, leaves, streaks };
}
