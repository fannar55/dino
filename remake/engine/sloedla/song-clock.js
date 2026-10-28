// The clock of Slóeðla's song game: the song's own time, as it is HEARD, taken from the audio context that plays it, never from
// the frame clock. The song is decoded whole (75.6 s, about 27 MB of samples) and played by one AudioBufferSourceNode started at a
// known context time, so the song's time is the context's time less that start, exactly, with no drift.
//
// What is heard comes out of the speakers a little after the context plays it: the output latency, large on some Android tablets
// (60 to 150 ms; more over Bluetooth). The notes fall, and taps are judged, on the heard time: context time less the latency, which
// the browser reports through getOutputTimestamp (the context time being heard now) or outputLatency and baseLatency. What a
// browser cannot know (a Bluetooth speaker, say) the page can add by hand: `extra` seconds (the lab's ?seinkun= in ms).
//
// The context's clock moves in steps (a render quantum, or a whole buffer on Android), so the time drawn is smoothed: it runs on
// the frame clock (performance.now) between readings and is pulled gently toward each reading, and jumps only when far off. A tap
// is judged at its event's own timestamp, not at the frame that handles it.

const SNAP = 0.08; // s: an estimate this far from the reading jumps to it
const PULL = 0.12; // the share of the gap closed at each reading
const LATENCY_EASE = 0.05; // the share of a new latency reading taken each frame
const MAX_LATENCY = 0.6; // s: a reading past this is not believed

/** The output latency `context` reports now, in seconds (0 when it reports none). */
export function reportedLatency(context, perfNow = globalThis.performance?.now?.() ?? 0) {
  try {
    const stamp = context.getOutputTimestamp?.();
    if (stamp && stamp.contextTime > 0 && stamp.performanceTime > 0) {
      const heard = stamp.contextTime + (perfNow - stamp.performanceTime) / 1000;
      const latency = context.currentTime - heard;
      if (latency > -0.02 && latency < MAX_LATENCY) return Math.max(0, latency);
    }
  } catch {
    // a browser that has the call but cannot answer it yet: use the properties
  }
  const latency = (Number(context.outputLatency) || 0) + (Number(context.baseLatency) || 0);
  return latency >= 0 && latency < MAX_LATENCY ? latency : 0;
}

/**
 * The song clock on `context`, playing through `output`. `extra` is added latency in seconds (by hand). `now` is the frame clock in
 * ms (performance.now). Returns { start(buffer, lead), stop(), time(), timeAt(stamp), latency(), playing() }:
 *   start  plays `buffer` from its start, `lead` seconds from now
 *   time   the song's heard time now, in seconds (negative before it starts sounding)
 *   timeAt the song's heard time at `stamp`, an event's timeStamp (ms on the frame clock)
 */
export function createSongClock(context, { output, extra = 0, now = () => performance.now() } = {}) {
  let source = null;
  let startAt = null; // context time the song's first sample is played at
  let latency = reportedLatency(context, now());
  let estimate = null; // { song, perf }: the last time given and when

  function reading(perf) {
    latency += (reportedLatency(context, perf) - latency) * LATENCY_EASE;
    return context.currentTime - startAt - latency - extra;
  }

  function time() {
    if (startAt === null) return -Infinity;
    const perf = now();
    const measured = reading(perf);
    if (context.state !== 'running' || !estimate) {
      estimate = { song: measured, perf };
      return measured;
    }
    const predicted = estimate.song + (perf - estimate.perf) / 1000;
    const gap = measured - predicted;
    const song = Math.abs(gap) > SNAP ? measured : predicted + gap * PULL;
    estimate = { song, perf };
    return song;
  }

  return {
    start(buffer, lead = 0.2) {
      this.stop();
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output ?? context.destination);
      startAt = context.currentTime + lead;
      estimate = null;
      source.start(startAt);
      return startAt;
    },
    stop() {
      if (!source) return;
      try { source.stop(); } catch { /* never started */ }
      source.disconnect();
      source = null;
    },
    time,
    timeAt(stamp) {
      const perf = now();
      const ago = Math.max(0, Math.min(0.25, (perf - stamp) / 1000));
      return time() - ago;
    },
    latency: () => latency + extra,
    playing: () => source !== null,
  };
}
