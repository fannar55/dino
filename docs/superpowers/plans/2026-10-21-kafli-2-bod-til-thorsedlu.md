# Chapter 2, "Boð til Þórseðlu": Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The second story chapter of the remake: Mosi and Egill ride from Kambeðla's glade into the Fen, count Þórseðla's ten water-filled footprints, lure her nine-metre head down with five red berries, invite her, ride her neck up to the lookout, find three far friends for the book's new map, slide down, and win the second star, which opens "Háls og hali".

**Architecture:** A chapter module `remake/chapters/kafli2.js` shaped exactly like `kafli1.js` (places with layouts and shots, global actors, a generator script over the scene API), two new places (`fenjaslod`, `fen`) built by the existing forest with a `fen` biome (new species, colours, terrain `lift`/`keepOut`, a water surface and low mist), new props (mud prints, berries, basket), a neck seat and a slide in `riding.js`, far friends on the light LOD path, a "Kortið" page in the book with a `places` list in the save, a `kafli2` voice set, and a chapter test that plays the whole script unattended in Node.

**Tech Stack:** plain ES modules, three.js r180 (vendored), the remake's engine (`scene`, `director`, `locations`, `forest`, `actor`, `riding`), Web Audio sounds, ElevenLabs v4 voices (recorded by the controller only), `node --test`, `tools/capture.mjs` for captures and benchmarks.

**Spec:** `docs/superpowers/specs/2026-10-21-kafli-2-bod-til-thorsedlu-design.md` (Icelandic, owner-approved 2026-10-21, revised the same day for the Fen and for science-first content). Also binding: `remake/STYLE.md`, and the interface map every task reads first: `C:/Risaeðla/dino-kafli2/.superpowers/sdd/2026-10-21-kafli2/api-map.md`.

## Global Constraints

- **Worktree and branch:** `C:/Risaeðla/dino-kafli2`, branch `kafli2` (from main b9cfb5d). Never push. Commit after each piece with paths named in `git add`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (builders run on Opus 5.5).
- **Never:** bare `git stash`; touch `dist/` or `design/`; call ElevenLabs (only the controller records voices); stop servers on ports 4190, 4195 or 4197; dispatch subagents.
- **Line endings:** keep each file's existing line endings and never convert a file (the repo has `.gitattributes * -text`; most files, `main.js` and `STYLE.md` among them, are CRLF). Edit with tools that preserve them.
- **Real scale** (STYLE.md 3): Þórseðla 22 m, head 8.3–9 m up; Mosi 8.5 m; Egill 1.1 m. No scale tricks.
- **Science first** (spec 1): only animals and plants that lived with the dinosaurs in the Fen: frogs, salamanders, turtles, dragonflies, water beetles, water striders, early birds, fish, snails; horsetails, ferns, cycads, swamp conifers, water lilies, moss. No herons, ducks or modern grasses. The red berries are the one allowed licence.
- **The Fen's look** (spec 3): wet, golden, clear, not dark; water `#3f7a6e` → `#a9c9c4`, horsetail reeds `#c9b45a`/`#e3d08a`, moss `#6f8f3c`/`#4e7a3a`, mud `#4a3a2c`, swamp-tree bark `#5a4636`, hanging moss `#8aa05a`, lily pads `#4f8a4a` with `#f6f1e4`/`#f0a3b6` flowers, mist `#cfe0d6`. Mosi stands on a dry hummock with light water behind him (STYLE 5).
- **Camera rules** (STYLE.md 8, `director.js LIMITS`): lens 24–60, cuts and moves at most 7.5 m above the ground (the lookout uses `follow`), look-down ≤ 35°, shots ≥ 2.5 s, `director.warnings` empty.
- **Budget** (STYLE.md 11): ≤ 6 ms GPU, ≤ 100 draw calls, ≤ 250k triangles, ≤ 96 MB textures per shot on the tablet preset at 1280x800; the forest's share ≤ 3.5 ms / 60 calls / 150k. No post-processing, no reflections.
- **No fail states:** every wait for the child has hints at 12/24/36 s and ends by itself at 48 s (or sooner where the spec says), as `s.search` and `tapOrWait` already do.
- **Line ids:** set `kafli2`, ids `k2_<speaker>_<short>` in lower case only (`speaker` is `mosi`, `egill`, `thorsedla`, `kambedla`), in `remake/assets/audio/kafli2/lines-source.json`. The counts are a fresh neuter series `k2_mosi_1` "Eitt!" … `k2_mosi_10` "Tíu!" (fótspor and ber are neuter); nothing is reused from other sets. A map marker that is found or done speaks `k2_mosi_map_<id>` when tapped; an empty slot is silent.
- **Tests:** one new chapter test `remake/tests/kafli2.test.mjs` plus `remake/tests/fen.test.mjs` for the new world pieces; additions to existing test files where a shared module changes. `npm run test:remake` must pass at the end of every task. Never the old game's suite.
- **Captures:** every task ends with captures of its key shots at 1280x800 (tablet preset) and one at 820x1180 into `qa/remake/kafli2/<task>/`, made with `remake/tools/capture.mjs --page remake/index.html --shot name="chapter=kafli2&t=<s>&quality=tablet"`, and their paths sent to the controller, who shows them to the owner. `--bench 120` numbers go in the report.
- **Review loop (the owner's rule for this chapter):** each task is reviewed by a reviewer agent against the spec, STYLE.md and the captures; the builder fixes and the reviewer re-reviews until nothing material remains. A task is not done until the reviewer passes it and the owner has seen its key shot.

## Review Focus

1. **The child taps a footprint out of order, or the same one twice.** Expected: a splash and Mosi's "Næsta er þarna!" with a head nod toward the next print, no count advanced, never a dead tap. Test: Task 4 `a wrong footprint splashes and says next, and the count waits`.
2. **The child never raises the basket, or taps the blue berries only.** Expected: after five red berries Egill raises it himself after 6 s; blue taps only play Mosi's line; the head still comes down. Test: Task 4 `an idle child still gets the head down`.
3. **A capture or a replay (`?t=`) through the lookout.** Expected: the lift, the search with its hints and the slide all end by themselves in seeking, with `director.warnings` empty though the camera is at 9 m. Test: Task 5 `the chapter plays to its end unattended with no director warnings`.
4. **Loading chapter 2 with no star from chapter 1, or with both stars.** Expected: `?chapter=kafli2` plays; the default page picks kafli1 with no `k1_kambedla`, kafli2 with it and no `k2_thorsedla`, and kafli2 again (replayable) when both are there; the book's Háls og hali tile only opens with `k2_thorsedla`. Test: Task 1 `the default chapter follows the stars`, Task 5 `Háls og hali opens with Þórseðla's star`.
5. **The budget in the busiest shots: the reveal (forest edge, water, Þórseðla), the head-down two-shot, the lookout.** Expected: within 6 ms / 100 calls / 250k on the tablet preset. Test: Task 6's measured table, and `tools/world/forest-stats.mjs --chapter kafli2 --location fen` ≤ 150k forest triangles in Task 2's test.

---

### Task 1: The chapter skeleton, its lines, the look and the hand-over

**Files:**
- Create: `remake/chapters/kafli2.js`, `remake/assets/audio/kafli2/lines-source.json`, `remake/tests/kafli2.test.mjs`, `remake/tests/chapter-harness.mjs`
- Modify: `remake/engine/looks.js`, `remake/STYLE.md` (section 6, CRLF), `remake/tools/audio-lines.mjs:51` (`SETS`), `remake/tools/voice-lines.mjs` (header comment), `remake/tests/voice-lines.test.mjs:360,463-466,487,496,521`, `remake/main.js:59` (CRLF), `remake/tests/kafli1.test.mjs` (import the harness)

**Interfaces:**
- Consumes: `kafli1.js` `chapter.locations.burknalaut` (layout, shots), `POINTS`, `createSaddle`, `addPlateGlow`; the scene API; `pickLook`.
- Produces:
  - `export const chapter = { id:'kafli2', title:'Boð til Þórseðlu', look:'lateMorning', start:'burknalaut', locations:{ burknalaut, fenjaslod, fen }, actors:{ mosi, egill, kambedla, thorsedla }, cast, lines, startShot:'glade_leaving', prepare:['fenjaslod','fen'], warmUp(world), shots:{}, *script(s) }` with `locations.fenjaslod` and `locations.fen` as stubs (a flat clearing layout and three shots each) that Task 2 replaces;
  - `export const LINES` is not needed: `chapter.lines` maps every id in `lines-source.json` to `{ text, audio: id }`, the counts included (`k2_mosi_1..10`);
  - `LOOKS.lateMorning = { ...morning, sun:{ azimuth:150, elevation:26, color:'#ffe0b0', intensity:2.8 } }` with fog a touch lighter (`#d6e2dc` → `#dfe7df`);
  - `main.js`: `defaultChapter(save)` → `'kafli1'` when `k1_kambedla` is missing, else `'kafli2'`; `?chapter=` still overrides;
  - `remake/tests/chapter-harness.mjs` exporting `chapterWorld()`, `groundOnly(layout)`, `fakePointer()`, `fakeBook()`, `playUnattended(chapterModule, opts)` lifted from `kafli1.test.mjs:36-535` unchanged in behaviour, taking the chapter module as a parameter.

- [ ] **Step 1: Write the lines.** `lines-source.json`: every spoken line of spec section 4 and the hints, ids `k2_mosi_*`, `k2_egill_*`, `k2_thorsedla_*`; the counts seven to ten (`k2_mosi_7` "Sjö!" … `k2_mosi_10` "Tíu!"); `k2_mosi_count` "Teljum þau!"; the three friend-found lines; the three search hints for the berries and the three for the lookout; Kambeðla's "Góða ferð!" as `k2_kambedla_bye`. Same text and speaker twice gets different seeds.
- [ ] **Step 2: Register the set.** `SETS.kafli2 = 'remake/assets/audio/kafli2'`; update the two tools' header comments and `voice-lines.test.mjs` so `--set kafli2` is accepted, `SETS` has five sets, and the three `throws(/kafli2/)` cases use a still-unknown name (`kafli3`).
- [ ] **Step 3: Write the failing chapter test** `kafli2.test.mjs` with the harness: `every chapter line has a recording and the source's words` (skips `audio` entries not yet in lines.json with a clear message, so Task 1 passes before the controller records; from Task 4 on the skip is an error), `locations as data` (ids `['burknalaut','fenjaslod','fen']`, start, actor sets, unique shot names, ≥ 6 shots per place, the start shot in the start place), `every shot keeps the camera rules over its ground`, `the default chapter follows the stars` (`defaultChapter` on saves with `[]`, `['k1_kambedla']`, `['k1_kambedla','k2_thorsedla']`).
- [ ] **Step 4: Run it to see it fail** (`node --import ./remake/tests/setup.mjs --test remake/tests/kafli2.test.mjs`): fails on the missing module.
- [ ] **Step 5: Implement** `kafli2.js` (the chapter object, the two stub places, actors with Þórseðla at `brontosaurus.glb`, cast colours from STYLE 3, the script as `yield* story(s, c)` with eight empty scene generators that `mark(c, n)` and `yield s.wait(0.1)`), `looks.lateMorning`, `main.js defaultChapter`, and extract the harness (kafli1.test keeps passing).
- [ ] **Step 6: Run** `npm run test:remake`: all pass. Capture `qa/remake/kafli2/1-skeleton/start.png` (`chapter=kafli2&t=1`).
- [ ] **Step 7: Commit** `git add remake/chapters/kafli2.js remake/assets/audio/kafli2/lines-source.json remake/tests/kafli2.test.mjs remake/tests/chapter-harness.mjs remake/tests/kafli1.test.mjs remake/engine/looks.js remake/STYLE.md remake/tools/audio-lines.mjs remake/tools/voice-lines.mjs remake/tests/voice-lines.test.mjs remake/main.js`.

**Controller step after Task 1:** record the set (`node remake/tools/voice-lines.mjs --set kafli2`), commit the MP3s and `lines.json`, send the listening page to the owner.

### Task 2: The Fen: biome, terrain, water, mist, shots

**Files:**
- Create: `remake/world/props/water.js`, `remake/world/props/mist.js`, `remake/tests/fen.test.mjs`
- Modify: `remake/world/forest/species.js` (fen species), `remake/world/forest/config.js` (fen colours), `remake/world/forest/forest.js`, `plan.js`, `grass.js`, `terrain.js` (biome and water-aware placement), `remake/chapters/kafli2.js` (the real `fenjaslod` and `fen` layouts and shots, `warmUp`), `remake/tools/world/forest-stats.mjs` if it needs the biome

**Interfaces:**
- Consumes: `createForest(world, layout)`, `layout.lift/keepOut`, `createSpeciesLibrary(seed)`, `planForest`, the Fen palette.
- Produces:
  - `layout.biome: 'forest' | 'fen'` (default forest). With `'fen'`: the species set is `swampConifer` (roots in the water, hanging moss cards), `horsetailReed` (tall, golden, in beds), `horsetailTall`, `waterLily` (only where `layout.water.depthAt(x,z) > 0.05`), `mossHummock`, `deadSnag`, plus the existing `fern`, `cycad`, `treeFern`, `rock`, `log`; grass is golden reed (`FEN.grassSun '#c9b45a'`, tips `#e3d08a`, base `#6b7a3a`), soil is mud `#4a3a2c`; canopy colours from the Fen palette.
  - `layout.water = { pools:[{ center:[x,z], radius, depth }], channel:{ line:[[x,z],...], width, depth } }`; `createForest` derives `lift` (hollows for pools and the channel, smooth-stepped over 2.5× the depth), `keepOut` (1 inside water edges fading over 0.4 m) and builds `createWater(world, layout.water, heightAt)`; `forest.water` is the water object; `forest.heightAt` keeps returning the ground (the bed) so actors stand in water.
  - `createWater(world, spec, heightAt) → { group, update(t), surfaceAt(x,z) → y|null, depthAt(x,z), rippleAt(point, strength=1) → Handle, bubblesAt(point) → Handle, dispose() }`: one `ShaderMaterial` surface (fog-aware, transparent, no depthWrite, flow shimmer, sun glint toward the look's sun, edge fade over 0.4 m), ripples as expanding rings in the same material's uniforms (≤ 8 live), bubbles as a few soft points; ≤ 2 draw calls, ≤ 6k triangles for the whole Fen.
  - `createMist(world, { center:[x,z], radius, height=1.2, level=1 }) → { group, setLevel(v), update(t), dispose() }`: ≤ 12 soft additive cards low over the water, drifting; `setLevel` fades them (the sun lifts the mist over the chapter: 1 → 0.25).
  - `locations.fenjaslod.layout`: seed 11, `clearing` radius 14, `path` from the glade exit south-east down to the Fen, `biome:'fen'` from the path's midpoint on (species mix blends over 10 m: `layout.blend:{ from:[x,z], to:[x,z] }`), ten `prints` placed by Task 4; shots `trail_wide`, `trail_follow`, `print_close`, `trail_fog`, `trail_portrait`, `trail_end` (≥ 6).
  - `locations.fen.layout`: seed 12, `clearing` radius 24, `biome:'fen'`, `water` with 5 pools (radius 3–7 m, depth 0.35) and one channel (width 4 m, depth 0.5) winding from north-west to south-east, `actors.thorsedla` as four points along her 22 m (she stands in the shallow pool `p1`, depth 0.3, facing the swamp conifers she eats), `actors.mosi` on a dry hummock south of her with water behind, berry hummocks east, dead snags, the far places (`farFriends:{ sloedla:[x,z], flugedla:[x,z], uggedla:[x,z] }` 60–120 m out); shots `fen_reveal` (rising pan start/end as two shots), `fen_thorsedla_low`, `fen_two_shot`, `fen_head_down`, `fen_berries`, `fen_lift_start`, `fen_slide_end`, `fen_star`, `fen_portrait` (≥ 6, all ≤ 7.5 m).
- [ ] **Step 1: Write the failing tests** in `fen.test.mjs`: `water surfaces sit above the bed and fade at the edge` (`surfaceAt` inside a pool ≈ bed + depth; `null` outside), `the fen plan keeps plants out of the water and lilies in it` (planForest with the fen layout: no non-lily placement where `depthAt > 0.05`, every `waterLily` where it is > 0.05), `the fen stays within the forest budget` (`forest-stats` numbers for every fen shot ≤ 150k triangles, ≤ 60 calls), `Þórseðla's standing points are clear of plants`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** the biome, species, colours, water, mist and the two layouts with their shots. Species budgets per STYLE 12 (tree ≤ 6k at LOD0, bush 1.5k, fern 600). The hanging moss is a few alpha-tested cards per conifer, swaying with the wind uniforms.
- [ ] **Step 4: Run** `fen.test.mjs`, `kafli2.test.mjs`, then `npm run test:remake`: pass.
- [ ] **Step 5: Captures** into `qa/remake/kafli2/2-fen/`: `trail.png` (`shot=trail_wide`, the start place is the glade, so use `t=` into scene 2 once Task 4 exists; for now `--eval` that calls `window.__scene`'s `goTo`), `reveal.png`, `thorsedla_low.png`, `portrait.png` (820x1180), with `--bench 120` on `reveal`. Send the paths.
- [ ] **Step 6: Commit** (paths named).

### Task 3: Þórseðla alive, the head coming down, the neck seat and the slide

**Files:**
- Create: `remake/engine/neck-ride.js`
- Modify: `remake/engine/riding.js` (`createSeat`), `remake/chapters/kafli2.js` (scenes 3, 4-tail, 6-lift, 7 as reusable pieces: `thorsedlaLife(s, c)`, `headDown(s, c)`, `liftUp(s, c)`, `slideDown(s, c)`), `remake/tests/riding.test.mjs`, `remake/tests/kafli2.test.mjs`

**Interfaces:**
- Consumes: `brontosaurus.glb` clips `lowerHead` (4.5 s, once), `liftUp` (8 s, once), `kink`, `happy`; `ride`, `floatTo`, `floatDown`, `sparkleTrail`; `forest.water.rippleAt`; `actor.lookAt`.
- Produces:
  - `createSeat(host, { bone:'Neck5', offset:[0, 0.55, 0], grips:{ left:[-0.35, 0.3, 0.45], right:[0.35, 0.3, 0.45] } }) → { object:null, seat, grips:{left,right}, host, update() }` in `riding.js`: a seat with no mesh that `ride`, `floatTo` and `floatDown` accept (they use only `seat`, `grips`, `host`, `update`).
  - `neck-ride.js`: `neckCurve(host, out) → CatmullRomCurve3` through `Head, Neck5..Neck, Chest` skin tops; `slideDown(rider, host, saddle, { duration=3.2 }) → Handle`: the rider sits (`sit`), moves along the neck curve from the seat to `Chest`, leaves it on a short arc into `saddle.seat`, sparkle trail and water drops (ripples at the drip point when water is under it), ends in `ride(rider, saddle)`.
  - In `kafli2.js`: `thorsedlaLife` (idle plus every 7–12 s a `kink`, a bite with leaves falling (6 leaf cards, `world.effects`), tail sway is in idle; `lookAt` the nearest of Egill/Mosi once her head is down), `headDown` (plays `lowerHead`, ripples at her fore feet, the camera over Egill's shoulder looking up: `s.camera.follow('egill', { offset:[0.6, 0.9, 1.6], local:true, look:{actor:'thorsedla', part:'head'} })`, the sun winks at 2.5 s), `liftUp` (Egill `floatTo(seat)` on tap or after 6 s, `ride`, `liftUp` clip, `s.camera.follow('egill', { offset:[0, 1.2, -3.2], local:true, look:'head', stiffness:1.2, fov:40 })`, water drops from the neck), `slideDown`.
- [ ] **Step 1: Failing tests:** `riding.test.mjs` `a seat on a neck bone rides and floats` (Egill floats to a `Neck5` seat on a loaded Þórseðla, `ride` keeps his root within 5 cm of the seat through `liftUp`); `kafli2.test.mjs` `the head comes down to Egill's eyes and the lift keeps him level` (after `headDown` Þórseðla's eyes are 0.85–1.15 m up and within 1.5 m of Egill's head; through `liftUp` the seat's up vector stays within 12° of vertical and ends 8–9.5 m up); `the slide lands in the saddle` (root within 5 cm of `c.saddle.seat` at the end, `rider.controlled` true).
- [ ] **Step 2: Run to fail.** **Step 3: Implement.** **Step 4: Run** `riding`, `brontosaurus`, `kafli2`, then `test:remake`.
- [ ] **Step 5: Captures** `qa/remake/kafli2/3-thorsedla/`: `head_down.png` (mid `lowerHead`), `eyes.png` (eyes level with Egill), `lift_mid.png`, `lift_top.png` (9 m, Mosi small below), `slide.png`, `portrait_lift.png`. Send.
- [ ] **Step 6: Commit.**

### Task 4: Footprints in the mud, the Fen's animals, the berries and the basket (scenes 1–5)

**Files:**
- Create: `remake/world/props/mud-prints.js`, `remake/world/props/berries.js`, `remake/world/props/basket.js`
- Modify: `remake/world/critters/models.js` and `critters.js` (new kinds), `remake/chapters/kafli2.js` (scenes 1–5 complete), `remake/engine/scene/ui.js` (`ICONS.basket`), `remake/tests/fen.test.mjs`, `remake/tests/critters.test.mjs`, `remake/tests/kafli2.test.mjs`

**Interfaces:**
- Consumes: `createCritters`, `s.found`, `s.search`, `holdWithHands`, `tapOrWait`, `s.target/onTap`, `forest.water`, `sparkleBurst`, `pollenBurst` (soft look for splashes).
- Produces:
  - `createMudPrints(world, { prints:[{ position:[x,z], heading }], heightAt, water }) → { group, targets:[{ name:'print1'..'print10', point, radius:0.6 }], splash(index) → Handle, count(index) → Handle (a 3D digit rising 0.6 m out of the water for 1.6 s, Nunito-shaped from `world/props/`'s text helper or a sprite), done(index) (the print's water goes still and gold-tinted), dispose() }`: pressed blobs (`footprints.js BLOBS`) 0.7 m across in dark mud with a water disc 2 cm below the rim using the water material, ≤ 2 draw calls for all ten.
  - New critter kinds in `models.js KINDS`: `dragonfly` (two wing pairs tagged for the bird-wing shader, hover morph), `waterBeetle` (brunnklukka, swims in a circle), `salamander` (crawls two body lengths and back), `turtle` (head in/out), `earlyBird` (fornfugl, feathered, flies up and back like `bird`), `fish` (jumps once from a pool, splash), `waterStrider`; each ≤ 400 triangles, one mesh; `critters.js` accepts `kind` for them and the finding ids `'dragonfly','waterBeetle','salamander','turtle','earlyBird','fish','waterStrider'`.
  - `createBerryBushes(world, { bushes:[{ position:[x,y,z], kind:'red'|'blue', count }] }) → { group, targets:[{ name:'berry_<b>_<i>', point, radius:0.35, kind }], pick(name, to) → Handle (flies the berry to the point spec), shake(bush) → Handle, update(t), dispose() }`.
  - `createBasket(world) → { group, point, hold(actor), raise(actor, { duration=0.9 }) → Handle (both hands up, basket over the head), lower(), add(berry) → Handle, count, dispose() }` using `holdWithHands`.
  - Scenes in `kafli2.js`: 1 `leaving` (Kambeðla's plates blink bye, `k2_kambedla_bye` on tap), 2 `prints` (`s.target` on all ten; the next print glimmers; wrong taps splash and say `k2_mosi_nextprint` with a Mosi head nod; a right tap: `splash`, `count`, Mosi says the number (`hals_mosi_1..6`, `k2_mosi_7..10`), the critter in that print reacts and `s.found` records it; idle 8 s → hint `k2_mosi_hint_print`, 16 s → Egill taps it), 3 `reveal` (`goTo(fen)`, `fen_reveal` move, `k2_mosi_there`, Egill's call, tail swish, `k2_mosi_canthear`), 4 `berries` (`s.search` over the five red berry points with hints `k2_mosi_hint_berry1..3`; blue berry targets say `k2_mosi_blue`; `basket.add` per pick with the count line; then `tapOrWait(egill, 6 s)` → `basket.raise`; Task 3's `headDown`; `k2_thorsedla_mmm`, `k2_thorsedla_who`, `k2_egill_name`, `k2_thorsedla_thanks`), 5 `invite` (the lines and the choice `['Já!','Er það hátt?']` with `k2_thorsedla_high`, idle 25 s → yes).
- [ ] **Step 1: Failing tests:** `fen.test.mjs` `ten mud prints lie on the trail with water in them` and `berry bushes expose five red targets and the blue ones`; `critters.test.mjs` `every fen critter has a model under 400 triangles and a reaction`; `kafli2.test.mjs` `a wrong footprint splashes and says next, and the count waits`, `an idle child still gets the head down` (non-seeking run with no taps reaches scene 5 by 420 s with the five berries picked by Egill), `the prints are counted one to ten in order` (captions of the counts in order), `the fen animals go into the book` (findings include the four print critters).
- [ ] **Step 2: Run to fail. Step 3: Implement. Step 4: Run the four test files, then `test:remake`.**
- [ ] **Step 5: Captures** `qa/remake/kafli2/4-prints-berries/`: `print_tap.png` (a digit rising), `prints_wide.png`, `berries.png`, `basket_up.png`, `portrait_prints.png`. Send.
- [ ] **Step 6: Commit.**

### Task 5: The lookout, the far friends, the map, the slide and the star (scenes 6–8)

**Files:**
- Create: `remake/world/props/far-friends.js`, `remake/engine/book/map-page.js`, `remake/assets/book/map.svg`
- Modify: `remake/chapters/kafli2.js` (scenes 6–8, `chapter.next`), `remake/engine/save.js` (`places`), `remake/engine/scene/journal.js` (`addPlace`), `remake/engine/scene/scene.js` (`s.place`), `remake/engine/book/book.js` (tab `map`, `HALS_STAR`), `remake/engine/book/icons.js`, `remake/book.css`, `remake/main.js` (the hand-over button after a chapter ends), `remake/tests/book.test.mjs`, `journal.test.mjs`, `save.test.mjs` (or where save is tested), `kafli2.test.mjs`

**Interfaces:**
- Consumes: Task 3's `liftUp`/`slideDown`, `createThorsedlaLod` (light LOD path), `s.search` at height, `s.star`, `journal.addFinding` pattern.
- Produces:
  - `createFarFriends(world, { friends:{ sloedla:{ position:[x,y,z], heading, clip:'wade' }, flugedla:{..., clip:'idle', perch:'snag'}, uggedla:{..., clip:'idle' } }, sun }) → { targets:[{ name, point, radius:2.5 }], show(on), glimmer(name, on), react(name) → Handle (Slóeðla steps, Flugeðla spreads her wings (`takeOff` first half then `land`), Uggeðla lifts her head: `kink`), update(dt, camera, heightPx), ready(), dispose() }`: actors created with `own = Object.create(world); own.renderer = null`, on `thorsedla-lod` levels only (≤ 2.2k triangles each), hidden unless `camera.position.y > 6`.
  - Save: `places: string[]` normalised and written like `findings`; `save.addPlace(id)` → bool; `get()` includes `places`.
  - `journal.addPlace(id, from) → bool`: flies a small round marker (the friend's hue) into the book like `addFinding` and nods it; ids `sloedla`, `flugedla`, `uggedla` (the friend keys) and `fen`.
  - `s.place(id, from)` on the scene API, mirroring `s.found`.
  - Book: `TABS` gets `'map'` after `'games'` (`LABELS.map = 'Kortið'`, `ICONS.map` a compass rose), `map-page.js` `renderMap(leaf, { save, onTap })` draws `map.svg` (hand-drawn journal style: the clearing, the glade, the trail, the Fen with pools and the channel, dotted paths) across the two pages with marker slots for `fen` and the six friends; found places show the friend's sticker, done places a star (`k<N>_<key>` in `stars`); a tap says `k2_mosi_map_<id>` through the book's audio (narrator set reuse is not needed: these are Mosi's lines in `kafli2`).
  - `HALS_STAR = 'k2_thorsedla'` replaces `HALS_OPEN`; the tile wiggles (as Eitt!'s does) until the star.
  - `chapter.next = null` on kafli2 and `'kafli2'` on kafli1; `main.js` shows a raised "Áfram" pill (book style) over the open book when a chapter's script ends and `chapter.next` exists, navigating to `?chapter=<next>`.
  - Scenes: 6 `lookout` (Þórseðla lays her head down: `lowerHead` is already down; Egill walks to her neck, `floatTo(seat)` on tap or 6 s, `liftUp` with the follow camera, `k2_egill_tiny`, `k2_mosi_notsmall`, `k2_thorsedla_look`; `s.search({ explore:{ yaw:[-70,70], pitch:[-30,10] }, targets: farFriends.targets with hints k2_mosi_hint_far1..3, onFound: farFriends.react + s.place(id) + the found line })`, `k2_thorsedla_now`), 7 `slide` (tap Egill or 5 s → `slideDown`, `k2_egill_wuuu`, `k2_thorsedla_comeback`), 8 `star` (`s.star('k2_thorsedla', { actor:'thorsedla', part:'head', offset:[0,-1,0] })`, sun hug, `s.journal.open('stars')` then after 1.2 s `open('map')`, `k2_mosi_second`, `k2_mosi_two`).
- [ ] **Step 1: Failing tests:** `kafli2.test.mjs` `the chapter plays to its end unattended with no director warnings` (timeline `[1..8]` in order, final location `fen`, stars `['k2_thorsedla']`, places `['sloedla','flugedla','uggedla']` in some order, `book.opened` ends with `map`, `director.warnings` empty, < 600 s), `no fail states` (idle run: hints three times per far friend, found for the child, the slide by itself), `the far friends only show from above`; `book.test.mjs` `the book has a Kortið page with the found places`, `Háls og hali opens with Þórseðla's star` (wiggles without it); `journal.test.mjs` `addPlace writes the save once and flies a marker`; the save test `places survive a round trip`.
- [ ] **Step 2: Run to fail. Step 3: Implement. Step 4: Run the touched tests, then `test:remake`.**
- [ ] **Step 5: Captures** `qa/remake/kafli2/5-lookout/`: `lookout.png` (the view from 9 m with the friends glimmering), `found.png`, `map.png` (the book's Kortið page), `star.png`, `portrait_lookout.png`; also a capture of chapter 1's end with the "Áfram" pill. Send.
- [ ] **Step 6: Commit.**

### Task 6: Sound, the sun, the budget and the polish pass

**Files:**
- Modify: `remake/engine/audio/sfx.js` (the Fen's bed and events), `remake/chapters/kafli2.js` (sfx calls, timing), `remake/engine/sun-face.js` only if a gesture is missing, `remake/tests/kafli2.test.mjs` (sound names used exist)

**Interfaces:**
- Consumes: `createSfx` names, `theme.json` key, `s.sfx(name)`; the audio ducking under voices already in place.
- Produces: sfx names `fen` (the bed: water lapping, frogs, dragonfly hum, drips, bubbles, scheduled like `forest`), `splash`, `ripple`, `countTone` (rises with the index), `berryPop`, `sniff`, `breathHuge`, `chew`, `liftTone` (8 s rise), `windHigh`, `slide`, `landSaddle`, `mapMark`, all in the theme's key; `s.sfx('fen')` replaces `'forest'` on arrival; a capture-time `--bench` table for the five key shots (reveal, head down, two-shot, lookout, star) at 1280x800 and the forest's share per `forest-stats`.
- [ ] **Step 1: Failing test:** `kafli2.test.mjs` `every sound the script asks for exists` (the names in `s.sfx(...)` calls are keys of the sfx set).
- [ ] **Step 2: Implement the sounds and wire them.** **Step 3: Measure** the five shots with `--bench 120` on the tablet preset; if any exceeds 6 ms / 100 calls / 250k, reduce (far forest LOD, water triangles, mist cards, leaf cards) until it passes, and record the table in the report.
- [ ] **Step 4: Run `test:remake`. Step 5: Captures** `qa/remake/kafli2/6-polish/` of the five shots plus `portrait.png`. **Step 6: Commit.**

### Task 7: The Fen's animals in the book

**Files:**
- Modify: `remake/assets/book/cards.json`, `remake/assets/book/media-manifest.json`, `remake/assets/audio/book/lines-source.json` (the narrator's new card lines), `remake/engine/book/*` only if a card kind is new, `remake/tests/book.test.mjs`
- Create: drawn pictures `remake/assets/book/images/fen-<animal>.svg` (simple, friendly, in the book's line style) until photographs are approved

**Interfaces:**
- Consumes: the card format (`id`, pages, `unlock:{found:'id'}`), the finding ids of Task 4.
- Produces: eight cards (`frog` exists: add a Fen page; new `dragonfly`, `waterBeetle`, `salamander`, `turtle`, `earlyBird`, `fish`, `waterStrider`), each 3 pages, each fact true to the fossil record and written as spoken to a 6-year-old (short sentences); narrator lines `book_<card>_<n>` added to the `book` set source (the controller records them); pictures drawn as SVG now, with a `wanted` note per card naming a Wikimedia Commons subject for a later download that the owner must approve first.
- [ ] **Step 1: Failing test:** `book.test.mjs` `the fen cards unlock with their findings and have three pages each`.
- [ ] **Step 2: Implement. Step 3: Run `book.test.mjs`, `test:remake`. Step 4: Capture** `qa/remake/kafli2/7-cards/` the Dýrin page with the new cards and one open card. **Step 5: Commit.**

---

## Review protocol (per task)

1. The controller records BASE before dispatch, writes the task brief with `scripts/task-brief`, and dispatches an **Opus** implementer with the brief, the api map, the spec and STYLE.md.
2. The implementer reports status, commits, a test summary and concerns; captures and `--bench` numbers are in the report file.
3. The controller builds the review package (`scripts/review-package PLAN BASE HEAD`) and dispatches an **Opus** reviewer with the brief, the report, the diff, the spec, STYLE.md and the capture paths. The reviewer judges spec compliance and quality (composition, light, motion, timing, readability for a 6-year-old, the budget, the code), and returns a numbered list of material findings.
4. Fix rounds: the implementer fixes, the reviewer re-reviews the fix diff; up to five rounds, then the controller adjudicates.
5. The controller shows the owner the task's key shot(s) and relays the verdict; the owner's notes become the next fix round.
6. After Task 7: a whole-branch review on Opus, a full play-through of chapter 1 into chapter 2 in the browser, and the owner's play test with Egill before any merge.
