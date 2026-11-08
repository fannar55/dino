/**
 * Level 2's first task as a script for the scene runner (scenes.js): the Kambeðlur light the dark tunnel with the child's taps. The tunnel mouth is in the back wall of the
 * gorge; the two Kambeðlur hop to it and stand one at each side, and each tap lights their plates a step (the plates glow, the dark gives way, the crystals glint; mover.js
 * raises 'light-step' for each and 'tunnel-lit' for the last). Built like levels/berjalundur/scenes/branch.js, on the same `stage`; the level's world adds, as `stage.task`:
 *   task.start(id, { beats })   the mover's task; false when it cannot start      task.beat()   one tap of the child                task.waitingBeat()   the beat it waits for, or null
 *   task.busy()                 the task (or a go) still runs                     task.abort()  stops this script and gives the camera back
 *   task.lit()                  the whole light has come                          task.mouth()  the tunnel's mouth, world space      task.pile()   { front, top, centre } of the rockfall
 *   task.front(turn)            the horizontal way from the mouth toward the camera, turned `turn` radians toward the search camera's side
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const up = (point, metres) => point.clone().setY(point.y + metres);

/**
 * The scene: a wide cut on the pair's hop to the tunnel, a follow cut on its last steps, a low shot from the glade's side while the child taps (`taps` taps in `timeout` seconds,
 * each a step of the light; no taps and Mosi says "Við gerum þetta saman!" and they light it on their own), then a cut into the lit tunnel where the pile of rocks stands in the
 * way, the pair's cheer, and the camera glides back to the glade.
 */
export function lightScene(stage, { taps = 3, timeout = 4 } = {}) {
  const pair = () => stage.pair('stegosaurus'), mouth = () => stage.task.mouth(), pile = () => stage.task.pile();
  const arrived = () => stage.task.waitingBeat() !== null || !stage.task.busy();
  const stillGoing = () => { if (!stage.task.busy()) stage.task.abort(); };
  const front = turn => () => stage.task.front(turn);
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...bodies(pair()), mouth(), up(mouth(), 2.4)], front: front(.5), elevation: 22, cut: true },
      act: all(() => { if (!stage.task.start('light', { beats: taps })) stage.task.abort(); }, () => stage.mosi.look(mouth()), () => stage.pairGesture('stegosaurus', 'hop')) },
    { at: 1.3, shot: { kind: 'follow', subjects: () => bodies(pair()), front: front(.4), cut: true }, act: stillGoing },
    { at: 1.35, wait: { until: arrived, timeout: 3 } },
    // The child's moment: the pair at the mouth from low down, the dark between them. The shot holds still until the taps are done or the wait runs out.
    { at: 1.4, shot: { kind: 'hero', subjects: () => [...bodies(pair()), mouth(), up(mouth(), 2.2)], front: front(.55), elevation: 11, cut: true }, act: all(stillGoing, () => stage.mosi.look(mouth())) },
    { at: 1.5, wait: { tap: 'tunnel', count: taps, timeout,
      onTap: () => stage.task.beat(),
      // No taps: "Við gerum þetta saman!" and the pair lights it step by step on its own.
      onTimeout: () => { stage.say('together'); while (stage.task.beat()); } } },
    { at: 1.55, wait: { until: () => stage.task.lit() || !stage.task.busy(), timeout: 9 } },
    // Lit: a cut into the tunnel, and the pile of rocks that shuts it stands there in the light (the pair cheers at the sides, Mosi claps).
    { at: 1.6, shot: { kind: 'hero', subjects: () => [pile().centre, pile().top, mouth(), up(mouth(), 1.6)], front: front(.6), elevation: 12, cut: true }, act: all(() => stage.mosi.gesture('clap'), () => stage.mosi.look(pile().centre)),
      fx: { kind: 'done', at: () => up(mouth(), 1.2) } },
    { at: 3.9, shot: { kind: 'wide', subjects: () => [...bodies(pair()), mouth(), up(mouth(), 2.6), pile().top], front: front(.45), elevation: 14, cut: true } },
    { at: 3.95, wait: { until: () => !stage.task.busy(), timeout: 4 } },
    { at: 4, shot: { release: true, duration: .8 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}
