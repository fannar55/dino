// Chapter 4's recorded flight sounds (Task 16, spec 8): the owner's picks in assets/audio/kafli4/hljod, played by
// engine/audio/flight-sounds.js (the loops and the wings, whooshes and gusts) and engine/audio/sfx.js (the skim, the turtle and the
// small lizards), each credited in assets/audio/kafli4/CREDITS.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFakeContext } from './fake-audio.mjs';
import { createFlightSounds, loadFlightRecordings, FLIGHT_SOUND, FLIGHT_LOOPS, FLIGHT_SHOTS } from '../engine/audio/flight-sounds.js';
import { createSfx, SAMPLES } from '../engine/audio/sfx.js';
import { riverSound } from '../chapters/kafli4-flight.js';
import { createRoute, GORGE } from '../chapters/kafli4-route.js';
import { PLAY, ANSWER } from '../chapters/kafli4-flight-play.js';

const HLJOD = new URL('../assets/audio/kafli4/hljod/', import.meta.url);
const readJson = url => JSON.parse(fs.readFileSync(url, 'utf8'));

/** A store of recordings, as loadFlightRecordings gives one: every file decoded (now, or when `later()` is called). */
function fakeStore(context, { now = true } = {}) {
  const files = [...new Set([...Object.values(FLIGHT_LOOPS).flat().map(([file]) => file), ...Object.values(FLIGHT_SHOTS).flat()])];
  const buffers = new Map(files.map(file => [file, Object.assign(context.createBuffer(2, 44100, 44100), { file })]));
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let open = now;
  if (now) release(true);
  return {
    get: file => (open ? buffers.get(file) : undefined),
    ready,
    later() { open = true; release(true); },
    buffers,
  };
}

/** The node the flight's sounds hold with (its master): the one gain that feeds `out`. */
const masterOf = (context, out) => context.nodes.find(node => node.outputs.includes(out));
const settle = () => new Promise(resolve => setImmediate(resolve));

test('the airflow follows her speed: never quieter faster, 0.3 of its full gain at 8 m/s, full at 18, and 1.4 times in a burst', () => {
  for (const recorded of [false, true]) {
    const context = createFakeContext({ state: 'running' });
    const sounds = createFlightSounds({ context, output: context.destination, recordings: recorded ? fakeStore(context) : null });
    sounds.start();
    context.advance(2);
    const at = v => { sounds.setSpeed(v); context.advance(3); return sounds.bed.gain; };
    let last = -1;
    for (let v = 0; v <= 26; v += 1) {
      const gain = at(v);
      assert.ok(gain >= last - 1e-6, `${recorded ? 'recorded' : 'made'}: ${gain} at ${v} m/s after ${last}`);
      last = gain;
    }
    assert.equal(sounds.bed.recorded, recorded);
    const slow = at(FLIGHT_SOUND.slow);
    const fast = at(FLIGHT_SOUND.fast);
    assert.ok(Math.abs(slow / fast - FLIGHT_SOUND.quiet) < 0.01, `${slow} at 8 m/s, ${fast} at 18`);
    sounds.burst(2.5);
    context.advance(1);
    assert.ok(Math.abs(sounds.bed.gain / fast - FLIGHT_SOUND.burst) < 0.02, `a burst: ${sounds.bed.gain} against ${fast}`);
    context.advance(4);
    assert.ok(Math.abs(sounds.bed.gain / fast - 1) < 0.02, `and back after it: ${sounds.bed.gain}`);
    sounds.stop();
  }
});

test('the recorded loops play once they have decoded, and the made ones give way to them', async () => {
  const context = createFakeContext({ state: 'running' });
  const store = fakeStore(context, { now: false });
  const sounds = createFlightSounds({ context, output: context.destination, recordings: store });
  sounds.start();
  context.advance(1);
  assert.equal(sounds.bed.recorded, false, 'made wind until the recordings are here');
  const made = context.bufferSources.filter(s => s.started);
  assert.ok(made.length >= 4 && made.every(s => !store.buffers.has(s.buffer?.file)));
  store.later();
  await settle();
  context.advance(2);
  assert.equal(sounds.bed.recorded, true);
  const playing = file => context.bufferSources.filter(s => s.buffer?.file === file && s.soundingAt(context.currentTime));
  for (const [file] of Object.values(FLIGHT_LOOPS).flat()) {
    const [source] = playing(file);
    assert.ok(source, `${file} plays`);
    assert.equal(source.loop, true, `${file} loops`);
  }
  assert.ok(made.every(s => s.stopTime !== undefined && s.stopTime <= context.currentTime), 'the made loops stopped');
  sounds.stop();
});

test('pausing silences every loop and every one-shot, and none starts while it is held', () => {
  const context = createFakeContext({ state: 'running' });
  const out = context.createGain();
  const sounds = createFlightSounds({ context, output: out, recordings: fakeStore(context) });
  sounds.start();
  for (const name of ['water', 'rapids', 'falls', 'gorge']) sounds[name](1);
  sounds.setSpeed(18);
  sounds.wingbeat();
  sounds.whoosh(1);
  sounds.gust();
  context.advance(2);
  const master = masterOf(context, out);
  const started = context.bufferSources.filter(s => s.started);
  assert.ok(started.length >= 9, `${started.length} sources`);
  for (const source of started) assert.ok(source.reaches(master), `${source.buffer?.file} plays through the hold`);
  assert.ok(sounds.level > 0.99);
  sounds.pause();
  context.advance(0.2);
  assert.ok(sounds.level < 0.001, `held: ${sounds.level}`);
  const before = context.bufferSources.length;
  sounds.wingbeat();
  sounds.whoosh(-1);
  sounds.gust();
  assert.equal(context.bufferSources.length, before, 'no one-shot while held');
  sounds.resume();
  context.advance(1);
  assert.ok(sounds.level > 0.99, 'and back');
  sounds.stop();
});

test('each one-shot is one of its recorded takes, never the same take twice running, the whoosh on its side', () => {
  const context = createFakeContext({ state: 'running' });
  let seed = 3;
  const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const sounds = createFlightSounds({ context, output: context.destination, recordings: fakeStore(context), random });
  assert.deepEqual(Object.keys(FLIGHT_SHOTS).sort(), ['gust', 'whoosh', 'wingbeat']);
  for (const [kind, takes] of Object.entries(FLIGHT_SHOTS)) {
    assert.equal(takes.length, 3, `three takes of ${kind}`);
    const heard = [];
    for (let i = 0; i < 12; i++) {
      const before = context.bufferSources.length;
      sounds[kind](1);
      const fresh = context.bufferSources.slice(before).filter(s => s.started);
      assert.ok(fresh.length >= 1 && fresh.every(s => takes.includes(s.buffer?.file)), `${kind} plays its takes`);
      heard.push(...fresh.map(s => s.buffer.file));
      context.advance(8);
    }
    for (let i = 1; i < heard.length; i++) assert.notEqual(heard[i], heard[i - 1], `${kind}: ${heard.join(' ')}`);
    assert.deepEqual([...new Set(heard)].sort(), [...takes].sort(), `every take of ${kind} is heard`);
  }
  const pans = side => {
    const before = context.nodes.length;
    sounds.whoosh(side);
    return context.nodes.slice(before).filter(n => n.kind === 'panner').map(n => n.pan.value);
  };
  assert.ok(pans(1).every(p => p > 0.5) && pans(-1).every(p => p < -0.5), 'a whoosh on the right is heard on the right');
});

test('the wind and the water dip under a line and come back after it; the one-shots do not', () => {
  const context = createFakeContext({ state: 'running' });
  const out = context.createGain();
  const sounds = createFlightSounds({ context, output: out, recordings: fakeStore(context) });
  sounds.start();
  context.advance(2);
  assert.ok(sounds.dip > 0.99, 'full while nobody speaks');
  sounds.duck(true);
  context.advance(0.6);
  assert.ok(Math.abs(sounds.dip - FLIGHT_SOUND.duck) < 0.02, `under a line: ${sounds.dip}`);
  assert.ok(FLIGHT_SOUND.duck <= 0.5, 'at least 6 dB down');
  sounds.duck(false);
  context.advance(3);
  assert.ok(sounds.dip > 0.99, `back after it: ${sounds.dip}`);
  // the dip is between the loops and the hold: a one-shot goes round it
  const master = masterOf(context, out);
  const dip = context.nodes.find(node => node.kind === 'gain' && node.outputs.includes(master) && node.gain.events.some(e => e.value === FLIGHT_SOUND.duck));
  assert.ok(dip, 'the dip feeds the hold');
  const loops = context.bufferSources.filter(s => s.loop);
  assert.ok(loops.length >= 6 && loops.every(s => s.reaches(dip)), 'every loop goes through it');
  const before = context.bufferSources.length;
  sounds.whoosh(1);
  const [whoosh] = context.bufferSources.slice(before);
  assert.ok(whoosh && !whoosh.reaches(dip), 'a whoosh does not');
});

test('the bed leans with her bank, no further than 0.6 to a side', () => {
  const context = createFakeContext({ state: 'running' });
  const sounds = createFlightSounds({ context, output: context.destination, recordings: fakeStore(context) });
  sounds.start();
  const panner = () => context.nodes.find(n => n.kind === 'panner');
  for (const [p, want] of [[0.3, 0.3], [1, 0.6], [-2, -0.6]]) {
    sounds.setPan(p);
    context.advance(3);
    assert.ok(Math.abs(panner().pan.value - want) < 0.01, `${p}: ${panner().pan.value}`);
  }
});

test('the river under her: the lazy reach is river, the gorge rapids and its echo, and nothing over the land', () => {
  const route = createRoute();
  const point = d => { const q = route.river.at(d); return { x: q.x, y: q.level + 3, z: q.z }; };
  const lazy = riverSound(route, point(200));
  assert.ok(lazy.water > 0.8 && lazy.rapids === 0 && lazy.gorge === 0, JSON.stringify(lazy));
  const gorge = riverSound(route, point((GORGE.from + GORGE.to) / 2));
  assert.ok(gorge.rapids > gorge.water && gorge.rapids > 0.6 && gorge.gorge === 1, JSON.stringify(gorge));
  const high = riverSound(route, { ...point(200), y: point(200).y + 40 });
  assert.ok(high.water === 0 && high.rapids === 0, `high over the river: ${JSON.stringify(high)}`);
  const land = riverSound(route, { x: 400, y: 30, z: -400 });
  assert.deepEqual(land, { water: 0, rapids: 0, gorge: 0 });

  const context = createFakeContext({ state: 'running' });
  const sounds = createFlightSounds({ context, output: context.destination, recordings: fakeStore(context) });
  sounds.start();
  sounds.gorge(1);
  context.advance(3);
  assert.ok(sounds.echo > 0.9 * FLIGHT_SOUND.echo.send, `the echo in the gorge: ${sounds.echo}`);
  sounds.gorge(0);
  context.advance(4);
  assert.ok(sounds.echo < 0.01, `and none out of it: ${sounds.echo}`);
});

test('the recordings are fetched and decoded once for a page, and a file that will not come leaves the made sound', async () => {
  const context = createFakeContext({ state: 'running' });
  const asked = [];
  const fetch = async url => {
    asked.push(String(url));
    if (String(url).endsWith('flutter.mp3')) return { ok: false, status: 404 };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const store = loadFlightRecordings(context, { fetch });
  assert.equal(loadFlightRecordings(context, { fetch }), store, 'one store for the page');
  assert.equal(await store.ready, true);
  const files = [...new Set([...Object.values(FLIGHT_LOOPS).flat().map(([file]) => file), ...Object.values(FLIGHT_SHOTS).flat()])];
  assert.equal(asked.length, files.length, 'each file once');
  assert.ok(store.get('airflow.mp3'));
  assert.equal(store.get('flutter.mp3'), undefined);
  const sounds = createFlightSounds({ context, output: context.destination, recordings: store });
  sounds.start();
  context.advance(1);
  assert.equal(sounds.bed.recorded, false, 'the bed is made when one of its layers is missing');
  sounds.stop();
});

test('every recorded file in kafli4/hljod is played and has a credit line', () => {
  const credits = fs.readFileSync(new URL('../CREDITS.md', HLJOD), 'utf8');
  const made = readJson(new URL('sounds.json', HLJOD));
  const files = fs.readdirSync(HLJOD).filter(f => f.endsWith('.mp3')).sort();
  assert.deepEqual(Object.keys(made).sort(), files, 'sounds.json lists every file');
  const used = new Set([
    ...Object.values(FLIGHT_LOOPS).flat().map(([file]) => file),
    ...Object.values(FLIGHT_SHOTS).flat(),
    ...Object.values(SAMPLES).flatMap(s => s.urls ?? [s.url]).filter(u => u.includes('/kafli4/hljod/')).map(u => u.split('/').at(-1)),
  ]);
  assert.deepEqual([...used].sort(), files, 'every file is played, and every file played is there');
  for (const file of files) {
    const row = credits.split('\n').find(line => line.startsWith(`| \`hljod/${file}\``));
    assert.ok(row, `${file} has a credit line`);
    const source = made[file].source;
    assert.ok(row.includes(source.licence), `${file}: its licence`);
    if (source.page) assert.ok(row.includes(source.author) && row.includes(source.page), `${file}: its author and page`);
    if (/^CC BY/.test(source.licence)) {
      assert.ok(credits.includes(`"${source.name}" by ${source.author}`) && credits.includes(source.licence), `${file}: the credit its licence asks for`);
    }
  }
});

test('the skim, the turtle, the small lizards, the herd and the flyers: a recorded take each time, panned where asked, and the made sound until they decode', async () => {
  const context = createFakeContext({ state: 'running' });
  const real = globalThis.fetch;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async url => { await gate; return { ok: true, arrayBuffer: async () => new TextEncoder().encode(String(url)).buffer }; };
  // each decoded buffer knows the file it came from
  const decode = context.decodeAudioData.bind(context);
  context.decodeAudioData = bytes => decode(bytes).then(buffer => Object.assign(buffer, { url: new TextDecoder().decode(bytes) }));
  try {
    const sfx = createSfx({ context, recorded: true });
    assert.equal(sfx.play('skim'), true);
    assert.ok(context.started.length > 0, 'the made splash sounds');
    assert.ok(context.bufferSources.every(s => !s.buffer?.url), 'not a recording: none has come yet');
    release();
    for (let i = 0; i < 5; i++) await settle();
    context.advance(2);
    for (const name of ['skim', 'turtleCall', 'lizards', 'grazers', 'flyers']) {
      const takes = SAMPLES[name].urls;
      assert.ok(takes.length >= 2, `${name} has takes`);
      const before = context.bufferSources.length;
      assert.equal(sfx.play(name, { pan: 0.7 }), true, name);
      const [source] = context.bufferSources.slice(before);
      assert.ok(takes.includes(source?.buffer?.url), `${name} plays one of its recordings`);
      const panner = source.outputs[0].outputs.find(n => n.kind === 'panner');
      assert.ok(panner && Math.abs(panner.pan.value - 0.7) < 1e-9, `${name} on the right`);
      context.advance(3);
    }
    assert.deepEqual([ANSWER.turtle, ANSWER.lizards], ['turtleCall', 'lizards'], 'the turtle and the lizards answer with their recordings');
    const sides = PLAY.bigAnswers.map(([, , pan]) => pan);
    for (const who of ['lizards', 'grazers', 'flyers']) assert.ok(PLAY.bigAnswers.some(([, name]) => name === who), `the ${who} answer the big call`);
    assert.ok(sides.every(p => Math.abs(p) >= 0.4 && Math.abs(p) <= 0.9) && sides.some(p => p < 0) && sides.some(p => p > 0), `from all sides: ${sides}`);
  } finally {
    globalThis.fetch = real;
  }
});
