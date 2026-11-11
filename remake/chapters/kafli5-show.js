// The show round the music video (chapter 5, scene 6): the fireflies, the dusk in the quiet part, the splashes, the big numbers of
// the countdown and the glowing notes. kafli5.js makes one of these as the set starts and gives it every frame of the set;
// everything here is a pure function of the dance beat (kafli5-video.js), so the rewind spools it back and Stoppdans freezes it.
//
// This is the place the show is built in (the storyboard: qa/remake/kafli5/myndband/index.html).

/**
 * The show for the chapter's state `c` (c.world, c.s: the scene, c.reduced: less motion asked for).
 * Returns { update({ beat, setBeat, frozen, rewinding, section }, dt), cue(event), dispose() }:
 *   update   every frame of the set: `beat` is the dance beat, `setBeat` the set's own, `section` the set's part now
 *   cue      every event of the set as it comes (kafli5.js onSet: sections, her lines, calls and the other cues)
 *   dispose  the set is over: the light, the sky and the screen as they were
 */
export function createShow(c) {
  void c;
  return {
    update() {},
    cue() {},
    dispose() {},
  };
}
