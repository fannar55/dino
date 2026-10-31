# Söngur Slóeðlu: valmynd með lagaspjöldum og DJ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lab page's one-card menu with two steps (who plays, then song cards with pictures), the DJ in the menu saying a line per song over a short preview of it, and the best stars per song on each card.

**Architecture:** The menu's logic is pure (`menu.js`: steps, choices, the cues to say and play); `best.js` keeps the best stars on the device; a DOM view (`menu-view.js`) draws the steps, cards and juice and runs the cues through the DJ (`dj.js`, gaining `hush()`) and a preview player (`brot.js`). `lab.js` wires them to the round as before. Song entries (`v2/songs/index.js`) gain `card`, `hue` and `brot`.

**Tech Stack:** plain ES modules, DOM + CSS, Web Audio, Node's test runner with the fake audio context (`remake/tests/fake-audio.mjs`); ElevenLabs (DJ lines, `tools/sloedla-dj.mjs`); ffmpeg (previews).

**Spec:** `docs/superpowers/specs/2026-10-30-sloedla-valmynd-design.md`

## Global Constraints

- Answer the owner in Icelandic; all copy on screen and the DJ's lines exactly as the spec's table (§4).
- Ask before anything is downloaded (name, source, licence, size); no Claude-drawn art: card pictures and the DJ picture are free images the owner picked.
- Never print the ElevenLabs key (it is in the environment; `tools/sloedla-dj.mjs` reads it).
- Commit on `sloedla-lag` only; merge and push only at the owner's request; never bare `git stash`; never touch `design/` or `dist/`; keep each file's line endings.
- Lean tests: the menu's behaviour and what must be on disk; the rest is seen in headless screenshots.
- One headless capture at a time: take the lock `mkdir <side notes>/sloedla-keppni/rec-lock` and give it back.
- Tests: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla*.test.mjs` (song game), `npm run test:remake` (whole suite), from the worktree root.

## Review Focus

1. Before the first tap the browser has no sound: nothing may be said or played then, and the greeting is said once when the first tap opens the sound (Task 2 test `nothing before the first tap`).
2. A child tapping card after card: one DJ line and one preview at a time, each pick cutting the last (Task 2 cues `hush`/`stop`; Task 3 test `hush stops the line he is saying`).
3. A device that will not store (private window, storage that throws): the menu works and remembers nothing (Task 1 test `a storage that throws`).
4. The tools that click `#play` (rec.mjs, meter.mjs, loudness.mjs, sloedla-variety.mjs --starts): with `?sjalf=` the page opens on step 2 with the song picked and `#play` ready (Task 2 test `self-play opens on the songs`; Task 6 verify with rec.mjs).
5. A phone held upright: the cards wrap, nothing scrolls sideways, the DJ does not cover a card (Task 6 screenshots at 390×844).

---

### Task 1: The best stars on the device (`best.js`)

**Files:**
- Create: `remake/engine/sloedla/best.js`
- Test: `remake/tests/sloedla-menu.test.mjs` (new)

**Interfaces:**
- Produces: `createBest(storage = globalThis.localStorage) -> { get(songId: string, level: 'barn'|'fullordinn') -> 0|1|2|3, record(songId, level, stars) -> boolean }` — `record` keeps the higher of the two and says whether it was a new best; storage key `'mosi-sloedla-best'`, JSON `{ "<songId>/<level>": stars }`; every storage call in try/catch, an in-memory map when there is none.

- [ ] **Step 1: Write the failing tests**

```js
test('best stars: kept per song and level, only ever higher', () => {
  const store = new Map(); const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const best = createBest(storage);
  assert.equal(best.get('pixel', 'barn'), 0);
  assert.equal(best.record('pixel', 'barn', 2), true);
  assert.equal(best.record('pixel', 'barn', 1), false);
  assert.equal(best.get('pixel', 'barn'), 2);
  assert.equal(best.get('pixel', 'fullordinn'), 0);
  assert.equal(createBest(storage).get('pixel', 'barn'), 2, 'still there next time');
});
test('best stars: a storage that throws, or none, works and remembers for the visit', () => {
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  for (const best of [createBest(broken), createBest(null)]) {
    assert.equal(best.get('fonk', 'barn'), 0);
    assert.equal(best.record('fonk', 'barn', 3), true);
    assert.equal(best.get('fonk', 'barn'), 3);
  }
});
```

- [ ] **Step 2: Run them; expected FAIL** (`createBest` not defined): `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla-menu.test.mjs`
- [ ] **Step 3: Implement `createBest`** in `remake/engine/sloedla/best.js` as the Interfaces block says.
- [ ] **Step 4: Run them; expected PASS.**
- [ ] **Step 5: Commit** `best.js` and the test.

### Task 2: The menu's logic (`menu.js`)

**Files:**
- Create: `remake/engine/sloedla/menu.js`
- Test: `remake/tests/sloedla-menu.test.mjs`

**Interfaces:**
- Consumes: song entries `{ id, name, by?, card, hue, brot }` (only `id` is read here).
- Produces: `createMenu({ songs, level = 'barn', lanes = 3, song = null, self = false }) -> menu` with
  - `state() -> { step: 'hver'|'lag', level, lanes, song: string|null, heard: boolean }`
  - `unlock() -> cues` (the first tap opened the sound; on step 1 the first time: `[{ say: 'hverspilar' }]`)
  - `choose(name: 'stig'|'brautir', value) -> cues` (`[]`)
  - `toSongs() -> cues` (`[{ hush: true }, { say: 'hvadalag' }]`)
  - `pick(id) -> cues` (`[{ hush: true }, { stop: true }, { say: 'lag-<id>' }, { brot: id }]`; an unknown id: `[]`)
  - `back() -> cues` (`[{ hush: true }, { stop: true }, { say: 'hverspilar' }]`, step `'hver'`)
  - `play() -> { song, level, lanes } | null` (null with no song picked; the view hushes and stops)
  - `other() -> cues` (after a round: step `'lag'`, `[{ say: 'hvadalag' }]`)
  - A cue is `{ say: key }` (a DJ_LINES key), `{ hush: true }`, `{ brot: songId }` or `{ stop: true }` (stop the preview). Before `unlock()` every `say` and `brot` cue is left out.
  - `self: true` (the address's `?sjalf=`) starts on step `'lag'` with `song` picked if it is one of `songs`.

- [ ] **Step 1: Write the failing tests** (one `test` each; the names are the Review Focus's)

```js
const songs = [{ id: 'pixel' }, { id: 'stattu-upp' }];
test('menu: who plays, then the songs; a pick says its line and plays its bit; back and other', () => {
  const menu = createMenu({ songs });
  menu.unlock();
  assert.deepEqual(menu.choose('stig', 'fullordinn'), []);
  menu.choose('brautir', 2);
  assert.deepEqual(menu.toSongs(), [{ hush: true }, { say: 'hvadalag' }]);
  assert.deepEqual(menu.pick('stattu-upp'), [{ hush: true }, { stop: true }, { say: 'lag-stattu-upp' }, { brot: 'stattu-upp' }]);
  assert.deepEqual(menu.pick('nope'), []);
  assert.deepEqual(menu.play(), { song: 'stattu-upp', level: 'fullordinn', lanes: 2 });
  assert.deepEqual(menu.other(), [{ say: 'hvadalag' }]);
  assert.equal(menu.state().step, 'lag');
  assert.deepEqual(menu.back(), [{ hush: true }, { stop: true }, { say: 'hverspilar' }]);
  assert.equal(menu.state().step, 'hver');
});
test('menu: nothing before the first tap; the greeting once when it opens the sound', () => {
  const menu = createMenu({ songs });
  assert.deepEqual(menu.toSongs(), [{ hush: true }]);
  assert.deepEqual(menu.pick('pixel'), [{ hush: true }, { stop: true }]);
  menu.back();
  assert.deepEqual(menu.unlock(), [{ say: 'hverspilar' }]);
  assert.deepEqual(menu.unlock(), []);
});
test('menu: no song, no play; an address song is picked when the songs open', () => {
  assert.equal(createMenu({ songs }).play(), null);
  const menu = createMenu({ songs, song: 'pixel' });
  menu.toSongs();
  assert.equal(menu.state().song, 'pixel');
  assert.equal(createMenu({ songs, song: 'gamalt' }).state().song, null, 'an old or unknown id picks nothing');
});
test('menu: self-play opens on the songs with the address song picked', () => {
  const menu = createMenu({ songs, song: 'stattu-upp', self: true });
  assert.deepEqual(menu.state(), { step: 'lag', level: 'barn', lanes: 3, song: 'stattu-upp', heard: false });
});
```

- [ ] **Step 2: Run; expected FAIL** (`createMenu` not defined).
- [ ] **Step 3: Implement `createMenu`** in `remake/engine/sloedla/menu.js` as the Interfaces block says (pure, no DOM, no audio).
- [ ] **Step 4: Run; expected PASS.**
- [ ] **Step 5: Commit.**

### Task 3: The DJ in the menu: `hush()` and his new lines, recorded

**Files:**
- Modify: `remake/engine/sloedla/dj.js` (DJ_LINES; `createDj` returns `hush`)
- Create (by the tool): `remake/assets/audio/sloedla/dj/{hverspilar,hvadalag,lag-pixel,lag-boogie,lag-fonk,lag-stattu-upp}-<n>.mp3`, entries in `dj.json`
- Test: `remake/tests/sloedla.test.mjs` (the DJ test), `remake/tests/sloedla-menu.test.mjs`

**Interfaces:**
- Produces: DJ_LINES keys `hverspilar`, `hvadalag`, `lag-<songId>` for every song in SONGS_V2, texts exactly the spec's §4 table (first text = the words the bubble shows); `createDj(...).hush()` stops the take he is saying (a 60 ms fade) and the music comes back up (`onTalk` is called with `(now, 0)`).

- [ ] **Step 1: Write the failing tests**

```js
// sloedla-menu.test.mjs
test('every song has the DJ\'s line, more than one way of saying it', async () => {
  for (const { id } of SONGS_V2) assert.ok(DJ_LINES[`lag-${id}`]?.length >= 2, id);
  assert.ok(DJ_LINES.hverspilar.length >= 1 && DJ_LINES.hvadalag.length >= 2);
});
test('hush stops the line he is saying', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const context = createFakeContext({ state: 'running' });
    const talks = [];
    const dj = createDj({ context, output: context.destination, src: id => id, onTalk: (at, seconds) => talks.push(seconds) });
    await dj.load();
    assert.ok(dj.play('hvadalag') > 0);
    const take = context.bufferSources.at(-1);
    dj.hush();
    assert.ok(take.stopTime !== undefined && take.stopTime <= context.currentTime + 0.1, 'stopped at once');
    assert.equal(talks.at(-1), 0, 'the music comes back up');
  } finally { globalThis.fetch = realFetch; }
});
```
(The existing DJ test in `sloedla.test.mjs` already demands every take on disk with its text in `dj.json`.)

- [ ] **Step 2: Run; expected FAIL** (no `lag-*` lines; no `hush`).
- [ ] **Step 3: Add the lines to DJ_LINES and `hush()` to `createDj`** (keep the source he plays; `hush` ramps its gain to 0 over 60 ms, stops it, calls `onTalk(now, 0)`).
- [ ] **Step 4: Record them:** `node remake/tools/sloedla-dj.mjs --only hverspilar,hvadalag,lag-pixel,lag-boogie,lag-fonk,lag-stattu-upp` (the tool hears each take back and retries; report any take it could not hear as written, e.g. "Blár ópal", and add a respelling to the lexicon only if needed).
- [ ] **Step 5: Run the song game tests; expected PASS** (`node --import ./remake/tests/setup.mjs --test remake/tests/sloedla*.test.mjs`).
- [ ] **Step 6: Commit** dj.js, the takes, dj.json, the tests.

### Task 4: The previews (`brot`)

**Files:**
- Create: `remake/tools/sloedla-brot.mjs`, `remake/engine/sloedla/brot.js`
- Create (by the tool): `remake/assets/audio/sloedla/v2/<id>/brot.mp3` for each song
- Modify: `remake/engine/sloedla/v2/songs/index.js` (each entry: `brot: <song time s>`)
- Test: `remake/tests/sloedla-menu.test.mjs`

**Interfaces:**
- Produces: CLI `node remake/tools/sloedla-brot.mjs <id> [--source <audio file> --lead <s>]`: 10 s from the entry's `brot` (song time; in the stems at `tempo.offset + brot`, in a `--source` recording at `lead + brot`), the stems mixed (ffmpeg amix, normalize=0) unless `--source`, 0.4 s fade in, 1.2 s fade out, levelled to −17 LUFS (two-pass loudnorm, true peak −2 dB), stereo mp3 96 kbps (about 120 KB).
- Produces: `createBrot({ context, output, src: id => url }) -> { play(id) -> Promise<void>, stop() }`: fetched and decoded on first play (kept), 0.3 s fade in at 0.6 of full level into `output` (the music bus, so the DJ dips it), `stop()` fades out over 0.3 s and stops the source then; one at a time (`play` stops the last); `play` resolves once it has started (or failed quietly).

- [ ] **Step 1: Write the failing tests**

```js
test('every song has its preview on disk, about ten seconds, from inside the song', async () => {
  for (const entry of SONGS_V2) {
    const song = (await entry.load()).default;
    assert.ok(entry.brot >= 0 && entry.brot + 10 <= timelineOf(song).length, entry.id);
    assert.ok(fs.statSync(new URL(`../assets/audio/sloedla/v2/${entry.id}/brot.mp3`, import.meta.url)).size > 40_000, entry.id);
  }
});
test('the preview player: one at a time, faded out on stop', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const context = createFakeContext({ state: 'running' });
    const brot = createBrot({ context, output: context.destination, src: id => id });
    await brot.play('a');
    const a = context.bufferSources.at(-1);
    await brot.play('b');
    const b = context.bufferSources.at(-1);
    assert.notEqual(a, b);
    assert.ok(a.stopTime !== undefined && a.stopTime <= context.currentTime + 0.35, 'the last one goes when the next comes');
    assert.equal(b.stopTime, undefined);
    brot.stop();
    assert.ok(b.stopTime !== undefined && b.stopTime <= context.currentTime + 0.35);
  } finally { globalThis.fetch = realFetch; }
});
```

- [ ] **Step 2: Run; expected FAIL.**
- [ ] **Step 3: Implement `brot.js`**, and pick each song's `brot` (the chorus: pixel `B`, boogie the second `vers`, fonk the first `krokur`, stattu-upp the first `vidlag`; the section's start from `timelineOf`), written into the entries.
- [ ] **Step 4: Write the tool and make the previews.** Recorded songs: `node remake/tools/sloedla-brot.mjs <id>`. Pixlaferð (composed, no file): take the lock, record a music-only round with the side notes' `rec.mjs` (`?lag=pixel&sjalf=1&upptaka=1&hljod=0&dj=0&ahorfendur=0`), give the lock back, then `node remake/tools/sloedla-brot.mjs pixel --source <that umferd.webm> --lead 0.4`. Check each with `ffmpeg -af ebur128` (about −17 LUFS) and its size.
- [ ] **Step 5: Run; expected PASS.**
- [ ] **Step 6: Commit** the tool, brot.js, the previews, index.js, the tests.

### Task 5: The pictures (the owner chooses)

**Files:**
- Create: `remake/assets/sloedla/valmynd/{pixel,boogie,fonk,stattu-upp,dj}.webp`, `remake/assets/sloedla/valmynd/KREDIT.md`
- Modify: `remake/engine/sloedla/v2/songs/index.js` (each entry: `card: '<id>.webp'`, `hue: '#rrggbb'`)
- Test: `remake/tests/sloedla-menu.test.mjs`

**Interfaces:**
- Produces: entry `card` (file in `assets/sloedla/valmynd/`) and `hue` (the card's glow, a colour of its picture); `assets/sloedla/valmynd/dj.webp` (the DJ).

- [ ] **Step 1: Write the failing test**

```js
test('every song has its picture on disk, its source and licence said', () => {
  const credits = fs.readFileSync(new URL('../assets/sloedla/valmynd/KREDIT.md', import.meta.url), 'utf8');
  for (const entry of [...SONGS_V2, { id: 'dj', card: 'dj.webp' }]) {
    assert.ok(fs.existsSync(new URL(`../assets/sloedla/valmynd/${entry.card}`, import.meta.url)), entry.id);
    assert.ok(credits.includes(entry.card), `KREDIT.md says where ${entry.card} is from`);
    if (entry.hue) assert.match(entry.hue, /^#[0-9a-f]{6}$/i);
  }
});
```

- [ ] **Step 2: Run; expected FAIL.**
- [ ] **Step 3: Find 2–3 candidates for each card and the DJ** in one style (Openverse API `license=cc0,pdm,by`, Openclipart, Wikimedia Commons): show them in the brainstorm companion (thumbnail, title, author, source page, licence, size). **Stop: the owner picks and approves the download.**
- [ ] **Step 4: Download what he picked** (each into its own new folder under the scratchpad), make 512 px webp (`ffmpeg -vf scale=512:-1 -quality 85`; an SVG through a raster step first), copy into `assets/sloedla/valmynd/`, write `KREDIT.md` (file, title, author, source URL, licence; CC BY credited by name), set `card` and `hue`.
- [ ] **Step 5: Run; expected PASS.**
- [ ] **Step 6: Commit** the pictures, KREDIT.md, index.js, the test.

### Task 6: The menu on the page, with juice

**Files:**
- Create: `remake/engine/sloedla/menu-view.js`, `remake/engine/sloedla/menu-sparks.js`
- Modify: `remake/sloedla-lab.html` (the start section becomes the two steps; the end section's buttons), `remake/sloedla.css`, `remake/engine/sloedla/lab.js` (wiring; the old chips, `choose`, `showOptions` and `[data-play]` go)
- Test: headless screenshots (no unit test: the logic is Tasks 1–4's)

**Interfaces:**
- Consumes: `createMenu`, `createBest`, `createBrot`, `createDj(...).hush`, entries' `card`/`hue`/`brot`, DJ_LINES (the bubble shows a key's first text).
- Produces: `createMenuView({ root: document, menu, songs, best, dj, brot, sparks, asset, onPlay: ({ song, level, lanes }) => void }) -> { showStart(), showEnd(result) }`; `createSparks(canvas) -> { burst(x, y, hue) }` (no-op under `prefers-reduced-motion`).
- HTML hooks: `#start` with `[data-step="hver"]` and `[data-step="lag"]`; `.sl-dj` (`img` = `valmynd/dj.webp`, `.sl-dj-say`); step 1 `[data-option="stig=barn|fullordinn"]`, `[data-option="brautir=3|2"]` (with the friends' pictures), `[data-to-songs]` „Veljum lag →“; step 2 `[data-cards]`, `[data-back]` „← Til baka“, `#play` „Spila!“ (hidden until a song is picked; `disabled` until ready); `#end` with `#end-words`, `[data-again]` „Spilum aftur“, `[data-other]` „Annað lag“.

- [ ] **Step 1: The page.** Build the two steps and the end buttons with the hooks above; the cards from the entries (picture, name, `by`, best stars ☆/★ for the chosen level; the picture failing to load leaves the card's `hue` gradient; a song with `by`, Stattu upp, has a gold frame). Every cue from the menu runs here: `say` → `dj.play(key)` and the bubble shows `DJ_LINES[key][0]` while he talks (the DJ picture gets `.talking`); `hush` → `dj.hush()`; `brot` → `brot.play(id)`; `stop` → `brot.stop()`. The first `pointerdown` anywhere resumes the audio context, then `menu.unlock()`. `lab.js`: the menu from the address (`?stig=`, `?brautir=`, `?lag=`, `?sjalf=`) and the saved choices (`mosi-sloedla-val`, try/catch); `onPlay` starts the round as `start()` does now; `finish(result)` records `best.record(song, level, result.stars)` and `showEnd(result)`; Enter/space: step 1 → `toSongs`, step 2 with a song → play, end → again.
- [ ] **Step 2: Juice in `sloedla.css`.** Steps slide (0.35 s); cards come in one after another (`--i`, 0.08 s apart) and sway slightly; the picked card lifts 10 px, tilts 3°, glows in `--hue`, the others go to 0.75 opacity; „Spila!“ pops in (scale 0.6 → 1.08 → 1); the DJ picture bobs while `.talking`; a new best's stars sparkle. `@media (prefers-reduced-motion: reduce)`: no sway, no tilt, no sparks, fades only. `menu-sparks.js`: a canvas over the cards, 24 sparks per burst in the card's hue, 0.6 s.
- [ ] **Step 3: Run the song game tests and the whole suite; expected all PASS.**
- [ ] **Step 4: Look at it.** Take the lock; headless screenshots of step 1, step 2 with Stattu upp picked, and the end, at 1280×800 and 390×844 (no sideways scroll at 390; the DJ covers no card); one round from the menu to the end with `rec.mjs` (`?lag=stattu-upp&sjalf=1&upptaka=1&hljod=0`) without errors; give the lock back. Fix what the pictures show.
- [ ] **Step 5: Commit.**

### Task 7: To the owner

- [ ] **Step 1:** `npm run test:remake` (all PASS) and `node remake/tools/sloedla-variety.mjs` (exit 0).
- [ ] **Step 2:** Send the screenshots and a short video of picking a song (the DJ's line and the preview heard); give the localhost link `http://localhost:4231/remake/sloedla-lab.html`.
- [ ] **Step 3:** Update the memory note (`sloedla-lag-state.md`) and the side notes; nothing merged or pushed.
