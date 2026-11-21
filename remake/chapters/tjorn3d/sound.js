// Uggeðla í tjörninni, step 3: the show's sound. Two halves.
//
// The cue sheet (cueSheet, CUES): what sounds at which second, as data, each cue hung on the timeline's own events (show.js: the
// rings, the bubbles, the sail, her head's rise and the water running off it, the fish's leap, her jaws, the gulp, the butterfly,
// her going under), so the sound follows when a second of the picture is mended. Pure: tests/tjorn3d-sound.test.mjs holds it and
// tools/tjorn3d-sound.mjs prints it.
//
// The player (createPondSound): plays the sheet on the page's audio context as the show's second passes each cue. No music (the
// theme is held at nothing for the show) and no voices. Three kinds of sound:
//   made         small sounds made on the spot, with the tools and in the key of the game's effects (engine/audio/sfx.js): the
//                game's own recipes where it has them (engine/audio/fen-sounds.js: the fish's plip, her jaws, her gulp), and the
//                show's own beside them, in the same manner
//   recordings   the two real splashes the game has (assets/veiddu/splash.json: Veiddu's, CC0)
//   slots        seven places for real recordings (SLOTS; step 3b: real water, cut by tools/tjorn3d-sounds.mjs into
//                assets/audio/tjorn3d/hljod/, each named in its sounds.json): where a slot's file is not there, or the show is
//                asked to play without them (`recordings: false`, the page's &upptokur=0, for an ear to compare), the sound named
//                by its `instead` plays in its place
// and under them the bed, the pond's still water, whose level the sheet moves (it thins as her shadow comes, hushes before her
// head rises, and is alone again at the end).
//
// A cue is one of
//   { t, sound, level, pan, what, on?, detail? }   a sound by name (MADE, RECORDINGS or SLOTS) at the show's second t: `level`
//                                                  scales it (1: as it is made), `pan` is its side (-1 left, 1 right: by where the
//                                                  thing is on the page), `on` names the timeline event its second is taken from
//   { t, bed, seconds, what }                      the bed's level (1: as it is laid), reached in a straight line over `seconds`
//
// The player makes its own sound tools, a copy of sfx.js's tone, noise and bell: a show's cue needs its own level and side (the
// game's effects have neither for most sounds), must not be dropped by the effects' least gaps or their cap of 48 sources, and is
// laid at a time of the audio clock that is handed to it, so the tool can lay the whole show on an offline context at once and
// measure it (nobody on the building side can hear it). The game's effects are not touched.
import {
  PARTS, CALM, LENGTH, TURN, HOLD, SAIL, GONE, JUMP, BUTTERFLY_TIMES, BUTTERFLY_LILY, RINGS, BUBBLE, BUBBLES, SPLASHES, RUNOFF, FLIGHT, herAt,
} from './show.js';
import { LILIES, FROG } from './keys.js';
import { fenSounds } from '../../engine/audio/fen-sounds.js';

/** The key the sounds are tuned to: the game's theme's (assets/audio/theme.json: do re mi sol la), as numbers, since the show has no theme. */
export const KEY = [524.28, 588.48, 660.55, 785.53, 881.73];

// The numbers, in one place. The levels are set by measure, not by ear (tools/tjorn3d-sound.mjs --render: after the page's output
// chain the rise in part 4 is the loudest moment, its peak about 3 dB under full scale and its loudest second at -16 dBFS RMS, 6 dB
// over the loudest second outside it, the sail's parting; the small sounds are kept near it, a narrow range for a tablet's small
// speakers; the bed alone lies at -34 dBFS RMS).
export const SOUND = {
  master: 1.45, // the whole show's gain into the page's output
  made: 3.1, // the made sounds' gain under it (their recipes are at the game's effects' levels, which sit under its voices and its music: here they are all there is)
  bed: 1.35, // and the made bed's: a faint presence under the rest (a made murmur that is plainly heard is a hiss)
  halfPage: 11, // cm: a thing this far to a side of the page's middle is as far to that side as the sound goes
  panMost: 0.5, // (a tablet lying flat has its speakers at its short edges: more than this and a sound sits in one of them alone)
  gulpLead: 0.25, // s before JUMP.gulp the swallow begins (the fish goes down over the last third of a second before it)
  sinkLead: 0.6, // s before the water closes over her head the sinking sound begins: its closing is this far into it
  late: 0.3, // s a cue waits for an audio context that is still waking (the tap's wake-up takes a moment); later than this it is passed over
  takeVary: 0.04, // a recording plays up to this much faster or slower each time
};

const FILES = 'assets/audio/tjorn3d/hljod/'; // against remake/
/** What says which of the slots' files are there (and where each came from): only a file named in it is asked for. */
export const MANIFEST = `${FILES}sounds.json`;
const own = file => `${FILES}${file}`;

/**
 * The slots for real recordings, as sfx.js's SAMPLES: the files a slot plays (`urls`, against remake/: one of them each time, not
 * the one played last), the gain it plays at (`level`; a file's entry in sounds.json may give its own) and the sound that plays
 * where no file is there (`instead`: a made sound, or one of RECORDINGS, whose own `instead` is a made one). The bed's is a loop.
 * The files are levelled by tools/tjorn3d-sounds.mjs (a one-shot's peak 3 dB under full scale, the bed at -24 dBFS RMS) and the
 * levels here are set by the measure of the whole show (tools/tjorn3d-sound.mjs --render; SOUND.master comes on top). Nobody on
 * the building side has heard them.
 */
export const SLOTS = {
  pond: { urls: [own('pond.mp3')], level: 0.29, instead: 'water', loop: true, what: 'the bed: a still pond, a loop of 20 s or more with no single call that would be known the second time round' },
  rise: { urls: [own('rise.mp3')], level: 1.15, instead: 'heave', what: 'something big rising out of water, the water pouring off it: the rise begins at once and its fullest is about a second in' },
  drips: { urls: [own('drips.mp3')], level: 0.35, instead: 'dripping', what: 'drips falling back into still water, thinning: about 5 s' },
  bubbles: { urls: [own('bubbles-1.mp3'), own('bubbles-2.mp3'), own('bubbles-3.mp3')], level: 0.3, instead: 'blips', what: 'a small burst of bubbles reaching the surface: 1 to 1.5 s, takes welcome' },
  sink: { urls: [own('sink.mp3')], level: 1.2, instead: 'closing', what: `something sinking softly, the water closing over it: its closing ${SOUND.sinkLead} s in` },
  fish: { urls: [own('fish.mp3')], level: 0.35, instead: 'plop', what: 'a fish leaping out of the water: a light splash, under a second' },
  frog: { urls: [own('frog-1.mp3'), own('frog-2.mp3')], level: 0.4, instead: 'croak', what: 'one croak of a frog, takes welcome' },
};

/** The recordings the game already has (assets/veiddu/splash.json), by the name a cue asks for them: as SLOTS. */
export const RECORDINGS = {
  plop: { urls: ['assets/veiddu/splash-soft.mp3'], level: 0.2, instead: 'fishIn', what: 'a small plop: what the fish\'s leap plays without its own recording' },
  splash: { urls: ['assets/veiddu/splash.mp3'], level: 0.55, instead: 'slap', what: 'a full splash: she comes down with the fish' },
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const round = (x, n = 3) => +x.toFixed(n);
const smooth = u => { const c = clamp(u, 0, 1); return c * c * (3 - 2 * c); };

/** The side of a thing x cm to the right of the page's middle. */
export const panAt = x => round(clamp(x / SOUND.halfPage, -1, 1) * SOUND.panMost, 2);

// ---------------------------------------------------------------------------------------------
// The made sounds: each (tools, detail), with sfx.js's tools ({ tone, noise, bell, key, between }), already at the cue's time,
// level and side. Soft and round, for a six-year-old and for a tablet's small speakers: nothing lives under 150 Hz alone, nothing
// is sharp, and every note is a note of the key.

/** A drop of water (fen-sounds.js's): a tiny plink gliding up an octave. */
const droplet = ({ tone }, hz, delay, level, pan = 0) => {
  tone({ frequency: hz, end: hz * 2, duration: 0.05, level, delay, pan, attack: 0.004, body: 0 });
  tone({ frequency: hz * 2, duration: 0.16, level: level * 0.35, delay: delay + 0.04, pan, attack: 0.004, body: 0 });
};

export const MADE = {
  // ---- the game's own, as fen-sounds.js makes them ----
  // the fish leaves the water: a plip
  fishOut: tools => fenSounds(tools).fish({ part: 'out' }),
  // and falls back into it: a small splash (what plays if the real plop cannot be had)
  fishIn: tools => fenSounds(tools).fish({ part: 'in' }),
  // her jaws shut on the fish: a dry, short clack
  jawSnap: tools => fenSounds(tools).jawSnap(),
  // the swallow: a round "glúúp" falling in her throat
  gulp: tools => fenSounds(tools).gulp(),
  // one stroke of her swimming (the game's swim is two of these, left then right): a gentle swell of water, a low note rolling under it, a drop
  stroke(tools, { side = 0 } = {}) {
    const { tone, noise, key, between } = tools;
    const i = side ? 1 : 0;
    noise({ kind: 'warm', type: 'bandpass', frequency: 480 + i * 60, end: 1100 - i * 100, q: 0.5, duration: 1.1, level: 0.12, attack: 0.3 });
    noise({ kind: 'warm', type: 'lowpass', frequency: 420, end: 200, duration: 1.05, level: 0.05, attack: 0.25, delay: 0.05 });
    tone({ frequency: key[i ? 2 : 0] / 2, end: key[i ? 0 : 2] / 2, duration: 0.5, level: 0.014, attack: 0.18, delay: 0.1 });
    droplet(tools, key[i ? 4 : 3], 0.4 + between(0, 0.1), 0.012);
  },
  // the frog on its lily (sfx.js's frog): two throaty croaks, the second one rising (what the frog's slot plays without its recording)
  croak({ tone, noise, between }) {
    const pitch = between(0.97, 1.03);
    for (const [at, from, to, length] of [[0, 190, 140, 0.1], [0.14, 150, 235, 0.13]]) {
      tone({ frequency: from * pitch, end: to * pitch, duration: length, level: 0.11, delay: at, type: 'triangle', attack: 0.015 });
      tone({ frequency: from * pitch * 2, end: to * pitch * 2, duration: length, level: 0.045, delay: at, type: 'triangle', attack: 0.015 });
      noise({ type: 'bandpass', frequency: 700 * pitch, end: 500, q: 1.5, duration: length, level: 0.05, delay: at, attack: 0.02 });
    }
  },
  // a bird far over the water (the Fen's early bird, as its bed calls it): la falling to mi, a short sol after
  farBird({ tone, key }) {
    tone({ frequency: key[4] * 2, end: key[2] * 2, duration: 0.24, level: 0.03, attack: 0.03 });
    tone({ frequency: key[3] * 2, duration: 0.12, level: 0.022, delay: 0.34, attack: 0.02 });
  },
  // the butterfly lands (sfx.js's call chime): two soft, high bells, mi and la, close together
  chime({ bell, key }) {
    bell(key[2] * 2, { level: 0.045, duration: 0.5 });
    bell(key[4] * 2, { level: 0.038, delay: 0.09, duration: 0.6 });
  },
  // the slap of a splash (the first of fen-sounds.js's tailSplash; what plays if the real splash cannot be had)
  slap({ tone, noise, key }) {
    noise({ kind: 'white', type: 'bandpass', frequency: 1800, end: 420, q: 0.8, duration: 0.42, level: 0.13, attack: 0.004 });
    noise({ kind: 'warm', type: 'lowpass', frequency: 1000, end: 220, duration: 0.5, level: 0.11, attack: 0.006 });
    tone({ frequency: key[3] / 2, end: key[0] / 2, duration: 0.3, level: 0.09, attack: 0.004 });
  },
  // the spray of a splash raining back (the rest of tailSplash): a hiss of drops in the air, seven drops, the water rolling away
  spray(tools) {
    const { noise, key, between } = tools;
    noise({ kind: 'white', type: 'bandpass', frequency: 3400, end: 2000, q: 1.1, duration: 0.9, level: 0.05, attack: 0.08, delay: 0.06 });
    [4, 2, 3, 1, 4, 3, 2].forEach((n, i) => droplet(tools, key[n] * 2, 0.3 + i * 0.1 + between(0, 0.05), 0.022, between(-0.3, 0.3)));
    noise({ kind: 'warm', type: 'bandpass', frequency: 650, end: 300, q: 0.6, duration: 1.4, level: 0.09, attack: 0.2, delay: 0.25 });
  },

  // ---- the show's own ----
  // a fish kisses the surface: one drop (detail.note: which note of the key) and the breath of its ring
  plip(tools, { note = 3 } = {}) {
    const { noise, key } = tools;
    droplet(tools, key[((note % 5) + 5) % 5] * 2, 0, 0.045);
    noise({ kind: 'warm', type: 'bandpass', frequency: 900, end: 520, q: 1, duration: 0.3, level: 0.03, attack: 0.03, delay: 0.02 });
  },
  // something big moves far down: a slow, round swell of water with a note rising in it, do to mi, like a question, and a second
  // note a hair off it, so the two wobble slowly as things do under water. Curious, not dark: it rises, it is in the major key,
  // and it has no growl in it.
  deep({ tone, noise, key }, { seconds = 3.6 } = {}) {
    noise({ kind: 'brown', type: 'bandpass', frequency: 300, end: 560, q: 0.6, duration: seconds, level: 0.13, attack: seconds * 0.45 });
    tone({ frequency: key[0] / 2, end: key[2] / 2, duration: seconds * 0.9, level: 0.04, attack: seconds * 0.4, body: 0.8, sustain: 0.9, delay: 0.1 });
    tone({ frequency: (key[0] / 2) * 1.008, end: (key[2] / 2) * 1.008, duration: seconds * 0.9, level: 0.025, attack: seconds * 0.4, body: 0.8, sustain: 0.9, delay: 0.1 });
    tone({ frequency: key[0], end: key[2], duration: seconds * 0.8, level: 0.03, attack: seconds * 0.4, body: 0.8, sustain: 0.9, delay: 0.2 });
  },
  // a burst of bubbles reaches the surface (detail: how many, how far apart, as the picture's): each a round blip gliding up and a tiny pop
  blips({ tone, noise, key, between }, { many = 6, apart = 0.22 } = {}) {
    const first = Math.floor(between(0, 4.999));
    for (let i = 0; i < many; i++) {
      const n = first + i * 2;
      const hz = (key[n % 5] / 2) * (i % 3 === 2 ? 2 : 1);
      const at = i * apart + between(0, apart * 0.4);
      const pan = between(-0.08, 0.08);
      tone({ frequency: hz, end: hz * 1.9, duration: 0.065, level: 0.075 * between(0.7, 1), delay: at, pan, attack: 0.005, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2400, q: 3, duration: 0.025, level: 0.015, delay: at + 0.055, pan, attack: 0.003 });
    }
  },
  // her sail breaks the surface in open water: the water opening in a rising "shhh", running off the sail's edge, a note climbing
  // do to sol under it, drops falling off, and a small bell, sol, as the sail stands (detail.up: seconds until it does)
  parting(tools, { up = 1.7 } = {}) {
    const { tone, noise, bell, key, between } = tools;
    noise({ kind: 'warm', type: 'bandpass', frequency: 480, end: 1500, q: 0.7, duration: 1.6, level: 0.2, attack: 0.55 });
    noise({ kind: 'white', type: 'bandpass', frequency: 2600, end: 1700, q: 1.2, duration: 1.2, level: 0.03, attack: 0.3, delay: 0.5 });
    tone({ frequency: key[0] / 2, end: key[3] / 2, duration: 1.5, level: 0.03, attack: 0.5, body: 0.8, sustain: 0.9 });
    [3, 4, 2, 3].forEach((n, i) => droplet(tools, key[n] * 2, 0.75 + i * 0.22 + between(0, 0.08), 0.02, between(-0.1, 0.1)));
    bell(key[3], { delay: up, level: 0.04, duration: 0.9 });
  },
  // the water stirs and settles: one soft lap of a ring spreading, and a low drop
  lap(tools) {
    const { noise, key, between } = tools;
    noise({ kind: 'warm', type: 'bandpass', frequency: 640, end: 400, q: 0.8, duration: 0.9, level: 0.1, attack: 0.25 });
    droplet(tools, key[Math.floor(between(2, 4.999))], 0.28 + between(0, 0.1), 0.016);
  },
  // her head rises out of the water (detail.seconds: how long the rise is): the water lifting, a deep swell that opens upward as
  // she pushes through it; the water pouring off her from the crest, a broad "pshhh" falling away; and a round note rising under
  // it all, do to sol. The biggest sound of the show.
  heave({ tone, noise, key }, { seconds = 2 } = {}) {
    const s = clamp(seconds, 1, 4);
    noise({ kind: 'warm', type: 'bandpass', frequency: 300, end: 900, q: 0.5, duration: s + 0.5, level: 0.5, attack: s * 0.5 });
    noise({ kind: 'warm', type: 'bandpass', frequency: 520, end: 1700, q: 0.6, duration: s + 0.4, level: 0.26, attack: s * 0.55 });
    noise({ kind: 'white', type: 'bandpass', frequency: 3000, end: 1200, q: 0.7, duration: 2.6, level: 0.1, attack: 0.35, delay: s * 0.45 });
    noise({ kind: 'warm', type: 'bandpass', frequency: 1300, end: 420, q: 0.5, duration: 2.8, level: 0.2, attack: 0.3, delay: s * 0.5 });
    tone({ frequency: key[0] / 2, end: key[3] / 2, duration: s + 0.6, level: 0.06, type: 'triangle', attack: s * 0.5, body: 0.8, sustain: 0.9 });
    tone({ frequency: key[0], end: key[3], duration: s + 0.4, level: 0.018, attack: s * 0.5, body: 0.8, sustain: 0.9 });
  },
  // she is up, and looks at him: a little chord rolling upward, mi sol do, over a glow (sfx.js's plate, an octave lower and softer)
  bloom({ tone, bell, key }) {
    tone({ frequency: key[0] / 2, duration: 1.8, level: 0.018, attack: 0.4, body: 0.5, sustain: 0.6 });
    tone({ frequency: key[0], duration: 1.6, level: 0.01, attack: 0.45, body: 0.5, sustain: 0.6 });
    [[2, 1], [3, 1], [0, 2]].forEach(([n, octave], i) => bell(key[n] * octave, { delay: 0.2 + i * 0.16, level: 0.028, duration: 1.5, pan: (i - 1) * 0.12 }));
  },
  // the water still running off her, and dripping back through the hold (detail.seconds): a thin trickle at first, and drops that
  // fall thick and then one by one
  dripping(tools, { seconds = 5 } = {}) {
    const { noise, key, between } = tools;
    noise({ kind: 'white', type: 'bandpass', frequency: 3200, end: 2200, q: 1.5, duration: Math.min(2.4, seconds * 0.45), level: 0.026, attack: 0.25 });
    const many = Math.round(clamp(seconds * 5, 8, 30));
    for (let i = 0; i < many; i++) {
      const u = i / (many - 1);
      const at = seconds * u ** 1.8 + between(0, 0.08);
      droplet(tools, key[Math.floor(between(0, 4.999))] * (i % 4 === 3 ? 4 : 2), at, 0.032 - 0.014 * u, between(-0.16, 0.16));
    }
  },
  // tiny wings (detail: seconds of flight, beats a second, and how far the sound moves to a side on the way): a puff of air for
  // each beat, coming in and going out as the wings do. Very soft.
  wings({ noise }, { seconds = 2.8, beats = 9, to = 0 } = {}) {
    const many = Math.round(seconds * beats);
    for (let i = 0; i < many; i++) {
      const u = i / many;
      const open = smooth(u / 0.12) * smooth((1 - u) / 0.2);
      if (open < 0.05) continue;
      noise({ kind: 'white', type: 'bandpass', frequency: i % 2 ? 3300 : 3900, q: 2, duration: 0.05, level: 0.04 * open, delay: i / beats, pan: to * u, attack: 0.014 });
    }
  },
  // the butterfly lifts off (sfx.js's butterfly, thinner): three tiny high pings and a breath of air
  flit({ tone, noise, key }) {
    for (let i = 0; i < 3; i++) tone({ frequency: key[(i * 2 + 1) % 5] * 4, duration: 0.09, level: 0.026, delay: i * 0.06 });
    noise({ kind: 'white', type: 'bandpass', frequency: 4200, end: 3000, q: 1, duration: 0.3, level: 0.018, attack: 0.1 });
  },
  // she sinks: the water closing over her head, a soft swell falling shut, a round note sinking sol to do, a "bloop" as it closes
  // (SOUND.sinkLead in) and drops after it
  closing(tools) {
    const { tone, noise, key, between } = tools;
    const shut = SOUND.sinkLead;
    noise({ kind: 'warm', type: 'bandpass', frequency: 1300, end: 380, q: 0.7, duration: 1.6, level: 0.13, attack: shut });
    noise({ kind: 'warm', type: 'bandpass', frequency: 700, end: 300, q: 0.5, duration: 1.8, level: 0.22, attack: shut, delay: 0.05 });
    tone({ frequency: key[3] / 2, end: key[0] / 2, duration: 1.3, level: 0.035, attack: shut * 0.8, body: 0.8, sustain: 0.9 });
    tone({ frequency: key[0], end: key[0] / 2, duration: 0.18, level: 0.05, delay: shut, attack: 0.01 });
    [3, 2, 4].forEach((n, i) => droplet(tools, key[n] * 2, shut + 0.2 + i * 0.16 + between(0, 0.06), 0.016, between(-0.15, 0.15)));
  },
};

// ---------------------------------------------------------------------------------------------
// The cue sheet

const BED = { thin: 0.65, hush: 0.4 }; // the bed's level while her shadow is in the pond, and before her head rises
const butterflyRing = ring => ring[1] === BUTTERFLY_LILY[0] && ring[2] === BUTTERFLY_LILY[1]; // (a pad stirring under the butterfly: too small to sound)
const ringsIn = (from, to) => RINGS.filter(ring => ring[0] >= from && ring[0] < to && !butterflyRing(ring));

/** Every cue of the show, in order of its second. */
export function cueSheet() {
  const list = [];
  const add = (t, sound, level, x, what, more = {}) => list.push({ t: round(t), sound, level: round(level, 2), pan: panAt(x), what, ...more });
  const bed = (t, level, seconds, what) => list.push({ t: round(t), bed: level, seconds, what });
  const [calm, shadow, sail, , fish, butterfly] = PARTS;
  const frogX = LILIES[FROG.lily].at[0];

  // ---- the bed: in under the black, thinner while her shadow is in the pond, hushed before her head rises, back when she has
  // eaten, alone again when she is gone, and out with the picture ----
  bed(0, 1, 1.5, 'the pond comes in under the black: still water');
  bed(shadow.from, BED.thin, 3, 'the pond thins: her shadow is coming');
  bed(TURN - 1, BED.hush, 2.5, 'the pond holds its breath: she is right under');
  bed(JUMP.gulp + 1, BED.thin, 2.5, 'the pond breathes again: she has eaten');
  bed(GONE - 1.6, 1, 2.2, 'the pond alone again');
  bed(LENGTH - 1.2, 0, 1.2, 'the pond goes with the picture');

  // ---- 1. the calm pond: a fish kisses the surface at each ring, the frog on its lily, a bird far off ----
  ringsIn(calm.from, calm.to).forEach(([t, x, , strength], i) => add(t, 'plip', 0.7 + strength, x, 'a fish kisses the surface', { on: 'RINGS', detail: { note: [3, 2, 4, 3][i % 4] } }));
  add(calm.from + 2.4, 'frog', 0.4, frogX, 'the frog on its lily');
  add(calm.from + 4.5, 'farBird', 1, 5.5, 'a bird far over the water');
  add(calm.from + 6.5, 'frog', 0.28, frogX, 'the frog again, softer');

  // ---- 2. her shadow: something big moves far down, three times and nearer each time; bubbles as each burst reaches the
  // surface, small, then more as she nears ----
  [1.0, 5.2, 9.0].forEach((after, i) => {
    const t = shadow.from + after;
    add(t, 'deep', 0.25 + 0.07 * i, herAt(t).at[0], `something big moves far down (${i + 1})`, { detail: { seconds: 3.6 } });
  });
  // (a burst reaches the surface BUBBLE.seconds after it is let go; the later ones are here too: where her head is about to come
  // up, the first of them the loudest, and where she went down)
  const burst = ([t, x], level, what) => add(t + BUBBLE.seconds, 'bubbles', level, x, what, { on: 'BUBBLES', detail: { many: BUBBLE.each, apart: BUBBLE.apart } });
  const early = BUBBLES.filter(([t]) => t < sail.from);
  early.forEach((row, i) => burst(row, 0.45 + (0.55 * i) / Math.max(1, early.length - 1), 'bubbles ahead of her reach the surface'));
  BUBBLES.filter(([t]) => t >= sail.from && t < HOLD.from).forEach((row, i) => burst(row, i ? 0.7 : 1, 'bubbles where her head is about to come up'));
  BUBBLES.filter(([t]) => t >= HOLD.from).forEach(row => burst(row, 0.55, 'bubbles where she went down'));

  // ---- 3. her sail: it breaks the surface at its first ring; a stroke of her swimming at each ring while it cuts along; the
  // water laps shut where it goes under ----
  ringsIn(sail.from, TURN).forEach(([t, x, , strength], i) => {
    if (i === 0) add(t, 'parting', 1, x, 'her sail breaks the surface', { on: 'RINGS', detail: { up: round(SAIL.up - t) } });
    else if (t <= SAIL.down + 0.5) add(t, 'stroke', 0.6 + 0.6 * strength, x, 'a stroke of her swimming, her sail cutting along', { on: 'RINGS', detail: { side: i % 2 } });
    else add(t, 'lap', 0.4 + 0.6 * strength, x, 'the water laps shut where her sail went under', { on: 'RINGS' });
  });

  // ---- 4. her head: the rise at the ring where it breaks the surface, the biggest sound of the show; the little chord as she
  // stands; the water running off her and dripping back through the hold; the water stirring round her ----
  const headRings = ringsIn(TURN, HOLD.to);
  const breaks = headRings[0][0];
  add(breaks, 'rise', 0.9, headRings[0][1], 'her head rises out of the water, the water pouring off it', { on: 'RINGS', detail: { seconds: round(HOLD.from - breaks) } });
  add(HOLD.from, 'bloom', 0.6, 0, 'she is up, and looks at him', { on: 'HOLD.from' });
  const runs = RUNOFF.from + 1; // (the rise's own pouring covers the first of it)
  add(runs, 'drips', 1, headRings[0][1], 'the water runs off her and drips back, thinning', { on: 'RUNOFF', detail: { seconds: round(HOLD.to - 0.8 - runs) } });
  headRings.filter(([t]) => t > HOLD.from).forEach(([t, x, , strength]) => add(t, 'lap', 0.3 + strength, x, 'the water stirs round her', { on: 'RINGS' }));

  // ---- 5. the fish: its leap out of the water, her jaws, the splash as she comes down with it, nothing while she holds it, the
  // gulp, and the water settling ----
  const [leap, down, under] = SPLASHES;
  add(leap[0], 'fish', 1, leap[1], 'the fish leaps out of the water', { on: 'JUMP.out' });
  add(leap[0], 'fishOut', 1, leap[1], 'and its plip', { on: 'JUMP.out' });
  add(JUMP.take, 'jawSnap', 0.85, JUMP.catch[0], 'her jaws shut on the fish', { on: 'JUMP.take' });
  add(down[0], 'splash', 1, down[1], 'she comes down with it: the splash round her', { on: 'SPLASHES' });
  add(down[0], 'spray', 1, down[1], 'and the spray raining back', { on: 'SPLASHES' });
  add(JUMP.gulp - SOUND.gulpLead, 'gulp', 0.8, 0, 'she swallows it', { on: 'JUMP.gulp' });
  ringsIn(down[0] + 0.5, fish.to).forEach(([t, x, , strength]) => add(t, 'lap', 0.3 + strength, x, 'the water settles', { on: 'RINGS' }));

  // ---- 6. the butterfly: tiny wings over to her snout, two small bells as it lands, its lift-off and its wings home; she sinks,
  // the water closing over her head; the last rings and the last bubbles; then the pond as it was ----
  const { up, land, off, home } = BUTTERFLY_TIMES;
  const lily = panAt(BUTTERFLY_LILY[0]), snout = panAt(0);
  add(up, 'flit', 1, BUTTERFLY_LILY[0], 'the butterfly lifts off its lily', { on: 'BUTTERFLY_TIMES.up' });
  add(up, 'wings', 1, BUTTERFLY_LILY[0], 'its wings, over to her', { on: 'BUTTERFLY_TIMES.up', detail: { seconds: round(land - up), beats: FLIGHT.wings, to: round(snout - lily, 2) } });
  add(land, 'chime', 0.6, 0, 'it lands on her snout', { on: 'BUTTERFLY_TIMES.land' });
  add(off, 'flit', 0.7, 0, 'it lifts off her snout', { on: 'BUTTERFLY_TIMES.off' });
  add(off, 'wings', 0.8, 0, 'its wings, home', { on: 'BUTTERFLY_TIMES.off', detail: { seconds: round(home - off), beats: FLIGHT.wings, to: round(lily - snout, 2) } });
  add(under[0] - SOUND.sinkLead, 'sink', 0.5, under[1], 'she sinks: the water closes over her head', { on: 'SPLASHES' });
  ringsIn(butterfly.from, CALM.from).filter(([t]) => Math.abs(t - under[0]) > 1e-6).forEach(([t, x, , strength]) => add(t, 'lap', 0.3 + strength, x, t < under[0] ? 'the water stirs as she goes down' : 'the last rings', { on: 'RINGS' }));

  // ---- the calm pond again: the frog, and a fish kissing the surface at each ring ----
  add(CALM.from + 0.25, 'frog', 0.35, frogX, 'the frog: the pond is itself again');
  ringsIn(CALM.from, LENGTH).forEach(([t, x, , strength], i) => add(t, 'plip', 0.7 + strength, x, 'a fish kisses the surface', { on: 'RINGS', detail: { note: [2, 4][i % 2] } }));

  return list.filter(c => c.t >= 0 && c.t < LENGTH).sort((a, b) => a.t - b.t).map((c, i) => ({ ...c, n: i + 1 }));
}

export const CUES = cueSheet();

/** The made sound at the end of a slot's or a recording's `instead` (a slot's may be one of RECORDINGS). */
export const madeFor = name => { const entry = SLOTS[name] ?? RECORDINGS[name]; return entry ? madeFor(entry.instead) : name; };

/** What a cue's name is: 'bed', 'slot', 'recording' or 'made' (null: nothing known). */
export function kindOf(cue) {
  if (cue.bed !== undefined) return 'bed';
  if (Object.hasOwn(SLOTS, cue.sound)) return 'slot';
  if (Object.hasOwn(RECORDINGS, cue.sound)) return 'recording';
  return Object.hasOwn(MADE, cue.sound) ? 'made' : null;
}

/**
 * The bed at a second of the show, from the sheet's bed cues: its `level` then, and, when it is on its way to another, where to
 * (`to`) and how many seconds are `left` of the way.
 */
export function bedAt(t, cues = CUES) {
  let from = 0, to = 0, start = 0, seconds = 0;
  const value = at => (seconds > 0 ? from + (to - from) * clamp((at - start) / seconds, 0, 1) : to);
  for (const cue of cues) {
    if (cue.bed === undefined || cue.t > t) continue;
    from = value(cue.t); // (a way not yet gone to its end is left where it is)
    to = cue.bed;
    start = cue.t;
    seconds = cue.seconds;
  }
  return { level: round(value(t), 4), to, left: round(Math.max(0, start + seconds - t), 4) };
}

// ---------------------------------------------------------------------------------------------
// The player

const REMAKE = new URL('../../', import.meta.url);
const EDGE = 0.012; // s: a recording starts and ends this softly, so a cut into it never clicks

/** A small seeded random (mulberry32): the same cue sounds the same every time, on the page and in the tool's measure. */
function seeded(seed) {
  let a = (seed * 0x9e3779b1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The show's sound on `context` (null: a capture or a still, which are silent: the same object, doing nothing), heard through
 * `output` (the page's: world.sound.output). `offline`: the context is an OfflineAudioContext (the tool's measure), which does not
 * say it is running. `recordings: false`: the slots' files are not asked for, and every slot plays its `instead` (the show as
 * it was before the real water came, for an ear to compare). Returns
 *   ready           resolves when the recordings that are there have been fetched and decoded
 *   start(from)     the show starts at its second `from` (0, or where a seek put it): whatever sounded is let go, the cues before
 *                   `from` are passed over, and the bed is laid at the level it has there
 *   frame(t)        each frame, with the show's second: every cue whose second has come is played
 *   end(seconds)    the show is over, or left: the bed fades out and everything stops
 *   setPaused(on)   held with the game (world.sound.hold): silent at once, and back
 *   play(cue, at)   one cue now, or at a time of the audio clock; whether it sounded
 *   schedule(from)  the whole sheet from `from` laid on the audio clock at once, its second 0 at the clock's `at` (the tool's measure)
 *   log             what was played: { t, n, sound, level, pan, kind, played, at } (at: the show's second it was played at)
 */
export function createPondSound({ context = null, output = null, fetch = globalThis.fetch, offline = false, cues = CUES, recordings = true } = {}) {
  const log = [];
  if (!context) {
    return { ready: Promise.resolve(false), start() {}, frame() {}, end() {}, setPaused() {}, play: () => false, schedule() {}, log, sounding: () => 0, running: false };
  }

  const master = context.createGain(); // everything passes this, which holds with the game
  master.gain.value = SOUND.master;
  master.connect(output ?? context.destination);
  const awake = () => offline || context.state === 'running';

  // ---- the recordings: Veiddu's two splashes, and whichever of the slots' files sounds.json says are there ----
  const buffers = new Map(); // address → its decoded buffer
  const levels = new Map(); // address → the level its entry in sounds.json gives it
  const loops = new Map(); // address → the stretch its entry says a loop is played round: [from s, seconds]
  const lastTake = new Map(); // name → the address it played last
  const address = file => new URL(file, REMAKE).href;
  const load = file => Promise.resolve()
    .then(() => fetch(address(file)))
    .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
    .then(bytes => context.decodeAudioData(bytes))
    .then(buffer => { buffers.set(file, buffer); })
    .catch(() => {}); // a recording that cannot be had is not heard: its made sound is, in its place
  const ready = Promise.resolve()
    .then(() => (recordings ? fetch(address(MANIFEST)) : { ok: false }))
    .then(response => (response.ok ? response.json() : {}))
    .catch(() => ({}))
    .then(list => {
      const there = list?.files ?? {};
      const slots = Object.values(SLOTS).flatMap(slot => slot.urls).filter(file => Object.hasOwn(there, file.split('/').pop()));
      for (const file of slots) {
        const level = Number(there[file.split('/').pop()]?.level);
        if (Number.isFinite(level) && level >= 0) levels.set(file, level);
        const [from, seconds] = there[file.split('/').pop()]?.loop ?? [];
        if (Number.isFinite(from) && seconds > 0) loops.set(file, [from, seconds]);
      }
      return Promise.all([...Object.values(RECORDINGS).flatMap(recording => recording.urls), ...slots].map(load));
    })
    .then(() => true);

  /** The take of a recording to play now: one that has decoded, not the one played last when there is another. Null: none is there. */
  function takeOf(name, entry, random) {
    const here = entry.urls.filter(file => buffers.has(file));
    const fresh = here.length > 1 ? here.filter(file => file !== lastTake.get(name)) : here;
    if (!fresh.length) return null;
    const file = fresh[Math.floor(random() * fresh.length) % fresh.length];
    lastTake.set(name, file);
    return file;
  }

  // ---- the tools (sfx.js's, each sound laid at a time of the audio clock that is handed to it) ----
  const noises = new Map();
  const noiseRandom = seeded(7);
  /** Three seconds of noise: 'white', 'brown' or 'warm' (sfx.js's). */
  function noiseBuffer(kind) {
    if (!noises.has(kind)) {
      const buffer = context.createBuffer(1, Math.round(context.sampleRate * 3), context.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        const white = noiseRandom() * 2 - 1;
        brown = (brown + 0.02 * white) / 1.02;
        data[i] = kind === 'white' ? white : kind === 'warm' ? white * 0.55 + brown * 1.575 : brown * 3.5;
      }
      noises.set(kind, buffer);
    }
    return noises.get(kind);
  }

  /** Lets go of a source's nodes when it ends. */
  function keep(run, source, nodes) {
    run.live.add(source);
    source.onended = () => {
      run.live.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
      if (run.gone && run.live.size === 0) for (const node of [run.made, run.bed, run.bus]) node.disconnect(); // a run let go: its buses too
    };
  }

  function outlet(volume, pan, bus) {
    if (!context.createStereoPanner) {
      volume.connect(bus);
      return [];
    }
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    volume.connect(panner);
    panner.connect(bus);
    return [panner];
  }

  /** Up to `level` in `attack` s, down to `sustain` of it a third of the way through, and to silence at the end (sfx.js's). */
  function envelope(param, at, duration, level, attack = 0.012, body = 0.36, sustain = 0.48) {
    param.setValueAtTime(0, at);
    param.linearRampToValueAtTime(level, at + Math.min(attack, duration * 0.3));
    if (body) param.linearRampToValueAtTime(level * sustain, at + duration * Math.max(0.31, body));
    param.exponentialRampToValueAtTime(0.0001, at + duration);
  }

  /** sfx.js's tools for one cue: every sound they make is at the cue's time, scaled by its level and put to its side. */
  function toolsFor({ run, at, level, pan, random }) {
    const between = (low, high) => low + random() * (high - low);
    const most = SOUND.panMost + 0.05;
    const side = offset => clamp(pan + (Number.isFinite(offset) ? offset : 0), -most, most);
    function tone({ frequency, end = frequency, duration = 0.3, level: peak = 0.05, delay = 0, pan: offset = 0, type = 'sine', attack, body, sustain }) {
      const from = at + delay;
      const source = context.createOscillator();
      const volume = context.createGain();
      source.type = type;
      source.frequency.setValueAtTime(frequency, from);
      source.frequency.exponentialRampToValueAtTime(Math.max(30, end), from + duration);
      envelope(volume.gain, from, duration, peak * level, attack, body, sustain);
      source.connect(volume);
      keep(run, source, [volume, ...outlet(volume, side(offset), run.made)]);
      source.start(from);
      source.stop(from + duration + 0.015);
    }
    function noise({ duration = 0.35, level: peak = 0.05, frequency = 900, end = frequency, q = 0.7, type = 'lowpass', kind = 'warm', delay = 0, pan: offset = 0, attack = 0.04 }) {
      const from = at + delay;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const volume = context.createGain();
      source.buffer = noiseBuffer(kind);
      source.loop = duration > 2.8; // (the noise is three seconds long)
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(frequency, from);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, end), from + duration);
      envelope(volume.gain, from, duration, peak * level, attack, 0.42, 0.6);
      source.connect(filter);
      filter.connect(volume);
      keep(run, source, [filter, volume, ...outlet(volume, side(offset), run.made)]);
      source.start(from, between(0, Math.max(0, 3 - Math.min(duration, 2.8) - 0.1)));
      source.stop(from + duration + 0.02);
    }
    function bell(frequency, { delay = 0, level: peak = 0.06, pan: offset = 0, duration = 0.52 } = {}) {
      tone({ frequency, duration, level: peak, delay, pan: offset });
      tone({ frequency: frequency * 2, duration: duration * 0.36, level: peak * 0.19, delay, pan: offset });
    }
    return { tone, noise, bell, key: KEY, between };
  }

  /** A recording, from its start: through its gain and its side into the run. `round`: the stretch a loop is played round. */
  function playBuffer(run, buffer, { at, level, pan, rate = 1, loop = false, round: [from, seconds] = [0, 0], bus = run.bus }) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const inside = loop && seconds > 0 && from + seconds <= buffer.duration + 0.05; // (else the whole of it, as it is)
    if (inside) {
      source.loopStart = from;
      source.loopEnd = from + seconds;
    }
    source.playbackRate.value = rate > 0 ? rate : 1;
    const volume = context.createGain();
    if (loop) volume.gain.setValueAtTime(level, at);
    else {
      const heard = buffer.duration / source.playbackRate.value;
      volume.gain.setValueAtTime(0, at);
      volume.gain.linearRampToValueAtTime(level, at + EDGE);
      volume.gain.setValueAtTime(level, at + Math.max(EDGE, heard - EDGE * 3));
      volume.gain.linearRampToValueAtTime(0, at + heard);
    }
    source.connect(volume);
    keep(run, source, [volume, ...outlet(volume, clamp(pan, -1, 1), bus)]);
    if (inside) source.start(at, from);
    else source.start(at);
    return source;
  }

  // ---- the bed: the pond's still water, made (the Fen's water, sfx.js's layFen, shaped for small speakers: nothing of it lives
  // under 150 Hz alone, and no reed), or the slot's recording, looping ----
  function layBed(run, at) {
    const file = takeOf('pond', SLOTS.pond, seeded(1));
    if (file) {
      playBuffer(run, buffers.get(file), { at, level: levels.get(file) ?? SLOTS.pond.level, pan: 0, loop: true, round: loops.get(file), bus: run.bed });
      return 'recording';
    }
    // two murmurs of water, one a little to each side, each lapping in its own slow time, the second a lighter one (half of what a
    // small speaker gives of the bed is its); and a thin breath of air over them
    for (const [pan, kind, low, high, level, lapsIn, depth, offset] of [[-0.3, 'brown', 220, 950, 0.07, 0.24, 0.45, 0.2], [0.3, 'warm', 350, 1400, 0.07, 0.17, 0.5, 1.3]]) {
      const water = context.createBufferSource();
      water.buffer = noiseBuffer(kind);
      water.loop = true;
      const floor = context.createBiquadFilter();
      floor.type = 'highpass';
      floor.frequency.value = low;
      floor.Q.value = 0.5;
      const roof = context.createBiquadFilter();
      roof.type = 'lowpass';
      roof.frequency.value = high;
      roof.Q.value = 0.5;
      const lap = context.createGain();
      lap.gain.value = level * SOUND.bed;
      const lapping = context.createOscillator();
      lapping.frequency.value = lapsIn;
      const lapDepth = context.createGain();
      lapDepth.gain.value = level * depth * SOUND.bed;
      lapping.connect(lapDepth);
      lapDepth.connect(lap.gain);
      water.connect(floor);
      floor.connect(roof);
      roof.connect(lap);
      keep(run, water, [floor, roof, lap, lapDepth, ...outlet(lap, pan, run.bed)]);
      keep(run, lapping, []);
      water.start(at, offset);
      lapping.start(at);
    }
    const air = context.createBufferSource();
    air.buffer = noiseBuffer('white');
    air.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2800;
    band.Q.value = 0.6;
    const hiss = context.createGain();
    hiss.gain.value = 0.0035 * SOUND.bed;
    air.connect(band);
    band.connect(hiss);
    hiss.connect(run.bed);
    keep(run, air, [band, hiss]);
    air.start(at);
    return 'made';
  }

  /** The bed's level from `from` to `to` over `seconds`, from the audio clock's `at`. */
  function bedTo(run, from, to, seconds, at) {
    const gain = run.bed.gain;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(from, at);
    if (seconds > 0) gain.linearRampToValueAtTime(to, at + seconds);
    else gain.setValueAtTime(to, at);
  }

  // ---- a run of the show: its own buses, so that one played again starts clean ----
  let run = null;
  let next = 0;
  function begin(at, from) {
    const bus = context.createGain(); // the recordings, as they are
    bus.gain.value = 1;
    bus.connect(master);
    const made = context.createGain(); // the made sounds
    made.gain.value = SOUND.made;
    made.connect(bus);
    const bed = context.createGain();
    bed.connect(bus);
    run = { bus, made, bed, live: new Set(), bedIs: null };
    const { level, to, left } = bedAt(from, cues);
    bedTo(run, level, to, left, at);
    run.bedIs = layBed(run, at);
    return run;
  }
  /** A run fades out over `seconds` and lets go of everything it has. */
  function letGo(old, seconds) {
    const now = context.currentTime;
    old.gone = true;
    const gain = old.bus.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + seconds);
    for (const source of [...old.live]) {
      try { source.stop(now + seconds + 0.02); } catch { /* never started, or stopped already */ }
    }
  }

  /** Plays one cue at the audio clock's `at`. Whether it sounded (a bed cue: whether its level was taken). */
  function fire(cue, at, second = cue.t) {
    const kind = kindOf(cue);
    const entry = { t: cue.t, n: cue.n, sound: cue.sound ?? 'bed', level: cue.bed ?? cue.level, pan: cue.pan ?? 0, kind, played: null, at: round(second) };
    log.push(entry);
    if (!run || !kind) return false;
    if (kind === 'bed') {
      bedTo(run, bedAt(cue.t - 1e-9, cues).level, cue.bed, cue.seconds, at);
      entry.played = run.bedIs === 'recording' ? 'pond' : SLOTS.pond.instead;
      return true;
    }
    const random = seeded(100 + (cue.n ?? 0));
    // a recording: the cue's own, or, where that is not there, the recording its `instead` names (the fish's: Veiddu's plop)
    for (let name = cue.sound, recorded = SLOTS[name] ?? RECORDINGS[name]; recorded; name = recorded.instead, recorded = RECORDINGS[name]) {
      const file = takeOf(name, recorded, random);
      if (!file) continue;
      const rate = Number.isFinite(cue.rate) ? cue.rate : 1 + (random() * 2 - 1) * SOUND.takeVary;
      playBuffer(run, buffers.get(file), { at, level: (levels.get(file) ?? recorded.level) * cue.level, pan: cue.pan, rate });
      entry.played = file.split('/').pop();
      return true;
    }
    const name = madeFor(cue.sound);
    MADE[name](toolsFor({ run, at, level: cue.level, pan: cue.pan, random }), cue.detail ?? {});
    entry.played = name;
    return true;
  }

  return {
    ready,
    log,
    get running() { return Boolean(run); },
    start(from = 0) {
      if (run) letGo(run, 0.05);
      log.length = 0;
      next = cues.findIndex(cue => cue.t >= from - 1e-6);
      if (next < 0) next = cues.length;
      begin(context.currentTime, from);
    },
    frame(t) {
      if (!run) return;
      if (!awake()) {
        // asleep still (the tap's wake-up takes a moment): a cue waits a little for it, and is passed over if it lasts
        while (next < cues.length && cues[next].t <= t - SOUND.late) {
          const cue = cues[next++];
          log.push({ t: cue.t, n: cue.n, sound: cue.sound ?? 'bed', level: cue.bed ?? cue.level, pan: cue.pan ?? 0, kind: kindOf(cue), played: null, at: round(t) });
          if (cue.bed !== undefined) bedTo(run, cue.bed, cue.bed, 0, context.currentTime);
        }
        return;
      }
      while (next < cues.length && cues[next].t <= t) fire(cues[next++], context.currentTime, t);
    },
    end(seconds = 0.4) {
      if (!run) return;
      letGo(run, seconds);
      run = null;
    },
    setPaused(on) {
      master.gain.setTargetAtTime(on ? 0 : SOUND.master, context.currentTime, 0.015);
    },
    play(cue, at = context.currentTime) {
      if (!run) begin(context.currentTime, LENGTH); // (alone: no bed under it)
      return fire(cue, at);
    },
    schedule(from = 0, at = context.currentTime) {
      if (run) letGo(run, 0.05);
      log.length = 0;
      begin(at, from);
      next = cues.length;
      for (const cue of cues) if (cue.t >= from - 1e-6) fire(cue, at + cue.t - from);
    },
    sounding: () => run?.live.size ?? 0,
  };
}
