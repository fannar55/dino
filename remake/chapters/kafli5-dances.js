// The animals' dances in the music video (chapter 5, scene 6): what each group of the choir, the beetles and the dragonflies do in
// each part of the set. kafli5.js makes one of these as the set starts and gives it every frame of the set; everything here is a
// pure function of the dance beat (kafli5-video.js), so the rewind spools it back and Stoppdans freezes it.
//
// This is the place the dances are built in (the storyboard: qa/remake/kafli5/myndband/index.html). Until they are, the groups
// only hop as they sing (kafli5.js onSet).

/**
 * The dances for the chapter's state `c` (c.world, c.members: the choir's members by group, c.reduced: less motion asked for).
 * Returns { update({ beat, setBeat, frozen, rewinding, section }), cue(event), dispose() }:
 *   update   every frame of the set: `beat` is the dance beat, `setBeat` the set's own, `section` the set's part now
 *   cue      every event of the set as it comes (kafli5.js onSet: sections, her lines, calls and the other cues)
 *   dispose  the set is over: everyone back as they stood
 */
export function createDances(c) {
  void c;
  return {
    update() {},
    cue() {},
    dispose() {},
  };
}
