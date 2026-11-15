// Samflug's 15 seconds (chapters/samflug3d.js), as functions of the show's second: where Flugeðla's body is in the camera's frame
// (u, v from the top left, k its depth as a share of D), how she is turned, her wings' clip second, Egill's wave, the three pale
// butterflies' places, and the camera's place down the lane. Pure (tests/samflug3d.test.mjs): a seek lands on the frame.
//
//   0-4     Hún kemur   far down the lane (k 6), flying at us, growing steadily, to the cruise place
//   4-10    Samflug     hanging at the cruise place, bobbing with her wingbeat, banking gently one way then the other; Egill waves;
//                       three pale butterflies come over her from behind and circle between us and her, then go back over her
//   10-13.5 Goggurinn   she eases nearer with her neck stretched, her beak tip out to the 3.5-4 % band, and lingers there
//   13.5-15             back to the cruise place; the loop dips through black and starts far away again
import { LENGTH, START_Z } from './stage.js';

export const BEATS = [
  { id: 'kemur', name: 'Hún kemur', from: 0, to: 4 },
  { id: 'samflug', name: 'Samflug', from: 4, to: 10 },
  { id: 'goggur', name: 'Goggurinn', from: 10, to: 13.5 },
  { id: 'aftur', name: 'Til baka', from: 13.5, to: 15 },
];
export const FAR = { u: 0.5, v: 0.47, k: 6 }; // where she first shows, far down the lane
export const CRUISE = { u: 0.5, v: 0.56, k: 0.78 };
// the hero moment: nearer, rearing up (nose up 40 degrees) with her neck stretched forward and down toward us, her wings held at the
// start of the fly clip's beat, where they are narrowest. Measured (tools/samflug-probe.mjs, D 13): body k 0.56, neck 35, pitch 40
// puts the beak's tip at about +3.85 % with her wing tips at u 0.21-0.79 (rule 3: anything nearer than k 0.6 inside 20-80 %); body
// k 0.6 keeps the tips in easily but the beak only reaches +3.4 %; pitch 30 brings the tips out to u 0.19.
export const HERO = { u: 0.5, v: 0.6, k: 0.56, neck: 35, pitch: 40, hold: 0 };
export const HERO_TIMES = { in: [10, 11], out: [13.1, 14.3] }; // eased in, lingered, eased back
export const FADE = 0.4; // s through black at the loop's join (the end's last and the start's first)
export const BANK = 8; // degrees at most
export const WING_RATE = 1; // the fly clip's seconds per second in the cruise

const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = 2 * Math.PI;

/** The camera's z at second t (it flies along +Z, backwards, at `speed` m/s). */
export const cameraZ = (t, speed) => START_Z + speed * t;

/** How much of the hero moment she is in at second t (0 cruise, 1 the hero place). */
export function heroShare(t) {
  const { in: [a, b], out: [c, d] } = HERO_TIMES;
  return t < a ? 0 : t < b ? smooth((t - a) / (b - a)) : t < c ? 1 : smooth(1 - (t - c) / (d - c));
}

// The wings' clock: the clip's second runs at WING_RATE times (1 − the hero share)², so the beat slows to a stop as she comes near
// and starts again as she goes back (no jump: it is an integral); a constant offset makes the stop fall on HERO.hold of a beat.
const STEP = 0.01;
const wingTable = [0];
for (let i = 1; i * STEP <= 16; i++) wingTable.push(wingTable[i - 1] + WING_RATE * STEP * (1 - heroShare((i - 0.5) * STEP)) ** 2);
const wingRaw = t => { const x = Math.min(wingTable.length - 1.001, Math.max(0, t / STEP)); const i = Math.floor(x); return wingTable[i] + (wingTable[i + 1] - wingTable[i]) * (x - i); };
/** The fly clip's second at show second t (held still while she lingers near). */
export function wingAt(t, clipLength) {
  const stop = wingRaw(HERO_TIMES.in[1]);
  const offset = ((((HERO.hold * clipLength - stop) % clipLength) + clipLength) % clipLength);
  return wingRaw(t) + offset;
}

/** Her place and pose at second t: { u, v, k, yaw, pitch, bank, neck, haze, seen }. */
export function herAt(t) {
  let u, v, k;
  if (t < 4) {
    // growing steadily: her depth falls at an even pace, eased only at the end
    const x = t / 4;
    const s = 1 - (1 - x) * (1 - x) * (1 - 0.35 * x);
    const depth = lerp(FAR.k, CRUISE.k, s);
    k = depth;
    u = lerp(FAR.u, CRUISE.u, s);
    v = lerp(FAR.v, CRUISE.v, s);
  } else {
    k = CRUISE.k; u = CRUISE.u; v = CRUISE.v;
  }
  // the cruise's drift and bob: in from second 3.5, out again for the hero moment
  const live = smooth((t - 3.5) / 1.5) * (1 - heroShare(t));
  const c = t - 4;
  u += live * 0.025 * Math.sin((TAU * c) / 7);
  v += live * 0.012 * Math.sin(TAU * t * WING_RATE) + live * 0.012 * Math.sin((TAU * c) / 5);
  k += live * 0.03 * Math.sin((TAU * c) / 5.5);
  const bank = live * BANK * Math.sin((TAU * c) / 6);
  const h = heroShare(t);
  u = lerp(u, HERO.u, h);
  v = lerp(v, HERO.v, h);
  k = lerp(k, HERO.k, h);
  return {
    u, v, k, yaw: 0, bank,
    pitch: lerp(2, HERO.pitch, h),
    neck: lerp(0, HERO.neck, h),
    haze: 0.55 * (1 - smooth(t / 3)),
  };
}

/** Egill at second t: { weight, swing, lean } (he waves from second 5 to 9). */
export function egillAt(t) {
  const w = smooth((t - 5) / 0.6) * (1 - smooth((t - 8.6) / 0.6));
  return { weight: w, swing: Math.sin(TAU * 1.6 * t), lean: 8 };
}

// The three butterflies: each comes over her from behind (high, k 1.6 down to the ring), circles above her head between us and her
// (k 0.45-0.55, u 0.37-0.63, v 0.21-0.31: clear of her crest and of Egill by 0.8 m or more),
// and leaves back over her and far down the lane before her beak comes out. Rows [u, v, k, size] (size 0: not shown).
const BUTTERFLIES = [
  { phase: 0, start: 5.0, side: -1 },
  { phase: TAU / 3, start: 5.4, side: 1 },
  { phase: (2 * TAU) / 3, start: 5.8, side: -0.3 },
];
export const CIRCLE = { u: 0.5, v: 0.26, k: 0.5, ru: 0.13, rv: 0.05, rk: 0.05, turn: 3.2, until: 9.0 };
export function butterflyAt(i, t) {
  const b = BUTTERFLIES[i];
  const c = CIRCLE;
  const ring = s => {
    const a = b.phase + (TAU * s) / c.turn;
    return [c.u + c.ru * Math.sin(a), c.v + c.rv * Math.cos(2 * a) * 0.6 + c.rv * 0.4 * Math.cos(a), c.k + c.rk * Math.cos(a)];
  };
  const inT = b.start, inEnd = b.start + 1.4, out = c.until + 0.25 * i, outEnd = out + 2.2;
  if (t < inT || t > outEnd + 1.2) return [0.5, 0.3, 4, 0];
  if (t < inEnd) {
    // over her, from behind and above: a high line, k 1.6 -> the ring
    const s = smooth((t - inT) / (inEnd - inT));
    const from = [0.5 + 0.1 * b.side, 0.2, 1.6];
    const to = ring(t - inT);
    return [lerp(from[0], to[0], s), lerp(from[1], to[1], s) - 0.08 * Math.sin(Math.PI * s), lerp(from[2], to[2], s), 1];
  }
  if (t < out) return [...ring(t - inT), 1];
  // back over her and away down the lane, smaller and smaller into the mist
  const s = (t - out) / (outEnd - out);
  const from = ring(out - inT);
  const x = smooth(Math.min(1, s));
  const k = lerp(from[2], 1.3, smooth(Math.min(1, s * 2))) + Math.max(0, s - 0.5) * 6;
  return [lerp(from[0], 0.5 + 0.06 * b.side, x), lerp(from[1], 0.24, smooth(Math.min(1, s * 1.6))), k, 1];
}
export const BUTTERFLY_COUNT = BUTTERFLIES.length;

/** The loop's dip: how black the picture is at second t. */
export const blackAt = t => Math.min(1, Math.max(0, 1 - t / FADE, (t - (LENGTH - FADE)) / FADE));
