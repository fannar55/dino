import { freezeLevel } from '../step-rules.js';

/**
 * Level 2, "Steinagljúfrið": four friend pairs (the baby Flugeðla joins the three of level 1), four fossil pairs and a way up the gorge to the
 * Sólarsylla: the tunnel (the Kambeðlur light it), the rockfall at its far end (the Þríhyrnur butt it away), everyone through, the high
 * ledge (the Þórseðlur reach it), the cliff (the Flugeðlur fly the rope up), the climb, and last everyone pulls the dead trunk over the gap.
 * Everything the rules, the story and game.js need to know about the level is here; its 3D world is levels/steinagljufur/world.js
 * (levels/worlds.js says what a world is). The fields are the ones levels/berjalundur.js describes.
 *
 * Task 3 builds the glade and the search; the keys and words of the steps that follow (Tasks 4 to 6 build their scenes and record their lines)
 * are here so that the story reads the whole ladder, but until then only the search is reachable: when every leaf is found the round waits.
 * The story keys all start with `g2-`, so that a run's timeline says which level it is in.
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
  // screen, the rows stand `deep` apart, turned toward the search camera). Sixteen leaves, four by four. The rests of the four pairs are two
  // on each side of the board and Mosi stands at its right-hand end; the search view is a little higher than level 1's, so that four rows
  // stand clear of one another in landscape, and from the side and high in portrait, so that the four columns fill a phone's width.
  grid: { centre: [0, 0], angle: Math.PI / 6, across: 2.9, deep: 3.1, columns: 4, rows: 4 },
  nests: [[-8.6, -6.6], [-5.2, 7.2], [8.6, -6.2], [7.9, 6.4]],
  mosiSpot: { x: 11, z: 2, heading: 150 },
  gladeView: { landscape: [.43, .52, .74], portrait: [.52, .8, -.3] },
  steps: [
    { id: 'light', kind: 'task', target: 'tunnel', species: 'stegosaurus', holds: 'through' },
    { id: 'headbutt', kind: 'task', target: 'rocks', species: 'triceratops', beatWords: ['Einn!', 'Tveir!', 'BÚMM!'] },
    { id: 'through', kind: 'travel', target: 'tunnelExit', needsAllFound: true, waitsForGifts: true, automatic: true },
    { id: 'reach', kind: 'task', target: 'ledge', species: 'brontosaurus' },
    { id: 'fly', kind: 'task', target: 'cliff', species: 'pteranodon' },
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
      prompts: { doing: 'Einn, tveir, TOGA!', ready: 'Togum öll saman í reipið!' },
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
  // The badges are the level's own renders, and they come with the scenes (Task 4): until then the obstacles carry only their accessible names.
  targets: {
    tunnel: { label: 'Göngin: hver getur lýst þau upp?', icon: '' },
    rocks: { label: 'Grjóthrunið: hver getur stangað það burt?', icon: '' },
    tunnelExit: { label: 'Senda alla vinina í gegnum göngin', icon: '' },
    ledge: { label: 'Stallurinn: hver nær hátt?', icon: '' },
    cliff: { label: 'Klettaveggurinn: hver getur flogið með reipið upp?', icon: '' },
    clifftop: { label: 'Senda alla vinina upp á brúnina', icon: '' },
    trunk: { label: 'Trjábolurinn: togum öll saman', icon: '' },
    sunLedge: { label: 'Senda alla vinina yfir á Sólarsylluna', icon: '' },
  },
  copy: {
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
    loading: { title: 'Gljúfrið vaknar…', copy: 'Mosi finnur ungana.' },
    aria: { targets: 'Lauf, vinapör og leiðin upp á Sólarsylluna', journey: 'Fjögur verkefni á leiðinni' },
  },
  music: () => 'glade',
  // The world's events and what they sound and say come with the scenes of the steps (Tasks 4 to 7).
  eventSounds: {},
  eventCaptions: {},
});
