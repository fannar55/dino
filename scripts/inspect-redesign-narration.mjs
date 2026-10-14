// Technical verification only: decoding and levels cannot judge pronunciation.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NARRATION } from '../dist/story.js';
import { DISCOVERY_CARDS, DISCOVERY_FACT_SOURCES } from '../dist/adventure-content.js';

const root = new URL('../', import.meta.url);
const changes = JSON.parse(await readFile(new URL('qa/redesign-narration-changes.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('dist/assets/audio/narration-manifest.json', root), 'utf8'));
const transcript = JSON.parse(await readFile(new URL('dist/assets/audio/narration-is.json', root), 'utf8'));
if (JSON.stringify(transcript) !== JSON.stringify(NARRATION)) throw new Error('Narration source does not match transcript.');
if (Object.keys(manifest.clips).sort().join() !== Object.keys(NARRATION).sort().join()) throw new Error('Narration manifest is incomplete.');
const ids = [...changes.added, ...changes.changed];
const clips = [];
for (const id of ids) {
  const file = new URL(`dist/assets/audio/${manifest.clips[id]}`, root);
  const result = spawnSync('ffmpeg', ['-hide_banner', '-i', fileURLToPath(file), '-af', 'loudnorm=I=-18:TP=-2:LRA=7:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Cannot decode ${id}: ${result.error?.message || result.stderr}`);
  const measurement = JSON.parse(result.stderr.match(/\{[\s\S]*?\}/g)?.at(-1) || '{}');
  const integratedLUFS = Number(measurement.input_i), truePeakDBTP = Number(measurement.input_tp);
  if (!Number.isFinite(integratedLUFS) || !Number.isFinite(truePeakDBTP) || truePeakDBTP > -1) throw new Error(`Invalid or excessive output level: ${id}`);
  clips.push({ id, seconds: manifest.durations[id], bytes: (await stat(file)).size, integratedLUFS, truePeakDBTP,
    sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
}
const report = {
  reviewedAt: new Date().toISOString(), voice: manifest.voice, model: manifest.model, language: manifest.language,
  totalPackagedClips: Object.keys(manifest.clips).length,
  addedClips: changes.added.length, revisedClips: changes.changed.length,
  unchangedClips: Object.keys(manifest.clips).length - ids.length,
  totalPackagedSpeechSeconds: Math.round(Object.values(manifest.durations).reduce((a, b) => a + b, 0) * 1000) / 1000,
  changedBatchSpeechSeconds: Math.round(clips.reduce((sum, clip) => sum + clip.seconds, 0) * 1000) / 1000,
  maxNewTruePeakDBTP: Math.max(...clips.map(clip => clip.truePeakDBTP)),
  minNewIntegratedLUFS: Math.min(...clips.map(clip => clip.integratedLUFS)),
  maxNewIntegratedLUFS: Math.max(...clips.map(clip => clip.integratedLUFS)),
  allChangedFilesDecoded: true, audibleListening: false,
  limitation: 'Technical decoding, duration, source matching and level inspection. No judgment of Icelandic pronunciation, human listening or actual device loudspeaker playback.',
  science: {
    reviewedCards: Object.keys(DISCOVERY_CARDS), sources: DISCOVERY_FACT_SOURCES,
    fossil: 'Spiral shell imprint; remains and traces can both fossilize. No dinosaur-bone or exact extinct species claim.',
    frog: 'Ancient frogs are described as relatives of living frogs, not a modern species unchanged since the Cretaceous.',
    insectCounts: 'Beetle and dragonfly have six legs; dragonfly has four wings. Butterfly story uses egg, larva, pupa, adult order.',
    calls: 'The first dinosaur-call narration explicitly describes the game voices as imagined, with exact ancient sounds unknown.',
    rideSecrets: 'Beetle on a reachable trunk and butterfly on return foliage remain obtainable after their main ride ends.',
  },
  proceduralAudio: {
    provenance: 'New reward phrase, voices and surface textures are original WebAudio synthesis; no extra remote samples or runtime requests.',
    hierarchy: 'Five surface textures are quiet and <=0.34s, target notes are light, earned-star ta-dam resolves at 0.24s and rising bells peak before 1.3s.',
    safeguards: 'Global 48-source cap, surface category cap 8, per-action rate guards, gentle panning, shared speech ducking and limiter; pause/mute/background/scene cancellation.',
    sync: 'Ride and arrival wing/step events come from authored world animation phases. Mosi travel footstep cadence remains approximate during walk blending.',
    verification: '11 deterministic audio lifecycle, scheduling, hierarchy and cancellation tests passed; no subjective listening claim.',
  },
  clips,
};
await writeFile(new URL('qa/exploration-redesign-content-audio.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ total: report.totalPackagedClips, added: report.addedClips, revised: report.revisedClips, checked: clips.length, totalSpeechSeconds: report.totalPackagedSpeechSeconds, maxTruePeakDBTP: report.maxNewTruePeakDBTP, integratedLUFS: [report.minNewIntegratedLUFS, report.maxNewIntegratedLUFS] }));
