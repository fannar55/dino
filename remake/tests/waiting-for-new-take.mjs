// The lines this checkout ships whose request the owner rejected on a yes/no page (remake/assets/audio/heard/), waiting for a new
// take: "<set>/<id>" -> why it waits and where the new take is made. tests/heard.test.mjs lets these, and only these, ship a
// rejected request, and fails on an entry that is no longer rejected (its new take is in): then take it out of here.
export const WAITING = {
  'kafli6/k6_mosi_wobble': 'The owner said no on 2026-11-22 (no note). Four candidates are auditioned in the book (voice-lines.mjs --book ups); his pick becomes the line\'s own context or say.',
};
