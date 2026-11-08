// Probe the chapter's takes: length, onset, a coarse envelope, own pitch (YIN) and pitch once put on the group's tone.
// node remake/tools/kafli5-lag/smidur-b/probe-takes.mjs
import { join } from 'node:path';
import { SR } from './dsp.mjs';
import { HLJOD, SOUNDS, TONE, decode, takeRate, setRate, resample, onsetOf, pitchOf, cents } from './samples.mjs';

for (const [file, e] of Object.entries(SOUNDS.files)) {
  const x = decode(join(HLJOD, file));
  const on = onsetOf(x, -30);
  let pk = 0;
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  // envelope in 50 ms steps, dB under peak
  const env = [];
  for (let i = 0; i < x.length; i += 2205) {
    let s = 0;
    for (let k = i; k < Math.min(x.length, i + 2205); k++) s += x[k] * x[k];
    env.push(Math.round(10 * Math.log10(s / 2205 / (pk * pk) + 1e-9)));
  }
  const own = pitchOf(x, { fmin: 40, fmax: 4000 });
  let line = `${file.padEnd(14)} ${(x.length / SR).toFixed(3)}s on ${(on / SR * 1000).toFixed(0)}ms pk ${pk.toFixed(2)} json ${e.hz} yin ${own.hz?.toFixed(1)} v${own.voiced.toFixed(2)}`;
  if (e.group) {
    const r = e.clear ? takeRate(e.hz, TONE[e.group]) : 1;
    const y = resample(x, r);
    const p = pitchOf(y, { fmin: 40, fmax: 4000 });
    const tgt = TONE[e.group] * 2 ** Math.round(Math.log2((p.hz ?? 1) / TONE[e.group]));
    line += ` | rate ${r.toFixed(3)} -> ${(y.length / SR).toFixed(2)}s yin ${p.hz?.toFixed(1)} (${p.hz ? cents(p.hz, tgt).toFixed(0) : '-'}c from ${tgt.toFixed(1)})`;
  }
  console.log(line);
  console.log('   env', env.join(' '));
}
