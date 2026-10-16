// The beat clock. The theme's tempo was measured once (tools/theme-tempo.mjs) and stored in
// assets/audio/theme.json, so the beat is a pure function of the music's time: the same time always
// gives the same beat, and nothing listens to the audio while the game runs.
//
// beatOffset is the time of beat 0, a strong beat, so every second beat from it (the even indices)
// is a strong one too; the flowers' nod and the mushrooms' hop ride those (danceAt).
const DECAY = 6; // pulse = exp(-DECAY * phase): full on the beat, a quarter of a per cent by the next

/** Where `time` (seconds of the music) falls on the beat grid: { index, phase 0..1 inside the beat, pulse 1..0 }. */
export function beatAt(time, { bpm, beatOffset = 0 }) {
  const beats = ((time - beatOffset) * bpm) / 60;
  const index = Math.floor(beats);
  const phase = beats - index;
  return { index, phase, pulse: Math.exp(-DECAY * phase) };
}

// The dance of the strong beats: the forest's flowers nod and its mushrooms hop (world/forest, materials.js: forestPivot). Everything
// that dances meets the beat, so that the picture hits where the ear does: a flower head is fully down on it and comes up again, a
// mushroom lands on it. All in seconds, whatever the tempo: the tempo tool measures 60 to 180 beats a minute, so a strong beat comes
// every 0.67 to 2 s, and even at 0.67 s the nod (SETTLE and the LEAD of the next) and the hop (AIR and LAND) fit between two of them.
const SETTLE = 0.5; // a flower head has come up from its nod this long after the beat...
const LEAD = 0.06; // ...and starts down again this long before the next, to be fully down on it
const AIR = 0.3; // a mushroom leaves the ground this long before the beat and lands on it...
const LAND = 0.2; // ...squashed, and has sprung back this long after
const STRETCH = 0.4; // and is stretched, by this share of what landing squashes it, at the top of its hop

const smooth = t => t * t * (3 - 2 * t);

/**
 * The strong beats' dance at `time`, pure like beatAt: { nod 0..1, hop 0..1, squash -1..1 }, and nothing between the strong beats.
 *   nod     1 on a strong beat, easing to 0 over SETTLE seconds, and rising into the next one over the LEAD before it
 *   hop     a mushroom's height as a share of its hop: a parabola over the AIR seconds that end on a strong beat
 *   squash  1 on the beat, as it lands, easing to 0 over LAND seconds; a little below 0 (stretched) in the air
 * A time that is not a number gives no dance.
 */
export function danceAt(time, { bpm, beatOffset = 0 }) {
  const cycle = 120 / bpm; // from one strong beat to the next
  const since = (((time - beatOffset) % cycle) + cycle) % cycle; // since the last strong beat
  const until = cycle - since; // to the next
  const u = until / AIR; // 1 as a mushroom leaves the ground, 0 as it lands
  const flying = u < 1;
  return {
    nod: Math.max(since < SETTLE ? (1 - since / SETTLE) ** 2 : 0, until < LEAD ? smooth(1 - until / LEAD) : 0),
    hop: flying ? 4 * u * (1 - u) : 0,
    squash: (since < LAND ? (1 - since / LAND) ** 2 : 0) - (flying ? STRETCH * Math.sin(Math.PI * u) : 0),
  };
}
