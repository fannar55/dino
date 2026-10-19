// The eight finds of the fossil collection (spec section 5; rules.js FOSSIL_KINDS), drawn as small inline pictures: simple and
// friendly, in the book's ink outline and soft colours, each on a 100 by 100 box. The book's Steingervingasafn page shows them as
// taped stickers (in colour once found, a soft silhouette until then), and the game's event card shows the one a piece lands on.
//
//   FOSSIL_ART[id]   the markup of an <svg> (class "fossil-art"), for an element's innerHTML
//   FOSSIL_HUES[id]  the colour the sticker's photo is washed with

const INK = '#3b2f25';
const svg = body => `<svg class="fossil-art" viewBox="0 0 100 100" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** The ammonite's coil: a spiral of growing whorls, and ribs across each one. */
function ammonite() {
  const centre = [50, 52];
  const at = (angle, r) => [centre[0] + Math.cos(angle) * r, centre[1] + Math.sin(angle) * r];
  const radius = angle => 3 + angle * 2.75; // grows by about 17 units a turn
  const spiral = [];
  for (let a = 0; a <= Math.PI * 2 * 2.05; a += 0.12) spiral.push(at(a, radius(a)));
  const line = spiral.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const ribs = [];
  for (let a = Math.PI * 1.2; a <= Math.PI * 2 * 2.05; a += 0.42) {
    const [x1, y1] = at(a, radius(a) - 1);
    const [x2, y2] = at(a, Math.max(4, radius(a) - Math.PI * 2 * 2.75 * 0.82));
    ribs.push(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }
  const outer = radius(Math.PI * 2 * 2.05) + 1.5;
  return svg(`<circle cx="50" cy="52" r="${outer.toFixed(1)}" fill="#e6c48c" stroke="${INK}" stroke-width="4"/>` +
    `<circle cx="44" cy="44" r="${(outer * 0.62).toFixed(1)}" fill="#f2dcae" opacity=".55"/>` +
    `<path d="${ribs.join('')}" fill="none" stroke="#b98d55" stroke-width="2.4"/>` +
    `<path d="${line}" fill="none" stroke="${INK}" stroke-width="3.4"/>`);
}

/** The trilobite from above: its head shield with two eyes, a body of segments in three lobes, and a little tail. */
function trilobite() {
  const segments = [];
  for (let k = 0; k < 7; k++) {
    const y = 46 + k * 5.6;
    const half = 25 - k * 2.6;
    segments.push(`M${50 - half} ${y.toFixed(1)}Q50 ${(y + 2.6).toFixed(1)} ${50 + half} ${y.toFixed(1)}`);
  }
  return svg(`<path d="M24 44L76 44C75 64 64 84 50 90C36 84 25 64 24 44Z" fill="#b9a993" stroke="${INK}" stroke-width="3.6"/>` +
    `<path d="M42 44C42 62 45 78 50 88C55 78 58 62 58 44Z" fill="#9c8b74"/>` +
    `<path d="${segments.join('')}" fill="none" stroke="#6f604e" stroke-width="2.2"/>` +
    `<path d="M16 46C16 22 34 12 50 12C66 12 84 22 84 46C70 50 30 50 16 46Z" fill="#a8977f" stroke="${INK}" stroke-width="3.6"/>` +
    `<path d="M43 20C43 32 45 40 50 46C55 40 57 32 57 20Z" fill="#c6b69e"/>` +
    `<ellipse cx="33" cy="33" rx="4.4" ry="3.2" fill="${INK}"/><ellipse cx="67" cy="33" rx="4.4" ry="3.2" fill="${INK}"/>` +
    `<circle cx="32" cy="32" r="1.2" fill="#fff"/><circle cx="66" cy="32" r="1.2" fill="#fff"/>`);
}

/** A dinosaur's tooth: a curved cone, ivory with a shine, and its little serrated edge. */
const tooth = () => svg(`<path d="M30 88C26 60 32 32 58 10C62 34 74 58 70 88C58 94 42 94 30 88Z" fill="#f4ecd4" stroke="${INK}" stroke-width="3.8"/>` +
  `<path d="M31 76C46 82 58 82 70 76" fill="none" stroke="#d8c7a0" stroke-width="3"/>` +
  `<path d="M40 66C39 48 44 32 54 22" fill="none" stroke="#fff" stroke-width="4"/>` +
  `<path d="M60 18l3 3-1 3 3 3-1 3 3 3-1 3 3 3" fill="none" stroke="#c9b387" stroke-width="2"/>`);

/** A footprint pressed into stone: three toes and a heel, deep in a pale slab. */
const footprint = () => svg(`<ellipse cx="50" cy="54" rx="41" ry="37" fill="#cfc6b6" stroke="${INK}" stroke-width="3.6"/>` +
  `<ellipse cx="42" cy="44" rx="26" ry="18" fill="#ddd5c6" opacity=".7"/>` +
  `<path d="M50 82C39 82 35 71 39 63L28 39C26 33 33 30 36 35L46 54L46 25C46 18 54 18 54 25L54 54L64 35C67 30 74 33 72 39L61 63C65 71 61 82 50 82Z" fill="#8b8273" stroke="#6b6355" stroke-width="2.4"/>` +
  `<path d="M44 74C42 70 43 66 46 64" fill="none" stroke="#a69d8d" stroke-width="2.4"/>`);

/** A leaf turned to stone: a green leaf with its veins on a slab. */
const leaf = () => svg(`<rect x="11" y="14" width="78" height="74" rx="18" fill="#d3c9b4" stroke="${INK}" stroke-width="3.6"/>` +
  `<path d="M28 78C25 50 44 26 74 20C77 50 58 74 28 78Z" fill="#8fb06a" stroke="${INK}" stroke-width="3.2"/>` +
  `<path d="M28 78C43 62 56 44 74 20M39 66L36 54M47 56L47 43M55 46L58 35M43 64L56 66M51 54L64 56M59 44L69 45" fill="none" stroke="#5c7c42" stroke-width="2.4"/>`);

/** Amber with a fly in it: a golden drop, lit from inside, and the little fly caught in it. */
const amber = () => svg(`<path d="M50 11C73 13 89 34 87 57C85 79 67 91 46 89C25 87 11 71 13 48C15 27 29 10 50 11Z" fill="#f0a22c" stroke="${INK}" stroke-width="3.8"/>` +
  `<ellipse cx="52" cy="54" rx="27" ry="24" fill="#ffc861" opacity=".8"/>` +
  `<ellipse cx="40" cy="44" rx="9" ry="6" fill="#fff6dc" opacity=".55" transform="rotate(-30 40 44)"/>` +
  `<ellipse cx="45" cy="52" rx="8" ry="4.6" fill="#fffaf0" opacity=".8" stroke="#8a5a1e" stroke-width="1.4" transform="rotate(-35 45 52)"/>` +
  `<ellipse cx="59" cy="52" rx="8" ry="4.6" fill="#fffaf0" opacity=".8" stroke="#8a5a1e" stroke-width="1.4" transform="rotate(35 59 52)"/>` +
  `<ellipse cx="52" cy="60" rx="5" ry="8" fill="#5a3818"/><circle cx="52" cy="50" r="4" fill="#5a3818"/>` +
  `<path d="M47 60l-7 4M47 64l-6 7M57 60l7 4M57 64l6 7" fill="none" stroke="#5a3818" stroke-width="1.8"/>` +
  `<path d="M28 34C33 24 42 19 52 18" fill="none" stroke="#fff" stroke-width="4" opacity=".85"/>`);

/** A dinosaur egg: big, speckled, with a little crack where it will hatch. */
const egg = () => svg(`<path d="M50 9C71 9 83 40 83 61C83 80 69 91 50 91C31 91 17 80 17 61C17 40 29 9 50 9Z" fill="#efe1c3" stroke="${INK}" stroke-width="3.8"/>` +
  `<path d="M30 34C35 22 42 16 50 15" fill="none" stroke="#fff" stroke-width="4" opacity=".9"/>` +
  `<g fill="#c4935e"><circle cx="38" cy="52" r="4"/><circle cx="60" cy="40" r="3"/><circle cx="64" cy="64" r="4.6"/><circle cx="46" cy="74" r="3.2"/><circle cx="31" cy="66" r="2.4"/><circle cx="54" cy="57" r="2.2"/><circle cx="70" cy="50" r="2"/></g>` +
  `<path d="M36 28L42 34L46 27L52 35L57 28L62 33" fill="none" stroke="${INK}" stroke-width="2.6"/>`);

/** A skeleton in stone: a long-necked dinosaur's bones (as Þórseðla's), white on a slab. */
function skeleton() {
  const bone = (d, w = 4.2) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 3}"/><path d="${d}" fill="none" stroke="#fbf5e6" stroke-width="${w}"/>`;
  const ribs = [40, 47, 54, 61].map(x => `M${x} 49Q${x - 2} 58 ${x + 1} 64`).join('');
  return svg(`<rect x="7" y="18" width="86" height="70" rx="18" fill="#d3c9b4" stroke="${INK}" stroke-width="3.6"/>` +
    bone('M14 62C24 60 30 52 38 49C48 46 58 46 66 48C72 42 76 34 80 30', 3.6) +
    bone(ribs, 3) +
    bone('M42 54L38 76M46 54L48 77M60 52L57 76M64 52L67 76', 3.4) +
    `<ellipse cx="84" cy="28" rx="7" ry="5" fill="#fbf5e6" stroke="${INK}" stroke-width="3"/><circle cx="85" cy="27" r="1.4" fill="${INK}"/>`);
}

export const FOSSIL_ART = Object.freeze({
  ammonite: ammonite(),
  trilobite: trilobite(),
  tooth: tooth(),
  footprint: footprint(),
  leaf: leaf(),
  amber: amber(),
  egg: egg(),
  skeleton: skeleton(),
});

export const FOSSIL_HUES = Object.freeze({
  ammonite: '#e0a860', trilobite: '#9c8b74', tooth: '#d8c49a', footprint: '#a99d88',
  leaf: '#7fa65a', amber: '#f0a22c', egg: '#d9b98a', skeleton: '#b9ad94',
});
