// The songs of the new kind (v2/format.js) in Slóeðla's song game, by id, in the order the lab offers them.
// Each module's default export is a song. A slot whose `file` is not there yet is skipped by the tests. `by`, if there, is a line
// the lab shows under the songs while that song is chosen (whose song it is). `brot`: the song time (s) of its preview in the
// menu, its chorus (tools/sloedla-brot.mjs makes its brot.mp3 from there).
export const SONGS_V2 = [
  { id: 'pixel', name: 'Pixlaferð', brot: 17.14, file: 'pixel.js', load: () => import('./pixel.js') },
  { id: 'boogie', name: 'Rokkhopp', brot: 25.6, file: 'boogie.js', load: () => import('./boogie.js') },
  { id: 'fonk', name: 'Fönkhopp', brot: 25.26, file: 'fonk.js', load: () => import('./fonk.js') },
  { id: 'stattu-upp', name: 'Stattu upp', by: 'Lag eftir pabba', brot: 81.23, file: 'stattu-upp.js', load: () => import('./stattu-upp.js') },
];

/** The v2 song called `id`, or null. */
export async function loadSongV2(id) {
  const entry = SONGS_V2.find(song => song.id === id);
  return entry ? (await entry.load()).default : null;
}
