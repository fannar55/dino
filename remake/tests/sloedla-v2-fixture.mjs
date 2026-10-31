// A small song in the v2 format of Slóeðla's song game (engine/sloedla/v2), for the tests: 120 bpm, C major, one minute, two
// recorded stems owned by Kambeðla and Þórseðla, one of the song's own, Slóeðla's composed tune and a star layer.
//   intro 2 bars (beats 0-8), vers 8 (8-40), kor 8 (40-72), vers 8 (72-104), endir 4 (104-120)
// The child's notes (barn) take turns every two beats: Slóeðla's marks on beat 8k, Þórseðla on 8k+2 and 8k+6, Kambeðla on 8k+4.

const turns = (from, to, step, at) => {
  const beats = [];
  for (let k = from; k <= to; k++) for (const d of at) beats.push(k * step + d);
  return beats;
};

export function makeSong(change = {}) {
  const barn = [
    ...turns(1, 12, 8, [2, 6]).map(beat => ({ beat, owner: 'c', layer: 'trommur' })),
    ...turns(1, 12, 8, [4]).map(beat => ({ beat, owner: 'b', layer: 'bassi' })),
  ].sort((x, y) => x.beat - y.beat);
  const fullordinn = [
    ...turns(1, 12, 8, [1, 3, 5, 7]).map(beat => ({ beat, owner: 'c', layer: 'trommur', dur: 0.25 })),
    ...turns(1, 12, 8, [2, 6]).map(beat => ({ beat, owner: 'b', layer: 'bassi' })),
  ].sort((x, y) => x.beat - y.beat);
  return {
    version: 2,
    id: 'profun',
    name: 'Prófun',
    tempo: { bpm: 120, offset: 0.03 },
    key: { root: 'C', scale: 'major' },
    sections: [
      { name: 'intro', bars: 2, fixed: true },
      { name: 'vers', bars: 8 },
      { name: 'kor', bars: 8 },
      { name: 'vers', bars: 8 },
      { name: 'endir', bars: 4, fixed: true },
    ],
    instruments: { blip: () => () => {} },
    layers: [
      { id: 'trommur', owner: 'c', stem: 'drums.mp3' },
      { id: 'bassi', owner: 'b', stem: 'bass.mp3', gain: 1.1 },
      {
        id: 'lag', owner: 'a', part: {
          instrument: 'blip', octave: 1, sections: {
            vers: '0! _ 2 . 4 . 2 . | 5 _ 4 . 2 . 0 .',
            kor: '4! _ 5 . 4 . 2 . | 0 _ _ _ . . . .',
            'kor/big': '7! _ 5 . 4 . 5 . | 4 _ _ _ . . . .',
          },
        },
      },
      { id: 'grunnur', owner: null, stem: 'other.mp3' },
      { id: 'glimmer', owner: null, tier: 2, part: { instrument: 'blip', octave: 2, sections: { kor: '4 . 5 . 7 . 5 .' } } },
    ],
    chart: { barn, fullordinn },
    ...change,
  };
}
