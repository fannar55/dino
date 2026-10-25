// The bug report tool ("villa" = a bug). F1, three fingers held on the screen, or the ?villa=1 button freezes the game as the
// child's book does (the clock and the sound held, nothing else changes), takes the WebGL frame as it stands, and lays a
// transparent drawing layer over the live screen: the owner drags numbered boxes round what is wrong, writes what it is, and
// saves. The report goes to the dev server (POST /villa, tools/serve.mjs), which files it under qa/villur/<time>-<chapter>/:
// skjaskot.jpg (the frame), merkt.jpg (the frame with the boxes), spjold.html (the HTML layers that lay over the canvas, to
// open over the frame) and skyrsla.json (the owner's text and boxes with everything the game knows: engine/villa/skyrsla.js).
// The pictures travel as JPEG no wider than PICTURE_MAX, so a report is a few hundred kilobytes, not several megabytes of PNG.
// The tool first asks GET /villa whether the dev server is there (it answers 204 with X-Villa in a moment; the game on Cloudflare
// has no such thing) and only then sends; where there is none the browser downloads the same at once, as mosi-villa-<time>.json.
//
//   createVilla(document, { context, shoot, onPause, button })
//     context()  -> the thunks skyrsla.js buildReport reads (main.js hands the game's parts)
//     shoot()    -> the canvas's PNG data URL at this moment (main.js draws a frame first when the chapter may draw)
//     onPause(p) -> hold the game (true) and let it go (false), as the book's onPause does
//     button     -> show the small "Villa" button (the ?villa=1 address)
import { buildReport, normalizeBox, boxToImage, snapshotHtml, fileStamp } from './skyrsla.js';

const MIN_BOX = 6; // CSS px: a smaller drag is a tap, not a box
const HOLD_MS = 700; // three fingers held this long open the tool
const SAVE_TIMEOUT = 20000;
const PROBE_TIMEOUT = 3000; // ms to learn whether a dev server is there at all
const PICTURE_MAX = 1600; // px, the longest side of the saved pictures: a 4K frame would be 10 MB as PNG, this is a few hundred KB
const PICTURE_QUALITY = 0.85;
const CLOSE_AFTER = 2500; // ms the "Vistað" line shows before the tool closes

export function createVilla(doc, { context, shoot, onPause, button = false, win = globalThis, fetchFn = (...args) => fetch(...args) }) {
  const root = doc.getElementById('villa');
  if (!root) throw new Error('index.html needs <div id="villa" class="villa" hidden>');
  let isOpen = false;
  let shot = null; // { url, width, height, mayBeBlank }
  let boxes = []; // { x, y, w, h } in CSS px of the view
  let drag = null;
  let draw = null, panel = null, textEl = null, statusEl = null;
  let holdTimer = null;
  let saving = false;

  if (button) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'villa-button';
    b.textContent = 'Villa';
    b.title = 'Villutilkynning (F1)';
    b.addEventListener('click', () => (isOpen ? cancel() : open()));
    doc.body.appendChild(b);
  }

  // F1 opens (and the browser's own help stays shut); Escape shuts without saving. While the tool is open no other part of the
  // page sees these keys. Letters typed in the text box are the text box's.
  doc.addEventListener('keydown', event => {
    if (event.key === 'F1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!isOpen) open(); else if (!saving) cancel();
    } else if (isOpen && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!saving) cancel();
    } else if (isOpen && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    }
  }, true);
  // Three fingers held on the screen, where a tablet has no F1 (a pinch has two, a tap one).
  const clearHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
  doc.addEventListener('touchstart', event => {
    if (isOpen) return;
    clearHold();
    if (event.touches.length === 3) holdTimer = setTimeout(() => { holdTimer = null; open(); }, HOLD_MS);
  }, { passive: true, capture: true });
  for (const type of ['touchend', 'touchcancel', 'touchmove']) doc.addEventListener(type, clearHold, { passive: true, capture: true });

  function open() {
    if (isOpen) return;
    isOpen = true;
    boxes = [];
    drag = null;
    saving = false;
    try {
      const url = shoot();
      shot = url ? { url, width: 0, height: 0, mayBeBlank: false } : null;
    } catch (error) {
      console.warn('[villa] no screenshot:', error);
      shot = null;
    }
    onPause?.(true);
    build();
    root.hidden = false;
    paint();
    textEl.focus({ preventScroll: true });
  }

  function cancel() { close(); }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.hidden = true;
    root.replaceChildren();
    draw = panel = textEl = statusEl = null;
    onPause?.(false);
  }

  function build() {
    root.replaceChildren();
    draw = doc.createElement('canvas');
    draw.className = 'villa-draw';
    panel = doc.createElement('div');
    panel.className = 'villa-panel';
    const hint = doc.createElement('div');
    hint.className = 'villa-hint';
    hint.textContent = 'Dragðu kassa yfir það sem er að (þeir fá númer) og skrifaðu hvað er að. Vista: hnappurinn eða Ctrl+Enter. Hætta við: Esc.';
    textEl = doc.createElement('textarea');
    textEl.className = 'villa-text';
    textEl.placeholder = 'Hvað er að? (1: …, 2: …)';
    textEl.rows = 3;
    const buttons = doc.createElement('div');
    buttons.className = 'villa-buttons';
    const undo = doc.createElement('button'); undo.type = 'button'; undo.className = 'villa-undo'; undo.textContent = 'Afturkalla kassa';
    const cancelB = doc.createElement('button'); cancelB.type = 'button'; cancelB.className = 'villa-cancel'; cancelB.textContent = 'Hætta við';
    const saveB = doc.createElement('button'); saveB.type = 'button'; saveB.className = 'villa-save'; saveB.textContent = 'Vista';
    undo.addEventListener('click', () => { boxes.pop(); paint(); });
    cancelB.addEventListener('click', cancel);
    saveB.addEventListener('click', save);
    buttons.append(undo, cancelB, saveB);
    statusEl = doc.createElement('div');
    statusEl.className = 'villa-status';
    statusEl.hidden = true;
    panel.append(hint, textEl, buttons, statusEl);
    root.append(draw, panel);

    draw.addEventListener('pointerdown', event => {
      if (saving) return;
      draw.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, from: { x: event.clientX, y: event.clientY }, to: { x: event.clientX, y: event.clientY } };
      paint();
    });
    draw.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      drag.to = { x: event.clientX, y: event.clientY };
      paint();
    });
    const finish = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const box = normalizeBox(drag.from, { x: event.clientX, y: event.clientY });
      drag = null;
      // A box remembers the view it was drawn in: a window that changes size before the report is saved moves it with the picture.
      if (box.w >= MIN_BOX && box.h >= MIN_BOX) boxes.push({ ...box, view: { width: win.innerWidth, height: win.innerHeight } });
      paint();
    };
    draw.addEventListener('pointerup', finish);
    draw.addEventListener('pointercancel', () => { drag = null; paint(); });
    draw.addEventListener('lostpointercapture', () => { if (drag) { drag = null; paint(); } });
  }

  /** The drawing layer: the boxes so far, numbered, and the drag under way. */
  function paint() {
    if (!draw) return;
    const width = win.innerWidth, height = win.innerHeight, dpr = win.devicePixelRatio || 1;
    if (draw.width !== Math.round(width * dpr) || draw.height !== Math.round(height * dpr)) {
      draw.width = Math.round(width * dpr);
      draw.height = Math.round(height * dpr);
    }
    const g = draw.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    boxes.forEach((box, i) => paintBox(g, boxToImage(box, box.view, { width, height }), i + 1, 1));
    if (drag) paintBox(g, normalizeBox(drag.from, drag.to), boxes.length + 1, 1, true);
  }

  function paintBox(g, box, number, scale, pending = false) {
    const line = 3 * scale;
    g.save();
    g.lineWidth = line;
    g.strokeStyle = pending ? 'rgba(224, 122, 63, .7)' : '#e07a3f';
    g.fillStyle = pending ? 'rgba(224, 122, 63, .08)' : 'rgba(224, 122, 63, .14)';
    if (pending) g.setLineDash([6 * scale, 4 * scale]);
    g.fillRect(box.x, box.y, box.w, box.h);
    g.strokeRect(box.x, box.y, box.w, box.h);
    if (!pending) {
      const r = 14 * scale;
      g.setLineDash([]);
      g.fillStyle = '#e07a3f';
      g.beginPath();
      g.arc(box.x, box.y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `700 ${Math.round(15 * scale)}px Nunito, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(number), box.x, box.y + 1 * scale);
    }
    g.restore();
  }

  /**
   * The frame and the frame with the boxes drawn in, as JPEG data URLs no wider or taller than PICTURE_MAX ({ raw, marked }, both
   * null without a frame). The boxes keep their place: they are scaled from the view they were drawn in to the saved picture.
   */
  async function pictures() {
    if (!shot) return { raw: null, marked: null };
    const image = await loadImage(shot.url);
    shot.width = image.naturalWidth || image.width;
    shot.height = image.naturalHeight || image.height;
    const k = Math.min(1, PICTURE_MAX / Math.max(shot.width, shot.height));
    const size = { width: Math.round(shot.width * k), height: Math.round(shot.height * k) };
    const canvas = doc.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const g = canvas.getContext('2d');
    g.drawImage(image, 0, 0, size.width, size.height);
    const raw = canvas.toDataURL('image/jpeg', PICTURE_QUALITY);
    const scale = Math.max(1, size.width / win.innerWidth);
    boxes.forEach((box, i) => paintBox(g, boxToImage(box, box.view, size), i + 1, scale));
    shot.saved = size;
    return { raw, marked: canvas.toDataURL('image/jpeg', PICTURE_QUALITY) };
  }

  /** Whether the dev server (tools/serve.mjs) is behind this page: it answers GET /villa with 204 and X-Villa at once. */
  async function devServer() {
    try {
      const response = await fetchFn('/villa', { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT) });
      return response.status === 204 && response.headers.get('x-villa') === '1';
    } catch {
      return false;
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new win.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('the screenshot could not be read back'));
      image.src = url;
    });
  }

  /** The HTML layers over the canvas as they stand: every visible child of the body but the canvas, the scripts and this tool. */
  function layersHtml() {
    const parts = [];
    for (const el of doc.body.children) {
      if (el === root || el.tagName === 'CANVAS' || el.tagName === 'SCRIPT' || el.classList.contains('villa-button')) continue;
      if (el.hidden) continue;
      const style = win.getComputedStyle?.(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;
      parts.push(el.outerHTML);
    }
    const styles = [...doc.querySelectorAll('link[rel="stylesheet"]')].map(link => {
      try { return new URL(link.href, doc.baseURI).pathname; } catch { return link.getAttribute('href'); }
    });
    return snapshotHtml({
      title: `Villutilkynning ${fileStamp(new Date())}`,
      width: win.innerWidth, height: win.innerHeight, styles, bodyClass: doc.body.className, parts, screenshot: 'skjaskot.jpg',
      note: `Lögin sem lágu yfir striganum þegar skýrslan var gerð; ${parts.length} sýnileg. Opnist af þróunarþjóninum, sem finnur stílblöðin.`,
    });
  }

  async function save() {
    if (!isOpen || saving) return;
    saving = true;
    status('Vista…');
    try {
      const { raw, marked } = await pictures();
      const ctx = { ...context(), text: textEl.value.trim(), boxes: boxes.map(box => ({ ...box })) };
      ctx.href = win.location?.href ?? null;
      ctx.window = { width: win.innerWidth, height: win.innerHeight, dpr: win.devicePixelRatio || 1 };
      ctx.screen = win.screen ? { width: win.screen.width, height: win.screen.height } : null;
      ctx.navigator = win.navigator ? { userAgent: win.navigator.userAgent, platform: win.navigator.platform, language: win.navigator.language, touchPoints: win.navigator.maxTouchPoints } : null;
      ctx.screenshot = shot ? { width: shot.width, height: shot.height, saved: shot.saved, mayBeBlank: shot.mayBeBlank } : null;
      const report = buildReport(ctx);
      const files = { 'spjold.html': layersHtml() };
      if (shot) { files['skjaskot.jpg'] = raw; files['merkt.jpg'] = marked; }
      const body = JSON.stringify({ report, files });
      let folder = null;
      if (await devServer()) {
        try {
          const response = await fetchFn('/villa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(SAVE_TIMEOUT) });
          if (response.ok) folder = (await response.json()).folder;
          else console.warn('[villa] the server said', response.status, await response.text().catch(() => ''));
        } catch (error) {
          console.warn('[villa] the dev server did not take the report:', error?.message ?? error);
        }
      } else {
        console.info('[villa] no dev server behind this page: the report downloads');
      }
      if (folder) {
        status(`Vistað: ${folder}`);
      } else {
        const name = `mosi-villa-${fileStamp(new Date())}.json`;
        download(name, body);
        status(`Enginn þjónn svaraði: vafrinn hleður skýrslunni niður sem ${name}.`);
      }
      setTimeout(close, CLOSE_AFTER);
    } catch (error) {
      console.error('[villa] the report failed:', error);
      status(`Tókst ekki: ${error?.message ?? error}`);
      saving = false;
    }
  }

  function download(name, text) {
    const a = doc.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function status(text) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = text;
  }

  return { open, close, get isOpen() { return isOpen; } };
}
