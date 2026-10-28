// The lab page of Slóeðla's song game (sloedla-lab.html), stage 0: the round on a page of its own, never linked from the game,
// to prove the play and the sound before anything else is built. It loads the song (decoded whole), its sheet and the pictures,
// waits for a tap on "Spila" (a browser lets sound begin only from a touch), plays a round, shows the stars and offers another.
//
// The address says how (all optional):
//   stig=barn|fullordinn  the child's level (a note on every second beat at most, slow) or the grown-ups' (every beat, faster)
//   brautir=3|2           three lanes (Kambeðla, Slóeðla, Þórseðla) or two (Slóeðla and Þórseðla)
//   seinkun=<ms>          sound heard this much later than the browser knows (a Bluetooth speaker): kept for the next visit
//   debug=1               the clock's numbers in a corner: the latency, the taps' mean error (to set seinkun by), fps
//   sjalf=1               plays itself (a pretend child who hits most notes), for a look or a capture
//   upptaka=1             records the round, picture and sound, into window.__recording (a data: URL of a webm), for a video
//   hljod=0               silent (the sound is made but not heard), for a look on a computer that should not play aloud
// Keys for a grown-up at a computer: A S D (or J K L, or the arrows) for the lanes, F and J with two; space or Enter starts.

import { createAudioContext, createOutput } from '../audio/output.js';
import { seededRandom } from '../random.js';
import { laneOf } from './chart.js';
import { createSongClock } from './song-clock.js';
import { createSongSounds } from './sounds.js';
import { createSongGame } from './game.js';

const SONG = new URL('../../assets/audio/sloedla/dino-trail.mp3', import.meta.url);
const asset = path => new URL(`../../assets/${path}`, import.meta.url).href;

// The friends who play, by role (chart.js), in the hues of the style guide (STYLE.md section 3).
const FRIENDS = {
  b: { role: 'b', name: 'Kambeðla', hue: '#8f6aa3', light: '#e6d8ee', dark: '#5d4370', src: asset('eitt/stegosaurus-tail.webp') },
  a: { role: 'a', name: 'Slóeðla', hue: '#6793d0', light: '#d9e5f6', dark: '#4b6fa4', src: asset('eitt/parasaurolophus.webp') },
  c: { role: 'c', name: 'Þórseðla', hue: '#e9b14d', light: '#f7e6c2', dark: '#89682e', src: asset('eitt/brontosaurus.webp') },
};
// The audience: Mosi and the small animals of the forest and the Fen (the book's own photographs, thumbnails).
const AUDIENCE = [
  { src: asset('eitt/mosi.webp'), big: true, zoom: 1.15, dy: 0.05 },
  { src: asset('book/images/frog-photo-thumb.jpg'), zoom: 1.25, dx: 0.12 },
  { src: asset('book/images/snail-photo-thumb.jpg'), zoom: 1.2, dx: 0.05 },
  { src: asset('book/images/beetle-closeup-thumb.jpg'), zoom: 1.1 },
  { src: asset('book/images/emperor-dragonfly-thumb.jpg'), zoom: 1.05 },
  { src: asset('book/images/pond-turtle-thumb.jpg'), zoom: 1.2, dx: -0.05 },
];
const KEYS = {
  3: { a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, arrowleft: 0, arrowdown: 1, arrowup: 1, arrowright: 2 },
  2: { f: 0, j: 1, a: 0, l: 1, d: 0, k: 1, arrowleft: 0, arrowright: 1 },
};
const SEINKUN_KEY = 'mosi-sloedla-seinkun';

const params = new URLSearchParams(location.search);
const options = {
  level: params.get('stig') === 'fullordinn' ? 'fullordinn' : 'barn',
  lanes: params.get('brautir') === '2' ? 2 : 3,
  debug: params.get('debug') === '1',
  self: params.get('sjalf') === '1',
  record: params.get('upptaka') === '1',
  extra: readSeinkun(),
};

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
if (output && params.get('hljod') === '0') output.gain.value = 0; // silent, for a look on a computer that should not play aloud
const mix = context?.createGain(); // the song and the friends together, before the page's output (a recording takes it here)
const music = context?.createGain();
if (mix) {
  mix.connect(output);
  music.gain.value = 0.62;
  music.connect(mix);
}

function loadImage(src) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadSong() {
  const [bytes, sheet, grid] = await Promise.all([
    fetch(SONG).then(r => r.arrayBuffer()),
    fetch(new URL(SONG.href.replace(/\.mp3$/, '.notes.json'))).then(r => r.json()),
    fetch(new URL(SONG.href.replace(/\.mp3$/, '.json'))).then(r => r.json()),
  ]);
  const buffer = context ? await context.decodeAudioData(bytes) : null;
  return { buffer, sheet, grid };
}

const loading = Promise.all([
  loadSong(),
  Promise.all(Object.values(FRIENDS).map(f => loadImage(f.src).then(image => [f.role, image]))).then(Object.fromEntries),
  Promise.all(AUDIENCE.map(a => loadImage(a.src))),
]);

let round = null; // { game, clock, sounds, bot }
let loaded = null;
let recorder = null;

function castFor(lanes) {
  const roles = lanes === 2 ? ['a', 'c'] : ['b', 'a', 'c'];
  return roles.map(role => ({ ...FRIENDS[role], image: loaded.images[role] }));
}

async function start() {
  if (!loaded || !context) return;
  try { await context.resume(); } catch { /* the game goes on silent */ }
  $('start').hidden = true;
  $('end').hidden = true;
  round?.clock.stop();
  const { sheet, grid, buffer } = loaded.song;
  const level = sheet.levels[options.level];
  const cast = castFor(options.lanes);
  const notes = level.notes.map(note => ({ ...note, lane: laneOf(note.role, options.lanes) }));
  const clock = createSongClock(context, { output: music, extra: options.extra });
  const sounds = createSongSounds({ context, key: grid.key, output: mix });
  const game = createSongGame({
    canvas, cast, notes, fall: level.fall, song: { bpm: sheet.bpm, beatOffset: sheet.beatOffset, danceBeats: grid.danceBeats },
    clock, sounds, debug: options.debug,
    audience: AUDIENCE.map((a, i) => ({ ...a, image: loaded.audience[i] })),
    onEnd: result => finish(result),
  });
  round = { game, clock, sounds, bot: options.self ? planBot(notes) : null };
  if (options.record) startRecording();
  clock.start(buffer, 0.35);
}

/** The pretend child of ?sjalf=1: most notes hit, a little early or late, a few missed, and a stray tap now and then. */
function planBot(notes) {
  const random = seededRandom('sloedla-sjalf');
  const taps = [];
  for (const note of notes) {
    const r = random();
    if (r < 0.1) continue; // missed
    const spread = (random() + random() + random() - 1.5) * 0.12;
    taps.push({ lane: note.lane, at: note.t + spread });
    if (r > 0.97) taps.push({ lane: (note.lane + 1) % options.lanes, at: note.t + 0.45 }); // a stray
  }
  return taps.sort((a, b) => a.at - b.at);
}

function finish(result) {
  const words = $('end-words');
  if (words) words.textContent = result.stars === 3 ? 'Slóeðla syngur með þér á hátíðinni!' : 'Viltu spila aftur?';
  $('end').hidden = false;
  window.__sloedlaResult = result;
  if (recorder) setTimeout(() => recorder.state === 'recording' && recorder.stop(), 2500);
}

function startRecording() {
  if (!globalThis.MediaRecorder || !canvas.captureStream) return;
  const sink = context.createMediaStreamDestination();
  mix.connect(sink);
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...sink.stream.getAudioTracks()]);
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
  if (round.bot) {
    const now = round.clock.time();
    while (round.bot.length && round.bot[0].at <= now) {
      const { lane, at } = round.bot.shift();
      round.game.tap(lane, at);
    }
  }
  round.game.frame(perf);
}

// The lanes are tapped with fingers (each on its own: two hands may play two lanes) or keys.
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
    start();
    return;
  }
  const lane = KEYS[options.lanes][key];
  if (round && lane !== undefined) {
    event.preventDefault();
    round.game.tap(lane, round.clock.timeAt(event.timeStamp));
  }
});
addEventListener('resize', () => round?.game.resize());
// A hidden tab holds the song and the round with it (the clock is the audio's), and a visible one lets them go on.
document.addEventListener('visibilitychange', () => {
  if (!context || !round) return;
  if (document.hidden) context.suspend().catch(() => {});
  else context.resume().catch(() => {});
});

// The options on the start card and the end card: the level and the lanes, kept in the address so a reload keeps them.
function choose(name, value) {
  if (name === 'stig') options.level = value;
  if (name === 'brautir') options.lanes = Number(value);
  params.set(name, value);
  history.replaceState(null, '', `?${params}`);
  showOptions();
}
function showOptions() {
  for (const button of document.querySelectorAll('[data-option]')) {
    const [name, value] = button.dataset.option.split('=');
    const on = name === 'stig' ? options.level === value : String(options.lanes) === value;
    button.setAttribute('aria-pressed', String(on));
  }
}
for (const button of document.querySelectorAll('[data-option]')) {
  button.addEventListener('click', () => choose(...button.dataset.option.split('=')));
}
showOptions();
for (const button of document.querySelectorAll('[data-play]')) button.addEventListener('click', () => start());

loading.then(([song, images, audience]) => {
  loaded = { song, images, audience };
  $('play').disabled = false;
  $('play').classList.add('ready');
  document.body.classList.add('ready');
  window.__sloedla = { start, state: () => round?.game.state() ?? null, latency: () => round?.clock.latency() ?? null, options };
  window.__sloedlaReady = true;
  if (options.self && params.get('byrja') === '1') start();
}).catch(error => {
  console.error('Slóeðla: the song could not be loaded', error);
  $('loading-words').textContent = 'Lagið fannst ekki.';
});
requestAnimationFrame(frame);
