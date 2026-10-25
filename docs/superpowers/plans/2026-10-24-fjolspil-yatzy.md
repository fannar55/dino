# Fjölspil in Litla Yatzy (phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Fjölspil" in Litla Yatzy: 2–4 players, Egill at the big screen as today and the others on phones that are the cup (roll, hold, pick a card), while the big screen rolls the dice in 3D and shows everyone's scores; and Risaeðlu-Yatzy removed from the game.

**Architecture:** Litla Yatzy is a page of its own (`remake/yatzy-junior.html`) in a frame over the book, so the page hosts its own Fjölspil session (`createFjolspil` with its own storage key) and talks to the phones through the same meeting point, net and phone page as the other games; the big screen stays the authority (the game's seeded dice, the rules, the views), the phones send acts and render the `yatzy` view. The junior rules become a 2–4 player ring with the solo game as the 2-player case, so old saves still read.

**Tech Stack:** As phase 1–2 (plain ES modules, no build, no root npm deps, Node 25 `node:test`, three.js r180 from `dist/vendor/`, the Fjölspil modules under `remake/engine/fjolspil/`). The junior page's 3D world, Mosi, dice and voice are reused unchanged. The headless checks run in Edge through Playwright from the owner's machine (`PLAYWRIGHT_PATH`, as `remake/tools/yatzy-junior-check.mjs` does).

**Spec:** `docs/superpowers/specs/2026-10-24-fjolspil-yatzy-design.md` (Icelandic; cited as "spec §N"), a supplement to `docs/superpowers/specs/2026-10-24-fjolspil-design.md` (cited as "base spec §N"). The base plan is `docs/superpowers/plans/2026-10-24-fjolspil.md`; its Global Constraints hold here too.

## Global Constraints

- Branch `fjolspil` in the worktree `C:/Risaeðla/dino-fjolspil`, base `1635358` (phase 1–2 complete, suite 1174 green). Commit on `fjolspil` only; never push, never merge; never commit `cloud/package-lock.json`. The owner deploys (`cd cloud && npm run stage && npm run deploy`) himself.
- Never modify `design/` or `dist/`. No npm packages at the repo root. No build step.
- Line endings per file, verified before every edit with the base plan's Node snippet: `remake/engine/fjolspil/*`, `remake/spil*`, `remake/fjolspil*`, `remake/tests/fjolspil-*.test.mjs`, `remake/main.js` are CRLF; `remake/engine/yatzy-junior/*`, `remake/yatzy-junior.html`, `remake/yatzy-junior.css`, `remake/tests/yatzy-junior-*.test.mjs`, `remake/tools/yatzy-junior-*.mjs`, `remake/engine/book/book.js`, `remake/book.css`, `remake/index.html`, `remake/engine/save.js` and `remake/README.md` are whatever they are now (check each; the junior files are dense single-line-per-statement code, keep that style). New files follow their neighbours (`guest-yatzy.js` CRLF like `guest-hals.js`; `remake/tools/yatzy-junior-fjolspil-check.mjs` like `yatzy-junior-check.mjs`). Markdown under `docs/` is LF.
- Icelandic copy exactly as the spec gives it: "Fjölspil", "Bæta Mosa við", "Taka Mosa út", "Byrjum!", "Þú átt leik!", "Anna á leik", "Kasta!", "Kasta aftur!", "Nota spjaldið? 0 stig", "Nota", "Velja annað", "Anna vann!", "Jafntefli!", "Anna: 12 stig", "Stóri skjárinn er í hléi", "Halda áfram (Fjölspil)", "Hætta Fjölspili", "Bíðum eftir …" / "Halda áfram án …" (the lobby's own). Names in the nominative only, as typed, as text (`textContent`), never declined, never markup. The game spells itself "Litla Yatzy" (its title, dialogs and category label): keep that spelling in copy; "Yatzý" in the spec is the prose spelling.
- Code comments in English in the repo's voice (why, and the owner's decisions with their dates).
- STYLE.md: Nunito, tap targets ≥ 88 px on the phone (`--spil-target`), 64 px minimum on a tablet for the dice buttons, motion only with `transform`/`opacity`, fades under `prefers-reduced-motion`. New class names: `spil-yatzy-*` on the phone, `junior-*`/existing ones on the big screen, `fjolspil-*` in the lobby.
- Tests: `npm run test:remake` is green at the base (1174) and stays green; `npm run test:yatzy-junior` and `npm run check:yatzy-junior` (headless Edge, the dev server on 4197 or `JUNIOR_URL`) stay green: the solo game is unchanged in look and behaviour. DOM tests use `remake/tests/fake-dom.mjs`; the phone screens are tested as `remake/tests/fjolspil-guest.test.mjs` tests `renderHals` (a `rig()` with a fake net and `views`).
- Dev server for this worktree: `node remake/tools/serve.mjs --port 4198 --lan`. Captures for the owner: `node remake/tools/capture.mjs --page remake/spil.html --shot <name>="demo=yatzy" --size 390x844 --ready "window.__demoReady === true" --out qa/fjolspil-yatzy/<task>` and `--size 1180x820`; the big screen's captures come from the headless tool of Task 6 (`qa/yatzy-junior-fjolspil/`). `qa/` is git-ignored.
- No secrets in files or chat; the ElevenLabs key never leaves the owner's environment. The voice tool is only extended, never run by a builder (`--dry-run` is allowed).
- Spec limits, verbatim: 2–4 players, Egill seat 0, one AI at most (Mosi), five rounds each, three rolls a turn, the game's seeded `rng` rolls, "Halda áfram án …" after 20 s (base spec), views per seat and never broadcast, acts only from the seat whose turn it is.

## Review Focus

Inputs the spec implies but no task's tests cover by themselves; each line's test is added to the task named.

1. A phone's `roll` while the big screen's dice are still rolling or flying (`settled()` false), or a second `roll` from a double tap: at most one roll per view that offered one, and the late one changes nothing — Task 5 (`onAct` ignores acts while not settled; the next view after the roll has `canRoll` per the rules).
2. A `score` act for a card already filled, or from a seat whose turn it is not, or with an unknown card id: ignored, nothing thrown, the game unchanged — Task 5.
3. A Fjölspil save whose seats no longer match its state (a hand-edited or stale `mosi.yatzy.junior.fjolspil.v1`): dropped, the welcome dialog shows no "Halda áfram (Fjölspil)" — Task 6.
4. A `MULTI_LINES` id with no manifest entry, said while the voice is unmuted: the bubble shows the caption for the caption's time, `onUnavailable` never fires and "Rödd Mosa náðist ekki" never shows — Task 7.
5. Old solo saves (`players: ['you','mosi']`, no `faces`) and a solo game started today both validate and play to the end under the new ring rules — Task 2.

---

## File map

Deleted (Task 1): `remake/engine/yatzy/` (six files), `remake/yatzy.css`, `remake/yatzy-lab.html`, `remake/tests/yatzy.test.mjs`.

New:

| File | Responsibility |
|---|---|
| `remake/engine/fjolspil/guest-yatzy.js` | The phone's Litla Yatzy screen: `renderYatzy(root, view, tools)` (spec §6). |
| `remake/engine/fjolspil/yatzy-phone-sounds.js` | The phone's dice rattle, one sound in `eitt-sounds.js`'s shape (spec §6). |
| `remake/engine/yatzy-junior/fjolspil.js` | The junior page's side of Fjölspil: seats → players, `yatzyView`, acts, save/resume (spec §5); game.js calls it. |
| `remake/tools/yatzy-junior-fjolspil-check.mjs` | Headless Edge play-through of a 4-seat game with two phone pages, with captures (spec §12). |
| `remake/tests/fjolspil-guest-yatzy.test.mjs` | The phone screen's tests. |
| `remake/tests/yatzy-junior-fjolspil.test.mjs` | The pure part of the junior page's Fjölspil side (`yatzyView`, acts, saves). |

Modified: `remake/engine/yatzy-junior/{rules.js,game.js,voice.js,voice-lines.js}`, `remake/yatzy-junior.html`, `remake/yatzy-junior.css`, `remake/engine/fjolspil/{seats.js,fjolspil.js,guest.js}`, `remake/spil.html`, `remake/spil.css`, `remake/engine/book/book.js`, `remake/main.js`, `remake/index.html`, `remake/tools/yatzy-junior-voices.mjs`, `remake/README.md`, `package.json` (one script), tests `remake/tests/{yatzy-junior-rules,yatzy-junior-voice,fjolspil-seats,fjolspil-host,fjolspil-guest,game-music}.test.mjs`.

---

### Task 1: Risaeðlu-Yatzy out of the game

**Files:**
- Delete: `remake/engine/yatzy/advice.js`, `rules.js`, `sloedla.js`, `sloedla-view.js`, `table.js`, `yatzy-sounds.js`; `remake/yatzy.css`; `remake/yatzy-lab.html`; `remake/tests/yatzy.test.mjs`
- Modify: `remake/tests/game-music.test.mjs` (the import at line 8 and the Risaeðlu-Yatzy entry at line 22, and the comment at 11)
- Modify: `remake/main.js` (line 33 import; lines 232–239 `createYatzyGame`; line 205 `onPlay`)
- Modify: `remake/index.html` (line 15 the `yatzy.css` link; line 42 `#yatzy`)
- Modify: `remake/engine/book/book.js` (lines 30–31 comment; 61–62 `YATZY_OPEN`/`YATZY_SEEN`; 240–262 the tile and `littleButton`; 444–451 `renderYatzy`; 477–483 `tapYatzy`; 777 and 780 `pressable`)
- Modify: `remake/README.md` line 72
- Test: `npm run test:remake`

**Interfaces:**
- Produces: `book.js` has a "Litla Yatzy" tile in the third game slot: `button.tile.game-tile[data-game="yatzy-junior"]`, `aria-label` "Litla Yatzy við Mosa", `--hue: #868862` (Mosi's sage from `yatzy-junior.css`), picture `MOSI_PICTURE = new URL('../../assets/eitt/mosi.webp', import.meta.url).href`, name "Litla Yatzy", a "Nýtt!" badge until the save's `seen` has `JUNIOR_SEEN = 'yatzy-junior'`; `tapJunior()` plays `audio.sfx('tile')`, `save.addSeen(JUNIOR_SEEN)`, `render()`, `onPlay?.('yatzy-junior')`. `onPlay` in `main.js` no longer knows `'yatzy'`.

- [ ] **Step 1: Delete the files and the references**

`git rm` the six engine files, `yatzy.css`, `yatzy-lab.html`, `tests/yatzy.test.mjs`. Edit `game-music.test.mjs`, `main.js`, `index.html`, `README.md` as listed. In `book.js` replace the Risaeðlu tile and `littleButton` with the junior tile (`renderJunior(state)` in place of `renderYatzy`: the badge and `found`/`new` classes as the Háls tile has them, `juniorSlot` never hidden), delete `YATZY_OPEN`, `YATZY_SEEN`, `tapYatzy`, and update the header comment (lines 30–31).

- [ ] **Step 2: Find what is left**

Run: `grep -rn "yatzy" remake --include=*.js --include=*.mjs --include=*.html --include=*.css --include=*.md | grep -v "yatzy-junior\|yatzy-mosi\|yatzyRoll\|yatzyHelp\|yatzy\.mp3\|'yatzy'\|\"yatzy\"\|yatzy:"` and read every hit: a Risaeðlu-Yatzy reference goes, a junior/Mosi one stays (the category id `yatzy`, the voice line `yatzy`, the junior audio files are the junior's).
Expected: no hit names `engine/yatzy/`, `yatzy.css`, `yatzy-lab`, `createYatzyGame`, `Risaeðlu` or `Slóeðla's dice game`.

- [ ] **Step 3: Run the suite**

Run: `npm run test:remake`
Expected: pass, 1174 minus the deleted `yatzy.test.mjs` tests, 0 fail. `node --check remake/main.js remake/engine/book/book.js` prints nothing.

- [ ] **Step 4: Look at the Leikir page**

Run the dev server (port 4198) and, with the headless tool `node remake/tools/capture.mjs --page remake/index.html --shot leikir="shot=hero&t=2" --size 1600x900 --out qa/fjolspil-yatzy/task1 --eval "window.__book.open('games','child')" --settle 1200` (if `__book.open` needs another signature, read `book.js:99` and adapt the eval). Expected: three tiles (Eitt!, Háls og hali, Litla Yatzy with Mosi's picture), no empty slot. Send the capture to the owner in the task report.

- [ ] **Step 5: Commit**

```bash
git add -A remake/engine/yatzy remake/yatzy.css remake/yatzy-lab.html remake/tests/yatzy.test.mjs remake/tests/game-music.test.mjs remake/main.js remake/index.html remake/engine/book/book.js remake/README.md
git commit -m "Fjölspil: Risaeðlu-Yatzy leaves the game; Litla Yatzy gets its own tile on the Leikir page"
```

---

### Task 2: The junior rules for 2–4 players

**Files:**
- Modify: `remake/engine/yatzy-junior/rules.js` (`PLAYERS`, `MAX_TURNS`, `findWinner`, `validateGame`, `copyGame`, `createGame`, `score`)
- Test: `remake/tests/yatzy-junior-rules.test.mjs`

**Interfaces:**
- Produces:
  - `createGame({ seed = 1, startingPlayer = 0, players = ['you', 'mosi'] })`: `players` is an array of 2–4 distinct non-empty strings (`TypeError('Two to four distinct players are required')` otherwise); `startingPlayer` in `0..n-1`. The state's `players[i].id` is `players[i]`.
  - `export const maxTurns = n => ROUND_COUNT * n;` `MAX_TURNS` stays exported as `maxTurns(2)` (the tests import it).
  - `export function roundOf(game)` → `Math.min(ROUND_COUNT, Math.floor(game.turnCount / game.players.length) + 1)`.
  - `score()` moves on with `(startingPlayer + turnCount) % n` and finishes at `maxTurns(n)`; `winner` is the id with the highest total, `'tie'` when the top is shared.
  - `validateGame` accepts 2–4 players with distinct string ids (`'you'`/`'mosi'` no longer required), checks `currentPlayer === (startingPlayer + turnCount) % n`, and that player i has filled `Math.floor((turnCount + (n - 1 - ((i - startingPlayer + n) % n))) / n)` cards.
  - `decideAI(game)` unchanged in signature; it plays `game.currentPlayer` whoever that is.

- [ ] **Step 1: Write the failing tests**

Add to `yatzy-junior-rules.test.mjs`:
```js
test('a game of three or four goes round the ring, five rounds each, and the highest total wins',()=>{
  let game=createGame({seed:7,players:['0','1','2']});
  assert.deepEqual(game.players.map(p=>p.id),['0','1','2']);
  assert.equal(maxTurns(3),15);
  for(let turn=0;turn<15;turn++){assert.equal(game.currentPlayer,turn%3);assert.equal(roundOf(game),Math.min(5,Math.floor(turn/3)+1));game=applyDecision(roll(game),{type:'score',categoryId:ids[Math.floor(turn/3)]});}
  assert.equal(game.status,'finished');assert.equal(game.turnCount,15);
  const best=Math.max(...game.players.map(p=>totals(p.scores).total));
  assert.ok(game.winner==='tie'||totals(game.players.find(p=>p.id===game.winner).scores).total===best);
  const four=createGame({seed:1,players:['a','b','c','d'],startingPlayer:2});
  assert.equal(four.currentPlayer,2);assert.equal(score(roll(four),'pair').currentPlayer,3);assert.equal(maxTurns(4),20);
});
test('two players are the old game: old saves read and play on',()=>{
  const old=createGame({seed:3});assert.deepEqual(old.players.map(p=>p.id),['you','mosi']);assert.equal(MAX_TURNS,10);
  const saved=JSON.parse(JSON.stringify(old));for(const p of saved.players)delete p.faces; // a save from before kept dice
  assert.ok(restoreGame(saved));
});
test('a bad player list is refused',()=>{
  for(const players of [['solo'],['a','a'],['a','b','c','d','e'],[1,2]])assert.throws(()=>createGame({players}),TypeError);
  assert.throws(()=>createGame({players:['a','b','c'],startingPlayer:3}),TypeError);
});
test('validateGame follows the ring: a three-player state with the wrong current player is refused',()=>{
  const game=score(roll(createGame({seed:5,players:['0','1','2']})),'pair');
  assert.equal(validateGame(game),true);
  const wrong={...structuredClone(game),currentPlayer:0};assert.throws(()=>validateGame(wrong),TypeError);
  const tie=structuredClone(game);for(const p of tie.players)for(const id of ids)p.scores[id]=0;tie.turnCount=15;tie.rollCount=0;tie.dice=[0,0,0,0,0];tie.held=[false,false,false,false,false];tie.currentPlayer=0;tie.status='finished';tie.winner='tie';
  assert.equal(validateGame(tie),true);
});
```
Import `maxTurns` and `roundOf` at the top.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/yatzy-junior-rules.test.mjs`
Expected: the new tests fail (`maxTurns is not a function` / `Exactly two players are required`).

- [ ] **Step 3: Implement the ring in `rules.js`**

`PLAYERS` becomes the default list only. `createGame` validates `players` (array, 2–4, strings, distinct) and `startingPlayer` against `n`. `validateGame`: players 2–4, distinct ids, `startingPlayer`/`currentPlayer` in range, the filled-count formula above, `turnCount <= maxTurns(n)`, finished exactly at `maxTurns(n)`, `winner === findWinner(players)`. `findWinner`: the highest total's id, `'tie'` if two or more share it. `score`: `next.currentPlayer = (next.startingPlayer + next.turnCount) % n`, finished at `maxTurns(n)`. `copyGame` already maps `players`. Update the header comment ("Five-card Scandinavian Yatzy for two to four, the solo game the two-player case").

- [ ] **Step 4: Run the junior tests**

Run: `npm run test:yatzy-junior`
Expected: all pass (the old tests included: a 2-player game is unchanged; `'Exactly two players are required'` assertions in old tests, if any, are updated to the new message).

- [ ] **Step 5: Commit**

```bash
git add remake/engine/yatzy-junior/rules.js remake/tests/yatzy-junior-rules.test.mjs
git commit -m "Fjölspil: Litla Yatzy's rules go round a ring of two to four players, the solo game the two-player case"
```

---

### Task 3: The shared pieces: Mosi's avatar, the session's storage key, the phone's pause line

**Files:**
- Modify: `remake/engine/fjolspil/seats.js` (`HOST_AVATAR` block, `avatarOf`)
- Modify: `remake/engine/fjolspil/fjolspil.js` (`STORAGE_KEY`, `readRoom`/`keepRoom`, the options at line 96–99)
- Modify: `remake/engine/fjolspil/guest.js` (`WORDS`, `onView`)
- Test: `remake/tests/fjolspil-seats.test.mjs`, `remake/tests/fjolspil-host.test.mjs`, `remake/tests/fjolspil-guest.test.mjs`

**Interfaces:**
- Produces:
  - `seats.js`: `export const MOSI_AVATAR = avatar('mosi', 'Mosi', '#868862', 'assets/book/images/mosi-render.webp')`; `avatarOf('mosi') === MOSI_AVATAR`; a guest's `join({ avatar: 'mosi' })` is refused `bad-avatar` (`isGuestAvatar` unchanged); `addAi({ name: 'Mosi', avatar: 'mosi' })` works.
  - `fjolspil.js`: option `storageKey = STORAGE_KEY`; `readRoom(storage, key)` / `keepRoom(storage, key, room)` use it.
  - `guest.js`: `WORDS.paused = 'Stóri skjárinn er í hléi'`; in `onView`, after `render(...)`, `if (view.paused === true) say(WORDS.paused, 'page')` (the `unsay('page')` before the render clears it on the next view).

- [ ] **Step 1: Write the failing tests**

`fjolspil-seats.test.mjs`: change the first test's last line to `assert.equal(avatarOf('mosi'), MOSI_AVATAR)` and add:
```js
test('Mosi is an avatar the computer may have and a guest may not', () => {
  const seats = createSeats();
  assert.equal(seats.join({ guestId: 'g1', name: 'Anna', avatar: 'mosi' }).reason, 'bad-avatar');
  assert.deepEqual(seats.addAi({ name: 'Mosi', avatar: 'mosi' }), { ok: true, seat: 1 });
  assert.equal(MOSI_AVATAR.picture, 'assets/book/images/mosi-render.webp');
});
```
`fjolspil-host.test.mjs` (use its `rig`/fakes): 
```js
test('a session keeps its room under its own storage key', () => {
  const storage = new FakeStorage(); // the file has one, or add the three-method one from fjolspil-guest.test.mjs
  const a = rig({ storage }); const b = rig({ storage, storageKey: 'fjolspil.room.yatzy-junior' });
  a.fjolspil.openLobby({}); b.fjolspil.openLobby({});
  assert.notEqual(a.fjolspil.code, b.fjolspil.code);
  assert.deepEqual(Object.keys(storage.map).sort(), ['fjolspil.room.yatzy-junior', 'mosi-fjolspil-host']);
});
```
`fjolspil-guest.test.mjs`:
```js
test('a view that says the big screen is paused puts it in the status line, and the next view clears it', () => {
  const { page, root, net } = rig({ search: '?r=GULL', views: { yatzy: () => {} } });
  net.statusFn('connected'); net.message({ type: 'seat', body: { ok: true, seat: 1, name: 'Ásta' } });
  net.message({ type: 'view', seq: 5, body: { screen: 'yatzy', paused: true } });
  assert.equal(root.querySelector('.spil-status').textContent, 'Stóri skjárinn er í hléi');
  net.message({ type: 'view', seq: 6, body: { screen: 'yatzy' } });
  assert.equal(root.querySelector('.spil-status').textContent, '');
});
```
(Adapt the message shapes to the file's helpers: see how its other tests deliver a `seat` and a `view`.)

- [ ] **Step 2: Run them to see them fail**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/fjolspil-seats.test.mjs remake/tests/fjolspil-host.test.mjs remake/tests/fjolspil-guest.test.mjs`
Expected: the three new tests fail; nothing else.

- [ ] **Step 3: Implement**

As the Interfaces block says; `seats.js`'s header gains a line on Mosi's avatar (the junior game's own character, 2026-10-24).

- [ ] **Step 4: Run the three files, then the suite**

Run: the command of Step 2, then `npm run test:remake`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add remake/engine/fjolspil/seats.js remake/engine/fjolspil/fjolspil.js remake/engine/fjolspil/guest.js remake/tests/fjolspil-seats.test.mjs remake/tests/fjolspil-host.test.mjs remake/tests/fjolspil-guest.test.mjs
git commit -m "Fjölspil: Mosi has an avatar of his own, a session keeps its room under its own key, and a phone says when the big screen is paused"
```

---

### Task 4: The phone's Litla Yatzy screen

**Files:**
- Create: `remake/engine/fjolspil/guest-yatzy.js`, `remake/engine/fjolspil/yatzy-phone-sounds.js`
- Modify: `remake/spil.html` (import and register `yatzy`), `remake/spil.css` (a "Litla Yatzy" section after the Eitt! one, and the phone/sideways/reduced-motion parts), `remake/engine/fjolspil/guest.js` (`DEMOS.yatzy`)
- Test: `remake/tests/fjolspil-guest-yatzy.test.mjs`

**Interfaces:**
- Consumes: `avatarOf` (Task 3), `pressable` from `book/fx.js`, the view shape of spec §5. NOT `engine/yatzy-mosi/dice.js` (it imports three.js, which the phone page has no import map for): `guest-yatzy.js` keeps its own `FACES` list, the six `image` paths and names copied from `DINO_FACES` there (`eitt/mosi.webp`, `book/images/kambedla-render-thumb.webp`, `eitt/brontosaurus.webp`, `eitt/trex.webp`, `eitt/parasaurolophus.webp`, `eitt/pteranodon.webp`, resolved under `remake/assets/` as `guest-hals.js` resolves pictures), with a comment naming the source.
- Produces:
  - `renderYatzy(root, view, { send, doc = root.ownerDocument, control = null, audio = null })`, built once per `root` (a `WeakMap` as `guest-hals.js`), updated after. Elements, in order inside `root`: `h2.spil-yatzy-turn` ("Þú átt leik!" / "{name} á leik", class `mine` on her turn; hidden when over); `span.spil-yatzy-rolls` (three `i`, class `left` on the first `3 - rolls`); `ul.spil-yatzy-dice` with five `button.spil-yatzy-die` (`img.spil-picture` of `DINO_FACES[face-1].image` and `b` with the number; `data-face` 1..6 or 0 (back side: the picture hidden, `b` "?"); class `held`; `aria-pressed`; `disabled` unless `canHold`); `button.spil-yatzy-cup` ("Kasta!" when `rolls === 0`, "Kasta aftur!" after; `disabled` unless `canRoll`); `div.spil-yatzy-cards` with five `div.spil-yatzy-card[data-card=id]` each holding `button.spil-yatzy-pick` (`span.spil-yatzy-minis` of mini dice `span.spil-yatzy-mini` — picture and number — of `card.faces` when non-empty, else the card's example `EXAMPLES` as `yatzy-junior/game.js` has them (`pair [2,2]`, `twoPairs [2,2,4,4]`, `threeKind [3,3,3]`, `smallStraight [1,2,3,4,5]`, `yatzy [5,5,5,5,5]`), `span.spil-yatzy-name` (`card.label`), `strong.spil-yatzy-value` ("+6" from `preview`, the score when filled, "" otherwise)) and `div.spil-yatzy-confirm` (hidden; "Nota spjaldið? 0 stig", `button.spil-yatzy-use` "Nota", `button.spil-yatzy-other` "Velja annað"); classes `filled`, `available` (= `canScore && score === null`), `zero` (available and `preview === 0`); `ul.spil-yatzy-players` (one `li` per `players[]`: `.spil-face` with the avatar's picture and colour, `.spil-yatzy-pname`, `.spil-yatzy-total`; class `current` on `view.turn`); `div.spil-yatzy-won` (hidden until `winner !== null`: the winner's face in a `.spil-burst` and `h2.spil-words` "{name} vann!", or no face and "Jafntefli!" when `winner === 'tie'`).
  - Acts: the cup sends `{ type: 'roll' }` once and disables itself until the next view; a die sends `{ type: 'hold', die: i }` and disables all dice until the next view; a pick on an `available` card sends `{ type: 'score', card: id }` unless `zero`, when the card's confirm shows (the other cards' confirms hide); "Nota" sends it; "Velja annað" hides the confirm. Every control goes through `control(button, onTap)` when given, else `pressable`.
  - Tumble: when `view.roll?.seq` differs from the last view's (and this is not the first view), the dice that are not held get class `spil-tumble` for 950 ms and `audio?.effects({ sounds: yatzyPhoneSounds, gaps: YATZY_PHONE_GAPS })?.play('rattle')` is called.
  - `yatzy-phone-sounds.js`: `export const YATZY_PHONE_SFX = ['rattle']`, `export const YATZY_PHONE_GAPS = { rattle: 0.3 }`, `export function yatzyPhoneSounds({ tone, noise, bell, key })` returning `{ rattle() }`: four short noise bursts over ~300 ms (the same helpers `eittSounds` uses).
  - `guest.js` `DEMOS.yatzy`: Ásta's own turn after one roll, dice `[3, 3, 1, 5, 6]`, held `[true, true, false, false, false]`, `rolls: 1`, `canRoll/canHold/canScore: true`, cards with previews (`pair` 6, `twoPairs` 0, `threeKind` 0, `smallStraight` 0, `yatzy` 0), `roll: { seq: 1, by: 1 }`, players Egill 23, Ásta 15, Bjarni 9, Mosi (`avatar: 'mosi'`) 12, `winner: null`.
  - `spil.html`: `import { renderYatzy } from './engine/fjolspil/guest-yatzy.js'` and `views = { hals: renderHals, eitt: renderEitt, yatzy: renderYatzy }`.

- [ ] **Step 1: Write the failing tests** (`fjolspil-guest-yatzy.test.mjs`, built like `fjolspil-guest.test.mjs`'s `renderHals` test: `rig({ search: '?r=GULL', views: { yatzy: renderYatzy } })`, a seat, then views with rising `seq`)

```js
const mine = (over = {}) => ({ screen: 'yatzy', you: 1, turn: 1, round: 2, rolls: 1, dice: [3, 3, 1, 5, 6], held: [true, true, false, false, false], roll: { seq: 4, by: 1 }, canRoll: true, canHold: true, canScore: true,
  cards: [{ id: 'pair', label: 'Eitt par', score: null, preview: 6, faces: [3, 3] }, { id: 'twoPairs', label: 'Tvö pör', score: null, preview: 0, faces: [] }, { id: 'threeKind', label: 'Þrír eins', score: 9, preview: null, faces: [3, 3, 3] }, { id: 'smallStraight', label: 'Röð', score: null, preview: 0, faces: [] }, { id: 'yatzy', label: 'Yatzy', score: null, preview: 0, faces: [] }],
  players: [{ seat: 0, name: 'Egill', avatar: 'egill', total: 23 }, { seat: 1, name: 'Ásta', avatar: 'kambedla', total: 15 }, { seat: 2, name: 'Mosi', avatar: 'mosi', total: 12 }], winner: null, ...over });

test('her turn: the dice, the cup and the cards are hers; a roll, a hold and a score are sent once each', ...)
  // turn text "Þú átt leik!"; two rolls-left pips `.left`; die 0 has class held and aria-pressed "true"; a tap on the cup → net.sent has { type: 'act', body: { type: 'roll' } } once, the cup disabled; a tap on die 2 → hold 2 sent, dice disabled; a tap on `[data-card=pair] .spil-yatzy-pick` → { type: 'score', card: 'pair' }; `[data-card=threeKind]` has class filled and value "9"
test('a card worth nothing asks first', ...)
  // tap `[data-card=twoPairs]` → nothing sent, its `.spil-yatzy-confirm` not hidden; "Velja annað" hides it; tap again then "Nota" → score twoPairs sent once
test("another's turn: everything waits, the names and totals show", ...)
  // view mine({ turn: 2, canRoll: false, canHold: false, canScore: false }) → "Mosi á leik", cup and dice and picks disabled, players li count 3, the third has class current and text containing "12"
test('a new roll tumbles the free dice and rattles once; the first view never tumbles', ...)
  // first view: no `.spil-tumble`; a view with roll.seq 5 and dice [3,3,2,2,4]: dice 2..4 have `.spil-tumble`, dice 0..1 not; the rig's audio effects stub records one play('rattle') (see how fjolspil-guest.test.mjs stubs `audio` for renderEitt)
test('the end: the winner and the totals; a tie says so', ...)
  // winner: 2 → `.spil-yatzy-won` visible with "Mosi vann!", the turn line hidden; winner: 'tie' → "Jafntefli!"
test('a name is text', ...)
  // players[1].name '<b>Ásta</b>' → `.spil-yatzy-pname` textContent equals it, innerHTML has no `<b>` element
```

- [ ] **Step 2: Run to see them fail**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/fjolspil-guest-yatzy.test.mjs`
Expected: fail (`guest-yatzy.js` not found).

- [ ] **Step 3: Implement `guest-yatzy.js`, `yatzy-phone-sounds.js`, the `spil.css` section, `DEMOS.yatzy`, `spil.html`**

CSS: the dice in a row of five (`grid-template-columns: repeat(5, 1fr)`, each at least `--spil-target` tall, the picture round, the number on a chip as `.mini-die b` in `yatzy-junior.css`); a held die with a gold frame (`box-shadow: 0 0 0 4px var(--gold)`, `--gold: #f2b630`) and a check mark; the cup as the big green pill (`.spil-go` family); the cards in a row of five on a tablet and `3 + 2` on a phone (`grid-template-columns: repeat(3, 1fr)` with the last two spanning); `spil-tumble` reused; under reduced motion a fade. Sideways on a phone: the dice and the cup left, the cards right.

- [ ] **Step 4: Run the tests, the suite, and capture**

Run: the Step 2 command; `npm run test:remake`; then with the server on 4198: `node remake/tools/capture.mjs --page remake/spil.html --shot phone="demo=yatzy" --size 390x844 --ready "window.__demoReady === true" --out qa/fjolspil-yatzy/task4` and the same with `--size 1180x820 --shot tablet=…` and `--size 844x390 --shot sideways=…`.
Expected: pass; the captures show the full screen without overflow (compare `document.documentElement.scrollWidth` to the viewport with `--eval` if in doubt). Send the three captures to the owner in the task report.

- [ ] **Step 5: Commit**

```bash
git add remake/engine/fjolspil/guest-yatzy.js remake/engine/fjolspil/yatzy-phone-sounds.js remake/engine/fjolspil/guest.js remake/spil.html remake/spil.css remake/tests/fjolspil-guest-yatzy.test.mjs
git commit -m "Fjölspil: the phone's Litla Yatzy screen: the cup, the five dice to hold, the five cards, and everyone's totals"
```

---

### Task 5: The session in the junior page: lobby, seats, views and acts

**Files:**
- Create: `remake/engine/yatzy-junior/fjolspil.js`
- Modify: `remake/yatzy-junior.html` (a `fjolspil.css` link; `<div id="fjolspil" class="fjolspil" hidden></div>` inside `main#game` after `#error`; the welcome dialog's `#multi` button "Fjölspil" between `#learn` and `#start`; the `.players` bar emptied of its two fixed cards)
- Modify: `remake/yatzy-junior.css` (`.players` for 2–4 cards: `gap` 18px and `.portrait` 72px when `.players[data-count="3"]`, 64px and gap 14px for `"4"`; `.player-card.absent` dim with "…"; the card row's name tag `#card-owner`)
- Modify: `remake/engine/yatzy-junior/game.js` (the players bar built from a list; `createFjolspil`; `start` with seats; `renderUI`'s turn/players; `beginRoll`/`toggleHold`/`record` from acts; `aiStep` for AI and covered seats; `save` of a Fjölspil game)
- Test: `remake/tests/yatzy-junior-fjolspil.test.mjs`

**Interfaces:**
- Consumes: `createFjolspil` (Task 3's `storageKey`), `createSeats` shapes, `rules.js` (Task 2), `MOSI_AVATAR`.
- Produces (`engine/yatzy-junior/fjolspil.js`, pure except for the save):
  - `export const MOSI_AI = { name: 'Mosi', avatar: 'mosi', add: 'Bæta Mosa við', remove: 'Taka Mosa út' }`, `export const STORAGE_KEY = 'fjolspil.room.yatzy-junior'`, `export const SAVE_KEY = 'mosi.yatzy.junior.fjolspil.v1'`.
  - `playersOf(seats)` → `seats.list().map(s => String(s.seat))` (the rules' player ids are the seat numbers).
  - `yatzyView(game, seats, seat, { settled, paused, lastRoll })` → the spec §5 view: `you: seat`, `turn: game.currentPlayer`, `round: roundOf(game)`, `rolls: game.rollCount`, `dice`, `held`, `roll: lastRoll` (`{ seq, by }` or null), `canRoll = !paused && settled && turn === seat && status === 'playing' && rollCount < 3 && !held.every(Boolean)`, `canHold = … && rollCount > 0 && rollCount < 3`, `canScore = … && rollCount > 0`, `cards` of the current player (`{ id, label, score, preview: score === null && rollCount > 0 ? previews(game)[id] : null, faces: player.faces[id] ?? [] }`), `players` (`{ seat, name, avatar, total }` from the seats and `totals()`), `winner` (`null`, `'tie'`, or the seat number of the winner's id), `paused` only when true.
  - `actOf(game, seat, act, { settled })` → `null` when the act is not allowed now (not her turn, not settled, `roll` with no roll left or all held, `hold` outside `0..4` or with `rollCount` 0 or 3, `score` on a filled or unknown card or with `rollCount` 0), else `{ type: 'roll' } | { type: 'hold', die } | { type: 'score', card }` normalised.
  - `keepFjolspil(storage, { state, seats })` / `readFjolspil(storage)` → `{ state, seats } | null` (`restoreGame(state)` must pass, `seats.seats.length === state.players.length`, `seats.seats[0].kind === 'host'`, every `state.players[i].id === String(i)`; else null and the key removed) / `forgetFjolspil(storage)`.
  - `game.js`: the players bar is built by `buildPlayers(list)` (`[{ name, avatar | null, colour, isMosi }]`): one `.player-card` per player with `.portrait` (an `img` of `avatarOf(avatar).picture` resolved against the page, or the "Þú" `b` for the child in the solo game, or Mosi's picture), `.score`, `.pname`; `playerEls[i] = { card, portrait, total }` replaces every `$('you-card')`/`$('mosi-card')`/`$('you-total')`/`$('mosi-total')` lookup (`scoreFlight`, `flyScore`, `renderUI`, `juice.pulse`). The solo game builds `[{ name: 'Þú', … }, { name: 'Mosi', … }]` as the HTML had them. `.players[data-count]` carries the count.
  - `game.js` holds `fjolspil = createFjolspil(document, { storageKey: STORAGE_KEY, audio: { sfx: name => audio.cue('tap') }, timers })` after `initialize`'s DOM is ready, and `multi = { seats, lastRoll: null, seq: 0 } | null`. `#multi` → `closeDialogs(); const opened = await fjolspil.openLobby({ ai: MOSI_AI }); if (!opened) { openDialog('welcome'); return; } startMulti(opened.seats)`. `startMulti(seats)`: `state = createGame({ seed: random 32-bit, players: playersOf(fjolspil.seats) })`, `buildPlayers` from the seats (`avatarOf(seat.avatar)`, `isMosi` for `kind === 'ai' && !covered`), `started = true`, `phase` from the current player's seat kind (`'human'` for seat 0, `'remote'` for a guest's seat, `'ai-wait'` for an AI or covered seat), `view('table', true)`, `sendViews()`.
  - Turn phases: a new phase `'remote'` (a guest's seat plays from her phone: the cup and the die buttons are hidden/disabled, `isHuman()` false, `cupButton.dataset.remote = 'true'` and `--c` of the seat for its ring colour). `fjolspil.onAct((seat, act) => …)`: `actOf(state, seat, act, { settled: settled() })`; `roll` → `beginRoll()` (its guards relaxed for `phase === 'remote'`), `hold` → the `toggleHold` body without the `isHuman()` guard, `score` → `record(id)` (the zero question is the phone's). After every state change (`beginRoll`, `rolled`, `toggleHold`, `record`, `advanceTurn`) `sendViews()` sends each guest seat `yatzyView(...)` through `fjolspil.send(seat, view)`; `multi.lastRoll = { seq: ++multi.seq, by: state.currentPlayer }` is set in `rolled()`.
  - `advanceTurn()` picks the next phase by the next seat's kind as `startMulti` does; `aiStep()` runs for `phase.startsWith('ai-')` whichever seat it is (Mosi's own, or a covered guest's). Mosi's spoken lines in Fjölspil are Task 7's; until then `say()` is skipped for a seat other than 0 and 1-as-Mosi.
  - `save()`: in Fjölspil `keepFjolspil(localStorage, { state, seats: fjolspil.seats.snapshot() })` instead of the solo save (and `forgetFjolspil` when finished).

- [ ] **Step 1: Write the failing tests** (`yatzy-junior-fjolspil.test.mjs`, pure: build seats with `createSeats` + `join`/`addAi`, a game with `createGame({ players: playersOf(seats) })`)

```js
test('the view of a guest on her turn after one roll: what she may do, her cards with previews, everyone's totals', ...)
  // seats: Egill, Anna ('sloedla'), Mosi ai; game players ['0','1','2'], startingPlayer 1; roll once → yatzyView(game, seats, 1, { settled: true, paused: false, lastRoll: { seq: 3, by: 1 } }): you 1, turn 1, rolls 1, canRoll/canHold/canScore true, cards[0].preview a number, players[2].avatar 'mosi', round 1, winner null, no `paused` key
test('a view for a seat that is not on turn, or while the dice move, or paused, allows nothing', ...)
  // seat 0's view: all three false; settled false: all false for seat 1; paused: all false and paused === true
test('actOf lets through only what the rules allow now', ...)
  // roll at rollCount 3 → null; hold at rollCount 0 → null; hold die 5 → null; score 'pair' twice (after score) → second null; from seat 0 on seat 1's turn → null; a valid { type: 'score', card: 'pair' } → equal
test('a kept Fjölspil game reads back only when its seats fit its state', ...)
  // keep { state, seats: snapshot } → readFjolspil gives it (deepEqual state); a snapshot with one seat fewer → null and the key gone; a state whose players are ['you','mosi'] → null
test('the winner in the view is a seat number or tie', ...)
  // play a 2-seat game to the end with fixed scores → winner 0 or 1, or 'tie' when totals equal (set both scorecards to zeros)
```

- [ ] **Step 2: Run to see them fail**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/yatzy-junior-fjolspil.test.mjs`
Expected: fail (module not found).

- [ ] **Step 3: Implement `engine/yatzy-junior/fjolspil.js`**, run the test file to green.

- [ ] **Step 4: Wire the page: `yatzy-junior.html`, `yatzy-junior.css`, `game.js`**

As the Interfaces block says. Keep the solo game byte-for-byte in behaviour: `npm run test:yatzy-junior` and `npm run check:yatzy-junior` (server on 4197, or `JUNIOR_URL=http://127.0.0.1:4198/remake/yatzy-junior.html?qa`) must pass unchanged. Expose for the headless tool: `window.__juniorQA.fjolspil = fjolspil` and `getMulti: () => multi && { seats: fjolspil.seats.list(), lastRoll: multi.lastRoll }`.

- [ ] **Step 5: Play it headless once by hand**

With the server on 4198: a Node script in the scratchpad (Playwright, Edge, as `yatzy-junior-check.mjs` launches it) opens `yatzy-junior.html?qa`, taps `#multi`, reads the code from `.fjolspil-code` (see `lobby.js` for the class), opens `spil.html?r=<code>` in a second page, joins as "Anna" with `sloedla`, taps "Byrjum!" on the first page, and plays one round from each side (Egill from the cup, Anna from the phone's cup, a hold and a pick). Expected: both pages show the same dice; the phone's pick fills the card on the big screen. Note the script's path in the task report (Task 6 turns it into the tool).

- [ ] **Step 6: Run everything and commit**

Run: `npm run test:remake`; `npm run test:yatzy-junior`; `npm run check:yatzy-junior`.
```bash
git add remake/engine/yatzy-junior/fjolspil.js remake/engine/yatzy-junior/game.js remake/yatzy-junior.html remake/yatzy-junior.css remake/tests/yatzy-junior-fjolspil.test.mjs
git commit -m "Fjölspil: Litla Yatzy opens a lobby of its own, seats two to four players, and plays a guest's turn from her phone"
```

---

### Task 6: The big screen: the waiting card, Mosi covering a seat, the card owner's tag, pause and close, save and resume, the headless tool

**Files:**
- Modify: `remake/engine/yatzy-junior/game.js` (`advanceTurn`/the remote turn's wait; the pause dialog's "Hætta Fjölspili"; `pagehide`; the welcome dialog's "Halda áfram (Fjölspil)"; `renderUI`'s `#card-owner`)
- Modify: `remake/yatzy-junior.html` (`#continue-multi` "Halda áfram (Fjölspil)" before `#continue`; `#card-owner` tag above `#score-rows`; `#new-game` text swapped in Fjölspil)
- Modify: `remake/yatzy-junior.css` (`#card-owner`: the `.pname` style on a small paper tag at the row's left end, hidden in the solo game)
- Create: `remake/tools/yatzy-junior-fjolspil-check.mjs`; Modify: `package.json` (`check:yatzy-junior:fjolspil`)
- Test: `remake/tests/yatzy-junior-fjolspil.test.mjs` (the save/resume paths), the tool

**Interfaces:**
- Consumes: `fjolspil.waitFor(seat)` → `'back' | 'cover' | 'closed'`, `fjolspil.seats.cover/uncover` (done by the session), `fjolspil.resume(snapshot)`, `fjolspil.closeGame()`.
- Produces:
  - A guest's turn whose seat is absent: `phase = 'waiting'`, `const result = await fjolspil.waitFor(seat)`; `'back'` → `phase = 'remote'`, `sendViews()`; `'cover'` → the seat is now `kind: 'ai', covered: true`: `phase = 'ai-wait'` and `aiStep` plays it with no spoken line (`say` skipped while the current seat is covered); `'closed'` → `endMulti()`. A covered seat whose guest is present at its next turn is uncovered by `waitFor` at once (it resolves `'back'`), so the turn goes to the phone.
  - `endMulti()`: `fjolspil.closeGame()`, `forgetFjolspil(localStorage)`, `multi = null`, `started = false`, the solo bar rebuilt, the welcome dialog (`$('continue-multi').hidden = !readFjolspil(localStorage)`).
  - `#new-game` reads "Hætta Fjölspili" while `multi` (its handler calls `endMulti()` then shows the welcome dialog); `addEventListener('pagehide', () => { if (multi) fjolspil.closeGame(); })` (before `dispose`).
  - Pause: `syncPause()` in Fjölspil also calls `sendViews()` so every phone's view carries `paused: true` while `paused` (hidden tab, a dialog open) and a fresh one when it lifts.
  - `#continue-multi` → `const kept = readFjolspil(localStorage); await fjolspil.resume(kept.seats); if (fjolspil.seats.count !== kept.state.players.length) { openDialog('welcome'); return; } resumeMulti(kept.state)`: `state = structuredClone(kept.state)`, the bar from the seats, the phase from the current seat, `sendViews()`.
  - `#card-owner`: `textContent` the current player's name in Fjölspil ("Anna"), hidden in the solo game.
  - While `multi`: the lesson and the demonstration are closed (spec §7): `#learn` and `#learn-help` hidden, `#help` opens the help dialog with "Sýndu mér" hidden, `beginLesson()` returns at once; the idle hint (`paintPicks`'s `idleHint`) runs only for seat 0.
  - The tool `yatzy-junior-fjolspil-check.mjs` (`FJOLSPIL_URL`, default `http://127.0.0.1:4198/remake/`): opens the junior page `?qa`, taps `#multi`, reads the code, opens two `spil.html?r=<code>` pages (Anna/`sloedla`, Bjarni/`gramedla`), adds Mosi in the lobby, "Byrjum!", then plays: Egill one full turn from the cup (`#cup-target` then a `.card-select`), Anna from her phone (cup, a hold, a pick), Mosi by himself (`waitForFunction` on `getState().currentPlayer`), Bjarni from his phone; then closes Bjarni's page during his next turn, waits for `.fjolspil-waiting` (the lobby's waiting card), waits `COVER_AFTER_MS` for "Halda áfram án …", taps it, sees Mosi play the seat; reopens Bjarni's page with the same localStorage (a new context with the stored guest id, or the same context's `page.goto`) and sees his next turn come to the phone; plays to the end (`turnCount === maxTurns(4)`), and asserts `#win-dialog` open. Captures: `lobby`, `egill-turn`, `anna-turn`, `anna-phone`, `waiting`, `covered`, `finished` into `qa/yatzy-junior-fjolspil/`, plus `browser-report.json`. Asserts no page errors on any of the three pages.

- [ ] **Step 1: Write the failing tests** (save/resume in `yatzy-junior-fjolspil.test.mjs`): `forgetFjolspil` removes the key; a `readFjolspil` of a finished state → null (a finished game is never offered).

- [ ] **Step 2: Implement** game.js, html, css as above; the tool.

- [ ] **Step 3: Run the tool**

Run: server on 4198, `npm run check:yatzy-junior:fjolspil`
Expected: it prints the checks and writes the seven captures; `errors: []`. Send `lobby`, `anna-turn`, `anna-phone`, `waiting` and `finished` to the owner in the task report.

- [ ] **Step 4: Run everything and commit**

Run: `npm run test:remake`; `npm run test:yatzy-junior`; `npm run check:yatzy-junior`.
```bash
git add remake/engine/yatzy-junior/game.js remake/yatzy-junior.html remake/yatzy-junior.css remake/tools/yatzy-junior-fjolspil-check.mjs package.json remake/tests/yatzy-junior-fjolspil.test.mjs
git commit -m "Fjölspil: Litla Yatzy waits for a guest who went, lets Mosi cover her seat, keeps a Fjölspil game to continue, and is checked headless with two phones"
```

---

### Task 7: Mosi's voice in Fjölspil

**Files:**
- Modify: `remake/engine/yatzy-junior/voice-lines.js` (`MULTI_LINES`), `remake/engine/yatzy-junior/voice.js` (optional lines), `remake/engine/yatzy-junior/game.js` (what is said when), `remake/tools/yatzy-junior-voices.mjs` (generates `MULTI_LINES` too), `remake/yatzy-junior.html`/`game.js` (the bubble's caption with the name)
- Test: `remake/tests/yatzy-junior-voice.test.mjs`, `remake/tests/voice-lines.test.mjs` (if it enumerates the junior lines), `remake/tests/yatzy-junior-startup.test.mjs` (startup still requires only `VOICE_LINES`)

**Interfaces:**
- Produces:
  - `voice-lines.js`: `export const MULTI_LINES = Object.freeze({ multiWelcome: { text: 'Velkomin að borðinu! Við skiptumst á.', optional: true }, multiTurn: { text: 'Næsti kastar!', optional: true }, multiScored: { text: 'Flott! Stigin fara á kortið.', optional: true }, multiZero: { text: 'Ekkert í þetta sinn. Næst gengur betur!', optional: true }, multiWait: { text: 'Við bíðum aðeins.', optional: true }, multiOver: { text: 'Leik lokið! Sjáum hver vann.', optional: true } })` in the same entry shape `VOICE_LINES` uses (read the file: entries are `{ text, … }` after `Object.entries(...)` mapping; match it).
  - `voice.js`: `createJuniorVoice({ lines })` accepts entries with `optional: true`; `say(id)` of an optional line with no manifest `src` runs the caption-only fallback for the caption's duration (`mode === 'fallback'`, `onSpeaking(true)` for the words-based duration) and never calls `onUnavailable`; a non-optional line keeps today's behaviour.
  - `game.js`: `voice = createJuniorVoice({ lines: { ...VOICE_LINES, ...MULTI_LINES }, … })`; the startup check loops `VOICE_LINES` only. In Fjölspil: `multiWelcome` at `startMulti`; at a turn's start `say('mosiTurn')` when the seat is Mosi's own, `say('yourTurn')` for seat 0 as today, else `say('multiTurn')` with the bubble caption "Anna á leik" (`CAPTIONS` lookup replaced by a `captionFor(id)` that formats `multiTurn`, `multiScored`, `multiZero`, `multiOver` with the current name: "Anna á leik", "Anna: 12 stig", "Anna: 0 stig", "Anna vann!" / "Jafntefli!"); after a score by a guest or a covered seat `say('multiScored', () => say(`points_${points}`))` or `say('multiZero')` at 0; the wait card `say('multiWait')`; the end `say('multiOver')` then the totals as today only in the solo game. A covered seat's turn says nothing.
  - `yatzy-junior-voices.mjs`: the generated set is `{ ...VOICE_LINES, ...MULTI_LINES }`; `--dry-run` lists the six new ids as "to make"; the committed record names them `yatzy-junior/<id>`.

- [ ] **Step 1: Write the failing tests**

`yatzy-junior-voice.test.mjs`, with the file's `fixture()`: a line `optional: { text: 'Næsti kastar!', optional: true }` with no manifest entry: `voice.say('optional')` → `captions` got it, `unavailable` stays empty, `speaking` saw `true`, `voice.getDebugState().mode === 'fallback'`; the existing `missing` line still reaches `unavailable`.
`yatzy-junior-startup.test.mjs` or a new test in `yatzy-junior-fjolspil.test.mjs`: `Object.keys(MULTI_LINES)` are the six ids and every entry has `optional: true` and Icelandic text.

- [ ] **Step 2: Run to see them fail**; **Step 3: Implement**; **Step 4: `node remake/tools/yatzy-junior-voices.mjs --dry-run`** prints the six ids as missing and asks for nothing (no key needed for a dry run; if the tool insists on the key before `--dry-run`, make the dry run not need it).

- [ ] **Step 5: Run the suite and the junior checks, commit**

```bash
git add remake/engine/yatzy-junior/voice-lines.js remake/engine/yatzy-junior/voice.js remake/engine/yatzy-junior/game.js remake/tools/yatzy-junior-voices.mjs remake/tests/yatzy-junior-voice.test.mjs remake/tests/yatzy-junior-fjolspil.test.mjs
git commit -m "Fjölspil: Mosi has six lines for a table of many, said from the text until the owner records them"
```

In the task report, tell the owner the command to record them: `node remake/tools/yatzy-junior-voices.mjs --only multiWelcome,multiTurn,multiScored,multiZero,multiWait,multiOver` with his key in the environment, then commit the MP3s and `manifest.json`.

---

## Finishing

After Task 7: the whole-branch review (requesting-code-review's template, the most capable model) over `1635358..HEAD`, one fix wave, `npm run test:remake`, `npm run test:cloud`, `npm run check:yatzy-junior`, `npm run check:yatzy-junior:fjolspil`; then the owner's report with the captures, the deploy command and the voice command. Not pushed, not merged.
