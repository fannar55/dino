// The lines this checkout ships whose request the owner rejected on a yes/no page (remake/assets/audio/heard/), waiting for a new
// take: "<set>/<id>" -> why it waits and where the new take is made. tests/heard.test.mjs lets these, and only these, ship a
// rejected request, and fails on an entry that is no longer rejected (its new take is in): then take it out of here.
export const WAITING = {};
