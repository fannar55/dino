# Söngur Slóeðlu: fjölspil (hönnun)

31. október 2026. Staða: **drög til yfirlestrar eigandans.** Engin smíði fyrr en lýsingin og útfærsluáætlunin eru samþykktar.
Grein: `sloedla-lag`. Byggir á Fjölspilinu sem er í `main` (`2026-10-24-fjolspil-design.md`: QR-kóði, sæti, WebRTC, varaleið
um þjóninn, endurtenging) og á valmyndinni á sviðinu (`2026-10-31-sloedla-valmynd-svid-design.md`). Það sem stendur ekki hér er
óbreytt þaðan.

## 1. Markmið

Egill spilar lag með pabba, mömmu eða vini: hver tekur sína eðlu og slær á sínu tæki, en hljómsveitin spilar á stóra skjánum.
Velgengni lítur svona út:

- Gestur skannar QR-kóðann, skrifar nafnið sitt, velur lausa eðlu og svarar „Krakki eða fullorðinn?“ á undir 20 sekúndum.
- Högg gestsins er dæmt jafn rétt og högg Egils á stóra skjánum, þótt það komi yfir netið.
- Gesturinn sér orðið („Frábært!“) um leið og hann slær, og finnur það í símanum.
- Fullorðinn og barn spila sama lagið saman, hvort á sínu stigi.
- Einn að spila er eins og í dag.

## 2. Ákvarðanir eigandans (31. október 2026)

1. **Tæki gestsins** getur verið sími eða spjaldtölva; skjárinn lagar sig sjálfur að tækinu.
2. **Mest þrír spilarar,** því brautirnar eru þrjár.
3. **Sími:** aðeins braut gestsins; nóturnar falla á stóran púða eðlunnar. **Spjaldtölva:** allt sviðið, en aðeins braut gestsins
   lýst og virk.
4. **„Krakki eða fullorðinn?“** er spurt þegar gestur kemur inn; fullorðnir fá erfiðu röðina í sama laginu.
5. **Egill velur fyrst** hvaða eðlu hann spilar; svo geta tveir komið og valið það sem er laust.
6. **Egill spilar alltaf eðlu sem enginn tekur:** komi bara einn að hjálpa spilar Egill tvær eðlur.
7. **Leið 1:** stóri skjárinn dæmir öll högg; tækin samstilla klukkur; gesturinn stimplar hvert högg með sameiginlegu klukkunni og
   sýnir dóminn strax sjálfur, eftir sömu reglum, með titringi; tónlistin hljómar aðeins á stóra skjánum. (Hinar leiðirnar, sem
   eigandinn valdi ekki: hvert tæki spilar sína tónlist, eða gesturinn dæmir sig sjálfur og stóri skjárinn trúir honum.)
8. **Stig í fjölspili telja með** í metum Egils.

Það sem eigandinn andmælti ekki þegar það var lagt fram: gestir komast bara inn í valmyndinni, ekki í miðju lagi; hver braut
fellur á hraða síns spilara; detti gestur út tekur Egill eðluna hans; með „2 eðlur“ kemst aðeins einn gestur að; ein
stjörnugjöf fyrir hljómsveitina, og lokaskjárinn sýnir línu fyrir hvern.

## 3. Flæðið

1. **Skref 1** fær hnappinn **„Spilum saman“** (með litlu QR-tákni) við hlið hinna valanna. Barn/Fullorðinn segir áfram til um
   stig Egils og „3 eðlur / 2 eðlur“ hve margar brautir eru.
2. **„Spilum saman“:** DJ-inn segir `saman` (kafli 10) og eðlurnar á sviðinu líta fram. Yfir sviðinu stendur „Hvaða eðlu spilar
   þú?“; Egill bankar á eðlu (í 3D eða á myndunum) og hún stekkur fram, fagnar og fær nafnspjaldið „Egill“. Hann getur bankað á
   aðra lausa eðlu til að skipta.
3. **QR-spjaldið** kemur inn í horni sviðsins: ljóst spjald með QR-kóðanum (dökkur á ljósu, minnst 28% af styttri hlið skjásins),
   fjögurra stafa kóðanum undir og „Skannaðu til að spila með“. Lausar eðlur bera nafnspjaldið „Laus“, dauft.
4. **Gestur** skannar og fær síðu Fjölspilsins (`spil.html?r=KÓÐI`): nafn, svo **aðeins lausu eðlurnar** úr laginu (ekki vinirnir
   sex), svo **„Krakki eða fullorðinn?“** (tveir stórir hnappar með andlitum, eins og í skrefi 1), og „Tilbúin/n“. Síminn man nafn,
   eðlu og stig til næsta skiptis.
5. **Á stóra skjánum** fær eðla gestsins nafnspjaldið hans með neistum og bjöllu, hún fagnar og ljósið hennar blikkar, og DJ-inn
   segir `kom` (kafli 10). Taki gestur eðlu sem Egill hafði valið sér, gerist það ekki: valin eðla Egils er aldrei í boði.
6. **„Veljum lag →“** og lagavalið eru eins og í dag, og aðeins á stóra skjánum. QR-spjaldið minnkar í horninu í skrefi 2, og
   gestir geta enn komið inn þar. Gesturinn sér „Egill velur lag…“, og mynd og nafn lagsins um leið og spjald er valið.
7. **„Spila!“** lokar herberginu fyrir nýjum gestum á meðan lagið er spilað. Gestirnir sjá hleðsluna sem „Tilbúin!“ með mynd
   lagsins og nóturnar byrja að falla hjá þeim á sama augnabliki og á stóra skjánum.
8. **Lokaskjárinn** (kafli 9). „Spilum aftur“ og „Annað lag“ eru á stóra skjánum; sætin haldast og gestir bíða. Í valmyndinni
   geta nýir gestir komið aftur inn, upp að hámarkinu.
9. **„Spila einn“** í skrefi 1 (í stað „Spilum saman“ meðan herbergið er opið) lokar fjölspilinu: gestirnir sjá „Takk fyrir að
   spila!“ og allar eðlurnar verða Egils aftur.

Meðan gestur á Kambeðlu er hnappurinn „2 eðlur“ daufur á stóra skjánum, svo enginn missi eðluna sína óvart.

## 4. Sætin og eðlurnar

- **Sætin eru Fjölspilsins** (`seats.js`): Egill í sæti 0, gestir í hinum. Hámark: 3 sæti með „3 eðlur“, 2 með „2 eðlur“.
- **Eðla gests er avatar hans,** með sömu auðkennum og Fjölspilið hefur: `kambedla` → braut `b`, `sloedla` → `a`, `thorsedla` →
  `c`. Hinir vinirnir þrír (`gramedla`, `flugedla`, `uggedla`) eru aldrei í boði í söngleiknum, ekki heldur eðla Egils, né
  Kambeðla með „2 eðlur“.
- **Hvert sæti fær stig** (`level`: `barn` eða `fullordinn`). Egils er valið í skrefi 1; gestsins kemur með `hello`.
- **Brautirnar skiptast svona:** hver gestur spilar braut eðlunnar sinnar; Egill spilar sína eðlu og **allar sem enginn gestur
  á**, á sínu stigi.
- **Endurtenging:** gestur sem kemur aftur með sama auðkenni fær sætið sitt og eðluna aftur (eins og í Fjölspilinu). Endurhlaði
  stóri skjárinn opnast sama herbergið (eigin lykill í `sessionStorage`, `mosi-fjolspil-sloedla`, eins og Litla Yatzy hefur sinn),
  og gestirnir fá sætin aftur sjálfkrafa þegar þeir segja `hello` aftur, því tækin muna nafn, eðlu og stig.

## 5. Tími og högg

### 5.1 Sameiginleg klukka

- Gesturinn spyr stóra skjáinn hvað klukkan er: `time { sent }` → `time { sent, host }`, þar sem `sent` er klukka gestsins
  (`performance.now()`) og `host` klukka stóra skjásins. Þegar svarið kemur er munurinn `host − (sent + kom)/2`, og ferðin
  `kom − sent`.
- **Áður en lag byrjar** (við komu og þegar „Spila!“ er pikkað): átta spurningar með 50 ms millibili; munurinn úr stystu ferðinni
  gildir.
- **Meðan lagið spilast** spyr gesturinn einu sinni á sekúndu. Svar úr ferð sem er ekki meira en 10 ms lengri en sú stysta hingað
  til færir muninn mjúklega (í mesta lagi 2 ms í hvert sinn), svo klukkurnar skríði ekki í sundur. Þessar spurningar eru líka
  lífsmark gestsins (kafli 8).
- **Hvar lagið er statt:** stóri skjárinn sendir við byrjun og á tveggja sekúndna fresti `clock { at, song }`: á klukkunni sinni
  `at` heyrist staður `song` í laginu (úr klukku lagsins, `song-clock.js`, með seinkun hljóðsins). Gesturinn reiknar tíma lagsins
  hjá sér út frá því og muninum.

### 5.2 Nóturnar til gestsins

Söngleikurinn ákveður hvern kafla á meðan lagið spilast (rólegur, venjulegur eða stór eftir því hvernig hljómsveitinni gengur),
um það bil fall nótunnar plús 0,7 s á undan. Því fær gesturinn nóturnar jafnóðum: um leið og kafli er ákveðinn sendir stóri
skjárinn `notes { section, list }` með nótum kaflans (`{ index, t, lane }`, `index` númer nótunnar í laginu). Á síma eru það
nótur brautar gestsins, á spjaldtölvu allra brautanna. Þær eru komnar 2,3–3 s áður en þær eiga að falla, svo netið hefur
nægan tíma.

### 5.3 Högg gestsins

- Gesturinn tekur tíma höggsins af snertingunni (`event.timeStamp`), breytir honum í klukku stóra skjásins og sendir
  `act { type: 'tap', at }`.
- **Gesturinn dæmir strax sjálfur** með sömu reglum og sama glugga og stóri skjárinn (`createJudge`, gluggar stigsins, miðja sem
  eltir spilarann), og sýnir orðið, neistana og púðann eins og leikurinn gerir, með titringi: 15 ms við högg, 30 ms við
  „Fullkomið!“ og „Frábært!“, ekkert við villu.
- **Stóri skjárinn dæmir** sama stimpil með klukku lagsins og á lokaorðið. Hann sendir gestinum `played { index, word, points }`
  fyrir hverja nótu brautarinnar (á spjaldtölvu allra brautanna, svo hinar nóturnar springi eða dofni þar líka). Greini þá á,
  sem gerist nær aldrei, helst ef höggið kom of seint (sjá næsta lið), stendur orðið sem gesturinn sá, en stigin og staða nótunnar fylgja
  stóra skjánum.
- **Biðtími fyrir netið:** stóri skjárinn lætur nótu á braut gests ekki fara sem missta fyrr en 0,3 s eftir að glugginn lokast,
  svo högg sem var á réttum tíma en kom seint telji. Högg sem kemur seinna en það telur ekki. Á braut Egils er engin bið.
- **Miðjan sem eltir spilarann** (`RECENTRE`: miðgildi síðustu átta högga) er reiknuð fyrir hvern spilara sér, því hvert tæki og
  hver spilari er misfljótur.

### 5.4 Hljóðið

Tónlistin og tónar högganna hljóma aðeins á stóra skjánum. Á heimaneti er höggið um 5–30 ms á leiðinni. Högg sem kemur á undan
slaginu hljómar á slaginu, eins og í dag; högg sem kemur eftir slagið hljómar strax. Krakkar slá oftast aðeins á undan, svo flest
högg hljóma á réttum tíma. Gestatækin gefa ekkert hljóð í laginu, bara titring.

### 5.5 Skilaboðin

Ofan á skilaboð Fjölspilsins (`hello`, `act`, `seat`, `view`, `ping`/`pong`):

| Frá | Skilaboð | Hvað |
|---|---|---|
| gestur | `hello { name, avatar, level }` | `level` er nýtt; leikir án þess hunsa það. |
| gestur | `act { type: 'tap', at }` | Högg, á klukku stóra skjásins (ms). |
| gestur | `act { type: 'level', level }` | Gestur skiptir um stig í valmyndinni. |
| gestur | `time { sent }` | Klukkuspurning; líka lífsmark í laginu. |
| stóri skjár | `time { sent, host }` | Svarið. |
| stóri skjár | `view { screen: 'sloedla', … }` | Hvað gestur sér í valmyndinni og á lokaskjánum (kafli 7). |
| stóri skjár | `song { kind: 'start' \| 'clock' \| 'notes' \| 'played' \| 'end', … }` | Lagið sjálft: byrjun með laginu, stigi og brautum; klukka; nótur; dómar; lok. |

`song`-skilaboðin eru ekki „heil mynd“ eins og `view`, heldur straumur í röð (WebRTC-rásin er í röð og áreiðanleg). Gestur sem
tengist aftur í miðju lagi fær ekki strauminn aftur; hann fær nýjasta `view` (kafli 8).

## 6. Leikurinn á stóra skjánum

- **Stig á hverri braut:** röð nótnanna (þéttari hjá fullorðnum, `GAP`), fallhraðinn (`fall`) og gluggarnir (`LEVELS`) fylgja
  stigi þess sem spilar brautina. Hver braut fellur á hraða síns spilara; í sama laginu getur ein braut verið fullorðins og hinar
  barns.
- **Stjörnumælirinn** fyllist um 1/15 við högg á barnabraut og 1/30 á fullorðinsbraut (`meter` hvors stigs), svo báðir leggi sitt
  af mörkum.
- **Egill slær aðeins á sínar brautir** á stóra skjánum. Braut gests ber nafnspjald hans neðst við púðann, og pikk Egils þar gerir
  ekkert (er ekki villa).
- **Allt annað er eins og í dag** þegar gestur slær: eðlan syngur, hoppar, orðið birtist, áhorfendur og ljós svara.
- Einn að spila: allar brautir á stigi Egils, engin breyting.

## 7. Skjár gestsins

Gestasíðan (`spil.html`) fær skjá söngleiksins, `sloedla`.

- **Tækið** er sími ef styttri hlið skjásins er undir 600 CSS-dílum, annars spjaldtölva. `?taeki=simi|spjald` velur sjálft
  (prófun).
- **Sími:** aðeins braut gestsins, sem fyllir skjáinn. Nóturnar falla á **stóran púða eðlunnar** neðst (um þriðjungur af breidd
  skjásins í þvermál); neðri helmingur skjásins tekur við höggi. Nafnið og eðlan efst. Kvöldhiminn leiksins á bak við, án
  áhorfenda.
- **Spjaldtölva:** allt sviðið eins og á stóra skjánum, bakgrunnur, himinn, brautirnar þrjár og eðlurnar. Braut gestsins er lýst
  og tekur við höggi; hinar eru dimmar, nótur þeirra falla og springa eftir dómum stóra skjásins.
- **Teikningin** er leiksins sjálfs (`game.js`), án tónlistar: nóturnar koma frá stóra skjánum, tími lagsins úr sameiginlegu
  klukkunni.
- **Í valmyndinni:** eðla gestsins með nafninu hans, stigið hans (sem hann getur skipt um með tveimur hnöppum) og „Egill velur
  lag…“, eða mynd og nafn lagsins þegar það er valið.
- **Á lokaskjánum:** stjörnur hljómsveitarinnar og lína gestsins (kafli 9), svo „Bíðum eftir næsta lagi…“.
- **Skjárinn slokknar ekki** meðan lag er spilað (`navigator.wakeLock`, þar sem vafrinn leyfir).
- iPhone titrar ekki úr vafra; þar kemur aðeins orðið og ljósið.

## 8. Dettur út og kemur aftur

- **Í valmyndinni** gildir Fjölspilið: gestur sem fer heldur sætinu, nafnspjaldið hans dofnar með „…“, og hann fær það aftur
  þegar hann kemur.
- **Í laginu:** heyrist ekkert frá gesti í 3 sekúndur (engin klukkuspurning), eða lokast rásin, **tekur Egill eðluna hans** til
  loka lagsins: nafnspjaldið verður „Egill“ með blikki og brautin tekur við snertingu Egils. Nótur sem fóru á meðan teljast
  missta, eins og hjá hverjum spilara.
- **Komi hann aftur í miðju lagi** sér hann „Þú kemst inn í næsta lagi!“ og eðluna sína; hann fær hana aftur í valmyndinni.
- **Endurhlaði stóri skjárinn** í miðju lagi fer lagið, og allir fara í valmyndina með sömu sætum (kafli 4).

## 9. Lok og met

- **Ein stjörnugjöf fyrir hljómsveitina,** eins og í dag (stig allra brautanna saman), og hún **telur í metum Egils** undir lagi
  og stigi Egils (`best.js`), eins og einspil. Gestir eiga engin met á sínum tækjum.
- **Lokaskjárinn á stóra skjánum** bætir við línu fyrir hvern spilara undir stjörnunum, eftir að þær hafa lent og áður en
  hnapparnir rísa: eðlan (eða eðlurnar, hjá Agli), nafnið, stigin og hve oft „Fullkomið!“ og „Frábært!“ komu. Línurnar rísa inn
  ein af annarri með bjöllu.
- **Gesturinn** sér stjörnur hljómsveitarinnar og sína línu.
- Einn að spila: lokaskjárinn eins og í dag, án línanna.

## 10. DJ-inn

Sama rödd og verklag og áður (`tools/sloedla-dj.mjs`, Claude tekur upp og hlustar sjálfur). Tvær eða þrjár útgáfur hverrar línu.

| Lykill | Hvenær | Línur |
|---|---|---|
| `saman` | „Spilum saman“ pikkað | „Fáum vini með! Skannið kóðann!“ · „Hver vill spila með?“ |
| `kom` | Gestur tekur eðlu | „Nýr spilari kominn!“ · „Velkomin í hljómsveitina!“ |

DJ-inn segir ekkert þegar Egill tekur eðlu gests í miðju lagi.

## 11. Smíði

- **`engine/sloedla/v2/chart.js`, `v2/player.js`:** stig fyrir hverja braut (`levels: { b, a, c }`) í stað eins stigs fyrir
  allar; nóturnar hverrar brautar eftir stigi hennar; `decideAhead` eftir lengsta fallinu. Einspil gefur öllum brautum sama stig.
- **`engine/sloedla/game.js`:** gluggar, fall, miðja og stjörnumælir á hverja braut; brautir sem Egill má ekki slá á; biðtími
  fyrir brautir gesta; lína hvers spilara í niðurstöðunni; leikur sem keyrir án tónlistar fyrir gestinn (nótur og dómar að utan).
- **`engine/sloedla/clock-sync.js` (nýtt, hreint):** munur klukkna úr spurningum, mjúk færsla, tími lagsins út frá `clock`.
- **`engine/sloedla/lineup.js` (nýtt, hreint):** sætin á eðlurnar: hvaða eðlur eru í boði, hver spilar hverja braut og á hvaða
  stigi, Egill tekur afganginn og þær sem detta út.
- **`engine/sloedla/fjolspil-song.js` (nýtt):** stóri skjárinn í fjölspili: opnar herbergið með `createFjolspil` (eigin
  `storageKey`), svarar klukkuspurningum, sendir `view` og `song`, tekur við höggum og lífsmarki, og segir leiknum hvenær Egill
  tekur braut.
- **`engine/sloedla/menu.js`, `menu-view.js`, `stage.js`, `stage-flat.js`, `sloedla-lab.html`, `sloedla.css`:** „Spilum saman“ /
  „Spila einn“, „Hvaða eðlu spilar þú?“ og bank á eðlu, QR-spjaldið, nafnspjöldin undir eðlunum, línurnar á lokaskjánum.
- **`engine/sloedla/lab.js`:** umferðin með stigum brautanna og gestunum; met undir stigi Egils.
- **`engine/fjolspil/seats.js`:** `level` á sæti (með í `snapshot`), og `join` tekur við því.
- **`engine/fjolspil/protocol.js`, `net.js`, `fjolspil.js`:** skilaboðin `time` og `song` (kafli 5.5) og `level` í `hello`;
  aðrir leikir finna engan mun.
- **`engine/fjolspil/guest.js`:** lobbí-myndin getur sagt hvaða avatara leikurinn býður (þá sjást aðeins þeir) og beðið um stig
  („Krakki eða fullorðinn?“); síminn man stigið.
- **`engine/fjolspil/guest-sloedla.js` (nýtt), `spil.html`:** skjár gestsins (kafli 7): sími eða spjaldtölva, klukkan, nóturnar,
  dómurinn, titringurinn, skjárinn vakandi.
- **`engine/sloedla/dj.js`, `assets/audio/sloedla/dj/`:** línurnar `saman` og `kom`.
- **Minni hreyfing** gildir eins og áður; á gestatækinu engin neistaflug eða skjálfti, orðin og púðinn halda sér.

## 12. Villur og jaðartilvik

| Tilvik | Hvað gerist |
|---|---|
| Þjónninn án `--lan` | QR-spjaldið segir það (eins og lobbí Fjölspilsins); einspil virkar. |
| Allar eðlur teknar | Síminn segir „Allar eðlurnar eru í notkun“ og bíður; komist sæti laust kemst hann inn. |
| Tveir velja sömu eðlu í einu | Sá fyrri fær hana; hinn fær valið aftur með hana dauft (`avatar-taken`). |
| Egill velur „2 eðlur“ meðan gestur á Kambeðlu | Hnappurinn er daufur og gerir ekkert. |
| WebRTC næst ekki | Varaleiðin um þjóninn (Fjölspilið); dómurinn er samt réttur, tónninn getur heyrst seinna. |
| Högg kemur eftir biðtímann | Telur ekki; gesturinn sá orðið sitt, en stigin fylgja stóra skjánum. |
| Gestur læsir símanum í laginu | Egill tekur eðluna (kafli 8). |
| Stóri skjárinn endurhleðst | Sama herbergi, sætin aftur; lag sem var í gangi hættir. |
| Gestur pikkar áður en lagið byrjar | Ekkert gerist. |
| Klukkuspurningum er ekki svarað | Gesturinn bíður með „Tengist…“ og byrjar ekki lagið fyrr en klukkan er komin. |

## 13. Prófun

Fá, stutt próf á það sem spilararnir finna:

- **Klukkan:** úr spurningum með misjafnar ferðir gildir sú stysta; með föstum mun breytist stimpill í rétta stund lagsins innan
  5 ms; munurinn færist í mesta lagi 2 ms í einu.
- **Sætin:** eðla Egils er ekki í boði; með „2 eðlur“ ekki Kambeðla; mest tveir gestir (einn með „2 eðlur“); hver eðla sem enginn
  á er Egils; braut gests sem dettur út verður Egils.
- **Stig á braut:** í sama laginu fær fullorðinsbraut fleiri nótur en barnabraut og fellur hraðar; hver braut er dæmd með
  gluggum síns stigs; einspil gefur sömu nótur og í dag.
- **Högg yfir netið:** högg á réttum tíma sem kemur 0,25 s eftir að glugginn lokast telur; 0,35 s eftir ekki; pikk Egils á braut
  gests gerir ekkert.
- **Sami dómur:** gesturinn og stóri skjárinn gefa sama orð fyrir sama stimpil.
- **Tækið:** 390×844 er sími, 1180×820 spjaldtölva.
- **Met:** lag í fjölspili fer í met Egils á hans stigi.
- **Í huldum vafra:** stóri skjárinn og tveir gestir (sími 390×844 og spjaldtölva 1180×820) á `localhost` með þjóni Fjölspilsins;
  gestirnir ganga inn, lag er spilað með högg send á tíma, og orðin passa á báðum. Skjámyndir af QR-spjaldinu, nafnspjöldunum,
  skjá símans og spjaldtölvunnar og lokalínunum til eigandans.
- **Handprófun eigandans:** alvöru sími og spjaldtölva yfir Wi-Fi heima, með gátlista í áætluninni.

## 14. Utan verksins

- Gestur kemur inn í miðju lagi; fleiri en þrír spilarar.
- Tónlist eða hljóð á gestatækinu.
- Gestur velur lag; met á tæki gestsins.
- Spil yfir netið að heiman er ekki prófað sérstaklega (það virkar með skýinu, en tónninn getur heyrst seinna).
- Fjölspil söngleiksins í aðalleiknum (þetta er tilraunasíðan).

## 15. Opið

- Línur DJ-sins í kafla 10 eru tillögur; eigandinn heyrir þær og getur breytt orðalagi.
- Á lokaskjánum: á að telja „Fullkomið!“ og „Frábært!“ saman, eða sýna bara stigin hvers og eins?
