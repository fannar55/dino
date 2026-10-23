// The meeting point's room (spec §6.1) as a pure module: one host, up to three guests, who comes and goes, the messages
// carried between them, and when the room is forgotten. It knows nothing of the game, the names or the seats (those are
// all the host's, spec §6.1), and nothing of sockets: a `conn` is whatever the caller finds a socket by again, the room
// never calls anything on it, and every call hands back what to send as deliveries, [{ conn, message }], for the caller
// to write. The clock comes in as `now`, so the same module runs in serve.mjs at home (tools/fjolspil-server.mjs), in the
// Durable Object in the cloud and in the tests.
//
// The rules (spec §6.1, §6.4): a host is known by its secret key and a guest by its id; either missing is 'bad-id'. The
// first host's key owns the room. A host with another key is told 'taken' (it picks a new code); one with the same key
// (the big screen reloaded) takes over, and the old connection is told 'replaced'. A guest with the id of a connected
// guest (the same phone back, or in a second tab) takes over in the same way. A fourth guest is 'full'. While the host is
// away a new guest is refused 'no-host' (the phone tries again), and the guests already there stay, told 'no-host', until
// the host is back and hears 'joined' for each of them. Only relay is carried. Every accepted connect, every disconnect
// and every message from someone in the room is a sign of life; the room expires ttlMs after the last one.
//
// A refused connect delivers nothing: the transport sends error { reason } and closes the socket.

import { MAX_GUESTS, ROOM_TTL_MS, message } from './protocol.js';

const isName = value => typeof value === 'string' && value !== '';

const refused = reason => ({ ok: false, reason, deliveries: [] });

/** A new room for `code`, with `join` as the phone page's addresses for the host's welcome. */
export function createRoom({ now, ttlMs, code, join } = {}) {
  return roomOf({ now, ttlMs, code, join });
}

/** The room a snapshot was taken of: its code, its host's key and its clock, with nobody connected. */
export function restoreRoom({ code, hostKey, lastSeen }, { now, ttlMs, join } = {}) {
  return roomOf({ now, ttlMs, code, join, hostKey, lastSeen });
}

function roomOf({ now = () => Date.now(), ttlMs = ROOM_TTL_MS, code, join = [], hostKey = null, lastSeen = now() }) {
  let host = null;
  const guests = new Map(); // guest id → conn, in the order they came

  const touch = () => { lastSeen = now(); };
  const guestIdOf = conn => [...guests].find(([, guest]) => guest === conn)?.[0];

  function connectHost(conn, key) {
    if (!isName(key)) return refused('bad-id');
    if (hostKey !== null && key !== hostKey) return refused('taken');
    const replaced = host;
    hostKey = key;
    host = conn;
    touch();
    const deliveries = replaced ? [{ conn: replaced, message: message('error', { reason: 'replaced' }) }] : [];
    deliveries.push({ conn, message: message('welcome', { code, join }) });
    for (const id of guests.keys()) deliveries.push({ conn, message: message('joined', { id }) });
    return { ok: true, replaced, deliveries };
  }

  function connectGuest(conn, id) {
    if (!isName(id)) return refused('bad-id');
    if (!host) return refused('no-host');
    const replaced = guests.get(id) ?? null;
    if (!replaced && guests.size >= MAX_GUESTS) return refused('full');
    guests.set(id, conn);
    touch();
    const deliveries = replaced ? [{ conn: replaced, message: message('error', { reason: 'replaced' }) }] : [];
    deliveries.push({ conn: host, message: message('joined', { id }) });
    return { ok: true, replaced, deliveries };
  }

  return {
    get host() { return host; },
    get hostKey() { return hostKey; },
    get expiresAt() { return lastSeen + ttlMs; },
    isExpired: () => now() >= lastSeen + ttlMs,
    touch,
    guests: () => [...guests].map(([id, conn]) => ({ id, conn })),
    snapshot: () => ({ code, hostKey, lastSeen }),

    /** Let a connection in as the host or a guest: { ok: true, replaced, deliveries } or { ok: false, reason, deliveries }. */
    connect(conn, { role, id, key } = {}) {
      if (role === 'host') return connectHost(conn, key);
      if (role === 'guest') return connectGuest(conn, id);
      return refused('bad-role');
    },

    /** A connection closed: { role, id (null for the host), deliveries }, or null when it was not in the room. */
    disconnect(conn) {
      if (conn === host) {
        host = null;
        touch();
        return { role: 'host', id: null, deliveries: [...guests.values()].map(guest => ({ conn: guest, message: message('error', { reason: 'no-host' }) })) };
      }
      const id = guestIdOf(conn);
      if (id === undefined) return null;
      guests.delete(id);
      touch();
      return { role: 'guest', id, deliveries: host ? [{ conn: host, message: message('left', { id }) }] : [] };
    },

    /** A message from a connection in the room: a relay goes on (a guest's to the host, the host's to its `to`), nothing else. */
    route(conn, parsed) {
      const id = conn === host ? null : guestIdOf(conn);
      if (id === undefined) return [];
      touch();
      const envelope = parsed?.type === 'relay' ? parsed.body : null;
      if (!envelope || typeof envelope !== 'object' || envelope.body === undefined) return [];
      if (id !== null) return host ? [{ conn: host, message: message('relay', { from: id, body: envelope.body }) }] : [];
      const guest = guests.get(envelope.to);
      return guest ? [{ conn: guest, message: message('relay', { body: envelope.body }) }] : [];
    },
  };
}

/**
 * The rooms of one meeting point, by code. A host's connect opens a room; a guest to a code with no room is refused
 * 'no-room'. `sweep()` forgets every expired room and hands back its connections, the host's first, for the caller to close.
 */
export function createRooms({ now, ttlMs, join } = {}) {
  const rooms = new Map(); // code → room
  const codes = new Map(); // conn → the code of its room

  return {
    get: code => rooms.get(code),

    connect(code, conn, who = {}) {
      const room = rooms.get(code) ?? (who.role === 'guest' ? null : createRoom({ now, ttlMs, code, join }));
      if (!room) return refused('no-room');
      const result = room.connect(conn, who);
      if (!result.ok) return result;
      rooms.set(code, room);
      codes.set(conn, code);
      if (result.replaced) codes.delete(result.replaced);
      return result;
    },

    disconnect(conn) {
      const code = codes.get(conn);
      if (code === undefined) return null;
      codes.delete(conn);
      return rooms.get(code).disconnect(conn);
    },

    route(conn, parsed) {
      const code = codes.get(conn);
      return code === undefined ? [] : rooms.get(code).route(conn, parsed);
    },

    sweep() {
      const closing = [];
      for (const [code, room] of rooms) {
        if (!room.isExpired()) continue;
        rooms.delete(code);
        for (const conn of [...(room.host ? [room.host] : []), ...room.guests().map(guest => guest.conn)]) {
          codes.delete(conn);
          closing.push(conn);
        }
      }
      return closing;
    },
  };
}
