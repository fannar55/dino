import { DUCK_DB } from '../audio/music.js';

// The sound of "Eitt!" (spec section 9): the table's effects and the game's own music.
//
// The effects are small, bright sounds made on the spot with the game's own tools (engine/audio/sfx.js: tone, noise and bell),
// tuned as the book's are (engine/book/book-sounds.js): every note is a note of the key they are given or an octave of one, the
// game's own music's (assets/audio/eitt/music.json, C major), else the page theme's (engine/audio/game-music.js).
// The table plays them through its own instance of the effects (createGameSfx with `sounds: eittSounds`), which the chapter's hold does
// not reach, so they sound while the chapter stands still behind the game.
//
// The music is a track of its own (assets/audio/eitt/music.mp3, which the owner picked by ear and which is cut to loop): it loops with
// no jump while the game is open, at a gentle level under Kambeðla's and Mosi's lines, ducks while either speaks, and goes through the
// page's audio output. Without the file it is simply quiet. A tablet's speaker is small, so the file is baked small: mono at 16 kHz,
// 64 kbps (1.7 MB), exactly one period of the loop, and it is decoded at its own rate, so the whole track takes 13 MB, not 80.

export const EITT_SFX = ['flick', 'deal', 'shuffle', 'draw', 'wiggle', 'horn', 'swish', 'pop', 'sparkle', 'fanfare', 'tap'];

/** The least time, in audio seconds, between two of the same, for the sounds that come in quick runs or from a child's taps. */
export const EITT_GAPS = { flick: 0.03, deal: 0.03, draw: 0.04, pop: 0.04, wiggle: 0.3, tap: 0.05, horn: 0.25, swish: 0.3, shuffle: 0.5 };

/** One sound per name in EITT_SFX, for createSfx's `sounds`. */
export function eittSounds({ tone, noise, bell, key }) {
  /** A toy horn's note: a soft saw an octave down, a hollow square on the note and a round triangle under both. */
  const horn = (hz, delay, duration, level = 1) => {
    tone({ frequency: hz / 2, duration, level: 0.06 * level, type: 'sawtooth', attack: 0.02, delay, body: 0.6, sustain: 0.8 });
    tone({ frequency: hz, duration, level: 0.035 * level, type: 'square', attack: 0.02, delay, body: 0.6, sustain: 0.7 });
    tone({ frequency: hz / 4, duration, level: 0.06 * level, type: 'triangle', attack: 0.02, delay, body: 0.6, sustain: 0.8 });
  };
  return {
    // A card lands on the table: a papery slap and a low wooden knock on the key's root.
    flick() {
      noise({ kind: 'white', type: 'bandpass', frequency: 2300, end: 1100, q: 1.1, duration: 0.07, level: 0.12, attack: 0.002 });
      tone({ frequency: key[0] / 2, end: key[0] / 4, duration: 0.08, level: 0.08, type: 'triangle', attack: 0.002, body: 0 });
    },
    // A card dealt into a hand: a softer flick.
    deal() {
      noise({ kind: 'white', type: 'bandpass', frequency: 2800, end: 1600, q: 1.2, duration: 0.05, level: 0.07, attack: 0.002 });
      tone({ frequency: key[2], duration: 0.04, level: 0.025, type: 'triangle', attack: 0.002, body: 0 });
    },
    // The deck is shuffled: a riffle of quick papery ticks over a soft whoosh, and a little bell when it is done.
    shuffle() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 900, end: 2200, q: 0.7, duration: 0.75, level: 0.06, attack: 0.25 });
      for (let i = 0; i < 16; i++) {
        noise({ kind: 'white', type: 'bandpass', frequency: 2400 + (i % 4) * 350, q: 2, duration: 0.024, level: 0.045 + 0.02 * ((i * 7) % 3), attack: 0.002, delay: 0.1 + i * 0.036 });
      }
      bell(key[4] * 2, { delay: 0.72, level: 0.03, duration: 0.35 });
    },
    // A card is drawn: it slides off the deck with a rising swish and a soft tick.
    draw() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 700, end: 2600, q: 0.9, duration: 0.2, level: 0.08, attack: 0.05 });
      tone({ frequency: key[2], duration: 0.05, level: 0.04, type: 'triangle', attack: 0.002, body: 0, delay: 0.16 });
    },
    // A card that does not go wiggles: a little wobble between two notes of the key, dying away (the book's wiggle).
    wiggle() {
      for (let i = 0; i < 4; i++) {
        const [from, to] = i % 2 ? [key[2] * 2, key[1] * 2] : [key[1] * 2, key[2] * 2];
        tone({ frequency: from, end: to, duration: 0.075, level: 0.055 - i * 0.01, delay: i * 0.07, type: 'triangle', attack: 0.004 });
      }
    },
    // "Eitt!": a cheerful toy horn, two notes up the key, the second held, and a sparkle on top.
    horn() {
      horn(key[2], 0, 0.13);
      horn(key[4], 0.14, 0.45);
      bell(key[4] * 2, { delay: 0.16, level: 0.035, duration: 0.5 });
    },
    // Her tail swishes: a whoosh through the air one way and back.
    swish() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 300, end: 2600, q: 1.2, duration: 0.3, level: 0.12, attack: 0.12 });
      noise({ kind: 'warm', type: 'bandpass', frequency: 2600, end: 500, q: 1.2, duration: 0.32, level: 0.1, attack: 0.05, delay: 0.27 });
    },
    // An egg pops (a card of a +2 or a +4 lands in a hand): a round bloop dropping an octave, and a tiny crack.
    pop() {
      tone({ frequency: key[4] * 2, end: key[4], duration: 0.09, level: 0.09, attack: 0.003, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 3200, q: 2.5, duration: 0.03, level: 0.06, attack: 0.001 });
    },
    // A colour is chosen: glitter skipping up the key, with a shimmer of air.
    sparkle() {
      [0, 2, 4, 1, 3].forEach((n, i) => bell(key[n] * 2, { delay: i * 0.05, level: 0.04, duration: 0.4 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 5000, end: 9000, q: 1.5, duration: 0.6, level: 0.025, attack: 0.15 });
    },
    // A round is won: a little fanfare up the key on the horn, its last note held, and bells over it.
    fanfare() {
      [[key[0], 0, 0.15], [key[2], 0.15, 0.15], [key[4], 0.3, 0.15], [key[0] * 2, 0.48, 0.95]].forEach(([hz, delay, duration]) => horn(hz, delay, duration, 1.1));
      [...key, key[0] * 2].forEach((hz, i) => bell(hz * 2, { delay: 0.55 + i * 0.07, level: 0.04, duration: i === 5 ? 1 : 0.5 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 5000, end: 8000, q: 1.5, duration: 1, level: 0.02, attack: 0.3, delay: 0.5 });
    },
    // A button: a short wooden tick on a note of the key (the book's tap).
    tap() {
      tone({ frequency: key[4], duration: 0.06, level: 0.09, type: 'triangle', attack: 0.002, body: 0 });
      tone({ frequency: key[4] * 2, duration: 0.03, level: 0.03, attack: 0.002, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2600, q: 2, duration: 0.03, level: 0.04, attack: 0.002 });
    },
  };
}

const MUSIC_LEVEL = 0.3; // gentle: half the theme's place in the mix (music.js LEVEL 0.6), well under the lines
const MUSIC_FADE = 0.25; // s, the time constant it comes up with
const MUSIC_DUCK = 0.1; // s, and dips under a line with
const SILENCE = 1e-4; // a sample this quiet, at the very start or end of the decoded file, is the encoder's padding
const MUSIC_RATE = 16000; // Hz, the rate music.mp3 is baked at: decoded at it, the track stays small (a context's own 48 kHz would be 3 times as big)

/**
 * `bytes` decoded at the file's own rate, which `context.decodeAudioData` would not do: it resamples to the context's rate, so a mono
 * 16 kHz track would swell to 48 kHz (and, for a moment, to twice that). An offline context at the file's rate leaves it as it is;
 * where there is none, the context decodes it as usual.
 */
function decodeAtOwnRate(context, bytes) {
  try {
    if (globalThis.OfflineAudioContext) return new globalThis.OfflineAudioContext(1, 1, MUSIC_RATE).decodeAudioData(bytes);
  } catch { /* the usual way below */ }
  return context.decodeAudioData(bytes);
}

/** Where the music really starts and ends in `buffer` (seconds): the first and the last sample louder than the encoder's padding. */
export function loopOf(buffer, floor = SILENCE) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const loud = i => channels.some(data => Math.abs(data[i]) > floor);
  let first = 0;
  while (first < buffer.length - 1 && !loud(first)) first++;
  let last = buffer.length - 1;
  while (last > first && !loud(last)) last--;
  return { start: first / buffer.sampleRate, end: (last + 1) / buffer.sampleRate };
}

/**
 * The game's music on `context` (an AudioContext, or null: silent), heard through `output`, from `url`. The owner's track is cut so
 * that its end flows into its start, so it must loop with no jump: it is decoded whole, small (13 MB: see the top of this file), once,
 * and kept for the next time the game opens, and played from an AudioBufferSourceNode that loops between the first and the last
 * sound in the file (loopOf), never from an <audio loop>, which leaves a gap. Returns
 *   start()     it plays from its start, looping, and comes up (the game opens); it sounds as soon as it is decoded and the
 *               browser lets sound begin (the first touch)
 *   wake()      a touch: music that was waiting for the first touch, or for a decode, starts now
 *   stop()      it fades out and stops (the game shuts)
 *   duck(on)    it dips by DUCK_DB while Kambeðla or Mosi speaks, and comes back after
 *   muted       silences it
 * A file that is not there, or will not decode, leaves it quiet; the next start() tries the file again.
 */
export function createEittMusic({ context = null, output = null, url } = {}) {
  let buffer = null; // the decoded track, kept
  let span = null; // where it loops: loopOf(buffer)
  let loading = null; // the fetch and decode under way
  let source = null; // the node playing it now
  let fading = null; // the node that is fading out after a stop
  let wanted = false;
  let ducked = false;
  let muted = false;
  const master = context ? context.createGain() : null; // what mutes, ducks and fades it
  if (master) {
    master.gain.value = 0;
    master.connect(output ?? context.destination);
  }

  const level = () => (muted || !wanted ? 0 : ducked ? MUSIC_LEVEL * 10 ** (DUCK_DB / 20) : MUSIC_LEVEL);
  const apply = seconds => master?.gain.setTargetAtTime(level(), context.currentTime, seconds);

  function load() {
    if (!context || !url) return Promise.resolve(null);
    if (buffer) return Promise.resolve(buffer);
    loading ??= fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(bytes => decodeAtOwnRate(context, bytes))
      .then(decoded => {
        buffer = decoded;
        span = loopOf(decoded);
        return decoded;
      })
      .catch(error => {
        loading = null; // tried again on the next start
        console.info('[eitt] No music yet:', error?.message ?? error);
        return null;
      });
    return loading;
  }

  /** A node for the track, looping from its first sound to its last, starting at its first sound. */
  function begin() {
    if (!wanted || muted || !buffer || source) return;
    if (fading) {
      try { fading.stop(); } catch { /* it had stopped */ }
      fading = null;
    }
    source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = span.start;
    source.loopEnd = span.end;
    source.connect(master);
    const now = context.currentTime;
    source.start(now + 0.05, span.start);
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(0, now); // it comes up from silence
    apply(MUSIC_FADE);
  }

  function end(seconds = 0.7) {
    if (!source) return;
    const node = source;
    source = null;
    fading = node;
    node.onended = () => {
      node.disconnect();
      if (fading === node) fading = null;
    };
    try { node.stop(context.currentTime + seconds); } catch { /* it had stopped */ }
  }

  return {
    start() {
      if (!context) return;
      wanted = true;
      if (source) apply(MUSIC_FADE);
      else load().then(() => begin());
    },
    wake() {
      if (wanted && !source) load().then(() => begin());
    },
    stop() {
      if (!wanted) return;
      wanted = false;
      apply(MUSIC_FADE / 2);
      end();
    },
    duck(on) {
      if (Boolean(on) === ducked) return;
      ducked = Boolean(on);
      apply(MUSIC_DUCK);
    },
    get muted() { return muted; },
    set muted(value) {
      muted = Boolean(value);
      if (!context) return;
      apply(MUSIC_DUCK);
      if (muted) end(0.3);
      else if (wanted) begin();
    },
  };
}
