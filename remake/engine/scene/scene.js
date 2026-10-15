import { createScheduler, wait, all, race, until } from './scheduler.js';
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

export function createScene({ world, director, ui, voice, lines = {}, cast = {} }) {
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
    /** Stop everything the scene set going: scripts, camera modes, walks, looks, sound, captions. */
    stop() {
      scheduler.cancelAll();
      director.stop();
      director.handheld(0, { duration: 0.001 });
      for (const a of world.actors.values()) a.stop?.();
      voice.stop();
      ui.reset();
    },
  };
}
