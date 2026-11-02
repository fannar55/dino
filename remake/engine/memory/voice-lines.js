// The established Mosi voice, with captions that remain available without audio.
// `text` is what the child sees. tools/memory-voices.mjs sends every line through the remake's pronunciation standard,
// remake/assets/audio/pronunciation.json (the owner's recipe for each hard word: Kambeðla, Þórseðla, sex, Ein, of...), as the
// other games' tools do. A new inflection of a hard word ("Kambeðlurnar") must be added to its word's forms there: the tool
// refuses to send it as written. `say` (sent in place of the text) carries this game's own word fixes, and the lexicon is
// applied to it too; `context` (sent as previous_text, never spoken) and `seed` win over the lexicon's. `kept` marks a take the
// owner chose by ear: the line is sent as its own fields say, never with the lexicon, and never made again.
// A line that keeps its own `say` or `context` names what it fixes in `fixes` (book word ids of pronunciation.json, "punctuation",
// or "line" with a note), as main's lines do (CLAUDE.md, heard.mjs fixesProblems); the owner's yes/no verdicts on these takes are
// in remake/assets/audio/heard/<date>-minnisspil.json, and the tool refuses a request he rejected.
// Picked by ear 2026-10-30: Hver in IPA; Einn with Litla Yatzy's counting context and seed 7 (its smallStraight take).
// Picked by ear 2026-11-02 (qa/memory/tal): the old takes of help, cross, won, held and find_stego (kept); the book's takes of build
// and find_bronto; and a recipe for each new word (pronunciation.json). He rejected every take of g2_ledge_ready, then picked take B
// of the new candidates (qa/memory/tal2): Stallurinn respelled Statlurinn, of as written.
const HVER = '"/kʰvɛːr/"';
const COUNTING = 'Við teljum á íslensku: einn, tveir, þrír, fjórir, fimm.';
export const VOICE_LINES = Object.freeze({
  welcome: { text: 'Ungarnir eru í feluleik. Finnum tvo eins!', seed: 251025 },
  first: { text: 'Ýttu á lauf. Skoðaðu ungann og finndu annan eins.', seed: 251026 },
  match: { text: 'Þeir fundu hvor annan!', seed: 251027 },
  help: { text: 'Finndu þrjú vinapör undir laufunum. Þórseðlurnar lyfta greininni. Þríhyrnurnar gera brú. Kambeðlurnar leggja leið yfir mýrina. Saman komumst við í berjalundinn!', seed: 251101, kept: "the owner's pick by ear, 2026-11-02 (qa/memory/tal): the old take over the book's (the Þórseðla and Kambeðla contexts)" },
  won: { text: 'Allir sex komnir í berjalundinn! Hver vinur hjálpaði til. Vel gert!', say: `Allir sex komnir í berjalundinn! ${HVER} vinur hjálpaði til. Vel gert!`, seed: 251102, kept: "the owner's pick by ear, 2026-10-30: hver-2 (Hver in IPA); 2026-11-02 he kept it over the book's take", fixes: 'hver' },
  find_bronto: { text: 'Veldu þórseðluparið. Þær ná upp að greininni!', seed: 251103 },
  lift: { text: 'Upp með greinina. Saman getum við þetta!', seed: 251104 },
  held: { text: 'Þórseðlurnar halda. Nú geta þríhyrnurnar hjálpað!', seed: 251105, kept: "the owner's pick by ear, 2026-11-02 (qa/memory/tal): the old take over the book's (the Þórseðla context)" },
  roll: { text: 'Einn, tveir, ýtum! Bolurinn verður að brú.', context: COUNTING, seed: 7, kept: "the owner's pick by ear, 2026-10-30: einn-4 (Litla Yatzy's counting context, seed 7)", fixes: 'einn' },
  cross: { text: 'Brúin er tilbúin. Allir sex fara saman yfir!', seed: 251107, kept: "the owner's pick by ear, 2026-11-02 (qa/memory/tal): the old take over the book's (the counting context for sex)" },
  find_stego: { text: 'Hér er mjúk mýri. Veldu kambeðlurnar til að byggja leið!', seed: 251108, kept: "the owner's pick by ear, 2026-11-02 (qa/memory/tal): the old take over the book's (the Kambeðla context)" },
  build: { text: 'Þær bera börkinn saman. Ein fjöl í einu!', seed: 251109 },
  walkway: { text: 'Sjáðu gönguleiðina! Veldu nú berjalundinn.', seed: 251110 },
  finish: { text: 'Nú komast allir yfir. Berin bíða okkar!', seed: 251111 },
  who: { text: 'Hver getur þetta?', say: `${HVER} getur þetta?`, seed: 251201, kept: "the owner's pick by ear, 2026-10-30: hver-2 (Hver in IPA)", fixes: 'hver' },
  other: { text: 'Kannski einhver annar?', seed: 251202 },
  together: { text: 'Við gerum þetta saman!', seed: 251203 },
  push: { text: 'Einn, tveir, ÝTA!', context: COUNTING, seed: 7, kept: "the owner's pick by ear, 2026-10-30: einn-4 (Litla Yatzy's counting context, seed 7)", fixes: 'einn' },
  findFirst: { text: 'Finnum vini fyrst!', seed: 251205 },
  notYet: { text: 'Fyrst þurfum við að lyfta greininni!', seed: 251206 },
  // The gifts (Task 9): the crossing waits for them, Mosi names each pair as it is found, and the round always ends with all three.
  giftsLeft: { text: 'Finnum fyrst gjafirnar sem eru eftir!', seed: 251301 },
  gifts3: { text: 'Þú fannst allar þrjár gjafirnar!', seed: 251302 },
  gift_shrew: { text: 'Snjáldurmús! Hún fer í körfuna.', context: 'Hér er lítil snjáldurmús. Snjáldurmús er pínulítið dýr.', seed: 251311, kept: "the owner's pick by ear, 2026-10-30: take A (its context, seed 251311)", fixes: 'snjaldurmus' },
  gift_hermitCrab: { text: 'Kuðungakrabbi! Hann fer í körfuna.', seed: 251304 },
  gift_crab: { text: 'Krabbi! Hann fer í körfuna.', seed: 251305 },
  // Level 2, Steinagljúfrið (Task 3): the welcome, the wait for the fossils still under the leaves (said when the way through the tunnel
  // waits for them), the fossils' sentence and the four fossils, named as each pair is found. The lines of the tasks (g2_light_ready...)
  // come with their scenes in Tasks 4 to 7.
  g2_welcome: { text: 'Velkomin í Steinagljúfrið! Finndu tvo eins vini.', seed: 251401 },
  g2_left: { text: 'Finnum fyrst það sem er eftir undir laufunum!', seed: 251402 },
  // (the owner picked the take with this context on 2026-11-02; the book's Steingervingur keeps "hratt" chosen for the other games' 17 lines)
  gifts4: { text: 'Þú fannst alla fjóra steingervingana!', context: 'Steingervingar eru ævagamlir steinar. Við fundum alla steingervingana.', seed: 251403, fixes: 'steingervingur' },
  // (the fossils' words and their recipes, the owner's picks of 2026-11-02, are in pronunciation.json: Snigilsteinn, Pöddusteinn and Laufsteinn by a context, Risaspor in IPA)
  gift_ammonite: { text: 'Snigilsteinn! Hann fer í körfuna.', seed: 251411 },
  gift_trilobite: { text: 'Pöddusteinn! Hann fer í körfuna.', seed: 251412 },
  gift_fern: { text: 'Laufsteinn! Hann fer í körfuna.', seed: 251413 },
  gift_footprint: { text: 'Risaspor! Það fer í körfuna.', seed: 251414 },
  // Level 2's first two tasks (Task 4): the tunnel is dark (said when the Kambeðlur are found and home), the plates light it, the rockfall is
  // there (said when the Þríhyrnur are), and the pile is gone. "Hver" goes as IPA, as in who and won.
  g2_light_ready: { text: 'Göngin eru dimm. Hver getur lýst þau upp?', say: `Göngin eru dimm. ${HVER} getur lýst þau upp?`, seed: 42, fixes: 'hver' },
  g2_lit: { text: 'Plöturnar lýsa eins og ljósker!', seed: 251422 },
  g2_rocks_ready: { text: 'Grjót lokar göngunum. Hver getur stangað það burt?', say: `Grjót lokar göngunum. ${HVER} getur stangað það burt?`, seed: 251423, fixes: 'hver' },
  g2_rocks_done: { text: 'Búmm! Leiðin er opin!', seed: 251424 },
  // Level 2's next steps (Task 5): everyone goes through the tunnel, the ledge is too high (said when the Þórseðlur are home), the Þórseðlur pull the slab down, the cliff is steep
  // (said when the Flugeðlur are home), the Flugeðlur have flown the rope up, and everyone climbs with the rope as a handrail.
  g2_through: { text: 'Göngin eru opin. Allir með!', seed: 251431 },
  g2_ledge_ready: { text: 'Stallurinn er of hár. Hver nær hátt?', say: `Statlurinn er of hár. ${HVER} nær hátt?`, seed: 251432, kept: "the owner's pick by ear, 2026-11-02 (qa/memory/tal2): take B, Stallurinn respelled Statlurinn and of as written, after he rejected every earlier take", fixes: ['stallur', 'of', 'hver'] }, // of as written: the book's IPA of swallowed the h of hár
  g2_reached: { text: 'Langir hálsar ná hátt!', seed: 251433 },
  g2_cliff_ready: { text: 'Klettaveggurinn er brattur. Hver getur flogið með reipið upp?', say: `Klettaveggurinn er brattur. ${HVER} getur flogið með reipið upp?`, context: 'Klettaveggurinn er hár og brattur. Við bindum reipið fast við tréð.', seed: 251434, fixes: ['klettaveggur', 'hver', 'reipi'] }, // the take the owner picked 2026-11-02: Klettaveggur's context, which says reipið too
  // (plain, scribe heard "Fluggeðlurnar", and with other seeds "Flugvellurnar" and "Fluggæslurnar", and IPA made it "Flugvellirnar": the sentence about her that the pronunciation book's Flugeðla recipe sends first, not spoken, brought it to "Flugeðlurnar")
  g2_flown: { text: 'Flugeðlurnar fljúga upp!', seed: 42 },
  g2_climb: { text: 'Haldið í reipið. Upp með ykkur!', seed: 251436 },
  // Level 2's last step (Task 6): everyone to the second rope (said when the group is on the clifftop and the trunk waits for the tap), the count of the pull (said at the
  // child's moment, with the push's recipe: Einn by the counting context, seed 7), and the bridge (said as the walk over it starts).
  g2_pull_ready: { text: 'Togum öll saman í reipið!', seed: 251440 },
  g2_pull: { text: 'Einn, tveir, TOGA!', context: COUNTING, seed: 7, fixes: 'einn' },
  g2_bridge: { text: 'Brúin er komin. Á Sólarsylluna!', seed: 251441 },
});
