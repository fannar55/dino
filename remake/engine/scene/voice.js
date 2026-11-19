// Plays recorded lines. Browsers allow sound only after the player has touched the page (the start
// button does that); before it, lines still run silently with their captions.
//
// `onSpeaking(on)` is told when a line starts to sound and when it has ended, so the music can lower itself under it
// (main.js ducks the theme). A line that follows another keeps it on, and one the browser will not play never turns it on for long.
//
// Over the network a recording asked for at its cue starts late (a page on Cloudflare: a few tenths of a second to two seconds),
// so the scene keeps time with the sound itself: `started(sound)` says when it is heard and `done(sound)` when it is over
// (scene.js sayTask), and `preload(srcs)` fetches a chapter's recordings ahead, in the background, so a line starts the moment it
// is asked for (the owner's bug reports of 2026-10-25: mouths ahead of voices, lines cut short by the next).
//
// A line can come from one side: `play(src, { pan })` (-1 left to 1 right; chapter 4's flight film: her call in a call shot from
// her side as the camera sees her) sends its <audio> through `pan(element, value)`, the page's panner (main.js: output.js
// panElement), which returns its letting go, called when the line is over. With no panner, or a pan of 0, it plays straight out.
export function createVoice({ onSpeaking, fetchFn = (...args) => fetch(...args), makeUrl = blob => URL.createObjectURL(blob), pan = null } = {}) {
  let current = null;
  let muted = false;
  let speaking = false;
  const states = new WeakMap(); // audio -> { started, done, release }
  const ready = new Map(); // src -> an object URL of its bytes, fetched ahead
  const fetching = new Set();

  function speak(on) {
    if (on === speaking) return;
    speaking = on;
    onSpeaking?.(on);
  }

  /** A line's sound is over: its panner let go of (`pan`). */
  function over(state) {
    if (!state) return;
    state.done = true;
    const release = state.release;
    state.release = null;
    release?.();
  }

  /** The line is over, one way or another: it ended, it was stopped, or it could not be played. */
  function finish(audio) {
    over(states.get(audio));
    if (current !== audio) return;
    current = null;
    speak(false);
  }

  /** Stop a line: the one `play` returned, or whatever plays when called without one. */
  function stop(sound) {
    if (!current || (sound && sound !== current)) return;
    const audio = current;
    audio.pause();
    current = null;
    over(states.get(audio));
    speak(false);
  }

  return {
    get muted() { return muted; },
    /** The recording playing now, { src, time }, or null: for the bug report. */
    get current() { return current ? { src: current.src, time: current.currentTime } : null; },
    set muted(value) {
      muted = Boolean(value);
      if (muted) stop();
    },
    /** Play a recording, from one side with `pan` (-1..1); returns a token for stop(), or null when muted. */
    play(src, { pan: side = 0 } = {}) {
      if (current) {
        // The newer line replaces it; the music stays down between them instead of swelling and ducking again.
        const older = current;
        older.pause();
        over(states.get(older));
        current = null;
      }
      if (muted || !src) {
        speak(false);
        return null;
      }
      const audio = new Audio(ready.get(src) ?? src);
      audio.preload = 'auto';
      const state = { started: false, done: false, release: null };
      states.set(audio, state);
      if (pan && Number.isFinite(side) && side !== 0) {
        try {
          state.release = pan(audio, side) ?? null;
        } catch {
          // a panner that cannot take it: the line plays straight out
        }
      }
      audio.addEventListener('playing', () => { state.started = true; }, { once: true });
      audio.addEventListener('ended', () => finish(audio));
      audio.addEventListener('error', () => finish(audio));
      audio.play().catch(error => {
        // A pause that comes before the play request is answered rejects it with AbortError: the line is only paused.
        if (error?.name !== 'AbortError') finish(audio);
      });
      current = audio;
      speak(true);
      return audio;
    },
    stop,
    /** Whether the sound `play` returned is heard yet (its first frames have played). */
    started: sound => states.get(sound)?.started ?? false,
    /** Whether that sound is over: ended, stopped, replaced, or never playable. */
    done: sound => states.get(sound)?.done ?? true,
    /**
     * Fetches these recordings ahead, a few at a time, and plays them from memory afterwards. Nothing waits for it, and a
     * recording that cannot be fetched is simply asked for at its cue as before. Returns when all are tried.
     */
    async preload(srcs, { atOnce = 4 } = {}) {
      const queue = [...new Set(srcs)].filter(src => typeof src === 'string' && src && !ready.has(src) && !fetching.has(src));
      for (const src of queue) fetching.add(src);
      const worker = async () => {
        for (let src = queue.shift(); src !== undefined; src = queue.shift()) {
          try {
            const response = await fetchFn(src);
            if (response.ok) ready.set(src, makeUrl(await response.blob()));
          } catch {
            // left for its cue
          } finally {
            fetching.delete(src);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(atOnce, queue.length) }, worker));
    },
    /** How many recordings are in memory (tests, the bug report). */
    get preloaded() { return ready.size; },
    /** Follow the game clock's pause; a line that has ended is not replayed. */
    setPaused(paused) {
      if (!current) return;
      if (current.ended) {
        finish(current);
        return;
      }
      if (paused) current.pause();
      else current.play().catch(error => {
        if (error?.name !== 'AbortError') finish(current);
      });
    },
  };
}
