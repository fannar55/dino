# Hvar er vinur minn? — fyrsta spilanlega gæðasýnishornið

Samþykkt umfang 25. október 2026: vinna í áföngum og stoppa eftir fyrsta
spilanlega sýnishornið til sameiginlegrar yfirferðar. AA-gæði eru markmið,
ekki staðhæfing um að óyfirfarin frumgerð hafi náð þeim.

## Áfangar og skilapunktar

1. **Spilanlegt gæðasýnishorn (þessi vinna).** Þrjú pör á 3 × 2 borði,
   full hringrás frá afhjúpun til sameiningar og hreiðurs, endurspilun,
   hlé, hljóð og snertistýring. Þríhyrna fær ný ungahlutföll, sértækt
   afhjúpunaratriði, kall og parahreyfingu. Þórseðla og kambeðla eru
   bráðabirgðaviðmið fyrir hin pörin. Afhenda keyranlega staðbundna
   forskoðun og myndir, með skýrum lista yfir ófullunnið efni.
2. **Sameiginleg yfirferð.** Meta ungahönnun, birtu, sjónarhorn,
   hlutföll borðs, hraða, hljóð og skýrleika. Leiðrétta þetta sýnishorn
   áður en framleiðsla hinna unganna hefst.
3. **Full fyrsta útgáfa, eftir samþykki.** Sex ný ungamódel, sex pör,
   kennsla, full talsetning og samþætting við leikjaval. Staðfesta
   spjaldtölvuafköst og að hinir leikirnir haldist óbreyttir.

## Samþykkt útlitsstefna

- Ungarnir eru greinilega ungir: stór höfuð og styttri útlimir, í sömu
  útlitsfjölskyldu og Mosi. Nota áferðir og beinagrind Mosa sem grunn
  að fyrstu þríhyrnunni ef það skilar nægilegum gæðum.
- Hlýtt morgunljós, málaðar mattar áferðir, ljós mold og kaldari skógarjaðar.
- Tegundalitir úr `remake/STYLE.md`: þríhyrna mosagræn, kambeðla
  fjólublá og þórseðla gullgul.
- Samþykkt leikjaskipulag krefst fasts skáhallts sjónarhorns ofan frá
  og samræmdrar stærðar unganna á reitum. Þetta er meðvituð aðlögun
  kvikmyndasjónarhorna og fullorðinsskala að þessum smáleik.
- Lauf, hreiður og risaeðlur eru þrívíðir hlutir í heiminum.
  Falinn hnappaflötur yfir hlut styður lyklaborð og snertingu.

## Reglur og tímaskipting

- Sex staðir, þrjár tegundir, tvö eins dýr af hverri tegund.
- Fyrri afhjúpun tekur 0,45 s. Fyrra dýrið bíður þar til hitt er valið.
- Seinni afhjúpun tekur 0,45 s. Ólíkt par er síðan sýnilegt í 1,5 s
  og lauf lokast á 0,3 s. Enginn þriðji staður opnast á meðan.
- Rétt par fær sameiginlega áherslu og fer í hreiður á um 1 s.
  Parahreyfing í hreiðrinu má klárast meðan næsta val er aðgengilegt.
- Tómu staðirnir halda legu sinni. Hin laufin færast aldrei til.
- Falin dýr gefa engar upplýsingar með útlínum, skuggum, köllum,
  stærð laufanna eða merkingu aðgengishnappa.
- Hlé og falinn vafraflipi frysta leikklukku og hljóð.
- Eftir síðasta par má snerta hreiðrin og endurtaka parahreyfingu.
- Enginn tímamælir, stigatap, keppnisskor eða ósjálfráð hjálp.

## Gæðaviðmið við skil

- Hægt er að klára nýjan leik, leika við fundin pör og byrja aftur.
- Tvö sýnileg dýr fá tíma til samanburðar og allar stöðubreytingar
  haldast réttar við hraða smelli, hlé og endurspilun.
- Mosi og fyrsta ungaparið passa sjónrænt saman; andlit og horn sjást
  við venjulega leikmynd. Unginn er ekki bara fullorðinsmódel smækkað.
- Leikurinn virkar án hljóðs. Tegundir þekkjast af lögun og lit.
- Snertifletir eru stórir og ekki yfir öðrum stýringum; viðmót
  yfirferið á 1280 × 800, 820 × 1180 og mjóum símaskjá.
- Engar ómeðhöndlaðar villur eða brotin auðlindaslóð í vafra.
- Mæla draw calls, þríhyrninga og rammatíma. Viðmið verkefnisins
  eru 100 draw calls / 250k þríhyrningar og 30 fps á miðlungs spjaldtölvu.
  Skrá mælingu á þróunartölvu sérstaklega frá óprófuðum tækjum.

## Afhending og uppruni

Einangrað vinnuafrit: `C:/Risaeðla/dino-minnisspil`, upphaf frá
`origin/main` á `b9cfb5d`. Enginn hinna leikjanna eða vinna í öðrum
vinnuafritum er yfirskrifuð. Nýtt efni og frávik eru skráð með sýnishorninu.

## Staða við fyrsta skilapunkt

Spilanleg forskoðun: `http://127.0.0.1:4206/remake/minnisspil.html`.
Keyrsla úr vinnuafritinu: `npm run start:memory`.

- 15 einingapróf fyrir reglur og hljóð standast.
- Vafrapróf klárar öll pör með snertiflötum, prófar hlé, hljóðleysi,
  endurspilun í miðri hreyfingu og hreiðrin eftir sigur.
- 1280 × 800, 820 × 1180 og 390 × 844 yfirfarin; hnappar skarast ekki
  við aðra nauðsynlega snertifleti. Falin tegund kemur ekki fram í
  aðgengisheiti laufs.
- Hlé í miðri parahreyfingu skilar nákvæmlega sömu myndpixlum.
  Þríhyrnuungarnir snerta nef í prófaðri parahreyfingu.
- Fimm íslenskar Mosa-talsetningar voru gerðar eftir afmarkað samþykki
  notandans. Skráarsnið, lengd og munnstillingar eru staðfest.
- Niðurstöður: `qa/memory/check/report.json`; myndir liggja við hliðina.
  Síðasta yfirferð á rúmfræðifjölda er í `qa/memory/scene-final/report.json`.
- Eftir léttingu bakgrunns og hreiðurvefnaðar mældist hámarkið 239.074
  þríhyrningar og 81 teiknikall með öll sex dýrin sýnileg. Þetta er innan
  rúmfræðiviðmiða verkefnisins; það staðfestir ekki rammatíðni á spjaldtölvu.

Eigandi þarf nú að meta útlit, hlutföll, raddblæ og hraða í lifandi leik.
Þríhyrnuunginn er ný aðlögun Mosa. Hin tvö pörin nota tímabundið
fullorðinsmódel verkefnisins. Raunveruleg spjaldtölva og full sex para
útgáfa bíða næsta áfanga.
