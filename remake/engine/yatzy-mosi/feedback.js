import {CATEGORIES, previews} from './rules.js';

// Respond to points the current player can actually use, not just duplicate faces.
export function rollFeedback(state) {
  const points = previews(state), again = state.rollCount < 3;
  const upper = CATEGORIES.filter(c => c.section === 'upper');
  const copies = Math.max(0, ...upper.map(c => (points[c.id] || 0) / c.face));
  const faces = new Set(state.dice);
  const straightClose = [['smallStraight', [1,2,3,4,5]], ['largeStraight', [2,3,4,5,6]]]
    .some(([id, values]) => points[id] !== undefined && values.filter(value => faces.has(value)).length >= 4);
  let kind;
  if (points.yatzy > 0) kind = 'yatzy';
  else if (points.largeStraight > 0 || points.fullHouse > 0 || points.fourKind > 0 || copies >= 4) kind = 'great';
  else if (points.smallStraight > 0 || points.threeKind > 0 || points.twoPairs > 0 || copies >= 3 || points.pair >= 10) kind = 'good';
  else if (again && (points.pair > 0 || copies >= 2 || straightClose)) kind = 'near';
  else kind = 'bad';
  if ((kind === 'bad' || kind === 'near') && points.chance >= 23) kind = 'good';
  const copy = {
    yatzy: ['YATZY!', 'Fimm vinir, allir eins!'],
    great: ['FRÁBÆRT KAST!', 'Þetta gefur góð stig.'],
    good: ['GOTT KAST', 'Þetta lofar góðu!'],
    near: ['ÞETTA GETUR TEKIST', 'Kannski náum við enn betra kasti.'],
    bad: ['Æ, ÞETTA VAR ERFITT', again ? 'Við eigum enn kast eftir.' : 'Næsta umferð getur gengið betur.'],
  }[kind];
  return {kind, kicker: copy[0], text: copy[1]};
}
