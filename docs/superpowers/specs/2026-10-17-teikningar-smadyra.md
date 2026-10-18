# Teikningar af smádýrunum fimm: lýsingar og stílforskrift (hluti 2)

Eigandinn teiknar smádýrin fimm fyrir spjöldin í Landkönnuðabókinni, til dæmis í Tripo, eftir lýsingunum hér (sjá [hönnunina](2026-10-17-landkonnudabok-fraedsla-design.md), kafla 5.4). Fyrst kemur ein stílforskrift sem gildir um allar myndirnar, á íslensku og ensku. Síðan kemur ein lýsing á hverju dýri, með fjórum liðum:

- **Lýsing:** hvernig dýrið lítur út.
- **Heimild:** ritið eða safnasíðan sem útlitið byggist á.
- **Frjálst:** það sem er ímyndað eða einfaldað, því steingervingar sýna sjaldan liti og mjúkvefi.
- **Tripo:** tvær enskar línur til að líma í Tripo, því Tripo skilur ensku best: jákvæð lína fyrir lýsingarreitinn og neikvæð lína fyrir neikvæða reitinn (það sem á ekki að vera með). Jákvæða línan hefur engar neitanir, því neitanir í lýsingu eru oft hunsaðar eða virka öfugt.

Smíðin heldur áfram með staðgenglum þar til teikningarnar berast.

## 1. Stílforskrift fyrir allar fimm myndirnar

**Íslenska.** Allar myndirnar eiga að líta út eins og þær séu úr sömu barnabók: mjúk, þybbin og ávöl form, máluð með mattri áferð (ekkert glansandi, engin ljósmynd). Litirnir koma úr stílforskrift leiksins (`remake/STYLE.md`, kafli 10): pappír `#f6efdf`, blek `#3b2f25`, appelsínugulur `#e07a3f`, grænblár `#2f8f86`, stjörnugull `#f2b630` og grænn `#6fae4f`, og með þeim jarðlitir skógarins (kafli 4). Þeir eru hlýir og mjúkir, aldrei skærir eða skerandi. Dýrið er vinalegt: stór, skýr augu, milt bros, engar hvassar tennur og engir hvassir oddar sem beinast að áhorfandanum (kafli 2 og 3). Á myndinni er eitt dýr, allt í mynd, séð skáhallt framan frá (hvorki beint framan frá né beint frá hlið) og með skýra útlínu. Bókin sýnir ófundið dýr sem svarta skuggamynd af myndinni, svo dýrið þarf að þekkjast af útlínunni einni: fætur, fálmarar, rani og skott standa frjáls frá búknum í stað þess að renna saman við hann. Bakgrunnurinn á að vera einlitur, ljós og sléttur þegar myndin er gerð, án landslags, svo auðvelt sé að klippa dýrið út. **Lokamyndin er útklippt: eitt dýr á gegnsæjum bakgrunni (vistað sem PNG eða WebP með gegnsæi), án jarðar eða grass undir dýrinu, án ramma og án skugga sem dýrið varpar.** Bókin bætir sjálf við mjúkum skugga, og allt annað á myndinni en dýrið yrði að svörtum kassa eða bletti í skuggamyndinni.

**English.** All five pictures should look as if they come from the same children's storybook: soft, chunky, rounded shapes with a matte painted look (nothing glossy, not a photo). The colours come from the game's style guide (`remake/STYLE.md`, section 10): paper `#f6efdf`, ink `#3b2f25`, orange `#e07a3f`, teal `#2f8f86`, star gold `#f2b630` and green `#6fae4f`, with the forest's earth tones beside them (section 4). They are warm and gentle, never bright or harsh. The animal is friendly: big, clear eyes, a gentle smile, no sharp teeth and no sharp points aimed at the viewer (sections 2 and 3). There is exactly one animal in the picture, the whole body in view, seen in a front three-quarter view (neither straight on nor in side profile), with a clear outline. The book shows an animal the child has not found yet as a solid black silhouette of the picture, so the animal must be recognisable from its outline alone: legs, feelers, proboscis and tail stand free of the body instead of merging into it. While the picture is being made, the background is plain, flat and light, with no scenery, so the animal is easy to cut out. **The finished picture must be a cut-out: one animal on a transparent background (saved as PNG or WebP with transparency), with no ground or grass under it, no frame and no cast shadow.** The book adds its own soft shadow, and anything on the picture other than the animal would turn into a black box or blotch in the silhouette.

## 2. Hvernig myndunum er skilað

- **Skráarnöfn:** auðkenni spjaldanna: `kalligrammatid`, `beetle`, `frog`, `snail` og `birds`. Staðgenglarnir í `remake/assets/book/lab/` heita það sama.
- **Snið:** PNG eða WebP með gegnsæjum bakgrunni (alfarás), ekki JPEG, því JPEG getur ekki geymt gegnsæi. Myndin er lárétt, breiðari en hún er há, um 4:3 (til dæmis 1600 × 1200 punktar), að minnsta kosti 1024 punktar á lengri hlið, og dýrið í miðjunni með rými í kringum sig. Smíðin minnkar myndina í mest 1024 punkta á lengri hlið og býr til smámynd fyrir reitinn.
- **Útklipping:** hver sú leið dugar sem gefur hreina, útklippta mynd: gegnsæ mynd beint úr Tripo, bakgrunnurinn fjarlægður með forriti sem gerir það, eða mynd af líkaninu með gegnsæjum bakgrunni.
- **Prófun á skuggamyndinni:** dýrið fyllt með svörtu á hvítum bakgrunni þarf enn að þekkjast. Þekkist það ekki, er stellingunni breytt svo fætur, rani eða skott standi frjáls frá búknum.

## 3. Dýrin fimm

| Spjald | Skrá | Fyrirmynd |
| --- | --- | --- |
| Kalligrammatíð („fiðrildið“) | `kalligrammatid` | skyld blúnduvængjum, með stóra augnbletti á breiðum vængjum og langan rana, eftir útgefnum endurgerðum |
| Bjalla | `beetle` | bjalla frá júratímabilinu, af fornum bjölluhópi (*Archostemata*) |
| Froskur | `frog` | *Prosalirus bitis*, froskur frá byrjun júratímabilsins |
| Snigill | `snail` | landsnigill með spíralkuðung |
| Fuglar | `birds` | fornfugl með *Archaeopteryx* að fyrirmynd: tennur, klær á vængjum, langt beinótt skott og fjaðrir |

Hver jákvæð lína er sjálfstæð og hefur stílinn með, svo hana má líma eina og sér. Neikvæðu línurnar eiga heima í neikvæða reitnum; sýni Tripo engan slíkan reit, er þeim sleppt, og bakgrunnurinn og skugginn eru þá fjarlægðir eftir á með útklippingunni (kafli 2).

### 3.1 Kalligrammatíð („fiðrildið“), skrá `kalligrammatid`

**Lýsing.** Skordýr sem líkist fiðrildi en er skylt blúnduvængjum (*Neuroptera*), ekki fiðrildum. Vængirnir eru stórir og breiðir, með fínum æðum, og útbreiddir svo þeir sjáist vel. Á hverjum framvæng er stór, kringlóttur augnblettur: dökk miðja, hringir í öðrum lit utan um hana og fáeinir örsmáir, ljósir, sporöskjulaga dílar. Úr höfðinu vex langur, mjúkur rani sem sveigist fram og niður, með ávölum enda eins og þykkt sogrör. Búkurinn er sterkbyggður og þykkur, en höfuðið lítið, með stór, vingjarnleg augu. Dýrið er séð skáhallt framan frá og ofan frá, með vængina opna og hallandi að áhorfandanum, svo bæði augnblettirnir og raninn sjáist vel.

**Heimild.** Labandeira o.fl. 2016, „The evolutionary convergence of mid-Mesozoic lacewings and Cenozoic butterflies“, *Proceedings of the Royal Society B* 283 (1824): 20152893, [doi:10.1098/rspb.2015.2893](https://doi.org/10.1098/rspb.2015.2893) (opin grein: [PMC4760178](https://pmc.ncbi.nlm.nih.gov/articles/PMC4760178/)). Búkurinn er sterkbyggður samkvæmt inngangi greinarinnar, sem kallar blúnduvængjurnar í ættinni stórar og sterkbyggðar („large, robust-bodied Neuroptera“). Greinin segir frá vænghafi allt að u.þ.b. 160 mm, augnblettum á framvængjum með dökkri miðju sem hringir og örsmáir, ljósir, sporöskjulaga dílar umlykja (mynd 1 og 2), og löngum, sveigjanlegum rana, 8–20 mm að lengd, án stunguhluta og með ávölum eða þverskornum enda („truncate“ í greininni), eins og á þykku sogröri. Lögun vængjanna (breiðir, með fínum æðum) er ekki lýst í texta greinarinnar; hana á að taka af myndum hennar: steingervingunum í mynd 1 (a–i, með örvum sem benda á ranana) og endurgerðinni í mynd S6i, sem Vichai Malikul hjá Smithsonian teiknaði (samkvæmt þakkarorðum greinarinnar og undirskrift hans á myndinni). Mynd S6 er síðasta myndin í viðbótargögnum greinarinnar, sem eru á PMC sem skráin „Data Supplement“ (Word-skjal, um 13 MB), og endurgerðin er stóra teikningin á henni, merkt (i), af dýrinu á plöntu. Þakkarorðin vísa í endurgerðina sem „figure 4l“, en það er úrelt tilvísun: greinin hefur aðeins myndir 1–3, bæði á PMC og í PDF-útgáfu tímaritsins, svo enginn þarf að leita að mynd 4.

**Frjálst.** Litirnir eru ímyndaðir, því steingervingar sýna þá ekki. Miðja augnblettanna gæti hafa innihaldið melanín, dökkt litarefni (greinin segir það óvíst), svo dökkbrúnar miðjur eru í lagi. Tillaga: vængir í rjómahvítum, fölgulum og ferskjulitum tónum (`#f6f1e4`, `#f2dc94`, `#f3b996`, litir fiðrildanna í skóginum, svo barnið þekki þau) og dökkbrúnir augnblettir (`#6e5440`) með ljósum dílum. Fálmarar og fætur eru frjálsir: tveir grannir fálmarar og sex mjóir fætur. Greinin nefnir engin hlutföll búksins, aðeins að hann sé sterkbyggður: hlutföllin (hve þykkur hann er miðað við vængina) og lögun hans eru ímynduð. Litla höfuðið með stóru, vingjarnlegu augunum er líka ímyndað; í texta greinarinnar er hvorki minnst á stærð höfuðsins né augu dýrsins.

**Tripo, jákvæð lína.**

```text
Cute storybook illustration of a Kalligramma, an extinct Jurassic lacewing that looks like a butterfly: very broad, finely veined wings opened wide and tilted toward the viewer, a large round eyespot on each forewing (dark brown centre, soft rings around it, a few tiny pale ovals), a long soft curved proboscis like a thick drinking straw, a sturdy, thick body, a small head with big friendly eyes, two thin antennae, six slim legs, cream, pale yellow and peach wings, seen from slightly above in a front three-quarter view, soft chunky rounded shapes, matte painted storybook look, a single animal with the whole body in view, plain flat light background
```

**Tripo, neikvæð lína.**

```text
ground, grass, floor, scenery, cast shadow, drop shadow, frame, border, text, watermark, extra animals, photo, glossy, sharp teeth, cropped, folded wings
```

### 3.2 Bjalla, skrá `beetle`

**Lýsing.** Lítil bjalla frá júratímabilinu, af fornum bjölluhópi (*Archostemata*, til dæmis ættirnar *Ommatidae* og *Cupedidae*; hin síðarnefnda heitir á ensku „reticulated beetles“). Búkurinn er ílangur, sporöskjulaga og svolítið flatur, með bólur á bakinu. Skjaldvængirnir, hörðu fremri vængirnir sem hylja bakið, ná rétt aftur fyrir afturbolinn og eru merktir reglulegum röðum af litlum, ferköntuðum dældum eins og gluggum. Höfuðið er með stór, útstæð augu, stutta fálmara (þráðlaga eða eins og perlur á bandi) og litla, ávala kjálka. Sex stuttir fætur standa greinilega út frá búknum. Bjallan er séð skáhallt framan frá og ofan frá, svo bakið með dældaröðunum sjáist.

**Heimild.** Tan, Wang, Ren og Yang 2012, „New fossil species of ommatids (Coleoptera: Archostemata) from the Middle Mesozoic of China illuminating the phylogeny of Ommatidae“, *BMC Evolutionary Biology* 12: 113, [doi:10.1186/1471-2148-12-113](https://doi.org/10.1186/1471-2148-12-113) (opin grein: [PMC3518168](https://pmc.ncbi.nlm.nih.gov/articles/PMC3518168/)). Hún lýsir fjórum nýjum tegundum fornra bjallna, þremur úr Jiulongshan-myndun í Innri-Mongólíu (frá miðju júratímabilsins, Daohugou) og einni úr Yixian-myndun í Liaoning (frá byrjun krítartímabilsins). Þær eru 6,6–9,0 mm langar og þaktar hnúðum. Tvær eru kallaðar flatar (*Omma delicata* og *Pareuryomma cardiobasis*), og um ættkvíslina *Omma* segir greinin að búkurinn sé ílangur, í meðallagi flatur eða næstum sívalur. Augun eru útstæð hjá þremur þeirra og fálmararnir stuttir hjá þremur (hjá *Pareuryomma ancistrodonta* er fálmarasvipan ekki varðveitt). Skjaldvængirnir ná rétt aftur fyrir afturbolinn hjá þeim öllum. Hólfin („cells“, gluggalaga dældir) eru í röðum: lýsing ættkvíslarinnar *Pareuryomma* nefnir 8 raðir og *Tetraphalerus decorosus* hefur 9, en hjá *Omma delicata* eru hólfin óskýr. Fæturnir eru stuttir hjá *Pareuryomma* og *Tetraphalerus*, kjálkar *Tetraphalerus decorosus* eru óvenju langir, og í nafngift *Pareuryomma ancistrodonta* er talað um sigðlaga kjálka. Ponomarenko og Ren 2010, „First Record of *Notocupes* (Coleoptera: Cupedidae) in Locality Daohugou, Middle Jurassic of Inner Mongolia, China“, *Annales Zoologici* 60 (2): 169–171, [doi:10.3161/000345410X516812](https://doi.org/10.3161/000345410X516812), lýsir skyldri bjöllu (*Notocupes pingi*) frá miðju júratímabilsins í Daohugou.

**Frjálst.** Litirnir eru ímyndaðir. Tillaga: grænbláir skjaldvængir (`#2a9689`) með fáeinum gylltum doppum (`#f2c443`), eins og litla bjallan í skóginum, svo barnið þekki hana. Dældirnar eru einfaldaðar: fáar, breiðar raðir duga, ekki hver gluggi. Fæturnir eru stuttir hjá *Pareuryomma* og *Tetraphalerus* og ná varla út fyrir búkinn; hér standa þeir greinilega út frá honum, svo að skuggamyndin þekkist. Kjálkarnir eru litlir og ávalir; í steingervingum sumra tegunda eru þeir langir eða sigðlaga, en hér eiga þeir ekki að vera ógnandi.

**Tripo, jákvæð lína.**

```text
Cute storybook illustration of a small Jurassic beetle of an ancient group, a reticulated beetle: an oval, slightly flattened body with a bumpy back, teal wing covers with neat rows of small square pits like little windows and a few gold dots, a small head with big round bulging friendly eyes, short thread-like antennae, tiny rounded jaws, six short legs standing clear of the body, seen from slightly above in a front three-quarter view, soft chunky rounded shapes, matte painted storybook look, a single animal with the whole body in view, plain flat light background
```

**Tripo, neikvæð lína.**

```text
ground, grass, floor, scenery, cast shadow, drop shadow, frame, border, text, watermark, extra animals, photo, glossy, sharp teeth, cropped, large pincers, long sharp jaws, horns
```

### 3.3 Froskur, skrá `frog`

**Lýsing.** Lítill, þybbinn froskur frá byrjun júratímabilsins. Fyrirmyndin er *Prosalirus bitis*, einn elsti froskur sem þekkist og líkist nútímafroskum. Hann situr hnipraður, tilbúinn að stökkva: breiður haus með stór, útstæð augu og milt bros, stuttur búkur, enginn hali, stuttir framfætur og langir afturfætur sem eru samanbrotnir en standa skýrt út frá búknum. Húðin er slétt og mjúk. Froskurinn er séður skáhallt framan frá.

**Heimild.** *Prosalirus bitis* var lýst af Shubin og Jenkins 1995, „An Early Jurassic jumping frog“, *Nature* 377: 49–52, [doi:10.1038/377049a0](https://doi.org/10.1038/377049a0). Frumgreinin var ekki lesin við gerð þessarar lýsingar, svo henni er ekkert eignað hér nema nafn dýrsins. Aldur, fundarstaður og mjaðmarbeinið eru úr Stocker o.fl. 2019, „The earliest equatorial record of frogs from the Late Triassic of Arizona“, *Biology Letters* 15 (2): 20180922, [doi:10.1098/rsbl.2018.0922](https://doi.org/10.1098/rsbl.2018.0922) (ókeypis að lesa, en öll réttindi áskilin: [PMC6405462](https://pmc.ncbi.nlm.nih.gov/articles/PMC6405462/)): *Prosalirus bitis* er úr Kayenta-myndun á Navajo-verndarsvæðinu (Navajo Nation) í suðvesturhluta Bandaríkjanna, frá snemma júratímabilinu, og bindur enda á um 60 milljón ára eyðu í steingervingasögu froska; hluti mjaðmarbeinsins (*iliac shaft*) er langur eins og hjá nútímafroskum. Talan 190 milljón ár, halaleysið og langir afturfætur eru úr samantekt Michael Abrams í [*Discover*](https://www.discovermagazine.com/environment/leap-forward-high-over-it) (janúar 1996), tímaritsgrein sem er ekki ritrýnd: 190 milljón ára gamall froskur af Navajo-verndarsvæði í Arizona, sem hafði misst hala forfeðra sinna, með afturfætur nógu langa fyrir kröftugt stökk fram á við.

**Frjálst.** Stellingin (hnipraður, tilbúinn að stökkva), hlutföll höfuðs, búks og framfóta, húð og andlitssvipur eru ímynduð og ekki höfð eftir heimildunum hér að ofan, og litirnir líka, því steingervingar sýna þá ekki. Tillaga: grænt bak (`#66ac47`, ljósara efst `#98d25c`), rjómalitaður kviður (`#f4edbb`) og gullin augu (`#f2c443`), eins og litli froskurinn í skóginum.

**Tripo, jákvæð lína.**

```text
Cute storybook illustration of Prosalirus, an Early Jurassic jumping frog: a plump little frog crouched ready to leap, a wide head with big bulging gold eyes and a gentle smile, long folded hind legs standing clear of the body, short front legs, smooth green back and cream belly, seen in a front three-quarter view, soft chunky rounded shapes, matte painted storybook look, a single animal with the whole body in view, plain flat light background
```

**Tripo, neikvæð lína.**

```text
ground, grass, floor, scenery, cast shadow, drop shadow, frame, border, text, watermark, extra animals, photo, glossy, sharp teeth, cropped, tail
```

### 3.4 Snigill, skrá `snail`

**Lýsing.** Landsnigill með stóran, kringlóttan kuðung sem er vafinn í spíral og situr á baki mjúks líkama. Undir líkamanum er breiður, flatur og vöðvamikill fótur sem snigillinn skríður á. Á höfðinu eru tvö pör af fálmurum: efra parið er lengra og ber augu á endunum, neðra parið er styttra og án augna. Snigillinn er séður skáhallt framan frá, svo bæði kuðungsspíralinn og augun á fálmurunum sjáist. Hann er sýndur án slímslóðar og án jarðar.

**Heimild.** Richard Fox, *Invertebrate Anatomy OnLine*, „Garden Snail“ (Lander University, 2001, [lanwebs.lander.edu/faculty/rsfox/invertebrates/helix.html](https://lanwebs.lander.edu/faculty/rsfox/invertebrates/helix.html)): þunnur, hnöttóttur kuðungur með spíralrákum, vöðvamikill fótur með sléttum sóla og tvö pör af fálmurum þar sem augun sitja á endum stærra, efra parsins. University of California Museum of Paleontology (Berkeley), [„Gastropoda“](https://ucmp.berkeley.edu/taxa/inverts/mollusca/gastropoda.php): einn kuðungur, oft spíralvafinn, og stór fótur sem dýrið skríður á.

**Frjálst.** Litirnir eru ímyndaðir. Tillaga: appelsínugulur kuðungur (`#ee8650`) með rjómalitum röndum (`#f9ebcb`) og rjómalitaður líkami (`#ead9ae`), eins og litli snigillinn í skóginum.

**Tripo, jákvæð lína.**

```text
Cute storybook illustration of a land snail: a big round spiral shell striped orange and cream on a soft cream body with a wide muscular foot, a small head with a gentle smile and two pairs of tentacles, the longer upper pair with a friendly eye at each tip, seen in a front three-quarter view, soft chunky rounded shapes, matte painted storybook look, a single animal with the whole body in view, plain flat light background
```

**Tripo, neikvæð lína.**

```text
ground, grass, floor, scenery, cast shadow, drop shadow, frame, border, text, watermark, extra animals, photo, glossy, sharp teeth, cropped, slime trail, shell-less slug
```

### 3.5 Fuglar, skrá `birds`

**Lýsing.** Fornfugl með *Archaeopteryx* (á íslensku „öglir“) að fyrirmynd. Hann lifði á júratímabilinu og líkist í senn fugli og risaeðlu. Höfuðið er með mjótt trýni og tennur í kjálkunum í stað goggs: fáeinar litlar, mjúkar, ávalar, fílabeinslitar tennur sem sitja innar en varirnar, svo brosið haldist (eins og hjá Grameðlu í leiknum). Vængirnir eru þaktir fjöðrum, og framan á vængnum sjást þrír litlir fingur með ávölum klóm. Á fótleggjunum eru fjaðrir eins og buxur. Skottið er langt og beinótt, með fjöðrum sitt hvorum megin eftir endilöngu skottinu. Fuglinn stendur á tveimur fótum, með annan vænginn lítið eitt lyftan svo klærnar sjáist, og er séður skáhallt framan frá.

**Heimild.** University of California Museum of Paleontology (Berkeley), [„Archaeopteryx“](https://ucmp.berkeley.edu/diapsids/birds/archaeopteryx.html): fullt sett af tönnum, þrjár klær á vængnum, langt beinótt skott og fjaðrir; steingervingar úr Solnhofen-kalksteini í Suður-Þýskalandi, um 150 milljón ára gamlir. Longrich 2006, „Structure and function of hindlimb feathers in Archaeopteryx lithographica“, *Paleobiology* 32 (3): 417–431, [doi:10.1666/04014.1](https://doi.org/10.1666/04014.1): fjaðrir á fótleggjum Berlínareintaksins (Museum für Naturkunde, Berlín).

**Frjálst.** Litir fjaðranna eru ímyndaðir. Vísbending er ein stök fjöður sem var líklega svört (Carney o.fl. 2012, *Nature Communications* 3: 637, [doi:10.1038/ncomms1642](https://doi.org/10.1038/ncomms1642)), og hún segir ekkert um allan fuglinn. Tennurnar eru einfaldaðar: heimildin segir að hann hafi haft fullt tannsett, en hér eru þær fáeinar, litlar og ávalar, eins og hjá Grameðlu í leiknum (`remake/STYLE.md`, kafli 3: engar hvassar tennur), svo brosið haldist. Tillaga: brúnt bak og brúnir vængir (`#9a7556`, `#7a5a40`, fjaðraoddar `#d8b27a`), appelsínurauð bringa (`#ee8352`) og rjómalitaður kviður (`#f4e7c6`), eins og litlu fuglarnir í skóginum.

**Tripo, jákvæð lína.**

```text
Cute storybook illustration of Archaeopteryx, the early bird: a feathered bird-dinosaur with a narrow snout holding a few tiny soft rounded ivory teeth, big friendly eyes, feathered wings with three small clawed fingers showing on the front of one slightly lifted wing, feathered trousers on the legs, a long bony tail with feathers along both sides, brown back and wings, orange-red chest, cream belly, seen in a front three-quarter view, soft chunky rounded shapes, matte painted storybook look, a single animal with the whole body in view, plain flat light background
```

**Tripo, neikvæð lína.**

```text
ground, grass, floor, scenery, cast shadow, drop shadow, frame, border, text, watermark, extra animals, photo, glossy, sharp teeth, cropped, beak, modern bird
```
