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
// present again. A guest that joins (again, even without a left first: another tab of the phone took over) is there, and her
// pings count from none: onJoin says so, with no onPresence(id, true) beside it. The big screen also says alive on its own
// socket every ALIVE_MS (protocol.js), as the meeting point hears nothing else of a room whose every guest is on a data
// channel, and forgets a room ROOM_TTL_MS after the last thing it heard. A socket that closes under either side is
// opened again after 1, 2, 4 and 8 seconds and then every 15, never giving up; an answer from the other side (the welcome,
// or anything from the big screen) starts the waits again from one second, and so does reconnect(): a phone's opens a new
// socket at once, and the big screen's one that is not open (the guest page and the host session call it when their page
// comes into view or the network is back; the big screen never had a wake of its own before the owner's phone test,
// 2026-10-24, so a sleeping PC waited out the 15 seconds).
//
// A phone that is connected and hears nothing at all from the big screen (no ping, no view, on either way) for
// HOST_SILENCE_MS has a link that died without a word: in the cloud a phone sat on "Bíðum eftir stóra skjánum…" with its
// socket looking open until a refresh (the owner's phone test, 2026-10-24). Since the big screen pings every PING_MS, the
// phone then lets its peer and its socket go and opens a fresh one at once (connecting, then connected); the room's joined
// brings the big screen's seat and newest view back to it. While the big screen is away (no-host, host-gone) the room keeps
// a phone's socket open and says nothing, so a socket that dies then would be found by nothing: the same watch runs there
// too, with HOST_AWAY_SILENCE_MS, restarted by any word from the meeting point; the fresh socket hears no-host (and the
// waits go on) or, when the old one was the dead side, the big screen's seat and view. No other status is watched. The big
// screen's reconnect(awayMs) on a wake also replaces an open socket that has heard nothing for HOST_AWAY_SILENCE_MS (only
// what comes in counts: its alive is never answered), but only when the page was away at least as long, and never on a
// timer: a room whose guests are all on data channels is rightly silent on the socket, and a window over the game for a
// moment (which fires visibilitychange too) must not let every guest go. The network coming back gives no time (awayMs
// is Infinity): then the silence alone decides.
//
// The statuses, onStatus(fn) (which tells fn the status there is now, then every one after) and `status`:
//   both    connecting   a socket is being opened: the first, every try after a wait, and reconnect()
//           offline      the socket closed under us; the next try is on its way
//           closed       close() was called (or, on the big screen, another tab took the room)
//   host    connected    the room is ours (welcome)
//           taken        the code is another host's: pick another (the session does, with a new net)
//           replaced     another tab with this key took the room: closed follows
//   guest   connected    the socket is open, or the big screen is heard again after no-host or host-gone
//           no-room      no room has this code (never opened, or forgotten): not tried again. A phone that was in the room
//                        (it heard the big screen) tries again for NO_ROOM_GRACE_MS first, saying offline, since its big
//                        screen opens the room again after the meeting point restarted or forgot it under a game
//           full         the room has MAX_GUESTS phones in it (more than the seats, so a phone with no seat never keeps out
//                        a seated one coming back): tried again, as one may go
//           no-host      the room's big screen is not there, and has not been since this net began: waiting
//           host-gone    the big screen this net heard has gone (the socket stays, or is tried again): waiting
//           replaced     this guest's id connected from another tab, which has the seat now: not tried again
// A refusal's reason the server may add later is a status of its own, and is not tried again.
//
// A listener that throws never stops the net (its socket loop, its pings, the other listeners): the error goes to `report`,
// which by default throws it again in a microtask, so the console still shows it.
//
// Plain JavaScript for the browser that loads in Node for the tests: the timers, the WebSocket and the RTCPeerConnection
// (and a phone's clock, `now`) come in as options, defaulting to the page's own, read when a net is made (no
// RTCPeerConnection: the relay carries all).

import { ALIVE_MS, MISSED_PINGS, PING_MS, RTC_FALLBACK_MS, message, parseMessage } from './protocol.js';

/** The data channel's label: one for each guest, reliable and in order (spec §6.2). */
export const CHANNEL_LABEL = 'fjolspil';

/** The waits before each try after a socket closed under us; the last one repeats (spec §6.4: 1, 2, 4 … 15 seconds). */
export const RECONNECT_MS = Object.freeze([1000, 2000, 4000, 8000, 15000]);

/** How long a phone that was in the room hears no-room as a wait, from the first one, before it is the end of the game. */
export const NO_ROOM_GRACE_MS = 60000;

/** How long a connected phone hears nothing from the big screen (which pings every PING_MS) before its link is dead. */
export const HOST_SILENCE_MS = 20000;

/**
 * How long a phone waiting for a big screen that went (its socket open) hears nothing at all from the meeting point before
 * its socket is taken for dead; and how long a big screen's open socket may have heard nothing when its page wakes.
 */
export const HOST_AWAY_SILENCE_MS = 30000;

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

/** A listener's error, thrown again where nothing of the net is on the stack: the page's console shows it as uncaught. */
const PAGE_REPORT = error => queueMicrotask(() => { throw error; });

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

/**
 * A set of listeners: add(fn) returns the unsubscribe; emit(...) calls each one there is now, and tell(fn, ...) one alone.
 * A listener that throws goes to report(error), and the next one is called all the same.
 */
function listeners(report) {
  const fns = new Set();
  const tell = (fn, ...args) => {
    try {
      fn(...args);
    } catch (error) {
      report(error);
    }
  };
  return {
    add(fn) {
      fns.add(fn);
      return () => { fns.delete(fn); };
    },
    emit(...args) {
      for (const fn of [...fns]) tell(fn, ...args);
    },
    tell,
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
 * transportOf(id) ('rtc', 'relay', or null while its channel is being set up or for a guest not there), reconnect(),
 * status, close }. The on… calls return their unsubscribe; `report` gets what a listener throws; `now` is the clock its
 * socket's silence is counted on.
 */
export function createHostNet({
  url, timers = PAGE_TIMERS, WebSocketImpl = globalThis.WebSocket, PeerConnectionImpl = globalThis.RTCPeerConnection,
  iceServers = [], forceRelay = false, report = PAGE_REPORT, now = () => Date.now(),
} = {}) {
  const on = {
    join: listeners(report), leave: listeners(report), message: listeners(report), presence: listeners(report),
    status: listeners(report), welcome: listeners(report),
  };
  const guests = new Map(); // id → { id, peer, channel, remote, transport, fallback, pinger, unanswered, present }
  let status = null;
  let closed = false;
  let refusal = null; // this socket's refusal: the close after it is not tried again
  let heardAt = null; // when this socket last heard the meeting point (its opening, then anything that came on it)

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
    open: () => { heardAt = now(); }, // the room is ours at its welcome
    text: data => {
      heardAt = now();
      hear(parseMessage(data));
    },
    lost,
  });

  const relayTo = (id, msg) => socket.send(message('relay', { to: id, body: msg }));

  // A sign of life for the meeting point, on the socket whenever it is open (one that is not has no one to tell).
  const alive = timers.setInterval(() => { if (!closed) socket.send(message('alive', null)); }, ALIVE_MS);

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

  /**
   * A guest is in the room (again): a fresh peer and offer, and the pings from the first time on. She is there now (onJoin
   * says it, so no onPresence too), and the next MISSED_PINGS pings without a pong make her absent again.
   */
  function joined(id) {
    const guest = guests.get(id) ?? newGuest(id);
    unpeer(guest);
    guest.unanswered = 0;
    guest.present = true;
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
    timers.clearInterval(alive);
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
      if (status !== null) on.status.tell(fn, status);
      return off;
    },
    send,
    broadcast(msg) {
      for (const id of [...guests.keys()]) send(id, msg);
    },
    transportOf: id => guests.get(id)?.transport ?? null,
    /**
     * The page woke after `awayMs` hidden (Infinity, the default, when the network is back): a socket that is not open is
     * tried at once, the waits from the first. An open one is left be, since a new socket lets every guest go and offers
     * each a new peer, unless the page was away for HOST_AWAY_SILENCE_MS and the socket has heard nothing as long: then it
     * may have died without a word, and a fresh one takes its place, its guests let go as when a socket closes under us
     * (the room's joined brings each back).
     */
    reconnect(awayMs = Infinity) {
      if (closed) return;
      if (socket.open) {
        if (awayMs < HOST_AWAY_SILENCE_MS) return; // a moment away (a window over the game): a quiet socket is a healthy one
        if (heardAt !== null && now() - heardAt < HOST_AWAY_SILENCE_MS) return;
        for (const id of [...guests.keys()]) left(id);
      }
      socket.now();
    },
    get status() { return status; },
    close: shut,
  };
}

/**
 * A phone's side: `url` is the meeting point's address with role guest and the phone's id (wsUrlFor). It answers the big
 * screen's offer, sends on the data channel while it is open and through the relay otherwise, answers each ping on the way
 * it came, and opens its socket again when it closes under it, or when the big screen has said nothing for
 * `hostSilenceMs` while connected. Returns { onMessage(fn(msg)), onStatus(fn(status)), send(msg) → boolean, reconnect(),
 * transport ('rtc', 'relay' or null), heardAt (when the big screen was last heard, on `now`; null before), status,
 * close() }; the on… calls return their unsubscribe, and `report` gets what a listener throws. Only the game's messages
 * reach onMessage: never the signaling, the pings or the meeting point's own words. `noRoomGraceMs` is how long a phone
 * that was in the room tries again after no-room, on the clock `now`.
 */
export function createGuestNet({
  url, timers = PAGE_TIMERS, WebSocketImpl = globalThis.WebSocket, PeerConnectionImpl = globalThis.RTCPeerConnection,
  iceServers = [], report = PAGE_REPORT, now = () => Date.now(), noRoomGraceMs = NO_ROOM_GRACE_MS,
  hostSilenceMs = HOST_SILENCE_MS, hostAwaySilenceMs = HOST_AWAY_SILENCE_MS,
} = {}) {
  const on = { message: listeners(report), status: listeners(report) };
  let status = null;
  let closed = false;
  let refusal = null; // this socket's refusal; a no-host one is lifted when the big screen is heard again
  let heardHost = false; // the big screen has spoken to this net: its no-host from now on is host-gone, its no-room a wait
  let heardAt = null; // when it last did (now())
  let noRoomSince = null; // when the first no-room came since the big screen was last heard (null: none since)
  let link = null; // { peer, channel, remote }: the big screen's peer and its data channel
  let silence = null; // the watch's timer: a silence as long as the status allows is a dead link

  function setStatus(next) {
    if (closed && next !== 'closed') return;
    status = next;
    watch();
    on.status.emit(next);
  }

  /**
   * How long nothing may come in this status before the socket is taken for dead: hostSilenceMs from the big screen while
   * connected, hostAwaySilenceMs from the meeting point while the big screen is away and the socket stays open; null when
   * the status is not watched (a socket being made or tried again, a refusal for good, close).
   */
  function silenceFor(state) {
    if (state === 'connected') return hostSilenceMs;
    if ((state === 'host-gone' || state === 'no-host') && socket.open) return hostAwaySilenceMs;
    return null;
  }

  /** The watch, from now, for the status there is: a fresh socket at once when nothing comes for as long as it allows. */
  function watch() {
    unwatch();
    const limit = silenceFor(status);
    if (limit === null) return;
    silence = timers.setTimeout(() => {
      silence = null;
      if (closed || silenceFor(status) === null) return;
      unpeer();
      socket.now(); // the silent socket let go, a new one made: connecting, then connected (or the room's no-host)
    }, limit);
  }
  function unwatch() {
    if (silence !== null) timers.clearTimeout(silence);
    silence = null;
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
    watch(); // anything on the socket is a sign of life
    const body = objectOf(msg.body);
    if (msg.type === 'error') return refused(body.reason);
    if (msg.type === 'relay' && isMessage(body.body)) fromHost(body.body, 'relay');
  }

  function refused(reason) {
    const why = isId(reason) ? reason : 'error';
    unpeer(); // the big screen's peer is gone with it, or this tab's seat is another's
    if (why === 'no-room' && heardHost && !noRoomOver()) return; // the room may come back: the close after it is a drop
    refusal = why;
    setStatus(why === 'no-host' && heardHost ? 'host-gone' : why);
  }

  /** A no-room heard by a phone that was in the room: whether NO_ROOM_GRACE_MS have passed since the first of them. */
  function noRoomOver() {
    const time = now();
    noRoomSince ??= time;
    return time - noRoomSince >= noRoomGraceMs;
  }

  function lost() {
    unpeer();
    unwatch(); // no socket to watch until the next is made
    if (closed || (refusal && !RETRY_AFTER.has(refusal))) return; // no-room, replaced: another try would hear the same
    if (!refusal) setStatus('offline');
    socket.retry();
  }

  /** The big screen is heard: the waits start again, and a wait for it is over. */
  function heard() {
    heardHost = true;
    heardAt = now();
    noRoomSince = null;
    socket.answered();
    if (refusal === 'no-host') refusal = null;
    if (status === 'no-host' || status === 'host-gone') setStatus('connected');
    else if (status === 'connected') watch(); // the link is alive: the watch starts again
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
      if (status !== null) on.status.tell(fn, status);
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
    get heardAt() { return heardAt; },
    get status() { return status; },
    close() {
      if (closed) return;
      closed = true;
      unwatch();
      socket.stop();
      unpeer();
      setStatus('closed');
    },
  };
}
