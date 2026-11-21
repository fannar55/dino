// Uggeðla í tjörninni's sound (chapters/tjorn3d/sound.js): the cue sheet hangs on the timeline's own events, in order and inside
// the show; every cue names a sound that is there; a still asks for nothing; a seek passes over what came before it and lays the
// bed at its level; a slot plays its recording, and its made sound where the file is not there or the show is asked to play
// without the recordings; the recordings in the folder are the ones sounds.json tells of, each with its source and licence; and
// her four lines are in the sheet, each hung on its event, said once at its second by the scene (never by the show's own player).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { CUES, MADE, SLOTS, RECORDINGS, LINES, SOUND, KEY, MANIFEST, cueSheet, kindOf, madeFor, bedAt, panAt, createPondSound, createLineCues } from '../chapters/tjorn3d/sound.js';
import { LENGTH, PARTS, CALM, TURN, HOLD, SAIL, GONE, JUMP, RINGS, BUBBLE, BUBBLES, SPLASHES, RUNOFF, BUTTERFLY_TIMES, BUTTERFLY_LILY, FLIGHT, herAt, butterflyAt } from '../chapters/tjorn3d/show.js';
import { LILIES, FROG } from '../chapters/tjorn3d/keys.js';
import { createFakeContext, withFetch } from './fake-audio.mjs';

const REMAKE = new URL('../', import.meta.url);
const named = sound => CUES.filter(c => c.sound === sound);
const SOUNDS = CUES.filter(c => c.line === undefined); // what the show's own player plays: the sounds and the bed
const SAID = CUES.filter(c => c.line !== undefined); // her lines: the scene's to play
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
  // the sounds and the bed are numbered in their order, as they were before her lines came (a cue's number seeds what varies
  // in it), and her lines after them
  assert.deepEqual(SOUNDS.map(c => c.n), SOUNDS.map((_, i) => i + 1));
  assert.deepEqual(SAID.map(c => c.n), SAID.map((_, i) => SOUNDS.length + i + 1));
  for (const cue of CUES) {
    assert.ok(cue.t >= 0 && cue.t < LENGTH, `${cue.sound ?? cue.line ?? 'bed'} at ${cue.t} is inside the show`);
    assert.ok(kindOf(cue), `${cue.sound ?? cue.line} at ${cue.t} is known`);
    assert.ok(typeof cue.what === 'string' && cue.what.length > 3);
    if (cue.sound !== undefined) {
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
    assert.ok(entry.level > 0 && entry.level <= 1.5 && entry.urls.length > 0);
  }
  assert.equal(SLOTS.pond.instead, 'water', 'the bed\'s slot stands in for the made water');
  assert.deepEqual([SLOTS.fish.instead, madeFor('fish'), SLOTS.frog.instead], ['plop', 'fishIn', 'croak'], 'the fish\'s leap and the frog stand in for what sounded before their recordings came');
  for (const entry of Object.values(RECORDINGS)) for (const file of entry.urls) assert.ok(fs.existsSync(new URL(file, REMAKE)), file);
  assert.deepEqual(Object.keys(SLOTS), ['pond', 'rise', 'drips', 'bubbles', 'sink', 'fish', 'frog']);
  // no music in it: the sheet has sounds, the bed and her lines only, each cue one of them
  assert.ok(CUES.every(c => [c.bed !== undefined, typeof c.sound === 'string', typeof c.line === 'string'].filter(Boolean).length === 1));
  assert.equal(kindOf({ t: 1, line: 'not_a_line' }), null, 'a line the show does not have is not known');
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
  assert.match(source, /onQuit: \(\) => \{ sound\.end\(\); hush\(\); giveBackScreen\(doc\); leaveShow\(win\); \}/, '"Hætta": the sound ends, a line that is sounding stops, the whole screen is given back, and it leaves');
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
    const due = SOUNDS.filter(c => c.t >= from && c.t <= from + 0.5);
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
    const [first, second] = SOUNDS.filter(c => c.t >= 1);
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
    assert.deepEqual(sound.log.map(e => e.n), SOUNDS.map(c => c.n), 'the whole sheet of sounds, once each');
    for (const entry of sound.log) {
      const cue = SOUNDS[entry.n - 1];
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
    assert.deepEqual(sound.log.map(e => e.n), SOUNDS.map(c => c.n));
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

// ---- her lines ----
const RECORDED = JSON.parse(fs.readFileSync(new URL('assets/audio/lines.json', REMAKE), 'utf8'));
/** What lines.json says of a line's recording now (a take may be made again under the same id: nothing here knows its length). */
const recorded = id => RECORDED[id];

test('her four lines are in the sheet, each hung on its event and after it, in order, none over another, and each is in lines.json', () => {
  assert.deepEqual(SAID.map(c => c.line), ['t3_uggedla_hallo', 't3_uggedla_namm', 't3_uggedla_fidrildi', 't3_uggedla_bless']);
  assert.deepEqual(Object.keys(LINES), SAID.map(c => c.line), 'the show has these four and no other');
  assert.deepEqual(Object.values(LINES), ['Halló!', 'Namm!', 'Ó, fiðrildi!', 'Bless!']);
  const EVENTS = { 'HOLD.from': HOLD.from, 'JUMP.gulp': JUMP.gulp, 'BUTTERFLY_TIMES.land': BUTTERFLY_TIMES.land, 'BUTTERFLY_TIMES.off': BUTTERFLY_TIMES.off };
  assert.deepEqual(SAID.map(c => c.on), Object.keys(EVENTS), 'the hold, the gulp, the landing, the lift-off');
  for (const cue of SAID) {
    assert.deepEqual(Object.keys(cue).sort(), ['line', 'n', 'on', 't', 'what'], `${cue.line}: a line has no level and no side of its own (the game's voice plays it)`);
    assert.equal(kindOf(cue), 'line');
    const event = EVENTS[cue.on];
    assert.ok(cue.t >= event && cue.t - event <= 1.5, `${cue.line} at ${cue.t} is said at its event (${cue.on}, ${event} s) or a little after, never before`);
    // its recording, as lines.json has it at this moment
    const take = recorded(cue.line);
    assert.ok(take, `${cue.line} is in lines.json`);
    assert.equal(take.src, `assets/audio/tjorn3d/${cue.line}.mp3`);
    assert.ok(fs.existsSync(new URL(take.src, REMAKE)), `${take.src} is there`);
    assert.ok(take.duration > 0.3 && take.duration < 4 && /^[0-9a-f]+$/.test(take.mouth) && /[1-9a-f]/.test(take.mouth), `${cue.line} has its length and its mouth shapes`);
    assert.ok(cue.t + take.duration < LENGTH);
  }
  for (let i = 1; i < SAID.length; i++) {
    assert.ok(SAID[i].t > SAID[i - 1].t, 'in order');
    assert.ok(SAID[i - 1].t + recorded(SAID[i - 1].line).duration <= SAID[i].t, `${SAID[i - 1].line} is over (its whole recording) before ${SAID[i].line} is said`);
  }
  // and the show's credits name them (tools/tjorn3d-sounds.mjs writes the file)
  const credits = fs.readFileSync(new URL('assets/audio/tjorn3d/CREDITS.md', REMAKE), 'utf8');
  assert.match(credits, /^## Uggeðla's lines$/m);
  for (const [id, text] of Object.entries(LINES)) assert.ok(credits.includes(`\`${id}.mp3\` ("${text}")`), `${id} is in CREDITS.md`);
  assert.ok(credits.includes('Uggeðla\'s voice, made with the game\'s voice tools (line set `tjorn3d`, `lines.json`)') && !/no voices/.test(credits));
});

test('each line is said where the picture has room for it: her jaw is the timeline\'s shut, she is up, and the butterfly is where the line says', () => {
  const [hallo, namm, fidrildi, bless] = SAID;
  const through = (cue, each) => { for (let t = cue.t - 0.3; t <= cue.t + recorded(cue.line).duration + 1e-9; t += 0.05) each(t); };
  // her speaking mouth is laid on the jaw the timeline poses: that jaw is shut from a little before each line to the end of its
  // recording, so her mouth opens from shut and shuts again, with no jump
  for (const cue of SAID) through(cue, t => assert.equal(herAt(t).jaw, 0, `${cue.line}: the timeline's jaw at ${t.toFixed(2)} s`));
  // "Halló!": in the hold, her head up and looking at him, after the rise's own sounds have begun to fall away
  through(hallo, t => { const h = herAt(t); assert.ok(t > HOLD.from && t < HOLD.to && h.look === 'eye' && h.strike === 0, `at ${t.toFixed(2)} s she stands and looks at him`); });
  assert.ok(hallo.t >= named('bloom')[0].t + 1, 'the little chord has rung');
  // "Namm!": the fish is down (the gulp's sound began before it), and nothing is in her jaws
  assert.ok(namm.t > JUMP.gulp && namm.t > named('gulp')[0].t + 0.5 && namm.t - JUMP.gulp < 1);
  // "Ó, fiðrildi!": the butterfly sits on her snout from before the line to the end of its recording
  through(fidrildi, t => assert.equal(butterflyAt(t).on, 'snout', `at ${t.toFixed(2)} s the butterfly sits`));
  assert.ok(fidrildi.t >= named('chime')[0].t + 0.4, 'its two bells have rung');
  // "Bless!": as the butterfly lifts off, while she is sinking; its recording is over before the water closes over her head
  assert.ok(near(bless.t, BUTTERFLY_TIMES.off), 'at the lift-off, not later: the water reaches her mouth soon after it');
  assert.equal(butterflyAt(bless.t).on, 'back');
  assert.ok(herAt(bless.t).sink > herAt(bless.t - 0.4).sink && herAt(bless.t).there, 'she is sinking');
  const [, , under] = SPLASHES;
  assert.ok(bless.t + recorded(bless.line).duration < under[0] && under[0] < GONE, 'said before her head is under');
});

test('her lines are handed out once each as the show\'s second passes them; a start past a line passes over it; played again they are said again', () => {
  const heard = [];
  const lines = createLineCues({ say: cue => heard.push(cue.line) });
  assert.deepEqual(lines.lines, SAID);
  lines.frame(LENGTH);
  assert.deepEqual(heard, [], 'nothing before the show has started');
  lines.start(0);
  for (let t = 0; t <= LENGTH; t += 1 / 30) { lines.frame(t); lines.frame(t); } // (a second frame at the same second says nothing again)
  assert.deepEqual(heard, SAID.map(c => c.line), 'each once, in order');
  assert.deepEqual(lines.log.map(e => [e.line, e.t, e.n]), SAID.map(c => [c.line, c.t, c.n]));
  for (const e of lines.log) assert.ok(e.at >= e.t && e.at - e.t < 0.04, `${e.line} in the frame its second came in`);
  // a seek into the middle of a line: that line is not said (never from its middle), the later ones are
  heard.length = 0;
  lines.start(SAID[1].t + 0.2);
  lines.frame(SAID[1].t + 0.25);
  assert.deepEqual(heard, []);
  lines.frame(LENGTH);
  assert.deepEqual(heard, SAID.slice(2).map(c => c.line));
  // a start at a line's own second says it
  heard.length = 0;
  lines.start(SAID[2].t);
  lines.frame(SAID[2].t);
  assert.deepEqual(heard, [SAID[2].line]);
  // played again ("Aftur"): from the top, clean
  heard.length = 0;
  lines.start(0);
  assert.equal(lines.log.length, 0);
  lines.frame(LENGTH);
  assert.deepEqual(heard, SAID.map(c => c.line));
  // a sheet without lines hands out none
  const none = createLineCues({ cues: SOUNDS, say: () => assert.fail('no line to say') });
  none.start(0);
  none.frame(LENGTH);
});

test('the show\'s own player plays no line, with the recordings or without them; a still asks for none; and the chapter says them as the game says a show\'s lines', async () => {
  // the player: the whole sheet of sounds, once each, and not one line, whichever water it plays
  for (const options of [{}, { recordings: false }]) {
    await playing({}, ({ sound, asked }) => {
      sound.start(0);
      sound.frame(LENGTH);
      assert.deepEqual(sound.log.map(e => e.n), SOUNDS.map(c => c.n));
      assert.ok(sound.log.every(e => e.kind !== 'line' && !Object.hasOwn(LINES, e.sound)));
      assert.ok(asked.every(url => !/t3_uggedla/.test(url)), 'and it asks for no line\'s file');
    }, { options });
  }
  // a still's player (no audio context) is the silent one whatever the sheet holds
  const silent = createPondSound({ context: null });
  silent.start(0);
  silent.frame(LENGTH);
  assert.equal(silent.log.length, 0);
  // the chapter: the four lines with their recordings, Uggeðla's, said by the scene with no caption (the table page shows no
  // text) as the other 3D shows say theirs; handed out by the sheet whenever the show is showing, a capture's seek and a still
  // too, where the scene moves her mouth and asks for no sound (engine/scene/scene.js: a seek plays no voice; main.js: a still's
  // voice is muted); nothing about them asks which water plays (&upptokur=0)
  const source = fs.readFileSync(new URL('chapters/tjorn3d.js', REMAKE), 'utf8');
  assert.match(source, /cast: \{ uggedla: \{ name: 'Uggeðla' \} \},/);
  assert.match(source, /lines: Object\.fromEntries\(Object\.entries\(LINES\)\.map\(\(\[id, text\]\) => \[id, \{ text, audio: id \}\]\)\),/);
  assert.match(source, /createLineCues\(\{ say: cue => \{ said\.task = s\.say\('uggedla', cue\.line, \{ hold: 0, caption: false, listen: false \}\); \} \}\)/);
  assert.match(source, /if \(time\.showing\) lines\.frame\(t\);/);
  assert.match(source, /hush\(\); \/\/ \(played again[^\n]*\n\s+lines\.start\(0\);/, 'played again, they are said again from the top');
  assert.match(source, /time\.showing = false;\s+sound\.end\(\);[^\n]*\n\s+hush\(\);/, 'the end stops a line that is sounding');
  assert.ok(!/createLineCues\([^\n]*(upptokur|recordings)/.test(source), 'the lines are not asked which water plays');
  const scene = fs.readFileSync(new URL('engine/scene/scene.js', REMAKE), 'utf8');
  assert.match(scene, /const sound = recording && !seeking \? voice\.play\(/, 'a seek asks for no line\'s sound');
  const main = fs.readFileSync(new URL('main.js', REMAKE), 'utf8');
  assert.match(main, /\/\/ Deterministic seek[^\n]*\r?\n\s+voice\.muted = true;/, 'and a still\'s voice is muted');
});
