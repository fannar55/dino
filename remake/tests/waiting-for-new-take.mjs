// The lines this checkout ships whose request the owner rejected on a yes/no page (remake/assets/audio/heard/), waiting for a new
// take: "<set>/<id>" -> why it waits and where the new take is made. tests/heard.test.mjs lets these, and only these, ship a
// rejected request, and fails on an entry that is no longer rejected (its new take is in): then take it out of here.
export const WAITING = {
  'book/book_myndband_fundur_35': 'The owner heard "ógurlega" said wrong in the video (2026-11-21). Three new takes (A and B: the respelling óurlega, seeds 7 and 42; C: IPA without the g, seed 7) wait for his pick by ear; the pick goes in as the line\'s own say and seed with voice-lines.mjs --set book --only book_myndband_fundur_35.',
};
