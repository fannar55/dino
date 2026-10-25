import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handle } from '../tools/serve.mjs';
import { attachFjolspil, parseWsUrl, lanJoinUrls } from '../tools/fjolspil-server.mjs';
import { message } from '../engine/fjolspil/protocol.js';

async function serving(run) {
  const server = http.createServer(handle);
  const fjolspil = attachFjolspil(server, { join: () => ['http://192.168.1.10:4198/remake/spil.html'] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`ws://127.0.0.1:${server.address().port}`, fjolspil); } finally { fjolspil.close(); await new Promise(resolve => server.close(resolve)); }
}
const open = url => new Promise((resolve, reject) => { const ws = new WebSocket(url); ws.onopen = () => resolve(ws); ws.onerror = () => reject(new Error('refused')); });
const next = ws => new Promise(resolve => { ws.onmessage = event => resolve(JSON.parse(event.data)); });
const closed = ws => new Promise(resolve => { ws.onclose = event => resolve(event.code); });

test('the host is welcomed with the join addresses, and guests reach it through the room', async () => {
  await serving(async base => {
    const host = await open(`${base}/fjolspil/ws/gull?role=host&key=abc`);
    assert.deepEqual(await next(host), message('welcome', { code: 'GULL', join: ['http://192.168.1.10:4198/remake/spil.html'] }));
    const guest = await open(`${base}/fjolspil/ws/GULL?role=guest&id=g1`);
    assert.deepEqual(await next(host), message('joined', { id: 'g1' }));
    guest.send(JSON.stringify(message('relay', { body: { v: 1, type: 'hello', body: { name: 'Anna', avatar: 'kambedla' } } })));
    assert.deepEqual(await next(host), message('relay', { from: 'g1', body: { v: 1, type: 'hello', body: { name: 'Anna', avatar: 'kambedla' } } }));
    host.send(JSON.stringify(message('relay', { to: 'g1', body: { v: 1, type: 'ping', body: null } })));
    assert.deepEqual(await next(guest), message('relay', { body: { v: 1, type: 'ping', body: null } }));
    guest.close();
    assert.deepEqual(await next(host), message('left', { id: 'g1' }));
    host.close();
  });
});

test('a refused connect gets the reason and is closed; bad frames close with their codes', async () => {
  await serving(async (base, fjolspil) => {
    const guest = await open(`${base}/fjolspil/ws/GULL?role=guest&id=g1`);
    assert.deepEqual(await next(guest), message('error', { reason: 'no-room' }));
    assert.equal(await closed(guest), 1000);
    const host = await open(`${base}/fjolspil/ws/GULL?role=host&key=abc`);
    await next(host);
    const big = await open(`${base}/fjolspil/ws/GULL?role=guest&id=big`);
    big.send('x'.repeat(70000));
    assert.equal(await closed(big), 1009);
    const binary = await open(`${base}/fjolspil/ws/GULL?role=guest&id=bin`);
    binary.send(new Uint8Array([1, 2, 3]));
    assert.equal(await closed(binary), 1003);
    const junk = await open(`${base}/fjolspil/ws/GULL?role=guest&id=junk`);
    // The host heard joined and left for big and bin while no next() was waiting; the room says who is in.
    assert.deepEqual(fjolspil.rooms.get('GULL').guests().map(guest => guest.id), ['junk'], 'big and bin left the room, junk is in');
    junk.send('not json');
    junk.send(JSON.stringify({ v: 1, type: 'relay' }));
    host.send(JSON.stringify(message('relay', { to: 'junk', body: 'still here' })));
    assert.deepEqual(await next(junk), message('relay', { body: 'still here' }), 'junk did not break the room');
    host.close();
  });
});

test('other paths and bad codes are not upgraded', async () => {
  await serving(async base => {
    await assert.rejects(open(`${base}/other`));
    await assert.rejects(open(`${base}/fjolspil/ws/toolong?role=host&key=k`));
  });
});

test('the ws url parses, and the LAN join addresses come from the IPv4 interfaces', () => {
  assert.deepEqual(parseWsUrl('/fjolspil/ws/gull?role=host&key=k'), { code: 'GULL', role: 'host', id: undefined, key: 'k' });
  assert.equal(parseWsUrl('/fjolspil/ws/g0ll?role=guest&id=x'), null);
  assert.equal(parseWsUrl('/remake/'), null);
  const interfaces = () => ({ lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }], wifi: [{ family: 'IPv6', address: '::1', internal: false }, { family: 'IPv4', address: '192.168.1.10', internal: false }] });
  assert.deepEqual(lanJoinUrls(4198, { interfaces }), ['http://192.168.1.10:4198/remake/spil.html']);
});
