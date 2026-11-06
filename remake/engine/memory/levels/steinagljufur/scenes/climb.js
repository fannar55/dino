/**
 * Level 2's climb as a script for the scene runner (scenes.js): the rope is tied from the foot of the steep path to the tree on the rim, and everyone walks up the path with it beside them as a
 * handrail (nobody climbs the rope), Mosi first, to the rim, where the Flugeðlur wait by the tree. The step is a travel step: it starts by itself and Mosi says its line as it does
 * (`g2_climb`: game.js launchAction). Built like scenes/through.js, on the same `stage.task`.
 */
const all = (...fns) => fns;
const up = (point, metres) => point.clone().setY(point.y + metres);

/**
 * The scene: a wide cut of the group at the foot of the path and the rope going up beside it, a follow cut on the climbers up the first bends, a wide cut high on the cliff as they come to the
 * rim, and a cut of the whole group on the rim; then the camera goes to its resting view there.
 */
export function climbScene(stage) {
  const everyone = () => [...stage.friends().filter(actor => actor.root.visible).map(actor => actor.root.position.clone()), stage.mosi.body()];
  const climbers = () => everyone().filter(p => p.x !== undefined);
  const view = front => () => stage.task.view(front), phase = () => stage.task.phase(), ended = () => !stage.task.busy();
  const bodies = () => stage.friends().filter(actor => actor.species !== 'pteranodon').map(actor => actor.root.position.clone());
  const mosiAt = () => stage.mosi.actor.root.position.clone();
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...everyone(), stage.task.up(16, 5.2, 3.4), stage.task.up(9.5, 2.5, -1.4)], front: view([-.25, -1]), elevation: 22, cut: true, floor: 'auto' },
      act: all(() => { if (!stage.task.start('climb')) stage.task.abort(); }, () => stage.mosi.look(stage.task.up(16, 5, 3))) },
    // Up the first bends with them (a follow cut: the shot goes with the group).
    { at: 1.6, shot: { kind: 'follow', subjects: () => [mosiAt(), ...bodies().filter(p => p.y > 1.6).slice(0, 6)], front: view([-.2, -1]), elevation: 22, cut: true, floor: 'auto' } },
    { at: 1.65, wait: { until: () => stage.task.mosiHeight() > 4.6 || ended(), timeout: 6 } },
    // High on the cliff: the last bends and the rim (the rope beside them all the way).
    { at: 1.7, shot: { kind: 'wide', scale: 'wide', subjects: () => [mosiAt(), stage.task.up(21, 8, 7.6), stage.task.up(27, 9, 8), stage.task.up(23.4, 11, 12)], front: view([-.3, -1]), elevation: 18, cut: true, floor: 'auto' } },
    { at: 1.75, wait: { until: () => phase() === 'cheer' || ended(), timeout: 8 } },
    // They are on the rim, and cheer.
    { at: 1.8, shot: { kind: 'wide', subjects: () => [...everyone(), stage.task.up(23.4, 11, 12)], front: view([-.35, -1]), elevation: 20, cut: true, floor: 'auto' }, act: () => stage.mosi.gesture('clap') },
    { at: 1.85, wait: { until: ended, timeout: 4 } },
    { at: 1.9, shot: { release: true, duration: .9 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}
void up;
