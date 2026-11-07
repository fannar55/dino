// Árdalurinn in sections (chapter 4's flight, engine/flier.js): the route split into 150 m pieces, each with the land around it,
// built a little at a time before it is needed and shown only while it is near.
//
//   const sections = createSections(route);       // bookkeeping: which pieces there are and which are wanted where
//   sections.wanted(u)                             // the pieces round progress u: one behind, the one she is in, two ahead
//   sections.update(u, near)                       // visible = built and (wanted at u, or in `near`)
//
//   const queue = createBuildQueue({ budget, now });   // drives build generators a slice per frame (world/forest/slices.js's rules)
//   queue.add(steps, done); queue.tick();
//
// The queue is world/forest/slices.js's runSliced turned inside out: instead of awaiting the next frame itself it is ticked by the
// place's update, so the build goes on in step with the game's own frames (and the harness's), never between them. It keeps the
// same rules: a slice runs until `budget()` milliseconds have gone on `now()`, and a step that yields FRESH begins a slice of its own.
import { FRESH } from '../forest/slices.js';

export const SECTION = { length: 150, ahead: 2, behind: 1 };

/** The route's sections and which of them are wanted where. */
export function createSections(route, { length = SECTION.length, ahead = SECTION.ahead, behind = SECTION.behind } = {}) {
  const count = Math.max(1, Math.ceil(route.length / length - 1e-9));
  const list = Array.from({ length: count }, (_, index) => ({
    index,
    from: (index * length) / route.length,
    to: Math.min(1, ((index + 1) * length) / route.length),
    built: false,
    visible: false,
  }));
  const indexAt = u => Math.min(count - 1, Math.max(0, Math.floor((u * route.length) / length)));
  function wanted(u) {
    const i = indexAt(u);
    const out = [];
    for (let k = Math.max(0, i - behind); k <= Math.min(count - 1, i + ahead); k++) out.push(k);
    return out;
  }
  return {
    list, length, count, indexAt, wanted,
    /** Show the built sections wanted at u (none if u is null: no flight) and those in `near` (indices); hide the rest. Returns the visible indices. */
    update(u, near = []) {
      const show = new Set([...(u === null ? [] : wanted(u)), ...near]);
      for (const section of list) section.visible = section.built && show.has(section.index);
      return list.filter(s => s.visible).map(s => s.index);
    },
  };
}

/** Build generators a slice per tick, one after another, in the order given. */
export function createBuildQueue({ budget = () => 3, now = () => performance.now() } = {}) {
  const jobs = [];
  let current = null;
  return {
    get busy() { return Boolean(current) || jobs.length > 0; },
    get current() { return current?.id ?? null; },
    has: id => current?.id === id || jobs.some(job => job.id === id),
    add(id, steps, done = () => {}) { jobs.push({ id, steps, done }); },
    /** Take a job off the queue (to build it at once instead): returns its steps, or null. */
    take(id) {
      if (current?.id === id) { const job = current; current = null; return job; }
      const i = jobs.findIndex(job => job.id === id);
      return i < 0 ? null : jobs.splice(i, 1)[0];
    },
    /** Reorder the jobs still waiting: `order(a, b)` on their ids. */
    sort(order) { jobs.sort((a, b) => order(a.id, b.id)); },
    /** Run a slice: steps until the budget is gone. Returns the number of steps run. */
    tick() {
      const start = now();
      const limit = Math.max(0.1, budget());
      let ran = 0;
      while (now() - start < limit) {
        if (!current) {
          current = jobs.shift() ?? null;
          if (!current) break;
        }
        const next = current.steps.next();
        ran++;
        if (next.done) {
          const job = current;
          current = null;
          job.done(next.value);
          continue;
        }
        if (next.value === FRESH && ran > 1) break;
      }
      return ran;
    },
  };
}

/** Run a job's steps to the end at once (a section wanted now that is not built yet). */
export function finish(job) {
  let next = job.steps.next();
  while (!next.done) next = job.steps.next();
  job.done(next.value);
  return next.value;
}
