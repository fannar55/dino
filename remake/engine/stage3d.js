// The still stage of a 3D show (chapters/fidrildi3d.js, chapters/gramedla3d.js): one camera that does not move, its tilt solved
// once so the ground at the bottom edge is no nearer than a share of the screen plane's distance D, and the geometry that lays a
// show out in the frame, not in the world: a point is (u, v, k), u and v its place in the frame (0..1 from the top left) and k its
// depth as a share of D (engine/gler.js: the parallax at depth k·D is strength·(1/k − 1) of the screen's width).
//
// Every place of a show is solved in one fixed frame, STAGE_ASPECT with the show's fov, not in the screen's own: the engine keeps
// the 16:10 width on narrower screens and the height on wider ones (director.effectiveFov), so that frame is always inside the
// screen's, and a flight beside an animal lands in the same place on every shape of screen.
//
//   const stage = createStage(world, { position, look, fov, groundShare, depth, plane });
//   stage.camPos, stage.camTarget (the screen's camera), stage.pitch, stage.stagePitch, stage.stageCam, stage.probeCam
//   stage.framePoint(u, v, k, out?, cam = stageCam, d = plane())   the world point there
//   stage.frameOf(p, cam = world.camera, d = plane())               [u, v, k] of a world point
//   stage.groundEdgeDepth(cam, x = 0)                                the ground's depth at the bottom edge, x in -1..1 across it
import * as THREE from 'three';

export const STAGE_ASPECT = 16 / 10;
const rad = d => (d * Math.PI) / 180;

/**
 * position: the camera's place [x, y, z]; look: the heading it looks along (degrees, 0 is +X, -90 is -Z); fov: vertical, degrees,
 * of the stage's frame; groundShare and depth: the tilt is the least (in quarter degrees) that keeps the ground at the bottom edge
 * at groundShare · depth or further; plane: () => D now (the default depth of framePoint and frameOf).
 */
export function createStage(world, { position, look, fov, groundShare, depth, plane }) {
  const { camera, director } = world;
  const v = new THREE.Vector3();
  const probeCam = new THREE.PerspectiveCamera();
  const stageCam = new THREE.PerspectiveCamera(); // the stage's fixed frame (STAGE_ASPECT, fov), from the camera's place

  const depthOf = (cam, p) => -v.copy(p).applyMatrix4(cam.matrixWorldInverse).z;
  function groundEdgeDepth(cam, x = 0) {
    const dir = new THREE.Vector3(x, -1, 0.5).unproject(cam).sub(cam.position).normalize();
    if (dir.y > -0.01) return Infinity;
    let t = (0 - cam.position.y) / dir.y;
    for (let i = 0; i < 3; i++) t = (world.heightAt(cam.position.x + dir.x * t, cam.position.z + dir.z * t) - cam.position.y) / dir.y;
    return t * dir.dot(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion));
  }
  function poseCam(cam, at, target, f, stage = false) {
    cam.fov = stage ? f : director.effectiveFov(f);
    cam.aspect = stage ? STAGE_ASPECT : camera.aspect;
    cam.near = camera.near;
    cam.far = camera.far;
    cam.position.copy(at);
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return cam;
  }
  /** The world point at (u, v) in the stage's frame (stageCam unless `cam` is given), k·D deep (view-space depth). */
  function framePoint(u, vv, k, out = new THREE.Vector3(), cam = stageCam, d = plane()) {
    const tanV = Math.tan(rad(cam.fov) / 2);
    const dep = k * d;
    out.set((2 * u - 1) * tanV * cam.aspect * dep, (1 - 2 * vv) * tanV * dep, -dep);
    return out.applyMatrix4(cam.matrixWorld);
  }
  /** (u, v, k) of a world point, in the screen's own frame (the show's camera unless `cam` is given: stageCam for the stage's). */
  function frameOf(p, cam = camera, d = plane()) {
    const dep = depthOf(cam, p);
    const ndc = v.copy(p).project(cam);
    return [0.5 + 0.5 * ndc.x, 0.5 - 0.5 * ndc.y, dep / d];
  }

  // the camera's tilt, solved once: the screen's (its own shape) and the stage's (STAGE_ASPECT)
  const camPos = new THREE.Vector3(...position);
  const ahead = [Math.cos(rad(look)), Math.sin(rad(look))];
  const solve = (cam, stage) => {
    let p = 0;
    for (; p < 30; p += 0.25) {
      const target = camPos.clone().add(new THREE.Vector3(ahead[0], Math.tan(rad(p)), ahead[1]));
      if (groundEdgeDepth(poseCam(cam, camPos, target, fov, stage)) >= groundShare * depth) break;
    }
    return p;
  };
  const toward = p => camPos.clone().add(new THREE.Vector3(ahead[0] * 10, Math.tan(rad(p)) * 10, ahead[1] * 10));
  const pitch = solve(probeCam, false);
  const camTarget = toward(pitch);
  poseCam(probeCam, camPos, camTarget, fov);
  const stagePitch = solve(stageCam, true);
  poseCam(stageCam, camPos, toward(stagePitch), fov, true);

  return { camPos, camTarget, pitch, stagePitch, stageCam, probeCam, ahead, depthOf, groundEdgeDepth, poseCam, framePoint, frameOf };
}
