/**
 * A wrong friend's funny go at one of level 2's first two obstacles, as a script for the scene runner (scenes.js): the tunnel (a pair that cannot light it) and the rockfall (a pair
 * that cannot butt it away). The mover (mover.js startFail) hops the pair to the obstacle, plays its go (gestures.js FAIL_TRIES: into the dark and a bump, a bonk on the low roof,
 * a tumble out; a pebble on the head, a nudge that moves nothing, a peck on a stone) and hops it back; `timing` is what it returned. Built like levels/berjalundur/scenes/branch.js
 * failScene: a wide cut on the run, a close cut on the go, a cut to Mosi laughing "Kannski einhver annar?", and a cut back to the glade, where the bubbles come back.
 * The tunnel's goes are seen from outside, over the pair's backs as they go in (the funny part is the dark); the rocks' from the same side, the pile beyond them.
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const centre = points => points.reduce((sum, p) => sum.add(p), points[0].clone().multiplyScalar(0)).multiplyScalar(1 / points.length);
const up = (point, metres) => point.clone().setY(point.y + metres);

export function failScene(stage, species, target, timing) {
  const pair = () => stage.pair(species), point = () => target === 'tunnel' ? stage.task.mouth() : stage.task.pile().front, start = centre(pair().map(actor => actor.root.position.clone()));
  const front = turn => () => stage.task.front(turn), elevation = species === 'pteranodon' && target === 'tunnel' ? 18 : 14;
  const laughAt = timing.run + timing.attempt * .62;
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...bodies(pair()), point(), start, up(stage.task.mouth(), 2)], front: front(.5), elevation: 24, cut: true },
      act: all(() => stage.mosi.look(point()), () => stage.pairGesture(species, 'hop')) },
    { at: Math.max(.1, timing.run - .3), shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(pair()), ...pair().map(actor => up(actor.root.position, 1.6)), point(), up(stage.task.mouth(), 2.2)], front: front(.6), elevation: elevation + 4, cut: true },
      act: () => stage.mosi.look(centre(pair().map(actor => actor.getNosePosition()))) },
    // The wrong friend, sat down dazed or shrugging: it giggles.
    { at: timing.run + timing.attempt * .55, sound: 'giggle' },
    // Mosi's laugh is seen from in front of him, three-quarters (level 2's Mosi stands at the side of the glade, facing the leaves).
    { at: laughAt, shot: { kind: 'face', subjects: () => [stage.mosi.head(), up(stage.mosi.head(), -.6)], front: () => stage.faceOn(stage.mosi.yaw(), .6), cut: true },
      act: all(() => stage.mosi.gesture('laugh'), () => stage.mosi.look(stage.camera())), say: 'other' },
    { at: laughAt + .05, wait: { until: () => !stage.task.busy(), timeout: 8 } },
    { at: laughAt + .1, shot: { release: true, cut: true } },
  ];
}
