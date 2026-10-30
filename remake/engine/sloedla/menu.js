// The menu of Slóeðla's song game (the lab page), as logic only: no page, no sound. Step 'hver' (who plays: the child's level or
// the grown-ups', three dinosaurs or two), then step 'lag' (a song from the cards), then the round; after it the same song again
// or another. Each action returns cues for the page to carry out:
//   { say: key }   the DJ says a line (dj.js DJ_LINES: hverspilar, hvadalag, lag-<songId>)
//   { hush: true } the DJ stops the line he is saying
//   { brot: id }   the song's preview plays (brot.js)
//   { stop: true } the preview stops
// A browser lets sound begin only from a tap: until unlock() (the page calls it at the first tap) nothing is said or played, and
// the greeting is said then, once, if the menu is still on its first step.

const LEVELS = ['barn', 'fullordinn'];

/**
 * The menu over `songs` (entries with an `id`), starting from the address or the saved choices (`level`, `lanes`, `song`).
 * `self` (the address's ?sjalf=, a pretend child) opens on the songs with the song picked, for captures and meters.
 */
export function createMenu({ songs, level = 'barn', lanes = 3, song = null, self = false }) {
  const known = id => songs.some(entry => entry.id === id);
  const now = {
    step: self ? 'lag' : 'hver',
    level: LEVELS.includes(level) ? level : 'barn',
    lanes: Number(lanes) === 2 ? 2 : 3,
    song: known(song) ? song : null,
    heard: false,
  };
  let greeted = false;
  const heard = cues => (now.heard ? cues : cues.filter(cue => !('say' in cue) && !('brot' in cue)));

  return {
    state: () => ({ ...now }),
    /** The first tap opened the sound: the greeting, once, if the menu is still on its first step. */
    unlock() {
      if (now.heard) return [];
      now.heard = true;
      if (now.step !== 'hver' || greeted) return [];
      greeted = true;
      return [{ say: 'hverspilar' }];
    },
    /** A setting: 'stig' (barn | fullordinn) or 'brautir' (3 | 2). */
    choose(name, value) {
      if (name === 'stig' && LEVELS.includes(value)) now.level = value;
      if (name === 'brautir') now.lanes = Number(value) === 2 ? 2 : 3;
      return [];
    },
    toSongs() {
      now.step = 'lag';
      return heard([{ hush: true }, { say: 'hvadalag' }]);
    },
    pick(id) {
      if (!known(id)) return [];
      now.song = id;
      return heard([{ hush: true }, { stop: true }, { say: `lag-${id}` }, { brot: id }]);
    },
    back() {
      now.step = 'hver';
      return heard([{ hush: true }, { stop: true }, { say: 'hverspilar' }]);
    },
    /** What to play ({ song, level, lanes }), or null while no song is picked. */
    play() {
      return now.song ? { song: now.song, level: now.level, lanes: now.lanes } : null;
    },
    /** After a round: another song. */
    other() {
      now.step = 'lag';
      return heard([{ say: 'hvadalag' }]);
    },
  };
}
