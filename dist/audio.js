const AUDIO_ROOT = new URL('./assets/audio/', import.meta.url);
// Keep the score present alongside the adventure: speech leaves an audible
// music bed, while taps, footsteps and calls make only a small amount of room.
// Nature beds/chirps never keep the score permanently ducked.
export const MUSIC_MIX = Object.freeze({ quiet: .60, movement: .57, touch: .54, effect: .50, featured: .45, speech: .24, attack: .12, release: .55 });
const SAMPLES = { tap: 0.28, discover: 0.32, success: 0.32 };
const SCENES = new Set(['forest', 'lake', 'sky']);
const EFFECT_ALIASES = { footprint: 'track', fish: 'splash', reed: 'echo', windring: 'breeze' };
// Mosi's authored walk has two diagonal footfall pairs per 2.604s cycle.
// The cadence follows those pairs; phase is approximate during walk blending.
const STEP_SECONDS = 1.30;
const EFFECT_GAPS = { tap: 0.04, discover: 0.25, success: 0.5, splash: 0.32, wing: 0.3, launch: 0.3, dino: 0.7, fossil: 0.14, leaf: 0.14, track: 0.18, echo: 0.3, breeze: 0.22, secret: 0.65 };
const STAR_NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
const WORLD_TOUCH_GAPS = { grass: .14, tree: .24, path: .14, water: .22, rock: .22 };
// These are playful invented voices, not claims about reconstructed dinosaur calls.
const ANIMAL_VOICES = {
  triceratops: { notes: [[145, 205, .28, 0], [205, 125, .43, .23]], breath: 520, level: .052 },
  stegosaurus: { notes: [[155, 125, .42, 0], [124, 182, .31, .36], [182, 138, .26, .61]], breath: 460, level: .048 },
  brachiosaurus: { notes: [[88, 120, .67, 0], [120, 83, .78, .53]], breath: 330, level: .054 },
  trex: { notes: [[112, 84, .53, 0], [88, 139, .35, .4], [138, 94, .42, .68]], breath: 650, level: .05 },
  spinosaurus: { notes: [[183, 123, .33, 0], [128, 178, .23, .26], [181, 114, .45, .45]], breath: 900, level: .042 },
  parasaurolophus: { notes: [[238, 326, .52, 0], [326, 225, .63, .44]], breath: 760, level: .041 },
  pteranodon: { notes: [[590, 830, .22, 0], [835, 610, .29, .19], [715, 490, .4, .46]], breath: 1900, level: .027 },
};
const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

/** All procedural nature sounds are original synthesis; speech stays Icelandic. */
export function createAudio() {
  let context, master, musicBus, ambienceBus, effectsBus, rewardBus, musicSource;
  let musicElement, musicPlayPending, musicMediaFailed = false;
  let speechSource, utterance, completion, currentBed;
  let unlocked = false, muted = false, paused = false, disposed = false;
  let speaking = false, walking = false, musicLoading = false;
  let scene = 'forest', generation = 0, soundEpoch = 0, ambienceTimer, stepTimer, stepSide = 0;
  let lastStep = -Infinity;
  let recordings = {};
  const buffers = new Map(), noiseBuffers = new Map(), sources = new Map(), beds = new Set(), lastEffects = new Map(), pendingSamples = new Set();
  const musicFocus = new Map();
  let musicEnvelope;
  const synth = globalThis.speechSynthesis;
  const random = (a, b) => a + Math.random() * (b - a);
  const active = () => unlocked && !muted && !paused && !disposed && !document.hidden;
  const manifestReady = fetch(new URL('narration-manifest.json', AUDIO_ROOT))
    .then(response => response.ok ? response.json() : {})
    .then(data => { recordings = data.clips || {}; })
    .catch(() => {});

  function icelandicVoice() {
    return synth?.getVoices().find(voice => /^is(?:[-_]|$)/i.test(voice.lang));
  }

  function initialize() {
    if (context || disposed) return context;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -5; limiter.knee.value = 12; limiter.ratio.value = 4;
    limiter.attack.value = 0.003; limiter.release.value = 0.22;
    master.connect(limiter).connect(context.destination);
    musicBus = context.createGain(); musicBus.gain.value = MUSIC_MIX.quiet;
    musicEnvelope = { value: MUSIC_MIX.quiet, target: MUSIC_MIX.quiet, at: context.currentTime, tau: MUSIC_MIX.release };
    ambienceBus = context.createGain(); ambienceBus.gain.value = 0.8;
    effectsBus = context.createGain(); effectsBus.gain.value = 1;
    rewardBus = context.createGain(); rewardBus.gain.value = 1;
    for (const bus of [musicBus, ambienceBus, effectsBus, rewardBus]) bus.connect(master);
    return context;
  }

  function load(filename) {
    if (!buffers.has(filename)) {
      const request = fetch(new URL(filename, AUDIO_ROOT))
        .then(response => { if (!response.ok) throw new Error(`Audio ${response.status}`); return response.arrayBuffer(); })
        .then(bytes => context.decodeAudioData(bytes));
      buffers.set(filename, request);
      request.catch(() => buffers.delete(filename));
    }
    return buffers.get(filename);
  }

  function mixMusic() {
    if (!context || !musicEnvelope) return;
    const target = speaking ? MUSIC_MIX.speech : Math.min(MUSIC_MIX.quiet, ...musicFocus.values());
    if (target === musicEnvelope.target) return;
    const now = context.currentTime;
    // Hold the actual exponential envelope when another sound interrupts its
    // release. Relying on AudioParam.value can jump on older WebKit versions.
    const elapsed = Math.max(0, now - musicEnvelope.at);
    const held = musicEnvelope.target + (musicEnvelope.value - musicEnvelope.target) * Math.exp(-elapsed / musicEnvelope.tau);
    const tau = target < held ? MUSIC_MIX.attack : MUSIC_MIX.release;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(held, now);
    musicBus.gain.setTargetAtTime(target, now, tau);
    musicEnvelope = { value: held, target, at: now, tau };
  }

  function duck(value) {
    speaking = value;
    if (!context) return;
    mixMusic();
    // Speech owns the foreground, but a tap must still confirm the child's action.
    // The short reward has its own bus; the controller leaves its first second clear.
    for (const [bus, volume] of [[ambienceBus, value ? 0.23 : 0.8], [effectsBus, value ? 0.76 : 1], [rewardBus, value ? 0.86 : 1]]) {
      bus.gain.cancelScheduledValues(context.currentTime);
      bus.gain.setTargetAtTime(volume, context.currentTime, 0.22);
    }
  }

  function noiseBuffer(kind = 'brown') {
    if (!noiseBuffers.has(kind)) {
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + 0.02 * white) / 1.02;
        // Foreground rustles need midrange energy on tablet/phone speakers.
        // Keep the softer brown texture for the continuous environmental bed.
        data[i] = kind === 'white' ? white : kind === 'warm' ? white * .55 + brown * 1.575 : brown * 3.5;
      }
      noiseBuffers.set(kind, buffer);
    }
    return noiseBuffers.get(kind);
  }

  function track(source, nodes, category, bus = effectsBus) {
    // A child can tap rapidly. Keep simultaneous sound and memory use bounded.
    if (sources.size >= 48) {
      // Low-priority nature/tap layers yield before an earned-star phrase.
      const oldest = [...sources].find(([, group]) => group !== 'celebration')?.[0] || sources.keys().next().value;
      stopTracked(oldest);
    }
    sources.set(source, category);
    if (bus !== ambienceBus && category !== 'ambience') {
      const priority = category === 'celebration' || category === 'animal' ? 'featured' : category === 'world-touch' ? 'touch' : category === 'movement' ? 'movement' : 'effect';
      musicFocus.set(source, MUSIC_MIX[priority]);
      mixMusic();
    }
    source.onended = () => {
      sources.delete(source); musicFocus.delete(source); mixMusic();
      source.disconnect(); for (const node of nodes) node.disconnect();
    };
  }

  function stopTracked(source) {
    try { source.stop(); } catch {}
    // Disconnect immediately; onended can be delayed while the context sleeps.
    source.onended?.();
    source.onended = null;
  }

  function outlet(volume, pan, bus) {
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      volume.connect(panner).connect(bus);
      return [panner];
    }
    volume.connect(bus);
    return [];
  }

  function envelope(param, at, duration, level, attack = 0.025, body = 0, sustain = .48) {
    param.setValueAtTime(0, at);
    param.linearRampToValueAtTime(level, at + Math.min(attack, duration * 0.3));
    if (body) param.linearRampToValueAtTime(level * sustain, at + duration * Math.max(.31, body));
    param.exponentialRampToValueAtTime(0.0001, at + duration);
  }

  function tone({ frequency = 440, end = frequency, duration = 0.3, level = 0.035, delay = 0, pan = 0, type = 'sine', bus, category = 'effect', attack = .012, body = .36, sustain = .48 } = {}) {
    bus ??= category === 'celebration' ? rewardBus : effectsBus;
    const at = context.currentTime + delay;
    const source = context.createOscillator(), volume = context.createGain();
    source.type = type; source.frequency.setValueAtTime(frequency, at);
    source.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + duration);
    const calibration = bus === ambienceBus ? 1 : category === 'celebration' ? 3.6 : category === 'world-touch' ? 2.8 : 3.2;
    envelope(volume.gain, at, duration, level * calibration, attack, bus === ambienceBus ? 0 : body, sustain);
    source.connect(volume);
    const extra = outlet(volume, pan, bus);
    track(source, [volume, ...extra], category, bus);
    source.start(at); source.stop(at + duration + 0.015);
  }

  function noise({ duration = 0.35, level = 0.035, frequency = 900, end = frequency, q = 0.7, type = 'lowpass', kind, delay = 0, pan = 0, attack = 0.04, bus, category = 'effect' } = {}) {
    bus ??= category === 'celebration' ? rewardBus : effectsBus;
    const at = context.currentTime + delay;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), volume = context.createGain();
    source.buffer = noiseBuffer(kind || (bus === ambienceBus ? 'brown' : 'warm')); source.loop = true;
    filter.type = type; filter.Q.value = q; filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, end), at + duration);
    const calibration = bus === ambienceBus ? 1 : category === 'world-touch' ? 3.4 : 3.8;
    envelope(volume.gain, at, duration, level * calibration, attack, bus === ambienceBus ? 0 : .42, .6);
    source.connect(filter).connect(volume);
    const extra = outlet(volume, pan, bus);
    track(source, [filter, volume, ...extra], category, bus);
    source.start(at, random(0, 1.5)); source.stop(at + duration + 0.02);
  }

  function stopTransient(category) {
    for (const [source, group] of sources) if (!category || category === group) stopTracked(source);
  }

  function allowed(key, gap) {
    if (!active() || !context) return false;
    if (context.currentTime - (lastEffects.get(key) ?? -Infinity) < gap) return false;
    lastEffects.set(key, context.currentTime);
    return true;
  }

  function bell(frequency, { delay = 0, level = .033, pan = 0, duration = .52, category = 'celebration' } = {}) {
    // Rounded body plus a quiet, fast upper partial: a toy glockenspiel, not a beep.
    tone({ frequency, duration, level, delay, pan, category });
    tone({ frequency: frequency * 2.003, end: frequency * 2, duration: duration * .36, level: level * .19, delay, pan, category });
  }

  function playAnimal(species, { mood = 'curious', pan = 0, category = 'animal', delay = 0 } = {}) {
    const voice = Object.hasOwn(ANIMAL_VOICES, species) ? ANIMAL_VOICES[species] : ANIMAL_VOICES.triceratops;
    const side = bounded(pan, 0, -.7, .7), happy = mood === 'happy';
    const pitch = random(.975, 1.025) * (happy ? 1.12 : 1), tempo = happy ? .86 : 1;
    const at = bounded(delay, 0, 0, 1.5), level = Math.min(.058, voice.level * 1.12);
    for (const [start, end, duration, offset] of voice.notes) {
      const common = { duration: duration * tempo, delay: at + offset * tempo, pan: side, category };
      tone({ frequency: start * pitch, end: end * pitch, level, type: 'triangle', attack: .045, body: .62, sustain: .72, ...common });
      // A resonant upper voice makes the large dinosaurs audible without sub-bass.
      const partial = start < 150 ? 4 : 2;
      tone({ frequency: start * pitch * partial * 1.003, end: end * pitch * partial, level: level * .65, attack: .035, body: .56, sustain: .65, ...common });
    }
    const duration = (voice.notes.at(-1)[3] + voice.notes.at(-1)[2]) * tempo;
    noise({ duration, level: species === 'trex' ? .05 : .028, frequency: voice.breath, end: voice.breath * .62, type: 'bandpass', q: .8, attack: .12, delay: at, pan: side, category });
    if (species === 'spinosaurus') {
      for (let i = 0; i < 3; i++) tone({ frequency: 380 + i * 85, end: 165 + i * 24, duration: .12, delay: at + .4 + i * .12, level: .014, pan: side, category });
    } else if (species === 'parasaurolophus') {
      tone({ frequency: 477 * pitch, end: 450 * pitch, duration: .68, delay: at + .18, level: .009, type: 'triangle', pan: side, category });
    }
    if (happy) bell(species === 'pteranodon' ? 1046.5 : 659.25, { delay: at + duration * .78, duration: .25, level: .012, pan: side, category });
  }

  function animal(species, options = {}) {
    const name = Object.hasOwn(ANIMAL_VOICES, species) ? species : 'triceratops';
    if (!allowed(`animal:${name}`, .85) || !allowed('animal', .28)) return false;
    playAnimal(name, options);
    return true;
  }

  function stopCelebration() { stopTransient('celebration'); }

  function star({ index = 0, total = 3, pan = 0 } = {}) {
    if (!allowed('star', .065)) return false;
    const count = Math.round(bounded(total, 3, 1, 6));
    const step = Math.round(bounded(index, 0, 0, count - 1));
    const frequency = STAR_NOTES[step];
    const side = bounded(pan, 0, -.7, .7);
    bell(frequency, { level: .026, duration: .36, pan: side });
    tone({ frequency: frequency * .5, end: frequency, duration: .1, level: .008, type: 'triangle', pan: side, category: 'celebration' });
    noise({ kind: 'white', type: 'bandpass', frequency: 2600, end: 1300, q: .8, duration: .1, level: .008, pan: side, category: 'celebration' });
    return true;
  }

  function celebrate({ species, final = false, stars = 3 } = {}) {
    if (!allowed('celebrate', .6)) return false;
    stopCelebration(); stopTransient('world-touch'); stopTransient('animal');
    const count = Math.round(bounded(stars, 3, 1, 6));
    const category = 'celebration';
    // Every note is scheduled on the AudioContext, with no wall-clock callbacks.
    // Pausing, hiding or changing the scene cancels this whole short phrase.
    // A short G-to-C "ta-dam" peaks while the large star is still at center.
    // Target taps have a single lighter bell; only an earned star gets this chord.
    for (const frequency of [196, 246.94, 293.66]) tone({ frequency, duration: .2, level: .018, type: 'triangle', category });
    for (const frequency of [261.63, 329.63, 392]) tone({ frequency, duration: .72, level: .029, delay: .24, type: 'triangle', category });
    noise({ duration: .46, level: .052, frequency: 450, end: 1800, attack: .09, delay: .21, category });
    tone({ frequency: 130.81, end: 130.81, duration: .5, delay: .24, level: .047, type: 'triangle', category });
    const notes = final ? [659.25, 783.99, 1046.5, 1318.51] : [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, i) => bell(frequency, { delay: .34 + i * .18, level: .034, duration: .6, pan: (i / (notes.length - 1) - .5) * .5 }));
    const resolveAt = 1.02;
    for (const frequency of [261.63, 329.63, 392]) tone({ frequency, duration: final ? 2.25 : 1.5, level: .014, delay: resolveAt, type: 'triangle', category });
    bell(final ? 1567.98 : 1046.5, { delay: resolveAt + .24, level: .022, duration: final ? 1.5 : .9 });
    if (final) {
      for (let i = 0; i < 3; i++) noise({ kind: 'white', type: 'bandpass', frequency: 1800, end: 900, duration: .19, level: .027, delay: 1.6 + i * .23, pan: (i - 1) * .35, category });
    }
    // A short friendly reply links the musical reward to the animal just found.
    if (Object.hasOwn(ANIMAL_VOICES, species)) playAnimal(species, { mood: 'happy', pan: -.18, delay: .7, category });
    // Small discoveries and the final six-star score have distinct last accents.
    if (count > 3) bell(STAR_NOTES[count - 1], { delay: final ? 2.45 : 1.4, level: .018, duration: .7, pan: .2 });
    return true;
  }

  function worldTouch(kind, { pan = 0 } = {}) {
    if (!Object.hasOwn(WORLD_TOUCH_GAPS, kind)) return false;
    if (!allowed('world-touch', .09) || !allowed(`world-touch:${kind}`, WORLD_TOUCH_GAPS[kind])) return false;
    // Surface exploration never steals voices from narration or a reward.
    // A swipe can touch many objects; retain at most eight tiny sound sources.
    const previous = [...sources].filter(([, category]) => category === 'world-touch');
    while (previous.length > 6) stopTracked(previous.shift()[0]);
    const common = { pan: bounded(pan, 0, -.65, .65), category: 'world-touch' };
    if (kind === 'grass') {
      noise({ kind: 'white', type: 'bandpass', frequency: 2400, end: 900, q: .7, duration: .24, level: .045, attack: .035, ...common });
    } else if (kind === 'tree') {
      tone({ frequency: 328, end: 246, duration: .17, level: .032, type: 'triangle', ...common });
      noise({ duration: .28, frequency: 1500, end: 650, level: .022, attack: .04, ...common });
    } else if (kind === 'path') {
      noise({ duration: .18, frequency: 1800, end: 700, level: .065, attack: .012, ...common });
    } else if (kind === 'water') {
      tone({ frequency: 430, end: 145, duration: .14, level: .022, ...common });
      noise({ duration: .32, frequency: 1400, end: 550, level: .03, attack: .022, ...common });
    } else if (kind === 'rock') {
      tone({ frequency: 560, end: 480, duration: .12, level: .03, type: 'triangle', ...common });
      noise({ kind: 'white', type: 'bandpass', frequency: 1800, end: 850, q: 1.4, duration: .07, level: .015, attack: .008, ...common });
    }
    return true;
  }

  function makeBed() {
    if (!context || currentBed || !active()) return;
    const source = context.createBufferSource(), filter = context.createBiquadFilter();
    const level = context.createGain(), modulation = context.createOscillator(), depth = context.createGain(), fade = context.createGain();
    source.buffer = noiseBuffer('brown'); source.loop = true;
    filter.type = 'lowpass'; filter.Q.value = 0.35;
    filter.frequency.value = scene === 'lake' ? 1100 : scene === 'sky' ? 1700 : 750;
    level.gain.value = scene === 'sky' ? 0.025 : 0.018;
    modulation.frequency.value = scene === 'lake' ? 0.21 : 0.11;
    depth.gain.value = scene === 'lake' ? 0.008 : 0.006;
    modulation.connect(depth).connect(level.gain);
    source.connect(filter).connect(level).connect(fade).connect(ambienceBus);
    fade.gain.setValueAtTime(0, context.currentTime);
    fade.gain.linearRampToValueAtTime(1, context.currentTime + 1.2);
    source.start(); modulation.start();
    const bed = { source, modulation, fade, nodes: [filter, level, depth, fade] };
    source.onended = () => {
      source.disconnect(); modulation.disconnect();
      for (const node of bed.nodes) node.disconnect();
      beds.delete(bed);
    };
    beds.add(bed); currentBed = bed;
  }

  function releaseBed(immediate = false) {
    if (!currentBed) return;
    const bed = currentBed; currentBed = null;
    const when = context.currentTime + (immediate ? 0 : 0.7);
    bed.fade.gain.cancelScheduledValues(context.currentTime);
    bed.fade.gain.setTargetAtTime(0, context.currentTime, immediate ? 0.001 : 0.13);
    try { bed.source.stop(when); bed.modulation.stop(when); } catch {}
  }

  function bird() {
    const pitch = random(1350, 1850), pan = random(-0.65, 0.65);
    for (let i = 0; i < 3; i++) tone({ frequency: pitch + i * 85, end: pitch * 1.26, duration: 0.11, level: 0.018, delay: i * 0.16, pan, bus: ambienceBus, category: 'ambience' });
  }

  function lap() {
    noise({ duration: 1.6, level: 0.055, frequency: 650, end: 1300, attack: 0.35, pan: random(-0.3, 0.3), bus: ambienceBus, category: 'ambience' });
    tone({ frequency: 410, end: 180, duration: 0.2, level: 0.012, delay: 0.55, pan: -0.2, bus: ambienceBus, category: 'ambience' });
  }

  function scheduleAmbience() {
    if (ambienceTimer || !active() || !context) return;
    ambienceTimer = setTimeout(() => {
      ambienceTimer = null;
      if (!active()) return;
      if (scene === 'lake') { lap(); if (Math.random() > 0.7) bird(); }
      else if (scene === 'sky') {
        noise({ duration: 1.1, level: 0.035, frequency: 1200, end: 600, attack: 0.2, pan: random(-0.5, 0.5), bus: ambienceBus, category: 'ambience' });
        if (Math.random() > 0.5) bird();
      } else if (Math.random() > 0.4) bird();
      else {
        noise({ duration: 1.4, level: 0.032, frequency: 1600, end: 550, attack: 0.25, pan: random(-0.7, 0.7), bus: ambienceBus, category: 'ambience' });
        for (let i = 0; i < 3; i++) noise({ kind: 'white', type: 'bandpass', frequency: 3900, q: 5, duration: 0.08, level: 0.015, delay: 0.8 + i * 0.17, bus: ambienceBus, category: 'ambience' });
      }
      scheduleAmbience();
    }, scene === 'lake' ? random(2600, 4400) : random(4300, 7600));
  }

  function footstep() {
    if (context.currentTime - lastStep < 0.25) return;
    lastStep = context.currentTime; stepSide = 1 - stepSide;
    const pan = stepSide ? 0.13 : -0.13;
    tone({ frequency: random(105, 125), end: 65, duration: 0.11, level: 0.047, pan, category: 'movement' });
    noise({ duration: 0.18, level: 0.09, frequency: scene === 'lake' ? 1100 : 850, end: 350, pan, attack: 0.008, category: 'movement' });
  }

  // The world emits these at the animal's actual position and foot/wing beats.
  // Distance builds gently as it approaches; no guessed roar recordings.
  function arrival({type, species, progress = 0, pan = 0} = {}) {
    if (!active() || !context) return;
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    const side = Math.max(-0.75, Math.min(0.75, Number(pan) || 0));
    const level = 0.35 + p * 0.65;
    const large = species === 'brachiosaurus' || species === 'trex';
    if (type === 'foreshadow') {
      if (species === 'pteranodon') {
        noise({duration:1.1, level:0.052, frequency:800, end:1800, attack:0.28, pan:side});
        tone({frequency:680, end:870, duration:0.22, level:0.019, delay:0.18, pan:side});
        tone({frequency:840, end:490, duration:0.32, level:0.015, delay:0.4, pan:side});
      } else {
        for (let i=0;i<3;i++) noise({kind:'white', type:'bandpass', q:0.5, duration:0.5, level:0.036, frequency:1700+i*300, end:1100, attack:0.08, delay:i*0.21, pan:side});
        if (large) tone({frequency:72, end:45, duration:0.55, level:0.038, delay:0.1, pan:side});
      }
    } else if (type === 'step') {
      const key='arrival-step';
      if(context.currentTime-(lastEffects.get(key)??-Infinity)<0.2)return;
      lastEffects.set(key,context.currentTime);
      tone({frequency:large?152:208,end:large?84:126,duration:large?0.22:0.15,level:(large?0.055:0.045)*level,pan:side,type:'triangle',category:'movement'});
      noise({duration:0.22,level:0.095*level,frequency:scene==='lake'?1550:900,end:380,attack:0.01,pan:side,category:'movement'});
      if(species==='spinosaurus') {
        noise({duration:0.37,level:0.07*level,frequency:2200,end:550,attack:0.035,delay:0.03,pan:side,category:'movement'});
        tone({frequency:380,end:155,duration:0.12,level:0.018*level,delay:0.12,pan:side,category:'movement'});
      }
    } else if (type === 'wing') {
      if (!allowed('arrival-wing', .15)) return;
      noise({duration:0.42,level:0.095*level,frequency:500,end:1450,attack:0.09,pan:side,category:'movement'});
      noise({duration:0.24,level:0.03*level,frequency:1900,end:700,attack:0.035,delay:0.13,pan:side,category:'movement'});
    } else if (type === 'settled') {
      animal(species, { pan: side });
    }
  }

  function scheduleSteps(immediate = false) {
    if (stepTimer || !walking || !active() || !context) return;
    if (immediate) footstep();
    stepTimer = setTimeout(() => {
      stepTimer = null;
      if (!walking || !active()) return;
      footstep(); scheduleSteps();
    }, STEP_SECONDS * 1000);
  }

  function clearSchedules() {
    clearTimeout(ambienceTimer); clearTimeout(stepTimer);
    ambienceTimer = stepTimer = null;
  }

  async function startBufferedMusic() {
    if (!context || musicSource || musicLoading || disposed) return;
    musicLoading = true;
    try {
      // Compatibility fallback only. Never decode the full six-minute stereo
      // score into a127–138MB AudioBuffer on a child's tablet.
      const buffer = await load('dream-culture.mp3');
      if (disposed) return;
      musicSource = context.createBufferSource(); musicSource.buffer = buffer;
      musicSource.loop = true; musicSource.connect(musicBus); musicSource.start();
      duck(speaking);
    } catch { /* The adventure works even if one sound file is unavailable. */ }
    finally { musicLoading = false; }
  }

  function releaseMusicElement() {
    if (!musicElement) return;
    const element = musicElement; musicElement = null; musicPlayPending = null;
    element.onerror = null; element.pause(); element.removeAttribute('src');
    // Release its network/media decoder as well as the WebAudio source node.
    element.load(); musicSource?.disconnect(); musicSource = null;
  }

  function fallbackMusic() {
    if (disposed || musicMediaFailed) return;
    musicMediaFailed = true; releaseMusicElement(); void startBufferedMusic();
  }

  function playMusicElement() {
    const element = musicElement;
    if (!element || !active() || !element.paused || musicPlayPending === element) return;
    musicPlayPending = element;
    const requestedEpoch = soundEpoch;
    let request;
    try {
      // Called synchronously by unlock/syncPlayback, inside the child's touch.
      // Do not put a fetch/await before this iOS media activation.
      request = element.play();
    } catch (error) { request = Promise.reject(error); }
    Promise.resolve(request).then(() => {
      if (disposed || musicElement !== element || !active()) element.pause();
    }).catch(error => {
      // Autoplay rejection or pause-abort can be retried on the next real touch.
      // A failed media decode uses the existing smaller local fallback instead.
      if (musicElement === element) {
        element.pause();
        if (['NotSupportedError', 'NetworkError', 'EncodingError'].includes(error?.name)) fallbackMusic();
      }
    }).finally(() => {
      if (musicPlayPending === element) musicPlayPending = null;
      // A pause/resume can overtake a pending play promise. Retry only that
      // interrupted request, never a perpetual autoplay-rejection loop.
      if (active() && musicElement === element && requestedEpoch !== soundEpoch && element.paused) playMusicElement();
    });
  }

  function startMusic() {
    if (!context || disposed) return;
    if (musicElement) { playMusicElement(); return; }
    if (musicSource || musicLoading) return;
    if (!musicMediaFailed && typeof globalThis.Audio === 'function' && context.createMediaElementSource) {
      try {
        musicElement = new globalThis.Audio();
        musicElement.preload = 'auto'; musicElement.loop = true; musicElement.playsInline = true;
        musicElement.src = new URL('little-dino-green-valley.mp3', AUDIO_ROOT).href;
        musicElement.onerror = fallbackMusic;
        musicSource = context.createMediaElementSource(musicElement); musicSource.connect(musicBus);
        playMusicElement();
        return;
      } catch { musicMediaFailed = true; releaseMusicElement(); }
    }
    void startBufferedMusic();
  }

  function syncPlayback() {
    if (!unlocked || disposed) return Promise.resolve(false);
    if (active()) {
      const resumed = context ? context.resume().then(() => true).catch(() => false) : Promise.resolve(Boolean(icelandicVoice()));
      if (utterance) synth?.resume();
      if (completion && !completion.timer) {
        completion.startedAt = performance.now();
        completion.timer = setTimeout(completion.guard, completion.remainingMs);
      }
      makeBed(); scheduleAmbience(); scheduleSteps(); void startMusic();
      return resumed;
    }
    soundEpoch++; clearSchedules(); stopTransient();
    musicElement?.pause();
    if (utterance) synth?.pause();
    if (completion?.timer) {
      completion.remainingMs = Math.max(1000, completion.remainingMs - (performance.now() - completion.startedAt));
      clearTimeout(completion.timer); completion.timer = null;
    }
    return context ? context.suspend().then(() => false).catch(() => false) : Promise.resolve(false);
  }

  function unlock() {
    if (disposed) return Promise.resolve(false);
    unlocked = true;
    if (!initialize()) return Promise.resolve(Boolean(icelandicVoice()));
    // resume() occurs directly during the first touch, before any awaited fetch.
    const resumed = syncPlayback();
    for (const name of Object.keys(SAMPLES)) void load(`sfx-${name}.mp3`).catch(() => {});
    return resumed;
  }

  function stopNarration() {
    generation++;
    if (speechSource) {
      speechSource.onended = null;
      try { speechSource.stop(); } catch {}
      speechSource.disconnect(); speechSource = null;
    }
    if (utterance) { utterance.onend = utterance.onerror = null; synth?.cancel(); utterance = null; }
    if (completion) { clearTimeout(completion.timer); completion.resolve(false); completion = null; }
    duck(false);
  }

  // Resolves on completion or cancellation, allowing the story to wait for Mosi.
  function narrate(id, text) {
    stopNarration();
    const request = generation;
    if (!active()) return Promise.resolve(false);
    return new Promise(resolve => {
      completion = { resolve, token: request, timer: null, guard: null, remainingMs: 60000, startedAt: performance.now() };
      const valid = () => request === generation && !muted && !disposed;
      const finish = result => {
        if (completion?.token !== request) return;
        clearTimeout(completion.timer); completion.resolve(result); completion = null; duck(false);
      };
      const timeout = () => {
        if (completion?.token !== request) return;
        if (!active()) { completion.timer = null; completion.remainingMs = 1000; return; }
        stopNarration();
      };
      completion.guard = timeout; completion.timer = setTimeout(timeout, completion.remainingMs);
      const begin = async () => {
        await manifestReady;
        if (!valid()) { finish(false); return; }
        const filename = recordings[id];
        if (filename && context) {
          try {
            const buffer = await load(filename);
            if (!valid()) { finish(false); return; }
            speechSource = context.createBufferSource(); speechSource.buffer = buffer; speechSource.connect(master);
            speechSource.onended = () => { if (request === generation) { speechSource = null; finish(true); } };
            duck(true); speechSource.start(); return;
          } catch { /* Only a verified Icelandic system voice is an acceptable fallback. */ }
        }
        const voice = icelandicVoice();
        if (!voice || !text || !valid() || !active()) { finish(false); return; }
        utterance = new SpeechSynthesisUtterance(text); utterance.voice = voice; utterance.lang = 'is-IS';
        utterance.rate = 0.9; utterance.pitch = 1.04; utterance.volume = 1;
        utterance.onend = () => { if (request === generation) { utterance = null; finish(true); } };
        utterance.onerror = () => { if (request === generation) { utterance = null; finish(false); } };
        duck(true); synth.speak(utterance);
      };
      void begin().catch(() => finish(false));
    });
  }

  async function effect(name) {
    if (!active() || !context) return;
    name = Object.hasOwn(EFFECT_ALIASES, name) ? EFFECT_ALIASES[name] : name;
    if (name === 'step') { footstep(); return; }
    const gap = EFFECT_GAPS[name];
    if (gap && context.currentTime - (lastEffects.get(name) ?? -Infinity) < gap) return;
    lastEffects.set(name, context.currentTime);
    if (name === 'tap') {
      // The existing click is a very brief transient. Give it a rounded audible
      // body, rather than turning its high peak up until it becomes a sharp snap.
      tone({ frequency: 620, end: 390, duration: .10, level: .024, type: 'triangle', body: .38 });
      tone({ frequency: 1160, end: 820, duration: .07, level: .009, body: .32 });
    }
    if (name === 'splash') {
      noise({ duration: 0.7, level: 0.14, frequency: 1400, end: 350, attack: 0.015 });
      for (let i = 0; i < 3; i++) tone({ frequency: 680 + i * 140, end: 300 + i * 80, duration: 0.15, level: 0.024, delay: 0.12 + i * 0.12, pan: (i - 1) * 0.15 });
      return;
    }
    if (name === 'wing' || name === 'launch') {
      for (let i = 0; i < 2; i++) noise({ duration: 0.28, level: 0.095, frequency: 650, end: 1600, attack: 0.07, delay: i * 0.22, pan: i ? 0.3 : -0.3 });
      return;
    }
    if (name === 'dino') {
      animal('triceratops', { mood: 'happy' });
      return;
    }
    if (name === 'fossil') {
      for (let i = 0; i < 2; i++) {
        tone({ frequency: i ? 783.99 : 523.25, end: i ? 650 : 420, duration: .16, level: .041, type: 'triangle', delay: i * .13, pan: i ? .12 : -.12 });
        noise({ kind: 'white', type: 'bandpass', frequency: 1500, end: 700, q: 1.3, duration: .1, level: .033, delay: i * .13 });
      }
      bell(1046.5, { delay: .25, level: .018, category: 'effect' });
      return;
    }
    if (name === 'leaf') {
      for (let i = 0; i < 2; i++) noise({ kind: 'white', type: 'bandpass', frequency: 2400 - i * 400, end: 900, q: .7, duration: .27, level: .032, attack: .035, delay: i * .13, pan: i ? .2 : -.2 });
      tone({ frequency: 392, end: 659.25, duration: .24, level: .03, delay: .06 });
      bell(783.99, { delay: .2, level: .019, category: 'effect' });
      return;
    }
    if (name === 'track') {
      for (let i = 0; i < 2; i++) {
        tone({ frequency: 155 + i * 40, end: 92, duration: .16, level: .04, delay: i * .2, pan: i ? .16 : -.16 });
        noise({ duration: .18, frequency: 850, end: 330, level: .06, attack: .01, delay: i * .2, pan: i ? .16 : -.16 });
      }
      bell(659.25, { delay: .34, level: .022, category: 'effect' });
      return;
    }
    if (name === 'echo') {
      [0, .24, .51].forEach((delay, i) => {
        tone({ frequency: 392, end: 440, duration: .38, level: .038 * Math.pow(.58, i), delay, type: 'triangle', pan: [0, -.32, .34][i] });
        tone({ frequency: 784, end: 880, duration: .25, level: .008 * Math.pow(.58, i), delay, pan: [0, -.32, .34][i] });
      });
      noise({ duration: .34, level: .025, frequency: 850, end: 500, type: 'bandpass', attack: .08 });
      return;
    }
    if (name === 'breeze') {
      noise({ duration: .67, level: .06, frequency: 700, end: 1700, attack: .15, pan: -.15 });
      [659.25, 783.99, 1046.5].forEach((frequency, i) => bell(frequency, { delay: .13 + i * .14, level: .017, duration: .35, pan: -.25 + i * .25, category: 'effect' }));
      return;
    }
    if (name === 'secret') {
      tone({ frequency: 196, end: 392, duration: .3, level: .032, type: 'triangle' });
      [783.99, 1046.5, 1318.51].forEach((frequency, i) => bell(frequency, { delay: .09 + i * .16, level: .031, duration: .58, pan: (i - 1) * .18, category: 'effect' }));
      noise({ kind: 'white', type: 'bandpass', frequency: 2500, end: 900, duration: .36, level: .021, attack: .08, delay: .15 });
      return;
    }
    if (name === 'discover' || name === 'success') {
      const notes = name === 'success' ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 783.99];
      notes.forEach((frequency, i) => tone({ frequency, duration: 0.52, level: 0.035, delay: i * 0.115, pan: (i - 1) * 0.08 }));
    }
    if (!(name in SAMPLES)) return;
    if (pendingSamples.has(name)) return;
    pendingSamples.add(name);
    const requestedAt = performance.now(), requestedEpoch = soundEpoch;
    try {
      const buffer = await load(`sfx-${name}.mp3`);
      // A slow first download must not release a burst of old taps later.
      if (!active() || requestedEpoch !== soundEpoch || performance.now() - requestedAt > 250) return;
      const source = context.createBufferSource(), volume = context.createGain();
      source.buffer = buffer; volume.gain.value = SAMPLES[name];
      source.connect(volume).connect(effectsBus); track(source, [volume], 'effect'); source.start();
    } catch { /* A missing effect must never stop a child's progress. */ }
    finally { pendingSamples.delete(name); }
  }

  function setScene(value) {
    if (!SCENES.has(value) || scene === value) return;
    scene = value; soundEpoch++;
    clearTimeout(ambienceTimer); ambienceTimer = null;
    stopCelebration(); stopTransient('animal'); stopTransient('world-touch'); stopTransient('ambience'); releaseBed();
    if (active() && context) { makeBed(); scheduleAmbience(); }
  }

  function setWalking(value) {
    const next = Boolean(value);
    if (walking === next) return;
    walking = next;
    if (!walking) { clearTimeout(stepTimer); stepTimer = null; }
    else scheduleSteps(true);
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (muted) stopNarration();
    if (context) master.gain.setTargetAtTime(muted ? 0 : 0.9, context.currentTime, 0.035);
    void syncPlayback();
  }

  function setPaused(value) { paused = Boolean(value); void syncPlayback(); }
  function visibilityChanged() { void syncPlayback(); }
  document.addEventListener('visibilitychange', visibilityChanged);

  function dispose() {
    if (disposed) return;
    stopNarration(); disposed = true;
    document.removeEventListener('visibilitychange', visibilityChanged);
    clearSchedules(); stopTransient();
    for (const bed of beds) { try { bed.source.stop(); bed.modulation.stop(); } catch {} }
    beds.clear(); currentBed = null;
    releaseMusicElement();
    try { musicSource?.stop?.(); } catch {}
    musicSource?.disconnect(); musicSource = null; musicFocus.clear();
    void context?.close().catch(() => {});
    buffers.clear(); noiseBuffers.clear(); lastEffects.clear(); pendingSamples.clear();
  }

  return {
    unlock, narrate, stopNarration, effect, arrival, animal, celebrate, star, worldTouch, stopCelebration, setScene, setWalking, setPaused, setMuted,
    isMuted: () => muted,
    hasNarration: () => Object.keys(recordings).length > 0 || Boolean(icelandicVoice()),
    dispose,
  };
}
