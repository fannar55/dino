// The hall of Slóeðla's song game: a made-up reverb, which the songs' own instruments and the crowd send a share of their sound to.

/** A room for the band: a convolver with a made-up hall (stereo noise dying away over `seconds`). */
export function createReverb(context, { seconds = 2.2, random = Math.random } = {}) {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = context.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (random() * 2 - 1) * (1 - i / length) ** 3.2;
  }
  const convolver = context.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}
