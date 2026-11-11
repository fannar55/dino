// "Litla Yatzy við Mosa" in the book: the junior dice game is a page of its own (remake/yatzy-junior.html, with its own canvas,
// sound and loading screen), so the Leikir page opens it over the book in a frame, the way the other games open over it, and the
// chapter is held meanwhile. The frame is made fresh on every open and removed on close, so the page starts clean each time and
// its WebGL context and sound go with it. Over the frame sits the book's round close, "X", back to the book; the page shifts its
// own buttons out from under it when it is told it is in the book (?inbook=1). The page may also ask to close by posting
// { type: 'yatzy-junior:close' } to its parent.
//
//   createJuniorFrame(doc, { onPause, onClose, src, label, closeType }) returns { open(), close(), isOpen }
//     onPause(paused)  holds the chapter while the frame is open, and lets it go after
//     onClose()        after the frame is gone (the book refreshes)
//     label            the dialog's aria-label and the iframe's title (Litla Yatzy við Mosa by default); the memory game, Saman getum við
//                      það!, opens through this frame too, with its own page and label
//     closeType        the message type with which the page asks to close ('yatzy-junior:close' by default)
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>';

export function createJuniorFrame(doc, { onPause = null, onClose = null, src = './yatzy-junior.html?inbook=1', label = 'Litla Yatzy við Mosa', closeType = 'yatzy-junior:close', win = doc.defaultView } = {}) {
  let root = null;
  let frame = null;

  function onMessage(event) {
    if (event.origin !== win.location.origin || event.source !== frame?.contentWindow) return;
    if (event.data?.type === closeType) close();
  }
  function onKey(event) {
    if (event.key === 'Escape' && doc.getElementById('villa')?.hidden !== false) close();
  }
  function onFrameLoad() {
    const subWin = frame?.contentWindow;
    const subDoc = frame?.contentDocument;
    if (!subWin || !subDoc) return;
    subWin.addEventListener?.('help', event => { event.preventDefault(); }, true);
    subDoc.addEventListener('keydown', event => {
      const f1 = event.key === 'F1' || event.code === 'F1' || event.keyCode === 112;
      const villaOpen = doc.getElementById('villa')?.hidden === false;
      if (f1 || (villaOpen && event.key === 'Escape')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: event.key === 'Escape' ? 'Escape' : 'F1', code: event.code || 'F1', bubbles: true, cancelable: true }));
      }
    }, true);
  }
  function shoot() {
    if (!root) return null;
    const c = frame?.contentDocument?.querySelector('canvas');
    if (!c) return null;
    c.__drawNow?.();
    return c.toDataURL('image/png');
  }

  function open({ tutorial = false } = {}) {
    if (root) return;
    root = doc.createElement('div');
    root.className = 'junior-frame';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', label);
    frame = doc.createElement('iframe');
    frame.className = 'junior-frame-page';
    frame.src = tutorial ? `${src}${src.includes('?') ? '&' : '?'}play=1&tutorial=1` : src;
    frame.title = label;
    frame.setAttribute('allow', 'autoplay; screen-wake-lock');
    frame.addEventListener('load', onFrameLoad);
    const closeEl = doc.createElement('button');
    closeEl.type = 'button';
    closeEl.className = 'junior-close';
    closeEl.setAttribute('aria-label', 'Aftur í bókina');
    closeEl.innerHTML = CROSS;
    closeEl.addEventListener('click', close);
    root.append(frame, closeEl);
    doc.body.append(root);
    win.addEventListener('message', onMessage);
    doc.addEventListener('keydown', onKey);
    onPause?.(true);
    closeEl.focus?.({ preventScroll: true });
  }

  function close() {
    if (!root) return;
    win.removeEventListener('message', onMessage);
    doc.removeEventListener('keydown', onKey);
    root.remove(); // the page unloads with it: its sound stops and its WebGL context is freed
    root = null;
    frame = null;
    onPause?.(false);
    onClose?.();
  }

  return { open, close, shoot, get isOpen() { return root !== null; } };
}
