// A song of a chapter's own, beside the page's theme (engine/audio/music.js): chapter 4's flight song, which plays with the flight
// wherever in the chapter the flight starts. It is a music of its own that plays once (loop: false), so it is everything the theme
// is: streamed, on the game clock (a seek lands on the same note every run, and a lenient window lets it ride the slow second at the
// falls), dipped 8 dB under every recorded line and held with the rest of the game's sound (engine/audio/hold.js). It is silent until
// the scene plays it: play(at) puts it `at` seconds in now and lets it sound. At its end it is done, and nothing starts it again.
//
// A browser lets an element start from a touch only, or once the page has had one; the song is played after the start button, so it
// may start at once, and if it was refused the next touch starts it (touch(), which main.js gives every chapter sound on a touch).
import { createMusic } from './music.js';

/**
 * The song in `src` (read against `base`, the URL of its folder) on `context` (an AudioContext, or null: a playhead and nothing
 * else), following the game `clock`, through `output`. `speaking()` says whether a recorded line sounds now (it dips under it).
 * `createElement` makes the <audio> element (a test gives it a fake).
 *
 * Returns { ready, play, update, touch, setPaused, setLevel, lenient, stop, playing, position }. update() must be called every frame
 * while it plays, after the clock has ticked.
 */
export function createSong({ context = null, clock, src, base, output = null, speaking = () => false, createElement } = {}) {
  const music = createMusic({
    context, theme: src ? { src } : null, clock, base, output, loop: false, ...(createElement ? { createElement } : {}),
  });
  let playing = false; // the scene has played it
  let done = false; // it has played to its end, or was stopped
  let held = false; // the game holds its sound (the book is open, the tab is hidden)
  let stopAt = null; // the clock's time a stop's fade is over
  const quiet = () => music.setPaused(held || !playing || done);
  quiet();

  return {
    ready: music.ready,
    /** Starts the song now, `at` seconds into it, on the game clock. Once only: a song that played is not played again. */
    play(at = 0) {
      if (playing || done) return;
      playing = true;
      music.cue(at);
      quiet();
      music.start();
    },
    /** Each frame while it plays, after the clock has ticked: the sound follows the playhead, dips under a line, and ends. */
    update() {
      if (!playing || done) return;
      music.duck(Boolean(speaking()));
      music.update();
      if (music.over || (stopAt !== null && clock.time >= stopAt)) {
        done = true;
        quiet();
      }
    },
    /** A touch: a song the browser would not start without one starts now. */
    touch() {
      if (playing && !done) music.start();
    },
    /** Held with the game: silent at once, and back on its playhead when let go. */
    setPaused(value) {
      held = Boolean(value);
      quiet();
    },
    /** Its level against its place in the mix (1, the theme's), over `seconds`; the dip under a line works on top. */
    setLevel: (value, seconds) => music.setLevel(value, seconds),
    /** For the next `seconds` of game time its playhead follows the sound (engine/audio/music.js: lenient). */
    lenient: seconds => music.lenient(seconds),
    /** Fades it out over `seconds`, and it is done. */
    stop(seconds = 1) {
      if (!playing || done) return;
      music.setLevel(0, seconds);
      stopAt = clock.time + Math.max(0, seconds);
    },
    /** Played and not yet done. */
    get playing() { return playing && !done; },
    /** Seconds into the song: the game clock's time since its cue. */
    get position() { return music.position; },
  };
}
