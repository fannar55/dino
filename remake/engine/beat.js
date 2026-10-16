// The beat clock. The theme's tempo was measured once (tools/theme-tempo.mjs) and stored in
// assets/audio/theme.json, so the beat is a pure function of the music's time: the same time always
// gives the same beat, and nothing listens to the audio while the game runs.
//
// beatOffset is the time of beat 0, a strong beat, so every second beat from it (the even indices)
// is a strong one too; the chimes ride those.
const DECAY = 6; // pulse = exp(-DECAY * phase): full on the beat, a quarter of a per cent by the next

/** Where `time` (seconds of the music) falls on the beat grid: { index, phase 0..1 inside the beat, pulse 1..0 }. */
export function beatAt(time, { bpm, beatOffset = 0 }) {
  const beats = ((time - beatOffset) * bpm) / 60;
  const index = Math.floor(beats);
  const phase = beats - index;
  return { index, phase, pulse: Math.exp(-DECAY * phase) };
}
