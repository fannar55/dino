// The lab page of Slóeðla's song game (sloedla-lab.html): the round on a page of its own, never linked from the game, to prove the
// play and the music before anything else is built. Each song owns everything it plays (v2/format.js, v2/songs/) and is played
// by a player of its own (v2/player.js), so a hit or a miss changes what is heard. The menu (menu.js, menu-view.js) asks who plays,
// then shows the songs as cards; the DJ speaks once the first tap has woken the sound (a browser lets sound begin only from a
// touch). "Spila!" plays a round; at its end, the stars and "Spilum aftur" or "Annað lag". The choices are kept on the device.
//
// The address says how (all optional):
//   lag=<id>              which song is picked (v2/songs/index.js)
//   stig=barn|fullordinn  the child's notes (marked in the song, two beats apart at least) or the grown-ups' (every part's notes)
//   brautir=3|2           three lanes (Kambeðla, Slóeðla, Þórseðla) or two (Slóeðla and Þórseðla; Kambeðla then just plays along)
//   seinkun=<ms>          sound heard this much later than the browser knows (a Bluetooth speaker): kept for the next visit
//   debug=1               the clock's numbers in a corner: the section and its version, the gates, the taps' mean error, fps
//   sjalf=1|illa|ekkert|syna  plays itself (a pretend child), for a look or a capture: well, badly (the calm versions), not at all
//                         (the bare song), or a show of what taps do (well, then nothing, then the dinosaurs back one by one);
//                         the menu opens on the songs with lag= picked, and #play starts it
//   upptaka=1             records the round, picture and sound, into window.__recording (a data: URL of a webm), for a video
//   hljod=0               silent speakers (the sound is still made, and recorded)
//   bakgrunnur=0          the night sky alone, without the forest (a render of the game's own world) under it
//   ahorfendur=0          no crowd (the "vá!", the "æææ", the cheering and the applause: crowd.js)
//   dj=0                  no DJ (the voice that calls out "Tíu í röð!" and the big moments: dj.js)
//   hendur=0              no black hands clapping along at the bottom in Stjörnukraftur (hands.js)
//   3d=0                  the stars flat, not in 3D (star-view.js: the owner's star; flat too when there is no WebGL or no star),
//                         and the menu's stage in pictures (stage-flat.js), not the cast in 3D (stage.js)
//   lokaskjar=0..5|fullkominn  the end at once with that many stars, or a perfect game, for a look at it
//   gestur=<b|a|c>:<barn|fullordinn>  a band's look without phones: that dinosaur's lane is a guest's ("Gestur") at that level
//                         (its window, its notes, its speed), played here like the rest
// "Spilum saman" in step 1 opens a room for guests' phones (Fjölspil, fjolspil-song.js): the QR card on the stage, Egill taps
// his dinosaur, guests take the others from their phones, each at her own level.
// Keys for a grown-up at a computer: A S D (or J K L, or the arrows) for the lanes, F and J with two; space or Enter goes on
// in the menu (to the songs, then plays the picked one) and plays again at the end.

import { createAudioContext, createOutput } from '../audio/output.js';
import { seededRandom } from '../random.js';
import { LEVELS } from './chart.js';
import { groupsOf, laneRules, mineFor, roleOf, rolesOf } from './lineup.js';
import { createFjolspil } from '../fjolspil/fjolspil.js';
import { createBandLobby } from './band-lobby.js';
import { BAND_STORAGE_KEY, createBandHost } from './fjolspil-song.js';
import { createSongClock } from './song-clock.js';
import { createSongSounds } from './sounds.js';
import { createReverb } from './room.js';
import { createCrowd } from './crowd.js';
import { createDj } from './dj.js';
import { createClaps } from './claps.js';
import { createClapHands } from './hands.js';
import { createSongGame } from './game.js';
import { createPlayer } from './v2/player.js';
import { SONGS_V2, loadSongV2 } from './v2/songs/index.js';
import { rootHz } from './key.js';
import { createMenu } from './menu.js';
import { createMenuView } from './menu-view.js';
import { createSparks } from './menu-sparks.js';
import { createBest } from './best.js';
import { createBrot } from './brot.js';
import { createFlatStage } from './stage-flat.js';
import { BACKDROP, FRIENDS } from './friends.js';

const asset = path => new URL(`../../assets/${path}`, import.meta.url).href;

// The friends who play (FRIENDS) and the Fen behind the lanes (BACKDROP) are friends.js's: a guest's tablet draws them too.
const KEYS = {
  3: { a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, arrowleft: 0, arrowdown: 1, arrowup: 1, arrowright: 2 },
  2: { f: 0, j: 1, a: 0, l: 1, d: 0, k: 1, arrowleft: 0, arrowright: 1 },
};
const SEINKUN_KEY = 'mosi-sloedla-seinkun';
const CHOICES_KEY = 'mosi-sloedla-val'; // the menu's last choices on this device: { level, lanes, song }
// the owner's star (Tripo3D) turned so its face looks at the viewer: degrees about x, y, z (assets/sloedla/stjarna/KREDIT.md)
const STAR_FACING = [0, 0, 0];

const params = new URLSearchParams(location.search);
const saved = readChoices();
const options = {
  song: params.get('lag') ?? saved.song ?? null,
  level: (params.get('stig') ?? saved.level) === 'fullordinn' ? 'fullordinn' : 'barn',
  lanes: String(params.get('brautir') ?? saved.lanes) === '2' ? 2 : 3,
  debug: params.get('debug') === '1',
  self: params.get('sjalf'),
  record: params.get('upptaka') === '1',
  crowd: params.get('ahorfendur') !== '0',
  dj: params.get('dj') !== '0',
  backdrop: params.get('bakgrunnur') !== '0',
  hands: params.get('hendur') !== '0',
  stars3d: params.get('3d') !== '0',
  endNow: ['0', '1', '2', '3', '4', '5'].includes(params.get('lokaskjar')) ? Number(params.get('lokaskjar')) : params.get('lokaskjar') === 'fullkominn' ? 'fullkominn' : null,
  guest: guestOf(params.get('gestur')),
  extra: readSeinkun(),
};

/** ?gestur=c:fullordinn → { role: 'c', level: 'fullordinn' }; null for anything else. */
function guestOf(text) {
  const [role, level] = String(text ?? '').split(':');
  return ['a', 'b', 'c'].includes(role) && ['barn', 'fullordinn'].includes(level) ? { role, level } : null;
}

function readChoices() {
  try {
    return JSON.parse(localStorage.getItem(CHOICES_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function saveChoices({ level, lanes, song }) {
  try {
    localStorage.setItem(CHOICES_KEY, JSON.stringify({ level, lanes, song }));
  } catch { /* kept for the visit only */ }
}

function readSeinkun() {
  const given = params.get('seinkun');
  try {
    if (given !== null && Number.isFinite(Number(given))) localStorage.setItem(SEINKUN_KEY, String(Number(given)));
    return (Number(given ?? localStorage.getItem(SEINKUN_KEY)) || 0) / 1000;
  } catch {
    return (Number(given) || 0) / 1000;
  }
}

const $ = id => document.getElementById(id);
const canvas = $('field');
const context = createAudioContext();
const output = context ? createOutput(context) : null;
if (output && params.get('hljod') === '0') output.gain.value = 0;
const mix = context?.createGain(); // everything the round plays, before the page's output
let glue = null; // a gentle compressor over the whole mix, so the band, the parts and the room never clip (a recording takes it here)
let room = null;
if (mix) {
  mix.gain.value = 0.7;
  glue = context.createDynamicsCompressor();
  glue.threshold.value = -12;
  glue.knee.value = 8;
  glue.ratio.value = 4;
  glue.attack.value = 0.004;
  glue.release.value = 0.2;
  mix.connect(glue);
  glue.connect(output);
  room = createReverb(context);
  const wet = context.createGain();
  wet.gain.value = 0.5;
  room.connect(wet);
  wet.connect(mix);
}
// The balance of the round (measured 2026-10-30 with the side notes' loudness.mjs + loudness-report.mjs, K-weighted as loudness
// meters hear; the owner: the music was too low against the rest): the music bus up 2 dB, the crowd down 2 dB, the DJ down 1 dB,
// and the music dips 3 dB under the DJ, not 5. The DJ had peaked 9-14 dB over the music, now about 3-7 (still clear to a child);
// the crowd's cheers had peaked up to 9 dB over it, now about 0-3.
const MUSIC_LEVEL = 1.26;
const CROWD_LEVEL = 1.1;
const DJ_LEVEL = 1.07;
const TALK_DIP = 0.71;
// the crowd's voice, made with ElevenLabs (tools/sloedla-crowd.mjs); fetched and decoded while the start card waits
const crowd = mix && options.crowd ? createCrowd({ context, output: mix, room, src: id => asset(`audio/sloedla/crowd-${id}.mp3`), level: CROWD_LEVEL }) : null;
crowd?.load();
const CLAP_LEVEL = 1.55; // the clapping crowd against the crowd's bus (measured: tools in the side notes, meter-crowd.mjs + clap-report.mjs)
// the crowd clapping along in Stjörnukraftur: real hand claps (claps.js), through the crowd's bus (its level, its share of the room)
const claps = crowd ? createClaps({ context, output: crowd.bus, src: name => asset(`audio/sloedla/klapp/${name}.wav`), level: CLAP_LEVEL }) : null;
claps?.load();
// the music (the band, the dinosaurs' parts, the bells) goes through a bus of its own, which dips under the DJ while he talks, as
// on the radio; the crowd and the DJ go past it
const music = mix ? context.createGain() : null;
music?.connect(mix);
function talkOver(at, seconds) {
  const gain = music.gain;
  gain.cancelScheduledValues(at);
  gain.setTargetAtTime(MUSIC_LEVEL * TALK_DIP, at, 0.04);
  gain.setTargetAtTime(MUSIC_LEVEL, at + seconds, 0.2);
}
const dj = mix && options.dj ? createDj({ context, output: mix, src: id => asset(`audio/sloedla/dj/${id}.mp3`), level: DJ_LEVEL, onTalk: talkOver }) : null;
dj?.load();

function loadImage(src) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

const loading = Promise.all(Object.values(FRIENDS).map(f => loadImage(f.src).then(image => [f.role, image]))).then(Object.fromEntries);
const backdropLoading = options.backdrop ? Promise.all([loadImage(BACKDROP.wide), loadImage(BACKDROP.upright)]) : Promise.resolve([null, null]);
let backdrop = null;
backdropLoading.then(([image, upright]) => { backdrop = image ? { image, upright, fade: BACKDROP.fade, fadeUpright: BACKDROP.fadeUpright } : null; });
// the crowd's black hands clapping along in Stjörnukraftur: Openclipart's raised hands (assets/sloedla/hendur/, KREDIT.md)
const hands = options.hands ? createClapHands({ src: id => asset(`sloedla/hendur/${id}.svg`) }) : null;
hands?.load();
// the stars in 3D (star-view.js, three.js over the field): loaded while the menu waits; null (no WebGL, no star): flat stars
const starView = options.stars3d && context
  ? import('./star-view.js').then(m => m.createStarView({ canvas: $('stars3d'), url: asset('sloedla/stjarna/stjarna.glb'), facing: STAR_FACING, keep: options.record })).catch(() => null)
  : Promise.resolve(null);

let round = null; // { game, clock, conductor, bot }
let images = null;
let recorder = null;

/** A round of the chosen song: the menu's loading show (menu-view.js showLoading) while its stems load, then the play. */
async function start({ again = false } = {}) {
  if (!images || !context) return;
  try { await context.resume(); } catch { /* the game goes on silent */ }
  round?.conductor.stop();
  round = null;
  const entry = SONGS_V2.find(each => each.id === options.song) ?? SONGS_V2[0];
  const show = view.showLoading(entry, { again });
  // the song (v2/format.js) owns everything it plays and has a player of its own (v2/player.js); an unknown id plays the first
  const song = await loadSongV2(options.song) ?? await loadSongV2(SONGS_V2[0].id);
  // its stems, decoded once, one at a time (decoding many at once has crashed iOS tabs); one that cannot be loaded is left out
  // (the player says so) and the round plays; the ring follows them
  const wanted = song.layers.filter(layer => layer.stem && !layer.buffer);
  let done = 0;
  for (const layer of wanted) {
    try {
      const response = await fetch(asset(`audio/sloedla/v2/${song.id}/${layer.stem}`));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      layer.buffer = await context.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      console.warn(`Slóeðla: ${song.id}/${layer.stem} could not be loaded`, error);
    }
    show.progress(++done / wanted.length);
  }
  show.progress(1);
  await show.finished;
  const roles = options.lanes === 2 ? ['a', 'c'] : ['b', 'a', 'c'];
  const cast = roles.map(role => ({ ...FRIENDS[role], image: images[role] }));
  const windows = LEVELS[options.level];
  // ?gestur=: one lane a guest's at her level, the rest Egill's (a band's look on this screen alone)
  const lineup = options.guest && roles.includes(options.guest.role)
    ? roles.map(role => (role === options.guest.role
      ? { role, player: 1, name: 'Gestur', level: options.guest.level, judged: 'here' }
      : { role, player: 0, name: 'Egill', level: options.level, judged: 'here' }))
    : null;
  const fall = lineup ? Math.max(...lineup.map(lane => laneRules(lane).fall)) : windows.fall;
  const clock = createSongClock(context, { extra: options.extra });
  music.gain.cancelScheduledValues(context.currentTime);
  music.gain.value = MUSIC_LEVEL;
  const sounds = createSongSounds({ context, output: music, room, instruments: song.instruments });
  // the player keeps the name the round and the measuring tools know it by (round.conductor)
  const conductor = createPlayer({ context, song, clock, sounds, out: music, level: options.level, roles, fall, groups: lineup ? groupsOf(lineup) : null });
  const root = rootHz(song.key.root) * 2;
  const stars3d = await starView;
  stars3d?.clear();
  const game = createSongGame({
    canvas, cast, conductor, fall, clock, windows, lineup, crowd, claps, dj, backdrop, hands, debug: options.debug,
    stars3d, bestBefore: best.get(options.song, options.level), endNow: options.endNow,
    chimes: { star: n => sounds.star(n, root), sparkle: () => sounds.sparkle(root * 2), tick: () => sounds.tick(root * 8) },
    onEnd: result => finish(result),
  });
  round = { game, clock, conductor, bot: options.self ? createBot(conductor, cast, options.self) : null };
  if (options.record) startRecording(stars3d);
  conductor.start(0.4);
  menu.begun();
  window.__sloedla.round = round;
}

/**
 * The pretend child: ?sjalf=1 hits most notes, a little early or late; ?sjalf=illa fewer (the calm versions); ?sjalf=ekkert none
 * (the bare song); ?sjalf=syna plays well, stops for a while, then brings the dinosaurs back one at a time (Þórseðla's beat,
 * then Kambeðla's bass, then Slóeðla's tune), to show and hear what the taps do.
 */
const SHOW = [[30, 'abc'], [48, ''], [58, 'c'], [68, 'cb'], [Infinity, 'abc']]; // (until song time, who is played)
function createBot(conductor, cast, how) {
  const random = seededRandom(`sloedla-sjalf-${how}`);
  const hitRate = how === 'illa' ? 0.4 : how === 'ekkert' ? 0 : 0.92;
  const plays = note => how !== 'syna' || SHOW.find(([until]) => note.t < until)[1].includes(note.role);
  let planned = 0;
  const taps = [];
  return {
    due(now) {
      const chart = conductor.chart;
      for (; planned < chart.length; planned++) {
        const note = chart[planned];
        if (random() > hitRate || !plays(note)) continue;
        const lane = cast.findIndex(c => c.role === note.role);
        taps.push({ lane: lane >= 0 ? lane : cast.length - 1, at: note.t + (random() + random() + random() - 1.5) * 0.12 });
      }
      taps.sort((x, y) => x.at - y.at);
      const ready = [];
      while (taps.length && taps[0].at <= now) ready.push(taps.shift());
      return ready;
    },
  };
}

function finish(result) {
  // the story's reward at four stars or more, so a child who plays every note has it (spec 2026-10-31)
  $('end-words').textContent = result.stars >= 4 ? 'Slóeðla syngur með þér á hátíðinni!' : 'Viltu spila aftur?';
  // a look at the end (?lokaskjar=) is no record
  const rose = options.endNow === null && best.record(options.song, options.level, { stars: result.stars, points: result.points });
  view.showEnd(result, rose);
  window.__sloedlaResult = result;
  if (recorder) setTimeout(() => recorder.state === 'recording' && recorder.stop(), 2500);
}

// With the stars in 3D the picture is two canvases (the field, and the stars over it): a recording takes both, laid together on
// a canvas of its own each frame (layDown).
let recordCanvas = null;
function layDown() {
  if (!recordCanvas) return;
  if (recordCanvas.width !== canvas.width || recordCanvas.height !== canvas.height) {
    recordCanvas.width = canvas.width;
    recordCanvas.height = canvas.height;
  }
  const g = recordCanvas.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.drawImage($('stars3d'), 0, 0, canvas.width, canvas.height);
}

function startRecording(stars3d) {
  if (!globalThis.MediaRecorder || !canvas.captureStream) return;
  const sink = context.createMediaStreamDestination();
  glue.connect(sink);
  if (stars3d) {
    recordCanvas = document.createElement('canvas');
    layDown();
  }
  const stream = new MediaStream([...(recordCanvas ?? canvas).captureStream(30).getVideoTracks(), ...sink.stream.getAudioTracks()]);
  const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
  recorder.onstop = () => {
    const reader = new FileReader();
    reader.onload = () => { window.__recording = reader.result; };
    reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
  };
  recorder.start(1000);
}

function frame(perf) {
  requestAnimationFrame(frame);
  if (!round) return;
  if (round.bot) for (const { lane, at } of round.bot.due(round.clock.time())) round.game.tap(lane, at);
  round.game.frame(perf);
  layDown();
}

canvas.addEventListener('pointerdown', event => {
  event.preventDefault();
  if (!round) return;
  const lane = round.game.laneAt(event.offsetX);
  if (lane >= 0) round.game.tap(lane, round.clock.timeAt(event.timeStamp));
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
addEventListener('keydown', event => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if ((key === ' ' || key === 'enter') && (!$('start').hidden || !$('end').hidden)) {
    event.preventDefault();
    view.enter();
    return;
  }
  const lane = KEYS[options.lanes][key];
  if (round && lane !== undefined) {
    event.preventDefault();
    round.game.tap(lane, round.clock.timeAt(event.timeStamp));
  }
});
addEventListener('resize', () => round?.game.resize());
document.addEventListener('visibilitychange', () => {
  if (!context || !round) return;
  if (document.hidden) context.suspend().catch(() => {});
  else context.resume().catch(() => {});
});

// The menu: who plays, then the songs (menu.js, menu-view.js); the songs' best stars on this device (best.js); their previews
// into the music bus, so the DJ dips them (brot.js). The choices go into the address too, so a reload keeps them.
const best = createBest();
const brot = context ? createBrot({ context, output: music, src: id => asset(`audio/sloedla/v2/${id}/brot.mp3`), bpmOf: id => SONGS_V2.find(song => song.id === id)?.bpm ?? null }) : null;
// the pretend child (?sjalf=) always has a song: the address's, else the first (the tools that capture it click #play at once)
const menu = createMenu({ songs: SONGS_V2, level: options.level, lanes: options.lanes, song: options.song ?? (options.self ? SONGS_V2[0].id : null), self: Boolean(options.self) });
function keep({ level, lanes, song }) {
  saveChoices({ level, lanes, song });
  for (const [name, value] of [['stig', level], ['brautir', lanes], ['lag', song]]) if (value !== null) params.set(name, String(value));
  history.replaceState(null, '', `?${params}`);
  bandChanged(); // "Spilum saman": the phones see the lanes, Egill's dinosaur and the song as they are now
}
// the menu's bells (sounds.js: a sparkle at a pick, ticks while a song loads, the star's chord at "Byrjum!")
const chimes = mix ? createSongSounds({ context, output: mix }) : null;
const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const view = createMenuView({
  menu, songs: SONGS_V2, best, dj, brot, asset, chimes, reduced,
  sparks: createSparks(document.querySelector('[data-sparks]')),
  onUnlock: () => context?.resume().catch(() => {}),
  save: keep,
  onTogether: () => {
    const { lanes, mine, level } = menu.state();
    band.open({ lanes, mine, level }).catch(error => console.error('Slóeðla: the room could not be opened', error));
    bandChanged();
  },
  onAlone: () => {
    band.close();
    bandChanged();
  },
  onMine: role => {
    const { lanes, mine } = menu.state();
    const held = bandRoom.seats.list().some(seat => seat.kind === 'remote' && roleOf(seat.avatar) === role);
    if (held || role === mine || !rolesOf(lanes).includes(role)) return; // a guest's, his already, or out of the round
    menu.setMine(role);
    bandChanged();
  },
  onPlay: (choice, { again = false } = {}) => {
    options.song = choice.song;
    options.level = choice.level;
    options.lanes = choice.lanes;
    keep(choice);
    start({ again });
  },
});

// The menu's stage: the cast in 3D (stage.js, loaded with import() so the game never needs three.js), or in pictures
// (stage-flat.js) with ?3d=0, without WebGL, or when a model cannot be loaded
const flatStage = () => createFlatStage({ root: document.querySelector('[data-flat]'), asset });
if (!options.stars3d) view.useStage(flatStage());
else {
  import('./stage.js')
    .then(m => m.createStage({ canvas: document.querySelector('[data-stage]'), asset, reduced, onLost: () => view.useStage(flatStage()) }))
    .then(stage => view.useStage(stage ?? flatStage()), () => view.useStage(flatStage()));
}

// "Spilum saman": the room for the guests' phones (Fjölspil), kept apart from the book's, its lobby the QR card on the stage
// (band-lobby.js, the one instance the band host also needs), the band host over it (fjolspil-song.js)
let bandLobby = null;
const bandRoom = createFjolspil(document, {
  storageKey: BAND_STORAGE_KEY,
  lobby: (doc, lobbyOptions) => (bandLobby = createBandLobby(doc, lobbyOptions)),
  audio: { sfx: () => chimes?.sparkle(880) },
});
const band = createBandHost({
  fjolspil: bandRoom,
  lobby: bandLobby,
  onSeats: () => bandChanged({ seatsOnly: true }),
  onJoin: seat => {
    const role = roleOf(seat.avatar);
    if (role) view.welcome(role);
  },
});
/**
 * The band as it is now, everywhere: Egill's dinosaur again if the lanes or the seats changed it (mineFor), the phones' lobby
 * (what is on offer, and the song once the songs show) and the stage's tags. When only the seats changed (the lobby told us),
 * the lobby is sent again only if Egill's dinosaur moved, since sending it tells us the seats again.
 */
function bandChanged({ seatsOnly = false } = {}) {
  const seats = bandRoom.seats.list();
  const before = menu.state();
  if (before.together) {
    const mine = mineFor({ lanes: before.lanes, mine: before.mine, seats });
    if (mine !== before.mine) menu.setMine(mine);
    const { lanes, level, step, song } = menu.state();
    if (!seatsOnly || mine !== before.mine) band.update({ lanes, mine, level, song: step === 'hver' ? null : song });
  }
  const { together, mine } = menu.state();
  view.setBand({ together, mine, seats: bandRoom.seats.list() });
}

// for a look from outside (captures, and a meter of the mix: `audio`)
window.__sloedla = { start, bandRoom, band, state: () => round?.game.state() ?? null, latency: () => round?.clock.latency() ?? null, options, audio: { context, mix, glue, music, crowd: crowd?.bus ?? null, dj: dj?.bus ?? null } };
Promise.all([loading, backdropLoading]).then(([loaded]) => {
  images = loaded;
  $('play').disabled = false;
  $('play').classList.add('ready');
  window.__sloedlaReady = true;
}).catch(error => {
  console.error('Slóeðla: the pictures could not be loaded', error);
});
requestAnimationFrame(frame);
