# "Eitt!", Kambeðla's Card Game: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Eitt!", our own two-player Uno for a five-year-old: Egill against a live 3D Kambeðla who adapts to the child, with Mosi giving advice on request. The book opens it.

**Architecture:**
- The rules, Kambeðla's choices, her adaptive skill and Mosi's advice are one pure module with no DOM and no 3D, under `remake/engine/eitt/`.
- The table is DOM and CSS like the book, reusing its touch, effects and font.
- Kambeðla lives in her own small three.js view, reusing her model, the talk and mouth, and the plate glow.

**Tech Stack:** plain ES modules, DOM and CSS, three.js r180 (vendored), Web Audio through `createSfx`'s `sounds` option, the voice tool, and `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-18-eitt-kambedluleikur-design.md` (Icelandic, owner-approved 2026-10-18).

## Global Constraints

- **The owner's lean way of working** (`.superpowers/sdd/2026-10-17-landkonnudabok-fraedsla/working-rules.md`):
  - build fast and simply;
  - one test file in all (Task 2);
  - `npm run test:remake` once at the end of each task, and never the old game's suite;
  - one capture per new screen at 1280x800, plus 820x1180 where layout could break upright;
  - commit after each piece that works;
  - one-line check-ins to the controller (SendMessage to `main`);
  - short reports.
- **Look:** big and bright, game-like, never a web page. Every control is at least 88 px, the font is Nunito, motion uses transform and opacity only, and reduced motion gives fades.
- **Colours:** the four Uno colours (red, yellow, green, blue), in bright child-friendly tones that Task 1 picks and the owner approves.
- **The dinosaur on each colour:** red is Grameðla (T. rex, `trex.glb`), yellow is Þórseðla (Brontosaurus, `brontosaurus.glb`), green is Mosi (`mosi.glb`), blue is Slóeðla (Parasaurolophus, `parasaurolophus.glb`).
- **Voices:** Kambeðla's (`voices.json` `kambedla`) and Mosi's (`mosi`). A new line set, `eitt`, lives in `remake/assets/audio/eitt/`, beside `kafli1` and `book`.
- **The controller, not an implementer, runs every command that calls ElevenLabs.** The owner picks takes by ear.
- **Line endings:** `remake/README.md`, `remake/STYLE.md` and `remake/main.js` are CRLF; every other file is LF.
- **Never:**
  - touch `design/` or `dist/`;
  - use bare `git stash`;
  - stop the servers on 127.0.0.1:4190 or 4195.
- **Git:** `git add` paths by name. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Taps during a flight or Kambeðla's turn.** A double tap on a card, the deck, "Eitt!" or a colour must never play twice, play out of turn or play during her turn. Test: Task 2 `a move out of turn is refused`. Task 3 locks input while a card flies or Kambeðla moves.
2. **An empty deck.** The table's cards, all but the top one, are shuffled into a new deck. If both are empty, the player passes. Test: Task 2 `drawing from an empty deck reshuffles the table`.
3. **A wild as the last card.** The round is won at once, with no colour picker. Test: Task 2 `the last card wins, even a wild`.
4. **Closing mid-round.** The round is dropped with no penalty, and the next opening deals a new one. Task 3 owns it.
5. **Kambeðla always has a legal move or draws.** Test: Task 2 `Kambeðla and Mosi only ever choose legal moves`: 200 random games played to the end at random skills.

---

### Task 1: The look: cards and table, a mockup the owner approves

**Files:**
- Create: `remake/eitt.css`
- Create: `remake/eitt-lab.html`, a dev page never linked from the game. `?state=table|wild|eitt|mosi|win` shows each state.
- Modify: `remake/tools/bake/book-render.js`. `who` also takes `trex`, `brontosaurus`, `parasaurolophus`, `pteranodon` and `stegosaurus-tail` (Kambeðla mid tail-swish).
- Create: `remake/assets/eitt/` holding the card pictures (renders as WebP with alpha, and drawn SVG eggs and plates).

**Interfaces — Produces:** the classes Task 3 renders into:

| Element | Class | Parts or modifiers |
| --- | --- | --- |
| Card | `.eitt-card` | `.red`, `.yellow`, `.green`, `.blue`, `.wild`; `.back`; the digit in the middle and corners; `.pic` |
| The table | `.eitt-table` | the `.eitt-kambedla` view slot (top), `.eitt-deck`, `.eitt-pile`, the colour ring `.eitt-ring` |
| The child's hand | `.eitt-hand` | `.playable`, `.hint` (lifted) |
| Buttons | `.eitt-eitt`, `.eitt-mosi` (Mosi's face), `.eitt-colours` (four big buttons), `.eitt-pass` | |
| Kambeðla's cards | `.eitt-their-hand` | backs |

- [ ] **Step 1:** Render the four colour dinosaurs and the action pictures:
  - skip is Kambeðla's tail swish;
  - reverse is Flugeðla flying a circle;
  - +2 is two eggs;
  - wild is the plates glowing in all four colours;
  - +4 is the plates and four eggs.

  Make the renders with `node remake/tools/bake/bake-character.mjs --page book-render --out <file> --query "who=<name>"`, and draw the eggs and plates as SVG.
- [ ] **Step 2:** Build `eitt-lab.html` and `eitt.css` with static markup. Use `remake/assets/book/images/kambedla-render.webp` as a stand-in for the 3D view.
  - Show every card kind.
  - Show a hand of seven, the deck and table, the colour ring, "Eitt!" pulsing, the colour picker, Mosi's button with his advice bubble, and the win state.
- [ ] **Step 3:** Capture `table` and `wild` at 1280x800 and 820x1180 into `qa/remake/eitt/mockup/`, and look at them. Commit.
- [ ] **Step 4 (controller):** show the owner, and apply their changes before Task 3.

### Task 2: The rules, Kambeðla's choices, her skill and Mosi's advice

**Files:**
- Create: `remake/engine/eitt/rules.js`, `remake/engine/eitt/kambedla.js`, `remake/engine/eitt/skill.js`, `remake/engine/eitt/advice.js`
- Test: `remake/tests/eitt.test.mjs` (the plan's one test file)

**Interfaces — Produces:**
- **`rules.js`:**
  - **Data:**
    - `COLOURS = ['red', 'yellow', 'green', 'blue']`.
    - A Card is `{ id, colour, kind, value }`. `colour` is null for the two wilds; `kind` is one of `'number'|'skip'|'reverse'|'draw2'|'wild'|'wild4'`; `value` is 0..9 for numbers, otherwise null.
    - A Game is `{ deck, pile, hands: { child, kambedla }, colour, turn, drew, unsaid, winner }`:
      - `turn` is `'child'|'kambedla'`;
      - `drew` says this turn's player has already drawn;
      - `unsaid` is who played to one card without calling "Eitt!";
      - `winner` is null until the round ends.
  - **Functions** (each returns a new Game and throws on an illegal move):
    - `makeDeck()` gives 108 cards.
    - `newGame(random = Math.random)` deals 7 each; the top of the pile is a number card, and the child starts.
    - `canPlay(card, game)` and `playable(game, who)`.
    - `play(game, who, cardId, colour?)`. Skip and reverse give the player another turn. Draw2 and wild4 make the other draw 2 or 4 and miss the turn. Reaching 0 cards wins.
    - `draw(game, who)` returns `{ game, card }`, and reshuffles the pile into the deck when the deck is empty.
    - `pass(game, who)` keeps the drawn card.
    - `callEitt(game, who)`.
    - `catchEitt(game, catcher)`: the one who did not call draws 2.
- **`kambedla.js`:**
  - `chooseMove(game, skill, random)` returns `{ type: 'play', cardId, colour? }` or `{ type: 'draw' }`.
  - `willCallEitt(skill, random)` and `willCatch(skill, random)`. At skill 1 they always return true; lower skill gives a growing chance of forgetting.
  - **Sharp choices:** keep wilds for last; play +2 and +4 when the child has 2 or fewer cards; pick the colour she holds most of.
  - **Mild choices:** sometimes any legal card, and a random colour.
- **`skill.js`:**
  - `SKILL_START = 0.5`;
  - `afterRound(state, childWon)` returns the new `{ skill, losses }`: up 0.1 after a child win, down 0.1 after a loss, down 0.1 more for each loss in a row from the second, held to 0..1;
  - `inRound(skill, childCards, kambedlaCards)` lowers skill by 0.3 while the child holds 4 or more cards more than her.
- **`advice.js`:** `advise(game)` returns the child's best move as a sharp Kambeðla would see it: `{ type: 'play', cardId, colour? }`, `{ type: 'draw' }` or `{ type: 'eitt' }`, the last when the child is about to play to one card.

- [ ] **Step 1:** Write `eitt.test.mjs`:
  - `the deck has 108 cards`: per colour one 0, two each of 1-9, two each of skip, reverse and draw2; four wild and four wild4;
  - `a new game deals 7 each and starts on a number card`;
  - `a card plays on its colour, number or symbol, and wilds on anything`;
  - `skip and reverse give the player another turn; draw2 and wild4 make the other draw and miss the turn`;
  - `a move out of turn is refused`;
  - `playing to one card without Eitt can be caught for two cards`;
  - `drawing from an empty deck reshuffles the table`;
  - `the last card wins, even a wild`;
  - `Kambeðla and Mosi only ever choose legal moves` (200 seeded random games played to the end, at random skills);
  - `skill rises after wins, falls after losses, and eases when the child is far behind`.
- [ ] **Step 2:** Implement the four modules. Run `node --import ./remake/tests/setup.mjs --test remake/tests/eitt.test.mjs` until it passes.
- [ ] **Step 3:** Run `npm run test:remake`, then commit.

### Task 3: The table, the live Kambeðla, Mosi, sound, and the book's Leikir

**Files:**
- Create: `remake/engine/eitt/table.js` (DOM), `remake/engine/eitt/kambedla-view.js` (three.js), `remake/engine/eitt/eitt-sounds.js`
- Modify:
  - `remake/engine/book/book.js` (the `games` tab: a "Leikir" ribbon and the "Eitt!" tile);
  - `remake/engine/save.js` (`eitt: { skill, losses, wins }`);
  - `remake/chapters/kafli1.js` (the invite at the end);
  - `remake/main.js` (CRLF);
  - `remake/eitt-lab.html` (live);
  - `remake/tools/audio-lines.mjs` and `voice-lines.mjs` (`SETS.eitt`).
- Create: `remake/assets/audio/eitt/lines-source.json`

**Interfaces:**
- **Consumes:** Task 1's classes; Task 2's `rules`, `kambedla`, `skill` and `advice`; the book's `pressable` and `sparkle`; `createSfx({ sounds })`; `createVoice`; the save.
- **Produces:** `createEittGame(doc, { save, audio, onClose })` returns `{ open(), close(), isOpen }`.
  - `open` deals a new round.
  - `close` drops a round in progress, with no penalty.
  - Input is locked while a card flies or Kambeðla moves.
  - After about 6 s idle, the playable cards lift.
- **Lines** (`eitt` set):

  | Speaker | id | text |
  | --- | --- | --- |
  | `kambedla` | `eitt_your_turn` | „Þín umferð!“ |
  | `kambedla` | `eitt_i_draw` | „Ég dreg.“ |
  | `kambedla` | `eitt_eitt` | „Eitt!“ |
  | `kambedla` | `eitt_red`, `eitt_yellow`, `eitt_green`, `eitt_blue` | „Nú er það rautt!“, „…gult!“, „…grænt!“, „…blátt!“ |
  | `kambedla` | `eitt_oops` | „Úps, ég gleymdi!“ |
  | `kambedla` | `eitt_you_won` | „Þú vannst!“ |
  | `kambedla` | `eitt_i_won` | „Ég vann!“ |
  | `kambedla` | `eitt_again` | „Spilum aftur?“ |
  | `kambedla` | `k1_kambedla_play` | „Viltu spila við mig?“ |
  | `mosi` | `eitt_mosi_try` | „Prófaðu þetta!“ |
  | `mosi` | `eitt_mosi_draw` | „Þú þarft að draga spil.“ |
  | `mosi` | `eitt_mosi_colour` | „Veldu þennan lit!“ |
  | `mosi` | `eitt_mosi_eitt` | „Mundu að segja Eitt!“ |

- [ ] **Step 1:** Build `kambedla-view.js`: her model in a small renderer, with breathing, talking (the mouth with lines.json's mouth data), a thinking head tilt, plates glowing in a colour, a tail swish, a happy hop and a cheer.
- [ ] **Step 2:** Build `table.js` and `eitt-sounds.js`:
  - the deal;
  - plays and draws, with flights;
  - the colour picker;
  - "Eitt!" and catching her;
  - Mosi's button, which shows his render with the advice glowing on a card;
  - the win, with confetti and a sticker in the save;
  - her turns paced at about 1.2 s, with the skill updated after each round;
  - the sounds tuned to the theme's key: flick, shuffle, draw, wiggle, Eitt horn, swish, egg pop, colour sparkle, fanfare.
- [ ] **Step 3:** Wire it in:
  - the book's Leikir ribbon and the "Eitt!" tile, which unlocks with `k1_kambedla`'s star and shows the stickers won;
  - the chapter's end line `k1_kambedla_play` after the star;
  - opening the game pauses the chapter like the book does;
  - the lines source and `SETS.eitt`;
  - the live `eitt-lab.html`.
- [ ] **Step 4:** Play three rounds in a real browser, capture the table at 1280x800, run `npm run test:remake`, and commit.

### Task 4 (controller): The voices

- [ ] **Step 1:** Run `node remake/tools/voice-lines.mjs --set eitt`. The owner listens in the game and flags lines; flagged lines get v4 candidates, and the owner's picks get `kept`.
- [ ] **Step 2:** Show the owner the game to play, and collect what to change.
