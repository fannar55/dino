# "Háls og hali" Ported into the Remake: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Codex's "Háls og hali" board game (`C:/Risaeðla/dino-board-adventure`, uncommitted `dist/board-*.js`) into the remake as one of the book's games, with:
- the remake's real dinosaurs and better animation;
- the "Eitt!" look;
- ElevenLabs v4 voices, sound and effects;
- a fossil collection in the book.

**Architecture:**
- The rules are ported to a pure module in `remake/engine/hals/`.
- The board world is a remake three.js scene, a side view of five tiers with 16 squares each, built from Codex's board geometry and the remake's forest, light and GLB characters.
- The UI is DOM in the "Eitt!" style.

**Tech Stack:** plain ES modules, three.js r180 (vendored), DOM and CSS, Web Audio (`createSfx`), ElevenLabs v4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-19-hals-og-hali-endurgerd-design.md` (Icelandic, owner-approved 2026-10-19). It supersedes the 2026-10-18 spec and plan, whose 50-square rules and side-scroller are replaced.

## Global Constraints

- **The owner's lean way of working** (`.superpowers/sdd/2026-10-18-hals-og-hali/working-rules.md`):
  - build fast and show early demos;
  - one test file (the rules);
  - `npm run test:remake` once at the end of each task, and never the old game's suite;
  - commit after each piece;
  - one-line check-ins to the controller (SendMessage to `main`);
  - short reports.
- **The source is Codex's work in `C:/Risaeðla/dino-board-adventure`.**
  - Read it freely, and port what is good: rules, board geometry and curves, events, effects ideas, camera, calm mode.
  - Never edit that worktree.
  - Never touch the main repo's `dist/` or `design/`.
- **Keep Codex's rules:**
  - 80 squares on five tiers of 16;
  - five necks and five tails, with the same routes;
  - die 1-6, and only the landing square triggers anything;
  - overshooting the finish wins, and a six gives no extra roll;
  - the "Ævintýraskógur" events: fireflies +2, mud -2, fossils;
  - modes: 1 player against the computer (Þórseðla), or 2-4 local players.
- **Real dinosaurs, not Codex's procedural ones.**
  - The necks and tails are Þórseðlas, from `remake/assets/characters/brontosaurus.glb`.
  - The pieces are Egill on Mosi, with friends for the other players.
  - Use LOD within the tablet budget: at most 6 ms GPU, 100 calls and 250k triangles at 1280x800.
- **Look like "Eitt!":** `remake/eitt.css` and `remake/book.css`, Nunito, controls of at least 88 px, the STYLE.md palette, DOM motion with transform and opacity, and reduced motion as fades.
- **Voices:** the line set `hals`. Mosi counts and encourages, and Þórseðla is `voices.json` `thorsedla` (Björn). Only one voice speaks at a time. The controller, not an implementer, runs every command that calls ElevenLabs.
- **Line endings:** `remake/README.md`, `remake/STYLE.md` and `remake/main.js` are CRLF; every other file is LF.
- **Git:** `git add` paths by name. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Port the rules

- [ ] Port `dist/board-rules.js` to `remake/engine/hals/rules.js`, replacing the 50-square rules: `BOARD`, the routes, the special tiles, `tilePosition`, `resolveTurn`, `createGame` and `applyTurn`.
- [ ] Port its essential tests from `tests/board-rules.test.mjs` into `remake/tests/hals.test.mjs` (the one test file). Run it.
- [ ] Add the fossil collection's data: 8 kinds of fossil and egg; the board places some per game; a find adds a new kind to a persistent collection in `engine/save.js` (`hals: { found }`).
- [ ] Run `npm run test:remake`, then commit.

### Task 2: The board world with real dinosaurs

- [ ] Build `remake/engine/hals/world.js`:
  - the five tiers of 16 numbered squares, side view, from Codex's `board-world.js` geometry;
  - neck and tail curves following Codex's routes;
  - the remake's forest, light and parallax behind.
- [ ] Place the Þórseðlas from `brontosaurus.glb` so that each neck rises from its low square to its high one, and each tail slopes down. Give them breathing, looking at the pieces, a neck that bends down and lifts, a tail swish, and a cheer.
- [ ] The pieces: Egill on Mosi (GLB), and friends for 2-4 players. They hop square by square and ride necks and tails along the curves.
- [ ] The camera follows the piece or shows the whole board. Calm mode.
- [ ] Build a playable lab, `remake/hals-lab.html`.
- [ ] Take demo captures at each step, into `qa/remake/hals/port/`, and send the controller each path.
- [ ] Record the frame cost. Commit as you go.

### Task 3: The game: "Eitt!" UI, voices, sound, effects, the book, the collection

- [ ] **The UI in the "Eitt!" style:**
  - setup (who plays);
  - the players' portraits;
  - the dock with a roll button;
  - the event cards;
  - help;
  - pause;
  - calm mode.
- [ ] **Voices:** write the `hals` lines (Mosi's counting, encouragement and intro; Þórseðla's reactions; fossil names for the narrator) in `remake/assets/audio/hals/lines-source.json`, with `SETS.hals`. Commit them early, so the controller can record them. Only one voice at a time.
- [ ] **Sound and effects:** sounds tuned to the theme's key; dust, leaves, glitter, a splash and fireworks; the music loop played gaplessly.
- [ ] **The book:** a "Háls og hali" tile on the Leikir page, and the fossil collection page, whose stickers say their name and a fact when tapped.
- [ ] Play a game to the end in the browser, run `npm run test:remake`, and commit.

### Task 4 (controller): Voices and music

- [ ] Record the `hals` set with v4.
- [ ] Generate music candidates with ElevenLabs Music.
- [ ] The owner picks by ear.
