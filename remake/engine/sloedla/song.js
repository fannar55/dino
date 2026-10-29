// The songs of Slóeðla's song game are written as data (songs/*.js) and played by the game itself (conductor.js), so that what the
// child does changes the music: each dinosaur has a part of her own that is heard only while the child keeps hitting its notes,
// and the song is made of sections that come in a bigger or a calmer version depending on how the last one went.
//
// A song: { id, name, bpm, root, scale, form, sections }.
//   root     the key's do, a note name in octave 3 ('Bb' is B-flat3, 233 Hz); scale 'major' (default), 'minor', 'dorian' or 'mixolydian'
//   form     the sections in order, by name (a section may come back)
//   sections { name: { bars, chords, parts, fixed, lift } }
//     bars    how many 4/4 bars
//     chords  roman numerals, one a bar ('I V vi IV', repeated to fill the bars); 'I/V' splits a bar in two
//     fixed   never bigger or calmer (an intro, an ending)
//     lift    semitones the song goes up from here when this section plays big (the last chorus's key change); it stays up
//     parts   a list; each is one of
//       drums   { inst: 'kick'|'snare'|'clap'|'hat'|'ohat'|'shaker'|'crash', steps: 'x...o...' }  16 steps a bar (x full, o soft), repeated
//       bass    { inst: 'bass', line: 'R . R 5 . 8 R .' }  8ths a bar against the bar's chord: R 3 5 7 8 (octave), _ hold, . rest
//       arp     { inst: 'pluck'|'bell', line: '1 2 3 2' , unit: 8|16 }  chord tones by number (1 root, 2 third, 3 fifth, 4 octave...)
//       chord   { inst: 'pad'|'choir' }  the bar's chord, held
//       part    { role: 'a'|'b'|'c', notes: '0! _ 2 4 | 5 _ . .' }  a dinosaur's part: scale steps (0 do, 1 re ... 7 the next do,
//               negative below), _ hold, . rest, 8ths unless unit: 16; '!' marks the notes the child taps at her level
//     and any part may have: when ('big', 'calm', 'normal', '!calm', '!big'), tier (1-3: a layer that comes in with a run of hits),
//     vel (its loudness, 1 by default), octave (shift), unit (8 or 16 slots a bar).
//
// compileSection turns one section, in one version, at its place in the song, into timed events: the band's notes and each
// dinosaur's part. chartOf picks from the parts the notes that fall for the child to tap.

const NAMES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};
const NUMERALS = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
// The register each voice plays in, in octaves from the root's (octave 3)
const REGISTER = { a: 0, b: 1, c: -1, bass: -1, pad: 0, choir: 0, pluck: 1, bell: 2 };
const DRUMS = new Set(['kick', 'snare', 'clap', 'hat', 'ohat', 'shaker', 'crash']);
// Who in the band each instrument belongs to (a part's `gate`, or the song's `gates`, can say otherwise; null: nobody's). The
// dinosaurs own most of the music, as the player's part does in Guitar Hero: the drum kit is Þórseðla's, the bass and the riff
// Kambeðla's, the bells and the choir Slóeðla's with her tune. What is nobody's is the skeleton (the pad, and the pulse that
// compileSection adds on every beat so the child keeps time between notes): with nothing hit, that is all there is, and the song
// waits for the child. A star layer (tier) is nobody's: it comes and goes with the run.
export const BAND_GATES = { kick: 'c', snare: 'c', clap: 'c', hat: 'c', ohat: 'c', shaker: 'c', bass: 'b', pluck: 'b', bell: 'a', choir: 'a' };
const PULSE = 0.32; // the skeleton's soft kick on every beat (a song may say `pulse: 0` for none, or another level)

/** The frequency of note name `root` in octave 3 (A4 = 440 Hz). */
export function rootHz(root = 'C') {
  const semis = NAMES[root];
  if (semis === undefined) throw new TypeError(`song.js: no note called ${root}`);
  return 440 * 2 ** ((semis - 9 - 12) / 12); // C4 is 9 semitones under A4, and octave 3 one more down
}

/** A function from scale step (0 do, negative below) to Hz, for `song`, `transpose` semitones up. */
export function pitchOf(song, transpose = 0) {
  const base = rootHz(song.root);
  const steps = SCALES[song.scale ?? 'major'];
  return (step, octave = 0) => {
    const n = Math.floor(step / 7);
    const i = ((step % 7) + 7) % 7;
    return base * 2 ** ((steps[i] + 12 * (n + octave) + transpose) / 12);
  };
}

/** The length of a beat, of a bar, and where each section of the form starts, in seconds from the song's first beat. */
export function timeline(song) {
  const beat = 60 / song.bpm;
  const bar = beat * 4;
  const starts = [];
  let at = 0;
  for (const name of song.form) {
    const section = song.sections[name];
    if (!section) throw new TypeError(`song.js: ${song.id} has no section called ${name}`);
    starts.push({ name, start: at, bars: section.bars, end: at + section.bars * bar });
    at += section.bars * bar;
  }
  return { beat, bar, sections: starts, length: at };
}

/** A chord by roman numeral: its scale steps (a triad, or with a seventh: 'V7'). */
function chordSteps(symbol) {
  const match = /^([ivIV]+)(7|5)?$/.exec(symbol.trim());
  if (!match) throw new TypeError(`song.js: cannot read the chord ${symbol}`);
  const root = NUMERALS[match[1].toLowerCase()];
  if (match[2] === '5') return [root, root + 4, root + 7]; // root, fifth and octave: no third, so it sits under any chord
  return match[2] ? [root, root + 2, root + 4, root + 6] : [root, root + 2, root + 4];
}

/** The chords of a section, one entry per half bar: [{ steps }]. */
function chordsOf(section) {
  const bars = (section.chords ?? 'I').trim().split(/\s+/);
  const halves = [];
  for (let b = 0; b < section.bars; b++) {
    const [first, second = first] = bars[b % bars.length].split('/');
    halves.push(chordSteps(first), chordSteps(second));
  }
  return halves;
}

/** The tokens of a line, in slots. */
const tokens = line => line.replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);

function matches(when, variant) {
  if (!when) return true;
  return when.startsWith('!') ? variant !== when.slice(1) : variant === when;
}

/**
 * The events of section `index` of the form, played as `variant` ('normal', 'big' or 'calm'), `transpose` semitones up:
 * { band: [{ t, inst, freq, notes, dur, vel, tier }], parts: { a: [{ t, dur, freq, step, beat, mark }], b, c } }, `t` in song
 * seconds and `beat` from the start of the section.
 */
export function compileSection(song, index, variant = 'normal', transpose = 0) {
  const { beat, sections } = timeline(song);
  const { name, start } = sections[index];
  const section = song.sections[name];
  const pitch = pitchOf(song, transpose);
  const halves = chordsOf(section);
  const chordAt = beats => halves[Math.min(halves.length - 1, Math.floor(beats / 2))];
  const band = [];
  const parts = { a: [], b: [], c: [] };
  const total = section.bars * 4; // beats

  for (const part of section.parts ?? []) {
    if (!matches(part.when, variant)) continue;
    const vel = part.vel ?? 1;
    const tier = part.tier ?? 0;
    const octave = part.octave ?? 0;
    const gate = tier ? null : part.gate !== undefined ? part.gate : ((song.gates ?? BAND_GATES)[part.inst] ?? null);
    if (DRUMS.has(part.inst)) {
      const steps = part.steps.replace(/\s|\|/g, '');
      const lastBar = part.last?.replace(/\s|\|/g, '');
      for (let s = 0; s < total * 4; s++) {
        const inLast = lastBar && s >= (section.bars - 1) * 16;
        const c = inLast ? lastBar[s % 16] : steps[s % steps.length];
        if (c === 'x' || c === 'o') band.push({ t: start + (s / 4) * beat, inst: part.inst, vel: vel * (c === 'o' ? 0.55 : 1), tier, gate });
      }
      continue;
    }
    if (part.inst === 'pad' || part.inst === 'choir') {
      const voice = steps => steps.map(step => pitch(step, REGISTER[part.inst] + octave));
      for (let b = 0; b < section.bars; b++) {
        const [first, second] = [halves[2 * b], halves[2 * b + 1]];
        if (first.join() === second.join()) band.push({ t: start + b * 4 * beat, inst: part.inst, notes: voice(first), dur: 4 * beat, vel, tier, gate });
        else {
          band.push({ t: start + b * 4 * beat, inst: part.inst, notes: voice(first), dur: 2 * beat, vel, tier, gate });
          band.push({ t: start + (b * 4 + 2) * beat, inst: part.inst, notes: voice(second), dur: 2 * beat, vel, tier, gate });
        }
      }
      continue;
    }
    const unit = part.unit ?? 8;
    const slot = 4 / unit; // beats a slot
    const line = tokens(part.line ?? part.notes ?? '');
    if (!line.length) continue;
    const slots = Math.round(total / slot);
    const isPart = part.role !== undefined;
    let open = null; // the note being held
    const close = s => {
      if (!open) return;
      open.dur = (s * slot - open.beat) * beat;
      open = null;
    };
    for (let s = 0; s < slots; s++) {
      const token = line[s % line.length];
      if (token === '_') continue;
      close(s);
      if (token === '.') continue;
      const at = s * slot;
      if (isPart) {
        const mark = token.endsWith('!');
        const step = Number(mark ? token.slice(0, -1) : token);
        if (!Number.isFinite(step)) throw new TypeError(`song.js: ${song.id} ${name}: cannot read ${token}`);
        const note = { t: start + at * beat, beat: at, step, freq: pitch(step, REGISTER[part.role] + octave), mark, vel, dur: 0 };
        parts[part.role].push(note);
        open = note;
      } else {
        const chord = chordAt(at);
        const freq = part.inst === 'bass' ? bassFreq(token, chord, pitch, octave) : arpFreq(token, chord, pitch, REGISTER[part.inst] + octave);
        const note = { t: start + at * beat, inst: part.inst, freq, vel, tier, gate, beat: at, dur: 0 };
        band.push(note);
        open = note;
      }
    }
    close(slots);
  }
  // the skeleton's pulse: a soft kick on every beat, nobody's, so the child hears the time even when no dinosaur plays
  const pulse = section.pulse ?? song.pulse ?? PULSE;
  if (pulse > 0) for (let b = 0; b < total; b++) band.push({ t: start + b * beat, inst: 'kick', vel: pulse, tier: 0, gate: null });
  band.sort((x, y) => x.t - y.t);
  for (const role of Object.keys(parts)) parts[role].sort((x, y) => x.t - y.t);
  return { band, parts, start, end: start + total * beat, name, variant };
}

function bassFreq(token, chord, pitch, octave) {
  const root = chord[0] > 4 ? chord[0] - 7 : chord[0]; // sol, la and ti are played under do, so the bass stays low
  const step = { R: root, 3: root + 2, 5: root + 4, 7: root + 6, 8: root + 7 }[token];
  if (step === undefined) throw new TypeError(`song.js: bass token ${token}`);
  return pitch(step, REGISTER.bass + octave);
}

function arpFreq(token, chord, pitch, register) {
  const n = Number(token) - 1;
  if (!(n >= 0)) throw new TypeError(`song.js: arp token ${token}`);
  const step = chord[n % chord.length] + 7 * Math.floor(n / chord.length);
  return pitch(step, register);
}

/** How strong a place in the bar is, for picking notes: the bar's first beat most, then the third, the beats, the 8ths. */
function weightOf(beat, dur, beatLength) {
  const p = beat % 4;
  const place = p === 0 ? 4 : p === 2 ? 3 : Number.isInteger(p) ? 2 : Number.isInteger(p * 2) ? 1 : 0;
  return place + (dur >= beatLength * 1.5 ? 0.5 : 0);
}

/**
 * The notes that fall for the child in a compiled section: at the child's level ('barn') the marked notes ('!'), at the grown-ups'
 * ('fullordinn') any of the parts' notes; then thinned so no two are closer than `gap` beats (a calm section doubles it), the
 * strongest places kept first. `roles` are the parts that have lanes. Returns [{ t, role, index, freq, dur, section }], by time.
 */
export function chartOf(compiled, { level = 'barn', roles = ['a', 'b', 'c'], beat, section = 0 }) {
  const calm = compiled.variant === 'calm';
  const gap = (level === 'fullordinn' ? 0.5 : 2) * (calm ? 2 : 1);
  const candidates = [];
  for (const role of roles) {
    compiled.parts[role].forEach((note, index) => {
      if (level !== 'fullordinn' && !note.mark) return;
      candidates.push({ t: note.t, beat: note.beat, role, index, freq: note.freq, dur: note.dur, section, weight: weightOf(note.beat, note.dur, beat) + (role === 'a' ? 0.25 : 0) });
    });
  }
  candidates.sort((x, y) => y.weight - x.weight || x.t - y.t);
  const kept = [];
  for (const note of candidates) {
    if (kept.some(other => Math.abs(other.beat - note.beat) < gap - 1e-6)) continue;
    kept.push(note);
  }
  return kept.sort((x, y) => x.t - y.t);
}
