# Kafli 4: Boð til Flugeðlu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project builders work in chunks and the owner reviews after each chunk (no reviewer agents); see Global Constraints.

**Goal:** Build chapter 4 of the remake: the wind task at the white snag and the hero-moment flight on Flugeðla's back up the river, through the gorge, up the waterfall into golden light and down to the far pool.

**Architecture:** The flight is built first and on its own: a route (curve plus schedule of beats), a flier controller that moves Flugeðla along it with Egill riding, a corridor world ("Árdalurinn") built in sections along the route, and a flight camera with its own comfort rules. A review-only chapter `chapters/flug.js` plays the flight alone (`?chapter=flug`) for chunks 1–4. The full chapter `chapters/kafli4.js` (chunks 5–8) reuses chapter 3's Fen for scenes 1–5 and calls the same flight scene.

**Tech Stack:** three.js (`dist/vendor/three.module.js`), the remake engine (scene scheduler, director, actors, forest species, sfx/music), node test runner, CDP capture tools, ElevenLabs v4 voices.

**Spec:** `docs/superpowers/specs/2026-11-01-kafli-4-bod-til-flugedlu-design.md` (Icelandic; the binding authority). Script: `docs/superpowers/specs/2026-10-28-handrit-leiksins.md`.

## Global Constraints

- Work on branch `kafli4-flugedla` in worktree `C:/Risaeðla/dino-kafli4-flugedla`, dev server port 4260 (launch entry `kafli4` in `C:/Risaeðla/.claude/launch.json`). Nothing is merged into main or pushed unless the owner says so.
- Builders commit WIP often and write a one-line progress note per step; after each chunk the owner gets a video (and stills at 1280x800 and 800x1280) and decides before the next chunk.
- Child-facing text is Icelandic and copied verbatim from the spec; line ids are `k4_<speaker>_<name>`, speakers `mosi`, `egill`, `flugedla`. The owner approves every recorded line by ear; speech recognition is a hint only.
- The child can never fail: the wind always comes in the end, and the flight plays like a film if nothing is touched. Everything Egill can do in the flight is optional and never changes the route or the time of the big moments.
- Length: about 7.5 minutes for a child who touches nothing, the flight about 2 min 50 s; never over 10 minutes.
- Performance per key shot on the `tablet` preset (Iris Xe, 1280x800): GPU median ≤ 6.0 ms (`__benchmark(120)`), ≤ 100 draw calls, ≤ 250k triangles, ≤ 96 MB textures (STYLE.md §11). No post-processing.
- Flight camera comfort: camera roll ≤ 8° (Flugeðla herself banks up to 30°), every shot ≥ 2.5 s except at most three 1.5 s shots in the gorge, nothing flashes.
- Sizes are real (STYLE.md §3): Egill 1.1 m, Mosi 8.5 m, Flugeðla 7.5 m wingspan unless the owner picks 10 m in chunk 1.
- Physical sounds (wind, water, wingbeats, splashes) are real recordings from Freesound (CC0 or CC BY, credited in the game). Ask the owner before any download, giving the name, source and size.
- No Claude-drawn art: new animal models come from open CC0 sources (Quaternius, Poly Pizza, Kenney) after the owner's yes, or from the owner's Tripo.
- Every file keeps its own line endings (`.gitattributes * -text`). `remake/main.js` and `remake/engine/book/book.js` are CRLF. Check `git diff --stat` before each commit.
- Never print, paste or log `ELEVENLABS_API_KEY`. Never touch `design/` or `dist/` (except reading `dist/vendor`).
- Run tests with `node --import ./remake/tests/setup.mjs --test remake/tests/<file>.test.mjs`; the whole suite with `npm run test:remake`.

## Review Focus

1. **An upright tablet (800x1280):** every flight shot still shows Flugeðla and Egill whole and above the bottom 30 % of the frame. Pinned in Task 5 (framing check at aspect 0.625) and Task 6 (upright stills).
2. **Pause or a hidden tab mid-flight:** the flight resumes at the same beat, and the wind bed does not keep sounding while paused. Pinned in Task 6.
3. **Several inputs at once:** a finger on „Hraðar!“ never starts a steer, a steer never taps an animal, and a second finger does nothing. Pinned in Task 11.
4. **A slow device:** sections ahead are built in time slices and are ready before they come into view, with no pop-in and no hitch. Pinned in Task 4 (with the harness's `slowBuilds`).
5. **Reduced motion** (`reduced` in the harness, `prefers-reduced-motion`): no orbit, no slow-motion crest, and banking halved. The flight still plays to the end. Pinned in Task 6.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `remake/chapters/kafli4-route.js` (new) | Route data in Árdalur coordinates: river centreline, flight curve, beat schedule, steer lanes, animal-group and cameo spots; pure functions over them. |
| `remake/engine/flier.js` (new) | Moves a winged actor along a route (heading, bank, pitch, clip choice), lateral steer, skim, burst; seats a rider who banks with the carrier. |
| `remake/world/ardalur/sections.js` (new) | Splits the route into 150 m sections; builds them in time slices ahead of the flier and shows only the near ones. |
| `remake/world/ardalur/terrain.js` (new) | Corridor terrain per section: valley floor, banks, gorge walls, the cliff of the falls, `heightAt(x, z)`. |
| `remake/world/ardalur/river.js` (new) | Sloped river ribbon with flow, rapids foam and the far pool. |
| `remake/world/ardalur/banks.js` (new) | Plants and rocks along the banks from `world/forest/species.js`; grey stand-ins when `grey: true`. |
| `remake/world/ardalur/far-land.js` (new) | The view above the falls: light whole-land heightfield, mountains, mist, Þórseðla far, Grameðla's shadow. |
| `remake/world/ardalur/index.js` (new) | `createArdalur(world, { grey, seed })`: puts the parts together as a location builder. |
| `remake/world/props/waterfall.js` (new) | Falling water, spray, rainbow and foam at the base. |
| `remake/engine/camera/flight-camera.js` (new) | Named flight shots (bound to the flier or fixed), transitions, roll, flight lint into `director.warnings`. |
| `remake/engine/input/swipe.js` (new) | Up-stroke and tap recognizer on top of `engine/input/pointer.js`. |
| `remake/engine/audio/flight-sounds.js` (new) | Speed-linked wind bed and water layers with their own gain and pan; whooshes and wingbeats. |
| `remake/chapters/kafli4-flight.js` (new) | The flight scene `theFlight(s, c)`: beats A–G, shots, lines, Mosi's cameos, the golden burst. |
| `remake/chapters/kafli4-flight-play.js` (new) | What Egill can do in the flight: steer, call the animals, „Hraðar!“ (button and rules). |
| `remake/chapters/flug.js` (new) | Review-only chapter: the flight alone, `?chapter=flug[&flugedla=10]`. |
| `remake/chapters/kafli4.js` (new) | The chapter: scenes 1–7, `WORDS`, `chapter` export. |
| `remake/chapters/kafli4-flugedla.js` (new) | Her life at the snag: perched with wings spread, the circle, sitting low to be boarded. |
| `remake/chapters/kafli4-wind.js` (new) | The wind task: gusts, wind fill, leaves, help timers. |
| `remake/tools/chapter-video.mjs` (new) | Records `index.html?chapter=<id>` to mp4 (CDP screencast, optional sound, per-second stats). |
| `remake/engine/locations.js` (modify) | A location may give its own `build(world)` instead of a forest `layout`. |
| `remake/engine/actor.js` (modify) | `scale` in an actor spec (uniform root scale), if not already supported. |
| `remake/engine/looks.js` (modify) | New look `earlyAfternoon`. |
| `remake/engine/scene/scene.js` (modify) | `s.onSwipe(fn)`. |
| `remake/engine/save.js` (modify) | `defaultChapter` knows chapter 4. |
| `remake/STYLE.md` (modify) | §8 gets the flight rules. |
| `remake/tools/audio-lines.mjs` (modify) | `kafli4` in `SETS`. |
| `remake/assets/audio/kafli4/` (new) | `lines-source.json`, recorded lines, `theme.json` when the owner's flight theme arrives, `CREDITS.md`. |
| `remake/world/props/speed-lines.js` (new) | Thin streaks near the camera during „Hraðar!“ (one draw call). |
| `remake/main.js` (modify, CRLF) | Debug context gets `timeline()`, and `window.__chapterEnd = true` is set when the chapter script ends (for the video tool). |
| `remake/tests/kafli4-route.test.mjs`, `flier.test.mjs`, `ardalur.test.mjs`, `flight-camera.test.mjs`, `flug.test.mjs`, `swipe.test.mjs`, `waterfall.test.mjs`, `flight-sounds.test.mjs`, `kafli4.test.mjs` (new) | Tests per unit. |

**Departures from the spec's file names (rulings, spec §9):**
- The looks live in `engine/looks.js`, so `earlyAfternoon` goes there; the spec's `engine/lighting.js` does not exist.
- The spec's `kafli4-ardalur.js` is split into `world/ardalur/*`, because the valley is world building (like `world/forest`), not chapter script.
- The spec's `kafli4-flight.js` is split three ways: route (`kafli4-route.js`), scene (`kafli4-flight.js`) and Egill's actions (`kafli4-flight-play.js`).
- The sky dome (`engine/sky.js`) has no mountains, so the mountains of the view are built in `far-land.js`.

---

## Chunk 1: The grey flight (animatic)

### Task 1: Worktree, launch entry and the video tool

**Files:**
- Create: `remake/tools/chapter-video.mjs`
- Modify: `remake/main.js` (CRLF: debug context `timeline: () => world.chapterTimeline`, and `window.__chapterEnd = true` where the chapter script's task ends), `C:/Risaeðla/.claude/launch.json` (outside git)

**Interfaces:**
- Produces: `node remake/tools/chapter-video.mjs --out <dir> --chapter <id> [--query "a=b"] [--size 1280x800] [--max 240] [--sound] [--stats] [--browser edge|chrome]` → `<dir>/video.mp4` (15 fps), `<dir>/report.json` `{ chapter, size, seconds, errors, warnings, timeline, stats: { median, worst, perSecond } }`.

- [ ] **Step 1:** Create the worktree from main: `git -C C:/Risaeðla/dino-yatzy-mosi worktree add C:/Risaeðla/dino-kafli4-flugedla -b kafli4-flugedla main`. Add launch entry `kafli4` → `C:/Risaeðla/dino-kafli4-flugedla/remake/tools/serve.mjs --port 4260`, port 4260.
- [ ] **Step 2:** Write `chapter-video.mjs` on the pattern of `remake/tools/veiddu-video.mjs` (throwaway static server, CDP screencast, `--sound` tap). It loads `remake/index.html?chapter=<id>&play=1&<query>`, starts at `window.__demoReady === true` and stops at `window.__chapterEnd === true` or at `--max`. `--stats` samples `window.__demoStats` once a second (and records the worst frame time), and `report.timeline` copies the debug context's `timeline()`. Exit 1 on a page error, 2 if the tool breaks.
- [ ] **Step 3:** Verify on chapter 2: `node remake/tools/chapter-video.mjs --out qa/remake/kafli4/check --chapter kafli2 --max 20 --stats`. Expected: `video.mp4` about 20 s, `report.errors` is `[]`.
- [ ] **Step 4:** Commit: `git add remake/tools/chapter-video.mjs && git commit -m "kafli4: chapter-video tool records a chapter to mp4 with per-second stats"`.

### Task 2: The route and its schedule

**Files:**
- Create: `remake/chapters/kafli4-route.js`
- Test: `remake/tests/kafli4-route.test.mjs`

**Interfaces:**
- Produces:
  - `export const BEATS = { A: 0, B: 15, C: 35, D: 80, E: 105, F: 125, G: 150, END: 170 }` (seconds from the flight's start).
  - `export const FASTER_LAST = 98` (the last second a burst may start, so the borrowed time is back by E).
  - `export function createRoute({ wingspan = 7.5 } = {}) → { curve: THREE.CatmullRomCurve3, length, river: [[x, z], ...], riverLevelAt(s), progressAt(t) → u (0..1), pointAt(u) → Vector3, tangentAt(u) → Vector3, nearestU(point) → u, beatAt(t) → 'A'..'G', lanes: [{ from, to, half: 4 }], groups: [{ id, kind, at: [x, y, z], u }], cameos: { bank: { at, path }, rim: { at } }, tree: [x, y, z], pool: { center: [x, z], radius } }`.
- Geometry decisions:
  - Árdalur has its own coordinates. The white snag stands at the origin, top at y = 10.5.
  - The river runs west from about 120 m south-west of the snag. The gorge starts about 1.0 km upstream, and the falls are about 1.35 km upstream, 40 m high.
  - The far pool lies north of the river, downstream of the gorge, about 0.6 km from the falls.
  - Flight altitude: 2–3 m above the water in B–C, 4–6 m in the gorge. The climb in E goes 3 m clear of the falling water. In F she is 20–30 m above the top of the falls. G glides down to the pool.
  - Speeds that fill the schedule: 14 m/s in B, 16 in C, 14 in D, 10 in the E climb, 8 in F, 10 in G.

- [ ] **Step 1: Write the failing tests**

```js
test('the beats come in the spec order and the flight lasts 170 s', () => {
  assert.deepEqual(Object.keys(BEATS), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'END']);
  assert.equal(BEATS.END, 170);
});
test('progress is monotonic and spans the route', () => {
  const r = createRoute();
  let last = -1;
  for (let t = 0; t <= 170; t += 0.5) { const u = r.progressAt(t); assert.ok(u >= last); last = u; }
  assert.equal(r.progressAt(0), 0); assert.equal(r.progressAt(170), 1);
});
test('speeds stay within 6..18 m/s and the falls are climbed in E', () => {
  const r = createRoute();
  for (let t = 1; t < 170; t += 1) {
    const v = r.curve.getPointAt(r.progressAt(t)).distanceTo(r.curve.getPointAt(r.progressAt(t - 1)));
    assert.ok(v >= 6 && v <= 18, `t=${t} v=${v}`);
  }
  const y = t => r.pointAt(r.progressAt(t)).y;
  assert.ok(y(BEATS.F) - y(BEATS.E) >= 40);
});
test('five animal groups along C in order: frogs, snails, dragonflies, turtle, small dinosaurs', () => {
  const r = createRoute();
  assert.deepEqual(r.groups.map(g => g.kind), ['frogs', 'snails', 'dragonflies', 'turtle', 'lizards']);
  const uC = r.progressAt(BEATS.C), uD = r.progressAt(BEATS.D);
  assert.ok(r.groups.every((g, i, a) => g.u > uC && g.u < uD && (i === 0 || g.u > a[i - 1].u)));
});
test('the route ends in the far pool', () => {
  const r = createRoute(); const end = r.pointAt(1);
  assert.ok(Math.hypot(end.x - r.pool.center[0], end.z - r.pool.center[1]) < r.pool.radius);
});
```

- [ ] **Step 2:** Run it to check it fails. `node --import ./remake/tests/setup.mjs --test remake/tests/kafli4-route.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `kafli4-route.js`.** The curve is centripetal Catmull–Rom through hand-placed points. `progressAt(t)` integrates a piecewise speed profile, with eased changes at beat boundaries, normalised so `progressAt(170) === 1`. Store the profile as a table of `[t, speed]`.
- [ ] **Step 4:** Run it to check it passes. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "kafli4: the flight route and schedule (beats A–G, speeds, groups, pool)"`, adding the new files.

### Task 3: The flier controller and a rider who banks with her

**Files:**
- Create: `remake/engine/flier.js`
- Modify: `remake/engine/actor.js` (spec `scale`, only if missing)
- Test: `remake/tests/flier.test.mjs`

**Interfaces:**
- Consumes: Task 2 `createRoute()`; `actor.control(driveFn, poseFn)` and `actor.play(clip, { fade, once })` (`engine/actor.js:504`, `:194`); `carryRider(rider, { drive(dt), end() })` (`engine/riding.js:415`); `createSeat(host, { bone, offset, grips })` (`engine/riding.js:346`).
- Produces:
  - `export function createFlier(actor, route, { world }) → { route, u, update(t), steer(x), skim(on), burst() → boolean, extra, bank, speed, offset, pose: { position, quaternion }, stop() }`. `update(t)` takes the flight's own time in seconds (game clock) and writes `world.flightU = u`.
  - `steer(x)`: x in −1..1 maps to a lateral offset up to `lane.half` (4 m), eased back to 0 within 1.5 s when 0.
  - `skim(true)`: lowers to 0.6 m above `route.riverLevelAt(s)`; back up within 1.5 s.
  - `burst()`: ×1.6 speed for 2.5 s. It returns false during the 3 s cooldown or after `FASTER_LAST`. The `extra` progress decays to 0 within 4 s after the burst.
  - Bank: up to 30° from curvature plus steer. Clips: `fly` when climbing or bursting, `glide` otherwise, `takeOff` and `land` on demand (fade 0.6).
  - `export function rideFlier(rider, flier, { bone, offset }) → { stop() }`: the rider takes the seat bone's full world transform (yaw, pitch and roll), Egill's `sit` clip, his hands on the neck.
  - Actor spec `scale` (number): uniform root scale. `chapters/flug.js` uses it for the size test.

- [ ] **Step 1: Write the failing tests** (in the harness, with the real `pteranodon.glb` via `chapterWorld`):

```js
test('the flier follows the route and banks no more than 30 degrees', ...);
// sample t=0..170: |pose.position - route.pointAt(progressAt(t)) - offset| < 0.05; |bank| <= 30
test('a steer comes back to the line within 1.5 s and never leaves the lane', ...);
// steer(1) for 2 s: |offset| <= 4; steer(0): |offset| < 0.1 after 1.5 s
test('bursts are refused in cooldown and after FASTER_LAST, and the borrowed time is back by E', ...);
// burst() at 40 → true; at 41 → false; spam burst() every 0.1 s from 35 to 105:
// progress at BEATS.E equals route.progressAt(BEATS.E) within 1e-6
test('the rider banks with her and stays on the seat', ...);
// at the tightest turn: rider root within 0.05 m of the seat, rider roll within 1 degree of hers
test('an actor spec scale scales the root', ...);
```

- [ ] **Step 2:** Run the tests to check they fail.
- [ ] **Step 3:** Implement. Follow the pattern of `engine/hals/friends.js:16-75`: heading from two curve points, `rotateX` for the bank, `rotateZ` for the climb pitch. Read the seat bone and offset from the carry clip's bake report (`tools/bake/winged-clips.js`, `tests/pteranodon.test.mjs:540`).
- [ ] **Step 4:** Run the tests to check they pass, then run `pteranodon.test.mjs` and `riding`-related tests too.
- [ ] **Step 5:** Commit: `kafli4: flier controller on a route, steer, skim, burst; rider banks with the carrier`.

### Task 4: Árdalurinn in grey, built in sections

**Files:**
- Create: `remake/world/ardalur/{index,sections,terrain,river,banks}.js`
- Modify: `remake/engine/locations.js` (custom builder)
- Test: `remake/tests/ardalur.test.mjs`

**Interfaces:**
- Consumes: Task 2 `createRoute()`; `world/forest/slices.js` `runSliced(steps, { budget, wait, onSlice, now })`.
- Produces:
  - `export function createArdalur(world, { grey = false, seed = 4 }) → { group, route, heightAt(x, z), sections, update(t, camera), dispose() }`. Sections are chosen around `world.flightU`, and around `route.nearestU(camera.position)` too, so a fixed shot away from her still has its ground.
  - `export function createSections(route, { length = 150, ahead = 2, behind = 1 }) → { list: [{ index, from, to, built, visible }], wanted(u) → indices, update(u) }`
  - In `engine/locations.js`, a location `{ build: world => place, shots }` builds `place` instead of `createForest`. It sets `world.heightAt = place.heightAt` and `world.forest = null`, and calls `place.update(t, camera)` each frame.
- Decisions:
  - Terrain is one heightfield strip per section, 2 m grid across ±140 m from the river (±40 m in the gorge, where walls rise 30–45 m).
  - Grey means flat materials (#9a9a9a ground, #7d8a94 water, #b0b0b0 rocks). Plants are cones and boxes at the species' real heights, and groups are marked by spheres.
  - The far-land and waterfall slots exist as grey boxes and planes, so the animatic shows them.

- [ ] **Step 1: Write the failing tests:**

```js
test('sections cover the route and only near ones are visible', ...);
// list spans u 0..1; for u in 0..1: visible indices ⊆ wanted(u) and wanted(u).length <= 4
test('a section ahead is built before it is wanted (slow builds)', ...);
// playUnattended(flug, { slowBuilds: true }) records per frame: no section becomes visible while built === false
test('the river surface is under the flier everywhere in B–D, and the terrain clears the lane by 2 m', ...);
// for t in [15, 105], lateral -4..4: heightAt(p) <= p.y - 2 except over water, where it is the river level
test('each section stays within the forest budget', ...);
// shotStats-style count per section: triangles <= 150000, calls <= 60
test('a location with build() is used instead of a forest layout', ...);
```

- [ ] **Step 2:** Run the tests to check they fail.
- [ ] **Step 3:** Implement. Section steps are generator steps for `runSliced`, so builds cost about one frame each.
- [ ] **Step 4:** Run the tests to check they pass. Also run `forest-slices.test.mjs` and `fen.test.mjs`, which must be unchanged.
- [ ] **Step 5:** Commit: `kafli4: Árdalurinn in grey, sections built in slices ahead of the flier`.

### Task 5: The flight camera and its rules

**Files:**
- Create: `remake/engine/camera/flight-camera.js`
- Modify: `remake/STYLE.md` (§8, new subsection "Flug (kafli 4)")
- Test: `remake/tests/flight-camera.test.mjs`

**Interfaces:**
- Consumes: the director from `createDirector` (`engine/camera/director.js:83`), `follow(subject, { offset, local, look, lookOffset, fov, stiffness, maxSpeed })`, `cut(shot)`, `warnings`; Task 3 `flier.pose`, `flier.bank`.
- Produces:
  - `export const FLIGHT_RULES = { roll: 8, minShot: 2.5, quick: { minShot: 1.5, max: 3 }, bound: { dolly: 1.2, pan: 15 }, fixed: { pan: 40 } }`
  - `export function createFlightCamera(director, flier) → { shot(name, { cut = true, seconds, quick = false }), boost(on), shots, roll, update(dt) }`. `boost(true)` widens the lens by 8° over 0.4 s, and `boost(false)` takes it back over 1 s.
  - Named shots: `chase` (behind and above Egill's shoulder, local offset [−6.5, 2.4, 0], looking 12 m ahead), `face` (in front of Egill, [2.2, 0.6, 0], looking back at his head), `side` ([0, 0.8, 7]), `orbit` (a 120° circle at 9 m over 8 s), `belowTakeOff`, plus fixed shots placed through `route`: `waterLevel`, `bankShadow`, `mosiBank`, `gorgeHigh`, `fallsSide`, `vista`.
  - Camera roll is a third of her bank, clamped to 8°.
  - Flight lint pushes `{ time, message: 'flight: …' }` into `director.warnings`. A bound shot breaks the rule when its offset moves faster than 1.2 m/s or its look turns faster than 15°/s relative to her. A fixed shot breaks it when it pans faster than 40°/s. A shot also breaks it when it is shorter than 2.5 s, or 1.5 s for at most three `quick` shots.

- [ ] **Step 1: Write the failing tests:**

```js
test('roll follows a third of her bank and never exceeds 8 degrees', ...);
test('a shot shorter than 2.5 s warns, a quick one of 1.5 s does not, the fourth quick one does', ...);
test('a fixed shot panning faster than 40 deg/s warns', ...);
test('every named shot frames her and Egill at 16:10 and at an upright 0.625', ...);
// project flier root and Egill head: inside the frame, faces above the bottom 30%, nothing in the top 8%
```

- [ ] **Step 2:** Run the tests to check they fail.
- [ ] **Step 3:** Implement on top of `director.follow` (it is not linted, so the flight lint lives here). Roll is applied to `director.rig` after `follow` sets the pose. Write the rules into STYLE.md §8 in Icelandic, with the numbers of `FLIGHT_RULES`.
- [ ] **Step 4:** Run the tests to check they pass, together with `director.test.mjs`.
- [ ] **Step 5:** Commit: `kafli4: flight camera, bound and fixed shots, roll and flight lint; STYLE §8 flight rules`.

### Task 6: The grey flight scene, the review chapter and the first video

**Files:**
- Create: `remake/chapters/kafli4-flight.js`, `remake/chapters/flug.js`, `remake/engine/audio/flight-sounds.js`
- Test: `remake/tests/flug.test.mjs`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  - `export function* theFlight(s, c)`. `c` holds `{ world, flugedla, egill, mosi, route, flier, camera, sounds, say, mark }`. It marks `c.flight = { beat, started }`, runs beats A–G and ends with her over the pool at `BEATS.END`.
  - `chapters/flug.js` exports `chapter`:
    - `id: 'flug'`, `look: 'lateMorning'` (until Task 10 adds `earlyAfternoon`), `start: 'ardalur'`;
    - `locations: { ardalur: { build: w => createArdalur(w, { grey: !params.has('lit') }), shots } }`;
    - `actors` for flugedla (`pteranodon.glb`, `scale: (Number(params.get('flugedla')) || 7.5) / 7.5`), egill and mosi;
    - `lines` from the flight's part of `WORDS` (captions only until Task 15);
    - `*script(s)`: Egill seated on her at the snag top, then `yield* theFlight(s, c)`.
  - `export function createFlightSounds({ context, output, noise }) → { start(), setSpeed(v), setPan(p), whoosh(side), wingbeat(), gust(), water(level), falls(level), pause(), resume(), stop() }`. The wind bed is synthesized now (filtered noise whose gain and cutoff follow speed) and swapped for recordings in Task 16.
  - Music in the flight: the chapter theme rises at take-off and plays louder through the flight (spec §8: "sama stef hærra"). If game music has no level control, add `music.setLevel(level, seconds)` next to the music player and test it.
- Beat contents follow spec §5 exactly: shots, lines, Mosi's two cameos (bank in C, rim in D), the slow-motion second at the crest of E (game time ×0.25 for 1 s; under `reduced` it is skipped), and the orbit in F (under `reduced` it becomes the `vista` shot).

- [ ] **Step 1: Write the failing tests:**

```js
test('the flight plays unattended to the end with no warnings', async () => {
  const { task, world, director } = await playUnattended(flugModule, { limit: 240, seeking: true });
  assert.equal(task.failed, false, String(task.error?.stack));
  assert.deepEqual(world.chapterTimeline.map(m => m.scene), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.deepEqual(director.warnings, []);
});
test('beats start on schedule', ...);         // each beat's mark within 0.5 s of BEATS
test('Mosi is seen in C and in D', ...);       // captions include 'Bíðið eftir mér!' and 'Ég fer styttri leiðina!' in their beats
test('pausing at 60 s holds the beat and silences the wind bed', ...);
test('reduced motion: no orbit, no slow crest, the flight still ends at 170 s', ...);
test('seeking twice to t=90 puts her in the same place', ...);
```

- [ ] **Step 2:** Run the tests to check they fail.
- [ ] **Step 3:** Implement `theFlight`, `flug.js` and `flight-sounds.js`. Mosi's cameos: place him off camera before the cut, then `walkTo` along the cameo path at 4 m/s with the `walk` clip at `timeScale` 2.2.
- [ ] **Step 4:** Run the tests to check they pass.
- [ ] **Step 5: The size test.** Take stills of the `face` and `side` shots at 7.5 m and 10 m: `node remake/tools/capture.mjs --out qa/remake/kafli4/staerd --size 1280x800 --shot s75="chapter=flug&t=40" --shot s10="chapter=flug&flugedla=10&t=40"`.
- [ ] **Step 6: The video.** Record `node remake/tools/chapter-video.mjs --out qa/remake/kafli4/butur1 --chapter flug --sound --stats`, plus an upright clip (`--size 800x1280 --max 60`). Commit, then show the owner the video and the size stills. The owner approves the pacing and picks the size before chunk 2.
- [ ] **Step 7:** Commit: `kafli4: the grey flight (animatic), the flug review chapter, the synthesized wind bed`.

## Chunk 2: Árdalurinn

### Task 7: The real valley

**Files:**
- Modify: `remake/world/ardalur/{terrain,river,banks}.js`
- Test: `remake/tests/ardalur.test.mjs` (extend)

**Interfaces:**
- Consumes: forest species from `world/forest/species.js` (fern, treeFern, cycad, horsetailReed, horsetailTall, swampConifer, araucaria, rock, rockSmall, log, waterLily, mossHummock, deadSnag); batch and cull (`world/forest/batch.js`); water colours from `world/props/water.js`.
- Produces: `createArdalur(world, { grey: false })` looks like the Fen and the forest; the river has flow, rapids foam in the gorge and lilies in the lazy reach; the gorge walls are layered sandstone like the memory game's cliffs.
- Decisions:
  - If the owner picked 10 m in Task 6, apply it first: STYLE.md §3, `chapters/lineup.js` and the default in `flug.js`.
  - The reeds bend under her as she passes (spec §5 B): the bank plants' sway shader gets a downwash point and radius (her position, 8 m), on top of the shared wind.
  - The section budget is ≤ 150k triangles and ≤ 60 calls, the forest's share of STYLE §11.
  - Plants are culled with per-species `CULL_DISTANCE`.
  - Flow speed: 0.4 m/s in the lazy reach, 2.5 m/s in the rapids.

- [ ] **Step 1:** Extend the tests: the budget per section with `grey: false`, the rapids exist only between the gorge start and the falls, and the bank plants keep out of the flight lane (no plant within 3 m of the curve at any steer).
- [ ] **Step 2:** Run the tests to check they fail. **Step 3:** Implement. **Step 4:** Run the tests to check they pass.
- [ ] **Step 5:** Commit, then measure key shots with `capture.mjs --bench 120` at t = 20, 50, 70 and 90 on `chapter=flug&lit=1`. All must be ≤ 6.0 ms, ≤ 100 calls and ≤ 250k triangles.

### Task 8: The animal groups

**Files:**
- Modify: `remake/world/ardalur/banks.js` or a new `remake/world/ardalur/animals.js`
- Test: `remake/tests/ardalur.test.mjs`

**Interfaces:**
- Consumes: `world/critters/models.js` (frogs, snails, dragonflies), Task 2 `route.groups`.
- Produces: `createAnimals(world, route) → { groups: [{ id, kind, point, answer() → Handle }], update(t) }`. Each `answer()`:
  - frog: jumps and croaks;
  - snails: lift their eye stalks;
  - dragonflies: a swarm that follows her for 4 s;
  - turtle: stretches its neck;
  - small dinosaurs: squeak and run along the bank for 5 s.
- Decision: the turtle and the small dinosaurs need models. List CC0 candidates (Quaternius, Poly Pizza, Kenney) with name, source and size, and **ask the owner before downloading**. If he prefers, he makes them in Tripo. Until then they stay grey spheres.

- [ ] **Step 1:** Write tests: five groups with `answer()` handles that finish, and each group answers once.
- [ ] **Step 2:** Run the tests to check they fail. **Step 3:** Implement. **Step 4:** Run the tests to check they pass.
- [ ] **Step 5:** Commit. Video of chunk 2 (`chapter-video.mjs --chapter flug --query lit=1`) and stills of the key shots at both sizes, to the owner.

## Chunk 3: The falls and the view

### Task 9: The waterfall

**Files:**
- Create: `remake/world/props/waterfall.js`
- Test: `remake/tests/waterfall.test.mjs`

**Interfaces:**
- Produces: `export function createWaterfall(world, { top: [x, y, z], bottom: [x, y, z], width = 14, seed }) → { group, update(t, sunDir), sprayLevel(point) → 0..1, dispose() }`. It has:
  - a falling ribbon with a scrolling shader;
  - spray from `glints` (`world/props/sparkles.js`) at the base and along the face;
  - a rainbow arc, visible when the sun is behind the camera within 50° of the view;
  - foam rings at the base.
- Budget: ≤ 6 calls and ≤ 20k triangles. Nothing flashes, and spray brightness changes stay within 15 % per frame.

- [ ] **Step 1:** Write tests for the budget, `sprayLevel` (1 at the base, 0 at 30 m away) and the rainbow's sun-angle rule.
- [ ] **Step 2:** Run the tests to check they fail. **Step 3:** Implement. **Step 4:** Run the tests to check they pass.
- [ ] **Step 5:** Commit: `kafli4: the waterfall (ribbon, spray, rainbow, foam)`.

### Task 10: The view, Grameðla's shadow and the golden light

**Files:**
- Create: `remake/world/ardalur/far-land.js`
- Modify: `remake/chapters/kafli4-flight.js` (beats E and F), `remake/engine/looks.js` (`earlyAfternoon`), `remake/chapters/flug.js` (`look: 'earlyAfternoon'`)
- Test: `remake/tests/ardalur.test.mjs`, `remake/tests/flug.test.mjs`, `remake/tests/looks.test.mjs` (or wherever the looks are tested)

**Interfaces:**
- Produces: `createFarLand(world, route) → { group, show(on), gramedla: { shadow, roar() }, update(t, camera) }`, visible only from E's crest to the end of F. It is a light heightfield of the whole map, with colours from the painted map:
  - forest green;
  - Fen gold;
  - the blue river;
  - Kambeðla's plates blinking far off;
  - Þórseðla's head by character LOD;
  - mountain silhouettes and `mist.js` cards;
  - Grameðla as a dark, slowly moving silhouette in the mist.
- `LOOKS.earlyAfternoon`: sun azimuth 215°, elevation 22° (lower than `lateMorning`'s 26°), a warmer sun colour, and the rest blended 40 % of the way from `lateMorning` toward `golden`.
- The golden light tweens sun colour and intensity, hemi and fog `sunColor`/`sunStrength` from the chapter look toward `LOOKS.golden` over 2 s at the burst out of the spray, and back over 4 s in G.
- In the slow second at the crest of E the music drops to silence and only the wind is heard. It comes back with the burst into the light.
- Grameðla's roar is the recorded `gramedlaRoar` at a level of 0.25.

- [ ] **Step 1:** Write tests:
  - the far land is hidden before E and after F;
  - the key F shot is within budget;
  - the roar plays once in F;
  - the music is silent for the slow second and back after it;
  - the light is back to the chapter look by `BEATS.END`;
  - `earlyAfternoon` has the sun at 215°/22° and lies between `lateMorning` and `golden`.
- [ ] **Step 2:** Run the tests to check they fail. **Step 3:** Implement. **Step 4:** Run the tests to check they pass.
- [ ] **Step 5:** Commit. Video of E–G to the owner.

## Chunk 4: What Egill can do

### Task 11: Steer, call the animals, „Hraðar!“

**Files:**
- Create: `remake/chapters/kafli4-flight-play.js`, `remake/world/props/speed-lines.js`
- Modify: `remake/chapters/kafli4-flight.js`
- Test: `remake/tests/flug.test.mjs`

**Interfaces:**
- Consumes: Task 3 `flier.steer/skim/burst`; Task 8 `groups[i].answer()`; `pointer.on('drag')` and `s.target`/`s.onTap` (`engine/scene/scene.js:170-208`).
- Produces: `export function flightPlay(s, c) → { enable(kind, on), stop() }`, with kind being `'steer'`, `'call'` or `'faster'`:
  - `steer`: on only in chase shots in B, C and D before 92 s. A horizontal drag maps to `steer(dx / (0.35 * width))`, a downward drag over 40 px to `skim(true)`. A skim splashes the water and Egill laughs (`k4_egill_laugh`, at most once in 10 s). A glowing finger hint shows on the first chase shot.
  - `call` in C: each group is a tap target with a radius of at least twice its size. A tap makes her call (one of `k4_flugedla_call1..3`, rotating) and the group answers. A group not tapped by the time it is 25 m ahead is called automatically. A voiced call is skipped if a line is playing, but the answer still happens.
  - `call` in F: the big call comes by itself 8 s into F. A tap on the land before then starts it at once. It comes only once either way.
  - `faster`: a round 96 px DOM button, class `flight-faster`, in a lower corner of the overlay element where `main.js` puts the „Áfram“ pill. It is visible only when `burst()` could succeed. It shows a wing (an open icon, such as game-icons.net's feathered wing under CC BY 3.0, credited, after the owner's yes; until then the word „Hraðar!“). A burst calls `camera.boost(true)` for its 2.5 s, shows the speed lines and raises the wind. Egill says `k4_egill_faster1` or `k4_egill_faster2` on the first burst and every third after it, and she answers `k4_flugedla_holdon`.
  - Speed lines: `createSpeedLines(world, camera) → { show(on), update(dt) }`, one draw call, streaks that fade in over 0.3 s and out over 0.6 s, never flashing.
- Input rules: a pointer that starts on the button never steers, a drag never fires a group tap, and one drag at a time (pointer.js already allows only one).

- [ ] **Step 1: Write the failing tests:**

```js
test('nothing touched: every group is still called once and the flight ends at 170 s', ...);
test('a tap on a group calls it at once; the same group is not called again', ...);
test('steering is ignored outside chase shots and after 92 s', ...);
test('a press on Hraðar! does not steer, and Hraðar! is hidden after FASTER_LAST', ...);
test('a burst widens the lens by 8 degrees and it comes back', ...);
test('a second finger during a steer changes nothing', ...);
test('a tap on the land in F brings the big call early, and it comes only once', ...);
test('mashing everything still meets every beat within 0.5 s', ...);
```

- [ ] **Step 2:** Run the tests to check they fail. **Step 3:** Implement. **Step 4:** Run the tests to check they pass.
- [ ] **Step 5:** Commit. Two videos to the owner: one with everything used (a scripted input track in `chapter-video.mjs --query play=track1`, read by `flug.js` in debug only), one with nothing touched.

## Chunk 5: The start of the chapter (waits for chapter 3 in main)

**Gate:** start only when chapter 3 exists in main (`git -C C:/Risaeðla/dino-yatzy-mosi cat-file -e main:remake/chapters/kafli3.js`). Then `git merge main` into `kafli4-flugedla`, resolve and run the whole suite.

### Task 12: kafli4.js with scenes 1–2, the save and the order

**Files:**
- Create: `remake/chapters/kafli4.js`, `remake/chapters/kafli4-flugedla.js`
- Modify: `remake/engine/save.js`, `remake/chapters/kafli3.js` (`next`), `remake/tests/kafli3.test.mjs` (its `next` assertion)
- Test: `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Consumes: chapter 3's Fen location (`kafli3.locations.fen`, reused like `kafli1.locations.burknalaut` at `kafli2.js:52`); `mapMoment(s, c, { pieces: ['d'], line: 'k4_mosi_map_tree', speak })` (`engine/scene/map-moment-scene.js:26`); `LOOKS.earlyAfternoon` (Task 10).
- Produces:
  - `export const chapter = { id: 'kafli4', title: 'Boð til Flugeðlu', next: null, look: 'earlyAfternoon', theme: 'kafli2/theme.json', start: 'fen', locations: { fen, ardalur }, actors, cast, lines, *script }`.
  - `defaultChapter(save)`: extend the rules the kafli-uggedla merge brings (on that branch: `kafli1` without `k1_kambedla`, else `kafli3` with `k2_uggedla`, else `kafli2`). A save with both `k2_uggedla` and `k2_thorsedla` opens `kafli4`, and so does one that also has `k4_flugedla`. Every earlier answer stays as it was.
  - `kafli3.next = 'kafli4'`.
  - `kafli4-flugedla.js`: `perch(c)` (on the snag top, wings spread, still), `circle(c)` (one circle round the tree, back to the perch), `sitLow(c, spot)` (lands by the tree and lowers her back for boarding).
  - The Fen shots the chapter adds (spec §3): Þórseðla's pond as they leave, the walk across the Fen, and the white tree from the ground, from above and at her height. Each has a 16:10 and an upright framing.
  - Scenes 1–2 per spec §4, with the lines of `WORDS`.

- [ ] **Step 1: Write the failing tests:**

```js
test('defaultChapter opens chapter 4 after Þórseðla and keeps every earlier answer', () => {
  const cases = [[[], 'kafli1'], [['k1_kambedla'], 'kafli2'], [['k1_kambedla', 'k2_uggedla'], 'kafli3'],
    [['k1_kambedla', 'k2_uggedla', 'k2_thorsedla'], 'kafli4'],
    [['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla'], 'kafli4']];
  for (const [stars, want] of cases) assert.equal(defaultChapter(fakeSave(stars)), want);
});
test('every new Fen shot keeps the director quiet at 16:10 and upright', ...);
test('kafli3 hands over to kafli4', () => assert.equal(kafli3.chapter.next, 'kafli4'));
test('scene 1 draws map piece d and Þórseðla says goodbye on a tap', ...);
test('scene 2 ends with her calm line and Egill\'s answer', ...);
```

- [ ] **Step 2:** Run the tests to check they fail. **Step 3:** Implement. **Step 4:** Run the tests to check they pass, together with `kafli3.test.mjs` and `save.test.mjs`.
- [ ] **Step 5:** Commit. Video of scenes 1–2 to the owner.

## Chunk 6: The wind

### Task 13: The swipe and the wind task

**Files:**
- Create: `remake/engine/input/swipe.js`, `remake/chapters/kafli4-wind.js`
- Modify: `remake/engine/scene/scene.js` (`s.onSwipe`)
- Test: `remake/tests/swipe.test.mjs`, `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Produces:
  - `export function createSwipe(pointer, { height, now }) → { on(fn) → unsubscribe, dispose() }`. `fn({ kind: 'up' | 'tap', x, y })`. An up stroke is a drag ending with −dy ≥ 0.2 × height; a tap is a pointer 'tap'. Down and side strokes are ignored.
  - `s.onSwipe(fn) → unsubscribe`.
  - `export function* theWind(s, c)` per spec §4.3:
    - an up stroke counts 1 and a tap 0.5;
    - 6 fills the wind;
    - each gust raises `world.wind.uniforms.uWindStrength` to 2.2 and eases it back to 1 over 1.2 s;
    - each gust sends leaves and seeds from `glints` along the stroke, bends the reeds, stirs her wings and sounds `sounds.gust()`;
    - Egill and Mosi blow along on the child's gusts (Egill every second gust, Mosi on the third), and she says `k4_flugedla_more` after the third;
    - a hint after 6 s, Mosi's demonstration (`k4_mosi_blow`) after 12 s, and one automatic gust every 4 s after 20 s;
    - when full: a big gust, the clouds drift, `k4_flugedla_now`, and she lifts.
  - The sway cap of STYLE (3°) holds at strength 2.2: check with `forest-sway.test.mjs`.

- [ ] **Step 1: Write the failing tests:**

```js
test('an up stroke of a fifth of the height is a swipe; a shorter or downward one is not', ...);
test('a tap is reported as kind tap', ...);
test('six up strokes fill the wind; twelve taps do too', ...);
test('untouched, the wind fills by itself and the scene ends within 60 s of its start', ...);
test('the forest sway stays within 3 degrees at gust strength', ...);
```

- [ ] **Step 2:** Run the tests to check they fail. **Step 3:** Implement. **Step 4:** Run the tests to check they pass.
- [ ] **Step 5:** Commit: `kafli4: up-stroke recognizer and the wind task`.

### Task 14: The star, boarding and take-off into the flight

**Files:**
- Modify: `remake/chapters/kafli4.js`
- Test: `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Consumes: `s.star('k4_flugedla', from)`; `floatTo(egill.raw, seat)` (`engine/riding.js:505`); Task 3 `rideFlier`; Task 6 `theFlight`.
- Produces:
  - Scenes 4–5 per spec.
  - The switch from Fen to Árdalur happens under the `face` close-up as she says `k4_flugedla_hold`. Árdalur's first section repeats the snag and the Fen plants round it, so the cut can be done with `s.goTo('ardalur', { fade: 0 })`. If `goTo` cannot cut without a fade, add `fade: 0` support in `engine/locations.js` and test it.
- [ ] **Step 1:** Write tests: the star is earned once (playing again with `k4_flugedla` in the save gives no second star), Egill is seated before the cut, and there is no black frame (no `s.fade` in the switch).
- [ ] **Step 2:** Run the tests to check they fail. **Step 3:** Implement. **Step 4:** Run the tests to check they pass.
- [ ] **Step 5:** Commit. Video of scenes 3–6 to the owner.

## Chunk 7: Sound and voices

### Task 15: Flugeðla's voice and every line

**Files:**
- Create: `remake/assets/audio/kafli4/lines-source.json`
- Modify: `remake/tools/audio-lines.mjs` (`SETS.kafli4`), `remake/assets/audio/voices.json` (`flugedla`), `remake/chapters/kafli4.js` (`WORDS`)
- Test: `remake/tests/kafli4.test.mjs` (lines test like `kafli2.test.mjs:42`)

**Interfaces:**
- `WORDS` (ids and texts, verbatim from spec §4–5; three items are this plan's additions, marked *):

| id | text |
| --- | --- |
| k4_mosi_next | Næst er það Flugeðla! Hún á heima uppi á hvíta trénu. |
| k4_egill_fly | Getur hún flogið? |
| k4_mosi_higher | Hærra en skýin! |
| k4_mosi_map_tree | Yfir Fenið, að hvíta trénu. |
| k4_mosi_invite | Halló, Flugeðla! Viltu koma á Stjörnuhátíðina í kvöld? |
| k4_flugedla_calm | Hátíð! Ég skal kalla á allan skóginn! En það er logn… og án vinds kemst ég ekki á loft. |
| k4_egill_wind | Við getum búið til vind! |
| k4_mosi_swipe | Strjúktu upp, Egill! |
| k4_mosi_blow * | Svona! Fúúú! |
| k4_flugedla_more | Meira! Ég finn hann! |
| k4_flugedla_now | Nú! |
| k4_flugedla_thanks | Takk! Ég kem á hátíðina og kalla á alla! |
| k4_mosi_star | Fjórða stjarnan! |
| k4_flugedla_comealong | Viltu koma með, Egill? Sestu á bakið á mér. |
| k4_egill_yes | Já! |
| k4_mosi_run | Fljúgið þið, ég hleyp! |
| k4_flugedla_hold | Haltu þér fast! |
| k4_egill_wow | Vááá! |
| k4_flugedla_call1 | Hátíð í kvöld! Komið öll! |
| k4_flugedla_call2 * | Komið á Stjörnuhátíðina! |
| k4_flugedla_call3 * | Allir á hátíðina í kvöld! |
| k4_mosi_wait | Bíðið eftir mér! |
| k4_egill_vaa | Vá! |
| k4_mosi_shortcut | Ég fer styttri leiðina! |
| k4_egill_falls | Sjáðu fossinn! |
| k4_flugedla_up | Upp með honum! |
| k4_flugedla_gramedla | Þarna, handan fjallanna, býr Grameðla. |
| k4_egill_big | Er hún stór? |
| k4_flugedla_biggest | Stærst af öllum! |
| k4_egill_all | Ég sé allt! |
| k4_flugedla_wind | Takk fyrir vindinn, Egill. |
| k4_flugedla_pool | Sjáðu, fjarlæga tjörnin. Þar býr Slóeðla. |
| k4_egill_mosi | Ég sé Mosa! |
| k4_egill_laugh * | Hí hí hí! |
| k4_egill_faster1 | Hraðar! |
| k4_egill_faster2 | Hraðar! (a second take, its own seed) |
| k4_flugedla_holdon | Haltu þér! |
| k4_mosi_arrived | Ég… er… kominn! |
| k4_egill_what | Hvað var þetta? |
| k4_mosi_horn | Lúðurinn hennar Slóeðlu… en lagið var eitthvað skrítið. |

  The big call in F reuses `k4_flugedla_call1` at a level of 1.2 with an echo. The owner hears the four additions (*) first, and may cut them. (Egill's laugh is in the spec, §6, but has no words there.)
- [ ] **Step 1: The voice.** This step may run alongside chunk 1 (spec §10), as soon as the owner has confirmed her personality. Design 4–6 voices with ElevenLabs Voice Design: a native Icelandic woman, young, cheerful and free, laughing in the wind (personality per spec §11, which the owner confirms first). Reuse the voice-design script of the chapter 2 work if it is in main by then; otherwise write `remake/tools/voice-design.mjs` on the same pattern. Put them on a listening page `qa/remake/kafli4/rodd/`, and the owner picks. Write the pick into `voices.json` as `flugedla`.
- [ ] **Step 2:** Write the lines test (each `lines-source.json` entry matches `chapter.lines`, ids match `k4_<speaker>_*`, `lines.json` has `src` `assets/audio/kafli4/<id>.mp3`) and run it to check it fails.
- [ ] **Step 3:** Fill `lines-source.json`, add `kafli4` to `SETS` and record: `node remake/tools/voice-lines.mjs --set kafli4`. Words missing from `pronunciation.json` get candidates on the yes/no page (`qa/remake/voices/framburdarbok/jaedanei.html`) and go in canonically (`JSON.stringify(j, null, 2) + '\n'`).
- [ ] **Step 4:** The owner listens to every line (yes/no page); re-take the rejected ones. Run the test to check it passes.
- [ ] **Step 5:** Commit: `kafli4: Flugeðla's voice and all chapter 4 lines`.

### Task 16: Wind, water and music

**Files:**
- Modify: `remake/engine/audio/flight-sounds.js`, `remake/engine/audio/sfx.js` (SAMPLES), `remake/chapters/kafli4.js` (theme)
- Create: `remake/assets/audio/kafli4/CREDITS.md`, `remake/assets/audio/kafli4/theme.json` (when the owner's track arrives)
- Test: `remake/tests/flight-sounds.test.mjs`

**Interfaces:**
- `createFlightSounds` keeps its Task 6 signature. Inside:
  - recorded loops: steady airflow, river, rapids, falls;
  - recorded one-shots: wingbeat ×3, whoosh ×3 (trees, rocks, banks), gust ×3 (the wind task), splash.
  - The answers to the big call in F come from all sides: frogs, birds and lizards, panned left and right at 0.4–0.9.
  - Gains: airflow follows speed (0.3 at 8 m/s, 1.0 at 18 m/s, ×1.4 in a burst). Pan follows bank (−0.6..0.6). The falls rise with distance (inverse square, capped). Gorge echo comes from a short convolver or delay send.
- Animal answers: frog, snail and dragonfly from `sfx.js`. The turtle and the small dinosaurs use recordings by the same download rule. The horn uses Söngur Slóeðlu's horn instrument, one false note, 2.5 s.
- Music: `theme: 'kafli4/theme.json'` once the owner's Suno flight theme exists. Measure it with `tools/theme-tempo.mjs --theme kafli4`. Until then keep `kafli2/theme.json`. Offer the owner a short Suno description if he wants one.
- [ ] **Step 1:** List the Freesound candidates (name, author, licence, length, size) and **ask the owner**; download only what he approves into `remake/assets/audio/kafli4/`, with credits in `CREDITS.md`.
- [ ] **Step 2:** Write tests: the airflow gain is monotonic in speed, pause stops all loops, and every sample has a credit line. Run them to check they fail.
- [ ] **Step 3:** Implement, then run the tests to check they pass. Run `theme.test.mjs` and `game-music.test.mjs`, which must be unchanged.
- [ ] **Step 4:** Commit. The flight video with sound to the owner.

## Chunk 8: The landing and the end

### Task 17: The far pool, the horn, the whole chapter

**Files:**
- Modify: `remake/chapters/kafli4.js`, `remake/world/ardalur/river.js` (the pool as a place chapter 5 can reuse)
- Test: `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Scene 7 per spec:
  - she `land`s in the pool with a splash and Egill `floatDown`s;
  - Mosi comes out of the reeds with `k4_mosi_arrived`;
  - the horn sounds from the far reeds, then `k4_egill_what` and `k4_mosi_horn`;
  - the chapter ends like chapter 3, and `next` stays `null` until chapter 5 exists.
- The pool is exported as `export const FAR_POOL = { center, radius, shots }` from `kafli4-route.js`, so chapter 5 can build its place there.
- [ ] **Step 1: Write the failing tests:**

```js
test('the whole chapter plays unattended in order with no warnings', async () => {
  const { task, world, director } = await playUnattended(kafli4, { limit: 720 });
  assert.deepEqual(world.chapterTimeline.map(m => m.scene).filter(n => typeof n === 'number'), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(director.warnings, []);
});
test('an untouched child finishes in about 7.5 minutes and never over 10', async () => {
  const { world } = await playUnattended(kafli4, { seeking: false, limit: 720 });
  const end = world.chapterTimeline.at(-1).at; assert.ok(end >= 400 && end <= 540, `end=${end}`);
});
test('the star k4_flugedla is saved once and map piece d is drawn', ...);
// piece d is by: 'star' and ends at 'flugedla'; friendOf('k4_flugedla') === 'flugedla' (engine/scene/journal.js:53), so
// the map's stateOf('flugedla') becomes 'done' with no map code. No Leikir tile for her appears (spec §7).
test('the flight inside the chapter meets every beat within 0.5 s', ...);
```

- [ ] **Step 2:** Run the tests to check they fail. **Step 3:** Implement. **Step 4:** Run the tests to check they pass, then `npm run test:remake` (all green).
- [ ] **Step 5: Measure.** Run `capture.mjs --bench 120` on every key shot of the chapter at 1280x800 and at 800x1280. Record the whole chapter with `chapter-video.mjs --chapter kafli4 --sound --stats`. The flight's median must be ≤ 6.0 ms, and its worst frame is reported. Record an upright version of the flight at 800x1280.
- [ ] **Step 6:** Commit. Video of the whole chapter to the owner, with the measurements. Do not merge or push: ask the owner.
