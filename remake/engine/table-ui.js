// The table pages' controls (chapters/bord3d.js, chapters/tjorn3d.js), after Grameðla kemur!'s review pages (gramedla3d/review.js):
// big round buttons in the bottom corners (‹ and ›, and the arrow keys) step through the page's steps, two small ones in the top
// right change the screen's size, a small label in the top left says the real numbers, and a line in the middle of the bottom edge
// says where to sit. Pale and quiet, and all of it on the screen's own plane: ordinary page elements, the same for both eyes.

/**
 * The whole screen for the table. A table page's size is its window's (engine/table-stage.js tablePage), and a browser's bars take
 * a centimetre or two off its depth, which is where the tallest things lie: on a 10,5 inch screen with 128 px of bars the page is
 * 11,9 cm deep and not 14,1, and a 6,5 cm head no longer fits (tools/tjorn3d-probe.mjs --sizes 1280x672 --query skjar=10.057).
 * So the page asks for the whole screen, which a browser gives only from a tap. Resolves to whether it asked; never throws.
 */
export function wholeScreen(doc) {
  const root = doc?.documentElement;
  const ask = root?.requestFullscreen ?? root?.webkitRequestFullscreen;
  if (!ask || isWholeScreen(doc)) return Promise.resolve(false);
  try {
    return Promise.resolve(ask.call(root, { navigationUI: 'hide' })).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}
/**
 * The page has the whole screen: something of it fills the screen by asking, or the app is shown without the browser round it
 * (the installed app, manifest.webmanifest display fullscreen; the browser's own whole-screen key; a book round a show's frame that
 * has it). Then nothing is asked for, and so nothing is taken that would have to be given back.
 */
export const isWholeScreen = doc => Boolean(doc?.fullscreenElement ?? doc?.webkitFullscreenElement) || shownWhole(doc);
const shownWhole = doc => {
  try { return Boolean(doc?.defaultView?.matchMedia?.('(display-mode: fullscreen)')?.matches); } catch { return false; }
};
/**
 * Gives the whole screen back when it is this page's own taking (wholeScreen above was given it: the page's own root is what
 * fills the screen). A show that is left for the book must leave the page as the book had it: a whole screen the show did not
 * take (the app's, the browser's, the book's) is not this page's root, and is left alone. Resolves to whether it gave it back;
 * never throws.
 */
export function giveBackScreen(doc) {
  const mine = doc?.fullscreenElement ?? doc?.webkitFullscreenElement;
  const leave = doc?.exitFullscreen ?? doc?.webkitExitFullscreen;
  if (!mine || mine !== doc.documentElement || !leave) return Promise.resolve(false);
  try {
    return Promise.resolve(leave.call(doc)).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}
const canWholeScreen = doc => Boolean(doc?.documentElement?.requestFullscreen ?? doc?.documentElement?.webkitRequestFullscreen);

/**
 * A table page's start (chapter.startButton): the start it is given (the glasses, engine/book/show-cards.js glassesStart; null when
 * their picture did not load, and main.js shows Byrja), whose tap also asks for the whole screen.
 */
export async function tableStart(doc, start) {
  const own = await start;
  const button = own?.button ?? doc.getElementById?.('start');
  button?.addEventListener('click', () => { wholeScreen(doc); }, { once: true });
  return own;
}

export function tableUi(doc, { step, screen, prev = 'Fyrra', next = 'Næsta' }) {
  const element = doc.createElement('div');
  element.className = 'bord';
  element.innerHTML = `
    <style>
      .bord button { position: fixed; z-index: 30; border: 2px solid rgba(255,255,240,.55); background: rgba(40,44,30,.35);
        color: rgba(255,255,240,.85); font: 600 34px/1 system-ui, sans-serif; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
      .bord .prev, .bord .next { width: 84px; height: 84px; border-radius: 50%; bottom: 18px; }
      .bord .prev { left: 18px; } .bord .next { right: 18px; }
      .bord .less, .bord .more, .bord .whole { top: 14px; height: 44px; padding: 0 14px; border-radius: 22px; font-size: 16px; white-space: nowrap; }
      .bord .more { right: 14px; } .bord .less { right: 112px; } .bord .whole { right: 210px; }
      .bord .whole[hidden] { display: none; }
      .bord .label, .bord .seat { position: fixed; z-index: 30; padding: 4px 9px; border-radius: 6px; background: rgba(30,32,24,.45);
        color: rgba(255,255,240,.9); font: 500 15px/1.3 system-ui, sans-serif; pointer-events: none; }
      .bord .label { left: 14px; top: 12px; max-width: calc(100vw - 370px); }
      .bord .seat { left: 50%; bottom: 8px; transform: translateX(-50%); white-space: nowrap; }
      /* the page is the table: no book button on it, and the glasses' own settings button (an address with gler=) clear of ‹ */
      #journal-button { display: none !important; }
      .gler-button { bottom: 116px !important; } .gler-panel { bottom: 164px !important; }
      .bord-mono .gler-button, .bord-mono .gler-panel { display: none !important; }
    </style>
    <div class="label"></div>
    <button class="whole" type="button" hidden>allur skjár</button>
    <button class="less" type="button" aria-label="Minni skjár">skjár −</button>
    <button class="more" type="button" aria-label="Stærri skjár">skjár +</button>
    <button class="prev" type="button">‹</button>
    <button class="next" type="button">›</button>
    <div class="seat">Sittu við þessa brún.</div>`;
  element.querySelector('.prev').setAttribute('aria-label', prev);
  element.querySelector('.next').setAttribute('aria-label', next);
  const label = element.querySelector('.label');
  const on = (name, fn) => element.querySelector(name).addEventListener('click', fn);
  on('.prev', () => step(-1));
  on('.next', () => step(1));
  on('.less', () => screen(-1));
  on('.more', () => screen(1));
  // "allur skjár" is there only while the page is not the whole screen (he left it, or the start's tap was not given it)
  const whole = element.querySelector('.whole');
  const showWhole = () => { whole.hidden = !canWholeScreen(doc) || isWholeScreen(doc); };
  on('.whole', () => { wholeScreen(doc); });
  for (const type of ['fullscreenchange', 'webkitfullscreenchange']) doc.addEventListener(type, showWhole);
  showWhole();
  // the buttons' touches are not touches in the world
  for (const button of element.querySelectorAll('button')) for (const type of ['pointerdown', 'pointerup']) button.addEventListener(type, e => e.stopPropagation());
  doc.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else return;
    e.preventDefault();
  });
  return { element, label };
}

/** A number as the label writes it: at most one decimal, a comma. */
export const tala = x => String(Math.round(x * 10) / 10).replace('.', ',');
