// The people in the music video (chapter 5, scene 6): what Egill, Mosi, Flugeðla and Slóeðla do in each part of the set. kafli5.js
// makes one of these as the set starts and gives it every frame of the set; everything here is a pure function of the dance beat
// (kafli5-video.js), so the rewind spools it back and Stoppdans freezes it.
//
// This is the place their dances are built in (the storyboard: qa/remake/kafli5/myndband/index.html).

/**
 * The people's dances for the chapter's state `c` (c.mosi, c.egill, c.flugedla, c.sloedla: the scene's actors; c.her: Slóeðla's
 * life, kafli5-sloedla.js; c.reduced: less motion asked for).
 * Returns { update({ beat, setBeat, frozen, rewinding, section }), cue(event), dispose() }:
 *   update   every frame of the set: `beat` is the dance beat, `setBeat` the set's own, `section` the set's part now
 *   cue      every event of the set as it comes (kafli5.js onSet: the camera's cuts, sections, her lines, calls and the other cues)
 *   dispose  the set is over: everyone as they stood, given back to the scene
 */
export function createPeople(c) {
  void c;
  return {
    update() {},
    cue() {},
    dispose() {},
  };
}
