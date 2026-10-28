// The meeting point in the cloud (spec §9.2): one Durable Object per room code, SQLite-backed (the free plan has them),
// running the same engine/fjolspil/room.js as the home server (remake/tools/fjolspil-server.mjs) over the WebSocket
// Hibernation API. It decides nothing itself and knows nothing of the game: each server-side WebSocket is one `conn` of the
// room, connected once, at its upgrade; what the room hands back as deliveries goes out as JSON text; and a socket is closed
// with the code its case calls for, as at home: 1000 for a refused connect (after error { reason }) and for a connection
// another one took over (after error { reason: 'replaced' }), 1001 for every socket when the room expires (no error: the
// phone's retry hears no-room). welcome.join is [] here, as the page in the cloud uses its own address (spec §6.1).
//
// Hibernation: the object may be evicted from memory between events while its sockets stay open. What the room needs comes
// back from two places: ctx.storage keeps the room's snapshot ({ code, hostKey, lastSeen }, put after every connect and
// disconnect), and each socket's attachment keeps who it is ({ role: 'host', key } or { role: 'guest', id }; null for a socket
// the room has let go). On the first event after a wake the room is restored and every socket connected again from its
// attachment, the host first, without sending what that produces: the welcome and the joined were sent when the sockets
// first came. An alarm ROOM_TTL_MS after the last sign of life (a connect, a disconnect, a message from someone in the room)
// forgets the room.

import { ROOM_TTL_MS, message, normalizeCode, parseMessage } from '../../remake/engine/fjolspil/protocol.js';
import { createRoom, restoreRoom } from '../../remake/engine/fjolspil/room.js';

/** The rooms' WebSocket path, /fjolspil/ws/<code>, as at home. */
export const ROOM_PATH = /^\/fjolspil\/ws\/([^/]*)$/;

/** The runtime throws on a socket closed already; one such socket must not stop the others' messages or closes. */
function send(ws, text) {
  try {
    ws.send(text);
  } catch {
    // closed under us: its close event follows
  }
}
function close(ws, code) {
  try {
    ws.close(code);
  } catch {
    // closed already
  }
}
const deliver = deliveries => { for (const { conn, message: msg } of deliveries) send(conn, JSON.stringify(msg)); };

/** Who a socket is, as its attachment keeps it for a wake: what room.connect needs again, and nothing more. */
const identityOf = ({ role, id, key }) => (role === 'host' ? { role, key } : { role, id });
function attachmentOf(ws) {
  try {
    return ws.deserializeAttachment() ?? null;
  } catch {
    return null;
  }
}
/** A socket the room has let go (replaced, or leaving) is not connected again at a wake. */
function forget(ws) {
  try {
    ws.serializeAttachment(null);
  } catch {
    // closed already: the runtime lets it go
  }
}

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null; // the room, once loaded; null while there is none
    this.loaded = false; // storage has been read since this object woke
  }

  /**
   * The room, read from storage and rebuilt on the first event after a wake. `also` is the event's own socket, which the
   * runtime may no longer list among its sockets while its close is handled.
   */
  async load(also = null) {
    if (this.loaded) return this.room;
    const stored = await this.ctx.storage.get('room');
    if (!this.loaded) {
      this.room = stored ? this.rebuild(stored, also) : null;
      this.loaded = true;
    }
    return this.room;
  }

  /** The room a snapshot was taken of, with every socket that has an attachment connected again; the deliveries are dropped. */
  rebuild(stored, also) {
    const room = restoreRoom(stored, { join: [] });
    const sockets = [...this.ctx.getWebSockets()];
    if (also && !sockets.includes(also)) sockets.push(also);
    const members = sockets.map(ws => ({ ws, who: attachmentOf(ws) })).filter(({ who }) => who !== null);
    const hosts = members.filter(({ who }) => who.role === 'host');
    const guests = members.filter(({ who }) => who.role === 'guest');
    // Guests stay in the room while its host is away (room.js), but only a host lets a guest in: with the host away, a
    // stand-in with its key opens the door for them and goes, as the host went.
    const standIn = hosts.length === 0 && guests.length > 0 ? {} : null;
    if (standIn) room.connect(standIn, { role: 'host', key: room.hostKey });
    for (const { ws, who } of [...hosts, ...guests]) room.connect(ws, who);
    if (standIn) room.disconnect(standIn);
    return room;
  }

  /** A sign of life: the room is forgotten ROOM_TTL_MS after the last one. */
  async touch() {
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  /** After a connect or a disconnect: the room's snapshot kept for a wake, and the alarm moved on. */
  async save() {
    await this.ctx.storage.put('room', this.room.snapshot());
    await this.touch();
  }

  /** /fjolspil/ws/<code>?role=…&id=…&key=…, an upgrade: a socket into the room, or one told why not and closed 1000. */
  async fetch(request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const url = new URL(request.url);
    const code = normalizeCode(ROOM_PATH.exec(url.pathname)?.[1]);
    if (!code) return new Response(null, { status: 400 });
    const param = name => url.searchParams.get(name) ?? undefined;
    const who = { role: param('role'), id: param('id'), key: param('key') };

    // As the home server's rooms: a host's connect opens a room, a guest to a code with no room is refused 'no-room'.
    const current = await this.load();
    const room = current ?? (who.role === 'guest' ? null : createRoom({ code, join: [] }));
    const { 0: client, 1: server } = new WebSocketPair();
    const result = room ? room.connect(server, who) : { ok: false, reason: 'no-room' };
    if (!result.ok) {
      // A refused socket is accepted outside hibernation: it never comes back at a wake, and its close goes out at once
      // (a hibernatable one closed at its upgrade lingered 10 s under wrangler dev, and a phone retries only on the close).
      server.accept();
      send(server, JSON.stringify(message('error', { reason: result.reason })));
      close(server, 1000);
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(identityOf(who));
    this.room = room;
    if (result.replaced) forget(result.replaced);
    deliver(result.deliveries);
    if (result.replaced) close(result.replaced, 1000);
    await this.save();
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * A text from a socket: a relay goes where the room says, and any message from someone in the room (the host's alive
   * too) moves the alarm on; anything else (binary, not JSON, too long) is nothing.
   */
  async webSocketMessage(ws, text) {
    if (typeof text !== 'string') return;
    const room = await this.load(ws);
    const parsed = parseMessage(text);
    if (!parsed || !room) return;
    const inRoom = ws === room.host || room.guests().some(guest => guest.conn === ws);
    deliver(room.route(ws, parsed));
    if (inRoom) await this.touch();
  }

  /** The client closed: the room told, and its half of the closing handshake answered. */
  async webSocketClose(ws) {
    await this.leave(ws);
    close(ws, 1000);
  }

  async webSocketError(ws) {
    await this.leave(ws);
  }

  async leave(ws) {
    const room = await this.load(ws);
    forget(ws);
    const gone = room?.disconnect(ws);
    if (!gone) return;
    deliver(gone.deliveries);
    await this.save();
  }

  /** Two hours without a sign of life: every socket let go and closed 1001, and the room forgotten. */
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) {
      forget(ws); // a closed socket still listed at a wake is no one: a dead phone does not come back as a guest
      close(ws, 1001);
    }
    await this.ctx.storage.deleteAll();
    this.room = null;
    this.loaded = true;
  }
}
