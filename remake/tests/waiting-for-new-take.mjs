// The lines this checkout ships whose request the owner rejected on a yes/no page (remake/assets/audio/heard/), waiting for a new
// take: "<set>/<id>" -> why it waits and where the new take is made. tests/heard.test.mjs lets these, and only these, ship a
// rejected request, and fails on an entry that is no longer rejected (its new take is in): then take it out of here.
export const WAITING = {
  'hals/hals_mosi_1': 'Háls og hali\'s "Einn!" is the very request the owner rejected as kafli2/k2_mosi_einn on 2026-11-01 (493e80dadd..., the book\'s einn rule hratt-frae7). Branch kafli-uggedla installs his pick of a new "Einn" take as the book\'s einn rule and re-makes hals_mosi_1 there; when it merges, this entry goes.',
};
