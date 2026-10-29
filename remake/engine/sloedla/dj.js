// The DJ of the Star Festival in Slóeðla's song game: a voice made for the game with ElevenLabs Voice Design (a fun, high-energy
// Icelandic radio DJ; the owner picked "DJ 1" of twelve, 2026-10-29), recorded by tools/sloedla-dj.mjs into
// assets/audio/sloedla/dj/. He calls out the run's milestones and the big moments, short and hyped, and never chats: the numbers
// ("Tíu í röð!"), the tiers ("Flott!", "Vá!", "Stjörnukraftur!"), the crowd's clapping, a section that comes in big ("Allir
// með!"), a friend coming back in ("Kambeðla er komin aftur!"), the start, and the end ("Fullt hús!" for a run with every note in
// it). Each has a few ways of saying it, and he never says the same one twice in a row. While he talks, the music dips a little
// under him, as on the radio (the page's `onTalk`).

const NUMBERS = { 10: 'Tíu', 15: 'Fimmtán', 20: 'Tuttugu', 25: 'Tuttugu og fimm', 30: 'Þrjátíu', 35: 'Þrjátíu og fimm', 40: 'Fjörutíu', 45: 'Fjörutíu og fimm', 50: 'Fimmtíu', 60: 'Sextíu', 70: 'Sjötíu', 80: 'Áttatíu', 90: 'Níutíu', 100: 'Hundrað' };
const milestone = n => {
  const say = NUMBERS[n];
  return n <= 50 ? [`${say} í röð!`, `${say} í röð, haltu áfram!`, `Já! ${say} í röð!`, `${say} í röð, æðislegt!`] : [`${say} í röð!`, `Já! ${say} í röð!`];
};
const friend = name => [`${name} er með!`, `${name} er komin aftur!`, `Velkomin aftur, ${name}!`, `Þarna er ${name}!`];

/** Every line the DJ has: a key, and the ways of saying it (the first is the line the words on the screen match). */
export const DJ_LINES = Object.freeze({
  byrjun: ['Jæja krakkar, nú byrjar fjörið!', 'Halló halló! Eru allir tilbúnir?', 'Velkomin á Stjörnuhátíðina!', 'Hæ öll sömul, nú skulum við dansa!', 'Upp með hendurnar, hér kemur lagið!'],
  ...Object.fromEntries(Object.keys(NUMBERS).map(n => [`r${n}`, milestone(Number(n))])),
  flott: ['Flott!', 'Flott hjá þér!', 'Já, flott!', 'Glæsilegt!'],
  va: ['Vá!', 'Vá, hvað þetta er flott!', 'Vá, vá, vá!', 'Þetta er geggjað!'],
  stjornukraftur: ['Stjörnukraftur!', 'Stjörnukraftur, allir saman!', 'Nú kemur stjörnukrafturinn!', 'Stjörnukraftur! Stjörnurnar skína!'],
  klapp: ['Klöppum öll saman!', 'Allir að klappa!', 'Klöppum í takt!', 'Nú klöppum við!'],
  allir: ['Allir með!', 'Allir saman nú!', 'Allir að dansa!', 'Nú syngja allir með!'],
  kambedla: friend('Kambeðla'),
  sloedla: friend('Slóeðla'),
  thorsedla: friend('Þórseðla'),
  fullthus: ['Fullt hús!', 'Fullt hús, þú náðir öllu!', 'Fullt hús, algjör stjarna!', 'Vá, fullt hús!'],
  naestum: ['Næstum fullt hús!', 'Næstum fullt hús, frábært!', 'Næstum allt, vel gert!'],
  frabaert: ['Frábært!', 'Frábært hjá þér!', 'Þetta var frábært!', 'Algjör snilld!'],
  velgert: ['Vel gert!', 'Vel gert hjá þér!', 'Flott spilað!', 'Mjög vel gert!'],
  aftur: ['Spilum aftur saman!', 'Eigum við að spila aftur?', 'Prófum aftur saman!', 'Æfingin skapar meistarann!'],
});

/** The recordings, one a way of saying a line: [{ id: 'r10-2', key: 'r10', text }]. */
export const DJ_TAKES = Object.freeze(Object.entries(DJ_LINES).flatMap(([key, texts]) => texts.map((text, i) => ({ id: `${key}-${i + 1}`, key, text }))));

const TIERS = ['', 'flott', 'va', 'stjornukraftur'];
const FRIENDS = { a: 'sloedla', b: 'kambedla', c: 'thorsedla' };
const END = ['aftur', 'velgert', 'flott', 'frabaert']; // by the stars won, as the words at the end
export const DJ_QUIET = 4; // s at least between two of his lines, but for the big ones (milestones, Stjörnukraftur, the clapping, the end)
export const DJ_WAIT = 1.6; // s a big line may wait for him to finish the one before (the game queues it), else it is dropped

/**
 * The line for the end of a round (the screen shows its first words): "Fullt hús!" when every note was played in one run, "Næstum
 * fullt hús!" when one or two were missed, else by the stars won ("Frábært!", "Flott!", "Vel gert!", "Spilum aftur saman!").
 */
export function endLineOf({ stars = 0, misses = 0, full = false }) {
  return full ? 'fullthus' : misses <= 2 && stars === 3 ? 'naestum' : END[Math.max(0, Math.min(3, stars))];
}

/**
 * What the DJ says to `event` at song time `time` (a key of DJ_LINES), or null. Events: { kind: 'start' }, { kind: 'milestone',
 * streak }, { kind: 'tier', tier }, { kind: 'clap' } (the crowd starts clapping along), { kind: 'big' }, { kind: 'rejoin', role,
 * back } (`back`: she had played before and dropped out; her first notes of the song are no news), { kind: 'end', stars, misses,
 * full } (`full`: every note in one run). The big ones (a milestone, Stjörnukraftur, the clapping, the end) are always said (the
 * game queues one while he is still talking: DJ_WAIT); the others only after DJ_QUIET s of quiet. `memory` keeps when he last
 * spoke ({ last }) and is updated when he speaks.
 */
export function djCueOf(event, time, memory) {
  let line = null;
  let big = false;
  if (event.kind === 'start') line = 'byrjun';
  else if (event.kind === 'milestone') { line = DJ_LINES[`r${event.streak}`] ? `r${event.streak}` : null; big = true; }
  else if (event.kind === 'tier') { line = TIERS[event.tier] || null; big = event.tier === 3; }
  else if (event.kind === 'clap') { line = 'klapp'; big = true; }
  else if (event.kind === 'big') line = 'allir';
  else if (event.kind === 'rejoin') line = event.back ? FRIENDS[event.role] ?? null : null;
  else if (event.kind === 'end') { line = endLineOf(event); big = true; }
  if (!line) return null;
  if (!big && time - (memory.last ?? -Infinity) < DJ_QUIET) return null;
  memory.last = time;
  return line;
}

/**
 * The DJ's voice: `play(key)` says one of the ways of saying that line (never the one he said last time), now (a hair late, as a
 * voice answers), and calls `onTalk(at, seconds)` so the page can dip the music under him; it returns how long he talks, in s (0
 * when none of its takes is loaded yet: it is just not heard). load() fetches and decodes the takes one at a time (the page calls
 * it while the start card waits; the first way of each line first, so a round started early has them all).
 */
export function createDj({ context, output, src, level = 1.2, random = Math.random, onTalk = () => {} }) {
  const bus = context.createGain();
  bus.gain.value = level;
  bus.connect(output);
  const buffers = {}; // id -> AudioBuffer
  const last = {}; // key -> the id said last
  let queue = Promise.resolve();
  function load() {
    const order = [...DJ_TAKES].sort((x, y) => Number(x.id.split('-').pop()) - Number(y.id.split('-').pop()));
    for (const { id } of order) {
      queue = queue.then(async () => {
        try {
          const bytes = await fetch(src(id)).then(r => r.arrayBuffer());
          buffers[id] = await context.decodeAudioData(bytes);
        } catch { /* that take stays quiet */ }
      });
    }
    return queue;
  }
  function play(key, { delay = 0.05 } = {}) {
    const ready = DJ_TAKES.filter(take => take.key === key && buffers[take.id]);
    if (!ready.length) return 0;
    const fresh = ready.length > 1 ? ready.filter(take => take.id !== last[key]) : ready;
    const take = fresh[Math.floor(random() * fresh.length)];
    last[key] = take.id;
    const buffer = buffers[take.id];
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
