# Fjölspil í smáleikjunum: QR-kóði, sími og Cloudflare

Eigandinn samþykkti hönnunina 23.–24. október 2026, í fjórum köflum. Unnið er á greininni `fjolspil` (vinnutré `C:/Risaeðla/dino-fjolspil`) ofan á `kafli2`, sem hefur báða fyrstu leikina; `main` hefur ekki „Háls og hala“. Kafla-2-vinnan er ekki snert.

## 1. Markmið

Í smáleik má velja **„Fjölspil“**. Þá birtist QR-kóði á stóra skjánum; sími, spjaldtölva eða PC-vél skannar hann (eða skrifar fjögurra stafa kóða) og spilar með. Allir leikir verða fyrir allt að fjóra. Leikurinn verður hýstur á Cloudflare, en allt á líka að ganga heima yfir sama Wi-Fi, án skýsins.

Velgengni lítur svona út:
- Fullorðinn skannar QR-kóðann og er kominn með sæti á undir 15 sekúndum, án þess að setja neitt upp.
- Egill situr við stóra skjáinn með hljóði og þrívídd eins og nú; síminn sýnir aðeins það sem er einkamál sætisins (teningurinn, spilin í hendi).
- Leikurinn heldur áfram þótt sími slökkvi á skjánum í smástund; síminn kemur aftur í sama sæti.
- Sami kóðinn keyrir heima (`serve.mjs`) og á Cloudflare; spilin fara beint á milli tækja og leikurinn gengur þótt netið út í heim detti út.

## 2. Ákvarðanir eigandans (23.–24. október 2026)

- **Hinn leikmaðurinn er í sama herbergi.** Stóri skjárinn er sameiginlegur; síminn er stýring með einkamálum sætisins, án þrívíddar og radda.
- **Háls og hali fyrst,** svo Eitt!; Litla Yatzy og Risaeðlu-Yatzy síðar (utan þessarar áætlunar).
- **Allir leikir fyrir allt að fjóra.** Sá sem tengist skrifar nafnið sitt og velur avatar úr úrvali okkar.
- **Lobbí, eins fyrir alla leiki:** QR → nafn og avatar → gestgjafinn velur hvort bara fólk spilar eða tölvuleikmanni er bætt við → „Byrjum!“.
- **Símar, spjaldtölvur og PC-vélar** geta öll tengst: með QR-kóða, eða með því að skrifa kóðann (PC).
- **Jafningjatenging (WebRTC)** á milli tækja; þjónninn (serve.mjs heima, Durable Object í skýinu) er aðeins stefnumót (signaling), með áframsendingu um hann til vara. Stóri skjárinn keyrir reglurnar og er sannleikurinn.
- **Dettur sími út:** beðið með QR-kóðann þegar röðin kemur að honum; eftir smástund „Halda áfram án Önnu“, sem lætur tölvuna spila sætið þar til hún kemur aftur. Endurtenging með sama nafni er sjálfvirk.
- **Cloudflare:** allt tilbúið til ýtingar (`cloud/` með wrangler-stillingum, Worker og Durable Object). Engir lyklar í skrám eða spjalli; eigandinn skráir sig inn og ýtir sjálfur.

## 3. Hlutar

Allt nýtt er í `remake/engine/fjolspil/`, auk einnar símasíðu og þjónsins.

| Hluti | Hvað hann gerir | Háð |
|---|---|---|
| `room.js` | Herbergið sem hrein eining: einn gestgjafi, allt að þrír gestir, ganga inn og út, áframsenda umslög, fyrning. Engin vitneskja um leikinn. Sama einingin keyrir í `serve.mjs` og í Durable Object-inu. | engu |
| `seats.js` | Sætin sem hrein eining: 2–4 sæti, hvert `{ seat, name, avatar, kind: 'host' \| 'remote' \| 'ai', guestId, present }`; lausir avatarar, nöfn sem rekast á, endurtenging gests í sitt sæti, sæti sem verður `ai` á meðan gestur vantar. | engu |
| `net.js` | Tengingin frá sjónarhóli gestgjafa og gests: stefnumót um WebSocket, WebRTC-stjörnunet, áframsending til vara, ping, endurtenging, raðnúmer. Leikurinn sér aðeins `send(seat, msg)`, `onMessage`, `onJoin`, `onLeave`, `onPresence`. | `room.js`-samskiptareglurnar |
| `qr.js` | QR-kóði sem SVG, af vendoraðri MIT-einingu (`remake/vendor/qrcode-generator/`, með leyfisskrá við hlið eins og Nunito). | vendor |
| `lobby.js` | Lobbíið á stóra skjánum: QR og kóði, sætin, „Bæta við tölvuleikmanni“, „Byrjum!“, og biðspjaldið „Bíðum eftir Önnu…“ sem leikirnir sýna. Útlit í `fjolspil.css`. | `seats.js`, `net.js`, `qr.js` |
| `remake/spil.html`, `guest.js`, `spil.css` | Símasíðan: kóðinn (ef hann vantar í slóðina), nafn og avatar, svo það sem gestgjafinn segir henni að sýna (`view`). | `net.js` |
| `tools/serve.mjs` | Fær WebSocket á `/fjolspil/ws/<kóði>` (handskrifað RFC 6455, engir pakkar) og segir gestgjafanum LAN-vistföngin fyrir QR-kóðann. | `room.js` |
| `cloud/` | Worker með Static Assets og Durable Object `Room` með sömu hegðun; sviðsetning, wrangler-stillingar, README. | `room.js` |
| Leikirnir | `engine/hals/game.js` og `engine/eitt/table.js` fá sæti í stað harðkóðaðra leikmanna (kafli 7). | `seats.js`, `lobby.js` |

Hver hluti hefur eitt hlutverk og er prófanlegur einn sér: `room.js`, `seats.js` og `net.js` án DOM; lobbíið og símasíðan með `tests/fake-dom.mjs`.

## 4. Flæðið

1. **Uppsetning leiks** fær hnappinn „Fjölspil“ (í Háls og hala við hlið „Ég og Þórseðla / 2–4 leikmenn“). Egill, á Mosa, er alltaf fyrsta sætið (sæti 0 í kóða) við stóra skjáinn.
2. **Lobbíið** sýnir stóran QR-kóða og fjögurra stafa kóðann undir honum, sætin fjögur (Egill í því fyrsta), „Bæta við tölvuleikmanni“ og „Byrjum!“ (virkur með tveimur sætum eða fleiri). QR-kóðinn ber slóðina `.../remake/spil.html?r=<kóði>`.
3. **Síminn** opnar símasíðuna. Vanti kóðann í slóðina (PC-vél, skönnun klikkaði) skrifar maður hann í fjóra stóra reiti. Svo nafn (1–12 stafir) og avatar úr þeim sem eru lausir, og „Tilbúin/n“. Síminn man nafn og avatar til næsta skiptis, svo þá nægir eitt pikk.
4. **Á stóra skjánum** birtist leikmaðurinn í sínu sæti með smelli og neista. Gestgjafinn getur bætt við einum tölvuleikmanni, persónu leiksins (Þórseðla í Háls og hala, Kambeðla í Eitt!); sá avatar er ekki í boði fyrir gesti í þeim leik. Alls að hámarki fjögur sæti.
5. **„Byrjum!“** lokar lobbíinu og leikurinn byrjar eins og nú, með sætunum. Síminn sýnir „Þú átt leik!“ með stýringunni þegar röðin er hjá honum, annars „Anna á leik“ í rólegheitum með litlu yfirliti.
6. **Dettur sími út** (skjár læsist, vafri í bakgrunn, labbað út): komi röðin að sætinu sýnir stóri skjárinn „Bíðum eftir Önnu…“ með QR-kóðanum aftur; eftir 20 sekúndur birtist „Halda áfram án Önnu“, sem gerir sætið að tölvusæti þar til Anna kemur aftur (þá fær hún sætið á sinni næstu umferð). Síminn endurtengir sjálfur þegar hann vaknar.
7. **Leikslok:** sigurspjaldið á stóra skjánum eins og nú, með nafni og avatar; síminn sýnir hver vann. „Spilum aftur?“ er gestgjafans og heldur sömu sætum.
8. **Herbergið lifir með síðunni,** ekki með einum leik: sætin haldast á milli leikja í sömu setu stóra skjásins, svo hópur sem lauk Háls og hala getur farið í Eitt! án þess að skanna aftur. Lobbíið opnast á sætunum sem eru, og nýir gestir mega enn koma.

## 5. Sætin (`seats.js`)

- `createSeats({ max = 4 })` með Egil í sæti 0 (`kind: 'host'`, avatar `egill`, alltaf til staðar).
- `join({ guestId, name, avatar })` gefur gest sæti: sama `guestId` fær sitt gamla sæti aftur (með nýju nafni eða avatar ef hann breytti); fullt herbergi eða upptekinn avatar er hafnað með ástæðu (`'full'`, `'avatar-taken'`), og nafn sem er til fær tölu („Anna 2“).
- `addAi(character)` setur tölvuleikmann í laust sæti; aðeins einn.
- `absent(seat)` / `back(seat)` halda `present`; `cover(seat)` gerir fjarverandi gestasæti að `ai` þar til `back` kallar.
- `avatars()` eru vinirnir sex: `kambedla`, `sloedla`, `gramedla`, `thorsedla`, `flugedla`, `uggedla`, með mynd (`assets/eitt/*.webp` og `assets/book/images/kambedla-render.webp`; Uggeðla fær mynd úr sínu líkani með `tools/bake/book-render.html`, eins og Mosi og Kambeðla fengu) og lit: litir Háls og hala fyrir þær fjórar sem eru þar, Flugeðla himinblá `#8ec5d6` og Uggeðla kóralrauð `#d47a8a` (eigandinn sér litina á útlitsmyndunum og má breyta). Persóna leiksins (tölvuleikmaðurinn) er tekin frá.
- `snapshot()` / `restore()` fyrir vistun leiks undir vöxtum.

## 6. Netið

### 6.1 Stefnumót (signaling)

Ein WebSocket-slóð: `/fjolspil/ws/<kóði>`.

- **Kóðinn** er fjórir stafir úr `ABCDEFGHJKLMNPRSTUVWXYZ` (engin I, O, Q, engir tölustafir, engir íslenskir stafir, svo hann er skrifanlegur á hvaða lyklaborði sem er), sýndur í hástöfum, lesinn án tillits til há- og lágstafa.
- **Gestgjafinn** velur kóðann af handahófi og tengist með `?role=host&key=<leynilykill>` (128 bita, af handahófi). Sé kóðinn upptekinn með öðrum lykli svarar þjónninn `taken` og gestgjafinn velur nýjan. Kóðinn og lykillinn geymast í `sessionStorage`, svo endurhlaðin síða fær sama herbergi; nýr flipi fær nýtt.
- **Gesturinn** tengist með `?role=guest&id=<gestalykill>` (128 bita, verður til á tækinu og geymist í `localStorage` undir `mosi-fjolspil-guest`, með nafni og avatar).
- **Þjónninn svarar** gestgjafanum `welcome { code, join }` þar sem `join` eru slóðir símasíðunnar: heima LAN-vistföngin (`http://192.168.x.y:<port>/remake/spil.html`), í skýinu tómt. Stóri skjárinn notar sína eigin slóð (`location.origin`) sé hún ekki loopback, annars þá fyrstu frá þjóninum.
- **Herbergið** (`room.js`): einn gestgjafi, allt að þrír gestir; fjórða gesti er hafnað með `full`. Kóði sem ekkert herbergi á (aldrei opnað, eða fyrnt) fær `no-room`, og símasíðan segir að kóðinn sé ekki í gangi; herbergi sem er til en gestgjafinn ekki tengdur í svipinn (endurhleðsla) fær `no-host`, og síðan bíður og reynir aftur á 3 sekúndna fresti. Þjónninn áframsendir umslög `{ to, from, type, body }` orðrétt og segir gestgjafanum `joined { id }` og `left { id }`. Herbergi fyrnist 2 klukkustundum eftir síðasta lífsmark (skilaboð eða tengingu).
- **Þjónninn geymir ekkert** um leikinn, nöfn eða sæti; það er allt hjá gestgjafanum.

### 6.2 WebRTC

- Gestgjafinn býr til `RTCPeerConnection` og áreiðanlegan, raðaðan `RTCDataChannel` fyrir hvern gest; tilboð, svar og ICE fara um stefnumótið sem umslög `offer`, `answer`, `ice`.
- Heima: enginn STUN (sama net; host- og mDNS-candidates). Í skýinu: `stun.cloudflare.com:3478` (ókeypis). TURN er utan umfangs.
- **Varaleið:** sé DataChannel ekki opinn 4 sekúndum eftir tilboð, eða slitni hann, fara sömu umslög (`relay`) um stefnumóta-WebSocketinn; opnist DataChannel síðar er skipt yfir á hann. Leikurinn sér engan mun. `?relay=1` í slóð stóra skjásins þvingar varaleiðina (prófun).
- `net.js` ber hvort tveggja: `createHostNet({ code, key, url })` og `createGuestNet({ code, guestId, url })`, hvort með `send`, `onMessage`, `onPresence`, `close`, og gestgjafinn að auki `onJoin`, `onLeave`.

### 6.3 Skilaboðin

Lítil JSON, umferðaleikur. Hvert skilaboð `{ v: 1, type, seq?, body }`.

Gestur → gestgjafi:
- `hello { name, avatar }` — biður um sæti (líka við endurtengingu, með sama gestalykli).
- `act { ... }` — aðgerð sem leikurinn skilgreinir: `{ type: 'roll' }`; `{ type: 'play', cardId, colour? }`, `{ type: 'draw' }`, `{ type: 'pass' }`, `{ type: 'eitt' }`, `{ type: 'catch' }`.
- `pong`.

Gestgjafi → gestur:
- `seat { seat, ok: true }` eða `seat { ok: false, reason }`.
- `view { seq, ... }` — heil mynd af því sem ÞETTA tæki á að sýna, aldrei leyndarmál annarra. `seq` hækkar fyrir hvert sæti; gestur sýnir aldrei lægra númer en það sem hann hefur. Engin saga: endurtenging er nýjasta `view`.
- `ping`.

Myndirnar (`view.screen`):
- `lobby { seats, you }`
- `hals { you, turn, canRoll, roll: { value, by } | null, players: [{ seat, name, avatar, square }], winner }`
- `eitt { you, turn, direction, colour, top, hand, playable, canDraw, canPass, needsColour, eittNeeded, canCatch, counts: [{ seat, name, avatar, cards }], winner }`
- `over { winner: { name, avatar } }`, `closed` (gestgjafinn lokaði leiknum; síminn bíður eftir næsta lobbíi), `wait { reason: 'host-gone' }` (gestgjafinn datt út).

Ólögleg eða ótímabær aðgerð frá gesti (ekki hans röð, spil sem má ekki spila) er hunsuð og nýtt `view` sent, svo síminn réttir sig af.

### 6.4 Dettur út og kemur aftur

- Gestgjafinn sendir `ping` á 5 sekúndna fresti á hvern gest, um hvora leiðina sem er; þrjú `pong` sem vantar gera sætið fjarverandi (`onPresence(seat, false)`).
- Símasíðan endurtengir sjálf: við `visibilitychange`, `online` og þegar WebSocket eða DataChannel lokast, með vaxandi bið (1, 2, 4 … 15 sekúndur). Hún sendir `hello` aftur og fær sitt sæti og nýjasta `view`.
- **Gestgjafinn endurhleður:** sami kóði og lykill úr `sessionStorage`, herbergið er enn hjá þjóninum, gestir fá ný tilboð sjálfkrafa. Leikurinn kemur úr vistuninni: Háls og hali vistar leik undir vöxtum nú þegar (með sætunum frá og með þessu), Eitt! fær það (kafli 7).
- **Gestgjafinn lokar síðunni:** gestir fá `wait { reason: 'host-gone' }` og síminn sýnir „Bíðum eftir stóra skjánum…“ og reynir áfram; eftir fyrningu herbergisins (2 klst.) sýnir hann „Leiknum er lokið“ með reit fyrir nýjan kóða.

### 6.5 Takmarkanir, meðvitað

- Engin innskráning, engir reikningar, engin nöfn á þjóni nema tengingarnar sjálfar meðan herbergi lifir. Ekkert geymt í skýinu eftir fyrningu.
- Enginn TURN: tæki á öðru neti en stóri skjárinn (farnet) ná WebRTC ekki alltaf; þá gengur varaleiðin um þjóninn, sem er nóg fyrir umferðaleik.
- Ein seta stóra skjásins á hvert herbergi; opni eigandinn leikinn í tveimur flipum fær hver flipi sitt herbergi.

## 7. Leikirnir

### 7.1 Sameiginlegt: sæti í stað harðkóðaðra leikmanna

Hvert borð fær sætin frá `seats.js` og spyr sæti sem á leik: gestgjafasæti bíður eftir snertingu á stóra skjánum (eins og nú), fjarsæti eftir `act` frá gesti (og sýnir á stóra skjánum hver á leik, með andliti og nafni), tölvusæti reiknar eins og nú. Sé fjarsæti fjarverandi þegar röðin kemur að því sýnir borðið biðspjald lobbísins („Bíðum eftir Önnu…“ með QR); eftir 20 sekúndur „Halda áfram án Önnu“ (`seats.cover`). Komi gesturinn aftur fær hann sætið á sinni næstu umferð. Raddir, hreyfingar og hljóð stóra skjásins eru óbreytt; Mosi hvetur („Ýttu á teninginn!“, „Þín umferð!“) aðeins Egil, ekki fjarsæti.

Borðið sendir hverju fjarsæti `view` eftir hverja breytingu sem það varðar (umferð, kast, spil á borð, dregið, litur, „Eitt!“, sigur) og aftur þegar gestur segir `hello` (endurtenging). Ekkert er sent án tilefnis; `seq` sér um að eldri mynd komist aldrei fram fyrir nýrri.

### 7.2 Háls og hali (áfangi 1)

- **Reglurnar** (`rules.js`) breytast lítið: `createGame` tekur `computers: [bool, ...]` (hvaða sæti eru tölvan) í stað `vsComputer`, sem helst sem stytting; `validateGame` óbreytt.
- **Uppsetningin** fær „Fjölspil“; valið „Ég og Þórseðla / 2–4 leikmenn“ helst fyrir leik á einu tæki.
- **Peðin:** fasti listinn `ROSTERS` víkur fyrir avatörum sætanna. `pieces.js` fær Flugeðlu (`pteranodon`) og Uggeðlu (`spinosaurus`) sem peð, sem hoppa eins og hin (flug er ekki með). `NAMES`/`PICTURES` víkja fyrir `seats`.
- **Fjartenningur:** á umferð fjarsætis sýnir teningurinn á stóra skjánum andlit leikmannsins og bíður (pikk gerir ekkert); síminn sýnir stóran tening, „Kasta!“. Gildið verður til á stóra skjánum (`random`), teningurinn veltur á báðum (`view.roll`), og peðið fer eins og nú. Mosi telur hopp í leik tveggja eins og nú, hver sem hinn er.
- **Vistun:** `hals.game = { state, setup: { players, seats: snapshot } }`; „Halda áfram“ opnar leikinn með sætunum, fjarverandi gestir fá biðspjaldið þegar röðin kemur að þeim. Eldri vistun án `seats` gengur eins og áður.
- **Sigur:** „Anna vann!“ með avatar; steingervingar sem fundust fara í safn Egils eins og nú (safnið er stóra skjásins).

### 7.3 Eitt! fyrir 2–4 (áfangi 2)

`rules.js` fær leikmannalista í stað `child`/`kambedla`:
- Leikurinn er `{ deck, pile, hands: [[…], …], colour, turn, direction: 1 | -1, drew, unsaid, winner, players }` með sætisnúmerum; `newGame({ players = 2, random })` gefur 7 spil hverjum, sæti 0 byrjar.
- `next(game, steps = 1)` er sætið `steps` skref áfram í `direction`.
- **Með tveimur** er allt eins og nú (prófin sem til eru halda með sætisnúmerum í stað nafna): snúningur, sleppa, +2 og +4 gefa spilaranum leik aftur.
- **Með þremur eða fjórum:** snúningur snýr `direction` og röðin fer til þess sem var á undan; sleppa sleppir næsta; +2 og +4 láta næsta draga og hann missir umferð; litaskipti velur lit.
- **„Eitt!“:** sá sem spilar niður í eitt spil á `unsaid` þar til hann kallar eða næsti gerir; hver hinna sem er má grípa hann (`catchEitt(game, catcher)`), og hann dregur tvö.
- `kambedla.js`: `chooseMove(game, seat, skill, random)`; „hinn“ í árásarmatinu verður næsti leikmaður; `willCatch` gildir fyrir hvert tölvusæti. `advice.js`: `advise(game, seat = 0)`; Mosi ráðleggur Agli einum.
- **Borðið:** hendur hinna sjást á hvolfi með nafni og avatar, ein röð fyrir hvert sæti; Kambeðlu-glugginn í þrívídd aðeins þegar hún spilar. „Spyrja Mosa“ er á stóra skjánum (Egils). Eitt! fær vistun leiks undir vöxtum eins og Háls og hali: `save.js` fær `game` og `seats` í `eitt` (`setEitt({ game, seats })`, `game: null` gleymir honum; eldri vistun án þeirra les eins og áður), og „Halda áfram“ við opnun.
- **Síminn:** sín hendi í boga (sama útlit spilanna, `eitt.css` endurnýtt), það sem má spila lyftist, bunkinn (pikk = draga), litavalið þegar við á, „Eitt!“-hnappurinn þegar hann á við, „Áfram“ eftir dregið spil, „Grípa!“ þegar annar gleymdi, efsta spilið og liturinn, og fjöldi spila hvers hins.

### 7.4 Seinni leikir (utan þessarar áætlunar)

Risaeðlu-Yatzy og Litla Yatzy fá sömu sæti; síminn sýnir teningana, „halda“ og reitina. Litla Yatzy er sér síða í iframe (`yatzy-junior.html`) og þarf lobbíið og `net.js` inn í sig. Ekkert í þessari hönnun stendur í vegi fyrir því.

## 8. Útlit

- **Lobbíið og biðspjaldið** eru í stíl bókarinnar og leikjanna (STYLE.md): Nunito, pappír og límband, hnappar minnst 88 px, litir úr STYLE.md, hreyfingar aðeins með transform og opacity og sem dofnun undir minni hreyfingu. QR-kóðinn er dökkur á ljósum pappír, minnst 40% af styttri hlið skjásins, með kóðann stóran undir.
- **Símasíðan** fyllir skjáinn upprétt og liggjandi, á síma, spjaldtölvu og PC (snerting, mús, lyklaborð: Enter staðfestir, örvar og Tab komast um). Efst sætið (avatar, nafn), í miðju stýringin, neðst línan um hver á leik. Hún hefur smellhljóð bókarinnar (`book/fx.js`) og engin önnur hljóð. Demó-slóðir fyrir útlitsmyndir án tengingar: `spil.html?demo=join|lobby|hals|eitt|over`.
- **Á stóra skjánum** sýna portrettin (Háls) og handraðirnar (Eitt!) avatar og nafn sætisins; fjarverandi sæti er dauft með litlu „…“.

## 9. Hýsing

### 9.1 Heima

`node remake/tools/serve.mjs --port <n> --lan` eins og nú. Að auki:
- WebSocket á `/fjolspil/ws/<kóði>`: handskrifað RFC 6455 (handaband, textarammar með afgrímu, ping/pong, close, rammar stærri en 64 kB hafnað), engir pakkar; `tools/fjolspil-server.mjs` ber það og `room.js`, og `serve.mjs` tengir það við `upgrade`.
- `welcome.join` ber LAN-vistföngin sem `--lan` prentar nú þegar.
- Án `--lan` nær sími ekki í þjóninn; QR-kóðinn ber þá loopback-slóð og lobbíið segir það berum orðum („Keyrðu þjóninn með --lan“).

### 9.2 Cloudflare (`cloud/`)

- **Einn Worker** með Static Assets og Durable Object: `cloud/src/worker.mjs` afgreiðir `/` (áfram á `/remake/`) og `/fjolspil/ws/<kóði>` (til `Room` eftir `idFromName(kóði)`) og lætur `env.ASSETS` um allt annað.
- **`Room`** (`cloud/src/room-object.mjs`) er SQLite-bakað Durable Object (ókeypis áskriftin leyfir þau) sem keyrir `remake/engine/fjolspil/room.js` yfir WebSocket Hibernation API: tengingar merktar með `serializeAttachment({ role, id })`, lykill gestgjafans í `ctx.storage`, og alarm sem fyrnir herbergið 2 klst. eftir síðasta lífsmark.
- **Sviðsetning:** `cloud/stage.mjs` afritar `remake/` (án `tests/`, `tools/`, `node_modules/`, `prompts/`, `assets/characters/source/`) og `dist/vendor/` í `cloud/site/` (gitignored), svo slóðirnar eru þær sömu og hjá `serve.mjs`. 852 skrár og 154 MB í `remake/` núna, engin yfir 25 MB; Tripo-frumskrárnar (um 80 MB) fara ekki með.
- **Skrár:** `cloud/wrangler.toml` (nafn, `main`, `compatibility_date`, `[assets]` með `directory = "./site"` og `binding = "ASSETS"`, `[[durable_objects.bindings]]` `ROOMS` → `Room`, `[[migrations]]` með `new_sqlite_classes = ["Room"]`), `cloud/package.json` með `wrangler` sem einu devDependency (einangrað þar; rót repósins helst pakkalaus), `cloud/.gitignore` (`site/`, `node_modules/`, `.wrangler/`), `cloud/README.md` með skrefunum: `npm install`, `wrangler login`, `npm run stage`, `wrangler dev --ip 0.0.0.0` (skýjaleiðin prófuð heima, líka frá síma), `wrangler deploy`.
- **Engir lyklar** í skrám; innskráning og ýting eru eigandans.
- `https` í skýinu þýðir `wss://` og WebRTC yfir örugga síðu; símasíðan velur `ws`/`wss` eftir `location.protocol`.

## 10. Villur og jaðartilvik

| Tilvik | Hvað gerist |
|---|---|
| Rangur eða fyrndur kóði | Símasíðan segir „Þessi kóði er ekki í gangi“ og býður að skrifa aftur. |
| Fullt herbergi | „Borðið er fullt (4)“; gesturinn má horfa á kóðann og reyna aftur þegar sæti losnar. |
| Avatar tekinn á meðan valið var | Síminn fær `seat { ok: false, reason: 'avatar-taken' }` og valið opnast aftur með þann avatar daufan. |
| Sami sími í tveimur flipum | Sami gestalykill: seinni tengingin tekur sætið, sú fyrri fær `wait`. |
| Aðgerð ekki í röð, spil sem má ekki spila | Hunsað; nýtt `view`. |
| Gestur dettur út | Kafli 6.4 og 7.1. |
| Gestgjafi endurhleður / lokar | Kafli 6.4. |
| WebRTC næst ekki (gestanet með einangrun, mDNS virkar ekki) | Varaleiðin um þjóninn eftir 4 sekúndur, sjálfkrafa. |
| Þjónninn án `--lan` | Lobbíið segir það; ekkert annað brotnar. |
| Gestur hættir í miðjum leik (lokar síðunni) | Eins og dettur út; „Halda áfram án…“ lætur tölvuna klára sætið. |
| Leikur lokaður með X á stóra skjánum | Gestir fá `closed`; herbergið og sætin lifa; næsta lobbí birtist hjá þeim sjálfkrafa. |

## 11. Prófun

- **Node-próf** (`npm run test:remake`, núverandi svíta helst græn):
  - `fjolspil-room.test.mjs`: ganga inn og út, höfnun (fullt, upptekinn kóði, enginn gestgjafi), áframsending, fyrning, `snapshot`/`restore`.
  - `fjolspil-seats.test.mjs`: sæti, avatarar, nöfn sem rekast á, endurtenging, `cover`/`back`, vistun.
  - `fjolspil-net.test.mjs`: með gervi-WebSocket og gervi-`RTCPeerConnection`: handaband, varaleið eftir 4 s, skipt yfir á DataChannel sem opnast seint, endurtenging með sama gestalykli, `seq` sem hafnar eldri `view`, ping/pong og fjarvera.
  - `serve.test.mjs`: WebSocket-handabandið og rammarnir með innbyggðum WebSocket-biðlara Node, tvö herbergi í einu.
  - `eitt.test.mjs`: 2-leikmanna prófin óbreytt að efni; ný fyrir 3 og 4: snúningur, sleppa, +2 og +4 lenda á næsta, hver sem er grípur, bunki sem tæmist.
  - `hals.test.mjs`: `computers`, vistun með sætum, eldri vistun.
  - `fjolspil-lobby.test.mjs` og `fjolspil-guest.test.mjs` með `fake-dom.mjs`: lobbíið sýnir sæti og QR, biðspjaldið, símasíðan skrifar nafn, velur avatar, sendir `act`, sýnir hverja `view`.
  - `cloud/test/room-object.test.mjs`: Durable Object-ið með gervi-`ctx` (sami `room.js`, hibernation-endurheimt, alarm).
- **Myndir:** `capture.mjs` tekur lobbíið og símasíðuna (demó-slóðirnar) í tveimur stærðum, sími upprétt og spjaldtölva, og eigandinn fær þær milli búta.
- **Handprófun eigandans,** með gátlista í áætluninni: PC + sími yfir Wi-Fi; QR á iPhone og Android; kóði skrifaður á PC; skjár læsist og kemur aftur; gestgjafi endurhleður; `?relay=1`; `wrangler dev --ip 0.0.0.0` frá síma; lagið spilast í Safari úr skýinu (byte ranges).

## 12. Röð verka

Hver bútur: Opus-smiður, rýnir gegn þessari forskrift, lagfæringar þar til ekkert efnislegt er eftir, myndir til eigandans.

1. `room.js` og WebSocket í `serve.mjs` (próf).
2. QR, `seats.js`, lobbíið og símasíðan (nafn og avatar, demó-slóðir) — útlitsmyndir til eigandans.
3. `net.js`: stefnumót, WebRTC, varaleið, ping og endurtenging — próf og fyrsta prófun yfir Wi-Fi.
4. Háls og hali í fjölspili: sæti, „Fjölspil“, fjartenningur, Flugeðla og Uggeðla sem peð, vistun með sætum, biðspjaldið og „Halda áfram án…“.
5. `cloud/`: Worker, Durable Object, sviðsetning, README; `wrangler dev` sannreynt frá síma.
6. Eitt! fyrir 2–4: reglur, Kambeðla og ráð Mosa, borðið með sætum, hendin í símanum, vistun.

Áfangi 1 er 1–5, áfangi 2 er 6.

## 13. Utan umfangs

- Leikmaður annars staðar (annað hús): síminn sýnir ekki borðið, persónurnar eða hljóðið.
- TURN-þjónn.
- Raddir eða tónlist í símanum.
- Fleiri en einn tölvuleikmaður; tölvuleikmaður með annan avatar en persónu leiksins.
- Risaeðlu-Yatzy og Litla Yatzy í fjölspili (kafli 7.4).
- Þriggja manna Eitt! með Kambeðlu þegar fjórir menn spila (fjögur sæti alls, hver sem í þeim er).
- Flug Flugeðlu sem peð.
- Reikningar, innskráning, stigatafla á milli tækja.
