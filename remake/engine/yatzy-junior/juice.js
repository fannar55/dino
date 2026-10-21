// The DOM motion of "Litla Yatzy við Mosa" (the owner's round of 2026-10-21: more animation for a six-year-old). Everything moves by
// transform and opacity alone (STYLE.md section 10), through the Web Animations API, and every animation cleans up after itself.
// Under less motion (the page's own setting or the tablet's) each move is a fade where it stands, and nothing flies.
//
//   const juice = createJuice({ reduced: () => boolean })
//   juice.sparkle(element, { count, reach })     gold stars bursting up out of an element's top edge, over the felt above it
//   juice.stamp(card, badge)                     a chosen card stamps its score: a squash and a pop, the badge thumped on, sparkles
//   juice.pop(element, amount)                   a quick swell and settle (a chip, a pip)
//   juice.pulse(element)                         one slow swell (the portrait of the player whose turn it now is)
//   juice.wake(card, shine)                      a card that can be chosen now lifts a little and a shine sweeps over it
//   juice.bubble(element)                        Mosi's bubble pops in with a squash
//   juice.countUp(element, from, to, onStep)     a number counting up; returns a promise that settles at the end
//   juice.flyDice(sources, picture, onLand)      dice tiles flying from the dice on the table into a card's picture row
//   juice.cancel()                               stops and removes everything in flight (a new game)

const STAR = 'polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)';
const EASE_OUT = 'cubic-bezier(.22,1,.36,1)';

export function createJuice({ reduced = () => false, doc = globalThis.document } = {}) {
  const live = new Set(); // elements this module added to the page (sparks, flying tiles)
  let serial = 0;
  const calm = () => Boolean(reduced()) || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const play = (element, frames, options) => {
    try { return element?.animate?.(frames, options) ?? null; } catch { return null; }
  };
  const remove = element => { live.delete(element); element.remove(); };
  const finished = animation => animation?.finished?.catch(() => {}) ?? Promise.resolve();

  function sparkle(element, { count = 7, reach = 1, gold = true } = {}) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect?.width || !doc?.body) return;
    const still = calm();
    for (let i = 0; i < count; i++) {
      const spark = doc.createElement('i');
      spark.className = 'yj-spark';
      spark.setAttribute('aria-hidden', 'true');
      const size = 10 + Math.random() * 9, x = rect.left + rect.width * (.18 + .64 * (i + Math.random() * .6) / count), y = rect.top + 4 + Math.random() * 10;
      Object.assign(spark.style, { left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`, clipPath: STAR, background: gold ? (i % 3 ? '#ffe9a0' : '#fff6d0') : '#ffffff' });
      doc.body.append(spark); live.add(spark);
      // Up and a little out over the felt above the element: never down across its neighbours.
      const angle = -Math.PI / 2 + (Math.random() - .5) * 1.5, travel = (34 + Math.random() * 34) * reach;
      const dx = Math.cos(angle) * travel, dy = Math.sin(angle) * travel, delay = i * 28;
      const animation = still
        ? play(spark, [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], { duration: 650, delay, fill: 'both' })
        : play(spark, [{ opacity: 0, transform: 'translate(0,0) scale(.3) rotate(0deg)' }, { opacity: 1, transform: `translate(${dx * .55}px,${dy * .55}px) scale(1.1) rotate(70deg)`, offset: .35 },
          { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(.4) rotate(160deg)` }], { duration: 640 + Math.random() * 180, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
      if (animation) finished(animation).then(() => remove(spark)); else remove(spark);
    }
  }

  function stamp(card, badge) {
    if (calm()) { play(badge, [{ opacity: 0 }, { opacity: 1 }], { duration: 420 }); return; }
    play(card, [{ scale: '1 1' }, { scale: '1.06 .9', offset: .28 }, { scale: '.97 1.05', offset: .58 }, { scale: '1 1' }], { duration: 460, easing: 'ease-out' });
    if (badge?.getClientRects?.().length) {
      play(badge, [{ scale: 2.2, opacity: 0 }, { scale: .82, opacity: 1, offset: .45 }, { scale: 1.12, offset: .72 }, { scale: 1 }], { duration: 520, easing: 'ease-out' });
      setTimeout(() => sparkle(badge, { count: 6, reach: .9 }), 160);
    }
    setTimeout(() => sparkle(card, { count: 5, reach: .7 }), 120);
  }

  function pop(element, amount = 1.4) {
    if (!element) return null;
    return calm() ? play(element, [{ opacity: .3 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' })
      : play(element, [{ scale: 1 }, { scale: amount, offset: .35 }, { scale: .94, offset: .7 }, { scale: 1 }], { duration: 420, easing: EASE_OUT });
  }

  function pulse(element) {
    if (!element) return null;
    return calm() ? play(element, [{ opacity: .55 }, { opacity: 1 }], { duration: 520 })
      : play(element, [{ scale: 1 }, { scale: 1.16, offset: .4 }, { scale: 1 }], { duration: 620, easing: 'ease-in-out' });
  }

  function wake(card, shine) {
    if (calm()) { play(card, [{ opacity: .6 }, { opacity: 1 }], { duration: 360 }); return; }
    play(card, [{ translate: '0 0' }, { translate: '0 -9px', offset: .4 }, { translate: '0 0' }], { duration: 440, easing: 'ease-in-out', composite: 'add' });
    if (shine) play(shine, [{ transform: 'translateX(-130%) skewX(-18deg)', opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .75 }, { transform: 'translateX(330%) skewX(-18deg)', opacity: 0 }], { duration: 700, delay: 60, easing: 'ease-out', fill: 'both' });
  }

  function bubble(element) {
    if (!element) return;
    if (calm()) { play(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 }); return; }
    // A squash and a stretch that never grow past its resting size, so the bubble never reaches anything near it while it pops.
    play(element, [{ scale: '.55 .45', opacity: 0 }, { scale: '1 .86', opacity: 1, offset: .5 }, { scale: '.94 1', offset: .78 }, { scale: '1 1', opacity: 1 }], { duration: 420, easing: 'ease-out' });
  }

  function countUp(element, from, to, onStep = value => { element.textContent = String(value); }) {
    const start = Number(from) || 0, end = Number(to) || 0, token = serial;
    if (calm() || start === end || !globalThis.requestAnimationFrame) { onStep(end); return Promise.resolve(); }
    const duration = Math.min(900, 260 + Math.abs(end - start) * 26), t0 = performance.now();
    return new Promise(resolve => {
      const step = now => {
        if (token !== serial) { resolve(); return; }
        const k = Math.min(1, (now - t0) / duration), eased = 1 - (1 - k) ** 3, value = Math.round(start + (end - start) * eased);
        onStep(value);
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * Dice tiles fly from the dice on the table (`sources`: { x, y, size, value, image } in page px) into the tiles of `picture` (a card's
   * picture row, already showing the scored faces), one after another; each card tile shows when its die lands (`onLand(i)`).
   * Returns a promise that settles when the last has landed. Under less motion nothing flies: the card's tiles fade in.
   */
  function flyDice(sources, picture, onLand = () => {}) {
    const tiles = [...(picture?.children || [])];
    if (!sources.length || !tiles.length || !doc?.body) return Promise.resolve();
    if (calm()) { tiles.forEach(tile => play(tile, [{ opacity: 0 }, { opacity: 1 }], { duration: 420 })); return Promise.resolve(); }
    const token = serial, landings = [];
    tiles.forEach(tile => { tile.style.opacity = '0'; });
    sources.forEach((source, i) => {
      const tile = tiles[Math.min(i, tiles.length - 1)], to = tile.getBoundingClientRect();
      if (!to.width) { tile.style.opacity = ''; return; }
      const flier = tile.cloneNode(true);
      flier.classList.add('yj-flier'); flier.setAttribute('aria-hidden', 'true');
      Object.assign(flier.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, opacity: '' });
      flier.style.setProperty('--u', getComputedStyle(tile).getPropertyValue('--u')); // the card row's unit, which its tiles are drawn in
      doc.body.append(flier); live.add(flier);
      const scale = Math.max(1, source.size / to.width), dx = source.x - (to.left + to.width / 2), dy = source.y - (to.top + to.height / 2);
      const lift = Math.min(-60, dy * .25);
      const animation = play(flier, [
        { transform: `translate(${dx}px,${dy}px) scale(${scale}) rotate(${i % 2 ? -14 : 12}deg)`, opacity: 0 },
        { transform: `translate(${dx}px,${dy - 26}px) scale(${scale * 1.08}) rotate(${i % 2 ? -8 : 8}deg)`, opacity: 1, offset: .16 },
        { transform: `translate(${dx * .45}px,${dy * .45 + lift}px) scale(${(scale + 1) * .62}) rotate(${i % 2 ? 10 : -10}deg)`, opacity: 1, offset: .58 },
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      ], { duration: 620, delay: i * 85, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'both' });
      landings.push(finished(animation).then(() => {
        remove(flier);
        if (token !== serial) return;
        tile.style.opacity = '';
        pop(tile, 1.35); onLand(i);
      }));
    });
    return Promise.all(landings);
  }

  function cancel() {
    serial++;
    for (const element of [...live]) remove(element);
  }

  return { sparkle, stamp, pop, pulse, wake, bubble, countUp, flyDice, cancel, get serial() { return serial; } };
}
