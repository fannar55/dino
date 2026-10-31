# Hvar er vinur minn? — þrjú pör opna eina leið

Samþykktur næsti áfangi, 25. október 2026. Eigandinn bað um stærra borð,
hlutverk fyrir allar þrjár tegundir, betri GFX/VFX og kvikmyndalegri myndavél.
Þessi beiðni leysir af hólmi fyrri mörk við árbakkann. Fyrri útgáfa er varðveitt
í `qa/memory/river-review-source/` og myndræn prófunargögn hennar haldast.

## Spilanleg leið

1. Finna þrjú pör í stöðugu laufarjóðri. Pörin mega hjálpa um leið og þau
   finnast, en allir sex þurfa að vera fundnir og komnir úr laufunum fyrir ferðina.
2. Þórseðlur lyfta lifandi grein. Þær halda rólegar meðan leikmaður finnur
   fleiri vini. Þríhyrnur geta þá fært stóran bol og myndað varanlega trjábrú.
3. Allir sex fara eftir raunverulegu brúaryfirborði að næsta árbakka.
4. Kambeðlur bera þrjár stórar barkarfjalir lágt á milli sín. Þær leggja
   gönguleið yfir mýrina, eina fjöl í einu, og ganga aðeins á því sem er tilbúið.
5. Leikmaður velur berjalundinn. Allir sex ganga yfir nýju leiðina og koma
   í lundinn áður en lokaskilaboð birtast.

Þrjú púslverkefni: lyfta, ýta, byggja. Ferðirnar tengja þau saman. Enginn
tímamælir, refsistig eða hætta. Hægt er að leggja greinina aftur niður.

## Myndavél og stjórnun

- Venjuleg spilun sýnir núverandi svæði í rúmu sjónarhorni.
- Lauf og minnisspil halda sama sjónarhorni; að snúa laufi hreyfir ekki myndavélina.
- Val og aðgerðir fá mjúka nærmynd. Aðgerðin bíður þar til myndavélin er komin.
- „Yfirlit“ sýnir alla tengdu leiðina. „Nær“ fer aftur í spilanlegt sjónarhorn.
- Yfirlit er til skoðunar; smáir hlutir verða ekki rangir snertipunktar.
- Heimsstjórnun bíður meðan myndavélin hreyfist. Hlé, hljóð og yfirlit eru tiltæk.
- Hlé frystir bæði aðgerð og myndavél. Rólegri hreyfing sleppir myndavélaferðinni.
- Endurræsing hreinsar ferð, smíði, áhrif og myndavél í einu.

## Útlit og hljóð

Hlý, auðlæsileg 3D skógarleið í útlitsfjölskyldu Mosa: skýr rjóður, svalari
gróðurjaðrar, á og mýri sem ólík yfirborð, barkarbrú og stórar byggingarfjalir.
Hreyfing greinar og bols, laufryk, lendingaráhrif, vatn og bygging gefa skýra
svörun við aðgerðum. Hljóð eru staðbundin tilbúin foley og fyrirliggjandi tónlist;
engar nýjar gjaldskyldar talsetningar eru hluti þessa áfanga.

Þríhyrnuunginn er sérunnið módel. Hinar tvær tegundir nota enn fyrirliggjandi
módel; lokaútfærsla nýrra ungamódela er áfram sérstakur listáfangi.

## Afhending og sannprófun

Sjálfstæða spilanlega slóðin helst `remake/minnisspil.html`. Endurskoðun stoppar
við þessa heilu þriggja verkefna leið áður en fleiri tegundum eða svæðum er bætt við.
Prófanir þurfa að staðfesta reglur, alla sex ferðalanga og fætur þeirra á brúm,
rétt lokaskilyrði, hljóðlíftíma, myndavélarstjórnun, endurræsingu og snertisvæði
á síma/spjaldtölvu. Myndir og skýrslur fara í `qa/memory/three-step/`.

Viðmið eru enn 250 þúsund þríhyrningar / 100 draw calls í tablet stillingu.
Þetta er ekki mæling á FPS á raunverulegri Android spjaldtölvu og ekki yfirlýsing
um fullbúin AA-gæði. Gæði útlits, takts og spilunar þurfa lifandi prófun eigandans.
