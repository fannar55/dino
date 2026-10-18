import { pressable, reducedMotion } from './fx.js';
import { FRIENDS, STAR_SVG, friendOf } from '../scene/journal.js';

// The living book (spec sections 3.1 and 4): Egill's journal opened over the paused game as a full-screen, illustrated two-page
// spread, with Task 1's look (book.css). This is its shell: the spread, the ribbons that turn between its pages, the close, the
// Stjörnur page, and the open and close that grow it out of the journal's button and shrink it back in.
//
// Pages. Each ribbon has a leaf (.book-leaf[data-tab]) of two pages, each with a .book-tiles box for what the page shows. The
// Stjörnur leaf shows today's six friends' stars, earned or not. The Dýrin leaf is the animals page's: Task 7 renders it there
// (and refresh() renders it again); until then its pages are empty. Part 3 adds a ribbon for the games.
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

const TABS = ['stars', 'animals'];
const LABELS = { stars: 'Stjörnur', animals: 'Dýrin' };
const OPEN_MS = 460;
const CLOSE_MS = 340;
const FADE_MS = 160; // the open and close with less motion
const TURN_MS = 560; // both halves of a page turn
const OPEN_EASE = 'cubic-bezier(.2, .9, .3, 1.12)'; // out of the button, a little past full size and back, like a game's window
const CLOSE_EASE = 'cubic-bezier(.55, 0, .8, .25)';
const PERSPECTIVE = 'perspective(2400px)';

const ICONS = {
  stars: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><path class="icon-fill" d="M24 5.5c1.3 0 2 1 2.6 2.3l3.8 8.4 9.1 1.1c1.5.2 2.5 1 2.8 2.1.3 1.2-.3 2.2-1.3 3l-6.8 6.2 1.9 9c.3 1.4-.1 2.6-1.1 3.3-1 .7-2.3.6-3.5-.1L24 36.2l-7.5 4.6c-1.2.7-2.5.8-3.5.1-1-.7-1.4-1.9-1.1-3.3l1.9-9L7 22.4c-1-.8-1.6-1.8-1.3-3 .3-1.1 1.3-1.9 2.8-2.1l9.1-1.1 3.8-8.4C22 6.5 22.7 5.5 24 5.5z"/></svg>',
  animals: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><ellipse class="icon-fill" cx="24" cy="34" rx="10.5" ry="9.5"/><ellipse class="icon-fill" cx="24" cy="11" rx="5.4" ry="7.2"/><ellipse class="icon-fill" cx="11.6" cy="16.6" rx="5.2" ry="7" transform="rotate(-30 11.6 16.6)"/><ellipse class="icon-fill" cx="36.4" cy="16.6" rx="5.2" ry="7" transform="rotate(30 36.4 16.6)"/></svg>',
  close: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M13 13.5C19 20 28 28.5 35 35M35 13C28.5 20 20 28 13 35" stroke-width="6.5"/></svg>',
};

/**
 * The book in `doc`'s #book, over `cards` (parseCards), `media` (parseManifest) and the `save`, with the book's sound (`audio`,
 * createBookAudio). `onPause(paused)` holds the game; `win` is the window (less motion, the screen's shape). Returns
 *   open(tab, by)      opens it on 'stars' or 'animals', as the child's (by 'child', which holds the game) or a script's (by
 *                      'script', which does not); an open book turns to the tab instead, and a child's open makes it the child's
 *   close()            shuts it, and stops the narration
 *   isOpen, tab        whether it is open, and the page it shows (or showed last)
 *   refresh()          shows what the save holds now (a star that has landed)
 *   pictureOf(findId)  the thumbnail of the card that find unlocks, or null
 */
export function createBook(doc, { cards = [], media = new Map(), save, audio = null, onPause = null, win = globalThis.window } = {}) {
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

  /** Lights the stars the save holds. */
  function render() {
    const got = new Set(save.get().stars.map(friendOf));
    FRIENDS.forEach((friend, i) => stars[i].classList.toggle('earned', got.has(friend.key)));
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
        root.animate([{ opacity: from }, { opacity: from, offset: 0.5 }, { opacity: 0 }], { duration: CLOSE_MS, fill: 'forwards' }),
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
    tab = next;
    render();
    showTab();
    audio?.sfx?.('turn');
    if (isOpen) pageTurn(from, next);
  }

  function open(next = tab, by = 'script') {
    if (!TABS.includes(next)) throw new TypeError(`The book has no page "${next}": it has ${TABS.join(' and ')}`);
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
  }

  function close() {
    if (!isOpen) return;
    const was = holder;
    isOpen = false;
    holder = null;
    audio?.stop?.(); // nothing reads on after the book is shut (the card and the zoom close here too, with Tasks 8 and 9)
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

  for (const [name, ribbon] of ribbons) {
    pressable(ribbon, { audio, sound: null, win, onTap: () => (name === tab ? audio?.sfx?.('tap') : turnTo(name)) });
  }
  for (const tile of stars) pressable(tile, { audio, win });
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
    get isOpen() { return isOpen; },
    get tab() { return tab; },
  };
}
