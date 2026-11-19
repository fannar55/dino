# Hvar er vinur minn? New UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The memory game's screen is cut to the minimum the small games show (pause, Mosi to ask, the basket with the pairs, what to tap), in Litla Yatzy's look, and what the child must tap stands out at once.

**Architecture:** Mosi's ask-and-repeat rules are a small pure module (`engine/memory/coach.js`) tested on their own; the speech layer reports the last line that began. The shell (markup, CSS, game.js DOM code) is then rebuilt in one task on Yatzy's tokens and wired to that module. The playthrough tool follows the new ids last and makes the owner's before/after pictures.

**Tech Stack:** plain ES modules, three.js page `remake/minnisspil.html`, CSS, `node --test`, the repo's headless playthrough tool (Edge).

**Spec:** `docs/superpowers/specs/2026-11-06-hvar-er-vinur-minn-vidmot-design.md` (Icelandic; the binding authority). UI map of the current code: `.superpowers/sdd/2026-11-06-hvar-er-vinur-minn-vidmot/ui-map.md` (file:line for every element, test and tool hook).

## Global Constraints

- Worktree `C:/Risaeðla/dino-minnisspil`, branch `codex/minnisspil-first-playable` (at main 8eb1972 plus the spec, 53bb913). Commit there; never merge, push or switch branches.
- Both levels: everything here applies to Berjalundurinn (`?bord=1`) and Steinagljúfrið (`?bord=2`).
- No change to the game's rules, scenes, world, voices or sounds. Only the screen around them.
- No new art. The round buttons, `.mosi-help`, `.panel` look and the tap hint (ring and drawn finger) are copied from `remake/yatzy-junior.css` / `engine/yatzy-junior/game.js:92-94`; Mosi's picture is `./assets/eitt/mosi.webp`, the friends' are `./assets/memory/portraits/<species>.webp`, the basket and HUD marks are the levels' own (`level.hud`, `BASKET_ICON`).
- No new voice line, and no voice tool run except `node remake/tools/memory-voices.mjs --dry` / `--verify` (they make nothing). Never read, print or write `ELEVENLABS_API_KEY`.
- Every control at least 88 px (`--target: 88px`, Yatzy's rule); Mosi's button 112 px, 80 px at `max-width: 560px`. Nunito only.
- Icelandic words on screen, exactly as the spec gives them: "Spyrja Mosa", "Mosi bíður.", "Halda áfram", "Rólegri hreyfing", "Byrja upp á nýtt", "Hver getur þetta?", "Aftur" (the picker's back button's aria-label).
- Ids the playthrough tool and tests still use stay: `#targets`, `#who`, `#cancel-choice`, `#caption`, `#coach`, `#holding`, `#beat-word`, `#progress`, `#basket`, `#basket-text`, `#pause`, `#pause-dialog`, `#restart`, `#motion`, `[data-resume]`, `#welcome`, `#level-cards`, `#start`, `#ending`, `#ending-copy`, `#ending-gifts`, `#again`, `#ending-next`, `#credits-toggle`, `#credits`, `#loading`, `#error`, `#retry`, `.topbar`, `.is-guided` (the class that marks what the hint points at). `window.__memory` keeps every member it has.
- `tests/memory-bridge-rules.test.mjs:379` slices `game.js` between `function askObstacle` and `function pickFriend`: keep both names and their order.
- No new test files. Tests go in `remake/tests/memory-rules.test.mjs` and `remake/tests/memory-presentation-audio.test.mjs`. Run `cd remake && npm run test:memory`, never the root `npm test`.
- Line ends: the repo is `* -text`. Every file this plan touches is LF (0 CR) except `remake/README.md` (292 CR, do not touch it). Check `git diff --stat` and CR counts before each commit.
- Never touch `design/` or `dist/`. Never use a bare `git stash`.
- Builders: commit work in progress often, each commit ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; keep a RESUME NOTE at the top of the task report; never dispatch subagents; run long jobs in the background; the playthrough tool starts its own server (or use your own port, e.g. 4227); stop your own processes; never stop the servers on 4190, 4197, 4221 or 4260.
- Bash heredocs mangle backslashes: write scripts with Write and run them by path.

## Review Focus

1. **A tablet that was muted before the update.** The old game saved `mosi.memory.muted.v1 = "true"`; with the sound button gone, the game must play sound anyway and remove the key. Pinned: Task 1 `forgetOldMute` tests, Task 2 wiring check.
2. **Mosi tapped while he speaks, during a scene, while paused, or ten times fast.** Nothing starts over a line or a scene, and lines never stack. Pinned: Task 1 `askLine` tests (speaking, busy), Task 2's `askMosi` uses `held()` and the scene/active checks.
3. **A phone held upright (390 × 844).** The corner chip, the pause button, Mosi's button, his bubble and the bigger picker (88 px faces, the round "Aftur") never cover each other or the friends being asked about. Pinned: Task 3's 390 runs (the tool's WHO and HUD overlap checks, 0 errors).
4. **A child who waits.** The finger comes at 4 s, Mosi repeats once at 10 s and never again for that moment, never while paused or on the welcome card, and a restart forgets what he said. Pinned: Task 1 `repeatDue` tests, Task 2's reset in `start()`, Task 3's arrow checks at the new time.
5. **A gift pair found at 390.** The pair flies to the basket in the new top-left chip (`basketPoint` reads `#basket`): the chip must be on screen, never `hidden` or zero-sized while gifts are in play. Pinned: Task 3's runs (`report` basket counts match `__memory.basket()`, the gift flight lands).

---

### Task 1: Mosi's ask and repeat rules, and the speech layer's last line

**Files:**
- Create: `remake/engine/memory/coach.js`
- Modify: `remake/engine/memory/presentation-audio.js` (`createMemorySpeech`, the returned object)
- Test: `remake/tests/memory-rules.test.mjs`, `remake/tests/memory-presentation-audio.test.mjs`

**Interfaces:**
- Produces (Task 2 uses all of these):
  - `export const IDLE_HINT = 4` (seconds without a tap before the finger shows)
  - `export const IDLE_REPEAT = 10` (seconds without a tap before Mosi says the moment's line again)
  - `export const OLD_MUTE_KEY = 'mosi.memory.muted.v1'`
  - `export function forgetOldMute(storage): void` (removes `OLD_MUTE_KEY`; `storage` may be `null`/`undefined`, and its `removeItem` may throw: never throws)
  - `export function momentLine({ key, last, voice }): string | null` (`last` is `{ id, key } | null`, the last line that began and the story key it began under; `voice` is `level.voice` or `undefined`. Returns `last.id` when `last?.key === key`, else `voice?.[key] ?? null`)
  - `export function askLine({ key, last, voice, help, speaking, busy }): string | null` (`null` when `speaking` or `busy`; else `momentLine(...) ?? help ?? null`)
  - `export function repeatDue({ idle, key, repeated, mayAct, speaking, line }): boolean` (true only when `idle >= IDLE_REPEAT && mayAct && !speaking && line !== null && repeated !== key`)
  - speech: `lastStarted(): { id: string, n: number } | null` (the last line that began to play; `n` is the speech's running `played` count, so a line said twice has a new `n`; a delayed `play(id, seconds)` counts when it begins, not when it is asked for)

- [ ] **Step 1: Before pictures (the owner's "fyrir").** On BASE, before any change, run the full playthrough (the default `--mode full`: `rapid` takes no pictures) for both levels at both sizes, with the old help dialog's picture:
  `node remake/tools/memory-playthrough.mjs --out qa/memory/vidmot/fyrir/l1-1280 --level 1 --size 1280x800 --help-shot`
  and the same for `l2-1280` (`--level 2`), `l1-390` and `l2-390` (`--size 390x844`). Expected: each ends with 0 errors and a `report.json`. They are long: run them in the background, one after another.
  The welcome card and the pause dialog are not milestones of the tool: take them with `remake/tools/capture.mjs --page remake/minnisspil.html` into `qa/memory/vidmot/fyrir/kort-<size>/`, one run with `--shot welcome1="bord=1" --shot welcome2="bord=2"`, and one with an `--eval` that clicks `#start` and then `#pause` (`--shot pause1="bord=1" --shot pause2="bord=2"`), at 1280x800 and at 390x844.
- [ ] **Step 2: Write the failing tests** in `memory-rules.test.mjs` (import from `../engine/memory/coach.js`):
  - `forgetOldMute`: a memory storage holding `OLD_MUTE_KEY: 'true'` has no such key afterwards; `forgetOldMute(null)` and a storage whose `removeItem` throws do not throw.
  - `momentLine`: `{ key: 'a', last: { id: 'who', key: 'a' } }` → `'who'`; `{ key: 'b', last: { id: 'who', key: 'a' }, voice: { b: 'g2_lit' } }` → `'g2_lit'`; `{ key: 'b', last: null }` → `null`.
  - `askLine`: `speaking: true` → `null`; `busy: true` → `null`; nothing said and no voice, `help: 'g2_help'` → `'g2_help'`; a line said under this key wins over `help`.
  - `repeatDue`: `idle: 9.9` → false; `idle: 10, key: 'a', repeated: null, mayAct: true, speaking: false, line: 'who'` → true; the same with `repeated: 'a'` → false; with `speaking: true` → false; with `line: null` → false; with `mayAct: false` → false.
  - `IDLE_HINT === 4`, `IDLE_REPEAT === 10`.
  In `memory-presentation-audio.test.mjs` (with the file's existing fakes for fetch and Audio): `lastStarted()` is `null` before any line; after `play('a')` it is `{ id: 'a', n: 1 }`; after `play('b')` `{ id: 'b', n: 2 }`; a `play` that returns false (unknown id, or muted) leaves it as it was; after `play('c', 1)` it is still `b` until the clock has run the second and `c` begins.
- [ ] **Step 3: Run them to see them fail.** `cd remake && npm run test:memory`. Expected: FAIL, `coach.js` not found and `lastStarted` not a function.
- [ ] **Step 4: Implement** `engine/memory/coach.js` (the functions above, a header comment saying what the spec asks of Mosi's button and the repeat) and `lastStarted` in `createMemorySpeech` (kept from the `started` push in `play`).
- [ ] **Step 5: Run the tests.** `npm run test:memory`: all pass (167 before this task, plus the new ones).
- [ ] **Step 6: Commit** `coach.js`, `presentation-audio.js` and both test files.

### Task 2: The new shell on both levels

**Files:**
- Modify: `remake/minnisspil.html`, `remake/minnisspil.css`, `remake/engine/memory/game.js`, `remake/engine/memory/levels/berjalundur.js`, `remake/engine/memory/levels/steinagljufur.js` (only fields no code reads any more), `remake/engine/memory/README.md` (the page's parts)
- Test: `remake/tests/memory-rules.test.mjs` (the markup tests at :337-354 and :516-527, and the `journey` names at :259)

**Interfaces:**
- Consumes: Task 1's `coach.js` exports and `speech.lastStarted()`.
- Produces (Task 3 relies on these): `#mosi-help` (button, `class="mosi-help"`, `aria-label="Spyrja Mosa"`); `.tally` (the top-left chip holding `#progress` and `#basket`); `.corner` (top right, holding `#pause` as `class="round"`); `#cancel-choice` inside `#who` (`class="round who-back"`, `aria-label="Aftur"`); a `.tap-hint` child (`<i class="tap-ring">` + the finger svg) in every `#targets` button, shown while the button has `.is-guided`; `#game[data-choosing="true"]` while the picker is open or a tap-along runs; `window.__memory.ask` unchanged, plus `window.__memory.askMosi()` (the same path as the button) and `window.__memory.lastLine()` (the `{ id, key }` Mosi's button would use).

- [ ] **Step 1: Rewrite the markup tests first** (`memory-rules.test.mjs:337-354`): level 1's first paint now holds, and must not hold, these:
  - holds: `<h1 class="sr-only">Hvar er vinur minn?</h1>`; `<h2>${welcome.title}</h2>`; `<p>${welcome.lines.join('<br>')}</p>`; the start button's words; `<h2>${ending.title}</h2><p id="ending-copy">${ending.text}</p>`; the again button's words; the loading words; `id="targets" aria-label="${aria.targets}"`; the `#progress` dots (`${'<i></i>'.repeat(friends.length)}`, `aria-label="0 af ${friends.length} pörum fundin"`) with no `progress-text`; the `#basket` markup as today; `<button id="pause" class="round" type="button" aria-label="Gera hlé">`; `<button id="mosi-help" class="mosi-help" type="button" aria-label="Spyrja Mosa">`; `<h2>Mosi bíður.</h2>`.
  - must not hold: `id="camera"`, `id="sound"`, `id="help"`, `help-dialog`, `overview-hint`, `adventure-ribbon`, `id="journey"`, `class="eyebrow"`, `class="fine"`, `class="speaker"`.
  - A source check on `game.js`: it imports from `./coach.js`, calls `forgetOldMute(`, and has no `setMute(` and no `'mosi.memory.muted.v1'`.
  Keep the test at :516-527 (level cards, `#start` with `autofocus`, the `unlockNext` and win regexes) as it is. Replace :259's `journey` assertion if the `journey` fields go (Step 6).
  Run `npm run test:memory`: those tests FAIL.
- [ ] **Step 2: `minnisspil.html`.**
  - `.topbar`: `.tally` (left: `#progress` with the dots only, `#basket` as today) and `.corner` (right: `#pause.round`, the two-bar svg). The ribbon, `nav`, `#camera`, `#sound`, `#help` go. The `#trail-*` symbols go from the icon library; `#leaf-mark` and `#berry-mark` stay if still used.
  - `#mosi-help`: a button at the bottom left with Mosi's picture (`<img src="./assets/eitt/mosi.webp" alt="" width="112" height="112">`), outside `#coach`.
  - `#coach`: the bubble only (`#caption`, `#holding`); `.coach-portrait`, `.speaker` and `.coach-actions` go.
  - `#who`: `#cancel-choice` moves into it (`class="round who-back"`, the back-arrow svg, `aria-label="Aftur"`, `hidden`).
  - `#welcome`: Mosi's picture on top (`./assets/eitt/mosi.webp`, if it has none today), the title, the level's line, `#level-cards`, and `#start` as the gold pill (spec: "gulur „Leikum saman →“"); no `.eyebrow`, no `.fine`. `#pause-dialog`: Mosi's picture, `<h2>Mosi bíður.</h2>`, `[data-resume]` "Halda áfram" (big), then `#motion` "Rólegri hreyfing" and `#restart` "Byrja upp á nýtt" (plain pills). `#help-dialog` and `#overview-hint` go. `#ending`: no `.eyebrow`; the mark, title, copy, gifts line, `#again`, `#ending-next`, `#credits-toggle`, `#credits` stay.
- [ ] **Step 3: `minnisspil.css`.** Yatzy's tokens (`--paper --card --card-deep --ink --gold --gold-deep --target:88px --raise --pressed`) and rules for `.round`, `.corner`, `.mosi-help` (with its gold "?" `::after`), `.tap-hint`, `.tap-ring` and their keyframes (`tap-ring`, `tap-finger`, and `pick-glow` for the glow), copied from `yatzy-junior.css` with a comment naming the source. Then:
  - `.tally`: one small cream chip (3 px ink border, `--raise`), the dots and the basket icon with its count, no text label.
  - `#coach`: a cream bubble beside `#mosi-help` (its left edge clear of the button), no portrait.
  - `.world-target.is-guided .tap-hint` shown at once (no 3 s delay as in Yatzy: game.js applies `.is-guided` at `IDLE_HINT`); the old `.is-guided::after` chevron goes.
  - `.task-target.is-next` and `.tap-along`: Yatzy's gold `pick-glow` pulse, visible from the first frame they are set.
  - `.task-badge`: 64 px picture.
  - `#who`: `--who-size: 120px` (88 px at `max-width: 560px`); `.who-back` on the picker's top corner.
  - `#game[data-choosing="true"] :is(.tally, .corner)`: `opacity: .6` (the pause stays clickable).
  - Dialogs, `#ending`, `#loading`, `#error`: Yatzy's `.panel` look (cream card, 3 px ink border, big green/gold pill and plain pills, min 88 px high).
  - Reduced motion (`@media (prefers-reduced-motion: reduce)` and `#game[data-motion="reduced"]`, set from the `#motion` toggle): the glow and the finger shown, still.
  - Remove the rules for everything that left the markup (`.round-control`, `.adventure-ribbon`, `.journey`, `.trail-*`, `.overview-hint`, `.coach-portrait`, `.speaker`, `.choice-back`).
- [ ] **Step 4: `game.js`.**
  - Remove `muted`, `setMute`, and the `#sound`, `#camera` and `#help` handlers; `dialogs` is `[welcome, pause-dialog]`; `openDialog` and the dialog `close` handler lose their help cases. `setCameraMode` stays for `__memory.camera`.
  - At load, `try { forgetOldMute(localStorage); } catch {}` (sound is never muted now).
  - `applyLevelDom` writes only what is still on the page; `reflectProgress` sets the dots and the aria-label only; `reflectJourney`, `journeySteps` and the overview hint go; `refreshControls` drops the camera button and sets `$('game').dataset.choosing` (picker open or a `tapAlong` target enabled) and `dataset.motion` (`'reduced'` when `reducedMotion`).
  - `IDLE_ARROW` is replaced by `IDLE_HINT` from `coach.js`; every task and leaf button gets the `.tap-hint` child when it is made; task buttons are at least 88 × 88 (`Math.max(88, ...)`), leaves keep 44.
  - Mosi's button: `askMosi()` plays `askLine({ key: currentStory().key, last: momentLast, voice: level.voice, help: LINES.help, speaking: speech.isPlaying(), busy: held() || Boolean(bridge.getState().active) || Boolean(world?.sceneBusy()) })` with `speech.play(line)` and `caption(VOICE_LINES[line]?.text ?? '', CAPTION_HOLD[line] ?? 2.6)`; it counts as input (`noteInput()`). `#mosi-help` is hidden until `started`, and while the ending card or the welcome dialog is up.
  - `momentLast`: each frame, when `speech.lastStarted()` has a new `n`, `momentLast = { id, key: currentStory().key }`.
  - The repeat: each frame while not `held()`, when `repeatDue({ idle: idleTime, key: currentStory().key, repeated: repeatedKey, mayAct, speaking: speech.isPlaying(), line: momentLine({ key, last: momentLast, voice: level.voice }) })` (with `mayAct` the same as `refreshControls`' `mayExplore`), play that line with its caption and set `repeatedKey = key`.
  - The finger and the repeat both run on today's idle clock, `idleTime` (game.js:595): it stands still while the picker asks, during a scene or a tap-along, and while the camera moves. So neither comes while the picker is open; there Mosi's button and the bigger faces carry the moment. Do not change that clock.
  - `start()` (and so restart and "Spila aftur") resets `momentLast = null` and `repeatedKey = null`.
  - `reflectWho` places the picker between the bottom of `.topbar` and the top of `#coach` / `#mosi-help`, whichever is higher; the cancel button's `hidden` follows `whoVisible()` as today.
  - `window.__memory` gains `askMosi` and `lastLine: () => momentLast`.
- [ ] **Step 5: Level data.** Remove the fields no code reads any more (grep first; `levels/index.js` and any test that checks a level's shape must agree): `ribbon`, the steps' `journey`, `copy.help`, `copy.welcome.eyebrow`/`fine`, `copy.ending.eyebrow`, `copy.aria.journey`, `hud.mark` only if the ending card no longer uses it. `lines.help` stays (Mosi's button falls back to it). Update the level files' header comments.
- [ ] **Step 6: Run the tests.** `npm run test:memory`: all pass. `node remake/tools/memory-voices.mjs --dry` is byte-identical to before the task (no line moves).
- [ ] **Step 7: Look at it.** Two full playthroughs (pictures need `--mode full`, the default) into `qa/memory/vidmot/t2/`: level 1 at 390x844 and level 2 at 1280x800, in the background. Read the stills: nothing from the "Fer" list is on screen, the chip, pause and Mosi sit in their corners, the picker is bigger with its round back button, the finger shows on the guided leaf or task. Fix what is off. (The tool's HUD lists still name old ids until Task 3: a missing-element note there is expected, a page exception is not.)
- [ ] **Step 8: Commit** (the README's page parts updated in the same commit).

### Task 3: The playthrough tool follows, the runs, and the owner's pictures

**Files:**
- Modify: `remake/tools/memory-playthrough.mjs` (and its header)
- Output: `qa/memory/vidmot/eftir/…`, owner page `qa/memory/vidmot/index.html` (`qa/` is git-ignored, like the earlier owner pages in `qa/memory/bord2/t2/`)

**Interfaces:**
- Consumes: Task 2's ids, classes and `window.__memory.askMosi` / `lastLine`.

- [ ] **Step 1: The tool follows the new screen.**
  - `HUD` (PT:365): `['progress', 'basket', 'pause', 'mosi-help', 'caption', 'who', 'beat-word', 'holding', 'coach']`.
  - The arrow measure (`ARROW_JS`, PT:477-490) reads the guided button's `.tap-hint` element box instead of its `::after`, and its overlap list is `[['tally', '.tally'], ['controls', '.corner'], ['mosi', '#mosi-help'], ['caption', '#coach']]`; the same list in the HUD box sampler (PT:459-460, 485).
  - The idle waits (PT:1320, 1357) wait for `idle() > 4.4` (from 5.4).
  - `--help-shot` (PT:20, 803-809) taps `#mosi-help` after the glade picture instead of opening the help dialog: `report.mosiAsk = { line, caption, started }` (the line from `__memory.lastLine()` and the speech stats, the bubble's text), a picture `mosi-ask`; an error when no line started or the bubble is empty.
  - New check in every full run: after the first 10.5 s of idle at a moment with a line, Mosi's line began once more (`report.idleRepeat`), and never twice for the same moment (an error if it does).
  - `--hide-hud` (PT:780): `.topbar, #coach, #mosi-help, #targets, #who, #beat-word`.
  - Every other read of a removed id goes.
- [ ] **Step 2: Runs**, 0 errors each, into `qa/memory/vidmot/eftir/`:
  - full runs: level 1 and level 2, each at 1280 and 390, with `--help-shot` (now Mosi's button)
  - the welcome card and the pause dialog with `capture.mjs`, the same shots and sizes as Task 1 Step 1, into `qa/memory/vidmot/eftir/kort-<size>/`
  - `--restart-at` gift, celebration, ending (level 1); through, rope, pull, glow (level 2, `--query qa=1` where the header says), once each at 1280
  - one level 2 run at 1280 with `--video` (the owner's clip; encode with sound)
- [ ] **Step 3: Tests.** `npm run test:memory` and `node --test remake/tests/heard.test.mjs remake/tests/pronunciation.test.mjs` from the repo root: all pass.
- [ ] **Step 4: The owner's page** `qa/memory/vidmot/index.html`: before (Task 1's `fyrir`) and after (`eftir`) side by side, the same moments, at 1280 and at 390: the welcome card, the glade, the picker, the arrow then and the finger now on a guided target, a gift flying to the basket, the pause dialog, the ending card. Below them the level 2 clip with sound. Paths relative, Icelandic captions.
- [ ] **Step 5: Commit** the tool.
