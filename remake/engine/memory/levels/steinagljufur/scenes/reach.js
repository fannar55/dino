/**
 * Level 2's third task as a script for the scene runner (scenes.js): the Þórseðlur reach the high ledge. They walk to the riser, one at each side of the slab that leans on the ledge, and each
 * tap of the child they stretch their long necks over its edge and pull: the slab comes down a step (three steps), and lies as a ramp up the ledge. Then everyone walks up it. Built like
 * scenes/headbutt.js, on the same `stage.task` (the level's world adds `view`, `up` and `slab` to what scenes/through.js lists):
 *   task.slab()   { hinge, edge, middle } of the slab now, in world space
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const up = (point, metres) => point.clone().setY(point.y + metres);

/**
 * The scene: a wide cut on the pair walking to the ledge, a still low shot from the side while the child taps (`taps` taps in `timeout` seconds; no taps: "Við gerum þetta saman!"),
 * a wide cut of the slab coming down, a face cut on the cheer, and a follow cut of everyone walking up the ramp; then the camera glides to the terrace.
 */
export function reachScene(stage, { taps = 3, timeout = 4 } = {}) {
  const pair = () => stage.pair('brontosaurus'), slab = () => stage.task.slab();
  const everyone = () => [...stage.friends().filter(actor => actor.root.visible).map(actor => actor.root.position.clone()), stage.mosi.body()];
  const arrived = () => stage.task.waitingBeat() !== null || !stage.task.busy();
  const stillGoing = () => { if (!stage.task.busy()) stage.task.abort(); };
  const phase = () => stage.task.phase(), view = front => () => stage.task.view(front);
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...bodies(pair()), slab().middle, up(slab().edge, 1), stage.task.up(-5, 1, 0)], front: view([-.3, -1]), elevation: 24, cut: true, floor: 'auto' },
      act: all(() => { if (!stage.task.start('reach', { beats: taps })) stage.task.abort(); }, () => stage.mosi.look(slab().middle)) },
    { at: .05, wait: { until: arrived, timeout: 5 } },
    // The child's moment: both necks stretch up to the slab's edge; the shot holds still while they pull.
    { at: .1, shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(pair()), slab().middle, up(slab().edge, 1.2), slab().hinge], front: view([-.45, -1]), elevation: 14, cut: true, floor: 'auto' }, act: all(stillGoing, () => stage.mosi.look(slab().middle)) },
    { at: .15, wait: { tap: 'ledge', count: taps, timeout,
      onTap: () => stage.task.beat(),
      // No taps: "Við gerum þetta saman!" and they pull it down on their own.
      onTimeout: () => { stage.say('together'); while (stage.task.beat()); } } },
    { at: .2, wait: { until: () => ['down', 'cheer', 'ascend'].includes(phase()) || !stage.task.busy(), timeout: 9 } },
    // The slab lies down the ledge: the ramp, the dust at its foot.
    { at: .25, shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(pair()), slab().edge, slab().hinge, up(slab().hinge, 1.5)], front: view([-.5, -1]), elevation: 16, cut: true, floor: 'auto' }, act: () => stage.mosi.gesture('clap') },
    { at: .3, wait: { until: () => ['cheer', 'ascend'].includes(phase()) || !stage.task.busy(), timeout: 4 } },
    { at: .35, shot: { kind: 'face', subjects: () => [...pair().map(actor => actor.getNosePosition()), ...pair().map(actor => up(actor.getNosePosition(), .6))], front: view([-.8, -1]), elevation: 12, cut: true, floor: 'auto' }, sound: { name: 'call', species: 'brontosaurus' } },
    { at: .4, wait: { until: () => phase() === 'ascend' || !stage.task.busy(), timeout: 3 } },
    // Everyone walks up the ramp.
    { at: .45, shot: { kind: 'follow', subjects: everyone, front: view([-.3, -1]), elevation: 20, cut: true, floor: 'auto' }, act: () => stage.mosi.look(stage.task.up(8, 3, 0)) },
    { at: .5, wait: { until: () => !stage.task.busy(), timeout: 8 } },
    { at: .55, shot: { release: true, duration: .9 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}
