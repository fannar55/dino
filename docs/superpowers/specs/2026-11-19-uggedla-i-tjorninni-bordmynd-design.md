# Uggeðla í tjörninni: sýning á borðinu (borðmynd fyrir gleraugun)

**Staða 19. nóvember 2026.** Eigandinn skoðaði prufuna „Mosi á borðinu“ (`?chapter=bord3d`) á spjaldtölvu með gleraugunum:
„virkar, kemur vel út, mikið 3d“. Hann valdi næst „sýningu á borðinu“ og söguna „Tjörnin“. Þetta skjal er planið. Skref 1
(kyrrar lykilmyndir) er næst; hvert skref endar á því að hann skoðar á spjaldtölvunni.

## 1. Hvað þetta er

Um mínútu löng sýning fyrir rauð/blágræn gleraugu á skjá sem liggur flatur á borði. Skjárinn er vatnsflötur tjarnar. Uggeðla kemur
neðan úr djúpinu, rís upp úr vatninu yfir borðið, grípur fisk og fær fiðrildið á trýnið. Borðið gefur þrennt sem uppréttur skjár
gefur ekki: djúpið undir skjánum, flötinn sjálfan og loftið yfir honum.

## 2. Borðið í tölum

- Áhorfandinn situr við neðri brún skjásins. Augun eru 45 cm frá miðju skjásins í 45° halla, 31,8 cm yfir borðinu, og 5,8 cm
  eru á milli þeirra. Rúmfræðin er í `remake/engine/table3d.js`: hvort auga horfir beint niður á skjáflötinn og glugginn þess er
  skjárinn sjálfur.
- Það sem er á fletinum hefur enga hliðrun. Það sem er yfir honum stendur upp úr skjánum. Það sem er undir honum sést í gegnum
  hann eins og gegnum glugga.
- Hæð h yfir skjánum gefur hliðrunina 5,8 · h / (31,8 − h) cm. Á 10,5 tommu skjá (22,6 × 14,1 cm) er það 3,7 % af breiddinni
  við 4 cm, 5,9 % við 6 cm og 8,6 % við 8 cm. Þetta er mun meira en 4 % þakið á uppréttu sýningunum, og það kom vel út.
- Hátt hlutur teygist frá áhorfandanum á skjánum. Það sem er 8 cm hátt þarf nær alla dýpt 10,5 tommu skjás, svo um 8 cm er
  hámarkið þar; 10 cm komst ekki fyrir í prufunni.
- Dýpi d undir skjánum gefur hliðrunina 5,8 · d / (31,8 + d) cm í hina áttina: 1,9 cm við 15 cm. Botninn er mest 15 cm undir.
- Sentimetrar verða að vera sentimetrar: síðan þarf að vita tommufjölda skjásins („skjár −“ og „skjár +“) og man stillinguna.

## 3. Reglur borðsins

1. Ekkert sem stendur upp úr fletinum má snerta brún síðunnar: útlínur þess eru innan hennar með 4 % bili, fyrir bæði augu.
   Það sem er undir fletinum má brúnin skera, eins og gluggi.
2. Ekkert kemur inn yfir brún. Allt kemur neðan frá eða er í mynd frá byrjun.
3. Ekkert poppar inn: það sem kemur er fyrst lítið og langt niðri.
4. Stóru augnablikin dvelja í tvær til þrjár sekúndur.
5. Ekkert fer í gegnum annað. Bil er mælt frá ystu mörkum (vængjum og öllu), ekki frá miðju.
6. Það sem dýrin gera sést á vatninu: hringir, loftbólur, dropar, skvetta.
7. Vatnið er gruggugt og í miðtónum, og dýpið dimmt. Engin hörð skil milli ljóss og dökks yfir fletinum: í prufunni komu rauðar
   rendur þar sem ljós Mosi stóð við dökkan skugga sinn.
8. Enginn texti er í mynd í sýningunni sjálfri (yfirlitssíða lykilmyndanna hefur merkimiða með tölum).
9. Aðeins efni leiksins: líkön eigandans, vatn, plöntur og fiskar sem til eru. Ekkert er teiknað eða sótt.

## 4. Sagan í sex lyklum (um 60 sekúndur, tímar til viðmiðunar)

| Lykill | Sekúndur | Það sem sést | Yfir fletinum |
|---|---|---|---|
| 1. Kyrr tjörn | 0–8 | Vatnaliljublöð fljóta á fletinum, froskur situr á einu, fiskar synda á ýmsu dýpi | froskurinn, liljublómin, fiðrildið á blaði |
| 2. Skugginn | 8–20 | Dökkur skuggi djúpt niðri stækkar; loftbólur stíga upp og gera hringi á fletinum; fiskarnir forða sér | ekkert nýtt |
| 3. Seglið | 20–30 | Seglið brýtur flötinn og rennur yfir miðja tjörnina; búkurinn sést undir | seglið, 3–4 cm |
| 4. Höfuðið | 30–42 | Háls og höfuð rísa, vatn rennur af, hún horfir á áhorfandann og dvelur | höfuðið: 5, 6,5 eða 8 cm (eigandinn velur) |
| 5. Fiskurinn | 42–50 | Stór fiskur stekkur í boga yfir borðið, hún skýtur höfðinu að honum og grípur hann; skvetta | fiskurinn efst í boganum, um 5 cm |
| 6. Fiðrildið | 50–60 | Fiðrildið flögrar upp af blaðinu og sest á trýnið á henni; hún sekkur hægt og hringir breiðast út | fiðrildið á trýninu |

Uggeðla er líkan eigandans (14 m löng, seglið 7,3 m upp). Hreyfingar hennar í vatni eru til í kafla 2
(`remake/chapters/kafli2-uggedla.js`: hún liggur lágt, seglið rís, höfuðið upp með fisk, hún grípur fisk, syndir, hringir og bólur).

## 5. Skrefin

1. **Lykilmyndir.** Kyrrar myndir af lyklunum sex á yfirlitssíðu (`?chapter=tjorn3d&lykill=1`), lykill 4 í þremur hæðum. Mælt:
   hæð og hliðrun þess sem hæst rís, bil að brúnum, dýpsta sýnilega hlut. Eigandinn skoðar á spjaldtölvunni og velur hæðina.
2. **Hreyfingin.** Sýningin öll, hljóðlaus, frá gleraugnabyrjun að lokaspjaldi.
3. **Frágangur.** Hljóð (vatn, skvetta, bólur), tal ef hann vill, spjald í bókinni, próf.

## 6. Óákveðið

- Hve hátt höfuðið rís (lykill 4).
- Hvort Uggeðla segir eitthvað.
- Nafn sýningarinnar og hvar hún fer í bókina.
- Hvernig hún kemst á lifandi vefinn. Núna er hún skoðuð yfir heimanetið; sameining, ýting og sending á Cloudflare gerast aðeins
  á orð eigandans.
