import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as beat from '../engine/beat.js';
import { createWind } from '../engine/wind.js';
import { createSharedUniforms } from '../world/forest/materials.js';
import { FOREST, BEAT_SHARE } from '../world/forest/config.js';
import { measureRhythm, measureKey, bellNotes, keyNotes } from '../tools/theme-tempo.mjs';

// beat.js's functions are looked up when a test runs (beat.beatsAt), so a missing export fails that test and not the whole file
const { beatAt, danceAt } = beat;
const near = (a, b, tolerance = 1e-9, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what ? `${what}: ` : ''}${a} is not within ${tolerance} of ${b}`);
const THEME = JSON.parse(fs.readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8')); // the real tempo, 95 beats a minute
const FRAME = 1 / 60; // s: a frame at 60 fps

test('beatAt is deterministic and periodic', () => {
  // 120 beats a minute is a beat every half second, so these times are exact in floating point
  const theme = { bpm: 120, beatOffset: 0.25 };
  assert.deepEqual(beatAt(0.25, theme), { index: 0, phase: 0 }, 'a beat starts at the offset');
  assert.deepEqual(beatAt(0.75, theme), { index: 1, phase: 0 });
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

// ---------------------------------------------------------------------------------------------
// The sway: one beat count for every wave of the forest, folded into four beats (the longest wave, the trees')

test('beatsAt is the beat count since the first strong beat, folded into [0, 4): a pure function of the music\'s time', () => {
  const theme = { bpm: 120, beatOffset: 0.25 }; // a beat every half second: these times are exact in floating point
  assert.equal(beat.FOLD, 4, 'the count folds at the longest wave, the trees\' four beats');
  assert.equal(beat.beatsAt(0.25, theme), 0, 'beat 0 is at the offset');
  assert.equal(beat.beatsAt(0.75, theme), 1);
  near(beat.beatsAt(1.5, theme), 2.5);
  near(beat.beatsAt(2.2, theme), 3.9);
  assert.equal(beat.beatsAt(2.25, theme), 0, 'four beats on it folds back to 0');
  near(beat.beatsAt(2.5, theme), 0.5);
  near(beat.beatsAt(0, theme), 3.5, 1e-9, 'before the first beat it counts back from 4');
  // the same time always gives the same count, and it is beatAt's grid folded into four beats
  const odd = { bpm: 93.7, beatOffset: 0.137 };
  for (let t = 0.011; t < 351.6; t += 3.917) {
    const b = beat.beatsAt(t, odd);
    assert.ok(b >= 0 && b < 4, `${b} at ${t} s is outside [0, 4)`);
    const { index, phase } = beatAt(t, odd);
    near(b, (((index % 4) + 4) % 4) + phase, 1e-9, `the count at ${t} s`);
    assert.equal(beat.beatsAt(t, odd), b);
  }
  for (const t of [NaN, Infinity, -Infinity, undefined]) assert.equal(beat.beatsAt(t, odd), 0, `a time of ${t} must give a still count, not NaN`);
});

test('the waves: the trees crest every fourth beat, the plants every second, the grass every beat, and none halfway between', () => {
  const periods = FOREST.wind.beatPeriods;
  assert.deepEqual(periods, { trees: 4, plants: 2, grass: 1 }, 'the owner\'s choice: the trees once in four beats, the ferns and bushes in two, the grass every beat');
  for (const [band, period] of Object.entries(periods)) {
    assert.equal(beat.FOLD % period, 0, `${band}: the fold is not a whole number of its waves, so it would show`);
    for (let crest = 0; crest < beat.FOLD; crest += period) {
      near(beat.waveAt(crest, period), 1, 1e-12, `${band} on beat ${crest}`);
      near(beat.waveAt(crest + period / 2, period), 0, 1e-12, `${band} halfway after beat ${crest}`);
      near(beat.waveAt(crest + period / 4, period), 0.5, 1e-12, `${band} a quarter of its wave after beat ${crest}`);
      // beat 0 is a strong beat, and so is every second beat from it: the trees and the plants crest on the strong ones
      if (band !== 'grass') assert.equal(crest % 2, 0, `${band} crests on beat ${crest}, a weak beat`);
    }
    for (let b = 0; b < beat.FOLD; b += 0.0371) assert.ok(beat.waveAt(b, period) >= 0 && beat.waveAt(b, period) <= 1, `${band} at ${b}`);
  }
});

test('the fold is invisible: across it every wave keeps its place and its speed', () => {
  const periods = Object.values(FOREST.wind.beatPeriods);
  const beatLength = 60 / THEME.bpm;
  const wave = (t, period) => beat.waveAt(beat.beatsAt(t, THEME), period);
  for (let k = 4; k <= 556; k += 4) { // every fold of the theme's 351.6 s, where the folded count drops from 4 back to 0
    const fold = THEME.beatOffset + k * beatLength;
    for (const dt of [-FRAME, -1e-3, -1e-6, 0, 1e-6, 1e-3, FRAME]) {
      const t = fold + dt;
      const count = ((t - THEME.beatOffset) * THEME.bpm) / 60; // unfolded
      for (const period of periods) near(wave(t, period), 0.5 + 0.5 * Math.cos((2 * Math.PI * count) / period), 1e-9, `a ${period}-beat wave ${dt} s from the fold at beat ${k}`);
    }
    // a fold is a crest of every wave: it comes up to it and goes down from it at the same (vanishing) speed
    const h = 1e-4;
    for (const period of periods) {
      const into = (wave(fold, period) - wave(fold - h, period)) / h;
      const out = (wave(fold + h, period) - wave(fold, period)) / h;
      assert.ok(Math.abs(into) < 1e-2 && Math.abs(out) < 1e-2, `a ${period}-beat wave moves at ${into} and then ${out} a second across the fold at beat ${k}`);
    }
  }
});

test('at 60 fps no wave moves more than a tenth of its range from one frame to the next, nor the beat a 15 m tree top a centimetre', () => {
  const periods = FOREST.wind.beatPeriods;
  const spacing = FOREST.wind.rippleSpacing;
  assert.equal(spacing, 5, 'the grass\'s crests are 5 m apart along the wind');
  const top = ((FOREST.wind.maxSwayDeg * Math.PI) / 180) * 15; // m: what a 15 m tree top sways at full wind (species.js: bendAt)
  const worst = { trees: 0, plants: 0, grass: 0 };
  let worstTop = 0, folds = 0, beats = 0;
  for (const offset of [0, 0.0041, 0.0097]) { // frames at three phases against the beat grid
    const start = THEME.beatOffset - 0.4321 + offset; // from before beat 0, so the frames cross every beat and every fold
    for (let i = 0; i < 60 * 40; i++) { // 40 s: 63 beats, 15 folds
      const t0 = start + i * FRAME, t1 = t0 + FRAME;
      const b0 = beat.beatsAt(t0, THEME), b1 = beat.beatsAt(t1, THEME);
      if (b1 < b0) folds++;
      if (Math.floor(b1) !== Math.floor(b0)) beats++;
      for (const [band, period] of Object.entries(periods)) worst[band] = Math.max(worst[band], Math.abs(beat.waveAt(b1, period) - beat.waveAt(b0, period)));
      // the grass's crests run down the wind: at any spot along it the wave moves as fast
      for (const along of [-37.3, -4.2, 0, 2.5, 12.9]) {
        worst.grass = Math.max(worst.grass, Math.abs(beat.waveAt(b1 - along / spacing, periods.grass) - beat.waveAt(b0 - along / spacing, periods.grass)));
      }
      worstTop = Math.max(worstTop, BEAT_SHARE * top * Math.abs(beat.waveAt(b1, periods.trees) - beat.waveAt(b0, periods.trees)));
    }
  }
  assert.ok(folds >= 45 && beats >= 189, `the frames crossed only ${folds} folds and ${beats} beats`);
  for (const [band, moved] of Object.entries(worst)) assert.ok(moved <= 0.1, `the ${band}' wave moves ${moved.toFixed(3)} of its range in a frame`);
  // (a tree fern's frond mixes the trees' wave and the plants' and moves no faster than the faster of them)
  assert.ok(worstTop < 0.01, `the beat moves a 15 m tree top ${(worstTop * 100).toFixed(2)} cm in a frame`);
});

test('the configured sway stays within 3 degrees with the beat added', () => {
  // These two numbers bound what bendAt bakes (trunks, crowns, needles, tree-fern trunks). Fronds, stems and stalks have weights of
  // their own, so forest-sway.test.mjs builds every kind and holds what it baked to the same rule.
  const { maxSwayDeg, beatAmplitudeDeg } = FOREST.wind;
  assert.ok(beatAmplitudeDeg > 0, 'the beat is part of the sway: a limit met by switching it off is not met');
  assert.ok(maxSwayDeg + beatAmplitudeDeg <= 3, `${maxSwayDeg} + ${beatAmplitudeDeg} degrees is over the style guide's 3`);
});

test('setBeats feeds one shared uBeats uniform, the beat count held to [0, 4) or NO_BEAT, and nothing is left of the pulse', () => {
  const wind = createWind();
  assert.equal(typeof wind.setBeats, 'function', 'the wind has no setBeats');
  assert.equal(beat.NO_BEAT, -1, 'no beat is a count below the fold');
  assert.equal(wind.uniforms.uBeats.value, beat.NO_BEAT, 'until a beat is set there is none: every wave holds its middle');
  wind.setBeats(2.75);
  assert.equal(wind.uniforms.uBeats.value, 2.75);
  wind.setBeats(6.5);
  assert.equal(wind.uniforms.uBeats.value, 2.5, 'a count past the fold is folded');
  wind.setBeats(0);
  assert.equal(wind.uniforms.uBeats.value, 0, 'the first beat is a beat');
  // A count below 0 is no beat (main.js only ever gives followBeat's count, folded into [0, 4)): NO_BEAT itself must mean
  // "hold the middle", as the shader reads uBeats < 0, not fold to 3 (a crest).
  for (const below of [beat.NO_BEAT, -0.25, -7]) {
    wind.setBeats(below);
    assert.equal(wind.uniforms.uBeats.value, beat.NO_BEAT, `a count of ${below} is no beat`);
  }
  for (const broken of [NaN, Infinity, undefined]) {
    wind.setBeats(broken);
    assert.equal(wind.uniforms.uBeats.value, beat.NO_BEAT, `a count of ${broken} must not send NaN into every vertex: it is no beat`);
  }
  assert.equal(wind.uniforms.uBeat, undefined, 'the pulse\'s uniform is gone');
  assert.equal(wind.setBeat, undefined, 'and so is its setter');

  // the materials get the engine's own uniform object, not a copy, so one setBeats moves them all
  const shared = createSharedUniforms({ wind }, null, null);
  assert.equal(shared.uBeats, wind.uniforms.uBeats);
  assert.ok(!('uBeat' in shared), 'the materials are handed no pulse');
  wind.setBeats(1.5);
  assert.equal(shared.uBeats.value, 1.5);
});

test('every frame main.js follows the music\'s beat and feeds the follower\'s count to the waves and the dance; without a theme it feeds nothing', () => {
  const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{ beatsAt, followBeat, danceOf \} from '\.\/engine\/beat\.js';/);
  // the music's grid, followed without a jump, and snapped to exactly while seeking or frozen (captures)
  assert.match(main, /followed = followBeat\(followed, beatsAt\(musicTime\(\), theme\), dt, theme, stage\.seeking \|\| clock\.frozen\);/);
  assert.match(main, /wind\.setBeats\(followed\.beats\);/);
  assert.match(main, /wind\.setDance\(danceOf\(followed\.beats, theme\)\);/);
  // only with a theme: without theme.json the count stays NO_BEAT, and the forest holds its waves' middle
  assert.match(main, /if \(theme\) \{\s*followed = followBeat\(/);
  assert.doesNotMatch(main, /setBeat\(|\.pulse\b|danceAt\(/, 'nothing in the frame reads the pulse, or the playhead\'s own dance');
});

// ---------------------------------------------------------------------------------------------
// The strong beats' dance: flowers nod and mushrooms hop on the even beats of the grid, one every two beats

const DANCE_THEME = { bpm: 120, beatOffset: 0.25 }; // strong beats at 0.25, 1.25, 2.25 s...; weak ones between, at 0.75, 1.75...
const STRONG = after => 0.25 + after; // the time `after` seconds after the first strong beat
const dance = time => danceAt(time, DANCE_THEME);
// The dance's timing (beat.js), in seconds:
const LEAD = 0.25; // a flower head eases down over this long before a strong beat...
const SETTLE = 0.45; // ...and up again over this long after it
const AIR = 0.35; // a mushroom is in the air this long before it lands on the beat...
const RISE = 0.125; // ...squashes over this long after landing...
const LAND = 0.3; // ...and has sprung back this long after the beat
const STRETCH = 0.4; // in the air it is stretched by up to this share of what landing squashes it
// The span each part of the dance uses, which the rule of a fifth a frame is measured against: the squash runs from -STRETCH to 1.
const SPAN = { nod: 1, hop: 1, squash: 1 + STRETCH };
const smooth = x => x * x * (3 - 2 * x);
/** How fast `key` of the dance moves at `time`, per second (a central difference). */
const speed = (key, time, h = 1e-6) => (dance(time + h)[key] - dance(time - h)[key]) / (2 * h);

test('the dance repeats every two beats, the same each strong beat, and is a pure function of the music\'s time', () => {
  for (let t = 0.013; t < 3; t += 0.071) {
    const a = dance(t), b = dance(t + 1), c = dance(t + 7);
    for (const key of ['nod', 'hop', 'squash']) {
      near(a[key], b[key], 1e-9, `${key} a strong beat later at ${t}`);
      near(a[key], c[key], 1e-9, `${key} seven strong beats later at ${t}`);
    }
  }
  assert.deepEqual(dance(0.4321), dance(0.4321));
  near(dance(-0.6).nod, dance(0.4).nod, 1e-9, 'before the first beat the grid runs back the same way');
  // the real theme: 95 beats a minute, a strong beat every 1.2632 s
  const theme = { bpm: 95, beatOffset: 0.131 };
  near(danceAt(0.131, theme).nod, 1);
  near(danceAt(0.131 + (3 * 120) / 95, theme).nod, 1, 1e-9, 'three strong beats on');
});

test('a flower head is fully down on the strong beat: it eases down over the quarter second before and up over the 0.45 s after', () => {
  assert.equal(dance(STRONG(0)).nod, 1, 'the head is fully down on the beat');
  for (const before of [0.2, 0.125, 0.05, 0.01]) near(dance(STRONG(1 - before)).nod, smooth(1 - before / LEAD), 1e-9, `${before} s before the beat`);
  for (const after of [0.01, 0.1, 0.225, 0.4]) near(dance(STRONG(after)).nod, smooth(1 - after / SETTLE), 1e-9, `${after} s after the beat`);
  // down into the beat and up out of it, steadily
  let previous = 0;
  for (let t = 1 - LEAD + 0.01; t < 1 + 1e-9; t += 0.01) {
    const nod = dance(STRONG(t)).nod;
    assert.ok(nod > previous, `the head does not go steadily down at ${(t - 1).toFixed(2)} s: ${nod} after ${previous}`);
    previous = nod;
  }
  for (let after = 0.01; after < SETTLE - 1e-9; after += 0.01) {
    const nod = dance(STRONG(after)).nod;
    assert.ok(nod < previous && nod > 0, `the head does not come steadily up at ${after.toFixed(2)} s: ${nod} after ${previous}`);
    previous = nod;
  }
  near(dance(STRONG(SETTLE)).nod, 0, 1e-12, 'it is up 0.45 s after the beat');
  near(dance(STRONG(1 - LEAD)).nod, 0, 1e-12, 'and starts down a quarter second before the next');
  assert.equal(dance(STRONG(0.75)).nod, 0, 'on the weak beat in between the heads are up');
  // no jolt anywhere: it starts and ends each move at rest, and is at rest on the beat itself
  for (const at of [-LEAD, 0, SETTLE]) assert.ok(Math.abs(speed('nod', STRONG(at < 0 ? 1 + at : at))) < 1e-2, `the head moves at ${speed('nod', STRONG(at < 0 ? 1 + at : at))} a second ${at} s from the beat`);
  for (let t = 0; t < 4; t += 0.0173) assert.ok(dance(t).nod >= 0 && dance(t).nod <= 1);
});

test('a mushroom hops on sin² over the 0.35 s before the strong beat, leaves and lands at rest, and squashes after landing', () => {
  assert.equal(dance(STRONG(0)).hop, 0, 'on the ground on the beat');
  near(dance(STRONG(1 - AIR)).hop, 0, 1e-9, 'it left the ground one flight before');
  near(dance(STRONG(1 - AIR / 2)).hop, 1, 1e-9, 'at the top of the hop half a flight before the beat');
  for (const u of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) near(dance(STRONG(1 - u * AIR)).hop, Math.sin(Math.PI * u) ** 2, 1e-9, `the hop with ${u} of the flight to go`);
  assert.equal(dance(STRONG(1 - AIR - 0.01)).hop, 0, 'on the ground before it takes off');
  assert.equal(dance(STRONG(0.01)).hop, 0, 'and after the beat');
  assert.equal(dance(STRONG(0.6)).hop, 0);
  for (const at of [1 - AIR, 1]) assert.ok(Math.abs(speed('hop', STRONG(at))) < 1e-2, `the mushroom leaves or meets the ground at ${speed('hop', STRONG(at))} of its hop a second`);
  // the squash: nothing on the beat, as it lands; flattest 0.125 s later; sprung back 0.3 s after the beat
  assert.equal(dance(STRONG(0)).squash, 0, 'it has only just landed on the beat');
  for (const x of [0.25, 0.5, 0.75]) near(dance(STRONG(x * RISE)).squash, smooth(x), 1e-9, `the squash ${x} of the way down`);
  near(dance(STRONG(RISE)).squash, 1, 1e-9, 'flattest 0.125 s after landing');
  near(dance(STRONG((RISE + LAND) / 2)).squash, 0.5, 1e-9, 'half sprung back halfway to 0.3 s');
  let previous = 1;
  for (let after = RISE + 0.01; after < LAND - 1e-9; after += 0.01) {
    const squash = dance(STRONG(after)).squash;
    assert.ok(squash < previous && squash > 0, `it does not spring back steadily at ${after.toFixed(2)} s: ${squash}`);
    previous = squash;
  }
  near(dance(STRONG(LAND)).squash, 0, 1e-9, 'sprung back 0.3 s after the beat');
  assert.equal(dance(STRONG(0.5)).squash, 0, 'standing, it is not squashed');
  for (const at of [RISE, LAND]) assert.ok(Math.abs(speed('squash', STRONG(at))) < 1e-2, `the squash turns at ${speed('squash', STRONG(at))} a second ${at} s after the beat`);
  // in the air it is a little stretched, and the stretch is gone as it lands, where the squash starts
  for (const u of [0.1, 0.5, 0.9]) near(dance(STRONG(1 - u * AIR)).squash, -STRETCH * Math.sin(Math.PI * u), 1e-9, `stretched with ${u} of the flight to go`);
  near(dance(STRONG(1 - 1e-9)).squash, 0, 1e-6, 'nothing just before landing');
  for (let t = 0; t < 4; t += 0.0131) {
    const d = dance(t);
    assert.ok(d.hop >= 0 && d.hop <= 1 && d.squash >= -1 && d.squash <= 1, `${JSON.stringify(d)} at ${t}`);
  }
});

test('at 60 fps no part of the dance moves more than a fifth of the span it uses from one frame to the next', () => {
  // the span each part actually uses: the nod and the hop 0 to 1, the squash -STRETCH (stretched in the air) to 1 (flattest)
  let lowest = Infinity, highest = -Infinity;
  for (let t = 0; t < 4; t += 0.0007) { const s = dance(t).squash; lowest = Math.min(lowest, s); highest = Math.max(highest, s); }
  near(lowest, -STRETCH, 1e-4, 'the squash\'s low end');
  near(highest, 1, 1e-4, 'its high end');
  const worst = { nod: 0, hop: 0, squash: 0 };
  for (const offset of [0, 0.0029, 0.0061, 0.0113]) { // frames at four phases against the beat
    const start = THEME.beatOffset - 0.71 + offset;
    for (let i = 0; i < 60 * 30; i++) { // 30 s: 24 strong beats of the real theme
      const a = danceAt(start + i * FRAME, THEME), b = danceAt(start + (i + 1) * FRAME, THEME);
      for (const key of Object.keys(SPAN)) worst[key] = Math.max(worst[key], Math.abs(b[key] - a[key]) / SPAN[key]);
    }
  }
  for (const [key, moved] of Object.entries(worst)) assert.ok(moved <= 0.2, `the ${key} moves ${moved.toFixed(3)} of its span in a frame`);
});

test('nothing dances on a weak beat, and a time that is not a number dances nothing', () => {
  // the weak beats are at 0.75, 1.75...: half a cycle from the strong ones, longer than a flight, a landing or a nod away
  for (const weak of [0.75, 1.75, 2.75, 10.75]) {
    for (const t of [weak, weak + 0.05, weak + 0.1]) assert.deepEqual(dance(t), { nod: 0, hop: 0, squash: 0 }, `at ${t}`);
    assert.equal(dance(weak - 0.05).hop + dance(weak - 0.05).squash, 0, 'a mushroom is on the ground a little before it too');
  }
  assert.deepEqual(dance(NaN), { nod: 0, hop: 0, squash: 0 });
  assert.deepEqual(dance(Infinity), { nod: 0, hop: 0, squash: 0 });
});

// ---------------------------------------------------------------------------------------------
// The forest's beat follows the music's grid without a jump (followBeat). The playhead jumps at the first touch, from the clock's time
// to the theme's start, and at every loop of the theme (351.6 s, 556.7 beats, so the grid restarts mid-bar); the follower eases onto
// the grid instead of jumping with it, and snaps to it while seeking, so captures stay exact.

const LOOP = 351.6; // s: the theme's length, which music.js folds its playhead by
const ON_GRID = 0.02; // beats (13 ms at 95 beats a minute, under a frame): on the grid
/** How far apart two beat counts are, the short way round the fold. */
const apart = (a, b) => Math.abs(((((a - b) % 4) + 6) % 4) - 2);
/** The music's playhead (music.js: position): the clock's time until the theme first sounds at `touch`, then the time since, folded by its length. */
const playheadAt = (time, touch) => (time < touch ? time : (time - touch) % LOOP);

test('danceOf is the dance of a beat count: danceAt\'s, the same every two beats, so the fold into four never shows', () => {
  for (let t = 0.013; t < 9; t += 0.0371) {
    const count = ((t - THEME.beatOffset) * THEME.bpm) / 60;
    const byTime = danceAt(t, THEME), byCount = beat.danceOf(count, THEME), byFolded = beat.danceOf(beat.beatsAt(t, THEME), THEME);
    for (const key of ['nod', 'hop', 'squash']) {
      near(byCount[key], byTime[key], 1e-9, `${key} of the count at ${t} s`);
      near(byFolded[key], byTime[key], 1e-9, `${key} of the folded count at ${t} s`);
    }
  }
  assert.deepEqual(beat.danceOf(NaN, THEME), { nod: 0, hop: 0, squash: 0 });
});

test('the follower starts on the grid, runs at the tempo with it, and lands on it exactly whenever it snaps (seeking, a frozen capture)', () => {
  let followed = beat.followBeat(null, 2.345, FRAME, THEME);
  assert.equal(followed.beats, 2.345, 'its first frame is the grid');
  // with no jump it is the grid, frame after frame, across the folds
  followed = beat.followBeat(null, beat.beatsAt(3.21, THEME), FRAME, THEME);
  for (let i = 1; i < 60 * 20; i++) {
    const grid = beat.beatsAt(3.21 + i * FRAME, THEME);
    followed = beat.followBeat(followed, grid, FRAME, THEME);
    assert.ok(apart(followed.beats, grid) < 1e-9, `frame ${i}: ${followed.beats} against the grid's ${grid}`);
    assert.ok(followed.beats >= 0 && followed.beats < 4);
  }
  // the scene's seek replay (1/30 s steps, snapping) through a jump of the playhead: every step is the grid exactly
  for (let i = 0, time = 0; i < 90; i++) {
    time += 1 / 30;
    const grid = beat.beatsAt(i < 40 ? time : time - 1.7, THEME);
    followed = beat.followBeat(followed, grid, 1 / 30, THEME, true);
    assert.equal(followed.beats, grid, `seek step ${i}`);
  }
  // a frozen capture's frames (dt 0) snap too; in play a held clock (dt 0, the book is open) holds the forest where it is
  const easing = beat.followBeat(beat.followBeat(null, 1, FRAME, THEME), 3, FRAME, THEME); // two beats off: easing back
  assert.ok(apart(easing.beats, 3) > 0.5, 'a jump is not taken at once');
  assert.equal(beat.followBeat(easing, 3, 0, THEME, true).beats, 3, 'a capture lands on the grid');
  assert.deepEqual(beat.followBeat(easing, 3, 0, THEME), easing, 'a held clock holds the count');
});

/**
 * The follower at 60 fps from `from` to `to` s of the clock (snapped at `from`, where it is steady), the theme first sounding at
 * `touch`: the worst per-frame change of each wave (the grass's at five spots along the wind) and of each part of the dance (as a
 * share of the span it uses), and for each jump of the playhead how long the forest's beat was off the grid after it.
 */
function followAt60({ touch, from, to }) {
  const periods = FOREST.wind.beatPeriods, spacing = FOREST.wind.rippleSpacing;
  const worst = { trees: 0, plants: 0, grass: 0, nod: 0, hop: 0, squash: 0 };
  const jumps = [];
  let followed = null, last = null;
  for (let i = 0; from + i * FRAME <= to; i++) {
    const time = from + i * FRAME;
    const playhead = playheadAt(time, touch);
    if (last && Math.abs(playhead - last.playhead - FRAME) > 1e-6) jumps.push({ at: time, off: 0 });
    const grid = beat.beatsAt(playhead, THEME);
    followed = beat.followBeat(followed, grid, FRAME, THEME, !last);
    const b = followed.beats, d = beat.danceOf(b, THEME);
    assert.ok(b >= 0 && b < 4, `a count of ${b}`);
    if (last) {
      for (const band of ['trees', 'plants']) worst[band] = Math.max(worst[band], Math.abs(beat.waveAt(b, periods[band]) - beat.waveAt(last.b, periods[band])));
      for (const along of [-7.3, 0, 1.9, 3.3, 11.1]) {
        worst.grass = Math.max(worst.grass, Math.abs(beat.waveAt(b - along / spacing, periods.grass) - beat.waveAt(last.b - along / spacing, periods.grass)));
      }
      for (const key of Object.keys(SPAN)) worst[key] = Math.max(worst[key], Math.abs(d[key] - last.d[key]) / SPAN[key]);
    }
    const jump = jumps.at(-1);
    if (jump && apart(b, grid) > ON_GRID) jump.off = time - jump.at + FRAME;
    last = { playhead, b, d };
  }
  return { worst, jumps };
}

test('after the first touch and the theme\'s loop the forest\'s beat is back on the grid within about a beat, breaking no per-frame rule on the way', () => {
  const beatLength = 60 / THEME.bpm;
  const worst = { trees: 0, plants: 0, grass: 0, nod: 0, hop: 0, squash: 0 };
  const touchJumps = [], loopJumps = [];
  for (let k = 0; k < 48; k++) {
    const touch = 5 + (k / 48) * 4 * beatLength; // the child touches anywhere in four beats, so the first jump is any jump there is
    const start = followAt60({ touch, from: touch - 2, to: touch + 4 });
    const loop = followAt60({ touch, from: touch + LOOP - 2, to: touch + LOOP + 4 });
    assert.equal(start.jumps.length, 1, 'one jump at the first touch');
    assert.equal(loop.jumps.length, 1, 'and one at the loop');
    touchJumps.push(start.jumps[0].off / beatLength);
    loopJumps.push(loop.jumps[0].off / beatLength);
    for (const run of [start, loop]) for (const key of Object.keys(worst)) worst[key] = Math.max(worst[key], run.worst[key]);
  }
  for (const band of ['trees', 'plants', 'grass']) assert.ok(worst[band] <= 0.1, `the ${band}' wave moves ${worst[band].toFixed(4)} of its range in a frame`);
  for (const key of Object.keys(SPAN)) assert.ok(worst[key] <= 0.2, `the ${key} moves ${worst[key].toFixed(3)} of its span in a frame`);
  // the loop's jump (the grid restarts 0.7 of a beat back) is gone within a beat
  assert.ok(Math.max(...loopJumps) <= 1, `the loop's jump takes ${Math.max(...loopJumps).toFixed(2)} beats to ease out`);
  // the first touch's can be anything: under the rule of a tenth a frame the count may run at most 1.2 times the tempo (the grass's
  // wave is one beat long), so it gains on the grid slowly and drops back fast, and a grid about a third of a beat ahead takes longest,
  // as long either way round: up to two beats, about one on the whole
  const slowest = Math.max(...touchJumps), mean = touchJumps.reduce((a, b) => a + b, 0) / touchJumps.length;
  assert.ok(slowest <= 2.1, `the first touch's jump takes up to ${slowest.toFixed(2)} beats to ease out`);
  assert.ok(mean <= 1.25, `the first touch's jump takes ${mean.toFixed(2)} beats to ease out on the whole`);
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
  // src is read against theme.json itself (engine/audio/music.js fetches it that way): the music is the compressed copy beside it
  assert.equal(theme.src, 'theme.mp3');
  const file = new URL(theme.src, 'http://localhost/remake/assets/audio/theme.json').pathname;
  assert.equal(file, '/remake/assets/audio/theme.mp3');
  assert.equal(new URL(theme.src, 'http://localhost/inside/remake/assets/audio/theme.json').pathname, '/inside/remake/assets/audio/theme.mp3', 'wherever theme.json is served from');
  assert.ok(fs.existsSync(new URL(`../..${file}`, import.meta.url)), `${file} is not in the repository`);
});

/** What an MP3 file says about itself: its first frame's header (MPEG-1 layer III) and the frame count the encoder wrote in its Xing/Info frame. */
function mp3Info(url) {
  const bytes = fs.readFileSync(url);
  let at = 0;
  if (bytes.toString('latin1', 0, 3) === 'ID3') at = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]); // an ID3v2 tag comes first
  assert.ok(bytes[at] === 0xff && (bytes[at + 1] & 0xfe) === 0xfa, 'the file starts with an MPEG-1 layer III frame');
  const bitrate = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bytes[at + 2] >> 4];
  const sampleRate = [44100, 48000, 32000][(bytes[at + 2] >> 2) & 3];
  const channels = bytes[at + 3] >> 6 === 3 ? 1 : 2;
  const tag = at + 4 + (channels === 1 ? 17 : 32) + ((bytes[at + 1] & 1) === 0 ? 2 : 0); // after the side information (and a CRC, if there is one)
  const hasCount = ['Xing', 'Info'].includes(bytes.toString('latin1', tag, tag + 4)) && (bytes[tag + 7] & 1) === 1;
  const frames = hasCount ? bytes.readUInt32BE(tag + 8) : 0;
  return { size: bytes.length, bitrate, sampleRate, channels, seconds: frames ? (frames * 1152) / sampleRate : (bytes.length * 8) / (bitrate * 1000) };
}

test('the music that plays is a compressed copy of the game\'s theme: an MP3 at 96 kbps, stereo, 44.1 kHz, as long as the original', () => {
  const copy = mp3Info(new URL('../assets/audio/theme.mp3', import.meta.url));
  const original = mp3Info(new URL('../../dist/assets/audio/little-dino-green-valley.mp3', import.meta.url));
  assert.deepEqual({ bitrate: copy.bitrate, sampleRate: copy.sampleRate, channels: copy.channels }, { bitrate: 96, sampleRate: 44100, channels: 2 });
  assert.ok(copy.size < 0.7 * original.size && copy.size > 3e6, `${copy.size} bytes against ${original.size}`);
  near(copy.seconds, original.seconds, 0.05, 'the copy is as long as the original, so the beat grid (measured on the copy) holds for the whole file');
  near(copy.seconds, 351.6, 0.1, 'and 351.6 s is what music.js folds its playhead by');
});
