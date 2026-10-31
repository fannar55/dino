// The menu of Slóeðla's song game on the lab page (sloedla-lab.html): step 1 (who plays) and step 2 (the song cards) of the
// start section, and the end's two buttons. The logic is menu.js's; this draws it and carries out its cues: the DJ's lines
// (dj.js: his words in the bubble, his picture bobbing while he talks), the songs' previews (brot.js), and sparks when a card is
// picked (menu-sparks.js). The cards show each song's records on this device at the chosen level (best.js): stars of five, and
// under them the most points ("Met: 7.480").
// It all stands on the menu's stage (spec 2026-10-31-sloedla-valmynd-svid): the evening Fen with the cast (stage.js or
// stage-flat.js, handed in by useStage), a beam of light on each friend, twinkling stars and the words in the game's letters
// (drawWord). .sl's data-screen says which screen shows (hver, lag, hlada, umferd, lok); the stage draws only on the first three.

import { DJ_LINES } from './dj.js';
import { bounce } from './stage-motion.js';
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
    raf = win.requestAnimationFrame(frame);
  }
  /** Shows screen `name` (hver, lag, hlada, umferd, lok); the stage draws only on the menu's own screens. */
  function screen(name) {
    if (name !== screenName) {
      screenName = name;
      if (stageRoot) stageRoot.dataset.screen = name;
      if (name === 'hver') setWords([TITLE]);
      if (name === 'lag' || name === 'lok' || name === 'umferd') setWords([]);
    }
    if (STAGE_SCREENS.has(name) && !raf) {
      last = 0;
      raf = win.requestAnimationFrame(frame);
    }
  }
  fit(sky);
  fit(wordsCanvas);
  win.addEventListener('resize', () => {
    fit(sky);
    fit(wordsCanvas);
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
      if (cue.hush) { dj?.hush(); talking(0); }
      if (cue.stop) brot?.stop();
      if (cue.say) {
        const seconds = dj?.play(cue.say) ?? 0;
        if (bubble) bubble.textContent = seconds ? dj.said() : line(cue.say);
        talking(seconds);
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
    screen('umferd');
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
