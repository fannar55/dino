# Söngur Slóeðlu: valmyndin á lifandi sviði (hönnun)

31. október 2026. Staða: **drög til yfirlestrar eigandans.** Engin smíði fyrr en lýsingin og útfærsluáætlunin eru samþykktar.
Grein: `sloedla-lag`. Tekur við útliti valmyndarinnar úr `2026-10-30-sloedla-valmynd-design.md`; flæðið þaðan (skref 1, skref 2,
umferð, lokahnappar), DJ-línurnar, lagabrotin, myndir spjaldanna og metin standa óbreytt nema annað sé sagt hér.

Prufan sem eigandinn valdi úr er utan git: `qa/remake/sloedla/valmynd-mock/svid.html` (http://localhost:4231/qa/remake/sloedla/valmynd-mock/svid.html,
`?skjar=lag|hlada|lok` opnar skjá beint). Þessi lýsing segir hvað úr henni fer inn í leikinn og hvernig.

## 1. Af hverju

Eigandinn: valmyndin er „mjög úr takt við leikinn sem er orðinn svo flottur“; hann vill „líf og juice“ líka þar. Í dag er hún
flatt spjald á dökkbláum grunni með rjómalituðum hnöppum; umferðin sjálf er kvöld í Feninu með norðurljósum, kastljósum, 3D-stjörnum
og regnbogaletri. Hann bað um prufur fyrst, valdi alla fjóra skjáina (hver spilar, lagaval, hleðsla á milli, hnappar á lokaskjá) og
svo leið A, lifandi 3D-svið, fram yfir B, sama svið með flötum myndum.

## 2. Ákvarðanir eigandans

1. **Allir fjórir skjáirnir:** skref 1 (hver spilar), skref 2 (lagaval), hleðslan á milli, hnapparnir á lokaskjánum.
2. **Leið A:** sviðið er lifandi 3D með Tripo-persónum leiksins (Egill, Kambeðla, Slóeðla, Þórseðla) og þeirra eigin hreyfingum.
3. **Prufan er stefnan** („Já, skrifaðu hana“ eftir að hafa séð allt flæðið í fartölvu- og símastærð).
4. Engar myndir eftir Claude (gildir áfram): allt á sviðinu er úr leiknum, eða Openclipart-myndir sem eigandinn valdi. Nýir hlutir
   koma frá eigandanum úr Tripo3D (sjá 11).

## 3. Sviðið

Ein sena undir allri valmyndinni, sama kvöldið og í umferðinni:

- **Bakgrunnur:** Fenið í kvöldbirtu (`assets/sloedla/kvold-fen.webp`, upprétt `kvold-fen-upright.webp` á síma), dekkt að nóttu
  eins og í leiknum, norðurljós sem líða hægt og stjörnur sem tindra á himninum.
- **Persónurnar í 3D** (`assets/characters/*.glb`, three.js eins og stjörnurnar): Egill fremst til vinstri, Kambeðla, Slóeðla og
  Þórseðla í röð, hver með mjúkan skugga og **sitt kastljós** ofan frá niður að fótunum. Þær anda og líta í kring (`idle`) og
  bregðast við því sem barnið velur (sjá 4–5).
- **Titillinn** „Söngur Slóeðlu“ í letri leiksins (`text.js` `drawWord`, regnbogi, stafirnir skoppa inn og vagga). Fyrirsögnin
  er áfram til í HTML fyrir skjálesara, en falin.
- **DJ-inn** áfram í horninu (myndin og talblaðran); myndin dillar sér hraðar á meðan hann talar.
- **„Myndavélin“:** sviðið færist sem heild á milli skjáa (um 1 s, mjúkt): upp í skrefi 2 svo spjöldin komist fyrir undir
  persónunum, niður og nær í hleðslunni. Himinninn og norðurljósin standa kyrr, svo hreyfingin sést. Á síma standa persónurnar
  þéttar og Egill fremst.
- **Hnapparnir** í stíl stikunnar og stjarnanna: dökkt gler með ljósri brún; valinn hnappur verður gylltur og glóir; aðalhnappurinn
  („Veljum lag →“, „Spila!“, „Spilum aftur“) er stór, gylltur, andar og glampi rennur yfir hann.
- **Hljóð valmyndarinnar** eru bjöllur leiksins (`sounds.js`): `sparkle` við val, `tick` í hleðslunni, `star(5)` við „Byrjum!“.

## 4. Skref 1: Hver spilar?

- Hnapparnir neðst: **Barn / Fullorðinn** (andlit sem tákn), **3 eðlur / 2 eðlur**, og **„Veljum lag →“**. Í breiðum skjá í einni
  röð, á síma hver undir öðrum. Þeir rísa inn neðan frá.
- **Sviðið svarar valinu:**
  - **Fullorðinn:** Egill sest (`sit`) og dökknar (eins og sofandi vinur í leiknum) og ljósið hans slokknar. **Barn:** hann stendur
    upp og veifar.
  - **2 eðlur:** Kambeðla fer að bíta gras (`eat`), dökknar og ljósið hennar slokknar. **3 eðlur:** hún gleðst (`happy`) og kemur
    aftur.
  - Slóeðla kallar (`call`) og Þórseðla gleðst (`happy`) við hvert val.
- **DJ-inn segir valið** (nýjar línur, sjá 8), með bjöllu. Sé fyrsta pikk barnsins val hér segir hann línu valsins í stað
  kveðjunnar („Hæ! Hver ætlar að spila í dag?“), ekki báðar.

## 5. Skref 2: Lagaval

- Sviðið rennur upp; **spjöldin fljúga inn** neðan frá, eitt af öðru (um 0,09 s á milli), og bjalla hringir þegar hvert lendir,
  hærra og hærra.
- **Spjaldið:** dökkt gler í lit lagsins með ljósri brún og ljóma. Myndin stendur upp úr spjaldinu ofan við brúnina, á ljóshring
  í lit lagsins. Undir henni nafn lagsins, „Lag eftir pabba“ ef lagið á slíka línu, metið í **fimm stjörnum** (unnar gylltar og
  glóandi, hinar daufar) og „Met: 7.480“ ef það er til. Í breiðum skjá standa spjöldin í einni röð, á síma tvö og tvö.
- **Pikkað á spjald:**
  - Það lyftist, skoppar og glóir; hin dofna og minnka aðeins. Neistar í lit lagsins (`menu-sparks.js`).
  - DJ-inn segir línu lagsins og **brotið spilar og endurtekur sig** meðan spjaldið er valið (í dag spilar það einu sinni).
  - **Allir á sviðinu dansa í takt við brotið:** hreyfing hverrar persónu (`happy`, Egill `hop`) er bundin við taktinn í brotinu
    (hvar í hreyfingunni hún er ræðst af slaginu, ekki af klukku), og hver þeirra fjaðrar á hverju slagi. Sú sem er utan
    umferðarinnar (2 eðlur, Fullorðinn) dansar ekki.
  - Kastljósin taka lit lagsins og blikka á slaginu; myndin á valda spjaldinu hoppar á slaginu.
  - **„Spila!“** skoppar inn við hliðina á „← Til baka“.
- Pikkað aftur á sama spjald: það skoppar og neistar, en hvorki DJ-línan né brotið byrja upp á nýtt. Pikkað á annað spjald skiptir
  um lag, línu, brot, lit og dans.
- **„← Til baka“:** brotið hættir, ljósin verða hvít aftur, sviðið rennur niður í skref 1.

## 6. Hleðslan á milli

Þegar „Spila!“ er pikkað er lagið sótt og afkóðað (rásirnar ein í einu, eins og í dag). Biðin verður sýning:

- Brotið dofnar; sviðið rennur niður og nær, hringur af myrkri leggst um jaðrana, persónurnar fagna hver á eftir annarri.
- **Diskur lagsins** svífur upp á mitt sviðið ofan við persónurnar: mynd lagsins á kringlu í lit lagsins, sem vaggar, með ljóma
  í kring. **Gylltur hringur** um diskinn fyllist eftir því sem rásirnar koma inn (hlutfall rása sem eru komnar), með **stjörnu á
  oddinum**, og lítil bjalla tifar, hærra og hærra, á hverjum tíunda hluta.
- **Nafn lagsins** í regnbogaletri undir diskinum, og „Lag eftir pabba“ undir því ef lagið á línuna.
- **DJ-inn:** ný lína, `tilbuin` (sjá 8). „Byrjum!“ er án raddar, af því leikurinn lætur hann segja byrjunarlínu um leið og
  lagið hefst (`byrjun`); annars talaði hann tvisvar í röð.
- **Þegar allt er komið:** „Byrjum!“ í stórum regnbogastöfum yfir diskinum, `star(5)`-hljómurinn, neistar, allir fagna. Eftir um
  0,9 s fer hvítt leiftur yfir og umferðin tekur við.
- **Lágmark:** hringurinn er aldrei á undan því sem raunverulega er komið, og fyllist ekki hraðar en á 1,5 s, svo hleðslan sést
  sem sýning en ekki blikk. Hann gengur jafnt: sýnda hlutfallið eltir það raunverulega og hoppar ekki. „Byrjum!“ kemur ekki fyrr
  en DJ-inn hefur lokið `tilbuin`-línunni, svo byrjunarlína umferðarinnar lendi ekki ofan í henni.
- **„Spilum aftur“** fer líka í gegnum hleðsluna, en lagið er þegar komið: hringurinn er fullur strax, og aðeins diskurinn og
  „Byrjum!“ sjást (um 1,2 s), engin DJ-lína.
- Á meðan umferðin er spiluð er sviðið hulið og teiknar ekkert (rafhlaða spjaldtölvunnar).

## 7. Hnappar á lokaskjá

- Lokaskjárinn sjálfur (stjörnurnar, stigin, „Lengsta röð“, „Nýtt met!“) er óbreyttur.
- **Eðluhringirnir neðst sökkva burt** þegar stjörnurnar hafa lent, áður en hnapparnir koma, svo hnapparnir standi á dimmu gólfi en
  ekki ofan á eðlunum.
- **Orðin** („Slóeðla syngur með þér á hátíðinni!“ eða „Viltu spila aftur?“) í letri leiksins (rjómalituð, vagga), ofan við
  hnappana.
- **„Spilum aftur“:** stór, gylltur, andar; örin snýst einn hring þegar hann birtist (og þegar bent er á hann). Sama lag, sömu
  stillingar, í gegnum stuttu hleðsluna (sjá 6).
- **„Annað lag“:** glerhnappur með myndum laganna í litlum blævæng. Fer í skref 2: sviðið kemur aftur og spjöldin fljúga inn.
- Hnapparnir rísa inn rétt á eftir orðunum, með tveimur bjöllum. Í breiðum skjá hlið við hlið, á síma hvor undir öðrum.

## 8. DJ-inn: nýjar línur

Sama rödd („DJ 1“), tekin upp með `tools/sloedla-dj.mjs` (Claude tekur upp og hlustar sjálfur; lykillinn úr umhverfinu, aldrei
prentaður). Tvær til þrjár útgáfur hverrar línu; aldrei sama útgáfan tvisvar í röð.

| Lykill | Hvenær | Línur |
|---|---|---|
| `barn` | Barn valið | „Egill spilar, frábært!“ · „Já, Egill spilar!“ |
| `fullordinn` | Fullorðinn valinn | „Fullorðinn spilar, til í þetta?“ · „Nú spila þau fullorðnu!“ |
| `thrjar` | 3 eðlur valdar | „Allar þrjár eðlurnar með!“ · „Kambeðla, Slóeðla og Þórseðla!“ |
| `tvaer` | 2 eðlur valdar | „Slóeðla og Þórseðla spila!“ · „Tvær eðlur í dag!“ |
| `tilbuin` | Hleðslan byrjar (ekki við „Spilum aftur“) | „Eru allir tilbúnir?“ · „Gerum okkur klár!“ · „Allir á sinn stað!“ |

Línurnar úr fyrri lýsingu (`hverspilar`, `hvadalag`, `lag-<id>`) standa. Pikki barnið hratt klippir hann á línuna og segir þá nýju.

## 9. Smíði

- **`engine/sloedla/stage.js` (nýtt):** sviðið í 3D: three.js á sínum eigin striga, persónurnar úr GLB, skuggar, ljós; segir hvar
  fætur hverrar persónu eru á skjánum (fyrir kastljósin). Hleðst með `import()` eins og `star-view.js`, svo leikurinn og prófin
  flytja aldrei inn three.js. Persónurnar koma inn ein af annarri eftir því sem þær hlaðast (um 8,6 MB alls, lesið á meðan skref 1
  sést); valmyndin virkar áður en þær eru komnar. Teiknar aðeins meðan valmyndin sést, mest 1,5 dílar á CSS-díl.
- **`engine/sloedla/stage-motion.js` (nýtt, hrein stærðfræði):** fjöðrunin á slaginu, hve mörg slög hreyfing nær yfir (veldi af
  tveimur sem næst lengd hennar), hvar í hreyfingunni persónan er á tilteknu slagi, og hlutfallið sem hleðsluhringurinn sýnir
  (eltir það raunverulega, aldrei á undan því, aldrei hraðar en lágmarkið).
- **`engine/sloedla/brot.js`:** brotið endurtekur sig; það fær takt lagsins með sér, og `beats()` segir hve mörg slög eru liðin í
  því (brotin byrja öll á slagi), `null` þegar ekkert spilar.
- **`v2/songs/index.js`:** hver færsla fær `bpm` (sama og `tempo.bpm` lagsins), svo valmyndin viti taktinn án þess að hlaða laginu.
- **`engine/sloedla/menu.js`:** valin í skrefi 1 skila DJ-línu (`barn`, `fullordinn`, `thrjar`, `tvaer`), og fyrsta pikk sem er
  val gefur ekki líka kveðjuna; „Spila!“ skilar `tilbuin`; „Spilum aftur“ fær sína eigin aðgerð sem skilar engri línu.
- **`engine/sloedla/menu-view.js`, `sloedla-lab.html`, `sloedla.css`:** skjáirnir fjórir eins og lýst er (spjöldin, hleðslan,
  lokahnapparnir, sviðsfærslan sem CSS-umbreyting á sviðinu, kastljósin, orðin á striga með `drawWord`).
- **`engine/sloedla/lab.js`:** `start()` sýnir hleðsluna, segir henni hve hátt hlutfall rásanna er komið, bíður eftir „Byrjum!“ og
  ræsir þá umferðina; sviðið hættir að teikna meðan umferðin er spiluð.
- **`engine/sloedla/game.js`:** eðluhringirnir sökkva burt í lokin (sjá 7).
- **`engine/sloedla/dj.js`, `assets/audio/sloedla/dj/`:** nýju línurnar (sjá 8).
- **Varaleið:** ekkert WebGL, persóna sem hleðst ekki, eða `?3d=0` (sami rofi og fyrir stjörnurnar): sama svið með myndum
  eðlanna úr leiknum (`assets/eitt/*.webp`) sem vagga, dökkna þegar þær eru utan umferðar og hoppa á slaginu (leið B úr prufunni).
- **Minni hreyfing** (`prefers-reduced-motion`): sviðið skiptir um stöðu án þess að renna, enginn dans eða fjöðrun (persónurnar
  anda bara), engin innflug, ekkert leiftur, engir neistar.
- **Lyklaborð** eins og í dag: bil eða Enter fer í skref 2, spilar valið lag og spilar aftur á lokaskjánum; ekkert í hleðslunni.
- **Upptökur og mælitæki** (`?sjalf=`): opnast áfram í skrefi 2 með `#play`; þá talar DJ-inn ekki í valmyndinni, svo hleðslan
  bíður aðeins eftir laginu.

## 10. Prófun

Fá, stutt próf á það sem barnið sér og heyrir:

- Fjöðrunin rís og lendir innan slagsins og hvílir seinni helming þess; hreyfing nær yfir 1, 2, 4 eða 8 slög; á slagi 0 er hún í
  upphafi.
- Hleðsluhringurinn er aldrei á undan raunverulega hlutfallinu, er ekki fullur fyrr en eftir lágmarkið og hoppar ekki.
- Brotið endurtekur sig og `beats()` telur slögin á réttum hraða lagsins frá upphafi þess; `null` eftir að það hættir.
- `bpm` hvers lags í `SONGS_V2` er sá sami og í laginu sjálfu.
- Valmyndin: hvert val í skrefi 1 gefur sína línu (og fyrsta pikk sem er val gefur ekki líka kveðjuna); „Spila!“ gefur `tilbuin`,
  „Spilum aftur“ enga; nýju línurnar eru allar á disknum með texta í `dj.json`.
- Hleðslan: „Byrjum!“ kemur ekki á meðan DJ-inn er enn að segja `tilbuin`.
- Eðluhringirnir eru horfnir af skjánum þegar lokahnapparnir birtast.
- Í huldum vafra, í fartölvu- (1280×800) og símastærð (390×844): öll leiðin, frá skrefi 1 að lagavali, dansi, hleðslu, umferð og
  lokaskjá, án villna, og skjámyndir af hverjum skjá sýndar eigandanum.

## 11. Frá eigandanum seinna (Tripo3D)

Ekki hluti af þessu verki, en sviðið er smíðað svo þetta smellpassi inn þegar það kemur:

- **DJ-borð með plötuspilurum:** DJ-inn á sviðinu sjálfu í stað myndar í horninu.
- **Vínylplata** í stað kringlunnar í hleðslunni.
- **3D-hlutir laganna** sem snúast á spjöldunum, í stað Openclipart-myndanna: spilakassi (Pixlaferð), glymskratti (Rokkhopp),
  diskókúla (Fönkhopp), hljóðnemi (Stattu upp).
- **Fullorðin persóna** sem stígur fram þegar „Fullorðinn“ er valinn.

## 12. Utan verksins

- Lokaskjárinn sjálfur (stjörnur, stig), umferðin, ný lög, Fjölspil.
- Valmynd í aðalleiknum (þetta er tilraunasíða söngleiksins).

## 13. Opið

- Á DJ-inn að nefna Egil („Egill spilar, frábært!“), eða segja eitthvað sem á við hvaða barn sem er?
- Línurnar í töflunni í 8 eru tillögur; eigandinn heyrir þær og getur breytt orðalagi áður en þær fara inn.
