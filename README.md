# Mosi — Risaeðluleiðangurinn

Íslenskt könnunarævintýri fyrir börn um fimm ára aldur. Barnið ferðast með Mosa, hlýlegri og fyndinni þríhyrnu, eftir skógarstíg, að vatni og undir svífandi flugeðlu. Þrívíð módel og áferðir með opnum leyfum blandast við sérsmíðaðar persónuviðbætur, landslag og vatn.

## Sækja af GitHub

```sh
git clone https://github.com/fannar55/dino.git
cd dino
npm start
```

Opnið `http://localhost:4173`. Leikurinn þarf Node.js 20 eða nýrra við staðbundna keyrslu. Til að hýsa hann á eigin vef þarf aðeins að afrita innihald `dist/`; hvorki Node.js né API-lykill þarf að vera á vefþjóninum.

Þetta safn inniheldur heildstætt eintak leiksins, samþykkta talsetningu og frumskrár. Staðbundin vinnugögn, aðgangslyklar og stillingar Sites-hýsingarinnar fylgja ekki.

## Safn Egils

Alfræðisafnið opnast úr bókinni inni í leiknum. Þar eru 14 dýr, 84 fræðsluefni, 27 myndir sem hægt er að stækka, sjö þrívíð ævintýramódel og tveir raunverulegir safngripir í þrívídd. Tímalína, stærðarsamanburður, rannsóknarverkefni og orðskýringar tengja efnið saman. 98 íslenskar talsetningar fylgja safninu.

Myndefni og safngripir halda aðskildum leyfum sínum. Sjá `dist/CREDITS.txt`, `dist/assets/visual-assets.json` og `dist/assets/encyclopedia/ATTRIBUTION.txt`. Talsetning og tónlist úr ElevenLabs eru ekki merkt CC0. Engu nýju opnu leyfi er úthlutað öllu verkefninu með þessari útgáfu.

## Spila og hýsa

Keyrið `npm start` í þessari möppu og opnið `http://localhost:4173`. Node.js 20 eða nýrra. Engin uppsetning npm-pakka er nauðsynleg til að spila; Three.js er innifalið með MIT-leyfi.

`dist` inniheldur allan leikinn. Afritið innihald `dist/` í vefmöppu á HTTPS-vefþjóni. `index.html` þarf að liggja í rót þeirrar möppu; haldið `assets` og `vendor` með. Enginn bakendi, API-lykill eða utanaðkomandi skráahýsing er nauðsynleg við spilun. Leikurinn virkar líka í undirmöppu, til dæmis `/leikir/stjornufar/`. Þjónninn þarf að senda `.js` sem JavaScript og `.mp3` sem `audio/mpeg`.

Leikurinn fyllir sýnilegt vafrasvæði og óskar eftir heilskjá við fyrstu snertingu þar sem vafrinn styður það. Raunverulegur heilskjár er ekki tryggður í iOS-vöfrum. Hægt er að bæta leiknum á heimaskjá þar sem það er stutt.

HTTPS og fyrsta opnun með nettengingu gera vafranum kleift að geyma skrár fyrir notkun án nets. Vafrar geta hreinsað staðbundna geymslu; vistun er á hverju tæki fyrir sig og samstillist ekki milli tækja. Framvinda þessa leiðangurs notar `stjornufar.safari.v2` í localStorage og breytir ekki aðskildri vistun fyrri útgáfu.

## Leiðangurinn

Mosi býður barninu að koma með sér. Ferðin heldur áfram eftir stígnum og stoppar við sex dýr: kambeðlu, þórseðlu, grameðlu, uggeðlu, slóeðlu og Pteranodon. Fyrstu fimm eru risaeðlur; Pteranodon er flugeðla.

Á hverjum stað fær barnið að skoða dýrið, heyra spurningu og velja nafn. Sérstakur hljóðhnappur við hvert svar les nafnið upp. Ef barnið velur annað dýr segir Mosi frá auðþekkjanlegu einkenni og gefur því nýja tilraun. Engin líf tapast og ekkert tímamark er á svörum. Uppgötvunarbókin geymir dýrin sem barnið hefur fundið og leyfir því að heimsækja þau aftur.

Leiðangurinn er nú hugsaður sem um 15–20 mínútna leikur með könnun; tíminn fer eftir barninu. Eftir hvert dýr opnast lítið þrívítt leiksvæði: finna steingervinga í skógarbotninum, safna laufum uppi í tré, skoða fótspor, finna fiska undir vatni, spila á sef og finna vindslóðir í flugi. Á hverjum stað leynist líka lítið dýr og hægt er að svara aukaspurningu.

Leitarmunirnir dreifast um aðskilda staði í umhverfinu. Hægt er að líta á milli greina, fylgja slóð, skoða vatnið og kanna sefbrúska; vísbending beinir augunum að næsta ófundna hlut. Myndrænn þriggja hluta teljari fylgir hverri leit. Fyrstu tveir fundirnir stöðva ekki leikinn; þegar allir þrír finnast kemur stjarna og síðan stór fræðslumynd með íslenskum upplestri. Laufin kenna um ljóstillífun, sporin um ummerki, fiskarnir um tálkn og ugga, sefið um náttúruhljóð og vindurinn um loft á hreyfingu. Hægt er að opna fullkláraða fræðslumynd aftur úr teljaranum án þess að fá sömu stjörnuna aftur.

Hægt er að safna 24 stjörnum: einni fyrir að þekkja hvert stóra dýr, einni fyrir þriggja hluta verkefnið, einni fyrir leynidýrið og einni fyrir aukaspurninguna. Vísbendingar og endurteknar tilraunir draga aldrei úr verðlaunum. Framvinda verkefna og stjörnur vistast með leiðangrinum; gömul vistun heldur dýrunum sínum og opnar nýju verkefnin í bókinni. Endurspilun gefur ekki sömu stjörnuna aftur.

Barnið getur dregið sjónarhornið rólega til hliðanna á leitarsvæðum. Við fyrstu kambeðluna snýr myndavélin af stígnum inn í skóginn. Þrír steinar leynast á aðskildum stöðum við gróður og trjárætur; barnið þarf að líta til beggja hliða til að finna þá. Myndrænn teljari sýnir 1/3 og 2/3 án þess að stöðva leitina. Þegar allir þrír finnast kemur stjarnan og síðan stór mynd af steingervingi með íslenskri frásögn. Litlu felufélagarnir opna sína eigin fræðslumynd. Gras, tré, stígur, steinar og vatn svara snertingu með hreyfingu og hljóði. Þórseðlan lyftir landkönnuðinum varlega upp í trjátoppa og skilar honum í hnakkinn; flugferðin sýnir höfuð og vængi flugeðlunnar frá baki hennar. Flugið heldur áfram í mjúkri lykkju þar til þrjár vindslóðir finnast. Hægt er að fara aftur til Mosa eða endurtaka ferðirnar.

Smellur á dýr kallar fram sértækt dýrahljóð og rólega nærmynd. Könnun notar mjúka færslu og aðdrátt myndavélar. Stjörnusöfnun fær gylltar brellur yfir myndina; þær taka ekki við smellum og stöðvast með hléi. Hljóðin eru stílfærð fyrir ævintýrið, ekki fullyrðing um raunveruleg hljóð útdauðra dýra.

Verðlaunahljómurinn fær rúma sekúndu áður en frásögn Mosa heldur áfram. Bókin og hlé halda þessari bið, og ný aðgerð fellir eldri frásögn úr gildi. Leitarmunirnir nota steina, gróður og efni úr sama umhverfissafni og skógurinn; stærri snertifletir og vísbendingar hjálpa barninu án þess að breyta mununum í risastór viðmótstákn.

Þetta er ímyndaður leiðangur þar sem dýr frá ólíkum tímabilum hittast. Þau lifðu ekki öll á sama tíma eða stað. Stærðir og útlit eru stílfærð fyrir leikinn. Námsmarkmiðið er að þekkja dýrin, tengja heiti við einkenni og njóta þess að kanna heiminn.

Íslensk heiti eru aðalheiti þar sem þau eru til. Alþjóðleg fræðiheiti birtast líka og eru ekki sérstaklega ensk orð:

| Íslenskt heiti | Fræðiheiti í leiknum |
| --- | --- |
| Þríhyrna, Mosi | Triceratops |
| Kambeðla | Stegosaurus |
| Þórseðla | Brontosaurus |
| Grameðla | Tyrannosaurus rex |
| Uggeðla | Spinosaurus |
| Slóeðla | Parasaurolophus |
| Flugeðla | Pteranodon |

Viðmið fyrir íslensku heitin:

- [Náttúrufræðingurinn, „Risaeðlur úr öllum áttum – íslenskar nafngiftir“](https://natturufraedingurinn.is/wp-content/uploads/2026/02/Risaedlur.pdf), meðal annars þríhyrna, uggeðla og slóeðla. Þríhyrna er þar heiti Triceratops horridus.
- [Íslensk orðabók: þórseðla, Brontosaurus](https://islenskordabok.arnastofnun.is/ord/47330).
- [Vísindavefurinn um kambeðlur](https://www.visindavefur.is/svar.php?id=2697).
- [Vísindavefurinn um heitið grameðla](https://www.visindavefur.is/svar.php?id=68288).

## Myndefni og hreyfingar

Öll sjö dýrin nota GLB-módel með beinagrindum og hreyfingum. Mosi er Tripo AI-líkan sem eigandi leiksins bjó til; beinagrind, skinnþyngdir og hreyfingar hans eru bakaðar með `lab/gfx-demo/tools/bake-mosi.mjs` og hann ber hnakk og knapa. Kambeðla, grameðla og slóeðla byggja á Quaternius-módelum. Þórseðla og uggeðla eru verulega endurmótuð úr CC0-grunnmódelum með nýjum hlutföllum, einkennum og gönguhreyfingum. Pteranodon er sérsmíðuð flugeðla með liðaða himnuvængi og flug-, svif- og lendingarhreyfingar. Uppruni og breytingar fylgja módelunum.

Dýrin koma inn í senurnar eftir samfelldum leiðum. Fyrst heyrist vísbending, síðan gengur dýrið til okkar eða flugeðlan flýgur yfir trén. Spurning og svarhnappar bíða eftir bæði hreyfingunni og upplestri Mosa. Bókin gerir hlé á komu dýrsins og talinu; þegar henni er lokað heldur ferðin áfram frá sama stað.

Þegar barnið þekkir dýrið kinkar Mosi kolli og landkönnuðurinn veifar. Hreyfingarnar ganga mjúklega til baka í kyrrstöðu án þess að fætur eða hnakkur færist úr skorðum.

Á lágum símaskjám tekur viðmótið minna pláss og myndramminn færist ofar svo dýrið sjáist meðan spurt er. Hljóðhnappar hafa að minnsta kosti 44 punkta snertiflöt. Þokan er minni í forgrunni en heldur dýpt í fjarlægum skóginum.

Skógurinn notar 11 valin módel úr ókeypis Standard-útgáfu Quaternius Stylized Nature MegaKit og skógarbotn frá Poly Haven. Afrit sömu plantna samnýta rúmfræði og áferðir; vindur, vatn, grunnsævi, glitrandi gárur og bakkafroða eru búin til í leiknum. Innifalin leyfi sóttu pakkanna eru CC0. Uppruni og breytingar eru í `dist/assets/visual-assets.json` og `dist/CREDITS.txt`.

Leikurinn hleður módelunum áður en byrjunarhnappurinn opnast. Ef stakt módel næst ekki notar hann sérsmíðað varamódel. Engin módel eða áferðir eru sótt af vef annars aðila við spilun.

## Talsetning og hljóð

Talsetningin notar Eleven v3 frá ElevenLabs og íslensku röddina „default ice“ úr aðgangi eiganda leiksins. Allar 300 talsetningarskrárnar fylgja sem MP3, með valfrjálsum vísbendingum, heitum, aukaspurningum og efni Safns Egils. Sagan leiðir barnið með Mosa að leynistað við vatnið og sex vinum á leiðinni. Enginn talgervill á tækinu eða tenging við ElevenLabs er nauðsynleg við spilun. Framburður og frásagnartónn þurfa enn yfirferð íslenskumælandi hlustanda.

Skógarniður, skrjáf í laufum, fuglatíst, skordýrahljóð, öldugangur, fótatak, vængjasuð, sull, ímynduð dýrahljóð og verðlaunahljómar eru búin til með WebAudio-kóða. Aðaltónlistin er „Little Dino Green Valley“, gerð í Eleven Music af eiganda leiksins og sótt úr hans safni. Hún er staðbundin, með mjúkri lykkju og sjálfvirkri lækkun undir tali, dýraköllum og verðlaunahljóðum. Á milli þeirra hækkar tónlistin aftur. Minni varatónlist er frá Kevin MacLeod og hljóðbrellur frá Kenney; sjá `dist/CREDITS.txt` fyrir aðskilin leyfi. Hljóð bíður eftir fyrstu snertingu og stöðvast tímabundið þegar leikurinn fer í bakgrunn eða gluggi opnast yfir honum. Tónlistin heldur áfram frá sama stað eftir hlé.

Til að endurgera talsetninguna: hafið `ELEVENLABS_API_KEY` í staðbundnu umhverfi og keyrið `node scripts/generate-narration.mjs`. Node.js, FFmpeg og FFprobe þurfa að vera uppsett. Hægt er að tilgreina einstök atriði, til dæmis `node scripts/generate-narration.mjs welcome invite`. Skriftið geymir tilbúin atriði í `.tools/elevenlabs` og endurnýtir þau þegar texti, rödd og stillingar eru óbreytt. Það setur aðeins heildstætt, staðfest raddasafn í leikinn og fjarlægir þá eldri talsetningaratriði sem eru ekki lengur í handritinu. Lykillinn er aldrei skrifaður í leikskrár eða sendur í vafra barnsins.

Textinn er í `NARRATION` í `dist/story.js` og samhljóða í `dist/assets/audio/narration-is.json`. Framburðarstafsetning fræðiheita er notuð fyrir talgervilinn; rétt fræðiheiti birtast í viðmótinu. Prófin bera saman handritið og talsetningarlistann.

Eftir breytingar á leikskrám keyrið `node package-site.mjs` til að endurnýja útgáfunúmer og skráalista fyrir notkun án nets. Endurgerið síðan hýsingarpakkann úr innihaldi `dist`; þetta skriftið býr ekki til ZIP-skrána.

## Verkfæri til efnissköpunar

Skrifturnar í `scripts/` varðveita vinnslu módelanna, talsetninguna og framburðarleiðréttingarnar. Sum þeirra þurfa FFmpeg, Blender eða upprunaleg niðurhöl og vinnuskrár undir `.tools/` og `qa/`. Þau gögn fylgja ekki GitHub-safninu. Tilbúnar leikskrár og samþykkt hljóð fylgja; þessi viðbótarverkfæri eru ekki nauðsynleg til að spila eða keyra sjálfvirku prófin. Talsetningargerð kallar á ElevenLabs og getur notað inneign; venjuleg spilun og próf gera það ekki.

## Prófanir og kóði

`npm test` prófar leikflæði, heiti og vísbendingar, endurkomu úr bókinni, vistun, hljóðhlé, niðurhal hljóða og aðgangslykla í útgáfuskrám. `npm run check` athugar JavaScript-setningafræði.

Við fyrstu keyrslu DOM-prófa á nýrri tölvu: `npm install --prefix .tools/dom-check --no-audit --no-fund linkedom@0.18.13`. Þetta er aðeins prófunartól og fylgir ekki hýsingarpakkanum. Prófin keyra leikstýringuna í sýndarviðmóti; þau sannreyna ekki WebGL-myndbirtingu, snertiskjá eða hljóðgæði raunverulegs tækis.

GLB-prófin skoða heilar skrár, staðbundnar áferðir, beinagrindur, hreyfingar og heimildir. Komuprófin athuga samfelldar leiðir, byrjun utan myndramma og stöðvun á réttum stað. Viðmótsprófin prófa að spurningar bíði eftir komu og tali, að hlé endurtaki ekki komuna og að eldri ósamstillt aðgerð geti ekki breytt annarri senu. Prófun á raunverulegum iPhone/iPad- og Android-tækjum og hlustun á íslenskan framburð er enn eftir; vafraprófun í síma- og spjaldtölvustærð kemur ekki í stað hennar.

- `dist/world.js`: Three.js-heimur, ferðalag, myndavél, lýsing og snerting.
- `dist/cinematic-rides.js`: samfelld trjátoppa- og flugferð, knapi, myndavél og örugg endurkoma.
- `dist/world-touch-feedback.js`: snertiviðbrögð plantna, trjáa, jarðar og vatns.
- `dist/discovery-illustrations.js`: frumsamdar stórar fræðslumyndir úr SVG-kóða.
- `dist/arrival-staging.js`: samfelldar göngu- og flugleiðir, nálgun og stöðvun.
- `dist/camera-framing.js`: myndrammi fyrir stutta símaskjái án þess að færa dýrin í heiminum.
- `dist/dinosaurs.js`: risaeðlu- og flugeðlumódel og hreyfingar.
- `dist/dinosaur-assets.js`: staðbundin Quaternius-módel, beinagrindur og blöndun hreyfinga.
- `dist/environment-assets.js`: samnýttar myndáferðir, tré og gróður með vindhreyfingu.
- `dist/assets/visual-assets.json`: uppruni, leyfi og breytingar alls innflutts myndefnis.
- `dist/story.js`: dýrin, handritið, heitin og sex áfangar.
- `dist/adventure-content.js`: sex verkefni, leynidýr, aukaspurningar og íslenskt handrit þeirra.
- `dist/exploration.js`: varðveisla verkefna, vísbendingar og stjörnur án tvítalningar.
- `dist/world-discoveries.js`: sérsmíðaðir þrívíðir hlutir, leynidýr og snertimörk.
- `dist/celebration-vfx.js`: stjörnur og fagnaðarbrellur án utanaðkomandi myndefnis.
- `dist/game.js`: viðmót, frásögn, svör og vistun.
- `dist/progress.js`: framvindureglur óháðar viðmóti.
- `dist/audio.js`: hljóðblöndun, íslenskur upplestur og umhverfishljóð; `setScene`, `setWalking` og `setPaused` tengja hljóð við ferðina.
- `dist/style.css`: viðmót fyrir spjaldtölvur og síma.

Engin skráning barns, auglýsingar, kaup eða greiningarkóðar eru í leiknum. Ekki er hægt að læsa stýrikerfishreyfingum eða vafrahnöppum frá vefleik; vistun og einföld endurkoma verja framvinduna.

Fyrir fullorðna: Opna bókina og velja „Fyrir fullorðna“. Halda endurræsingarhnappinum inni í þrjár sekúndur til að byrja leiðangurinn aftur.
