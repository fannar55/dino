# Fjölspil í Litla Yatzý: teningar í símanum, borðið á stóra skjánum

Viðbót við `2026-10-24-fjolspil-design.md` (áfangi 3). Allt sem sú forskrift segir um herbergið, sætin, netið, símasíðuna, hýsinguna og villurnar gildir óbreytt hér; þessi forskrift segir aðeins það sem Litla Yatzý bætir við eða gerir öðruvísi. Risaeðlu-Yatzý fer úr leiknum um leið (kafli 9).

## 1. Markmið

- Litla Yatzý við Mosa (`remake/yatzy-junior.html`, síðan sem bókin opnar í ramma yfir Leikir-síðunni) fær „Fjölspil“: 2–4 leikmenn, Egill á stóra skjánum og hinir í símum eða spjaldtölvum sem skanna QR-kóðann.
- Síminn er teningabollinn eins leikmanns: „Kasta!“, teningarnir fimm til að geyma eða losa, spjöldin fimm til að leggja stigin á. Stóri skjárinn (hostvélin) er borðið: teningarnir rúlla þar í þrívídd, Mosi situr þar, spjöldin og stig allra sjást þar — sama sýning og í einspilinu.
- Sömu kröfur og áður: heima yfir sama Wi-Fi án skýsins, og á Cloudflare með `cloud/` óbreyttu (síðan stigast með eins og nú).

## 2. Ákvarðanir eigandans (24. október 2026)

- **Litla Yatzý fyrst; Risaeðlu-Yatzý fer alveg úr leiknum** (flís, kóði, css, lab-síða, próf) í sér commit-i. Mosa-Yatzý (`yatzy-mosi.html`, sér síða sem bókin opnar ekki) er látið í friði.
- **Egill spilar á stóra skjánum** eins og í dag (bollinn, teningarnir, spjöldin þar). Hinir spila úr sínum tækjum án þess að þurfa að snerta stóra skjáinn, en horfa á hann: kastið og stigin eru sýningin þar.
- **Mosi situr alltaf við borðið**, horfir og talar. „Bæta Mosa við“ í lobbíinu gerir hann að leikmanni (eina tölvusætið, forskrift §5); þá Egill + Mosi + allt að tveir símar. Annars allt að þrír símar.
- **Rödd Mosa:** nýjar almennar línur án nafna (kafli 8), gerðar með raddtólinu sem til er; eigandinn keyrir það með sínum lykli. Bólan sýnir nafnið.
- **Leiðin (A):** síða Litla Yatzý hýsir sitt eigið herbergi (kafli 3), í stað brúar yfir í herbergi bókarinnar (B) eða flutnings leiksins úr rammanum (C).

## 3. Leiðin: ramminn hýsir herbergið

Síða Litla Yatzý flytur inn `engine/fjolspil/fjolspil.js` (lotan), `lobby.js` og `fjolspil.css` og gerir sína eigin lotu (`createFjolspil`) með sömu stillingum og bókin: sama fundarstaður (`/fjolspil/ws/<kóði>`, sama uppruna), sama WebRTC/relay, sama símasíða (`spil.html`). Bókin breytist ekki nema í flísinni (kafli 9).

- **Geymslulykill:** `createFjolspil` fær valkostinn `storageKey` (sjálfgefið lykillinn sem er í dag). Lota síðu Litla Yatzý notar sinn eigin (`fjolspil.room.yatzy-junior`), því sami uppruni í sama flipa deilir sessionStorage með rammanum; annars tækju bókin og ramminn sama herbergið (sama kóða og lykil) og hvor lotan ræki hina út („replaced“).
- **Lokun:** X bókarinnar yfir rammanum fjarlægir rammann og síðan afhleðst (sökklar lokast, símarnir sjá `host-gone` og bíða). Síðan kallar `closeGame()` í `pagehide` eftir bestu getu svo símarnir fái „Leiknum er lokið“ um leið þegar netið nær því; náist það ekki bíða þeir eins og forskrift §10 segir, og herbergið rennur út.
- **Hljóð lobbísins:** smellhljóð bókarinnar (`book/fx.js`) úr hljóðsamhengi síðunnar sjálfrar (`createJuniorAudio` á það); raddir eins og nú.

## 4. Reglurnar fyrir 2–4 (`engine/yatzy-junior/rules.js`)

Leikurinn fær leikmannalista í stað „you/mosi“ og helst að öðru leyti sama hreina reglusafn (gögn inn, ný gögn út, ólöglegt kast kastar villu):

- `createGame({ seed, startingPlayer, players = 2 })`: `players` er 2–4 (tala) eða listi af auðkennum (sætisnúmerin sem strengir, `'0'`…`'3'`); einspilið gefur `['you', 'mosi']` eins og nú, svo eldri vistanir lesast óbreyttar (`SAVE_VERSION` stendur í 1).
- Umferðin gengur hringinn: `currentPlayer = (startingPlayer + turnCount) % n`; `MAX_TURNS = ROUND_COUNT * n`; umferðin sem sýnd er („2 af 5“) er `floor(turnCount / n) + 1`.
- `findWinner` gefur auðkenni þess með flest stig, `'tie'` séu fleiri jafnir efstir.
- `validateGame` tekur 2–4 leikmenn með ólík auðkenni; prófun á fjölda útfylltra reita fylgir hringnum (`floor((turnCount + (n - 1 - ((i - startingPlayer + n) % n))) / n)` fyrir leikmann i).
- `roll`, `hold`, `score`, `previews`, `scoringDice`, `decideAI` óbreytt að merkingu; `decideAI` spilar hvaða sæti sem er (Mosa sjálfan, og sæti sem Mosi hylur meðan gestur er fjarri).
- Kastið er alltaf stóra skjásins: sáða slembiröðin (`rng`) í leiknum, aldrei símans.

## 5. Sætin og stóri skjárinn (`engine/yatzy-junior/game.js`, `yatzy-junior.html`, `yatzy-junior.css`)

- **Sætin:** sæti 0 er Egill (`kind: 'host'`, `HOST_AVATAR`), sæti 1–3 gestir með nafn og vin, eitt þeirra mögulega Mosi (`kind: 'ai'`). Leikmaður i í reglunum er sæti i (forskrift §7.1). Mosi sem leikmaður fær sína eigin mynd í `seats.js`: avatarinn `mosi` (nafn „Mosi“, salvíugrænn, `assets/book/images/mosi-render.webp`), sem gestir fá ekki að velja, svo sæti Egils (mynd Mosa, `HOST_AVATAR`) og Mosi sjálfur sjáist í sundur. Lobbíið fær `ai: { name: 'Mosi', avatar: 'mosi', add: 'Bæta Mosa við', remove: 'Taka Mosa út' }`.
- **Leikmannastikan** (efst til vinstri) sýnir 2–4 spjöld í stað tveggja: mynd (vinur, Egill, Mosi), nafn, stigin undir, sá sem á leik upplýstur; sömu púls- og poppbrellur. Umferðarpunktarnir „1 af 5“ halda sér (umferð = kafli 4).
- **Spjöldin fimm** neðst eru alltaf spjöld þess sem á leik: nafnmerki hans á spjaldaröðinni („Anna“), +stig í boði á lausum spjöldum, notuð spjöld með stigunum sínum og teningunum sem fylltu þau. Spjöld hinna sjást ekki í einu (fimm spjöld, fjórir leikmenn — þau mega ekki smækka); stikan segir stigin.
- **Egils leikur** er óbreyttur: bollinn, teningahnapparnir, spjöldin, hugmyndin eftir 10 s, „Nota spjaldið? 0 stig“.
- **Símaleikmanns leikur:** bolli og teningar stóra skjásins bíða (hvorki bollinn né teningarnir taka við pikki; bollinn sýnir hring þess sem á leik í lit sætisins), og beiðnir símans ráða: `roll` rúllar teningunum í þrívídd með sömu brellum og viðbrögðum Mosa; `hold` lyftir teningnum í hreiðrið (eða losar); `score` lætur teningana fljúga á spjaldið, spjaldið stimplast og stigin fljúga í stikuna. Beiðni sem passar ekki stöðunni (ekki hans leikur, ekkert kast eftir, reitur notaður, teningar á hreyfingu) er látin eiga sig; næsta sýn segir símanum hvað gildir. Meðan teningarnir rúlla eða fljúga (`settled()` ósatt) bíða beiðnir þar til kyrrt er, og síminn fær sýn með `canRoll/canHold/canScore` ósatt á meðan.
- **Mosa sæti og hulið sæti:** `decideAI` með sömu töfum og í dag (hugsar, geymir, kastar, velur).
- **Sýnir** (`send(seat, yatzyView(seat))` við hverja breytingu, til allra gesta leiksins eins og Háls og hali, aldrei broadcast):

```
{ screen: 'yatzy', you: 2, turn: 1, round: 3,
  rolls: 1,                       // köst notuð í leiknum sem stendur (0..3)
  dice: [3, 3, 1, 5, 6],          // 0 áður en kastað er
  held: [true, true, false, false, false],
  roll: { seq: 17, by: 1 },       // nýjasta kastið; síminn veltir teningunum þegar seq breytist
  canRoll: false, canHold: false, canScore: false,   // hvað ÞETTA sæti má núna
  cards: [ { id: 'pair', label: 'Eitt par', score: null, preview: 6, faces: [] }, … ],  // spjöld þess sem á leik
  players: [ { seat: 0, name: 'Egill', avatar: 'egill', total: 23 }, { seat: 1, name: 'Anna', avatar: 'sloedla', total: 15 }, … ],
  winner: null }                  // sæti, 'tie' eða null
```

- **Beiðnir** frá símanum (`onAct`): `{ type: 'roll' }`, `{ type: 'hold', die: 0..4 }`, `{ type: 'score', card: 'pair' }`. Stóri skjárinn tekur aðeins við beiðni frá sætinu sem á leik og aðeins þegar leikurinn leyfir hana.
- **Vistun:** Fjölspil-leikur vistast í `localStorage` síðunnar undir eigin lykli (`mosi.yatzy.junior.fjolspil.v1`: `{ state, seats }`, sætin `seats.snapshot()`), aðskilinn frá einspilsvistuninni. „Halda áfram“ á upphafsspjaldinu býður hann (framar einspilsvistun sé hún líka til: tveir hnappar, „Halda áfram (Fjölspil)“ og „Halda áfram“). Framhald: `fjolspil.resume(seats)` opnar herbergið með sama kóða og lykli (sessionStorage sama flipa), og hver gestur sem er enn á símasíðunni kemur sjálfur inn (`hello` með sínu auðkenni, forskrift §6.4); hinir skanna aftur. Lokinn leikur gleymist.

## 6. Símaskjárinn (`engine/fjolspil/guest-yatzy.js`, `spil.css`, `spil.html`)

`renderYatzy(root, view, { send, doc, control })`, skráð í `spil.html` við hlið `renderHals` og `renderEitt`; byggt einu sinni í `.spil-game` og uppfært eftir það; nöfn með `textContent`.

- **Efst:** „Þú átt leik!“ eða „Anna á leik“, og köstin sem eftir eru sem þrír punktar (eins og á bollanum): fullir = eftir.
- **Teningarnir fimm** í miðju: stórir hnappar (minnst 64 px, 88 px á síma) með vinamyndinni og tölunni eins og smáteningarnir á spjöldunum (`DINO_FACES`, sömu myndir og á borðinu); geymdur = gullrammi og hak (sama mál og `die-target.held`). Pikk sendir `hold` og bíður sýnar (hnappurinn óvirkur þar til hún kemur, eins og teningurinn í Háls). Áður en kastað er sýna þeir bakhlið (dauf spurningarmerki). Þegar `roll.seq` breytist velta teningarnir sem kastað var (`spil-tumble`, 950 ms) og sýna svo andlitin, svo kastið sést á báðum skjám saman — hvers sem kastið er.
- **Bollinn „Kasta!“** undir teningunum: stóri græni pillan, með „Kasta aftur!“ eftir fyrsta kast; óvirkur og dofinn þegar `canRoll` er ósatt. Eftir þriðja kast (eða alla geymda) dofnar hann og spjöldin lýsa.
- **Spjöldin fimm** neðst í einni röð (á síma tvær raðir, 3 + 2): mynd (smáteningar dæmisins eða teningarnir sem skora), nafn, +stig í boði á lausu; notað spjald með stigunum og dauft. Pikk á laust spjald sem gæfi stig sendir `score`; spjald sem gæfi 0 opnar fyrst staðfestingu í sama spjaldi („Nota spjaldið? 0 stig“ — „Nota“ / „Velja annað“) og sendir svo. Á leik annars eru spjöldin spjöld þess sem á leik, dauf og óvirk.
- **Stikan** neðst alltaf: andlit, nafn og stig hvers sætis, sá sem á leik upplýstur.
- **Í lokin:** mynd sigurvegarans og „Anna vann!“ (eða „Jafntefli!“) í stað teninganna, stig allra í stikunni.
- **Hljóð:** smellhljóð bókarinnar á hverjum hnappi, og lítið teningaskrölt síðunnar (einn stuttur hljóðgervill í `guest.js`-samhenginu, sama ætt og Eitt!-brellurnar á tækinu) þegar kast lendir; engar raddir. Hljóðsamhengið er það sem `guest.js` á (vakið við fyrstu snertingu, forskrift §7.3/I2).
- **Demó:** `spil.html?demo=yatzy` sýnir eigin leik með kasti í gangi (fyrir útlitsmyndir án tengingar).

## 7. Lobbí, brottfall, hlé

- **Upphafsspjaldið** („Litla Yatzý við Mosa“) fær „Fjölspil“ við hlið „Spila“ (og „Læra með Mosa“). Hann opnar lobbíið yfir þrívíddarborðinu (QR-kóði, kóðinn stór, sætin, „Bæta Mosa við“, „Byrjum!“, „Hætta“ aftur á upphafsspjaldið). „Byrjum!“ byrjar leik með sætunum; Egill byrjar (sæti 0) eins og í dag.
- **Á meðan Fjölspil stendur** eru kennslan („Læra með Mosa“, „Sýndu mér“) og „Byrja upp á nýtt“ í hlévalmyndinni ekki í boði (hið síðara verður „Hætta Fjölspili“, sem lokar leiknum: `closeGame()`, símarnir á lobbíbið). Hlé síðunnar (hlévalmyndin, falinn flipi) heldur leiknum eins og nú; símarnir fá sýn með öllu ósönnu á meðan og „Stóri skjárinn er í hléi“ í stöðulínunni (nýr texti í `guest.js` fyrir `paused: true` í sýn, sem Háls og Eitt! nota ekki).
- **Brottfall:** eigi gestur leik og er farinn (`!seat.present`) kemur biðspjaldið yfir borðið (`fjolspil.waitFor(seat)`: „Bíðum eftir …“ með QR); eftir 20 s „Halda áfram án …“ og Mosi spilar sætið hljóðlega (`decideAI`, engin lína, viðbrögð hans leyfð) þar til hún er komin; þá er sætið hennar við næsta leik hennar. `'closed'` stöðvar leikinn. Nákvæmlega forskrift §6.4 og Háls og hali.
- **Fleiri tæki en sæti:** eins og forskrift (I3): herbergið heldur sökklum, sætin takmarka.

## 8. Rödd Mosa í Fjölspili (`engine/yatzy-junior/voice-lines.js`)

- **Halda sér** (passa öllum): kastviðbrögðin (`good`, `great`, `bad`), `hold`, `release`, `allHeld`, `choose`, `lastRoll`, `noRolls`, `zero`, `pause`, `resume`, `help`, spjaldaskýringarnar, tölulínurnar (`points_N`).
- **Víkja í Fjölspili** („þú/Mosi“): `yourTurn`, `scored`, `youWin`, `yourTotal`, `mosiTotal`, `tie` (hljómar sem „við“). Spili Mosi sjálfur halda `mosiTurn`, `mosiScored` og `mosiWin` sér fyrir hann.
- **Nýjar almennar línur** (`MULTI_LINES`, sama snið og `VOICE_LINES`, bólan sýnir nafnið í nefnifalli):
  - `multiWelcome` „Velkomin að borðinu! Við skiptumst á.“ (þegar leikurinn byrjar)
  - `multiTurn` „Næsti kastar!“ (bólan: „Anna á leik“)
  - `multiScored` „Flott! Stigin fara á kortið.“ + `points_N` (bólan: „Anna: 12 stig“)
  - `multiZero` „Ekkert í þetta sinn. Næst gengur betur!“ (bólan: „Anna: 0 stig“)
  - `multiWait` „Við bíðum aðeins.“ (biðspjaldið)
  - `multiOver` „Leik lokið! Sjáum hver vann.“ (bólan: „Anna vann!“ / „Jafntefli!“)
- **Valkvæðar:** síðan opnast þótt upptöku vanti. Ræsingin krefst allra `VOICE_LINES` eins og nú en ekki `MULTI_LINES`; vanti línu í `manifest.json` birtist bólan með textanum einum (engin „Rödd Mosa náðist ekki“). Raddtólið (`remake/tools/yatzy-junior-voices.mjs`) tekur `MULTI_LINES` með (`--only multiTurn,…`); eigandinn keyrir það með sínum lykli og commit-ar MP3 og `manifest.json` sjálfur. Framburðarreglur og `voices-made.json` eins og fyrir hinar línurnar.

## 9. Risaeðlu-Yatzý út

Fyrsta verkið, sér commit:
- Eyða `remake/engine/yatzy/` (advice, rules, sloedla, sloedla-view, table, yatzy-sounds), `remake/yatzy.css`, `remake/yatzy-lab.html`, `remake/tests/yatzy.test.mjs`; línu Risaeðlu-Yatzý úr `remake/tests/game-music.test.mjs`; `createYatzyGame` og `hold('yatzy', …)` úr `main.js` (`onPlay('yatzy')` fer).
- `book.js`: flís Risaeðlu-Yatzý (og `YATZY_OPEN`, `YATZY_SEEN`, `tapYatzy`) fer; Litla Yatzý verður eigin flís á Leikir-síðunni í sama sæti (`data-game="yatzy-junior"`, mynd Mosa `assets/eitt/mosi.webp`, salvíugrænn litur, nafnið „Litla Yatzý“, „Nýtt!“ þar til fyrst opnað, `seen`-lykillinn `yatzy-junior`), í stað litla hnappsins undir gömlu flísinni; `onPlay('yatzy-junior')` óbreytt.
- `seen`-færslan `yatzy` í eldri vistunum er látin eiga sig (skaðlaus).
- Gamla forskriftin (`2026-10-19-yatzy-sloedluleikur-design.md`) stendur sem saga; README-línur um Risaeðlu-Yatzý uppfærðar.

## 10. Útlit

- Lobbíið, biðspjaldið og símaskjárinn: forskrift §8 (Nunito, pappír, 88 px hnappar, hreyfing með transform/opacity, dofnun undir minni hreyfingu). Teningarnir á símanum í sama stíl og smáteningar spjaldanna (`yatzy-junior.css` `.mini-die`: vinamynd og tala), gullrammi og hak eins og geymdur teningur borðsins.
- Stóri skjárinn: leikmannastikan með allt að fjórum spjöldum helst innan sama svæðis og í dag (minni spjöld með fjórum; teningasýnin, `diceMargins`, telur stikuna áfram sem hindrun), nafnmerki á spjaldaröðinni í sama letri og `.pname`.
- Ekkert í `design/` eða `dist/` breytist.

## 11. Villur og jaðartilvik

- **Beiðni sem passar ekki** (ekki hans leikur, teningar á hreyfingu, reitur notaður, þrjú köst búin): látin eiga sig; næsta sýn leiðréttir símann. Tvísmellur á „Kasta!“ kastar aldrei tvisvar (hnappurinn bíður sýnar).
- **Gestur fer í miðju kasti** (teningar rúlla): kastið klárast á stóra skjánum; biðspjaldið kemur þegar röðin er enn hans og hann ekki þar.
- **Gestur fer meðan Mosi hylur sætið og kemur aftur í miðjum leik Mosa fyrir hann:** Mosi klárar þann leik; næsti leikur sætisins er gestsins.
- **Stóri skjárinn endurhlaðinn** (sami flipi): sessionStorage finnur herbergið; „Halda áfram (Fjölspil)“ heldur áfram þar sem frá var horfið (vistað við hverja breytingu); gestir koma sjálfir inn.
- **Síminn endurhlaðinn eða læstur:** forskrift §6.4 og sjálfvirka lagfæringin (rehello, vörðurinn): sætið og nýjasta sýnin koma aftur.
- **Bókin lokar rammanum** (X eða Escape): `closeGame()` í `pagehide`; nái það ekki, bíða símarnir og herbergið rennur út (forskrift §10).
- **Eldri einspilsvistun** (`mosi.yatzy.junior.save.v1`) lesast áfram: tveir leikmenn `you`/`mosi`.
- **Fjölspil-vistun með sætum sem ekki finnast** (skemmd): hent, upphafsspjaldið án „Halda áfram (Fjölspil)“.
- **Raddlína vantar** (`MULTI_LINES` ekki gerð): textinn einn í bólunni, engin villa, ekkert hlé.

## 12. Prófun

- `remake/tests/yatzy-junior-rules.test.mjs`: 2, 3 og 4 leikmenn (hringurinn, umferðin, `MAX_TURNS`, sigurvegari og jafntefli, `validateGame` á hringnum), eldri tveggja manna vistun lesast, `decideAI` fyrir hvaða sæti sem er.
- `remake/tests/fjolspil-guest-yatzy.test.mjs` (jsdom eins og Háls-prófin): eigin leikur (kasta sendir `roll` einu sinni; geyma sendir `hold`; spjald með stigum sendir `score`; 0-spjald spyr fyrst), leikur annars (allt óvirkt, nöfn rétt), veltan við nýjan `roll.seq`, lokaskjárinn, nöfn sem texti.
- `remake/tests/fjolspil-seats.test.mjs`: avatarinn `mosi` leysist, en gestur fær hann ekki.
- `remake/tests/yatzy-junior-voice.test.mjs`: `MULTI_LINES` valkvæðar (vantar í manifest → engin villa, bólan með texta).
- Síða Litla Yatzý er síðuforrit í þrívídd (ekki jsdom): `npm run check:yatzy-junior` helst grænt (einspilið óbreytt), og nýtt tól `remake/tools/yatzy-junior-fjolspil-check.mjs` opnar síðuna (`?qa`) og tvær `spil.html`-síður í hauslausum Edge á þróunarþjóninum, gengur gegnum lobbí → leik með Egli, tveimur símum og Mosa → brottfall og „Halda áfram án …“ → lok, með myndum í `qa/yatzy-junior-fjolspil/` fyrir eigandann.
- Síðasta rýni yfir alla greinina, og spilun í skýinu með símum (eigandinn).

## 13. Röð verka (áætlunin)

1. Risaeðlu-Yatzý út (kafli 9), próf græn.
2. Reglurnar fyrir 2–4 (kafli 4), próf.
3. `seats.js`: avatarinn `mosi`; `fjolspil.js`: `storageKey`; `guest.js`: `paused` í stöðulínu; próf.
4. Símaskjárinn `guest-yatzy.js` + `spil.css` + `spil.html` + demó (kafli 6), próf, myndir til eigandans.
5. Lotan inn í síðu Litla Yatzý: „Fjölspil“ á upphafsspjaldinu, lobbíið, sýnir og beiðnir, Egils leikur og símaleiks (kafli 5), vistun; hauslaus spilun.
6. Stóri skjárinn: stikan 2–4, nafnmerkið, biðspjaldið, Mosi sem leikmaður og hylur sæti, hlé og lokun (kaflar 5 og 7); hauslausa tólið með myndum.
7. Rödd Mosa (kafli 8): línurnar, valkvæðnin, raddtólið; eigandinn gerir upptökurnar.
8. Heildarrýni, lagfæringar, `npm run test:remake`, `check:yatzy-junior`; eigandinn stigar og ýtir í skýið og spilar með símum.

## 14. Utan umfangs

- Mosa-Yatzý (`yatzy-mosi.html`) í Fjölspili.
- Kennslan í Fjölspili.
- Spjöld allra sýnileg í einu á stóra skjánum.
- Rödd með nöfnum leikmanna.
- Breytingar á `cloud/`, `design/` eða `dist/`.
