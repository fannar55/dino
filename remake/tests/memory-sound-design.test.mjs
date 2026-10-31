import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { SOUND_JOBS, jobHash, requestFor } from '../tools/memory-sound-design.mjs';

test('mastering and playback adjustments preserve generation cache identities, while new creative requests do not', () => {
  for (const job of SOUND_JOBS) {
    assert.equal(jobHash({ ...job, gain: .1, targetLufs: -24, crossfade: .25 }), jobHash(job));
    assert.notEqual(jobHash({ ...job, text: `${job.text} Another distinct variation.` }), jobHash(job));
    assert.notEqual(jobHash({ ...job, seconds: job.seconds + 1 }), jobHash(job));
  }
});

test('the billable catalog remains bounded and all generated originals have a matching shipped asset', () => {
  assert.equal(SOUND_JOBS.length, 21); assert.equal(new Set(SOUND_JOBS.map(job => job.id)).size, 21);
  assert.equal(SOUND_JOBS.filter(job => job.type === 'music').length, 1);
  const folder = new URL('../assets/audio/memory/soundscape/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', folder), 'utf8'));
  assert.equal(Object.keys(manifest.sfx).length, 20);
  for (const job of SOUND_JOBS) {
    const request = requestFor(job), entry = job.type === 'music' ? manifest.music : manifest.sfx[job.id];
    if (job.type === 'music') { assert.equal(request.body.force_instrumental, true); assert.equal(request.body.music_length_ms, 48000); }
    else assert.ok(request.body.duration_seconds >= .5 && request.body.duration_seconds <= 12);
    assert.equal(entry.requestHash, jobHash(job)); assert.ok(statSync(new URL(entry.file, folder)).size > 1000);
    assert.ok(entry.duration > 0 && entry.peak < .995 && entry.rms > 0);
  }
  assert.ok(manifest.music.duration >= 45 && manifest.music.duration <= 60);
});
