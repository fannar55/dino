// Grameðla kemur!'s recordings on the page (the list of what plays when is soundtrack.js): her footfall and the far thumps, her
// roar and breath (chapter 2's), the wing beats, the flock's air and the whoosh (chapter 4's), fetched and decoded once in the
// background. Each plays through an optional low-pass, its gain and its pan into the page's output, under one gain that holds with
// the game (world.sound.hold: silent at once while the book is open or the tab hidden, and back).
//
//   const sounds = createShowSounds({ context: world.sound?.context, output: world.sound?.output });
//   const release = world.sound?.hold?.(sounds);
//   sounds.play(event);   // a soundtrack.js event with `sound`: at its db, cutoff, pan, rate, offset, duration, backwards
//   sounds.stop();        // everything playing fades out at once ("Aftur" starts clean, "Hætta" leaves silent)
//
// With no audio context (a capture, a review shot, Node) it is the same object, doing nothing. A file that cannot be had, or has not
// decoded yet, is simply not heard.
import { SOUND_FILES } from './soundtrack.js';

const REMAKE = new URL('../../', import.meta.url);
const FADE = 0.012; // s: each sound starts and ends this softly, so a cut into a recording never clicks

export function createShowSounds({ context = null, output = null, fetch = globalThis.fetch } = {}) {
  if (!context) return { play: () => false, stop() {}, setPaused() {}, ready: Promise.resolve(false), playing: () => 0 };

  const master = context.createGain();
  master.gain.value = 1;
  master.connect(output ?? context.destination);
  const buffers = new Map(); // name → AudioBuffer
  const backwards = new Map(); // name → the same, reversed
  const live = new Set(); // { source, gain }

  const ready = Promise.all(Object.entries(SOUND_FILES).map(([name, file]) => Promise.resolve()
    .then(() => fetch(new URL(file, REMAKE).href))
    .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
    .then(bytes => context.decodeAudioData(bytes))
    .then(buffer => { buffers.set(name, buffer); })
    .catch(() => {}))).then(() => true);

  function reversed(name) {
    if (!backwards.has(name)) {
      const buffer = buffers.get(name);
      const copy = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let c = 0; c < buffer.numberOfChannels; c++) copy.getChannelData(c).set(buffer.getChannelData(c).slice().reverse());
      backwards.set(name, copy);
    }
    return backwards.get(name);
  }

  return {
    ready,
    /** Plays a soundtrack event's recording now. Whether it did. */
    play({ sound, db = 0, cutoff = null, pan = 0, rate = 1, offset = 0, duration = null, reverse = false }) {
      // not before its file has decoded, nor while the page has no sound yet (asleep until the glasses' tap: a sound started then
      // would wait and pile up with every other one, all heard at once on the tap)
      if (!buffers.has(sound) || context.state !== 'running') return false;
      const buffer = reverse ? reversed(sound) : buffers.get(sound);
      const now = context.currentTime;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate > 0 ? rate : 1;
      const length = Math.max(0.05, Math.min(duration ?? Infinity, buffer.duration - offset)); // of the recording's own seconds
      const heard = length / source.playbackRate.value; // of the clock's
      const gain = context.createGain();
      const level = 10 ** (db / 20);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + FADE);
      gain.gain.setValueAtTime(level, now + Math.max(FADE, heard - FADE * 3));
      gain.gain.linearRampToValueAtTime(0, now + heard);
      const nodes = [gain];
      let into = source;
      if (cutoff) {
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        filter.Q.value = 0.7;
        into.connect(filter);
        into = filter;
        nodes.push(filter);
      }
      into.connect(gain);
      let last = gain;
      if (pan && context.createStereoPanner) {
        const panner = context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        gain.connect(panner);
        last = panner;
        nodes.push(panner);
      }
      last.connect(master);
      const one = { source, gain };
      live.add(one);
      source.onended = () => {
        live.delete(one);
        source.disconnect();
        for (const node of nodes) node.disconnect();
      };
      source.start(now, offset, length + 0.01);
      return true;
    },
    /** Everything playing fades out over a few hundredths of a second and is let go. */
    stop() {
      const now = context.currentTime;
      for (const { source, gain } of live) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.04);
        try { source.stop(now + 0.05); } catch { /* already stopped */ }
      }
    },
    /** Held with the game: silent at once, and back. */
    setPaused(on) {
      master.gain.setTargetAtTime(on ? 0 : 1, context.currentTime, 0.015);
    },
    playing: () => live.size,
  };
}
