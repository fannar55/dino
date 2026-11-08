// Local media playback only. Generation credentials never enter the browser.
const defaultFetch = (...args) => fetch(...args);
const defaultElement = () => new Audio();
const clamp = value => Math.max(0, Math.min(1, value));

export function createMemoryMusic({ fetcher = defaultFetch, makeAudio = defaultElement } = {}) {
  const manifestURL = new URL('../../assets/audio/memory/soundscape/manifest.json', import.meta.url);
  const element = makeAudio();
  element.preload = 'auto'; element.loop = true; element.volume = 0;
  let unlocked = false, muted = false, paused = true, disposed = false, blocked = false;
  let requested = false, failed = false, loaded = false, starts = 0, normal = .35, quiet = .12, target = 0;
  let revision = 0, source = 'fallback', stage = 'glade';
  function sync() {
    if (!loaded || !unlocked || muted || paused || failed || disposed) { element.pause(); requested = false; return; }
    if (requested) return;
    requested = true; const token = revision;
    Promise.resolve(element.play()).then(() => {
      if (token !== revision) return;
      if (muted || paused || disposed) { element.pause(); requested = false; return; }
      blocked = false; starts++;
    }, () => { requested = false; blocked = true; });
  }
  const ready = fetcher(manifestURL).then(response => response.ok ? response.json() : null).then(manifest => {
    const music = manifest?.music;
    element.src = music?.file ? new URL(music.file, manifestURL).href : new URL('../../assets/audio/theme.mp3', import.meta.url).href;
    if (music) { normal = clamp(music.gain ?? .35); quiet = clamp(music.duckGain ?? .12); source = manifest.provider ?? 'recorded'; }
    loaded = true; sync();
  }).catch(() => {
    element.src = new URL('../../assets/audio/theme.mp3', import.meta.url).href; loaded = true; sync();
  });
  element.addEventListener('error', () => { failed = true; requested = false; });
  return {
    ready,
    unlock() { unlocked = true; sync(); },
    mute(value) { value = Boolean(value); if (value !== muted) revision++; muted = value; if (muted) element.volume = 0; sync(); },
    pause(value) { value = Boolean(value); if (value !== paused) revision++; paused = value; sync(); },
    restart() { revision++; element.pause(); element.currentTime = 0; element.volume = 0; requested = false; sync(); },
    update(dt, { speech = false, action = false, stage: nextStage = 'glade' } = {}) {
      stage = nextStage;
      target = muted || paused || disposed ? 0 : speech ? quiet : normal * (action ? .82 : stage === 'grove' ? 1 : .94);
      // Keep the theme present through action; only speech receives a deep duck.
      element.volume = clamp(element.volume + (target - element.volume) * (1 - Math.exp(-Math.max(0, dt) * (speech ? 8 : 2))));
    },
    dispose() { disposed = true; revision++; element.pause(); element.src = ''; },
    getStats: () => ({ source, loaded, muted, paused, blocked, failed, playing: !element.paused, position: element.currentTime || 0, volume: element.volume, target, stage, starts }),
  };
}

/** One voice, one pending instruction and a game-clock delay. No stale timeout
 * may speak over a new action, a restart, or a hidden tab.
 * `counts` (id -> { src, duration, mouth }: voice-lines.js COUNT_TAKES) are his counts of a tap-along's beats, said through the same voice
 * (his mouth moves with them and the page's sounds dip under them) by `count(id)`, now or never. */
export function createMemorySpeech({ fetcher = defaultFetch, makeAudio = defaultElement, clock = () => 0, counts = {} } = {}) {
  const manifestURL = new URL('../../assets/audio/memory/manifest.json', import.meta.url);
  const element = makeAudio(); element.preload = 'auto'; element.volume = .74;
  let manifest = {}, muted = false, paused = true, pending = null, current = null, disposed = false;
  let duringDialog = false, forcePaused = false, blocked = false, revision = 0, played = 0, last = null;
  // started: every line that began, with the game clock, the wall clock (`at`, ms), its file and, once it was cut off, when (`cut`, ms) and
  // by which line (`cutBy`, none for a plain stop): QA reads it (the playthrough lays each line under its video from `at` until `cut` or
  // the next line, as the one voice plays it, and fails a run where a count cut a sentence)
  const seen = new Set(), errors = [], started = [];
  let log = null; // the entry of `started` for the line now playing
  const ready = fetcher(manifestURL).then(r => r.ok ? r.json() : {}).then(data => { manifest = data; }).catch(() => {});
  function stop(by = null) {
    if (current && log && !log.cut) { log.cut = Date.now(); if (by) log.cutBy = by; }
    revision++; pending = null; element.pause(); element.currentTime = 0; current = null; duringDialog = false; log = null;
  }
  function resume() {
    if (!current || muted || disposed || forcePaused || paused && !duringDialog) return;
    const token = revision;
    Promise.resolve(element.play()).then(() => {
      if (token !== revision) return;
      if (muted || disposed || forcePaused || paused && !duringDialog) { element.pause(); return; }
      blocked = false;
    }, () => { if (token === revision) blocked = true; });
  }
  function begin(id, entry, inDialog, count = false) {
    current = { id, ...entry, count }; duringDialog = inDialog;
    element.src = new URL(`../../${current.src}`, import.meta.url).href;
    played++; last = { id, n: played }; log = { id, t: +clock().toFixed(2), at: Date.now(), src: current.src };
    started.push(log); if (started.length > 200) started.shift(); resume();
  }
  function play(id, seconds = 0, inDialog = false) {
    if (disposed || muted || forcePaused || paused && !inDialog || !manifest[id]) return false;
    stop(id);
    if (seconds > 0) { pending = { id, remaining: seconds, inDialog }; return true; }
    begin(id, manifest[id], inDialog); return true;
  }
  // A count of a tap-along's beat («Einn!»): now or never. It may cut the count before it (fast taps), but never starts over a sentence of
  // his, one playing or one waiting to play (that beat stays silent), and it is never queued: a count that cannot play now is dropped.
  function count(id) {
    if (disposed || muted || forcePaused || paused || !counts[id]) return false;
    if (pending || current && !current.count && !element.paused) return false;
    stop(id); begin(id, counts[id], false, true); return true;
  }
  element.addEventListener('ended', () => { current = null; duringDialog = false; log = null; });
  element.addEventListener('error', () => { if (current) errors.push(current.id); current = null; log = null; });
  return {
    ready, play, count, stop: () => stop(),
    // (`once`: said once in a round. It counts as said when it begins, so a line dropped before it began (a tap's stop, another line)
    // is queued again when its moment comes back: a wait's line that a leaf cut off is said when the child comes back to the wait)
    queue(id, { delay = .35, once = true } = {}) {
      if (muted || disposed || !manifest[id] || once && seen.has(id)) return false;
      pending = { id, remaining: delay, inDialog: false, once }; return true;
    },
    update(dt, waitingForCamera = false) {
      if (disposed || muted || paused || waitingForCamera || !pending || current && !element.paused) return;
      pending.remaining -= Math.max(0, dt);
      if (pending.remaining <= 0) { const next = pending; pending = null; if (play(next.id, 0, next.inDialog) && next.once) seen.add(next.id); }
    },
    mute(value) { muted = Boolean(value); if (muted) stop(); },
    pause(value, { force = false } = {}) { paused = Boolean(value); forcePaused = Boolean(force); if (forcePaused || paused && !duringDialog) { revision++; element.pause(); } else resume(); },
    reset() { stop(); seen.clear(); blocked = false; },
    lastStarted: () => last ? { ...last } : null,
    isPlaying: () => Boolean(current && !element.paused),
    amplitude: () => current && !element.paused ? parseInt(current.mouth?.[Math.floor(element.currentTime * 20)] || '0', 16) / 15 : 0,
    dispose() { stop(); disposed = true; element.src = ''; },
    getStats: () => ({ muted, paused, forcePaused, blocked, playing: Boolean(current && !element.paused), current: current?.id ?? null, pending: pending?.id ?? null, played, started: started.slice(), loaded: Object.keys(manifest).length, errors: [...errors] }),
  };
}
