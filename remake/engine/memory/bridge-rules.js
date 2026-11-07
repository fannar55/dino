/**
 * Cooperative bridge puzzle (level 1). The world owns motion; the controller gates memory turns. The ladder itself is the level's
 * description (levels/berjalundur.js) played by step-rules.js; this module keeps level 1's names for it.
 *
 * Choosing by obstacle: next() is the obstacle that glows; ask(target) answers a tap on an obstacle
 * ({ kind: 'choose', candidates } opens the bubbles, 'not-yet' and 'find-first' are Mosi's hints, null
 * means the tap is ignored); pick(species) answers a bubble ({ kind: 'start', action } or { kind: 'fail' },
 * null when ignored); failDone() brings the bubbles back after a wrong friend's attempt; dismiss() closes
 * them. Candidates are the found pairs that are free: the brontos holding the branch are busy.
 */
import { BERJALUNDUR } from './levels/berjalundur.js';
import { createStepRules, obstaclesOf } from './step-rules.js';

export const BRIDGE_HELPERS = BERJALUNDUR.friends;
export const BRIDGE_ACTIONS = Object.freeze(BERJALUNDUR.steps.map(step => step.id));
// The obstacles the child asks "Hver getur þetta?" about, and the one pair that can do each.
export const BRIDGE_OBSTACLES = obstaclesOf(BERJALUNDUR);

export const createBridgeAdventure = () => createStepRules(BERJALUNDUR);
