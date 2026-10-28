# Mosi í skýinu

Leikurinn á Cloudflare (hönnunarskjalið, kafli 9.2): einn Worker sem ber síðuna sem Static Assets, og herbergi Fjölspils sem
Durable Objects. `src/worker.mjs` sendir `/` áfram á `/remake/` og `/fjolspil/ws/<kóði>` til herbergis kóðans, og
`src/room-object.mjs` keyrir sama `room.js` og þjónninn heima (`remake/engine/fjolspil/room.js`). Slóðirnar eru þær sömu og
hjá `serve.mjs`: leikurinn er á `/remake/` og símasíðan á `/remake/spil.html`.

## Skrefin

Í PowerShell, í möppu repósins:

```powershell
cd cloud
npm install          # sækir wrangler hingað, í cloud/node_modules/ (rót repósins helst pakkalaus)
npx wrangler login   # opnar vafra: skráðu þig inn á Cloudflare og leyfðu wrangler
npm run stage        # afritar leikinn í cloud/site/
npm run dev          # keyrir Workerinn og herbergin á tölvunni, á porti 8787
npm run deploy       # setur leikinn í loftið
```

- `npm install` og `npx wrangler login` þarf bara einu sinni. `npm run dev` þarf ekki innskráningu, `npm run deploy` þarf hana.
- `npm run stage` afritar `remake/` (án `tests/`, `tools/`, `prompts/` og Tripo-frumskránna í `assets/characters/source/`),
  `dist/vendor/` (three.js) og `dist/assets/audio/` (raddlínur gamla leiksins, sem leikurinn les) í `cloud/site/`. Skrár og
  möppur sem byrja á punkti (eins og `.env`) og `*.pem`- og `*.key`-skrár fara aldrei með. Keyrðu það aftur eftir hverja
  breytingu á leiknum, áður en þú keyrir `dev` eða `deploy`. Það segir hve margar skrár og hve mörg bæti fóru, og hafnar
  skrá yfir 25 MiB (Cloudflare tekur ekki stærri skrár) og nefnir hana.
- Með `npm run dev` er skýjaleiðin prófuð heima, líka frá síma: opnaðu `http://<ip-tala-tölvunnar>:8787/remake/` á stóra
  skjánum og skannaðu QR-kóðann með símanum (á sama Wi-Fi). IP-töluna sýnir `ipconfig` (IPv4 Address). QR-kóðinn ber slóðina
  sem síðan var opnuð á, svo opnaðu hana á IP-tölunni en ekki á `127.0.0.1`. Windows getur spurt hvort workerd
  (`workerd.exe`, sem keyrir Workerinn undir `npm run dev`) megi nota netið: leyfðu það á einkaneti.
- `npm run deploy` setur leikinn á `https://mosi.<undirlénið-þitt>.workers.dev/` (wrangler prentar slóðina). Þar er síðan á
  `https`, svo símasíðan tengist herberginu með `wss://` og WebRTC virkar.
- `npm test` hér (eða `npm run test:cloud` í rót repósins) keyrir prófin á herberginu.

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
