// Audio in and out through ffmpeg: decode any file to float channels, write float WAV, encode MP3.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SR = 44100;

/** Decode `file` to { sr, ch: [Float32Array, ...] } at SR, `channels` channels. */
export function decode(file, channels = 1) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', String(channels), '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`decode ${file}: ${r.stderr}`);
  const buf = r.stdout;
  const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const n = all.length / channels;
  const ch = [];
  for (let c = 0; c < channels; c++) {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = all[i * channels + c];
    ch.push(a);
  }
  return { sr: SR, ch };
}

/** Write 32-bit float WAV. */
export function writeWav(file, chs, sr = SR) {
  mkdirSync(dirname(file), { recursive: true });
  const n = chs[0].length, nc = chs.length;
  const data = Buffer.alloc(n * nc * 4);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) data.writeFloatLE(chs[c][i], (i * nc + c) * 4);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(nc, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * nc * 4, 28); h.writeUInt16LE(nc * 4, 32); h.writeUInt16LE(32, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}

/** Encode a WAV to MP3 (44.1 kHz stereo, 192 kbps CBR). */
export function encodeMp3(wav, mp3) {
  mkdirSync(dirname(mp3), { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ar', String(SR), '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '192k', mp3]);
  if (r.status !== 0) throw new Error(`encode ${mp3}: ${r.stderr}`);
}

/** Run ffmpeg with args, return stderr text. */
export function ffmpeg(args) {
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 28 });
  return String(r.stderr);
}
