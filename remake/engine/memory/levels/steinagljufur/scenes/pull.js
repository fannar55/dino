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
 *   task.leg()     the leg of the Flugeðlur's flight now (0 out over the gap, 1 round the stone, 2 back up to the top; -1 before)
 *   task.phase()   what the mover is doing ('gather', 'leg', 'knot', 'down', 'ready', 'tug', 'fall', 'landed', 'cheer'; the walk's 'walk', 'cheer')
 */
import { celebrateScene } from './celebrate.js';

const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const up = (point, metres) => point.clone().setY(point.y + metres);

/**
 * The pull: a wide cut of the group on the clifftop and the trunk at the gap; a follow cut on the Flugeðlur as they fly the rope out over the gap and round the stone; a cut at the
 * trunk's top as they knot it; then the still shot of the line, the trunk and the gap while the child taps (`taps` taps in `timeout` seconds; no taps: "Við gerum þetta saman!" and
 * they pull it over on their own). It falls in that shot (the mover shakes the camera); a wide cut of the new bridge as they cheer; then the camera glides to its resting view.
 * On a tall screen (a phone or a tablet held up) every cut looks along the line from behind it and above, a little from the open side, as the clifftop's own view there does: from
 * the open side the line, the gap and Sólarsyllan lie across a narrow screen and were small in it (Task 6 fix round 1).
 */
export function pullScene(stage, { taps = 3, timeout = 4 } = {}) {
  const tall = stage.aspect() < 1, view = (front, along = [-.9, -.42]) => () => stage.task.view(tall ? along : front), phase = () => stage.task.phase(), ended = () => !stage.task.busy();
  const trunk = () => stage.task.trunk(), flyers = () => stage.pair('pteranodon');
  const everyone = () => [...stage.friends().filter(actor => actor.root.visible).map(actor => actor.root.position.clone()), stage.mosi.body()];
  const arrived = () => stage.task.waitingBeat() !== null || ended();
  const stillGoing = () => { if (ended()) stage.task.abort(); };
  const at = (x, y, z) => stage.task.up(x, y, z);
  return [
    { at: 0, shot: { kind: 'wide', ...(tall ? { scale: 'action' } : {}), subjects: () => [...everyone(), trunk().top, trunk().base, trunk().far], front: view([-.25, -1]), elevation: 16, cut: true, floor: 'auto' },
      act: all(() => { if (!stage.task.start('pull', { beats: taps })) stage.task.abort(); }, () => stage.mosi.look(trunk().middle)) },
    // Out over the gap with the rope's end, and round the stone (the shot goes with the pair, the rope behind them)
    { at: .1, wait: { until: () => phase() === 'leg' || ended(), timeout: 6 } },
    { at: .15, shot: { kind: 'follow', scale: 'wide', subjects: () => [...bodies(flyers()), stage.task.rope2(), stage.task.stone(), trunk().near], front: view([-.1, -1]), elevation: 18, cut: true, floor: 'auto' }, act: () => stage.mosi.look(stage.task.stone()) },
    // Round the stone on Sólarsyllan: a cut to the stone, the gap and the trunk across it as they wind the rope round it
    { at: .17, wait: { until: () => stage.task.leg() >= 1 || phase() !== 'leg' || ended(), timeout: 9 } },
    { at: .18, shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(flyers()), stage.task.stone(), trunk().far, trunk().top, trunk().near], front: view([-.35, -1]), elevation: 20, cut: true, floor: 'auto' }, act: () => stage.mosi.look(stage.task.stone()) },
    { at: .2, wait: { until: () => phase() !== 'leg' || ended(), timeout: 12 } },
    // At the trunk's top: they hover at the stub while it is knotted
    { at: .25, shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(flyers()), trunk().tie, up(trunk().top, .4), trunk().middle], front: view([-.3, -1]), elevation: 10, cut: true, floor: 'auto' }, act: () => stage.mosi.look(trunk().tie) },
    { at: .3, wait: { until: () => !['gather', 'leg', 'knot'].includes(phase()) || ended(), timeout: 5 } },
    // The child's moment: the whole line, the rope round the stone, the trunk up to its top and the gap; the shot holds still until the taps are done and the trunk is over.
    // (on a tall screen, as it is when the scene starts, from behind the line: the line and the trunk up to its top fill it, and the gap and the stone are beyond them; the trunk falls away from the camera)
    { at: .35, shot: { kind: 'wide', scale: 'action', subjects: () => tall ? [...everyone(), trunk().top, trunk().base, trunk().far] : [...everyone(), trunk().top, trunk().base, at(42.5, 15, 9.2), stage.task.stone(), trunk().far],
      front: view([-.22, -1], [-.92, -.38]), elevation: tall ? 22 : 14, cut: true, floor: 'auto' },
      act: all(stillGoing, () => stage.mosi.look(trunk().middle)) },
    { at: .4, wait: { until: arrived, timeout: 9 } },
    { at: .45, act: all(stillGoing, () => stage.mosi.look(trunk().middle)), say: 'g2_pull' },
    { at: .5, wait: { tap: 'trunk', count: taps, timeout,
      onTap: () => stage.task.beat(),
      // No taps: "Við gerum þetta saman!" and they pull it over on their own.
      onTimeout: () => { stage.say('together'); while (stage.task.beat()); } } },
    // (the still shot holds the taps and the three tugs; as it starts to fall, a cut to Sólarsyllan's side, where its top comes down on the lip in its dust, so the still shot is
    // not held over about 8 s: Ruling 32, Task 7. The first try cut as it landed, and the cheer's cut came half a second later: a flash; now the fall is seen whole from there.
    // From Sólarsyllan's side of the open edge, a little above: the top on the lip and the stone in front, the trunk going back over the gap to the line on the near rim.
    // (a tight frame on the top was all trunk and no gap; the wide cut of everyone that follows looks from the near side, so this one is from the far side)
    { at: .52, wait: { until: () => phase() === 'fall' || trunk().fallen || ended(), timeout: 8 } },
    { at: .53, shot: { kind: 'wide', subjects: () => [trunk().top, trunk().far, trunk().middle, trunk().near, stage.task.stone(), at(47.5, 8.9, 9.2)], front: view([.6, -1], [.75, -.7]), elevation: tall ? 26 : 18, cut: true, floor: 'auto' },
      act: () => stage.mosi.look(trunk().top) },
    { at: .55, wait: { until: () => phase() === 'cheer' || ended(), timeout: 10 } },
    // The bridge: the trunk lies over the gap, its top on Sólarsyllan; everyone cheers.
    { at: .6, shot: { kind: 'wide', subjects: () => [...everyone(), trunk().base, trunk().top, trunk().near, trunk().far, at(47, 9, 4)], front: view([-.2, -1]), elevation: 24, cut: true, floor: 'auto' },
      act: all(() => stage.mosi.gesture('clap'), () => stage.mosi.look(trunk().top)) },
    { at: .65, wait: { until: ended, timeout: 5 } },
    { at: .7, shot: { release: true, duration: .9 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}

/**
 * The walk over the trunk, at level 1's crossing pace (about 10 s): a cut on the near rim, from the open side a little behind them, as they step up onto the trunk one behind
 * the other and start over it; a cut from Sólarsyllan's side, a little ahead of them, as they come over and step off its top end (the Flugeðlur glide over); a wide cut of
 * everyone on Sólarsyllan as they cheer; then the celebration (scenes/celebrate.js, Task 7), which ends on a wide shot that stays up under the ending card. (No shot is held
 * longer than about 8 s, Ruling 31: the cut comes as Mosi, the last, leaves the near rim, or at 7.6 s.) On a tall screen the two cuts look more along the way, as the pull's do.
 */
export function walkScene(stage) {
  const tall = stage.aspect() < 1, view = (front, along) => () => stage.task.view(tall && along ? along : front), ended = () => !stage.task.busy(), trunk = () => stage.task.trunk(), at = (x, y, z) => stage.task.up(x, y, z);
  const walkers = () => [...stage.friends().filter(actor => actor.root.visible && actor.species !== 'pteranodon'), stage.mosi.actor];
  const everyone = () => [...stage.friends().filter(actor => actor.root.visible).map(actor => actor.root.position.clone()), stage.mosi.body()];
  // (the walkers between two places along the way, x of the upper gorge's frame)
  const between = (from, to) => walkers().filter(actor => { const x = stage.task.local(actor.root.position).x; return x > from && x < to; }).map(actor => actor.root.position.clone());
  const mosiPast = x => stage.task.local(stage.mosi.actor.root.position).x > x;
  return [
    // On the near rim: the line coming to the trunk's foot and stepping up onto it, and the trunk over the gap (the frame goes along with the line as it moves up)
    { at: 0, shot: { kind: 'follow', subjects: () => [...between(33.5, 43.6), at(39.7, 8.9, 6.6), at(42.6, 9.9, 9.2), at(44.6, 8.9, 9.2)], front: view([-.45, -1], [-.85, -.55]), elevation: tall ? 22 : 16, cut: true, floor: 'auto' },
      act: all(() => { if (!stage.task.start('walk')) stage.task.abort(); }, () => stage.mosi.look(trunk().far)) },
    { at: .1, wait: { until: () => mosiPast(41.3) || ended(), timeout: 7.6 } },
    // From Sólarsyllan's side and above: they come over the trunk and step down off its top end (the frame holds the trunk over the gap and the step off; those who have
    // stepped off walk out of it to their places. Lower, the stone on Sólarsyllan stood in front of them, and those going to their places walked into the camera.)
    { at: .2, shot: { kind: 'follow', subjects: () => [...between(40.6, 48.6), at(41.3, 8.9, 9.2), trunk().top, at(48.4, 8.9, 9.2)], front: view([.55, -1], [.75, -.7]), elevation: tall ? 30 : 28, cut: true, floor: 'auto' } },
    // (until Mosi, the last, is off it and on his way to his place: the last Flugeðla may still be gliding in, and the wide cut has her land)
    { at: .3, wait: { until: () => mosiPast(49.5) || stage.task.phase() !== 'walk' || ended(), timeout: 7.6 } },
    // Everyone on Sólarsyllan
    { at: 1.4, shot: { kind: 'wide', subjects: () => [...everyone(), stage.task.up(57, 9, 3), stage.task.up(50, 9, 11.6)], front: view([-.25, -1]), elevation: 18, cut: true, floor: 'auto' }, act: () => stage.mosi.gesture('clap') },
    { at: 1.45, wait: { until: ended, timeout: 6 } },
    // Then the celebration, as level 1's finish plays its own (Task 7)
    ...celebrateScene(stage).map(line => ({ ...line, at: 1.5 + line.at })),
  ];
}
