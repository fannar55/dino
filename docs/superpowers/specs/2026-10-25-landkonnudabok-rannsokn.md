# Landkönnuðabók Egils: rannsókn

25.–26. október 2026. Bakgrunnur forskriftarinnar [2026-10-26-landkonnudabok-design.md](2026-10-26-landkonnudabok-design.md): úttekt á bókinni eins og hún var 25. október og efnisleit að opnum þrívíddarlíkönum, myndum og staðreyndum með leyfum og slóðum. Ekkert hefur verið hlaðið niður. Fyrri hönnunartillögu (Vísindasafn með sýningarskáp) hafnaði eigandinn 26. október og hún er ekki hér.

Athugið: eftir þessa leit ákvað eigandinn (26. október) að Claude teikni hvorki né móti þrívídd sjálfur; tillögur hér að neðan um eigin smíð í Blender eða teiknaðar myndir gilda því ekki. Þrívídd sem ekki er til opin gerir eigandinn í Tripo3D.

---

## 1. Úttekt á bókinni eins og hún er (25. október 2026)

### 1.1 Skelin: hvernig bókin opnast og hvað heldur leiknum

Bókin (`remake/engine/book/book.js`, útlit `remake/book.css`) er DOM og CSS yfir leiknum: tvöföld opna sem vex út úr bókartakkanum efst í hægra horni (`#journal-button`, `engine/scene/journal.js`) og skreppur aftur í hann. Á spjaldtölvu sem er haldið upprétt liggja síðurnar hver ofan á annarri í stað hliðar við hlið.

- **Hver heldur bókinni.** Opni barnið hana (takkinn) heldur hún leiknum (klukkan stöðvuð, tónlist, raddir og brellur þagna). Opni handritið hana (`s.journal.open(tab)` í lok kafla) heldur hún engu, svo síðasta lína Mosa heyrist yfir henni; fyrsta snerting barnsins inni í henni (annað en krossinn) gerir hana barnsins. Sögumaðurinn les því aldrei yfir línu Mosa.
- **Lokun.** Stór kross (`.book-close`); hann getur „kallað“ (pulsar, `beckonClose`) þegar handrit bíður þess að barnið loki.
- **Fimm flippar** (eigandinn kallar þá flippa; kóðinn „ribbons“): `stars`, `animals`, `games`, `map`, `fossils` með merkjunum **Stjörnur, Dýrin, Leikir, Kortið, Safn**. Flipparnir eru 5,4 em breiðir hver með teiknuðu tákni og orði; upprétt þrengjast þeir í 4,9 em og bilið minnkar, og athugasemd í `book.css` (lína 839) segir berum orðum: *fimm flippar og krossinn komast fyrir þvert yfir spjaldtölvu sem haldið er upprétt*. Sjötti flippi er því útlitsáhætta upprétt.
- **Síðufletting.** Flippi flettir með þrívíddarsnúningi um kjölinn og pappírsskrjáfi; með „minni hreyfingu“ verða allar hreyfingar að deyfingum. Allt er transform og opacity.
- **Hljóð.** Bókin á sinn eigin sögumann og brellur (`book-audio.js`, `book-sounds.js`): ellefu brellur gerðar á staðnum í tóntegund tónlistarinnar (opna, loka, fletta, pikk, reitur, stækka inn/út, dilla, nýtt dýr, fagna, upplýsingar). Brellurnar lækka undir sögumanninum. Línur sem ekki eru til í `lines.json` eru þöglar og sagðar einu sinni í stjórnborðinu.

### 1.2 Flipparnir fimm, síða fyrir síðu

| Flippi | Hvað er á opnunni | Hvað gerist við pikk |
|---|---|---|
| **Stjörnur** | Sex „límbandsfestar“ stjörnur, ein fyrir hvern vin (Kambeðla, Þórseðla, Grameðla, Uggeðla, Slóeðla, Flugeðla), í lit vinarins; lýsa þegar stjarnan er komin, annars daufar með brotalínu. | Aðeins pikkhljóð og neistar. **Engin rödd, engin spjöld, ekkert að læra.** |
| **Dýrin** | Reitir („límbandsfestar ljósmyndir“) í opnum: 4 á hverri síðu, 8 á opnu. Opna 1 = sjö dýr kafla 1 (Mosi, Kambeðla, Fiðrildi, Bjalla, Froskur, Snigill, Fuglar); opna 2 = sjö dýr Fensins (Brunnklukka, Vatnalæsingi, Salamandra, Drekafluga, Skjaldbaka, Fiskur, Fornfugl). Reitur er *fundinn* (litur, andar, tindrar), *nýr* (glóir, vaggar, „Nýtt!“) eða *ófundinn* (dökk skuggamynd með „?“). Brotið horn flettir á næstu opnu þegar dýr af henni er fundið. | Fundinn reitur opnar spjaldið. Ófundinn dillar sér og sögumaðurinn segir „Finndu mig í skóginum!“ eða „Finndu mig í Feninu!“. |
| **Leikir** | Þrír leikjareitir: **Eitt!** (opnast með stjörnu Kambeðlu, með „Kennsla“-takka), **Háls og hali** (með stjörnu Þórseðlu eða þegar leikur hefur verið spilaður), **Litla Yatzy** (alltaf opinn); hægra megin límmiðablað með límmiða fyrir hverja unna umferð í Eitt! (sýnir 20, svo tölu). | Reitur opnar leikinn yfir bókina (Eitt! og Háls og hali í sömu síðu; Litla Yatzy sem sér síða í ramma). Lokaður reitur dillar sér. |
| **Kortið** | Handteiknað kort 1800×1000 yfir opnuna (`assets/book/map.svg`): skógurinn vinstra megin (Rjóðrið, Burknalautin, Áin, Fenjaslóðin), Fenið hægra megin. Sjö hólf: sex vinir og Fenið sjálft. Hólf er *tómt* (brotalínuhringur), *fundið* (hringlaga límmiði með mynd vinarins) eða *lokið* (límmiðinn með stjörnu). | Fundið/lokið hólf hoppar og **Mosi** segir nafnið og eina setningu (`k2_mosi_map_<id>`, t.d. „Þórseðla! Hún er hæst af öllum vinum mínum.“). Tómt hólf: bara pikk. |
| **Safn** | *Steingervingasafn*: átta steingervingar úr Háls og hala (Ammónít, Þríbroti, Risaeðlutönn, Fótspor, Steingert laufblað, Raf með flugu, Risaeðluegg, Beinagrind) sem límmiðar, fjórir á síðu; skuggamynd með „?“ fyrir ófundna; „n af 8“. | Fundinn límmiði: sögumaðurinn segir nafn og eina staðreynd (`hals_fossil_<kind>`), nafnið birtist yfir honum, neistar. Ófundinn dillar sér. |

### 1.3 Spjaldið og myndastækkunin

Spjald (`card-viewer.js`) vex út úr reitnum svo myndin í reitnum verður mynd fyrstu síðu, og þekur nær allan skjáinn yfir opnunni.

- **Síða:** ein stór mynd (límband á hornum), ein eða tvær stuttar setningar með stóru letri, ör til hvorrar hliðar, punktar sem sýna stöðuna, hátalari sem les aftur. Fyrsta síða hefur enga ör til baka; síðasta síða hefur stóran takka aftur á dýrasíðuna í stað örvarinnar áfram og lítinn fögnuð (arpeggio og neistar).
- **Lestur:** sögumaðurinn (sérstök róleg ElevenLabs-rödd, ekki Mosi) les hverja síðu þegar hún birtist; fletting stöðvar lesturinn og byrjar á nýju síðunni. Hátalarinn les aftur.
- **Stroka** flettir líka (fyrsti fingur sem hreyfist 12 px dregur síðuna; 40 px til hliðar flettir). Örvar og strokur bíða meðan fletting er í gangi, svo hröð pikk hlaupa ekki yfir síður.
- **ⓘ** á myndum sem eru ekki okkar eigin: gluggi með höfundi, leyfi og uppruna (fullorðinstexti, ætlaður foreldrum).
- **Myndastækkun** (`zoom.js`): pikk á myndina lætur hana renna út í fullan skjá á rjómalitaðri mottu með „vúss“; klípa súmar 1–4×, drag færir hana, aldrei út fyrir skjáinn; pikk eða kross lætur hana renna aftur á sinn stað.
- **Vantar mynd eða upptöku:** daufur lappafar í stað myndar; þögn í stað línu; örvarnar virka áfram.

### 1.4 „Nýtt!“, merkið á takkanum og flugin

- **Flugin** (`journal.js`): stjarna flýgur frá þeim stað sem barnið pikkaði á í hólfið sitt á takkanum (1,2 s, snýst, bogi upp á við), hólfið bólgnar þegar hún lendir. Mynd nýs dýrs (smámynd spjaldsins) flýgur í litlu bókina á takkanum og **bókin kinkar kolli**, bjöllurnar „nýtt dýr“ hljóma og **merki** (`#journal-badge`) sést á takkanum þar til bókin er opnuð næst. Staður á kortinu flýgur eins sem lítill pinni í lit staðarins.
- **Dýr fundið aftur** á nýjum stað (froskurinn í þriðja sporinu) flýgur inn aftur án þess að vistast, og spjaldið opnast næst á nýju síðunni (sjöttu síðu frosksins, Fensins).
- **„Nýtt!“** er á reit sem er opinn en hefur ekki verið opnaður (vistað í `seen` í `engine/save.js`); það gildir um dýraspjöld og leikjareiti. Þegar barnið opnar bókina á takkanum opnast hún á **Dýrin**, á opnu nýjasta dýrsins, og reiturinn þess kinkar kolli.

### 1.5 Efnið sem er til

| Dýr (spjald) | Síður | Opnast | Myndir | Raddlínur |
|---|---|---|---|---|
| Mosi (Triceratops) | 5 | frá byrjun | render úr leiknum ×2, 3 steingervingamyndir (CC BY-SA) | 5 |
| Kambeðla (Stegosaurus) | 5 | stjarna k1_kambedla | render, 4 steingervingamyndir (Carnegie, Sophie) | 5 |
| Fiðrildi (kalligrammatíð) | 5 | fundið `butterfly` | staðgengils-SVG á síðu 1, 4 alvöru myndir | 5 |
| Bjalla | 4 | fundið `beetle` | staðgengill, 3 alvöru | 4 |
| Froskur | 6 | fundið `frog` | staðgengill, 4 alvöru, Fen-teikning | 6 |
| Snigill | 5 | fundið `snail` | staðgengill, 4 alvöru | 5 |
| Fuglar (Archaeopteryx) | 5 | fundið `birds` | staðgengill ×2, 3 alvöru | 5 |
| Fensins sjö (brunnklukka, vatnalæsingi, salamandra, drekafluga, skjaldbaka, fiskur, fornfugl) | 3 hvert | fundin í kafla 2 | **aðeins okkar SVG-teikningar**, sama teikningin á öllum þremur síðum nema skjaldbaka og fornfugl; hvert spjald ber `wanted` með ósk um ljósmynd af Wikimedia Commons sem eigandinn á að samþykkja | 3 hvert |

- **Samtals:** 14 spjöld, 56 síður, 58 upptökur sögumanns (allar til, með tveimur „Finndu mig“-línum). Myndasafn: 29 ytri ljósmyndir (JPEG, ≤1024 px, allar með höfundi, leyfi, slóð og sha256), 5 render úr leiknum, 11 SVG-teikningar/staðgenglar.
- **Risaeðlurnar sjö:** aðeins **Mosi og Kambeðla eiga spjöld.** Þórseðla, Grameðla, Uggeðla, Slóeðla og Flugeðla eru til sem stjörnuhólf, límmiðar á kortinu (með setningu Mosa) og myndir á spilunum í Eitt!, en **engin fræðsla** er um þær í bókinni, þótt Mosi segi í kafla 1 að í bókina fari „öll dýrin sem við finnum“. Barn sem hefur hitt Þórseðlu í kafla 2 finnur ekkert um hana undir Dýrin.
- **Hvað er á bak við hvert:** hjá Mosa og Kambeðlu 5 setningar, 5 myndir, þar af 3–4 alvöru steingervingamyndir; hjá smádýrum kafla 1 svipað; hjá Fensins dýrum 3 setningar og ein teikning. Hver síða hefur skráðar heimildir (NHM Dino Directory, UCMP, ritrýndar greinar) í `cards.json`, sem börn sjá aldrei.
- **Textareglur** gömlu forskriftarinnar (`2026-10-17-landkonnudabok-fraedsla-design.md`, 5.2) gilda: stuttar setningar, ein hugmynd á síðu, í hverju spjaldi ein síða um *hvernig við vitum það* (steingervingar) og ein um *það sem við vitum ekki*. Vísindanöfn sjaldan og skýrt.

### 1.6 Hvernig kaflarnir kenna á bókina

- **Kafli 1, Egill kominn í hnakkinn** (`kafli1.js`, `butterflyIntoTheBook`): nærmynd yfir öxl Egils á fiðrildið á horni Mosa; Mosi: „Æ, þetta fiðrildi er alveg fyrir mér! Smelltu á það fyrir mig, Egill.“ Pikk (eða 8 s) sendir fiðrildið upp og mynd þess í bókina. Bókin opnast sjálf á **Dýrin** (handritsins; heldur engu) og Mosi segir: „Sjáðu! Fiðrildið flaug beint í Landkönnuðabókina þína. Þangað fara öll dýrin sem við finnum og stjörnurnar frá vinunum sem við bjóðum. Í henni er líka kort af skóginum, og leikir sem við lærum á leiðinni.“ og „Ýttu á krossinn til að loka bókinni og halda áfram. Þú getur alltaf opnað hana aftur.“ Krossinn glóir; bókin lokast sjálf eftir 10 s ef barnið gerir ekkert; pikki barnið inni í henni verður hún þess og leikurinn bíður.
- **Reiðtúrinn:** smádýr sem barnið pikkar á bregðast við, mynd þeirra flýgur í bókina, hún kinkar kolli og ber merki. Mosi segir eitthvað um dýrið (í kaflanum, ekki bókinni).
- **Lok kafla 1:** stjarna Kambeðlu flýgur í bókina; Kambeðla býður í Eitt!; bókin opnast á **Leikir** með Eitt! „Nýtt!“ og Mosi: „Ein komin. Hver ætli sé næst?“
- **Lok kafla 2:** stjarna Þórseðlu; bókin opnast á **Stjörnur** og flettir sjálf á **Kortið**; Mosi: „Tvær komnar. Og nú vitum við hvert við förum næst!“ Á kortinu segir Mosi setningu um hvern fundinn stað við pikk.

### 1.7 Þar sem kennslan er veik: hvað 6 ára barn sem les skilur ekki af sjálfu sér

1. **Að reitur opni spjald, að örvarnar fletti og að mynd stækki við pikk** segir enginn. Þegar bókin opnast fyrst sér barnið reiti (Mosa í lit, aðra sem „?“) en Mosi segir ekki „pikkaðu á dýr til að lesa um það“. Barn sem pikkar á fiðrildið finnur þetta sjálft; barn sem pikkar á „?“ heyrir „Finndu mig í skóginum!“ og lærir það. En stækkun myndar (pikk á myndina) og strokan uppgötvast aðeins af tilviljun.
2. **Flipparnir eru aldrei nefndir.** Orðin (Stjörnur, Dýrin, Leikir, Kortið, Safn) eru læsileg sex ára lesanda, og táknin hjálpa, en enginn segir að hægt sé að fletta með þeim. Mosi nefnir kort og leiki í kynningunni, en ekki flippana sjálfa.
3. **„Safn“ er dularfullt:** þar eru átta „?“ þar til Háls og hali hefur verið spilaður, og orðið „Safn“ segir barninu ekki að þetta sé steingervingasafn úr leiknum (fyrirsögnin *Steingervingasafn* er á síðunni, en ekkert tengir hana við Háls og hala).
4. **Stjörnusíðan er dauð:** pikk á stjörnu gerir ekkert nema tikk. Barn sem hefur unnið stjörnu og pikkar á hana fær enga umbun og ekkert um vininn.
5. **Vinirnir vantar í Dýrin** (1.5): mótsögn við kynningu Mosa.
6. **Milljónir ára** eru óhlutstæðar fyrir 6 ára barn; spjöldin nota samanburð þar sem þau eru best („heilinn á stærð við plómu“, „lengri en höndin á þér“), en enginn stærðarkvarði sýnir hve stór Mosi er við hlið Egils. Kambeðla er „stór“ og „allt að 9 m“ aðeins í heimildinni, ekki á síðunni.
7. **Nýtt í bókinni:** merkið og kinkið eru góð, en engin rödd segir „það er eitthvað nýtt í bókinni“; barn sem er upptekið við kaflann getur farið fram hjá merkinu.
8. **Bók handritsins er þögul:** þegar bókin opnast sjálf (lok kafla) les sögumaðurinn ekki fyrr en barnið snertir hana; það er rétt (engin rödd yfir Mosa), en þá sér barnið „Nýtt!“ og reiti án leiðsagnar meðan Mosi talar um annað.
9. **ⓘ-glugginn** er fullorðinstexti (höfundur, leyfi, slóð): í lagi, en börn pikka á hann af forvitni og fá ekkert sem þau skilja.

Það sem virkar vel og ber að halda: skuggamyndir með „?“ og „Finndu mig“ (barnið skilur strax að það vantar eitthvað og hvar), reitur sem vex í spjald, sögumaður sem les sjálfkrafa, hátalari til að heyra aftur, „Nýtt!“ og kink bókarinnar, Mosi sem talar í bókinni (kortið) með sinni rödd.

---

## 2. Efni sem má nota: beinagrindur, myndir, staðreyndir

Leitin var gerð 25.–26. október 2026; rannsóknarskrárnar þrjár með öllum færslum og slóðum eru í vinnuskjölum setunnar (`research-museums.md`, `research-sketchfab.md`, `research-images-facts.md`). Ekkert hefur verið hlaðið niður.

### 2.1 Beinagrindur í þrívídd

Leitað var (25.–26. október) á Smithsonian 3D, NHM London (gagnagátt og greinar), Sketchfab (opinbert API með leyfissíu CC0/CC BY/CC BY-SA), MorphoSource, Scan the World, Digimorph, phenome10k, Thingiverse, Printables, Wikimedia Commons og söfnum Berlínar, Leiden, AMNH, Field, Tyrrell, Oxford, Yale, Carnegie og Vínar. **Aðeins CC0, CC BY, CC BY-SA og almenningseign** teljast; CC BY-NC (Vín, NHM London, Idaho, Naturalis Trix o.fl.) er úti. Fyrirvarar: 3d.si.edu og si.edu loka á vélræna lesningu (Cloudflare), svo leyfi Smithsonian voru staðfest óbeint (Open Access API segir `access: CC0` á hverri færslu, CC-tilkynningin 2020 nefnir „3D scans of dinosaur skeletons“, Commons-spegill þríhyrnunnar er CC0); **eigandinn á að opna hverja Smithsonian-síðu og sjá „Usage: CC0“** áður en nokkru er hlaðið niður. MorphoSource, MyMiniFactory, Printables, Thingiverse og phenome10k lokuðu líka (403); það sem þaðan sást er óstaðfest. Digimorph er „personal education“ aðeins: ekki opið.

Markmið leiksins á hvert líkan: ≤50 þús. þríhyrningar, ≤2–3 MB, GLB með KHR_mesh_quantization (`tools/quantize-glb.mjs`, enginn afkóðari eins og Draco/KTX2 þarf; það var leið fiðrildisins), áferð sleppt eða ≤512 px WebP. Nær öll líkönin hér eru 150 þús.–5,7 millj. þríhyrningar, svo hvert þarf Blender-fækkun (`tools/blender-decimate.py` sýður saman saumana og fækkar) og léttingu: það er vinnuliður á hverja eðlu, ekki niðurhal og innsetning.

| Eðla | Besti kostur | Leyfi | Snið og stærð | Þarf | Annað |
|---|---|---|---|---|---|
| **Mosi** (Triceratops) | Smithsonian „Hatcher“-grindin, USNM PAL 500000, raunverulegur steingervingur: https://3d.si.edu/object/3d/triceratops-horridus-marsh-1889:d8c623be-4ebc-11ea-b77f-2e728ce88125 (og á Sketchfab, reikningur Smithsonian) | **CC0** (API; staðfesta á síðu) | GLB-afleiður: 150 þús. fletir með 1024 px áferð = 1,34 MB, 100 þús. „AR“ 3,45 MB; fullur OBJ 20 millj. fletir | fækka 150 þús. → ≤50 þús., áferð í 512 WebP eða sleppt | Zacxophone: hreinsuð, rigguð CC0-útgáfa af sama skanni, 29 þús. þríhyrningar, 2048 px áferðir (22 MB; minnka). toaste: Melbourne-grind CC BY, 22 þús. þríhyrningar, 7,8 MB. |
| **Kambeðla** (Stegosaurus) | Artec 3D / Triebold Paleontology: skanni af uppsettri grind Denver-safnsins (DMNS): https://sketchfab.com/3d-models/stegosaurus-skeleton-dc6e1c748484449587b81426d41da6cb | **CC BY** (höfundur nefndur í ⓘ) | GLB 172 MB, 5,67 millj. þríhyrningar, engin áferð | **þung** fækkun 5,7 millj. → 50 þús. (Blender, í áföngum) | Léttur kostur: Yanez „Simple Stegosaurus Skeleton“, listamannslíkan, CC BY, 20 þús. þríhyrningar, 3,8 MB, rigguð. **Sophie** (NHM) er *ekki* á gagnagátt NHM (API: 0 gagnasöfn); eina opna rúmfræði hennar er CC BY **3D-PDF** í PLOS ONE (Maidment o.fl. 2015, S1), sem þarf að draga út úr U3D/PRC: ópraktískt. Smithsonian á aðeins halagadda (CC0). |
| **Þórseðla** (Brontosaurus) | **Engin opin brontósárus-, apatósárus- eða diplódókus-grind til.** Næst: Dreadnoughtus (títanósár, risavaxin frænka), laserskanni í Carnegie-safninu: https://sketchfab.com/3d-models/dreadnoughtus-skeleton-efd757df9f3e493e9e741971e63deeb8 | CC BY | 197 MB, 2,34 millj. þríhyrningar, engin áferð | þung fækkun; **heiðarlegur texti**: „beinagrind frænku Þórseðlu“ | Emm: iPhone-skanni af uppsettum „Brontosaurus“ (Paris MNHN), CC BY, 84 þús. þríhyrningar, 93 MB áferð, lítil nákvæmni. Dippy (NHM London) og Vínar-Diplodocus eru NC/aðeins til sýnis. Camarasaurus-haus úr birtum gögnum, CC BY, 250 þús. |
| **Flugeðla** (Pteranodon) | **Engin opin heil grind.** Haus: Ualde „Pteranodon skull“, listamannslíkan: https://sketchfab.com/3d-models/pteranodon-skull-craneo-de-pteranodon-3b5e1a001d204b3f9d5bc1f97249b471 | CC BY | 34 þús. þríhyrningar, 3,5 MB | áferð minnkuð | Smithsonian: stakt lærbein og hryggjarliðir Pteranodon, CC0. Alvöru skanni af fótbeinum og klóm, CC BY, 180 þús. Hér þyrfti **okkar eigin stílfærða beinagrind** eða hausinn einan með „vængbeinin“ sem bein í röð. |
| **Uggeðla** (Spinosaurus) | Listamannslíkön aðeins (enginn heill steingervingur er til í raun, sem er sjálft kennsluatriði: „enginn hefur fundið heila beinagrind!“). PlaugesOfDeath: https://sketchfab.com/3d-models/spinosaurus-skeleton-3eb1da77354e4f65a29734a9a9b40a35 | CC BY | 25 þús. þríhyrningar, 1,07 MB, engin áferð | nær tilbúið | Gravinuke „Realistic Spinosaurus Skeleton“, CC BY, 122 þús., 4 áferðir 1024, 11,8 MB (fallegra, þarf fækkun). Commons-STL af haus er merkt „ónákvæmt“. |
| **Slóeðla** (Parasaurolophus) | „Joe“, RAM 14000: **ung slóeðla**, raunverulegur steingervingur (Alf-safnið), hreinsuð til prentunar af Olof Moleman: https://sketchfab.com/3d-models/baby-parasaurolophus-skeleton-18de87dd270f478bbbeb310cd514cc00 | CC BY | 400 þús. þríhyrningar, 14,9 MB, engin áferð | fækkun → 50 þús.; texti: „ung slóeðla, Joe“ (skólapiltur fann hann 2009) | Upprunagögn: figshare 692151 (vinstri hálfur haus, nefgöng, heilarúm, STL, CC BY 4.0, staðfest) og Commons-STL af hægri hlið grindarinnar sem hún liggur í steininum, CC BY 4.0, 19 MB. **Engin fullorðin** opin grind. |
| **Grameðla** (T. rex) | Smithsonian „Nation's T. rex“, USNM PAL 555000: https://3d.si.edu/object/3d/tyrannosaurus-rex:d8c62d28-4ebc-11ea-b77f-2e728ce88125 (sena með þríhyrnunni; grindin í 4 hlutum × 75 þús. fleti) | **CC0** (API; staðfesta á síðu) | GLB-afleiður í 4 hlutum, áferð; niðurhalssnið síðunnar ólesin | fækka og sameina hluta | Proflibrary09: heil grind úr Smithsonian-gögnunum, CC BY, 1 millj. þríhyrningar, 29 MB. Rigsters: ljósmyndaskanni af eftirlíkingu (Knuthenborg), CC BY, 250 þús., áferð, 63 MB (einnig STL 12 MB á Commons, CC BY 4.0). Haus: Digital Atlas of Ancient Life, CC0, 618 þús. |

**Smádýrin** (opin líkön eru til af nær öllum, en engin „beinagrind“ af skordýrum, sem hafa ytri stoðgrind; hér væri sýnt dýrið sjálft skannað):

| Dýr | Kostur | Leyfi | Stærð |
|---|---|---|---|
| Fuglar / Fornfugl (Archaeopteryx) | Smithsonian-hella A. siemensii (afsteypa?), GLB 150 þús., 3,75 MB (1024 px: 0,78 MB), CC0; Dundee-afsteypa Berlínareintaksins, CC0, 637 þús. | CC0 | lítil |
| Froskur | Blackburn Lab / Florida Museum, míkró-CT-grindur (Greenhouse frog 527 þús., Gopher frog 887 þús.), CC BY | CC BY | 70–117 MB, þarf fækkun |
| Skjaldbaka | Smithsonian Pseudemys idahoensis (steingerð), GLB 4,3 MB, CC0; RISD-skeljar CC BY 500 þús.; snapping turtle heil grind CC BY 2 millj.; grænskjaldböku-haus CC0 202 þús. | CC0 / CC BY | misjafnt |
| Salamandra | GigaScience axólotl-grind (míkró-CT), CC BY, 423 þús., 11,9 MB | CC BY | fækkun |
| Fiskur (Lepidotes) | mnhnl Lúxemborg: Lepidotes elvensis TU503 og ~19 fleiri steingervingar á hellu, CC BY, 500 þús., áferð, 38,6 MB | CC BY | fækkun |
| Bjalla, brunnklukka, vatnalæsingi, drekafluga | ffish.asia / floraZia.com: ljósmyndaskannar af eintökum, **CC0** (vatnalæsingi 52 þús., 4,4 MB; brunnklukka 204 þús.; drekaflugur 185–345 þús.); DiNArDa-bjöllur CC0/CC BY 75–150 þús. | CC0 | 4–47 MB, fækkun |
| Snigill | Meshfinder „Snail Shell“, leikjatilbúin, CC BY, 3,7 þús. þríhyrningar (18 MB áferðir: minnka); Smithsonian Ecphora-kuðungur, CC0, GLB 3,8 MB; DiNArDa Aegopinella CC0 71 þús. | CC BY / CC0 | lítil |

**Samantekt:** af eðlunum sjö eiga **fjórar** opin líkön byggð á raunverulegum steingervingum (Mosi og Grameðla CC0 frá Smithsonian; Kambeðla CC BY frá Artec/DMNS; Slóeðla sem ungviði, CC BY), **ein** aðeins listamannslíkan (Uggeðla, sem er líka sannleikurinn: engin heil grind hefur fundist) og **tvær gloppur**: Þórseðla (aðeins frænka, Dreadnoughtus) og Flugeðla (aðeins haus). Fyrir gloppurnar eru þrjár leiðir: (i) frænka með heiðarlegum texta, (ii) okkar eigin stílfærða beinagrind í Blender í stíl leiksins (sama fyrir allar sjö, ef eigandinn kýs sögubókarstíl frekar en skanna), (iii) sýna aðeins það sem er til (haus Flugeðlu, bein) og segja frá því. Rannsóknarskrárnar með öllum ~70 færslum eru í vinnuskjölum setunnar (`research-sketchfab.md`, `research-museums.md`).

### 2.2 Opnar myndir

Á Wikimedia Commons fundust og voru **leyfin lesin af síðu hverrar myndar** (aðeins CC0, CC BY, CC BY-SA og almenningseign; engin NC/ND): þríhyrna 12, kambeðla 13, brontósárus 10, Pteranodon 9, Spinosaurus 12, Parasaurolophus 12, T. rex 16 myndir, og 1–3 af hverju smádýri (einnig Proganochelys, Odontochelys, Chunerpeton, Lepidotes, Kalligramma, Solnhofen-drekaflugur). Myndirnar skiptast í fimm gerðir, sem passa við síður spjaldanna og sýningarskápinn: (a) uppsett beinagrind á safni, (b) höfuðkúpa, (c) **stærðarmynd með manni**, (d) lífsmynd (teikning af dýrinu lifandi), (e) frægur steingervingur (húð, fótspor, tennur). Það besta í hverjum flokki:

| Eðla | Beinagrind á safni | Höfuðkúpa | Stærðarmynd (c) | Lífsmynd | Sérstakt |
|---|---|---|---|---|---|
| Mosi | „Hatcher“ Smithsonian (Gareth Milner, CC BY 2.0, 6016 px); Royal Tyrrell hliðarsýn (CC BY-SA 4.0) | UCMP Berkeley (CC BY 3.0) | `Triceratops_Scale_V1.svg` (Slate Weasel, **almenningseign**, vektor) | Dmitry Bogdanov (CC BY 3.0, 2720 px) | **húð þríhyrnu, CC0** (Houston) |
| Kambeðla | **Sophie**, NHM London (APK, CC BY 4.0, 3755 px; önnur 10 374 px CC BY-SA); Senckenberg á hvítum grunni (CC BY-SA 2.5) | AMNH (CC BY-SA 4.0) | `Stegosaurus_size_comparison.svg` (KoprX, CC BY-SA 4.0) | Fred Wierum, Sophie lifandi (CC BY-SA 4.0, 3500 px) | **heilarúmið** teiknað 1885 (almenningseign): „heili á stærð við plómu“; hálshúð (CC BY-SA) |
| Þórseðla | Yale Peabody, eina raunverulega brontósárus-grindin, endurreist 2024 (CC BY-SA 2.0, 5400 px; eldri CC BY 2.0) | **engin raunveruleg höfuðkúpa er til**: mótuð kúpa Yale (CC BY 4.0) | `Apatosaurus_scale_mmartyniuk_wiki.png` með brontósárus (Martyniuk, CC BY-SA 4.0) | Tom Parker (CC BY-SA 4.0, 3368 px) | risafótspor mælt 1952 (almenningseign) |
| Flugeðla | AMNH-afsteypa (Martyniuk, CC BY 3.0, 1000 px); önnur grind (CC BY-SA 2.0, 4752 px) | AMNH (CC BY-SA 2.0); Tenerife (CC BY-SA 4.0) | aðeins ein, 480 px (Martyniuk, CC BY 3.0): **þarf að teikna sjálf** | Martyniuk (CC BY 3.0, 500 px) | **höfuðkúpa með fisk í hálsinum** (CC BY-SA 2.0) |
| Uggeðla | National Geographic-safnið (CC BY 2.0, 5184 px); Field Museum 2026 (CC BY-SA 4.0, 8192 px); grind á hvítum grunni (CC BY-SA 3.0) | NatGeo (CC BY 2.0) | `Spinosaurus_size_comparison.svg` (KoprX, CC BY-SA 4.0, 2026-útgáfa) | Joschua Knüppe (CC BY 4.0); 2020-gerð með spaðahala (CC BY-SA 4.0) | tönn og seglbein, Mílanó (CC BY-SA 4.0). *Eldri myndir (fyrir 2014) eru úreltar.* |
| Slóeðla | Field Museum (CC BY 2.0, 3648 px; CC BY-SA 4.0) | haus með kambi, Field (**almenningseign**) | `Parasaurolophus_Scale.svg` (Slate Weasel, **almenningseign**, vektor) | Walters/Senter/Robins úr PLOS (CC BY 2.5); Ashbridge (CC BY-SA 4.0, 4000 px) | **skurðmynd af holum kambinum**, „lúðurinn“ (CC BY-SA 3.0) |
| Grameðla | **Sue** hliðarsýn (Dallas Krentzel, CC BY 2.0, 5722 px); Sue 2018 (CC BY-SA 4.0); Stan-afsteypa Houston | Burke-safnið (**CC0**, 5184 px); Museum of the Rockies (CC BY-SA 2.0) | `Tyrannosaurus_specimens.svg` (KoprX, CC BY-SA 4.0); `TRex_vs_Human.svg` (CC BY-SA 3.0) | Steveoc 86 (CC BY-SA 4.0) | kjálki með tönnum (CC BY-SA 4.0); húðför af hala (CC BY-SA 4.0); fótspor (CC BY 2.0) |

Smádýrin eiga nú ljósmyndir sem spjöld Fensins vantar (`wanted` í `cards.json`): froskur og halakörtur (CC BY-SA), tjarnarskjaldbaka (CC BY 4.0), Proganochelys og Odontochelys steingervingar og lífsmyndir (CC BY/CC BY-SA), Chunerpeton-steingervingur í Peking (CC BY-SA 4.0), Lepidotes frá Solnhofen (CC BY 2.0), brunnklukka (CC0; önnur mynd sýnir hana ráðast á litla körtu: dæma barnvænleik), vatnalæsingi á vatni (CC BY-SA 4.0), keisaradrekafluga (CC BY 3.0) og Solnhofen-drekaflugur (CC BY-SA 4.0), Kalligramma-steingervingur og í rafi (CC BY-SA 4.0), júra-sniglar í kalksteini (CC BY-SA 3.0). Smithsonian Open Access (CC0-ljósmyndir af Hatcher, T. rex þjóðarinnar og kambeðlu) og PhyloPic (CC0/CC BY skuggamyndir allra sjö) eru til viðbótar; Smithsonian-síðurnar þarf eigandinn að opna sjálfur. Allar slóðir eru í `research-images-facts.md`.

### 2.3 Barnvænar staðreyndir með heimildum

Heimildir: NHM Dino Directory (sex af sjö; ekki Pteranodon og brontósárus), Wikipedia sem vísir á Paul 2016, Sereno 2022, Ibrahim 2020, Witton & Habib 2010 o.fl., AMNH og UCMP. Tölur fyrir stærðarkvarðann:

| Eðla | Lengd | Hæð | Þyngd | Át | Lifði | Heimildir |
|---|---|---|---|---|---|---|
| Mosi | 8–9 m (NHM 9) | 2,3–3 m | 6–10 t | plöntur, harðar pálmablöðkur | 68–66 millj. ára | NHM Dino Directory; Wikipedia |
| Kambeðla | 6,5–9 m (Sophie 5,8) | Sophie 2,9 m; hausinn ekki hærra en ~1 m | 3,5–5 t (Sophie ~1,6) | lágvaxnar plöntur, með goggi | 152–145 | NHM; Wikipedia |
| Þórseðla | 21–23 m | **engin birt hæð** (kvarðamynd gefur ~4–5 m við mjaðmir) | 15–20 t | burknar, elftingar, köngulpálmar | 156–147 | Wikipedia; NHM Apatosaurus |
| Flugeðla | vænghaf karldýra 5,6 m, allt að 7,6; búkur 2,6 m | – | **20–35 kg, eins og sex ára barn** | fiskur (fiskbein í maga) | 86–78 | Wikipedia; AMNH |
| Uggeðla | 14 m (lengsta ránrisaeðlan) | segl 1,5 m | 7,4 t | fiskur | 99–94 | NHM; Wikipedia |
| Slóeðla | 7,5–9,5 m | nær mat 4 m uppi | 2,6–5 t | barr og lauf | 77–73 | NHM; Wikipedia |
| Grameðla | 12–13 m | 3,5–4 m við mjaðmir | 5–9 t | kjöt: andaeðlur, ungar þríhyrnur | 68–66 | NHM; Wikipedia |
| Til samanburðar | strætó 12 m; bíll 4,5 m; tveggja hæða hús ~8 m upp í mæni; gíraffi 4,3–5,7 m; fíll 3,2 m á herðar, 6 t; **sex ára barn 1,15 m** (CDC 50. hundraðsmark) | | | | | Wikipedia; skipulagsgögn; CDC statage.csv |

Dæmi um staðreyndir sem henta sex ára barni (hver með heimild í rannsóknarskránni): þríhyrna með horn sem beit var af og greri; 400–800 tennur í röðum; heili kambeðlu á stærð við plómu og plöturnar sátu í húðinni og falla því af í steingervingum; brontósárus þýðir „þrumueðla“, var kölluð Apatosaurus í 100 ár og **engin höfuðkúpa hennar hefur fundist**; Pteranodon þýðir „vængur án tanna“, vó eins og sex ára barn þótt vængirnir væru eins og lítil flugvél, og 1 200 eintök eru þekkt; Spinosaurus var lengri en T. rex en lægri, veiddi fisk og fékk spaðahala 2020, fyrstu beinin eyðilögðust í sprengjuárás 1944; kambur Parasaurolophus var holur lúður og hljóðið var endurgert (djúpt ~30 Hz); T. rex með 60 tennur eins og bananar, lyktaði vel og hljóp aðeins ~22 km/klst (hjól kemst undan). Fyrir smádýrin: öglir á stærð við hrafn; Odontochelys með hálfa skel og tennur; Proganochelys gat ekki dregið hausinn inn og hafði gadda á hálsinum; brunnklukkan ber loftbólu eins og kafari og flýgur á nóttinni eftir glampa tunglsins; drekaflugan með 24 000 linsur í auga.

