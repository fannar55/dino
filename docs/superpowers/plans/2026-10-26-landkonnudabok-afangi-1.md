# Landkönnuðabók, áfangi 1: bókin sjálf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The book's new structure: tabs Risaeðlur, Dýrin, Leikir, Kortið, Safnið (Stjörnur goes), dinosaur tiles, games that appear only when open, fossils that are new and celebrated, cards up to 10 pages with a 3D page type, and the two chapter changes.

**Architecture:** Everything stays in the existing book (`remake/engine/book/`). The dinosaurs page is a second instance of `animals-page.js` over the dinosaur cards; the fossil collection moves out of `book.js` into `museum-page.js`; a new `skeleton-view.js` gives the card viewer a 3D page with its own small three.js renderer (the pattern of `engine/eitt/kambedla-view.js`). Card data gains a `group`, more unlock kinds and an optional `model` per page.

**Tech Stack:** plain ES modules, three.js from `dist/vendor/` (import map `three`), GLTFLoader from `dist/vendor/GLTFLoader.js`, Node test runner with `remake/tests/fake-dom.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-26-landkonnudabok-design.md` (research: `docs/superpowers/specs/2026-10-25-landkonnudabok-rannsokn.md`).

## Global Constraints

- Work only in worktree `C:/Risaeðla/dino-bokin`, branch `bokin`. Commit work in progress after each step that leaves the suite green (WIP commits are fine). Never push, never merge, never touch `design/` or `dist/`, never stop servers on ports 4190, 4197 or 4201.
- Keep each file's line endings: `remake/engine/book/book.js` is CRLF, every other file touched here is LF (`.gitattributes` is `* -text`). Check with `file <path>` after editing.
- No new pictures drawn by Claude: no SVG or canvas drawings of animals, no modelled 3D. Pictures are the game's renders (`remake/assets/book/images/*-render*.webp`, `remake/assets/eitt/*.webp`) or open images the owner approves later.
- Child-facing text exactly as written here, in Icelandic. Controls stay at least `--book-target` (88 px). Motion is transform and opacity only, and `prefers-reduced-motion` turns motion into fades as everywhere in the book.
- Tests, the owner's lean rule: update the existing tests that the change breaks, and add at most the one or two small tests each task names. Run the whole remake suite once at the end of each task: `node --import ./remake/tests/setup.mjs --test remake/tests/*.test.mjs` (about 4 minutes; all green). Never run the root `npm test`.
- Save as you go: after each step, append one line to the ledger `C:\Users\fannare\AppData\Roaming\Claude\side-session-notes\local_5af6e842-d0c9-4f2a-92fb-56f234adc53d\sdd-ledgers\2026-10-26-bokin-progress.md` (what was done, commit hash) and commit.

## Decisions made here (not in the spec)

- **Met dinosaurs without a card yet** (Þórseðla, Uggeðla, Slóeðla, Flugeðla until áfangi 2): the tile is in colour (and "Nýtt!" until tapped); a tap has Mosi say his existing map line about her (`k2_mosi_map_<id>`), no card opens. Unmet dinosaurs are silhouettes, and a tap has Mosi say `book_mosi_later`. Grameðla stays unmet until chapter 3 (her star id will be `k3_gramedla`).
- **The star slots on the journal button stay** for now (the spec's open point; the owner decides later).
- **On a 3D page only the arrows flip**, so a finger turns the model and never the page.

## Review Focus

1. An existing save from before this change (stars, places, findings, seen with card ids) opens the new book with the right dinosaurs met and nothing missing — Task 2 test.
2. A save that already has all eight fossils celebrates once, the first time the child opens Safnið, never again — Task 3 test.
3. No WebGL (or a model that fails to load): the 3D page keeps its picture, the text is read and the arrows work — Task 4 test.
4. The chapter 2 end opens the book on Risaeðlur with Þórseðla nodding, then turns to the map — Task 2 updates `kafli2.test.mjs`.
5. A tablet held upright: five ribbons and the close fit across with the label "Risaeðlur" — checked by capture at 820×1180 in Task 6.

---

### Task 1: Card data and rules

**Files:**
- Modify: `remake/engine/book/cards.js`, `remake/engine/book/media.js` (checkMedia), `remake/assets/book/cards.json`, `remake/assets/book/media-manifest.json`
- Test: `remake/tests/cards.test.mjs`, `remake/tests/media.test.mjs`

**Interfaces:**
- Produces (cards.js):
  - `PAGE_MAX = 10`.
  - Each parsed card has `group: 'dinosaur' | 'animal' | 'fossil'` (default `'animal'`), `say: string | null`, `picture: string` (media id of the tile: the card's `picture`, else `pages[0].image`).
  - A card may have `pages: []` only when it has `say` and `picture` (a "teaser"); otherwise PAGE_MIN..PAGE_MAX pages as now.
  - A page may have `model: string | null` (a GLB path read from `remake/`, as image paths are).
  - Unlocks: `{ start }`, `{ star }`, `{ found }` as now, plus `{ place: '<id>' }` (in `state.places`) and `{ fossil: '<kind>' }` (in `state.fossils`).
  - `export function bookState(save)` → `{ stars, findings, seen, places, fossils }` where `fossils = save.getHals?.().found ?? []` and `places = save.get().places ?? []`. `isUnlocked(card, state)` and `isNew(card, state)` take this state.
  - Spread limits (SPREAD_MAX) count only `group: 'animal'` cards.
- Produces (data): dinosaur cards in order `mosi` 1, `kambedla` 2, `thorsedla` 3, `gramedla` 4, `uggedla` 5, `sloedla` 6, `flugedla` 7, all `"group": "dinosaur"`. Mosi and Kambeðla keep their pages. The five teasers:

| id | name | unlock | say | picture (media id → file) |
|---|---|---|---|---|
| thorsedla | Þórseðla | `{ star: 'k2_thorsedla' }` | `k2_mosi_map_thorsedla` | `render-thorsedla` → `assets/eitt/brontosaurus.webp` |
| gramedla | Grameðla | `{ star: 'k3_gramedla' }` | `book_mosi_later` | `render-gramedla` → `assets/eitt/trex.webp` |
| uggedla | Uggeðla | `{ place: 'uggedla' }` | `k2_mosi_map_uggedla` | `render-uggedla` (exists) |
| sloedla | Slóeðla | `{ place: 'sloedla' }` | `k2_mosi_map_sloedla` | `render-sloedla` → `assets/eitt/parasaurolophus.webp` |
| flugedla | Flugeðla | `{ place: 'flugedla' }` | `k2_mosi_map_flugedla` | `render-flugedla` → `assets/eitt/pteranodon.webp` |

  New manifest entries are `kind: "render"`, `license: "own"`, `thumb` = `src`, with `source` naming `tools/bake/book-render.html` as the existing eitt entries' provenance does, `alt` one Icelandic sentence. `checkMedia` also checks each card's `picture`.

- [ ] **Step 1: Write the failing tests** in `cards.test.mjs`: (a) a teaser card (`pages: []`, `say`, `picture`) parses with `group` and `say`, and one without `say` throws naming the card; (b) a card with 10 pages parses and with 11 throws; (c) `isUnlocked` for `{ place: 'sloedla' }` and `{ fossil: 'amber' }` against `bookState` of a save that has them (`createSave(null)`, `addPlace`, `addHalsFound`); (d) the real `cards.json` has the seven dinosaur ids in that order and `group: 'dinosaur'`.
- [ ] **Step 2: Run** `node --import ./remake/tests/setup.mjs --test remake/tests/cards.test.mjs` — expected FAIL.
- [ ] **Step 3: Implement** the cards.js changes, `checkMedia`'s picture check, and the data in `cards.json` and `media-manifest.json`.
- [ ] **Step 4: Run** `cards.test.mjs` and `media.test.mjs` — expected PASS. Commit: `Book data: card groups, teasers, place and fossil unlocks, ten pages`.

### Task 2: The tabs, the dinosaurs page, hidden games, chapter 2's end

**Files:**
- Modify: `remake/engine/book/book.js` (CRLF), `remake/engine/book/animals-page.js`, `remake/engine/scene/journal.js`, `remake/book.css`, `remake/chapters/kafli2.js`, `remake/book-lab.html`
- Test: `remake/tests/book.test.mjs`, `remake/tests/journal.test.mjs`, `remake/tests/kafli2.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`group`, `say`, `picture`, `bookState`).
- Produces:
  - `TABS = ['dinosaurs', 'animals', 'games', 'map', 'fossils']`, `LABELS = { dinosaurs: 'Risaeðlur', animals: 'Dýrin', games: 'Leikir', map: 'Kortið', fossils: 'Safnið' }`. The Stjörnur leaf and its star tiles go.
  - `createAnimalsPage(doc, roots, { cards, media, save, audio, win, onOpenCard, findMe = null })`: uses `bookState(save)`; the tile picture is `card.picture`; a found teaser's tap marks it seen, nods and calls `audio.narrate(card.say)` (no card opens); an unfound tile narrates `findMe ?? card.findMe`.
  - The Dýrin page gets only `group: 'animal'` cards; the Risaeðlur leaf (one spread, four tiles left, three right) gets the dinosaur cards with `findMe: 'book_mosi_later'`.
  - `book.open(tab, by, { find = null, nod = null })`: `nod` is a card id whose tile on the shown page nods once the book has grown.
  - `journal.open(tab = 'dinosaurs', { nod } = {})`.
  - Leikir: the Eitt! slot is hidden until `k1_kambedla` is in the stars; the Háls og hali slot is hidden until `halsOpen(save)`; Litla Yatzy always shows.
  - The Risaeðlur ribbon's icon is the Mosi render thumbnail (`assets/book/images/mosi-render-thumb.webp`) in an `<img class="book-icon ribbon-pic" alt="">`; its colour `--book-orange`.
  - `kafli2.js` end: `s.journal.open('dinosaurs', { nod: 'thorsedla' })` in place of `open('stars')`; the turn to `'map'` after `TO_THE_MAP` stays.
  - `book-lab.html`: `?state=dinosaurs` opens the book on Risaeðlur; `stars` goes.

- [ ] **Step 1: Write the failing tests** in `book.test.mjs`: (a) the ribbons are the five above, in order, and there is no Stjörnur leaf; (b) with a save holding `k1_kambedla` and the place `sloedla`, the Risaeðlur page has seven tiles where mosi, kambedla, sloedla are found, the others unfound; a tap on sloedla narrates `k2_mosi_map_sloedla` and opens no card; (c) the Eitt! slot is hidden with no stars and shows with `k1_kambedla`.
- [ ] **Step 2: Run** `book.test.mjs` — expected FAIL.
- [ ] **Step 3: Implement** the book.js, animals-page.js, journal.js, book.css, kafli2.js and book-lab.html changes; update the existing tests in `book.test.mjs`, `journal.test.mjs` and `kafli2.test.mjs` that assumed the Stjörnur page.
- [ ] **Step 4: Run** the whole remake suite — expected all green. Commit: `Book: Risaeðlur tab in place of Stjörnur, games appear when open, chapter 2 ends on the dinosaurs`.

### Task 3: Safnið — new fossils, the collection's celebration, fossil cards

**Files:**
- Create: `remake/engine/book/museum-page.js`
- Modify: `remake/engine/book/book.js` (CRLF: the fossil code moves out), `remake/book.css`
- Test: `remake/tests/book.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`group: 'fossil'`, `{ fossil }` unlock, `bookState`), Task 2 (tabs).
- Produces: `createMuseumPage(leaf, { save, audio, win, cards, onOpenCard })` → `{ render(), hasNew(), celebrate() }`, where `leaf` is book.js's `{ el, pages, tiles }` for `fossils`.
  - The eight stickers as today (`FOSSIL_KINDS`, `FOSSIL_ART`, `FOSSIL_HUES`, title *Steingervingasafn*, "n af 8").
  - A found fossil whose `fossil:<kind>` is not in `seen` has class `new` and a `.badge-new` "Nýtt!". A tap on a found fossil adds `fossil:<kind>` to `seen`; if a `group: 'fossil'` card unlocks with `{ fossil: kind }`, `onOpenCard(card, rect)` opens it in the card viewer; otherwise today's behaviour (narrate `hals_fossil_<kind>`, its name over it, sparkle). An unfound one wiggles.
  - `hasNew()`: any found fossil unseen. book.js shows a small `.ribbon-new` "Nýtt!" on the Safnið ribbon while it is true (refreshed in `render()`).
  - `celebrate()`: when all eight are found and `seen` lacks `fossils-all`: `audio.narrate('book_mosi_fossils_all')`, a sparkle on each sticker, `audio.sfx('celebrate')`, and `addSeen('fossils-all')`. book.js calls it when the child's book shows Safnið (open by the child on it, or a ribbon turn to it).

- [ ] **Step 1: Write the failing tests** in `book.test.mjs`: (a) a fossil found and unseen wears "Nýtt!", the Safnið ribbon shows its dot, a tap clears both; (b) with all eight found, turning to Safnið narrates `book_mosi_fossils_all` once, and a second turn does not.
- [ ] **Step 2: Run** `book.test.mjs` — expected FAIL.
- [ ] **Step 3: Implement** `museum-page.js`, move the fossil code out of book.js and wire it, add the CSS for the sticker badge and the ribbon dot.
- [ ] **Step 4: Run** the whole remake suite — expected all green. Commit: `Safnið: new fossils wear Nýtt!, the full collection is celebrated, fossil cards open`.

### Task 4: The 3D page

**Files:**
- Create: `remake/engine/book/skeleton-view.js`
- Modify: `remake/engine/book/card-viewer.js`, `remake/book.css`, `remake/book-lab.html`
- Test: `remake/tests/book.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`page.model`).
- Produces: `createSkeletonView(doc, { win = globalThis.window, loadModel = null })` → `{ mount(container), show(src) → Promise<boolean>, hide(), dispose() }`.
  - A transparent canvas (`.card-model`) laid over the card's photo; its own `THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })` made in try/catch (failure: `show` resolves false), pixel ratio at most 1.5, a perspective camera (fov 30) framing the model's bounding sphere, a hemisphere light and one directional light, the model's own materials.
  - `loadModel(src)` defaults to `new GLTFLoader().loadAsync(src)` (import from `../../../dist/vendor/GLTFLoader.js`, as `world/forest/butterflies.js` does); a loaded model is kept per src for the page's life.
  - It turns slowly by itself (0.25 rad/s) until the first touch, never with less motion; one finger turns it (0.008 rad/px about the vertical, the tilt kept within ±35°), two fingers pinch 1 to 3 times; a finger at rest moves nothing (as `zoom.js` counts fingers). It draws only between `show` and `hide`.
  - card-viewer: on a page with `model`, the picture shows first and the canvas takes its place once `show` resolves true; on failure the picture stays. Turning the page or closing the card calls `hide()`. On such a page a swipe does not flip and a tap on the picture does not zoom.
  - `book-lab.html?card=<id>&page=<n>&model=<path>` puts `model` on that page for a look (for example `model=assets/characters/mosi.glb`).

- [ ] **Step 1: Write the failing test** in `book.test.mjs`: a card whose second page has `model` (in Node there is no WebGL) shows that page's picture, reads its line, and the arrows still flip to the third page.
- [ ] **Step 2: Run** `book.test.mjs` — expected FAIL.
- [ ] **Step 3: Implement** `skeleton-view.js`, the card-viewer changes, the CSS and the lab parameter.
- [ ] **Step 4: Run** the whole remake suite — expected all green. Open the lab page with `?card=mosi&page=2&model=assets/characters/mosi.glb` in a browser and check that the model shows, turns, pinches and the arrows flip. Commit: `Cards: a 3D page that a finger turns and pinches`.

### Task 5: The voices

**Files:**
- Modify: `remake/assets/audio/book/lines-source.json`, `remake/assets/audio/kafli1/lines-source.json`, the MP3s, `remake/assets/audio/lines.json`, `remake/assets/audio/voices-made.json`

**Interfaces:**
- Produces the lines Tasks 2 and 3 play:
  - book set, speaker `mosi`: `book_mosi_later` — "Hana hittum við seinna!"; `book_mosi_fossils_all` — "Vá! Þú fannst alla átta steingervingana. Safnið er fullt!"
  - kafli1 set, `k1_mosi_book` new text: "Sjáðu! Fiðrildið flaug beint í Landkönnuðabókina þína. Þangað fara öll dýrin sem við finnum og risaeðlurnar sem við hittum. Í henni er líka kort af skóginum, og leikir sem við lærum á leiðinni."

- [ ] **Step 1: Edit** the two `lines-source.json` files.
- [ ] **Step 2: Dry run** `node remake/tools/voice-lines.mjs --dry --set book --only book_mosi_later,book_mosi_fossils_all` and `--dry --set kafli1 --only k1_mosi_book` — check the requests use Mosi's voice and the pronunciation standard.
- [ ] **Step 3: Record** the same two commands without `--dry` (`ELEVENLABS_API_KEY` is in the environment; never print it), then `node remake/tools/audio-lines.mjs` to renew `lines.json`.
- [ ] **Step 4: Run** `node remake/tools/voice-lines.mjs --plan` (expect none of these three listed) and the remake suite. Commit the MP3s, `lines.json`, `voices-made.json` and the sources: `Voices: Mosi's two book lines and the chapter 1 book line without the stars`.

### Task 6: Check and show (the controller)

- [ ] **Step 1:** Serve the worktree (`node remake/tools/serve.mjs --port 4212`) and look at `book-lab.html?state=dinosaurs`, `?state=animals`, the Leikir page with and without `?found=all`, Safnið, and the 3D lab page, at 1280×800 and at 820×1180 upright.
- [ ] **Step 2:** Run the remake suite once more; send the owner the captures and the lab link and ask.
