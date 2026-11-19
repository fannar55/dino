// The lines of the kafli2 set that are in kafli2/lines-source.json but have no recording yet, so that the tests that hold every line
// to a recording (kafli3.test.mjs: every chapter line has a recording; voice-lines.test.mjs: the committed record accounts for every
// line) name them and let them wait. A line waiting is timed by its words (engine/scene/scene.js lineDuration) until it is recorded;
// a line in it that has its recording fails the test that reads it, so it cannot be forgotten here. Task 7 of the plan
// (docs/superpowers/plans/2026-10-31-kafli-2-bod-til-uggedlu.md) recorded all 31 lines with tools/voice-lines.mjs, so the set is empty;
// a later chapter that adds lines before it records them puts their ids here again.
export const WAITING_FOR_VOICE = new Set([]);

// Chapter 5's lines that wait for Slóeðla's voice (the plan's Task 8, docs/superpowers/plans/2026-11-07-kafli-5-sloedla.md): she has
// no voice in assets/audio/voices.json until the owner has picked one of the six designed for her (qa/remake/kafli5/rodd), so her
// three lines are in kafli5/lines-source.json with no recording and are shown as captions, timed by their words. The same two
// tests let them wait (kafli5-lines.test.mjs, voice-lines.test.mjs); kafli5-lines.test.mjs fails the day she has a voice and one of
// these still has no recording, and when one that has its recording is still named here.
// The owner picked her voice on 2026-11-11 (the fourth of the six) and her three lines were recorded that evening, so none waits.
export const WAITING_FOR_HER_VOICE = new Set([]);
