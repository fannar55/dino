import * as THREE from 'three';

export function sunDirection(look) {
  const az = THREE.MathUtils.degToRad(look.sun.azimuth);
  const el = THREE.MathUtils.degToRad(look.sun.elevation);
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}

// One shadow-casting sun plus a hemisphere fill. The shadow map covers only a focus sphere
// (usually the hero and the ground around it), which keeps it sharp and cheap on tablets.
export function createLighting(scene, look, q) {
  const direction = sunDirection(look);
  const sun = new THREE.DirectionalLight(look.sun.color, look.sun.intensity);
  sun.castShadow = q.shadowSize > 0;
  sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity);
  scene.add(hemi);

  const focusCentre = new THREE.Vector3();
  let focusRadius = 10;
  let lastRadius = -1;
  const lightSpace = new THREE.Matrix4();
  const invLightSpace = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const negDir = new THREE.Vector3();
  const lastDir = new THREE.Vector3(NaN, NaN, NaN);
  const snapped = new THREE.Vector3();

  // Fit the shadow camera to a sphere. The centre is snapped to whole shadow texels in light space,
  // so a moving focus (a walking hero) does not make shadow edges shimmer.
  function focus(centre, radius = focusRadius) {
    focusCentre.copy(centre);
    focusRadius = radius;
    const cam = sun.shadow.camera;
    if (radius !== lastRadius) {
      lastRadius = radius;
      cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
      cam.near = 0.5; cam.far = radius * 8;
      cam.updateProjectionMatrix();
    }
    const texel = (radius * 2) / Math.max(1, q.shadowSize);
    if (!lastDir.equals(direction)) {
      lastDir.copy(direction);
      lightSpace.lookAt(origin, negDir.copy(direction).negate(), up);
      invLightSpace.copy(lightSpace).invert();
    }
    snapped.copy(centre).applyMatrix4(invLightSpace);
    snapped.x = Math.round(snapped.x / texel) * texel;
    snapped.y = Math.round(snapped.y / texel) * texel;
    snapped.applyMatrix4(lightSpace);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(direction, radius * 4);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }
  focus(focusCentre, focusRadius);

  return { sun, hemi, direction, focus, get focusRadius() { return focusRadius; } };
}
