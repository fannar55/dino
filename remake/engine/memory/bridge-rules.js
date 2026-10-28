/** Cooperative bridge puzzle. The world owns motion; the controller gates memory turns. */
export const BRIDGE_HELPERS = Object.freeze(['triceratops', 'brontosaurus', 'stegosaurus']);
export const BRIDGE_ACTIONS = Object.freeze(['lift', 'lower', 'roll', 'cross', 'lay', 'finish']);

export function createBridgeAdventure() {
  let unlocked = [], selected = null, active = null, branch = 'down', bridgeBuilt = false;
  let atStaging = false, boardwalkBuilt = false, visited = false;
  const phase = () => visited ? 'complete' : active ? 'busy' : !unlocked.length ? 'locked' : selected ? 'selected' : 'available';
  function can(id) {
    if (active || visited) return false;
    if (id === 'cross') return bridgeBuilt && !atStaging && BRIDGE_HELPERS.every(species => unlocked.includes(species));
    if (id === 'lay') return atStaging && !boardwalkBuilt && selected === 'stegosaurus';
    if (id === 'finish') return boardwalkBuilt;
    if (id === 'lift') return selected === 'brontosaurus' && branch === 'down' && !bridgeBuilt;
    if (id === 'lower') return selected === 'brontosaurus' && branch === 'held' && !atStaging;
    if (id === 'roll') return selected === 'triceratops' && branch === 'held' && !bridgeBuilt;
    return false;
  }
  return Object.freeze({
    getState() {
      return Object.freeze({ unlocked: Object.freeze([...unlocked]), selected, active, branch, bridgeBuilt, atStaging, boardwalkBuilt, visited, phase: phase() });
    },
    unlock(species) {
      if (!BRIDGE_HELPERS.includes(species) || unlocked.includes(species)) return false;
      unlocked.push(species); return true;
    },
    select(species) {
      if (active || visited || (species !== null && !unlocked.includes(species))) return false;
      const next = species === selected ? null : species;
      if (next === selected) return false;
      selected = next; return true;
    },
    can,
    choose(id) {
      if (!can(id)) return false;
      active = id; return true;
    },
    complete(id) {
      if (active === null || id !== active) return false;
      if (id === 'lift') branch = 'held';
      if (id === 'lower') branch = 'down';
      if (id === 'roll') bridgeBuilt = true;
      if (id === 'cross') { branch = 'down'; atStaging = true; }
      if (id === 'lay') boardwalkBuilt = true;
      if (id === 'finish') visited = true;
      active = null; selected = null; return true;
    },
    cancel(id, { branch: physicalBranch } = {}) {
      if (active === null || id !== active) return false;
      // Crossing can release the branch before its approach is found blocked.
      // Preserve completed construction, but never grant arrival or a reward.
      if (id === 'cross' && physicalBranch === 'down') branch = 'down';
      active = null; selected = null; return true;
    },
    restart() {
      unlocked = []; selected = null; active = null; branch = 'down'; bridgeBuilt = false;
      atStaging = false; boardwalkBuilt = false; visited = false; return true;
    },
  });
}
