// Byte ranges in the cloud (cloud/src/range.mjs, the Worker's audio paths, and the book's videos in R2): the same cases as the
// home server's (remake/tests/serve.test.mjs), on the theme itself, the Worker cutting a 200 from the static assets into a 206,
// and streaming slices of MP4s from env.VIDEOS.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isByteRange, parseRange, sliceRange } from '../src/range.mjs';
import { MEDIA_CACHE } from '../src/cache.mjs';
import worker from '../src/worker.mjs';

const THEME = fs.readFileSync(new URL('../../remake/assets/audio/theme.mp3', import.meta.url));
const total = THEME.length;
const bytesOf = sliced => Buffer.from(sliced.body);

test('a byte range of the theme is cut as the home server cuts it', () => {
  let sliced = sliceRange('bytes=0-99', THEME, 'audio/mpeg');
  assert.equal(sliced.status, 206);
  assert.deepEqual(sliced.headers, { 'Content-Range': `bytes 0-99/${total}`, 'Accept-Ranges': 'bytes', 'Content-Length': '100', 'Content-Type': 'audio/mpeg' });
  assert.ok(bytesOf(sliced).equals(THEME.subarray(0, 100)));

  sliced = sliceRange(`bytes=${total - 10}-${total + 5000}`, THEME, 'audio/mpeg'); // an end past the file's end is the file's end
  assert.equal(sliced.status, 206);
  assert.equal(sliced.headers['Content-Range'], `bytes ${total - 10}-${total - 1}/${total}`);
  assert.equal(sliced.headers['Content-Length'], '10');
  assert.ok(bytesOf(sliced).equals(THEME.subarray(total - 10)));

  sliced = sliceRange('bytes=0-', THEME.buffer.slice(THEME.byteOffset, THEME.byteOffset + total), 'audio/mpeg'); // how a browser starts; an ArrayBuffer too
  assert.equal(sliced.status, 206);
  assert.equal(sliced.headers['Content-Range'], `bytes 0-${total - 1}/${total}`);
  assert.ok(bytesOf(sliced).equals(THEME));

  sliced = sliceRange('bytes=1000000-', THEME, 'audio/mpeg'); // and a seek
  assert.equal(sliced.status, 206);
  assert.equal(sliced.headers['Content-Range'], `bytes 1000000-${total - 1}/${total}`);
  assert.ok(bytesOf(sliced).equals(THEME.subarray(1000000)));

  sliced = sliceRange('bytes=-50', THEME, 'audio/mpeg');
  assert.equal(sliced.status, 206);
  assert.ok(bytesOf(sliced).equals(THEME.subarray(total - 50)), 'the last fifty bytes');

  sliced = sliceRange('bytes=90000000-', THEME, 'audio/mpeg');
  assert.equal(sliced.status, 416, 'a range past the end of the file');
  assert.deepEqual(sliced.headers, { 'Content-Range': `bytes */${total}` });
  assert.equal(sliced.body, null);
  assert.equal(sliceRange('bytes=200-100', THEME, 'audio/mpeg').status, 416, 'a start after the end asked for');
  assert.deepEqual(parseRange('bytes=10-19', 100), { valid: true, start: 10, end: 19, length: 10, total: 100 });
});

test('only the three forms are byte ranges; anything else gets the whole file', () => {
  for (const header of ['bytes=0-99', 'bytes=5-', 'bytes=-5']) assert.equal(isByteRange(header), true, header);
  for (const header of [null, undefined, '', 'bytes=-', 'bytes=0-1,5-6', 'items=0-1', 'bytes=a-b']) {
    assert.equal(isByteRange(header), false, String(header));
    assert.equal(sliceRange(header, THEME, 'audio/mpeg'), null);
  }
});

/** The static assets as the Worker sees them: what each fetch asked for, and an answer made per request. */
function assetsAnswering(answer) {
  const asked = [];
  return { asked, ASSETS: { fetch: async req => { asked.push({ method: req.method, path: new URL(req.url).pathname, range: req.headers.get('range') }); return answer(req); } } };
}
const whole = () => new Response(THEME, { status: 200, headers: { 'content-type': 'audio/mpeg', 'content-length': String(total) } });
const get = (path, headers = {}, method = 'GET') => new Request(`https://mosi.example${path}`, { method, headers });

test('the Worker cuts the audio paths\' 200s into 206s, and passes everything else through', async () => {
  const env = assetsAnswering(whole);
  let response = await worker.fetch(get('/remake/assets/audio/theme.mp3', { range: 'bytes=0-99' }), env);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), `bytes 0-99/${total}`);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-length'), '100');
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(THEME.subarray(0, 100)));
  assert.deepEqual(env.asked, [{ method: 'GET', path: '/remake/assets/audio/theme.mp3', range: 'bytes=0-99' }]);

  response = await worker.fetch(get('/dist/assets/audio/welcome.mp3', { range: 'bytes=-50' }), env);
  assert.equal(response.status, 206, 'the old game\'s voice lines too');
  assert.equal(response.headers.get('content-range'), `bytes ${total - 50}-${total - 1}/${total}`);
  response = await worker.fetch(get('/remake/assets/audio/kafli2/line.mp3', { range: 'bytes=90000000-' }), env);
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('content-range'), `bytes */${total}`);

  const head = await worker.fetch(get('/remake/assets/audio/theme.mp3', { range: 'bytes=0-99' }, 'HEAD'), env);
  assert.equal(head.status, 206, 'a HEAD with a range is told the range');
  assert.equal(head.headers.get('content-range'), `bytes 0-99/${total}`);
  assert.equal(head.body, null);
  assert.equal(env.asked.at(-1).method, 'GET', 'the file is read to cut it');

  const passed = [];
  const through = assetsAnswering(req => { const answer = req.headers.get('range') ? new Response('cut', { status: 206 }) : new Response('all', { status: 200 }); passed.push(answer); return answer; });
  assert.equal(await worker.fetch(get('/remake/assets/audio/theme.mp3'), through), passed.at(-1), 'no range: the assets\' answer as it is');
  assert.equal(await worker.fetch(get('/remake/assets/audio/theme.mp3', { range: 'bytes=0-1,5-6' }), through), passed.at(-1), 'not one of the three forms');
  assert.equal(await worker.fetch(get('/remake/assets/audio/theme.mp3', { range: 'bytes=0-99' }), through), passed.at(-1), 'the assets cut it themselves');
  assert.equal(await worker.fetch(get('/remake/main.js', { range: 'bytes=0-99' }), through), passed.at(-1), 'not an audio path');
  const missing = assetsAnswering(() => new Response(null, { status: 404 }));
  assert.equal((await worker.fetch(get('/remake/assets/audio/none.mp3', { range: 'bytes=0-99' }), missing)).status, 404);
});

/** A fake R2 bucket (`env.VIDEOS`) holding `files` (key -> Uint8Array), answering `head` and `get(key, { range })`. */
function r2Bucket(files) {
  const calls = [];
  return {
    calls,
    files,
    VIDEOS: {
      async head(key) {
        calls.push({ op: 'head', key });
        const bytes = files[key];
        return bytes ? { size: bytes.length, httpEtag: `"etag-${key}"` } : null;
      },
      async get(key, options = {}) {
        calls.push({ op: 'get', key, range: options.range ?? null });
        const bytes = files[key];
        if (!bytes) return null;
        const slice = options.range ? bytes.subarray(options.range.offset, options.range.offset + options.range.length) : bytes;
        return { size: bytes.length, httpEtag: `"etag-${key}"`, body: slice };
      },
      async put(key, value) {
        calls.push({ op: 'put', key });
        files[key] = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
      },
    },
  };
}

test('the Worker streams videos from R2 at /myndbond/<name>.mp4, whole and in byte ranges, and keeps them for a day', async () => {
  const clip = Buffer.from(Array.from({ length: 500 }, (_, i) => i & 0xff));
  const env = r2Bucket({ 'gramedla.mp4': clip });

  // Whole file (200)
  let response = await worker.fetch(get('/myndbond/gramedla.mp4'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-length'), '500');
  assert.equal(response.headers.get('cache-control'), MEDIA_CACHE);
  assert.equal(response.headers.get('etag'), '"etag-gramedla.mp4"');
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(clip));

  // Byte range (206): R2's get is asked only for the slice, never the whole file
  env.calls.length = 0;
  response = await worker.fetch(get('/myndbond/gramedla.mp4', { range: 'bytes=100-149' }), env);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 100-149/500');
  assert.equal(response.headers.get('content-length'), '50');
  assert.equal(response.headers.get('cache-control'), MEDIA_CACHE);
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(clip.subarray(100, 150)));
  assert.deepEqual(env.calls, [
    { op: 'head', key: 'gramedla.mp4' },
    { op: 'get', key: 'gramedla.mp4', range: { offset: 100, length: 50 } },
  ]);

  // Suffix range and clamped end
  response = await worker.fetch(get('/myndbond/gramedla.mp4', { range: 'bytes=-20' }), env);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 480-499/500');
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(clip.subarray(480)));

  // HEAD with and without range
  const headWhole = await worker.fetch(get('/myndbond/gramedla.mp4', {}, 'HEAD'), env);
  assert.equal(headWhole.status, 200);
  assert.equal(headWhole.headers.get('content-length'), '500');
  assert.equal(headWhole.body, null);

  const headRange = await worker.fetch(get('/myndbond/gramedla.mp4', { range: 'bytes=0-9' }, 'HEAD'), env);
  assert.equal(headRange.status, 206);
  assert.equal(headRange.headers.get('content-range'), 'bytes 0-9/500');
  assert.equal(headRange.body, null);

  // Out of range (416), missing video (404), and disallowed method (405)
  response = await worker.fetch(get('/myndbond/gramedla.mp4', { range: 'bytes=900-' }), env);
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('content-range'), 'bytes */500');

  assert.equal((await worker.fetch(get('/myndbond/missing.mp4'), env)).status, 404);
  assert.equal((await worker.fetch(get('/myndbond/missing.mp4', { range: 'bytes=0-9' }), env)).status, 404);
  assert.equal((await worker.fetch(get('/myndbond/gramedla.mp4', {}, 'POST'), env)).status, 405);
  assert.equal((await worker.fetch(get('/myndbond/gramedla.mp4'), {})).status, 404, 'no VIDEOS binding -> 404');
});

test('the Worker preserves query strings on / and files bug reports at /villa into R2', async () => {
  const env = r2Bucket({});
  const redir = await worker.fetch(get('/?nyr=1'), env);
  assert.equal(redir.status, 302);
  assert.equal(redir.headers.get('location'), '/remake/?nyr=1');

  const probe = await worker.fetch(get('/villa'), env);
  assert.equal(probe.status, 204);
  assert.equal(probe.headers.get('x-villa'), '1');

  const post = await worker.fetch(new Request('https://mosi.example/villa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      report: { chapter: { id: 'kafli4' }, text: 'Villuprófun í skýi' },
      files: { 'skjaskot.jpg': 'data:image/jpeg;base64,/9j/4AAQ', 'spjold.html': '<!doctype html>' },
    }),
  }), env);
  assert.equal(post.status, 200);
  const { folder } = await post.json();
  assert.match(folder, /^villur\/\d{4}-\d{2}-\d{2}_\d{6}-kafli4$/);
  const savedReport = JSON.parse(env.files[`${folder}/skyrsla.json`].toString('utf8'));
  assert.equal(savedReport.text, 'Villuprófun í skýi');
  assert.equal(env.files[`${folder}/spjold.html`].toString('utf8'), '<!doctype html>');
  assert.ok(env.files[`${folder}/skjaskot.jpg`].length > 0);

  const crossOrigin = await worker.fetch(new Request('https://mosi.example/villa', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: '{}',
  }), env);
  assert.equal(crossOrigin.status, 403, 'cross-origin POST is rejected');

  const oversized = await worker.fetch(new Request('https://mosi.example/villa', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(30 * 1024 * 1024) },
    body: '{}',
  }), env);
  assert.equal(oversized.status, 413, 'oversized Content-Length is rejected before buffering');
});
