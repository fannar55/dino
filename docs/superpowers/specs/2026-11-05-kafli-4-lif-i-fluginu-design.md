# Kafli 4: Líf í fluginu

Viðbót við forskrift kaflans (`2026-11-01-kafli-4-bod-til-flugedlu-design.md`, 5. og 6. kafli). Eigandinn horfði á allt flugið með
nýja laginu 5. nóvember 2026: „er að verða flott, en það vantar meira líf í flugferðina, það er varla nein dýr að sjá, mesta sem maður
tekur eftir er drekaflugur [...] hvar eru allar smáeðlur og fleira“. Hann vill líka meiri skóg og landslag, „án þess að vera of mikið
fyrir android spjaldvél“.

Ákvarðanir eigandans 5. nóvember 2026:

- **Dýrin koma með.** Dýrin svara kallinu og leggja af stað á hátíðina. Hópurinn stækkar eftir því sem líður á flugið, og í lokin sjást
  dýr streyma að fjarlægu tjörninni.
- **Þrjú ný módel úr Tripo3D, sem eigandinn gerir sjálfur:** smáeðla, lítill grasbítur og lítið flugdýr. Gömlu smádýrin (froskur,
  skjaldbaka, drekafluga, fugl, árfugl, fiskur) eru notuð áfram, í miklu meira magni. „Ef þarf, kallaðu eftir að ég geri módel.“
- **Skógur og landslag:** þéttari skógur í lundum, gróður meðfram bökkunum og meira landslag uppi á landinu ofan við fossinn. Skógur
  alla leið að sjóndeildarhring var ekki valinn.
- **Leið A:** dýrin eru teiknuð í hópum, ein tegund í einu kalli, svo tugir dýra kosta lítið (8. kafli).

## 1. Hvað vantar núna

Skoðað í upptöku af fluginu með nýja laginu (`qa/remake/kafli4/lag/leikur`):

- **16 dýr alls,** í 5 hópum (froskar, sniglar, drekaflugur, skjaldbaka, fjórar salamöndrur í stað smáeðla), og öll á 45 s kafla
  árinnar (C). Í eltiskotunum sést ekkert þeirra. Flugeðla kallar „Hátíð í kvöld! Komið öll!“ án þess að nokkuð sjáist svara.
- **Stóra kallið í F** svarar aðeins með hljóðum (froskar, eðlur, fuglar) og plötum Kambeðlu í fjarska.
- **Fenið, gljúfrið, fossinn, landið ofan við og svifið niður** eru dýralaus.
- **Skógurinn er gisinn:** eitt stórt tré á hverja um 450 m² (`world/ardalur/banks.js`, ZONES), jafndreift á sléttu grasi. Bakkarnir
  eru berir.
- **Plöntur hylja kyrru skotin:**
  - Í skoti Mosa á bakkanum („Bíðið eftir mér!“) rennur stór runni inn fyrir hann.
  - Í skugga-skotinu yfir skjaldbökunni fylla burknablöð myndina og skjaldbakan er agnarsmá.

Svigrúmið á spjaldtölvustillingu (bekkur bútar 8, 1280×800). Hámarkið er 6 ms á skjákorti, 100 teikniköll og 250 þúsund þríhyrningar
í hverju skoti (STYLE.md 11):

| Hluti flugsins (tími flugsins) | Skjákort | Teikniköll | Þríhyrningar |
|---|---|---|---|
| A, yfir Fenið að ánni (14 s) | 3,8 ms | 26 | 228 þús. |
| C, áin og kallið (44 og 69 s) | 3,0–3,8 ms | 25–29 | 153–158 þús. |
| D, gljúfrið (97 og 104 s) | 1,7–2,9 ms | 19–24 | 83–160 þús. |
| E, fossinn (119 s) | 2,4 ms | 34 | 211 þús. |
| F, uppi á landinu (139 og 149 s) | 2,3–3,3 ms | 25–36 | 154–235 þús. |
| G, svifið niður (159 og 165 s) | 2,0–3,1 ms | 30–33 | 204–234 þús. |

Teikniköll og skjákort eiga nóg eftir alls staðar. Þríhyrningar eru þröngir yfir Feninu, við fossinn, uppi á landinu og í svifinu niður:
þar þarf að losa um áður en meira bætist við (5. kafli: spjöld fyrir fjarlæg tré).

## 2. Sagan: dýrin koma með

Flugeðla kallar á allan skóginn á hátíðina. Barnið á að sjá að kallið virkar: dýrin svara og leggja af stað, fyrst fá, svo fleiri,
og í lokin stefnir allur skógurinn að fjarlægu tjörninni. Fjarlæga tjörnin er þar sem hátíðarförin byrjar. Hún liggur norðan árinnar
neðan við gljúfrið, svo dýr sem stefna upp með ánni og inn í landið stefna rétta leið.

- **A. Flugtakið (0:00–0:15):** Árfuglar fljúga upp úr sefinu þegar skuggi hennar fer yfir, og drekaflugur sveima í sefinu.
- **B. Niður að ánni (0:15–0:35):** Fiskar stökkva upp úr ánni rétt framan við hana. Þegar hún strýkst við vatnið flýja vatnaskeiðarar
  í hring.
- **C. Upp með ánni og kallið (0:35–1:20):**
  - 9 hópar í stað 5, um 5 s á milli, og stærri hópar (3. kafli).
  - Hópur sem svarar leggur af stað:
    - smáeðlur hlaupa með henni eftir bakkanum og beygja svo inn í skóginn upp með ánni;
    - froskar stökkva út í og synda upp með bakkanum;
    - fuglar fljúga upp úr trénu og fylgja henni í nokkrar sekúndur;
    - skjaldbökur renna af steininum út í ána;
    - drekaflugurnar elta í sveim, eins og núna.
  - Á milli hópanna flögra fuglar upp úr trjánum þegar hún fer hjá, og fiskar stökkva.
  - Skugga-skotið (63–68 s) sýnir smáeðluhóp líta upp þegar skuggi hennar fer yfir, stóran í mynd.
- **D. Gljúfrið (1:20–1:45):** Lítil flugdýr eiga hreiður á syllum í klettaveggjunum. Þegar hún þýtur hjá fljúga þau út og fylgja
  henni, 6–10 saman.
- **E. Fossinn (1:45–2:05):** Flugdýrin fljúga með henni upp fossinn, í úðanum, og springa út úr honum með henni.
- **F. Upp í gullið ljós (2:05–2:30):**
  - Í víða skotinu er hjörð af grasbítum á beit uppi á landinu, 10–14 saman.
  - Við stóra kallið lyfta þeir höfðinu og leggja af stað í átt að tjörninni.
  - Fuglaflokkar fljúga upp úr skóginum á 3–4 stöðum og smáeðlur streyma út úr skóginum í 2–3 röðum.
  - Svörin sjást nú, ekki bara heyrast. Hljóðin eru áfram þau sömu, og plötur Kambeðlu blikka í fjarska eins og áður.
  - Flugdýrin hringsóla með henni í hringskotinu.
- **G. Svifið niður (2:30–2:50):**
  - Á leiðinni niður sjást dýrastraumar á leið að tjörninni: smáeðluraðir, hjörðin og fuglarnir.
  - Flugdýrin svífa með henni niður.
- **Sena 7 (lendingin):** Þau dýr sem komin eru standa við tjörnina, á bakkanum handan við Mosa, og sjást í víðu skotunum.
  - Ekkert þeirra fer fyrir Mosa, lúðurtóninn eða sefið sem hann kemur úr.

## 3. Dýrin

| Dýr | Hvar | Fjöldi | Hvað það gerir |
|---|---|---|---|
| Smáeðla (nýtt módel) | bakkar C, landið F, straumar G | 3 hópar í C, 8–12 í hverjum; 2–3 raðir í F og G | drekkur og lítur upp; hleypur með og beygir inn í skóginn |
| Grasbítur (nýtt módel) | landið ofan við fossinn | ein hjörð, 10–14 | er á beit; lyftir höfði við kallið; gengur og brokkar að tjörninni |
| Flugdýr (nýtt módel) | hreiður í gljúfrinu | 6–10 | situr á syllu; flýgur út og fylgir henni D–G; hringsólar; svífur niður |
| Froskur | liljur í C | 2 hópar, 5–8 í hverjum | stekkur út í og syndir upp með bakkanum |
| Skjaldbaka | steinar og trjábolir í C | 1 hópur, 2–3 | teygir hálsinn; rennur út í ána |
| Fugl | tré við ána, skógurinn í F | 2 hópar í C (8–12 í hverjum); flögrandi milli hópa; 3–4 flokkar í F (15–20) | flýgur upp og fylgir eða hverfur |
| Drekafluga | yfir ánni í C, sefið í A | 1 hópur, 5–8 | eltir í sveim (eins og núna) |
| Árfugl | sef Fensins í A | 4–6 | flýgur upp undan skugganum |
| Fiskur, vatnaskeiðari | áin í B og C | stök | stökkva og flýja |

Hóparnir 9 í C eru: froskar, smáeðlur, fuglar í tré, skjaldbökur, smáeðlur, drekaflugur, froskar, smáeðlur og fuglar í tré.
- Sniglarnir detta út: úr lofti sést ekki að þeir lyfti augunum.
- Smáeðlurnar eru salamöndrur þar til módel eigandans kemur (11. kafli, bútur 1).

**Sýnileiki:**
- Dýrin eru teiknuð stærri en í raun, eins og núna, svo þau sjáist úr lofti (`SCALE` í `world/ardalur/animals.js`).
- Litir þeirra skera sig úr grasinu.
- Krafan er mæld: í hverju eltiskoti í C sést minnst einn hópur meirihluta skotsins, og hvert dýr í honum er minnst 16 px hátt á
  1280×800.

**Allt fylgir klukku leiksins,** eins og dýrin núna: hlé stöðvar þau, og myndataka eða stökk í tíma finnur þau þar sem spilun hefði
fundið þau. Dýr sem leggur af stað reiknar staðinn sinn út frá tímanum frá svarinu, ekki frá síðasta ramma.

## 4. Köllin

Reglurnar í 6. kafla forskriftar kaflans halda sér. Það sem breytist:

- **Hóparnir í C eru 9.** Hver er pikkmark frá 120 m og hún kallar sjálf á hóp sem ekki er pikkað á við 25 m.
- **Hver hópur svarar einu sinni** og svarið er nú að leggja af stað (2. kafli).
- **Stóra kallið í F** kemur á sama tíma og áður (135 s, eða fyrr við pikk á landið). Nú fylgja því hreyfingar: hjörðin, fuglaflokkarnir
  og smáeðluraðirnar leggja af stað, hvert á sínum tíma innan þeirra 3–5 s sem hljóðsvörin taka núna (`PLAY.bigAnswers`).
- **Flugdýrin** í gljúfrinu eru ekki pikkmark. Þau koma sjálf þegar hún fer hjá. Ekkert í gljúfrinu má trufla klifrið eða skotin.

## 5. Skógurinn og landslagið

- **Lundir:** í stað jafndreifðra trjáa vaxa trén í lundum.
  - Lundirnir eru þéttir, 3–4 sinnum þéttari en skógurinn núna, og á milli þeirra eru opin rjóður þar sem dýrin sjást.
  - Það gildir á hlíðum dalsins og uppi á landinu ofan við fossinn.
  - Lundirnir eru úr sömu tegundum og nú (laufkróna, araucaria, trjáburkni, köngulpálmi, runni).
- **Spjöld fyrir fjarlæg tré:** tré lengra en um 150 m frá myndavélinni teiknast sem spjöld sem snúa að henni.
  - Spjöldin eru teiknuð af módelum trjánna sjálfra þegar staðurinn er byggður, ekki teiknuð í höndunum.
  - Þau hverfa í þokuna eins og trén.
  - Þannig losna þríhyrningar í B, F og G (1. kafli) fyrir lundina og dýrin.
- **Gróður við bakkana:** burknar, sef, runnar, blóm, smásteinar og mosaþúfur meðfram ánni í A–C, svo bakkarnir verði ekki berir.
  - Ekkert af því hærra en svo að dýrin á bakkanum sjáist yfir það úr eltiskotunum.
- **Landið ofan við fossinn:** í stað slétts grasflatar koma
  - mjúkar hæðir, 3–8 m á hæð;
  - klettar og stórir steinar sem standa upp úr;
  - einn eða tveir lækir sem renna út í efri ána;
  - tvær til þrjár smátjarnir með liljum og sefi.

  Hjörðin er á beit á opnu svæði milli lunda og hæða, þar sem víða skotið sér hana.
- **Mörkin halda sér:**
  - ekkert vex nær leið hennar en 3 m;
  - ekkert stendur í vegi Mosa á bakkanum eða brúninni;
  - fjarlæga landið, fjöllin og skuggi Grameðlu eru óbreytt.

## 6. Kyrru skotin

- Í kyrru skotunum (frá vatnsborðinu, frá bakkanum, skuggaskotið, skot Mosa á bakkanum og brúninni, fossskotin) vex ekkert hærra en
  0,5 m nær myndavélinni en 6 m. Ekkert stendur heldur á línunni frá myndavélinni að því sem skotið sýnir.
- Þetta er sama aðferð og dýrin nota núna til að halda plöntum frá sér (`clear` í `world/ardalur/animals.js` og `banks.js`).
- Skugga-skotið rammar inn smáeðluhópinn sem það sýnir, svo hópurinn sé minnst 8% af hæð myndarinnar.

## 7. Módelin frá eigandanum

Eigandinn gerir þrjú módel í Tripo3D. Ég bið um hvert þegar bútur þess nálgast (11. kafli), með þessum lýsingum:

| Módel | Stærð í raun | Hreyfingar úr Tripo | Athugið |
|---|---|---|---|
| Smáeðla | 0,6–1 m löng, á stærð við hænu eða kalkún | hlaup, kyrrstaða (drekkur, lítur upp) | sést best í lit sem sker sig úr grasinu |
| Grasbítur | 2–3 m langur | ganga, brokk, beit (höfuð niðri) | lítil andanefja eða horneðla; öðruvísi en Mosi og Þórseðla |
| Flugdýr | 1–1,5 m milli vængbrodda | vængjaslag, svif, sitja | minna en Flugeðla og í öðrum lit, svo þau ruglist ekki |

- Ef Tripo gefur ekki hreyfingu fyrir dýr er hún gerð í skyggingu, eins og vængjaslag fuglanna (`aWing`). Þá spyr ég fyrst.
- Litirnir eru valdir með eigandanum og skráðir í STYLE.md, eins og litir persónanna.
- Hljóð nýju dýranna: smáeðlurnar nota tíst eðlanna sem nú eru til (`lizards`). Grasbítarnir og flugdýrin fá nýjar tökur úr
  ElevenLabs sem eigandinn velur eftir eyranu, eins og hljóð flugsins.

## 8. Tækni

- **Hópateikning** (`world/critters/crowd.js`, nýtt):
  - Hver dýrategund er eitt `InstancedMesh` fyrir nálæg dýr og eitt fyrir fjarlæg, með einfaldari útgáfu. Það gerir tvö teikniköll á
    tegund, sama hvað dýrin eru mörg.
  - Hreyfingarnar úr Tripo (beinagrind og klipp) eru frystar í 6–12 stellingar á hverja hreyfingu, sem morph-markmið.
  - Hvert dýr fær sitt eigið vægi á stellingunum (`InstancedMesh.setMorphAt`, three.js r180) eftir tíma og fasa sínum, svo hlaupið
    flettir mjúklega á milli stellinga.
  - Staður og stefna hvers dýrs eru hrein föll af klukku leiksins (3. kafli).
  - Gömlu smádýrin (froskur, skjaldbaka, drekafluga, fugl) fara líka í hópateikninguna. Þau hafa morph-markmið nú þegar.
- **Undirbúningur módelanna** (`tools/prep-crowd.mjs`, nýtt, sem keyrir Blender í bakgrunni, `blender.exe -b`, eins og
  `tools/blender-decimate.py` er keyrt):
  - les GLB frá Tripo og fækkar þríhyrningum;
  - frystir stellingarnar;
  - minnkar mynd áferðarinnar í 256–512 px;
  - þjappar með `tools/quantize-glb.mjs`;
  - skrifar `assets/critters/<dýr>.glb`.
  Þríhyrningar eftir fækkun:
  - smáeðla mest 800 nálægt og 250 fjarri;
  - grasbítur mest 1500 og 400;
  - flugdýr mest 600 og 200.
- **Hegðunin:**
  - `world/ardalur/animals.js` heldur köllunum og pikkmörkunum í C og fær nýju hópana og „að leggja af stað“.
  - Nýtt `world/ardalur/life.js` sér um lífið sem er ekki pikkmark: fuglar sem flögra upp, fiskar, hreiðrin í gljúfrinu, hjörðin og
    straumarnir að tjörninni.
  - Hvert dýr er byggt með bútum landsins (`sections.js`) og teiknast aðeins þegar bútur þess er nálægt, eins og plönturnar.
- **Skógurinn:** lundirnir eru þéttleikasvið í `banks.js` (í stað jafnra líkinda á hverja 10 m reiti).
  - Spjöld fjarlægra trjáa eru nýr hluti við hlið sameinuðu plöntunetanna (`world/forest/batch.js`), byggð í sneiðum eins og þau.
- **Landið:** hæðirnar, lækirnir og tjarnirnar fara í `world/ardalur/terrain.js` (`heightAt`) og `river.js`, innan 160 m gangsins um
  leiðina.
- **Byggingartíminn:** fleiri plöntur og dýr mega ekki valda hiki á fluginu. Allt er byggt í sneiðum fyrir fram, eins og núna.
  Upptaka af fluginu sýnir engan ramma lengri en í dag.

## 9. Afköst

- Hvert lykilskot er innan marka STYLE.md 11 á spjaldtölvustillingu, í báðum skjástærðum:
  - 6 ms á skjákorti, en stefnt er á 5,3 ms eins og núna;
  - 100 teikniköll og 250 þúsund þríhyrningar.
- Dýrin sjálf fá mest 40 þúsund þríhyrninga og 12 teikniköll í hverju skoti.
- Mælt eftir hvern bút með bekknum (`tools/capture.mjs --bench 120`) á sömu 25 römmum kaflans og bútur 8 notaði, auk ramma á
  stóru dýrastundunum.
- Allt flugið er líka tekið upp með `--stats`: miðgildi og versti rammi.
- Eigandinn getur prófað á Android-spjaldtölvunni sinni þegar bútur 2 er kominn. Markið þar er 30 rammar á sekúndu.

## 10. Próf

Prófin snúa að því sem barnið sér og gerir:

- **Sýnileiki:** í hverju eltiskoti í C sést hópur dýra og dýrin eru nógu stór (3. kafli). Prófið telur dýrin í sjónsviðinu og hæð
  þeirra á skjánum.
- **Dýrin koma með:**
  - hópur sem svarar færist í átt að tjörninni;
  - stökk í tíma gefur sama stað og spilun;
  - hver hópur svarar einu sinni og hún kallar sjálf á þá sem ekki er pikkað á.
- **Stóra kallið:** hjörðin, flokkarnir og raðirnar leggja af stað eftir kallið, hvort sem það kom af sjálfu sér eða við pikk.
- **Kyrru skotin:** engin planta stendur milli myndavélarinnar og þess sem skotið sýnir (6. kafli).
- **Leiðin:** ekkert vex eða stendur nær leið hennar en 3 m, eins og núna, og ekkert í lundunum eða landinu fer í gegnum leiðina.
- **Byggingin:** allir bútar landsins byggjast í sneiðum innan tímamarkanna sem nú gilda.

## 11. Bútar

Eins og áður: ég smíða í bútum, vista oft og sýni eigandanum myndband eftir hvern bút. Hann hefur síðasta orðið.

1. **Hópateikningin og gömlu dýrin:**
   - hópateikningin;
   - 9 hópar í C (salamöndrur standa fyrir smáeðlurnar);
   - lífið á milli hópanna (fuglar og fiskar);
   - árfuglarnir og drekaflugurnar í A;
   - „að leggja af stað“;
   - gróðurinn við bakkana;
   - kyrru skotin hreinsuð.

   Myndband af A–C og mælingar. Í lok bútsins bið ég um smáeðluna.
2. **Skógurinn og landslagið:** lundirnir, spjöld fjarlægra trjáa og landið ofan við fossinn. Myndband af D–G og mælingar.
3. **Smáeðlan:** undirbúningstólið, módel eigandans í hópana í C og raðirnar í F og G. Myndband. Í lok bútsins bið ég um grasbítinn og
   flugdýrið, eða fyrr ef eigandinn vill.
4. **Grasbítarnir og flugdýrin:**
   - hjörðin í F;
   - flugdýrin frá gljúfrinu til lendingar;
   - straumarnir í G og dýrin við tjörnina í senu 7;
   - hljóðtökur til að velja.

   Myndband af öllu fluginu og öllum kaflanum, mælingar í báðum stærðum og öll prófin græn.

Bútur 1 þarf engin ný módel og getur byrjað strax. Ekkert er sameinað í main eða ýtt nema eigandinn biðji um það.

## 12. Opið

- **Litir nýju dýranna:** valdir með eigandanum þegar módelin koma.
- **Smáeðlan á tveimur eða fjórum fótum:** eigandinn ræður, því hann gerir módelið.
- **Hreyfingar úr Tripo:** ef Tripo gefur ekki hreyfingu fyrir eitthvert dýrið er spurt fyrst (7. kafli).
