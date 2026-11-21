// The browser's cache in the cloud (cloud/src/cache.mjs): the game's sounds, pictures, models and font keep for a day, so a
// tablet opening the game again does not ask the cloud about each of them; its code, pages and lists ask every time, so a
// deploy reaches them at once. The static assets take the day from site/_headers (written by stage.mjs); the sounds come
// through the Worker (run_worker_first), whose answers _headers does not touch, so the Worker gives them the day itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_CACHE, MEDIA_FILES, MISSING_CACHE, headersFile } from '../src/cache.mjs';
import worker from '../src/worker.mjs';

const SOUND = new Uint8Array(1000).fill(7);
const get = (pathname, headers = {}) => new Request(`https://mosi.example${pathname}`, { headers });
const assets = answer => ({ ASSETS: { fetch: async req => answer(req) } });
const whole = type => () => new Response(SOUND, { status: 200, headers: { 'content-type': type } });

test('a sound keeps in the browser for a day, whole or cut; its lists and a range past its end do not', async () => {
  assert.equal(MEDIA_CACHE, 'public, max-age=86400');

  let response = await worker.fetch(get('/remake/assets/audio/sloedla/v2/stattu-upp/bass.mp3'), assets(whole('audio/mpeg')));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), MEDIA_CACHE, 'a stem the song fetches whole');
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await response.arrayBuffer()).byteLength, SOUND.length, 'with all of its bytes');

  response = await worker.fetch(get('/remake/assets/audio/theme.mp3', { range: 'bytes=0-99' }), assets(whole('audio/mpeg')));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('cache-control'), MEDIA_CACHE, 'a range the Worker cut');
  assert.equal(response.headers.get('content-range'), 'bytes 0-99/1000');

  response = await worker.fetch(get('/dist/assets/audio/welcome.wav'), assets(whole('audio/wav')));
  assert.equal(response.headers.get('cache-control'), MEDIA_CACHE, 'the old game\'s voice lines too');

  const list = new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=0, must-revalidate' } });
  response = await worker.fetch(get('/remake/assets/audio/sloedla/dj/dj.json'), assets(() => list));
  assert.equal(response, list, 'the DJ\'s list asks every time, so new takes reach the game at once');

  response = await worker.fetch(get('/remake/assets/audio/theme.mp3', { range: 'bytes=5000-' }), assets(whole('audio/mpeg')));
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('cache-control'), null, 'a range past the end');
});

// A rule of site/_headers goes by the path, whatever the answer: the assets give a missing picture, model or sound the day too
// (seen on the live site 2026-11-21: 404 with "public, max-age=86400"). A browser then keeps "missing" for a day after the file
// has come, as it did for Mosi's welcome. So the Worker, which every missing file passes through, says no-store on a 404.
test('a file that is not there is never remembered: a 404 goes out with no-store, whatever the assets said', async () => {
  assert.equal(MISSING_CACHE, 'no-store');
  const gone = () => new Response('not found', { status: 404, headers: { 'cache-control': MEDIA_CACHE } }); // as the assets answer under a _headers rule
  const bare = () => new Response(null, { status: 404 });

  let response = await worker.fetch(get('/dist/assets/audio/welcome.mp3'), assets(gone));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), MISSING_CACHE, 'a missing sound, asked for whole');
  response = await worker.fetch(get('/remake/assets/audio/none.mp3', { range: 'bytes=0-' }), assets(gone));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), MISSING_CACHE, 'a missing sound, asked for by range as an audio element asks');
  response = await worker.fetch(new Request('https://mosi.example/remake/assets/audio/none.mp3', { method: 'HEAD', headers: { range: 'bytes=0-' } }), assets(gone));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), MISSING_CACHE, 'and by HEAD');
  response = await worker.fetch(get('/remake/assets/audio/none.mp3'), assets(bare));
  assert.equal(response.headers.get('cache-control'), MISSING_CACHE, 'also when the assets said nothing about keeping');

  response = await worker.fetch(get('/remake/assets/book/videos/none-thumb.webp'), assets(gone));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), MISSING_CACHE, 'a missing picture: the Worker is asked when no file of the site answers');
  response = await worker.fetch(get('/remake/assets/characters/none.glb'), assets(gone));
  assert.equal(response.headers.get('cache-control'), MISSING_CACHE, 'a missing model');
  response = await worker.fetch(get('/remake/none.js'), assets(bare));
  assert.equal(response.headers.get('cache-control'), MISSING_CACHE, 'and missing code');

  response = await worker.fetch(get('/myndbond/none.mp4'), { ...assets(bare), VIDEOS: { head: async () => null, get: async () => null } });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), MISSING_CACHE, 'a video that is not in the bucket');
  response = await worker.fetch(get('/myndbond/none.mp4', { range: 'bytes=0-9' }), { ...assets(bare), VIDEOS: { head: async () => null, get: async () => null } });
  assert.equal(response.headers.get('cache-control'), MISSING_CACHE, 'by range too');

  const picture = new Response(SOUND, { status: 200, headers: { 'content-type': 'image/webp', 'cache-control': MEDIA_CACHE } });
  response = await worker.fetch(get('/remake/assets/book/videos/fundur-thumb.webp'), assets(() => picture));
  assert.equal(response, picture, 'a file that is there goes through as the assets answered it');
  response = await worker.fetch(get('/remake/assets/audio/theme.mp3'), assets(whole('audio/mpeg')));
  assert.equal(response.headers.get('cache-control'), MEDIA_CACHE, 'and a sound that is there still keeps for a day');
});

test('the staged site keeps every kind of picture, model, sound and font for a day, and nothing else', () => {
  const file = headersFile();
  const rules = new Map();
  let rule = null;
  for (const line of file.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('/')) rules.set(rule = line, []);
    else rules.get(rule).push(line);
  }
  assert.deepEqual([...rules.keys()], MEDIA_FILES.map(type => `/*.${type}`));
  for (const [pattern, headers] of rules) assert.deepEqual(headers, [`  Cache-Control: ${MEDIA_CACHE}`], pattern);
  assert.ok(rules.size <= 100, 'Cloudflare reads at most 100 rules');

  for (const type of ['js', 'css', 'html', 'json']) assert.ok(!MEDIA_FILES.includes(type), `${type} asks every time`);
  const kinds = new Set();
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => entry.isDirectory()
    ? walk(path.join(dir, entry.name)) : kinds.add(path.extname(entry.name).slice(1).toLowerCase()));
  walk(fileURLToPath(new URL('../../remake/assets', import.meta.url)));
  for (const kind of kinds) {
    if (['json', 'md', 'txt'].includes(kind)) continue;
    assert.ok(MEDIA_FILES.includes(kind), `the game's .${kind} files keep for a day too`);
  }
});
