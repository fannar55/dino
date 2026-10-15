// Effects on the game clock: short-lived things that are neither actors nor scene tasks (a sparkle
// burst, a saddle popping in) but must move with the game clock, pause with it and land on the same
// frame in a capture. main.js updates them every frame, after the actors. An effect is anything with
// update(dt), which returns true while it goes on; once it returns false it is dropped.
export function createEffects() {
  const live = new Set();
  return {
    add(effect) {
      live.add(effect);
      return effect;
    },
    update(dt) {
      for (const effect of [...live]) if (!effect.update(dt)) live.delete(effect);
    },
    get size() { return live.size; },
  };
}
