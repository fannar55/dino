// The page's own small effects for "Saman getum við það!" (the juice pass of 2026-11-07, package B): code-made shapes only, moved by
// transform and opacity through the Web Animations API, each removing itself when it is done. Litla Yatzy's juice (engine/yatzy-junior/
// juice.js) does the pops and the bubble; these are the three it has no form for:
//   burst(element, { count })          gold stars thrown out all round an element (the chip at the top: Yatzy's sparkle only goes up)
//   flyStar(from, element, onLand)     one gold star flying from a point of the page (px) to an element, on an arc; onLand when it is there
//   confetti(box, { count })           paper confetti falling over the last picture (Eitt's .eitt-confetti, as DOM: minnisspil.css .memory-confetti)
//   squeeze(element)                   a light squeeze of a bubble whose words changed (Mosi's)
//   cancel()                           removes all of it at once (a restart)
// Under less motion (`reduced()`) nothing flies or falls: a star lands at once, a burst is a short fade where it is, there is no confetti
// and no squeeze.

// (a fat five-pointed star, so that it reads at 18 px over the white chip as well as over the world; a gold gradient, as the clip cuts any glow)
const STAR = 'polygon(50% 0%,63% 33%,98% 36%,71% 58%,80% 93%,50% 74%,20% 93%,29% 58%,2% 36%,37% 33%)';

export function createHudFx({ reduced = () => false, doc = globalThis.document } = {}) {
  const live = new Set();
  let serial = 0;
  const calm = () => Boolean(reduced()) || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const play = (element, frames, options) => { try { return element.animate?.(frames, options) ?? null; } catch { return null; } };
  const add = (element, parent = doc.body) => { parent.append(element); live.add(element); return element; };
  const drop = element => { live.delete(element); element.remove(); };
  const after = (animation, element, then) => {
    if (!animation) { drop(element); then?.(); return; }
    animation.finished.catch(() => {}).then(() => { drop(element); then?.(); });
  };
  const spark = (x, y, size, light) => {
    const star = doc.createElement('i');
    star.className = 'yj-spark'; star.setAttribute('aria-hidden', 'true');
    Object.assign(star.style, { left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`, clipPath: STAR, background: light ? 'radial-gradient(circle at 50% 55%,#fffbe6 0 28%,#ffd75a 62%,#f2a516)' : 'radial-gradient(circle at 50% 55%,#fff1b0 0 22%,#f9c22e 58%,#d98a0c)' });
    return add(star);
  };

  function burst(element, { count = 9, reach = 1 } = {}) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect?.width || !doc?.body) return;
    const still = calm(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    for (let i = 0; i < count; i++) {
      const size = 18 + (i % 3) * 6, star = spark(cx, cy, size, i % 3 === 0);
      const angle = (i / count) * Math.PI * 2 + (i % 2) * .3, travel = (40 + (i % 4) * 12) * reach, dx = Math.cos(angle) * travel, dy = Math.sin(angle) * travel * .8;
      const animation = still
        ? play(star, [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], { duration: 520, fill: 'both' })
        : play(star, [{ opacity: 0, transform: 'translate(0,0) scale(.3)' }, { opacity: 1, transform: `translate(${dx * .4}px,${dy * .4}px) scale(1.15) rotate(40deg)`, offset: .2 },
          { opacity: 1, transform: `translate(${dx * .85}px,${dy * .85}px) scale(1) rotate(110deg)`, offset: .65 }, { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(.5) rotate(150deg)` }], { duration: 620 + (i % 3) * 60, delay: i * 14, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
      after(animation, star);
    }
  }

  function flyStar(from, element, onLand = () => {}) {
    const rect = element?.getBoundingClientRect?.(), token = serial;
    if (!rect?.width || !doc?.body || calm() || !from || !Number.isFinite(from.x) || !Number.isFinite(from.y)) { onLand(); return; }
    const size = 34, tx = rect.left + rect.width / 2, ty = rect.top + rect.height / 2, star = spark(from.x, from.y, size, true);
    star.classList.add('flying-star');
    const dx = tx - from.x, dy = ty - from.y, lift = Math.min(-60, dy * .3);
    const animation = play(star, [
      { opacity: 0, transform: 'translate(0,0) scale(.4) rotate(0deg)' },
      { opacity: 1, transform: `translate(${dx * .08}px,${dy * .08 - 30}px) scale(1.25) rotate(40deg)`, offset: .18 },
      { opacity: 1, transform: `translate(${dx * .5}px,${dy * .5 + lift}px) scale(1) rotate(200deg)`, offset: .6 },
      { opacity: 1, transform: `translate(${dx}px,${dy}px) scale(.6) rotate(360deg)` },
    ], { duration: 820, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'both' });
    after(animation, star, () => { if (token === serial) onLand(); });
  }

  function confetti(box, { count = 44 } = {}) {
    if (!box || calm()) return;
    box.replaceChildren(...Array.from({ length: count }, (_, k) => {
      const bit = doc.createElement('i');
      bit.className = `c${k % 4}`;
      bit.style.setProperty('--x', `${((k * 61.8) % 100).toFixed(1)}%`);
      bit.style.setProperty('--a', `${(k * 67) % 180}deg`);
      bit.style.setProperty('--t', `${(3.2 + (k % 5) * .45).toFixed(2)}s`);
      bit.style.setProperty('--d', `${(-((k * 1.93) % 2.2)).toFixed(2)}s`);
      return bit;
    }));
    box.hidden = false;
  }

  function squeeze(element) {
    if (!element || calm()) return;
    play(element, [{ scale: '1 1' }, { scale: '1.035 .93', offset: .3 }, { scale: '.99 1.025', offset: .65 }, { scale: '1 1' }], { duration: 340, easing: 'ease-out' });
  }

  function cancel() {
    serial++;
    for (const element of [...live]) drop(element);
  }

  return { burst, flyStar, confetti, squeeze, cancel };
}
