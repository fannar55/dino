// Uggeðla í tjörninni's sound without ears (chapters/tjorn3d/sound.js): the cue sheet, the show's sound measured, and the cues as
// the page plays them.
//
//   node remake/tools/tjorn3d-sound.mjs                      the cue sheet: every cue with its second, name, kind, level and side
//   node remake/tools/tjorn3d-sound.mjs --render [--from 0] [--json qa/tjorn3d/hljod/render.json] [--wav qa/tjorn3d/hljod/tjorn3d.wav]
//       lays the whole sheet on an offline audio context in the headless browser the captures use (the show's own player, through
//       the page's own output chain: engine/audio/output.js) and measures what comes out: for every second its peak and its loudness
//       (RMS, dBFS), how much of it lies under 150 Hz and over 6 kHz, and how far it leans to a side; the same for each part of the
//       show; and each sound alone (its peak, the loudness of its loudest 0,4 s, its bands). Then her lines: each recording as
//       the page plays it (the game's voice: an <audio> straight out, past the output chain, at the file's own level) against
//       everything else in the seconds it is said in. --wav writes what was rendered, with the lines laid in at their seconds.
//   node remake/tools/tjorn3d-sound.mjs --played [--from 0] [--until 62] [--json file]
//       plays the page itself (?chapter=tjorn3d&t=<from>&play=1, tapped) and lists the cues as it played them: the show's second
//       each was played at, how late that was, and what sounded for it (a made sound, or a recording's file); and her lines as
//       the page said them: the second each was handed to the scene, and when its recording was heard and was over.
//   node remake/tools/tjorn3d-sound.mjs --played --glasses [--again 4]
//       the page as the child opens it (?chapter=tjorn3d): the glasses' tap, the whole show, the end card, and then "Aftur" for a
//       few seconds (--again: so many), to see that it starts clean, and, given long enough, that her lines are said again.
//   node remake/tools/tjorn3d-sound.mjs --still [--from 47] [--until 59]
//       a still (?chapter=tjorn3d&t=<from>), then stepped on as a capture is: the lines handed to the scene (her mouth alone), and
//       that the page made no voice and played no cue.
//   --made    with --render or --played: the show without the real recordings (the page's &upptokur=0): every slot plays what
//             stands in for it
//
// Exit code 1 when the page throws, a cue of the sheet was not played, a line was not said (or was said from before the page's
// start, or mouthed on in silence after it), a still asked for sound, or the sum's peak reaches full scale.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT, sleep, launchBrowser, stopBrowser } from './veiddu-video.mjs';
import { CUES, SLOTS, RECORDINGS, LINES, kindOf } from '../chapters/tjorn3d/sound.js';
import { LENGTH, PARTS, CALM } from '../chapters/tjorn3d/show.js';

// her lines (the sheet's), each with what lines.json says of its recording
const RECORDED = JSON.parse(fs.readFileSync(path.join(ROOT, 'remake/assets/audio/lines.json'), 'utf8'));
const SAID = CUES.filter(c => c.line !== undefined).map(c => ({ t: c.t, n: c.n, line: c.line, text: LINES[c.line], on: c.on, src: RECORDED[c.line]?.src ?? null, seconds: RECORDED[c.line]?.duration ?? null }));
const SOUNDS = CUES.filter(c => c.line === undefined); // what the show's own player plays

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

function parseArgs(argv) {
  const o = { render: false, played: false, still: false, glasses: false, made: false, again: 4, from: 0, until: LENGTH, json: null, wav: null, timeout: 180, size: '1280x800' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--render') o.render = true;
    else if (a === '--played') o.played = true;
    else if (a === '--glasses') o.glasses = true;
    else if (a === '--still') o.still = true;
    else if (a === '--again') o.again = Number(next());
    else if (a === '--made') o.made = true;
    else if (a === '--from') o.from = Number(next());
    else if (a === '--until') o.until = Number(next());
    else if (a === '--json') o.json = next();
    else if (a === '--wav') o.wav = next();
    else if (a === '--timeout') o.timeout = Number(next());
    else if (a === '--size') o.size = next();
    else throw new Error(`Unknown argument ${a}`);
  }
  return o;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const stat = await fsp.stat(file);
      const target = stat.isDirectory() ? path.join(file, 'index.html') : file;
      const body = await fsp.readFile(target);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Opens a page in the headless browser and runs `fn({ send, evaluate, errors })` on it. */
async function withPage(o, fn) {
  const [W, H] = o.size.split('x').map(Number);
  let browser = null;
  for (let tries = 0; !browser; tries++) { // the browser now and then fails to start on a busy machine
    try { browser = await launchBrowser({ browser: 'edge', width: W, height: H }); } catch (e) { if (tries >= 2) throw e; await sleep(2000); }
  }
  const { cdp } = browser;
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const errors = [];
    cdp.handlers.add(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
      else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    return await fn({ send, evaluate, errors });
  } finally {
    await stopBrowser(browser);
  }
}

const pad = (text, n) => String(text).padEnd(n);
const lead = (text, n) => String(text).padStart(n);
const dB = x => (x > 1e-7 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
const share = x => `${(100 * x).toFixed(0)} %`;

// ---- the sheet ----
function printSheet() {
  console.log(`The cue sheet (chapters/tjorn3d/sound.js): ${CUES.length} cues over ${LENGTH} s\n`);
  console.log(`${lead('s', 6)}  ${pad('sound', 9)} ${pad('kind', 9)} ${lead('level', 5)} ${lead('pan', 5)}  ${pad('hung on', 20)} what`);
  for (const c of CUES) {
    if (c.bed !== undefined) console.log(`${lead(c.t.toFixed(2), 6)}  ${pad('bed', 9)} ${pad('bed', 9)} ${lead(c.bed, 5)} ${lead('', 5)}  ${pad('', 20)} ${c.what} (over ${c.seconds} s)`);
    else if (c.line !== undefined) console.log(`${lead(c.t.toFixed(2), 6)}  ${pad('says', 9)} ${pad(kindOf(c), 9)} ${lead('', 5)} ${lead('', 5)}  ${pad(c.on ?? '', 20)} ${c.what} (${c.line}${RECORDED[c.line] ? `, ${RECORDED[c.line].duration} s by lines.json` : ': NOT in lines.json'})`);
    else console.log(`${lead(c.t.toFixed(2), 6)}  ${pad(c.sound, 9)} ${pad(kindOf(c), 9)} ${lead(c.level, 5)} ${lead(c.pan, 5)}  ${pad(c.on ?? '', 20)} ${c.what}`);
  }
  console.log('\nSlots (a real recording when its file is there, else the made sound):');
  for (const [name, slot] of Object.entries(SLOTS)) console.log(`  ${pad(name, 8)} ${slot.urls.map(u => u.split('/').pop()).join(', ')}  (instead: ${slot.instead}; level ${slot.level})  ${slot.what}`);
  console.log('Recordings the game has:');
  for (const [name, r] of Object.entries(RECORDINGS)) console.log(`  ${pad(name, 8)} ${r.urls.join(', ')}  (instead: ${r.instead}; level ${r.level})`);
}

// ---- the measure: runs in the page ----
/* eslint-disable no-undef */
async function measureInPage({ from, length, alone, recordings, said }) {
  const { createPondSound, CUES, SLOTS, RECORDINGS } = await import('/remake/chapters/tjorn3d/sound.js');
  const { createOutput } = await import('/remake/engine/audio/output.js');
  const RATE = 48000, N = 4096;
  const BANDS = [150, 500, 2000, 6000]; // Hz: under 150, to 500, to 2 k, to 6 k, over
  const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const bandOf = Array.from({ length: N / 2 }, (_, k) => { const i = BANDS.findIndex(edge => (k * RATE) / N < edge); return i < 0 ? BANDS.length : i; });
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const angle = (-2 * Math.PI) / size, wr = Math.cos(angle), wi = Math.sin(angle);
      for (let i = 0; i < n; i += size) {
        let cr = 1, ci = 0;
        for (let k = 0; k < size / 2; k++) {
          const a = i + k, b = a + size / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
        }
      }
    }
  }
  /** Peak, loudness (RMS of the two sides), each side's own, and the share of its power in each band, of samples [a, b). */
  function span(L, R, a, b) {
    let peak = 0, sumL = 0, sumR = 0;
    for (let i = a; i < b; i++) {
      const l = L[i], r = R[i];
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      sumL += l * l; sumR += r * r;
    }
    const n = Math.max(1, b - a);
    const bands = [0, 0, 0, 0, 0];
    for (let at = a; at + N <= b; at += N / 2) {
      const re = new Float32Array(N), im = new Float32Array(N);
      for (let i = 0; i < N; i++) re[i] = 0.5 * (L[at + i] + R[at + i]) * hann[i];
      fft(re, im);
      for (let k = 1; k < N / 2; k++) bands[bandOf[k]] += re[k] * re[k] + im[k] * im[k];
    }
    const all = bands.reduce((x, y) => x + y, 0) || 1;
    return { peak, rms: Math.sqrt((sumL + sumR) / (2 * n)), left: Math.sqrt(sumL / n), right: Math.sqrt(sumR / n), bands: bands.map(x => x / all) };
  }
  async function render(seconds, lay, chain = true, cues = CUES) {
    const context = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
    const sound = createPondSound({ context, output: chain ? createOutput(context) : null, offline: true, cues, recordings });
    await sound.ready;
    lay(sound);
    const buffer = await context.startRendering();
    return { L: buffer.getChannelData(0), R: buffer.getChannelData(1), log: sound.log.slice() };
  }

  const out = { rate: RATE, from, length, seconds: [], dry: [], sounds: [] };
  const whole = await render(length - from + 2, sound => sound.schedule(from, 0));
  const dry = await render(length - from + 2, sound => sound.schedule(from, 0), false);
  for (let s = 0; s < Math.ceil(length - from + 2); s++) {
    const a = s * RATE, b = Math.min(whole.L.length, a + RATE);
    out.seconds.push({ t: from + s, ...span(whole.L, whole.R, a, b) });
    out.dry.push({ t: from + s, peak: span(dry.L, dry.R, a, b).peak });
  }
  out.log = whole.log;
  window.__pcm = whole;
  // each sound alone: the loudest cue of each name, and each made sound that stands in for a recording
  const names = [...new Set(CUES.filter(c => c.sound).map(c => c.sound))];
  const stand = [...Object.values(SLOTS), ...Object.values(RECORDINGS)].map(entry => entry.instead);
  for (const name of alone ? [...new Set([...names, ...stand.filter(n => n !== 'water')])] : []) {
    const cue = CUES.filter(c => c.sound === name).sort((x, y) => y.level - x.level)[0] ?? { t: 0, n: 0, sound: name, level: 1, pan: 0, detail: {} };
    const one = await render(8, sound => sound.play(cue, 0.05), false);
    const all = span(one.L, one.R, 0, one.L.length);
    // its loudest 0,4 s
    let loud = 0;
    const W = Math.round(0.4 * RATE), step = Math.round(0.05 * RATE);
    for (let a = 0; a + W <= one.L.length; a += step) {
      let sum = 0;
      for (let i = a; i < a + W; i++) sum += one.L[i] * one.L[i] + one.R[i] * one.R[i];
      loud = Math.max(loud, Math.sqrt(sum / (2 * W)));
    }
    // how long it sounds: to the last moment over a thousandth of its peak
    let last = 0;
    for (let i = one.L.length - 1; i > 0; i--) if (Math.abs(one.L[i]) > all.peak / 1000 || Math.abs(one.R[i]) > all.peak / 1000) { last = i; break; }
    out.sounds.push({ name, t: cue.t, level: cue.level, played: one.log[0]?.played ?? null, peak: all.peak, loud, seconds: last / RATE, bands: all.bands, left: all.left, right: all.right });
  }
  // the bed alone, as it is laid (its level 1)
  const bed = await render(12, sound => sound.schedule(0, 0), false, CUES.filter(c => c.bed !== undefined));
  out.bed = span(bed.L, bed.R, 2 * RATE, 8 * RATE);

  // Her lines. The page plays a line as the game plays every line: an <audio> element straight out, past the output chain, at the
  // file's own level, the same in both speakers. Each is measured against everything else (what was rendered above) in the
  // seconds it is said in: over its speech (from the first to the last 20 ms of it within 30 dB of its loudest), in the band
  // speech is understood by (500 Hz to 6 kHz), and where it is tightest (the least over any 0,2 s of it in which the line is
  // within 12 dB of its own loudest 0,2 s).
  out.lines = [];
  const W20 = Math.round(0.02 * RATE), W200 = Math.round(0.2 * RATE), HOP = Math.round(0.05 * RATE);
  const power = (x, a, b) => { let sum = 0; for (let i = a; i < b; i++) sum += x[i] * x[i]; return sum / Math.max(1, b - a); };
  const rest = (a, b) => (power(whole.L, a, b) + power(whole.R, a, b)) / 2;
  const speechBand = s => s.rms * Math.sqrt(s.bands[2] + s.bands[3]);
  const mixed = [];
  for (const line of said) {
    if (!line.src || line.t < from) continue;
    const bytes = await (await fetch(`/remake/${line.src}`)).arrayBuffer();
    const buffer = await new OfflineAudioContext(1, RATE, RATE).decodeAudioData(bytes);
    const x = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) { const data = buffer.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] += data[i] / buffer.numberOfChannels; }
    const loud = [];
    for (let a = 0; a + W20 <= x.length; a += W20) loud.push(Math.sqrt(power(x, a, a + W20)));
    const floor = Math.max(...loud) / 10 ** (30 / 20);
    const a = loud.findIndex(v => v >= floor) * W20, b = (loud.findLastIndex(v => v >= floor) + 1) * W20;
    const at = Math.round((line.t - from) * RATE);
    const own = span(x, x, a, b), under = span(whole.L, whole.R, at + a, at + b);
    // the tightest 0,2 s
    let loudest = 0;
    for (let i = a; i + W200 <= b; i += HOP) loudest = Math.max(loudest, power(x, i, i + W200));
    let least = null;
    for (let i = a; i + W200 <= b; i += HOP) {
      const mine = power(x, i, i + W200);
      if (mine < loudest / 10 ** (12 / 10)) continue;
      const dB = 10 * Math.log10(mine / Math.max(1e-12, rest(at + i, at + i + W200)));
      if (!least || dB < least.dB) least = { dB, t: line.t + i / RATE };
    }
    // what the two make together, as the device gets them
    let sum = 0;
    for (let i = 0; i < x.length && at + i < whole.L.length; i++) sum = Math.max(sum, Math.abs(x[i] + whole.L[at + i]), Math.abs(x[i] + whole.R[at + i]));
    const whole1 = span(whole.L, whole.R, at, Math.min(whole.L.length, at + x.length));
    out.lines.push({
      line: line.line, t: line.t, seconds: x.length / RATE, speech: [a / RATE, b / RATE],
      peak: own.peak, rms: own.rms, band: speechBand(own), bands: own.bands,
      under: { peak: under.peak, rms: under.rms, band: speechBand(under), bands: under.bands, wholePeak: whole1.peak, wholeRms: whole1.rms },
      over: 20 * Math.log10(own.rms / Math.max(1e-7, under.rms)), overInBand: 20 * Math.log10(speechBand(own) / Math.max(1e-7, speechBand(under))),
      least, sumPeak: sum,
    });
    mixed.push({ x, at });
  }
  // (laid into what --wav writes only now: the seconds above are the show without her lines)
  for (const { x, at } of mixed) for (let i = 0; i < x.length && at + i < whole.L.length; i++) { whole.L[at + i] += x[i]; whole.R[at + i] += x[i]; }
  return out;
}

/** The rendered sound as a 16 bit WAV, in pieces of base64 (the page holds it in window.__pcm). */
async function wavPieceInPage(index, size) {
  const { L, R } = window.__pcm;
  const a = index * size, b = Math.min(L.length, a + size);
  if (a >= L.length) return null;
  const bytes = new Uint8Array((b - a) * 4);
  const view = new DataView(bytes.buffer);
  for (let i = a; i < b; i++) {
    view.setInt16((i - a) * 4, Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), true);
    view.setInt16((i - a) * 4 + 2, Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), true);
  }
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
/* eslint-enable no-undef */

function wavHeader(samples, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples * 4, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(samples * 4, 40);
  return header;
}

async function render(o, base) {
  let result = null, errors = [];
  await withPage(o, async page => {
    await page.send('Page.navigate', { url: `${base}assets/audio/tjorn3d/hljod/sounds.json` }); // (any page of the server will do: the modules are asked for from it)
    await sleep(500);
    result = await page.evaluate(`(${measureInPage.toString()})(${JSON.stringify({ from: o.from, length: LENGTH, alone: true, recordings: !o.made, said: SAID })})`);
    if (o.wav) {
      const file = path.resolve(ROOT, o.wav);
      await fsp.mkdir(path.dirname(file), { recursive: true });
      const pieces = [];
      for (let i = 0; ; i++) {
        const piece = await page.evaluate(`(${wavPieceInPage.toString()})(${i}, ${result.rate * 10})`);
        if (piece === null) break;
        pieces.push(Buffer.from(piece, 'base64'));
      }
      const body = Buffer.concat(pieces);
      await fsp.writeFile(file, Buffer.concat([wavHeader(body.length / 4, result.rate), body]));
      console.log(`Written: ${o.wav} (${(body.length / 4 / result.rate).toFixed(1)} s)`);
    }
    errors = [...page.errors];
  });
  const lean = s => (s.left > 1e-7 && s.right > 1e-7 ? (20 * Math.log10(s.right / s.left)).toFixed(1) : '');
  const cuesIn = (a, b) => CUES.filter(c => c.t >= a && c.t < b && (c.sound || c.line)).map(c => c.sound ?? `"${LINES[c.line]}"`);
  console.log(`The show's sound ${o.made ? 'WITHOUT the recordings (every slot plays what stands in for it)' : 'with the recordings'}, laid on an offline context from ${o.from} s and measured after the page's output chain (dBFS; "dry" is the peak before it; her lines are named at their seconds and not in the numbers)\n`);
  console.log(`${lead('s', 4)} ${lead('peak', 6)} ${lead('dry', 6)} ${lead('RMS', 6)} ${lead('<150', 6)} ${lead('>6k', 5)} ${lead('R-L dB', 7)}  cues`);
  result.seconds.forEach((s, i) => {
    if (s.t >= LENGTH) return;
    console.log(`${lead(s.t, 4)} ${lead(dB(s.peak), 6)} ${lead(dB(result.dry[i].peak), 6)} ${lead(dB(s.rms), 6)} ${lead(share(s.bands[0]), 6)} ${lead(share(s.bands[4]), 5)} ${lead(lean(s), 7)}  ${cuesIn(s.t, s.t + 1).join(', ')}`);
  });
  console.log('\nBy part:');
  const parts = [...PARTS, { id: 7, name: 'Kyrr tjörn aftur', ...CALM }];
  for (const part of parts) {
    const rows = result.seconds.filter(s => s.t >= part.from && s.t < part.to);
    const dry = result.dry.filter(s => s.t >= part.from && s.t < part.to);
    const peak = Math.max(...rows.map(s => s.peak)), rms = Math.sqrt(rows.reduce((x, s) => x + s.rms * s.rms, 0) / rows.length);
    const loudest = rows.reduce((x, s) => (s.rms > x.rms ? s : x));
    console.log(`  ${part.id} ${pad(part.name, 17)} ${lead(part.from, 2)}-${pad(part.to, 2)} s  peak ${lead(dB(peak), 6)} (dry ${lead(dB(Math.max(...dry.map(s => s.peak))), 6)})  RMS ${lead(dB(rms), 6)}  loudest second ${loudest.t} (${dB(loudest.rms)})`);
  }
  const top = result.seconds.filter(s => s.t < LENGTH).reduce((x, s) => (s.peak > x.peak ? s : x));
  const loud = result.seconds.filter(s => s.t < LENGTH).reduce((x, s) => (s.rms > x.rms ? s : x));
  const dryTop = result.dry.reduce((x, s) => (s.peak > x.peak ? s : x));
  console.log(`\nThe highest peak: ${dB(top.peak)} dBFS at second ${top.t} (before the output chain ${dB(dryTop.peak)} at second ${dryTop.t}); the loudest second: ${loud.t} (${dB(loud.rms)} dBFS RMS)`);
  console.log(`The bed alone at its full level (${result.log.find(e => e.kind === 'bed')?.played}): RMS ${dB(result.bed.rms)} dBFS, peak ${dB(result.bed.peak)}; under 150 Hz ${share(result.bed.bands[0])}, 150-500 ${share(result.bed.bands[1])}, 500-2k ${share(result.bed.bands[2])}, 2-6k ${share(result.bed.bands[3])}, over 6 kHz ${share(result.bed.bands[4])}`);
  console.log('\nEach sound alone (its loudest cue; before the output chain):');
  console.log(`  ${pad('sound', 9)} ${pad('plays', 16)} ${lead('at', 6)} ${lead('level', 5)} ${lead('peak', 6)} ${lead('loudest 0,4 s', 13)} ${lead('lasts', 6)} ${lead('<150', 5)} ${lead('150-500', 7)} ${lead('.5-2k', 6)} ${lead('2-6k', 5)} ${lead('>6k', 5)}`);
  for (const s of result.sounds) {
    console.log(`  ${pad(s.name, 9)} ${pad(s.played ?? '-', 16)} ${lead(s.t.toFixed(2), 6)} ${lead(s.level, 5)} ${lead(dB(s.peak), 6)} ${lead(dB(s.loud), 13)} ${lead(s.seconds.toFixed(1) + ' s', 6)} ${s.bands.map((x, i) => lead(share(x), [5, 7, 6, 5, 5][i])).join(' ')}`);
  }
  // her lines against everything else in their seconds
  console.log('\nHer lines (each recording as the page plays it: the game\'s voice, straight out at the file\'s own level) against everything else in the seconds it is said in (after the output chain):');
  console.log(`  ${pad('line', 20)} ${lead('at', 6)} ${pad('speech', 13)} ${lead('peak', 6)} ${lead('RMS', 6)} | ${lead('rest RMS', 8)} ${lead('peak', 6)} | ${lead('over by', 7)} ${lead('.5-6k', 6)} ${lead('tightest 0,2 s', 20)} | ${lead('both, peak', 10)}`);
  for (const l of result.lines) {
    console.log(`  ${pad(l.line, 20)} ${lead(l.t.toFixed(2), 6)} ${pad(`${l.speech[0].toFixed(2)}-${l.speech[1].toFixed(2)} s`, 13)} ${lead(dB(l.peak), 6)} ${lead(dB(l.rms), 6)} | ${lead(dB(l.under.rms), 8)} ${lead(dB(l.under.peak), 6)} | ${lead(l.over.toFixed(1), 7)} ${lead(l.overInBand.toFixed(1), 6)} ${lead(l.least ? `${l.least.dB.toFixed(1)} at ${l.least.t.toFixed(2)} s` : '-', 20)} | ${lead(dB(l.sumPeak), 10)}`);
  }
  const unsaid = SAID.filter(l => l.t >= o.from && !result.lines.some(r => r.line === l.line));
  if (unsaid.length) console.log(`  NOT MEASURED (not in lines.json?): ${unsaid.map(l => l.line).join(', ')}`);
  const riseSecond = result.seconds.filter(s => s.t < LENGTH).reduce((x, s) => (s.rms > x.rms ? s : x));
  if (result.lines.length) console.log(`  (the loudest second of everything else is still ${riseSecond.t}, ${dB(riseSecond.rms)} dBFS RMS: the rise)`);
  const missing = SOUNDS.filter(c => c.t >= o.from && !result.log.some(e => e.n === c.n && e.played));
  if (missing.length) console.log(`\nNOT PLAYED: ${missing.map(c => `${c.sound ?? 'bed'} at ${c.t}`).join(', ')}`);
  if (errors.length) console.log(`\nThe page said: ${errors.join(' | ')}`);
  const clipped = top.peak >= 0.999 || result.lines.some(l => l.sumPeak >= 0.999);
  if (clipped) console.log('\nThe sum reaches full scale.');
  return { result, bad: Boolean(missing.length || errors.length || clipped || unsaid.length) };
}

/**
 * Put in the page before anything of it runs: every <audio> the page makes for a recording (the game's voice makes one for each
 * line it plays, with the line's address; the music makes its own with none, and is not noted) is noted, with the show's second it
 * was asked for, was first heard and was over at.
 */
function spyOnVoices() {
  const Real = window.Audio;
  const now = () => window.__world?.tjorn?.view?.t ?? null;
  window.__voices = [];
  window.Audio = function Audio(...args) {
    const element = new Real(...args);
    if (!args[0]) return element; // (the theme's element: engine/audio/music.js)
    const row = { askedAt: now(), heardAt: null, overAt: null, stoppedAt: null };
    window.__voices.push({ element, row });
    element.addEventListener('playing', () => { row.heardAt ??= now(); });
    element.addEventListener('ended', () => { row.overAt = now(); });
    element.addEventListener('pause', () => { if (!element.ended) row.stoppedAt = now(); });
    return element;
  };
  window.Audio.prototype = Real.prototype;
}
const VOICES = '(window.__voices ?? []).map(v => ({ ...v.row, seconds: Number.isFinite(v.element.duration) ? v.element.duration : null, at: v.element.currentTime, ended: v.element.ended, paused: v.element.paused }))';

async function played(o, base) {
  let log = [], errors = [], state = null, again = null, said = { log: [], voices: [] };
  if (o.glasses) Object.assign(o, { from: 0, until: LENGTH });
  await withPage(o, async page => {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${spyOnVoices.toString()})()` });
    const until = async (what, test) => {
      const t0 = Date.now();
      for (;;) {
        let is = false;
        try { is = await page.evaluate(`Boolean(${test})`); } catch { /* loading */ }
        if (is) return;
        if (Date.now() - t0 > o.timeout * 1000) throw new Error(`${what}${page.errors.length ? ': ' + page.errors[0] : ''}`);
        await sleep(250);
      }
    };
    const SHOWING = 'window.__world?.tjorn?.sound && window.__world.tjorn.time?.showing';
    let before = { t: 0, running: false, log: 0, passed: [], voices: 0 };
    if (o.glasses) {
      // as the child opens it: the glasses' card, its tap, the pond built under the black, the show
      await page.send('Page.navigate', { url: `${base}?chapter=tjorn3d${o.made ? '&upptokur=0' : ''}` });
      await until('the glasses did not come', 'document.querySelector(".gler-start") && !document.querySelector(".gler-start-wrap")?.hidden');
      await page.evaluate('document.querySelector(".gler-start").click()');
      await until('the show did not start', SHOWING);
    } else {
      await page.send('Page.navigate', { url: `${base}?chapter=tjorn3d&t=${o.from}&play=1${o.made ? '&upptokur=0' : ''}` });
      await until('the page did not get ready', `window.__demoReady && ${SHOWING}`);
      await page.evaluate('window.__world.tjorn.sound.ready');
      before = await page.evaluate(`({ t: window.__world.tjorn.view.t, running: window.__world.tjorn.sound.running, log: window.__world.tjorn.sound.log.length, passed: (window.__world.tjorn.lines?.log ?? []).slice(), voices: ${VOICES}.length, speaking: Boolean(window.__world.tjorn.her?.talking), mouth: window.__world.tjorn.her?.mouthOpen ?? 0 })`);
      await page.evaluate('document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))'); // the tap
      // her mouth a few frames after the tap: a line the page passed on its way is let go, not mouthed on in silence
      await sleep(150);
      before.after = await page.evaluate(`({ t: window.__world.tjorn.view.t, speaking: Boolean(window.__world.tjorn.her?.talking), voices: ${VOICES}.length })`);
    }
    const began = Date.now();
    for (;;) {
      await sleep(500);
      const t = await page.evaluate('window.__world.tjorn.view.t');
      if (t >= o.until - 1e-3 || Date.now() - began > (o.until - o.from + 30) * 1000) break;
    }
    await sleep(1500);
    state = await page.evaluate('({ t: window.__world.tjorn.view.t, context: window.__world.sound.context.state, running: window.__world.tjorn.sound.running, sounding: window.__world.tjorn.sound.sounding(), endCard: Boolean(document.querySelector(".show-end, .gler-end, [class*=end]")) })');
    state.before = before;
    log = await page.evaluate('window.__world.tjorn.sound.log.slice()');
    said = await page.evaluate(`({ log: (window.__world.tjorn.lines?.log ?? []).slice(), voices: ${VOICES} })`);
    if (o.glasses) {
      // "Aftur": the show from its start again, clean
      await until('the end card did not come', 'document.querySelector(".dans-end button")');
      await page.evaluate('document.querySelector(".dans-end button").click()');
      await sleep(o.again * 1000);
      again = await page.evaluate(`({ t: window.__world.tjorn.view.t, card: Boolean(document.querySelector(".dans-end")), running: window.__world.tjorn.sound.running, log: window.__world.tjorn.sound.log.slice(), lines: (window.__world.tjorn.lines?.log ?? []).slice(), voices: ${VOICES}.length })`);
    }
    errors = [...page.errors];
  });
  console.log(`The page played from ${o.from} s to ${state.t.toFixed(2)} s${o.made ? ' WITHOUT the recordings (&upptokur=0)' : ''}: the cues as it played them\n`);
  if (!o.glasses) console.log(`Before the tap: the show stood at ${state.before.t.toFixed(2)} s, the sound ${state.before.running ? 'RUNNING' : 'not started'}, ${state.before.log} cues played`);
  console.log(`${lead('played', 7)} ${lead('sheet', 6)} ${lead('late ms', 7)}  ${pad('sound', 9)} ${pad('kind', 9)} ${pad('what sounded', 16)} ${lead('level', 5)} ${lead('pan', 5)}`);
  for (const e of log) console.log(`${lead(e.at.toFixed(2), 7)} ${lead(e.t.toFixed(2), 6)} ${lead(Math.round((e.at - e.t) * 1000), 7)}  ${pad(e.sound, 9)} ${pad(e.kind, 9)} ${pad(e.played ?? 'NOT PLAYED', 16)} ${lead(e.level, 5)} ${lead(e.pan, 5)}`);
  // (the page plays on for a second and a half past --until before it is asked: due is what lay before the second it then stood at)
  const due = SOUNDS.filter(c => c.t >= o.from - 1e-6 && c.t <= Math.min(LENGTH, state.t) - 0.05);
  const missing = due.filter(c => !log.some(e => e.n === c.n && e.played));
  // her lines as the page said them: each handed to the scene at its second, and its recording heard (the n-th <audio> the page
  // made for a recording is the n-th line's: a line the page had fetched ahead plays from memory, under an address that does not
  // name it). The lines the page passed on its way to its start (a page with t=) were handed to the scene in the seek, where it
  // moves her mouth and asks for no sound: they are not said, and the page's list of lines starts anew when it plays on.
  const dueLines = SAID.filter(l => l.t >= o.from - 1e-6 && l.t <= Math.min(LENGTH, state.t) - 0.05);
  const unsaid = [];
  const passed = state.before.passed, spoken = said.log;
  if (passed.length || state.before.voices) console.log(`\nOn the way to ${o.from} s the page passed ${passed.map(e => `${e.line} (${e.t.toFixed(2)} s)`).join(', ') || 'no line'}: her mouth alone; voices made before the tap: ${state.before.voices}; where it stood her mouth was ${state.before.speaking ? `speaking (open ${state.before.mouth.toFixed(2)})` : 'at rest'}${state.before.after ? `; at ${state.before.after.t.toFixed(2)} s, just after the tap, it was ${state.before.after.speaking && state.before.after.voices === 0 ? 'SPEAKING ON with no voice' : state.before.after.speaking ? 'speaking a line it was handed' : 'at rest'}` : ''}`);
  console.log(`\nHer lines as the page said them (the show's seconds; a line is heard a little after it is asked for, and her mouth moves from then):`);
  console.log(`  ${pad('line', 20)} ${lead('sheet', 6)} ${lead('handed', 7)} ${lead('late ms', 7)} | ${lead('asked', 6)} ${lead('heard', 6)} ${lead('after ms', 8)} ${lead('over', 6)} ${lead('file s', 6)}  hung on`);
  spoken.forEach((e, i) => {
    const voice = said.voices[i], line = SAID.find(l => l.line === e.line);
    const s2 = x => (x === null || x === undefined ? '-' : x.toFixed(2));
    const after = voice && voice.heardAt !== null && voice.askedAt !== null ? Math.round((voice.heardAt - voice.askedAt) * 1000) : '-';
    console.log(`  ${pad(e.line, 20)} ${lead(e.t.toFixed(2), 6)} ${lead(e.at.toFixed(2), 7)} ${lead(Math.round((e.at - e.t) * 1000), 7)} | ${lead(s2(voice?.askedAt), 6)} ${lead(s2(voice?.heardAt), 6)} ${lead(after, 8)} ${lead(s2(voice?.overAt ?? voice?.stoppedAt), 6)} ${lead(s2(voice?.seconds), 6)}  ${line?.on ?? ''}${voice ? (voice.heardAt === null ? '  NOT HEARD' : voice.overAt === null ? (voice.stoppedAt === null ? '  (still sounding)' : `  (stopped ${s2(voice.at)} s into it)`) : '') : '  NO VOICE'}`);
  });
  for (const l of dueLines) {
    const i = spoken.findIndex(e => e.line === l.line);
    if (i < 0 || !said.voices[i] || said.voices[i].heardAt === null) unsaid.push(l.line);
  }
  const fromBefore = spoken.filter(e => e.t < o.from - 1e-6);
  const extra = said.voices.length - spoken.length + state.before.voices;
  console.log(`  ${spoken.length} lines said of the ${dueLines.length} due; voices the page made: ${said.voices.length}${fromBefore.length ? `; FROM BEFORE ${o.from} s: ${fromBefore.map(e => e.line).join(', ')}` : ''}`);
  const early = log.filter(e => e.t < o.from - 1e-6);
  const order = log.every((e, i) => i === 0 || e.t >= log[i - 1].t);
  const late = Math.max(0, ...log.map(e => e.at - e.t));
  console.log(`\n${log.length} cues played of the ${due.length} due; in order: ${order ? 'yes' : 'NO'}; the latest ${Math.round(late * 1000)} ms after its second; cues from before ${o.from} s: ${early.length}`);
  if (state.t < LENGTH - 0.05) console.log(`Asked at ${state.t.toFixed(2)} s, in the middle of the show: the audio context is ${state.context}, the show's sound ${state.running ? 'running' : 'NOT RUNNING'}, ${state.sounding} of its sources sounding`);
  else console.log(`After the end: the audio context is ${state.context}, the show's sound ${state.running ? 'still RUNNING' : 'ended'}, ${state.sounding} of its sources still sounding`);
  let stale = false;
  if (again) {
    const first = again.log[0];
    stale = again.card || !again.running || !first || first.t !== 0 || again.log.some(e => e.t > again.t + 0.05);
    console.log(`"Aftur": ${again.t.toFixed(2)} s into the show again, the card ${again.card ? 'STILL THERE' : 'gone'}, the sound ${again.running ? 'running' : 'NOT RUNNING'}; played since: ${again.log.map(e => `${e.sound} at ${e.at.toFixed(2)}`).join(', ')}; lines said since: ${again.lines.length} (her first is at ${SAID[0]?.t} s), voices made in all: ${again.voices}`);
    const dueAgain = SAID.filter(l => l.t <= again.t - 0.1).length;
    if (again.lines.length !== dueAgain) { stale = true; console.log(`  (${dueAgain} of her lines were due again by then)`); }
  }
  if (missing.length) console.log(`NOT PLAYED: ${missing.map(c => `${c.sound ?? 'bed'} at ${c.t}`).join(', ')}`);
  if (unsaid.length) console.log(`NOT SAID: ${unsaid.join(', ')}`);
  if (errors.length) console.log(`The page said: ${errors.join(' | ')}`);
  const mouthed = Boolean(state.before.after?.speaking && state.before.after.voices === 0); // (a passed line mouthed on in silence)
  return { result: { log, state, again, said }, bad: Boolean(missing.length || unsaid.length || fromBefore.length || extra > 0 || mouthed || errors.length || early.length || !order || stale) };
}

/** A still (?chapter=tjorn3d&t=<from>, no play=1), then stepped on to --until as a capture is: it must ask for no sound at all. */
async function still(o, base) {
  let at = null, on = null, errors = [];
  const until = o.until < LENGTH ? o.until : Math.min(LENGTH, o.from + 12);
  await withPage(o, async page => {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${spyOnVoices.toString()})()` });
    await page.send('Page.navigate', { url: `${base}?chapter=tjorn3d&t=${o.from}` });
    const t0 = Date.now();
    for (;;) {
      let is = false;
      try { is = await page.evaluate('Boolean(window.__demoReady && window.__advance && window.__world?.tjorn?.lines)'); } catch { /* loading */ }
      if (is) break;
      if (Date.now() - t0 > o.timeout * 1000) throw new Error(`the still did not get ready${page.errors.length ? ': ' + page.errors[0] : ''}`);
      await sleep(250);
    }
    const state = `({ t: window.__world.tjorn.view.t, lines: window.__world.tjorn.lines.log.slice(), cues: window.__world.tjorn.sound.log.length, running: window.__world.tjorn.sound.running, voices: ${VOICES}.length, mouth: window.__world.tjorn.her.mouthOpen, speaking: window.__world.tjorn.her.talking })`;
    at = await page.evaluate(state);
    await page.evaluate(`window.__advance(${until - o.from})`);
    on = await page.evaluate(state);
    errors = [...page.errors];
  });
  const told = s => `the show at ${s.t.toFixed(2)} s; lines handed to the scene so far (her mouth alone): ${s.lines.map(e => `${e.line} at ${e.at.toFixed(2)}`).join(', ') || 'none'}; voices the page made: ${s.voices}; cues the show's sound played: ${s.cues} (${s.running ? 'RUNNING' : 'not started'}); her mouth ${s.speaking ? `speaking (open ${s.mouth.toFixed(2)})` : 'still'}`;
  console.log(`A still at ${o.from} s:\n  ${told(at)}`);
  console.log(`Stepped on to ${until} s as a capture is:\n  ${told(on)}`);
  if (errors.length) console.log(`The page said: ${errors.join(' | ')}`);
  const loud = at.voices + on.voices + at.cues + on.cues > 0 || at.running || on.running;
  if (loud) console.log('A STILL ASKED FOR SOUND.');
  return { result: { at, on }, bad: Boolean(loud || errors.length) };
}

const o = parseArgs(process.argv.slice(2));
if (!o.render && !o.played && !o.still) {
  printSheet();
  process.exit(0);
}
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/remake/`;
let bad = false;
try {
  const { result, bad: wrong } = o.render ? await render(o, base) : o.still ? await still(o, base) : await played(o, base);
  bad = wrong;
  if (o.json) {
    const file = path.resolve(ROOT, o.json);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(result, null, 1));
    console.log(`Written: ${o.json}`);
  }
} catch (error) {
  console.error(error.message);
  bad = true;
} finally {
  server.close();
}
process.exit(bad ? 1 : 0);
