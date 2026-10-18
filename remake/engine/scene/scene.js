import { createScheduler, wait, all, race, until } from './scheduler.js';
import { searchFlow } from './search.js';
import { createStarSprite, STAR_RADIUS } from './star-sprite.js';
import { EASE } from '../camera/director.js';
import { DONE } from '../handle.js';

// The scene system. A chapter script is a generator function that receives `s`, the scene API,
// and yields what it waits for (see scheduler.js). It runs on the game clock, so the book can pause
// it, captures can seek it to an exact second, and it can be cancelled at any yield.
//
// Every call starts its action at once and returns something to wait on: camera moves and walks
// return handles, lines, fades and choices return tasks. Yield it to wait; keep it to wait later.
//
//   *script(s) {
//     yield s.fade(0, 2);
//     yield s.all(s.camera.move('hero', { duration: 6 }), s.actor('mosi').walkTo([[0, 0]]));
//     yield s.say('mosi', 'welcome');
//     const answer = yield s.choose([{ label: 'Já!', value: 'yes' }, { label: 'Seinna', value: 'later' }]);
//   }

// `locations` (engine/locations.js) is optional: only s.goTo needs it, and says so when it is missing.
// So is `pointer` (engine/input/pointer.js), which s.target, s.tap, s.onTap, s.search and s.lookAround need, and
// `journal` (scene/journal.js), which s.star, s.found and s.journal need, and `sun` (engine/sun-face.js),
// which s.sun needs, and `sfx` (engine/audio/sfx.js), which s.sfx needs. s.drag and s.tray need `ui.tray`.
// The music is not the script's to direct: it plays the theme, lowers itself under the voice (main.js) and holds with the clock.
export function createScene({ world, director, ui, voice, lines = {}, cast = {}, locations = null, pointer = null, journal = null, sun = null, sfx = null }) {
  const scheduler = createScheduler();
  let seeking = false;
  let started = false; // set by begin(): the start button, or at once for captures
  let beganAt = 0;

  const words = text => text.trim().split(/\s+/).filter(Boolean).length;

  function resolveLine(line) {
    if (typeof line !== 'string') return line;
    return world.chapter.lines?.[line] ?? { text: line };
  }

  /** Seconds a line takes: its recording when there is one, else a calm reading pace for children. */
  function lineDuration(entry) {
    const recording = entry.audio ? lines[entry.audio] : null;
    if (recording?.duration) return recording.duration;
    return 0.6 + words(entry.text) * 0.42;
  }

  // A speaker who is an actor talks: the mouth follows the recording's loudness (lines.json), or the
  // text when there is no recording, and the head moves with it (engine/talk.js).
  function* sayTask(speaker, line, { hold = 0.5, keep = false } = {}) {
    const who = cast[speaker] ?? { name: speaker };
    const entry = resolveLine(line);
    const recording = entry.audio ? lines[entry.audio] : null;
    const caption = ui.caption(who.name, entry.text, who.colour);
    const sound = recording && !seeking ? voice.play(recording.src) : null;
    const actor = world.actors?.get(speaker);
    const talking = actor?.talk?.({ mouth: recording?.mouth, duration: lineDuration(entry), text: entry.text });
    try {
      yield wait(lineDuration(entry) + hold);
    } finally {
      // Only this line's own sound, mouth and caption: a newer line may already be showing.
      if (sound) voice.stop(sound);
      if (talking) actor.stopTalking(talking);
      if (!keep) ui.clearCaption(caption);
    }
  }

  // While seeking (captures), a choice shows for a few seconds and then takes its `auto` option,
  // so a capture can land on the buttons and the timeline stays deterministic.
  function* chooseTask(options, { auto = 0 } = {}) {
    const list = options.map(o => (typeof o === 'string' ? { label: o, value: o } : o));
    if (seeking) {
      ui.showChoices(list);
      try {
        yield wait(3);
      } finally {
        ui.hideChoices();
      }
      return list[auto].value;
    }
    try {
      return yield ui.choose(list);
    } finally {
      ui.hideChoices();
    }
  }

  function* fadeTask(to, duration = 1) {
    const from = ui.fadeLevel;
    const start = scheduler.now;
    for (;;) {
      const t = duration > 0 ? Math.min(1, (scheduler.now - start) / duration) : 1;
      ui.setFade(from + (to - from) * EASE.inOut(t));
      if (t >= 1) return;
      yield;
    }
  }

  // Fade to black, change location, fade back in. The change is real work (a location's forest is
  // built the first time), so it is a promise: a seek waits for it through the scheduler's pending count.
  function* goToTask(name, fade) {
    yield fadeTask(1, fade);
    yield locations.setLocation(name);
    yield fadeTask(0, fade);
  }

  function goTo(name, { fade = 1.2 } = {}) {
    if (!locations) throw new Error('s.goTo needs the chapter\'s locations: pass `locations` (createLocations) to createScene');
    return start(goToTask(name, fade));
  }

  // Taps. A script waits for one with s.tap; the waits are served in the order they began, one tap to
  // one wait. Handlers added with s.onTap hear every tap on their target, whatever else is waiting.
  const tapWaits = []; // { names, hit }: a wait in progress, and the name it was given once it has one
  const tapHandlers = []; // { name, fn }
  const ownTargets = new Set(); // what s.target put on the pointer, for stop() to take off again

  function needPointer(call) {
    if (!pointer) throw new Error(`${call} needs the pointer: pass \`pointer\` (createPointer) to createScene`);
  }

  if (pointer) {
    pointer.on('tap', event => {
      // The wait first: a handler that throws must not keep the story from going on. A wait that
      // already has its tap (the script has not run since) is skipped, so a second tap in the same
      // frame cannot take it over; it goes to the next wait, or to the handlers alone.
      const waiting = tapWaits.find(w => w.hit === null && w.names.includes(event.name));
      if (waiting) waiting.hit = event.name;
      for (const handler of [...tapHandlers]) if (handler.name === event.name) handler.fn(event);
    });
  }

  // On the game clock, like everything a script waits for: the script resumes on the first frame
  // after the tap. While seeking (captures) there is no player, so it waits a fixed time and takes
  // its `auto` name, as chooseTask does.
  function* tapTask(names, { auto = names[0] } = {}) {
    if (seeking) {
      yield wait(2);
      return auto;
    }
    const waiting = { names, hit: null };
    tapWaits.push(waiting);
    try {
      yield until(() => waiting.hit !== null);
      return waiting.hit;
    } finally {
      // Also when the task is cancelled, say by losing a race to a timer: a wait that is over must not take the next tap.
      tapWaits.splice(tapWaits.indexOf(waiting), 1);
    }
  }

  function tap(names, options) {
    needPointer('s.tap');
    const list = Array.isArray(names) ? names : [names];
    if (!list.length) throw new TypeError('s.tap needs the name of at least one target');
    return start(tapTask(list, options));
  }

  function onTap(name, fn) {
    needPointer('s.onTap');
    const handler = { name, fn };
    tapHandlers.push(handler);
    return () => {
      const i = tapHandlers.indexOf(handler);
      if (i >= 0) tapHandlers.splice(i, 1);
    };
  }

  function target(name, spec) {
    needPointer('s.target');
    if (spec === null) {
      pointer.removeTarget(name);
      ownTargets.delete(name);
    } else {
      pointer.addTarget(name, spec);
      ownTargets.add(name);
    }
    return DONE;
  }

  // The camera turns free within `limits` (director.explore) and what the finger drags looks around.
  // Returns what puts both back; the view then holds where the child left it.
  function freeLook(limits) {
    const exploring = director.explore(limits);
    const unwire = pointer.on('drag', ({ dx, dy }) => director.look(dx, dy));
    return () => {
      unwire();
      exploring.cancel(); // holds the view
    };
  }

  // The camera turns free for the search. The flow (search.js) does the rest, and everything is put
  // back when it ends or is cancelled.
  function* searchTask(spec) {
    const putBack = freeLook(spec.explore);
    try {
      yield* searchFlow({ s, director }, spec);
    } finally {
      putBack();
    }
  }

  function search(spec) {
    needPointer('s.search');
    return start(searchTask(spec));
  }

  // Free look on its own (spec scene 1), for a number of seconds: while seeking nobody drags, so it only waits.
  function* lookAroundTask(limits, seconds) {
    const putBack = freeLook(limits);
    try {
      yield wait(seconds);
    } finally {
      putBack();
    }
  }

  function lookAround(limits, seconds) {
    needPointer('s.lookAround');
    if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError(`s.lookAround needs a number of seconds, not ${seconds}`);
    return start(lookAroundTask(limits, seconds));
  }

  // Drag to target (spec scene 9). The tray carries an item under the child's finger and says where it was
  // let go, in canvas pixels. The scene judges whether that is on the target by putting the target's point
  // on the screen, where it is when the finger lets go, so a target that moves (a head that bends down) is
  // judged where the child sees it.
  function needTray(call) {
    if (!ui.tray) throw new Error(`${call} needs the tray: pass a \`ui\` with a \`tray\` (createStageUI) to createScene`);
  }

  function needScreen(call) {
    if (!world.camera || !world.resolvePoint || !world.renderer?.domElement) {
      throw new Error(`${call} needs the camera and the canvas: \`world\` with camera, resolvePoint and renderer`);
    }
  }

  /** A world point on the canvas, in CSS pixels from its corner; `inFront` is false for a point behind the camera. */
  function screenOf(spec) {
    const box = world.renderer.domElement.getBoundingClientRect();
    const point = world.resolvePoint(spec);
    const inFront = point.clone().applyMatrix4(world.camera.matrixWorldInverse).z < 0;
    point.project(world.camera);
    return { x: ((point.x + 1) / 2) * box.width, y: ((1 - point.y) / 2) * box.height, inFront, box };
  }

  /** Is the drop on the canvas and within `radius` px of where the target is on it? */
  function onTarget(drop, spec, radius) {
    const { x, y, inFront, box } = screenOf(spec);
    if (drop.x < 0 || drop.y < 0 || drop.x > box.width || drop.y > box.height) return false;
    return inFront && Math.hypot(drop.x - x, drop.y - y) <= radius;
  }

  // The drag hears every item on its list, so a child may give any of them; one id is a list of one. A list resolves with
  // which item went and how, one id with how alone. While seeking (captures) there is no child: after 2 s the first item
  // is given, as chooseTask and tapTask do.
  function* dragTask(ids, targetSpec, { radius, idle }, single) {
    const tray = ui.tray;
    const answer = (id, how) => (single ? how : { id, how });
    if (seeking) {
      yield wait(2);
      tray.remove(ids[0]);
      return answer(ids[0], 'dropped');
    }
    let taken = null;
    const stop = tray.onDrop(drop => {
      if (taken !== null || !ids.includes(drop.id)) return; // not one of these items, or the drag is settled already
      if (onTarget(drop, targetSpec, radius)) {
        taken = drop.id;
        tray.remove(drop.id);
      } else {
        tray.putBack(drop.id);
      }
    });
    try {
      yield race(until(() => taken !== null), wait(idle));
    } finally {
      stop(); // also when the drag is cancelled
    }
    if (taken === null) {
      tray.remove(ids[0]); // a child who does not drop one is helped: the first leaves the tray as if it had been given
      return answer(ids[0], 'idle');
    }
    return answer(taken, 'dropped');
  }

  function drag(items, targetSpec, { radius = 90, idle = 20 } = {}) {
    needTray('s.drag');
    needScreen('s.drag');
    const single = !Array.isArray(items);
    const ids = single ? [items] : [...items];
    if (!ids.length || ids.some(id => typeof id !== 'string' || !id)) {
      throw new TypeError('s.drag needs the id of a tray item, a name, or a list of them');
    }
    const twice = ids.find((id, i) => ids.indexOf(id) !== i);
    if (twice !== undefined) throw new TypeError(`s.drag needs different ids: "${twice}" comes twice`);
    if (targetSpec == null) throw new TypeError('s.drag needs a point in the world to drag the item to');
    if (!(radius > 0)) throw new TypeError(`s.drag needs a radius in pixels above 0, not ${radius}`);
    if (!Number.isFinite(idle) || idle < 0) throw new TypeError(`s.drag needs an idle time in seconds, not ${idle}`);
    return start(dragTask(ids, targetSpec, { radius, idle }, single));
  }

  // The star (spec scene 10). A friend's star rises from a point and waits for a tap; then it flies into the
  // journal, which keeps it. The sprite and its tap target are the scene's only while it waits.
  const STAR_IDLE = 8; // seconds before a star nobody taps goes to the journal by itself
  const STAR_SEEKING = 1.5; // and the time a capture gives it

  function needJournal(call) {
    if (!journal) throw new Error(`${call} needs the journal: pass \`journal\` (createJournal) to createScene`);
  }

  function* starTask(id, fromSpec) {
    const name = `star:${id}`;
    const sprite = createStarSprite({ from: world.resolvePoint(fromSpec) });
    const born = scheduler.now;
    function* rise() {
      for (;;) {
        sprite.at(scheduler.now - born);
        yield;
      }
    }
    let tapped;
    let from;
    world.scene.add(sprite.object);
    try {
      target(name, { point: sprite.point, radius: STAR_RADIUS });
      if (seeking) {
        yield race(rise(), wait(STAR_SEEKING));
        tapped = true;
      } else {
        tapped = (yield race(rise(), tapTask([name]), wait(STAR_IDLE))) !== undefined;
      }
      // It leaves from where the child sees it. One tap is all it takes: the target goes in this same step.
      const at = screenOf(sprite.point);
      from = at.inFront
        ? { x: at.box.left + at.x, y: at.box.top + at.y }
        : { x: at.box.left + at.box.width / 2, y: at.box.top + at.box.height / 2 };
    } finally {
      target(name, null);
      world.scene.remove(sprite.object);
      sprite.dispose();
    }
    yield journal.addStar(id, from);
    return tapped ? 'tapped' : 'idle';
  }

  function star(id, fromSpec) {
    needJournal('s.star');
    needPointer('s.star');
    needScreen('s.star');
    if (!world.scene) throw new Error('s.star needs world.scene to raise the star in');
    if (typeof id !== 'string' || !id) throw new TypeError('s.star needs the id of the star, a name such as k1_kambedla');
    if (fromSpec == null) throw new TypeError('s.star needs the point it rises from');
    return start(starTask(id, fromSpec));
  }

  function found(id, from = null) {
    needJournal('s.found');
    journal.addFinding(id, from);
    return DONE;
  }

  function needSun(call) {
    if (!sun) throw new Error(`${call} needs the sun: pass \`sun\` (createSunFace) to createScene`);
  }

  function needSfx(call) {
    if (!sfx) throw new Error(`${call} needs the sound effects: pass \`sfx\` (createSfx) to createScene`);
  }

  function actor(name) {
    const a = world.actors.get(name);
    if (!a) throw new Error(`No actor named "${name}"`);
    return {
      raw: a,
      play(clip, options) { a.play(clip, options); return DONE; },
      walkTo(points, options) { return a.walkTo(points, options); },
      turnTo(target, options) { return a.turnTo(target, options); },
      lookAt(target, options) { a.lookAt(target, options); return DONE; },
      place(x, z, heading) { a.place(x, z, heading); return DONE; },
      blink() { a.blink?.(); return DONE; },
      /** 0 open, 0.5 sleepy, 1 shut; the lids get there over `duration` seconds. */
      closeEyes(level, options) { a.closeEyes?.(level, options); return DONE; },
      openEyes(options) { a.openEyes?.(options); return DONE; },
    };
  }

  const start = generator => scheduler.start(generator);

  const s = {
    get time() { return scheduler.now; },
    get seeking() { return seeking; },
    wait, all, race, until,
    parallel: all,
    /** Wait for the player to start the scene. Put it after the setup, so the first frame is right. */
    ready: () => until(() => started),
    camera: {
      cut: (shot, options) => director.cut(shot, options),
      move: (shot, options) => director.move(shot, options),
      orbit: options => director.orbit(options),
      push: options => director.push(options),
      lookAt: (target, options) => director.lookAt(target, options),
      zoom: (fov, options) => director.zoom(fov, options),
      follow: (subject, options) => director.follow(subject, options),
      handheld: (level, options) => director.handheld(level, options),
      stop: () => { director.stop(); return DONE; },
    },
    actor,
    say: (speaker, line, options) => start(sayTask(speaker, line, options)),
    choose: (options, settings) => start(chooseTask(options, settings)),
    fade: (to, duration) => start(fadeTask(to, duration)),
    /** Go to another of the chapter's locations: fade to black, switch, fade back in (`fade` s each way, 1.2 by default). */
    goTo,
    /** Add or replace a tap target: `{ point, radius }`, a point spec and metres. `s.target(name, null)` removes it. */
    target,
    /** Wait for the player to tap one of the targets (a name or a list); resolves with the name tapped. Seeking: `auto` (the first name) after 2 s. */
    tap,
    /** Call fn(event) for every tap on the target, wait or no wait. Returns the function that stops it. */
    onTap,
    /**
     * The child looks around and finds hidden things; resolves when all are found. `explore` gives the
     * free-look limits for director.explore ({ yaw, pitch, speed }), `targets` what to find, and the rest
     * is searchFlow's (search.js): hintAfter, helpAfter, speaker and onFound(name, index). Seeking: one find every 3 s.
     */
    search,
    /**
     * Let the child look around for `seconds`: the camera turns free within `limits` (director.explore's { yaw, pitch, speed }) and
     * a drag turns the view, as in s.search; then the view holds where the child left it. Seeking: it only waits.
     */
    lookAround,
    /**
     * Wait for the child to drag a tray item to a point in the world (a point spec): `items` is its id, or a list of ids
     * when any of them will do (flowers that are all alike). An item let go within `radius` px of the point on the screen
     * leaves the tray; a drop anywhere else, or off the canvas, sends it back. With one id it resolves 'dropped', or
     * after `idle` seconds without a hit 'idle' (the item leaves the tray then too). With a list it resolves
     * { id, how }: the item dropped and 'dropped', or after `idle` seconds the first id on the list and 'idle'.
     * Seeking: the first item, 'dropped', after 2 s.
     */
    drag,
    /**
     * Raise the star `id` (such as 'k1_kambedla') from a point (a point spec) and wait for the child to tap it. It goes to
     * the journal when tapped, or by itself after 8 s (1.5 s seeking), and resolves 'tapped' or 'idle' once it has landed.
     */
    star,
    /**
     * Put the animal `id` in the journal's finds (once per id). `from` is where the child tapped it, a tap's { name, x, y } (canvas
     * pixels, and the canvas fills the screen): a new find's picture flies from there into the book's button.
     */
    found,
    /**
     * The book, for a scene that ends in it: `open()` opens it on its stars and `close()` shuts it. Unlike the child's own tap on
     * the button, they do not pause the game, so a scene can go on talking under the open book (until the child taps inside it).
     */
    journal: {
      open: () => { needJournal('s.journal.open'); journal.open(); return DONE; },
      close: () => { needJournal('s.journal.close'); journal.close(); return DONE; },
    },
    /**
     * The smiling sun (engine/sun-face.js). `wink()` shuts its eyes for 0.35 s of game time and returns at once, so a line can go
     * on over it. `wave()` (one hand up, four swings, down: 2.3 s), `hug()` (both hands across the front, two squeezes, a grin:
     * 2.4 s) and `mouth('smile' | 'grin' | 'oh', seconds)` (the smile again after `seconds`, 1.5 by default) start at once too and
     * return a handle, done when the gesture is over or the smile is back: yield it to wait. A gesture asked for while another
     * goes on begins when that one is over. Between the calls the sun smiles and blinks by itself.
     */
    sun: {
      wink: () => { needSun('s.sun.wink'); sun.wink(); return DONE; },
      wave: () => { needSun('s.sun.wave'); return sun.wave(); },
      hug: () => { needSun('s.sun.hug'); return sun.hug(); },
      mouth: (shape, seconds) => { needSun('s.sun.mouth'); return seconds === undefined ? sun.mouth(shape) : sun.mouth(shape, seconds); },
    },
    /** The tray along the edge of the screen: `show([{ id, icon }])` fills it, `hide()` puts it away. */
    tray: {
      show: items => { needTray('s.tray.show'); ui.tray.show(items); return DONE; },
      hide: () => { needTray('s.tray.hide'); ui.tray.hide(); return DONE; },
    },
    /**
     * Play a sound effect by name and carry on: forest (a quiet loop, laid once), step, frog, snail, beetle, birds, butterfly,
     * flower, plate, star, journal, saddle or float (engine/audio/sfx.js). An unknown name does nothing. Seeking (a capture's
     * silent replay, critter reactions included) makes no sound.
     */
    sfx: name => {
      needSfx('s.sfx');
      if (!seeking) sfx.play(name);
      return DONE;
    },
    /** Start something after a delay. Pass a function, so its action starts late, not now. */
    after: (delay, item) => start((function* after() {
      yield wait(delay);
      return yield (typeof item === 'function' ? item() : item);
    })()),
    lineDuration: line => lineDuration(resolveLine(line)),
  };

  return {
    s,
    scheduler,
    get time() { return scheduler.time; },
    /** Seconds since the player started the scene (what ?t= seeks to). */
    get elapsed() { return started ? scheduler.time - beganAt : 0; },
    get seeking() { return seeking; },
    set seeking(value) { seeking = Boolean(value); },
    get idle() { return scheduler.idle; },
    get started() { return started; },
    start(script) { return scheduler.run(script(s)); },
    begin() {
      if (started) return;
      started = true;
      beganAt = scheduler.time;
    },
    update(dt) { scheduler.update(dt); },
    /**
     * Stop everything the scene set going: scripts, taps, camera modes, walks, looks, sound, captions, and the effects on
     * world.effects (a plate glow, a hold, the critters, the flowers), which would otherwise run on into a next chapter.
     */
    stop() {
      scheduler.cancelAll();
      tapHandlers.length = 0;
      for (const name of ownTargets) pointer.removeTarget(name);
      ownTargets.clear();
      director.stop();
      director.handheld(0, { duration: 0.001 });
      for (const a of world.actors.values()) a.stop?.();
      world.effects?.clear?.();
      voice.stop();
      sfx?.stop?.(); // the forest's loop
      ui.reset();
    },
  };
}
