// The menu's stage in Slóeðla's song game: the evening Fen with Egill and the three dinosaurs of the round, the owner's Tripo
// models (assets/characters/*.glb) with their own moves. This file is the stage's rules, plain numbers with no drawing: who
// stands where, how each friend answers the child's picks, the dance locked to the beat of the picked song's preview, and the
// gold ring that fills while a song loads. stage.js (three.js) and stage-flat.js (the game's pictures) draw by them.

/**
 * The cast: `file` its model, `x`/`z` where it stands (world units, the camera looks down -z), `height` how tall it is drawn,
 * `heading` the way it faces in degrees (90 faces the camera; the models are made facing +x), and its clips: `rest` while
 * nothing happens, `cheer` once when it is glad, `away` while it is out of the round, `dance` to the beat.
 * Roles as in the round: b Kambeðla, a Slóeðla, c Þórseðla.
 */
export const CAST = {
  egill: { file: 'egill', x: -2.9, z: 1.9, height: 0.85, heading: 60, rest: 'idle', cheer: 'wave', away: 'sit', dance: 'hop' },
  b: { file: 'stegosaurus', x: -1.85, z: 0, height: 1.05, heading: 70, rest: 'idle', cheer: 'happy', away: 'eat', dance: 'happy' },
  a: { file: 'parasaurolophus', x: 0.05, z: -0.4, height: 1.6, heading: 88, rest: 'idle', cheer: 'call', away: 'idle', dance: 'happy' },
  c: { file: 'brontosaurus', x: 2.1, z: -0.1, height: 1.85, heading: 108, rest: 'idle', cheer: 'happy', away: 'idle', dance: 'happy' },
};

/** The camera on a wide screen and on an upright one. */
export const CAMERA = {
  wide: { fov: 32, position: [0, 1.15, 9.2], look: [0, 0.5, 0] },
  tall: { fov: 50, position: [0, 1.5, 10.5], look: [0, 0.55, 0] },
};

/** Where each friend stands: on an upright screen they stand closer together and Egill comes to the front. */
export function castLayout(portrait) {
  const layout = {};
  for (const [id, friend] of Object.entries(CAST)) layout[id] = portrait ? { x: friend.x * 0.56, z: friend.z } : { x: friend.x, z: friend.z };
  if (portrait) layout.egill = { x: -1.15, z: 2.6 };
  return layout;
}

/** Who sits this round out: Egill when a grown-up plays, Kambeðla with two dinosaurs. */
export function outOf({ lanes, level }) {
  return { egill: level === 'fullordinn', b: lanes === 2, a: false, c: false };
}

/**
 * How the stage answers a pick, from the choice `before` it to the one `after`: [{ id, clip, once, out }] (`once` plays the clip
 * one time and goes back to rest; otherwise it stays). Nothing the first time (`before` null). Egill sits (or waves) and
 * Kambeðla eats (or is glad) only when their part changed; Slóeðla calls and Þórseðla is glad at every pick.
 */
export function reactions(before, after) {
  if (!before) return [];
  const was = outOf(before);
  const now = outOf(after);
  const list = [];
  for (const id of ['egill', 'b']) {
    if (was[id] === now[id]) continue;
    list.push({ id, clip: now[id] ? CAST[id].away : CAST[id].cheer, once: !now[id], out: now[id] });
  }
  list.push({ id: 'a', clip: 'call', once: true, out: false });
  list.push({ id: 'c', clip: 'happy', once: true, out: false });
  return list;
}

/**
 * The friend a tap at (`x`, `y`) on the stage is on, "Spilum saman" (Egill picks his dinosaur): of `feet` ([{ id, x, y }], each
 * friend's feet on the screen, y down), the one whose feet are nearest `x` within `reach` px and above whose feet the tap is;
 * never Egill. Null when the tap is on none.
 */
export function nearestFriend(feet, x, y, { reach = 120 } = {}) {
  let best = null;
  for (const foot of feet) {
    if (foot.id === 'egill' || y > foot.y) continue;
    const off = Math.abs(x - foot.x);
    if (off <= reach && (!best || off < best.off)) best = { id: foot.id, off };
  }
  return best ? best.id : null;
}

/** The hop on the beat, 0..1: up and down in the first half of each beat, still in the second. */
export function bounce(beats) {
  const f = ((beats % 1) + 1) % 1;
  return f < 0.5 ? Math.sin((f / 0.5) * Math.PI) : 0;
}

/** How many beats a dance move of `clipSeconds` spans at `bpm`: the power of two (1, 2, 4 or 8) nearest its own length. */
export function loopBeats(clipSeconds, bpm) {
  const ratio = clipSeconds / (60 / bpm);
  const power = Math.round(Math.log2(Math.max(ratio, 1e-9)));
  return 2 ** Math.min(3, Math.max(0, power));
}

/** Where in its move (s) a dancer is on beat `beats`, the move spanning `loop` beats: at its start on every `loop`th beat. */
export function clipTime(beats, loop, clipSeconds) {
  const into = ((beats % loop) + loop) % loop;
  return (into / loop) * clipSeconds;
}

/** The loading ring is never full sooner than this (s), so the wait is seen as a show and not a blink. */
export const RING_MIN = 1.5;

/** The ring's next share, from `shown` toward the `real` share of the song in, `dt` s later: never ahead, never back, no jump. */
export function ringStep(shown, real, dt) {
  const next = Math.max(shown, Math.min(real, shown + dt / RING_MIN));
  return Math.min(1, Math.max(0, next));
}

/** "Byrjum!" comes when the ring is full and the DJ has finished his line (`talkUntil`, 0 when he said nothing). */
export function loadingDone({ shown, now, talkUntil }) {
  return shown >= 1 && now >= talkUntil;
}
