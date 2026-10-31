import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStoryStep } from '../engine/memory/playful-flow.js';

const all = ['triceratops', 'brontosaurus', 'stegosaurus'];
const ready = Object.fromEntries(all.map(name => [name, true]));
const state = extra => ({ unlocked: [], selected: null, active: null, branch: 'down', bridgeBuilt: false, atStaging: false, boardwalkBuilt: false, visited: false, ...extra });
const memory = { phase: 'ready' };

test('finding a helper offers one direct job only when its physical pair is ready', () => {
  const bridge = state({ unlocked: ['brontosaurus'] });
  assert.equal(nextStoryStep(memory, bridge).available, false);
  const next = nextStoryStep(memory, bridge, ready);
  assert.equal(next.action, 'lift'); assert.equal(next.target, 'branch');
  assert.equal(next.available, true); assert.equal(next.automatic, undefined);
  assert.equal(bridge.selected, null, 'showing the next job does not select a pair or lock memory play');
});
test('guidance never reveals which covered leaf contains a missing helper', () => {
  const next = nextStoryStep(memory, state({ unlocked: ['stegosaurus'] }), ready);
  assert.equal(next.kind, 'search'); assert.equal(next.action, undefined);
  assert.equal(next.target, undefined);
});
test('each child action respects the previous construction step', () => {
  assert.equal(nextStoryStep(memory, state({ unlocked: all }), ready).action, 'lift');
  assert.equal(nextStoryStep(memory, state({ unlocked: all, branch: 'held' }), ready).action, 'roll');
  assert.equal(nextStoryStep(memory, state({ unlocked: all, bridgeBuilt: true, atStaging: true }), ready).action, 'lay');
  assert.equal(nextStoryStep(memory, state({ unlocked: ['brontosaurus'], branch: 'held' }), ready).kind, 'search');
});
test('a finished bridge leads onward automatically after all friends have physically arrived', () => {
  const bridge = state({ unlocked: all, bridgeBuilt: true });
  assert.equal(nextStoryStep(memory, bridge, { ...ready, stegosaurus: false }).automatic, undefined);
  assert.equal(nextStoryStep(memory, bridge, { ...ready, stegosaurus: false }).kind, 'arriving');
  assert.equal(nextStoryStep(memory, state({ unlocked: ['triceratops', 'brontosaurus'], bridgeBuilt: true }), ready).automatic, undefined);
  const next = nextStoryStep(memory, bridge, ready);
  assert.equal(next.action, 'cross'); assert.equal(next.automatic, true);
});
test('the finished walkway leads to the grove without an extra selection step', () => {
  const next = nextStoryStep(memory, state({ unlocked: all, bridgeBuilt: true, atStaging: true, boardwalkBuilt: true }), ready);
  assert.equal(next.action, 'finish'); assert.equal(next.automatic, true);
});
test('Mosi names the obstacle, never the friend who can do it, and there is no button to press', () => {
  const names = /þórseðl|þríhyrn|kambeðl/i;
  for (const bridge of [state({ unlocked: all }), state({ unlocked: all, branch: 'held' }), state({ unlocked: all, bridgeBuilt: true, atStaging: true }), state({ unlocked: all, branch: 'held', asking: 'log' }), state({ unlocked: all, failing: 'stegosaurus' })]) {
    const next = nextStoryStep(memory, bridge, ready);
    assert.doesNotMatch(next.prompt, names, next.key);
    assert.equal(next.label, undefined, 'the gold "Áfram" button is gone');
  }
  assert.equal(nextStoryStep(memory, state({ unlocked: all, asking: 'branch' }), ready).prompt, 'Hver getur þetta?');
  assert.equal(nextStoryStep(memory, state({ unlocked: all, failing: 'triceratops' }), ready).kind, 'action', 'a wrong friend is having a go');
});
test('an active action or final arrival cannot enqueue another action', () => {
  for (const active of ['lift', 'roll', 'cross', 'lay', 'finish']) {
    const next = nextStoryStep(memory, state({ unlocked: all, active, boardwalkBuilt: true }), ready);
    assert.equal(next.kind, 'action'); assert.equal(next.automatic, undefined); assert.equal(next.action, undefined);
  }
  assert.equal(nextStoryStep(memory, state({ visited: true, boardwalkBuilt: true }), ready).kind, 'celebrate');
});

// A level that is not level 1: every key and prompt below is the level's own, and the story hands them back as written.
const FAKE = {
  friends: ['x', 'y'],
  steps: [
    { id: 'a', kind: 'task', target: 'rock', species: 'x' },
    { id: 'b', kind: 'together', target: 'rope' },
    { id: 'c', kind: 'travel', target: 'far', needsAllFound: true, waitsForGifts: true, automatic: true },
    { id: 'd', kind: 'travel', target: 'home', automatic: true },
  ],
  story: {
    common: { trying: 'k-trying', home: 'k-home', who: 'k-who-', prompts: { trying: 'P trying', home: 'P home', who: 'P who', arriving: 'P arriving', seek: 'P seek' } },
    a: { doing: 'k-doing-a', ready: 'k-a-ready', arriving: 'k-a-arriving', find: 'k-a-find', seeks: true, prompts: { doing: 'P doing a', ready: 'P ready a', find: 'P find a' } },
    b: { doing: 'k-doing-b', ready: 'k-b-ready', prompts: { doing: 'P doing b', ready: 'P ready b' } },
    c: { doing: 'k-doing-c', open: 'k-c-open', gather: 'k-c-gather', arriving: 'k-c-arriving', gifts: 'k-c-gifts', landing: 'k-c-landing',
      prompts: { doing: 'P doing c', open: 'P open c', gather: 'P gather c', arriving: 'P arriving c', gifts: 'P gifts c', landing: 'P landing c' } },
    d: { doing: 'k-doing-d', open: 'k-d-open', prompts: { doing: 'P doing d', open: 'P open d' } },
  },
};
const at = (done, extra) => ({ unlocked: [], selected: null, active: null, asking: null, failing: null, done, ...extra });
const fakeStory = (bridge, ready = {}, mem = memory) => nextStoryStep(mem, bridge, ready, FAKE);

test('the story is read from the level', () => {
  const both = { x: true, y: true };
  const say = (next, key, prompt) => { assert.equal(next.key, key); assert.equal(next.prompt, prompt, key); return next; };
  say(fakeStory(at([], { active: 'a' })), 'k-doing-a', 'P doing a');
  say(fakeStory(at([], { failing: 'y' })), 'k-trying', 'P trying');
  say(fakeStory(at(['a', 'b', 'c', 'd'])), 'k-home', 'P home');
  assert.equal(fakeStory(at(['a', 'b', 'c', 'd'])).kind, 'celebrate');
  const who = say(fakeStory(at([], { asking: 'rock', unlocked: ['x'] })), 'k-who-rock', 'P who');
  assert.equal(who.kind, 'choose'); assert.equal(who.target, 'rock');
  // The first step: the search, then the pair arriving, then the job.
  say(fakeStory(at([])), 'k-a-find', 'P find a');
  const arriving = say(fakeStory(at([], { unlocked: ['x'] }), { x: false }), 'k-a-arriving', 'P arriving');
  assert.equal(arriving.available, false); assert.equal(arriving.kind, 'arriving');
  const work = say(fakeStory(at([], { unlocked: ['x'] }), { x: true }), 'k-a-ready', 'P ready a');
  assert.deepEqual([work.kind, work.action, work.target, work.species, work.available], ['work', 'a', 'rock', 'x', true]);
  // With one leaf open the search names the other half, as the child needs it.
  say(fakeStory(at([]), {}, { phase: 'one-open', seek: 'Hvar er hin?' }), 'k-a-find', 'Hvar er hin?');
  say(fakeStory(at([]), {}, { phase: 'one-open' }), 'k-a-find', 'P seek');
  // A together step is always ready.
  const rope = say(fakeStory(at(['a'], { unlocked: ['x'] })), 'k-b-ready', 'P ready b');
  assert.deepEqual([rope.kind, rope.action, rope.target, rope.available], ['work', 'b', 'rope', true]);
  // The travel step waits for the friends, then for the gifts, then goes by itself.
  say(fakeStory(at(['a', 'b'], { unlocked: ['x'] }), both), 'k-c-gather', 'P gather c');
  say(fakeStory(at(['a', 'b'], { unlocked: ['x', 'y'] }), { x: true, y: false }), 'k-c-arriving', 'P arriving c');
  say(fakeStory(at(['a', 'b'], { unlocked: ['x', 'y'] }), both, { phase: 'ready', giftsLeft: 2 }), 'k-c-gifts', 'P gifts c');
  say(fakeStory(at(['a', 'b'], { unlocked: ['x', 'y'] }), both, { phase: 'ready', giftsLanding: 1 }), 'k-c-landing', 'P landing c');
  const open = say(fakeStory(at(['a', 'b'], { unlocked: ['x', 'y'] }), both), 'k-c-open', 'P open c');
  assert.deepEqual([open.kind, open.action, open.target, open.automatic, open.available], ['travel', 'c', 'far', true, true]);
  // A travel step without needsAllFound opens at once.
  const home = say(fakeStory(at(['a', 'b', 'c'])), 'k-d-open', 'P open d');
  assert.deepEqual([home.kind, home.action, home.target, home.automatic, home.available], ['travel', 'd', 'home', true, true]);
  say(fakeStory(at(['a', 'b', 'c'], { active: 'd' })), 'k-doing-d', 'P doing d');
});

test('level 1 tells its story with the same keys and words', () => {
  const key = (bridge, ready = {}, mem = memory) => { const next = nextStoryStep(mem, bridge, ready); return [next.key, next.prompt]; };
  assert.deepEqual(key(state({ unlocked: [] })), ['find-friends', 'Kíktu undir lauf. Finndu tvo eins vini!']);
  assert.deepEqual(key(state({ unlocked: [] }), {}, { phase: 'one-open' }), ['find-friends', 'Hvar er vinur hans?']);
  assert.deepEqual(key(state({ unlocked: ['brontosaurus'] })), ['lift-arriving', 'Vinirnir eru á leiðinni! Þú mátt skoða fleiri lauf.']);
  assert.deepEqual(key(state({ unlocked: all }), ready), ['lift-ready', 'Greinin er fyrir. Hver nær upp að henni?']);
  assert.deepEqual(key(state({ unlocked: all, branch: 'held' }), ready), ['roll-ready', 'Stóri bolurinn getur orðið að brú. Hver getur ýtt honum?']);
  assert.deepEqual(key(state({ unlocked: ['brontosaurus'], branch: 'held' })), ['find-pushers', 'Hver getur ýtt bolnum? Finnum fleiri vini!']);
  assert.deepEqual(key(state({ unlocked: ['triceratops', 'brontosaurus'], bridgeBuilt: true }), ready), ['gather-friends', 'Brúin er tilbúin! Finnum vinina sem vantar.']);
  assert.deepEqual(key(state({ unlocked: all, bridgeBuilt: true }), { ...ready, stegosaurus: false }), ['friends-arriving', 'Brúin er tilbúin! Vinirnir eru að koma.']);
  assert.deepEqual(key(state({ unlocked: all, bridgeBuilt: true }), ready, { phase: 'ready', giftsLeft: 1 }), ['gifts-left', 'Finnum fyrst gjafirnar sem eru eftir!']);
  assert.deepEqual(key(state({ unlocked: all, bridgeBuilt: true }), ready, { phase: 'ready', giftsLanding: 1 }), ['gifts-landing', 'Gjafirnar fara í körfuna!']);
  assert.deepEqual(key(state({ unlocked: all, bridgeBuilt: true }), ready), ['bridge-open', 'Brúin er tilbúin. Allir með!']);
  assert.deepEqual(key(state({ unlocked: all, bridgeBuilt: true, atStaging: true }), ready), ['lay-ready', 'Mýrin er mjúk. Hver getur byggt leið yfir?']);
  assert.deepEqual(key(state({ unlocked: all, bridgeBuilt: true, atStaging: true })), ['lay-arriving', 'Vinirnir eru á leiðinni! Þú mátt skoða fleiri lauf.']);
  assert.deepEqual(key(state({ unlocked: all, bridgeBuilt: true, atStaging: true, boardwalkBuilt: true }), ready), ['walkway-open', 'Leiðin er opin. Förum saman!']);
  assert.deepEqual(key(state({ unlocked: all, active: 'lift' }), ready), ['doing-lift', 'Upp með greinina!']);
  assert.deepEqual(key(state({ unlocked: all, active: 'roll' }), ready), ['doing-roll', 'Þríhyrnurnar koma að bolnum!']);
  assert.deepEqual(key(state({ unlocked: all, active: 'cross' }), ready), ['doing-cross', 'Allir með yfir brúna!']);
  assert.deepEqual(key(state({ unlocked: all, active: 'lay' }), ready), ['doing-lay', 'Þær bera börkinn saman. Ein fjöl í einu!']);
  assert.deepEqual(key(state({ unlocked: all, active: 'finish' }), ready), ['doing-finish', 'Nú komast allir yfir. Berin bíða okkar!']);
  assert.deepEqual(key(state({ unlocked: all, failing: 'triceratops' }), ready), ['trying', 'Sjáum hvað gerist!']);
  assert.deepEqual(key(state({ unlocked: all, asking: 'log' }), ready), ['who-log', 'Hver getur þetta?']);
  assert.deepEqual(key(state({ visited: true, boardwalkBuilt: true }), ready), ['home', 'Öll komumst við! Vel gert!']);
});
