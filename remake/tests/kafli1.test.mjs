import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import * as kafli1 from '../chapters/kafli1.js';
import { updateActors } from '../engine/actor.js';
import { createScene } from '../engine/scene/scene.js';
import { createGlowFlower } from '../world/props/glow-flower.js';
import { WINK_SECONDS, WAVE_SECONDS, HUG_SECONDS, MOUTH_BETWEEN, handsAtRest } from '../engine/sun-face.js';
import { createTerrain } from '../world/forest/terrain.js';
import { planForest } from '../world/forest/plan.js';
import { placementInfo } from '../world/forest/forest.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { PRESETS } from '../engine/quality.js';
import { LIMITS } from '../engine/camera/director.js';
import { FOREST } from '../world/forest/config.js';
import { chapterWorld, playUnattended, EARLY_TAP_AT } from './chapter-harness.mjs';

// Chapter 1 (remake/chapters/kafli1.js) played from the start button to the journal by nobody at all, in the
// seeking mode a capture (?t=) uses: every wait for the child has to end by itself there, so the chapter reaches
// its end, and the timeline a capture lands on stays fixed. The world is a stand-in for the page's (no renderer,
// forests that are only their ground), with the real characters, camera director, scene, screen layer and journal
// (tests/chapter-harness.mjs).

const { chapter, onBone, POINTS, FLOWERS, hidingPlaces } = kafli1;
const file = relative => new URL(relative, import.meta.url);
const readJson = relative => JSON.parse(fs.readFileSync(file(relative), 'utf8'));
const SOURCE = readJson('../assets/audio/kafli1/lines-source.json');
// Kambeðla's invitation to her card game at the chapter's end is recorded with the game's lines (the eitt set).
const EITT_SOURCE = readJson('../assets/audio/eitt/lines-source.json');
const RECORDED = readJson('../assets/audio/lines.json');
const NARRATION = readJson('../../dist/assets/audio/narration-is.json');
const CHAPTER_TEXT = fs.readFileSync(file('../chapters/kafli1.js'), 'utf8');

let played = null;
const unattended = () => (played ??= playUnattended(kafli1));
let ignored = null;
const ignoredByAChild = () => (ignored ??= playUnattended(kafli1, { seeking: false, limit: 900 }));
let eager = null;
const playedByAnEagerChild = () => (eager ??= playUnattended(kafli1, { seeking: false, eager: true, limit: 900 }));

// ---------------------------------------------------------------------------------------------
// The lines

const words = text => text.replace(/\[[^\]]*\]\s*/g, '').trim(); // what is said, without the voice's tags

test('kafli1 uses only lines that exist', async () => {
  const source = new Map(SOURCE.map(line => [line.id, line]));
  // Each of the chapter's lines is a recording the game has, with the words it was recorded with. The invitation to "Eitt!" is one of
  // the card game's lines (the eitt set).
  for (const [id, line] of Object.entries(chapter.lines)) {
    assert.ok(line.audio && RECORDED[line.audio], `${id} has no recording in lines.json`);
    const game = EITT_SOURCE.find(entry => entry.id === id);
    if (game) {
      assert.equal(line.audio, id);
      assert.equal(line.text, words(game.text), `${id} says what the game's lines say`);
      continue;
    }
    if (id === 'welcome') {
      assert.equal(line.audio, 'welcome', 'scene 3 reuses the game\'s greeting');
      assert.equal(line.text, NARRATION.welcome, 'with the words of the game\'s greeting');
    } else {
      assert.ok(source.has(id), `${id} is not a line of chapter 1 (lines-source.json)`);
      assert.equal(line.audio, id);
      assert.equal(line.text, words(source.get(id).text), `${id} says what the script says`);
    }
  }
  // Every line of the chapter is there, the two Egill may say included.
  for (const id of source.keys()) assert.ok(chapter.lines[id], `${id} is missing from the chapter's lines`);
  // Whatever the script names as a line is one of them: the said lines and the hints, in the source.
  const named = new Set([...CHAPTER_TEXT.matchAll(/'(k1_(?:mosi|egill|kambedla)_[a-z0-9_]+|welcome)'/g)].map(match => match[1]));
  assert.ok(named.size >= SOURCE.length, `the script names ${named.size} lines, and lines-source.json has ${SOURCE.length}`);
  for (const id of named) assert.ok(chapter.lines[id], `the script names '${id}', which is not one of its lines`);
  // And played through, every caption shown is one of those lines' words, never an id shown as text.
  const { captions } = await unattended();
  const texts = new Set(Object.values(chapter.lines).map(line => line.text));
  assert.ok(captions.length >= 25, `${captions.length} lines were said`);
  for (const { text } of captions) assert.ok(texts.has(text), `the caption "${text}" is not one of the chapter's lines`);
  // Every line is said in one of the runs: the capture, the child who waits (the hints) and the eager child (the nose,
  // the critters, "Hvað er stjörnuhátíð?").
  const runs = [await unattended(), await ignoredByAChild(), await playedByAnEagerChild()];
  const said = new Set(runs.flatMap(run => [...run.seen.spoken]));
  for (const id of Object.keys(chapter.lines)) assert.ok(said.has(id), `${id} is never said`);
  // The ride's two opening lines of Mosi's are no taps' business: every run says them, not just one of the three.
  const who = ['the capture', 'the child who waits', 'the eager child'];
  runs.forEach((run, i) => {
    for (const id of ['k1_mosi_visit', 'k1_mosi_critters']) assert.ok(run.seen.spoken.has(id), `${id} is not said in the run of ${who[i]}`);
  });
});

test('each speaker has a name and a colour, Kambeðla in her plum', () => {
  assert.deepEqual(Object.keys(chapter.cast).sort(), ['egill', 'kambedla', 'mosi']);
  assert.equal(chapter.cast.kambedla.colour, '#5d4370');
  assert.equal(chapter.cast.kambedla.name, 'Kambeðla');
  for (const line of SOURCE) assert.ok(chapter.cast[line.speaker], `${line.speaker} speaks but has no caption name`);
});

// ---------------------------------------------------------------------------------------------
// The chapter as data

test('two places, each with its own shots and where the actors stand in it', () => {
  assert.equal(chapter.id, 'kafli1');
  assert.equal(chapter.title, 'Boð til kambeðlunnar');
  assert.equal(chapter.look, 'morning');
  assert.equal(chapter.start, 'rjodur');
  assert.deepEqual(Object.keys(chapter.locations).sort(), ['burknalaut', 'rjodur']);
  assert.deepEqual(Object.keys(chapter.actors).sort(), ['egill', 'kambedla', 'mosi']);
  const { rjodur, burknalaut } = chapter.locations;
  assert.equal(rjodur.layout.clearing.radius, 15, 'the clearing at real size');
  assert.ok(rjodur.layout.path.length >= 2, 'with the path leaving it');
  assert.equal(burknalaut.layout.clearing.radius, 9);
  assert.deepEqual(burknalaut.layout.glade, { ferns: 3, shafts: 4 });
  for (const [name, { layout, shots }] of Object.entries(chapter.locations)) {
    assert.equal(layout.leafShadows, true, `${name} has leaf shadows (R42)`);
    assert.ok(Object.keys(shots).length >= 6, `${name} keeps its shots clear: they are in its own shots`);
    assert.ok(layout.actors && Object.keys(layout.actors).length >= 2, `${name} says where its actors stand (R13)`);
  }
  assert.ok(!('kambedla' in rjodur.layout.actors), 'Kambeðla is not in the clearing');
  // The glade's plants sway within the style guide's bound at the seed the sway test measures (its broadleaf peaks
  // near 3 degrees at some seeds): another seed for the glade needs that test run at it.
  const swaySeed = Number(/const SEED = (\d+);/.exec(fs.readFileSync(file('forest-sway.test.mjs'), 'utf8'))[1]);
  assert.equal(burknalaut.layout.seed, swaySeed, 'the glade grows from the seed tests/forest-sway.test.mjs measures');
  assert.ok('kambedla' in burknalaut.layout.actors);
  // A name in two places, or in the chapter's own shots as well, would overwrite the other silently (main.js).
  const names = [...Object.keys(chapter.shots), ...Object.keys(rjodur.shots), ...Object.keys(burknalaut.shots)];
  assert.equal(new Set(names).size, names.length, 'every shot has a name of its own');
  assert.ok(rjodur.shots[chapter.startShot], 'the start shot is in the start place');
});

// The ground of a place, as its forest builds it (the floor rises away from a clearing).
const groundOf = name => {
  const { layout, shots } = chapter.locations[name];
  return createTerrain({ chapter }, { ...layout, shots }, layout.seed);
};

test('every shot of a place keeps the camera rules over that place\'s own ground', () => {
  for (const [name, { shots }] of Object.entries(chapter.locations)) {
    const ground = groundOf(name);
    for (const [label, shot] of Object.entries(shots)) {
      assert.ok(shot.fov >= LIMITS.lens[0] && shot.fov <= LIMITS.lens[1], `${label}: a ${shot.fov} degree lens`);
      if (!Array.isArray(shot.position)) continue; // it follows an actor: the run checks it (no director warnings)
      const [x, y, z] = shot.position;
      const height = y - ground.heightAt(x, z);
      assert.ok(height >= 0.3 && height <= LIMITS.maxHeight, `${label}: the camera ${height.toFixed(2)} m above ${name}'s ground`);
      if (Array.isArray(shot.target)) {
        const [tx, ty, tz] = shot.target;
        const down = (Math.atan2(y - ty, Math.hypot(tx - x, tz - z)) * 180) / Math.PI;
        assert.ok(down <= LIMITS.maxDown, `${label} looks ${down.toFixed(0)} degrees down`);
      }
    }
  }
});

test('the glow flowers hide by the big stone, under the ferns and up in the little tree, as the glade grows them on every preset', () => {
  const { layout, shots } = chapter.locations.burknalaut;
  const search = shots.search.position;
  assert.deepEqual(FLOWERS.map(f => f.name), ['stone', 'ferns', 'tree'], 'in the order the hints come');
  for (const [preset, q] of Object.entries(PRESETS)) {
    // What the glade's forest grows on this preset, told as the page's forest tells it (forest.js: info.placementList).
    const terrain = groundOf('burknalaut');
    const plan = planForest({ world: { chapter }, layout: { ...layout, shots }, seed: layout.seed, terrain, library: createSpeciesLibrary(layout.seed), q });
    const places = hidingPlaces(plan.placements.map(placementInfo));
    assert.deepEqual(places.map(p => p.name), ['stone', 'ferns', 'tree'], preset);
    for (const { name, position: [x, up, z], by } of places) {
      assert.ok(by, `${preset}: nothing grows where the ${name} flower hides`);
      const apart = Math.hypot(by.x - x, by.z - z);
      const where = `${preset}: the ${name} flower, ${apart.toFixed(2)} m from the middle of a ${by.name} of radius ${by.radius.toFixed(2)}`;
      if (name === 'stone') {
        assert.equal(by.name, 'rock', where);
        assert.ok(by.height >= 0.6, `${where}: a big stone, ${by.height.toFixed(2)} m tall`);
        assert.ok(apart > by.radius * 0.8 && apart < by.radius + 0.6, `${where}: right beside it`);
      } else if (name === 'ferns') {
        assert.equal(by.name, 'fern', where);
        assert.ok(apart < by.radius * 0.6, `${where}: under its fronds`);
      } else {
        assert.ok(['treeFern', 'cycad'].includes(by.name), `${where}: a little tree`);
        assert.ok(apart < by.trunk + 0.4, `${where}: on its trunk`);
        assert.ok(Math.abs(up - by.top) < 0.6 && by.height < 4, `${where}: up in it, ${up.toFixed(2)} m up, its trunk ends at ${by.top.toFixed(2)} m`);
      }
      // seen from the search camera, a little nearer than what hides it, so part of its glimmer shows
      assert.ok(Math.hypot(x - search[0], z - search[2]) < Math.hypot(by.x - search[0], by.z - search[2]), `${where}: on the camera's side of it`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Played through by nobody

test('every required wait has an auto option for seeking: the chapter plays to its end unattended, before 600 s', async () => {
  const { task, stage, world, journal, book, winks, director, pointer, seen } = await unattended();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.ok(stage.s.time < 600, `it ended at ${stage.s.time.toFixed(1)} s`);
  // Ten scenes, in order, the glade from scene 7 on.
  const timeline = world.chapterTimeline;
  assert.deepEqual(timeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (let i = 1; i < timeline.length; i++) assert.ok(timeline[i].at > timeline[i - 1].at + 5, `scene ${i + 1} comes well after scene ${i}`);
  assert.equal(world.location, 'burknalaut');
  assert.equal(seen.kambedlaInClearing, false, 'Kambeðla never shows in the clearing');
  assert.equal(world.actors.get('kambedla').root.visible, true);
  // The flowers were all found and picked, her plates all lit, the star is in the book and the book is open.
  const flowers = world.scene.children.filter(o => /^Glow flower (stone|ferns|tree)$/.test(o.name));
  assert.equal(flowers.length, 3, 'three glow flowers in the glade');
  for (const flower of flowers) assert.equal(flower.visible, false, `${flower.name} was picked`);
  assert.deepEqual(journal.stars, ['k1_kambedla']);
  assert.deepEqual(book.opened, [['animals', 'script'], ['games', 'script']], 'the chapter ends in the book, open on its games (where "Eitt!" waits) as the script\'s');
  assert.equal(journal.isOpen, true);
  assert.equal(winks.length, 2, 'the sun winks twice: "Sólin bíður ekki" and the star');
  assert.deepEqual(seen.held, { atTray: 3, atMmm: [2, 1, 0] }, 'the three flowers stay in his hands until each goes into her mouth');
  assert.equal(pointer.listeners.drag.length, 0, 'no free look is left over');
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
});

test('no fail states: a child who never touches the screen is helped through every wait to the end', async () => {
  const { task, stage, world, journal, captions, director, seen, added } = await ignoredByAChild();
  assert.equal(task.done, true, `the chapter was still waiting at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  const said = id => captions.filter(c => c.text === chapter.lines[id].text).length;
  assert.equal(said('k1_mosi_waving'), 1, 'Egill waved by himself, and Mosi saw it');
  assert.equal(said('k1_egill_yes'), 1, 'Egill said yes by himself when nobody chose');
  assert.ok(seen.floatStart, 'Egill floated up by himself');
  // Hints every 12 s, three to a flower, and then Egill picks it himself: nine hints, the three flowers in order.
  for (const id of ['k1_mosi_hint_stone', 'k1_mosi_hint_ferns', 'k1_mosi_hint_tree']) assert.equal(said(id), 3, `${id} three times`);
  for (const id of ['k1_mosi_one', 'k1_mosi_two', 'k1_mosi_three']) assert.equal(said(id), 1);
  // Mosi says again what to do with each flower, and Egill gives her each one himself: it leaves the tray by itself and
  // flies from his hands into her mouth.
  assert.equal(said('k1_mosi_give'), 4, 'once to begin, and once for each flower left in the tray');
  assert.equal(seen.trayDrops.made, 0, 'nobody dragged one');
  assert.equal(seen.trayRemoved.length, 3, 'each one left the tray by itself');
  assert.deepEqual(seen.held, { atTray: 3, atMmm: [2, 1, 0] }, 'and each left his hands as she took it');
  assert.deepEqual(journal.stars, ['k1_kambedla'], 'the star flew to the book by itself');
  assert.deepEqual(director.warnings, [], 'the hints and the waits keep the camera rules too');
  assert.ok(stage.s.time > (await unattended()).stage.s.time + 120, "and the waits were real ones, longer than a capture's");
});

// ---------------------------------------------------------------------------------------------
// The map in the journey (docs/superpowers/specs/2026-10-28-kortid-lifandi-og-i-ferdalaginu-design.md, section 3): as the ride begins
// the map slides up over the game, draws the leg ahead while Mosi says where they are going, and slides away

const MOMENT_HOLD = 0.8; // seconds the map stands once the line and the drawing are over
const LINE_HOLD = 0.5; // seconds a line is held after its recording (engine/scene/scene.js)

/** How long a map moment lasts in scene time: the drawing or Mosi's line (and its hold), whichever is longer, the map standing, and the slide away. */
const lasts = (run, moment, line) => Math.max(moment.drawMs / 1000, run.stage.s.lineDuration(line) + LINE_HOLD) + MOMENT_HOLD + moment.closeMs / 1000;

test('the map comes up as the ride begins: piece a drawn before "Haltu þér fast", Mosi saying where they go, and over by itself within 8 s', async () => {
  const ride = chapter.lines.k1_mosi_map_ride;
  const hold = chapter.lines.k1_mosi_hold;
  assert.equal(ride.text, 'Sjáðu, kortið! Við förum eftir stígnum að Burknalautinni, til Kambeðlu.');
  for (const [how, play] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const run = await play();
    const { moments, captions, doc, save, world, task, seen } = run;
    assert.equal(task.done, true, `${how}: the chapter plays on to its end`);
    assert.equal(moments.length, 1, `${how}: one map moment in the chapter, as the ride begins`);
    const [moment] = moments;
    assert.deepEqual(moment.ids, ['a'], `${how}: the leg from the clearing to the fern glade`);
    // After the book and the butterfly, before "Haltu þér fast", with Mosi's line about the map beside it.
    assert.ok(moment.saidBefore.has('k1_mosi_book') && moment.saidBefore.has('k1_mosi_book_close'), `${how}: it comes after the book`);
    assert.ok(!moment.saidBefore.has('k1_mosi_hold') && !moment.saidBefore.has('k1_mosi_map_ride'), `${how}: and before "Haltu þér fast", Mosi's line not yet said`);
    const said = captions.filter(c => c.text === ride.text);
    assert.equal(said.length, 1, `${how}: Mosi says where they are going, once`);
    assert.equal(said[0].who, 'Mosi');
    assert.ok(Math.abs(said[0].at - moment.at) < 0.1, `${how}: he begins as the map slides up (${said[0].at.toFixed(2)} s, the map at ${moment.at.toFixed(2)} s)`);
    // The line is drawn on the map, and kept as seen.
    assert.equal(moment.drawMs, 3250, `${how}: the slide up and the one piece`);
    assert.deepEqual(moment.states, { a: ['drawing'] }, `${how}: piece a draws itself, in the overlay`);
    assert.deepEqual(moment.seenAfter, ['map-route-a'], `${how}: and the save has it as seen`);
    assert.ok(save.get().seen.includes('map-route-a'), `${how}: for good`);
    // Nothing is cut: the game goes on under the map.
    assert.ok(moment.goneAt !== null, `${how}: the overlay was taken off the page`);
    assert.deepEqual(seen.cuts.filter(cut => cut.at > moment.at + 1e-6 && cut.at < moment.goneAt), [], `${how}: the camera cuts nowhere while the map is up`);
    // It ends by itself, on the game clock: Mosi's line and the drawing, 0.8 s of the map standing, 0.6 s sliding away.
    assert.equal(moment.closeMs, 600, `${how}: it slides away in 0.6 s`);
    const lasted = moment.goneAt - moment.at;
    assert.ok(lasted < 8, `${how}: the moment lasted ${lasted.toFixed(2)} s of scene time`);
    assert.ok(Math.abs(lasted - lasts(run, moment, 'k1_mosi_map_ride')) < 0.15, `${how}: it waits for Mosi's line, then 0.8 s, then the slide (${lasted.toFixed(2)} s)`);
    assert.ok(moment.closeAt >= said[0].at + run.stage.s.lineDuration('k1_mosi_map_ride') + LINE_HOLD + MOMENT_HOLD - 0.1, `${how}: the map never goes while Mosi still speaks`);
    // Then "Haltu þér fast. Af stað!" and the ride, with no map left on the page.
    const holdFast = captions.find(c => c.text === hold.text);
    assert.ok(holdFast.at >= moment.goneAt - 1e-6, `${how}: "Haltu þér fast" comes once the map is gone`);
    assert.ok(world.chapterTimeline.find(m => m.scene === 6).at >= moment.goneAt, `${how}: and so does the ride`);
    assert.equal(doc.body.children.filter(e => e.classList.contains('map-moment')).length, 0, `${how}: no overlay is left on the page`);
    assert.ok(seen.spoken.has('k1_mosi_hold'), `${how}: the ride goes on`);
  }
});

test('the moment is silent here (no sound allowed, no effects) and still times itself by Mosi\'s line', async () => {
  // The harness's journal has no audio, as a page whose sound the browser has not yet allowed has none to play: the map comes and
  // goes all the same, on the game clock and Mosi's line.
  const run = await unattended();
  assert.equal(run.journal.mapMoment.isOpen, false);
  const [moment] = run.moments;
  assert.ok(Math.abs(moment.goneAt - moment.at - lasts(run, moment, 'k1_mosi_map_ride')) < 0.15);
  assert.ok(!run.soundLog.some(e => e.name === 'mapOpen' || e.name === 'mapPen'), 'the scene asks the game\'s effects for nothing: the journal\'s own audio sounds the map');
});

test('a child who plays the chapter again, with piece a seen already, sees the map draw it again, and the book is as it was', async () => {
  const first = await unattended();
  const run = await playUnattended(kafli1, { seenBefore: ['map-route-a'], limit: first.moments[0].goneAt + 3 });
  assert.equal(run.moments.length, 1, 'the moment still plays');
  const [moment] = run.moments;
  assert.deepEqual(moment.seenBefore, ['map-route-a'], 'the piece was seen already');
  assert.equal(moment.drawMs, 3250, 'and is drawn again, over the slide');
  assert.deepEqual(moment.states, { a: ['drawing'] }, 'drawing in the overlay');
  assert.deepEqual(run.save.get().seen, ['map-route-a'], 'seen once, as before');
  assert.ok(run.seen.spoken.has('k1_mosi_map_ride'), 'with Mosi saying where they go');
  assert.deepEqual(run.book.opened, [['animals', 'script']], 'the book was opened by the story as before, and by the map not at all');
  assert.equal(run.doc.body.children.filter(e => e.classList.contains('map-moment')).length, 0, 'nothing left behind');
});

test('with less motion the map comes and goes without sliding or drawing, the line simply there, and the map still waits for Mosi', async () => {
  const first = await unattended();
  const run = await playUnattended(kafli1, { reduced: true, limit: first.moments[0].goneAt + 3 });
  const [moment] = run.moments;
  assert.equal(moment.drawMs, 0, 'no slide to wait for, no drawing');
  assert.deepEqual(moment.states, { a: ['drawn'] }, 'piece a is simply there');
  assert.deepEqual(moment.seenAfter, ['map-route-a'], 'and kept as seen');
  assert.equal(moment.closeMs, 0, 'it goes at once');
  const line = run.stage.s.lineDuration('k1_mosi_map_ride');
  assert.ok(Math.abs(moment.closeAt - moment.at - (line + LINE_HOLD + MOMENT_HOLD)) < 0.15, `the map waits for Mosi's line, then stands 0.8 s (${(moment.closeAt - moment.at).toFixed(2)} s)`);
  assert.ok(moment.goneAt - moment.closeAt < 0.1, 'and is gone as it closes');
  assert.ok(run.seen.spoken.has('k1_mosi_map_ride'));
});

test('the chapter draws once, behind the black, everything that would build its shaders as the child watches', async () => {
  const { world } = await playUnattended(kafli1, { limit: 0.2 }); // the script's setup has run: the saddle is made, her plates are grey
  const effects = world.effects.size;
  const inScene = new Set(world.scene.children);
  const warm = chapter.warmUp(world);
  const under = root => { const names = []; root.traverse(o => names.push(o.name)); return names; };
  for (const actor of world.actors.values()) assert.ok(warm.objects.includes(actor.root), `${actor.name} is drawn, hidden or not`);
  assert.ok(under(world.actors.get('mosi').root).includes('mosi saddle'), 'with the saddle, before it pops on');
  assert.ok(under(world.actors.get('egill').root).some(name => / eyelids$/.test(name)), 'and the eyelids, which show only while shut');
  const kambedla = world.actors.get('kambedla');
  let glowing = false;
  kambedla.model.traverse(o => { if (o.isMesh && o.material.customProgramCacheKey?.().includes('plate-glow')) glowing = true; });
  assert.ok(glowing, 'Kambeðla with her plate glow, out of sight in the clearing');
  // Throwaways of what comes later: a glimmering flower, one of each critter and a bird, a print, sparkles and pollen.
  const names = warm.objects.flatMap(under);
  assert.ok(names.some(name => name.startsWith('Glow flower ')), 'a glow flower');
  for (const kind of ['frog', 'snail', 'beetle']) assert.ok(names.includes(kind), `a ${kind}`);
  assert.ok(warm.objects.some(o => o.name === 'Critters' && o.children.some(c => c.isInstancedMesh)), 'and a bird');
  const prints = warm.objects.find(o => o.name === 'Footprints');
  assert.ok(prints?.count >= 1, 'a footprint (an instanced mesh with none draws nothing, and builds nothing)');
  const fresh = world.scene.children.filter(o => !inScene.has(o));
  assert.ok(fresh.some(o => o.isPoints && o.material.blending === THREE.AdditiveBlending), 'sparkles');
  assert.ok(fresh.some(o => o.isPoints && o.material.blending === THREE.NormalBlending), 'pollen');
  // The views whose shadow passes the story draws, and the glade's own.
  assert.deepEqual(warm.shots, ['dawn', 'egillWaves', 'mountHigh', 'rideFeet']);
  assert.deepEqual(chapter.locations.burknalaut.warmUp, ['gladeArrive', 'search', 'feeding']);
  // The glade is built behind the start button too (two resident forests: +31.5 MB of geometry, textures under 40 MB), so the
  // change of place is only its two fades.
  assert.deepEqual(chapter.prepare, ['burknalaut']);
  for (const shot of warm.shots) assert.ok(shot in chapter.locations.rjodur.shots, shot);
  for (const shot of chapter.locations.burknalaut.warmUp) assert.ok(shot in chapter.locations.burknalaut.shots, shot);
  // The tray as scene 9 shows it, built once behind the start button.
  const { seen } = await unattended();
  assert.deepEqual(warm.tray, seen.trayShown[0]);
  warm.dispose();
  assert.deepEqual(world.scene.children.filter(o => !inScene.has(o)), [], 'the throwaways leave the scene');
  world.effects.update(1 / 30);
  assert.equal(world.effects.size, effects, 'and nothing of theirs runs on');
});

test('a child who finds Mosi\'s nose late still has time to make him sneeze: the window grows after the tickle', async () => {
  // The first tap comes at 4.2 s of the nose's 5, so the giggle ends past them; the second comes 2.5 s after the giggle.
  const giggle = RECORDED.k1_mosi_tickle.duration + 0.5; // the line and its hold
  const { world, captions, added } = await playUnattended(kafli1, { seeking: false, limit: 100, noseAt: [4.2, 4.2 + giggle + 2.5] });
  const said = id => captions.filter(c => c.text === chapter.lines[id].text);
  assert.equal(said('k1_mosi_tickle').length, 1, 'the first tap tickles');
  assert.equal(said('k1_mosi_sneeze').length, 1, 'and the second, after the tickle, makes him sneeze');
  assert.ok(added.some(o => o.name === 'Sparkles' && o.normal), 'the pollen flies');
  assert.ok(world.chapterTimeline.at(-1).scene >= 4, 'and the story goes on to the Star Festival');
});

test('the "atsjú!" is the last burst of the sneeze\'s mouth track, 1.5 s in when the line has none; the scene gives a line\'s mouth track, or null', () => {
  assert.equal(kafli1.atsjuOf('0f0000ff00'), 0.3, 'the last run of sound starts at frame 6 of 20 a second');
  assert.equal(kafli1.atsjuOf('0ff'), 0.05);
  assert.equal(kafli1.atsjuOf(''), 1.5, 'an empty track');
  assert.equal(kafli1.atsjuOf(null), 1.5, 'no recording');
  assert.equal(kafli1.atsjuOf('0000'), 1.5, 'a silent one');
  const { s } = createScene({
    world: { chapter: { lines: { a: { text: 'Atsjú!', audio: 'rec_a' }, b: { text: 'No recording.' }, c: { text: 'A lost one.', audio: 'rec_c' } } } },
    director: {}, ui: {}, voice: {}, lines: { rec_a: { src: 'a.mp3', duration: 0.5, mouth: '0f80' } },
  });
  assert.equal(s.lineMouth('a'), '0f80');
  assert.equal(s.lineMouth('b'), null, 'a line with no recording');
  assert.equal(s.lineMouth('c'), null, 'a recording lines.json does not have');
  assert.equal(s.lineMouth('nowhere'), null, 'a line the chapter does not have');
});

test('an eager child who taps everything: each tap does its one thing once, and the optional ones never get in the way', async () => {
  const { task, stage, journal, captions, added, lines, director, seen } = await playedByAnEagerChild();
  assert.equal(task.done, true, `still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  const said = id => captions.filter(c => c.text === chapter.lines[id].text);
  // His nose: once it tickles, the second time he sneezes and the pollen flies (a cloud that dims what is behind it) on the
  // "atsjú!", the last burst of sound in the recording.
  assert.equal(said('k1_mosi_tickle').length, 1);
  assert.equal(said('k1_mosi_sneeze').length, 1);
  // Read here on its own, not with the chapter's function: the last run of non-zero frames before the closing quiet.
  const atsju = /[1-9a-f]+0*$/.exec(lines.k1_mosi_sneeze.mouth).index;
  const sneeze = said('k1_mosi_sneeze')[0].at + atsju / 20;
  assert.ok(added.some(o => o.name === 'Sparkles' && o.normal && Math.abs(o.at - sneeze) < 0.1), `pollen flies on the "atsjú!", at ${sneeze.toFixed(2)} s`);
  assert.ok(seen.floatStart, 'Egill floated up when tapped');
  // Asked what the festival is, Egill asks it and Mosi tells, and the same choice comes again.
  assert.equal(said('k1_egill_what').length, 1);
  assert.equal(said('k1_mosi_explain').length, 1);
  assert.equal(said('k1_egill_yes').length, 1);
  // The critters by the path go in the journal, and Mosi says something about each, never over another line of his.
  assert.deepEqual(['beetle', 'frog', 'snail'].filter(kind => journal.findings.includes(kind)), ['beetle', 'frog', 'snail']);
  for (const id of ['k1_mosi_beetle', 'k1_mosi_frog', 'k1_mosi_snail']) assert.equal(said(id).length, 1, `${id} once`);
  const mosis = captions.filter(c => c.who === 'Mosi').sort((a, b) => a.at - b.at);
  for (let i = 1; i < mosis.length; i++) {
    const line = Object.values(chapter.lines).find(l => l.text === mosis[i - 1].text);
    assert.ok(mosis[i].at >= mosis[i - 1].at + lines[line.audio].duration - 1e-6, `"${mosis[i].text}" begins over "${mosis[i - 1].text}"`);
  }
  // Every flower found by a tap, no hints needed. Each flower dragged to her mouth is taken, whichever pocket it comes from,
  // the first a second after the tray shows (while Mosi still says what to do): none goes home and Egill gives none.
  for (const id of ['k1_mosi_hint_stone', 'k1_mosi_hint_ferns', 'k1_mosi_hint_tree']) assert.equal(said(id).length, 0, `no ${id}`);
  assert.deepEqual(seen.trayDrops, { made: 3, home: 0 }, 'three drops, each one taken');
  assert.deepEqual(seen.trayRemoved.map(r => r.id), ['flower-3', 'flower-2', 'flower-1'], 'the last pocket each time');
  assert.deepEqual(seen.held, { atTray: 3, atMmm: [2, 1, 0] }, 'each one he gives leaves his hands');
  assert.equal(said('k1_mosi_give').length, 1, 'no need to say it again');
  assert.deepEqual(journal.stars, ['k1_kambedla']);
  assert.deepEqual(director.warnings, []);
  assert.ok(stage.s.time < (await ignoredByAChild()).stage.s.time - 100, 'and it goes much quicker than for a child who waits');
});

test('on the ride Mosi presses big footprints into the path, seen by his feet, and birds flutter up from the path ahead', async () => {
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild]]) {
    const { seen } = await run();
    assert.ok(seen.printsInRideFeet >= 4, `${how}: ${seen.printsInRideFeet} of his prints in the low shot by his feet`);
    assert.equal(seen.printsInGlade, false, `${how}: and none follow him into the glade`);
    const ride = seen.birdsUp.filter(b => b.scene === 6);
    assert.equal(ride.length, 3, `${how}: three birds fly up on the ride`);
    assert.ok(ride.every(b => b.shot === 'rideWide' && b.seen), `${how}: from the path ahead, where the wide shot sees them`);
  }
});

test('on the ride Mosi names the visit and then tells Egill to look out for small animals, before the camera shows the first one', async () => {
  const visit = chapter.lines.k1_mosi_visit;
  const critters = chapter.lines.k1_mosi_critters;
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const { captions, lines, seen, world } = await run();
    const cutAt = shot => seen.cuts.find(cut => cut.shot === shot).at;
    const mosis = captions.filter(c => c.who === 'Mosi').sort((a, b) => a.at - b.at);
    const said = line => mosis.filter(c => c.text === line.text);
    assert.equal(said(visit).length, 1, `${how}: the visit line once`);
    assert.equal(said(critters).length, 1, `${how}: and the line about the small animals once`);
    const [first] = said(visit);
    const [second] = said(critters);
    // On the ride, right after the visit line, and never over it: no remark about a critter the child tapped gets in between.
    assert.ok(first.at > world.chapterTimeline.find(m => m.scene === 6).at, `${how}: it comes in scene 6, the ride`);
    assert.equal(mosis.indexOf(second), mosis.indexOf(first) + 1, `${how}: nothing of Mosi's comes between the two`);
    assert.ok(second.at >= first.at + lines[visit.audio].duration - 1e-6, `${how}: the second begins over the first`);
    // A critter's remark waits for both.
    const over = second.at + lines[critters.audio].duration;
    for (const id of ['k1_mosi_beetle', 'k1_mosi_frog', 'k1_mosi_snail']) {
      for (const remark of said(chapter.lines[id])) assert.ok(remark.at >= over - 1e-6, `${how}: ${id} comes before the line about the small animals is over`);
    }
    // It is over, its caption too (a line is held half a second after its recording), before the camera cuts to the first critter,
    // the beetle in rideFeet, and long before the move to the glade.
    assert.ok(over + 0.5 < cutAt('rideFeet'), `${how}: the line about the small animals runs until ${over + 0.5} s, the camera shows the beetle at ${cutAt('rideFeet')} s`);
    assert.ok(over + 0.5 < cutAt('gladeArrive'), `${how}: and the glade comes after it, at ${cutAt('gladeArrive')} s`);
  }
});

test('a critter tapped in the ride\'s first second reacts at once, and Mosi remarks on it only after his two ride lines', async () => {
  // The beetle can be tapped from the ride's first frame, in the rideWide shot. A child who taps it 0.3 s in: it rolls over and
  // goes in the journal at the tap, but Mosi's voice is already his ride lines', so his "Sjáðu, bjalla!" waits for both.
  const visit = chapter.lines.k1_mosi_visit;
  const critters = chapter.lines.k1_mosi_critters;
  const beetle = chapter.lines.k1_mosi_beetle;
  const { captions, lines, seen, world, finds } = await playUnattended(kafli1, { limit: 240, earlyTap: { name: 'beetle', after: 0.3 } });
  const ride = world.chapterTimeline.find(m => m.scene === 6).at;
  const tap = seen.earlyTap;
  assert.ok(tap, 'the beetle was tapped');
  assert.ok(tap.appeared - ride < 0.05 && tap.at - ride < 1, `in the ride's first second: it could be tapped ${(tap.appeared - ride).toFixed(2)} s in and was ${(tap.at - ride).toFixed(2)} s in`);
  assert.ok(tap.found.includes('beetle'), `it went in the journal at the tap (${JSON.stringify(tap.found)})`);
  assert.deepEqual(finds.find(f => f.id === 'beetle')?.from, { name: 'beetle', ...EARLY_TAP_AT }, 'with the tap, so its picture flies from where the child tapped');
  assert.ok(tap.movedAt !== null && tap.movedAt - tap.at < 0.1, `it rolled over at once: it moved ${tap.movedAt === null ? 'never' : `${(tap.movedAt - tap.at).toFixed(2)} s after the tap`}`);
  const mosis = captions.filter(c => c.who === 'Mosi' && c.at >= ride).sort((a, b) => a.at - b.at);
  assert.deepEqual(mosis.slice(0, 3).map(c => c.text), [visit.text, critters.text, beetle.text], 'his two ride lines, and then the beetle');
  const [first, second, remark] = mosis;
  // The ride lines begin when they would with no tap, a second in, as the capture plays them.
  const capture = await unattended();
  const plainRide = capture.world.chapterTimeline.find(m => m.scene === 6).at;
  const plainFirst = capture.captions.find(c => c.text === visit.text && c.at >= plainRide);
  assert.ok(Math.abs((first.at - ride) - (plainFirst.at - plainRide)) < 1e-6, `the visit line ${(first.at - ride).toFixed(3)} s into the ride, as without the tap (${(plainFirst.at - plainRide).toFixed(3)} s)`);
  // The remark comes when both are over, and both are over before the camera shows the beetle.
  const over = second.at + lines[critters.audio].duration;
  assert.ok(second.at >= first.at + lines[visit.audio].duration - 1e-6, 'the second ride line comes after the first');
  assert.ok(remark.at >= over - 1e-6, `the remark waits for both: it begins at ${remark.at.toFixed(2)} s, the ride lines end at ${over.toFixed(2)} s`);
  const rideFeet = seen.cuts.find(cut => cut.shot === 'rideFeet').at;
  assert.ok(over + 0.5 < rideFeet, `the ride lines run until ${(over + 0.5).toFixed(2)} s, caption included; the camera shows the beetle at ${rideFeet.toFixed(2)} s`);
});

test('Egill presses the grass down and the ferns aside as a boy does, not with Mosi\'s footprint', async () => {
  // The forest lays the grass down and leans the ferns round a capsule under each actor (forest.js), the size of the
  // grass's footprint times the actor's footprintScale; the ferns' reach scales with it. Mosi's size unless a chapter
  // says otherwise, the boy's too.
  const { world } = await unattended();
  const { radius, halfLength } = FOREST.grass.footprint;
  const scale = name => world.actors.get(name).footprintScale ?? 1;
  const boy = scale('egill');
  assert.ok(radius * boy <= 0.35, `his footprint reaches ${(radius * boy).toFixed(2)} m out from him, not the ${radius} m round Mosi`);
  assert.ok(2 * (halfLength + radius) * boy <= 1.6, `and is ${(2 * (halfLength + radius) * boy).toFixed(2)} m long`);
  assert.ok(boy > 0, 'but he still stands in the grass');
  assert.equal(scale('mosi'), 1, 'Mosi keeps the footprint the forest is made for');
  assert.equal(scale('kambedla'), 1, 'and so does Kambeðla, who is nearly his size');
});

test('a step sound that breaks stops the steps, never the story', async () => {
  const errors = [];
  const report = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  try {
    const { task, stage, journal } = await playUnattended(kafli1, { seeking: false, limit: 900, brokenSteps: true });
    assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
    assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
    assert.deepEqual(journal.stars, ['k1_kambedla'], 'it went on to the star');
  } finally {
    console.error = report;
  }
  assert.ok(errors.some(e => e.includes('a step sound broke')), 'the broken step is reported');
});

test('Egill holds the posy in both hands: as he walks to her and turns, each hand stays on the stems', async () => {
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const { grip } = (await run()).seen;
    assert.ok(grip.frames > 30, `${how}: he carries the posy into scene 9 (${grip.frames} frames)`);
    assert.ok(grip.walked > 1 && grip.turned > 15, `${how}: walking ${grip.walked.toFixed(1)} m and turning ${grip.turned.toFixed(0)} degrees`);
    assert.ok(grip.worst < 0.03, `${how}: his hands stay within ${(grip.worst * 100).toFixed(1)} cm of the stems`);
    assert.ok(grip.after.every(d => d > 0.1), `${how}: and once the posy is gone they are back at his sides`);
  }
});

test('Mosi walks all the way to Egill, however soon the child taps Egill to wave', async () => {
  const stop = new THREE.Vector3(...chapter.locations.rjodur.layout.actors.mosi.position);
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const { seen } = await run();
    const mosi = seen.atScene[2].mosi.clone().setY(0); // as scene 3 starts
    assert.ok(mosi.distanceTo(stop) < 0.3, `${how}: Mosi stopped ${mosi.distanceTo(stop).toFixed(2)} m short of his place`);
  }
});

test('the float up starts, and the float down lands, where the frill and the flank keep clear of Egill', async () => {
  const { seen } = await unattended();
  const check = (where, point, side) => {
    assert.ok(point, `${where} was seen`);
    const along = point.x;
    const out = point.z * side; // + on the side asked for
    assert.ok(out >= 3, `${where}: ${out.toFixed(2)} m out from Mosi's middle (at least 3)`);
    assert.ok(along <= (side > 0 ? 2.5 : 1.5), `${where}: ${along.toFixed(2)} m along him (riding.js)`);
  };
  check('the float up', seen.floatStart, 1); // beside his right shoulder
  check('the landing', seen.landing, -1); // beside his left
});

test('the plates light one row a flower, head first, all three after the third', async () => {
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const { seen } = await run();
    assert.deepEqual(seen.rows.map(r => [r.row, r.level]), [[0, 1], [1, 1], [2, 1]], `${how}: one row a flower, from the head back`);
    seen.rows.forEach((r, i) => assert.ok(r.at >= seen.trayRemoved[i].at, `${how}: row ${i} lights once flower ${i + 1} is given`));
  }
  const { world } = await unattended();
  const kambedla = world.actors.get('kambedla');
  let levels = null;
  kambedla.model.traverse(o => {
    if (o.isMesh && o.material.onBeforeCompile && o.geometry.attributes._platerow) {
      const shader = { uniforms: {}, vertexShader: 'void main() {', fragmentShader: 'void main() {#include <emissivemap_fragment>' };
      o.material.onBeforeCompile(shader, null);
      levels = shader.uniforms.uRowLevel?.value;
    }
  });
  assert.ok(levels, 'her skin glows (plate-glow.js)');
  assert.deepEqual([...levels.slice(0, 3)], [1, 1, 1]);
});

test('Kambeðla talks with her beak: her jaw opens with her voice in every line of hers, as Mosi\'s beak does in his', async () => {
  const { seen, world } = await unattended();
  const faceOf = actor => {
    let face = null;
    actor.model.traverse(o => { if (!face && o.isSkinnedMesh && o.userData.face) face = o.userData.face; });
    return face;
  };
  const talk = faceOf(world.actors.get('kambedla')).mouth?.talk;
  assert.equal(talk, 8, 'the mouth pass says how far her jaw opens at the loudest');
  const hers = Object.keys(chapter.lines).filter(id => id.startsWith('k1_kambedla_')).sort();
  assert.deepEqual(hers, ['k1_kambedla_accept', 'k1_kambedla_glow', 'k1_kambedla_hello', 'k1_kambedla_lost', 'k1_kambedla_mmm1', 'k1_kambedla_mmm2', 'k1_kambedla_mmm3', 'k1_kambedla_play']);
  // Each line's recorded loudness opens it (lines.json), most of the way at its loudest syllable, and never past talk.
  for (const id of hers) assert.ok(seen.jaws[id] > 4 && seen.jaws[id] <= talk + 0.01, `${id}: her jaw opened ${seen.jaws[id]?.toFixed(1)} degrees at the widest`);
  // Mosi's beak in his lines in the glade, the same way.
  const his = faceOf(world.actors.get('mosi')).mouth.talk;
  for (const id of ['k1_mosi_greet', 'k1_mosi_worry']) assert.ok(seen.jaws[id] > 3 && seen.jaws[id] <= his + 0.01, `${id}: his beak opened ${seen.jaws[id]?.toFixed(1)} degrees`);
});

// ---------------------------------------------------------------------------------------------
// The points that follow the characters, on the real models

test('the sun winks where the child sees it: on the screen, with nobody in front of its face', async () => {
  const { winks } = await unattended();
  assert.equal(winks.length, 2);
  for (const { at, x, y, hidden } of winks) {
    assert.ok(Math.abs(x) < 0.85 && Math.abs(y) < 0.85, `the sun on the screen as it winks at ${at.toFixed(1)} s, not at ${x.toFixed(2)}, ${y.toFixed(2)}`);
    assert.equal(hidden, false, `somebody stands in front of the sun as it winks at ${at.toFixed(1)} s`);
  }
});

// ---------------------------------------------------------------------------------------------
// Scene 2: Egill calls up to Mosi (added after the test play of 17 October)

test('Egill calls up to Mosi as he arrives: a hop, "Hey þú! Ég er hérna niðri!" once he has landed and a wave, Mosi still walking', async () => {
  const hey = chapter.lines.k1_egill_hey;
  const waving = chapter.lines.k1_mosi_waving;
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const { captions, lines, seen, world } = await run();
    const from = world.chapterTimeline.find(m => m.scene === 2).at;
    const to = world.chapterTimeline.find(m => m.scene === 3).at;
    const clips = seen.egillClips.filter(e => e.at >= from && e.at < to);
    assert.deepEqual(clips.map(e => e.clip), ['hop', 'idle', 'waveLeft'], `${how}: Egill hops, breathes again as he calls, and waves, once each`);
    const [hop, idle, wave] = clips;
    const calls = captions.filter(c => c.text === hey.text);
    assert.equal(calls.length, 1, `${how}: he calls once`);
    const [call] = calls;
    assert.equal(call.who, 'Egill');
    const voice = lines[hey.audio].duration;
    const landed = hop.at + world.actors.get('egill').clips.get('hop').duration;
    assert.ok(Math.abs(call.at - landed) < 0.05, `${how}: the line once he has landed: the hop at ${hop.at.toFixed(2)} s, the line at ${call.at.toFixed(2)} s`);
    assert.ok(Math.abs(idle.at - landed) < 0.05, `${how}: idle again, not frozen in the hop's last pose, as he calls`);
    assert.ok(Math.abs(wave.at - (call.at + voice)) < 0.05, `${how}: the wave as his voice ends, at ${wave.at.toFixed(2)} s`);
    // While Mosi walks in: once his head is about 8 m from Egill, or sooner for a child who taps (and a capture, which taps 2 s in).
    assert.equal(hop.mosiWalking, true, `${how}: Mosi is still walking when Egill calls`);
    if (how === 'a child who waits') {
      assert.ok(hop.head > 7.7 && hop.head < 8, `${how}: Mosi's head ${hop.head.toFixed(2)} m from Egill: no tap is needed (R12)`);
      // The child had 4 to 6 s to tap Egill and make the call before he made it by himself.
      const window = hop.at - seen.egillTarget.at;
      assert.ok(window >= 4 && window <= 6, `${how}: the tap window is ${window.toFixed(2)} s`);
    } else assert.ok(hop.head >= 8 - 1e-6, `${how}: a tap brings the call sooner: Mosi's head ${hop.head.toFixed(2)} m away`);
    // Mosi stops at his place, looks down at Egill's head from the moment he hears him, and answers once Egill's voice has ended.
    const answer = captions.find(c => c.text === waving.text && c.at > from);
    assert.ok(answer.at >= call.at + voice - 1e-6, `${how}: Mosi's line at ${answer.at.toFixed(2)} s, Egill's voice ends at ${(call.at + voice).toFixed(2)} s`);
    assert.ok(seen.mosiStopped !== null && answer.at >= seen.mosiStopped - 1e-6, `${how}: and only once he has stopped`);
    const looks = seen.mosiLooks.filter(l => l.at >= from && l.at <= answer.at);
    assert.deepEqual(looks.map(l => l.spec), ['egill.head'], `${how}: he looks down at Egill's head`);
    assert.ok(Math.abs(looks[0].at - call.at) < 0.05, `${how}: as Egill's voice reaches him`);
    // The child sees it all: the hop and the wave in the shot that frames Egill, with no cut until Mosi has answered, and Egill, head
    // and feet, on the screen all through the hop. The handheld is off when Egill can be tapped.
    assert.equal(hop.shot, 'egillWaves', `${how}: the hop in the egillWaves shot`);
    assert.equal(wave.shot, 'egillWaves');
    assert.ok(!seen.cuts.some(c => c.at > hop.at && c.at < answer.at), `${how}: no cut between the hop and Mosi's answer`);
    assert.ok(seen.egillOnScreen.length > 25, `${how}: ${seen.egillOnScreen.length} frames of the hop seen`);
    for (const e of seen.egillOnScreen) assert.ok([...e.feet, ...e.top].every(v => Math.abs(v) < 0.95), `${how}: Egill off the screen at ${e.at.toFixed(2)} s`);
    assert.ok(seen.egillTarget && seen.egillTarget.handheld === 0 && seen.egillTarget.shot === 'egillWaves', `${how}: the handheld is off as the tap window opens`);
    const cutAt = shot => seen.cuts.find(c => c.shot === shot && c.at >= from).at;
    assert.ok(cutAt('egillWaves') - cutAt('track') >= 2.5, `${how}: the track shot holds ${(cutAt('egillWaves') - cutAt('track')).toFixed(2)} s`);
  }
});

test('a child who taps Egill before Mosi is near makes him call at once, and only once', async () => {
  const hey = chapter.lines.k1_egill_hey;
  const { captions, lines, seen, world } = await playUnattended(kafli1, { seeking: false, limit: 75, earlyTap: { name: 'egill', after: 0.3 } });
  const tap = seen.earlyTap;
  assert.ok(tap, 'Egill was tapped');
  const from = world.chapterTimeline.find(m => m.scene === 2).at;
  const to = world.chapterTimeline.find(m => m.scene === 3).at;
  const clips = seen.egillClips.filter(e => e.at >= from && e.at < to);
  assert.deepEqual(clips.map(e => e.clip), ['hop', 'idle', 'waveLeft'], 'one hop, one wave');
  assert.ok(clips[0].at - tap.at < 0.05, `the hop ${(clips[0].at - tap.at).toFixed(3)} s after the tap`);
  assert.ok(clips[0].head > 9, `while Mosi's head is still ${clips[0].head.toFixed(1)} m away`);
  assert.equal(captions.filter(c => c.text === hey.text).length, 1, 'one call');
  // Mosi walks all the way to his place all the same, and answers once Egill's line is over.
  const stop = new THREE.Vector3(...chapter.locations.rjodur.layout.actors.mosi.position);
  assert.ok(seen.atScene[2].mosi.clone().setY(0).distanceTo(stop) < 0.3, 'Mosi stopped at his place');
  const call = captions.find(c => c.text === hey.text);
  const answer = captions.find(c => c.text === chapter.lines.k1_mosi_waving.text);
  assert.ok(answer.at >= seen.mosiStopped - 1e-6 && answer.at >= call.at + lines[hey.audio].duration - 1e-6, 'and answers after Egill');
});

// ---------------------------------------------------------------------------------------------
// The sun's beats (added after the test play of 17 October): scene 1, scene 4, scene 10, and in between

/** Where the sun is in every view taken while a gesture of the script's went on: on the screen, its hands too, and nobody in front. */
function assertInView(views, why) {
  assert.ok(views.length >= 5, `${why}: ${views.length} views`);
  for (const v of views) {
    assert.ok(Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85, `${why}: the sun at ${v.x.toFixed(2)}, ${v.y.toFixed(2)} at ${v.at.toFixed(1)} s`);
    assert.ok(v.hands.every(([x, y]) => Math.abs(x) < 0.97 && Math.abs(y) < 0.97), `${why}: its hands off the screen at ${v.at.toFixed(1)} s`);
    assert.equal(v.hidden, false, `${why}: somebody in front of the sun or its hands at ${v.at.toFixed(1)} s`);
  }
}

test('the sun waves hello with a grin as the dawn shot fades in, the first time the child sees it', async () => {
  const { sunCalls, seen } = await unattended();
  const wave = sunCalls.find(c => c.call === 'wave');
  assert.ok(wave && wave.scene === 1 && wave.shot === 'dawn', `the wave in scene 1, in the dawn shot (${wave?.scene}, ${wave?.shot})`);
  assert.ok(wave.at > 0.8 && wave.at < 2.5, `as the screen fades in (2.5 s), at ${wave.at.toFixed(2)} s`);
  const grin = sunCalls.find(c => c.call === 'mouth' && c.scene === 1);
  assert.deepEqual([grin?.args[0], Boolean(grin && Math.abs(grin.at - wave.at) < 1e-9)], ['grin', true], 'with a grin');
  assertInView(seen.sunViews.filter(v => v.at >= wave.at && v.at <= wave.at + WAVE_SECONDS), 'the dawn wave');
  const swinging = seen.sunFrames.filter(f => f.at > wave.at + 0.5 && f.at < wave.at + WAVE_SECONDS - 0.4);
  assert.ok(swinging.every(f => f.mouth === 'grin'), 'grinning while it waves');
});

test('on "Frábært! Sólin bíður ekki eftir okkur." the camera looks up at the sun: it winks, says "o" and smiles again before the camera comes down', async () => {
  const { sunCalls, seen, captions, lines } = await unattended();
  const great = captions.find(c => c.text === chapter.lines.k1_mosi_great.text);
  const wink = sunCalls.find(c => c.call === 'wink');
  const oh = sunCalls.find(c => c.call === 'mouth' && c.args[0] === 'oh');
  assert.ok(wink.scene === 4 && oh?.scene === 4 && wink.shot === 'sunLow' && oh.shot === 'sunLow', 'both in scene 4, low under Mosi\'s head');
  assert.ok(wink.at > great.at && wink.at < great.at + lines.k1_mosi_great.duration, 'the wink while Mosi says it');
  assert.ok(Math.abs(oh.at - (wink.at + WINK_SECONDS)) < 0.05, `the "o" as its eyes open, ${(oh.at - wink.at).toFixed(2)} s after the wink`);
  const frames = seen.sunFrames.filter(f => f.at >= wink.at && f.at < wink.at + 3);
  const mouths = frames.map(f => f.mouth).filter((m, i, all) => i === 0 || m !== all[i - 1]);
  assert.deepEqual(mouths, ['smile', 'mid', 'oh', 'mid', 'smile'], 'a smile, the "o" and the smile again, softly');
  const back = frames.find(f => f.at > oh.at + 0.2 && f.mouth === 'smile').at;
  const views = seen.sunViews.filter(v => v.at >= oh.at && v.at <= back);
  assertInView(views, 'the "o"');
  assert.ok(views.every(v => Math.abs(v.y - 0.4) < 0.02 && Math.abs(v.x) < 0.02), 'the camera still looks up at it, as the look put it, until the smile is back');
});

test('when the star rises the sun hugs itself with a big grin and winks, where the child sees it, with nobody in front', async () => {
  for (const [how, run] of [['a capture', unattended], ['an eager child', playedByAnEagerChild]]) {
    const { sunCalls, seen } = await run();
    const hug = sunCalls.find(c => c.call === 'hug');
    const wink = sunCalls.filter(c => c.call === 'wink').at(-1);
    assert.ok(hug && hug.scene === 10 && hug.shot === 'star', `${how}: the hug in scene 10, in the star's shot`);
    assert.ok(wink.scene === 10 && wink.at > hug.at + 0.5 && wink.at < hug.at + HUG_SECONDS - 0.5, `${how}: it winks while it hugs`);
    assertInView(seen.sunViews.filter(v => v.at >= hug.at && v.at <= hug.at + HUG_SECONDS), `${how}: the hug`);
    const held = seen.sunFrames.filter(f => f.at > hug.at + 0.5 && f.at < hug.at + HUG_SECONDS - 0.6);
    assert.ok(held.every(f => f.mouth === 'grin'), `${how}: with a big grin`);
    assert.ok(held.some(f => f.squash > 1.03), `${how}: and a squeeze`);
  }
});

test('in between the sun smiles calmly, its hands at rest, and blinks by itself every 3 to 6 s', async () => {
  const { seen, sunCalls } = await unattended();
  const length = c => (c.call === 'hug' ? HUG_SECONDS : c.call === 'wave' ? WAVE_SECONDS : (c.args[1] ?? 1.5) + MOUTH_BETWEEN);
  const beats = sunCalls.filter(c => c.call !== 'wink').map(c => [c.at, c.at + length(c) + 0.1]);
  const calm = seen.sunFrames.filter(f => !beats.some(([a, b]) => f.at >= a && f.at <= b));
  assert.ok(calm.length > 0.9 * seen.sunFrames.length);
  assert.ok(calm.every(f => f.mouth === 'smile' && f.squash === 1), 'a calm smile, no squeeze, between the beats');
  for (const f of calm) {
    const rest = handsAtRest(f.t);
    const off = Math.max(...f.hands.map(([x, y, angle], k) => Math.max(Math.abs(x - rest[k].x), Math.abs(y - rest[k].y), Math.abs(angle - rest[k].angle) / 100)));
    assert.ok(off < 1e-9, `the hands away from their rest at ${f.at.toFixed(2)} s`);
  }
  const winks = sunCalls.filter(c => c.call === 'wink').map(c => c.at);
  const frames = seen.sunFrames;
  const blinks = frames.filter((f, i) => i > 0 && f.eyes !== 'open' && frames[i - 1].eyes === 'open' && !winks.some(w => f.at >= w - 0.05 && f.at < w + WINK_SECONDS));
  const minutes = (frames.at(-1).at - frames[0].at) / 60;
  assert.ok(blinks.length >= minutes * 10 * 0.85 && blinks.length <= minutes * 20 * 1.1, `${blinks.length} blinks in ${minutes.toFixed(1)} minutes`);
});

test('yield flower.hold() and flower.pick() through the scheduler: the scene waits for each, the flower stays in Egill\'s hands and then goes', async () => {
  const world = await chapterWorld(chapter);
  const egill = world.actors.get('egill');
  egill.place(0, 0, 0);
  const flower = createGlowFlower(world, { name: 'stone', position: [2, 0, 1.5] });
  const stage = createScene({ world, director: { stop() {}, handheld() {} }, ui: { reset() {} }, voice: { stop() {} } });
  const done = { held: null, given: null };
  const mouth = [1.6, 1.0, -0.5];
  stage.start(function* script() {
    yield flower.hold(POINTS.egillHands, { size: 0.55, turn: () => egill.root.quaternion });
    done.held = stage.s.time;
    yield 1;
    yield flower.pick(mouth);
    done.given = stage.s.time;
  });
  const hands = world.resolvePoint(POINTS.egillHands, new THREE.Vector3());
  const frames = seconds => {
    for (let i = 0; i < Math.round(seconds * 30); i++) {
      world.clock.step(1 / 30);
      stage.update(1 / 30);
      updateActors(world.actors.values(), 1 / 30);
      world.effects.update(1 / 30);
    }
  };
  frames(1.2);
  assert.ok(done.held !== null && Math.abs(done.held - 0.6) < 0.1, `the scene went on at ${done.held} s, as the flower reached his hands`);
  assert.equal(flower.group.visible, true, 'he holds it');
  assert.ok(flower.group.position.distanceTo(hands) < 1e-6, 'the foot of its stem in his hands');
  frames(1.2);
  assert.ok(done.given !== null && Math.abs(done.given - done.held - 1.6) < 0.15, `and went on ${(done.given - done.held).toFixed(2)} s later, a second and the 0.6 s it takes to give`);
  assert.equal(flower.group.visible, false, 'given: gone from his hands');
  // His hands: in front of his chest, between the two hands of the real model, at his hands' height.
  const left = egill.model.getObjectByName('LeftHand').getWorldPosition(new THREE.Vector3());
  const right = egill.model.getObjectByName('RightHand').getWorldPosition(new THREE.Vector3());
  const chest = egill.model.getObjectByName('Chest').getWorldPosition(new THREE.Vector3());
  assert.ok(hands.x > chest.x + 0.1, 'in front of him, not in him');
  assert.ok(hands.distanceTo(left) < 0.4 && hands.distanceTo(right) < 0.4, 'within his reach');
  assert.ok(hands.y > Math.min(left.y, right.y) && hands.y < chest.y, 'at the height he holds things');
});

test('the points on the characters sit where they are named: Mosi\'s nose, sneeze and horn, Kambeðla\'s mouth and plates', async () => {
  const world = await chapterWorld(chapter);
  const mosi = world.actors.get('mosi');
  const kambedla = world.actors.get('kambedla');
  mosi.place(0, 0, 0);
  kambedla.place(0, 0, 0);
  for (let i = 0; i < 5; i++) updateActors(world.actors.values(), 1 / 30);
  const at = (actor, [bone, point]) => onBone(actor, bone, point)(new THREE.Vector3());
  const skin = actor => {
    let mesh = null;
    actor.model.traverse(o => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
    return mesh;
  };
  const nearestSkin = (actor, point) => {
    const mesh = skin(actor);
    const v = new THREE.Vector3();
    let best = Infinity;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) best = Math.min(best, mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).distanceTo(point));
    return best;
  };
  // Where a point is on a face, measured from the eyes the face pass found (in the skin's bind space, carried by the Head
  // bone): how far it is across from the midline between them, how far ahead of them, and how far ahead the front of the
  // face is along that midline. (The idle pose turns Mosi's head to his left, so the world's axes say nothing here.)
  const onFace = (actor, point) => {
    const mesh = skin(actor);
    const head = actor.model.getObjectByName('Head');
    const toWorld = head.matrixWorld.clone().multiply(mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(head)]).multiply(mesh.bindMatrix);
    const eyes = mesh.userData.face.eyes.map(eye => ({
      centre: new THREE.Vector3().fromArray(eye.centre).applyMatrix4(toWorld),
      normal: new THREE.Vector3().fromArray(eye.normal).transformDirection(toWorld),
    }));
    const middle = eyes[0].centre.clone().lerp(eyes[1].centre, 0.5);
    const across = eyes[1].centre.clone().sub(eyes[0].centre).normalize();
    const ahead = eyes[0].normal.clone().add(eyes[1].normal);
    ahead.addScaledVector(across, -ahead.dot(across)).normalize();
    const v = new THREE.Vector3();
    let front = -Infinity;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).sub(middle);
      if (Math.abs(v.dot(across)) < 0.08) front = Math.max(front, v.dot(ahead));
    }
    const d = point.clone().sub(middle);
    return { across: d.dot(across), ahead: d.dot(ahead), front };
  };
  // The nose the child taps: a 0.45 m sphere round the middle of his snout, which takes in its front.
  const nose = onFace(mosi, at(mosi, POINTS.mosiNose));
  assert.ok(Math.abs(nose.across) < 0.1, `the nose on the middle of his face, not ${nose.across.toFixed(2)} m to one side`);
  assert.ok(nose.ahead > 0.25 && nose.front - nose.ahead < 0.4, `in his snout, ${nose.ahead.toFixed(2)} m ahead of his eyes (its front: ${nose.front.toFixed(2)} m)`);
  // Where the pollen comes out: just in front of it.
  const sneeze = at(mosi, POINTS.mosiSneeze);
  const out = onFace(mosi, sneeze);
  assert.ok(Math.abs(out.across) < 0.1, `the sneeze from the middle of his face, not ${out.across.toFixed(2)} m to one side`);
  assert.ok(out.ahead > out.front - 0.1 && nearestSkin(mosi, sneeze) < 0.2, `and from the front of his snout (${out.front.toFixed(2)} m ahead of his eyes), not ${out.ahead.toFixed(2)} m`);
  const horn = at(mosi, POINTS.mosiHorn);
  assert.ok(horn.y > 3.6 && nearestSkin(mosi, horn) < 0.08, 'at the tip of his horn');
  const mouth = at(kambedla, POINTS.kambedlaMouth);
  const onMuzzle = onFace(kambedla, mouth);
  assert.ok(Math.abs(onMuzzle.across) < 0.06 && onMuzzle.ahead > onMuzzle.front - 0.15, `her mouth on the middle of her face, at its front: ${JSON.stringify(onMuzzle)}`);
  assert.ok(mouth.y > 1.5 && mouth.y < 2.1 && nearestSkin(kambedla, mouth) < 0.15, `and at the height of her snout, ${mouth.toArray().map(n => n.toFixed(2))}`);
  const plates = world.resolvePoint(POINTS.kambedlaPlates, new THREE.Vector3());
  assert.ok(plates.y > 3.7 && plates.y < 4.1, `the star rises from just above her tallest plates, at ${plates.y.toFixed(2)} m`);
});
