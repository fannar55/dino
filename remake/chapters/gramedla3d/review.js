// Grameðla kemur!'s review pages' controls (chapters/gramedla3d.js): big round buttons in the bottom corners (‹ and ›), arrows on
// the keyboard, and a small label in the top left. The calibration (kvordun=1) has a third button in the top right and up and down
// for the strength; the key frames (lykill=N) have none. Pale and quiet, so they are not much in the picture.

export function reviewUi(doc, { step, strength = null }) {
  const element = doc.createElement('div');
  element.className = 'kvordun';
  element.innerHTML = `
    <style>
      .kvordun button { position: fixed; z-index: 30; width: 84px; height: 84px; border-radius: 50%; border: 2px solid rgba(255,255,240,.55);
        background: rgba(40,44,30,.35); color: rgba(255,255,240,.85); font: 600 34px/1 system-ui, sans-serif; touch-action: manipulation; }
      .kvordun .prev { left: 18px; bottom: 18px; } .kvordun .next { right: 18px; bottom: 18px; }
      .kvordun .str { right: 18px; top: 18px; width: 72px; height: 72px; font-size: 17px; }
      .kvordun .label { position: fixed; z-index: 30; left: 14px; top: 12px; padding: 4px 9px; border-radius: 6px; background: rgba(30,32,24,.45);
        color: rgba(255,255,240,.9); font: 500 15px/1.3 system-ui, sans-serif; pointer-events: none; }
    </style>
    <div class="label"></div>
    <button class="prev" aria-label="Fyrri">‹</button>
    <button class="next" aria-label="Næsti">›</button>
    ${strength ? '<button class="str" aria-label="Styrkur">styrkur</button>' : ''}`;
  const label = element.querySelector('.label');
  element.querySelector('.prev').addEventListener('click', () => step(-1));
  element.querySelector('.next').addEventListener('click', () => step(1));
  element.querySelector('.str')?.addEventListener('click', () => strength());
  doc.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (strength && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) strength();
    else return;
    e.preventDefault();
  });
  return { element, label };
}

/** A share of the screen's width as the label writes it: one decimal, a comma. */
export const pct = x => `${(Math.round(x * 10) / 10).toFixed(1).replace('.', ',')} %`;
