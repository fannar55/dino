// Reading and writing audio through ffmpeg: decode any file to Float32 at 44.1 kHz, write float WAV, encode MP3.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SR = 44100;

/** Decode a file to mono (or the given channel count) Float32Arrays at SR. */
export function decode(file, channels = 1) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(channels), '-ar', String(SR), 'pipe:1'], {
    maxBuffer: 1 << 30,
  });
  const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (channels === 1) return [Float32Array.from(all)];
  const n = all.length / channels;
  const out = [];
  for (let c = 0; c < channels; c++) {
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = all[i * channels + c];
    out.push(ch);
  }
  return out;
}

/** Write a 32-bit float stereo WAV. */
export function writeWav(file, left, right) {
  mkdirSync(dirname(file), { recursive: true });
  const n = left.length;
  const inter = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    inter[2 * i] = left[i];
    inter[2 * i + 1] = right[i];
  }
  const data = Buffer.from(inter.buffer); // little-endian on every machine this runs on
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20); // IEEE float
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 8, 28);
  head.writeUInt16LE(8, 32);
  head.writeUInt16LE(32, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([head, data]));
}

/** Encode a WAV to MP3 (44.1 kHz stereo, CBR 192 kbps). */
export function encodeMp3(wav, mp3) {
  mkdirSync(dirname(mp3), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ar', String(SR), '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', mp3]);
}

export function ffmpeg(args) {
  return execFileSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
}

/** ffmpeg's EBU R128 reading of a file: { lufs, truePeak, lra }. */
export function ebur128(file) {
  const text = spawnText(['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const truePeak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary.slice(summary.indexOf('True peak')))?.[1]);
  const lra = Number(/LRA:\s+(-?[\d.]+) LU/.exec(summary)?.[1]);
  return { lufs, truePeak, lra };
}

import { spawnSync } from 'node:child_process';
function spawnText(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  return String(r.stderr || '') + String(r.stdout || '');
}
export { spawnText };
