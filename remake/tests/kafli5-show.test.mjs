// The show round chapter 5's music video (chapters/kafli5-show.js and its score, kafli5-show-score.js; the tools in engine/show/):
// the fireflies, the dusk and the records' looks, the splashes, the countdown's numbers, the glowing notes, the beat in the light
// and the firefly fireworks. All of it is a function of the dance beat (kafli5-video.js) or of the set's own, so most of this is
// plain arithmetic; the last tests draw it into a small world and play the chapter into the middle of the set and leave.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BURSTS, PUFFS, COUNTS, COUNT, countAt, WORDS, WORD, wordAt, DUSK, duskAt, CAP, capAt, FLASHES, LIFT, liftAt, NOTES, NOTE, noteAt, notePoint, SPLASHES, SPLASH, SPLASH_AIR,
  dropAt, splashRingAt, createFireflies, FIREFLIES, outAt, gatherAt, pulseAt, energyOf, beatRingsAt, BEAT_RING, padOf, BEAT_SECONDS,
  LOOK, LOOKS, LOOK_CUES, lookAt, lookMixAt, FIREWORK, FIREWORKS, GROUP_COLOURS, sparkAt, inShot,
} from '../chapters/kafli5-show-score.js';
import { createShow } from '../chapters/kafli5-show.js';
import { createDusk, DUSK as ENGINE_DUSK } from '../engine/show/dusk.js';
import { createBigNumber, LETTERS, ROOM } from '../engine/show/big-number.js';
import { BENDS, CAMERA, danceBeatAt, sectionAt } from '../chapters/kafli5-video.js';
import { SONG } from '../chapters/kafli5-set.js';
import { CHOIR, GROUPS, GROUP_SHOTS, SHOTS, WADE, seatsOf } from '../chapters/kafli5-pool.js';
import { FAR_POOL } from '../chapters/kafli4-route.js';
import * as kafli5 from '../chapters/kafli5.js';
import { playUnattended } from './chapter-harness.mjs';
import { FakeDocument } from './fake-dom.mjs';

const SET = SONG.set;
const part = id => SET.sections.find(section => section.id === id);
const FRAME = (1 / 30) / BEAT_SECONDS; // a frame of a tablet at 30 a second, in beats
const HER = WADE.at;
const fromHer = p => Math.hypot(p.x - HER[0], p.z - HER[1]);
/** Every frame of the set as the scene plays it: [{ setBeat, beat, frozen, rewinding, section }]. */
const framesOfTheSet = (() => {
  const frames = [];
  for (let setBeat = 0; setBeat <= SET.endBeat + 5; setBeat += FRAME) frames.push({ setBeat, ...danceBeatAt(setBeat), section: sectionAt(setBeat) });
  return frames;
})();

test('the bursts are the two big drops, and the other peak is a puff', () => {
  assert.deepEqual(BURSTS, [part('drop').startBeat, part('lastchorus').startBeat]);
  assert.deepEqual(PUFFS, [danceBeatAt(part('anthem').startBeat).beat], 'the anthem\'s peak, at the dance beat it is heard on');
  assert.equal(danceBeatAt(part('redrop').startBeat).beat, BURSTS[0], 'the drop after the rewind is the first burst again, by the clock alone');
});

test('the countdown: each number on its beat, big and clear, and gone well before the next', () => {
  assert.deepEqual(COUNTS.map(count => count.n), [5, 4, 3, 2, 1]);
  COUNTS.forEach(({ beat, n }, k) => {
    assert.equal(SET.cues.find(cue => cue.kind === 'count' && cue.n === n).beat, beat);
    assert.equal(countAt(beat - 0.01)?.n ?? null, k ? null : null, `nothing just before ${n}`);
    const on = countAt(beat + 0.6);
    assert.deepEqual([on.n, on.scale, on.opacity], [n, 1, 1], `${n} stands whole in the middle of its time`);
    assert.ok(countAt(beat).scale < 0.5 && countAt(beat).opacity === 0, 'it pops in from small');
    assert.ok(countAt(beat + COUNT.pop * 0.7).scale > 1, 'a little past its size on the way');
    assert.equal(countAt(beat + COUNT.on), null);
    const next = COUNTS[k + 1]?.beat ?? part('drop').startBeat;
    assert.ok(next - (beat + COUNT.on) >= 0.6, 'the animals are seen between two numbers');
    assert.ok(COUNT.on * BEAT_SECONDS >= 0.6, 'long enough for a child to read a digit');
  });
  for (const { beat, frozen } of framesOfTheSet) {
    const count = countAt(beat);
    assert.ok(!count || (beat >= COUNTS[0].beat && beat < COUNTS.at(-1).beat + COUNT.on), 'no number outside the countdown, the rewind included');
    assert.ok(!frozen || !count);
  }
  // with less motion: half the size, and only a fade
  for (let age = 0; age < COUNT.on; age += 0.05) {
    const { scale, opacity } = countAt(COUNTS[0].beat + age, { reduced: true });
    assert.equal(scale, 0.5);
    assert.ok(opacity >= 0 && opacity <= 1);
  }
  // the count grows with every number (the owner's yes of 2026-11-18): from about 40 % of the screen's height to about 85 %
  const sizes = COUNTS.map(({ beat }) => countAt(beat + 0.6).height);
  sizes.slice(1).forEach((size, k) => assert.ok(size >= sizes[k] * 1.15, `${COUNTS[k + 1].n} is clearly bigger than ${COUNTS[k].n} (${sizes[k]} to ${size})`));
  assert.ok(Math.abs(sizes[0] - 0.4) < 0.05 && Math.abs(sizes.at(-1) - 0.85) < 0.06, `from ${sizes[0]} to ${sizes.at(-1)} of the screen's height`);
  for (const { beat } of COUNTS) {
    const { height, width } = countAt(beat + 0.6);
    assert.ok(width > 0 && width <= height, 'and held by the width on a screen held upright');
    assert.deepEqual([countAt(beat + 0.1).height, countAt(beat + 1.2).height], [height, height], 'a number is one size all its time: only its scale moves');
  }
});

// The screens a word and a number must fit: a tablet held flat and one held upright (CSS px).
const SCREENS = [[1280, 800], [820, 1180]];
const DIGIT_WIDE = LETTERS.digit + 2 * LETTERS.outline;
const CAPTION_TOP = 113; // px from the screen's bottom to the caption's top edge (style.css .caption, one line of text)
const HUD = { wide: 320, high: 76 }; // px: the book and the stars in the screen's top right corner (seen in the stills at both sizes)
/** Where the ink of `spec` (countAt's or wordAt's, with its text's width in letter sizes, outline and all, and whether it has an accent) is on a screen. */
function inkOf(spec, { wide, accent = false }, [w, h]) {
  const font = Math.min(spec.height * h, spec.width * w);
  const middle = (h - ROOM) * (spec.at ?? 0.5) - (spec.lift ?? 0) * font; // the letters' box in what the caption leaves free: its middle, or `at` of the way down
  const up = (LETTERS.cap - LETTERS.line + (accent ? LETTERS.accent : 0) + LETTERS.outline) * font * spec.scale; // the line is LETTERS.line under the box's middle
  const down = (LETTERS.line + LETTERS.outline) * font * spec.scale;
  const shoulder = middle - (LETTERS.cap - LETTERS.line + LETTERS.outline) * font * spec.scale; // the capitals' top: an accent stands over a letter inside the word, not at its end
  return { font, top: middle - up, shoulder, bottom: middle + down, width: wide * font * spec.scale, capital: LETTERS.cap * font * spec.scale };
}

test('the big words: NÚ! on the drops, AFTUR! in the rewind, STOPP! in the freeze and HOPP! twice, each as she shouts it and for about a second', () => {
  const line = id => SET.lines.find(entry => entry.id === id);
  assert.deepEqual(WORDS.map(word => [word.text, word.beat]), [
    ['NÚ!', line('now').beat], ['AFTUR!', line('aftur').beat], ['NÚ!', part('redrop').startBeat], ['STOPP!', line('stopp').beat],
    ['HOPP!', line('hopp').beat], ['HOPP!', line('hopp-2').beat],
  ], 'these and no others: no JÁ! (the gap is the child\'s), no DANSA!, no HÆRRA!');
  assert.deepEqual([line('now').beat, part('redrop').startBeat], [part('drop').startBeat, BENDS.rewind.to], 'the two drops');
  WORDS.forEach((word, k) => {
    const { beat, text, on } = word;
    assert.equal(wordAt(beat - 0.01)?.text ?? null, k && WORDS[k - 1].beat + WORDS[k - 1].on > beat - 0.01 ? WORDS[k - 1].text : null, `${text} is not there before it is shouted`);
    // in fast, a little past its size and back
    assert.ok(wordAt(beat).scale < 0.5 && wordAt(beat).opacity === 0, `${text} pops in from small`);
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => wordAt(beat + (i / 40) * WORD.pop).scale));
    assert.ok(peak > 1.02 && peak < 1.12, `${text}: a small overshoot (${peak.toFixed(3)})`);
    assert.ok(WORD.pop * BEAT_SECONDS < 0.2, 'in under a fifth of a second');
    // it stands whole, long enough for an early reader, and is gone soon after
    const whole = [];
    for (let age = 0; age < on; age += FRAME / 4) { const now = wordAt(beat + age); if (now.opacity === 1 && Math.abs(now.scale - 1) < 0.07) whole.push(age); }
    const stands = (whole.at(-1) - whole[0]) * BEAT_SECONDS;
    assert.ok(stands >= 0.7 && on * BEAT_SECONDS >= 0.9 && on * BEAT_SECONDS <= 1.25, `${text} stands ${stands.toFixed(2)} s of its ${(on * BEAT_SECONDS).toFixed(2)} s`);
    const after = wordAt(beat + on);
    assert.ok(!after || (WORDS[k + 1].beat === beat + on && after.scale < 0.5), `${text} is gone after its time (or the next word pops in)`);
    const last = wordAt(beat + on - 0.02);
    assert.ok(last.opacity < 0.1, `${text} fades out`);
    // one size all its time, held by the screen's width (a long word on a tablet held upright)
    assert.deepEqual([wordAt(beat + 0.1).height, wordAt(beat + 0.1).width], [wordAt(beat + 1).height, wordAt(beat + 1).width]);
    // with less motion: half the size, and only a fade
    for (let age = 0; age < on; age += 0.05) {
      const calm = wordAt(beat + age, { reduced: true });
      assert.ok(calm.scale === 0.5 && calm.opacity >= 0 && calm.opacity <= 1 && calm.lift === word.lift);
    }
  });
  // AFTUR! stands inside the rewind, by the set's own beat, and gives way to the drop it calls back
  const [aftur] = WORDS.filter(word => word.text === 'AFTUR!');
  assert.ok(aftur.beat > BENDS.rewind.from && aftur.beat + aftur.on <= BENDS.rewind.to, 'in the rewind');
  // STOPP! stands dead still through the first beats of the freeze, as the music does, and is gone when the turtle that moved is shown
  const [stopp] = WORDS.filter(word => word.text === 'STOPP!');
  assert.equal(stopp.beat, BENDS.freeze.from);
  for (let age = WORD.pop; age < stopp.on; age += 0.05) assert.deepEqual([wordAt(stopp.beat + age).scale, wordAt(stopp.beat + age).lift], [1, 0], 'STOPP! does not move');
  assert.ok(stopp.beat + stopp.on <= line('turtle-moved').beat && stopp.beat + stopp.on < BENDS.freeze.to);
  // HOPP! hops once, and lands
  const [hopp] = WORDS.filter(word => word.text === 'HOPP!');
  assert.ok(wordAt(hopp.beat + 1 + WORD.hop / 2).lift > 0.08 && wordAt(hopp.beat + 0.9).lift === 0 && Math.abs(wordAt(hopp.beat + 1 + WORD.hop).lift) < 1e-9);
  // NÚ! fills the screen from its middle; the others stand in the upper part of the picture, over those the shot is about
  for (const word of WORDS) {
    const at = wordAt(word.beat + 1).at;
    assert.equal(at, word.at);
    assert.ok(word.text === 'NÚ!' ? at === 0.5 : at >= 0.3 && at <= 0.4, `${word.text} stands ${at} of the way down`);
    assert.equal(wordAt(word.beat + 1, { reduced: true }).at, at);
  }
  // never a word and a number at once, and no word outside its own time (the rewind and the freeze included)
  for (const { setBeat, beat } of framesOfTheSet) {
    const word = wordAt(setBeat);
    assert.ok(!(word && countAt(beat)), `a word and a number at ${setBeat.toFixed(2)}`);
    assert.ok(!word || WORDS.some(w => setBeat >= w.beat && setBeat < w.beat + w.on));
  }
  const shown = framesOfTheSet.filter(({ setBeat }) => wordAt(setBeat)).length * FRAME * BEAT_SECONDS;
  assert.ok(shown < 8, `a word is on the screen ${shown.toFixed(1)} s of the set's 230`);
});

test('every number and every word fits a tablet held flat and one held upright, clear of the caption, and NÚ! tops the count', () => {
  const widths = Object.fromEntries(WORDS.map(word => [word.text, word.wide]));
  for (const screen of SCREENS) {
    const [w, h] = screen;
    const name = `${w}x${h}`;
    let widest = 0;
    for (const { setBeat, beat } of framesOfTheSet) {
      const count = countAt(beat);
      const spec = count ?? wordAt(setBeat);
      if (!spec) continue;
      const text = count ? String(count.n) : spec.text;
      const ink = inkOf(spec, { wide: count ? DIGIT_WIDE : widths[text], accent: /[ÁÉÍÓÚÝÖ]/.test(text) }, screen);
      widest = Math.max(widest, ink.width / w);
      assert.ok(ink.width <= w - 16, `${text} at ${setBeat.toFixed(2)} on ${name}: ${ink.width.toFixed(0)} px wide`);
      if (spec.opacity < 0.5) continue; // (bursting away, nearly gone)
      assert.ok(ink.top >= 0, `${text} at ${setBeat.toFixed(2)} on ${name}: its top at ${ink.top.toFixed(0)} px`);
      assert.ok(ink.bottom <= h - CAPTION_TOP, `${text} at ${setBeat.toFixed(2)} on ${name}: its foot at ${ink.bottom.toFixed(0)} px, the caption's top at ${h - CAPTION_TOP}`);
      // and not into the stars in the corner: what reaches that far right stands under them
      if (ink.width / 2 > w / 2 - HUD.wide) assert.ok(ink.shoulder >= HUD.high, `${text} at ${setBeat.toFixed(2)} on ${name}: its right end's top at ${ink.shoulder.toFixed(0)} px, the stars' foot at ${HUD.high}`);
    }
    assert.ok(widest > 0.8, `the widest word fills the width on ${name} (${widest.toFixed(2)})`);
    // the count's last number against the word that follows it
    const one = inkOf(countAt(COUNTS.at(-1).beat + 0.6), { wide: DIGIT_WIDE }, screen);
    const five = inkOf(countAt(COUNTS[0].beat + 0.6), { wide: DIGIT_WIDE }, screen);
    const now = inkOf(wordAt(WORDS[0].beat + 1), { wide: widths['NÚ!'], accent: true }, screen);
    assert.ok(five.capital >= 100, `"5" is ${five.capital.toFixed(0)} px high on ${name}: big enough to read at a glance`);
    assert.ok(one.capital >= five.capital * 1.9, `the count has doubled by "1" on ${name}`);
    assert.ok(now.width >= one.width * 2 && now.bottom - now.top >= one.bottom - one.top - 2 && now.capital >= one.capital * 0.8,
      `NÚ! tops "1" on ${name}: ${now.width.toFixed(0)} px wide and ${(now.bottom - now.top).toFixed(0)} high against ${one.width.toFixed(0)} and ${(one.bottom - one.top).toFixed(0)}`);
    assert.ok(now.width > w * 0.75, `NÚ! is ${(now.width / w * 100).toFixed(0)} % of the width on ${name}`);
  }
  assert.ok(ROOM >= CAPTION_TOP, 'the letters stand in the middle of what the caption leaves free');
});

test('the dusk sinks as her horn begins and it is dusk from then on: through the build, the drop, the rewind and to the last hit', () => {
  const from = part('break').startBeat;
  for (let beat = -4; beat <= from; beat += 0.5) assert.equal(duskAt(beat), 0);
  assert.ok(duskAt(from + DUSK.sink / 2) > 0.3 && duskAt(from + DUSK.sink / 2) < 0.7);
  for (let beat = from + DUSK.sink; beat <= SET.endBeat + 8; beat += 0.25) assert.equal(duskAt(beat), 1, `deep at ${beat}`);
  let last = 0;
  for (const { beat, setBeat } of framesOfTheSet) {
    const dusk = duskAt(beat);
    assert.ok(dusk >= 0 && dusk <= 1);
    if (setBeat >= from + DUSK.sink) assert.equal(dusk, 1, `still dusk at the set's beat ${setBeat.toFixed(2)} (the drop, the rewind and all)`);
    assert.ok(Math.abs(dusk - last) < 0.03, 'it sinks slowly, and never jumps');
    last = dusk;
  }
});

test('the soft flashes: on the peaks and the band\'s hits, never two in a second, and a fade each', () => {
  for (const peak of [...BURSTS, ...PUFFS]) assert.equal(FLASHES.find(flash => flash.beat === peak)?.strength, 1);
  FLASHES.slice(1).forEach((flash, k) => {
    assert.ok(flash.beat - FLASHES[k].beat >= LIFT.beats, `${FLASHES[k].beat} and ${flash.beat}`);
    assert.ok((flash.beat - FLASHES[k].beat) * BEAT_SECONDS >= 0.5, 'never faster than twice a second');
  });
  for (const { beat, strength } of FLASHES) {
    assert.equal(liftAt(beat), strength);
    assert.ok(liftAt(beat + LIFT.beats / 2) < strength / 2);
    assert.ok(liftAt(beat - 0.01) < 0.01, 'the one before has faded');
  }
  // as the scene plays it, the freeze included (it stands on one beat: one level), a flash never rises twice within half a second
  let rises = [];
  let last = 0;
  framesOfTheSet.forEach(({ beat }, k) => {
    const lift = liftAt(beat);
    assert.ok(lift >= 0 && lift <= 1);
    if (lift > last + 0.2) rises.push(k);
    last = lift;
  });
  rises.slice(1).forEach((k, n) => assert.ok((k - rises[n]) / 30 >= 0.5, `two flashes ${((k - rises[n]) / 30).toFixed(2)} s apart`));
});

test('the backbeat and the rings of light on the water', () => {
  assert.equal(pulseAt(1), 1);
  assert.equal(pulseAt(3), 1);
  assert.ok(pulseAt(2.9) < 0.02 && pulseAt(0) < 0.1, 'only the bar\'s second and fourth beats');
  assert.equal(energyOf('break'), 0, 'the quiet part is quiet');
  assert.equal(energyOf(undefined), 0);
  for (const section of SET.sections) assert.ok(energyOf(section.id) >= 0 && energyOf(section.id) <= 1 && section.id in { ...Object.fromEntries(SET.sections.map(s => [s.id, 1])) });
  const at = beat => { const rings = []; beatRingsAt(beat, 1, (x, z, radius, width, level) => rings.push({ x, z, radius, width, level })); return rings; };
  assert.equal(at(100.5).length, BEAT_RING.life / BEAT_RING.every, 'two at a time');
  assert.ok(BEAT_RING.every * BEAT_SECONDS >= 0.5, 'a new ring no oftener than twice a second');
  const [young, old] = at(100.5);
  assert.deepEqual([young.x, young.z], HER, 'from under her on a bar\'s first beat');
  assert.deepEqual([old.x, old.z], FAR_POOL.center, 'from the pool\'s middle on its third');
  assert.ok(old.radius > young.radius && old.level < young.level, 'it spreads and fades');
  assert.ok(at(100.5).every(ring => ring.radius < FAR_POOL.radius), 'inside the pool');
  let rings = 0;
  beatRingsAt(250, energyOf('break'), () => rings++);
  assert.equal(rings, 0, 'none in the quiet part');
});

test('the notes: her tune flies from each group to her crest, her horn rises into the sky in the quiet part and answers the groups after it', () => {
  for (const { group, beat } of SET.tune) {
    const note = NOTES.find(n => n.from === group && n.to === 'crest' && n.beat === danceBeatAt(beat).beat);
    assert.ok(note, `${group} at ${beat}`);
    assert.equal(note.life, NOTE.fly);
  }
  const horns = SET.cues.filter(cue => cue.kind === 'horn');
  const quiet = horns.filter(cue => sectionAt(cue.beat).id === 'break');
  assert.ok(quiet.length >= 8);
  for (const cue of quiet) assert.ok(NOTES.some(n => n.from === 'crest' && n.to === 'sky' && n.beat === cue.beat), `a note into the sky at ${cue.beat}`);
  const answers = NOTES.filter(n => n.from === 'crest' && n.to !== 'sky');
  assert.equal(answers.length, horns.length - quiet.length);
  assert.ok(answers.every(n => GROUPS.includes(n.to)));
  for (const id of ['anthem', 'lastchorus']) {
    const to = new Set(answers.filter(n => sectionAt(n.beat >= BENDS.rewind.to - 12 && n.beat < BENDS.freeze.from - 12 ? n.beat + 12 : n.beat).id === id).map(n => n.to));
    assert.ok(to.size >= 3, `her answers in ${id} go out to several groups (${[...to]})`);
  }
  const last = answers.filter(n => n.beat >= part('end').startBeat).map(n => n.to);
  assert.deepEqual(last, GROUPS.slice(0, last.length), 'the last hits: group after group, low to high');
  // a note's life: on its beat it is where it starts, it is over its way's middle half way, and it lands and glows
  const note = NOTES.find(n => n.to === 'crest');
  const [a, b] = [[0, 1, 0], [10, 3, 4]];
  assert.equal(noteAt(note, note.beat - 0.01), null);
  assert.deepEqual(noteAt(note, note.beat), { u: 0, glow: 0 });
  assert.deepEqual(notePoint(note, a, b, 0, []), a);
  assert.deepEqual(notePoint(note, a, b, 1, []).map(v => +v.toFixed(9)), b);
  assert.ok(notePoint(note, a, b, 0.5, [])[1] > 2 + NOTE.arc - 0.01, 'an arc');
  assert.ok(noteAt(note, note.beat + NOTE.fly + 0.1).glow > 0.8, 'the light where it lands');
  assert.equal(noteAt(note, note.beat + NOTE.fly + NOTE.glow), null);
  const up = NOTES.find(n => n.to === 'sky');
  assert.ok(notePoint(up, a, a, 1, [])[1] - a[1] === NOTE.climb && noteAt(up, up.beat + NOTE.rise) === null);
  for (let u = 0; u < 1; u += 0.02) { // no jump on either way
    for (const n of [note, up]) assert.ok(Math.hypot(...notePoint(n, a, b, u + 0.02, []).map((v, k) => v - notePoint(n, a, b, u, [])[k])) < 0.8);
  }
});

test('the splashes: crowns of drops all round the pool on the bursts, and a small one where a frog lands', () => {
  const crowns = SPLASHES.filter(splash => splash.drops > 6);
  assert.equal(crowns.length, SPLASH.crowns * (BURSTS.length + 1), 'on each burst and on the last hit');
  for (const burst of BURSTS) {
    const round = crowns.filter(splash => splash.beat >= burst && splash.beat < burst + 0.25);
    assert.equal(round.length, SPLASH.crowns, `with the drop at ${burst}`);
    const angles = round.map(({ at }) => Math.atan2(at[1] - FAR_POOL.center[1], at[0] - FAR_POOL.center[0])).sort((x, y) => x - y);
    angles.slice(1).forEach((angle, k) => assert.ok(angle - angles[k] < 1, 'all round'));
    for (const { at } of round) {
      const far = Math.hypot(at[0] - FAR_POOL.center[0], at[1] - FAR_POOL.center[1]);
      assert.ok(far < FAR_POOL.radius * 0.85 && far > FAR_POOL.radius * 0.6, 'in the water near its rim');
    }
  }
  const out = {};
  for (const splash of SPLASHES) {
    let top = 0;
    for (let j = 0; j < splash.drops; j++) {
      for (let age = 0; age < SPLASH_AIR; age += 0.05) {
        const drop = dropAt(splash, j, age, out);
        if (drop) top = Math.max(top, drop.y);
      }
      assert.equal(dropAt(splash, j, SPLASH_AIR + 0.01, out), false, 'down again');
      assert.equal(dropAt(splash, j, -0.01, out), false);
    }
    if (splash.drops) assert.ok(top <= (splash.drops > 6 ? SPLASH.height : 0.5) + 0.01 && top > (splash.drops > 6 ? 1.5 : 0.2), `as high as ${top.toFixed(2)} m`);
    assert.equal(splashRingAt(splash, SPLASH.ring), null);
    assert.ok(splashRingAt(splash, 1).radius > splashRingAt(splash, 0).radius && splashRingAt(splash, 3).level < splashRingAt(splash, 1).level);
  }
  const pads = seatsOf('frogs').map(seat => seat.at);
  const frogs = SET.cues.filter(cue => cue.kind === 'call' && cue.group === 'frogs');
  for (const call of frogs) {
    assert.ok(pads.some(pad => pad[0] === padOf(call.beat)[0] && pad[1] === padOf(call.beat)[1]));
    const beat = danceBeatAt(call.beat).beat + SPLASH.frogAfter;
    assert.ok(SPLASHES.some(splash => splash.beat === beat && splash.at === padOf(call.beat)), `a ring at a lily pad as the frog of ${call.beat} lands`);
  }
  assert.equal(new Set(frogs.map(call => padOf(call.beat))).size, pads.length, 'every pad has its turn');
  // the grazers' stomps: a ring out over the water from the bank at their feet, and no drops
  const stomps = SET.cues.filter(cue => cue.kind === 'call' && cue.group === 'grazers' && sectionAt(cue.beat).id === 'grazers');
  assert.ok(stomps.length >= 8);
  for (const stomp of stomps) {
    const ring = SPLASHES.find(splash => splash.beat === stomp.beat && splash.drops === 0);
    assert.ok(ring, `a ring on the stomp at ${stomp.beat}`);
    assert.ok(Math.hypot(ring.at[0] - FAR_POOL.center[0], ring.at[1] - FAR_POOL.center[1]) < FAR_POOL.radius, 'on the water');
    assert.ok(Math.hypot(ring.at[0] - CHOIR.grazers.at[0], ring.at[1] - CHOIR.grazers.at[1]) < 9, 'at their feet');
  }
});

test('the fireflies: out of the reed, round her in the quiet part, out over the whole pool on the drop, and never a jump', () => {
  const flies = createFireflies();
  assert.equal(flies.count, FIREFLIES.count);
  const all = (beat, energy = 1) => Array.from({ length: flies.count }, (_, i) => flies.at(i, beat, energy, {}));
  const lit = swarm => swarm.filter(fly => fly.level > 0.05);
  // the same beat is the same picture, whatever was asked before
  const once = all(301.3);
  all(12);
  all(440);
  assert.deepEqual(all(301.3), once);
  // none before the set; the first rise out of the reeds as it starts
  assert.equal(lit(all(0)).length, 0);
  const first = lit(all(3));
  assert.ok(first.length >= 3 && first.length < flies.count / 4, `${first.length} at beat 3`);
  for (const fly of first) {
    const near = Math.min(...FAR_POOL.reeds.map(reed => Math.hypot(fly.x - reed.at[0], fly.z - reed.at[1]) - reed.radius));
    assert.ok(near < 10 && fly.y < FAR_POOL.level + 4.5, 'still by its reed, low');
  }
  assert.ok(lit(all(16)).length > first.length, 'more as the set goes on');
  assert.ok(outAt(60) < outAt(236) && outAt(250) === 1 && outAt(296) === 1, 'all of them out for her horn');
  // round her in the quiet part and the build: most of them, all near her, over the water, drawn in before the drop
  // (the last of them are still streaming to her from the reed as her horn begins)
  for (const [beat, share] of [[248, 0.6], [264, 0.9], [290, 0.95]]) {
    const round = lit(all(beat));
    assert.ok(round.length > flies.count * 0.85, `${round.length} at ${beat}`);
    const near = round.filter(fly => fromHer(fly) < 9);
    assert.ok(near.length >= round.length * share, `${near.length} of ${round.length} within 9 m of her at ${beat}`);
    assert.ok(round.every(fly => fly.y > FAR_POOL.level + 0.3 && fly.y < FAR_POOL.level + 9));
  }
  assert.equal(gatherAt(250), 1);
  assert.equal(gatherAt(200), 0);
  const mean = swarm => swarm.reduce((sum, fly) => sum + fromHer(fly), 0) / swarm.length;
  assert.ok(mean(lit(all(294))) < mean(lit(all(250))), 'tighter as the count goes');
  // the burst: every one, from where it was in the swarm, out over the whole pool in two beats, in the confetti's colours
  const [burst] = BURSTS;
  assert.ok(Math.max(...all(burst - 1e-4).map((fly, i) => Math.hypot(fly.x - all(burst)[i].x, fly.y - all(burst)[i].y, fly.z - all(burst)[i].z))) < 0.05, 'it starts where they are');
  const flung = all(burst + 2);
  assert.equal(lit(flung).length >= flies.count * 0.9, true);
  assert.ok(mean(flung) > 2.5 * mean(all(burst)), `from ${mean(all(burst)).toFixed(1)} m to ${mean(flung).toFixed(1)} m in two beats`);
  assert.ok(flung.filter(fly => fromHer(fly) > 14).length > flies.count / 5 && Math.max(...flung.map(fly => fly.y)) > FAR_POOL.level + 8, 'far and high');
  assert.ok(flung.every(fly => fromHer(fly) < FAR_POOL.radius + 6), 'over the pool and its banks');
  const colours = swarm => new Set(swarm.map(fly => [fly.r, fly.g, fly.b].map(v => v.toFixed(2)).join()));
  assert.ok(colours(flung).size > colours(all(250)).size, 'more colours on the burst');
  assert.ok(all(burst + 0.5).reduce((sum, fly) => sum + fly.size, 0) > 1.5 * all(250, 0).reduce((sum, fly) => sum + fly.size, 0), 'and bigger');
  // again on the second drop, and the last chorus has them all, biggest
  assert.ok(mean(all(BURSTS[1] + 2)) > 2.5 * mean(all(BURSTS[1])));
  assert.equal(lit(all(BURSTS[1] + 16)).length >= flies.count * 0.9, true);
  assert.ok(lit(all(380)).length < lit(all(BURSTS[1] + 16)).length, 'densest in the last chorus');
  // gone after the last hit has rung
  assert.equal(lit(all(SET.endBeat + 4.5)).length, 0);

  // as the scene plays it, frame by frame: no firefly jumps (but with the snap out of the freeze, when the whole picture does),
  // it stands still in Stoppdans, and it goes back the way it came in the rewind
  const fly = {};
  let before = null;
  let worst = { calm: 0, burst: 0 };
  for (const frame of framesOfTheSet) {
    const now = [];
    for (let i = 0; i < flies.count; i += 3) {
      flies.at(i, frame.beat, energyOf(frame.section?.id), fly);
      now.push([fly.x, fly.y, fly.z, fly.level]);
    }
    const snap = before && before.frame.frozen && !frame.frozen;
    if (before && !snap) {
      const bursting = BURSTS.some(beat => Math.min(frame.beat, before.frame.beat) < beat + 4 && Math.max(frame.beat, before.frame.beat) >= beat);
      now.forEach((p, k) => {
        if (p[3] <= 0.01 && before.now[k][3] <= 0.01) return;
        const moved = Math.hypot(p[0] - before.now[k][0], p[1] - before.now[k][1], p[2] - before.now[k][2]);
        if (bursting) worst.burst = Math.max(worst.burst, moved);
        else worst.calm = Math.max(worst.calm, moved);
        if (frame.frozen && before.frame.frozen) assert.equal(moved, 0, 'still in Stoppdans');
      });
    }
    before = { frame, now };
  }
  assert.ok(worst.calm < 0.45, `the fastest a firefly drifts is ${worst.calm.toFixed(2)} m a frame`);
  assert.ok(worst.burst < 6.5, `and in a burst (twice as fast in the rewind) ${worst.burst.toFixed(2)} m a frame`);
  const [out, back] = [BENDS.rewind.from - 2, BENDS.rewind.from + 1]; // two beats before the rewind, and one beat (two back) into it
  assert.equal(danceBeatAt(back).beat, out);
  assert.deepEqual(all(danceBeatAt(back).beat), all(out), 'the rewind is the same picture again');
});

test('the fireflies with less motion: half of them, half the size, drifting where they are', () => {
  const calm = createFireflies({ count: FIREFLIES.count / 2, reduced: true });
  const full = createFireflies();
  assert.equal(calm.count, full.count / 2);
  const all = beat => Array.from({ length: calm.count }, (_, i) => calm.at(i, beat, 1, {}));
  assert.ok(Math.max(...all(300).map(fly => fly.size)) <= FIREFLIES.size * 1.25 / 2 + 1e-9, 'half the size');
  const mean = swarm => swarm.reduce((sum, fly) => sum + fromHer(fly), 0) / swarm.length;
  assert.ok(Math.abs(mean(all(275)) - mean(all(300))) < 2 && mean(all(275)) > 12, 'no swarm and no burst');
  assert.deepEqual(all(300).map(fly => fly.size), all(301).map(fly => fly.size), 'no beat in their light');
  let worst = 0;
  for (let beat = 290; beat < 300; beat += FRAME) {
    all(beat).forEach((fly, i) => { const next = calm.at(i, beat + FRAME, 1, {}); worst = Math.max(worst, Math.hypot(next.x - fly.x, next.y - fly.y, next.z - fly.z)); });
  }
  assert.ok(worst < 0.2, `no fast moves (${worst.toFixed(2)} m a frame)`);
});

// ---------------------------------------------------------------------------------------------
// Drawn: a small world with the light a page's world has

function smallWorld({ reduced = false, params = null } = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#e0d5c2', 0.016);
  scene.environmentIntensity = 0.77;
  const colour = hex => ({ value: new THREE.Color(hex) });
  const world = {
    THREE, scene, camera: new THREE.PerspectiveCamera(50, 1.6, 0.1, 1200), params,
    lighting: { sun: new THREE.DirectionalLight('#ffce95', 2.87), hemi: new THREE.HemisphereLight('#cbdcef', '#676038', 0.55) },
    sky: { dome: { material: { uniforms: { uZenith: colour('#6c9bd3'), uHorizon: colour('#f4d9af'), uGlow: colour('#ffdca8'), uCloud: colour('#fff6e9'), uCloudShade: colour('#d7c4b6'), uFogColor: colour('#e0dacb'), uFogSun: colour('#f7cf9b'), uFogSunStrength: { value: 0.94 } } } } },
    forest: { materials: { water: { uniforms: { uHorizon: colour('#f4d9af'), uZenith: colour('#6c9bd3'), uDeep: colour('#3f7a6e'), uGlint: colour('#fff0c6') } } }, ripples: [], rippleAt(x, z, strength) { this.ripples.push([x, z, strength]); } },
    renderer: { toneMappingExposure: 1, getDrawingBufferSize: v => v.set(1280, 800) },
    heightAt: () => FAR_POOL.level + 0.4,
  };
  const doc = new FakeDocument(['view']);
  doc.body.append(doc.getElementById('view') ?? doc.add('view'), doc.add('caption')); // the canvas, and what stands over the game
  world.page = doc;
  const head = new THREE.Vector3(HER[0], FAR_POOL.level + 3, HER[1]);
  const c = {
    world, reduced, aims: Object.fromEntries(GROUPS.map(group => [`choir-${group}`, [CHOIR[group].at[0], FAR_POOL.level + 1, CHOIR[group].at[1]]])),
    sloedla: { raw: { headPosition: out => out.copy(head) } },
  };
  /** Everything the dusk may touch, as numbers. */
  const light = () => JSON.stringify([
    world.lighting.sun.color.toArray(), world.lighting.sun.intensity, world.lighting.hemi.color.toArray(), world.lighting.hemi.groundColor.toArray(),
    world.lighting.hemi.intensity, scene.fog.color.toArray(), scene.environmentIntensity, world.renderer.toneMappingExposure,
    Object.values(world.sky.dome.material.uniforms).map(u => u.value.toArray?.() ?? u.value), Object.values(world.forest.materials.water.uniforms).map(u => u.value.toArray()),
    world.lighting.sun.position.toArray(),
  ]);
  const numbers = () => doc.body.children.filter(el => el.classList.contains('big-number'));
  return { world, c, doc, light, numbers };
}
const video = setBeat => ({ setBeat, ...danceBeatAt(setBeat), section: sectionAt(setBeat) });
const drawn = show => ({
  lights: Array.from({ length: show.parts.lights.count }, (_, i) => show.parts.lights.read(i)),
  rings: Array.from({ length: show.parts.rings.count }, (_, i) => show.parts.rings.read(i)),
});

test('the show draws the same picture at the same beat, with two draw calls and next to no triangles', () => {
  const { world, c } = smallWorld();
  const before = world.scene.children.length;
  const show = createShow(c);
  assert.equal(world.scene.children.length - before, 2, 'the lights and the rings: two objects, a draw call each');
  const { lights, rings } = show.parts;
  assert.ok(lights.object.isPoints && !lights.object.castShadow && !rings.object.castShadow, 'points, and no shadow casters');
  show.update(video(300));
  const once = drawn(show);
  show.update(video(250));
  show.update(video(20));
  show.update(video(300));
  assert.deepEqual(drawn(show), once);
  // the rewind: one beat (two back) into it is the picture of two beats before it; Stoppdans: one picture all the way
  show.update(video(BENDS.rewind.from - 2));
  const out = drawn(show);
  show.update(video(BENDS.rewind.from + 1));
  assert.deepEqual(drawn(show), out);
  show.update(video(BENDS.freeze.from + 0.1));
  const frozen = drawn(show);
  show.update(video(BENDS.freeze.to - 0.1));
  assert.deepEqual(drawn(show), frozen);
  assert.ok(frozen.lights.length > FIREFLIES.count / 2, 'the fireflies hang in the air');
  // the whole set: never more lights than there is room for (none is dropped), and at most a few dozen triangles
  let most = { lights: 0, rings: 0 };
  for (const frame of framesOfTheSet.filter((_, k) => k % 3 === 0)) {
    show.update(frame);
    most = { lights: Math.max(most.lights, lights.count), rings: Math.max(most.rings, rings.count) };
    assert.equal(rings.object.geometry.instanceCount, rings.count);
    assert.equal(lights.object.geometry.drawRange.count, lights.count);
  }
  assert.ok(most.lights < lights.capacity, `${most.lights} lights at most, of ${lights.capacity}`);
  assert.ok(most.rings < rings.capacity && most.rings * 2 <= 80, `${most.rings} rings at most: ${most.rings * 2} triangles`);
  show.dispose();
});

test('the show in the set: the first fireflies, the notes, the frogs\' rings, the numbers on the page', () => {
  const { world, c, doc, numbers } = smallWorld();
  const show = createShow(c);
  const { lights, rings, number } = show.parts;
  show.update(video(0));
  assert.equal(lights.count, 0, 'nothing as the set starts');
  assert.equal(numbers().length, 0, 'and nothing on the page until a number shows');
  show.update(video(12));
  assert.ok(lights.count > 10);
  // a note of her tune on its way from the lizards to her crest: a bright head half way, over the straight line
  const note = SET.tune[0];
  show.update(video(note.beat + NOTE.fly / 2));
  const from = c.aims[`choir-${note.group}`];
  const head = drawn(show).lights.filter(light => light.shape[0] > 1.5);
  assert.equal(head.length, 1);
  assert.ok(Math.abs(head[0].position[0] - (from[0] + HER[0]) / 2) < 0.5 && head[0].position[1] > FAR_POOL.level + 3.5, 'half way, on its arc');
  // in the quiet part notes rise from her crest
  const horn = SET.cues.find(cue => cue.kind === 'horn' && sectionAt(cue.beat).id === 'break');
  show.update(video(horn.beat + 3));
  assert.ok(drawn(show).lights.some(light => Math.hypot(light.position[0] - HER[0], light.position[2] - HER[1]) < 1 && light.position[1] > FAR_POOL.level + 3.8 + 4), 'a note high over her crest');
  // a frog's call: the water's own ring at its pad at once (the cue), and the show's white ring there as it lands
  const call = SET.cues.find(cue => cue.kind === 'call' && cue.group === 'frogs' && sectionAt(cue.beat).id === 'frogs');
  show.cue(call);
  assert.deepEqual(world.forest.ripples.at(-1).slice(0, 2), padOf(call.beat));
  show.cue({ kind: 'call', group: 'grazers', beat: call.beat });
  show.cue({ kind: 'peak', beat: 296 });
  assert.equal(world.forest.ripples.length, 1, 'only the frogs');
  show.update(video(call.beat + SPLASH.frogAfter + 0.5));
  const pad = padOf(call.beat);
  assert.ok(drawn(show).rings.some(ring => ring.centre[0] === Math.fround(pad[0]) && ring.centre[2] === Math.fround(pad[1]) && ring.shape[2] === 0), 'a ring at the pad');
  assert.ok(drawn(show).rings.some(ring => ring.shape[2] === 1 && ring.centre[0] === Math.fround(CHOIR.frogs.at[0])), 'and the light under the frogs, whose part it is');
  // the numbers: one element right after the canvas, the digit she calls, no taps taken
  for (const { beat, n } of COUNTS) {
    show.update(video(beat + 0.5));
    assert.equal(numbers().length, 1);
    const [el] = numbers();
    assert.equal(el.children[0].textContent, String(n));
    assert.equal(number.shown.text, String(n));
    assert.ok(el.style.cssText.includes('pointer-events: none'), 'a tap goes through it to the animals');
    assert.equal(el.style.display, 'flex');
    assert.equal(doc.body.children[doc.body.children.indexOf(el) - 1].id, 'view', 'over the game, under everything else');
    show.update(video(beat + 1.5));
    assert.equal(number.shown, null);
    assert.equal(el.style.display, 'none', 'gone before the next');
  }
  // the drop: "NÚ!" in the same piece of the page, at its own size, and gone before the drop's first bar is out
  show.update(video(BURSTS[0] + 0.5));
  assert.equal(number.shown.text, 'NÚ!');
  assert.equal(numbers().length, 1);
  const [el] = numbers();
  assert.equal(el.children[0].textContent, 'NÚ!');
  assert.match(el.children[0].style.fontSize, /^min\(70vh, [\d.]+vw\)$/, 'held by the height on a screen held flat, by the width on one held upright');
  assert.ok(el.style.cssText.includes(`padding-bottom: ${ROOM}px`), 'in the middle of what the caption leaves free');
  assert.ok(rings.count >= SPLASH.crowns, 'the crowns\' rings on the drop');
  assert.ok(drawn(show).lights.filter(light => light.shape[1] > 0.7).length > SPLASH.crowns * 6, 'and their drops in the air');
  show.update(video(BURSTS[0] + 3));
  assert.equal(number.shown, null);
  // the words are the set's own beat's: AFTUR! in the rewind, NÚ! again on the drop after it, STOPP! in the freeze, HOPP! twice
  for (const { beat, text } of WORDS) {
    show.update(video(beat + 0.8));
    assert.equal(number.shown.text, text, `${text} at the set's beat ${beat}`);
    assert.equal(el.children[0].textContent, text);
    assert.equal(el.style.display, 'flex');
    show.update(video(beat + 2.4));
    assert.ok(!number.shown || number.shown.text !== text, `${text} is gone (the drop's NÚ! follows AFTUR!)`);
  }
  // a number after a word takes its own size back
  show.update(video(COUNTS[0].beat + 0.5));
  assert.equal(el.children[0].style.fontSize, 'min(40vh, 27.2vw)');
  show.dispose();
  assert.equal(numbers().length, 0);
});

test('the dusk: darker and warmer from the quiet part on, kept after the set if asked, and everything exactly as it was when the day is back', () => {
  const { world, c, light } = smallWorld();
  const was = light();
  const show = createShow(c);
  assert.equal(light(), was, 'making the show changes nothing');
  assert.deepEqual(show.parts.dusk.held, { colours: 15, numbers: 4 }, 'the sun, the fill, the haze, the sky, the water (its sky, its own colour and its glitter), the exposure');
  show.update(video(100));
  assert.equal(light(), was, 'the afternoon, between two flashes');
  show.update(video(250));
  assert.notEqual(light(), was);
  const { sun, hemi } = world.lighting;
  assert.ok(sun.intensity < 2.87 * 0.6 && world.renderer.toneMappingExposure < 0.95 && world.scene.environmentIntensity < 0.77 * 0.75, 'darker');
  assert.ok(sun.color.b / sun.color.r < new THREE.Color('#ffce95').b / 1 - 0.1, 'warmer');
  assert.ok(hemi.intensity < 0.55 && world.sky.dome.material.uniforms.uZenith.value.b < new THREE.Color('#6c9bd3').b);
  const deep = light();
  show.update(video(part('rise').startBeat - 0.5)); // her horn's record to its last beat
  assert.equal(light(), deep, 'the dusk as it fell, all through her horn');
  // after the drop it is night still (the basic record's night: changed on purpose 2026-11-19, it was the same dusk to the end)
  show.update(video(BURSTS[0] + LIFT.beats)); // the drop, its flash over
  const night = light();
  assert.notEqual(night, deep, 'another record, another colour');
  assert.ok(sun.intensity < 2.87 * 0.6 && world.renderer.toneMappingExposure < 0.95 && world.sky.dome.material.uniforms.uZenith.value.b < new THREE.Color('#6c9bd3').b / 2, 'it is night after the drop: the day does not come back');
  const dim = world.renderer.toneMappingExposure;
  show.update(video(BURSTS[0]));
  assert.ok(world.renderer.toneMappingExposure > dim && world.renderer.toneMappingExposure <= dim * 1.1 + 1e-9, 'a soft lift on the drop, in the night');
  show.update(video(100)); // (a probe's step back to the afternoon)
  assert.equal(light(), was);
  show.update(video(SET.endBeat + LIFT.beats)); // the last hit's flash over: the calm night
  const calm = light();
  const still = world.renderer.toneMappingExposure;
  show.update(video(SET.endBeat)); // the last hit's flash
  assert.ok(world.renderer.toneMappingExposure > still);
  // the set is over and the chapter goes on: the show's lights go, the night stays as it is with no flash on it, until the day is asked for
  show.dispose({ dusk: true });
  assert.equal(light(), calm, 'the calm night stays for the last scene of the chapter');
  assert.ok(sun.intensity < 2.87 * 0.5, 'and it is night');
  assert.equal(world.scene.children.length, 0);
  show.update(video(100)); // nor a frame after it
  assert.equal(light(), calm);
  show.day();
  assert.equal(light(), was, 'the chapter is over: the afternoon it found');
  show.day(); // twice does no harm
  assert.equal(light(), was);
  // another show, left in the middle of the dusk with a number on the screen: everything back, to the last bit
  const left = createShow(c);
  left.update(video(COUNTS[2].beat + 0.5));
  assert.notEqual(light(), was);
  left.dispose();
  assert.equal(light(), was);
  assert.equal(world.scene.children.length, 0);
  left.dispose(); // twice does no harm
  left.update(video(250)); // nor a frame after it
  assert.equal(light(), was);
  // the dusk by itself: any order, the same light for the same numbers, and restore
  const dusk = createDusk(world);
  dusk.set(0.7, 0.3);
  const some = light();
  dusk.set(1, 0);
  dusk.set(0.2, 1);
  dusk.set(0.7, 0.3);
  assert.equal(light(), some);
  dusk.restore();
  assert.equal(light(), was);
  // and with any looks: a mix of two is in between them, in any order, the weights never more than 1 together, and still() takes the flash off
  const zenith = world.sky.dome.material.uniforms.uZenith.value;
  dusk.mix([[LOOKS.violet, 1]]);
  const violet = zenith.clone();
  dusk.mix([[LOOKS.gold, 1]]);
  const gold = zenith.clone();
  dusk.mix([[LOOKS.violet, 0.25], [LOOKS.gold, 0.75]], 0.5);
  const between = JSON.parse(light()).flat(3);
  assert.ok(Math.abs(zenith.r - (0.25 * violet.r + 0.75 * gold.r)) < 1e-9 && Math.abs(zenith.b - (0.25 * violet.b + 0.75 * gold.b)) < 1e-9);
  assert.ok(Math.abs(dusk.depth - 1) < 1e-9 && dusk.lift === 0.5);
  dusk.mix([[LOOKS.gold, 0.75], [LOOKS.violet, 0.25]], 0.5);
  JSON.parse(light()).flat(3).forEach((value, k) => assert.ok(Math.abs(value - between[k]) < 1e-9, 'the same mix in the other order'));
  dusk.mix([[LOOKS.gold, 0.75], [LOOKS.violet, 0.75]]);
  assert.ok(Math.abs(dusk.depth - 1) < 1e-9, 'never past the looks: what is over 1 is left out');
  dusk.mix([[LOOKS.violet, 0.4]], 1);
  const flashed = world.renderer.toneMappingExposure;
  dusk.still();
  assert.ok(world.renderer.toneMappingExposure < flashed && Math.abs(dusk.depth - 0.4) < 1e-9 && dusk.lift === 0, 'the same mix with no flash on it');
  dusk.mix([[LOOKS.honey, 1]]);
  dusk.restore();
  assert.equal(light(), was);
  // a world with no light of its own (a test's, a capture's) is left alone
  assert.deepEqual(createDusk({}).held, { colours: 0, numbers: 0 });
  assert.doesNotThrow(() => createDusk({}).set(1, 1));
});

test('with less motion: no beat, no flash, half the dusk, half the fireflies, the number small', () => {
  const { world, c } = smallWorld({ reduced: true });
  const show = createShow(c);
  show.update(video(70.5)); // the dance floor: nobody calls, so no splash either
  assert.equal(show.parts.rings.count, 0, 'no rings on the beat');
  show.update(video(part('grazers').startBeat + 2.5));
  assert.ok(drawn(show).rings.every(ring => ring.shape[2] === 0), 'no light under a group');
  assert.ok(show.parts.lights.count <= FIREFLIES.count / 2);
  show.update(video(BURSTS[0] + 4)); // (the drop's own record: a record has its own light now, 2026-11-19)
  const dim = world.renderer.toneMappingExposure;
  show.update(video(BURSTS[0])); // the drop, in the night
  assert.equal(world.renderer.toneMappingExposure, dim, 'no flash');
  show.update(video(250));
  assert.ok(Math.abs(show.parts.dusk.depth - 0.5) < 1e-9);
  show.update(video(COUNTS[0].beat + 0.6));
  assert.equal(show.parts.number.shown.scale, 0.5);
  show.update(video(WORDS[0].beat + 0.6));
  assert.deepEqual([show.parts.number.shown.text, show.parts.number.shown.scale], ['NÚ!', 0.5], 'and the word');
  show.dispose();
});

test('the address can leave the show out, and a page without a place for a number still plays', () => {
  const off = smallWorld({ params: new URLSearchParams('syning=0') });
  const none = createShow(off.c);
  none.update(video(250));
  none.cue({ kind: 'peak', beat: 296 });
  none.dispose();
  assert.equal(off.world.scene.children.length, 0);
  const number = createBigNumber(null);
  assert.doesNotThrow(() => { number.show('3', { scale: 1, opacity: 1 }); number.hide(); number.dispose(); });
});

test('the chapter left in the middle of the build (dusk, a number on the screen): nothing of the show is left behind', async () => {
  const lights = world => world.scene.children.filter(object => object.name.startsWith('kafli5 show'));
  const seen = { light: null, dusk: false, number: false, shows: 0 };
  let light = null;
  const numbers = doc => doc.body.children.filter(el => el.classList.contains('big-number'));
  const run = await playUnattended(kafli5, {
    seeking: true, limit: 900, shaped: true,
    onFrame({ world, stage }) {
      if (seen.left) return;
      if (!light) { // a page's light, before the set
        world.lighting.sun = new THREE.DirectionalLight('#ffce95', 2.87);
        world.lighting.hemi = new THREE.HemisphereLight('#cbdcef', '#676038', 0.55);
        world.renderer.toneMappingExposure = 1;
        light = () => JSON.stringify([world.lighting.sun.color.toArray(), world.lighting.sun.intensity, world.lighting.hemi.color.toArray(), world.lighting.hemi.intensity, world.renderer.toneMappingExposure]);
        seen.light = light();
      }
      const c = world.chapterState;
      if (!c?.video || !Number.isFinite(c.songStart)) return;
      seen.shows = Math.max(seen.shows, lights(world).length);
      if (light() !== seen.light) seen.dusk = true;
      if (numbers(world.page).some(el => el.style.display === 'flex')) seen.number = true;
      if (c.video.setBeat >= COUNTS[2].beat + 0.5) { // "Þrír!" is on the screen: the child leaves
        assert.ok(seen.dusk && seen.number && seen.shows === 2);
        assert.notEqual(light(), seen.light);
        stage.stop();
        seen.left = { light: light(), lights: lights(world).length, numbers: numbers(world.page).length };
      }
    },
  });
  assert.ok(run.world.chapterState.songStart > 0);
  assert.deepEqual(seen.left, { light: seen.light, lights: 0, numbers: 0 });
});

test('the set over, the last scene of the chapter is in the dusk (the roar, the lines), and the day is back when the chapter has ended', async () => {
  const seen = { day: null, set: null, calm: null, roar: null, last: null };
  let light = null;
  const run = await playUnattended(kafli5, {
    seeking: true, limit: 900, shaped: true,
    onFrame({ world }) {
      if (!light) { // a page's light, before the set
        world.lighting.sun = new THREE.DirectionalLight('#ffce95', 2.87);
        world.lighting.hemi = new THREE.HemisphereLight('#cbdcef', '#676038', 0.55);
        world.renderer.toneMappingExposure = 1;
        light = () => JSON.stringify([world.lighting.sun.color.toArray(), world.lighting.sun.intensity, world.lighting.hemi.color.toArray(), world.lighting.hemi.intensity, world.renderer.toneMappingExposure]);
        seen.day = light();
      }
      const c = world.chapterState;
      if (!c) return;
      if (c.video && !c.set?.ended && c.video.setBeat > 250 && c.video.setBeat < 251) seen.set = light(); // deep in the quiet part, no flash near
      if (c.video && !c.set?.ended && c.video.setBeat > SET.endBeat + LIFT.beats) seen.calm = light(); // the set's last frames, the last flash over
      if (!c.ended && c.set?.ended && c.choirLog.some(entry => entry.type === 'roar')) { seen.roar ??= light(); seen.last = light(); }
    },
  });
  assert.ok(run.world.chapterState.set.ended > 0 && seen.set && seen.roar);
  assert.notEqual(seen.set, seen.day);
  // (changed on purpose 2026-11-19: the set's records each have a colour of the night now, and it ends in the calm night; it was the one dusk)
  assert.equal(seen.roar, seen.calm, 'the roar comes in the calm night the set left');
  assert.equal(seen.last, seen.calm, 'and it is night to the last frame of the script');
  const [, sunNow, , fillNow, exposureNow] = JSON.parse(seen.roar);
  assert.ok(Math.abs(sunNow - 2.87 * LOOKS.night.sun.intensity) < 1e-6 && Math.abs(exposureNow - LOOKS.night.exposure) < 1e-6 && Math.abs(fillNow - 0.55 * LOOKS.night.hemi.intensity) < 1e-6, 'the look after the set, whole');
  assert.ok(sunNow < JSON.parse(seen.set)[1], 'darker than the dusk fell: never back toward the day');
  assert.equal(light(), seen.day, 'the chapter over: the afternoon it found');
});

test('the sun wears its nightcap in the dusk: on as it falls, on to the end of the set and after it, and off when the day is asked for', () => {
  const { c } = smallWorld();
  const worn = [];
  c.sun = { cap: amount => worn.push(amount) };
  const show = createShow(c);
  const at = beat => { show.update(video(beat)); return worn.at(-1); };
  assert.equal(at(100), 0, 'by day: no cap');
  assert.equal(at(250), 1, 'in the quiet part: on its head');
  assert.equal(at(250), capAt(250));
  const from = part('break').startBeat;
  assert.equal(at(from + CAP.from), 0, 'the dusk sinks for a bar first');
  const falling = at(from + CAP.from + CAP.beats / 2);
  assert.ok(falling > 0.3 && falling < 0.7, `coming down as the dusk falls: ${falling}`);
  assert.equal(at(from + DUSK.sink), 1, 'on its head when the dusk is deep');
  for (let beat = from, last = 0; beat <= from + DUSK.sink; beat += FRAME) {
    const now = capAt(beat);
    assert.ok(now >= last && now - last < 0.05, `no jump at ${beat}`);
    last = now;
  }
  assert.equal(at(part('drop').startBeat), 1, 'still on at the drop');
  assert.equal(at(SET.endBeat), 1, 'and at the last hit');
  show.dispose({ dusk: true });
  assert.equal(worn.at(-1), 1, 'the set is over, the dusk stays: so does the cap');
  show.day();
  assert.equal(worn.at(-1), 0, 'the chapter is over: the cap comes off');
  const left = createShow(c);
  left.update(video(260));
  assert.equal(worn.at(-1), 1);
  left.dispose();
  assert.equal(worn.at(-1), 0, 'left in the dusk: the cap comes off');
});

test('with less motion the dusk is half as deep, but the cap is whole; and a chapter state with no sun plays on', () => {
  const { c } = smallWorld({ reduced: true });
  const worn = [];
  c.sun = { cap: amount => worn.push(amount) };
  const show = createShow(c);
  show.update(video(250));
  assert.equal(worn.at(-1), 1);
  show.dispose();
  const bare = createShow(smallWorld().c);
  bare.update(video(250));
  bare.dispose();
});

// ---------------------------------------------------------------------------------------------
// A colour for each record, with footlights (round 2, 2026-11-19: "every record of the set gets its own colour of sky and water")

const RECORDS = SET.cues.filter(cue => cue.kind === 'record');
const DUSK_FROM = part('break').startBeat; // her horn's record: the dusk falls
const TAIL = 2.4 / BEAT_SECONDS; // beats the show lives after the last hit (kafli5.js SET_TAIL)
const DAY = { sun: 2.87, fill: 0.55, zenith: '#6c9bd3', horizon: '#f4d9af' }; // the golden afternoon, as the small world below has it
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
/** How bright a colour is as the light counts it (0 to 1). */
const luma = hex => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const apart = (a, b) => Math.hypot(...rgb(a).map((v, k) => v - rgb(b)[k]));
const LOOK_IDS = Object.keys(LOOKS);
const idOf = look => LOOK_IDS.find(id => LOOKS[id] === look);
/** The looks' weights at a beat of the set, by their keys. */
const weightsAt = (setBeat, options) => Object.fromEntries(lookMixAt(setBeat, options).map(([look, weight]) => [idOf(look), weight]));
/**
 * The fill light on a side that faces the camera (neither up nor down), against the afternoon's sun on a side that faces it: what
 * an animal seen from the pool is lit by, since the sun stands behind the choir. (three.js counts both lights the same way.)
 */
const footlit = look => (DAY.fill * look.hemi.intensity * (luma(look.hemi.ground) + luma(look.hemi.sky))) / 2 / DAY.sun;
const turnOf = (cue, reduced = false) => (reduced ? Math.max(cue.turn, LOOK.calm) : cue.turn);

test('a colour for each record: the stage turns on every change of record, a record has one look by day and one in the night, and no two records share one', () => {
  const turns = LOOK_CUES.slice(0, -1);
  assert.deepEqual(turns.map(cue => [cue.beat, cue.record]), RECORDS.map(cue => [cue.beat, cue.to]), 'one turn for each record she puts on, on its beat');
  assert.ok(RECORDS.length >= 6 && new Set(RECORDS.map(cue => cue.to)).size >= 5, 'a set of several records');
  const pairs = new Map();
  for (const cue of turns) {
    const night = cue.beat >= DUSK_FROM;
    const key = `${cue.record} ${night ? 'in the night' : 'by day'}`;
    if (cue.look === null) assert.ok(!night && cue.record === 'vamp', `${key} at ${cue.beat}: only the basic record by day is the afternoon as it is`);
    else assert.deepEqual([LOOKS[cue.look].record, LOOKS[cue.look].night], [cue.record, night], `${key} at ${cue.beat} has its own look (${cue.look})`);
    if (pairs.has(key)) assert.equal(cue.look, pairs.get(key), `${key}: the same look every time it is put on`);
    pairs.set(key, cue.look);
  }
  assert.equal(new Set(pairs.values()).size, pairs.size, 'no two records share a look');
  turns.slice(1).forEach((cue, k) => assert.notEqual(cue.look, turns[k].look, `the change of record at ${cue.beat} is seen`));
  // the calm night as she says good night: after the five last hits, there before the very last one, kept for the chapter's last scene
  const after = LOOK_CUES.at(-1);
  assert.deepEqual([after.beat, after.look, LOOKS[after.look].after], [SET.lines.find(line => line.id === 'goodnight').beat, 'night', true]);
  assert.ok(after.beat > part('end').startBeat + 4 && after.beat + after.turn <= SET.endBeat, 'after the five hits, and night by the last hit');
  assert.deepEqual(LOOK_IDS.filter(id => !LOOK_CUES.some(cue => cue.look === id)), [], 'every look is some record\'s');
  // its own colour of sky and of water: any two looks of the night are plainly apart in both
  const nights = LOOK_IDS.filter(id => LOOKS[id].night);
  for (const a of nights) {
    for (const b of nights.filter(id => id > a)) {
      assert.ok(apart(LOOKS[a].sky.zenith, LOOKS[b].sky.zenith) + apart(LOOKS[a].sky.horizon, LOOKS[b].sky.horizon) > 0.3, `${a} and ${b}: the sky`);
      assert.ok(apart(LOOKS[a].water.zenith, LOOKS[b].water.zenith) + apart(LOOKS[a].water.horizon, LOOKS[b].water.horizon) > 0.25, `${a} and ${b}: the water`);
    }
  }
  // the turn itself: from the look before to the record's, slowly in and slowly out
  assert.deepEqual(lookAt(turns[0].beat - 0.01), { from: null, to: null, turned: 1 }, 'the afternoon until the first change of record');
  LOOK_CUES.forEach((cue, k) => {
    const from = k ? LOOK_CUES[k - 1].look : null;
    assert.deepEqual(lookAt(cue.beat), { from, to: cue.look, turned: 0 }, `it starts on the beat (${cue.beat})`);
    assert.equal(lookAt(cue.beat + cue.turn / 2).turned, 0.5);
    assert.equal(lookAt(cue.beat + cue.turn).turned, 1);
    assert.ok(lookAt(cue.beat + cue.turn * 0.1).turned < 0.05 && lookAt(cue.beat + cue.turn * 0.9).turned > 0.95, 'eased at both ends');
    assert.deepEqual(weightsAt(cue.beat + cue.turn + 0.01), cue.look ? { [cue.look]: LOOKS[cue.look].amount } : {}, `whole after its turn (${cue.beat})`);
  });
});

test('the dusk stands: tints of the golden afternoon before her horn, colours of the night from it to the end, never the day again', () => {
  // by day: a tint, part of the way, with the afternoon's own strength of light
  for (const cue of LOOK_CUES.filter(cue => cue.beat < DUSK_FROM && cue.look)) {
    const look = LOOKS[cue.look];
    assert.ok(!look.night && look.amount > 0.2 && look.amount <= 0.6, `${cue.look}: a tint (${look.amount} of the way)`);
    assert.ok(look.sun.intensity === 1 && look.exposure === 1 && look.envIntensity === 1 && Math.abs(look.hemi.intensity - 1) < 0.15,`${cue.look}: as bright as the afternoon`);
    assert.ok(luma(look.sky.zenith) > luma(DAY.zenith) * 0.7 && luma(look.sky.horizon) > luma(DAY.horizon) * 0.7, `${cue.look}: a day sky`);
  }
  // from her horn on: the night, all the way
  for (const cue of LOOK_CUES.filter(cue => cue.beat >= DUSK_FROM)) {
    const look = LOOKS[cue.look];
    assert.ok(look && look.night && look.amount === 1, `the record at ${cue.beat} has a colour of the night`);
    assert.ok(look.sun.intensity <= 0.7 && look.exposure <= 1 && look.envIntensity <= 0.7, `${cue.look}: the sun is dim`);
    assert.ok(luma(look.sky.zenith) < luma(DAY.zenith) * 0.6 && luma(look.sky.horizon) < luma(DAY.horizon), `${cue.look}: its sky is darker than the afternoon's`);
  }
  // her horn's record is the dusk as it fell from the start, to the letter, and it sinks as slowly
  for (const key of Object.keys(ENGINE_DUSK)) assert.deepEqual(LOOKS.rose[key], ENGINE_DUSK[key], `rose.${key} is the dusk's`);
  const dusk = LOOK_CUES.find(cue => cue.beat === DUSK_FROM);
  assert.deepEqual([dusk.look, dusk.turn], ['rose', DUSK.sink]);
  // every frame of the set: the night's looks weigh together exactly what the dusk is deep, and no tint of the day is left in it
  for (const { setBeat, beat } of framesOfTheSet) {
    const weights = weightsAt(setBeat);
    const [day, night] = [false, true].map(isNight => Object.entries(weights).filter(([id]) => LOOKS[id].night === isNight).reduce((sum, [, weight]) => sum + weight, 0));
    assert.ok(Math.abs(night - duskAt(beat)) < 1e-9, `at ${setBeat.toFixed(2)} the night is ${night}, the dusk ${duskAt(beat)}`);
    assert.ok(setBeat < DUSK_FROM || day === 0, `no day tint at ${setBeat.toFixed(2)}`);
    assert.ok(Object.keys(weights).length <= 2 && day + night <= 1 + 1e-9);
  }
  assert.deepEqual(weightsAt(SET.endBeat + TAIL), { night: 1 }, 'the show ends in the calm night, whole');
  assert.deepEqual(weightsAt(SET.endBeat + 60), { night: 1 });
});

test('the footlights: in every look of the night but the dusk itself the animals are lit from below, pale, against a darker ground and sky', () => {
  for (const id of LOOK_IDS.filter(id => LOOKS[id].night && id !== 'rose')) {
    const { hemi, sky } = LOOKS[id];
    // a side that faces the camera gets at least a third of what the afternoon's sun gives a side that faces it (the dusk gave 4 %)
    assert.ok(footlit(LOOKS[id]) >= 0.33, `${id}: the footlights give ${(footlit(LOOKS[id]) * 100).toFixed(0)} % of the afternoon's sun`);
    const ground = rgb(hemi.ground);
    assert.ok(Math.min(...ground) >= 0.65 && Math.max(...ground) >= 0.94, `${id}: the footlights are pale, so what they fall on keeps its own colours (${hemi.ground})`);
    assert.ok(luma(hemi.sky) < luma(hemi.ground) * 0.3, `${id}: what faces up (the ground) is much darker than what is lit from below`);
    assert.ok(luma(sky.zenith) < 0.2, `${id}: a dark sky`);
  }
  assert.ok(footlit(LOOKS.rose) < 0.05, 'her horn\'s dusk is as it was: no footlights');
  // so no group is cut to, close, while the dusk's own dim light is all there is (a cut list that does it wants footlights in `rose`)
  const next = LOOK_CUES.find(cue => cue.beat > DUSK_FROM);
  const closes = Object.values(GROUP_SHOTS).flatMap(shots => Object.values(shots));
  for (const cut of CAMERA.filter(cut => cut.beat >= DUSK_FROM + DUSK.sink / 2 && cut.beat < next.beat)) {
    assert.ok(!closes.includes(cut.cut), `${cut.cut} at ${cut.beat} would show a group in the dusk's dim light`);
  }
  // and every close shot of a group after it stands in a look with footlights
  for (const cut of CAMERA.filter(cut => cut.beat >= next.beat && closes.includes(cut.cut))) {
    const { to, turned } = lookAt(cut.beat + 0.5);
    assert.ok(footlit(LOOKS[to]) >= 0.33 && (turned === 1 || footlit(LOOKS[lookAt(cut.beat + 0.5).from]) >= 0.33), `${cut.cut} at ${cut.beat} is footlit (${to})`);
  }
});

test('no strobing: a look turns over a second or more, never two turns at once, nothing in the light follows the beat, and slower with less motion', () => {
  for (const cue of LOOK_CUES) {
    assert.ok(cue.turn * BEAT_SECONDS >= 1, `the turn at ${cue.beat} takes ${(cue.turn * BEAT_SECONDS).toFixed(2)} s`);
    assert.ok(turnOf(cue, true) * BEAT_SECONDS >= 3.5, `and ${(turnOf(cue, true) * BEAT_SECONDS).toFixed(2)} s with less motion`);
  }
  assert.ok(LOOK.turn >= 2 && LOOK.turn <= 3, 'about two beats');
  LOOK_CUES.slice(1).forEach((cue, k) => assert.ok(cue.beat - LOOK_CUES[k].beat >= turnOf(LOOK_CUES[k], true), `the turn at ${LOOK_CUES[k].beat} is over before the next (${cue.beat}), with less motion too`));
  assert.ok(LOOK_CUES.at(-1).beat + turnOf(LOOK_CUES.at(-1), true) <= SET.endBeat + TAIL, 'the last turn is done when the show is put away, so the look it leaves is whole');
  // no record is changed inside the rewind or Stoppdans: the light stands through both (it goes by the set's beat, as the words)
  for (const bend of [BENDS.rewind, BENDS.freeze]) assert.ok(!LOOK_CUES.some(cue => cue.beat + cue.turn > bend.from && cue.beat < bend.to), 'no turn inside a bend of the clock');
  // frame by frame, at 30 frames a second
  for (const reduced of [false, true]) {
    let before = null;
    let fastest = 0;
    for (const { setBeat } of framesOfTheSet) {
      const now = weightsAt(setBeat, { reduced });
      const turning = LOOK_CUES.some(cue => setBeat >= cue.beat && setBeat - FRAME < cue.beat + turnOf(cue, reduced));
      if (before) {
        for (const id of new Set([...Object.keys(now), ...Object.keys(before)])) {
          const step = Math.abs((now[id] ?? 0) - (before[id] ?? 0));
          fastest = Math.max(fastest, step);
          if (!turning) assert.equal(step, 0, `the light stands between two records (${id} at ${setBeat.toFixed(2)}): nothing follows the beat`);
        }
      }
      before = now;
    }
    // a whole turn at this speed would take over 0.75 s (the ease's fastest moment), with less motion over 5 s
    assert.ok(fastest * 30 < (reduced ? 0.2 : 1.3), `the fastest a look turns${reduced ? ' with less motion' : ''}: ${(fastest * 30).toFixed(2)} of its way a second`);
  }
  // with less motion every look is half as deep, as the dusk was from the start
  assert.deepEqual(weightsAt(300, { reduced: true }), { violet: 0.5 });
  assert.deepEqual(weightsAt(250, { reduced: true }), { rose: 0.5 });
  assert.ok(Math.abs(weightsAt(DUSK_FROM + 4, { reduced: true }).rose - 0.25) < 1e-9, 'and the dusk sinks as it did');
});

test('the last chorus has the brightest and the warmest look, and the night after the set is the calmest', () => {
  const finale = LOOKS[LOOK_CUES.find(cue => cue.beat === part('lastchorus').startBeat).look];
  const calm = LOOKS[LOOK_CUES.at(-1).look];
  const warmth = look => [look.sky.zenith, look.sky.horizon, look.water.zenith, look.water.horizon, look.hemi.ground, look.sun.color].reduce((sum, hex) => sum + rgb(hex)[0] - rgb(hex)[2], 0);
  for (const id of LOOK_IDS.filter(id => LOOKS[id].night && LOOKS[id] !== finale)) {
    const look = LOOKS[id];
    assert.ok(finale.exposure >= look.exposure + (look === calm ? 0.05 : 0) && finale.sun.intensity > look.sun.intensity, `the last chorus is brighter than ${id}: exposure and sun`);
    assert.ok(footlit(finale) > footlit(look) * 1.1, `and its footlights are the strongest (${footlit(finale).toFixed(2)} against ${id}'s ${footlit(look).toFixed(2)})`);
    assert.ok(luma(finale.sky.horizon) > luma(look.sky.horizon) && luma(finale.sky.zenith) > luma(look.sky.zenith), `and its sky the lightest (${id})`);
    assert.ok(warmth(finale) > warmth(look) + 0.5, `and it is the warmest (${warmth(finale).toFixed(2)} against ${id}'s ${warmth(look).toFixed(2)})`);
    if (look === calm || id === 'rose') continue;
    assert.ok(calm.sun.intensity <= look.sun.intensity && calm.exposure <= look.exposure && footlit(calm) < footlit(look), `the night after the set is calmer than ${id}`);
  }
  for (const hex of [finale.sky.zenith, finale.sky.horizon, finale.water.deep, finale.water.horizon, finale.hemi.ground, finale.sun.color]) assert.ok(rgb(hex)[0] > rgb(hex)[1] && rgb(hex)[1] > rgb(hex)[2], `${hex} is a warm colour`);
  assert.ok(footlit(calm) >= 0.33, 'and the last scene\'s faces are still lit');
});

// ---------------------------------------------------------------------------------------------
// The firefly fireworks (round 2, 2026-11-19)

const FLOWERS = FIREWORKS.filter(firework => firework.kind === 'flower');
const WILLOW = FIREWORKS.find(firework => firework.kind === 'willow');
const cutAt = setBeat => CAMERA.findLast(cut => cut.beat <= setBeat);
/** The camera of `shot` on a screen: the lens widens on a screen held upright, so the 16:10 frame's width is kept (engine/camera/director.js). */
function cameraOf(shot, [w, h]) {
  const aspect = w / h;
  const half = Math.tan((shot.fov * Math.PI) / 360);
  const camera = new THREE.PerspectiveCamera(aspect >= 1.6 ? shot.fov : (2 * Math.atan((half * 1.6) / aspect) * 180) / Math.PI, aspect, 0.1, 1200);
  camera.position.set(...shot.position);
  camera.lookAt(...shot.target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}
const sparksOf = (firework, age, options) => Array.from({ length: firework.points }, (_, j) => sparkAt(firework, j, age, {}, options)).filter(Boolean);

test('the fireworks: a flower over each group on the band\'s five last hits, in the group\'s colour, and a gold willow on the very last hit', () => {
  const hits = SET.cues.filter(cue => cue.kind === 'horn' && sectionAt(cue.beat).id === 'end').map(cue => cue.beat);
  assert.deepEqual(FLOWERS.map(flower => flower.beat), hits.slice(0, 5), 'the end\'s five hits');
  assert.deepEqual(hits.slice(0, 5), [0, 1, 2, 3, 4].map(k => part('end').startBeat + k), 'a beat apart');
  assert.deepEqual(FLOWERS.map(flower => flower.group).sort(), [...GROUPS].sort(), 'one for each group');
  FLOWERS.forEach((flower, k) => {
    const { group, beat } = flower;
    assert.ok(SET.cues.some(cue => cue.kind === 'call' && cue.beat === beat && cue.group === group), `${group} sings on ${beat}`);
    assert.equal(cutAt(beat).cut, GROUP_SHOTS[group].close, `the camera is close on ${group} at ${beat}`);
    assert.deepEqual(flower.colour, rgb(GROUP_COLOURS[group]), `${group}'s colour`);
    assert.ok(Math.hypot(flower.at[0] - CHOIR[group].at[0], flower.at[2] - CHOIR[group].at[1]) < CHOIR[group].radius, `over ${group}`);
    assert.ok(flower.at[1] - flower.radius > FAR_POOL.level, 'and over the water\'s level');
    for (const other of FLOWERS.slice(k + 1)) assert.ok(apart(GROUP_COLOURS[group], GROUP_COLOURS[other.group]) > 0.4, `${group} and ${other.group}: two colours`);
  });
  assert.deepEqual(GROUPS.map(group => FLOWERS.find(flower => flower.group === group).beat), [...hits.slice(0, 5)].reverse(), 'high to low, as the set sings them and the camera cuts them');
  assert.deepEqual([WILLOW.beat, WILLOW.group], [SET.endBeat, null], 'the willow on the last hit of all');
  assert.ok(WILLOW.colour[0] > WILLOW.colour[1] && WILLOW.colour[1] > WILLOW.colour[2] + 0.3, 'gold');
  for (const flower of FLOWERS) assert.ok(apart(GROUP_COLOURS[flower.group], '#ffc94a') > 0.3, `${flower.group}'s colour is not the willow's gold`);
  assert.ok(WILLOW.radius > 4 * Math.max(...FLOWERS.map(flower => flower.radius)), 'and much the biggest');
  // the budget: about 400 points more, all in the lights' own draw call
  const points = FIREWORKS.reduce((sum, firework) => sum + firework.points, 0);
  assert.ok(points <= FIREWORK.budget && points >= 300, `${points} points of ${FIREWORK.budget}`);
  assert.equal(FIREWORKS.length, 6);
});

test('a firework is a function of the beat: it opens fast out of its middle, hangs and sinks as it fades, and is gone before the show is put away', () => {
  const out = {};
  for (const firework of FIREWORKS) {
    const spec = FIREWORK[firework.kind];
    for (let j = 0; j < firework.points; j++) {
      assert.equal(sparkAt(firework, j, -0.01, out), false);
      assert.equal(sparkAt(firework, j, spec.life, out), false);
      const last = sparkAt(firework, j, spec.life - 0.02, {});
      assert.ok(!last || last.level < 0.01, 'faded out, not put out');
      const first = sparkAt(firework, j, 0, {});
      assert.ok(!first || Math.hypot(first.x - firework.at[0], first.y - firework.at[1], first.z - firework.at[2]) < 1e-9, 'it starts in its middle');
    }
    assert.deepEqual(sparksOf(firework, 1.3), sparksOf(firework, 1.3), 'the same beat is the same picture');
    assert.ok(spec.life <= TAIL, `gone ${(spec.life * BEAT_SECONDS).toFixed(1)} s after its hit: before the show ends, ${(TAIL * BEAT_SECONDS).toFixed(1)} s after the last`);
    const spread = age => Math.max(...sparksOf(firework, age).map(spark => Math.hypot(spark.x - firework.at[0], spark.y - firework.at[1], spark.z - firework.at[2])));
    assert.ok(firework.kind === 'flower' ? spread(0.5) > firework.radius * 0.8 : spread(1.5) > firework.radius * 0.7, 'open in half a beat, the willow in a beat and a half');
    // no jump from frame to frame, and its light only fades (but for the twinkle)
    let before = null;
    for (let age = 0; age < spec.life; age += FRAME) {
      const now = Array.from({ length: firework.points }, (_, j) => sparkAt(firework, j, age, {}));
      if (before) now.forEach((spark, j) => { if (spark && before[j]) assert.ok(Math.hypot(spark.x - before[j].x, spark.y - before[j].y, spark.z - before[j].z) < firework.radius * 0.45, 'no jump'); });
      before = now;
    }
  }
  // a flower: a flash in its middle for a third of a beat, small beside the screen; a round ball of sparks with a tail each
  for (const flower of FLOWERS) {
    const flash = sparkAt(flower, 0, 0.1, {});
    assert.ok(flash && flash.size <= flower.radius && sparkAt(flower, 0, 0.4, {}) === false, 'the flash is no bigger than the flower, and short');
    const open = sparksOf(flower, 1);
    assert.equal(open.length, FIREWORK.flower.rays * (FIREWORK.flower.tail + 1));
    const [right, top] = flower.axes;
    const side = spark => (spark.x - flower.at[0]) * right[0] + (spark.z - flower.at[2]) * right[2];
    const height = spark => (spark.x - flower.at[0]) * top[0] + (spark.y - flower.at[1]) * top[1] + (spark.z - flower.at[2]) * top[2];
    assert.ok(open.some(spark => side(spark) > flower.radius * 0.5) && open.some(spark => side(spark) < -flower.radius * 0.5) && open.some(spark => height(spark) > flower.radius * 0.5) && open.some(spark => height(spark) < -flower.radius * 0.5), 'round');
    const mean = sparks => sparks.reduce((sum, spark) => sum + spark.y, 0) / sparks.length;
    assert.ok(mean(sparksOf(flower, 4)) < mean(open) - flower.radius * 0.3, 'it sinks as it fades');
  }
  // the willow: its arms go up and out, then hang and fall, each with its tail hanging over it
  const links = FIREWORK.willow.tail + 1;
  const heads = age => sparksOf(WILLOW, age).filter((_, j) => j % links === 0);
  const meanY = sparks => sparks.reduce((sum, spark) => sum + spark.y, 0) / sparks.length;
  assert.equal(sparksOf(WILLOW, 2).length, FIREWORK.willow.arms * links);
  assert.ok(meanY(heads(1)) > WILLOW.at[1] + 1.5, 'up and out of its middle');
  assert.ok(meanY(heads(4.4)) < meanY(heads(1)) - 5, `it falls: ${(meanY(heads(1)) - meanY(heads(4.4))).toFixed(1)} m in its life`);
  assert.ok(meanY(heads(2.4)) > meanY(heads(4.4)) + 3 && meanY(heads(2.4)) > WILLOW.at[1] - 1, 'and hangs in the air half way through it');
  const late = sparksOf(WILLOW, 4);
  let hanging = 0;
  for (let arm = 0; arm < FIREWORK.willow.arms; arm++) if (late[arm * links + links - 1].y > late[arm * links].y + 1) hanging++;
  assert.ok(hanging >= FIREWORK.willow.arms * 0.9, `${hanging} of ${FIREWORK.willow.arms} tails hang over their sparks`);
  // with less motion nothing flies: it fades in where it would stand open, half the size, and fades out
  for (const firework of FIREWORKS) {
    const [early, later] = [1, 2].map(age => sparksOf(firework, age, { reduced: true }));
    early.forEach((spark, j) => assert.deepEqual([spark.x, spark.y, spark.z], [later[j].x, later[j].y, later[j].z], 'it stands still'));
    assert.ok(Math.max(...early.map(spark => spark.size)) <= firework.size * 0.75 && sparksOf(firework, 0.05, { reduced: true }).every(spark => spark.level < 0.1), 'small, and faded in');
    assert.ok(firework.kind === 'willow' || sparkAt(firework, 0, 0.1, {}, { reduced: true }) === false, 'no flash');
  }
});

test('each firework is inside the picture of the shot it is seen in, on a tablet held flat and on one held upright', () => {
  for (const screen of SCREENS) {
    for (const firework of FIREWORKS) {
      const cut = cutAt(firework.beat);
      const until = CAMERA.find(other => other.beat > cut.beat)?.beat ?? Infinity; // the shot's last beat on the screen
      const seen = Math.min(FIREWORK[firework.kind].life, until - firework.beat);
      const name = `${firework.group ?? 'the willow'} in ${cut.cut} on ${screen.join('x')}`;
      assert.ok(seen >= 1, `${name}: its shot holds it a beat at least`);
      assert.ok(cut.beat === firework.beat && !cut.then, `${name}: the shot is cut to on its hit and stands still`);
      const camera = cameraOf(SHOTS[cut.cut], screen);
      const middle = new THREE.Vector3(...firework.at).project(camera);
      assert.ok(Math.abs(middle.x) < 0.3 && middle.y > 0.05 && middle.y < 0.6 && middle.z < 1, `${name}: its middle stands in the upper half of the picture (${middle.x.toFixed(2)}, ${middle.y.toFixed(2)})`);
      let [lit, inside] = [0, 0];
      const p = new THREE.Vector3();
      for (let age = 0.05; age < seen; age += 0.1) {
        for (const spark of sparksOf(firework, age).filter(spark => spark.level > 0.05)) {
          p.set(spark.x, spark.y, spark.z).project(camera);
          lit++;
          if (Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1) inside++;
        }
      }
      assert.ok(lit > 0 && inside / lit >= 0.92, `${name}: ${inside} of ${lit} lit sparks are in the picture`);
      // and big in it: it spans a good part of the picture's width
      const [right] = firework.axes;
      const edge = new THREE.Vector3(...firework.at.map((v, n) => v + right[n] * firework.radius)).project(camera);
      assert.ok(edge.x - middle.x > (firework.kind === 'willow' ? 0.25 : 0.12), `${name}: ${(edge.x - middle.x).toFixed(2)} of half the picture's width to a side`);
    }
  }
  // inShot: the middle of the picture, its edge, and a point up in it
  const shot = SHOTS[cutAt(SET.endBeat).cut];
  const camera = cameraOf(shot, [1280, 800]);
  const at = (...where) => new THREE.Vector3(...inShot(shot, ...where).at).project(camera);
  assert.ok(Math.abs(at(20).x) < 1e-9 && Math.abs(at(20).y) < 1e-9);
  assert.ok(Math.abs(at(20, 1, 0).x - 1) < 1e-9 && Math.abs(at(20, 0, 0.5).y - 0.5) < 1e-9 && Math.abs(at(7, -0.5, -1).x + 0.5) < 1e-9);
});

test('the show draws the record\'s look and the fireworks: by the set\'s beat, in its two draw calls, and with no light added', () => {
  const { world, c, light } = smallWorld();
  const was = light();
  const lightsIn = () => { let n = 0; world.scene.traverse(object => { if (object.isLight) n++; }); return n; };
  const lamps = lightsIn();
  const show = createShow(c);
  const { sun, hemi } = world.lighting;
  const water = world.forest.materials.water.uniforms;
  const quiet = setBeat => liftAt(danceBeatAt(setBeat).beat) === 0;
  // by day: a tint
  const honey = LOOK_CUES.find(cue => cue.look === 'honey').beat + LOOK.turn + 1;
  assert.ok(quiet(honey));
  show.update(video(honey));
  assert.notEqual(light(), was, 'the turtles\' record tints the afternoon');
  assert.ok(Math.abs(sun.intensity - DAY.sun) < 1e-9 && world.renderer.toneMappingExposure === 1, 'as bright as it was');
  const back = LOOK_CUES.find(cue => cue.beat > honey).beat + LOOK.turn + 1;
  show.update(video(back));
  assert.ok(quiet(back));
  assert.equal(light(), was, 'the basic record again: the afternoon as it is');
  // in the night: the record's colours, the same at any beat of it, footlights and water and all
  const [a, b] = [330, 345];
  assert.ok(quiet(a) && quiet(b) && lookAt(a).to === 'violet' && lookAt(b).to === 'violet');
  show.update(video(a));
  const violet = light();
  show.update(video(b));
  assert.equal(light(), violet, 'one look through a record, whatever the beat');
  assert.equal(`#${hemi.groundColor.getHexString()}`, LOOKS.violet.hemi.ground, 'the footlights: the fill light\'s colour from below');
  assert.ok(Math.abs(hemi.intensity - DAY.fill * LOOKS.violet.hemi.intensity) < 1e-9);
  assert.deepEqual([`#${water.uDeep.value.getHexString()}`, `#${water.uGlint.value.getHexString()}`], [LOOKS.violet.water.deep, LOOKS.violet.water.glint], 'the water takes the colour');
  // the rewind and Stoppdans do not move the light
  for (const bend of [BENDS.rewind, BENDS.freeze]) {
    show.update(video(bend.from + (bend.to - bend.from) / 2));
    assert.equal(`#${hemi.groundColor.getHexString()}`, LOOKS.violet.hemi.ground);
    assert.equal(`#${world.sky.dome.material.uniforms.uZenith.value.getHexString()}`, LOOKS.violet.sky.zenith);
  }
  const carnival = part('carnival').startBeat + LOOK.turn + 1;
  show.update(video(carnival));
  assert.equal(`#${world.sky.dome.material.uniforms.uZenith.value.getHexString()}`, LOOKS.teal.sky.zenith, 'a new record: a new sky');
  assert.equal(lightsIn(), lamps, 'no light is added: the two the place has, and uniforms');
  // the fireworks: sparks among the lights, in the group's colour, where the score has them; a held beat is one picture
  const frogs = FLOWERS.find(flower => flower.group === 'frogs');
  show.update(video(frogs.beat + 0.5));
  const near = (light, firework) => Math.hypot(...light.position.map((v, n) => v - firework.at[n])) <= firework.radius * 1.05;
  const sparks = drawn(show).lights.filter(light => near(light, frogs) && Math.abs(light.colour[1] - Math.fround(frogs.colour[1])) < 1e-6);
  assert.equal(sparks.length, FIREWORK.flower.rays * (FIREWORK.flower.tail + 1), 'the frogs\' flower, half a beat after their hit');
  const held = drawn(show);
  show.update(video(100));
  show.update(video(frogs.beat + 0.5));
  assert.deepEqual(drawn(show), held);
  show.update(video(SET.endBeat + 1.5));
  const golds = new Set(sparksOf(WILLOW, 1.5).map(spark => [spark.r, spark.g, spark.b].map(Math.fround).join())); // the willow's own golds: its sparks' and their tails'
  const ofWillow = () => drawn(show).lights.filter(light => golds.has(light.colour.slice(0, 3).join())).length;
  assert.equal(ofWillow(), WILLOW.points, 'the willow, all of it');
  assert.equal(world.scene.children.length, 2, 'still two draw calls');
  assert.ok(show.parts.lights.count <= show.parts.lights.capacity - 100, 'and room to spare among the lights');
  show.update(video(SET.endBeat + TAIL));
  assert.equal(ofWillow(), 0, 'gone as the show ends');
  show.dispose();
  assert.equal(light(), was);
  // with less motion: every look half as deep, and the sparks half the size
  const calm = smallWorld({ reduced: true });
  const less = createShow(calm.c);
  less.update(video(a));
  assert.ok(Math.abs(less.parts.dusk.depth - 0.5) < 1e-9);
  less.update(video(frogs.beat + 1));
  const small = drawn(less).lights.filter(light => near(light, frogs) && Math.abs(light.colour[1] - Math.fround(frogs.colour[1])) < 1e-6);
  assert.ok(small.length > 20 && small.every(light => light.shape[0] <= frogs.size * 0.75 + 1e-6), 'small sparks, standing');
  less.dispose();
});
