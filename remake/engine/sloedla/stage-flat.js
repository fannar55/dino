// The menu's stage of Slóeðla's song game without 3D (no WebGL, a model that could not be loaded, or ?3d=0): the three
// dinosaurs of the round as the game's own pictures (assets/eitt/*.webp), standing where the 3D cast stands, swaying, dark when
// out of the round, hopping on the beat. The same face as stage.js; no Egill (there is no picture of him here), so his beam stays
// off.

import { CAMERA, bounce, castLayout, outOf, reactions } from './stage-motion.js';

const PICTURES = { b: 'eitt/stegosaurus-tail.webp', a: 'eitt/parasaurolophus.webp', c: 'eitt/brontosaurus.webp' };
const HEIGHTS = { b: 1.05, a: 1.6, c: 1.85 }; // as the 3D cast (stage-motion.js CAST)
const CHEER_GAP = 0.12; // s between the friends' cheers
const JUMP = 0.45; // s of a cheer's jump

/** Where the world point (x, 0, z) is on a screen `width` × `height` seen by `view` (stage-motion.js CAMERA), and px per unit there. */
function project(x, z, view, width, height) {
  const [px, py, pz] = view.position;
  const [lx, ly, lz] = view.look;
  const norm = v => { const l = Math.hypot(...v) || 1; return v.map(n => n / l); };
  const f = norm([lx - px, ly - py, lz - pz]);
  const r = norm([-f[2], 0, f[0]]); // f × up
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [x - px, -py, z - pz];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const depth = Math.max(0.01, dot(d, f));
  const half = Math.tan((view.fov * Math.PI) / 360);
  const nx = dot(d, r) / (depth * half * (width / height));
  const ny = dot(d, u) / (depth * half);
  return { x: ((nx + 1) / 2) * width, y: ((1 - ny) / 2) * height, unit: height / (2 * depth * half) };
}

/** The flat stage in `root` (an element filling the stage's box); `asset(path)` the address of a file in assets/. */
export function createFlatStage({ root, asset }) {
  const friends = {};
  for (const [id, src] of Object.entries(PICTURES)) {
    const img = root.ownerDocument.createElement('img');
    img.alt = '';
    img.className = 'sl-flat-friend';
    img.dataset.friend = id;
    img.src = asset(src);
    root.append(img);
    friends[id] = { id, img, out: false, x: 0, y: 0, cheerAt: -Infinity, phase: Object.keys(friends).length * 1.7 };
  }
  let choice = null;
  let clock = 0;
  const cheers = [];

  function resize() {
    // hidden (the round plays): nothing to measure, so they keep their places until the stage shows again
    if (!root.clientWidth || !root.clientHeight) return;
    const width = root.clientWidth;
    const height = root.clientHeight;
    const portrait = height > width;
    const layout = castLayout(portrait);
    for (const friend of Object.values(friends)) {
      const spot = project(layout[friend.id].x, layout[friend.id].z, portrait ? CAMERA.tall : CAMERA.wide, width, height);
      friend.x = spot.x;
      friend.y = spot.y;
      const size = HEIGHTS[friend.id] * spot.unit * 1.15;
      Object.assign(friend.img.style, { left: `${spot.x - size / 2}px`, top: `${spot.y - size}px`, width: `${size}px`, height: `${size}px` });
    }
  }
  resize();

  return {
    setChoice({ lanes, level }) {
      const next = { lanes, level };
      const list = reactions(choice, next);
      choice = next;
      const out = outOf(next);
      for (const friend of Object.values(friends)) {
        friend.out = out[friend.id];
        friend.img.classList.toggle('out', friend.out);
      }
      for (const { id, once } of list) if (friends[id] && once) friends[id].cheerAt = clock;
    },
    cheer() {
      ['b', 'a', 'c'].filter(id => !friends[id].out).forEach((id, i) => cheers.push({ at: clock + i * CHEER_GAP, id }));
    },
    frame(dt, beats = null) {
      clock += dt;
      for (let i = cheers.length - 1; i >= 0; i--) {
        if (cheers[i].at > clock) continue;
        friends[cheers[i].id].cheerAt = clock;
        cheers.splice(i, 1);
      }
      const up = beats === null ? 0 : bounce(beats);
      for (const friend of Object.values(friends)) {
        const hop = friend.out ? 0 : up;
        const k = (clock - friend.cheerAt) / JUMP;
        const jump = k >= 0 && k < 1 ? Math.sin(k * Math.PI) : 0;
        const sway = friend.out ? 0 : Math.sin(clock * 1.6 + friend.phase) * 2;
        friend.img.style.transform = `translateY(${(-10 * hop - 26 * jump).toFixed(1)}px) rotate(${sway.toFixed(2)}deg) scale(${(1 - 0.025 * hop).toFixed(3)}, ${(1 + 0.05 * hop).toFixed(3)})`;
      }
    },
    feet() {
      return Object.values(friends).map(friend => ({ id: friend.id, x: friend.x, y: friend.y, out: friend.out }));
    },
    resize,
  };
}
