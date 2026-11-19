# Kafli 5: Boð til Slóeðlu

Fimmti kaflinn í röð kortsins (handritið, `2026-10-28-handrit-leiksins.md`). Hann byrjar þar sem kafli 4 endar, við fjarlægu
tjörnina, þar sem falskur lúðurtónn heyrðist úr sefinu. Slóeðla hefur gleymt laginu sínu og þorir ekki að syngja. Dýrin sem komu
með í fluginu muna hvert sinn tón, og Egill stjórnar þeim svo lagið hennar kemur aftur, bútur fyrir bút. Í lokin er hún orðin nógu
hugrökk til að leiða sönginn á hátíðinni.

Ákvarðanir eigandans í hugarfluginu 7. nóvember 2026:

- **Verkefnið nýtir dýrin sem komu með.** Hver dýrahópur við tjörnina syngur einn tón. Egill pikkar á þau í réttri röð og
  Slóeðla svarar á lúðurinn sinn, og nú er tónninn réttur. Eins og vatnaliljur, nema dýrin gefa tónana.
- **Fyrst að fylgja, svo að muna.** Í fyrstu tveimur bútunum lýsist rétta dýrið upp. Í seinni tveimur spilar Slóeðla bútinn fyrst
  og Egill endurtekur hann eftir minni.
- **Lagið er nýtt og hennar eigið,** búið til úr tónum dýranna. Það bætist svo við Söng Slóeðlu sem „Lag Slóeðlu“.
- **Slóeðla er feimin og ljúf.** Hún skammast sín fyrir falska tóninn, felur sig í sefinu og kemur smám saman fram.
- **Senurnar sjö** í 4. kafla voru samþykktar eins og þær standa, um 6 mínútur.
- **Tónn hvers dýrs:** hljóð dýrsins sjálfs með mjúkum hljóðfæratóni undir, svo það heyrist bæði dýrið og skýr nóta.

## 1. Sagan

Flugeðla stendur enn í tjörninni og dýrin sem komu með standa á bökkunum. Úr þykka sefinu handan tjarnarinnar heyrist aftur falskur
tónn. Egill og Mosi ganga að sefinu og þar sést aðeins kamburinn hennar. Þegar Egill pikkar á sefið gægist hún út. Hún man ekki
lagið sitt og þorir ekki að syngja, og án lagsins kemst hún ekki á hátíðina. Mosi man að dýrin sungu alltaf með henni: hvert þeirra
man sinn tón.

Fimm dýrahópar taka sér stöðu kringum tjörnina. Egill stjórnar þeim. Fyrst lýsist rétta dýrið upp, svo man hann röðina sjálfur.
Fyrir hvern bút sem kemur aftur svarar Slóeðla á lúðurinn, og við hvern bút kemur hún lengra út úr sefinu. Í lokin gengur hún út í
tjörnina og spilar allt lagið, dýrin syngja með og Flugeðla slær taktinn með vængjunum. Hún þiggur boðið og fimmta stjarnan kviknar.
Þegar lagið þagnar svarar djúpt öskur langt í vestri, handan fossins: Grameðla heyrði lagið. Þannig byrjar kafli 6.

- **Tíminn:** gullið síðdegi. Ný birta, `goldenAfternoon` í `engine/looks.js`: sólin lægri og hlýrri en `earlyAfternoon` kafla 4,
  en ekki sólsetur (það á kafli 6 og hátíðin).
- **Það sem barnið gerir:** pikkar á sefið, pikkar á dýrin í réttri röð og pikkar að vild þegar allt lagið hljómar.
- **Engin ógn:** barnið getur aldrei mistekist. Rangt dýr syngur bara glaðlega, og hjálpin kemur í þrepum uns næsti tónn kemur af
  sjálfu sér (5. kafli). Grameðla er aðeins fjarlægt öskur.
- **Lengd:** um 6 mínútur fyrir barn sem snertir ekkert. Aldrei yfir 10.

## 2. Persónur

| Persóna | Stærð | Í kafla 5 | Rödd |
| --- | --- | --- | --- |
| Mosi | 8,5 m | Leiðsögumaður. Býður henni á hátíðina, man að dýrin kunna lagið og bendir á rétta dýrið ef Egill bíður. | Mosi (Ný 3) |
| Egill | 1,1 m | Pikkar á sefið, stjórnar dýrunum og hvetur hana. | Egill (v4) |
| Slóeðla | 7,5 m | Parasaurolophus. Feimin og ljúf (eigandinn, 7. nóv. 2026). Kamburinn er lúður. | Ný rödd (8. kafli) |
| Flugeðla | 7,5 m milli vængbrodda | Stendur í tjörninni frá lendingunni, hvetur hana og slær taktinn með vængjunum í lokin. | Flugeðla (rödd plötusnúðsins) |
| Dýrin | eins og í kafla 4 | Fimm hópar, hver með sinn tón (4. kafli). | Hljóð, engin orð |
| Grameðla | 12 m | Heyrist aðeins: djúpt, fjarlægt öskur í lokin. | Engin (`gramedlaRoar`) |

Slóeðla er alvöru líkanið (`remake/assets/characters/parasaurolophus.glb`), með klippurnar idle, walk, kink, happy, eat og call.
Hún er þegar 7,5 m í `chapters/lineup.js`. Smiðurinn sýnir myndir af henni við hlið Egils og Mosa í búti 2. Vanti hreyfingu sem
klippurnar eiga ekki, til dæmis að gægjast eða lyfta kambinum til að blása, er hún gerð í kóða (bein höfuðsins og hálsins), eins
og útlit Flugeðlu var gert í kafla 4.

## 3. Staðurinn: fjarlæga tjörnin

Tjörnin úr kafla 4 (`FAR_POOL` í `chapters/kafli4-route.js`), sama land og sama fræ, svo kafli 5 byrji nákvæmlega þar sem kafli 4
endaði. Aðeins bútar Árdalsins kringum tjörnina eru byggðir, auk fjarlandsins í vestri, svo öskrið eigi sér stefnu.

- **Sefið handan tjarnarinnar** (`POOL_SPOTS.farReed`, þykkt og hátt) er felustaður hennar. Þar sést kamburinn upp úr sefinu. Hún
  kemur út á fjórum stöðum, einum fyrir hvern bút: kamburinn, höfuðið, hálsinn og loks allur líkaminn úti í tjörninni.
- **Staðir dýranna:** fimm staðir í boga kringum tjörnina, allir sýnilegir í aðalskoti verkefnisins á breiðum skjá og uppréttri
  spjaldtölvu. Hver staður er stórt pikkmark með rúmum radíus og glóandi hring í vatninu eða á bakkanum, sem lýsist upp þegar hópurinn
  á að syngja.
- **Dýrin:** grasbítarnir, smáeðlurnar og litlu flugdýrin eru þegar komin þangað í lok kafla 4 (`life.arrive()`). Froskarnir og
  skjaldbökurnar bætast við, froskarnir á vatnaliljum og skjaldbökurnar á steini.

## 4. Senurnar

### 1. Kortið og tjörnin (um 40 s)
- **Kortið** rennur upp og teiknar bút e, frá hring Flugeðlu að tjörn Slóeðlu (`mapMoment`, eins og í köflum 3 og 4).
- Tjörnin eins og kafli 4 skildi við hana: Flugeðla í tjörninni og dýrin á bökkunum. Aftur heyrist falskur tónn úr sefinu.
- **Línur:** Mosi: „Þarna aftur!“ Flugeðla: „Hún er í sefinu.“

### 2. Feimin í sefinu (um 60 s)
- Egill og Mosi ganga að bakkanum gegnt sefinu. Upp úr sefinu sést aðeins kamburinn hennar.
- **Pikk á sefið:** það bærist og hún gægist út, aðeins augun og kamburinn. Pikki barnið ekki gægist hún út eftir 8 s.
- **Línur:**
  - Mosi: „Halló, Slóeðla! Viltu koma á Stjörnuhátíðina í kvöld?“
  - Slóeðla: „Ég… ég man ekki lagið mitt. Og ég þori ekki að syngja.“
  - Mosi: „Dýrin sungu alltaf með þér. Þau muna það!“

### 3. Dýrin taka sér stöðu (um 30 s)
- Hóparnir fimm koma hver á sinn stað og hver syngur sinn tón einu sinni, frá þeim dýpsta til þess hæsta: grasbítarnir,
  skjaldbökurnar, froskarnir, smáeðlurnar og litlu flugdýrin.
- Mosi: „Hjálpaðu þeim, Egill. Pikkaðu á dýrið sem lýsist upp.“

### 4. Bútar 1 og 2: Egill fylgir (um 60 s)
- **Bútur 1 hefur 2 tóna og bútur 2 hefur 3.** Rétta dýrið lýsist upp, eitt í einu.
- **Hvert rétt pikk:** dýrið syngur sinn tón, glóandi nóta flýgur frá því að Slóeðlu og hún blæs sama tóninn, nú réttan.
- **Þegar búturinn er búinn** spilar hún hann allan, sá hluti lagsins bætist við tónlistina og hún kemur lengra út úr sefinu.
- Slóeðla eftir bút 1: „Þetta… þetta var lagið mitt!“

### 5. Bútar 3 og 4: Egill man (um 75 s)
- **Bútur 3 hefur 4 tóna og bútur 4 hefur 5.** Slóeðla spilar bútinn fyrst og glóandi nótur fljúga úr lúðrinum að dýrunum, eitt
  af öðru. Svo endurtekur Egill röðina.
- Mosi: „Nú manst þú röðina, Egill!“
- Annað er eins og í 4. senu. Eftir bút 4 man hún allt lagið.

### 6. Allt lagið (um 60 s)
- Hún gengur alveg út í tjörnina, lyftir höfðinu og spilar allt lagið með allri tónlistinni.
- **Egill má pikka hvar sem hann vill:** hvert dýr syngur sinn tón í takt við lagið. Tónarnir eru allir úr sama fimmtóna skalanum,
  svo ekkert pikk hljómar illa.
- **Flugeðla slær taktinn** með vængjunum í tjörninni, svo vatnið skvettist í takt.
- **Gjöfin:** Slóeðla: „Takk, Egill. Ég skal leiða sönginn á hátíðinni!“
- **Stjarnan** rís og bíður pikks barnsins, eins og í fyrri köflum (`s.star('k5_sloedla', …)`). Mosi: „Fimmta stjarnan!“

### 7. Svar úr fjarska (um 40 s)
- Þegar síðasti tónninn deyr út heyrist djúpt öskur langt í vestri (`gramedlaRoar`, lágt). Allir þagna og snúa sér þangað.
- Mosi: „Grameðla… hún heyrði lagið.“ Egill: „Förum við þangað næst?“ Mosi: „Lengsta ferðin. Yfir ána við fossinn.“
- Kaflinn endar eins og kafli 4 endar: bókin og vistunin. „Áfram“ leiðir í kafla 6 þegar hann er til.

## 5. Verkefnið: dýrakórinn

- **Tónarnir:** fimm tónar úr fimmtóna skala (1, 2, 3, 5 og 6 í tóntegund lagsins), einn á hóp frá þeim dýpsta til þess hæsta.
  Tóntegundin ræðst af laginu (8. kafli) og fer vel við lúðurinn.
- **Laglínan:** 14 tónar í fjórum bútum, 2 + 3 + 4 + 5. Bútarnir í röð eru viðlag lagsins. Laglínan er skrifuð sem nótur í leiknum,
  svo tónarnir séu alltaf réttir og prófanlegir.
- **Rétt pikk:** dýrið syngur, nótan flýgur að Slóeðlu og hún svarar. Næsta dýr bíður.
- **Rangt pikk:** það dýr syngur sinn tón glaðlega og ekkert segir „nei“. Rétta dýrið hoppar aftur og glóir, og búturinn heldur áfram
  þaðan sem hann var.
- **Hjálp, ef barnið pikkar ekki:**
  - eftir 5 s glóir rétta dýrið sterkar og hoppar (í bútum 3 og 4 er þetta fyrsta vísbendingin);
  - eftir 10 s bendir Mosi og nefnir það: „Froskarnir!“;
  - eftir 18 s syngur rétta dýrið af sjálfu sér og það telst, svo verkefnið klárast alltaf.
- **Barn sem snertir ekkert** fer gegnum alla bútana á hjálpinni, svo lengd kaflans heldur.
- **Allt lagið** (6. sena) hefur engar réttar eða rangar nótur. Pikk lætur dýrið syngja á næsta slagi lagsins, svo það sé í takt.

## 6. Hljóð og raddir

- **Tónn hvers dýrs:** hljóð dýrsins (grasbíturinn baular, skjaldbakan hvæsir lágt, froskurinn kvakar, smáeðlurnar tísta og flugdýrin
  skrækja), fært nálægt tóninum, með mjúkum hljóðfæratóni undir, til dæmis marimbu, flautu eða plokkuðum streng, sem ber nótuna.
  Hljóðin úr kafla 4 (`assets/audio/kafli4/hljod`: grazer, turtle, smalldino, flyer) eru fyrstu tillögurnar. Ný hljóð koma úr
  ElevenLabs eða af Freesound (CC0 eða CC BY, höfundar skráðir). Eigandinn velur á hlustunarsíðu, og engu er hlaðið niður fyrr en
  hann hakar við það.
- **Lúðurinn:** hlýr, djúpur hornatónn, eins og ómur í kambi Parasaurolophus, einn fyrir hvern tónanna fimm, og falskur tónn sem
  vaggar og er út af laginu. Tillögur á hlustunarsíðu, eins og dýrahljóðin. Falski tónninn úr kafla 4 (`sloedlaHorn`) er sá sem
  heyrist í upphafi.
- **Lagið:** nýtt lag Slóeðlu, rólegt og hlýtt, á föstum hraða og í fastri tóntegund, svo tónar dýranna og lúðursins passi alltaf
  við það. Undirspilið er búið til eins og flugstefið: nokkrar tillögur úr ElevenLabs Music (með samsetningaráætlun), eigandinn velur
  með eyranu, og hraðinn og tóntegundin eru mæld. Undirspilið er í lögum (stems), svo bútarnir bætist við einn af öðrum í 4. og 5.
  senu og allt hljómi í 6. senu.
- **Rödd Slóeðlu:** ný rödd hönnuð með ElevenLabs Voice Design: innfædd íslensk kona, mjúk, feimin og ljúf, sem verður hlýrri og
  öruggari eftir því sem lagið kemur. Nokkrar raddir á hlustunarsíðu, eigandinn velur, og valin rödd fer í
  `remake/assets/audio/voices.json` sem `sloedla`.
- **Línur:** teknar upp með `remake/tools/voice-lines.mjs` í nýju línusafni, `kafli5`, með auðkenni sem byrja á `k5_`, eftir
  reglunum í `CLAUDE.md`: `--dry` fyrst, Ný 3 fyrir allar nýjar línur Mosa, `fixes` á hverri línu með eigin lausn, og já/nei-síða
  eigandans flutt inn með `remake/tools/heard.mjs`.
- **Tónlist kaflans:** utan verkefnisins er lagið hennar eina tónlistin, lágt og strjált í byrjun, svo það vaxi með bútunum.

## 7. Vistun, röð kaflanna, bókin og smáleikurinn

- **Stjarnan:** `k5_sloedla`.
- **Hvaða kafli opnast** (`engine/save.js` `defaultChapter`): kafli 5 þegar stjarna Flugeðlu (`k4_flugedla`) er komin og þar til
  `k5_sloedla` er komin. Síðan áfram kafli 5 þar til kafli 6 er til.
- **Áfram:** `kafli4.next` verður `kafli5`, og `kafli5.next` er `null` þar til kafli 6 er til.
- **Kortið:** bútur e (`by: 'star'`, að tjörn Slóeðlu) teiknast í kortastundinni í 1. senu og fær stjörnuna með `k5_sloedla`.
  Staður Slóeðlu (`sloedla`) er þegar merktur úr útsýni kafla 3.
- **Bókin:** síða Slóeðlu (`book_sloedla_*`) opnast eins og síður hinna vinanna.
- **Smáleikurinn:** „Lag Slóeðlu“ bætist við Söng Slóeðlu sem nýtt lag (`engine/sloedla/v2/songs`), með sömu lögum undirspilsins.
  Reitur Söngs Slóeðlu birtist á Leikir-síðunni með `k5_sloedla` og leikurinn opnast yfir bókinni, eins og Litla Yatzy.
- **Gömul vistun** týnir engu. Vistun sem endaði í kafla 4 opnar kafla 5.

## 8. Tækni

- **Kaflinn** (`remake/chapters/kafli5.js`): senurnar sjö.
- **Nýjar skrár:**
  - `kafli5-sloedla.js`: líf Slóeðlu, þ.e. að fela sig, gægjast, fjórir staðir út úr sefinu, lúðurinn (kamburinn lyftist) og að
    ganga út í tjörnina.
  - `kafli5-choir.js`: verkefnið, þ.e. staðir dýranna, pikkmörk, bútarnir, að fylgja og að muna, hjálpin og frjálsa spilið.
  - `kafli5-song.js`: laglínan sem nótur (bútarnir fjórir), tónarnir fimm, hraðinn og hvernig lög undirspilsins bætast við.
- **Staðurinn:** tjörnin í Árdalnum (`createArdalur` með aðeins bútunum kringum `FAR_POOL`) og fjarlandið í vestri. Leikarar eru
  Mosi, Egill, Slóeðla (`parasaurolophus.glb`), Flugeðla (`pteranodon.glb`) og dýrin (crowds úr kafla 4, froskar og skjaldbökur
  bætast við).
- **Birtan:** `LOOKS.goldenAfternoon` í `engine/looks.js`, blanda af `lateMorning` og `golden` nær `golden` en `earlyAfternoon`,
  sólin lægri.
- **Skotin:** aðalskot verkefnisins sýnir alla fimm hópana og sefið hennar í senn, á breiðum skjá og uppréttri spjaldtölvu.
  Myndavélin snýst mjúkt í átt að hópnum sem syngur, en allir hóparnir haldast í mynd. Reglur myndavélastjórans gilda
  (`engine/camera/director.js`).
- **Tónarnir eru prófaðir:** próf sanna að laglínan sé 2 + 3 + 4 + 5 tónar úr skalanum, að hvert pikk í frjálsa spilinu lendi á
  slagi lagsins, að barn sem snertir ekkert klári kaflann innan 10 mínútna, og að rangt pikk stöðvi aldrei búta.
- **Afköst:** hvert lykilskot innan 6 ms á skjákorti, 100 teikniköll og 250 þúsund þríhyrninga á spjaldtölvustillingu (STYLE.md 11),
  mælt á Iris Xe í báðum skjástærðum.
- **Línuendingar:** hver skrá heldur sínum (`.gitattributes * -text`). `main.js` og `engine/book/book.js` eru CRLF.
- **Grein:** `kafli5-sloedla` frá main, vinnutréð `C:/Risaeðla/dino-kafli5-sloedla`, þjónn á port 4280. Ekkert er sameinað í main
  eða ýtt nema eigandinn biðji um það.

## 9. Bútar og ferli

Smiðsagentar smíða í bútum og vista oft. Eigandinn sér myndir eða myndband eftir hvern bút og hefur síðasta orðið.

1. **Grá útgáfa af öllum kaflanum:** allar senurnar, skotin og tímasetningin; dýrin á stöðunum sínum; verkefnið virkar með einföldum
   tónum á réttum nótum og hjálpinni. Tvö myndbönd: annað þar sem ekkert er snert, hitt þar sem barnið pikkar (líka á rangt dýr).
   Eigandinn samþykkir taktinn og tilfinninguna áður en vinna fer í útlitið.
2. **Slóeðla:** að fela sig í sefinu, gægjast, koma út í fjórum skrefum og ganga út í tjörnina; myndir af stærðinni við hlið Egils og
   Mosa. Myndband og myndir.
3. **Hljóð dýranna og lúðurinn:** tillögur á hlustunarsíðu, niðurhal aðeins eftir leyfi, valin hljóð sett inn. Myndband af verkefninu
   með hljóðunum.
4. **Lagið:** laglínan föst, tillögur að undirspili á hlustunarsíðu, eigandinn velur, hraðinn og tóntegundin mæld og lögin sett inn
   svo bútarnir bætist við. Myndband af 4.–6. senu.
5. **Rödd og línur:** rödd Slóeðlu hönnuð og valin (getur byrjað samhliða búti 1), allar línur teknar upp og já/nei-síðan hlustuð.
6. **Upphaf og endir:** kortastundin, stjarnan, öskrið, bókin, vistunin og röð kaflanna. Heil spilun frá byrjun til enda, mælingar og
   öll prófin græn.
7. **Lag Slóeðlu í Söng Slóeðlu:** lagið sem nýtt lag í smáleiknum og reitur leiksins á Leikir-síðunni. Myndband.

**Lokið** er þegar kaflinn spilast frá byrjun til enda á greininni, prófin eru græn og eigandinn hefur séð og samþykkt.

## 10. Opið

- **Rödd Slóeðlu:** valin eftir eyranu í búti 5.
- **Hljóðin og lagið:** valin eftir eyranu í bútum 3 og 4.
- **Lag Slóeðlu í smáleiknum** getur orðið eigin forskrift ef það reynist stærra en einn bútur, til dæmis ef smáleikurinn þarf sjálfur
  að opnast úr bókinni í fyrsta sinn.
