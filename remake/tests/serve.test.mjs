import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { handle } from '../tools/serve.mjs';

const THEME = new URL('../assets/audio/theme.mp3', import.meta.url);
const URL_PATH = '/remake/assets/audio/theme.mp3';

/** The dev server on a port of its own, for the length of `run`. */
async function serving(run) {
  const server = http.createServer(handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('the dev server answers byte ranges, so a browser can move about in the theme', async () => {
  const file = fs.readFileSync(THEME);
  await serving(async base => {
    const whole = await fetch(base + URL_PATH);
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('accept-ranges'), 'bytes', 'it says it can');
    assert.equal(whole.headers.get('content-length'), String(file.length));
    assert.equal(whole.headers.get('content-type'), 'audio/mpeg');
    assert.ok(Buffer.from(await whole.arrayBuffer()).equals(file));

    const asked = async range => {
      const response = await fetch(base + URL_PATH, { headers: { Range: range } });
      return { response, bytes: Buffer.from(await response.arrayBuffer()) };
    };
    let { response, bytes } = await asked('bytes=0-99');
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes 0-99/${file.length}`);
    assert.ok(bytes.equals(file.subarray(0, 100)));

    ({ response, bytes } = await asked(`bytes=${file.length - 10}-${file.length + 5000}`)); // an end past the file's end is the file's end
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes ${file.length - 10}-${file.length - 1}/${file.length}`);
    assert.equal(response.headers.get('content-length'), '10');
    assert.ok(bytes.equals(file.subarray(file.length - 10)));

    ({ response, bytes } = await asked('bytes=0-')); // how a browser starts
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes 0-${file.length - 1}/${file.length}`);
    assert.ok(bytes.equals(file));

    ({ response, bytes } = await asked('bytes=1000000-')); // and a seek
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes 1000000-${file.length - 1}/${file.length}`);
    assert.ok(bytes.equals(file.subarray(1000000)));

    ({ response, bytes } = await asked('bytes=-50'));
    assert.equal(response.status, 206);
    assert.ok(bytes.equals(file.subarray(file.length - 50)), 'the last fifty bytes');

    ({ response } = await asked('bytes=90000000-'));
    assert.equal(response.status, 416, 'a range past the end of the file');
    assert.equal(response.headers.get('content-range'), `bytes */${file.length}`);
  });
});

test('the dev server still serves the rest as before', async () => {
  await serving(async base => {
    const home = await fetch(base + '/', { redirect: 'manual' });
    assert.equal(home.status, 302);
    assert.equal(home.headers.get('location'), '/remake/');
    const page = await fetch(base + '/remake/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<canvas id="view"/);
    assert.equal((await fetch(base + '/remake/no-such-file.js')).status, 404);
    assert.equal((await fetch(base + '/remake/tools/serve.mjs', { headers: { Range: 'bytes=0-1' } })).status, 206, 'a range of any file');
  });
});
