import { freezeLevel } from '../step-rules.js';

/**
 * Level 1, "Berjalundurinn": three friend pairs, three gift pairs and a way to the berry grove (the branch, the log across the river,
 * the crossing, the bark over the marsh, the walk). Everything the rules, the story and game.js need to know about the level is here;
 * its 3D world (the terrain, the props, the scenes of its steps) is levels/berjalundur/world.js (see levels/worlds.js).
 *
 * steps        the ladder, in order (step-rules.js says what each kind means)
 * story        the words of the story, by step (playful-flow.js says which moment uses which): `doing`, `ready`, `arriving`, `find`,
 *              `open`, `gather`, `gifts`, `landing` are the story keys, `prompts` has the same names with Mosi's hint; `common` is
 *              what belongs to no step. `seeks`: with one leaf open the search names the other half.
 * voice        the line Mosi says when the story reaches a moment, by story key (game.js: once as it begins, again on his 10 s repeat and
 *              on his button); its words are the moment's prompt
 * flags        the fields the rules add to their state, from the Set of finished steps
 * doneFrom     the ladder read back from those fields (the story is also asked with a state written by hand)
 * onCancel     what a cancelled step changes besides stopping
 * roster       the friends' names; pairs: the names the "who" bubbles show
 * grid, nests, mosiSpot, gladeView   where the leaves, the pairs' rests and Mosi stand, and how the search view looks (world.js)
 * targets      each obstacle's badge (icon) and its accessible name
 * copy         the words on the welcome card, the ending card and the loading card, and the accessible name of the targets (the markup has the
 *              same words); `holding` (level 2's) is the line under Mosi's words while a pair holds something up
 * wrongFriends  the friend the playthrough tool tries first at each obstacle, on purpose (a friend that cannot do it)
 * music        the music stage for a state; eventSounds, eventCaptions: what the world's events sound and say
 * soundscape   the folder of the level's own sounds beside the shared ones (audio.js soundscapeUrl); credits: its rows behind the ending card's "i"
 */
const TIGHT = 'Hér er þröngt. Finndu fleiri vini eða veldu parið aftur.';
const WAIT = 'Vinirnir bíða. Veldu verkefnið aftur þegar leiðin er laus.';

const FLAG_OF = {
  lift: state => state.branch === 'held',
  roll: state => state.bridgeBuilt,
  cross: state => state.atStaging,
  lay: state => state.boardwalkBuilt,
  finish: state => state.visited,
};

export const BERJALUNDUR = freezeLevel({
  id: 'berjalundur',
  number: 1,
  title: 'Berjalundurinn',
  // (Mosi's claps and the friends' cheer at the grove: Söngur Slóeðlu's, as level 2 has them, soundscape/grove/)
  soundscape: 'grove',
  credits: [
    { sound: true, title: 'Single handclap, 4 people (alternatives 1-4)', author: 'gregswinford', license: 'CC BY 4.0', source: 'freesound.org/people/gregswinford/sounds/487275-487278' },
  ],
  friends: ['triceratops', 'stegosaurus', 'brontosaurus'],
  gifts: ['shrew', 'hermitCrab', 'crab'],
  roster: { triceratops: 'Þríhyrna', stegosaurus: 'Kambeðla', brontosaurus: 'Þórseðla' },
  pairs: {
    triceratops: { name: 'Þríhyrnur', label: 'Þríhyrnuparið' },
    brontosaurus: { name: 'Þórseðlur', label: 'Þórseðluparið' },
    stegosaurus: { name: 'Kambeðlur', label: 'Kambeðluparið' },
  },
  // Where things stand in the glade (world.js lays them out). The leaves are a grid turned toward the search camera: the `columns` of a
  // row run across the screen (each `across` metres from the next), the `rows` are `deep` apart, so the board is as wide on the screen as
  // it can be made narrow. `nests` is the rest of each pair, in the order of `friends` (the third stands 1.15 m nearer the leaves than
  // the adults' did, so the Þórseðla babies' longer tails stay clear of the branch lying behind them). Mosi stands at the glade's west
  // edge and faces the leaves (heading 0 = +X). The search view is low and from the side, as in the approved mock: landscape looks in from
  // the south-east, portrait looks along the rows from Mosi's side and higher up, so the columns fill the width and the rows stand one
  // above the other far enough apart for a 44 px button each.
  grid: { centre: [-5.2, 7.6], angle: Math.PI / 6, across: 3, deep: 3.6, columns: 4, rows: 3 },
  nests: [[-.8, -.4], [2.2, 7.6], [-6.9, -1.25]],
  mosiSpot: { x: 3, z: 2.8, heading: 90 },
  gladeView: { landscape: [.464, .375, .803], portrait: [.52, .8, -.3] },
  wrongFriends: { branch: 'triceratops', log: 'triceratops', bark: 'brontosaurus' },
  steps: [
    { id: 'lift', kind: 'task', target: 'branch', species: 'brontosaurus', beatWords: ['Upp!'], holds: 'roll' },
    { id: 'roll', kind: 'task', target: 'log', species: 'triceratops', beatWords: ['Einn!', 'Tveir!', 'ÝTA!'] },
    { id: 'cross', kind: 'travel', target: 'staging', needsAllFound: true, waitsForGifts: true, automatic: true },
    { id: 'lay', kind: 'task', target: 'bark', species: 'stegosaurus', beatWords: ['Ein!', 'Tvær!', 'Þrjár!'] },
    { id: 'finish', kind: 'travel', target: 'grove', automatic: true },
  ],
  story: {
    common: {
      trying: 'trying', home: 'home', who: 'who-',
      prompts: {
        trying: 'Sjáum hvað gerist!', home: 'Öll komumst við! Vel gert!', who: 'Hver getur þetta?',
        arriving: 'Vinirnir eru á leiðinni! Þú mátt skoða fleiri lauf.', seek: 'Hvar er vinur hans?',
      },
    },
    lift: {
      doing: 'doing-lift', ready: 'lift-ready', arriving: 'lift-arriving', find: 'find-friends', seeks: true,
      prompts: { doing: 'Upp með greinina!', ready: 'Greinin er fyrir. Hver nær upp að henni?', find: 'Kíktu undir lauf. Finndu tvo eins vini!' },
    },
    roll: {
      doing: 'doing-roll', ready: 'roll-ready', arriving: 'roll-arriving', find: 'find-pushers',
      prompts: { doing: 'Þríhyrnurnar koma að bolnum!', ready: 'Stóri bolurinn getur orðið að brú. Hver getur ýtt honum?', find: 'Hver getur ýtt bolnum? Finnum fleiri vini!' },
    },
    cross: {
      doing: 'doing-cross', open: 'bridge-open', gather: 'gather-friends', arriving: 'friends-arriving', gifts: 'gifts-left', landing: 'gifts-landing',
      prompts: {
        doing: 'Allir með yfir brúna!', open: 'Brúin er tilbúin. Allir með!', gather: 'Brúin er tilbúin! Finnum vinina sem vantar.',
        arriving: 'Brúin er tilbúin! Vinirnir eru að koma.', gifts: 'Finnum fyrst gjafirnar sem eru eftir!', landing: 'Gjafirnar fara í körfuna!',
      },
    },
    lay: {
      doing: 'doing-lay', ready: 'lay-ready', arriving: 'lay-arriving',
      prompts: { doing: 'Þær bera börkinn saman. Ein fjöl í einu!', ready: 'Mýrin er mjúk. Hver getur byggt leið yfir?' },
    },
    finish: {
      doing: 'doing-finish', open: 'walkway-open',
      prompts: { doing: 'Nú komast allir yfir. Berin bíða okkar!', open: 'Leiðin er opin. Förum saman!' },
    },
  },
  // The three waits for the child (the branch, the log, the marsh): Mosi says the prompt's words (the juice pass, package C; the owner's yes of 2026-11-08).
  voice: { 'lift-ready': 'lift_ready', 'roll-ready': 'roll_ready', 'lay-ready': 'lay_ready' },
  // The branch is held from the lift until the roll lets it go; the bridge, the staging spot, the boardwalk and the grove follow their steps.
  flags: done => ({
    branch: done.has('lift') && !done.has('roll') ? 'held' : 'down',
    bridgeBuilt: done.has('roll'),
    atStaging: done.has('cross'),
    boardwalkBuilt: done.has('lay'),
    visited: done.has('finish'),
  }),
  // (the furthest step whose field shows is done, and every step before it)
  doneFrom(state) {
    const last = BERJALUNDUR.steps.findLastIndex(step => FLAG_OF[step.id](state));
    return BERJALUNDUR.steps.slice(0, last + 1).map(step => step.id);
  },
  onCancel(id, opts, done) {
    // The rules used to put the branch down when a crossing was cancelled with it physically down (cancel(id, { branch })). The branch is
    // derived now: held only from the lift to the roll, and a crossing runs only after the roll, so it is down already. A cancelled
    // step keeps everything that was finished and grants nothing; there is no more to do here.
  },
  targets: {
    branch: {
      label: 'Greinin: hver getur lyft henni?',
      icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25c8-6 13-6 22-2M7 24l-2-5m18 4 3-6"/><path class="branch-arrow" d="M16 18V5m-5 5 5-5 5 5"/></svg>',
    },
    log: {
      label: 'Stóri bolurinn: hver getur ýtt honum?',
      icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="8" cy="20" rx="5" ry="7"/><path d="M8 13h16c7 0 7 14 0 14H8M14 7c4-4 10-3 13 1m-5 2 5-2-1-5"/></svg>',
    },
    staging: {
      label: 'Senda alla sex vinina yfir trjábrúna',
      icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25v-8c7-9 15-9 22 0v8M5 21h22M16 14V4m-5 5 5-5 5 5"/></svg>',
    },
    bark: {
      label: 'Börkurinn: hver getur lagt leið yfir mýrina?',
      icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m7 6 20 3-2 6-20-3zM6 16l20 3-2 6-20-3zM10 7l-1 6m8-5-1 6m-6 3-1 6m8-5-1 6"/></svg>',
    },
    grove: {
      label: 'Senda alla vinina í berjalundinn',
      icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="10" cy="20" r="6"/><circle cx="22" cy="20" r="6"/><circle cx="16" cy="12" r="6"/><path d="M16 6c4-5 8-5 10-3-1 4-5 5-10 3"/></svg>',
    },
  },
  copy: {
    welcome: {
      title: 'Saman getum við það!',
      lines: ['Finndu tvo eins vini.', 'Saman opnum við leiðina í berjalundinn!'],
      start: 'Leikum saman',
    },
    ending: {
      title: 'Öll komumst við!',
      text: 'Þið lyftuð, ýttuð og byggðuð. Nú njóta allir vinirnir berjalundarins.', again: 'Spila aftur',
    },
    loading: { title: 'Hreiðurlundurinn vaknar…', copy: 'Mosi finnur ungana.' },
    aria: { targets: 'Lauf, vinapör og leiðin að berjalundinum' },
  },
  music: state => (state.visited ? 'grove' : state.atStaging ? 'marsh' : 'glade'),
  // The world's events, by type ('beat' by 'beat:<step>'): each entry is an audio method of game.js's audio, { method, arg } (the
  // event's field `arg` goes with it) or { say, delay } (a line of Mosi's, queued).
  eventSounds: {
    'branch-lift': ['branchLift'],
    'beat:lift': ['branchLift', 'strain'],
    'beat:roll': ['logRoll', 'strain'],
    'beat:lay': ['strain'],
    'fail-bump': ['bonk'],
    'branch-lower': ['branchLower'],
    'log-roll': ['logRoll', { say: 'roll', delay: 0.12 }],
    'bridge-land': ['bridgeLand'],
    'staging-arrival': ['stagingArrival'],
    // (each pair calls as the last of it comes over the bridge; the walk to the grove ends in the friends' cheer instead)
    'pair-arrived:cross': [{ method: 'arrivalCall', arg: 'species' }],
    'bark-pickup': ['barkPickup'],
    'bark-place': [{ method: 'barkPlace', arg: 'panel' }],
    'boardwalk-complete': ['boardwalkComplete'],
    'final-arrival': ['berryArrival'],
    'berry-arrival': ['berryArrival'],
  },
  // Words Mosi's bubble shows for an event (`by`: another text for some steps, by the event's id), and for how many seconds.
  eventCaptions: {
    'boardwalk-complete': { text: 'Gönguleiðin er tilbúin!', hold: 3.5 },
    'bridge-blocked': { text: WAIT, by: { lift: TIGHT, roll: TIGHT }, hold: 2.4 },
  },
});
