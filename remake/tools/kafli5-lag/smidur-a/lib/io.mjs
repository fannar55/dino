// Audio in and out through ffmpeg: decode a file to mono or stereo float PCM at 44.1 kHz, write float WAV, encode mp3, and read
// ffmpeg's loudness meter. Plain Node, no packages.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SR = 44100;

/** Decodes `file` to Float32Array channels at 44.1 kHz (`channels` 1 or 2). */
export function decode(file, channels = 1) {
  const out = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', String(channels), '-ar', String(SR), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  if (out.status !== 0) throw new Error(`decode ${file}: ${out.stderr}`);
  const buf = out.stdout;
  const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (channels === 1) return [Float32Array.from(all)];
  const n = all.length / channels;
  const chans = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) chans[c][i] = all[i * channels + c];
  return chans;
}

/** Writes 32-bit float WAV from channel arrays. */
export function writeWav(file, chans) {
  mkdirSync(dirname(file), { recursive: true });
  const n = chans[0].length;
  const nc = chans.length;
  const data = Buffer.alloc(n * nc * 4);
  let o = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { data.writeFloatLE(chans[c][i], o); o += 4; }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20); // IEEE float
  head.writeUInt16LE(nc, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * nc * 4, 28);
  head.writeUInt16LE(nc * 4, 32);
  head.writeUInt16LE(32, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([head, data]));
}

/** Encodes a WAV to 192 kbps 44.1 kHz stereo mp3. */
export function encodeMp3(wav, mp3) {
  mkdirSync(dirname(mp3), { recursive: true });
  const out = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ar', String(SR), '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', mp3]);
  if (out.status !== 0) throw new Error(`encode ${mp3}: ${out.stderr}`);
}

/** ffmpeg's EBU R128 meter: integrated loudness (LUFS) and true peak (dBTP) of a file. */
export function loudness(file) {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {
    maxBuffer: 1 << 28,
  });
  const text = String(out.stderr);
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const truePeak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1]);
  const lra = Number(/LRA:\s+(-?[\d.]+) LU/.exec(summary)?.[1]);
  return { lufs, truePeak, lra };
}

/** Runs ffmpeg with `args`, throwing on failure. */
export function ffmpeg(args) {
  const out = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 28 });
  if (out.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${out.stderr}`);
}
