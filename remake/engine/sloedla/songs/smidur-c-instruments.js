// The instruments of "Risakarnival" (songs/smidur-c.js): a carnival steel band in which every dinosaur plays percussion, so the
// three never sound alike. Made on the spot with Web Audio from sounds.js's own parts (`tools`: context, outlet, release, tone,
// puff), so they play in any key; each is `tools => play({ freq, at, dur, vel, soft, tapped, into })`, as voices.js's are.
//
//   stalpanna       Slóeðla's steel pan: a sine rung by another on its own pitch (FM) whose ring settles, the pan's strong octave
//                   shimmering a hair sharp, a ping on top; a long note is rolled (a fast tremolo), as a pannist plays it
//   marimba         Kambeðla's marimba: a wooden bar's round tone, its fourth partial (two octaves up) knocking quickly over it,
//                   the mallet's knock
//   karnivaltromma  Þórseðla's carnival drum: under 240 Hz a surdo (a big, soft-mallet boom falling onto its note), over it a
//                   timbale (a shallow metal shell rung by a stick), so her fills go "ta-ta" into a BOOM
//
// A note the child taps (`tapped`) is struck hard: louder, a sharp start, overtones a tablet's speaker can play. A tap at no note
// (`soft`) is a quiet one. How loud each plays is LEVELS (the same rule as voices.js VOICE_LEVELS: soft < play < tapped).

export const LEVELS = {
  stalpanna: { play: 0.17, tapped: 0.48, soft: 0.06 },
  marimba: { play: 0.2, tapped: 0.42, soft: 0.07 },
  karnivaltromma: { play: 0.32, tapped: 0.46, soft: 0.11 },
};

const levelOf = (name, { soft = false, tapped = false }) => (soft ? LEVELS[name].soft : tapped ? LEVELS[name].tapped : LEVELS[name].play);

/** Slóeðla's steel pan. */
export function stalpanna({ context, outlet, release, tone, puff }) {
  return ({ freq: f, at, dur = 0.4, vel = 1, soft = false, tapped = false, into }) => {
    const level = levelOf('stalpanna', { soft, tapped }) * vel;
    const rolled = !soft && dur >= 0.6; // a long note is rolled
    const ring = soft ? 0.45 : rolled ? dur + 0.35 : Math.min(1.3, Math.max(0.75, dur * 2));
    const end = at + ring;
    const { volume, nodes } = outlet(0.05, into, 0.3);
    const g = volume.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(level, at + (tapped ? 0.0015 : 0.003));
    g.exponentialRampToValueAtTime(level * (rolled ? 0.55 : 0.42), at + 0.16);
    if (rolled) g.setValueAtTime(level * 0.55, at + dur);
    g.exponentialRampToValueAtTime(0.0001, end);
    let head = volume;
    const sources = [];
    if (rolled) {
      // the roll: the level beats about 12 times a second after the first strike
      const roll = context.createGain();
      roll.gain.setValueAtTime(1, at);
      roll.gain.setValueAtTime(1, at + 0.1);
      roll.gain.linearRampToValueAtTime(0.62, at + 0.16);
      const lfo = context.createOscillator();
      lfo.frequency.value = 12.5;
      const depth = context.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.setValueAtTime(0, at + 0.12);
      depth.gain.linearRampToValueAtTime(0.38, at + 0.2);
      lfo.connect(depth);
      depth.connect(roll.gain);
      roll.connect(volume);
      head = roll;
      sources.push(lfo);
      nodes.push(roll, depth);
    }
    // the body: a sine on the note, its frequency swung by another sine on the same pitch, bright at the strike and settling
    const carrier = context.createOscillator();
    carrier.frequency.setValueAtTime(f * 1.01, at);
    carrier.frequency.exponentialRampToValueAtTime(f, at + 0.03);
    const modulator = context.createOscillator();
    modulator.frequency.setValueAtTime(f, at);
    const index = context.createGain();
    const bright = soft ? 0.9 : tapped ? 2.6 : 1.7;
    index.gain.setValueAtTime(f * bright, at);
    index.gain.exponentialRampToValueAtTime(f * (rolled ? 0.7 : 0.35), at + 0.28);
    modulator.connect(index);
    index.connect(carrier.frequency);
    const body = context.createGain();
    body.gain.value = 0.75;
    carrier.connect(body);
    body.connect(head);
    // the pan's octave, strong and a hair sharp (it shimmers against the note), dying sooner
    const octave = context.createOscillator();
    octave.frequency.setValueAtTime(f * 2.003, at);
    const share = context.createGain();
    share.gain.setValueAtTime(0.0001, at);
    share.gain.linearRampToValueAtTime(soft ? 0.2 : 0.42, at + 0.004);
    share.gain.exponentialRampToValueAtTime(rolled ? 0.22 : 0.08, at + 0.35);
    octave.connect(share);
    share.connect(head);
    sources.push(carrier, modulator, octave);
    nodes.push(index, body, share);
    release(carrier, [...sources.filter(s => s !== carrier), ...nodes]);
    for (const source of sources) {
      source.start(at);
      source.stop(end + 0.03);
    }
    // the ping of the stick on the metal, two octaves up
    tone({ frequency: f * 4.01, at, length: tapped ? 0.12 : 0.07, level: level * (tapped ? 0.32 : soft ? 0.06 : 0.14), attack: 0.001, decay: 0.03, hold: 0.25, pan: 0.05, dest: into });
    if (tapped) {
      tone({ frequency: f * 3, at, length: 0.25, level: level * 0.25, attack: 0.002, decay: 0.06, hold: 0.3, pan: 0.05, dest: into });
      puff({ at, length: 0.018, level: level * 0.35, frequency: 5200, q: 1.1, pan: 0.05, attack: 0.001, dest: into });
    }
  };
}

/** Kambeðla's marimba. */
export function marimba({ tone, puff }) {
  return ({ freq: f, at, dur = 0.3, vel = 1, soft = false, tapped = false, into }) => {
    const level = levelOf('marimba', { soft, tapped }) * vel;
    // a low bar rings longer than a high one
    const ring = soft ? 0.3 : Math.min(0.95, Math.max(0.38, 0.95 - f / 900, dur * 0.8));
    const pan = -0.3;
    tone({ frequency: f, at, length: ring, level, attack: 0.004, decay: 0.12, hold: 0.42, pan, dest: into, send: 0.22 });
    // a low bar's knock carries more (its own tone is too low for a small speaker)
    const low = Math.min(1.6, Math.max(1, 400 / f));
    tone({ frequency: f * 4, at, length: tapped ? 0.18 : 0.1, level: level * (tapped ? 0.55 : soft ? 0.12 : 0.26) * low, attack: 0.002, decay: 0.04, hold: 0.25, pan, dest: into });
    if (f * 9.9 < 9000) tone({ frequency: f * 9.9, at, length: 0.03, level: level * (tapped ? 0.16 : 0.05), attack: 0.001, decay: 0.01, hold: 0.2, pan, dest: into });
    puff({ at, length: tapped ? 0.03 : 0.02, level: level * (tapped ? 0.6 : 0.25), frequency: 1700, q: 1.3, pan, attack: 0.001, dest: into });
    if (tapped) tone({ frequency: f * 2, at, length: 0.22, level: level * 0.4 * low, attack: 0.002, decay: 0.06, hold: 0.3, pan, dest: into });
  };
}

/** Þórseðla's carnival drum: a surdo under 240 Hz, a timbale over it. */
export function karnivaltromma({ tone, puff }) {
  return ({ freq: f, at, vel = 1, soft = false, tapped = false, into }) => {
    const level = levelOf('karnivaltromma', { soft, tapped }) * vel;
    const pan = 0.22;
    if (f < 240) {
      // the surdo: a soft mallet on a big skin, the boom dropping onto its note, its octave for small speakers, the thud
      tone({ frequency: f, at, length: soft ? 0.35 : 0.85, level, attack: 0.003, decay: 0.2, hold: 0.42, scoop: 1.55, bend: 0.07, pan, dest: into, send: 0.2 });
      tone({ frequency: f * 2, type: 'triangle', at, length: 0.3, level: level * (tapped ? 0.75 : 0.5), attack: 0.003, decay: 0.07, hold: 0.3, scoop: 1.4, bend: 0.05, pan, dest: into });
      tone({ frequency: f * 3.01, at, length: 0.16, level: level * (tapped ? 0.35 : 0.2), attack: 0.002, decay: 0.04, hold: 0.25, scoop: 1.3, bend: 0.04, pan, dest: into });
      puff({ at, length: 0.07, level: level * 0.4, frequency: 1100, end: 250, type: 'lowpass', q: 0.7, pan, attack: 0.002, dest: into });
      if (tapped) {
        // hit hard: the skin's slap and a knock high enough for a tablet
        tone({ frequency: f * 5.03, type: 'triangle', at, length: 0.14, level: level * 0.85, attack: 0.001, decay: 0.04, hold: 0.25, scoop: 1.3, bend: 0.03, pan, dest: into });
        puff({ at, length: 0.035, level: level * 0.85, frequency: 2400, q: 1.1, pan, attack: 0.001, dest: into });
      }
      return;
    }
    // the timbale: the head's note and two shell modes, short and bright, and the stick's crack
    const length = soft ? 0.15 : 0.32;
    const hit = level * 2;
    tone({ frequency: f, type: 'triangle', at, length, level: hit * 0.75, attack: 0.001, decay: 0.05, hold: 0.3, scoop: 1.12, bend: 0.02, pan: pan + 0.1, dest: into, send: 0.25 });
    tone({ frequency: f * 1.59, at, length: length * 0.7, level: hit * 0.3, attack: 0.001, decay: 0.03, hold: 0.25, pan: pan + 0.1, dest: into });
    tone({ frequency: f * 2.32, at, length: length * 0.45, level: hit * 0.2, attack: 0.001, decay: 0.02, hold: 0.2, pan: pan + 0.1, dest: into });
    puff({ at, length: 0.03, level: hit * (tapped ? 0.55 : 0.36), frequency: 3800, q: 0.9, pan: pan + 0.1, attack: 0.001, dest: into });
  };
}
