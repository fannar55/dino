export const GAME_SPECIES = ['stegosaurus','brachiosaurus','trex','spinosaurus','parasaurolophus','pteranodon'];

// A new optional collection lives alongside the original adventure save.
export function restoreGames(raw, found) {
  const games = {};
  for (const id of GAME_SPECIES) {
    const wins = raw?.[id]?.wins;
    if (found.includes(id) && Number.isSafeInteger(wins) && wins > 0) games[id] = {wins: Math.min(wins,9999)};
  }
  return games;
}
export function awardStatue(state, species) {
  if (!GAME_SPECIES.includes(species) || !state.found.includes(species)) return state;
  return {...state, games: {...state.games, [species]: {wins: Math.min(9999,(state.games?.[species]?.wins || 0)+1)}}};
}
export const statueCount = state => GAME_SPECIES.filter(id => state.games?.[id]?.wins > 0).length;
