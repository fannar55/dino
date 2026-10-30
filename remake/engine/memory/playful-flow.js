// Child-facing intent, kept separate from the physical puzzle prerequisites.
// Mosi's hint for each moment; the child taps the obstacle that glows and picks the friend himself,
// so a hint names the obstacle, never the friend who can do it. `target` is the obstacle the gold
// arrow may point at when the child hesitates (only once that friend is found and home); the crossing
// and the walk to the grove start on their own (`automatic`). `memory` is the rules' state with `giftsLeft` (gift pairs not found yet),
// `giftsLanding` (found, still flying to the basket) and `seek` (the words for a gift's other half, when one leaf is open); a missing count is 0.
const HELPERS = ['triceratops', 'brontosaurus', 'stegosaurus'];
const ACTIVE = {
  lift: 'Upp með greinina!', roll: 'Þríhyrnurnar koma að bolnum!', cross: 'Allir með yfir brúna!',
  lay: 'Þær bera börkinn saman. Ein fjöl í einu!', finish: 'Nú komast allir yfir. Berin bíða okkar!',
};
export function nextStoryStep(memory, bridge, ready = {}) {
  if (bridge.active) return { key: `doing-${bridge.active}`, kind: 'action', prompt: ACTIVE[bridge.active] };
  if (bridge.failing) return { key: 'trying', kind: 'action', prompt: 'Sjáum hvað gerist!' };
  if (bridge.visited) return { key: 'home', kind: 'celebrate', prompt: 'Öll komumst við! Vel gert!' };
  if (bridge.asking) return { key: `who-${bridge.asking}`, kind: 'choose', target: bridge.asking, prompt: 'Hver getur þetta?' };
  const has = species => bridge.unlocked.includes(species);
  const work = (action, target, species, prompt) => ({
    key: `${action}-${ready[species] ? 'ready' : 'arriving'}`, kind: ready[species] ? 'work' : 'arriving',
    action, target, species, prompt: ready[species] ? prompt : 'Vinirnir eru á leiðinni! Þú mátt skoða fleiri lauf.',
    available: Boolean(ready[species]),
  });
  if (bridge.boardwalkBuilt) return { key: 'walkway-open', kind: 'travel', action: 'finish', target: 'grove', prompt: 'Leiðin er opin. Förum saman!', automatic: true, available: true };
  if (bridge.atStaging) return work('lay', 'bark', 'stegosaurus', 'Mýrin er mjúk. Hver getur byggt leið yfir?');
  if (bridge.bridgeBuilt) {
    if (HELPERS.every(has) && HELPERS.every(species => ready[species])) {
      // The crossing waits for every gift pair (the leaves are behind the camera after it): the gold arrow points at a shut leaf (`leaf`),
      // and while the last pair is still flying to the basket it only waits.
      if (memory.giftsLeft > 0) return { key: 'gifts-left', kind: 'search', leaf: true, prompt: 'Finnum fyrst gjafirnar sem eru eftir!', available: true };
      if (memory.giftsLanding > 0) return { key: 'gifts-landing', kind: 'arriving', prompt: 'Gjafirnar fara í körfuna!' };
      return { key: 'bridge-open', kind: 'travel', action: 'cross', target: 'staging', prompt: 'Brúin er tilbúin. Allir með!', automatic: true, available: true };
    }
    if (HELPERS.every(has)) return { key: 'friends-arriving', kind: 'arriving', prompt: 'Brúin er tilbúin! Vinirnir eru að koma.' };
    return { key: 'gather-friends', kind: 'search', prompt: 'Brúin er tilbúin! Finnum vinina sem vantar.' };
  }
  if (bridge.branch === 'held') {
    if (has('triceratops')) return work('roll', 'log', 'triceratops', 'Stóri bolurinn getur orðið að brú. Hver getur ýtt honum?');
    return { key: 'find-pushers', kind: 'search', prompt: 'Hver getur ýtt bolnum? Finnum fleiri vini!' };
  }
  if (has('brontosaurus')) return work('lift', 'branch', 'brontosaurus', 'Greinin er fyrir. Hver nær upp að henni?');
  return { key: 'find-friends', kind: 'search', prompt: memory.phase === 'one-open' ? memory.seek ?? 'Hvar er vinur hans?' : 'Kíktu undir lauf. Finndu tvo eins vini!' };
}
