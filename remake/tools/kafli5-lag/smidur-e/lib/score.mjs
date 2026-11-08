// "Ljósadansinn" (smidur-e): the song as data. Every event is placed in beats on one fixed grid (125 bpm, beat 0 at 0 s).
// The parts render it (render.mjs); song.json is written from it.
import { rng } from './dsp.mjs';

export const BPM = 125;
export const SPB = 21168; // samples per beat at 44.1 kHz (5292 a sixteenth: the grid is sample-exact)
export const KEY = 'G major';

// Her tune's tones in the robot's octave (G4 to E5): do re mi sol la.
export const TONE = { grazers: 67, turtles: 69, frogs: 71, lizards: 74, flyers: 76 };
export const GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];

// Her tune (kept as it is in the game: sol mi / re mi do / la sol mi sol / la sol mi re do) and its rhythm in beats from the
// hook's start: each phrase opens on the downbeat of an odd bar, with a 3-3-2 lilt; the last do lands on the 8th bar.
export const TUNE = [
  ['lizards', 'frogs'],
  ['turtles', 'frogs', 'grazers'],
  ['flyers', 'lizards', 'frogs', 'lizards'],
  ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'],
];
export const TUNE_AT = [[0, 1.5], [8, 9.5, 11], [16, 17.5, 19, 20], [24, 25.5, 27, 27.5, 28]];
export const TUNE_LEN = [[1.5, 2.5], [1.5, 1.5, 2], [1.5, 1.5, 1, 2], [1.5, 1.5, 0.5, 0.5, 3]];

// Chords: bass root (MIDI), pad voicing (mid range), e-piano voicing, arp tones (high).
export const CHORDS = {
  G: { root: 31, pad: [55, 59, 62, 66, 69], ep: [59, 62, 66, 69], arp: [67, 71, 74, 78, 81] },
  Em: { root: 28, pad: [52, 55, 59, 62, 66], ep: [55, 59, 62, 66], arp: [64, 67, 71, 74, 78] },
  C: { root: 36, pad: [52, 55, 59, 62, 64], ep: [55, 59, 62, 64], arp: [64, 67, 71, 72, 76] },
  D11: { root: 38, pad: [52, 55, 57, 60, 64], ep: [55, 57, 60, 64], arp: [62, 67, 69, 72, 76] },
  D: { root: 38, pad: [54, 57, 62, 64, 66], ep: [54, 57, 62, 66], arp: [62, 66, 69, 74, 78] },
  DF: { root: 42, pad: [54, 57, 62, 66, 69], ep: [57, 62, 66, 69], arp: [62, 66, 69, 74, 78] },
  Am: { root: 33, pad: [52, 55, 59, 60, 64], ep: [55, 59, 60, 64], arp: [64, 67, 69, 71, 76] },
  G69: { root: 31, pad: [55, 59, 62, 64, 69], ep: [59, 62, 64, 69], arp: [67, 69, 71, 74, 76] },
};
const LOOP4 = ['G', 'Em', 'C', 'D11'];

// The form, in bars (4 beats each).
export const SECTIONS = [
  { id: 'intro', name: 'Intro', nameIs: 'Rökkur', bar: 0, bars: 4, feature: null,
    what: 'Dusk at the pond: the string pad opens like a filter waking up, the first fireflies blink, a far frog, lizard and bird.' },
  { id: 'groove', name: 'Dance floor', nameIs: 'Dansgólfið', bar: 4, bars: 8, feature: null,
    what: 'The forest lights up as a dance floor: four-on-the-floor kick, claps, octave disco bass and the firefly bell riff. Bars 9-12 are the loop.' },
  { id: 'tuneA', name: 'Her song', nameIs: 'Lagið hennar', bar: 12, bars: 8, feature: null,
    what: 'The animals sing her tune, each note by its own group (the camera jumps to each singer), a marimba under every note; the robot voice echoes the first two phrases, then sings along.' },
  { id: 'grazers', name: 'Grazers', nameIs: 'Grasbítarnir', bar: 20, bars: 4, feature: 'grazers',
    what: 'Half-time stomp: the big grazers moo their do as chopped stabs over long bass notes.' },
  { id: 'turtles', name: 'Turtles', nameIs: 'Skjaldbökurnar', bar: 24, bars: 4, feature: 'turtles',
    what: 'The beat comes back steady: the turtles hum re on every off-beat, answered by tuned toms.' },
  { id: 'frogs', name: 'Frogs', nameIs: 'Froskarnir', bar: 28, bars: 4, feature: 'frogs',
    what: 'The frogs croak mi in a syncopated pattern in two octaves, with congas.' },
  { id: 'lizards', name: 'Small lizards', nameIs: 'Litlu eðlurnar', bar: 32, bars: 4, feature: 'lizards',
    what: 'Quick lizards chirp sol in sixteenth flurries; shaker, open hats and the bell riff join.' },
  { id: 'flyers', name: 'Small flyers', nameIs: 'Litlu flugdýrin', bar: 36, bars: 4, feature: 'flyers',
    what: 'The flyers whistle long la calls with echoes while the robot voice soars with them; the brightest groove so far.' },
  { id: 'break', name: 'Her horn', nameIs: 'Hornið hennar', bar: 40, bars: 8, feature: 'sloedla',
    what: 'The drums and bass step away and the chords change: Slóeðla plays her whole tune on her horn, alone with the fireflies.' },
  { id: 'rise', name: 'The rise', nameIs: 'Upp, upp, upp', bar: 48, bars: 8, feature: null,
    what: 'Everything builds: the kick returns, a snare roll quickens, the animals call in a climbing do-re-mi-sol-la run, faster and faster, over a bass that walks up to the top.' },
  { id: 'peak1', name: 'All together', nameIs: 'Öll saman', bar: 56, bars: 8, feature: 'all',
    what: 'The high point: the animals sing her tune with the robot voice, and her horn answers the first phrases and then sings along; the full disco.' },
  { id: 'peak2', name: 'All together, again', nameIs: 'Öll saman aftur', bar: 64, bars: 8, feature: 'all',
    what: 'Her tune once more: horn and animals together, the robot sings a third above, every group dances its own pattern underneath.' },
  { id: 'end', name: 'Ending', nameIs: 'Lokin', bar: 72, bars: 4, feature: 'all',
    what: 'Stop-time: the last phrase la-sol-mi-re one note per beat, then do with all five groups at once (the pentatonic is the chord), held while everyone dances, and a last hit.' },
];
export const LOOP = { startBeat: 32, beats: 16 }; // bars 9-12 (8-11 from 0): the groove; bars 5-8 are the same, so the seam is clean.
export const END_BEAT = 300; // the last hit
export const TAIL_SEC = 2.6;

export function sectionAt(beat) {
  let s = SECTIONS[0];
  for (const x of SECTIONS) if (beat >= x.bar * 4) s = x;
  return s;
}

/** The chord of each bar. */
export function chordOfBar(bar) {
  if (bar >= 40 && bar < 48) return ['C', 'C', 'D11', 'D11', 'Em', 'Em', 'Am', 'D11'][bar - 40];
  if (bar >= 52 && bar < 56) return ['C', 'D', 'Em', 'DF'][bar - 52];
  if (bar === 72) return 'C';
  if (bar >= 73) return 'G69';
  return LOOP4[bar % 4];
}

// ---------------------------------------------------------------- the score
export function buildScore() {
  const S = {
    pad: [], ep: [], bass: [], kick: [], clap: [], hat: [], ohat: [], shaker: [], conga: [], tom: [], snare: [], cymbal: [],
    riser: [], robot: [], bell: [], marimba: [], horn: [], calls: [], cues: [], tuneNotes: [],
  };
  const sw = 0.028; // swing on the off-sixteenths (beats)
  const at16 = (bar, step) => bar * 4 + step / 4 + (step % 2 ? sw : 0);

  // -------- drums by section
  const fourFloor = (bar, vel = 1, tone = 1) => {
    for (let b = 0; b < 4; b++) S.kick.push({ beat: bar * 4 + b, vel, tone });
  };
  const claps = (bar, vel = 0.8) => {
    for (const b of [1, 3]) S.clap.push({ beat: bar * 4 + b, vel });
  };
  const hats16 = (bar, vel = 0.32) => {
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 2) continue; // the open hat takes the off-beat
      S.hat.push({ beat: at16(bar, s), vel: vel * [1, 0.5, 0, 0.62][s % 4] + (s % 4 === 0 ? 0 : 0.02) });
    }
  };
  const openHats = (bar, vel = 0.42) => {
    for (const b of [0.5, 1.5, 2.5, 3.5]) S.ohat.push({ beat: bar * 4 + b, vel });
  };
  const shaker16 = (bar, vel = 0.3) => {
    for (let s = 0; s < 16; s++) S.shaker.push({ beat: at16(bar, s), vel: vel * (s % 4 === 0 ? 1 : s % 2 ? 0.55 : 0.75) });
  };
  const congas = (bar, vel = 0.5) => {
    const pat = [[2, 74], [5, 67], [7, 74], [10, 79], [11, 74], [13, 67], [15, 74]];
    for (const [s, m] of pat) S.conga.push({ beat: at16(bar, s), midi: m, vel: vel * (s === 10 ? 1 : 0.8) });
  };

  // -------- bass
  const BASS_PAT = [[0, 0, 2, 1], [2, 1, 1.6, 0.8], [4, 0, 2, 0.95], [6, 1, 1, 0.75], [7, 1, 1, 0.55], [8, 0, 2, 1], [10, 1, 1.6, 0.8], [12, 0, 2, 0.95], [14, 1, 1.6, 0.8]];
  const discoBass = (bar, vel = 1, bright = 1) => {
    const ch = CHORDS[chordOfBar(bar)];
    const last = bar % 4 === 3 && chordOfBar(bar) === 'D11';
    for (const [s, oct, len, v] of BASS_PAT) {
      if (last && s >= 12) continue;
      S.bass.push({ beat: at16(bar, s), dur: (len / 4) * 0.48, midi: ch.root + 12 * oct, vel: v * vel, bright });
    }
    if (last) {
      // walk up into G: D3 C3 A2 F#2 (sixteenths)
      [50, 48, 45, 42].forEach((m, k) => S.bass.push({ beat: at16(bar, 12 + k), dur: 0.11, midi: m, vel: 0.8 * vel, bright }));
    }
  };

  // -------- pad, e-piano, arp
  const padBar = (bar, opts = {}) => {
    const name = chordOfBar(bar);
    S.pad.push({ beat: bar * 4, beats: opts.beats ?? 4, notes: CHORDS[name].pad, attack: opts.attack ?? 0.05, release: opts.release ?? 0.3, vel: opts.vel ?? 1 });
  };
  const EP_STEPS = [3, 6, 10, 14];
  const epComp = (bar, vel = 0.5) => {
    const ch = CHORDS[chordOfBar(bar)];
    for (const s of EP_STEPS) S.ep.push({ beat: at16(bar, s), dur: 0.13, notes: ch.ep, vel: vel * (s === 10 ? 1 : 0.85) });
  };
  const ARP = [0, -1, 2, 4, -1, 3, 2, -1, 0, 2, -1, 4, 3, -1, 1, 2];
  const arpBar = (bar, vel = 0.4, oct = 12) => {
    const ch = CHORDS[chordOfBar(bar)];
    ARP.forEach((k, s) => {
      if (k < 0) return;
      S.bell.push({ beat: at16(bar, s), midi: ch.arp[k] + oct, vel: vel * (s % 4 === 0 ? 1 : 0.72), decay: 0.32, pan: s % 2 ? 0.45 : -0.45, delay: 1 });
    });
  };
  const PENTA = [67, 69, 71, 74, 76];
  const twinkles = (bar, count, seed, vel = 0.22) => {
    const r = rng(seed);
    for (let k = 0; k < count; k++) {
      const step = Math.floor(r() * 16);
      const midi = PENTA[Math.floor(r() * 5)] + (r() < 0.5 ? 24 : 36);
      S.bell.push({ beat: bar * 4 + step / 4, midi: Math.min(midi, 100), vel: vel * (0.6 + 0.4 * r()), decay: 0.7, pan: r() * 1.6 - 0.8, delay: 1, bright: 0.5 });
    }
  };

  // -------- animals
  const PAN = { grazers: -0.35, turtles: -0.18, frogs: 0.18, lizards: 0.35, flyers: 0 };
  const call = (group, beat, o = {}) => {
    S.calls.push({ group, beat, dur: o.dur ?? 1, vel: o.vel ?? 1, take: o.take ?? 0, mode: o.mode ?? 'onset', octave: o.octave ?? 0, pan: o.pan ?? PAN[group] });
    S.cues.push({ beat: round(beat), kind: 'call', group });
  };
  const sing = (hook, { robot = 'none', horn = 'none', vel = 1, marimba = true } = {}) => {
    TUNE.forEach((phrase, p) => {
      phrase.forEach((g, k) => {
        const beat = hook + TUNE_AT[p][k];
        const dur = TUNE_LEN[p][k];
        call(g, beat, { dur, vel, pan: PAN[g] * 0.5 });
        S.tuneNotes.push({ group: g, beat });
        if (marimba) S.marimba.push({ beat, midi: TONE[g], vel: 0.55 });
        // robot
        const echo = robot === 'echo' && p < 2;
        if (robot === 'unison' || (robot === 'echo' && p >= 2)) S.robot.push({ beat, dur: dur * 0.48 * 0.92, midi: TONE[g], vel: robot === 'echo' ? 0.6 : 0.85, vowels: ['u', 'a'] });
        if (echo) {
          const last = k === phrase.length - 1;
          S.robot.push({ beat: beat + 4, dur: (last && p === 1 ? 1 : dur) * 0.48 * 0.92, midi: TONE[g] + 12 * 0, vel: 0.8, vowels: ['o', 'a'] });
        }
        if (robot === 'third') S.robot.push({ beat, dur: dur * 0.48 * 0.92, midi: thirdAbove(TONE[g]), vel: 0.62, vowels: ['e', 'a'] });
        // horn
        if (horn === 'echo' && p < 2) {
          const last = k === phrase.length - 1;
          hornNote(beat + 4, (last && p === 1 ? 1 : dur), TONE[g] - 12, 0.9);
        }
        if ((horn === 'echo' && p >= 2) || horn === 'unison') hornNote(beat, dur, TONE[g] - 12, 0.85);
      });
    });
  };
  const hornNote = (beat, beats, midi, vel = 1) => {
    S.horn.push({ beat, dur: Math.min(beats * 0.48, 2.5), midi, vel });
    S.cues.push({ beat: round(beat), kind: 'horn' });
  };
  const chopPattern = (group, bar, steps, o = {}) => {
    steps.forEach(([s, len, take = 0, oct = 0], k) =>
      call(group, at16(bar, s) - (s % 2 ? sw : 0), { dur: len / 4, take, octave: oct, mode: 'chop', vel: (o.vel ?? 1) * (k === 0 ? 1 : 0.88) }),
    );
  };
  const CHOPS = {
    grazers: [
      [[0, 5, 0], [6, 4, 1], [12, 3, 0]],
      [[0, 4, 1], [6, 2, 0], [8, 2, 1], [12, 4, 0]],
      [[0, 5, 0], [6, 4, 1], [12, 3, 0]],
      [[0, 3, 1], [4, 3, 0], [8, 2, 1], [10, 2, 0], [12, 4, 1]],
    ],
    turtles: [
      [[2, 1.6], [6, 1.6], [10, 1.6], [14, 1.6]],
      [[2, 1.6], [6, 1.6], [10, 1.6], [14, 1.6]],
      [[2, 1.6], [6, 1.6], [10, 1.6], [14, 1.6]],
      [[2, 1.6], [6, 1.6], [10, 1.6], [12, 1.6], [14, 1.6]],
    ],
    frogs: [
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]],
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]],
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]],
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [8, 1, 1], [10, 2, 0], [12, 1, 1], [13, 1, 0], [14, 2, 1]],
    ],
    lizards: [
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [6, 1, 1], [8, 1, 0], [10, 1, 1], [12, 1, 0], [13, 1, 1], [14, 1, 0], [15, 1, 1]],
    ],
  };

  // ======== Intro (bars 0-3)
  for (let bar = 0; bar < 4; bar++) {
    padBar(bar, { attack: bar === 0 ? 1.2 : 0.3, release: 0.6, vel: 1 });
    twinkles(bar, [3, 5, 6, 7][bar], 100 + bar, 0.2 + bar * 0.03);
  }
  for (let bar = 2; bar < 4; bar++) for (let b = 0; b < 4; b++) S.kick.push({ beat: bar * 4 + b, vel: 0.45 + (bar - 2) * 0.15 + b * 0.03, tone: 0.25 });
  S.bass.push({ beat: 8, dur: 1.9, midi: 36, vel: 0.55, bright: 0.25 });
  S.bass.push({ beat: 12, dur: 1.3, midi: 38, vel: 0.6, bright: 0.3 });
  [[12, 0.15], [12.5, 0.2], [13, 0.25], [13.5, 0.3], [14, 0.35], [14.5, 0.4], [15, 0.45], [15.25, 0.5], [15.5, 0.55], [15.75, 0.6]].forEach(([b, v]) => S.hat.push({ beat: b, vel: v * 0.6 }));
  S.cymbal.push({ beat: 12, seconds: 4 * 0.48, reverse: true, vel: 0.22 });
  call('frogs', 5, { take: 1, vel: 0.45, pan: 0.6 });
  call('lizards', 9.5, { vel: 0.4, pan: -0.6 });
  call('flyers', 13, { vel: 0.45, pan: 0.3 });
  S.robot.push({ beat: 8, dur: 1.5 * 0.48, midi: 74, vel: 0.35, vowels: ['u', 'o'] });
  S.robot.push({ beat: 9.5, dur: 2.2 * 0.48, midi: 71, vel: 0.35, vowels: ['u', 'o'] });
  S.cues.push({ beat: 12, kind: 'rise' });

  // ======== Dance floor (bars 4-11): two identical 4-bar halves (the loop is the second)
  for (let bar = 4; bar < 12; bar++) {
    fourFloor(bar);
    hats16(bar);
    shaker16(bar, 0.16);
    discoBass(bar);
    padBar(bar);
    arpBar(bar, 0.4);
  }
  S.cymbal.push({ beat: 16, seconds: 2.2, vel: 0.11 }); // its wash is gone long before the loop's bars
  S.cues.push({ beat: 16, kind: 'hit' });

  // ======== Her song, sung by the animals (bars 12-19)
  for (let bar = 12; bar < 20; bar++) {
    fourFloor(bar);
    claps(bar);
    hats16(bar, 0.28);
    openHats(bar, 0.36);
    discoBass(bar, 0.95);
    padBar(bar, { vel: 0.85 });
    epComp(bar, 0.42);
  }
  S.cymbal.push({ beat: 48, seconds: 2.4, vel: 0.12 });
  S.cues.push({ beat: 48, kind: 'hit' });
  sing(48, { robot: 'echo' });

  // ======== Parade (bars 20-39)
  // grazers: half-time stomp
  for (let bar = 20; bar < 24; bar++) {
    S.kick.push({ beat: bar * 4, vel: 1, tone: 1 }, { beat: bar * 4 + 2, vel: 0.95, tone: 1 });
    if (bar % 2 === 1) S.kick.push({ beat: bar * 4 + 3.5, vel: 0.55, tone: 0.8 });
    S.clap.push({ beat: bar * 4 + 2, vel: 0.85 });
    for (const b of [0.5, 1.5, 2.5, 3.5]) S.hat.push({ beat: bar * 4 + b, vel: 0.22 });
    const ch = CHORDS[chordOfBar(bar)];
    S.bass.push({ beat: bar * 4, dur: 1.4 * 0.48, midi: ch.root, vel: 1, bright: 0.7 });
    S.bass.push({ beat: bar * 4 + 1.5, dur: 0.4 * 0.48, midi: ch.root + 12, vel: 0.7, bright: 0.7 });
    S.bass.push({ beat: bar * 4 + 2, dur: 1.4 * 0.48, midi: ch.root, vel: 0.95, bright: 0.7 });
    S.bass.push({ beat: bar * 4 + 3.5, dur: 0.4 * 0.48, midi: ch.root + 12, vel: 0.7, bright: 0.7 });
    padBar(bar, { vel: 0.8 });
    chopPattern('grazers', bar, CHOPS.grazers[bar - 20], { vel: 1 });
  }
  S.cues.push({ beat: 80, kind: 'hit' });
  // turtles: steady again, toms answer
  for (let bar = 24; bar < 28; bar++) {
    fourFloor(bar, 0.9);
    claps(bar, 0.7);
    for (let s = 0; s < 16; s += 2) S.hat.push({ beat: at16(bar, s), vel: s % 4 ? 0.26 : 0.18 });
    discoBass(bar, 0.9, 0.8);
    padBar(bar, { vel: 0.85 });
    const ch = CHORDS[chordOfBar(bar)];
    const tomPat = bar === 27 ? [[12, 0], [13, -2], [14, -5], [15, -7]] : [[7, 0], [15, -5]];
    for (const [s, d] of tomPat) S.tom.push({ beat: at16(bar, s), midi: ch.root + 24 + 7 + d, vel: 0.6 });
    chopPattern('turtles', bar, CHOPS.turtles[bar - 24]);
  }
  // frogs: congas
  for (let bar = 28; bar < 32; bar++) {
    fourFloor(bar);
    claps(bar, 0.75);
    hats16(bar, 0.26);
    discoBass(bar);
    padBar(bar, { vel: 0.85 });
    congas(bar, 0.45);
    chopPattern('frogs', bar, CHOPS.frogs[bar - 28], { vel: 0.95 });
  }
  // lizards: shaker, open hats, the bell riff again
  for (let bar = 32; bar < 36; bar++) {
    fourFloor(bar);
    claps(bar);
    hats16(bar, 0.24);
    openHats(bar, 0.36);
    shaker16(bar, 0.28);
    discoBass(bar);
    padBar(bar, { vel: 0.85 });
    epComp(bar, 0.32);
    arpBar(bar, 0.22);
    chopPattern('lizards', bar, CHOPS.lizards[bar - 32], { vel: 0.9 });
  }
  // flyers: brightest groove, long whistles, the robot soars
  for (let bar = 36; bar < 40; bar++) {
    fourFloor(bar);
    claps(bar);
    hats16(bar, 0.28);
    openHats(bar, 0.4);
    shaker16(bar, 0.24);
    congas(bar, 0.3);
    discoBass(bar);
    padBar(bar, { vel: 0.9 });
    epComp(bar, 0.34);
    arpBar(bar, 0.28);
    const flyer = bar === 39 ? [[0, 4], [4, 4], [8, 4], [12, 4]] : [[0, 8], [10, 6]];
    for (const [s, len] of flyer) call('flyers', bar * 4 + s / 4, { dur: len / 4, vel: 0.95, pan: (s / 16) * 1.0 - 0.4 });
  }
  // the robot climbs with the birds: D5 E5 G5 A5, one a bar (each the chord's root, fifth or ninth)
  [[144, 74, 3.6], [148, 76, 3.6], [152, 79, 3.6], [156, 81, 3.4]].forEach(([b, m, beats]) => S.robot.push({ beat: b, dur: beats * 0.48, midi: m, vel: 0.5, vowels: ['o', 'a'], morph: 0.4 }));
  S.cymbal.push({ beat: 156, seconds: 4 * 0.48, reverse: true, vel: 0.15 });

  // ======== Her horn (bars 40-47)
  for (let bar = 40; bar < 48; bar++) {
    const name = chordOfBar(bar);
    const prev = bar > 40 ? chordOfBar(bar - 1) : null;
    if (name !== prev) {
      let len = 1;
      while (bar + len < 48 && chordOfBar(bar + len) === name) len++;
      S.pad.push({ beat: bar * 4, beats: len * 4, notes: CHORDS[name].pad, attack: 0.5, release: 0.9, vel: 0.95 });
    }
    // e-piano: a soft rolling arpeggio, a beat apart
    const ep = CHORDS[name].ep;
    for (let b = 0; b < 4; b++) S.ep.push({ beat: bar * 4 + b + 0.5, dur: 0.4, notes: [ep[(b + bar) % ep.length] + 12], vel: 0.32 });
    twinkles(bar, 4, 200 + bar, 0.2);
    if (bar >= 44) {
      for (let b = 0; b < 4; b++) S.shaker.push({ beat: bar * 4 + b + 0.5, vel: 0.12 + (bar - 44) * 0.04 });
      S.bass.push({ beat: bar * 4, dur: 3.6 * 0.48, midi: CHORDS[name].root + 12, vel: 0.3 + (bar - 44) * 0.07, bright: 0.25 });
    }
  }
  S.cues.push({ beat: 160, kind: 'hit' });
  TUNE.forEach((phrase, p) => phrase.forEach((g, k) => {
    const lens = [[1.5, 5], [1.5, 1.5, 4.5], [1.5, 1.5, 1, 3.5], [1.5, 1.5, 0.5, 0.5, 4]];
    hornNote(160 + TUNE_AT[p][k], lens[p][k], TONE[g] - 12, 1);
  }));

  // ======== The rise (bars 48-55)
  for (let bar = 48; bar < 56; bar++) {
    const u = (bar - 48) / 7;
    fourFloor(bar, 0.5 + 0.42 * u, 0.3 + 0.7 * u);
    padBar(bar, { vel: 0.85 + 0.15 * u });
    if (bar >= 50) for (const b of [0.5, 1.5, 2.5, 3.5]) S.hat.push({ beat: bar * 4 + b, vel: 0.2 + 0.15 * u });
    if (bar < 52) discoBass(bar, 0.6 + 0.2 * u, 0.6);
    else {
      const root = CHORDS[chordOfBar(bar)].root;
      for (let e = 0; e < 8; e++) S.bass.push({ beat: bar * 4 + e / 2, dur: 0.2, midi: root + (e % 2 ? 12 : 0), vel: 0.75 + 0.2 * u, bright: 0.6 + 0.4 * u });
    }
    // snare roll
    const per = bar < 50 ? 2 : bar < 52 ? 1 : bar < 54 ? 0.5 : 0.25;
    for (let b = 0; b < 4; b += per) S.snare.push({ beat: bar * 4 + b + (bar < 50 ? 1 : 0), vel: 0.16 + 0.5 * ((bar - 48 + b / 4) / 8) });
    if (bar === 55) for (let b = 2; b < 4; b += 0.125) S.snare.push({ beat: bar * 4 + b, vel: 0.55 + 0.15 * ((b - 2) / 2) });
    if (bar >= 52) arpBar(bar, 0.16 + 0.1 * u, bar >= 54 ? 24 : 12);
  }
  S.riser.push({ beat: 192, seconds: 32 * 0.48, vel: 0.35 });
  S.cymbal.push({ beat: 216, seconds: 8 * 0.48, reverse: true, vel: 0.22 });
  S.cues.push({ beat: 192, kind: 'rise' });
  // animals climb: one group a bar on the quarters, then do-re-mi-sol-la in eighths, then sixteenths
  GROUPS.slice(0, 4).forEach((g, k) => {
    for (let b = 0; b < 4; b++) call(g, 192 + k * 4 + b, { mode: 'chop', dur: 0.7, vel: 0.8 + 0.05 * k, take: b % 2 && g !== 'turtles' && g !== 'flyers' ? 1 : 0 });
  });
  for (let e = 0; e < 16; e++) {
    const g = GROUPS[e % 5];
    call(g, 208 + e / 2, { mode: 'chop', dur: 0.45, vel: 0.85, take: 0 });
  }
  for (let s = 0; s < 32; s++) {
    const g = GROUPS[s % 5];
    call(g, 216 + s / 4, { mode: 'chop', dur: 0.24, vel: 0.8 + 0.15 * (s / 32), take: 0 });
  }
  [[208, 67, 4], [212, 69, 4], [216, 71, 4], [220, 72, 2], [222, 74, 2]].forEach(([b, m, beats], k) =>
    S.robot.push({ beat: b, dur: beats * 0.48 * 0.97, midi: m, vel: 0.45 + 0.08 * k, vowels: ['u', 'a'], morph: 0.6 }),
  );

  // ======== All together (bars 56-71)
  for (let bar = 56; bar < 72; bar++) {
    fourFloor(bar);
    claps(bar, 0.85);
    hats16(bar, 0.3);
    openHats(bar, 0.42);
    shaker16(bar, 0.26);
    congas(bar, bar < 64 ? 0.3 : 0.38);
    for (const b of [1, 3]) S.snare.push({ beat: bar * 4 + b, vel: 0.42 });
    discoBass(bar);
    padBar(bar);
    if (bar >= 64) S.pad.push({ beat: bar * 4, beats: 4, notes: CHORDS[chordOfBar(bar)].pad.slice(2).map(m => m + 12), attack: 0.05, release: 0.3, vel: 0.45 });
    epComp(bar, 0.4);
    arpBar(bar, bar < 64 ? 0.16 : 0.24);
  }
  S.cymbal.push({ beat: 224, seconds: 2.6, vel: 0.16 }, { beat: 256, seconds: 2.6, vel: 0.15 });
  S.cues.push({ beat: 224, kind: 'peak' }, { beat: 256, kind: 'peak' });
  sing(224, { robot: 'unison', horn: 'echo' });
  sing(256, { robot: 'third', horn: 'unison' });
  // every group's own pattern underneath, softly, on the bars where her tune rests most
  for (let bar = 64; bar < 72; bar++) {
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.34 });
    if (bar % 2 === 0) chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.32 });
    else chopPattern('lizards', bar, CHOPS.lizards[0], { vel: 0.3 });
  }

  // ======== Ending (bars 72-75)
  S.cymbal.push({ beat: 284, seconds: 4 * 0.48, reverse: true, vel: 0.14 });
  const lastPhrase = TUNE[3];
  lastPhrase.slice(0, 4).forEach((g, k) => {
    const beat = 288 + k;
    call(g, beat, { dur: 0.9, vel: 1, pan: 0 });
    S.marimba.push({ beat, midi: TONE[g], vel: 0.6 });
    S.robot.push({ beat, dur: 0.38, midi: TONE[g], vel: 0.8, vowels: ['o', 'a'] });
    hornNote(beat, 0.8, TONE[g] - 12, 0.85);
    const name = k < 2 ? 'C' : 'D11';
    S.pad.push({ beat, beats: 0.45, notes: CHORDS[name].pad, attack: 0.004, release: 0.12, vel: 0.9 });
    S.ep.push({ beat, dur: 0.2, notes: CHORDS[name].ep, vel: 0.5 });
    S.bass.push({ beat, dur: 0.2, midi: CHORDS[name].root + 12, vel: 0.9, bright: 0.8 });
    S.kick.push({ beat, vel: 0.85, tone: 1 });
    S.clap.push({ beat, vel: 0.35 + 0.1 * k });
  });
  S.cues.push({ beat: 288, kind: 'hit' });
  // do: all five at once
  for (const g of GROUPS) call(g, 292, { dur: 4, vel: g === 'grazers' ? 0.9 : 0.62 });
  S.marimba.push({ beat: 292, midi: 67, vel: 0.6 });
  hornNote(292, 5, 55, 0.85);
  S.robot.push({ beat: 292, dur: 7.6 * 0.48, midi: 67, vel: 0.65, vowels: ['o', 'a'], morph: 0.5 });
  S.pad.push({ beat: 292, beats: 8, notes: CHORDS.G69.pad, attack: 0.02, release: 0.5, vel: 0.85 });
  S.bass.push({ beat: 292, dur: 3.5 * 0.48, midi: 31, vel: 1, bright: 0.8 });
  S.bass.push({ beat: 296, dur: 3.5 * 0.48, midi: 43, vel: 0.85, bright: 0.6 });
  S.cymbal.push({ beat: 292, seconds: 3, vel: 0.16 });
  for (let b = 292; b < 300; b++) S.kick.push({ beat: b, vel: 0.8, tone: 0.9 });
  for (const b of [293, 295, 297, 299]) S.clap.push({ beat: b, vel: 0.65 });
  for (let b = 292; b < 300; b++) S.ohat.push({ beat: b + 0.5, vel: 0.3 });
  [88, 86, 83, 81, 79, 76, 74, 71].forEach((m, k) => S.bell.push({ beat: 296 + k * 0.5, midi: m, vel: 0.3, decay: 0.6, pan: k % 2 ? 0.5 : -0.5, delay: 1 }));
  // the last hit
  S.kick.push({ beat: 300, vel: 0.9, tone: 1 });
  S.clap.push({ beat: 300, vel: 0.6 });
  S.bass.push({ beat: 300, dur: 0.9, midi: 31, vel: 1, bright: 0.8 });
  S.pad.push({ beat: 300, beats: 1.2, notes: CHORDS.G69.pad, attack: 0.004, release: 0.6, vel: 0.95 });
  S.ep.push({ beat: 300, dur: 1.2, notes: [...CHORDS.G69.ep, 74], vel: 0.6 });
  S.bell.push({ beat: 300, midi: 91, vel: 0.35, decay: 0.9, pan: 0, delay: 1 });
  call('grazers', 300, { dur: 2, vel: 0.9, pan: 0 });
  S.marimba.push({ beat: 300, midi: 67, vel: 0.5 });
  S.cues.push({ beat: 292, kind: 'hit' }, { beat: 300, kind: 'end' });

  const DYN = {
    groove: { kick: 0.8, bass: 0.8, pad: 0.85, hat: 0.85 },
    tuneA: { kick: 0.9, bass: 0.9 },
    grazers: { kick: 0.82, bass: 0.84 },
    turtles: { kick: 0.84, bass: 0.86, hat: 0.9 },
    frogs: { kick: 0.9, bass: 0.92 },
    lizards: { kick: 0.95, bass: 0.96 },
    flyers: { kick: 1, bass: 1 },
    end: { kick: 0.92 },
  };
  for (const part of ['kick', 'bass', 'pad', 'hat']) for (const ev of S[part]) {
    const f = DYN[sectionAt(ev.beat).id]?.[part];
    if (f) ev.vel = +(ev.vel * f).toFixed(4);
  }
  // a group's chop never doubles its own note of her tune: the tune note wins
  const sung = S.tuneNotes.map(t => t);
  const clash = c => c.mode === 'chop' && sung.some(t => t.group === c.group && Math.abs(t.beat - c.beat) < 0.5);
  const dropped = S.calls.filter(clash);
  S.calls = S.calls.filter(c => !clash(c));
  for (const d of dropped) {
    const i = S.cues.findIndex(q => q.kind === 'call' && q.group === d.group && q.beat === round(d.beat));
    if (i >= 0) S.cues.splice(i, 1);
  }
  S.cues.sort((a, b) => a.beat - b.beat || a.kind.localeCompare(b.kind));
  return S;
}

const round = b => Math.round(b * 1000) / 1000;
function thirdAbove(m) {
  const scale = [67, 69, 71, 72, 74, 76, 78, 79, 81, 83, 84];
  const i = scale.indexOf(m);
  return scale[i + 2];
}
