// The menu of Slóeðla's song game on the lab page (sloedla-lab.html): step 1 (who plays) and step 2 (the song cards) of the
// start section, and the end's two buttons. The logic is menu.js's; this draws it and carries out its cues: the DJ's lines
// (dj.js: his words in the bubble, his picture bobbing while he talks), the songs' previews (brot.js), and sparks when a card is
// picked (menu-sparks.js). The cards show each song's best stars on this device at the chosen level (best.js).

import { DJ_LINES } from './dj.js';

/**
 * The menu over the page `root`. `onPlay({ song, level, lanes })` starts a round; `onUnlock()` is called at the first tap (the
 * page wakes its audio there); `save(state)` keeps the choices. Returns { showStart(), showEnd(result, newBest), enter() }.
 */
export function createMenuView({ root = document, menu, songs, best, dj = null, brot = null, sparks = null, asset, onPlay, onUnlock = () => {}, save = () => {} }) {
  const $ = selector => root.querySelector(selector);
  const all = selector => [...root.querySelectorAll(selector)];
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
    card.style.setProperty('--sway', `${i % 2 ? 1.2 : -1.2}deg`);
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
    cards.append(card);
  });

  function render() {
    const s = menu.state();
    start.dataset.step = s.step;
    for (const view of all('[data-step-view]')) view.hidden = view.dataset.stepView !== s.step;
    for (const button of all('#start [data-option]')) {
      const [name, value] = button.dataset.option.split('=');
      button.setAttribute('aria-pressed', String((name === 'stig' ? s.level : String(s.lanes)) === value));
    }
    for (const card of all('[data-song]')) {
      card.setAttribute('aria-pressed', String(card.dataset.song === s.song));
      const n = best.get(card.dataset.song, s.level);
      const stars = card.querySelector('.sl-stars');
      stars.textContent = '★'.repeat(n) + '☆'.repeat(3 - n);
      stars.setAttribute('aria-label', `${n} af 3 stjörnum`);
      stars.classList.toggle('new', card.dataset.song === newBest);
    }
    cards.classList.toggle('has-pick', Boolean(s.song));
    const wasHidden = play.hidden;
    play.hidden = !s.song;
    if (wasHidden && !play.hidden) {
      play.classList.remove('pop');
      void play.offsetWidth; // start the pop again
      play.classList.add('pop');
    }
  }

  function go() {
    const choice = menu.play();
    if (!choice) return;
    run([{ hush: true }, { stop: true }]);
    newBest = null;
    onPlay(choice);
  }

  for (const button of all('#start [data-option]')) {
    button.addEventListener('click', () => {
      run(menu.choose(...button.dataset.option.split('=')));
      save(menu.state());
      render();
    });
  }
  $('[data-to-songs]')?.addEventListener('click', () => {
    run(menu.toSongs(), 'hvadalag');
    render();
  });
  cards.addEventListener('click', event => {
    const card = event.target.closest('[data-song]');
    if (!card) return;
    run(menu.pick(card.dataset.song), `lag-${card.dataset.song}`);
    save(menu.state());
    render();
    if (sparks && sparkCanvas) {
      const a = card.getBoundingClientRect(), b = sparkCanvas.getBoundingClientRect();
      sparks.burst(a.left + a.width / 2 - b.left, a.top + a.height * 0.4 - b.top, card.style.getPropertyValue('--hue'));
    }
  });
  $('[data-back]')?.addEventListener('click', () => {
    run(menu.back(), 'hverspilar');
    render();
  });
  play.addEventListener('click', go);
  $('[data-again]')?.addEventListener('click', go);
  $('[data-other]')?.addEventListener('click', () => {
    end.hidden = true;
    start.hidden = false;
    run(menu.other(), 'hvadalag');
    render();
  });
  // a browser lets sound begin only from a tap: the first one wakes the audio, and the menu may speak from then on
  root.addEventListener('pointerdown', () => {
    onUnlock();
    run(menu.unlock());
  }, { once: true, capture: true });

  if (bubble) bubble.textContent = line(menu.state().step === 'lag' ? 'hvadalag' : 'hverspilar');
  render();

  return {
    showStart() {
      end.hidden = true;
      start.hidden = false;
      render();
    },
    /** The round ended: its words, and the two buttons; `rose` says the song's best stars rose. */
    showEnd(result, rose = false) {
      newBest = rose ? menu.state().song : null;
      end.hidden = false;
      render();
    },
    /** Enter or space: on to the songs, play the picked one, or play again. */
    enter() {
      if (!end.hidden) return go();
      if (start.hidden) return;
      if (menu.state().step === 'hver') $('[data-to-songs]')?.click();
      else go();
    },
  };
}
