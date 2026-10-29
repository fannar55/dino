// The DJ of the Star Festival in Slóeðla's song game: a voice made for the game with ElevenLabs Voice Design (a fun, high-energy
// Icelandic radio DJ; the owner picked "DJ 1" of twelve, 2026-10-29), recorded by tools/sloedla-dj.mjs into
// assets/audio/sloedla/dj/. He calls out the run's milestones and the big moments, short and hyped, and never chats: the numbers
// ("Tíu í röð!"), the tiers ("Flott!", "Vá!", "Stjörnukraftur!"), a section that comes in big ("Allir með!"), a friend coming back
// in ("Kambeðla er með!"), the start, and the end ("Fullt hús!" for a run with every note in it). While he talks, the music dips a
// little under him, as on the radio (the page's `onTalk`).

/** Every line the DJ has, by id. */
export const DJ_LINES = Object.freeze({
  byrjun: 'Jæja krakkar, nú byrjar fjörið!',
  r10: 'Tíu í röð!',
  r15: 'Fimmtán í röð!',
  r20: 'Tuttugu í röð!',
  r25: 'Tuttugu og fimm í röð!',
  r30: 'Þrjátíu í röð!',
  r35: 'Þrjátíu og fimm í röð!',
  r40: 'Fjörutíu í röð!',
  r45: 'Fjörutíu og fimm í röð!',
  r50: 'Fimmtíu í röð!',
  r60: 'Sextíu í röð!',
  r70: 'Sjötíu í röð!',
  r80: 'Áttatíu í röð!',
  r90: 'Níutíu í röð!',
  r100: 'Hundrað í röð!',
  flott: 'Flott!',
  va: 'Vá!',
  stjornukraftur: 'Stjörnukraftur!',
  allir: 'Allir með!',
  kambedla: 'Kambeðla er með!',
  sloedla: 'Slóeðla er með!',
  thorsedla: 'Þórseðla er með!',
  fullthus: 'Fullt hús!',
  naestum: 'Næstum fullt hús!',
  frabaert: 'Frábært!',
  velgert: 'Vel gert!',
  aftur: 'Spilum aftur saman!',
});

const TIERS = ['', 'flott', 'va', 'stjornukraftur'];
const FRIENDS = { a: 'sloedla', b: 'kambedla', c: 'thorsedla' };
const END = ['aftur', 'velgert', 'flott', 'frabaert']; // by the stars won, as the words at the end (game.js END_WORDS)
export const DJ_QUIET = 4; // s at least between two of his lines, but for the big ones (milestones, Stjörnukraftur, the end)
export const DJ_WAIT = 1.6; // s a big line may wait for him to finish the one before (the game queues it), else it is dropped

/**
 * The line for the end of a round (the screen shows its words too): "Fullt hús!" when every note was played in one run, "Næstum
 * fullt hús!" when one or two were missed, else by the stars won (the round's words before: "Frábært!", "Flott!", "Vel gert!",
 * "Spilum aftur saman!").
 */
export function endLineOf({ stars = 0, misses = 0, full = false }) {
  return full ? 'fullthus' : misses <= 2 && stars === 3 ? 'naestum' : END[Math.max(0, Math.min(3, stars))];
}
/**
 * What the DJ says to `event` at song time `time`, or null. Events: { kind: 'start' }, { kind: 'milestone', streak },
 * { kind: 'tier', tier }, { kind: 'big' }, { kind: 'rejoin', role, back } (`back`: she had played before and dropped out; her
 * first notes of the song are no news), { kind: 'end', stars, misses, full } (`full`: every note in one run). The big ones (a
 * milestone, Stjörnukraftur, the end) are always said (the game queues one while he is still talking: DJ_WAIT); the others only
 * after DJ_QUIET s of quiet. `memory` keeps when he last spoke ({ last }) and is updated when he speaks.
 */
export function djCueOf(event, time, memory) {
  let line = null;
  let big = false;
  if (event.kind === 'start') line = 'byrjun';
  else if (event.kind === 'milestone') { line = DJ_LINES[`r${event.streak}`] ? `r${event.streak}` : null; big = true; }
  else if (event.kind === 'tier') { line = TIERS[event.tier] || null; big = event.tier === 3; }
  else if (event.kind === 'big') line = 'allir';
  else if (event.kind === 'rejoin') line = event.back ? FRIENDS[event.role] ?? null : null;
  else if (event.kind === 'end') { line = endLineOf(event); big = true; }
  if (!line) return null;
  if (!big && time - (memory.last ?? -Infinity) < DJ_QUIET) return null;
  memory.last = time;
  return line;
}

/**
 * The DJ's voice: `play(line)` plays it now (a hair late, as a voice answers) and calls `onTalk(at, seconds)` so the page can dip
 * the music under him; it returns how long he talks, in s (0 for a line not loaded yet: it is just not heard). load() fetches and decodes the lines
 * one at a time (the page calls it while the start card waits).
 */
export function createDj({ context, output, src, level = 1.2, onTalk = () => {} }) {
  const bus = context.createGain();
  bus.gain.value = level;
  bus.connect(output);
  const buffers = {};
  let queue = Promise.resolve();
  function load() {
    for (const line of Object.keys(DJ_LINES)) {
      queue = queue.then(async () => {
        try {
          const bytes = await fetch(src(line)).then(r => r.arrayBuffer());
          buffers[line] = await context.decodeAudioData(bytes);
        } catch { /* that line stays quiet */ }
      });
    }
    return queue;
  }
  function play(line, { delay = 0.05 } = {}) {
    const buffer = buffers[line];
    if (!buffer) return 0;
    const at = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(bus);
    source.start(at);
    source.onended = () => source.disconnect();
    onTalk(at, buffer.duration);
    return buffer.duration + delay;
  }
  return { load, play, bus };
}
