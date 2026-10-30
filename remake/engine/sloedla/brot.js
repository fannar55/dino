// A song's preview in the menu of Slóeðla's song game: about ten seconds of its chorus (assets/audio/sloedla/v2/<id>/brot.mp3,
// tools/sloedla-brot.mjs), heard softly while its card is picked, into the music bus so the DJ dips it as he talks. One at a
// time: a new one, or stop(), fades the last out.

const LEVEL = 0.6; // of full level, under the DJ
const FADE = 0.3; // s in and out

/** The previews on `context`, into `output`; `src(id)` the address of a song's preview. */
export function createBrot({ context, output, src }) {
  const buffers = new Map(); // id -> Promise<AudioBuffer | null>
  let playing = null; // { source, gain }
  let asked = 0; // each play() or stop() gets a number; a preview still loading when a newer one is asked for is not started

  function load(id) {
    if (!buffers.has(id)) {
      buffers.set(id, fetch(src(id))
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then(bytes => context.decodeAudioData(bytes))
        .catch(() => null)); // no preview: the card is picked all the same
    }
    return buffers.get(id);
  }

  function fadeOut() {
    if (!playing) return;
    const now = context.currentTime;
    const { source, gain } = playing;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE);
    source.stop(now + FADE);
    playing = null;
  }

  return {
    /** Plays song `id`'s preview (the last one fades out); resolves once it has started, or could not. */
    async play(id) {
      const ticket = ++asked;
      fadeOut();
      const buffer = await load(id);
      if (!buffer || ticket !== asked) return;
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(LEVEL, now + FADE);
      gain.connect(output);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (playing?.source === source) playing = null;
      };
      source.start(now);
      playing = { source, gain };
    },
    /** Fades the preview out. */
    stop() {
      asked++;
      fadeOut();
    },
  };
}
