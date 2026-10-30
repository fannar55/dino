// Slóeðla's song game, the new song system (engine/sloedla/v2): songs made of layers, each a recorded stem or a composed part,
// owned by a dinosaur or by the song. The owner's lean rule: a few tests of the fiddly parts.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIRST_NOTE, ROLES, timelineOf, validateSong } from '../engine/sloedla/v2/format.js';
import { chartProblems, expectedOf, sectionChart } from '../engine/sloedla/v2/chart.js';
import { partNotes } from '../engine/sloedla/v2/parts.js';
import { createPlayer } from '../engine/sloedla/v2/player.js';
import { createFakeContext, peakThrough } from './fake-audio.mjs';
import { SONGS_V2 } from '../engine/sloedla/v2/songs/index.js';
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
    [{ layers: [...song.layers, { id: 'k', owner: 'a', stem: 'k.mp3', accent: 0 }] }, 'accent'],
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

// every player made is stopped at the end, a failed test's too (its timer would keep the run going)
const players = [];
after(() => { for (const player of players) player.stop(); });

// A player on the fake audio context (fake-audio.mjs) and a clock whose song time 0 is context time 0.4. The song plays on as the
// game's timer would move it: small steps, a pump each (sections are decided as time passes).
function rig({ roles, drop, change } = {}) {
  const context = createFakeContext({ state: 'running' });
  const song = makeSong(change);
  for (const layer of song.layers) if (layer.stem && layer.id !== drop) layer.buffer = { duration: 61, length: 61 * 44100, sampleRate: 44100, numberOfChannels: 2 };
  const clock = { start() {}, contextTimeOf: t => 0.4 + t };
  const plays = [];
  const sounds = { play: (name, options) => plays.push({ name, ...options }), oops() {} };
  const out = context.createGain();
  const player = createPlayer({ context, song, clock, sounds, out, roles });
  players.push(player);
  const to = t => {
    while (context.currentTime < 0.4 + t - 1e-9) {
      context.advance(Math.min(0.1, 0.4 + t - context.currentTime));
      player.pump();
    }
  };
  return { context, song, player, plays, to, out };
}

test('v2 song gain: a song plays louder or softer as a whole, its hits alike, so a hit stands out just as much', () => {
  assert.ok(validateSong(makeSong({ gain: 0 })).some(p => p.includes('gain')));
  assert.deepEqual(validateSong(makeSong({ gain: 1.6 })), []);
  const plain = rig(), loud = rig({ change: { gain: 1.6 } });
  for (const { player } of [plain, loud]) player.start(0.4);
  plain.to(12);
  loud.to(12);
  const stem = ({ context, out }) => peakThrough(context.bufferSources.find(s => s.buffer && s.outputs.length), out);
  assert.ok(Math.abs(stem(loud) / stem(plain) - 1.6) < 1e-9, 'the song');
  for (const role of ROLES) assert.ok(Math.abs(loud.player.hits[role].gain.value / plain.player.hits[role].gain.value - 1.6) < 1e-9, role);
});

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
  // the song and the hits leave a little under full level (headroom), so a hit on top of a full song never clips, and straight to
  // the music bus: no compressor, whose look-ahead would put the song behind the hits
  assert.ok(player.hits.a.gain.value <= 0.85, 'headroom for the hits');
  assert.ok(!context.of('compressor').length, 'no compressor in the player');
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
  // its edge: the same copy driven into a soft clip (the note's own overtones, which a tablet's small speaker can play) and through
  // a high-pass, much louder at its start
  const edge = accent.outputs.find(node => node.outputs.some(next => next.kind === 'shaper' && next.curve
    && next.outputs.some(after => after.kind === 'filter' && after.type === 'highpass')));
  assert.ok(edge, 'the copy has an edge through a soft clip and a high-pass');
  assert.ok(edge.gain.valueAt(accent.starts[0].when + 0.002) >= 2.5, 'the edge is at least 2.5 times the note at its start');
  const late = player.chart.find(n => n.layer === 'bassi' && n.t > note.t);
  to(late.t + late.dur + 0.01);
  const made = context.bufferSources.length;
  player.hit(late, 0.3);
  assert.equal(context.bufferSources.length, made); // past its end: no accent
  assert.ok(player.isOpen('b'));
  player.stop(); // every test ends so: the timer would keep the test running
});

test('v2 song: a sung stem (voice) is never pushed up and down by the taps; two misses in a row muffle it, gently', () => {
  const sung = (voice, id = 'bassi') => makeSong().layers.map(l => (l.id === id ? { ...l, voice } : l));
  assert.deepEqual(validateSong(makeSong({ layers: sung(true) })), []);
  assert.ok(validateSong(makeSong({ layers: sung('yes') })).some(p => p.includes('voice')));
  assert.ok(validateSong(makeSong({ layers: sung(true, 'lag') })).some(p => p.includes('voice')), 'a voice is a recorded stem');
  const { context, player, to } = rig({ change: { layers: sung(true) } });
  player.start(0.4);
  to(10); // the chart grows a section at a time
  const note = player.chart.find(n => n.layer === 'bassi' && n.t > 11);
  to(note.t - 0.05);
  const before = context.bufferSources.length;
  player.hit(note, -0.03);
  assert.equal(context.bufferSources.length, before, 'a hit does not double the syllable (a voice would jump up and fall back)');
  player.stray('b');
  assert.equal(context.bufferSources.length, before, 'a tap at no note plays no bit of the voice');
  // one miss between hits: the voice goes on as it is (down at a miss and up at the next hit would be at every tap)
  to(40); // more of the song known (the chart grows a section at a time); which of her notes they are does not matter
  const later = player.chart.filter(n => n.role === 'b' && n !== note);
  assert.ok(later.length >= 4);
  const gate = player.chains.b.gate.gain;
  player.miss(later[0]);
  player.hit(later[1], 0);
  player.miss(later[2]);
  assert.ok(player.isOpen('b'), 'a miss, a hit, a miss: still singing');
  assert.equal(gate.valueAt(context.currentTime + 1), 1);
  // two in a row: she is muffled, gently, and stays so (no ghost coming and going)
  player.miss(later[3]);
  assert.ok(!player.isOpen('b'), 'two in a row muffle her voice');
  assert.ok(gate.valueAt(context.currentTime + 0.05) > 0.6, 'not at once');
  to(42);
  assert.ok(gate.valueAt(context.currentTime) < 0.25, 'but soon, and she stays down until a hit');
  player.hit(later[0], 0);
  assert.ok(player.isOpen('b'), 'a hit brings her back');
  assert.ok(gate.valueAt(context.currentTime + 0.05) < 0.6, 'gently');
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

test('every v2 song: valid, nothing shared, playable at both levels and with two lanes', async () => {
  for (const entry of SONGS_V2.filter(e => fs.existsSync(new URL(`../engine/sloedla/v2/songs/${e.file}`, import.meta.url)))) {
    const song = (await entry.load()).default;
    assert.deepEqual(validateSong(song), [], entry.id);
    const source = fs.readFileSync(new URL(`../engine/sloedla/v2/songs/${entry.file}`, import.meta.url), 'utf8');
    for (const [, from] of source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) assert.equal(from, `./${song.id}.chart.js`, `${song.id} imports ${from}`);
    const { beat, sections } = timelineOf(song);
    for (const level of ['barn', 'fullordinn']) {
      for (const roles of [['a', 'b', 'c'], ['a', 'c']]) {
        const notes = sections.flatMap((_, i) => sectionChart(song, i, 'normal', { level, roles }));
        assert.deepEqual(chartProblems(notes, { level, beat, roles }), [], `${song.id} ${level} ${roles.join('')}`);
      }
    }
  }
});
