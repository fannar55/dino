// How long the browser keeps the game's files in the cloud. The game's sounds, pictures, models and font keep for a day, so a
// tablet opening the game again does not ask the cloud about each of them; everything else (the code, the pages, the lists
// such as dj.json and the songs' notes) keeps Cloudflare's own answer, public, max-age=0, must-revalidate: the browser asks
// every time and gets a short 304 while the file is unchanged, so a deploy reaches it at once. The cost of the day: a sound
// or a picture changed under the same name can play or show as it was for up to a day on a device that had it already.
//
// The static assets take the day from site/_headers, which stage.mjs writes from headersFile(). The audio paths run the
// Worker first (wrangler.toml), and _headers does not touch the Worker's answers, so worker.mjs gives a sound the day itself.

/** The Cache-Control of a sound, a picture, a model or the font: kept for a day (86,400 seconds). */
export const MEDIA_CACHE = 'public, max-age=86400';

/** The kinds of file that keep for a day: every kind in remake/assets but its lists (.json) and notes (.md, .txt). */
export const MEDIA_FILES = ['mp3', 'wav', 'jpg', 'jpeg', 'png', 'webp', 'svg', 'glb', 'woff2'];

/** Whether an answer of the Worker's is a sound to keep: a whole one (200) or a range of one (206). */
export const isKeptSound = response => (response.status === 200 || response.status === 206)
  && (response.headers.get('content-type') ?? '').startsWith('audio/');

/** site/_headers: one rule per kind of media file, anywhere in the site (a splat matches across folders). */
export function headersFile() {
  const rules = MEDIA_FILES.map(type => `/*.${type}\n  Cache-Control: ${MEDIA_CACHE}\n`);
  return `# Written by cloud/stage.mjs from cloud/src/cache.mjs: media keeps in the browser for a day.\n${rules.join('')}`;
}
