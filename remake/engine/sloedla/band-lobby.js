// The QR card on the stage of Slóeðla's song game, "Spilum saman" (spec §2 steps 3 and 6): the lobby Fjölspil's host session
// is given (createFjolspil's `lobby:` option) in place of the book's lobby card. It draws only a light card in #saman: the QR
// code a phone scans (the phone page with the room's code, `spil.html?r=GULL`), the four letters under it, "Skannaðu til að
// spila með", and "Keyrðu þjóninn með --lan" when phones cannot reach the page. The seats are shown by the stage itself (the
// name tags under the dinosaurs), so refresh() only tells the band host (fjolspil-song.js, through onRefresh) that they
// changed. The song game has no turns: waitFor and hideWaiting do nothing. start() ("Spila!") and close() ("Spila einn") hide
// the card and call onStart / onClose, as the book's lobby does at "Byrjum!" and its X.

import { qrSvg } from '../fjolspil/qr.js';

/**
 * The card in `root` (#saman). Takes the options createFjolspil gives every lobby (`seats`, `win`, `audio`, `timers`, the
 * callbacks; only onStart and onClose are used). Returns { show, refresh, hide, isOpen, waitFor, hideWaiting, needsNet, start,
 * close, onRefresh }.
 */
export function createBandLobby(doc, { root = doc.getElementById('saman'), onStart = null, onClose = null } = {}) {
  if (!root) throw new Error('"Spilum saman" needs #saman on the page (see sloedla-lab.html)');
  const make = (tag, className, text = '') => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const card = make('div', 'sl-saman-card');
  const qr = make('div', 'sl-saman-qr');
  const need = make('p', 'sl-saman-needs-net', 'Fjölspil þarf net'); // in the QR code's place while the room was never reached
  need.hidden = true;
  const letters = make('div', 'sl-saman-code');
  const ask = make('p', 'sl-saman-ask', 'Skannaðu til að spila með');
  const lan = make('p', 'sl-saman-lan', 'Keyrðu þjóninn með --lan');
  lan.hidden = true;
  card.append(qr, need, letters, ask, lan);
  root.replaceChildren(card);
  root.hidden = true;

  let open = false;
  const listeners = new Set();

  function hide() {
    open = false;
    root.hidden = true;
  }

  return {
    /** The card with the room's code, on the stage. */
    show({ joinUrl, code, lanMissing = false }) {
      qr.innerHTML = qrSvg(`${joinUrl}?r=${code}`);
      letters.setAttribute('aria-label', `Kóðinn ${code}`);
      letters.replaceChildren(...[...String(code ?? '')].map(letter => make('span', 'sl-saman-letter', letter)));
      lan.hidden = !lanMissing;
      open = true;
      root.hidden = false;
    },
    /** The seats changed (Fjölspil's host calls this): the band host hears it. */
    refresh() {
      for (const fn of [...listeners]) fn();
    },
    hide,
    get isOpen() { return open; },
    waitFor() {},
    hideWaiting() {},
    /** With `on`, "Fjölspil þarf net" stands in the place of the QR code and the letters (Fjölspil's host calls this). */
    needsNet(on) {
      qr.hidden = Boolean(on);
      letters.hidden = Boolean(on);
      need.hidden = !on;
    },
    /** "Spila!": the card leaves, the room's lobby ends with the seats. */
    start() {
      hide();
      onStart?.();
    },
    /** "Spila einn": the card leaves, the room's lobby ends with none. */
    close() {
      hide();
      onClose?.();
    },
    /** fn() each time the seats change; returns the unsubscribe. */
    onRefresh(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
