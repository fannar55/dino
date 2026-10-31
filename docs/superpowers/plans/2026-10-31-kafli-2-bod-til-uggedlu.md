# Kafli 2 (Uggeðla) and kafli 3 (Þórseðla) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project the controller runs builder agents only (no reviewer agents): after each task the controller shows the owner captures or a video and asks before the next task.

**Goal:** Split today's chapter 2 into a new chapter 2, "Boð til Uggeðlu" (glade, footprints, then the new channel place with the fishing, her star and the ferry), and chapter 3, "Boð til Þórseðlu" (the Fen part, nearly unchanged), without losing any scene or any child's save.

**Architecture:** `kafli2.js` keeps scenes 1–2 and gains scenes 3–7 in a new place `siki` (its own layout, seed and shots), with Uggeðla's life and the fishing in their own modules. The Fen part of today's `kafli2.js` moves into a new `kafli3.js`; its three helper modules are renamed `kafli3-*` (git mv). The Fen and the trail layouts are not touched, so their plants deal exactly as before. Save, chapter order and the book change only through `defaultChapter`, `chapter.next`, the star id `k2_uggedla` and the Leikir tile.

**Tech Stack:** plain ES modules, three.js (vendored), node:test with the chapter harness (`remake/tests/chapter-harness.mjs`), the capture tool (`remake/tools/capture.mjs`), ElevenLabs v4 voice tool (`remake/tools/voice-lines.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-31-kafli-2-bod-til-uggedlu-design.md` (and, for everything it does not change, `docs/superpowers/specs/2026-10-21-kafli-2-bod-til-thorsedlu-design.md` with its section 11).

## Global Constraints

- Worktree `C:/Risaeðla/dino-kafli-uggedla`, branch `kafli-uggedla`. Touch nothing outside it. Commit only on this branch; never merge, never push.
- Never bare `git stash`. Commit WIP often (the PC sleeps): at least after every step that changes files, with a one-line progress note appended to `C:/Users/fannare/AppData/Roaming/Claude/side-session-notes/local_5af6e842-d0c9-4f2a-92fb-56f234adc53d/kafli-uggedla-progress.md`.
- Every file keeps its own line endings (`.gitattributes * -text`): `remake/main.js` and `remake/engine/book/book.js` are CRLF; the chapter files, `save.js` and the tests are LF. Check with `file <path>` before and after editing.
- Never touch `design/` or `dist/`.
- Never print the ElevenLabs key (it is in the environment). Never download anything (samples, images, libraries) without the owner's yes: name, source, size.
- No art drawn or modelled by Claude: the models are the owner's (`spinosaurus.glb`, `brontosaurus.glb`, the critter fish). Procedural clips baked by the existing bake tool are allowed.
- Dev server: `node remake/tools/serve.mjs --port 4240` (never 4190, 4197, 4201, 4212, 4213, 4231). Give the owner only `http://localhost:4240/...` links.
- Tests: `node --import ./remake/tests/setup.mjs --test remake/tests/*.test.mjs` (single file: replace the glob). Child-facing tests only; no tests of internals.
- Captures: `node remake/tools/capture.mjs` at 1280×800 and a portrait tablet size, as the old chapter 2 did.
- Tablet budget on every key shot: ≤ 6 ms GPU, ≤ 100 draw calls, ≤ 250k triangles (STYLE.md 11).
- All Icelandic text (lines, captions) exactly as the spec writes it; the plan's line table below is the source.
- An idle child (taps nothing) finishes each chapter in ≤ 450 s; nothing ever waits for a tap without a hint and then help.

## Review Focus

1. **An old save:** a save with `k1_kambedla`, `k2_thorsedla`, places `fen, sloedla, flugedla, uggedla` and `hals.played` (the old chapter 2 finished) opens chapter 2, keeps Háls og hali open and Uggeðla's card unlocked, and after `k2_uggedla` opens chapter 3. Test in Task 1 (`defaultChapter`) and Task 6 (the book after the new chapter 2 on such a save).
2. **Taps during a catch:** a second tap while Uggeðla is catching, a tap on a fish already caught, or two taps in one frame count the fish once and never more than five. Test in Task 5.
3. **Tapping only small fish:** a child who taps every small fish still gets hints and help and ends with five big fish counted. Test in Task 5.
4. **A slow device:** the start's black and the fade into Síkið wait for `siki`'s build and Uggeðla's model, as the Fen waited for its build (no scene plays in a place still being built). Test in Task 3.
5. **Portrait screen:** every jump of a big fish is on screen and its tap target is at least 44 px on a portrait tablet capture size. Test in Task 5.

---

## Lines

All new lines go in `remake/assets/audio/kafli2/lines-source.json` (the `kafli2` voice set holds both chapters' recordings; chapter 3 keeps its `k2_` lines) and in the chapter's `WORDS`. Until Task 7 records them, each new id is listed in a `WAITING_FOR_VOICE` set in the chapter's test file, which the "every line has a recording" test skips by name; Task 7 empties it.

| id | speaker | text |
| --- | --- | --- |
| k2_mosi_flooded | mosi | Ó nei! Síkið hefur flætt yfir stíginn. |
| k2_egill_across | egill | Hvernig komumst við yfir? |
| k2_mosi_boat | mosi | Sjáðu, Egill! Bátur! Með stóru, litríku segli! |
| k2_egill_helloboat | egill | Halló, bátur! |
| k2_mosi_notboat | mosi | Þetta er enginn bátur… þetta er Uggeðla! |
| k2_uggedla_hello | uggedla | Bátur? Ha ha ha! Halló, Mosi. Ég er að veiða. |
| k2_uggedla_help | uggedla | En fiskarnir eru svo snöggir í dag. Viltu hjálpa mér, Egill? Pikkaðu á stóru fiskana þegar þeir stökkva! |
| k2_mosi_einn | mosi | Einn! |
| k2_mosi_tveir | mosi | Tveir! |
| k2_mosi_thrir | mosi | Þrír! |
| k2_mosi_fjorir | mosi | Fjórir! |
| (k2_mosi_5, exists) | mosi | Fimm! |
| k2_uggedla_small | uggedla | Nei, hann er of lítill. Hann má stækka! |
| k2_mosi_hint_fish | mosi | Bíddu eftir stórum fiski… og pikkaðu! |
| k2_uggedla_thanks | uggedla | Fimm fiskar! Takk, Egill. Þú ert frábær veiðimaður! |
| k2_mosi_invite_ugg | mosi | Uggeðla, viltu koma á Stjörnuhátíðina í kvöld? |
| k2_uggedla_accept | uggedla | Stjörnuhátíð! Já, ég kem! Og ég veit hvað ég geri: ég ferja alla gestina yfir ána. |
| (k2_mosi_second, exists) | mosi | Sjáðu, Egill! Önnur stjarnan! |
| k2_uggedla_aboard | uggedla | Og ég byrja strax. Upp á bakið, Egill! Ég ferja ykkur til Þórseðlu. |
| k2_mosi_brrr | mosi | Brrr! Vatnið er svo blautt! |
| k2_uggedla_wet | uggedla | Vatn er alltaf blautt, Mosi! |
| k2_egill_sail | egill | Af hverju ertu með svona stórt segl? |
| k2_uggedla_sail | uggedla | Svo allir sjái mig langt að. Meira að segja þeir sem halda að ég sé bátur! |
| k2_mosi_onlyabit | mosi | Ég hélt það bara pínulitla stund… |
| k2_uggedla_tail | uggedla | Og sjáðu, ég syndi með halanum, eins og fiskur! |
| k2_mosi_wetter | mosi | Hei! Nú er ég ennþá blautari! |
| k2_egill_head | egill | Sjáðu! Höfuðið á Þórseðlu, uppi yfir trjánum! |
| k2_uggedla_berries | uggedla | Hér eru þúfurnar. Þórseðla heyrir ekki í litlum röddum. En hún elskar rauðu berin! |
| k2_mosi_thanks_ugg | mosi | Takk, Uggeðla! Sjáumst í kvöld! |
| (k2_mosi_two, exists) | mosi | Tvær komnar. Og nú vitum við hvert við förum næst! |
| k3_mosi_wave | mosi | Og sjáðu! Uggeðla veifar okkur úr sefinu sínu! |
| k3_egill_hi | egill | Hæ, Uggeðla! |
| k3_mosi_third | mosi | Sjáðu, Egill! Þriðja stjarnan! |
| k3_mosi_three | mosi | Þrjár komnar. Og nú vitum við hvert við förum næst! |

Cast entry for chapter 2: `uggedla: { name: 'Uggeðla', colour: '#2f6a65' }` (the dark tone of her teal, `FRIENDS` colour `#47908a`).

---

### Task 1: The chapter split (kafli 3 on its own, order and save)

**Files:**
- Create: `remake/chapters/kafli3.js`
- Rename (git mv, then edit): `remake/chapters/kafli2-fen.js` → `kafli3-fen.js`, `kafli2-thorsedla.js` → `kafli3-thorsedla.js`, `kafli2-lookout.js` → `kafli3-lookout.js`
- Modify: `remake/chapters/kafli2.js` (keep scenes 1–2; drop the Fen), `remake/engine/save.js:170-175` (`defaultChapter`), `remake/main.js` comments at 45-46 and 622 only (CRLF), `remake/assets/audio/kafli2/lines-source.json` (the four `k3_` lines)
- Create: `remake/tests/kafli3.test.mjs` (the Fen tests moved from `kafli2.test.mjs`)
- Modify: `remake/tests/kafli2.test.mjs`, `remake/tests/save.test.mjs`, `remake/tests/theme.test.mjs` (chapter 3 names `kafli2/theme.json` too)

**Interfaces:**
- Produces: `kafli3.js` exports `chapter` (`id: 'kafli3'`, `title: 'Boð til Þórseðlu'`, `start: 'fen'`, `next: null`, `look: 'lateMorning'`, `theme: 'kafli2/theme.json'`, `startShot: 'fen_reveal'`, locations `{ fen }` with today's Fen layout and shots unchanged, actors `mosi, egill, thorsedla`), and today's exports `LOOKOUT_HEAD`, `EGILL_PICKS`, `GRAMEDLA_FAR`.
- Produces: `kafli2.js` `chapter` with `next: 'kafli3'`, locations `burknalaut, fenjaslod` (Task 3 adds `siki`), and a temporary end after scene 2 (fade to black, script returns) that Task 6 replaces.
- Produces: `defaultChapter(save) -> 'kafli1' | 'kafli2' | 'kafli3'`.

- [ ] **Step 1: Write the failing order tests** in `kafli2.test.mjs` (replacing 'the default chapter follows the stars' and the hand-over test):

```js
assert.equal(defaultChapter(saveWith([])), 'kafli1');
assert.equal(defaultChapter(saveWith(['k1_kambedla'])), 'kafli2');
assert.equal(defaultChapter(saveWith(['k1_kambedla', 'k2_thorsedla'])), 'kafli2', 'an old chapter 2 save meets Uggeðla');
assert.equal(defaultChapter(saveWith(['k1_kambedla', 'k2_uggedla'])), 'kafli3');
assert.equal(defaultChapter(saveWith(['k1_kambedla', 'k2_uggedla', 'k2_thorsedla'])), 'kafli3', 'and again, to play it again');
assert.equal(kafli1.next, 'kafli2'); assert.equal(kafli2.chapter.next, 'kafli3'); assert.equal(kafli3.chapter.next, null);
```

and in `save.test.mjs` the same old-save case through a stored JSON (`stars: ['k1_kambedla','k2_thorsedla']`, `places: ['fen','sloedla','flugedla','uggedla']`, `hals: { found: [], played: true }`): `defaultChapter` is `kafli2`, `get().places` and `getHalsPlay().played` unchanged.

- [ ] **Step 2: Run them; expect FAIL** (`kafli3.js` missing, `defaultChapter` returns `kafli2`).

- [ ] **Step 3: Move the code.** `git mv` the three modules, fix their imports and header comments (they now belong to chapter 3). Create `kafli3.js` from today's `kafli2.js`: the Fen constants, `FEN_*`, `theFen` … `theStar`, `arriveInTheFen`, the Fen's `warmUp` part, `later`, `prepare: []` (the Fen is the start place, built before the start button), `firstFind: 'earlyBird'` (the Fen animal whose card the warm-up draws once). Its script: Mosi at `FEN_ENTRY` with Egill in the saddle (`createSaddle`, `ride`), Þórseðla in her pool, `s.camera.cut('fen_reveal')`, `s.ready()`, far friends made as today, `s.sfx('fen')`, fade in, then scenes 3–8 (keep `mark(c, 3..8)` numbers). `arriveInTheFen` loses the trail clean-up and Kambeðla. Trim `kafli2.js` to scenes 1–2, `prepare: ['fenjaslod']`, actors `mosi, egill, kambedla` (Task 3 adds `uggedla`, `thorsedla`), and after `footprints` a temporary `yield s.fade(1, 0.8)`.

- [ ] **Step 4: Change `defaultChapter`** to: no `k1_kambedla` → `kafli1`; else no `k2_uggedla` → `kafli2`; else `kafli3`. Update its doc comment and `main.js`'s two comments (CRLF kept).

- [ ] **Step 5: Split the tests.** Every test from line 179 to the end of `kafli2.test.mjs` that plays or inspects the Fen, Þórseðla, the lookout, the slide, the star, the berries, the frog or the Fen's sounds moves to `kafli3.test.mjs` (importing `kafli3.js` and `kafli3-*.js`; `CHAPTER_TEXT` lists the kafli3 files). The prints, Kambeðla's goodbye, the map moment in the glade, the dragonfly in the third print, "a tap on the next print while Mosi says a number" and the glade/trail location and shot tests stay in `kafli2.test.mjs`. A test that spans both (e.g. 'the prints are counted one to ten in order, and the berries one to five') splits into one per chapter. The idle limits: chapter 2's harness `limit` 450; chapter 3's `IDLE_LIMIT` 450.

- [ ] **Step 6: The lookout's Uggeðla beat** (`kafli3-lookout.js` `findFriends`): after the first search, keep `far.withhold(LAST, false)` and `turnRound(s, c, last[0].point)`; replace the second `s.search` with: `s.sfx('flower')`, `far.glimmer(LAST, true)` for 1.5 s then off, `yield s.all(far.react(LAST), s.after(0.3, () => c.say('mosi', 'k3_mosi_wave')))`, then `yield* c.say('egill', 'k3_egill_hi')`. No `s.place`, no `c.farFinds` entry. `farOff` follows as today. Remove the now unused `HINTS.uggedla`, `FOUND.uggedla` and `LAST_LOOK` uses. Test (kafli3.test, idle play): the script's book calls include no `place`/`found` for `uggedla`; `k3_mosi_wave` is said after Flugeðla's find and before Grameðla's roar; Grameðla still roars and walks.

- [ ] **Step 7: The third star.** In `kafli3.js` `theStar`, `k2_mosi_second` → `k3_mosi_third`, `k2_mosi_two` → `k3_mosi_three`; the star stays `s.star('k2_thorsedla', …)`. Add the four `k3_` lines to `WORDS`, `lines-source.json` and `WAITING_FOR_VOICE`.

- [ ] **Step 8: Run the whole suite; expect PASS.** Then play both chapters in the browser (`?chapter=kafli2`, `?chapter=kafli3`) and confirm no console errors.

- [ ] **Step 9: Commit**, and capture for the owner: a video of chapter 3 from the start button through the Fen reveal, and of the lookout from "Horfðu vel" to Grameðla walking away (1280×800).

---

### Task 2: Uggeðla's voice (in parallel with Task 1)

**Files:**
- Create: `remake/tools/design-voice.mjs` (from the Söngur Slóeðlu DJ tool: `C:/Users/fannare/AppData/Roaming/Claude/side-session-notes/local_5af6e842-d0c9-4f2a-92fb-56f234adc53d/sloedla-lag/dj-design.mjs` and `C:/Risaeðla/dino-sloedla-lag/remake/tools/sloedla-dj.mjs`; read both, do not edit them)
- Create (git-ignored): `qa/remake/kafli-uggedla/rodd/` with the previews and an `index.html` listening page in the yes/no pages' style (`remake/tools/voice-pages.mjs`)
- Modify: `remake/assets/audio/voices.json` (`"uggedla"`: null now, the chosen id after the owner's pick)

**Interfaces:**
- Produces: `voices.json` `uggedla: <voice id>`, which Task 7's recording needs.

- [ ] **Step 1:** `design-voice.mjs --name uggedla --description "<text>" --preview "<Icelandic text>" --count 6 --out qa/remake/kafli-uggedla/rodd` calls POST `/v1/text-to-voice/design` (`eleven_ttv_v3`) and saves each preview as mp3 with its `generated_voice_id`. Description: a native Icelandic woman, adult, cheerful and teasing, laughs easily, a little quick, perfect Icelandic pronunciation. Preview text: `Bátur? Ha ha ha! Halló, Mosi. Ég er að veiða. En fiskarnir eru svo snöggir í dag. Viltu hjálpa mér, Egill?`
- [ ] **Step 2:** Check each preview with ElevenLabs speech-to-text (scribe_v2, as the DJ previews were) and list the share of words heard right on the listening page.
- [ ] **Step 3:** The controller gives the owner the page link (`http://localhost:4240/qa/remake/kafli-uggedla/rodd/`) and waits for his pick (he may ask for another round with a changed description).
- [ ] **Step 4:** Save the picked preview as a voice (POST `/v1/text-to-voice`), write its id into `voices.json`, commit.

---

### Task 3: Síkið, the place

**Files:**
- Create: `remake/chapters/kafli2-siki.js`
- Modify: `remake/chapters/kafli2.js` (location `siki`, `prepare: ['fenjaslod', 'siki']`, actors `uggedla` and `thorsedla`, the fade from the trail into Síkið), `remake/tests/kafli2.test.mjs`

**Interfaces:**
- Produces from `kafli2-siki.js`: `SIKI_LAYOUT` (layout object), `SIKI_SHOTS` (shot map), and the named points the scenes use: `MOSI_BANK` (where Mosi stops at the flooded path, `{ position, heading }`), `UGGEDLA_REED` (where she lies low), `FISHING_SPOTS` (array of `[x, z]` water spots round her where fish jump), `FERRY_LINE` (array of `[x, z]` along the channel from the crossing to the hummocks), `MOSI_WADE_LINE` (his line on the shallow edge, beside it), `HUMMOCK` (Mosi's stop at the end, `{ position, heading }`), `UGGEDLA_DROP` (where she stops at the hummocks), `THORSEDLA_FAR` (`{ position, heading }`).
- Shots (names fixed; values found by capture): `siki_arrive`, `siki_flooded`, `siki_sail`, `siki_fishing` (still, wide enough for every fishing spot), `siki_two_shot`, `siki_star`, `ferry_side`, `ferry_front`, `ferry_back` (moving shots may be actor-relative, as `fen_slide` is), `siki_hummocks`, `siki_portrait`.

- [ ] **Step 1: Write the failing test** 'Síkið as data': the location exists with `layout.seed === 13`, `biome === 'fen'`, `layout.water.channel.width` between 6 and 8, `depth` ≥ 1.1; every named shot above exists; the channel's water covers the path's last 4 m (`waterShape(layout.water).signedAt` < 0 at the path's end and > 0 at its start); `FERRY_LINE` is 40–60 m long and every point of it lies in water at least 1 m deep; every `MOSI_WADE_LINE` point is in water 0.3–0.6 m deep; `HUMMOCK` stands on dry ground. 'every shot keeps the camera rules over its ground' covers `siki` too.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Build the place** as the spec's section 3 describes, in the Fen's look (the Fen biome's plants, `world/props/water.js`). Starting geometry (adjust by capture and say what changed in the file's header): the path comes from the north-west to `MOSI_BANK` ≈ (0, 0) heading 35; the channel crosses just past it, south-west to north-east of the path, then bends east and runs ~50 m to the hummocks ≈ (45, 25); Uggeðla's reed bed across the channel ≈ 10 m from Mosi; Þórseðla ≈ 90–110 m beyond the hummocks in the ferry's direction, behind swamp conifers lower than her head (her head 8.3–9 m up), standing on her idle and biting (as `thorsedlaLife` does, without taps). Mist like the Fen's.
- [ ] **Step 4: Wire it:** after scene 2's walk, `goTo(s, c, 'siki', () => arriveInSiki(s, c))` (`arriveInSiki`: the prints disposed as the Fen did, Kambeðla hidden, Mosi at the path's start in Síkið, Uggeðla placed lying low at `UGGEDLA_REED` (Task 4 gives her pose; until then hidden), Þórseðla at `THORSEDLA_FAR`, `s.sfx('fen')`, `s.camera.cut('siki_arrive')`). The build waits under the black, as the Fen's did. Uggeðla and Þórseðla are chapter actors, loaded with the others before the start button.
- [ ] **Step 5: Slow-device test** (Review Focus 4): with `slowBuilds: { siki: 5 }` the scene after the trail does not start until `siki` is built (copy the Fen's version of 'no scene plays in a place still being built').
- [ ] **Step 6: Run; expect PASS.** Bench every `siki_*` shot on the tablet setting (the old chapter's bench page or capture with `--stats`): ≤ 6 ms, ≤ 100 calls, ≤ 250k triangles with Mosi, Egill, Uggeðla and Þórseðla in it.
- [ ] **Step 7: Commit;** captures of every shot at 1280×800 and portrait for the owner.

---

### Task 4: Uggeðla alive

**Files:**
- Create: `remake/chapters/kafli2-uggedla.js`
- Modify (only if baked clips are needed): `remake/tools/bake/tailed-biped-clips.js`, then rebake `remake/assets/characters/spinosaurus.glb` with the three commands in `spinosaurus-source.json` plus the new clips in `clips=`; record the new commands and md5 in `spinosaurus-source.json`. Grameðla must still rebake byte for byte.
- Test: `remake/tests/kafli2.test.mjs`, `remake/tests/spinosaurus.test.mjs` (if clips change)

**Interfaces:**
- Produces from `kafli2-uggedla.js`, each a generator for the scheduler (`yield*`) unless noted:
  - `lieLow(c)` (plain): she lies in the water at `UGGEDLA_REED` with only her sail above the reed (root sunk ≈ 2 m as `far-friends.js` `sink` does for her far copy).
  - `riseSail(s, c, { seconds = 4 })`: the sail rises out of the reed to its full height, rustling.
  - `headUpWithFish(s, c)`: she turns and lifts her head out of the water with a fish in her jaws and swallows it.
  - `catchFish(s, c, fish)`: her head darts to `fish.point` (a `THREE.Vector3` in the air), the jaw opens at most 12° and snaps shut as the fish reaches it, the fish rides her jaw tip, she tosses her head back and the fish is gone; resolves when her head is back. Calls `fish.caught()`.
  - `swimAlong(s, c, points, { speed })`: swims low along the points (the sail up, tail sweeping, rings in the water), at her swim clip's matched speed.
  - `tailSplash(s, c, target)`: one tail stroke that throws a splash at `target` (Mosi).
  - `createBackSeat(uggedla)` (plain): `createSeat(uggedla.raw, { bone, offset })` in front of the sail, Egill's hands on its front edge; returns the seat `ride`/`floatTo`/`floatDown` take.
  - `uggedlaLife(s, c)` (plain): breathes, blinks, small sail sway and water rings while idle in the water.

- [ ] **Step 1: Failing tests:** her seat keeps Egill above her skin and in front of the sail through `swimAlong` (sample his root against her mesh as 'Egill sits on her skin and never in it' does for Þórseðla); in `catchFish` the jaw opening never passes 12° and the fish ends within 0.3 m of her jaw tip as it closes; lying low, nothing of her but the sail is above the reed tops seen from `siki_flooded`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.** Use her baked clips where they fit (`wade` with the sink for swimming low; `kink` for the head toss; `happy`); add baked clips `swim` and `catch` in `tailed-biped-clips.js` only if the runtime bone moves read wrong in captures. The 12° limit is from her bake notes (at 10° four tiny triangles turn over at her left mouth corner): check a close capture of the snap.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit;** a video for the owner: the sail rising, her head with the fish, three catches at different heights, swimming 10 m with Egill on her back, the tail splash.

---

### Task 5: The fishing

**Files:**
- Create: `remake/chapters/kafli2-fishing.js`
- Modify: `remake/chapters/kafli2.js` (scene 4), `remake/assets/audio/kafli2/lines-source.json`, `remake/tests/kafli2.test.mjs`

**Interfaces:**
- Consumes: `FISHING_SPOTS`, `catchFish`, the fish model (`world/critters/models.js` `fish`).
- Produces: a fish as `catchFish` takes it: `{ point: THREE.Vector3 (kept up to date while it jumps), size: 'big' | 'small', caught() }`.
- Produces: `fishing(s, c) -> generator` that runs the whole task and returns `{ caught: [{ at, how: 'tapped' | 'helped' }], smallTaps }`; `FISH_SIZES = { big: 1.0, small: 0.3 }` (metres nose to tail); `JUMP_SECONDS = 1.5`; `HINT_AFTER = 8`; `HELP_AFTER = 16`.

- [ ] **Step 1: Failing tests** (child-facing, harness with pointer taps):
  - an idle child: hint `k2_mosi_hint_fish` at 8 s after the last big catch, Uggeðla catches the next big fish herself at 16 s, five big fish are counted `k2_mosi_einn`, `k2_mosi_tveir`, `k2_mosi_thrir`, `k2_mosi_fjorir`, `k2_mosi_5` in that order, then `k2_uggedla_thanks`;
  - a tap on a big fish in the air: caught, counted once (Review Focus 2: a second tap during the catch and two taps in one frame do not count again; the count never passes five);
  - a tap on a small fish: `k2_uggedla_small`, the fish swims off, nothing counted;
  - a child who taps only small fish (Review Focus 3) still gets hint and help and ends at five;
  - the jump order: about one in three is small, never two small in a row, one fish in the air at a time;
  - portrait (Review Focus 5): every big fish's jump is inside the portrait capture's frame and its tap radius is ≥ 44 px there.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** with one jump at a time on a deterministic sequence from the chapter's seed (spots from `FISHING_SPOTS`, small every third with jitter, never twice in a row), the big fish glittering (`world/props/sparkles.js`) and a tap target `s.target('fish', { point, radius })` that moves with it; a tapped fish holds still for 0.25 s while her head comes; the plip and splash from `fen-sounds.js` `fish`. Scene 4 in `kafli2.js`: `s.camera.cut('siki_fishing')`, `k2_uggedla_help`, `yield* fishing(s, c)`, `k2_uggedla_thanks`.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit;** a video for the owner of a child tapping: two big, one small, waiting for the hint, three more big.

---

### Task 6: The channel, the invitation and star, the ferry, the hummocks and the book

**Files:**
- Modify: `remake/chapters/kafli2.js` (scenes 3, 5, 6, 7; `story`; remove the temporary end; `chapter.lines`, `cast.uggedla`; header comment), `remake/assets/audio/kafli2/lines-source.json`, `remake/tests/kafli2.test.mjs`

**Interfaces:**
- Consumes: Task 3's points and shots, Task 4's generators and `createBackSeat`, Task 5's `fishing`.

- [ ] **Step 1: Failing tests** (idle play through the harness):
  - the scenes run 1 to 7 in order (`chapterTimeline`), and the chapter ends in ≤ 450 s;
  - scene 3: `k2_mosi_flooded`, `k2_egill_across`, the sail rises, `k2_mosi_boat`, `k2_egill_helloboat`, her head comes up, `k2_mosi_notboat`, `k2_uggedla_hello`, then `s.place('uggedla')` once; a tap on the sail while it stands in the reed makes it glitter and nothing else;
  - scene 5: `k2_mosi_invite_ugg`, `k2_uggedla_accept`, `s.star('k2_uggedla', …)` from the top of her sail, `k2_mosi_second`; an idle child's star flies in by itself;
  - scene 6: Egill floats onto her back seat, the chat lines in the table's order from `k2_uggedla_aboard` to `k2_egill_head`, her tail splash comes with `k2_uggedla_tail`, Mosi wades beside her (his feet in water 0.3–0.6 m deep), Þórseðla's head is in frame above the tree line in at least one ferry shot as `k2_egill_head` is said;
  - scene 7: Egill floats back into Mosi's saddle (root within 5 cm of the seat), `k2_uggedla_berries`, `k2_mosi_thanks_ugg`, she swims off and is hidden once out of view, the book opens on `dinosaurs` with `nod: 'uggedla'` and turns to `map`, `k2_mosi_two`, and the script ends (so main.js shows "Áfram" into `kafli3`);
  - Review Focus 1: run the chapter on the old save (stars `k1_kambedla, k2_thorsedla`, places `fen, sloedla, flugedla, uggedla`): it plays through, `place('uggedla')` adds nothing new, the save then has `k2_uggedla`, and `defaultChapter` is `kafli3`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the scenes as the spec's section 4 writes them (shots from Task 3, timing ≈ 35 / 35 / 45 / 25 s). The map marker for `uggedla` flies from her head's place on screen (`s.place('uggedla', screenOf(...))`, as the lookout did). The star waits for a tap 8 s at most, as chapters 1 and 2 did.
- [ ] **Step 4: Run; expect PASS.** Play `?chapter=kafli2` from the glade to "Áfram" in the browser with no console errors.
- [ ] **Step 5: Commit;** a video for the owner of scenes 3 to 7 (idle) at 1280×800.

---

### Task 7: Voices, sounds, the Veiddu tile and the finish

**Files:**
- Modify: `remake/assets/audio/kafli2/lines-source.json`, `remake/assets/audio/kafli2/*.mp3` (new), `remake/assets/audio/lines.json`, `remake/assets/audio/pronunciation.json` (only if a word needs a rule), `remake/engine/audio/fen-sounds.js` (new sounds), `remake/engine/book/book.js` (CRLF; the Veiddu tile, only if the Veiddu game is in main by then), `remake/tests/kafli2.test.mjs`, `remake/tests/kafli3.test.mjs`, `remake/tests/book.test.mjs`

**Interfaces:**
- Consumes: `voices.json` `uggedla` (Task 2). The Veiddu game's id and entry point from the Veiddu session (the controller relays it); the tile's rule: shown once `k2_uggedla` is in the save's stars and the game exists, tap → `onPlay('veiddu')`.

- [ ] **Step 1: Record** every new line: `node remake/tools/voice-lines.mjs --set kafli2 --plan` lists them; `--ab kafli2` for any line whose words have a lexicon rule; then `--only <ids>`. "Einn!" gets plain v4 first; if the owner hears it wrong, the Litla Yatzy recipe (context "Við teljum á íslensku: einn, tveir, þrír, fjórir, fimm." + seed 7, as a line-level `context`/`seed` in lines-source.json).
- [ ] **Step 2: Yes/no page** for all new lines (`remake/tools/voice-pages.mjs`, `?set=kafli2`, only the new ids); the controller gives the owner `http://localhost:4240/...`; redo what he marks wrong.
- [ ] **Step 3: Sounds** in `fen-sounds.js`, in the theme's key: `sailRise` (reed rustle, 3–4 s), `jawSnap`, `gulp`, `tailSplash`, `swim` (soft water strokes, loopable for the ferry). Test 'every sound the script asks for exists' covers them. Listening page for the owner; if he rejects a made sound, propose a CC0 sample (name, source, size) and download nothing until he says yes.
- [ ] **Step 4: Veiddu tile** (if the game is in main; otherwise write in the progress note that the Veiddu session wires it to `k2_uggedla`): test in `book.test.mjs` that the tile is absent without `k2_uggedla`, present with it, and a tap calls `onPlay('veiddu')`.
- [ ] **Step 5: Empty `WAITING_FOR_VOICE`** in both test files; the whole suite passes.
- [ ] **Step 6: Full playthrough** in the browser from a fresh save (`?nyr=1`): chapter 1 → Áfram → chapter 2 → Áfram → chapter 3 to its book, no console errors; idle times of chapters 2 and 3 recorded in the progress note; bench of every `siki_*` key shot within budget.
- [ ] **Step 7: Commit;** the owner gets the video of chapter 2 whole and chapter 3's changed beats, and decides on merging.
