/**
 * The walk to the berry grove: Mosi leads all six friends over the new boardwalk, as a script for the scene runner
 * (scenes.js) on the world's `stage` (world.js; see scenes/cross.js, which gives the same Mosi and friends helpers).
 * For this one the stage also gives task.panelCentre(i), where panel i of the boardwalk lies, and task.point('grove').
 * `timing` is Mosi's walk, in seconds from the start: `deck` his first step onto the boardwalk, `mid` the middle of it,
 * `arrive` at his place past it; `lead` what the friends follow ({ at, half }, see bridge-adventure start).
 */
import { celebrateScene } from './celebrate.js';
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const centre = points => points.reduce((sum, p) => sum.add(p), points[0].clone().multiplyScalar(0)).multiplyScalar(1 / points.length);
const up = (point, metres) => point.clone().setY(point.y + metres);
const shift = (point, x, y, z) => point.clone().set(point.x + x, point.y + y, point.z + z);

/**
 * A wide cut as Mosi sets off (the friends wait for him to pass), a follow cut beside the boardwalk as he steps onto
 * it, a cut over his shoulder as the grove opens up ahead, a cut back to the friends coming along behind him, and a wide
 * cut of the arrival with Mosi at the grove. When the last one has arrived the celebration takes over (celebrate.js) and the ending card follows it.
 */
export function finishScene(stage, plan, timing) {
  const friends = () => stage.friends();
  const group = () => [stage.mosi.body(), ...bodies(friends())];
  const start = () => shift(stage.task.panelCentre(0), 0, 0, .75), end = () => shift(stage.task.panelCentre(2), 0, 0, -.75);
  // Those on the boardwalk or about to step onto it.
  const onWalk = () => { const points = bodies(friends().filter(actor => actor.root.position.z < -14.5 && actor.root.position.z > -24)); return points.length ? points : bodies(friends()); };
  const deck = timing.deck, follow = Math.max(1, deck - .7), mid = Math.max(follow + 1.4, deck + .35 * (timing.arrive - deck)), behind = mid + 1.5, arrival = Math.max(behind + 1.6, timing.arrive - .4);
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...group(), start()], cut: true },
      act: all(() => { if (stage.task.start('finish', { lead: timing.lead })) stage.mosi.walk(plan); else stage.task.abort(); }, () => stage.pairGesture('triceratops', 'hop'), () => stage.pairGesture('brontosaurus', 'hop'), () => stage.pairGesture('stegosaurus', 'hop')) },
    // Beside the boardwalk as Mosi steps onto it.
    { at: follow, shot: { kind: 'follow', subjects: () => [stage.mosi.body(), stage.mosi.head(), ...onWalk()], front: stage.sideOn(start(), end()), elevation: 34, cut: true } },
    // Over his shoulder from behind, the grove ahead.
    { at: mid, shot: { kind: 'shoulder', subjects: () => [stage.mosi.head(), up(end(), .6), up(stage.task.point('grove'), .2)], elevation: 26, cut: true } },
    // Back to the friends coming along behind him.
    { at: behind, shot: { kind: 'follow', subjects: () => [...onWalk(), stage.mosi.body()], front: stage.sideOn(start(), end()), elevation: 34, cut: true } },
    // There: Mosi at the grove, the friends finding their places.
    { at: arrival, shot: { kind: 'wide', subjects: () => [...group(), end(), up(stage.mosi.body(), 1)], cut: true },
      act: () => stage.mosi.look(centre(bodies(friends()))) },
    { at: arrival + .05, wait: { until: () => !stage.task.busy() && !stage.mosi.walking(), timeout: 9 } },
    // Then the celebration (scenes/celebrate.js), which ends on a wide shot that stays up under the ending card.
    ...celebrateScene(stage).map(line => ({ ...line, at: arrival + .1 + line.at })),
  ];
}
