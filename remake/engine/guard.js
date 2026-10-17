// One part of a frame that throws must not stop the rest of it. main.js runs the music and the sound effects before the actors,
// the effects, the camera and the forest; a persistent error there would otherwise freeze the picture with every frame it threw.

/**
 * `fn`, guarded: an error it throws is said once, with `label`, and the call returns undefined. It is called again every time,
 * so a part that recovers (a sound the browser gives back) comes back by itself.
 */
export function guard(label, fn) {
  let told = false;
  return (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      if (!told) {
        told = true;
        console.error(`[${label}] failed, and the frame goes on without it:`, error);
      }
      return undefined;
    }
  };
}
