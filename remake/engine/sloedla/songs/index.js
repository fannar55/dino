// The songs of Slóeðla's song game, by id, in the order the lab offers them. Each module's default export is a song (song.js).
// The song contest (2026-10-29): two songs over ElevenLabs Music recordings and three by builder agents, each in a file of its own
// (`file`; a slot whose file is not there yet is skipped by the tests, and its button just does not load).
export const SONGS = [
  { id: 'stjornudans', name: 'Stjörnudans', load: () => import('./stjornudans.js') },
  { id: 'nordurljos', name: 'Norðurljós', load: () => import('./nordurljos.js') },
  { id: 'thrumutaktur', name: 'Þrumutaktur', load: () => import('./thrumutaktur.js') },
  { id: 'hus', name: 'Ljósahús', load: () => import('./hus.js') },
  { id: 'keppni-el1', name: 'Risaeðlurokk', file: 'keppni-el1.js', load: () => import('./keppni-el1.js') },
  { id: 'keppni-el2', name: 'Lúðrapartí', file: 'keppni-el2.js', load: () => import('./keppni-el2.js') },
  { id: 'smidur-a', name: 'Hopp og hí!', file: 'smidur-a.js', load: () => import('./smidur-a.js') },
  { id: 'smidur-b', name: 'Hoppsasa!', file: 'smidur-b.js', load: () => import('./smidur-b.js') },
  { id: 'smidur-c', name: 'Risakarnival', file: 'smidur-c.js', load: () => import('./smidur-c.js') },
];

/** The song called `id`, or the first one. */
export async function loadSong(id) {
  const entry = SONGS.find(song => song.id === id) ?? SONGS[0];
  return (await entry.load()).default;
}
