# Lifandi málverk: vatn sem rennur, foss, tré og ský á kortinu

Hönnun eigandans 2026-10-29, eftir prufusíðu sem hann skoðaði og samþykkti („Flott, skrifaðu spec“): `qa/bokin/kort-lif/` (í `.gitignore`, hent eftir). Á undan: lifandi kortið og kortið í ferðalaginu (`2026-10-28-kortid-lifandi-og-i-ferdalaginu-design.md`, í main 82018f6).

## 1. Markmið

Kortið á að lifna betur. Eigandinn bað um þrennt: tré sem hreyfast lítillega, hreyfingu við fossinn þar sem vatnið fellur, og ský sem líða yfir fjöllin. Ljósröndin sem fer yfir vatnið frá vinstri til hægri á 9 sekúndum lítur út eins og verið sé að teikna, og hún fer.

Allt hreyfir pixla málverksins sjálfs, svo Claude teiknar ekkert nýtt. Sama líf er á kortinu í bókinni og á kortinu sem rennur upp yfir leikinn við brottför.

## 2. Hvað hreyfist

Þetta er útlitið í prufunni með sjálfgefnu gildunum, eins og eigandinn samþykkti það.

- **Vatnið rennur.** Smágárur (um 1,7 punkta færsla í málverkinu) berast niður ána frá fossinum, til hægri og örlítið niður, um 16 punkta á sekúndu. Í Feninu hreyfist vatnið varla (3 punkta á sekúndu, gárur 1 punktur). Glampar ferðast með straumnum og blikka.
- **Fossinn fellur.** Bunan (málverk x 431–469, y 170–230) fær ljósrákir sem falla niður hana, og pixlar hennar titra lóðrétt um allt að 3 punkta.
- **Froðan kraumar.** Froðan neðst (sporbaugur um (450, 234), hálfásar 47 × 13) hvítnar og iðar.
- **Trén sveiflast.** 18 há tré og burknatré: þrjú háu trén hægra megin, fjögur há tré og fjögur grenitré vinstra megin, og sjö burknatré og köngulpálmar. Krónan snýst lítillega um rót stofnsins, meira því ofar sem dregur, hver á sínum hraða og með smá vindhviðum. Krónurnar færast um 1,5–3 punkta í málverkinu, en rót stofnsins stendur kyrr. Listinn með hnitum er í prufunni (`TREES`) og fylgir með óbreyttur.
- **Skýin líða yfir fjöllin.** Máluðu skýin efst til vinstri liðast þar sem þau eru: pixlar þeirra hreyfast á hægum og breiðum straumi, um allt að 9 punkta. Tvö eintök af þeim líða hægt til hægri yfir fjöllin, 170 punkta á 36 sekúndum. Hvort eintak birtist og hverfur, og þau skiptast á hálfum hring hvort á eftir öðru, svo skýin færast stöðugt áfram án þess að hoppa.
- **Gatið að Grameðlu.** Eins og nú opnast gat í skýjunum umhverfis hringinn hennar þegar hún er fundin. Það víkkar á 2 sekúndum fyrsta skiptið og stendur opið eftir það. Skýin sem líða mega ekki fara inn í gatið.
- **Úðinn er ekki með.** Í prufunni var hann úr kóða og sjálfgefið af. Bætist við aðeins ef eigandinn biður um hann.
- **Skýin á himninum hægra megin hreyfast ekki.** Þau eru á litinn eins og pappírinn og skilja sig ekki frá honum.

## 3. Hvernig: lifandi lag yfir hvorri síðu

**Nýr hluti, `remake/engine/book/map-life.js`.** Hann geymir:
- gögnin, í pixlum málverksins: trén, bununa, froðuna, strauminn og skýin;
- skuggaforritið (shader) úr prufunni, í léttari útgáfunni;
- `createLiveMap(canvas, { half, win, hole })`, sem skilar `{ start(), stop(), destroy(), running }`.

WebGL 1 er notað beint (`powerPreference: 'low-power'`), án three.js, eins og í prufunni.

**Hvar.** `renderMap` (`map-page.js`) setur `<canvas class="map-live">` á hvora síðu, beint á eftir `map-art`:
- Það liggur yfir allri síðunni og teiknar hennar helming málverksins í gegnum skuggaforritið.
- Leiðin, nöfnin og límmiðarnir liggja áfram ofan á.
- Lagið birtist (síðan fær flokkinn `live`) aðeins eftir að fyrsta myndin er teiknuð. Þá kemur ekkert autt blikk, og myndin `map-art` sést þangað til.

**Áferðir (textures).** Hvert lag hleður aðeins sínum helmingi af málverkinu. Það fær 100 punkta spássíu yfir kjölinn, svo trén og skýin sem hreyfast við kjölinn fái pixla. Að auki fær það:
- eina grímu, þar sem rauða rásin er vatnið (alfa úr `map-water.webp`) og sú græna skýin (alfa úr `map-mist.webp`);
- litla 256 × 256 hávaðaáferð með fjórum mjúkum hávaða, sem er búin til einu sinni.

Upplausn strigans er sú minni af tveimur: stærð síðunnar á skjánum sinnum `devicePixelRatio`, eða eigin pixlar málverksins fyrir helminginn (841 × 936). Málverkið hefur ekki meiri smáatriði en það, og stækkunin í ferðalaginu (allt að 1,6×) gerir það sama við myndina.

**Hvenær það teiknar.**
- Lagið er búið til í fyrsta sinn sem kortið sést: þegar kortasíðan í bókinni opnast (`show()`), eða þegar kortið rennur upp í ferðalaginu.
- Það teiknar 30 myndir á sekúndu á meðan kortið sést og hættir við `hide()`.
- Lag kortsins í ferðalaginu er losað (`destroy()`, WebGL-samhenginu sleppt) þegar kortið fer af síðunni. Lag bókarinnar lifir með bókinni.
- Tíminn er klukka síðunnar, ekki leiksins: lífið er umhverfi, eins og CSS-hreyfingarnar núna.

**Gatið.** Skýjalagið (`map-mist`) er áfram á síðunni og ber gatið (`--map-hole`) eins og nú, en er falið (`visibility: hidden`) á meðan lifandi lagið teiknar. Lifandi lagið les radíus gatsins úr reiknuðu `--map-hole` skýjalagsins í hverri mynd og breytir honum í pixla málverksins. Opnunin, vistunin (`map-mist-gramedla`) og `hide()` haldast því óbreytt.

`--map-hole` er skráð í `book.css` með `@property` (`<length>`, upphafsgildi `0px`). Annars hoppar hreyfingin í einu skrefi í stað þess að víkka mjúklega, eins og hún gerir núna líklega. Skráningin lagar það líka þegar lifandi lagið vantar.

## 4. Þegar lifandi lagið vantar

- **Minni hreyfing** (`prefers-reduced-motion`): ekkert lifandi lag er búið til. Kortið er málverkið með kyrru skýjalaginu, og gatið er einfaldlega opið, eins og nú.
- **Ekkert WebGL**, eða skuggaforritið þýðist ekki, eða samhengið tapast (`webglcontextlost`): kortið verður eins og nú án vatnslagsins, það er málverkið með skýjalaginu sem líður (CSS). Ekki er reynt að endurheimta lagið. Prófin í Node lenda hér, því falski strigi þeirra hefur ekkert WebGL.

## 5. Hvað fer og hvað breytist

- `img.map-water`, reglan `.map-water`, `@keyframes map-water-glide` og reglan fyrir minni hreyfingu fara. Prófin sem lýsa ljósröndinni fara líka.
- `map-water.webp` verður áfram til sem uppspretta vatnsgrímunnar. Lýsingin efst í `tools/map-life-layers.py` er uppfærð til að segja það.
- Lýsingin á lífinu efst í `map-page.js` er endurskrifuð, ásamt athugasemdinni um SVG-gárurnar sem tóku 5 ms. Sama á við um lýsinguna í `book.css`.

## 6. Afköst

Reglan frá því síðast stendur: lífið má bæta að jafnaði í mesta lagi 4 ms við hverja mynd á spjaldtölvustærð (1366 × 1024 og 1024 × 1366). Mælt er í prófunarsíðu bókarinnar á þessari fartölvu (Intel Iris Xe).

Prufan var mæld við 60 myndir á sekúndu á 1708 × 951 striga með öll áhrifin á:

| Útgáfa | Viðbót á mynd |
|---|---|
| Fyrsta útgáfa | +5,2 ms |
| Léttari útgáfa | um +2,9 ms (mælt +1,8 ms á 1366 × 761 striga og umreiknað) |

Í leiknum er teiknað 30 sinnum á sekúndu og striginn aldrei stærri en pixlar málverksins, svo búist er við um 1,5 ms að jafnaði.

Þetta gerir léttari útgáfuna létta:
- hávaðinn kemur úr áferðinni í einni sókn, ekki reiknaður;
- hvert áhrif reiknast aðeins innan síns svæðis (grímunnar eða kassa um fossinn og skýin);
- hvert tré prófar fyrst kassann sinn.

Ef mælingin fer yfir 4 ms fer lagið fyrst niður í 20 myndir á sekúndu og svo í 75 % upplausn.

## 7. Prófanir og skoðun

Prófin eru fá og snúast um það sem barnið sér (`book.test.mjs`, `map-moment`-prófin):

- **Gögnin:** hvert tré og bunan liggja inni í málverkinu, rót hvers trés er neðan við krónuna, og enginn kassi trés nær yfir hring límmiða.
- **`renderMap`:** hvor síða hefur `canvas.map-live` á eftir `map-art`, svo `map-mist` og leiðina, og ekkert `map-water`.
- **Lífshlaupið,** með falsaðri smiðju í stað `createLiveMap`:
  - `show()` ræsir lagið og `hide()` stöðvar það;
  - með minni hreyfingu er ekkert lag búið til;
  - kortið í ferðalaginu losar lagið sitt þegar það fer af síðunni;
  - án WebGL fær síðan ekki flokkinn `live` og skýjalagið sést.
- **`book.css`:** `--map-hole` er skráð `<length>`, og ekkert er eftir af `map-water`.

Afköstin eru mæld í prófunarsíðunni og tölurnar skráðar í verkbókinni, ekki í prófi.

Skoðað í prófunarsíðu bókarinnar (`?state=map&progress=3&seen=1` og `progress=6` fyrir gatið) og í leiknum sjálfum (`index.html?t=184`, kafli 1 við brottför). Eigandinn skoðar áður en neitt er sameinað.

## 8. Ekki með

- Úðinn við fossinn (sjá 2. kafla).
- Skýin á himninum hægra megin.
- Allar aðrar hreyfingar kortsins standa óbreyttar: rauða línan, punkturinn, punktalínan, hringurinn sem slær og límmiðarnir sem vagga.
- Engin hljóð bætast við.
