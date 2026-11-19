// The desk: five stems (stereo, each with its own reverb send), mono sub-buses for the guitars and the organ, and the clock.
import { SR } from './io.mjs';
import { fdnReverb, dbToGain } from './dsp.mjs';

export const BPM = 98;
export const SPB = (SR * 60) / BPM; // 27000 samples a beat: the grid is sample-exact
export const beatSec = 60 / BPM;
/** Sample index of a beat (bars of 4; beat 0 is the song's first sample). */
export const at = beat => Math.round(beat * SPB);
/** Beat number of bar `bar` (1-based) plus `q` quarters. */
export const B = (bar, q = 0) => (bar - 1) * 4 + q;

const panGains = pan => {
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
};

export class Desk {
  constructor(seconds, { loop = null } = {}) {
    this.n = Math.ceil(seconds * SR);
    const mk = () => new Float32Array(this.n);
    this.stems = {};
    for (const s of ['pad', 'bass', 'beat', 'lead', 'animals']) this.stems[s] = { L: mk(), R: mk(), sL: mk(), sR: mk() };
    this.subs = {};
    this.loop = loop; // { start, end } in samples: nothing may start inside the loop for a later beat
    this.trimmed = [];
  }
  sub(name) {
    if (!this.subs[name]) this.subs[name] = new Float32Array(this.n);
    return this.subs[name];
  }
  /**
   * Put a mono buffer on a stem at sample `start` (may be before its beat: a pre-roll), gain in dB, pan -1..1, send 0..1.
   * `beatSample` is the grid point it belongs to; a pre-roll that would reach back into the loop from after it is cut away.
   */
  put(stem, buf, start, { db = 0, pan = 0, send = 0, beatSample = start, width = 0 } = {}) {
    let from = 0;
    if (this.loop && beatSample >= this.loop.end && start < this.loop.end) {
      from = this.loop.end - start;
      this.trimmed.push({ stem, start, beatSample, cut: from });
    }
    const g = dbToGain(db);
    const [gl, gr] = panGains(pan);
    const st = this.stems[stem];
    const fadeN = from ? 64 : 0;
    for (let i = from; i < buf.length; i++) {
      const t = start + i;
      if (t < 0 || t >= this.n) continue;
      let v = buf[i] * g;
      if (fadeN && i - from < fadeN) v *= (i - from) / fadeN;
      st.L[t] += v * gl;
      st.R[t] += v * gr;
      if (send) {
        st.sL[t] += v * gl * send;
        st.sR[t] += v * gr * send;
      }
    }
    void width;
  }
  /** Put a mono buffer on a sub-bus (guitar, organ), same pre-roll rule. */
  putSub(name, buf, start, { db = 0, beatSample = start } = {}) {
    const bus = this.sub(name);
    let from = 0;
    if (this.loop && beatSample >= this.loop.end && start < this.loop.end) from = this.loop.end - start;
    const g = dbToGain(db);
    for (let i = from; i < buf.length; i++) {
      const t = start + i;
      if (t >= 0 && t < this.n) bus[t] += buf[i] * g;
    }
  }
  /** Add a stereo pair to a stem (after processing a sub-bus), with an optional send. */
  addStereo(stem, L, R, { db = 0, send = 0 } = {}) {
    const g = dbToGain(db);
    const st = this.stems[stem];
    for (let t = 0; t < this.n; t++) {
      st.L[t] += L[t] * g;
      st.R[t] += R[t] * g;
      if (send) {
        st.sL[t] += L[t] * g * send;
        st.sR[t] += R[t] * g * send;
      }
    }
  }
  /** Run each stem's reverb on its send and fold it in. */
  reverbs(settings) {
    for (const [stem, opts] of Object.entries(settings)) {
      const st = this.stems[stem];
      const [wl, wr] = fdnReverb(st.sL, st.sR, opts);
      const g = dbToGain(opts.db ?? 0);
      for (let t = 0; t < this.n; t++) {
        st.L[t] += wl[t] * g;
        st.R[t] += wr[t] * g;
      }
      st.sL = st.sR = null;
    }
  }
}
