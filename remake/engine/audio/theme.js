// The page's theme (theme.json): the song that plays (its `src`, read against theme.json's own URL: engine/audio/music.js), its
// tempo, measured once by tools/theme-tempo.mjs, which the forest dances to (engine/beat.js), and its key, which the effects tune
// their bells to (engine/audio/sfx.js). Each chapter may name a theme of its own (chapter.theme, a path under assets/audio/):
// chapter 1 plays the default, "Little Dino Green Valley" (theme.json), chapter 2 "Dino Trail" (kafli2/theme.json).
//
// A page reads its theme once, for the chapter it plays (main.js), before the music is made: a chapter hands over to the next by
// loading a new page (?chapter=kafli2), so the theme never changes while a page lives and nothing has to switch songs live.

/** The default theme, under assets/audio/: chapter 1's, and any chapter's that names none. */
export const DEFAULT_THEME = 'theme.json';

/** The URL of `chapter`'s theme.json: its `theme` (DEFAULT_THEME if it names none) read against `audio`, the URL of assets/audio/. */
export function themeUrlOf(chapter, audio) {
  return new URL(chapter?.theme || DEFAULT_THEME, audio);
}

/** theme.json at `url`, or a throw: a file that is missing, is not JSON or has no tempo is no theme. */
async function read(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const theme = await response.json();
  if (!(Number.isFinite(theme?.bpm) && theme.bpm > 0)) throw new Error(`${url} has no tempo (bpm)`);
  return theme;
}

/**
 * Reads the theme for `chapter` from under `audio` (the URL of assets/audio/). Resolves { theme, url }: the theme (null when none
 * can be read) and the URL it came from, which its `src` is read against (createMusic's `base`). A chapter's own theme that cannot
 * be read gives the default instead, said once in the console; with no theme at all the forest sways without the beat.
 */
export async function loadTheme(chapter, audio) {
  const fallback = new URL(DEFAULT_THEME, audio);
  const url = themeUrlOf(chapter, audio);
  if (url.href !== fallback.href) {
    try {
      return { theme: await read(url), url };
    } catch (error) {
      console.warn(`[music] The chapter's theme (${chapter.theme}) could not be read, so the page plays the default theme.`, error);
    }
  }
  try {
    return { theme: await read(fallback), url: fallback };
  } catch {
    console.warn('No theme tempo found; the forest sways without the beat.');
    return { theme: null, url: fallback };
  }
}
