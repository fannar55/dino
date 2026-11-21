# Kafli 6: Boð til Grameðlu

Sjötti og síðasti vinurinn í röð kortsins (handritið, `2026-10-28-handrit-leiksins.md`). Kaflinn byrjar þar sem kafli 5 endar, við
fjarlægu tjörnina, þar sem Grameðla svaraði laginu með öskri úr vestri. Mosi og Egill fara einir í lengstu ferðina: yfir ána ofan
við fossinn, upp fjallshlíðina og inn í skýin sem liggja utan í fjallinu. Grameðla á heima uppi á fjallinu, og þar er
Stjörnuhátíðin haldin. Hún er stór og glöð. Vandinn er ekki í henni heldur í leiðinni. Þegar þau finna hana þiggur hún boðið,
sjötta stjarnan kviknar og hún ber Egil á hausnum síðasta spölinn, upp úr skýjunum og á sléttan fjallstoppinn í sólarlaginu.

Stjörnuhátíðin sjálf er annað skjal: `2026-11-21-stjornuhatidin-design.md`.

Ákvarðanir eigandans í hugarfluginu 21. nóvember 2026:

- **Grameðla er stór og glöð.** Hún er hvorki feimin né einmana, og enginn er hræddur við hana.
- **Verkefnið er blanda af þrennu:** að komast yfir ána, að fylgja risasporunum og að kalla og hlusta í þokunni.
- **Bara Mosi og Egill fara.** Vinirnir kveðja við tjörnina og koma á eftir.
- **Hátíðin er uppi á fjallinu þar sem Grameðla á heima:** sléttur fjallstoppur með smá gróðri og nógu plássi. Hún er alltaf
  haldin þar og allir vita það. Þetta kemur í stað rjóðursins í handritinu.
- **Grameðla ber Egil upp á toppinn,** uppi á hausnum á sér, eins og Þórseðla bar hann.
- **Grameðla talar ekki.** Hún öskrar, fnæsir og kinkar kolli, og Mosi túlkar.
- **Smáleikurinn hennar bíður** og fær sitt eigið skjal.

## 1. Sagan

Sólin er farin að lækka. Við tjörnina kveðja Slóeðla og Flugeðla: þær koma á eftir með allan skóginn. Egill sest í hnakkinn á Mosa
og þeir leggja af stað í vestur, að fjallinu.

Ofan við fossinn er áin breið og grunn, og flatir steinar liggja yfir hana. Egill velur steinana og Mosi stiklar yfir. Hinum megin
liggur stígur upp fjallshlíðina. Þar líta þeir til baka yfir allan skóginn sem þeir hafa farið um í dag. Fyrir ofan þá hverfur
fjallið inn í ský.

Við skýjabrúnina finna þeir spor sem er svo stórt að Mosi kemst ofan í það. Þeir fylgja sex sporum inn í þokuna, þar til sporin
enda og allt er hvítt. Þá kallar Mosi með litla öskrinu sínu, og risaöskur svarar. Þrisvar kalla þeir og þrisvar svarar hún, nær í
hvert sinn. Svo stígur hún út úr þokunni, risastór og himinlifandi að fá gesti. Hún öskrar „já“ svo skýin feykjast frá, og sjötta
stjarnan kviknar.

Hún leggur hausinn niður, Egill klifrar upp, og hún þrammar upp síðustu brekkuna með Mosa hlaupandi við hliðina. Þau koma upp úr
skýjunum á sléttan fjallstoppinn. Þar er nóg pláss fyrir alla, og þaðan er styst í stjörnurnar.

## 2. Staður, tími og birta

- **Tími:** síðdegi að sólsetri. Kaflinn byrjar í gullnu birtu kafla 5 og endar þegar sólin er alveg við sjóndeildarhringinn.
  Sólin sest ekki í þessum kafla; það á hátíðin.
- **Fimm staðir:**
  1. **Tjörnin** úr kafla 5 (`FAR_POOL`), óbreytt, aðeins í kveðjunni.
  2. **Vaðið ofan við fossinn:** áin úr kafla 4 (`RIVER`, `FALLS` í `kafli4-route.js`) rétt ofan við fossbrúnina. Fossinn sést til
     hliðar með úða og regnboga. Steinarnir eru nýir.
  3. **Fjallshlíðin:** nýr staður. Stígur upp hlíðina, með útsýni til austurs yfir skóginn. Fyrir ofan liggja skýin.
  4. **Skýin utan í fjallinu:** nýr staður. Þokan er ský. Fyrst sést aðeins jörðin næst okkur, sporin og stakir steinar og runnar
     sem hverfa í hvítt.
  5. **Fjallstoppurinn:** nýr staður, og svið hátíðarinnar. Sléttur og víður, með grasi, lágum gróðri og stökum steinum, og nógu
     stór fyrir alla vinina. Skýin liggja eins og haf fyrir neðan og himinninn er stór yfir.
- **Birtan:** stillingar sem blandast milli staða (`blendLooks` í `engine/looks.js`): gullin við tjörnina og vaðið, lægri og
  rauðgullin í hlíðinni, hvít og mjúk inni í skýjunum, og sólarlag yfir skýjahafinu á toppnum.
- **Engin ógn.** Vaðið er grunnt og langt frá fossbrúninni. Stígurinn er breiður og engin hengiflug sjást. Þokan er hljóðlát og
  björt, ekki dimm. Dynkirnir eru spennandi, ekki hræðilegir, og Mosi er forvitinn en aldrei hræddur.

## 3. Persónur

| Hver | Stærð | Hvað gerir hún eða hann | Rödd |
|---|---|---|---|
| Mosi | eins og áður | Ber Egil upp að skýjunum. Stiklar, telur spor, öskrar litla öskrinu sínu. | `mosi` (Ný 3) |
| Egill | eins og áður | Í hnakknum á Mosa, í lokin uppi á hausnum á Grameðlu. | `egill` |
| Grameðla | 12 m löng, 5,2 m há (`trex.glb`) | Svarar úr þokunni, stígur fram, þefar, öskrar „já“, ber Egil upp á toppinn. | Engin: öskur, fnæs og andardráttur |
| Slóeðla, Flugeðla | eins og í kafla 5 | Kveðja við tjörnina. | `sloedla`, `flugedla` |
| Froskar | litlir | Sitja á völtu steinunum í vaðinu og stökkva út í. | Kvak |

## 4. Senurnar

Tímarnir eru markmið. Setningarnar eru tillögur; eigandinn heyrir þær allar og hefur síðasta orðið.

### 1. Kveðjan við tjörnina (um 40 s)
- Byrjar þar sem kafli 5 endar: allir horfa í vestur eftir öskrið.
- Slóeðla: „Við komum á eftir ykkur. Sjáumst uppi á fjalli!“
- Flugeðla: „Ég kalla á allan skóginn. Flýtið ykkur, sólin er að lækka!“ Hún lyftir sér og flýgur austur.
- Egill sest í hnakkinn á Mosa. Mosi: „Komdu, Egill. Lengsta ferðin bíður.“
- **Kortastundin:** bútur f teiknast upp á fjallið á kortinu. Mosi: „Þarna uppi á fjallinu, í skýjunum, býr Grameðla. Og þar er
  Stjörnuhátíðin haldin, næst stjörnunum.“ Egill: „Á fjallinu hennar?“ Mosi: „Já. Þess vegna verðum við að bjóða henni!“

### 2. Áin við fossinn (um 90 s). Verkefni 1
- Mosi kemur að vaðinu. Fossinn dynur til hliðar og regnbogi stendur í úðanum.
- Mosi: „Áin er breið hérna. En sjáðu steinana! Hvaða steinn er næstur, Egill?“
- Egill velur næsta stein, fimm sinnum (5. kafli). Mosi stiklar á hvern stein og Egill hossast í hnakknum.
- Á miðri leið nema þeir staðar og horfa niður fossinn: „Þarna flugum við upp með Flugeðlu!“
- Hinum megin: „Við komumst yfir! Vel valið, Egill.“

### 3. Fjallshlíðin (um 40 s)
- Reiðtúr upp stíginn. Ekkert verkefni.
- Á hjalla í hlíðinni snýr Mosi sér við. Skotið sýnir allan skóginn í lágri sól: tjörnina, ána, fenið, hausinn á Þórseðlu yfir
  trjánum og rjóðrið langt í burtu.
- Egill: „Sjáðu, Mosi! Þarna er rjóðrið þar sem við hittumst!“ Mosi: „Og þarna er Þórseðla. Hún er lögð af stað.“
- Mosi snýr sér að fjallinu. Fyrir ofan þá hverfur stígurinn inn í hvít ský. Mosi: „Og þarna uppi… eru skýin.“

### 4. Risasporin (um 80 s). Verkefni 2
- Við skýjabrúnina stígur Mosi ofan í dæld. Hann lítur niður: þetta er spor. Mosi: „Egill… þetta er spor. Ég kemst ofan í það!“
  Egill: „Hún er RISASTÓR!“
- Egill finnur næsta spor og þeir telja upp í sex (5. kafli). Þokan þéttist með hverju spori.
- Sporin verða nýrri: í fjórða sporinu er pollur, í því fimmta gárar vatnið enn, og við sjötta sporið dynur jörðin svo steinvölur
  hoppa.
- Mosi: „Sex spor. Og hún er sjötti vinurinn!“

### 5. Kallið í þokunni (um 100 s). Verkefni 3
- Sporin enda á klöpp. Allt er hvítt. Mosi: „Sporin enda hér. Ég sé ekkert. Ég kalla á hana. Hjálpaðu mér, Egill!“
- Egill pikkar á Mosa. Mosi teygir sig upp og öskrar lítið, mjótt öskur. Þögn.
- Risaöskur svarar úr þokunni og þokan lýsist gullin þeim megin. Egill pikkar í áttina og Mosi gengur þangað (5. kafli).
- Þetta gerist þrisvar, og hún er nær í hvert sinn:
  1. Fjarlægt öskur, mjúkur bjarmi.
  2. Nær. Dynkir heyrast og dökk skuggamynd sést í bjarmanum.
  3. Alveg hjá þeim. Skuggamyndin fyllir þokuna, steinvölur skoppa og Egill kallar með: „Grameðla!“

### 6. Hún kemur (um 60 s)
- Hún stígur út úr þokunni, tvö þung skref, og nemur staðar yfir þeim. Hún hallar undir flatt og deplar augunum.
- Hún lýtur hægt niður og þefar af Agli. Andardrátturinn feykir hárinu á honum. Egill hlær: „Hæ, Grameðla!“
- Mosi: „Halló, Grameðla! Stjörnuhátíðin er í kvöld, hér á fjallinu þínu. Viltu halda hana með okkur?“
- Hún dregur andann og öskrar af gleði. Öskrið feykir skýjunum frá í hring út frá henni. Fyrir ofan þau birtist fjallstoppurinn,
  gullinn í sólarlaginu.
- Mosi: „Hún segir já!“
- **Gjöfin:** Mosi: „Öskrið þitt verður merkið, Grameðla. Þegar þú öskrar kvikna stjörnurnar!“ Hún kinkar kolli og fnæsir.
- **Stjarnan** rís og bíður pikks barnsins, eins og í fyrri köflum (`s.star('k6_gramedla', …)`). Mosi: „Sjötta stjarnan! Nú eru
  allir komnir!“

### 7. Upp á toppinn (um 40 s)
- Hún leggur hausinn alveg niður á jörð. Egill svífur upp á hausinn á henni þegar barnið pikkar, eða eftir 6 sekúndur.
- Hún reisir sig. Skot ofan af hausnum: Egill sér yfir allt.
- Þrjú stutt skot, engin verkefni:
  1. Hún þrammar upp síðustu brekkuna og Mosi hleypur við hliðina. Mosi: „Bíddu… eftir… mér!“
  2. Þau koma upp úr síðustu skýjaslæðunni og út í sólina. Skýin liggja eins og gullið haf fyrir neðan. Egill: „Við erum ofan
     við skýin!“
  3. Fjallstoppurinn: sléttur, víður og grænn, með stóran himin yfir. Mosi, móður: „Hér… er nóg pláss… fyrir alla!“ Langt fyrir
     neðan kemur lítill depill fljúgandi upp úr skýjunum: Flugeðla.
- Kaflinn endar eins og hinir: bókin og vistunin. „Áfram“ leiðir í Stjörnuhátíðina þegar hún er til.

## 5. Verkefnin þrjú

Sameiginlegt: ekkert getur mistekist, ekkert segir „nei“, og barn sem snertir ekkert kemst alla leið á hjálpinni. Hjálpin kemur í
þremur þrepum eins og í sporum Þórseðlu í kafla 2 (`kafli2-trail.js`): vísbending, Mosi nefnir það, og loks gerist það af sjálfu sér.
Eftir að hjálpin hefur einu sinni gert það sjálf styttast biðtímarnir um helming.

### Verkefni 1: steinarnir (fimm skref)
- Við hvert skref eru tveir eða þrír steinar innan seilingar. **Rétti steinninn er stór, flatur og þurr.** Hinir eru litlir og
  valtir, og á þeim situr froskur.
- **Rétt pikk:** Mosi stiklar á steininn. Vatnið gárar og Egill hossast.
- **Rangt pikk:** steinninn vaggar, froskurinn stekkur út í með skvettu, og Mosi hlær: „Úps, sá vaggar!“ Rétti steinninn glitrar.
- **Hjálp:** eftir 6 s glitrar rétti steinninn, eftir 12 s segir Mosi „Þessi stóri, flati!“, eftir 18 s stiklar hann sjálfur.

### Verkefni 2: sporin (sex spor)
- Eins og sporin tíu í kafla 2, nema sporin eru risastór og þokan felur þau sem eru lengra burtu. Næsta spor sést dauft í þokunni.
- **Rétt pikk:** þokan lyftist af sporinu, talan rís upp úr því og Mosi telur: „Einn!“ … „Sex!“
- **Rangt pikk** (á þokuna eða stein): þokan þyrlast þar og ekkert annað gerist. Næsta spor glitrar.
- **Hjálp:** eftir 8 s glitrar sporið, eftir 16 s finnur Egill það sjálfur.

### Verkefni 3: kallið (þrjár umferðir)
- **Kallið:** Egill pikkar á Mosa og Mosi öskrar. Ef barnið pikkar ekki innan 6 s öskrar Mosi sjálfur.
- **Svarið:** öskur Grameðlu kemur úr einni af þremur áttum: vinstri, beint fram eða hægri. Það heyrist þeim megin í hátölurunum
  og þokan lýsist gullin þar. Áttin er aldrei sú sama tvisvar í röð.
- **Pikkmarkið** er stórt: þriðjungur skjásins hver átt.
- **Rétt pikk:** Mosi gengur nokkur skref í áttina.
- **Rangt pikk:** þokan þyrlast þar. Mosi: „Hlustum aftur!“ og hún öskrar aftur úr sömu átt.
- **Hjálp:** eftir 6 s öskrar hún aftur og bjarminn styrkist, eftir 12 s bendir Mosi með hausnum, eftir 18 s gengur hann sjálfur.

## 6. Hljóð og raddir

- **Til nú þegar:** öskrið og fnæsið hennar (`gramedlaRoar`, `gramedlaExhale`), þung skref, dynkir og andardráttur úr „Grameðla
  kemur!“ (`chapters/gramedla3d/sounds.js`), fossinn og áin úr kafla 4, og froskarnir úr kafla 5.
- **Fjarlægð öskursins:** sama upptakan, deyfð og með lengri óm þegar hún er langt í burtu, skýr og þung þegar hún er nálægt.
- **Litla öskrið hans Mosa:** nýtt hljóð, mjótt og fyndið. Tillögur á hlustunarsíðu og eigandinn velur.
- **Ný áþreifanleg hljóð** (klaufir á steini, steinn sem vaggar, skvetta frosksins, skref í blautri mold, fjallavindur) eru alvöru
  upptökur af Freesound (CC0 eða CC BY, höfundar skráðir), lagðar saman. Engu er hlaðið niður fyrr en eigandinn hefur leyft það
  með nafni, uppruna og stærð.
- **Tónlist:** ferðastef Mosa við vaðið og í hlíðinni. Inni í þokunni er engin tónlist, aðeins þögnin, skrefin og öskrin. Þegar
  skýin feykjast frá kemur stefið aftur, stærra. Hvort nýtt stef þarf er ákveðið í búti 4.
- **Línur:** teknar upp með `remake/tools/voice-lines.mjs` í nýju línusafni, `kafli6`, með auðkenni sem byrja á `k6_`, eftir
  reglunum í `CLAUDE.md`: `--dry` fyrst, Ný 3 fyrir allar nýjar línur Mosa, `fixes` á hverri línu með eigin lausn, og já/nei-síða
  eigandans flutt inn með `remake/tools/heard.mjs`.

## 7. Vistun, röð kaflanna og bókin

- **Stjarnan:** `k6_gramedla`. Hún fer í sjötta sætið í bókinni (`engine/scene/journal.js` á það þegar).
- **Hvaða kafli opnast** (`engine/save.js` `defaultChapter`): kafli 6 þegar `k5_sloedla` er komin og þar til `k6_gramedla` er
  komin. Síðan áfram kafli 6 þar til hátíðin er til.
- **Áfram:** `kafli5.next` verður `kafli6`. `kafli6.next` er `null` þar til hátíðin er til.
- **Kortið:** bútur f (`by: 'star'`, inn í þokuna) teiknast í kortastundinni í 1. senu og fær stjörnuna með `k6_gramedla`. Þokan
  á kortinu opnast þá af sjálfu sér, eins og kortið gerir nú þegar.
- **Bókin:** síða Grameðlu opnast eins og síður hinna vinanna. Fræðslumyndbandið um hana opnast líka með `k6_gramedla`
  (`engine/book/videos.js` `altUnlock`, til nú þegar).
- **Smáleikur:** enginn í þessu skjali.
- **Gömul vistun** týnir engu. Vistun sem endaði í kafla 5 opnar kafla 6.

## 8. Tækni

- **Kaflinn** (`remake/chapters/kafli6.js`): senurnar sjö.
- **Nýjar skrár:**
  - `kafli6-route.js`: staðirnir sem gögn, þ.e. vaðið, hlíðin, skýin, sporin og skotin.
  - `kafli6-stones.js`: verkefni 1.
  - `kafli6-prints.js`: verkefni 2, byggt á `world/props/mud-prints.js` og biðinni úr `kafli2-trail.js`.
  - `kafli6-call.js`: verkefni 3, þ.e. áttirnar, bjarminn, pikkmörkin og hjálpin.
  - `kafli6-gramedla.js`: líf Grameðlu, þ.e. skuggamyndin í þokunni, að stíga fram, lúta og þefa, öskrið, hausreiðin og ferðin upp.
  - `world/props/stepping-stones.js`: steinarnir í vaðinu.
  - `world/fjall/`: fjallið, þ.e. hlíðin, skýjabeltið og toppurinn. Það er sér, því hátíðin notar toppinn líka.
- **Vaðið:** `createArdalur` með bútunum kringum fossbrúnina (`FALLS`), og `createWaterfall` til hliðar.
- **Fjallið er nýtt land.** Fjöllin eru núna aðeins fjarlæg mynd (`world/ardalur/far-land.js`). Hlíðin og toppurinn eru smíðuð sem
  lítil svið með útsýnið í fjarska, ekki sem heilt fjall sem gengið er upp. Toppurinn er opinn og með litlum gróðri, svo hann er
  léttur í keyrslu.
- **Skýjahafið** fyrir neðan toppinn er flatt lag af skýjaspjöldum, ekki þoka sem fyllir heiminn.
- **Þokan:** þoka vélarinnar er ein og stillt einu sinni áður en efnin eru þýdd (`engine/fog.js`). Skýin þurfa þoku sem þéttist
  með sporunum og feykist frá í miðri senu. **Bútur 1 sannar leiðina,** með þokuspjöldum (`world/props/mist.js`,
  `gramedla3d/haze.js`) og þéttleika sem má breyta í keyrslu.
- **Grameðla:** `trex.glb`, 39,8 þúsund þríhyrningar. Hún á þrjár hreyfingar: að standa, ganga (1,1 m/s) og öskra.
  - Að lúta, halla undir flatt og þefa: beygjutólið úr „Grameðla kemur!“ (`chapters/gramedla3d/pose.js`) flyst í sameiginlega skrá.
  - Að þramma hratt upp brekkuna: ný hreyfing bökuð með bökunartólinu sem til er (`tools/bake/bake-tailed-biped.js`).
  - Hausreiðin: `createSeat(trex, { bone: 'Head', … })` eins og sæti Þórseðlu (`kafli3-thorsedla.js`), með `floatTo` og `ride`.
    Skoðunarsíða eins og `thorsedla-haus.js` til að mæla sætið.
- **Litla öskrið hans Mosa:** hann kann aðeins að standa og ganga, svo öskurstellingin er gerð í kóða, eins og dansinn hans í
  kafla 5.
- **Skotin:** reglur myndavélastjórans gilda (`engine/camera/director.js`). Í verkefni 3 er myndavélin kyrr fyrir aftan Mosa, svo
  vinstri, miðja og hægri séu alltaf sömu áttir á skjánum, á breiðum skjá og uppréttri spjaldtölvu.
- **Prófin sanna:** að barn sem snertir ekkert klári kaflann innan 10 mínútna; að rangt pikk stöðvi ekkert verkefnanna; að sporin
  séu sex og kallið þrjár umferðir með nýrri átt í hvert sinn; að stjarnan sé `k6_gramedla`; og að vistun með `k5_sloedla` opni
  kafla 6.
- **Afköst:** hvert lykilskot innan 6 ms á skjákorti, 100 teiknikalla og 250 þúsund þríhyrninga á spjaldtölvustillingu (STYLE.md
  11), mælt á Iris Xe í báðum skjástærðum. Aldrei eru fleiri en þrjár stórar persónur í mynd nema í kveðjunni, sem er sama svið
  og kafli 5.
- **Línuendingar:** hver skrá heldur sínum (`.gitattributes * -text`). `main.js` og `engine/book/book.js` eru CRLF.
- **Grein:** `kafli6-gramedla` frá main, vinnutréð `C:/Risaeðla/dino-kafli6-gramedla`, þjónn á port 4340. Ekkert er sameinað í
  main eða ýtt nema eigandinn biðji um það.

## 9. Bútar og ferli

Smiðsagentar smíða í bútum og vista oft. Eigandinn sér myndir eða myndband eftir hvern bút og hefur síðasta orðið.

1. **Grá útgáfa af öllum kaflanum:** allar senurnar, skotin og tímasetningin; verkefnin þrjú virka með hjálpinni; þokan þéttist og
   feykist frá. Tvö myndbönd: annað þar sem ekkert er snert, hitt þar sem barnið pikkar (líka rangt). Eigandinn samþykkir taktinn
   og tilfinninguna áður en vinna fer í útlitið.
2. **Staðirnir:** vaðið með steinunum, hlíðin með útsýninu, skýin, og fjallstoppurinn yfir skýjahafinu. Myndir af stærð sporsins
   við hlið Mosa og af toppnum með alla vinina setta inn til að sýna plássið. Myndir og myndband.
3. **Grameðla:** skuggamyndin, að stíga fram, lúta og þefa, öskrið sem feykir skýjunum, sætið á hausnum og ferðin upp. Myndband og
   myndir af Agli á hausnum.
4. **Hljóð og línur:** tillögur á hlustunarsíðu, niðurhal aðeins eftir leyfi, allar línur teknar upp og já/nei-síðan hlustuð.
5. **Upphaf og endir:** kveðjan, kortastundin, stjarnan, bókin, vistunin og röð kaflanna. Heil spilun frá byrjun til enda,
   mælingar og öll prófin græn.

**Lokið** er þegar kaflinn spilast frá byrjun til enda á greininni, prófin eru græn og eigandinn hefur séð og samþykkt.

## 10. Opið

- **Stærð sporsins:** hve ýkt það má vera miðað við fætur hennar, ákveðið eftir myndum í búti 2.
- **Fjallstoppurinn:** hve stór hann er, hvaða gróður vex þar og hvernig skýjahafið lítur út, ákveðið eftir myndum í búti 2.
- **Litla öskrið hans Mosa og ný hljóð:** valin eftir eyranu í búti 4.
- **Smáleikur Grameðlu:** eigið skjal seinna.
