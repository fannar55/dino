// Child-facing intent, kept separate from the physical puzzle prerequisites.
// The child chooses meaningful work; finished paths lead into the next clearing.
const HELPERS = ['triceratops', 'brontosaurus', 'stegosaurus'];
const ACTIVE = {
  lift: 'Upp með greinina!', lower: 'Setjum greinina varlega niður.',
  roll: 'Einn, tveir, ýtum!', cross: 'Allir með yfir brúna!',
  lay: 'Saman byggjum við leið!', finish: 'Áfram í berjalundinn!',
};
export function nextStoryStep(memory, bridge, ready = {}) {
  if (bridge.active) return { key: `doing-${bridge.active}`, kind: 'action', prompt: ACTIVE[bridge.active] };
  if (bridge.visited) return { key: 'home', kind: 'celebrate', prompt: 'Öll komumst við! Vel gert!' };
  const has = species => bridge.unlocked.includes(species);
  const work = (action, target, species, label, prompt) => ({
    key: `${action}-${ready[species] ? 'ready' : 'arriving'}`, kind: ready[species] ? 'work' : 'arriving',
    action, target, species, label, prompt: ready[species] ? prompt : 'Vinirnir eru á leiðinni! Þú mátt skoða fleiri lauf.',
    available: Boolean(ready[species]),
  });
  if (bridge.boardwalkBuilt) return { key: 'walkway-open', kind: 'travel', action: 'finish', target: 'grove', label: 'Til berjanna!', prompt: 'Leiðin er opin. Förum saman!', automatic: true, available: true };
  if (bridge.atStaging) return work('lay', 'bark', 'stegosaurus', 'Byggjum leið!', 'Mýrin er mjúk. Berum börkinn saman!');
  if (bridge.bridgeBuilt) {
    if (HELPERS.every(has) && HELPERS.every(species => ready[species])) return { key: 'bridge-open', kind: 'travel', action: 'cross', target: 'staging', label: 'Förum yfir!', prompt: 'Brúin er tilbúin. Allir með!', automatic: true, available: true };
    if (HELPERS.every(has)) return { key: 'friends-arriving', kind: 'arriving', prompt: 'Brúin er tilbúin! Vinirnir eru að koma.' };
    return { key: 'gather-friends', kind: 'search', prompt: 'Brúin er tilbúin! Finnum vinina sem vantar.' };
  }
  if (bridge.branch === 'held') {
    if (has('triceratops')) return work('roll', 'log', 'triceratops', 'Ýtum saman!', 'Stóri bolurinn getur orðið að brú!');
    return { key: 'find-pushers', kind: 'search', prompt: 'Hver getur ýtt bolnum? Finnum fleiri vini!' };
  }
  if (has('brontosaurus')) return work('lift', 'branch', 'brontosaurus', 'Lyftum greininni!', 'Greinin er fyrir. Þórseðlurnar geta hjálpað!' );
  return { key: 'find-friends', kind: 'search', prompt: memory.phase === 'one-open' ? 'Hvar er vinur hans?' : 'Kíktu undir lauf. Finndu tvo eins vini!' };
}
