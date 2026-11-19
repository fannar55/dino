// The 3D shows' start and end (chapters/fidrildi3d.js, chapters/gramedla3d.js): the glasses picture that starts a show with one tap,
// and the end card with "Aftur" and "Hætta". Shared by every show; moved here from fidrildi3d.js (which still exports endCard).
// And the start of a show with no glasses (chapter 5's music show alone): a play mark, shown only where the show cannot start itself.
import { ICONS } from './icons.js';

const BUTTON = 'font:800 clamp(24px,3.4vw,34px)/1 Nunito,sans-serif;padding:14px 34px;border:0;border-radius:999px;cursor:pointer;pointer-events:auto';
// the end card's second choice (round 6, the owner: "þegar sena endar þá er bara hægt að velja spila aftur, en ekki hætta"): smaller
// and quieter than "Aftur", which stays the first, but as tall (the row stretches both), so it is as easy to hit
const QUIT = 'font:800 clamp(19px,2.5vw,25px)/1 Nunito,sans-serif;padding:14px 26px;border:3px solid #6f8f3a;border-radius:999px;cursor:pointer;pointer-events:auto;background:#fff;color:#4f6a25';
const CARD = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:5;margin:0;padding:14px 22px;border-radius:16px;background:rgba(255,255,255,.92);color:#2b2b2b;font:700 clamp(22px,3vw,30px)/1.3 Nunito,sans-serif;text-align:center;max-width:80vw;display:flex;flex-direction:column;align-items:center;gap:14px';

// The start: a big picture of the red/cyan glasses in the middle, breathing about once a second (gently under less motion); a tap
// on it starts the show, and is the touch that lets the sound begin (main.js chapter.startButton: what Byrja does). The picture is
// Openclipart's "Anaglyph Glasses" (public domain, assets/book/CREDITS.md), shown as it is: red on the wearer's left, never mirrored.
// Should it not load (offline before the app has it), main.js shows the Byrja pill instead, so the show never stands stuck.
const GLASSES = new URL('../../assets/book/gleraugu-3d.svg', import.meta.url).href;
const GLASSES_STYLE = `
  .gler-start-wrap { position: fixed; inset: 0; z-index: 6; display: grid; place-items: center; align-content: center; gap: 2.4vmin; pointer-events: none; }
  .gler-start-wrap[hidden] { display: none; }
  .gler-start { pointer-events: auto; border: 0; padding: 0; margin: 0; background: none; cursor: pointer; border-radius: 6vmin;
    -webkit-tap-highlight-color: transparent; will-change: transform, opacity; animation: gler-pulse 1s ease-in-out infinite; }
  .gler-start img { display: block; width: min(60vmin, 92vw); height: auto; aspect-ratio: 1764 / 1335; -webkit-user-drag: none;
    filter: drop-shadow(0 0 2.4vmin rgba(255, 250, 215, .82)); }
  .gler-start-line { margin: 0; padding: 6px 16px; border-radius: 12px; background: rgba(255,255,255,.88); color: #2b2b2b;
    font: 700 clamp(17px, 2.2vw, 22px)/1.3 Nunito, sans-serif; text-align: center; }
  @keyframes gler-pulse {
    0%, 100% { transform: scale(1); opacity: .94; }
    50% { transform: scale(1.06); opacity: 1; }
  }
  @keyframes gler-pulse-calm {
    0%, 100% { opacity: .88; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) { .gler-start { animation: gler-pulse-calm 2.4s ease-in-out infinite; } }`;

/**
 * The end card: "Aftur" (plays it again) and beside it "Hætta" (engine/book/show-player.js leaveShow: closes the book's frame, or
 * goes to the game's start when the show was opened on its own). Returns { element, again, quit } (the two buttons).
 */
export function endCard(doc, { onAgain, onQuit }) {
  const element = doc.createElement('div');
  element.style.cssText = CARD;
  element.className = 'dans-end';
  const row = doc.createElement('div');
  row.style.cssText = 'display:flex;flex-direction:row;align-items:stretch;justify-content:center;gap:18px;flex-wrap:wrap';
  const again = doc.createElement('button');
  again.type = 'button';
  again.textContent = 'Aftur';
  again.style.cssText = BUTTON + ';background:#6f8f3a;color:#fff';
  again.addEventListener('click', () => onAgain());
  const quit = doc.createElement('button');
  quit.type = 'button';
  quit.textContent = 'Hætta';
  quit.style.cssText = QUIT;
  quit.addEventListener('click', () => onQuit());
  row.append(again, quit);
  element.append(row);
  return { element, again, quit };
}

// A show with no glasses (chapters/kafli5.js `show`, "Djamm skógarins") starts as a video does, by itself (main.js
// chapter.startsItself); where the browser wants a touch in the show's own page before it lets sound begin, this stands in the
// middle instead: the book's play mark (icons.js, as on a video's tile), round and gold, breathing as the glasses do. No words.
const PLAY_STYLE = `
  .syning-start-wrap { position: fixed; inset: 0; z-index: 6; display: grid; place-items: center; pointer-events: none; }
  .syning-start-wrap[hidden] { display: none; }
  .syning-start { pointer-events: auto; cursor: pointer; margin: 0; padding: 0; width: min(34vmin, 220px); height: min(34vmin, 220px);
    display: grid; place-items: center; border-radius: 50%; border: 5px solid #3b2f25; color: #3b2f25;
    background: radial-gradient(circle at 36% 28%, rgba(255,255,255,.65), transparent 48%), #f2b630;
    box-shadow: 0 7px 0 #b88418, 0 7px 0 5px #3b2f25, 0 14px 26px rgba(24,15,6,.45);
    -webkit-tap-highlight-color: transparent; will-change: transform, opacity; animation: gler-pulse 1s ease-in-out infinite; }
  .syning-start svg { width: 54%; height: 54%; margin-left: 5%; fill: currentColor; stroke: currentColor; stroke-width: 3; stroke-linejoin: round; }
  @keyframes gler-pulse {
    0%, 100% { transform: scale(1); opacity: .94; }
    50% { transform: scale(1.06); opacity: 1; }
  }
  @keyframes gler-pulse-calm {
    0%, 100% { opacity: .88; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) { .syning-start { animation: gler-pulse-calm 2.4s ease-in-out infinite; } }`;

/** The play start (a show's chapter.startButton), laid on the page hidden: { element, button }, as the glasses start gives. */
export function playStart(doc) {
  const wrap = doc.createElement('div');
  wrap.className = 'syning-start-wrap';
  wrap.hidden = true;
  const style = doc.createElement('style');
  style.textContent = PLAY_STYLE;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'syning-start';
  button.setAttribute('aria-label', 'Spila');
  button.innerHTML = ICONS.play;
  wrap.append(style, button);
  doc.body.append(wrap);
  return { element: wrap, button };
}

/** The glasses start (a show's chapter.startButton), laid on the page hidden, once its picture has loaded; null (main.js: Byrja) when it cannot be. */
export function glassesStart(doc) {
  return new Promise(resolve => {
    const wrap = doc.createElement('div');
    wrap.className = 'gler-start-wrap';
    wrap.hidden = true;
    const style = doc.createElement('style');
    style.textContent = GLASSES_STYLE;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'gler-start';
    const img = doc.createElement('img');
    img.alt = 'Settu upp 3D gleraugun og ýttu hér';
    img.draggable = false;
    button.append(img);
    const line = doc.createElement('p');
    line.className = 'gler-start-line';
    line.textContent = 'Rauða glerið á vinstra auga.';
    wrap.append(style, button, line);
    img.addEventListener('load', () => {
      doc.body.append(wrap);
      resolve({ element: wrap, button });
    }, { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
    img.src = GLASSES;
  });
}
