import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
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

/** The dev server with `handler` on a port of its own, for the length of `run`. */
async function servingWith(handler, run) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'); // one transparent pixel
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64'); // one grey pixel

test('POST /villa files a bug report under qa/villur: the report with the build and where it went, the frame, the marked frame and the layers page', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'villa-root-'));
  try {
    await servingWith((req, res) => handle(req, res, { root, reportLimit: 4000 }), async base => {
      const post = body => fetch(`${base}/villa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const dataUrl = `data:image/png;base64,${PNG.toString('base64')}`;
      const jpegUrl = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
      const response = await post(JSON.stringify({
        report: { chapter: { id: 'kafli2' }, text: 'Fiðrildið svífur', boxes: [{ x: 1, y: 2, w: 3, h: 4 }] },
        files: { 'skjaskot.png': dataUrl, 'merkt.jpg': jpegUrl, 'skjaskot.jpg': dataUrl, 'spjold.html': '<!doctype html><html lang="is"></html>', '../evil.txt': 'no', 'skyrsla.json': '{"not":"mine"}' },
      }));
      assert.equal(response.status, 200);
      const { folder } = await response.json();
      assert.match(folder, /^qa\/villur\/\d{4}-\d{2}-\d{2}_\d{6}-kafli2$/, 'the folder is named by the time and the chapter');
      const dir = path.join(root, folder);
      assert.deepEqual(fs.readdirSync(dir).sort(), ['merkt.jpg', 'skjaskot.png', 'skyrsla.json', 'spjold.html'], 'the report, the frames that came as what their names say, the page, and nothing a report may not bring');
      assert.ok(fs.readFileSync(path.join(dir, 'merkt.jpg')).equals(JPEG), 'a JPEG is the bytes of its data URL');
      const probe = await fetch(`${base}/villa`);
      assert.equal(probe.status, 204, 'GET /villa says the server is here');
      assert.equal(probe.headers.get('x-villa'), '1');
      assert.ok(!fs.existsSync(path.join(root, 'qa', 'evil.txt')) && !fs.existsSync(path.join(root, 'evil.txt')));
      const report = JSON.parse(fs.readFileSync(path.join(dir, 'skyrsla.json'), 'utf8'));
      assert.equal(report.text, 'Fiðrildið svífur');
      assert.deepEqual(report.boxes, [{ x: 1, y: 2, w: 3, h: 4 }]);
      assert.equal(report.saved.folder, folder);
      assert.ok('build' in report, 'the build is filled in (null where the root is no repository)');
      assert.ok(fs.readFileSync(path.join(dir, 'skjaskot.png')).equals(PNG), 'the PNG is the bytes of the data URL');
      assert.equal(fs.readFileSync(path.join(dir, 'spjold.html'), 'utf8'), '<!doctype html><html lang="is"></html>');

      const again = await post(JSON.stringify({ report: { chapter: { id: 'kafli2' } }, files: {} }));
      assert.equal(again.status, 200);
      const second = (await again.json()).folder;
      assert.notEqual(second, folder, 'a second report gets a folder of its own, -2 within the same second');
      assert.ok(fs.existsSync(path.join(root, second, 'skyrsla.json')));

      assert.equal((await post('{not json')).status, 400);
      assert.equal((await post(JSON.stringify({ report: 'x' }))).status, 400);
      assert.equal((await post(JSON.stringify({ report: {}, files: { 'spjold.html': 'x'.repeat(5000) } }))).status, 413, 'over the limit is refused');
      assert.equal((await fetch(`${base}/villa`, { method: 'PUT' })).status, 404, 'PUT /villa is no file');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
