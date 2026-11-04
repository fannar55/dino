import { freezeLevel } from '../step-rules.js';

/**
 * Level 2, "Steinagljúfrið": four friend pairs (the baby Flugeðla joins the three of level 1), four fossil pairs and a way up the gorge to the
 * Sólarsylla: the tunnel (the Kambeðlur light it), the rockfall at its far end (the Þríhyrnur butt it away), everyone through, the high
 * ledge (the Þórseðlur reach it), the cliff (the Flugeðlur fly the rope up), the climb, and last everyone pulls the dead trunk over the gap.
 * Everything the rules, the story and game.js need to know about the level is here; its 3D world is levels/steinagljufur/world.js
 * (levels/worlds.js says what a world is). The fields are the ones levels/berjalundur.js describes.
 *
 * Task 3 built the glade and the search and Task 4 the first two steps (the tunnel and the rockfall); the keys and words of the steps that follow (Tasks 5 and 6
 * build their scenes and record their lines) are here so that the story reads the whole ladder, but until then only those are reachable: when the rocks are gone the round waits.
 * The story keys all start with `g2-`, so that a run's timeline says which level it is in.
 *
 * Beyond level 1's fields it has: `look` (engine/looks.js: the light of the gorge's afternoon), `lines` (which of Mosi's lines are the level's own:
 * the welcome, the one for the fossils still to find, the fossils' sentence; a null has no line yet), `voice` (a line Mosi says when the story reaches a moment:
 * by story key), `soundscape` (the folder of found sounds the level adds to the shared ones: assets/audio/memory/soundscape/<name>/) and `credits` (the open scenery and
 * sounds behind the ending card's "i", besides the gifts' own; a row with `sound: true` is a sound, not a model). Its `copy.locked` is what its card in the level picker says
 * until level 1 has been finished.
 */
const FLAG_OF = {
  light: state => state.tunnelLit,
  headbutt: state => state.rocksFallen,
  through: state => state.throughTunnel,
  reach: state => state.ledgeLowered,
  fly: state => state.ropeUp,
  climb: state => state.atClifftop,
  pull: state => state.trunkDown,
  walk: state => state.onSunLedge,
};

export const STEINAGLJUFUR = freezeLevel({
  id: 'steinagljufur',
  number: 2,
  title: 'Steinagljúfrið',
  ribbon: 'Leiðin upp á Sólarsylluna',
  look: 'gorgeAfternoon',
  // (`through`, `climb` and `walk` are travel steps: Mosi says their line when they start, game.js launchAction)
  lines: { welcome: 'g2_welcome', help: null, giftsLeft: 'g2_left', gifts: 'gifts4', through: 'g2_through', climb: 'g2_climb', walk: 'g2_bridge' },
  voice: { 'g2-light-ready': 'g2_light_ready', 'g2-headbutt-ready': 'g2_rocks_ready', 'g2-reach-ready': 'g2_ledge_ready', 'g2-fly-ready': 'g2_cliff_ready', 'g2-pull-ready': 'g2_pull_ready' },
  soundscape: 'gorge',
  credits: [
    { title: 'Klettarnir (Sandstone | Cliff, sjö hlutar)', author: 'YadroGames', license: 'CC BY 4.0', source: 'sketchfab.com/erroratten' },
    { title: 'Stórgrýtið (Rock Large)', author: 'Quaternius', license: 'CC0 1.0', source: 'poly.pizza/m/54jZKTAt5p og poly.pizza/m/d2VWOdthtR' },
    { title: 'Grjóthrunið (Rocks)', author: 'Quaternius', license: 'CC0 1.0', source: 'poly.pizza/m/gYhoEOKItJ' },
    { title: 'Stóri kristallinn (Big Crystal)', author: 'Quaternius', license: 'CC0 1.0', source: 'poly.pizza/m/pf5lzmgr2J' },
    { title: 'Kristallinn (Crystal)', author: 'iPoly3D', license: 'CC0 1.0', source: 'poly.pizza/m/WzWPKHFMkL' },
    { title: 'Hellan (Rock Flat)', author: 'Kenney', license: 'CC0 1.0', source: 'poly.pizza/m/CrSoV13mCU' },
    { title: 'Tréð (Tree)', author: 'Quaternius', license: 'CC0 1.0', source: 'poly.pizza/m/2paAm1ja4w' },
    { title: 'Reipið (Rope 001)', author: 'ambientCG', license: 'CC0 1.0', source: 'ambientcg.com/view?id=Rope001' },
    { sound: true, title: 'Knocking into Pile of Large Stones 1', author: 'F.M.Audio', license: 'CC BY 4.0', source: 'freesound.org/people/F.M.Audio/sounds/572753' },
    { sound: true, title: 'Running_Slip_on_Gravel', author: 'Tdude9000', license: 'CC BY 3.0', source: 'freesound.org/people/Tdude9000/sounds/138343' },
    { sound: true, title: 'Gravel climbing', author: 'jorickhoofd', license: 'CC BY 4.0', source: 'freesound.org/people/jorickhoofd/sounds/169547' },
    { sound: true, title: 'Stones Falling, Rock Tumble 2, Landing_Stone_1, Stone dropping, tap stone, ANI - Wine Glass - Hard, Chime, Wing Flap 1, Heavy Stone Push, Scraping Stone, Whoosh Short, Stretch - Medium, Rope Knots', author: 'iwanPlays, _stubb, KieranKeegan, alegemaate, nettimato, ani_music, Psykoosiossi, msavioti, dslrguide, FartCTO, NearTheAtmoshphere, Raulitoto', license: 'CC0 1.0', source: 'freesound.org' },
  ],
  friends: ['triceratops', 'stegosaurus', 'brontosaurus', 'pteranodon'],
  gifts: ['ammonite', 'trilobite', 'fern', 'footprint'],
  roster: { triceratops: 'Þríhyrna', stegosaurus: 'Kambeðla', brontosaurus: 'Þórseðla', pteranodon: 'Flugeðla' },
  pairs: {
    triceratops: { name: 'Þríhyrnur', label: 'Þríhyrnuparið' },
    brontosaurus: { name: 'Þórseðlur', label: 'Þórseðluparið' },
    stegosaurus: { name: 'Kambeðlur', label: 'Kambeðluparið' },
    pteranodon: { name: 'Flugeðlur', label: 'Flugeðluparið' },
  },
  // The glade on the floor of the gorge (world.js lays the leaves out as levels/berjalundur.js says: the columns of a row run across the
  // screen, the rows stand `deep` apart, turned toward the search camera). Sixteen leaves, four by four. The rests of the four pairs are two at
  // each side of the board (the Kambeðlur at its left, at the back) and Mosi stands between the two on its right, facing the leaves; the tunnel
  // is in the back wall. The search view is higher than
  // level 1's (36 degrees), so that four rows stand clear of one another in landscape, and from the side and high in portrait, so that the four
  // columns fill a phone's width. (The numbers are the glade's grid, in the world's x and z: levels/steinagljufur/ground.js says how it is laid.)
  grid: { centre: [0, 0], angle: Math.PI / 6, across: 2.8, deep: 3, columns: 4, rows: 4 },
  nests: [[-6.07, 7.89], [-9.87, 1.31], [6.07, -7.89], [9.87, -1.31]],
  mosiSpot: { x: 8.49, z: -4.9, heading: 150 },
  gladeView: { landscape: [.405, .588, .7], portrait: [.52, .8, -.3], focus: [0, .5, 0], overviewFocus: [0, .5, -4], overviewDirection: [.22, .62, .75] },
  // (the friend the playthrough tool tries first at each obstacle: the ones the plan gives a wrong go there. The Kambeðlur hold the light until everyone is through, so the
  // bubbles at the rocks do not offer them: the Flugeðla's peck is the go there that the spec names)
  wrongFriends: { tunnel: 'triceratops', rocks: 'pteranodon', ledge: 'triceratops', cliff: 'brontosaurus' },
  steps: [
    { id: 'light', kind: 'task', target: 'tunnel', species: 'stegosaurus', holds: 'through' },
    { id: 'headbutt', kind: 'task', target: 'rocks', species: 'triceratops', beatWords: ['Einn!', 'Tveir!', 'BÚMM!'] },
    { id: 'through', kind: 'travel', target: 'tunnelExit', needsAllFound: true, waitsForGifts: true, automatic: true },
    { id: 'reach', kind: 'task', target: 'ledge', species: 'brontosaurus', beatWords: ['Einn!', 'Tveir!', 'Þrír!'] },
    { id: 'fly', kind: 'task', target: 'cliff', species: 'pteranodon', beatWords: ['Einn!', 'Tveir!', 'Þrír!'] },
    { id: 'climb', kind: 'travel', target: 'clifftop', automatic: true },
    { id: 'pull', kind: 'together', target: 'trunk', beatWords: ['Einn!', 'Tveir!', 'TOGA!'] },
    { id: 'walk', kind: 'travel', target: 'sunLedge', automatic: true },
  ],
  story: {
    common: {
      trying: 'g2-trying', home: 'g2-home', who: 'g2-who-',
      prompts: {
        trying: 'Sjáum hvað gerist!', home: 'Öll komumst við upp! Vel gert!', who: 'Hver getur þetta?',
        arriving: 'Vinirnir eru á leiðinni! Þú mátt skoða fleiri lauf.', seek: 'Hvar er vinur hans?',
      },
    },
    light: {
      doing: 'g2-doing-light', ready: 'g2-light-ready', arriving: 'g2-light-arriving', find: 'g2-find-glowers', seeks: true,
      prompts: { doing: 'Plöturnar lýsa eins og ljósker!', ready: 'Göngin eru dimm. Hver getur lýst þau upp?', find: 'Finnum vin sem getur lýst! Kíktu undir lauf.' },
    },
    headbutt: {
      doing: 'g2-doing-headbutt', ready: 'g2-headbutt-ready', arriving: 'g2-headbutt-arriving', find: 'g2-find-butters',
      prompts: { doing: 'Einn, tveir, BÚMM!', ready: 'Grjót lokar göngunum. Hver getur stangað það burt?', find: 'Finnum vin sem getur stangað! Kíktu undir lauf.' },
    },
    through: {
      doing: 'g2-doing-through', open: 'g2-through-open', gather: 'g2-gather-friends', arriving: 'g2-friends-arriving', gifts: 'g2-gifts-left', landing: 'g2-gifts-landing',
      prompts: {
        doing: 'Allir með í gegnum göngin!', open: 'Göngin eru opin. Allir með!', gather: 'Göngin eru opin! Finnum vinina sem vantar.',
        arriving: 'Göngin eru opin! Vinirnir eru að koma.', gifts: 'Finnum fyrst það sem er eftir undir laufunum!', landing: 'Steingervingarnir fara í körfuna!',
      },
    },
    reach: {
      doing: 'g2-doing-reach', ready: 'g2-reach-ready', arriving: 'g2-reach-arriving', find: 'g2-find-reachers',
      prompts: { doing: 'Langir hálsar ná hátt!', ready: 'Stallurinn er of hár. Hver nær hátt?', find: 'Finnum vin sem getur náð hátt! Kíktu undir lauf.' },
    },
    fly: {
      doing: 'g2-doing-fly', ready: 'g2-fly-ready', arriving: 'g2-fly-arriving', find: 'g2-find-flyers',
      prompts: { doing: 'Flugeðlurnar fljúga upp!', ready: 'Klettaveggurinn er brattur. Hver getur flogið með reipið upp?', find: 'Finnum vin sem getur flogið! Kíktu undir lauf.' },
    },
    climb: {
      doing: 'g2-doing-climb', open: 'g2-climb-open',
      prompts: { doing: 'Haldið í reipið. Upp með ykkur!', open: 'Reipið heldur. Allir upp!' },
    },
    pull: {
      doing: 'g2-doing-pull', ready: 'g2-pull-ready',
      // (the count, "Einn, tveir, TOGA!", is Mosi's own line when the rope is tied and everyone stands on it: scenes/pull.js says g2_pull and game.js puts it up then;
      // from the tap until then his bubble keeps the words he asked with)
      prompts: { doing: 'Togum öll saman í reipið!', ready: 'Togum öll saman í reipið!' },
    },
    walk: {
      doing: 'g2-doing-walk', open: 'g2-walk-open',
      prompts: { doing: 'Brúin er komin. Á Sólarsylluna!', open: 'Brúin er komin. Á Sólarsylluna!' },
    },
  },
  // Each step turns on one field; the tunnel is lit from the light until the trunk is down (the Kambeðlur keep glowing while everyone goes through).
  flags: done => ({
    tunnelLit: done.has('light'),
    rocksFallen: done.has('headbutt'),
    throughTunnel: done.has('through'),
    ledgeLowered: done.has('reach'),
    ropeUp: done.has('fly'),
    atClifftop: done.has('climb'),
    trunkDown: done.has('pull'),
    onSunLedge: done.has('walk'),
  }),
  // (the furthest step whose field shows is done, and every step before it)
  doneFrom(state) {
    const last = STEINAGLJUFUR.steps.findLastIndex(step => FLAG_OF[step.id](state));
    return STEINAGLJUFUR.steps.slice(0, last + 1).map(step => step.id);
  },
  // A cancelled step keeps what was finished and grants nothing, as in level 1.
  onCancel() {},
  // The badges are renders of the level's own models (assets/memory/bord2/badge-*.webp), not drawn: the tunnel's and the rocks' (Task 4), the ledge's slab and the cliff's tree (Task 5), the trunk (Task 6), the rest come with their scenes.
  targets: {
    tunnel: { label: 'Göngin: hver getur lýst þau upp?', icon: '<img src="./assets/memory/bord2/badge-tunnel.webp" alt="" width="72" height="72" draggable="false">' },
    rocks: { label: 'Grjóthrunið: hver getur stangað það burt?', icon: '<img src="./assets/memory/bord2/badge-rocks.webp" alt="" width="72" height="72" draggable="false">' },
    tunnelExit: { label: 'Senda alla vinina í gegnum göngin', icon: '' },
    ledge: { label: 'Stallurinn: hver nær hátt?', icon: '<img src="./assets/memory/bord2/badge-ledge.webp" alt="" width="72" height="72" draggable="false">' },
    cliff: { label: 'Klettaveggurinn: hver getur flogið með reipið upp?', icon: '<img src="./assets/memory/bord2/badge-cliff.webp" alt="" width="72" height="72" draggable="false">' },
    clifftop: { label: 'Senda alla vinina upp á brúnina', icon: '' },
    trunk: { label: 'Trjábolurinn: togum öll saman', icon: '<img src="./assets/memory/bord2/badge-trunk.webp" alt="" width="72" height="72" draggable="false">' },
    sunLedge: { label: 'Senda alla vinina yfir á Sólarsylluna', icon: '' },
  },
  copy: {
    locked: 'Kláraðu Berjalundinn fyrst',
    welcome: {
      eyebrow: 'ÆVINTÝRI MEÐ MOSA', title: 'Hvar er vinur minn?',
      lines: ['Velkomin í Steinagljúfrið!', 'Finndu tvo eins vini.'],
      start: 'Leikum saman', fine: 'Finna vini · hjálpast að · komast upp',
    },
    ending: {
      eyebrow: 'ÁTTA VINIR · EITT GLJÚFUR', title: 'Öll komumst við upp!',
      text: 'Þið lýstuð, stönguðuð, náðuð hátt, fluguð og toguðuð saman. Nú horfa allir á stjörnurnar.', again: 'Spila aftur',
    },
    help: {
      eyebrow: 'HJÁLPUMST AÐ', title: 'Komumst upp á Sólarsylluna.',
      items: [
        'Opnaðu lauf. Finndu tvo eins vini!',
        'Undir sumum laufum eru steingervingar. Finndu tvo eins, þá fara þeir í körfuna!',
        'Ýttu á það sem glóir. Hver getur þetta? Veldu vin!',
        'Kambeðlurnar lýsa, Þríhyrnurnar stanga, Þórseðlurnar ná hátt og Flugeðlurnar fljúga með reipið.',
        'Í lokin toga allir saman. Þá komumst við upp á Sólarsylluna!',
      ],
      note: 'Gullna örin bendir á næsta verkefni. Yfirlit sýnir allt ævintýrið. Þú mátt alltaf taka þér hlé.',
      resume: 'Aftur í feluleikinn',
    },
    // (the line over the ribbon while a pair holds something up: the Kambeðlur hold the light from when the tunnel is lit until everyone is through)
    holding: 'Kambeðlurnar halda ljósinu',
    loading: { title: 'Gljúfrið vaknar…', copy: 'Mosi finnur ungana.' },
    aria: { targets: 'Lauf, vinapör og leiðin upp á Sólarsylluna', journey: 'Fjögur verkefni á leiðinni' },
  },
  music: () => 'glade',
  // What the world's events sound and say (the mover's: levels/steinagljufur/mover.js lists them); the steps after the rockfall add theirs (Tasks 5 to 7).
  // Each tap of the light is a chime a step higher, the whole light a chord and Mosi's line; each hit of the horns is the pile knocked, the third its collapse and Mosi's line.
  eventSounds: {
    'light-step': [{ method: 'lightStep', arg: 'index' }],
    'tunnel-lit': ['tunnelLit', { say: 'g2_lit', delay: .5 }],
    'beat:headbutt': ['strain'],
    'rocks-hit': [{ method: 'rockHit', arg: 'index' }],
    'rocks-fall': ['rocksFall', { say: 'g2_rocks_done', delay: 1.1 }],
    'rock-land': ['rockLand'],
    'fail-bump': ['bonk'],
    'fail-pebble': ['pebble'],
    'fail-peck': ['peck'],
    // The ledge: Mosi says what they do as they start; each pull is the slab pushed down a step, the last its landing as a ramp.
    'reach-start': [{ say: 'g2_reached', delay: .9 }],
    'beat:reach': ['strain'],
    'slab-step': [{ method: 'slabLower', arg: 'index' }],
    'slab-down': ['slabDown'],
    // The cliff: the Flugeðlur lift the rope (a whoosh), each tap is a wingbeat, round the tree it is knotted, then it draws taut.
    'fly-start': [{ say: 'g2_flown', delay: .9 }],
    'wing-beat': [{ method: 'wingFlap', arg: 'index' }],
    'rope-lift': ['ropeWhoosh'],
    'rope-knots': ['ropeKnots'],
    'rope-taut': ['ropeTighten'],
    // The climb (its words are the step's line, said as it starts): the gravel under their feet, one stretch for each few seconds.
    'climb-step': ['gravelClimb'],
    // The wrong friends at the cliff: the rope thrown up falls on the Þórseðla's head (a whoosh, a bonk), the Kambeðla slides back down the path.
    'fail-rope': ['ropeWhoosh'],
    'fail-slip': ['gravelSlip'],
    // The pull (Task 6): the Flugeðlur lift the second rope (the whoosh), a wingbeat for each leg of its flight over the gap and back up the trunk, the knots at the stub at
    // its top, the rope drawn taut along the line. Each tap everyone strains and the rope stretches as the trunk tilts a step; the third throws it over the gap: level 1's thud,
    // and stones tumble off the rim into the gap under the dust. The walk over it is footsteps on the wood (game.js 'footstep').
    'beat:pull': ['strain'],
    'trunk-tilt': ['ropeTighten'],
    'trunk-fall': ['bridgeLand'],
    'trunk-dust': ['rocksTumble'],
  },
  eventCaptions: {
    'tunnel-lit': { text: 'Plöturnar lýsa eins og ljósker!', hold: 3.2 },
    'rocks-fall': { text: 'Búmm! Leiðin er opin!', hold: 3.2 },
    'reach-start': { text: 'Langir hálsar ná hátt!', hold: 3.2 },
    'fly-start': { text: 'Flugeðlurnar fljúga upp!', hold: 3.2 },
  },
});
