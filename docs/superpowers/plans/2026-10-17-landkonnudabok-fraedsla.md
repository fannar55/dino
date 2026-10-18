# Education in Egill's Explorer's Journal (part 2): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the journal into a living, game-like book with seven education cards (five chapter-1 critters, Mosi and Kambeðla). Each card has 3–5 short pages, read aloud by a calm narrator, with real licensed images and illustrations. Everything in the book reacts to a touch with motion and sound.

**Architecture:**
- The book is DOM and CSS over the paused game, like today's journal page. It is split into small modules under `remake/engine/book/`: touch effects, shell, animals page, card viewer, zoom and the book's sound.
- Content is data (`remake/assets/book/cards.json`, `media-manifest.json`, the narrator's lines), so later chapters only add data.
- Narration plays through a second instance of the chapter's voice system (`engine/scene/voice.js`). The book's sound effects play through a second instance of the game's effects (`engine/audio/sfx.js`) with the book's own sounds. Neither instance is in the game's hold, so both sound while the game stands still behind the child's book.

**Tech Stack:**
- plain ES modules, no build step;
- DOM and CSS (transform and opacity only), Web Audio, and `<audio>` for recordings;
- the ElevenLabs voice tool (`remake/tools/voice-lines.mjs`);
- `node --test` with `remake/tests/fake-dom.mjs` (FakeDocument, `pointerEvent`) and `fake-audio.mjs` (FakeContext, FakeMediaElement, `pitchesOf`, `centsFromKey`);
- `remake/tools/capture.mjs` (`--page`, `--shot`, `--size`, `--perf N` reporting `p95ms`).

**Spec:** `docs/superpowers/specs/2026-10-17-landkonnudabok-fraedsla-design.md`. It is in Icelandic, was approved by the owner on 2026-10-17, and is mirrored in the plan doc's tab "Hluti 2: Fræðsla í bók".

## Global Constraints

**Audience:** a five-year-old on an Android tablet, in Icelandic. There are no fail states, and nothing in the book can strand the child.

**Look:**
- The book is big and game-like, not a web page:
  - a full-screen illustrated two-page spread, with paper texture, a stitched spine, hand-drawn frames and soft shadows;
  - ribbon tabs, sticker or taped-photo tiles, chunky raised buttons and big drawn arrows;
  - few words, in a big size.
- **Touch targets:** every control is at least 80 px. `--book-target: 88px` sets it. The ⓘ button looks small (spec 3.3), but its hit area is the full target. For the book, this replaces STYLE.md section 10's 64 px, and Task 13 records it there.
- **Colours** come from STYLE.md section 10:

  | paper | card | ink | soft ink | orange | teal | star gold | green |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `#f6efdf` | `#fffaf0` | `#3b2f25` | `#6b5a4a` | `#e07a3f` | `#2f8f86` | `#f2b630` | `#6fae4f` |

  Animal hues come from STYLE.md section 3.
- **Font (ruling).** STYLE.md section 10 asks for one rounded typeface bundled locally with all Icelandic letters. The game has none yet: `remake/style.css` uses `system-ui`. The book reads `--book-font`, which Task 1 sets to the old game's stack: `ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`.
  - With the mockup, the controller asks the owner whether to download Nunito (SIL Open Font License 1.1): one woff2 that covers Latin-1, from the Google Fonts repository, with its exact size stated when asking.
  - With a yes, it goes in `remake/assets/fonts/` with its `OFL.txt`, and `--book-font` names it first.
  - Whether the chapter's captions and buttons take the same font is asked at the same time.

**Touch, as chapter 1 plays it (STYLE.md section 10, "Interaction"):**
- A press let go within 12 px is a tap, however long it was held.
- Every finger counts on its own, so a thumb resting on the glass stops nothing. The first finger to move 12 px drags.
- The book's root has `touch-action: none`.
- Everything answers a touch with a press, a sparkle and a sound.

**Motion:** CSS transform and opacity only. It holds 60 fps on the tablet and honours `prefers-reduced-motion`. A picture tapped on a page zooms smoothly to full screen.

**Sound:**
- The book's effects are tuned to `theme.json`'s `key`, like the chapter's plate and star sounds, and they dip while the narrator speaks.
- Neither the book's voice nor its effects are in main.js's `createHold`. Both are muted wherever main.js mutes the voice, the music and the effects: captures, review shots and the seek.
- **Music (ruling).** The game's music follows the game clock, so it is held whenever the child holds the book, and the narrator only reads in a book the child holds (Task 6). The music is therefore silent under every reading, which meets spec 3.3's "the music lowers". The book's voice does not drive the music's duck.

**Narrator:**
- A separate, calm voice that the owner chooses by audition.
- The owner approves every text before it is recorded, and the takes they pick get `kept`.

**Images:**
- **Real images:** open licences only (CC BY, CC BY-SA, CC0, public domain).
  - Each one has source, author, licence, licence URL, modifications and sha256 in the manifest.
  - JPEG or WebP, at most 1024 px on the long side, with a thumbnail.
- **Our own illustrations:** game renders of Mosi and Kambeðla, and the owner's drawings of the critters.

**Downloads:**
- No file is downloaded from the internet without the owner's explicit OK, given per file (name, source, size).
- Files already in the repository need no download: `dist/assets/encyclopedia/` and its `media-manifest.json`.
- `dist/` is read, never written. Copies go under `remake/`.

**Facts:** every fact has a recorded source (museum pages or peer-reviewed papers). Sources are kept with the data and are never shown to children.

**Save compatibility:** older saves without the new fields still load, and a storage failure never stops the book (the `engine/save.js` pattern).

**Line endings:** `remake/README.md`, `remake/STYLE.md` and `remake/main.js` are CRLF. Every other touched file is LF (see `git ls-files --eol`).

**Never:**
- touch `design/` or `dist/`;
- use bare `git stash`.

**Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**ElevenLabs:** the key is read only from `ELEVENLABS_API_KEY` and is never printed, logged or written. The controller, not an implementer, runs every command that calls ElevenLabs.

**Branch:** `bok` builds on `kafli1`. Before Task 1, and again whenever kafli1 moves, the controller merges kafli1 into bok. This is a local merge on this working branch.

**Owner gates.** The controller asks; tasks do not wait in a loop.

| Gate | What waits on it |
| --- | --- |
| Task 1 mockup, and the font question | the look of Tasks 6–10 |
| Task 2 voice pick | Task 12's recordings |
| Task 11 texts | Task 12's recordings |
| Downloads in Task 11 | each file, approved one by one |
| The takes in Task 12 | installing them with `kept` |
| The owner's drawings | nothing: they arrive asynchronously, with placeholders until then |

Tasks 3–5 are logic first, so they may run while the owner looks at the mockup. Task 5's press and spark styles follow any change the owner asks for. Task 6 and later wait for the approval.

## Review Focus

1. **Fast repeated taps.** A double tap on a tile, an arrow, the zoomed picture or the close button during an animation must never:
   - open two cards;
   - skip two pages;
   - leave a half-open layer.

   Every transition is interruptible and idempotent. Tests: Task 8 `rapid taps never skip or stack`; Task 7 `double tap opens one card`.
2. **Narration never outlives what it reads.** Flipping, closing the card or the book, opening another card and zooming each stop or keep narration predictably. Nothing plays after the book is shut. Tests: Task 8 `narration stops on flip and close`; Task 6 `closing the book stops narration`.
3. **A missing or broken asset.** An image that fails to load, or a page whose line is not in lines.json:
   - shows a soft placeholder, or stays silent;
   - never throws;
   - leaves the card working.

   Test: Task 8 `missing image and missing line degrade quietly`.
4. **Screen shapes.** At 820×1180 portrait, 1280×800 and 2400×1000, the spread lays out with nothing off-screen, and every control stays at least 80 px. Tests: Task 6 `every control in book.css is at least 80 px`; Task 13's measured captures at the three sizes.
5. **An old or blocked save.** A save without `seen`, or a storage that throws, still opens the book. "Nýtt!" then shows on unlocked cards until each is opened. Test: Task 3 `old saves and blocked storage`.

---

### Task 1: The look, a mockup the owner approves

**Files:**
- Create: `remake/book.css`
- Create: `remake/book-lab.html`, a dev page never linked from the game. Static markup here; Task 6 makes it build the real book.
- Create: `remake/assets/book/lab/<card>.svg`, soft, hand-drawn-looking placeholder pictures, one per card. The lab may also show `../dist/assets/encyclopedia/` images in place, read only.

**Interfaces:**
- Produces the structure and classes that later tasks render into:

  | Element | Class | Parts or states |
  | --- | --- | --- |
  | Full-screen spread | `.book` | `.book-page.left`, `.book-page.right`, a stitched `.book-spine`, and `.book-close` |
  | Ribbon tabs | `.book-ribbons` | each tab a `.ribbon[data-tab]` |
  | Sticker tile | `.tile` | `.found`, `.new` (with a `.badge-new` "Nýtt!") and `.unfound` |
  | Card | `.card` | covers nearly the whole screen; `.card-image`, `.card-text`, `.card-arrow.prev`, `.card-arrow.next`, `.card-dots`, `.card-replay`, `.card-info`, `.card-back` |
  | Zoom layer | `.zoom` | `.zoom-close` |
  | Raised button | `.chunky` | |

- CSS variables: `--book-target: 88px`, `--book-font`, and the palette.

- [ ] **Step 1:** Build `book-lab.html` from static markup and `book.css`. The `?state=` parameter shows one of three states:
  - `state=book`: the open book on the Dýrin tab, with seven tiles (two found, one new, four unfound);
  - `state=card`: a card on its first page;
  - `state=zoom`: a zoomed picture.

  Light CSS animations show the idle life: tiles breathing, the new badge wobbling, stars twinkling. The page sets `window.__demoReady = true` once drawn, which is capture.mjs's default ready check.
- [ ] **Step 2:** Capture at 1280×800:

  ```
  node remake/tools/capture.mjs --page remake/book-lab.html --out qa/remake/book/mockup/1280x800 --size 1280x800 --shot book="state=book" --shot card="state=card" --shot zoom="state=zoom"
  ```

  Repeat at 820x1180 and 2400x1000. Expected: nine PNGs, and report.json files with no console errors.
- [ ] **Step 3:** Commit: `git commit -m "Draw the living book's look for the owner to approve"`.
- [ ] **Step 4 (controller):** Show the owner the captures and the lab page, and ask the font question (Global Constraints). Their changes go into `book.css` in a follow-up commit before Task 6.

### Task 2: The narrator's voice: the book's line set, the audition and the drawing briefs

**Files:**
- Modify: `remake/tools/audio-lines.mjs` (line sets)
- Modify: `remake/tools/voice-lines.mjs` (`--set`, and the narrator's candidates)
- Create: `remake/assets/audio/book/lines-source.json`
- Create: `docs/superpowers/specs/2026-10-17-teikningar-smadyra.md` (in Icelandic: the five drawing briefs and one shared style brief)
- Test: `remake/tests/voice-lines.test.mjs`

**Interfaces:**
- Produces, in `audio-lines.mjs`:
  - `export const SETS = { kafli1: 'remake/assets/audio/kafli1', book: 'remake/assets/audio/book' }`. `REMAKE_AUDIO` stays, equal to `SETS.kafli1`.
  - `remakeLines(root, only = null, set = 'kafli1')`: each entry's src is `assets/audio/<set>/<id>.mp3`, and a line with no MP3 is skipped, as today.
  - `buildLines(root)`: the game's lines, then kafli1's, then the book's.
  - `updateLines(root, ids, set = 'kafli1')`.
- Produces, in `voice-lines.mjs`:
  - `parseArgs` accepts `--set kafli1|book`, defaults to `kafli1`, refuses any other value, and returns `{ only, audition, set }`.
  - `readLines(root, set = 'kafli1')`.
  - `generate({ root, key, fetch, only, set = 'kafli1', log })` reads, writes and registers within that set.
  - A `CANDIDATES` entry may name its set. `audition` reads the entry's line from that set:

    ```
    narrator: { set: 'book', line: 'book_kalligrammatid_1', voices: [...] }
    ```

  - There is no `narrator` entry in `voices.json` until the owner picks. `generate` already refuses a speaker with no voice before any request.
- `remake/assets/audio/book/lines-source.json` holds two lines, both with speaker `narrator`:

  | id | text |
  | --- | --- |
  | `book_kalligrammatid_1` | "Þetta lítur út eins og fiðrildi. En það er ekki fiðrildi!" |
  | `book_find_me` | "Finndu mig í skóginum!" |

  The first is a draft of the card's first page. Task 11 replaces its text with the approved one, under the same id.
- **Narrator candidates:**
  - 4–5 calm voices from the shared library that read Icelandic;
  - none of them one of `voices.json`'s three (mosi, kambedla, egill);
  - the kambedla candidates the owner passed over (Ingibjorg, Katrin, Sigrun) may be among them.

- [ ] **Step 1:** Write the failing tests.
  - `parseArgs takes a line set and the narrator's audition`:
    - `--set book` gives `set: 'book'`, and the default is `'kafli1'`;
    - `--set kafli2` throws;
    - `['--audition', 'narrator']` is accepted.
  - `the book's lines live in their own folder`, in a temporary root:
    - `readLines(root, 'book')` reads `book/lines-source.json`;
    - `remakeLines(root, null, 'book')` gives `book_find_me` the src `assets/audio/book/book_find_me.mp3` when its MP3 is there, and leaves out a line whose MP3 is not;
    - `buildLines` holds both sets.
  - `the narrator's sample line is in the book set`: `CANDIDATES.narrator.set === 'book'`, and its line is in the real book source.
- [ ] **Step 2:** Run `node --import ./remake/tests/setup.mjs --test remake/tests/voice-lines.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement the sets, the argument, the candidates and the book source.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run `node remake/tools/audio-lines.mjs`. Expected: `git diff remake/assets/audio/lines.json` shows no change to any existing entry.
- [ ] **Step 5:** Write the drawing briefs.
  - One shared style paragraph: storybook, soft and chunky, a matte painted look, the STYLE.md palette, a plain light background, one animal in a front three-quarter view.
  - Five animal briefs:

    | Animal | Brief |
    | --- | --- |
    | Kalligrammatid | a lacewing relative with big eyespots on broad wings and a long proboscis, from the published reconstructions |
    | Beetle | a Jurassic beetle |
    | Frog | a Jurassic frog |
    | Snail | a land snail |
    | Bird | an early bird modelled on Archaeopteryx: teeth, clawed wings, a long bony tail, feathers |

  - Each brief is in Icelandic and names the source behind its features.
- [ ] **Step 6:** Commit: `git commit -m "Give the book its own line set, audition calm narrator voices, and brief the owner's critter drawings"`.
- [ ] **Step 7 (controller):**
  - Run `node remake/tools/voice-lines.mjs --audition narrator`, and write a listening page at `qa/remake/voices/narrator/index.html` in the style of `qa/remake/voices/pron-fix/index.html`.
  - The owner picks a voice, which goes in `voices.json` as `narrator`.
  - The owner starts the drawings.

### Task 3: Cards, unlocks, the seen list and the media manifest

**Files:**
- Create: `remake/engine/book/cards.js`
- Create: `remake/engine/book/media.js`
- Create: `remake/assets/book/cards.json` (seven cards with placeholder pages, so the engine can be built before the texts)
- Create: `remake/assets/book/media-manifest.json` (entries for the lab's placeholder pictures)
- Modify: `remake/engine/save.js`
- Test: `remake/tests/cards.test.mjs`, `remake/tests/media.test.mjs`, and the save's tests in `remake/tests/journal.test.mjs`

**Interfaces:**
- Produces, in `cards.js`:
  - `export const PAGE_MIN = 3, PAGE_MAX = 5, PLACEHOLDER = 'placeholder';`
  - **Shapes.** A Card is `{ id, name, order, unlock, pages }`. Its tile shows its first page's picture (the thumbnail), so the tile's picture becomes page one's picture (spec 3.3).
    - `unlock` is `{ start: true } | { found: string } | { star: string }`.
    - A page is `{ image, text, audio, sources }`. `sources` is a non-empty list of source strings (a URL or a reference). A placeholder page's only source is `PLACEHOLDER`.
  - `export function parseCards(data): Card[]`. It throws an Error that names the card or page on:
    - a missing field;
    - fewer than 3 or more than 5 pages;
    - a duplicate id;
    - an unknown unlock;
    - a page with no sources.
  - `export function isUnlocked(card, state): boolean`, where `state` is `save.get()`.
  - `export function isNew(card, state): boolean`: unlocked and not in `state.seen`.
  - **The seven ids,** with their unlocks. These are the ids chapter 1 already passes to `s.found` and `s.star` (`remake/chapters/kafli1.js`).

    | id | unlock | placeholder name | order |
    | --- | --- | --- | --- |
    | `mosi` | `{start:true}` | Mosi | 1 |
    | `kambedla` | `{star:'k1_kambedla'}` | Kambeðla | 2 |
    | `kalligrammatid` | `{found:'butterfly'}` | Fiðrildi | 3 |
    | `beetle` | `{found:'beetle'}` | Bjalla | 4 |
    | `frog` | `{found:'frog'}` | Froskur | 5 |
    | `snail` | `{found:'snail'}` | Snigill | 6 |
    | `birds` | `{found:'birds'}` | Fuglar | 7 |

    The placeholder names are today's journal names.
  - Audio ids are `book_<card>_<n>`, with n from 1.
- Produces, in `media.js`:
  - `export function parseManifest(data): Map<string, Media>`.
  - **Media shape:** `{ id, src, thumb, kind, credit, license, licenseUrl, source, modifications, sha256, width, height }`, where `kind` is one of `'fossil'|'photo'|'illustration'|'render'|'placeholder'`.
  - **Own images.** Our renders, the owner's drawings and the placeholders carry `license: 'own'`, and their `source` names the render command or the owner. Every other image is external.
  - `export function checkMedia(manifest, cards, { exists, size }): string[]` returns one problem string per issue:
    - an image id a card uses that the manifest lacks;
    - an external image without credit, licence, licence URL, source or sha256;
    - a licence outside {CC BY, CC BY-SA, CC0, public domain, own};
    - a missing file or thumbnail;
    - a long side over 1024 px;
    - a format other than JPEG or WebP (placeholders may be SVG);
    - a card whose first page's picture is not an illustration, a render or a placeholder. That picture is also the tile, which shows the animal's drawing (spec 3.2).
- Produces, in `save.js`: `addSeen(id): boolean`. `get()` returns `{ stars, findings, seen }`, and an older save reads as `seen: []`.

- [ ] **Step 1:** Write the failing tests.
  - `parseCards accepts the seven cards and refuses broken ones`. Each of these throws a message naming it:
    - a card with 2 pages or with 6 pages;
    - a duplicate id;
    - `unlock: {found: 3}`;
    - a page with `sources: []`.
  - `unlocks follow finds, the star and the start`:
    - from the empty state, only `mosi` is unlocked;
    - after `findings: ['butterfly']`, `kalligrammatid` is too;
    - after `stars: ['k1_kambedla']`, `kambedla` is too.
  - `new until seen`: `isNew` is true for an unlocked, unseen card and false after `addSeen`.
  - `checkMedia names every problem`. Each of these gives exactly one problem: a missing licence, an unknown licence, a missing file, a 2048 px image, a PNG photo, and a fossil on a card's first page.
  - **Review Focus 5**, `old saves and blocked storage`:
    - a stored `{stars, findings}` reads with `seen: []`;
    - a throwing storage still returns the lists, and keeps `addSeen` in memory.
- [ ] **Step 2:** Run `node --import ./remake/tests/setup.mjs --test remake/tests/cards.test.mjs remake/tests/media.test.mjs remake/tests/journal.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement `cards.js`, `media.js` and the save change. Write `cards.json` with the seven cards: three placeholder pages each, with the lab pictures, the audio ids and `sources: ["placeholder"]`. Write the manifest for the lab pictures.
- [ ] **Step 4:** Run the tests. Expected: PASS. Add `the shipped manifest is complete` to `media.test.mjs`: `checkMedia` on the real manifest and cards, with real file checks, returns no problems.
- [ ] **Step 5:** Commit: `git commit -m "Describe the book's cards, their unlocks and their images as data"`.

### Task 4: The book's sound: a narrator and effects that sound while the game is held

**Files:**
- Create: `remake/engine/book/book-audio.js`
- Create: `remake/engine/book/book-sounds.js`
- Modify: `remake/engine/audio/sfx.js` (it accepts more sounds)
- Modify: `remake/engine/audio/music.js` (export `DUCK_DB`)
- Test: `remake/tests/book-audio.test.mjs`

**Interfaces:**
- Consumes:
  - `createVoice` from `engine/scene/voice.js`: `play(src)`, `stop()`, `muted`, `onSpeaking`;
  - `createSfx` from `engine/audio/sfx.js`;
  - `Handle` and `DONE` from `engine/handle.js`;
  - lines.json entries `{ src, duration }`;
  - `theme.json`'s `key`.
- Produces, in `sfx.js`: `createSfx({ context, theme, output, random, sounds = null, gaps = {} })`.
  - `sounds({ tone, noise, bell, key })` returns more named sounds.
  - `play(name)` plays them like the game's own, with `gaps[name]` as their least gap.
- Produces, in `book-sounds.js`:
  - `export const BOOK_SFX = ['open', 'close', 'turn', 'tap', 'tile', 'zoomIn', 'zoomOut', 'wiggle', 'newAnimal', 'celebrate', 'info'];`
  - `export const BOOK_GAPS` (at least `tap`, `turn` and `wiggle`).
  - `export function bookSounds({ tone, noise, bell, key })`, with one small, bright sound per name, in the key:

    | Sound | What it is |
    | --- | --- |
    | `open`, `close` | a soft paper whoosh with a rising or falling bell |
    | `turn` | a paper rustle |
    | `tap` | a short wooden tick on a key note |
    | `tile` | a pop up the key |
    | `zoomIn`, `zoomOut` | a rising or falling whoosh |
    | `wiggle` | a little wobble |
    | `newAnimal` | a bright three-note bell |
    | `celebrate` | a short rising arpeggio with a shimmer |
    | `info` | one soft bell |

- Produces, in `book-audio.js`: `export function createBookAudio({ context, output, theme, lines }): { narrate(lineId): Handle, stop(), sfx(name): boolean, muted }`.
  - **narrate** plays `lines[lineId].src` through the book's own `createVoice()`. Its Handle:
    - is done when the recording ends (the element's `ended`);
    - is cancelled by `stop()`, by the next `narrate`, or by muting.

    A line not in lines.json gives `DONE`, and warns once per id: `[book] no recording for <id>`.
  - **sfx** plays through a second `createSfx` with `bookSounds` and `BOOK_GAPS`. It is routed into a gain node of its own, which dips by `DUCK_DB` while the book's voice speaks (its `onSpeaking`).

- [ ] **Step 1:** Write the failing tests, with `fake-audio.mjs`:
  - `narration plays the line's recording, and a new line replaces it`: the first Handle is cancelled;
  - `a line with no recording is done at once and warns once`;
  - `stop and muting end the narration`;
  - `book sounds are in the theme's key and keep their gaps`, using `pitchesOf` and `centsFromKey`;
  - `every BOOK_SFX name plays`;
  - `book sounds dip while the narrator speaks`;
  - `the book sounds while the game's sound is held`: with the game's parts in a `createHold` held for `'book'`, the book's effects and narration still play.
- [ ] **Step 2:** Run `node --import ./remake/tests/setup.mjs --test remake/tests/book-audio.test.mjs remake/tests/sfx.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement the `sounds` option, the book's sounds and `book-audio.js`.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS, with the game's own sounds unchanged (`sfx.test.mjs`).
- [ ] **Step 5:** Commit: `git commit -m "Give the book a narrator and its own sounds, heard while the game stands still"`.

### Task 5: Touch: one finger at a time, with a squash, a sparkle and a sound

**Files:**
- Create: `remake/engine/book/fx.js`
- Test: `remake/tests/book-fx.test.mjs`

**Interfaces:**
- Produces:
  - `export const TAP_SLOP_PX = 12;`, which the card viewer and the zoom use too.
  - `export function pressable(el, { audio, sound = 'tap', onTap, win }): () => void` (returns dispose).
    - A press starts on `pointerdown` on `el`: it adds class `pressed`, a squash.
    - A `pointerup` of the same pointer id within `TAP_SLOP_PX` of its start is a tap. The class comes off with a spring back, and it calls `sparkle(el)`, `audio.sfx(sound)` and `onTap(event)`.
    - A pointer that moves `TAP_SLOP_PX` is not a tap.
    - Each pointer id counts alone, so a still finger elsewhere does not stop another finger's tap.
    - `pointercancel` clears the press.
  - `export function sparkle(el, count = 8)`: `count` spark elements burst around `el`, fade out by CSS and are removed.
  - `export function reducedMotion(win): boolean`: `win.matchMedia('(prefers-reduced-motion: reduce)').matches`, and false when that is unavailable. With it, the press and the sparkle are a short fade instead of the squash and the burst. The sound stays the same.

- [ ] **Step 1:** Write the failing tests, with FakeDocument and `pointerEvent`:
  - `a press let go within 12 px is a tap, with its sound and a sparkle`;
  - `a finger that moves 12 px is not a tap`;
  - `a resting thumb does not stop another finger's tap`: pointer 1 stays down and still; pointer 2 presses and lets go on `el`; that is one tap;
  - `a press shows pressed and springs back on release or cancel`;
  - `reduced motion swaps the squash and burst for a fade and keeps the sound`;
  - `dispose removes the listeners`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `fx.js`, and the press and spark styles in `book.css`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Make every touch in the book a tap of its own finger, with a squash, a sparkle and a sound"`.

### Task 6: The book's shell, wired into the journal

**Files:**
- Create: `remake/engine/book/book.js`
- Modify: `remake/engine/scene/journal.js` (its page becomes the book, and finds fly a picture into the button)
- Modify: `remake/engine/scene/scene.js` (`s.found(id, from)`)
- Modify: `remake/chapters/kafli1.js` (the tap handlers that call `s.found` pass the tap event)
- Modify: `remake/index.html` (the book's root, and a link to `book.css`; the old `#journal-page` markup goes)
- Modify: `remake/style.css` (the old page's rules go; the button, the slots and the flights stay)
- Modify: `remake/main.js` (CRLF)
- Modify: `remake/book-lab.html`: it now builds the real book over the placeholder cards.
  - `?state=animals|card|zoom` opens a state for captures.
  - `?demo=1` loops open, card, flip and zoom for Task 10's smoothness check.
- Modify: `remake/README.md` (CRLF: the `s.found` row in the call table)
- Test: `remake/tests/book.test.mjs`, `remake/tests/journal.test.mjs`, `remake/tests/kafli1.test.mjs`

**Interfaces:**
- Consumes:
  - Task 3's `parseCards`, `isUnlocked`, `isNew` and `parseManifest`;
  - Task 4's `createBookAudio`;
  - Task 5's `pressable`;
  - the journal's `onPause`.
- Produces, in `book.js`: `export function createBook(doc, { cards, media, save, audio, onPause, win }): { open(tab, by), close(), isOpen, tab, refresh(), pictureOf(findId) }`.
  - `tab` is `'stars'` or `'animals'`. `'games'` comes with part 3, and there is no ribbon for it yet.
  - **Pausing:**
    - `open(tab, 'child')` calls `onPause(true)`, and closing calls `onPause(false)`.
    - `open(tab, 'script')` pauses nothing.
    - The child's first tap inside a book that code opened, other than its close, makes the book the child's: `onPause(true)` then, and `onPause(false)` when it is shut. So the narrator never talks over a chapter line or the music.
  - **Opening and closing:** the book grows out of the journal button into the full spread with `open`, and closing shrinks it back into the button with `close`. Closing also stops narration, the zoom and the card.
  - **Pages:**
    - The ribbons switch pages with a page turn and `turn`.
    - The Stjörnur page shows today's six star cards, earned or not.
    - `pictureOf(findId)` is the thumbnail of the card that find unlocks, or null.
  - Captions stay above the book (STYLE.md section 10).
- Produces, in `journal.js`: `createJournal(doc, save, { onPause, book })`.
  - The button calls `book.open('animals', 'child')`, `open()` calls `book.open('stars', 'script')`, and `close()` calls `book.close()`.
  - `addFinding(id, from = null)` returns whether the find is new, as today.
  - A new find flies `book.pictureOf(id)` from `from` ({ x, y } in screen pixels, or the screen's centre without one) to the button.
    - The flight runs on game time like a star: `FLIGHT_SECONDS`, held in the air while the game is paused.
    - On landing, the book nods as today, `newAnimal` sounds once, and the button gets a badge until the book is next opened.
  - The old finds list and count go; the animals page replaces them.
- Produces, in `scene.js`: `s.found(id, from)` passes `from` to `journal.addFinding`. kafli1's tap handlers pass the tap event (`{ name, x, y }`).
- Produces, in `main.js`:
  - It fetches `assets/book/cards.json` and `assets/book/media-manifest.json` beside lines.json. A failed fetch warns and gives an empty Dýrin page; the Stjörnur page still works.
  - It makes `createBookAudio({ context: audio, output, theme, lines })` and mutes it wherever the voice, the music and the effects are muted.
  - It makes the book and passes it to `createJournal`.

- [ ] **Step 1:** Write the failing tests:
  - `a child's open holds the game and closing lets it go`;
  - `a book code opened holds nothing until the child taps inside it`, then `onPause(true)`, and `onPause(false)` on closing;
  - `ribbons switch pages with a turn sound`;
  - **Review Focus 2**, `closing the book stops narration`;
  - `a find flies its picture from the tap to the button, sounds once on landing, and badges the button until the book opens`;
  - `a paused game holds a find's flight in the air`;
  - **Review Focus 4**, `every control in book.css is at least 80 px`. It reads `remake/book.css`:
    - `--book-target` is at least 80px;
    - the rules for `.chunky`, `.ribbon`, `.tile`, `.card-arrow`, `.card-replay`, `.card-info`, `.card-back`, `.book-close` and `.zoom-close` set `min-width` and `min-height` to `var(--book-target)`;
  - journal and kafli1 tests updated: stars still fly into their slots, saves still persist, and a find from a tap passes its point.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the shell (with Task 1's look), the journal and scene changes, the main.js wiring and the lab's states.
- [ ] **Step 4:** Run `npm run test:remake` and `npm test`. Expected: PASS. Take the chapter's end capture. The scene ends at about 290.3 s:

  ```
  node remake/tools/capture.mjs --out qa/remake/book/end --size 1280x800 --shot end="t=291"
  ```

  Expected:
  - 0 director warnings in report.json;
  - the star lands;
  - the book opens on Stjörnur with the last caption above it.
- [ ] **Step 5:** Commit: `git commit -m "Open the journal as a living book over the paused game"`.

### Task 7: The animals page

**Files:**
- Create: `remake/engine/book/animals-page.js`
- Test: `remake/tests/animals-page.test.mjs`

**Interfaces:**
- Consumes:
  - the cards, the media and the save;
  - the audio's `sfx` and `narrate`;
  - `pressable`;
  - the shell's page root.
- Produces: `export function createAnimalsPage(doc, root, { cards, media, save, audio, onOpenCard, win }): { render(), dispose() }`.
  - Tiles go in card `order`: Mosi and Kambeðla first, then the critters. Each tile shows its first page's thumbnail and the card's name in big letters.
  - **Found:** full colour.
  - **New:** a glow and the "Nýtt!" badge.
  - **Unfound:** the same picture as a dark silhouette, with a big "?".
  - **Taps:** a found tile sounds `tile` and calls `onOpenCard(card, fromRect)`. An unfound tile wiggles with `wiggle`, the narrator says `book_find_me`, and no card opens.

- [ ] **Step 1:** Write the failing tests:
  - `tiles show found, new and unfound in card order`;
  - `an unfound tile wiggles with a sound, the narrator says find me, and no card opens`;
  - `a found tile opens its card from its rectangle and marks it seen`: `addSeen` is called, and "Nýtt!" is gone on the next render;
  - **Review Focus 1**, `double tap opens one card`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the page with Task 1's look.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Show the animals the child has found as living tiles in the book"`.

### Task 8: The card viewer

**Files:**
- Create: `remake/engine/book/card-viewer.js`
- Test: `remake/tests/card-viewer.test.mjs`

**Interfaces:**
- Consumes:
  - the media and the audio;
  - `pressable` and `TAP_SLOP_PX`;
  - the zoom: Task 9's `open(img)`, `close()` and `isOpen`, as a stub until Task 9.
- Produces: `export function createCardViewer(doc, root, { media, audio, zoom, onClose, win }): { open(card, fromRect = null), close(), next(), prev(), page, isOpen }`. The page count starts at 0.
  - **Opening:** the card covers nearly the whole screen. It grows from `fromRect`, so the tile's picture becomes page one's picture.
  - **Preloading:** every page's image is put in the card when it opens, and only the current page shows.
  - **Each page:**
    - a big picture, which zooms when tapped;
    - its text in big letters, always shown;
    - arrows at both sides;
    - dots;
    - a replay (speaker) button.

    There is no back arrow on page one. On the last page, the next arrow gives way to a chunky back-to-animals button.
  - **Narration** starts on every page shown and stops on a flip, a close, or another card. Replay reads the page again.
  - **Swipes:** the first finger to move `TAP_SLOP_PX` drags, and a 40 px sideways swipe flips. Other fingers are ignored.
  - **ⓘ:** it is shown for external images only. A tap opens a short, readable window with credit, licence and source, and plays `info`.
  - **The last page** plays `celebrate` with a sparkle.

- [ ] **Step 1:** Write the failing tests:
  - `open grows from the tile, shows page one's text and reads it`;
  - `opening a card puts every page's image in it`;
  - `arrows and swipes flip with a turn sound and read the new page`;
  - `the speaker reads the page again`;
  - **Review Focus 2**, `narration stops on flip and close`;
  - **Review Focus 1**, `rapid taps never skip or stack`: five taps on next within one transition advance one page per settled transition, and never past the last page;
  - `the last page celebrates and offers the way back`;
  - `info shows credit, licence and source for external images only`;
  - **Review Focus 3**, `missing image and missing line degrade quietly`: a placeholder picture shows, nothing throws, and the arrows still work;
  - `a resting thumb does not stop a swipe`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the viewer, and open it from the animals page in the shell.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Read each card's pages aloud, one picture and a sentence at a time"`.

### Task 9: Picture zoom

**Files:**
- Create: `remake/engine/book/zoom.js`
- Test: `remake/tests/zoom.test.mjs`

**Interfaces:**
- Produces: `export function createZoom(doc, { audio, win }): { open(img), close(), isOpen }`.
  - **Transition:** a FLIP from the picture's rectangle to full screen and back, with `zoomIn` and `zoomOut`.
  - **Pinch and drag:**
    - a pinch, with two fingers that both move, scales between 1 and 4;
    - a still finger is ignored, and the moving one pans;
    - a drag pans within the picture's bounds, so the picture never leaves the screen.
  - **Return:** a tap or the chunky close returns it. A tap during the zoom-in reverses it cleanly.

- [ ] **Step 1:** Write the failing tests:
  - `a tap zooms to full screen and back with sounds`;
  - `pinch scales between 1 and 4 and a drag stays in bounds`;
  - `a resting thumb does not turn a drag into a pinch`;
  - `a tap during the zoom-in reverses it cleanly`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the zoom with pointer events and transforms only. Wire it into the card viewer in place of the stub.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Zoom a card's picture smoothly to full screen"`.

### Task 10: Life in the still book, and smoothness

**Files:**
- Modify: `remake/book.css`
- Modify: `remake/engine/book/book.js`, `animals-page.js`, `card-viewer.js` and `zoom.js`
- Test: `remake/tests/book.test.mjs`

**Interfaces:**
- Consumes: Task 5's `pressable`, `sparkle` and `reducedMotion`.

- [ ] **Step 1:** Write the failing tests:
  - `every control in the book is pressable`: every button, ribbon, tile, arrow and close in the rendered book takes a tap through `pressable` and plays a sound;
  - `reduced motion stills the idle life and keeps the text and the sounds`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Add the idle life:
  - found tiles breathe and sparkle now and then;
  - "Nýtt!" wobbles;
  - stars twinkle on the Stjörnur page.

  It uses CSS animations of transform and opacity, and only fades under reduced motion. Make sure every control uses `pressable`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then measure smoothness in a real browser:

  ```
  node remake/tools/capture.mjs --page remake/book-lab.html --out qa/remake/book/smooth --size 1280x800 --shot demo="demo=1" --perf 6
  ```

  Expected: report.json's `perf.p95ms` is under 20 on this laptop. The tablet test confirms 60 fps. Keep the report.
- [ ] **Step 5:** Commit: `git commit -m "Keep the still book alive, and check it stays smooth"`.

### Task 11: The content: texts with sources, and real images

**Files:**
- Modify: `remake/assets/book/cards.json` (the seven cards' real pages)
- Modify: `remake/assets/audio/book/lines-source.json` (one line per page, with the page's text)
- Create: `docs/superpowers/specs/2026-10-17-spjaldatextar.md` (the texts for the owner, in Icelandic, page by page, each fact with its source)
- Modify: `remake/assets/book/media-manifest.json`, and add images under `remake/assets/book/images/`
- Test: `remake/tests/cards.test.mjs`, `remake/tests/media.test.mjs`

**Interfaces:**
- Consumes:
  - the spec's draft outlines (section 5.1) and text rules (section 5.2);
  - the old game's sourced prose (`dist/encyclopedia-content.js`, read only);
  - its licensed images (`dist/assets/encyclopedia/` and their `media-manifest.json`).

- [ ] **Step 1:** Research each card's facts from museum pages and papers. For the Kalligrammatids, start from Labandeira et al. 2016, *Proc. R. Soc. B*, "The evolutionary convergence of mid-Mesozoic lacewings and Cenozoic butterflies".
  - Write 3–5 pages per card, each with one idea in one or two short sentences, for a five-year-old.
  - Every card has a page on how we know (fossils) and a page on what we do not know.
  - Page one shows the animal's drawing or render, because that picture is also its tile.
- [ ] **Step 2:** Pick a real image for each page that needs one.
  - Repository images come first: copy them from `dist/assets/encyclopedia/` with their manifest entries.
  - The two Kalligrammatid images the owner sent are used only if their licence is found and allows it.
  - **A new image:** list its file name, source URL, licence and size, and the controller asks the owner about each file before it is downloaded.
    - Downloads go into a new, empty folder first.
    - Each is checked: a real image of the expected size, with its sha256 recorded.
  - **No open image:** the page uses an illustration (Task 12), and the texts document says so.
- [ ] **Step 3:** Write the texts document. **Controller gate:** the owner approves or edits the texts, and their edits are applied verbatim.
- [ ] **Step 4:** Write the failing tests:
  - `the shipped cards are written and sourced`: no page's sources include `PLACEHOLDER`;
  - `every page's line is in the book's source with the page's text`.
- [ ] **Step 5:** Put the approved texts, image ids and sources into `cards.json`, the same texts into the book's lines source, and the images into the manifest.
- [ ] **Step 6:** Run `npm run test:remake`. Expected: PASS, and `checkMedia` returns no problems.
- [ ] **Step 7:** Commit: `git commit -m "Write the seven cards from sources the owner approved"`.

### Task 12: The narrator's recordings and the illustrations

**Files:**
- Create: `remake/assets/audio/book/*.mp3`
- Modify: `remake/assets/audio/book/lines-source.json` (`kept` on the takes the owner picks)
- Modify: `remake/assets/audio/lines.json`
- Create: `remake/assets/book/images/render-mosi*.jpg` and `render-kambedla*.jpg`, plus the owner's critter drawings as they arrive
- Modify: `remake/assets/book/media-manifest.json`, `remake/assets/book/cards.json`
- Test: `remake/tests/cards.test.mjs`

**Interfaces:**
- Consumes:
  - the voice tool's `--set book` (Task 2);
  - the narrator voice the owner picked (Task 2);
  - the texts the owner approved (Task 11);
  - capture.mjs.

- [ ] **Step 1 (controller):** Run `node remake/tools/voice-lines.mjs --set book`. For lines with scientific names, also make v4 candidates (as for the chapter's lines) into `qa/remake/voices/book/`, with a listening page.
  - **Owner gate:** the owner picks by ear.
  - Their picks are installed with `kept`, levelled with gain only to −18 ±0.5 LUFS, at a true peak of −2 dBTP or lower.
  - Then run `node remake/tools/audio-lines.mjs`.
- [ ] **Step 2:** Render Mosi's and Kambeðla's portraits from the game:
  - posed, softly lit, on the book's paper colour;
  - 1024 px, with thumbnails;
  - made with capture.mjs and a pose page or the `?shot=` mechanism;
  - each render's command recorded in the manifest, with `license: 'own'`.

  Put them on their cards' pages.
- [ ] **Step 3:** Install the owner's drawings as they arrive: resize them, and add thumbnails and manifest entries. Placeholders stay until then, and the report lists them.
- [ ] **Step 4:** Write the failing test `every page has its recording` (each page's audio id is in lines.json). Run it. Expected: FAIL before the recordings are installed, and PASS after.
- [ ] **Step 5:** Run `npm run test:remake`. Expected: PASS.
- [ ] **Step 6:** Commit: `git commit -m "Give the cards their narrator and their pictures"`.

### Task 13: Verification and records

**Files:**
- Modify: `remake/book-lab.html`. It reports `window.__demoStats.smallestTargetPx`, the smallest control's rectangle, which capture.mjs puts in report.json.
- Modify: `remake/README.md` (CRLF: the book's modules, data, line sets and lab page)
- Modify: `remake/STYLE.md` (CRLF, section 10: the book's look, its 80 px targets, its font, its sounds and reduced motion)

- [ ] **Step 1:** Capture the book at 1280×800, 820×1180 and 2400×1000. From the lab:
  - the animals page;
  - each card's first page;
  - a zoomed fossil;
  - the ⓘ window.

  From the game, the find flying into the button. Check that nothing is cut off, and that `smallestTargetPx` is at least 80 at every size (Review Focus 4).
- [ ] **Step 2:** Run both suites and the chapter's end capture (0 director warnings). Run Task 10's smoothness check again.
- [ ] **Step 3:** Write the owner's tablet checklist for the book, in plain English for the controller to translate.
- [ ] **Step 4:** Update README and STYLE.md. Commit: `git commit -m "Verify the living book and record how it works"`.
