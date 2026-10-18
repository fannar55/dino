// The page's one audio context, and the one chain every sound goes through on its way to the speakers.

/**
 * A new audio context, or null where the browser has none or will not make one: the game then goes on without sound.
 * The browser keeps it asleep until the player touches the page (music.start wakes it).
 */
export function createAudioContext() {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext; // webkit: Safari before 14.1
  if (!Context) return null;
  try {
    return new Context();
  } catch (error) {
    console.warn('No sound: the browser would not make an audio context.', error);
    return null;
  }
}

/**
 * What the music and the effects are both heard through: a little headroom, then a limiter, so the two together never clip
 * (the old game's settings, dist/audio.js). Returns the node to connect them to.
 */
export function createOutput(context) {
  const master = context.createGain();
  master.gain.value = 0.9;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -5;
  limiter.knee.value = 12;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.22;
  master.connect(limiter);
  limiter.connect(context.destination);
  return master;
}
