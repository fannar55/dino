// The meeting point at home (spec §9.1): a WebSocket at /fjolspil/ws/<code> on serve.mjs's server, written by hand to
// RFC 6455 so the dev server stays without packages: the handshake, the client's masked text frames and their fragments,
// ping and pong, the closing handshake, and nothing longer than MAX_MESSAGE_BYTES. It carries engine/fjolspil/room.js and
// decides nothing itself, since the same room runs in the Durable Object in the cloud (spec §9.2): each socket is one
// `conn` of the rooms, connected once, right after the handshake; what the rooms hand back as deliveries goes on the wire
// as JSON text frames; and a socket is closed with the code its case calls for: 1000 for a refused connect and for a
// connection another one took over, 1001 when its room expires, 1003 for a binary frame, 1009 for a message too long and
// 1002 for anything else RFC 6455 forbids.

import crypto from 'node:crypto';
import os from 'node:os';
import { MAX_MESSAGE_BYTES, message, normalizeCode, parseMessage } from '../engine/fjolspil/protocol.js';
import { createRooms } from '../engine/fjolspil/room.js';

const ACCEPT_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'; // RFC 6455 §1.3: hashed with the client's key, it proves the upgrade
const OP = { continuation: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 };
const PATH = /^\/fjolspil\/ws\/([^/]*)$/;
const CLOSE_WAIT_MS = 5000; // a closing socket quiet this long is let go without the client's half of the handshake

const urlOf = url => { try { return new URL(url, 'http://localhost'); } catch { return null; } };

/** Who a socket's url, /fjolspil/ws/<code>?role=…&id=…&key=…, says is asking; null for another path or a code that is not one. */
export function parseWsUrl(url) {
  const parsed = urlOf(url);
  const code = normalizeCode(PATH.exec(parsed?.pathname ?? '')?.[1]);
  if (!code) return null;
  const param = name => parsed.searchParams.get(name) ?? undefined;
  return { code, role: param('role'), id: param('id'), key: param('key') };
}

/** The phone page on each of this machine's LAN addresses (the IPv4s that are not internal, in interface order), for the QR code. */
export function lanJoinUrls(port, { interfaces = os.networkInterfaces } = {}) {
  return Object.values(interfaces()).flatMap(nets => nets ?? [])
    .filter(net => net.family === 'IPv4' && !net.internal)
    .map(net => `http://${net.address}:${port}/remake/spil.html`);
}

/** A frame as the server sends it: whole (FIN), unmasked, its length in 7, 16 or 64 bits (RFC 6455 §5.2). */
function frameOf(opcode, payload) {
  const length = payload.length;
  const head = Buffer.alloc(length < 126 ? 2 : length < 65536 ? 4 : 10);
  head[0] = 0x80 | opcode;
  if (length < 126) head[1] = length;
  else if (length < 65536) { head[1] = 126; head.writeUInt16BE(length, 2); }
  else { head[1] = 127; head.writeBigUInt64BE(BigInt(length), 2); }
  return Buffer.concat([head, payload]);
}

/** A text frame of `text`: how every message goes to a phone or the big screen. */
export function frame(text) {
  return frameOf(OP.text, Buffer.from(text, 'utf8'));
}

/**
 * The frames in one client's bytes, however TCP cut them: a frame may come over several chunks and a chunk may hold several
 * frames. A whole text message (its fragments put together) goes to onText, a control frame to onControl, and the first
 * frame that will not be taken ends the reading with onRefuse(code), as a close frame ends it. Returns what to feed each chunk to.
 */
function frameReader({ onText, onControl, onRefuse }) {
  let pending = Buffer.alloc(0); // the bytes of a frame not yet whole
  let pieces = null; // the payloads of a fragmented text message so far, until its last frame
  let size = 0;
  let done = false;
  const refuse = code => { done = true; onRefuse(code); };
  return chunk => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (!done && pending.length >= 2) {
      const fin = (pending[0] & 0x80) !== 0, opcode = pending[0] & 0x0f, control = opcode >= OP.close;
      let length = pending[1] & 0x7f, start = 2;
      if (length === 126) { if (pending.length < 4) return; length = pending.readUInt16BE(2); start = 4; }
      else if (length === 127) { if (pending.length < 10) return; length = Number(pending.readBigUInt64BE(2)); start = 10; }
      const unmasked = (pending[1] & 0x80) === 0, reserved = (pending[0] & 0x70) !== 0;
      if (reserved || unmasked || (control ? !fin || length > 125 || opcode > OP.pong : opcode > OP.binary)) return refuse(1002);
      if (opcode === OP.binary) return refuse(1003);
      // A continuation needs a message begun, and a new message must wait for the end of the one before.
      if (!control && (opcode === OP.continuation) !== (pieces !== null)) return refuse(1002);
      if (!control && (pieces ? size : 0) + length > MAX_MESSAGE_BYTES) return refuse(1009);
      const end = start + 4 + length;
      if (pending.length < end) return;
      const payload = Buffer.from(pending.subarray(start + 4, end));
      for (let i = 0; i < payload.length; i++) payload[i] ^= pending[start + (i & 3)];
      pending = pending.subarray(end);
      if (control) {
        done = opcode === OP.close;
        onControl(opcode, payload);
        continue;
      }
      if (opcode === OP.text) { pieces = []; size = 0; }
      pieces.push(payload);
      size += length;
      if (!fin) continue;
      const text = Buffer.concat(pieces).toString('utf8');
      pieces = null;
      onText(text);
    }
  };
}

/** An upgrade the meeting point will not take: the status line, and the socket goes. */
function refuseUpgrade(socket, status) {
  socket.once('finish', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/**
 * Puts the rooms on `server`'s upgrades: /fjolspil/ws/<code> becomes a WebSocket, any other path is answered 404 and a code
 * that is not one 400. `join()` gives the phone page's addresses for the hosts' welcome, once, as they do not change while
 * the server runs. Every `sweepMs` the expired rooms' sockets are closed. close() lets everything go.
 */
export function attachFjolspil(server, { now, join = () => [], rooms = createRooms({ now, join: join() }), sweepMs = 60000 } = {}) {
  const sockets = new Set();
  const deliver = deliveries => { for (const { conn, message } of deliveries) conn.send(JSON.stringify(message)); };

  function onUpgrade(req, socket, head) {
    socket.on('error', () => {}); // a phone gone from the Wi-Fi resets its socket; 'close' follows and does the rest
    if (!PATH.test(urlOf(req.url)?.pathname ?? '')) return refuseUpgrade(socket, '404 Not Found');
    const who = parseWsUrl(req.url);
    const key = req.headers['sec-websocket-key'];
    if (!who || !key || req.headers.upgrade?.toLowerCase() !== 'websocket') return refuseUpgrade(socket, '400 Bad Request');

    const accept = crypto.createHash('sha1').update(key + ACCEPT_GUID).digest('base64');
    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);

    let closing = false;
    const conn = {
      send(text) { if (!closing && socket.writable) socket.write(frame(text)); },
      /** The server's half of the closing handshake (no code: an empty close, as the client's was); the room forgets it now. */
      close(code) {
        if (closing) return;
        closing = true;
        const body = Buffer.alloc(code === undefined ? 0 : 2);
        if (code !== undefined) body.writeUInt16BE(code);
        if (socket.writable) socket.end(frameOf(OP.close, body));
        socket.setTimeout(CLOSE_WAIT_MS, () => socket.destroy());
        leave();
      },
    };
    const leave = () => { const gone = rooms.disconnect(conn); if (gone) deliver(gone.deliveries); };
    const read = frameReader({
      onText: text => { const parsed = parseMessage(text); if (parsed) deliver(rooms.route(conn, parsed)); },
      onControl: (opcode, payload) => {
        if (opcode === OP.ping) socket.write(frameOf(OP.pong, payload));
        else if (opcode === OP.close) conn.close(payload.length >= 2 ? payload.readUInt16BE(0) : undefined);
      },
      onRefuse: code => conn.close(code),
    });
    socket.on('data', chunk => { if (!closing) read(chunk); });
    socket.on('end', () => socket.end()); // the client is done sending: so is the server, and the socket closes
    socket.on('close', () => { sockets.delete(socket); leave(); });

    const { code, ...identity } = who;
    const result = rooms.connect(code, conn, identity);
    if (!result.ok) {
      conn.send(JSON.stringify(message('error', { reason: result.reason })));
      conn.close(1000);
      return;
    }
    deliver(result.deliveries);
    result.replaced?.close(1000);
    if (head.length) read(head);
  }

  server.on('upgrade', onUpgrade);
  const sweep = setInterval(() => { for (const conn of rooms.sweep()) conn.close(1001); }, sweepMs);
  sweep.unref();
  return {
    rooms,
    close() {
      clearInterval(sweep);
      server.off('upgrade', onUpgrade);
      for (const socket of sockets) socket.destroy();
    },
  };
}
