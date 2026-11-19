# Hvar er vinur minn? — nýtt viðmót

Hönnunin var rædd við eigandann 6. nóvember 2026 og bíður nú yfirlestrar hans. Hún nær yfir bæði borðin eins og þau eru í
main (8eb1972). Kort af viðmótinu eins og það er nú: `ui-map.md` í SDD-möppu þessarar áætlunar (skrifað 6. nóvember).

## Markmið

Orð eigandans:
- Viðmótið var smíðað fyrir löngu og aldrei uppfært.
- Það er of ólíkt hinum viðmótunum í leiknum.
- Það er of mikið á skjánum. Það á að vera bara það minnsta.
- Það á að vera áberandi þegar barnið á að gera eitthvað.
- Það þarf til dæmis ekki hljóðrofa.

Hann valdi að minnisspilið líktist smáleikjunum, Litla Yatzy og Eitt, frekar en köflunum („halda áfram eins og þú mælir
með“, 6. nóvember).

Egill er 6 ára og farinn að lesa. Röddin ber allt, en stuttur texti má standa.

## Ákvarðanir

| Spurning | Val |
|---|---|
| Fyrirmynd | Litla Yatzy: 88 px hringhnappar með 3 px dökkri brún og kremlitaðri fyllingu, Mosi sem hjálparhnappur niðri til vinstri, fingurbending Yatzy |
| Hvað er eftir á skjánum | Hlé, Mosi og blaðran hans, karfan með pörunum, og það sem á að ýta á |
| Hljóðrofi | Fer alveg, líka úr hlé-glugganum. Gamla vistaða þöggunin er hunsuð og henni eytt |
| Hjálp | Hjálparglugginn fer. Mosi-hnappurinn segir aftur það sem Mosi bað um síðast |
| Yfirlit | Hnappurinn fer. Myndavélin velur sjálf |
| Þegar barnið á að gera eitthvað | Það glóir strax. Eftir 4 sekúndur kemur fingurbending Yatzy og eftir 10 sekúndur segir Mosi það aftur, einu sinni |
| Ný list | Engin. Fingurinn og útlitið koma úr Litla Yatzy, myndir af Mosa og vinunum eru þær sem eru til |
| Nýjar raddlínur | Engar. Mosi-hnappurinn og endurtekningin nota línur sem eru til |
| Minnisspilið í bókinni | Ekki í þessari umferð (kafli 6) |

## 1. Á skjánum í leik

Aðeins þetta, á báðum borðum:

1. **Hlé**: 88 px hringur efst í hægra horni (`.round` úr Yatzy, tvö strik). Hann opnar hlé-gluggann (kafli 3).
2. **Mosi** neðst í vinstra horni: andlit hans í 112 px hring með gulu „?“ á horninu (`.mosi-help` úr Yatzy), 80 px á mjóum
   skjá. Merktur „Spyrja Mosa“.
   - Ýtt á hann: Mosi segir aftur síðustu línuna sem hann sagði á þessu augnabliki leiksins, með rödd og texta í blöðrunni.
   - Hafi hann ekkert sagt enn: hjálparlína borðsins (`help` á borði 1, `g2_help` á borði 2).
   - Hann gerir ekkert meðan atriði er í gangi eða önnur lína hljómar. Hann truflar ekki leikinn.
3. **Blaðra Mosa** við hlið hans: kremlituð, með setningunni hans, án nafnsins „MOSI“. Hún sýnir það sama og í dag: það sem
   Mosi segir, og annars það sem barnið á að gera núna.
4. **Karfan og pörin** í einu litlu kremlituðu merki efst í vinstra horni:
   - Einn punktur fyrir hvert vinapar (3 á borði 1, 4 á borði 2), fylltur þegar parið finnst. Enginn „pör“-texti.
   - Körfutákn borðsins og talan („2 / 4“). Fundnar gjafir fljúga hingað eins og í dag (`basketPoint`).
5. **Það sem á að ýta á**: laufin, merkin á verkefnunum og hringurinn í „ýttu með“-atriðum, eins og í dag (kafli 2).
6. **Vinavalið** „Hver getur þetta?“ (kafli 2).

**Fer af skjánum:**
- Yfirlit (`#camera`) og „Allt ævintýrið“-ábendingin. Prófkeyrslutólið heldur `__memory.camera`.
- Hljóð (`#sound`) og vistaða þöggunin `mosi.memory.muted.v1`: lyklinum er eytt við opnun og leikurinn er aldrei þaggaður,
  svo enginn festist í hljóðleysi. Hljóðstyrkur tækisins dugar.
- Hjálp (`#help`) og hjálparglugginn. Texti hans nefnir gullörina og Yfirlit, sem bæði fara.
- Græni kassinn: titillinn („Leiðin að berjalundinum“, „Leiðin upp á Sólarsylluna“), „0 / 4 pör“-textinn og leiðarmerki
  borðs 1 (`#journey`).
- Skrautletrið (eyebrow) og smáletrið á öllum spjöldum, og nafnið „MOSI“ yfir blöðrunni.

## 2. Þegar barnið á að gera eitthvað

Í dag kemur lítil gullör eftir 5 sekúndur, og verkefnin glóa með þunnum hring.

**Nýtt:**
1. **Strax** og leikurinn bíður eftir barninu glóir og púlsar það sem á að ýta á: verkefnamerkið, eða hringurinn í „ýttu
   með“-atriði. Laufin púlsa ekki öll í einu (16 lauf yrðu hávaði). Þar tekur bendingin við.
2. **Eftir 4 sekúndur** án snertingar kemur **fingurbending Yatzy** (`tap-hint`: hringur sem dregst saman og teiknaður
   fingur) á það sem á að ýta á. Hún kemur í stað gullörvarinnar, á sama stað og hún kæmi í dag: fyrsta lokaða laufið þegar
   leita á, og verkefnið þegar það bíður.
3. **Eftir 10 sekúndur** án snertingar segir Mosi línu augnabliksins aftur, einu sinni á hverju augnabliki og bara ef sú lína
   er til. Hann grípur aldrei fram í aðra línu eða atriði.
4. **Verkefnamerkin** verða 88 px snertiflötur, eins og hnappar smáleikjanna. Myndin á þeim stækkar í 64 px.
5. **Vinavalið** verður stærra og stendur eitt:
   - Andlitin verða 120 px (88 px á mjóum skjá). Nöfnin standa áfram.
   - „Aftur“ verður 88 px hringhnappur á horni valsins, með sama útliti og X-ið í Eitt. Það er eina leiðin út úr valinu, auk
     Escape, og er því áfram.
   - Karfan og hléið dofna í 60 % meðan valið er opið. Hléið virkar samt áfram.

## 3. Gluggar og spjöld

Allt í útliti Yatzy-glugganna (`.panel`): kremlitað spjald, 3 px dökk brún og stórir hnappar, minnst 88 px háir.

- **Upphaf**: mynd af Mosa, „Hvar er vinur minn?“, ein setning borðsins, borðaspjöldin og gulur „Leikum saman →“. Skrautletrið
  og smáletrið fara.
- **Hlé**, eins og í Yatzy:
  - mynd af Mosa og „Mosi bíður.“
  - stór „Halda áfram“
  - fyrir neðan tveir látlausir hnappar: „Rólegri hreyfing“ og „Byrja upp á nýtt“
  
  „RÓLEG STUND“ og aukasetningin fara.
- **Lokaspjald**: titill, ein setning, gjafalínan, „Spila aftur“ og hnappur á hitt borðið.
  - „i“-hnappurinn með höfundum líkananna stendur, því CC BY krefst þess.
  - Skrautletrið fer.
- **Hleðsla og villa**: sama efni, nýtt útlit.

## 4. Útlit og stærðir

- Litir og form úr `yatzy-junior.css`:
  - blek `--ink`, pappír og kremlituð fylling
  - gull `--gold`
  - upphækkaður skuggi `--raise` og þrýstur `--pressed`
  - 88 px snertiflötur
  
  Smáleikirnir deila engri skrá, svo þetta er afritað í `minnisspil.css` eins og Eitt gerir. Það er engin ný sameiginleg skrá
  í þessari umferð.
- Leturgerðin er Nunito, eins og í dag.
- Mjór skjár (390 px): hlé 88 px, Mosi 80 px, merkið fyrir körfuna og pörin minnkar. Ekkert skarast við vinavalið eða
  blöðruna.
- Rólegri hreyfing (stillingin í hléinu, eða `prefers-reduced-motion`): púlsinn og fingurinn standa kyrr en sjást.

## 5. Kóðinn

- `minnisspil.html`:
  - Toppstikan verður `.corner` (hlé) og merkið fyrir körfuna og pörin.
  - Þjálfarinn verður Mosi-hnappurinn og blaðran.
  - `#help-dialog` og `#overview-hint` fara.
- `minnisspil.css`: Yatzy-útlitið. Gamla `.round-control`, `.adventure-ribbon` og `.journey` fara.
- `engine/memory/game.js`:
  - Hnapparnir sem fara og meðhöndlun þeirra fara.
  - Ný síðasta-lína-skrá fyrir Mosi-hnappinn, og endurtekningin eftir 10 sekúndur.
  - Fingurbendingin kemur í stað `.is-guided:after` (`IDLE_ARROW` verður 4).
  - Gamla þöggunin er hunsuð og lyklinum eytt.
  - Borðgögnin (`ribbon`, `journey`, `copy.help`) mega standa, en viðmótið les þau ekki lengur. Þau sem enginn les fara.
- Engin breyting á leikreglunum, atriðunum, röddunum eða heiminum.

## 6. Ekki í þessari umferð

- **Minnisspilið í bókinni**: flís á Leikir-síðunni og X „Aftur í bókina“, eins og Yatzy í ramma (`frame.js`, `?inbook=1`).
  Það er sitt eigið skref ef eigandinn vill.
- Nýjar raddlínur, og tíu óheyrðu línur borðs 1 (þær bíða undir Ný 3).
- Sameiginleg stílskrá fyrir alla smáleikina.

## 7. Próf og sannprófun

- **Prófskrár** (engar nýjar):
  - `tests/memory-rules.test.mjs`: merkjamálsprófin (338-352, 516-526) fylgja nýja viðmótinu.
  - Hegðunarpróf í sömu skrá:
    - gamla þöggunin er hunsuð og lyklinum eytt
    - Mosi-hnappurinn segir síðustu línu augnabliksins, annars hjálparlínuna
    - endurtekningin kemur einu sinni á augnabliki
  - `memory-bridge-rules.test.mjs:379` sker `game.js` milli `askObstacle` og `pickFriend`. Röð þeirra helst.
- **Prófkeyrslutólið** (`tools/memory-playthrough.mjs`):
  - HUD-listinn og hindranakassarnir fylgja nýju auðkennunum.
  - Skrefið með hjálparglugganum verður skref með Mosi-hnappnum: ýtt á hann, lína hljómar og blaðran sýnir hana.
  - `--hide-hud` fylgir nýju auðkennunum.
  - Fingurinn er mældur á skjánum eins og gullörin var.
- **Keyrslur:**
  - `npm run test:memory`
  - prófkeyrsla beggja borða við 1280 og 390, 0 villur
  - `--restart-at` einu sinni hver
- **Fyrir eigandann:** myndir fyrir og eftir við 1280 og 390, og stutt myndband af umferð á borði 2 með hljóði.
