# Hvar er vinur minn? — Living Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Yfirlit fyrir eigandann:** tíu bútar (0–9). Bútur 9 (bætt við 30. okt.) eru tólf lauf, gjafapör
> (snjáldurmús, kuðungakrabbi, krabbi) og að leiknum lýkur fyrst þegar öll laufin eru fundin. Bútur 0 setur greinina á
> núverandi main og býr til tólið sem tekur myndir og myndbönd. Bútur 1 lífgar
> fyrstu mínútuna með handritum og skotum. Bútur 2 eru ungarnir (þú samþykkir
> fyrst). Bútar 3–6 eru rjóðrið, fyrsta þrautin, brúin og mýrin. Bútur 7 er ljós
> og heimur, bútur 8 hátíðin og síðustu hljóðin. Eftir hvern bút færðu myndir og
> myndband og segir til áður en sá næsti byrjar.

**Goal:** Make board 1 of the memory game alive and Pikmin-like: still camera while searching, scripted shots and cuts in tasks, friends that react, a child who picks who solves each obstacle and helps with taps.

**Architecture:** A small scene runner plays short scripts (timed lines: shot, act, fx, sound, say, wait-for-tap) on the game clock. The camera director gains shots that override the existing cues; a shared gesture library animates babies and Mosi. Rules gain surprises and choose-by-obstacle. Existing walking, footing, navigation and the bridge's physical actions are kept and called from scripts.

**Tech Stack:** three.js (vendored in `dist/vendor/`), plain ES modules, node:test with `remake/tests/setup.mjs`, headless Edge over CDP for captures, ffmpeg (on PATH) for video, ElevenLabs via the repo's own tools.

**Spec:** `docs/superpowers/specs/2026-10-28-hvar-er-vinur-minn-lifandi-design.md`. Assessment with captures: https://claude.ai/artifact/JECq2qz2kDFMbkcUTe7zxS (source in the shared notes folder `minnisspil-mat/`).

## Global Constraints

- Never touch `design/` or `dist/`.
- Work on branch `codex/minnisspil-first-playable` in `C:/Risaeðla/dino-minnisspil`. Commit after each meaningful step (WIP commits fine). Push and merge only on the owner's word.
- Keep each file's line endings (`.gitattributes * -text`). The memory files are LF; new files in `remake/engine/memory/`, `remake/tools/`, `remake/tests/`, `docs/` are LF.
- No bare `git stash`.
- Ask the owner before downloading anything (name, source, size).
- No Claude-drawn or Claude-modelled art (no SVG drawings, no Blender modelling). New visuals come from existing models, textures, particles and light, from models computed out of existing ones (the baby bake, approved), from renders of existing models, or from the owner.
- Budget (`remake/STYLE.md`): ≤100 draw calls and ≤250k triangles in tablet quality, 30 fps on a mid Android tablet, ≤6 ms GPU. A laptop measurement is not a tablet measurement.
- ElevenLabs key only from `ELEVENLABS_API_KEY` in the environment; never print it. Mosi lines use the approved voice, `eleven_v4`, speed .95 (the tool enforces this). Read the memory note `icelandic-voice-pronunciation` before writing new lines.
- Child-facing text is Icelandic. HUD text at least 14 px at 1280 × 800.
- Pause and a hidden tab freeze the game clock, scripts, camera and sound. "Byrja upp á nýtt" cancels every script, bubble and wait.
- Spec timings: tap-along timeout 4 s; each journey ≤10 s; no watching stretch longer than ~8 s without a cut or a tap; leaf push-in 5–8 % for ~0.5 s; cuts every 1–3 s inside tasks; never cut while the child chooses.
- Lean tests (owner's rule): only the three small test files this plan names, plus updates to existing tests a task breaks on purpose. Run `npm run test:memory` once per task. Never run the root `npm test`.
- Save as you go and check in: builders commit often, append a progress note to their report, and send one-line check-ins to the controller at each milestone.
- Review server: `minnisspil` in `C:/Risaeðla/.claude/launch.json`, port 4221. The playthrough tool starts its own server.

## Review Focus

1. Taps during a cut, a glide or a running script (double taps, tapping a leaf while the "who" bubbles are open) → ignored, nothing gets stuck. Pinned in Task 4's choose test and Task 0's playthrough (rapid-tap pass).
2. Pause or hidden tab in the middle of a tap-along wait or a failed attempt → the 4 s timeout is frozen and resumes; restart cancels all. Pinned in Task 1's scene-runner test.
3. A surprise leaf picked second while one leaf is open → the first stays open, no mismatch, the pair can still be found. Pinned in Task 3's surprise test.
4. Asking an obstacle with no found pair, or when the only found pair is busy (bronto holding the branch) → Mosi's hint, never an empty bubble row. Pinned in Task 4's choose test.
5. Round ends with 0, 1 or 2 surprises found → the ending names the right number (or none). Pinned in Task 8's playthrough modes.

## File Structure

| File | Responsibility |
|---|---|
| `remake/engine/memory/scenes.js` (new) | Scene runner: plays line lists on the game clock, waits for taps with timeouts |
| `remake/engine/memory/scenes/*.js` (new) | One script builder per moment: `first-minute.js`, `branch.js`, `roll.js`, `cross.js`, `lay.js`, `finish.js`, `celebrate.js` |
| `remake/engine/memory/gestures.js` (new) | Named procedural gestures for any rig with the shared bone names |
| `remake/engine/memory/mosi-puppet.js` (new) | Applies gestures to Mosi's bones without changing `engine/actor.js` |
| `remake/engine/memory/idle-play.js` (new, Task 8) | Picks one idle game at a time for waiting friends |
| `remake/engine/memory/camera-director.js` | Adds shots (`shot`, `release`, `shake`, `nudge`) over the existing cues |
| `remake/engine/memory/baby-actors.js` | `gesture(name)` through `GESTURES`; baby art for bronto and stego (Task 2) |
| `remake/engine/memory/rules.js` | Surprise cards |
| `remake/engine/memory/bridge-rules.js` | Choose-by-obstacle, failed attempts, no `lower` |
| `remake/engine/memory/bridge-adventure.js` | Beat waits inside lift/roll/lay, `startFail`, faster journeys led by Mosi, next-obstacle glow |
| `remake/engine/memory/world.js`, `world-props.js`, `world-fx.js` | 8-leaf glade, group spots by Mosi, leaf juice and fixes, new fx kinds, lighting and density |
| `remake/engine/memory/game.js`, `playful-flow.js`, `remake/minnisspil.html`, `remake/minnisspil.css` | Bubbles, beat words, basket, hints; gold button removed |
| `remake/engine/memory/voice-lines.js`, `remake/assets/audio/memory/soundscape/catalog.json` | New lines and sound jobs |
| `scripts/memory-baby-bake.mjs` | `--species` for brontosaurus and stegosaurus |
| `remake/tools/memory-playthrough.mjs` (new) | Headless full round: frames, mp4, report (errors, draw calls, triangles) |

---

### Task 0: Current main and the playthrough tool

**Files:**
- Modify: `package.json` (merge only)
- Create: `remake/tools/memory-playthrough.mjs`

**Interfaces:**
- Produces: `node remake/tools/memory-playthrough.mjs --out <dir> [--size 1280x800] [--mode full|first-minute|rapid] [--reduced-motion] [--video]`, which writes `<dir>/*.png`, `<dir>/frames/`, `<dir>/round.mp4` (with `--video`) and `<dir>/report.json` (`{ errors, steps, timeline, perf, render: { drawCalls, triangles } }`). It drives the game through `window.__memory` and the DOM buttons. Later tasks extend both when the flow changes.

- [ ] **Step 1:** Ask the owner for the go-ahead to merge, then run `git merge --no-ff main` (main is `701d891` at the time of writing). Resolve `package.json` by keeping both sides' scripts. Do not rebase.
- [ ] **Step 2:** Build `memory-playthrough.mjs` from `C:/Users/fannare/AppData/Roaming/Claude/side-session-notes/local_5af6e842-d0c9-4f2a-92fb-56f234adc53d/minnisspil-mat/play.mjs`. Give it its own static server like `capture.mjs` (`startServer`), screencast frames via CDP `Page.startScreencast` to `frames/`, and `ffmpeg -framerate 15 -i frames/%05d.jpg -pix_fmt yuv420p round.mp4`. `--mode rapid` taps every enabled target three times in a row at each step.
- [ ] **Step 3:** Run `npm run test:memory` and `node remake/tools/memory-playthrough.mjs --out qa/memory/lifandi/t0 --video`. Expected: the round finishes, `report.errors` is empty. Record any test that already fails in the report as the baseline.
- [ ] **Step 4:** Commit `merge main` and `memory-playthrough.mjs` separately.
- [ ] **Owner checkpoint:** "Leikurinn keyrir eins og áður á nýjum grunni" with `t0/round.mp4`.

### Task 1: Scene runner, shots, gestures, the first minute

**Files:**
- Create: `remake/engine/memory/scenes.js`, `remake/engine/memory/scenes/first-minute.js`, `remake/engine/memory/gestures.js`, `remake/engine/memory/mosi-puppet.js`
- Modify: `camera-director.js`, `baby-actors.js` (gesture block in `update`, ~lines 252–280), `world.js` (`gladeCue`, `reveal`, `conceal`, `match`, `update`), `game.js` (restart, pause)
- Test: `remake/tests/memory-scenes.test.mjs`

**Interfaces:**
- Produces:
  - `createSceneRunner({ perform })` → `{ play(lines, { onDone } = {}) → number, update(dt), tap(target) → boolean, waiting() → { target, count, left } | null, cancelAll(), busy() → boolean }`. A line is `{ at, shot?, act?, fx?, sound?, say?, wait? }`. `perform(line)` runs every key except `wait`. `wait = { tap: string, count: number, timeout: number, onTap?(i), onTimeout?() }` stops that script's clock until `count` taps or `timeout` seconds have passed. `dt <= 0` changes nothing.
  - `cameraDirector.shot({ kind: 'wide'|'face'|'hero'|'follow'|'shoulder', subjects: () => THREE.Vector3[], cut = true, duration = 1.05 })`, `cameraDirector.release()`, `cameraDirector.shake(strength = .12, seconds = .35)`, `cameraDirector.nudge(point, amount = .06, seconds = .5)`. A shot overrides the cue until `release()`. `follow` re-solves every frame. In reduced motion every glide becomes a cut and `shake` does nothing. `isInteractive()` stays false while a shot is active.
  - `GESTURES` is a `Record<string, { duration, apply(rig, t, energy) }>`, where `rig = { pose, head, jaw, body, shoulders, tail, legs, lids, rotateInRoot, offsetInRoot }`. `actor.gesture(name) → boolean`. Task 1 names: `peek`, `wonder`, `oops`, `hop`, `nuzzle`, `cheer`. Existing `reveal`, `greet`, `mismatch`, `nuzzle` and `delight` route to these.
  - `createMosiPuppet(mosi) → { gesture(name), update(dt) }`, with names `laugh`, `clap`, `shake-head`, `cheer`. Mosi shares the bone names (`Head`, `Jaw`, `Body`, `Shoulders`, `Tail1`, `FrontLeg.L`…).
  - `world.runScene(lines, opts)` and `world.tapScene(target)`, so `game.js` never reaches the runner directly.

- [ ] **Step 1: Write the failing test** `memory-scenes.test.mjs`:
  - `lines fire in order at their times`: lines at 0, .5, 1.0 with `update(.4)` and `update(.2)` → perform called for lines 0 and .5 only.
  - `wait holds until count taps`: `wait { tap: 'log', count: 3, timeout: 4 }` then a line at +.1. Three `tap('log')` calls and `update(.1)` → the next line fires; `tap('branch')` returns false.
  - `wait times out after 4 s of game time`: `update(3.9)` → still waiting; `update(.2)` → `onTimeout` called once, script continues.
  - `paused frames change nothing`: `update(0)` and `update(-1)` leave `waiting().left` unchanged.
  - `cancelAll stops every script`: after `cancelAll()`, `busy()` is false and no further lines fire.
- [ ] **Step 2:** Run `npm run test:memory -- --test-name-pattern=scene`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `scenes.js`, then run the test again. Expected: PASS.
- [ ] **Step 4: Glade view.** Make `gladeCue` lower and more from the side, toward the approved mock (`qa/memory/large-board/approved-mock.png`). Each baby's height on screen at 1280 × 800 must be at least 80 px (it was 40–70). Every leaf and Mosi must be inside the frame at 1280 × 800, 820 × 1180 and 390 × 844, and the bottom third must not be empty in portrait. Measure with the playthrough tool.
- [ ] **Step 5:** Implement the shots in `camera-director.js` and the gestures in `gestures.js`, `baby-actors.js` and `mosi-puppet.js`. Gestures must read at game size: whole-body motion (hop, head shake, run), not the old .06–.2 rad head tilts. Scale amplitudes by `energy` (.3 in reduced motion).
- [ ] **Step 6:** Write the scripts in `scenes/first-minute.js`:
  - **Reveal:** nudge, `peek`, a look at the camera, the species call, and Mosi looks.
  - **While one leaf is open:** `wonder`.
  - **Mismatch:** both play `oops`, Mosi plays `shake-head`.
  - **Match:** the spec's example timeline (face cut → run together → nuzzle and glitter → wide cut → hop to the home spot → Mosi `laugh`/`clap` → glide back to the glade). World input stays off while it runs.
  - Hook them into `world.reveal`, `world.conceal` and `world.match`.
- [ ] **Step 7:** Run the playthrough tool with `--mode first-minute --video` at 1280 × 800 and 820 × 1180, then run `npm run test:memory`. Update or remove tests this task broke on purpose and list them in the report. Commit.
- [ ] **Owner checkpoint:** the first-minute video, a frame per moment, and the baby size before and after.

### Task 2: Baby brontosaurus and stegosaurus

**Files:**
- Modify: `scripts/memory-baby-bake.mjs`, `scripts/memory-art-check.mjs`, `remake/assets/memory/roster.json`, `baby-actors.js` (`MEMORY_CHARACTER_ART`)
- Create: `remake/assets/memory/brontosaurus-baby.glb`, `stegosaurus-baby.glb` and their `-source.json`; `remake/assets/memory/portraits/{triceratops,brontosaurus,stegosaurus}.webp`

**Interfaces:**
- Produces: `node scripts/memory-baby-bake.mjs --species triceratops|brontosaurus|stegosaurus` (the default stays triceratops, so the existing output is unchanged). Produces the portraits Task 4's bubbles use.

- [ ] **Step 1:** Add a per-species anatomical map from `remake/assets/characters/{brontosaurus,stegosaurus}.glb`. Keep the UVs, textures, skin weights and every clip (`kink`, `eat`, `happy`, `liftUp`, `lowerHead`). Starting values, which the owner judges:
  - head ×1.4, larger eye region, legs ×0.75, torso ×0.85, tail ×0.8;
  - bronto neck ×0.85 (it must still reach the branch);
  - stego plates ×0.8.
- [ ] **Step 2:** Bake both, then run `node scripts/memory-art-check.mjs` (front, side, three-quarter, walk, blink). Expected: no surface folds reported, no browser errors.
- [ ] **Step 3:** Owner checkpoint first: send the art-check captures next to the triceratops baby. Switch `MEMORY_CHARACTER_ART` only after the owner approves.
- [ ] **Step 4:** Render the three portraits from the baby GLBs with `remake/tools/bake/book-render.html` (from main). Check the branch support point and the bark carry point against the new bodies in one playthrough.
- [ ] **Step 5:** Run `npm run test:memory` and the playthrough. Commit.

### Task 3: Eight leaves, surprises, basket, leaf juice

**Files:**
- Modify: `rules.js`, `world.js` (`CELLS`, `NESTS`, the instanced leaf count `6` → `8`, cell update ~lines 355–370), `world-props.js`, `world-fx.js`, `scenes/first-minute.js`, `game.js`, `minnisspil.html`, `minnisspil.css`, `audio.js`, `soundscape/catalog.json`
- Test: `remake/tests/memory-surprises.test.mjs`

**Interfaces:**
- Produces: `createMemoryGame({ random, species, surprises = ['berries', 'frog'] })`. A surprise card is `{ id, species: null, item, status }`. `pick(surprise)` emits `{ type: 'surprise', ids: [id], item }`, sets status `'found'`, and leaves `phase` and `selected` unchanged. `getState().found` is a frozen list of items. `won` still means all pairs matched. `world.reveal` handles surprise cards. The fx kinds `'poof'`, `'stars'` and `'splash'` are added.

- [ ] **Step 1: Write the failing test** `memory-surprises.test.mjs`:
  - `deck has 8 cards: 3 pairs and 2 surprises`.
  - `a surprise picked first is found and the phase stays ready`.
  - `a surprise picked second keeps the first leaf open`: pick a pair card, `advance(.45)`, pick the surprise → phase `one-open`, `selected` has one card, and the first card's twin then matches (Review Focus 3).
  - `found surprises cannot be picked again`.
  - `won ignores unfound surprises`.
- [ ] **Step 2:** Run it. Expected: FAIL. Implement it in `rules.js`, then run again. Expected: PASS. Update `memory-rules.test.mjs` from 6 cards to the new deck.
- [ ] **Step 3: Glade layout.**
  - 4 × 2 leaf grid.
  - Mosi stands at the head of the path between the glade and the river.
  - The three home spots (`NESTS`) become group spots around Mosi.
  - Re-fit `gladeCue` so all 8 leaves, Mosi and the group are visible at the three sizes.
- [ ] **Step 4: Leaf juice and fixes.**
  - A tap squashes and bounces the leaf with `poof`.
  - Opening swings the leaf down to lie on the ground beside the cell, not as a floating disc.
  - Remove the magenta-red mark at each leaf's centre and the leaf-debris rings left after matches.
  - A surprise pops up with `stars`, flies to the basket in the ribbon with a "ding", and the basket counts.
  - A mismatch closes with a bounce and "bonk".
  - A match adds glitter and `stars`. Its chord rises with each pair; `audio.match(species, nestIndex)` already gets the index, so make the rise easy to hear.
  - HUD buttons squash on press. Raise HUD label sizes to ≥14 px.
- [ ] **Step 5: Surprise items.**
  - Berries: the grove's berry geometry.
  - Frog: the owner's model at `remake/assets/memory/frog.glb`. If it has not arrived, use `remake/assets/critters/butterfly.glb` from main and tell the owner.
- [ ] **Step 6: New sounds.** Add catalog jobs `poof`, `bonk` and `ding` (short, soft, child-friendly, the style of the existing jobs). Run `node remake/tools/memory-sound-design.mjs --generate`, then `--master`, then `--audit`. Expected: the audit passes. Map them in `audio.js`.
- [ ] **Step 7:** Run the playthrough (`--video`, 1280 × 800 and 390 × 844) and `npm run test:memory`. Commit.
- [ ] **Owner checkpoint:** the new glade, a surprise found, a mismatch, and the sounds to listen to.

### Task 4: "Hver getur þetta?", funny failures, the branch with taps

**Files:**
- Modify: `bridge-rules.js`, `bridge-adventure.js`, `playful-flow.js`, `game.js`, `minnisspil.html`, `minnisspil.css`, `gestures.js`, `world.js`, `voice-lines.js`
- Create: `scenes/branch.js`
- Test: `remake/tests/memory-choose.test.mjs`

**Interfaces:**
- Consumes: the scene runner and shots (Task 1), portraits (Task 2), group spots (Task 3).
- Produces:
  - `bridge.next() → 'branch'|'log'|'bark'|null` and `bridge.ask(target) → { kind: 'choose', candidates: string[] } | { kind: 'not-yet' } | { kind: 'find-first' }`. Candidates are the unlocked species that are not busy; brontos holding the branch are busy.
  - `bridge.pick(species) → { kind: 'start', action } | { kind: 'fail' }` and `bridge.failDone()`. `lower` is removed from `BRIDGE_ACTIONS`. The right pairs are branch → brontosaurus (`lift`), log → triceratops (`roll`) and bark → stegosaurus (`lay`).
  - `adventure.start(id, { beats })` emits `{ type: 'beat-wait', id, index }` and holds until `adventure.beat()`. Scripts call `adventure.beat()` from `wait.onTap` and call the remaining beats from `wait.onTimeout`. `adventure.startFail(species, target)` emits `fail-done`. The next obstacle sways and glows.
  - New gestures: `eager`, `fail-triceratops` (hops, misses, lands on its bottom), `fail-stegosaurus` (plates stuck, rolls onto its side), `fail-brontosaurus` (dizzy, stars), `strain`.
  - `window.__memory.ask(target)`, `.choose(species)`, `.tap(target)` for the playthrough tool.

- [ ] **Step 1: Write the failing test** `memory-choose.test.mjs`:
  - `next is branch, then log while the branch is held, then bark at staging`.
  - `ask with no found pair says find-first` (Review Focus 4).
  - `ask on a not-yet obstacle says not-yet`.
  - `a busy pair is not a candidate`: with brontos holding, `ask('log')` candidates exclude `brontosaurus`. With only brontos found, the result is `find-first`, never an empty `choose` (Review Focus 4).
  - `wrong pick fails, then failDone returns to choosing`.
  - `right pick starts the action; picks during an action are ignored` (Review Focus 1).
- [ ] **Step 2:** Run it. Expected: FAIL. Implement it in `bridge-rules.js`, then run again. Expected: PASS. Update `memory-bridge-rules.test.mjs` and `memory-playful-flow.test.mjs` for the removed `lower` and the removed gold button, and list those changes in the report.
- [ ] **Step 3: Remove the gold button.** Remove `#next-action` and the automatic story button. Mosi's bubble keeps the hints, and the gold arrow (`is-guided`) points at the next obstacle after ~5 s of no input.
- [ ] **Step 4: Bubbles.**
  - Tapping the glowing obstacle opens `#who` bubbles (portraits, ≥64 px on a tablet, ≥44 px on a phone) over the obstacle, with the camera holding a still shot.
  - The bubbles pop in and squash on press.
  - The group plays `eager`.
  - A wrong pick runs `startFail` → that species' fail gesture → Mosi `laugh` and "Kannski einhver annar?" → back to the group.
- [ ] **Step 5: The branch.** `scenes/branch.js`:
  - Wide shot to establish.
  - The brontos walk there (cuts every 1–3 s).
  - Still hero shot with `wait { tap: 'branch', count: 3, timeout: 4 }`. Each tap lifts the branch a third, with `strain`, dust, falling leaves and big words "Upp!".
  - On timeout, "Við gerum þetta saman!" and the brontos finish on their own.
  - Then `cheer`. The branch stays up until the bridge exists.
- [ ] **Step 6: Record lines.** Add `who` ("Hver getur þetta?"), `other` ("Kannski einhver annar?"), `together` ("Við gerum þetta saman!"), `push` ("Einn, tveir, ÝTA!"), `findFirst` ("Finnum vini fyrst!") and `notYet` ("Fyrst þurfum við að lyfta greininni!") to `voice-lines.js` with new seeds. Then run:
  - `node remake/tools/memory-voices.mjs --only who,other,together,push,findFirst,notYet --dry-run`
  - the same command without `--dry-run`
  - `--verify`
- [ ] **Step 7:** Run the playthrough (`full` until the branch, `rapid`, `--video`) and `npm run test:memory`. Commit.
- [ ] **Owner checkpoint:** the first puzzle from tap to lifted branch, one wrong pick, and the new lines to listen to.

### Task 5: The log with "Einn, tveir, ÝTA!" and the bridge crossing

**Files:**
- Modify: `bridge-adventure.js`, `world.js`, `world-fx.js`, `camera-director.js` (if `follow` needs tuning)
- Create: `scenes/roll.js`, `scenes/cross.js`

- [ ] **Step 1:** `scenes/roll.js`:
  - Triceratops approach.
  - Still shot with `wait { tap: 'log', count: 3, timeout: 4 }`. Taps are on the beat of the spoken "Einn, tveir, ÝTA!" (line `push`), with the big words "Einn! Tveir! ÝTA!". Each tap is a third of the roll with `strain` and dust. On timeout the friends finish with "Við gerum þetta saman!", as on the branch.
  - The landing gets `splash`, `shake(.12, .35)` and the existing `bridge-land` sound.
  - Low hero shot, then a face cut to `cheer`.
  - The branch then lowers itself and the brontos rejoin the group.
- [ ] **Step 2:** `scenes/cross.js`, which starts when the bridge exists and all six are found:
  - Mosi leads the six across in a spaced group.
  - Follow shot with a cut to a shoulder shot from behind Mosi at mid-bridge.
  - Arrival takes ≤10 s from first step to arrival.
  - Mosi stays visible at staging.
- [ ] **Step 3:** Run the playthrough (`--video`), then check the `timeline` in `report.json`: the crossing is ≤10 s and no stretch over ~8 s has no cut or tap. Run `npm run test:memory`. Commit.
- [ ] **Owner checkpoint:** the bridge video.

### Task 6: The marsh and the walk to the grove

**Files:**
- Modify: `bridge-adventure.js`, `build-props.js`, `world-fx.js`
- Create: `scenes/lay.js`, `scenes/finish.js`

- [ ] **Step 1:** `scenes/lay.js`:
  - The stegos carry each of the three panels.
  - Before each panel is laid, a still shot with `wait { tap: 'bark', count: 1, timeout: 4 }`. The timeout works as on the branch.
  - Placement gets mud `splash` and a small `shake`.
  - Footsteps in mud and water emit `splash`; footsteps on the boardwalk use the wood sound.
  - Cuts between carry and place.
- [ ] **Step 2:** `scenes/finish.js`: Mosi leads all six to the grove, follow shot, ≤10 s.
- [ ] **Step 3:** Run the playthrough and the `timeline` check from Task 5 Step 3, then `npm run test:memory`. Commit.
- [ ] **Owner checkpoint:** the marsh video.

### Task 7: Light, colour, a denser world

**Files:**
- Modify: `world.js` (lighting, the ground shader values ~lines 168–176, `keepOut`), `world-living-forest.js`, `world-props.js`, `build-props.js`, `world-surface-fx.js`

- [ ] **Step 1: Light and colour.** Warmer morning light, deeper shadows, less haze, more saturated greens and earth, side by side with the approved mock.
- [ ] **Step 2: Denser world.**
  - Dense plants and trees at the edges hide the end of the world in the overview.
  - A dirt path joins the glade, the bridge, the marsh and the grove.
  - Ferns under the leaves, moss on the stones.
  - The marsh gets mud, reeds and puddles; the panels get wood texture (procedural bark exists).
  - The grove gets larger bushes and berries on the ground.
  - Keep the camera corridors clear (`keepOut`).
- [ ] **Step 3:** Run the playthrough at three sizes with `report.render` checked. Expected: ≤100 draw calls and ≤250k triangles at every sampled frame. Commit.
- [ ] **Owner checkpoint:** the glade, the overview and the marsh, each beside the mock.

### Task 8: Celebration, idle play, last sounds and lines

**Files:**
- Create: `scenes/celebrate.js`, `remake/engine/memory/idle-play.js`
- Modify: `gestures.js`, `world.js`, `game.js`, `minnisspil.html`, `voice-lines.js`, `soundscape/catalog.json`, `audio.js`, `remake/tools/memory-playthrough.mjs`

**Interfaces:**
- Produces: `createIdlePlay({ actors, random }) → { update(dt, { busy }) }`. While nothing else runs it starts one of `chase-butterfly`, `yawn`, `scratch`, `sniff` and `nudge-friend` for one waiting friend every 6–10 s, and never more than one at once. Each friend sometimes looks at the camera.

- [ ] **Step 1:** `scenes/celebrate.js`:
  - The friends eat berries (stego `eat` clip, procedural nibble for the others) and each pair does its trick: tricera `hop`, bronto `happy`, stego `happy`.
  - Mosi `cheer`, `stars`, face cuts, a final wide shot.
  - Then the ending card with the basket.
- [ ] **Step 2:** `idle-play.js` and its gestures; wire it in `world.update`.
- [ ] **Step 3: Record and generate.**
  - Lines `gifts1` ("Þú fannst eina óvænta gjöf!") and `gifts2` ("Þú fannst tvær óvæntar gjafir!"); no line when none was found (Review Focus 5). Same `memory-voices.mjs` sequence as Task 4.
  - Sound jobs `giggle` and `strain` through `memory-sound-design.mjs` `--generate`, `--master`, `--audit`.
- [ ] **Step 4:** Add a `--surprises 0|1|2` option to the playthrough so it finds that many. Run all three counts (Review Focus 5), plus a reduced-motion run at 390 × 844 (bubbles, beat words and the ending on screen, cuts rather than glides). Then run `npm run test:memory`.
- [ ] **Step 5: Final pass.**
  - Full playthrough with video at 1280 × 800, 820 × 1180 and 390 × 844.
  - A short update to `remake/engine/memory/README.md`.
  - Give the owner the list of old tests or tools that no longer apply (two-stone modules, clearance and convoy gates) and remove them only on his word. Commit.
- [ ] **Owner checkpoint:** a full round on video and the last sounds. A whole-branch review runs before any merge into main.

### Task 9: Twelve leaves, gift pairs, the round ends when all are found

The owner's word after playing Task 8 (2026-10-30): eight leaves is too easy; the gifts are new small animals, found as pairs
like the friends; the round ends only when all 12 leaves are found. He picked the three gifts and downloaded them himself:
snjáldurmús (shrew), kuðungakrabbi (hermit crab) and krabbi (fiddler crab). The game already has a frog, snail, beetle,
salamander, dragonfly, butterfly, fish, turtle and birds, so none of those is a gift.

**Files:**
- Modify: `rules.js`, `surprise-items.js` (becomes the gift table), `world.js` (`CELLS` 4 × 3, `gladeCue`, the leaf batch, reveal/celebration hooks), `game.js`, `minnisspil.html`, `minnisspil.css`, `scenes/celebrate.js`, `voice-lines.js`, `remake/tools/memory-playthrough.mjs`, `remake/engine/memory/README.md`
- Create: `remake/assets/memory/gifts/{shrew,hermit-crab,crab}.glb` and a `-source.json` beside each; `remake/tools/blender-gift.py`
- Test: update `remake/tests/memory-surprises.test.mjs` and `remake/tests/memory-rules.test.mjs` (no new test file)

**Interfaces:**
- Produces: `createMemoryGame({ random, species, gifts = ['shrew', 'hermitCrab', 'crab'] })`; the `surprises` option and the `surprise` event are gone.
  - A gift card is `{ id, species: null, item, status }`, with status `'hidden' | 'open' | 'found'`. Friend cards are unchanged.
  - Two leaves match when they hide the same friend or the same gift. `pick` emits `{ type: 'reveal', ids: [id], species, item }` for either kind (the other field is null). A gift pair emits `{ type: 'gift', ids, item, giftIndex }`, sets both to `'found'`, appends `item` to `getState().found`, and waits `MEMORY_TIMING.travel` like a match.
  - A gift and a friend, or two different gifts, are a mismatch and close as now.
  - `matchedPairs` counts friend pairs only (homes and the "x / 3 pör" dots stay as they are). `won` fires only when all friend pairs and all gift pairs are found.
- Produces: `GIFT_ITEMS` in `surprise-items.js`, one row per gift: `word`, `name`, `seek`, `caption`, `voice`, `make()`. `make()` returns `{ group, tilt, animate(seconds), dispose() }` as before.
  - `shrew` = Snjáldurmús, seek "Snjáldurmús! Hvar er hin?", caption "Snjáldurmús! Hún fer í körfuna."
  - `hermitCrab` = Kuðungakrabbi, seek "Kuðungakrabbi! Hvar er hinn?", caption "Kuðungakrabbi! Hann fer í körfuna."
  - `crab` = Krabbi, seek "Krabbi! Hvar er hinn?", caption "Krabbi! Hann fer í körfuna."
  - The crab plays its `Dance` clip while shown. The other two bob and turn gently, like the berries did.

- [ ] **Step 1: The gift models.** The owner's downloads are in `qa/memory/gjafir/src/` (git-ignored): `shrew.glb`, `little_hermit_crab.glb`, `dancing_crab_-_uca_mjoebergi.glb`. All three are CC BY 4.0; their `asset.extras` hold author, title and source.
  - Write `remake/tools/blender-gift.py` (Blender 5.2 headless: `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python …`). It imports a GLB, drops the meshes whose material is named on the command line, joins the rest into one mesh with one material, decimates to a triangle target, scales maps to 512 px WebP at quality 80, and exports a GLB with its animations. It keeps a skin and its clips.
  - Each gift is at most 4,000 triangles, one mesh and one material, 512 px maps, faces +X with its feet on y = 0, and a known size.
  - The crab: drop the `AOFLoor` floor, and convert the spec-gloss material (`KHR_materials_pbrSpecularGlossiness`, which three no longer reads) to metal-rough. Keep `Dance`.
  - The hermit crab: join its 13 parts.
  - The shrew: decimate from 37,652 triangles.
  - Run `remake/tools/quantize-glb.mjs` on the static two only, because three ignores the node scale quantization needs on a skinned mesh.
  - Write a `-source.json` beside each, as `assets/critters/butterfly-source.json` does: author, title, source URL, `CC BY 4.0` with its licence URL, the download's bytes and md5, triangles, maps, what was changed, and the exact commands.
  - Render each in the game's light, from the search camera's height, and look at it. Expected: a recognisable textured animal with no holes, no missing map and no floor. Commit.
- [ ] **Step 2: Rules.** Update `memory-surprises.test.mjs` and `memory-rules.test.mjs`:
  - `deck has 12 cards: 3 friend pairs and 3 gift pairs`.
  - `a gift pair is found, joins found, and does not count as a friend pair`.
  - `a gift and a friend mismatch and both close`.
  - `two different gifts mismatch`.
  - `found gifts cannot be picked again`.
  - `won waits for the last gift pair` (all friends matched with one gift pair left → not won).
  - Run them. Expected: FAIL. Implement it in `rules.js`, then run again. Expected: PASS.
- [ ] **Step 3: The glade.**
  - 12 leaves in a 4 × 3 grid, turned toward the search camera like now.
  - Re-fit `gladeCue` so all 12 leaves, Mosi and the group are visible at 1280 × 800, 820 × 1180 and 390 × 844.
  - Leaf hit targets stay ≥44 px on the phone size.
  - Keep the camera corridors and the paths clear.
- [ ] **Step 4: Gifts in play.**
  - The first leaf of a gift shows the gift standing on it, with its `seek` caption.
  - The pair flies to the basket with `stars` and the `ding`. The basket counts "x / 3" and shows from the start of the round.
  - Mosi says the gift's `voice` line.
  - The berries and the butterfly no longer hide under leaves.
  - "Byrja upp á nýtt" in the middle of a gift's flight cancels it and sets the basket to 0 / 3. A leaf tapped during the flight waits, as it does during a match.
- [ ] **Step 5: All 12 before the crossing.**
  - The crossing starts on its own only when all friends and all gifts are found.
  - With the bridge built, all friends found and gifts left, Mosi says `giftsLeft` and the guiding arrow points at a hidden leaf. A tap on the staging spot says the same.
  - When the last gift pair lands in the basket, the crossing starts, once.
  - At the grove the celebration shows all three gifts rising from Mosi's basket, framed beside his head. Mosi says `gifts3`, and the ending card says it too.
  - The credits for the three models (Líkan / Leyfi / Frá, as the book's card viewer shows them) are behind a small "i" on the ending card.
- [ ] **Step 6: Lines.** Read the memory note `icelandic-voice-pronunciation` first. Add these to `voice-lines.js` with new seeds:
  - `giftsLeft` ("Finnum fyrst gjafirnar sem eru eftir!")
  - `gifts3` ("Þú fannst allar þrjár gjafirnar!")
  - `gift_shrew` ("Snjáldurmús! Hún fer í körfuna.")
  - `gift_hermitCrab` ("Kuðungakrabbi! Hann fer í körfuna.")
  - `gift_crab` ("Krabbi! Hann fer í körfuna.")
  - Remove `gifts1` and `gifts2`, their mp3 files and manifest entries, since the round now always ends with three.
  - Run `memory-voices.mjs --only … --dry-run`, then without `--dry-run`, then `--verify`. The controller checks the new takes by ear and with speech-to-text afterwards.
- [ ] **Step 7: Playthrough.**
  - The driver finds all 12. Drop `--surprises`, and report each gift pair found (`report.gifts`: id, item, at).
  - Run `full --video` at 1280 × 800, 820 × 1180 and 390 × 844, plus `rapid`, plus a run that finds every friend first, so the `giftsLeft` wait is seen.
  - Expected: no errors, nothing stuck, the crossing starts once, the basket ends at 3 / 3, and ≤100 draw calls and ≤250k triangles at every sampled frame, including the celebration with three gifts.
  - Run `npm run test:memory`. Update the README's review scope (12 leaves, gift pairs, the model credits). Commit.
- [ ] **Owner checkpoint:** the 12-leaf glade, a gift found and a gift mismatch, the `giftsLeft` wait, the celebration with three gifts, and the new lines to listen to.
