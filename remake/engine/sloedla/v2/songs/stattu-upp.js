// "Stattu upp": a song by Egill's dad, as he released it (the owner gave it 2026-10-30), a song of the new kind (v2/format.js).
// The release was split into stems by ElevenLabs (vocals, drums, bass, guitar, piano, other), which come 1105 samples (25.06 ms, an
// mp3 encoder's delay) after the release; the guitar, the piano, the synths and the rest (the release minus the six stems, so that
// nothing of it is lost) are mixed into one, lagid.mp3, since they always play together. The four together are the release
// (32 dB under it). Each of three is a dinosaur's:
//   Slóeðla (a)   the singing: she sings his song, and the child's notes are the words' first sounds; a voice (format.js):
//                 a hit does not push it up, only a few misses in a row muffle it
//   Kambeðla (b)  the bass
//   Þórseðla (c)  the drums
// The child's notes are read from the stems (tools/sloedla-stem-chart.mjs: stattu-upp.chart.js). Four files, not seven: a tablet
// decodes every stem whole (about 60 MB each), and the song's own never come apart.
//
// 130 bpm (measured on the release: 130.000), E major; the first beat is 0.1645 s into the stems (0.1394 s into the release).
//   inngangur 8 (the singing and a piano) | uppbygging 4 | vers 8 | drop 8 (no singing) | vers 12 | hle 4 | vidlag 8 |
//   brot 8 (the singing and the drums) | vers 12 | hle 4 | vidlag 12 | endir 8 (down to the singing alone)

import chart from './stattu-upp.chart.js';

export default {
  version: 2,
  id: 'stattu-upp',
  name: 'Stattu upp',
  tempo: { bpm: 130, offset: 0.1645 },
  key: { root: 'E', scale: 'major' },
  gain: 0.63, // -4 dB: the release is mastered loud (-13 LUFS in the game against -17 for the other songs)
  sections: [
    { name: 'inngangur', bars: 8, fixed: true },
    { name: 'uppbygging', bars: 4 },
    { name: 'vers', bars: 8 },
    { name: 'drop', bars: 8 },
    { name: 'vers', bars: 12 },
    { name: 'hle', bars: 4 },
    { name: 'vidlag', bars: 8 },
    { name: 'brot', bars: 8 },
    { name: 'vers', bars: 12 },
    { name: 'hle', bars: 4 },
    { name: 'vidlag', bars: 12 },
    { name: 'endir', bars: 8, fixed: true },
  ],
  instruments: {},
  layers: [
    { id: 'songur', owner: 'a', stem: 'vocals.mp3', voice: true }, // his voice: never pushed up at a hit, only a few misses muffle it
    { id: 'bassi', owner: 'b', stem: 'bass.mp3', accent: 5 },
    { id: 'trommur', owner: 'c', stem: 'drums.mp3', accent: 2.5 },
    { id: 'lagid', owner: null, stem: 'lagid.mp3' },
  ],
  chart,
};
