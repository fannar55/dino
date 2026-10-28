/**
 * The first minute of "Hvar er vinur minn?" as scripts for the scene runner (scenes.js): a leaf opens,
 * a wrong pair, a right pair. Each builder returns the lines; the world plays them on the game clock.
 *
 * `stage` is the world's side of a script (world.js builds it):
 *   head(cell)                the friend's nose, world space          look(cell, point|null, options)
 *   gesture(cell, name)       a GESTURES move                         camera()  the search camera's position
 *   mosi.look(point) / mosi.gesture(name) / mosi.head()
 *   planMeeting(a, b)         where two friends meet nose to nose:   { point, duration, start(), finish() }
 *   sendHome(cell) / home(cell) / forceHome(cell)   the existing walk home (home navigation)
 *   homePoint(cell) / homeEnd(cell)   the home spot the pair walks to, and the friend's own place there
 *   faceCamera(cell)          turn three-quarters to the camera     sideOn(from, to)  a camera side for a walk
 * Line keys the world performs: shot ({ kind, subjects, cut, duration } | { release } | { nudge }),
 * act (a function or a list of them), fx ({ kind, at, count } | { kind: 'shake' }), sound, say.
 */
const all = (...fns) => fns;

/** A leaf opens: the friend springs out (peek, started with the leaf), Mosi looks, the friend looks at you. */
export function revealScene(stage, cell, { second = false } = {}) {
  const lines = [
    { at: 0, shot: { nudge: () => stage.head(cell) }, sound: { name: 'reveal', species: cell.species, index: cell.index } },
    { at: .15, act: () => stage.mosi.look(stage.head(cell)) },
    { at: .32, act: () => stage.faceCamera(cell) },
  ];
  // The first friend of a turn turns to the child; a second one is busy with the first.
  if (!second) lines.push({ at: .5, act: () => stage.look(cell, stage.camera(), { weight: .95, maxAngle: 24 }) }, { at: 1.5, act: () => stage.look(cell, null) });
  return lines;
}

/** Two different friends: a glance at each other, both shake their heads and duck giggling; Mosi shakes his. */
export function mismatchScene(stage, first, second) {
  return [
    { at: .42, act: all(() => stage.look(first, stage.head(second), { weight: .8, maxAngle: 24 }), () => stage.look(second, stage.head(first), { weight: .8, maxAngle: 24 })) },
    { at: .62, act: all(() => stage.look(first, null), () => stage.look(second, null), () => stage.gesture(first, 'oops'), () => stage.gesture(second, 'oops')) },
    { at: .74, act: () => stage.mosi.gesture('shake-head') },
  ];
}

/**
 * The pair is found (the spec's timeline): a face cut, both jump and run to each other, nuzzle with
 * glitter, the chime and their call; a cut to the pair hopping off home, followed side-on; home, a
 * wide cut where Mosi claps and says his line; then the camera glides back to the glade, exactly as it
 * was, while Mosi laughs. World input stays off from the first cut to the end of the glide.
 */
export function matchScene(stage, first, second, { nestIndex = 0 } = {}) {
  const meeting = stage.planMeeting(first, second);
  const nuzzleAt = .14 + meeting.duration, wideAt = nuzzleAt + 1.05;
  const pair = [first, second];
  return [
    { at: 0, shot: { kind: 'face', subjects: () => [stage.head(first), stage.head(second), stage.crown?.(first), stage.crown?.(second), meeting.point], cut: true },
      act: all(() => stage.look(first, stage.head(second), { weight: .9, maxAngle: 24 }), () => stage.look(second, stage.head(first), { weight: .9, maxAngle: 24 }),
        () => stage.gesture(first, 'hop'), () => stage.gesture(second, 'hop'), () => stage.mosi.look(meeting.point)) },
    { at: .14, act: () => meeting.start() },
    { at: nuzzleAt, act: all(() => meeting.finish(), () => stage.look(first, null), () => stage.look(second, null), () => stage.gesture(first, 'nuzzle'), () => stage.gesture(second, 'nuzzle')),
      fx: { kind: 'match', at: () => meeting.point, count: 18 },
      sound: [{ name: 'call', species: first.species, index: nestIndex }, { name: 'match', species: first.species, nestIndex }] },
    // Off home together, hopping: the camera runs beside them, so they are seen side-on.
    { at: wideAt, shot: { kind: 'follow', subjects: () => pair.flatMap(cell => [cell.actor.root.position.clone(), stage.head(cell)]), front: stage.sideOn(meeting.point, stage.homeEnd(first)), cut: true },
      act: all(() => stage.gesture(first, 'hop'), () => stage.gesture(second, 'hop'), () => stage.sendHome(first), () => stage.sendHome(second), () => stage.mosi.look(stage.homePoint(first))) },
    { at: wideAt + .05, wait: { until: () => stage.home(first) && stage.home(second), timeout: 9, onTimeout: () => pair.forEach(cell => stage.forceHome(cell)) } },
    // Home: a wide cut with Mosi, who claps and says his line.
    { at: wideAt + .1, shot: { kind: 'wide', subjects: () => [...pair.flatMap(cell => [cell.actor.root.position.clone(), stage.head(cell)]), stage.mosi.head()], cut: true },
      act: () => stage.mosi.gesture('clap'), say: 'match' },
    // Back to the glade; Mosi laughs with delight on the way, in view on the left.
    { at: wideAt + 1.55, shot: { release: true, duration: 1.05 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}
