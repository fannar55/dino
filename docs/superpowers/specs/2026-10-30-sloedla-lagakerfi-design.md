# Söngur Slóeðlu: nýtt lagakerfi frá grunni (hönnun)

30. október 2026. Staða: **drög til yfirlestrar eigandans.** Ákvarðanirnar hér eru hans frá 30. október (svör hans í spjallinu). Engin
smíði fyrr en lýsingin og útfærsluáætlunin eru samþykktar. Grein: `sloedla-lag`.

## 1. Af hverju

Eigandinn tók eftir því að öll lögin byrja með sama undirspilinu og hljóma nánast eins. Rannsókn (30. okt.) staðfesti að það er
hönnunargalli, ekki tilviljun:

- **Leikvélin þvingar sama upphafið.** Hvert lag fær sjálfkrafa sama púls (sparktrommu á hverju slagi, `song.js:187`) og sama
  undirlag. Allt sem eðlurnar eiga (trommur, bassi, hljómar, jafnvel ElevenLabs-rásirnar) byrjar á 18 % styrk bak við 520 Hz síu
  þar til barnið pikkar (`conductor.js:35–36, 84–86`). Fyrstu sekúndur allra níu laganna eru 98 % eins í hljóðrófi.
- **Ein hljómsveit fyrir öll lög.** Öll lög samin í kóða nota sömu 12 hljóðgervlana (`band.js`).
- **Sniðmát.** Pikktaktur Ljósahúss er 96 % Stjörnudans; Risaeðlurokk og Lúðrapartí eru 100 % Ljósahús. Tónlistartólið þvingar
  sama formið; 2 ólík form í 9 lögum.
- **Sama leiðbeining.** Lagasmiðirnir þrír fengu sömu dæmi og völdu allir stálpönnukarnival í F-dúr.

Mælitækin eru í side-session-notes `sloedla-lag/` (`starts.mjs`, `starts-compare.mjs`, `song-dna.mjs`); hljóðsönnun:
`qa/remake/sloedla/upphaf-allra-laga.mp3`.

**Allt nema lögin sjálf stendur:** leikurinn (`game.js`: brautir, nótur, orðin, stjörnumælirinn, klappið, hendurnar), DJ-inn,
áhorfendurnir. Lagakerfið er byggt upp á nýtt.

## 2. Ákvarðanir eigandans

1. **Lagið spilar heilt frá fyrstu sekúndu** með sínu eigin upphafi. Lína hverrar eðlu er hluti af laginu; hitt halda henni inni,
   mistök þagga hana augnablik (gat í laginu), góð röð bætir aukalínum við.
2. **Hitt lætur nótu lagsins sjálfs hljóma sterkar** (kikk), ekki aukanótu ofan á.
3. **Allar leiðir prófaðar í POC:** lag úr upptöku, lag samið í kóða með eigin hljómsveit, og blandað lag.
4. **Leið A: lög úr línum** (sjá 3).
5. **Hvert lag á allt sitt:** byrjun, hljómsveit, hljóð, form, pikktakt.

## 3. Sniðið: lag úr línum

Hvert lag er ein skrá, `remake/engine/sloedla/v2/songs/<id>.js`, og hljóð þess í `remake/assets/audio/sloedla/v2/<id>/`.

```js
export default {
  version: 2,
  id: 'boogie',
  name: 'Rokkhopp',
  tempo: { bpm: 150, offset: 0.031 },        // offset: s frá upphafi hljóðskránna að fyrsta slagi (upptökur), 0 annars
  key: { root: 'C', scale: 'major' },          // fyrir samdar raddir og "bloop" mistaka
  sections: [ { name: 'intro', bars: 4 }, { name: 'vers', bars: 8 }, ... ],  // hvaða form sem er, í röð
  instruments: { fiddla: tools => play },      // hljóðfæri lagsins sjálfs (eins og nú: tools = context, outlet, tone, puff ...)
  layers: [
    { id: 'trommur', owner: 'c', stem: 'drums.mp3' },                 // upptaka
    { id: 'bassi', owner: 'b', stem: 'bass.mp3', gain: 1.1 },
    { id: 'lag', owner: 'a', part: { instrument: 'fiddla', sections: { vers: '0! _ 2 4 | ...', ... } } },  // samin rödd
    { id: 'grunnur', owner: null, stem: 'other.mp3' },                // lagsins sjálfs: spilar alltaf
    { id: 'glimmer', owner: null, tier: 2, part: { ... } },           // kemur inn með góðri röð
  ],
  chart: { barn: [ { beat: 16, owner: 'c', layer: 'trommur', dur: 0.5, pitch: null }, ... ], fullordinn: [ ... ] },
};
```

- **Lína** er annaðhvort `stem` (hljóðskrá í möppu lagsins) eða `part` (nótur á hljóðfæri lagsins; nótnaskriftin sú sama og nú:
  skalaþrep, `_` halda, `.` þögn, 8. eða 16. partar, `!` merkir nótu barnsins).
- **Eigandi** er `'a'` (Slóeðla), `'b'` (Kambeðla), `'c'` (Þórseðla) eða `null` (lagið). Lagið ræður hver spilar hvað.
- **Aukalínur** (`tier: 1–3`) koma inn með röð hitta / stjörnukrafti; `when: 'big'|'calm'` fyrir kaflaútgáfur samdra radda.
- **Nótur barnsins** (`chart`) eru gögn: hver vísar á raunverulega nótu í línu eigandans (slag, lengd, tónhæð ef til). Í samdri rödd
  koma þær úr `!`-merkingunum; í upptöku úr nótusetningartólinu (5). Barnastig: minnst 2 slög á milli (4 í rólegum kafla), helst á
  sterkum slögum, hver eðla minnst 8 sinnum. Fullorðinsstig: þéttara, minnst ½ slag á milli í hverri braut.
- **Ekkert sameiginlegt:** enginn púls, ekkert undirlag, engin hljómsveit sem öll lög deila. Það sem lag vill heyra, á það sjálft.

## 4. Spilarinn

`remake/engine/sloedla/v2/player.js` býr til spilara úr lagi. Hann hefur **sama viðmót og núverandi `conductor.js`** (svo
`game.js`, `lab.js` og allt annað breytist ekki): `start`, `stop`, `chart`, `expected`, `length`, `beat`, `bpm`, `hit(note,
offset)`, `miss(note)`, `stray(role)`, `setTier(n)`, `sectionAt(t)`, `isOpen(role)`, `hits`, `totals`.

- **Upphaf:** allar línur spila frá fyrsta takti. Upptökur sem `AudioBufferSource` samstilltar á hljóðklukkunni; samdar raddir
  tímasettar fram í tímann (eins og nú) gegnum hljóðfæri lagsins.
- **Keðja hverrar línu:** styrkur → sía → (fyrir eðlu) "gat"-hlið → blanda. Lína lagsins sjálfs hefur ekkert hlið.
- **Hitt (kikk):**
  - upptaka: afrit af sama bútnum úr sömu hljóðskrá er spilað ofan á, nákvæmlega samstillt (sama staða í skránni), um +6 dB, ±
    stuttur hljúpur (2 ms upp, dvín á nótunni, mest 0,25 s), með lítilli háorkuskerpu á högginu;
  - samin rödd: nótan slegin fastar (eins og `tapped` nú);
  - auk þess hitt-hljóð leiksins óbreytt (orð, ljós). Undirspilið dýfir sér ekki lengur sjálfkrafa; kikkið kemur úr nótunni.
- **Mistök:** lína eðlunnar dofnar í ~18 % bak við ~600 Hz síu þar til næsta hitt opnar hana (~20 ms); mjúkt "bloop" á tónhæð
  nótunnar. Þrjú mistök í röð: hún spilar með sem "draugur" í einn takt (eins og nú).
- **Raðir:** `setTier(n)` dregur inn aukalínur `tier ≤ n` (stjörnukraftur = 3). Klappið, DJ-inn og orðin eru leiksins.
- **Kaflar:** samdar raddir geta átt `big`/`calm`-útgáfur og hækkun um tón (`lift`), dæmt eins og nú. Upptökur: stór kafli fær smá
  birtu og styrk, rólegur síu.
- **Tvær brautir:** lína `b` spilar þá með án hliðs.

## 5. Tól

- **`tools/sloedla-music.mjs`:** forskrift fær sitt eigið form (`form: [['Intro', 4], ...]`) í stað fasta `STRUCTURE`. Rásir, mæling
  og raddapróf eins og nú.
- **Nýtt `tools/sloedla-stem-chart.mjs`:** les rás hvers eiganda (upphöf nótna með litrófsflæði, á taktnetið), velur nótur barnsins
  eftir reglunum í 3 og skrifar `chart` inn í lagið. Handvirkar lagfæringar haldast (tólið skrifar aðeins það sem ekki er festt).
- **Nýtt `tools/sloedla-variety.mjs` + próf:** ber hvert lag saman við öll önnur: pikktaktur (líkindi < 60 %), form, og upphaf
  (hljóðróf fyrstu 8 s án pikks, < 85 % líkindi; mælt í vafra). Of líkt lag fellur.

## 6. Lögin þrjú (POC)

Hvert í eigin stíl, tóntegund og takti, með eigið form og upphaf. Ekkert þeirra er karnival.

1. **Upptaka:** nýtt ElevenLabs-lag, glaðlegt rokk-og-ról / boogie (píanó, kontrabassi, trommur), um 150 slög, C-dúr. Línur: trommur
   (Þórseðla), kontrabassi (Kambeðla), píanó (Slóeðla), annað (lagið). Nótur barnsins lesnar úr rásunum.
2. **Samið með eigin hljómsveit:** 8-bita tölvuleikjaævintýri (chiptune), um 140 slög, A-moll. Lagið býr til öll sín hljóð (púls-,
   þríhyrnings- og suðbylgjur). Slóeðla laglínuna, Kambeðla arpeggíó, Þórseðla trommurnar.
3. **Blandað:** trommur og bassi úr ElevenLabs-upptöku (fönkí hipphopp-taktur, um 95 slög, E-moll), laglína Slóeðlu samin og spiluð
   á hljóðfæri lagsins; Kambeðla og Þórseðla eiga rásirnar.

Hvert lag fær myndband (sýningarumferð) og stendur í tilraunasíðunni við hlið gömlu laganna.

## 7. Prófun

- Sjálfvirk próf: sniðið (allar línur til, eigendur gildir, `chart` vísar á til línur), reglur barnastigsins, fjölbreytniprófið (5).
- Mælt (ekki heyrt): byrjun laganna þriggja < 80 % lík hver annarri og gömlu lögunum (áður 98 %); hitt-kikk ≥ +3 dB á
  spjaldtölvubandi; ekkert klipp; 60 rammar á sekúndu.
- Myndbönd og skjámyndir 1280×800 og 390×844.

## 8. Gömlu lögin og gamla vélin

Standa óbreytt á meðan POC er prófað (`conductor.js`, `song.js`, `band.js`, níu lög); tilraunasíðan velur spilara eftir `version`.
Þegar eigandinn hefur samþykkt POC er ákveðið saman hvort gömlu lögin eru flutt í nýja sniðið eða þeim hent.

## 9. Utan þessa verks

Grafík, orð, DJ, áhorfendur, stjörnumælir, klapp og hendur (grein `klapp-hendur`) breytast ekki. Engin sameining við `main`.
