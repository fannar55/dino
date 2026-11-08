// A closer look at a stretch of the remix: spectrogram and waveform of [fromBeat, toBeat) of the mix or a stem.
//   node remake/tools/kafli5-lag/remix-b/look.mjs <fromBeat> <toBeat> [mix|pad|bass|beat|lead|animals|dj]
// Writes qa/remake/kafli5/lag/remix/remix-b/look/<what>-<from>-<to>-spec.png and -wave.png.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnText } from './lib/io.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../../qa/remake/kafli5/lag/remix/remix-b');
const [from, to, what = 'mix'] = process.argv.slice(2);
const a = Number(from) * 0.48, d = (Number(to) - Number(from)) * 0.48;
const file = what === 'mix' ? join(OUT, 'mix.mp3') : join(OUT, 'stems', `${what}.mp3`);
mkdirSync(join(OUT, 'look'), { recursive: true });
const base = join(OUT, 'look', `${what}-${from}-${to}`);
spawnText(['-y', '-v', 'error', '-ss', String(a), '-t', String(d), '-i', file, '-lavfi', 'showspectrumpic=s=1400x500:legend=1:scale=log:fscale=log:start=40:stop=16000', `${base}-spec.png`]);
spawnText(['-y', '-v', 'error', '-ss', String(a), '-t', String(d), '-i', file, '-filter_complex', 'showwavespic=s=1400x260:split_channels=0:filter=peak', '-frames:v', '1', `${base}-wave.png`]);
console.log(`${base}-spec.png`);
