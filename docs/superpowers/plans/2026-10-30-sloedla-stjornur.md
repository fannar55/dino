# Söngur Slóeðlu: 3D-stjörnur á lokaskjánum og stikunni — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The end screen's three stars, the top bar's three stars and the stars flying up into it become a live 3D star (three.js over the game's canvas) that flies, spins, lands and shines, with a juicier bar, a counting score, the longest run and "Nýtt met!"; flat 2D stars when there is no 3D.

**Architecture:** `star-motion.js` is pure math (where each star is, its turn, bounce, flash, the end screen's timings, the count). `star-view.js` draws a list of star states with three.js on a transparent canvas over the game (loaded by the page with a dynamic import, so the game and the tests never import three.js). `game.js` builds the list each frame from `star-motion.js` and hands it to the view, or draws the same stars flat when there is none.

**Tech Stack:** ES modules, Canvas 2D, three.js (`../dist/vendor/three.module.js` via an import map, `../../dist/vendor/GLTFLoader.js`), Node's test runner.

**Spec:** `docs/superpowers/specs/2026-10-30-sloedla-stjornur-design.md`

## Global Constraints

- Answer the owner in Icelandic; copy exactly: „Þú spilaðir {n} af {total} tónum“ (tóni when total ends in 1 but not 11, as now), „Lengsta röð: {n}“, „Nýtt met!“.
- Ask before anything is downloaded (name, source, licence, size); no Claude-drawn art or models: the star is a free CC0 model the owner picked.
- Never touch `design/` or `dist/` (reading and importing `dist/vendor/` is fine); keep line endings; commit on `sloedla-lag` only; no merge or push unless the owner asks; never bare `git stash`.
- One headless capture at a time: the lock `mkdir <side notes>/sloedla-keppni/rec-lock`, given back after.
- The 3D canvas draws only while a star is on screen or moving; device pixel ratio capped at 1.5.
- Tests: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla*.test.mjs`; the whole suite `npm run test:remake`, from the worktree root.

## Review Focus

1. A tablet with no WebGL, or the star file missing: the round plays and ends with the flat stars, no error (Task 4: `?3d=0` round and a missing-file round, headless, no errors).
2. Zero stars at the end: nothing flies, three glass stars, the count and the buttons still come (Task 1 test `no stars: nothing flies, the count and the end still come`).
3. A star reached on the bar while another is still flying up: each star keeps its own jump and turn (Task 1 test `two bar stars reached close together move on their own`).
4. Resizing or turning the tablet mid-round: the 3D stars stay on the bar's stars (Task 3: `resize(w, h)` called from the game's resize; Task 4 screenshot after a resize to 390×844).
5. The frame rate on the end screen and in the round with 3D (Task 4: measured before and after; within 3 frames a second of before in headless Edge).

---

### Task 1: The stars' motion, pure (`star-motion.js`)

**Files:**
- Create: `remake/engine/sloedla/star-motion.js`
- Test: `remake/tests/sloedla-stars.test.mjs` (new)

**Interfaces:**
- Produces: `END = { first: 0.6, gap: 0.7, flight: 0.6, settle: 0.5, together: 0.8, count: 1.0, rest: 0.4 }` (s);
  `endTimes(stars: 0..3) -> { launches: number[], lands: number[], together: number|null, countFrom: number, countTo: number, done: number }` (s after the end began; `together` only with 3; done = countTo + END.rest);
  `endStar({ t, i, earned, from: {x,y}, to: {x,y}, size, times }) -> { x, y, size, spin, tilt, gold, flash, shine, glass, shown }` (spin and tilt radians; gold 0..1; flash 0..1; shine 0..1: a gloss sweeping over a landed star, 0.4 s every 4 s, star i starting `i * 1.3` s later; glass: an unearned star; shown false while an earned star still sits on the bar);
  `barStar({ t, x, y, size, litAt }) -> { x, y, size, spin, tilt, gold, flash, glass }` (litAt: when it was reached, or Infinity);
  `flyer({ k, from, to, width }) -> { x, y, scale }` (k 0..1, the curve the game uses now);
  `countUp(t, from, to, total) -> integer` (0 before `from`, `total` from `to` on, rising in between);
  `isNewBest(stars, before) -> boolean` (stars > before and stars > 0).

- [ ] **Step 1: Write the failing tests**

```js
test('an end star flies from the bar to its place, turns twice, and lands on time', () => {
  const times = endTimes(2);
  const from = { x: 500, y: 30 }, to = { x: 400, y: 300 };
  const at = t => endStar({ t, i: 0, earned: true, from, to, size: 80, times });
  assert.equal(at(times.launches[0] - 0.01).shown, false);
  assert.deepEqual([at(times.launches[0]).x, at(times.launches[0]).y], [500, 30]);
  const landed = at(times.lands[0]);
  assert.ok(Math.abs(landed.x - 400) < 1e-6 && Math.abs(landed.y - 300) < 1e-6);
  assert.ok(Math.abs(landed.spin - 4 * Math.PI) < 1e-6, 'two turns');
  assert.equal(landed.gold, 1);
  assert.ok(at(times.lands[0] + 0.05).size > 80 * 1.1, 'it bounces');
  assert.ok(Math.abs(at(times.lands[0] + 0.8).size - 80) < 80 * 0.02, 'and settles');
  assert.ok(Math.abs(at(times.lands[0] + 3).tilt) <= 0.12, 'the sway stays small');
  const shines = Array.from({ length: 80 }, (_, k) => at(times.lands[0] + 1 + k * 0.1).shine);
  assert.ok(shines.some(s => s > 0.5) && shines.filter(s => s > 0).length < 30, 'a gloss now and then, not always');
  assert.deepEqual(times.launches.map(t => Number(t.toFixed(2))), [0.6, 1.3]);
});
test('no stars: nothing flies, the count and the end still come', () => {
  const times = endTimes(0);
  assert.deepEqual(times.launches, []);
  assert.equal(times.together, null);
  const glass = endStar({ t: 1, i: 1, earned: false, from: { x: 0, y: 0 }, to: { x: 200, y: 300 }, size: 80, times });
  assert.equal(glass.glass, true);
  assert.equal(glass.shown, true);
  assert.ok(Math.abs(glass.x - 200) < 4 && Math.abs(glass.y - 300) < 4, 'it shivers in its place');
  assert.ok(times.done > times.countTo && times.countTo > times.countFrom);
});
test('three stars turn together after the third lands; the end waits for the count', () => {
  const times = endTimes(3);
  assert.ok(times.together >= times.lands[2]);
  assert.ok(times.countFrom >= times.together + END.together - 1e-9);
  assert.equal(times.done, times.countTo + END.rest);
});
test('two bar stars reached close together move on their own', () => {
  const a = barStar({ t: 10.25, x: 300, y: 30, size: 20, litAt: 10 });
  const b = barStar({ t: 10.25, x: 500, y: 30, size: 20, litAt: 10.2 });
  assert.ok(a.y < 30 && b.y < 30, 'both jump');
  assert.notEqual(a.spin, b.spin);
  const glass = barStar({ t: 10.25, x: 700, y: 30, size: 20, litAt: Infinity });
  assert.equal(glass.glass, true);
  assert.equal(glass.gold, 0);
  const later = barStar({ t: 12, x: 300, y: 30, size: 20, litAt: 10 });
  assert.equal(later.gold, 1);
  assert.ok(Math.abs(later.y - 30) <= 2, 'back on the bar, bobbing');
});
test('the count rises from 0 to the notes played, whole numbers; a new best is more stars than before', () => {
  const seen = [0, 0.25, 0.5, 0.75, 1, 1.5].map(t => countUp(t, 0.25, 1.25, 45));
  assert.deepEqual([seen[0], seen.at(-1)], [0, 45]);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1] && Number.isInteger(seen[i]));
  assert.equal(isNewBest(2, 1), true);
  assert.equal(isNewBest(2, 2), false);
  assert.equal(isNewBest(0, 0), false);
});
```

- [ ] **Step 2: Run; expected FAIL** (module not found).
- [ ] **Step 3: Implement `star-motion.js`** as the Interfaces say. The end flight: a quadratic curve from `from` to `to` with its control point `size * 2` above the higher of the two, eased out; spin `4π · ease`; size from `size * 0.4` to `size`; the bounce after landing `size * (1 + 0.3 · e^(−6s) · cos(18s))` for s seconds since landing (settled by `END.settle`); flash 1 at landing falling to 0 in 0.35 s; idle tilt `0.1 · sin(1.6 t + i)`; with three, one more turn (2π) over `END.together` from `together`. Glass: at `to`, a shiver of at most 3 px. Bar stars: glass spinning `0.6 rad/s` until `litAt`; then a jump `−size · 0.9 · sin(π s / 0.5)` for 0.5 s, one fast turn (2π) in 0.5 s, flash 0.35 s, gold from then on, a bob of at most 2 px. `flyer`: the curve now in `game.js` (`drawEffects`, the `flyers` loop).
- [ ] **Step 4: Run; expected PASS.**
- [ ] **Step 5: Commit.**

### Task 2: The star (the owner chooses)

**Files:**
- Create: `remake/assets/sloedla/stjarna/stjarna.glb`, `remake/assets/sloedla/stjarna/KREDIT.md`
- Test: `remake/tests/sloedla-stars.test.mjs`

**Interfaces:**
- Produces: `assets/sloedla/stjarna/stjarna.glb` (one star mesh, under 300 KB); KREDIT.md says the file, the model's name, author, source URL, licence, and `facing`: the rotation (degrees about x, y, z) that turns the star's face to the camera, read by Task 3.

- [ ] **Step 1: Write the failing test**

```js
test('the star is on disk, a GLB, small, its source, licence and facing said', () => {
  const file = new URL('../assets/sloedla/stjarna/stjarna.glb', import.meta.url);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'glTF');
  assert.ok(bytes.length < 300_000);
  const credits = fs.readFileSync(new URL('../assets/sloedla/stjarna/KREDIT.md', import.meta.url), 'utf8');
  assert.match(credits, /stjarna\.glb/);
  assert.match(credits, /CC0|public domain|almenningseign/i);
  assert.match(credits, /facing/);
});
```

- [ ] **Step 2: Run; expected FAIL.**
- [ ] **Step 3: Find 2–3 CC0 stars** (Poly Pizza, Kenney, Quaternius; GLB or glTF first) and show them in the brainstorm companion (picture, name, author, source page, licence, download size). **Stop: the owner picks and approves the download.**
- [ ] **Step 4: Download his pick** into its own new folder in the scratchpad (a zip: unpack there), keep or convert to one GLB with only the star (Node: `GLTFExporter` is not needed if it is already a GLB; a glTF with its .bin is packed with a small script using `../../dist/vendor/GLTFLoader.js` in headless Edge and `vendor/addons/exporters/GLTFExporter.js`), look at it in headless Edge to read its `facing`, copy to `assets/sloedla/stjarna/`, write KREDIT.md.
- [ ] **Step 5: Run; expected PASS. Commit.**

### Task 3: The 3D view (`star-view.js`) and the page

**Files:**
- Create: `remake/engine/sloedla/star-view.js`
- Modify: `remake/sloedla-lab.html` (import map; `<canvas class="sl-stars3d" id="stars3d">` right after `#field`), `remake/sloedla.css` (`.sl-stars3d`: over the field, under the menu and end, `pointer-events: none`)
- Test: headless screenshot (no unit test: WebGL)

**Interfaces:**
- Consumes: the GLB and its `facing` (Task 2).
- Produces: `createStarView({ canvas, url, facing: [x, y, z] }) -> Promise<{ draw(stars: StarState[]), resize(width, height), clear() } | null>` — null when WebGL or the file fails (the page then passes no view). `StarState` = Task 1's states plus `id` (string, stable per star: `bar-0..2`, `fly-<n>`, `end-0..2`). Orthographic camera in CSS pixels (y down); one clone of the mesh per id; gold: `MeshPhongMaterial` `#ffc93a`, specular `#fff6c8`, shininess 70, emissive `#ff9a00 × flash`; glass: `#3a3f7a`, opacity 0.55, transparent, specular `#c9d8ff`; a hemisphere light and a key light from the upper left; `spin` turns about the star's up axis, `tilt` about the view axis; `draw([])` after stars clears once and then draws nothing; `shine` lifts the gold's specular and emissive (a gloss passing over); pixel ratio `min(1.5, devicePixelRatio)`.

- [ ] **Step 1: Write `star-view.js`, the import map and the canvas.**
- [ ] **Step 2: Look at it:** a headless page that draws three gold and one glass state from Task 1 (sizes 80 and 20) on the lab page (`window.__stars3d` debug hook only with `?debug=1`); screenshot; the star faces the camera, gold shines, glass is dark and see-through. Fix `facing` if it does not.
- [ ] **Step 3: Commit.**

### Task 4: The game draws them; the juicier bar and end

**Files:**
- Modify: `remake/engine/sloedla/game.js` (option `stars3d = null`, `bestBefore = 0`, `endNow = null`; the bar, the flyers and the end through Task 1 and the view; the 2D stars when there is no view), `remake/engine/sloedla/sounds.js` (`tick(freq)`: a short soft bell, 0.08 s), `remake/engine/sloedla/lab.js` (the view loaded with `import('./star-view.js')`, none with `?3d=0` or on failure; `bestBefore: best.get(song, level)`; `chimes.tick`; `?lokaskjar=0..3` ends the round at once with that many stars, for looks), `remake/sloedla.css` (the end's buttons slide up)
- Test: the song game tests and the whole suite; headless videos and screenshots; frame rate

**Interfaces:**
- Consumes: Task 1 (`END`, `endTimes`, `endStar`, `barStar`, `flyer`, `countUp`, `isNewBest`), Task 3 (`createStarView`).

- [ ] **Step 1: The end.** Use `endTimes(endStars)` for the phase: each earned star launches from its bar star, lands with `chimes.star(n)` (moved from launch to landing), a 2D ring and 24 sparks at its place; unearned ones are glass; with three, the turn together and the fireworks then; the count from `countFrom` to `countTo` with `chimes.tick` on each new number (at most one tick each 0.05 s); then „Lengsta röð: {score.best}“ and, if `isNewBest(endStars, bestBefore)`, „Nýtt met!“ glittering; `phase = 'done'` at `times.done` (the page's buttons slide up then).
- [ ] **Step 2: The bar.** Height `max(22, min(32, h * 0.036))`, a darker rim and a white gloss on the upper half; glitter at the gold's leading edge (3 sparks a second); the bar stars through `barStar` with `litAt` the time each was reached (the flyer's arrival), the flyers through `flyer`; when one is reached: `chimes.sparkle()` (the two high bells), the 16 sparks as now, and a shake of the bar (2 px, 0.3 s).
- [ ] **Step 3: 3D or flat.** Each frame the game makes the list of star states (ids as Task 3) and calls `stars3d.draw(list)`; with no view it draws each state flat with `star()` (gold or glass colours, size, and `tilt` as a rotation).
- [ ] **Step 4: Run the song game tests and the whole suite; expected all PASS.**
- [ ] **Step 5: Look and measure.** Take the lock: videos of `?lokaskjar=0`, `1`, `2`, `3` (rec.mjs, 1280×800); one round of Stattu upp with `?sjalf=1`; the same with `?3d=0` and with the star file renamed away (both: no errors, flat stars); a screenshot after resizing to 390×844 mid-round; the frame rate in a round and on the end screen, before (this task's BASE) and after, within 3 a second. Give the lock back. Fix what they show.
- [ ] **Step 6: Commit.**

### Task 5: To the owner

- [ ] **Step 1:** `npm run test:remake` all PASS.
- [ ] **Step 2:** Send the end-screen videos (0–3 stars) and the round; the localhost link; the frame rates.
- [ ] **Step 3:** Memory note and side notes; nothing merged or pushed.
