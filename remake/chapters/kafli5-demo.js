// A child's hands for the owner's videos of chapter 5 (kafli5.js), never part of the game: the chapter starts it only when the page
// asks with ?kafli5=pikk (tools/chapter-video.mjs --query "kafli5=pikk"). It taps as a child would, with pointer events on the
// game's canvas at where each thing is on the screen, so the game's own tap circles decide (engine/input/pointer.js), and a ring
// shows where each finger lands, for whoever watches.
//
// What it taps: the reed after 2.5 s; in the choir the right animal, sometimes the wrong one first, once while she plays phrase 3,
// once after the help glows and once after Mosi names it; along in the whole song every 0.9 s; and the star.

/** Per note, by phrase and index: when (s after it is wanted) the child taps the wrong animal, and when the right one. */
const NOTES = {
  '0-0': { right: 1.5 },
  '0-1': { wrong: 1.2, right: 3.4 },
  '1-0': { right: 1.2 },
  '1-1': { right: 1 },
  '1-2': { right: 6 }, // after the glow at 5 s
  '2-0': { right: 1.2 },
  '2-1': { wrong: 1, right: 2.6 },
  '2-2': { right: 1 },
  '2-3': { right: 1 },
  '3-0': { right: 11 }, // after Mosi names it at 10 s
  '3-1': { right: 1 },
  '3-2': { right: 1.1 },
  '3-3': { right: 0.9 },
  '3-4': { right: 1 },
};
const DURING_SHOW = { phrase: 2, index: 1, after: 0.15 }; // a tap while she shows phrase 3, which sings and is not counted
const REED_AFTER = 2.5;
const ALONG = { every: 0.9, taps: 14 };
const STAR_AFTER = 1.5;

/** Asked for by the page? */
export function demoAsked() {
  return new URLSearchParams(globalThis.location?.search ?? '').get('kafli5') === 'pikk';
}

/** The child's hands, on the scene's clock: a task that runs until the chapter ends (`c.ended`). */
export function startDemoChild(s, c, { canvas = globalThis.document?.getElementById('view') } = {}) {
  if (!canvas) return;
  const THREE = c.world.THREE;
  const done = new Set(); // what was tapped: 'reed', '0-1 wrong', 'show', 'along 3', 'star'
  let wanted = null; // { key, group, since }
  let along = { k: 0, last: -Infinity };
  let starSeen = null;

  function screen(point) {
    const p = new THREE.Vector3(...point).project(c.world.camera);
    const box = canvas.getBoundingClientRect();
    return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height, inFront: p.z < 1 };
  }
  function tapAt(point) {
    const { x, y, inFront } = screen(point);
    if (!inFront) return;
    const init = { pointerId: 11, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    ring(x, y);
  }
  function ring(x, y) {
    const el = document.createElement('div');
    el.style.cssText = `position: fixed; left: ${x - 26}px; top: ${y - 26}px; width: 52px; height: 52px; border-radius: 50%;
      border: 4px solid rgba(255, 255, 255, 0.95); box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35); pointer-events: none; z-index: 50;
      transition: transform 0.6s ease-out, opacity 0.6s ease-out; transform: scale(0.6); opacity: 1;`;
    document.body.append(el);
    requestAnimationFrame(() => { el.style.transform = 'scale(1.3)'; el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 900);
  }
  const once = (what, fn) => {
    if (done.has(what)) return;
    done.add(what);
    fn();
  };
  const point = name => c.aims?.[name] ?? null;

  s.after(0, function* hands() {
    while (!c.ended) {
      const now = s.time;
      // the reed
      if (point('reed')) {
        c.demoReedSince ??= now;
        if (now - c.demoReedSince >= REED_AFTER) once('reed', () => tapAt(point('reed')));
      }
      // the choir
      const st = c.choir?.state();
      if (st && !st.done) {
        if (st.waiting) {
          const key = `${st.phrase}-${st.index}`;
          if (wanted?.key !== key) wanted = { key, since: now };
          const plan = NOTES[key] ?? { right: 1 };
          const group = c.melody[st.phrase][st.index];
          const wrong = c.groups.find(g => g !== group);
          if (plan.wrong !== undefined && now - wanted.since >= plan.wrong) once(`${key} wrong`, () => tapAt(point(`choir-${wrong}`)));
          if (now - wanted.since >= plan.right) once(`${key} right`, () => tapAt(point(`choir-${group}`)));
        }
        const show = c.choirLog.find(e => e.type === 'show' && e.phrase === DURING_SHOW.phrase && e.index === DURING_SHOW.index);
        if (show && now - show.at >= DURING_SHOW.after) once('show', () => tapAt(point(`choir-${show.group}`)));
      }
      // along in the whole song
      if (c.scene === 6 && Number.isFinite(c.songStart) && now >= c.songStart && along.k < ALONG.taps && now - along.last >= ALONG.every) {
        along.last = now;
        const group = c.groups[(along.k * 2) % c.groups.length];
        along.k++;
        tapAt(point(`choir-${group}`));
      }
      // the star, as it rises
      const star = c.world.scene.children.find(o => o.isSprite && o.renderOrder === 20);
      if (star) {
        starSeen ??= now;
        if (now - starSeen >= STAR_AFTER) once('star', () => tapAt(star.position.toArray()));
      }
      yield;
    }
  });
}
