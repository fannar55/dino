/**
 * Level 2's last task (Task 6) as scripts for the scene runner (scenes.js): everyone pulls the dead trunk over the gap, and walks over it to Sólarsyllan.
 *
 * The pull is a together step: the child's tap on the trunk starts it at once (no bubbles and no pair to pick: game.js askObstacle). The Flugeðlur fly the second rope out over the
 * gap, round the stone on Sólarsyllan and back up to the stub near the trunk's top, and knot it there, while everyone else lines up on it; then Mosi says "Einn, tveir, TOGA!" and
 * each tap of the child is a pull: everyone leans back and strains and the trunk tilts a step (the beat's big word comes with the beat event, game.js); the third throws it over the
 * gap, where it lies as a bridge. The walk is a travel step: it starts by itself and Mosi says its line as it does (`g2_bridge`: game.js launchAction). Built like scenes/fly.js
 * and scenes/climb.js, on the same `stage.task`; these also use
 *   task.trunk()   { base, middle, top, tie, roots, fallen, near, far } of the trunk now (world space: `near` and `far` are the rims under it)
 *   task.rope2()   the second rope's end now      task.stone()   the stone on Sólarsyllan      task.local(point)   a point of the scene in the upper gorge's frame
 *   task.phase()   what the mover is doing ('gather', 'leg', 'knot', 'down', 'ready', 'tug', 'fall', 'landed', 'cheer'; the walk's 'walk', 'cheer')
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const up = (point, metres) => point.clone().setY(point.y + metres);

/**
 * The pull: a wide cut of the group on the clifftop and the trunk at the gap; a follow cut on the Flugeðlur as they fly the rope out over the gap and round the stone; a cut at the
 * trunk's top as they knot it; then the still shot of the line, the trunk and the gap while the child taps (`taps` taps in `timeout` seconds; no taps: "Við gerum þetta saman!" and
 * they pull it over on their own). It falls in that shot (the mover shakes the camera); a wide cut of the new bridge as they cheer; then the camera glides to its resting view.
 */
export function pullScene(stage, { taps = 3, timeout = 4 } = {}) {
  const view = front => () => stage.task.view(front), phase = () => stage.task.phase(), ended = () => !stage.task.busy();
  const trunk = () => stage.task.trunk(), flyers = () => stage.pair('pteranodon');
  const everyone = () => [...stage.friends().filter(actor => actor.root.visible).map(actor => actor.root.position.clone()), stage.mosi.body()];
  const arrived = () => stage.task.waitingBeat() !== null || ended();
  const stillGoing = () => { if (ended()) stage.task.abort(); };
  const at = (x, y, z) => stage.task.up(x, y, z);
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...everyone(), trunk().top, trunk().base, trunk().far], front: view([-.25, -1]), elevation: 16, cut: true, floor: 'auto' },
      act: all(() => { if (!stage.task.start('pull', { beats: taps })) stage.task.abort(); }, () => stage.mosi.look(trunk().middle)) },
    // Out over the gap with the rope's end, and round the stone (the shot goes with the pair, the rope behind them)
    { at: .1, wait: { until: () => phase() === 'leg' || ended(), timeout: 6 } },
    { at: .15, shot: { kind: 'follow', scale: 'wide', subjects: () => [...bodies(flyers()), stage.task.rope2(), stage.task.stone(), trunk().near], front: view([-.1, -1]), elevation: 18, cut: true, floor: 'auto' }, act: () => stage.mosi.look(stage.task.stone()) },
    { at: .2, wait: { until: () => phase() !== 'leg' || ended(), timeout: 14 } },
    // At the trunk's top: they hover at the stub while it is knotted
    { at: .25, shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(flyers()), trunk().tie, up(trunk().top, .4), trunk().middle], front: view([-.3, -1]), elevation: 10, cut: true, floor: 'auto' }, act: () => stage.mosi.look(trunk().tie) },
    { at: .3, wait: { until: () => !['gather', 'leg', 'knot'].includes(phase()) || ended(), timeout: 5 } },
    // The child's moment: the whole line, the rope round the stone, the trunk up to its top and the gap; the shot holds still until the taps are done and the trunk is over.
    { at: .35, shot: { kind: 'wide', scale: 'action', subjects: () => [...everyone(), trunk().top, trunk().base, at(42.5, 15, 9.2), stage.task.stone(), trunk().far], front: view([-.22, -1]), elevation: 14, cut: true, floor: 'auto' },
      act: all(stillGoing, () => stage.mosi.look(trunk().middle)) },
    { at: .4, wait: { until: arrived, timeout: 9 } },
    { at: .45, act: all(stillGoing, () => stage.mosi.look(trunk().middle)), say: 'g2_pull' },
    { at: .5, wait: { tap: 'trunk', count: taps, timeout,
      onTap: () => stage.task.beat(),
      // No taps: "Við gerum þetta saman!" and they pull it over on their own.
      onTimeout: () => { stage.say('together'); while (stage.task.beat()); } } },
    { at: .55, wait: { until: () => ['landed', 'cheer'].includes(phase()) || ended(), timeout: 9 } },
    // The bridge: the trunk lies over the gap, its top on Sólarsyllan; everyone cheers.
    { at: .6, shot: { kind: 'wide', subjects: () => [...everyone(), trunk().base, trunk().top, trunk().near, trunk().far, at(41.3, 6, 9.2)], front: view([-.15, -1]), elevation: 14, cut: true, floor: 'auto' },
      act: all(() => stage.mosi.gesture('clap'), () => stage.mosi.look(trunk().top)) },
    { at: .65, wait: { until: ended, timeout: 5 } },
    { at: .7, shot: { release: true, duration: .9 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}

/**
 * The walk over the trunk: a wide cut of the bridge and the group at its foot; a follow cut on the walkers as they go over it one behind the other (the Flugeðlur fly over); a wide
 * cut of everyone on Sólarsyllan; then the camera goes to its resting view there.
 */
export function walkScene(stage) {
  const view = front => () => stage.task.view(front), ended = () => !stage.task.busy(), trunk = () => stage.task.trunk();
  const walkers = () => [...stage.friends().filter(actor => actor.root.visible && actor.species !== 'pteranodon'), stage.mosi.actor];
  const everyone = () => [...stage.friends().filter(actor => actor.root.visible).map(actor => actor.root.position.clone()), stage.mosi.body()];
  // (the walkers near the trunk: those that have not yet got far onto Sólarsyllan, and the trunk's two ends)
  const crossing = () => { const near = walkers().filter(actor => { const p = stage.task.local(actor.root.position); return p.x > 37 && p.x < 49; }).map(actor => actor.root.position.clone()); return [...near, trunk().base, trunk().top]; };
  const mosiOver = () => stage.task.local(stage.mosi.actor.root.position).x > 46.2;
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...everyone(), trunk().base, trunk().top, trunk().far], front: view([-.2, -1]), elevation: 16, cut: true, floor: 'auto' },
      act: all(() => { if (!stage.task.start('walk')) stage.task.abort(); }, () => stage.mosi.look(trunk().far)) },
    // Over the trunk, one behind the other
    { at: 1.3, shot: { kind: 'follow', subjects: crossing, front: view([-.12, -1]), elevation: 14, cut: true, floor: 'auto' } },
    { at: 1.35, wait: { until: () => mosiOver() || ended(), timeout: 9 } },
    // Everyone on Sólarsyllan
    { at: 1.4, shot: { kind: 'wide', subjects: () => [...everyone(), stage.task.up(57, 9, 3), stage.task.up(50, 9, 11.6)], front: view([-.25, -1]), elevation: 18, cut: true, floor: 'auto' }, act: () => stage.mosi.gesture('clap') },
    { at: 1.45, wait: { until: ended, timeout: 6 } },
    { at: 1.5, shot: { release: true, duration: .9 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}
