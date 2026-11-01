// The water of Árdalurinn in grey (chapter 4's flight): the river as one ribbon at its level from the Fen to above the falls, broken
// at the lip; the falling water as a plane in front of the cliff; the far pool as a disc. The whole river is one draw call (some two
// thousand triangles), cheaper than a piece per section; the real water with its flow and foam comes in chunk 2 (Task 7).
import * as THREE from 'three';

const STEP = 3; // metres between the ribbon's rows

/** The river's surface: { mesh, levelAt(d) }. */
export function createRiverSurface(route, material) {
  const river = route.river;
  const start = river.points[0].d;
  const end = river.length;
  const positions = [];
  const indices = [];
  const strip = (from, to) => {
    const first = positions.length / 3;
    const rows = Math.max(1, Math.ceil((to - from) / STEP));
    for (let r = 0; r <= rows; r++) {
      const d = Math.min(to, from + r * STEP);
      const at = river.at(d);
      const nx = -at.dir[1];
      const nz = at.dir[0];
      positions.push(at.x + nx * at.half, at.level, at.z + nz * at.half, at.x - nx * at.half, at.level, at.z - nz * at.half);
      if (r > 0) {
        const a = first + (r - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  };
  strip(start, river.falls - 0.01); // below the falls, up to the lip
  strip(river.falls, end); // above it
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // a ribbon may come out facing down where the river turns: make every normal face up
  const n = geometry.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Árdalur river';
  mesh.receiveShadow = true;
  material.side = THREE.DoubleSide;
  return mesh;
}

/** The falling water: a plane in front of the cliff from the lip to the plunge pool. */
export function createFallsSlot(falls, material) {
  const geometry = new THREE.PlaneGeometry(falls.width, falls.top - falls.base);
  geometry.rotateY(Math.PI / 2); // facing east, down the valley
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Árdalur falls (slot)';
  mesh.position.set(falls.face - 0.5, (falls.top + falls.base) / 2, falls.z);
  return mesh;
}

/** The far pool's surface. */
export function createPoolSurface(pool, material) {
  const geometry = new THREE.CircleGeometry(pool.radius + 1, 40);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Árdalur far pool';
  mesh.position.set(pool.center[0], pool.level, pool.center[1]);
  mesh.receiveShadow = true;
  return mesh;
}
