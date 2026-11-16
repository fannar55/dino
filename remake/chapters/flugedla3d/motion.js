// Flugeðla og fiðrildið's two rough motion trials (step 1): her and the butterfly through the film's own seconds of the bend
// (TRIALS.beygja) and of the climb, the seconds above the cloud and the dive (TRIALS.upp), as eased steps between held states.
// Pure: a seek lands on its frame. Her place is her beak tip's, all through (so a state change never jumps her).
import { TURN, whiteAt, TRIALS } from './route.js';
import { kOf } from './keys.js';

const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => {
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t);
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => lerp(v, b[i], t));
  return t < 0.5 ? a : b;
};
const blend = (a, b, t) => { const out = { ...a }; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = mix(a[k] ?? b[k], b[k] ?? a[k], t); return out; };
/** A held state at each step's second, eased into the next over its `over` seconds before it. */
function track(steps, t) {
  let s = steps[0].state;
  for (const step of steps.slice(1)) {
    if (t <= step.t - step.over) break;
    s = blend(s, step.state, smooth((t - (step.t - step.over)) / step.over));
  }
  return s;
}
const TAU = 2 * Math.PI;

// ---- the bend: she hangs ahead of the camera, the butterfly turns first and she half a second after it, banked up to 30° ----
const CRUISE = { beak: [0.5, 0.53, 0.64], yaw: 0, pitch: 4, bank: 0, neck: 0, tuck: 0, sweep: 0, clip: 'fly', at: 0 };
const FLEE = [0.5, 0.42, kOf(0.024)];
export function beygja(t, route) {
  const sb = route.rates.turn(t) / TURN, sh = route.rates.turn(t - 0.5) / TURN;
  const her = { ...CRUISE, beak: [0.5 + 0.035 * sh, 0.53, 0.64], bank: 30 * sh, yaw: -10 * sh, at: t * 1.1, clip: 'fly' };
  const butterfly = { at: [FLEE[0] + 0.05 * sb, FLEE[1] + 0.01 * Math.sin(TAU * t / 1.7), FLEE[2]], yaw: -45 * sb, flap: 0.3 + 0.9 * Math.abs(Math.sin(TAU * 4 * t)) };
  return { her, butterfly };
}

// ---- up, over and down ----
const UPP = [
  { t: 39.5, state: { ...CRUISE } },
  { t: 42, over: 1.5, state: { beak: [0.5, 0.5, 0.58], pitch: 40, yaw: 0, bank: 0, neck: 0, sweep: 25, clip: 'fly' } }, // the climb, steep
  { t: 54, over: 2, state: { beak: [0.5, 0.52, 0.6], pitch: 4, sweep: 0, clip: 'glide' } }, // over the cloud: gliding
  { t: 58.5, over: 1, state: { beak: [0.5, 0.6, 0.55], pitch: -15, neck: 18, tuck: 1 } }, // she tucks and dives
  { t: 59.5, over: 1, state: { beak: [0.5, 0.66, (13 * kOf(0.0365) + 0.7) / 13], pitch: -15 } }, // nearer: the peak, key 7 (held to 61.5)
  { t: 62.5, over: 1, state: { beak: [0.5, 0.53, 0.62] } }, // back, into the white
  { t: 66.5, over: 2, state: { beak: [0.5, 0.52, 0.64], pitch: 28, neck: 10, tuck: 0, sweep: 40, clip: 'fly' } }, // out under the cloud, braking
  { t: 69, over: 1.5, state: { beak: [0.5, 0.5, kOf(0.028)] } }, // nearer over the lane, the butterfly on her beak (key 8a)
];
const UPP_BFLY = [
  { t: 39.5, state: { at: FLEE, yaw: 0, pitch: 0 } },
  { t: 42, over: 1.5, state: { at: [0.5, 0.3, kOf(0.022)], pitch: 40 } },
  { t: 54, over: 2, state: { at: [0.53, 0.42, kOf(0.022)], pitch: 0 } },
  { t: 58.5, over: 1, state: { at: [0.5, 0.55, kOf(0.026)], pitch: -10 } },
  { t: 59.5, over: 1, state: { at: [0.5, 0.63, kOf(0.0365)], pitch: 0 } },
  { t: 62.5, over: 1, state: { at: [0.5, 0.42, kOf(0.024)] } },
  { t: 66.5, over: 2, state: { at: FLEE, pitch: 0 } },
  { t: 69.5, over: 1.5, state: { at: [0.5, 0.485, kOf(0.0285)] } }, // down onto her beak
];
export function upp(t) {
  const her = track(UPP, t);
  // the wings: beating hard in the climb, held in the glide and the dive, slow beats braking
  her.at = her.clip === 'glide' ? 0 : t * (t < 50 ? 1.25 : 0.7);
  const bf = track(UPP_BFLY, t);
  // over the lane, braking: it lands on her beak (69.5) and sits
  // (coming down onto it, 68.3-69.5, it is landing: rule 9's half metre is not kept then, as it is not while it sits)
  const butterfly = t >= 69.5 ? { on: 'beak', yaw: 70, flap: 0.15 } : { ...bf, flap: 0.3 + 0.9 * Math.abs(Math.sin(TAU * 4 * t)), landing: t >= 68.3 };
  return { her, butterfly };
}

/** The trial's state at film second t, and how white the picture is (from the camera's height). */
export function trialAt(name, t, route) {
  const s = name === 'beygja' ? beygja(t, route) : upp(t);
  s.white = whiteAt(route.at(t).y);
  if (s.her) s.her.haze = 0.85 * s.white;
  return s;
}
export { TRIALS };
