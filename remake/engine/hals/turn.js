import * as THREE from 'three';
import { BOARD } from './rules.js';

// One turn of "Háls og hali" played out in the world: the piece hops the squares of the roll one by one (each square's plaque
// lights as it lands, for counting along), and where it lands decides the rest (rules.js resolveTurn): a neck's Þórseðla bows,
// takes the piece on the top of her neck and lifts it to the tier above; a tail's swishes and the piece slides down it; the
// fireflies carry it two squares on, the mud slips it two back, a fossil is a find. The rules decide where the piece goes; this
// only shows it. The camera follows the piece and frames a ride's two ends.
//
//   await playTurn(game, piece, result, { onStep(n, i), onLand(kind, data) })
//   game: { world (world.js), pieces, thorsedlas }   result: resolveTurn's
// onStep and onLand are for the host's voices and sounds (Task 3): onStep(square, count) on each hop, onLand(kind, data) with
// kind 'neck' | 'tail' | 'firefly' | 'mud' | 'fossil' | 'win' | 'square'. A Promise that onStep returns is waited for before the
// next hop (the host paces the hops to Mosi counting them). onPhase(name, data) says where a turn is, for the effects: 'hop';
// 'neck', then 'lift' ({ thorsedla }) as she lifts the piece and 'off' ({ at }) as it hops off at the top; 'tail', then 'slide'
// ({ curve }) and 'splash' ({ at }) at its end; 'firefly', 'mud' and 'fossil'.

const V3 = THREE.Vector3;

export async function playTurn(game, piece, result, { onStep = () => {}, onLand = () => {}, onPhase = () => {} } = {}) {
  const { world, thorsedlas } = game;
  const { board, view } = world;
  view.follow(() => piece.position);
  onPhase('hop');
  // the squares of the roll, one hop each
  for (const [i, n] of result.steps.entries()) {
    await piece.hopTo(n);
    board.glow(n, 1);
    await onStep(n, i + 1);
  }
  piece.rest();
  await world.wait(0.25);

  if (result.shortcut?.type === 'neck') {
    const t = thorsedlas.neckAt(result.landed);
    onLand('neck', { from: result.landed, to: result.destination, thorsedla: t });
    onPhase('neck');
    view.frame(board.square(result.landed), board.square(result.destination).add(new V3(0, 2, 0)), 4.5);
    await t.bow({ duration: 1.5 });
    await piece.hopOnto(t.ridePoint());
    piece.follow(out => t.ridePoint(out));
    onPhase('lift', { thorsedla: t });
    await t.lift({ duration: 2.8 });
    await world.wait(0.15);
    await piece.hopOnto(piece.spot(result.destination), { height: 1.2, seconds: 0.7 });
    onPhase('off', { at: piece.position.clone() });
    piece.square = result.destination;
    piece.face(onward(result.destination));
    board.glow(result.destination, 1);
    view.follow(() => piece.position);
    t.cheer(1.6);
  } else if (result.shortcut?.type === 'tail') {
    const t = thorsedlas.tailAt(result.landed);
    onLand('tail', { from: result.landed, to: result.destination, thorsedla: t });
    onPhase('tail');
    view.frame(board.square(result.landed).add(new V3(0, 1, 0)), board.square(result.destination), 4);
    t.swish();
    await world.wait(0.6);
    const curve = t.slideCurve();
    await piece.hopOnto(curve.getPointAt(0));
    onPhase('slide', { curve });
    await piece.slide(curve, { seconds: 1.4 + curve.getLength() * 0.07 });
    t.flick();
    onPhase('splash', { at: piece.position.clone() });
    await piece.hopOnto(piece.spot(result.destination), { height: 0.5, seconds: 0.4 });
    piece.square = result.destination;
    piece.face(onward(result.destination));
    board.glow(result.destination, 1);
    world.view.shake(0.12);
    view.follow(() => piece.position);
  } else if (result.event?.type === 'firefly') {
    onLand('firefly', { from: result.landed, to: result.destination });
    onPhase('firefly');
    await piece.float(result.destination);
    board.glow(result.destination, 1);
  } else if (result.event?.type === 'mud') {
    onLand('mud', { from: result.landed, to: result.destination });
    onPhase('mud');
    await piece.wobbleTo(result.destination);
    board.glow(result.destination, 1);
  } else if (result.event?.type === 'fossil') {
    onLand('fossil', { at: result.landed });
    onPhase('fossil');
    await piece.cheer(1);
  } else {
    onLand('square', { at: result.landed });
  }
  piece.rest();
  if (result.won) {
    onLand('win', { at: result.destination });
    for (const t of thorsedlas.list) t.cheer(3.2);
    world.friends?.cheer();
    await piece.cheer(4);
  }
}

const onward = n => (n === 0 ? 1 : Math.floor((n - 1) / BOARD.columns) % 2 ? -1 : 1);
