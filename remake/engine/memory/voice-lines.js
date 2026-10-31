// The established Mosi voice, with captions that remain available without audio.
// `text` is what the child sees. `say` (sent in place of the text) and `context` (sent as previous_text, never spoken) fix a
// word the owner heard wrong; tools/memory-voices.mjs sends them. Picked by ear 2026-10-30: Hver in IPA; Einn with Litla
// Yatzy's counting context and seed 7 (its smallStraight take).
const HVER = '"/kʰvɛːr/"';
const COUNTING = 'Við teljum á íslensku: einn, tveir, þrír, fjórir, fimm.';
// Level 2's hard word: plain, Eleven loses the "gl" (scribe heard "Steinadýfrið"); with its IPA scribe hears it whole (2026-10-31).
const GLJUFRID = '"/ˈsteiːnaˌkljuːvrɪθ/"';
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
  // The gifts (Task 9): the crossing waits for them, Mosi names each pair as it is found, and the round always ends with all three.
  giftsLeft: { text: 'Finnum fyrst gjafirnar sem eru eftir!', seed: 251301 },
  gifts3: { text: 'Þú fannst allar þrjár gjafirnar!', seed: 251302 },
  gift_shrew: { text: 'Snjáldurmús! Hún fer í körfuna.', context: 'Hér er lítil snjáldurmús. Snjáldurmús er pínulítið dýr.', seed: 251311 },
  gift_hermitCrab: { text: 'Kuðungakrabbi! Hann fer í körfuna.', seed: 251304 },
  gift_crab: { text: 'Krabbi! Hann fer í körfuna.', seed: 251305 },
  // Level 2, Steinagljúfrið (Task 3): the welcome, the wait for the fossils still under the leaves (said when the way through the tunnel
  // waits for them), the fossils' sentence and the four fossils, named as each pair is found. The lines of the tasks (g2_light_ready...)
  // come with their scenes in Tasks 4 to 7.
  g2_welcome: { text: 'Velkomin í Steinagljúfrið! Finndu tvo eins vini.', say: `Velkomin í ${GLJUFRID}! Finndu tvo eins vini.`, seed: 251401 },
  g2_left: { text: 'Finnum fyrst það sem er eftir undir laufunum!', seed: 251402 },
  gifts4: { text: 'Þú fannst alla fjóra steingervingana!', seed: 251403 },
  // (plain, scribe heard "Snigilstæinn" and "Lafstein": a sentence that says what the stone is, sent first and not spoken, brought them to "Snigillsteinn" and "Laufstein")
  gift_ammonite: { text: 'Snigilsteinn! Hann fer í körfuna.', context: 'Hér er steinn með snigli í. Snigilsteinn er steingervingur.', seed: 251411 },
  gift_trilobite: { text: 'Pöddusteinn! Hann fer í körfuna.', seed: 251412 },
  gift_fern: { text: 'Laufsteinn! Hann fer í körfuna.', context: 'Hér er steinn með laufblaði í. Laufsteinn er steingervingur.', seed: 251413 },
  gift_footprint: { text: 'Risaspor! Það fer í körfuna.', seed: 251414 },
  // Level 2's first two tasks (Task 4): the tunnel is dark (said when the Kambeðlur are found and home), the plates light it, the rockfall is
  // there (said when the Þríhyrnur are), and the pile is gone. "Hver" goes as IPA, as in who and won.
  g2_light_ready: { text: 'Göngin eru dimm. Hver getur lýst þau upp?', say: `Göngin eru dimm. ${HVER} getur lýst þau upp?`, seed: 42 },
  g2_lit: { text: 'Plöturnar lýsa eins og ljósker!', seed: 251422 },
  g2_rocks_ready: { text: 'Grjót lokar göngunum. Hver getur stangað það burt?', say: `Grjót lokar göngunum. ${HVER} getur stangað það burt?`, seed: 251423 },
  g2_rocks_done: { text: 'Búmm! Leiðin er opin!', seed: 251424 },
});
