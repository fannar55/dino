// "Rokkhopp": a rock-and-roll boogie for kids, a song of the new kind (v2/format.js) made only of a recording: an ElevenLabs Music
// track (tools/sloedla-music.mjs preset boogie, 2026-10-30) split into stems. A trio, each of them a dinosaur's:
//   Slóeðla (a)   the boogie-woogie piano: it starts the song alone, rolling
//   Kambeðla (b)  the upright double bass, walking
//   Þórseðla (c)  the drums, swinging, a backbeat on two and four
// The child's notes are read from the stems (tools/sloedla-stem-chart.mjs: boogie.chart.js). A recording cannot change key, so
// the last verse plays big without a lift, and the song has no star layers: a run is heard in the claps, the crowd and the DJ.
//
// 150 bpm (measured 149.999, steady to 2.6 ms), C major; the first beat is 0.0305 s into the stems.
//   intro 4 (the piano alone) | vers 12 | vers 12 | bru 8 (stop-time) | lokavers 12 | endir 4

import chart from './boogie.chart.js';

export default {
  version: 2,
  id: 'boogie',
  name: 'Rokkhopp',
  tempo: { bpm: 150, offset: 0.0305 },
  key: { root: 'C', scale: 'major' },
  sections: [
    { name: 'intro', bars: 4, fixed: true },
    { name: 'vers', bars: 12 },
    { name: 'vers', bars: 12 },
    { name: 'bru', bars: 8 },
    { name: 'lokavers', bars: 12 },
    { name: 'endir', bars: 4, fixed: true },
  ],
  instruments: {},
  layers: [
    { id: 'piano', owner: 'a', stem: 'piano.mp3' },
    { id: 'kontrabassi', owner: 'b', stem: 'bass.mp3' },
    { id: 'trommur', owner: 'c', stem: 'drums.mp3' },
  ],
  chart,
};
