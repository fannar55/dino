// The lab page of Slóeðla's song game (sloedla-lab.html): the round on a page of its own, never linked from the game, to prove the
// play and the music before anything else is built. The songs are written as data (songs/) and played by the game itself
// (conductor.js), so a hit or a miss changes what is heard. It waits for a tap on "Spila" (a browser lets sound begin only from a
// touch), plays a round, shows the stars and offers another.
//
// The address says how (all optional):
//   lag=<id>              which song (songs/index.js), the first by default
//   stig=barn|fullordinn  the child's notes (marked in the song, two beats apart at least) or the grown-ups' (every part's notes)
//   brautir=3|2           three lanes (Kambeðla, Slóeðla, Þórseðla) or two (Slóeðla and Þórseðla; Kambeðla then just plays along)
//   seinkun=<ms>          sound heard this much later than the browser knows (a Bluetooth speaker): kept for the next visit
//   debug=1               the clock's numbers in a corner: the section and its version, the gates, the taps' mean error, fps
//   sjalf=1               plays itself (a pretend child), for a look or a capture; sjalf=illa plays badly (to hear the calm versions)
//   upptaka=1             records the round, picture and sound, into window.__recording (a data: URL of a webm), for a video
//   hljod=0               silent speakers (the sound is still made, and recorded)
// Keys for a grown-up at a computer: A S D (or J K L, or the arrows) for the lanes, F and J with two; space or Enter starts.

import { createAudioContext, createOutput } from '../audio/output.js';
import { seededRandom } from '../random.js';
import { LEVELS } from './chart.js';
import { createSongClock } from './song-clock.js';
import { createSongSounds } from './sounds.js';
import { createBand, createReverb } from './band.js';
import { createConductor } from './conductor.js';
import { createSongGame } from './game.js';
import { SONGS, loadSong } from './songs/index.js';
import { rootHz } from './song.js';

const asset = path => new URL(`../../assets/${path}`, import.meta.url).href;

// The friends who play, by role (song.js), in the hues of the style guide (STYLE.md section 3).
const FRIENDS = {
  b: { role: 'b', name: 'Kambeðla', hue: '#8f6aa3', light: '#e6d8ee', dark: '#5d4370', src: asset('eitt/stegosaurus-tail.webp') },
  a: { role: 'a', name: 'Slóeðla', hue: '#6793d0', light: '#d9e5f6', dark: '#4b6fa4', src: asset('eitt/parasaurolophus.webp') },
  c: { role: 'c', name: 'Þórseðla', hue: '#e9b14d', light: '#f7e6c2', dark: '#89682e', src: asset('eitt/brontosaurus.webp') },
};
const KEYS = {
  3: { a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, arrowleft: 0, arrowdown: 1, arrowup: 1, arrowright: 2 },
  2: { f: 0, j: 1, a: 0, l: 1, d: 0, k: 1, arrowleft: 0, arrowright: 1 },
};
const SEINKUN_KEY = 'mosi-sloedla-seinkun';

const params = new URLSearchParams(location.search);
const options = {
  song: params.get('lag') ?? SONGS[0].id,
  level: params.get('stig') === 'fullordinn' ? 'fullordinn' : 'barn',
  lanes: params.get('brautir') === '2' ? 2 : 3,
  debug: params.get('debug') === '1',
  self: params.get('sjalf'),
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
if (output && params.get('hljod') === '0') output.gain.value = 0;
const mix = context?.createGain(); // everything the round plays, before the page's output (a recording takes it here)
let room = null;
if (mix) {
  mix.connect(output);
  room = createReverb(context);
  const wet = context.createGain();
  wet.gain.value = 0.5;
  room.connect(wet);
  wet.connect(mix);
}

function loadImage(src) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

const loading = Promise.all(Object.values(FRIENDS).map(f => loadImage(f.src).then(image => [f.role, image]))).then(Object.fromEntries);

let round = null; // { game, clock, conductor, bot }
let images = null;
let recorder = null;

async function start() {
  if (!images || !context) return;
  try { await context.resume(); } catch { /* the game goes on silent */ }
  $('start').hidden = true;
  $('end').hidden = true;
  round?.conductor.stop();
  const song = await loadSong(options.song);
  const roles = options.lanes === 2 ? ['a', 'c'] : ['b', 'a', 'c'];
  const cast = roles.map(role => ({ ...FRIENDS[role], image: images[role] }));
  const fall = LEVELS[options.level].fall;
  const clock = createSongClock(context, { extra: options.extra });
  const sounds = createSongSounds({ context, output: mix, room });
  const band = createBand(context, { output: mix, room });
  const conductor = createConductor({ context, song, clock, band, sounds, out: mix, room, level: options.level, roles, fall });
  const root = rootHz(song.root) * 2;
  const game = createSongGame({
    canvas, cast, conductor, fall, clock, debug: options.debug,
    chimes: { star: n => sounds.star(n, root), sparkle: () => sounds.sparkle(root * 2) },
    onEnd: result => finish(result),
  });
  round = { game, clock, conductor, bot: options.self ? createBot(conductor, cast, options.self) : null };
  if (options.record) startRecording();
  conductor.start(0.4);
  window.__sloedla.round = round;
}

/** The pretend child of ?sjalf=1 (most notes hit, a little early or late) or ?sjalf=illa (fewer, to hear the calm versions). */
function createBot(conductor, cast, how) {
  const random = seededRandom(`sloedla-sjalf-${how}`);
  const hitRate = how === 'illa' ? 0.4 : 0.9;
  let planned = 0;
  const taps = [];
  return {
    due(now) {
      const chart = conductor.chart;
      for (; planned < chart.length; planned++) {
        const note = chart[planned];
        if (random() > hitRate) continue;
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
  $('end-words').textContent = result.stars === 3 ? 'Slóeðla syngur með þér á hátíðinni!' : 'Viltu spila aftur?';
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
  if (round.bot) for (const { lane, at } of round.bot.due(round.clock.time())) round.game.tap(lane, at);
  round.game.frame(perf);
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
document.addEventListener('visibilitychange', () => {
  if (!context || !round) return;
  if (document.hidden) context.suspend().catch(() => {});
  else context.resume().catch(() => {});
});

// The options on the start and end cards: the song, the level and the lanes, kept in the address so a reload keeps them.
function choose(name, value) {
  if (name === 'lag') options.song = value;
  if (name === 'stig') options.level = value;
  if (name === 'brautir') options.lanes = Number(value);
  params.set(name, value);
  history.replaceState(null, '', `?${params}`);
  showOptions();
}
function showOptions() {
  for (const button of document.querySelectorAll('[data-option]')) {
    const [name, value] = button.dataset.option.split('=');
    const now = { lag: options.song, stig: options.level, brautir: String(options.lanes) }[name];
    button.setAttribute('aria-pressed', String(now === value));
  }
}
for (const holder of document.querySelectorAll('[data-songs]')) {
  holder.innerHTML = SONGS.map(song => `<button type="button" data-option="lag=${song.id}">${song.name}</button>`).join('');
}
for (const button of document.querySelectorAll('[data-option]')) button.addEventListener('click', () => choose(...button.dataset.option.split('=')));
showOptions();
for (const button of document.querySelectorAll('[data-play]')) button.addEventListener('click', () => start());

window.__sloedla = { start, state: () => round?.game.state() ?? null, latency: () => round?.clock.latency() ?? null, options };
loading.then(loaded => {
  images = loaded;
  $('play').disabled = false;
  $('play').classList.add('ready');
  window.__sloedlaReady = true;
}).catch(error => {
  console.error('Slóeðla: the pictures could not be loaded', error);
});
requestAnimationFrame(frame);
