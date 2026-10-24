// remake/tests/fjolspil-net.test.mjs — the network of "Fjölspil" (engine/fjolspil/net.js, spec §6.2–6.4) with fakes for the
// WebSocket, the RTCPeerConnection and its data channel, and the timers: what the big screen and a phone send each other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSED_PINGS, PING_MS, RTC_FALLBACK_MS, message } from '../engine/fjolspil/protocol.js';
import { createGuestNet, createHostNet, iceServersFor, wsUrlFor } from '../engine/fjolspil/net.js';

// ---- The fakes ----------------------------------------------------------------------------------------------------------

/** A WebSocket class of its own for each test: the sockets made, in order; the test opens, feeds and closes them. */
function fakeSockets() {
  const made = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.closed = false;
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      made.push(this);
    }
    send(text) {
      if (this.readyState !== 1) throw new Error('InvalidStateError');
      this.sent.push(text);
    }
    /** Closed, by the net or (from the test) by the far end: the close event comes at once. */
    close(code = 1000) {
      if (this.closed) return;
      this.closed = true;
      this.readyState = 3;
      this.onclose?.({ code });
    }
    open() {
      this.readyState = 1;
      this.onopen?.({});
    }
    receive(text) {
      this.onmessage?.({ data: typeof text === 'string' ? text : JSON.stringify(text) });
    }
    /** What went out, parsed. */
    get messages() { return this.sent.map(text => JSON.parse(text)); }
  }
  return { FakeWebSocket, made };
}

/** RTCPeerConnection and RTCDataChannel as far as net.js uses them; `peers` are the ones made, numbered from 1. */
function fakePeers() {
  const peers = [];
  class FakeChannel {
    constructor(label, options) {
      this.label = label;
      this.options = options;
      this.readyState = 'connecting';
      this.sent = [];
      this.onopen = this.onmessage = this.onclose = null;
    }
    send(text) {
      if (this.readyState !== 'open') throw new Error('InvalidStateError');
      this.sent.push(text);
    }
    open() {
      this.readyState = 'open';
      this.onopen?.({});
    }
    close() {
      if (this.readyState === 'closed') return;
      this.readyState = 'closed';
      this.onclose?.({});
    }
    receive(text) {
      this.onmessage?.({ data: typeof text === 'string' ? text : JSON.stringify(text) });
    }
    get messages() { return this.sent.map(text => JSON.parse(text)); }
  }
  class FakePeer {
    constructor(config) {
      this.config = config;
      this.n = peers.push(this);
      this.channels = [];
      this.local = null;
      this.remote = null;
      this.candidates = [];
      this.closed = false;
      this.onicecandidate = this.ondatachannel = null;
    }
    createDataChannel(label, options) {
      const channel = new FakeChannel(label, options);
      this.channels.push(channel);
      return channel;
    }
    async createOffer() { return { type: 'offer', sdp: `sdp-${this.n}` }; }
    async createAnswer() { return { type: 'answer', sdp: `sdp-${this.n}` }; }
    async setLocalDescription(description) { this.local = description; }
    async setRemoteDescription(description) { this.remote = description; }
    async addIceCandidate(candidate) {
      if (!this.remote) throw new Error('InvalidStateError: no remote description');
      this.candidates.push(candidate);
    }
    /** As a real one: its channels are closed with it, without their close events. */
    close() {
      this.closed = true;
      for (const channel of this.channels) channel.readyState = 'closed';
    }
  }
  return { FakePeer, FakeChannel, peers };
}

/** Timers that run when the test says: advance(ms) runs everything due, in order; `delays` are the timeouts waiting. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const queue = new Map(); // id → { at, fn, ms, every }
  return {
    setTimeout(fn, ms = 0) { const id = next++; queue.set(id, { at: now + ms, fn, ms, every: 0 }); return id; },
    clearTimeout(id) { queue.delete(id); },
    setInterval(fn, ms) { const id = next++; queue.set(id, { at: now + ms, fn, ms, every: ms }); return id; },
    clearInterval(id) { queue.delete(id); },
    get delays() { return [...queue.values()].filter(timer => !timer.every).map(timer => timer.ms); },
    get count() { return queue.size; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let due = null;
        for (const [id, timer] of queue) if (timer.at <= end && (!due || timer.at < due[1].at)) due = [id, timer];
        if (!due) break;
        const [id, timer] = due;
        now = timer.at;
        if (timer.every) timer.at += timer.every;
        else queue.delete(id);
        timer.fn();
      }
      now = end;
    },
  };
}

/** Every promise the fakes made has settled. */
const settle = () => new Promise(resolve => setImmediate(resolve));

const HOST_URL = 'ws://192.168.1.10:4198/fjolspil/ws/GULL?role=host&key=k';
const GUEST_URL = 'ws://192.168.1.10:4198/fjolspil/ws/GULL?role=guest&id=g1';
const fromGuest = (id, body) => message('relay', { from: id, body });
const fromHost = body => message('relay', { body });

/** The big screen with its socket open and welcomed, and everything it tells its listeners. */
function hostRig(options = {}) {
  const sockets = fakeSockets();
  const rtc = fakePeers();
  const timers = fakeTimers();
  const net = createHostNet({ url: HOST_URL, timers, WebSocketImpl: sockets.FakeWebSocket, PeerConnectionImpl: rtc.FakePeer, ...options });
  const log = { joins: [], leaves: [], messages: [], presence: [], statuses: [], welcomes: [] };
  net.onJoin(id => log.joins.push(id));
  net.onLeave(id => log.leaves.push(id));
  net.onMessage((id, msg) => log.messages.push([id, msg]));
  net.onPresence((id, present) => log.presence.push([id, present]));
  net.onStatus(status => log.statuses.push(status));
  net.onWelcome(welcome => log.welcomes.push(welcome));
  const ws = sockets.made[0];
  ws.open();
  ws.receive(message('welcome', { code: 'GULL', join: ['http://192.168.1.10:4198/remake/spil.html'] }));
  /** The bodies relayed to guest `id` over the socket. */
  const relayed = (id, socket = ws) => socket.messages.filter(m => m.type === 'relay' && m.body.to === id).map(m => m.body.body);
  return { net, ws, sockets, rtc, timers, log, relayed };
}

/** A phone's net, its socket made but not yet open, and everything it tells its listeners. */
function guestRig(options = {}) {
  const sockets = fakeSockets();
  const rtc = fakePeers();
  const timers = fakeTimers();
  const net = createGuestNet({ url: GUEST_URL, timers, WebSocketImpl: sockets.FakeWebSocket, PeerConnectionImpl: rtc.FakePeer, iceServers: [], ...options });
  const log = { messages: [], statuses: [] };
  net.onMessage(msg => log.messages.push(msg));
  net.onStatus(status => log.statuses.push(status));
  /** The bodies the phone relayed over a socket. */
  const relayed = socket => socket.messages.filter(m => m.type === 'relay').map(m => m.body.body);
  return { net, sockets, rtc, timers, log, relayed };
}

// ---- The addresses -------------------------------------------------------------------------------------------------------

test('wsUrlFor keeps the page\'s host and uses wss on https', () => {
  assert.equal(wsUrlFor({ protocol: 'http:', host: '192.168.1.10:4198' }, 'GULL', { role: 'guest', id: 'g' }), 'ws://192.168.1.10:4198/fjolspil/ws/GULL?role=guest&id=g');
  assert.equal(wsUrlFor({ protocol: 'https:', host: 'mosi.example' }, 'GULL', { role: 'host', key: 'k' }), 'wss://mosi.example/fjolspil/ws/GULL?role=host&key=k');
});

test('iceServersFor has no STUN at home and Cloudflare\'s in the cloud', () => {
  assert.deepEqual(iceServersFor({ protocol: 'http:' }), []);
  assert.deepEqual(iceServersFor({ protocol: 'https:' }), [{ urls: 'stun:stun.cloudflare.com:3478' }]);
});

// ---- The big screen ------------------------------------------------------------------------------------------------------

test('the host offers every guest a data channel and talks on it once it opens', async () => {
  const { net, ws, rtc, log, relayed } = hostRig({ iceServers: [{ urls: 'stun:example' }] });
  assert.deepEqual(log.welcomes, [{ code: 'GULL', join: ['http://192.168.1.10:4198/remake/spil.html'] }]);
  assert.deepEqual(log.statuses, ['connecting', 'connected']);
  assert.equal(ws.url, HOST_URL);

  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  assert.deepEqual(log.joins, ['g1']);
  assert.equal(rtc.peers.length, 1, 'one peer for the guest');
  const [peer] = rtc.peers;
  assert.deepEqual(peer.config, { iceServers: [{ urls: 'stun:example' }] });
  assert.equal(peer.channels.length, 1);
  const [channel] = peer.channels;
  assert.equal(channel.label, 'fjolspil');
  assert.deepEqual(channel.options, { ordered: true });
  assert.deepEqual(peer.local, { type: 'offer', sdp: 'sdp-1' });
  assert.deepEqual(relayed('g1'), [message('offer', { sdp: 'sdp-1' })], 'the offer went to g1 through the meeting point');
  assert.equal(net.transportOf('g1'), null, 'neither way yet');

  // The guest's candidate can come before its answer: it waits for the answer.
  ws.receive(fromGuest('g1', message('ice', { candidate: { candidate: 'guest-1', sdpMid: '0' } })));
  ws.receive(fromGuest('g1', message('answer', { sdp: 'answer-1' })));
  await settle();
  assert.deepEqual(peer.remote, { type: 'answer', sdp: 'answer-1' });
  assert.deepEqual(peer.candidates, [{ candidate: 'guest-1', sdpMid: '0' }]);
  peer.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'host-1', sdpMid: '0' }) } });
  peer.onicecandidate({ candidate: null }); // the end of the candidates is not sent
  assert.deepEqual(relayed('g1').slice(1), [message('ice', { candidate: { candidate: 'host-1', sdpMid: '0' } })]);
  assert.deepEqual(log.messages, [], 'signaling is not a message for the game');

  channel.open();
  assert.equal(net.transportOf('g1'), 'rtc');
  const sentBefore = ws.sent.length;
  const lobby = message('view', { screen: 'lobby' }, { seq: 1 });
  assert.equal(net.send('g1', lobby), true);
  assert.deepEqual(channel.messages, [lobby], 'on the channel');
  assert.equal(ws.sent.length, sentBefore, 'not on the socket');

  channel.receive(message('hello', { name: 'Anna', avatar: 'kambedla' }));
  assert.deepEqual(log.messages, [['g1', message('hello', { name: 'Anna', avatar: 'kambedla' })]]);
  assert.equal(net.send('nobody', lobby), false, 'no such guest');
  net.close();
});

test('without a channel in four seconds the host relays, and switches when the channel opens late', async () => {
  const { net, ws, rtc, timers, relayed } = hostRig();
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  timers.advance(RTC_FALLBACK_MS - 1);
  assert.equal(net.transportOf('g1'), null);
  timers.advance(1);
  assert.equal(net.transportOf('g1'), 'relay');

  const view = message('view', { screen: 'lobby' }, { seq: 1 });
  assert.equal(net.send('g1', view), true);
  assert.deepEqual(ws.messages.at(-1), message('relay', { to: 'g1', body: view }));
  assert.deepEqual(relayed('g1').at(-1), view);

  const [channel] = rtc.peers[0].channels;
  channel.open();
  assert.equal(net.transportOf('g1'), 'rtc', 'the late channel is taken');
  const sentBefore = ws.sent.length;
  net.send('g1', view);
  assert.deepEqual(channel.messages, [view]);
  assert.equal(ws.sent.length, sentBefore);

  channel.close();
  assert.equal(net.transportOf('g1'), 'relay', 'a closed channel goes back to the relay');
  assert.equal(net.send('g1', view), true);
  assert.deepEqual(relayed('g1').at(-1), view);
  net.close();
});

test('forceRelay never makes a peer', async () => {
  const { net, ws, rtc, timers, relayed } = hostRig({ forceRelay: true });
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  assert.equal(rtc.peers.length, 0);
  assert.equal(net.transportOf('g1'), 'relay');
  assert.deepEqual(relayed('g1'), [], 'no offer');
  timers.advance(RTC_FALLBACK_MS);
  assert.equal(net.transportOf('g1'), 'relay');
  assert.equal(net.send('g1', message('view', { screen: 'closed' }, { seq: 1 })), true);
  assert.deepEqual(relayed('g1'), [message('view', { screen: 'closed' }, { seq: 1 })]);
  net.close();
});

test('a guest that joins again gets a fresh offer, and the old peer is closed', async () => {
  const { net, ws, rtc, log, relayed } = hostRig();
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  assert.equal(rtc.peers.length, 2);
  assert.equal(rtc.peers[0].closed, true, 'the old peer is closed');
  assert.equal(rtc.peers[1].closed, false);
  const offers = relayed('g1').filter(m => m.type === 'offer');
  assert.deepEqual(offers.map(m => m.body.sdp), ['sdp-1', 'sdp-2'], 'two offers, the second fresh');
  assert.deepEqual(log.joins, ['g1', 'g1']);
  assert.deepEqual(log.leaves, []);
  rtc.peers[0].channels[0].onopen?.({}); // the old channel's late events are not this guest's any more
  assert.equal(net.transportOf('g1'), null);
  rtc.peers[1].channels[0].open();
  assert.equal(net.transportOf('g1'), 'rtc');
  net.close();
});

test('three missed pings make a guest absent, and a pong brings it back', async () => {
  const { net, ws, timers, log, relayed } = hostRig();
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  const pings = () => relayed('g1').filter(m => m.type === 'ping');
  timers.advance(PING_MS * (MISSED_PINGS - 1));
  assert.equal(pings().length, MISSED_PINGS - 1);
  assert.deepEqual(log.presence, [], 'two pings unanswered is not yet absent');
  timers.advance(PING_MS);
  assert.equal(pings().length, 3, 'a ping to g1 every PING_MS');
  assert.deepEqual(pings()[0], message('ping', {}));
  assert.deepEqual(log.presence, [['g1', false]]);
  timers.advance(PING_MS);
  assert.deepEqual(log.presence, [['g1', false]], 'absent is said once');

  ws.receive(fromGuest('g1', message('pong', {})));
  assert.deepEqual(log.presence, [['g1', false], ['g1', true]]);
  assert.deepEqual(log.messages, [], 'a pong is not a message for the game');
  timers.advance(PING_MS * (MISSED_PINGS - 1));
  ws.receive(fromGuest('g1', message('pong', {})));
  timers.advance(PING_MS * (MISSED_PINGS - 1));
  assert.deepEqual(log.presence, [['g1', false], ['g1', true]], 'each pong starts the count again');
  net.close();
});

test('a guest that joins again while absent is there, and three missed pings make her absent again', async () => {
  const { net, ws, timers, log } = hostRig();
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  timers.advance(PING_MS * MISSED_PINGS);
  assert.deepEqual(log.presence, [['g1', false]]);
  ws.receive(message('joined', { id: 'g1' })); // another tab of the phone took over: no left before it
  await settle();
  assert.deepEqual(log.presence, [['g1', false]], 'the join says she is there: no onPresence beside it');
  timers.advance(PING_MS * (MISSED_PINGS - 1));
  assert.deepEqual(log.presence, [['g1', false]], 'her pings count from none again');
  timers.advance(PING_MS); // and she never answered one
  assert.deepEqual(log.presence, [['g1', false], ['g1', false]]);
  ws.receive(fromGuest('g1', message('pong', {})));
  assert.deepEqual(log.presence, [['g1', false], ['g1', false], ['g1', true]]);
  net.close();
});

test('a guest that leaves is let go: onLeave, its peer closed, no more pings', async () => {
  const { net, ws, rtc, timers, log, relayed } = hostRig();
  ws.receive(message('joined', { id: 'g1' }));
  ws.receive(message('joined', { id: 'g2' }));
  await settle();
  ws.receive(message('left', { id: 'g1' }));
  assert.deepEqual(log.leaves, ['g1']);
  assert.equal(rtc.peers[0].closed, true);
  assert.equal(rtc.peers[1].closed, false);
  assert.equal(net.transportOf('g1'), null);
  assert.equal(net.send('g1', message('view', { screen: 'closed' }, { seq: 1 })), false);
  timers.advance(PING_MS);
  assert.deepEqual(relayed('g1').filter(m => m.type === 'ping'), []);
  assert.equal(relayed('g2').filter(m => m.type === 'ping').length, 1);
  ws.receive(message('left', { id: 'g1' }));
  assert.deepEqual(log.leaves, ['g1'], 'a guest leaves once');
  net.broadcast(message('view', { screen: 'closed' }, { seq: 2 }));
  assert.deepEqual(relayed('g2').at(-1), message('view', { screen: 'closed' }, { seq: 2 }));
  net.close();
});

test('the host drops what is not a message', async () => {
  const { net, ws, rtc, log } = hostRig();
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  assert.doesNotThrow(() => {
    ws.receive('junk');
    ws.receive('{"v":1,"type":"relay","body":{"from":"g1","body":"x"}}');
    ws.receive('{"v":1,"type":"relay"}');
    ws.receive('{"v":1,"type":"relay","body":null}');
    ws.receive(fromGuest('g1', { v: 2, type: 'hello', body: {} }));
    ws.receive(fromGuest('g1', { v: 1, type: '', body: {} }));
    ws.receive(fromGuest('nobody', message('hello', { name: 'Anna', avatar: 'kambedla' })));
    ws.receive(message('joined', {}));
    ws.receive(message('answer', { sdp: 'not through relay' }));
    rtc.peers[0].channels[0].receive('junk');
    rtc.peers[0].channels[0].receive('{"v":1}');
  });
  assert.deepEqual(log.messages, []);
  assert.deepEqual(log.joins, ['g1']);
  net.close();
});

test('a reloaded big screen in another tab takes the room: this one is closed', async () => {
  const { net, ws, rtc, timers, log } = hostRig();
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  ws.receive(message('error', { reason: 'replaced' }));
  ws.close(1000);
  assert.equal(net.status, 'closed');
  assert.deepEqual(log.statuses.slice(-2), ['replaced', 'closed']);
  assert.equal(rtc.peers[0].closed, true);
  assert.equal(timers.count, 0, 'no timers left, no reconnect');
  assert.equal(net.send('g1', message('view', { screen: 'closed' }, { seq: 1 })), false);
});

test('a code another host holds is taken, and the host does not try it again', () => {
  const sockets = fakeSockets();
  const timers = fakeTimers();
  const net = createHostNet({ url: HOST_URL, timers, WebSocketImpl: sockets.FakeWebSocket, PeerConnectionImpl: fakePeers().FakePeer });
  const statuses = [];
  net.onStatus(status => statuses.push(status));
  sockets.made[0].open();
  sockets.made[0].receive(message('error', { reason: 'taken' }));
  sockets.made[0].close(1000);
  assert.deepEqual(statuses, ['connecting', 'taken']);
  assert.equal(net.status, 'taken');
  assert.deepEqual(timers.delays, []);
  assert.equal(sockets.made.length, 1);
  net.close();
  assert.equal(net.status, 'closed');
});

test('a host whose socket drops lets its guests go and comes back to the same room', async () => {
  const { net, ws, sockets, rtc, timers, log } = hostRig();
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  ws.close(1006);
  assert.equal(net.status, 'offline');
  assert.deepEqual(log.leaves, ['g1']);
  assert.equal(rtc.peers[0].closed, true);
  assert.deepEqual(timers.delays, [1000]);
  timers.advance(1000);
  assert.equal(sockets.made.length, 2);
  assert.equal(sockets.made[1].url, HOST_URL, 'the same room and key');
  assert.equal(net.status, 'connecting');
  sockets.made[1].close(1006);
  assert.deepEqual(timers.delays, [2000], 'no answer yet: a longer wait');
  timers.advance(2000);
  sockets.made[2].open();
  sockets.made[2].receive(message('welcome', { code: 'GULL', join: [] }));
  sockets.made[2].receive(message('joined', { id: 'g1' }));
  await settle();
  assert.equal(net.status, 'connected');
  assert.deepEqual(log.joins, ['g1', 'g1']);
  assert.equal(rtc.peers.length, 2, 'a fresh offer');
  sockets.made[2].close(1006);
  assert.deepEqual(timers.delays, [1000], 'the welcome started the waits again');
  net.close();
});

test('a listener that throws while the host\'s socket drops is reported, and the host still tries again', async () => {
  const reported = [];
  const { net, ws, timers, log } = hostRig({ report: error => reported.push(error) });
  const boom = new Error('the session tripped over onLeave');
  net.onLeave(() => { throw boom; });
  const after = [];
  net.onLeave(id => after.push(id));
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  ws.close(1006);
  assert.deepEqual(reported, [boom], 'the error is reported, not swallowed');
  assert.deepEqual(after, ['g1'], 'a listener after the one that threw is still called');
  assert.deepEqual(log.leaves, ['g1']);
  assert.equal(net.status, 'offline');
  assert.deepEqual(timers.delays, [1000], 'the next try is queued');
  net.close();
});

test('close lets everything go, and nothing after it throws or is heard', async () => {
  const { net, ws, rtc, timers, log } = hostRig();
  ws.receive(message('joined', { id: 'g1' }));
  await settle();
  net.close();
  assert.equal(ws.closed, true);
  assert.equal(rtc.peers[0].closed, true);
  assert.equal(timers.count, 0, 'no timers left');
  assert.equal(net.status, 'closed');
  const heard = log.messages.length + log.joins.length + log.leaves.length;
  assert.doesNotThrow(() => {
    ws.receive(fromGuest('g1', message('hello', { name: 'Anna', avatar: 'kambedla' })));
    ws.receive(message('joined', { id: 'g2' }));
    rtc.peers[0].channels[0].receive(message('hello', { name: 'Anna', avatar: 'kambedla' }));
    net.close();
  });
  assert.equal(log.messages.length + log.joins.length + log.leaves.length, heard);
  assert.equal(net.send('g1', message('view', { screen: 'closed' }, { seq: 1 })), false);
});

// ---- A phone -------------------------------------------------------------------------------------------------------------

test('the guest answers an offer, pongs on the channel, and reconnects with backoff', async () => {
  const { net, sockets, rtc, timers, log, relayed } = guestRig();
  const ws = sockets.made[0];
  assert.equal(ws.url, GUEST_URL);
  ws.open();
  assert.equal(net.transport, 'relay');

  ws.receive(fromHost(message('offer', { sdp: 'offer-1' })));
  ws.receive(fromHost(message('ice', { candidate: { candidate: 'host-1', sdpMid: '0' } }))); // before the offer is set
  await settle();
  assert.equal(rtc.peers.length, 1);
  const [peer] = rtc.peers;
  assert.deepEqual(peer.config, { iceServers: [] });
  assert.deepEqual(peer.remote, { type: 'offer', sdp: 'offer-1' });
  assert.deepEqual(peer.local, { type: 'answer', sdp: 'sdp-1' });
  assert.deepEqual(ws.messages[0], message('relay', { body: message('answer', { sdp: 'sdp-1' }) }), 'the answer went back through the meeting point');
  assert.deepEqual(peer.candidates, [{ candidate: 'host-1', sdpMid: '0' }]);
  peer.onicecandidate({ candidate: { candidate: 'guest-1', sdpMid: '0' } });
  peer.onicecandidate({ candidate: null });
  assert.deepEqual(relayed(ws).slice(1), [message('ice', { candidate: { candidate: 'guest-1', sdpMid: '0' } })]);

  const channel = new rtc.FakeChannel('fjolspil', { ordered: true });
  peer.ondatachannel({ channel });
  channel.open();
  assert.equal(net.transport, 'rtc');
  channel.receive(message('ping', {}));
  assert.deepEqual(channel.messages, [message('pong', {})], 'the pong went back on the channel');
  const sentBefore = ws.sent.length;
  ws.receive(fromHost(message('ping', {})));
  assert.deepEqual(ws.messages.slice(sentBefore), [message('relay', { body: message('pong', {}) })], 'a ping on the relay is answered on the relay');

  const view = message('view', { screen: 'lobby' }, { seq: 1 });
  channel.receive(view);
  ws.receive(fromHost(message('view', { screen: 'closed' }, { seq: 2 })));
  assert.deepEqual(log.messages, [view, message('view', { screen: 'closed' }, { seq: 2 })], 'views from either way; no signaling, no pings');
  const hello = message('hello', { name: 'Anna', avatar: 'kambedla' });
  assert.equal(net.send(hello), true);
  assert.deepEqual(channel.messages.at(-1), hello, 'send uses the open channel');

  ws.close(1006); // the network took the socket
  assert.equal(net.status, 'offline');
  assert.equal(peer.closed, true, 'the peer goes with the socket');
  assert.deepEqual(timers.delays, [1000]);
  assert.equal(net.send(hello), false, 'nothing can carry it now');
  timers.advance(1000);
  assert.equal(sockets.made.length, 2, 'a new socket after a second');
  assert.equal(sockets.made[1].url, GUEST_URL, 'with the same guest id');
  sockets.made[1].close(1006);
  assert.deepEqual(timers.delays, [2000], 'then two seconds');
  net.reconnect();
  assert.equal(sockets.made.length, 3, 'reconnect() tries at once');
  assert.deepEqual(timers.delays, []);
  sockets.made[2].close(1006);
  assert.deepEqual(timers.delays, [1000], 'and the wait starts again from one second');
  net.close();
  assert.equal(timers.count, 0);
});

test('the waits grow to fifteen seconds and stay there', () => {
  const { net, sockets, timers } = guestRig();
  const waits = [];
  for (let n = 0; n < 7; n++) {
    sockets.made.at(-1).close(1006);
    waits.push(...timers.delays);
    timers.advance(timers.delays[0]);
  }
  assert.deepEqual(waits, [1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  const ws = sockets.made.at(-1);
  ws.open();
  ws.close(1006);
  assert.deepEqual(timers.delays, [15000], 'an open socket the big screen never spoke on is no answer');
  timers.advance(15000);
  sockets.made.at(-1).open();
  sockets.made.at(-1).receive(fromHost(message('ping', {})));
  sockets.made.at(-1).close(1006);
  assert.deepEqual(timers.delays, [1000], 'once the big screen has spoken, the waits start again');
  net.close();
});

test('the guest says connecting on every try: the first, each one after a wait, and reconnect()', () => {
  const { net, sockets, timers, log } = guestRig();
  assert.deepEqual(log.statuses, ['connecting'], 'the first try, told to a listener that came after it');
  sockets.made[0].open();
  sockets.made[0].close(1006);
  timers.advance(1000);
  sockets.made[1].close(1006);
  timers.advance(2000);
  assert.deepEqual(log.statuses, ['connecting', 'connected', 'offline', 'connecting', 'offline', 'connecting']);
  sockets.made[2].open();
  net.reconnect(); // an open socket is let go and a new one made at once
  assert.equal(sockets.made[2].closed, true);
  assert.equal(sockets.made.length, 4);
  sockets.made[3].close(1006);
  net.reconnect(); // while waiting for the next try
  assert.equal(sockets.made.length, 5);
  assert.deepEqual(log.statuses.slice(6), ['connected', 'connecting', 'offline', 'connecting']);
  net.reconnect(); // a socket still connecting is the try already
  assert.equal(sockets.made.length, 5);
  net.close();
  assert.equal(log.statuses.at(-1), 'closed');
});

test('a status listener that throws on offline is reported, and the guest still tries again', () => {
  const reported = [];
  const { net, sockets, timers, log } = guestRig({ report: error => reported.push(error) });
  const boom = new Error('the page tripped over offline');
  net.onStatus(status => { if (status === 'offline') throw boom; });
  const after = [];
  net.onStatus(status => after.push(status));
  sockets.made[0].open();
  sockets.made[0].close(1006);
  assert.deepEqual(reported, [boom]);
  assert.equal(net.status, 'offline');
  assert.deepEqual(timers.delays, [1000], 'the next try is queued');
  timers.advance(1000);
  assert.equal(sockets.made.length, 2);
  assert.deepEqual(after, ['connecting', 'connected', 'offline', 'connecting'], 'later statuses still reach the next listener');
  assert.deepEqual(log.statuses, ['connecting', 'connected', 'offline', 'connecting']);
  net.close();
});

test('server errors become statuses', () => {
  const run = (reason, before = () => {}) => {
    const rig = guestRig();
    const ws = rig.sockets.made[0];
    ws.open();
    before(ws);
    ws.receive(message('error', { reason }));
    return { ...rig, ws };
  };

  const noRoom = run('no-room');
  assert.equal(noRoom.log.statuses.at(-1), 'no-room');
  noRoom.ws.close(1000);
  assert.equal(noRoom.net.status, 'no-room', 'the close after it is not offline');
  assert.deepEqual(noRoom.timers.delays, [], 'and no room is not tried again');
  noRoom.net.close();

  const full = run('full');
  assert.equal(full.log.statuses.at(-1), 'full');
  full.ws.close(1000);
  assert.equal(full.net.status, 'full');
  assert.deepEqual(full.timers.delays, [1000], 'a full table may free a seat: tried again');
  full.net.close();

  const noHost = run('no-host');
  assert.equal(noHost.log.statuses.at(-1), 'no-host');
  assert.equal(noHost.ws.closed, false, 'the socket stays open');
  assert.equal(noHost.net.status, 'no-host');
  noHost.ws.receive(fromHost(message('offer', { sdp: 'offer-1' })));
  assert.equal(noHost.net.status, 'connected', 'the big screen is back');
  noHost.net.close();

  const gone = run('no-host', ws => ws.receive(fromHost(message('ping', {}))));
  assert.equal(gone.log.statuses.at(-1), 'host-gone', 'a host heard before has gone');
  assert.equal(gone.ws.closed, false);
  gone.net.close();

  const replaced = run('replaced');
  assert.equal(replaced.log.statuses.at(-1), 'replaced');
  replaced.ws.close(1000);
  assert.equal(replaced.net.status, 'replaced');
  assert.deepEqual(replaced.timers.delays, [], 'the other tab keeps the seat: no try again');
  replaced.net.close();
});

test('a phone without WebRTC leaves the offer unanswered and talks on the relay', async () => {
  const sockets = fakeSockets();
  const timers = fakeTimers();
  const net = createGuestNet({ url: GUEST_URL, timers, WebSocketImpl: sockets.FakeWebSocket, PeerConnectionImpl: null });
  const ws = sockets.made[0];
  ws.open();
  ws.receive(fromHost(message('offer', { sdp: 'offer-1' })));
  await settle();
  assert.deepEqual(ws.sent, []);
  assert.equal(net.transport, 'relay');
  assert.equal(net.send(message('hello', { name: 'Anna', avatar: 'kambedla' })), true);
  assert.deepEqual(ws.messages, [message('relay', { body: message('hello', { name: 'Anna', avatar: 'kambedla' }) })]);
  net.close();
});

test('the guest drops what is not a message, and nothing after close is heard', async () => {
  const { net, sockets, rtc, log } = guestRig();
  const ws = sockets.made[0];
  ws.open();
  assert.doesNotThrow(() => {
    ws.receive('junk');
    ws.receive('{"v":1,"type":"relay","body":{"body":"x"}}');
    ws.receive('{"v":1,"type":"relay"}');
    ws.receive(fromHost({ v: 2, type: 'view', body: {} }));
    ws.receive(message('welcome', { code: 'GULL', join: [] }));
  });
  assert.deepEqual(log.messages, []);
  ws.receive(fromHost(message('offer', { sdp: 'offer-1' })));
  await settle();
  const channel = new rtc.FakeChannel('fjolspil', { ordered: true });
  rtc.peers[0].ondatachannel({ channel });
  channel.open();
  net.close();
  assert.equal(ws.closed, true);
  assert.equal(rtc.peers[0].closed, true);
  assert.doesNotThrow(() => {
    ws.receive(fromHost(message('view', { screen: 'closed' }, { seq: 1 })));
    channel.receive(message('view', { screen: 'closed' }, { seq: 1 }));
    net.reconnect();
    net.close();
  });
  assert.deepEqual(log.messages, []);
  assert.equal(sockets.made.length, 1);
  assert.equal(net.send(message('hello', {})), false);
});
