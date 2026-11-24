// Stjörnuhátíðin's song in the game (chapters/hatid-song.js, written by tools/hatid-song.mjs from tools/hatid-lag/render.mjs): the
// owner's pick H as it is, its beat map, and the helpers every picture of the party reads the song's clock through
// (chapters/hatid-score.js). Lean: the form the party is drawn to, and what the child hears in it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SONG } from '../chapters/hatid-song.js';
import { BEAT, END_BEAT, beatAt, secondsAt, sectionAt, soloAt, callAt, entered, energyAt, pulseAt, cuesIn } from '../chapters/hatid-score.js';
import { SOLOS, CALLS } from '../tools/hatid-lag/form.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { sections, endBeat, entries, solos, calls, cues } = SONG.song;
const part = id => sections.find(section => section.id === id);
const inside = (beat, id) => beat >= part(id).startBeat && beat < part(id).startBeat + part(id).beats;
const cents = (a, b) => 1200 * Math.log2(a / b);

test('the beat map is the form: six sections end to end on bar lines, and the song ends on its last bar with the chord ringing on', () => {
  assert.deepEqual(sections.map(section => section.id), ['intro', 'dance', 'solos', 'quiet', 'chorus', 'chord']);
  const end = sections.reduce((at, section) => {
    assert.equal(section.startBeat, at, section.id);
    assert.equal(section.beats % SONG.beatsPerBar, 0, `${section.id} is whole bars`);
    return at + section.beats;
  }, 0);
  assert.equal(end, endBeat);
  assert.equal(END_BEAT, endBeat);
  assert.ok(SONG.song.tail > 0.5, 'the last chord rings after the last bar');
  assert.ok(Math.abs(SONG.song.seconds - (SONG.beatOffset + endBeat * 60 / SONG.bpm + SONG.song.tail)) < 0.05);
  assert.ok(SONG.song.seconds > 225 && SONG.song.seconds < 250, 'about four minutes');
});

test('one tempo, one key: the file drifts under 20 ms from its grid, and it is not chapter 5\'s song', () => {
  assert.ok(SONG.driftMs < 20, `${SONG.driftMs} ms`);
  assert.equal(SONG.beatsPerBar, 4);
  assert.equal(SONG.danceBeats, 2);
  assert.ok(!(Math.round(SONG.bpm) === 125 && SONG.keyName.root === 'A'), 'not chapter 5\'s 125 bpm in A');
  assert.equal(SONG.key.length, 5);
  assert.ok(SONG.key.every((hz, i) => i === 0 || hz > SONG.key[i - 1]), 'the key rises from its root');
  assert.ok(Math.abs(BEAT - 60 / SONG.bpm) < 1e-12);
});

test('the motif is six rising notes of the song\'s key, each within 5 cents', () => {
  const { motif, keyName, tuningCents = 0 } = SONG;
  assert.equal(motif.length, 6);
  assert.ok(motif.every((hz, i) => i === 0 || hz > motif[i - 1]), 'rising');
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const root = NAMES.indexOf(keyName.root);
  const scale = (keyName.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]).map(step => (root + step) % 12);
  for (const hz of motif) {
    const midi = 69 + 12 * Math.log2(hz / 440) - tuningCents / 100;
    assert.ok(Math.abs(cents(hz, 440 * 2 ** ((Math.round(midi) - 69 + tuningCents / 100) / 12))) <= 5, `${hz} Hz within 5 cents`);
    assert.ok(scale.includes(((Math.round(midi) % 12) + 12) % 12), `${hz} Hz is in ${keyName.root} ${keyName.mode}`);
  }
});

test('six entries in the intro, Slóeðla\'s horn first and alone until the second, and the choir where the voices come', () => {
  assert.deepEqual(entries.map(entry => entry.who), ['sloedla', 'gramedla', 'kambedla', 'uggedla', 'thorsedla', 'flugedla', 'choir']);
  const intro = entries.slice(0, 6);
  assert.equal(intro[0].beat, 0);
  assert.ok(intro.every((entry, i) => inside(entry.beat, 'intro') && (i === 0 || entry.beat > intro[i - 1].beat)), 'one at a time, in the intro');
  assert.ok(intro.every(entry => entry.beat % SONG.danceBeats === 0), 'on dance beats');
  assert.ok(intro.at(-1).beat <= part('dance').startBeat - SONG.beatsPerBar, 'the last a bar before the dance');
  // nothing laid on the song before the second entry: the horn is alone
  assert.equal(cues.filter(cue => ['stomp', 'plate', 'tail', 'scratch'].includes(cue.kind) && cue.beat < intro[1].beat).length, 0);
  // each friend's sound is heard from her entry on, not before
  for (const [who, kind] of [['gramedla', 'stomp'], ['kambedla', 'plate'], ['uggedla', 'tail'], ['flugedla', 'scratch']]) {
    const first = cues.filter(cue => cue.kind === kind && cue.who === who).map(cue => cue.beat);
    assert.ok(first.length, `${who} has ${kind} cues`);
    assert.equal(Math.min(...first), entries.find(entry => entry.who === who).beat, `${who}'s ${kind} from her entry`);
  }
  const choir = entries.at(-1);
  assert.ok(choir.beat >= part('dance').startBeat && inside(choir.beat, 'dance'), 'the choir comes in the first dance, where the voices are');
});

test('six equal solos of whole beats, back to back, filling the solo section, in the spec\'s order', () => {
  assert.deepEqual(solos.map(solo => solo.who), SOLOS);
  const { startBeat, beats } = part('solos');
  assert.ok(Number.isInteger(solos[0].beats) && solos.every(solo => solo.beats === solos[0].beats), 'equal');
  solos.reduce((at, solo) => { assert.equal(solo.startBeat, at); return at + solo.beats; }, startBeat);
  assert.equal(solos.length * solos[0].beats, beats);
});

test('eight calls: the four moves in the first dance and again in the last chorus, each a bar\'s gap, done on the next bar', () => {
  assert.deepEqual(calls.map(call => call.move), [...CALLS, ...CALLS]);
  assert.deepEqual(calls.map(call => call.section), ['dance', 'dance', 'dance', 'dance', 'chorus', 'chorus', 'chorus', 'chorus']);
  for (const call of calls) {
    assert.equal(call.beats, 4);
    assert.equal((call.beat - part(call.section).startBeat) % SONG.beatsPerBar, 0, `${call.move} on a bar line`);
    assert.equal(call.doBeat, call.beat + 4);
    assert.ok(inside(call.beat, call.section) && inside(call.doBeat, call.section), `${call.move} inside its ${call.section}`);
  }
  const chorus = calls.filter(call => call.section === 'chorus').map(call => call.beat);
  assert.equal(new Set(chorus.slice(1).map((beat, i) => beat - chorus[i])).size, 1, 'evenly spread in the chorus');
});

test('the quiet part has no stomp, plate, tail, scratch or hit; roars and bursts are only in the last chorus', () => {
  for (const cue of cues) {
    if (['stomp', 'plate', 'tail', 'scratch', 'hit'].includes(cue.kind)) assert.ok(!inside(cue.beat, 'quiet'), `${cue.kind} at ${cue.beat}`);
    if (['roar', 'burst'].includes(cue.kind)) assert.ok(inside(cue.beat, 'chorus'), `${cue.kind} at ${cue.beat}`);
  }
  assert.ok(cuesIn('horn', 0, endBeat).length > 0, 'her horn phrases are cues');
  assert.ok(cuesIn('roar', 0, endBeat).length > 0 && cuesIn('burst', 0, endBeat).length > 0);
});

test('the last chorus is the loudest part, 2 LU over the first dance, and the chord dies into silence', () => {
  const { loudness } = SONG.song;
  const loudest = Object.entries(loudness.sections).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(loudest, 'chorus');
  assert.ok(loudness.sections.chorus - loudness.sections.dance >= 2, `${loudness.sections.chorus} against ${loudness.sections.dance}`);
  assert.ok(loudness.sections.quiet < loudness.sections.dance - 3, 'the quiet part is quiet');
  assert.ok(loudness.lastSecondDb < -60, `the file ends in silence (${loudness.lastSecondDb} dB)`);
  assert.ok(Math.abs(loudness.lufs + 16) <= 0.5 && loudness.truePeak <= -1.0, `${loudness.lufs} LUFS, ${loudness.truePeak} dBTP`);
});

test('the module is the file: hatid-song.js is song.json, and --check finds nothing to write', () => {
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'remake/assets/audio/hatid/song/song.json'), 'utf8'));
  assert.deepEqual(SONG, json);
  assert.ok(fs.statSync(path.join(ROOT, 'remake/assets/audio/hatid/song', SONG.song.src)).size > 1_000_000);
  // the render lives under qa/ (git ignores it): only a checkout that has it can say the game's files are its
  if (!fs.existsSync(path.join(ROOT, 'qa/remake/hatid/lag/hatid-h/mix.mp3'))) return;
  execFileSync(process.execPath, [path.join(ROOT, 'remake/tools/hatid-song.mjs'), '--check'], { stdio: 'pipe' });
});

test('sectionAt, soloAt and callAt read the map: who has the spotlight at each solo\'s first and last beat', () => {
  assert.equal(sectionAt(-0.01), null);
  assert.equal(sectionAt(0).id, 'intro');
  assert.equal(sectionAt(part('quiet').startBeat).id, 'quiet');
  assert.equal(sectionAt(endBeat + 0.5).id, 'chord', 'the tail rings in the chord');
  assert.equal(sectionAt(endBeat + SONG.song.tail / BEAT + 0.01), null);
  for (const solo of solos) {
    assert.equal(soloAt(solo.startBeat).who, solo.who);
    assert.equal(soloAt(solo.startBeat).u, 0);
    const last = soloAt(solo.startBeat + solo.beats - 0.01);
    assert.equal(last.who, solo.who);
    assert.ok(last.u > 0.99 && last.u < 1);
  }
  assert.equal(soloAt(part('solos').startBeat - 0.01), null);
  for (const call of calls) {
    assert.deepEqual([callAt(call.beat).move, callAt(call.beat).doing], [call.move, false]);
    assert.deepEqual([callAt(call.doBeat).move, callAt(call.doBeat).doing], [call.move, true]);
  }
  assert.equal(callAt(part('quiet').startBeat + 1), null);
  // the clock: seconds and beats are one map
  assert.ok(Math.abs(beatAt(secondsAt(123.25)) - 123.25) < 1e-9);
  assert.ok(Math.abs(secondsAt(0) - SONG.beatOffset) < 1e-12);
  // entries ease in over a bar; the pulse is 1 on a beat; the energy is lowest in the quiet part and highest in the chorus
  const kamb = entries.find(entry => entry.who === 'kambedla').beat;
  assert.deepEqual([entered('kambedla', kamb - 1), entered('kambedla', kamb + 4)], [0, 1]);
  assert.ok(entered('kambedla', kamb + 2) > 0 && entered('kambedla', kamb + 2) < 1);
  assert.equal(entered('sloedla', 0.0001) > 0, true);
  assert.ok(Math.abs(pulseAt(40) - 1) < 1e-9 && pulseAt(40.5) < pulseAt(40.1));
  const mid = id => energyAt(part(id).startBeat + part(id).beats / 2);
  assert.ok(mid('quiet') < 0.2 && mid('chorus') > 0.8 && mid('dance') > mid('quiet') && mid('chorus') > mid('dance'));
  for (let beat = 0; beat < endBeat; beat += 0.5) assert.ok(energyAt(beat) >= 0 && energyAt(beat) <= 1);
  assert.deepEqual(cuesIn('stomp', 0, endBeat).map(cue => cue.beat), cues.filter(cue => cue.kind === 'stomp').map(cue => cue.beat));
});
