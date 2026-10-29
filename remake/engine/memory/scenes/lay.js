/**
 * The third obstacle of "Hvar er vinur minn?" as a script for the scene runner (scenes.js): the Kambeðlur carry the
 * three bark panels out over the marsh, one by one, and put each down on the child's tap. Built like scenes/roll.js,
 * on the same `stage` (world.js), which for this one also gives:
 *   task.layState()       { phase, panel, placed } while the lay runs (phases: collect, align, pickup, carry, straighten, beat-wait,
 *                         place, back), null otherwise          task.cargo()   the panel the pair carries
 *   task.panelCentre(i)   where panel i lies                    task.supply()  the stack they fetch them from
 * The big word of each panel ("Ein!", "Tvær!", "Þrjár!") comes with the adventure's beat event (game.js).
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const centre = points => points.reduce((sum, p) => sum.add(p), points[0].clone().multiplyScalar(0)).multiplyScalar(1 / points.length);
const up = (point, metres) => point.clone().setY(point.y + metres);
const shift = (point, x, y, z) => point.clone().set(point.x + x, point.y + y, point.z + z);
// The still shot of each panel looks back from beyond the marsh (the pair turned to it, faces on, the panel hanging
// between them); the finished boardwalk from the east, low, along its length.
const LAY_FRONT = [.55, 0, -.83], DONE_FRONT = [1, 0, -.15];
// (trying three views, one for each panel, to see which one keeps under the triangle budget)
const STILL = [{ front: [.55, 0, -.83], elevation: 36 }, { front: [.6, 0, .8], elevation: 30 }, { front: [1, 0, -.1], elevation: 30 }];
const CARRY = [{ front: null, elevation: 28 }, { front: [.5, 0, .85], elevation: 28 }, { front: [.8, 0, -.6], elevation: 28 }];
const BACK = [{ front: null, elevation: 26 }, { front: [.5, 0, .85], elevation: 26 }];

/**
 * The marsh: a wide cut on the pair fetching the first panel; for each panel a follow cut on the carry, then the still shot
 * over the spot it will lie on (the child's moment: one tap puts it down, "Ein!", "Tvær!", "Þrjár!"; no tap in `timeout`
 * seconds and Mosi says "Við gerum þetta saman!", the camera cuts and they lay this one and the rest on their own).
 * Each landing throws up mud and shakes the camera, and the shot holds half a second on it before it cuts to the walk back.
 * The third lands in a cut on the finished boardwalk, Mosi clapping.
 */
export function layScene(stage, { panels = 3, timeout = 4 } = {}) {
  const pair = () => stage.pair('stegosaurus'), spot = i => stage.task.panelCentre(i);
  const phase = () => stage.task.layState()?.phase ?? null, placed = () => stage.task.layState()?.placed ?? panels, going = () => stage.task.busy();
  const stillGoing = () => { if (!going()) stage.task.abort(); };
  let timedOut = false;
  const lines = [];
  let t = 0;
  const next = (seconds = .05) => (t += seconds);
  const carryShot = i => ({ kind: 'follow', subjects: () => [...bodies(pair()), stage.task.cargo()], front: CARRY[i].front ?? (() => stage.sideOn(stage.task.supply(), spot(i))), elevation: CARRY[i].elevation, cut: true });
  const stillShot = (i, front = STILL[i].front) => ({ kind: 'wide', scale: 'action', subjects: () => [...bodies(pair()), ...pair().map(actor => up(actor.root.position, 1.2)), spot(i), shift(spot(i), -1.7, 0, -.8), shift(spot(i), 1.7, 0, .8)], front, elevation: STILL[i].elevation, cut: true });
  const backShot = i => ({ kind: 'follow', subjects: () => bodies(pair()), front: BACK[i].front ?? (() => stage.sideOn(spot(i), stage.task.supply())), elevation: BACK[i].elevation, cut: true });

  for (let i = 0; i < panels; i++) {
    if (!i) {
      // The pair fetching the first panel.
      lines.push({ at: t, shot: { kind: 'wide', subjects: () => [...bodies(pair()), stage.task.supply(), spot(0)], cut: true },
        act: all(() => { if (!stage.task.start('lay', { beats: panels })) stage.task.abort(); }, () => stage.mosi.look(stage.task.supply()), () => stage.pairGesture('stegosaurus', 'hop')), say: 'build' });
      lines.push({ at: next(), wait: { until: () => ['pickup', 'carry'].includes(phase()) || !going(), timeout: 5 } });
    } else lines.push({ at: next(), wait: { until: () => phase() === 'pickup' || !going(), timeout: 8 } });
    // The panel comes off the stack and is carried to its place.
    lines.push({ at: next(), shot: carryShot(i), act: all(stillGoing, () => stage.mosi.look(stage.task.supply())) });
    lines.push({ at: next(), wait: { until: () => ['straighten', 'beat-wait', 'place'].includes(phase()) || !going(), timeout: 8 } });
    // The child's moment: the pair squares up over the place, the shot holds still until the tap (or the timeout).
    lines.push({ at: next(), shot: stillShot(i), act: all(stillGoing, () => stage.mosi.look(spot(i))) });
    lines.push({ at: next(), wait: { until: () => stage.task.waitingBeat() !== null || phase() === 'place' || !going(), timeout: 3 } });
    lines.push({ at: next(), wait: { tap: 'bark', count: 1, timeout, until: () => timedOut,
      onTap: () => stage.task.beat(),
      // No tap: "Við gerum þetta saman!", a cut, and they lay this panel and the rest on their own, in turn.
      onTimeout: () => { timedOut = true; stage.say('together'); stage.cut(stillShot(i, [1, 0, -.35])); while (stage.task.beat()); } } });
    // Down it goes: the mud flies (the adventure), the camera shakes.
    lines.push({ at: next(), wait: { until: () => placed() > i || !going(), timeout: 4 } });
    lines.push({ at: next(), fx: { kind: 'shake', strength: .1, seconds: .3 } });
    if (i < panels - 1) {
      lines.push({ at: next(.5), shot: backShot(i), act: () => stage.mosi.look(stage.task.supply()) });
    } else {
      // The last one: the whole boardwalk, done. The pair walks back while Mosi claps.
      lines.push({ at: next(.5), shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(pair()), spot(0), shift(spot(panels - 1), 0, 0, -.8), up(spot(panels - 1), 1)], front: DONE_FRONT, elevation: 20, cut: true },
        act: all(() => stage.pairGesture('stegosaurus', 'cheer'), () => stage.mosi.gesture('clap')), fx: { kind: 'stars', at: () => up(spot(panels - 1), 1.1), count: 12 } });
    }
  }
  lines.push({ at: next(), wait: { until: () => !going(), timeout: 8 } });
  lines.push({ at: next(), shot: { release: true, cut: true }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) });
  return lines;
}
