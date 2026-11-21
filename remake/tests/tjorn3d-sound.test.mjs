// Uggeðla í tjörninni's sound (chapters/tjorn3d/sound.js): the cue sheet hangs on the timeline's own events, in order and inside
// the show; every cue names a sound that is there; a still asks for nothing; a seek passes over what came before it and lays the
// bed at its level; a slot plays its recording, and its made sound where the file is not there or the show is asked to play
// without the recordings; and the recordings in the folder are the ones sounds.json tells of, each with its source and licence.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { CUES, MADE, SLOTS, RECORDINGS, SOUND, KEY, MANIFEST, cueSheet, kindOf, madeFor, bedAt, panAt, createPondSound } from '../chapters/tjorn3d/sound.js';
import { LENGTH, PARTS, CALM, TURN, HOLD, SAIL, JUMP, RINGS, BUBBLE, BUBBLES, SPLASHES, RUNOFF, BUTTERFLY_TIMES, BUTTERFLY_LILY, FLIGHT } from '../chapters/tjorn3d/show.js';
import { LILIES, FROG } from '../chapters/tjorn3d/keys.js';
import { createFakeContext, withFetch } from './fake-audio.mjs';

const REMAKE = new URL('../', import.meta.url);
const named = sound => CUES.filter(c => c.sound === sound);
const near = (a, b) => Math.abs(a - b) < 1e-6;
const base = file => file.split('/').pop();

/**
 * A running audio context and a fetch that has the manifest (with `files`) and every file it is asked for (`has`: whether it has
 * a file; `options`: the player's own; every decoded file is `seconds` long).
 */
async function playing(files, run, { has = () => true, options = {}, seconds = 30 } = {}) {
  const context = createFakeContext({ state: 'running' });
  context.decodeAudioData = bytes => { context.decoded.push(bytes); return Promise.resolve(context.createBuffer(1, seconds * 100, 100)); };
  return withFetch(async asked => {
    const sound = createPondSound({ context, ...options });
    await sound.ready;
    return run({ sound, context, asked });
  }, url => (url.endsWith('sounds.json')
    ? { ok: true, status: 200, json: async () => ({ files }) }
    : has(url) ? { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) } : { ok: false, status: 404 }));
}

test('the cues are in order, inside the show, and each names a sound that is there', () => {
  assert.deepEqual(cueSheet(), CUES, 'the same sheet every time');
  for (let i = 1; i < CUES.length; i++) assert.ok(CUES[i].t >= CUES[i - 1].t, `in order at ${CUES[i].t}`);
  assert.deepEqual(CUES.map(c => c.n), CUES.map((_, i) => i + 1));
  for (const cue of CUES) {
    assert.ok(cue.t >= 0 && cue.t < LENGTH, `${cue.sound ?? 'bed'} at ${cue.t} is inside the show`);
    assert.ok(kindOf(cue), `${cue.sound} at ${cue.t} is known`);
    assert.ok(typeof cue.what === 'string' && cue.what.length > 3);
    if (cue.bed === undefined) {
      assert.ok(cue.level > 0 && cue.level <= 1.5, `${cue.sound}'s level`);
      assert.ok(Math.abs(cue.pan) <= SOUND.panMost, `${cue.sound} at ${cue.t} is no farther to a side than ${SOUND.panMost}`);
    }
  }
  // what stands in for a recording is a made sound, or one of the game's own recordings whose own stand-in is made; and the
  // game's own recordings are on disk
  for (const [name, entry] of [...Object.entries(SLOTS), ...Object.entries(RECORDINGS)]) {
    assert.ok(!Object.hasOwn(MADE, name), `${name} is a recording's name only`);
    assert.ok(entry.instead === 'water' || Object.hasOwn(MADE, entry.instead) || (Object.hasOwn(SLOTS, name) && Object.hasOwn(RECORDINGS, entry.instead)), `${name}: ${entry.instead} is there`);
    assert.ok(madeFor(name) === 'water' || Object.hasOwn(MADE, madeFor(name)), `${name}: at the end of it ${madeFor(name)} is made`);
    assert.ok(entry.level > 0 && entry.level <= 1 && entry.urls.length > 0);
  }
  assert.equal(SLOTS.pond.instead, 'water', 'the bed\'s slot stands in for the made water');
  assert.deepEqual([SLOTS.fish.instead, madeFor('fish'), SLOTS.frog.instead], ['plop', 'fishIn', 'croak'], 'the fish\'s leap and the frog stand in for what sounded before their recordings came');
  for (const entry of Object.values(RECORDINGS)) for (const file of entry.urls) assert.ok(fs.existsSync(new URL(file, REMAKE)), file);
  assert.deepEqual(Object.keys(SLOTS), ['pond', 'rise', 'drips', 'bubbles', 'sink', 'fish', 'frog']);
  // no music and no voice in it: the sheet has sounds and the bed only
  assert.ok(CUES.every(c => c.bed !== undefined || typeof c.sound === 'string'));
  // tuned to the game's theme
  assert.deepEqual(KEY, JSON.parse(fs.readFileSync(new URL('assets/audio/theme.json', REMAKE), 'utf8')).key);
});

test('the cues that belong to the timeline\'s events take their seconds, and their sides, from them', () => {
  const at = (sound, t) => named(sound).filter(c => near(c.t, t));
  const butterflys = ring => ring[1] === BUTTERFLY_LILY[0] && ring[2] === BUTTERFLY_LILY[1];
  const rings = RINGS.filter(ring => !butterflys(ring));
  // every cue hung on a ring is at a ring's second and on its side
  for (const cue of CUES.filter(c => c.on === 'RINGS')) {
    assert.ok(rings.some(([t, x]) => near(t, cue.t) && cue.pan === panAt(x)), `${cue.sound} at ${cue.t} is at a ring`);
  }
  // 1 and the end: a fish kisses the surface at each ring of the calm pond
  const calm = rings.filter(([t]) => t < PARTS[0].to || t >= CALM.from);
  assert.deepEqual(named('plip').map(c => c.t), calm.map(([t]) => t));
  // 2: every burst of bubbles sounds as it reaches the surface, as many and as far apart as the picture's, louder as she nears
  const bursts = named('bubbles');
  assert.deepEqual(bursts.map(c => c.t), BUBBLES.map(([t]) => +(t + BUBBLE.seconds).toFixed(3)).sort((a, b) => a - b));
  for (const cue of bursts) assert.deepEqual(cue.detail, { many: BUBBLE.each, apart: BUBBLE.apart });
  const early = bursts.filter(c => c.t < PARTS[2].from + BUBBLE.seconds && c.t < TURN);
  for (let i = 1; i < early.length; i++) assert.ok(early[i].level > early[i - 1].level, 'more as she nears');
  // 3: her sail breaks the surface at its first ring, and stands when the timeline says; a stroke at each ring while it cuts along
  const sail = rings.filter(([t]) => t >= PARTS[2].from && t < TURN);
  assert.equal(at('parting', sail[0][0]).length, 1);
  assert.equal(named('parting')[0].detail.up, +(SAIL.up - sail[0][0]).toFixed(3));
  const strokes = named('stroke');
  assert.deepEqual(strokes.map(c => c.t), sail.slice(1).filter(([t]) => t <= SAIL.down + 0.5).map(([t]) => t));
  strokes.forEach((cue, i) => assert.equal(cue.detail.side, (i + 1) % 2, 'left and right in turn'));
  // 4: her head rises where its first ring is, for as long as the rise is; the chord as the hold begins; the water runs off her
  // while the timeline's drops fall, and is done before the hold ends
  const head = rings.filter(([t]) => t >= TURN && t < HOLD.to);
  const [rise] = named('rise');
  assert.equal(named('rise').length, 1);
  assert.ok(near(rise.t, head[0][0]) && rise.detail.seconds === +(HOLD.from - head[0][0]).toFixed(3));
  assert.equal(at('bloom', HOLD.from).length, 1);
  const [drips] = named('drips');
  assert.ok(drips.t >= RUNOFF.from && drips.t < RUNOFF.to && drips.t + drips.detail.seconds < HOLD.to && drips.t + drips.detail.seconds > RUNOFF.to);
  // 5: the leap, her jaws, the splash as she comes down, the gulp as the fish goes down
  const [leap, down, under] = SPLASHES;
  assert.equal(leap[0], JUMP.out);
  assert.ok(at('fish', JUMP.out).length === 1 && at('fishOut', JUMP.out).length === 1 && named('fish')[0].pan === panAt(leap[1]));
  assert.equal(at('jawSnap', JUMP.take).length, 1);
  assert.ok(at('splash', down[0]).length === 1 && at('spray', down[0]).length === 1);
  const [gulp] = named('gulp');
  assert.ok(gulp.t < JUMP.gulp && gulp.t >= JUMP.gulp - 0.35, 'the swallow sounds as the fish goes down');
  // (while she holds the fish, nothing but the water)
  assert.ok(CUES.filter(c => c.sound && c.t > down[0] && c.t < gulp.t).every(c => c.sound === 'lap'));
  // 6: the butterfly's wings for as long as each flight, at its wings' own beat, from the lily's side to her and back; its landing; her sinking
  const { up, land, off, home } = BUTTERFLY_TIMES;
  const wings = named('wings');
  assert.deepEqual(wings.map(c => [c.t, c.detail.seconds, c.detail.beats]), [[up, +(land - up).toFixed(3), FLIGHT.wings], [off, +(home - off).toFixed(3), FLIGHT.wings]]);
  assert.ok(wings[0].pan === panAt(BUTTERFLY_LILY[0]) && near(wings[0].pan + wings[0].detail.to, 0) && near(wings[1].pan + wings[1].detail.to, panAt(BUTTERFLY_LILY[0])));
  assert.deepEqual(named('flit').map(c => c.t), [up, off]);
  assert.equal(at('chime', land).length, 1);
  assert.ok(near(named('sink')[0].t, under[0] - SOUND.sinkLead) && named('sink').length === 1);
  // the frog is where its lily is
  assert.equal(named('frog').length, 3);
  for (const cue of named('frog')) assert.equal(cue.pan, panAt(LILIES[FROG.lily].at[0]));
  assert.ok(panAt(-100) === -SOUND.panMost && panAt(100) === SOUND.panMost && panAt(0) === 0);
});

test('the bed comes in under the black, thins, hushes before her head, is alone again, and goes with the picture', () => {
  const beds = CUES.filter(c => c.bed !== undefined);
  assert.equal(beds[0].t, 0);
  for (let i = 1; i < beds.length; i++) assert.ok(beds[i].t >= beds[i - 1].t + beds[i - 1].seconds, `the way at ${beds[i - 1].t} is gone to its end before the next`);
  assert.equal(bedAt(0).level, 0);
  assert.deepEqual(bedAt(5), { level: 1, to: 1, left: 0 });
  assert.ok(bedAt(15).level < 1 && bedAt(HOLD.from).level < bedAt(15).level, 'thinner while her shadow is there, hushed as her head rises');
  assert.equal(bedAt(CALM.from + 0.3).level, 1, 'alone again');
  assert.equal(bedAt(LENGTH).level, 0, 'gone with the picture');
  const last = beds.at(-1);
  assert.ok(last.bed === 0 && near(last.t + last.seconds, LENGTH));
  const half = bedAt(beds[1].t + beds[1].seconds / 2);
  assert.ok(near(half.level, (1 + beds[1].bed) / 2) && half.to === beds[1].bed && near(half.left, beds[1].seconds / 2), 'halfway down a way');
});

test('a still asks for no sound', async () => {
  await withFetch(async asked => {
    const sound = createPondSound({ context: null });
    assert.equal(await sound.ready, false);
    sound.start(0);
    sound.frame(30);
    sound.end();
    assert.deepEqual([sound.log.length, sound.running, sound.sounding(), asked.length], [0, false, 0, 0]);
  });
  // and the chapter gives a still no audio context, starts the sound only once the clock moves, and ends it at the end card and at "Hætta"
  const source = fs.readFileSync(new URL('chapters/tjorn3d.js', REMAKE), 'utf8');
  assert.match(source, /createPondSound\(\{ context: still \? null : world\.sound\?\.context \?\? null/);
  assert.match(source, /if \(time\.showing && !still && !s\.seeking\) \{\s+if \(!time\.sounding && time\.seen !== null && s\.time !== time\.seen\)/);
  assert.match(source, /time\.showing = false;\s+sound\.end\(\);/);
  assert.match(source, /onQuit: \(\) => \{ sound\.end\(\); leaveShow\(win\); \}/);
  assert.match(source, /world\.music\?\.setLevel\?\.\(0, 0\)/, 'no music');
  // and plays without the real recordings only when the page is asked to (&upptokur=0)
  assert.match(source, /createPondSound\(\{[^}]*recordings: params\.get\('upptokur'\) !== '0' \}\)/);
});

test('a seek passes over the earlier cues and lays the bed at its level; played again it starts clean; the end stops everything', async () => {
  await playing({}, ({ sound, context }) => {
    const from = 30;
    sound.start(from);
    const level = bedAt(from).level;
    assert.ok(context.of('gain').some(node => node.gain.events.some(e => e.type === 'set' && near(e.value, level))), 'the bed at the level it has there');
    assert.equal(sound.log.length, 0, 'nothing sounds at the start but the bed');
    sound.frame(from);
    context.advance(0.5);
    sound.frame(from + 0.5);
    sound.frame(from + 0.5); // (a second frame at the same second plays nothing again)
    const due = CUES.filter(c => c.t >= from && c.t <= from + 0.5);
    assert.ok(due.length > 0);
    assert.deepEqual(sound.log.map(e => e.n), due.map(c => c.n));
    assert.ok(sound.log.every(e => e.t >= from && e.played));
    // every source it has started is at or after the start's time: no burst of what came before
    assert.ok(context.started.every(node => node.starts[0].when >= 0));
    // played again
    context.advance(5);
    const before = context.started.length;
    sound.start(0);
    assert.equal(sound.log.length, 0);
    sound.frame(0);
    assert.deepEqual(sound.log.map(e => [e.t, e.sound]), [[0, 'bed']]);
    assert.ok(context.started.slice(0, before).every(node => node.stopTime !== undefined && node.stopTime <= context.currentTime + 0.1), 'the run before it is let go');
    // the end
    sound.frame(3);
    assert.ok(sound.running && sound.sounding() > 0);
    sound.end();
    assert.equal(sound.running, false);
    assert.ok(context.started.every(node => node.stopTime !== undefined && node.stopTime <= context.currentTime + 0.5), 'everything has its end');
    const played = sound.log.length;
    sound.frame(10);
    assert.equal(sound.log.length, played, 'and nothing more is played');
  });
});

test('a cue waits a moment for an audio context that is still waking, and is passed over if it lasts', async () => {
  await playing({}, ({ sound, context }) => {
    context.setState('suspended');
    sound.start(1);
    const [first, second] = CUES.filter(c => c.t >= 1);
    sound.frame(first.t + 0.1);
    assert.equal(sound.log.length, 0, 'not yet');
    context.setState('running');
    sound.frame(first.t + 0.15);
    assert.deepEqual(sound.log.map(e => [e.n, Boolean(e.played)]), [[first.n, true]]);
    context.setState('suspended');
    sound.frame(second.t + SOUND.late + 0.01);
    assert.deepEqual(sound.log.map(e => [e.n, Boolean(e.played)]), [[first.n, true], [second.n, false]]);
  });
});

/** What a slot plays where its own file is not there: the file of the recording its `instead` names, or that made sound. */
const standIn = slot => (RECORDINGS[slot.instead] ? base(RECORDINGS[slot.instead].urls[0]) : slot.instead);
const SLOT_FILES = Object.values(SLOTS).flatMap(slot => slot.urls.map(base));

test('a slot with no file plays what stands in for it; with its file named in sounds.json, the file', async () => {
  // no file: only the manifest and the game's own two splashes are asked for, and each slot's cue plays what stands in for it
  await playing({}, ({ sound, context, asked }) => {
    assert.deepEqual(asked.map(base).sort(), ['sounds.json', 'splash-soft.mp3', 'splash.mp3']);
    sound.start(0);
    context.advance(1);
    sound.frame(LENGTH);
    assert.deepEqual(sound.log.map(e => e.n), CUES.map(c => c.n), 'the whole sheet, once each');
    for (const entry of sound.log) {
      const cue = CUES[entry.n - 1];
      if (entry.kind === 'slot') assert.equal(entry.played, standIn(SLOTS[cue.sound]), `${cue.sound} at ${cue.t}`);
      else if (entry.kind === 'recording') assert.equal(entry.played, base(RECORDINGS[cue.sound].urls[0]));
      else if (entry.kind === 'made') assert.equal(entry.played, cue.sound);
      else assert.equal(entry.played, 'water', 'the bed is the made water');
    }
    assert.deepEqual([...new Set(sound.log.filter(e => e.kind === 'slot').map(e => e.sound))].sort(), ['bubbles', 'drips', 'fish', 'frog', 'rise', 'sink']);
    assert.deepEqual([...new Set(sound.log.filter(e => e.sound === 'fish').map(e => e.played))], ['splash-soft.mp3'], 'the fish\'s leap: Veiddu\'s plop, as before');
    assert.deepEqual([...new Set(sound.log.filter(e => e.sound === 'frog').map(e => e.played))], ['croak']);
  });
  // and where not even the game's own recordings can be had, the made sound at the end of it
  await playing({}, ({ sound }) => {
    sound.start(0);
    sound.frame(LENGTH);
    assert.deepEqual([...new Set(sound.log.filter(e => e.sound === 'fish').map(e => e.played))], ['fishIn']);
    assert.deepEqual([...new Set(sound.log.filter(e => e.sound === 'splash').map(e => e.played))], ['slap']);
  }, { has: () => false });
  // files named: they are asked for (and no other of the slots'), and they play, the bed's round the stretch its entry gives, at
  // the level their entry gives
  const files = { 'rise.mp3': { level: 0.5 }, 'pond.mp3': { loop: [0.25, 24.4] }, 'bubbles-2.mp3': {}, 'frog-1.mp3': {}, 'frog-2.mp3': {} };
  await playing(files, ({ sound, context, asked }) => {
    assert.deepEqual(asked.map(base).sort(), ['bubbles-2.mp3', 'frog-1.mp3', 'frog-2.mp3', 'pond.mp3', 'rise.mp3', 'sounds.json', 'splash-soft.mp3', 'splash.mp3']);
    sound.start(0);
    const bed = context.bufferSources.filter(node => node.loop && node.started);
    assert.equal(bed.length, 1, 'the pond\'s recording loops');
    assert.deepEqual([bed[0].loopStart, bed[0].loopEnd, bed[0].starts[0].offset], [0.25, 24.65, 0.25], 'round the stretch that repeats, from its start');
    assert.equal(context.oscillators.length, 0, 'and the made water is not laid');
    sound.frame(LENGTH);
    const by = name => sound.log.filter(e => e.sound === name).map(e => e.played);
    assert.deepEqual([...new Set(by('rise'))], ['rise.mp3']);
    assert.deepEqual([...new Set(by('bubbles'))], ['bubbles-2.mp3']);
    assert.deepEqual([...new Set(by('drips'))], ['dripping']);
    assert.deepEqual([...new Set(by('sink'))], ['closing']);
    assert.deepEqual([...new Set(by('fish'))], ['splash-soft.mp3']);
    assert.deepEqual([...new Set(by('bed'))], ['pond']);
    const frogs = by('frog');
    assert.ok(frogs.every(file => /^frog-[12]\.mp3$/.test(file)) && frogs.every((file, i) => i === 0 || file !== frogs[i - 1]), 'the frog: never the same croak twice running');
    const rise = CUES.find(c => c.sound === 'rise');
    assert.ok(context.of('gain').some(node => node.gain.events.some(e => near(e.value, 0.5 * rise.level))), 'at its own level');
  });
  // a loop whose entry gives a stretch its file does not hold is played round whole
  await playing({ 'pond.mp3': { loop: [0.25, 24.4] } }, ({ sound, context }) => {
    sound.start(0);
    const [bed] = context.bufferSources.filter(node => node.loop && node.started);
    assert.ok(bed && bed.loopStart === undefined && !bed.starts[0].offset);
  }, { seconds: 5 });
});

test('asked to play without the recordings, the show asks for none of the slots\' files and every slot plays what stands in for it', async () => {
  const files = Object.fromEntries(SLOT_FILES.map(name => [name, {}]));
  // (with them: every slot's own file)
  await playing(files, ({ sound, asked }) => {
    assert.deepEqual(asked.map(base).sort(), [...SLOT_FILES, 'sounds.json', 'splash-soft.mp3', 'splash.mp3'].sort());
    sound.start(0);
    sound.frame(LENGTH);
    for (const entry of sound.log.filter(e => e.kind === 'slot')) assert.ok(SLOTS[entry.sound].urls.map(base).includes(entry.played), `${entry.sound}: ${entry.played}`);
    assert.ok(sound.log.filter(e => e.kind === 'bed').every(e => e.played === 'pond'));
  });
  await playing(files, ({ sound, context, asked }) => {
    assert.deepEqual(asked.map(base).sort(), ['splash-soft.mp3', 'splash.mp3'], 'not the manifest, and no file of a slot');
    sound.start(0);
    assert.ok(context.oscillators.length > 0, 'the made water is laid');
    sound.frame(LENGTH);
    assert.deepEqual(sound.log.map(e => e.n), CUES.map(c => c.n));
    for (const entry of sound.log.filter(e => e.kind === 'slot')) assert.equal(entry.played, standIn(SLOTS[entry.sound]), entry.sound);
    assert.ok(sound.log.filter(e => e.kind === 'bed').every(e => e.played === 'water'));
  }, { options: { recordings: false } });
});

test('sounds.json names the slots as the code has them; every recording it tells of is in the folder as it was cut, with its source and licence; and no other file is there', () => {
  const list = JSON.parse(fs.readFileSync(new URL(MANIFEST, REMAKE), 'utf8'));
  assert.deepEqual(Object.keys(list.slots), Object.keys(SLOTS));
  for (const [name, slot] of Object.entries(SLOTS)) {
    assert.deepEqual(list.slots[name].names, slot.urls.map(base));
    assert.equal(list.slots[name].instead, slot.instead);
    assert.equal(list.slots[name].what, slot.what);
    for (const file of slot.urls) assert.ok(file.startsWith(MANIFEST.replace('sounds.json', '')), `${file} is in the show's folder`);
  }
  const folder = new URL(MANIFEST.replace('sounds.json', ''), REMAKE);
  const credits = fs.readFileSync(new URL('../CREDITS.md', folder), 'utf8');
  let total = 0;
  for (const [file, entry] of Object.entries(list.files)) {
    assert.ok(SLOTS[entry.slot]?.urls.map(base).includes(file), `${file} is one of its slot's names`);
    assert.ok(/^[a-z0-9-]+\.mp3$/.test(file), `${file}: a name the app's offline list and an address take as it is`);
    assert.ok(fs.existsSync(new URL(file, folder)), `${file} is there`);
    const bytes = fs.readFileSync(new URL(file, folder));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${file} is the cut its entry tells of`);
    assert.equal(bytes.length, entry.bytes);
    total += bytes.length;
    assert.ok(typeof entry.what === 'string' && entry.what.length > 10 && typeof entry.done === 'string' && entry.done.length > 80, `${file} says what it is and what was done to it`);
    assert.ok(entry.seconds > 0.3 && [1, 2].includes(entry.channels));
    assert.ok(Array.isArray(entry.sources) && entry.sources.length > 0, `${file} says where it came from`);
    for (const source of entry.sources) {
      assert.ok(source.title && source.author && /^https:\/\/freesound\.org\/people\/[^/]+\/sounds\/\d+\/$/.test(source.source) && source.preview.startsWith('https://cdn.freesound.org/previews/'), `${file}: its source's page`);
      assert.deepEqual([source.licence, source.licenceUrl], ['CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'], `${file}: its licence`);
      assert.ok(/^[0-9a-f]{64}$/.test(source.sourceSha256) && /^\d{4}-\d\d-\d\d$/.test(source.downloaded));
      assert.ok(credits.includes(`"${source.title}" by ${source.author}, ${source.source}`), `${file}: ${source.title} is in CREDITS.md`);
    }
    const line = credits.split('\n').find(row => row.startsWith(`| \`hljod/${file}\` |`));
    assert.ok(line && line.includes('CC0 1.0'), `${file} is in CREDITS.md with its licence`);
  }
  // every slot has its recordings now, the bed's a loop of 20 s or more that lies inside its file
  assert.deepEqual(Object.keys(list.files).sort(), [...SLOT_FILES].sort());
  const pond = list.files['pond.mp3'];
  assert.ok(pond.loop[1] >= 20 && pond.loop[0] > 0.1 && pond.loop[0] + pond.loop[1] <= pond.seconds - 0.1, 'the bed\'s loop, with room for a decoder\'s padding on both sides');
  assert.ok(Object.values(list.files).every(entry => (entry.loop !== undefined) === (entry.slot === 'pond')));
  assert.deepEqual(fs.readdirSync(folder).filter(file => file !== 'sounds.json').sort(), Object.keys(list.files).sort());
  assert.ok(total < 800_000, `small files: ${total} bytes in all`);
});
