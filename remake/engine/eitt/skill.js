// Kambeðla's skill, a number from 0 (mild) to 1 (sharp). It starts in the middle and follows the child from round
// to round: she gets sharper when the child wins and milder when the child loses, and more so the more rounds in
// a row the child loses. Inside a round she eases off while the child is far behind. The table keeps the state
// { skill, losses } in the save (engine/save.js) between visits.

export const SKILL_START = 0.5;

const STEP = 0.1; // one round won or lost
const EASE = 0.3; // how much milder she is while the child is far behind
const FAR_BEHIND = 4; // the child holds this many cards more than she does

// Skill in tenths: no 0.7999999999999999 in the save.
const tidy = value => Math.round(value * 100) / 100;

/** `skill` held to 0..1 (and the start value for anything that is not a number, such as a damaged save). */
export const clampSkill = skill => (Number.isFinite(skill) ? tidy(Math.min(1, Math.max(0, skill))) : SKILL_START);

/**
 * The state after a round: { skill, losses }, with `losses` the number of rounds in a row the child has lost.
 * A win by the child lifts her skill by 0.1 and ends the run of losses. A loss lowers it by 0.1, and by 0.1 more
 * for each loss in a row from the second: 0.1, then 0.2, then 0.3 and so on. Held to 0..1.
 */
export function afterRound(state, childWon) {
  const skill = clampSkill(state?.skill);
  const before = Number.isFinite(state?.losses) && state.losses > 0 ? Math.floor(state.losses) : 0;
  if (childWon) return { skill: clampSkill(skill + STEP), losses: 0 };
  const losses = before + 1;
  return { skill: clampSkill(skill - STEP * losses), losses };
}

/** The skill to play with right now: 0.3 milder while the child holds 4 or more cards more than she does. */
export function inRound(skill, childCards, kambedlaCards) {
  const base = clampSkill(skill);
  return childCards - kambedlaCards >= FAR_BEHIND ? clampSkill(base - EASE) : base;
}
