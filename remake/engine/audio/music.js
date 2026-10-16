// The theme, "Little Dino Green Valley", looping from a decoded buffer (assets/audio/theme.json says where the file is and how fast
// it goes). The music has a playhead, `position`, and the playhead belongs to the game clock, not to the speakers: it is the clock's
// time since the theme first sounded, folded into the file's length. The forest dances to it, so what it dances to is what is heard,
// and since nothing visual reads the audio's own time, a capture (?t=) sees the same beat on every run. The sound follows the
// playhead, never the other way round:
//   - the first touch wakes the audio context; the next frame starts the theme from its beginning, and the playhead starts with it;
//   - a pause (the book is open, the tab is hidden) or a mute ends the sound at once, and it comes back at the position the clock
//     implies, not where the speakers' time would have put it. Only a frame (update) starts the sound, just after the clock has
//     ticked, so it never starts behind a clock that was late: the audio context takes a moment to wake, and a hidden tab's first
//     frame comes late and the clock counts at most 0.1 s of it;
//   - if the clock loses time (a frame longer than it counts), update brings the sound back to the playhead with a short crossfade:
//     after a long frame the music repeats or skips a moment, at most once a second.
// Before the theme sounds, or when it cannot (no Web Audio, a missing or undecodable file, a browser that wants a touch first), the
// playhead is simply the clock's time, so the forest dances and the captions show all the same.
//
// The file is 351.6 s, which is 556.7 beats, so at each loop the beat grid restarts from the file's own beatOffset.

const LEVEL = 0.6; // the theme's place in the mix, where the old game kept it (dist/audio.js MUSIC_MIX.quiet)
const DUCK_DB = -8; // under a recorded line
const DUCK_SECONDS = 0.3;
const FADE = 0.04; // s: a start, a stop or a jump of the sound fades over this long, so it never clicks
const DRIFT = 0.1; // s: how far the sound may stray from the playhead before it is brought back
const JUMP_GAP = 1; // s of audio time between two such jumps, so a stubborn drift stutters the music at worst once a second

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
 * play through (the context's destination by default).
 *
 * Returns { ready, start, duck, setPaused, update, muted, position }; `ready` is a promise of whether the theme can play.
 * update() must be called every frame, after the clock has ticked: it is what starts the sound.
 */
export function createMusic({ context = null, theme = null, clock, base, output } = {}) {
  if (!clock) throw new TypeError('createMusic needs the game clock: pass `clock` (createClock)');

  let buffer = null; // the decoded theme
  let started = false; // the child has touched the page, so sound is allowed
  let paused = false; // held with the clock
  let muted = false; // a capture's replay
  let ducked = false;
  let anchor = null; // the clock's time when the theme first sounded; null until then
  let voice = null; // what sounds now: { source, fade, fader, at (audio time it began), offset (where in the file) }
  let lastJump = -Infinity;

  const level = context ? context.createGain() : null;
  const volume = level && createFader(level.gain, LEVEL, context.currentTime);
  level?.connect(output ?? context.destination);

  /** A time folded into the file, which is what the playhead is. */
  const fold = time => {
    const length = buffer?.duration ?? 0;
    return length > 0 ? ((time % length) + length) % length : time;
  };

  /** Should the theme be heard right now? */
  const wanted = () => started && !paused && !muted && buffer !== null && context.state === 'running';

  function sound() {
    const now = context.currentTime;
    if (anchor === null) anchor = clock.time; // the playhead starts when the theme does
    const offset = fold(clock.time - anchor);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const fade = context.createGain();
    source.connect(fade);
    fade.connect(level);
    const fader = createFader(fade.gain, 0, now);
    fader.to(1, now, FADE);
    source.start(now, offset);
    voice = { source, fade, fader, at: now, offset };
  }

  function silence() {
    if (!voice) return;
    const { source, fade, fader } = voice;
    voice = null;
    const now = context.currentTime;
    fader.to(0, now, FADE);
    source.stop(now + FADE + 0.01);
    source.onended = () => {
      source.disconnect();
      fade.disconnect();
    };
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

  async function load() {
    if (!context || !theme?.src) return false;
    try {
      const response = await fetch(new URL(theme.src, base).href);
      if (!response.ok) throw new Error(`${response.status} ${response.url || theme.src}`);
      buffer = await context.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      console.warn('The theme cannot play; the forest still dances to its beat.', error);
      return false;
    }
    return true; // the next frame starts it, if the child has touched the page by then
  }

  const ready = load();

  return {
    ready,
    /** The first touch (and any later one, harmlessly): wakes the audio context inside the touch, and the next frame plays the theme from its beginning. */
    start() {
      if (!context) return;
      started = true;
      wake();
    },
    /** Lowers the theme by 8 dB over 0.3 s while a recorded line plays, and brings it back over the same time when it ends. */
    duck(on) {
      if (Boolean(on) === ducked) return;
      ducked = Boolean(on);
      volume?.to(ducked ? LEVEL * 10 ** (DUCK_DB / 20) : LEVEL, context.currentTime, DUCK_SECONDS);
    },
    /** Holds the sound with the game clock (the book is open, the tab is hidden): at once. Letting go starts it again with the next frame. */
    setPaused(value) {
      paused = Boolean(value);
      if (paused) silence();
      else if (started && context) wake(); // a tab that comes back may find the system has put sound to sleep
    },
    /**
     * Each frame, after the clock has ticked: starts the sound when it is wanted and not sounding, ends it when it is sounding and
     * no longer wanted (the system put the context to sleep), and if the clock has lost time brings the sound back to the playhead.
     */
    update() {
      if (!context) return;
      if (!wanted()) {
        silence();
        return;
      }
      if (!voice) {
        sound();
        return;
      }
      const now = context.currentTime;
      if (now - lastJump < JUMP_GAP) return;
      const length = buffer.duration;
      let gap = fold(clock.time - anchor) - fold(voice.offset + (now - voice.at));
      gap -= Math.round(gap / length) * length; // the short way round the loop
      if (Math.abs(gap) <= DRIFT) return;
      lastJump = now;
      silence(); // fades out while the new one fades in
      sound();
    },
    get muted() { return muted; },
    set muted(value) {
      muted = Boolean(value);
      if (muted) silence();
    },
    /** Seconds into the theme, in the loop: the game clock's time since the theme first sounded, or the clock's time before. */
    get position() {
      return anchor === null ? clock.time : fold(clock.time - anchor);
    },
  };
}
