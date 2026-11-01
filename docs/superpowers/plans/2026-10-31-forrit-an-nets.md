# Mosi as an app, also offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mosi (`/remake/`) installs as an app on Android, PC and iOS, downloads the whole staged game into the installed app,
and plays offline, with a progress line under Byrja and new versions switching only on the start screen.

**Architecture:** `cloud/stage.mjs` writes `site/remake/offline.json`: every staged file with its size and a SHA-256
fingerprint, plus a version. A classic service worker (`remake/sw.js`) answers listed files from Cache Storage once a complete
version is active. A page module (`remake/engine/offline/`) fills the store, only in the installed app, and drives the line and
the switch. Fjölspil's QR cards say „Fjölspil þarf net“ while the room has never been reached.

**Tech Stack:** Plain ES modules in the page (no bundler); a classic service worker; Cache Storage; Web Crypto SHA-256;
`node --test`; headless Edge over raw CDP; `wrangler dev` for the walk; ffmpeg for the icons.

**Spec:** `docs/superpowers/specs/2026-10-31-forrit-an-nets-design.md`

## Global Constraints

- Worktree `C:\Risaeðla\dino-forrit`, branch `forrit`. Never merge or push; the owner asks for those himself.
- No new dependencies and no downloads. ffmpeg (WinGet) and wrangler 4.143 (global) are already on the machine.
- Keep each file's own line endings (the repo is `* -text`):
  - CRLF: `remake/main.js`, `remake/engine/fjolspil/{lobby,fjolspil,net,protocol}.js`, `remake/fjolspil.css`,
    `remake/tests/fjolspil-*.test.mjs`, everything in `cloud/`;
  - LF: `remake/index.html`, `remake/style.css`, `remake/sloedla.css`, `remake/engine/sloedla/band-lobby.js`,
    `remake/tools/serve.mjs`.
  - New files under `cloud/` are CRLF; new files under `remake/` and `docs/` are LF.
  - Check `git diff --stat` before each commit. Edit or Write can turn CRLF into LF.
- Never touch `design/` or `dist/`. Importing from `dist/vendor` is fine.
- No Claude-drawn art. The icons are crops of `remake/assets/book/images/mosi-render.webp` on the solid colour `#cfdde3`, nothing
  else.
- Copy fixed by the spec, exact (U+00A0 is a no-break space between the number and %):
  - `Sæki leikinn í tækið … ${p} %`
  - `Sæki nýja útgáfu … ${p} %`
  - `Tilbúinn án nets ✓`
  - `Vantar net til að klára (${p} %)`
  - `Ekki nóg pláss í tækinu`
  - `Fjölspil þarf net`
- Cache Storage names and keys:
  - caches `mosi-skrar` and `mosi-listar`;
  - file key `/remake/__skrar__/<hash>`;
  - list keys `/remake/__listar__/<version>`, `/remake/__listar__/virk`, `/remake/__listar__/tilbuin` and
    `/remake/__listar__/sidast`. The last three hold JSON `{ "version": "<16 hex>" }`.
- Fingerprints and versions are the first 16 hex characters of SHA-256.
- The service worker is registered only on `https:`, or on `localhost`/`127.0.0.1` with `?forrit=1` or `?forrit=uppsett`.
  Filling happens only in the installed app (`display-mode` fullscreen or standalone, `navigator.standalone`), or with
  `?forrit=uppsett` on localhost.
- Tests:
  - from the repo root, `npm run test:remake` (node with `remake/tests/setup.mjs`) and `npm run test:cloud`;
  - they stay lean and test what the child and the owner get.
- One headless capture at a time: the walk takes the rec-lock dir
  `C:/Users/fannare/AppData/Roaming/Claude/side-session-notes/local_5af6e842-d0c9-4f2a-92fb-56f234adc53d/sloedla-keppni/rec-lock`
  (`fs.mkdirSync`; `EEXIST` means wait) and removes it at the end.
- After any `wrangler dev`, stop the whole process tree (`taskkill /PID <pid> /T /F`) and confirm no `workerd` is left. A
  leftover locks `cloud/site` and breaks the owner's `npm run deploy`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A deploy lands while a device is downloading. Files of the newer deploy arrive under the older list. Expected: a file whose
   size or fingerprint does not match is not kept, the version is not marked complete, and the next start fetches the newer list.
   Pinned in Task 5 ("a file whose fingerprint is wrong…").
2. The iPad closes the app mid-download. Expected: what arrived is kept, and the next start fetches only what is missing. Pinned
   in Task 5 (same test, second run).
3. Two windows of the app on a PC, or the app and a tab, while a version completes. Expected: no switch under the other window;
   the switch waits for the next start. Pinned in Task 3 ("a version takes over only when it is the only window").
4. Safari asks for byte ranges of a sound offline. Expected: 206 slices identical to the cloud's. Pinned in Task 3 ("a sound is cut
   from the store exactly as the cloud cuts it").
5. The browser's day-long HTTP cache holds an old copy of a changed image or sound. Expected: the download never takes it,
   because every download uses `cache: 'reload'`. Pinned in Task 5 (the first-download test asserts the cache mode).

---

### Task 1: The app's face — icons, manifest, page head

**Files:**
- Create: `remake/tools/make-icons.mjs`
- Create: `remake/assets/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (made by the script)
- Create: `remake/manifest.webmanifest`
- Modify: `remake/index.html` (head: the `<link rel="icon" href="data:,">` line)
- Modify: `remake/tools/serve.mjs` (MIME table, line ~30)
- Test: `remake/tests/forrit-manifest.test.mjs`

**Interfaces:**
- Produces: `/remake/manifest.webmanifest`, and the icon paths above, which Task 7's walk and the stage list carry.

- [ ] **Step 1: Write the failing test** `remake/tests/forrit-manifest.test.mjs`:

```js
const pngSize = file => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
test('the manifest makes Mosi an app that opens full screen at the game', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.deepEqual({ id: m.id, name: m.name, short_name: m.short_name, lang: m.lang, start_url: m.start_url, scope: m.scope,
    display: m.display, background_color: m.background_color, theme_color: m.theme_color },
  { id: '/remake/', name: 'Mosi', short_name: 'Mosi', lang: 'is', start_url: '/remake/', scope: '/remake/',
    display: 'fullscreen', background_color: '#cfdde3', theme_color: '#cfdde3' });
  assert.equal(m.orientation, undefined, 'the screen may turn');
  assert.deepEqual(m.icons.map(i => [i.src, i.sizes, i.purpose]), [
    ['assets/icons/icon-192.png', '192x192', 'any'], ['assets/icons/icon-512.png', '512x512', 'any'],
    ['assets/icons/icon-maskable-512.png', '512x512', 'maskable']]);
  for (const icon of m.icons) assert.deepEqual(pngSize(fileURLToPath(new URL(`../${icon.src}`, import.meta.url))), icon.sizes.split('x').map(Number));
  assert.deepEqual(pngSize(fileURLToPath(new URL('../assets/icons/apple-touch-icon.png', import.meta.url))), [180, 180]);
});
test('only the game page asks to be an app', () => {
  const page = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  const index = page('index.html');
  assert.match(index, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(index, /<link rel="apple-touch-icon" href="\.\/assets\/icons\/apple-touch-icon\.png">/);
  assert.match(index, /<meta name="apple-mobile-web-app-title" content="Mosi">/);
  assert.doesNotMatch(index, /href="data:,"/);
  for (const other of ['spil.html', 'sloedla-lab.html', 'minnisspil.html']) assert.doesNotMatch(page(other), /rel="manifest"/, other);
});
```

- [ ] **Step 2: Run it.** `node --import ./remake/tests/setup.mjs --test remake/tests/forrit-manifest.test.mjs` → FAIL (no
  manifest).
- [ ] **Step 3: Write `remake/tools/make-icons.mjs`** (`node remake/tools/make-icons.mjs`; `FFMPEG=` overrides `ffmpeg` on PATH).
  - It runs ffmpeg on `mosi-render.webp` (1024×768, with alpha) with the crops of the owner-approved preview, each laid over
    `color=c=0xcfdde3` and written as `rgb24` PNG:
    - square crop: `format=rgba,pad=1024:828:0:60:color=0x00000000,crop=500:500:440:60`, scaled to 512 (`icon-512.png`), 192
      (`icon-192.png`) and 180 (`apple-touch-icon.png`);
    - maskable crop: `format=rgba,pad=1024:828:0:60:color=0x00000000,crop=620:620:385:0`, scaled to 512
      (`icon-maskable-512.png`).
  - Run it once and commit the PNGs.
  - Look at `icon-512.png` and `icon-maskable-512.png` yourself. The head is whole, and in the maskable one the horns and beak lie
    inside the centred circle of 80 % width. If they do not, adjust only the maskable crop's size and offset, and ledger it.
- [ ] **Step 4: Write `remake/manifest.webmanifest`** with exactly the fields the test asserts (two-space JSON). In `index.html`,
  replace `<link rel="icon" href="data:,">` with:

```html
<link rel="icon" href="./assets/icons/icon-192.png">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" href="./assets/icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Mosi">
```

  Add `'.webmanifest': 'application/manifest+json'` to serve.mjs's MIME table.
- [ ] **Step 5: Run it** → PASS. Then `npm run test:remake` → all green.
- [ ] **Step 6: Commit** `remake/tools/make-icons.mjs remake/assets/icons remake/manifest.webmanifest remake/index.html
  remake/tools/serve.mjs remake/tests/forrit-manifest.test.mjs`. Message: "Forrit: Mosi's icon (his head from the book's render),
  the manifest and the page head".

### Task 2: The list — `offline.json` from stage, the brake, the README

**Files:**
- Create: `cloud/src/offline-list.mjs`
- Modify: `cloud/stage.mjs` (refuse unsafe names next to the 25 MiB check; write the list after `_headers`)
- Modify: `cloud/README.md` (new section „Forritið og án nets“)
- Test: `cloud/test/offline-list.test.mjs`

**Interfaces:**
- Produces (used by Task 7 and by `stage.mjs`):
  - `fingerprint(bytes: Uint8Array): string`, the 16 hex characters;
  - `isSafeName(rel: string): boolean`, true when `encodeURI('/' + rel) === '/' + rel`;
  - `offlineList(files: Array<{ rel: string, bytes: Uint8Array }>): { version: string, files: Record<string, { size: number, hash: string }> }`;
    keys are `'/' + rel`, sorted, leaving out `LEFT_OUT = ['_headers', 'remake/offline.json', 'remake/sw.js']`;
  - `writeOfflineList(siteDir: string, { burt?: boolean }): { files: number, version: string | null }`, which writes
    `siteDir/remake/offline.json` (`{"burt":true}` with `burt`).
- Version rule: `fingerprint` of the UTF-8 text of `${path} ${size} ${hash}\n`, one line per key in sorted order.

- [ ] **Step 1: Write the failing test** `cloud/test/offline-list.test.mjs`:

```js
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const F = (rel, text) => ({ rel, bytes: Buffer.from(text) });
test('every staged file is listed with its size and fingerprint, and the same game gives the same version', () => {
  const files = [F('remake/index.html', '<html>'), F('remake/assets/a.mp3', 'abc'), F('_headers', 'x'), F('remake/sw.js', 'y'), F('remake/offline.json', 'z')];
  const list = offlineList(files);
  assert.deepEqual(Object.keys(list.files), ['/remake/assets/a.mp3', '/remake/index.html']);
  assert.deepEqual(list.files['/remake/index.html'], { size: 6, hash: sha('<html>') });
  assert.match(list.version, /^[0-9a-f]{16}$/);
  assert.equal(offlineList([...files].reverse()).version, list.version);
  const changed = offlineList([F('remake/index.html', '<html>'), F('remake/assets/a.mp3', 'abd')]);
  assert.notEqual(changed.version, list.version);
  assert.equal(changed.files['/remake/index.html'].hash, list.files['/remake/index.html'].hash);
});
test('a name that needs encoding in an address is not safe', () => {
  assert.equal(isSafeName('remake/assets/x-1.mp3'), true);
  assert.equal(isSafeName('remake/a b.mp3'), false);
  assert.equal(isSafeName('remake/þ.mp3'), false);
});
test('writeOfflineList writes the list into the site, or the brake', () => {
  // a temp dir with remake/index.html, remake/sw.js and _headers: files 1, the read-back JSON deep-equals offlineList of the same
  // files; with { burt: true } the file reads exactly {"burt":true} and version is null
});
```

- [ ] **Step 2: Run** `node --test cloud/test/offline-list.test.mjs` → FAIL (module missing).
- [ ] **Step 3: Implement `cloud/src/offline-list.mjs`** to the interfaces. `writeOfflineList` walks `siteDir` recursively, with
  relative paths in forward slashes.
- [ ] **Step 4: Change `cloud/stage.mjs`.**
  - Before anything is copied, each copy whose published path fails `isSafeName` is refused, as `tooBig` refuses:
    `needs encoding in an address: <path>` on stderr, then exit 1.
  - After `_headers`, it calls `writeOfflineList(site, { burt: process.argv.includes('--burt') })` and adds `version` to the
    printed `{ files, bytes }`.
  - Its header comment names the list and `--burt`.
- [ ] **Step 5: README section „Forritið og án nets“** (Icelandic, as the rest of the README), covering spec §9:
  - what happens on the device;
  - that a new deploy reaches it by itself;
  - the brake: `node stage.mjs --burt`, then `wrangler deploy` (not `npm run deploy`, which would stage again without the
    brake; not `npx`, which may try to download wrangler), or a fixed `remake/sw.js`;
  - that the iPad keeps the home-screen app apart from Safari.
- [ ] **Step 6: Run** `npm run test:cloud` → all green. Run `node cloud/stage.mjs` and check that `cloud/site/remake/offline.json`
  has about 1,795 entries and no `_headers` or `sw.js`.
- [ ] **Step 7: Commit** (CRLF checked). Message: "Forrit: stage writes offline.json, every file with its fingerprint, and the
  --burt brake".

### Task 3: The service worker — `remake/sw.js`

**Files:**
- Create: `remake/sw.js` (a classic script, no `import`)
- Create: `remake/tests/fake-caches.mjs` (a Map-backed CacheStorage: `open`, `delete`, `keys`, and per cache `match`, `put`,
  `delete`, `keys`, keyed by absolute URL)
- Test: `remake/tests/forrit-sw.test.mjs`

**Interfaces:**
- Consumes: the list shape of Task 2; the cache names and keys of the Global Constraints.
- Produces, on `self.forrit` for the tests:
  - `fileFor(pathname: string, files): string | null`. Rules, in order: a trailing `/` gets `index.html`; a listed path is
    itself; `pathname + '.html'` when that is listed; otherwise null.
  - `passesThrough({ method, url, cache }, origin: string): boolean`. True for: not `GET`, another origin, `cache` of `'reload'` or
    `'no-store'`, or a path under `/fjolspil/`.
  - `isByteRange` and `sliceRange`, with the same contract as `cloud/src/range.mjs`.
- Produces, as messages: `{ type: 'forrit:virkja', version }` with a `MessagePort` in `ports[0]`. The answer is `{ ok: true }`
  after `virk` is written and the in-memory list replaced, or `{ ok: false }` when more than one top-level window client exists
  (`clients.matchAll({ type: 'window', includeUncontrolled: true })`, `frameType === 'top-level'`).
- Behaviour:
  - `install` → `skipWaiting()`; `activate` → `clients.claim()`.
  - `fetch`: a request that `passesThrough` gets no `respondWith`. Every other request gets `respondWith(answer(request))`, and
    `answer` falls back to `fetch(request)` when there is no `virk`, no file, or nothing stored.
  - Whole answers are `200`, built anew from the stored body and headers (never a redirected response).
  - Ranges are `206`/`416` from `sliceRange` with `Content-Type` kept.

- [ ] **Step 1: Write the failing tests** `remake/tests/forrit-sw.test.mjs`.
  - Load `sw.js` with `vm.runInNewContext(source, ctx)`:
    - `ctx.self` records `addEventListener` handlers and has `location.origin = 'https://mosi.example'`, `skipWaiting` and
      `clients`;
    - `ctx` also has `caches` (fake-caches), `fetch` (records calls), `Response`, `Request`, `Headers`, `URL`.
  - A `dispatch(type, init)` helper builds the event, with `respondWith` capturing the promise and `waitUntil`.

```js
test('a page is found under every name the cloud answers it at', () => {
  const files = { '/remake/index.html': {}, '/remake/spil.html': {}, '/remake/yatzy-junior.html': {}, '/remake/assets/x.mp3': {} };
  const at = p => sw.fileFor(p, files);
  assert.equal(at('/remake/'), '/remake/index.html');
  assert.equal(at('/remake/spil'), '/remake/spil.html');
  assert.equal(at('/remake/spil.html'), '/remake/spil.html');
  assert.equal(at('/remake/yatzy-junior'), '/remake/yatzy-junior.html');
  assert.equal(at('/remake/assets/x.mp3'), '/remake/assets/x.mp3');
  assert.equal(at('/remake/nope.js'), null);
  assert.equal(at('/fjolspil/ws/GULL'), null);
});
test('the download, the list, Fjölspil and anything not plain go to the network', () => {
  const o = 'https://mosi.example', r = (url, extra = {}) => ({ method: 'GET', url: o + url, cache: 'default', ...extra });
  assert.equal(sw.passesThrough(r('/remake/index.html'), o), false);
  for (const req of [r('/remake/a.png', { cache: 'reload' }), r('/remake/offline.json', { cache: 'no-store' }),
    r('/fjolspil/ws/GULL'), r('/remake/a.png', { method: 'POST' }), { method: 'GET', url: 'https://other.example/x', cache: 'default' }])
    assert.equal(sw.passesThrough(req, o), true, req.url);
});
test('a sound is cut from the store exactly as the cloud cuts it', () => {
  // theme.mp3 bytes; for 'bytes=0-99', `bytes=${total-10}-${total+5000}`, 'bytes=0-', 'bytes=1000000-', 'bytes=-50',
  // 'bytes=90000000-', 'bytes=200-100': deepEqual of { status, headers, Buffer.from(body) } between sw.sliceRange and
  // cloud/src/range.mjs sliceRange; and isByteRange agrees on [null, '', 'bytes=-', 'bytes=0-1,5-6', 'items=0-1', 'bytes=a-b', 'bytes=5-'].
});
test('with no active version every request goes to the network', async () => {
  // fetch event for /remake/ → the respondWith promise resolves to what ctx.fetch returned; ctx.fetch called once
});
test('the active version answers from the store, whole and in ranges, offline', async () => {
  // seed: virk {version:'v1'}, list v1 { '/remake/index.html', '/remake/spil.html', '/remake/assets/audio/theme.mp3' },
  // stored bodies under their hashes with content-type. ctx.fetch throws (offline).
  // /remake/ → 200 index body, redirected false; /remake/spil?r=GULL → spil body; theme with Range bytes=0-99 → 206,
  // content-range `bytes 0-99/${total}`, content-type audio/mpeg; ctx.fetch never called.
});
test('a version takes over only when it is the only window', async () => {
  // two top-level clients: message {type:'forrit:virkja', version:'v2'} → port gets {ok:false}, virk still v1;
  // one top-level client and one nested: {ok:true}, virk is v2, and the next fetch answers from v2's list
});
```

- [ ] **Step 2: Run** `node --import ./remake/tests/setup.mjs --test remake/tests/forrit-sw.test.mjs` → FAIL (no sw.js).
- [ ] **Step 3: Implement `remake/sw.js`** to the interfaces. `sliceRange` and `isByteRange` are copies of `cloud/src/range.mjs`.
  A comment says so, and that the test keeps the two the same. The active list is read lazily on the first fetch after a start and
  kept in a variable. `forrit:virkja` replaces it.
- [ ] **Step 4: Run** → PASS; `npm run test:remake` → all green.
- [ ] **Step 5: Commit** `remake/sw.js remake/tests/fake-caches.mjs remake/tests/forrit-sw.test.mjs`. Message: "Forrit: the service
  worker answers the active version from the store, pages by every name, sounds in ranges".

### Task 4: The page's rules — `remake/engine/offline/plan.js`

**Files:**
- Create: `remake/engine/offline/plan.js`
- Test: `remake/tests/forrit-plan.test.mjs`

**Interfaces:**
- Produces (used by Task 5):
  - `lineFor({ phase: 'first' | 'update' | 'ready' | 'needNet' | 'full', percent?: number }): string`. The copy is the Global
    Constraints'.
  - `missingOf(list, stored: Set<string>): Array<{ path: string, size: number, hash: string }>`. One entry per missing hash, the
    first path in key order.
  - `percentOf(list, stored: Set<string>): number`, which is `Math.floor` of stored bytes over all bytes times 100. It is 100 only
    when all are stored, and 100 for an empty list.
  - `unusedOf(stored: Set<string>, lists: Array<list>): string[]`, the stored hashes no given list uses.
  - `isInstalled(win): boolean` and `mayRegister(win): boolean`, the rules of the Global Constraints. `win` has `location`,
    `matchMedia`, `navigator`.

- [ ] **Step 1: Write the failing test** `remake/tests/forrit-plan.test.mjs`:

```js
const NB = '\u00a0';
test('the line under Byrja says how far the download is, in the words the owner chose', () => {
  assert.equal(lineFor({ phase: 'first', percent: 40 }), `Sæki leikinn í tækið … 40${NB}%`);
  assert.equal(lineFor({ phase: 'update', percent: 7 }), `Sæki nýja útgáfu … 7${NB}%`);
  assert.equal(lineFor({ phase: 'ready' }), 'Tilbúinn án nets ✓');
  assert.equal(lineFor({ phase: 'needNet', percent: 60 }), `Vantar net til að klára (60${NB}%)`);
  assert.equal(lineFor({ phase: 'full' }), 'Ekki nóg pláss í tækinu');
});
test('what to fetch, how far it is, and what to throw away', () => {
  const list = { version: 'v', files: { '/a': { size: 30, hash: 'h1' }, '/b': { size: 70, hash: 'h2' }, '/c': { size: 70, hash: 'h2' } } };
  assert.deepEqual(missingOf(list, new Set(['h1'])), [{ path: '/b', size: 70, hash: 'h2' }]);
  assert.equal(percentOf(list, new Set(['h1'])), 17); // 30 of 170
  assert.equal(percentOf(list, new Set(['h1', 'h2'])), 100);
  assert.deepEqual(unusedOf(new Set(['h1', 'h2', 'old']), [list]), ['old']);
});
test('only the installed app downloads, and the home server never registers', () => {
  // a fake win(href, { display = 'browser', standalone }) with matchMedia matching `(display-mode: ${display})`:
  // isInstalled: 'fullscreen' true, 'standalone' true, navigator.standalone true, 'browser' false,
  //   http://localhost:8797/remake/?forrit=uppsett true, https://x/remake/?forrit=uppsett false;
  // mayRegister: https://mosi.fannar55.workers.dev/remake/ true, http://localhost:4231/remake/ false,
  //   http://127.0.0.1:8797/remake/?forrit=1 true, http://192.168.1.10:4231/remake/?forrit=1 false,
  //   a win whose navigator has no serviceWorker false
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm run test:remake` green.
- [ ] **Step 5: Commit.** Message: "Forrit: the page's rules — what to fetch, how far, the line's words, who downloads".

### Task 5: The download, the switch and the line — `remake/engine/offline/forrit.js`

**Files:**
- Create: `remake/engine/offline/forrit.js`
- Modify: `remake/index.html` (after `#start`: `<p id="forrit-lina" class="forrit-lina" aria-live="polite" hidden></p>`)
- Modify: `remake/style.css` (after `.start`: `.forrit-lina` centred under the button. The button is centred at `top: 66%` with
  `min-height: 72px`, so the line goes at `top: calc(66% + 52px)`, `translateX(-50%)`, 15px, weight 600, `var(--ink)`, opacity
  .7, `white-space: nowrap`, `pointer-events: none`)
- Modify: `remake/main.js`:
  - import, and `const forrit = createForrit();` right after `const params = …`;
  - `forrit.startScreen()` beside `button.hidden = false`;
  - `forrit.started()` in the button's click handler, and in the `t=` and `play=1` branches.
- Test: `remake/tests/forrit-run.test.mjs`

**Interfaces:**
- Consumes:
  - Task 4's `plan.js`;
  - Task 3's message `forrit:virkja`, sent to `registration.active` with a `MessageChannel`;
  - the Global Constraints' keys.
- Produces: `createForrit({ win = window, doc = document, line = doc.getElementById('forrit-lina'), fetchImpl, cachesImpl, subtle, reload, channel } = {}): { startScreen(): void, started(): void, done: Promise<void> }`.
  - Defaults: `fetchImpl` is `win.fetch.bind(win)`, `cachesImpl` is `win.caches`, `subtle` is `win.crypto.subtle`, `reload` is
    `() => win.location.reload()`, and `channel` is `() => new MessageChannel()`.
  - `done` settles when this start's work has ended; it exists for the tests.
- The run, in order:
  1. If `!mayRegister(win)`: nothing at all.
  2. Register `/remake/sw.js` with scope `/remake/`.
  3. If `!isInstalled(win)`: stop. There is no line and no download.
  4. If `tilbuin` exists and differs from `virk`, send `forrit:virkja`. Versions are fingerprints, not an order. If it is ok and
     there was a `virk` before, `reload()` and stop.
  5. Fetch `/remake/offline.json` with `cache: 'no-store'`. If that throws or is not ok, the phase is `ready` when there is a
     `virk`, otherwise `needNet` with `percentOf` the `sidast` list (0 when there is none). Stop.
  6. `{ burt: true }`: delete both caches, `unregister()` every registration, hide the line, stop.
  7. The list's version equals `virk`: the phase is `ready`; delete what `unusedOf(stored, [virk, tilbuin lists])` returns, and
     list entries for other versions. Stop.
  8. Otherwise:
     - store the list and `sidast`; the phase is `update` if there is a `virk`, else `first`; call
       `win.navigator.storage?.persist?.()`;
     - download `missingOf` through a pool: 4 at a time until `started()`, then 1;
     - each file is `fetchImpl(path, { cache: 'reload' })`, then `ok`, `byteLength === size` and a SHA-256 check;
     - only then `put` under its key with `content-type` and `content-length`;
     - after each file, update the line with `percentOf`.
  9. A put that throws `QuotaExceededError` means the phase is `full`; stop. A fetch that throws means `needNet`; stop.
  10. All stored: write `tilbuin`.
      - Before `started()`: send `forrit:virkja`. If it is ok and there was a `virk`, `reload()`. If it is ok and there was none,
        the phase is `ready` and unused files are deleted.
      - After `started()`: leave it for the next start.
- The line:
  - its text is `lineFor(phase)` and is updated whenever the phase or percent changes;
  - it is visible only between `startScreen()` and `started()`, and only in the installed app.

- [ ] **Step 1: Write the failing tests** `remake/tests/forrit-run.test.mjs`.
  - Use `FakeDocument` (`fake-dom.mjs`) for the line and `fake-caches.mjs`.
  - `fetchImpl` serves a site map `{ path: Buffer }` and records `[path, init]`.
  - `subtle` is `globalThis.crypto.subtle`.
  - The fake `win` is at `http://localhost:8797/remake/?forrit=uppsett`, with `navigator.serviceWorker.register` resolving a
    registration whose `active.postMessage(msg, [port])` answers `{ ok: true }` (or as each test sets) and records the call.
  - Lists are built with `offlineList` from `cloud/src/offline-list.mjs`.

```js
test('the first download stores every file and the line counts up to ready', async () => {
  // 3 files; createForrit; startScreen(); await done → every hash stored; every file fetch had { cache: 'reload' };
  // the line's texts in order start with `Sæki leikinn í tækið … 0${NB}%` and end with 'Tilbúinn án nets ✓';
  // virk === the version; reload never called (the first version needs none)
});
test('four at a time on the start screen, one at a time after Byrja', async () => {
  // 12 files whose fetches resolve only when the test releases them: max in flight 4; started(); release → max in flight 1
});
test('a file whose fingerprint is wrong is not kept, and the next start fetches only what is missing', async () => {
  // one path served with other bytes of the same size → not stored, no tilbuin, line not ready;
  // a second createForrit with the right bytes fetches exactly that one path (plus offline.json), then ready
});
test('a new version before Byrja takes over at once with a reload; after Byrja it waits for the next start', async () => {
  // (a) virk v1 complete; list v2 changes one file: only that file fetched; postMessage {type:'forrit:virkja', version: v2};
  //     reload called once; the v1-only hash is gone from mosi-skrar
  // (b) the same but started() before the fill ends: no reload, tilbuin v2; a next createForrit sends forrit:virkja at once and reloads
});
test('without a network the line says ready when a version is kept, otherwise how far it got', async () => {
  // fetchImpl throws: with virk → 'Tilbúinn án nets ✓'; with only a sidast list half stored → `Vantar net til að klára (50${NB}%)`
});
test('a full device says so and stops', async () => {
  // the store's put throws new DOMException('full', 'QuotaExceededError') → 'Ekki nóg pláss í tækinu'; no further fetches
});
test('the brake removes everything', async () => {
  // offline.json is {"burt":true}: both caches deleted, unregister called, line hidden
});
test('a browser tab and the home server never download', async () => {
  // display 'browser' at http://localhost:8797/remake/?forrit=1: registered, offline.json never fetched, line hidden;
  // http://localhost:4231/remake/: register never called
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `forrit.js` to the interface and the run. Then wire `index.html`, `style.css`
  and `main.js` (CRLF kept) as listed under Files.
- [ ] **Step 4: Run** the file → PASS; `npm run test:remake` → all green.
- [ ] **Step 5: Check the line on the home server.**
  - Open `http://localhost:4231/remake/?forrit=uppsett` (the `sloedla` launch config serves main's checkout, so start this
    worktree's own `node remake/tools/serve.mjs --port 4250`).
  - The service worker registers. There is no list at home, so the line reads `Vantar net til að klára (0 %)` under Byrja.
  - Take a screenshot at 1180×820, then Byrja: the line goes.
  - Stop the server afterwards.
- [ ] **Step 6: Commit.** Message: "Forrit: the installed app downloads the game, switches versions on the start screen, and says
  how far under Byrja".

### Task 6: „Fjölspil þarf net“

**Files:**
- Modify: `remake/engine/fjolspil/lobby.js`: `needsNet(on)` on the returned API. It applies to the lobby's join block
  (`.fjolspil-join`) and to a waiting card's block.
- Modify: `remake/engine/sloedla/band-lobby.js`: `needsNet(on)` for `.sl-saman-qr` and `.sl-saman-code`.
- Modify: `remake/engine/fjolspil/fjolspil.js`, `status(next)`:
  - keep `at.everConnected` (true from the first `'connected'`);
  - `needs = next === 'offline' && !at.everConnected`;
  - call `lobby.needsNet?.(needs)` when it changes, and again in `showLobby()`.
- Modify: `remake/fjolspil.css` (`.fjolspil-needs-net`) and `remake/sloedla.css` (`.sl-saman-needs-net`): the words fill the QR's
  square, centred, 22px, weight 700, `var(--ink)`.
- Test: `remake/tests/fjolspil-lobby.test.mjs`, `remake/tests/fjolspil-host.test.mjs` and `remake/tests/sloedla-fjolspil.test.mjs`
  (each gets a test).

**Interfaces:**
- Produces: `lobby.needsNet(on: boolean): void` on both lobbies. While on, the QR and the letters are hidden and
  `<p class="fjolspil-needs-net">Fjölspil þarf net</p>` (band: `sl-saman-needs-net`) shows. While off, it is the other way round.

- [ ] **Step 1: Write the failing tests:**

```js
// fjolspil-lobby.test.mjs
test('the lobby says Fjölspil þarf net in place of the code while the network is down', () => {
  const { lobby, root } = rig();
  lobby.show({ joinUrl: JOIN, code: 'GULL', ai: THORSEDLA });
  lobby.needsNet(true);
  assert.equal($(root, '.fjolspil-qr').hidden, true);
  assert.equal($(root, '.fjolspil-needs-net').textContent, 'Fjölspil þarf net');
  assert.equal($(root, '.fjolspil-needs-net').hidden, false);
  lobby.needsNet(false);
  assert.equal($(root, '.fjolspil-qr').hidden, false);
  assert.equal($(root, '.fjolspil-needs-net').hidden, true);
});
// fjolspil-host.test.mjs
test('a big screen that never reached the room says Fjölspil þarf net; one that did never does', () => {
  // with the file's fake net and a lobby stub recording needsNet calls, lobby open:
  // setStatus('offline') → last needsNet true; setStatus('connected') → false; setStatus('offline') again → still false
});
// sloedla-fjolspil.test.mjs
test('the band card says Fjölspil þarf net in place of the code while the network is down', () => {
  // createBandLobby on a FakeDocument with #saman; show({ joinUrl, code: 'GULL' }); needsNet(true) → .sl-saman-qr hidden,
  // .sl-saman-needs-net 'Fjölspil þarf net' shown; needsNet(false) → back
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm run test:remake` green; CRLF checked.
- [ ] **Step 5: Commit.** Message: "Fjölspil: „Fjölspil þarf net“ in place of the code while the room was never reached".

### Task 7: The walk — `remake/tools/forrit-walk.mjs`

**Files:**
- Create: `remake/tools/forrit-walk.mjs`. Model the CDP plumbing (Edge launch, sockets, `check()`, contexts) on
  `remake/tools/sloedla-fjolspil-walk.mjs`.
- Output: `qa/remake/forrit/walk/` (`report.json` and shots; `qa/` is git-ignored).

**Interfaces:**
- Consumes: `writeOfflineList` (Task 2), the cache names (Global Constraints), `#forrit-lina` (Task 5), `.fjolspil-needs-net`
  (Task 6).
- Usage: `node remake/tools/forrit-walk.mjs`. `EDGE_PATH=` overrides the browser, and `WRANGLER=` overrides `wrangler` on PATH.
  The exit code is 1 when a check fails.

- [ ] **Step 1: Write the walk.**
  - **Setup:**
    - take the rec-lock;
    - run `node cloud/stage.mjs`;
    - start `wrangler dev --ip 127.0.0.1 --port 8797` in `cloud/` and wait for `Ready on`;
    - one browser context, 1180×820;
    - before the first load, seed `localStorage['mosi-remake-v1']` with
      `{"stars":["k1_kambedla","k2_thorsedla"],"findings":[],"seen":[],"places":[]}`, so the Leikir page shows Eitt!, Háls og
      hali and Litla Yatzy.
  - **Checks**, each through `check(name, ok, detail)`:
    1. *A tab:* `/remake/?forrit=1`. After 8 s a registration exists, `mosi-skrar` has 0 entries, and no request went to
       `offline.json`.
    2. *Installed:* `/remake/?forrit=uppsett`. The line starts `Sæki leikinn í tækið`. Within 10 min it reads
       `Tilbúinn án nets ✓`. `mosi-skrar` holds every distinct hash of the list. Shot `1-tilbuinn.png`.
    3. *Offline:* stop wrangler (process tree) and reload.
       - In the page, fetch every path of the active list: each answers 200 with its listed size.
       - Byrja: a caption shows within 15 s.
       - The book opens (`#journal-button`), and each ribbon's leaf shows.
       - Eitt!, Háls og hali and Litla Yatzy each open from their tiles (`#eitt` and `#hals` shown; the junior frame's document
         has its game). Each is closed again.
       - Fjölspil, from Eitt!'s „Spilum saman“ or the lobby's opener, shows `.fjolspil-needs-net` reading
         `Fjölspil þarf net` within 5 s.
       - No console errors other than failed network requests and WebSocket failures.
       - Shots `2-an-nets-*.png`.
    4. *A new version:*
       - append `\n<!-- forrit-walk -->\n` to `cloud/site/remake/README.md`, `writeOfflineList(site)`, start wrangler;
       - load `/remake/?forrit=uppsett` and do not press Byrja;
       - the only listed file fetched from the network is `/remake/README.md`;
       - the page reloads itself once;
       - `virk` is the new version, and the old README hash is gone from `mosi-skrar`.
    5. *The guest's page:* `/remake/spil.html` makes no request to `offline.json`.
  - **Teardown, in `finally`:**
    - stop wrangler with `taskkill /PID <pid> /T /F`;
    - re-run `node cloud/stage.mjs` to restore the site;
    - close Edge and release the rec-lock;
    - write `report.json`.
- [ ] **Step 2: Run** `node remake/tools/forrit-walk.mjs` (in the background, about 10 min) → every check passes. If a check
  fails, debug the code under test, not the check.
- [ ] **Step 3: Confirm nothing is left running.** `Get-Process workerd` finds nothing, and no `node … wrangler` is in
  `Win32_Process`.
- [ ] **Step 4: Commit** `remake/tools/forrit-walk.mjs`. Message: "Forrit: the walk — download, offline with every file and every
  book game, an update that fetches one file, a tab and the guest page fetching nothing".

---

## After the last task

- `npm run test:remake` and `npm run test:cloud` are green; the walk's `report.json` has every check passing.
- Show the owner the icon PNGs, the line's screenshots and the walk's report.
- The owner's hand check is his:
  1. `npm run deploy` from this branch's checkout only after he says so; merging comes first, by his word;
  2. install on Android, the iPad and the PC;
  3. wait for „Tilbúinn án nets ✓“;
  4. play in airplane mode;
  5. deploy a change and see it arrive.
