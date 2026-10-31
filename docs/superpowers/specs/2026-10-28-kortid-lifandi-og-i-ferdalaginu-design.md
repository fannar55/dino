# Kortið lifandi, og kortið í ferðalaginu (4. áfangi bókarinnar, seinni hluti)

Hönnun eigandans 2026-10-28, ákveðin spurningu fyrir spurningu. Á undan: rauða Indiana-línan, rauði punkturinn, dauf punktalína að næsta stað og límmiðar sem vagga (bokin 2875c7a, 9694262). Aðalhönnun bókarinnar: `2026-10-26-landkonnudabok-design.md`, 7. kafli, 4. liður.

## 1. Markmið

Egill, sex ára, á að finna að kortið sé lifandi og að það segi frá ferðinni sem hann er í. Tvennt bætist við:

1. **Lifandi kort:** vatnið gárar og þokan liðast, bæði í bókinni og á kortinu í ferðalaginu.
2. **Kortið í ferðalaginu:** við hverja brottför rennur kortið upp yfir leikinn, rauða línan teiknast að næsta áfangastað á meðan Mosi segir hvert þeir fara, og svo heldur Mosi áfram. Engin klipping og engin bók sem opnast.

## 2. Lifandi kort

**Lögin eru úr mynd eigandans.** Claude teiknar ekkert. Nýtt verkfæri (`remake/tools/map-life-layers.py`, keyrt á `map.webp` eins og `erase-map-dots.py`) velur pixla myndarinnar eftir lit og stað og vistar tvö lög í sömu stærð og kortið (1681 × 936), með mjúkum gegnsæjum jöðrum:

- `assets/book/map-water.webp`: vatnið (áin, fossinn, tjarnirnar og sundin í Feninu), litirnir eins og í myndinni.
- `assets/book/map-mist.webp`: þokan yfir fjöllunum efst til vinstri, umhverfis hring Grameðlu.

**Hreyfingin:**

- **Vatnið gárar hægt:** vatnslagið liggur yfir myndinni með gárusíu (SVG `feTurbulence` og `feDisplacementMap`, 2–3 punkta sveifla) sem breytist hægt, um 8 sekúndna hringur. Ef sían reynist of þung fyrir spjaldtölvu í mælingu kemur í staðinn ljósbjarmi sem líður hægt yfir vatnið (gráða sem rennur innan vatnslagsins). Ákveðið í byggingu eftir mælingu, sjá 6. kafla.
- **Þokan liðast:** þokulagið liggur yfir myndinni við hálfan styrk og líður hægt fram og til baka (um 1,5 % af breiddinni, 14 sekúndna hringur) og andar örlítið í styrk.
- **Þokan opnast að Grameðlu:** þegar hringur Grameðlu er fundinn eða búinn (staðurinn hennar eða stjarnan hennar, `k6_gramedla` í kafla 6) dregst þokan frá hringnum hennar: kringlótt gat í þokulaginu umhverfis hringinn víkkar mjúklega á um 2 sekúndum. Fyrsta skiptið gerist það þegar síðan sést; eftir það er gatið einfaldlega opið.
- **Minni hreyfing** (`prefers-reduced-motion`): lögin standa kyrr og gatið er bara opið.

Lífið er hluti af kortinu sjálfu (`map-page.js`), svo það er eins í bókinni og á kortinu í ferðalaginu.

## 3. Kortið í ferðalaginu

**Hvenær:** einu sinni við hverja brottför, alltaf, í hvert sinn sem kaflinn er spilaður.

| Kafli | Hvar í senunni | Bútar sem teiknast | Lína Mosa |
|---|---|---|---|
| 1 | Í `upOnBack` (`kafli1.js`, sena 5): eftir bókina og fiðrildið (`butterflyIntoTheBook`), á undan „Haltu þér fast. Af stað!“ (`k1_mosi_hold`) | a (Rjóðrið → Burknalautin) | `k1_mosi_map_ride`: „Sjáðu, kortið! Við förum eftir stígnum að Burknalautinni, til Kambeðlu.“ |
| 2 | Í `leaving` (`kafli2.js`, sena 1): eftir `k2_mosi_muchbigger`, á undan því að Mosi gengur úr lautinni | b og c (Fenjaslóðin, og yfir Fenið að tjörn Þórseðlu) | `k2_mosi_map_trail`: „Nú förum við út úr skóginum, niður Fenjaslóðina og alla leið að Feninu, til Þórseðlu.“ |
| 3–6 | Þegar hver kafli er byggður | d (að fjarlægu tjörninni, til Slóeðlu), e (að hvíta trénu, til Flugeðlu), f (að sefinu við síkið, til Uggeðlu), g (yfir ána við fossinn og fjöllin, til Grameðlu) | Skrifaðar með köflunum |

**Röð leiðarinnar fylgir handriti leiksins** (`2026-10-28-handrit-leiksins.md`, ákvörðun eigandans 2026-10-28: „Já, Slóeðla næst“): einn vinur í hverjum kafla, 3 Slóeðla, 4 Flugeðla, 5 Uggeðla, 6 Grameðla síðust. Eftir tjörn Þórseðlu liggur punktalínan því að fjarlægu tjörn Slóeðlu, ekki beint að Grameðlu. Bútur sem endar hjá vini sem sást úr fjarska í kafla 2 (Slóeðla, Flugeðla, Uggeðla) telst ekki farinn þótt límmiðinn sé kominn á kortið, heldur aðeins þegar stjarnan hennar er komin (þegar kaflinn hennar hefur verið spilaður). Hringur næsta vinar slær líka þegar límmiðinn hennar er kominn.

**Hvernig það gerist** (ein sameiginleg aðgerð í senunum, til dæmis `yield* mapMoment(s, c, { pieces: ['a'], line: 'k1_mosi_map_ride' })`):

1. Leikurinn heldur áfram undir: Mosi stendur tilbúinn og lítur á Egil, myndavélin kyrr. Ekkert er klippt.
2. Kortið rennur upp neðan frá á um 0,6 sekúndum, eins og kort sem er lagt fram: allt kortið sem ein mynd (báðar síður bókarinnar hlið við hlið, 1800 × 1000 eininga sýn), yfir um 86 % af skjánum, með pappírsjaðri og skugga. Leikurinn sést daufur í kring (dökk slæða, um 35 %). Kortahljóð þegar það birtist.
3. Á kortinu er sama staða og í bókinni: límmiðarnir, rauðu línurnar sem eru komnar, punkturinn þar sem við erum, og lífið.
4. Myndin færist hægt nær bútunum sem teiknast (frá öllu kortinu að ramma utan um bútana, mest 1,6 × stækkun) á meðan línan teiknast.
5. Rauða línan teiknast eftir bútunum með punktinum fremst, eins og í bókinni (2,65 sekúndur hver bútur, 0,2 sekúndur á milli; eigandinn bað um þriðjungi hægari línu 2026-10-28). Pennahljóð á meðan. Mosi segir línuna sína á sama tíma, með skjátexta eins og aðrar línur.
6. Þegar bæði línan og orð Mosa eru búin stendur kortið kyrrt í 0,8 sekúndur, rennur svo niður og burt á 0,6 sekúndum, og senan heldur áfram þar sem hún var (Mosi segir „Haltu þér fast. Af stað!“ í kafla 1, gengur úr lautinni í kafla 2).

- **Tími:** kafli 1 um 5–6 sekúndur, kafli 2 um 6–7.
- **Barnið þarf ekkert að gera.** Kortið endar af sjálfu sér. Pikk á það gerir ekkert og truflar ekkert. Pikk í leikinn á bak við (til dæmis á Kambeðlu í kafla 2) virkar eins og áður.
- **Séð í bókinni:** bútarnir sem teiknuðust eru vistaðir sem séðir (`map-route-<id>`), svo bókin teiknar þá ekki aftur þegar staðurinn finnst. Þangað til sýnir bókin þá sem punktalínuna fram á við, eins og nú.
- **Minni hreyfing:** kortið birtist og hverfur án þess að renna, línan er bara komin og myndin færist ekki. Kortið stendur samt á meðan Mosi talar.

## 4. Upptökur

Tvær nýjar línur Mosa, `k1_mosi_map_ride` og `k2_mosi_map_trail`, í settum kafla 1 og 2. Claude tekur þær upp með ElevenLabs eins og hinar línurnar: framburðarorðasafnið fær hvert nýtt orðmynd (Burknalautinni, Fenjaslóðina, Feninu), og Kambeðlu og Þórseðlu fá sitt samhengi eins og áður. Eigandinn samþykkir texta og upptöku eftir eyranu.

## 5. Hvað breytist

- `remake/tools/map-life-layers.py` (nýtt) og lögin tvö í `remake/assets/book/`.
- `remake/engine/book/map-page.js` og `remake/book.css`: lögin og hreyfing þeirra, þokugat Grameðlu; kortið má teiknast í annað ílát en bókarsíðu (heila mynd fyrir kortið í ferðalaginu) og bútar teiknast eftir beiðni, óháð vistuninni.
- Ný eining fyrir kortið í ferðalaginu (til dæmis `remake/engine/scene/map-moment.js`): yfirlagið yfir leiknum, rennslið, stækkunin, tímasetningin, hljóðin og vistunin sem séð.
- `remake/chapters/kafli1.js` og `kafli2.js`: kortið á sínum stöðum og línurnar tvær.
- Raddlínurnar, orðasafnið og hljóðin.
- `remake/book-lab.html`: kortið í ferðalaginu til skoðunar (til dæmis `?state=journey&leg=1|2`).

## 6. Prófun

Fá próf sem barnið finnur fyrir:

- Í kafla 1 kemur kortið eftir bókina og á undan „Haltu þér fast“, teiknar bút a, vistar hann sem séðan og endar af sjálfu sér innan 8 sekúndna. Í kafla 2 teiknast b og c áður en Mosi gengur úr lautinni.
- Bók sem opnast seinna teiknar ekki aftur bút sem kortið í ferðalaginu teiknaði.
- Minni hreyfing: ekkert rennur eða gárar, línan er komin, kortið bíður samt eftir Mosa.
- Þokan opnast að Grameðlu þegar hún finnst, og bara þá.
- Lögin tvö eru til, í réttri stærð, og hylja ekki límmiðana.

Skoðað í prófunarsíðu bókarinnar og í leiknum sjálfum á spjaldtölvustærð (bæði á breidd og upprétt). Gárusían er mæld þar: ef ein mynd tekur meira en 4 ms að jafnaði kemur ljósbjarminn í staðinn.

## 7. Opið

- Línur Mosa við brottför í köflum 3–6 bíða kaflanna.
- Litlu dýrin (fugl, drekafluga) bíða þar til eigandinn býr þau til.
