// The table pages' controls (chapters/bord3d.js, chapters/tjorn3d.js), after Grameðla kemur!'s review pages (gramedla3d/review.js):
// big round buttons in the bottom corners (‹ and ›, and the arrow keys) step through the page's steps, two small ones in the top
// right change the screen's size, a small label in the top left says the real numbers, and a line in the middle of the bottom edge
// says where to sit. Pale and quiet, and all of it on the screen's own plane: ordinary page elements, the same for both eyes.

export function tableUi(doc, { step, screen, prev = 'Fyrra', next = 'Næsta' }) {
  const element = doc.createElement('div');
  element.className = 'bord';
  element.innerHTML = `
    <style>
      .bord button { position: fixed; z-index: 30; border: 2px solid rgba(255,255,240,.55); background: rgba(40,44,30,.35);
        color: rgba(255,255,240,.85); font: 600 34px/1 system-ui, sans-serif; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
      .bord .prev, .bord .next { width: 84px; height: 84px; border-radius: 50%; bottom: 18px; }
      .bord .prev { left: 18px; } .bord .next { right: 18px; }
      .bord .less, .bord .more { top: 14px; height: 44px; padding: 0 14px; border-radius: 22px; font-size: 16px; white-space: nowrap; }
      .bord .more { right: 14px; } .bord .less { right: 112px; }
      .bord .label, .bord .seat { position: fixed; z-index: 30; padding: 4px 9px; border-radius: 6px; background: rgba(30,32,24,.45);
        color: rgba(255,255,240,.9); font: 500 15px/1.3 system-ui, sans-serif; pointer-events: none; }
      .bord .label { left: 14px; top: 12px; max-width: calc(100vw - 260px); }
      .bord .seat { left: 50%; bottom: 8px; transform: translateX(-50%); white-space: nowrap; }
      /* the page is the table: no book button on it, and the glasses' own settings button (an address with gler=) clear of ‹ */
      #journal-button { display: none !important; }
      .gler-button { bottom: 116px !important; } .gler-panel { bottom: 164px !important; }
      .bord-mono .gler-button, .bord-mono .gler-panel { display: none !important; }
    </style>
    <div class="label"></div>
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
