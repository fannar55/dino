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
/**
 * A line's <audio> heard from one side (engine/scene/voice.js `pan`): the element through a stereo panner straight to the speakers,
 * not through the output (a line sounds as loud as one played straight out, which the output's limiter does not touch). Returns
 * its letting go (once is enough; twice is fine), or null with no audio context. -1 is left, 1 right.
 */
export function panElement(context, element, pan) {
  if (!context?.createMediaElementSource || !context.createStereoPanner) return null;
  const source = context.createMediaElementSource(element);
  const panner = context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, Number(pan) || 0));
  source.connect(panner);
  panner.connect(context.destination);
  return () => {
    source.disconnect();
    panner.disconnect();
  };
}

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
