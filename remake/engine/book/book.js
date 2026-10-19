import { pressable, reducedMotion, sparkle } from './fx.js';
import { ICONS } from './icons.js';
import { createZoom } from './zoom.js';
import { createCardViewer } from './card-viewer.js';
import { createAnimalsPage } from './animals-page.js';
import { FRIENDS, STAR_SVG, friendOf } from '../scene/journal.js';
import { FOSSIL_KINDS } from '../hals/rules.js';
import { FOSSIL_ART, FOSSIL_HUES } from '../hals/fossil-art.js';

// The living book (spec sections 3.1 and 4): Egill's journal opened over the paused game as a full-screen, illustrated two-page
// spread, with Task 1's look (book.css). This is its shell: the spread, the ribbons that turn between its pages, the close, the
// Stjörnur page, and the open and close that grow it out of the journal's button and shrink it back in.
//
// Pages. Each ribbon has a leaf (.book-leaf[data-tab]) of two pages, each with a .book-tiles box for what the page shows. The
// Stjörnur leaf shows today's six friends' stars, earned or not. The Dýrin leaf is the animals page's (animals-page.js), whose tiles
// open a card (card-viewer.js) over the spread, and a card's picture zooms (zoom.js). The Leikir leaf (part 3) has the "Eitt!" tile,
// Kambeðla's card game, which opens once her star (k1_kambedla) is in the book and is new until it is first played, and on the
// right page the stickers the child has won from her, one for each round won (the save's getEitt().wins). A tap on the open tile
// hands the game to onPlay('eitt'), which opens it over the book (engine/eitt/table.js, from main.js); the "Kennsla" button under it
// opens it on Mosi's tutorial, onPlay('eitt', { tutorial: true }). Beside it is the "Háls og hali" tile, a taped photo of Þórseðla,
// which hands Þórseðla's snakes and ladders to onPlay('hals') (engine/hals/game.js), new until it is first played.
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

const TABS = ['stars', 'animals', 'games', 'fossils'];
const LABELS = { stars: 'Stjörnur', animals: 'Dýrin', games: 'Leikir', fossils: 'Safn' };
const EITT_STAR = 'k1_kambedla'; // the star that opens "Eitt!": Kambeðla's
const EITT_SEEN = 'eitt'; // kept in the save's seen list once the game has been opened, so the tile is new no more
const STICKERS_SHOWN = 20; // the sticker page holds this many; a child who has won more sees the count
const KAMBEDLA_PICTURE = new URL('../../assets/book/images/kambedla-render.webp', import.meta.url).href;
const THORSEDLA_PICTURE = new URL('../../assets/eitt/brontosaurus.webp', import.meta.url).href;
const SLOEDLA_PICTURE = new URL('../../assets/eitt/parasaurolophus.webp', import.meta.url).href;
// "Háls og hali" and "Risaeðlu-Yatzy" show on the Leikir page always while they are being made: development switches.
const HALS_OPEN = true;
const HALS_SEEN = 'hals'; // kept in the save's seen list once the game has been opened, so its tile is new no more
const YATZY_OPEN = true;
const YATZY_SEEN = 'yatzy'; // kept in the save's seen list once Risaeðlu-Yatzy has been opened
const NAME_MS = 2600; // a fossil's name stays over its sticker this long
const OPEN_MS = 460;
const CLOSE_MS = 340;
const FADE_MS = 160; // the open and close with less motion
const TURN_MS = 560; // both halves of a page turn
const OPEN_EASE = 'cubic-bezier(.2, .9, .3, 1.12)'; // out of the button, a little past full size and back, like a game's window
const CLOSE_EASE = 'cubic-bezier(.55, 0, .8, .25)';
const PERSPECTIVE = 'perspective(2400px)';

/**
 * The book in `doc`'s #book, over `cards` (parseCards), `media` (parseManifest) and the `save`, with the book's sound (`audio`,
 * createBookAudio). `onPause(paused)` holds the game; `onPlay('eitt', { tutorial })` opens a game from the Leikir page; `onTab(tab)` is told
 * the page an open book shows each time it opens or turns (main.js starts building "Háls og hali" on the Leikir page); `win` is the window (less
 * motion, the screen's shape). Returns
 *   open(tab, by)      opens it on 'stars', 'animals' or 'games', as the child's (by 'child', which holds the game) or a script's (by
 *                      'script', which does not); an open book turns to the tab instead, and a child's open makes it the child's
 *   close()            shuts it, and stops the narration, the card and the zoom
 *   isOpen, tab        whether it is open, and the page it shows (or showed last)
 *   refresh()          shows what the save holds now (a star that has landed, an animal that has come)
 *   pictureOf(findId)  the thumbnail of the card that find unlocks, or null
 *   openCard(id, page) shows a card on the animals page, from its own place, as a tap on its tile would (the lab uses it)
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

  // Each ribbon's leaf: a left and a right page (an upper and a lower one on a tablet held upright), each with its tiles' box.
  const leaves = new Map(TABS.map(name => {
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
    return [name, { el, pages, tiles: pages.map(page => page.children[0]) }];
  }));

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
  // "Risaeðlu-Yatzy": a taped photo of Slóeðla beside "Eitt!" and "Háls og hali".
  const yatzyTile = make('button', 'tile game-tile');
  yatzyTile.setAttribute('type', 'button');
  yatzyTile.setAttribute('data-game', 'yatzy');
  yatzyTile.setAttribute('aria-label', 'Risaeðlu-Yatzy, teningaspil við Slóeðlu');
  yatzyTile.style.setProperty('--hue', '#d97a4a'); // Slóeðla's warm orange-ochre
  const yatzyPicture = make('span', 'tile-picture');
  const yatzyImage = doc.createElement('img');
  yatzyImage.src = SLOEDLA_PICTURE;
  yatzyImage.alt = '';
  yatzyImage.draggable = false;
  yatzyPicture.append(yatzyImage);
  const yatzyName = make('span', 'tile-name');
  yatzyName.textContent = 'Risaeðlu-Yatzy';
  const yatzyBadge = make('span', 'badge-new');
  yatzyBadge.textContent = 'Nýtt!';
  yatzyBadge.setAttribute('aria-hidden', 'true');
  yatzyTile.append(yatzyPicture, yatzyName);
  const yatzySlot = make('div', 'game-slot');
  yatzySlot.append(yatzyTile);
  const [gamesLeft, gamesRight] = leaves.get('games').tiles;
  gamesLeft.append(eittSlot, halsSlot, yatzySlot);
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
  spread.append(ribbonsEl, ...[...leaves.values()].map(leaf => leaf.el), spine, closeEl);
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
  const animals = createAnimalsPage(doc, leaves.get('animals').el, {
    cards, media, save, audio, win,
    onOpenCard: (card, fromRect) => cardViewer.open(card, fromRect),
  });

  /** Shows what the save holds: the stars that are lit, the animals found and new, and the game and its stickers. */
  function render() {
    const state = save.get();
    const got = new Set(state.stars.map(friendOf));
    FRIENDS.forEach((friend, i) => stars[i].classList.toggle('earned', got.has(friend.key)));
    animals.render();
    renderGames(state);
    renderHals(state);
    renderYatzy(state);
    renderFossils();
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

  /** "Háls og hali" is there while HALS_OPEN, and new until it is first played. */
  function renderHals(state) {
    const fresh = HALS_OPEN && !state.seen.includes(HALS_SEEN);
    halsSlot.hidden = !HALS_OPEN;
    halsTile.classList.toggle('found', HALS_OPEN && !fresh);
    halsTile.classList.toggle('new', fresh);
    if (fresh && halsBadge.parentNode !== halsTile) halsTile.append(halsBadge);
    if (!fresh) halsBadge.remove();
  }

  /** "Risaeðlu-Yatzy" is there while YATZY_OPEN, and new until it is first played. */
  function renderYatzy(state) {
    const fresh = YATZY_OPEN && !state.seen.includes(YATZY_SEEN);
    yatzySlot.hidden = !YATZY_OPEN;
    yatzyTile.classList.toggle('found', YATZY_OPEN && !fresh);
    yatzyTile.classList.toggle('new', fresh);
    if (fresh && yatzyBadge.parentNode !== yatzyTile) yatzyTile.append(yatzyBadge);
    if (!fresh) yatzyBadge.remove();
  }

  /** A tap on the "Háls og hali" tile: the game opens over the book. */
  function tapHals() {
    if (!HALS_OPEN) return;
    audio?.sfx?.('tile');
    save.addSeen(HALS_SEEN);
    render();
    onPlay?.('hals');
  }

  /** A tap on the "Risaeðlu-Yatzy" tile: Slóeðla's dice game opens over the book. */
  function tapYatzy() {
    if (!YATZY_OPEN) return;
    audio?.sfx?.('tile');
    save.addSeen(YATZY_SEEN);
    render();
    onPlay?.('yatzy');
  }

  /** A tap on the "Eitt!" tile: it opens the game once Kambeðla's star is in, and wiggles before. */
  function tapGame() {
    if (!save.get().stars.includes(EITT_STAR)) {
      audio?.sfx?.('wiggle');
      if (typeof eittTile.animate === 'function') {
        eittTile.animate(reducedMotion(win)
          ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
          : [{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '6deg' }, { rotate: '-4deg' }, { rotate: '2.5deg' }, { rotate: '0deg' }], { duration: 560, easing: 'ease-in-out' });
      }
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
    for (const [name, leaf] of leaves) leaf.el.hidden = name !== tab;
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

  /** The page turn from one ribbon's leaf to another's: the old page lifts over the spine, and the new one comes down. */
  function pageTurn(from, to) {
    if (!canAnimate() || reducedMotion(win)) return;
    const forward = TABS.indexOf(to) > TABS.indexOf(from);
    const old = leaves.get(from);
    const out = old.pages[forward ? 1 : 0]; // the old right page going on, the old left one going back
    const into = leaves.get(to).pages[forward ? 0 : 1]; // and the new page on the other side of the spine
    old.el.hidden = false; // the old pages stay while one of them turns
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
    for (const [name, leaf] of leaves) leaf.el.hidden = name !== tab;
  }

  // ---- What it does ------------------------------------------------------------------------------------------------------

  function turnTo(next) {
    if (next === tab) return;
    const from = tab;
    finishTurn(); // a turn still under way lands where it was going
    putCardAway();
    tab = next;
    render();
    showTab();
    audio?.sfx?.('turn');
    if (isOpen) pageTurn(from, next);
    if (isOpen) tellTab();
  }

  function open(next = tab, by = 'script') {
    if (!TABS.includes(next)) throw new TypeError(`The book has no page "${next}": it has ${TABS.slice(0, -1).join(', ')} and ${TABS.at(-1)}`);
    if (isOpen) {
      if (by === 'child') claim();
      turnTo(next);
      return;
    }
    isOpen = true;
    holder = by === 'child' ? 'child' : 'script';
    tab = next;
    render();
    showTab();
    if (holder === 'child') pause(true);
    audio?.sfx?.('open');
    grow();
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
    save.addSeen(card.id);
    animals.render();
    return cardViewer.open(card, null, page);
  }

  for (const [name, ribbon] of ribbons) {
    pressable(ribbon, { audio, sound: null, win, onTap: () => (name === tab ? audio?.sfx?.('tap') : turnTo(name)) });
  }
  for (const tile of stars) pressable(tile, { audio, win });
  pressable(eittTile, { audio, sound: null, win, onTap: () => tapGame() }); // the tile plays its own sound
  pressable(halsTile, { audio, sound: null, win, onTap: () => tapHals() });
  pressable(yatzyTile, { audio, sound: null, win, onTap: () => tapYatzy() });
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
    cardViewer,
    zoom,
    get isOpen() { return isOpen; },
    get tab() { return tab; },
  };
}
