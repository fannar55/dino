/**
 * The celebration at the berry grove, as lines for the scene runner (scenes.js), played by scenes/finish.js once all six have arrived
 * and before the ending card: the friends eat berries, each pair does its trick, Mosi cheers and the surprises the child found are
 * shown, with a cut every one to three seconds and a wide shot of them all at the end. Times are seconds from the start; the
 * whole is about sixteen. The stage is the world's (world.js; scenes/first-minute.js lists the helpers), and for this one it gives
 *   friends()                        all six actors              pair(species)               a pair's two actors
 *   mosi.yaw()                       the way Mosi faces
 *   gifts.count()                    how many surprises were found (0, 1 or 2)
 *   gifts.hover(i)                   where gift i floats          gifts.start() / gifts.end()  show them rising from Mosi's basket / fly them to the one in the ribbon
 *   beat(name, cut)                  notes a beat in the page's debug (the playthrough's report and pictures)
 * The Kambeðlur eat with their own `eat` clip and the others with the nibble gesture (gestures.js); tricks: the Þríhyrnur hop,
 * the Kambeðlur and the Þórseðlur play their `happy` clips (a friend without the clip, or in reduced motion, cheers instead).
 * Mosi's lines: `won` at the start, then the gifts line (gifts1 or gifts2) once it is over; no surprise, no gifts line.
 * The six stand close round Mosi (bridge-adventure.js FINAL_PARKING), so a close shot of a pair or of Mosi and the last wide shot all
 * show faces; every close shot looks down at 18 to 24 degrees, over the reeds and berries at the edge of the grove.
 */
import * as THREE from 'three';

const all = (...fns) => fns;
const UP = new THREE.Vector3(0, 1, 0);
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const up = (point, metres) => point.clone().setY(point.y + metres);
const shift = (point, x, y, z) => point.clone().set(point.x + x, point.y + y, point.z + z);

export function celebrateScene(stage) {
  const friends = () => stage.friends(), pair = species => stage.pair(species), mosi = stage.mosi;
  const gifts = stage.gifts.count(), line = gifts === 0 ? null : gifts === 1 ? 'gifts1' : 'gifts2';
  const beat = (name, cut = true) => () => stage.beat?.(name, cut);
  const group = () => [mosi.body(), up(mosi.body(), 1), ...bodies(friends())];
  // The faces of some friends: noses, crowns and a point above the back, so a head bent to a berry stays inside the frame.
  const faces = actors => actors.flatMap(actor => [actor.getNosePosition(), actor.getSupportPosition(), up(actor.root.position, .9)]);
  // In front of them, three-quarters, on the search camera's side, turned `spin` radians further (negative: toward the west).
  const frontOf = (actors, spin = 0) => () => stage.faceOn(actors()[0]?.root.rotation.y ?? 0, .9).applyAxisAngle(UP, spin);
  const tri = () => pair('triceratops'), stego = () => pair('stegosaurus'), bronto = () => pair('brontosaurus');
  const eat = actor => { if (!actor.playClip?.('eat', { loops: 1.4 })) actor.gesture('nibble'); };
  const happy = actor => { if (!actor.playClip?.('happy')) actor.gesture('cheer'); };
  const call = species => ({ name: 'call', species });
  const eatAll = () => friends().forEach(eat);
  // When each beat starts (seconds): the meal, then the tricks, then Mosi's cheer with the gifts, then the last picture.
  const T = { eat: 1.2, stego: 2.4, bronto: 3.6, wide: 4.8, tri: 5.9, stegoTrick: 7.5, brontoTrick: 8.8, mosi: 11.2 };
  const look = T.mosi + 1.7, last = T.mosi + (gifts ? 3.4 : 1.9);
  const mosiFront = (spin = 0) => () => stage.faceOn(mosi.yaw(), .5).applyAxisAngle(UP, spin);
  const giftPoints = () => Array.from({ length: gifts }, (_, i) => stage.gifts.hover(i));
  return [
    // They have all arrived: the whole grove, the cheer still going, Mosi's line; he looks them over.
    { at: 0, shot: { kind: 'wide', subjects: group, elevation: 26, cut: true },
      act: all(beat('wide-start'), () => mosi.look(friends()[0]?.getNosePosition() ?? mosi.head()), () => friends().forEach(actor => actor.lookAt?.(mosi.head(), { weight: .5, maxAngle: 18 }))),
      fx: { kind: 'stars', at: () => up(mosi.body(), .4), count: 14 }, say: { line: 'won', queue: true } },
    // The berries: a close shot of each pair at its meal.
    { at: T.eat, shot: { kind: 'face', subjects: () => faces(tri()), front: frontOf(tri, .1), elevation: 20, cut: true },
      act: all(beat('eat-triceratops'), () => friends().forEach(actor => actor.clearLook?.()), eatAll, () => mosi.gesture('clap')) },
    { at: T.stego, shot: { kind: 'face', subjects: () => faces(stego()), front: frontOf(stego, -.5), elevation: 22, cut: true }, act: beat('eat-stegosaurus') },
    { at: T.bronto, shot: { kind: 'face', subjects: () => faces(bronto()), front: frontOf(bronto, -.15), elevation: 22, cut: true },
      act: all(beat('eat-brontosaurus'), () => tri().concat(bronto()).forEach(actor => actor.gesture('nibble'))) },
    // Them all, still eating (the Kambeðlur on their second helping).
    { at: T.wide, shot: { kind: 'wide', subjects: group, elevation: 24, cut: true }, act: all(beat('wide-eating'), eatAll, () => mosi.look(stage.camera())) },
    // The tricks. The Þríhyrnur hop three times, the Kambeðlur and the Þórseðlur play their happy clips, each with its call.
    { at: T.tri, shot: { kind: 'hero', subjects: () => [...bodies(tri()), ...tri().map(actor => up(actor.root.position, 1.4))], front: frontOf(tri, .1), elevation: 12, cut: true },
      act: all(beat('trick-triceratops'), () => tri().forEach(actor => actor.gesture('hop'))), sound: call('triceratops'), fx: { kind: 'stars', at: () => up(tri()[0].root.position, 1.6), count: 10 } },
    { at: T.tri + .72, act: () => tri().forEach(actor => actor.gesture('hop')) },
    { at: T.tri + 1.44, act: () => tri().forEach(actor => actor.gesture('hop')), fx: { kind: 'stars', at: () => up(tri()[1].root.position, 1.6), count: 8 } },
    { at: T.stegoTrick, shot: { kind: 'face', subjects: () => faces(stego()), front: frontOf(stego, -.5), elevation: 20, cut: true },
      act: all(beat('trick-stegosaurus'), () => stego().forEach(happy), () => mosi.gesture('clap')), sound: call('stegosaurus'), fx: { kind: 'stars', at: () => up(stego()[0].root.position, 1.4), count: 10 } },
    { at: T.brontoTrick, shot: { kind: 'face', subjects: () => faces(bronto()), front: frontOf(bronto, -.15), elevation: 20, cut: true },
      act: all(beat('trick-brontosaurus'), () => bronto().forEach(happy)), sound: call('brontosaurus'), fx: [{ kind: 'stars', at: () => up(bronto()[0].root.position, 2), count: 10 }, { kind: 'stars', at: () => up(bronto()[1].root.position, 2), count: 10 }] },
    // Mosi cheers, close on his face, and the surprises the child found rise from his basket beside his head while his line says so.
    { at: T.mosi, shot: { kind: 'face', subjects: () => [mosi.head(), up(mosi.head(), .6), ...giftPoints()], front: mosiFront(), elevation: 26, cut: true },
      act: all(beat('mosi-cheer'), () => mosi.look(stage.camera()), () => mosi.gesture('cheer'), () => stage.gifts.start()), fx: { kind: 'stars', at: () => up(mosi.body(), .8), count: 14 }, sound: gifts ? 'ding' : undefined, say: line ? { line, queue: true } : undefined },
    // The gifts again from his other side (only when there are some).
    ...(gifts ? [{ at: look, shot: { kind: 'face', subjects: () => [mosi.head(), up(mosi.head(), .6), ...giftPoints()], front: mosiFront(.8), elevation: 22, cut: true }, act: beat('gifts-seen') }] : []),
    // The last picture: the six and Mosi together, wide and low, the berries behind them. The card comes up under it.
    { at: last, shot: { kind: 'wide', subjects: () => [...group(), shift(mosi.body(), -3.4, -1.3, 3), shift(mosi.body(), 3.6, -1.3, 3)], elevation: 20, cut: true },
      act: all(beat('final-wide'), () => stage.gifts.end(), () => friends().forEach(actor => actor.gesture('settle'))) },
    { at: last + 1.6, act: beat('end', false) },
  ];
}
