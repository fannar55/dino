// The theme, "Little Dino Green Valley", played from assets/audio/theme.mp3 (theme.json says where the file is and how fast it goes).
// It is streamed: an <audio> element, looping, is routed into Web Audio with createMediaElementSource, so the theme can be ducked
// and faded like any other sound while the browser decodes it a little at a time. Decoded whole, its 351.6 s would be 135 MB of
// samples, which a tablet cannot spare.
//
// The music has a playhead, `position`, and the playhead belongs to the game clock, not to the speakers: it is the clock's time since
// the theme first sounded, folded into the file's length. The forest dances to it, so what it dances to is what is heard, and since
// nothing visual reads the audio's own time, a capture (?t=) sees the same beat on every run. The sound follows the playhead, never
// the other way round:
//   - the first touch wakes the audio context and starts the element, silent (a browser lets an element start from a touch only);
//     once the element is really playing, a frame brings the sound up, and the playhead starts where the theme is, at its beginning;
//   - a pause (the book is open, the tab is hidden) or a mute fades the sound out and stops the element. A frame starts it again,
//     puts it where the clock says if it is not there, and brings the sound up only when it is on the playhead, so it never starts
//     behind a clock that was late: the audio context takes a moment to wake, a seek and a start take a moment, and a hidden tab's
//     first frame comes late and the clock counts at most 0.1 s of it;
//   - if the clock loses time (a frame longer than it counts), update dips the sound, seeks the element to the playhead and brings
//     it back: after a long frame the music drops out for a moment, at most once a second;
//   - except in a lenient window (lenient(seconds), which main.js opens as the chapter changes place, under the black): there the
//     playhead goes to the sound instead, as it does for a file that cannot be moved, so the build's long frame and the first draws
//     of the new place never make the theme jump back and repeat. The beat follower eases onto the new grid under the black.
// An element that cannot be moved (its file came from a server that gives no byte ranges, so a seek would land at the start) is
// not moved: the playhead follows it instead, and the beat keeps to what is heard.
// Before the theme sounds, or when it cannot (no Web Audio, a missing or undecodable file, a browser that wants a touch first), the
// playhead is simply the clock's time, so the forest dances and the captions show all the same.
//
// The file is 351.6 s, which is 556.7 beats, so at each loop the beat grid restarts from the file's own beatOffset.

const LEVEL = 0.6; // the theme's place in the mix, where the old game kept it (dist/audio.js MUSIC_MIX.quiet)
const DUCK_DB = -8; // under a recorded line
const DUCK_SECONDS = 0.3;
const FADE = 0.04; // s: the sound comes up and goes down over this long, so it never clicks
const DIP = 0.03; // s: and goes down over this long before the element is moved
const ALIGN = 0.08; // s: an element this close to the playhead is on it
const DRIFT = 0.1; // s: how far the sound may stray from the playhead before it is brought back
const JUMP_GAP = 1; // s of audio time between two such jumps, so a stubborn drift drops the music out at worst once a second
const TRIES = 3; // silent seeks at most to get the element onto the playhead before the sound comes up anyway
const MAX_LEAD = 0.5; // s: the most a seek is aimed ahead of the playhead, to land on it when the seek is done
const STEADY = 0.1; // s of audio time over which an element's own clock must keep pace with it before the element counts as playing
const STALL = 0.15; // s of game time with the audio clock standing still before a context that says it runs counts as asleep
const HAVE_FUTURE_DATA = 3; // an element's readyState: enough data to play on

/** A param that moves in straight lines and can say where it is, so a move that cuts another short starts from there and nothing jumps. */
function createFader(param, value, now) {
  let from = value;
  let to = value;
  let begin = now;
  let length = 0;
  const at = time => (length > 0 ? from + (to - from) * Math.min(1, Math.max(0, (time - begin) / length)) : to);
  param.setValueAtTime(value, now);
  return {
    to(target, time, seconds) {
      const here = at(time);
      param.cancelScheduledValues(time);
      param.setValueAtTime(here, time);
      param.linearRampToValueAtTime(target, time + seconds);
      from = here;
      to = target;
      begin = time;
      length = seconds;
    },
  };
}

/**
 * The music on `context` (an AudioContext, or null for none: then it is a playhead and nothing else), for the theme in `theme`
 * (theme.json) whose `src` is read against `base` (theme.json's own URL). `clock` is the game clock. `output` is the node to
 * play through (the context's destination by default). `createElement` makes the <audio> element (a test gives it a fake).
 *
 * Returns { ready, start, duck, lenient, setPaused, update, muted, position }; `ready` is a promise of whether the theme's file could be
 * opened. update() must be called every frame, after the clock has ticked: it is what starts the sound.
 */
export function createMusic({ context = null, theme = null, clock, base, output, createElement = () => new Audio() } = {}) {
  if (!clock) throw new TypeError('createMusic needs the game clock: pass `clock` (createClock)');

  let element = null; // the <audio> element that streams the theme
  let failed = false; // it cannot play
  let started = false; // the child has touched the page, so sound is allowed
  let paused = false; // held with the clock
  let muted = false; // a capture's replay
  let ducked = false;
  let blocked = false; // the browser refused to play the element: it wants a touch first
  let followed = false; // the element cannot be moved, so the playhead follows it
  let anchor = null; // the clock's time when the theme first sounded; null until then
  // 'idle': silent, the element stopped or about to be. 'starting': the element plays (or seeks), silent, until it is on the playhead.
  // 'live': heard. 'jumping': fading out, before the element is moved to the playhead.
  let state = 'idle';
  let tries = 0; // silent seeks so far, in this start
  let lead = 0; // s: what a seek costs, so the next one is aimed that far ahead of the playhead
  let mark = null; // { at, time }: where the audio clock and the element's were when we began to see whether the element keeps pace
  let dipEnd = 0;
  let pauseAt = null; // audio time when a fading element is stopped
  let lastJump = -Infinity;
  let lenientUntil = -Infinity; // the game time a lenient window lasts until
  let lastAudio = NaN; // the audio clock at the last frame, and the game time it last moved at: a clock that stands still is a stall
  let lastMoved = 0;
  let stalled = false;

  const level = context ? context.createGain() : null; // the duck
  const fade = context ? context.createGain() : null; // the music's own fader: a pause, a mute, a jump
  const volume = level && createFader(level.gain, LEVEL, context.currentTime);
  const fader = fade && createFader(fade.gain, 0, context.currentTime);
  fade?.connect(level);
  level?.connect(output ?? context.destination);

  const length = () => (element && Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 0);

  /** A time folded into the file, which is what the playhead is. */
  const fold = time => {
    const total = length();
    return total > 0 ? ((time % total) + total) % total : time;
  };

  const playhead = () => fold(clock.time - anchor);

  /** How far the element is behind the playhead (negative: ahead of it), the short way round the loop. */
  function behind() {
    const total = length();
    let gap = playhead() - element.currentTime;
    if (total > 0) gap -= Math.round(gap / total) * total;
    return gap;
  }

  const allowed = () => started && !paused && !muted && !failed;
  // A context that says it runs but whose clock stands still (the device is slow to start, or the system took it) is as good as asleep.
  const awake = () => context.state === 'running' && !stalled;

  function fail(error) {
    if (failed) return;
    failed = true;
    console.warn('The theme cannot play; the forest still dances to its beat.', error);
    hush();
  }

  /** Asks the browser for sound. Only a touch gets it (a refusal is not an error: the game goes on without). */
  function wake() {
    if (context.state === 'running') return;
    try {
      context.resume()?.catch?.(() => {});
    } catch {
      // A browser that cannot even ask has no sound to wake.
    }
  }

  function play() {
    if (!element.paused || blocked || failed) return;
    element.play()?.catch?.(error => {
      if (error?.name === 'AbortError') return; // a pause came first
      if (error?.name === 'NotAllowedError') blocked = true; // no touch yet: the next one tries again
      else fail(error);
    });
  }

  /** Can the element be moved to `time`? Not when its file came without byte ranges: it can only play on, and a seek lands at its start. */
  function canSeek(time) {
    const ranges = element.seekable;
    return Boolean(ranges) && ranges.length > 0 && time >= ranges.start(0) && time <= ranges.end(ranges.length - 1);
  }

  /** The element cannot be moved to the playhead, so the playhead goes to the element. */
  function follow() {
    if (!followed) {
      followed = true;
      console.warn('The theme cannot be moved (its file comes without byte ranges), so the beat follows the music instead of the clock.');
    }
    anchor = clock.time - element.currentTime;
    lead = 0;
  }

  /** Moves the element to the playhead, aimed ahead of it by what the last seek cost. Returns false when it cannot be moved (see follow). */
  function seek() {
    const target = fold(playhead() + lead);
    if (!canSeek(target)) {
      follow();
      return false;
    }
    element.currentTime = target;
    mark = null;
    return true;
  }

  /** The sound goes out and the element is stopped once it has: at once if nothing is heard or no frame will come to finish the fade. */
  function hush() {
    if (!element) return;
    if (state !== 'idle') {
      state = 'idle';
      mark = null;
      fader.to(0, context.currentTime, FADE);
    }
    if (element.paused) {
      pauseAt = null;
    } else if (pauseAt === null) {
      if (!awake() || globalThis.document?.hidden) element.pause();
      else pauseAt = context.currentTime + FADE + 0.01;
    }
  }

  function begin() {
    state = 'starting';
    tries = 0;
    mark = null;
    if (anchor !== null && Math.abs(behind()) > ALIGN) seek(); // a theme that has sounded before goes on where the clock says
    play();
  }

  /** Is the element playing, at the audio clock's rate? Its own clock stands still for a while after a start or a seek, or moves a little and stops. */
  function pacing(now) {
    if (element.readyState < HAVE_FUTURE_DATA) {
      mark = null;
      return false;
    }
    if (mark === null) {
      mark = { at: now, time: element.currentTime };
      return false;
    }
    const elapsed = now - mark.at;
    if (elapsed < STEADY) return false;
    let moved = element.currentTime - mark.time;
    const total = length();
    if (total > 0 && moved < -total / 2) moved += total; // it went round the loop
    if (moved >= 0.5 * elapsed && moved <= 2 * elapsed) return true;
    mark = { at: now, time: element.currentTime }; // a start, a seek, a stall: look again from here
    return false;
  }

  /** Starting: once the element is really playing, and on the playhead (or has had its tries), the sound comes up. */
  function settle(now) {
    if (element.paused) {
      play();
      return;
    }
    if (!pacing(now)) return;
    if (anchor === null) {
      anchor = clock.time - element.currentTime; // the playhead starts where the theme is
    } else {
      const gap = behind();
      if (Math.abs(gap) > ALIGN && tries < TRIES) {
        tries++;
        lead = Math.min(MAX_LEAD, Math.max(0, lead + gap)); // the seek landed late (or early): aim the next one for it
        if (seek()) return;
      }
    }
    mark = null;
    state = 'live';
    fader.to(1, now, FADE);
  }

  /** Live: what is heard follows the playhead, or is brought back to it. */
  function watch(now) {
    if (element.paused) { // the system took the sound away
      state = 'idle';
      fader.to(0, now, FADE);
      return;
    }
    if (Math.abs(behind()) <= DRIFT) return;
    if (clock.time < lenientUntil) { // a lenient window: the playhead goes to the sound, which plays on, unbroken
      anchor = clock.time - element.currentTime;
      return;
    }
    if (now - lastJump < JUMP_GAP) return;
    lastJump = now;
    if (!canSeek(fold(playhead() + lead))) {
      follow(); // no dip: nothing moves
      return;
    }
    state = 'jumping';
    dipEnd = now + DIP;
    fader.to(0, now, DIP);
  }

  const ready = (function open() {
    if (!context || !theme?.src) return Promise.resolve(false);
    return new Promise(resolve => {
      try {
        element = createElement();
        element.preload = 'auto';
        element.loop = true;
        element.addEventListener('loadedmetadata', () => resolve(true), { once: true });
        element.addEventListener('error', () => {
          fail(element.error ?? 'its file would not load');
          resolve(false);
        });
        context.createMediaElementSource(element).connect(fade);
        element.src = new URL(theme.src, base).href;
      } catch (error) {
        fail(error);
        resolve(false);
      }
    });
  }());

  return {
    ready,
    /** The first touch (and any later one, harmlessly): wakes the audio context and starts the element inside the touch, silent; the next frames bring it up. */
    start() {
      if (!context) return;
      started = true;
      blocked = false;
      wake();
      if (element && allowed()) play();
    },
    /** Lowers the theme by 8 dB over 0.3 s while a recorded line plays, and brings it back over the same time when it ends. */
    duck(on) {
      if (Boolean(on) === ducked) return;
      ducked = Boolean(on);
      volume?.to(ducked ? LEVEL * 10 ** (DUCK_DB / 20) : LEVEL, context.currentTime, DUCK_SECONDS);
    },
    /**
     * For the next `seconds` of game time a frame that loses time moves the playhead to the sound instead of the sound to the playhead:
     * no dip and no seek, so nothing is heard twice. main.js opens one round a change of place, whose build and first draws are long
     * frames under the black. Outside it nothing changes. A window already open is only ever lengthened.
     */
    lenient(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError(`A lenient window lasts a number of seconds, not ${seconds}`);
      lenientUntil = Math.max(lenientUntil, clock.time + seconds);
    },
    /** Holds the sound with the game clock (the book is open, the tab is hidden): it fades out at once. Letting go starts it again with the next frame. */
    setPaused(value) {
      paused = Boolean(value);
      if (!context) return;
      if (paused) hush();
      else if (started) wake(); // a tab that comes back may find the system has put sound to sleep
    },
    /**
     * Each frame, after the clock has ticked: starts the sound when it is wanted and not sounding, ends it when it is sounding and
     * no longer wanted (a pause, or the system put the context to sleep), and if the clock has lost time brings the sound back to
     * the playhead.
     */
    update() {
      if (!context || !element) return;
      const now = context.currentTime;
      if (now !== lastAudio) {
        lastAudio = now;
        lastMoved = clock.time;
      }
      stalled = clock.time - lastMoved > STALL;
      if (pauseAt !== null && now >= pauseAt) {
        pauseAt = null;
        if (state === 'idle') element.pause();
      }
      if (!allowed()) {
        hush();
        return;
      }
      if (!awake()) {
        if (state !== 'idle') hush(); // asleep: what it plays is not heard, and its clock would run on
        return;
      }
      if (state === 'idle') begin();
      if (state === 'jumping' && now >= dipEnd) {
        tries = 0;
        state = 'starting';
        seek();
      }
      if (state === 'starting') settle(now);
      else if (state === 'live') watch(now);
    },
    get muted() { return muted; },
    set muted(value) {
      muted = Boolean(value);
      if (muted && context) hush();
    },
    /** Seconds into the theme, in the loop: the game clock's time since the theme first sounded, or the clock's time before. */
    get position() {
      return anchor === null ? clock.time : fold(clock.time - anchor);
    },
  };
}
