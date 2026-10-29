// The map in the journey, as a scene plays it (spec 2026-10-28-kortid-lifandi-og-i-ferdalaginu-design.md, section 3): at a departure the
// map slides up over the game, draws the leg ahead while Mosi says where they are going, stands a moment and slides away. The map is
// the journal's (engine/book/map-moment.js: s.journal.mapMoment); this is the scene's side of it, the timing, which is the game's.
//
//   yield* mapMoment(s, c, { pieces: ['a'], line: 'k1_mosi_map_ride' })
//
// The game goes on under the map: nothing is cut, and the actors and the camera are as the scene left them (Mosi stands ready, looking
// at Egill, or at whoever he was looking at). The map slides up (0.6 s) and Mosi begins his line at the same moment; the line and the
// drawing (the slide up and each piece, 2.65 s, with 0.2 s between) go on side by side, and the map waits for whichever is longer, and
// for Mosi's line in any case (with reduced motion there is no drawing to wait for, and Mosi's line is the only wait); then it stands
// HOLD s, slides away (what close() says: 0.6 s, none with reduced motion) and the scene goes on. Every wait is on the game clock
// (s.say, s.until, s.wait), never on a Web Animation, so a capture or a test that seeks through the moment, or a child who opens the book
// during it (which holds the clock), gets the same moment, and the map is off the page when it is over. A scene that is cancelled in
// the middle (the chapter stopped) closes the map where it stands.
//
// Mosi's line is said with `s.say` unless the chapter has a way of its own to say lines, which it passes as `speak(speaker, line)`, a
// generator the helper runs itself (`yield*`), as chapter 2's `say(s, c, ...)`, which counts the lines under way in `c.saying` so a
// goodbye waits its turn. `c` is the chapter's state, which the moment leaves alone.

const HOLD = 0.8; // seconds the map stands once the line and the drawing are over

/**
 * Plays a map moment: the pieces (`pieces`, 'a' to 'g' as the map's route has them) draw themselves on the map while Mosi says `line`
 * (an id of the chapter's lines). Resolves once the map is off the screen.
 */
export function* mapMoment(s, c, { pieces, line, speak = null }) {
  const moment = s.journal.mapMoment;
  const { drawMs } = moment.play(pieces);
  const drawnAt = s.time + drawMs / 1000;
  let closing = false;
  try {
    // Mosi's line is said by this task itself, right where the line before it ended, not by a task of its own: a chapter that counts
    // its lines under way (chapter 2's `c.saying`) must see no gap between them, or a goodbye waiting for quiet would slip in.
    if (speak) yield* speak('mosi', line);
    else yield s.say('mosi', line);
    yield s.until(() => s.time >= drawnAt - 1e-9); // and the drawing, if it is the longer
    yield s.wait(HOLD);
    closing = true;
    yield s.wait(moment.close() / 1000);
  } finally {
    if (!closing) moment.close(); // cancelled while it was up
  }
}
