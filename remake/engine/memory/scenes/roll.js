/**
 * The second obstacle of "Hvar er vinur minn?" as a script for the scene runner (scenes.js): the Þríhyrna pair rolls
 * the log into a bridge with the child's taps, "Einn, tveir, ÝTA!". Built like scenes/branch.js, on the same `stage`
 * (world.js), which for this one also gives:
 *   task.isBuilt()          the log has landed as a bridge      task.logNear()          the log's near end (it turns about it)
 *   task.logEnd(progress)   the log's far end when it has rolled that far (now, without one), world space
 *   task.lowerBranch()      the Þórseðlur let the branch go and walk home (false when they cannot now)
 *   task.builderSpots()     where the Þríhyrnur step back to once it has landed (their places in line to cross)
 * The big word of each push ("Einn!", "Tveir!", "ÝTA!") comes with the adventure's beat event (game.js).
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const centre = points => points.reduce((sum, p) => sum.add(p), points[0].clone().multiplyScalar(0)).multiplyScalar(1 / points.length);
const up = (point, metres) => point.clone().setY(point.y + metres);
// The push from the glade's side, high enough to see the whole sweep of the log over the river past the two Þríhyrnur;
// the new bridge from low down on the glade's side as they step back into line for it; their cheer face on, from
// the glade's side they have turned to; the branch let go from the south, under it.
const PUSH_FRONT = [.35, 0, .94], BRIDGE_FRONT = [.2, 0, 1], CHEER_FRONT = [.5, 0, .87], BRANCH_FRONT = [.3, 0, 1];

/**
 * The log: a wide cut while the Þríhyrnur hop off, a follow cut on their walk, then the still shot of the push: Mosi says "Einn, tveir, ÝTA!" and every tap rolls the log a third (the adventure's beat
 * brings the strain, the dust and the word). No taps in `timeout` seconds: "Við gerum þetta saman!" and they finish
 * on their own. The landing throws up water (the adventure) and shakes the camera; a low hero shot of the new bridge
 * as they step back into line for it, a face cut to the cheer; then the Þórseðlur let the branch go and walk home, and the camera glides back.
 */
export function rollScene(stage, { taps = 3, timeout = 4 } = {}) {
  const tris = () => stage.pair('triceratops'), brontos = () => stage.pair('brontosaurus');
  const heads = () => tris().map(actor => actor.getNosePosition());
  const home = centre(tris().map(actor => actor.root.position.clone()));
  const near = () => stage.task.logNear();
  const sweep = () => [0, 1 / 3, 2 / 3, 1].map(t => stage.task.logEnd(t));
  const arrived = () => stage.task.waitingBeat() !== null || !stage.task.busy();
  const stillGoing = () => { if (!stage.task.busy()) stage.task.abort(); };
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...bodies(tris()), near(), stage.task.logEnd()], cut: true },
      act: all(() => { if (!stage.task.start('roll', { beats: taps })) stage.task.abort(); }, () => stage.mosi.look(near()), () => stage.pairGesture('triceratops', 'hop')) },
    { at: 1.2, shot: { kind: 'follow', subjects: () => bodies(tris()), front: () => stage.sideOn(home, near()), cut: true }, act: stillGoing },
    // The child's moment: from 3.2 s the shot holds still over the whole sweep (the walk ends in it) until the taps
    // are done or the wait runs out.
    { at: 3.2, shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(tris()), near(), ...sweep()], front: PUSH_FRONT, elevation: 30, cut: true }, act: stillGoing },
    { at: 3.25, wait: { until: arrived, timeout: 8 } },
    { at: 3.3, act: all(stillGoing, () => stage.mosi.look(centre(heads()))), say: 'push' },
    { at: 3.35, wait: { tap: 'log', count: taps, timeout,
      onTap: () => stage.task.beat(),
      onTimeout: () => { stage.say('together'); while (stage.task.beat()); } } },
    { at: 3.4, wait: { until: () => stage.task.isBuilt() || !stage.task.busy(), timeout: 6 } },
    // Down it comes over the river: a jolt.
    { at: 3.45, fx: { kind: 'shake', strength: .12, seconds: .35 } },
    // The new bridge from low down, with the two of them and the places in line they are stepping back to.
    { at: 3.9, shot: { kind: 'hero', subjects: () => [near(), stage.task.logEnd(), ...heads(), ...tris().map(actor => actor.root.position.clone()), ...stage.task.builderSpots()], front: BRIDGE_FRONT, elevation: 9, cut: true } },
    // We did it! Face to face: both cheer and call, Mosi claps.
    { at: 5.3, shot: { kind: 'face', subjects: () => [...heads(), ...heads().map(p => up(p, .5)), ...tris().map(actor => actor.root.position.clone())], front: CHEER_FRONT, elevation: 10, cut: true },
      act: all(() => stage.pairGesture('triceratops', 'cheer'), () => stage.mosi.gesture('clap')),
      fx: { kind: 'stars', at: () => up(centre(heads()), .5), count: 12 }, sound: { name: 'call', species: 'triceratops' } },
    { at: 6.5, wait: { until: () => !stage.task.busy(), timeout: 3 } },
    // The bridge is there: the Þórseðlur let the branch go and go back to the others.
    { at: 6.6, shot: { kind: 'wide', scale: 'action', subjects: () => [...stage.task.branch(), ...stage.task.branch().map(p => up(p, 1.4)), ...bodies(brontos())], front: BRANCH_FRONT, elevation: 14, cut: true },
      act: all(() => stage.task.lowerBranch(), () => stage.mosi.look(centre(bodies(brontos())))) },
    { at: 8, shot: { kind: 'follow', subjects: () => bodies(brontos()), front: () => stage.sideOn(centre(bodies(brontos())), stage.homeOf('brontosaurus')), cut: true } },
    { at: 8.05, wait: { until: () => !stage.task.busy(), timeout: 6 } },
    { at: 8.1, shot: { release: true, duration: .8 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}
