// Audio in and out through ffmpeg: decode any file to Float32 mono or stereo at 44.1 kHz, write WAV (32-bit float), encode MP3.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SR = 44100;

/** Decode `file` to Float32Array channels at SR (mono unless channels = 2). */
export function decode(file, channels = 1) {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(channels), '-ar', String(SR), '-'], {
    maxBuffer: 1 << 30,
  });
  const all = new Float32Array(out.buffer, out.byteOffset, out.byteLength / 4);
  if (channels === 1) return [Float32Array.from(all)];
  const n = all.length / channels;
  const chans = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) chans[c][i] = all[i * channels + c];
  return chans;
}

/** Write channels (Float32Array[]) as a 32-bit float WAV. */
export function writeWav(file, chans) {
  mkdirSync(dirname(file), { recursive: true });
  const nc = chans.length;
  const n = chans[0].length;
  const dataBytes = n * nc * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(nc, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * nc * 4, 28);
  buf.writeUInt16LE(nc * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    buf.writeFloatLE(chans[c][i], o);
    o += 4;
  }
  writeFileSync(file, buf);
}

/** Encode a WAV to 192 kbps stereo MP3 at 44.1 kHz. */
export function encodeMp3(wav, mp3) {
  mkdirSync(dirname(mp3), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ac', '2', '-ar', String(SR), '-c:a', 'libmp3lame', '-b:a', '192k', mp3]);
}
