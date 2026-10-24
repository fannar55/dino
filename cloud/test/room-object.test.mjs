// The cloud's meeting point (spec §9.2, §11): the Worker's paths and the Room, the Durable Object that runs the same
// engine/fjolspil/room.js as the home server, here over a fake ctx and fake sockets. The fakes behave as the Workers runtime
// does where it matters: a socket the server closed is still among ctx.getWebSockets() until its client's close comes back
// (`gone`), sending on or closing a closed socket throws, and an attachment comes back as a copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/room-object.mjs';
import worker from '../src/worker.mjs';
import { ROOM_TTL_MS, message } from '../../remake/engine/fjolspil/protocol.js';

class FakeSocket {
  sent = [];
  closed = null; // the code the server closed it with
  gone = false; // the client's half of the close came back: the runtime has let the socket go
  attachment = null;
  send(text) {
    if (this.closed !== null) throw new TypeError('send() after close()');
    this.sent.push(text);
  }
  close(code) {
    if (this.closed !== null) throw new TypeError('close() after close()');
    this.closed = code;
  }
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  /** What the server sent since the last take, as messages. */
  take() {
    const taken = this.sent.map(text => JSON.parse(text));
    this.sent = [];
    return taken;
  }
}

class FakeCtx {
  sockets = [];
  data = new Map();
  alarmAt = null;
  reversed = false; // the runtime promises no order for its sockets
  storage = {
    get: async key => structuredClone(this.data.get(key)),
    put: async (key, value) => { this.data.set(key, structuredClone(value)); },
    deleteAll: async () => { this.data.clear(); },
    setAlarm: async at => { this.alarmAt = at; },
  };
  acceptWebSocket(ws) { this.sockets.push(ws); }
  getWebSockets() {
    const open = this.sockets.filter(ws => !ws.gone);
    return this.reversed ? open.reverse() : open;
  }
}

// The runtime's pair is an object with the client at 0 and the server at 1; a 101 Response carries the client end.
globalThis.WebSocketPair = class {
  constructor() {
    this[0] = new FakeSocket();
    this[1] = new FakeSocket();
  }
};
globalThis.Response = class {
  constructor(body = null, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers);
    this.webSocket = init.webSocket ?? null;
  }
};

const UPGRADE = { upgrade: 'websocket' };
const request = (path, headers = UPGRADE) => ({ url: `https://mosi.example${path}`, headers: new Map(Object.entries(headers)) });

/** A socket's connect through the Room's fetch: the server end the Room keeps, after checking the upgrade went through. */
async function connect(room, ctx, path) {
  const response = await room.fetch(request(path));
  assert.equal(response.status, 101);
  assert.ok(response.webSocket instanceof FakeSocket, 'the 101 carries the client end');
  return ctx.sockets.at(-1);
}
/** The client closes its socket: the runtime lets it go and calls the Room's close handler. */
async function clientCloses(room, ws, code = 1000) {
  ws.gone = true;
  await room.webSocketClose(ws, code, '', true);
}
/** A clock the test moves, as Date.now. */
function clockOf(t, start = 1_000_000) {
  const clock = { now: start, tick(ms) { clock.now += ms; } };
  t.mock.method(Date, 'now', () => clock.now);
  return clock;
}

const hello = { v: 1, type: 'hello', body: { name: 'Anna', avatar: 'kambedla' } };
const ping = { v: 1, type: 'ping', body: null };
const fromGuest = body => JSON.stringify(message('relay', { body }));
const fromHost = (to, body) => JSON.stringify(message('relay', { to, body }));

test('a host is welcomed, a guest is announced, and relays flow', async t => {
  const clock = clockOf(t);
  const ctx = new FakeCtx();
  const room = new Room(ctx, {});
  const host = await connect(room, ctx, '/fjolspil/ws/gull?role=host&key=abc');
  assert.deepEqual(host.take(), [message('welcome', { code: 'GULL', join: [] })], 'no join addresses in the cloud: the page uses its own');
  assert.deepEqual(host.deserializeAttachment(), { role: 'host', key: 'abc' }, 'the host socket carries its key');
  assert.deepEqual(ctx.data.get('room'), { code: 'GULL', hostKey: 'abc', lastSeen: clock.now });
  assert.equal(ctx.alarmAt, clock.now + ROOM_TTL_MS);

  clock.tick(1000);
  const guest = await connect(room, ctx, '/fjolspil/ws/GULL?role=guest&id=g1');
  assert.deepEqual(guest.take(), []);
  assert.deepEqual(guest.deserializeAttachment(), { role: 'guest', id: 'g1' });
  assert.deepEqual(host.take(), [message('joined', { id: 'g1' })]);
  assert.equal(ctx.alarmAt, clock.now + ROOM_TTL_MS, 'a connect is a sign of life');

  clock.tick(1000);
  await room.webSocketMessage(guest, fromGuest(hello));
  assert.deepEqual(host.take(), [message('relay', { from: 'g1', body: hello })]);
  assert.equal(ctx.alarmAt, clock.now + ROOM_TTL_MS, 'a message is a sign of life');
  clock.tick(1000);
  await room.webSocketMessage(host, fromHost('g1', ping));
  assert.deepEqual(guest.take(), [message('relay', { body: ping })]);
  assert.equal(ctx.alarmAt, clock.now + ROOM_TTL_MS);

  const armed = ctx.alarmAt;
  clock.tick(1000);
  await room.webSocketMessage(guest, new ArrayBuffer(3));
  await room.webSocketMessage(guest, 'not json');
  assert.equal(ctx.alarmAt, armed, 'a binary frame and junk are no sign of life (as at home)');
  await room.webSocketMessage(guest, JSON.stringify({ v: 1, type: 'relay' }));
  assert.deepEqual(host.take(), [], 'a binary frame, junk and a relay without a body go nowhere');

  clock.tick(1000);
  await clientCloses(room, guest);
  assert.deepEqual(host.take(), [message('left', { id: 'g1' })]);
  assert.equal(ctx.data.get('room').lastSeen, clock.now, 'stored again after a disconnect');
  assert.equal(ctx.alarmAt, clock.now + ROOM_TTL_MS, 'a disconnect is a sign of life');
});

test('a refused connect is told why and closed 1000, a replaced one too, and guests stay while the host is away', async () => {
  const ctx = new FakeCtx();
  const room = new Room(ctx, {});
  const early = await connect(room, ctx, '/fjolspil/ws/GULL?role=guest&id=g1');
  assert.deepEqual(early.take(), [message('error', { reason: 'no-room' })]);
  assert.equal(early.closed, 1000);
  const keyless = await connect(room, ctx, '/fjolspil/ws/GULL?role=host');
  assert.deepEqual(keyless.take(), [message('error', { reason: 'bad-id' })]);
  assert.equal(keyless.closed, 1000);
  assert.equal(ctx.data.size, 0, 'no room is kept for a refused connect');
  assert.equal(ctx.alarmAt, null);

  const host = await connect(room, ctx, '/fjolspil/ws/GULL?role=host&key=abc');
  host.take();
  const other = await connect(room, ctx, '/fjolspil/ws/GULL?role=host&key=zzz');
  assert.deepEqual(other.take(), [message('error', { reason: 'taken' })]);
  assert.equal(other.closed, 1000);
  const stranger = await connect(room, ctx, '/fjolspil/ws/GULL?role=judge');
  assert.deepEqual(stranger.take(), [message('error', { reason: 'bad-role' })]);
  assert.equal(stranger.closed, 1000);

  const tab1 = await connect(room, ctx, '/fjolspil/ws/GULL?role=guest&id=g1');
  const tab2 = await connect(room, ctx, '/fjolspil/ws/GULL?role=guest&id=g1');
  assert.deepEqual(tab1.take(), [message('error', { reason: 'replaced' })]);
  assert.equal(tab1.closed, 1000);
  assert.deepEqual(host.take(), [message('joined', { id: 'g1' }), message('joined', { id: 'g1' })]);
  await room.webSocketMessage(host, fromHost('g1', ping));
  assert.deepEqual(tab2.take(), [message('relay', { body: ping })], 'the new tab has the seat');
  await clientCloses(room, tab1);
  assert.deepEqual(host.take(), [], 'the replaced tab leaving is not the guest leaving');

  for (const guest of ['g2', 'g3']) await connect(room, ctx, `/fjolspil/ws/GULL?role=guest&id=${guest}`);
  host.take();
  const fourth = await connect(room, ctx, '/fjolspil/ws/GULL?role=guest&id=g4');
  assert.deepEqual(fourth.take(), [message('error', { reason: 'full' })]);
  assert.equal(fourth.closed, 1000);

  await clientCloses(room, host);
  assert.deepEqual(tab2.take(), [message('error', { reason: 'no-host' })]);
  assert.equal(tab2.closed, null, 'a guest keeps its socket while the host is away');
  const late = await connect(room, ctx, '/fjolspil/ws/GULL?role=guest&id=g5');
  assert.deepEqual(late.take(), [message('error', { reason: 'no-host' })]);
  assert.equal(late.closed, 1000);
  const back = await connect(room, ctx, '/fjolspil/ws/GULL?role=host&key=abc');
  assert.deepEqual(back.take(), [message('welcome', { code: 'GULL', join: [] }), ...['g1', 'g2', 'g3'].map(id => message('joined', { id }))]);

  const reload = await connect(room, ctx, '/fjolspil/ws/GULL?role=host&key=abc');
  assert.deepEqual(back.take(), [message('error', { reason: 'replaced' })]);
  assert.equal(back.closed, 1000);
  assert.equal(reload.take()[0].type, 'welcome', 'the big screen reloaded takes the room over');
});

test('after hibernation the room is rebuilt from storage and the sockets\' attachments', async () => {
  const ctx = new FakeCtx();
  const a = new Room(ctx, {});
  const host = await connect(a, ctx, '/fjolspil/ws/GULL?role=host&key=abc');
  const old = await connect(a, ctx, '/fjolspil/ws/GULL?role=guest&id=g1');
  const guest = await connect(a, ctx, '/fjolspil/ws/GULL?role=guest&id=g1'); // the same phone again: old is replaced
  const g2 = await connect(a, ctx, '/fjolspil/ws/GULL?role=guest&id=g2');
  for (const ws of [host, old, guest, g2]) ws.take();
  assert.equal(old.gone, false, 'the replaced socket is still among the runtime\'s until its client answers the close');

  // The same object woken from hibernation: storage and sockets kept, its memory gone.
  const b = new Room(ctx, {});
  await b.webSocketMessage(guest, fromGuest(hello));
  assert.deepEqual(host.take(), [message('relay', { from: 'g1', body: hello })]);
  await b.webSocketMessage(host, fromHost('g1', ping));
  assert.deepEqual(guest.take(), [message('relay', { body: ping })], 'the guest who replaced the old socket has the seat');
  await b.webSocketMessage(host, fromHost('g2', ping));
  assert.deepEqual(g2.take(), [message('relay', { body: ping })]);
  assert.deepEqual(old.sent, []);
  ctx.reversed = true;
  await new Room(ctx, {}).webSocketMessage(host, fromHost('g1', ping));
  assert.deepEqual(guest.take(), [message('relay', { body: ping })], 'in whatever order the sockets come back');
  assert.deepEqual(old.sent, []);
  ctx.reversed = false;

  const c = new Room(ctx, {});
  await clientCloses(c, g2);
  assert.deepEqual(host.take(), [message('left', { id: 'g2' })], 'a guest leaving while the room slept is told to the host');

  const d = new Room(ctx, {});
  const thief = await connect(d, ctx, '/fjolspil/ws/GULL?role=host&key=zzz');
  assert.deepEqual(thief.take(), [message('error', { reason: 'taken' })], 'the host\'s key outlives the hibernation');
  const reload = await connect(d, ctx, '/fjolspil/ws/GULL?role=host&key=abc');
  assert.deepEqual(reload.take(), [message('welcome', { code: 'GULL', join: [] }), message('joined', { id: 'g1' })]);
  assert.deepEqual(host.take(), [message('error', { reason: 'replaced' })]);
  assert.equal(host.closed, 1000);

  // The host goes, the room sleeps, and its guest is still in it when the host comes back.
  await clientCloses(d, reload);
  assert.deepEqual(guest.take(), [message('error', { reason: 'no-host' })]);
  const e = new Room(ctx, {});
  await e.webSocketMessage(guest, fromGuest(hello)); // to nobody: the host is away
  const back = await connect(e, ctx, '/fjolspil/ws/GULL?role=host&key=abc');
  assert.deepEqual(back.take(), [message('welcome', { code: 'GULL', join: [] }), message('joined', { id: 'g1' })]);
  await e.webSocketMessage(guest, fromGuest(hello));
  assert.deepEqual(back.take(), [message('relay', { from: 'g1', body: hello })]);
});

test('a rebuild after hibernation sends nothing to anyone', async () => {
  const ctx = new FakeCtx();
  const a = new Room(ctx, {});
  const host = await connect(a, ctx, '/fjolspil/ws/GULL?role=host&key=abc');
  const guests = [];
  for (const id of ['g1', 'g2', 'g3']) guests.push(await connect(a, ctx, `/fjolspil/ws/GULL?role=guest&id=${id}`));
  const everyone = [host, ...guests];
  for (const ws of everyone) ws.take();

  await new Room(ctx, {}).webSocketMessage(guests[0], 'not json'); // wakes it, and is itself nothing to carry
  for (const ws of everyone) {
    assert.deepEqual(ws.sent, [], 'no welcome, joined or replaced again');
    assert.equal(ws.closed, null);
  }

  await clientCloses(new Room(ctx, {}), host);
  for (const ws of guests) assert.deepEqual(ws.take(), [message('error', { reason: 'no-host' })]);
  await new Room(ctx, {}).webSocketMessage(guests[1], 'not json'); // rebuilt with its host away
  for (const ws of everyone) assert.deepEqual(ws.sent, [], 'no no-host again either');
  for (const ws of guests) assert.equal(ws.closed, null);
});

test('the alarm closes every socket and forgets the room', async () => {
  const ctx = new FakeCtx();
  const a = new Room(ctx, {});
  const host = await connect(a, ctx, '/fjolspil/ws/GULL?role=host&key=abc');
  const guest = await connect(a, ctx, '/fjolspil/ws/GULL?role=guest&id=g1');
  const refused = await connect(a, ctx, '/fjolspil/ws/GULL?role=host&key=zzz'); // closed already, not yet gone
  for (const ws of [host, guest, refused]) ws.take();

  const b = new Room(ctx, {}); // two hours on, the room has long been asleep
  await b.alarm();
  assert.equal(host.closed, 1001);
  assert.equal(guest.closed, 1001);
  assert.equal(refused.closed, 1000, 'a socket closed already keeps its close, and the rest are closed all the same');
  assert.deepEqual(host.sent, [], 'no error: the close says it');
  assert.deepEqual(guest.sent, []);
  assert.equal(ctx.data.size, 0, 'storage is empty');

  for (const ws of [host, guest]) await clientCloses(b, ws);
  const retry = await connect(b, ctx, '/fjolspil/ws/GULL?role=guest&id=g1');
  assert.deepEqual(retry.take(), [message('error', { reason: 'no-room' })], 'the phone\'s retry hears no-room and stops');
  assert.equal(retry.closed, 1000);
  const fresh = await connect(new Room(ctx, {}), ctx, '/fjolspil/ws/GULL?role=host&key=new');
  assert.deepEqual(fresh.take(), [message('welcome', { code: 'GULL', join: [] })], 'the code is free for a new host');
});

test('a bad code or a non-upgrade is refused', async () => {
  const ctx = new FakeCtx();
  const named = [];
  const fetched = [];
  const env = {
    ROOMS: { idFromName: name => { named.push(name); return `id:${name}`; }, get: () => new Room(ctx, {}) },
    ASSETS: { fetch: async req => { fetched.push(new URL(req.url).pathname); return new Response('asset', { status: 200 }); } },
  };

  for (const path of ['/fjolspil/ws/toolong?role=host&key=k', '/fjolspil/ws/G0LL?role=host&key=k', '/fjolspil/ws/?role=host&key=k']) {
    assert.equal((await worker.fetch(request(path), env)).status, 400, path);
  }
  assert.deepEqual(named, [], 'a bad code never reaches a Room');
  assert.equal((await worker.fetch(request('/fjolspil/ws/GULL?role=host&key=k', {}), env)).status, 426, 'not an upgrade');
  assert.equal((await new Room(ctx, {}).fetch(request('/fjolspil/ws/GULL?role=host&key=k', { upgrade: 'h2c' }))).status, 426);
  assert.equal((await new Room(ctx, {}).fetch(request('/fjolspil/ws/QQQQ?role=host&key=k'))).status, 400);
  assert.equal(ctx.sockets.length, 0, 'no socket was made for any of them');

  const upgraded = await worker.fetch(request('/fjolspil/ws/gull?role=host&key=k'), env);
  assert.equal(upgraded.status, 101);
  assert.deepEqual(named, ['GULL', 'GULL'], 'a code is the Room\'s name in capitals');

  const home = await worker.fetch(request('/'), env);
  assert.equal(home.status, 302);
  assert.equal(home.headers.get('location'), '/remake/');
  await worker.fetch(request('/remake/spil.html?code=GULL'), env);
  await worker.fetch(request('/fjolspil/ws/GULL/more'), env);
  assert.deepEqual(fetched, ['/remake/spil.html', '/fjolspil/ws/GULL/more'], 'everything else is the static assets\'');
});
