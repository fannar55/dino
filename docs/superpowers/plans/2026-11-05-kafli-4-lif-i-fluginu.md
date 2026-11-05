# Kafli 4: Líf í fluginu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill chapter 4's flight with animals that answer Flugeðla's call and set off for the festival, and give the valley groves, green banks and more land above the falls, within the tablet budget.

**Architecture:** One instanced mesh per animal kind (`world/critters/crowd.js`) draws any number of critters in one or two draw calls; each critter's place and pose are pure functions of the game clock. `world/ardalur/animals.js` keeps the tap groups of C (now nine) and their answers; a new `world/ardalur/life.js` holds the life nobody taps (birds and fish she flushes, the gorge's flyers, the herd, the streams to the far pool). The forest gains camera-facing cards for far trees (`world/forest/cards.js`) to pay for groves, and the terrain gains hills, streams and ponds above the falls. The owner's three Tripo models come in through a bake tool that freezes their clips into morph targets.

**Tech Stack:** three.js r180 (`dist/vendor/three.module.js`: `InstancedMesh.setMorphAt`), the remake engine, node test runner, CDP capture tools (`remake/tools/capture.mjs`, `chapter-video.mjs`), Blender 4 in the background for the bake (`blender.exe -b`).

**Spec:** `docs/superpowers/specs/2026-11-05-kafli-4-lif-i-fluginu-design.md` (Icelandic; the binding authority), on top of the chapter spec `docs/superpowers/specs/2026-11-01-kafli-4-bod-til-flugedlu-design.md` (sections 5 and 6).

## Global Constraints

- Branch `kafli4-flugedla`, worktree `C:/Risaeðla/dino-kafli4-flugedla`, preview `kafli4` on port 4260. Nothing is merged into main or pushed without the owner's yes.
- Four chunks (spec 11). After each chunk: a video (phone copy `simi.mp4`) and the bench to the owner, then wait for his yes before the next chunk. Commit WIP often; one ledger line per task.
- No Claude-drawn art. New animal models are the owner's Tripo3D models only: ask for each one with the spec 7 table when its chunk nears ("ef þarf, kallaðu eftir að ég geri módel"). Far-tree cards are renders of the game's own tree models, never painted.
- Budget per key shot on `tablet` (Iris Xe, 1280x800 and 800x1280): GPU median ≤ 6.0 ms (`__benchmark(120)`; aim ≤ 5.3 ms), ≤ 100 draw calls, ≤ 250k triangles (STYLE.md 11). The animals themselves: ≤ 40k triangles and ≤ 12 draw calls in any frame (spec 9).
- Every animal is a pure function of the game clock: a pause freezes it, a seek or capture lands on the same pose as playing (spec 3).
- Visibility (spec 3): in every chase shot of C a group is in view for most of the shot, each of its animals ≥ 16 px tall at 1280x800.
- Nothing grows or stands within 3 m of her path at any steer (`CLEAR_OF_HER`); nothing in Mosi's two cameo paths; the far land, the mountains and Grameðla's shadow are unchanged (spec 5).
- Still shots: nothing taller than 0.5 m within 6 m of the camera, nothing on the line from the camera to what the shot shows; the shadow shot's lizards ≥ 8 % of the frame's height (spec 6).
- Every file keeps its line endings (`* -text`): `remake/main.js` and `remake/engine/book/book.js` are CRLF; new files LF. Check `git ls-files --eol` and `git diff --stat` before each commit.
- Never print or log `ELEVENLABS_API_KEY`. Never touch `design/` or `dist/` (read `dist/vendor` only). Ask before any download.
- Tests: from `remake/`, `node --import ./tests/setup.mjs --test tests/<file>.test.mjs`; whole suite `npm run test:remake` (≈ 250 s, run in the background).

## Review Focus

1. **A seek or capture into an answer** (`?t=` mid-flight, `capture.mjs`): every animal, tapped or not, stands where playing would have put it. Pinned in Task 3 and Task 4 (jump-vs-play tests on `animals` and `life`).
2. **An upright tablet (800x1280):** the narrower chase view still shows a group for a third of each chase shot in C. Pinned in Task 7 (the visibility test at aspect 0.625).
3. **A slow device:** denser sections (groves, banks, cards) are still built in slices before they are wanted. Pinned in Task 10 (the existing `slowBuilds` section test, rerun with the groves).
4. **Reduced motion:** no orbit, and the flyers keep a calm formation that never sweeps past the camera. Pinned in Task 15.
5. **Pause or a hidden tab mid-answer:** the animals hold still and go on from where they were. Pinned in Task 3 (game-clock pause in the answer test).

---

## File Structure

- Create `remake/world/critters/crowd.js` — `createCrowds`: one `InstancedMesh` per kind and detail level, per-instance morphs and wings, drops what is far.
- Create `remake/world/ardalur/life.js` — the flight's untapped life: Fen birds and dragonflies, fish, flushed perches, striders (chunk 1); flyers, herd, streams, arrivals (chunks 3–4).
- Create `remake/world/forest/cards.js` — the far-tree card atlas and the cards' material.
- Create `remake/world/critters/crowd-models.js` — loads a baked crowd GLB; `clipPose`.
- Create `remake/tools/prep-crowd.mjs` and `remake/tools/blender-crowd.py` — the owner's Tripo GLB to a baked crowd GLB.
- Modify `remake/chapters/kafli4-route.js` — nine `GROUPS`, `STILLS`, `HILLS`, `OUTCROPS`, `STREAMS`, `PONDS`, `MEADOW`, `NESTS`.
- Modify `remake/world/ardalur/animals.js` — on crowds; nine groups; setting off.
- Modify `remake/world/ardalur/index.js` — shares one `crowds` between animals and life; passes still views to the plants.
- Modify `remake/world/ardalur/banks.js` — green banks, groves, still-shot clearing, cards.
- Modify `remake/world/ardalur/terrain.js`, `river.js` — hills, streams, ponds.
- Modify `remake/world/forest/batch.js` — a card level beyond `CARD_FROM`.
- Modify `remake/engine/camera/flight-camera.js` — `stillViews`; `bankShadow` reframed.
- Modify `remake/chapters/kafli4-flight.js`, `kafli4-flight-play.js`, `kafli4.js` — shots from `STILLS`, the birds' answer sound, big-call movement, arrivals.
- Tests: `remake/tests/crowd.test.mjs` (new), `life.test.mjs` (new), `ardalur.test.mjs`, `flight-camera.test.mjs`, `kafli4.test.mjs`, `flug.test.mjs`.

---

## Chunk 1: The crowds and the old animals (no new models)

### Task 1: The crowd renderer

**Files:**
- Create: `remake/world/critters/crowd.js`
- Test: `remake/tests/crowd.test.mjs`

**Interfaces:**
- Produces:
  - `createCrowds(world, { parent = world.scene, seen = 160 } = {}) -> crowds`
  - `crowds.reserve(kind: string, count: number, { model = createModel(kind), material = null, lods = null } = {})` — before the first `begin`; capacities add up. `lods: [{ geometry, until }, { geometry }]` (Task 12); without it, one level from `model`. A winged model (`model.wings`) gets `birdMaterial(kind)` and an instanced `aFlight`.
  - `crowds.begin(camera: THREE.Camera | null)` — starts a frame.
  - `crowds.place(kind, position: THREE.Vector3, heading: number /* degrees: 0 faces +X, 90 faces +Z */, scale: number, pose = {}) -> number` — `pose: { morphs?: { [name]: weight }, wings?: [angle, open], pitch?: radians, squash?: [x, y, z], height?: metres }`. Instance matrix = T(position)·R(heading)·S(scale)·T(0, model.pivot, 0)·R_z(pitch)·S(squash). Returns the instance index, or −1 when it is beyond `seen` from the camera.
  - `crowds.end()` — sets each mesh's `count` to what was placed, flags its buffers.
  - `crowds.placed() -> [{ kind, position: Vector3, height: number }]` — the last frame's drawn critters (height = pose.height ?? model height × scale), for tests.
  - `crowds.triangles() -> number`, `crowds.calls() -> number` — drawn this frame (meshes with count > 0).
  - `crowds.group: THREE.Group`, `crowds.dispose()`.

- [ ] **Step 1: Write the failing tests** in `crowd.test.mjs`:
  - `one kind is one draw call however many critters`: reserve `frog` × 40, place 40 near the camera → `crowds.calls() === 1`, `crowds.group.children.length === 1`, mesh `count === 40`.
  - `a critter beyond seen is not drawn`: camera at origin, place one at 100 m and one at 200 m (`seen` 160) → returns `>= 0` and `-1`, `count === 1`.
  - `each critter has its own pose`: two frogs with `morphs: { leap: 0 }` and `{ leap: 1 }` → the mesh's morph texture holds 0 and 1 for instances 0 and 1 (read `mesh.morphTexture` or the influences the crowd keeps).
  - `winged critters beat their own wings`: reserve `dragonfly` × 2, wings `[0.3, 1]` and `[-0.2, 1]` → `aFlight` holds both.
  - `the matrix puts the model's foot on the given point`: place a frog at (5, 2, 3), heading 90, scale 3 → its world-space bounding box min y ≈ 2 (±0.02), centre x ≈ 5, z ≈ 3.
  - `triangles counts what is drawn`: 10 frogs → `crowds.triangles() === 10 × frogTriangles`.
- [ ] **Step 2: Run** `node --import ./tests/setup.mjs --test tests/crowd.test.mjs` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `crowd.js` as the Interfaces say. Morphs through `InstancedMesh.setMorphAt(i, holder)` with a holder `{ morphTargetInfluences: Float32Array }` per kind; `frustumCulled = false` (critters move; `count` keeps the cost to what is near); `castShadow = receiveShadow = true`.
- [ ] **Step 4: Run** the test file — Expected: PASS.
- [ ] **Step 5: Commit** `git add remake/world/critters/crowd.js remake/tests/crowd.test.mjs` — "Crowds: one instanced mesh per critter kind".

### Task 2: Nine groups in C, drawn as crowds

**Files:**
- Modify: `remake/chapters/kafli4-route.js:204-211` (`GROUPS`)
- Modify: `remake/world/ardalur/animals.js`, `remake/world/ardalur/index.js:59-65,189`
- Modify: `remake/chapters/kafli4-flight-play.js:50` (`ANSWER`), `remake/chapters/kafli4-flight.js:279` (`bankShadow` group)
- Test: `remake/tests/ardalur.test.mjs:482-640`, `remake/tests/flug.test.mjs`, `remake/tests/flight-camera.test.mjs`

**Interfaces:**
- Consumes: `createCrowds` (Task 1).
- Produces:
  - `GROUPS` (route), in the order she meets them, `[id, kind, d, side, out]`:
    `['frogs-1','frogs',245,1,2]`, `['lizards-1','lizards',330,-1,3]`, `['birds-1','birds',415,1,6]`, `['turtles','turtle',500,-1,1.5]`, `['birds-2','birds',640,-1,6]`, `['lizards-2','lizards',690,1,3]`, `['dragonflies','dragonflies',750,-1,-3]`, `['frogs-2','frogs',800,1,2]`, `['lizards-3','lizards',845,-1,3]`.
  - `createAnimals(world, route, { heightAt, library, crowds = createCrowds(world) })` — same return shape plus `crowds`; members are records `{ kind, home: Vector3, heading, position: Vector3, morphs: {}, visible: boolean, height, along, e, d, side, phase }` (no `root`/`mesh`). `animals.update(dt, t)` calls `crowds.place` for each visible member; index.js calls `crowds.begin(camera)` before `animals.update`/`life.update` and `crowds.end()` after.
  - Kinds: `MEMBER.birds = 'bird'`, `MEMBER.lizards = 'salamander'` (until Task 13). Members: frogs 6, lizards 10, birds 10, turtle 3, dragonflies 6. Snails are gone.
  - Props: birds sit in one `broadleaf` (crown height from `library`); turtles: one `rock` and one `log` (one on the rock, two on the log).
  - `ANSWER.birds = 'birds'` (play); `camera.shot('bankShadow', { group: 'lizards-2' })`.

- [ ] **Step 1: Update the tests** (they fail on the old five groups):
  - Rename and rewrite `five animal groups…` → `nine animal groups along C, in the order she meets them…`: `animals.groups.map(g => g.id)` equals the nine ids above; counts per kind `frogs 6, lizards 10, birds 10, turtle 3, dragonflies 6`; members read `m.position`; `crowds.calls() <= 5` with all nine in view.
  - `each group answers her once…`: drop snails; birds `rose > 3` (they fly up); keep the rest on `m.position` / `m.morphs`.
  - Add `a tap on the birds' tree calls the birds`: the group's `point` is within 2 m of the crown middle and its radius ≥ 3.
  - `flight-camera.test`/`flug.test`: references to `turtle`/`snails`/`lizards` ids → the new ids.
- [ ] **Step 2: Run** `node --import ./tests/setup.mjs --test tests/ardalur.test.mjs` — Expected: FAIL on the group list.
- [ ] **Step 3: Implement** the new `GROUPS`, `LAYOUT`/`PROPS` per kind (members 2–8 m from the water's edge, spread `along` ±4 m), animals on crowds, index.js sharing `crowds`, play's `ANSWER.birds`, the shot's group.
- [ ] **Step 4: Run** `ardalur.test.mjs`, `flight-camera.test.mjs`, `flug.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** — "Animals: nine groups along C, drawn as crowds".

### Task 3: The answer is setting off for the festival

**Files:**
- Modify: `remake/world/ardalur/animals.js` (`ANSWER`, `pose`)
- Test: `remake/tests/ardalur.test.mjs`

**Interfaces:**
- Consumes: Task 2's members.
- Produces: `ANSWER = { frogs: 7, lizards: 9, birds: 8, turtle: 4, dragonflies: 10 }` (seconds). After its answer a group is gone (members `visible === false`) and stays gone, except the dragonflies, which come home as now.
  - lizards: turn from the water, run upstream along the bank 24 m in 4 s with her, then inland 25 m in 5 s into the trees, hidden as they reach them;
  - frogs: leap off the pads into the river (arc 1.25 m), swim upstream 1.5 m/s on the surface, dive (hidden) at 7 s;
  - birds: fly up from the crown, follow her 4 s at the dragonflies' swarm offsets scaled 1.4 (never within 4 m of her body), peel off up and inland, hidden at 8 s;
  - turtles: stretch the neck (as now), slide off into the river and sink, hidden at 4 s.

- [ ] **Step 1: Write the failing tests:**
  - Rewrite `each group answers her once…` as `each group sets off for the festival when it answers, once`: per kind, at the end of `ANSWER[kind]` every member is hidden, or (lizards, frogs while seen) ≥ 15 m further upstream than it sat; nothing passes within 3 m of her body; nothing goes under the ground (frogs/turtles: under the water only once hidden); a second `answer()` is done at once and nothing reappears at `t0 + ANSWER + 3`.
  - Keep `an answer is a function of the game clock…` (seek vs play) with the new kinds and a jump to `t0 + 3.4` (mid-run).
  - Add `a pause holds an answer`: answer, play to `t0 + 2`, hold the clock 3 s (same `t`), positions unchanged; resume to `t0 + 4` equals a straight run to `t0 + 4`.
- [ ] **Step 2: Run** `ardalur.test.mjs` — Expected: FAIL (they rest where they sat).
- [ ] **Step 3: Implement** the four answers in `pose` as functions of `tau`.
- [ ] **Step 4: Run** `ardalur.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** — "Animals: an answer is setting off for the festival".

### Task 4: The life nobody taps

**Files:**
- Create: `remake/world/ardalur/life.js`
- Modify: `remake/world/ardalur/index.js` (create, update, dispose), `remake/chapters/kafli4-flight-play.js` (a skim tells `life.skim(x, z)`)
- Test: `remake/tests/life.test.mjs`

**Interfaces:**
- Consumes: `crowds` (Task 1); `world.flightTime` (set by `chapters/kafli4-flight.js`; null or < 0 outside the flight); `route`.
- Produces: `createLife(world, route, { heightAt, crowds }) -> { update(dt, t), skim(x, z), props, clear, things, dispose() }`; `things: [{ id, kind, at: Vector3, trigger: number /* flight seconds */ }]`. Every trigger is a flight time fixed at build from the schedule (`route.progressAt`), so a pose is a function of `world.flightTime` alone. Contents:
  - A: 5 `earlyBird` in the Fen's reed within 25 m of her path, each flying up and away 3.5 s from when the schedule brings her within 14 m; 4 `dragonfly` hovering in the reed.
  - B–C: 10 `fish` in her lane (±6 m) between river d 0 and 850, each jumping once (arc 1.2 m, 0.8 s) when she is 24 m before it.
  - C: 6 perches of 4 `bird` in bank trees (a `broadleaf` prop each, within 12 m of the water), between the groups, flying up and away when she is within 20 m.
  - B–C: 8 `waterStrider` near the banks of the lazy reach; `skim(x, z)` within 10 m sends them skating 1.5 m out and back over 2 s (the time is kept as a game-clock start, as an answer is).
- Scales so each reads from her back (Task 7 checks it): implementer's choice, ≤ `SCALE` of animals.js + 2.

- [ ] **Step 1: Write the failing tests** in `life.test.mjs`:
  - `the Fen's birds fly up as she comes, once, and are gone`: each early bird is at its perch before its trigger, ≥ 3 m higher 1 s after, hidden at trigger + 3.6 s, hidden ever after.
  - `fish jump ahead of her in her lane, once each`: ten fish; each above the water only within its 0.8 s, then never again.
  - `birds fly up from the bank trees as she passes`: as the early birds, from 6 perches × 4.
  - `a skim sends the striders off and back`: `skim()` within 10 m moves them ≥ 1 m, back within 0.1 m at 2 s; a skim 30 m off moves nothing.
  - `life is a function of the flight's clock`: jump to `flightTime` 47.3 vs play to it: every placed position equal (1e-6).
  - `nothing in her way`: every thing's path stays ≥ 3 m from her path at its time.
- [ ] **Step 2: Run** `node --import ./tests/setup.mjs --test tests/life.test.mjs` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `life.js`; index.js adds `life.props`/`life.clear` to the plants' `props`/`clear` and updates it between `crowds.begin` and `crowds.end`.
- [ ] **Step 4: Run** `life.test.mjs` and `ardalur.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** — "Life in the flight: the Fen's birds, fish, flushed perches and striders".

### Task 5: Green banks

**Files:**
- Modify: `remake/world/ardalur/banks.js:10-26` (`REAL`), plant loop
- Test: `remake/tests/ardalur.test.mjs`

**Interfaces:**
- Produces: `REAL.edge = [['horsetailReed',1.3],['horsetailTall',0.5],['fern',0.8],['bush',0.35],['flowers',0.6],['mossHummock',0.3],['rockSmall',0.4],['rock',0.15]]`; `REAL.near` gains `['flowers',0.3]` and fern 0.5. Within 10 m of a group's `point`, on its river side, no plant taller than 0.6 m.

- [ ] **Step 1: Write the failing test** `the banks of A–C are green: a plant at least every 4 m of bank, low by the animals`: walk both banks every 2 m from river d 0 to 850, 1–6 m from the edge; ≥ 80 % of samples have a placement within 3 m (skip samples inside a `clear` circle or Mosi's path); every placement within 10 m of a group's point on its river side is ≤ 0.6 m tall.
- [ ] **Step 2: Run** `ardalur.test.mjs` — Expected: FAIL (coverage below 80 %).
- [ ] **Step 3: Implement** the new zone chances and the low ring round the groups.
- [ ] **Step 4: Run** `ardalur.test.mjs` — Expected: PASS, including `the real valley: each section stays within the forest budget…`.
- [ ] **Step 5: Commit** — "Valley: green banks along the river, low by the animals".

### Task 6: The still shots see what they show

**Files:**
- Modify: `remake/chapters/kafli4-route.js` (`STILLS`), `remake/chapters/kafli4-flight.js:259-282` (cuts from `STILLS`)
- Modify: `remake/engine/camera/flight-camera.js:45-51` (`bankShadow`), add `stillViews`
- Modify: `remake/world/ardalur/index.js`, `remake/world/ardalur/banks.js` (skip plants in the views)
- Test: `remake/tests/ardalur.test.mjs`, `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Produces:
  - `STILLS: [[shot, from, to, options]]` — every fixed shot of the flight with the flight times the script uses now (`belowTakeOff`, B's and C's `waterLevel` (51–54.5), `mosiBank` 57.5–63, `bankShadow` 63–68 `{ group: 'lizards-2' }`, `mosiRim`, `gorgeHigh`, `fallsSide`, `fallsTop`); the script cuts to them from this list.
  - `stillViews(route, { heightAt }) -> [{ shot, from, to, position: Vector3, looks: Vector3[] }]` — each still's camera where its `FIXED` builder puts it on the unattended schedule, and her body every 0.5 s of the shot (Mosi's head too for `mosiBank`, the group's middle for `bankShadow`).
  - `bankShadow`: the camera 8 m from the group's middle away from the river, 1.6 m over the ground, looking at a point between the group (weight 0.6) and her body.
  - `plantSteps` skips a plant taller than 0.5 m within 6 m of a view's position, and any plant whose body comes within 1 m of a segment from a view's position to one of its `looks`.

- [ ] **Step 1: Write the failing tests:**
  - ardalur: `the still shots see what they show: nothing tall by the camera, nothing on the line of sight` — over `litValley()` placements and every view of `stillViews(route, …)`.
  - kafli4 (`playWide` watcher): `the shadow shot shows the lizards it is about, large`: at the frame of `bankShadow` where her ground point is nearest the group, the projected height of the group's tallest visible member ≥ 8 % of the frame (aspect 1.6), and the group's middle is inside the frame.
- [ ] **Step 2: Run** both files — Expected: FAIL (fern fronds by the shadow shot; a bush in `mosiBank`).
- [ ] **Step 3: Implement** `STILLS`, `stillViews`, the new `bankShadow`, and the plants' skip.
- [ ] **Step 4: Run** `ardalur.test.mjs`, `flight-camera.test.mjs`, `kafli4.test.mjs`, `flug.test.mjs` — Expected: PASS (`every frame of the flight shows her and Egill…` too).
- [ ] **Step 5: Commit** — "Flight: the still shots keep their view clear; the shadow shot frames the lizards".

### Task 7: Chunk 1 seen, measured and sent

**Files:**
- Test: `remake/tests/kafli4.test.mjs`
- Output (ignored): `qa/remake/kafli4/lif1/…`

- [ ] **Step 1: Write the failing tests** in kafli4 (`playWide`, and `playUpright` for aspect 0.625):
  - `in every chase shot of C a group of animals is in view, large enough to see`: per chase shot between 35 and 80 s, the share of frames where some `crowds.placed()` critter projects inside the frame with height ≥ 16 px at 800 px frame height is ≥ 0.5 (16:10) and ≥ 0.33 (upright, 1280 px frame height).
  - `the animals stay in their budget`: every frame of the flight, `crowds.triangles() <= 40000` and `crowds.calls() <= 12`.
- [ ] **Step 2: Run** `kafli4.test.mjs` — Expected: PASS if Tasks 2–6 met the spec; a FAIL names the shot and its share. Fix the scale or the layout (not the threshold) and rerun.
- [ ] **Step 3: Run** the whole suite in the background — Expected: `ℹ fail 0`.
- [ ] **Step 4: Measure:** bench (`tools/capture.mjs --bench 120`) on the 25 frames of `.superpowers/sdd/kafli4/butur8-measure.sh` plus chapter times 216, 223, 239, 244, 248 (groups 1, 3, 5, 6 and the shadow shot), both sizes, quiet machine; record GPU/calls/triangles in the ledger. Expected: every frame within Global Constraints.
- [ ] **Step 5: Video** `node remake/tools/chapter-video.mjs --out qa/remake/kafli4/lif1 --chapter flug --query lit=1 --size 1280x800 --max 200 --sound --stats` (the browser pane on a static page while it records) → `simi.mp4`. Expected: its report's frame lag no worse than `qa/remake/kafli4/lag/leikur` (p90 257 ms, max 1593 ms: spec 8, no new hitches). Send it to the owner with the bench, and ask for the smáeðla model (spec 7 row 1). Commit tests; ledger line. Wait for his yes before chunk 2.

---

## Chunk 2: The forest and the land

### Task 8: Far-tree cards

**Files:**
- Create: `remake/world/forest/cards.js`
- Modify: `remake/world/forest/batch.js` (`cullBatches`, the batcher), `remake/world/forest/config.js` (`FOREST.lod.cardFrom = 150`, the spec's "um 150 m"; if the vista test cannot reach its drop at 150, rule a nearer distance from the measurement and ledger it)
- Modify: `remake/world/ardalur/index.js` (atlas from `world.renderer`)
- Test: `remake/tests/ardalur.test.mjs`

**Interfaces:**
- Produces:
  - `createCardAtlas(renderer: THREE.WebGLRenderer | null, library, names = ['broadleaf','araucaria','treeFern','swampConifer']) -> { texture, cellOf(name, variant) -> [u0, v0, u1, v1], dispose() }` — each species variant rendered from the side into a 256 px cell (orthographic, alpha) when a renderer is given; a flat cell of the species' crown colour when not (Node).
  - `cardMaterial(atlas, world)` — a camera-facing quad about the vertical (vertex shader, as `far-land.js` `mistMesh`), alpha-tested, fogged like the plants.
  - The batcher gives each tree in `names` a card in its section's card mesh; `cullBatches` draws a tree beyond `cardFrom` from the camera as its card and leaves its mesh out; nearer, the mesh as now. Cards cast no shadow.
- [ ] **Step 1: Write the failing tests:**
  - `a far tree is a card, a near one a mesh`: place the camera 60 m and then 220 m from one broadleaf in a built section → its range in the merged mesh is drawn at 60 m and not at 220 m; its card the other way round.
  - `a card stands where its tree stands, as tall and as wide`: card centre within 0.5 m of the tree's foot (x, z); height and width within 10 % of the tree's.
  - `the vista over the land costs fewer triangles`: with the camera at the `vista` shot at 139 s, the valley's drawn triangles drop by ≥ 25 % against `cardFrom = Infinity`.
- [ ] **Step 2: Run** `ardalur.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `cards.js` and the card level in `batch.js`.
- [ ] **Step 4: Run** `ardalur.test.mjs` and `forest*.test.mjs` (the chapter 1–3 forests must not change: `cardFrom` applies only where a section mesh has cards) — Expected: PASS.
- [ ] **Step 5: Commit** — "Forest: far trees drawn as cards of their own models".

### Task 9: The land above the falls

**Files:**
- Modify: `remake/chapters/kafli4-route.js` (`HILLS`, `OUTCROPS`, `STREAMS`, `PONDS`, `MEADOW`)
- Modify: `remake/world/ardalur/terrain.js` (`heightAt`), `remake/world/ardalur/river.js` (stream and pond surfaces, pond plants), `remake/world/ardalur/banks.js` (outcrop rocks, no trees in `MEADOW`)
- Test: `remake/tests/ardalur.test.mjs`

**Interfaces:**
- Produces (all above the falls, inside the 160 m corridor, hand-placed so the `vista` shot at 139 s sees them):
  - `HILLS: [[x, z, height 3–8, radius 40–90]]` (3–5), smooth bumps added to `heightAt`;
  - `OUTCROPS: [[x, z, scale 2–4]]` (4–6), `rock` props;
  - `STREAMS: [[[x, z], …]]` (1–2), each ending in the upper river, a bed cut 0.6 m and a water strip 1.5–3 m wide falling along its length;
  - `PONDS: [[x, z, radius 8–14]]` (2–3), basins with water, lilies and reed as `poolPlants` makes them;
  - `MEADOW: [x, z, radius]` — an open glade, no trees, the herd's place (Task 14), in the middle third of the vista frame.
- [ ] **Step 1: Write the failing tests:**
  - `the land above the falls rolls`: ground height across the corridor above the falls spans ≥ 6 m (excluding the river bed).
  - `streams run down into the river and ponds hold their water`: each stream's level falls monotonically and its end is within 2 m of the upper river's edge; each pond's rim is above its water all round.
  - `the meadow is open and in the vista`: no tree in `MEADOW`; at 139 s its middle projects into the middle third of the vista frame.
  - Keep `the land never comes within 2 m of her path…`, `the plants keep out of her flight lane…`, `high over dry land no tree crown rises within 9 m under her…` and the far-land tests green.
- [ ] **Step 2: Run** `ardalur.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** the features in terrain, river and banks.
- [ ] **Step 4: Run** `ardalur.test.mjs`, `flug.test.mjs` (`every frame of the flight shows her and Egill…`) — Expected: PASS.
- [ ] **Step 5: Commit** — "Valley: hills, outcrops, streams and ponds above the falls".

### Task 10: Groves and glades

**Files:**
- Modify: `remake/world/ardalur/banks.js` (`groveAt`, tree chances)
- Test: `remake/tests/ardalur.test.mjs`

**Interfaces:**
- Consumes: `MEADOW` (Task 9) stays a glade; the groups' points (Task 2).
- Produces: `groveAt(x, z, seed) -> number` in 0..1 (seeded value noise, blobs 60–120 m across, about 45 % of the land ≥ 0.5); valley/near/far tree chances × `(0.4 + 3.2 * groveAt)`; no tree within 25 m of a group's point on its inland side.
- [ ] **Step 1: Write the failing tests:**
  - `trees grow in groves with glades between`: in the built valley, trees per hectare where `groveAt ≥ 0.6` ≥ 3 × where `groveAt ≤ 0.2`.
  - `each group is seen from the river: no tree behind it within 25 m`.
  - Keep `a section ahead is built before it is wanted, on a slow device too` and both forest-budget tests green with the groves.
- [ ] **Step 2: Run** `ardalur.test.mjs` — Expected: FAIL (even spread).
- [ ] **Step 3: Implement** `groveAt` and the chances.
- [ ] **Step 4: Run** `ardalur.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** — "Valley: trees in groves with glades between".

### Task 11: Chunk 2 measured and sent

- [ ] **Step 1: Run** the whole suite in the background — Expected: `ℹ fail 0`.
- [ ] **Step 2: Measure** as Task 7 Step 4 plus chapter times 286, 300, 312, 317, 322, 331 (D–G); both sizes. Expected: within Global Constraints; F and G no higher in triangles than before chunk 2.
- [ ] **Step 3: Video** `--out qa/remake/kafli4/lif2` as Task 7 Step 5 (whole flight, same lag check); send with the bench; ask whether the owner wants to try his Android tablet now (localhost link only unless he asks). Ledger line; wait for his yes.

---

## Chunk 3: The small lizard (the owner's model)

### Task 12: The bake tool and crowd models

**Files:**
- Create: `remake/tools/prep-crowd.mjs`, `remake/tools/blender-crowd.py`, `remake/world/critters/crowd-models.js`
- Modify: `remake/world/critters/crowd.js` (levels)
- Test: `remake/tests/crowd.test.mjs`

**Interfaces:**
- Consumes: the owner's GLB (rigged, with clips) — ask first, with spec 7's row, and wait. A model that comes without a clip it needs: stop and ask him (spec 7: the fallback is motion in the shader, as the birds' wings, only with his yes).
- Produces:
  - `node remake/tools/prep-crowd.mjs <in.glb> <out.glb> --name smaedla --length 0.8 --clips run,idle --frames 8 --near 800 --far 250 --tex 512` — runs `blender.exe -b` with `blender-crowd.py`: scales to `--length` metres nose to tail, faces +X, decimates a near and a far mesh to the triangle counts, bakes each clip into `--frames` shape keys `<clip>.<k>` evenly over the clip, exports both meshes with extras `{ clips: { run: { frames, seconds } }, length, height, pivot }`; then `tools/quantize-glb.mjs`; textures resized by ffmpeg as `prep-character.mjs` does.
  - `loadCrowdModel(url) -> Promise<{ lods: [{ geometry, until: 30 }, { geometry }], material, clips, height, pivot }>`.
  - `clipPose(model, clip, time, phase = 0) -> { [morphName]: weight }` — the two frames round `(time / seconds + phase) mod 1`, linearly blended, weights summing to 1.
  - `crowds.reserve(kind, n, { lods, material })` draws a critter within `until` of the camera from level 0 and beyond it from level 1 (two calls for the kind).
- [ ] **Step 1: Write the failing tests** (a synthetic geometry with morphs `run.0`…`run.7` built in the test, no art):
  - `clipPose blends the two frames round the time`: at 3.5 / 8 of the clip → `run.3: 0.5, run.4: 0.5`; wraps from `run.7` to `run.0`.
  - `a crowd with two levels draws near critters fine and far ones coarse`: one at 10 m in level 0, one at 60 m in level 1, `calls() === 2`.
- [ ] **Step 2: Run** `crowd.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** the loader, `clipPose`, levels; then the tool, and run it on the owner's GLB → `remake/assets/critters/smaedla.glb` (check its triangle counts and size; credit the owner's Tripo model in `remake/assets/critters/CREDITS.md`, a new file, LF).
- [ ] **Step 4: Run** `crowd.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** — "Crowds: baked crowd models from the owner's Tripo GLB; the small lizard".

### Task 13: The small lizards on the banks and across the land

**Files:**
- Modify: `remake/world/ardalur/animals.js` (`MEMBER.lizards = 'smaedla'`, run/idle from `clipPose`), `remake/world/ardalur/life.js` (`rows`), `remake/chapters/kafli4-flight-play.js` (big call starts the rows), the chapters' asset preload (`chapters/kafli4.js`, `chapters/flug.js`: load `smaedla.glb` before the start button, as characters are)
- Test: `remake/tests/ardalur.test.mjs`, `remake/tests/life.test.mjs`, `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Produces: `life.bigCall(at: number)` — called by play's `bigCall` (by itself or on a tap); rows set off at `at` + 0.5…1.5 s; F: 3 rows of 10 out of the groves toward the far pool (≥ 25 m from her path); G: 2 rows of 10 seen from the glide, nearing the pool; and 4 flocks of 18 `bird` rising out of groves above the falls, 1–3 s after `at`, flying off toward the pool (spec 2F). The colour is the owner's pick (STYLE.md, the critters' line).
- [ ] **Step 1: Write the failing tests:**
  - ardalur: the lizards groups use `smaedla`; their idle and run poses come from `clipPose` (a morph named `run.*` or `idle.*` has weight > 0).
  - life: `the big call sends rows of small lizards and flocks of birds toward the far pool`: none moves before `bigCall`; after it each row's middle comes ≥ 30 m nearer the pool within 10 s and each flock rises ≥ 10 m; none within 25 m of her path; jump vs play equal; the same when the call came early on a tap.
  - kafli4: at the `vista` shot after the big call, ≥ 10 small lizards project ≥ 8 px tall (aspect 1.6).
- [ ] **Step 2: Run** the three files — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them and the whole suite in the background — Expected: PASS, `ℹ fail 0`.
- [ ] **Step 5: Commit**, video `qa/remake/kafli4/lif3` (C and F–G), send; ask for the grazer and the flyer (spec 7 rows 2–3). Ledger; wait for his yes.

---

## Chunk 4: The herd and the flyers

### Task 14: The herd above the falls

**Files:**
- Modify: `remake/world/ardalur/life.js` (`herd`), preload `grasbitur.glb` (Task 12's tool: `--name grasbitur --length 2.5 --clips walk,trot,graze --near 1500 --far 400`)
- Test: `remake/tests/life.test.mjs`, `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Produces: 12 grazers in `MEADOW` grazing (`graze`), each lifting its head 0.5–1.5 s after `bigCall`, walking 4 s, then trotting toward the far pool; in G nearing it.
- [ ] **Step 1: Write the failing tests:** `the herd grazes in the meadow until the big call, then sets off toward the far pool` (positions in `MEADOW` before; ≥ 40 m nearer the pool 15 s after; none within 25 m of her path; jump vs play equal); kafli4: `the vista shows the herd` (≥ 8 grazers ≥ 12 px tall at 139 s).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — "Life: the herd above the falls answers the big call".

### Task 15: The flyers of the gorge

**Files:**
- Modify: `remake/chapters/kafli4-route.js` (`NESTS`), `remake/world/ardalur/life.js` (`flyers`), preload `flugdyr.glb` (`--name flugdyr --length 0.6 --clips flap,glide,perch --near 600 --far 200`)
- Test: `remake/tests/life.test.mjs`, `remake/tests/flug.test.mjs`

**Interfaces:**
- Produces: `NESTS: [[x, y, z, heading]]` — 8 ledges on both walls between river d 950 and 1150, 10–25 m over the river. Each flyer takes off when the schedule brings her within 25 m, joins a formation round her (offsets ≥ 5 m from her body, outside the chase/face/side cameras' 3 m), climbs E with her, circles with her in the orbit (F), glides down in G, and lands on the far pool's far bank (Task 16's spots). `reduced`: no circling; the formation holds its offsets. They are not tap targets (spec 4).
- [ ] **Step 1: Write the failing tests:** life: `the flyers leave their nests as she passes and fly with her to the far pool` (each on its ledge before its time; within 15 m of her for ≥ 80 % of 100–165 s; never within 4 m of her body or Egill's head; at the end on the far bank); flug: `no flyer comes within 3 m of the camera or between the camera and Egill` (every frame), and the same with `reduced: true` plus `the flyers never circle under reduced motion`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — "Life: the gorge's flyers fly with her to the far pool".

### Task 16: The streams in G and the arrivals at the far pool

**Files:**
- Modify: `remake/chapters/kafli4-route.js` (`FAR_POOL.gather`), `remake/world/ardalur/life.js` (`arrivals`), `remake/chapters/kafli4.js` (scene 7 keeps them idle)
- Test: `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Produces: `FAR_POOL.gather: [[x, z]]` — spots on the far bank, away from Mosi's bed, the reed Slóeðla blows from and the horn shot's line. Lizards, grazers and flyers that reach the pool stand there idle through scene 7.
- [ ] **Step 1: Write the failing test** `the animals that came stand at the far pool, never in front of Mosi, the reed or the horn`: in every scene 7 frame of `playWide`, no gathered critter is between the camera and Mosi's head, the reed bed's middle or Slóeðla's bed; ≥ 15 gathered critters inside the frame in the wide shots.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `kafli4.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** — "Scene 7: the animals that came stand at the far pool".

### Task 17: Their sounds, and the whole flight to the owner

**Files:**
- Modify: `remake/engine/audio/sfx.js` (`grazers`, `flyers`), `remake/chapters/kafli4-flight-play.js` (`PLAY.bigAnswers` gains them), `remake/world/ardalur/life.js` (the flyers cry as they take off), `remake/assets/audio/kafli4/CREDITS.md`
- Uses: `.superpowers/sdd/kafli4/hljod-eleven.mjs` pattern for ElevenLabs sound-generation takes (key never printed), a pick page like `qa/remake/kafli4/hljod/index.html`, `remake/tools/kafli4-sounds.mjs` to cut and level the picks.
- [ ] **Step 1:** Make 4 takes each for a small grazer's call and a small flyer's cry; send the pick page; wait for his picks.
- [ ] **Step 2:** Install the picks through `kafli4-sounds.mjs`; add the sfx; a test in `flug.test.mjs`: `the big call's answers include the herd and the flyers` (sfx names in `seen.sfx` after the call), and `the flyers cry as they leave their nests, once`.
- [ ] **Step 3: Run** the whole suite in the background — Expected: `ℹ fail 0`.
- [ ] **Step 4: Measure** both sizes on all frames of Tasks 7 and 11; record in the ledger. Expected: within Global Constraints.
- [ ] **Step 5:** Videos: the whole flight (`flug`, lit) and the whole chapter (`kafli4`), both with sound; phone copies; send to the owner with the bench. Commit; ledger line. Merge into main and push only on his yes.
