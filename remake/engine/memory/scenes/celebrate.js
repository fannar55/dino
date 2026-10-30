/**
 * The celebration at the berry grove, as lines for the scene runner (scenes.js), played by scenes/finish.js once all six have arrived
 * and before the ending card: the friends eat berries, each pair does its trick, Mosi cheers and the surprises the child found are
 * shown, with a cut every one to three seconds and a wide shot of them all at the end. Times are seconds from the start; the
 * whole is about seventeen. The stage is the world's (world.js; scenes/first-minute.js lists the helpers), and for this one it gives
 *   friends()                        all six actors              pair(species)               a pair's two actors
 *   gifts.count()                    how many surprises were found (0, 1 or 2)
 *   gifts.hover(i)                   where gift i floats          gifts.start() / gifts.end()  show them rising from Mosi's basket / fly them to the one in the ribbon
 *   beat(name, cut)                  notes a beat in the page's debug (the playthrough's report and pictures)
 * The Kambeðlur eat with their own `eat` clip and the others with the nibble gesture (gestures.js); tricks: the Þríhyrnur hop,
 * the Kambeðlur and the Þórseðlur play their `happy` clips (a friend without the clip, or in reduced motion, cheers instead).
 * Mosi's lines: `won` at the start, then the gifts line (gifts1 or gifts2) once it is over; no surprise, no gifts line.
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const up = (point, metres) => point.clone().setY(point.y + metres);
const shift = (point, x, y, z) => point.clone().set(point.x + x, point.y + y, point.z + z);

export function celebrateScene(stage) {
  const friends = () => stage.friends(), pair = species => stage.pair(species), mosi = stage.mosi;
  const gifts = stage.gifts.count(), line = gifts === 0 ? null : gifts === 1 ? 'gifts1' : 'gifts2';
  const beat = (name, cut = true) => () => stage.beat?.(name, cut);
  const group = () => [mosi.body(), up(mosi.body(), 1), ...bodies(friends())];
  const faces = actors => [...actors.map(actor => actor.getNosePosition()), ...actors.map(actor => up(actor.root.position, .9))];
  // In front of a friend, three-quarters, on the search camera's side; of a pair, in front of the first of them.
  const frontOf = actors => () => stage.faceOn(actors()[0]?.root.rotation.y ?? 0, .9);
  const west = () => pair('brontosaurus').reduce((a, b) => a.root.position.x <= b.root.position.x ? a : b), east = () => pair('brontosaurus').reduce((a, b) => a.root.position.x > b.root.position.x ? a : b);
  const eat = actor => { if (!actor.playClip?.('eat', { loops: 1.4 })) actor.gesture('nibble'); };
  const happy = actor => { if (!actor.playClip?.('happy')) actor.gesture('cheer'); };
  const call = species => ({ name: 'call', species });
  const eatAll = () => friends().forEach(eat);
  const tri = () => pair('triceratops'), stego = () => pair('stegosaurus'), bronto = () => pair('brontosaurus');
  // When each beat starts (seconds): the meal, then the tricks, then Mosi's cheer with the gifts, then the last picture.
  const T = { eat: 1.2, stego: 2.5, brontoWest: 3.8, brontoEast: 4.9, wide: 6, tri: 7, stegoTrick: 8.6, brontoTrickWest: 9.9, brontoTrickEast: 11.1, mosi: 12.3 };
  const last = T.mosi + (gifts ? 3.3 : 1.9);
  return [
    // They have all arrived: the whole grove, the cheer still going, Mosi's line; he looks them over.
    { at: 0, shot: { kind: 'wide', subjects: group, elevation: 28, cut: true },
      act: all(beat('wide-start'), () => mosi.look(friends()[0]?.getNosePosition() ?? mosi.head()), () => friends().forEach(actor => actor.lookAt?.(mosi.head(), { weight: .5, maxAngle: 18 }))),
      fx: { kind: 'stars', at: () => up(mosi.body(), .4), count: 14 }, say: { line: 'won', queue: true } },
    // The berries: a close shot of each pair at its meal.
    { at: T.eat, shot: { kind: 'face', subjects: () => faces(tri()), front: frontOf(tri), elevation: 14, cut: true },
      act: all(beat('eat-triceratops'), () => friends().forEach(actor => actor.clearLook?.()), eatAll, () => mosi.gesture('clap')) },
    { at: T.stego, shot: { kind: 'face', subjects: () => faces(stego()), front: frontOf(stego), elevation: 14, cut: true }, act: beat('eat-stegosaurus') },
    { at: T.brontoWest, shot: { kind: 'face', subjects: () => faces([west()]), front: frontOf(() => [west()]), elevation: 12, cut: true },
      act: all(beat('eat-brontosaurus-west'), () => tri().concat(bronto()).forEach(actor => actor.gesture('nibble'))) },
    { at: T.brontoEast, shot: { kind: 'face', subjects: () => faces([east()]), front: frontOf(() => [east()]), elevation: 12, cut: true }, act: beat('eat-brontosaurus-east') },
    // Them all, still eating (the Kambeðlur on their second helping).
    { at: T.wide, shot: { kind: 'wide', subjects: group, elevation: 28, cut: true }, act: all(beat('wide-eating'), eatAll, () => mosi.look(stage.camera())) },
    // The tricks. The Þríhyrnur hop three times, the Kambeðlur and the Þórseðlur play their happy clips, each with its call.
    { at: T.tri, shot: { kind: 'hero', subjects: () => [...bodies(tri()), ...tri().map(actor => up(actor.root.position, 1.4))], front: frontOf(tri), elevation: 9, cut: true },
      act: all(beat('trick-triceratops'), () => tri().forEach(actor => actor.gesture('hop'))), sound: call('triceratops'), fx: { kind: 'stars', at: () => up(tri()[0].root.position, 1.6), count: 10 } },
    { at: T.tri + .72, act: () => tri().forEach(actor => actor.gesture('hop')) },
    { at: T.tri + 1.44, act: () => tri().forEach(actor => actor.gesture('hop')), fx: { kind: 'stars', at: () => up(tri()[1].root.position, 1.6), count: 8 } },
    { at: T.stegoTrick, shot: { kind: 'face', subjects: () => faces(stego()), front: frontOf(stego), elevation: 12, cut: true },
      act: all(beat('trick-stegosaurus'), () => stego().forEach(happy), () => mosi.gesture('clap')), sound: call('stegosaurus'), fx: { kind: 'stars', at: () => up(stego()[0].root.position, 1.4), count: 10 } },
    { at: T.brontoTrickWest, shot: { kind: 'face', subjects: () => faces([west()]), front: frontOf(() => [west()]), elevation: 11, cut: true },
      act: all(beat('trick-brontosaurus-west'), () => bronto().forEach(happy)), sound: call('brontosaurus'), fx: { kind: 'stars', at: () => up(west().root.position, 2), count: 10 } },
    { at: T.brontoTrickEast, shot: { kind: 'face', subjects: () => faces([east()]), front: frontOf(() => [east()]), elevation: 11, cut: true }, act: beat('trick-brontosaurus-east'), fx: { kind: 'stars', at: () => up(east().root.position, 2), count: 8 } },
    // Mosi cheers, and the surprises the child found rise from his basket while his line says so.
    { at: T.mosi, shot: { kind: 'hero', subjects: () => [mosi.head(), mosi.body(), ...Array.from({ length: Math.max(1, gifts) }, (_, i) => stage.gifts.hover(i))], front: [.12, 0, 1], elevation: 8, cut: true },
      act: all(beat('mosi-cheer'), () => mosi.look(stage.camera()), () => mosi.gesture('cheer'), () => stage.gifts.start()), fx: { kind: 'stars', at: () => up(mosi.body(), .8), count: 14 }, sound: gifts ? 'ding' : undefined, say: line ? { line, queue: true } : undefined },
    // The last picture: the six and Mosi, wide, the berries behind them. The card comes up under it.
    { at: last, shot: { kind: 'wide', subjects: () => [...group(), shift(mosi.body(), 0, 0, 5.5), shift(mosi.body(), -5, 0, 4), shift(mosi.body(), 5, 0, 4)], elevation: 27, cut: true },
      act: all(beat('final-wide'), () => stage.gifts.end(), () => friends().forEach(actor => actor.gesture('settle'))) },
    { at: last + 1.6, act: beat('end', false) },
  ];
}
