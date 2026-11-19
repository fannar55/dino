// Round two: the other records in her crate (ElevenLabs Music at 125 bpm, made for this game), measured with measure-records.mjs
// and measure-notes.mjs before anything was built on them. None has stems: each plays whole, as one stereo channel of the band.
//
// Every record's grid was measured from its hats and snare: beat k at 26-27 ms + k * 0.48 s, steady to the end (12 s windows),
// like the first track's 27.2 ms; bar 1 is on that first beat (the chords change there). The two shifted by rubberband read 3 ms
// earlier after the shift (its transient handling), so their beat 0 is 24.2 ms.
//
// Their notes (sharp spectral peaks, measure-notes.mjs), against the animals' A B C# E F#:
//   fonk      bass E and D, mids D G C# B E F# A (and a bent blue note near C): the notes of D major, the same as the first track's
//             E Dorian vamp; no shift. (Asked as one A7 chord; its downbeat is 27 ms like the rest, not -213 ms.)
//   slagverk  percussion only; no shift.
//   rolegt    A major (A B C# D E F# G#: Amaj7 and its neighbours, no drums); no shift.
//   vidlag    A Dorian: Am | D | C | G (C and F# natural, so C clashes with the frogs' C#); +2 semitones makes it B Dorian, the notes
//             of A major: Bm | E | D | A. Its hook plays from bar 8 (bars 0-7 are a softer intro), with a rest in the second half of
//             every second bar of its four.
//   song-3    A Dorian too: Am | D | Em | C, Am | D | G | C from bar 8 (bars 0-7 its quiet percussion intro); +2 semitones:
//             Bm | E | F#m | D. Its "G#" bass is no note: a broad drum lump at 48-68 Hz.
// The shifts are rubberband's (pitch-quality, crisp transients), made once into work/records/ and reused.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { decode } from './io.mjs';

const V2 = 'remake/assets/audio/sloedla/v2';
export const RECORDS = {
  fonk: { file: `${V2}/djamm-fonk/song.mp3`, t0: 0.0272, shift: 0, trimDb: 0.9, to: 'music', what: 'heavy half-time funk (snare on 3)' },
  slagverk: { file: `${V2}/djamm-slagverk/song.mp3`, t0: 0.0272, shift: 0, trimDb: 0, to: 'drums', what: 'percussion alone' },
  rolegt: { file: `${V2}/djamm-rolegt/song.mp3`, t0: 0.0272, shift: 0, trimDb: -1, to: 'music', what: 'quiet electric piano and strings, no drums' },
  vidlag: { file: `${V2}/djamm-vidlag/song.mp3`, t0: 0.0242, shift: 2, trimDb: 1.1, to: 'music', what: 'the chorus with its brass hook' },
  song3: { file: `${V2}/djamm/song-3.mp3`, t0: 0.0242, shift: 2, trimDb: 0.4, to: 'music', what: 'carnival samba' },
};
export const REC_NAMES = Object.keys(RECORDS);

/** A record as { L, R }, shifted when it asks to be (cached as a 32-bit wav under `work`). */
export function loadRecord(ROOT, name, work) {
  const r = RECORDS[name];
  let file = join(ROOT, r.file);
  if (r.shift) {
    mkdirSync(work, { recursive: true });
    const out = join(work, `${name}${r.shift > 0 ? '+' : ''}${r.shift}.wav`);
    if (!existsSync(out)) {
      const ratio = (2 ** (r.shift / 12)).toFixed(9);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-af', `rubberband=pitch=${ratio}:pitchq=quality:transients=crisp:detector=percussive:phase=independent:window=standard:channels=together`, '-ar', '44100', '-c:a', 'pcm_f32le', out]);
    }
    file = out;
  }
  const [L, R] = decode(file, 2);
  const g = 10 ** (r.trimDb / 20);
  for (let i = 0; i < L.length; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  return { L, R };
}
