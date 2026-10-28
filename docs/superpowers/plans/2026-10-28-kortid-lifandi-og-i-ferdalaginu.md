# The Living Map and the Map in the Journey: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (This project: Sonnet builders one task at a time, the controller checks each and shows the owner; no reviewer agents.)

**Goal:** The book's map comes alive (water ripples, mist drifts and opens at Grameðla) and, at each departure, the same map slides up over the running game, draws the red line of the leg ahead while Mosi says where they are going, and slides away.

**Architecture:** Two layers cut from the owner's painting by a Python tool feed `map-page.js`, which animates them in the book and anywhere else the map is drawn. A new `map-moment.js` mounts the map as one picture in an overlay above the game canvas and below the caption, and `renderMap` gains a way to draw named pieces on request. The journal owns the overlay (it already owns the save and the book), and a scene helper times it on the game clock beside Mosi's line.

**Tech Stack:** Plain ES modules, DOM/SVG/CSS, Web Animations; Python 3 with numpy and PIL for the tool; node:test with the repo's DOM shim (`remake/tests/setup.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-28-kortid-lifandi-og-i-ferdalaginu-design.md` (Icelandic; read it with this plan).

## Global Constraints

- Work in the worktree `C:/Risaeðla/dino-bokin` on branch `bokin`; never switch branches, merge, push, or use bare `git stash`.
- Keep each file's line endings (all files touched here are LF); never touch `design/` or `dist/`.
- Claude draws no art: the layers are pixels selected from `map.webp`; the red line, dot, rings and slide are plain geometry and motion.
- `prefers-reduced-motion: reduce`: nothing ripples, drifts, slides or zooms; lines are simply there; the overlay still waits for Mosi's line.
- Map view units stay 1800 × 1000; the painting is 1681 × 936 (`PICTURE` in map-page.js); the layers are exactly 1681 × 936 with alpha.
- Timings from the spec: slide in 0.6 s, piece 2 s (ROUTE_MS) with 0.15 s gaps (ROUTE_GAP_MS), hold 0.8 s, slide out 0.6 s; zoom at most 1.6×; overlay covers about 86 % of the screen with a 35 % dark veil.
- Scene time is the game clock: scene code waits with `s.wait`/`s.until`, never on a Web Animation's `finished` (tests and captures seek).
- Overlay stacking: above `#view` (the canvas), below `.caption` (z-index 2) and the book.
- Line ids: `k1_mosi_map_ride` ("Sjáðu, kortið! Við förum eftir stígnum að Burknalautinni, til Kambeðlu.") and `k2_mosi_map_trail` ("Nú förum við út úr skóginum, niður Fenjaslóðina og alla leið að Feninu, til Þórseðlu.").
- Ripple budget: if the displacement filter costs more than 4 ms a frame on average at tablet size, use the gliding light instead (spec section 2).
- Test command (from the worktree root): `node --import ./remake/tests/setup.mjs --test remake/tests/*.test.mjs`; read the `ℹ pass` / `ℹ fail` lines. Baseline 1207 pass.
- Dev server for this worktree: http://127.0.0.1:4212/ (already running); never stop servers on 4190, 4197, 4201.
- Commit when green, message `WIP map: …`, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; keep a progress note in `C:/Users/fannare/AppData/Roaming/Claude/side-session-notes/local_5af6e842-d0c9-4f2a-92fb-56f234adc53d/map-living-progress.md`.

## Review Focus

1. **The child opens the book during a map moment** (taps the journal button): the book opens above, the moment still ends on its own, the pieces are seen, and no overlay is left behind. Test in Task 3.
2. **A capture or test seeks through the moment:** it closes on the game clock and the chapter plays on unattended. Test in Task 4.
3. **An upright tablet (portrait):** the whole map still fits inside the overlay, letterboxed, with nothing cut off. Checked in Task 3's lab look and asserted by the overlay's fit function test.
4. **Replaying a chapter whose pieces are already seen:** the moment still plays and draws them again in the overlay; the book is unaffected. Test in Task 4.
5. **No sound allowed yet / muted effects:** the moment plays silently and still times itself by Mosi's line. Covered by the harness (silent) in Task 4.

---

### Task 1: The two life layers cut from the painting

**Files:**
- Create: `remake/tools/map-life-layers.py`
- Create: `remake/assets/book/map-water.webp`, `remake/assets/book/map-mist.webp`
- Test: `remake/tests/book.test.mjs` (one test)

**Interfaces:**
- Produces: the two files, 1681 × 936, RGBA WebP; colour = the painting's own pixels; alpha soft-edged (feathered ~3 px).

- [ ] **Step 1: Write the failing test** `the map's life layers are cut from the painting at its size`: for each of `assets/book/map-water.webp` and `assets/book/map-mist.webp`, the file exists and `imageSize` (from `engine/book/media.js`) gives `{ width: 1681, height: 936 }`. (If `imageSize` does not read WebP alpha files, add the minimal VP8L/VP8X branch it needs, with the test.)
- [ ] **Step 2: Run it**, expect FAIL (files missing).
- [ ] **Step 3: Write `map-life-layers.py <map.webp> <out-dir>`** (header comment like `erase-map-dots.py`: what it selects and why). Water: pixels whose hue is in the painting's blue-green water range and whose saturation/value fit the river, waterfall and pools, cleaned with a morphological open/close and small-island removal, feathered. Mist: pale low-saturation pixels in the top-left mountain band (roughly x < 900, y < 260 picture px, around Grameðla's circle at [178,107]), feathered. Exclude every slot circle (MAP_PLACES centres and sizes) and the names' spots from both. Print the share of pixels each layer keeps.
- [ ] **Step 4: Run it** on `remake/assets/book/map.webp` into `remake/assets/book/`, render a check sheet (each layer over grey and over the map) into the scratch folder, look at it, and tune until the water layer holds the river, waterfall and pools and little else, and the mist layer holds the mist and no mountain rock. Put the sheet's path in the progress note for the controller.
- [ ] **Step 5: Run the test and the suite**, expect PASS.
- [ ] **Step 6: Commit** `WIP map: the water and mist layers cut from the painting`.

### Task 2: The map comes alive (water, mist, Grameðla's opening)

**Files:**
- Modify: `remake/engine/book/map-page.js`, `remake/book.css`, `remake/book-lab.html` (comment only if needed)
- Test: `remake/tests/book.test.mjs`

**Interfaces:**
- Consumes: Task 1's two files.
- Produces: in each half, `img.map-water` and `img.map-mist` over `.map-art`, under `.map-route`; `renderMap(...).mistOpen()` → boolean; save seen key `map-mist-gramedla`.

- [ ] **Step 1: Write failing tests:**
  - `the map's water and mist lie over the painting, under the trail and the slots`: each half holds `.map-art`, then `.map-water`, `.map-mist`, then `.map-route`, in that order, with the two layers' `src` the new files.
  - `the mist opens at Grameðla once she is found, the first time drawn open, then simply open`: fresh save → `mistOpen()` false; save with `k3_gramedla`, before `show()` → false; after `show()` → true and `save.get().seen` includes `map-mist-gramedla`; the opening animated once (an `animate` call on the mist's hole) and not on a later render; with reduced motion, open at once and no `animate`.
- [ ] **Step 2: Run them**, expect FAIL.
- [ ] **Step 3: Implement.** Layers as `<img>` siblings of `.map-art`, positioned exactly like it. Water ripple: an inline SVG filter (`feTurbulence` type fractalNoise, low baseFrequency, `feDisplacementMap` scale ≈ 4 view-px) applied to `.map-water` with the turbulence's baseFrequency animated by SMIL `<animate>` over ~8 s alternate; mist drift: CSS keyframes translating `.map-mist` ±1.5 % of the half width over 14 s alternate, opacity 0.45–0.6. Grameðla's hole: a CSS `mask-image: radial-gradient(...)` on `.map-mist` whose radius custom property goes from 0 to the circle's size × 1.6 (in the left half only, centred on her slot), animated over 2 s the first time `show()` sees her reached, and set open thereafter; the seen key keeps it once. Reduced motion: no keyframes (the book's blanket rule) and no SMIL (do not add the `<animate>` when `reducedMotion(win)`).
- [ ] **Step 4: Measure** in the lab (`?state=map&progress=3&seen=1`, 1366 × 1024 and 1024 × 1366): average frame time over 5 s with and without the water filter (a `requestAnimationFrame` loop in the console). If the filter adds more than 4 ms, replace the ripple with the gliding light (a soft white linear gradient band, `mix-blend-mode: soft-light`, masked by the water layer's alpha, crossing in 9 s) and say so in the note.
- [ ] **Step 5: Run the suite**, expect PASS.
- [ ] **Step 6: Commit** `WIP map: the water ripples, the mist drifts and opens at Grameðla`.

### Task 2b: The route in the script's order (the owner, 2026-10-28: "Já, Slóeðla næst")

The game's script (`docs/superpowers/specs/2026-10-28-handrit-leiksins.md`, in main) has one friend a chapter: 3 Slóeðla (the far pool), 4 Flugeðla (the white snag), 5 Uggeðla (the reed by the channel), 6 Grameðla (beyond the mountains, "the longest trip, across the river by the waterfall"). Today's piece `d` runs from Þórseðla's pool straight to Grameðla; it goes, and four pieces take its place.

**Files:**
- Modify: `remake/engine/book/map-page.js`, `remake/book.css`, `remake/book-lab.html`
- Test: `remake/tests/book.test.mjs`

**Interfaces:**
- Produces: ROUTE pieces `a`, `b`, `c` as now, then `d` (end `sloedla`), `e` (end `flugedla`), `f` (end `uggedla`), `g` (end `gramedla`); `next()` and `dotAt()` over all seven; lab `?progress=` 0..7 (4 adds `k3_sloedla`, 5 `k4_flugedla`, 6 `k5_uggedla`, 7 `k6_gramedla`; each also the ones before), `?seen=1` marks every piece reached.

**Points (picture px; adjust only if the lab look shows a piece touching a circle, a name or the compass):**
- d, Þórseðla's pool → Slóeðla's far pool (round the north of Þórseðla's circle, then west above the Fen, under Flugeðla's circle): `[[1566,373],[1572,335],[1552,300],[1515,285],[1470,282],[1420,280],[1370,272],[1320,262],[1270,252],[1220,240],[1170,228],[1125,212],[1098,200]]`
- e, Slóeðla → Flugeðla (a low arc to the north, clear of d): `[[1100,160],[1140,140],[1200,128],[1260,135],[1300,155]]`
- f, Flugeðla → Uggeðla (south between the Fen's circle and Þórseðla's, crossing c once): `[[1360,205],[1385,260],[1400,320],[1405,380],[1400,440],[1405,500],[1420,560],[1440,620],[1452,645]]`
- g, Uggeðla → Grameðla, the longest (west-north-west over the Fen and the forest, south of "Áin", across the river at the waterfall's foot, up into the mist): `[[1413,684],[1330,645],[1240,606],[1150,570],[1060,535],[970,500],[880,462],[790,420],[700,375],[610,340],[530,300],[470,262],[420,228],[360,190],[300,158],[250,135],[214,122]]`

**The reach rule:** a, b, c are reached as now (their place found or done, or a later piece reached). d, e, f, g are reached only when their friend is **done** (her star), never by her place alone: Slóeðla, Flugeðla and Uggeðla are found from Þórseðla's head in chapter 2, and that is not a trip. A later piece reached still carries the earlier ones (no gaps).

**The next slot:** the `next` class goes on the next piece's end slot whether it is empty or found. An empty slot pulses its dashed ring as now; a found one pulses a soft ring in its hue round the sticker (`.map-marker.next.found::after`).

- [ ] **Step 1: Update and add failing tests:**
  - The trail tests list seven pieces.
  - After chapter 2 (k1_kambedla, fen, k2_thorsedla, and the places sloedla, flugedla, uggedla), `next()` is `d`, `routeOf('d')` is 'next', d through g are otherwise hidden, and Slóeðla's slot (found) has `next`.
  - The sequence: + `k3_sloedla` gives `e`, + `k4_flugedla` gives `f`, + `k5_uggedla` gives `g`, + `k6_gramedla` gives null.
  - `dotAt()` follows the same sequence once each piece is seen ('sloedla', 'flugedla', 'uggedla', 'gramedla').
  - A star alone, `k5_uggedla`, reaches a to f with no gap.
  - The places alone of the three far friends reach nothing (as the existing test says).
  - Remove or rewrite the old d-to-Grameðla assertions.
- [ ] **Step 2: Run them**, expect FAIL.
- [ ] **Step 3: Implement.** A per-piece `by: 'place' | 'star'` field (a, b, c `place`; d to g `star`) used by update()'s reach. Update the header comment's trail paragraph (seven pieces, the script's order, why the far friends need their star), the ROUTE comment, the CSS comment, and the lab's comment lines.
- [ ] **Step 4: Look** in the lab at `progress=3&seen=1` (the dotted d to Slóeðla, her sticker's ring pulsing) and `progress=7`. Check that no piece crosses a circle, a name or the compass.
- [ ] **Step 5: Run the suite**, expect PASS.
- [ ] **Step 6: Commit** `WIP map: the route in the script's order, Slóeðla next`.

### Task 3: The map in an overlay, drawing pieces on request

**Files:**
- Modify: `remake/engine/book/map-page.js` (draw on request; render into a whole-map box)
- Create: `remake/engine/book/map-moment.js`
- Modify: `remake/engine/scene/journal.js` (owns and exposes the moment), `remake/book.css`, `remake/book-lab.html` (`?state=journey&leg=1|2`)
- Test: `remake/tests/book.test.mjs`, `remake/tests/journal.test.mjs`

**Interfaces:**
- Consumes: `renderMap(leaf, { save, audio, win })` and its pieces.
- Produces:
  - `renderMap(...).drawPieces(ids: string[], { delay = 0 } = {}) → number`: draws those pieces in order with the dot (as `draw()` does, regardless of whether the save has reached them), keeps each `map-route-<id>` seen, returns the total ms it takes (0 with reduced motion).
  - `renderMap(...).bounds(ids) → { x, y, width, height }` in view units, the pieces' samples' box.
  - `createMapMoment(doc, { save, audio = null, win = globalThis.window }) → { play(ids: string[]) → { drawMs: number }, close() → number, isOpen: boolean }`: `play` mounts the overlay (one `.map-moment` element appended to `doc.body`, a veil and a paper card holding a two-half map leaf side by side), slides it in, starts the zoom toward `bounds(ids)` (at most 1.6×) and calls `drawPieces(ids, { delay: 600 })`; `drawMs` is slide-in plus drawing. `close()` slides it out and removes it after 600 ms (returns that), immediately with reduced motion.
  - `fitMap(width, height) → { width, height }`: the largest 1.8:1 box within 86 % of the screen (portrait letterboxes).
  - `journal.mapMoment` = the created moment (the journal passes its save and audio).
- [ ] **Step 1: Write failing tests:**
  - `drawPieces draws named pieces whether or not the save has reached them, and keeps them seen`: fresh save, `drawPieces(['a'])` → routeOf('a') 'drawing' (then 'drawn' after finish), seen has `map-route-a`, return value 2000; `drawPieces(['b','c'])` → 4150; reduced motion → 0 and 'drawn'.
  - `the map moment slides up over the game, draws the leg ahead and goes`: `play(['a'])` appends one `.map-moment` to body, its map shows piece a drawing, `drawMs` 2600; `close()` returns 600 and the element is gone after it; `isOpen` follows.
  - `fitMap keeps the whole map inside the screen, landscape and upright`: 1366×1024 and 1024×1366 give boxes ≤ 86 % of each side with ratio 1.8.
  - `the book opened during a map moment leaves no overlay behind`: open the journal's book while `isOpen`, then `close()` → no `.map-moment` left, pieces seen.
- [ ] **Step 2: Run them**, expect FAIL.
- [ ] **Step 3: Implement.** In map-page.js, factor `draw(piece, delay)` so `drawPieces` reuses it; the overlay passes a leaf `{ el, tiles: [leftBox, rightBox] }` whose two boxes sit side by side in a 1800:1000 card (CSS `.map-moment .map-tiles`), so the existing halves logic is unchanged. In map-moment.js, the slide is a Web Animation on the card (translateY 100 % → 0, 600 ms, ease-out) and the zoom a Web Animation on the leaf's inner wrapper (scale and translate toward the bounds' centre over `drawMs`, ease-in-out, fill forwards). Styles: `.map-moment` fixed, inset 0, z-index 1, `pointer-events: none` (taps reach the game), veil `rgb(20 16 10 / .35)`, card with the book's paper border and shadow. Sounds through `audio?.sfx?.('mapOpen')` on play and `audio?.sfx?.('mapPen')` per piece (named here; Task 4 makes them). Lab: `?state=journey&leg=1` plays a over a plain backdrop, `leg=2` plays b and c, `?at=<ms>` holds it.
- [ ] **Step 4: Look** in the lab at 1366 × 1024 and 1024 × 1366: card centred, map whole, zoom toward the leg, dot at the head; put two screenshots' description in the note.
- [ ] **Step 5: Run the suite**, expect PASS.
- [ ] **Step 6: Commit** `WIP map: the map moment overlay draws the leg ahead`.

### Task 4: The moment in the chapters, with its sounds

**Files:**
- Create: `remake/engine/scene/map-moment-scene.js`
- Modify: `remake/chapters/kafli1.js`, `remake/chapters/kafli2.js`, `remake/engine/audio/sfx.js`
- Modify: `remake/assets/audio/kafli1/lines-source.json`, `remake/assets/audio/kafli2/lines-source.json`, `remake/assets/audio/pronunciation.json` (forms only), then `node remake/tools/audio-lines.mjs` to regenerate `lines.json`
- Test: `remake/tests/kafli1.test.mjs`, `remake/tests/kafli2.test.mjs`, `remake/tests/journal.test.mjs` (sounds exist)

**Interfaces:**
- Consumes: `s.journal.mapMoment` (Task 3), `s.say`, `s.wait`, `s.until`, `s.sfx`.
- Produces: `function* mapMoment(s, c, { pieces: string[], line: string })`: `const { drawMs } = s.journal.mapMoment.play(pieces)`; start Mosi's line `s.say('mosi', line)` beside it; `yield s.wait(drawMs / 1000)` and `yield s.until(() => said.done)`; `yield s.wait(0.8)`; `yield s.wait(s.journal.mapMoment.close() / 1000)`. Chapters use the chapter's own `say` helper if they have one (kafli2's `say(s, c, …)` keeps `c.saying`).
- [ ] **Step 1: Write failing tests:**
  - kafli1: `the map comes up as the ride begins: piece a drawn before "Haltu þér fast"`: in an unattended play, the journal's moment was played with `['a']` after `k1_mosi_book` and before `k1_mosi_hold`, `k1_mosi_map_ride` was said, the save's seen has `map-route-a`, the overlay is closed when the ride starts, and the moment lasted under 8 s of scene time.
  - kafli2: `the map comes up as they leave the glade: b and c drawn before Mosi walks off`: played with `['b','c']` after `k2_mosi_muchbigger` and before the walk to `GLADE_EXIT`; `k2_mosi_map_trail` said; seen has `map-route-b` and `map-route-c`; under 9 s.
  - kafli1 replay: with `map-route-a` already seen, the moment still plays.
  - The two sounds `mapOpen` and `mapPen` exist in sfx (as the existing "every sound exists" test does for chapter sounds).
- [ ] **Step 2: Run them**, expect FAIL.
- [ ] **Step 3: Implement.** Insert `yield* mapMoment(s, c, { pieces: ['a'], line: 'k1_mosi_map_ride' })` in `upOnBack` after `yield* butterflyIntoTheBook(s, c);` and before `yield mosi.lookAt(null); yield s.say('mosi', 'k1_mosi_hold');`; in kafli2's `leaving`, after `k2_mosi_muchbigger` and before `const going = mosi.walkTo(GLADE_EXIT, …)`, with Mosi and Egill's looks as they are. Add both lines to the chapters' `lines` tables (text and audio id) and to their `lines-source.json` (speaker `mosi`), the pronunciation forms the pronunciation test asks for (`burknalautinni`, `fenjaslóðina`, `feninu`, and any other lowercase form it names), and regenerate lines.json. In sfx.js make `mapOpen` (a soft paper unroll: band-passed noise swelling 0.5 s) and `mapPen` (a light scratch: short noise ticks over 1.8 s), with the existing tools, quiet.
- [ ] **Step 4: Run the suite**, expect PASS except the recording checks that need the two mp3s (Task 5). Do not record.
- [ ] **Step 5: Commit** `WIP map: the map moment at each departure in chapters 1 and 2`.

### Task 5: The two lines recorded (controller)

**Files:**
- Create: `remake/assets/audio/kafli1/k1_mosi_map_ride.mp3`, `remake/assets/audio/kafli2/k2_mosi_map_trail.mp3`
- Modify: `remake/assets/audio/voices-made.json` (by the tool)

- [ ] **Step 1:** `node remake/tools/voice-lines.mjs --dry --only k1_mosi_map_ride` and `--set kafli2 --only k2_mosi_map_trail`: check what each would send (Kambeðlu and Þórseðlu with their context, as before).
- [ ] **Step 2:** Make both; listen; re-take with a seed if a name is wrong. Never print the ElevenLabs key.
- [ ] **Step 3:** `node remake/tools/voice-lines.mjs --plan` shows 0 to make; the suite passes in full.
- [ ] **Step 4:** Commit `WIP map: Mosi's two map lines recorded`; play chapter 1 and 2 departures in the game on 4212 and look; show the owner (a review page in `qa/bokin/` linking the lab states and the takes).
