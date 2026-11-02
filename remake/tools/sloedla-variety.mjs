#!/usr/bin/env node
// Söngur Slóeðlu: is every song its own? The first songs came out alike (2026-10-30: the same start, two forms among nine, tap
// rhythms 96-100 % alike), so every song (engine/sloedla/v2) is compared with every other:
//   the tap rhythm  where the child's notes fall, bar by bar in order (barn, the normal version): under 60 % alike
//   the form        its sections' lengths and repeats ('4A 8B 8C 8B'): never the same as another's
//   the start       (--starts, in a browser) the spectrum of its first 2.5 s with nobody playing: under 85 % alike (goal 80 %);
//                   and, for a look, its first seconds played well
// Why 2.5 s: in a song of the new kind nobody playing means every note missed, and a missed note muffles that dinosaur's layers,
// so after its first notes the bare song is no longer the song; no note falls before 2.5 s (v2/format.js FIRST_NOTE).
//
//   node remake/tools/sloedla-variety.mjs                          the tap rhythms and forms; exit 1 if a song is too like another
//   node remake/tools/sloedla-variety.mjs --starts [--seconds 8] [--lock <dir>]
//                                                                  records every song's start in headless Edge from the running lab
//                                                                  (port 4231) and compares the spectra; exit 1 above 85 %
// --lock <dir> is taken (mkdir) for the recording and given back after, so two captures never run at once.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timelineOf } from '../engine/sloedla/v2/format.js';
import { sectionChart } from '../engine/sloedla/v2/chart.js';

const TAPS_ALIKE = 0.6;
const START_ALIKE = 0.85;
const START_GOAL = 0.8;

/** The child's notes (barn, normal) of a song, as { t, role }, with its beat. */
function childNotes(song) {
  const { beat, sections } = timelineOf(song);
  return { beat, notes: sections.flatMap((_, i) => sectionChart(song, i, 'normal')) };
}

/** The child's taps bar by bar: for each bar a string of role and eighth (0-7) of each note, sorted, joined by ','. */
export function tapsOf(song) {
  const { beat, notes } = childNotes(song);
  const bar = 4 * beat;
  const { length } = timelineOf(song);
  const bars = Array.from({ length: Math.round(length / bar) }, () => []);
  for (const note of notes) {
    const index = Math.floor(note.t / bar + 1e-6);
    const eighth = Math.round(((note.t - index * bar) / beat) * 2);
    bars[index]?.push(`${note.role}${eighth}`);
  }
  return bars.map(taps => taps.sort().join(','));
}

/** The form: each section's bars and a letter for its name, in order of first appearance ('4A 8B 8C 8B 4D'). */
export function formOf(song) {
  const sections = song.sections.map(s => [s.name, s.bars]);
  const letters = new Map();
  return sections.map(([name, bars]) => {
    if (!letters.has(name)) letters.set(name, String.fromCharCode(65 + letters.size));
    return `${bars}${letters.get(name)}`;
  }).join(' ');
}

/** How alike two tap rhythms are: the share of bars, in order over the shorter, with the very same taps. */
export function tapLikeness(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let same = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) same++;
  return same / n;
}

/** What makes a song of `newSongs` too like one of `otherSongs` (itself left out), a line each. */
export function varietyProblems(newSongs, otherSongs) {
  const problems = [];
  for (const song of newSongs) {
    const taps = tapsOf(song);
    const form = formOf(song);
    for (const other of otherSongs) {
      if (other === song) continue;
      const alike = tapLikeness(taps, tapsOf(other));
      if (alike >= TAPS_ALIKE) problems.push(`${song.id} ~ ${other.id}: tap rhythm ${(100 * alike).toFixed(0)} % alike (under ${100 * TAPS_ALIKE} %)`);
      if (formOf(other) === form) problems.push(`${song.id} ~ ${other.id}: the same form (${form})`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// The starts, in a browser

const RATE = 22050, N = 4096, HOP = 2048;
const EDGES = Array.from({ length: 25 }, (_, i) => 50 * (10000 / 50) ** (i / 24));

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** A clip's spectrum shape: the mean power in 24 log bands (50 Hz-10 kHz), in log, minus its mean. */
export function spectrumShape(samples) {
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const bands = new Float64Array(24);
  const re = new Float64Array(N), im = new Float64Array(N);
  let frames = 0;
  for (let s = 0; s + N <= samples.length; s += HOP) {
    for (let i = 0; i < N; i++) { re[i] = samples[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * RATE) / N;
      const b = EDGES.findIndex((e, i) => f >= e && f < EDGES[i + 1]);
      if (b >= 0) bands[b] += re[k] * re[k] + im[k] * im[k];
    }
    frames++;
  }
  const logs = [...bands].map(v => Math.log10(v / Math.max(1, frames) + 1e-12));
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  return logs.map(v => v - mean);
}

const cosine = (a, b) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / Math.sqrt(x * y);
};

const decode = file => {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
};

/** Records the first `seconds` of each song (the lab's glue; the pretend child playing `how`) in headless Edge into `dir`/<how>-<id>.webm. */
async function recordStarts(ids, dir, seconds, how = 'ekkert') {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const exe = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sloedla-variety-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== '__COMPAT_LAYER'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--window-size=1280,800', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', env });
  try {
    const portFile = path.join(userDir, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
    let lines = [];
    for (let i = 0; i < 50; i++) { lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (lines.length >= 2) break; await sleep(100); }
    const ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
    });
    const cdp = (method, params = {}, sessionId) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params, sessionId })); return new Promise((res, rej) => pending.set(i, { res, rej })); };
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp(m, p, sessionId);
    await send('Page.enable');
    await send('Runtime.enable');
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr, ms = 60000) => {
      const s = Date.now();
      while (Date.now() - s < ms) { try { if (await ev(`Boolean(${expr})`)) return true; } catch { /* loading */ } await sleep(100); }
      return false;
    };
    for (const song of ids) {
      await send('Page.navigate', { url: `http://127.0.0.1:4231/remake/sloedla-lab.html?hljod=0&dj=0&ahorfendur=0&sjalf=${how}&lag=${song}` });
      await sleep(300);
      await waitFor('window.__sloedlaReady === true');
      await ev(`(async () => {
        const { context, glue } = window.__sloedla.audio;
        const sink = context.createMediaStreamDestination();
        glue.connect(sink);
        const chunks = [];
        const rec = new MediaRecorder(sink.stream, { mimeType: 'audio/webm;codecs=opus' });
        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        window.__clip = null;
        rec.onstop = () => { const r = new FileReader(); r.onload = () => { window.__clip = r.result; }; r.readAsDataURL(new Blob(chunks, { type: 'audio/webm' })); };
        document.getElementById('play').click();
        await new Promise(r => { const t = setInterval(() => { if (window.__sloedla.round) { clearInterval(t); r(); } }, 50); });
        rec.start(500);
        setTimeout(() => rec.stop(), ${seconds * 1000});
        return true;
      })()`);
      await waitFor('typeof window.__clip === "string"', (seconds + 30) * 1000);
      const data = await ev('window.__clip');
      await fsp.writeFile(path.join(dir, `${how}-${song}.webm`), Buffer.from(data.slice(data.indexOf('base64,') + 7), 'base64'));
      console.log(`  recorded ${how} ${song}`);
    }
    ws.close();
  } finally {
    proc.kill();
    await sleep(300);
    await fsp.rm(userDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function starts({ seconds, lock }) {
  const { SONGS_V2 } = await import('../engine/sloedla/v2/songs/index.js');
  const songs = SONGS_V2.filter(e => fs.existsSync(new URL(`../engine/sloedla/v2/songs/${e.file}`, import.meta.url))).map(e => e.id);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sloedla-starts-'));
  if (lock) fs.mkdirSync(lock); // throws if another capture holds it
  try {
    await recordStarts(songs, dir, seconds, 'ekkert');
    await recordStarts(songs, dir, seconds, '1');
  } finally {
    if (lock) fs.rmSync(lock, { recursive: true, force: true });
  }
  // the clip starts as the round does, 0.4 s before the song's first beat (the clock's lead)
  const LEAD = 0.4, BARE = 2.5;
  const compare = (how, from, to) => {
    const shapes = Object.fromEntries(songs.map(id => {
      const samples = decode(path.join(dir, `${how}-${id}.webm`));
      return [id, spectrumShape(samples.subarray(Math.round(from * RATE), Math.round(to * RATE)))];
    }));
    let worst = 0;
    for (const id of songs) {
      const rows = Object.keys(shapes).filter(other => other !== id).map(other => [other, cosine(shapes[id], shapes[other])]).sort((a, b) => b[1] - a[1]);
      worst = Math.max(worst, rows[0][1]);
      console.log(`  ${id}: most alike ${rows.slice(0, 3).map(([o, c]) => `${o} ${(100 * c).toFixed(0)} %`).join(', ')}`);
    }
    console.log(`  the highest: ${(100 * worst).toFixed(0)} %`);
    return worst;
  };
  console.log(`the first ${BARE} s, nobody playing (limit ${100 * START_ALIKE} %, goal under ${100 * START_GOAL} %):`);
  const bare = compare('ekkert', LEAD, LEAD + BARE);
  console.log(`the first ${seconds} s, played well (for a look):`);
  compare('1', LEAD, LEAD + seconds);
  return bare <= START_ALIKE;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const value = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  if (argv.includes('--starts')) {
    const ok = await starts({ seconds: Number(value('--seconds') ?? 8), lock: value('--lock') });
    process.exit(ok ? 0 : 1);
  }
  const { SONGS_V2 } = await import('../engine/sloedla/v2/songs/index.js');
  const songs = await Promise.all(SONGS_V2.filter(e => fs.existsSync(new URL(`../engine/sloedla/v2/songs/${e.file}`, import.meta.url))).map(async e => (await e.load()).default));
  for (const song of songs) {
    const taps = tapsOf(song);
    const best = songs.filter(o => o !== song).map(o => [o.id, tapLikeness(taps, tapsOf(o))]).sort((a, b) => b[1] - a[1])[0];
    console.log(`${song.id}: form ${formOf(song)}; tap rhythm most like ${best?.[0]} (${(100 * (best?.[1] ?? 0)).toFixed(0)} %)`);
  }
  const problems = varietyProblems(songs, songs);
  for (const problem of problems) console.log(`  too alike: ${problem}`);
  process.exit(problems.length ? 1 : 0);
}
