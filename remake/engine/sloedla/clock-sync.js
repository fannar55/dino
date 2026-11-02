// Söngur Slóeðlu in fjölspil: the shared clock, pure (no page, no net, no timers). A guest's phone asks the big screen the time
// (`time { sent }`, answered `time { sent, host }` with the big screen's performance.now()) and learns how far its own clock is
// from the big screen's (`offset`, ms). The trip there and back is assumed even, so the shortest trip tells the truth best: before
// a song the phone asks MEASURE.asks times and the shortest wins; during a song it asks once a second and only an answer about as
// quick as the best trip moves the clock, a little at a time (FOLLOW), so one slow answer never makes the notes jump. The big
// screen sends anchors `clock { at, song }` (its clock and the song's time at that moment) every CLOCK_EVERY_MS; with them a
// moment on the phone's clock becomes a song time, and a tap is sent stamped with the big screen's clock (spec §5).

export const MEASURE = Object.freeze({ asks: 8, gapMs: 50 });
export const FOLLOW = Object.freeze({ everyMs: 1000, slackMs: 10, stepMs: 2 });
export const CLOCK_EVERY_MS = 2000; // the big screen's anchors
export const SILENT_MS = 3000; // a guest unheard this long has dropped out: Egill takes her dinosaur
const FUTURE_MS = 50; // a stamp this far ahead of the big screen's clock is not believed
const OLD_MS = 2000; // nor one this old

/**
 * The clock of one phone: request(now) the message to send; receive(answer, now) learns from an answer (true when it was used);
 * measure() starts measuring afresh, follow() goes on following; `offset` (null before an answer), `rtt` the best trip;
 * toHost(ms) the big screen's clock at the phone's moment `ms`.
 */
export function createClockSync() {
  let mode = 'measure';
  let best = Infinity; // the shortest trip since measure()
  const sync = {
    offset: null,
    rtt: null,
    request: now => ({ sent: now }),
    receive({ sent, host } = {}, now) {
      if (![sent, host, now].every(Number.isFinite) || now < sent) return false;
      const trip = now - sent;
      const says = host - (sent + now) / 2;
      if (mode === 'measure' || sync.offset === null) {
        if (trip >= best) return false;
        best = trip;
        sync.rtt = trip;
        sync.offset = says;
        return true;
      }
      if (trip > best + FOLLOW.slackMs) return false;
      if (trip < best) sync.rtt = best = trip;
      sync.offset += Math.max(-FOLLOW.stepMs, Math.min(FOLLOW.stepMs, says - sync.offset));
      return true;
    },
    measure() {
      mode = 'measure';
      best = Infinity;
    },
    follow() {
      mode = 'follow';
    },
    toHost: ms => ms + (sync.offset ?? 0),
  };
  return sync;
}

/** The song's time at the big screen's moment `hostMs`, from an anchor { at, song }. */
export const songTimeAt = (anchor, hostMs) => anchor.song + (hostMs - anchor.at) / 1000;

/**
 * On the big screen: the song time of a tap stamped `at` (the big screen's clock), now that the song is at `songNow` and the clock
 * at `perfNow`; null for a stamp from the future (> 50 ms) or older than two seconds (a broken or unsynced clock).
 */
export function hostSongTime({ songNow, perfNow, at }) {
  if (![songNow, perfNow, at].every(Number.isFinite)) return null;
  if (at > perfNow + FUTURE_MS || perfNow - at > OLD_MS) return null;
  return songNow - (perfNow - at) / 1000;
}
