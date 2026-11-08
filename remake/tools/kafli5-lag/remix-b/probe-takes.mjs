// Measure her takes: length, attack, words (for placing them on the grid). node remake/tools/kafli5-lag/remix-b/probe-takes.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLine } from './lib/dj.mjs';
import { SR } from './lib/io.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '../../../assets/audio/kafli5');
const lines = JSON.parse(readFileSync(join(here, 'lines.json'), 'utf8'));
for (const l of lines) {
  const L = loadLine(DIR, 'remix-b', l);
  const s = v => (v / SR).toFixed(3);
  console.log(`${l.id.padEnd(13)} ${L.file ?? 'PLACEHOLDER'} len ${s(L.x.length)} attack ${s(L.m.attack)} end ${s(L.m.end)} peak ${L.m.peak.toFixed(3)} words ${L.m.words.map(w => `${s(w.attack)}-${s(w.to)}`).join(' ')}`);
}
