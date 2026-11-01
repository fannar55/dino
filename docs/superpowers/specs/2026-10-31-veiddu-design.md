# Veiddu: Go Fish Uggeðlu

Samþykkt hönnun 31. október 2026 (hugarflug í Veiddu-setunni, eigandinn svaraði
hverjum hluta). Handritið (`2026-10-28-handrit-leiksins.md`) setur leikinn í
kafla 2: Uggeðla er vinur kaflans, og þegar stjarnan hennar fæst opnast Veiddu á
Leikir-síðu bókarinnar. Kaflann sjálfan smíðar önnur seta (grein
`kafli-uggedla`).

## Markmið

Egill (6 ára, farinn að lesa) spilar Go Fish við Mosa og Uggeðlu og safnar
pörum af dýrum úr feninu. Hann les nöfnin og spurningarnar og heyrir þær um leið,
og lærir að muna hvað hinir báðu um. Umferð tekur 5–10 mínútur og hann vill
spila aftur. Tölvuleikmennirnir spila sanngjarnt og barnið vinnur um helming
leikja. Leikurinn er í ætt við Eitt! og Háls og hala: sama útlit, sömu hljóð í
tóntegund leiksins, límmiðar í bókinni og Fjölspil sem síðasti bútur.

## Ákvarðanir eigandans

| Spurning | Val |
|---|---|
| Myndir á spilunum | Ljósmyndir bókarinnar af fenjadýrunum, auk litfiska sem eigandinn útvegar |
| Fjöldi litfiska | Sex: rauður, gulur, grænn, blár, appelsínugulur, fjólublár |
| Leið | Nýr leikur við hlið Eitt! (`engine/veiddu/`), sameiginlegir hlutar fengnir frá Eitt! og bókinni; Eitt! óbreytt |
| Reglur og tölvuleikmenn | Eins og í kafla 2 hér að neðan |
| Skjár, raddir, hljóð | Eins og í köflum 4–6 |
| Bók, kennsla, bútar | Eins og í köflum 7–10 |

Úr fyrri ákvörðun eigandans (31. október, tillagan sem hann samþykkti): pör, ekki
fernur; barnið pikkar á spil og velur hvern það spyr; „Farðu að veiða!“ og
dregið úr tjörninni þar sem Uggeðla skvettir; flest pör vinnur; Fjölspil gott en
ekki ófrávíkjanlegt.

## 1. Spilin

13 dýrategundir, fjögur spil af hverri: 52 spil, 26 pör. Ljósmyndin „Fiskur“
(langnefurinn, dökk) er ekki með, svo enginn rugli honum við litfiskana.

| id | Nafn (á spilinu) | Í spurningu („Áttu …?“) | Mynd |
|---|---|---|---|
| froskur | Froskur | frosk | `frog-common` |
| skjaldbaka | Skjaldbaka | skjaldböku | `pond-turtle` |
| drekafluga | Drekafluga | drekaflugu | `emperor-dragonfly` |
| brunnklukka | Brunnklukka | brunnklukku | `diving-beetle` |
| vatnalaesingi | Vatnalæsingi | vatnalæsingja | `waterstrider-sharp` |
| salamandra | Salamandra | salamöndru | `fire-salamander` |
| snigill | Snigill | snigil | `snail-garden` |
| fiskur-raudur | Rauður fiskur | rauðan fisk | frá eigandanum |
| fiskur-gulur | Gulur fiskur | gulan fisk | frá eigandanum |
| fiskur-graenn | Grænn fiskur | grænan fisk | frá eigandanum |
| fiskur-blar | Blár fiskur | bláan fisk | frá eigandanum |
| fiskur-appelsinugulur | Appelsínugulur fiskur | appelsínugulan fisk | frá eigandanum |
| fiskur-fjolublar | Fjólublár fiskur | fjólubláan fisk | frá eigandanum |

- Myndir bókarinnar eru sniðnar ferningslaga að dýrinu (tæknivinnsla á
  myndum sem leikurinn á, ekki ný list) og vistaðar í `remake/assets/veiddu/`.
  Uppruni og leyfi fylgja úr `media-manifest.json` bókarinnar.
- Fiskana sex gerir eigandinn eða velur af vefnum (helst ferningslaga, einfaldur
  eða gegnsær bakgrunnur). Þar til þeir koma er fiskaspil látlaust spil í sínum
  lit með nafninu og engri mynd. Claude teiknar enga fiska.
- Spil sýnir myndina stórt og nafnið undir í stórum stöfum (Nunito), í ramma
  sem minnir á spil Eitt!. Bakhlið: ein og sama fyrir öll spil, í útliti Eitt!.

## 2. Reglurnar

- **Leikmenn:** barnið (sæti 0, neðst), Uggeðla (uppi til vinstri), Mosi (uppi
  til hægri). Leikurinn gengur réttsælis: barnið, Uggeðla, Mosi. Barnið byrjar.
- **Gjöfin:** stokkað, hver fær 5 spil, afgangurinn (37) er tjörnin. Tvö eins
  spil á hendi eru par og fara strax í afla leikmannsins, líka eftir gjöfina. Á
  hendi er því aldrei nema eitt af hverju dýri.
- **Að gera:** leikmaður velur dýr sem hann á og spyr annan leikmann: „Áttu
  skjaldböku?“
  - Eigi hinn það gefur hann spilið, parið fer í afla þess sem spurði, og hann á
    aftur leik.
  - Annars: „Nei! Farðu að veiða!“ Sá sem spurði dregur efsta spilið úr
    tjörninni. Sé það dýrið sem hann bað um („Ég veiddi það!“) fer parið niður
    og hann á aftur leik. Myndi það par við annað spil á hendi fer parið niður
    en leikurinn gengur áfram. Annars gengur leikurinn bara áfram.
- **Tóm hönd:** leikmaður sem á ekkert spil þegar hann á leik dregur eitt spil úr
  tjörninni og heldur áfram. Sé tjörnin líka tóm er hann búinn og leikurinn fer
  framhjá honum.
- **Tóm tjörn:** Uggeðla segir „Tjörnin er tóm!“. Eftir það færir „Nei“
  leikinn bara áfram.
- **Lokin:** þegar öll 26 pörin eru komin niður. Flest pör vinnur. Sé jafnt
  vinna allir efstu. Barnið fær límmiða ef það er eitt þeirra.
- Reglurnar eru hrein eining (`rules.js`): engin DOM, ekkert hljóð, slembitala
  gefin inn svo hver gjöf sé endurtakanleg í prófum.

## 3. Tölvuleikmennirnir

- **Sanngjarnir:** Mosi og Uggeðla vita bara það sem allir heyra og sjá:
  - hver bað um hvað: sá sem spyr á það dýr;
  - hver sagði nei: hann átti það ekki þá;
  - hvaða spil var gefið;
  - hvaða pör fóru niður;
  - eigin hönd.
  
  Hvorugt sér hendur annarra, tjörnina eða spil sem annar dró. Hvort hefur sitt
  eigið minni (`minds.js`), og minnið er byggt eingöngu úr opinberum atburðum
  reglnanna.
- **Val:** eigi tölvuleikmaður dýr sem hann man að annar á, spyr hann þann. Annars
  velur hann af handahófi dýr af hendinni og spyr þann sem hefur ekki sagt nei
  við því síðan. Hann spyr aldrei um dýr sem hann veit að enginn annar á.
- **Minni og færni:** hver staðreynd er munuð með líkum sem fara eftir færni, og
  eldri staðreyndir gleymast frekar. Færnin lagar sig að barninu milli umferða
  með `engine/eitt/skill.js` (`afterRound`): barn sem vinnur skerpir þau, barn
  sem tapar gerir þau mildari og meira því fleiri töp í röð. Innan umferðar
  slaka þau á meðan barnið er langt á eftir í pörum. Færnin byrjar mild. Hermun
  (52 spil, minni 0,7 á móti barni 0,5) gaf barninu aðeins 26% sigra, svo
  byrjunargildin eru stillt þannig að barnið vinni um helming. Nákvæm gildi
  ákveður áætlunin með hermun.
- **Hraði:** tölvuleikmaður hugsar um 1,2 s áður en hann spyr. Höfuð Uggeðlu
  hallar á meðan, og mynd Mosa vaggar.

## 4. Skjárinn

Eitt!-útlitið (`eitt.css`: pappírinn, blekið, Nunito, hnappar minnst 88 px,
hreyfing aðeins með transform og opacity, ekkert iðjulaust líf undir
prefers-reduced-motion). Ný síða: `veiddu.css`. Mið: spjaldtölva á hlið
1280×800. Upprétt 820×1180 og sími á hlið verða líka að ganga upp.

- **Uppi til vinstri: Uggeðla** lifandi í þrívídd í glugga sínum, eins og
  Kambeðla í Eitt! (`kambedla-view.js` er fyrirmyndin; nýtt `uggedla-view.js`
  með líkani hennar, `spinosaurus.glb`):
  - hún andar (idle), blikkar og talar með munninum eftir munnhreyfingu
    línunnar;
  - hún gleðst (happy), hugsar (höfuðið hallar) og beygir sig að vatninu þegar
    einhver veiðir (kink eða wade).
  
  Mynd hennar sést þar til glugginn er tilbúinn.
- **Uppi til hægri: Mosi** á mynd (`assets/eitt/mosi.webp` eða myndin úr bókinni)
  sem hoppar og vaggar, eins og hann sprettur upp í Eitt!.
- Undir hvoru þeirra: **höndin** á hvolfi með fjölda spila, og **aflinn**:
  pörin í bunka með tölu.
- **Miðjan: tjörnin.** Spilin fljóta á hvolfi og vagga hægt (CSS-vatn, eins og
  borð Eitt! er teiknað með CSS). Þegar barnið á að veiða kallar tjörnin: gárur
  og ljómi. Barnið pikkar og spilið flýgur á höndina. Þá skvettist vatn:
  dropar fljúga upp (áhrif eins og konfettíið í Eitt!) og skvetthljóðið heyrist.
- **Neðst: hönd barnsins** í boga, raðað eins og spilin eru í stokknum. Hvert
  spil minnst 88 px á breidd, og of stór hönd fer í raðir, eins og í Eitt!.
  - **Afli Egils** er neðst til vinstri, með merki Egils (myndin úr Fjölspili,
    `avatarOf`).
  - **Hjálparhnappur Mosa** er neðst til hægri.
- **Talblöðrur:** allt sem er sagt birtist í stórri blöðru við þann sem talar
  („Áttu skjaldböku?“), og ör eða augnaráð sýnir hvern hann spyr.
- **Hreyfingar:** spil fljúga milli handa, tjarnar og afla eins og í Eitt!
  (sama flug, sama tímasetning). Par sem fer niður skellur saman, glitrar
  (`fx.js` sparkle) og flýgur í aflann.
- **Lokin:** orð sigurvegarans, konfettí, Uggeðlu-límmiðinn fyrir barn sem vann,
  „Spilum aftur?“ og X. Uggeðla gleðst yfir sigurvegaranum.
- **Lokahnappur** (X) efst til hægri meðan umferð er í gangi, og
  **Kennsluhnappur** efst til vinstri, eins og í Eitt!.

## 5. Flæðið

- **Umferð barnsins:**
  1. Það pikkar á spil á hendi: spilið lyftist og Egill les nafnið
     („Skjaldbaka“). Annað spil skiptir um val.
  2. Gluggar Uggeðlu og Mosa ljóma: hvern á að spyrja?
  3. Barnið pikkar á annað þeirra. Egill segir „Áttu skjaldböku?“ og svarið
     kemur, með spilinu sem flýgur eða „Farðu að veiða!“.
  4. Þá kallar tjörnin og barnið pikkar á hana til að draga.
- **Þegar barnið er spurt** („Áttu frosk?“): barnið svarar sjálft.
  - Eigi það dýrið pikkar það á spilið til að gefa það (Egill: „Gjörðu svo
    vel!“). Pikk á rangt spil vaggar mjúklega. Eftir 4 s lýsir rétta spilið og
    eftir 8 s segir Mosi „Þú átt þetta dýr! Pikkaðu á það.“
  - Eigi það ekki dýrið birtist stór hnappur, „Farðu að veiða!“ (Egill segir
    það).
  
  Bara rétta svarið er í boði. Ekkert gerist sjálfkrafa.
- **Ef ekkert er gert:** eftir 6 s í umferð barnsins lyftist spilið sem best er
  að spyrja um og sá sem best er að spyrja ljómar. Eftir 7 s getur Uggeðla sagt
  „Þú átt leik!“, mest einu sinni á 20 s.
- **Hjálp Mosa** (hnappurinn): Mosi sprettur upp með ráð og ástæðu í blöðru og
  rödd, og spilið sem hann meinar lyftist og ljómar:
  - „Uggeðla bað um þetta dýr. Spurðu hana!“
  - „Ég bað um þetta dýr. Spurðu mig!“
  - „Enginn hefur beðið um neitt sem þú átt. Prófaðu eitthvað!“
  - „Tjörnin kallar! Veiddu spil.“
  
  Ráð Mosa byggja á sama opinbera minni og barnið gæti haft, með fullu minni.
  Að spyrja kostar ekkert.
- **Inntak bíður** meðan spil flýgur eða tölvuleikmaður gerir. Ein rödd í einu.

## 6. Raddir og hljóð

- **Raddsettið `veiddu`** (`remake/assets/audio/veiddu/lines-source.json`),
  tekið upp með `remake/tools/voice-lines.mjs`: ElevenLabs v4 með orðalistanum
  `pronunciation.json`. Claude tekur upp, staðfestir og vistar sjálfur. Um 80
  línur:
  - **Egill:** nöfnin 13, „Áttu …?“ × 13, „Gjörðu svo vel!“, „Farðu að veiða!“,
    „Ég veiddi það!“.
  - **Uggeðla:** „Áttu …?“ × 13, „Já, gjörðu svo vel!“, „Nei! Farðu að veiða!“,
    „Ég veiddi það!“, „Tjörnin er tóm!“, „Þú átt leik!“, lokaorð (hún vann, barnið
    vann, jafnt).
  - **Mosi:** „Áttu …?“ × 13, sömu svör, ráðin, kennslan, lokaorð.
- **Rödd Uggeðlu:** ný rödd hönnuð með ElevenLabs Voice Design (íslensk
  móðurmálsrödd, eins og plötusnúður Slóeðlu fékk). Eigandinn velur eftir eyra úr
  nokkrum tillögum, og röddin fer í `voices.json` sem `uggedla`. Hún er samræmd
  við kaflasetuna, svo Uggeðla hafi eina rödd í kafla 2 og í Veiddu.
- **Eigandinn hlustar** á allar línurnar á já/nei-síðu. Orð sem fara úrskeiðis
  fá reglu í orðalistanum eða eigið samhengi.
- **Hljóðin í tóntegund leiksins** (`createGameSfx`, `engine/audio/game-music.js`;
  `veiddu-sounds.js` eins og `eitt-sounds.js`): smellur spils, dráttur,
  parahljómur, vagg, kall tjarnarinnar, sigurlúður.
- **Skvettan:** alvöru upptaka af Freesound (CC0 eða CC BY), mögulega tvær
  lagðar saman. Spurt er áður en nokkru er hlaðið niður (nafn, uppruni, stærð,
  leyfi). Heimildir og leyfi í skrá við hljóðið, KREDIT fyrir CC BY.
- **Tónlist:** tónlist Eitt! til að byrja með.

## 7. Bókin og vistin

- **Leikir-síðan** (`engine/book/book.js`, `book.css`): Veiddu-reitur með mynd
  Uggeðlu (`uggedla-render.webp`), litur hennar á reitnum. Reiturinn birtist
  þegar `k2_uggedla` er í `save.get().stars` (stjarnan frá kaflasetunni) og er
  „Nýtt!“ þar til leikurinn er opnaður fyrst. Pikk kallar `onPlay('veiddu')`.
  Veiddu-setan sér um reitinn. Kaflasetan bætir aðeins við stjörnunni.
- **Límmiðar:** hver sigur barnsins er Uggeðlu-límmiði, sami die-cut-stíll og
  límmiðar Kambeðlu, á límmiðasíðunni við hlið þeirra.
- **`main.js`:** `createVeidduGame(document, { save, fjolspil, audio, onPause,
  onClose })` úr `engine/veiddu/table.js`, sem skilar `{ open(options) }`, eins
  og `createEittGame`. Leikurinn heldur kaflanum (eigið `hold('veiddu')`) og
  `onClose` endurnýjar bókina.
- **Vistin** (`engine/save.js`): lykillinn `veiddu`, `getVeiddu()` og
  `setVeiddu(changes)` með `{ skill, losses, wins, tutorialDone }` (og í búti 4
  `game` og `seats` fyrir umferð Fjölspils), eins og `eitt`.

## 8. Kennslan

Í fyrsta sinn sem leikurinn opnast (og þegar barnið pikkar á Kennslu) kennir
Mosi stutta umferð með röðuðum spilum, eitt skref í einu, sýnt og sagt.
Aðeins það sem hann á við er lifandi og annað dimmt, eins og í Eitt!. Skrefin:

1. Tvö eins spil eru par. Safnaðu flestum pörum!
2. Pikkaðu á spil og veldu hvern þú spyrð (spurningin heppnast).
3. Spil sem barnið fær verður par og fer í aflann.
4. „Farðu að veiða!“: barnið veiðir í tjörninni.
5. Barnið er spurt og gefur spilið.
6. Mundu hvað hinir báðu um (Uggeðla bað um frosk, barnið veiðir frosk og
   spyr hana).

„Sleppa“ endar kennsluna hvenær sem er. Kennsla er engin umferð: enginn límmiði
og engin breyting á færni. Svo gefur Mosi fyrstu alvöruumferðina.

## 9. Tilraunasíðan og skrárnar

- **`remake/veiddu-lab.html`:** raunveruleg umferð á eigin vistun
  (`mosi-veiddu-lab`), `&skill=0..1`, `&tutorial=1|0`, `&seed=` fyrir
  endurtakanlega gjöf. `?state=` gefur fastar myndir fyrir myndatökur:
  `table`, `ask` (spil valið, gluggar ljóma), `asked` (Mosi spyr barnið),
  `fish` (tjörnin kallar), `win`, `cards` (öll spilin stór). `__demoReady` eins
  og í Eitt! fyrir `capture.mjs`.
- **Skrár:**
  - `remake/engine/veiddu/cards.js`: tegundirnar 13 (id, nafn, þolfall, mynd,
    litur).
  - `remake/engine/veiddu/rules.js`: reglurnar, hreinar.
  - `remake/engine/veiddu/minds.js`: minni og val tölvuleikmannanna, hreint.
  - `remake/engine/veiddu/table.js`: borðið, DOM, hreyfing, hljóð, hraði.
  - `remake/engine/veiddu/uggedla-view.js`: lifandi gluggi Uggeðlu.
  - `remake/engine/veiddu/veiddu-sounds.js`: hljóðin.
  - `remake/veiddu.css`, `remake/veiddu-lab.html`.
  - `remake/assets/veiddu/`: spilamyndir, skvettan, heimildir.
  - `remake/assets/audio/veiddu/`: raddirnar; `voices.json` fær `uggedla`.
  - Breytt: `engine/save.js`, `engine/book/book.js`, `book.css`, `main.js`.
  - Í búti 4: `engine/fjolspil/guest-veiddu.js` og Veiddu-hluti `spil.css`.
- Sameiginlegt sem er fengið, ekki afritað: `book/fx.js`,
  `audio/game-music.js`, `scene/voice.js`, `eitt/skill.js`, `actor.js`,
  `fjolspil/seats.js` (`avatarOf`).
- Línuendingar hverrar skrár haldast; nýjar skrár í `remake/` fylgja
  nágrönnum sínum.

## 10. Próf og bútar

- **Eitt lítið próf** (`remake/tests/veiddu.test.mjs`):
  - gjöfin skiptir öllum 52 spilunum;
  - pör fara rétt niður;
  - „Ég veiddi það!“ gefur annan leik;
  - umferð endar alltaf með 26 pörum;
  - minni tölvuleikmanns breytist aldrei við atburði sem hann gat ekki séð.
  
  Í lokin keyrir allt prófasafn endurgerðarinnar einu sinni.
- **Bútar.** Eftir hvern sér eigandinn myndband og myndir og segir til:
  1. Reglur, tölvuleikmenn og borðið spilast heilt á tilraunasíðunni (fiskarnir
     látlausir þar til myndir eigandans koma, Uggeðla á mynd, engar raddir enn).
  2. Lifandi gluggi Uggeðlu, skvettan, hljóðin og raddirnar. Eigandinn velur
     rödd Uggeðlu og samþykkir niðurhal skvettunnar.
  3. Kennslan, reiturinn og límmiðarnir í bókinni, og leikurinn úr bókinni.
  4. Fjölspil, sjá kafla 11.

## 11. Fjölspil (bútur 4)

- Eins og `guest-eitt.js` og herbergi Fjölspils (`engine/fjolspil/`):
  - hver sími heldur sína hönd, velur spil og hvern hann spyr, svarar þegar hann
    er spurður og veiðir með pikki á tjörnina;
  - stóri skjárinn er tjörnin, með sæti allra (mynd, nafn, fjöldi spila,
    afli), talblöðrurnar og Uggeðlu ef hún spilar;
  - stóri skjárinn ræður öllu (reglurnar, slembitalan), og hver athöfn bíður
    næstu sýnar.
- Merkin um hvers leikur er, eins og Eitt! fékk (`engine/eitt/way.js`, ramminn
  og spjaldið á símanum): ramminn í lit leikmannsins, „Þú átt leik!“-spjald,
  hljómur og titringur.
- Tveir til fjórir leikmenn, ein tölva í mesta lagi (reglur Fjölspils).
- **Hönd Egils er á hans eigin tæki** (eigandinn ákvað 2026-11-01), því í Go
  Fish verða hendur að vera faldar. Í Fjölspili er engin hönd á stóra
  skjánum: hver mennskur leikmaður, Egill líka, á sæti með síma eða spjaldtölvu
  og stóri skjárinn er aðeins tjörnin.

## Lokið þegar

- Leikurinn spilast heill á tilraunasíðunni og úr bókinni á greininni `veiddu`,
  einn, og í Fjölspili ef það næst.
- Prófin eru græn.
- Eigandinn hefur prófað og samþykkt.

Ekkert er sameinað eða ýtt nema eigandinn biðji um það.
