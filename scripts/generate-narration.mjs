// Run locally with ELEVENLABS_API_KEY in the environment. Never shipped in dist.
// Example: node scripts/generate-narration.mjs welcome
// Cached/approved-only install: node scripts/generate-narration.mjs --offline welcome
import { readFile, writeFile, mkdir, copyFile, access, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPronunciationResolver } from './pronunciation-rules.mjs';
import { createNarrationModelResolver } from './narration-models.mjs';
import { loadApprovedNarration } from './approved-narration.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const audioDir = path.join(root, 'dist/assets/audio');
const workDir = path.join(root, '.tools/elevenlabs');
const key = process.env.ELEVENLABS_API_KEY;
const voiceId = 'osSKuDKznhXBktjJ9Z9F';
const transcript = JSON.parse(await readFile(path.join(audioDir, 'narration-is.json'), 'utf8'));
if (!Object.keys(transcript).length || Object.entries(transcript).some(([id, text]) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(id) || typeof text !== 'string' || !text.trim())) throw new Error('Invalid narration transcript.');
const pronunciationConfig = JSON.parse(await readFile(path.join(root, 'scripts/pronunciation-overrides.json'), 'utf8'));
// Keep displayed Icelandic untouched; only approved, source-matched speech text
// reaches the provider. Validation happens before any paid generation.
const pronunciation = createPronunciationResolver(transcript, pronunciationConfig);
const modelConfig = JSON.parse(await readFile(path.join(root, 'scripts/narration-models.json'), 'utf8'));
const models = createNarrationModelResolver(transcript, modelConfig, { voiceId, pronunciation });
const approvedConfig = JSON.parse(await readFile(path.join(root, 'scripts/approved-narration.json'), 'utf8'));
const approved = await loadApprovedNarration({ transcript, models, configuration: approvedConfig, scriptsDir: path.join(root, 'scripts') });
let previousClips = {};
try { previousClips = JSON.parse(await readFile(path.join(audioDir, 'narration-manifest.json'), 'utf8')).clips || {}; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const args = process.argv.slice(2), offline = args.includes('--offline');
const selected = args.filter(arg => arg !== '--offline');
if (selected.some(id => !Object.hasOwn(transcript, id))) throw new Error('Unknown narration ID.');
await mkdir(workDir, { recursive: true });
const recordPath = path.join(workDir, 'records.json');
let records = {};
try { records = JSON.parse(await readFile(recordPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr}`);
  return result.stdout;
};
// Fail before consuming credits if the local audio tools are unavailable.
run('ffmpeg', ['-version']); run('ffprobe', ['-version']);
// Every locked master is validated and staged, even when it was not selected.
// These bytes are already mastered: never normalize or synthesize them again.
for (const id of approved.ids) {
  const entry = approved.entryFor(id), outputPath = path.join(workDir, `${id}.mp3`);
  await writeFile(outputPath, approved.bytesFor(id));
  run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', outputPath, '-f', 'null', '-']);
  const seconds = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', outputPath]).trim());
  if (!Number.isFinite(seconds) || Math.abs(seconds - entry.duration) > .002) throw new Error(`Approved narration duration mismatch: ${id}.`);
  records[id] = { ...records[id], inputHash: entry.inputHash, duration: entry.duration, characters: pronunciation.textFor(id).length, approvedAudioSha256: entry.sha256 };
}
if (approved.ids.length) await writeFile(recordPath, JSON.stringify(records, null, 2) + '\n');
for (const id of Object.keys(transcript)) {
  if (selected.length && !selected.includes(id)) continue;
  if (approved.has(id)) { console.log(`Ready ${id}: approved master, ${approved.entryFor(id).duration}s`); continue; }
  const text = pronunciation.textFor(id);
  const { modelId, settings, seed } = models.optionsFor(id);
  const inputHash = models.hashFor(id);
  const rawPath = path.join(workDir, `${id}.raw.mp3`);
  const outputPath = path.join(workDir, `${id}.mp3`);
  let cached = false;
  try { await access(rawPath); cached = records[id]?.inputHash === inputHash; } catch {}
  if (!cached) {
    if (offline) throw new Error(`Offline generation requires a valid cache or approved master: ${id}. No API request was made.`);
    if (!key) throw new Error('Set ELEVENLABS_API_KEY in the local environment to generate uncached narration.');
    console.log(`Generating ${id} (${text.length} characters)...`);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: modelId, language_code: 'is', voice_settings: settings, ...(seed === undefined ? {} : { seed }) }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).replaceAll(key, '[redacted]').slice(0,800)}`);
    if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Expected audio response.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000) throw new Error(`Empty audio for ${id}.`);
    await writeFile(rawPath, bytes);
    records[id] = { inputHash, generatedAt: new Date().toISOString(), characters: text.length };
    await writeFile(recordPath, JSON.stringify(records, null, 2) + '\n');
  }
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', rawPath, '-af', 'loudnorm=I=-18:TP=-2:LRA=7,apad=pad_dur=0.25', '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', outputPath]);
  run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', outputPath, '-f', 'null', '-']);
  const seconds = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', outputPath]).trim());
  if (!(seconds > 0.7 && seconds < 55)) throw new Error(`Unexpected duration for ${id}: ${seconds}`);
  records[id].duration = Math.round(seconds * 1000) / 1000;
  await writeFile(recordPath, JSON.stringify(records, null, 2) + '\n');
  console.log(`Ready ${id}: ${records[id].duration}s`);
}
// Publish a complete, validated voice set together, never a partial replacement.
if (Object.keys(transcript).every(id => records[id]?.inputHash === models.hashFor(id) && records[id]?.duration)) {
  for (const id of Object.keys(transcript)) await access(path.join(workDir, `${id}.mp3`));
  for (const id of Object.keys(transcript)) {
    if (approved.has(id)) await writeFile(path.join(audioDir, `${id}.mp3`), approved.bytesFor(id));
    else await copyFile(path.join(workDir, `${id}.mp3`), path.join(audioDir, `${id}.mp3`));
  }
  const manifest = {
    language: 'is-IS', voice: 'ElevenLabs — default ice', provider: 'ElevenLabs', ...models.manifestMetadata(),
    clips: Object.fromEntries(Object.keys(transcript).map(id => [id, `${id}.mp3`])),
    durations: Object.fromEntries(Object.keys(transcript).map(id => [id, records[id].duration])),
    source: 'https://elevenlabs.io/',
    pronunciationOverrides: Object.keys(pronunciationConfig.overrides),
    approvedAudio: approved.manifestMetadata(),
    generatedWith: 'Per-clip models and settings listed in modelByClip, profileByClip and generationProfiles; Icelandic (is); generated clips normalized -18 LUFS, MP3 mono 44100Hz 96kbps; approvedAudio masters installed byte-for-byte',
    generatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(audioDir, 'narration-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  // Remove only superseded narration named by the prior manifest; retain music,
  // licensed effects and source/license documents, never recurse through assets.
  const retained = new Set(Object.values(manifest.clips));
  for (const [oldId, filename] of Object.entries(previousClips)) {
    if (retained.has(filename)) continue;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(oldId) || filename !== `${oldId}.mp3`) throw new Error('Unsafe obsolete narration filename.');
    const obsolete = path.resolve(audioDir, filename);
    if (path.dirname(obsolete) !== path.resolve(audioDir)) throw new Error('Narration cleanup escaped audio directory.');
    try { await unlink(obsolete); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    console.log(`Removed obsolete narration ${oldId}.`);
  }
  console.log(`Installed all ${Object.keys(transcript).length} ElevenLabs recordings.`);
} else console.log('Partial generation cached locally; deployed audio unchanged.');
