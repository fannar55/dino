// The words of "Fjölspil", the minigames played from phones around the big screen (the owner's design of 23–24 October
// 2026): the numbers every side agrees on, the room codes and the host's secret key (spec §6.1), and the one envelope every
// message travels in, { v: 1, type, seq?, body } (spec §6.3). The big screen, the phone page, serve.mjs at home and the
// Durable Object in the cloud all import it, so it is plain JavaScript that imports nothing.
//
// What the meeting point (serve.mjs, the Durable Object; engine/fjolspil/room.js decides) sends, each as message(type, body):
//   welcome { code, join }      to the host when it connects: the room's code, and the phone page's addresses for the QR
//                               code (the LAN addresses at home, none in the cloud, spec §6.1)
//   error { reason }            a refused connect ('bad-role', 'bad-id', 'taken', 'full', 'no-host', 'no-room'); to every
//                               guest when the host goes ('no-host'); to a connection another one with the same identity
//                               took over ('replaced')
//   joined { id }               to the host: a guest is connected (again, after a reconnect or on the host's own return)
//   left { id }                 to the host: a guest's connection closed
//   relay { to?, from?, body }  a message carried through the meeting point while no data channel is open (spec §6.2): a
//                               guest sends { body } and the host gets { from, body }; the host sends { to, body } and that
//                               guest gets { body }
// and what the big screen sends it besides relay:
//   alive null                  every ALIVE_MS while its socket is open: a sign of life, carried nowhere. Over WebRTC the
//                               socket is otherwise quiet for as long as the game goes on, and a room is forgotten
//                               ROOM_TTL_MS after its last sign of life (spec §6.1)

/** The letters of a room code: no I, O or Q, no digits, nothing Icelandic, so any keyboard can type it (spec §6.1). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ';
export const CODE_LENGTH = 4;

/**
 * Four seats in all, the child's at the big screen first, so up to three guests play (spec §4): the seats (seats.js, the
 * host's) refuse a fourth guest 'full'. The room lets in up to eight phones beside the host, more than the seats, so a
 * phone with no seat that keeps trying never takes the place of a seated guest whose phone slept (spec §10: a full table
 * tries again when a seat frees); a ninth is refused 'full'.
 */
export const MAX_GUESTS = 8;
export const MAX_SEATS = 4;

/** The longest name a guest types (spec §4: 1–12 letters). */
export const NAME_MAX = 12;

/** A room is forgotten two hours after its last sign of life, a message or a connection (spec §6.1). */
export const ROOM_TTL_MS = 7200000;

/** The big screen's alive on its socket, once a minute: far inside ROOM_TTL_MS, so a room in play is never forgotten. */
export const ALIVE_MS = 60000;

/** The host pings every guest every 5 seconds; three pings without a pong make the seat absent (spec §6.4). */
export const PING_MS = 5000;
export const MISSED_PINGS = 3;

/** A data channel not open 4 seconds after the offer: the messages go through the meeting point instead (spec §6.2). */
export const RTC_FALLBACK_MS = 4000;

/** "Halda áfram án Önnu" shows 20 seconds into the wait for an absent guest's turn (spec §4, step 6). */
export const COVER_AFTER_MS = 20000;

/** The longest message anyone reads: a turn-based game's messages are small, so a longer one is not ours (spec §9.1). */
export const MAX_MESSAGE_BYTES = 65536;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** A new room code, four letters of the alphabet. */
export function makeCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/** A code as someone typed or scanned it, trimmed and in capitals; null unless it is four letters of the alphabet. */
export function normalizeCode(text) {
  if (typeof text !== 'string') return null;
  const code = text.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** A secret of 128 random bits as 32 hex characters: the host's key, a guest's id (spec §6.1). */
export function randomKey(crypto = globalThis.crypto) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** A message in the envelope every side speaks; `extra` carries what sits beside the body, such as a view's `seq`. */
export function message(type, body, extra = {}) {
  return { v: 1, type, ...extra, body };
}

/**
 * A message from the wire, or null when it is not one: not JSON, not v: 1, no type. A text longer than MAX_MESSAGE_BYTES
 * (counted in characters here; a frame's bytes are the transport's to count) is not even parsed.
 */
export function parseMessage(text) {
  if (typeof text !== 'string' || text.length > MAX_MESSAGE_BYTES) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return parsed?.v === 1 && typeof parsed.type === 'string' && parsed.type !== '' ? parsed : null;
}
