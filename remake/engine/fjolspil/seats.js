// The seats at the table (spec §5): who plays a minigame of "Fjölspil" together, Egill at the big screen in seat 0, up to
// three guests from their phones and at most one computer player, with the names and the avatars the screens show. The
// seats are the host's alone (the meeting point never sees a name, spec §6.1, §6.5) and outlive one game: a group that
// finished Háls og hali goes on to Eitt! in the same seats (spec §4 step 8). Pure: no DOM, no timers, no randomness, so the
// lobby, the host session, the games and the tests all hold the same object.
//
// A seat is { seat, name, avatar, kind, guestId, present, covered }. `seat` is its place in the list, which the games take
// in order as their players; only a removal renumbers (the lobby's dropAbsent at "Byrjum!", removeAi). `kind` is 'host'
// (Egill, always present), 'remote' (a guest, known by the id its phone keeps) or 'ai': the game's own character, or a
// guest's seat the computer plays while the guest is away ("Halda áfram án Önnu", spec §4 step 6, §7.1), which is
// `covered` and keeps its guest, name and avatar until uncover gives it back. A guest that goes keeps its seat, absent.
//
// The six friends are the avatars a guest picks from; no two seats share one, and the game's own character is reserved
// (not on offer, spec §4 step 4). Names are text, never markup: the screens put them in with textContent.

import { MAX_SEATS, NAME_MAX } from './protocol.js';

const avatar = (id, name, colour, picture) => Object.freeze({ id, name, colour, picture });

/** The six friends, in the order the phone offers them, with Háls og hali's colours; the pictures are paths under remake/. */
export const AVATARS = Object.freeze([
  avatar('kambedla', 'Kambeðla', '#ab85c1', 'assets/book/images/kambedla-render.webp'),
  avatar('sloedla', 'Slóeðla', '#6793d0', 'assets/eitt/parasaurolophus.webp'),
  avatar('gramedla', 'Grameðla', '#d69a6e', 'assets/eitt/trex.webp'),
  avatar('thorsedla', 'Þórseðla', '#e9b14d', 'assets/eitt/brontosaurus.webp'),
  avatar('flugedla', 'Flugeðla', '#8ec5d6', 'assets/eitt/pteranodon.webp'),
  avatar('uggedla', 'Uggeðla', '#d47a8a', 'assets/eitt/spinosaurus.webp'),
]);

/** Egill's, at the big screen: Mosi's picture, and not one a guest can pick. */
export const HOST_AVATAR = avatar('egill', 'Egill', '#79c7a1', 'assets/eitt/mosi.webp');

/** The avatar with this id, Egill's included; undefined for any other. */
export const avatarOf = id => (id === HOST_AVATAR.id ? HOST_AVATAR : AVATARS.find(a => a.id === id));

const isGuestAvatar = id => AVATARS.some(a => a.id === id);

/**
 * A typed name as a seat keeps it: trimmed, every run of whitespace one space, at most NAME_MAX letters (counted by code
 * point, so twelve Icelandic letters stay whole); null when nothing is left or it is not text.
 */
export function cleanName(text) {
  if (typeof text !== 'string') return null;
  const name = [...text.trim().replace(/\s+/g, ' ')].slice(0, NAME_MAX).join('').trimEnd();
  return name === '' ? null : name;
}

const hostSeat = () => ({ seat: 0, name: HOST_AVATAR.name, avatar: HOST_AVATAR.id, kind: 'host', guestId: null, present: true, covered: false });

/** A guest's seat, played by the guest or covered by the computer. */
const isGuestSeat = seat => seat.kind === 'remote' || seat.covered;

/** The game's own computer player (not a covered guest). */
const isOwnAi = seat => seat.kind === 'ai' && !seat.covered;

const refused = reason => ({ ok: false, reason });

/**
 * The seats, Egill alone in seat 0; `reserved` are the avatar ids not on offer. With `from` (a snapshot, for a kept game)
 * they are the snapshot's, every guest absent until its phone says hello again.
 */
export function createSeats({ max = MAX_SEATS, reserved = [], from = null } = {}) {
  const limit = from ? (from.max ?? MAX_SEATS) : max;
  let held = [...(from ? (from.reserved ?? []) : reserved)];
  let seats = [hostSeat()];
  for (const kept of from?.seats ?? []) {
    if (kept.kind === 'host') continue;
    const { name, avatar, kind, guestId = null, covered = false } = kept;
    seats.push({ seat: seats.length, name, avatar, kind, guestId, present: !isGuestSeat(kept), covered });
  }
  const listeners = new Set();

  const changed = () => { for (const fn of [...listeners]) fn(); };
  const copy = seat => (seat ? { ...seat } : null);
  const guestSeat = guestId => (guestId == null ? undefined : seats.find(seat => seat.guestId === guestId));
  const isTaken = id => seats.some(seat => seat.avatar === id);

  /** Sets these fields on a seat, and tells the listeners when any of them was different. */
  function update(seat, fields) {
    if (Object.keys(fields).every(key => seat[key] === fields[key])) return;
    Object.assign(seat, fields);
    changed();
  }

  /** Takes out the seats `which` picks and closes the gaps; the numbers they had, in order. */
  function remove(which) {
    const gone = seats.filter(which).map(seat => seat.seat);
    if (gone.length === 0) return gone;
    seats = seats.filter(seat => !which(seat));
    seats.forEach((seat, index) => { seat.seat = index; });
    changed();
    return gone;
  }

  return {
    get count() { return seats.length; },
    list: () => seats.map(copy),
    bySeat: n => copy(seats[n]),
    byGuest: guestId => copy(guestSeat(guestId)),

    /**
     * A guest's hello: a seat for a new guest, or its own again with the name and avatar it sends now, present.
     * { ok: true, seat, name } with the name as the screens show it, or { ok: false, reason }.
     */
    join({ guestId, name, avatar } = {}) {
      const cleaned = cleanName(name);
      if (cleaned === null) return refused('bad-name');
      if (!isGuestAvatar(avatar)) return refused('bad-avatar');
      const own = guestSeat(guestId);
      if (!own && seats.length >= limit) return refused('full');
      if (avatar !== own?.avatar) { // the avatar a guest already has is never refused it, so a reconnect always seats it
        if (held.includes(avatar)) return refused('avatar-reserved');
        if (isTaken(avatar)) return refused('avatar-taken');
      }
      const others = seats.filter(seat => seat !== own).map(seat => seat.name);
      let unique = cleaned;
      for (let n = 2; others.includes(unique); n++) unique = `${cleaned} ${n}`;
      if (own) {
        update(own, { name: unique, avatar, present: true });
        return { ok: true, seat: own.seat, name: unique };
      }
      seats.push({ seat: seats.length, name: unique, avatar, kind: 'remote', guestId, present: true, covered: false });
      changed();
      return { ok: true, seat: seats.length - 1, name: unique };
    },

    /** The game's character as a computer player, in the next free seat: { ok: true, seat } or { ok: false, reason }. */
    addAi({ name, avatar } = {}) {
      if (seats.some(isOwnAi)) return refused('ai-already');
      if (seats.length >= limit) return refused('full');
      seats.push({ seat: seats.length, name, avatar, kind: 'ai', guestId: null, present: true, covered: false });
      changed();
      return { ok: true, seat: seats.length - 1 };
    },

    /** Takes the computer player out (a covered guest stays); the seats after it move up one. */
    removeAi() {
      remove(isOwnAi);
    },

    /** Whether a guest's phone is there (Egill and the computer always are). */
    presence(n, present) {
      const seat = seats[n];
      if (seat && isGuestSeat(seat)) update(seat, { present: Boolean(present) });
    },

    /** The computer plays a guest's seat until uncover (spec §4 step 6). */
    cover(n) {
      const seat = seats[n];
      if (seat?.kind === 'remote') update(seat, { kind: 'ai', covered: true });
    },

    /** The guest plays its seat again. */
    uncover(n) {
      const seat = seats[n];
      if (seat?.covered) update(seat, { kind: 'remote', covered: false });
    },

    /** The lobby at "Byrjum!" (spec §4): drops the guests that are not there and renumbers; the numbers they had. */
    dropAbsent: () => remove(seat => isGuestSeat(seat) && !seat.present),

    /** The avatar ids not on offer from now on (the game's own character), in place of the ones before. */
    reserve(ids) {
      const next = [...ids];
      if (next.length === held.length && next.every((id, index) => id === held[index])) return;
      held = next;
      changed();
    },

    /** The avatar ids a guest may pick now, in AVATARS order: neither taken nor reserved. */
    available: () => AVATARS.map(a => a.id).filter(id => !held.includes(id) && !isTaken(id)),

    /** Everything a kept game needs to seat the same people again (createSeats({ from })). */
    snapshot: () => ({ max: limit, reserved: [...held], seats: seats.map(copy) }),

    /** Calls fn() after every call that changed the seats; returns the unsubscribe. */
    onChange(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
