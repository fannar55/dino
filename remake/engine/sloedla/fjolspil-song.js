// Söngur Slóeðlu's band in Fjölspil, the big screen's side (docs/superpowers/specs/2026-10-31-sloedla-fjolspil-design.md).
// The menu half: "Spilum saman" opens the room's lobby for the song (the dinosaurs Egill has not taken, "Krakki eða
// fullorðinn?" on each phone, the note "Egill velur lag…" or the picked song's name and picture), keeps it up to date while
// Egill changes his dinosaur, the lanes or the song, tells the page when the seats change and when a new guest has joined, and
// at "Spila einn" thanks every phone for playing. The room is Fjölspil's (fjolspil.js), opened by the page with
// storageKey BAND_STORAGE_KEY and the stage's QR card (band-lobby.js) as its lobby.
//
// The round half (spec §5 and §8): at "Spila!" every phone gets „Tilbúin!“ (and measures its clock while the song loads); as the
// round starts each guest who plays gets the song's start, then a clock anchor every two seconds, each section's notes as the
// song decides them (with their places in the chart as ids) and the big screen's word on every note. Her taps come stamped
// with the big screen's clock and are judged on her lane at that moment, with REMOTE_GRACE. A guest unheard for SILENT_MS (no
// time, no tap) or no longer answering gives her dinosaur to Egill at his level for the rest of the song; heard again, she is
// told she is in next time. At the end each guest gets the band's stars and her own line.

import { lobbyOf, takeOver } from './lineup.js';
import { CLOCK_EVERY_MS, SILENT_MS, hostSongTime } from './clock-sync.js';
import { SONGS_V2 } from './v2/songs/index.js';

/** Where the song game's room is kept over a reload: its own, beside the book's. */
export const BAND_STORAGE_KEY = 'mosi-fjolspil-sloedla';

/** The view every seated phone gets at "Spila einn". */
export const BLESS = Object.freeze({ screen: 'sloedla', phase: 'bless' });

const LEVEL_IDS = ['barn', 'fullordinn'];
const WATCH_MS = 500; // how often the round looks for a silent guest

/** What the phones see under the dinosaurs: the picked song's name and card, or "Egill velur lag…" while there is none. */
function noteOf(songId) {
  const song = songId ? SONGS_V2.find(entry => entry.id === songId) : null;
  return song ? { text: song.name, picture: `assets/sloedla/valmynd/${song.card}` } : { text: 'Egill velur lag…' };
}

/** A song as a phone's „Tilbúin!“ and „Þú kemst inn í næsta lagi!“ show it: its name and its card. */
function songOf(songId) {
  const { text, picture } = noteOf(songId);
  return picture ? { name: text, picture } : { name: null };
}

/**
 * The band host over `fjolspil` (createFjolspil's session) and `lobby` (the band lobby that session was made with).
 * `onSeats(list)` hears every change of the seats, `onJoin(seat)` each new guest once. `perf` and `timers` are the round's.
 * Returns { open, update, start, close } for the menu and { ready, beginRound, decided, judged, endRound, lineup } for the round.
 */
export function createBandHost({ fjolspil, lobby, perf = () => performance.now(), timers = globalThis, onSeats = () => {}, onJoin = () => {} }) {
  const told = new Set(); // the guests already welcomed, by guestId
  // the round: { song, lineup, clock, level, game, heard: seat -> perf, late: seats told „næsta lagi“, ticks } or null
  let round = null;
  let waiting = []; // sections decided before the round began (the player decides the first as it starts)
  let nextId = 0; // the chart's length so far: each note's id is its place in it

  lobby.onRefresh(() => {
    const list = fjolspil.seats.list();
    for (const seat of list) {
      if (seat.kind !== 'remote' || told.has(seat.guestId)) continue;
      told.add(seat.guestId);
      onJoin(seat);
    }
    if (round) watch(); // a phone that stopped answering gives its dinosaur up at once
    onSeats(list);
  });

  fjolspil.onAct((n, body) => {
    if (body?.type === 'tap') return tapOf(n, body.at);
    if (body?.type === 'ready') return backWithout(n);
    // "Krakki eða fullorðinn?" answered on a phone: her seat's level, and the lobby shown again.
    if (body?.type !== 'level' || !LEVEL_IDS.includes(body.level)) return;
    fjolspil.seats.setLevel(n, body.level);
    fjolspil.setLobby({});
  });

  // a time asked or a tap: she is there. One whose dinosaur Egill took (or who was not in the song) is in the next one.
  fjolspil.onAlive(seat => {
    if (!round || !seat) return;
    round.heard.set(seat.seat, perf());
    if (laneOf(seat.seat) >= 0 || round.late.has(seat.seat)) return;
    round.late.add(seat.seat);
    fjolspil.send(seat.seat, { screen: 'sloedla', phase: 'late', song: songOf(round.song.id) });
  });

  /** The lane guest `n` plays now (judged on this screen a trip late), or -1. */
  const laneOf = n => (round ? round.lineup.findIndex(lane => lane.player === n && lane.judged === 'grace') : -1);
  const players = () => (round ? round.lineup.filter(lane => lane.judged === 'grace').map(lane => lane.player) : []);
  const toPlayers = body => { for (const n of players()) fjolspil.sendSong(n, body); };
  const anchor = () => toPlayers({ kind: 'clock', at: perf(), song: round.clock.time() });

  /** Her tap at `at` on the big screen's clock: her lane, at the song time it was; nothing from the future or long ago. */
  function tapOf(n, at) {
    const lane = laneOf(n);
    if (lane < 0) return;
    const time = hostSongTime({ songNow: round.clock.time(), perfNow: perf(), at });
    if (time !== null) round.game.tap(lane, time);
  }

  /** Each guest who plays: unheard for SILENT_MS, or gone, gives her dinosaur to Egill for the rest of the song. */
  function watch() {
    for (const lane of [...round.lineup]) {
      if (lane.judged !== 'grace') continue;
      const seat = fjolspil.seats.bySeat(lane.player);
      const quiet = perf() - (round.heard.get(lane.player) ?? -Infinity) > SILENT_MS;
      if (seat?.present && !quiet) continue;
      giveUp(lane.role);
    }
  }

  function giveUp(role) {
    round.lineup = takeOver(round.lineup, role, round.level);
    round.game.setLineup(round.lineup);
  }

  /**
   * Her page shows „Tilbúin!“ afresh (act { type: 'ready' }): before the round that is all; during it, her page has lost the
   * song (reloaded), so Egill takes her dinosaur at once, and she is told she is in next time.
   */
  function backWithout(n) {
    const lane = laneOf(n);
    if (lane < 0) return;
    giveUp(round.lineup[lane].role);
    round.late.add(n);
    fjolspil.send(n, { screen: 'sloedla', phase: 'late', song: songOf(round.song.id) });
  }

  function stopRound() {
    for (const id of round?.ticks ?? []) timers.clearInterval(id);
    round = null;
  }

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
    /** "Spila!": the room closes to new guests for the song ("Spilum aftur" finds it closed already). */
    start() {
      if (lobby.isOpen) lobby.start();
    },
    /** "Spila einn": the lobby (or the game) ends and every seated phone is thanked. */
    close() {
      stopRound();
      if (lobby.isOpen) lobby.close();
      else fjolspil.closeGame();
      fjolspil.broadcast(BLESS);
    },

    /** "Spila!" or "Spilum aftur", as the song loads: „Tilbúin!“ on every phone, which measures its clock. */
    ready(songId) {
      stopRound();
      waiting = [];
      nextId = 0;
      fjolspil.broadcast({ screen: 'sloedla', phase: 'ready', song: songOf(songId) });
    },

    /**
     * The round starts: `song` { id, name, bpm, length }, `lineup` (lineupOf's), its `clock` (song-clock.js), Egill's `level`
     * (a dinosaur he takes over is played at it) and its `game` (game.js). Each guest who plays gets the start, an anchor, the
     * sections decided so far; the anchors and the silence watch run until endRound.
     */
    beginRound({ song, lineup, clock, level, game }) {
      stopRound();
      round = { song, lineup: lineup.map(lane => ({ ...lane })), clock, level, game, heard: new Map(), late: new Set(), ticks: [] };
      const lanes = round.lineup.map(lane => lane.role);
      const levels = Object.fromEntries(round.lineup.map(lane => [lane.role, lane.level]));
      const names = Object.fromEntries(round.lineup.map(lane => [lane.role, lane.name]));
      for (const lane of round.lineup) {
        if (lane.judged !== 'grace') continue;
        round.heard.set(lane.player, perf());
        fjolspil.sendSong(lane.player, { kind: 'start', song: { ...song }, lanes, levels, names, mine: lane.role });
      }
      anchor();
      for (const body of waiting) toPlayers(body);
      waiting = [];
      round.ticks.push(timers.setInterval(anchor, CLOCK_EVERY_MS), timers.setInterval(watch, WATCH_MS));
    },

    /** The player decided a section (its onDecide): its notes to every guest, each with its place in the chart. */
    decided(notes, section) {
      const list = notes.map((note, i) => ({ id: nextId + i, t: note.t, role: note.role }));
      nextId += notes.length;
      const body = { kind: 'notes', section: { index: section.index, start: section.start, variant: section.variant }, list };
      if (round) toPlayers(body);
      else waiting.push(body);
    },

    /** The game judged a note (its onJudged): the big screen's word to every guest. */
    judged({ index, role, kind, grade = null }) {
      if (round) toPlayers({ kind: 'played', id: index, role, result: kind, grade });
    },

    /** The stars rose: every guest sees the band's stars and her own line (none if she was not in the song at its end). */
    endRound(result) {
      if (!round) return;
      stopRound();
      const lines = Array.isArray(result?.players) ? result.players : [];
      for (const seat of fjolspil.seats.list()) {
        if (seat.kind !== 'remote') continue;
        const own = lines.find(line => line.player === seat.seat);
        const line = own ? { name: own.name, roles: [...own.roles], points: own.points, great: own.great } : null;
        fjolspil.send(seat.seat, { screen: 'sloedla', phase: 'end', stars: result.stars, line });
      }
    },

    /** Who plays each lane now (null between rounds): a dinosaur Egill took is his. */
    lineup: () => (round ? round.lineup.map(lane => ({ ...lane })) : null),
  };
}
