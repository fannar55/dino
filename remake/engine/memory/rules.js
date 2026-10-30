/** Pure, clock-driven memory rules. Animation and sound consume the returned events. */
export const MEMORY_TIMING = Object.freeze({ reveal: 0.45, mismatch: 1.5, close: 0.3, travel: 1 });

const DEFAULT_SPECIES = Object.freeze(['triceratops', 'stegosaurus', 'brontosaurus']);
// The gifts: small animals that hide under two leaves each, like the friends. They are found as pairs, join `found`, and
// go to the basket (surprise-items.js has their art).
const DEFAULT_GIFTS = Object.freeze(['shrew', 'hermitCrab', 'crab']);

const distinctNames = (value, what) => {
  if (!Array.isArray(value) || value.some(name => typeof name !== 'string' || !name.trim()) || new Set(value).size !== value.length) {
    throw new TypeError(`${what} must contain distinct, nonempty names`);
  }
};

/**
 * Twelve leaves by default: three friend pairs (species) and three gift pairs (item). Two leaves match when they hide the same
 * friend or the same gift; anything else is a mismatch. Cards: a friend { id, species, status }, a gift { id, species: null, item,
 * status }; status is 'hidden', 'open', 'matched' (a friend pair) or 'found' (a gift pair). `matchedPairs` counts friend pairs only;
 * `won` comes when every friend pair and every gift pair is found.
 * Events: reveal { ids, species, item } (the other field is null), match { ids, species, nestIndex }, gift { ids, item, giftIndex },
 * conceal { ids }, won { ids }.
 */
export function createMemoryGame({ random = Math.random, species = DEFAULT_SPECIES, gifts = DEFAULT_GIFTS } = {}) {
  if (typeof random !== 'function') throw new TypeError('random must be a function');
  if (!Array.isArray(species) || !species.length) throw new TypeError('species must contain distinct, nonempty names');
  distinctNames(species, 'species'); distinctNames(gifts, 'gifts');
  const roster = [...species], presents = [...gifts];
  let cards, selected, matchedPairs, phase, paused, stage, remaining, found;

  function restart() {
    // Build before replacing current state, so a broken random source cannot leave a half-reset game.
    const deck = [...roster.flatMap(name => [{ species: name }, { species: name }]), ...presents.flatMap(item => [{ species: null, item }, { species: null, item }])];
    for (let i = deck.length - 1; i > 0; i--) {
      const sample = random();
      if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError('random must return a number in [0, 1)');
      const j = Math.floor(sample * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    cards = deck.map((card, id) => ({ id, ...card, status: 'hidden' }));
    selected = []; found = []; matchedPairs = 0; phase = 'ready'; paused = false; stage = null; remaining = 0;
    return [];
  }

  function getState() {
    return Object.freeze({
      cards: Object.freeze(cards.map(card => Object.freeze({ ...card }))),
      selected: Object.freeze([...selected]), found: Object.freeze([...found]), matchedPairs, phase, paused,
    });
  }

  function wait(nextStage, seconds, nextPhase) {
    stage = nextStage; remaining = seconds; phase = nextPhase;
  }

  // The same leaf for a friend and for a gift: it opens, and the second one decides (a pair, or both close).
  function pick(index) {
    if (paused || (phase !== 'ready' && phase !== 'one-open') || !Number.isInteger(index)
      || index < 0 || index >= cards.length || cards[index].status !== 'hidden') return [];
    cards[index].status = 'open';
    selected.push(index);
    wait(selected.length === 1 ? 'reveal-first' : 'reveal-second', MEMORY_TIMING.reveal, 'revealing');
    return [{ type: 'reveal', ids: [index], species: cards[index].species, item: cards[index].item ?? null }];
  }

  // Every friend pair and every gift pair found.
  const everythingFound = () => matchedPairs === roster.length && found.length === presents.length;
  const sameHiding = (a, b) => a.species === b.species && (a.item ?? null) === (b.item ?? null);

  function finishStage(events) {
    const done = stage;
    stage = null; remaining = 0;
    if (done === 'reveal-first') {
      phase = 'one-open';
    } else if (done === 'reveal-second') {
      const [first, second] = selected;
      if (sameHiding(cards[first], cards[second])) {
        if (cards[first].item) {
          const giftIndex = found.length, item = cards[first].item;
          cards[first].status = cards[second].status = 'found'; found.push(item);
          events.push({ type: 'gift', ids: [...selected], item, giftIndex });
        } else {
          const nestIndex = matchedPairs++;
          cards[first].status = cards[second].status = 'matched';
          events.push({ type: 'match', ids: [...selected], species: cards[first].species, nestIndex });
        }
        wait('match-travel', MEMORY_TIMING.travel, 'matching');
      } else {
        wait('mismatch-hold', MEMORY_TIMING.mismatch, 'mismatch');
      }
    } else if (done === 'mismatch-hold') {
      for (const id of selected) cards[id].status = 'hidden';
      events.push({ type: 'conceal', ids: [...selected] });
      selected = [];
      wait('mismatch-close', MEMORY_TIMING.close, 'mismatch');
    } else if (done === 'mismatch-close') {
      phase = 'ready';
    } else if (done === 'match-travel') {
      selected = [];
      if (everythingFound()) {
        phase = 'won';
        events.push({ type: 'won', ids: cards.map(card => card.id) });
      } else phase = 'ready';
    }
  }

  function advance(dt) {
    const events = [];
    if (paused || !Number.isFinite(dt) || dt <= 0) return events;
    let available = dt;
    // Consume crossed boundaries in order, including after a slow frame, without real-time timers.
    while (stage && available > 0) {
      if (available + 1e-9 < remaining) { remaining -= available; break; }
      available = Math.max(0, available - remaining);
      finishStage(events);
    }
    return events;
  }

  function pause(value) { paused = Boolean(value); return []; }

  restart();
  return Object.freeze({ getState, pick, advance, pause, restart });
}
