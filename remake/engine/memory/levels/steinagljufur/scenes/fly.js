/**
 * Level 2's fourth task as a script for the scene runner (scenes.js): the Flugeðlur fly the rope up the cliff. The rope is tied at the foot of the path and lies in a coil; the pair take its
 * free end, and each tap of the child is a wingbeat up the cliff (three, to the top), where they fly round the tree and wind the rope round its trunk; the rope draws taut and they land
 * by the tree. Built like scenes/reach.js, on the same `stage.task`; this one also uses
 *   task.tree()    { base, top, middle } of the tree on the rim, in world space              task.rope()   the rope's end now (world space)
 *   task.phase()   what the mover is doing ('approach', 'ready', 'leg', 'wrap', 'tie', 'cheer')
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const up = (point, metres) => point.clone().setY(point.y + metres);

/**
 * The scene: a wide cut on the pair at the rope and the cliff above, a still low shot of the pair and the rope while the child taps (`taps` taps in `timeout` seconds; no taps:
 * "Við gerum þetta saman!"), a follow cut up the cliff behind them, a wide cut of the tree as they wind the rope round it, and a wide cut of the whole rope drawing taut; then the camera
 * glides to the rim's view.
 */
export function flyScene(stage, { taps = 3, timeout = 4 } = {}) {
  const pair = () => stage.pair('pteranodon'), tree = () => stage.task.tree(), view = front => () => stage.task.view(front);
  const arrived = () => stage.task.waitingBeat() !== null || !stage.task.busy();
  const stillGoing = () => { if (!stage.task.busy()) stage.task.abort(); };
  const phase = () => stage.task.phase(), rope = () => stage.task.rope();
  const foot = () => stage.task.up(10.3, 1.9, 1.6);
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...bodies(pair()), foot(), stage.task.up(16, 6, 4), up(tree().top, .5)], front: view([-.25, -1]), elevation: 24, cut: true, floor: 'auto' },
      act: all(() => { if (!stage.task.start('fly', { beats: taps })) stage.task.abort(); }, () => stage.mosi.look(foot())) },
    { at: .05, wait: { until: arrived, timeout: 5 } },
    // The child's moment: the pair at the rope's end, the cliff going up behind them; the shot holds still until the taps are done.
    { at: .1, shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(pair()), foot(), stage.task.up(15, 5.2, 3.4), stage.task.up(8, 4.5, 0)], front: view([-.3, -1]), elevation: 16, cut: true, floor: 'auto' }, act: all(stillGoing, () => stage.mosi.look(foot())) },
    { at: .15, wait: { tap: 'cliff', count: taps, timeout,
      onTap: () => stage.task.beat(),
      // No taps: "Við gerum þetta saman!" and they fly it up on their own.
      onTimeout: () => { stage.say('together'); while (stage.task.beat()); } } },
    { at: .2, wait: { until: () => ['leg', 'wrap', 'tie', 'cheer'].includes(phase()) || !stage.task.busy(), timeout: 5 } },
    // Up the cliff after them (the shot follows the pair, and the rope behind).
    { at: .25, shot: { kind: 'follow', subjects: () => [...bodies(pair()), rope()], front: view([-.3, -1]), elevation: 20, cut: true, floor: 'auto' } },
    { at: .28, wait: { until: () => stage.task.done() >= 2 || ['wrap', 'tie', 'cheer'].includes(phase()) || !stage.task.busy(), timeout: 9 } },
    // (a second framing of the flight, from the side, for the last leg to the tree: no stretch of watching passes about 6 seconds)
    { at: .29, shot: { kind: 'follow', scale: 'wide', subjects: () => [...bodies(pair()), rope(), tree().top], front: view([.1, -1]), elevation: 20, cut: true, floor: 'auto' } },
    { at: .3, wait: { until: () => ['wrap', 'tie', 'cheer'].includes(phase()) || !stage.task.busy(), timeout: 10 } },
    // At the tree: they fly round the trunk and the rope goes round it.
    { at: .35, shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(pair()), tree().middle, up(tree().base, 3.4)], front: view([.15, -1]), elevation: 22, cut: true, floor: 'auto' }, act: () => stage.mosi.look(tree().middle) },
    { at: .4, wait: { until: () => ['tie', 'cheer'].includes(phase()) || !stage.task.busy(), timeout: 8 } },
    // The rope draws taut from the foot of the path to the tree.
    { at: .45, shot: { kind: 'wide', scale: 'wide', subjects: () => [foot(), tree().middle, up(tree().base, 3.4), stage.task.up(16.4, 6.4, 3.6)], front: view([.45, -1]), elevation: 20, cut: true, floor: 'auto' }, act: () => stage.mosi.gesture('clap'),
      fx: { kind: 'done', at: () => tree().middle } },
    { at: .5, wait: { until: () => !stage.task.busy(), timeout: 8 } },
    { at: .55, shot: { release: true, duration: .9 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}
