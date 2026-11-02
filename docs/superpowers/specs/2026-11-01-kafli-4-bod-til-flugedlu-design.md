# Kafli 4: Boð til Flugeðlu

Fjórði kaflinn í röð kortsins (handritið, `2026-10-28-handrit-leiksins.md`): frá tjörn Þórseðlu yfir Fenið að hvíta trénu, þar sem
Flugeðla situr en kemst ekki á loft. Egill hjálpar henni að finna vindinn, hún þiggur boðið og tekur hann með sér í flug upp með ánni
og fossinum. **Flugið er hápunktur leiksins** og fær mestu vinnuna: það á að líða eins og þegar drekinn flýgur með drenginn í
Sögunni endalausu, með fallegum kvikmyndaskotum, vindinn þjótandi um eyrun og nóg að sjá.

Ákvarðanir eigandans í hugarfluginu 1. nóvember 2026:

- **Röðin:** Flugeðla kemur næst á eftir Þórseðlu, eins og kortið og handritið segja, og Slóeðla þar á eftir.
- **Vandinn:** vindinn vantar. Barnið strýkur upp skjáinn til að búa til vindhviður.
- **Gjöfin:** hún flýgur um og kallar á alla á hátíðina, og tekur Egil með.
- **Egill situr á bakinu á henni.** Á fluginu er tal, og Egill getur gert þrennt ef hann vill: kallað á dýrin, stýrt aðeins og
  ýtt á „Hraðar!“.
- **Leiðin:** meðfram ánni að fossinum, upp með honum, og þaðan út yfir landið.
- **Mosi hleypur með ánni** og sést í nokkrum skotum.
- **Framvindan og flugið skot fyrir skot** voru samþykkt eins og þau standa í 4. og 5. kafla.

## 1. Sagan

Þórseðla kveður við tjörnina sína, og Mosi og Egill halda yfir Fenið að hvíta, dauða trénu. Efst á því situr Flugeðla með vængina
útbreidda, en ekkert gerist: það er logn í Feninu. Hún vill koma á hátíðina og kalla á allan skóginn, en án vinds kemst hún ekki á
loft. Egill býr til vind. Hann strýkur upp, lauf og fræ fjúka, sefið bognar og loks kemur stór hviða sem lyftir henni. Hún þiggur
boðið og fjórða stjarnan kviknar.

„Viltu koma með, Egill?“ Egill svífur upp á bakið á henni og Mosi hrópar: „Fljúgið þið, ég hleyp!“ Hún stekkur af trénu, steypir sér
niður að ánni og flýgur lágt yfir vatninu upp með straumnum. Á bökkunum kallar hún á dýrin að koma á hátíðina og þau svara. Mosi
hleypur á bakkanum og skvettir. Þau fljúga gegnum gljúfrið, beint upp með fossinum í úða og regnboga, og springa út úr úðanum í gullið
ljós. Þaðan sést allt landið, og í þokunni handan fjallanna skuggi Grameðlu. Flugeðla kallar stærsta kallið yfir landið og svör
berast úr öllum áttum. Svo svífa þau niður að fjarlægu tjörninni og lenda. Mosi kemur másandi, og úr sefinu heyrist dapur, falskur
lúðurtónn: Slóeðla man ekki lagið sitt. Þannig byrjar kafli 5.

- **Tíminn:** snemma síðdegis. Ný birta, `earlyAfternoon` í `engine/lighting.js`: sólin lægri og hlýrri en í kafla 3. Gullna
  ljósið yfir fossinum er hámark hennar, sól í gegnum úða og víð mynd í hlýju ljósi.
- **Það sem barnið gerir:** strýkur (ný hreyfing, verkefni kaflans), og á fluginu pikkar það, dregur fingur og ýtir á hnapp. Allt
  á fluginu er valfrjálst.
- **Engin ógn:** barnið getur aldrei mistekist. Vindurinn kemur á endanum af sjálfu sér, flugið spilast eins og bíómynd ef barnið
  gerir ekkert, og Grameðla er aðeins fjarlægur skuggi.
- **Lengd:** um 7,5 mínútur fyrir barn sem snertir ekkert, þar af flugið um 2 mínútur og 50 sekúndur. Aldrei yfir 10.

## 2. Persónur

| Persóna | Stærð | Í kafla 4 | Rödd |
| --- | --- | --- | --- |
| Mosi | 8,5 m | Leiðsögumaður. Býður Flugeðlu, sýnir hvernig á að blása og hleypur með ánni á fluginu. | Mosi (v4) |
| Egill | 1,1 m | Býr til vindinn, situr á baki Flugeðlu, hrópar af gleði og spyr. | Egill (v4) |
| Flugeðla | 7,5 m milli vængbrodda, 4,2 m upp á kamb | Pteranodon. Kát og frjálsleg, elskar hraða og hlær í vindinum (tillaga, 11. kafli). | Ný rödd (8. kafli) |
| Þórseðla | 22 m | Kveður við tjörnina sína í senu 1 og sést síðan í fjarska úr fluginu. | Engin |
| Slóeðla | 7,5 m | Heyrist aðeins: falskur lúðurtónn úr sefinu í lokin. | Engin (lúðurinn er hljóð) |
| Grameðla | 12 m | Skuggi í þokunni og lágt, fjarlægt öskur. | Engin |

Flugeðla er alvöru líkanið (`remake/assets/characters/pteranodon.glb`), með klippurnar idle, walk, takeOff, fly, glide, land, kink,
happy og carry. **Stærðin er prófuð í búti 1:** sitji Egill (1,1 m) of stór á 7,5 m Flugeðlu, leggur smiðurinn fram myndir af henni
í 10 m (á stærð við Quetzalcoatlus). Eigandinn velur, og þá breytast STYLE.md 3. kafli og `chapters/lineup.js` með.

## 3. Staðirnir

### Fenið við hvíta tréð
Fenið úr kafla 3 (`fen`, sama layout og sama fræ), svo það sé sama landið. Hvíta tréð er þar þegar (10,5 m hátt, þar sem Flugeðla
situr í útsýni kafla 3). Kafli 4 bætir aðeins við skotum: tjörn Þórseðlu þegar þeir leggja af stað, gangan yfir Fenið og hvíta tréð
frá jörðu, ofan frá og á hæð Flugeðlu. Skot fyrir breiðan skjá og upprétta spjaldtölvu.

### Árdalurinn (nýr staður, flugbrautin)
Leiðin liggur eins og áin á kortinu: frá hvíta trénu suðvestur niður að ánni, vestur upp með henni, gegnum gljúfrið að fossinum, upp
með honum, út yfir landið og svo austur niður að fjarlægu tjörninni sem liggur við ána.

- **Áin:** breið og lygn neðst, með vatnaliljum og sandbökkum. Ofar þrengist hún, með flúðum og klettum, uns bakkarnir verða að
  klettaveggjum gljúfursins. Vatnið er vatn leiksins (`world/props/water.js`), með straumi og hvítfyssi á flúðunum.
- **Bakkarnir:** gróður Fensins og skógarins (sef, burknar, fenjatré og barrtré), og dýrin sem Flugeðla kallar á (5. kafli).
- **Gljúfrið:** klettaveggir, skuggi og bergmál, með flúðum neðst.
- **Fossinn:** um 40 m hár, með fallandi vatni, úða og regnboga í sólinni. Hann er nýr (9. kafli).
- **Útsýnið:** ofan við fossinn sést allt landið í léttri útgáfu: skógurinn, Fenið, áin, höfuð Þórseðlu í fjarska, fjöllin og þokan
  með skugga Grameðlu. Það er sama landið og kortið sýnir.
- **Fjarlæga tjörnin:** lygn tjörn í sefi við ána, þar sem Flugeðla lendir. Kafli 5 byrjar hér, svo staðurinn er byggður þannig að
  hann haldist.

## 4. Senurnar

### 1. Kveðjustund við tjörn Þórseðlu (um 45 s)
- **Línur:** Mosi: „Næst er það Flugeðla! Hún á heima uppi á hvíta trénu.“ Egill: „Getur hún flogið?“ Mosi: „Hærra en skýin!“
- **Kortið** rennur upp og teiknar bút d, frá tjörn Þórseðlu að hring Flugeðlu, á meðan Mosi segir: „Yfir Fenið, að hvíta trénu.“
  Þetta er sama aðferð og í kafla 3 (`mapMoment`).
- **Þórseðla** lækkar höfuðið og kveður (pikk á hana gefur kveðju), og þeir ganga yfir Fenið.

### 2. Við hvíta tréð (um 45 s)
- **Skot:** Flugeðla efst á trénu, séð neðan frá, með vængina útbreidda en hreyfingarlausa. Ekkert bærist.
- **Línur:** Mosi: „Halló, Flugeðla! Viltu koma á Stjörnuhátíðina í kvöld?“ Flugeðla: „Hátíð! Ég skal kalla á allan skóginn! En
  það er logn… og án vinds kemst ég ekki á loft.“ Egill: „Við getum búið til vind!“

### 3. Vindurinn, verkefni kaflans (60–90 s, á hraða barnsins)
- **Strokan:** stroka upp á skjánum, minnst fimmtungur af hæð hans, hvar sem er, er ein vindhviða. Pikk telst hálf hviða, svo barn
  sem pikkar kemst líka áfram.
- **Hver hviða sést og heyrist:**
  - lauf og fræ fjúka upp eftir strokunni;
  - sefið og greinar trésins bognar (`engine/wind.js`);
  - vængir Flugeðlu bærast;
  - vindhljóð fylgir.
- **Egill og Mosi blása með.** Flugeðla hvetur: „Meira! Ég finn hann!“
- **Sex hviður fylla vindinn:** þá kemur stór hviða, skýin fara af stað og hún lyftist með „Nú!“.
- **Hjálp:** eftir 6 s án hviðu kemur vísbending, glóandi fingur sem strýkur upp, og Mosi segir: „Strjúktu upp, Egill!“ Eftir 12 s
  sýnir Mosi hvernig hann blæs. Eftir 20 s kemur ein hviða af sjálfu sér á 4 s fresti, svo vindurinn fyllist alltaf.

### 4. Boðið þegið og stjarnan (um 30 s)
- Flugeðla svífur einn hring um tréð og sest aftur. „Takk! Ég kem á hátíðina og kalla á alla!“
- Stjarnan rís og bíður pikks barnsins, eins og í fyrri köflum (`s.star('k4_flugedla', …)`). Mosi: „Fjórða stjarnan!“

### 5. Egill sest á bakið á henni (um 30 s)
- Flugeðla: „Viltu koma með, Egill? Sestu á bakið á mér.“ Egill: „Já!“
- Hún sest lágt og Egill svífur upp á bakið á henni milli vængjanna, eins og í hnakkinn í kafla 1 (`engine/riding.js`: `floatTo` og
  `ride`). Sætið er ósýnilegt, og hendurnar halda í kambinn eða hálsinn.
- Mosi: „Fljúgið þið, ég hleyp!“

### 6. Flugið (um 2 mín. 50 s)
Sjá 5. kafla.

### 7. Lending við fjarlægu tjörnina (um 45 s)
- Flugeðla lendir í tjörninni með skvettu (`land`), og Egill svífur niður.
- Mosi kemur másandi út úr sefinu: „Ég… er… kominn!“
- Úr sefinu handan tjarnarinnar heyrist dapur, falskur lúðurtónn. Egill: „Hvað var þetta?“ Mosi: „Lúðurinn hennar Slóeðlu… en lagið
  var eitthvað skrítið.“
- Kaflinn endar eins og kafli 3 endar, og „Áfram“ leiðir í kafla 5 þegar hann er til.

## 5. Flugið, skot fyrir skot

Skotin eru tvenns konar. **Bundin skot** fylgja Flugeðlu: aftan og ofan við Egil (eltiskot), framan á Egil, frá hlið og hringsól.
**Kyrr skot** standa á bakkanum eða við fossinn á meðan hún þýtur hjá. Tímarnir eru fyrir barn sem snertir ekkert.

### A. Flugtakið (0:00–0:15)
- Nærmynd framan frá: Egill heldur sér og Flugeðla snýr höfðinu að honum: „Haltu þér fast!“
- Víð mynd neðan frá: hún stekkur af trénu (`takeOff`) og fellur augnablik, svo það kemur fiðringur í magann. Vængirnir smella út,
  vindurinn hvín og tónlistin rís. Egill: „Vááá!“

### B. Niður að ánni (0:15–0:35)
- Eltiskot: Fenið þýtur hjá og sefið leggst undan vængjunum.
- Hún jafnar sig rétt yfir vatninu (`glide`), og kyrrt skot frá vatnsborðinu sýnir spegilmyndina.
- **Hægt er að stýra hér** (6. kafli). Vísbending birtist í fyrsta eltiskotinu.

### C. Upp með ánni og kallið (0:35–1:20)
- **Dýrahóparnir á bökkunum,** hver á eftir öðrum:
  - froskar á vatnaliljum;
  - sniglar á trjábol;
  - drekaflugur yfir vatninu;
  - skjaldbaka á steini;
  - hópur af litlum eðlum að drekka.
- **Kallið:** Flugeðla kallar „Hátíð í kvöld! Komið öll!“ (þrjár útgáfur) og dýrin svara: froskur stekkur og kvakar, sniglarnir
  lyfta augunum, drekaflugurnar elta í sveim, skjaldbakan teygir hálsinn og litlu eðlurnar tísta og hlaupa með.
- **Egill má kalla** (6. kafli). Á hópa sem hann pikkar ekki á kallar hún sjálf, svo gjöfin sést alltaf.
- **Kvikmyndaskot milli eltiskota:**
  - lágt frá vatnsborðinu þegar hún þýtur hjá;
  - frá bakkanum þegar skuggi hennar fer yfir dýr sem lítur upp.
- **Mosi í fyrsta sinn:** kyrrt skot frá hlið þegar hann hleypur á bakkanum og skvettir: „Bíðið eftir mér!“
- **„Hraðar!“ er hægt hér** (6. kafli).

### D. Gljúfrið (1:20–1:45)
- Bakkarnir verða að klettaveggjum, það dimmir, bergmálar og flúðir eru fyrir neðan. Hún sveigir milli klettanna.
- Skot framan frá sýnir andlit Egils í vindinum (hárið feykist). Víð mynd ofan úr gljúfrinu sýnir þau örsmá. Egill: „Vá!“
- Mosi í annað sinn, ofan af brúninni: „Ég fer styttri leiðina!“

### E. Fossinn (1:45–2:05)
- Drunur fossins vaxa. Egill: „Sjáðu fossinn!“ Flugeðla: „Upp með honum!“
- Hún flýgur beint að fossinum og rífur sig upp með fallandi vatninu. Kyrrt skot frá hlið við bergið sýnir klifrið lóðrétt, í úða og
  regnboga.
- Efst hægist á tímanum í eina sekúndu, tónlistin þagnar og aðeins vindurinn heyrist. Svo springa þau út úr úðanum.

### F. Upp í gullið ljós (2:05–2:30)
- Víð mynd yfir allt landið í gullnu ljósi.
- Flugeðla: „Þarna, handan fjallanna, býr Grameðla.“ Í þokunni sést skuggi hennar og lágt, fjarlægt öskur heyrist (upptakan úr
  kafla 3, mjög lágt). Egill: „Er hún stór?“ Flugeðla: „Stærst af öllum!“
- Flugeðla kallar stærsta kallið yfir landið og svör berast úr öllum áttum: froskar, fuglar, eðlur, og plötur Kambeðlu blikka í
  fjarska. Egill hrópar: „Ég sé allt!“
- Hringsól um þau í gullnu ljósi á meðan tónlistin nær hámarki.

### G. Svifið niður (2:30–2:50)
- Rólegra og tónlistin hljóðnar. Flugeðla: „Takk fyrir vindinn, Egill.“ Svo: „Sjáðu, fjarlæga tjörnin. Þar býr Slóeðla.“
- Mosi sést agnarsmár fyrir neðan á leiðinni þangað. Egill: „Ég sé Mosa!“
- Hún svífur niður að tjörninni, og sena 7 tekur við.

### Reglur fyrir sex ára barn
- **Engin ferðaveiki:** myndavélin hallar mest 8° í beygjum (hún sjálf allt að 30°), snýst aldrei hratt og fylgir henni mjúkt.
- **Ekki of hraðar klippingar:** hvert skot stendur minnst 2,5 s, nema þrjú stutt skot á 1,5 s í gljúfrinu.
- **Ekkert blikk.** Úðinn og regnboginn eru mjúkir.

## 6. Það sem Egill getur gert á fluginu

Allt er valfrjálst. Ekkert breytir leiðinni eða tímanum á stóru augnablikunum.

- **Stýra** (í eltiskotum í B, C og fyrri hluta D):
  - Fingur dreginn til hliðar færir hana allt að 4 m til hliðar innan brautarinnar, og hún hallar sér í beygjunni.
  - Fingur dreginn niður: hún lækkar sig, strýkst við vatnið svo það skvettist, og Egill hlær.
  - Hún snýr aftur á miðja leiðina á 1,5 s þegar fingurinn sleppir, og getur aldrei rekist á.
- **Kalla á dýrin** (í C og F):
  - Hver dýrahópur er pikkmark með rúmum radíus.
  - Pikk: Flugeðla kallar (ein af þremur kalllínum) og hópurinn svarar.
  - Hver hópur svarar einu sinni.
- **„Hraðar!“** (í eltiskotum í B, C og D):
  - Stór, kringlóttur hnappur með væng í neðra horni, aðeins sýnilegur þegar hægt er að nota hann.
  - Pikk: hún slær vængjunum fast og þýtur áfram í 2,5 s á 1,6-földum hraða. Linsan víkkar um 8°, hraðalínur birtast og vindurinn
    hvín hærra.
  - Egill hrópar „Hraðar!“ (tvær útgáfur, ekki í hvert sinn) og hún svarar „Haltu þér!“.
  - Hnappurinn hvílir í 3 s á milli. Það sem hún vinnur með hraðanum svífur hún hægar á eftir, svo fossinn kemur alltaf á sínum tíma.

## 7. Vistun, röð kaflanna og bókin

- **Stjarnan:** `k4_flugedla`.
- **Hvaða kafli opnast** (`engine/save.js` `defaultChapter`): kafli 4 þegar stjarna Þórseðlu (`k2_thorsedla`) er komin og þar til
  `k4_flugedla` er komin. Síðan áfram kafli 4 þar til kafli 5 er til, svo það megi spila hann aftur.
- **Áfram:** `kafli3.next` verður `kafli4`, og `kafli4.next` er `null` þar til kafli 5 er til.
- **Kortið:** bútur d (`by: 'star'`, að hring Flugeðlu) teiknast í kortastundinni í senu 1 og fær stjörnuna með `k4_flugedla`.
  Bútur e (að Slóeðlu) teiknast í upphafi kafla 5, eins og hinir. Staður Flugeðlu (`flugedla`) er þegar merktur úr útsýni kafla 3.
- **Leikir:** reitur Flugeðlu birtist á Leikir-síðunni með `k4_flugedla` þegar smáleikurinn hennar er til. Hann er óákveðinn og fær
  eigin forskrift og vinnutré. Reitur birtist aldrei án leiks.
- **Gömul vistun** týnir engu.

## 8. Hljóð og raddir

- **Rödd Flugeðlu:** ný rödd hönnuð með ElevenLabs Voice Design, eins og rödd Uggeðlu: innfædd íslensk kona, ung, kát og
  frjálsleg, hlær í vindinum. Nokkrar raddir á hlustunarsíðu, eigandinn velur eftir eyranu, og valin rödd fer í
  `remake/assets/audio/voices.json` sem `flugedla`.
- **Línur:** teknar upp með `remake/tools/voice-lines.mjs` (ElevenLabs v4, framburðarorðabókin
  `remake/assets/audio/pronunciation.json`) í nýju línusafni, `kafli4`, með auðkenni sem byrja á `k4_`. Orð sem vantar í
  orðabókina, eins og Flugeðla og Grameðla, fá sína uppskrift þaðan. Eigandinn hlustar á hverja línu á já/nei-síðu. Raddgreiningin
  er aðeins vísbending.
- **Vindurinn:** alvöru upptökur í lögum, ekki búnar til í leiknum (minnið „Real samples for physical sounds“):
  - stöðugur loftstraumur sem hækkar og lækkar með hraðanum;
  - þytur þegar tré, klettar og bakkar þjóta hjá;
  - vængjaslög í flugtaki, beygjum og „Hraðar!“;
  - hviður í vindverkefninu;
  - hljóðið færist milli hægri og vinstri í beygjum.
- **Vatnið:** niður árinnar, flúðirnar, bergmál gljúfursins og drunur fossins, líka úr alvöru upptökum.
- **Upptökurnar** koma frá Freesound (CC0 eða CC BY, höfundar skráðir í leiknum). Spurt er áður en nokkru er hlaðið niður (heiti,
  uppruni og stærð).
- **Dýrin:** svör dýranna eru hljóð leiksins (froskar, sniglar, drekaflugur úr `engine/audio/sfx.js`) og ný hljóð fyrir skjaldbökuna og
  litlu eðlurnar, samkvæmt sömu reglu.
- **Lúðurinn:** falskur, dapur tónn Slóeðlu úr hljóðfærum Söngs Slóeðlu.
- **Tónlist:** kaflastefin eru Suno-lög eigandans. Flugið fær **nýtt flugstef** sem rís í flugtakinu og nær hámarki yfir fossinum.
  Eigandinn gerir það í Suno, og smiðurinn skrifar lýsingu fyrir Suno ef hann vill. Þangað til notar kaflinn stef kafla 2 og flugið
  sama stef hærra.

## 9. Tækni

- **Kaflinn** (`remake/chapters/kafli4.js`): senurnar sjö.
- **Nýjar skrár:**
  - `kafli4-flugedla.js`: líf Flugeðlu, þ.e. að sitja á trénu, vængirnir, flugtakið, hringurinn og sætið á bakinu.
  - `kafli4-wind.js`: vindverkefnið, þ.e. strokur, hviður, vísbendingar og hjálp.
  - `kafli4-flight.js`: flugið, þ.e. leiðin, tímataflan, skotin, stýringin, köllin og „Hraðar!“.
  - `kafli4-ardalur.js`: Árdalurinn, byggður í bútum meðfram leiðinni.
- **Staðirnir:** `fen` (úr kafla 3, óbreytt) og `ardalur`. Leikarar eru Mosi, Egill, Flugeðla (`pteranodon.glb`), Þórseðla og
  Slóeðla (aðeins hljóð).
- **Leiðin og tímataflan:**
  - Flugleiðin er ferill (Catmull–Rom) með tímatöflu: hvert stórt augnablik á sinn tíma (A–G í 5. kafla).
  - Flugeðla fylgir ferlinum eftir tímanum. Stýringin færir hana til hliðar frá ferlinum, og „Hraðar!“ fær lánaðan tíma sem hún
    skilar í svifi.
  - Allt fer eftir klukku leiksins, svo hægt er að gera hlé, spóla í myndatökum og prófa tíma.
- **Flugmyndavélin** (`engine/camera/flight-camera.js`):
  - Skot bundin við Flugeðlu (hliðrun í hennar hnitum) og kyrr skot í heiminum.
  - Reglur myndavélastjórans (`engine/camera/director.js`, `LIMITS`: 1,2 m/s, mest 7,5 m hæð) eru fyrir gönguatriði. Flugmyndavélin
    fær eigin reglur, skráðar í STYLE.md 8. kafla: hraðinn gildir miðað við Flugeðlu, hallinn er mest 8°, hvert skot stendur minnst
    2,5 s (með undantekningunni í gljúfrinu) og engin hæðarmörk.
  - Myndavélastjórinn varar við broti á flugreglunum eins og hann gerir við hinum.
- **Árdalurinn í bútum:**
  - Landið er byggt í bútum meðfram leiðinni (um 150 m hver), og aðeins næstu bútar teiknast, eins og skógurinn er byggður í sneiðum.
  - Áin, bakkarnir, klettarnir og gróðurinn eru úr leikmunum leiksins (`world/props`), fjölfaldaðir.
  - Útsýnið yfir fossinum er létt útgáfa af öllu landinu, með þoku og fjöllum úr himninum (`engine/sky.js`).
- **Fossinn** (`world/props/waterfall.js`, nýr): fallandi vatn í skyggingu, úði í ögnum, regnbogi og hvítfyssi neðst.
- **Strokan** er ný snertihreyfing í `engine/input` og dugar líka í öðrum köflum.
- **Afköst:** hvert lykilskot innan 6 ms á skjákorti, 100 teikniköll og 250 þúsund þríhyrninga á spjaldtölvustillingu (STYLE.md 11),
  mælt á Iris Xe í báðum skjástærðum. Flugið er líka mælt sem heild: miðgildi og versti rammi á allri leiðinni.
- **Línuendingar:** hver skrá heldur sínum (`.gitattributes * -text`). `main.js` og `engine/book/book.js` eru CRLF.
- **Grein:** `kafli4-flugedla` frá main, vinnutréð `C:/Risaeðla/dino-kafli4-flugedla`, þjónn á port 4260. Bútar 1–4 eru óháðir kafla
  3 og byrja strax. Áður en bútur 5 byrjar þarf kaflaskiptingin úr greininni `kafli-uggedla` að vera komin í main, og þá er main
  sameinað inn í greinina. Ekkert er sameinað í main eða ýtt nema eigandinn biðji um það.

## 10. Bútar og ferli

Smiðsagentar smíða í bútum og vista oft. Eigandinn sér myndir eða myndband eftir hvern bút og hefur síðasta orðið.

1. **Gróf útgáfa af fluginu:**
   - öll leiðin með einföldum gráum formum, öll skotin í 5. kafla og rétt tímasetning;
   - Flugeðla flýgur með Egil á bakinu og Mosi hleypur með;
   - stærð Flugeðlu prófuð (2. kafli).

   Myndband til eigandans, sem samþykkir taktinn og tilfinninguna áður en vinna fer í útlitið.
2. **Árdalurinn:** áin, bakkarnir, dýrahóparnir, gljúfrið og mælingarnar. Myndband og myndir af lykilskotum.
3. **Fossinn og útsýnið:** fossinn, úðinn, regnboginn, gullna ljósið, landið og skuggi Grameðlu. Myndband.
4. **Það sem Egill gerir:** stýring, köll og „Hraðar!“. Myndband þar sem allt er notað og annað þar sem ekkert er snert.
5. **Upphaf kaflans:** frá tjörn Þórseðlu að hvíta trénu, kortastundin og boðið (bíður kaflaskiptingarinnar, 9. kafli). Myndband.
6. **Vindurinn:** verkefnið, flugtakið, stjarnan og Egill upp á bakið. Myndband.
7. **Hljóð og raddir:**
   - rödd Flugeðlu hönnuð og valin (getur byrjað samhliða búti 1);
   - allar línur teknar upp og hlustaðar;
   - vindurinn og vatnið, eftir leyfi til niðurhals;
   - flugstefið ef eigandinn hefur gert það.
8. **Lendingin og endirinn:** fjarlæga tjörnin, Mosi másandi, lúðurtónninn, bókin og stjarnan, vistunin og kortið. Heil spilun frá
   byrjun til enda, mælingar og öll prófin græn.

**Lokið** er þegar kaflinn spilast frá byrjun til enda á greininni, prófin eru græn og eigandinn hefur séð og samþykkt.

## 11. Opið

- **Persóna og rödd Flugeðlu:** „kát og frjálsleg, elskar hraða“ er tillaga sem eigandinn staðfestir eða breytir áður en raddir eru
  hannaðar.
- **Stærð Flugeðlu:** 7,5 m eða 10 m, ákveðin eftir myndum í búti 1.
- **Smáleikur Flugeðlu:** óákveðinn. Hann fær eigin forskrift og vinnutré, eins og Veiddu.
- **Flugstefið:** Suno-lag eigandans. Þangað til er notað bráðabirgðastef.
