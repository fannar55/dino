# Söngur Slóeðlu: stigagjöf, fimm stjörnur, fullt hús og fullkominn leikur (hönnun)

31. október 2026. Staða: **drög til yfirlestrar eigandans.** Ákvarðanirnar hér eru hans frá 31. október (svör hans í spjallinu).
Engin smíði fyrr en lýsingin og útfærsluáætlunin eru samþykktar. Grein: `sloedla-lag`.

## 1. Af hverju

Eigandinn: við viljum ekki hafa leikinn of erfiðan, en það má alveg sýna í stigum hvað var gert; fullkomið smell á tón á að gefa
meira en ófullkomið. Breytum í fimm stjörnur og stig þar undir. Hægt að fá fullt hús, en svo er líka fullkominn leikur, það hæsta
sem hægt er. Nýjar línur fyrir DJ. Stjörnukraftur á að vera aðeins erfiðari að fá, ekki mikið.

Í dag (`engine/sloedla/chart.js`) ræðst stjörnufjöldinn (0–3) eingöngu af hlutfalli tóna sem voru spilaðir (`shareOf`, `STAR_SHARES`
= 25/50/80 %); nákvæmnin („Fullkomið!“, „Frábært!“, „Fínt!“, „OK!“, `text.js` `gradeOf`) er bara orð yfir risaeðlunni. Stjörnumælirinn
fyllist eftir 12 hittna tóna (24 á fullorðinsstigi), sama hvernig hitt var. Valmyndin geymir bestu stjörnur lags (0–3, `best.js`).

## 2. Ákvarðanir eigandans

1. **Stjörnurnar koma af stigunum** (ekki af hlutfalli tóna), svo nákvæmni skiptir máli.
2. **Fullkominn leikur:** allir tónar að minnsta kosti „Frábært!“ og enginn aukasmellur.
3. **Stigin sjást líka í leiknum:** tala við stikuna og „+100“ við smell; í lokin teljast þau upp undir stjörnunum.
4. **Leið A:** stig eftir nákvæmni, tvöföld í Stjörnukrafti; reglurnar í kafla 3 (hluti 1): samþykkt.
5. Það sem sést (kafli 4, hluti 2) og DJ, smíðin og prófin (kaflar 5–6, hluti 3): samþykkt.

## 3. Reglurnar

- **Stig á hvern tón** eftir orðinu sem hann fær (`gradeOf` með gluggum stigsins): Fullkomið! **100**, Frábært! **80**, Fínt! **60**,
  OK! **40**; missir **0**. Þetta eru **grunnstigin**.
- **Stjörnukraftur tvöfaldar:** tónn sem er hittur á meðan Stjörnukraftur logar gefur sín grunnstig aftur sem **aukastig** („+200“
  í stað „+100“). Talan sem sést (í leiknum og í lokin) er grunnstig + aukastig.
- **Stjörnurnar (0–5) ráðast af grunnstigunum einum**, sem hlutfalli af hæstu mögulegu grunnstigum (hver tónn lagsins 100):
  1★ við **15 %**, 2★ **35 %**, 3★ **55 %**, 4★ **70 %**, 5★ **85 %**. Aukastig Stjörnukrafts hafa engin áhrif á stjörnurnar.
- **Aukasmellir** (smellur þar sem enginn tónn er) eins og nú: ókeypis upp að fjórðungi af fjölda tóna (`STRAY_SPARE`); hver umfram
  það dregur **50** frá grunnstigunum í hlutfallinu sem ræður stjörnunum (ekki niður fyrir 0). Talan sem sést lækkar aldrei.
  Aukasmellur slítur röðina og sést áfram sem grátt púst og léttur hristingur (smíðað 31. október).
- **Fullt hús:** allir tónar lagsins spilaðir (`fullHouse`, eins og nú).
- **Fullkominn leikur:** allir tónar spilaðir, hver að minnsta kosti „Frábært!“, og enginn aukasmellur sem taldist. Fullkominn
  leikur gefur **alltaf 5★**, hvað sem hlutfallinu líður. Hann er ofar fullu húsi (sá sem fær hann fær ekki líka „Fullt hús!“).
- **Erfiðleikinn er festur með hermdu barni** (próf, fræ fyrir slembitölur): smellir dreifast normalt um tóninn; smellur utan
  gluggans er missir. Markmiðin eru bindandi, mörkin hér að ofan eru upphafsgildi sem má fínstilla til að ná þeim:
  - barn sem smellir á **85 %** tóna með **150 ms** dreifingu fær **3★**;
  - barn sem smellir á **alla** tóna með **150 ms** dreifingu fær **4★**;
  - sá sem smellir á **alla** tóna með **100 ms** dreifingu fær **5★**.
  (Til samanburðar: í dag gefur 80 % hittni hæstu einkunn, 3 af 3.) Fullorðinsstigið notar sömu mörk með sínum þrengri gluggum.
- **Stjörnukraftur** fyllist eftir **15** hittna tóna í stað 12 (barn) og **30** í stað 24 (fullorðnir): fjórðungi lengra.
  Annað við hann helst (tæmist hægt, missir hellir úr, klappið).

## 4. Það sem sést

**Í leiknum**
- **Stikan efst** fær **fimm** glerstjörnur, við 15/35/55/70/85 %, og fyllist af grunnstigahlutfallinu. Þær kvikna í 3D eins og nú
  (stökk, heill hringur, gull, framhlið fram) og fljúgandi stjarna fer í hverja.
- **Stigatalan** gyllt hægra megin við stikuna (undir henni hægra megin á mjóum skjá), með punkti sem þúsundaskilum („4.250“);
  rúllar upp að nýju tölunni á um 0,3 s við hvert smell og tekur smá hopp; regnbogalit á meðan Stjörnukraftur logar.
- **„+100“** sprettur upp undir orðinu yfir risaeðlunni í lit orðsins (regnbogi, gull, myntugrænt, himinblátt), „+200“ í
  Stjörnukrafti; minna en orðið og hverfur með því.

**Lokaskjárinn**
- **Fimm 3D-stjörnur í mjúkum boga**, sú í miðjunni stærst og hæst, hinar lækka og minnka út á við. Hver sem vannst flýgur af
  stikunni á sinn stað eins og nú, en **0,45 s** á milli (í stað 0,7) svo biðin lengist ekki; þær sem unnust ekki standa sem gler.
  **Með allar fimm** snúast þær einn hring saman (eins og þrjár nú), flugeldar.
- **Undir þeim, í þessari röð:** orðið („Fullkominn leikur!“ í regnboga með auka glitri og flugeldum, „Fullt hús!“ í gulli, annars
  orð eftir stjörnum); **stigin stór og gyllt**, teljast upp frá 0 („7.480 stig“); minna: „Þú spilaðir 95 af 95 tónum“ og
  „Lengsta röð: 92“.
- **„Nýtt met!“** ef stjörnurnar eða stigin eru hærri en fyrra met lagsins á þessu stigi.
- Orðin undir lokaskjánum á síðunni („Slóeðla syngur með þér á hátíðinni!“) koma við **4★ eða fleiri** (áður 3 af 3), svo barn sem
  hittir alla tóna fái söguverðlaunin.

**Valmyndin**
- **Lagaspjöldin** sýna bestu stjörnur af fimm (★★★★☆) og bestu stig undir, smátt: „Met: 7.480“.
- **Metin geymast undir nýjum lykli** (stjörnur 0–5 og stig á lag og stig); gömlu metin af þremur gleymast, þar sem ekkert hefur farið
  út enn.

## 5. DJ

Nýjar línur, teknar upp með sömu rödd („DJ 1“, ElevenLabs, `tools/sloedla-dj.mjs`), hver taka hlustuð og staðfest áður en hún
fer inn (eins og hinar):
- **Fullkominn leikur:** „Fullkominn leikur!“, „Vá, fullkominn leikur!“, „Fullkominn leikur, hver einasti tónn!“, „Fullkominn
  leikur, ótrúlegt!“
- **Fimm stjörnur:** „Fimm stjörnur!“, „Fimm stjörnur, vá!“, „Fimm stjörnur, þú ert stjarna!“
- **Stjörnukraftur** fær tvær nýjar tökur sem segja frá tvöfölduninni: „Stjörnukraftur, tvöföld stig!“, „Tvöföld stig, allir
  saman!“

**Lokalínan** (og orðið á lokaskjánum) velst í þessari röð: fullkominn leikur › fullt hús › næstum fullt hús (1–2 missir og að
minnsta kosti 4★) › eftir stjörnum: 5★ „Fimm stjörnur!“, 4★ „Frábært!“, 3★ „Flott!“, 1–2★ „Vel gert!“, 0★ „Spilum aftur saman!“.

## 6. Smíðin og prófin

- **Reglurnar eru hreinar** (`chart.js`): stig á tón, talning grunnstiga og aukastiga, stjörnur af stigum, fullt hús, fullkominn
  leikur. Leikurinn og DJ (`dj.js`) nota sömu föll, svo það sem DJ segir og það sem skjárinn sýnir passa alltaf saman.
- **Leikurinn** (`game.js`): stikan með fimm stjörnum, stigatalan, „+100“, lokaskjárinn; `star-motion.js` (fimm stjörnur, boginn,
  0,45 s, allar fimm saman); `best.js` og `menu-view.js` (met af fimm og stig); síðan (`lab.js`). `?lokaskjar=0..5` sýnir
  lokaskjáinn með þeim stjörnufjölda, `?lokaskjar=fullkominn` fullkominn leik. Flötu 2D-stjörnurnar (`?3d=0`) fylgja með.
- **Próf** (aðeins það sem barnið finnur fyrir): hermdu börnin þrjú (kafli 3); stig á orð og tvöföldun; aukasmellir umfram
  fjórðung kosta en talan lækkar ekki; fullt hús og fullkominn leikur (og að fullkominn gefi 5★); Stjörnukraftur eftir 15 tóna;
  lokalínan í réttri röð; nýju DJ-tökurnar á diski; metin af fimm og stigin.
- **Skoðað í alvöru umferð** (myndir og myndskeið, tölvu- og símastærð): stikan, talan og „+100“ í leiknum; lokaskjárinn með
  0, 3, 5 stjörnum, fullu húsi og fullkomnum leik; spjöldin í valmyndinni.

## 7. Utan við þetta

- Stigatafla milli leikmanna eða tækja, og stig á hvern spilara í Fjölspili (ein tala fyrir hljómsveitina).
- Margfaldari eftir röð (leið B, hafnað: sveiflast of mikið fyrir sex ára barn).
- Breytingar á tímagluggum, nótnaþéttleika eða lögum.
