// Plays recorded lines. Browsers allow sound only after the player has touched the page (the start
// button does that); before it, lines still run silently with their captions.
export function createVoice() {
  let current = null;
  let muted = false;

  /** Stop a line: the one `play` returned, or whatever plays when called without one. */
  function stop(sound) {
    if (!current || (sound && sound !== current)) return;
    current.pause();
    current = null;
  }

  return {
    get muted() { return muted; },
    set muted(value) {
      muted = Boolean(value);
      if (muted) stop();
    },
    /** Play a recording; returns a token for stop(), or null when muted. */
    play(src) {
      stop();
      if (muted || !src) return null;
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.addEventListener('ended', () => { if (current === audio) current = null; });
      audio.play().catch(() => {});
      current = audio;
      return audio;
    },
    stop,
    /** Follow the game clock's pause; a line that has ended is not replayed. */
    setPaused(paused) {
      if (!current || current.ended) return;
      if (paused) current.pause();
      else current.play().catch(() => {});
    },
  };
}
