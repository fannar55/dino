# The Living Painting on the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (This project: Sonnet builders one task at a time, the controller checks each and shows the owner; no reviewer agents.)

**Goal:** The book's map, and the map in the journey, move the painting's own pixels: the water flows, the waterfall streaks and its foam boils, 18 trees sway, the painted clouds billow and drift over the mountains; the gliding light on the water goes.

**Architecture:** A new `map-life.js` holds the data (trees, fall, foam), the fragment shader from the approved prototype, and `createLiveMap`, which draws one page's half of the painting through the shader on a `<canvas>` at 30 fps. `renderMap` puts that canvas on each page, starts it on `show()`, stops it on `hide()`, and falls back to today's painting and mist when there is no WebGL or less motion is asked for; the map in the journey starts it on `play()` and lets it go with the overlay.

**Tech Stack:** Plain ES modules, raw WebGL 1 (no three.js), DOM/CSS; node:test with the repo's DOM shim (`remake/tests/setup.mjs`, `remake/tests/fake-dom.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-29-lifandi-malverk-design.md` (Icelandic; read it with this plan). The approved prototype, whose shader and tree list are ported: `qa/bokin/kort-lif/index.html` (gitignored; keep it, do not edit or delete it).

## Global Constraints

- Work in the worktree `C:/Risaeðla/dino-bokin` on branch `bokin`; never switch branches, merge, push, or use bare `git stash`.
- Keep each file's line endings: `remake/engine/book/book.js` is CRLF, every other file touched here is LF (check with Node, `text.includes('\r\n')`; `grep -c $'\r'` lies in this Git Bash). Never touch `design/` or `dist/`.
- Claude draws no art: every effect moves or brightens the painting's own pixels. The spray from the prototype is not built.
- `prefers-reduced-motion: reduce`: no living layer is made; the painting with the still mist layer and an open hole, as today.
- The painting is 1681 × 936 picture pixels (`PICTURE` in map-page.js), laid out in a 1800 × 1000 view; each page shows half (picture x 0–840.5 and 840.5–1681).
- Look values are the prototype's defaults (every slider at 1.0): copy its numbers; do not retune them unless the owner asks.
- Budget: the life adds at most 4 ms a frame on average at 1366 × 1024 and 1024 × 1366 on this laptop (Intel Iris Xe).
- Test command (from the worktree root): `node --import ./remake/tests/setup.mjs --test remake/tests/*.test.mjs`; read the `ℹ pass` / `ℹ fail` lines. Baseline 1248 pass.
- Dev server for this worktree: http://127.0.0.1:4212/ (start it with the `bokin` launch entry if it is down); never stop servers on 4190, 4197, 4201, 4221 or 4231.
- Commit when green, message `WIP life: …`, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; keep a progress note in `C:/Users/fannare/AppData/Roaming/Claude/side-session-notes/local_5af6e842-d0c9-4f2a-92fb-56f234adc53d/living-painting-progress.md` (a line per step done, so a frozen session loses nothing).

## Review Focus

1. **Turning away from the map page, or closing the book, while the map lives:** its drawing stops (nothing draws in the background). Test in Task 2 (through `createBook`).
2. **The map in the journey played again while one is still up:** the old overlay's living layers are let go and the new one's start. Test in Task 3.
3. **The graphics drop the WebGL context while the map shows:** that page goes back to the painting and mist, and showing it again does not bring back the dead layer. Test in Task 2.
4. **The book left open on the map for an hour:** the motion stays smooth (the shader's clock wraps at 3600 s; a device without high-precision floats in fragment shaders gets the still fallback). `lifeClock` test in Task 1; precision guard checked in Task 1's browser look.
5. **A tablet turned between landscape and portrait while the map is up:** the canvas follows the new size, nothing stretched or blank. Checked in Task 4's lab look at 1366 × 1024 and 1024 × 1366.

---

### Task 1: `map-life.js`: the data, the shader and the living layer

**Files:**
- Create: `remake/engine/book/map-life.js`
- Test: `remake/tests/book.test.mjs`

**Interfaces:**
- Produces:
  - `TREES`: array of `{ p: [x, y], c: [x, y], r: [rx, ry], deg }`, picture px (trunk foot, crown centre, crown half width and height, lean in degrees): the prototype's 18 entries, verbatim.
  - `FALL = { left: 431, right: 469, top: 170, bottom: 230 }`, `FOAM = { at: [450, 234], r: [47, 13] }`.
  - `treeBox(tree) -> [left, top, right, bottom]` = `[min(p.x − 12, c.x − 1.18·rx), c.y − 1.18·ry, max(p.x + 12, c.x + 1.18·rx), p.y + 2]`.
  - `LIFE_FPS = 30`, `LIFE_RES = 1`, `lifeClock(ms) -> seconds` (= `(ms / 1000) % 3600`).
  - `createLiveMap(canvas, { half, win = globalThis.window, hole = () => [0, 0, 0], onReady = () => {}, onLost = () => {} } = {}) -> LiveMap | null`, where `LiveMap = { start(), stop(), destroy(), running }` (`running` a getter) and `hole()` gives `[x, y, r]` in picture px (r 0 when shut).
  - `timeLiveMaps(frames = 30) -> { life, plain, added } | null`: average ms per frame for drawing every live map now made, each draw waited for with a one-pixel `readPixels`, once with the effects on (`life`) and once off (`plain`); null when none is made with its textures in.

- [ ] **Step 1: Write the failing tests** in `book.test.mjs`:
  - `the living map's trees, fall and foam lie inside the painting, each foot below its crown, no tree over a slot`: for each of `TREES`, `treeBox(tree)` is within `[0, 0, 1681, 936]` and `tree.p[1] > tree.c[1]`; `FALL` and the foam ellipse's box are within the painting; for each `MAP_PLACES` slot (its `at` and `size` are view units: convert with `× 1681/1800` and `× 936/1000`), the circle of radius `size/2` does not overlap any `treeBox`. `TREES.length === 18`.
  - `the living map's clock wraps at an hour`: `lifeClock(0) === 0`, `lifeClock(1500) === 1.5`, `lifeClock(3_600_000) === 0`, `lifeClock(3_601_500) ≈ 1.5`.
  - `there is no living layer where there is no WebGL`: `createLiveMap({}, { half: 0 })` and `createLiveMap({ getContext: () => null }, { half: 0 })` are both `null`; `timeLiveMaps()` is `null`.
- [ ] **Step 2: Run them**, expect FAIL (no module).
- [ ] **Step 3: Write `map-life.js`.** Header comment: what moves and why (spec §1–2), that it is the prototype's shader, the fallback rules, the 4 ms budget. Port the prototype's lighter shader (`FRAG`, which uses `nz4`, the tree boxes and the mask branches) with these changes:
  - drop the spray, the debug tint and the slider uniforms (`uWaterK`, `uFall`, `uTrees`, `uClouds`, `uCloudSpeed` are 1); add `uniform float uLife` (1 = every effect, 0 = the plain painting, for `timeLiveMaps`);
  - one mask texture: water = `.r`, mist = `.g`; every lookup into the painting and the mask goes through `uniform vec4 uCrop` (`(p − uCrop.xy) / uCrop.zw`): left page crop `[0, 0, 941, 936]`, right `[740, 0, 941, 936]` (the half plus 100 px across the spine);
  - `uView` is the page's half: left `[0, 0, 840.5, 936]`, right `[840.5, 0, 840.5, 936]`;
  - the fall's and foam's numbers are written into the shader source from `FALL` and `FOAM` (template string), so data and shader cannot drift.
  
  `createLiveMap`: returns null when `canvas.getContext` is not a function, `getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })` is null, `getShaderPrecisionFormat(FRAGMENT_SHADER, HIGH_FLOAT).precision` is 0, or the shader does not compile or link. Textures, each made once: the painting cropped to `uCrop` (drawn through a 2D canvas), the mask from `map-water.webp`'s and `map-mist.webp`'s alpha in the same crop, and the prototype's `noiseData()` 256 × 256 noise with `REPEAT`, seeded (mulberry32, seed 7) so every run is alike. Asset URLs are map-life's own (`new URL('../../assets/book/…', import.meta.url)`; do not import map-page.js, which imports this). `start()` runs a `requestAnimationFrame` loop that draws when at least `1000 / LIFE_FPS − 2` ms have passed (and only once the textures are in); each draw sizes the canvas to `min(round(clientWidth · dpr), 841) · LIFE_RES` wide (height in the client's proportion, dpr capped at 2), skips a canvas with no size, passes `lifeClock(now − t0)` and `hole()`, and calls `onReady()` after the first frame. `stop()` cancels the loop. `destroy()` stops, loses the context (`WEBGL_lose_context`) and forgets the layer. On `webglcontextlost`: stop, call `onLost()`, and never draw again (`start()` does nothing). A module-level set holds the made layers for `timeLiveMaps`.
- [ ] **Step 4: Run the tests and the suite**, expect PASS.
- [ ] **Step 5: Look in the browser.** On http://127.0.0.1:4212/remake/book-lab.html, in the console: import the module, put a 450 × 500 `<canvas>` on the page, `createLiveMap(canvas, { half: 0 }).start()`, and screenshot it twice a few seconds apart: the left half of the painting, alive (water, fall, trees, clouds). Same for `half: 1`. No console errors. Note it in the progress file.
- [ ] **Step 6: Commit** `WIP life: map-life.js, the living painting's data, shader and layer`.

### Task 2: The map's pages come alive (and the water's light goes)

**Files:**
- Modify: `remake/engine/book/map-page.js`, `remake/engine/book/book.js` (CRLF: the `liveMap` option only), `remake/book.css`, `remake/tools/map-life-layers.py` (docstring only)
- Test: `remake/tests/book.test.mjs`

**Interfaces:**
- Consumes: `createLiveMap`, `LiveMap` (Task 1).
- Produces:
  - `renderMap(leaf, { save, onTap, audio, win, liveMap = createLiveMap })`: `liveMap` is a factory with `createLiveMap`'s signature.
  - New methods on what `renderMap` returns: `startLife()`, `stopLife()`, `dispose()` (destroys the living layers) and `alive() -> boolean` (some layer running). `show()` calls `startLife()`; `hide()` calls `stopLife()`.
  - `createBook(doc, { …, liveMap })` passes `liveMap` to `renderMap` when given.

- [ ] **Step 1: Write the failing tests** (rewrite the two water tests; add the rest). A fake factory for them:

```js
/** A stand-in for createLiveMap: records each layer made and what was asked of it. */
function fakeLife({ none = false } = {}) {
  const made = [];
  const liveMap = (canvas, options) => {
    if (none) return null;
    const layer = { canvas, options, starts: 0, stops: 0, destroyed: false, running: false,
      start() { this.starts++; this.running = true; }, stop() { this.stops++; this.running = false; },
      destroy() { this.destroyed = true; this.running = false; } };
    made.push(layer);
    return layer;
  };
  return { liveMap, made };
}
```

  - `the map's living layer lies over the painting, under the mist, the trail and the slots` (replaces `the map's water and mist lie over …`): on each half the order is `map-art`, `map-live`, `map-mist`, `map-route`, `map-name`, `map-marker`; `map-live` is a `CANVAS` with `aria-hidden="true"`; no `map-water` anywhere.
  - `the mist drifts in the stylesheet, the hole is a registered length, and the water's light is gone` (replaces `a light glides over the water …`): `@property --map-hole` with `syntax: '<length>'`, `inherits: false`, `initial-value: 0px`; the mist's drift test lines kept; no `map-water` in book.css; `.map-half.live .map-mist` is `visibility: hidden` and `.map-half.live .map-live` is `visibility: visible`.
  - `the map lives while its page shows`: with `fakeLife()`, nothing is made until `show()`; then one layer per half (`options.half` 0 and 1), each started; `alive()` is true; `hide()` stops both; a second `show()` starts the same two layers again (`made.length` stays 2); calling each layer's `options.onReady()` puts `live` on its `.map-half`.
  - `with reduced motion, or without WebGL, the map stays as it was`: reduced motion → `show()` makes nothing; `fakeLife({ none: true })` → `show()` leaves no `live` class and `alive()` is false.
  - `a page whose living layer is lost goes back to the painting and does not bring it back` (Review Focus 3): after `show()` and `onReady()`, calling the left layer's `options.onLost()` takes `live` off the left half only; `hide()` then `show()` makes no new layer for it and starts only the right one.
  - `the hole the living layer is given follows the mist's --map-hole` : with a `win` whose `getComputedStyle(el).getPropertyValue('--map-hole')` gives `'64px'` and the left half's `rect.width` set to 450, the left layer's `options.hole()` is `[178, 107, 64 * 1681 / 900]` (±0.01); the right layer's is `[0, 0, 0]`.
  - `turning away from the map, or closing the book, stops its life` (Review Focus 1): a book made with `savedRig`'s new `liveMap` option, opened on the Kortið tab the way the existing map-tab tests do: its two layers are started; turning to another tab stops them; back to Kortið starts them; closing the book stops them.
- [ ] **Step 2: Run them**, expect FAIL.
- [ ] **Step 3: Change `map-page.js`.** Drop `WATER_SRC` and the water `img`. Put `<canvas class="map-live" aria-hidden="true">` after `map-art` on each half. Make the layers lazily in `startLife()` (never under `reducedMotion(win)`; a factory that gives null, or a layer that was lost, marks that half as without life for good). `onReady` adds `live` to the half, `onLost` removes it. The left half's `hole()`: Grameðla's slot centre in picture px (`gramedla.at` back through `PICTURE`/`VIEW`, = [178, 107]) and `parseFloat(win.getComputedStyle(mist).getPropertyValue('--map-hole')) * 1681 / (2 * half.getBoundingClientRect().width)`, 0 when that is not a positive number; the right half's is `[0, 0, 0]`. Rewrite the header's "And the map is alive" paragraph and the comment over `MIST_OPEN_MS` for the living layer (and drop the note about the 5 ms SVG ripple).
- [ ] **Step 4: Change `book.js`** (CRLF kept): `createBook` takes `liveMap` and passes it to `renderMap` only when given. **Change `savedRig`** in the test file to take a `liveMap` option it hands to `createBook`.
- [ ] **Step 5: Change `book.css`.** Remove `.map-water` from the shared layer selectors, the `.map-water` rule, `@keyframes map-water-glide` and the reduced-motion `.map-water` line. Add `.map-live` (absolute, `inset: 0`, `width: 100%`, `height: 100%`, `display: block`, `pointer-events: none`, `visibility: hidden`), `.map-half.live .map-live { visibility: visible; }`, `.map-half.live .map-mist { visibility: hidden; }`, and `@property --map-hole { syntax: '<length>'; inherits: false; initial-value: 0px; }`. Rewrite the map's comment block for the living layer.
- [ ] **Step 6: `map-life-layers.py` docstring:** the two layers' alpha is now the living layer's mask (map-life.js); the water layer is no longer shown.
- [ ] **Step 7: Run the tests and the suite**, expect PASS.
- [ ] **Step 8: Look in the lab:** `book-lab.html?state=map&progress=3&seen=1` at 1366 × 1024: both pages alive, the trail, names and stickers on top, no water light; `?state=map&progress=6` (no `seen`): the hole widens smoothly over about 2 s and the drifting clouds stay out of it. Screenshot paths in the progress note.
- [ ] **Step 9: Commit** `WIP life: the map's pages live; the water's gliding light goes`.

### Task 3: The map in the journey lives too

**Files:**
- Modify: `remake/engine/book/map-moment.js`
- Test: `remake/tests/book.test.mjs`

**Interfaces:**
- Consumes: `renderMap`'s `liveMap` option, `startLife()`, `dispose()` (Task 2).
- Produces: `createMapMoment(doc, { save, audio, win, liveMap })`, passing `liveMap` to `renderMap` when given.

- [ ] **Step 1: Write the failing tests** (give `momentRig` a `liveMap` option handed to `createMapMoment`):
  - `the map in the journey lives while it plays and lets its living layers go when it leaves`: `play(['a'])` makes two layers, both started; `close()` stops them; after `update(0.6)` (the slide away) both are destroyed and the overlay is gone.
  - `a journey map played over another lets the first one's life go` (Review Focus 2): `play(['a'])`, then `play(['b'])` while open: the first two layers are destroyed, two new ones are started.
  - `with reduced motion the map in the journey makes no living layer`.
- [ ] **Step 2: Run them**, expect FAIL.
- [ ] **Step 3: Change `map-moment.js`:** forward `liveMap`; in `play()`, `map.startLife()` after `renderMap`; in `dispose()`, `moment.map.dispose()` before the element goes. Add a sentence to the header comment.
- [ ] **Step 4: Run the tests and the suite**, expect PASS.
- [ ] **Step 5: Look:** `book-lab.html?state=journey&leg=1` and `leg=2`: the map slides up alive, zooms, slides away; `remake/index.html?t=184` (chapter 1's departure) the same in the game. Screenshot paths in the progress note.
- [ ] **Step 6: Commit** `WIP life: the map in the journey lives too`.

### Task 4: Measure, look at both tablet shapes, show the owner

**Files:**
- Modify: `remake/book-lab.html` (one probe), `qa/bokin/kortid.html` (gitignored review page: its text about the map's life)

- [ ] **Step 1: Probe:** in `book-lab.html` import `timeLiveMaps` from `engine/book/map-life.js` and set `window.__lifeMs = frames => timeLiveMaps(frames)`; one line in its header list of probes.
- [ ] **Step 2: Measure** on `?state=map&progress=3&seen=1` at 1366 × 1024 and at 1024 × 1366 (`resize_window`): `__lifeMs(40)` three times each, keep the lowest. The cost a frame is `added × LIFE_FPS / 60`. If either is over 4 ms: set `LIFE_FPS = 20` and measure again; if still over, `LIFE_RES = 0.75`. Write the numbers (both shapes, `life`, `plain`, `added`, the cost a frame, the renderer string) in the progress note and in the commit message.
- [ ] **Step 3: Look at both shapes** (Review Focus 5): at 1366 × 1024 and 1024 × 1366, and turning from one to the other while the map shows, the pages fill their boxes, nothing is stretched or blank, and the life goes on. Screenshots in the progress note.
- [ ] **Step 4: Update `qa/bokin/kortid.html`:** the map paragraph says what lives now (water flowing, the fall and foam, the trees, the clouds, the hole) instead of the gliding light.
- [ ] **Step 5: Run the suite**, expect PASS. **Commit** `WIP life: measured at tablet size; the lab's probe`.
- [ ] **Step 6: Hand to the controller,** who shows the owner the lab pages and the game, and asks before anything is merged. The prototype `qa/bokin/kort-lif/` stays until the owner has approved.
