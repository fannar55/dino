// Flugeðla og fiðrildið's key frames (step 1 of the plan: one still from the height of each beat of the storyboard, section 4, and
// the extra frames the brief names). Pure data: each frame says its second of the film (the camera is route.js's then) and where
// Flugeðla and the butterfly are in the camera's frame; the review page (chapters/flugedla3d.js, ?lykill=<id>) sets the stage from
// this table alone.
//
// Places are (u, v, k): u and v in the stage's fixed 16:10 frame from its top left (0..1), k the depth as a share of D. Out of the
// screen is the parallax in front of it as a share of the screen's width at STRENGTH: out = STRENGTH · (1/k − 1).
// her: { body | beak: [u, v, k], yaw, pitch, bank, neck (degrees), clip, at (its second), tuck (0-1), sweep (degrees), haze }
// butterfly: { at: [u, v, k] | on: 'beak', yaw, pitch, flap }; leaves: [{ trunk, count, spread }] (torn off a slalom trunk)

export const STRENGTH = 0.02;
export const MAX_OUT = 0.04;
export const kOf = out => 1 / (1 + out / STRENGTH);
export const outOf = k => STRENGTH * (1 / k - 1);
export const MIDDLE = [0.2, 0.8];
export const MIDDLE_OUT = 0.013; // rule 6: what is more than 1.3 % out stays in the middle
export const D_ = 13;
// a place given in metres from the still camera at the mouth (across to our right, up, depth) as (u, v, k) in its frame
const TAN_V = Math.tan((23 * Math.PI) / 180), TAN_H = TAN_V * 1.6;
export const fromMetres = ([across, up, depth]) => [0.5 + across / (2 * TAN_H * depth), 0.5 - up / (2 * TAN_V * depth), depth / D_];

export const KEYS = [
  {
    id: '1', n: 1, name: 'Kyrrð', time: 3,
    her: { body: fromMetres([0.4, -1.2, 78]), yaw: 0, pitch: 4, clip: 'fly', at: 0.35, haze: 0.2 },
    butterfly: { at: [0.5, 0.46, kOf(0.025)], yaw: 10, flap: 0.35 },
  },
  {
    id: '2a', n: 2, variant: 'a', name: 'Svigið', time: 12,
    // round the third trunk (3 m to our right, 37 m in): she passes 4.6 m left of it, banked hard into the turn
    her: { body: fromMetres([-2.7, -1.4, 36.5]), yaw: -18, pitch: 2, bank: -40, clip: 'fly', at: 0.2, haze: 0.12 },
    butterfly: { at: [0.47, 0.45, kOf(0.025)], yaw: -15, flap: 0.4 },
    leaves: [{ trunk: 2, count: 40, spread: [4, 7, 3] }],
  },
  {
    id: '2b', n: 2, variant: 'b', name: 'Svigið', time: 18.5,
    // through the gate (two slim trees 11 m apart, 14.5 m in): her body at the screen plane, her head a little out
    her: { beak: [0.5, 0.56, 1.0], yaw: 0, pitch: 6, bank: 6, clip: 'fly', at: 0.35 },
    butterfly: { at: [0.57, 0.42, kOf(0.03)], yaw: 20, flap: 0.4 },
  },
  {
    id: '3', n: 3, name: 'Samflug', time: 25,
    // the snap: her neck stretched, her beak about 2.5 % out, the butterfly 0.7 m ahead of it; her wings swept back 35 degrees as she
    // lunges (spread, their tips come out past 1.3 % at u 0.11-0.89: rule 6)
    her: { beak: [0.5, 0.56, kOf(0.025)], yaw: 0, pitch: 8, neck: 40, clip: 'fly', at: 0.5, sweep: 35 },
    butterfly: { at: [0.5, 0.52, (13 * kOf(0.025) - 0.7) / 13], yaw: 10, flap: 0.4 },
  },
  {
    id: '4', n: 4, name: 'Beygjurnar', time: 35,
    // mid-bend: the camera turning to its right; she banked 30 degrees into the turn, the butterfly a little ahead of her on it
    her: { body: [0.46, 0.56, 0.8], yaw: -12, pitch: 3, bank: 30, clip: 'glide', at: 0 },
    butterfly: { at: [0.36, 0.34, kOf(0.024)], yaw: -20, flap: 0.4 },
  },
  {
    id: '5', n: 5, name: 'Upp', time: 44.5,
    // climbing steeply with beating wings; the butterfly above her, going up
    her: { body: [0.5, 0.62, 0.72], yaw: 0, pitch: 38, clip: 'fly', at: 0.2 },
    butterfly: { at: [0.6, 0.26, kOf(0.022)], yaw: -15, pitch: 25, flap: 0.4 },
  },
  {
    id: '6', n: 6, name: 'Ofan skýja', time: 55.5,
    her: { body: [0.5, 0.55, 0.82], yaw: 0, pitch: 4, clip: 'glide', at: 0 },
    butterfly: { at: [0.62, 0.33, kOf(0.022)], yaw: 15, flap: 0.35 },
  },
  {
    id: '7', n: 7, name: 'Dýfan', time: 60.5,
    // the peak: the butterfly 3.65 % out at its middle (its nearest point 3.9 %), her beak 0.7 m behind it (2.9 %, not the plan's 3.3:
    // the butterfly is 0.56 m wide now and rule 9 keeps it 0.5 m from her), her wings tucked (her standing pose's)
    her: { beak: [0.5, 0.66, (13 * kOf(0.0365) + 0.7) / 13], yaw: 0, pitch: -15, neck: 18, clip: 'glide', at: 0, tuck: 1 },
    butterfly: { at: [0.5, 0.63, kOf(0.0365)], yaw: 0, pitch: 0, flap: 0.3 },
  },
  {
    id: '7b', n: 7, variant: 'b', name: 'Dýfan (varaleið)', time: 60.5,
    // the fallback: her glide with the wings swept back
    her: { beak: [0.5, 0.66, (13 * kOf(0.0365) + 0.7) / 13], yaw: 0, pitch: -15, neck: 18, clip: 'glide', at: 0, sweep: 70 },
    butterfly: { at: [0.5, 0.63, kOf(0.0365)], yaw: 0, pitch: 0, flap: 0.3 },
  },
  {
    id: '8a', n: 8, variant: 'a', name: 'Kveðjan', time: 69.5,
    // braking on slow wingbeats over the lane, the butterfly sitting on her beak (about 2.8 % out)
    her: { beak: [0.5, 0.5, kOf(0.028)], yaw: 0, pitch: 28, neck: 10, clip: 'fly', at: 0.1, sweep: 20 },
    butterfly: { on: 'beak', yaw: 70, flap: 0.15 },
  },
  {
    id: '8b', n: 8, variant: 'b', name: 'Kveðjan', time: 73.5,
    // the butterfly alone near us (3.5 % out); she watches it from just behind the screen plane
    her: { body: [0.5, 0.6, 1.3], yaw: 0, pitch: 10, neck: -8, clip: 'fly', at: 0.6 },
    butterfly: { at: [0.47, 0.44, kOf(0.035)], yaw: 15, flap: 0.4 },
  },
];

/** The frame for an address's lykill= ('2a', '7b'; a bare number picks the first frame of that beat). */
export function keyIndex(id) {
  const s = String(id ?? '1').toLowerCase();
  const exact = KEYS.findIndex(k => k.id === s);
  if (exact >= 0) return exact;
  const n = KEYS.findIndex(k => k.n === Number.parseInt(s, 10));
  return n >= 0 ? n : 0;
}
