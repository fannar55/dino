/**
 * The rules of a level's step ladder. A level (levels/) describes its steps, in order; this module plays them. Level 1's bridge
 * puzzle is one ladder, any later level is another. The world owns motion; these rules gate the memory turns and know nothing
 * of how a step looks.
 *
 * A step is one of
 *   { id, kind: 'task', target, species, beatWords?, holds?, journey? }      a pair does it: the child taps the obstacle (`target`),
 *                                                                           picks the pair from the bubbles, and the pair's own species is the right answer
 *   { id, kind: 'travel', target, needsAllFound?, waitsForGifts?, automatic: true }   everyone goes; it starts by itself once it can
 *   { id, kind: 'together', target, beatWords }                             everyone does it at once: a tap on the obstacle starts it, no bubbles
 * `holds: 'later'` keeps that task's pair busy (not a choice in the bubbles) from its completion until the step named completes.
 * The steps go in order: a step can start only when the one before it is done.
 *
 * A level also gives `friends` (the species, in the order of their nests), `flags(done)` (extra fields for the state, from the
 * Set of finished step ids) and, optionally, `onCancel(id, opts, done)`, run when a running step is cancelled (a blocked route).
 *
 * Choosing by obstacle: next() is the obstacle that glows; ask(target) answers a tap on an obstacle
 * ({ kind: 'choose', candidates } opens the bubbles, { kind: 'start', action } for a together step, 'not-yet' and 'find-first' are
 * Mosi's hints, null means the tap is ignored); pick(species) answers a bubble ({ kind: 'start', action } or { kind: 'fail' },
 * null when ignored); failDone() brings the bubbles back after a wrong friend's attempt; dismiss() closes them. Candidates are
 * the found pairs that are free: a pair that holds something is busy.
 */
const KINDS = Object.freeze(['task', 'travel', 'together']);

/** A level's description is data: nothing in the game changes it. Freezes objects and arrays all the way down (functions stay as they are). */
export function freezeLevel(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeLevel);
    Object.freeze(value);
  }
  return value;
}

/** The obstacles the child asks "Hver getur þetta?" about, by target, and the one pair that can do each: { species, action }. */
export function obstaclesOf(level) {
  return Object.freeze(Object.fromEntries(level.steps.filter(step => step.kind !== 'travel')
    .map(step => [step.target, Object.freeze({ species: step.species ?? null, action: step.id })])));
}

function check(level) {
  const { steps, friends } = level ?? {};
  if (!Array.isArray(steps) || !steps.length) throw new TypeError('a level needs steps');
  if (!Array.isArray(friends) || !friends.length) throw new TypeError('a level needs friends');
  if (new Set(steps.map(step => step.id)).size !== steps.length) throw new TypeError('step ids must be distinct');
  steps.forEach((step, index) => {
    if (!KINDS.includes(step.kind)) throw new TypeError(`step ${step.id}: unknown kind ${step.kind}`);
    if (step.kind === 'task' && !friends.includes(step.species)) throw new TypeError(`step ${step.id}: ${step.species} is not one of the level's friends`);
    if (step.holds && !steps.slice(index + 1).some(later => later.id === step.holds)) throw new TypeError(`step ${step.id}: holds ${step.holds}, which is not a later step`);
  });
}

export function createStepRules(level) {
  check(level);
  const { steps, friends } = level, flags = level.flags ?? (() => ({}));
  const obstacles = obstaclesOf(level), finalStep = steps.at(-1).id;
  const done = new Set();
  let unlocked = [], selected = null, active = null, asking = null, failing = null;
  const finished = () => done.has(finalStep);
  const current = () => steps.find(step => !done.has(step.id)) ?? null;
  const stepAt = target => steps.find(step => step.kind !== 'travel' && step.target === target);
  const busy = species => steps.some(step => step.holds && step.species === species && done.has(step.id) && !done.has(step.holds));
  const free = () => unlocked.filter(species => !busy(species));
  const phase = () => finished() ? 'complete' : active ? 'busy' : failing ? 'failing' : asking ? 'choosing' : !unlocked.length ? 'locked' : selected ? 'selected' : 'available';
  // The obstacle that glows: the next step, unless it is a travel step (those start on their own).
  function next() {
    const step = current();
    return step && step.kind !== 'travel' ? step.target : null;
  }
  function can(id) {
    if (active || finished()) return false;
    const step = steps.find(value => value.id === id);
    if (!step || step !== current()) return false;
    if (step.needsAllFound && !friends.every(species => unlocked.includes(species))) return false;
    return step.kind !== 'task' || selected === step.species;
  }
  return Object.freeze({
    getState() {
      const state = {
        unlocked: Object.freeze([...unlocked]), free: Object.freeze(free()), selected, active, ...flags(done),
        next: next(), asking: asking?.target ?? null, candidates: Object.freeze([...(asking?.candidates ?? [])]), failing, phase: phase(),
        // The finished steps, in the order they were done (the story and the world read the ladder from here).
        done: Object.freeze([...done]),
      };
      return Object.freeze(state);
    },
    unlock(species) {
      if (!friends.includes(species) || unlocked.includes(species)) return false;
      unlocked.push(species); return true;
    },
    select(species) {
      if (active || finished() || asking || failing || (species !== null && !unlocked.includes(species))) return false;
      const now = species === selected ? null : species;
      if (now === selected) return false;
      selected = now; return true;
    },
    next,
    ask(target) {
      const step = Object.hasOwn(obstacles, target) ? stepAt(target) : null;
      if (active || failing || finished() || !step) return null;
      if (target !== next()) return { kind: 'not-yet' };
      if (step.kind === 'together') {
        // Everyone does it at once: no bubbles, no pair to choose.
        if (!can(step.id)) return null;
        asking = null; selected = null; active = step.id;
        return { kind: 'start', action: step.id };
      }
      const candidates = free();
      if (!candidates.length) { asking = null; return { kind: 'find-first' }; }
      asking = { target, candidates }; selected = null;
      return { kind: 'choose', candidates: [...candidates] };
    },
    pick(species) {
      if (!asking || active || failing || !asking.candidates.includes(species)) return null;
      const right = obstacles[asking.target];
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
      done.add(id);
      active = null; selected = null; return true;
    },
    cancel(id, opts) {
      if (active === null || id !== active) return false;
      // The level may adjust what it keeps (a blocked route still keeps the finished steps, and never grants arrival or a reward).
      level.onCancel?.(id, opts, done);
      active = null; selected = null; return true;
    },
    restart() {
      unlocked = []; selected = null; active = null; done.clear(); asking = null; failing = null; return true;
    },
  });
}
