// The lines of the kafli2 set that are in kafli2/lines-source.json but have no recording yet, so that the tests that hold every line
// to a recording (kafli3.test.mjs: every chapter line has a recording; voice-lines.test.mjs: the committed record accounts for every
// line) name them and let them wait. A line waiting is timed by its words (engine/scene/scene.js lineDuration) until it is recorded;
// the plan's seventh task (docs/superpowers/plans/2026-10-31-kafli-2-bod-til-uggedlu.md) records them with tools/voice-lines.mjs and
// empties this set, and a line in it that has its recording fails the test that reads it, so it cannot be forgotten here.
export const WAITING_FOR_VOICE = new Set([
  'k3_mosi_wave', 'k3_egill_hi', // chapter 3's lookout: Uggeðla waves from her reed
  'k3_mosi_third', 'k3_mosi_three', // chapter 3's star: the third, and "Þrjár komnar"
]);
