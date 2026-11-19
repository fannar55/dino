# Kafli 4 Flugmynd Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chapter 4's flight becomes a film. The four controls go, and six call shots from the animals' side are cut in at the
seconds where she passes them.

**Architecture:** The flight is already a schedule (engine/flier.js, kafli4-route.js KEYS and BEATS) cut into named shots
(engine/camera/flight-camera.js: bound shots ride with her; FIXED shots stand still). We take the controls out of
chapters/kafli4-flight-play.js and its callers. Then we add a table of call shots (`CALL_SHOTS` in kafli4-route.js) that the
camera, the stills list, the calls and the sounds all read. The animal groups learn to hear a call before they answer it.

**Tech Stack:** three.js r180, plain ES modules, node:test with `--import ./remake/tests/setup.mjs`, headless Edge or Chrome
capture tools (remake/tools/capture.mjs, chapter-video.mjs).

**Spec:** `docs/superpowers/specs/2026-11-15-kafli-4-flugmynd-design.md` (owner-approved 2026-11-15: "Já, smíða").

## Global Constraints

- Work only in `C:/Risaeðla/dino-kafli4-flugmynd` on branch `kafli4-flugmynd`. Never merge, push, bare `git stash`, or touch
  `design/` or `dist/` (reading `dist/vendor` is fine).
- Beats unchanged: `BEATS = { A: 0, B: 15, C: 35, D: 80, E: 105, F: 125, G: 150, END: 170 }`. The song's `SONG.at` and
  `SONG.seconds` are unchanged, and so is her schedule (KEYS, flier).
- Kept as they are: A, B, Mosi's cameos (mosiBank 57.5–63, mosiRim 96–99.5), the gorge's three quick shots (86, 87.5, 89), E with
  the slow second, the vista and Grameðla (F to 134), G and the landing.
- Camera: FLIGHT_RULES hold (fixed pans ≤40 deg/s, bound ≤1.2 m/s and ≤15 deg/s, shots ≥2.5 s except the three quick ones), no
  roll on stills, CLEAR 1.2 m over ground and water, no shake, no flashing.
- Tablet budget per frame: ≤6 ms GPU at 1280x800, ≤100 draw calls, ≤250k triangles, ≤96 MB of textures. Measure only when the
  machine is quiet.
- Keep each file's line endings: the repo is `* -text`. `remake/main.js` and `remake/engine/book/book.js` are CRLF. Check
  `git ls-files --eol <file>` before editing a file and `git diff --stat` before each commit.
- Voice lines only through `remake/tools/voice-lines.mjs` (read CLAUDE.md). Never print, log or write ELEVENLABS_API_KEY.
- Commit WIP at least every 20 minutes. Each commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No Claude-drawn art. No downloads without the owner's yes (name, source, size).
- Ledger: `.superpowers/sdd/2026-11-15-kafli-4-flugmynd/progress.md`. Every deviation gets a `Ruling:` line.
- Test command (from the worktree root): `node --import ./remake/tests/setup.mjs --test <files>`. Full suite:
  `npm run test:remake`.

## Review Focus

1. A seek or review link (`t=…&play=1`) between a call shot's call and her pass. The heads are already up, not down and then
   snapping up. (Task 3: `seek mid call shot finds heads up`.)
2. A line still playing at a call shot's call second. Her call is skipped (`ifQuiet`), so the animals look up at nothing. In the
   untouched flight every call shot's call is voiced. (Task 3: `every call shot's call is heard`.)
3. A tablet in portrait (820x1180, aspect 0.69). The group and her pass are both inside the narrow frame. (Task 2:
   `call shots frame the group and her pass at both sizes`.)
4. Reduced motion. The run-along is a still, and the herd shot still cuts in at 135 over the still vista. (Task 4:
   `reduced motion: run-along stands still`.)
5. Close critters in plants, or a tree between the lens and the action. (Task 2: tree probe on each call shot's lines of sight;
   Task 5: the stills show it.)

---

## Step 1: the shots, shown as key-frame stills

### Task 1: The controls go

**Files:**
- Modify: `remake/chapters/kafli4-flight-play.js`, `remake/chapters/kafli4-flight.js`, `remake/chapters/flug.js`,
  `remake/engine/camera/flight-camera.js` (boost), `remake/assets/audio/kafli4/lines-source.json`
- Remove or reduce: `remake/chapters/flug-track.js` (`?chapter=flug&play=track1`)
- Test: `remake/tests/flug.test.mjs`, `remake/tests/kafli4.test.mjs`, `remake/tests/flight-camera.test.mjs`,
  `remake/tests/flier.test.mjs`, `remake/tests/flight-sounds.test.mjs`

**Interfaces:**
- Produces: `flightPlay(s, c)` with `enable('call', on)`, `update(t)`, `bigCall()`, `stop()`, `calls`, `answers`, `big` (no
  `steer`, no `faster`, no drag or tap handlers). `PLAY` keeps `callAhead: 25`, `answerAfter: 0.6`, `bigCall: 135`,
  `bigAnswers` and `cryPan`. Everything for steering, skimming, bursts, targets, the glitter and the guide goes, and so does
  `camera.boost`.

- [ ] **Step 1: Write the failing tests** in `flug.test.mjs`: `a drag or a tap in the flight changes nothing`. Play the flight
  untouched, then again with synthetic drags (sideways 300 px and down 80 px at 20, 40 and 70 s) and taps on each group's last
  target point and on the land. Assert that her pose every 0.5 s (within 1e-6), the shot names with their cut seconds, and the line
  ids with their start seconds are identical. Also `no button or targets in the flight`: no element with the old button's class
  in `c.doc`, `s.targets` has no `group:` entries, and no glitter set is added to the world.
- [ ] **Step 2: Run them** and expect FAIL (today a drag moves her and a tap calls early).
- [ ] **Step 3: Remove** the drag handler, skim, ring, splash and laugh code, the „Hraðar!“ button and bursts, the tap targets,
  the glitter, the tap chime and burst, `PLAY.guide` and its lines, the bank whoosh, `camera.boost` and the speed lines of a burst.
  Groups are called only by themselves (`callGroup(g, 'auto')`). The big call comes only at `PLAY.bigCall`. Remove the
  `play.enable('steer'|'faster', …)` calls in kafli4-flight.js and the F comment about taps. Drop from lines-source and the
  chapter's line lists: k4_flugedla_steer, k4_flugedla_faster, k4_flugedla_skim, k4_flugedla_animals, k4_egill_faster1,
  k4_egill_faster2, k4_flugedla_holdon, k4_flugedla_holdon2, k4_flugedla_holdon3, k4_egill_laugh, k4_egill_splash and
  k4_egill_laugh2. Keep TAPPED's lines (Task 6 places them). The speed lens (SPEED_LENS) stays. Whether flier.js keeps
  steer/skim/burst, and whether the dropped mp3s leave the repo, are rulings: `node remake/tools/voice-lines.mjs --plan` must
  show 0 to make either way.
- [ ] **Step 4: Remove the tests** that drive steer, skim, faster or taps (flug, kafli4, flight-camera, flier, flight-sounds).
  Run all five files and expect PASS.
- [ ] **Step 5: Commit**: "Kafli 4 flugmynd: the flight's four controls go".

### Task 2: The call shots table and the call camera

**Files:**
- Modify: `remake/chapters/kafli4-route.js` (CALL_SHOTS, STILLS), `remake/engine/camera/flight-camera.js` (FIXED.call,
  stillViews), `remake/chapters/kafli4-flight.js` (the cues of C)
- Test: `remake/tests/flight-camera.test.mjs`, `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Produces `CALL_SHOTS` (exported from kafli4-route.js): `[{ id, shot, group, from, to, call, pass, options }]`, in flight
  seconds. `shot` is one of 'call', 'runAlong', 'ledge' or 'herd'. `group` is a GROUPS id, a nest index (ledge) or a herd id
  (herd). `call` is when her call starts, `pass` when she is nearest the group.
  - Rows 1–3: `kall-edlur` (lizards-1), `kall-froskar` (frogs-2), `kall-fuglar` (birds-2), shot 'call'.
  - Row 4: `kall-hlaup` (lizards-2 and 3), shot 'runAlong'.
  - Row 5: `kall-sylla`, shot 'ledge'.
  - Row 6: `kall-hjord` (stepNorth), shot 'herd'.
- STILLS loses `['waterLevel', 51, 53.6]`, `['bankShadow', 63, 68]` and `['gorgeHigh', 90.5, 96]`. It gains a row
  `[row.shot, row.from, row.to, { ...row.options, callShot: row.id }]` for each CALL_SHOTS row, so stillViews and the plants'
  keep-out cover them.
- Produces `FIXED.call(c, { group, back = 6, above = 0.8, aside = 0, fov = 44, look = 0.5 })`. The camera stands `back` m
  behind the group's middle, away from the river (groupOut), `above` m over the ground and `aside` m along the bank. It looks at
  a point `look` of the way from the group's middle to where she passes (route.pointAt of `pass`). bankShadow goes; its test moves
  to 'call'.

- [ ] **Step 1: Write the failing tests** in flight-camera.test.mjs:
  - `CALL_SHOTS rows are ordered, inside their beats and at least 2.5 s`: each row has `from < call < pass < to`. Rows 1–4 lie
    in C, row 5 in D and row 6 in F. No row overlaps another or mosiBank or mosiRim. Each row satisfies `pass - from >= 3.5` and
    `to - pass >= 2`.
  - `call shots frame the group and her pass at both sizes`: for each 'call' row, at aspects 1.6 and 0.69 with the shot's fov,
    the group's middle and her position at `pass` project inside the frame (|x|, |y| ≤ 0.95 in NDC).
  - `call shots stand clear`: the camera is ≥ CLEAR over the ground and water. The tree probe (engine/tree-probe.js, the
    valley's tall plants) finds nothing on the segment from the camera to the group's middle, nor on the segments to her position
    every 0.25 s from `call` to `pass + 1`.
  - Update `stillViews` expectations for the new rows.
- [ ] **Step 2: Run** `node --import ./remake/tests/setup.mjs --test remake/tests/flight-camera.test.mjs` and expect FAIL
  (CALL_SHOTS is not defined).
- [ ] **Step 3: Implement** CALL_SHOTS rows 1–3 with first seconds from her passing times (lizards-1 43.1, frogs-2 51.9,
  birds-2 64.0). Use `from ≈ pass − 3.8`, `call ≈ pass − 2.4` and `to ≈ pass + 2.5`. Move birds-2 along the river (its `d`
  in GROUPS) until `from ≥ 63.0`, after mosiBank. Record that as a Ruling with the new d and pass. Also implement FIXED.call, the
  STILLS change, and kafli4-flight.js C cues that cut to each call row at `from` and back to 'chase' or 'side' at `to`. Rows 4–6
  are stubbed to their Task 4 kinds as plain 'call' shots for now, or left out until Task 4: a Ruling.
- [ ] **Step 4: Run** flight-camera, kafli4 and ardalur tests and expect PASS (the plants' keep-out moves with STILLS).
- [ ] **Step 5: Commit**: "Kafli 4 flugmynd: the call shots' table and camera".

### Task 3: She calls early, they hear, and they answer as she passes

**Files:**
- Modify: `remake/chapters/kafli4-flight-play.js`, `remake/world/ardalur/animals.js`
- Test: `remake/tests/kafli4.test.mjs`, `remake/tests/ardalur.test.mjs`

**Interfaces:**
- Consumes: CALL_SHOTS (Task 2).
- Produces: `group.hear(at)` on each animals group, where `at` is a game second. From `at` the members turn toward her and look up
  (smaedla: the 'look' clip, easing in over 0.4 s; a kind without a look clip only turns) until `answer()`. A group in CALL_SHOTS
  is called at its row's `call` second (`callGroup(g, 'shot')`), hears at once, and answers at `pass + PLAY.runAfter`
  (`runAfter: 0.3`). Other groups stay as now (callAhead 25 m, answerAfter 0.6).

- [ ] **Step 1: Write the failing tests**:
  - `call shot groups are called at their second`: in the untouched flight, `play.calls` has the row's group with
    `how === 'shot'` and `t` within 0.05 s of `call`.
  - `heads are up before she passes`: for rows 1 and 4 (lizards), every member's look weight is ≥ 0.8 from `pass − 0.8` to
    `pass`. Before `call` the drinkers are in 'drink'.
  - `they run after she passes`: the answer comes at `pass + 0.3 ± 0.05`.
  - `every call shot's call is heard`: each 'shot' call has `voiced === true`.
  - `seek mid call shot finds heads up`: seek the review chapter to `pass − 1`. The group's look weight is ≥ 0.5 on the first
    frame.
- [ ] **Step 2: Run** the kafli4 and ardalur tests and expect FAIL.
- [ ] **Step 3: Implement** `hear` in animals.js (the smaedla pose mixes 'look' by a hear weight, as it mixes it by her nearness
  today, whichever is larger) and the 'shot' calls in flightPlay. If a line is planned across a call second (for example
  Egill's „Vá!“ or Mosi's line), move that line, not the call, and record a Ruling.
- [ ] **Step 4: Run** them and expect PASS. Then run flug and flight-camera and expect PASS.
- [ ] **Step 5: Commit**: "Kafli 4 flugmynd: call shot groups hear her before she passes".

### Task 4: The ledge, the herd and the run-along

**Files:**
- Modify: `remake/engine/camera/flight-camera.js` (FIXED.ledge, FIXED.herd, the moving stand, FLIGHT_RULES.track),
  `remake/chapters/kafli4-route.js` (rows 4–6), `remake/chapters/kafli4-flight.js` (D and F cues), `remake/world/ardalur/life.js`
  only if the flyer needs a head turn
- Test: `remake/tests/flight-camera.test.mjs`, `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Produces:
  - `FIXED.ledge(c, { nest, out = 1.5, above = 0.6, fov = 46 })` beside NESTS[nest], looking down the gorge the way she comes.
  - `FIXED.herd(c, { group = 'stepNorth', back = 7, above = 1.0, fov = 50 })` among the herd, looking up toward her at `pass`.
  - A moving stand for 'runAlong': `{ path: [[x, z], [x, z]], above, fov, look }` whose position moves along `path` from `from`
    to `to` at constant speed, eased over its first and last 0.5 s.
  - `FLIGHT_RULES.track = { speed: 7, pan: 40 }`: the stand's speed in m/s and its pan, both linted.
  - Under reduced motion the stand is still at its path's middle.
- Row 5 replaces gorgeHigh (90.5–96). Pick the nest whose pass fits the rules (NESTS passes: 83.8, 86.1, 88.0, 90.6, 92.4, 94.8,
  97.0, 99.7). The window may shift within 88–96, and the quick shots and mosiRim stay. Record the nest as a Ruling.
- Row 6 cuts in at 135.0. The orbit starts after the row's `to` with its sweep shortened to end at 150 (BOUND.orbit `seconds`
  becomes the time left). The big call stays at `PLAY.bigCall` (135), and „Ég sé allt!“ stays at `max(141, big.at + 6)`, or after
  the row's `to` if that is later.

- [ ] **Step 1: Write the failing tests**:
  - `run-along keeps the track rules` (speed ≤ 7, pan ≤ 40, no roll).
  - `reduced motion: run-along stands still`.
  - `ledge shot sees the flyer leave`: the flyer's nest is in frame at `from`, and the flyer leaves within the shot.
  - `herd shot sees heads come up`: stepNorth members' look weight rises within the shot, and her position is in frame at `pass`.
  - Extend the Task 2 framing and clearance tests to rows 4–6.
- [ ] **Step 2: Run them** and expect FAIL.
- [ ] **Step 3: Implement** the three kinds, rows 4–6, and the D and F cues. Lizards-2 and lizards-3 may join into one running
  group for row 4 (a Ruling), and their run may outlast RUN.seconds while the shot holds.
- [ ] **Step 4: Run** flight-camera, kafli4, flug and ardalur and expect PASS.
- [ ] **Step 5: Commit**: "Kafli 4 flugmynd: the ledge, the herd and the run-along".

### Task 5: Key-frame stills for the owner (step 1's look)

**Files:**
- Create: a capture script in the ledger folder (written with the Write tool and run by path), and output in
  `qa/remake/kafli4/flugmynd-myndir/` (outside git)

- [ ] **Step 1:** For each CALL_SHOTS row, capture three moments: heads down (`from + 0.5`), her pass (`pass`) and the run
  (`to − 0.5`). Use `remake/tools/capture.mjs` on the full chapter's seek (`chapter=kafli4&t=<flight second + the chapter's
  flight start>&play=1`) or the review chapter (`chapter=flug&lit=1&t=…`), at 1280x800 and at 820x1180. Use `--bench 0`, and
  keep report.json (errors 0).
- [ ] **Step 2:** Make one contact sheet per size (rows = shots, columns = the three moments, each labelled with the shot's id
  and second).
- [ ] **Step 3:** Run the full suite (`npm run test:remake`, output to the ledger folder, read its tail) and expect all to pass.
- [ ] **Step 4:** Commit the WIP. Report to the coordinating session:
  - the sheets' paths;
  - each row's seconds;
  - any group moved and why;
  - the chosen nest;
  - the triangle and call counts from report.json;
  - whether any close critter looks too coarse. If one does, stand the camera back first. A finer near level of detail is the
    owner's question.
  
  **STOP.** Wait for the owner's look before Task 6.

## Step 2: the cut

### Task 6: Sound and lines

**Files:**
- Modify: `remake/engine/audio/flight-sounds.js`, `remake/chapters/kafli4-flight.js`, `remake/chapters/kafli4-flight-play.js`
- Test: `remake/tests/flight-sounds.test.mjs`, `remake/tests/kafli4.test.mjs`

**Interfaces:**
- Produces `sounds.ground(on)`. While the camera is on the ground (a CALL_SHOTS shot), the wind bed and the airflow dip about
  12 dB over 0.3 s, and they come back over 0.3 s on the cut back to her. The flight sets it from `camera.onCut`.
- In a call shot her call is panned to her side as the camera sees her (`panOf`). At `pass − 0.15` there is a whoosh to her
  side, and a wingbeat as she is nearest.
- Egill's lines once each, on the shot after their call shot, with `ifFree`:
  - k4_egill_lizards after row 1;
  - k4_egill_frogs after row 2;
  - k4_egill_birds after row 3;
  - k4_egill_flyers after row 5. It replaces the JUICE.flyers timing.

- [ ] **Step 1: Write the failing tests**:
  - `ground shots dip the wind`: the bed's level target is lower during each row and back after it.
  - `Egill answers each call shot once`: line ids with start seconds after each row's `to`, each played once.
- [ ] **Step 2: Run them** and expect FAIL.
- [ ] **Step 3: Implement.** If row 6 reads flat without a line, propose one new Egill line (for example „Sjáðu, allir koma
  með!“) in the report. Do not record it before the owner says yes.
- [ ] **Step 4: Run** and expect PASS. Then make the yes/no page for every chapter 4 line the cut plays:
  `node remake/tools/voice-lines.mjs --yesno kafli4 --only <ids>`. It writes `qa/remake/voices/janei/kafli4.html`; keep
  k4_flugedla_biggest on it.
- [ ] **Step 5: Commit**: "Kafli 4 flugmynd: the call shots' sound and Egill's answers".

### Task 7: The cut, measured (step 2's look)

- [ ] **Step 1:** Make the video of the review chapter and of the whole chapter:
  `node remake/tools/chapter-video.mjs --out qa/remake/kafli4/flugmynd --chapter flug --query "lit=1" --sound --stats`, at
  `--size 1280x800` and `--size 820x1180`. Make a phone copy with ffmpeg (≤ 720 px wide). Errors must be 0.
- [ ] **Step 2:** Bench both sizes on the quiet machine. Include the heaviest second of each row and the old bench frames, and
  check them against the budget.
- [ ] **Step 3:** Run the full suite and expect all to pass. `voice-lines --plan` and `heard --plan` must be clean.
- [ ] **Step 4:** Commit the WIP. Report the video paths, the bench and the yes/no page URL (port 4266). **STOP** for the
  owner.

## Step 3: finish

### Task 8: His fixes, then the branch

- [ ] **Step 1:** Make each fix he asks for with a test where one can pin it. Use the same capture tools for any new look.
- [ ] **Step 2:** Import his yes/no file with `node remake/tools/heard.mjs <jano.json> --made <voices-made.json as he heard it>`
  and commit what it writes. Re-record only the lines he rejected, with 3–4 candidates per CLAUDE.md.
- [ ] **Step 3:** Self-review the whole branch (no reviewer agents) and write `Final review: self-review` in the ledger. Then
  run the full suite.
- [ ] **Step 4:** Report the rulings and the deferred minors, and ask through the coordinator whether to merge into main.
