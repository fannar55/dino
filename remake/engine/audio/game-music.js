import { createSfx } from './sfx.js';

// A game with music of its own tunes its effects to that music, not to the page's theme: "Eitt!" plays
// assets/audio/eitt/music.mp3, Háls og hali assets/audio/hals/music.mp3. Beside each track a music.json (written by
// tools/theme-tempo.mjs --file) says its tempo and its key, five notes of its major pentatonic, root first, at its own tuning. A game
// whose track has none (no music yet, or a file that cannot be read) tunes its effects to the page's theme, as every game once did.

/** The URL of the json that describes the track at `musicUrl`: music.json beside music.mp3. */
export function musicJsonUrl(musicUrl) {
  const url = new URL(musicUrl);
  url.pathname = url.pathname.replace(/\.mp3$/i, '.json');
  return url.href;
}

/** The theme a game's effects are tuned to: the page's `theme` with the key of `music` (a music.json) when it has five notes. */
export function tunedTheme(theme, music) {
  const key = music?.key;
  return Array.isArray(key) && key.length >= 5 && key.every(hz => hz > 0) ? { ...(theme ?? {}), key } : theme;
}

/** The music.json of the track at `musicUrl`, or null when there is none to read. */
export async function readMusic(musicUrl) {
  try {
    const response = await fetch(musicJsonUrl(musicUrl));
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * The effects of a game whose music is the track at `music` (its URL): createSfx's object (play, update, stop, setPaused, muted) with
 * `ready`, a promise of whether they are tuned to the music. They start in the page's `theme` and are made again in the music's key
 * as soon as its music.json is read, a moment after the page loads and long before a child can open the game from the book, keeping
 * whether they are muted or held. With no `music`, or no audio context (silent), they are createSfx's own.
 */
export function createGameSfx({ music = null, theme = null, ...options } = {}) {
  let sfx = createSfx({ ...options, theme });
  if (!music || !options.context) return Object.assign(sfx, { ready: Promise.resolve(false) });
  let muted = false;
  let paused = false;
  const ready = readMusic(music).then(json => {
    const tuned = tunedTheme(theme, json);
    if (tuned === theme) return false;
    sfx.stop();
    sfx = createSfx({ ...options, theme: tuned });
    sfx.muted = muted;
    sfx.setPaused(paused);
    return true;
  });
  return {
    ready,
    play: (name, detail) => sfx.play(name, detail),
    update: dt => sfx.update(dt),
    stop: () => sfx.stop(),
    setPaused(value) {
      paused = Boolean(value);
      sfx.setPaused(paused);
    },
    get muted() { return muted; },
    set muted(value) {
      muted = Boolean(value);
      sfx.muted = muted;
    },
  };
}
