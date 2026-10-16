import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { beatAt } from '../engine/beat.js';
import { createWind } from '../engine/wind.js';
import { createSharedUniforms } from '../world/forest/materials.js';
import { FOREST } from '../world/forest/config.js';
import { measureRhythm, measureKey, bellNotes, keyNotes } from '../tools/theme-tempo.mjs';

const near = (a, b, tolerance = 1e-9, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what ? `${what}: ` : ''}${a} is not within ${tolerance} of ${b}`);

test('beatAt is deterministic and periodic', () => {
  // 120 beats a minute is a beat every half second, so these times are exact in floating point
  const theme = { bpm: 120, beatOffset: 0.25 };
  assert.deepEqual(beatAt(0.25, theme), { index: 0, phase: 0, pulse: 1 }, 'a beat starts at the offset');
  assert.deepEqual(beatAt(0.75, theme), { index: 1, phase: 0, pulse: 1 });
  const half = beatAt(0.5, theme);
  assert.equal(half.index, 0);
  near(half.phase, 0.5);
  const before = beatAt(0, theme);
  assert.equal(before.index, -1, 'before the first beat the index counts down');
  near(before.phase, 0.5);

  // pure: the same time gives the same answer however often and in whatever order it is asked
  const odd = { bpm: 93.7, beatOffset: 0.137 };
  const times = [0, 0.137, 1.7, 12.345, 100.003, 351.6];
  const forward = times.map(t => beatAt(t, odd));
  const backward = [...times].reverse().map(t => beatAt(t, odd)).reverse();
  assert.deepEqual(backward, forward);
  assert.deepEqual(times.map(t => beatAt(t, odd)), forward);

  // periodic: a beat later is the next index at the same phase, and the phase always stays inside the beat
  const period = 60 / odd.bpm;
  for (let t = 0.011; t < 351.6; t += 7.919) {
    const a = beatAt(t, odd);
    const b = beatAt(t + period, odd);
    assert.equal(b.index, a.index + 1, `a beat after ${t} s`);
    near(b.phase, a.phase, 1e-6);
    assert.ok(a.phase >= 0 && a.phase < 1, `phase ${a.phase} at ${t} s`);
    near(a.index + a.phase, ((t - odd.beatOffset) * odd.bpm) / 60, 1e-9);
  }
});

test('the pulse decays within a beat', () => {
  const theme = { bpm: 100, beatOffset: 0 }; // a beat every 0.6 s
  const beat = Array.from({ length: 100 }, (_, i) => beatAt(i * 0.006, theme));
  assert.equal(beat[0].pulse, 1, 'full strength on the beat');
  for (let i = 1; i < beat.length; i++) assert.ok(beat[i].pulse < beat[i - 1].pulse, `the pulse falls at step ${i}`);
  for (const { phase, pulse } of beat) near(pulse, Math.exp(-6 * phase));
  assert.ok(beat[beat.length - 1].pulse < 0.01, `${beat[beat.length - 1].pulse} is left just before the next beat`);
  assert.equal(beatAt(0.6 + 1e-6, theme).index, 1);
  assert.ok(beatAt(0.6 + 1e-6, theme).pulse > 0.99, 'the next beat starts again at full strength');
});

test('the configured sway stays within 3 degrees with the beat added', () => {
  // These two numbers bound what bendAt bakes (trunks, crowns, needles, tree-fern trunks). Fronds, stems and stalks have weights of
  // their own, so forest-sway.test.mjs builds every kind and holds what it baked to the same rule.
  const { maxSwayDeg, beatAmplitudeDeg } = FOREST.wind;
  assert.ok(beatAmplitudeDeg > 0, 'the beat is part of the sway: a limit met by switching it off is not met');
  assert.ok(maxSwayDeg + beatAmplitudeDeg <= 3, `${maxSwayDeg} + ${beatAmplitudeDeg} degrees is over the style guide's 3`);
});

test('setBeat feeds one shared uBeat uniform that every forest material reads', () => {
  const wind = createWind();
  assert.equal(wind.uniforms.uBeat.value, 0, 'it starts still');
  wind.setBeat(0.37);
  assert.equal(wind.uniforms.uBeat.value, 0.37);
  wind.setBeat(7);
  assert.equal(wind.uniforms.uBeat.value, 1, 'a pulse is held to 0..1');
  wind.setBeat(-2);
  assert.equal(wind.uniforms.uBeat.value, 0);
  wind.setBeat(NaN);
  assert.equal(wind.uniforms.uBeat.value, 0, 'a broken pulse must not send NaN into every vertex');

  // the materials get the engine's own uniform object, not a copy, so one setBeat moves them all
  const shared = createSharedUniforms({ wind }, null, null);
  assert.equal(shared.uBeat, wind.uniforms.uBeat);
  wind.setBeat(0.5);
  assert.equal(shared.uBeat.value, 0.5);
});

// ---------------------------------------------------------------------------------------------
// tools/theme-tempo.mjs on made-up music whose tempo and key are known

const RATE = 22050;

/** A tick: 60 ms of a 1.2 kHz tone that dies away at once, mixed into `out` at `at` seconds. */
function tick(out, at, level) {
  const first = Math.round(at * RATE);
  for (let i = 0; i < 0.06 * RATE && first + i < out.length; i++) out[first + i] += 0.6 * level * Math.sin((2 * Math.PI * 1200 * i) / RATE) * Math.exp(-i / RATE / 0.012);
}

/** Ticks at `bpm` from `first`, beats alternating `levels` in loudness, for `seconds`. */
function ticks({ bpm, first, seconds = 30, levels = [1, 0.4] }) {
  const out = new Float32Array(seconds * RATE);
  for (let n = 0, t = first; t < seconds - 0.1; n++, t = first + (n * 60) / bpm) tick(out, t, levels[n % levels.length]);
  return out;
}

/** Chords one after another (three harmonics a note), each a list of MIDI notes, `cents` away from A = 440 Hz. */
function chords(progression, { seconds = 24, cents = 0 } = {}) {
  const out = new Float32Array(seconds * RATE);
  const length = 2;
  for (let c = 0; c * length < seconds; c++) {
    for (const midi of progression[c % progression.length]) {
      const hz = 440 * 2 ** ((midi - 69) / 12 + cents / 1200);
      for (let i = 0; i < length * RATE && c * length * RATE + i < out.length; i++) {
        const t = i / RATE;
        const swell = Math.min(1, t / 0.05) * Math.min(1, (length - t) / 0.05);
        out[c * length * RATE + i] += 0.1 * swell * [1, 0.5, 0.33].reduce((sum, w, h) => sum + w * Math.sin(2 * Math.PI * hz * (h + 1) * t), 0);
      }
    }
  }
  return out;
}

const D_MAJOR = [[62, 66, 69], [55, 59, 62, 67], [57, 61, 64, 69], [62, 66, 69]]; // D, G, A, D
const A_MINOR = [[57, 60, 64], [50, 57, 62, 65], [52, 56, 59, 64], [57, 60, 64]]; // Am, Dm, E, Am

test('theme-tempo finds the tempo and the first strong beat of a click track', () => {
  const found = measureRhythm(ticks({ bpm: 104.3, first: 0.347 }));
  near(found.bpm, 104.3, 0.02);
  near(found.beatOffset, 0.347, 0.002);
  assert.ok(found.strongToWeak > 1.3, `the loud beat is ${found.strongToWeak}x the soft one`);
  assert.ok(Math.max(...found.driftMs.map(Math.abs)) < 3, `drift ${found.driftMs}`);
});

test('theme-tempo judges steadiness by the beats, even in a stretch that leans on the off-beats', () => {
  // 100 beats a minute; the first third of the file has loud ticks between the beats, the rest soft ones
  const music = ticks({ bpm: 100, first: 0.2, levels: [1, 0.7] });
  const half = 0.3;
  for (let t = 0.2 + half; t < 30 - 0.1; t += 0.6) tick(music, t, t < 10 ? 1.3 : 0.15);
  const found = measureRhythm(music);
  near(found.bpm, 100, 0.02);
  near(found.beatOffset, 0.2, 0.003);
  assert.ok(Math.max(...found.driftMs.map(Math.abs)) < 3, `drift ${found.driftMs} ms: a stretch must be held to the beat, not to its loudest tick`);
});

test('theme-tempo makes the louder of two neighbouring beats beat 0, even when the soft one comes first', () => {
  const period = 60 / 141.5;
  const found = measureRhythm(ticks({ bpm: 141.5, first: 0.2, levels: [0.4, 1] }));
  near(found.bpm, 141.5, 0.02);
  near(found.beatOffset, 0.2 + period, 0.002); // the second tick is the loud one
  // the music starts three seconds in: the grid reaches back to a strong beat inside the first two beats
  const late = measureRhythm(ticks({ bpm: 72.9, first: 3, levels: [1, 0.4] }));
  near(late.bpm, 72.9, 0.02);
  near(late.beatOffset, 3 % ((2 * 60) / 72.9), 0.002, 'beatOffset');
});

test('theme-tempo takes a stream of eighth notes accented on the beat for the beat, not twice or two thirds of it', () => {
  // 190 ticks a minute with the accents of the real theme (a bar of eight, beats 1 and 3 loudest): a beat of 95.
  // Its three-tick lag correlates better than its two-tick one, so only the liking for about 120 picks 95 over 63.3.
  const found = measureRhythm(ticks({ bpm: 190, first: 0.126, levels: [1, 0.66, 0.53, 0.77, 1, 0.65, 0.78, 0.77] }));
  near(found.bpm, 95, 0.02);
  near(found.beatOffset, 0.126, 0.002);
});

test('theme-tempo reads the key of a chord progression and gives the pentatonic of its major', () => {
  const major = measureKey(chords(D_MAJOR));
  assert.equal(major.name, 'D major');
  near(major.tuningCents, 0, 3);
  assert.ok(major.r - major.runnerUp.r > 0.1, `D major ${major.r} is hardly ahead of ${major.runnerUp.name} ${major.runnerUp.r}`);
  assert.deepEqual(keyNotes(major).map(hz => Math.round(hz)), [587, 659, 740, 880, 988], 'D E F# A B, one octave above middle');
});

test('theme-tempo gives a minor key its relative major, and follows music that is not tuned to 440', () => {
  const minor = measureKey(chords(A_MINOR, { cents: -35 }));
  assert.equal(minor.name, 'A minor');
  near(minor.tuningCents, -35, 4);
  const flat = 2 ** (minor.tuningCents / 1200);
  keyNotes(minor).forEach((hz, i) => near(hz, [523.25, 587.33, 659.26, 783.99, 880][i] * flat, 0.01, 'C D E G A, flattened with the music'));
});

test('bell notes are five rising notes of the major pentatonic, in the register of C5 to A5', () => {
  assert.deepEqual(bellNotes(0), [523.25, 587.33, 659.26, 783.99, 880]);
  for (let tonic = 0; tonic < 12; tonic++) {
    const notes = bellNotes(tonic);
    assert.equal(notes.length, 5);
    notes.forEach((hz, i) => {
      assert.ok(hz > 380 && hz < 1250, `${hz} Hz (tonic ${tonic}) is outside the bell register`);
      if (i) assert.ok(hz > notes[i - 1], 'rising');
    });
    near(12 * Math.log2(notes[2] / notes[0]), 4, 0.01); // 1 -> 3 is a major third
    near(12 * Math.log2(notes[3] / notes[0]), 7, 0.01); // 1 -> 5 is a fifth
  }
});

test('theme.json holds the measured tempo, a strong beat, and a bell key, and points at the theme', () => {
  const theme = JSON.parse(fs.readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(theme).sort(), ['beatOffset', 'bpm', 'key', 'src']);
  assert.ok(theme.bpm >= 60 && theme.bpm <= 180, `${theme.bpm} bpm`);
  assert.ok(theme.beatOffset >= 0 && theme.beatOffset < (2 * 60) / theme.bpm, 'the offset is inside the first two beats');
  assert.equal(theme.key.length, 5);
  assert.deepEqual([...theme.key].sort((a, b) => a - b), theme.key);
  assert.ok(theme.key[0] > 380 && theme.key[4] < 1250, `${theme.key} Hz`);
  // src is read from the page (remake/index.html), as lines.json's are; the repo is the server root, so the extra .. stops there
  const file = new URL(theme.src, 'http://localhost/remake/index.html').pathname;
  assert.ok(file.endsWith('/little-dino-green-valley.mp3'));
  assert.ok(fs.existsSync(new URL(`../..${file}`, import.meta.url)), `${file} is not in the repository`);
});
