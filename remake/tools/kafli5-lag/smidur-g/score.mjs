// "Tjarnarsveiflan" (the pond swing): the chart. Big band jump swing in G major at 150 bpm, swung eighths, 96 bars and a button.
//
// Form (bars): intro vamp 0-7 (her horn calls "sol mi" alone over snaps, the band joins, the vamp's second pass is the loop and
// the roll call, low to high) / head 8-23 (A1: the animals sing her tune and the horns answer; A2: she plays it on her horn over
// sax pads) / solo chorus 24-55 AABA (grazers + plunger trombone, turtles trading twos on their shells, frogs + wah-wah trumpet on
// the bridge, lizards + clarinet) / chorus 2 56-87 (flyers + vibes, her stop-time chorus alone over soft band hits, the bridge as
// the rise with the band coming back under her, the shout chorus with everyone) / tag 88-95 (la sol mi re do three times, the last
// chord is all five animal tones at once) / the Basie plinks and the button on beat 384.
//
// Times are notated beats (bar * 4 + beat - 1); the renderer swings the eighths. Every animal call and her horn note is a cue.
import { rng } from './lib/dsp.mjs';

export const BPM = 150;
export const SWING = 0.64; // where the swung "and" falls in the beat
export const KEY = { name: 'G major', root: 7 };
export const BEATS = 384; // the button
export const LENGTH_BEATS = 389; // and its ring

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "F#4" → 66 */
export function nm(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`note ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const pcOf = name => NOTE[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0);
export const swing = b => {
  const f = Math.floor(b + 1e-9);
  const fr = b - f;
  return f + (fr < 0.5 ? (fr / 0.5) * SWING : SWING + ((fr - 0.5) / 0.5) * (1 - SWING));
};
const at = (bar, pos) => bar * 4 + (pos - 1);

// The animals: each group sings its tone of G major pentatonic (degrees 1 2 3 5 6).
export const GROUP_TONE = { grazers: 'G', turtles: 'A', frogs: 'B', lizards: 'D', flyers: 'E' };
export const GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];
const TONE_GROUP = Object.fromEntries(Object.entries(GROUP_TONE).map(([g, t]) => [t, g]));
// Her tune (hers, kept): sol mi / re mi do / la sol mi sol / la sol mi re do.
export const TUNE = [
  ['lizards', 'frogs'],
  ['turtles', 'frogs', 'grazers'],
  ['flyers', 'lizards', 'frogs', 'lizards'],
  ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'],
];
// The tune's pitches in the child's octave (for the marimba under the calls and the band's lines).
const TUNE_OCT = { grazers: 'G4', turtles: 'A4', frogs: 'B4', lizards: 'D5', flyers: 'E5' };

// ---------------------------------------------------------------- harmony

const CH = {
  G69: { root: 'G', third: 4, pri: ['B', 'E', 'D', 'A', 'G'], guitar: ['G2', 'E3', 'B3'], piano: ['B4', 'E5', 'A5'] },
  Em11: { root: 'E', third: 3, pri: ['G', 'D', 'B', 'A', 'E'], guitar: ['E2', 'D3', 'G3'], piano: ['G4', 'D5', 'A5'] },
  Am11: { root: 'A', third: 3, pri: ['C', 'G', 'A', 'E', 'B', 'D'], guitar: ['A2', 'G3', 'C4'], piano: ['G4', 'C5', 'D5'] },
  Cmaj9: { root: 'C', third: 4, pri: ['E', 'B', 'G', 'D', 'A', 'C'], guitar: ['C3', 'E3', 'B3'], piano: ['B4', 'D5', 'E5'] },
  D13sus: { root: 'D', third: 5, pri: ['C', 'E', 'A', 'G', 'B', 'D'], guitar: ['D3', 'G3', 'C4'], piano: ['C5', 'E5', 'A5'] },
  D13: { root: 'D', third: 4, pri: ['F#', 'C', 'E', 'B', 'A', 'D'], guitar: ['D3', 'F#3', 'C4'], piano: ['C5', 'F#5', 'B5'] },
};
export const CHORDS = CH;

// Bars' chords: [name, beats]...
const A = [[['G69', 4]], [['G69', 2], ['Em11', 2]], [['Am11', 2], ['D13sus', 2]], [['G69', 4]], [['Cmaj9', 4]],
  [['Cmaj9', 2], ['Em11', 2]], [['Am11', 2], ['D13sus', 2]], [['G69', 2], ['Am11', 1], ['D13', 1]]];
const A_TO_B = [...A.slice(0, 7), [['G69', 4]]]; // an A that goes on to a bridge ends at home
const B = [[['Cmaj9', 4]], [['Cmaj9', 4]], [['Em11', 4]], [['Em11', 4]], [['Am11', 4]], [['Am11', 4]], [['D13sus', 4]], [['D13', 4]]];
const VAMP = [[['G69', 4]], [['Em11', 4]], [['Am11', 4]], [['D13sus', 4]]];
const TAG = [[['Am11', 2], ['D13sus', 2]], [['Em11', 4]], [['Am11', 2], ['D13sus', 2]], [['Em11', 4]], [['Am11', 4]],
  [['D13sus', 2], ['D13', 2]], [['G69', 4]], [['G69', 4]], [['G69', 4]]];
const CHART_BARS = [...VAMP, ...VAMP, ...A, ...A, ...A, ...A_TO_B, ...B, ...A, ...A, ...A_TO_B, ...B, ...A_TO_B, ...TAG];
/** The chord at every beat (index = beat). */
export const CHART = CHART_BARS.flatMap(bar => bar.flatMap(([name, n]) => Array(n).fill(name)));
export const chordAt = beat => CHART[Math.max(0, Math.min(CHART.length - 1, Math.floor(beat + 1e-6)))];

/** Voices under a lead note from the chord's tones by priority: no semitone rubs, at most one whole-step pair. Descending. */
export function harmonize(lead, chord, n = 3) {
  const c = CH[chord];
  const out = [lead];
  const leadPc = ((lead % 12) + 12) % 12;
  const place = pc => {
    let m = lead - ((leadPc - pc + 12) % 12 || 12);
    return m;
  };
  const ok = (m, strict) => {
    if (out.some(o => Math.abs(o - m) < 2 || o === m)) return false;
    if (!strict) return true;
    const pairs = [...out, m].flatMap((a, i, arr) => arr.slice(i + 1).map(b => Math.abs(a - b) === 2)).filter(Boolean).length;
    return pairs <= 1;
  };
  for (const strict of [true, false]) {
    for (const name of c.pri) {
      if (out.length > n) break;
      const pc = pcOf(name);
      if (pc === leadPc) continue;
      const m = place(pc);
      if (ok(m, strict)) out.push(m);
    }
  }
  return out.slice(0, n + 1).sort((a, b) => b - a);
}
/** Drop 2: the second voice from the top an octave down. */
export const drop2 = v => {
  const s = [...v].sort((a, b) => b - a);
  if (s.length < 3) return s;
  const [top, second, ...rest] = s;
  return [top, ...rest, second - 12].sort((a, b) => b - a);
};

// ---------------------------------------------------------------- the score

/**
 * Builds the whole song: events for the renderer, plus sections, tune notes and cues for song.json.
 * Event: { stem, inst, t (notated beat), d (beats), midi?, vel, pan, opts }
 */
export function build() {
  const ev = [];
  const cues = [];
  const tuneNotes = [];
  const sections = [];
  const R = rng(20261108);
  const E = (stem, inst, t, d, midi, vel, pan = 0, opts = {}) => ev.push({ stem, inst, t, d, midi, vel, pan, opts });

  // A line in a compact form: "bar.pos:dur:note[:flags]" with bars relative to `base`; flags: s staccato, a accent, g ghost,
  // w wah, u<c> doit up, f<c> smear in from c cents below (negative: from above), v<x> velocity, b<x> growl, x<n> vibrato cents.
  function parse(base, text, vel0 = 0.7) {
    return text.trim().split(/\s+/).map(tok => {
      const [bp, dur, note, flags = ''] = tok.split(':');
      const [b, p] = bp.split('.').length === 3 ? [bp.split('.')[0], `${bp.split('.')[1]}.${bp.split('.')[2]}`] : bp.split('.');
      const n = { t: at(base + Number(b), Number(p)), d: Number(dur), midi: nm(note), vel: vel0, opts: {} };
      // swing articulation: the upbeat eighth leans, the downbeat eighth before it is lighter
      const frac = Number(p) % 1;
      if (Math.abs(frac - 0.5) < 1e-6) n.vel = Math.min(1, n.vel * 1.08);
      else if (frac === 0 && Number(dur) <= 0.5) n.vel *= 0.92;
      for (const f of flags.split(',').filter(Boolean)) {
        const k = f[0];
        const v = Number(f.slice(1));
        if (k === 's') n.opts.staccato = true;
        else if (k === 'a') n.vel = Math.min(1, n.vel + 0.15);
        else if (k === 'g') n.vel *= 0.6;
        else if (k === 'w') n.opts.wah = 0.85;
        else if (k === 'u') n.opts.doit = v;
        else if (k === 'f') { n.opts.from = -v; n.opts.glide = 0.09; }
        else if (k === 'v') n.vel = v;
        else if (k === 'b') n.opts.growl = v;
        else if (k === 'x') n.opts.vib = v;
      }
      return n;
    });
  }
  const solo = (inst, base, text, vel, pan = 0, extra = {}) => {
    for (const n of parse(base, text, vel)) E('lead', inst, n.t, n.d, n.midi, n.vel, pan, { ...extra, ...n.opts, solo: true });
  };
  const hornNote = (base, text, vel = 0.8) => {
    for (const n of parse(base, text, vel)) {
      E('lead', 'sloedla', n.t, n.d, n.midi, n.vel, 0, n.opts);
      cues.push({ beat: n.t, kind: 'horn' });
    }
  };
  // A horn section playing a line in harmony: `parts` lists [instrument, voice index (0 = lead), octave shift, pan, level].
  const section = (stem, base, text, vel, parts, { spread = 'close', n = 3 } = {}) => {
    for (const note of parse(base, text, vel)) {
      const chord = chordAt(note.t);
      let v = harmonize(note.midi, chord, n);
      if (spread === 'drop2') v = drop2(v);
      for (const [inst, idx, oct, pan, lvl] of parts) {
        const m = (idx === 'lead' ? note.midi : v[Math.min(idx, v.length - 1)]) + 12 * oct;
        E(stem, inst, note.t, note.d, m, note.vel * lvl, pan, { ...note.opts, section: true });
      }
    }
  };
  const SAXES = [['alto', 0, 0, -0.18, 1], ['alto', 1, 0, -0.32, 0.9], ['tenor', 2, 0, -0.45, 0.9], ['tenor', 3, 0, -0.08, 0.9], ['bari', 0, -1, -0.25, 0.7]];
  const SAX_UNI = [['alto', 'lead', 0, -0.2, 1], ['alto', 'lead', 0, -0.35, 0.8], ['tenor', 'lead', -1, -0.45, 0.85], ['tenor', 'lead', -1, -0.1, 0.8]];
  const TRUMPETS = [['trumpet', 0, 0, 0.12, 1], ['trumpet', 1, 0, 0.25, 0.85], ['trumpet', 2, 0, 0.0, 0.85], ['trumpet', 3, 0, 0.35, 0.8]];
  const BONES = [['trombone', 0, -1, 0.3, 0.9], ['trombone', 1, -1, 0.45, 0.85], ['trombone', 2, -1, 0.18, 0.85], ['trombone', 3, -1, 0.55, 0.8]];
  const BRASS = [...TRUMPETS, ...BONES];
  const PAN = { grazers: -0.55, turtles: -0.28, frogs: 0.0, lizards: 0.28, flyers: 0.55 };

  // an animal call (and the marimba under it, at the tune's octave, when it is a tune note)
  const call = (group, t, { tune = false, take = null, len = null, vel = 1, marimba = tune } = {}) => {
    E('animals', 'call', t, len ?? 1, nm(`${GROUP_TONE[group]}4`), vel, PAN[group], { group, take });
    if (marimba) E('animals', 'marimba', t, 1.5, nm(TUNE_OCT[group]), 0.55 * vel, PAN[group] * 0.4, { group });
    cues.push({ beat: t, kind: 'call', group });
    if (tune) tuneNotes.push({ group, beat: t });
  };
  // her tune, sung by the animals: one phrase a bar on the beats (bars b, b+2, b+4, b+6, and do on b+7)
  const TUNE_BEATS = [[1, 3], [1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4, 5]];
  const singTune = (bar, opts = {}) => {
    TUNE.forEach((phrase, i) => phrase.forEach((g, j) => {
      const pos = TUNE_BEATS[i][j];
      const t = at(bar + 2 * i + (pos === 5 ? 1 : 0), pos === 5 ? 1 : pos);
      const last = j === phrase.length - 1;
      call(g, t, { tune: true, len: last ? 2 : 1, ...opts });
    }));
  };
  const cue = (beat, kind) => cues.push({ beat, kind });
  const sec = (name, nameIs, bar, bars, feature, what) => sections.push({ name, nameIs, startBeat: bar * 4, beats: bars * 4, feature, what });

  // ------------------------------------------------ the rhythm section, bar by bar (styles per bar)
  const style = [];
  const set = (from, to, s) => { for (let b = from; b <= to; b++) style[b] = { ...(style[b] ?? {}), ...s }; };
  set(0, 0, { bass: 'none', guitar: false, drums: 'snaps', piano: 'none' });
  set(1, 7, { bass: 'vamp', guitar: true, drums: 'light', piano: 'basie' });
  set(8, 15, { bass: 'two', guitar: true, drums: 'light', piano: 'answers' });
  set(16, 23, { bass: 'walk', guitar: true, drums: 'ride', piano: 'basie' });
  set(24, 31, { bass: 'walk', guitar: true, drums: 'ride', piano: 'basie' });
  set(32, 33, { bass: 'walk', guitar: true, drums: 'ride', piano: 'none' });
  set(34, 35, { bass: 'walk', guitar: false, drums: 'brush', piano: 'none' });
  set(36, 37, { bass: 'walk', guitar: true, drums: 'ride', piano: 'none' });
  set(38, 39, { bass: 'walk', guitar: false, drums: 'brush', piano: 'none' });
  set(40, 47, { bass: 'walk', guitar: true, drums: 'cross', piano: 'basie' });
  set(48, 55, { bass: 'walk', guitar: true, drums: 'ride2', piano: 'basie' });
  set(56, 63, { bass: 'walk', guitar: true, drums: 'ride', piano: 'none' });
  set(64, 71, { bass: 'hits', guitar: false, drums: 'stop', piano: 'hits' });
  set(72, 73, { bass: 'walk', guitar: true, drums: 'light', piano: 'none' });
  set(74, 75, { bass: 'walk', guitar: true, drums: 'ride', piano: 'basie' });
  set(76, 79, { bass: 'walk', guitar: true, drums: 'ride2', piano: 'basie' });
  set(80, 91, { bass: 'walk', guitar: true, drums: 'shout', piano: 'basie' });
  set(92, 93, { bass: 'walk', guitar: true, drums: 'roll', piano: 'none' });
  set(94, 94, { bass: 'final', guitar: false, drums: 'final', piano: 'final' });
  set(95, 95, { bass: 'none', guitar: false, drums: 'none', piano: 'plinks' });
  const LIFT = { light: 0.75, ride: 0.9, ride2: 1, cross: 0.9, shout: 1.12, brush: 0.8, roll: 1.05 };
  const level = b => LIFT[style[b]?.drums] ?? 0.9;

  // bass: walking lines from chord spans, stepwise into each next root
  let prev = nm('G2');
  const VAMP_LINE = ['G2 B2 D3 F2', 'E2 G2 B2 Bb2', 'A2 C3 E3 Eb3', 'D3 C3 A2 Ab2'].map(s => s.split(' ').map(nm));
  const span = (bar) => {
    const out = [];
    let pos = 0;
    for (const [name, n] of CHART_BARS[bar]) { out.push({ name, pos, n }); pos += n; }
    return out;
  };
  const nearest = (pc, ref, lo = nm('E1'), hi = nm('E3')) => {
    let best = null;
    for (let m = lo; m <= hi; m++) if (((m % 12) + 12) % 12 === pc && (best === null || Math.abs(m - ref) < Math.abs(best - ref))) best = m;
    return best;
  };
  for (let bar = 0; bar < 95; bar++) {
    const st = style[bar];
    const vb = 0.62 * (st.drums === 'shout' ? 1.12 : 1);
    if (st.bass === 'vamp') {
      VAMP_LINE[bar % 4].forEach((m, i) => E('bass', 'bass', at(bar, i + 1), 0.92, m, vb * (i === 0 ? 1 : 0.88), 0));
      prev = VAMP_LINE[bar % 4][3];
      continue;
    }
    if (st.bass === 'none') continue;
    if (st.bass === 'hits') {
      const root = nearest(pcOf(CH[CHART[bar * 4]].root), nm('G2'));
      E('bass', 'bass', at(bar, 1), 0.45, root, 0.62, 0);
      prev = root;
      continue;
    }
    if (st.bass === 'final') {
      E('bass', 'bass', at(bar, 1), 3.5, nm('G1'), 0.75, 0);
      E('bass', 'bass', at(bar, 1), 3.5, nm('G2'), 0.4, 0);
      continue;
    }
    for (const s of span(bar)) {
      const c = CH[s.name];
      const root = nearest(pcOf(c.root), prev);
      const nextName = chordAt(bar * 4 + s.pos + s.n);
      const target = nearest(pcOf(CH[nextName].root), root);
      if (st.bass === 'two') {
        // half notes: root and fifth (or a step into the next root), a pickup now and then
        E('bass', 'bass', at(bar, s.pos + 1), Math.min(1.9, s.n - 0.1), root, vb, 0);
        if (s.n === 4) {
          const fifth = root + 7 <= nm('D3') ? root + 7 : root - 5;
          E('bass', 'bass', at(bar, s.pos + 3), 1.8, fifth, vb * 0.85, 0);
          if (R() < 0.35) E('bass', 'bass', at(bar, s.pos + 4.5), 0.4, target + (R() < 0.5 ? 1 : -1), vb * 0.6, 0);
          prev = fifth;
        } else prev = root;
        continue;
      }
      // walk
      // a bassist's choice: root on the downbeat, scale steps or chord tones that keep going one way, a chord tone on the third
      // beat, and the last beat leaning into the next root (a half step away, a scale step, or its fifth)
      const notes = [root];
      if (s.n >= 2) {
        const DIA = [7, 9, 11, 0, 2, 4, 6];
        const pcm = m => ((m % 12) + 12) % 12;
        const tones = [];
        for (let m = root - 9; m <= root + 9; m++) if (DIA.includes(pcm(m)) && m !== root) tones.push(m);
        const chordPcs = new Set([pcOf(c.root), (pcOf(c.root) + c.third) % 12, (pcOf(c.root) + 7) % 12]);
        const iv = d => { const a = Math.abs(d); return a === 0 ? 9 : a <= 2 ? 1 : a <= 4 ? 1.4 : a === 5 ? 2 : a === 7 ? 2.4 : a <= 9 ? 3.5 : 6; };
        const sg = d => Math.sign(d);
        const mids = s.n === 4 ? tones.flatMap(x => tones.filter(y => y !== x && Math.abs(y - x) <= 5).map(y => [x, y])) : [[]];
        let best = null;
        for (const T of [target - 12, target, target + 12]) {
          if (T < nm('E1') || T > nm('E3')) continue;
          for (const mid of mids) {
            const last = mid.length ? mid[mid.length - 1] : root;
            for (const appr of [T - 1, T + 1, T + 2, T - 2, T + 7, T - 5]) {
              const line = [root, ...mid, appr];
              if (line.some(m => m < nm('E1') || m > nm('E3'))) continue;
              let cost = 0;
              for (let i = 1; i < line.length; i++) cost += iv(line[i] - line[i - 1]);
              cost += 0.5 * iv(T - appr);
              if (mid.length === 2) {
                if (sg(mid[0] - root) !== sg(mid[1] - mid[0])) cost += 1.5;
                if (!chordPcs.has(pcm(mid[1]))) cost += 2.5;
                if (!chordPcs.has(pcm(mid[0]))) cost += 0.3;
              }
              if (sg(appr - last) === sg(T - appr)) cost -= 0.3;
              const chromatic = Math.abs(T - appr) === 1;
              if (chromatic) cost -= 1.2;
              else if (appr === T + 7 || appr === T - 5) cost -= 0.4;
              else if (!DIA.includes(pcm(appr))) cost += 3;
              if (appr === last) cost += 9;
              cost += Math.abs(T - prev) > 9 ? 1.5 : 0;
              cost += R() * 1.6;
              if (!best || cost < best.cost) best = { cost, line };
            }
          }
        }
        notes.splice(0, 1, ...best.line.slice(0, s.n));
      }
      notes.forEach((m, i) => E('bass', 'bass', at(bar, s.pos + i + 1), 0.92, m, vb * (i === 0 ? 1 : 0.86 + R() * 0.1), 0));
      prev = notes[notes.length - 1];
    }
  }

  // guitar: Freddie Green, a short chord on every beat
  for (let bar = 0; bar < 95; bar++) {
    if (!style[bar].guitar) continue;
    for (let b = 1; b <= 4; b++) {
      const name = chordAt(at(bar, b));
      const v = (b % 2 === 0 ? 0.62 : 0.52) * (style[bar].drums === 'shout' ? 1.1 : style[bar].drums === 'light' ? 0.85 : 1);
      E('pad', 'guitar', at(bar, b), 0.38, null, v, -0.42, { chord: CH[name].guitar.map(nm) });
    }
  }

  // piano: Basie's sparse comping up high, a few figures, the hits and the final plinks
  const BASIE = [[[2.5, 0.4], [4, 0.3]], [[1.5, 0.3], [3, 0.5]], [[2, 0.3], [2.5, 0.4]], [[4.5, 0.4]], [[3.5, 0.3], [4.5, 0.3]], [[2.5, 0.3]]];
  for (let bar = 0; bar < 96; bar++) {
    const st = style[bar];
    if (!st || st.piano === 'none') continue;
    const chordPiano = (t, d, v) => {
      const c = CH[chordAt(t)];
      for (const m of c.piano.map(nm)) E('pad', 'piano', t, d, m, v, 0.38);
    };
    if (st.piano === 'basie') {
      // the intro's vamp and the loop are one fixed pattern (the loop's seam needs bars 2-3 to be bars 6-7)
      const pat = bar < 8 ? BASIE[[3, 1, 0, 4][bar % 4]] : BASIE[Math.floor(R() * BASIE.length)];
      for (const [p, d] of pat) chordPiano(at(bar, p), d, 0.42 + (bar < 8 ? 0 : R() * 0.1));
    } else if (st.piano === 'answers') {
      if (bar % 2 === 1) for (const [p, d] of BASIE[1]) chordPiano(at(bar, p), d, 0.42);
    } else if (st.piano === 'hits') {
      chordPiano(at(bar, 1), 0.35, 0.5);
    } else if (st.piano === 'final') {
      for (const m of ['G3', 'D4', 'A4', 'B4', 'E5'].map(nm)) E('pad', 'piano', at(bar, 1), 3.4, m, 0.5, 0.38);
    } else if (st.piano === 'plinks') {
      // plink, plink, plink ... (the button follows on beat 384)
      E('pad', 'piano', at(bar, 2), 0.3, nm('E6'), 0.5, 0.38);
      E('pad', 'piano', at(bar, 3), 0.3, nm('D6'), 0.45, 0.38);
      E('pad', 'piano', at(bar, 4), 0.3, nm('B5'), 0.5, 0.38);
    }
  }
  // the intro's Basie figure over bar 1 (a little lead-in on the keys)
  for (const [p, n] of [[1.5, 'B5'], [2, 'D6'], [2.5, 'E6'], [4, 'D6'], [4.5, 'B5']]) E('pad', 'piano', at(1, p), 0.3, nm(n), 0.38, 0.38);

  // drums
  const D = (name, t, vel, pan = 0, opts = {}) => E('beat', name, t, 0.5, null, vel, pan, opts);
  for (let bar = 0; bar < 95; bar++) {
    const st = style[bar].drums;
    const L = level(bar);
    const fixed = bar < 8; // the vamp and loop: the same each bar of the cycle
    const rr = fixed ? rng(1000 + (bar % 4)) : R;
    if (st === 'none') continue;
    if (st === 'snaps' || st === 'stop') {
      for (const b of [2, 4]) {
        D('snap', at(bar, b), 0.85, b === 2 ? -0.18 : 0.18);
        D('hatfoot', at(bar, b), 0.5, -0.35);
      }
      if (st === 'stop') D('kick', at(bar, 1), 0.5);
      if (bar === 71) { D('snare', at(bar, 4), 0.22, 0.05); D('snare', at(bar, 4.5), 0.3, 0.05); }
      continue;
    }
    if (st === 'final') {
      D('crash', at(bar, 1), 0.38, 0.3);
      D('kick', at(bar, 1), 0.6);
      for (let i = 0; i < 12; i++) D('ride', at(bar, 1 + i * 0.25), 0.12 + 0.02 * Math.sin(i), 0.35, { bell: 0.1 }); // a soft roll on the ride
      continue;
    }
    // the ride: ding, ding-a, ding, ding-a
    if (st !== 'brush') {
      const rv = { light: 0.5, ride: 0.6, ride2: 0.65, cross: 0.6, shout: 0.75, roll: 0.7 }[st] ?? 0.6;
      for (const [p, v] of [[1, 1], [2, 0.92], [2.5, 0.62], [3, 0.95], [4, 0.92], [4.5, 0.62]]) {
        D('ride', at(bar, p), rv * v * (0.93 + rr() * 0.12), 0.35, { bell: st === 'shout' ? 0.5 : 0.3 });
      }
      for (const b of [2, 4]) D('hatfoot', at(bar, b), 0.55 * L, -0.35);
      // feathered kick on all four, felt more than heard
      for (let b = 1; b <= 4; b++) D('kick', at(bar, b), (b === 1 ? 0.3 : 0.24) * L);
    } else {
      // brushes: a sweep on each beat, taps on 2 and 4, the hat on 2 and 4
      for (let b = 1; b <= 4; b++) D('sweep', at(bar, b), 0.5, b % 2 ? -0.15 : 0.15);
      for (const b of [2, 4]) { D('btap', at(bar, b), 0.55, 0.05); D('hatfoot', at(bar, b), 0.45, -0.35); }
    }
    if (st === 'cross') for (const b of [2, 4]) D('rim', at(bar, b), 0.5, 0.05);
    if (st === 'shout') {
      D('snare', at(bar, 4), 0.42, 0.05); // the chop on 4
      if (rr() < 0.5) D('snare', at(bar, 2.5), 0.22, 0.05);
    }
    if (st === 'ride' || st === 'ride2' || st === 'shout') {
      // comping: ghost notes on the swung ands, more in ride2
      const k = st === 'ride' ? 1 : 2;
      for (let i = 0; i < k; i++) {
        const p = [1.5, 2.5, 3.5, 4.5][Math.floor(rr() * 4)];
        D('snare', at(bar, p), 0.14 + rr() * 0.06, 0.05);
      }
    }
    if (st === 'roll') {
      // the broadened tag: a soft snare roll that grows over two bars
      for (let i = 0; i < 16; i++) D('snare', at(bar, 1 + i * 0.25), (0.12 + 0.18 * ((bar - 92) * 16 + i) / 32), 0.05);
    }
    // fills at the ends of sections (soft)
    const endOf = [7, 3, 15, 23, 31, 47, 55, 71, 87];
    if (endOf.includes(bar)) {
      if (bar <= 7) D('snare', at(bar, 4.5), 0.28, 0.05); // the vamp's turnaround pickup (also in bar 3)
      else {
        D('snare', at(bar, 4), 0.26, 0.05);
        D('snare', at(bar, 4.5), 0.32, 0.05);
        D('tom', at(bar, 4.5), 0.3, -0.2, { hz: 110 });
      }
    }
    if (bar === 39) for (const [p, hz] of [[3.5, 196], [4, 165], [4.5, 131]]) D('tom', at(bar, p), 0.38, p === 4 ? 0 : -0.25, { hz });
    if (bar === 79) {
      // the rise into the shout: a snare roll growing from soft to medium, toms under it
      for (let i = 0; i < 16; i++) D('snare', at(bar, 1 + i * 0.25), 0.1 + 0.32 * (i / 15) ** 1.4, 0.05);
      D('kick', at(bar, 4.5), 0.45);
    }
  }
  // turtles' shells (temple blocks, the pentatonic in the fifth octave) in their breaks
  const BLOCK = { G: 'G4', A: 'A4', B: 'B4', D: 'D5', E: 'E5' };
  const shells = (bar, text) => {
    for (const tok of text.split(' ')) {
      const [p, n, v = '0.7'] = tok.split(':');
      E('beat', 'block', at(bar, Number(p)), 0.3, nm(BLOCK[n]), Number(v), (pcOf(n) - 6) / 14, {});
    }
  };

  // ------------------------------------------------ 0-7 intro: her call, the vamp, the loop with the roll call
  sec('Intro', 'Inngangur', 0, 8, null, 'Her horn calls sol-mi alone over finger snaps; the rhythm section and the saxes start the vamp; on its second pass (the loop) the animals answer one by one, low to high.');
  hornNote(0, '0.1:1.5:D4:f60,x12 0.3:1.5:B3:x12', 0.72);
  // the saxes' vamp riff (2 bars) in bars 2-3, 4-5, 6-7, in pentatonic fourths and thirds
  const RIFF = ['0.1.5:0.5:B4 0.2:0.5:D5 0.2.5:1:E5:a 0.3.5:0.5:D5 0.4:0.5:B4:s', '1.1.5:0.5:G4 1.2:0.5:A4 1.2.5:1:B4 1.3.5:0.5:A4 1.4:0.75:G4'];
  const below = { E: 'B', D: 'A', B: 'G', A: 'E', G: 'D' };
  const riff = (bar, vel) => {
    for (const n of parse(bar, RIFF.join(' '), vel)) {
      const name = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n.midi % 12];
      let low = n.midi - 1;
      while (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((low % 12) + 12) % 12] !== below[name]) low--;
      E('lead', 'alto', n.t, n.d, n.midi, n.vel, -0.2, { ...n.opts, section: true });
      E('lead', 'alto', n.t, n.d, n.midi, n.vel * 0.8, -0.32, { ...n.opts, section: true });
      E('lead', 'tenor', n.t, n.d, low, n.vel * 0.85, -0.45, { ...n.opts, section: true });
      E('lead', 'tenor', n.t, n.d, low - 12, n.vel * 0.6, -0.1, { ...n.opts, section: true });
    }
  };
  riff(2, 0.55); riff(4, 0.55); riff(6, 0.55);
  // the roll call: grazers, turtles, frogs, lizards, flyers, low to high on the I-vi-ii of the loop
  call('grazers', at(4, 1), { marimba: true });
  call('turtles', at(4, 3), { marimba: true });
  call('frogs', at(5, 1), { marimba: true });
  call('lizards', at(5, 3), { marimba: true });
  call('flyers', at(6, 1), { marimba: true });

  // ------------------------------------------------ 8-15 head A1: the animals sing her tune, the horns answer
  sec('Her tune (sung)', 'Lagið hennar (sungið)', 8, 8, null, 'The animals sing her tune, each note by its own group (the camera jumps to each singer); the horns answer every phrase.');
  singTune(8, { vel: 1.2 });
  section('lead', 9, '0.1.5:0.5:D5:s 0.2.5:1:E5:w,a 0.4:0.5:D5:s', 0.62, BRASS);
  for (const n of parse(11, '0.1.5:0.5:G4 0.2:0.5:A4 0.2.5:0.5:B4 0.3:0.5:D5 0.3.5:0.5:E5 0.4:0.5:G5:s,a', 0.62)) {
    for (const [inst, , oct, pan, lvl] of SAX_UNI) E('lead', inst, n.t, n.d, n.midi + 12 * oct, n.vel * lvl, pan, { ...n.opts, section: true });
  }
  section('lead', 13, '0.1.5:0.5:E5:s 0.2:1.5:G5:w,a 0.4:0.5:D5:s', 0.62, BRASS);
  for (const n of parse(15, '0.2.5:0.5:A4 0.3:0.5:C5 0.3.5:0.5:E5 0.4:0.5:F#5:s,a', 0.58)) {
    for (const [inst, , oct, pan, lvl] of SAX_UNI) E('lead', inst, n.t, n.d, n.midi + 12 * oct, n.vel * lvl, pan, { ...n.opts, section: true });
  }

  // ------------------------------------------------ 16-23 head A2: she plays it on her horn, saxes under her
  sec('Her tune (horn)', 'Lagið hennar (horn)', 16, 8, 'sloedla', 'Slóeðla plays her tune on her horn, swung, the saxes holding soft chords under her and the brass answering.');
  hornNote(16, '0.1:1.5:D4:f80,x14 0.2.5:1.5:B3:x14 2.1:0.75:A3 2.2:0.75:B3 2.3:2:G3:x16 4.1:0.75:E4:f60 4.2:0.75:D4 4.3:0.75:B3 4.4:1:D4:u120 6.1:0.75:E4 6.2:0.75:D4 6.3:0.75:B3 6.4:0.75:A3 7.1:2.5:G3:x16', 0.85);
  section('pad', 16, '0.1:4:B4 2.1:2:C5 2.3:2:C5 4.1:4:B4 6.1:2:C5 6.3:2:C5 7.1:3:B4', 0.38, SAXES, { spread: 'drop2' });
  section('lead', 17, '0.1.5:0.5:D5:s 0.2.5:1:E5:w,a 0.4:0.5:G5:s', 0.6, BRASS);
  for (const n of parse(19, '0.1.5:0.5:E5 0.2:0.5:D5 0.2.5:0.5:B4 0.3:0.5:A4 0.3.5:0.5:G4 0.4:0.5:E4:s', 0.6)) {
    for (const [inst, , oct, pan, lvl] of SAX_UNI) E('lead', inst, n.t, n.d, n.midi + 12 * oct, n.vel * lvl, pan, { ...n.opts, section: true });
  }
  section('lead', 21, '0.1.5:0.5:E5:s 0.2:1.5:G5:w,a 0.4:0.5:D5:s', 0.62, BRASS);
  // a trombone smear up into the grazers' chorus
  E('lead', 'trombone', at(23, 4), 1, nm('D3'), 0.6, 0.3, { from: -500, glide: 0.25, wah: 0.6 });

  // ------------------------------------------------ 24-31 grazers: moos and the plunger trombone
  sec('Grazers', 'Grasbítar', 24, 8, 'grazers', 'The big plant-eaters moo on the downbeats and a plunger trombone answers them, smearing and growling, low and friendly.');
  for (const [b, take] of [[24, 'grazers-3'], [26, 'grazers-2'], [28, 'grazers-3'], [30, 'grazers-3']]) call('grazers', at(b, 1), { len: 2.6, take });
  call('grazers', at(31, 3), { len: 1.5, take: 'grazers-3' });
  solo('trombone', 24, `
    0.3:1:D3:w 0.4:1:G3:f300,w
    1.1:1.5:B3:w 1.2.5:0.5:A3 1.3:0.5:G3 1.3.5:0.5:E3 1.4:1:G3:w
    2.2.5:0.5:A3 2.3:1:C4:w 2.4:0.5:B3 2.4.5:0.5:A3
    3.1:2:G3:f-200,w 3.3:0.5:E3 3.3.5:0.5:G3 3.4:1:A3:w
    4.2:1:B3 4.3:2:D4:f300,w,b0.3,a
    5.1:0.5:C4 5.1.5:0.5:B3 5.2:0.5:A3 5.2.5:1:G3:w 5.3.5:0.5:E3 5.4:1:D3
    6.2.5:0.5:E3 6.3:0.5:G3 6.3.5:0.5:A3 6.4:1:B3:f100,w
    7.1:0.5:A3 7.1.5:1.5:G3:w 7.3:1.5:G2:b0.6`, 0.8, 0.05, { mute: 'plunger' });
  section('pad', 24, '0.1:8:B4 2.1:4:C5 3.1:4:B4 4.1:8:B4 6.1:4:C5 7.1:4:B4', 0.3, SAXES.slice(0, 4), { spread: 'drop2' });

  // ------------------------------------------------ 32-39 turtles: trading twos, the band and their shells
  sec('Turtles', 'Skjaldbökur', 32, 8, 'turtles', 'Trading twos: two bars of the band walking slow and heavy, then two bars of the turtles alone on their shells (temple blocks) and their call; twice.');
  const turtleWalk = (bar, text) => {
    section('lead', bar, text, 0.66, [['trombone', 'lead', 0, 0.3, 1], ['trombone', 'lead', 0, 0.45, 0.8], ['bari', 'lead', -1, -0.25, 0.8], ['tenor', 'lead', 0, -0.45, 0.7], ['tenor', 'lead', 0, -0.1, 0.6]]);
    section('lead', bar, text.split(' ').filter((_, i) => i === 0 || i === 6).join(' '), 0.5, TRUMPETS.map(([i, idx, , pan, l]) => [i, idx, 1, pan, l * 0.8]));
  };
  turtleWalk(32, '0.1:1:G3:a 0.2:1:B3 0.3:1.5:D4 0.4.5:0.5:E4 1.1:1:D4 1.2:0.5:B3:s 1.2.5:1.5:A3:w');
  turtleWalk(36, '0.1:1:E3:a 0.2:1:G3 0.3:1.5:B3 0.4.5:0.5:D4 1.1:1:B3 1.2:0.5:A3:s 1.2.5:1.5:G3:w');
  for (const [b, take] of [[34, 'turtles-2'], [35, 'turtles-1'], [38, 'turtles-2'], [39, 'turtles-2']]) call('turtles', at(b, 1), { len: 1.6, take });
  call('turtles', at(39, 3), { len: 1, take: 'turtles-2' });
  shells(34, '1.5:D 2:E 2.5:D:0.55 3:B 3.5:A:0.55 4:G 4.5:A:0.6');
  shells(35, '1.5:B 2:D 3:E:0.85 3.5:D:0.55 4:B 4.5:G:0.6');
  shells(38, '1.5:E 2:D 2.5:E:0.55 3:G 3.5:A:0.55 4:B 4.5:D:0.6');
  shells(39, '1.5:E 2:D 2.5:B:0.55');

  // ------------------------------------------------ 40-47 frogs: the bridge, a wah-wah trumpet that hops, ribbits
  sec('Frogs', 'Froskar', 40, 8, 'frogs', 'The bridge: a muted wah-wah trumpet hops in octave leaps and the frogs answer every phrase with a ribbit; cross-stick on 2 and 4.');
  solo('trumpet', 40, `
    0.1:0.5:G4:s 0.1.5:0.5:G5:s,a 0.2.5:0.5:E5 0.3:0.5:D5 0.3.5:1:E5:w
    1.1:2:B4:w,x10
    2.1:0.5:B4:s 2.1.5:0.5:B5:s,a 2.2.5:0.5:G5 2.3:0.5:E5 2.3.5:0.5:D5 2.4:1:E5:w
    3.1:2:G5:w,u150
    4.1:0.5:A4:s 4.1.5:0.5:A5:s,a 4.2:0.5:G5 4.2.5:0.5:E5 4.3:0.5:C5 4.3.5:0.5:D5 4.4:1:E5:w
    5.1:0.5:D5 5.1.5:0.5:B4 5.2:1:A4:w
    6.1:0.5:A4 6.1.5:0.5:B4 6.2:0.5:D5 6.2.5:0.5:E5 6.3:0.5:G5 6.3.5:0.5:A5 6.4:1:B5:w,a
    7.1:1:A5:w 7.2:0.5:F#5 7.2.5:0.5:E5 7.3:1:D5:w`, 0.72, 0.08, { mute: 'harmon' });
  for (const [b, p, take] of [[41, 3, 'frogs-5'], [41, 4, 'frogs-1'], [43, 3, 'frogs-5'], [43, 4, 'frogs-2'], [45, 3, 'frogs-5'], [45, 4, 'frogs-3'], [47, 4, 'frogs-5']]) {
    call('frogs', at(b, p), { len: 1, take });
  }
  section('pad', 40, '0.1:2:E4:w 0.3:2:E4:w 1.1:3.5:E4:w 2.1:2:D4:w 2.3:2:D4:w 3.1:3.5:D4:w 4.1:2:C4:w 4.3:2:E4:w 5.1:3.5:C4:w 6.1:4:C4:w 7.1:4:C4:w', 0.26, BONES.map(([i, idx, , pan, l]) => [i, idx, 0, pan, l]), { n: 3 });

  // ------------------------------------------------ 48-55 lizards: a clarinet darting, chirps in the gaps
  sec('Lizards', 'Smáeðlur', 48, 8, 'lizards', 'A clarinet darts about up high in quick swung runs and the small lizards chirp in its gaps; the saxes riff behind.');
  solo('clarinet', 48, `
    0.1.5:0.5:D6 0.2:0.5:B5 0.2.5:0.5:A5 0.3:0.5:G5 0.3.5:0.5:A5 0.4:0.5:B5 0.4.5:0.5:D6
    1.1:1:E6:x8 1.2:0.5:D6 1.2.5:1:B5
    2.1:0.5:C6 2.1.5:0.5:B5 2.2:0.5:A5 2.2.5:0.5:G5 2.3:0.5:E5 2.3.5:0.5:G5 2.4:0.5:A5 2.4.5:0.5:B5
    3.1:2:D6:x10
    4.1:0.5:E6 4.1.5:0.5:G6:a 4.2:0.5:E6 4.2.5:0.5:D6 4.3:0.5:B5 4.3.5:0.5:D6 4.4:1:E6
    5.1:0.5:D6 5.1.5:0.5:B5 5.2:1:G5
    6.1:0.5:A5 6.1.5:0.5:B5 6.2:0.5:C6 6.2.5:0.5:D6 6.3:0.5:E6 6.3.5:0.5:F#6 6.4:1:G6:a
    7.1:2:D6:x12`, 0.72, -0.05);
  for (const [b, p, take] of [[49, 3.5, 'lizards-3'], [49, 4, 'lizards-2'], [51, 3, 'lizards-2'], [51, 3.5, 'lizards-3'], [53, 3, 'lizards-3'], [53, 3.5, 'lizards-3'], [53, 4, 'lizards-2'], [55, 3, 'lizards-1']]) {
    call('lizards', at(b, p), { len: 0.8, take });
  }
  // the saxes' background riff: a short chord on the and of 2, a held one on 4
  for (const b of [48, 50, 52, 54]) {
    const top1 = { 48: 'D5', 50: 'C5', 52: 'E5', 54: 'C5' }[b];
    const top2 = { 48: 'E5', 50: 'E5', 52: 'D5', 54: 'E5' }[b];
    section('pad', b, `0.2.5:0.5:${top1}:s 0.4:2:${top2}`, 0.42, SAXES, { spread: 'drop2' });
  }
  section('lead', 52, '0.1.5:0.5:E5:s 0.3.5:0.5:G5:s', 0.5, TRUMPETS);

  // ------------------------------------------------ 56-63 flyers: vibes up high, whistles
  sec('Flyers', 'Smáfleygar', 56, 8, 'flyers', 'Vibraphone up high with its motor shimmering, the small flyers whistling between its runs; the band light, no trombones.');
  const vib = (base, text, vel) => {
    for (const n of parse(base, text, vel)) E('lead', 'vibes', n.t, n.d, n.midi, n.vel, 0.12, { solo: true, ring: n.d >= 1.5 });
  };
  vib(56, `
    0.1:1:B5 0.2:0.5:D6 0.2.5:0.5:E6 0.3:1.5:G6 0.4.5:0.5:E6
    1.1:0.5:D6 1.1.5:0.5:B5 1.2:1:G5 1.3.5:0.5:A5 1.4:0.5:B5
    2.1:0.5:C6 2.1.5:0.5:E6 2.2:0.5:G6 2.2.5:0.5:E6 2.3:0.5:B5 2.3.5:0.5:D6 2.4:1:A5
    3.1:3:B5
    4.1:0.5:E6 4.1.5:0.5:D6 4.2:0.5:B5 4.2.5:0.5:G5 4.3:0.5:A5 4.3.5:0.5:B5 4.4:0.5:D6 4.4.5:0.5:E6
    5.1:2:G6
    6.1:0.5:A6 6.1.5:0.5:G6 6.2:0.5:E6 6.2.5:0.5:D6 6.3:0.5:B5 6.3.5:0.5:A5 6.4:0.5:G5 6.4.5:0.5:E5
    7.1:0.5:D5 7.1.5:0.5:E5 7.2:1.5:G5`, 0.7);
  for (const [b, p, take] of [[57, 3, 'flyers-3'], [59, 2.5, 'flyers-1'], [61, 3, 'flyers-2'], [62, 4.5, 'flyers-3'], [63, 4, 'flyers-1']]) {
    call('flyers', at(b, p), { len: 1.2, take });
  }
  section('pad', 56, '0.1:8:D5 2.1:4:E5 3.1:4:D5 4.1:8:E5 6.1:4:E5 7.1:4:D5', 0.26, SAXES.slice(0, 4), { spread: 'close' });

  // ------------------------------------------------ 64-71 her stop-time chorus: the band stops, she plays alone
  sec('Slóeðla alone', 'Slóeðla ein', 64, 8, 'sloedla', 'Stop-time: the band only hits one soft chord at the top of each bar, the snaps keep the beat, and Slóeðla plays her horn alone in the gaps, brave, quoting her tune.');
  for (let b = 64; b <= 71; b++) {
    const top = { 64: 'B4', 65: 'D5', 66: 'C5', 67: 'B4', 68: 'E5', 69: 'D5', 70: 'C5', 71: 'B4' }[b];
    section('lead', b, `0.1:0.5:${top}:s`, 0.4, [...SAXES.slice(0, 4), ...BONES]);
    cue(at(b, 1), 'hit');
  }
  hornNote(64, `
    0.2:1:D4:f60 0.3:1:B3
    1.2:0.5:D4 1.2.5:1.5:E4:f80 1.4:0.5:D4 1.4.5:0.5:B3
    2.2:1:A3 2.3:0.5:B3 2.3.5:1.5:G3:x14
    3.2:0.5:B3 3.2.5:0.5:D4 3.3:1:E4:u140
    4.2:1:E4 4.3:0.5:D4 4.3.5:0.5:B3 4.4:1:D4
    5.2:2.5:G4:f100,x16,a
    6.2:0.5:E4 6.2.5:0.5:D4 6.3:0.5:B3 6.3.5:0.5:A3 6.4:1:G3
    7.2:0.5:B3 7.2.5:0.5:D4 7.3:0.5:E4 7.3.5:1.5:G4:f60`, 0.76);

  // ------------------------------------------------ 72-79 the rise: the band comes back under her
  sec('The rise', 'Upprisan', 72, 8, 'sloedla', 'The bridge again as the rise: the rhythm section comes back under her horn, then the saxes swell, the trombones and trumpets join and the whole band climbs into the shout.');
  cue(at(72, 1), 'rise');
  hornNote(72, '0.1:1.5:E4:f60 0.2.5:0.5:D4 0.3:1:B3 0.4:1:D4 1.1:2:E4:x14 1.3.5:1.5:G4:f80', 0.66);
  hornNote(72, '2.1:0.5:E4 2.1.5:0.5:D4 2.2:1:B3 2.3:0.5:D4 2.3.5:1.5:E4 3.1:2.5:G4:x16 3.4:1:A4:f80', 0.74);
  hornNote(72, '4.1:0.5:G4 4.1.5:0.5:E4 4.2:1:D4 4.3:0.5:E4 4.3.5:1.5:G4 5.1:3:A4:x16', 0.84);
  hornNote(72, '6.1:4:G4:x14 7.1:3.5:A4:x18,u100', 0.95);
  section('pad', 74, '0.1:4:B4 1.1:4:B4', 0.26, SAXES, { spread: 'drop2' });
  section('pad', 74, '2.1:4:C5 3.1:4:C5', 0.34, SAXES, { spread: 'drop2' });
  section('pad', 74, '4.1:4:C5 5.1:4:C5', 0.44, SAXES, { spread: 'drop2' });
  section('lead', 76, '0.1:3:E4:w 1.1:3:E4:w', 0.5, BONES.map(([i, idx, , pan, l]) => [i, idx, 0, pan, l]));
  // the climb: the whole band in harmony, a pentatonic stair into the shout
  cue(at(78, 1), 'rise');
  section('lead', 78, '0.1:1:A4:v0.5 0.2:1:B4:v0.55 0.3:1:D5:v0.6 0.4:1:E5:v0.65 1.1:1:G5:v0.7 1.2:1:A5:v0.75 1.3:1:B5:v0.8 1.4:1:C6:v0.85', 0.56, [...TRUMPETS, ...BONES, ...SAXES.slice(0, 4).map(([i, idx, , pan, l]) => [i, idx, -1, pan, l])], { spread: 'drop2' });

  // ------------------------------------------------ 80-87 shout chorus: everyone
  sec('Everyone', 'Allir saman', 80, 8, 'all', 'The shout chorus, the high point: the animals sing her tune with the whole band shouting it in harmony; between phrases every group sings at once and Slóeðla answers on her horn.');
  cue(at(80, 1), 'peak');
  E('beat', 'crash', at(80, 1), 0.5, null, 0.42, 0.3, {});
  singTune(80, { vel: 1.25 });
  section('lead', 80, `0.1:2:D6:a 0.3:2:B5:u120 2.1:1:A5 2.2:1:B5 2.3:2:G5:u120 4.1:1:E6:a 4.2:1:D6 4.3:1:B5 4.4:1:D6:u120 6.1:1:E6:a 6.2:1:D6 6.3:1:B5 6.4:1:A5 7.1:2:G5`, 0.86, [...TRUMPETS, ...BONES], { spread: 'drop2' });
  for (const n of parse(80, '0.1:2:D5 0.3:2:B4 2.1:1:A4 2.2:1:B4 2.3:2:G4 4.1:1:E5 4.2:1:D5 4.3:1:B4 4.4:1:D5 6.1:1:E5 6.2:1:D5 6.3:1:B4 6.4:1:A4 7.1:2:G4', 0.74)) {
    for (const [inst, , oct, pan, lvl] of SAX_UNI) E('lead', inst, n.t, n.d, n.midi + 12 * oct, n.vel * lvl, pan, { section: true });
  }
  const everyone = (t, len = 1.2) => {
    for (const g of GROUPS) call(g, t, { len, vel: 1 });
    cue(t, 'hit');
  };
  for (const b of [81, 83, 85]) {
    everyone(at(b, 2));
    const top = b === 85 ? 'E6' : 'D6';
    section('lead', b, `0.1.5:0.5:B5:s,a 0.2:1:${top}:a`, 0.84, [...TRUMPETS, ...BONES], { spread: 'drop2' });
    section('lead', b, '0.1.5:0.5:E5:s,a 0.2:1:D5:a', 0.7, SAXES.slice(0, 4));
    section('pad', b, '0.3:2:B4', 0.4, SAXES.slice(0, 4), { spread: 'drop2' });
  }
  hornNote(81, '0.3:0.5:G4 0.3.5:0.5:E4 0.4:1:G4:u100');
  hornNote(83, '0.3:0.5:A4:f60 0.3.5:0.5:G4 0.4:1:E4');
  hornNote(85, '0.3:0.5:G4 0.3.5:0.5:A4 0.4:1:B4:f100');
  hornNote(87, '0.2.5:0.5:D4 0.3:0.5:E4 0.3.5:0.5:G4 0.4:1:A4:u80');

  // ------------------------------------------------ 88-95 the tag and the ending
  sec('One more time', 'Einu sinni enn', 88, 8, 'all', 'The tag: la sol mi re do three times, the last time broad; then everyone holds the last chord, all five animal tones at once with her horn on do; three piano plinks and the button.');
  const tagLine = (bar, vel) => {
    ['flyers', 'lizards', 'frogs', 'turtles'].forEach((g, i) => call(g, at(bar, i + 1), { tune: false, len: 1, vel }));
    call('grazers', at(bar + 1, 1), { len: 2, vel });
    section('lead', bar, '0.1:1:E5:a 0.2:1:D5 0.3:1:B4 0.4:1:A4 1.1:2:G4', 0.66, [...TRUMPETS, ...BONES.map(([i, idx, , pan, l]) => [i, idx, -1, pan, l]), ...SAXES.slice(0, 4).map(([i, idx, , pan, l]) => [i, idx, 0, pan, l])], { spread: 'drop2' });
  };
  tagLine(88, 1);
  hornNote(89, '0.2:0.5:D4 0.2.5:0.5:E4 0.3:1.5:G4:x14');
  tagLine(90, 1.05);
  hornNote(91, '0.2:0.5:E4 0.2.5:0.5:G4 0.3:1.5:A4:f60,x14');
  // the broad last time: half notes
  ['flyers', 'lizards', 'frogs', 'turtles'].forEach((g, i) => call(g, at(92 + Math.floor(i / 2), 1 + 2 * (i % 2)), { len: 2, vel: 1.05 }));
  section('lead', 92, '0.1:2:E5:a 0.3:2:D5 1.1:2:B4 1.3:2:A4', 0.7, [...TRUMPETS, ...BONES.map(([i, idx, , pan, l]) => [i, idx, -1, pan, l]), ...SAXES.slice(0, 4)], { spread: 'drop2' });
  hornNote(92, '0.1:2:E4:x12 0.3:2:D4:x12 1.1:2:B3:x12 1.3:2:A3:x12', 0.8);
  // the last chord: all five tones at once, her horn on do, the band holding
  cue(at(94, 1), 'hit');
  for (const g of GROUPS) call(g, at(94, 1), { len: 3, vel: 1 });
  hornNote(94, '0.1:3.5:G3:x16', 0.95);
  section('lead', 94, '0.1:3.5:B5', 0.66, [...TRUMPETS, ...BONES], { spread: 'drop2' });
  section('lead', 94, '0.1:3.5:G4', 0.5, SAXES, { spread: 'drop2' });
  // plinks (piano above) and the button: the band's short soft chord, bass and kick, her horn's last do
  cue(BEATS, 'end');
  E('bass', 'bass', BEATS, 0.6, nm('G2'), 0.7, 0);
  E('beat', 'kick', BEATS, 0.5, null, 0.38, 0, {});
  E('pad', 'piano', BEATS, 0.5, nm('G5'), 0.5, 0.38);
  E('pad', 'piano', BEATS, 0.5, nm('D5'), 0.4, 0.38);
  section('lead', 95, '1.1:0.5:D5:s', 0.42, [...SAXES.slice(0, 4), ...BONES]);
  hornNote(96, '0.1:0.6:G3', 0.85);

  // the tune sung must be at the head and the shout; sort everything
  ev.sort((a, b) => a.t - b.t);
  cues.sort((a, b) => a.beat - b.beat);
  tuneNotes.sort((a, b) => a.beat - b.beat);
  return { events: ev, sections, cues, tuneNotes, loop: { startBeat: 16, beats: 16 } };
}
