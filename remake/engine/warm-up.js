import * as THREE from 'three';

// The warm-up draw. The first frame that draws a material builds its shader programs, and on ANGLE's D3D11 backend (the laptop's
// Edge and Chrome; the tablet's Chrome has the same kind of cost) that takes 0.2 to 0.6 s of a frame. renderer.compile() and
// compileAsync() leave most of it to the first draw, so only a draw pays it. A chapter's first play would stall wherever something
// is drawn for the first time (the first blink, the ride, the critters, the glade's glimmer) and each stall makes the music jump.
// So the warm-up draws all of it once where nobody sees a frame: behind the start button, and in a change of place while the
// screen is black (main.js keeps the fade over the canvas meanwhile).
//
//   warmUp(renderer, scene, camera, { objects, shots })  -> { draws, ms, programs }
//
//   objects  Object3Ds to draw in every shot whatever their state: each, everything under it and everything above it is shown
//            and not frustum-culled for the warm-up, wherever it stands (an actor not yet in the story, a saddle not yet popped
//            on, eyelids that show only while shut, a throwaway flower). A mesh that only takes part in the shadow pass (it hides
//            itself in onAfterShadow, as the forest's and the characters' casters do) is left to that pass, which shows it.
//   shots    the views to draw: { position, target, fov } (vectors or [x, y, z]; fov the vertical lens) or a function that poses
//            the camera, and whatever goes with the view (the shadow's focus, the forest's culling). With none it draws the camera
//            as it is.
//
// Each draw renders the whole scene with the shadow pass, into the canvas: three picks the tone mapping and the output colour
// space by render target, so a draw into a target of its own would build other programs than the ones the game draws with.
// Afterwards every flag and the camera are as they were, and a 1-pixel read waits for the GPU, so what the draws cost is paid
// here. `programs` is how many shader programs the draws built.
const ownShadow = THREE.Object3D.prototype.onAfterShadow;
const vec = (value, out) => (Array.isArray(value) ? out.fromArray(value) : out.copy(value));

export function warmUp(renderer, scene, camera, { objects = [], shots = [] } = {}) {
  const started = performance.now();
  const programsBefore = renderer.info.programs?.length ?? 0;
  const flags = new Map(); // object -> { visible, frustumCulled }: what to put back
  const keep = o => { if (!flags.has(o)) flags.set(o, { visible: o.visible, frustumCulled: o.frustumCulled }); };
  const was = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(), fov: camera.fov, zoom: camera.zoom };
  const target = new THREE.Vector3();
  let draws = 0;
  try {
    for (const root of objects) {
      for (let o = root.parent; o; o = o.parent) {
        keep(o);
        o.visible = true;
      }
      root.traverse(o => {
        if (o.onAfterShadow !== ownShadow) return; // a shadow-only caster: its pass shows it
        keep(o);
        o.visible = true;
        o.frustumCulled = false;
      });
    }
    for (const shot of shots.length ? shots : [null]) {
      if (typeof shot === 'function') shot(camera);
      else if (shot) {
        vec(shot.position, camera.position);
        camera.up.set(0, 1, 0);
        camera.lookAt(vec(shot.target, target));
        if (shot.fov) {
          camera.fov = shot.fov;
          camera.updateProjectionMatrix();
        }
      }
      camera.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true; // in case the shadow map is drawn on demand
      renderer.render(scene, camera);
      draws++;
    }
    const gl = renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  } finally {
    for (const [o, f] of flags) {
      o.visible = f.visible;
      o.frustumCulled = f.frustumCulled;
    }
    camera.position.copy(was.position);
    camera.quaternion.copy(was.quaternion);
    camera.up.copy(was.up);
    camera.fov = was.fov;
    camera.zoom = was.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  return { draws, ms: performance.now() - started, programs: (renderer.info.programs?.length ?? 0) - programsBefore };
}
