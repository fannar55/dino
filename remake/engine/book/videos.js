import { pressable, reducedMotion } from './fx.js';
import { ICONS } from './icons.js';
import { isUnlocked, bookState, FIND_ME } from './cards.js';

// The Myndbönd page: eight short educational videos, four on each page of the Myndbönd leaf as taped video tiles with a play badge.
// Each video shares the unlock rules of the dinosaur, animal or fossil it belongs to (cards.js isUnlocked), so the child unlocks
// videos progressively through play, and each linked card in the card viewer also gets a button to open its video directly.

const WIGGLE_MS = 560;
const NOD_MS = 620;
const SAME_TAP_MS = 500;
const videoUrl = file => new URL(`../../assets/book/videos/${file}`, import.meta.url).href;

export const BOOK_VIDEOS = [
  {
    id: 'heimur',
    name: 'Heimur risaeðlanna',
    title: 'Hvernig var heimur risaeðlanna?',
    src: '/myndbond/heimur.mp4',
    poster: videoUrl('heimur-thumb.webp'),
    hue: '#868862',
    unlock: { start: true },
    cards: ['mosi'],
    findMe: 'book_mosi_later',
  },
  {
    id: 'grannar',
    name: 'Grannar risaeðlanna',
    title: 'Hverjir bjuggu með risaeðlunum?',
    src: '/myndbond/grannar.mp4',
    poster: videoUrl('grannar-thumb.webp'),
    hue: '#8f6aa3',
    unlock: { star: 'k1_kambedla' },
    cards: ['kambedla', 'turtle', 'frog', 'dragonfly'],
    findMe: 'book_mosi_later',
  },
  {
    id: 'thorsedla',
    name: 'Lengd Þórseðlu',
    title: 'Hversu löng var Þórseðla?',
    src: '/myndbond/thorsedla.mp4',
    poster: videoUrl('thorsedla-thumb.webp'),
    hue: '#e9b14d',
    unlock: { star: 'k2_thorsedla' },
    cards: ['thorsedla'],
    findMe: 'book_mosi_later',
  },
  {
    id: 'gramedla',
    name: 'Stærð Grameðlu',
    title: 'Hversu stór var Grameðla?',
    src: '/myndbond/gramedla.mp4',
    poster: videoUrl('gramedla-thumb.webp'),
    hue: '#b37955',
    unlock: { star: 'k3_gramedla' },
    altUnlock: { star: 'k6_gramedla' },
    cards: ['gramedla'],
    findMe: 'book_mosi_later',
  },
  {
    id: 'landrek',
    name: 'Færast löndin?',
    title: 'Færast löndin?',
    src: '/myndbond/landrek.mp4',
    poster: videoUrl('landrek-thumb.webp'),
    hue: '#47908a',
    unlock: { place: 'uggedla' },
    altUnlock: { star: 'k2_uggedla' },
    cards: ['uggedla'],
    findMe: 'book_mosi_later',
  },
  {
    id: 'fuglar',
    name: 'Fuglar eru risaeðlur',
    title: 'Af hverju eru fuglar risaeðlur?',
    src: '/myndbond/fuglar.mp4',
    poster: videoUrl('fuglar-thumb.webp'),
    hue: '#d8a23a',
    unlock: { found: 'earlyBird' },
    cards: ['earlybird', 'birds'],
    findMe: 'book_find_me_fen',
  },
  {
    id: 'raf',
    name: 'Flugan í rafinu',
    title: 'Flugan í rafinu',
    src: '/myndbond/raf.mp4',
    poster: videoUrl('raf-thumb.webp'),
    hue: '#e2833a',
    unlock: { fossil: 'amber' },
    cards: ['amber'],
    findMe: 'book_mosi_later',
  },
  {
    id: 'steinn',
    name: 'Bein verður að steini',
    title: 'Hvernig verður bein að steini?',
    src: '/myndbond/steinn.mp4',
    poster: videoUrl('steinn-thumb.webp'),
    hue: '#b9824a',
    unlock: { fossil: 'skeleton' },
    cards: ['skeleton'],
    findMe: 'book_mosi_later',
  },
  {
    id: 'tennur',
    name: 'Risaeðlutennur',
    title: 'Af hverju voru risaeðlur með svona ólíkar tennur?',
    src: '/myndbond/tennur.mp4',
    poster: videoUrl('tennur-thumb.webp'),
    hue: '#c4604a',
    unlock: { fossil: 'tooth' },
    cards: ['tooth'],
    findMe: 'book_mosi_later',
  },
];

export const videoSeenId = id => `video:${id}`;

export function isVideoUnlocked(video, state) {
  if (!video?.unlock) return false;
  if (isUnlocked(video, state)) return true;
  if (video.altUnlock && isUnlocked({ unlock: video.altUnlock }, state)) return true;
  return false;
}

export function isVideoNew(video, state) {
  return isVideoUnlocked(video, state) && !(state?.seen ?? []).includes(videoSeenId(video.id));
}

export function videoForCard(cardId, videos = BOOK_VIDEOS) {
  if (!cardId) return null;
  return videos.find(video => Array.isArray(video.cards) && video.cards.includes(cardId)) ?? null;
}

/**
 * The Myndbönd page on `leaf` (book.js's { el, pages, tiles }), over the `save` and the book's `audio`.
 * `onOpenVideo(video, fromRect)` opens a found video in the player; `onChange()` is told when a tile's seen state changes.
 */
export function createVideosPage(leaf, { save, audio = null, win = globalThis.window, videos = BOOK_VIDEOS, onOpenVideo = null, onChange = null } = {}) {
  const doc = leaf.el.ownerDocument;
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  let lastOpen = -Infinity;
  let findLine = null;

  const items = videos.map(video => {
    const tile = make('button', 'tile video-tile');
    tile.setAttribute('type', 'button');
    tile.setAttribute('data-video', video.id);
    tile.style.setProperty('--hue', video.hue);
    const picture = make('span', 'tile-picture');
    const img = doc.createElement('img');
    img.src = video.poster;
    img.alt = '';
    img.draggable = false;
    const playBadge = make('span', 'video-play-badge');
    playBadge.setAttribute('aria-hidden', 'true');
    playBadge.innerHTML = ICONS.play;
    picture.append(img, playBadge);
    const name = make('span', 'tile-name');
    name.textContent = video.name;
    const badge = make('span', 'badge-new');
    badge.textContent = 'Nýtt!';
    badge.setAttribute('aria-hidden', 'true');
    tile.append(picture, name);
    return { video, tile, picture, name, badge, playBadge };
  });

  const [left, right] = leaf.tiles;
  left.classList.add('video-tiles');
  right.classList.add('video-tiles');
  left.append(...items.slice(0, 4).map(item => item.tile));
  right.append(...items.slice(4).map(item => item.tile));

  function render() {
    const state = bookState(save);
    for (const { video, tile, name, badge, playBadge } of items) {
      const open = isVideoUnlocked(video, state);
      const fresh = open && !state.seen.includes(videoSeenId(video.id));
      tile.classList.toggle('found', open && !fresh);
      tile.classList.toggle('new', fresh);
      tile.classList.toggle('unfound', !open);
      playBadge.hidden = !open;
      name.textContent = open ? video.name : '?';
      tile.setAttribute('aria-label', open ? `${video.name}, myndband` : `${video.name} (ólæst síðar)`);
      if (fresh && badge.parentNode !== tile) tile.append(badge);
      if (!fresh) badge.remove();
    }
  }

  function hasNew() {
    const state = bookState(save);
    return items.some(({ video }) => !video.unlock.start && isVideoNew(video, state));
  }

  function wiggle(item) {
    audio?.sfx?.('wiggle');
    if (!findLine || findLine.done) findLine = audio?.narrate?.(item.video.findMe ?? FIND_ME) ?? null;
    if (typeof item.tile.animate !== 'function') return;
    const turns = reducedMotion(win)
      ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
      : [{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '6deg' }, { rotate: '-4deg' }, { rotate: '2.5deg' }, { rotate: '0deg' }];
    item.tile.animate(turns, { duration: WIGGLE_MS, easing: 'ease-in-out' });
  }

  function nod(id, delay = 0) {
    const item = items.find(entry => entry.video.id === id);
    if (typeof item?.tile.animate !== 'function') return;
    const keyframes = reducedMotion(win)
      ? [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }]
      : [{ scale: '1', rotate: '0deg' }, { scale: '1.14', rotate: '-3deg' }, { scale: '0.97', rotate: '2deg' }, { scale: '1', rotate: '0deg' }];
    item.tile.animate(keyframes, { duration: NOD_MS, delay, easing: 'cubic-bezier(.3, 1.4, .5, 1)' });
  }

  function tap(item) {
    const state = bookState(save);
    if (!isVideoUnlocked(item.video, state)) {
      wiggle(item);
      return;
    }
    const now = Date.now();
    if (now - lastOpen < SAME_TAP_MS) return;
    lastOpen = now;
    audio?.sfx?.('tile');
    const wasNew = save.addSeen(videoSeenId(item.video.id));
    render();
    if (wasNew) onChange?.();
    onOpenVideo?.(item.video, item.picture.getBoundingClientRect());
  }

  for (const item of items) pressable(item.tile, { audio, sound: null, win, onTap: () => tap(item) });
  render();
  return { render, hasNew, nod };
}
