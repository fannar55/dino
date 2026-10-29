// The crowd at the festival, heard and never seen: now and then a "vá!" when it goes well, a kind "æææ" when a long run breaks,
// cheering when a section comes in big, and applause at the end. The sounds were made with ElevenLabs (tools/sloedla-crowd.mjs,
// assets/audio/sloedla/crowd-*.mp3, a few takes of each). "Now and then" is the point: a crowd that answers every note is noise,
// so cueOf() lets one through only after a quiet spell, and the smaller moments only some of the time.

/** The takes of each sound (crowd.json has what was asked for). */
export const CROWD_TAKES = { va: 3, ae: 3, fagn: 2, klapp: 2, takt: 4 }; // takt: one clap of the whole crowd, played on the beat

/** What may set the crowd off, the sound it makes, how often (chance) and how long since the last sound of that kind (s). */
const CUES = {
  tier2: { sound: 'va', chance: 1 }, // a run of eight
  tier3: { sound: 'fagn', chance: 1 }, // a run of sixteen: gold
  more: { sound: 'va', chance: 0.6 }, // every eight hits further on
  rejoin: { sound: 'va', chance: 0.4 }, // a dinosaur back in the song after she was out
  big: { sound: 'fagn', chance: 1 }, // a section that comes in big
  broke: { sound: 'ae', chance: 0.8 }, // a run of six or more broken by a miss
  end: { sound: 'klapp', chance: 1 },
};
export const CROWD_QUIET = 6; // s at least between any two sounds of the crowd (the applause at the end excepted)
const SAME_QUIET = { va: 10, ae: 20, fagn: 10, klapp: 0 }; // s at least between two of the same kind
export const BROKE_AT = 6; // a run at least this long, broken, is worth an "æææ"

/**
 * Whether the crowd answers `event` at song time `time`: the sound's name ('va', 'ae', 'fagn', 'klapp') or null. `memory` keeps
 * when it last made a sound ({ last, by: { va: t } }), and is updated when it answers; `random` is the round's dice.
 */
export function cueOf(event, time, memory, random = Math.random) {
  const cue = CUES[event];
  if (!cue) return null;
  const by = (memory.by ??= {});
  if (event !== 'end') {
    if (time - (memory.last ?? -Infinity) < CROWD_QUIET) return null;
    if (time - (by[cue.sound] ?? -Infinity) < SAME_QUIET[cue.sound]) return null;
    if (random() >= cue.chance) return null;
  }
  memory.last = time;
  by[cue.sound] = time;
  return cue.sound;
}

/**
 * The crowd's voice: `play(sound, { gain })` plays one of its takes, never the one played last, a moment later (people react), a little
 * over the band (it must be heard over a full chorus); `at(sound, when, { gain, rate })` plays one at a context time (the claps
 * along with the song, on the beat).
 * load() fetches and decodes the takes one at a time (the page calls it while the start card waits); a take not ready yet is just
 * not heard.
 */
export function createCrowd({ context, output, room = null, src, random = Math.random, level = 1.4 }) {
  const bus = context.createGain();
  bus.gain.value = level;
  bus.connect(output);
  if (room) {
    const send = context.createGain();
    send.gain.value = 0.25;
    bus.connect(send);
    send.connect(room);
  }
  const buffers = {};
  const last = {};
  let queue = Promise.resolve();

  function load() {
    for (const [sound, takes] of Object.entries(CROWD_TAKES)) {
      for (let take = 1; take <= takes; take++) {
        const id = `${sound}-${take}`;
        queue = queue.then(async () => {
          try {
            const bytes = await fetch(src(id)).then(r => r.arrayBuffer());
            (buffers[sound] ??= [])[take - 1] = await context.decodeAudioData(bytes);
          } catch { /* that take stays quiet */ }
        });
      }
    }
    return queue;
  }

  /** Plays one of `sound`'s takes (never the one played last) at context time `when`, `gain` loud, at `rate` speed (pitch). */
  function at(sound, when, { gain = 1, rate = 1 } = {}) {
    const takes = (buffers[sound] ?? []).map((buffer, i) => [buffer, i]).filter(([buffer, i]) => buffer && (i !== last[sound] || buffers[sound].filter(Boolean).length === 1));
    if (!takes.length) return false;
    const [buffer, i] = takes[Math.floor(random() * takes.length)];
    last[sound] = i;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const g = context.createGain();
    g.gain.value = gain;
    source.connect(g);
    g.connect(bus);
    source.start(Math.max(when, context.currentTime));
    source.onended = () => { source.disconnect(); g.disconnect(); };
    return true;
  }

  function play(sound, { gain = 1, delay = 0.12 } = {}) {
    return at(sound, context.currentTime + delay, { gain });
  }

  return { load, play, at, bus };
}
