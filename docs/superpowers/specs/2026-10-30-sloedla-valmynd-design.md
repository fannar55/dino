# Söngur Slóeðlu: valmynd með lagaspjöldum og DJ (hönnun)

30. október 2026. Staða: **drög til yfirlestrar eigandans.** Ákvarðanirnar hér eru hans frá 30. október (svör hans í spjallinu og í
vafraflipa hugmyndanna). Engin smíði fyrr en lýsingin og útfærsluáætlunin eru samþykktar. Grein: `sloedla-lag`.

Þetta er fyrri hluti af tveimur. Seinni hlutinn, **stjörnurnar og stigin** (lokaskjárinn og stikan efst, kannski með 3D-stjörnu úr
Tripo3D), fær sína eigin lýsingu á eftir.

## 1. Af hverju

Eigandinn: viðmótið (spila aftur, velja lög og allt það) er flatt og einfalt. Í dag er valmyndin eitt spjald með hnappaumferðum
(lögin, Barn/Fullorðinn, 3/2 eðlur) og „Spila“; eftir umferð sama spjald með „Spilum aftur“. Hann vill skref: fyrst stillingar, svo
lagaval á flottum spjöldum með mynd og nafni, og DJ-inn í viðmótinu, sem spyr hvaða lag og segir línu þegar lag er valið („Blár
ópal! með Stattu upp, svo gott að það ætti að vera bannað!“), og meira svoleiðis fyrir önnur lög.

## 2. Ákvarðanir eigandans

1. **Valmyndin fyrst**, stjörnurnar og stigin á eftir.
2. **Lagavalið er spjaldaröð (A):** öll lögin sjást í einu (ekki hringekja, ekki plötubúð).
3. **Myndirnar á spjöldunum eru frjálsar myndir af vefnum**, sýndar honum áður en nokkru er hlaðið niður (nafn, uppruni, leyfi,
   stærð). Claude teiknar engar myndir.
4. **DJ-inn birtist sem mynd** (frjáls mynd af DJ, sama ferli) í horninu, með talblöðru.
5. **Flæðið** (hluti 1), **línurnar og lagabrotin** (hluti 2), **myndirnar** (hluti 3) og **juice, smíði og prófun** (hluti 4) eins og
   lýst er hér að neðan: samþykkt.

## 3. Flæðið

**Skref 1: „Hver spilar?“**
- DJ-inn í horninu; í talblöðrunni stendur „Hæ! Hver ætlar að spila í dag?“.
- Tveir stórir valhópar: **Barn / Fullorðinn**, og **3 eðlur / 2 eðlur** (með myndum eðlanna úr leiknum, `assets/eitt/*.webp`).
- Hnappurinn **„Veljum lag →“**.
- Síðasta val er munað á tækinu, svo oftast þarf eitt pikk.
- Vafri leyfir hljóð aðeins eftir fyrsta pikk: kveðjan birtist fyrst sem texti; fyrsta pikk opnar hljóðið og DJ-inn talar upp frá því.

**Skref 2: „Veldu lag“**
- DJ-inn spyr „Hvaða lag viltu spila?“.
- **Spjöldin í röð:** ein röð upp að fimm lögum, tvær raðir upp að tíu; fleiri renna til hliðar. Hvert spjald: mynd lagsins (efri
  tveir þriðju), nafn, lína um lagið ef það á hana (`by`: „Lag eftir pabba“), og **bestu stjörnurnar** sem hafa unnist í laginu á
  þessu tæki á völdu stigi (☆☆☆ til ★★★).
- **Pikkað á spjald:** það lyftist, hallast og glóir í lit lagsins og sendir frá sér neista; hin dofna aðeins; DJ-inn segir línu
  lagsins; lagabrotið spilar lágt undir honum; stór hnappur **„Spila!“** skoppar inn. Pikkað á annað spjald skiptir um val.
- Lítill hnappur **„← Til baka“** í skref 1.

**Umferðin** byrjar á „Spila!“, eins og í dag.

**Eftir umferð:** lokaskjárinn (stjörnurnar og stigin; seinni hlutinn) og svo tveir hnappar: **„Spilum aftur“** (sama lag, sömu
stillingar) og **„Annað lag“** (í skref 2). Stjörnurnar sem unnust skrást sem bestu stjörnur lagsins ef þær eru fleiri en áður.

**Slóðin** virkar áfram: `?lag=` velur lagið fyrirfram (spjaldið er valið þegar skref 2 opnast), `?stig=` og `?brautir=`
stillingarnar. Annað (`?sjalf=`, `?upptaka=` …) óbreytt; sjálfspil (`?sjalf=`) sleppir valmyndinni og byrjar strax, svo upptökur og
mælitæki virka eins og áður.

## 4. DJ-inn í valmyndinni

Sama rödd og í leiknum („DJ 1“, ElevenLabs Voice Design, `tools/sloedla-dj.mjs`). Claude tekur línurnar upp sjálfur og staðfestir
þær (lykillinn úr umhverfinu, aldrei prentaður). Hver lína á 2–3 útgáfur; aldrei sú sama tvisvar í röð (eins og í leiknum).

| Hvenær | Línur |
|---|---|
| Skref 1 (eftir fyrsta pikk, eða þegar komið er aftur) | „Hæ! Hver ætlar að spila í dag?“ |
| Inn í skref 2 | „Hvaða lag viltu spila?“ · „Veldu lag!“ · „Hvaða lag eigum við að taka?“ |
| Stattu upp valið | „Blár ópal! Stattu upp, svo gott að það ætti að vera bannað!“ · „Stattu upp, lagið hans pabba!“ · „Stattu upp! Nú standa allir upp og dansa!“ |
| Pixlaferð valin | „Pixlaferð! Beint inn í tölvuleikinn!“ · „Pixlaferð, bíp bíp búp!“ · „Pixlaferð! Hoppum milli pixlanna!“ |
| Rokkhopp valið | „Rokkhopp! Hoppum og skoppum!“ · „Rokkhopp, rokk og ról!“ · „Rokkhopp! Upp með hendurnar!“ |
| Fönkhopp valið | „Fönkhopp! Dillum okkur!“ · „Fönkhopp, nú verður fönkí!“ · „Fönkhopp! Allir að dilla sér!“ |

- Hann talar aðeins þegar eitthvað er valið eða skref opnast. Ef barnið pikkar hratt á mörg spjöld klippir hann á línuna og segir þá
  nýju (aldrei tveir í einu).
- Á meðan hann talar hoppar myndin hans og orðin hans birtast í talblöðrunni (fyrsta útgáfa línunnar, eins og orðin á lokaskjánum).
- Nýtt lag fær sínar línur um leið og það kemur í leikinn (próf gætir þess, sjá 9).

## 5. Lagabrot

- Hvert lag fær **um 10 sekúndna brot** (helst úr viðlaginu), sem spilar lágt undir DJ-inum þegar spjaldið er valið (hann dýfir
  því eins og tónlistinni í leiknum), dofnar inn og út, og hættir við „Spila!“, „Til baka“ eða annað spjald.
- Brotið er sér-skrá, um 150 KB (`assets/audio/sloedla/v2/<id>/brot.mp3`), svo valmyndin hleður aldrei heilu lagi.
- Lög úr upptöku: klippt úr rásunum saman (ffmpeg). Pixlaferð er samin í kóða og á enga hljóðskrá: brotið er tekið upp úr leiknum
  sjálfum (hulin umferð, tónlistin ein) og klippt.
- Styrkur brotanna jafnaður (eins og lögin: um −17 LUFS áður en glue-þjappan tekur við).

## 6. Myndir

- **Uppruni:** frjálsar myndir af vefnum: almenningseign / CC0, eða CC BY með höfundi í kreditskrá (eins og hendurnar:
  `assets/sloedla/hendur/KREDIT.md`). Til dæmis Openclipart, Wikimedia Commons, Openverse.
- **Einn stíll:** allar myndirnar í sama stíl (til dæmis litríkar vektormyndir), svo spjöldin líti út eins og eitt spilasett.
- **Spjöldin:** Pixlaferð (tölvuleikjapixlar, geimskip), Rokkhopp (glymskratti, gítar, dans), Fönkhopp (diskókúla, fönk), Stattu upp
  (hljóðnemi, svið). **DJ-inn:** DJ með heyrnartól við plötuspilara.
- **Ferlið:** Claude finnur 2–3 kosti fyrir hvert spjald og fyrir DJ-inn og sýnir í vafraflipa hugmyndanna, með nafni, uppruna, leyfi
  og stærð; eigandinn velur; ekkert hlaðið niður fyrr en hann samþykkir. Myndirnar eru minnkaðar í webp (um 512 px) og geymdar í
  `assets/sloedla/valmynd/` með `KREDIT.md`.
- **Rammi spjaldanna** í CSS: ávalur, í lit lagsins með ljóma; Stattu upp fær gylltan ramma og „Lag eftir pabba“.

## 7. Juice

- Skref 1 → 2: spjöldin koma inn eitt af öðru (hvert á eftir öðru, rúm 0,1 s á milli) og vagga létt.
- Valið spjald: lyftist, hallast að pikkinu, glóir í lit lagsins og sendir neista (lítill strigi ofan á spjöldunum); hin dofna.
- „Spila!“ skoppar inn; DJ-myndin hoppar þegar hann talar; skrefin renna á milli.
- Bestu stjörnur spjaldsins glitra þegar þær eru nýjar (eftir umferð sem bætti metið).
- Ef tækið biður um minni hreyfingu (`prefers-reduced-motion`): sömu skref, hógværari hreyfing, engir neistar.

## 8. Smíði

- **`engine/sloedla/menu.js`:** ástand valmyndarinnar sem hrein rökfræði, án DOM: skrefið, stillingarnar, valið lag, hvað á að
  segja og spila (DJ-lína, brot). Prófanlegt eitt og sér.
- **`engine/sloedla/best.js`:** bestu stjörnur hvers lags á hverju stigi, á tækinu (localStorage, alltaf innan try/catch; virkar
  án þess).
- **Útlitið:** `sloedla-lab.html` (skrefin tvö og lokahnappar), `sloedla.css`, og `lab.js` sem tengir valmyndina við leikinn, DJ-inn
  og hljóðið. Neistarnir á litlum striga.
- **Lögin:** færsla hvers lags í `v2/songs/index.js` fær `card` (mynd lagsins) og `brot` (skráin og hvar í laginu); DJ-línurnar í
  `dj.js` (`lag-<id>`, `hvadalag`, `hverspilar`), teknar upp með `tools/sloedla-dj.mjs`.
- **DJ-inn:** `dj.js` fær `hush()` (klippa á línuna sem hann er að segja), svo hann tali aldrei ofan í sjálfan sig.
- Gamla spjaldið (eitt spjald með öllu) hverfur.

## 9. Prófun

- Rökfræði valmyndarinnar: skrefin, minni stillinga, slóðin (`?lag=` velur fyrirfram), „Spilum aftur“ / „Annað lag“, bestu
  stjörnurnar (bætast aðeins við, tækið án geymslu).
- Hvert lag í `SONGS_V2` á: línu hjá DJ-inum (allar útgáfur á disknum, með texta í `dj.json`), lagabrot á disknum, mynd á disknum og
  höfund hennar í `KREDIT.md` ef leyfið krefst þess.
- Skjámyndir af báðum skrefum, í spjaldtölvu- og símastærð, sýndar eigandanum; ein umferð frá valmynd til lokaskjás í huldum vafra
  án villna.

## 10. Utan verksins

- Stjörnurnar og stigin á lokaskjánum og stikan efst (seinni hlutinn, sér lýsing).
- Ný lög, ný hljóð í leiknum sjálfum, Fjölspil.
- Valmynd í aðalleiknum (þetta er tilraunasíða söngleiksins).

## 11. Opið

- Myndirnar sjálfar ráðast þegar eigandinn hefur valið úr kostunum (sjá 6).
- Hvar í hverju lagi brotið byrjar: Claude velur viðlagið (út frá köflum lagsins) og eigandinn heyrir í skjámyndbandinu.
- Blár ópal er vörumerki (Nói Síríus); línan er grín í leik fyrir barn. Geymslan á GitHub er opinber, svo línan verður opinber ef
  greinin er send út.
