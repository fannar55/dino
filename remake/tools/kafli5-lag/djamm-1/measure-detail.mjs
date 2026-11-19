// Fine measurements of the track: where the kick's attack sits against the grid (beat-synchronous average), the snare on the
// backbeat, how bright the drums-only intro is against the drums stem later, each stem's sixteenth-step profile (stabs or
// sustained), and the last bars in sixteenths. Stems read 1105 samples late.
import { decode, SR } from './lib/io.mjs';
import { mono, lowpassed } from './lib/analyze.mjs';
import { Biquad } from './lib/dsp.mjs';

const DIR = 'remake/assets/audio/sloedla/v2/djamm';
const LAG = 1105, T0 = 0.0272, SPB = 21168;
const db = v => (v > 0 ? 20 * Math.log10(v) : -120);
const ld = n => {
  const [L, R] = decode(`${DIR}/${n}.mp3`, 2);
  return mono(L, R);
};
const S = { song: ld('song') };
for (const n of ['drums', 'bass', 'guitar', 'other', 'piano', 'vocals']) S[n] = ld(n).subarray(LAG);
const beatAt = b => Math.round(T0 * SR + b * SPB);

function avgEnv(x, beats, pre = 0.04, post = 0.1) {
  const a = Math.round(pre * SR), b = Math.round(post * SR);
  const acc = new Float64Array(a + b);
  for (const k of beats) {
    const c = beatAt(k);
    for (let i = -a; i < b; i++) acc[i + a] += Math.abs(x[c + i] || 0);
  }
  // 1 ms smoothing
  const w = Math.round(0.001 * SR), sm = new Float64Array(acc.length);
  for (let i = 0; i < acc.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - w); j < Math.min(acc.length, i + w); j++) {
      s += acc[j];
      n++;
    }
    sm[i] = s / n;
  }
  const floor = Math.min(...sm.slice(0, Math.round(0.02 * SR)));
  let pk = 0, pi = 0;
  sm.forEach((v, i) => {
    if (v > pk) {
      pk = v;
      pi = i;
    }
  });
  const cross = f => {
    for (let i = 0; i < sm.length; i++) if (sm[i] > floor + f * (pk - floor)) return +(((i - a) / SR) * 1000).toFixed(1);
    return null;
  };
  return { t10: cross(0.1), t50: cross(0.5), peakMs: +(((pi - a) / SR) * 1000).toFixed(1), riseDb: +(db(pk) - db(floor)).toFixed(1) };
}
const range = (a, b, step = 1) => {
  const r = [];
  for (let k = a; k < b; k += step) r.push(k);
  return r;
};
const songLo = lowpassed(S.song, 120), drumsLo = lowpassed(S.drums, 120);
console.log('kick (song <120 Hz), beats 36-380:', avgEnv(songLo, range(36, 380)));
console.log('kick (song <120 Hz), intro beats 0-31:', avgEnv(songLo, range(0, 32)));
console.log('kick (drums stem <120 Hz, shifted), beats 36-380:', avgEnv(drumsLo, range(36, 380)));
const hp = x => {
  const y = Float32Array.from(x);
  for (const q of [0.54, 1.31]) new Biquad('hp', 1500, q).run(y);
  return y;
};
const songHi = hp(S.song);
console.log('snare/hats (song >1.5 kHz) on 2 and 4:', avgEnv(songHi, range(37, 380, 2)), 'on 1 and 3:', avgEnv(songHi, range(36, 380, 2)));
const offs = range(36, 380).map(k => k + 0.5);
console.log('off-beats (song >1.5 kHz):', avgEnv(songHi, offs));

// brightness: share of energy over 2 kHz, intro (song bars 0-7) against the drums stem in bars 9-40
function hiShare(x, a, b) {
  const y = Float32Array.from(x.subarray(a, b));
  const h = hp(y);
  let e = 0, t = 0;
  for (let i = 0; i < y.length; i++) {
    e += h[i] * h[i];
    t += y[i] * y[i];
  }
  return +((100 * e) / t).toFixed(1);
}
console.log('energy over 1.5 kHz %: intro song', hiShare(S.song, beatAt(0), beatAt(32)), 'drums stem bars 9-40', hiShare(S.drums, beatAt(36), beatAt(160)), 'drums stem bars 48-95', hiShare(S.drums, beatAt(192), beatAt(380)));
// intro level per bar against drums stem
const rms = (x, a, b) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return db(Math.sqrt(s / (b - a)));
};
console.log('intro bars 0-7 song dB:', range(0, 8).map(k => rms(S.song, beatAt(4 * k), beatAt(4 * k + 4)).toFixed(1)).join(' '));

// sixteenth profile of each stem (mean dB per step) over bars 48-95 and 9-47
for (const [lo, hi] of [[9, 48], [48, 96]]) {
  for (const n of ['drums', 'bass', 'guitar', 'other', 'piano', 'vocals']) {
    const prof = [];
    for (let s = 0; s < 16; s++) {
      let acc = 0;
      for (let bar = lo; bar < hi; bar++) {
        const a = beatAt(bar * 4 + s / 4), b = beatAt(bar * 4 + (s + 1) / 4);
        let e = 0;
        for (let i = a; i < b; i++) e += S[n][i] * S[n][i];
        acc += e / (b - a);
      }
      prof.push(db(Math.sqrt(acc / (hi - lo))).toFixed(0));
    }
    console.log(`bars ${lo}-${hi - 1} ${n.padEnd(6)} 16ths:`, prof.join(' '));
  }
}
// the end in sixteenths
for (let bar = 94; bar < 100; bar++) {
  const line = [];
  for (const n of ['song', 'drums', 'bass', 'guitar', 'other']) {
    const v = [];
    for (let s = 0; s < 16; s += 2) v.push(rms(S[n], beatAt(bar * 4 + s / 4), Math.min(S[n].length, beatAt(bar * 4 + (s + 2) / 4))).toFixed(0));
    line.push(`${n} ${v.join(' ')}`);
  }
  console.log(`bar ${bar}: ${line.join(' | ')}`);
}
