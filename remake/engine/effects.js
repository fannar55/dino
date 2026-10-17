// Effects on the game clock: short-lived things that are neither actors nor scene tasks (a sparkle
// burst, a saddle popping in) but must move with the game clock, pause with it and land on the same
// frame in a capture. main.js updates them every frame, after the actors. An effect is anything with
// update(dt), which returns true while it goes on; once it returns false it is dropped.
//
// Each effect runs on its own: one that throws (a hold reaching for a point that is gone, say) is said
// once, with its `label` if it has one, and dropped, and the frame goes on with the others and with
// everything main.js updates after them (the camera, the forest, the sky). clear() drops them all, as
// scene.stop() does when a chapter ends: nothing it set going keeps running.
export function createEffects() {
  const live = new Set();
  return {
    add(effect) {
      live.add(effect);
      return effect;
    },
    update(dt) {
      for (const effect of [...live]) {
        if (!live.has(effect)) continue; // dropped earlier in this frame (cleared by another effect)
        let going = false;
        try {
          going = effect.update(dt);
        } catch (error) {
          console.error('[effects] an effect failed and is dropped:', effect.label ?? effect, error);
        }
        if (!going) live.delete(effect);
      }
    },
    /** Is this effect still running? */
    has(effect) { return live.has(effect); },
    /** Drop every effect. */
    clear() { live.clear(); },
    get size() { return live.size; },
  };
}
