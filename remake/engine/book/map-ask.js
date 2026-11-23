import { pressable, reducedMotion } from './fx.js';
import { askLine, askText } from './map-chapters.js';

// The map's question (the owner, 2026-11-23): a tap on the place of a chapter the child can go to (map-chapters.js) asks first,
// "Viltu fara í kafla 2?", and only a yes starts the chapter. It is a small paper card over the map, in #book as an animal's card
// is: the friend's sticker, the question in big letters, and two big buttons, "Já!" and "Nei". Mosi says the question aloud
// (book_mosi_kafli_<n>), for a child who is only starting to read.
//
// "Já!" hands the chapter to onYes and leaves the card standing with nothing more to tap: the page is on its way to the chapter.
// "Nei", a tap beside the card and Escape (book.js) put the card away and leave everything as it was; so does the book when it
// is shut or turns to another page. Nothing here says no to the child: "Nei" is the child's own word.
//
// While it is up the spread behind it holds still and offers nothing to tap (book.css, as under a card).

const POP_MS = 260;

/**
 * The question card in `root` (#book), with the book's sound (`audio`). `onYes(row)` hears the yes, with the chapter's row of
 * map-chapters.js ({ place, chapter, number, star }). Returns
 *   open(row, { picture, hue })  asks about that chapter, with the friend's picture on a sticker in her hue; Mosi says the question
 *   close()                      puts the card away, and ends Mosi's question
 *   isOpen, row                  whether it is up, and the chapter it asks about (or asked last)
 *   el, yes, no                  the card's elements, for the lab and for probes
 */
export function createMapAsk(doc, root, { audio = null, win = globalThis.window, onYes = null } = {}) {
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  const el = make('div', 'map-ask');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.hidden = true;
  const card = make('div', 'map-ask-card');
  const sticker = make('span', 'map-ask-sticker');
  const image = doc.createElement('img');
  image.decoding = 'async';
  image.alt = '';
  image.draggable = false;
  sticker.append(image);
  const words = make('p', 'map-ask-words');
  const answers = make('div', 'map-ask-answers');
  const yes = make('button', 'map-ask-answer yes');
  yes.setAttribute('type', 'button');
  yes.textContent = 'Já!';
  const no = make('button', 'map-ask-answer no');
  no.setAttribute('type', 'button');
  no.textContent = 'Nei';
  answers.append(yes, no);
  card.append(sticker, words, answers);
  el.append(card);
  root.append(el);

  let isOpen = false;
  let asked = null; // the row it asks about
  let going = false; // the child said yes: the page is on its way, and nothing more is tapped

  function open(row, { picture = '', hue = '' } = {}) {
    asked = row;
    going = false;
    isOpen = true;
    image.src = picture;
    if (hue) el.style.setProperty('--hue', hue);
    words.textContent = askText(row.number);
    el.setAttribute('aria-label', askText(row.number));
    el.classList.remove('going');
    el.hidden = false;
    if (typeof card.animate === 'function' && !reducedMotion(win)) {
      card.animate([{ scale: '.6', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: POP_MS, easing: 'cubic-bezier(.2, .9, .3, 1.25)' });
    }
    audio?.narrate?.(askLine(row.number));
    try { yes.focus?.({ preventScroll: true }); } catch { /* a page that cannot move the focus */ }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    going = false;
    beside.clear();
    el.hidden = true;
    audio?.stop?.(); // Mosi's question ends with the card
  }

  function sayYes() {
    if (!isOpen || going) return;
    going = true;
    el.classList.add('going');
    audio?.stop?.();
    onYes?.(asked);
  }

  pressable(yes, { audio, win, onTap: sayYes });
  pressable(no, { audio, win, onTap: () => { if (!going) close(); } });
  // a tap beside the card is a no: a finger that went down on the veil itself and came up on it (no squash, no sparkle: the veil
  // is no control)
  const beside = new Set(); // the fingers that went down on the veil
  el.addEventListener('pointerdown', event => { if (event.target === el) beside.add(event.pointerId); });
  el.addEventListener('pointercancel', event => { beside.delete(event.pointerId); });
  el.addEventListener('pointerup', event => {
    if (beside.delete(event.pointerId) && event.target === el && !going) close();
  });

  return {
    open,
    close,
    el,
    yes,
    no,
    get isOpen() { return isOpen; },
    get row() { return asked; },
  };
}
