// A child's hands for the owner's videos of the festival (hatid.js), never part of the game: the chapter starts it only when the page
// asks with ?hatid=pikk. As chapters/kafli6-demo.js does, it taps with pointer events on the game's canvas where each waiting thing
// is on the screen, so the game's own tap circles decide: the sun after 1.8 s, Grameðla's head after 1.6 s, the stars one by one
// 1.2 s apart (the fourth after its glimmer), and nothing in the party.
const AFTER = { sun: 1.8, roar: 1.6, star: 1.2, slow: 6 };

/** Asked for by the page? */
export function demoAsked() {
  return new URLSearchParams(globalThis.location?.search ?? '').get('hatid') === 'pikk';
}

/** The child's hands, on the scene's clock, until the chapter ends (`c.ended`). */
export function startDemoChild(s, c, { canvas = globalThis.document?.getElementById('view') } = {}) {
  if (!canvas) return;
  const THREE = c.world.THREE;
  let last = -Infinity;
  let taps = 0;
  function tapAt(spec) {
    const p = c.world.resolvePoint(spec, new THREE.Vector3()).project(c.world.camera);
    if (p.z >= 1) return;
    const box = canvas.getBoundingClientRect();
    const x = box.left + ((p.x + 1) / 2) * box.width;
    const y = box.top + ((1 - p.y) / 2) * box.height;
    const init = { pointerId: 12, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  }
  s.after(0, function* hands() {
    while (!c.ended) {
      const waiting = c.waiting;
      if (waiting && !c.inParty) {
        const now = s.time;
        const gap = waiting.task === 'stars' ? (taps === 3 ? AFTER.slow : AFTER.star) : AFTER[waiting.task] ?? 2;
        const from = Math.max(waiting.since, last);
        const name = waiting.names.find(n => c.aims[n]);
        if (name && now - from >= gap) {
          tapAt(c.aims[name]);
          last = now;
          if (waiting.task === 'stars') taps++;
        }
      }
      yield;
    }
  });
}
