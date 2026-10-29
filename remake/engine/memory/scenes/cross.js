/**
 * Over the river: Mosi leads all six friends across the new log bridge, as a script for the scene runner (scenes.js)
 * on the world's `stage` (world.js; see scenes/branch.js). For this one the stage also gives:
 *   mosi.walk(plan)           Mosi walks the crossing's way for him (false when he is already over)
 *   mosi.walking()            he is still on his way              mosi.body()   the middle of his back
 *   friends()                 all six friends                     task.logNear() / task.logEnd()   the bridge's two ends
 *   task.alongBridge(point)   metres along the bridge from its near end (negative before it)
 * `timing` is Mosi's walk, in seconds from the start: `entry` his middle passes the near end of the deck, `deck`
 * his first step onto it, `mid` mid-bridge, `arrive` at his place at staging; `lead` what the friends follow
 * ({ at, half }, see bridge-adventure start), null when he does not walk.
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const centre = points => points.reduce((sum, p) => sum.add(p), points[0].clone().multiplyScalar(0)).multiplyScalar(1 / points.length);
const up = (point, metres) => point.clone().setY(point.y + metres);

/**
 * A wide cut as they set off, a follow cut beside them as Mosi steps onto the log, a cut over Mosi's shoulder at
 * mid-bridge (the far bank ahead), a cut back to the friends coming over behind him, and a wide cut of the arrival
 * with Mosi at staging. When the last of them has arrived the camera cuts back and the child can play again.
 */
export function crossScene(stage, plan, timing) {
  const friends = () => stage.friends();
  const group = () => [stage.mosi.body(), ...bodies(friends())];
  const near = () => stage.task.logNear(), far = () => stage.task.logEnd();
  // Those on the log or just about to step on (a stretch of 7 m of the way around it).
  const onLog = () => { const points = bodies(friends().filter(actor => { const s = stage.task.alongBridge(actor.root.position); return s > -4 && s < 10.5; })); return points.length ? points : bodies(friends()); };
  const deck = timing.deck, follow = Math.max(1, deck - .7), mid = Math.max(follow + 1.4, timing.mid), behind = mid + 1.5, arrival = Math.max(behind + 1.6, timing.arrive - .4);
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...group(), near()], cut: true },
      act: all(() => { if (stage.task.start('cross', { lead: timing.lead })) stage.mosi.walk(plan); else stage.task.abort(); }, () => stage.pairGesture('triceratops', 'hop'), () => stage.pairGesture('stegosaurus', 'hop')) },
    // Beside them as Mosi steps onto the log.
    { at: follow, shot: { kind: 'follow', subjects: () => [stage.mosi.body(), stage.mosi.head(), ...onLog()], front: stage.sideOn(near(), far()), cut: true } },
    // Over his shoulder from behind, the far bank ahead.
    { at: mid, shot: { kind: 'shoulder', subjects: () => [stage.mosi.head(), up(far(), .6), up(stage.task.point('staging'), .2)], elevation: 26, cut: true } },
    // Back to the friends coming over behind him.
    { at: behind, shot: { kind: 'follow', subjects: onLog, front: stage.sideOn(near(), far()), elevation: 20, cut: true } },
    // Over: Mosi at staging, the friends arriving.
    { at: arrival, shot: { kind: 'wide', subjects: () => [...group(), far(), up(stage.mosi.body(), 1)], cut: true },
      act: () => stage.mosi.look(centre(bodies(friends()))) },
    { at: arrival + .05, wait: { until: () => !stage.task.busy() && !stage.mosi.walking(), timeout: 9 } },
    { at: arrival + .1, shot: { release: true, cut: true }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('cheer')) },
  ];
}
