// smidur-b's pitch and timing checks on its own rendered notes: every animal take as it is placed (YIN over its steady part,
// cents from the group's tone in the take's octave), the instruments doubling the tune (marimba, trumpet) and her horn at each of
// the five tones, the grid (every event on a whole sample), and each chorus note's onset in the rendered animals stem.
import { SR } from './dsp.mjs';
import { TONE, pitchOf, cents } from './samples.mjs';
import * as V from './voices.mjs';
import * as I from './inst.mjs';
import { TONE_MIDI, SPB, buildScore } from './score.mjs';

const nearest = (hz, tone) => tone * 2 ** Math.round(Math.log2(hz / tone));
function measure(buf, tone, { from = 0.03, to = null, range = [60, 4000] } = {}) {
  const p = pitchOf(buf, { from: Math.round(from * SR), to: to ? Math.round(to * SR) : buf.length, hop: 256, len: 1024, fmin: range[0], fmax: range[1], apMax: 0.3 });
  if (!p.hz) return { hz: null, cents: null };
  const t = nearest(p.hz, tone);
  return { hz: +p.hz.toFixed(2), target: +t.toFixed(2), cents: +cents(p.hz, t).toFixed(1), voiced: +p.voiced.toFixed(2) };
}

export function checks({ stems, chorusMelody }) {
  const animals = {};
  for (const [group, takes] of Object.entries(V.TAKES)) {
    for (const [id, t] of Object.entries(takes)) {
      const tk = V.take(group, id);
      const buf = V.call(group, id, {});
      if (!t.steady) { animals[`${group}:${id}`] = { note: 'played as it is (no clear pitch), as the game does', ...measure(buf, TONE[group], { range: [1500, 3000] }) }; continue; }
      const s0 = Math.max(0, (t.steady[0] - t.seg[0]) / tk.rate - tk.onset / SR), s1 = (t.steady[1] - t.seg[0]) / tk.rate - tk.onset / SR;
      const r = t.range.map(f => f * tk.rate);
      animals[`${group}:${id}`] = { file: t.file, ownHz: +tk.ownHz.toFixed(2), rate: +tk.rate.toFixed(4), ...measure(buf, TONE[group], { from: s0, to: s1, range: r }) };
    }
  }
  const instruments = {};
  for (const g of Object.keys(TONE)) {
    const m = TONE_MIDI[g];
    instruments[g] = {
      tone: +TONE[g].toFixed(2),
      marimba: measure(V.marimba(g, { seconds: 1 }), TONE[g], { from: 0.05, range: [200, 1200] }),
      trumpet: measure(I.brassNote(m, 0.8, 0.8, 1, { kind: 'tpt' }), TONE[g], { from: 0.08, to: 0.4, range: [200, 1200] }),
      horn: measure(V.horn(g, 1.2), TONE[g] / 2, { from: 0.25, to: 1.1, range: [100, 600] }),
      piccoloFlute: measure(I.flute(m + 12, 0.8, 0.8, 1), TONE[g] * 2, { from: 0.1, to: 0.5, range: [400, 2500] }),
    };
  }
  // the grid: every event on a whole sample
  const { events } = buildScore();
  const offGrid = events.filter(e => Math.abs(e.beat * SPB - Math.round(e.beat * SPB)) > 1e-6).length;
  // each chorus note's heard onset in the rendered animals stem: where its 5 ms envelope first comes within 9 dB of its peak
  // (looking from 80 ms before the beat to 250 ms after), against the beat; and where it first rises 15 dB over the floor before it
  const a = stems.animals;
  const W = Math.round(0.005 * SR), H = 22;
  const env = i => { let s = 0; for (let k = i; k < i + W; k++) s += a.L[k] * a.L[k] + a.R[k] * a.R[k]; return 10 * Math.log10(s / W + 1e-12); };
  const offsets = chorusMelody.map(({ beat, group }) => {
    const at = Math.round(beat * SPB);
    const from = at - Math.round(0.08 * SR), to = at + Math.round(0.25 * SR);
    const e = [];
    for (let i = from; i < to; i += H) e.push(env(i));
    const pk = Math.max(...e), floor = Math.min(...e.slice(0, 8));
    const k9 = e.findIndex(v => v >= pk - 9);
    const k15 = e.findIndex(v => v >= floor + 15);
    const t = k => +((((from + k * H + W / 2) - at) / SR) * 1000).toFixed(1);
    return { beat, group, ms: t(k9), firstMs: k15 >= 0 ? t(k15) : null };
  });
  const ms = offsets.map(o => o.ms);
  return {
    pitchAnimals: animals,
    pitchInstruments: instruments,
    grid: { events: events.length, offGrid },
    chorusOnsets: { notes: offsets.length, minMs: Math.min(...ms), maxMs: Math.max(...ms), medianMs: ms.slice().sort((x, y) => x - y)[Math.floor(ms.length / 2)], list: offsets },
  };
}
