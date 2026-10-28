// The songs of Slóeðla's song game, by id, in the order the lab offers them. Each module's default export is a song (song.js).
export const SONGS = [
  { id: 'stjornudans', name: 'Stjörnudans', load: () => import('./stjornudans.js') },
  { id: 'nordurljos', name: 'Norðurljós', load: () => import('./nordurljos.js') },
  { id: 'thrumutaktur', name: 'Þrumutaktur', load: () => import('./thrumutaktur.js') },
  { id: 'hus', name: 'Ljósahús', load: () => import('./hus.js') },
];

/** The song called `id`, or the first one. */
export async function loadSong(id) {
  const entry = SONGS.find(song => song.id === id) ?? SONGS[0];
  return (await entry.load()).default;
}
