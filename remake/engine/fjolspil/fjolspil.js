// The host session of "Fjölspil" on the big screen: the one object the minigames talk to (spec §7.1). It holds the room (the
// meeting point's four letters and the host's secret key, kept in sessionStorage so a reload finds the same room, spec §6.4),
// the seats (seats.js), the lobby and the waiting card (lobby.js) and the network (net.js), and turns what the phones say into
// seats and acts, and what a game shows into views. The room and the seats are the page's, not one game's (spec §4.8): they
// open with the first lobby and live as long as the page, so a group that finished Háls og hali goes on to Eitt! in the same
// seats, a second lobby opens on the seats that are there, and new guests may still come.
//
// What a phone says (spec §6.3, §6.4), and what the big screen does:
//   joined     its socket is in the room, the first time or again after a reconnect: a guest with a seat is there again and
//              gets the lobby (with `you`, her seat) or the newest view of the game, never the join screen; a guest without
//              one gets the lobby, to choose a name and an avatar from
//   hello      { name, avatar }: seats.join gives her a seat, or the one she had, answered with seat { ok: true, seat, name }
//              or { ok: false, reason }; then the lobby to everyone, or, with no lobby open, the newest view or `closed`
//   act        a game's act, for onAct: heard only from a guest who is there and plays her own seat (not covered)
//   presence   whether the phone answers the pings (net.js); `left` is absent too
// A guest is always found by her id, never by a seat number, which a removal changes (removeAi, dropAbsent at "Byrjum!").
//
// A game's views go through send(seat, body): message('view', body, { seq }), the seq rising for each guest across every view
// she is sent, the lobby's included (a phone never shows one older than the last, spec §6.3). It starts at the page's clock
// (`now`, milliseconds), so a big screen reloaded in the same room sends views newer than the old page's, even to a phone
// that never heard it go. The last game view each guest was sent is kept, so a phone that comes back gets it again. What a
// phone sees of the seats never holds another guest's id, which is her secret (spec §6.1). Nothing here knows a game's
// rules: the games decide what each seat sees and when.
//
// A game whose turn comes to a guest who is not there waits for her with waitFor(seat), one seat at a time, over the board
// (the lobby's waiting card, spec §4 step 6): 'back' when she is there again, 'cover' when "Halda áfram án …" makes her seat
// the computer's, and 'closed' when the game is closed (closeGame) or another tab takes the room, so the game stops its turns.
//
// The big screen wakes as a phone does: when its page comes back into view or the network is back, a socket of the room's
// that is not open is tried at once (net.js's reconnect), not after the rest of a wait of up to 15 seconds, while the phones
// show "Bíðum eftir stóra skjánum…" (the final review's M2, after the owner's phone test, 2026-10-24).

import { makeCode, message, normalizeCode, randomKey } from './protocol.js';
import { createSeats } from './seats.js';
import { createLobby } from './lobby.js';
import { createHostNet, iceServersFor, wsUrlFor } from './net.js';

/** Where this tab keeps its room, { code, key }, for a reload (sessionStorage: one room per tab, spec §6.5). */
export const STORAGE_KEY = 'mosi-fjolspil-host';

const PHONE_PAGE = '/remake/spil.html';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const KEY_PATTERN = /^[0-9a-f]{32}$/;
const CLOSED = Object.freeze({ screen: 'closed' }); // "Bíðum eftir næsta leik" on the phone

/** The page's sessionStorage; null where the browser will not give it (site data blocked). */
function sessionStorageOf(win) {
  try {
    return win?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** ?relay=1: every message through the meeting point, no WebRTC (for trying the fallback). */
const relayAsked = win => new URLSearchParams(win?.location?.search ?? '').get('relay') === '1';

/** The room this tab had before a reload, { code, key }; null when there was none, or what is kept is not one. */
function readRoom(storage) {
  try {
    const kept = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (kept && normalizeCode(kept.code) === kept.code && KEY_PATTERN.test(kept.key)) return { code: kept.code, key: kept.key };
  } catch {
    // nothing readable is kept
  }
  return null;
}

function keepRoom(storage, room) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(room));
  } catch {
    // no storage: a reload opens a new room
  }
}

/** A seat as the phones see it: everything but the guest's id. */
const shown = ({ guestId, ...seat }) => seat;

/** A promise and the function that settles it. */
function deferred() {
  let resolve;
  const promise = new Promise(settle => { resolve = settle; });
  return { promise, resolve };
}

/**
 * The host session in `doc` (#fjolspil holds the lobby). `net` and `lobby` make the network and the lobby (net.js's
 * createHostNet and lobby.js's createLobby; the tests pass their own), `audio` is the lobby's { sfx(name) }, `timers` the
 * waiting card's and the network's, and `now` the clock a guest's views count from. Returns { openLobby, resume, seats,
 * active, code, joinUrl, send, broadcast, onAct, waitFor, closeGame, lobbyView }.
 */
export function createFjolspil(doc, {
  win = globalThis.window, random = Math.random, storage = sessionStorageOf(win), audio = null, timers, now = () => Date.now(),
  net: createNet = createHostNet, lobby: makeLobby = createLobby, forceRelay = relayAsked(win),
} = {}) {
  let seats = createSeats();
  const acts = new Set();
  const at = {
    net: null, // the host net of the room while it is open
    code: null, key: null,
    welcomeJoin: null, // the phone page's LAN addresses from the welcome; null until one came
    joinUrl: null, lanMissing: false, // what the QR code carries, and whether the lobby says --lan is missing
    replaced: false, // another tab took this room: this one shows nothing more
    lobbyOpen: false, lobbyAi: null, // the game's character the lobby offers, or null
    pendingStart: null, // the open lobby's { promise, resolve }
    waiting: null, // the wait for a guest: { seat, guestId, promise, resolve }
    inRoom: new Set(), // the guests the meeting point says are in the room, seated or still choosing
    lastView: new Map(), // guestId -> the last game view she was sent
    seq: new Map(), // guestId -> the seq of the last view she was sent (the first is the page's clock then)
  };

  // The lobby reads the seats through this, so after resume it shows the kept game's.
  const lobby = makeLobby(doc, {
    seats: { list: () => seats.list(), bySeat: n => seats.bySeat(n) },
    win, audio, timers,
    onAddAi: () => {
      if (at.lobbyAi) seats.addAi({ name: at.lobbyAi.name, avatar: at.lobbyAi.avatar });
      lobbyChanged();
    },
    onRemoveAi: () => {
      seats.removeAi(); // the seats after it move up: every phone is told its seat again
      lobbyChanged();
    },
    onStart: () => {
      seats.dropAbsent();
      endLobby({ seats: seats.list() });
      for (const id of at.inRoom) if (!seats.byGuest(id)) deliver(id, lobbyView(id)); // dropped, socket open: no seat now
    },
    onClose: () => {
      endLobby(null);
      closeGame(); // the phones wait for the next lobby
    },
    onContinue: seat => {
      if (at.waiting?.seat !== seat) return;
      seats.cover(seat);
      endWait('cover');
    },
  });

  // The page wakes, or the network is back: the room's socket, if it is not open, is tried now. Not once another tab took
  // the room (its net is closed): taking it back would only take it from that one. visibilitychange comes up to the window.
  const wake = () => { if (!at.replaced) at.net?.reconnect?.(); };
  win?.addEventListener?.('visibilitychange', () => { if (doc.visibilityState !== 'hidden') wake(); });
  win?.addEventListener?.('online', wake);

  // ---- The room ---------------------------------------------------------------------------------------------------

  /** The address the QR code carries: the page's own, unless the page is on loopback, where phones cannot reach it. */
  function placeJoin() {
    const own = `${win.location.origin}${PHONE_PAGE}`;
    const lan = LOOPBACK.has(win.location.hostname) ? at.welcomeJoin : null;
    at.joinUrl = lan?.[0] ?? own; // before the welcome, or with no LAN: this PC can still join in another tab
    at.lanMissing = lan !== null && lan.length === 0;
  }

  /** Opens the room on first use: the one this tab had, or a new code and key. */
  function openRoom() {
    if (at.net) return;
    const kept = readRoom(storage);
    at.code = kept?.code ?? makeCode(random);
    at.key = kept?.key ?? randomKey();
    keepRoom(storage, { code: at.code, key: at.key });
    connect();
  }

  function connect() {
    at.inRoom.clear();
    at.welcomeJoin = null;
    placeJoin();
    const net = createNet({
      url: wsUrlFor(win.location, at.code, { role: 'host', key: at.key }), timers,
      iceServers: iceServersFor(win.location), forceRelay,
    });
    at.net = net;
    const own = fn => (...args) => { if (at.net === net) fn(...args); }; // a net let go of says nothing more
    net.onJoin(own(joined));
    net.onLeave(own(left));
    net.onPresence(own(presence));
    net.onMessage(own(heard));
    net.onWelcome(own(({ join }) => {
      at.welcomeJoin = join;
      placeJoin();
      if (at.lobbyOpen) showLobby();
    }));
    net.onStatus(own(status));
  }

  function status(next) {
    if (next === 'taken') { // the code is another host's: a new one, with the same key
      const old = at.net;
      at.net = null;
      old.close();
      at.code = makeCode(random);
      keepRoom(storage, { code: at.code, key: at.key });
      connect();
      if (at.lobbyOpen) showLobby();
    } else if (next === 'replaced') { // another tab has the room now; taking it back would only take it from that one
      at.replaced = true;
      if (at.lobbyOpen) {
        lobby.hide();
        endLobby(null);
      }
      if (at.waiting) endWait('closed');
    }
  }

  // ---- What the phones say ----------------------------------------------------------------------------------------

  function joined(id) {
    at.inRoom.add(id);
    const seat = seats.byGuest(id);
    if (!seat) {
      deliver(id, lobbyView(id)); // the join screen, with the avatars that are free
      return;
    }
    // Her seat as this screen has it, as the answer to a hello is: a fresh page with her remembered id (a new tab, a reload)
    // has said no hello, and so learns it is seated, with her name tag and her hello after every reconnect
    at.net.send(id, message('seat', { ok: true, seat: seat.seat, name: seat.name }));
    presence(id, true); // a guest with a seat, back: the lobby (presence sends it), or her game
    if (!at.lobbyOpen) resend(id);
  }

  function left(id) {
    at.inRoom.delete(id);
    presence(id, false);
  }

  /**
   * A guest's phone is there or not: her seat says so, an open lobby shows it, and a wait for her ends. A phone with no seat
   * that answers again (dropped at "Byrjum!" while away) is shown the lobby, so it offers her the join screen.
   */
  function presence(id, present) {
    const seat = seats.byGuest(id);
    if (!seat) {
      if (present && at.inRoom.has(id)) deliver(id, lobbyView(id));
      return;
    }
    seats.presence(seat.seat, present);
    if (present) checkWaiting();
    if (at.lobbyOpen) lobbyChanged();
  }

  function heard(id, msg) {
    const body = msg.body !== null && typeof msg.body === 'object' ? msg.body : {};
    if (msg.type === 'hello') hello(id, body);
    else if (msg.type === 'act') act(id, msg.body);
  }

  function hello(id, { name, avatar }) {
    const answer = seats.join({ guestId: id, name, avatar });
    at.net.send(id, message('seat', answer));
    if (!answer.ok) return;
    checkWaiting();
    if (at.lobbyOpen) lobbyChanged();
    else resend(id); // between games, or a phone back in the middle of one
  }

  function act(id, body) {
    const seat = seats.byGuest(id);
    if (seat?.kind !== 'remote' || !seat.present) return; // a covered seat is the computer's, an absent one is not heard
    for (const fn of [...acts]) fn(seat.seat, body);
  }

  // ---- Views ------------------------------------------------------------------------------------------------------

  /** One view to a guest, with her next seq: the page's clock for her first. */
  function deliver(id, body) {
    const seq = at.seq.has(id) ? at.seq.get(id) + 1 : now();
    at.seq.set(id, seq);
    return at.net?.send(id, message('view', body, { seq })) ?? false;
  }

  /** A game's view, kept as her newest. */
  function toGuest(id, body) {
    at.lastView.set(id, body);
    return deliver(id, body);
  }

  const resend = id => deliver(id, at.lastView.get(id) ?? CLOSED);

  function send(n, body) {
    const id = seats.bySeat(n)?.guestId;
    return id ? toGuest(id, body) : false; // Egill and the game's character have no phone
  }

  function broadcast(body) {
    for (const seat of seats.list()) if (seat.guestId) toGuest(seat.guestId, body);
  }

  /** The game is over or closed: the phones wait for the next lobby, and a wait for a guest ends with 'closed'. */
  function closeGame() {
    broadcast(CLOSED);
    at.lastView.clear();
    if (at.waiting) endWait('closed');
  }

  /** The lobby as the guest with this id sees it: the seats, the avatars free, and `you`, her seat (null: none yet). */
  function lobbyView(id = null) {
    const own = id === null ? null : seats.byGuest(id);
    return { screen: 'lobby', seats: seats.list().map(shown), available: seats.available(), you: own ? own.seat : null };
  }

  // ---- The lobby --------------------------------------------------------------------------------------------------

  function showLobby() {
    lobby.show({ joinUrl: at.joinUrl, code: at.code, ai: at.lobbyAi, lanMissing: at.lanMissing });
  }

  /** The seats changed while the lobby is open: every phone in the room and the big screen see them. */
  function lobbyChanged() {
    for (const seat of seats.list()) if (seat.covered && seat.present) seats.uncover(seat.seat); // the game that covered it is over
    for (const id of at.inRoom) deliver(id, lobbyView(id));
    lobby.refresh();
  }

  function endLobby(result) {
    const pending = at.pendingStart;
    at.pendingStart = null;
    at.lobbyOpen = false;
    pending?.resolve(result);
  }

  /**
   * The lobby for a game (`game`, 'hals' or 'eitt'; `ai`, its character { name, avatar, add, remove }, or null): the seats
   * that are there, the room opened on first use. Resolves with { seats } at "Byrjum!", the guests not there dropped, and
   * null at the X. A lobby already open gives its own promise.
   */
  function openLobby({ ai = null } = {}) {
    if (at.replaced) return Promise.resolve(null);
    if (at.pendingStart) return at.pendingStart.promise;
    openRoom();
    at.lastView.clear(); // the game before is over
    const own = seats.list().find(seat => seat.kind === 'ai' && !seat.covered);
    if (own && own.avatar !== ai?.avatar) seats.removeAi(); // another game's character leaves the table
    seats.reserve(ai ? [ai.avatar] : []);
    const held = ai !== null && seats.list().some(seat => seat.guestId && seat.avatar === ai.avatar); // a guest keeps hers
    at.lobbyAi = held ? null : ai;
    at.pendingStart = deferred();
    at.lobbyOpen = true;
    showLobby();
    lobbyChanged();
    return at.pendingStart.promise;
  }

  // ---- Waiting for a guest ----------------------------------------------------------------------------------------

  /**
   * Waits for the guest of seat `n`, whose turn it is and who is not there, over the game: 'back' when she is there again
   * (her seat uncovered), 'cover' when "Halda áfram án …" is pressed (her seat the computer's), 'closed' when the game is
   * closed or another tab takes the room. One wait at a time: a second call for the same seat gives the same promise, and a
   * call for another seat while one is on is a game's mistake, rejected with an Error (nobody is covered by it).
   */
  function waitFor(n) {
    if (at.waiting?.seat === n) return at.waiting.promise;
    if (at.waiting) return Promise.reject(new Error(`a wait is pending for seat ${at.waiting.seat}`));
    const seat = seats.bySeat(n);
    if (!seat?.guestId || seat.present) {
      if (seat?.present) seats.uncover(n);
      return Promise.resolve('back');
    }
    at.waiting = { seat: n, guestId: seat.guestId, ...deferred() };
    lobby.waitFor({ seat: n, joinUrl: at.joinUrl, code: at.code });
    return at.waiting.promise;
  }

  function checkWaiting() {
    const seat = at.waiting && seats.byGuest(at.waiting.guestId);
    if (!seat?.present) return;
    seats.uncover(seat.seat);
    endWait('back');
  }

  function endWait(result) {
    const wait = at.waiting;
    at.waiting = null;
    lobby.hideWaiting();
    wait.resolve(result);
  }

  // ---- A kept game ------------------------------------------------------------------------------------------------

  /** A kept game's seats (seats.snapshot()) back, and the room open, without the lobby; a guest is absent until she is back. */
  async function resume(snapshot) {
    if (at.replaced) return;
    const here = new Set([...at.inRoom].filter(id => seats.byGuest(id)?.present !== false)); // in the room now, and answering
    seats = createSeats({ from: snapshot });
    for (const seat of seats.list()) if (here.has(seat.guestId)) seats.presence(seat.seat, true);
    openRoom();
    if (at.lobbyOpen) lobbyChanged();
  }

  return {
    openLobby,
    resume,
    get seats() { return seats; },
    get active() { return at.net !== null && !at.replaced; },
    get code() { return at.code; },
    get joinUrl() { return at.joinUrl; },
    send,
    broadcast,
    onAct(fn) {
      acts.add(fn);
      return () => { acts.delete(fn); };
    },
    waitFor,
    closeGame,
    lobbyView,
  };
}
