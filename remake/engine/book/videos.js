import { pressable, reducedMotion } from './fx.js';
import { ICONS } from './icons.js';
import { isUnlocked, bookState, FIND_ME } from './cards.js';

// The Myndbönd page: thirteen educational videos, nine on the left page of the Myndbönd leaf (three rows of three) and four on the
// right, as taped video tiles with a play badge, and on the right page's last column "3D myndbönd" (BOOK_3D): shows for red/cyan
// glasses, open from the start. A 3D entry with a `chapter` is a show the game plays (onOpenShow: main.js goes to that chapter); one
// with a `src` would play in the video player as the others do. Under the right page's four videos, in a third row, stands a show
// of the game's own with no glasses (BOOK_SHOWS): chapter 5's music show, "Djamm skógarins", played alone in the same frame as the
// 3D shows. (It followed the left page's videos while one of that page's nine places was free.)
// Each video shares the unlock rules of the dinosaur, animal or fossil it belongs to (cards.js isUnlocked), so the child unlocks
// videos progressively through play, and each linked card in the card viewer also gets a button to open its video directly. Five
// belong to no card and are open from the start: Heimur risaeðlanna, Hvað varð um risaeðlurnar?, Hvernig fundum við
// risaeðlurnar?, Stelpan sem fann sæskrímslið and Krakkarnir sem fundu risaeðlur.

const WIGGLE_MS = 560;
const NOD_MS = 620;
const SAME_TAP_MS = 500;
const LEFT_PLACES = 9; // the left page's tiles: three rows of three (book.css)
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
    id: 'loftsteinn', // the asteroid: the story's end, belonging to no card, so open from the start as Heimur risaeðlanna is
    name: 'Hvað varð um risaeðlurnar?',
    title: 'Hvað varð um risaeðlurnar?',
    src: '/myndbond/loftsteinn.mp4',
    poster: videoUrl('loftsteinn-thumb.webp'),
    hue: '#4a6fa5',
    unlock: { start: true },
    cards: [],
    findMe: 'book_mosi_later',
  },
  {
    id: 'fundur', // how people found the dinosaurs: what came after the story's end, belonging to no card, so open from the start
    name: 'Hvernig fundum við risaeðlurnar?',
    title: 'Hvernig fundum við risaeðlurnar?',
    src: '/myndbond/fundur.mp4',
    poster: videoUrl('fundur-thumb.webp'), // the video's frame at 312.7 s: the statues in the park and the second drawing
    hue: '#8c3f4f',
    unlock: { start: true },
    cards: [],
    findMe: 'book_mosi_later',
  },
  {
    id: 'mary', // Mary Anning and the sea reptiles of her shore: one of the finders the video before it is about, belonging to no card, so open from the start
    name: 'Stelpan sem fann sæskrímslið',
    title: 'Stelpan sem fann sæskrímslið',
    src: '/myndbond/mary.mp4',
    poster: videoUrl('mary-thumb.webp'), // the video's end card composed for the tile, which shows only the middle of the picture: the title over her shore, Mary and Tray, the fish lizard and her young alive below (the video repo's tools/mary-flis.mjs)
    hue: '#5c9469', // her green cloak
    unlock: { start: true },
    cards: [],
    findMe: 'book_mosi_later',
  },
  {
    id: 'krakkar', // true stories of children who found animals from the dinosaurs' time: the third about finders, belonging to no card, so open from the start
    name: 'Krakkarnir sem fundu risaeðlur',
    title: 'Krakkarnir sem fundu risaeðlur',
    src: '/myndbond/krakkar.mp4',
    poster: videoUrl('krakkar-thumb.webp'), // composed for the tile, which shows only the middle of the picture under a play badge: the seven children in a row with their finds, and over them the long skeleton in a striped cliff (the video repo's tools/krakkar-flis.mjs)
    hue: '#b7552f', // the rust band of the striped hills
    unlock: { start: true },
    cards: [],
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

/** "3D myndbönd": shows for red/cyan glasses. `chapter` is a chapter the game plays (it turns the glasses on itself). */
export const BOOK_3D = [
  {
    id: 'fidrildi3d',
    name: 'Fiðrildadansinn',
    title: 'Fiðrildadansinn',
    chapter: 'fidrildi3d',
    poster: videoUrl('fidrildi3d-thumb.webp'),
    hue: '#9cb24a',
    unlock: { start: true },
    label: 'Fiðrildadansinn, þrívíddarmyndband, með rauðum og bláum gleraugum',
  },
  {
    id: 'gramedla3d',
    name: 'Grameðla kemur!',
    title: 'Grameðla kemur!',
    chapter: 'gramedla3d',
    poster: videoUrl('gramedla3d-thumb.webp'), // a still of the show (gler=0, 44 s: her head out of the screen)
    hue: '#c27a3e',
    unlock: { start: true },
    label: 'Grameðla kemur!, þrívíddarmyndband, með rauðum og bláum gleraugum',
  },
  {
    id: 'flugedla3d',
    name: 'Flugeðla og fiðrildið',
    title: 'Flugeðla og fiðrildið',
    chapter: 'flugedla3d',
    poster: videoUrl('flugedla3d-thumb.webp'), // a still of the show (gler=0, 23.96 s: she leads her flock over the cloud, the butterfly at her chest)
    hue: '#d97a8c',
    unlock: { start: true },
    label: 'Flugeðla og fiðrildið, þrívíddarmyndband, með rauðum og bláum gleraugum',
  },
  {
    // a show for a screen lying flat on a table (chapters/tjorn3d.js). Its name is a working one and its place the last: both are
    // the owner's to rule on, and nothing else is tied to either (the tests read them from here).
    id: 'tjorn3d',
    name: 'Uggeðla í tjörninni',
    title: 'Uggeðla í tjörninni',
    chapter: 'tjorn3d',
    poster: videoUrl('tjorn3d-thumb.webp'), // a still of the show (38 s, her head held up out of the pond, as the seat sees it without the glasses: tools/tjorn3d-tile.mjs --poster)
    hue: '#4f8fc0',
    unlock: { start: true },
    label: 'Uggeðla í tjörninni, þrívíddarsýning á borði, skjárinn lagður flatur, með rauðum og bláum gleraugum',
  },
];

/**
 * Shows of the game's own, with no glasses: a scene of a chapter played alone (`chapter`: the chapter module that plays it), in the
 * show player's frame as the 3D shows are. "Djamm skógarins" is chapter 5's music show, DJ Flugeðla's set (chapters/kafli5.js
 * `show`), so it can be watched again without the story before it. Open from the start, as every show on this page is (the three
 * 3D shows): a show is no reward. (To keep it until the chapter is finished instead: `unlock: { star: 'k5_sloedla' }`, and it
 * stands as a "?" until then, with "Nýtt!" on the ribbon when the star comes, as the videos do.) "Stjörnuhátíðin", the festival's
 * party, is the one that waits: it opens when the festival has been seen (`unlock: { seen: 'hatid' }`, cards.js), beside it in the row.
 */
export const BOOK_SHOWS = [
  {
    id: 'djamm',
    name: 'Djamm skógarins',
    title: 'Djamm skógarins',
    chapter: 'djamm',
    poster: videoUrl('djamm-thumb.webp'), // a still of the show itself (tools/capture.mjs, ?chapter=djamm&t=...)
    hue: '#e2833a',
    unlock: { start: true },
    label: 'Djamm skógarins, tónlistarmyndband úr leiknum',
  },
  {
    // the festival's party alone (chapters/veisla.js), from the moon's "Tút!" to the last chord: a "?" until the festival has been
    // seen (`hatid` in the save's seen, from the moment the seventh star lifts Egill), then "Nýtt!" until it is opened, as a video
    id: 'veisla',
    name: 'Stjörnuhátíðin',
    title: 'Stjörnuhátíðin',
    chapter: 'veisla',
    poster: videoUrl('veisla-thumb.webp'), // a still of the party the game draws itself (.tools/hatid-17/stills.mjs party_wide@258)
    hue: '#3d4f9a',
    unlock: { seen: 'hatid' },
    label: 'Stjörnuhátíðin, veislan úr leiknum',
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
 * `onOpenVideo(video, fromRect)` opens a found video in the player; `onOpenShow(entry)` plays an entry that is a chapter (`shows`,
 * BOOK_3D, and `own`, BOOK_SHOWS: the game's own shows, after the videos on the left page); `onChange()` is told when a tile's seen
 * state changes.
 */
export function createVideosPage(leaf, { save, audio = null, win = globalThis.window, videos = BOOK_VIDEOS, shows = BOOK_3D, own = BOOK_SHOWS, onOpenVideo = null, onOpenShow = null, onChange = null } = {}) {
  const doc = leaf.el.ownerDocument;
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  let lastOpen = -Infinity;
  let findLine = null;

  const tileOf = (video, threeD) => {
    const tile = make('button', threeD ? 'tile video-tile video-tile-3d' : 'tile video-tile');
    tile.setAttribute('type', 'button');
    tile.setAttribute('data-video', video.id);
    tile.style.setProperty('--hue', video.hue);
    const picture = make('span', 'tile-picture');
    const img = doc.createElement('img');
    img.decoding = 'async';
    img.src = video.poster;
    img.alt = '';
    img.draggable = false;
    const playBadge = make('span', 'video-play-badge');
    playBadge.setAttribute('aria-hidden', 'true');
    playBadge.innerHTML = ICONS.play;
    picture.append(img, playBadge);
    if (threeD) {
      const glasses = make('span', 'video-3d-badge');
      glasses.textContent = '3D';
      glasses.setAttribute('aria-hidden', 'true');
      picture.append(glasses);
    }
    const name = make('span', 'tile-name');
    name.textContent = video.name;
    const badge = make('span', 'badge-new');
    badge.textContent = 'Nýtt!';
    badge.setAttribute('aria-hidden', 'true');
    tile.append(picture, name);
    return { video, tile, picture, name, badge, playBadge, threeD };
  };
  const regular = videos.map(video => tileOf(video, false));
  const threeDs = shows.map(video => tileOf(video, true));
  // the game's own shows: a video's tile (no 3D mark), marked as a show for the page's style and the tests
  const ownShows = own.map(video => {
    const item = tileOf(video, false);
    item.tile.classList.add('video-tile-show');
    return item;
  });
  const items = [...regular, ...ownShows, ...threeDs];

  const [left, right] = leaf.tiles;
  left.classList.add('video-tiles');
  right.classList.add('video-tiles');
  // with a 3D column the right page has room for four videos beside it, two by two; the left page takes the rest, three across
  // (nine now: its three rows of three are full). The game's own show follows the left page's videos while one of those nine places
  // is free; now it stands on the right page, under that page's four videos (book.css .with-show)
  const leftCount = threeDs.length ? Math.max(regular.length - 4, Math.ceil(regular.length / 2)) : 4;
  const showsOnLeft = !ownShows.length || leftCount + ownShows.length <= LEFT_PLACES;
  left.append(...regular.slice(0, leftCount).map(item => item.tile), ...(showsOnLeft ? ownShows : []).map(item => item.tile));
  right.append(...regular.slice(leftCount).map(item => item.tile), ...(showsOnLeft ? [] : ownShows).map(item => item.tile));
  if (!showsOnLeft) right.classList.add('with-show');
  if (threeDs.length) {
    // the 3D column: its own heading, set apart from the videos, room for three tiles
    right.classList.add('with-3d');
    const column = make('div', 'video-3d-column');
    const head = make('h3', 'video-3d-head');
    const mark = make('span', 'glasses-3d');
    mark.textContent = '3D';
    head.append(mark, doc.createTextNode(' myndbönd'));
    column.append(head, ...threeDs.map(item => item.tile));
    right.append(column);
  }

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
      tile.setAttribute('aria-label', open ? (video.label ?? `${video.name}, myndband`) : `${video.name} (ólæst síðar)`);
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
    if (item.video.chapter) onOpenShow?.(item.video); // a show the game plays, with glasses or without
    else onOpenVideo?.(item.video, item.picture.getBoundingClientRect());
  }

  for (const item of items) pressable(item.tile, { audio, sound: null, win, onTap: () => tap(item) });
  render();
  return { render, hasNew, nod };
}
