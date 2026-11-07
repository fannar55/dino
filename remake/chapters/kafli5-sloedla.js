// Slóeðla at the far pool (chapter 5, kafli5.js): chunk 1's placeholder poses, which Task 5 makes her life. She hides in the far
// reed with only her crest over it, peeks out when the child taps the reed, comes out a step after each phrase (kafli5-pool.js
// STEPS: her crest, her head, her neck and shoulders, all of her in the shallows), each step reached while the camera looks
// elsewhere, blows her horn with her crest up (her 'call' clip), and walks out into the pool for the whole song (WADE).
//
// Hidden is low: she is 4.1 m to the top of her crest, and the reed is about 2.5 m, so at each step she stands SINK m under her
// ground and the reed hides the rest. A peek lifts her PEEK m, her eyes over the reed.
import { STEPS, WADE } from './kafli5-pool.js';

const SINK = { crest: -2.3, head: -1.4, neck: -0.6, whole: 0 };
const PEEK = 0.8;
const WADE_SPEED = 1.2; // m/s: out into the pool, slowly

/** Her life on `actor` (the scene's actor: s.actor('sloedla')). */
export function sloedlaLife(actor) {
  const her = actor.raw;
  let step = 0;
  let lifted = 0;
  function stand() {
    const { at, heading, show } = STEPS[step];
    actor.place(at[0], at[1], heading);
    her.root.position.y += SINK[show] + lifted;
    her.root.updateMatrixWorld(true);
  }
  return {
    get step() { return step; },
    get show() { return STEPS[step].show; },
    /** Deep in the reed, her crest over it. */
    hide() {
      step = 0;
      lifted = 0;
      stand();
      her.play('idle', { fade: 0 });
    },
    /** To step `i` of STEPS, at once (the camera is elsewhere). */
    stepTo(i) {
      step = Math.max(0, Math.min(STEPS.length - 1, i));
      lifted = 0;
      stand();
    },
    /** Her eyes over the reed (`on`), or down again. */
    peek(on) {
      lifted = on ? PEEK : 0;
      stand();
    },
    /** Her horn: her crest up, as she blows. */
    horn() {
      her.play('call', { fade: 0.2 });
    },
    idle() {
      her.play('idle', { fade: 0.5 });
    },
    happy() {
      her.play('happy', { fade: 0.4 });
    },
    /** Out into the pool for the whole song: a task the scene yields (her walk). */
    wade() {
      step = STEPS.length - 1;
      lifted = 0;
      return actor.walkTo([WADE.at], { speed: WADE_SPEED, turnRate: 30 });
    },
  };
}
