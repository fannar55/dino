import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CDP, parseOptions } from '../tools/sound-check.mjs';

// The real-browser sound check (tools/sound-check.mjs) drives Chrome over the DevTools protocol, on this computer or on the tablet
// over USB. These tests cover what can go wrong before and around the browser: its command line, a browser it cannot reach, and
// a DevTools socket that drops in the middle (a USB cable pulled, a locked tablet, Chrome closed).

const TOOL = fileURLToPath(new URL('../tools/sound-check.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', timeout: 30000 });

test('the options: values are taken, and a flag where a value should be is refused with a message', () => {
  assert.deepEqual(parseOptions(['--connect', '127.0.0.1:9222', '--base', 'http://10.0.0.2:4190/remake/']), {
    connect: '127.0.0.1:9222', base: 'http://10.0.0.2:4190/remake/', browser: 'chrome', headful: false, query: 'quality=low&debug=1', help: false,
  });
  assert.equal(parseOptions(['--headful', '--browser', 'edge']).browser, 'edge');
  assert.equal(parseOptions(['--headful']).headful, true);
  assert.throws(() => parseOptions(['--connect', '--base', 'http://10.0.0.2:4190/remake/']), /--connect needs a value.*not --base/);
  assert.throws(() => parseOptions(['--connect']), /--connect needs a value/);
  assert.throws(() => parseOptions(['--query']), /--query needs a value/);
  assert.throws(() => parseOptions(['--conect', '1.2.3.4:9222']), /Unknown option --conect/);
});

/** A DevTools socket that answers nothing: it records what is sent, and closes when told. */
class QuietSocket extends EventTarget {
  constructor() { super(); this.readyState = WebSocket.OPEN; this.sent = []; }
  send(text) { this.sent.push(JSON.parse(text)); }
  drop() { this.readyState = WebSocket.CLOSED; this.dispatchEvent(new Event('close')); }
}

test('a DevTools socket that drops fails the calls waiting on it, and every call after, instead of leaving the check hanging', async () => {
  const socket = new QuietSocket();
  const cdp = new CDP(socket);
  const waiting = cdp.send('Runtime.evaluate', { expression: '1' });
  assert.equal(socket.sent.length, 1);
  socket.drop();
  await assert.rejects(waiting, /DevTools socket closed/);
  await assert.rejects(cdp.send('Page.enable'), /DevTools socket closed/, 'a call on a closed socket fails at once');
  assert.equal(socket.sent.length, 1, 'and is not sent');
});

test('--connect alone is refused with a message, and a browser it cannot reach is explained: Chrome open, adb forward', () => {
  const alone = run('--connect');
  assert.equal(alone.status, 2);
  assert.match(alone.stderr, /--connect needs a value/);
  assert.doesNotMatch(alone.stderr, /^\s+at /m, 'a message, not a stack');

  const unreachable = run('--connect', '127.0.0.1:59999'); // nothing listens there
  assert.equal(unreachable.status, 2);
  const said = unreachable.stdout + unreachable.stderr;
  assert.match(said, /--base/, 'without --base it says the game is served where only this computer reaches it');
  assert.match(said, /127\.0\.0\.1:59999 \(ECONNREFUSED\)/);
  assert.match(said, /adb forward/);
  assert.match(said, /Chrome/);
  assert.doesNotMatch(unreachable.stderr, /^\s+at /m, 'a message, not a stack');
});
