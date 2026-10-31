// The menu of Slóeðla's song game (the lab page), as logic only: no page, no sound. Step 'hver' (who plays: the child's level or
// the grown-ups', three dinosaurs or two), then step 'lag' (a song from the cards), then the round; after it the same song again
// or another. Each action returns cues for the page to carry out:
//   { say: key }   the DJ says a line (dj.js DJ_LINES: hverspilar, hvadalag, lag-<songId>; step 1's picks barn, fullordinn,
//                  thrjar, tvaer; tilbuin while a song loads)
//   { hush: true } the DJ stops the line he is saying
//   { brot: id }   the song's preview plays (brot.js)
//   { stop: true } the preview stops
// A browser lets sound begin only from a tap: until unlock() (the page calls it at the first tap) nothing is said or played, and
// the greeting is said then, once, if the menu is still on its first step. Steps after the songs: 'hlada' while the chosen song
// loads (go() after "Spila!", again() after "Spilum aftur"; a second tap starts nothing), 'umferd' once the round has begun.
// "Spilum saman" (together()): guests join from their phones (fjolspil-song.js); Egill picks his dinosaur first (setMine), and
// the songs wait until he has; a guest who takes a dinosaur is welcomed (joined()); "Spila einn" (alone()) is one player again.

const LEVELS = ['barn', 'fullordinn'];
const ROLES = ['b', 'a', 'c'];

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
    together: false, // "Spilum saman": guests may join
    mine: null, // Egill's dinosaur while together ('b' | 'a' | 'c'), null until he picks
  };
  let greeted = false;
  let playing = null; // the song whose preview is going round (a tap on its card again starts nothing new)
  const loading = () => now.step === 'hlada';
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
    /** A setting: 'stig' (barn | fullordinn) or 'brautir' (3 | 2); the DJ says it (cutting the greeting if it is the first tap). */
    choose(name, value) {
      let say = null;
      if (name === 'stig' && LEVELS.includes(value)) {
        now.level = value;
        say = value;
      }
      if (name === 'brautir') {
        now.lanes = Number(value) === 2 ? 2 : 3;
        say = now.lanes === 2 ? 'tvaer' : 'thrjar';
      }
      return say && now.heard ? [{ hush: true }, { say }] : [];
    },
    toSongs() {
      if (now.together && !now.mine) return null; // Egill picks his dinosaur first
      now.step = 'lag';
      playing = null;
      return heard([{ hush: true }, { say: 'hvadalag' }]);
    },
    pick(id) {
      if (!known(id)) return [];
      if (id === playing) return [];
      now.song = id;
      if (now.heard) playing = id;
      return heard([{ hush: true }, { stop: true }, { say: `lag-${id}` }, { brot: id }]);
    },
    back() {
      now.step = 'hver';
      playing = null;
      return heard([{ hush: true }, { stop: true }, { say: 'hverspilar' }]);
    },
    /** "Spilum saman": the DJ asks friends to join. */
    together() {
      now.together = true;
      return heard([{ hush: true }, { say: 'saman' }]);
    },
    /** "Spila einn": one player again. */
    alone() {
      now.together = false;
      now.mine = null;
      return [{ hush: true }];
    },
    /** Egill's dinosaur while together (null: none). */
    setMine(role) {
      now.mine = ROLES.includes(role) ? role : null;
      return [];
    },
    /** A guest took a dinosaur: the DJ welcomes her (only while together). */
    joined() {
      return now.together ? heard([{ say: 'kom' }]) : [];
    },
    /** What to play ({ song, level, lanes, together, mine }), or null while no song is picked. */
    play() {
      return now.song ? { song: now.song, level: now.level, lanes: now.lanes, together: now.together, mine: now.mine } : null;
    },
    /** "Spila!": the chosen song loads, the DJ gets everyone ready; null with no song picked or while one loads. */
    go() {
      if (!now.song || loading()) return null;
      now.step = 'hlada';
      playing = null;
      return heard([{ hush: true }, { stop: true }, { say: 'tilbuin' }]);
    },
    /** "Spilum aftur": the same song through the short loading, no line; null while one loads. */
    again() {
      if (!now.song || loading()) return null;
      now.step = 'hlada';
      playing = null;
      return [{ hush: true }];
    },
    /** The round has begun. */
    begun() {
      now.step = 'umferd';
    },
    /** After a round: another song. */
    other() {
      now.step = 'lag';
      playing = null;
      return heard([{ say: 'hvadalag' }]);
    },
  };
}
