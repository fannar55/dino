/** Two small Triceratops errands. The world owns motion/time; the controller gates memory turns. */
export const MEMORY_ROCKS = Object.freeze(['home', 'butterfly']);

export function createMemoryAdventure() {
  let unlocked = false, selected = false, active = null, completed = [];
  const phase = () => !unlocked ? 'locked' : active ? 'busy'
    : completed.length === MEMORY_ROCKS.length ? 'complete' : selected ? 'selected' : 'available';
  return Object.freeze({
    getState() {
      return Object.freeze({ unlocked, selected, active, completed: Object.freeze([...completed]), phase: phase() });
    },
    unlock() {
      if (unlocked) return false;
      unlocked = true; return true;
    },
    select() {
      if (!unlocked || active || completed.length === MEMORY_ROCKS.length) return false;
      selected = !selected; return true;
    },
    choose(id) {
      if (!unlocked || !selected || active || !MEMORY_ROCKS.includes(id) || completed.includes(id)) return false;
      active = id; return true;
    },
    complete(id) {
      if (active === null || id !== active) return false;
      completed.push(id); active = null;
      // Keep the helpers selected between errands; both orders are equally valid.
      if (completed.length === MEMORY_ROCKS.length) selected = false;
      return true;
    },
    restart() {
      unlocked = false; selected = false; active = null; completed = []; return true;
    },
  });
}
