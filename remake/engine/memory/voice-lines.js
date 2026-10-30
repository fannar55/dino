// The established Mosi voice, with captions that remain available without audio.
// `text` is what the child sees. `say` (sent in place of the text) and `context` (sent as previous_text, never spoken) fix a
// word the owner heard wrong; tools/memory-voices.mjs sends them. Picked by ear 2026-10-30: Hver in IPA; Einn with Litla
// Yatzy's counting context and seed 7 (its smallStraight take).
const HVER = '"/kʰvɛːr/"';
const COUNTING = 'Við teljum á íslensku: einn, tveir, þrír, fjórir, fimm.';
export const VOICE_LINES = Object.freeze({
  welcome: { text: 'Ungarnir eru í feluleik. Finnum tvo eins!', seed: 251025 },
  first: { text: 'Ýttu á lauf. Skoðaðu ungann og finndu annan eins.', seed: 251026 },
  match: { text: 'Þeir fundu hvor annan!', seed: 251027 },
  help: { text: 'Finndu þrjú vinapör undir laufunum. Þórseðlurnar lyfta greininni. Þríhyrnurnar gera brú. Kambeðlurnar leggja leið yfir mýrina. Saman komumst við í berjalundinn!', seed: 251101 },
  won: { text: 'Allir sex komnir í berjalundinn! Hver vinur hjálpaði til. Vel gert!', say: `Allir sex komnir í berjalundinn! ${HVER} vinur hjálpaði til. Vel gert!`, seed: 251102 },
  find_bronto: { text: 'Veldu þórseðluparið. Þær ná upp að greininni!', seed: 251103 },
  lift: { text: 'Upp með greinina. Saman getum við þetta!', seed: 251104 },
  held: { text: 'Þórseðlurnar halda. Nú geta þríhyrnurnar hjálpað!', seed: 251105 },
  roll: { text: 'Einn, tveir, ýtum! Bolurinn verður að brú.', context: COUNTING, seed: 7 },
  cross: { text: 'Brúin er tilbúin. Allir sex fara saman yfir!', seed: 251107 },
  find_stego: { text: 'Hér er mjúk mýri. Veldu kambeðlurnar til að byggja leið!', seed: 251108 },
  build: { text: 'Þær bera börkinn saman. Ein fjöl í einu!', seed: 251109 },
  walkway: { text: 'Sjáðu gönguleiðina! Veldu nú berjalundinn.', seed: 251110 },
  finish: { text: 'Nú komast allir yfir. Berin bíða okkar!', seed: 251111 },
  who: { text: 'Hver getur þetta?', say: `${HVER} getur þetta?`, seed: 251201 },
  other: { text: 'Kannski einhver annar?', seed: 251202 },
  together: { text: 'Við gerum þetta saman!', seed: 251203 },
  push: { text: 'Einn, tveir, ÝTA!', context: COUNTING, seed: 7 },
  findFirst: { text: 'Finnum vini fyrst!', seed: 251205 },
  notYet: { text: 'Fyrst þurfum við að lyfta greininni!', seed: 251206 },
  gifts1: { text: 'Þú fannst eina óvænta gjöf!', seed: 251207 },
  gifts2: { text: 'Þú fannst tvær óvæntar gjafir!', seed: 251208 },
});
