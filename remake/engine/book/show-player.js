import { pressable } from './fx.js';
import { ICONS } from './icons.js';

// The book's show player: a "3D myndbönd" show (videos.js BOOK_3D) is a chapter of its own (chapters/fidrildi3d.js), so it plays
// in a full-screen frame of this same page at ?chapter=<the show's chapter>&syning=1 (main.js: only the show, no book button, no
// first-run line), laid over the open book as the video player is. The child's place is kept: the chapter behind stands still
// under the book (main.js holds the clock while the child has the book open, and draws nothing while a show is open), and the
// close button, top right as the video player's, or Escape (in the frame too: main.js passes it up), takes the frame away, its
// drawing and its sound with it, and the Myndbönd page is there again.

export const SHOW_CLOSE = 'mosi-syning-loka'; // the message the frame sends up for Escape (main.js)

/** The address of a show's frame: this page with only the show's chapter, syning=1, and the quality and debug it has. */
export function showAddress(entry, search = '') {
  const params = new URLSearchParams(search);
  const next = new URLSearchParams();
  next.set('chapter', entry.chapter);
  next.set('syning', '1');
  for (const key of ['quality', 'debug']) if (params.get(key)) next.set(key, params.get(key));
  return `?${next}`;
}

export function createShowPlayer(doc, root, { audio = null, win = globalThis.window, onOpen = null, onClose = null } = {}) {
  const player = doc.createElement('section');
  player.className = 'show-player';
  player.setAttribute('role', 'dialog');
  player.setAttribute('aria-modal', 'true');
  player.hidden = true;
  const closeButton = doc.createElement('button');
  closeButton.className = 'video-close show-close chunky';
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('aria-label', 'Loka myndbandi');
  closeButton.innerHTML = ICONS.close;
  player.append(closeButton);
  root.append(player);

  let current = null;
  let frame = null;

  function open(entry) {
    if (!entry?.chapter) return false;
    close();
    audio?.stop?.(); // the book's narrator is quiet while the show plays
    current = entry;
    frame = doc.createElement('iframe');
    frame.className = 'show-frame';
    frame.setAttribute('title', entry.title ?? entry.name ?? 'Myndband');
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.src = showAddress(entry, win?.location?.search ?? '');
    player.insertBefore(frame, closeButton);
    player.hidden = false;
    onOpen?.(entry);
    try { frame.focus?.(); } catch {}
    return true;
  }

  function close() {
    if (!current) return false;
    const shut = current;
    current = null;
    frame?.remove(); // its WebGL, its sound and its clock go with it
    frame = null;
    player.hidden = true;
    onClose?.(shut);
    return true;
  }

  pressable(closeButton, { audio, win, onTap: () => close() });
  win?.addEventListener?.('keydown', event => { if (current && event.key === 'Escape') close(); });
  win?.addEventListener?.('message', event => {
    if (!current || event.data !== SHOW_CLOSE) return;
    if (frame && event.source !== frame.contentWindow) return;
    close();
  });

  return {
    open,
    close,
    get show() { return current; },
    get isOpen() { return current !== null; },
    get frame() { return frame; },
  };
}
