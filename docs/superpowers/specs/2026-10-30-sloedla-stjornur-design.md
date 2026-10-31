# Söngur Slóeðlu: 3D-stjörnur á lokaskjánum og stikunni (hönnun)

30. október 2026. Staða: **drög til yfirlestrar eigandans.** Ákvarðanirnar hér eru hans frá 30. október (svör hans í spjallinu).
Engin smíði fyrr en lýsingin og útfærsluáætlunin eru samþykktar. Grein: `sloedla-lag`.

Seinni hluti af tveimur; sá fyrri, valmyndin, er smíðaður (`2026-10-30-sloedla-valmynd-design.md`).

## 1. Af hverju

Eigandinn: stjörnurnar eru svo flatar; frítt asset eða stjarna sem hann gerir í Tripo3D, svo hægt sé að hreyfa þær betur og gefa
VFX, meira juice; sama með stigagjöfina efst á skjánum, mjög flöt og einföld.

Í dag (`engine/sloedla/game.js`) eru allar stjörnurnar flatar 2D-myndir (`star()`): þrjár á stikunni efst (`drawBar`, við 25, 50 og
80 %, `STAR_SHARES`), stjarnan sem flýgur upp í stikuna þegar hlutfall næst (`flyers`), og þrjár stórar á lokaskjánum (`drawEnd`,
koma ein af annarri á `STAR_GAP` = 0,75 s með bjöllu), og undir þeim „Þú spilaðir X af Y tónum“.

## 2. Ákvarðanir eigandans

1. **Stjarnan er frítt 3D-asset fyrst** (CC0, GLB), sýnt honum áður en nokkru er hlaðið niður; hans eigin Tripo3D-stjarna getur
   leyst það af síðar á sama stað.
2. **3D-stjarnan kemur á lokaskjáinn og stikuna efst.** Stjörnumælirinn vinstra megin (Stjörnukraftur) helst eins og hann er.
3. **Leið A: lifandi 3D** með three.js ofan á leiknum (ekki forteiknaðar myndir, ekki 2D).
4. Lokaskjárinn (hluti 1), stikan (hluti 2), smíðin (hluti 3) og stjarnan og prófunin (hluti 4) eins og lýst er hér: samþykkt.

## 3. Lokaskjárinn

- Lagið endar, skjárinn dökknar (eins og nú).
- **Hver stjarna sem vannst flýgur af stikunni efst** (frá sínum stað þar) í boga niður á sinn stað í miðjunni og snýst tvo hringi
  á leiðinni; lendir með skoppi, gylltum blossa, höggbylgju og neistum, og bjallan hringir (hærra fyrir hverja). Um 0,7 s á milli.
  Miðstjarnan stærst og hæst (eins og nú).
- **Stjörnur sem unnust ekki** standa á sínum stað sem dökkar glerstjörnur og titra aðeins.
- **Þrjár stjörnur:** eftir þá þriðju snúast allar þrjár einn hring saman, flugeldar (eins og nú) og orðið í regnboga (eins og nú).
- **Eftir lendingu** vagga stjörnurnar hægt; gljái sveipast yfir þær á nokkurra sekúndna fresti.
- **Stigin:** „Þú spilaðir 45 af 52 tónum“ telur upp frá 0 á um sekúndu með léttum tikkum; svo „Lengsta röð: 34“; og ef bestu
  stjörnur lagsins hækkuðu (valmyndin, `best.js`): „Nýtt met!“ með glitri.
- **Hnapparnir** „Spilum aftur“ og „Annað lag“ renna upp þegar stjörnurnar hafa lent, ekki fyrr.

## 4. Stikan efst

- Stikan þykkari og gljáandi; gullið fær glitrandi brún fremst.
- **Litlu stjörnurnar þrjár eru 3D:** dökkt gler sem snýst hægt áður en þær nást.
- **Stjarnan sem flýgur upp í stikuna** þegar hlutfall næst (í dag 2D) er sama 3D-stjarnan.
- **Þegar stjarna næst** hoppar hún, snýst hratt einn hring, blossar gyllt, neistar springa, bjallan hringir og stikan hristist aðeins;
  svo er hún gyllt og vaggar létt.

## 5. Smíðin

- **Einn gegnsær three.js-strigi** ofan á leikstriganum, sem tekur ekki við pikkum. Leikurinn segir honum í hverjum ramma hvar
  stjörnurnar eru og í hvaða ástandi (gler eða gull, á flugi, að lenda, að vagga, stærð). three.js kemur eins og í hinum köflunum
  (`importmap`: `../dist/vendor/three.module.js`, `./vendor/addons/` fyrir GLTFLoader).
- **Hreyfingarnar** (bogaflugið, snúningurinn, skoppið, vaggið, talningin) eru hrein stærðfræði í eigin einingu, prófanleg.
- **Neistarnir, höggbylgjan og flugeldarnir** á leikstriganum, með agnakerfi leiksins, undir stjörnunum.
- **Efni stjörnunnar er okkar:** gyllt málmyfirborð sem glóir (og dökkt gler fyrir þær sem unnust ekki), sett á lögun líkansins,
  svo stjarnan lítur eins út hvaðan sem líkanið kemur og Tripo3D-stjarnan smellpassar síðar.
- **Til að hlífa spjaldtölvunni:** striginn teiknar aðeins meðan stjarna sést eða hreyfist; upplausnin í mesta lagi 1,5× pixlaþéttni;
  rammahraðinn mældur fyrir og eftir (huldi vafrinn: 54–56 rammar á sekúndu í dag).
- **Án þrívíddar** (ekkert WebGL, eða stjarnan finnst ekki): flötu stjörnurnar koma af sjálfu sér, leikurinn eins og í dag.

## 6. Stjarnan og prófun

- **Stjarnan:** 2–3 frjálsar 3D-stjörnur (CC0) sýndar í vafraflipa hugmyndanna, með mynd, uppruna, leyfi og stærð; eigandinn velur;
  engu hlaðið niður fyrr en hann samþykkir. Í `assets/sloedla/stjarna/` með `KREDIT.md`.
- **Próf:** hreyfingarnar (hvar stjarnan er á flugi, að hún lendi á réttum stað og tíma, að skoppið jafni sig, að gler-stjörnur fljúgi
  ekki), talningin og „Nýtt met“, og að leikurinn virki án þrívíddar.
- **Séð:** myndband af lokaskjánum með 0, 1, 2 og 3 stjörnum, og af stikunni í umferð; rammahraðinn fyrir og eftir.

## 7. Utan verksins

- Stjörnumælirinn vinstra megin (Stjörnukraftur).
- Önnur hljóð en tikkin í talningunni.
- Valmyndin (fyrri hluti, búinn).

## 8. Opið

- Hvaða stjarna: ræðst þegar eigandinn hefur valið úr kostunum (sjá 6).
- Ef rammahraðinn fellur merkjanlega á spjaldtölvu: einfaldara efni eða lægri upplausn fyrst, flötu stjörnurnar í versta falli.
