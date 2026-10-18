import { pressable, reducedMotion, sparkle, TAP_SLOP_PX } from './fx.js';
import { ICONS } from './icons.js';

// The card viewer (spec section 3.3): an animal's pages over the spread, one big picture and a sentence at a time.
//
// It grows out of the tile, so the tile's picture becomes page one's picture, and covers nearly the whole screen. Every page's picture
// is put in the card when it opens and only the current one shows. A page has its picture (a tap zooms it), its text in big letters,
// an arrow each side, dots, and a speaker that reads it again; the first page has no arrow back and the last has a big button back to
// the animals in place of the arrow on. The narrator reads each page as it shows, and stops when the page flips, the card closes or
// another card opens. A swipe flips too: the first finger to move TAP_SLOP_PX drags the page, and a sideways drag of SWIPE_PX flips.
// A picture that is not our own has a small ⓘ whose window says who made it, its licence and where it is from.
//
// A flip is a short slide, and while it goes on the arrows and swipes wait: rapid taps cannot skip a page or pile up. A picture that
// is missing from the manifest, or will not load, shows a faint paw print; a line with no recording is silent (book-audio.js); neither
// stops the arrows. All the look is book.css's (.card and its parts).

const SWIPE_PX = 40;
const FOLLOW = 0.55; // how far the page follows a dragging finger
const GROW_MS = 440;
const SHRINK_MS = 280;
const FADE_MS = 160; // open and close with less motion
const FLIP_MS = 260;
const GROW_EASE = 'cubic-bezier(.2, .9, .3, 1.08)'; // from the tile, a little past full size and back
const SHRINK_EASE = 'cubic-bezier(.5, 0, .8, .3)';
const SLIDE_EASE = 'cubic-bezier(.2, .8, .2, 1)';
const LIFT = 'translateY(28px) scale(.86)'; // where a card with no tile to come from grows from
const MISSING = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' fill='none' stroke='%236b5a4a' stroke-width='1.5' opacity='.5'%3E%3Cellipse cx='24' cy='34' rx='10.5' ry='9.5'/%3E%3Cellipse cx='24' cy='11' rx='5.4' ry='7.2'/%3E%3Cellipse cx='11.6' cy='16.6' rx='5.2' ry='7' transform='rotate(-30 11.6 16.6)'/%3E%3Cellipse cx='36.4' cy='16.6' rx='5.2' ry='7' transform='rotate(30 36.4 16.6)'/%3E%3C/svg%3E";

/** Where a picture is from, for the ⓘ window: the site of its address. */
function siteOf(source) {
  try {
    const host = new URL(source).hostname.replace(/^www\./, '');
    return host.endsWith('wikimedia.org') ? 'Wikimedia Commons' : host;
  } catch {
    return String(source ?? '');
  }
}

/**
 * The card viewer inside `root` (the book's #book), over the book's pictures (`media`, parseManifest) and sound (`audio`), with
 * the picture zoom (`zoom`: open(img), close(), isOpen). `onClose(card)` is told when a card is shut. Returns
 *   open(card, fromRect = null, page = 0)   shows a card; false when one is open already. It grows from `fromRect`, the
 *                                           rectangle of the tile's picture, or from just below its own place without one
 *   close(instant = false)                  shuts it and stops the narration; instant skips the motion (the book is being shut)
 *   next(), prev()                          flip a page; false at the ends and while a flip is still going on
 *   page, card, isOpen                      the page's number (the first is 0), the card shown, and whether one is open
 */
export function createCardViewer(doc, root, { media = new Map(), audio = null, zoom = null, onClose = null, win = globalThis.window } = {}) {
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  const control = (className, label, icon = '') => {
    const element = make('button', className);
    element.setAttribute('type', 'button');
    element.setAttribute('aria-label', label);
    element.innerHTML = icon;
    return element;
  };

  // The card: the parts book.css lays out in a grid, with the picture, ⓘ and its window together in the photo.
  const back = control('card-back chunky', 'Aftur á dýrasíðuna', ICONS.back);
  const photo = control('card-photo', 'Stækka myndina');
  const info = control('card-info', 'Um myndina', ICONS.info);
  info.setAttribute('aria-expanded', 'false');
  info.hidden = true;
  const credit = make('div', 'card-credit');
  credit.setAttribute('role', 'note');
  credit.hidden = true;
  const figure = make('figure', 'card-image');
  figure.append(photo, info, credit);
  const prevButton = control('card-arrow prev', 'Til baka', ICONS.arrow);
  const nextButton = control('card-arrow next', 'Áfram', ICONS.arrow);
  const done = control('card-done chunky', 'Aftur á dýrasíðuna', ICONS.animals);
  done.hidden = true;
  const replay = control('card-replay chunky', 'Lesa aftur', ICONS.speaker);
  const text = make('p', 'card-text');
  const words = make('div', 'card-words');
  words.append(replay, text);
  const dots = make('div', 'card-dots');
  dots.setAttribute('role', 'img');
  const card = make('article', 'card');
  card.hidden = true;
  card.append(back, figure, prevButton, nextButton, done, words, dots);
  root.append(card);

  let current = null; // the card shown
  let pages = [];
  let index = 0;
  let imgs = []; // one picture per page, all in the photo, one showing
  let isOpen = false;
  let origin = null; // the rectangle it grew from, which it shrinks back into
  let motion = null; // the grow or shrink under way: { animations }
  let flipping = null; // the flip under way: { animations, timer, settle }
  const fingers = new Map(); // pointerId -> where it landed, for the swipe
  let drag = null; // the finger that drags the page: { id, x, y, dx, dy }

  const canAnimate = () => typeof card.animate === 'function';
  const read = () => audio?.narrate?.(pages[index]?.audio);

  // ---- The pages ---------------------------------------------------------------------------------------------------

  /** Every page's picture goes in the card, and only the current one shows. One that will not load becomes the paw print. */
  function fill() {
    imgs = pages.map(page => {
      const image = media.get(page.image) ?? null;
      const img = doc.createElement('img');
      let failed = false;
      img.alt = image?.alt ?? '';
      img.draggable = false;
      img.addEventListener?.('error', () => {
        if (failed) return;
        failed = true;
        img.src = MISSING;
      });
      img.src = image?.src ?? MISSING;
      return img;
    });
    photo.replaceChildren(...imgs);
    dots.replaceChildren(...pages.map(() => make('span', '')));
  }

  /** The ⓘ window for a picture that is not our own: who made it, its licence and where it is from. */
  function describe(image) {
    const rows = [['Mynd', image.credit], ['Leyfi', image.license], ['Frá', siteOf(image.source)]].filter(([, value]) => value);
    credit.replaceChildren(...rows.map(([label, value]) => {
      const row = make('p', '');
      const name = make('span', 'credit-label');
      name.textContent = label;
      const what = make('span', 'credit-value');
      what.textContent = value;
      row.append(name, what);
      return row;
    }));
  }

  function closeCredit() {
    credit.hidden = true;
    info.setAttribute('aria-expanded', 'false');
  }

  function toggleCredit() {
    const opening = credit.hidden;
    credit.hidden = !opening;
    info.setAttribute('aria-expanded', String(opening));
    audio?.sfx?.(opening ? 'info' : 'tap');
  }

  /** Shows page `i`: its picture, text and dots, the arrows that make sense there, and the ⓘ for a picture that is not our own. */
  function show(i) {
    index = i;
    const page = pages[i];
    const image = media.get(page.image) ?? null;
    const last = i === pages.length - 1;
    imgs.forEach((img, k) => { img.hidden = k !== i; });
    text.textContent = page.text;
    [...dots.children].forEach((dot, k) => dot.setAttribute('aria-current', k === i ? 'step' : 'false'));
    dots.setAttribute('aria-label', `Síða ${i + 1} af ${pages.length}`);
    prevButton.hidden = i === 0;
    nextButton.hidden = last;
    done.hidden = !last;
    closeCredit();
    const external = Boolean(image?.license) && image.license !== 'own';
    info.hidden = !external;
    if (external) describe(image);
  }

  /** The last page: a little celebration from the way back. */
  function celebrate() {
    audio?.sfx?.('celebrate');
    sparkle(done, 12, win);
  }

  /** Ends the flip under way where it was going. */
  function settleFlip() {
    flipping?.settle();
  }

  /** The page goes to `to` with a slide in from the side it comes from, and is read. False while the last flip is still going on. */
  function goto(to) {
    if (!isOpen || flipping || to < 0 || to >= pages.length || to === index) return false;
    const dir = to > index ? 1 : -1;
    const leaving = imgs[index];
    audio?.sfx?.('turn');
    text.style.removeProperty('translate'); // the text starts over from the side; the picture leaving keeps its drag until it is gone
    show(to);
    read();
    if (to === pages.length - 1) celebrate();
    if (!canAnimate() || typeof imgs[to].animate !== 'function') {
      leaving.style.removeProperty('translate');
      return true;
    }
    const calm = reducedMotion(win);
    const slide = distance => (calm ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: `${distance}px 0` }, { opacity: 1, translate: '0 0' }]);
    const options = { duration: FLIP_MS, easing: SLIDE_EASE };
    leaving.hidden = false; // it fades out where it is while the new page comes in
    const animations = [
      imgs[to].animate(slide(dir * 70), options),
      text.animate(slide(dir * 40), options),
      leaving.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLIP_MS * 0.6, fill: 'forwards' }),
    ];
    const mine = { animations, timer: null };
    mine.settle = () => {
      if (flipping !== mine) return;
      clearTimeout(mine.timer);
      flipping = null;
      for (const animation of animations) animation.cancel();
      leaving.hidden = leaving !== imgs[index];
      leaving.style.removeProperty('translate');
    };
    flipping = mine;
    animations[0].onfinish = mine.settle;
    mine.timer = setTimeout(mine.settle, FLIP_MS + 250); // a page that was hidden never hears its animation end
    mine.timer?.unref?.();
    return true;
  }

  const next = () => goto(index + 1);
  const prev = () => goto(index - 1);

  // ---- Swipes ------------------------------------------------------------------------------------------------------

  /** The page follows the dragging finger a little. */
  function follow(dx) {
    const shift = `${Math.max(-140, Math.min(140, dx * FOLLOW))}px 0`;
    imgs[index]?.style.setProperty('translate', shift);
    text.style.setProperty('translate', shift);
  }

  /** Lets go of the drag: the page springs back to its place. */
  function unfollow() {
    for (const element of [imgs[index], text]) {
      const shift = element?.style.getPropertyValue('translate');
      element?.style.removeProperty('translate');
      if (shift && typeof element.animate === 'function') element.animate([{ translate: shift }, { translate: '0 0' }], { duration: 200, easing: 'ease-out' });
    }
  }

  card.addEventListener('pointerdown', event => {
    if (!isOpen || event.button > 0) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  card.addEventListener('pointermove', event => {
    const start = fingers.get(event.pointerId);
    if (!start || !isOpen) return;
    if (!drag) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < TAP_SLOP_PX) return; // a finger at rest drags nothing
      drag = { id: event.pointerId, x: start.x, y: start.y, dx: 0, dy: 0 };
    }
    if (drag.id !== event.pointerId) return; // the first finger to move is the one that drags
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    follow(drag.dx);
  });
  const lift = event => {
    fingers.delete(event.pointerId);
    if (drag?.id !== event.pointerId) return;
    const { dx, dy } = drag;
    drag = null;
    const swipe = event.type === 'pointerup' && Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy);
    if (!(swipe && (dx < 0 ? next() : prev()))) unfollow();
  };
  card.addEventListener('pointerup', lift);
  card.addEventListener('pointercancel', lift);

  // ---- Opening and closing -------------------------------------------------------------------------------------------

  /** Where the grow or shrink under way has the card now; null when none is. */
  function here() {
    if (!motion || !win?.getComputedStyle) return null;
    return { transform: win.getComputedStyle(card).transform, opacity: Number(win.getComputedStyle(card).opacity) };
  }

  /** Stops the motion under way where it is, and says where that was. */
  function halt() {
    const at = here();
    for (const animation of motion?.animations ?? []) animation.cancel();
    motion = null;
    return at;
  }

  /** The transform that lays the card over `rect` with its picture on it, as small as the tile's: the tile's picture becomes the page's. */
  function over(rect) {
    const whole = card.getBoundingClientRect();
    const picture = figure.getBoundingClientRect();
    if (!(rect?.width > 0) || !(picture.width > 0) || !(whole.width > 0)) return LIFT;
    const scale = rect.width / picture.width;
    const [cx, cy] = [whole.left + whole.width / 2, whole.top + whole.height / 2];
    const [px, py] = [picture.left + picture.width / 2, picture.top + picture.height / 2];
    const [ox, oy] = [rect.left + rect.width / 2, rect.top + rect.height / 2];
    return `translate(${(ox - cx - scale * (px - cx)).toFixed(1)}px, ${(oy - cy - scale * (py - cy)).toFixed(1)}px) scale(${scale.toFixed(4)})`;
  }

  function grow() {
    const at = halt();
    card.classList.remove('closing');
    if (!canAnimate()) return;
    const animations = reducedMotion(win)
      ? [card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS })]
      : [
        card.animate([{ transform: at?.transform ?? over(origin) }, { transform: 'none' }], { duration: GROW_MS, easing: GROW_EASE }),
        card.animate([{ opacity: at?.opacity ?? 0 }, { opacity: 1 }], { duration: GROW_MS * 0.35, easing: 'ease-out' }),
      ];
    const mine = { animations };
    motion = mine;
    animations[0].onfinish = () => { if (motion === mine) motion = null; };
  }

  /** The card is gone: hidden, and its pictures let go. */
  function finishClose() {
    halt();
    card.hidden = true;
    card.classList.remove('closing');
    photo.replaceChildren();
    imgs = [];
  }

  function shrink() {
    const at = halt();
    if (!canAnimate() || card.hidden) {
      finishClose();
      return;
    }
    card.classList.add('closing');
    const from = at?.opacity ?? 1;
    const animations = reducedMotion(win)
      ? [card.animate([{ opacity: from }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' })]
      : [
        card.animate([{ transform: at?.transform ?? 'none' }, { transform: over(origin) }], { duration: SHRINK_MS, easing: SHRINK_EASE, fill: 'forwards' }),
        card.animate([{ opacity: from }, { opacity: from, offset: 0.55 }, { opacity: 0 }], { duration: SHRINK_MS, fill: 'forwards' }), // solid until it is small
      ];
    const mine = { animations };
    motion = mine;
    animations[0].onfinish = () => { if (motion === mine) finishClose(); };
  }

  function open(next_, fromRect = null, start = 0) {
    if (isOpen || !next_?.pages?.length) return false;
    halt(); // a card still shrinking gives way
    fingers.clear();
    drag = null;
    current = next_;
    pages = next_.pages;
    origin = fromRect;
    isOpen = true;
    card.setAttribute('data-card', current.id);
    card.setAttribute('aria-label', current.name);
    fill();
    show(Math.max(0, Math.min(pages.length - 1, start)));
    card.hidden = false;
    grow();
    read();
    if (index === pages.length - 1) celebrate();
    return true;
  }

  function close(instant = false) {
    if (!isOpen) return false;
    const shut = current;
    isOpen = false;
    settleFlip();
    fingers.clear();
    drag = null;
    closeCredit();
    audio?.stop?.(); // nothing reads on after the card is shut
    zoom?.close?.(true);
    if (instant) finishClose();
    else shrink();
    onClose?.(shut);
    return true;
  }

  pressable(back, { audio, win, onTap: () => close() });
  pressable(done, { audio, win, onTap: () => close() });
  pressable(prevButton, { audio, sound: null, win, onTap: () => prev() }); // a flip sounds `turn` itself
  pressable(nextButton, { audio, sound: null, win, onTap: () => next() });
  pressable(replay, { audio, win, onTap: () => read() });
  pressable(info, { audio, sound: null, win, onTap: () => toggleCredit() });
  pressable(photo, { audio, sound: null, win, onTap: () => zoom?.open?.(imgs[index]) }); // the zoom sounds `zoomIn`

  return {
    open,
    close,
    next,
    prev,
    get page() { return index; },
    get card() { return current; },
    get isOpen() { return isOpen; },
  };
}
