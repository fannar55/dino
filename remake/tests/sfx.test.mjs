import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSfx, SAMPLES, KAFLI6_PICKED } from '../engine/audio/sfx.js';
import { createScene } from '../engine/scene/scene.js';
import { DONE } from '../engine/handle.js';
import { centsFromKey, createFakeContext, peakThrough, pitchesOf } from './fake-audio.mjs';

const THEME = JSON.parse(fs.readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8'));
const NAMES = ['forest', 'step', 'frog', 'snail', 'beetle', 'birds', 'butterfly', 'flower', 'plate', 'star', 'journal', 'saddle', 'float', 'mapOpen', 'mapPen', 'sloedlaHorn', 'littleRoar'];
const ONE_SHOTS = NAMES.filter(name => name !== 'forest');
const MELODIC = ['plate', 'star', 'flower', 'journal', 'saddle', 'float']; // the sounds made of bells

/** A tiny seeded random, so the birds and the croaks are the same on every run. */
const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

function setup(options = {}) {
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: THEME, random: seeded(7), ...options });
  return { context, sfx };
}

test('sfx plays each named sound once per call and ignores unknown names', () => {
  const { context, sfx } = setup();
  for (const name of NAMES) {
    const before = context.started.length;
    assert.equal(sfx.play(name), true, `${name} is a sound`);
    const made = context.started.length - before;
    assert.ok(made > 0, `${name} starts something`);
    context.advance(10); // the sound finishes
    if (name === 'forest') continue; // a loop that is laid once: the next test
    const again = context.started.length;
    assert.equal(sfx.play(name), true);
    assert.equal(context.started.length - again, made, `${name} plays the same again: once per call, not piling up or thinning out`);
    context.advance(10);
  }

  const nodes = context.nodes.length;
  for (const name of ['nope', '', 'Frog', ' frog', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined, null, 42, {}, ['frog']]) {
    assert.equal(sfx.play(name), false, `${String(name)} is nothing`);
  }
  assert.equal(context.nodes.length, nodes, 'an unknown name does not so much as make a node');
});

test('the forest is one quiet loop of wind, with birds and rustles that come and go over it on the game clock', () => {
  const { context, sfx } = setup();
  assert.equal(sfx.play('forest'), true);
  const beds = context.bufferSources.filter(source => source.loop);
  assert.equal(beds.length, 1, 'one looping bed of wind');
  assert.equal(beds[0].stopTime, undefined, 'it does not end by itself');
  assert.ok(beds[0].reaches(context.destination));
  const started = context.started.length;
  assert.equal(sfx.play('forest'), false, 'asking again lays no second bed over the first');
  assert.equal(context.started.length, started);

  // Nothing is scheduled while the clock stands still: a held game asks for no new birds.
  for (let i = 0; i < 1000; i++) sfx.update(0);
  assert.equal(context.started.length, started);

  // Every 4.3 to 7.6 s of game time a bird calls, or the leaves rustle.
  const calls = [];
  let seen = started;
  for (let t = 0; t < 240; t += 0.25) {
    sfx.update(0.25);
    context.advance(0.25);
    if (context.started.length > seen) {
      calls.push(t);
      seen = context.started.length;
    }
  }
  assert.ok(calls.length >= 240 / 7.8 - 1 && calls.length <= 240 / 4.1 + 1, `${calls.length} calls in 240 s`);
  calls.slice(1).forEach((t, i) => {
    const gap = t - calls[i];
    assert.ok(gap >= 4.2 && gap <= 7.8, `${gap} s between calls`);
  });
  assert.ok(context.oscillators.some(note => pitchesOf(note).some(hz => hz > 1000)), 'with birdsong in it');
  assert.ok(context.bufferSources.filter(source => !source.loop).length > 0, 'and rustles');

  // It is quiet: the bed reaches the speakers far below any effect (a footfall is about 0.5).
  assert.ok(peakThrough(beds[0], context.destination) < 0.03, `${peakThrough(beds[0], context.destination)}`);

  sfx.stop();
  context.advance(5);
  assert.ok(beds[0].ended, 'stop ends the wind');
  const after = context.started.length;
  for (let i = 0; i < 400; i++) sfx.update(0.25);
  assert.equal(context.started.length, after, 'and the birds with it');
  assert.equal(sfx.play('forest'), true, 'the forest can be laid again');
});

test('a forest asked for while sound is still waking is laid the moment sound is allowed, and not after it is stopped', () => {
  // The scene asks for the forest on its first frame, and the audio context takes a moment to wake after the touch.
  const context = createFakeContext({ state: 'suspended' });
  const sfx = createSfx({ context, theme: THEME, random: seeded(3) });
  assert.equal(sfx.play('forest'), false, 'not yet');
  sfx.update(0.016);
  assert.equal(context.started.length, 0);

  context.setState('running');
  sfx.update(0.016);
  assert.equal(context.bufferSources.filter(source => source.loop).length, 1, 'the bed is laid on the next frame');
  assert.equal(sfx.play('forest'), false, 'and asking again lays no second');
  sfx.update(0.016);
  assert.equal(context.bufferSources.filter(source => source.loop).length, 1);

  // A forest the scene gave up on before sound woke is not laid afterwards.
  const other = createFakeContext({ state: 'suspended' });
  const quiet = createSfx({ context: other, theme: THEME });
  quiet.play('forest');
  quiet.stop();
  other.setState('running');
  quiet.update(0.016);
  assert.equal(other.started.length, 0);

  // Nor while the book is open or the effects are muted: it waits for them.
  const held = createFakeContext({ state: 'running' });
  const waiting = createSfx({ context: held, theme: THEME });
  waiting.setPaused(true);
  assert.equal(waiting.play('forest'), false);
  waiting.update(0.016);
  assert.equal(held.started.length, 0);
  waiting.setPaused(false);
  waiting.update(0.016);
  assert.equal(held.bufferSources.filter(source => source.loop).length, 1);
});

test('the plate and the star, and the other bell sounds, are tuned to theme.json\'s key', () => {
  const elsewhere = [440, 495, 556.25, 660, 742.5]; // A major pentatonic, so a test cannot pass by luck
  for (const key of [THEME.key, elsewhere]) {
    const { context, sfx } = setup({ theme: { ...THEME, key } });
    for (const name of MELODIC) {
      const before = context.oscillators.length;
      sfx.play(name);
      context.advance(10);
      const notes = context.oscillators.slice(before);
      assert.ok(notes.length >= 2, `${name} rings`);
      for (const note of notes) {
        for (const hz of pitchesOf(note)) assert.ok(centsFromKey(hz, key) < 1, `${name}: ${hz} Hz is within a cent of the key ${key}`);
      }
    }
  }

  // Without a theme.json there is still a key (C major), so they never go out of tune with each other.
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: null });
  sfx.play('star');
  assert.ok(context.oscillators.length >= 2);
});

test('the star climbs up the scale as it rises, and a plate lights with more than one note', () => {
  const { context, sfx } = setup();
  const lowestAt = notes => {
    const at = new Map(); // when a note begins -> the lowest pitch that begins then (a bell's body, under its overtone)
    for (const note of notes) at.set(note.starts[0].when, Math.min(at.get(note.starts[0].when) ?? Infinity, pitchesOf(note)[0]));
    return [...at.entries()].sort((a, b) => a[0] - b[0]).map(([, hz]) => hz);
  };
  sfx.play('star');
  const climb = lowestAt(context.oscillators);
  assert.ok(climb.length >= 4, `${climb.length} notes`);
  climb.slice(1).forEach((hz, i) => assert.ok(hz > climb[i], `note ${i + 2} (${hz} Hz) is above the one before (${climb[i]} Hz)`));

  context.advance(10);
  const before = context.oscillators.length;
  sfx.play('plate');
  assert.ok(new Set(lowestAt(context.oscillators.slice(before))).size >= 3, 'a row lights with a little chord');
});

test('Mosi\'s footfall is a low thump that falls on alternate sides', () => {
  const { context, sfx } = setup();
  const sides = [];
  for (let i = 0; i < 4; i++) {
    const before = context.of('panner').length;
    sfx.play('step');
    context.advance(1);
    const pans = new Set(context.of('panner').slice(before).map(panner => panner.pan.valueAt(1e9)));
    assert.equal(pans.size, 1, 'both halves of a footfall are on the same side');
    sides.push(Math.sign([...pans][0]));
  }
  assert.deepEqual(sides.map(Math.abs), [1, 1, 1, 1]);
  assert.equal(new Set(sides).size, 2);
  sides.slice(1).forEach((side, i) => assert.notEqual(side, sides[i], 'left, right, left, right'));
  assert.ok(context.oscillators.every(note => pitchesOf(note).every(hz => hz < 200)), 'a big animal: nothing high');
});

test('nothing sounds before the first touch, while muted, or while the game is held', () => {
  const asleep = createFakeContext({ state: 'suspended' });
  const sleeper = createSfx({ context: asleep, theme: THEME });
  for (const name of NAMES) assert.equal(sleeper.play(name), false, `${name}: the browser has not allowed sound yet`);
  sleeper.update(1);
  assert.equal(asleep.started.length, 0);
  asleep.setState('running');
  assert.equal(sleeper.play('frog'), true, 'the first touch lets it');

  const { context, sfx } = setup();
  sfx.muted = true;
  assert.equal(sfx.muted, true);
  for (const name of NAMES) assert.equal(sfx.play(name), false, `${name} while muted`);
  assert.equal(context.started.length, 0);
  sfx.muted = false;

  assert.equal(sfx.play('forest'), true);
  const master = context.lastGains[0];
  assert.equal(master.gain.valueAt(context.currentTime + 5), 1);
  sfx.setPaused(true);
  assert.ok(master.gain.valueAt(context.currentTime + 1) < 0.001, 'the book is open: the forest goes quiet, its tails with it');
  assert.equal(sfx.play('frog'), false, 'and nothing new sounds');
  const held = context.started.length;
  for (let i = 0; i < 400; i++) sfx.update(0.25);
  assert.equal(context.started.length, held);
  sfx.setPaused(false);
  assert.ok(master.gain.valueAt(context.currentTime + 1) > 0.999, 'and it comes back');
  assert.equal(sfx.play('frog'), true);
});

test('a muted forest lays no new birds, and a page with no Web Audio has silent effects', () => {
  const { context, sfx } = setup();
  sfx.play('forest');
  context.advance(1);
  sfx.muted = true;
  const before = context.started.length;
  for (let i = 0; i < 400; i++) sfx.update(0.25);
  assert.equal(context.started.length, before);

  for (const nothing of [null, undefined]) {
    const silent = createSfx({ context: nothing, theme: THEME });
    for (const name of NAMES) assert.equal(silent.play(name), false);
    silent.update(1);
    silent.setPaused(true);
    silent.stop();
    silent.muted = true;
    assert.equal(silent.muted, true);
  }
});

test('a child tapping fast does not pile sounds up', () => {
  const { context, sfx } = setup();
  let played = 0;
  for (let i = 0; i < 100; i++) if (sfx.play('frog')) played++;
  assert.equal(played, 1, 'a croak is not on top of another croak');

  context.advance(5);
  played = 0;
  for (let i = 0; i < 200; i++) if (sfx.play('plate')) played++;
  assert.ok(played >= 4 && played < 20, `${played} plates sounded at once`);
  const live = context.started.filter(source => !source.ended).length;
  assert.ok(live <= 64, `${live} notes at once`);

  context.advance(30);
  assert.equal(sfx.play('plate'), true, 'once they have died away, new ones play');
  assert.ok(context.started.filter(source => source.ended).every(source => source.disconnected), 'and a finished sound lets go of its nodes');
});

test('every sound ends by itself and stays well below clipping', () => {
  for (const name of ONE_SHOTS) {
    const { context, sfx } = setup();
    sfx.play(name);
    const sources = [...context.started];
    for (const source of sources) {
      assert.ok(source.stopTime !== undefined, `${name}: every note has an end`);
      assert.ok(source.stopTime - context.currentTime < 4, `${name}: and it comes soon`);
    }
    // The envelopes close on silence, so a note stopped at its end does not click.
    for (const gain of context.of('gain')) {
      const last = gain.gain.events.at(-1);
      if (last?.type === 'exponential') assert.ok(last.value <= 0.0001, `${name}: a note fades to nothing`);
    }
    // The loudest the sound can be: the notes that sound together, each at its peak.
    const notes = sources.map(source => ({ from: source.starts[0].when, to: source.stopTime, peak: peakThrough(source, context.destination) }));
    const loudest = Math.max(...notes.map(a => notes.filter(b => b.from <= a.from && a.from < b.to).reduce((sum, b) => sum + b.peak, 0)));
    assert.ok(loudest > 0.05 && loudest <= 0.6, `${name}: ${loudest.toFixed(3)} at most`);
    context.advance(10);
    assert.ok(sources.every(source => source.ended && source.disconnected), `${name}: it lets go when it is done`);
  }
});

// ---------------------------------------------------------------------------------------------
// s.sfx

function stageWith(extra) {
  return createScene({ world: { actors: new Map() }, director: { stop() {}, handheld() {} }, ui: { reset() {} }, voice: { stop() {} }, ...extra });
}

test('s.sfx plays a sound by name and is done at once', () => {
  const played = [];
  const { s } = stageWith({ sfx: { play: name => { played.push(name); return true; } } });
  assert.equal(s.sfx('frog'), DONE);
  assert.equal(s.sfx('plate'), DONE);
  assert.deepEqual(played, ['frog', 'plate']);
  assert.equal(s.sfx('no-such-sound'), DONE, 'an unknown name is the effects\' business, and does nothing');
});

test('s.sfx makes no sound while the scene is seeking: the replay of a capture is silent, critter reactions included', () => {
  const played = [];
  const stage = stageWith({ sfx: { play: name => { played.push(name); return true; } } });
  stage.seeking = true;
  assert.equal(stage.s.sfx('frog'), DONE);
  assert.deepEqual(played, []);
  stage.seeking = false;
  stage.s.sfx('frog');
  assert.deepEqual(played, ['frog']);
});

test('s.sfx says what it needs when the scene has no effects', () => {
  const { s } = stageWith({});
  assert.throws(() => s.sfx('frog'), /s\.sfx needs .*sfx/);
  const stage = stageWith({});
  stage.seeking = true;
  assert.throws(() => stage.s.sfx('frog'), /s\.sfx needs/, 'also in a capture: a missing dependency is a bug in either');
});

test('stopping the scene stops the forest loop it started', () => {
  let stopped = 0;
  const stage = stageWith({ sfx: { play: () => true, stop: () => { stopped++; } } });
  stage.stop();
  assert.equal(stopped, 1);
  assert.doesNotThrow(() => stageWith({}).stop(), 'a scene without effects stops as before');
  assert.doesNotThrow(() => stageWith({ sfx: { play: () => true } }).stop(), 'and effects without a stop');
});

// Chapter 4's end (spec 4.7) and chapter 5's beginning: Slóeðla, unseen in the reed across the far pool, blows her horn, and the song
// will not come. One long note through her hollow crest that slips flat as it goes, wavers and sinks away: false and sad.
test('Slóeðla\'s horn from the far reed: one low, hollow note that will not hold, slipping flat and sinking away', () => {
  const { context, sfx } = setup();
  assert.equal(sfx.play('sloedlaHorn', { pan: -0.4 }), true);
  const voices = context.oscillators.filter(note => pitchesOf(note).some(hz => hz > 30));
  const wobble = context.oscillators.filter(note => pitchesOf(note).every(hz => hz < 12));
  assert.ok(voices.length >= 2, 'her note and its hollow under it');
  assert.ok(voices.every(note => pitchesOf(note).every(hz => hz < 400)), 'a big animal\'s horn: low');
  const [note] = voices.sort((a, b) => b.frequency.valueAt(0.5) - a.frequency.valueAt(0.5));
  const held = note.frequency.valueAt(0.5);
  const wrong = note.frequency.valueAt(1.8) / held;
  assert.ok(wrong < 0.97 && wrong > 0.88, `it slips flat, less than a whole tone, not a new note: ${wrong.toFixed(3)} of where it held`);
  assert.ok(note.frequency.valueAt(2.6) / held < 0.9, `and sinks away: ${(note.frequency.valueAt(2.6) / held).toFixed(3)}`);
  assert.ok(wobble.length >= 1 && wobble[0].outputs.some(out => out.outputs?.includes(note.frequency)), 'and wavers: a slow wobble on its pitch');
  const ends = voices.map(source => source.stopTime);
  assert.ok(ends.every(end => end >= 2.4 && end <= 3.6), `about three seconds long: ${ends}`);
  assert.ok(context.of('filter').some(filter => filter.type === 'lowpass'), 'through her crest: dull, hollow');
  assert.ok(context.of('panner').some(panner => panner.pan.valueAt(1) === -0.4), 'from the side it is asked to come from');
  assert.ok(voices.every(source => source.reaches(context.destination)));
  const loudest = Math.max(...voices.map(source => peakThrough(source, context.destination)));
  assert.ok(loudest > 0.04 && loudest <= 0.2, `far off, under the voices: ${loudest.toFixed(3)}`);
});

// ---------------------------------------------------------------------------------------------
// Chapter 6's recordings (assets/audio/kafli6/CREDITS.md): her footfall is "Grameðla kemur!"'s; the other six wait for the owner's
// picks (KAFLI6_PICKED), and until then have no file to fetch and play their made sound in its place.

const KAFLI6 = ['mosiRoar', 'hoofStone', 'stoneRock', 'frogSplash', 'wetStep', 'mountainWind', 'gramedlaThump'];
const CREDITS6 = new URL('../assets/audio/kafli6/CREDITS.md', import.meta.url);
const urlsOf = sample => sample.urls ?? (sample.url ? [sample.url] : []);

/** A fetch that answers every url with a few bytes, and remembers what it was asked for. */
function fakeFetch() {
  const asked = [];
  const fetch = url => {
    asked.push(String(url));
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  };
  return { asked, fetch };
}
async function withFetch(fetch, run) {
  const was = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = was;
  }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('every chapter 6 sample has its file, a made sound instead, and a line in CREDITS.md with its author and licence', async () => {
  const credits = fs.readFileSync(CREDITS6, 'utf8');
  for (const name of KAFLI6) {
    const sample = SAMPLES[name];
    assert.ok(sample, `${name} is a sample`);
    // its made sound: one of the game's own, which plays on a page that has none of the files
    assert.equal(typeof sample.instead, 'string', `${name} has a made sound instead`);
    assert.ok(!Object.hasOwn(SAMPLES, sample.instead), `${name}: ${sample.instead} is a made sound, not a recording`);
    const { context, sfx } = setup();
    assert.equal(sfx.play(sample.instead), true, `${name}: ${sample.instead} plays`);
    assert.ok(context.started.length > 0, `${name}: ${sample.instead} starts something`);
    // its files: none until it is picked (nothing is fetched that is not there); once picked, each there and credited
    const urls = urlsOf(sample);
    const picked = name === 'gramedlaThump' || Object.hasOwn(KAFLI6_PICKED, name);
    if (!picked) {
      assert.deepEqual(urls, [], `${name}: no file until the owner has picked one`);
      continue;
    }
    assert.ok(urls.length > 0, `${name}: its files`);
    for (const url of urls) {
      const file = fileURLToPath(url);
      assert.ok(fs.existsSync(file), `${name}: ${file} is there`);
      const base = file.split(/[\\/]/).at(-1);
      const line = credits.split('\n').find(l => l.startsWith('|') && l.includes(base));
      assert.ok(line, `${name}: CREDITS.md has a line for ${base}`);
      assert.match(line, / by [^,|]+/, `${name}: ${base}'s line names its author`);
      assert.match(line, /CC0 1\.0|CC BY 4\.0|CC BY 3\.0|ElevenLabs/, `${name}: ${base}'s line names its licence`);
    }
  }
  assert.match(credits, /thump\.mp3.*Beefmaster69.*CC0 1\.0/, 'her footfall as "Grameðla kemur!" credits it');
});

test('a chapter 6 sample with no file plays its made sound, and asks for no file at all', async () => {
  const { asked, fetch } = fakeFetch();
  await withFetch(fetch, async () => {
    const context = createFakeContext({ state: 'running' });
    const sfx = createSfx({ context, theme: THEME, random: seeded(5), recorded: true });
    await settle();
    assert.ok(asked.some(url => url.endsWith('gramedla3d/hljod/thump.mp3')), 'her footfall is fetched');
    assert.deepEqual(asked.filter(url => url.includes('/kafli6/')), [], 'no chapter 6 file is asked for before it is picked');
    for (const name of KAFLI6.filter(n => !Object.hasOwn(KAFLI6_PICKED, n) && n !== 'gramedlaThump' && !SAMPLES[n].loop)) {
      const before = context.started.length;
      assert.equal(sfx.play(name), true, name);
      assert.ok(context.started.length > before, `${name}: its made sound (${SAMPLES[name].instead}) is heard`);
      context.advance(5);
    }
  });
});

test('a recorded sample plays through a low-pass when the play asks for one, and its level and side as asked', async () => {
  const { fetch } = fakeFetch();
  await withFetch(fetch, async () => {
    const context = createFakeContext({ state: 'running' });
    const sfx = createSfx({ context, theme: THEME, random: seeded(5), recorded: true });
    await settle();
    const before = context.of('filter').length;
    assert.equal(sfx.play('gramedlaRoar', { level: 0.2, cutoff: 700, pan: -0.7 }), true);
    const [source] = context.bufferSources.slice(-1);
    const filters = context.of('filter').slice(before);
    assert.equal(filters.length, 1, 'one low-pass');
    assert.equal(filters[0].type, 'lowpass');
    assert.equal(filters[0].frequency.valueAt(0.1), 700);
    assert.ok(source.reaches(context.destination));
    assert.ok(context.of('panner').some(panner => panner.pan.valueAt(0.1) === -0.7), 'from her side');
    context.advance(10);
    const plain = context.of('filter').length;
    sfx.play('gramedlaRoar', { level: 1 });
    assert.equal(context.of('filter').length, plain, 'and none when the play asks for none');
  });
});

test('the mountain wind is a soft loop laid once, faded out when asked, and stood in for by the forest\'s wind until it has a file', async () => {
  const { fetch } = fakeFetch();
  await withFetch(fetch, async () => {
    const context = createFakeContext({ state: 'running' });
    const sfx = createSfx({ context, theme: THEME, random: seeded(5), recorded: true });
    await settle();
    sfx.play('forest', { calls: false, level: 0, seconds: 3 });
    assert.equal(SAMPLES.mountainWind.loop, true);
    assert.equal(sfx.play('mountainWind', { level: 0.6, seconds: 3 }), true);
    const loops = () => context.bufferSources.filter(source => source.loop && source.started && !source.ended);
    if (!Object.hasOwn(KAFLI6_PICKED, 'mountainWind')) {
      // no file yet: the forest's own wind (its bed, calls off) is what is heard, at the wind's level
      assert.equal(loops().length, 1, 'one bed of wind');
      context.advance(4);
      assert.ok(context.of('gain').some(gain => Math.abs(gain.gain.valueAt(context.currentTime) - 0.8 * 0.6) < 1e-6), 'the beds\' bus at the wind\'s level');
    }
    sfx.play('mountainWind', { level: 0, seconds: 2 });
    sfx.play('forest', { calls: false, level: 1, seconds: 2 });
    context.advance(4);
    assert.ok(context.of('gain').some(gain => Math.abs(gain.gain.valueAt(context.currentTime) - 0.8) < 1e-6), 'the forest back as it was');
  });
});
