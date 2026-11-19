// The show's score (chapter 5, scene 6: the music video): what the festival's light and magic do at each beat of DJ Flugeðla's set,
// read off the set itself (kafli5-set.js: its sections, its tune and its cues), so a set cut again moves the show with it.
//
// Everything here is a pure function of the DANCE beat (kafli5-video.js): the set's beat, spooled back in the rewind and standing
// still in Stoppdans. An event of the set is kept at the dance beat it is heard on, and two that fall on the same dance beat (the
// drop, and the drop again after the rewind) are one. Nothing here knows a clock, a frame or three.js: kafli5-show.js draws it,
// tests/kafli5-show.test.mjs holds it.
//
//   fireflies   createFireflies: each one's place, size, light and colour at a beat
//   dusk        duskAt: how deep the dusk is (it falls under her horn and stays), liftAt: the soft flashes,
//               capAt: the sun's nightcap, on while the dusk lasts
//   splashes    SPLASHES, dropAt, splashRingAt: the crowns of drops on the drops, a ring where a frog lands and where the grazers stomp
//   the count   COUNTS, countAt: the big number on the screen
//   notes       NOTES, noteAt, notePoint: the glowing notes between the groups, her crest and the sky
//   the beat    pulseAt, energyOf, beatRingsAt: the backbeat in the lights, rings of light on the water
import { SONG } from './kafli5-set.js';
import { danceBeatAt, sectionAt } from './kafli5-video.js';
import { CHOIR, GROUPS, WADE, around, seatsOf } from './kafli5-pool.js';
import { FAR_POOL } from './kafli4-route.js';

const SET = SONG.set;
const LEVEL = FAR_POOL.level;
const TAU = 2 * Math.PI;
export const BEAT_SECONDS = 60 / SONG.bpm;
const GRAVITY = 9.81 * BEAT_SECONDS ** 2; // m a beat a beat: drops fall as drops do

const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
/** A number from 0 to 1 for the whole numbers `i` and `k`, always the same. */
export const hash = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const srgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

const danceOf = setBeat => danceBeatAt(setBeat).beat;
const part = id => SET.sections.find(section => section.id === id);
/** The dance beat a part of the set starts on. */
const startOf = id => danceOf(part(id).startBeat);
const cues = kind => SET.cues.filter(event => event.kind === kind);
/** The events at the dance beats they are heard on (`beat`; `setBeat` the set's), one for each dance beat and `key`. */
function heard(events, key = () => '') {
  const seen = new Set();
  const out = [];
  for (const event of events) {
    const beat = danceOf(event.beat);
    const id = `${beat}|${key(event)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...event, beat, setBeat: event.beat });
  }
  return out.sort((a, b) => a.beat - b.beat);
}

const END = danceOf(SET.endBeat);
const HER = WADE.at; // she stands out in the pool: the swarm's middle, where the bursts start
const POOL = { at: FAR_POOL.center, radius: FAR_POOL.radius };

// ---------------------------------------------------------------------------------------------
// The drops: a peak where the set breaks loose after a build or a false end is a BURST (the fireflies fly out, the water jumps);
// the other peaks are a puff (they swell).

const PEAKS = heard(cues('peak')).map(peak => ({ ...peak, section: sectionAt(peak.setBeat)?.id }));
/** The dance beats of the two big drops: "Nú!" and "Einu sinni enn". */
export const BURSTS = PEAKS.filter(peak => peak.section === 'drop' || peak.section === 'lastchorus').map(peak => peak.beat);
/** The dance beats of the smaller peaks. */
export const PUFFS = PEAKS.filter(peak => !BURSTS.includes(peak.beat)).map(peak => peak.beat);

// ---------------------------------------------------------------------------------------------
// The dusk and the soft flashes

export const DUSK = { sink: 8 }; // beats it sinks over as her horn begins
/**
 * How deep the dusk is at `beat`, 0 (the afternoon) to 1: it sinks as her horn's part begins, and it is dusk from then on (the
 * owner's word of 2026-11-11: the day does not come back on the drop). The party's second half is in the dusk, lit by its
 * fireflies and soft flashes, and so is the chapter's last scene (kafli5.js keeps the dusk when the set is over).
 */
export function duskAt(beat) {
  return smooth((beat - startOf('break')) / DUSK.sink);
}

/**
 * The sun's nightcap (the owner's wish of 2026-11-11), 0 (off) to 1 (on its head): it comes down in the second bar of the sinking
 * dusk, as the camera looks at the sun (kafli5-video.js: set_sun), and stays on, as the dusk does.
 */
export const CAP = { from: 4, beats: 3 }; // down over beats 236 to 239 of the set, seen from the cut at 236
export function capAt(beat) {
  return smooth((beat - startOf('break') - CAP.from) / CAP.beats);
}

export const LIFT = { beats: 2 }; // a flash fades over these; two are never nearer than this (so never two in a second)
/** The soft flashes: the peaks, the crowd's roars and the band's hits, strongest first where two are too near each other. */
export const FLASHES = (() => {
  const all = [
    ...PEAKS.map(({ beat }) => ({ beat, strength: 1 })),
    ...heard(cues('roar')).map(({ beat }) => ({ beat, strength: 0.5 })),
    ...heard(cues('hit')).map(({ beat }) => ({ beat, strength: 0.45 })),
    ...heard(cues('horn')).filter(horn => sectionAt(horn.setBeat)?.id === 'end').map(({ beat }) => ({ beat, strength: 0.6 })),
    { beat: END, strength: 0.8 },
  ].sort((a, b) => b.strength - a.strength || a.beat - b.beat);
  const kept = [];
  for (const flash of all) if (kept.every(other => Math.abs(other.beat - flash.beat) >= LIFT.beats)) kept.push(flash);
  return kept.sort((a, b) => a.beat - b.beat);
})();
/** How much brighter the picture is at `beat` for a flash, 0 to 1: up at once on the hit, then fading over LIFT.beats. */
export function liftAt(beat) {
  let lift = 0;
  for (const flash of FLASHES) {
    const age = beat - flash.beat;
    if (age >= 0 && age < LIFT.beats) lift = Math.max(lift, flash.strength * (1 - age / LIFT.beats) ** 2);
  }
  return lift;
}

// ---------------------------------------------------------------------------------------------
// The beat in the light

/** How hard each part of the set plays, 0 to 1: how much of the beat the lights show. */
const ENERGY = {
  arrival: 0.15, welcome: 0.4, warmup: 0.55, groove: 1, tuneA: 0.7, grazers: 0.9, turtles: 0.6, frogs: 0.8, lizards: 0.9, flyers: 0.8,
  beetles: 0.7, dragonflies: 0.7, break: 0, rise: 0.5, drop: 1, rewind: 1, redrop: 1, anthem: 1, freeze: 0.9, carnival: 1, crowd: 0.6,
  fakeend: 0.3, lastchorus: 1, end: 0.8,
};
export const energyOf = sectionId => ENERGY[sectionId] ?? 0;
/** The backbeat (the bar's second and fourth beats) as a light: 1 on it, fading to nearly nothing before the next. */
export function pulseAt(beat) {
  const since = (((beat - 1) % 2) + 2) % 2;
  return Math.exp(-since * 2.4);
}

export const BEAT_RING = { every: 2, life: 4, grow: 4.2 }; // a ring every second beat, the beats it lives, m a beat it spreads
/**
 * The rings of light on the water at `beat`: one from under her on a bar's first beat and a fainter one from the pool's middle on
 * its third, each spreading and fading over a bar. `emit(x, z, radius, width, level)` for each.
 */
export function beatRingsAt(beat, energy, emit) {
  if (energy <= 0) return;
  const last = Math.floor(beat / BEAT_RING.every) * BEAT_RING.every;
  for (let from = last; from > beat - BEAT_RING.life; from -= BEAT_RING.every) {
    if (from < 0) break;
    const age = beat - from;
    const first = from % 4 === 0;
    const [x, z] = first ? HER : POOL.at;
    emit(x, z, 1.2 + BEAT_RING.grow * age, 0.35 + 0.14 * age, (first ? 0.34 : 0.2) * energy * (1 - age / BEAT_RING.life) ** 2);
  }
}

// ---------------------------------------------------------------------------------------------
// The countdown's big numbers

export const COUNT = { on: 1.3, pop: 0.3, out: 0.35 }; // beats a number is on, pops in over and goes over
/** The numbers she counts, each at its dance beat: [{ beat, n }]. */
export const COUNTS = heard(cues('count'), event => event.n).map(({ beat, n }) => ({ beat, n }));
const backOut = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2; // past its size and back
/**
 * The number on the screen at `beat`: null, or { n, scale, opacity } (scale 1 is its full size). It pops in on its beat and is gone
 * well before the next. With less motion it is half the size and only fades.
 */
export function countAt(beat, { reduced = false } = {}) {
  for (const { beat: from, n } of COUNTS) {
    const age = beat - from;
    if (age < 0 || age >= COUNT.on) continue;
    const out = clamp01((age - (COUNT.on - COUNT.out)) / COUNT.out);
    if (reduced) return { n, scale: 0.5, opacity: Math.min(clamp01(age / COUNT.pop), 1 - out) };
    const pop = age < COUNT.pop ? backOut(age / COUNT.pop) : 1;
    return { n, scale: (0.4 + 0.6 * pop) * (1 + 0.22 * out), opacity: Math.min(clamp01(age / 0.1), 1 - out) };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The glowing notes

export const NOTE = { fly: 1.5, rise: 6, arc: 2.5, climb: 8, glow: 0.75, tail: 5 }; // beats and metres
/**
 * Every note of the set, at its dance beat: { beat, from, to, life }. `from` and `to` are a group of the choir, 'crest' (hers) or
 * 'sky'. A note of her tune flies from the group that sings it to her crest; a note of her horn rises from her crest into the sky
 * in the quiet part, and flies from her crest out to a group everywhere else (group after group, low to high).
 */
export const NOTES = (() => {
  const tune = SET.tune.map(note => ({ beat: note.beat, from: note.group, to: 'crest', life: NOTE.fly }));
  const nth = {};
  const horn = cues('horn').map(event => {
    const section = sectionAt(event.beat)?.id;
    if (section === 'break') return { beat: event.beat, from: 'crest', to: 'sky', life: NOTE.rise };
    nth[section] = (nth[section] ?? -1) + 1;
    return { beat: event.beat, from: 'crest', to: GROUPS[nth[section] % GROUPS.length], life: NOTE.fly };
  });
  return heard([...tune, ...horn], note => `${note.from}>${note.to}`).map(({ beat, from, to, life }) => ({ beat, from, to, life }));
})();
/** Where `note` is in its life at `beat`: null (not on), or { u (0 to 1 along its way), glow (0 to 1: the light where it landed) }. */
export function noteAt(note, beat) {
  const age = beat - note.beat;
  const glow = note.to === 'sky' ? 0 : NOTE.glow;
  if (age < 0 || age >= note.life + glow) return null;
  return age < note.life ? { u: age / note.life, glow: 0 } : { u: 1, glow: 1 - (age - note.life) / glow };
}
/** The point `u` of the way of `note` from `a` to `b` ([x, y, z]), into `out` ([x, y, z]): an arc, or a wavering climb into the sky. */
export function notePoint(note, a, b, u, out) {
  if (note.to === 'sky') {
    out[0] = a[0] + 0.7 * Math.sin(u * 5 + note.beat);
    out[1] = a[1] + NOTE.climb * (1 - (1 - u) ** 2);
    out[2] = a[2] + 0.7 * Math.sin(u * 4 + note.beat * 1.7);
    return out;
  }
  const k = 0.5 * u + 0.5 * smooth(u);
  out[0] = lerp(a[0], b[0], k);
  out[1] = lerp(a[1], b[1], k) + NOTE.arc * Math.sin(Math.PI * u);
  out[2] = lerp(a[2], b[2], k);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The splashes

const PADS = seatsOf('frogs').map(seat => seat.at);
/** The lily pad ([x, z]) of the frog that calls on the set's beat `setBeat`: each call the next frog's, by its dance beat alone. */
export const padOf = setBeat => PADS[Math.round(danceOf(setBeat) * 4) % PADS.length];

export const SPLASH = { ring: 4, rim: 0.8, crowns: 12, height: 4.5, frogAfter: 0.8 }; // beats a ring lives; the crowns' place and height
/**
 * Every splash of the set: { beat, at: [x, z], drops, up (m a beat), spread (m a beat), ring (m a beat), seed }. On the bursts and
 * the last hit the water jumps up all round the pool (SPLASH.crowns crowns near its rim); a frog's call makes a small one at a lily
 * pad as the frog lands (SPLASH.frogAfter beats after its call); and in the grazers' part each stomp (their calls) sends a ring out
 * over the water from the bank at their feet, with no drops.
 */
export const SPLASHES = (() => {
  const out = [];
  const speedFor = height => Math.sqrt(2 * GRAVITY * height);
  [...BURSTS, END].forEach((beat, n) => {
    for (let k = 0; k < SPLASH.crowns; k++) {
      const angle = TAU * (k + 0.5 * hash(k, n + 40)) / SPLASH.crowns;
      const far = POOL.radius * (SPLASH.rim - 0.14 * hash(k, n + 50));
      out.push({
        beat: beat + 0.2 * hash(k, n + 60), at: [POOL.at[0] + far * Math.cos(angle), POOL.at[1] + far * Math.sin(angle)],
        drops: 20, up: speedFor(SPLASH.height * (beat === END ? 0.7 : 1)), spread: 0.75, ring: 1.6, seed: 100 * (n + 1) + k,
      });
    }
  });
  heard(cues('call').filter(call => call.group === 'frogs')).forEach((call, k) => {
    out.push({ beat: call.beat + SPLASH.frogAfter, at: padOf(call.setBeat), drops: 5, up: speedFor(0.45), spread: 0.3, ring: 0.8, seed: 1000 + k });
  });
  const feet = [-6, 5, 0].map(turn => around(CHOIR.grazers.angle + turn, POOL.radius - 1.5)); // the water's edge before the three of them
  heard(cues('call').filter(call => call.group === 'grazers' && sectionAt(call.beat)?.id === 'grazers')).forEach((call, k) => {
    out.push({ beat: call.beat, at: feet[k % feet.length], drops: 0, up: 0, spread: 0, ring: 1.4, seed: 2000 + k });
  });
  return out.sort((a, b) => a.beat - b.beat);
})();
/** The longest a splash's drops are in the air, beats. */
export const SPLASH_AIR = Math.max(...SPLASHES.map(splash => (2 * splash.up) / GRAVITY));
/** Drop `j` of `splash`, `age` beats after it: false (not in the air), or `out` = { x, y (over the water), z, size, level }. */
export function dropAt(splash, j, age, out) {
  if (age < 0) return false;
  const h = k => hash(splash.seed * 17 + j, k);
  const up = splash.up * (0.55 + 0.45 * h(1));
  const y = up * age - 0.5 * GRAVITY * age * age;
  if (y < 0) return false;
  const angle = TAU * (j + h(2)) / splash.drops;
  const far = 0.15 + splash.spread * (0.4 + 0.6 * h(3)) * age;
  out.x = splash.at[0] + far * Math.cos(angle);
  out.z = splash.at[1] + far * Math.sin(angle);
  out.y = y;
  out.size = splash.drops > 6 ? 0.22 + 0.26 * h(4) : 0.1 + 0.1 * h(4);
  out.level = Math.min(1, 0.35 + y * 3);
  return out;
}
/** The ring `splash` leaves on the water, `age` beats after it: null, or { radius, width, level }. */
export function splashRingAt(splash, age) {
  if (age < 0 || age >= SPLASH.ring) return null;
  return { radius: 0.3 + splash.ring * age, width: 0.12 + 0.07 * age, level: (splash.drops > 6 ? 0.7 : 0.5) * (1 - age / SPLASH.ring) ** 2 };
}

// ---------------------------------------------------------------------------------------------
// The fireflies

export const FIREFLIES = { count: 240, rise: [12, 24], size: 0.36 }; // how many (half with less motion), beats one takes up out of the reed (the first, the rest), m across
const WARM = ['#ffd56a', '#ffe9a8', '#ffb347', '#fff1cf'].map(srgb);
const PARTY = ['#ff7fa6', '#7fe3d2', '#ffd56a', '#ff9d4a', '#b8f070'].map(srgb); // the confetti's colours on a burst
const [BURST_ONE, BURST_TWO] = BURSTS;
/**
 * How many of the fireflies are out at a dance beat, 0 to 1 (by its `rank`, each has its turn): the first rise as the set starts,
 * more drift in with the music, all of them gather round her in the quiet part and burst out on the drop, fewer through the middle
 * of the set, all again from the second burst through the last chorus, and they sink away after the last hit.
 */
const OUT = [
  [startOf('arrival'), 0], [startOf('welcome'), 0.3], [startOf('tuneA'), 0.36], [startOf('dragonflies'), 0.4], [startOf('break') + 6, 1],
  [BURST_ONE + 4, 1], [startOf('anthem') + 4, 0.75], [startOf('freeze') + 6, 0.7], [startOf('carnival'), 0.7],
  [startOf('crowd'), 0.55], [startOf('fakeend'), 0.45], [BURST_TWO, 1], [END, 1], [END + 4.5, 0],
];
export function outAt(beat) {
  if (beat <= OUT[0][0]) return OUT[0][1];
  for (let k = 1; k < OUT.length; k++) {
    if (beat <= OUT[k][0]) return lerp(OUT[k - 1][1], OUT[k][1], (beat - OUT[k - 1][0]) / (OUT[k][0] - OUT[k - 1][0] || 1));
  }
  return OUT.at(-1)[1];
}
/** The dance beat a firefly of `rank` first comes out on. */
function firstOut(rank) {
  for (let k = 1; k < OUT.length; k++) {
    if (OUT[k][1] * 1.06 >= rank) {
      const [b0, v0] = OUT[k - 1];
      const [b1, v1] = OUT[k];
      return v1 === v0 ? b0 : lerp(b0, b1, clamp01((rank / 1.06 - v0) / (v1 - v0)));
    }
  }
  return OUT.at(-1)[0];
}
const GATHER = 14; // beats they take to come to her from all over the pool
/** How much the fireflies are gathered round her, 0 to 1: through the quiet part and the build, and again before the second burst. */
export function gatherAt(beat) {
  if (beat < BURST_ONE) return smooth((beat - (startOf('break') - 8)) / GATHER);
  if (beat < BURST_TWO) return smooth((beat - (BURST_TWO - GATHER - 2)) / GATHER);
  return 0;
}
/** How tight and how low the swarm round her is: wide and high under her horn, drawn in and down to the water through the build. */
function tightAt(beat) {
  if (beat >= BURST_ONE) return { wide: 0.65, high: 0.45 }; // the second gathering, before "Einu sinni enn"
  const k = smooth((beat - startOf('rise')) / (BURST_ONE - 2 - startOf('rise')));
  return { wide: lerp(1, 0.6, k), high: lerp(1, 0.4, k) };
}

/**
 * The fireflies: `count` of them, each with its own home in the reed, its own place over the pool, its own way round her and its
 * own way out on each burst. Returns { count, at(i, beat, energy, out) }: firefly `i` at dance beat `beat` in a part of the set
 * that plays `energy` hard (energyOf), into `out` = { x, y, z, size (m), level (0 to 1), r, g, b }. With less motion (`reduced`)
 * they only drift where they are: no swarm, no burst, no beat, half the size.
 */
export function createFireflies({ count = FIREFLIES.count, reduced = false } = {}) {
  const swarm = (f, beat, out) => {
    const { wide, high } = tightAt(beat);
    const angle = f.round + f.turn * beat;
    out[0] = HER[0] + Math.cos(angle) * f.reach * wide;
    out[1] = LEVEL + 0.5 + f.height * high + 0.35 * Math.sin(beat * f.bob + f.round);
    out[2] = HER[1] + Math.sin(angle) * f.reach * wide;
    return out;
  };
  const flies = Array.from({ length: count }, (_, i) => {
    const h = k => hash(i + 1, k);
    const rank = (i * 0.61803398875 + 0.37) % 1; // each its turn, evenly
    const reed = FAR_POOL.reeds[rank < 0.3 || h(2) < 0.75 ? 1 : 0]; // the first all rise out of her reed; of the rest some live in the small one by Mosi
    const [ra, rr] = [TAU * h(3), reed.radius * 0.85 * Math.sqrt(h(4))];
    const [wa, wr] = [TAU * h(6), POOL.radius * 1.08 * Math.sqrt(h(7))];
    const f = {
      rank, first: firstOut(rank), rise: lerp(FIREFLIES.rise[0], FIREFLIES.rise[1], smooth(firstOut(rank) / startOf('warmup'))),
      home: [reed.at[0] + rr * Math.cos(ra), LEVEL + 0.5 + 1.3 * h(5), reed.at[1] + rr * Math.sin(ra)],
      place: [POOL.at[0] + wr * Math.cos(wa), LEVEL + 1 + 5.5 * h(8) ** 2, POOL.at[1] + wr * Math.sin(wa)],
      sway: [1.2 + 1.3 * h(9), 0.3 + 0.4 * h(10), 1.2 + 1.3 * h(11)],
      pace: [TAU / (9 + 12 * h(12)), TAU / (5 + 6 * h(13)), TAU / (9 + 12 * h(14))],
      round: TAU * h(15), turn: (h(16) < 0.5 ? -1 : 1) * TAU / (24 + 24 * h(17)), reach: 3.5 + 4.5 * h(18), height: 0.3 + 6.2 * h(19),
      bob: TAU / (3 + 3 * h(26)), twinkle: TAU / (2.5 + 4 * h(27)),
      size: FIREFLIES.size * (0.75 + 0.5 * h(28)) * (reduced ? 0.5 : 1),
      warm: WARM[Math.floor(h(29) * WARM.length)], party: PARTY[Math.floor(h(30) * PARTY.length)],
      from: [], to: [],
    };
    BURSTS.forEach((beat, k) => {
      const [angle, far] = [TAU * h(20 + k), 5 + 19 * Math.sqrt(h(22 + k))];
      f.from[k] = swarm(f, beat - 1e-6, [0, 0, 0]); // where it is in the swarm as the drop lands
      f.to[k] = [HER[0] + far * Math.cos(angle), LEVEL + 2 + 9 * h(24 + k), HER[1] + far * Math.sin(angle)];
    });
    return f;
  });
  const p = [0, 0, 0];
  const q = [0, 0, 0];

  function at(i, beat, energy, out) {
    const f = flies[i];
    // drifting round its own place over the pool
    p[0] = f.place[0] + f.sway[0] * Math.sin(beat * f.pace[0] + f.round);
    p[1] = f.place[1] + f.sway[1] * Math.sin(beat * f.pace[1] + f.round * 2);
    p[2] = f.place[2] + f.sway[2] * Math.sin(beat * f.pace[2] + f.round * 3);
    let since = -1; // beats since the last burst
    let swell = 0;
    if (!reduced) {
      const k = beat >= BURST_TWO ? 1 : beat >= BURST_ONE ? 0 : -1;
      if (k >= 0) {
        // out from her over the whole pool, fast and then slower, and sinking slowly; then home to its own place
        since = beat - BURSTS[k];
        const flown = 1 - Math.exp(-since / 0.75);
        const settled = Math.min(1, since / 3);
        q[0] = lerp(f.from[k][0], f.to[k][0], flown) + (p[0] - f.place[0]) * settled;
        q[1] = lerp(f.from[k][1], f.to[k][1], flown) + 1.5 * Math.sin(Math.PI * Math.min(1, since / 2.5)) - Math.min(2.5, 0.09 * Math.max(0, since - 2.5)) + (p[1] - f.place[1]) * settled;
        q[2] = lerp(f.from[k][2], f.to[k][2], flown) + (p[2] - f.place[2]) * settled;
        const bursting = 1 - smooth((since - 8) / 16);
        for (let n = 0; n < 3; n++) p[n] = lerp(p[n], q[n], bursting);
        swell = Math.exp(-since / 3);
      }
      for (const puff of PUFFS) if (beat >= puff) swell = Math.max(swell, 0.6 * Math.exp(-(beat - puff) / 3));
      const gathered = gatherAt(beat);
      if (gathered > 0) {
        swarm(f, beat, q);
        for (let n = 0; n < 3; n++) p[n] = lerp(p[n], q[n], gathered);
      }
    }
    // up out of the reed, the first time it comes out
    const risen = smooth((beat - f.first) / f.rise);
    out.x = lerp(f.home[0], p[0], risen);
    out.y = lerp(f.home[1], p[1], risen) + 1.2 * Math.sin(Math.PI * risen);
    out.z = lerp(f.home[2], p[2], risen);
    const shown = clamp01((outAt(beat) * 1.06 - f.rank) / 0.06) * Math.min(1, risen * 4);
    out.level = shown * (0.62 + 0.38 * Math.sin(beat * f.twinkle + f.round * 5));
    const loud = beat >= BURST_TWO && beat < END ? 1.25 : 1; // the last chorus: the biggest
    const fresh = 1 + 1.2 * (1 - risen); // bigger as it lifts out of the reed, so the eye finds it
    out.size = f.size * fresh * (reduced ? 1 : (1 + 0.35 * pulseAt(beat) * energy) * (1 + 0.9 * swell) * loud);
    const festive = since >= 0 ? 0.3 + 0.7 * Math.exp(-since / 10) : 0;
    out.r = lerp(f.warm[0], f.party[0], festive);
    out.g = lerp(f.warm[1], f.party[1], festive);
    out.b = lerp(f.warm[2], f.party[2], festive);
    return out;
  }
  return { count, at };
}
