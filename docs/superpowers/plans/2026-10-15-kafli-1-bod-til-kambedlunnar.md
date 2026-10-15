# Kafli 1: Boð til kambeðlunnar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remake's first story chapter, from the morning meeting in the clearing to the first star at Kambeðla's fern glade, playable by a five-year-old without help at 30 fps on the test tablet.

**Architecture:** The chapter is a new module, `remake/chapters/kafli1.js`, on the existing engine (scene scheduler, camera director, actors, forest). New engine pieces carry it:
- two forest locations switched under a fade;
- pointer input with tap targets, free look and drag-to-target, plus a search helper;
- riding: a saddle, Mosi's tail ramp and Egill's climb;
- a journal with stars;
- a music player with layers and a beat clock;
- living-forest touches: a smiling sun, sway in time, light shafts in the glade, critters and bending ferns.

Every interactive wait auto-resolves while seeking, so `?t=` captures stay deterministic.

**Tech Stack:** three.js r180 as plain ES modules (no build step), `node:test` via `remake/tests/setup.mjs`, headless Edge captures (`remake/tools/capture.mjs`), WebAudio, ElevenLabs Eleven v3 with the key in `ELEVENLABS_API_KEY`, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-15-kafli-1-bod-til-kambedlunnar.md`, a copy of the approved plan-doc tab "Kafli 1: Boð til kambeðlunnar". The tab is the original.

## Global Constraints

- Tablet budget, whole frame including the shadow pass, at 1280x800 on the reference Iris Xe laptop:
  - at most 6 ms GPU, 100 draw calls, 250k triangles and 96 MB of textures;
  - the forest's main-pass share stays at or under 150k triangles.
- Camera rules (STYLE.md section 8, enforced by the director's lint):
  - dolly at most 1.2 m/s, pan 15°/s, orbit 10°/s, zoom 8°/s;
  - shots at least 2.5 s, lens 24 to 60 mm, camera height at most 7.5 m, never looking down more than 35°;
  - no fast cuts, one motion at a time, and the camera settles before a choice.
- Real sizes (STYLE.md section 3): Mosi 8.5 m long, Kambeðla 7 m long, Egill 1.1 m tall.
- Plants sway at most 3°, beat included.
- No fail states. Every required interaction has hints and ends by itself if the child stays idle. Optional taps never block the story.
- Determinism: everything visual derives from the game clock. While seeking, interactive waits auto-resolve:
  - a tap after 2 s;
  - the search finds one flower every 3 s;
  - a drag after 2 s;
  - the star after 1.5 s.
- The Icelandic lines are exactly the spec's. Voices use Eleven v3, and Mosi is voice `osSKuDKznhXBktjJ9Z9F` ("default ice"). The key is read only from `ELEVENLABS_API_KEY` and never written to a file.
- Line endings stay as they are: most remake files are LF; `remake/README.md`, `remake/STYLE.md` and `remake/chapters/grunnur.js` are CRLF.
- Do not touch `design/`. `dist/` stays unchanged, and the game's Mosi bake (no query) stays byte-identical (md5 `b73ae33c`).
- `npm run test:remake` and `npm test` pass after every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Fast or repeated taps:** a double tap during a line, two taps on the star, or a tap on a flower during a hint pan each count once, and nothing advances twice. Tests in Task 2 (one tap resolves one wait) and Task 4 (star saved once).
2. **A child who does nothing:** Egill waves by himself, hints come every 12 s, and after three hints on the same flower Egill picks it himself, so the search always ends. Test in Task 3 (idle child completes the search).
3. **A drop in the wrong place:** a flower released far from Kambeðla's mouth or outside the canvas returns to the tray, and the scene still completes. Test in Task 4.
4. **Background tab or locked audio:** before the first touch, or after the tab comes back, music and voice follow the game clock and captions show without sound. Test in Task 13 (pause follows the clock).
5. **Portrait or very wide screens:** the authored 16:10 frame stays visible, and the journal, choices and flower tray stay inside the screen. Capture check at 820x1180 and 2400x1000 in Task 16.

---

## Phase 1: Interaction and places

### Task 1: Chapter locations

**Files:**
- Create: `remake/engine/locations.js`
- Modify: `remake/main.js` (forest creation, `chapter.locations`), `remake/engine/scene/scene.js` (`s.goTo`), `remake/world/forest/plan.js` (`buildShots` reads `layout.shots` when present)
- Test: `remake/tests/locations.test.mjs`

**Interfaces:**
- Produces:
  - `createLocations({ world, locations, build })`, where `locations` is `{ [name]: { layout, shots } }` and `build(layout)` returns `Promise<forest>`. It returns `{ names, current, setLocation(name): Promise<void> }`.
  - `setLocation` hides the old forest (`forest.group.visible = false`), builds the new one once and caches it, shows it, and sets `world.forest`, `world.heightAt` and `world.location`.
  - Chapter format: `chapter.locations = { rjodur: { layout, shots }, burknalaut: { layout, shots } }` and `chapter.start = 'rjodur'`. The director gets the union of all location shots and `chapter.shots`. A chapter without `locations` (grunnur) keeps today's single `chapter.layout` path.
  - `s.goTo(name, { fade = 1.2 })`: fade to black over `fade` s, await `setLocation`, fade back in over `fade` s.

- [ ] **Step 1: Write the failing tests.** In `locations.test.mjs`, with fake forests `{ group: { visible }, heightAt }`:
  - `switches heightAt and visibility`: after `setLocation('b')`, `world.heightAt(0, 0)` returns b's height, `a.group.visible === false` and `b.group.visible === true`.
  - `builds each location once`: switching a → b → a → b calls `build` twice in total.
  - `goTo fades out, switches, fades in`: `createScene` with a fake ui records fade levels. After stepping the scheduler, the fade reached 1 before the switch resolved and 0 at the end.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL, `createLocations` is not defined.
- [ ] **Step 3:** Implement `createLocations` in `remake/engine/locations.js`, `s.goTo` in `scene.js`, and the `chapter.locations` path in `main.js`. While seeking, `goTo` waits on the build promise through `scheduler.pending`, which main.js already honours.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS. Capture grunnur `t=31` and see that it loads with no director warnings.
- [ ] **Step 5:** Commit: `git commit -m "Let a chapter hold several forest locations and switch under a fade"`

### Task 2: Pointer input and tap targets

**Files:**
- Create: `remake/engine/input/pointer.js`
- Modify: `remake/main.js` (create the pointer on the canvas, pass it to `createScene`), `remake/engine/scene/scene.js` (`s.target`, `s.tap`, `s.onTap`)
- Test: `remake/tests/pointer.test.mjs`

**Interfaces:**
- Produces:
  - `pickTarget(ray, targets)` returns `name | null`. It is pure: `targets` is `[{ name, centre: THREE.Vector3, radius, enabled }]`, and the result is the enabled sphere hit first along the ray.
  - `createPointer({ canvas, camera, world })` returns `{ addTarget(name, { point, radius }), removeTarget(name), setEnabled(name, on), on(event, fn) }`.
    - Events: `'tap' { name, x, y }`, `'drag' { dx, dy, phase: 'start'|'move'|'end', x, y }`.
    - A tap is a pointer down and up within 300 ms and 12 px. Anything that moves 12 px or more is a drag.
  - `s.target(name, { point, radius })`.
  - `s.tap(names, { auto = names[0] })` is a task that resolves with the tapped name. While seeking it resolves with `auto` after 2 s.
  - `s.onTap(name, fn)` returns an unsubscribe function. One pointer tap resolves at most one waiting `s.tap`; background handlers still run.

- [ ] **Step 1: Write the failing tests:**
  - `pickTarget returns the nearest hit along the ray`;
  - `pickTarget ignores disabled and missed targets`;
  - `one tap resolves one waiting tap even when two taps arrive in one frame`, where the second tap reaches only `onTap` handlers;
  - `tap auto-resolves with its auto option after 2 s while seeking`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement `pointer.js` (ray from `THREE.Raycaster.setFromCamera` with canvas-relative coordinates) and the scene API.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Add tap targets and pointer input to scenes"`

### Task 3: Free look and the search

**Files:**
- Modify: `remake/engine/camera/director.js` (`explore`, `look`, `hint`), `remake/engine/scene/scene.js` (`s.search`)
- Create: `remake/engine/scene/search.js`
- Test: `remake/tests/search.test.mjs`; new cases in `remake/tests/director.test.mjs`

**Interfaces:**
- Consumes: Task 2's pointer `'drag'` and `'tap'` events and `s.tap`.
- Produces:
  - `director.explore({ yaw: [minDeg, maxDeg], pitch: [minDeg, maxDeg], speed = 0.15 })` returns a handle. `speed` is degrees per pixel. While active, `director.look(dx, dy)` turns the view, clamped around the yaw and pitch it had when exploring began, eased to at most 60°/s. `handle.cancel()` holds the current view.
  - `director.hint(point, { duration = 2 })`: a pan to the point within the explore limits, subject to the lint.
  - `searchFlow({ targets: [{ name, point, hint }], hintAfter = 12, helpAfter = 3, onFound(name, index) })` is a scheduler generator:
    - It waits for taps on unfound targets.
    - After `hintAfter` s without a find it pans to the next unfound target and says its `hint` line.
    - After `helpAfter` hints on the same target, that target counts as found.
    - It returns when all are found. While seeking it finds the next target every 3 s.
  - `s.search(spec)` starts `searchFlow` with explore on and wires drags to `director.look`.

- [ ] **Step 1: Write the failing tests:**
  - `search completes when all targets are tapped in any order`;
  - `a hint pans to the next unfound target after 12 s idle and repeats every 12 s`, asserting `director.hint` was called with that target's point and `s.say` with its hint id;
  - `an idle child: after three hints the target counts as found and the search ends`;
  - `seeking finds one target every 3 s`;
  - in `director.test.mjs`, `explore clamps yaw and pitch to its limits`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement `explore`, `look` and `hint` in `director.js` and `searchFlow` in `search.js`.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Let the child look around and search, with hints that always end the search"`

### Task 4: Drag to target, the journal and the star

**Files:**
- Create: `remake/engine/save.js`, `remake/engine/scene/journal.js`
- Modify: `remake/index.html` (journal button, star slots, flower tray), `remake/style.css`, `remake/engine/scene/ui.js` (`tray`), `remake/engine/scene/scene.js` (`s.drag`, `s.star`, `s.found`)
- Test: `remake/tests/journal.test.mjs`, `remake/tests/drag.test.mjs`

**Interfaces:**
- Consumes: Task 2's pointer events.
- Produces:
  - `createSave(storage = globalThis.localStorage, key = 'mosi-remake-v1')` returns `{ get(): { stars: string[], findings: string[] }, addStar(id), addFinding(id) }`. Every storage call sits in try/catch and falls back to memory.
  - `createJournal(doc, save)` returns `{ addStar(id, fromXY): Promise, addFinding(id), get stars(), get findings() }`. The star flight lasts 1.2 s.
  - `ui.tray`: `show(items: [{ id, icon }])`, `remove(id)`, `hide()`.
  - `s.drag(itemId, targetSpec, { radius = 90 })` resolves when the item is dropped within `radius` px of the target's screen projection. A drop elsewhere returns the item to the tray. While seeking it resolves after 2 s.
  - `s.star(id, fromSpec)` raises a star sprite from the point and waits for a tap on it. It resolves by itself after 8 s idle, or after 1.5 s while seeking, then flies to the journal and calls `save.addStar(id)`.
  - `s.found(id)` adds a finding (critters) to the journal and the save.

- [ ] **Step 1: Write the failing tests:**
  - `save works when storage throws`;
  - `a star is saved once even when tapped twice`;
  - `a drop outside the radius returns the item and a drop inside resolves`;
  - `drag auto-resolves after 2 s while seeking`;
  - `findings are counted once per id`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement `save.js`, `journal.js`, the tray and the scene calls. The journal follows STYLE.md section 10 (explorer's journal).
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Add the explorer's journal, stars, findings and drag to target"`

## Phase 2: Characters and riding

### Task 5: Riding: saddle, tail ramp and climb

**Files:**
- Modify:
  - `lab/gfx-demo/tools/bake/bake-mosi.js`: an extra clip `tailDown` only with the `clips=remake` query.
  - `remake/assets/characters/mosi.glb`: re-bake.
  - `remake/assets/characters/mosi-source.json`: clips and bake command.
  - `remake/engine/actor.js`: `play(name, { once })` and a `controlled` flag that pauses walk and footing.
- Create: `remake/engine/riding.js`
- Test: `remake/tests/riding.test.mjs`; `remake/tests/actor.test.mjs` (`tailDown` present)

**Interfaces:**
- Produces:
  - Mosi clip `tailDown`, 1.5 s, played once and held. Tail1 to Tail5 bend so the tail tip rests on the ground behind the hips.
  - `actor.play(name, { once: true })` uses LoopOnce and holds the last frame.
  - `actor.controlled`: when true, `update` skips walking and footing, and the root is set from outside.
  - `createSaddle(host, { bone = 'Body' })` returns `{ object, seat: THREE.Vector3, update() }`. It follows the bone's world transform without inheriting the GLB's scale. It is a leather pad in `#6f5440`, sized for a 1.1 m rider.
  - `ride(rider, saddle)` returns `{ stop() }`. The rider is `controlled`, its root follows `saddle.seat` and the host's heading each frame, and it plays `sit`.
  - `tailPath(host)` returns world points along the top of the tail, from Tail5 to Tail1 and Body, raised by the tail's half thickness.
  - `climbAlong(rider, pathFn, { speed = 0.45 })` is a handle that resolves at the end of the path. The rider is controlled, walks with the `walk` clip at a matching time scale, and pitches with the slope.

- [ ] **Step 1: Write the failing tests:**
  - `the rider stays on the seat while the host walks`: within 1 mm after 60 frames;
  - `the rider never inherits the host's scale`: rider world scale 1;
  - `climbAlong reaches the end of the path and ends`: fake path;
  - in `actor.test.mjs`, `the remake's Mosi has a tailDown clip`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Add `tailDown` to `bake-mosi.js`, gated on `clips=remake`. Re-bake with `node lab/gfx-demo/tools/bake-mosi.mjs --out remake/assets/characters/mosi.glb --query "length=8.5&clips=remake"`. Implement `riding.js` and the actor options.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS. Run the default bake to `qa/remake/bake/mosi-repro.glb`; its md5 must still start `b73ae33c`.
- [ ] **Step 5:** Capture Egill climbing and riding (side and three-quarter, 1280x800). His feet stay on the tail's top surface, within about 5 cm by eye, and he sits in the saddle while Mosi walks. If his feet cannot stay on the tail, use the spec's fallback instead: Mosi lies down (a `lieDown` clip with the same `clips=remake` gate) and Egill climbs his side. Record which one was used.
- [ ] **Step 6:** Commit: `git commit -m "Let Egill climb Mosi's tail and ride in a saddle"`

### Task 6: Kambeðla's plates light up

**Depends on:** the Stegosaurus bake (branch `kambedla`), which delivers the remake file with a `plateRow` vertex attribute (0 off a plate, 1 to N from head to tail) and clips `idle`, `walk`, `kink`, `eat` and `happy`. These were requested on 2026-10-15. Use the file name it reports, expected `remake/assets/characters/kambedla.glb`.

**Files:**
- Create: `remake/engine/plate-glow.js`
- Test: `remake/tests/plate-glow.test.mjs`

**Interfaces:**
- Produces: `addPlateGlow(actor, { colour = '#ab85c1' })` returns `{ rows, setRow(index, level, { duration = 0.8 }), setAll(level, { duration }), update(dt) }`.
  - It patches the actor's material with `onBeforeCompile`: emissive += colour × `uRowLevel[plateRow - 1]` for `plateRow > 0.5`, up to 8 rows.
  - Levels ease on the game clock.

- [ ] **Step 1: Write the failing tests:**
  - `counts rows from the plateRow attribute`;
  - `setRow eases to its level over the duration`;
  - `non-plate vertices are not lit`: the patched shader gates on `plateRow > 0.5`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement `plate-glow.js`.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS. Capture Kambeðla with rows lit one by one in the glade.
- [ ] **Step 5:** Commit: `git commit -m "Light Kambeðla's plates row by row"`

### Task 7: Glow flowers

**Files:**
- Create: `remake/world/props/glow-flower.js`
- Test: `remake/tests/glow-flower.test.mjs`

**Interfaces:**
- Produces: `createGlowFlower(world, { name, position: [x, y, z] })` returns `{ group, point: THREE.Vector3, glimmer(on), pick(): Promise, update(t), dispose() }`.
  - Code-built: five lilac-white petals and a glow sprite pulsing at 1.2 Hz from the game clock.
  - At most 300 triangles and two draw calls per flower.
  - `pick()` lifts and shrinks the flower toward Egill's hand over 0.6 s, then hides it.

- [ ] **Step 1: Write the failing tests:**
  - `the glimmer is a function of the game clock`: the same value at the same t;
  - `pick resolves and hides the flower`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement `glow-flower.js`.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Add glow flowers"`

## Phase 3: Living forest

### Task 8: The smiling sun

**Files:**
- Create: `remake/engine/sun-face.js`
- Modify: `remake/main.js`, `remake/engine/points.js` (`'sun'`), `remake/engine/scene/scene.js` (`s.sun`)
- Test: `remake/tests/sun-face.test.mjs`

**Interfaces:**
- Produces:
  - `createSunFace({ scene, lighting })` returns `{ sprite, wink(), update(t, camera) }`.
    - A canvas-drawn face texture (a closed, kind smile, plus a closed-eyes frame) on a sprite placed along `lighting.direction`, 600 m from the camera, covering the sun disc.
    - `wink()` closes the eyes for 0.35 s on the game clock.
  - Point spec `'sun'`: the camera position plus `lighting.direction` × 600.
  - `s.sun.wink()` returns DONE.
  - `addMosiCloud({ scene, lighting })`: one cloud sprite shaped like Mosi's silhouette (a canvas texture in the sky's cloud colour), placed 35° to the left of the sun at the same elevation, drifting 0.5°/min with the game clock.

- [ ] **Step 1: Write the failing tests:**
  - `the sun spec resolves along the light direction`;
  - `the Mosi cloud drifts with the game clock`;
  - `wink closes and reopens on the clock`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement `sun-face.js`, the point spec and the scene call.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS. Capture a shot looking at `'sun'` in the morning look.
- [ ] **Step 5:** Commit: `git commit -m "Give the sun a smiling face"`

### Task 9: Beat clock and sway in time

**Files:**
- Create: `remake/tools/theme-tempo.mjs`, `remake/assets/audio/theme.json`, `remake/engine/beat.js`
- Modify:
  - `remake/engine/wind.js`: `uBeat`, `setBeat`.
  - `remake/main.js`: the beat from the game clock each frame.
  - `remake/world/forest/grass.js` and `remake/world/forest/materials.js`: a beat term in the sway.
  - `remake/world/forest/config.js`: `wind.beatAmplitudeDeg = 1`.
- Test: `remake/tests/beat.test.mjs`

**Interfaces:**
- Produces:
  - `theme.json`: `{ "src": "../../dist/assets/audio/little-dino-green-valley.mp3", "bpm": <measured>, "beatOffset": <seconds>, "key": [<five note frequencies in Hz>] }`.
  - `beatAt(time, { bpm, beatOffset })` returns `{ index, phase, pulse }`, pure. `pulse = exp(-6 * phase)`.
  - `wind.uniforms.uBeat` and `wind.setBeat(pulse)`.
  - The sway angle gains `beatAmplitudeDeg * uBeat`, and the total stays at or under 3°.
- Tool: `node remake/tools/theme-tempo.mjs` decodes the theme with ffmpeg, estimates the BPM by onset autocorrelation over 60 to 180 BPM, and writes `bpm` and `beatOffset`. A person confirms it by ear with a click track.

- [ ] **Step 1: Write the failing tests:**
  - `beatAt is deterministic and periodic`;
  - `the pulse decays within a beat`;
  - `the configured sway stays within 3 degrees with the beat added`, computed from config constants.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement `beat.js`, the wind uniform, the shader terms and the tool. Run the tool and write `theme.json`.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS. Check the forest frame cost with `forest-stats.mjs` and a bench capture of `hero`; it must not exceed today's.
- [ ] **Step 5:** Commit: `git commit -m "Let the forest sway in time with the theme"`

### Task 10: The fern glade: light shafts, dense ferns, drifting leaf shadows

**Files:**
- Modify:
  - `remake/world/forest/atmosphere.js`: `layout.glade.shafts`, shafts slanting into the clearing from the sun side.
  - `remake/world/forest/plan.js`: `layout.glade.ferns` multiplies understory fern density in the clearing band.
  - `remake/world/forest/config.js`.
  - The shade-stamp material: leaf shadows drift with `uWindTime`.
- Test: `node --import ./remake/tests/setup.mjs remake/tools/world/forest-stats.mjs --chapter kafli1` (once Task 15 exists; until then a temporary layout in the test file)

**Interfaces:**
- Produces: `layout.glade = { ferns: number, shafts: number }`, both optional. The defaults leave grunnur unchanged.

- [ ] **Step 1: Write the failing test:** in `remake/tests/forest-glade.test.mjs`, plan a layout with `glade: { ferns: 3, shafts: 4 }`. Expect at least 4 shafts whose ground point lies inside the clearing radius, and more fern placements in the clearing band than without `glade`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement the options.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS. Run forest-stats for the glade layout; its main share is at most 150k.
- [ ] **Step 5:** Commit: `git commit -m "Add a fern glade with light shafts and drifting leaf shadows"`

### Task 11: Critters

**Files:**
- Create: `remake/world/critters/critters.js`, `remake/world/critters/models.js`
- Modify: `remake/world/forest/atmosphere.js` (`butterflyLand`)
- Test: `remake/tests/critters.test.mjs`

**Interfaces:**
- Produces:
  - `createCritters(world, { spots: [{ name, kind: 'frog'|'snail'|'beetle', position }], birds: [{ name, position }] })` returns `{ targets: [{ name, point, radius }], react(name), scare(point, radius = 6), update(dt, t) }`.
    - The frog hops, the snail hides in its shell and the beetle rolls over and back.
    - Birds fly up and away when `scare` reaches them.
    - Each critter has at most 400 triangles; birds are instanced.
  - `butterflyLand(world, spec, { duration = 3 })` flies one butterfly to a point spec, for example Mosi's horn, and settles it there.
  - The clearing's butterflies become tap targets named `butterfly-1` and so on; a tap makes that one flutter up and away for 3 s.

- [ ] **Step 1: Write the failing tests:**
  - `a critter reacts once per tap`;
  - `birds within 6 m of the scare point fly up`;
  - `a landed butterfly follows the moving point`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement the critters and the landing.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Add critters a child can tap"`

### Task 12: Ferns that bend and the sneeze

**Files:**
- Modify: `remake/world/forest/materials.js` (understory ferns use `ACTOR_GLSL` from `terrain.js`, as grass does)
- Create: `remake/world/props/pollen.js`
- Test: `remake/tests/pollen.test.mjs`

**Interfaces:**
- Produces: `pollenBurst(world, point, { count = 40 })` returns a handle. It lasts 1.5 s on the game clock and draws in one call.

- [ ] **Step 1: Write the failing test:** `a pollen burst ends after 1.5 s on the clock and removes itself`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement the fern bend and the burst.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS. Capture Mosi walking through ferns.
- [ ] **Step 5:** Commit: `git commit -m "Let ferns bend around Mosi and pollen fly when he sneezes"`

## Phase 4: Audio and the chapter

### Task 13: Music with layers

**Files:**
- Create: `remake/engine/audio/music.js`
- Modify: `remake/engine/scene/voice.js` (duck the music while a line plays), `remake/main.js` (unlock on the first touch, pause with the clock), `remake/engine/scene/scene.js` (`s.music.addLayer`)
- Test: `remake/tests/music.test.mjs`, with a fake AudioContext

**Interfaces:**
- Consumes: `theme.json` and `beatAt` (Task 9).
- Produces: `createMusic({ context, theme })` returns `{ start(), addLayer('chimes'), duck(on), setPaused(paused), muted }`.
  - The theme loops from a decoded buffer.
  - The `chimes` layer is WebAudio bells on every second beat, on notes from `theme.key`, and stays once added.
  - `duck(true)` lowers the music by 8 dB over 0.3 s, and `duck(false)` restores it.
  - `s.music.addLayer(name)` returns DONE.
  - `createSfx({ context })` returns `{ play(name) }` with procedural WebAudio sounds, as in the old game: `forest` (a quiet loop of wind and birds), `step` (Mosi's footfall), `frog`, `snail`, `beetle`, `birds`, `butterfly`, `flower` (a glimmer pick-up), `plate` (a row lights), `star` (the star rises) and `journal` (the star lands). Unknown names do nothing. `s.sfx(name)` returns DONE.

- [ ] **Step 1: Write the failing tests:**
  - `chimes are scheduled on every second beat`;
  - `sfx plays each named sound once per call and ignores unknown names`;
  - `duck lowers the gain and restores it`;
  - `pause and resume follow the game clock`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement `music.js` and the voice ducking.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Add music that grows with layers"`

### Task 14: Voices

**Files:**
- Create: `remake/tools/voice-lines.mjs`, `remake/assets/audio/kafli1/lines-source.json`, `remake/assets/audio/voices.json`
- Modify: `remake/tools/audio-lines.mjs` (include remake lines), `remake/assets/audio/lines.json`
- Test: `remake/tests/voice-lines.test.mjs`

**Interfaces:**
- Produces:
  - `lines-source.json`: `[{ "id": "k1_mosi_waving", "speaker": "mosi", "text": "Ó! Ég sé einhvern veifa!" }, …]` with every line in the spec, plus `k1_mosi_hum` (Mosi humming the theme in scene 2). The scene 3 welcome reuses the existing recording `welcome`.
  - `voices.json`: `{ "mosi": "osSKuDKznhXBktjJ9Z9F", "kambedla": "<chosen>", "egill": "<chosen>" }`.
  - `node remake/tools/voice-lines.mjs --audition kambedla|egill` writes one sample line per candidate voice to `qa/remake/voices/` for the owner to choose. Candidates for Egill come from `scripts/audition-egill.mjs`.
  - `node remake/tools/voice-lines.mjs [--only id,id]` generates MP3s with Eleven v3 into `remake/assets/audio/kafli1/`, caches by a hash of text and voice in `.tools/elevenlabs-remake/`, and then updates the durations in `lines.json`.

- [ ] **Step 1: Write the failing tests:**
  - `every line id used by kafli1.js has text in lines-source.json` (add this assertion when Task 15 lands; until then check the spec's ids);
  - `the tool stops without ELEVENLABS_API_KEY and never writes the key`.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Implement the tool. Run the auditions.
- [ ] **Step 4: Owner step.** The owner chooses the voices for Kambeðla and Egill, and an Icelandic listener approves the lines. Then generate.
- [ ] **Step 5:** Run `npm run test:remake`. Expected: PASS.
- [ ] **Step 6:** Commit: `git commit -m "Voice chapter 1 with Eleven v3"`

### Task 15: The chapter

**Files:**
- Create: `remake/chapters/kafli1.js`
- Modify: `remake/README.md` (chapter list)
- Test: `remake/tests/kafli1.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `chapter = { id: 'kafli1', title: 'Boð til kambeðlunnar', look: 'morning', start: 'rjodur', locations, actors, cast, lines, shots, script }`.
  - Locations:
    - `rjodur`: the clearing at real size, with the path leaving it.
    - `burknalaut`: radius 9 m, `glade: { ferns: 3, shafts: 4 }`.
  - Actors: `mosi`, `egill`, `kambedla`.
  - Cast colour for Kambeðla: `#5d4370`.
  - The script follows the spec's scenes 1 to 10 exactly: lines, choices, interactions, hints after 12 s, three glow flowers (by the big stone, under the ferns, up in the small tree), plates lit row by row, the `chimes` layer, the star `k1_kambedla`, and `s.goTo('burknalaut')` at the end of scene 6.

- [ ] **Step 1: Write the failing tests:**
  - `kafli1 uses only lines that exist`;
  - `every required wait has an auto option for seeking`: run the script with a fake world in seeking mode to its end and assert it finishes before t = 600 s.
- [ ] **Step 2:** Run `npm run test:remake`. Expected: FAIL.
- [ ] **Step 3:** Write `kafli1.js`.
- [ ] **Step 4:** Run `npm run test:remake`. Expected: PASS. Capture `?chapter=kafli1&t=<end>`; there must be no director warnings.
- [ ] **Step 5:** Commit: `git commit -m "Add chapter 1: Boð til kambeðlunnar"`

### Task 16: Verification and records

**Files:**
- Modify: `remake/STYLE.md` (section 12 and the new interaction rules), `qa/remake/ledger.md`, the plan doc tab (status)

- [ ] **Step 1:** Probe the timeline and capture a contact sheet of every scene at 1280x800. Also capture at 820x1180 and 2400x1000, where the frame and UI must stay visible.
- [ ] **Step 2:** Bench one key frame per scene with interleaved A/B in one page load. Each must stay at or under 6 ms GPU, 100 calls and 250k triangles; the glade's forest share stays at or under 150k.
- [ ] **Step 3:** Run `npm run test:remake` and `npm test`. Expected: all pass.
- [ ] **Step 4:** Record results in the ledger and the plan doc. Prepare the child test: a five-year-old plays from the start button to the star without adult help.
- [ ] **Step 5:** Commit: `git commit -m "Verify chapter 1 and record the results"`
