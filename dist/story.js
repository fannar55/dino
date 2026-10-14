import { ADVENTURE_NARRATION } from './adventure-content.js';
import { MINI_NARRATION } from './mini-content.js';
import { CLOUD_MATH_NARRATION } from './cloud-math-content.js';
import { ENCYCLOPEDIA_NARRATION } from './encyclopedia-content.js';

export const SPECIES = {
  triceratops: { name: 'Þríhyrna', latin: 'Triceratops', clue: 'Þrjú horn og stór hálskragi.', color: '#4e9d82' },
  stegosaurus: { name: 'Kambeðla', latin: 'Stegosaurus', clue: 'Stórar plötur á bakinu og gaddar á halanum.', color: '#d59a61' },
  // Internal slot retained so existing saves and the treetop ride stay compatible.
  brachiosaurus: { name: 'Þórseðla', latin: 'Brontosaurus', clue: 'Langur háls, langur hali og fjórir sterkir fætur.', color: '#76a7ac' },
  trex: { name: 'Grameðla', latin: 'Tyrannosaurus rex', clue: 'Stórt höfuð, tveir fingur og sterkir afturfætur.', color: '#b97864' },
  spinosaurus: { name: 'Uggeðla', latin: 'Spinosaurus', clue: 'Hátt segl á bakinu og langur trýnislaga kjálki.', color: '#c39369' },
  parasaurolophus: { name: 'Slóeðla', latin: 'Parasaurolophus', clue: 'Langur, boginn kambur aftan á höfðinu.', color: '#859dce' },
  pteranodon: { name: 'Pteranodon', latin: '', kind: 'Flugeðla', clue: 'Breiðir vængir, langur goggur og engar tennur.', color: '#bd87b2' },
};

export const NARRATION = {
  ...ENCYCLOPEDIA_NARRATION,
  ...MINI_NARRATION,
  ...CLOUD_MATH_NARRATION,
  welcome: 'Halló, Egill! Velkominn heim til mín! Ég heiti Mosi. Eigum við að skoða okkur aðeins um saman?',
  invite: 'Komdu með, Egill! Ég skal sýna þér dálítið skemmtilegt. Bestu vinir mínir bíða okkar!',
  walkForest: 'Haltu þér vel í hnakkinn, Egill! Ég ætla að sýna þér leynistaðinn minn við vatnið. En fyrst skulum við finna vini mína í skóginum!',
  stegoArrival: 'Hlustaðu, það skrjáfar í runnunum! Einhver er á leiðinni til okkar. Sjáðu bakið!',
  stegoQuestion: 'Bíddu aðeins! Sjáðu þarna, við hliðina á stígnum. Vá, veistu hvað þessi risaeðla heitir?',
  stegoHint: 'Ekki alveg, he he! Þetta er kambeðla. Sjáðu stóru plöturnar á bakinu. Geturðu fundið nafnið hennar?',
  stegoCorrect: 'Já, Egill! Kambeðla, líka kölluð Stegósárus! Þessar plötur eru engin laufblöð. Ég held að hér séu fleiri risaeðlur að sjá!',
  walkTall: 'Stígurinn liggur undir risastóru trjánum. Laufblöð detta niður! Ætli einhver sé að fá sér morgunmat þarna uppi?',
  brachioArrival: 'Þarna hreyfast greinarnar! Nú kemur einhver stór. Úps! Ég vona að hún stígi ekki á nestið mitt!',
  brachioQuestion: 'Vá, þvílíkur háls! Þessi nær í laufin sem ég næ aldrei í. Veistu hvað hún heitir?',
  brachioHint: 'Góð tilraun! Þetta er þórseðla, Brontósárus. Sjáðu langa hálsinn og langa halann. Prófum aftur saman!',
  brachioCorrect: 'Alveg rétt, Egill! Þórseðla! Hún er líka kölluð Brontósárus. Ég þyrfti ansi háan koll til að heilsa henni!',
  walkRex: 'Sjáðu þessi stóru fótspor! Þau liggja að rjóðrinu. Við höldum okkur á stígnum og fylgjum slóðinni saman.',
  rexArrival: 'Dúmm, dúmm! Heyrirðu þungu skrefin? Þarna kemur vinur minn út á milli trjánna!',
  rexQuestion: 'Þarna er stórt höfuð og agnarlitlir framfætur! Hvaða risaeðla heldurðu að þetta sé?',
  rexHint: 'Næstum því! Þetta er grameðla, Týrannósárus rex. Taktu eftir stóra höfðinu. Finnum nafnið hennar!',
  rexCorrect: 'Já, Egill! Grameðla, Týrannósárus rex! Hún gengur á tveimur fótum. Ég er með fjóra og rekst samt stundum á rætur!',
  walkLake: 'Við fundum leiðina! Hér er leynistaðurinn minn. Sjáðu vatnið glitra! Kannski eru fleiri vinir að leika sér við bakkann.',
  spinoArrival: 'Skvamp! Eitthvað hreyfist á bak við sefið. Sjáðu, dýr með segl á bakinu kemur til okkar!',
  spinoQuestion: 'Sjáðu seglið á bakinu og langa trýnið! Þessi stendur við vatnið. Þekkirðu nafnið?',
  spinoHint: 'Það er gaman að giska! Þetta er uggeðla, Spínósárus. Seglið á bakinu hjálpar okkur að þekkja hana. Reynum aftur!',
  spinoCorrect: 'Þú fannst hana, Egill! Uggeðla, eða Spínósárus! Hún át meðal annars fiska. Ég held mig við laufblöðin mín!',
  walkReeds: 'Förum rólega meðfram vatninu. Hér heyrist svo margt! Vatnið skvampar, sefið hvíslar... og hver var að kalla?',
  paraArrival: 'Halló þarna! Sjáðu hver kemur gangandi úr sefinu. Heldurðu að hún vilji heilsa okkur?',
  paraQuestion: 'Sjáðu þennan langa, bogna kamb aftan á höfðinu! Hvaða risaeðla er þetta?',
  paraHint: 'Skoðum hana betur! Þetta er slóeðla, Parasárolófus. Kamburinn bendir aftur fyrir höfuðið. Veldu nafnið hennar!',
  paraCorrect: 'Einmitt, Egill! Slóeðla! Hún er líka kölluð Parasárolófus. Holi kamburinn gat hjálpað henni að gefa frá sér hljóð!',
  lookUp: 'Nú vantar bara eina vinkonu. Hún tekur alltaf stystu leiðina og þarf engan stíg! Lítum upp fyrir trén.',
  pteraArrival: 'Þarna kemur hún fljúgandi! Sjáðu vængina! Hún tekur beygju og svífur alveg til okkar.',
  pteraQuestion: 'Vá, hvað hún svífur fallega! Veistu hvað þessi flugeðla heitir?',
  pteraHint: 'He he, þessi heitir Pteranódon! Sjáðu langa gogginn og kambinn aftan á höfðinu. Geturðu fundið nafnið?',
  pteraCorrect: 'Já, Egill! Pteranódon! Hún er flugeðla, en ekki risaeðla. Hún lifði á tímum risaeðlanna. Ég vildi óska að ég gæti svifið svona!',
  finish: 'Við fundum sex stóra vini og leynistaðinn við vatnið, Egill! Í bókinni getum við skoðað uppgötvanirnar okkar og heimsótt vini okkar aftur. Eigum við að kíkja?',
  mosi: 'Ég er þríhyrna, Tríseratops. Þrjú horn og einn mjög svangur magi! En vinir mínir kalla mig Mosa.',
  name_triceratops: 'Þríhyrna. Tríseratops.',
  name_stegosaurus: 'Kambeðla. Stegósárus.',
  name_brachiosaurus: 'Þórseðla. Brontósárus.',
  name_trex: 'Grameðla. Týrannósárus rex.',
  name_spinosaurus: 'Uggeðla. Spínósárus.',
  name_parasaurolophus: 'Slóeðla. Parasárolófus.',
  name_pteranodon: 'Pteranódon. Flugeðla.',
  ...ADVENTURE_NARRATION,
};

export const ENCOUNTERS = [
  { species: 'stegosaurus', biome: 'forest', travel: 'walkForest', arrival: 'stegoArrival', question: 'stegoQuestion', hint: 'stegoHint', correct: 'stegoCorrect', choices: ['triceratops', 'stegosaurus', 'trex'] },
  { species: 'brachiosaurus', biome: 'forest', travel: 'walkTall', arrival: 'brachioArrival', question: 'brachioQuestion', hint: 'brachioHint', correct: 'brachioCorrect', choices: ['brachiosaurus', 'spinosaurus', 'stegosaurus'] },
  { species: 'trex', biome: 'forest', travel: 'walkRex', arrival: 'rexArrival', question: 'rexQuestion', hint: 'rexHint', correct: 'rexCorrect', choices: ['parasaurolophus', 'triceratops', 'trex'] },
  { species: 'spinosaurus', biome: 'lake', travel: 'walkLake', arrival: 'spinoArrival', question: 'spinoQuestion', hint: 'spinoHint', correct: 'spinoCorrect', choices: ['trex', 'spinosaurus', 'brachiosaurus'] },
  { species: 'parasaurolophus', biome: 'lake', travel: 'walkReeds', arrival: 'paraArrival', question: 'paraQuestion', hint: 'paraHint', correct: 'paraCorrect', choices: ['parasaurolophus', 'stegosaurus', 'spinosaurus'] },
  { species: 'pteranodon', biome: 'sky', travel: 'lookUp', arrival: 'pteraArrival', question: 'pteraQuestion', hint: 'pteraHint', correct: 'pteraCorrect', choices: ['brachiosaurus', 'parasaurolophus', 'pteranodon'] },
];

export function displayText(text) {
  return text.replaceAll('Tríseratops', 'Triceratops').replaceAll('Stegósárus', 'Stegosaurus').replaceAll('Brontósárus', 'Brontosaurus').replaceAll('Týrannósárus rex', 'Tyrannosaurus rex').replaceAll('Spínósárus', 'Spinosaurus').replaceAll('Parasárolófus', 'Parasaurolophus').replaceAll('Pteranódon', 'Pteranodon');
}
