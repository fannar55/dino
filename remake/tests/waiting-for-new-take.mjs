// The lines this checkout ships whose request the owner rejected on a yes/no page (remake/assets/audio/heard/), waiting for a new
// take: "<set>/<id>" -> why it waits and where the new take is made. tests/heard.test.mjs lets these, and only these, ship a
// rejected request, and fails on an entry that is no longer rejected (its new take is in): then take it out of here.
export const WAITING = {
  'kafli5/k5_mosi_grazers': 'The owner said no on 2026-11-11 (no note). Three contexts are auditioned in the book (voice-lines.mjs --book grasbitur); his pick becomes the context of the line.',
  'kafli5/k5_mosi_flyers': 'The owner said no on 2026-11-11 (no note). Three contexts are auditioned in the book (voice-lines.mjs --book flugdyr); his pick becomes the context of the line.',
};
