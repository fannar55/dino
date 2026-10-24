import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { makeCode, normalizeCode, parseMessage, message, randomKey, CODE_ALPHABET, MAX_GUESTS, MAX_SEATS, ROOM_TTL_MS } from '../engine/fjolspil/protocol.js';
import { createRoom, restoreRoom, createRooms } from '../engine/fjolspil/room.js';

test('a code is four letters of the alphabet, and reads back in any case', () => {
  const code = makeCode(seededRandom('code'));
  assert.match(code, new RegExp(`^[${CODE_ALPHABET}]{4}$`));
  assert.equal(normalizeCode(' gull '), 'GULL');
  assert.equal(normalizeCode('GUL1'), null);
  assert.equal(normalizeCode('GULLX'), null);
  assert.equal(normalizeCode('GOLL'), null, 'no O');
});

test('a key is 32 hex characters', () => {
  assert.match(randomKey({ getRandomValues: a => a.fill(171) }), /^[0-9a-f]{32}$/);
});

test('messages carry v: 1 and a type; anything else is not a message', () => {
  assert.deepEqual(message('ping', null), { v: 1, type: 'ping', body: null });
  assert.deepEqual(parseMessage('{"v":1,"type":"pong","body":null}'), { v: 1, type: 'pong', body: null });
  for (const bad of ['', 'x', '{}', '{"type":"x"}', '{"v":1}', '{"v":2,"type":"x"}', '[]', 'null', '{"v":1,"type":""}']) assert.equal(parseMessage(bad), null, bad);
  assert.equal(parseMessage('{"v":1,"type":"x","body":"' + 'a'.repeat(70000) + '"}'), null, 'too long');
});

test('a host opens the room, is welcomed, and hears every guest come and go', () => {
  let t = 0;
  const room = createRoom({ now: () => t, code: 'GULL', join: ['http://192.168.1.10:4198/remake/spil.html'] });
  const host = { name: 'host' }, anna = { name: 'anna' };
  const opened = room.connect(host, { role: 'host', id: 'host', key: 'k1' });
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.deliveries, [{ conn: host, message: message('welcome', { code: 'GULL', join: ['http://192.168.1.10:4198/remake/spil.html'] }) }]);
  const joined = room.connect(anna, { role: 'guest', id: 'g-anna' });
  assert.deepEqual(joined.deliveries, [{ conn: host, message: message('joined', { id: 'g-anna' }) }]);
  assert.deepEqual(room.route(anna, message('relay', { to: 'host', body: { v: 1, type: 'hello', body: { name: 'Anna' } } })),
    [{ conn: host, message: message('relay', { from: 'g-anna', body: { v: 1, type: 'hello', body: { name: 'Anna' } } }) }]);
  assert.deepEqual(room.route(host, message('relay', { to: 'g-anna', body: { v: 1, type: 'ping', body: null } })),
    [{ conn: anna, message: message('relay', { body: { v: 1, type: 'ping', body: null } }) }]);
  assert.deepEqual(room.route(host, message('relay', { to: 'nobody', body: {} })), []);
  assert.deepEqual(room.route(host, null), []);
  assert.deepEqual(room.route(anna, { v: 1, type: 'relay' }), [], 'a relay without a body goes nowhere');
  assert.deepEqual(room.route(anna, message('welcome', {})), [], 'only relay is routed');
  assert.deepEqual(room.disconnect(anna), { role: 'guest', id: 'g-anna', deliveries: [{ conn: host, message: message('left', { id: 'g-anna' }) }] });
  assert.equal(room.disconnect(anna), null);
});

test('a second host needs the same key, a ninth guest is refused, and a guest without a host waits', () => {
  const room = createRoom({ code: 'GULL' });
  const h1 = {}, h2 = {}, h3 = {};
  room.connect(h1, { role: 'host', id: 'host', key: 'k1' });
  assert.equal(room.connect(h2, { role: 'host', id: 'host', key: 'other' }).reason, 'taken');
  const again = room.connect(h3, { role: 'host', id: 'host', key: 'k1' });
  assert.equal(again.ok, true);
  assert.equal(again.replaced, h1);
  assert.deepEqual(again.deliveries[0], { conn: h1, message: message('error', { reason: 'replaced' }) });
  // The room holds more phones than the table has seats: the seats (the host's) refuse the extra ones, so a phone with no
  // seat that keeps trying never takes the place of a seated guest whose phone slept (spec §10).
  assert.equal(MAX_GUESTS, 8);
  assert.ok(MAX_GUESTS > MAX_SEATS);
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const guests = ids.map(id => ({ id }));
  for (const g of guests.slice(0, 8)) assert.equal(room.connect(g, { role: 'guest', id: g.id }).ok, true, g.id);
  assert.equal(room.connect(guests[8], { role: 'guest', id: 'i' }).reason, 'full');
  const gone = room.disconnect(h3);
  assert.deepEqual(gone.deliveries.map(d => d.message), guests.slice(0, 8).map(() => message('error', { reason: 'no-host' })));
  assert.equal(room.connect({ id: 'j' }, { role: 'guest', id: 'j' }).reason, 'no-host');
  const back = room.connect({}, { role: 'host', id: 'host', key: 'k1' });
  assert.deepEqual(back.deliveries.slice(1).map(d => d.message), ids.slice(0, 8).map(id => message('joined', { id })), 'the host hears who is still there');
  assert.equal(room.connect({}, { role: 'guest' }).reason, 'bad-id');
  assert.equal(room.connect({}, { role: 'fish', id: 'x' }).reason, 'bad-role');
});

test('a guest that comes back with its id takes over its old connection', () => {
  const room = createRoom({ code: 'GULL' });
  const host = {}, old = {}, fresh = {};
  room.connect(host, { role: 'host', id: 'host', key: 'k' });
  room.connect(old, { role: 'guest', id: 'g' });
  const back = room.connect(fresh, { role: 'guest', id: 'g' });
  assert.equal(back.replaced, old);
  assert.deepEqual(back.deliveries, [{ conn: old, message: message('error', { reason: 'replaced' }) }, { conn: host, message: message('joined', { id: 'g' }) }]);
  assert.deepEqual(room.guests(), [{ id: 'g', conn: fresh }]);
});

test('a room expires two hours after its last sign of life, and a snapshot restores its key', () => {
  let t = 0;
  const room = createRoom({ now: () => t, code: 'GULL' });
  room.connect({}, { role: 'host', id: 'host', key: 'k' });
  t = ROOM_TTL_MS - 1;
  assert.equal(room.isExpired(), false);
  room.touch();
  t = 2 * ROOM_TTL_MS - 2;
  assert.equal(room.isExpired(), false);
  t = 2 * ROOM_TTL_MS;
  assert.equal(room.isExpired(), true);
  const copy = restoreRoom(room.snapshot(), { now: () => t });
  assert.equal(copy.hostKey, 'k');
  assert.equal(copy.connect({}, { role: 'host', id: 'host', key: 'nope' }).reason, 'taken');
});

test('the registry makes a room on a host connect, refuses a guest to no room, and sweeps the expired', () => {
  let t = 0;
  const rooms = createRooms({ now: () => t });
  assert.equal(rooms.connect('GULL', {}, { role: 'guest', id: 'g' }).reason, 'no-room');
  const host = {};
  assert.equal(rooms.connect('GULL', host, { role: 'host', id: 'host', key: 'k' }).ok, true);
  const guest = {};
  assert.equal(rooms.connect('GULL', guest, { role: 'guest', id: 'g' }).ok, true);
  assert.equal(rooms.route(guest, message('relay', { body: 1 }))[0].conn, host);
  t = ROOM_TTL_MS - 1;
  assert.deepEqual(rooms.route(host, message('alive', null)), []); // the big screen's minute, its guests on WebRTC
  t = ROOM_TTL_MS + 1;
  assert.deepEqual(rooms.sweep(), [], 'the alive kept it');
  t = 2 * ROOM_TTL_MS;
  assert.deepEqual(rooms.sweep(), [host, guest]);
  assert.equal(rooms.get('GULL'), undefined);
});

test('a connection that connects twice has not replaced itself, and the registry still carries its messages', () => {
  const rooms = createRooms();
  const host = {}, a = {}, b = {}, c = {};
  rooms.connect('GULL', host, { role: 'host', key: 'k' });
  for (const [conn, id] of [[a, 'a'], [b, 'b'], [c, 'c']]) rooms.connect('GULL', conn, { role: 'guest', id });
  const twice = rooms.connect('GULL', c, { role: 'guest', id: 'c' });
  assert.equal(twice.ok, true, 'not full: c is already in the room');
  assert.equal(twice.replaced, null);
  assert.deepEqual(twice.deliveries, [{ conn: host, message: message('joined', { id: 'c' }) }]);
  const hostTwice = rooms.connect('GULL', host, { role: 'host', key: 'k' });
  assert.equal(hostTwice.replaced, null);
  assert.deepEqual(hostTwice.deliveries.map(d => d.conn), [host, host, host, host], 'no replaced error to itself');
  assert.equal(rooms.route(c, message('relay', { body: 1 }))[0].conn, host);
  assert.equal(rooms.route(host, message('relay', { to: 'c', body: 2 }))[0].conn, c);
  assert.deepEqual(rooms.disconnect(c), { role: 'guest', id: 'c', deliveries: [{ conn: host, message: message('left', { id: 'c' }) }] });
  assert.deepEqual(rooms.get('GULL').guests().map(g => g.id), ['a', 'b']);
  assert.equal(rooms.disconnect(host).role, 'host');
});

test('an accepted connect, a disconnect, a relay and an alive are signs of life; a refused connect is not', () => {
  let t = 0;
  const room = createRoom({ now: () => t, code: 'GULL' });
  const host = {}, guest = {};
  t = 10; room.connect(host, { role: 'host', key: 'k' });
  assert.equal(room.expiresAt, 10 + ROOM_TTL_MS, "the host's connect");
  t = 20; room.connect(guest, { role: 'guest', id: 'g' });
  assert.equal(room.expiresAt, 20 + ROOM_TTL_MS, "a guest's connect");
  t = 30; room.route(guest, message('relay', { body: 1 }));
  assert.equal(room.expiresAt, 30 + ROOM_TTL_MS, "a guest's relay");
  t = 40; room.route(host, message('relay', { to: 'g', body: 2 }));
  assert.equal(room.expiresAt, 40 + ROOM_TTL_MS, "the host's relay");
  t = 45; assert.deepEqual(room.route(host, message('alive', null)), [], "the host's alive goes nowhere");
  assert.equal(room.expiresAt, 45 + ROOM_TTL_MS, "and is a sign of life: over WebRTC it is the only one the room hears");
  t = 47; assert.deepEqual(room.route(guest, message('alive', null)), [], "a guest's alive goes nowhere either");
  assert.equal(room.expiresAt, 47 + ROOM_TTL_MS, 'and keeps the room alive as well');
  t = 48; assert.deepEqual(room.route({}, message('alive', null)), []);
  assert.equal(room.expiresAt, 47 + ROOM_TTL_MS, 'a stranger\'s alive is nothing');
  t = 50; assert.equal(room.connect({}, { role: 'host', key: 'other' }).reason, 'taken');
  assert.equal(room.expiresAt, 47 + ROOM_TTL_MS, "a stranger's key does not keep the room alive");
  t = 60; room.disconnect(guest);
  assert.equal(room.expiresAt, 60 + ROOM_TTL_MS, "a guest's disconnect");
  t = 70; room.disconnect(host);
  assert.equal(room.expiresAt, 70 + ROOM_TTL_MS, "the host's disconnect");
  t = 80; assert.equal(room.connect({}, { role: 'guest', id: 'g' }).reason, 'no-host');
  assert.equal(room.expiresAt, 70 + ROOM_TTL_MS, 'a phone retrying while the host is away does not keep the room alive');
  t = 70 + ROOM_TTL_MS - 1;
  assert.equal(room.isExpired(), false);
  t = 70 + ROOM_TTL_MS;
  assert.equal(room.isExpired(), true);
});
