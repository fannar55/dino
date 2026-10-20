// Mosi's advice for the child in "Risaeðlu-Yatzy!".
// Just like in "Eitt!" (engine/eitt/advice.js), Mosi gives the sharp move for the child's current dice and open categories,
// together with a warm Icelandic sentence and which dice or category box to highlight.

import { CATEGORIES, dinoByFace, scoreCategory } from './rules.js';
import { sharpAction } from './sloedla.js';

export const YATZY_REASONS = Object.freeze([
  'first-roll',
  'use-egg',
  'hold-matching',
  'hold-two-pairs',
  'hold-straight',
  'hold-friend',
  'score-yatzy',
  'score-full-nest',
  'score-straight',
  'score-best',
]);

/** Warm Icelandic explanations for each reason Mosi gives. */
export function adviceText(action, game) {
  switch (action.reason) {
    case 'first-roll':
      return 'Pikkaðu á Kasta hnappinn til að kasta teningunum!';
    case 'use-egg':
      return 'Gullna eggið er tilbúið! Pikkaðu á það svo Slóeðla blási töfratón úr kambinum!';
    case 'hold-matching': {
      const dino = dinoByFace(action.targetFace);
      return dino
        ? `Geymdu ${dino.name} í mosahreiðrinu og kastaðu hinum teningunum aftur!`
        : 'Geymdu eins teninga í mosahreiðrinu og kastaðu hinum aftur!';
    }
    case 'hold-two-pairs':
      return 'Þú ert með tvö pör! Geymdu þau í hreiðrinu og reyndu að ná í Fullt hreiður!';
    case 'hold-straight':
      return 'Teningarnir mynda næstum fótsporaröð! Geymdu þá í hreiðrinu og kastaðu aftur.';
    case 'hold-friend': {
      const dino = dinoByFace(action.targetFace);
      return dino
        ? `Geymdu ${dino.name} í hreiðrinu og kastaðu hinum aftur!`
        : 'Geymdu þennan tening í hreiðrinu og kastaðu hinum aftur!';
    }
    case 'score-yatzy':
      return 'Risaeðlu-Yatzy! Allir fimm eins! Pikkaðu á glitrandi reitinn á spjaldinu!';
    case 'score-full-nest':
      return 'Fullt hreiður! Pikkaðu á reitinn sem glóir á spjaldinu!';
    case 'score-straight':
      return 'Glæsileg fótsporaröð! Veldu reitinn sem glóir á spjaldinu!';
    case 'score-best':
    default: {
      const cat = CATEGORIES.find(c => c.id === action.categoryId);
      const pts = cat ? scoreCategory(cat.id, game.dice) : 0;
      return cat && pts > 0
        ? `Settu kastið í „${cat.short}“ — það gefur þér ${pts} stig!`
        : 'Veldu þennan reit á spjaldinu til að halda áfram.';
    }
  }
}

/**
 * Returns Mosi's advice for the child right now, or `null` when it is not the child's turn or the game is over:
 * - `{ type: 'roll', reason, text }`
 * - `{ type: 'use-egg', reason, text }`
 * - `{ type: 'hold-and-roll', held, diceToTap, reason, text }`
 * - `{ type: 'score', categoryId, reason, text }`
 */
export function adviseYatzy(game) {
  if (!game || game.winner || game.turn !== 'child') return null;
  const action = sharpAction(game, 'child');
  const text = adviceText(action, game);

  if (action.type === 'hold-and-roll') {
    const diceToTap = action.held
      .map((wantHeld, i) => (wantHeld !== game.held[i] ? i : -1))
      .filter(i => i >= 0);
    return { ...action, diceToTap, text };
  }
  return { ...action, text };
}
