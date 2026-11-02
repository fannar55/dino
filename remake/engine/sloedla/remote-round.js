// Söngur Slóeðlu in fjölspil, on a guest's phone or tablet (spec §5 and §7): the round as the big screen tells it, with no music
// and no player. The big screen sends `song` messages in order (Task 9's band host): `start` (the song, the lanes and who plays
// them), `clock` anchors (its clock and the song's time then), `notes` a section at a time as the song decides them, `played`
// for every note judged, and `end`. From them this makes what game.js needs: a conductor whose chart grows section by section
// (only her own lane's notes on a phone, every lane's on a tablet) and a clock that turns her phone's moments into song time
// through the shared clock (clock-sync.js). It never decides anything: the big screen does.

import { songTimeAt } from './clock-sync.js';

const isNote = note => note && Number.isFinite(note.t) && Number.isFinite(note.id) && typeof note.role === 'string';

/**
 * A guest's round. `sync` the phone's clock (createClockSync), `now` its own clock in ms, `every` true on a tablet (every lane's
 * notes and verdicts), false on a phone (her own only). receive(body) takes a `song` message; for a `played` note this guest has
 * it returns { kind: 'played', index, verdict: { kind: 'hit' | 'miss', grade } } (index in the chart), else null.
 * `conductor` is game.js's: { chart, expected: 0, length, beat, bpm, hit, miss, stray, setTier, sectionAt, isOpen }, its chart
 * only ever growing at its end, in time order (game.js and its judge count notes by their place). `clock` is
 * { time(), timeAt(stamp), contextTimeOf, latency }: null before the first anchor.
 */
export function createRemoteRound({ sync, now = () => performance.now(), every = false }) {
  const chart = [];
  const byId = new Map(); // the big screen's id -> place in the chart
  const sections = []; // { index, start, variant } by index
  let mine = null;
  let anchor = null;
  const conductor = {
    chart,
    expected: 0,
    length: Infinity,
    beat: 0.5,
    bpm: 120,
    hit: () => false, // her part never drops out here: the music is on the big screen
    miss() {},
    stray() {},
    setTier() {},
    isOpen: () => true,
    sectionAt(time) {
      let found = null;
      for (const section of sections) if (section && (!found || time >= section.start)) found = section;
      return found ? { ...found } : null;
    },
  };
  const toSong = stamp => (anchor ? songTimeAt(anchor, sync.toHost(stamp)) : null);
  const clock = {
    time: () => toSong(now()),
    timeAt: stamp => toSong(stamp),
    contextTimeOf: () => null,
    latency: () => 0,
  };

  function start(body) {
    mine = typeof body.mine === 'string' ? body.mine : null;
    const song = body.song ?? {};
    if (Number.isFinite(song.length)) conductor.length = song.length;
    if (Number.isFinite(song.bpm) && song.bpm > 0) {
      conductor.bpm = song.bpm;
      conductor.beat = 60 / song.bpm;
    }
  }

  function notes(body) {
    const section = body.section;
    if (!section || !Number.isInteger(section.index) || !Array.isArray(body.list)) return;
    if (!sections[section.index] && Number.isFinite(section.start)) sections[section.index] = { index: section.index, start: section.start, variant: section.variant ?? 'normal' };
    const last = chart.length ? chart[chart.length - 1].t : -Infinity;
    const list = body.list.filter(note => isNote(note) && !byId.has(note.id) && (every || note.role === mine)).sort((x, y) => x.t - y.t);
    for (const note of list) {
      if (note.t < last) continue; // too late to fall in order: the notes already given keep their places
      byId.set(note.id, chart.length);
      chart.push({ t: note.t, role: note.role, section: section.index, id: note.id });
    }
  }

  function played(body) {
    const index = byId.get(body.id);
    if (index === undefined) return null;
    return { kind: 'played', index, verdict: { kind: body.result === 'hit' ? 'hit' : 'miss', grade: body.grade ?? null } };
  }

  return {
    conductor,
    clock,
    get mine() { return mine; },
    receive(body) {
      switch (body?.kind) {
        case 'start': start(body); return null;
        case 'clock': if (Number.isFinite(body.at) && Number.isFinite(body.song)) anchor = { at: body.at, song: body.song }; return null;
        case 'notes': notes(body); return null;
        case 'played': return played(body);
        default: return null;
      }
    },
  };
}
