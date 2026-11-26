# Stjörnuhátíðin: lokaatriði sögunnar

Endirinn á sögu 1 (handritið, `2026-10-28-handrit-leiksins.md`). Hann byrjar þar sem kafli 6 endar
(`2026-11-21-kafli-6-bod-til-gramedlu-design.md`): uppi á fjallstoppinum hennar Grameðlu, ofan við skýin, í sólsetri. Vinirnir koma
upp úr skýjunum, sólin kveður, Grameðla öskrar og Egill kveikir á stjörnunum sex. Þá kemur tunglið með partíhatt og toppurinn
breytist í tónleikasvið. Eftir veisluna lyftir sjöunda stjarnan Agli upp, og þar tekur ferðin til baka við
(`2026-11-23-ferdin-til-baka-design.md`), sem endar á „Framhald…“.

Skjalið var endurskrifað 23. nóvember 2026 eftir hugarflug með eigandanum. Hann bað um stórt lokaatriði: „megum ekki slaka á í
lok, þarf að standast væntingar, hér má mikil vinna eiga sér stað.“

**Ákvarðanir eigandans 21. nóvember 2026, sem standa:**

- **Hátíðin er uppi á fjallinu þar sem Grameðla á heima:** sléttur fjallstoppur með smá gróðri og nógu plássi. Hún er alltaf
  haldin þar, næst stjörnunum, og allir vita það.
- **Egill kveikir á stjörnunum sex** og pikkar á Grameðlu til að fá öskrið.
- **Alveg nýtt hátíðarlag og nýr dans.** Hvorki lagið né dansarnir úr kafla 5 eru notuð. Slóeðla leiðir lagið á lúðurinn.
- **Endirinn er glaður.** Egill hlær og vinkar þegar hann svífur upp. Sex ára barn á ekki að halda að Egill hafi verið tekinn.
- **Egill fer út í geim** í lokin (ákvörðun 28. október). Saga 2 gerist þar.

**Ákvarðanir eigandans 23. nóvember 2026:**

- **Sólin kveður og hálft tungl kemur, með partíhatt.** Tunglið hefur persónuleika eins og sólin: auga, munn og litla hönd. Það
  er ekki í aðalhlutverki; það er þarna til að lífga upp á.
- **Egill pikkar á sólina** til að vinka henni bless.
- **Hver stjarna teiknar stjörnumerki vinar síns** á himininn þegar Egill kveikir á henni, og stjörnumerkin dansa með í laginu.
- **Veislan er sýning, eins og myndband. Ekkert pikk.**
- **Skemmtun gengur fyrir raunveruleika.** Þegar veislan byrjar birtist svið með ljósum, Slóeðla stendur á sviðinu, ljósflugur
  lýsa hluti upp, „og meira sem okkur dettur í hug, hlutir sem eru skemmtilegir en ekki raunverulegir“.
- **Mosi verður eftir** þegar Egill lyftist.
- **Endirinn á eftir er ferð til baka gegnum leikinn,** með myndum og remixi af tónlistinni, eins og endirinn í Pacman-leik
  eigandans. Hún er sér smíði með eigin forskrift. „Framhald…“ kemur síðast í henni.
- **Hátíðarlagið er án orða** og nær 4 mínútum.
- **Lengdin má fara yfir 10 mínútur.** „Reglur eru til að brjóta.“

**Tillögur sem eigandinn hefur ekki svarað** og standa hér þar til hann segir annað: skiptingin í smíðar (11. kafli), að vistunin
skrái söguna kláraða þegar Egill lyftist (9. kafli), og að veislan fái eigin reit í bókinni (9. kafli).

## 1. Staður, tími og birta

- **Staðurinn:** fjallstoppurinn sem kafli 6 endar á (`world/fjall/`). Hann er sléttur og víður, með grasi, lágum gróðri og stökum
  steinum, og nógu stór til að allir vinirnir standi þar með autt svæði í miðjunni.
- **Skýjahafið** liggur fyrir neðan toppinn allt í kring. Vinirnir koma upp úr því, og sólin sígur í það.
- **Tíminn** fer úr sólsetri í myrkur og þaðan í veislunótt. Birtan fer í gegnum fjögur stig:
  1. **Sólsetur** (koman): rauðgullin birta, sú sama og kafli 6 endar í.
  2. **Rökkur** (sólin kveður): gullið verður rautt og svo blátt.
  3. **Myrkur** (beðið eftir stjörnunni): dökkblátt. Aðeins plötur Kambeðlu lýsa, og vinirnir eru skuggamyndir með ljósrönd.
     **Breyting 26. nóvember 2026 (orð eigandans við bút 3, „allt gott, áfram“):** vinirnir halda fullum lit í myrkrinu, eins og
     leikurinn lýsir þá; þeir eru ekki skuggamyndir og fá enga ljósrönd. Himinninn og jörðin eru dökk, vinirnir sjást.
  4. **Veislunótt:** stjörnubjart, og sviðsljósin, glóblómin og skýjahafið lýsa toppinn í litum. Hún er björt og hlý, ekki dimm.
- **Næturhiminninn er nýr.** Leikurinn á engan stjörnuhimin í þrívídd; stjörnur, stjörnuhröp og norðurljós eru aðeins til sem
  flöt teikning í söngleik Slóeðlu (`engine/sloedla/game.js`), og hún er fyrirmynd að útliti en ekki að kóða. Nýi himinninn er
  sameiginleg skrá sem ferðin til baka notar líka: stjörnur sem koma fram ein af annarri, og svo hundruð í einu.

## 2. Persónur

Allir átta eru á toppnum í fyrsta sinn í sögunni.

| Hver | Gjöfin | Hvernig hún eða hann kemur | Hlutverk í veislunni | Rödd |
|---|---|---|---|---|
| Grameðla | Öskrið kveikir á stjörnunum. | Er heima hjá sér, með Egil á hausnum. | Bassatromman: hvert stapp hristir fjallið. | Engin: öskur og fnæs |
| Flugeðla | Hún kallar skóginn saman. | Fyrst, fljúgandi upp úr skýjunum, og flugdýrin fylgja. | Plötusnúður við hlið Slóeðlu. | `flugedla` |
| Kambeðla | Hún lýsir upp hátíðina. | Plöturnar glóa inni í skýinu áður en hún stígur út. | Ljósasýningin: plöturnar blikka í takt. | `kambedla` |
| Uggeðla | Hún ferjar gestina yfir ána. | Seglið sker skýið eins og bátur; smádýrin sitja á bakinu. | Slær taktinn með halanum; seglið skiptir litum. | `uggedla` |
| Þórseðla | Hún sér fyrstu stjörnuna. | Hausinn rís fyrst upp úr skýjunum, langt á undan búknum. | Ljósaturninn: ljósflugur þyrlast upp eftir hálsinum. | `thorsedla` |
| Slóeðla | Hún leiðir sönginn. | Lúðurinn heyrist áður en hún sést; dýrakórinn fylgir. | Á sviðinu: lúðurinn ber laglínuna og hún kallar dansinn. | `sloedla` |
| Mosi og Egill | Þeir buðu öllum. | Eru á toppnum frá byrjun. | Dansa fremst. | `mosi` (Ný 3), `egill` |

- **Smádýrin** (grasbítar, skjaldbökur, froskar, smáeðlur og flugdýr úr köflum 4 og 5) fylla jaðarinn, og dýrakórinn úr kafla 5
  syngur með í laginu.
- **Sólin** er sú sama og í öllum leiknum (`engine/sun-face.js`): hún blikkar, brosir, vinkar og faðmar sig.
- **Tunglið** er nýtt og lýst í 7. kafla.
- **Hetjufiðrildið** situr á horni Mosa og fylgir Agli upp í lokin.

## 3. Atriðin

Tímarnir eru markmið. Setningarnar eru tillögur; eigandinn heyrir þær allar og hefur síðasta orðið.

| Hluti | Lengd | Pikk |
|---|---|---|
| 1. Koman og sólin kveður | um 2 mín. | sólin |
| 2. Myrkrið, öskrið og stjörnurnar | um 2 mín. | Grameðla og stjörnurnar sex |
| 3. Veislan | um 4 mín. | ekkert |
| 4. Sjöunda stjarnan | um 1 mín. | ekkert |
| Ferðin til baka (sér forskrift) | um 3 mín. | ekkert |

### 1. Koman og sólin kveður (um 2 mínútur)

- **Byrjunin:** Grameðla stendur á toppnum með Egil á hausnum og Mosa við hlið sér. Sólin er lágt yfir skýjahafinu og toppurinn
  er auður og hljóður. Egill: „Hvar eru allir?“ Mosi: „Bíddu bara. Þau koma.“
- **Vinirnir koma** einn af öðrum, um fimmtán sekúndur hver, og hver þeirra þekkist áður en hann sést allur:
  - **Flugeðla** kemur fyrst, fljúgandi upp úr skýjunum, og flugdýrin setjast á steinana. „Allur skógurinn er á leiðinni!“
  - **Kambeðla:** plöturnar glóa inni í skýinu og svo stígur hún út. „Ég kom með ljósið!“
  - **Uggeðla:** seglið sker skýið eins og bátur. Froskar, skjaldbökur og smáeðlur hoppa af bakinu á henni. „Allir komnir yfir ána!“
  - **Þórseðla:** hausinn rís upp úr skýjunum, hátt yfir öllum, og svo kemur hún öll. „Er ég of sein?“
  - **Slóeðla:** einn hreinn lúðurtónn heyrist úr skýinu. Hún gengur upp með dýrakórinn á eftir sér. „Ég man lagið!“
- **Sólin kveður.** Allir raða sér upp og snúa að sólinni. Mosi: „Sólin er að fara að sofa. Vinkaðu henni, Egill!“
  - Egill pikkar á sólina (4. kafli). Hún vinkar með báðum höndum og allir vinka með.
  - Hún geispar, faðmar sig og sígur í skýjahafið. Mosi: „Góða nótt, sól!“
  - Ljósið fer úr gulli í rautt og svo í blátt, og tónlistin þagnar alveg. Þetta er eina þögla stundin í leiknum.

### 2. Myrkrið, öskrið og stjörnurnar (um 2 mínútur)

- **Myrkrið.** Allt er dökkblátt. Aðeins plötur Kambeðlu lýsa og þær slá hægt, eins og hjarta. Mosi hvíslar: „Nú bíðum við eftir
  fyrstu stjörnunni.“
- **Fyrsta stjarnan.** Þórseðla teygir hálsinn hæst allra: „Þarna! Ég sé hana!“ Ein lítil stjarna kviknar.
- **Öskrið.** Egill situr enn á hausnum á Grameðlu, næst himninum. Gullglitrið kemur á hana. Mosi: „Núna, Egill!“
  - Egill pikkar (4. kafli). Hún dregur andann, smádýrin fela sig bak við Mosa, og hún öskrar upp í himininn.
  - Hringur rúllar út yfir skýjahafið eins og gára á vatni.
  - Bókin opnast í miðri mynd og stjörnurnar sex skjótast upp úr henni eins og rakettur. Þær hanga daufar á himninum.
- **Egill kveikir.** Mosi: „Kveiktu á þeim, Egill!“ Hann pikkar á stjörnurnar í hvaða röð sem er (4. kafli).
  - Hver stjarna kviknar í lit síns vinar, með tóni sem hækkar, og vinurinn fagnar á sinn hátt.
  - Um leið teiknast stjörnumerki vinarins á himininn (7. kafli).
  - Þegar sjötta stjarnan kviknar koma fyrstu stjörnur sumarsins fram um allan himin, hundruð í einu. Mosi: „Fyrstu stjörnur
    sumarsins! Gleðilega Stjörnuhátíð!“
- **Egill fer niður.** Grameðla leggur hausinn niður og Egill svífur til Mosa, svo þeir geti dansað saman.
- **Tunglið kemur.** Hálft tungl gægist upp fyrir skýin bak við toppinn, með partíhatt. Það lítur yfir hópinn, brosir og blæs í
  partíflautu: „Tút!“ Það er merkið.

### 3. Veislan (um 4 mínútur)

Sýning sem Egill horfir á. Ekkert pikk. Allt er læst við hátíðarlagið (5. kafli), og sviðið, ljósin og dansinn eru lýst í 6. kafla.

| Kafli lagsins | Lengd | Hvað sést |
|---|---|---|
| Inngangur | 45 s | Slóeðla ein á sviðinu. Einn vinur kemur inn í einu með sitt hljóð, og hluti af sviðinu kviknar með hverjum. |
| Fyrsti dans | 60 s | Slóeðla kallar hreyfingarnar og allir dansa saman, líka stjörnumerkin á himninum. |
| Sólóin | 50 s | Hver vinur fær sína fjóra takta (um 8 sekúndur) í kastaranum með sitt bragð. |
| Kyrra stundin | 25 s | Takturinn dettur út. Aðeins ljósflugur, stjörnumerkin og tunglið sem vaggar. |
| Síðasta viðlagið | 50 s | Allt saman: Grameðla öskrar í takt, stjörnuhröp springa eins og flugeldar og norðurljós bylgjast. |
| Lokahljómur | 10 s | Allir stoppa í lokastellingu. Hljómurinn deyr út í þögn. |

### 4. Sjöunda stjarnan (um 1 mínúta)

- **Eftir lagið.** Allir fagna. Sviðsljósin dofna og ljósflugurnar svífa rólega. Vinirnir safnast í kringum Egil. Mosi: „Takk,
  Egill. Þetta var besti dagur í heimi.“
- **Sjöunda stjarnan.** Þórseðla sér hana fyrst, eins og alltaf: „Bíddu … þarna er ein í viðbót.“ Ókunn stjarna í öðrum lit en
  hinar blikkar og kemur nær. Stjörnumerkin snúa hausnum að henni, munnurinn á tunglinu verður „ó“, og nýtt, dularfullt stef tekur við.
- **Egill lyftist.** Mjúkt ljós úr stjörnunni fellur á Egil og lyftir honum hægt, eins og þegar hann sveif í hnakkinn í kafla 1.
  - Egill hlær: „Mosi, sjáðu! Ég flýg!“
  - Mosi: „Egill! Hvert ertu að fara?“ Egill: „Ég veit það ekki! Sjáumst!“ Hann vinkar.
  - **Mosi verður eftir.** Hann er hissa en ekki hræddur, vinkar með hinum og kallar: „Ég finn þig, Egill!“
  - Hetjufiðrildið flýgur af horninu á Mosa og fylgir Agli upp.
- **Upp.** Myndavélin fylgir Agli upp í stjörnuhimininn. Fjallstoppurinn ljómar lítill fyrir neðan, eins og eyja af ljósi í
  skýjahafinu. Þar tekur ferðin til baka við, án þess að klippt sé í svart.

### 5. Á eftir

- Ferðin til baka endar á „Framhald…“. Þá opnast bókin með allar sex stjörnurnar, og allt sem bókin á er opið.
- Veisluna og ferðina til baka má horfa á aftur úr bókinni (9. kafli).

## 4. Það sem Egill gerir

Egill pikkar þrisvar: á sólina, á Grameðlu og á stjörnurnar sex. Ekkert getur mistekist, og barn sem snertir ekkert sér alla
hátíðina. Hvert pikkmark ber gullglitrið, sem er boð leiksins um að pikka.

- **Sólin:** eitt pikk. Eftir 6 s endurtekur Mosi „Vinkaðu henni, Egill!“, og eftir 12 s vinkar sólin sjálf.
- **Öskrið:** eitt pikk á Grameðlu. Eftir 6 s endurtekur Mosi „Núna, Egill!“, og eftir 12 s öskrar hún sjálf.
- **Stjörnurnar sex:**
  - Þær má pikka í hvaða röð sem er.
  - Hver stjarna ber lit síns vinar og hangir yfir honum, svo barnið sjái hver á hvaða stjörnu.
  - **Tónarnir:** fyrsta pikkið gefur dýpsta tóninn og hvert næsta þann næsta fyrir ofan, sama hvaða stjarna er pikkuð. Tónarnir
    sex eru upphafsstef hátíðarlagsins, það sama og Slóeðla blæs ein í innganginum.
  - **Hjálp:** eftir 5 s glóir ein stjarna sterkar og dúar, eftir 12 s kviknar hún sjálf. Biðin styttist um helming eftir að
    stjarna hefur kviknað sjálf.
  - Stjörnurnar eru áfram í bókinni; vistunin breytist ekki.
- **Veislan og sjöunda stjarnan:** ekkert pikk. Pikk á skjáinn gerir ekkert og truflar ekkert.

## 5. Hátíðarlagið

Lagið er undirstaða veislunnar: allt sem sést í henni er læst við taktinn. Þess vegna er lagið samið og valið fyrst, áður en
nokkuð er teiknað.

- **Alveg nýtt,** glatt og hátíðlegt, um 4 mínútur, á föstum hraða og í fastri tóntegund. Það má ekki minna á lag Slóeðlu úr kafla 5.
- **Án orða.** Lúðurinn hennar Slóeðlu ber laglínuna og dýrakórinn syngur „la-la“ og tóna. Einu orðin eru köllin hennar í
  dansinum (6. kafli), sem eru tekin upp sem venjulegar línur og lögð ofan á.
- **Kaflarnir sex** eru þeir sem taflan í 3. kafla sýnir. Lagið þarf því:
  - inngang þar sem hljóðfærin koma inn eitt í einu: lúðurinn, stapp Grameðlu, plötur Kambeðlu, hali Uggeðlu, djúpur tónn
    Þórseðlu, skröpin hjá Flugeðlu og dýrakórinn;
  - danskafla með einföldum, sterkum takti og eyðum fyrir köllin;
  - sólókafla með sex jafnlöngum bilum, eitt fyrir hvern vin;
  - kyrra stund án trommu;
  - síðasta viðlag sem er stærra en allt á undan;
  - lokahljóm sem deyr út í þögn, svo sjöunda stjarnan fái kyrrð.
- **Upphafsstefið** er tónarnir sex sem stjörnurnar gáfu (4. kafli).
- **Taktkort:** með laginu fylgir skrá með hraðanum, tímanum á hverjum takti, kaflaskilunum, sólóbilunum og eyðunum fyrir köllin.
  Allt myndefni veislunnar les tímann úr henni.
- **Hvernig það verður til:** eins og í kafla 5. Nokkrar tillögur á hlustunarsíðu sem opnast í síma, og eigandinn velur með
  eyranu. Fjögurra mínútna lag með sex köflum verður líklega sett saman úr bútum á sama hraða og í sömu tóntegund. Hraðinn og
  tóntegundin eru mæld, og lagið er blandað fyrir litla hátalara.
- **Hljóðfærin hvert á sinni rás** eru geymd ef hægt er, því ferðin til baka notar hátíðarlagið í remixinu. Hráefnið fer ekki í
  repoið, aðeins blandaða lagið.

**Breyting 24. nóvember 2026 (orð eigandans).** Eigandinn valdi lagið H: „Líst betur á H, rólegra á við núna komin nótt, og
lagið á undan var mikið fjör lag. Aðlögum senu að þessu lagi.“ Þar sem þessi breyting og textinn að ofan stangast á gildir hún:

- **Lagið ræður, senan lagar sig að því.** H er rólegt lag (84 slög á mínútu, D-dúr, 4 mínútur) sem ElevenLabs samdi úr
  lýsingu á senunni. Fyrirmyndin að hljómnum er „Life in a Northern Town“: kassagítarar, óbó, djúpar trommur.
- **Bakraddir án orða** eru í laginu sjálfu („ekki söngur en má vera bakraddir“). Þær eru kórinn. Dýrakórinn er ekki lagður ofan á.
- **Byrjun lagsins er Slóeðlu.** H byrjar ekki á lúðri einum heldur á kassagítar með mjúkri línu ofan á (A, F♯, E, D, niður á
  við). Sú byrjun er hennar. Tónar stjarnanna sex eru sex hækkandi tónar í tóntegund lagsins: D, E, F♯, A, H, D.
- **Kaflarnir sex halda nöfnum sínum en lengdirnar eru lagsins** (mældar í blöndunni): inngangur 51 s, fyrsti dans 46 s,
  sólóin 51 s, kyrra stundin 31 s, síðasta viðlagið 69 s og lokahljómur 15 s, alls 4:26. Taktkortið segir nákvæmlega til, og
  taflan í 3. kafla víkur fyrir því.
- **Sólókaflinn er lengdur** („Lengja sólóin“, orð eigandans sama dag): sólóhluti H er of stuttur fyrir sex vini (4,3 s á
  hvern), svo hann er spilaður tvisvar. Hver vinur fær þrjá takta, um 8½ sekúndu. Annars er engu í laginu raðað upp á nýtt.
- **Laginu er skipt í rásir** (trommur, bassi, gítar, píanó, raddir, annað) svo blandan geti stýrt hverri fyrir sig: þaggað
  trommur í kyrru stundinni, gert eyður fyrir köllin og lyft síðasta viðlaginu. Leikurinn spilar eina blandaða skrá.
- **Veislan er rólegri en lýst er í 6. kafla:** vagg og hægur dans í næturkyrrð frekar en fjör. Hvað það þýðir fyrir hverja
  hreyfingu og hvert bragð er ákveðið þegar þeir bútar eru smíðaðir og sýndir.

## 6. Veislan: sviðið, ljósin og dansinn

Hér gengur skemmtun fyrir raunveruleika. Ekkert af þessu þarf að geta gerst á alvöru fjalli.

- **Sviðið kviknar í innganginum,** einn hlutur með hverjum vini sem kemur inn í lagið:
  - **Sviðið sjálft:** steinar rísa upp úr jörðinni í hálfhring og Slóeðla stendur á þeim í ljóskeilu. Flugeðla situr við hlið
    hennar sem plötusnúður, eins og í söngleiknum.
  - **Kastarar:** ljósflugur hópast saman í stóra kastara sem sveiflast yfir alla í takt.
  - **Ljósaseríur:** ljósflugur hanga í röðum milli stjörnumerkjanna og niður að sviðinu.
  - **Dansgólfið:** glóblómin úr kafla 1 springa út yfir allan toppinn í bylgju og lýsast upp undir hverju fótspori.
  - **Skýjahafið** fyrir neðan lýsist upp í litum sem slá með laginu.
  - **Viðbót 26. nóvember 2026 (orð eigandans við bút 5: „já við öllu þessu, halda áfram“), sjö hlutir í viðbót á sviðið:**
    1. Hærri steinar í hring, hver í lit síns vinar, sem kvikna þegar vinurinn kemur inn. Þá sést sviðið úr fjarlægð.
    2. Gólfið í blönduðum litum: hvert blóm í lit vinarins sem er næstur því.
    3. Blóm sem hoppa og snúast þegar stigið er á þau.
    4. Flugeldar úr kösturunum á stóru höggunum í laginu.
    5. Tunglið dansar: vaggar hattinum í takt og opnar munninn með kórnum.
    6. Luktir á ljósaseríunum sem sveiflast þegar Grameðla stappar.
    7. Í kyrru stundinni safnast ljósflugurnar saman og fljúga upp til sjöundu stjörnunnar. (Stjarnan sjálf sést ekki fyrr en
       í senu 4; ljósflugurnar fljúga þangað sem hún kemur.)
- **Hljómsveitin:** hver vinur gerir sitt í takt, eins og taflan í 2. kafla sýnir. Dýrin spila á plötur Kambeðlu eins og sílófón.
- **Dansinn er nýr** og saminn við þetta lag. Engin hreyfing er tekin úr kafla 5.
  - **Slóeðla kallar hreyfingarnar** og allir gera þær saman: „Hendur upp!“, „Stappa!“, „Snúa!“, „Hoppa!“. Þær eru einfaldar,
    svo sex ára barn geti dansað með heima í stofu.
  - **Hver vinur gerir hreyfinguna á sinn hátt,** eftir líkamanum: Þórseðla sveiflar hálsinum, Uggeðla veifar seglinu, Flugeðla
    slær vængjunum, Grameðla stappar svo jörðin dynur, Mosi hoppar og Egill dansar fremst.
  - **Stjörnumerkin dansa með** á himninum, hvert eins og sinn vinur.
- **Sólóin:** hver vinur fær fjóra takta í kastaranum, nærmynd og sitt bragð úr sínum kafla:
  - Kambeðla: plöturnar renna gegnum alla litina.
  - Uggeðla: fiskar stökkva upp úr skýjahafinu og hún grípur einn.
  - Þórseðla: hausinn fer alla leið upp í ljósaseríurnar og rauð ber rigna niður.
  - Flugeðla: hún tekur hring yfir toppinn og vindurinn feykir ljósflugunum.
  - Slóeðla: lúðursóló.
  - Grameðla: þrjú stöpp og öskur, og risaspor lýsast upp í glóblómunum.
- **Kyrra stundin:** kastararnir slokkna. Ljósflugurnar svífa lausar, stjörnumerkin anda hægt og tunglið vaggar og blikkar.
- **Síðasta viðlagið:** allt kviknar aftur í einu.
  - Grameðla öskrar í takt og skýjahafið gárar við hvert stapp.
  - Stjörnuhröp þjóta yfir himininn og springa eins og flugeldar í litum vinanna.
  - Norðurljós bylgjast með laginu yfir öllum himninum.
  - Tunglið vaggar með og heldur í hattinn.
- **Myndavélin** er leikstýrð eins og tónleikamyndband: víð skot af öllum, nærmyndir í sólóunum og klippt á taktinum.

## 7. Stjörnumerkin og tunglið

- **Stjörnumerkin** eru sex risaeðlur úr ljóslínum milli stjarna, ein fyrir hvern vin, í lit hans.
  - **Þau eru ekki teiknuð í höndunum.** Hvert stjörnumerki er búið til úr beinagrind vinarins sjálfs: stjörnur sitja á liðunum og
    ljóslínur liggja milli þeirra. Þannig þekkist hver vinur á lögun sinni.
  - **Breyting 26. nóvember 2026 (orð eigandans við kyrrmyndirnar: „ekki taka svona orðrétt að gera eðlur með stjörnumerki,
    verður að svindla og hafa línur sem er ekki venjulega gert, gera betri teikningar af eðlum með stjörnur á lykilstöðum til að
    selja það“):** stjörnumerkið er ekki lengur beinagrindin. Það er **teikning af eðlunni**: útlína hennar og fáeinar innri línur,
    raktar eftir líkaninu sjálfu (ekki teiknaðar eftir auga), með stjörnum á lykilstöðum (haus, snoppa, halabroddur, horn, plötur,
    segl, hné, tær). Teikningin má svindla: hún þarf að líta út eins og vinurinn, ekki eins og alvöru stjörnumerki. Hver punktur
    í henni er bundinn beini í líkaninu, svo hún getur enn dansað.
  - **Þess vegna geta þau dansað:** stjörnumerkið hreyfist eins og vinurinn fyrir neðan, slag fyrir slag.
  - **Það teiknast** lína fyrir línu þegar Egill kveikir á stjörnunni, og stjarna vinarins er bjartasta stjarnan í því.
  - Eigandinn sér kyrrmyndir af þeim öllum áður en þau fara í veisluna.
- **Tunglið** er hálft tungl með persónuleika, gert á sama hátt og sólin (`engine/sun-face.js`): eitt auga, munnur, ein lítil hönd
  og partíhattur.
  - **Aukahlutverk.** Það gerir aldrei neitt sem sagan hangir á, nema að blása „Tút!“ til að hefja veisluna. Annars bregst það
    bara við.
  - **Það sem það gerir:** gægist upp fyrir skýin, blikkar, brosir og blæs í partíflautuna. Við öskur fer hatturinn á ská og
    það lagar hann með hendinni. Í laginu vaggar það í takt. Við sjöundu stjörnuna verður munnurinn „ó“. Þegar Egill svífur
    upp vinkar það honum.
  - **Staðurinn:** bak við sviðið, lágt yfir skýjahafinu, svo það sést í víðu skotunum án þess að taka athyglina.
  - Eigandinn sér kyrrmyndir af því, með öllum svipunum, áður en það fer í hátíðina.

## 8. Hljóð og raddir

- **Til nú þegar:** öskrið hennar, lúðurinn, vængjasláttur og hljóð smádýranna.
- **Hljóðheimur toppsins** er annar en skógarins: mjúkur fjallavindur og kyrrð, og skógurinn heyrist aðeins dauft langt fyrir neðan.
- **Þögnin** þegar sólin er sest er alger: enginn tónn, aðeins vindurinn.
- **Nýtt:** hljómurinn þegar stjarna kviknar (sex tónar), partíflautan, fögnuður dýranna, stjörnuhröpin sem springa, og stef
  sjöundu stjörnunnar. Áþreifanleg hljóð eins og fögnuður, stapp og partíflauta eru alvöru upptökur af Freesound (CC0 eða CC BY),
  lagðar saman. Engu er hlaðið niður fyrr en eigandinn hefur leyft það með nafni, uppruna og stærð.
- **Sjöunda stjarnan** fær eigið stef: fáir, bjartir og framandi tónar sem tilheyra ekki skóginum. Það er vísirinn að sögu 2.
- **Línur:** nýtt línusafn, `hatid`, með auðkenni sem byrja á `h_`, tekið upp með `remake/tools/voice-lines.mjs` eftir reglunum í
  `CLAUDE.md`: `--dry` fyrst, Ný 3 fyrir allar nýjar línur Mosa, og já/nei-síða eigandans flutt inn með `remake/tools/heard.mjs`.
  Raddir allra sem tala eru til. Köllin hennar Slóeðlu í dansinum eru í sama safni.
- **Línur heyrast aldrei ofan í lagið** nema köllin, sem eiga sínar eyður í taktkortinu.

## 9. Vistun, röð kaflanna og bókin

- **Kaflinn heitir `hatid`** (`remake/chapters/hatid.js`). Hann gefur enga stjörnu; stjörnurnar eru sex.
- **Sagan kláruð (tillaga):** um leið og Egill lyftist skráir vistunin að hátíðin hafi verið séð (`hatid` í `seen`; vistunin á
  ekkert merki um kláraða sögu í dag). Þá tapast ekkert þótt barnið hætti í ferðinni til baka.
- **Hvaða kafli opnast** (`engine/save.js` `defaultChapter`): hátíðin þegar `k6_gramedla` er komin og þar til hún hefur verið séð.
  Í dag er kafli 6 svarið þar til hátíðin er til.
- **Áfram:** `kafli6.next` verður `hatid` (er `null` í dag). `hatid.next` er `null`: ferðin til baka er síðasta atriði
  hátíðarinnar, sótt úr eigin skrá, svo hún byrjar án þess að klippt sé í svart.
- **Reitur í bókinni (tillaga):** „Stjörnuhátíðin“ bætist við sýningarnar (`BOOK_SHOWS` í `engine/book/videos.js`), við hliðina
  á „Djamm skógarins“, og opnast þegar hátíðin hefur verið séð. Reiturinn spilar veisluna eina, frá „Tút!“ tunglsins að
  lokahljómnum, á sama hátt og `chapters/djamm.js` spilar sýninguna úr kafla 5 eina: `chapters/veisla.js` flytur út veisluna
  úr `hatid.js`. Reitir opnast í dag frá byrjun eða við stjörnu; opnun við séðan kafla er ný.
- **Sjöunda sætið:** eftir endinn blikkar sjöunda, óþekkta sætið tómt í bókinni, sem vísir að sögu 2. Bókin á sex sæti í dag
  (`engine/scene/journal-data.js` `FRIENDS`), svo sætið er nýtt og má ekki breyta því hvernig stjörnurnar sex raðast.
- **Gömul vistun** týnir engu.

## 10. Tækni

- **Byrjunin tekur við af kafla 6.** Hann endar á toppnum í birtunni `LOOKS.sunset`, með Egil á hausnum á Grameðlu
  (`kafli6-seat.js` `HEAD_SEAT`) og Mosa við hlið hennar (staðirnir eru reiknaðir í `kafli6.js` út frá `top.wayUp`), og fer
  svo í bókina og kortið. Hátíðin er því eigin síða, og byrjar í sömu stöðu og sömu birtu.
- **Toppurinn er til** (`world/fjall/top.js` `createTop`): 45 metra radíus, sex merkt stæði fyrir vinina (`room`), auð miðja og
  skýjahaf sem getur ljómað og gárað (`sea.setGlow`, `sea.wave()`). Gáran við öskrið og litirnir í skýjahafinu byggja á því.
  Stæðin má færa þegar sviðið fær sinn stað.
- **Sólin getur ekki sest í dag.** Staður hennar er fastur í hverjum kafla (stefnan er bökuð inn í þokuna), og handrit getur
  aðeins látið hana blikka, vinka, faðma sig, skipta um munn og setja upp nátthúfu (`s.sun.*` í `engine/scene/scene.js`). Nýtt:
  andlit sólarinnar og skífan á himninum síga og hverfa í skýjahafið, og birtan fylgir með ljósblöndun (`engine/light-blend.js`
  `easeLight`). Ljósið sjálft þarf ekki að færast, því það dofnar út á meðan.
- **Næturbirtan** byggir á því sem til er: næturlitirnir úr sýningu kafla 5 (`chapters/kafli5-show-score.js` `LOOKS`) og
  „næstum nótt“ úr kafla 6 (`chapters/kafli6-looks.js`).
- **Allt sem hreyfist í veislunni er hreint fall af klukku lagsins,** eins og sýningin í kafla 5. Þá lendir `?t=` á sömu mynd og
  spilun, hlé heldur myndinni, og reiturinn í bókinni spilar nákvæmlega sömu sýningu.
  - Lagið spilast með `engine/audio/song.js`, og taktkortið er skrá eins og `song.json` í kafla 5 (kaflar með upphafsslagi og lengd).
  - Tæknin úr sýningu kafla 5 má nýtast: ljósdeplar í einu teiknikalli (`engine/show/lights.js`), hringir og ljósskífur
    (`engine/show/rings.js`) og ljósflugurnar og ljósflugnaflugeldarnir (`chapters/kafli5-show-score.js`). Dansarnir þaðan eru
    ekki notaðir.
- **Sviðsljósin eru ekki alvöru ljós.** Kastarar, ljóskeilur, seríur, glóblóm, flugeldar og norðurljós eru lýsandi fletir og
  agnir sem kosta enga lýsingu. Í mesta lagi eitt ljós varpar skugga. Ljóskeilur, stjörnuhröp og norðurljós í þrívídd eru ný.
- **Glóblómin** eru til (`world/props/glow-flower.js`), en dansgólf úr hundruðum þeirra þarf léttari gerð sem teiknast í einu kalli.
- **Stjörnumerkin** lesa liðina úr beinagrind hvers líkans (`assets/characters/*.glb`) og teikna stjörnur og línur í einu kalli.
  Sama skrá er notuð í ferðinni til baka.
- **Tunglið** er smíðað eins og sólin (`engine/sun-face.js`): málað á lítinn striga við ræsingu, hangir fast á himninum og er
  hreint fall af klukkunni.
- **Flugið úr bókinni** er öfugt við það þegar stjarna flýgur í bókina (`engine/scene/journal.js` `fly`).
- **Svifið** er `floatTo` úr `engine/riding.js`, það sama og lyfti Agli í hnakkinn í kafla 1 og upp á hausinn á Grameðlu í kafla 6.
- **Nýjar skrár:**
  - `chapters/hatid.js`: atriðin fjögur; `chapters/veisla.js`: veislan ein fyrir bókina.
  - `chapters/hatid-arrival.js`: koma hvers vinar og kveðja sólarinnar.
  - `chapters/hatid-stars.js`: flugið úr bókinni, pikkmörkin, tónarnir, hjálpin og hvar hver stjarna kviknar.
  - `chapters/hatid-song.js`: taktkortið; `hatid-stage.js`: sviðið og ljósin; `hatid-band.js`: hlutverk vinanna og sólóin;
    `hatid-dance.js`: dansinn; `hatid-seventh.js`: sjöunda stjarnan og svifið.
  - `engine/night-sky.js`: stjörnuhiminninn, stjörnuhröpin og norðurljósin.
  - `engine/constellations.js`: stjörnumerkin.
  - `engine/moon-face.js`: tunglið.
- **Afköst eru stærsta áhættan.** Allir sex stóru vinirnir hafa aðeins staðið saman á skoðunarsíðu (`chapters/lineup.js`), og þar
  mældist hópurinn yfir mörkum: 349 þúsund þríhyrningar og 6,6 til 6,8 ms. Síðan þá hafa persónur fengið léttari gerðir eftir
  stærð á skjánum (`engine/character-lod.js`), en átta persónur með dýrahjörð og sviði hafa aldrei verið mældar saman.
  - **Mörkin eru þau sömu:** 6 ms á skjákorti, 100 teikniköll og 250 þúsund þríhyrningar á spjaldtölvustillingu (STYLE.md 11), í
    báðum skjástærðum.
  - **Gráa útgáfan mælir víðasta veisluskotið** áður en nokkuð er fegrað.
  - **Ef það fer yfir:** aldrei fleiri en þrír stórir vinir nálægt myndavélinni í sama skoti, hinir aftar á léttari gerð; færri
    smádýr; og víðu skotin styttri. Sólóin hjálpa, því þar er aðeins einn vinur í nærmynd.
- **Prófin sanna:**
  - að barn sem snertir ekkert sjái alla hátíðina, frá komunni þar til Egill lyftist, á innan við 10½ mínútu;
  - að stjörnurnar megi pikka í hvaða röð sem er og tónarnir komi samt í réttri röð;
  - að pikk í veislunni breyti engu;
  - að veislan sé sama myndin á sama tíma, hvort sem hún er spiluð í kaflanum eða af reitnum í bókinni;
  - að vistunin eigi sex stjörnur fyrir og eftir, að vistun með `k6_gramedla` opni hátíðina, og að reiturinn í bókinni opnist
    fyrst þegar hátíðin hefur verið séð.
- **Línuendingar:** hver skrá heldur sínum (`.gitattributes * -text`).
- **Grein:** `hatid` frá main, vinnutréð `C:/Risaeðla/dino-hatid`, þjónn á porti 4350. Ekkert er sameinað í main eða ýtt nema
  eigandinn biðji um það.

## 11. Bútar og ferli

Lokaatriðið er þrjár smíðar (tillaga): hátíðarlagið, hátíðin og ferðin til baka. Lagið kemur fyrst. Hátíðin og ferðin til baka
geta gengið samhliða að mestu þegar lagið er valið. Ferðin til baka notar þó næturhimininn og stjörnumerkin, sem verða til í
búti 4 hér, og hátíðin kallar á ferðina sem síðasta atriði sitt í búti 7.

Smiðsagentar smíða í bútum og vista oft. Eigandinn sér myndir eða myndband eftir hvern bút og hefur síðasta orðið.

1. **Lagið:** tillögur á hlustunarsíðu, eigandinn velur, hraði og tóntegund mæld, lagið blandað og taktkortið skrifað.
2. **Grá útgáfa af allri hátíðinni,** læst við lagið: öll atriðin, skotin og tímasetningin, allir átta á toppnum, pikkin þrjú og
   hjálpin. Mæling á víðasta veisluskotinu. Mynd af því hvar hver stendur. Tvö myndbönd: ósnert og með pikki.
3. **Koman og sólin kveður:** koma hvers vinar upp úr skýjunum, kveðja sólarinnar og birtan úr sólsetri í myrkur. Myndband.
4. **Myrkrið og stjörnurnar:** næturhiminninn, öskrið með gárunni, flugið úr bókinni, stjörnurnar sex með tónunum, stjörnumerkin
   og tunglið. Kyrrmyndir af stjörnumerkjunum og tunglinu fyrst, svo myndband.
5. **Sviðið og ljósin:** sviðið, kastararnir, ljósaseríurnar, dansgólfið og skýjahafið, öll læst við lagið. Myndband.
6. **Hljómsveitin og dansinn:** hlutverk hvers vinar, kallaði dansinn, sólóin, stjörnumerkin sem dansa, kyrra stundin og síðasta
   viðlagið með flugeldum og norðurljósum. Myndband af allri veislunni.
7. **Sjöunda stjarnan og endirinn:** stefið, ljósið, svifið, vistunin, röð kaflanna, reiturinn í bókinni og tengingin við ferðina
   til baka. Heil spilun.
8. **Línur og hljóð:** allar línur teknar upp og já/nei-síðan hlustuð; ný hljóð aðeins eftir leyfi. Mælingar og öll prófin græn.

**Lokið** er þegar leikurinn spilast frá kafla 6 og út hátíðina á greininni, prófin eru græn og eigandinn hefur séð og samþykkt.

## 12. Opið

- **Uppstillingin á toppnum:** hvar hver vinur stendur og hvar sviðið rís, ákveðið eftir myndum í búti 2.
- **Lagið:** valið eftir eyranu í búti 1.
- **Köllin í dansinum:** hvaða hreyfingar Slóeðla kallar og með hvaða orðum, ákveðið þegar dansinn er saminn í búti 6.
- **Tillögurnar þrjár** efst í skjalinu bíða svars eigandans.
- **Hvað opnast þegar hátíðin hefur verið séð:** í dag opnar leikurinn kafla 6 aftur. Eigandinn er spurður í búti 7, þegar hann
  getur séð það.
- **Saga 2** er utan þessa skjals.
