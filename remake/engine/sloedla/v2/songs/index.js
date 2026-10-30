// The songs of the new kind (v2/format.js) in Slóeðla's song game, by id, in the order the lab offers them after the old ones.
// Each module's default export is a song. A slot whose `file` is not there yet is skipped by the tests.
export const SONGS_V2 = [
  { id: 'pixel', name: 'Pixlaferð', file: 'pixel.js', load: () => import('./pixel.js') },
  { id: 'boogie', name: 'Rokkhopp', file: 'boogie.js', load: () => import('./boogie.js') },
];

/** The v2 song called `id`, or null. */
export async function loadSongV2(id) {
  const entry = SONGS_V2.find(song => song.id === id);
  return entry ? (await entry.load()).default : null;
}
