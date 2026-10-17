// Plays recorded lines. Browsers allow sound only after the player has touched the page (the start
// button does that); before it, lines still run silently with their captions.
//
// `onSpeaking(on)` is told when a line starts to sound and when it has ended, so the music can lower itself under it
// (main.js ducks the theme). A line that follows another keeps it on, and one the browser will not play never turns it on for long.
export function createVoice({ onSpeaking } = {}) {
  let current = null;
  let muted = false;
  let speaking = false;

  function speak(on) {
    if (on === speaking) return;
    speaking = on;
    onSpeaking?.(on);
  }

  /** The line is over, one way or another: it ended, it was stopped, or it could not be played. */
  function finish(audio) {
    if (current !== audio) return;
    current = null;
    speak(false);
  }

  /** Stop a line: the one `play` returned, or whatever plays when called without one. */
  function stop(sound) {
    if (!current || (sound && sound !== current)) return;
    current.pause();
    current = null;
    speak(false);
  }

  return {
    get muted() { return muted; },
    set muted(value) {
      muted = Boolean(value);
      if (muted) stop();
    },
    /** Play a recording; returns a token for stop(), or null when muted. */
    play(src) {
      if (current) {
        // The newer line replaces it; the music stays down between them instead of swelling and ducking again.
        current.pause();
        current = null;
      }
      if (muted || !src) {
        speak(false);
        return null;
      }
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.addEventListener('ended', () => finish(audio));
      audio.play().catch(error => {
        // A pause that comes before the play request is answered rejects it with AbortError: the line is only paused.
        if (error?.name !== 'AbortError') finish(audio);
      });
      current = audio;
      speak(true);
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
