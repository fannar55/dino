// djamm-1: "Stóra sviðið" rebuilt on the real disco-funk track (remake/assets/audio/sloedla/v2/djamm). The music is the band's
// own six stems, re-arranged bar by bar like a DJ would (mutes, filters, beat repeats, rolls cut from its own drums, a last hit);
// the animals and her horn sing over it in the track's own key. Everything is placed in beats on one grid: 125 bpm, beat 0 at
// 0 s, 21168 samples a beat. The track's own grid: its beat k sits at 27.2 ms + k * 0.48 s in song.mp3 (the stems are 1105 samples
// later: their encoder delay), measured by measure-track.mjs and measure-detail.mjs.
//
// The track (measured): an 8-bar cycle Em7 | A7 | Em7 | A7 | Em7 | A7 | Bm7 | A7 from bar 8 to bar 95 (E Dorian = A Mixolydian:
// the notes of D major); bars 0-7 are its drums alone (muffled); "other" (brass and strings) is in from bar 48 only; bar 96 is its
// last hit, and it fades out after it. The animals sing A major pentatonic, which has no note that clashes with any of the four
// chords: grazers A, turtles B, frogs C#, lizards E, flyers F# (do re mi so la). Her tune keeps its degrees; started on the first
// or the fifth bar of the cycle its last "do" lands on an A7 bar.
//
// Round two (the owner: "allt mjög gott", more juice, not the same 8 bars for three minutes): she plays more records from her crate
// (records.mjs: a half-time funk for the turtles and frogs, percussion for the beetles and the crowd, a quiet bed under her horn,
// a carnival samba, the chorus with its brass hook, the last two moved up 2 semitones into A major) and changes them in the open
// (a scratch, a filter, an echo throw, a freeze, a spin-back); a real crowd and the DJ's sounds are in their own stem (fx.mjs);
// new moments: the spin-back and "Aftur!" after the drop, Stoppdans, "Egill, segðu já!", a fake ending, her horn answering the
// band in the last chorus.
import { rng } from './dsp.mjs';

export const BPM = 125;
export const SPB = 21168;
export const KEY = 'A major pentatonic over the band\'s Em7-A7 vamp (E Dorian / A Mixolydian) and records in D and A major, A4 = 440';

export const TONE = { grazers: 69, turtles: 71, frogs: 73, lizards: 76, flyers: 78 };
export const GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];

export const TUNE = [
  ['lizards', 'frogs'],
  ['turtles', 'frogs', 'grazers'],
  ['flyers', 'lizards', 'frogs', 'lizards'],
  ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'],
];
export const TUNE_AT = [[0, 1.5], [8, 9.5, 11], [16, 17.5, 19, 20], [24, 25.5, 27, 27.5, 28]];
export const TUNE_LEN = [[1.5, 2.5], [1.5, 1.5, 2], [1.5, 1.5, 1, 2], [1.5, 1.5, 0.5, 0.5, 3]];

// The night, in bars (4 beats each). `record` is what she plays there ('vamp' = the first track's stems).
export const SECTIONS = [
  { id: 'arrival', name: 'Arrival', nameIs: 'Komið öll', bar: 0, bars: 4, feature: null, record: 'vamp',
    what: 'the band heard from far away behind the trees (low-passed, opening up), far calls of every group' },
  { id: 'welcome', name: 'Welcome', nameIs: 'Velkomin', bar: 4, bars: 4, feature: 'flugedla', record: 'vamp',
    what: 'she swoops in and lands; the band without its drums under her welcome; the forest answers on its tones; the drum fill into the warm-up' },
  { id: 'warmup', name: 'Warm-up', nameIs: 'Upphitun', bar: 8, bars: 8, feature: 'flugedla', record: 'vamp',
    what: 'the whole band in (no brass yet), the crowd claps along on 2 and 4; a build: high-pass sweep, a snare roll cut from its own drums, a riser, a half-beat gap' },
  { id: 'groove', name: 'Dance floor', nameIs: 'Dansgólfið', bar: 16, bars: 8, feature: null, record: 'vamp',
    what: 'the band flat out, nothing on top: the loop (beats 64-96)' },
  { id: 'tuneA', name: 'Her song', nameIs: 'Lagið hennar', bar: 24, bars: 8, feature: null, record: 'vamp',
    what: 'the animals sing her tune; guitar and keys a little back' },
  { id: 'grazers', name: 'Grazers', nameIs: 'Grasbítarnir', bar: 32, bars: 4, feature: 'grazers', record: 'vamp',
    what: 'drums and bass with the guitar far back: the grazers stomp and sing, her wings on the stomps; in the last bar the band sinks into a low-pass and she scratches in the next record' },
  { id: 'turtles', name: 'Turtles', nameIs: 'Skjaldbökurnar', bar: 36, bars: 4, feature: 'turtles', record: 'fonk',
    what: 'a new record, the heavy half-time funk: two slow bars, then two fast ones (each beat\'s first eighth twice: double time)' },
  { id: 'frogs', name: 'Frogs', nameIs: 'Froskarnir', bar: 40, bars: 4, feature: 'frogs', record: 'fonk',
    what: 'the funk: the frogs hop on the off-beats, "frosk- frosk- froskadjamm!"; its last beat thrown into the echo' },
  { id: 'lizards', name: 'Small lizards', nameIs: 'Litlu eðlurnar', bar: 44, bars: 4, feature: 'lizards', record: 'vamp',
    what: 'back on the first record, its drums high-passed (hats and snare), bass back: quick lizard chirps; the brass pickup into the flyers' },
  { id: 'flyers', name: 'Small flyers', nameIs: 'Litlu flugdýrin', bar: 48, bars: 4, feature: 'flyers', record: 'vamp',
    what: 'the brass and strings come in for the first time; the bass thinned: long flyer whistles; a scratch into the beetles\' record' },
  { id: 'beetles', name: 'Beetles', nameIs: 'Bjöllurnar', bar: 52, bars: 4, feature: 'beetles', record: 'slagverk',
    what: 'a record of percussion alone: the beetles play it' },
  { id: 'dragonflies', name: 'Dragonflies', nameIs: 'Drekaflugurnar', bar: 56, bars: 2, feature: 'dragonflies', record: 'vamp',
    what: 'the first record\'s drums and strings, the dragonflies buzz past the stage; its last beat thrown into the echo' },
  { id: 'break', name: 'Her horn', nameIs: 'Hornið hennar', bar: 58, bars: 8, feature: 'sloedla', record: 'rolegt',
    what: 'a quiet record of electric piano and strings in a big room under her horn; a muffled kick creeps in; a reverse cymbal into the build' },
  { id: 'rise', name: 'The build', nameIs: 'Upp með vængina', bar: 66, bars: 8, feature: 'flugedla', record: 'vamp',
    what: 'no bass; the drums, then a roll of their own snare (eighths, sixteenths, thirty-seconds), high-pass sweep and riser; the countdown answered by the groups; one beat of near silence, a reverse cymbal' },
  { id: 'drop', name: 'The big drop', nameIs: 'NÚ!', bar: 74, bars: 2, feature: 'all', record: 'vamp',
    what: 'the whole band with brass and strings, an impact with a deep sub, the crowd and the children cheering, every group at once' },
  { id: 'rewind', name: 'Rewind', nameIs: 'Aftur!', bar: 76, bars: 1, feature: 'flugedla', record: 'vamp',
    what: 'she pulls the record back (a spin-back of what was just played) and shouts "Aftur!"; a reverse cymbal' },
  { id: 'redrop', name: 'The drop again', nameIs: 'Aftur!', bar: 77, bars: 4, feature: 'all', record: 'vamp',
    what: 'the drop again from its first beat, with the air horn: louder than anywhere else' },
  { id: 'anthem', name: 'Anthem', nameIs: 'Öll saman', bar: 81, bars: 8, feature: 'all', record: 'vamp',
    what: 'everyone sings her tune (each note doubled), her horn echoes it' },
  { id: 'freeze', name: 'Freeze dance', nameIs: 'Stoppdans', bar: 89, bars: 4, feature: 'turtles', record: 'vamp',
    what: '"Stoppdans! Allir dansa!": two bars of the band, then "Stopp!": a tape stop and everything freezes; "Ha ha! Skjaldbakan hreyfði sig!", the children laugh; "Dansa!"' },
  { id: 'carnival', name: 'Carnival', nameIs: 'Kjötkveðjuhátíð', bar: 93, bars: 8, feature: 'all', record: 'song3',
    what: 'everything slams back on a new record, the carnival samba: the crowd claps on 2 and 4, children shout, the flyers blow samba whistles, "Hopp!"' },
  { id: 'crowd', name: 'The crowd', nameIs: 'Egill, segðu já!', bar: 101, bars: 4, feature: 'flugedla', record: 'slagverk',
    what: 'the percussion alone: "Egill, segðu já!", a gap for him, then the forest and the children answer; "Hærra!", and a bigger answer; a roll' },
  { id: 'fakeend', name: 'The end?', nameIs: 'Búið?', bar: 105, bars: 2, feature: null, record: 'vamp',
    what: 'the band\'s last hit, ringing, the crowd applauding: it sounds like the end; "Einu sinni enn!", the drum fill, a reverse cymbal' },
  { id: 'lastchorus', name: 'Last chorus', nameIs: 'Einu sinni enn', bar: 107, bars: 8, feature: 'all', record: 'vidlag',
    what: 'the chorus record with its brass hook: everyone sings her tune, her horn answers the band in the gaps of its hook and joins the last note' },
  { id: 'end', name: 'Goodnight', nameIs: 'Góða nótt', bar: 115, bars: 4, feature: 'all', record: 'vamp',
    what: 'band stabs under the last phrase, everyone on their tones, the band without drums under her goodnight, a drum fill, the last hit (beat 472), its ring and the crowd' },
];
export const LOOP = { startBeat: 64, beats: 32 }; // out bars 16-23 = the track's bars 24-31, one whole chord cycle, band only
export const END_BEAT = 472;
export const TAIL_SEC = 3.4;
// the beats the music drops onto from (near) silence: each one's jump is measured and stated
export const DROPS = [{ beat: 64, what: 'dance floor' }, { beat: 296, what: 'the big drop' }, { beat: 308, what: 'the drop again' }, { beat: 372, what: 'the carnival slam after the freeze' }, { beat: 428, what: 'the last chorus after the fake ending' }];

export function sectionAt(beat) {
  let s = SECTIONS[0];
  for (const x of SECTIONS) if (beat >= x.bar * 4) s = x;
  return s;
}

// Her lines (beat = where the first syllable's attack lands; align 'vowel' puts the first vowel there instead).
export const DJ = [
  { id: 'welcome', beat: 16, echo: 'last', duck: 2, lift: 4 },
  { id: 'egill', beat: 32, radio: true, duck: 3 },
  { id: 'clap', beat: 40, echo: 'last', duck: 3 },
  { id: 'party-on', beat: 60.5, stutter: 2, duck: 3 },
  { id: 'grazers', beat: 128, echo: 'last', duck: 3 },
  { id: 'turtles-slow', beat: 144, radio: true, duck: 2, lift: 2.5 },
  { id: 'turtles-fast', beat: 152, echo: 'last', duck: 3 },
  { id: 'frogs', beat: 160, stutterWord: true, echo: 'last', duck: 3 },
  { id: 'lizards', beat: 176, duck: 3 },
  { id: 'flyers', beat: 192, echo: 'last', duck: 3 },
  { id: 'beetles', beat: 208, echo: 'last', duck: 3 },
  { id: 'dragonflies', beat: 224, duck: 3 },
  { id: 'sloedla', beat: 227.5, echo: 'last', duck: 3 },
  { id: 'wings', beat: 264, duck: 3 },
  { id: 'hear-you', beat: 272, echo: 'last', duck: 3 },
  { id: 'count-5', beat: 286, duck: 3 },
  { id: 'count-4', beat: 288, duck: 3 },
  { id: 'count-3', beat: 290, duck: 3 },
  { id: 'count-2', beat: 292, duck: 3 },
  { id: 'count-1', beat: 294, duck: 3 },
  { id: 'now', beat: 296, align: 'vowel', echo: 'last', duck: 3, lift: 8, ceil: 8 },
  { id: 'aftur', beat: 306, align: 'vowel', echo: 'last', duck: 3, lift: 6, ceil: 7 },
  { id: 'laugh', beat: 312, echo: 'last', duck: 3, ceil: 7 },
  { id: 'all', beat: 321.5, duck: 3, ceil: 7 },
  { id: 'freeze-in', beat: 356.5, duck: 3, ceil: 6 },
  { id: 'stopp', beat: 364, align: 'vowel', echo: 'last', duck: 3, ceil: 6 },
  { id: 'turtle-moved', beat: 366.5, duck: 2, ceil: 5 },
  { id: 'dansa', beat: 371, duck: 3, ceil: 6 },
  { id: 'allir-saman', beat: 376, echo: 'last', duck: 3, ceil: 6 },
  { id: 'hopp', beat: 390, duck: 3 },
  { id: 'hopp', key: 'hopp-2', beat: 398, echo: 'last', duck: 3 },
  { id: 'egill-yes', beat: 404, duck: 3, ceil: 6 },
  { id: 'louder', beat: 414, echo: 'last', duck: 3, ceil: 6 },
  { id: 'one-more', beat: 424.5, echo: 'last', stutter: 2, duck: 3, ceil: 6 },
  { id: 'goodnight', beat: 465, echo: 'last', duck: 2, lift: 3 },
];

// ================================================================ the band: which bar of the track each bar plays, and the DJ's hands
export const STEMS = ['drums', 'bass', 'guitar', 'other', 'piano', 'vocals'];
const MUSIC = ['guitar', 'other', 'piano', 'vocals'];
const ALL = STEMS;
const OFF = -Infinity;

export function buildBand() {
  const bars = new Array(120).fill(null);
  const put = (out, src, count) => {
    for (let k = 0; k < count; k++) bars[out + k] = src + k;
  };
  put(0, 8, 4); // arrival: cycle bars 1-4
  put(4, 12, 4); // welcome: 5-8
  put(8, 16, 8); // warm-up
  put(16, 24, 8); // dance floor (the loop)
  put(24, 32, 8); // her song
  put(32, 40, 4); // grazers
  put(44, 44, 4); // lizards (bar 47 has the brass pickup into bar 48)
  put(48, 48, 4); // flyers: brass and strings in
  put(56, 54, 2); // dragonflies
  put(66, 64, 8); // the build
  put(74, 72, 2); // the drop
  put(77, 72, 4); // the drop again, from its first bar
  put(81, 76, 8); // anthem
  put(89, 84, 3); // freeze dance: two bars and the beat that stops
  put(115, 88, 3); // goodnight: Em7 A7 Em7; bar 118 is the last hit only
  const srcOf = o => 4 * bars[Math.floor(o / 4)] + (o - 4 * Math.floor(o / 4));

  const B = { bars, recs: [], over: [], gain: {}, lp: {}, hp: {}, verb: [], echo: [], riser: [], rewind: [], tapestop: [] };
  const CHANNELS = [...STEMS, 'fonk', 'slagverk', 'rolegt', 'vidlag', 'song3'];
  for (const s of CHANNELS) {
    B.gain[s] = [[-1, 0]];
    B.lp[s] = [];
    B.hp[s] = [];
  }
  const cur = Object.fromEntries(CHANNELS.map(s => [s, 0]));
  // a level change on a bar line or beat: ramp in the 11 ms just before it (the new bar's own pre-attack stays whole)
  const set = (stems, beat, db) => {
    for (const s of stems) {
      const g = B.gain[s], last = g[g.length - 1];
      if (last[0] === beat - 0.012) last[1] = db; // a second change on the same beat replaces the first
      else g.push([beat - 0.035, cur[s]], [beat - 0.012, db]);
      cur[s] = db;
    }
  };
  // a slow level move from one beat to another (it starts with a step to db0 like set())
  const ramp = (stems, from, to, db0, db1) => {
    set(stems, from, db0);
    for (const s of stems) {
      B.gain[s].push([to, db1]);
      cur[s] = db1;
    }
  };
  const lp = (stems, from, to, f0, f1) => stems.forEach(s => B.lp[s].push({ from, to, f0, f1 }));
  const hp = (stems, from, to, f0, f1) => stems.forEach(s => B.hp[s].push({ from, to, f0, f1 }));
  // an override: these stems play source beat `s` from out beat `o` for `n` beats (beat repeats, rolls, hits)
  const over = (stems, o, n, s, o2 = {}) => B.over.push({ stems, o, n, s, g: o2.g ?? 1, hold: o2.hold, tau: o2.tau, fade: o2.fade });
  // a record played from its own bar `src` at out bar `out` for `count` bars
  const rec = (name, out, src, count, o2 = {}) => B.recs.push({ rec: name, o: 4 * out, n: 4 * count, s: 4 * src, ...o2 });

  // -------- arrival (0-16): far away, opening up
  ramp(ALL, 0, 15.9, -9, -4);
  lp(ALL, 0, 16, 260, 2200);
  // -------- welcome (16-32): the band without drums; the drums come in on the fill at beat 30
  set(ALL, 16, 0);
  set(['drums'], 16, OFF);
  set(['drums'], 30, 0);
  // -------- warm-up (32-64), with its build in bars 14-15
  set(ALL, 32, 0);
  hp(['bass', ...MUSIC], 56, 63.5, 20, 320);
  hp(['drums'], 60, 63.5, 20, 220);
  // the snare roll: the backbeat hit of the track's bar 17 (kick, snare, hats), eighths then sixteenths
  const ROLL = 4 * 17 + 1;
  for (let b = 60; b < 62; b += 0.5) over(['drums'], b, 0.5, ROLL, { g: 0.55 + 0.1 * (b - 60) });
  for (let b = 62; b < 63.5; b += 0.25) over(['drums'], b, 0.25, ROLL, { g: 0.75 + 0.12 * (b - 62) });
  set(ALL, 63.5, OFF);
  B.riser.push({ beat: 48, beats: 15.5, vel: 0.22 });
  // -------- dance floor (64-96): flat out, nothing else
  set(ALL, 64, 0);
  // -------- her song (96-128)
  ramp(['guitar'], 96, 96.5, 0, -4);
  ramp(['other', 'piano'], 96, 96.5, 0, -6);
  ramp(['vocals'], 96, 96.5, 0, -3);
  // -------- grazers (128-144): drums and bass, the guitar far back; the last bar sinks into a low-pass
  set(['bass'], 128, 0);
  set(['guitar'], 128, -9);
  set(['other', 'piano', 'vocals'], 128, OFF);
  lp(['drums', 'bass', 'guitar'], 140, 144, 9000, 380);
  set(['drums', 'bass', 'guitar'], 144, OFF);
  // -------- turtles (144-160) on the funk record: two slow bars (it is half-time already), two fast ones
  // the funk comes in under the low-passed band on the last two beats, from below (a high-pass opening), then whole on 144
  rec('fonk', 35.5, 7.5, 0.5);
  hp(['fonk'], 142, 144, 1800, 40);
  ramp(['fonk'], 142, 143.9, -10, -3);
  set(['fonk'], 144, 0);
  rec('fonk', 36, 8, 2);
  for (let b = 152; b < 160; b += 0.5) B.recs.push({ rec: 'fonk', o: b, n: 0.5, s: 4 * 10 + Math.floor(b - 152) }); // each beat's first eighth twice
  // -------- frogs (160-176): the funk on; its last beat into the echo as she changes back
  rec('fonk', 40, 12, 4);
  B.echo.push({ stems: ['fonk'], from: 175, to: 176, fb: 0.5, send: 0.6 });
  set(['fonk'], 176, OFF);
  // -------- lizards (176-192): the first record again, its drums high-passed, the bass back
  set(['drums', 'bass', 'guitar', 'other', 'piano', 'vocals'], 176, 0);
  hp(['drums'], 176, 190, 450, 450);
  set(['bass'], 176, -3);
  set(['guitar'], 176, -3);
  set(['piano'], 176, -6);
  set(['other'], 176, OFF);
  set(['other'], 188, 0); // the brass pickup in the track's bar 47
  // -------- flyers (192-208): brass and strings in; the last beat into a big room as the beetles' record comes in
  set(['drums'], 192, -2);
  set(['bass'], 192, -4);
  hp(['bass'], 192, 208, 90, 90);
  set(['guitar'], 192, -3);
  set(['other'], 192, 1);
  set(['piano', 'vocals'], 192, 0);
  B.verb.push({ stems: ['other', 'guitar', 'piano'], from: 207, to: 208, send: 0.5 });
  set(ALL, 208, OFF);
  // -------- beetles (208-224): percussion alone
  rec('slagverk', 52, 4, 4);
  // -------- dragonflies (224-232): drums and strings
  set(['drums'], 224, 0);
  set(['other'], 224, -2);
  set(['guitar'], 224, -8);
  hp(['drums'], 224, 231, 20, 120);
  // the drums' last beat thrown into the echo as the band leaves for her horn
  B.echo.push({ stems: ['drums'], from: 231, to: 232, fb: 0.5, send: 0.6 });
  set(ALL, 232, OFF);
  // -------- her horn (232-264): the quiet record in a big room; a muffled kick of the first record creeps in at the end
  rec('rolegt', 58, 4, 8);
  B.verb.push({ stems: ['rolegt'], from: 231.5, to: 264, send: 0.45 });
  lp(['rolegt'], 232, 264, 5200, 5200);
  ramp(['rolegt'], 258, 263.9, 0, -5);
  set(['rolegt'], 264, OFF);
  for (let b = 256; b < 264; b++) over(['drums'], b, 1, 4 * 60 + (b % 4)); // the first record's drums (bar 60) under it
  ramp(['drums'], 256, 263.9, -16, -7);
  lp(['drums'], 256, 264, 140, 140);
  // -------- the build (264-296): no bass; drums, then the roll; high-pass sweep; one beat of near silence before the drop
  set(['drums'], 264, -1);
  set(['bass'], 264, OFF);
  set(['guitar', 'other', 'piano', 'vocals'], 264, -2);
  lp(MUSIC, 264, 280, 900, 6000);
  hp(MUSIC, 280, 295.5, 20, 450);
  ramp(MUSIC, 286, 295.4, -2, -6);
  hp(['drums'], 276, 295.5, 20, 260);
  const ROLL2 = 4 * 65 + 1;
  for (let b = 280; b < 288; b += 0.5) over(['drums'], b, 0.5, ROLL2, { g: 0.5 + 0.015 * (b - 280) });
  for (let b = 288; b < 292; b += 0.25) over(['drums'], b, 0.25, ROLL2, { g: 0.6 + 0.02 * (b - 288) });
  for (let b = 292; b < 295.5; b += 0.125) over(['drums'], b, 0.125, ROLL2, { g: 0.68 + 0.02 * (b - 292) });
  set(ALL, 295.5, OFF);
  B.riser.push({ beat: 264, beats: 31, vel: 0.28 });
  // -------- the drop (296-304)
  set(ALL, 296, 0);
  set(['drums', 'bass'], 296, 1.5);
  set(['other'], 296, 1);
  // -------- the rewind (304-308): she pulls the record back; silence; the drop again on 308
  B.rewind.push({ beat: 304, sec: 0.62, accel: 7 });
  set(ALL, 304.05, OFF);
  // -------- the drop again (308-324), hotter
  set(ALL, 308, 0);
  set(['drums', 'bass'], 308, 1.5);
  set(['other'], 308, 1);
  // -------- anthem (324-356)
  set(['drums', 'bass'], 324, 0);
  set(['guitar', 'other', 'piano'], 324, -3);
  // -------- freeze dance (356-372): the band, then "Stopp!" on 364: a tape stop, silence until the slam on 372
  set(['guitar', 'other', 'piano'], 356, -2);
  B.tapestop.push({ beat: 364, sec: 0.55 });
  set(ALL, 364.62, OFF);
  // -------- carnival (372-404): the samba record, slammed in
  rec('song3', 93, 24, 8);
  lp(['song3'], 400, 404, 12000, 900);
  set(['song3'], 404, OFF);
  // -------- the crowd (404-420): percussion alone; a roll of its own hits into the fake ending
  rec('slagverk', 101, 12, 3);
  for (let b = 416; b < 418; b += 0.5) B.recs.push({ rec: 'slagverk', o: b, n: 0.5, s: 4 * 15, g: 0.7 + 0.08 * (b - 416) });
  for (let b = 418; b < 420; b += 0.25) B.recs.push({ rec: 'slagverk', o: b, n: 0.25, s: 4 * 15, g: 0.85 + 0.08 * (b - 418) });
  B.riser.push({ beat: 414, beats: 6, vel: 0.2 });
  // -------- the fake ending (420-428): the last hit (as at the very end) rings out; the drummer's fill back in
  set(ALL, 420, 0);
  over(['bass', 'guitar', 'other', 'piano'], 420, 6, 4 * 83, { hold: 0.55, tau: 0.42 });
  over(['drums'], 420, 6, 4 * 96, { hold: 2.5, tau: 0.7 });
  B.verb.push({ stems: ['bass', 'guitar', 'other', 'piano', 'drums'], from: 419.9, to: 424, send: 0.35 });
  set(['bass', 'guitar', 'other', 'piano'], 426, OFF);
  set(['drums'], 426, 0);
  over(['drums'], 426, 2, 4 * 95 + 2); // the track's own fill at the end of its last cycle
  set(['drums'], 428, OFF);
  // -------- the last chorus (428-460) on the chorus record
  rec('vidlag', 107, 8, 8);
  lp(['vidlag'], 456, 460, 14000, 2500);
  set(['vidlag'], 460, OFF);
  // -------- goodnight (460-472): stabs on the four beats, then the band without drums, a fill, the last hit
  set(ALL, 460, 0);
  for (let b = 460; b < 464; b++) over(ALL, b, 1, srcOf(b), { hold: 0.32, tau: 0.07 });
  set(['drums'], 464, OFF);
  set(['bass', 'guitar', 'other', 'piano'], 464, -3);
  set(['vocals'], 464, OFF);
  set(['drums'], 470, 0);
  over(['drums'], 470, 2, 4 * 95 + 2);
  set(['bass', 'guitar', 'other', 'piano'], 472, 0);
  set(['drums'], 472, 0);
  // the last hit: an A7 downbeat (the track's bar 83, the bass on A) and the drummer's real last hit (bar 96), ringing out
  over(['bass', 'guitar', 'other', 'piano'], 472, 7, 4 * 83, { hold: 0.55, tau: 0.42 });
  over(['drums'], 472, 7, 4 * 96, { hold: 2.5, tau: 0.7 });
  B.verb.push({ stems: ['bass', 'guitar', 'other', 'piano', 'drums'], from: 471.9, to: 479, send: 0.35 });
  // the band's level by section (dB, on every channel): the drops the loudest, the rest a little under them
  B.level = [[0, 0], [32, -1], [128, -1.5], [144, -1], [176, -1.5], [208, -1], [224, -1], [232, 0], [264, -1], [296, 0.5], [304, 0], [308, 1],
    [324, -0.5], [356, -0.5], [372, 0], [404, -0.5], [420, -1], [428, 0.5], [460, -0.5]];
  return B;
}

// ================================================================ the animals, her horn, her wings, and the fx
export function buildScore() {
  const S = { calls: [], cues: [], tuneNotes: [], horn: [], wing: [], whoosh: [], buzz: [], kick: [], robot: [], bell: [], marimba: [], crowd: [], choir: [], beetle: [], fx: [] };
  const at16 = (bar, step) => bar * 4 + step / 4;
  const round = b => Math.round(b * 1000) / 1000;
  const PAN = { grazers: -0.35, turtles: -0.18, frogs: 0.18, lizards: 0.35, flyers: 0 };
  const call = (group, beat, o = {}) => {
    S.calls.push({ group, beat, dur: o.dur ?? 1, vel: o.vel ?? 1, take: o.take ?? 0, mode: o.mode ?? 'onset', octave: o.octave ?? 0, pan: o.pan ?? PAN[group], shift: o.shift ?? 0 });
    if (!o.noCue) S.cues.push({ beat: round(beat), kind: 'call', group });
  };
  const wing = (beat, vel = 1, len = 0) => {
    S.wing.push({ beat, vel, len });
    S.cues.push({ beat: round(beat), kind: 'wings' });
  };
  // the forest answers her: every group on its own tone at once, three of each a few ms apart
  const roar = (beat, vel = 1, seed = 1) => {
    const r = rng(500 + seed);
    for (const g of GROUPS) {
      S.cues.push({ beat: round(beat), kind: 'call', group: g });
      for (let k = 0; k < 3; k++)
        call(g, beat, { mode: 'roar', dur: 2.6, vel: vel * (g === 'grazers' ? 0.55 : 0.42) * (k ? 0.7 : 1), take: k, pan: (r() * 2 - 1) * 0.85, shift: r() * 0.05 * SPB, noCue: true });
    }
    S.cues.push({ beat: round(beat), kind: 'roar' });
  };
  const hornNote = (beat, beats, midi, vel = 1) => {
    S.horn.push({ beat, dur: Math.min(beats * 0.48, 2.5), midi, vel });
    S.cues.push({ beat: round(beat), kind: 'horn' });
  };
  // her tune, sung by the animals; `voices` 2 doubles every note (a second take, the other side); the horn echoes or joins
  const sing = (hook, { horn = 'none', vel = 1, voices = 1 } = {}) => {
    TUNE.forEach((phrase, p) => {
      phrase.forEach((g, k) => {
        const beat = hook + TUNE_AT[p][k];
        const dur = TUNE_LEN[p][k];
        call(g, beat, { dur, vel, pan: voices > 1 ? -0.35 : PAN[g] * 0.5 });
        if (voices > 1) call(g, beat, { dur, vel: vel * 0.8, take: 1, pan: 0.35, shift: 0.008 * 44100, noCue: true });
        S.tuneNotes.push({ group: g, beat });
        if (horn === 'echo' && p < 2) {
          const last = k === phrase.length - 1;
          hornNote(beat + 4, last && p === 1 ? 1 : dur, TONE[g] - 12, 0.9);
        }
        if ((horn === 'echo' && p >= 2) || horn === 'unison') hornNote(beat, dur, TONE[g] - 12, 0.85);
      });
    });
  };
  const chopPattern = (group, bar, steps, o = {}) => {
    steps.forEach(([s, len, take = 0, oct = 0], k) => call(group, at16(bar, s), { dur: len / 4, take, octave: oct, mode: 'chop', vel: (o.vel ?? 1) * (k === 0 ? 1 : 0.88) }));
  };
  const CHOPS = {
    grazers: [
      [[0, 5, 0], [6, 4, 1], [12, 3, 0]],
      [[0, 4, 1], [6, 2, 0], [8, 2, 1], [12, 4, 0]],
      [[0, 5, 0], [6, 4, 1], [12, 3, 0]],
      [[0, 3, 1], [4, 3, 0], [8, 2, 1], [10, 2, 0], [12, 4, 1]],
    ],
    turtles: [[[2, 1.6], [6, 1.6], [10, 1.6], [14, 1.6]]],
    frogs: [
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]],
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]],
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]],
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [8, 1, 1], [10, 2, 0], [12, 1, 1], [13, 1, 0], [14, 2, 1]],
    ],
    lizards: [
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [6, 1, 1], [8, 1, 0], [10, 1, 1], [12, 1, 0], [13, 1, 1], [14, 1, 0], [15, 1, 1]],
    ],
  };
  const fly = (beat, beats, midi, o = {}) => {
    S.buzz.push({ beat, dur: beats * 0.48, midi, vel: o.vel ?? 0.5, glideTo: o.glideTo ?? 0, panFrom: o.panFrom ?? -0.8, panTo: o.panTo ?? 0.8 });
    S.cues.push({ beat: round(beat), kind: 'call', group: 'dragonflies' });
  };
  const hit = beat => S.cues.push({ beat, kind: 'hit' });
  // the fx stem (fx.mjs), each with its cue for the video
  const fx = (snd, beat, o = {}) => {
    S.fx.push({ snd, beat, ...o });
    const kind = o.cue ?? ({ hit: 'impact', sub: null, subDeep: null, revCymbal: 'reverse-cymbal', revCymbal2: 'reverse-cymbal', airPulse: 'airhorn', airLong: 'airhorn', vinylRewind: null, needle: null }[snd] ?? (/^scratch/.test(snd) ? 'scratch' : /^(cheer|crowd|kids|yay)/.test(snd) ? 'crowd' : snd));
    if (kind) S.cues.push({ beat: round(beat), kind, sound: snd });
  };
  const claps = (from, to, db = 0, seed = 77) => {
    const list = [];
    for (let b = from; b < to; b++) if (b % 2 === 1) list.push(b);
    S.fx.push({ claps: list, db, seed });
    for (const b of list) S.cues.push({ beat: b, kind: 'clap' });
  };
  const record = (beat, from, to, how) => S.cues.push({ beat, kind: 'record', from, to, how });
  // the drop's three layers: a reverse cymbal ending on it, the impact with its sub on it, the crowd
  const impact = (beat, db = 0) => {
    fx('hit', beat, { align: 'peak', db: db - 3 });
    fx('sub', beat, { db: db - 1, len: 2.6 });
  };

  // ======== arrival: far calls of every group, from every side
  call('frogs', 2, { take: 1, vel: 0.2, pan: 0.7 });
  call('lizards', 4.5, { vel: 0.18, pan: -0.7 });
  call('turtles', 6, { vel: 0.2, pan: -0.5 });
  call('flyers', 7.5, { vel: 0.2, pan: 0.4 });
  call('grazers', 9, { vel: 0.24, pan: -0.6, dur: 1.5 });
  call('frogs', 10.5, { vel: 0.24, pan: 0.5 });
  call('lizards', 11.5, { take: 0, vel: 0.2, pan: 0.65 });
  // ======== welcome: she swoops in and lands; the forest answers, and so does the crowd
  S.whoosh.push({ beat: 13.2, take: 0, vel: 0.3, peakAt: true });
  S.cues.push({ beat: 13, kind: 'whoosh' });
  wing(14, 0.9);
  wing(14.75, 0.8);
  wing(15.5, 1);
  hit(16);
  roar(24, 0.75, 1);
  fx('cheerShort', 24, { db: -10 });
  // ======== warm-up: the drums in; whoops from all over the forest between her words; the crowd claps along from "Klappið með!"
  hit(32);
  [['lizards', 36.5, 0.6], ['flyers', 38, -0.5], ['frogs', 43.5, 0.5], ['grazers', 46, -0.6], ['lizards', 47.5, 0.7], ['turtles', 50, -0.4],
    ['flyers', 51.5, 0.3], ['frogs', 53.5, -0.6], ['lizards', 55, 0.6], ['frogs', 57.5, 0.4], ['flyers', 59, -0.3]].forEach(([g, beat, pan], k) =>
    call(g, beat, { dur: 1, vel: 0.45 + 0.02 * k, pan, take: k % 2 }));
  claps(42, 63, -2, 77);
  S.cues.push({ beat: 48, kind: 'rise' });
  hit(64);
  // ======== her song
  hit(96);
  sing(96);
  // ======== the acts
  hit(128);
  for (let bar = 32; bar < 36; bar++) {
    wing(bar * 4, 0.7);
    wing(bar * 4 + 2, 0.8);
    chopPattern('grazers', bar, CHOPS.grazers[bar - 32], { vel: 0.85 });
  }
  // the record change: the band low-passed, then her scratch into the funk
  fx('scratch1', 142.5, { db: -6 });
  fx('scratch2', 143, { db: -6 });
  fx('scratch3', 143.5, { db: -5 });
  record(144, 'vamp', 'fonk', 'low-pass and scratch');
  hit(144);
  for (let bar = 36; bar < 40; bar++) {
    if (bar < 38) {
      call('turtles', bar * 4 + 1, { mode: 'chop', dur: 1.6, vel: 0.9 });
      call('turtles', bar * 4 + 3, { mode: 'chop', dur: 0.9, vel: 0.6 });
    } else for (let e = 0; e < 8; e++) call('turtles', bar * 4 + e / 2 + 0.25, { mode: 'chop', dur: 0.32, vel: 0.8 });
  }
  hit(152);
  hit(160);
  for (let bar = 40; bar < 44; bar++) chopPattern('frogs', bar, CHOPS.frogs[bar - 40], { vel: 1.05 });
  record(176, 'fonk', 'vamp', 'echo throw');
  hit(176);
  for (let bar = 44; bar < 48; bar++) chopPattern('lizards', bar, CHOPS.lizards[bar - 44], { vel: 1.2 });
  hit(192);
  for (let bar = 48; bar < 52; bar++) {
    const flyer = bar === 51 ? [[0, 4], [4, 4], [8, 4], [12, 4]] : [[0, 8], [10, 6]];
    for (const [s, len] of flyer) call('flyers', bar * 4 + s / 4, { dur: len / 4, vel: 1.15, pan: (s / 16) * 1.0 - 0.4 });
  }
  // the beetles' record: a scratch, then the beetles are the drummers, a cue on every beat and off-beat of their four bars
  fx('scratchClean', 207.25, { db: -5 });
  record(208, 'vamp', 'slagverk', 'scratch');
  hit(208);
  for (let b = 208; b < 224; b += 0.5) S.cues.push({ beat: b, kind: 'call', group: 'beetles' });
  record(224, 'slagverk', 'vamp', 'cut');
  hit(224);
  fly(224, 3.5, 76, { vel: 0.5, panFrom: -0.9, panTo: 0.9 });
  fly(226, 2, 81, { vel: 0.4, panFrom: 0.9, panTo: -0.6 });
  fly(228, 3.5, 76, { vel: 0.36, glideTo: 440 * 2 ** ((88 - 69) / 12), panFrom: -0.4, panTo: 0.4 });
  // ======== her horn: the headliner, on the quiet record
  record(232, 'vamp', 'rolegt', 'echo throw');
  hit(232);
  TUNE.forEach((phrase, p) => phrase.forEach((g, k) => {
    const lens = [[1.5, 5], [1.5, 1.5, 4.5], [1.5, 1.5, 1, 3.5], [1.5, 1.5, 0.5, 0.5, 4]];
    hornNote(232 + TUNE_AT[p][k], lens[p][k], TONE[g] - 12, 1);
  }));
  fx('revCymbal2', 264, { align: 'end', db: -9 });
  // ======== the build: her wings quicken; the forest climbs with her; the countdown
  record(264, 'rolegt', 'vamp', 'reverse cymbal');
  S.cues.push({ beat: 264, kind: 'rise' });
  for (let b = 264; b < 272; b += 2) wing(b, 0.5);
  for (let b = 272; b < 280; b += 1) wing(b, 0.45);
  for (let b = 280; b < 288; b += 0.5) wing(b, 0.35, 0.5);
  for (let b = 288; b < 295; b += 0.25) wing(b, 0.22 + 0.14 * ((b - 288) / 8), 0.25);
  ['grazers', 'turtles'].forEach((g, k) => {
    for (let b = 0; b < 4; b++) call(g, 264 + k * 4 + b, { mode: 'chop', dur: 0.7, vel: 0.75, take: b % 2 && g !== 'turtles' ? 1 : 0 });
  });
  roar(276, 0.85, 3);
  fx('crowdBed', 276, { db: -16, len: 4.5 });
  for (let e = 0; e < 8; e++) call(GROUPS[e % 5], 280 + e / 2, { mode: 'chop', dur: 0.45, vel: 0.55 });
  for (let s = 0; s < 8; s++) call(GROUPS[s % 5], 284 + s / 4, { mode: 'chop', dur: 0.24, vel: 0.55 });
  GROUPS.forEach((g, k) => {
    const beat = 287 + 2 * k;
    call(g, beat, { dur: 0.9, vel: 0.7 + 0.03 * k, pan: 0 });
    S.cues.push({ beat: beat - 1, kind: 'count', n: 5 - k });
  });
  // ======== the drop
  fx('revCymbal', 296, { align: 'end', db: -7 });
  impact(296);
  fx('cheerSwell', 295.6, { db: -6 });
  fx('kidsCheer', 296.3, { db: -9 });
  roar(296, 1, 4);
  for (const g of GROUPS) call(g, 296, { dur: 3, vel: g === 'grazers' ? 0.85 : 0.6, pan: PAN[g] * 1.4 });
  for (let bar = 74; bar < 76; bar++) {
    chopPattern('grazers', bar, CHOPS.grazers[bar - 74].filter(([s]) => s === 0 || s >= 8), { vel: 0.45 });
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.36 });
    chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.36 });
    chopPattern('lizards', bar, CHOPS.lizards[0].filter(([s]) => s >= 8), { vel: 0.32 });
    if (bar % 2 === 1) call('flyers', bar * 4 + 2, { dur: 1.8, vel: 0.55, pan: -0.4 });
  }
  S.whoosh.push({ beat: 295, take: 1, vel: 0.5, peakAt: true });
  S.cues.push({ beat: 296, kind: 'peak' });
  // ======== the rewind: the spin-back of what was just played, the platter's sound under it; "Aftur!"; the drop again
  fx('vinylRewind', 304, { db: -14, len: 0.7 });
  S.cues.push({ beat: 304, kind: 'rewind' });
  fx('revCymbal', 308, { align: 'end', db: -7 });
  // ======== the drop again, with the air horn
  impact(308, 0.5);
  fx('airPulse', 308, { db: -9 });
  fx('cheerBig', 308, { db: -8, len: 9 });
  fx('kidsShout', 308.5, { db: -10 });
  roar(308, 1, 7);
  for (let bar = 77; bar < 81; bar++) {
    chopPattern('grazers', bar, CHOPS.grazers[bar - 77].filter(([s]) => s === 0 || s >= 8), { vel: 0.45 });
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.36 });
    chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.36 });
    chopPattern('lizards', bar, CHOPS.lizards[0].filter(([s]) => s >= 8), { vel: 0.32 });
    if (bar % 2 === 0) call('flyers', bar * 4 + 2, { dur: 1.8, vel: 0.55, pan: bar === 78 ? -0.4 : 0.4 });
  }
  S.cues.push({ beat: 308, kind: 'peak' });
  // ======== anthem: everyone sings her tune
  S.cues.push({ beat: 324, kind: 'peak' });
  sing(324, { horn: 'echo', voices: 2 });
  // ======== freeze dance: "Stopp!", the tape stop, the needle; a turtle wobbles; the children laugh; "Dansa!"
  hit(356);
  for (let bar = 89; bar < 91; bar++) {
    chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.4 });
    chopPattern('lizards', bar, CHOPS.lizards[0].filter(([s]) => s >= 8), { vel: 0.36 });
  }
  S.cues.push({ beat: 364, kind: 'freeze' });
  fx('needle', 364.9, { db: -16 });
  call('turtles', 365.75, { dur: 0.6, vel: 0.5, pan: -0.3 });
  S.cues.push({ beat: 365.75, kind: 'moved', group: 'turtles' });
  fx('kidsLaugh', 367.6, { db: -14 });
  S.cues.push({ beat: 372, kind: 'unfreeze' });
  // ======== carnival: the slam; claps on 2 and 4; samba whistles from the flyers; a stomp from the grazers on each bar
  record(372, 'vamp', 'song3', 'freeze, then slam');
  impact(372);
  fx('airLong', 372, { db: -11 });
  fx('cheerSwell', 371.6, { db: -7 });
  fx('kidsCheer', 372.3, { db: -10 });
  roar(372, 0.8, 8);
  claps(377, 403, -1, 91);
  fx('crowdBed', 380, { db: -18, len: 18 });
  for (let bar = 93; bar < 101; bar++) {
    call('grazers', bar * 4, { mode: 'chop', dur: 0.9, vel: 0.5, pan: -0.3 });
    if (bar % 2 === 0) chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.38 });
    else chopPattern('lizards', bar, CHOPS.lizards[0], { vel: 0.32 });
    if (bar >= 95) [0, 1, 1.5, 3].forEach((s, k) => call('flyers', bar * 4 + s, { mode: 'chop', dur: k === 3 ? 0.9 : 0.35, vel: 0.5, pan: 0.45 }));
  }
  fx('kidsWoah', 391.5, { db: -12 });
  fx('yay', 399, { db: -12 });
  // ======== the crowd: "Egill, segðu já!", his gap (beats 407-412), then the forest and the children; "Hærra!", a bigger answer
  record(404, 'song3', 'slagverk', 'low-pass');
  hit(404);
  S.cues.push({ beat: 407.5, kind: 'egill-turn' });
  roar(412, 0.6, 9);
  fx('kidsYay', 412, { db: -8 });
  fx('cheerShort', 412.2, { db: -11 });
  roar(416, 0.9, 10);
  fx('kidsCheer', 416, { db: -8 });
  fx('cheerSwell', 415.7, { db: -9 });
  // ======== the fake ending: the last hit, the applause; she wants one more
  record(420, 'slagverk', 'vamp', 'last hit');
  S.cues.push({ beat: 420, kind: 'end-fake' });
  call('grazers', 420, { dur: 2, vel: 0.9, pan: 0 });
  fx('cheerBig', 420.2, { db: -9, len: 6.5 });
  fx('revCymbal', 428, { align: 'end', db: -7 });
  // ======== the last chorus: everyone sings; her horn answers the band in the gaps of its hook, and joins the last note
  record(428, 'vamp', 'vidlag', 'drum fill');
  impact(428);
  fx('airPulse', 428, { db: -10 });
  fx('cheerSwell', 427.6, { db: -8 });
  S.cues.push({ beat: 428, kind: 'peak' });
  sing(428, { voices: 2 });
  for (const at of [434, 442, 450]) ['frogs', 'lizards', 'flyers'].forEach((g, k) => hornNote(at + 0.5 * k, k === 2 ? 1 : 0.5, TONE[g] - 12, 0.95));
  hornNote(456, 3, TONE.grazers - 12, 0.9);
  for (let bar = 107; bar < 115; bar++) {
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.3 });
    if (bar % 2 === 0) chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.28 });
    else chopPattern('lizards', bar, CHOPS.lizards[0], { vel: 0.26 });
  }
  // ======== goodnight
  hit(460);
  TUNE[3].slice(0, 4).forEach((g, k) => {
    const beat = 460 + k;
    call(g, beat, { dur: 0.9, vel: 1, pan: 0 });
    hornNote(beat, 0.8, TONE[g] - 12, 0.85);
    wing(beat, 0.55 + 0.1 * k);
  });
  for (const g of GROUPS) call(g, 464, { dur: 4, vel: g === 'grazers' ? 0.9 : 0.62 });
  hornNote(464, 5, TONE.grazers - 12, 0.85);
  // the last hit, and she flies off to the crowd's cheer
  call('grazers', 472, { dur: 2, vel: 0.9, pan: 0 });
  wing(472, 0.8);
  wing(473, 0.6);
  fx('cheerBig', 472.3, { db: -10, len: 6.4 });
  S.whoosh.push({ beat: 473.5, take: 0, vel: 0.45, peakAt: false });
  S.cues.push({ beat: 472, kind: 'end' }, { beat: 473.5, kind: 'whoosh' });

  // a group's chop never doubles its own note of her tune: the tune note wins
  const clash = c => c.mode === 'chop' && S.tuneNotes.some(t => t.group === c.group && Math.abs(t.beat - c.beat) < 0.5);
  const dropped = S.calls.filter(clash);
  S.calls = S.calls.filter(c => !clash(c));
  for (const d of dropped) {
    const i = S.cues.findIndex(q => q.kind === 'call' && q.group === d.group && q.beat === round(d.beat));
    if (i >= 0) S.cues.splice(i, 1);
  }
  for (const d of DJ) S.cues.push({ beat: d.beat, kind: 'dj', id: d.key ?? d.id });
  S.cues.sort((a, b) => a.beat - b.beat || a.kind.localeCompare(b.kind));
  return S;
}
