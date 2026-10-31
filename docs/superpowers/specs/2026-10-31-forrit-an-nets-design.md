# Mosi sem forrit, líka án nets (hönnun)

31. október 2026. Staða: **drög til yfirlestrar eigandans.** Engin smíði fyrr en lýsingin og útfærsluáætlunin eru samþykktar.
Grein: `forrit` (vinnusvæði `C:\Risaeðla\dino-forrit`). Byggir á skýinu eins og það er í `main` (`cloud/README.md`, 7a60bf7):
einn Worker með síðuna sem Static Assets, hljóðin í gegnum Workerinn, `_headers` sem geymir myndir, líkön og hljóð í vafranum í
sólarhring, og `npm run deploy` sem afritar leikinn fyrst.

## 1. Markmið

Egill opnar Mosa af heimaskjánum eins og hvert annað forrit, á fullum skjá, og getur spilað allt í bílnum eða í bústaðnum án
nets. Velgengni lítur svona út:

- Leikinn má setja upp á Android (Chrome), PC (Chrome eða Edge) og iPad/iPhone (Safari: Deila → „Bæta á heimaskjá“). Táknið
  er höfuð Mosa og nafnið „Mosi“.
- Eftir eina eða tvær lotur á Wi-Fi stendur „Tilbúinn án nets ✓“ undir Byrja. Þá virkar allt í flugstillingu: allir leikir,
  raddir, lög og bókin. Eina undantekningin er Fjölspil, sem segir „Fjölspil þarf net“.
- Ný útgáfa (`npm run deploy`) berst í tækið án þess að neitt sé gert á því. Aðeins breyttar skrár sækjast, og skiptin verða
  aldrei í miðjum leik.
- Vafraflipi, símar gesta sem skanna QR-kóðann og prófanir heima á `localhost` haga sér eins og í dag.

## 2. Ákvarðanir eigandans (31. október 2026)

1. **Uppsetning** á Android, PC og iOS, og leikurinn virkar **líka án nets**.
2. **Allur leikurinn sækist strax** (um 195 MB), ekki bara það sem Egill hefur spilað.
3. **Lína við Byrja** sýnir framvinduna. Engin önnur merki eru sýnileg.
4. **Táknið er höfuð Mosa,** skorið úr `remake/assets/book/images/mosi-render.webp` eins og í sýnishorninu sem var samþykkt. Það
   er á ljósbláum lit stikunnar, `#cfdde3`. Ekkert er teiknað, myndin er bara skorin og staðsett.
5. **Leið A:** eigin service worker og niðurhal sem leikjasíðan stýrir, eftir lista með fingrafari hverrar skrár. Ekki Workbox,
   sem þyrfti að sækja og sækir allt í einni lotu sem byrjar upp á nýtt ef hún slitnar.
6. **Lénið bíður.** Forritið býr á `https://mosi.fannar55.workers.dev/remake/`.

## 3. Uppsetningin: manifest og tákn

- **`remake/manifest.webmanifest`:**
  - `name` og `short_name` „Mosi“, `lang` „is“;
  - `id`, `start_url` og `scope` eru allt `/remake/`;
  - `display` er `fullscreen`. iOS sýnir þá án stika Safari, og Android og PC án vafrastiku;
  - `background_color` og `theme_color` eru `#cfdde3`;
  - stefna skjásins er ekki læst, því sumir skjáir leiksins hafa skammsniðs-útlit.
- **Táknin** eru í `remake/assets/icons/`:
  - `icon-192.png` og `icon-512.png` (`purpose: any`, ferningur út í brúnir: höfuðið eins og í sýnishorninu);
  - `icon-maskable-512.png` (`purpose: maskable`: víðari skurður, svo horn og goggur haldist innan hrings sem er 80 % af
    breiddinni);
  - `apple-touch-icon.png` (180×180, ferningur út í brúnir; iOS rúnnar hornin sjálft).
  `remake/tools/make-icons.mjs` býr þau til með ffmpeg úr `mosi-render.webp`. Skurðirnir eru festir í skriftunni, svo hægt sé
  að búa táknin til aftur. Táknin fara í git, en skriftan keyrir ekki við hverja afritun.
- **`remake/index.html`** fær í hausinn:
  - `<link rel="manifest">` og `<link rel="icon">` með `icon-192.png`, í stað auða táknsins `data:,`;
  - `<link rel="apple-touch-icon">`;
  - `apple-mobile-web-app-capable` (eldri iOS), `apple-mobile-web-app-title` „Mosi“ og `mobile-web-app-capable`.

  Aðeins `index.html` fær manifest. Síða gestsins (`spil.html`) og lab-síðurnar verða ekki forrit.
- **`remake/tools/serve.mjs`** fær MIME-tegundina `.webmanifest` → `application/manifest+json`.

## 4. Listinn: `offline.json`

- **Hvar:** `cloud/stage.mjs` skrifar `site/remake/offline.json` í lokin, á eftir `_headers`. Það sem býr hann til er hrein
  aðgerð í `cloud/src/offline-list.mjs`, svo hægt sé að prófa hana.
- **Snið:** `{ "version": "<16 hex>", "files": { "/remake/index.html": { "size": 5123, "hash": "<16 hex>" }, … } }`.
  - Lyklarnir eru slóðir eins og vafrinn biður um þær.
  - `hash` er fyrstu 16 hex-stafir SHA-256 af innihaldi skrárinnar.
  - `version` er fyrstu 16 hex-stafir SHA-256 af röðuðum línum „slóð stærð hash“. Sami leikur gefur því alltaf sama
    útgáfunúmer.
- **Innihald:** allar afritaðar skrár nema `_headers`, `offline.json` sjálft og `remake/sw.js`. Vafrinn sækir `sw.js` sjálfur.
- **Örugg nöfn:** stage hafnar skráarnafni sem þyrfti kóðun í slóð (bil eða stafir utan ASCII) og nefnir það, eins og hann
  hafnar skrá yfir 25 MiB. Í dag er ekkert slíkt nafn til.
- **Neyðarhemill:** `node stage.mjs --burt` skrifar `{ "burt": true }` í stað listans (sjá §7).

## 5. Geymslan á tækinu (Cache Storage)

- **`mosi-skrar`:** ein færsla fyrir hvert fingrafar, lykill `/remake/__skrar__/<hash>`. Gildið er innihald skrárinnar með
  `Content-Type` og `Content-Length` eins og skýið svaraði. Skrá sem er eins í tveimur útgáfum er geymd einu sinni.
- **`mosi-listar`:**
  - listi hverrar útgáfu sem tækið hefur byrjað á, `/remake/__listar__/<version>`;
  - merkið `/remake/__listar__/virk` (`{ version }`): útgáfan sem service workerinn svarar úr;
  - merkið `/remake/__listar__/tilbuin` (`{ version }`): útgáfa sem er öll komin en hefur ekki enn tekið við.

## 6. Service workerinn: `remake/sw.js`

- **Venjuleg skrá án `import`:** óvíst er hvort iPad keyri service worker skrifaðan sem ES-einingu. Hann sker því hljóðbita
  með sínu eigin afriti af reglunum í `cloud/src/range.mjs`. Próf keyrir sömu tilvik á báðar útgáfurnar (§10).
- **Skráning:** `remake/engine/offline/forrit.js`, sem `main.js` les inn, skráir hann með `scope: '/remake/'`. Það gerist
  aðeins:
  - á `https` (skýinu);
  - eða á `localhost`/`127.0.0.1` með `?forrit=1` eða `?forrit=uppsett`, fyrir gönguferðina.

  Heima, á `http://localhost:4231` og öðrum portum, er enginn service worker og ekkert breytist.
- **Uppsetning:** `skipWaiting()` og `clients.claim()`. Ekkert er sótt við uppsetningu. Síðan sér um niðurhalið (§7).
- **Hvaða beiðnum hann svarar:** aðeins `GET` á sama uppruna, þegar útgáfa er merkt `virk`, slóðin er á lista hennar og
  fingrafarið er í `mosi-skrar`. Öllu öðru er hleypt á netið eins og í dag:
  - tenging Fjölspils (`/fjolspil/ws/…`);
  - skrár sem eru ekki á listanum;
  - beiðnir með `cache: 'reload'` eða `'no-store'`, sem eru beiðnir niðurhalsins sjálfs og `offline.json`.

  Áður en fyrsta útgáfan er öll komin svarar hann því engu. Leikurinn er þá ekki hálfur án nets.
- **Slóð að skrá:**
  1. fyrirspurninni er sleppt;
  2. slóð sem endar á `/` fær `index.html`;
  3. slóð sem er á listanum er hún sjálf;
  4. slóð sem fær `.html` aftan á sig og er þá á listanum er sú síða. Skýið svarar `spil.html` á `/remake/spil`, og
     `yatzy-junior.html?inbook=1` verður `/remake/yatzy-junior.html`.
- **Svarið:**
  - án `Range`: 200 með geymdu hausunum;
  - með bilinu `bytes=a-b`, `bytes=a-` eða `bytes=-n`: 206 með bútinum og `Content-Range`, eða 416, eins og Workerinn;
  - síður eru alltaf nýtt svar, aldrei áframsending, því vafrar hafna áframsendu svari við síðuhleðslu.
- **Hvaða útgáfu hann les:** hann les `virk` einu sinni og geymir listann í minni. Síðan segir honum frá skiptum (§7) áður en
  hún endurhleður sig.
- **Uppfærsla á `sw.js`:** vafrinn ber `sw.js` saman við skýið við hverja síðuhleðslu á neti, framhjá skyndiminninu. Lagfærður
  `sw.js` nær því í hvert tæki næst þegar það opnast á neti.

## 7. Niðurhalið, skiptin og línan: `remake/engine/offline/`

- **Hvar það keyrir:** aðeins í leikjasíðunni (`index.html`), og aðeins í uppsetta forritinu:
  - `display-mode` er `fullscreen` eða `standalone`, eða `navigator.standalone` á iOS;
  - eða `?forrit=uppsett` á `localhost`.

  Venjulegur flipi og síða gestsins sækja því aldrei 195 MB. iPad geymir forritið á heimaskjánum sér, aðskilið frá Safari, og
  því væri niðurhal í flipa sóun.
- **Við hverja ræsingu:**
  1. Ef `tilbuin` er til og nýrri en `virk` tekur hún við strax (skiptin, hér á eftir), áður en annað gerist.
  2. Sótt er `/remake/offline.json` með `cache: 'no-store'`.
     - Ef það tekst ekki (ekkert net): línan segir „Tilbúinn án nets ✓“ ef `virk` er til, annars „Vantar net til að klára
       (N %)“. N kemur af síðasta listanum sem byrjað var á.
  3. `burt`: öllum `mosi-*` geymslum er eytt, service workerinn er afskráður og línan falin.
  4. Listinn er sá sem er `virk`: línan segir „Tilbúinn án nets ✓“ og ónotuðum fingraförum er eytt.
  5. Annars er listinn geymdur og fingraförin sem vantar í `mosi-skrar` eru sótt:
     - `fetch(slóð, { cache: 'reload' })`, svo sólarhringsgeymsla vafrans skili aldrei gamalli skrá;
     - fjórar í einu á fyrsta skjánum, ein í einu eftir að ýtt er á Byrja, svo lag sem er að hlaðast keppi ekki við
       niðurhalið;
     - hver skrá er athuguð: svarið er `ok`, stærðin stemmir og SHA-256 stemmir. Annars er hún ekki geymd og reynt aftur seinna.
       Það grípur líka skrá úr nýrri útgáfu sem fer í loftið á meðan niðurhalið stendur.
  6. Í byrjun er beðið um `navigator.storage.persist()`, svo vafrinn hreinsi ekki geymsluna þótt plássið minnki.
- **Skiptin:** þegar allt á listanum er komið er útgáfan merkt `tilbuin`.
  - Ef ekki er búið að ýta á Byrja biður síðan service workerinn að gera hana `virk`. Hann gerir það aðeins ef þetta er eini
    gluggi forritsins (`clients.matchAll`, efsta stig), og síðan endurhleður sig.
  - Annars tekur hún við við næstu ræsingu (skref 1).
  - Fyrsta útgáfan á tækinu tekur við án endurhleðslu, því síðan kom þá þegar af netinu í sömu útgáfu.
  - Eftir skiptin er eytt fingraförum og listum sem hvorki `virk` né `tilbuin` nota. Á tækinu er því aðeins ein útgáfa, auk
    breyttu skránna á meðan uppfærsla stendur.
- **Línan:** `<p id="forrit-lina" class="forrit-lina" aria-live="polite" hidden>` beint undir Byrja í `index.html`.
  - Hún er lítil og hljóðlát í letri leiksins og sést aðeins á fyrsta skjánum, aðeins í uppsetta forritinu. Hún hverfur þegar ýtt
    er á Byrja. Með `play=1` sést hún aldrei.
  - Textarnir:

    | Staða | Texti |
    |---|---|
    | Fyrsta niðurhal | „Sæki leikinn í tækið … 40 %“ |
    | Uppfærsla | „Sæki nýja útgáfu … 40 %“ |
    | Allt komið | „Tilbúinn án nets ✓“ |
    | Ekkert net, ekki allt komið | „Vantar net til að klára (40 %)“ |
    | Ekkert pláss (`QuotaExceededError`) | „Ekki nóg pláss í tækinu“ |

  - Prósentan er bæti sem eru komin af bætum listans.

## 8. Fjölspil án nets

Á meðan stóri skjárinn nær ekki sambandi við herbergið, þegar staða netsins er `offline` og það hefur aldrei verið `connected`
í þessari lotu, kemur „Fjölspil þarf net“ í stað QR-kóðans og stafanna. Þegar sambandið kemst á birtist QR-kóðinn.

- Þetta gildir hvar sem QR-kóðinn er teiknaður: `engine/fjolspil/lobby.js` (Eitt!, Háls og hali, Litla Yatzy) og
  `engine/sloedla/band-lobby.js` (Söngurinn).
- Fyrsta tilraunin (`connecting`) sýnir QR-kóðann eins og nú. Á venjulegu neti blikkar textinn því aldrei.

## 9. Skýið

- **`cloud/stage.mjs`** skrifar `offline.json` (§4) og tekur við `--burt`.
- **`cloud/README.md`** fær kaflann „Forritið og án nets“:
  - hvað gerist á tækinu;
  - að ný útgáfa berst sjálf;
  - neyðarhemilinn (`node stage.mjs --burt` og svo `wrangler deploy`, eða lagfærður `sw.js`);
  - að iPad geymir forritið sér frá Safari.
- **Kostnaður:** óbreyttur, ekkert. Eitt fullt niðurhal er um 1800 beiðnir. Þar af fara um 800 hljóð í gegnum Workerinn, sem er
  langt undir 100.000 á dag.

## 10. Prófanir

- **Einingapróf (`node --test`):**
  - **listinn:** fingraför, útgáfunúmer sem er eins fyrir sama leik, hvað er undanskilið og höfnun nafna sem þarf að kóða;
  - **niðurhalið** (hreinar aðgerðir): hvað á að sækja miðað við lista og geymslu, hvað á að eyða eftir skipti, prósenta og
    texti línunnar í hverri stöðu;
  - **`sw.js`** (keyrður í `vm` með gervi-`self`):
    - slóð að skrá, fyrir `/remake/`, `spil`, `spil.html`, fyrirspurnir og skrá utan lista;
    - hverju er hleypt á netið (`reload`, `no-store`, `/fjolspil/`, ekki `GET`, annar uppruni);
    - hljóðbitar skornir eins og í `cloud/src/range.mjs`, með sömu tilvikum á `theme.mp3`;
  - **Fjölspil:** „Fjölspil þarf net“ eftir `offline` án `connected`, og QR-kóðinn við `connecting` og `connected`.
- **Gönguferð** (`remake/tools/forrit-walk.mjs`):
  - Edge án skjás yfir CDP, ein í einu með rec-lock-möppunni. `wrangler dev` keyrir afritaða síðuna á `127.0.0.1`, svo
    Workerinn, `_headers` og síðunöfn skýsins séu með. Ferlum wrangler er lokað á eftir.
  - Skrefin:
    1. `?forrit=1` (flipi): service workerinn skráist en ekkert sækist;
    2. `?forrit=uppsett`: línan fer frá „Sæki leikinn í tækið“ í „Tilbúinn án nets ✓“;
    3. netið rofið og síðan hlaðin aftur: leikurinn opnast, Byrja virkar, bókin opnast, lag Söngsins spilast með öllum
       hljóðfærum og Fjölspil segir „Fjölspil þarf net“;
    4. ein skrá í afritaðri síðunni breytt og listinn skrifaður aftur: aðeins sú skrá sækist og skiptin verða á fyrsta skjánum;
    5. `spil.html` sækir ekkert.
  - Skjáskot og `report.json` fara í `qa/remake/forrit/`.
- **Handprófun eigandans:**
  - setja upp á Android, iPad og PC, bíða eftir „Tilbúinn án nets ✓“ og spila í flugstillingu;
  - eftir `npm run deploy` kemur nýja útgáfan.

## 11. Utan verksins

- Að flytja vistun Egils úr Safari yfir í forritið á heimaskjánum á iPad. Hann byrjar þar með nýja vistun.
- Samstilling vistunar milli tækja, eigið lén, tilkynningar og niðurhal í bakgrunni þegar forritið er lokað. iOS leyfir það
  ekki hvort sem er.
- Lab-síðurnar og síða gestsins sem forrit.
