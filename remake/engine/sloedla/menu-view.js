// The menu of Slóeðla's song game on the lab page (sloedla-lab.html): step 1 (who plays) and step 2 (the song cards) of the
// start section, and the end's two buttons. The logic is menu.js's; this draws it and carries out its cues: the DJ's lines
// (dj.js: his words in the bubble, his picture bobbing while he talks), the songs' previews (brot.js), and sparks when a card is
// picked (menu-sparks.js). The cards show each song's records on this device at the chosen level (best.js): stars of five, and
// under them the most points ("Met: 7.480").
// It all stands on the menu's stage (spec 2026-10-31-sloedla-valmynd-svid): the evening Fen with the cast (stage.js or
// stage-flat.js, handed in by useStage), a beam of light on each friend, twinkling stars and the words in the game's letters
// (drawWord). .sl's data-screen says which screen shows (hver, lag, hlada, umferd, lok); the stage draws only on the first three.

import { DJ_LINES } from './dj.js';
import { bounce, loadingDone, ringStep } from './stage-motion.js';
import { drawWord, pointsText } from './text.js';

const STAGE_SCREENS = new Set(['hver', 'lag', 'hlada']);
const LANDING = [1, 1.125, 1.25, 1.5, 1.667]; // the cards' bells as they land, over 660 Hz
/** `hex` (#rrggbb) at `alpha`, for a beam in a song's colour. */
const rgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
const MAX_RATIO = 2; // the sky's and the words' canvases, pixels per CSS pixel at most

/**
 * The menu over the page `root`. `onPlay({ song, level, lanes }, { again })` starts a round (`again`: "Spilum aftur"); `onUnlock()` is called at the first tap (the
 * page wakes its audio there); `save(state)` keeps the choices. Returns { showStart(), showEnd(result, newBest), enter() }.
 */
export function createMenuView({ root = document, menu, songs, best, dj = null, brot = null, sparks = null, chimes = null, reduced = false, asset, onPlay, onUnlock = () => {}, save = () => {} }) {
  const $ = selector => root.querySelector(selector);
  const all = selector => [...root.querySelectorAll(selector)];
  const win = root.defaultView ?? globalThis;
  const stageRoot = $('.sl');
  const sky = $('[data-sky]');
  const wordsCanvas = $('[data-words]');
  const beams = Object.fromEntries(all('[data-beam]').map(beam => [beam.dataset.beam, beam]));
  let stage = null; // stage.js or stage-flat.js, once the page has one
  let screenName = stageRoot?.dataset.screen ?? 'hver';
  let words = []; // [{ text, style, y(), size(), wave, at }] drawn in the game's letters
  let clock = 0;
  let raf = 0;
  let last = 0;
  let beamColour = ''; // the beams' colour now ('' white)
  let talkUntil = 0; // the frame clock when the DJ's line ends (0: he says nothing)
  let load = null; // the loading show while it runs (showLoading)
  const loadingBox = $('#loading');
  const disc = $('[data-disc]');
  const discImg = $('[data-disc-img]');
  const tip = $('[data-disc-tip]');
  const flashBox = $('[data-flash]');
  const endCanvas = $('[data-end-words]');
  const endText = $('#end-words');
  let endRaf = 0;
  let endFrom = 0; // when the end showed (the page's ms), for its words' pop and wave
  const discY = () => win.innerHeight * (portrait() ? 0.27 : 0.3);
  const discD = () => Math.min(win.innerHeight * 0.36, win.innerWidth * 0.62);
  const BYRJUM = 0.9; // s of "Byrjum!" before the flash
  const FLASH = 0.65; // s of the white flash; the round takes over at its brightest (0.3 of it)
  const skyStars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.6 + 0.4, p: Math.random() * 6 }));
  const portrait = () => win.innerHeight > win.innerWidth;
  const TITLE = { text: 'Söngur Slóeðlu', style: 'rainbow', y: () => win.innerHeight * (portrait() ? 0.2 : 0.17), size: () => Math.min(win.innerWidth * 0.09, portrait() ? 54 : 84) };
  const setWords = list => { words = list.filter(Boolean).map(word => ({ ...word, at: clock })); };

  function fit(canvas) {
    if (!canvas) return;
    const ratio = Math.min(MAX_RATIO, win.devicePixelRatio || 1);
    canvas.width = Math.round(win.innerWidth * ratio);
    canvas.height = Math.round(win.innerHeight * ratio);
    canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function drawSky() {
    if (!sky) return;
    const g = sky.getContext('2d');
    const w = win.innerWidth, h = win.innerHeight;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff';
    for (const star of skyStars) {
      g.globalAlpha = reduced ? 0.7 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(clock * 2 + star.p));
      g.beginPath();
      g.arc(star.x * w, star.y * h, star.r, 0, 7);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  function drawWords() {
    if (!wordsCanvas) return;
    const g = wordsCanvas.getContext('2d');
    g.clearRect(0, 0, win.innerWidth, win.innerHeight);
    for (const word of words) {
      drawWord(g, word.text, win.innerWidth / 2, word.y(), word.size(), { style: word.style, time: reduced ? 0 : clock, age: reduced ? 9 : clock - word.at, stagger: 0.05, pop: 0.35, wave: reduced ? 0 : word.wave ?? 0.06, fit: win.innerWidth * 0.9 });
    }
  }
  /** Each friend's beam of light down to her feet, off while she is out (or not on the stage). */
  function placeBeams(hop = 0) {
    const feet = stage?.feet() ?? [];
    for (const [id, beam] of Object.entries(beams)) {
      const foot = feet.find(f => f.id === id);
      beam.classList.toggle('on', Boolean(foot && !foot.out));
      if (!foot) continue;
      beam.style.left = `${foot.x - beam.offsetWidth / 2}px`;
      beam.style.height = `${foot.y + win.innerHeight * 0.06}px`;
      beam.style.filter = `blur(6px) brightness(${(1 + 0.9 * (foot.out ? 0 : hop)).toFixed(3)})`;
    }
  }
  function frame(now) {
    raf = 0;
    if (!STAGE_SCREENS.has(screenName)) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    if (load) load.dt = dt;
    drawSky();
    drawWords();
    // step 2 with a song picked: everyone in the round dances to its preview's beat, the beams take its colour and flash on
    // the beat, its card's picture hops
    const picked = screenName === 'lag' ? songs.find(song => song.id === menu.state().song) ?? null : null;
    const beats = picked && !reduced ? brot?.beats() ?? null : null;
    const hop = beats === null ? 0 : bounce(beats);
    stage?.frame(dt, beats, picked?.bpm ?? null);
    placeBeams(hop);
    const beam = picked?.hue ? rgba(picked.hue, 0.55) : '';
    if (beam !== beamColour) {
      beamColour = beam;
      for (const each of Object.values(beams)) beam ? each.style.setProperty('--beam', beam) : each.style.removeProperty('--beam');
    }
    for (const card of cards.children) card.style.setProperty('--hop', card.dataset.song === picked?.id ? hop.toFixed(3) : '0');
    if (load) loadingFrame();
    raf = win.requestAnimationFrame(frame);
  }
  /** One frame of the loading show: the ring after the song, a tick each tenth, then "Byrjum!", the flash, the round. */
  function loadingFrame() {
    const t = clock - load.at;
    if (!load.cheered && !load.again && t >= 0.3) {
      load.cheered = true;
      stage?.cheer();
    }
    load.shown = ringStep(load.shown, load.real, load.dt);
    disc?.style.setProperty('--p', load.shown.toFixed(4));
    if (tip) {
      const a = load.shown * Math.PI * 2, r = 0.5 - 13.5 / discD();
      tip.style.left = `${(0.5 + Math.sin(a) * r) * 100}%`;
      tip.style.top = `${(0.5 - Math.cos(a) * r) * 100}%`;
    }
    const tenth = Math.floor(load.shown * 10 + 1e-9);
    if (tenth > load.ticks) {
      load.ticks = tenth;
      chimes?.tick(1100 + 130 * tenth);
    }
    if (!load.byrjum && loadingDone({ shown: load.shown, now: clock, talkUntil })) {
      load.byrjum = clock;
      setWords([{ text: 'Byrjum!', style: 'rainbow', y: discY, size: () => Math.min(win.innerWidth * 0.17, 120), wave: 0.1 }]);
      chimes?.star(5);
      sparks?.burst(win.innerWidth / 2, discY(), load.song.hue ?? '#ffd24a');
      sparks?.burst(win.innerWidth / 2, discY(), '#ffd24a');
      stage?.cheer();
      disc?.classList.add('done');
    }
    if (load.byrjum && !load.flashed && clock >= load.byrjum + BYRJUM) {
      load.flashed = clock;
      if (!reduced) flashBox?.animate([{ opacity: 0 }, { opacity: 0.92, offset: 0.3 }, { opacity: 0 }], { duration: FLASH * 1000, easing: 'ease-out' });
    }
    if (load.flashed && clock >= load.flashed + (reduced ? 0 : FLASH * 0.3)) {
      const done = load.resolve;
      load = null;
      if (loadingBox) loadingBox.hidden = true;
      stageRoot?.removeAttribute('data-again');
      screen('umferd');
      done();
    }
  }
  /** Shows screen `name` (hver, lag, hlada, umferd, lok); the stage draws only on the menu's own screens. */
  function screen(name) {
    if (name !== screenName) {
      const back = !STAGE_SCREENS.has(screenName) && STAGE_SCREENS.has(name);
      screenName = name;
      if (stageRoot) stageRoot.dataset.screen = name;
      // back from a round: the stage was hidden, and the tablet may have turned since
      if (back) stage?.resize();
      if (name === 'hver') setWords([TITLE]);
      if (name === 'lag' || name === 'lok' || name === 'umferd') setWords([]);
    }
    if (STAGE_SCREENS.has(name) && !raf) {
      last = 0;
      raf = win.requestAnimationFrame(frame);
    }
  }
  /** The end's words (#end-words' text), cream in the game's letters over the buttons, while the end shows. */
  function drawEnd(now) {
    endRaf = 0;
    if (!endCanvas || end.hidden) return;
    if (!endFrom) endFrom = now;
    const t = (now - endFrom) / 1000;
    const g = endCanvas.getContext('2d');
    g.clearRect(0, 0, win.innerWidth, win.innerHeight);
    const size = Math.min(win.innerWidth * 0.07, 34);
    drawWord(g, endText?.textContent ?? '', win.innerWidth / 2, win.innerHeight * (portrait() ? 0.655 : 0.785), size, { style: 'cream', time: reduced ? 0 : t, age: reduced ? 9 : t, stagger: 0.05, pop: 0.35, wave: reduced ? 0 : 0.08, fit: win.innerWidth * 0.9 });
    endRaf = win.requestAnimationFrame(drawEnd);
  }
  fit(sky);
  fit(wordsCanvas);
  fit(endCanvas);
  win.addEventListener('resize', () => {
    fit(sky);
    fit(wordsCanvas);
    fit(endCanvas);
    stage?.resize();
  });
  const start = $('#start');
  const end = $('#end');
  const play = $('#play');
  const cards = $('[data-cards]');
  const sparkCanvas = $('[data-sparks]');
  const bubble = $('[data-say]');
  const djBox = $('.sl-dj');
  let talkTimer = 0;
  let newBest = null; // the song whose best stars just rose (they twinkle)

  const line = key => DJ_LINES[key]?.[0] ?? '';
  function talking(seconds) {
    clearTimeout(talkTimer);
    djBox?.classList.toggle('talking', seconds > 0);
    if (seconds > 0) talkTimer = setTimeout(() => djBox?.classList.remove('talking'), seconds * 1000);
  }
  /** Carries out the menu's cues; the bubble shows the words he says, or `words` (a line's key) while there is no sound yet. */
  function run(cues, words = null) {
    for (const cue of cues) {
      if (cue.hush) {
        dj?.hush();
        talking(0);
        talkUntil = 0;
      }
      if (cue.stop) brot?.stop();
      if (cue.say) {
        const seconds = dj?.play(cue.say) ?? 0;
        if (bubble) bubble.textContent = seconds ? dj.said() : line(cue.say);
        talking(seconds);
        talkUntil = seconds ? clock + seconds : 0;
      }
      if (cue.brot) brot?.play(cue.brot);
    }
    if (words && bubble && !cues.some(cue => cue.say)) bubble.textContent = line(words);
  }

  // the cards, one a song: its picture (on a glow of its colour, which stays if the picture cannot be loaded), name, whose
  // song it is, best stars
  cards.innerHTML = '';
  songs.forEach((song, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `sl-songcard${song.by ? ' gold' : ''}`;
    card.dataset.song = song.id;
    card.style.setProperty('--hue', song.hue ?? '#6793d0');
    card.style.setProperty('--i', String(i));
    const pic = document.createElement('span');
    pic.className = 'sl-cardpic';
    if (song.card) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = asset(`sloedla/valmynd/${song.card}`);
      img.addEventListener('error', () => img.remove());
      pic.append(img);
    }
    const name = document.createElement('span');
    name.className = 'sl-cardname';
    name.textContent = song.name;
    card.append(pic, name);
    if (song.by) {
      const by = document.createElement('span');
      by.className = 'sl-cardby';
      by.textContent = song.by;
      card.append(by);
    }
    const stars = document.createElement('span');
    stars.className = 'sl-stars';
    card.append(stars);
    const met = document.createElement('span'); // the most points, under the stars
    met.className = 'sl-met';
    card.append(met);
    cards.append(card);
  });

  function render() {
    const s = menu.state();
    start.dataset.step = s.step;
    if (!start.hidden && (s.step === 'hver' || s.step === 'lag')) screen(s.step);
    for (const view of all('[data-step-view]')) view.hidden = view.dataset.stepView !== s.step;
    for (const button of all('#start [data-option]')) {
      const [name, value] = button.dataset.option.split('=');
      button.setAttribute('aria-pressed', String((name === 'stig' ? s.level : String(s.lanes)) === value));
    }
    for (const card of all('[data-song]')) {
      card.setAttribute('aria-pressed', String(card.dataset.song === s.song));
      const { stars: n, points } = best.get(card.dataset.song, s.level);
      const stars = card.querySelector('.sl-stars');
      const won = document.createElement('b'); // the stars won, gold; the rest faint
      won.textContent = '★'.repeat(n);
      stars.replaceChildren(won, '★'.repeat(Math.max(0, 5 - n)));
      stars.setAttribute('aria-label', `${n} af 5 stjörnum`);
      stars.classList.toggle('new', card.dataset.song === newBest);
      const met = card.querySelector('.sl-met');
      met.textContent = points > 0 ? `Met: ${pointsText(points)}` : '';
      met.hidden = !(points > 0);
    }
    cards.classList.toggle('has-pick', Boolean(s.song));
    play.classList.toggle('show', Boolean(s.song)); // it pops in when it first shows
    play.setAttribute('aria-hidden', String(!s.song));
  }
  /** The cards fly in one by one; a bell, higher and higher, as each lands. */
  function cardsIn() {
    songs.forEach((song, i) => setTimeout(() => chimes?.sparkle(660 * LANDING[i % LANDING.length]), (0.38 + i * 0.09) * 1000));
  }

  /** "Spila!" (or, `again`, "Spilum aftur"): once, however many taps, and not before the page is ready to play. */
  function go({ again = false } = {}) {
    if (play.disabled) return;
    const cues = again ? menu.again() : menu.go();
    if (!cues) return;
    run(cues);
    newBest = null;
    onPlay(menu.play(), { again });
  }

  for (const button of all('#start [data-option]')) {
    button.addEventListener('click', () => {
      run(menu.choose(...button.dataset.option.split('=')));
      save(menu.state());
      render();
      const { level, lanes } = menu.state();
      stage?.setChoice({ level, lanes });
      chimes?.sparkle(880);
      button.classList.remove('picked');
      void button.offsetWidth; // start the pop again
      button.classList.add('picked');
    });
  }
  $('[data-to-songs]')?.addEventListener('click', () => {
    run(menu.toSongs(), 'hvadalag');
    render();
    cardsIn();
  });
  // a card picked: it pops and sparks with a bell (also when it is tapped again; then nothing else happens), its line and its bit
  cards.addEventListener('click', event => {
    const card = event.target.closest('[data-song]');
    if (!card) return;
    run(menu.pick(card.dataset.song), `lag-${card.dataset.song}`);
    save(menu.state());
    render();
    chimes?.sparkle(990);
    card.classList.remove('just');
    void card.offsetWidth; // start the pop again
    card.classList.add('just');
    if (sparks && sparkCanvas) {
      const a = card.getBoundingClientRect(), b = sparkCanvas.getBoundingClientRect();
      sparks.burst(a.left + a.width / 2 - b.left, a.top + a.height * 0.4 - b.top, card.style.getPropertyValue('--hue'));
    }
  });
  $('[data-back]')?.addEventListener('click', () => {
    run(menu.back(), 'hverspilar');
    render();
  });
  play.addEventListener('click', () => go());
  $('[data-again]')?.addEventListener('click', () => go({ again: true }));
  // "Annað lag" shows a little fan of the songs' pictures
  const fan = $('[data-fan]');
  if (fan) {
    for (const song of songs) {
      if (!song.card) continue;
      const img = root.createElement?.('img') ?? new Image();
      img.alt = '';
      img.src = asset(`sloedla/valmynd/${song.card}`);
      fan.append(img);
    }
  }
  $('[data-other]')?.addEventListener('click', () => {
    end.hidden = true;
    start.hidden = false;
    screen('lag');
    run(menu.other(), 'hvadalag');
    render();
    cardsIn();
  });
  // a browser lets sound begin only from a tap: the first one wakes the audio, and the menu may speak from then on
  root.addEventListener('pointerdown', () => {
    onUnlock();
    run(menu.unlock());
  }, { once: true, capture: true });

  if (bubble) bubble.textContent = line(menu.state().step === 'lag' ? 'hvadalag' : 'hverspilar');
  if (screenName === 'hver') setWords([TITLE]);
  render();
  screen(screenName);

  return {
    /** The stage to draw the cast on (stage.js, or stage-flat.js in its place); it takes the current choice, with no reactions. */
    useStage(next) {
      stage = next;
      const { level, lanes } = menu.state();
      stage?.setChoice({ level, lanes });
      stage?.resize();
    },
    screen,
    /**
     * The wait while `song` (a SONGS_V2 entry) loads, as a show: the stage moves down and closer, its picture on a disc, a gold
     * ring that fills as the page says (progress(share), 0..1 of its parts in), never faster than RING_MIN; then "Byrjum!" once
     * the DJ has finished his line, and a flash. `again` ("Spilum aftur"): the ring full at once, no name. `finished` resolves
     * when the round should begin.
     */
    showLoading(song, { again = false } = {}) {
      start.hidden = true;
      end.hidden = true;
      if (loadingBox) loadingBox.hidden = false;
      if (disc) {
        disc.classList.remove('done');
        disc.style.setProperty('--hue', song.hue ?? '#ffd24a');
        disc.style.setProperty('--y', `${discY()}px`);
        disc.style.setProperty('--d', `${discD()}px`);
        disc.style.setProperty('--p', again ? '1' : '0');
      }
      if (discImg) discImg.src = song.card ? asset(`sloedla/valmynd/${song.card}`) : '';
      stageRoot?.toggleAttribute('data-again', again); // "Spilum aftur": only the disc and "Byrjum!", the DJ quiet and away
      screen('hlada');
      const below =() => discY() + discD() / 2 + Math.min(54, win.innerHeight * 0.07);
      setWords(again ? [] : [
        { text: song.name, style: 'rainbow', y: below, size: () => Math.min(win.innerWidth * 0.1, 60) },
        song.by && { text: song.by, style: 'cream', y: () => below() + Math.min(46, win.innerHeight * 0.055), size: () => Math.min(win.innerWidth * 0.06, 30), wave: 0.03 },
      ]);
      let resolve;
      const finished = new Promise(r => { resolve = r; });
      load = { song, again, at: clock, dt: 0, real: again ? 1 : 0, shown: again ? 1 : 0, ticks: again ? 10 : 0, cheered: false, byrjum: 0, flashed: 0, resolve };
      const show = load;
      return {
        /** The share of the song's parts in so far (0..1); the ring follows it, never ahead. */
        progress(share) {
          show.real = Math.max(show.real, Math.min(1, Math.max(0, share)));
        },
        finished,
      };
    },
    showStart() {
      end.hidden = true;
      start.hidden = false;
      render();
    },
    /** The round ended: its words, and the two buttons; `rose` says the song's best stars rose. */
    showEnd(result, rose = false) {
      newBest = rose ? menu.state().song : null;
      end.hidden = false;
      screen('lok');
      render();
      endFrom = 0;
      if (!endRaf) endRaf = win.requestAnimationFrame(drawEnd);
      // two bells as the buttons come up
      win.setTimeout(() => chimes?.sparkle(880), 650);
      win.setTimeout(() => chimes?.sparkle(1175), 750);
    },
    /** Enter or space: on to the songs, play the picked one, or play again. */
    enter() {
      if (!end.hidden) return go({ again: true });
      if (start.hidden) return;
      if (menu.state().step === 'hver') $('[data-to-songs]')?.click();
      else go();
    },
  };
}
