import * as THREE from 'three';

// Warm storybook dust puffs kicked up when a character's foot plants on dry ground. All characters in a
// world share one small pooled InstancedMesh (at most MAX_PUFFS low-poly spheres, one draw call, no
// texture). While puffs are in flight the mesh sits in world.scene and updates on world.effects; as soon
// as the last puff fades out it removes itself from the scene and drops off world.effects so idle scenes
// pay zero draw calls and zero CPU work.

const MAX_PUFFS = 24;
const DURATION = 0.52;
const pools = new WeakMap();
const dummy = new THREE.Object3D();

function getPool(world) {
  let pool = pools.get(world);
  if (pool) return pool;

  const geometry = new THREE.IcosahedronGeometry(0.5, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xeadbc0,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh ? new THREE.InstancedMesh(geometry, material, MAX_PUFFS) : null;
  mesh.name = 'FootstepDust';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 5.8;
  mesh.count = 0;

  const puffs = [];
  let seed = 1;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const effect = {
    label: 'footstep-dust',
    update(dt) {
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.t += dt;
        if (p.t >= p.life) puffs.splice(i, 1);
      }
      if (!puffs.length) {
        mesh.count = 0;
        mesh.removeFromParent();
        return false;
      }
      const n = Math.min(puffs.length, MAX_PUFFS);
      for (let i = 0; i < n; i++) {
        const p = puffs[i];
        const k = p.t / p.life;
        const easeOut = 1 - (1 - k) * (1 - k);
        const swell = Math.sin(Math.PI * Math.min(1, Math.pow(k, 0.62)));
        const r = Math.max(0.001, p.radius * swell);
        dummy.position.set(
          p.x + p.vx * easeOut,
          p.y + p.lift * easeOut + r * 0.35,
          p.z + p.vz * easeOut,
        );
        dummy.scale.set(r * 1.18, r * 0.78, r * 1.18);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    },
  };

  pool = {
    mesh,
    emit(pos, actorHeight = 1.4) {
      const scale = THREE.MathUtils.clamp(actorHeight * 0.055, 0.045, 0.22);
      for (let k = 0; k < 2; k++) {
        if (puffs.length >= MAX_PUFFS) puffs.shift();
        const angle = rand() * Math.PI * 2;
        const spread = scale * (0.55 + rand() * 0.75);
        puffs.push({
          x: pos.x + Math.cos(angle) * scale * 0.35,
          y: pos.y + 0.015,
          z: pos.z + Math.sin(angle) * scale * 0.35,
          vx: Math.cos(angle) * spread,
          vz: Math.sin(angle) * spread,
          lift: scale * (0.9 + rand() * 0.6),
          radius: scale * (k === 0 ? 1 : 0.72),
          life: DURATION * (0.88 + rand() * 0.24),
          t: 0,
        });
      }
      if (mesh.parent !== world.scene) world.scene.add(mesh);
      if (!world.effects.has(effect)) world.effects.add(effect);
    },
  };
  pools.set(world, pool);
  return pool;
}

export function emitFootstepDust(world, pos, actorHeight) {
  if (!world?.scene || !world?.effects) return;
  getPool(world).emit(pos, actorHeight);
}
