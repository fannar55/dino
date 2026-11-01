// The lines of the kafli2 set that are in kafli2/lines-source.json but have no recording yet, so that the tests that hold every line
// to a recording (kafli3.test.mjs: every chapter line has a recording; voice-lines.test.mjs: the committed record accounts for every
// line) name them and let them wait. A line waiting is timed by its words (engine/scene/scene.js lineDuration) until it is recorded;
// a line in it that has its recording fails the test that reads it, so it cannot be forgotten here. Task 7 of the plan
// (docs/superpowers/plans/2026-10-31-kafli-2-bod-til-uggedlu.md) recorded all 31 lines with tools/voice-lines.mjs, so the set is empty;
// a later chapter that adds lines before it records them puts their ids here again.
export const WAITING_FOR_VOICE = new Set([]);
