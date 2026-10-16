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

export class FakeContext extends EventTarget {
  /**
   * @param {object} options
   * @param {string} options.state            'suspended' (a page nobody has touched) or 'running'
   * @param {number} options.duration         the length of the audio decodeAudioData returns, in seconds
   * @param {boolean} options.blocked         resume() is refused, as when the browser wants a touch first
   * @param {Error} options.decodeError       decodeAudioData rejects with this
   */
  constructor({ state = 'suspended', sampleRate = 44100, duration = 351.6, blocked = false, decodeError = null } = {}) {
    super();
    this.nodes = [];
    this.currentTime = 0;
    this.sampleRate = sampleRate;
    this.state = state;
    this.blocked = blocked;
    this.duration = duration;
    this.decodeError = decodeError;
    this.decoded = [];
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

  /** Time passes for a running context (an asleep one stands still); sources whose stop time has come end. */
  advance(seconds) {
    if (this.state === 'running') this.currentTime += seconds;
    for (const node of this.nodes) {
      if (node instanceof FakeSource && node.stopTime !== undefined && node.stopTime <= this.currentTime && !node.ended) {
        node.ended = true;
        node.onended?.();
      }
    }
  }

  decodeAudioData() {
    if (this.decodeError) return Promise.reject(this.decodeError);
    const buffer = { duration: this.duration, sampleRate: this.sampleRate, numberOfChannels: 2, length: Math.round(this.duration * this.sampleRate) };
    this.decoded.push(buffer);
    return Promise.resolve(buffer);
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

  // What a test looks at -------------------------------------------------------------------------

  of(kind) { return this.nodes.filter(node => node.kind === kind); }
  get oscillators() { return this.of('oscillator'); }
  get bufferSources() { return this.of('bufferSource'); }
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
