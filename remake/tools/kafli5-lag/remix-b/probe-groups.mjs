// Word groups of the split lines at their split gaps (to check the cuts). node remake/tools/kafli5-lag/remix-b/probe-groups.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLine, groupsOf } from './lib/dj.mjs';
import { PLACES } from './lib/remix.mjs';
import { SR } from './lib/io.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const lines = JSON.parse(readFileSync(join(here, 'lines.json'), 'utf8'));
for (const l of lines) {
  const p = PLACES[l.id];
  if (!p.split) continue;
  const L = loadLine(join(here, '../../../assets/audio/kafli5'), 'remix-b', l);
  const s = v => (v / SR).toFixed(3);
  console.log(l.id, 'words', L.m.words.map(w => `${s(w.from)}/${s(w.attack)}-${s(w.to)}`).join(' '));
  for (const gap of [150, 180, 250, 300]) console.log('  gap', gap, groupsOf(L.m, gap).map(g => `${s(g.attack)}-${s(g.to)}`).join(' | '), p.split === gap ? '<- used, needs ' + p.beats.length : '');
}
