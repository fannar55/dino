// The songs of the new kind (v2/format.js) in Slóeðla's song game, by id, in the order the lab offers them.
// Each module's default export is a song. A slot whose `file` is not there yet is skipped by the tests. `by`, if there, is a line
// the lab shows under the songs while that song is chosen (whose song it is). `brot`: the song time (s) of its preview in the
// menu, its chorus (tools/sloedla-brot.mjs makes its brot.mp3 from there). `card`: its picture in assets/sloedla/valmynd/
// (KREDIT.md), `hue`: the card's glow.
export const SONGS_V2 = [
  { id: 'pixel', name: 'Pixlaferð', card: 'pixel.webp', hue: '#8a5cd6', brot: 17.14, file: 'pixel.js', load: () => import('./pixel.js') },
  { id: 'boogie', name: 'Rokkhopp', card: 'boogie.webp', hue: '#f0a830', brot: 25.6, file: 'boogie.js', load: () => import('./boogie.js') },
  { id: 'fonk', name: 'Fönkhopp', card: 'fonk.webp', hue: '#ff5fb0', brot: 25.26, file: 'fonk.js', load: () => import('./fonk.js') },
  { id: 'stattu-upp', name: 'Stattu upp', by: 'Lag eftir pabba', card: 'stattu-upp.webp', hue: '#ffd76a', brot: 81.23, file: 'stattu-upp.js', load: () => import('./stattu-upp.js') },
];

/** The v2 song called `id`, or null. */
export async function loadSongV2(id) {
  const entry = SONGS_V2.find(song => song.id === id);
  return entry ? (await entry.load()).default : null;
}
