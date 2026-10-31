/** Cooperative bridge puzzle. The world owns motion; the controller gates memory turns. */
export const BRIDGE_HELPERS = Object.freeze(['triceratops', 'brontosaurus', 'stegosaurus']);
export const BRIDGE_ACTIONS = Object.freeze(['lift', 'roll', 'cross', 'lay', 'finish']);
// The obstacles the child asks "Hver getur þetta?" about, and the one pair that can do each.
export const BRIDGE_OBSTACLES = Object.freeze({
  branch: Object.freeze({ species: 'brontosaurus', action: 'lift' }),
  log: Object.freeze({ species: 'triceratops', action: 'roll' }),
  bark: Object.freeze({ species: 'stegosaurus', action: 'lay' }),
});

/**
 * Choosing by obstacle: next() is the obstacle that glows; ask(target) answers a tap on an obstacle
 * ({ kind: 'choose', candidates } opens the bubbles, 'not-yet' and 'find-first' are Mosi's hints, null
 * means the tap is ignored); pick(species) answers a bubble ({ kind: 'start', action } or { kind: 'fail' },
 * null when ignored); failDone() brings the bubbles back after a wrong friend's attempt; dismiss() closes
 * them. Candidates are the found pairs that are free: the brontos holding the branch are busy.
 */
export function createBridgeAdventure() {
  let unlocked = [], selected = null, active = null, branch = 'down', bridgeBuilt = false;
  let atStaging = false, boardwalkBuilt = false, visited = false, asking = null, failing = null;
  const busy = species => species === 'brontosaurus' && branch === 'held';
  const free = () => unlocked.filter(species => !busy(species));
  const phase = () => visited ? 'complete' : active ? 'busy' : failing ? 'failing' : asking ? 'choosing' : !unlocked.length ? 'locked' : selected ? 'selected' : 'available';
  function next() {
    if (visited || boardwalkBuilt) return null;
    if (atStaging) return 'bark';
    if (bridgeBuilt) return null;
    return branch === 'held' ? 'log' : 'branch';
  }
  function can(id) {
    if (active || visited) return false;
    if (id === 'cross') return bridgeBuilt && !atStaging && BRIDGE_HELPERS.every(species => unlocked.includes(species));
    if (id === 'lay') return atStaging && !boardwalkBuilt && selected === 'stegosaurus';
    if (id === 'finish') return boardwalkBuilt;
    if (id === 'lift') return selected === 'brontosaurus' && branch === 'down' && !bridgeBuilt;
    if (id === 'roll') return selected === 'triceratops' && branch === 'held' && !bridgeBuilt;
    return false;
  }
  return Object.freeze({
    getState() {
      return Object.freeze({ unlocked: Object.freeze([...unlocked]), free: Object.freeze(free()), selected, active, branch, bridgeBuilt, atStaging, boardwalkBuilt, visited,
        next: next(), asking: asking?.target ?? null, candidates: Object.freeze([...(asking?.candidates ?? [])]), failing, phase: phase() });
    },
    unlock(species) {
      if (!BRIDGE_HELPERS.includes(species) || unlocked.includes(species)) return false;
      unlocked.push(species); return true;
    },
    select(species) {
      if (active || visited || asking || failing || (species !== null && !unlocked.includes(species))) return false;
      const next = species === selected ? null : species;
      if (next === selected) return false;
      selected = next; return true;
    },
    next,
    ask(target) {
      if (active || failing || visited || !Object.hasOwn(BRIDGE_OBSTACLES, target)) return null;
      if (target !== next()) return { kind: 'not-yet' };
      const candidates = free();
      if (!candidates.length) { asking = null; return { kind: 'find-first' }; }
      asking = { target, candidates }; selected = null;
      return { kind: 'choose', candidates: [...candidates] };
    },
    pick(species) {
      if (!asking || active || failing || !asking.candidates.includes(species)) return null;
      const right = BRIDGE_OBSTACLES[asking.target];
      if (species !== right.species) { failing = species; return { kind: 'fail' }; }
      selected = species;
      if (!can(right.action)) { selected = null; return null; }
      asking = null; active = right.action;
      return { kind: 'start', action: right.action };
    },
    failDone() {
      if (!failing) return false;
      failing = null; return true;
    },
    dismiss() {
      if (!asking || failing || active) return false;
      asking = null; return true;
    },
    can,
    choose(id) {
      if (!can(id) || asking || failing) return false;
      active = id; return true;
    },
    complete(id) {
      if (active === null || id !== active) return false;
      if (id === 'lift') branch = 'held';
      // The bridge is built: the Þórseðlur let the branch go (it rests on its own), so they are free again.
      if (id === 'roll') { bridgeBuilt = true; branch = 'down'; }
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
      atStaging = false; boardwalkBuilt = false; visited = false; asking = null; failing = null; return true;
    },
  });
}
