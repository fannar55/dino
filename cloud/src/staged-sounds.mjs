// The old game's sounds the staged site holds (stage.mjs): the files under dist/assets/audio/ that the game's lines
// (remake/assets/audio/lines.json) point at, and no others of that folder. A line's `src` is an address relative to remake/,
// the page's folder, and is followed here as the browser follows it ("../dist/assets/audio/welcome.mp3" from remake/ is
// dist/assets/audio/welcome.mp3), so nothing depends on how many "../" a line writes. From 12 to 21 November 2026 stage.mjs
// matched "../../dist/..." by a pattern of its own, no line is written so, and the cloud had none of these sounds: Mosi's
// welcome in chapter 1 and every line of Þrívíddarsafnið answered 404 there (tests: test/staged-sounds.test.mjs).
import fs from 'node:fs';
import path from 'node:path';

const PAGE = 'remake'; // the folder of the page whose lines these are, in the repo and in the site
const DIST_AUDIO = 'dist/assets/audio/';

/** The files under dist/assets/audio/ (as paths relative to it) that `lines` (lines.json: { id: { src, ... } }) point at. */
export function distAudioOf(lines) {
  const named = new Set();
  for (const entry of Object.values(lines)) {
    if (typeof entry?.src !== 'string') continue;
    const at = path.posix.normalize(path.posix.join(PAGE, entry.src));
    if (at.startsWith(DIST_AUDIO) && at.length > DIST_AUDIO.length) named.add(at.slice(DIST_AUDIO.length));
  }
  return named;
}

/** Those of `named` (distAudioOf) that are no file under `dir` (the repo's dist/assets/audio), sorted. */
export function missingDistAudio(named, dir) {
  return [...named].filter(rel => !fs.existsSync(path.join(dir, rel))).sort();
}
