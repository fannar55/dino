// Söngur Slóeðlu's band in Fjölspil, the big screen's side (docs/superpowers/specs/2026-10-31-sloedla-fjolspil-design.md).
// The menu half: "Spilum saman" opens the room's lobby for the song (the dinosaurs Egill has not taken, "Krakki eða
// fullorðinn?" on each phone, the note "Egill velur lag…" or the picked song's name and picture), keeps it up to date while
// Egill changes his dinosaur, the lanes or the song, tells the page when the seats change and when a new guest has joined, and
// at "Spila einn" thanks every phone for playing. The room is Fjölspil's (fjolspil.js), opened by the page with
// storageKey BAND_STORAGE_KEY and the stage's QR card (band-lobby.js) as its lobby.

import { lobbyOf } from './lineup.js';
import { SONGS_V2 } from './v2/songs/index.js';

/** Where the song game's room is kept over a reload: its own, beside the book's. */
export const BAND_STORAGE_KEY = 'mosi-fjolspil-sloedla';

/** The view every seated phone gets at "Spila einn". */
export const BLESS = Object.freeze({ screen: 'sloedla', phase: 'bless' });

const LEVEL_IDS = ['barn', 'fullordinn'];

/** What the phones see under the dinosaurs: the picked song's name and card, or "Egill velur lag…" while there is none. */
function noteOf(songId) {
  const song = songId ? SONGS_V2.find(entry => entry.id === songId) : null;
  return song ? { text: song.name, picture: `assets/sloedla/valmynd/${song.card}` } : { text: 'Egill velur lag…' };
}

/**
 * The band host over `fjolspil` (createFjolspil's session) and `lobby` (the band lobby that session was made with).
 * `onSeats(list)` hears every change of the seats, `onJoin(seat)` each new guest once. `perf` and `timers` are the round's.
 * Returns { open, update, start, close }.
 */
export function createBandHost({ fjolspil, lobby, perf = () => performance.now(), timers = globalThis, onSeats = () => {}, onJoin = () => {} }) {
  const told = new Set(); // the guests already welcomed, by guestId

  lobby.onRefresh(() => {
    const list = fjolspil.seats.list();
    for (const seat of list) {
      if (seat.kind !== 'remote' || told.has(seat.guestId)) continue;
      told.add(seat.guestId);
      onJoin(seat);
    }
    onSeats(list);
  });

  // "Krakki eða fullorðinn?" answered on a phone: her seat's level, and the lobby shown again.
  fjolspil.onAct((n, body) => {
    if (body?.type !== 'level' || !LEVEL_IDS.includes(body.level)) return;
    fjolspil.seats.setLevel(n, body.level);
    fjolspil.setLobby({});
  });

  return {
    /**
     * "Spilum saman": the lobby for the song, Egill's dinosaur (`mine`) never on offer. Resolves with the seats at "Spila!"
     * and null at "Spila einn". (`level` is Egill's; the lineup reads it at "Spila!".)
     */
    async open({ lanes, mine, level }) {
      const result = await fjolspil.openLobby({ ...lobbyOf({ lanes, mine }), ask: 'level', note: noteOf(null) });
      return result ? result.seats : null;
    },
    /** Egill changed his dinosaur, the lanes or the song: the phones see what is on offer now, and the song when there is one. */
    update({ lanes, mine, level, song = null }) {
      fjolspil.setLobby({ ...lobbyOf({ lanes, mine }), note: noteOf(song) });
    },
    /** "Spila!": the room closes to new guests for the song. */
    start() {
      lobby.start();
    },
    /** "Spila einn": the lobby (or the game) ends and every seated phone is thanked. */
    close() {
      if (lobby.isOpen) lobby.close();
      else fjolspil.closeGame();
      fjolspil.broadcast(BLESS);
    },
  };
}
