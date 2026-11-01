import { eittSounds, EITT_GAPS } from '../eitt/eitt-sounds.js';
import { SEAT } from './minds.js';

// The sound of "Veiddu" (spec section 6): the table's effects, and the splash of the pond.
//
// The effects are "Eitt!"'s (engine/eitt/eitt-sounds.js): the same small, bright sounds made on the spot, so the card games sound
// like one family, tuned to the key they are given, which is the game's own music's (assets/audio/eitt/music.json, C major: the spec
// says Veiddu plays Eitt!'s music for now). The flick, the draw, the wiggle, the turn chime and the fanfare are Eitt!'s own, taken by
// import; the pair (two flicks and a short bright chord) and the pond's call (a soft rising two-note) are this game's.
// The splash is not made but recorded: two real water sounds from Freesound (assets/veiddu/splash.json), played from decoded buffers
// through the page's output. Egill's fishes make the full one, Mosi's and Uggeðla's the lighter, and quieter, one.
//
// What sounds where is the table's (table.js): a card laid in a hand or a catch is a flick, a card taken from the pond a draw and a
// splash, a pair is a pair, a card that does not go a wiggle, the pond calling when the child must fish a call, the round won a fanfare.
// The turn chime is for a phone on a table (Fjölspil), as in Eitt!; the big screen has the lines to say whose turn it is.

export const VEIDDU_SFX = ['flick', 'draw', 'pair', 'wiggle', 'pond-call', 'turn', 'fanfare'];

/** The least time, in audio seconds, between two of the same: Eitt!'s for the ones it has, and a pair or a call never doubles. */
export const VEIDDU_GAPS = { flick: EITT_GAPS.flick, draw: EITT_GAPS.draw, pair: 0.25, wiggle: EITT_GAPS.wiggle, 'pond-call': 1.2, turn: EITT_GAPS.turn };

/** The tools of createSfx with every sound they make put off by `seconds`, so one of Eitt!'s sounds can be laid later inside another. */
function putOff({ tone, noise, bell, key }, seconds) {
  const later = options => ({ ...options, delay: (options?.delay ?? 0) + seconds });
  return { key, tone: options => tone(later(options)), noise: options => noise(later(options)), bell: (hz, options) => bell(hz, later(options)) };
}

/** One sound per name in VEIDDU_SFX, for createSfx's `sounds`. A flick takes `{ soft: true }` for a card laid down gently (a deal). */
export function veidduSounds(tools) {
  const { tone, bell, key } = tools;
  const eitt = eittSounds(tools);
  return {
    // A card lands: Eitt!'s flick, or its softer deal for a card dealt, picked up or laid in a catch.
    flick: detail => (detail?.soft ? eitt.deal() : eitt.flick()),
    // A card slides off the pond: Eitt!'s swish and tick.
    draw: () => eitt.draw(),
    // Two cards meet and snap together: two of Eitt!'s flicks one on the other, then a short bright chord up the key.
    pair() {
      eittSounds(putOff(tools, 0)).flick();
      eittSounds(putOff(tools, 0.075)).flick();
      [0, 2, 4].forEach((n, i) => bell(key[n] * 2, { delay: 0.13 + i * 0.012, level: 0.05, duration: 0.5 }));
      bell(key[0] * 4, { delay: 0.15, level: 0.025, duration: 0.35 });
    },
    // A card that does not go wiggles: Eitt!'s wobble between two notes of the key.
    wiggle: () => eitt.wiggle(),
    // The pond calls the child to fish: a soft rising two-note, two bells a step up the key, over a round low note.
    'pond-call'() {
      bell(key[2] * 2, { level: 0.045, duration: 0.4 });
      bell(key[4] * 2, { delay: 0.17, level: 0.05, duration: 0.75 });
      tone({ frequency: key[2], duration: 0.5, level: 0.03, type: 'triangle', attack: 0.02, body: 0.5, sustain: 0.6 });
    },
    // It becomes her turn (a phone on a table, Fjölspil): Eitt!'s three bells climbing the key.
    turn: () => eitt.turn(),
    // The round is won: Eitt!'s fanfare up the key on the toy horn, with bells over it.
    fanfare: () => eitt.fanfare(),
  };
}

// ---- The splash -------------------------------------------------------------------------------------------------------------

/**
 * The splashes, by name: the file (in assets/veiddu/, described by splash.json) and the gain it plays at into the page's output. Both
 * files are levelled to the same peak, but the plop is one short, round burst and the splash a spread of noise, so at the same peak the
 * plop is the louder to the ear: measured in a recorded round (veiddu-video.mjs --sound, 400 ms RMS), 0.55 and 0.3 made the plop 2 dB
 * louder than the splash, which is not what "quieter" means; 0.55 and 0.12 put it about 6 dB under it. The splash is then about as loud
 * as a pair's chime, 8 dB over the music and 7 dB under a recorded line. The owner judges both by ear.
 */
export const SPLASHES = {
  full: { file: 'splash.mp3', level: 0.55 },
  soft: { file: 'splash-soft.mp3', level: 0.12 },
};

/** Which splash a fish of `seat` makes: Egill's (the child's seat) the full one, Uggeðla's and Mosi's the soft one. */
export const splashFor = seat => (seat === SEAT.child ? 'full' : 'soft');

const SPLASH_SPREAD = 0.05; // each splash is played up to this much faster or slower than the last, so a round of fishing is not one sound again and again

/**
 * The pond's splash on `context` (null: silent), heard through `output`. `urls` says where each of SPLASHES' files is
 * ({ full, soft }, from assets/veiddu/). Returns
 *   load()      fetches and decodes both, once (the game opens); a file that is not there, or will not decode, is simply not heard
 *   play(seat)  the splash of a fish by `seat`; whether it sounded (not before it has loaded, nor muted, nor on a page the browser
 *               has not yet let sound begin)
 *   muted       silences it
 */
export function createSplash({ context = null, output = null, urls = {}, random = Math.random } = {}) {
  const buffers = new Map();
  let loading = null;
  let muted = false;

  function load() {
    if (!context) return Promise.resolve();
    loading ??= Promise.all(Object.keys(SPLASHES).map(name => Promise.resolve()
      .then(() => globalThis.fetch(urls[name]))
      .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${urls[name]}: ${response.status}`))))
      .then(bytes => context.decodeAudioData(bytes))
      .then(buffer => buffers.set(name, buffer))
      .catch(error => console.info('[veiddu] No splash yet:', error?.message ?? error)))).then(() => undefined);
    return loading;
  }

  return {
    load,
    play(seat) {
      const name = splashFor(seat);
      const buffer = buffers.get(name);
      if (!context || muted || !buffer || context.state !== 'running') return false;
      const source = context.createBufferSource();
      source.buffer = buffer;
      if (source.playbackRate) source.playbackRate.value = 1 + (random() * 2 - 1) * SPLASH_SPREAD;
      const volume = context.createGain();
      volume.gain.value = SPLASHES[name].level;
      source.connect(volume);
      volume.connect(output ?? context.destination);
      source.onended = () => {
        source.disconnect();
        volume.disconnect();
      };
      source.start(context.currentTime);
      return true;
    },
    get muted() { return muted; },
    set muted(value) { muted = Boolean(value); },
  };
}
