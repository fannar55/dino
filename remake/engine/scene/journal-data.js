/**
 * The six friends of the Star Festival, one slot each, in the main hue of each: the Main column of STYLE.md section 3's species
 * colour map, which tests/journal.test.mjs holds them to, so a hue that changes there must change here. The book's map (Kortið)
 * marks their places in the same hues (placeHue).
 */
export const FRIENDS = [
  { key: 'kambedla', name: 'Kambeðla', colour: '#8f6aa3' },
  { key: 'uggedla', name: 'Uggeðla', colour: '#47908a' },
  { key: 'thorsedla', name: 'Þórseðla', colour: '#e9b14d' },
  { key: 'flugedla', name: 'Flugeðla', colour: '#dc8090' },
  { key: 'sloedla', name: 'Slóeðla', colour: '#6793d0' },
  { key: 'gramedla', name: 'Grameðla', colour: '#b37955' },
];

/**
 * The seventh slot: no friend's, the unknown star's of the festival's end (chapters/hatid-seventh.js SEVENTH.colour, the hue none of
 * the six has). The journal draws it after the six, empty and blinking slowly, once the festival has been seen: a hint of story 2.
 * It is never earned, and FRIENDS stays six.
 */
export const SEVENTH_SLOT = { key: 'seventh', colour: '#c8ff5e' };

const STAR_PATH = 'M12 2.4L14.88 9.04L22.08 9.72L16.66 14.51L18.23 21.58L12 17.9L5.77 21.58L7.34 14.51L1.92 9.72L9.12 9.04Z';
export const STAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;

/**
 * The places of the book's map that are not a friend's (whose hue is the friend's own): the Fen, in its water's teal (the
 * spec's Fen palette, `#3f7a6e`).
 */
const PLACE_HUES = { fen: '#3f7a6e' };

/** The hue a place is marked in: a friend's main hue for the friend's place, or the place's own. */
export const placeHue = id => FRIENDS.find(friend => friend.key === id)?.colour ?? PLACE_HUES[id] ?? '#2f8f86';

/** The friend a star id names: `k1_kambedla` is kambedla's. */
export const friendOf = id => id.slice(id.indexOf('_') + 1);
