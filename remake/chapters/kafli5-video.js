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
