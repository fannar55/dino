// A stand-in for the Web Audio API, so the music and the sound effects can be tested in Node. It builds
// the same graph the browser would (every node a module creates, what it is connected to, when its
// sources start and stop) and it evaluates parameter automation the way the specification says, so a
// test asks "what was the gain 0.3 s after the duck?" instead of counting calls. Time stands still until
// a test moves it with advance(), as an audio context's does while it is asleep.

export class FakeParam {
  constructor(context, value = 0) {
    this.context = context;
    this.initial = value;
    this.events = []; // { type: 'set' | 'linear' | 'exponential' | 'target', time, value, tau }, in time order
  }

  // Setting .value is setValueAtTime(value, now), and reading it gives the value now, as in a browser.
  get value() { return this.valueAt(this.context.currentTime); }
  set value(value) { this.setValueAtTime(value, this.context.currentTime); }

  insert(event) {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].time > event.time) i--;
    this.events.splice(i, 0, event);
    return this;
  }

  setValueAtTime(value, time) { return this.insert({ type: 'set', value, time }); }
  linearRampToValueAtTime(value, time) { return this.insert({ type: 'linear', value, time }); }
  exponentialRampToValueAtTime(value, time) { return this.insert({ type: 'exponential', value, time }); }
  setTargetAtTime(value, time, tau) { return this.insert({ type: 'target', value, time, tau }); }
  cancelScheduledValues(time) {
    this.events = this.events.filter(event => event.time < time);
    return this;
  }

  /** The value at `time`: a set jumps, a ramp runs from the event before it, a target closes in exponentially. */
  valueAt(time) {
    let value = this.initial; // what the last event we have passed left
    let from = 0; // and when
    const list = this.events;
    for (let i = 0; i < list.length; i++) {
      const event = list[i];
      const next = list[i + 1];
      if (event.type === 'target') {
        if (event.time > time) break;
        const handedOver = next && next.time <= time;
        const end = handedOver ? next.time : time;
        const reached = event.value + (value - event.value) * Math.exp(-(end - event.time) / event.tau);
        if (!handedOver) return reached;
        value = reached;
        from = next.time;
        continue;
      }
      if (event.time > time) {
        if (event.type === 'linear') return value + ((event.value - value) * (time - from)) / (event.time - from);
        if (event.type === 'exponential' && value > 0 && event.value > 0) return value * (event.value / value) ** ((time - from) / (event.time - from));
        return value;
      }
      value = event.value;
      from = event.time;
    }
    return value;
  }

  /** The time of the last scheduled event, or null for a param nothing has been scheduled on. */
  get lastEventTime() { return this.events.length ? this.events[this.events.length - 1].time : null; }
}

export class FakeNode {
  constructor(context, kind, params = {}) {
    this.context = context;
    this.kind = kind;
    this.outputs = [];
    this.disconnected = false;
    for (const [name, value] of Object.entries(params)) this[name] = new FakeParam(context, value);
    context.nodes.push(this);
  }

  connect(node) {
    this.outputs.push(node);
    return node;
  }

  disconnect() {
    this.outputs = [];
    this.disconnected = true;
  }

  /** Is `node` somewhere downstream of this one? */
  reaches(node) {
    return this.outputs.some(out => out === node || out.reaches?.(node)); // an output may be a param, which leads nowhere
  }
}

class FakeSource extends FakeNode {
  constructor(context, kind, params) {
    super(context, kind, params);
    this.starts = []; // { when, offset }
    this.stopTime = undefined;
    this.ended = false;
    this.onended = null;
  }

  start(when = 0, offset = 0) {
    if (this.starts.length) throw new DOMException('start() was called twice', 'InvalidStateError');
    this.starts.push({ when, offset });
  }

  stop(when = 0) {
    if (!this.starts.length) throw new DOMException('stop() before start()', 'InvalidStateError');
    this.stopTime = when;
  }

  get started() { return this.starts.length > 0; }
  /** Has it started by `time` and not yet stopped? */
  soundingAt(time) {
    return this.started && this.starts[0].when <= time && (this.stopTime === undefined || time < this.stopTime);
  }
}

/**
 * A stand-in for an <audio> element playing a streamed file. It starts loading when src is set, plays only when a running context
 * pulls it (context.advance moves it on, as a real element feeding Web Audio is moved by the audio clock), loops when asked, and
 * keeps count of what it was asked to do. Seeking and starting take no time unless a test gives it some.
 */
export class FakeMediaElement extends EventTarget {
  /**
   * @param {object} options
   * @param {number} options.duration       the length of the file, in seconds
   * @param {boolean} options.loadError     the file cannot be loaded or decoded: an error event instead of loadedmetadata
   * @param {number} options.seekLatency    seconds of audio time a seek takes (`seeking` is true meanwhile, and the media clock stands still)
   * @param {number} options.startLatency   seconds of audio time between play() and the media clock moving
   * @param {boolean} options.blocked       play() is refused as the browser does before any touch (NotAllowedError)
   * @param {Error} options.playError       play() rejects with this
   * @param {{at: number, for: number}} options.freeze   its clock stands still for `for` seconds once it has reached `at` (an output device that
   *                                        starts slowly lets the clock move a moment and then stops it)
   * @param {number} options.rate        how fast its clock runs against the audio clock (1 is in step; a starved pipeline crawls)
   * @param {boolean} options.seekable      false: the file came from a server with no byte ranges, so it cannot be moved (seekable is
   *                                        [0, 0], as in Chrome, and a seek lands at the start)
   */
  constructor({ duration = 351.6, loadError = false, seekLatency = 0, startLatency = 0, blocked = false, playError = null, seekable = true, freeze = null, rate = 1 } = {}) {
    super();
    this.preload = 'metadata';
    this.loop = false;
    this.paused = true;
    this.seeking = false;
    this.readyState = 0;
    this.duration = NaN;
    this.error = null;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.seeks = []; // every time currentTime was set to, in order
    this.fileDuration = duration;
    this.loadError = loadError;
    this.seekLatency = seekLatency;
    this.startLatency = startLatency;
    this.blocked = blocked;
    this.playError = playError;
    this.canBeMoved = seekable;
    this.freeze = freeze;
    this.rate = rate;
    this.frozenLeft = 0;
    this.time = 0;
    this.seekLeft = 0;
    this.startLeft = 0;
    this.address = '';
  }

  get src() { return this.address; }
  set src(value) {
    this.address = String(value);
    queueMicrotask(() => this.load());
  }

  load() {
    if (this.loadError) {
      this.error = { code: 4, message: 'MEDIA_ELEMENT_ERROR: Format error' };
      this.dispatchEvent(new Event('error'));
      return;
    }
    this.duration = this.fileDuration;
    this.readyState = 4;
    this.dispatchEvent(new Event('loadedmetadata'));
    this.dispatchEvent(new Event('canplay'));
  }

  /** What Chrome says: the whole file once it is known and the server gives byte ranges, nothing (0 to 0) when it does not. */
  get seekable() {
    const end = this.canBeMoved && Number.isFinite(this.duration) ? this.duration : 0;
    return { length: 1, start: () => 0, end: () => end };
  }

  get currentTime() { return this.time; }
  set currentTime(value) {
    this.seeks.push(value);
    this.time = this.canBeMoved ? value : 0; // a file that cannot be moved starts over
    if (this.seekLatency > 0) {
      this.seeking = true;
      this.seekLeft = this.seekLatency;
    }
  }

  play() {
    this.playCalls++;
    if (this.blocked) return Promise.reject(new DOMException('play() failed because the user didn\'t interact with the document first.', 'NotAllowedError'));
    if (this.playError) return Promise.reject(this.playError);
    if (this.paused) {
      this.paused = false;
      this.startLeft = this.startLatency;
    }
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls++;
    this.paused = true;
  }

  /** `seconds` of audio time pass while a running context pulls this element. */
  tick(seconds) {
    if (this.paused || this.readyState < 3) return;
    let left = seconds;
    if (this.seeking) {
      const used = Math.min(left, this.seekLeft);
      this.seekLeft -= used;
      left -= used;
      if (this.seekLeft > 0) return;
      this.seeking = false;
      this.dispatchEvent(new Event('seeked'));
    }
    const waiting = Math.min(left, this.startLeft);
    this.startLeft -= waiting;
    left -= waiting;
    if (this.freeze && this.time + left >= this.freeze.at && this.frozenLeft === 0 && !this.froze) {
      left -= Math.max(0, this.freeze.at - this.time); // it gets as far as `at` ...
      this.time = this.freeze.at;
      this.froze = true;
      this.frozenLeft = this.freeze.for; // ... and stands still
    }
    const stuck = Math.min(left, this.frozenLeft);
    this.frozenLeft -= stuck;
    left -= stuck;
    this.time += left * this.rate;
    if (this.time >= this.duration) {
      if (this.loop) this.time %= this.duration;
      else {
        this.time = this.duration;
        this.paused = true;
      }
    }
  }
}

export class FakeContext extends EventTarget {
  /**
   * @param {object} options
   * @param {string} options.state            'suspended' (a page nobody has touched) or 'running'
   * @param {boolean} options.blocked         resume() is refused, as when the browser wants a touch first
   */
  constructor({ state = 'suspended', sampleRate = 44100, blocked = false } = {}) {
    super();
    this.nodes = [];
    this.currentTime = 0;
    this.sampleRate = sampleRate;
    this.state = state;
    this.blocked = blocked;
    this.stalled = false; // says it runs, but its clock stands still (a slow audio device): time does not pass, nor does an element move
    this.decoded = []; // everything decodeAudioData was asked to decode: the theme must never be among it
    this.elements = []; // the media elements feeding this context
    this.resumes = 0;
    this.destination = new FakeNode(this, 'destination');
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }

  resume() {
    this.resumes++;
    if (this.blocked) return Promise.reject(new DOMException('The AudioContext was not allowed to start', 'NotAllowedError'));
    this.setState('running');
    return Promise.resolve();
  }

  suspend() {
    this.setState('suspended');
    return Promise.resolve();
  }

  /** Time passes for a running context (an asleep one stands still, and so do the elements it pulls); sources whose stop time has come end. */
  advance(seconds) {
    if (this.state === 'running' && !this.stalled) {
      this.currentTime += seconds;
      for (const element of this.elements) element.tick(seconds);
    }
    for (const node of this.nodes) {
      if (node instanceof FakeSource && node.stopTime !== undefined && node.stopTime <= this.currentTime && !node.ended) {
        node.ended = true;
        node.onended?.();
      }
    }
  }

  decodeAudioData(bytes) {
    this.decoded.push(bytes);
    return Promise.resolve(this.createBuffer(2, 1, this.sampleRate));
  }

  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: i => data[i] };
  }

  createGain() { return new FakeNode(this, 'gain', { gain: 1 }); }
  createStereoPanner() { return new FakeNode(this, 'panner', { pan: 0 }); }
  createBiquadFilter() {
    const filter = new FakeNode(this, 'filter', { frequency: 350, Q: 1, gain: 0 });
    filter.type = 'lowpass';
    return filter;
  }

  createDynamicsCompressor() {
    return new FakeNode(this, 'compressor', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 });
  }

  createOscillator() {
    const oscillator = new FakeSource(this, 'oscillator', { frequency: 440, detune: 0 });
    oscillator.type = 'sine';
    return oscillator;
  }

  createBufferSource() {
    const source = new FakeSource(this, 'bufferSource', { playbackRate: 1 });
    source.buffer = null;
    source.loop = false;
    return source;
  }

  // Like a browser, an element can feed one source only, and from then on is heard only through the graph.
  createMediaElementSource(element) {
    if (this.elements.includes(element) || element.fedBy) throw new DOMException('The HTMLMediaElement already has an associated MediaElementAudioSourceNode', 'InvalidStateError');
    const source = new FakeNode(this, 'mediaElementSource');
    source.element = element;
    element.fedBy = source;
    this.elements.push(element);
    return source;
  }

  // What a test looks at -------------------------------------------------------------------------

  of(kind) { return this.nodes.filter(node => node.kind === kind); }
  get oscillators() { return this.of('oscillator'); }
  get bufferSources() { return this.of('bufferSource'); }
  get mediaSources() { return this.of('mediaElementSource'); }
  /** Every source (oscillators and buffers) that has been started. */
  get started() { return this.nodes.filter(node => node instanceof FakeSource && node.started); }
  /** The gain nodes that feed the destination directly. */
  get lastGains() { return this.of('gain').filter(node => node.outputs.includes(this.destination)); }
}

export const createFakeContext = options => new FakeContext(options);

/**
 * Stands in for fetch while `run` goes: every URL asked for is recorded in `asked`, and `answer(url)` says
 * what comes back (the default is a body of a few bytes).
 */
export async function withFetch(run, answer = () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) })) {
  const original = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async url => {
    asked.push(String(url));
    return answer(String(url));
  };
  try {
    return await run(asked);
  } finally {
    globalThis.fetch = original;
  }
}

/**
 * The most a signal can be scaled by on its way from `node` to `target`: the largest value each gain on the
 * way is ever given, multiplied. Several sources at their peaks together can add up to this much each.
 */
export function peakThrough(node, target) {
  if (node === target) return 1;
  let gain = 1;
  if (node.kind === 'gain') {
    const values = node.gain.events.length ? node.gain.events.map(event => event.value) : [node.gain.initial];
    gain = Math.max(...values.map(Math.abs));
  }
  const onward = node.outputs.filter(out => out instanceof FakeNode).map(out => peakThrough(out, target));
  return gain * Math.max(0, ...onward);
}

/** The frequencies an oscillator is scheduled to sing: where its glide starts and ends. */
export function pitchesOf(oscillator) {
  return oscillator.frequency.events.map(event => event.value);
}

/** How far, in cents, `hz` is from the nearest octave of any of the `key` notes. */
export function centsFromKey(hz, key) {
  return Math.min(...key.map(note => {
    const octaves = Math.log2(hz / note);
    return Math.abs(octaves - Math.round(octaves)) * 1200;
  }));
}
