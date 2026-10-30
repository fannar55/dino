// Slóeðla's song game, the new song system (engine/sloedla/v2): songs made of layers, each a recorded stem or a composed part,
// owned by a dinosaur or by the song. The owner's lean rule: a few tests of the fiddly parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_NOTE, ROLES, timelineOf, validateSong } from '../engine/sloedla/v2/format.js';
import { chartProblems, expectedOf, sectionChart } from '../engine/sloedla/v2/chart.js';
import { partNotes } from '../engine/sloedla/v2/parts.js';
import { createPlayer } from '../engine/sloedla/v2/player.js';
import { createFakeContext } from './fake-audio.mjs';
import { makeSong } from './sloedla-v2-fixture.mjs';

test('v2 song: its timeline, the rules a song keeps, and composed notes', () => {
  const song = makeSong();
  assert.deepEqual(validateSong(song), []);
  const { beat, sections, length } = timelineOf(song);
  assert.equal(beat, 0.5);
  assert.equal(sections[1].start, 4);
  assert.equal(sections[1].startBeat, 8);
  assert.equal(length, 60);
  const lag = song.layers.find(l => l.id === 'lag');
  for (const [change, word] of [
    [{ layers: [...song.layers, { id: 'x', owner: 'd', stem: 'x.mp3' }] }, 'owner'],
    [{ layers: [...song.layers, { id: 'y', owner: 'a', part: { instrument: 'horn', sections: {} } }] }, 'instrument'],
    [{ layers: [...song.layers, { id: 'z', owner: 'a', stem: 'z.mp3', part: lag.part }] }, 'stem or a part'],
    [{ sections: song.sections.map(s => (s.name === 'kor' ? { ...s, lift: 2 } : s)) }, 'lift'],
    [{ chart: { ...song.chart, barn: [{ beat: 2, owner: 'c', layer: 'trommur' }, ...song.chart.barn] } }, '2.5'],
    [{ chart: { ...song.chart, barn: [...song.chart.barn, { beat: 100, owner: 'b', layer: 'trommur' }] } }, 'owned'],
  ]) assert.ok(validateSong({ ...song, ...change }).some(p => p.includes(word)), word);
  const notes = partNotes(song, lag, 2); // kor, normal
  assert.equal(notes[0].t, 20);
  assert.equal(notes[0].beat, 40);
  assert.ok(notes.some(n => n.mark));
  assert.notDeepEqual(partNotes(song, lag, 2, 'big').map(n => n.step), notes.map(n => n.step));
  const tuned = partNotes({ ...song, key: { ...song.key, cents: 30 } }, lag, 2);
  assert.ok(Math.abs(tuned[0].freq / notes[0].freq - 2 ** (30 / 1200)) < 1e-9);
});

test('v2 charts: two beats apart for the child (four when calm), half a beat for grown-ups, every lane 8 times, two lanes leave b out', () => {
  const song = makeSong();
  const { beat, sections } = timelineOf(song);
  const all = (variant, options) => sections.flatMap((_, i) => sectionChart(song, i, variant, options));
  for (const variant of ['normal', 'big', 'calm'])
    assert.deepEqual(chartProblems(all(variant), { level: 'barn', beat, calm: variant === 'calm', whole: variant === 'normal' }), [], variant);
  const child = all('normal');
  assert.ok(child.every(n => n.t >= FIRST_NOTE));
  assert.equal(expectedOf(song, { level: 'barn', roles: ROLES }), child.length);
  const grown = all('normal', { level: 'fullordinn' });
  assert.deepEqual(chartProblems(grown, { level: 'fullordinn', beat }), []);
  assert.ok(grown.length > child.length);
  assert.ok(!all('normal', { roles: ['a', 'c'] }).some(n => n.role === 'b'));
});

// A player on the fake audio context (fake-audio.mjs) and a clock whose song time 0 is context time 0.4. The song plays on as the
// game's timer would move it: small steps, a pump each (sections are decided as time passes).
function rig({ roles, drop } = {}) {
  const context = createFakeContext({ state: 'running' });
  const song = makeSong();
  for (const layer of song.layers) if (layer.stem && layer.id !== drop) layer.buffer = { duration: 61, length: 61 * 44100, sampleRate: 44100, numberOfChannels: 2 };
  const clock = { start() {}, contextTimeOf: t => 0.4 + t };
  const plays = [];
  const sounds = { play: (name, options) => plays.push({ name, ...options }), oops() {} };
  const player = createPlayer({ context, song, clock, sounds, out: context.createGain(), roles });
  const to = t => {
    while (context.currentTime < 0.4 + t - 1e-9) {
      context.advance(Math.min(0.1, 0.4 + t - context.currentTime));
      player.pump();
    }
  };
  return { context, song, player, plays, to };
}

test('v2 player: the whole song from the first beat; a hit plays the same place of the same file louder, never past the note', () => {
  const { context, song, player, to } = rig();
  player.start(0.4);
  const stems = context.bufferSources.slice();
  assert.equal(stems.length, 3);
  for (const s of stems) {
    assert.ok(Math.abs(s.starts[0].when - 0.37) < 1e-9);
    assert.equal(s.starts[0].offset, 0);
  }
  assert.ok(ROLES.every(r => player.isOpen(r)));
  to(10);
  const drums = song.layers.find(l => l.id === 'trommur');
  const note = player.chart.find(n => n.layer === 'trommur' && n.t > 11);
  to(note.t - 0.05);
  player.hit(note, -0.03);
  const accent = context.bufferSources.at(-1);
  assert.equal(accent.buffer, drums.buffer);
  assert.ok(Math.abs(accent.starts[0].when - (0.4 + note.t)) < 1e-9);
  assert.ok(Math.abs(accent.starts[0].offset - (0.03 + note.t)) < 1e-9);
  assert.ok(accent.stopTime <= accent.starts[0].when + Math.min(note.dur, 0.25) + 1e-6);
  const late = player.chart.find(n => n.layer === 'bassi' && n.t > note.t);
  to(late.t + late.dur + 0.01);
  const made = context.bufferSources.length;
  player.hit(late, 0.3);
  assert.equal(context.bufferSources.length, made); // past its end: no accent
  assert.ok(player.isOpen('b'));
  player.stop(); // every test ends so: the timer would keep the test running
});

test('v2 player: a miss leaves a hole until the next hit, three make a ghost; parts, tiers, two lanes, a lost stem, a sleeping tablet, stop', () => {
  const { context, player, plays, to } = rig();
  player.start(0.4);
  to(10);
  // a miss: her line drops to a muffled whisper until her next hit; three in a row bring her back as a ghost for a bar
  const missed = player.chart.find(n => n.role === 'a' && n.t > 10.5);
  to(missed.t + 0.4);
  player.miss(missed);
  const { gate, filter } = player.chains.a;
  let now = context.currentTime;
  assert.ok(Math.abs(gate.gain.valueAt(now + 0.2) - 0.18) < 0.02);
  assert.ok(Math.abs(filter.frequency.valueAt(now + 0.2) - 600) < 30);
  assert.equal(player.isOpen('a'), false);
  const next = player.chart.find(n => n.role === 'a' && n.t > missed.t);
  to(next.t);
  player.hit(next, 0);
  assert.ok(gate.gain.valueAt(context.currentTime + 0.05) > 0.9);
  for (let i = 0; i < 3; i++) player.miss(next);
  now = context.currentTime;
  assert.ok(Math.abs(gate.gain.valueAt(now + 0.3) - 0.38) < 0.03);
  assert.ok(Math.abs(gate.gain.valueAt(now + 2 + 1.5) - 0.18) < 0.03);
  // a composed part: its charted notes sound only when tapped, the rest are scheduled ahead into her line
  to(19.9);
  const tapped = player.chart.find(n => n.layer === 'lag' && n.section === 2);
  assert.equal(tapped.t, 20);
  player.hit(tapped, -0.1);
  assert.ok(plays.some(p => p.tapped && p.into === player.hits.a && Math.abs(p.at - 20.404) < 0.01));
  to(20.6);
  const untapped = plays.filter(p => !p.tapped && p.into === player.layers.lag);
  assert.ok(untapped.some(p => Math.abs(p.at - 20.9) < 1e-6));
  assert.ok(!untapped.some(p => Math.abs(p.at - 20.4) < 1e-6));
  // a run brings in the star layers up to its tier
  player.setTier(2);
  now = context.currentTime;
  assert.ok(player.tiers[0].gain.valueAt(now + 2) > 0.95 && player.tiers[1].gain.valueAt(now + 2) > 0.95);
  assert.ok(player.tiers[2].gain.valueAt(now + 2) < 0.01);
  // a sleeping tablet: nothing is played while the context sleeps; after a stalled timer, nothing more than 0.05 s late
  context.setState('suspended');
  const before = plays.length;
  player.pump();
  assert.equal(plays.length, before);
  context.setState('running');
  context.advance(1);
  player.pump();
  assert.ok(plays.slice(before).every(p => p.at >= context.currentTime - 0.05 - 1e-9));
  // stop: every source stops, nothing more is scheduled
  player.stop();
  now = context.currentTime;
  assert.ok(context.bufferSources.every(s => s.stopTime !== undefined && s.stopTime <= now + 0.3 + 1e-9));
  const after = plays.length;
  context.advance(2);
  player.pump();
  assert.equal(plays.length, after);

  // two lanes: Kambeðla has none, so nothing falls for her and her line never closes
  const two = rig({ roles: ['a', 'c'] });
  two.player.start(0.4);
  two.to(10);
  assert.ok(!two.player.chart.some(n => n.role === 'b'));
  two.player.miss({ role: 'b', section: 1, t: 10, freq: 200 });
  assert.ok(two.player.chains.b.gate.gain.valueAt(two.context.currentTime + 0.2) > 0.99);
  two.player.stop();

  // a stem that could not be loaded is left out with a warning, and the round plays
  const warn = console.warn;
  let warned = 0;
  console.warn = () => { warned++; };
  try {
    const lost = rig({ drop: 'trommur' });
    lost.player.start(0.4);
    assert.equal(lost.context.bufferSources.length, 2);
    assert.equal(warned, 1);
    lost.player.stop();
  } finally {
    console.warn = warn;
  }
});
