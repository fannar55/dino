/**
 * The first obstacle of "Hvar er vinur minn?" as scripts for the scene runner (scenes.js): the Þórseðla pair lifts
 * the branch with the child's taps, and a wrong friend's funny go at an obstacle. The world plays them on the game
 * clock (world.js builds `stage`; first-minute.js lists what it already had). For these it adds:
 *   pair(species)                 the pair's two actors          pairGesture(species, name)   a GESTURES move for both
 *   say(line)                     Mosi's voice line now (for wait callbacks, which have no line of their own)
 *   task.start(id, { beats })     the bridge adventure's task; false when it cannot start
 *   task.beat()                   one beat of the tap-along      task.waitingBeat()           the beat it waits for, or null
 *   task.busy()                   the task (or a failure) still runs
 *   task.abort()                  stops this script and gives the camera back (a blocked route)
 *   task.point(id)                the obstacle, world space      task.branch()                points along the branch
 * Line keys as in first-minute.js. The big "Upp!" of each step comes with the adventure's beat event (game.js).
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const centre = points => points.reduce((sum, p) => sum.add(p), points[0].clone().multiplyScalar(0)).multiplyScalar(1 / points.length);
const up = (point, metres) => point.clone().setY(point.y + metres);
// The branch shots look from the south, low across the glade: the two Þórseðlur side by side in profile, the log behind them.
const HERO_FRONT = [.12, 0, 1], CHEER_FRONT = [.45, 0, 1];
// A wrong friend's failure, seen from in front of it: how far the camera may turn toward the search camera's side,
// how high it looks down and how near it stands (at the log, closer and from above the Þríhyrnur at home).
// Mosi's laugh is seen from his south-west, three-quarters: the friends (all west of him) stay out of that close shot.
const LAUGH_FRONT = [-.6, 0, .8];
const FAIL_VIEW = { branch: { turn: .65, elevation: 22, scale: 'action' }, log: { turn: .3, elevation: 36, scale: 'close' }, bark: { turn: .9, elevation: 32, scale: 'action' } };

/**
 * The branch: a wide establishing cut, the two Þórseðlur walk to it (a follow cut, then a close cut while they reach
 * for it), a still low hero shot while the child taps (`taps` taps in `timeout` seconds, each lifting it a step:
 * the beat event brings the strain, dust, falling leaves and "Upp!"); if the child does not tap, Mosi says "Við gerum
 * þetta saman!" and they finish on their own. Then they cheer, Mosi claps, and the camera glides back to the glade.
 */
export function branchScene(stage, { taps = 3, timeout = 4 } = {}) {
  const brontos = () => stage.pair('brontosaurus');
  const crowns = () => brontos().map(actor => actor.getSupportPosition());
  const heads = () => brontos().map(actor => actor.getNosePosition());
  const home = centre(brontos().map(actor => actor.root.position.clone()));
  // Arrived under the branch (the first beat is due), or stopped (a blocked route): either way the walk is over.
  const arrived = () => stage.task.waitingBeat() !== null || !stage.task.busy();
  const stillGoing = () => { if (!stage.task.busy()) stage.task.abort(); };
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...stage.task.branch(), ...bodies(brontos())], cut: true },
      act: all(() => { if (!stage.task.start('lift', { beats: taps })) stage.task.abort(); }, () => stage.mosi.look(stage.task.point('branch')), () => stage.pairGesture('brontosaurus', 'hop')) },
    { at: 1.3, shot: { kind: 'follow', subjects: () => bodies(brontos()), front: () => stage.sideOn(home, stage.task.point('branch')), cut: true }, act: stillGoing },
    { at: 1.35, wait: { until: arrived, timeout: 1.5 } },
    { at: 1.4, shot: { kind: 'face', subjects: () => [...crowns(), ...heads()], front: HERO_FRONT, cut: true }, act: stillGoing },
    { at: 1.45, wait: { until: arrived, timeout: 8 } },
    // The child's moment. The shot holds still (no cut) until the taps are done or the wait runs out.
    { at: 1.5, shot: { kind: 'hero', subjects: () => [...crowns(), ...crowns().map(p => up(p, 1.05)), ...brontos().map(actor => actor.root.position.clone())], front: HERO_FRONT, cut: true },
      act: all(stillGoing, () => stage.mosi.look(centre(crowns()))), say: 'lift' },
    { at: 1.55, wait: { tap: 'branch', count: taps, timeout,
      onTap: () => stage.task.beat(),
      // No taps: the friends do it themselves, still in steps (the adventure plays each queued beat in turn).
      onTimeout: () => { stage.say('together'); while (stage.task.beat()); } } },
    { at: 1.6, wait: { until: () => !stage.task.busy(), timeout: 6 } },
    // Up! A cut to their faces: they cheer and call together, Mosi claps.
    // A new angle on the same moment: the raised branch over the two of them, both whole.
    { at: 1.65, shot: { kind: 'hero', subjects: () => [...crowns().map(p => up(p, .8)), ...heads(), ...brontos().map(actor => actor.root.position.clone())], front: CHEER_FRONT, elevation: 10, cut: true },
      act: all(() => stage.pairGesture('brontosaurus', 'cheer'), () => stage.mosi.gesture('clap')),
      fx: { kind: 'stars', at: () => up(centre(crowns()), .4), count: 12 }, sound: { name: 'call', species: 'brontosaurus' } },
    { at: 3.05, shot: { release: true, duration: .8 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}

/**
 * A wrong friend has a go (bridge-adventure startFail: hop there, its species' failure, hop back; `timing` is what
 * it returned, with the way the pair faces there): a wide cut on the run, a close cut on the failure from in front
 * of them, three-quarters (stage.faceOn), so their faces show, a cut to Mosi laughing "Kannski einhver annar?",
 * then a cut back to the glade, where the bubbles come back (a glide from the close shot would sweep the whole
 * group past the lens, over the triangle budget).
 */
export function failScene(stage, species, target, timing) {
  const pair = () => stage.pair(species), point = () => stage.task.point(target);
  const view = FAIL_VIEW[target] ?? FAIL_VIEW.branch, start = centre(pair().map(actor => actor.root.position.clone())), front = stage.faceOn(timing.yaw ?? 0, view.turn);
  const laughAt = timing.run + timing.attempt * .62;
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...bodies(pair()), point(), start], cut: true },
      act: all(() => stage.mosi.look(point()), () => stage.pairGesture(species, 'hop')) },
    { at: timing.run, shot: { kind: 'wide', scale: view.scale, subjects: () => [...bodies(pair()), ...pair().map(actor => up(actor.root.position, 1.3)), point()], front, elevation: view.elevation, cut: true },
      act: () => stage.mosi.look(centre(pair().map(actor => actor.getNosePosition()))) },
    { at: laughAt, shot: { kind: 'face', subjects: () => [stage.mosi.head(), up(stage.mosi.head(), -.6)], front: LAUGH_FRONT, cut: true },
      act: all(() => stage.mosi.gesture('laugh'), () => stage.mosi.look(stage.camera())), say: 'other' },
    { at: laughAt + .05, wait: { until: () => !stage.task.busy(), timeout: 6 } },
    { at: laughAt + .1, shot: { release: true, cut: true } },
  ];
}
