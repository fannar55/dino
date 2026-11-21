# Kafli 6: Boð til Grameðlu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project builders work in chunks and the owner reviews after each chunk (no reviewer agents); see Global Constraints.

**Goal:** Build chapter 6 of the remake: from the far pool where chapter 5 ends, Mosi and Egill go alone to Grameðla's mountain. Egill picks five stepping stones over the river above the falls, they look back over the whole forest from the slope, count six giant footprints into the cloud, call three times and follow her answering roar; she steps out, roars yes so the cloud blows away, the sixth star rises, and she carries Egill on her head up onto the flat top above the sea of cloud.

**Architecture:** Four places: chapter 5's pool and the ford in one valley (`createArdalur` built round two spots), and three small stages of a new land, `world/fjall/` (the slope with the far land as its view, the cloud belt, the top), switched under black. Each of the three tasks is a pure state machine with no drawing and no sound (`kafli6-stones.js`, `kafli6-prints.js`, `kafli6-call.js`, as `kafli5-choir.js`), all on one help ladder (`kafli6-help.js`), driven by the scene and the game clock, so every rule is tested without a browser. The cloud is the engine's own fog made thicker and whiter while the game runs, with cards for what moves (`world/fjall/cloud.js`); each place's light is a look set while the game runs (`engine/light-blend.js`). Grameðla is `trex.glb` with her three clips, a faster stride baked by the existing bake tool, the lean of "Grameðla kemur!" moved into the engine, and a head seat as Þórseðla's.

**Tech Stack:** three.js (`dist/vendor/three.module.js`), the remake engine (scene scheduler, director, actors, riding, locations, sfx/music), node test runner with `tests/chapter-harness.mjs` (`playUnattended`), CDP capture tools (`capture.mjs`, `chapter-video.mjs`), the bake page (`tools/bake/bake-character.mjs`), ElevenLabs v4 voices through `voice-lines.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md` (Icelandic; the binding authority). Script: `docs/superpowers/specs/2026-10-28-handrit-leiksins.md`. The festival (`2026-11-21-stjornuhatidin-design.md`) is a later plan; it builds the top alone through the interface Task 8 fixes. Chapter 5 (`chapters/kafli5.js`, plan `2026-11-07-kafli-5-sloedla.md`) is the model for everything here.

## Global Constraints

- Work on branch `kafli6-gramedla` in worktree `C:/Risaeðla/dino-kafli6-gramedla`, cut from main, dev server port 4340 (launch entry `kafli6` in `C:/Risaeðla/.claude/launch.json`, serving that worktree). Nothing is merged into main or pushed unless the owner says so.
- Builders commit WIP often (at least every 20 minutes) and write a one-line progress note per step in `.superpowers/sdd/kafli6/progress.md`; after each chunk the owner gets a video and stills at 1280x800 and 800x1280 and decides before the next chunk starts. No reviewer agents.
- Child-facing text is Icelandic and copied verbatim from the spec (this plan's WORDS, Task 6). Line ids are `k6_<speaker>_<name>`, speakers `mosi`, `egill`, `sloedla`, `flugedla`; the line set is `kafli6`. Grameðla has no lines: she roars, snorts and nods.
- The child can never fail and nothing says no. A child who touches nothing is carried the whole way by the help: stones at 6, 12 and 18 s, prints at 8 and 16 s, the call's direction at 6, 12 and 18 s, Mosi's own roar after 6 s; once the help has done a step itself the waits are halved. Five stones, six prints, three rounds of the call, the answer never from the same direction twice in a row. Nothing threatens: the ford is shallow and far from the lip, no drop is seen, the cloud is bright, Mosi is curious and never afraid. Length: about 7.5 minutes for a child who touches nothing; never over 10.
- Performance per key shot on the `tablet` preset (Iris Xe, both sizes): GPU median ≤ 6.0 ms (`__benchmark(120)`), ≤ 100 draw calls, ≤ 250k triangles (STYLE.md §11). Never more than three big characters in a frame outside scene 1. Measure only when no other session is capturing.
- Physical sounds are real recordings (Freesound CC0 or CC BY, credited in `assets/audio/kafli6/CREDITS.md`). Ask the owner before any download, giving the name, source and size. No Claude-drawn art and no new models: the models in `assets/characters` and `assets/critters`, the game's own rocks and plants (`world/forest/species.js`); anything new comes from the owner's Tripo.
- Voices follow the repo's `CLAUDE.md`: `voice-lines.mjs` only, `--dry` first, Ný 3 for every new take of Mosi, `fixes` on every line with its own say/context, the owner's yes/no page imported with `heard.mjs`, `pronunciation.json` edited only with node. Never print, paste or log `ELEVENLABS_API_KEY`.
- Never touch `design/` or `dist/` (except reading `dist/vendor`). Every file keeps its own line endings (`.gitattributes * -text`; `remake/main.js`, `remake/engine/book/book.js`, specs and plans are CRLF): check `git diff --stat` before each commit.
- Tests run from the repo root: `node --import ./remake/tests/setup.mjs --test --test-reporter=tap remake/tests/<file>.test.mjs`; the whole suite with `npm run test:remake`.

## Review Focus

1. **An upright tablet (800x1280) and the three tap layouts:** at each step the stones are in frame and no two tap circles overlap; the next print is in the print camera; in the call the three glows lie one in each third of the screen's width and Mosi can be tapped. Pinned in Task 1 (`kafli6-route.test.mjs`: "upright and wide: ..." at aspects 0.625 and 1.6) and played in Task 6.
2. **The book or a hidden tab in the middle of a task:** the help's waits stand still with the game clock in all three tasks, and the cloud is as thick after the pause as before. Pinned in Task 2 ("time that does not pass holds the help"), Task 5 and Task 6 (the harness's `pauses`).
3. **A tap at the wrong moment:** a stone while Mosi is in the air, the next print while he says a number, a direction before she has answered or while she roars, Mosi while he walks. Each has one written outcome; none is counted twice and none leaves a task waiting for ever. Pinned in Task 3 (stones, prints) and Task 4 (call).
4. **Reduced motion:** the cloud fades instead of flying out, a wrong tap brightens the cloud instead of swirling it, the camera does not tremble at her steps, and the chapter still plays to the end. Pinned in Task 5 and Task 6.
5. **Chapter 6 played again after its star:** it plays as the first time, no second star, map piece f not recorded twice, and the save still opens chapter 6. Pinned in Task 14.

## File Structure

| File | Responsibility |
| --- | --- |
| `remake/chapters/kafli6-route.js` (new) | The places as data: the ford and its stones, the prints, the call's geometry, where everyone stands, the shots and who each is for. Pure data and small pure helpers. |
| `remake/chapters/kafli6-help.js` (new) | The help ladder the three tasks share (`createHelp`) and the call's seeded directions (`callDirections`). |
| `remake/chapters/kafli6-stones.js`, `kafli6-prints.js`, `kafli6-call.js` (new) | Tasks 1, 2 and 3 as state machines: taps in, events out. |
| `remake/chapters/kafli6-mosi.js` (new) | Mosi's code-made motion: the little roar, the hop between stones, pointing with his head, running beside her. |
| `remake/chapters/kafli6-gramedla.js` (new) | Her life: the shape in the glow, stepping out, tilting, bowing and sniffing, the roar that blows the cloud away, the nod, head down, the seat, the tramp up. |
| `remake/chapters/kafli6.js` (new) | The chapter: scenes 1–7, `WORDS`, the `chapter` export; drives the machines and turns their events into light, sound and motion. |
| `remake/chapters/kafli6-demo.js`, `gramedla-haus.js`, `fjall-toppur.js` (new) | Never part of the game: a child's hands for the owner's videos (`?kafli6=pikk`), wrong taps included; look-check pages for Egill on her head and for the top alone with the six friends stood on it. |
| `remake/chapters/kafli5-place.js` (new), `kafli5.js` (modify) | `buildPool`: chapter 5's pool as a place both chapters build; `kafli5.js` uses it and gets `next: 'kafli6'` (Task 14). |
| `remake/chapters/kafli2-trail.js`, `world/props/mud-prints.js`, `world/ardalur/index.js`, `engine/save.js` (modify) | `egillTaps` exported; `shape: 'theropod'` (her three-toed print) and a print's `water`; `createArdalur`'s `at` takes one spot or a list; `defaultChapter` knows chapter 6. |
| `remake/world/fjall/index.js`, `slope.js`, `belt.js`, `top.js`, `cloud.js` (new) | The mountain: three stages and the cloud. The festival builds `createTop` alone. |
| `remake/world/props/stepping-stones.js` (new) | The ford's stones: tap targets, glitter, wobble, rings. |
| `remake/engine/light-blend.js`, `engine/pose/lean.js` (new), `engine/looks.js`, `chapters/gramedla3d/pose.js` (modify) | A look set while the game runs, and `LOOKS.lowSun`, `redGold`, `inCloud`, `sunset`; the lean of "Grameðla kemur!" as a shared engine file that `pose.js` builds on. |
| `remake/tools/bake/tailed-biped-clips.js` (modify), `assets/characters/trex.glb`, `trex-source.json` (re-baked) | Her `stride` clip. |
| `remake/engine/audio/sfx.js`, `tools/audio-lines.mjs` (modify), `tools/kafli6-sounds.mjs`, `assets/audio/kafli6/` (new) | The picked recordings as samples; `kafli6` in `SETS`; `lines-source.json`, the lines, `hljod/`, `CREDITS.md`. |
| `remake/tests/kafli6-route`, `kafli6-help`, `kafli6-stones`, `kafli6-prints`, `kafli6-call`, `fjall`, `light-blend`, `kafli6-gramedla`, `kafli6-lines`, `kafli6` `.test.mjs` (new) | Tests per unit; `looks`, `trex`, `fen`, `ardalur`, `riding`, `sfx`, `save`, `kafli5` tests modified where named. |

**Departures from the spec (rulings, spec §8 and §10):**
- **Files.** The spec's seven new files are kept. Added: `kafli6-help.js` (one ladder for three tasks), `kafli6-mosi.js`, `kafli6-demo.js`, two look-check pages, `engine/light-blend.js` and `engine/pose/lean.js` (engine work does not belong in a chapter), and `kafli5-place.js` (chapter 5 keeps its pool's build options private).
- **The prints do not call chapter 2's `waitForPrint`:** it and `PRINT_WAIT` are private to `kafli2-trail.js` and tied to ten prints and chapter 2's lines. The ladder gives the same two waits; `egillTaps` is exported and used again.
- **Halving.** After the help has done a step itself, that task's waits (and Mosi's 6 s before his own roar) are halved until the child next taps right, as chapter 2's `quick`; each task starts whole. The spec says only "halved"; the owner sees it in the untouched video. **A wrong tap never moves the help.** It brings the hint forward, and the step is still done by itself `auto` seconds after it was first wanted, so wrong taps cannot hold a task.
- **Wrong moments** (Review Focus 3): a stone tapped while Mosi is in the air does nothing; the next print tapped while he says a number is kept and counts when he has said it; a direction tapped before she answers does nothing, tapped while she roars it counts; Mosi tapped outside his question does nothing.
- **The sun stands still.** Its place is compiled into the fog and given once to the sky and the lights (`engine/fog.js`, `main.js`), so the chapter has one sun (azimuth 215 as chapter 5, elevation 10) and the afternoon wearing on is told by colour, a look per place. On the top the sea of cloud's western bank rises to meet the sun (first value: 8 degrees up from the middle). If the owner wants the sun itself lower after chunk 2's stills, moving it at a place change is its own task.
- **Pool and ford are one place,** so scene 1 goes to scene 2 under a short black with nothing built. The valley makes its own waterfall (`ardalur.waterfall`); the ford calls no `createWaterfall`. **Where the stages stand.** The slope is at real coordinates on the far land's western ridge (where chapter 4's flight saw her walk) and shows the far land as its view. The belt and the top are stages in coordinates of their own with their ground at y 0 to 3, so the fog's compiled height falloff leaves the cloud whole.
- **Her print.** `mud-prints.js` draws a sauropod's hind print with a front crescent and water. Hers is three-toed: `shape: 'theropod'`, drawn as the sauropod's is (the mud's own grid, in code, from a real Tyrannosaurus track's measures). First size 5 (4 m long: Mosi's front feet stand in it); a second still at 11 (9 m: all of Mosi, who is 8.5 m, in it). The owner picks (spec §10).
- **Lines.** „Þarna flugum við upp með Flugeðlu!“ has no speaker in the spec: it is Egill's (he flew, Mosi ran). The count is chapter 2's: „Eitt! Tvö! Þrjú! Fjögur! Fimm! Sex!“ (spor is neuter; recorded and approved there), said with chapter 2's takes `k2_mosi_1` to `k2_mosi_6`, so the count has no lines of its own in WORDS and nothing is recorded for it. **No `s.place('gramedla')`:** her card, her video and the map's mist open by the star `k6_gramedla` already (`cards.json`, `videos.js` `altUnlock`, `map-page.js`).
- **Music.** Mosi's travel theme is "Dino Trail" (`theme: 'kafli2/theme.json'`), lowered to nothing in the cloud and brought back at the roar with `world.music.setLevel`; whether "stærra" needs a new arrangement is asked in Task 12.
- **Chunk 1 is grey** in the mountain's stages, the stones and her motion (her three clips, no lean, no seat). The pool, the valley and Mosi's saddle are real already.

## Chunk 1: The grey chapter

### Task 1: Worktree, the chapter's places as data, the valley round two spots

**Files:**
- Create: `remake/chapters/kafli6-route.js`, `remake/chapters/kafli5-place.js`
- Modify: `remake/world/ardalur/index.js`, `remake/chapters/kafli5.js`, `C:/Risaeðla/.claude/launch.json` (entry `kafli6`, port 4340)
- Test: `remake/tests/kafli6-route.test.mjs`, `remake/tests/ardalur.test.mjs`

**Interfaces:**
- Consumes: `createRoute()` → `route.river.at(d)` → `{ x, z, level, half, dir, d }` (d grows upstream), `route.river.falls` (the lip's d), `FAR_POOL` (`chapters/kafli4-route.js`); `createArdalur(world, { grey, route, at, critters, views, keep, choir })`, `SIGHT` (`world/ardalur/index.js`); `FLOW.lip` (`world/ardalur/river.js`); `SHOTS`, `SPOTS`, `WADE`, `WEST`, `POOL_LIFE` (`chapters/kafli5-pool.js`); `LIMITS` (`engine/camera/director.js`).
- Produces:
  - `createArdalur(..., { at })`: `at` is `[x, z]` or `[[x, z], ...]`; the sections within `SIGHT` of any of them are built at once. `buildPool(world, { at = [], views = [], keep = [] } = {})` → `Promise<place>`: the pool exactly as `kafli5.js` builds it now (`ROUTE`, `KEEP`, `viewsOf` move here; `kafli5.js` imports them back), with more spots, views and kept ground added.
  - `ROUTE`; `FORD = { d, centre, from, to, level, half }` with `d = ROUTE.river.falls + 45`, `from` on the north bank, `to` on the south.
  - `STEPS`: five `{ stones: [{ id: 'stone-<step>-<k>', at: [x, z], right }] }` with 3, 2, 3, 2, 3 stones, one `right` in each, listed left to right as the step's shot sees them; the right stones in a row from `FORD.from` to `FORD.to`, 3.4 to 3.8 m apart. `STONE = { right: { across: 3, up: 0.35, tap: 1.6 }, wrong: { across: 1.4, up: 0.25, tap: 1.0 } }` (m; first values). `FALLS_LOOK = 2` (after landing on step index 2 they look down the falls).
  - `BELT_PATH`, `PRINT_SIZE = 5`, `PRINT_PACE = 9`, `PRINTS`: six `{ position, heading, foot }` along the path, left and right in turn; `mosiAt(k)` → `{ x, z, heading }`; `CLOUD_BY_PRINT = [0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]` (the cloud's level before any print and after each). `CALL = { reach: 7, glow: 22, angle: 40, her: [60, 30, 12] }`; `callStand(round, walked)` → `{ x, z, heading }`; `directionPoint(stand, direction)` → `[x, y, z]` (`glow` m from him, `angle` degrees left, 0, or right); `herAt(stand, direction, round)` → `[x, z]`.
  - `SHOTS = { ardalur, hlid, sky, toppur }` (named: `pool_west`, `pool_saddle`, `ford_arrive`, `falls_look`, `ford_across`, `slope_ride`, `view_east`, `clouds_up`, `print_first`, `she_comes`, `sniff_close`, `roar_wide`, `star_up`, `head_down`, `on_her_head`, `climb_side`, `above_clouds`, `top_wide`), `SHOWS` (shot → who must be in frame), and `stepShot(k)`, `printShot(k)`, `callShot(stand)` (still, 9 m behind Mosi, 3.2 m up, on his heading).

- [ ] **Step 1: Worktree and launch entry.** `git worktree add C:/Risaeðla/dino-kafli6-gramedla -b kafli6-gramedla main`; copy the voice cache in (`cp -n` of `.tools/elevenlabs-remake/*` from main's checkout); add the launch entry; open `http://localhost:4340/remake/index.html`.
- [ ] **Step 2: Write the failing tests:**

```js
test('the ford is above the falls and clear of the quick water at the lip', () => {
  assert.equal(FORD.d, ROUTE.river.falls + 45);
  assert.ok(FORD.d - ROUTE.river.falls > FLOW.lip);
  assert.equal(FORD.level, ROUTE.river.at(FORD.d).level);
});
test('five steps of 3, 2, 3, 2, 3 stones, one right in each; the right ones cross the river 3.4 to 3.8 m apart', ...);
test('six prints, right and left in turn, PRINT_PACE apart; mosiAt(0) has his front feet in the first', ...);
test('upright and wide: each step\'s stones are in stepShot(k), their tap circles apart', ...); // Review Focus 1
// every stone of step k and its STONE tap radius projected at aspects 1.6 and 0.625: inside the frame and above its bottom 15 %, centres at least r1 + r2 apart in pixels; printShot(k) likewise holds print k and Mosi's head
test('upright and wide: the three glows lie one in each third of callShot, and Mosi is in it', ...); // Review Focus 1
// for every stand the directions allow: directionPoint's screen x in (0.04, 0.30), (0.37, 0.63), (0.70, 0.96) of the width
test('every shot keeps the director quiet (LIMITS) and shows who SHOWS names', ...);
test('createArdalur at two spots builds the sections within SIGHT of either', ...); // ardalur.test.mjs
test('buildPool with nothing more builds what chapter 5 built: the same sections, keep and views', ...);
```

- [ ] **Step 3:** Run `node --import ./remake/tests/setup.mjs --test --test-reporter=tap remake/tests/kafli6-route.test.mjs`; see it fail (`Cannot find module`). **Step 4:** Implement. **Step 5:** Run it with `ardalur.test.mjs`, `kafli5.test.mjs`, `kafli5-pool.test.mjs`; see them pass. **Step 6:** Commit: "kafli6: the ford, the prints and the call as data, the valley round two spots".

### Task 2: The help ladder and the call's directions

**Files:**
- Create: `remake/chapters/kafli6-help.js`
- Test: `remake/tests/kafli6-help.test.mjs`

**Interfaces:**
- Consumes: `seededRandom(seed)` (`engine/random.js`).
- Produces:
  - `createHelp({ hint, name = null, auto })` → `{ want(time), update(time) → level[], wrong(time) → 'hint' | null, done(by), times, quick }`. `want` starts a step; `update` returns the levels (`'hint'`, `'name'`, `'auto'`) come due since the last call, each once a step, in order; `wrong` gives `'hint'` at once if the step has not had it and never moves `auto`; `done('auto')` makes the next steps quick (every wait times 0.5), `done('child')` whole again; `times` are the waits now in force. Time is whatever `update` is given.
  - `DIRECTIONS = ['left', 'ahead', 'right']`; `callDirections(seed, rounds = 3)`: drawn with `seededRandom(seed)`, never the same twice in a row.

- [ ] **Step 1: Write the failing tests:**

```js
test('hint, name and auto come at their seconds, once each, in order', () => {
  const help = createHelp({ hint: 6, name: 12, auto: 18 }); help.want(100);
  assert.deepEqual([105.9, 106, 117.9, 118, 200].map(t => help.update(t)), [[], ['hint'], ['name'], ['auto'], []]);
});
test('a ladder with no name has two rungs: { hint: 8, auto: 16 } gives both at 16 s', ...);
test('once the help has done a step the waits are halved, and whole again when the child taps right', () => {
  const help = createHelp({ hint: 6, name: 12, auto: 18 }); help.want(0); help.update(18); help.done('auto');
  assert.deepEqual(help.times, { hint: 3, name: 6, auto: 9 });
  help.want(20); help.done('child');
  assert.deepEqual(help.times, { hint: 6, name: 12, auto: 18 });
});
test('a wrong tap brings the hint forward and never moves auto', () => {
  const help = createHelp({ hint: 6, name: 12, auto: 18 }); help.want(0);
  assert.deepEqual([help.wrong(2), help.wrong(3)], ['hint', null]);
  assert.deepEqual([help.update(17.9), help.update(18)], [['name'], ['auto']]);
});
test('time that does not pass holds the help', ...); // Review Focus 2: update(5) a hundred times gives nothing
test('the directions: three of the three, never the same twice in a row, the same for the same seed, each first at least 40 times of 200 seeds', ...);
```

- [ ] **Step 2:** Run `node --import ./remake/tests/setup.mjs --test --test-reporter=tap remake/tests/kafli6-help.test.mjs`; see it fail. **Step 3:** Implement. **Step 4:** Run; see it pass. **Step 5:** Commit: "kafli6: the help ladder and the call's directions".

### Task 3: The stones and the prints, as state machines

**Files:**
- Create: `remake/chapters/kafli6-stones.js`, `remake/chapters/kafli6-prints.js`
- Test: `remake/tests/kafli6-stones.test.mjs`, `remake/tests/kafli6-prints.test.mjs`

**Interfaces:**
- Consumes: `createHelp` (Task 2); `STEPS` (Task 1).
- Produces (both shaped as `createChoir`: `start`, taps, `update(time)`, `events()` draining `{ type, time, ... }` in order, `state()`):
  - `STONE_HELP = { hint: 6, name: 12, auto: 18 }`; `createStones({ steps = STEPS, help = STONE_HELP } = {})` → `{ start(time), tap(id, time) → { counted }, landed(time), update(time), events(), state() → { step, waiting, done } }`. Events: `'want' { step, stone }`, `'hop' { step, stone, by: 'child' | 'mosi' }`, `'wobble' { step, stone }`, `'help' { level, step, stone }`, `'done'`. Rules: a step is wanted from `start` and from each `landed`; a `'hop'` ends the waiting until `landed`, and the fifth `landed` gives `'done'`. The right stone: `'hop'` by `'child'`. A wrong stone of the step: `'wobble'`, and `'help'` hint if the ladder gives it. A stone of another step, or any tap while not waiting: `{ counted: false }`, no event. `'help'` auto is followed by `'hop'` by `'mosi'`.
  - `PRINT_HELP = { hint: 8, auto: 16 }`; `COUNT = 1.6` (s Mosi takes over a number); `createPrints({ count = 6, help = PRINT_HELP } = {})` → `{ start(time), tap(index, time, where = null) → { counted }, update(time), events(), state() → { next, waiting, done } }` (`index` null: the cloud, a rock). Events: `'want' { index }`, `'count' { index, by: 'child' | 'egill' }`, `'swirl' { where }`, `'help' { level, index }`, `'done'`. Rules: a tap on `next` gives `'count'` by `'child'`; then `COUNT` s are busy, the following `'want'` comes as they end, and `'done'` after the sixth. A tap on `next` while busy is kept (one) and counts as the busy time ends. Any other tap: `'swirl'`, and `'help'` hint if the ladder gives it. `'help'` auto is followed by `'count'` by `'egill'`.

- [ ] **Step 1: Write the failing tests:**

```js
// kafli6-stones.test.mjs (update in 0.1 s steps, landed() 1.5 s after every hop)
test('a child who taps nothing crosses on the help: the first hop at 18 s, each after 9 s on from its landing, all by Mosi; before the first, the glitter at 6 s and the name at 12 s', ...);
test('a wrong stone wobbles, is not counted, the right one glitters at once, and the step is still wanted', ...);
test('a child who taps a wrong stone every 2 s for ever still crosses', ...);
test('a tap while Mosi is in the air does nothing; the next step is wanted only when he has landed', ...); // Review Focus 3
// kafli6-prints.test.mjs
test('six prints are counted in order and done comes 1.6 s after the sixth', ...);
test('a child who taps nothing: Egill finds the first at 16 s and each after 8 s on; the help comes at 8 and 16 s', ...);
test('a tap on the cloud swirls there, counts nothing, and the next print glitters at once', ...);
test('the next print tapped while Mosi says a number is kept and counts as he ends', ...); // Review Focus 3
test('two taps on the next print while he says a number count one print, not two', ...); // Review Focus 3
test('time that does not pass holds both tasks', ...); // Review Focus 2
```

- [ ] **Step 2:** Run both files; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass. **Step 5:** Commit: "kafli6: the stones' and the prints' rules".

### Task 4: The call, as a state machine

**Files:**
- Create: `remake/chapters/kafli6-call.js`
- Test: `remake/tests/kafli6-call.test.mjs`

**Interfaces:**
- Consumes: `createHelp`, `callDirections`, `DIRECTIONS` (Task 2).
- Produces:
  - `CALL_HELP = { hint: 6, name: 12, auto: 18 }`; `ASK = 6` (s Mosi waits for the tap); `ANSWER = { mosi: 1.8, quiet: 1.4, roar: 2.6 }` (s: his little roar, the silence, her roar); `thirdOf(x, width)` → `DIRECTIONS[min(2, floor(3x / width))]` (a tap that landed on no target). `createCall({ rounds = 3, help = CALL_HELP, seed = 'kafli6-kall', directions = callDirections(seed, rounds) } = {})` → `{ start(time), tapMosi(time) → { counted }, tapDirection(direction, time) → { counted }, arrived(time), update(time), events(), state() → { round, phase: 'ask' | 'calling' | 'listen' | 'walk' | 'done', direction }, directions }`.
  - Events: `'ask' { round }`, `'call' { round, by: 'child' | 'mosi' }`, `'answer' { round, direction, again, strong }`, `'swirl' { direction }`, `'again' { round }` (Mosi: „Hlustum aftur!“), `'help' { level: 'name', round, direction }` (he points with his head), `'walk' { round, direction, by }`, `'done'`.
  - Rules: in `'ask'`, `tapMosi` gives `'call'` by `'child'`, and `ASK` s (halved while the ladder is quick) give it by `'mosi'`. `'calling'` lasts `ANSWER.mosi + ANSWER.quiet`; a direction tapped in it does nothing. Then `'answer'` and `'listen'`, the ladder wanted from the moment her roar begins. The right direction: `'walk'` by `'child'`. A wrong one: `'swirl'`, and, unless an answer began less than `ANSWER.roar` s ago, `'again'` and `'answer'` (`again` true) from the same direction. The ladder's hint is `'answer'` (`again` and `strong` true), its name `'help'`, its auto `'walk'` by `'mosi'`. In `'walk'` nothing counts until `arrived`: then the next `'ask'`, or `'done'` after the third. `tapMosi` outside `'ask'` does nothing.

- [ ] **Step 1: Write the failing tests:**

```js
test('three rounds, and no round answers from the direction of the round before', ...); // 50 seeds
test('a child who taps nothing: Mosi roars after 6 s, she answers 3.2 s later, he walks 18 s after that; rounds two and three on halved waits (3 and 9 s)', ...);
test('the help: she roars again and stronger at 6 s, Mosi points at 12 s, he walks at 18 s', ...);
test('a wrong direction swirls, Mosi says „Hlustum aftur!“ and she answers again from the same direction', ...);
test('a child who taps a wrong direction every second for ever still finishes; she never answers twice inside 2.6 s', ...);
test('a direction tapped before she has answered does nothing; tapped while she roars it counts', ...); // Review Focus 3
test('taps on Mosi or a direction while he walks do nothing; the next round asks when he has arrived', ...); // Review Focus 3
test('thirdOf: of 1280, 0 and 426 are left, 427 and 853 ahead, 854 and 1279 right', ...);
test('time that does not pass holds the call', ...); // Review Focus 2
```

- [ ] **Step 2:** Run `node --import ./remake/tests/setup.mjs --test --test-reporter=tap remake/tests/kafli6-call.test.mjs`; see it fail. **Step 3:** Implement. **Step 4:** Run; see it pass. **Step 5:** Commit: "kafli6: the call's rules (ask, answer, listen, walk)".

### Task 5: The proof: a cloud that thickens and blows away, and light that changes with the place

**Files:**
- Create: `remake/world/fjall/index.js`, `slope.js`, `belt.js`, `top.js`, `cloud.js` (the stages grey: bare ground in `GREY`'s colours), `remake/engine/light-blend.js`
- Modify: `remake/engine/looks.js`
- Test: `remake/tests/fjall.test.mjs`, `remake/tests/light-blend.test.mjs`, `remake/tests/looks.test.mjs`

**Interfaces:**
- Consumes: `world.scene.fog` (`FogExp2`: `density` and `color` are uniforms read every frame; the falloff and the fog's sun are compiled, `engine/fog.js`); chapter 3's `haze(c, factor, seconds)` and chapter 4's private `lightAt` as the models (both stay); the mist's card shader (`world/props/mist.js`); `createFarLand(world, route, { terrain, seed })` → `{ group, heightAt, show(on), update(t, camera) }` (`world/ardalur/far-land.js`); `createTerrain(route, { seed })`, `GREY` (`world/ardalur/terrain.js`); `blendLooks`, `LOOKS`; `world.effects.add({ label, update(dt) → boolean })`; `Handle` (`engine/handle.js`).
- Produces:
  - `LOOKS.lowSun` (the chapter's: `blendLooks(LOOKS.goldenAfternoon, LOOKS.evening, 0.35)`), `LOOKS.redGold` (the slope: the same at 0.65), `LOOKS.inCloud` (fog colour and both sky colours `#f1f3f0`, sun intensity 1.2, hemisphere 0.95), `LOOKS.sunset` (the top: `evening`'s colours, fog density 0.004); all four with the sun at azimuth 215, elevation 10.
  - `lightTo(world, look)`: sets what a look can change while the game runs (the sun's colour and intensity, the hemisphere, the fog's colour and density, the sky's colours and fog glow, the exposure) and nothing else. `easeLight(world, look, seconds)` → `Handle`, done when the light is there; a newer one takes over.
  - `FJALL = { ridge: [-2578, 120], top: { radius: 45, sea: -7 } }`; `createSlope(world, { grey = false, route = createRoute(), seed = 4 } = {})`, `createBelt(world, { grey = false, seed = 6, prints = [], printSize = 5 } = {})`, `createTop(world, { grey = false, seed = 6, radius = FJALL.top.radius } = {})`, each a place (`{ group, heightAt(x, z), update(dt, time), dispose() }`). The slope has `far` (its far land, shown) and `ledge` (`[x, z]`, east of `FJALL.ridge`); the belt has `cloud` and `prints` (`createMudPrints`'s); the belt's and the top's ground lies between y 0 and 3.
  - `CLOUD = { density: [0.02, 0.17], colour: '#f1f3f0', ease: 2.5, blow: 3 }`; `densityAt(level)`; `createCloud(world, { centre = [0, 0], radius = 60, heightAt = world.heightAt, seed = 6, reduced = false } = {})` → `{ group, level, setLevel(level, seconds = CLOUD.ease), liftAt(point, radius = 5), swirlAt(point), glow(point | null, strength), blowAway({ from, seconds = CLOUD.blow }) → Handle, update(dt, time), dispose() }`. With `reduced` (the chapter passes its `reducedMotion(world)`, as `kafli5.js` reads it), `swirlAt` brightens and `blowAway` fades. `dispose` gives the fog back as the look had it.
- **The way to try first (A):** the cloud is the engine's fog. `setLevel` eases `scene.fog.density` to `densityAt(level)` (level 0 sees about 115 m, level 1 about 13 m) and the chapter sets `LOOKS.inCloud` with `easeLight`, so fog and sky are one white. Cards (the mist's shader, normal blending, white, one draw call) carry only what moves: the swirl, the opening over a counted print, the golden glow (an additive disc that takes no fog), and the ring that flies out from her as `blowAway` eases the density down to `LOOKS.sunset`'s.
- **The fallback (B),** if A fails on the tablet preset (banding where fog meets sky, plants popping at the edge of sight, the falloff showing on her 5 m height): the fog stays the look's and the cloud is three shells of camera-facing cards at 8, 16 and 30 m (36 cards, one draw call) whose opacity is the level. Measure B's overdraw against the budget before choosing it. The interface holds for both.

- [ ] **Step 1: Write the failing tests:**

```js
test('the four looks have every field morning has, and one sun', () => {
  for (const name of ['lowSun', 'redGold', 'inCloud', 'sunset']) {
    assert.deepEqual(Object.keys(LOOKS[name]).sort(), Object.keys(LOOKS.morning).sort());
    assert.deepEqual([LOOKS[name].sun.azimuth, LOOKS[name].sun.elevation], [215, 10]);
  }
  assert.equal(LOOKS.inCloud.fog.color, LOOKS.inCloud.sky.horizon);
});
test('lightTo sets the sun, the hemisphere, the fog and the sky to the look and leaves the sun where it is', ...);
test('easeLight is half way after half its seconds, there at the end, and stands still with no update', ...);
test('the cloud reaches its level in the asked seconds and the fog\'s density is densityAt(level)', ...);
test('the cloud is as thick after ten seconds without an update as before', ...); // Review Focus 2
test('blowAway brings the level to 0 within CLOUD.blow and the cards fly out from `from`; reduced: they only fade', ...); // Review Focus 4
test('dispose gives the fog back: the look\'s own density and colour', ...);
test('the belt\'s and the top\'s ground lies between 0 and 3 m; the slope\'s ledge is on the far land, east of the ridge', ...);
```

- [ ] **Step 2:** Run the three files; see them fail. **Step 3:** Implement A. **Step 4:** Run; see them pass.
- [ ] **Step 5: Prove it on the page.** A throwaway review script in the belt (Mosi standing in it): stills at levels 0.25, 0.5 and 1 and a 6 s clip of `blowAway`, at both sizes, each benched (`capture.mjs --bench 120`). If A does not hold, implement B behind the same interface and repeat. Note in the progress file which stands, with its numbers.
- [ ] **Step 6:** Commit: "kafli6: the mountain's grey stages, the cloud and the light between places".

### Task 6: kafli6.js, all seven scenes in grey, and the first two videos

**Files:**
- Create: `remake/chapters/kafli6.js`, `kafli6-demo.js`, `kafli6-mosi.js` (the little roar and the hop only), `kafli6-gramedla.js` (placeholder: hidden, placed, her `idle`, `walk` and `roar`), `remake/world/props/stepping-stones.js` (grey: flat discs)
- Modify: `remake/chapters/kafli2-trail.js` (`export` on `egillTaps`)
- Test: `remake/tests/kafli6.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–5; `mapMoment(s, c, { pieces, line, speak })` (`engine/scene/map-moment-scene.js`); `s.target`, `s.onTap(name, fn)` (`name` null hears a tap on no target: `{ name, x, y }`), `s.race`, `s.wait`, `s.until`, `s.sfx(name, { level, pan })`, `s.goTo(name, { fade, hold })`, `s.camera.cut`, `s.camera.handheld(level, { duration })`, `s.star(id, from)`, `s.journal.open`; `createSaddle`, `floatTo(rider, saddle, { duration })`, `ride(rider, saddle, { settle })` (`engine/riding.js`); `holdHer(c)`, `flyPath(s, c, held, { points, seconds })` (`chapters/kafli4-flugedla.js`); `createMudPrints(world, { prints, heightAt, size })` → `{ targets, glimmer, count, ... }`; `egillTaps(s, c, k)`; `createCritters(world, { spots, heightAt, ripple })` (kind `'frog'`); `splash(world, point)`; `world.music.setLevel(value, seconds)`; `playUnattended` (its `onFrame`, `pointer.tap(name, at)`, `pauses`, `reduced`, `aspect`, `savedWith`).
- Produces:
  - `export const chapter = { id: 'kafli6', title: 'Boð til Grameðlu', next: null, look: 'lowSun', theme: 'kafli2/theme.json', start: 'ardalur', locations, prepare: ['hlid', 'sky', 'toppur'], actors: { mosi, egill, sloedla, flugedla, gramedla }, cast, lines, startShot: 'pool_west', warmUp, shots: {}, *script(s) }` with `locations = { ardalur: { build: world => buildPool(world, { at: [FORD.centre] }), shots: SHOTS.ardalur }, hlid: { build: world => createSlope(world, { grey: true }), shots: SHOTS.hlid }, sky: { build: world => createBelt(world, { grey: true, prints: PRINTS, printSize: PRINT_SIZE }), shots: SHOTS.sky }, toppur: { build: world => createTop(world, { grey: true }), shots: SHOTS.toppur } }`. `cast` names the four speakers with chapter 5's colours; she has no caption and is hidden until scene 5.
  - `WORDS` (verbatim from the spec):

```js
const WORDS = {
  k6_sloedla_follow: 'Við komum á eftir ykkur. Sjáumst uppi á fjalli!', k6_flugedla_call: 'Ég kalla á allan skóginn. Flýtið ykkur, sólin er að lækka!',
  k6_mosi_come: 'Komdu, Egill. Lengsta ferðin bíður.',
  k6_mosi_map: 'Þarna uppi á fjallinu, í skýjunum, býr Grameðla. Og þar er Stjörnuhátíðin haldin, næst stjörnunum.',
  k6_egill_hers: 'Á fjallinu hennar?', k6_mosi_why: 'Já. Þess vegna verðum við að bjóða henni!',
  k6_mosi_river: 'Áin er breið hérna. En sjáðu steinana! Hvaða steinn er næstur, Egill?',
  k6_mosi_wobble: 'Úps, sá vaggar!', k6_mosi_flat: 'Þessi stóri, flati!',
  k6_egill_flew: 'Þarna flugum við upp með Flugeðlu!', k6_mosi_across: 'Við komumst yfir! Vel valið, Egill.',
  k6_egill_glade: 'Sjáðu, Mosi! Þarna er rjóðrið þar sem við hittumst!', k6_mosi_thorsedla: 'Og þarna er Þórseðla. Hún er lögð af stað.', k6_mosi_clouds: 'Og þarna uppi… eru skýin.',
  k6_mosi_print: 'Egill… þetta er spor. Ég kemst ofan í það!', k6_egill_huge: 'Hún er RISASTÓR!',
  k6_mosi_six: 'Sex spor. Og hún er sjötti vinurinn!', k6_mosi_end: 'Sporin enda hér. Ég sé ekkert. Ég kalla á hana. Hjálpaðu mér, Egill!',
  k6_mosi_listen: 'Hlustum aftur!', k6_egill_gramedla: 'Grameðla!', k6_egill_hi: 'Hæ, Grameðla!',
  k6_mosi_invite: 'Halló, Grameðla! Stjörnuhátíðin er í kvöld, hér á fjallinu þínu. Viltu halda hana með okkur?',
  k6_mosi_yes: 'Hún segir já!', k6_mosi_gift: 'Öskrið þitt verður merkið, Grameðla. Þegar þú öskrar kvikna stjörnurnar!',
  k6_mosi_star: 'Sjötta stjarnan! Nú eru allir komnir!', k6_mosi_wait: 'Bíddu… eftir… mér!',
  k6_egill_above: 'Við erum ofan við skýin!', k6_mosi_room: 'Hér… er nóg pláss… fyrir alla!',
};
```

  - Scenes per spec §4, `mark(c, n)` at each, every line through `say(s, c, speaker, id)`, every tap target through `aim(s, c, name, point, radius)` (as `kafli5.js`). `c.taskLog`: every machine event as `{ task: 'stones' | 'prints' | 'call', ...event }`.
    1. The pool as chapter 5 leaves it; Slóeðla's and Flugeðla's lines, she flies east (`flyPath`, 6 s, then hidden); Egill into the saddle (`floatTo` 2.6 s, `ride`); `k6_mosi_come`; `mapMoment` with pieces `['f']`, its `speak` saying `k6_mosi_map`, `k6_egill_hers`, `k6_mosi_why`. Slóeðla is hidden from scene 2 on.
    2. Black 0.6 s, the ford. `createStones`: `'hop'` → `hopTo`, a ring, then `landed`; `'wobble'` → the stone rocks, its frog jumps in with `splash`, `k6_mosi_wobble`; hint → `stones.glitter`; name → `k6_mosi_flat`. After landing on step `FALLS_LOOK`: `falls_look`, `k6_egill_flew`, 4 s. `'done'` → `ford_across`, `k6_mosi_across`.
    3. `s.goTo('hlid')`, `easeLight(world, LOOKS.redGold, 4)`; the ride up, the turn on the ledge, `view_east` with its two lines, the turn to the mountain, `clouds_up`, `k6_mosi_clouds`.
    4. `s.goTo('sky')`, `easeLight(world, LOOKS.inCloud, 3)`, `cloud.setLevel(CLOUD_BY_PRINT[0])`, the music to 0 over 3 s; Mosi steps into print 0; two lines. `createPrints`: only `next` is a target, a tap on no target is `tap(null, time, where)`; `'count'` → `cloud.liftAt`, `prints.count`, chapter 2's `k2_mosi_<n>` (those six in the chapter's `lines`), `cloud.setLevel(CLOUD_BY_PRINT[n])`, Mosi walks to `mosiAt(n)`; `'swirl'` → `cloud.swirlAt`; hint → `prints.glimmer`; auto → `egillTaps`. At the sixth the ground thuds (`s.camera.handheld(0.6, { duration: 0.4 })`, not with reduced motion). `k6_mosi_six`.
    5. `callShot(stand)`, `k6_mosi_end`. `createCall`: `'ask'` → Mosi a target; `'call'` → `smallRoar`; `'answer'` → `gramedlaRoar` at the round's level and the direction's pan (first values: 0.25, 0.55, 1.0; −0.7, 0, 0.7) and `cloud.glow(directionPoint(stand, direction), strength)`; in `'listen'` three targets on the glow points and `thirdOf` for a tap on none; `'again'` → `k6_mosi_listen`; name → `pointWithHead`; `'walk'` → Mosi walks `CALL.reach` m, then `arrived` and the next `callShot`. Round 3's answer has `k6_egill_gramedla`.
    6. She walks out two steps and stops over them; `k6_egill_hi`, `k6_mosi_invite`; her `roar`, `cloud.blowAway({ from: her })` 1.1 s into it, `easeLight(world, LOOKS.sunset, 3)`, the music back to 1 over 2 s; `k6_mosi_yes`, `k6_mosi_gift`; `s.star('k6_gramedla', STAR_FROM)` (over her head), `k6_mosi_star`.
    7. Her head or Egill tapped, or 6 s: Egill floats to a point over her head. `climb_side` with `k6_mosi_wait`; `s.goTo('toppur')`, `above_clouds` with `k6_egill_above`; `top_wide` with `k6_mosi_room`. The end as chapter 5's: `s.journal.open('dinosaurs', { nod: 'gramedla' })`, then the map.
  - `demoAsked()` (`?kafli6=pikk`) and `startDemoChild(s, c)` as `kafli5-demo.js`. It taps: a wrong stone first at steps 1 and 3, the right one after the glitter at step 2 and after Mosi names it at step 4; the cloud before print 2, print 4 while Mosi says "Þrjú!", print 5 after the glitter; Mosi in rounds 1 and 3, a direction before she answers in round 1, the wrong direction first in round 2; the star; her head.

- [ ] **Step 1: Write the failing tests:**

```js
test('nobody touching: the chapter plays to its end in under 10 minutes and gives the star k6_gramedla', ...); // playUnattended(kafli6, { seeking: false, limit: 620, shaped: true })
test('nobody touching: five hops by Mosi, six counts by Egill, three walks by Mosi, each on its help', ...); // c.taskLog
test('a child who taps right at once: no help event in any task, and the three tasks take under 180 s together', ...);
test('a child who taps wrong every 2 s for ever (a wrong stone, the cloud, a wrong third) still ends the chapter in under 10 minutes', ...);
test('the prints are six and the call three rounds, each from a new direction', ...);
test('the cloud thickens with every print (CLOUD_BY_PRINT) and is gone within 3 s of her roar', ...);
test('the book open for 30 s in each task: the same help comes 30 s later and the cloud is as thick after as before', ...); // Review Focus 2
test('reduced motion: no handheld, the cloud fades, a wrong tap brightens, and the chapter ends', ...); // Review Focus 4
test('upright (aspect 0.625): every aimed target is on the screen whenever its task waits', ...); // Review Focus 1
test('every line of WORDS is said at least once by the untouched and the wrong-tapping child together', ...);
test('outside scene 1 Slóeðla and Flugeðla are not shown, so never more than three big characters', ...);
```

- [ ] **Step 2:** Run `node --import ./remake/tests/setup.mjs --test --test-reporter=tap remake/tests/kafli6.test.mjs`; see it fail. **Step 3:** Implement. **Step 4:** Run; see it pass, with the suite.
- [ ] **Step 5:** Two videos: `node remake/tools/chapter-video.mjs --out qa/remake/kafli6/butur1-ekkert --chapter kafli6 --size 1280x800 --max 620 --sound --stats` (untouched) and the same with `--query "kafli6=pikk" --out qa/remake/kafli6/butur1-pikk`; phone copies `simi.mp4` (960x600, h264 ~480 kbps, AAC 96 kbps); upright stills (800x1280) of the three tasks and of the cloud at prints 1, 3 and 6.
- [ ] **Step 6:** Commit, progress note, send both videos to the owner. Ask: the pacing, the three tasks, the cloud. **Do not start chunk 2 before his yes.**

## Chunk 2: The places

### Task 7: The ford and its stepping stones

**Files:**
- Modify: `remake/world/props/stepping-stones.js`, `remake/chapters/kafli6.js`, `kafli6-route.js` (spots and shots as the real place asks), `kafli6-mosi.js`
- Test: `remake/tests/kafli6-route.test.mjs`, `remake/tests/kafli6.test.mjs`

**Interfaces:**
- Consumes: the valley's rocks (`library.get('rock' | 'rockSmall', variant, 1, { mossy })`, `world/forest/species.js`); `ardalur.waterfall`, `rainbowLevel(view, sunDir)` (`world/props/waterfall.js`); `ardalur.rippleAt`; `createCritters`.
- Produces: `createSteppingStones(world, { steps, level, heightAt = world.heightAt, library = null, sizes = STONE, grey = false, seed = 6 } = {})` → `{ group, targets: [{ name, point, radius }], topOf(id) → Vector3, frogSpot(id) → [x, y, z] | null, glitter(id | null), wobble(id) → Handle, update(dt, time), dispose() }`: the right stones the game's `rock` scaled broad and low, dry; the wrong ones `rockSmall`, wet and dark at the water line, a frog on each. `hopTo(s, c, point, { seconds = 1.1, height = 0.35 })` (`kafli6-mosi.js`): his walk with a bob laid over it (`actor.setOverlay`), his front feet on the stone, a ring as he lands. The ford's banks and the shots' lines kept clear (`buildPool`'s `keep`, `views`).

- [ ] **Step 1: Write the failing tests:** `'each right stone\'s top is dry (STONE.right.up over the river\'s level) and at least 2.8 m across'`, `'a wrong stone wobbles and comes to rest where it lay; its frog is in the water with a ring'`, `'from falls_look the rainbow shows (rainbowLevel > 0.5 under LOOKS.lowSun) and the lip is over 40 m away'`, `'nothing of Mosi jumps more than 8 degrees or 0.15 m in a frame while he crosses'`, `'Egill stays in the saddle through every hop (within 2 cm)'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass. **Step 5:** Commit: "kafli6: the ford above the falls and its stones".

### Task 8: The mountain: the slope and its view, the cloud belt and her prints, the top over the sea of cloud

**Files:**
- Modify: `remake/world/fjall/index.js`, `slope.js`, `belt.js`, `top.js`, `cloud.js`, `remake/world/props/mud-prints.js`, `remake/chapters/kafli6.js` (the places built real), `kafli6-route.js`
- Create: `remake/chapters/fjall-toppur.js`
- Test: `remake/tests/fjall.test.mjs`, `remake/tests/fen.test.mjs` (the prints), `remake/tests/kafli6.test.mjs`

**Interfaces:**
- Consumes: `createGroundMaterial(noise)`, `createPlantMaterials(world, { noise, leaf })` (`world/ardalur/look.js`); `createSpeciesLibrary(seed)` (`rock`, `rockSmall`, `bush`, `fern`, `flowers`); `createFarFriends(world, { friends, defer })` (`world/props/far-friends.js`); `FEN` (`world/forest/config.js`); STYLE.md §3 (the friends' lengths).
- Produces:
  - `createMudPrints(world, { ..., shape = 'sauropod' })`: `'theropod'` is three-toed with no front crescent, 0.8 m long at size 1; a print may carry `water: 'none' | 'pool' | 'rippling'` (default `'pool'`). Chapter 6: prints 1–3 `'none'`, 4 `'pool'`, 5 `'rippling'`, 6 `'none'` with pebbles that hop at the thud (`belt.pebbles.hop()`).
  - The slope: a path up to the ledge on the game's ground, low plants, the cloud's underside above; the view east is the far land (`far.show(true)`) with Þórseðla walking west on it at 8 times her size (first value) and the glade's lilac glow held on while Egill says his line (`slope.glade(on)`). The belt: ground rising gently along `BELT_PATH`, rocks and bushes lost in the white, `belt.summit` (the top's shape above, seen once the cloud is blown away).
  - **The top, as the festival builds it** (`locations: { toppur: { build: world => createTop(world), shots } }`): `createTop(world, { grey = false, seed = 6, radius = 45 } = {})` → `{ group, heightAt(x, z), update(dt, time), dispose(), centre: [0, 0], radius, edge(angle) → [x, z], wayUp(angle) → [[x, z] × 3], room: [{ friend, at: [x, z], r }], sea: { level, setGlow(v), wave({ from, strength, seconds }) }, veil: { setLevel(v) } }`. `edge` is the rim, where ground meets cloud; `wayUp` runs from under the sea to 8 m inside the rim (where a friend comes up); `room` is six discs, each half its friend's length, none overlapping, a 12 m circle free in the middle; `veil` is the last wisp chapter 6 climbs out of. Flat, grass and low plants, single rocks; the sea a flat layer of cards at `FJALL.top.sea`, its western bank rising to the sun. Nothing on it has light baked into its colour, so a night look can be set on it with `lightTo`.
  - `fjall-toppur.js` (`?chapter=fjall-toppur&friends=1`): the top alone under `LOOKS.sunset` with the six friends' models standing on `top.room`.

- [ ] **Step 1: Write the failing tests:** `'her print has three toes and no front crescent; a print with water none has no water'` (fen.test.mjs), `'the sauropod print is drawn as before: its mesh\'s positions are the ones chapter 2 had'` (a hash of the positions), `'from view_east the pool, the falls, the Fen and the glade are in frame, wide and upright, with no ground in between'`, `'the top holds everyone: six discs inside the rim, none overlapping, 12 m free in the middle'`, `'the top is flat (no step over 0.3 m inside the rim); every wayUp starts under the sea and ends 8 m inside the rim'`, `'createTop alone builds with no chapter 6 state, and dispose leaves the scene as it found it'`, `'in the cloud at level 0.5 a bush 30 m off is whiter than one 8 m off; at level 1 neither shows beyond 20 m'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with the suite.
- [ ] **Step 5:** Stills at both sizes: the ford with the falls and the rainbow; `view_east`; the first print beside Mosi at sizes 5 and 11; the cloud at prints 1, 3 and 6; the top empty and with all six friends; the sea of cloud toward the sun. Bench every key shot. A video of scenes 2–4 and 7.
- [ ] **Step 6:** Commit, send. Ask: the print's size, the top's size and plants, the sea of cloud, the sun on its bank. **Wait for his yes.**

## Chunk 3: Grameðla

### Task 9: Her body's tools: the shared lean and the stride

**Files:**
- Create: `remake/engine/pose/lean.js`
- Modify: `remake/chapters/gramedla3d/pose.js`, `remake/tools/bake/tailed-biped-clips.js`, `remake/assets/characters/trex.glb`, `trex-source.json`
- Test: `remake/tests/kafli6-gramedla.test.mjs`, `remake/tests/trex.test.mjs`; `gramedla3d-keys.test.mjs`, `gramedla3d-sound.test.mjs`, `flugedla3d.test.mjs` unchanged and green

**Interfaces:**
- Consumes: `rotateBoneWorld` (`engine/actor.js`); `pose.js`'s `guardBones(bones)` → `{ begin(), end() }` and its lean shares `LEAN = { Spine: 0.22, Chest: 0.3, Neck: 0.48 }`; `authorClips({ ..., walk, clips })`, `WALK`, `walkCycle` (`tailed-biped-clips.js`); the `bakeCommand` and `faceCommand` in `trex-source.json`.
- Produces:
  - `guardBones` and `LEAN` moved to `engine/pose/lean.js` (`pose.js` re-exports `guardBones`, so the two casts' imports stand); `createLean(actor, { shares = LEAN } = {})` → `{ set({ theta = 0, turn = 0, roll = 0, pitch = 0 }), snout(out), release() }`: bends Spine, Chest and Neck down by their shares of `theta` and turns the Head, from the pose her clip gave her that frame. `createGramPose` keeps its interface and uses it.
  - A `stride` clip: `STRIDE = { stride: 1.5, cycle: 0.76, lift: 0.16, lean: 6 }` of the walk's (4.2 m in 1.9 s, 2.2 m/s; first values), authored with `walkCycle`, baked with the `bakeCommand` plus `&clips=idle,walk,roar,stride`, then the `faceCommand`.

- [ ] **Step 1: Write the failing tests:** `'createLean at theta 0 leaves her as her clip has her; at 0.8 her snout is lower and further forward, her feet where they were'`, `'the lean laid on every frame does not add up: 200 frames at theta 0.5 give the pose of one'`, `'her clips are idle, walk, roar and stride, each turning every bone'` (trex.test.mjs), `'the actor measures the stride at 2.2 m/s (walkTo with { speed: 2.2, clip: \'stride\' }: naturalSpeed within 0.05 of 4.2 / 1.9)'`, `'striding, a planted foot stays put'`, `'the bake left her skin as it was: vertex count, triangles and eyes, the walk and the roar unchanged'` (and the two nostril vertices pose.js names (22403, 22073) within 0.1 mm of where they were).
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement; bake. If the last test fails the bake has changed her skin: stop and report, do not commit the model. **Step 4:** Run; see them pass, with the three show tests. **Step 5:** Commit: "Grameðla: her lean as an engine file, and a stride".

### Task 10: Her life in the cloud: the shape, stepping out, the sniff and the roar

**Files:**
- Modify: `remake/chapters/kafli6-gramedla.js`, `kafli6.js`, `kafli6-mosi.js`
- Test: `remake/tests/kafli6-gramedla.test.mjs`, `remake/tests/kafli6.test.mjs`

**Interfaces:**
- Consumes: `createLean` (Task 9); `createHaze(model)` → `{ set(haze, seen) }` (`chapters/gramedla3d/haze.js`); the actor's `lookAt`, `blink()`, `play(clip, { fade, timeScale, once })`, `walkTo(points, { speed, clip })`, `setOverlay`; `herAt`, `directionPoint`, `CALL` (Task 1); `cloud.glow`, `cloud.blowAway` (Task 5); `sparkleBurst` (`world/props/sparkles.js`).
- Produces: `gramedlaLife(s, c)` → `{ hide(), shape(round, direction, stand), *stepOut(), *tilt(), *bowAndSniff(), *roarYes(), nod(), points() → { root, head, snout, heading }, lean }`:
  - `shape`: round 0 nothing but the glow; round 1 she stands at `herAt` as a dark shape in it (her own model out of the engine's fog, darkened by a `createHaze`-like tint whose colour is a parameter; first values `#3a3632`, seen 0.35), taking a step with a thud; round 2 the shape fills the glow (seen 0.7, 12 m off) and pebbles hop.
  - `stepOut`: two heavy steps (her `walk`) to 7 m from Mosi's head, her own colours coming as she comes, a thud and a tremble at each. `tilt`: her head 12 degrees to one side, two blinks. `bowAndSniff`: the lean eased to bring her snout 1.2 m from Egill over 3.2 s, two breaths (`gramedlaExhale`) that blow his hair (his head tips back 6 degrees, a puff of sparkles passes him), up again. `roarYes`: a breath in (the lean back 0.15 rad, 1 s), her `roar`, the cloud blown 1.1 s in. `nod`: two dips of the lean and a snort.
  - `smallRoar(s, c)` and `pointWithHead(c, point)` in `kafli6-mosi.js`: `SMALL_ROAR = { seconds: 1.8, neck: 28, head: 22, jaw: 24 }` (degrees up and open, on an envelope, laid over his idle with `actor.setOverlay` and `guardBones`).

- [ ] **Step 1: Write the failing tests:** `'in round 1 she is hidden and the glow is on the answer\'s side'`, `'in rounds 2 and 3 she stands on the answer\'s side at CALL.her metres, facing Mosi, seen 0.35 and 0.7'`, `'she steps out to 7 m from Mosi and never nearer than 5 m to Egill\'s head until she bows'`, `'bowing, her snout comes within 1.0 to 1.5 m of Egill\'s head and her feet stay planted'`, `'nothing of her jumps more than 8 degrees or 0.15 m in a frame from her first shape to the star'`, `'Mosi\'s little roar opens his jaw 24 degrees at its peak and leaves every bone within 0.5 degrees of where it was'`, `'the star rises from over her head and is k6_gramedla'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass. **Step 5:** Commit: "kafli6: Grameðla in the cloud, stepping out, the sniff and the roar".

### Task 11: The seat on her head and the walk up

**Files:**
- Create: `remake/chapters/gramedla-haus.js`
- Modify: `remake/chapters/kafli6-gramedla.js`, `kafli6-mosi.js`, `kafli6.js`
- Test: `remake/tests/riding.test.mjs`, `remake/tests/kafli6-gramedla.test.mjs`, `remake/tests/kafli6.test.mjs`

**Interfaces:**
- Consumes: `createSeat(host, { bone, offset, grips, skin, lean, flatFeet })`, `floatTo(rider, saddle, { duration })`, `ride(rider, saddle, { settle })` (`engine/riding.js`); Þórseðla's `SEAT` (`kafli3-thorsedla.js`) and `thorsedla-haus.js` as the models; her `stride` (Task 9); `top.veil`, `top.sea`, `top.room` (Task 8); `holdHer`, `flyPath` (Flugeðla, the far speck).
- Produces:
  - `HEAD_SEAT = { bone: 'Head', lean: 12, flatFeet: true, skin: { seat, grips: { left, right }, knees: { left, right }, ankles: { left, right } } }`: points on her skull's top in her Head bone's frame, measured on the look-check page (a `.tools/gramedla-haus/places.mjs` that casts down onto her skin, as Þórseðla's were): his seat 1 cm over her skin behind her brow, his soles flat 0.125 m over it. `gramedla-haus.js` (`?chapter=gramedla-haus&pose=down|up|stride&view=back|left|right|front|top|wide`).
  - `*headDown()`: the lean solved by bisection so her snout's underside is 0.2 m over the ground; if 1.5 rad does not reach, her Hips pitch forward up to 25 degrees with the Thighs turned back by as much, so her feet stay planted. `*rise()`. `*trampUp(points)`: her `stride` up the belt's last slope and, on the top, her `walk` to her place in `top.room`. `runBeside(s, c, points)` (`kafli6-mosi.js`): Mosi's walk as fast as its feet allow, 4 to 9 m off her side, and a panting bob while he stands on the top.
  - Scene 7 whole: `s.race(s.tap(['her-head', 'egill']), s.wait(6))`, `floatTo(egill.raw, seat, { duration: 2.6 })`, `ride(egill.raw, seat, { settle: 0 })`, `on_her_head`; the three shots; Flugeðla a speck 150 m out and below, flying up out of the sea.

- [ ] **Step 1: Write the failing tests:** `'the seat is on her skin: his seat 0.01 m over it, his soles 0.125 m, with her head down, standing and at four moments of the stride'`, `'with her head down the seat is under 1.6 m over the ground and her feet have not moved'`, `'Egill floats up when her head or he is tapped, and after 6 s when nothing is'`, `'in the tramp up Mosi stays 4 to 9 m from her side and neither slides a planted foot more than 3 cm in a frame'`, `'Egill stays within 2 cm of the seat from the rise to the chapter\'s end'`, `'in top_wide she, Mosi and Egill are in frame at both shapes of screen, and Flugeðla is over 100 m off and below them'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with the suite.
- [ ] **Step 5:** Stills of Egill on her head from the look-check page's six views in each pose, at both sizes; a video of scenes 5–7 (`--query "kafli6=pikk"`); bench `she_comes`, `sniff_close`, `roar_wide`, `on_her_head`, `top_wide`.
- [ ] **Step 6:** Commit, send. Ask: her shape in the cloud, the roar and the cloud, the seat, the walk up. **Wait for his yes.**

## Chunk 4: Sounds and lines

### Task 12: The sounds

**Files:**
- Create: `remake/tools/kafli6-sounds.mjs` (as `kafli5-sounds.mjs`: `--list`, `--fetch`, masters the picks into `assets/audio/kafli6/hljod/`), `remake/assets/audio/kafli6/CREDITS.md`
- Modify: `remake/engine/audio/sfx.js` (`SAMPLES`), `remake/chapters/kafli6.js`
- Test: `remake/tests/sfx.test.mjs`, `remake/tests/kafli6.test.mjs`

**Interfaces:**
- Consumes: `SAMPLES` (`{ name: { url | urls, level, instead } }`), `s.sfx(name, { level, pan, rate })`; `gramedlaRoar`, `gramedlaExhale`; her footfall `assets/audio/gramedla3d/hljod/thump.mp3`; `createShowSounds`'s low-pass per play (`chapters/gramedla3d/sounds.js`) as the model; the made `frog`, `splash`, `step`; `world.music.setLevel`.
- Produces: the owner's listening page `qa/remake/kafli6/hljod/index.html` → `hljod-val.json` with 3 to 4 candidates each for Mosi's little roar (thin and funny), hooves on stone, a stone rocking, the frog's splash, a step in wet earth, mountain wind. Samples `mosiRoar`, `hoofStone`, `stoneRock`, `frogSplash`, `wetStep`, `mountainWind`, `gramedlaThump`, each with a made sound `instead` until its file has decoded. `farRoar(s, c, { distance, pan })` in `kafli6.js`: the same recording by distance (first values at 60, 30 and 12 m: −14 dB and a 700 Hz low-pass, −7 dB and 1.8 kHz, 0 dB and none) with a longer tail far off. The music: at 1 at the ford and on the slope, to 0 over 3 s entering the cloud, back to 1 over 2 s as the cloud blows away.

- [ ] **Step 1:** Make the candidate list (name, author, licence, source, size of each). **Ask the owner before any download.** Fetch what he allows, build the page, send the link (localhost only).
- [ ] **Step 2: Write the failing tests:** `'every chapter 6 sample has its file, a made sound instead, and a line in CREDITS.md with its author and licence'`, `'her answer is quieter and duller the further off she is: 60, 30 and 12 m in that order'`, `'in the cloud the music is at 0 from the first print to her roar, and at 1 within 2 s after it'`, `'a wrong stone is heard: the rock, then the splash; a hop: hooves'`.
- [ ] **Step 3:** Run; see them fail. **Step 4:** Implement on his picks. **Step 5:** Run; see them pass.
- [ ] **Step 6:** Commit. Ask with the next video whether the theme coming back is big enough or a new arrangement is wanted.

### Task 13: Every line

**Files:**
- Create: `remake/assets/audio/kafli6/lines-source.json` (every `WORDS` line, `[{ id, speaker, text }]`)
- Modify: `remake/tools/audio-lines.mjs` (`kafli6: 'remake/assets/audio/kafli6'` in `SETS`); `remake/assets/audio/lines.json`, `voices-made.json` (written by the tools)
- Test: `remake/tests/kafli6-lines.test.mjs` (as `kafli5-lines.test.mjs`); `voice-lines.test.mjs`, `heard.test.mjs`, `pronunciation.test.mjs` stay green

- [ ] **Step 1:** The count says chapter 2's six takes („Eitt!“ … „Sex!“, `k2_mosi_1` to `k2_mosi_6`): check each plays at its print in the cloud; nothing is recorded for the count.
- [ ] **Step 2: Write the failing tests:** `'every chapter 6 line is a line of the kafli6 set with the same words, named for its speaker'`, `'every chapter 6 line has its recording, in lines.json and in voices-made.json, with a mouth that opens'`. Run; see them fail.
- [ ] **Step 3:** `node remake/tools/voice-lines.mjs --dry --set kafli6`; read every note (REJECTED, "fixed on its own line"); words without a book entry (Grameðla's name in its cases, Stjörnuhátíðin, risastór, rjóðrið) get one with a `hratt` recipe (node only); the trailing-off lines (`k6_mosi_wait`, `k6_mosi_room`) carry `"fixes": "punctuation"` if they need a context. **Step 4:** Record: `node remake/tools/voice-lines.mjs --set kafli6`, then `node remake/tools/audio-lines.mjs`. Run the lines test; see it pass.
- [ ] **Step 5:** His yes/no page (`node remake/tools/voice-lines.mjs --yesno kafli6`) and a whole-chapter video with sounds and lines. Import his `jano-kafli6.json` with `heard.mjs` and commit what it writes; 3–4 candidates for each line he rejects; `--plan` clean.
- [ ] **Step 6:** Commit. **Wait for his yes on the sounds and the lines.**

## Chunk 5: The start, the end and the whole chapter

### Task 14: Farewell, map, star, book, save order, the whole play

**Files:**
- Modify: `remake/engine/save.js`, `remake/chapters/kafli5.js` (`next: 'kafli6'`), `remake/chapters/kafli6.js`, `remake/tests/kafli5.test.mjs` (its `next` and `defaultChapter` assertions), `remake/tests/save.test.mjs`
- Test: `remake/tests/kafli6.test.mjs`

**Interfaces:**
- Consumes: `defaultChapter(save)` (now: chapter 5 once `k4_flugedla` is there, and for ever after); `renderMap(leaf, { save, win })` → `{ stateOf(id), routeOf(id), next(), mistOpen() }` (`engine/book/map-page.js`); the harness's `savedWith`, `moments`, `save`.
- Produces: `defaultChapter(save)` opens `kafli6` once `k5_sloedla` is there, and still with `k6_gramedla`; every earlier answer stays. `kafli5.chapter.next === 'kafli6'`, `kafli6.chapter.next === null` (the festival's plan sets it to `hatid`). Scene 1 finished in its real look: the farewell's shots, Flugeðla's take-off, Egill into the saddle, map piece f drawn once.

- [ ] **Step 1: Write the failing tests:**

```js
test('defaultChapter opens chapter 6 after Slóeðla and keeps every earlier answer', () => {
  const FIVE = ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla', 'k5_sloedla'];
  const cases = [[[], 'kafli1'], [FIVE.slice(0, 1), 'kafli2'], [FIVE.slice(0, 2), 'kafli3'], [FIVE.slice(0, 3), 'kafli4'],
    [FIVE.slice(0, 4), 'kafli5'], [FIVE, 'kafli6'], [[...FIVE, 'k6_gramedla'], 'kafli6'],
    [['k1_kambedla', 'k2_thorsedla'], 'kafli2'], // an old chapter 2 save still meets Uggeðla
    [['k1_kambedla', 'k2_uggedla', 'k4_flugedla'], 'kafli3'], // Flugeðla's star alone does not skip Þórseðla
    [[...FIVE.slice(0, 4), 'k6_gramedla'], 'kafli5']]; // nor Grameðla's Slóeðla
  for (const [stars, want] of cases) assert.equal(defaultChapter(saveWith(stars)), want, `stars ${stars.join(', ') || 'none'}`);
});
test('kafli5 hands over to kafli6 (kafli5.chapter.next), and kafli6 to none yet (chapter.next === null)', ...);
test('scene 1 draws map piece f once, with Mosi\'s, Egill\'s and Mosi\'s lines said while the map is up', ...);
test('her star stars the map: her slot done, piece f reached, nothing ahead, the mist open', ...); // renderMap with the run's save
test('the book has her card and her video after the star, and not before', ...);
test('played again with k6_gramedla already in the save: no second star, map-route-f once in seen', ...); // Review Focus 5
test('the chapter ends in the book on the dinosaurs with Grameðla nodding, then the map', ...);
test('a save that ended chapter 5 loses nothing: its stars, places and finds are all there at the end', ...);
```

- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with `save.test.mjs`, `kafli5.test.mjs`, `kafli4.test.mjs`, `book.test.mjs` and `npm run test:remake` (all green).
- [ ] **Step 5:** Measure: bench of every key shot at both sizes (≤ 6 ms, ≤ 100 calls, ≤ 250k), the start button's wait, the whole chapter's `--stats`. Two whole-chapter videos (`qa/remake/kafli6/butur5-ekkert`, `butur5-pikk`) with phone copies, and a play from chapter 5's end through the hand-over.
- [ ] **Step 6:** Commit, send. When he approves: a last read of the whole branch against the spec (no reviewer agents), `git diff --stat` and line endings checked, then ask him about merging into main and pushing. Nothing is deployed without his word.
