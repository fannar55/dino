import * as THREE from 'three';
import { reachTwoBones } from './ik.js';

// Hands that hold something (chapter 1: Egill's posy, from the search in scene 8 until he has given every flower in
// scene 9). Each arm reaches its hand to a point that moves with what is held: ik.js's reachTwoBones turns the upper arm
// and the forearm so the wrist lands on the point, the elbow bending out the way the clip bends it. The hold is laid
// over the character's own pose after the actors update: it runs on world.effects, which main.js updates after the
// actors (the saddle's grip does the same in the rider's own update, after his clips; R28's order), so the character
// walks, turns and breathes with its hands where they hold, and neither its clips nor actor.js change.
//
//   const hold = holdWithHands(world, egill, { left: spec, right: spec }); // point specs, resolved every frame
//   hold.grip(0.4);     // the hands go to their points over 0.4 s, and stay
//   hold.release(0.5);  // and back to the character's own pose over 0.5 s; then the hold leaves world.effects
//
// The mixer writes a bone only when its clip's value changes, so a bone the clip holds still keeps the turn the hold gave
// it the frame before. Each frame the hold first gives back the clip's own turn to every bone the mixer has left as the
// hold set it, so a reach always starts from the clip's pose and a release ends exactly on it.

const smooth = t => t * t * (3 - 2 * t);
const BONES = ['upper', 'lower'];

/**
 * Hold with `actor`'s hands: `left` and `right` are point specs where each wrist goes (one may be left out). Returns
 *   grip(seconds)     bring the hands to their points over `seconds`, and keep them there
 *   release(seconds)  take them back to the actor's own pose over `seconds`; the hold is over when they are back
 *   weight            0 (its own pose) to 1 (the hands on their points)
 *   update(dt)        what world.effects calls every frame
 */
export function holdWithHands(world, actor, { left = null, right = null } = {}) {
  if (!world?.effects) throw new Error('A hold runs on world.effects (engine/effects.js), which main.js updates after the actors');
  if (!world.resolvePoint) throw new Error('A hold reaches for points: it needs world.resolvePoint (engine/points.js)');
  if (left == null && right == null) throw new TypeError('A hold needs a point for at least one hand: { left, right }');
  const arms = [['Left', left], ['Right', right]].filter(([, spec]) => spec != null).map(([side, spec]) => {
    const [upper, lower, hand] = ['UpperArm', 'LowerArm', 'Hand'].map(part => actor.model.getObjectByName(`${side}${part}`));
    if (!upper || !lower || !hand) throw new Error(`${actor.name} has no ${side.toLowerCase()} arm to hold with`);
    world.resolvePoint(spec, new THREE.Vector3()); // a point that cannot be found fails here, not a frame later
    return {
      spec, upper, lower, hand,
      own: { upper: new THREE.Quaternion(), lower: new THREE.Quaternion() }, // the clip's turn, before the reach
      set: { upper: null, lower: null }, // the turn the reach gave each bone, while it is the hold's
    };
  });

  let weight = 0;
  let goal = 0;
  let rate = Infinity; // weight a second, toward the goal
  let released = false;
  let over = false;
  const wrist = new THREE.Vector3();
  const point = new THREE.Vector3();
  const target = new THREE.Vector3();

  function update(dt) {
    if (over) return;
    for (const arm of arms) {
      for (const bone of BONES) {
        if (arm.set[bone] && arm[bone].quaternion.equals(arm.set[bone])) arm[bone].quaternion.copy(arm.own[bone]);
        arm.set[bone] = null;
      }
    }
    const step = rate * Math.max(0, dt);
    weight = goal > weight ? Math.min(goal, weight + step) : Math.max(goal, weight - step);
    if (weight <= 0) {
      if (released) over = true; // back in its own pose
      return;
    }
    actor.root.updateMatrixWorld(true);
    const k = smooth(weight);
    for (const arm of arms) {
      arm.own.upper.copy(arm.upper.quaternion);
      arm.own.lower.copy(arm.lower.quaternion);
      world.resolvePoint(arm.spec, point);
      target.lerpVectors(arm.hand.getWorldPosition(wrist), point, k);
      reachTwoBones(arm.upper, arm.lower, arm.hand, target);
      arm.set.upper = arm.upper.quaternion.clone();
      arm.set.lower = arm.lower.quaternion.clone();
    }
  }

  const ease = seconds => (seconds > 0 ? 1 / seconds : Infinity);
  world.effects.add({
    update(dt) {
      update(dt);
      return !over;
    },
  });

  return {
    grip(seconds = 0.4) {
      if (over) return this;
      goal = 1;
      released = false;
      rate = ease(seconds);
      return this;
    },
    release(seconds = 0.5) {
      if (over) return this;
      goal = 0;
      released = true;
      rate = ease(seconds);
      return this;
    },
    get weight() { return weight; },
    get over() { return over; },
    update,
  };
}
