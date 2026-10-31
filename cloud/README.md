# Mosi í skýinu

Leikurinn á Cloudflare (hönnunarskjalið, kafli 9.2): einn Worker sem ber síðuna sem Static Assets, og herbergi Fjölspils sem
Durable Objects. `src/worker.mjs` sendir `/` áfram á `/remake/` og `/fjolspil/ws/<kóði>` til herbergis kóðans, og
`src/room-object.mjs` keyrir sama `room.js` og þjónninn heima (`remake/engine/fjolspil/room.js`). Slóðirnar eru þær sömu og
hjá `serve.mjs`: leikurinn er á `/remake/` og símasíðan á `/remake/spil.html`.

## Skrefin

Í PowerShell, í möppu repósins:

```powershell
cd cloud
npm install          # sækir wrangler hingað, í cloud/node_modules/ (óþarft ef wrangler er þegar uppsett á tölvunni)
npx wrangler login   # opnar vafra: skráðu þig inn á Cloudflare og leyfðu wrangler
npm run dev          # afritar leikinn í cloud/site/ og keyrir Workerinn og herbergin á tölvunni, á porti 8787
npm run deploy       # afritar leikinn í cloud/site/ og setur hann í loftið
```

- `npm install` og `npx wrangler login` þarf bara einu sinni. `npm run dev` þarf ekki innskráningu, `npm run deploy` þarf hana.
- `npm run dev` og `npm run deploy` keyra `npm run stage` fyrst, svo það sem fer út er alltaf leikurinn eins og hann er núna.
  `npm run stage` afritar `remake/` (án `tests/`, `tools/`, `prompts/` og Tripo-frumskránna í `assets/characters/source/`),
  `dist/vendor/` (three.js) og `dist/assets/audio/` (raddlínur gamla leiksins, sem leikurinn les) í `cloud/site/`. Skrár og
  möppur sem byrja á punkti (eins og `.env`) og `*.pem`- og `*.key`-skrár fara aldrei með. Það segir hve margar skrár og hve
  mörg bæti fóru, og hafnar skrá yfir 25 MiB (Cloudflare tekur ekki stærri skrár) og nefnir hana.
- Með `npm run dev` er skýjaleiðin prófuð heima, líka frá síma: opnaðu `http://<ip-tala-tölvunnar>:8787/remake/` á stóra
  skjánum og skannaðu QR-kóðann með símanum (á sama Wi-Fi). IP-töluna sýnir `ipconfig` (IPv4 Address). QR-kóðinn ber slóðina
  sem síðan var opnuð á, svo opnaðu hana á IP-tölunni en ekki á `127.0.0.1`. Windows getur spurt hvort workerd
  (`workerd.exe`, sem keyrir Workerinn undir `npm run dev`) megi nota netið: leyfðu það á einkaneti.
- `npm run deploy` setur leikinn á `https://mosi.<undirlénið-þitt>.workers.dev/` (wrangler prentar slóðina). Þar er síðan á
  `https`, svo símasíðan tengist herberginu með `wss://` og WebRTC virkar.
- `npm test` hér (eða `npm run test:cloud` í rót repósins) keyrir prófin á herberginu.

## Skyndiminni vafrans

Hljóð, myndir, þrívíddarlíkön og letrið geymast í vafranum í sólarhring (`src/cache.mjs`), svo spjaldtölvan þarf ekki að
spyrja skýið um hvert þeirra næst þegar leikurinn opnast. Kóðinn, síðurnar og listarnir (eins og `dj.json`) eru spurðir í
hvert sinn, svo ný útgáfa nær þeim strax. Gallinn: ef hljóð eða mynd er skipt út undir sama nafni getur gamla útgáfan
heyrst eða sést í allt að sólarhring á tæki sem hafði hana. Þá dugar að hreinsa gögn síðunnar í vafranum.

## Forritið og án nets

Mosa má setja upp sem forrit: „Setja upp“ í Chrome eða Edge á Android og PC, „Bæta á heimaskjá“ í Safari á iPad. Í uppsetta
forritinu sækir leikurinn sig allan í tækið, um 195 MB, og línan undir Byrja segir hve mikið er komið („Sæki leikinn í tækið
… 40 %“, svo „Tilbúinn án nets ✓“). Eftir það spilast allur leikurinn án nets nema Fjölspil, sem segir „Fjölspil þarf net“.
Í venjulegum flipa er ekkert sótt.

`stage.mjs` skrifar listann `site/remake/offline.json` (`src/offline-list.mjs`): hverja skrá með stærð og fingrafari, og
útgáfu sem breytist ef einhver skrá breytist. Ný útgáfa berst því sjálf: næst þegar forritið opnast á neti sér það nýjan
lista, sækir aðeins skrárnar sem breyttust („Sæki nýja útgáfu … 40 %“) og skiptir yfir á fyrsta skjánum, aldrei í miðjum
leik. Eitt fullt niðurhal er um 1.800 beiðnir, þar af um 800 hljóð í gegnum Workerinn, langt undir 100.000 á dag.

Neyðarhemill, ef forritið festist í slæmri útgáfu:

```
node stage.mjs --burt
wrangler deploy
```

Þá segir listinn aðeins `{"burt":true}`. Hvert tæki eyðir þá geymslunni, afskráir service workerinn og spilar af netinu eins
og vefsíða næst þegar það opnast á neti. Notaðu `wrangler deploy` hér, ekki `npm run deploy`, sem setur saman aftur án
hemilsins, og ekki `npx`, sem gæti reynt að sækja wrangler. Til að kveikja aftur er sent upp án `--burt` (`npm run deploy`).
Lagfærður `remake/sw.js` dugar líka: vafrinn ber hann saman við skýið við hverja ræsingu á neti, svo hann nær í hvert tæki
næst þegar það opnast.

iPad geymir forritið á heimaskjánum sér, aðskilið frá Safari, með sína eigin geymslu og sínar eigin stjörnur. Niðurhal í
Safari-flipa nýtist því ekki forritinu, og stjörnur úr Safari fylgja ekki yfir í það.

## Villuskrá

`[observability]` í `wrangler.toml` kveikir á Workers Logs: hver beiðni, svar hennar og hver villa sjást í mælaborði
Cloudflare undir Workers & Pages → mosi → Logs. Ókeypis áskriftin geymir 200.000 færslur á dag í 3 daga.

## Hvað kostar það

Ekkert: allt er innan ókeypis áskriftarinnar (Workers Free). Workers, Static Assets (beiðnir um skrár síðunnar eru ókeypis) og
SQLite-bökuð Durable Objects (sem `Room` er, sjá `new_sqlite_classes` í `wrangler.toml`) eru öll í henni. Ókeypis áskriftin
hefur dagleg hámörk á beiðnum, keyrslutíma og skrifum. Fjölskylduleikur er vel innan þeirra, og fari eitthvað yfir þau stöðvast
það til næsta dags en kostar ekki neitt.

## Lyklar

Enginn lykill er nokkurn tíma í repóinu. `npx wrangler login` geymir innskráninguna hjá wrangler í notandamöppunni þinni, ekki
hér, og ekkert í `cloud/` þarf lykil eða leyndarmál. Settu aldrei API-lykil eða token í skrá hér.

`cloud/site/`, `cloud/node_modules/` og `cloud/.wrangler/` (staðbundin gögn `wrangler dev`) eru í `.gitignore` og fara aldrei í
git.
