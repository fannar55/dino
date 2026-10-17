// The beat clock. The theme's tempo was measured once (tools/theme-tempo.mjs) and stored in
// assets/audio/theme.json, so the beat is a pure function of the music's time: the same time always
// gives the same beat, and nothing listens to the audio while the game runs.
//
// beatOffset is the time of beat 0, a strong beat, so every second beat from it (the even indices)
// is a strong one too. The forest moves with it smoothly, never in jolts: its waves ride the beat count
// (beatsAt, waveAt), and the flowers' nod and the mushrooms' hop ride the strong beats (danceAt).

/** Where `time` (seconds of the music) falls on the beat grid: { index, phase 0..1 inside the beat }. */
export function beatAt(time, { bpm, beatOffset = 0 }) {
  const beats = ((time - beatOffset) * bpm) / 60;
  const index = Math.floor(beats);
  return { index, phase: beats - index };
}

// The forest's sway rides one beat count (the wind's uBeats; world/forest/materials.js reads it). Each band of the forest crests on a
// wave of its own length in beats (config.js: FOREST.wind.beatPeriods): the trees once in four beats, the ferns and bushes once in two,
// the grass every beat. Four is the longest, so the count is folded into four beats: every wave fits the fold a whole number of times,
// so the fold never shows, and a count that small keeps its precision in a shader's float.
export const FOLD = 4;

/** A beat count folded into [0, FOLD); anything that is not a finite number gives 0, never NaN. */
export function foldBeats(beats) {
  return Number.isFinite(beats) ? ((beats % FOLD) + FOLD) % FOLD : 0;
}

/** The beat count at `time` since beat 0, `(time - beatOffset) * bpm / 60`, folded into [0, FOLD). */
export function beatsAt(time, { bpm, beatOffset = 0 }) {
  return foldBeats(((time - beatOffset) * bpm) / 60);
}

/**
 * A wave `period` beats long at `beats`: 1 on the beats that are a whole number of periods (beat 0 is a strong beat, so a wave of
 * two or four beats crests on strong ones), nothing halfway between, a cosine in between, so its place and its speed run on without a
 * break, across the fold too. The forest's shaders compute the same (materials.js: forestWave).
 */
export function waveAt(beats, period) {
  return 0.5 + 0.5 * Math.cos((2 * Math.PI * beats) / period);
}

// The dance of the strong beats: the forest's flowers nod and its mushrooms hop (world/forest, materials.js: forestPivot). Everything
// that dances meets the beat, so that the picture hits where the ear does: a flower head is fully down on it, a mushroom lands on it.
// Every move starts and ends at rest, so nothing jolts from one frame to the next. All in seconds, whatever the tempo: the tempo tool
// measures 60 to 180 beats a minute, so a strong beat comes every 0.67 to 2 s; the hop and the squash (AIR and LAND) fit between two of
// them at any of those tempos, and the nod (SETTLE and the LEAD of the next) up to 171 beats a minute, past which it is not fully up
// again before it starts down.
const LEAD = 0.25; // a flower head eases down over this long before a strong beat, to be fully down on it...
const SETTLE = 0.45; // ...and up again over this long after it
const AIR = 0.35; // a mushroom leaves the ground this long before the beat and lands on it...
const RISE = 0.08; // ...squashes over this long after landing...
const LAND = 0.3; // ...and has sprung back this long after the beat
const STRETCH = 0.4; // and is stretched, by this share of what landing squashes it, at the top of its hop

const smooth = t => t * t * (3 - 2 * t);

/**
 * The strong beats' dance at `time`, pure like beatAt: { nod 0..1, hop 0..1, squash -1..1 }, and nothing between the strong beats.
 *   nod     1 on a strong beat: it eases down over the LEAD before it and up over SETTLE seconds after it (smoothstep, so it starts
 *           and ends at rest and passes the beat at rest)
 *   hop     a mushroom's height as a share of its hop: sin² over the AIR seconds that end on a strong beat, so it leaves the ground
 *           and lands at rest
 *   squash  nothing as it lands, on the beat; it squashes fully over RISE seconds and has sprung back LAND seconds after the beat
 *           (smoothstep both ways); in the air it is a little stretched (below 0), which is nothing again as it lands
 * A time that is not a number gives no dance.
 */
export function danceAt(time, { bpm, beatOffset = 0 }) {
  const cycle = 120 / bpm; // from one strong beat to the next
  const since = (((time - beatOffset) % cycle) + cycle) % cycle; // since the last strong beat
  const until = cycle - since; // to the next
  const u = until / AIR; // 1 as a mushroom leaves the ground, 0 as it lands
  const flying = u < 1;
  const landed = since < RISE ? smooth(since / RISE) : since < LAND ? smooth(1 - (since - RISE) / (LAND - RISE)) : 0;
  return {
    nod: Math.max(since < SETTLE ? smooth(1 - since / SETTLE) : 0, until < LEAD ? smooth(1 - until / LEAD) : 0),
    hop: flying ? Math.sin(Math.PI * u) ** 2 : 0,
    squash: landed - (flying ? STRETCH * Math.sin(Math.PI * u) : 0),
  };
}
