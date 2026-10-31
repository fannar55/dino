// The scene's screen layer: captions, choice buttons, the fade and the tray the child drags things from.
// The look is a placeholder until the explorer's-journal UI pass (STYLE.md section 10); the behaviour stays.

/** How far above the finger a carried item floats, in px, so the finger does not hide it. */
export const DRAG_LIFT = 18;

// Icons for the tray, by name. A script may also pass its own SVG markup as an icon.
const PETALS = [0, 72, 144, 216, 288]
  .map(angle => `<ellipse cx="32" cy="16.5" rx="9.5" ry="14" transform="rotate(${angle} 32 32)" fill="#f3e9ff" stroke="#9a72b8" stroke-width="2.2"/>`)
  .join('');
// Egill's woven basket with the red berries in it (chapter 2, scene 4: the child drags it up to hold it up for Þórseðla).
const WEAVE = [0, 1, 2, 3, 4].map(i => `<path d="M${17 + i * 7.5} 34 L${19.5 + i * 6.2} 53" stroke="#8a6233" stroke-width="1.8" stroke-linecap="round"/>`).join('');
const ICONS = {
  glowFlower: `<svg viewBox="0 0 64 64" aria-hidden="true">${PETALS}<circle cx="32" cy="32" r="7" fill="#f2c443" stroke="#b9770e" stroke-width="2.2"/><circle cx="30" cy="30" r="2.2" fill="#fff1cf"/></svg>`,
  basket: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="28" r="7" fill="#d4343c" stroke="#8e1f25" stroke-width="2"/><circle cx="38" cy="26" r="7" fill="#d4343c" stroke="#8e1f25" stroke-width="2"/><circle cx="31" cy="21" r="6.5" fill="#e04a50" stroke="#8e1f25" stroke-width="2"/><circle cx="29" cy="19" r="1.8" fill="#ffd9d0"/><path d="M10 32 Q32 37 54 32 L48 54 Q32 58 16 54 Z" fill="#dcb56c" stroke="#8a6233" stroke-width="2.4" stroke-linejoin="round"/>${WEAVE}<path d="M13 43 Q32 47 51 43" fill="none" stroke="#b68a48" stroke-width="2"/><path d="M9 32 Q32 38 55 32" fill="none" stroke="#8a6233" stroke-width="3.4" stroke-linecap="round"/></svg>`,
};

/** Egill's basket as a picture (the memory game's HUD shows it, filling with what the leaves hide). */
export const BASKET_ICON = ICONS.basket;

/**
 * The tray: pockets along the edge of the screen, each holding an item the child can pick up and carry
 * with a finger. Letting go tells the listeners (`onDrop`) where, in canvas pixels, and then it is up to
 * them: `putBack(id)` sends the item home, `remove(id)` takes it away. One nobody takes goes home by itself.
 * While an item is carried the document hears the finger, wherever it goes, so an item the browser does not
 * keep the pointer on cannot make the tray miss the finger being lifted.
 *   show([{ id, icon }])   fill the tray; `icon` is the name of a built-in icon ('glowFlower') or SVG markup
 *   prepare([{ id, icon }]) build the pockets for these items now and keep the tray put away: a show of the same items later
 *                          builds nothing (main.js does it behind the start button, so the first show is not a long frame)
 *   hide()                 put it away; an item that is being carried goes home, with no drop
 *   onDrop(fn)             fn({ id, x, y }) where the item was let go; returns the function that stops listening
 */
export function createTray(doc = document) {
  const trayEl = doc.getElementById('tray');
  if (!trayEl) throw new Error('The page has no #tray (see index.html)');
  const canvasEl = doc.getElementById('view'); // drops are reported from its top-left corner
  const entries = new Map(); // id -> { id, slotEl, itemEl, state: 'home' | 'carried' | 'dropped' | 'gone' }
  let builtFor = []; // the items the pockets were built for, [{ id, icon }], in order
  const listeners = [];
  let carried = null; // the grip on the item being carried: { entry, pointerId, startX, startY, homeX, homeY, dx, dy }

  function emit(drop) {
    for (const fn of [...listeners]) {
      try {
        fn(drop);
      } catch (error) {
        console.error('[tray]', error); // a listener that throws must not strand the item or silence the others
      }
    }
  }

  /** Let go of the finger without a drop. */
  function release(entry) {
    if (carried?.entry !== entry) return;
    doc.removeEventListener('pointermove', onMove, true);
    doc.removeEventListener('pointerup', onUp, true);
    doc.removeEventListener('pointercancel', onCancel, true);
    try {
      entry.itemEl.releasePointerCapture?.(carried.pointerId);
    } catch {
      // the pointer is already gone
    }
    carried = null;
  }

  function putBack(id) {
    const entry = entries.get(id);
    if (!entry) return;
    release(entry);
    entry.state = 'home';
    entry.itemEl.classList.remove('dragging', 'gone');
    entry.itemEl.style.removeProperty('--dx'); // the style sheet eases it back to its pocket
    entry.itemEl.style.removeProperty('--dy');
  }

  function remove(id) {
    const entry = entries.get(id);
    if (!entry) return;
    release(entry);
    entry.state = 'gone';
    entry.itemEl.classList.remove('dragging');
    entry.itemEl.classList.add('gone'); // it shrinks away where it is; the pocket stays, empty
  }

  function follow(entry, dx, dy) {
    entry.itemEl.style.setProperty('--dx', `${dx}px`);
    entry.itemEl.style.setProperty('--dy', `${dy - DRAG_LIFT}px`);
  }

  function onDown(entry, event) {
    // The same pointer going down again means its last press ended without the tray hearing (a button let
    // go outside the page, say): that item goes home, so the tray is never stuck.
    if (carried?.pointerId === event.pointerId) putBack(carried.entry.id);
    if (carried || entry.state !== 'home' || event.button > 0) return; // one finger, one item, the main button
    event.preventDefault();
    const pocket = entry.slotEl.getBoundingClientRect();
    carried = {
      entry,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      homeX: pocket.left + pocket.width / 2,
      homeY: pocket.top + pocket.height / 2,
      dx: 0,
      dy: 0,
    };
    entry.state = 'carried';
    entry.itemEl.classList.add('dragging');
    follow(entry, 0, 0);
    doc.addEventListener('pointermove', onMove, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onCancel, true);
    try {
      entry.itemEl.setPointerCapture?.(event.pointerId); // so a finger that leaves the window is still heard
    } catch {
      // the pointer is already gone
    }
  }

  function onMove(event) {
    if (event.pointerId !== carried?.pointerId) return;
    carried.dx = event.clientX - carried.startX;
    carried.dy = event.clientY - carried.startY;
    follow(carried.entry, carried.dx, carried.dy);
  }

  function onUp(event) {
    if (event.pointerId !== carried?.pointerId) return;
    onMove(event);
    const grip = carried;
    const { entry } = grip;
    const origin = canvasEl?.getBoundingClientRect();
    const drop = {
      id: entry.id,
      x: grip.homeX + grip.dx - (origin?.left ?? 0),
      y: grip.homeY + grip.dy - DRAG_LIFT - (origin?.top ?? 0),
    };
    release(entry);
    entry.state = 'dropped';
    emit(drop);
    if (entry.state === 'dropped') putBack(entry.id); // nobody took it
  }

  function onCancel(event) {
    if (event.pointerId !== carried?.pointerId) return;
    putBack(carried.entry.id);
  }

  /** The pockets for `items`: the ones already built when they were built for the same items, else new ones. */
  function build(items) {
    const ids = items.map(item => item.id);
    const twice = ids.find((id, i) => ids.indexOf(id) !== i);
    if (twice !== undefined) throw new TypeError(`Tray items need different ids: "${twice}" comes twice`);
    const markup = items.map(({ icon }) => {
      const svg = typeof icon === 'string' && icon.trimStart().startsWith('<') ? icon : ICONS[icon];
      if (!svg) throw new Error(`Unknown tray icon "${icon}" (use ${Object.keys(ICONS).join(', ')}, or SVG markup)`);
      return svg;
    });

    if (carried) putBack(carried.entry.id);
    const same = builtFor.length === items.length && items.every((item, i) => builtFor[i].id === item.id && builtFor[i].icon === item.icon);
    if (same) { // every pocket full again
      for (const entry of entries.values()) {
        entry.state = 'home';
        entry.itemEl.classList.remove('dragging', 'gone');
        entry.itemEl.style.removeProperty('--dx');
        entry.itemEl.style.removeProperty('--dy');
      }
      return;
    }
    builtFor = items.map(({ id, icon }) => ({ id, icon }));
    entries.clear();
    trayEl.replaceChildren(...items.map(({ id }, i) => {
      const slotEl = doc.createElement('div');
      slotEl.className = 'tray-slot';
      const itemEl = doc.createElement('div');
      itemEl.className = 'tray-item';
      itemEl.innerHTML = markup[i];
      slotEl.append(itemEl);
      const entry = { id, slotEl, itemEl, state: 'home' };
      entries.set(id, entry);
      itemEl.addEventListener('pointerdown', event => onDown(entry, event));
      itemEl.addEventListener('contextmenu', event => event.preventDefault()); // a long press must not end the touch
      return slotEl;
    }));
  }

  function show(items) {
    build(items);
    trayEl.hidden = false;
  }

  function prepare(items) {
    build(items);
  }

  function hide() {
    if (carried) putBack(carried.entry.id);
    trayEl.hidden = true;
  }

  function onDrop(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  return { show, prepare, hide, remove, putBack, onDrop };
}

export function createStageUI(doc = document) {
  const captionEl = doc.getElementById('caption');
  const speakerEl = captionEl.querySelector('.caption-speaker');
  const textEl = captionEl.querySelector('.caption-text');
  const choicesEl = doc.getElementById('choices');
  const fadeEl = doc.getElementById('fade');
  const tray = createTray(doc);
  let fadeLevel = Number(getComputedStyle(fadeEl).opacity) || 0;
  let captionId = 0;

  /**
   * Show a line (speaker name in their colour) and return its id for clearCaption, or hide
   * whatever shows with caption(null).
   */
  function caption(speaker, text, colour) {
    captionId++;
    if (speaker == null && text == null) {
      captionEl.hidden = true;
      return captionId;
    }
    speakerEl.textContent = speaker ?? '';
    speakerEl.style.color = colour ?? '';
    textEl.textContent = text ?? '';
    captionEl.hidden = false;
    return captionId;
  }

  /** Hide a caption only if it is still the one showing. */
  function clearCaption(id) {
    if (id === captionId) captionEl.hidden = true;
  }

  function showChoices(list, onPick) {
    choicesEl.replaceChildren(...list.map((option, i) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      if (i === 0) button.className = 'primary';
      button.addEventListener('click', () => onPick?.(option.value));
      return button;
    }));
    choicesEl.hidden = false;
  }

  function hideChoices() {
    choicesEl.hidden = true;
    choicesEl.replaceChildren();
  }

  /** Show the options and resolve with the value the player taps. */
  function choose(list) {
    return new Promise(resolve => {
      showChoices(list, value => {
        hideChoices();
        resolve(value);
      });
    });
  }

  function setFade(level) {
    fadeLevel = Math.min(1, Math.max(0, level));
    fadeEl.style.opacity = String(fadeLevel);
  }

  return {
    caption,
    clearCaption,
    choose,
    showChoices,
    hideChoices,
    setFade,
    tray,
    get fadeLevel() { return fadeLevel; },
    reset() {
      caption(null);
      hideChoices();
      tray.hide();
    },
  };
}
