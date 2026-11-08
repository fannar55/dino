// "Dýr skógarins" for the storybook orchestra: the score as data, unit by unit, each unit a shot of the music video.
// 126 bpm (21000 samples a beat), F major, 4/4. Units (bars): the forest wakes 0-3, the song grows 4-9 (loop 6-9), grazers
// 10-13, turtles 14-17, chorus 18-25, frogs 26-29, lizards 30-33, flyers 34-37, chorus 38-45, her horn (engines off) 46-53,
// everyone comes (the riser) 54-57, the final chorus (the drop) 58-73, home (a written cadence) 74-75, the last F at bar 76.
//
// Growth is made by adding and subtracting: the dawn has no drums; the groove arrives thin (bar 4) and full (bar 5); each
// featured group brings its own instrument and percussion over the strings; the choruses add brass and a descant; the horn
// unit takes the drums, the bass beat and the brass away; the riser gathers snares bar by bar over a C pedal; the drop is the
// chorus with the tune an octave up and every part in; the second time through her horn sings the tune too.
import { hz } from './lib/dsp.mjs';

export const BPM = 126;
export const BEAT_SAMPLES = 21000; // 44100 * 60 / 126
export const SPB = 60 / BPM;
const B = (bar, beat = 0) => bar * 4 + beat;

/** Brightness across the song (a multiplier of the synths' filter cutoffs): it opens as the energy grows and closes at the end. */
const BRIGHT = [[0, 0.35], [16, 0.8], [20, 0.9], [40, 0.9], [40, 0.74], [56, 0.8], [56, 0.78], [72, 0.86], [72, 1.0], [104, 1.05],
  [104, 0.95], [120, 1.0], [120, 1.0], [136, 1.08], [136, 1.08], [152, 1.16], [152, 1.12], [184, 1.18], [184, 0.52], [216, 0.6],
  [216, 0.6], [232, 1.3], [232, 1.25], [296, 1.35], [296, 1.25], [304, 1.0], [400, 0.9]];
export function brightAt(beat) {
  for (let i = BRIGHT.length - 1; i > 0; i--) {
    const [b1, v1] = BRIGHT[i];
    const [b0, v0] = BRIGHT[i - 1];
    if (beat >= b0 && beat < b1) return b1 === b0 ? v1 : v0 + ((v1 - v0) * (beat - b0)) / (b1 - b0);
  }
  return beat < 0 ? BRIGHT[0][1] : BRIGHT.at(-1)[1];
}

const CH = {
  F: { pad: ['F3', 'C4', 'F4', 'A4'], bass: 'F2', fifth: 'C3', arp: ['F3', 'A3', 'C4', 'F4', 'A4', 'C5', 'F5'] },
  Dm: { pad: ['D3', 'A3', 'F4', 'A4'], bass: 'D2', fifth: 'A2', arp: ['D3', 'F3', 'A3', 'D4', 'F4', 'A4', 'D5'] },
  Dm7: { pad: ['D3', 'C4', 'F4', 'A4'], bass: 'D2', fifth: 'A2', arp: ['D3', 'A3', 'C4', 'D4', 'F4', 'A4', 'C5'] },
  Bb: { pad: ['Bb2', 'D4', 'F4', 'Bb4'], bass: 'Bb1', fifth: 'F2', arp: ['Bb2', 'D3', 'F3', 'Bb3', 'D4', 'F4', 'Bb4'] },
  C: { pad: ['C3', 'C4', 'E4', 'G4'], bass: 'C2', fifth: 'G2', arp: ['C3', 'E3', 'G3', 'C4', 'E4', 'G4', 'C5'] },
  C7: { pad: ['C3', 'Bb3', 'E4', 'G4'], bass: 'C2', fifth: 'G2', arp: ['C3', 'G3', 'Bb3', 'C4', 'E4', 'G4', 'Bb4'] },
  Csus: { pad: ['C3', 'C4', 'F4', 'G4'], bass: 'C2', fifth: 'G2', arp: ['C3', 'F3', 'G3', 'C4', 'F4', 'G4', 'C5'] },
  Gm: { pad: ['G2', 'D4', 'G4', 'Bb4'], bass: 'G2', fifth: 'D3', arp: ['G2', 'D3', 'G3', 'Bb3', 'D4', 'G4', 'Bb4'] },
  Gm7: { pad: ['G2', 'D4', 'F4', 'Bb4'], bass: 'G2', fifth: 'D3', arp: ['G2', 'D3', 'F3', 'Bb3', 'D4', 'F4', 'Bb4'] },
  Am: { pad: ['A2', 'C4', 'E4', 'A4'], bass: 'A2', fifth: 'E3', arp: ['A2', 'E3', 'A3', 'C4', 'E4', 'A4', 'C5'] },
  'F/A': { pad: ['A2', 'C4', 'F4', 'A4'], bass: 'A2', fifth: 'C3', arp: ['A2', 'F3', 'A3', 'C4', 'F4', 'A4', 'C5'] },
  'F/C': { pad: ['C3', 'C4', 'F4', 'A4'], bass: 'C2', fifth: 'G2', arp: ['C3', 'F3', 'A3', 'C4', 'F4', 'A4', 'C5'] },
  'Bb/F': { pad: ['F3', 'D4', 'F4', 'Bb4'], bass: 'F2', fifth: 'F2', arp: ['F3', 'Bb3', 'D4', 'F4', 'Bb4', 'D5', 'F5'] },
  'Bb/C': { pad: ['C3', 'D4', 'F4', 'Bb4'], bass: 'C2', fifth: 'G2', arp: ['C3', 'F3', 'Bb3', 'D4', 'F4', 'Bb4', 'D5'] },
};
const PENTA = ['F', 'G', 'A', 'C', 'D'];

/** Her song, chorus rhythm: [beat in the chorus, beats, group, note]. Four phrases, each followed by an orchestral answer. */
export const TUNE = [
  [0, 2, 'lizards', 'C5'], [2, 2, 'frogs', 'A4'],
  [8, 1, 'turtles', 'G4'], [9, 1, 'frogs', 'A4'], [10, 2, 'grazers', 'F4'],
  [16, 1, 'flyers', 'D5'], [17, 1, 'lizards', 'C5'], [18, 1, 'frogs', 'A4'], [19, 1, 'lizards', 'C5'],
  [24, 1, 'flyers', 'D5'], [25, 1, 'lizards', 'C5'], [26, 1, 'frogs', 'A4'], [27, 1, 'turtles', 'G4'], [28, 4, 'grazers', 'F4'],
];
const CHORUS_CHORDS = [['F', 4], ['Dm', 4], ['C', 1], ['F', 3], ['Bb', 2], ['C', 2], ['Dm7', 4], ['Gm', 2], ['C', 2], ['Bb', 2],
  ['F/C', 1], ['C7', 1], ['F', 4]];
/** Her horn's notes in her own octave (the recorded alphorn moved by rate: F3 .. D4, never more than 8 semitones). */
const HORN_NOTE = { grazers: 'F3', turtles: 'G3', frogs: 'A3', lizards: 'C4', flyers: 'D4' };
/** How much each group's call is lifted in the choruses so it sings over the orchestra in its own register (check.mjs). */
const CHORUS_GAIN = { grazers: 1.8, turtles: 1.3, frogs: 1.5, lizards: 1.0, flyers: 0.8 };
/** The take each group sings a tune note with, by its length. */
function tuneTake(group, beats) {
  return { grazers: 'grazers-3', turtles: 'turtles-2', frogs: beats >= 2 ? 'frogs-1' : 'frogs-3', lizards: 'lizards-2',
    flyers: 'flyers-1' }[group];
}

export function compose() {
  const events = [];
  const cues = [];
  const harmony = [];
  const chorusMelody = [];
  const add = e => { events.push(e); return e; };
  const n = (inst, stem, beat, dur, note, vel, o = {}) => add({ inst, stem, beat, dur, note, f: note ? hz(note) : 0, vel, ...o });
  const call = (takeName, group, beat, beats, vel, o = {}) => {
    cues.push({ beat, kind: 'call', group });
    return add({ inst: 'take', stem: 'animals', take: takeName, group, beat, dur: beats, vel, ...o });
  };
  const horn = (note, beat, beats, vel, o = {}) => {
    cues.push({ beat, kind: 'horn', note });
    return add({ inst: 'take', stem: 'lead', take: 'horn-1', group: 'sloedla', note, f: hz(note), beat, dur: beats, vel, ...o });
  };
  const cue = (beat, kind, extra = {}) => cues.push({ beat, kind, ...extra });
  const chords = (bar, list) => {
    let b = B(bar);
    for (const [c, d] of list) { harmony.push([b, c, d]); b += d; }
  };
  const chordAt = beat => {
    for (let i = harmony.length - 1; i >= 0; i--) if (harmony[i][0] <= beat) return harmony[i];
    return harmony[0];
  };
  const segs = (from, to) => harmony.filter(([b, , d]) => b < to && b + d > from)
    .map(([b, c, d]) => [Math.max(b, from), c, Math.min(b + d, to) - Math.max(b, from)]);

  // ---- layers ----
  /** Sustained strings on the chords: cellos, violas, second and first violins, each its own section. */
  function padStrings(from, to, { vel = 0.45, attack = 0.3, release = 0.6, tremolo = 0, skip = [], up = 0, voicesVln = 6, bright = 0.9 } = {}) {
    for (const [b, c, d] of segs(from, to)) {
      const [vc, vla, v2, v1] = CH[c].pad;
      const parts = [['vc', vc], ['vla', vla], ['vln', v2], ['vln', v1]];
      parts.forEach(([section, note], k) => {
        if (skip.includes(k)) return;
        const nn = up && k >= 2 ? octave(note, up) : note;
        n('strings', 'pad', b, d, nn, vel * (k === 0 ? 0.9 : 1), { section, attack, release, tremolo, voices: section === 'vln' ? voicesVln : 5,
          bright, part: `pad${k}` });
      });
    }
  }
  /** Oom-pah: the tuba on the root (beat 1) and fifth (beat 3), the basses' pizzicato under it. */
  function oompah(from, to, { vel = 0.6, pizz = true, fifth = true, pickup = false } = {}) {
    for (let b = from; b < to; b += 2) {
      const [, c] = chordAt(b);
      const second = fifth && (b - from) % 4 === 2;
      const note = second ? CH[c].fifth : CH[c].bass;
      n('brass', 'bass', b, 0.9, note, vel, { kind: 'tuba' });
      if (pizz) n('pizz', 'bass', b, 1, octave(note, 1), vel * 0.8, { part: 'cb' });
    }
    if (pickup) n('pizz', 'bass', to - 0.5, 0.5, octave(CH[chordAt(to - 0.5)[1]].fifth, 1), vel * 0.7, { part: 'cb' });
  }
  /** Pizzicato chords off the beat (the "pah"), violins and violas. */
  function pahs(from, to, { vel = 0.4, beats = [1, 3] } = {}) {
    for (let b = from; b < to; b += 4) {
      for (const k of beats) {
        const [, c] = chordAt(b + k);
        for (const note of CH[c].pad.slice(1)) n('pizz', 'pad', b + k, 0.5, note, vel, { part: 'pah', players: 2 });
      }
    }
  }
  /** Harp arpeggio up the chord in steps of `step` beats. */
  function harpArp(from, to, { step = 0.5, vel = 0.4, pattern = [0, 1, 2, 3, 4, 3, 2, 1], up = 0 } = {}) {
    let k = 0;
    for (let b = from; b < to - 1e-9; b += step) {
      const [, c] = chordAt(b);
      const arp = CH[c].arp;
      n('harp', 'pad', b, step, octave(arp[pattern[k % pattern.length] % arp.length], up), vel, {});
      k++;
    }
  }
  /** A harp glissando over the F pentatonic from `lo` to `hi` (MIDI), `beats` long, starting at `beat`. */
  function gliss(beat, beats, lo, hi, vel = 0.45, stem = 'pad') {
    const notes = [];
    for (let m = lo; m <= hi; m++) if ([5, 7, 9, 0, 2].includes(m % 12)) notes.push(m);
    const up = hi >= lo;
    const list = up ? notes : notes.reverse();
    list.forEach((m, i) => n('harp', stem, beat + (beats * i) / list.length, 0.5, mname(m), vel * (0.7 + (0.3 * i) / list.length), {}));
  }
  /** The march kit: gran cassa on 1 and 3, snare on 2 and 4, a shaker or tambourine on the eighths. */
  function kit(from, to, { kick = 0.55, snare = 0.4, shaker = 0, tamb = 0, timp = 0, wood = 0, tri = false, sixteenths = 0 } = {}) {
    for (let b = from; b < to; b += 1) {
      const k = (b - from) % 4;
      if (kick && (k === 0 || k === 2)) n('granCassa', 'beat', b, 1, null, kick * (k === 0 ? 1 : 0.85));
      if (snare && (k === 1 || k === 3)) n('snare', 'beat', b, 1, null, snare);
      if (timp && (k === 0 || k === 2)) {
        const [, c] = chordAt(b);
        n('timpani', 'beat', b, 1, timpNote(k === 0 ? CH[c].bass : CH[c].fifth), timp * (k === 0 ? 1 : 0.8));
      }
      for (const h of [0, 0.5]) {
        if (shaker) n('shaker', 'beat', b + h, 0.5, null, shaker * (h ? 1 : 0.65));
        if (tamb) n('tambourine', 'beat', b + h, 0.5, null, tamb * (h ? 0.65 : 1) * (k === 1 || k === 3 ? 1.15 : 0.9));
        if (wood) n('woodblock', 'beat', b + h, 0.5, null, wood, { pitch: h ? 1250 : 880 });
      }
      if (sixteenths) for (const h of [0.25, 0.75]) n('tambourine', 'beat', b + h, 0.25, null, sixteenths);
    }
    if (tri) n('triangle', 'beat', from, 4, null, 0.5);
  }
  function roll(inst, from, beats, step, v0, v1, note = null) {
    const count = Math.round(beats / step);
    for (let i = 0; i < count; i++) n(inst, 'beat', from + i * step, step, note, v0 + ((v1 - v0) * i) / Math.max(1, count - 1), { roll: true });
  }

  // =========================================================================================== 1. the forest wakes (0-3)
  chords(0, [['F', 8], ['Bb/F', 4], ['F', 4]]);
  for (const [b, c, d] of segs(0, 16)) {
    const [vc, vla, v2, v1] = CH[c].pad;
    if (b >= 4 || c !== 'F') n('strings', 'pad', b, d, vc, 0.32, { section: 'vc', attack: 0.8, release: 0.8, part: 'pad0' });
    n('strings', 'pad', b, d, vla, 0.3, { section: 'vla', attack: b === 0 ? 2.4 : 0.8, release: 0.8, part: 'pad1' });
    n('strings', 'pad', b, d, v2, 0.28, { section: 'vln', attack: b === 0 ? 3.0 : 0.8, release: 0.8, part: 'pad2' });
    n('strings', 'pad', b, d, octave(v1, 1), 0.2, { section: 'vln', attack: b === 0 ? 3.5 : 0.9, release: 0.8, tremolo: 6, part: 'pad3' });
  }
  gliss(0, 2, 53, 81, 0.25); // the forest opens its eyes
  n('glock', 'lead', 3, 1, 'A6', 0.25, { soft: true });
  n('glock', 'lead', 3.5, 1, 'C7', 0.22, { soft: true });
  // birds in the trees: flute and piccolo calls, an oboe's answer
  [[4, 'D6', 0.25], [4.25, 'C6', 0.25], [4.5, 'D6', 0.75]].forEach(([b, m, d]) => n('wind', 'lead', b, d, m, 0.4, { kind: 'flute' }));
  call('flyers-3', 'flyers', 6, 2, 0.32);
  [[7, 'A5', 0.5], [7.5, 'C6', 1.5]].forEach(([b, m, d]) => n('wind', 'lead', b, d, m, 0.38, { kind: 'oboe' }));
  call('frogs-5', 'frogs', 9, 1, 0.3);
  // far away, a horn remembers her first two notes (sol, mi)
  n('brass', 'lead', 8, 2, 'C4', 0.35, { kind: 'horn' });
  n('brass', 'lead', 10, 2, 'A3', 0.32, { kind: 'horn' });
  n('wind', 'lead', 12, 2, 'D6', 0.36, { kind: 'piccolo', trill: 2 });
  gliss(13, 1.5, 53, 84, 0.32);
  n('glock', 'lead', 14, 1, 'F6', 0.3, {});
  n('glock', 'lead', 14.5, 1, 'A6', 0.3, {});
  n('glock', 'lead', 15, 1, 'C7', 0.3, {});
  roll('timpani', 12, 4, 0.125, 0.12, 0.42, 'F2');
  n('cymbalSwell', 'beat', 12, 4, null, 0.35, { swellSec: 4 * SPB });

  // =========================================================================================== 2. the song grows (4-9)
  chords(4, [['Bb', 4], ['C', 4]]);
  chords(6, [['F', 4], ['Dm', 4], ['Bb', 4], ['C', 4]]);
  // bar 4: the groove arrives thin (bass, pizzicato, strings, a shaker); bar 5 is the loop's last bar exactly
  padStrings(B(4), B(5), { vel: 0.4 });
  oompah(B(4), B(5), { vel: 0.5 });
  pahs(B(4), B(5), { vel: 0.32 });
  kit(B(4), B(5), { kick: 0.4, snare: 0, shaker: 0.4 });
  for (const bar of [5, 6, 7, 8, 9]) grooveBar(bar);

  /** One bar of the loop groove (bars 6-9, and bar 5 = bar 9 so the wrap is clean). Everything depends on bar % 4 only. */
  function grooveBar(bar) {
    const b0 = B(bar);
    const k = bar === 5 ? 3 : bar - 6; // position in the loop
    padStrings(b0, b0 + 4, { vel: 0.42 });
    oompah(b0, b0 + 4, { vel: 0.55, pickup: k === 3 });
    pahs(b0, b0 + 4, { vel: 0.34 });
    harpArp(b0, b0 + 4, { step: 0.5, vel: 0.22, up: 1 });
    kit(b0, b0 + 4, { kick: 0.5, snare: 0.32, shaker: 0.42, tri: k === 0 });
    // the lead's little tune (flute over clarinet), not her song
    const LEAD = [
      [[0, 'C5', 0.5], [0.5, 'A4', 0.5], [1, 'C5', 0.5], [1.5, 'F5', 1.5]],
      [[0, 'D5', 0.5], [0.5, 'F5', 0.5], [1, 'A5', 1.5], [2.5, 'G5', 0.5], [3, 'F5', 1]],
      [[0, 'D5', 0.5], [0.5, 'F5', 0.5], [1, 'Bb5', 1], [2, 'A5', 0.5], [2.5, 'G5', 0.5], [3, 'F5', 1]],
      [[0, 'E5', 1.5], [1.5, 'G5', 0.5], [2, 'C6', 1], [3, 'Bb5', 0.5], [3.5, 'G5', 0.5]],
    ][k];
    for (const [b, m, d] of LEAD) {
      n('wind', 'lead', b0 + b, d * 0.9, m, 0.5, { kind: 'flute' });
      n('wind', 'lead', b0 + b, d * 0.9, octave(m, -1), 0.36, { kind: 'clarinet' });
    }
    if (k === 1) call('frogs-3', 'frogs', b0 + 3, 1, 0.3);
    if (k === 3) n('glock', 'lead', b0 + 2, 1, 'C7', 0.25, {});
  }

  // =========================================================================================== 3. the grazers step in (10-13)
  chords(10, [['F', 4], ['Bb', 4], ['F', 4], ['C', 4]]);
  padStrings(B(10), B(14), { vel: 0.4, skip: [3], bright: 0.85 });
  // tuba oom-pah heavy, timpani on root and fifth, the gran cassa stomping
  oompah(B(10), B(14), { vel: 0.7 });
  kit(B(10), B(14), { kick: 0.7, snare: 0.28, timp: 0.55 });
  // the grazers sing do (F3): two moos a bar, then three in a row
  for (const bar of [10, 11, 12]) {
    call('grazers-3', 'grazers', B(bar), 2, 0.85);
    call(bar === 11 ? 'grazers-3' : 'grazers-2', 'grazers', B(bar, 2), 2, 0.8);
  }
  for (const k of [0, 1, 2]) call('grazers-3', 'grazers', B(13, k), 1, 0.85);
  // bassoon (with the tuba) doubles them on F3 and bounces between
  const GRAZE = [
    [0, 'F3', 1], [1, 'C3', 0.5], [1.5, 'D3', 0.5], [2, 'F3', 1], [3, 'A3', 0.5], [3.5, 'G3', 0.5],
    [4, 'F3', 1], [5, 'D3', 0.5], [5.5, 'Bb2', 0.5], [6, 'F3', 1], [7, 'D3', 0.5], [7.5, 'E3', 0.5],
    [8, 'F3', 1], [9, 'C3', 0.5], [9.5, 'D3', 0.5], [10, 'F3', 1], [11, 'A3', 0.5], [11.5, 'C4', 0.5],
    [12, 'F3', 1], [13, 'F3', 1], [14, 'F3', 1], [15, 'E3', 0.5], [15.5, 'G3', 0.5],
  ];
  for (const [b, m, d] of GRAZE) {
    n('wind', 'lead', B(10) + b, d * 0.85, m, 0.6, { kind: 'bassoon' });
    if (m === 'F3' || b >= 12) n('brass', 'lead', B(10) + b, d * 0.8, octave(m, -1), 0.35, { kind: 'tuba' });
  }
  n('cymbal', 'beat', B(10), 2, null, 0.3);
  cue(B(10), 'hit');

  // =========================================================================================== 4. the turtles (14-17)
  chords(14, [['Dm', 4], ['Bb', 4], ['Gm', 4], ['C', 4]]);
  padStrings(B(14), B(18), { vel: 0.36, skip: [0], bright: 0.85 });
  for (const [b, c, d] of segs(B(14), B(18))) {
    n('brass', 'pad', b, d, CH[c].pad[1], 0.26, { kind: 'horn', part: 'hornpad' });
    n('brass', 'pad', b, d, CH[c].pad[2], 0.24, { kind: 'horn', part: 'hornpad2' });
    n('brass', 'bass', b, d * 0.95, CH[c].bass, 0.34, { kind: 'tuba' });
    n('strings', 'bass', b, d, octave(CH[c].bass, 1), 0.3, { section: 'cb', attack: 0.15, release: 0.4 });
  }
  // half time: the gran cassa on 1, a low woodblock plod on 2 and 4, timpani on 1
  for (let bar = 14; bar < 18; bar++) {
    n('granCassa', 'beat', B(bar), 1, null, 0.5);
    n('timpani', 'beat', B(bar), 1, timpNote(CH[chordAt(B(bar))[1]].bass), 0.45);
    n('woodblock', 'beat', B(bar, 1), 1, null, 0.4, { pitch: 620 });
    n('woodblock', 'beat', B(bar, 3), 1, null, 0.4, { pitch: 620 });
    n('shaker', 'beat', B(bar, 2.5), 0.5, null, 0.25);
  }
  // the turtles sing re (G3), slow and two-syllabled
  for (const bar of [14, 15, 16]) {
    call('turtles-2', 'turtles', B(bar), 2, 0.62);
    call('turtles-2', 'turtles', B(bar, 2), 2, 0.58);
  }
  call('turtles-2', 'turtles', B(17), 2, 0.62);
  call('turtles-1', 'turtles', B(17, 2), 1, 0.55);
  call('turtles-1', 'turtles', B(17, 3), 1, 0.55);
  // the cellos sing with them, warm and legato, on G3 at every call
  const CELLO = [
    [0, 'G3', 1.5], [1.5, 'F3', 0.5], [2, 'G3', 1.5], [3.5, 'A3', 0.5],
    [4, 'G3', 1.5], [5.5, 'Bb3', 0.5], [6, 'G3', 1], [7, 'F3', 1],
    [8, 'G3', 1.5], [9.5, 'D3', 0.5], [10, 'G3', 1.5], [11.5, 'A3', 0.5],
    [12, 'G3', 2], [14, 'G3', 1], [15, 'G3', 1],
  ];
  for (const [b, m, d] of CELLO) {
    n('strings', 'lead', B(14) + b, d, m, 0.6, { section: 'vc', voices: 4, attack: 0.08, release: 0.3, vibDepth: 18, part: 'cellolead' });
  }

  roll('snare', B(17, 3), 1, 0.25, 0.22, 0.42); // into the chorus

  // =========================================================================================== 5. chorus 1 (18-25)
  chorus(18, 1);

  // =========================================================================================== 6. the frogs (26-29)
  chords(26, [['F', 4], ['Dm', 4], ['Bb', 4], ['C', 4]]);
  padStrings(B(26), B(30), { vel: 0.34, skip: [0, 3] });
  pahs(B(26), B(30), { vel: 0.4, beats: [1, 2.5, 3] });
  oompah(B(26), B(30), { vel: 0.55 });
  kit(B(26), B(30), { kick: 0.5, snare: 0.3, wood: 0.42 });
  const FROGS = [
    [26, [[0, 'frogs-3', 1], [1, 'frogs-3', 1], [2, 'frogs-1', 2]]],
    [27, [[0, 'frogs-3', 0.5], [0.5, 'frogs-3', 0.5], [1, 'frogs-3', 1], [2, 'frogs-5', 2]]],
    [28, [[0, 'frogs-3', 1], [1, 'frogs-3', 1], [2, 'frogs-1', 2]]],
    [29, [[0, 'frogs-3', 1], [1, 'frogs-5', 1], [2, 'frogs-3', 1], [3, 'frogs-1', 1]]],
  ];
  for (const [bar, list] of FROGS) {
    for (const [b, t, d] of list) {
      call(t, 'frogs', B(bar, b), d, 0.8);
      n('wind', 'lead', B(bar, b), Math.min(d, 1) * 0.45, 'A4', 0.6, { kind: 'clarinet' });
    }
  }
  // the clarinet hops between the croaks
  [[26, [[2.5, 'C5'], [3, 'F4'], [3.5, 'A4']]], [27, [[1.5, 'F4'], [2.5, 'D5'], [3, 'C5'], [3.5, 'A4']]],
    [28, [[2.5, 'C5'], [3, 'D5'], [3.5, 'F5']]], [29, [[0.5, 'C5'], [1.5, 'G4'], [2.5, 'C5'], [3.5, 'E5']]]]
    .forEach(([bar, list]) => list.forEach(([b, m]) => n('wind', 'lead', B(bar, b), 0.22, m, 0.5, { kind: 'clarinet' })));
  // the bassoon's comic bass under them
  [[0, 'F2'], [1, 'C3'], [2, 'A2'], [3, 'C3'], [4, 'D2'], [5, 'A2'], [6, 'F2'], [7, 'A2'], [8, 'Bb1'], [9, 'F2'], [10, 'D2'], [11, 'F2'],
    [12, 'C2'], [13, 'G2'], [14, 'E2'], [15, 'G2']].forEach(([b, m]) => n('wind', 'bass', B(26) + b, 0.35, octave(m, 1), 0.45, { kind: 'bassoon' }));

  // =========================================================================================== 7. the small lizards (30-33)
  chords(30, [['Bb', 4], ['C', 4], ['Am', 4], ['Dm', 4]]);
  padStrings(B(30), B(34), { vel: 0.34, skip: [3] });
  oompah(B(30), B(34), { vel: 0.5, fifth: true });
  for (let b = B(30); b < B(34); b += 1) n('pizz', 'bass', b + 0.5, 0.5, octave(CH[chordAt(b)[1]].fifth, 1), 0.4, { part: 'cb' });
  kit(B(30), B(34), { kick: 0.48, snare: 0.32, tamb: 0.34, sixteenths: 0.16 });
  const LIZ = [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]];
  for (const bar of [30, 31, 32]) for (const [b, d] of LIZ) call('lizards-2', 'lizards', B(bar, b), d, 0.7);
  for (const b of [0, 0.5, 1, 1.5, 2]) call('lizards-2', 'lizards', B(33, b), 0.5, 0.7);
  // staccato violins scurry in sixteenths around C6, landing on C6 with every call
  const RUN = ['C6', 'G5', 'A5', 'G5', 'C6', 'A5', 'G5', 'F5', 'C6', 'D6', 'C6', 'A5', 'C6', 'G5', 'A5', 'C6'];
  for (let bar = 30; bar < 34; bar++) {
    for (let i = 0; i < 16; i++) {
      if (bar === 33 && i >= 10) break;
      const b = B(bar, i / 4);
      const on = LIZ.some(([x]) => Math.abs(x - i / 4) < 1e-9);
      n('strings', 'lead', b, 0.2, on ? 'C6' : RUN[i], on ? 0.7 : 0.5, { section: 'vln', voices: 4, attack: 0.01, release: 0.1, vibDepth: 0,
        bite: 1.4, part: 'stacc' });
    }
  }
  n('wind', 'lead', B(33, 2.5), 1.5, 'C6', 0.4, { kind: 'piccolo', trill: 2 });

  // =========================================================================================== 8. the small flyers (34-37)
  chords(34, [['Bb', 4], ['C', 4], ['Dm', 4], ['C', 4]]);
  padStrings(B(34), B(38), { vel: 0.36, skip: [0], up: 1, voicesVln: 7 });
  for (const [b, c, d] of segs(B(34), B(38))) {
    n('brass', 'bass', b, 0.9, CH[c].bass, 0.45, { kind: 'tuba' });
    n('pizz', 'bass', b, 1, octave(CH[c].bass, 1), 0.45, { part: 'cb' });
    n('pizz', 'bass', b + 2, 1, octave(CH[c].fifth, 1), 0.4, { part: 'cb' });
  }
  harpArp(B(34), B(38), { step: 0.25, vel: 0.3, pattern: [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1], up: 1 });
  kit(B(34), B(38), { kick: 0.42, snare: 0.22, shaker: 0.35 });
  for (const bar of [34, 35, 36, 37]) n('triangle', 'beat', B(bar), 4, null, 0.45);
  const FLY = [[34, [[0, 'flyers-1', 2], [2, 'flyers-3', 2]]], [35, [[0, 'flyers-1', 2], [2, 'flyers-1', 2]]],
    [36, [[0, 'flyers-3', 2], [2, 'flyers-1', 2]]], [37, [[0, 'flyers-1', 1], [1, 'flyers-1', 1], [2, 'flyers-1', 1]]]];
  for (const [bar, list] of FLY) for (const [b, t, d] of list) {
    call(t, 'flyers', B(bar, b), d, t === 'flyers-3' ? 0.75 : 0.7);
    n('wind', 'lead', B(bar, b), Math.min(d, 1.5), 'D6', 0.45, { kind: 'piccolo', trill: d >= 2 ? 2 : 0 });
  }
  // the flute soars between them
  const SOAR = [[34, [[1, 'F5', 0.5], [1.5, 'A5', 0.5], [3, 'Bb5', 0.5], [3.5, 'A5', 0.5]]],
    [35, [[1, 'G5', 0.5], [1.5, 'C6', 0.5], [3, 'E5', 0.5], [3.5, 'G5', 0.5]]],
    [36, [[1, 'F5', 0.5], [1.5, 'A5', 0.5], [3, 'C6', 0.5], [3.5, 'A5', 0.5]]],
    [37, [[3, 'G5', 0.25], [3.25, 'A5', 0.25], [3.5, 'Bb5', 0.25], [3.75, 'B5', 0.25]]]];
  for (const [bar, list] of SOAR) for (const [b, m, d] of list) n('wind', 'lead', B(bar, b), d, m, 0.5, { kind: 'flute' });
  n('cymbalSwell', 'beat', B(37), 4, null, 0.4, { swellSec: 4 * SPB });
  gliss(B(37, 2), 2, 60, 89, 0.4);

  // =========================================================================================== 9. chorus 2 (38-45)
  chorus(38, 2);

  // =========================================================================================== 10. her horn: engines off (46-53)
  chords(46, [['Dm', 4], ['Am', 4], ['Gm', 4], ['F', 4], ['Bb', 4], ['F/A', 4], ['Gm7', 4], ['C', 4]]);
  for (const [b, c, d] of segs(B(46), B(54))) {
    const [vc, vla, v2, v1] = CH[c].pad;
    n('strings', 'pad', b, d, v2, 0.26, { section: 'vln', tremolo: 7, attack: 0.6, release: 0.9, voices: 6, part: 'trem2' });
    n('strings', 'pad', b, d, octave(v1, 1), 0.18, { section: 'vln', tremolo: 6, attack: 0.8, release: 0.9, voices: 6, part: 'trem1' });
    n('strings', 'pad', b, d, vla, 0.26, { section: 'vla', attack: 0.7, release: 0.9, part: 'midvla' });
    n('strings', 'bass', b, d, octave(CH[c].bass, 1), 0.3, { section: 'cb', attack: 0.6, release: 0.9 });
    n('strings', 'bass', b, d, vc, 0.25, { section: 'vc', attack: 0.6, release: 0.9 });
  }
  for (let bar = 46; bar < 54; bar++) harpArp(B(bar), B(bar + 1), { step: 2, vel: 0.2, pattern: bar % 2 ? [3, 4] : [2, 5] });
  // her song, slow, on her horn: sol mi / re mi do / la sol mi sol / la sol mi re ... and no do (the song is not back yet)
  const HORN = [
    [46, 0, 4, 'C4'], [47, 0, 4, 'A3'],
    [48, 0, 2, 'G3'], [48, 2, 2, 'A3'], [49, 0, 4, 'F3'],
    [50, 0, 2, 'D4'], [50, 2, 2, 'C4'], [51, 0, 2, 'A3'], [51, 2, 2, 'C4'],
    [52, 0, 2, 'D4'], [52, 2, 2, 'C4'], [53, 0, 2, 'A3'], [53, 2, 3, 'G3'],
  ];
  for (const [bar, b, d, m] of HORN) horn(m, B(bar, b), d, 0.42);
  // the forest answers her softly: a flute echo, a celesta twinkle, one animal
  [[47, 2, 'C6'], [47, 3, 'A5']].forEach(([bar, b, m]) => n('wind', 'lead', B(bar, b), 0.9, m, 0.28, { kind: 'flute' }));
  [[49, 2, 'F6'], [49, 2.5, 'A6'], [49, 3, 'C7']].forEach(([bar, b, m]) => n('glock', 'lead', B(bar, b), 1, m, 0.3, { soft: true }));
  [[51, 2.5, 'D6'], [51, 3, 'C6']].forEach(([bar, b, m]) => n('wind', 'lead', B(bar, b), 0.45, m, 0.26, { kind: 'flute' }));
  call('frogs-1', 'frogs', B(47, 2), 2, 0.3);
  call('grazers-3', 'grazers', B(49, 2), 2, 0.35);
  call('lizards-2', 'lizards', B(51, 3), 1, 0.25);

  // =========================================================================================== 11. everyone comes: the riser (54-57)
  chords(54, [['Csus', 4], ['C', 4], ['Bb/C', 4], ['C7', 4]]);
  cue(B(54), 'riser');
  for (const [b, c, d] of segs(B(54), B(58))) {
    const [vc, vla, v2, v1] = CH[c].pad;
    const lift = (b - B(54)) / 16;
    const sw = t => Math.min(1, 0.55 + 0.45 * (t / (d * SPB)));
    n('strings', 'pad', b, d, vla, 0.36 + 0.2 * lift, { section: 'vla', attack: 0.3, release: 0.5, swell: sw, part: 'rvla' });
    n('strings', 'pad', b, d, v2, 0.36 + 0.2 * lift, { section: 'vln', attack: 0.3, release: 0.5, swell: sw, tremolo: lift > 0.4 ? 9 : 0, part: 'rv2' });
    n('strings', 'pad', b, d, octave(v1, 1), 0.3 + 0.25 * lift, { section: 'vln', attack: 0.3, release: 0.5, swell: sw, tremolo: lift > 0.4 ? 10 : 0, part: 'rv1' });
    n('brass', 'pad', b, d, octave(vla, 0), 0.3 + 0.35 * lift, { kind: 'horn', swell: sw, part: 'rhorn' });
    n('brass', 'pad', b, d, v2, 0.28 + 0.35 * lift, { kind: 'horn', swell: sw, part: 'rhorn2' });
    if (lift >= 0.5) n('brass', 'pad', b, d, v1, 0.3 + 0.3 * lift, { kind: 'trumpet', swell: sw, part: 'rtpt' });
    // the C pedal: tuba and basses, the cellos rocking
    n('brass', 'bass', b, d * 0.98, 'C2', 0.45 + 0.3 * lift, { kind: 'tuba', swell: sw });
    n('strings', 'bass', b, d, 'C3', 0.4 + 0.3 * lift, { section: 'cb', attack: 0.1, release: 0.4, tremolo: lift > 0.4 ? 8 : 0 });
  }
  // a rising line in the violins: quarters, then eighths
  const UP = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'Bb4', 'C5'];
  UP.forEach((m, i) => n('strings', 'lead', B(54) + i, 1, m, 0.45 + 0.02 * i, { section: 'vln', voices: 5, attack: 0.04, release: 0.2, part: 'riseq' }));
  ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'Bb5', 'C6', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'Bb5', 'C6'].forEach((m, i) =>
    n('strings', 'lead', B(56) + i / 2, 0.5, m, 0.5 + 0.02 * i, { section: 'vln', voices: 5, attack: 0.02, release: 0.15, bite: 0.8, part: 'rise8' }));
  // snares gathering: quarters, eighths, sixteenths, a roll
  roll('snare', B(54), 4, 1, 0.22, 0.3);
  roll('snare', B(55), 4, 0.5, 0.3, 0.42);
  roll('snare', B(56), 4, 0.25, 0.4, 0.56);
  roll('snare', B(57), 4, 0.125, 0.45, 0.8);
  roll('timpani', B(56), 8, 0.125, 0.2, 0.62, 'C3');
  for (let b = B(56); b < B(58); b += 1) n('granCassa', 'beat', b, 1, null, 0.35 + 0.35 * ((b - B(56)) / 8));
  n('cymbalSwell', 'beat', B(56), 8, null, 0.5, { swellSec: 8 * SPB });
  // everyone comes, low to high, each on its own beat
  call('grazers-3', 'grazers', B(57, 0), 1, 0.65);
  call('turtles-2', 'turtles', B(57, 1), 1, 0.65);
  call('frogs-3', 'frogs', B(57, 2), 1, 0.65);
  call('lizards-2', 'lizards', B(57, 3), 0.5, 0.6);
  call('flyers-1', 'flyers', B(57, 3.5), 0.5, 0.6);
  gliss(B(57, 2), 2, 53, 89, 0.5);

  // =========================================================================================== 12. the final chorus: the drop (58-73)
  cue(B(58), 'drop');
  chorus(58, 3);
  chorus(66, 4);

  // =========================================================================================== 13. home: a written cadence (74-76)
  chords(74, [['Bb', 2], ['F/A', 2], ['Gm7', 2], ['C7', 2], ['F', 8]]);
  for (const [b, c, d] of segs(B(74), B(76))) {
    const [vc, vla, v2, v1] = CH[c].pad;
    [['vc', vc], ['vla', vla], ['vln', v2], ['vln', v1]].forEach(([section, m], k) =>
      n('strings', 'pad', b, d, m, 0.5, { section, attack: 0.12, release: 0.5, part: `home${k}` }));
    n('brass', 'pad', b, d, vla, 0.42, { kind: 'horn', part: 'homehorn' });
    n('brass', 'bass', b, d * 0.95, CH[c].bass, 0.6, { kind: 'tuba' });
    n('strings', 'bass', b, d, octave(CH[c].bass, 1), 0.5, { section: 'cb', attack: 0.08, release: 0.4 });
  }
  // her horn walks home: la sol mi re ... and the strings and flute fall with her
  [[74, 0, 'D4'], [74, 2, 'C4'], [75, 0, 'A3'], [75, 2, 'G3']].forEach(([bar, b, m]) => {
    horn(m, B(bar, b), 2, 0.62);
    n('strings', 'lead', B(bar, b), 2, octave(m, 1), 0.6, { section: 'vln', voices: 6, attack: 0.06, release: 0.3, part: 'homev' });
    n('wind', 'lead', B(bar, b), 1.9, octave(m, 2), 0.42, { kind: 'flute' });
  });
  const GROUP_OF = { D4: 'flyers', C4: 'lizards', A3: 'frogs', G3: 'turtles' };
  [[74, 0, 'D4'], [74, 2, 'C4'], [75, 0, 'A3'], [75, 2, 'G3']].forEach(([bar, b, m]) =>
    call(tuneTake(GROUP_OF[m], 2), GROUP_OF[m], B(bar, b), 2, 0.7));
  roll('timpani', B(75), 4, 0.125, 0.25, 0.6, 'C3');
  // the last hit on F: everyone, the five animals together on their five tones and her horn on do
  const END = B(76);
  cue(END, 'end');
  cue(END, 'hit');
  for (const [section, m] of [['cb', 'F2'], ['vc', 'F3'], ['vla', 'C4'], ['vln', 'F4'], ['vln', 'A4'], ['vln', 'C5'], ['vln', 'F5']]) {
    n('strings', section === 'cb' ? 'bass' : 'pad', END, 2.5, m, 0.62, { section, attack: 0.02, release: 1.2, part: `end${m}` });
  }
  for (const [kind, m] of [['tuba', 'F1'], ['trombone', 'F3'], ['horn', 'C4'], ['horn', 'A4'], ['trumpet', 'C5'], ['trumpet', 'F5']]) {
    n('brass', kind === 'tuba' ? 'bass' : 'lead', END, 2, m, 0.7, { kind, part: `endb${m}` });
  }
  horn('F3', END, 5, 0.6);
  for (const [g, t] of [['grazers', 'grazers-3'], ['turtles', 'turtles-2'], ['frogs', 'frogs-1'], ['lizards', 'lizards-2'], ['flyers', 'flyers-1']]) {
    call(t, g, END, 3, g === 'grazers' ? 0.8 : 0.6);
  }
  n('timpani', 'beat', END, 4, 'F2', 0.85);
  n('granCassa', 'beat', END, 4, null, 0.75);
  n('cymbal', 'beat', END, 4, null, 0.5, { t60: 3 });
  n('glock', 'lead', END, 2, 'F6', 0.5, {});
  n('harp', 'pad', END, 2, 'C3', 0.5, {});
  n('harp', 'pad', END, 2, 'F3', 0.5, {});

  // =========================================================================================== the chorus
  /**
   * A chorus at `bar`: the animals sing her song note by note, each doubled by an instrument; the orchestra answers after
   * each phrase. Level 1: strings, flute and glockenspiel on the tune; 2: plus trumpets and a descant; 3 (the drop): the
   * tune an octave up as well and the full kit, her horn calling in the answers; 4: plus her horn on the tune and piccolo.
   */
  function chorus(bar, level) {
    const c0 = B(bar);
    chords(bar, CHORUS_CHORDS);
    const big = level >= 3;
    // the tune
    for (const [b, d, group, m] of TUNE) {
      const at = c0 + b;
      chorusMelody.push({ group, beat: at, note: m, hz: Number(hz(m).toFixed(2)) });
      call(tuneTake(group, d), group, at, d, (big ? 1.2 : 1.1) * CHORUS_GAIN[group]);
      n('strings', 'lead', at, d * 0.96, m, big ? 0.82 : 0.76, { section: 'vln', voices: 8, attack: 0.04, release: 0.3, part: 'tune' });
      n('wind', 'lead', at, d * 0.92, octave(m, 1), big ? 0.46 : 0.45, { kind: 'flute' });
      n('glock', 'lead', at, 1, octave(m, 1), level === 1 ? 0.32 : 0.28, {});
      if (level >= 2) n('brass', 'lead', at, d * 0.92, m, big ? 0.6 : 0.5, { kind: 'trumpet' });
      if (big) n('strings', 'lead', at, d * 0.96, octave(m, 1), 0.55, { section: 'vln', voices: 7, attack: 0.04, release: 0.3, part: 'tune8va' });
      if (level === 4) {
        n('wind', 'lead', at, d * 0.9, octave(m, 2), 0.32, { kind: 'piccolo' });
        horn(HORN_NOTE[group], at, d, 0.48);
      }
    }
    // the harmony under it
    padStrings(c0, c0 + 32, { vel: big ? 0.56 : level === 2 ? 0.5 : 0.45, attack: 0.18, release: 0.5 });
    {
      for (const [b, c, d] of segs(c0, c0 + 32)) {
        n('brass', 'pad', b, d, CH[c].pad[1], big ? 0.46 : level === 2 ? 0.36 : 0.26, { kind: 'horn', part: 'chhorn' });
        n('brass', 'pad', b, d, CH[c].pad[2], big ? 0.44 : level === 2 ? 0.34 : 0.24, { kind: 'horn', part: 'chhorn2' });
      }
    }
    oompah(c0, c0 + 32, { vel: big ? 0.72 : 0.62 });
    harpArp(c0, c0 + 32, { step: 0.5, vel: big ? 0.25 : 0.22, up: 0 });
    if (big) for (const [b, c, d] of segs(c0, c0 + 32)) n('brass', 'bass', b, Math.min(d, 2) * 0.9, octave(CH[c].bass, 1), 0.45, { kind: 'trombone' });
    // the descant: long notes high over the tune (the second chorus and the drop)
    if (level >= 2) {
      const DESC = [[0, 'A5', 4], [4, 'F5', 4], [8, 'G5', 1], [9, 'A5', 3], [12, 'F5', 2], [14, 'E5', 2], [16, 'F5', 4], [20, 'D5', 2],
        [22, 'E5', 2], [24, 'F5', 2], [26, 'E5', 2], [28, 'F5', 4]];
      for (const [b, m, d] of DESC) {
        n('strings', 'pad', c0 + b, d, level >= 3 ? octave(m, 1) : m, big ? 0.34 : 0.3, { section: 'vln', voices: 6, attack: 0.25, release: 0.5, part: 'desc' });
      }
    }
    // the drums
    kit(c0, c0 + 32, { kick: big ? 0.78 : 0.66, snare: big ? 0.5 : 0.42, tamb: big ? 0.38 : 0.32, timp: big ? 0.56 : 0.45 });
    for (const k of [0, 16]) n('triangle', 'beat', c0 + k, 4, null, 0.4);
    n('cymbal', 'beat', c0, 4, null, big ? 0.5 : level === 2 ? 0.42 : 0.36);
    if (level === 2 || level === 4) n('cymbal', 'beat', c0 + 16, 4, null, 0.3);
    cue(c0, 'hit');
    // the answers after each phrase (bars 2, 4, 6 of the chorus)
    // bar 2 (Dm): a harp sweep and a brass "ta-ta taa"
    gliss(c0 + 4, 1, 62, 86, 0.36);
    for (const [b, d] of [[1, 0.4], [1.5, 0.4], [2, 1.8]]) {
      for (const m of ['D4', 'F4', 'A4']) n('brass', 'lead', c0 + 4 + b, d, m, level === 1 ? 0.34 : 0.45, { kind: level === 1 ? 'horn' : 'trumpet', part: 'ans1' });
    }
    // bar 4 (Bb, C): pizzicato and woodwinds step down, timpani and brass hit "da da-da" on C
    [[0, 'F5'], [0.5, 'D5'], [1, 'Bb4'], [1.5, 'D5']].forEach(([b, m]) => {
      n('wind', 'lead', c0 + 12 + b, 0.4, m, 0.42, { kind: 'clarinet' });
      n('wind', 'lead', c0 + 12 + b, 0.4, octave(m, 1), 0.3, { kind: 'flute' });
    });
    for (const b of [2, 3, 3.5]) {
      for (const m of ['C4', 'E4', 'G4']) n('brass', 'lead', c0 + 12 + b, 0.4, m, level === 1 ? 0.36 : 0.48, { kind: level === 1 ? 'horn' : 'trumpet', part: 'ans2' });
      n('timpani', 'beat', c0 + 12 + b, 0.5, 'C3', 0.5);
    }
    // bar 6 (Gm, C): the violins run up, the horns swell on C
    ['G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F5', 'G5'].forEach((m, i) =>
      n('strings', 'lead', c0 + 20 + i / 4, 0.25, m, 0.42 + 0.03 * i, { section: 'vln', voices: 5, attack: 0.015, release: 0.12, vibDepth: 0, bite: 0.8, part: 'ans3' }));
    for (const m of ['C4', 'E4', 'G4']) n('brass', 'lead', c0 + 22, 2, m, level === 1 ? 0.34 : 0.44, { kind: 'horn', swell: t => Math.min(1, 0.4 + t), part: 'ans3h' });
    if (level === 1) n('snare', 'beat', c0 + 23.5, 0.5, null, 0.35);
    else roll('snare', c0 + 23, 1, 0.25, 0.3, 0.5);
    // in the drop her horn calls in the answers, and Flugeðla's wings beat the time on the gran cassa
    if (big) {
      horn('A3', c0 + 5, 1.5, 0.5); horn('D4', c0 + 6, 2, 0.55);
      horn('D4', c0 + 13, 1, 0.5); horn('C4', c0 + 14, 2, 0.55);
      horn('D4', c0 + 21, 1, 0.5); horn('C4', c0 + 22, 2, 0.55);
      for (const b of [5, 7, 13, 15, 21, 23]) n('granCassa', 'beat', c0 + b, 1, null, 0.45);
    }
    // the last bar: the tune's do held; the drums and a fill lead on (no fill before the horn unit: engines off)
    if (level === 2) {
      n('timpani', 'beat', c0 + 28, 2, 'F2', 0.55);
    }
  }

  events.sort((a, b) => a.beat - b.beat);
  cues.sort((a, b) => a.beat - b.beat);
  chorusMelody.sort((a, b) => a.beat - b.beat);
  return { events, cues, harmony, chorusMelody };
}

/** The units of the song (sections for song.json), in beats. */
export const SECTIONS = [
  { name: 'The forest wakes', nameIs: 'Skógurinn vaknar', startBeat: 0, beats: 16, feature: null,
    what: 'Strings swell from silence, a harp glissando opens the forest, flute and oboe birds, a far horn remembers sol-mi, a frog and a curlew wake; a soft timpani roll and cymbal swell into the groove. No drums.' },
  { name: 'The song grows', nameIs: 'Lagið vex', startBeat: 16, beats: 24, feature: null,
    what: 'The groove arrives thin (bass, pizzicato, shaker) and fills out a bar later: oom-pah tuba, pizzicato chords, harp, march kit, flute and clarinet with a little tune of their own. Bars 6-9 are the loop.' },
  { name: 'The grazers', nameIs: 'Grasbítarnir', startBeat: 40, beats: 16, feature: 'grazers',
    what: 'The grazers moo on do (F3) two by two, then three in a row; bassoon and tuba double them and bounce between; the gran cassa and timpani stomp, low strings only.' },
  { name: 'The turtles', nameIs: 'Skjaldbökurnar', startBeat: 56, beats: 16, feature: 'turtles',
    what: 'Half time and warm: the turtles sing re (G3) twice a bar, the cellos sing with them, horns hold the chords, a low woodblock plods.' },
  { name: 'Chorus', nameIs: 'Viðlag', startBeat: 72, beats: 32, feature: 'all',
    what: 'Her song: each of the 14 notes sung by its animal, doubled by violins, flute and glockenspiel; brass, harp and woodwind answers between the phrases; full march kit.' },
  { name: 'The frogs', nameIs: 'Froskarnir', startBeat: 104, beats: 16, feature: 'frogs',
    what: 'Bouncy and comic: the frogs croak mi (A5) in hops, the clarinet doubles them and hops between, woodblocks tick in eighths, a bassoon bass.' },
  { name: 'The small lizards', nameIs: 'Litlu eðlurnar', startBeat: 120, beats: 16, feature: 'lizards',
    what: 'Quick: the lizards chirp sol (C7) in a scurrying rhythm, staccato violins run in sixteenths landing on C6 with every chirp, tambourine sixteenths.' },
  { name: 'The small flyers', nameIs: 'Litlu flugdýrin', startBeat: 136, beats: 16, feature: 'flyers',
    what: 'Airy and high: the flyers sing la (D7, a curlew rising to D6), piccolo doubles with trills, the flute soars, harp sixteenths, triangle; a cymbal swell into the chorus.' },
  { name: 'Chorus 2', nameIs: 'Viðlag 2', startBeat: 152, beats: 32, feature: 'all',
    what: 'Her song again, bigger: trumpets join the tune, horns hold the chords, a violin descant floats over it.' },
  { name: "Slóeðla's horn", nameIs: 'Horn Slóeðlu', startBeat: 184, beats: 32, feature: 'sloedla',
    what: 'Engines off: no drums, no beat in the bass, no brass. Tremolo strings, a slow harp, and her recorded horn plays her song slowly, the forest answering softly (flute, celesta, one animal); it stops on re, the song not yet back.' },
  { name: 'Everyone comes', nameIs: 'Allir koma', startBeat: 216, beats: 16, feature: 'all',
    what: 'The riser over a C pedal: snares gathering bar by bar (quarters, eighths, sixteenths, a roll), a timpani roll, a cymbal swell, the strings rising, horns and trumpets swelling; the five animals call low to high on the last bar.' },
  { name: 'Final chorus', nameIs: 'Lokaviðlag', startBeat: 232, beats: 64, feature: 'all',
    what: 'The drop: her song with the tune also an octave up, the full kit, trombones, her horn calling in the answers and Flugeðla beating time on the gran cassa; the second time through her horn sings the tune with the animals and a piccolo flies over.' },
  { name: 'Home', nameIs: 'Heim', startBeat: 296, beats: 8, feature: 'sloedla',
    what: 'A written cadence: Bb, F/A, Gm7, C7, the bass walking down, her horn walking home la-sol-mi-re with the animals of those notes, a timpani roll; the last hit on F at beat 304 with all five animals and her horn, left to ring.' },
];
export const LOOP = { startBeat: 24, beats: 16 };
export const END_BEAT = 304;

// ---- small helpers ----
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
function mname(m) { return `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`; }
function midiOf(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 12 * (Number(m[3]) + 1) + base;
}
export function octave(name, k) { return k ? mname(midiOf(name) + 12 * k) : name; }
/** The timpani's note for a bass root: kept in F2 .. F3. */
function timpNote(name) {
  let m = midiOf(name);
  while (m < 41) m += 12;
  while (m > 53) m -= 12;
  return mname(m);
}
void PENTA;
