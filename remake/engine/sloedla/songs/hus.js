// "Ljósahús": a bouncy house track made with ElevenLabs Music (assets/audio/sloedla/el-house.mp3, G major, 126 a minute, made by
// tools/sloedla-music.mjs; its json has the plan and the measured grid), with the dinosaurs playing on top of it. The recording is
// the band (drums, bass, chords): the game adds no band of its own, only star layers on a run of hits. Its beat 0 is the file's
// first downbeat (measured.downbeatSec), so the song's bars are the recording's: intro 4, verse 8, chorus 8, verse, chorus,
// bridge 8, last chorus 8, outro 4, as the plan asked. The model did not keep to the chords asked for bar by bar, so every part
// here is in G major's pentatonic (G A B D E: steps 0 1 2 4 5 and their octaves, never 3 or 6), which sits on whatever it plays.
// A calm section muffles the recording (the conductor's mood filter); a big one brings a crash, a riser and the choir. There is
// no key change (the recording cannot change key).

const STAR1 = { inst: 'shaker', steps: 'oooooooooooooooo', tier: 1 };
const STAR2 = { inst: 'bell', line: '1 2 3 2 1 2 3 2', tier: 2, vel: 0.7 };
const STAR3 = { inst: 'choir', tier: 3, vel: 0.8 };

const chorus = {
  bars: 8,
  chords: 'I',
  parts: [
    STAR1, STAR2, STAR3,
    { inst: 'choir', when: 'big', vel: 0.5 },
    { role: 'a', notes: '7! _ _ 5 4 _ . . | 5! _ _ 4 2 _ . . | 4! _ 5 _ 7 _ 5 _ | 4! _ _ _ 2 _ . . | 7! _ _ 5 4 _ . . | 8! _ _ 7 5 _ . . | 9! _ 8 _ 7 _ 5 _ | 7! _ _ _ _ _ . .' },
    { role: 'b', notes: '. . . . 2! 4 5 4 | . . . . . . . . | . . . . 4! 5 7 5 | . . . . . . . . | . . . . 2! 4 5 4 | . . . . . . . . | . . . . 4! 5 7 5 | . . . . . . . .' },
    { role: 'c', notes: '0 . . . . . . . | 4 . . . 4! . 4 . | 5 . . . . . . . | 4 . . . 4! . 4 4 | 0 . . . . . . . | 4 . . . 4! . 4 . | 5 . . . . . . . | 0 . . . . . . .' },
  ],
};

export default {
  id: 'hus',
  name: 'Ljósahús',
  bpm: 125.997,
  root: 'G',
  scale: 'major',
  backing: { src: 'audio/sloedla/el-house.mp3', beatOffset: 0.0256, gain: 0.55 },
  form: ['intro', 'vers', 'vidlag', 'vers', 'vidlag', 'bru', 'lokavidlag', 'endir'],
  sections: {
    intro: {
      bars: 4,
      chords: 'I',
      fixed: true,
      parts: [
        { role: 'a', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | 4! _ _ _ 2 _ . .' },
        { role: 'b', notes: '0 . 4 . 7 . 4 . | 0 . 4 . 7 . 4 . | . . . . 7! . 5 . | . . . . . . . .' },
        { role: 'c', notes: '. . . . . . . . | . . . . . . . . | 0! . . . . . . . | . . . . . . . .' },
      ],
    },
    vers: {
      bars: 8,
      chords: 'I',
      parts: [
        STAR1, STAR2, STAR3,
        { role: 'a', notes: '. . . . 4! _ 2 1 | 0! _ _ _ . . . . | . . . . 5! _ 4 2 | 4 _ . . . . . . | . . . . 4! _ 5 7 | 5! _ 4 _ 2 _ . . | . . . . 1! _ 2 4 | 2 _ _ _ . . . .' },
        { role: 'b', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | 4! . 2 . 4! . 5 . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 4! . 5 . 7 . . .' },
        { role: 'c', notes: '0! . . . . . . . | . . . . 0 . 0 . | 5! . . . . . . . | . . . . 4 . . . | 0! . . . . . . . | . . . . 5 . 5 . | 4! . . . . . . . | 4 . . . 4 . 4 4' },
      ],
    },
    vidlag: chorus,
    bru: {
      bars: 8,
      chords: 'I',
      parts: [
        STAR1, STAR2, STAR3,
        { role: 'a', notes: '4! _ _ _ _ _ _ _ | 5! _ _ _ _ _ . . | 7! _ _ _ 5 _ . . | 4! _ _ _ _ _ _ _ | . . . . . . . . | 5! _ 4 _ . . . . | . . . . . . . . | 7! _ _ _ 5 _ 7 _' },
        { role: 'b', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 4! 5 7 5 4 5 7 5 | . . . . . . . . | 2! 4 5 4 2 4 5 4 | . . . . . . . .' },
        { role: 'c', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . 0! . . . | . . . . 5! . . . | . . . . 4! . 4 . | 4 . 4 . 4! 4 4 4' },
      ],
    },
    lokavidlag: chorus,
    endir: {
      bars: 4,
      chords: 'I',
      fixed: true,
      parts: [
        STAR3,
        { role: 'a', notes: '7! _ _ _ 5 _ 4 _ | 5! _ _ _ . . . . | 7! _ _ _ _ _ _ _ | _ _ _ _ _ _ . .' },
        { role: 'b', notes: '. . . . . . . . | . . . . 4! 5 7 . | . . . . . . . . | . . . . . . . .' },
        { role: 'c', notes: '0 . . . . . . . | 4 . . . . . . . | 0 . . . 0! . . . | 0! . . . . . . .' },
      ],
    },
  },
};
