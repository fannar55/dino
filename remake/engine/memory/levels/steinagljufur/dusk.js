// Level 2's light through the round (Task 7): from the afternoon in the glade to the evening on Sólarsyllan, a stage further after each step
// (engine/looks.js: gorgeAfternoon 0, gorgeGolden 1, gorgeSunset 2, gorgeEvening 3), blended over a few seconds so that it never jumps.
//
// - The search, the tunnel and the rockfall: the afternoon, a little warmer once the tunnel is lit and again once the rocks are gone. Only the
//   colours warm there; the sun keeps its place over the glade (its shadows and the search view stay as they were).
// - Through the tunnel, the ledge, the rope and the climb: on to golden, fully golden on the clifftop; the sun swings round behind the cameras of
//   the upper gorge as the group goes on. The pull: still golden.
// - The walk over the trunk: the sunset, beginning as the walk does and full as everyone is on Sólarsyllan.
// - The celebration: on to the evening as the stars come out (scenes/celebrate.js asks for it).

const LOOKS = ['gorgeAfternoon', 'gorgeGolden', 'gorgeSunset', 'gorgeEvening'];
/** The stage of the light once each step is done. */
export const DONE_STAGE = Object.freeze({ light: .15, headbutt: .3, through: .55, reach: .7, fly: .85, climb: 1, pull: 1, walk: 2 });
// (the colours warm from the start; the sun begins to move only past the rockfall's stage, and is where golden has it at 1)
const TURN_FROM = .3;
/** How long a step's change of light takes, and the walk's sunset. */
export const BLEND_SECONDS = 2.5, WALK_SECONDS = 9.5;

export function createDusk(stage) {
  let value = 0, from = 0, to = 0, age = 0, seconds = 0, applied = -1;
  function apply(force = false) {
    if (!force && Math.abs(value - applied) < 1e-4) return;
    applied = value;
    const i = Math.min(LOOKS.length - 2, Math.floor(value)), t = value - i;
    const turn = i === 0 ? Math.min(1, Math.max(0, (value - TURN_FROM) / (1 - TURN_FROM))) : t;
    // (a stage without a sky, as the rules tests' stand-in, has no daylight: the light is then only kept as a number)
    stage.daylight?.(LOOKS[i], LOOKS[i + 1], t, turn);
  }
  return {
    /** On to `target` (never back) over `duration` seconds, eased in and out. */
    to(target, duration = BLEND_SECONDS) {
      if (target <= to) return false;
      from = value; to = Math.min(LOOKS.length - 1, target); age = 0; seconds = Math.max(0, duration);
      return true;
    },
    /** The light of the step state (step-rules.js getState()): the stage of the steps done, and the sunset while the walk is on. */
    follow(state) {
      const done = state?.done ?? [];
      let target = Math.max(0, ...done.map(id => DONE_STAGE[id] ?? 0));
      if (state?.active === 'walk' && target < DONE_STAGE.walk) return this.to(DONE_STAGE.walk, WALK_SECONDS);
      return this.to(target, BLEND_SECONDS);
    },
    /** At once (the round starts again: the afternoon). */
    set(stageValue) { value = from = to = stageValue; age = seconds = 0; apply(true); },
    update(dt) {
      if (value === to) return;
      age += dt; const u = seconds > 0 ? Math.min(1, age / seconds) : 1, eased = u * u * (3 - 2 * u);
      value = u >= 1 ? to : from + (to - from) * eased; apply();
    },
    get value() { return value; },
    get target() { return to; },
    debug: () => ({ value: +value.toFixed(3), target: to, look: LOOKS[Math.min(LOOKS.length - 1, Math.round(value))] }),
  };
}
