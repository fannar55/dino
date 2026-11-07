/**
 * Level 2's second task as a script for the scene runner (scenes.js): the Þríhyrnur butt the rockfall away with the child's taps, "Einn, tveir, BÚMM!". They hop to the tunnel's mouth,
 * side by side, noses to the pile; each tap is a charge and a hit (a rear back, the horns in, a shake of the camera and of the pile), and the third lets the pile go: it falls apart
 * into steps. Built like scenes/light.js (see it for `stage.task`); this one also uses
 *   task.phase()   what the mover is doing now ('approach', 'ready', 'strike', 'fall', 'cheer', 'home'...)
 * The big word of each tap ("Einn!", "Tveir!", "BÚMM!") comes with the mover's beat event (game.js).
 */
const all = (...fns) => fns;
const bodies = actors => actors.flatMap(actor => [actor.root.position.clone(), actor.getNosePosition()]);
const up = (point, metres) => point.clone().setY(point.y + metres);

/**
 * The scene: a wide cut on the hop, a follow cut, the still low shot of the pair and the pile for the taps (`taps` taps in `timeout` seconds; no taps: "Við gerum þetta saman!"),
 * a wide cut of the pile coming down, a face cut on the cheer, and the camera glides back.
 */
export function headbuttScene(stage, { taps = 3, timeout = 4 } = {}) {
  const tris = () => stage.pair('triceratops'), mouth = () => stage.task.mouth(), pile = () => stage.task.pile();
  const heads = () => tris().map(actor => actor.getNosePosition());
  const arrived = () => stage.task.waitingBeat() !== null || !stage.task.busy();
  const stillGoing = () => { if (!stage.task.busy()) stage.task.abort(); };
  const front = turn => () => stage.task.front(turn);
  return [
    { at: 0, shot: { kind: 'wide', subjects: () => [...bodies(tris()), pile().top, mouth(), up(mouth(), 2.4)], front: front(.7), elevation: 24, cut: true },
      act: all(() => { if (!stage.task.start('headbutt', { beats: taps })) stage.task.abort(); }, () => stage.mosi.look(mouth()), () => stage.pairGesture('triceratops', 'hop')) },
    { at: 1.3, shot: { kind: 'follow', subjects: () => bodies(tris()), front: front(.6), cut: true }, act: stillGoing },
    { at: 1.35, wait: { until: arrived, timeout: 3 } },
    // The child's moment: the pair and the pile from low down on the glade's side; the shot holds still while they charge.
    { at: 1.4, shot: { kind: 'hero', subjects: () => [...bodies(tris()), pile().top, pile().front, up(mouth(), 1.8)], front: front(.8), elevation: 24, cut: true }, act: all(stillGoing, () => stage.mosi.look(pile().centre)) },
    { at: 1.5, wait: { tap: 'rocks', count: taps, timeout,
      onTap: () => stage.task.beat(),
      // No taps: "Við gerum þetta saman!" and they charge three times on their own.
      onTimeout: () => { stage.say('together'); while (stage.task.beat()); } } },
    { at: 1.55, wait: { until: () => ['fall', 'cheer', 'home'].includes(stage.task.phase()) || !stage.task.busy(), timeout: 9 } },
    // The pile comes down into steps: wide and low, with all of it (and the dust) in the frame.
    { at: 1.6, shot: { kind: 'wide', scale: 'action', subjects: () => [...bodies(tris()), pile().top, pile().front, mouth(), up(mouth(), 2)], front: front(.75), elevation: 28, cut: true }, act: () => stage.mosi.look(pile().centre) },
    { at: 1.65, wait: { until: () => ['cheer', 'home'].includes(stage.task.phase()) || !stage.task.busy(), timeout: 6 } },
    // We did it: the pair's cheer, Mosi claps.
    { at: 1.7, shot: { kind: 'face', subjects: () => [...heads(), ...heads().map(p => up(p, .5)), ...tris().map(actor => actor.root.position.clone())], front: front(.7), elevation: 14, cut: true },
      act: all(() => stage.mosi.gesture('clap')), sound: { name: 'call', species: 'triceratops' } },
    { at: 3, wait: { until: () => !stage.task.busy(), timeout: 5 } },
    { at: 3.05, shot: { release: true, duration: .8 }, act: all(() => stage.mosi.look(stage.camera()), () => stage.mosi.gesture('laugh')) },
  ];
}
