/**
 * Level 2's celebration on Sólarsyllan (Task 7), as lines for the scene runner (scenes.js), played by scenes/pull.js walkScene once everyone has walked over the trunk and
 * before the ending card, in the frame of level 1's (levels/berjalundur/scenes/celebrate.js): about sixteen seconds, a cut every one to three, a wide shot at the end that
 * stays up under the card. The spec's step 7 ("Lokin"), in its order:
 *   1. the sun sets and the stars come out one by one (the light goes on from the sunset to the evening, dusk.js; the stars, stars.js, each of the first with a soft chime);
 *   2. each pair does its trick: the Kambeðlur glow (their plates, as in the tunnel), the Þríhyrnur butt the air together, the Þórseðlur stretch their necks high, and the
 *      Flugeðlur glide a circle over the group, then land where they stood;
 *   3. the four fossils rise from Mosi's basket and glow in a row on the ledge in front of the group (world.js gifts, with level 2's row);
 *   4. Mosi says `g2_won` as the Flugeðlur circle under the stars, then `gifts4` over the glowing row; then the last wide shot, the fossils fly to the basket, and the card.
 * Its sounds are the game's own: each pair's call at its trick (level 1's celebration), the glow chime for the stars, the ding of the found gifts (level 1's), and the win
 * fanfare game.js plays as the round ends.
 * Every shot looks from the open side of the ledge, as the walk's last one does (on a tall screen more along the ledge, from behind the gap's side and higher), and the shots
 * of the stars and the necks are low, so the sky over the hillside is in them. The stage is the world's with the level's `task` (scenes/pull.js lists it); this one also uses
 *   task.dusk(target, seconds)   the light on to `target` (3: the evening)      task.stars(seconds)   the stars out over `seconds`
 *   task.plates(level, options)  the Kambeðlur's plates                         task.row(i, n)        where fossil i of n floats in the row      task.rowShown(shown)
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const up = (point, metres) => point.clone().setY(point.y + metres);

// When each beat starts (seconds): the sunset and the first stars, the four tricks, the fossils, Mosi with them, the last picture.
// (Task 7 fix round 1: the row's shot is longer, 2.5 s, so that all four are in it, and they come up a fifth of a second apart)
const T = { stego: 3.4, tri: 5.2, bronto: 7.4, ptera: 9.4, fossils: 12.4, mosi: 14.9, last: 16.4 };
// The Flugeðlur's circle: round the middle of the group (the upper gorge's frame), its radius, how high over the ledge they go (their roots: the clips keep the body over it)
// and how fast they glide.
const CIRCLE = { centre: [53.6, 6.8], radius: 3.6, rise: 4, speed: 6.5, points: 8 };
// How far the two sky shots (the sunset, and the last picture under the card) look down, in degrees. The camera's picture is 35 degrees high and a shot
// looks down by its elevation, so its sky reaches 17.5 minus that above the horizon, and the HUD hides the top of it: at 7-9 (14-15 on a tall
// screen) only a strip under the HUD showed, with one to four stars in it. (Task 7 fix round 1)
const SKY_TILT = { wide: 4, tall: 8 };
// (the juice pass's #17) The last picture keeps the lower part of the screen free for the ending card that comes up over it (the camera
// director's `clear`: the share of the picture's height), so that everyone on Sólarsyllan stands above the card; its sky point is lower than
// the sunset's, so they are not small in the band left (metres over the ledge).
const LAST = { clear: { wide: .44, tall: .56 }, sky: { wide: 3.2, tall: 5 } };
// Sólarsyllan's top in the upper gorge's frame (upper.js SUN).
const SUN_Y = 8.9;

export function celebrateScene(stage) {
  const task = stage.task, tall = stage.aspect() < 1, mosi = stage.mosi, pair = species => stage.pair(species);
  const at = (x, y, z) => task.up(x, y, z), view = (front, along) => () => task.view(tall ? along ?? [-.75, -.65] : front);
  const beat = (name, cut = true) => () => stage.beat?.(name, cut);
  const everyone = () => [...stage.friends().filter(actor => actor.root.visible).map(actor => actor.root.position.clone()), mosi.body()];
  const heads = actors => actors.map(actor => up(actor.root.position, 1.4));
  const stars = (actors, metres = 1.6) => actors.map((actor, i) => ({ kind: 'stars', at: () => up(actor.root.position, metres), count: 10 - 2 * i }));
  const call = species => ({ name: 'call', species });
  const tri = () => pair('triceratops'), stego = () => pair('stegosaurus'), bronto = () => pair('brontosaurus'), flyers = () => pair('pteranodon');
  const gifts = stage.gifts.count(), rowPoints = () => Array.from({ length: 4 }, (_, i) => task.row(i, 4));
  // The circle: from where each Flugeðla stands, up onto it, once round (the two half a turn apart) and back down where she stood.
  const circle = () => {
    const [cx, cz] = CIRCLE.centre, y = SUN_Y + CIRCLE.rise;
    flyers().forEach((actor, k) => {
      const home = actor.root.position.clone(), yaw = actor.root.rotation.y, from = task.local(home), start = Math.atan2(from.z - cz, from.x - cx);
      const points = Array.from({ length: CIRCLE.points + 1 }, (_, j) => { const a = start + (k ? 1 : -1) * j * 2 * Math.PI / CIRCLE.points; return at(cx + Math.cos(a) * CIRCLE.radius, y, cz + Math.sin(a) * CIRCLE.radius); });
      actor.fly?.(points, { speed: CIRCLE.speed - .3 * k, glide: true, onDone: () => { actor.land?.(home, { yaw }); } });
    });
  };
  // (a point `metres` over the ledge: the sky a shot keeps in its picture)
  const sky = (x, z, metres) => at(x, SUN_Y + metres, z);
  return [
    // The sun goes down over everyone on Sólarsyllan, low, the sky over the hillside in the picture, and the first stars come out in it one by one.
    // (the walk's words, "Brúin er komin. Á Sólarsylluna!", go now: Mosi's bubble is put away until he says `g2_won`; the friends cheer, between his lines,
    // as Mosi claps with them. Task 7 fix round 1)
    { at: 0, say: { clear: true }, sound: 'cheer' },
    { at: 0, shot: { kind: 'wide', subjects: () => [...everyone(), sky(53.5, 6.6, tall ? 10 : 8.5)], front: view([-.25, -1], [-.8, -.6]), elevation: tall ? SKY_TILT.tall : SKY_TILT.wide, cut: true, floor: 'auto' },
      act: all(beat('sun-sets'), () => task.dusk(3, 8), () => task.stars(9.5), () => mosi.gesture('clap'), () => mosi.look(sky(53.5, 9.5, 10)), () => stage.friends().forEach(actor => actor.lookAt?.(sky(54, 9.5, 12), { weight: .5, maxAngle: 22 }))) },
    // The Kambeðlur: their plates light up as they did in the tunnel, twice.
    { at: T.stego, shot: { kind: 'hero', subjects: () => [...bodies(stego()), ...heads(stego())], front: view([.25, -1], [-.5, -.85]), elevation: tall ? 18 : 13, cut: true, floor: 'auto' },
      act: all(beat('trick-stegosaurus'), () => stage.friends().forEach(actor => actor.clearLook?.()), () => task.plates(1, { duration: .9 }), () => stego().forEach(actor => actor.gesture('glow')), () => mosi.gesture('clap')),
      sound: call('stegosaurus'), fx: stars(stego(), 1.5) },
    { at: T.stego + 1.05, act: () => stego().forEach(actor => actor.gesture('glow')) },
    // The Þríhyrnur butt the air together, three times.
    { at: T.tri, shot: { kind: 'hero', subjects: () => [...bodies(tri()), ...heads(tri())], front: view([.3, -1], [-.45, -.9]), elevation: tall ? 16 : 11, cut: true, floor: 'auto' },
      act: all(beat('trick-triceratops'), () => tri().forEach(actor => actor.gesture('charge'))), sound: call('triceratops'), fx: stars(tri(), 1.4) },
    { at: T.tri + .75, act: () => tri().forEach(actor => actor.gesture('charge')) },
    { at: T.tri + 1.5, act: () => tri().forEach(actor => actor.gesture('charge')), fx: { kind: 'stars', at: () => tri()[1].getNosePosition(), count: 8 } },
    // The Þórseðlur stretch their long necks up into the evening sky. (Lower than about 12 degrees the camera stood below the lip of the ledge,
    // which hid them: Task 7, first run.)
    { at: T.bronto, shot: { kind: 'hero', subjects: () => [...bodies(bronto()), ...bronto().map(actor => up(actor.root.position, 3.8))], front: view([.35, -1], [-.4, -.9]), elevation: tall ? 16 : 12, cut: true, floor: 'auto' },
      act: all(beat('trick-brontosaurus'), () => bronto().forEach(actor => actor.gesture('reach-high')), () => mosi.look(up(bronto()[0].root.position, 3))), sound: call('brontosaurus') },
    { at: T.bronto + .9, fx: stars(bronto(), 3.6) },
    // The Flugeðlur glide a circle over the group, under the stars; Mosi says they are all up.
    { at: T.ptera, shot: { kind: 'wide', subjects: () => [...everyone(), ...[0, 1, 2, 3].map(j => { const a = j * Math.PI / 2; return sky(CIRCLE.centre[0] + Math.cos(a) * CIRCLE.radius, CIRCLE.centre[1] + Math.sin(a) * CIRCLE.radius, CIRCLE.rise + 1.6); })],
      front: view([-.25, -1], [-.8, -.6]), elevation: tall ? 16 : 10, cut: true, floor: 'auto' },
      act: all(beat('trick-pteranodon'), circle, () => mosi.look(sky(53.6, 6.8, 5)), () => mosi.gesture('cheer')), sound: call('pteranodon'), say: { line: 'g2_won', queue: true } },
    // The four fossils rise from Mosi's basket and glow in a row on the ledge, in front of everyone, while he says so. (From higher, the ledge is behind
    // them, not a friend: from 20 degrees a fossil stood in front of a Þríhyrna. Task 7 fix round 1)
    { at: T.fossils, shot: { kind: 'wide', scale: 'action', subjects: () => [...rowPoints(), ...rowPoints().map(p => up(p, 1)), ...bodies(tri().slice(0, 1)), ...bodies(stego().slice(0, 1)), ...bodies(bronto().slice(0, 1)), mosi.head()],
      front: view([-.08, -1], [-.6, -.8]), elevation: tall ? 38 : 34, cut: true, floor: 'auto' },
      act: all(beat('fossils-glow'), () => { stage.gifts.start({ hover: (i, n) => task.row(i, n), scale: .75, stagger: .2, glow: true }); task.rowShown(true); }, () => mosi.look(task.row(1, 4)), () => mosi.gesture('clap')),
      sound: gifts ? 'ding' : undefined, say: gifts ? { line: 'gifts4', queue: true } : undefined },
    // Mosi and the row, closer and from higher (from lower the row filled the front of the picture): he cheers over the glowing fossils.
    { at: T.mosi, shot: { kind: 'hero', subjects: () => [mosi.head(), up(mosi.head(), .5), ...rowPoints(), ...bodies(bronto().slice(0, 1))], front: view([.06, -1], [-.5, -.85]), elevation: tall ? 40 : 36, cut: true, floor: 'auto' },
      act: all(beat('mosi-cheer'), () => mosi.look(stage.camera()), () => mosi.gesture('cheer')), fx: { kind: 'stars', at: () => up(mosi.body(), .8), count: 14 } },
    // The last picture: everyone on Sólarsyllan under the stars, wide and low; the fossils fly to the basket. The card comes up over it.
    { at: T.last, shot: { kind: 'wide', subjects: () => [...everyone(), ...rowPoints(), sky(53.5, 6.6, tall ? LAST.sky.tall : LAST.sky.wide)], front: view([-.22, -1], [-.8, -.6]), elevation: tall ? SKY_TILT.tall + .5 : SKY_TILT.wide + .5, cut: true, floor: 'auto', clear: tall ? LAST.clear.tall : LAST.clear.wide },
      act: all(beat('final-wide'), () => { stage.gifts.end(); task.rowShown(false); }, () => stage.friends().forEach(actor => actor.gesture('settle')), () => mosi.look(stage.camera())) },
    { at: T.last + 1.6, act: beat('end', false) },
  ];
}
