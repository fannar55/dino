// The friends who play Söngur Slóeðlu, by role (v2/format.js ROLES), in the hues of the style guide (STYLE.md section 3), and the
// Fen behind the lanes. The big screen (lab.js) and a guest's phone or tablet (fjolspil/guest-sloedla.js) draw the same friends.
// `picture` is the path under remake/ (as the guest page checks a picture's path), `src` the same as a full address.

const remake = path => new URL(`../../${path}`, import.meta.url).href;
const friend = (role, name, hue, light, dark, picture) => ({ role, name, hue, light, dark, picture, src: remake(picture) });

export const FRIENDS = {
  b: friend('b', 'Kambeðla', '#8f6aa3', '#e6d8ee', '#5d4370', 'assets/eitt/stegosaurus-tail.webp'),
  a: friend('a', 'Slóeðla', '#6793d0', '#d9e5f6', '#4b6fa4', 'assets/eitt/parasaurolophus.webp'),
  c: friend('c', 'Þórseðla', '#e9b14d', '#f7e6c2', '#89682e', 'assets/eitt/brontosaurus.webp'),
};

// The forest behind the lanes: the Fen (Þórseðla's home) rendered from the game's own 3D world in the evening light, wide and upright
// (capture.mjs, qa/remake/sloedla/bakgrunnur), which game.js turns to night; `fade` is where, in shares of the picture's height, its
// own sky gives way to the night sky above it (gone at the first, all there at the second).
export const BACKDROP = { wide: remake('assets/sloedla/kvold-fen.webp'), upright: remake('assets/sloedla/kvold-fen-upright.webp'), fade: [0.12, 0.48], fadeUpright: [0.2, 0.52] };
