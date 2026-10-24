// Byte ranges in the cloud (cloud/src/range.mjs, and the Worker's audio paths): the same cases as the home server's
// (remake/tests/serve.test.mjs), on the theme itself, and the Worker cutting a 200 from the static assets into a 206.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isByteRange, sliceRange } from '../src/range.mjs';
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
