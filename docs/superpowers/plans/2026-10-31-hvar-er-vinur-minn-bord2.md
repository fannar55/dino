# Hvar er vinur minn? Level 2 (Steinagljúfrið) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Átta bútar (0–7). Hver bútur endar á myndum og stuttu myndbandi til eigandans, og næsti byrjar ekki fyrr en hann segir til.

**Goal:** Turn level 1 into "levels as data" without changing how it plays, then build level 2, Steinagljúfrið. Level 2 has:
- 16 leaves: 4 friend pairs, a new baby Flugeðla among them, and 4 fossil pairs
- four tasks in order: light, headbutt, reach, fly
- a finale where everyone pulls together
- a sunset with stars

Level 2 unlocks after level 1.

**Architecture:**
- **Shared core.** Rules, step ladder, story, babies, Mosi, camera, scene runner, gifts, basket and the celebration frame are generic over a *level description*.
- **Level descriptions** are pure data modules in `remake/engine/memory/levels/` (no three.js), so node tests and the playthrough tool can import them.
- **Level world modules** hold each level's physical world (terrain, props, choreography, scenes) in `remake/engine/memory/levels/<id>/`.
- **Level 1 moves first.** It moves onto this structure in Tasks 0–1 and must play the same, checked against baseline playthroughs captured before any change.

**Tech Stack:** three.js (bundled, `dist/vendor/`), plain ES modules, `node --test` with `remake/tests/setup.mjs`. Also:
- headless Edge through `remake/tools/memory-playthrough.mjs`
- Blender 5.2 headless with `remake/tools/blender-gift.py` and `scripts/memory-baby-bake.mjs`
- ElevenLabs v4 through `remake/tools/memory-voices.mjs`

**Spec:** `docs/superpowers/specs/2026-10-31-hvar-er-vinur-minn-bord2-design.md`. Level 1's spec is `docs/superpowers/specs/2026-10-28-hvar-er-vinur-minn-lifandi-design.md`.

## Global Constraints

**Budget and screen sizes**
- Per framing, in the tablet preset: ≤100 draw calls and ≤250,000 triangles. Report the worst framing in every run.
- Three screen sizes: 1280×800, 820×1180 and 390×844. Leaf buttons are ≥44 px at every size, measured from the DOM.

**Pacing**
- No watch longer than about 8 s without a cut or a tap.
- Each journey takes ≤ about 10 s.
- A level-2 round takes a child about 5–7 minutes.

**Assets and downloads**
- No art drawn or modelled by Claude: no SVG figures, no procedural stand-in models, no own Blender modelling.
- Models come from the owner (Tripo3D) or from open libraries (CC0 / CC BY) that the owner downloads. Technical processing is allowed: baby adaptation, decimation, welding, quantization.
- Every open asset gets a `-source.json` (author, licence, source URL, md5, triangles, changes, commands) and a credit behind the ending card's "i".
- Physical sounds (rocks, thud, rope) are real samples (Freesound CC0 / CC BY). Ask the owner before any download: name, source and size.
- Task badges for level 2 are renders of the level's own models or open-licensed icons the owner approves. No new Claude-drawn SVG.

**Files and git**
- Never touch `design/` or `dist/`. Importing from `dist/vendor/` is fine.
- Commits on branch `codex/minnisspil-first-playable` are fine. Merge and push only on the owner's word.
- Never run a bare `git stash`. Never push, merge, rebase or reset.
- Keep each file's line endings: the memory files are LF, and `levels/berjalundur/adventure.js` (today's `bridge-adventure.js`) keeps its 2-line CRLF tail.

**Tests**
- No new test files. Extend the existing `remake/tests/memory-*.test.mjs` files.
- Run `npm run test:memory` (from `remake/`) once per task. Never run the root `npm test`.

**Browser storage and query**
- Wrap every `localStorage` read and write in try/catch. The game works with storage blocked; level 2 is then locked unless `?bord=2` is given.
- Storage key `minnisspil.unlocked` holds a JSON array of level ids. `?bord=2` opens level 2 directly.

**Copy (verbatim)**
- Locked card: "Kláraðu Berjalundinn fyrst".
- Level-1 ending button: "Steinagljúfrið →".
- Level-2 ending buttons: "Spila aftur" and "Berjalundurinn".
- Gift sentence: "Þú fannst alla fjóra steingervingana!".
- Gifts-left wait: "Finnum fyrst það sem er eftir undir laufunum!".

**Running and voices**
- Dev server: port 4221, launch config `minnisspil`. Give the owner only the localhost link.
- Voices: every new line goes through `memory-voices.mjs --dry-run`, then generation, then a scribe_v1 check by the controller. The owner picks takes by ear. Never print the ElevenLabs key.

## Review Focus

1. **Level 1 drifts after the refactor.** A reasonable player expects the same round. Tasks 0 and 1 compare against baseline playthroughs; see the compare step in Task 0.
2. **Storage is blocked or throws** (private window, cleared site data). Level 2 is locked, nothing crashes, and `?bord=2` still opens it. Task 3 tests it in `memory-rules.test.mjs`.
3. **16 leaves on a phone, and the "everything found before the tunnel" wait.**
   - Every shut leaf stays on screen and tappable at 390×844.
   - The round cannot soft-lock.
   - Task 3 measures it; Task 5 runs `--gifts-last --level 2` at 390×844.
4. **Restart in the middle of a level-2 step** (rope flight, pull, glow, a fossil in flight). Everything resets: rope, trunk, glow and basket "0 / 4". Task 6 and Task 7 runs use `--restart-at pull` and `--restart-at gift`.
5. **Budget with 8 babies plus the gorge.** Each run reports the worst framing; Task 3 sets the gorge's triangle caps; Task 7's throttled run reports the planner and resolution.

## File structure

**Create:**
- `remake/engine/memory/levels/index.js`: `LEVELS`, `levelById`, `levelNumber`, `unlockedLevels`, `unlockLevel` and `chooseLevel`. Pure data plus storage helpers.
- `remake/engine/memory/levels/berjalundur.js`: level 1 as data.
- `remake/engine/memory/levels/steinagljufur.js`: level 2 as data.
- `remake/engine/memory/levels/worlds.js`: `loadLevelWorld(id)` with dynamic imports of each level's world module.
- `remake/engine/memory/step-rules.js`: `createStepRules(level)`, the generic step ladder that replaces the hard ladder in `bridge-rules.js`.
- `remake/engine/memory/levels/berjalundur/`: level 1's physical world, moved here with `git mv`:
  - `adventure.js` (was `bridge-adventure.js`)
  - `bridge-props.js`, `build-props.js`, `ground.js` (was `world-ground.js`), `dressing.js` (was `world-dressing.js`), `scenery.js` (`createGladeScenery`, out of `world-props.js`)
  - `scenes/branch.js`, `roll.js`, `cross.js`, `lay.js`, `finish.js` and `celebrate.js`
  - `world.js` with `createLevelWorld(stage)`
- `remake/engine/memory/levels/steinagljufur/`: level 2's world. It has `world.js`, `ground.js`, `props.js` and `rope.js`, plus `scenes/light.js`, `headbutt.js`, `through.js`, `reach.js`, `fly.js`, `climb.js`, `pull.js`, `ledge.js` and `celebrate.js`.
- Assets:
  - `remake/assets/memory/pteranodon-baby.glb` and its `-source.json`
  - `remake/assets/memory/portraits/pteranodon.webp`
  - `remake/assets/memory/bord2/*.glb` and `*-source.json`
  - `remake/assets/memory/gifts/{ammonite,trilobite,fern,footprint}.glb` and `-source.json`

**Modify:**
- `rules.js`: no API change.
- `bridge-rules.js`: becomes a level-1 wrapper over `step-rules.js`.
- `playful-flow.js`: generic over `level.steps`.
- `game.js`: level-driven.
- `world.js`: shared stage plus a level world.
- `surprise-items.js`: a gift table keyed by id, with level-1 and level-2 items. The world builds only the level's gifts.
- `voice-lines.js`: level-2 lines with the prefix `g2_`.
- `audio.js`: a motif for pteranodon, and level-2 sound methods.
- `baby-actors.js`: pteranodon art.
- `gestures.js`: the missing fail moves.
- `scenes/first-minute.js` and the shared celebration frame.
- `remake/minnisspil.html` and `minnisspil.css`: level picker, level-2 ending buttons, 4 progress dots.
- `remake/engine/looks.js`: shared, additive only. It gets the looks `gorgeAfternoon`, `gorgeGolden`, `gorgeSunset` and `gorgeEvening`.
- `remake/tools/memory-playthrough.mjs`: adds `--level`. Its level-1 driver tables come from the level description.
- `scripts/memory-baby-bake.mjs`: adds a `pteranodon` entry.
- Tests that import moved files get their import paths updated.

---

### Task 0: Rules, step ladder and story as data (level 1 plays the same)

**Files:**
- Create: `levels/index.js`, `levels/berjalundur.js`, `step-rules.js`
- Modify: `bridge-rules.js`, `playful-flow.js`, `game.js`
- Test: `remake/tests/memory-bridge-rules.test.mjs`, `memory-playful-flow.test.mjs`, `memory-rules.test.mjs`

**Interfaces:**
- Produces:
  - `BERJALUNDUR`, a frozen object:
    - `id: 'berjalundur'`, `number: 1`, `title: 'Berjalundurinn'`, `ribbon: 'Leiðin að berjalundinum'`
    - `friends: ['triceratops','stegosaurus','brontosaurus']`, `gifts: ['shrew','hermitCrab','crab']`
    - `steps`, `story`, `flags(done)`, `onCancel(id, opts, done)`, `targets`, `copy` (welcome, ending, help and loading strings, verbatim from `minnisspil.html`), `music(state)`, `eventSounds` and `eventCaptions`
  - A step is one of:
    - `{ id, kind:'task', target, species, beatWords?, holds?, journey? }`
    - `{ id, kind:'travel', target, needsAllFound?, waitsForGifts?, automatic:true }`
    - `{ id, kind:'together', target, beatWords }`
  - Level 1's steps, in order:
    - `lift` (task, target `branch`, species brontosaurus, `holds:'roll'`, journey 'Lyfta grein')
    - `roll` (task, `log`, triceratops, `['Einn!','Tveir!','ÝTA!']`, journey 'Gera trjábrú')
    - `cross` (travel, `staging`, `needsAllFound`, `waitsForGifts`)
    - `lay` (task, `bark`, stegosaurus, `['Ein!','Tvær!','Þrjár!']`, journey 'Leggja gönguleið')
    - `finish` (travel, `grove`)
  - `level.story[stepId]` holds today's story keys and prompts verbatim. Examples:
    - lift: `{ ready:'lift-ready', arriving:'lift-arriving', find:'find-friends' }`
    - cross: `{ open:'bridge-open', gather:'gather-friends', arriving:'friends-arriving', gifts:'gifts-left', landing:'gifts-landing' }`
  - `BERJALUNDUR.flags(done: Set)` returns today's fields exactly: `{ branch:'held'|'down', bridgeBuilt, atStaging, boardwalkBuilt, visited }`.
  - `createStepRules(level)` returns the API of today's `createBridgeAdventure()` in `bridge-rules.js`: `getState, unlock, select, next, ask, pick, failDone, dismiss, can, choose, complete, cancel, restart`.
    - `getState()` returns today's fields plus `done: string[]` and `...level.flags(done)`.
    - A `together` step's `ask(target)` returns `{ kind:'start', action:id }` and opens no bubbles.
    - `holds` keeps that step's species busy until the named step completes, as today's Þórseðlur hold the branch.
  - `bridge-rules.js` keeps `BRIDGE_HELPERS`, `BRIDGE_ACTIONS` and `BRIDGE_OBSTACLES`, all derived from `BERJALUNDUR`, and `createBridgeAdventure = () => createStepRules(BERJALUNDUR)`.
  - `nextStoryStep(memory, bridge, ready = {}, level = BERJALUNDUR)` returns the same keys and objects for level 1.
  - `levels/index.js`:
    - `LEVELS = [BERJALUNDUR]` (Task 3 adds `STEINAGLJUFUR`)
    - `levelById(id)`, `levelNumber(n)`
    - `unlockedLevels(storage)` returns a `Set` that always holds `'berjalundur'`
    - `unlockLevel(id, storage)` returns a boolean
    - `chooseLevel(params, storage)` returns `{ level, locked:Set }`
    - `storage` defaults to a try/catch wrapper around `localStorage`
- Consumes: `createMemoryGame({ random, species, gifts })` from `rules.js`, unchanged.

- [ ] **Step 1: Capture the level-1 baseline before any change.**
  - Run three playthroughs, one at a time, in the background, at HEAD b5ec7f6:
    - `node remake/tools/memory-playthrough.mjs --out qa/memory/bord2/base-1280 --size 1280x800 --video`
    - `... --out qa/memory/bord2/base-390-giftslast --size 390x844 --gifts-last`
    - `... --out qa/memory/bord2/base-rapid --mode rapid`
  - Write the git-ignored `qa/memory/bord2/compare.mjs`. Given two `report.json` files, it prints differences in:
    - finished, errors and stuck
    - the milestone order
    - the spoken line ids in order
    - each timeline mark (allowed difference 1.5 s)
    - the ending card text
    - the worst framing (allowed difference 5 %)
  - Expected: all three runs finish with 0 errors.
- [ ] **Step 2: Write the failing tests.**
  - In `memory-bridge-rules.test.mjs`, add `step rules run any level's ladder`. It builds a fake level of three steps: a task `a` for species `x`, a `together` step `b`, and a travel `c` with `needsAllFound`. It asserts:
    - `next()` is `a`'s target first.
    - `ask` on `b` before `a` is done returns `{ kind:'not-yet' }`.
    - After `complete('a')`, `ask` on `b`'s target returns `{ kind:'start', action:'b' }`.
    - `can('c')` is false until every friend is unlocked.
    - `restart()` clears `done`.
  - Add `holds keep a species busy until the named step`: after `complete('lift')`, `free` lacks brontosaurus, and after `complete('roll')` it has her.
  - In `memory-playful-flow.test.mjs`, add `the story is read from the level`: the fake level's prompts come back verbatim.
- [ ] **Step 3: Run them and see them fail.** Run `npm run test:memory` from `remake/`. Expected: the new tests fail (`createStepRules` is not defined) and every other test passes.
- [ ] **Step 4: Implement `step-rules.js`, `levels/berjalundur.js` and `levels/index.js`.** Then rewire `bridge-rules.js` and `playful-flow.js`.
  - `cancel(id, opts)` calls `level.onCancel?.(id, opts, done)`. Level 1 uses it to keep today's `cancel(id, { branch })` behaviour exactly.
  - The existing bridge-rules, choose and playful-flow tests must pass **unchanged**. That is the proof that the ladder is the same.
- [ ] **Step 5: Make `game.js` level-driven.** Replace the constants with level fields; the DOM text on the first paint stays identical:
  - `roster`, `pairs`, `PANEL_WORDS`, `PUSH_WORDS`, `taskIcons`, the target aria-labels, `actionFor` and `reflectJourney` steps
  - the progress dots (`level.friends.length`) and basket (`0 / ${level.gifts.length}`)
  - the music stage
  - the event-to-sound mapping (`level.eventSounds`) and the event captions (`level.eventCaptions`)
  - `launchAction`'s gift wait (`step.waitsForGifts`)
  - the ending and help copy
  - `pickFriend` keeps calling today's world methods until Task 1.
- [ ] **Step 6: Run the tests.** `npm run test:memory`: every test passes.
- [ ] **Step 7: Compare against the baseline.** Run the same three playthroughs into `qa/memory/bord2/t0-*` and compare them with `compare.mjs`.
  - Expected: no differences beyond the allowed ones.
  - A difference is a bug to fix, not to explain away.
- [ ] **Step 8: Commit.** Message: "Hvar er vinur minn?: level 1 as data (step ladder, story, game.js read the level description; level 1 plays the same)".

### Task 1: The world split by level (level 1 plays the same)

**Files:**
- Create: `levels/worlds.js` and `levels/berjalundur/world.js`
- Move with `git mv`, keeping line endings:
  - into `levels/berjalundur/`: `bridge-adventure.js`, `bridge-props.js`, `build-props.js`, `world-ground.js`, `world-dressing.js`
  - into `levels/berjalundur/scenes/`: `scenes/branch.js`, `roll.js`, `cross.js`, `lay.js`, `finish.js`, `celebrate.js`
- Modify: `world.js`, `world-props.js` (`createGladeScenery` moves out), `game.js`, and the tests that import moved files: `memory-clearance`, `memory-convoy`, `memory-roll-contact`, `memory-partial-board-nav`, `memory-geometry-check` and `remake/tools/memory-geometry-check.mjs`.

**Interfaces:**
- Produces:
  - `createMemoryWorld({ canvas, onProgress, basketPoint, level })`, where `level` is a description.
  - The shared stage passed to `createLevelWorld(stage)` holds:
    - `THREE`, `scene`, `heightAt`, `fx`, `nests`, `scenes` (the runner), `mosi`, `babies`
    - `planWalk`, `planSpent`, `cancelWalk`
    - `cue(points, opts)`, `params` and `reducedMotion()`
  - `createLevelWorld(stage)` returns:
    - `layout`: keepOut, path, lift and dress
    - `navObjects`, `overviewPoints`, `cameraCue(cue)` and `getTargets()`, returning `[{ id, point, radius, next, tapAlong }]`
    - `tapPoint(id)`, `playStep(id, opts)` (returns a script id or null), `startFail(species, target)` and `isBusy()`
    - `update(dt)`, `afterActors(dt)`, `pollEvents()`, `avoidIdle(x, z)`, `getDebug()`, `reset()` and `dispose()`
  - The world API replaces `playBranch`, `playRoll`, `playCross`, `playLay`, `playFinish` and `startBridgeTask` with `playStep(id, opts)`. `setBridgeState` becomes `setStepState` and `pollBridgeEvents` becomes `pollStepEvents`.
  - `__demoStats` and `getDebug()` keep every key the playthrough reads (`bridge`, `cells`, `camera`, `scene`, …) unchanged for level 1.
- Consumes: Task 0's `BERJALUNDUR` and `createStepRules`.

- [ ] **Step 1: Move the files.** Move them with `git mv`, update the imports, and check the line endings of every moved file with node (byte check, not grep). Run `npm run test:memory`: it passes with only the import paths changed.
- [ ] **Step 2: Split `world.js`.**
  - Everything listed as level-1 terrain or props in the code map goes into `levels/berjalundur/world.js`: layout, `refineBridgeGround`, the ground look, scenery, `navObjects`, overview points, `cameraCue`, the task script calls, Mosi's walk over the bridge, the idle helpers using `wetGround`/`RIVER`, and the `planWalk` special cases.
  - `world.js` keeps:
    - renderer, camera director, leaves, cells and nests
    - babies, Mosi, reveal, match, hops and gifts
    - fx, idle play, dynamic resolution and debug
  - `CELLS`, `NESTS`, `SPECIES`, `MOSI_SPOT` and `GLADE_VIEW` come from the level description: add `grid`, `nests`, `mosiSpot` and `gladeView` to `BERJALUNDUR`.
  - `setBoard`'s length check uses `2 * (friends + gifts)`.
- [ ] **Step 3: Switch `game.js`** to `world.playStep(step.id, { species })`, `setStepState` and `pollStepEvents`.
- [ ] **Step 4: Run the tests.** `npm run test:memory`: every test passes.
- [ ] **Step 5: Compare against the baseline.** Run the three playthroughs into `qa/memory/bord2/t1-*` and compare with `compare.mjs`. Expected: no differences beyond the allowed ones. The worst framing is within 5 % of the baseline.
- [ ] **Step 6: Commit.** Then show the owner: a level-1 round video and the compare summary.

### Task 2: The baby Flugeðla

**Files:**
- Modify: `scripts/memory-baby-bake.mjs`, adding a `pteranodon` entry.
- Create: `remake/assets/memory/pteranodon-baby.glb` and `-source.json`, and `assets/memory/portraits/pteranodon.webp` (a render of the baby, like the other portraits).
- Modify: `baby-actors.js` (`MEMORY_CHARACTER_ART.pteranodon`), `audio.js` (a `MOTIFS` entry), `gestures.js` (`FAIL_GESTURES.pteranodon`) and `remake/assets/memory/roster.json`.

**Interfaces:**
- Produces: a baby with the clips `idle, walk, takeOff, fly, glide, land, happy, carry`, from the owner's `remake/assets/characters/pteranodon.glb` (39,154 triangles, Tripo3D by the owner). Shared helpers in `baby-actors.js` play the flight clips:
  - `actor.fly(points, { speed })`
  - `actor.land(point)`
  - `actor.carry(on)`
- Constraint: the baby's triangle count is no more than the heaviest of the other three babies. It gets the same LOD levels (`BABY_LEVELS`).

- [ ] **Step 1: Bake.**
  - Add the entry: head about 1.35×, wings about 0.75×, legs about 0.8×, tuned by eye to match the other babies.
  - Run `node scripts/memory-baby-bake.mjs --species pteranodon`.
  - Write `-source.json` with the author, the commands and the triangle count.
- [ ] **Step 2: Render.**
  - A turntable (front, side, back, three-quarter) next to the other three babies, in the game's light.
  - A short video of walk, takeOff, fly, glide, land and happy.
  - Save both to `qa/memory/bord2/t2/`.
- [ ] **Step 3: Wire the baby into the game.** Add the art entry, the portrait render, the motif and a fail gesture. In `memory-rules.test.mjs`, add `a four-friend level deals 16 cards` (4 friends, 4 gifts → 16 cards). Run `npm run test:memory`.
- [ ] **Step 4: Commit and stop.** The owner approves the baby before Task 3.

### Asset gate (the controller, alongside Tasks 0–2)

The controller searches the open libraries read-only and shows the owner contact sheets. The owner downloads, or makes the Tripo3D models. Nothing is committed before the owner approves. Each item lists its triangle cap after processing:

| Item | Source | Cap | Needed by |
|---|---|---|---|
| Gorge cliff walls, floor rocks, glade boulders | open | ≤40k for the whole static gorge in the search view | Task 3 |
| Tunnel mouth | owner, Tripo3D | ≤8k | Task 3 |
| Fossils: ammonite, trilobite, fern, footprint | open | ≤3k each | Task 3 |
| Rock pile (breaks into 4–6 rocks) | open | ≤6k | Task 4 |
| Crystals | open | ≤3k | Task 4 |
| Stone slab, tree on the top | open | ≤2k and ≤6k | Task 5 |
| Rope texture (image) | open | 512 px | Task 5 |
| Big dead trunk | owner, Tripo3D | ≤6k | Task 6 |
| Sounds: rock crumble, slab scrape, trunk thud, rope creak, glow chime | Freesound CC0 / CC BY | — | Tasks 4–6 |

Process each with `blender-gift.py` (rename to a general name only if needed) and `quantize-glb.mjs` (never on skinned meshes). Each task below starts only when its row is in.

### Task 3: The gorge glade, 16 leaves, fossils and the level picker

**Files:**
- Create: `levels/steinagljufur.js`, `levels/steinagljufur/world.js`, `ground.js` and `props.js`; the assets from the gate rows for Task 3.
- Modify: `levels/index.js` (`LEVELS = [BERJALUNDUR, STEINAGLJUFUR]`), `levels/worlds.js`, `surprise-items.js`, `voice-lines.js`, `game.js`, `world.js`, `minnisspil.html`, `minnisspil.css` and `memory-playthrough.mjs` (`--level`).

**Interfaces:**
- Produces:
  - `STEINAGLJUFUR`:
    - `id:'steinagljufur'`, `number:2`, `title:'Steinagljúfrið'`, `ribbon:'Leiðin upp á Sólarsylluna'`
    - `friends:['triceratops','stegosaurus','brontosaurus','pteranodon']`
    - `gifts:['ammonite','trilobite','fern','footprint']`
    - `grid` 4 × 4
  - Its steps, in order:
    - `light` (task, `tunnel`, stegosaurus, `holds:'through'`)
    - `headbutt` (task, `rocks`, triceratops, `['Einn!','Tveir!','BÚMM!']`)
    - `through` (travel, `tunnelExit`, `needsAllFound`, `waitsForGifts`)
    - `reach` (task, `ledge`, brontosaurus)
    - `fly` (task, `cliff`, pteranodon)
    - `climb` (travel, `clifftop`)
    - `pull` (together, `trunk`, `['Einn!','Tveir!','TOGA!']`)
    - `walk` (travel, `sunLedge`)
  - `STEINAGLJUFUR.story` has the same shape as level 1's. Its keys start with `g2-` (`g2-light-ready`, `g2-find-glowers`, …), and its prompts are the texts of the `g2_*` lines in Tasks 4–6.
    - A task's `find` prompt reads 'Finnum vin sem getur …' (lýst / stangað / náð hátt / flogið).
    - Until Task 4 only the search keys are reachable.
- `GIFT_ITEMS` gets four new items, exact copy:
  - `ammonite`: name 'Snigilsteinn', seek 'Snigilsteinn! Hvar er hinn?', caption 'Snigilsteinn! Hann fer í körfuna.'
  - `trilobite`: 'Pöddusteinn', 'Pöddusteinn! Hvar er hinn?', 'Pöddusteinn! Hann fer í körfuna.'
  - `fern`: 'Laufsteinn', 'Laufsteinn! Hvar er hinn?', 'Laufsteinn! Hann fer í körfuna.'
  - `footprint`: 'Risaspor', 'Risaspor! Hvar er hitt?', 'Risaspor! Það fer í körfuna.'
  - Their voice lines are `gift_ammonite`, `gift_trilobite`, `gift_fern` and `gift_footprint`.
  - The world builds models only for `level.gifts`.
- The picker and the lock:
  - `#welcome` shows one card per level. A locked card shows a padlock and "Kláraðu Berjalundinn fyrst" and cannot be started.
  - The cards get `data-level` and `aria-disabled`.
  - Level 1's `won` calls `unlockLevel('steinagljufur')`.
  - `?bord=2` starts level 2.
- `memory-playthrough.mjs --level 1|2` adds `?bord=N`. Its `RIGHT`, `WRONG`, target and step tables come from the level description.

- [ ] **Step 1: Write the failing tests** in `memory-rules.test.mjs`:
  - `the lock survives a throwing storage`: storage whose `getItem`/`setItem` throw. `unlockedLevels` returns `{'berjalundur'}`, `unlockLevel` returns false, and `chooseLevel(new URLSearchParams('bord=2'), storage).level.id === 'steinagljufur'`.
  - `unlocking is remembered`: an in-memory storage.
  - `level 2 deals 16 cards with four fossil pairs`.
- [ ] **Step 2: Run them and see them fail.** Then implement the level, the picker, the gifts table and the lock.
- [ ] **Step 3: Build the gorge glade.**
  - The ground, the cliff walls and the boulders from the approved assets.
  - 16 leaves in 4 × 4.
  - Four nests, Mosi's spot and the search view, refit at all three sizes.
  - The tunnel mouth stands at the glade edge. Its target is not playable yet: the story stops at `find-friends` after the leaves.
- [ ] **Step 4: Record the new lines.**
  - `g2_welcome` 'Velkomin í Steinagljúfrið! Finndu tvo eins vini.'
  - `g2_left` 'Finnum fyrst það sem er eftir undir laufunum!'
  - `gifts4` 'Þú fannst alla fjóra steingervingana!'
  - The four `gift_*` lines above.
  - Run dry-run, then generate, then the scribe check.
- [ ] **Step 5: Run the tests.** `npm run test:memory`: every test passes.
- [ ] **Step 6: Playthroughs.** Run `--level 2 --mode glade` at the three sizes:
  - `report.leafTargets` shows 16 buttons, each ≥44 px.
  - Every leaf, Mosi and the nests are inside the frame.
  - The worst framing is within budget.
  - Level 1 still matches its baseline in one full run.
- [ ] **Step 7: Commit and stop.** Show the owner the picker (locked and open), the glade at three sizes, a fossil pair flying, and the first lines.

### Task 4: The tunnel (Kambeðlur light) and the rockfall (Þríhyrnur headbutt)

**Files:**
- Create: `levels/steinagljufur/scenes/light.js` and `headbutt.js`
- Modify: `levels/steinagljufur/world.js` and `props.js`, `gestures.js`, `audio.js`, `voice-lines.js`, `minnisspil.css` (the badges) and `memory-playthrough.mjs`

**Interfaces:**
- Produces two scenes in the scene-runner line format of `scenes.js`:
  - `lightScene(stage, { taps = 3, timeout = 4 })`: three tap steps raise the stegosaurus plates' emissive glow. Each tap sparkles the crystals (fx `stars`). It emits `light-step` and `tunnel-lit`.
  - `headbuttScene(stage, { taps = 3, timeout = 4 })`: three taps in rhythm with `beatWords`. Each tap is a charge and a hit (fx `shake`). The pile falls into steps. It emits `rocks-hit` and `rocks-fall`.
- Wrong friends, through `startFail(species, target)`, using moves from `gestures.js`; add `peck`, `wobble` and `slide` if they are missing:

  | Target | Wrong friend | What happens |
  |---|---|---|
  | `tunnel` | triceratops | Walks into the dark, "dúnk!", backs out with stars |
  | `tunnel` | brontosaurus | Bonks her head on the low roof |
  | `tunnel` | pteranodon | Flies in and tumbles back out shaking her head |
  | `rocks` | stegosaurus | Swishes her tail and a pebble lands on her head |
  | `rocks` | brontosaurus | Nudges with her nose; nothing moves; shrugs |
  | `rocks` | pteranodon | Pecks a stone, "tikk"; nothing happens |

- Lines and prompts:
  - `g2_light_ready` 'Göngin eru dimm. Hver getur lýst þau upp?'
  - `g2_lit` 'Plöturnar lýsa eins og ljósker!'
  - `g2_rocks_ready` 'Grjót lokar göngunum. Hver getur stangað það burt?'
  - `g2_rocks_done` 'Búmm! Leiðin er opin!'

- [ ] **Step 1: Write the failing tests** in `memory-bridge-rules.test.mjs`:
  - `level 2 opens light, then headbutt; a wrong friend fails and the right one starts`, using `createStepRules(STEINAGLJUFUR)`.
  - `the stegosaurus pair holds the light until through`.
  - Run them and see them fail; then implement.
- [ ] **Step 2: Build the scenes, the props, the fails and the sounds.** The sounds are the approved samples. Record the four lines.
- [ ] **Step 3: Run the tests and the playthroughs.**
  - `npm run test:memory`.
  - `--level 2` at 1280×800 with `--video`, which plays to `rocks-fall`.
  - One wrong friend for each target, in the `--mode full` order.
  - Pause and restart while the tunnel glows.
- [ ] **Step 4: Commit and stop.** Show the owner stills and a video of both tasks and two wrong friends.

### Task 5: Through the tunnel, the ledge (Þórseðlur reach) and the cliff (Flugeðlur fly)

**Files:**
- Create: `scenes/through.js`, `reach.js`, `fly.js` and `climb.js`, and `levels/steinagljufur/rope.js`
- Modify: the level world, `gestures.js`, `audio.js`, `voice-lines.js` and the playthrough

**Interfaces:**
- **`through`.** It waits for every friend and gift pair, played in the search view, like level 1's gift wait:
  - Mosi says `g2_left` once as the wait begins.
  - After 5 s the gold arrow points at a shut leaf.
  - The walk through the lit tunnel takes ≤10 s.
- **`reachScene(stage, { taps = 3, timeout = 4 })`:** the slab lowers in three steps into a ramp.
- **`flyScene(stage, { taps = 3, timeout = 4 })`:**
  - Each tap is one wingbeat of the two flugeðlur carrying the rope end (`carry` + `fly`).
  - At the top they wrap it round the tree.
  - It emits `rope-tied`.
- **`climbScene`:** everyone walks up the steep path with the rope as a handrail. Nobody climbs the rope.
- **`createRope(stage, { from, to, sag })`:** a bent tube along a curve, with the approved rope texture. It has `hang()`, `tighten(t)` and `swing(t)`.
- **Wrong friends:**

  | Target | Wrong friend | What happens |
  |---|---|---|
  | `ledge` | triceratops | Hops and cannot reach |
  | `ledge` | stegosaurus | Rears up and wobbles |
  | `ledge` | pteranodon | Flies up; the slab is too heavy; she dangles and drops back |
  | `cliff` | brontosaurus | Throws the rope up; it falls on her head |
  | `cliff` | triceratops | Hops with the rope and tumbles |
  | `cliff` | stegosaurus | Tries the path, slides back |

- **Lines:**
  - `g2_through` 'Göngin eru opin. Allir með!'
  - `g2_ledge_ready` 'Stallurinn er of hár. Hver nær hátt?'
  - `g2_reached` 'Langir hálsar ná hátt!'
  - `g2_cliff_ready` 'Klettaveggurinn er brattur. Hver getur flogið með reipið upp?'
  - `g2_flown` 'Flugeðlurnar fljúga upp!'
  - `g2_climb` 'Haldið í reipið. Upp með ykkur!'

- [ ] **Step 1: Write the failing test.** Add `through waits for every pair and every gift` to `memory-bridge-rules.test.mjs`, then implement.
- [ ] **Step 2: Build the scenes, the rope, the fails and the sounds.** Record the six lines.
- [ ] **Step 3: Run the tests and the playthroughs.**
  - `npm run test:memory`.
  - `--level 2 --video` at 1280×800, then `--level 2 --gifts-last` at 390×844. No shut leaf may go off screen and nothing may get stuck.
  - Restart while the rope is in flight: the rope and the flugeðlur must reset.
- [ ] **Step 4: Commit and stop.** Show the owner.

### Task 6: Everyone pulls, the trunk falls, the walk to Sólarsyllan

**Files:**
- Create: `scenes/pull.js` and `ledge.js`
- Modify: the level world, `props.js` (the owner's trunk), `audio.js`, `voice-lines.js` and the playthrough (`--restart-at pull`)

**Interfaces:**
- **`pull`, a together step.** A tap on `trunk` starts it at once; there are no bubbles.
  - The flugeðlur fly the second rope to the top of the trunk.
  - All 8 babies and Mosi line up on the rope.
  - `pullScene(stage, { taps = 3, timeout = 4 })` beats `['Einn!','Tveir!','TOGA!']`. On each tap everyone leans back, and the trunk tilts in three steps.
  - On the third tap it falls across the gap with a thud, dust and shake.
  - It emits `trunk-fall`.
- **`walk`:** the group crosses the trunk to Sólarsyllan in ≤10 s.
- **Lines:**
  - `g2_pull_ready` 'Togum öll saman í reipið!'
  - `g2_bridge` 'Brúin er komin. Á Sólarsylluna!'

- [ ] **Step 1: Write the failing test.** Add `a together step starts without bubbles and every friend joins` to `memory-bridge-rules.test.mjs`, then implement.
- [ ] **Step 2: Build the scenes and the sounds.** Record the two lines.
- [ ] **Step 3: Run the tests and the playthroughs.**
  - `npm run test:memory`.
  - A full `--level 2 --video` at 1280×800.
  - `--restart-at pull`: the trunk upright, the rope gone, the basket "0 / 4".
  - The worst framing within budget, with 9 characters on the rope.
- [ ] **Step 4: Commit and stop.** Show the owner.

### Task 7: The light, the celebration, the voices and the whole round

**Files:**
- Create: `levels/steinagljufur/scenes/celebrate.js`
- Modify:
  - `remake/engine/looks.js`, additive: `gorgeAfternoon`, `gorgeGolden`, `gorgeSunset` and `gorgeEvening`
  - the level world (the look blend between stages, the stars as an fx point field)
  - `game.js` and `minnisspil.html`: the level-2 ending buttons "Spila aftur" and "Berjalundurinn", and level 1's "Steinagljúfrið →" when level 2 is open
  - `voice-lines.js`, `audio.js`, `README.md` and the playthrough (`timelineCheck` for level 2)

**Interfaces:**
- The look blends one stage further after each done step: afternoon → golden → sunset at `walk` → evening at the celebration.
- **The celebration:**
  - The sun sets and the stars come out one by one.
  - Each pair does its trick, and the flugeðlur glide in a circle.
  - The four fossils glow in a row on the ledge.
  - Mosi says `g2_won`, then `gifts4`.
- **The ending card:**
  - eyebrow 'ÁTTA VINIR · EITT GLJÚFUR'
  - title 'Öll komumst við upp!'
  - copy 'Þið lýstuð, stönguðuð, náðuð hátt, fluguð og toguðuð saman. Nú horfa allir á stjörnurnar.'
  - The credits list every open model and sample of level 2.
- **Line:** `g2_won` 'Allir átta komnir upp á Sólarsylluna! Sjáið stjörnurnar!'

- [ ] **Step 1: Build.** Build the looks, the blend, the stars, the celebration, the ending card and the unlock button. Record `g2_won`.
- [ ] **Step 2: Run the tests.** `npm run test:memory`.
- [ ] **Step 3: Playthroughs, one at a time.**
  - Level 2:
    - full `--video` at the three sizes
    - `--mode rapid`
    - `--gifts-last` at 390×844
    - `--restart-at gift`
    - `--cpu-throttle 4` at 1280×800
  - Level 1: one full run compared with the baseline.
  - For every run, report: finished, errors, stuck, round seconds, longest watch, worst framing and the ending resolution scale.
- [ ] **Step 4: Update the README and commit.** Show the owner the whole round's video, the stills and every new voice line for listening.
- [ ] **Step 5: Final review.** The whole-branch review runs on the most capable model before any merge, when the owner says so.
