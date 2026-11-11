// The music video's clock (chapter 5, scene 6: docs in qa/remake/kafli5/myndband, the owner's storyboard). Everything that moves to
// the set (the animals' dances: kafli5-dances.js, the show: kafli5-show.js, the people, the camera) reads one number, the dance
// beat, and is a pure function of it: no timers of its own. So the two tricks the DJ plays on the record are played on the picture
// by the clock alone:
//   - the rewind ("Aftur!", the set's beats 304 to 308): the dance beat runs backwards twice as fast, back to the drop's first beat
//     (296), and the drop comes again from there, so the picture spools back and replays as the record does;
//   - Stoppdans ("Stopp!", 362 to 372): the dance beat stands still, so everything is frozen in the middle of its move, and on
//     "Dansa!" it snaps to the set's beat again and everything slams back in.
// Pure data and functions; kafli5.js drives them, tests/kafli5-video.test.mjs holds them.
import { SONG } from './kafli5-set.js';

const cue = kind => SONG.set.cues.find(event => event.kind === kind)?.beat;
/** The set's beats where the clock is bent: the rewind and the freeze (from the set's own cues). */
export const BENDS = {
  rewind: { from: cue('rewind'), to: cue('rewind') + 4, back: 8 }, // four beats that spool eight back
  freeze: { from: cue('freeze'), to: cue('unfreeze') },
};

/**
 * The dance beat at the set's beat `setBeat`: { beat, frozen, rewinding }. It is the set's beat until the rewind, runs back through
 * it, is the set's beat less 12 from then to the freeze, stands still through the freeze, and is the set's beat again after it.
 */
export function danceBeatAt(setBeat) {
  const { rewind, freeze } = BENDS;
  if (setBeat < rewind.from) return { beat: setBeat, frozen: false, rewinding: false };
  const lost = rewind.to - rewind.from + rewind.back; // 12: the four beats of the spool and the eight it went back
  if (setBeat < rewind.to) return { beat: rewind.from - ((setBeat - rewind.from) / (rewind.to - rewind.from)) * rewind.back, frozen: false, rewinding: true };
  if (setBeat < freeze.from) return { beat: setBeat - lost, frozen: false, rewinding: false };
  if (setBeat < freeze.to) return { beat: freeze.from - lost, frozen: true, rewinding: false };
  return { beat: setBeat, frozen: false, rewinding: false };
}

/** The set's section at `setBeat` (SONG.set.sections), or null before the set and after its end. */
export function sectionAt(setBeat) {
  if (setBeat < 0 || setBeat > SONG.set.endBeat + 8) return null;
  return SONG.set.sections.findLast(section => section.startBeat <= setBeat) ?? null;
}

// The camera: what the set is cut to, by the set's beat (the storyboard's "Myndin"; the shots are kafli5-pool.js's). A cut is on a
// beat and a shot lasts a bar at least (1.92 s), but for the `quick` ones: three looks at the frogs, each closer ("frosk- frosk-
// froskadjamm!"), and the countdown, a group a number. After a cut the camera may move while the shot lasts (`then`): a push in
// (metres; negative pulls back), an orbit round what it looks at (degrees) or a zoom (to a lens), over so many beats, always inside
// the style's speeds (STYLE.md section 8: tests/kafli5-video.test.mjs holds them). With less motion asked for, only the cuts.
// No cut falls inside the rewind (the picture spools back in one shot) or on "Stopp!" (it freezes in the shot it is in).
export const CAMERA = [
  // the band from far away, and her welcome
  { beat: 0, cut: 'choir_wide', then: { push: 3.5, beats: 15 } },
  { beat: 16, cut: 'set_flugedla', then: { push: 1.2, beats: 7 } },
  { beat: 24, cut: 'set_low_wide', then: { orbit: 3, beats: 7 } }, // the forest answers: the hops run along the bank
  // the warm-up: Egill, the clapping, the build
  { beat: 32, cut: 'bank_talk', then: { push: 1, beats: 7 } },
  { beat: 40, cut: 'set_water_low', then: { orbit: -4, beats: 7 } },
  { beat: 48, cut: 'choir_wide', then: { push: 5, beats: 15 } },
  // the dance floor: everyone, from low over the water
  { beat: 64, cut: 'set_low_wide', then: { push: 2.5, beats: 7 } },
  { beat: 72, cut: 'bank_talk', then: { push: 1, beats: 7 } }, // Mosi sways and Egill bounces
  { beat: 80, cut: 'set_water_low', then: { push: 4, beats: 15 } },
  // her tune: her, the choir that sings it, her
  { beat: 96, cut: 'sloedla_out', then: { push: 1.5, beats: 7 } },
  { beat: 104, cut: 'choir_wide', then: { zoom: 44, beats: 7 } },
  { beat: 112, cut: 'set_her_close', then: { orbit: 14, beats: 7 } },
  { beat: 120, cut: 'set_low_wide', then: { push: 2, beats: 7 } },
  // each group's part: all of it, then close
  { beat: 128, cut: 'set_grazers', then: { push: 2, beats: 7 } },
  { beat: 136, cut: 'set_grazers_close' },
  { beat: 140, cut: 'bank_talk' }, // Mosi stomps with them, too big for it
  { beat: 144, cut: 'set_turtles', then: { push: 2, beats: 7 } }, // slow: a long push in
  { beat: 152, cut: 'set_turtles_close', then: { orbit: 14, beats: 7 } }, // "Og hratt!": they spin
  { beat: 160, cut: 'set_frogs' },
  { beat: 161, cut: 'set_frogs_mid', quick: true },
  { beat: 162, cut: 'set_frogs_close', quick: true },
  { beat: 168, cut: 'set_frogs', then: { push: 1.5, beats: 7 } },
  // the lizards line up (176), run out along the water's edge past the frogs and shake their tails there (178 to 185), run home
  // (185 to 190) and shake them again: their place, the whole run, their place close
  { beat: 176, cut: 'set_lizards' },
  { beat: 180, cut: 'set_lizards_run', then: { push: 1.2, beats: 7 } },
  { beat: 188, cut: 'set_lizards_close' },
  { beat: 192, cut: 'set_flyers' }, // they take off
  { beat: 196, cut: 'set_sky', then: { zoom: 44, beats: 11 } }, // and fly their eight over the pool, diving past the camera
  { beat: 208, cut: 'set_beetles', then: { push: 0.8, beats: 7 } }, // the beetles drum on their log
  { beat: 216, cut: 'set_low_wide', then: { push: 2, beats: 7 } },
  { beat: 224, cut: 'set_her_low', then: { push: 1.5, beats: 7 } }, // the dragonflies dart to her
  // her horn, in the dusk: low, the dark reed behind her and the air over her crest for her notes to rise in; slowly round her;
  // Egill and Mosi listen; her again, low, the sky over her
  { beat: 232, cut: 'set_her_reed', then: { push: 1.5, beats: 7 } },
  { beat: 240, cut: 'set_her_close', then: { orbit: 15, beats: 7 } },
  { beat: 248, cut: 'bank_talk', then: { push: 0.8, beats: 5 } },
  { beat: 254, cut: 'set_her_low', then: { push: 2.5, beats: 9 } },
  // the build: her wings up, Egill's hands up, the whole pool closing in, and a group a number
  { beat: 264, cut: 'set_flugedla' },
  { beat: 268, cut: 'pool_open' }, // her wings up, his hands up, and Mosi, in one picture
  { beat: 272, cut: 'choir_wide', then: { push: 4.5, beats: 13 } },
  { beat: 287, cut: 'set_grazers_close', quick: true },
  { beat: 289, cut: 'set_turtles_close', quick: true },
  { beat: 291, cut: 'set_frogs_close', quick: true },
  { beat: 293, cut: 'set_lizards_close', quick: true },
  { beat: 295, cut: 'set_flyers_close', quick: true },
  // the drop, the rewind (no cut: the picture spools back), the drop again from the water
  { beat: 296, cut: 'set_low_wide' },
  { beat: 308, cut: 'set_water_low', then: { orbit: 4, beats: 7 } },
  { beat: 316, cut: 'choir_wide', then: { push: 2.5, beats: 7 } },
  // everyone sings her tune
  { beat: 324, cut: 'set_low_wide', then: { orbit: -3, beats: 7 } },
  { beat: 332, cut: 'pool_open', then: { push: 1.2, beats: 7 } }, // the three on Egill's bank, dancing
  { beat: 340, cut: 'set_her_close', then: { orbit: -14, beats: 7 } },
  { beat: 348, cut: 'choir_wide', then: { push: 2.5, beats: 7 } },
  // Stoppdans: dancing, low over the water, the camera gliding on as everything freezes at 362 (through the fireflies that hang
  // in the air); the turtle that moved; and gliding again through the frozen pool until "Dansa!"
  { beat: 356, cut: 'set_water_low', then: { push: 2.9, beats: 8 } },
  { beat: 364, cut: 'set_turtles_close' },
  { beat: 368, cut: 'set_low_wide', then: { push: 1.4, beats: 4 } },
  // the carnival: the parade, the flyers over it, everyone hopping
  { beat: 372, cut: 'set_water_low', then: { orbit: 6, beats: 15 } },
  { beat: 388, cut: 'set_sky', then: { zoom: 46, beats: 7 } },
  { beat: 396, cut: 'choir_wide', then: { push: 2.5, beats: 7 } },
  // "Egill, segðu já!": Flugeðla's wing out to him, him (the gap is the child's), the forest's answer, and its bigger one
  { beat: 404, cut: 'pool_open' }, // her wing out to him
  { beat: 408, cut: 'set_egill_close' }, // his hands at his mouth: the child shouts
  { beat: 412, cut: 'set_water_low' }, // the forest answers
  { beat: 416, cut: 'set_low_wide' }, // and again, higher
  // the ending that is not one: pulling away, and her "Einu sinni enn!"
  { beat: 420, cut: 'choir_wide', then: { push: -1.4, beats: 4 } },
  { beat: 424, cut: 'set_flugedla' },
  // the last chorus: everyone, and her horn's three answers
  { beat: 428, cut: 'set_low_wide', then: { orbit: 3, beats: 6 } },
  { beat: 434, cut: 'set_her_close' },
  { beat: 438, cut: 'set_grazers' },
  { beat: 442, cut: 'sloedla_out' },
  { beat: 446, cut: 'bank_talk' }, // Egill and Mosi in the last chorus
  { beat: 450, cut: 'set_her_low' },
  { beat: 454, cut: 'set_water_low', then: { push: 2, beats: 6 } },
  // good night: the band's stabs, her goodnight, the last hit
  { beat: 460, cut: 'choir_wide' },
  { beat: 465, cut: 'set_flugedla', then: { push: 1, beats: 6 } },
  { beat: 472, cut: 'set_low_wide' },
];

/**
 * A part of the video (the dances, the show, the people: { update, cue, dispose }) that cannot stop the others: what one of its
 * calls throws is said once (`say`: the console by default), with the part's name and the call's, and that call returns undefined.
 * It is called again every time, so a part that recovers comes back by itself. (As engine/guard.js guards the parts of a frame.)
 */
export function shielded(name, part, say = message => console.error(message)) {
  const told = new Set();
  const guard = call => (...args) => {
    try {
      return part[call]?.(...args);
    } catch (error) {
      if (!told.has(call)) {
        told.add(call);
        say(`[kafli5 video: ${name}] ${call} failed, and the video goes on without it: ${error?.stack ?? error}`);
      }
      return undefined;
    }
  };
  return { update: guard('update'), cue: guard('cue'), dispose: guard('dispose') };
}
