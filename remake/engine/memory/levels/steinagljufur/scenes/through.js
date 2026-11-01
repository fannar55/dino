/**
 * Level 2's travel through the tunnel as a script for the scene runner (scenes.js): once every friend and every fossil is found and the rocks are gone, Mosi leads everyone through the lit
 * tunnel (about 9 seconds). The Kambeðlur lead with their plates still glowing, the rest follow from where they wait in the glade and file into the bore; a cut, and they come out of the exit
 * of the tunnel in the upper gorge (upper.js), and gather on the floor in front of the high ledge. Built like scenes/headbutt.js; `stage.task` (the level's world adds it) says
 *   task.start('through')   task.phase()   what the mover is doing ('gather', 'enter', 'inside', 'exit', 'lineup')      task.cutUpper()   the cut: everyone is in the upper gorge
 *   task.mouth()            the tunnel's mouth in the glade, world space                                                  task.front(turn)  the way from it toward the search camera
 *   task.view(front)        a camera direction (to the camera) from a direction of the upper gorge's frame [dx forward, dz to the right]
 *   task.up(x, y, z)        a point of the upper gorge's frame in the scene                                               task.exit()  the exit's mouth, world space
 */
const all = (...fns) => fns;
const up = (point, metres) => point.clone().setY(point.y + metres);
const watch = stage => () => stage.friends().filter(actor => actor.root.visible).map(actor => actor.root.position.clone());

/**
 * The scene: a wide cut on everyone running to the tunnel, a low cut on the mouth as they file in (the Kambeðlur first), a cut to the exit as they come out one by one, and a wide cut
 * of the floor in front of the ledge when they have gathered; then the camera goes to its resting view there (the ledge is next).
 */
export function throughScene(stage) {
  const crowd = watch(stage), mouth = () => stage.task.mouth(), front = turn => () => stage.task.front(turn);
  const phase = () => stage.task.phase(), ended = () => !stage.task.busy();
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...crowd(), mouth(), up(mouth(), 2.4)], front: front(.55), elevation: 30, cut: true, floor: 'auto' },
      act: all(() => { if (!stage.task.start('through')) stage.task.abort(); }, () => stage.mosi.look(mouth())) },
    // They gather at the mouth and the Kambeðlur lead the way in.
    { at: .05, wait: { until: () => phase() === 'enter' || ended(), timeout: 5 } },
    { at: .1, shot: { kind: 'hero', subjects: () => [...crowd().filter(p => p.distanceTo(mouth()) < 9), mouth(), up(mouth(), 2.2)], front: front(.5), elevation: 12, cut: true, floor: 'auto' } },
    { at: .15, wait: { until: () => phase() === 'inside' || ended(), timeout: 7 } },
    // The cut: they come out of the exit of the tunnel, one after the other.
    { at: .2, act: () => { if (!stage.task.cutUpper()) stage.task.abort(); },
      shot: { kind: 'wide', subjects: () => [stage.task.exit(), up(stage.task.exit(), 2.4), stage.task.up(-14, 1, -3), stage.task.up(-11, 1, 3)], front: () => stage.task.view([.55, -1]), elevation: 17, cut: true, floor: 'auto' } },
    { at: .25, wait: { until: () => phase() === 'lineup' || ended(), timeout: 7 } },
    // Everyone is out: the floor in front of the ledge, the slab up on it.
    { at: .3, shot: { kind: 'wide', subjects: () => [...crowd(), stage.task.up(3, 4.6, -4), stage.task.up(8, 2.5, 4)], front: () => stage.task.view([-.25, -1]), elevation: 22, cut: true, floor: 'auto' }, act: () => stage.mosi.look(stage.task.up(3, 3, 0)) },
    { at: .35, wait: { until: ended, timeout: 4 } },
    { at: .4, shot: { release: true, cut: true, floor: 'auto' } },
  ];
}
