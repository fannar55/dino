// The cards of "Veiddu", our Go Fish: 13 kinds of Fen animals and fish, four cards of each (52 cards, 26 pairs; spec §1). It is
// plain data with no DOM. A card is { id, kind }, with the id '<kind>-<n>' for n 1 to 4: 'skjaldbaka-3', 'fiskur-raudur-1'.

export const COPIES = 4; // cards of each kind

// The kinds, in the order of the spec's table:
//   id      a name that is unique among the kinds: 'froskur'
//   name    what the card says ('Froskur')
//   ask     the kind in the accusative, for the question "Áttu <ask>?" ('frosk')
//   image   the photo of the animal, or null for a fish until the owner's images come (the card is then a plain colour)
//   colour  the colour of the card: the four colours of Eitt! (eitt.css) for the red, yellow, green and blue fish, an orange
//           and a violet beside them, and a soft colour of its own for each animal
const kind = (id, name, ask, colour, photo = true) => Object.freeze({ id, name, ask, image: photo ? `assets/veiddu/${id}.webp` : null, colour });

export const KINDS = Object.freeze([
  kind('froskur', 'Froskur', 'frosk', '#9fd18b'),
  kind('skjaldbaka', 'Skjaldbaka', 'skjaldböku', '#8cc5b0'),
  kind('drekafluga', 'Drekafluga', 'drekaflugu', '#8fc3e6'),
  kind('brunnklukka', 'Brunnklukka', 'brunnklukku', '#c9b49a'),
  kind('vatnalaesingi', 'Vatnalæsingi', 'vatnalæsingja', '#cfd98f'),
  kind('salamandra', 'Salamandra', 'salamöndru', '#f1b27a'),
  kind('snigill', 'Snigill', 'snigil', '#dcc0d8'),
  kind('fiskur-raudur', 'Rauður fiskur', 'rauðan fisk', '#e8483b', false),
  kind('fiskur-gulur', 'Gulur fiskur', 'gulan fisk', '#f7bd2b', false),
  kind('fiskur-graenn', 'Grænn fiskur', 'grænan fisk', '#48ad4a', false),
  kind('fiskur-blar', 'Blár fiskur', 'bláan fisk', '#3a8de4', false),
  kind('fiskur-appelsinugulur', 'Appelsínugulur fiskur', 'appelsínugulan fisk', '#f08a24', false),
  kind('fiskur-fjolublar', 'Fjólublár fiskur', 'fjólubláan fisk', '#8b5cc8', false),
]);

const KIND_IDS = new Set(KINDS.map(k => k.id));

/** The 52 cards, in a fixed order: four of the first kind, then four of the next. */
export function makeDeck() {
  return KINDS.flatMap(k => Array.from({ length: COPIES }, (_, i) => Object.freeze({ id: `${k.id}-${i + 1}`, kind: k.id })));
}

/** The kind of a card id: 'fiskur-raudur-2' is 'fiskur-raudur' (a RangeError for an id that is not a card of the deck). */
export function kindOf(cardId) {
  const id = String(cardId).slice(0, String(cardId).lastIndexOf('-'));
  if (!KIND_IDS.has(id)) throw new RangeError(`"${cardId}" is not a card`);
  return id;
}
