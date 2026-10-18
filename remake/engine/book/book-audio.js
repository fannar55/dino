import { createVoice } from '../scene/voice.js';
import { createSfx } from '../audio/sfx.js';
import { DUCK_DB } from '../audio/music.js';
import { Handle, DONE } from '../handle.js';
import { bookSounds, BOOK_GAPS } from './book-sounds.js';

// The book's sound (spec sections 3.3 and 3.5): the narrator, who reads a card's pages, and the book's small effects.
//
// Both are the book's own instances of the chapter's parts: a voice (engine/scene/voice.js) and the effects
// (engine/audio/sfx.js) with the book's sounds (book-sounds.js). Neither is in main.js's hold, so both sound while the game
// stands still behind the child's book; main.js mutes them wherever it mutes the game's sound (captures and review shots).
// The effects pass a gain of their own, which dips by DUCK_DB while the narrator speaks, as the music does under a line.
//
// A line the narrator has no recording for (not in lines.json yet: the recordings come with Task 12) is silent: its Handle is done
// at once, and it is said once in the console.

const DIP_SECONDS = 0.08; // how quickly the effects dip under the narrator and come back (a time constant)

/**
 * The book's narrator and effects on `context` (an AudioContext, or null for silent effects), heard through `output`, tuned to
 * `theme` (theme.json) and reading recordings from `lines` (lines.json). Returns
 *   narrate(lineId)  plays the line's recording; its Handle is done when the recording ends and cancelled by stop(), by the next
 *                    narrate, or by muting. A line with no recording gives DONE (and stops what was playing).
 *   stop()           ends the narration
 *   sfx(name)        plays a sound in BOOK_SFX; says whether it did (not muted, sound allowed, not too soon after the last)
 *   muted            silences both, and ends the narration
 */
export function createBookAudio({ context = null, output = null, theme = null, lines = {} } = {}) {
  let muted = false;
  let line = null; // the narration going on: { handle }
  const warned = new Set();

  const own = context ? context.createGain() : null; // the effects' own gain, which dips under the narrator
  if (own) {
    own.gain.value = 1;
    own.connect(output ?? context.destination);
  }
  const effects = createSfx({ context, theme, output: own, sounds: bookSounds, gaps: BOOK_GAPS });

  function dip(on) {
    own?.gain.setTargetAtTime(on ? 10 ** (DUCK_DB / 20) : 1, context.currentTime, DIP_SECONDS);
  }

  /** The line is over: its recording ended (done), or it was stopped or replaced (cancelled). The caller sees to the voice. */
  function end(cancelled) {
    const over = line;
    if (!over) return;
    line = null;
    if (cancelled) over.handle.cancel();
    else over.handle.finish();
  }

  const voice = createVoice({
    onSpeaking: on => {
      dip(on);
      if (!on) end(false); // the recording ended, or the browser would not play it: either way the line is done
    },
  });

  function stop() {
    end(true);
    voice.stop();
  }

  function narrate(lineId) {
    const src = lines?.[lineId]?.src;
    if (!src) {
      if (!warned.has(lineId)) {
        warned.add(lineId);
        console.warn(`[book] no recording for ${lineId}`);
      }
      stop();
      return DONE;
    }
    end(true); // the line before gives way, and the voice replaces its sound below without a gap in the dip
    if (muted) return DONE;
    const handle = new Handle(`book:${lineId}`, () => {
      if (line?.handle !== handle) return; // already over
      line = null;
      voice.stop();
    });
    line = { handle };
    voice.play(src);
    return handle;
  }

  return {
    narrate,
    stop,
    sfx: name => effects.play(name),
    get muted() { return muted; },
    set muted(value) {
      muted = Boolean(value);
      if (muted) stop();
      voice.muted = muted;
      effects.muted = muted;
    },
  };
}
