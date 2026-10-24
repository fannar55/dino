import { pressable, reducedMotion, sparkle } from './fx.js';
import { ICONS } from './icons.js';
import { createZoom } from './zoom.js';
import { createCardViewer } from './card-viewer.js';
import { createAnimalsPage } from './animals-page.js';
import { isUnlocked } from './cards.js';
import { renderMap } from './map-page.js';
import { FRIENDS, STAR_SVG, friendOf } from '../scene/journal.js';
import { FOSSIL_KINDS, validateGame } from '../hals/rules.js';
import { FOSSIL_ART, FOSSIL_HUES } from '../hals/fossil-art.js';

// The living book (spec sections 3.1 and 4): Egill's journal opened over the paused game as a full-screen, illustrated two-page
// spread, with Task 1's look (book.css). This is its shell: the spread, the ribbons that turn between its pages, the close, the
// Stjörnur page, and the open and close that grow it out of the journal's button and shrink it back in.
//
// Pages. Each ribbon has a leaf (.book-leaf[data-tab]) of two pages, each with a .book-tiles box for what the page shows. The
// Stjörnur leaf shows today's six friends' stars, earned or not. The Dýrin ribbon has a leaf for each spread of the cards (cards.js:
// chapter 1's animals on the first, the Fen's on the second), the animals page's (animals-page.js), whose tiles open a card
// (card-viewer.js) over the spread, and a card's picture zooms (zoom.js). A dog-eared corner turns to the next spread, on the right
// page's outer corner (the lower page's, on a tablet held upright), and one on the left turns back, with the ribbons' page turn and
// its sound; the corner on shows once an animal of a later spread is found, so chapter 1's book is as it was. The Dýrin ribbon
// remembers no spread between opens: the book opens on the first, unless a find asks (open's `find`, the journal's newest find),
// when it opens on that animal's spread and its tile nods. The Leikir leaf (part 3) has the "Eitt!" tile,
// Kambeðla's card game, which opens once her star (k1_kambedla) is in the book and is new until it is first played, and on the
// right page the stickers the child has won from her, one for each round won (the save's getEitt().wins). A tap on the open tile
// hands the game to onPlay('eitt'), which opens it over the book (engine/eitt/table.js, from main.js); the "Kennsla" button under it
// opens it on Mosi's tutorial, onPlay('eitt', { tutorial: true }). Beside it is the "Háls og hali" tile, a taped photo of Þórseðla,
// which hands Þórseðla's snakes and ladders to onPlay('hals') (engine/hals/game.js) once it is open (halsOpen: her star,
// k2_thorsedla, or a game of it played; it wiggles before, as "Eitt!" does without Kambeðla's), new until it is first played. Then the
// "Litla Yatzy" tile, a taped photo of Mosi, always open and new until it is first played, which hands the junior dice game with Mosi
// to onPlay('yatzy-junior'): a page of its own that main.js opens in a frame over the book. It has had the third tile since
// Slóeðla's Risaeðlu-Yatzy left the game (the owner's choice of 2026-10-24); before, it was a small button under hers.
// The Kortið leaf is the map (map-page.js): the forest and the Fen drawn across the spread, with a slot for the Fen and for each
// friend that fills with the friend's sticker once found and wears a star once done; a tap on a filled one has Mosi say its name
// and a sentence (k2_mosi_map_<id>), an empty one only taps.
// The Safn leaf is the fossil collection, Steingervingasafn: the eight finds of "Háls og hali" (engine/hals/rules.js FOSSIL_KINDS),
// four on each page as taped stickers (engine/hals/fossil-art.js), in colour once found (the save's getHals().found) and a soft
// silhouette with a "?" until then. A tap on a found one has the narrator say its name and a fact (hals_fossil_<kind>), shows its
// name over it, and sparkles; an unfound one wiggles.
//
// Who holds it. A book the child opens (the journal's button) holds the game: onPause(true) as it opens and onPause(false) when it
// is shut, however it is shut. A book a script opens (the chapter's last scene) holds nothing, so the scene's last line plays on,
// until the child's first touch inside it, other than its close, makes it the child's: onPause(true) then, and onPause(false) when
// it is shut. So the narrator, who reads only in a book the child holds, never talks over a chapter line or the music.
//
// Motion is transform and opacity only, through the Web Animations API: the spread grows from the button's little book and shrinks
// back into it, and a ribbon turns the page, the old one folding up over the spine and the new one folding down on the other side.
// A fast second tap cuts the motion under way short and starts its own from there. Where the page has no animations, or the tablet
// asks for less motion, the book opens and turns at once (it fades in and out).

const TABS = ['stars', 'animals', 'games', 'map', 'fossils'];
const LABELS = { stars: 'Stjörnur', animals: 'Dýrin', games: 'Leikir', map: 'Kortið', fossils: 'Safn' };
const EITT_STAR = 'k1_kambedla'; // the star that opens "Eitt!": Kambeðla's
const EITT_SEEN = 'eitt'; // kept in the save's seen list once the game has been opened, so the tile is new no more
const STICKERS_SHOWN = 20; // the sticker page holds this many; a child who has won more sees the count
const KAMBEDLA_PICTURE = new URL('../../assets/book/images/kambedla-render.webp', import.meta.url).href;
const THORSEDLA_PICTURE = new URL('../../assets/eitt/brontosaurus.webp', import.meta.url).href;
const MOSI_PICTURE = new URL('../../assets/eitt/mosi.webp', import.meta.url).href;
export const HALS_STAR = 'k2_thorsedla'; // the star that opens "Háls og hali": Þórseðla's (spec section 7)
const HALS_SEEN = 'hals'; // kept in the save's seen list once the game has been opened, so its tile is new no more
const JUNIOR_SEEN = 'yatzy-junior'; // kept in the save's seen list once Litla Yatzy has been opened, so its tile is new no more
const NAME_MS = 2600; // a fossil's name stays over its sticker this long
const OPEN_MS = 460;
const CLOSE_MS = 340;
const FADE_MS = 160; // the open and close with less motion
const TURN_MS = 560; // both halves of a page turn
const OPEN_EASE = 'cubic-bezier(.2, .9, .3, 1.12)'; // out of the button, a little past full size and back, like a game's window
const CLOSE_EASE = 'cubic-bezier(.55, 0, .8, .25)';
const PERSPECTIVE = 'perspective(2400px)';
// A page's corner turned up, the page under it peeping out, with the card's big arrow on it (book.css .spread-turn); the corner
// back is the same, mirrored.
const CORNER_SVG = '<svg class="corner-curl" viewBox="0 0 100 100" aria-hidden="true"><path class="corner-under" d="M100 20L20 100H100Z"/>'
  + '<path class="corner-flap" d="M100 20C76 24 52 28 30 30C28 52 24 76 20 100Z"/><path class="corner-crease" d="M97 23L23 97"/></svg>';

/**
 * Whether "Háls og hali" is open: with Þórseðla's star in the `save`, or once a game of it has been played (the save's
 * hals.played, which nothing clears: once open, it stays open, the owner on 22 October), or, in a save from before that mark,
 * while it keeps a game under way that engine/hals/game.js would go on with (valid, with its setup, and nobody has won). The
 * tile asks it, and so does main.js before it builds the board on the Leikir page.
 */
export function halsOpen(save) {
  const play = save.getHalsPlay?.();
  if (save.get().stars.includes(HALS_STAR) || play?.played) return true;
  const kept = play?.game;
  if (!kept?.state || !kept.setup) return false;
  try {
    return validateGame(kept.state) && kept.state.winner === null;
  } catch {
    return false;
  }
}

/**
 * The book in `doc`'s #book, over `cards` (parseCards), `media` (parseManifest) and the `save`, with the book's sound (`audio`,
 * createBookAudio). `onPause(paused)` holds the game; `onPlay('eitt', { tutorial })` opens a game from the Leikir page; `onTab(tab)` is told
 * the page an open book shows each time it opens or turns (main.js starts building "Háls og hali" on the Leikir page); `win` is the window (less
 * motion, the screen's shape). Returns
 *   open(tab, by, { find })  opens it on 'stars', 'animals' or 'games', as the child's (by 'child', which holds the game) or a script's
 *                      (by 'script', which does not); an open book turns to the tab instead, and a child's open makes it the child's.
 *                      On the animals, `find` (a finding's id, the journal's newest) opens the spread of the card it unlocks and nods
 *                      its tile; without it the first spread
 *   close()            shuts it, and stops the narration, the card and the zoom
 *   isOpen, tab        whether it is open, and the page it shows (or showed last)
 *   spread             the Dýrin spread shown (or shown last), from 1
 *   refresh()          shows what the save holds now (a star that has landed, an animal that has come)
 *   pictureOf(findId)  the thumbnail of the card that find unlocks, or null
 *   openCard(id, page) shows a card on the animals page, from its own place, as a tap on its tile would (the lab uses it)
 *   foundAgain(findId) the animal of a find the book has already was found again in a new place (the journal tells it): the next
 *                      time the child opens its card, it opens on the page that new place added (the card's refind, cards.js)
 *   cardViewer, zoom   the card and the zoom, for the lab and for probes
 */
export function createBook(doc, { cards = [], media = new Map(), save, audio = null, onPause = null, onPlay = null, onTab = null, win = globalThis.window } = {}) {
  const root = doc.getElementById('book');
  if (!root) throw new Error('The book needs #book on the page (see index.html)');
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };

  let isOpen = false;
  let holder = null; // 'child' or 'script', while it is open
  let tab = 'animals'; // the page it shows, and while it is shut the one it showed last
  let moving = null; // the open or close under way: { animations }
  let turning = null; // the page turn under way: { animations, pages }
  const spreadNumbers = [...new Set(cards.map(card => card.spread ?? 1))].sort((a, b) => a - b);
  if (!spreadNumbers.length) spreadNumbers.push(1);
  let spreadIndex = 0; // the Dýrin spread shown: spreadNumbers[spreadIndex]

  // The ribbons, each a tab standing up out of the pages.
  const ribbonsEl = make('div', 'book-ribbons');
  ribbonsEl.setAttribute('role', 'tablist');
  const ribbons = new Map(TABS.map(name => {
    const ribbon = make('button', 'ribbon');
    ribbon.setAttribute('type', 'button');
    ribbon.setAttribute('role', 'tab');
    ribbon.setAttribute('data-tab', name);
    ribbon.innerHTML = `${ICONS[name]}<span class="ribbon-label">${LABELS[name]}</span>`;
    ribbonsEl.append(ribbon);
    return [name, ribbon];
  }));

  // Each ribbon's leaf: a left and a right page (an upper and a lower one on a tablet held upright), each with its tiles' box. The
  // Dýrin ribbon has one for each spread of the cards, each with its corners: on to the next spread, and back to the one before.
  function makeLeaf(name) {
    const el = make('div', 'book-leaf');
    el.setAttribute('data-tab', name);
    const pages = ['left', 'right'].map(side => {
      const page = make('section', `book-page ${side}`);
      page.setAttribute('role', 'tabpanel');
      page.setAttribute('aria-label', LABELS[name]);
      page.append(make('div', 'book-tiles'));
      return page;
    });
    el.append(...pages);
    return { el, pages, tiles: pages.map(page => page.children[0]) };
  }
  const animalLeaves = spreadNumbers.map((spread, i) => {
    const leaf = makeLeaf('animals');
    leaf.el.setAttribute('data-spread', String(spread));
    leaf.corners = {};
    for (const [way, label, to] of [['prev', 'Fyrri dýr', i - 1], ['next', 'Fleiri dýr', i + 1]]) {
      if (to < 0 || to >= spreadNumbers.length) continue;
      const corner = make('button', `spread-turn ${way}`);
      corner.setAttribute('type', 'button');
      corner.setAttribute('aria-label', label);
      corner.innerHTML = `${CORNER_SVG}${ICONS.arrow}`;
      leaf.el.append(corner);
      leaf.corners[way] = corner;
    }
    return leaf;
  });
  const leaves = new Map(TABS.map(name => [name, name === 'animals' ? animalLeaves[0] : makeLeaf(name)]));
  const allLeaves = [...[...leaves.values()].filter(leaf => leaf !== animalLeaves[0]), ...animalLeaves];
  /** The leaf a ribbon shows now: its own, or for the Dýrin ribbon the spread's. */
  const leafOf = name => (name === 'animals' ? animalLeaves[spreadIndex] : leaves.get(name));

  // The Stjörnur page: a taped photo of each friend's star, in the friend's hue, lit once it is earned.
  const stars = FRIENDS.map(friend => {
    const tile = make('button', 'tile star-tile');
    tile.setAttribute('type', 'button');
    tile.style.setProperty('--hue', friend.colour);
    const picture = make('span', 'tile-picture');
    picture.innerHTML = STAR_SVG;
    const name = make('span', 'tile-name');
    name.textContent = friend.name;
    tile.append(picture, name);
    return tile;
  });
  const [starsLeft, starsRight] = leaves.get('stars').tiles;
  starsLeft.append(...stars.slice(0, 3));
  starsRight.append(...stars.slice(3));

  // The Leikir page: the "Eitt!" tile on the left, a taped photo of Kambeðla, and her stickers on the right.
  const eittTile = make('button', 'tile game-tile');
  eittTile.setAttribute('type', 'button');
  eittTile.setAttribute('data-game', 'eitt');
  eittTile.style.setProperty('--hue', '#8f6aa3'); // Kambeðla's violet, as on her card
  const eittPicture = make('span', 'tile-picture');
  const eittImage = doc.createElement('img');
  eittImage.src = KAMBEDLA_PICTURE;
  eittImage.alt = '';
  eittImage.draggable = false;
  eittPicture.append(eittImage);
  const eittName = make('span', 'tile-name');
  eittName.textContent = 'Eitt!';
  const eittBadge = make('span', 'badge-new');
  eittBadge.textContent = 'Nýtt!';
  eittBadge.setAttribute('aria-hidden', 'true');
  eittTile.append(eittPicture, eittName);
  const teachButton = make('button', 'game-teach'); // the tutorial again: "Kennsla"
  teachButton.setAttribute('type', 'button');
  teachButton.innerHTML = '<svg class="book-icon" viewBox="0 0 24 24" aria-hidden="true"><path class="icon-fill" d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6v4.2c3.3 2.6 7.7 2.6 11 0v-4.2M20 10.5v5" stroke-width="2"/></svg><span>Kennsla</span>';
  const sheet = make('div', 'sticker-sheet');
  sheet.setAttribute('role', 'img');
  // "Háls og hali": a taped photo of Þórseðla beside "Eitt!".
  const halsTile = make('button', 'tile game-tile');
  halsTile.setAttribute('type', 'button');
  halsTile.setAttribute('data-game', 'hals');
  halsTile.setAttribute('aria-label', 'Háls og hali, spil við Þórseðlu');
  halsTile.style.setProperty('--hue', '#e9b14d'); // Þórseðla's apricot
  const halsPicture = make('span', 'tile-picture');
  const halsImage = doc.createElement('img');
  halsImage.src = THORSEDLA_PICTURE;
  halsImage.alt = '';
  halsImage.draggable = false;
  halsPicture.append(halsImage);
  const halsName = make('span', 'tile-name');
  halsName.textContent = 'Háls og hali';
  const halsBadge = make('span', 'badge-new');
  halsBadge.textContent = 'Nýtt!';
  halsBadge.setAttribute('aria-hidden', 'true');
  halsTile.append(halsPicture, halsName);
  const eittSlot = make('div', 'game-slot');
  eittSlot.append(eittTile, teachButton);
  const halsSlot = make('div', 'game-slot');
  halsSlot.append(halsTile);
  // "Litla Yatzy": a taped photo of Mosi beside "Eitt!" and "Háls og hali".
  const juniorTile = make('button', 'tile game-tile');
  juniorTile.setAttribute('type', 'button');
  juniorTile.setAttribute('data-game', 'yatzy-junior');
  juniorTile.setAttribute('aria-label', 'Litla Yatzy við Mosa');
  juniorTile.style.setProperty('--hue', '#868862'); // Mosi's sage, as on the junior page (yatzy-junior.css --sage)
  const juniorPicture = make('span', 'tile-picture');
  const juniorImage = doc.createElement('img');
  juniorImage.src = MOSI_PICTURE;
  juniorImage.alt = '';
  juniorImage.draggable = false;
  juniorPicture.append(juniorImage);
  const juniorName = make('span', 'tile-name');
  juniorName.textContent = 'Litla Yatzy';
  const juniorBadge = make('span', 'badge-new');
  juniorBadge.textContent = 'Nýtt!';
  juniorBadge.setAttribute('aria-hidden', 'true');
  juniorTile.append(juniorPicture, juniorName);
  const juniorSlot = make('div', 'game-slot');
  juniorSlot.append(juniorTile);
  const [gamesLeft, gamesRight] = leaves.get('games').tiles;
  gamesLeft.append(eittSlot, halsSlot, juniorSlot);
  gamesRight.append(sheet);

  // The Safn page: Steingervingasafn, the eight fossils as taped stickers, four on each page.
  const fossilTiles = FOSSIL_KINDS.map(kind => {
    const tile = make('button', 'tile fossil-tile');
    tile.setAttribute('type', 'button');
    tile.setAttribute('data-fossil', kind.id);
    tile.style.setProperty('--hue', FOSSIL_HUES[kind.id]);
    const picture = make('span', 'tile-picture');
    picture.innerHTML = FOSSIL_ART[kind.id];
    const name = make('span', 'tile-name');
    tile.append(picture, name);
    return { tile, name, kind };
  });
  const fossilTitle = make('h2', 'fossil-title');
  fossilTitle.textContent = 'Steingervingasafn';
  const fossilCount = make('p', 'fossil-count');
  const fossilName = make('div', 'fossil-name'); // the name over a sticker tapped
  fossilName.setAttribute('aria-live', 'polite');
  fossilName.hidden = true;
  const fossilLeaf = leaves.get('fossils');
  const [fossilsLeft, fossilsRight] = fossilLeaf.tiles;
  fossilsLeft.classList.add('fossil-tiles');
  fossilsRight.classList.add('fossil-tiles');
  fossilsLeft.append(...fossilTiles.slice(0, 4).map(f => f.tile));
  fossilsRight.append(...fossilTiles.slice(4).map(f => f.tile));
  fossilLeaf.pages[0].append(fossilTitle);
  fossilLeaf.pages[1].append(fossilCount);
  fossilLeaf.el.append(fossilName);

  const spine = make('div', 'book-spine');
  spine.setAttribute('aria-hidden', 'true');
  const closeEl = make('button', 'book-close chunky');
  closeEl.setAttribute('type', 'button');
  closeEl.setAttribute('aria-label', 'Loka bókinni');
  closeEl.innerHTML = ICONS.close;
  const spread = make('div', 'book-spread');
  spread.append(ribbonsEl, ...allLeaves.map(leaf => leaf.el), spine, closeEl);
  root.classList.add('book');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Landkönnuðabók Egils');
  root.replaceChildren(spread);
  root.hidden = true;

  // The card and the zoom lie over the spread (in #book, so the book's container units size them); the animals page fills the Dýrin
  // leaf with its tiles. A card that is shut tells the page, whose tile is no longer new.
  const zoom = createZoom(doc, { audio, win, root });
  const cardViewer = createCardViewer(doc, root, { media, audio, zoom, win, onClose: () => animals.render() });
  const refound = new Set(); // the cards whose animals were found again in a new place, until each is next opened (foundAgain)
  const animals = createAnimalsPage(doc, animalLeaves.map(leaf => leaf.el), {
    cards, media, save, audio, win,
    onOpenCard: (card, fromRect) => {
      const page = refound.has(card.id) ? card.refind : 0; // found again: its newest page, once
      refound.delete(card.id);
      cardViewer.open(card, fromRect, page);
    },
  });
  // The Kortið page: a tap on a place found has Mosi say its name and a sentence (the chapter's line, through the book's sound).
  const map = renderMap(leaves.get('map'), { save, audio, win, onTap: id => audio?.narrate?.(`k2_mosi_map_${id}`) });

  /** Shows what the save holds: the stars that are lit, the animals found and new, and the game and its stickers. */
  function render() {
    const state = save.get();
    const got = new Set(state.stars.map(friendOf));
    FRIENDS.forEach((friend, i) => stars[i].classList.toggle('earned', got.has(friend.key)));
    animals.render();
    renderCorners(state);
    renderGames(state);
    renderHals(state);
    renderJunior(state);
    map.render();
    renderFossils();
  }

  /** A spread the child can turn to: the first always, and a later one once an animal on it is found. */
  function canShow(i, state) {
    return i === 0 || cards.some(card => (card.spread ?? 1) === spreadNumbers[i] && isUnlocked(card, state));
  }

  /** The nearest spread the child can turn to from spread `i`, the way `step` goes (+1 on, -1 back), or -1 when there is none. */
  function nextShown(i, step, state = save.get()) {
    for (let j = i + step; j >= 0 && j < spreadNumbers.length; j += step) if (canShow(j, state)) return j;
    return -1;
  }

  /** The corner on shows once a later spread has an animal found; the corner back always. */
  function renderCorners(state) {
    animalLeaves.forEach((leaf, i) => {
      if (leaf.corners.next) leaf.corners.next.hidden = nextShown(i, 1, state) < 0;
    });
  }

  /** The fossils found are in colour with their names; the rest are soft silhouettes with a "?". */
  function renderFossils() {
    const found = new Set(save.getHals?.().found ?? []);
    for (const { tile, name, kind } of fossilTiles) {
      const has = found.has(kind.id);
      tile.classList.toggle('found', has);
      tile.classList.toggle('unfound', !has);
      name.textContent = has ? kind.name : '?';
      tile.setAttribute('aria-label', has ? kind.name : 'Ófundinn steingervingur');
    }
    const count = FOSSIL_KINDS.filter(kind => found.has(kind.id)).length;
    fossilCount.textContent = `${count} af ${FOSSIL_KINDS.length}`;
  }

  let nameTimer = 0;
  /** A tap on a sticker: a found one says its name and fact, shows its name over it and sparkles; an unfound one wiggles. */
  function tapFossil({ tile, kind }) {
    if (!tile.classList.contains('found')) {
      audio?.sfx?.('wiggle');
      if (typeof tile.animate === 'function') {
        tile.animate(reducedMotion(win)
          ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
          : [{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '6deg' }, { rotate: '-3deg' }, { rotate: '0deg' }], { duration: 520, easing: 'ease-in-out' });
      }
      return;
    }
    audio?.narrate?.(`hals_fossil_${kind.id}`);
    sparkle(tile, 12, win);
    if (typeof tile.animate === 'function' && !reducedMotion(win)) {
      tile.animate([{ scale: '1' }, { scale: '1.1' }, { scale: '1' }], { duration: 480, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    }
    // The name over the sticker, placed in the spread's own pixels (its leaf lies on the spread).
    fossilName.textContent = kind.name;
    fossilName.hidden = false;
    const rect = tile.getBoundingClientRect?.();
    const box = spread.getBoundingClientRect?.();
    if (rect?.width && box) {
      fossilName.style.setProperty('left', `${(rect.left + rect.width / 2 - box.left).toFixed(1)}px`);
      fossilName.style.setProperty('top', `${(rect.top - box.top).toFixed(1)}px`);
    }
    fossilName.getAnimations?.().forEach(animation => animation.cancel());
    if (typeof fossilName.animate === 'function') {
      fossilName.animate(reducedMotion(win) ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translate(-50%, -80%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%, -100%) scale(1)' }],
        { duration: 360, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    }
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => { fossilName.hidden = true; }, NAME_MS);
  }

  /** "Eitt!" opens with Kambeðla's star and is new until first played; each round won is a sticker on the right page. */
  function renderGames(state) {
    const open = state.stars.includes(EITT_STAR);
    const fresh = open && !state.seen.includes(EITT_SEEN);
    eittTile.classList.toggle('found', open && !fresh);
    eittTile.classList.toggle('new', fresh);
    eittTile.classList.toggle('unfound', !open);
    eittTile.setAttribute('aria-label', open ? 'Eitt!, spil við Kambeðlu' : 'Eitt! (opnast með stjörnu Kambeðlu)');
    teachButton.hidden = !open;
    if (fresh && eittBadge.parentNode !== eittTile) eittTile.append(eittBadge);
    if (!fresh) eittBadge.remove();
    const wins = save.getEitt?.().wins ?? 0;
    if (sheet.getAttribute('data-wins') === String(wins)) return; // nothing new for the sticker sheet
    sheet.setAttribute('data-wins', String(wins));
    const stickers = Array.from({ length: Math.min(wins, STICKERS_SHOWN) }, () => make('span', 'book-sticker'));
    if (!wins) stickers.push(make('span', 'book-sticker empty')); // where the first one will go
    if (wins > STICKERS_SHOWN) {
      const count = make('span', 'sticker-count');
      count.textContent = String(wins);
      stickers.push(count);
    }
    sheet.replaceChildren(...stickers);
    sheet.setAttribute('aria-label', wins === 1 ? 'Einn kambeðlulímmiði' : `${wins} kambeðlulímmiðar`);
  }

  /** "Háls og hali" opens with Þórseðla's star or a game of it played (halsOpen), and is new until it is first played. */
  function renderHals(state) {
    const open = halsOpen(save);
    const fresh = open && !state.seen.includes(HALS_SEEN);
    halsTile.classList.toggle('found', open && !fresh);
    halsTile.classList.toggle('new', fresh);
    halsTile.classList.toggle('unfound', !open);
    halsTile.setAttribute('aria-label', open ? 'Háls og hali, spil við Þórseðlu' : 'Háls og hali (opnast með stjörnu Þórseðlu)');
    if (fresh && halsBadge.parentNode !== halsTile) halsTile.append(halsBadge);
    if (!fresh) halsBadge.remove();
  }

  /** "Litla Yatzy" is always open, and new until it is first played. */
  function renderJunior(state) {
    const fresh = !state.seen.includes(JUNIOR_SEEN);
    juniorTile.classList.toggle('found', !fresh);
    juniorTile.classList.toggle('new', fresh);
    if (fresh && juniorBadge.parentNode !== juniorTile) juniorTile.append(juniorBadge);
    if (!fresh) juniorBadge.remove();
  }

  /** A tile that is not open yet wiggles (and says so with its sound), as a tile does that waits for its star. */
  function wiggle(tile) {
    audio?.sfx?.('wiggle');
    if (typeof tile.animate === 'function') {
      tile.animate(reducedMotion(win)
        ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
        : [{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '6deg' }, { rotate: '-4deg' }, { rotate: '2.5deg' }, { rotate: '0deg' }], { duration: 560, easing: 'ease-in-out' });
    }
  }

  /** A tap on the "Háls og hali" tile: the game opens over the book once it is open (halsOpen), and wiggles before. */
  function tapHals() {
    if (!halsOpen(save)) {
      wiggle(halsTile);
      return;
    }
    audio?.sfx?.('tile');
    save.addSeen(HALS_SEEN);
    render();
    onPlay?.('hals');
  }

  /** A tap on the "Litla Yatzy" tile: the junior page opens in a frame over the book (main.js). */
  function tapJunior() {
    audio?.sfx?.('tile');
    save.addSeen(JUNIOR_SEEN);
    render();
    onPlay?.('yatzy-junior');
  }

  /** A tap on the "Eitt!" tile: it opens the game once Kambeðla's star is in, and wiggles before. */
  function tapGame() {
    if (!save.get().stars.includes(EITT_STAR)) {
      wiggle(eittTile);
      return;
    }
    audio?.sfx?.('tile');
    save.addSeen(EITT_SEEN);
    render();
    onPlay?.('eitt');
  }

  /** The card and what is zoomed in it are put away at once, as the book is shut or turns to another page. */
  function putCardAway() {
    zoom.close(true);
    cardViewer.close(true);
  }

  /** The page an open book shows, told to onTab (a callback that fails must not stop the book). */
  function tellTab() {
    try {
      onTab?.(tab);
    } catch (error) {
      console.error('[book]', error);
    }
  }

  function showTab() {
    root.setAttribute('data-tab', tab);
    for (const [name, ribbon] of ribbons) ribbon.setAttribute('aria-selected', String(name === tab));
    const shown = leafOf(tab);
    for (const leaf of allLeaves) leaf.el.hidden = leaf !== shown;
  }

  /** The game holds still for the child's book. A callback that fails must not leave the book half open. */
  function pause(paused) {
    try {
      onPause?.(paused);
    } catch (error) {
      console.error('[book]', error);
    }
  }

  /** The child touched a book a script opened: it is the child's now, and holds the game until it is shut. */
  function claim() {
    if (!isOpen || holder !== 'script') return;
    holder = 'child';
    pause(true);
  }

  // ---- Motion ----------------------------------------------------------------------------------------------------------

  const canAnimate = () => typeof spread.animate === 'function';

  /** Where the open or close under way has the spread now, and how strongly the book shows; null when none is under way. */
  function here() {
    if (!moving || !win?.getComputedStyle) return null;
    return { transform: win.getComputedStyle(spread).transform, opacity: Number(win.getComputedStyle(root).opacity) };
  }

  /** Stops the open or close under way where it is, and says where that was. */
  function halt() {
    const at = here();
    for (const animation of moving?.animations ?? []) animation.cancel();
    moving = null;
    return at;
  }

  /** The little book on the journal's button, which the spread grows out of; the screen's top right corner without one. */
  function origin() {
    const button = doc.getElementById('journal-button');
    const rect = button && !button.hidden ? (button.querySelector?.('.journal-icon') ?? button).getBoundingClientRect() : null;
    if (rect?.width > 0) return rect;
    return { left: (win?.innerWidth ?? 1280) - 64, top: 16, width: 44, height: 44 };
  }

  /** The transform that lays the open spread over `rect`, as small as it is there. Measured with no animation on the spread. */
  function over(rect) {
    const box = spread.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - (box.left + box.width / 2);
    const dy = rect.top + rect.height / 2 - (box.top + box.height / 2);
    const scale = Math.max(0.02, Math.min(rect.width / box.width, rect.height / box.height));
    return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(4)})`;
  }

  /** The book grows out of the button into the full spread, from wherever a close cut short had it. */
  function grow() {
    const at = halt();
    root.classList.remove('closing');
    root.hidden = false;
    if (!canAnimate()) return;
    const fadeIn = duration => root.animate([{ opacity: at?.opacity ?? 0 }, { opacity: 1 }], { duration, easing: 'ease-out' });
    const animations = reducedMotion(win)
      ? [fadeIn(FADE_MS)]
      : [spread.animate([{ transform: at?.transform ?? over(origin()) }, { transform: 'none' }], { duration: OPEN_MS, easing: OPEN_EASE }), fadeIn(OPEN_MS * 0.4)];
    const mine = { animations };
    moving = mine;
    animations[0].onfinish = () => { if (moving === mine) moving = null; };
  }

  /** The book shrinks back into the button and is put away; taps go through it to the game meanwhile. */
  function shrink() {
    const at = halt();
    if (!canAnimate() || root.hidden) {
      root.hidden = true;
      return;
    }
    root.classList.add('closing');
    const from = at?.opacity ?? 1;
    const animations = reducedMotion(win)
      ? [root.animate([{ opacity: from }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' })]
      : [
        spread.animate([{ transform: at?.transform ?? 'none' }, { transform: over(origin()) }], { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' }),
        root.animate([{ opacity: from }, { opacity: from, offset: 0.6 }, { opacity: 0 }], { duration: CLOSE_MS, fill: 'forwards' }), // solid until it is small
      ];
    const mine = { animations };
    moving = mine;
    animations[0].onfinish = () => {
      if (moving !== mine) return; // opened again meanwhile
      moving = null;
      for (const animation of animations) animation.cancel();
      root.hidden = true;
      root.classList.remove('closing');
    };
  }

  /** How a page turns over the spine: round which edge, and the angle at which it stands edge-on (it lies flat at 0). */
  function hinge(page) {
    const right = page.classList.contains('right'); // the right page, or the lower one on a tablet held upright
    if (win?.matchMedia?.('(max-aspect-ratio: 1/1)')?.matches) {
      return { origin: right ? '50% 0%' : '50% 100%', at: deg => `${PERSPECTIVE} rotateX(${deg}deg)`, edge: right ? 90 : -90 };
    }
    return { origin: right ? '0% 50%' : '100% 50%', at: deg => `${PERSPECTIVE} rotateY(${deg}deg)`, edge: right ? -90 : 90 };
  }

  /**
   * The page turn from one leaf to another (a ribbon's, or a Dýrin spread's), on (`forward`) or back: the old page lifts over the
   * spine, and the new one comes down.
   */
  function pageTurn(old, next, forward) {
    if (!canAnimate() || reducedMotion(win) || old === next) return;
    const out = old.pages[forward ? 1 : 0]; // the old right page going on, the old left one going back
    const into = next.pages[forward ? 0 : 1]; // and the new page on the other side of the spine
    old.el.hidden = false; // the old pages stay while one of them turns
    spread.classList.add('page-turning'); // the corners keep out of the way of a turning page
    const half = TURN_MS / 2;
    const [lift, land] = [hinge(out), hinge(into)];
    out.style.setProperty('transform-origin', lift.origin);
    into.style.setProperty('transform-origin', land.origin);
    out.classList.add('turning');
    into.classList.add('turning');
    const animations = [
      out.animate([{ transform: lift.at(0) }, { transform: lift.at(lift.edge) }], { duration: half, easing: 'cubic-bezier(.45, 0, .9, .5)', fill: 'forwards' }),
      into.animate([{ transform: land.at(land.edge) }, { transform: land.at(0) }], { duration: half, delay: half, easing: 'cubic-bezier(.1, .5, .55, 1)', fill: 'backwards' }),
    ];
    const mine = { animations, pages: [out, into] };
    turning = mine;
    animations[1].onfinish = () => { if (turning === mine) finishTurn(); };
  }

  /** Ends the page turn under way where it was going. */
  function finishTurn() {
    const done = turning;
    if (!done) return;
    turning = null;
    for (const animation of done.animations) animation.cancel();
    for (const page of done.pages) {
      page.classList.remove('turning');
      page.style.removeProperty('transform-origin');
    }
    spread.classList.remove('page-turning');
    const shown = leafOf(tab);
    for (const leaf of allLeaves) leaf.el.hidden = leaf !== shown;
  }

  // ---- What it does ------------------------------------------------------------------------------------------------------

  function turnTo(next) {
    if (next === tab) return;
    const from = tab;
    finishTurn(); // a turn still under way lands where it was going
    putCardAway();
    const old = leafOf(from);
    tab = next;
    render();
    showTab();
    audio?.sfx?.('turn');
    if (isOpen) pageTurn(old, leafOf(next), TABS.indexOf(next) > TABS.indexOf(from));
    if (isOpen) tellTab();
  }

  /** The Dýrin page turns to spread number `i` (from 0), at a corner: as a ribbon turns a page, with its sound. */
  function turnSpread(i) {
    if (tab !== 'animals' || i < 0 || i >= animalLeaves.length || i === spreadIndex) return;
    finishTurn();
    putCardAway();
    const old = leafOf('animals');
    const forward = i > spreadIndex;
    spreadIndex = i;
    render();
    showTab();
    audio?.sfx?.('turn');
    if (isOpen) pageTurn(old, leafOf('animals'), forward);
  }

  /** The card a find unlocks, if the book has it. */
  const cardOfFind = find => (find ? cards.find(card => card.unlock.found === find) ?? null : null);

  /** A find the book has already, made again in a new place: its card opens on its newest page the next time the child opens it. */
  function foundAgain(findId) {
    const card = cardOfFind(findId);
    if (card) refound.add(card.id);
  }

  function open(next = tab, by = 'script', { find = null } = {}) {
    if (!TABS.includes(next)) throw new TypeError(`The book has no page "${next}": it has ${TABS.slice(0, -1).join(', ')} and ${TABS.at(-1)}`);
    const found = next === 'animals' ? cardOfFind(find) : null; // a find asks for its spread, and its tile nods there
    if (isOpen) {
      if (by === 'child') claim();
      if (!found) {
        turnTo(next);
        return;
      }
      // One turn, straight to the find's spread (from another ribbon's page or another spread), and the nod once it has settled.
      const target = Math.max(0, spreadNumbers.indexOf(found.spread ?? 1));
      const turns = tab !== 'animals' || target !== spreadIndex;
      if (tab !== 'animals') {
        spreadIndex = target; // the ribbon's turn lands on the find's spread
        turnTo('animals');
      } else {
        turnSpread(target);
      }
      animals.nod(found.id, turns && canAnimate() && !reducedMotion(win) ? TURN_MS : 0);
      return;
    }
    isOpen = true;
    holder = by === 'child' ? 'child' : 'script';
    tab = next;
    spreadIndex = found ? Math.max(0, spreadNumbers.indexOf(found.spread ?? 1)) : 0; // the Dýrin page remembers no spread
    render();
    showTab();
    if (holder === 'child') pause(true);
    audio?.sfx?.('open');
    grow();
    if (found) animals.nod(found.id, reducedMotion(win) ? FADE_MS : OPEN_MS); // once the book has grown
    tellTab();
  }

  function close() {
    if (!isOpen) return;
    const was = holder;
    isOpen = false;
    holder = null;
    audio?.stop?.(); // nothing reads on after the book is shut
    putCardAway();
    finishTurn();
    audio?.sfx?.('close');
    shrink();
    if (was === 'child') pause(false);
  }

  function pictureOf(findId) {
    const card = cards.find(c => c.unlock.found === findId);
    const image = card ? media.get(card.pages[0].image) : null;
    return image?.thumb ?? image?.src ?? null;
  }

  /** A card shown from its own place on the animals page (no tile to grow from), seen as it is shown. False if it is not in the book. */
  function openCard(id, page = 0) {
    const card = cards.find(c => c.id === id);
    if (!card || !isOpen || tab !== 'animals') return false;
    const onSpread = spreadNumbers.indexOf(card.spread ?? 1);
    if (onSpread !== spreadIndex) { // its tile's spread lies under the card
      finishTurn();
      spreadIndex = onSpread;
      showTab();
    }
    save.addSeen(card.id);
    animals.render();
    return cardViewer.open(card, null, page);
  }

  for (const [name, ribbon] of ribbons) {
    pressable(ribbon, { audio, sound: null, win, onTap: () => (name === tab ? audio?.sfx?.('tap') : turnTo(name)) });
  }
  animalLeaves.forEach((leaf, i) => {
    if (leaf.corners.next) pressable(leaf.corners.next, { audio, sound: null, win, onTap: () => turnSpread(nextShown(i, 1)) }); // the turn sounds
    if (leaf.corners.prev) pressable(leaf.corners.prev, { audio, sound: null, win, onTap: () => turnSpread(nextShown(i, -1)) });
  });
  for (const tile of stars) pressable(tile, { audio, win });
  pressable(eittTile, { audio, sound: null, win, onTap: () => tapGame() }); // the tile plays its own sound
  pressable(halsTile, { audio, sound: null, win, onTap: () => tapHals() });
  pressable(juniorTile, { audio, sound: null, win, onTap: () => tapJunior() });
  for (const fossil of fossilTiles) pressable(fossil.tile, { audio, sound: null, win, onTap: () => tapFossil(fossil) });
  pressable(teachButton, { audio, sound: 'tile', win, onTap: () => { if (save.get().stars.includes(EITT_STAR)) onPlay?.('eitt', { tutorial: true }); } });
  pressable(closeEl, { audio, sound: null, win, onTap: () => close() }); // close() plays its own sound
  root.addEventListener('pointerdown', event => {
    if (event.target === closeEl || closeEl.contains?.(event.target)) return; // shutting a script's book does not make it the child's
    claim();
  }, true);
  root.addEventListener('contextmenu', event => event.preventDefault()); // a long press is a tap, never the browser's menu
  render();
  showTab();

  return {
    open,
    close,
    refresh: render,
    pictureOf,
    openCard,
    foundAgain,
    cardViewer,
    zoom,
    get isOpen() { return isOpen; },
    get tab() { return tab; },
    get spread() { return spreadNumbers[spreadIndex]; },
  };
}
