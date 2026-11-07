// Child-facing intent, kept separate from the physical puzzle prerequisites.
// Mosi's hint for each moment; the child taps the obstacle that glows and picks the friend himself,
// so a hint names the obstacle, never the friend who can do it. `target` is the obstacle the gold
// arrow may point at when the child hesitates (only once that friend is found and home); the crossing
// and the walk to the grove start on their own (`automatic`). `memory` is the rules' state with `giftsLeft` (gift pairs not found yet),
// `giftsLanding` (found, still flying to the basket) and `seek` (the words for a gift's other half, when one leaf is open); a missing count is 0.
//
// The words are the level's (levels/*.js, `story`): each step has the keys and the hints for its moments, and the level's `common`
// has the ones that belong to no step. The step to talk about is the first one not done. A task step whose pair is not found yet
// is a search (`find`; a step without a `find` is never searched for), found but not home yet it is `arriving`, and home it is
// `work`; a travel step that needs everyone waits for them (`gather`, `arriving`) and, if it waits for the gifts, for those
// (`gifts`, `landing`) before it opens; a together step is always ready. The bridge state carries `done` (the finished step ids);
// a state written by hand without it is read through the level's `doneFrom`.
import { BERJALUNDUR } from './levels/berjalundur.js';

export function nextStoryStep(memory, bridge, ready = {}, level = BERJALUNDUR) {
  const { steps, friends, story } = level, common = story.common;
  const done = new Set(bridge.done ?? level.doneFrom?.(bridge) ?? []);
  if (bridge.active) return { key: story[bridge.active].doing, kind: 'action', prompt: story[bridge.active].prompts.doing };
  if (bridge.failing) return { key: common.trying, kind: 'action', prompt: common.prompts.trying };
  if (steps.every(step => done.has(step.id))) return { key: common.home, kind: 'celebrate', prompt: common.prompts.home };
  if (bridge.asking) return { key: common.who + bridge.asking, kind: 'choose', target: bridge.asking, prompt: common.prompts.who };
  const has = species => bridge.unlocked.includes(species);
  const step = steps.find(value => !done.has(value.id)), words = story[step.id];
  if (step.kind === 'travel') {
    const open = { key: words.open, kind: 'travel', action: step.id, target: step.target, prompt: words.prompts.open, automatic: true, available: true };
    if (!step.needsAllFound) return open;
    if (friends.every(has) && friends.every(species => ready[species])) {
      // The crossing waits for every gift pair (the leaves are behind the camera after it): the gold arrow points at a shut leaf (`leaf`),
      // and while the last pair is still flying to the basket it only waits.
      if (step.waitsForGifts) {
        if (memory.giftsLeft > 0) return { key: words.gifts, kind: 'search', leaf: true, prompt: words.prompts.gifts, available: true };
        if (memory.giftsLanding > 0) return { key: words.landing, kind: 'arriving', prompt: words.prompts.landing };
      }
      return open;
    }
    if (friends.every(has)) return { key: words.arriving, kind: 'arriving', prompt: words.prompts.arriving };
    return { key: words.gather, kind: 'search', prompt: words.prompts.gather };
  }
  if (step.kind === 'task' && words.find && !has(step.species)) {
    const seeking = words.seeks && memory.phase === 'one-open';
    return { key: words.find, kind: 'search', prompt: seeking ? memory.seek ?? common.prompts.seek : words.prompts.find };
  }
  const home = step.kind === 'together' || Boolean(ready[step.species]);
  return {
    key: home ? words.ready : words.arriving, kind: home ? 'work' : 'arriving',
    action: step.id, target: step.target, species: step.species, prompt: home ? words.prompts.ready : common.prompts.arriving,
    available: home,
  };
}
