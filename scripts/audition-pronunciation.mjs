// Local listening experiment only. Never installs candidates into the game.
// Inspect cost/text first: node scripts/audition-pronunciation.mjs
// Generate at most three short candidates: node scripts/audition-pronunciation.mjs --generate
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'qa/pronunciation/mylla');
const cache = path.join(root, '.tools/elevenlabs/auditions/mylla');
const voiceId = 'osSKuDKznhXBktjJ9Z9F';
const settings = { stability: 0.5, similarity_boost: 0.75, speed: 0.95 };
const clipId = 'mini_trex_invite';
const transcript = JSON.parse(await readFile(path.join(root, 'dist/assets/audio/narration-is.json'), 'utf8'));
const sourceText = transcript[clipId];
if (typeof sourceText !== 'string' || sourceText.split('myllu').length !== 2) throw new Error('Expected one myllu in the source clip; review audition variants.');
const samples = [
  { id: 'B-original-text', label: 'B — ný upptaka með óbreyttum texta', text: sourceText },
  { id: 'C-millu', label: 'C — framburðarprófun: millu', text: sourceText.replace('myllu', 'millu') },
  { id: 'D-mil-lu', label: 'D — framburðarprófun: mil-lu', text: sourceText.replace('myllu', 'mil-lu') },
];
if (process.argv.slice(2).some(arg => arg !== '--generate')) throw new Error('Only --generate is supported.');
const sourceHash = createHash('sha256').update(sourceText).digest('hex');
const candidateBudget = samples.reduce((sum, sample) => sum + sample.text.length, 0);
if (candidateBudget > 300) throw new Error('Audition character budget exceeded.');
console.log(JSON.stringify({ clipId, sourceText, voice: 'default ice', model: 'eleven_v3', maximumNewCharacters: candidateBudget, samples }, null, 2));
if (!process.argv.includes('--generate')) process.exit(0);

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY must come from the local environment.');
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr}`);
  return result.stdout;
};
run('ffmpeg', ['-version']); run('ffprobe', ['-version']);
await mkdir(output, { recursive: true }); await mkdir(cache, { recursive: true });
const original = path.join(root, 'dist/assets/audio', `${clipId}.mp3`);
await copyFile(original, path.join(output, 'A-existing.mp3'));
const manifest = { createdAt: new Date().toISOString(), clipId, sourceText, sourceHash, voice: 'default ice', model: 'eleven_v3', language: 'is', settings, generatedCharacters: 0, approved: false,
  samples: [{ id: 'A-existing', label: 'A — núverandi upptaka í leiknum', file: 'A-existing.mp3', source: 'existing production recording' }] };
for (const sample of samples) {
  const payload = { text: sample.text, model_id: 'eleven_v3', language_code: 'is', voice_settings: settings };
  const hash = createHash('sha256').update(JSON.stringify({ voiceId, payload })).digest('hex');
  const raw = path.join(cache, `${sample.id}-${hash}.raw.mp3`);
  let cached = false;
  try { await access(raw); cached = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!cached) {
    console.log(`Generating ${sample.id} (${sample.text.length} characters)`);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).replaceAll(key, '[redacted]').slice(0, 500)}`);
    if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Expected audio response.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000) throw new Error('Empty audition audio.');
    await writeFile(raw, bytes);
    manifest.generatedCharacters += sample.text.length;
  }
  const file = `${sample.id}.mp3`;
  const target = path.join(output, file);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-18:TP=-2:LRA=7,apad=pad_dur=0.25', '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', target]);
  run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', target, '-f', 'null', '-']);
  const duration = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', target]).trim());
  if (!(duration > 3 && duration < 25)) throw new Error(`Unexpected audition duration: ${duration}`);
  manifest.samples.push({ ...sample, file, duration, payloadHash: hash, cached });
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Ready ${sample.id}: ${duration.toFixed(2)}s`);
}
manifest.productionRecordingUnchanged = Buffer.compare(await readFile(original), await readFile(path.join(output, 'A-existing.mp3'))) === 0;
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, samples: manifest.samples.length, generatedCharacters: manifest.generatedCharacters, productionRecordingUnchanged: manifest.productionRecordingUnchanged }));
