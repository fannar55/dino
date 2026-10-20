import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { FakeDocument, FakeElement } from './fake-dom.mjs';
import { CATEGORIES, createGame, roll, hold, score, previews, totals, decideAI, validateGame } from '../engine/yatzy-mosi/rules.js';

// Run the unchanged controller and real rules. Only the browser and presentation boundaries
// are replaced: no WebGL, audio devices, wall-clock timers, or source-text assertions.
const GAME = new URL('../engine/yatzy-mosi/game.js', import.meta.url).href;
const HTML = await readFile(new URL('../yatzy-mosi.html', import.meta.url), 'utf8');
const SAVE = 'mosi.yatzy.table.save.v1';
let fixtureId = 0;

class Element extends FakeElement {
  constructor(document, tag, id) { super(document, tag, id); this.dataset = {}; this.open = false; this.disabled = false; }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.dispatchEvent(new Event('close')); } }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.tagName === selector.toUpperCase()) return node; return null; }
  focus() { this.ownerDocument.activeElement = this; }
  removeAttribute(name) { this.attributes.delete(name); }
  scrollIntoView() {}
}
class Document extends FakeDocument {
  constructor(fonts) {
    super(); this.body = new Element(this, 'body'); this.activeElement = this.body; this.hidden = false; this.fonts = { ready: fonts };
    // IDs come from the actual page, so missing controller/HTML connections fail naturally.
    for (const match of HTML.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) this.body.append(this.add(match[2], match[1]));
    const turn = this.createElement('div'); turn.className = 'turn'; this.body.append(turn);
    for (const match of HTML.matchAll(/<dialog\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/dialog>/g)) {
      for (const close of match[2].matchAll(/<button\b[^>]*\bdata-close\b[^>]*>/g)) {
        const button = this.createElement('button'); button.setAttribute('data-close', ''); this.getElementById(match[1]).append(button);
      }
    }
    this.getElementById('table').clientWidth = 1000; this.getElementById('table').clientHeight = 700;
  }
  add(id, tag = 'div') { const element = new Element(this, tag, id); this.byId.set(id, element); return element; }
  createElement(tag) { return new Element(this, tag); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    return this.body.findAll(node => selector === 'dialog' ? node.tagName === 'DIALOG'
      : selector === 'dialog[open]' ? node.tagName === 'DIALOG' && node.open
      : selector === '[data-close]' ? node.attributes.has('data-close')
      : selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : false);
  }
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settleMicrotasks = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

async function fixture(run, { storage = new Map(), gates = {} } = {}) {
  const key = `__yatzyControllerFixture${++fixtureId}`, globals = new Map(), events = new EventTarget(), frames = new Map();
  let now = 0, frameId = 0, seed = 417, hook;
  const document = new Document(gates.fonts?.promise ?? Promise.resolve());
  const stats = { world: 0, opponent: 0, dice: 0, effects: 0, audio: 0, renders: 0, observers: [], errors: [], views: [], focus: [] };
  const view = { mode: 'table', blend: 0, transitioning: false };let viewRemaining=0;
  const world = { table: { y: 1.4, farZ: -1.5 }, scene: { updateMatrixWorld() {} }, camera: {},
    update(dt) { if(viewRemaining>0){viewRemaining=Math.max(0,viewRemaining-dt);if(!viewRemaining){view.transitioning=false;view.blend=view.mode==='dice'?1:0;}} }, resize() {},
    setDiceFocus(points,{snap=false}={}){stats.focus.push({points:structuredClone(points),snap});},
    setView(mode, { reduced = false } = {}) {
      assert.ok(mode === 'table' || mode === 'dice');
      stats.views.push({ mode, reduced, time: now });
      view.mode = mode; view.transitioning = !reduced && view.blend !== (mode === 'dice' ? 1 : 0);
      viewRemaining=view.transitioning?1.16:0;
      if (reduced) view.blend = mode === 'dice' ? 1 : 0;
    },
    getViewState() { return { ...view }; },
    isViewTransitioning() { return view.transitioning; },
    render() { stats.renders++; }, getStats() { return {}; }, dispose() { stats.world++; }, renderer: { async compileAsync() { await gates.compile?.promise; } } };
  const opponent = { update() {}, react() {}, reset() {}, getDebugState() { return {}; }, dispose() { stats.opponent++; } };
  const effects = { emit() {}, update() {}, clear() {}, getStats() { return {}; }, dispose() { stats.effects++; } };
  const audio = { paused: false, mute() {}, pause(value) { this.paused = value; }, unlock() {}, cue() {}, cancel() {}, getStats() { return {}; }, dispose() { stats.audio++; } };
  const dice = {
    dice: Array.from({ length: 5 }, () => ({ position: { x: 0, y: 1.5, z: 0 }, visible: false })),
    values: [0, 0, 0, 0, 0], held: [false, false, false, false, false], starts: [], motionChanges: [], rolling: false, elapsed: 0, normalDuration: .2, duration: .2, reduced: false,
    sync(values, held, player) { this.values = [...values]; this.held = [...held]; this.player = player; this.rolling = false; this.dice.forEach((die, i) => { die.visible = values[i] > 0; }); },
    setHeld(held) { this.held = [...held]; },
    startRoll(values, held, player, reduced) { this.values = [...values]; this.held = [...held]; this.player = player; this.reduced = reduced; this.rolling = true; this.elapsed = 0; this.duration = reduced ? .2 : this.normalDuration; this.starts.push({ values: [...values], held: [...held], player, reduced }); },
    setReducedMotion(value) { this.reduced = Boolean(value); this.motionChanges.push({ reduced: this.reduced, rolling: this.rolling }); if (this.reduced && this.rolling) { this.elapsed = 0; this.duration = .2; } },
    ready: false,
    setReady(value) { this.ready = value; },
    screenCupPosition() { return { x: .1, y: .45, radius: .05, width: .1, height: .15, left:.05,right:.15,top:.375,bottom:.525,visible: true }; },
    getFocusTarget() { return { x: 0, y: 2, z: 0 }; },
    getFramingPoints() { return this.dice.map((die,i)=>({x:(i-2)*.6,y:1.5357,z:this.held[i]?1.43:.2})); },
    update(dt) { if (!this.rolling) return false; this.elapsed += dt; if (this.elapsed < this.duration) return false; this.sync(this.values, this.held, this.player); return true; },
    screenPositions() { return this.values.map((value, index) => ({ index, value, visible: value > 0, x: .25 + index * .1, y: .5, left: .22+index*.1,right:.28+index*.1,top:.45,bottom:.55 })); },
    getDebugState() { return { values: [...this.values], held: [...this.held], rolling: this.rolling, elapsed: this.elapsed }; },
    dispose() { this.rolling = false; stats.dice++; },
  };
  const modules = {
    './world.js': { async createYatzyWorld() { await gates.world?.promise; return world; } },
    './opponent.js': { async createMosiOpponent() { await gates.opponent?.promise; return opponent; } },
    './dice.js': { async createDiceAndCup() { await gates.dice?.promise; return dice; }, DINO_FACES: Array.from({ length: 6 }, () => ({ name: 'Vinur' })) },
    './effects.js': { createYatzyEffects: () => effects }, './audio.js': { createYatzyAudio: () => audio },
  };
  const browser = {};
  const set = (name, value) => { globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); };
  set(key, modules); set('document', document); set('window', browser); set('location', { search: '?qa', reload() {} });
  set('localStorage', { getItem: name => storage.get(name) ?? null, setItem: (name, value) => storage.set(name, value) });
  set('matchMedia', () => ({ matches: false })); set('performance', { now: () => now });
  set('crypto', { getRandomValues(array) { array[0] = seed++; return array; } });
  set('requestAnimationFrame', callback => { const id = ++frameId; frames.set(id, callback); return id; });
  set('cancelAnimationFrame', id => frames.delete(id)); set('addEventListener', events.addEventListener.bind(events));
  set('ResizeObserver', class { constructor(callback) { this.callback = callback; this.disconnected = false; stats.observers.push(this); } observe() {} disconnect() { this.disconnected = true; } });
  set('console', { ...console, error: (...args) => stats.errors.push(args) });
  const url = `${GAME}?controller-test=${fixtureId}`;
  hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL === url && modules[specifier]) {
      const source = Object.keys(modules[specifier]).map(name => `export const ${name}=globalThis[${JSON.stringify(key)}][${JSON.stringify(specifier)}][${JSON.stringify(name)}];`).join('\n');
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true, format: 'module' };
    }
    return next(specifier, context);
  } });
  const click = target => (typeof target === 'string' ? document.getElementById(target) : target).dispatchEvent(new Event('click'));
  const api = {
    document, storage, stats, world, opponent, effects, audio, dice, frames, click,
    get now() { return now; },
    get qa() { return browser.__yatzyQA; },
    cell(id, player = 0) { return document.getElementById('score-rows').findAll(node => node.dataset?.category === id && Number(node.dataset.player) === player)[0]; },
    close(id) { const button = document.getElementById(id).findAll(node => node.attributes.has('data-close'))[0]; assert.ok(button); click(button); },
    key(key, code = key, extra = {}) { const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key, code, ...extra }); document.dispatchEvent(event); },
    tick(count = 1) { for (let i = 0; i < count; i++) { now += 50; const pending = [...frames.values()]; frames.clear(); assert.ok(pending.length <= 1, 'only one animation loop'); for (const callback of pending) callback(now); } },
    until(predicate, max = 600) { for (let i = 0; i < max && !predicate(); i++) api.tick(); assert.ok(predicate(), `controller did not reach expected state; ${JSON.stringify(api.qa?.getStatus())}`); },
    pagehide() { events.dispatchEvent(new Event('pagehide')); },
    visibility(hidden) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
  };
  try {
    await import(url); await settleMicrotasks();
    if (!Object.keys(gates).length) assert.ok(api.qa, `controller initialized: ${JSON.stringify(stats.errors)}`);
    await run(api);
    assert.deepEqual(stats.errors, [], 'no controller initialization errors');
  } finally {
    api.pagehide(); for (const gate of Object.values(gates)) gate.resolve(); await settleMicrotasks(); hook.deregister();
    for (const [name, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
}

test('controller locks double rolls and stale scoring/hold input during animation, then retains selected dice', async () => {
  await fixture(f => {
    f.click('roll'); assert.equal(f.qa.getState().rollCount, 0);
    f.click('start'); const initial = f.qa.getState(), expected = roll(initial);
    f.click('roll'); f.click('roll'); f.key(' ', 'Space'); f.key('1'); f.click(f.cell('chance'));
    assert.deepEqual(f.qa.getState(), expected); assert.equal(f.dice.starts.length, 1);
    assert.equal(f.qa.getStatus().phase, 'rolling');
    f.until(() => f.qa.getStatus().phase === 'human'); f.key('1');
    const retained = f.qa.getState(); assert.equal(retained.held[0], true);
    f.click('roll'); assert.deepEqual(f.qa.getState(), roll(retained));
    assert.equal(f.qa.getState().dice[0], expected.dice[0]);
    f.until(() => f.qa.getStatus().phase === 'human');
    assert.deepEqual(f.dice.values, f.qa.getState().dice); assert.deepEqual(f.dice.held, f.qa.getState().held);
  });
});

test('modal and visibility pauses freeze the actual turn clock, roll and input until resumed', async () => {
  await fixture(f => {
    f.click('start'); f.click('roll'); f.tick(2); f.click('pause');
    const state = f.qa.getState(), status = f.qa.getStatus(), picture = f.dice.getDebugState();
    f.tick(100); f.click('roll'); f.key('1'); f.click(f.cell('chance'));
    assert.deepEqual(f.qa.getState(), state); assert.deepEqual(f.qa.getStatus(), status); assert.deepEqual(f.dice.getDebugState(), picture); assert.equal(f.audio.paused, true);
    f.close('pause-dialog'); assert.equal(f.audio.paused, false); f.visibility(true); f.tick(50);
    assert.deepEqual(f.dice.getDebugState(), picture); f.visibility(false);
    f.until(() => f.qa.getStatus().phase === 'human'); assert.equal(f.qa.getState().rollCount, 1);
    f.click(f.cell('chance')); f.click('pause'); const handoff = f.qa.getStatus(); f.tick(100);
    assert.deepEqual(f.qa.getStatus(), handoff); f.close('pause-dialog');
    f.until(() => f.qa.getStatus().phase !== 'handoff'); assert.equal(f.qa.getState().currentPlayer, 1);
  });
});

test('the cup invites a legal human throw and obeys pause, all-held, three-roll and opponent locks', async () => {
  await fixture(f => {
    const button=f.document.getElementById('cup-target');
    assert.equal(button.hidden,true);f.click('cup-target');assert.equal(f.dice.starts.length,0);
    f.click('start');assert.equal(button.hidden,false);assert.equal(f.dice.ready,true);
    f.click('cup-target');f.click('cup-target');assert.equal(f.dice.starts.length,1);assert.equal(button.hidden,true);
    f.until(()=>f.qa.getStatus().phase==='human');assert.equal(button.hidden,true,'cup stays unavailable during the result-camera move');f.until(()=>!button.hidden);
    f.click('pause');assert.equal(button.hidden,true);assert.equal(f.dice.ready,false);
    const before=f.qa.getState();f.click('cup-target');assert.deepEqual(f.qa.getState(),before);
    f.close('pause-dialog');assert.equal(button.hidden,false);
    for(let i=1;i<=5;i++)f.key(String(i));assert.equal(button.hidden,true);
    f.click('cup-target');assert.equal(f.dice.starts.length,1);
    f.key('1');assert.equal(button.hidden,false);f.click('cup-target');f.until(()=>f.qa.getStatus().phase==='human');f.until(()=>!button.hidden);
    f.click('cup-target');f.until(()=>f.qa.getStatus().phase==='human');assert.equal(button.hidden,true);assert.equal(f.dice.starts.length,3);
    f.click('cup-target');assert.equal(f.dice.starts.length,3);
    f.click(f.cell('chance'));f.until(()=>f.qa.getState().currentPlayer===1&&f.qa.getStatus().phase!=='handoff');
    const opponent=f.qa.getState();f.click('cup-target');assert.deepEqual(f.qa.getState(),opponent);assert.equal(button.hidden,true);
  });
});

test('a cup pointer click beside a die cannot reroll and the settled cup remains intentionally usable', async () => {
  await fixture(f=>{
    f.click('start');f.click('cup-target');f.until(()=>f.qa.getStatus().phase==='human');
    const before=f.qa.getState();f.click('cup-target');assert.deepEqual(f.qa.getState(),before,'pending camera hides and guards cup activation');
    f.until(()=>!f.document.getElementById('cup-target').hidden);
    const pointer=(x,y)=>{const event=new Event('click');Object.assign(event,{detail:1,clientX:x,clientY:y});f.document.getElementById('cup-target').dispatchEvent(event);};
    pointer(250,350);assert.deepEqual(f.qa.getState(),before,'a stale cup event over a die cannot spend a roll');
    pointer(291,350);assert.deepEqual(f.qa.getState(),before,'near-edge taps have an extra eight-pixel safety margin');
    pointer(100,315);assert.equal(f.qa.getState().rollCount,before.rollCount+1,'deliberate cup activation still rolls');
  });
});

test('stationary result frames do not rewrite target DOM, force layout reads or repeatedly hide an expired notice', async () => {
  await fixture(f => {
    f.click('start');f.click('cup-target');f.until(()=>f.qa.getStatus().phase==='human');f.tick(120);
    const nodes=[...f.document.getElementById('dice-targets').children,f.document.getElementById('cup-target'),f.document.getElementById('moment')];
    let writes=0,reads=0;
    for(const node of nodes){
      const set=node.setAttribute.bind(node);node.setAttribute=(...args)=>{writes++;return set(...args);};
      node.style=new Proxy(node.style,{set(object,key,value){writes++;object[key]=value;return true;}});
      node.dataset=new Proxy(node.dataset,{set(object,key,value){writes++;object[key]=value;return true;}});
    }
    const canvas=f.document.getElementById('table');
    Object.defineProperty(canvas,'clientWidth',{get(){reads++;return 1000;},configurable:true});
    Object.defineProperty(canvas,'clientHeight',{get(){reads++;return 700;},configurable:true});
    f.tick(120);assert.equal(writes,0);assert.equal(reads,0);
    f.key('1');assert.ok(writes>0,'a real hold change still updates the target and screen reader state');
  });
});

test('hands-on teaching gates real actions, repeats holds, teaches every category and leaves the normal save untouched', async () => {
  const original=hold(roll(createGame({seed:900})),3),bytes=JSON.stringify(original),storage=new Map([[SAVE,bytes]]);
  await fixture(f=>{
    f.click('learn');assert.equal(f.qa.getTutorial().id,'intro');
    f.click('roll');f.key('1');assert.equal(f.qa.getState().rollCount,0,'intro cannot be skipped by gameplay input');
    let quizzes=0,holds=0,rolls=0;
    for(let guard=0;guard<100&&f.qa.getTutorial().type!=='finish';guard++){
      const step=f.qa.getTutorial();
      if(step.type==='next')f.click('tutorial-next');
      else if(step.type==='roll'){
        const count=f.qa.getState().rollCount;f.click('roll');f.click('roll');assert.equal(f.qa.getState().rollCount,count+1);rolls++;f.tick(80);
      }else if(step.type==='hold'){
        const before=f.qa.getState();f.click('roll');f.click(f.cell('chance'));assert.deepEqual(f.qa.getState(),before,'holding step blocks early casts and scores');
        for(const index of step.indices)if(f.qa.getState().held[index]!==step.held){f.key(String(index+1));holds++;f.tick(20);}
      }else if(step.type==='score'){
        const before=f.qa.getState();f.click(f.cell(step.category==='sixes'?'chance':'sixes'));assert.deepEqual(f.qa.getState(),before,'unrelated score rows cannot bypass the lesson');
        f.click(f.cell(step.category));assert.equal(f.qa.getState().players[0].scores[step.category],step.points);f.tick(30);
      }else if(step.type==='opponent')f.tick(100);
      else if(step.type==='quiz'){
        const choices=f.document.getElementById('tutorial-choices').children,wrong=step.choices.findIndex(choice=>!choice.correct),right=step.choices.findIndex(choice=>choice.correct);
        f.click(choices[wrong]);f.click('tutorial-next');assert.equal(f.qa.getTutorial().id,step.id,'a wrong answer gives another try');
        assert.ok(f.qa.getTutorial().feedback);f.click(choices[right]);assert.equal(f.qa.getTutorial().id,step.id,'the child can read praise before continuing');
        f.click('tutorial-next');quizzes++;
      }
      f.tick(30);assert.equal(storage.get(SAVE),bytes,'teaching never writes over a normal saved game');
    }
    assert.equal(f.qa.getTutorial().type,'finish');assert.equal(rolls,5);assert.ok(holds>=7&&quizzes>=12);
    assert.equal(f.qa.getState().players[0].scores.sixes,24);assert.equal(f.qa.getState().players[0].scores.fullHouse,13);assert.equal(f.qa.getState().players[1].scores.twoPairs,12);
    f.click('tutorial-repeat');assert.equal(f.qa.getTutorial().id,'intro');assert.equal(f.qa.getState().rollCount,0);
    f.click('tutorial-exit');assert.equal(f.qa.getTutorial().active,false);assert.equal(f.document.getElementById('welcome').open,true);
    f.click('continue');assert.deepEqual(f.qa.getState(),original);assert.equal(storage.get(SAVE),bytes);
  },{storage});
});

test('leaving teaching during a paused throw restores the committed normal hand without late lesson events', async () => {
  await fixture(f=>{
    f.click('start');f.click('roll');f.until(()=>f.qa.getStatus().phase==='human');f.tick(40);f.key('2');
    const original=f.qa.getState(),bytes=f.storage.get(SAVE);
    f.click('help');f.click('learn-help');f.click('tutorial-next');f.click('roll');f.click('pause');
    const practice=f.qa.getState();f.tick(100);assert.deepEqual(f.qa.getState(),practice);
    f.close('pause-dialog');f.click('tutorial-exit');f.tick(100);
    assert.deepEqual(f.qa.getState(),original);assert.equal(f.storage.get(SAVE),bytes);assert.equal(f.qa.getTutorial().active,false);
    assert.equal(f.document.getElementById('help-dialog').open,false);assert.equal(f.qa.getStatus().paused,false);
    assert.equal(f.document.getElementById('roll').getAttribute('aria-describedby'),null,'normal controls do not retain hidden lesson instructions');
  });
});

test('the camera holds the table for the full reaction beat, freezes the pending delay while paused, then requests the dice view once', async () => {
  await fixture(f => {
    f.click('start'); f.click('roll'); f.until(() => f.qa.getStatus().phase === 'human');
    const landedAt = f.now, before = f.stats.views.length;
    assert.equal(f.world.getViewState().mode, 'table');
    f.tick(13); // 0.65 seconds of the 0.70-second reaction beat.
    assert.equal(f.world.getViewState().mode, 'table'); assert.equal(f.stats.views.length, before);
    f.click('pause'); const pausedAt = f.now; f.tick(80);
    assert.equal(f.stats.views.length, before, 'wall-clock time in the pause dialog must not spend the remaining reaction beat');
    const pausedTime = f.now - pausedAt; f.close('pause-dialog'); f.tick();
    assert.equal(f.world.getViewState().mode, 'dice');
    assert.deepEqual(f.stats.views.at(-1), { mode: 'dice', reduced: false, time: landedAt + pausedTime + 700 });
    f.tick(30); assert.equal(f.stats.views.length, before + 1, 'the settled result must not keep restarting camera travel');
    f.click('roll'); assert.equal(f.world.getViewState().mode, 'table', 'the next roll leaves the dice close view immediately');
  });
});

test('a new roll or a recorded score cancels the pending dice view and returns to the table', async () => {
  await fixture(f => {
    f.click('start'); f.click('roll'); f.until(() => f.qa.getStatus().phase === 'human'); f.tick(3);
    f.dice.normalDuration = 1.2; f.click('roll');
    assert.equal(f.world.getViewState().mode, 'table'); assert.equal(f.stats.views.at(-1).mode, 'table');
    f.tick(16); // Past the previous reaction deadline, still inside the new roll.
    assert.equal(f.qa.getStatus().phase, 'rolling');
    assert.equal(f.stats.views.filter(request => request.mode === 'dice').length, 0, 'the old result must not steal the camera during a new roll');
    f.until(() => f.qa.getStatus().phase === 'human'); f.click(f.cell('chance'));
    assert.equal(f.qa.getStatus().phase, 'handoff'); assert.equal(f.world.getViewState().mode, 'table');
    const recordedAt = f.stats.views.length; f.tick(20);
    assert.equal(f.qa.getStatus().phase, 'handoff');
    assert.equal(f.stats.views.length, recordedAt, 'a score must cancel the result-camera deadline during the score reaction');
    assert.equal(f.world.getViewState().mode, 'table');
  });
});

test('reduced motion snaps either a pending dice view or the current camera transition without leaving a delayed request', async () => {
  for (const cameraState of ['pending', 'travelling']) {
    await fixture(f => {
      f.click('start'); f.click('roll'); f.until(() => f.qa.getStatus().phase === 'human');
      if (cameraState === 'travelling') { f.tick(14); assert.equal(f.world.getViewState().transitioning, true); }
      else assert.equal(f.world.getViewState().mode, 'table');
      f.click('pause'); f.click('motion');
      assert.deepEqual(f.world.getViewState(), { mode: 'dice', blend: 1, transitioning: false });
      assert.equal(f.stats.views.at(-1).reduced, true);
      const requests = f.stats.views.length; f.tick(40); f.close('pause-dialog'); f.tick(30);
      assert.equal(f.stats.views.length, requests, 'snapping must consume any previously scheduled camera request');
    });
  }
});

test('switching motion mode during a paused human roll reaches its committed result once after resuming', async () => {
  await fixture(f => {
    f.dice.normalDuration = 1; f.click('start'); f.click('roll'); f.tick(1);
    const committed = f.qa.getState(); assert.equal(f.dice.starts[0].reduced, false);
    f.click('pause'); f.click('motion');
    assert.deepEqual(f.dice.motionChanges, [{ reduced: false, rolling: false }, { reduced: true, rolling: true }], 'the preference reaches the active dice animation');
    assert.equal(f.qa.getStatus().reduced, true); assert.equal(f.qa.getStatus().paused, true);
    assert.deepEqual(f.world.getViewState(), { mode: 'table', blend: 0, transitioning: false }, 'a calm unfinished roll stays at the table');
    assert.equal(JSON.parse(f.storage.get('mosi.yatzy.table.prefs.v1')).reduced, true);
    const paused = f.dice.getDebugState(); f.tick(40);
    assert.deepEqual(f.dice.getDebugState(), paused); assert.deepEqual(f.qa.getState(), committed);
    f.close('pause-dialog'); f.until(() => f.qa.getStatus().phase === 'human', 5);
    assert.deepEqual(f.world.getViewState(), { mode: 'dice', blend: 1, transitioning: false }, 'a calm settled roll snaps directly to the result');
    assert.deepEqual(f.qa.getState(), committed); assert.deepEqual(f.dice.values, committed.dice);
    assert.equal(f.dice.starts.length, 1, 'switching mode never rerolls the committed hand');
    f.click('pause'); f.click('motion'); f.close('pause-dialog'); f.click('roll');
    assert.equal(f.dice.motionChanges.at(-1).reduced, false); assert.equal(f.dice.starts.at(-1).reduced, false);
    assert.equal(f.qa.getState().rollCount, 2, 'only the next deliberate roll consumes another attempt');
  });
});

test('hold advice names the visible die values and score advice leaves the hand untouched', async () => {
  await fixture(f => {
    const hand = { ...roll(createGame()), dice: [6, 6, 6, 1, 2] }, decision = decideAI(hand);
    assert.equal(decision.type, 'roll'); f.qa.setState(hand); f.click('advice');
    const expected = decision.held.flatMap((held, index) => held ? [hand.dice[index]] : []);
    assert.deepEqual((f.document.getElementById('moment-text').textContent.match(/\d+/g) ?? []).map(Number), expected);
    assert.ok(expected.every(value => value === 6), 'the sample distinguishes values from the invisible 1/2/3 die indices');
    assert.deepEqual(f.qa.getState(), hand);
    const yatzy = { ...hand, dice: [5, 5, 5, 5, 5], rollCount: 3 }; f.qa.setState(yatzy); f.click('advice');
    const choice = decideAI(yatzy); assert.equal(choice.type, 'score');
    assert.equal(f.document.activeElement, f.cell(choice.categoryId));
    assert.ok(f.document.getElementById('moment-text').textContent.includes(String(previews(yatzy)[choice.categoryId])));
    assert.deepEqual(f.qa.getState(), yatzy);
  });
});

test('zero confirmation can be cancelled and records once; new game clears old confirmation and in-flight work', async () => {
  await fixture(f => {
    const hand = { ...roll(createGame()), dice: [1, 2, 3, 4, 6] }; f.qa.setState(hand);
    f.click(f.cell('yatzy')); assert.equal(f.document.getElementById('zero-dialog').open, true);
    f.close('zero-dialog'); assert.deepEqual(f.qa.getState(), hand);
    f.click(f.cell('yatzy')); f.click('confirm-zero'); f.click('confirm-zero');
    assert.equal(f.qa.getState().players[0].scores.yatzy, 0); assert.equal(f.qa.getState().turnCount, 1);
    assert.equal(f.qa.getStatus().phase, 'handoff'); f.click(f.cell('chance')); assert.equal(f.qa.getState().turnCount, 1);
    f.click('pause'); f.click('new-game'); f.click('start');
    assert.equal(f.qa.getState().turnCount, 0); assert.equal(f.qa.getState().rollCount, 0);
    f.qa.setState(hand); f.click(f.cell('yatzy')); f.close('zero-dialog');
    f.click('pause'); f.click('new-game'); f.click('start'); f.click('confirm-zero');
    assert.equal(f.qa.getState().turnCount, 0, 'the previous game cannot leave a pending zero confirmation');
    f.click('roll'); f.tick(1); assert.equal(f.dice.rolling, true);
    f.click('pause'); f.click('new-game'); f.click('start'); f.click('confirm-zero'); f.tick(150);
    assert.equal(f.qa.getStatus().phase, 'human'); assert.equal(f.qa.getState().turnCount, 0); assert.equal(f.qa.getState().rollCount, 0); assert.equal(f.dice.rolling, false);
  });
});

test('Mosi applies only its chosen holds, rerolls legally, scores once and returns a clean human turn', async () => {
  await fixture(f => {
    const hand = { ...roll(createGame({ startingPlayer: 1 })), dice: [6, 6, 6, 1, 2], held: [false, false, false, false, true] }, decision = decideAI(hand);
    assert.equal(decision.type, 'roll'); assert.ok(decision.held.some(Boolean)); f.qa.setState(hand);
    f.until(() => f.qa.getStatus().phase === 'ai-hold');
    let expected = hand; for (let i = 0; i < 5; i++) if (expected.held[i] !== decision.held[i]) expected = hold(expected, i, decision.held[i]);
    assert.deepEqual(f.qa.getState(), expected); assert.deepEqual(f.dice.held, decision.held);
    f.key('1'); f.click('roll'); f.click(f.cell('chance')); assert.deepEqual(f.qa.getState(), expected);
    f.until(() => f.qa.getStatus().phase === 'rolling'); assert.deepEqual(f.qa.getState(), roll(expected));
    f.until(() => f.qa.getStatus().phase === 'human'); const result = f.qa.getState();
    validateGame(result); assert.equal(result.turnCount, 1); assert.equal(result.currentPlayer, 0); assert.equal(result.rollCount, 0);
    assert.deepEqual(result.dice, [0, 0, 0, 0, 0]); assert.ok(result.held.every(value => !value));
    assert.equal(CATEGORIES.filter(category => result.players[1].scores[category.id] !== null).length, 1);
    assert.ok(CATEGORIES.every(category => result.players[0].scores[category.id] === null));
  });
});

test('reload preserves a committed roll and held dice; Mosi can resume a saved hand without a free reroll', async () => {
  const storage = new Map(); let saved;
  await fixture(f => {
    f.click('start'); f.click('roll'); saved = f.qa.getState();
    assert.deepEqual(JSON.parse(storage.get(SAVE)), saved);
  }, { storage });
  await fixture(f => {
    assert.equal(f.document.getElementById('continue').hidden, false); f.click('continue');
    assert.deepEqual(f.qa.getState(), saved); assert.deepEqual(f.dice.values, saved.dice); assert.equal(f.dice.starts.length, 0);
    assert.deepEqual(f.world.getViewState(), { mode: 'dice', blend: 1, transitioning: false }, 'continuing a committed rolled hand restores the result view immediately');
    assert.equal(f.stats.views.at(-1).reduced, true, 'restored framing must not replay the previous roll or camera move');
    f.key('2'); saved = f.qa.getState(); assert.equal(saved.held[1], true);
  }, { storage });
  await fixture(f => { f.click('continue'); assert.deepEqual(f.qa.getState(), saved); assert.deepEqual(f.dice.held, saved.held); }, { storage });
  const mosi = { ...roll(createGame({ startingPlayer: 1 })), dice: [6, 6, 6, 6, 6], rollCount: 3 };
  storage.set(SAVE, JSON.stringify(mosi));
  await fixture(f => {
    f.click('continue'); f.until(() => f.qa.getStatus().phase === 'human');
    assert.equal(f.dice.starts.length, 0); assert.equal(f.qa.getState().players[1].scores.yatzy, 50); assert.equal(f.qa.getState().turnCount, 1);
  }, { storage });
});

test('corrupt saves are rejected and storage failure does not interrupt play', async () => {
  for (const invalid of ['{broken', JSON.stringify({ ...createGame(), version: 999 }), JSON.stringify({ ...createGame(), turnCount: 6 })]) {
    await fixture(f => { assert.equal(f.document.getElementById('continue').hidden, true); f.click('start'); f.click('roll'); validateGame(f.qa.getState()); }, { storage: new Map([[SAVE, invalid]]) });
  }
  const storage = new Map(); storage.get = () => { throw new Error('storage blocked'); }; storage.set = () => { throw new Error('storage blocked'); };
  await fixture(f => { f.click('start'); f.click('roll'); f.until(() => f.qa.getStatus().phase === 'human'); assert.equal(f.qa.getState().rollCount, 1); }, { storage });
});

test('finishing and reloading a completed game retain both totals and a populated result dialog', async () => {
  let active = createGame();
  for (let turn = 0; turn < 29; turn++) active = score(roll(active), CATEGORIES[Math.floor(turn / 2)].id);
  active = { ...roll(active), rollCount: 3 };
  const completed = score(active, 'yatzy');
  await fixture(f => {
    f.qa.setState(active); f.until(() => f.document.getElementById('win-dialog').open);
    assert.deepEqual(f.qa.getState(), completed); assert.ok(f.document.getElementById('win-title').textContent.length > 0);
    f.close('win-dialog'); f.tick(100); assert.equal(f.document.getElementById('win-dialog').open, false, 'the result does not reopen after dismissal');
  });
  const storage = new Map([[SAVE, JSON.stringify(completed)]]);
  await fixture(f => {
    f.click('continue'); assert.deepEqual(f.qa.getState(), completed);
    f.until(() => f.document.getElementById('win-dialog').open);
    assert.ok(f.document.getElementById('win-title').textContent.length > 0);
    const copy = f.document.getElementById('win-copy').textContent;
    for (const player of completed.players) assert.ok(copy.includes(String(totals(player.scores).total)));
    assert.equal(f.qa.getStatus().paused, true); assert.equal(f.dice.starts.length, 0);
    f.click('play-again'); assert.equal(f.qa.getState().status, 'playing'); assert.equal(f.qa.getState().turnCount, 0);
  }, { storage });
});

test('pagehide cancels the animation loop, disconnects observers and prevents late async initialization', async () => {
  await fixture(f => {
    f.click('start'); f.click('roll'); f.pagehide();
    assert.equal(f.frames.size, 0); assert.ok(f.stats.observers.length > 0 && f.stats.observers.every(observer => observer.disconnected));
    const renders = f.stats.renders; f.tick(20); assert.equal(f.stats.renders, renders);
  });
  for (const stage of ['fonts', 'world', 'opponent', 'dice', 'compile']) {
    const gate = deferred();
    await fixture(async f => {
      f.pagehide(); gate.resolve(); await settleMicrotasks();
      assert.equal(f.qa, undefined, `no QA/UI activation after disposal during ${stage}`);
      assert.equal(f.frames.size, 0); assert.equal(f.document.getElementById('welcome').open, false);
      if (stage !== 'fonts') assert.ok(f.stats.world >= 1, 'late-acquired world is released');
      if (['opponent', 'dice', 'compile'].includes(stage)) assert.ok(f.stats.dice >= 1 && f.stats.opponent >= 1, 'both acquired presentation resources are released');
    }, { gates: { [stage]: gate } });
  }
});
