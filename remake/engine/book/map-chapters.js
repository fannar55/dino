import { defaultChapter } from '../save.js';

// The chapters on the book's map (the owner, 2026-11-23): once a chapter is finished the child can tap its place on the map to go
// to that chapter again. A tap first asks ("Viltu fara í kafla 2?", map-ask.js) and only a yes starts the chapter.
//
// Each friend's slot on the map stands for her chapter, and her star in the book is what says the chapter is finished:
//   Kambeðla 1, Uggeðla 2, Þórseðla 3, Flugeðla 4, Slóeðla 5, Grameðla 6.
// (A star's number is not its chapter's: Þórseðla's, k2_thorsedla, is from the days when hers was chapter 2.)
//
// A place asks when
//   - her star is in the save: the chapter is finished, and can be played again; or
//   - it is the place the story has come to (the first chapter not finished, engine/save.js defaultChapter) while the page plays
//     an older chapter: the way back to where the story is. On the page of that chapter itself its place does what it always did.
// Every other place does what it did before (a found one has Mosi say its name and a sentence, an empty one only taps): nothing
// says no. The game keeps no place inside a chapter, so a chapter left this way begins from its start when the child comes back.
//
// The same table says where "Áfram" leads when a chapter ends (main.js): on, to the next chapter, as it always did; but a chapter
// played again (its star was in the save before this page began) leads to where the story has come to, while a chapter is left
// unfinished.

export const MAP_CHAPTERS = [
  { place: 'kambedla', chapter: 'kafli1', number: 1, star: 'k1_kambedla' },
  { place: 'uggedla', chapter: 'kafli2', number: 2, star: 'k2_uggedla' },
  { place: 'thorsedla', chapter: 'kafli3', number: 3, star: 'k2_thorsedla' },
  { place: 'flugedla', chapter: 'kafli4', number: 4, star: 'k4_flugedla' },
  { place: 'sloedla', chapter: 'kafli5', number: 5, star: 'k5_sloedla' },
  { place: 'gramedla', chapter: 'kafli6', number: 6, star: 'k6_gramedla' },
];

/** A chapter's row of the table, by its id ('kafli3'); null for a page that is no chapter of the story (a show, the lab). */
export const chapterRow = id => MAP_CHAPTERS.find(row => row.chapter === id) ?? null;

/** Mosi's question for a chapter, as the card writes it and as his line says it (book_mosi_kafli_<n>). */
export const askText = number => `Viltu fara í kafla ${number}?`;
export const askLine = number => `book_mosi_kafli_${number}`;

/**
 * The chapter the story has come to: the first whose friend has no star yet, or null once every chapter the save can be at is
 * finished (the last one's star is won).
 */
export function storyChapter(save) {
  const row = chapterRow(defaultChapter(save));
  return row && !save.get().stars.includes(row.star) ? row.chapter : null;
}

/**
 * The chapter a tap on a place of the map asks about, as its row ({ place, chapter, number, star }), or null when the place asks
 * nothing. `playing` is the chapter this page plays (main.js's chapterId; null on a page that plays none).
 */
export function chapterAsked(place, save, playing = null) {
  const row = MAP_CHAPTERS.find(entry => entry.place === place);
  if (!row) return null;
  if (save.get().stars.includes(row.star)) return row; // finished: it can be played again
  const story = storyChapter(save);
  return row.chapter === story && chapterRow(playing) && playing !== story ? row : null; // the way back to where the story is
}

/**
 * Where "Áfram" leads when the chapter `playing` has ended: `next` (the chapter's own, chapter.next), unless the chapter was played
 * again (`again`: its star was in the save before the page began) and the story has an unfinished chapter, which it then leads to.
 * Null when there is nowhere to go on to.
 */
export function onwardChapter({ playing, next = null, again = false, save }) {
  const story = again ? storyChapter(save) : null;
  return story && story !== playing ? story : next ?? null;
}

/** Whether the chapter `id` is finished in the save (its friend's star is there): false for a page that is no chapter of the story. */
export function chapterDone(id, save) {
  const row = chapterRow(id);
  return Boolean(row) && save.get().stars.includes(row.star);
}

/** The address of a chapter's page from this one: `search` (location.search) with its chapter changed, and nothing kept but the quality and the debug switch. */
export function chapterSearch(chapter, search = '') {
  const from = new URLSearchParams(search);
  const to = new URLSearchParams();
  for (const key of ['quality', 'debug']) if (from.get(key)) to.set(key, from.get(key));
  to.set('chapter', chapter);
  return `?${to}`;
}
