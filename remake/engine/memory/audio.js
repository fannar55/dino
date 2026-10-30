import { createAudioContext, createOutput } from '../audio/output.js';

// Exact tuning of remake/assets/audio/theme.json. Calls are imagined animal voices, not musical cues.
export const MEMORY_KEY = Object.freeze([524.28, 588.48, 660.55, 785.53, 881.73]);
const LIMIT = 24;
// Each pair found is a step higher (semitones above the first pair's chime): C, E and G major, a clear rise a child hears.
const CHIME_RISE = Object.freeze([0, 4, 7]);
const riseRate = nestIndex => 2 ** (CHIME_RISE[Math.max(0, Math.min(CHIME_RISE.length - 1, Math.floor(nestIndex) || 0))] / 12);
const MANIFEST_URL = new URL('../../assets/audio/memory/soundscape/manifest.json', import.meta.url);
const RECORDED_BASE = { leaf: .13, straw: .075, foot: .09, triceratops: .21, stegosaurus: .21, brontosaurus: .21 };
const MOTIFS = {
  triceratops: { duration: 0.59, pitch: 172, formants: [490, 1330], pulses: [[0.01, 0.22], [0.29, 0.25]], breath: 0.13 },
  stegosaurus: { duration: 0.49, pitch: 228, formants: [380, 1040], pulses: [[0.01, 0.15], [0.22, 0.24]], breath: 0.065 },
  brontosaurus: { duration: 0.75, pitch: 139, formants: [320, 880], pulses: [[0.01, 0.70]], breath: 0.035 },
};

/** Friendly, breathy voiced PCM: glottal harmonics shaped by two broad moving vocal resonances. */
function animalBuffer(context, spec) {
  // 22 kHz is ample for these warm infant voices. Precompute resonances so first-touch synthesis stays small.
  const rate = Math.min(context.sampleRate, 22050);
  const buffer = context.createBuffer(1, Math.ceil(rate * spec.duration), rate);
  const data = buffer.getChannelData(0);
  const weights = Array.from({ length: 33 }, (_, frame) => {
    const progress = frame / 32, row = new Float32Array(17), pitch = spec.pitch * (1.04 - 0.14 * progress);
    for (let h = 1; h <= 16; h++) {
      const resonance = spec.formants.reduce((sum, center, band) => sum
        + Math.exp(-0.5 * ((pitch * h - center * (1.05 - progress * 0.12)) / (band ? 250 : 150)) ** 2) * (band ? 0.38 : 1), 0);
      row[h] = 0.12 / h + resonance / Math.sqrt(h);
    }
    return row;
  });
  let phase = 0, seed = 67129, peak = 0, smoothNoise = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    let envelope = 0, progress = 0;
    for (const [start, length] of spec.pulses) {
      const p = (t - start) / length;
      if (p >= 0 && p <= 1) {
        // A soft breath attack and a long rounded ending, with a little chest flutter.
        envelope = Math.pow(Math.sin(Math.PI * p), 0.65) * (0.94 + 0.06 * Math.sin(t * 2 * Math.PI * 26));
        progress = p;
      }
    }
    const pitch = spec.pitch * (1.04 - 0.14 * progress + 0.018 * Math.sin(t * 2 * Math.PI * 7));
    phase += 2 * Math.PI * pitch / rate;
    let voice = 0;
    const row = weights[Math.round(progress * 32)];
    for (let h = 1; h <= 16; h++) voice += Math.sin(phase * h + h * 0.23) * row[h];
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    smoothNoise = smoothNoise * 0.6 + (seed / 4294967296 * 2 - 1) * 0.4;
    const sample = envelope * (voice * 0.38 + smoothNoise * spec.breath);
    data[i] = sample; peak = Math.max(peak, Math.abs(sample));
  }
  if (peak) for (let i = 0; i < data.length; i++) data[i] *= 0.7 / peak;
  return buffer;
}

function foleyBuffer(context, kind) {
  const duration = kind === 'foot' ? 0.095 : kind === 'straw' ? 0.27 : kind === 'gravel' ? 0.62 : kind === 'flutter' ? 0.52 : kind === 'wood' ? 0.48 : 0.24;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 873, low = 0;
  for (let i = 0; i < data.length; i++) {
    const p = i / data.length, t = i / context.sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 4294967296 * 2 - 1;
    low = low * 0.77 + white * 0.23;
    const envelope = Math.sin(Math.PI * p) ** 0.8 * Math.exp(-p * (kind === 'foot' ? 6 : 1.5));
    const grain = 0.65 + 0.35 * Math.sin(t * 2 * Math.PI * (kind === 'straw' ? 37 : 23)) ** 2;
    data[i] = kind === 'wood'
      ? envelope * (low * 0.55 + Math.sin(2 * Math.PI * (104 * t + 9 * t * t)) * 0.19 + Math.sin(t * 2 * Math.PI * 213) * 0.08) * (0.75 + 0.25 * Math.sin(t * 2 * Math.PI * 19))
      : kind === 'gravel'
      ? envelope * (low * 0.8 + white * 0.12) * (0.25 + 0.75 * Math.sin(t * 2 * Math.PI * 31) ** 8)
      : kind === 'flutter'
        ? envelope * (white - low) * Math.sin(t * 2 * Math.PI * 13) ** 2 * 0.3
        : kind === 'foot'
      ? envelope * (Math.sin(2 * Math.PI * (145 * t - 260 * t * t)) * 0.7 + low * 0.3)
      : envelope * (white - low) * grain * 0.6;
  }
  return buffer;
}

// Two offset noise beds crossfade around a periodic envelope. The endpoints
// join continuously, so the quiet water loop has no recurring click or gap.
function riverBuffer(context) {
  const rate = Math.min(context.sampleRate, 22050), count = rate * 6;
  const buffer = context.createBuffer(1, count, rate), data = buffer.getChannelData(0);
  const noise = new Float32Array(count); let seed = 251025, low = 0;
  for (let i = 0; i < count; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    low = low * .78 + (seed / 4294967296 * 2 - 1) * .22;
    noise[i] = low;
  }
  for (let i = 0; i < count; i++) {
    const blend = .5 - .5 * Math.cos(i / count * Math.PI * 2);
    data[i] = (noise[i] * blend + noise[(i + count / 2) % count] * (1 - blend)) * .65;
  }
  return buffer;
}

/** Starts silently. unlock() must be called from the player's gesture. All scheduling uses the audio clock. */
export function createMemoryAudio({ manifestUrl = MANIFEST_URL, fetcher = globalThis.fetch } = {}) {
  let context = null, output = null, muted = false, paused = false, disposed = false, unlocked = false;
  let played = 0, dropped = 0, callUntil = 0, lastRockAt = -Infinity, riverVoice = null, ducked = false;
  let preloadPromise = null, decodePromise = null, loadController = null, recordedPlayed = 0;
  const voices = new Set(), buffers = {}, log = [], bridgeTimes = new Map();
  const recordingBytes = new Map(), recordings = new Map(), recordingFailed = new Set(), recordingMeta = new Map();
  const allowed = () => Boolean(context && unlocked && !muted && !paused && !disposed);

  async function decodeRecordings() {
    if (!context || disposed) return false;
    if (!decodePromise) decodePromise = Promise.all([...recordingBytes].map(async ([id, bytes]) => {
      try {
        const buffer = await context.decodeAudioData(bytes.slice(0));
        if (!disposed && buffer.duration > 0 && buffer.duration <= 30) recordings.set(id, buffer);
        else if (!disposed) recordingFailed.add(id);
      } catch { if (!disposed) recordingFailed.add(id); }
      finally { recordingBytes.delete(id); }
    })).then(() => recordings.size > 0);
    return decodePromise;
  }

  // Fetching is silent and does not construct/wake an AudioContext. Decode only
  // after unlock; completion never replays an old event or restarts a loop.
  function preload() {
    if (!manifestUrl || !fetcher || disposed) return Promise.resolve(false);
    if (!preloadPromise) preloadPromise = (async () => {
      loadController = new AbortController();
      const timeout = setTimeout(() => loadController?.abort(), 15000);
      try {
        const response = await fetcher(String(manifestUrl), { signal: loadController.signal });
        if (!response.ok) throw new Error('manifest unavailable');
        const manifest = await response.json();
        const entries = Object.entries(manifest.sfx || {}).filter(([, entry]) => typeof entry.file === 'string' && entry.duration > 0 && entry.duration <= 30).slice(0, 24);
        await Promise.all(entries.map(async ([id, entry]) => {
          try {
            const response = await fetcher(new URL(entry.file, manifestUrl).href, { signal: loadController.signal });
            if (!response.ok) throw new Error('recording unavailable');
            const bytes = await response.arrayBuffer();
            if (!disposed && bytes.byteLength > 0) { recordingBytes.set(id, bytes); recordingMeta.set(id, entry); }
          } catch { if (!disposed) recordingFailed.add(id); }
        }));
      } catch { if (!disposed) recordingFailed.add('manifest'); }
      finally { clearTimeout(timeout); }
      return recordingBytes.size > 0;
    })();
    return preloadPromise.then(() => decodeRecordings());
  }

  function initialize() {
    if (disposed) return false;
    if (!context) {
      context = createAudioContext();
      if (!context) return false;
      output = createOutput(context);
      output.gain.value = ducked ? .495 : .9;
      for (const [name, spec] of Object.entries(MOTIFS)) buffers[name] = animalBuffer(context, spec);
      for (const name of ['leaf', 'straw', 'foot', 'gravel', 'flutter', 'wood']) buffers[name] = foleyBuffer(context, name);
      buffers.effort = animalBuffer(context, { duration: 0.29, pitch: 158, formants: [450, 1140], pulses: [[0.01, 0.25]], breath: 0.18 });
    }
    return true;
  }

  function record(entry) { log.push(entry); if (log.length > 48) log.shift(); }
  function connectVoice(source, { at, duration, level, pan = 0, cutoff = 3200, kind, species, asset, sourceType = 'synth' }) {
    if (!allowed() || voices.size >= LIMIT) { dropped++; return false; }
    const gain = context.createGain(), filter = context.createBiquadFilter(), panner = context.createStereoPanner();
    filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.65;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + Math.min(0.025, duration / 4));
    gain.gain.setValueAtTime(Math.max(0.0002, level), at + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    panner.pan.value = Math.max(-0.6, Math.min(0.6, pan));
    source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(output);
    const voice = { source, nodes: [source, filter, gain, panner], clean: false };
    function cleanup() {
      if (voice.clean) return;
      voice.clean = true; voices.delete(voice);
      for (const node of voice.nodes) node.disconnect();
    }
    voice.cleanup = cleanup; source.onended = cleanup; voices.add(voice);
    source.start(at); source.stop(at + duration + 0.015); played++;
    if (sourceType === 'recorded') recordedPlayed++;
    record({ kind, ...(species ? { species } : {}), ...(asset ? { asset } : {}), source: sourceType, start: at, end: at + duration, pan: panner.pan.value });
    return true;
  }

  function recording(id, at, pan = 0, kind = id, scale = 1, rate = 1, cutoff = 11000) {
    if (!recordings.has(id)) return false;
    if (!allowed() || voices.size >= LIMIT) { dropped++; return false; }
    const source = context.createBufferSource(); source.buffer = recordings.get(id); source.playbackRate.value = rate;
    return connectVoice(source, { at, duration: source.buffer.duration / rate, level: (recordingMeta.get(id)?.gain ?? .6) * scale,
      pan, cutoff, kind, species: MOTIFS[id] ? id : undefined, asset: id, sourceType: 'recorded' });
  }

  function sample(name, at, level, pan = 0, kind = name) {
    if (recordings.has(name)) return recording(name, at, pan, kind, level / (RECORDED_BASE[name] || level || 1), 1, name === 'foot' ? 2600 : 10000);
    if (!allowed() || voices.size >= LIMIT) { dropped++; return false; }
    const source = context.createBufferSource(); source.buffer = buffers[name];
    return connectVoice(source, { at, duration: source.buffer.duration ?? source.buffer.length / context.sampleRate,
      level, pan, kind, species: MOTIFS[name] ? name : undefined, cutoff: name === 'foot' ? 800 : 3400 });
  }

  function note(hz, at, duration, level) {
    if (!allowed() || voices.size >= LIMIT) { dropped++; return false; }
    const source = context.createOscillator(); source.type = 'sine'; source.frequency.value = hz;
    return connectVoice(source, { at, duration, level, cutoff: 2400, kind: 'note' });
  }

  function call(species, index, delay = 0.075) {
    if (!allowed() || !MOTIFS[species]) return false;
    const now = context.currentTime, at = Math.max(now + delay, callUntil + 0.045);
    // Rapid taps can queue the next answer, but cannot build seconds of stale animal chatter.
    if (at - now > 1.2) { dropped++; return false; }
    const pan = ((Number.isFinite(index) ? index : 1) % 3 - 1) * 0.27;
    const accepted = sample(species, at, 0.21, pan, 'call');
    if (accepted) callUntil = at + (recordings.get(species)?.duration ?? MOTIFS[species].duration);
    return accepted;
  }

  function cancel() {
    stopRiver();
    for (const voice of [...voices]) {
      try { voice.source.stop(context.currentTime); } catch {}
      voice.cleanup();
    }
    callUntil = context?.currentTime ?? 0;
    lastRockAt = -Infinity;
    bridgeTimes.clear();
  }

  function stopRiver() {
    if (!riverVoice) return;
    try { riverVoice.source.stop(context.currentTime); } catch {}
    for (const node of riverVoice.nodes) node.disconnect();
    riverVoice = null;
  }

  function river(active, duck = false) {
    if (!active || !allowed()) { stopRiver(); return false; }
    if (riverVoice && riverVoice.recorded !== recordings.has('river')) stopRiver();
    if (!riverVoice) {
      if (!recordings.has('river')) buffers.river ||= riverBuffer(context);
      const source = context.createBufferSource(), filter = context.createBiquadFilter();
      const gain = context.createGain(), pan = context.createStereoPanner();
      source.buffer = recordings.get('river') || buffers.river; source.loop = true;
      if (recordings.has('river')) { source.loopStart = 0; source.loopEnd = Math.min(source.buffer.duration, recordingMeta.get('river').loopEnd || source.buffer.duration); }
      filter.type = 'lowpass'; filter.frequency.value = recordings.has('river') ? 6500 : 1700; filter.Q.value = .45;
      gain.gain.value = 0; pan.pan.value = .22;
      source.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(output);
      source.start(); riverVoice = { source, gain, nodes: [source, filter, gain, pan], duck: null, recorded: recordings.has('river') };
    }
    if (riverVoice.duck !== duck) {
      const level = riverVoice.recorded ? (recordingMeta.get('river').gain ?? .5) : .12;
      riverVoice.gain.gain.setTargetAtTime(duck ? level * .375 : level, context.currentTime, .35);
      riverVoice.duck = duck;
    }
    return true;
  }

  function bridgeCue(kind, schedule) {
    if (!allowed()) return false;
    const now = context.currentTime;
    if (now - (bridgeTimes.get(kind) ?? -Infinity) < 0.25) return false;
    bridgeTimes.set(kind, now); schedule(now); return true;
  }

  function effort(now, level = 0.11) {
    const at = Math.max(now + 0.04, callUntil + 0.045);
    if (at - now <= 1.2 && sample('effort', at, level, 0, 'effort')) callUntil = at + 0.29;
  }

  function wake() {
    if (!allowed()) return Promise.resolve(false);
    return context.resume().then(() => {
      // A pause/mute can arrive while a browser is still resolving the unlock gesture.
      if (!allowed()) { if (context.state !== 'closed') return context.suspend().then(() => false, () => false); return false; }
      return context.state === 'running';
    }, () => false);
  }

  return {
    river, preload,
    duck(value) {
      const next = Boolean(value); if (next === ducked) return;
      ducked = next;
      if (context && output && !disposed) output.gain.setTargetAtTime(ducked ? .495 : .9, context.currentTime, .12);
    },
    footstep(surface = 'earth', pan = 0) {
      return bridgeCue('footstep', now => {
        if (recordings.has('foot')) recording('foot', now, pan, 'footstep', .8, surface === 'wood' ? 1.08 : 1, surface === 'wood' ? 6500 : 2400);
        else sample('foot', now, .07, pan, 'footstep');
      });
    },
    unlock() {
      if (disposed || muted || paused) return Promise.resolve(false);
      unlocked = true;
      if (!initialize()) return Promise.resolve(false);
      void preload(); return wake();
    },
    reveal(species, index) {
      if (!allowed()) return false;
      sample('leaf', context.currentTime, 0.13, ((index % 3) - 1) * 0.27);
      return call(species, index);
    },
    conceal() {
      if (!allowed()) return false;
      return sample('leaf', context.currentTime, 0.085, 0);
    },
    // A tapped leaf squashed flat.
    poof() {
      if (!allowed()) return false;
      const now = context.currentTime;
      if (recordings.has('poof')) return recording('poof', now, 0, 'poof');
      return sample('leaf', now, .1, 0, 'poof');
    },
    // A wrong pair closing under its leaves.
    bonk() {
      if (!allowed()) return false;
      const now = context.currentTime;
      if (recordings.has('bonk')) return recording('bonk', now, 0, 'bonk');
      return sample('wood', now, .11, 0, 'bonk');
    },
    // A surprise lands in the basket.
    ding() {
      if (!allowed()) return false;
      const at = Math.max(context.currentTime, callUntil + .02);
      if (recordings.has('ding')) return recording('ding', at, .1, 'ding');
      return note(MEMORY_KEY[4], at, .5, .03);
    },
    // Baby dinosaurs giggling: a wrong pair ducking under its leaves, a wrong friend's funny go.
    giggle() {
      if (!allowed()) return false;
      const now = context.currentTime;
      if (recordings.has('giggle')) return recording('giggle', Math.min(now + .5, Math.max(now, callUntil)), .05, 'giggle');
      [3, 4, 3, 4].forEach((n, i) => note(MEMORY_KEY[n] * (i % 2 ? 1.12 : 1), now + i * .085, .07, .016));
      return true;
    },
    // A pair pushing hard at a tap of the tap-along (the strain gesture).
    strain() {
      if (!allowed()) return false;
      const now = context.currentTime;
      if (recordings.has('strain')) return recording('strain', now, 0, 'strain');
      effort(now, .1);
      return true;
    },
    match(species, nestIndex = 0) {
      if (!allowed()) return false;
      const now = context.currentTime, pan = (nestIndex % 3 - 1) * 0.27;
      // The animal's identifying answer finishes before the musical acknowledgement.
      const chordAt = Math.max(now + 0.02, callUntil + 0.025), rise = riseRate(nestIndex);
      if (recordings.has('match-chime')) recording('match-chime', chordAt, pan, 'match-chime', 1, rise);
      else [0, 2, 3].forEach((n, i) => note(MEMORY_KEY[n] / 2 * rise, chordAt + i * 0.055, 0.45, 0.025));
      [0.08, 0.25, 0.43, 0.61].forEach((delay, i) => sample('foot', now + delay, 0.09, pan + (i % 2 ? 0.05 : -0.05)));
      sample('straw', now + 0.79, 0.075, pan);
      return true;
    },
    win() {
      if (!allowed()) return false;
      const at = Math.max(context.currentTime + 0.04, callUntil + 0.045);
      if (recordings.has('win')) recording('win', at, 0, 'win');
      else [0, 2, 3, 4, 3].forEach((n, i) => note(MEMORY_KEY[n] / 2, at + i * 0.14, 0.65, 0.035));
      return true;
    },
    nest(species, index) {
      if (!allowed()) return false;
      sample('straw', context.currentTime, 0.075);
      return call(species, index, 0.04);
    },
    rockPush() {
      if (!allowed() || context.currentTime - lastRockAt < 0.25) return false;
      const now = context.currentTime; lastRockAt = now;
      sample('gravel', now + 0.025, 0.23, 0, 'rock-push');
      sample('foot', now + 0.09, 0.075, -0.12);
      sample('foot', now + 0.24, 0.075, 0.12);
      const effortAt = Math.max(now + 0.04, callUntil + 0.045);
      if (effortAt - now <= 1.2 && sample('effort', effortAt, 0.14, 0, 'effort')) callUntil = effortAt + 0.29;
      return true;
    },
    rockComplete(id) {
      if (!allowed() || !['home', 'butterfly'].includes(id)) return false;
      const now = context.currentTime;
      sample('foot', now, 0.075, 0, 'rock-settle');
      if (id === 'butterfly') sample('flutter', now + 0.12, 0.16, 0.2, 'butterfly-flutter');
      const at = Math.max(now + 0.06, callUntil + 0.045);
      note(MEMORY_KEY[id === 'home' ? 0 : 2] / 2, at, 0.4, 0.02);
      note(MEMORY_KEY[id === 'home' ? 3 : 4] / 2, at + 0.11, 0.45, 0.018);
      return true;
    },
    branchLift: () => bridgeCue('branch-lift', now => {
      if (recordings.has('branch-lift')) { recording('branch-lift', now, .1); return; }
      sample('leaf', now, 0.075, 0.15, 'branch-leaves');
      sample('wood', now + 0.05, 0.13, 0.1, 'branch-lift');
      effort(now, 0.1);
    }),
    branchLower: () => bridgeCue('branch-lower', now => {
      if (recordings.has('branch-lower')) { recording('branch-lower', now, .1); return; }
      sample('wood', now, 0.09, 0.1, 'branch-lower');
      sample('leaf', now + 0.17, 0.065, 0.15, 'branch-leaves');
    }),
    logRoll: () => bridgeCue('log-roll', now => {
      if (recordings.has('log-roll')) { recording('log-roll', now, -.1); return; }
      sample('gravel', now, 0.16, -0.1, 'log-roll');
      sample('wood', now + 0.04, 0.14, -0.1, 'rolling-wood');
      sample('foot', now + 0.15, 0.065, -0.15);
      sample('foot', now + 0.34, 0.065, 0.05);
      effort(now, 0.12);
    }),
    bridgeLand: () => bridgeCue('bridge-land', now => {
      if (recordings.has('bridge-land')) { recording('bridge-land', now); return; }
      sample('wood', now, 0.19, 0, 'bridge-land');
      sample('foot', now + 0.02, 0.1, 0, 'bridge-settle');
      sample('straw', now + 0.09, 0.065, 0);
    }),
    stagingArrival: () => bridgeCue('staging-arrival', now => {
      if (recordings.has('match-chime')) { recording('match-chime', Math.max(now, callUntil + .025), 0, 'staging-arrival', .7); return; }
      sample('foot', now, .085, -.12, 'staging-arrival');
      sample('straw', now + .12, .06, .12);
      note(MEMORY_KEY[2] / 2, now + .2, .42, .018);
    }),
    barkPickup: () => bridgeCue('bark-pickup', now => {
      if (recordings.has('bark-pickup')) { recording('bark-pickup', now, -.1); return; }
      sample('wood', now, .105, -.14, 'bark-pickup');
      sample('straw', now + .13, .07, .14, 'bark-rustle');
      effort(now, .07);
    }),
    barkPlace: panel => bridgeCue(`bark-place-${panel}`, now => {
      if (recordings.has('bark-place')) { recording('bark-place', now, .08); return; }
      sample('wood', now, .145, .08, 'bark-place');
      sample('foot', now + .045, .075, -.08, 'bark-settle');
      sample('leaf', now + .12, .05, .1);
      note(MEMORY_KEY[[0, 2, 3][Math.max(0, Math.min(2, panel || 0))]] / 2, now + .18, .4, .017);
    }),
    boardwalkComplete: () => bridgeCue('boardwalk-complete', now => {
      if (recordings.has('match-chime')) { recording('match-chime', Math.max(now, callUntil + .025), 0, 'boardwalk-complete', .8); return; }
      sample('straw', now, .06, 0, 'boardwalk-complete');
      [2, 3, 4].forEach((n, i) => note(MEMORY_KEY[n] / 2, now + .08 + i * .12, .5, .02));
    }),
    berryArrival: () => bridgeCue('berry-arrival', now => {
      if (recordings.has('straw')) { recording('leaf', now, .1, 'berry-leaves', .6); recording('straw', now + .12, 0, 'berry-arrival'); return; }
      sample('leaf', now, 0.075, 0.1, 'berry-leaves');
      sample('straw', now + 0.12, 0.065, 0, 'berry-arrival');
      const at = Math.max(now + 0.06, callUntil + 0.045);
      [0, 2, 3].forEach((n, i) => note(MEMORY_KEY[n] / 2, at + i * 0.12, 0.5, 0.025));
    }),
    mute(value) {
      if (disposed) return;
      muted = Boolean(value);
      if (muted) { cancel(); context?.suspend().catch(() => {}); }
      else if (!paused) void wake();
    },
    pause(value) {
      if (disposed) return;
      paused = Boolean(value);
      if (paused) { cancel(); context?.suspend().catch(() => {}); }
      else if (!muted) void wake();
    },
    cancel,
    dispose() {
      if (disposed) return;
      disposed = true; cancel(); output?.disconnect(); context?.close().catch(() => {});
      loadController?.abort(); recordingBytes.clear(); recordings.clear(); recordingMeta.clear();
      for (const name of Object.keys(buffers)) delete buffers[name];
    },
    getStats: () => ({ voices: voices.size, voiceLimit: LIMIT, played, dropped, muted, paused, disposed, ducked, riverPlaying: Boolean(riverVoice), riverSource: riverVoice ? (riverVoice.recorded ? 'recorded' : 'synth') : null,
      recordedLoaded: recordings.size, recordedFetched: recordingBytes.size, recordedFailed: [...recordingFailed], recordedPlayed,
      state: context?.state ?? 'uninitialized', callUntil, key: [...MEMORY_KEY], log: log.map(entry => ({ ...entry })) }),
  };
}
