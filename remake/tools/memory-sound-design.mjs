#!/usr/bin/env node
// One bounded, serial ElevenLabs batch. Defaults to a non-billable plan.
// --credits reads quota; --generate creates only missing, never-attempted jobs;
// --master reprocesses cached originals without any network calls.
// --audit decodes the shipped files and checks durations, peaks and loop seams.
// A started/unknown/rejected request is never retried automatically.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'remake/assets/audio/memory/soundscape');
const cache = path.join(root, 'qa/memory/soundscape-generation');
const base = 'https://api.elevenlabs.io';
const sound = (id, seconds, text, options = {}) => ({ id, type: 'sfx', seconds, text, gain: .7, targetLufs: -20, ...options });
export const SOUND_JOBS = Object.freeze([
  sound('triceratops', .8, 'One tiny friendly baby dinosaur makes two soft breathy pruff-pruff calls, round nasal chest resonance and a little puppy-like curiosity. Organic creature voice, close and dry. No words, human speech, music, threatening roar, echo or background.', { gain: .85 }),
  sound('stegosaurus', .7, 'One tiny friendly baby dinosaur makes a short warm bu-bup, two rounded playful throaty notes with a soft breathy finish. Distinct small animal vocalization, close and dry. No words, human speech, music, threatening roar, echo or background.', { gain: .85 }),
  sound('brontosaurus', 1, 'One gentle baby long-neck dinosaur makes a warm low muuu humming animal call, softly rising then falling, breathy chest resonance, curious and reassuring. Close dry creature sound. No words, human speech, music, elephant trumpet, frightening roar or background.', { gain: .85 }),
  sound('leaf', .5, 'A single large fresh green leaf gently folds open: soft leafy swish, papery rustle and delicate stem flex. One clear short gesture, close dry foley, preschool game, no sharp click, music, voices or background.', { gain: .55 }),
  sound('straw', .7, 'A tiny friendly animal settles into a soft moss and leaf nest: one short fluffy brush and warm dry leaf rustle. Intimate gentle foley, no animal voice, music, impact, echo or background.', { gain: .45 }),
  sound('foot', .5, 'One small padded dinosaur foot lands softly on mossy earth over a wooden surface: one rounded low thup with a tiny dry leaf crunch. A single isolated footfall at the start, gentle and close, no repeated walking, music, voice or background.', { gain: .38, trim: .32 }),
  sound('branch-lift', 1.6, 'A leafy wooden branch is gently lifted upward: warm slow wood flexing creak and delicate leaves brushing, modest effort, small scale, friendly woodland game. One movement with a soft ending, no breaking, crash, voices, music or scary tension.', { gain: .65 }),
  sound('branch-lower', 1.1, 'A leafy wooden branch gently lowers into its resting place: soft descending wood flex creak, leaves brush and settle quietly. One movement, close natural foley, no breaking, impact, voice or music.', { gain: .55 }),
  sound('log-roll', 2.2, 'One hollow wooden log rolls slowly a quarter turn across soft earth: rounded woody rumble, small bark rubs and tiny leaf crunches, beginning gently and settling. Friendly miniature woodland foley, no crash, heavy bass, voices or music.', { gain: .65 }),
  sound('bridge-land', 1.1, 'A hollow wooden log settles onto two soft riverbanks with one warm low wooden tok and a brief gentle earth crumble. Soft satisfying landing for a child game. No splash, crash, sharp crack, voices or music.', { gain: .7 }),
  sound('bark-pickup', 1, 'Two small animals carefully lift a broad bark plank off a small stack: a soft woody scrape, tiny fibers brushing and a short warm creak. Delicate close dry foley, one gentle pickup. No voices, animal calls, music or sharp impacts.', { gain: .55 }),
  sound('bark-place', .8, 'One broad bark plank is gently placed flat onto another wooden panel: a rounded light wooden tok followed by fine dry bark rustle. One soft satisfying contact, child-friendly close foley. No sharp nail hammer, crash, voices or music.', { gain: .7 }),
  sound('match-chime', 1.2, 'A short friendly success sound for a woodland preschool game: three softly struck warm wooden marimba notes C E G ascending, with a tiny felted bell sparkle and rounded natural decay. Sparse, acoustic, no arcade beeps, voices, drums or background music.', { gain: .5 }),
  sound('win', 2.8, 'A small gentle woodland discovery fanfare: warm marimba and soft plucked nylon strings play a cheerful C major pentatonic five-note rising phrase then a peaceful soft chord, with one subtle wooden shaker. Child-friendly and restrained, no vocals, loud brass, drums or arcade synths.', { gain: .55 }),
  sound('river', 12, 'Seamless quiet woodland river ambience: close soft flowing water over smooth stones, distant light leaf breeze and extremely sparse tiny songbirds far away. Stable peaceful bed, no splashes, sudden bird cries, insects, voices, music or dramatic changes.', { gain: .65, targetLufs: -28, loop: true, crossfade: .75 }),
  { id: 'woodland-theme', type: 'music', seconds: 48, gain: .42, duckGain: .15, targetLufs: -18, loop: true, crossfade: 3,
    text: 'Original instrumental background loop for a gentle preschool dinosaur memory and cooperation game in a sunlit woodland. Exactly 48 seconds, 80 BPM, C major pentatonic, steady 4/4, sixteen bars. Warm wooden marimba, sparse felt piano, light nylon-string plucks, delicate pizzicato strings and occasional airy flute answers. Curious, tender, friendly, unhurried. Small melodic phrases with ample silence for spoken narration and creature calls. Consistent soft dynamics, no build, no dramatic climax, no intro, no outro, no final cadence; last harmony and pulse naturally reconnect to the first bar. No vocals, humming, speech, choir, heavy percussion, brass, electronic beeps or sound effects. Acoustic storybook texture, clear and intimate, gentle low end.' },
]);

export function requestFor(job) {
  return job.type === 'music'
    ? { endpoint: '/v1/music?output_format=mp3_44100_128', body: { prompt: job.text, music_length_ms: job.seconds * 1000, model_id: 'music_v2_5', force_instrumental: true } }
    : { endpoint: '/v1/sound-generation?output_format=mp3_44100_128', body: { text: job.text, duration_seconds: job.seconds, prompt_influence: .5, loop: Boolean(job.loop), model_id: 'eleven_text_to_sound_v2' } };
}
export const jobHash = job => createHash('sha256').update(JSON.stringify(requestFor(job))).digest('hex').slice(0, 20);
const exists = file => access(file).then(() => true, () => false);
async function json(file, value) { await writeFile(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`); await rename(`${file}.tmp`, file); }
const key = () => { if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is unavailable'); return process.env.ELEVENLABS_API_KEY; };
async function credits() {
  const response = await fetch(`${base}/v1/user/subscription`, { headers: { 'xi-api-key': key() }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Read-only credit check HTTP ${response.status}; response body withheld`);
  const value = await response.json();
  return { available: Math.max(0, value.character_limit - value.character_count), used: value.character_count, limit: value.character_limit };
}
function ffmpeg(args) { return execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8', maxBuffer: 8 << 20, stdio: ['ignore', 'pipe', 'pipe'] }); }
function duration(file) { return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()); }
async function master(job, raw) {
  const file = `${job.id}.mp3`, full = path.join(output, file), measured = duration(raw), length = Math.min(job.seconds, measured);
  const filters = [`highpass=f=${job.type === 'music' ? 45 : job.id === 'river' ? 100 : 65}`, `lowpass=f=${job.type === 'music' ? 14000 : 11000}`];
  if (!job.loop) filters.push('silenceremove=start_periods=1:start_duration=0.01:start_threshold=-48dB');
  if (job.trim) filters.push(`atrim=duration=${job.trim}`);
  filters.push(`loudnorm=I=${job.targetLufs}:TP=-2:LRA=7`, 'aresample=44100');
  const intermediate = path.join(cache, `${job.id}-${jobHash(job)}-master.wav`);
  if (job.loop) {
    const fade = job.crossfade, middleEnd = length - fade;
    const graph = `[0:a]atrim=duration=${length},${filters.join(',')},asplit=3[one][two][three];[one]atrim=start=${fade}:end=${middleEnd},asetpts=PTS-STARTPTS[mid];[two]atrim=start=${middleEnd}:end=${length},asetpts=PTS-STARTPTS[tail];[three]atrim=start=0:end=${fade},asetpts=PTS-STARTPTS[head];[tail][head]acrossfade=d=${fade}:c1=qsin:c2=qsin[seam];[mid][seam]concat=n=2:v=0:a=1[out]`;
    ffmpeg(['-v', 'error', '-i', raw, '-filter_complex', graph, '-map', '[out]', '-ac', job.type === 'music' ? '2' : '1', '-c:a', 'pcm_s16le', intermediate]);
  } else {
    filters.push('afade=t=in:d=0.008', 'areverse', 'afade=t=in:d=0.035', 'areverse');
    ffmpeg(['-v', 'error', '-i', raw, '-af', filters.join(','), '-ac', '1', '-c:a', 'pcm_s16le', intermediate]);
  }
  const seconds = duration(intermediate);
  // Integrated loudness gating is unreliable on sub-second cues. Give those a
  // measured RMS target, bounded by the peak ceiling; loops keep their LUFS mix.
  const measuredPcm = execFileSync('ffmpeg', ['-v', 'error', '-i', intermediate, '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 16 << 20 });
  const measuredSamples = new Float32Array(measuredPcm.buffer, measuredPcm.byteOffset, measuredPcm.byteLength / 4);
  let measuredPeak = 0, measuredSquare = 0;
  for (const value of measuredSamples) { measuredPeak = Math.max(measuredPeak, Math.abs(value)); measuredSquare += value * value; }
  const measuredRms = Math.sqrt(measuredSquare / measuredSamples.length);
  const targetRms = ['triceratops', 'stegosaurus', 'brontosaurus', 'match-chime', 'win'].includes(job.id) ? .075 : .05;
  const scale = Math.min(.76 / Math.max(.00001, measuredPeak), job.loop ? 1 : targetRms / Math.max(.00001, measuredRms));
  ffmpeg(['-v', 'error', '-i', intermediate, '-af', `volume=${scale}`, '-c:a', 'libmp3lame', '-b:a', job.type === 'music' ? '160k' : '128k', '-write_xing', '1', full]);
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', full, '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 16 << 20 });
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let peak = 0, square = 0; for (const value of samples) { peak = Math.max(peak, Math.abs(value)); square += value * value; }
  if (!Number.isFinite(peak) || peak > 1.001 || peak < .002) throw new Error(`${job.id}: invalid decoded amplitude`);
  return { file, duration: Math.round(seconds * 1000) / 1000, gain: job.gain, loop: Boolean(job.loop), ...(job.loop ? { loopStart: 0, loopEnd: seconds } : {}), ...(job.duckGain ? { duckGain: job.duckGain } : {}),
    requestHash: jobHash(job), peak: Math.round(peak * 10000) / 10000, rms: Math.round(Math.sqrt(square / samples.length) * 10000) / 10000 };
}
async function generate(job) {
  const hash = jobHash(job), recordFile = path.join(cache, `${job.id}-${hash}.json`), raw = path.join(cache, `${job.id}-${hash}.mp3`);
  if (await exists(recordFile)) {
    const record = JSON.parse(await readFile(recordFile, 'utf8'));
    if (record.state === 'received' && await exists(raw)) return raw;
    throw new Error(`${job.id}: prior request is ${record.state}; automatic paid retry is forbidden`);
  }
  if (await exists(raw)) throw new Error(`${job.id}: cached original has no request ledger; inspect before generation`);
  const request = requestFor(job), record = { id: job.id, hash, request, state: 'started', startedAt: new Date().toISOString() };
  await json(recordFile, record); // Durable write BEFORE the billable request.
  try {
    const response = await fetch(`${base}${request.endpoint}`, { method: 'POST', headers: { 'xi-api-key': key(), 'Content-Type': 'application/json' }, body: JSON.stringify(request.body), redirect: 'error', signal: AbortSignal.timeout(240000) });
    if (!response.ok) {
      record.state = response.status < 500 ? 'rejected' : 'unknown'; record.httpStatus = response.status; await json(recordFile, record);
      throw new Error(`${job.id}: generation HTTP ${response.status}; body withheld; no retry`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000 || !/audio|octet-stream/.test(response.headers.get('content-type') || '')) throw new Error(`${job.id}: unexpected audio response; no retry`);
    await writeFile(`${raw}.tmp`, bytes); await rename(`${raw}.tmp`, raw);
    record.state = 'received'; record.bytes = bytes.length; record.receivedAt = new Date().toISOString();
    record.billedCredits = Number(response.headers.get('character-cost')) || null; record.songId = response.headers.get('song-id') || undefined;
    await json(recordFile, record); console.log(`Received ${job.id} (${bytes.length} bytes)`); return raw;
  } catch (error) {
    if (record.state === 'started') { record.state = 'unknown'; await json(recordFile, record); }
    // Never stringify fetch exceptions or raw server bodies: only a safe local message.
    throw new Error(`${job.id}: ${record.state} request outcome. Cached ledger preserved; no automatic retry.`);
  }
}
async function audit() {
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  const rows = [];
  for (const job of SOUND_JOBS) {
    const entry = job.type === 'music' ? manifest.music : manifest.sfx[job.id];
    if (!entry || entry.requestHash !== jobHash(job)) throw new Error(`${job.id}: missing or stale manifest entry`);
    const full = path.join(output, entry.file);
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', full, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], { maxBuffer: 16 << 20 });
    const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let peak = 0, square = 0, maxStep = 0;
    for (let i = 0; i < samples.length; i++) { const v = samples[i]; peak = Math.max(peak, Math.abs(v)); square += v * v; if (i) maxStep = Math.max(maxStep, Math.abs(v - samples[i - 1])); }
    const seconds = samples.length / 44100, seamStep = Math.abs(samples[0] - samples.at(-1));
    if (peak >= .995 || peak < .002 || !Number.isFinite(peak)) throw new Error(`${job.id}: clipping, silence or invalid audio`);
    if (Math.abs(seconds - entry.duration) > .035) throw new Error(`${job.id}: decoded duration differs from manifest`);
    if (entry.loop && seamStep > Math.max(.005, maxStep * 1.1)) throw new Error(`${job.id}: loop boundary is an amplitude outlier`);
    rows.push({ id: job.id, seconds, peak, rms: Math.sqrt(square / samples.length), ...(entry.loop ? { seamStep, maxStep } : {}) });
  }
  const ledgers = await Promise.all(SOUND_JOBS.map(job => readFile(path.join(cache, `${job.id}-${jobHash(job)}.json`), 'utf8').then(JSON.parse)));
  if (ledgers.some(entry => entry.state !== 'received')) throw new Error('Incomplete generation ledger');
  const result = { passed: true, assets: rows.length, knownSfxCredits: ledgers.filter(entry => entry.id !== 'woodland-theme').reduce((sum, entry) => sum + (entry.billedCredits || 0), 0), musicCredits: ledgers.find(entry => entry.id === 'woodland-theme').billedCredits, rows };
  await json(path.join(cache, 'audit.json'), result); console.log(JSON.stringify(result, null, 2));
}
async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--audit')) { await audit(); return; }
  if (args.has('--credits')) { const value = await credits(); console.log(JSON.stringify({ availableCredits: value.available })); return; }
  if (!args.has('--generate') && !args.has('--master')) {
    console.log(JSON.stringify({ requests: SOUND_JOBS.length, musicSeconds: 48, sfxSeconds: SOUND_JOBS.filter(j => j.type === 'sfx').reduce((sum, j) => sum + j.seconds, 0), jobs: SOUND_JOBS.map(j => ({ id: j.id, seconds: j.seconds, hash: jobHash(j), model: requestFor(j).body.model_id })), note: 'No generation requests were made.' }, null, 2)); return;
  }
  await mkdir(output, { recursive: true }); await mkdir(cache, { recursive: true });
  await json(path.join(output, 'catalog.json'), { version: 1, provider: 'ElevenLabs', jobs: SOUND_JOBS });
  if (args.has('--generate')) { const quota = await credits(); await json(path.join(cache, 'credit-check.json'), { checkedAt: new Date().toISOString(), available: quota.available }); console.log(`Read-only quota check: ${quota.available} credits available`); if (quota.available < 5000) throw new Error('Insufficient included-credit headroom for this bounded batch; no generation started'); }
  const manifest = { version: 1, provider: 'ElevenLabs', music: null, sfx: {} };
  for (const job of SOUND_JOBS) {
    const raw = args.has('--generate') ? await generate(job) : path.join(cache, `${job.id}-${jobHash(job)}.mp3`);
    const entry = await master(job, raw);
    if (job.type === 'music') manifest.music = { id: job.id, ...entry }; else manifest.sfx[job.id] = entry;
    await json(path.join(output, 'manifest.json'), manifest); console.log(`Mastered ${job.id}: ${entry.duration}s`);
  }
  console.log(`Completed ${SOUND_JOBS.length} cached assets; manifest saved.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
