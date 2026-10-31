# Kafli 2: Boð til Uggeðlu, og kafli 3: Boð til Þórseðlu

Eigandinn ákvað 31. október 2026 að kaflarnir fylgi röð kortsins (handritið, `2026-10-28-handrit-leiksins.md`): núverandi kafli 2
verður tveir kaflar. Nýr kafli 2 er boð til Uggeðlu, frá burknalautinni niður fenjaslóðina að síkinu, þar sem Egill hjálpar henni að
veiða og hún ferjar þá að þúfunum; kafli 3 er boð til Þórseðlu, Fen-hluti gamla kafla 2 frá þúfunum, óbreyttur að mestu. Engu sem
hefur verið gert er hent: senurnar halda sér og aðeins kaflaskilin færast. Forskrift gamla kaflans
(`2026-10-21-kafli-2-bod-til-thorsedlu-design.md`, með 11. kafla um breytingar í smíði) gildir áfram um allt sem hér er ekki breytt.

Ákvarðanir eigandans í hugarfluginu 31. október: veiðin æfir **stóra og litla** fiska (barnið pikkar á stóru, þeir litlu fá að
stækka); ferjan er **kvikmynd** þar sem Uggeðla, Mosi og Egill spjalla („allt í bland“: vatnshræðsla Mosa, bátsgrínið, seglið og
halinn); Uggeðla er **glaðleg og stríðin**; nýju senurnar gerast á **nýjum stað, Síkinu**, svo Fenjaslóðin og Fenið haldast eins og
samþykkt.

## 1. Sagan

Mosi og Egill halda af stað til Þórseðlu og telja sporin hennar niður fenjaslóðina, eins og áður. En sporin enda við vatn: síkið
hefur flætt yfir stíginn. Hinum megin rís stórt, litríkt segl upp úr sefinu, og Mosi heldur að það sé bátur, þar til haus kemur upp úr
vatninu með fisk í kjaftinum: það er Uggeðla að veiða. Fiskarnir eru snöggir, og Egill hjálpar henni: hann pikkar á stóru fiskana
þegar þeir stökkva og hún grípur þá í loftinu, en þeir litlu fá að synda burt og stækka. Hún þiggur boðið á Stjörnuhátíðina og segist
ætla að ferja alla gestina yfir ána; önnur stjarnan kviknar. Svo byrjar hún strax: Egill sest á bakið á henni framan við seglið og hún
ferjar þá eftir síkinu, Mosi vaðandi við hliðina, á meðan þau spjalla og höfuð Þórseðlu gnæfir yfir trjánum framundan. Hún skilar
þeim á þúfurnar með ráði: Þórseðla heyrir ekki í litlum röddum, en hún elskar rauðu berin.

- **Tíminn:** síðla morguns, sama birta og í gamla kafla 2 (`lateMorning`), í báðum köflunum. Handritið segir „um hádegi“ um kafla 3,
  en ný birta myndi breyta samþykktum skotum Fensins; það bíður þess að eigandinn biðji um það.
- **Það sem barnið æfir:** að telja upp í tíu (sporin, óbreytt) og að bera saman stórt og lítið og telja upp í fimm (fiskarnir).
- **Engin ógn:** barnið getur aldrei mistekist; hver bið endar af sjálfu sér með vísbendingu og svo hjálp.
- **Lengd:** um 6,4 mínútur fyrir barn sem snertir ekkert (kafli 3 um 6,7); hvorugur kafli yfir 7,5 mínútum þannig, aldrei yfir 10.

## 2. Persónur

| Persóna | Stærð | Í kafla 2 | Rödd |
| --- | --- | --- | --- |
| Mosi | 8,5 m | Leiðsögumaður og teljari; heldur að seglið sé bátur; smá hræddur við vatn, vaðar við hlið Uggeðlu. | Mosi (v4) |
| Egill | 1,1 m | Pikkar á fiskana, situr á baki Uggeðlu og spyr um seglið. | Egill (v4) |
| Uggeðla | 14 m, seglið 7,3 m upp | Spinosaurus. Glaðleg og stríðin veiðikona sem hlær auðveldlega og stríðir Mosa blíðlega. Felur sig í sefinu, en seglið sést alltaf. | Ný rödd (6. kafli) |
| Þórseðla | 22 m | Sést aðeins í fjarska, höfuðið yfir trjánum, á meðan á ferjunni stendur. | Engin |
| Kambeðla | 7 m | Í burknalautinni í senu 1, eins og áður. | Kambeðla (v4) |

Uggeðla er alvöru líkanið (`remake/assets/characters/spinosaurus.glb`, 39.302 þríhyrningar, klippurnar idle, walk, kink, happy,
wade), alltaf í raunstærð við Mosa og Egil.

## 3. Síkið (nýr staður)

Síkið er staður milli Fenjaslóðarinnar og Fensins, í útliti Fensins (STYLE.md 4 og útlit Fensins í forskrift gamla kafla 2, 3. kafla):
blautt, gullið og tært.

- **Stígurinn** kemur inn úr norðvestri, framhald fenjaslóðarinnar, og hverfur undir vatn þar sem síkið hefur flætt yfir hann: síðustu
  metrarnir af stígnum sjást undir grunnu vatni, og bakkinn hinum megin er handan síkisins.
- **Síkið** liggur þvert á stíginn og hlykkjast þaðan um 50 m að **þúfunum** í endann, þar sem Uggeðla skilar þeim. Það er nógu breitt
  (6–8 m) og djúpt (um 1,2 m í miðjunni) til að Uggeðla syndi með kviðinn í vatninu og seglið upp úr, en grynnra við bakkann þar sem
  Mosi vaðar (vatnið á milli ökkla og hnjáa hans). Vatnið er `world/props/water.js` (pollar og síki í `layout.water`), eins og í
  Feninu.
- **Sefið:** þétt elftingasef þar sem Uggeðla liggur í upphafi, handan síkisins, nógu hátt til að fela hana þegar hún liggur lágt
  (aðeins seglið upp úr), og breiður meðfram bakkanum; vatnaliljur í grunnu vatni; nokkur fenjatré sem ramma inn skotin.
- **Þórseðla í fjarska:** framundan, í þá átt sem ferjan fer, stendur Þórseðla langt í burtu bak við fenjatrén, og höfuðið hennar
  sést gnæfa yfir trjánum. Hún bítur trjátoppa eins og í Feninu, er aldrei pikkmark og sést aðeins úr skotum ferjunnar og þúfnanna.
- **Þúfurnar:** þurrar mosaþúfur við enda síkisins, með berjarunna í bakgrunni, þar sem Egill fer aftur í hnakkinn.
- **Skot:** hvert skot fyrirfram stillt eins og í hinum stöðunum (`engine/locations.js`), myndavélar í augnhæð barns nema þar sem
  sagan lyftir þeim; skot fyrir breiðan skjá og upprétta spjaldtölvu.
- **Hljóð:** hljóðteppi Fensins (`engine/audio/fen-sounds.js`) frá komunni í Síkið.

## 4. Senur kafla 2

### 1. Lagt af stað (um 29 s): óbreytt
Burknalautin, línur Mosa og Egils um Þórseðlu, kortið rennur upp og teiknar leiðina (bútar b og c), Kambeðla veifar.

### 2. Fótsporin í leðjunni (um 139 s): óbreytt til enda talningarinnar
Barnið telur sporin tíu. Eftir „Tíu fótspor! Hún hlýtur að vera rétt hjá.“ gengur Mosi áfram niður slóðina og myndin dofnar inn í
Síkið (í stað Fensins).

### 3. Síkið (um 35 s)
- **Skot:** Mosi kemur að vatninu þar sem stígurinn hverfur undir það. Handan síkisins er sefið.
- **Línur:** Mosi: „Ó nei! Síkið hefur flætt yfir stíginn.“ Egill: „Hvernig komumst við yfir?“
- **Seglið:** stórt, litríkt segl rís hægt upp úr sefinu handan síkisins (Uggeðla liggur lágt í vatninu og lyftir bakinu). Mosi: „Sjáðu,
  Egill! Bátur! Með stóru, litríku segli!“ Egill: „Halló, bátur!“
- **Uggeðla:** seglið snýst, og haus hennar kemur upp úr vatninu með fisk í kjaftinum; hún gleypir hann. Mosi: „Þetta er enginn
  bátur… þetta er Uggeðla!“ Uggeðla: „Bátur? Ha ha ha! Halló, Mosi. Ég er að veiða.“ Staður hennar fer á kortið í bókinni
  (`s.place('uggedla')`, merkið flýgur í bókina eins og Fenið gerði), og spjald hennar á Risaeðlur-síðunni opnast með því.
- **Barnið:** pikk á seglið lætur það glitra; ekkert nauðsynlegt.

### 4. Veiðin (60–90 s, á hraða barnsins)
- **Markmið:** barnið pikkar á fimm stóra fiska og lætur litlu fiskana vera.
- **Skot:** frá bakkanum yfir síkið: Uggeðla í vatninu í miðjunni, Mosi og Egill á bakkanum. Myndavélin er kyrr (ekki frjáls sýn), svo
  hver fiskur sem stekkur sést.
- **Línur:** Uggeðla: „En fiskarnir eru svo snöggir í dag. Viltu hjálpa mér, Egill? Pikkaðu á stóru fiskana þegar þeir stökkva!“
- **Fiskarnir:** einn í einu stekkur fiskur upp úr síkinu í boga (um 1,5 s í loftinu) á stöðum í kringum Uggeðlu. Stórir fiskar eru
  um 1 m (fiskur Fensins, Lepidotes-líkur, stækkaður) og glitra þegar þeir stökkva; litlir eru um 30 cm og glitra ekki. Um þriðji
  hver fiskur er lítill, og aldrei tveir litlir í röð.
- **Pikk á stóran fisk:** hann frýs andartak í loftinu, haus Uggeðlu skýst að honum og hún grípur hann (kjafturinn opnast lítillega og
  smellur saman), kastar höfðinu aftur og gleypir. Mosi telur í karlkyni, því fiskur er karlkyns: „Einn!“, „Tveir!“, „Þrír!“,
  „Fjórir!“, „Fimm!“.
- **Pikk á lítinn fisk:** hann syndir burt með lítilli skvettu. Uggeðla: „Nei, hann er of lítill. Hann má stækka!“
- **Vísbending og hjálp:** ekkert pikk á stóran fisk í 8 s: Mosi: „Bíddu eftir stórum fiski… og pikkaðu!“; í 16 s: Uggeðla grípur næsta
  stóra fisk sjálf og Mosi telur hann.
- **Þegar fimm eru komnir:** Uggeðla: „Fimm fiskar! Takk, Egill. Þú ert frábær veiðimaður!“

### 5. Boðið og stjarnan (um 35 s)
- **Skot:** tvískot af Uggeðlu í vatninu við bakkann og Mosa með Egil.
- **Línur:** Mosi: „Uggeðla, viltu koma á Stjörnuhátíðina í kvöld?“ Uggeðla: „Stjörnuhátíð! Já, ég kem! Og ég veit hvað ég geri:
  ég ferja alla gestina yfir ána.“
- **Stjarnan:** stjarna rís upp úr toppi seglsins og bíður pikks (mest 8 s) eins og í köflum 1 og 2. Mosi: „Sjáðu, Egill! Önnur
  stjarnan!“ (`k2_mosi_second`, upptakan er til). Stjarnan `k2_uggedla` flýgur í bókina.

### 6. Ferjan (um 45 s, kvikmynd)
- **Línur:** Uggeðla: „Og ég byrja strax. Upp á bakið, Egill! Ég ferja ykkur til Þórseðlu.“
- **Egill sest á bakið:** hann svífur úr hnakknum upp á bak hennar, rétt framan við seglið, og heldur í fremstu brún þess (sæti á beini
  hennar, `engine/riding.js` `createSeat`), eins og hann svífur í hnakkinn í kafla 1.
- **Ferðin:** Uggeðla syndir hægt eftir síkinu í átt að þúfunum, halinn sveiflast og vatnið gárast (`water.wade`); Mosi vaðar við
  hliðina á grunna kantinum; höfuð Þórseðlu gnæfir yfir trjánum framundan. Tvö til þrjú skot: hlið við hlið með þeim, framan frá með
  Egil á bakinu og seglið yfir honum, og aftan frá yfir seglið í átt að Þórseðlu.
- **Spjallið** (val eigandans):
  - Mosi: „Brrr! Vatnið er svo blautt!“
  - Uggeðla: „Vatn er alltaf blautt, Mosi!“
  - Egill: „Af hverju ertu með svona stórt segl?“
  - Uggeðla: „Svo allir sjái mig langt að. Meira að segja þeir sem halda að ég sé bátur!“
  - Mosi: „Ég hélt það bara pínulitla stund…“
  - Uggeðla: „Og sjáðu, ég syndi með halanum, eins og fiskur!“ Halinn skvettir á Mosa.
  - Mosi: „Hei! Nú er ég ennþá blautari!“
  - Egill: „Sjáðu! Höfuðið á Þórseðlu, uppi yfir trjánum!“
- **Barnið:** horfir; engin pikkmörk.

### 7. Þúfurnar (um 25 s)
- **Skot:** Uggeðla við þúfurnar, Mosi kemur upp úr vatninu á þúfuna.
- **Egill fer aftur í hnakkinn:** hann svífur af baki hennar í hnakkinn á Mosa (`floatTo`).
- **Línur:** Uggeðla: „Hér eru þúfurnar. Þórseðla heyrir ekki í litlum röddum. En hún elskar rauðu berin!“ Mosi: „Takk, Uggeðla!
  Sjáumst í kvöld!“
- **Hún fer:** syndir burt eftir síkinu og seglið rennur inn í sefið.
- **Bókin:** dofnun í bókina, sem opnast á Risaeðlum þar sem Uggeðla er ný og kinkar kolli, og flettir yfir á kortið (rauða línan að
  hring Uggeðlu teiknast með stjörnunni hennar). Mosi: „Tvær komnar. Og nú vitum við hvert við förum næst!“ (`k2_mosi_two`, til).
  Svo „Áfram“-hnappurinn í kafla 3.

## 5. Kafli 3: Boð til Þórseðlu

Senur 3 til 8 gamla kafla 2, fluttar óbreyttar í nýjan kafla, með þessum breytingum:

- **Upphafið:** kaflinn byrjar í Feninu. Á meðan upphafshnappurinn bíður sést Fenið (skotið `fen_reveal`), og Mosi bíður með Egil í
  hnakknum þar sem slóðin kemur inn í Fenið. Myndin opnast úr svörtu og sena 3 (Fenið) hefst eins og áður: Mosi gengur upp á þúfuna
  sína meðan myndavélin rís og opinberar Þórseðlu. Ekkert kort í upphafi (leiðin var teiknuð í kafla 2). Kambeðla er ekki í kaflanum.
- **Útsýnið (sena 6):** barnið leitar að Slóeðlu og Flugeðlu eins og nú. Svo snýr myndavélin sér að sefi Uggeðlu eins og nú, en þar er
  engin leit: hún lyftir höfðinu og seglinu upp úr sefinu og glitrar (`far-friends.js` react), og Mosi: „Og sjáðu! Uggeðla veifar okkur
  úr sefinu sínu!“ Egill: „Hæ, Uggeðla!“ Hún fer ekki aftur á kortið (hún er þegar þar með stjörnuna sína). Svo snýr myndavélin sér að
  Grameðlu eins og nú.
- **Stjarnan (sena 8):** Mosi: „Sjáðu, Egill! Þriðja stjarnan!“ og í bókinni „Þrjár komnar. Og nú vitum við hvert við förum næst!“ (nýjar
  upptökur í stað „önnur“ og „tvær“, sem fara til kafla 2). Stjarnan er áfram `k2_thorsedla`.
- **Lengd:** um 6,7 mínútur fyrir barn sem snertir ekkert (Uggeðluleitin, um 40 s, verður um 10 s veifa).

## 6. Vistun, röð kaflanna og bókin

- **Stjörnur:** Uggeðlu stjarna er `k2_uggedla`. Þórseðlu stjarna heldur nafninu `k2_thorsedla`: nafnið er aðeins merki (`friendOf`
  les vininn úr því), og nýtt nafn myndi láta gamla vistun týna stjörnunni og Háls og hala.
- **Hvaða kafli opnast** (`engine/save.js` `defaultChapter`): kafli 1 þar til `k1_kambedla` er komin; kafli 2 þar til `k2_uggedla` er
  komin; svo kafli 3, líka eftir að `k2_thorsedla` er komin, svo það megi spila hann aftur. Barn sem lék gamla kafla 2 (með
  `k2_thorsedla` en án `k2_uggedla`) opnar kafla 2 og hittir Uggeðlu. Ekkert í vistuninni breytist eða týnist: stjörnur, fundin dýr,
  staðir (`places`, þar á meðal `uggedla` úr útsýninu), séð spjöld og `hals.played` haldast.
- **Áfram:** `kafli1.next` er `kafli2` eins og nú; `kafli2.next` er `kafli3`; `kafli3.next` er `null`.
- **Kortið:** staður Uggeðlu (`uggedla`) merkist þegar hún birtist í senu 3 og fær stjörnu með `k2_uggedla`; bútur b (að hring
  hennar, `by: 'star'`) teiknast þá. Kortið að öðru leyti óbreytt.
- **Spjald Uggeðlu** á Risaeðlur-síðunni opnast með stað hennar (`unlock: { place: 'uggedla' }`, óbreytt), svo bæði ný og gömul
  vistun opnar það.
- **Leikir:** reitur Uggeðlu, „Veiddu“ (Go Fish), birtist á Leikir-síðunni þegar `k2_uggedla` er komin, eins og Háls og hali með
  stjörnu Þórseðlu. Leikinn smíðar önnur seta; nafn hans og inngangur fylgja því sem hún notar. Ef leikurinn er kominn í main þegar
  þessi grein er smíðuð tengir hún reitinn; annars tengir Veiddu-setan hann við `k2_uggedla`. Reitur birtist aldrei án leiks.

## 7. Hljóð og raddir

- **Rödd Uggeðlu:** ný rödd hönnuð með ElevenLabs Voice Design (eins og plötusnúður Söngs Slóeðlu): innfædd íslensk kona, fullorðin,
  glaðleg og stríðin, hlær auðveldlega, svolítið hröð. Nokkrar raddir á hlustunarsíðu, eigandinn velur eftir eyranu, og valin rödd fer
  í `remake/assets/audio/voices.json` sem `uggedla`.
- **Línur:** allar nýjar línur eru teknar upp með `remake/tools/voice-lines.mjs` (ElevenLabs v4, orðalistinn
  `remake/assets/audio/pronunciation.json`) í línusafninu `kafli2`, sem geymir upptökur beggja kaflanna (kafli 3 notar áfram
  `k2_`-línurnar sínar). Ný auðkenni kafla 2 byrja á `k2_`, kafla 3 á `k3_`. Talning fiskanna er ný: „Einn!“, „Tveir!“, „Þrír!“,
  „Fjórir!“ (í karlkyni; „Fimm!“ er sama orð og `k2_mosi_5`). „Einn“ fær uppskriftina sem vann í Litla Yatzy og minnisspilinu ef
  hrátt v4 bregst. Eigandinn hlustar á hverja línu á já/nei-síðu.
- **Hljóð:** skvettur og plipp fisksins úr Feninu (`fen-sounds.js` `fish`), sund og vað (gárur og skvettur), kjaftsmellur þegar hún
  grípur, gleypihljóð, skvettan af halanum á Mosa, seglið sem rís úr sefinu (skrjáf), stjörnuhljómurinn. Allt í tóntegund stefsins.
  Kjaftsmellurinn og skvetturnar eru fyrst búnar til í leiknum eins og hljóð Fensins; hljómi þær ekki rétt er lagt til ókeypis
  upptaka (CC0) og spurt áður en nokkru er hlaðið niður.
- **Tónlist:** stef kafla 2, „Dino Trail“, í báðum köflunum.

## 8. Tækni

- **Kafli 2** (`remake/chapters/kafli2.js`): senur 1 og 2 eins og nú, og nýju senurnar 3 til 7. Nýjar skrár: `kafli2-siki.js` (staðurinn:
  layout, vatn, plöntur, skot), `kafli2-uggedla.js` (líf hennar: liggja lágt, rísa úr sefinu, gripið, sundið, sætið á bakinu) og
  `kafli2-fishing.js` (fiskarnir: stökk, stórir og litlir, pikk, talning, vísbendingar). Staðirnir eru `burknalaut`, `fenjaslod`
  og `siki`; Fenið er ekki lengur byggt í kafla 2. Leikarar: Mosi, Egill, Kambeðla, Uggeðla (`spinosaurus.glb`) og Þórseðla (í
  fjarska).
- **Kafli 3** (`remake/chapters/kafli3.js`): Fen-hluti gamla `kafli2.js` fluttur óbreyttur. `kafli2-fen.js`, `kafli2-thorsedla.js` og
  `kafli2-lookout.js` heita nú `kafli3-fen.js`, `kafli3-thorsedla.js` og `kafli3-lookout.js` (git mv, innihaldið óbreytt nema það
  sem 5. kafli breytir). Staðurinn er `fen` einn og byrjar þar. Prófin skiptast eins: Fen-prófin fara í `kafli3.test.mjs`.
- **Fenið og Fenjaslóðin** eru ósnert: sama layout, sama fræ, sömu skot, svo plönturnar raðast eins og áður og samþykkt skot haldast.
- **Hreyfingar Uggeðlu:** nýjar klippur (lágt sund með halann sem ár, gripið) eru bakaðar eins og núverandi klippur hennar með
  `tailed-biped-clips.js` og bake-tólinu (endurbakast bæti fyrir bæti), eða gerðar í kóða á beinin ef það dugar; ekkert nýtt módel.
  Kjafturinn opnast mest 12° í gripinu og er skoðaður í nærmynd (við 10° snúast 4 örsmáir þríhyrningar við munnvikið).
- **Fiskarnir:** fiskur Fensins (`world/critters/models.js` `fish`) í tveimur stærðum, ein teikning hvert, með stökkboga og skvettu.
- **Afköst:** hvert lykilskot í Síkinu innan 6 ms á skjákorti, 100 teikniköll og 250 þúsund þríhyrninga á spjaldtölvustillingu
  (STYLE.md 11), mælt eins og í gamla kafla 2. Þórseðla í fjarska í léttri útgáfu.
- **Línuendingar:** hver skrá heldur sínum (`.gitattributes * -text`); `main.js` og `engine/book/book.js` eru CRLF.
- **Grein:** `kafli-uggedla` frá staðbundnu main, vinnutréð `C:/Risaeðla/dino-kafli-uggedla`. Ekkert sameinað eða ýtt nema eigandinn
  biðji um það.

## 9. Bútar og ferli

Smiðsagentar (Sonnet þar sem það dugar) smíða í bútum; eigandinn sér myndir eða myndband eftir hvern bút og hefur síðasta orðið.

1. **Kaflaskilin:** kafli 3 sjálfstæður (byrjar í Feninu, Uggeðla veifar, „þriðja stjarnan“ með bráðabirgðatíma), `defaultChapter`,
   `next`, prófin skipt. Kafli 2 endar á meðan eftir sporunum. Myndband af upphafi kafla 3 og útsýninu.
2. **Rödd Uggeðlu:** raddir hannaðar og eigandinn velur (samhliða bút 1).
3. **Síkið:** staðurinn, vatnið, sefið, þúfurnar, Þórseðla í fjarska, skotin. Myndir af lykilskotum á 1280×800 og upprétt.
4. **Uggeðla lifandi:** liggja lágt og rísa, seglið, gripið, sundið, Egill á bakinu. Myndband.
5. **Veiðin:** fiskarnir, pikkið, gripið, talningin, vísbendingarnar. Myndband.
6. **Boðið, stjarnan, ferjan, þúfurnar og bókin.** Myndband af seinni hluta kafla 2.
7. **Raddir og frágangur:** allar nýjar línur teknar upp og hlustaðar (já/nei), hljóðin, Veiddu-reiturinn, heil spilun beggja kafla
   frá byrjun til enda, mælingar á lykilskotum og öll prófin græn.

**Lokið** er þegar báðir kaflarnir spilast frá byrjun til enda á greininni, prófin eru græn og eigandinn hefur séð og samþykkt.

## 10. Opið

- Nafn og inngangur Veiddu-leiksins: beðið svars Veiddu-setunnar (6. kafli segir hvernig reiturinn tengist hvort sem er).
- Barn með gamla vistun sem leikur nýja kafla 2 heyrir „Önnur stjarnan!“ þótt það eigi þrjár. Látið vera nema eigandinn biðji um annað.
