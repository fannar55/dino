// The connection of "Fjölspil" from each side (spec §6.2–6.4): the big screen's, createHostNet, and a phone's,
// createGuestNet. Both meet at the meeting point's WebSocket, /fjolspil/ws/<code> (tools/fjolspil-server.mjs at home, the
// Durable Object in the cloud), which says who comes and goes and carries `relay` envelopes (protocol.js's header). Over it
// the big screen offers every guest a WebRTC data channel of its own, a star with the big screen in the middle: the offer,
// the answer and the ICE candidates travel as relay bodies (offer { sdp }, answer { sdp }, ice { candidate }). Once a
// guest's channel is open its messages go on it; until then, when it has not opened RTC_FALLBACK_MS after the offer, and
// after it closes, they go through the meeting point as relay; a channel that opens late is taken. The game sees no
// difference. Everything on a channel and in a relay is the JSON text of one message ({ v: 1, type, body }), and what is
// not one is dropped.
//
// The big screen pings every guest every PING_MS, on whichever way that guest's messages go, and a phone answers pong on
// the way the ping came; MISSED_PINGS pings without a pong make the guest absent (onPresence(id, false)) and the next pong
// present again. A socket that closes under either side is opened again after 1, 2, 4 and 8 seconds and then every 15,
// never giving up; an answer from the other side (the welcome, or anything from the big screen) starts the waits again
// from one second, and so does a phone's reconnect() (the page calls it when it comes into view or the network is back).
//
// The statuses, onStatus(fn) (which tells fn the status there is now, then every one after) and `status`:
//   both    connecting   a socket is being opened: the first, every try after a wait, and reconnect()
//           offline      the socket closed under us; the next try is on its way
//           closed       close() was called (or, on the big screen, another tab took the room)
//   host    connected    the room is ours (welcome)
//           taken        the code is another host's: pick another (the session does, with a new net)
//           replaced     another tab with this key took the room: closed follows
//   guest   connected    the socket is open, or the big screen is heard again after no-host or host-gone
//           no-room      no room has this code (never opened, or forgotten): not tried again
//           full         the room has three guests: tried again, as a seat may free
//           no-host      the room's big screen is not there, and has not been since this net began: waiting
//           host-gone    the big screen this net heard has gone (the socket stays, or is tried again): waiting
//           replaced     this guest's id connected from another tab, which has the seat now: not tried again
// A refusal's reason the server may add later is a status of its own, and is not tried again.
//
// Plain JavaScript for the browser that loads in Node for the tests: the timers, the WebSocket and the RTCPeerConnection
// come in as options, defaulting to the page's own, read when a net is made (no RTCPeerConnection: the relay carries all).

import { MISSED_PINGS, PING_MS, RTC_FALLBACK_MS, message, parseMessage } from './protocol.js';

/** The data channel's label: one for each guest, reliable and in order (spec §6.2). */
export const CHANNEL_LABEL = 'fjolspil';

/** The waits before each try after a socket closed under us; the last one repeats (spec §6.4: 1, 2, 4 … 15 seconds). */
export const RECONNECT_MS = Object.freeze([1000, 2000, 4000, 8000, 15000]);

/** The refusals worth trying again: the big screen may come back, and a seat may free. */
const RETRY_AFTER = new Set(['no-host', 'full']);

const CONNECTING = 0; // WebSocket.readyState
const OPEN = 1;

// Wrapped, so the page's timers are called as functions and never as methods of another object.
const PAGE_TIMERS = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: id => clearInterval(id),
};

/** The meeting point's address beside the page: ws:// (wss:// on https) + the page's host + /fjolspil/ws/<code>?<params>. */
export function wsUrlFor(location, code, params = {}) {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null));
  return `${scheme}//${location.host}/fjolspil/ws/${encodeURIComponent(code)}?${query}`;
}

/** No STUN at home, where every device is on the same network; Cloudflare's free one in the cloud (spec §6.2). */
export function iceServersFor(location) {
  return location?.protocol === 'https:' ? [{ urls: 'stun:stun.cloudflare.com:3478' }] : [];
}

const isMessage = value => value !== null && typeof value === 'object' && value.v === 1 && typeof value.type === 'string' && value.type !== '';
const objectOf = value => (value !== null && typeof value === 'object' ? value : {});
const isId = value => typeof value === 'string' && value !== '';

/** A set of listeners: add(fn) returns the unsubscribe; emit(...) calls each one there is now. */
function listeners() {
  const fns = new Set();
  return {
    add(fn) {
      fns.add(fn);
      return () => { fns.delete(fn); };
    },
    emit(...args) {
      for (const fn of [...fns]) fn(...args);
    },
  };
}

/** One message as JSON on a data channel or a socket that is open; false when it is not (or the write throws). */
function write(target, ready, msg) {
  if (!ready) return false;
  try {
    target.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}
const overChannel = (channel, msg) => write(channel, channel?.readyState === 'open', msg);
const overSocket = (ws, msg) => write(ws, ws?.readyState === OPEN, msg);

/** An ICE candidate as it travels: its JSON form (RTCIceCandidate.toJSON), or the object itself. */
const candidateOf = candidate => (typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate);

/**
 * A peer's far side: the candidates that come before its description wait for it, since a candidate cannot be added
 * sooner (they come as soon as the other side has them, and setting a description takes a while).
 */
function remoteOf(peer) {
  let described = false;
  const early = [];
  const add = candidate => {
    try {
      Promise.resolve(peer.addIceCandidate(candidate)).catch(() => {});
    } catch {
      // a closed peer: nothing to add it to
    }
  };
  return {
    async describe(description) {
      await peer.setRemoteDescription(description);
      described = true;
      for (const candidate of early.splice(0)) add(candidate);
    },
    candidate(candidate) {
      if (described) add(candidate);
      else early.push(candidate);
    },
  };
}

/** Closes a peer and lets go of its events; closing one already closed does nothing. */
function closePeer(peer, channel) {
  if (channel) channel.onopen = channel.onmessage = channel.onclose = null;
  if (!peer) return;
  peer.onicecandidate = peer.ondatachannel = null;
  try {
    peer.close();
  } catch {
    // closed already
  }
}

/**
 * The meeting point's socket, opened again after it closes under us. `attempt()` hears each try just before its socket is
 * made, `open()` and `text(data)` that socket's events, and `lost()` its close (or a socket that could not even be made);
 * lost() decides whether to retry(). A socket replaced or stopped is let go first, so none of its events come after.
 */
function meetingPoint({ url, timers, WebSocketImpl, attempt, open, text, lost }) {
  let ws = null;
  let timer = null;
  let tries = 0; // the waits since the other side last answered
  let stopped = false;

  function cancel() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  }
  function drop() {
    const socket = ws;
    ws = null;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close();
    } catch {
      // closed already
    }
  }
  function connect() {
    cancel();
    drop();
    attempt();
    if (stopped) return; // a listener closed the net
    let socket;
    try {
      socket = new WebSocketImpl(url);
    } catch {
      lost(); // no socket to be had (no WebSocket here, or a bad address): as one closed at once
      return;
    }
    ws = socket;
    socket.onopen = () => { if (ws === socket) open(); };
    socket.onmessage = event => { if (ws === socket) text(event?.data); };
    socket.onerror = () => {}; // the close that follows says it
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      lost();
    };
  }

  return {
    connect,
    /** The next try, after the wait its place in the row calls for. */
    retry() {
      if (stopped) return;
      cancel();
      const wait = RECONNECT_MS[Math.min(tries, RECONNECT_MS.length - 1)];
      tries += 1;
      timer = timers.setTimeout(() => {
        timer = null;
        connect();
      }, wait);
    },
    /** The other side answered: the next wait is the first again. */
    answered() { tries = 0; },
    /** A try at once, unless one is under way; the waits start again from the first. */
    now() {
      if (stopped) return;
      tries = 0;
      if (ws?.readyState === CONNECTING) return;
      connect();
    },
    send: msg => overSocket(ws, msg),
    get open() { return ws?.readyState === OPEN; },
    stop() {
      stopped = true;
      cancel();
      drop();
    },
  };
}

/**
 * The big screen's side: `url` is the meeting point's address with role host and the room's key (wsUrlFor). Every guest
 * the room lets in is told to onJoin(id), and gets a peer and a data channel unless `forceRelay` (?relay=1) or there is no
 * RTCPeerConnection; send(id, msg) and broadcast(msg) go on its channel or through the relay. Returns { onJoin, onLeave,
 * onMessage(fn(id, msg)), onPresence(fn(id, present)), onStatus, onWelcome(fn({ code, join })), send, broadcast,
 * transportOf(id) ('rtc', 'relay', or null while its channel is being set up or for a guest not there), status, close }.
 * The on… calls return their unsubscribe.
 */
export function createHostNet({
  url, timers = PAGE_TIMERS, WebSocketImpl = globalThis.WebSocket, PeerConnectionImpl = globalThis.RTCPeerConnection,
  iceServers = [], forceRelay = false,
} = {}) {
  const on = { join: listeners(), leave: listeners(), message: listeners(), presence: listeners(), status: listeners(), welcome: listeners() };
  const guests = new Map(); // id → { id, peer, channel, remote, transport, fallback, pinger, unanswered, present }
  let status = null;
  let closed = false;
  let refusal = null; // this socket's refusal: the close after it is not tried again

  function setStatus(next) {
    if (closed && next !== 'closed') return;
    status = next;
    on.status.emit(next);
  }

  const socket = meetingPoint({
    url, timers, WebSocketImpl,
    attempt: () => {
      refusal = null;
      setStatus('connecting');
    },
    open: () => {}, // the room is ours at its welcome
    text: data => hear(parseMessage(data)),
    lost,
  });

  const relayTo = (id, msg) => socket.send(message('relay', { to: id, body: msg }));

  function send(id, msg) {
    const guest = guests.get(id);
    if (!guest || closed) return false;
    if (guest.transport === 'rtc' && overChannel(guest.channel, msg)) return true;
    return relayTo(id, msg);
  }

  /** What the meeting point says. */
  function hear(msg) {
    if (!msg || closed) return;
    const body = objectOf(msg.body);
    switch (msg.type) {
      case 'welcome':
        socket.answered();
        on.welcome.emit({ code: body.code, join: Array.isArray(body.join) ? [...body.join] : [] });
        return setStatus('connected');
      case 'joined':
        if (isId(body.id)) joined(body.id);
        return;
      case 'left':
        if (isId(body.id)) left(body.id);
        return;
      case 'relay': {
        const guest = isId(body.from) ? guests.get(body.from) : undefined;
        if (guest && isMessage(body.body)) fromGuest(guest, body.body, 'relay');
        return;
      }
      case 'error':
        return refused(body.reason);
      default: // nothing else is the meeting point's to say
    }
  }

  function refused(reason) {
    const why = isId(reason) ? reason : 'error';
    refusal = why;
    setStatus(why);
    if (why === 'replaced') shut(); // another tab of this big screen has the room now
  }

  /** The socket closed under us: the guests are let go (the room tells them no-host) until the room is ours again. */
  function lost() {
    for (const id of [...guests.keys()]) left(id);
    if (refusal || closed) return; // taken, or not a host: another try would hear the same
    setStatus('offline');
    socket.retry();
  }

  /** A guest is in the room (again): a fresh peer and offer, and the pings from the first time on. */
  function joined(id) {
    const guest = guests.get(id) ?? newGuest(id);
    unpeer(guest);
    guest.unanswered = 0;
    if (forceRelay || !PeerConnectionImpl || !offerTo(guest)) guest.transport = 'relay';
    on.join.emit(id);
  }

  /** A guest's own state, one small object each; its pings run from its first joined until it leaves. */
  function newGuest(id) {
    const guest = { id, peer: null, channel: null, remote: null, transport: null, fallback: null, pinger: null, unanswered: 0, present: true };
    guests.set(id, guest);
    guest.pinger = timers.setInterval(() => ping(guest), PING_MS);
    return guest;
  }

  /** A peer and its channel for the guest, and the offer through the relay; false when no peer can be made. */
  function offerTo(guest) {
    let peer;
    let channel;
    try {
      peer = new PeerConnectionImpl({ iceServers });
      channel = peer.createDataChannel(CHANNEL_LABEL, { ordered: true });
    } catch {
      closePeer(peer);
      return false;
    }
    Object.assign(guest, { peer, channel, remote: remoteOf(peer), transport: null });
    peer.onicecandidate = event => {
      if (guest.peer === peer && event?.candidate) relayTo(guest.id, message('ice', { candidate: candidateOf(event.candidate) }));
    };
    channel.onopen = () => {
      if (guest.channel !== channel) return;
      stopFallback(guest);
      guest.transport = 'rtc';
    };
    channel.onclose = () => {
      if (guest.channel !== channel) return;
      stopFallback(guest);
      guest.channel = null;
      guest.transport = 'relay';
    };
    channel.onmessage = event => { if (guest.channel === channel) fromGuest(guest, parseMessage(event?.data), 'rtc'); };
    guest.fallback = timers.setTimeout(() => {
      guest.fallback = null;
      if (guest.transport !== 'rtc') guest.transport = 'relay';
    }, RTC_FALLBACK_MS);
    offer(guest, peer);
    return true;
  }

  async function offer(guest, peer) {
    try {
      const description = await peer.createOffer();
      if (guest.peer !== peer) return;
      await peer.setLocalDescription(description);
      if (guest.peer !== peer) return;
      relayTo(guest.id, message('offer', { sdp: description.sdp }));
    } catch {
      // a peer that would not offer (closed meanwhile): the fallback moves this guest to the relay
    }
  }

  function stopFallback(guest) {
    if (guest.fallback !== null) timers.clearTimeout(guest.fallback);
    guest.fallback = null;
  }

  function unpeer(guest) {
    stopFallback(guest);
    closePeer(guest.peer, guest.channel);
    Object.assign(guest, { peer: null, channel: null, remote: null, transport: null });
  }

  /** A message from a guest, `way` it came ('rtc' or 'relay'); the answer and the candidates only come by relay. */
  function fromGuest(guest, msg, way) {
    if (!msg || closed || guests.get(guest.id) !== guest) return;
    const body = objectOf(msg.body);
    switch (msg.type) {
      case 'answer':
        if (way === 'relay' && typeof body.sdp === 'string' && guest.remote) guest.remote.describe({ type: 'answer', sdp: body.sdp }).catch(() => {});
        return;
      case 'ice':
        if (way === 'relay' && body.candidate && typeof body.candidate === 'object' && guest.remote) guest.remote.candidate(body.candidate);
        return;
      case 'pong':
        return answered(guest);
      case 'offer': case 'ping': // the big screen makes the offers and the pings
        return;
      default:
        on.message.emit(guest.id, msg);
    }
  }

  function ping(guest) {
    if (closed || guests.get(guest.id) !== guest) return;
    guest.unanswered += 1;
    send(guest.id, message('ping', {}));
    if (guest.present && guest.unanswered >= MISSED_PINGS) {
      guest.present = false;
      on.presence.emit(guest.id, false);
    }
  }

  function answered(guest) {
    guest.unanswered = 0;
    if (guest.present) return;
    guest.present = true;
    on.presence.emit(guest.id, true);
  }

  function left(id) {
    const guest = guests.get(id);
    if (!guest) return;
    guests.delete(id);
    timers.clearInterval(guest.pinger);
    unpeer(guest);
    on.leave.emit(id);
  }

  function shut() {
    if (closed) return;
    closed = true;
    socket.stop();
    for (const guest of guests.values()) {
      timers.clearInterval(guest.pinger);
      unpeer(guest);
    }
    guests.clear();
    setStatus('closed');
  }

  socket.connect();

  return {
    onJoin: fn => on.join.add(fn),
    onLeave: fn => on.leave.add(fn),
    onMessage: fn => on.message.add(fn),
    onPresence: fn => on.presence.add(fn),
    onWelcome: fn => on.welcome.add(fn),
    onStatus(fn) {
      const off = on.status.add(fn);
      if (status !== null) fn(status);
      return off;
    },
    send,
    broadcast(msg) {
      for (const id of [...guests.keys()]) send(id, msg);
    },
    transportOf: id => guests.get(id)?.transport ?? null,
    get status() { return status; },
    close: shut,
  };
}

/**
 * A phone's side: `url` is the meeting point's address with role guest and the phone's id (wsUrlFor). It answers the big
 * screen's offer, sends on the data channel while it is open and through the relay otherwise, answers each ping on the way
 * it came, and opens its socket again when it closes under it. Returns { onMessage(fn(msg)), onStatus(fn(status)),
 * send(msg) → boolean, reconnect(), transport ('rtc', 'relay' or null), status, close() }; the on… calls return their
 * unsubscribe. Only the game's messages reach onMessage: never the signaling, the pings or the meeting point's own words.
 */
export function createGuestNet({
  url, timers = PAGE_TIMERS, WebSocketImpl = globalThis.WebSocket, PeerConnectionImpl = globalThis.RTCPeerConnection,
  iceServers = [],
} = {}) {
  const on = { message: listeners(), status: listeners() };
  let status = null;
  let closed = false;
  let refusal = null; // this socket's refusal; a no-host one is lifted when the big screen is heard again
  let heardHost = false; // the big screen has spoken to this net: its no-host from now on is host-gone
  let link = null; // { peer, channel, remote }: the big screen's peer and its data channel

  function setStatus(next) {
    if (closed && next !== 'closed') return;
    status = next;
    on.status.emit(next);
  }

  const socket = meetingPoint({
    url, timers, WebSocketImpl,
    attempt: () => {
      unpeer(); // a new socket is a new guest to the big screen: it makes a fresh offer
      refusal = null;
      setStatus('connecting');
    },
    open: () => setStatus('connected'),
    text: data => hear(parseMessage(data)),
    lost,
  });

  const relay = msg => socket.send(message('relay', { body: msg }));

  /** What the meeting point says: a refusal, or a relay from the big screen. */
  function hear(msg) {
    if (!msg || closed) return;
    const body = objectOf(msg.body);
    if (msg.type === 'error') return refused(body.reason);
    if (msg.type === 'relay' && isMessage(body.body)) fromHost(body.body, 'relay');
  }

  function refused(reason) {
    const why = isId(reason) ? reason : 'error';
    refusal = why;
    unpeer(); // the big screen's peer is gone with it, or this tab's seat is another's
    setStatus(why === 'no-host' && heardHost ? 'host-gone' : why);
  }

  function lost() {
    unpeer();
    if (closed || (refusal && !RETRY_AFTER.has(refusal))) return; // no-room, replaced: another try would hear the same
    if (!refusal) setStatus('offline');
    socket.retry();
  }

  /** The big screen is heard: the waits start again, and a wait for it is over. */
  function heard() {
    heardHost = true;
    socket.answered();
    if (refusal === 'no-host') refusal = null;
    if (status === 'no-host' || status === 'host-gone') setStatus('connected');
  }

  /** A message from the big screen, `way` it came ('rtc' or 'relay'); the offer and the candidates only come by relay. */
  function fromHost(msg, way) {
    heard();
    if (closed) return;
    const body = objectOf(msg.body);
    switch (msg.type) {
      case 'offer':
        if (way === 'relay' && typeof body.sdp === 'string') answer(body.sdp);
        return;
      case 'ice':
        if (way === 'relay' && body.candidate && typeof body.candidate === 'object' && link) link.remote.candidate(body.candidate);
        return;
      case 'ping':
        if (way === 'rtc') overChannel(link?.channel, message('pong', {}));
        else relay(message('pong', {}));
        return;
      case 'answer': case 'pong': // the phone answers; it is not answered
        return;
      default:
        on.message.emit(msg);
    }
  }

  /** The big screen's offer: a fresh peer in place of any before, its channel when it comes, and the answer by relay. */
  async function answer(sdp) {
    unpeer();
    if (!PeerConnectionImpl) return; // no WebRTC here: the big screen falls back to the relay after RTC_FALLBACK_MS
    let peer;
    try {
      peer = new PeerConnectionImpl({ iceServers });
    } catch {
      return;
    }
    const current = { peer, channel: null, remote: remoteOf(peer) };
    link = current;
    peer.onicecandidate = event => {
      if (link === current && event?.candidate) relay(message('ice', { candidate: candidateOf(event.candidate) }));
    };
    peer.ondatachannel = event => {
      const channel = event?.channel;
      if (link !== current || !channel) return;
      closePeer(null, current.channel);
      current.channel = channel;
      channel.onmessage = e => {
        if (link !== current || current.channel !== channel || closed) return;
        const msg = parseMessage(e?.data);
        if (msg) fromHost(msg, 'rtc');
      };
      channel.onclose = () => { if (current.channel === channel) current.channel = null; }; // the relay carries on
    };
    try {
      await current.remote.describe({ type: 'offer', sdp });
      if (link !== current) return;
      const description = await peer.createAnswer();
      if (link !== current) return;
      await peer.setLocalDescription(description);
      if (link !== current) return;
      relay(message('answer', { sdp: description.sdp }));
    } catch {
      // an offer this phone cannot take: the relay carries on, and the next offer starts afresh
    }
  }

  function unpeer() {
    if (!link) return;
    const { peer, channel } = link;
    link = null;
    closePeer(peer, channel);
  }

  socket.connect();

  return {
    onMessage: fn => on.message.add(fn),
    onStatus(fn) {
      const off = on.status.add(fn);
      if (status !== null) fn(status);
      return off;
    },
    send(msg) {
      if (closed) return false;
      return overChannel(link?.channel, msg) || relay(msg);
    },
    /** Opens the socket again now (an open one is let go first), and the waits start again from the first. */
    reconnect() {
      if (!closed) socket.now();
    },
    get transport() {
      if (link?.channel?.readyState === 'open') return 'rtc';
      return socket.open ? 'relay' : null;
    },
    get status() { return status; },
    close() {
      if (closed) return;
      closed = true;
      socket.stop();
      unpeer();
      setStatus('closed');
    },
  };
}
