// The beat clock. The theme's tempo was measured once (tools/theme-tempo.mjs) and stored in
// assets/audio/theme.json, so the beat is a pure function of the music's time: the same time always
// gives the same beat, and nothing listens to the audio while the game runs.
//
// beatOffset is the time of beat 0, a strong beat, so every second beat from it (the even indices)
// is a strong one too. The forest moves with it smoothly, never in jolts: its waves ride a beat count
// (beatsAt, waveAt) that follows the music's grid without jumping when the music's playhead jumps
// (followBeat), and the flowers' nod and the mushrooms' hop ride the strong beats of the same count (danceOf).

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

/** The count that says there is no beat to follow (no theme.json): every wave of the forest holds its middle, 0.5 (materials.js: forestWave). */
export const NO_BEAT = -1;

/** A beat count folded into [0, FOLD), and a count already folded comes back exactly; anything that is not a finite number gives 0, never NaN. */
export function foldBeats(beats) {
  if (!Number.isFinite(beats)) return 0;
  const folded = beats % FOLD; // exact
  return folded < 0 ? (folded + FOLD) % FOLD : folded;
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

// The forest's beat follows the music's grid, but never jumps with it. The music's playhead jumps twice in a chapter's life: at the first
// touch it goes from the clock's time to the theme's start, and the theme loops (its 351.6 s are 556.7 beats, so the grid restarts
// mid-bar). The follower runs its own count at the tempo and eases it onto the grid after a jump, as quickly as the forest's rule lets
// it: no wave may change by more than a tenth of its range from one 60 fps frame to the next, and the steepest, the grass's ripple, is
// one beat long, so the count may move at most asin(0.1) / π of a beat a frame, either way: 1.91 beats a second, 1.2 times the theme's
// tempo (the follower keeps to 0.098 of the range). So it can gain on the grid only slowly (0.29 beats a second at 95 beats a minute)
// but drop back fast (3.46, running backwards for a moment), and it goes the way round that is quicker at full speed: forward to a grid
// up to about a third of a beat ahead, back to any other. Its speed changes by at most ACCEL a second, it brakes onto the grid without
// passing it (planning with half of ACCEL), and the last of the gap closes in an exponential ease (EASE). While seeking, and in a
// frozen capture, it snaps to the grid, so captures stay exact.
const STEEPEST = (Math.asin(0.098) / Math.PI) * 60; // beats a second: the fastest the count may run, either way
const ACCEL = 30; // beats a second, a second: how fast the count's speed may change
const EASE = 10; // a second: the rate at which the last of the gap closes

/**
 * One frame of the forest's beat, pure: `followed` is the last frame's { beats, speed } (null on the first), `target` the music's count
 * (beatsAt of its playhead), `dt` the game seconds since the last frame, and `snap` lands it on the grid. Returns this frame's
 * { beats, speed }: `beats` the count to sway and dance by, folded into [0, FOLD); `speed` how much faster than the tempo it runs,
 * in beats a second. A frame that takes no time (the game held) holds it where it is.
 */
export function followBeat(followed, target, dt, { bpm }, snap = false) {
  const grid = foldBeats(target);
  if (!followed || snap) return { beats: grid, speed: 0 };
  if (!(dt > 0)) return followed;
  const tempo = bpm / 60;
  // From 102.3 beats a minute 1.1 times the tempo is above STEEPEST, so this floor keeps up with the music first; from about 104 a
  // count catching up at 1.1 times the tempo breaks the grass's 0.1 rule. The theme's 95 is safe.
  const top = Math.max(STEEPEST, 1.1 * tempo);
  const gain = top - tempo, lose = top + tempo; // the most the count can gain on the grid a second, and lose on it
  const beats = foldBeats(followed.beats + tempo * dt); // at the tempo first...
  let gap = foldBeats(grid - beats + FOLD / 2) - FOLD / 2; // ...then the grid ahead (> 0) or behind (< 0), the short way round
  if (gap > 0 && gap / gain > (FOLD - gap) / lose) gap -= FOLD; // the long way round is quicker
  const size = Math.abs(gap);
  const want = Math.sign(gap) * Math.min(EASE * size, Math.sqrt(ACCEL * size), gap > 0 ? gain : lose);
  const speed = followed.speed + Math.max(-ACCEL * dt, Math.min(ACCEL * dt, want - followed.speed));
  return { beats: foldBeats(beats + speed * dt), speed };
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
const RISE = 0.125; // ...squashes over this long after landing...
const LAND = 0.3; // ...and has sprung back this long after the beat
const STRETCH = 0.4; // and is stretched, by this share of what landing squashes it, at the top of its hop

const smooth = t => t * t * (3 - 2 * t);

/**
 * The strong beats' dance at the beat count `beats` (since beat 0, folded or not: it is the same every two beats, so the fold never
 * shows), pure: { nod 0..1, hop 0..1, squash -STRETCH..1 }, and nothing between the strong beats.
 *   nod     1 on a strong beat: it eases down over the LEAD before it and up over SETTLE seconds after it (smoothstep, so it starts
 *           and ends at rest and passes the beat at rest)
 *   hop     a mushroom's height as a share of its hop: sin² over the AIR seconds that end on a strong beat, so it leaves the ground
 *           and lands at rest
 *   squash  nothing as it lands, on the beat; it squashes fully over RISE seconds and has sprung back LAND seconds after the beat
 *           (smoothstep both ways); in the air it is a little stretched (below 0), which is nothing again as it lands
 * A count that is not a number gives no dance.
 */
export function danceOf(beats, { bpm }) {
  const beat = 60 / bpm; // seconds a beat
  const since = (((beats % 2) + 2) % 2) * beat; // since the last strong beat
  const until = 2 * beat - since; // to the next
  const u = until / AIR; // 1 as a mushroom leaves the ground, 0 as it lands
  const flying = u < 1;
  const landed = since < RISE ? smooth(since / RISE) : since < LAND ? smooth(1 - (since - RISE) / (LAND - RISE)) : 0;
  return {
    nod: Math.max(since < SETTLE ? smooth(1 - since / SETTLE) : 0, until < LEAD ? smooth(1 - until / LEAD) : 0),
    hop: flying ? Math.sin(Math.PI * u) ** 2 : 0,
    squash: landed - (flying ? STRETCH * Math.sin(Math.PI * u) : 0),
  };
}

/** The strong beats' dance at `time` (seconds of the music): danceOf the beat count there. A time that is not a number gives no dance. */
export function danceAt(time, theme) {
  return danceOf(((time - (theme.beatOffset ?? 0)) * theme.bpm) / 60, theme);
}
