// Borðmynd (a phantogram): the geometry of a 3D picture made for a screen LYING FLAT on a table, watched through the red/cyan
// glasses from one place, looking down at it at about 45 degrees (chapters/bord3d.js). The picture is drawn so that a figure seems
// to stand up out of the screen, on the table. Pure: no page, no renderer (tests/bord3d.test.mjs).
//
// The table's frame, in real units (cm): the origin is the centre of the screen's rectangle, x runs to the viewer's right, y up out
// of the screen and z toward the viewer, so the screen's bottom edge (z = +Hs/2) is the one nearest the viewer. The point between
// the eyes is E = (0, R·sin a, R·cos a): R from the screen's centre, a the elevation; the eyes are E ± (ipd/2, 0, 0).
//
// Each eye's camera stands AT that eye and looks straight DOWN, perpendicular to the screen, with its "up" away from the viewer
// (-z), through an off-axis frustum whose window IS the screen's rectangle on the plane y = 0 (the generalized perspective
// projection for a screen that does not face the eye). So everything on the plane y = 0 has no parallax at all, in both eyes, and a
// point h above the screen has ipd·h/(ey − h) of it on the screen, crossed: it stands out of the screen.
//
// The virtual world is scaled to the table, not the other way round: `scale` is how many virtual units (metres) one real unit (cm)
// is, and the cameras stand at the eyes' places times that.
import * as THREE from 'three';

const rad = d => (d * Math.PI) / 180;

/** The eye cameras' turn: looking along -y, "up" along -z, their right along +x (a quarter turn about x). */
export const DOWN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Real cm in one CSS pixel of a screen `inches` across its diagonal and `screenWidth` x `screenHeight` CSS pixels big. */
export function cmPerPixel(inches, screenWidth, screenHeight) {
  return (inches * 2.54) / Math.hypot(screenWidth, screenHeight);
}

/**
 * The eyes over a screen W wide and Hs deep (real units), seen from R away at elevation a (degrees), ipd apart; near and far are the
 * cameras' own, in virtual units, and `scale` is virtual units in a real one. Returns { left, right, mid, height, scale }: each eye
 * (mid is the point between them, a one-eyed picture) is { x, y, z, l, r, t, b, near, far }: its place over the screen's centre in
 * virtual units and its frustum for makePerspective; `height` is the eyes' height over the screen in real units (ey).
 */
export function tableEyes({ W, Hs, R, a, ipd, near, far, scale = 1 }) {
  const ey = R * Math.sin(rad(a));
  const ez = R * Math.cos(rad(a));
  const k = near / ey; // the window's sides, measured at ey, brought to the near plane (the scale cancels)
  const eye = ex => ({
    x: ex * scale, y: ey * scale, z: ez * scale,
    l: (-W / 2 - ex) * k, r: (W / 2 - ex) * k, t: (ez + Hs / 2) * k, b: (ez - Hs / 2) * k,
    near, far,
  });
  return { left: eye(-ipd / 2), right: eye(ipd / 2), mid: eye(0), height: ey, scale };
}

/** Put a camera at an eye (tableEyes), the screen's centre at `origin` ([x, y, z], virtual units) in the world. */
export function placeEye(camera, eye, origin = [0, 0, 0]) {
  camera.position.set(origin[0] + eye.x, origin[1] + eye.y, origin[2] + eye.z);
  camera.quaternion.copy(DOWN);
  camera.near = eye.near;
  camera.far = eye.far;
  camera.updateMatrixWorld(true);
  camera.projectionMatrix.makePerspective(eye.l, eye.r, eye.t, eye.b, eye.near, eye.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}

/** Where the ray from an eye ({ x, y, z }) through the point (px, py, pz) meets the screen's plane: [x, z], in the same frame and units. */
export function onTable(eye, px, py, pz, out = [0, 0]) {
  const t = eye.y / (eye.y - py);
  out[0] = eye.x + (px - eye.x) * t;
  out[1] = eye.z + (pz - eye.z) * t;
  return out;
}

/** The parallax on the screen of a point h above it (the left eye's picture of it lies that far to the right of the right eye's). */
export function parallaxAt(h, eyeHeight, ipd) {
  return (ipd * h) / (eyeHeight - h);
}

/**
 * The box round a figure's picture on the screen, both eyes': `clouds` is a list of Float32Arrays of points (x, y, z, ... in the
 * world, virtual units), `eyes` the eyes to draw it for (tableEyes) and `origin` [x, z] where the screen's centre is in the world.
 * Returns { x0, x1, z0, z1, top }: the picture's reach in the table's frame (virtual units; z0 is its far side, the screen's top) and
 * the figure's highest point's height.
 */
export function outlineBox(clouds, eyes, origin = [0, 0]) {
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, top: -Infinity };
  for (const cloud of clouds) {
    for (let i = 0; i < cloud.length; i += 3) {
      const px = cloud[i] - origin[0], py = cloud[i + 1], pz = cloud[i + 2] - origin[1];
      if (py > box.top) box.top = py;
      for (const eye of eyes) {
        const t = eye.y / (eye.y - py);
        const x = eye.x + (px - eye.x) * t, z = eye.z + (pz - eye.z) * t;
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (z < box.z0) box.z0 = z;
        if (z > box.z1) box.z1 = z;
      }
    }
  }
  return box;
}

/**
 * Where the screen's centre must be in the world ([x, z]) for the figure's picture (outlineBox) to lie in the middle of the screen,
 * between left and right and between top and bottom. Moving the screen by d moves each point's picture the other way by d times
 * ey/(ey − h), a little more than d for the high ones, so a few rounds settle it.
 */
export function centreOnTable(clouds, eyes, origin = [0, 0], rounds = 12) {
  const at = [origin[0], origin[1]];
  for (let i = 0; i < rounds; i++) {
    const box = outlineBox(clouds, eyes, at);
    const dx = (box.x0 + box.x1) / 2, dz = (box.z0 + box.z1) / 2;
    at[0] += dx;
    at[1] += dz;
    if (Math.abs(dx) + Math.abs(dz) < 1e-7) break;
  }
  return at;
}

/**
 * The picture's distance to each edge of a screen W wide and Hs deep (the box and the screen in the same units), as shares of that
 * edge's own direction (left and right of the width, top and bottom of the depth); negative: it is cut by that edge.
 */
export function marginsOf(box, W, Hs) {
  return {
    left: (box.x0 + W / 2) / W, right: (W / 2 - box.x1) / W,
    top: (box.z0 + Hs / 2) / Hs, bottom: (Hs / 2 - box.z1) / Hs,
  };
}
