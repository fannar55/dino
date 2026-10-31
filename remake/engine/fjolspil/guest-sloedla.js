// Söngur Slóeðlu on a guest's phone or tablet (spec §5 and §7): the guest page's screen for the song game, views.sloedla. The big
// screen sends a view at each step of a song (`{ screen: 'sloedla', phase }`) and, while one plays, a stream of `song` messages
// (remote-round.js reads them); the page asks the big screen the time (`time { sent }`, clock-sync.js) and sends each tap stamped
// with the big screen's clock (`act { type: 'tap', at }`). The music plays only on the big screen: here the round is drawn by the
// game itself (game.js in guest mode) from the notes the big screen sends, and the page judges her taps at once with the same
// rules (the word, the sparks, a buzz: 15 ms, 30 ms for „Fullkomið!“ and „Frábært!“), while the big screen's word on every note
// decides what the note became.
//
//   ready  „Tilbúin!“ with the song's picture and name, while the big screen loads it: the clock is measured (MEASURE: eight
//          asks 50 ms apart, then one a second, which is also how the big screen knows she is there); „Tengist…“ until it
//          answers. At `start` the round fills the page once the clock is there: on a phone (deviceOf) her lane only, a big
//          button low down, her dinosaur and name at the top, and the lower half of the screen plays it; on a tablet the whole
//          stage with the Fen behind, her lane lit and played, the others dim with their players' names, their notes bursting
//          or going grey by the big screen's word. The screen is kept awake while it plays (navigator.wakeLock).
//   late   „Þú kemst inn í næsta lagi!“ with the song's picture: she came back while a song played (Egill has her dinosaur)
//   end    the band's stars (of five) and her line (her dinosaur, name, points and „Frábært!“ count), then „Bíðum eftir næsta
//          lagi…“
//   bless  „Takk fyrir að spila!“: Egill plays alone now
//
// window.__sloedlaGuest = { state(), clock } is for the walk (remake/tools/sloedla-fjolspil-walk.mjs): her lane's notes, the words
// her taps had, where her button is. The look is spil.css's .sl-guest-*.

import { SAFE_PICTURE } from './guest.js';
import { BACKDROP, FRIENDS } from '../sloedla/friends.js';
import { createSongGame } from '../sloedla/game.js';
import { createRemoteRound } from '../sloedla/remote-round.js';
import { FOLLOW, MEASURE, createClockSync } from '../sloedla/clock-sync.js';
import { laneRules } from '../sloedla/lineup.js';
import { pointsText } from '../sloedla/text.js';

const WORDS = {
  ready: 'Tilbúin!',
  connecting: 'Tengist…',
  late: 'Þú kemst inn í næsta lagi!',
  wait: 'Bíðum eftir næsta lagi…',
  bless: 'Takk fyrir að spila!',
  great: n => `Frábært! ×${n}`,
};
const PHONE_BELOW = 600; // CSS px: a screen whose shorter side is under this is a phone (spec §7)
const BUZZ = { hit: 15, great: 30 }; // ms

const REMAKE = new URL('../../', import.meta.url);
const pictureUrl = path => new URL(path, REMAKE).href;

/** 'simi' (a phone: her lane only) or 'spjald' (a tablet: the whole stage); ?taeki=simi|spjald chooses (`override`). */
export function deviceOf(width, height, override = null) {
  if (override === 'simi' || override === 'spjald') return override;
  return Math.min(width, height) < PHONE_BELOW ? 'simi' : 'spjald';
}

let session = null; // the screen now: one page shows one at a time

/** The guest page's view renderer for `{ screen: 'sloedla', phase }` (guest.js: the same `root` while the game's views follow). */
export function renderSloedla(root, view, { send, doc, post, listen }) {
  if (!session || session.root !== root) {
    session?.stop();
    session = createScreen(root, { send, doc, post, listen });
  }
  session.show(view ?? {});
}

function createScreen(root, { send, doc, post, listen }) {
  const win = doc.defaultView ?? null;
  const now = () => (win?.performance ?? globalThis.performance).now();
  const device = deviceOf(win?.innerWidth ?? 390, win?.innerHeight ?? 844, new URLSearchParams(win?.location?.search ?? '').get('taeki'));
  const sync = createClockSync();
  const at = {
    phase: null, remote: null, start: null, game: null, lane: -1, canvas: null, raf: null, timers: [], every: null, lock: null,
    images: null, backdrop: null, waitNote: null, words: [],
  };
  const offs = [listen('time', heard), listen('song', onSong)];

  const make = (tag, className, text = null) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text !== null) el.textContent = text;
    return el;
  };

  // ---- The clock -------------------------------------------------------------------------------------------------------

  const ask = () => post('time', sync.request(now()));

  /** Eight quick asks, then one a second for as long as this screen shows a song (they are her sign of life too). */
  function measure() {
    stopAsking();
    sync.measure();
    for (let i = 0; i < MEASURE.asks; i++) at.timers.push(win?.setTimeout(ask, i * MEASURE.gapMs));
    at.timers.push(win?.setTimeout(() => {
      sync.follow();
      at.every = win?.setInterval(ask, FOLLOW.everyMs) ?? null;
    }, MEASURE.asks * MEASURE.gapMs));
  }

  function stopAsking() {
    for (const id of at.timers) win?.clearTimeout(id);
    at.timers = [];
    if (at.every !== null) win?.clearInterval(at.every);
    at.every = null;
  }

  function heard(body) {
    if (sync.receive(body, now()) && at.waitNote) at.waitNote.hidden = true;
  }

  // ---- The pictures ----------------------------------------------------------------------------------------------------

  const load = src => new Promise(resolve => {
    if (!win?.Image) return resolve(null);
    const image = new win.Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

  function loadPictures() {
    if (at.images) return;
    at.images = 'loading';
    const friends = Promise.all(Object.values(FRIENDS).map(friend => load(friend.src).then(image => [friend.role, image])));
    const fen = device === 'spjald' ? Promise.all([load(BACKDROP.wide), load(BACKDROP.upright)]) : Promise.resolve([null, null]);
    Promise.all([friends, fen]).then(([list, [image, upright]]) => {
      at.images = Object.fromEntries(list);
      at.backdrop = image ? { image, upright, fade: BACKDROP.fade, fadeUpright: BACKDROP.fadeUpright } : null;
    });
  }

  // ---- The screens -----------------------------------------------------------------------------------------------------

  /** A card in the paper: a picture (a path under remake/assets/ only), the song's name, the words, a note under them. */
  function card({ picture = null, name = null, words, note = null }) {
    const box = make('div', 'sl-guest-card');
    if (typeof picture === 'string' && SAFE_PICTURE.test(picture)) {
      const img = make('img', 'sl-guest-picture');
      img.alt = '';
      img.src = pictureUrl(picture);
      box.append(img);
    }
    if (typeof name === 'string' && name) box.append(make('p', 'sl-guest-song', name));
    box.append(make('h2', 'sl-guest-words', words));
    const noteEl = note ? make('p', 'sl-guest-note', note) : null;
    if (noteEl) box.append(noteEl);
    root.replaceChildren(box);
    return { box, note: noteEl };
  }

  function ready(view) {
    if (at.phase === 'ready' && at.remote) return; // the same song's view again (a reconnect): the round goes on
    at.phase = 'ready';
    const shown = card({ picture: view.song?.picture, name: view.song?.name, words: WORDS.ready, note: WORDS.connecting });
    at.waitNote = shown.note;
    shown.note.hidden = sync.offset !== null;
    send({ type: 'ready' }); // in the middle of a song this page has none of it (reloaded): the big screen gives her dinosaur to Egill
    measure();
    loadPictures();
  }

  function end(view) {
    const box = make('div', 'sl-guest-card sl-guest-end');
    const stars = make('div', 'sl-guest-stars');
    const won = Math.max(0, Math.min(5, Math.round(Number(view.stars) || 0)));
    for (let i = 0; i < 5; i++) {
      const star = make('span', i < won ? 'sl-guest-star lit' : 'sl-guest-star', '★');
      stars.append(star);
    }
    stars.setAttribute('aria-label', `${won} af 5 stjörnum`);
    box.append(stars);
    const line = view.line;
    if (line && typeof line.name === 'string') {
      const row = make('div', 'sl-guest-line');
      for (const role of (Array.isArray(line.roles) ? line.roles : []).filter(role => FRIENDS[role])) {
        const img = make('img', 'sl-guest-friend');
        img.alt = FRIENDS[role].name;
        img.src = FRIENDS[role].src;
        row.append(img);
      }
      row.append(make('span', 'sl-guest-name', line.name));
      row.append(make('span', 'sl-guest-points', pointsText(Number(line.points) || 0)));
      row.append(make('span', 'sl-guest-great', WORDS.great(Math.max(0, Math.round(Number(line.great) || 0)))));
      box.append(row);
    }
    box.append(make('p', 'sl-guest-wait', WORDS.wait));
    root.replaceChildren(box);
  }

  function show(view) {
    const phase = view.phase;
    if (!['ready', 'late', 'end', 'bless'].includes(phase)) return;
    root.setAttribute('data-phase', phase);
    if (phase === 'ready') return ready(view);
    stopRound();
    stopAsking();
    at.phase = phase;
    at.waitNote = null;
    if (phase === 'late') card({ picture: view.song?.picture, name: view.song?.name, words: WORDS.late });
    else if (phase === 'end') end(view);
    else card({ words: WORDS.bless });
  }

  // ---- The round -------------------------------------------------------------------------------------------------------

  function onSong(body) {
    if (at.phase !== 'ready') return; // a song she is not in (late, or after the end)
    if (body?.kind === 'start') return begin(body);
    const told = at.remote?.receive(body);
    if (told?.kind === 'played') at.game?.verdict(told.index, told.verdict);
  }

  /** `start`: her round, drawn as soon as the clock and the pictures are there. */
  function begin(body) {
    stopRound();
    const remote = createRemoteRound({ sync, now, every: device === 'spjald' });
    remote.receive(body);
    const lanes = Array.isArray(body.lanes) ? body.lanes.filter(role => FRIENDS[role]) : [];
    if (!lanes.includes(remote.mine)) return; // not hers to play
    at.remote = remote;
    at.start = { lanes, levels: body.levels ?? {}, names: body.names ?? {} };
    at.words = [];
    if (win?.requestAnimationFrame) at.raf = win.requestAnimationFrame(loop);
  }

  function loop(perf) {
    at.raf = null;
    if (!at.remote) return;
    if (root.isConnected === false) return stop(); // the page went to another screen
    if (!at.game && sync.offset !== null && at.remote.clock.time() !== null && at.images && at.images !== 'loading') play();
    at.game?.frame(perf ?? now());
    at.raf = win.requestAnimationFrame(loop);
  }

  /** The round on the page: her lane on a phone, the whole stage on a tablet. */
  function play() {
    const mine = at.remote.mine;
    const phone = device === 'simi';
    const roles = phone ? [mine] : at.start.lanes;
    const levelOf = role => (at.start.levels[role] === 'fullordinn' ? 'fullordinn' : 'barn');
    const nameOf = role => (typeof at.start.names[role] === 'string' ? at.start.names[role] : null);
    const lineup = roles.map(role => (role === mine
      ? { role, player: 1, level: levelOf(role), judged: 'here', name: null }
      : { role, player: 0, level: levelOf(role), judged: 'outside', name: nameOf(role) }));
    const cast = roles.map(role => ({ ...FRIENDS[role], image: at.images[role] ?? null }));
    const stage = make('div', `sl-guest-play ${phone ? 'simi' : 'spjald'}`);
    const canvas = make('canvas', 'sl-guest-canvas');
    stage.append(canvas);
    if (phone) {
      const head = make('div', 'sl-guest-head');
      const img = make('img', 'sl-guest-friend');
      img.alt = '';
      img.src = FRIENDS[mine].src;
      head.append(img, make('span', 'sl-guest-head-name', nameOf(mine) ?? FRIENDS[mine].name));
      stage.append(head);
    }
    root.replaceChildren(stage);
    at.canvas = canvas;
    at.lane = roles.indexOf(mine);
    at.game = createSongGame({
      canvas, cast, lineup, mode: 'guest',
      conductor: at.remote.conductor, clock: at.remote.clock,
      fall: Math.max(...lineup.map(lane => laneRules(lane).fall)),
      backdrop: phone ? null : at.backdrop,
    });
    canvas.addEventListener('pointerdown', onPointer);
    win?.addEventListener('resize', onResize);
    win?.navigator?.wakeLock?.request?.('screen').then(lock => {
      if (at.game) at.lock = lock;
      else lock.release?.().catch?.(() => {});
    }).catch(() => {});
  }

  const onResize = () => at.game?.resize();

  /** A finger down: her lane (on a phone the lower half of the screen) plays at the touch's own time. */
  function onPointer(event) {
    event.preventDefault?.();
    if (!at.game) return;
    const rect = at.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const lane = device === 'simi' ? (y >= rect.height / 2 ? 0 : -1) : at.game.laneAt(x);
    if (lane !== at.lane) return;
    const stamp = Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : now();
    const time = at.remote.clock.timeAt(stamp);
    if (time === null) return;
    const result = at.game.tap(lane, time);
    send({ type: 'tap', at: sync.toHost(stamp) });
    if (result?.kind !== 'hit') return;
    const best = result.grade === 'perfect' || result.grade === 'great';
    win?.navigator?.vibrate?.(best ? BUZZ.great : BUZZ.hit);
    at.words.push({ id: result.note.id, grade: result.grade });
  }

  function stopRound() {
    if (at.raf !== null) win?.cancelAnimationFrame(at.raf);
    at.raf = null;
    at.canvas?.removeEventListener('pointerdown', onPointer);
    win?.removeEventListener('resize', onResize);
    at.lock?.release?.().catch?.(() => {});
    Object.assign(at, { remote: null, start: null, game: null, canvas: null, lane: -1, lock: null });
  }

  function stop() {
    stopRound();
    stopAsking();
    offs.forEach(off => off?.());
  }

  const screen = {
    root,
    show,
    stop,
    state() {
      const remote = at.remote;
      const mine = remote?.mine ?? null;
      return {
        phase: at.phase, device, mine, synced: sync.offset !== null, playing: Boolean(at.game),
        time: remote?.clock.time() ?? null,
        notes: remote ? remote.conductor.chart.filter(note => note.role === mine).map(note => ({ id: note.id, t: note.t })) : [],
        words: at.words.slice(),
        button: at.game && at.lane >= 0 ? at.game.spot(at.lane) : null,
      };
    },
  };
  if (win) win.__sloedlaGuest = { state: () => screen.state(), clock: sync };
  return screen;
}
