# "Háls og hali", Þórseðla's Snakes and Ladders: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Háls og hali", a two-player snakes and ladders for a five-year-old: Egill on Mosi against Þórseðla, in a living 3D valley where her necks lift you up and her tails slide you down.

**Architecture:**
- The rules are a pure module under `remake/engine/hals/`.
- The valley is its own three.js scene, opened from the book, built from the chapter's forest, light and characters.
- Buttons and captions are DOM over it, reusing the book's touch, effects, font and sound.

**Tech Stack:** plain ES modules, three.js r180 (vendored), DOM and CSS, Web Audio, ElevenLabs v4 voices and ElevenLabs Music, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-18-hals-og-hali-design.md` (Icelandic, owner-approved 2026-10-18).

## Global Constraints

- **The owner's lean way of working** (`.superpowers/sdd/2026-10-18-hals-og-hali/working-rules.md`):
  - build fast and simply;
  - one test file in all (the rules);
  - `npm run test:remake` once at the end of each task;
  - commit after each piece;
  - one-line check-ins to the controller (SendMessage to `main`);
  - short reports.
- **Tablet budget:** at most 6 ms GPU, 100 draw calls and 250k triangles at 1280x800, as STYLE.md section 11 says. The ten Þórseðlas share one model, with LOD.
- **Look:** STYLE.md, game-like, every control at least 88 px, Nunito, transform and opacity for DOM motion, reduced motion gives fades.
- **Board:** 50 squares, 5 necks and 5 tails. Reaching or passing 50 wins. Pure-luck die, 1-6. The child starts.
- **Voices:** Mosi (`voices.json` `mosi`) counts and encourages; Þórseðla's voice (`thorsedla`) is chosen by audition. The line set is `hals`, in `remake/assets/audio/hals/`. Only one voice speaks at a time. The controller, not an implementer, runs every command that calls ElevenLabs.
- **Unlock:**
  - the book's Leikir page shows the game now, through a development switch;
  - the finished game unlocks it with the star `k2_thorsedla`.
- **Line endings:** `remake/README.md`, `remake/STYLE.md` and `remake/main.js` are CRLF; every other file is LF.
- **Never:**
  - touch `design/` or `dist/`;
  - use bare `git stash`;
  - stop the server on 127.0.0.1:4195.
- **Git:** `git add` paths by name. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Taps during a move, a lift or a slide.** A tap on the egg never rolls twice or out of turn. Test: Task 1 `a roll out of turn is refused`.
2. **Landing past 50, on a neck or tail end, or on special squares in a chain.** Test: Task 1 `moves resolve necks, tails, fruit and the finish in order`.
3. **Closing mid-game:** the game is dropped, with no penalty. Task 3 owns it.

---

### Task 1: The rules

**Files:**
- Create: `remake/engine/hals/rules.js`
- Test: `remake/tests/hals.test.mjs` (the plan's one test file)

**Interfaces — Produces:**
- **`BOARD`:**
  - `{ size: 50, necks: [[from, to] ×5], tails: [[from, to] ×5], fruit: [squares], stars: [squares] }`;
  - neck `from` is less than `to`, and tail `from` is greater than `to`;
  - no square starts two things;
  - nothing starts on 1 or 50;
  - choose a fair, fun layout.
- **`newGame()`** returns `{ pos: { child: 0, thorsedla: 0 }, turn: 'child', winner: null, rolls: 0 }`.
- **`roll(random)`** returns 1..6.
- **`move(game, who, n)`** returns `{ game, path }`:
  - `path` is the list of steps for the scene to animate, for example `{ type: 'step', square }`, `{ type: 'neck', from, to }`, `{ type: 'tail', from, to }`, `{ type: 'fruit' }` (an extra roll), `{ type: 'star' }` and `{ type: 'win' }`;
  - the turn passes, except after fruit;
  - passing 50 wins;
  - a move out of turn throws.

- [ ] **Step 1:** Write the tests:
  - `the board has 50 squares, 5 necks up and 5 tails down, and nothing starts on 1 or 50`;
  - `a roll out of turn is refused`;
  - `moves resolve necks, tails, fruit and the finish in order`;
  - `a seeded game always ends with a winner`.
- [ ] **Step 2:** Implement `rules.js`, then run `node --import ./remake/tests/setup.mjs --test remake/tests/hals.test.mjs` until it passes. Commit.

### Task 2: The valley

**Files:**
- Create: `remake/engine/hals/valley.js` (the scene: path, stones, Þórseðlas, nest, plants, light, camera), `remake/engine/hals/pieces.js` (Egill on Mosi; the little Þórseðla figure; the big host walking beside the path), `remake/engine/hals/egg-die.js` (the egg that rolls, cracks and shows 1-6 dots)
- Create: `remake/hals-lab.html`, a live page to look and play

**Interfaces:**
- `createValley(renderer, { board })` returns:
  - `squarePosition(n)`;
  - `neckAt(from)` and `tailAt(from)`, each giving an animatable Þórseðla;
  - `camera`, with `follow(target)` and `overview()`;
  - `update(dt)`;
  - `dispose()`.
- The dinosaur models are in `remake/assets/characters/`, and the chapter's forest and lighting in `remake/world/` and `remake/engine/`.

- [ ] **Step 1 (changed by the owner on 2026-10-18 to a side-scroller):**
  - **The layout:** a long 3D world seen straight on, from meadow to the mountaintop nest. The 50 numbered stones run left to right, rising in ledges, so necks go up and forward and tails go down and back.
  - **The camera:** side-on and following the piece; one pan over the whole path at the start.
  - **Depth:** parallax foreground and background.
  - **The Þórseðlas:** five lifting and five sliding, in profile, placed by `BOARD`, breathing and looking.
  - **The progress bar:** `progressOf(square)` feeds it.
  - **Within the tablet budget,** with plants, butterflies and fireflies. Capture an overview and a close view at 1280x800, and record the frame cost.
- [ ] **Step 2:** Build the pieces and the egg die, and in the lab hop a piece along a few squares. Commit.

### Task 3: The game: moves, lifts, slides, effects, sound, voices, the book

**Files:**
- Create: `remake/engine/hals/game.js` (`createHalsGame(doc, { save, audio, onClose })` returns `{ open(), close(), isOpen }`), `remake/engine/hals/hals-sounds.js`, `remake/assets/audio/hals/lines-source.json`
- Modify:
  - `remake/engine/book/book.js` (a "Háls og hali" tile on the Leikir page, under the development switch now and `k2_thorsedla` later);
  - `remake/main.js` (CRLF);
  - `remake/tools/audio-lines.mjs` (`SETS.hals`);
  - `remake/hals-lab.html`.

- [ ] **Step 1:** The turn loop:
  - tap the egg to roll;
  - Mosi says "Teldu með!" and counts each step: "Einn!", "Tveir!" … up to "Sex!";
  - a rising tone plays on each step, and the stone's digit lights;
  - Þórseðla rolls on her turn after a short pause;
  - only one voice speaks at a time.
- [ ] **Step 2:** Lifts, slides and effects:
  - **a lift:** the Þórseðla bends, the piece goes onto her head, she raises it to its end with a lift tone and a happy sound, and the camera follows;
  - **a slide:** "vúúú" down the tail, swirling leaves, a splash;
  - dust on landings, sparkles on star squares, and fireworks at the nest;
  - the host Þórseðla reacts.
- [ ] **Step 3:** Mosi's short introduction the first time, wins counted in the save, closing mid-game dropping the game, and the music loop (`remake/assets/audio/hals/music.mp3`) played gaplessly like Eitt!'s.
- [ ] **Step 4:** Write the lines in `lines-source.json`: Mosi's intro, "Teldu með!", the numbers one to six, and encouragements; Þórseðla's few reactions. Commit them early so the controller can record them.
- [ ] **Step 5:** Wire the book's tile, play one game to the end in the browser, run `npm run test:remake`, and commit.

### Task 4 (controller): The voices and the music

- [ ] Audition calm, warm voices for Þórseðla, and put the owner's pick in `voices.json`.
- [ ] Record the `hals` set with v4, and generate music candidates with ElevenLabs Music. The owner picks by ear.
