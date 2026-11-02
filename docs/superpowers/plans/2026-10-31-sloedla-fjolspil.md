# Söngur Slóeðlu: fjölspil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Up to three people play one song together: Egill at the big screen, guests on phones or tablets, each on their own dinosaur and level, the big screen judging every tap.

**Architecture:** The song game reuses Fjölspil's host session (`createFjolspil`: room, seats, WebRTC, reconnect) with a lobby of its own on the menu's stage. Pure modules carry the rules: `lineup.js` (seats → dinosaurs → lanes → levels), `clock-sync.js` (shared clock), per-lane judging in `chart.js` and per-player charts in `v2/chart.js`. `fjolspil-song.js` is the big screen's band host (lobby, tap stamps in, notes and verdicts out, takeover). The guest runs the same `game.js` in a `'guest'` mode fed by `remote-round.js`, with no music.

**Tech Stack:** Plain ES modules in the browser, canvas 2D (game), three.js stage (unchanged), WebRTC data channel via Fjölspil's `net.js`, `node:test` with `remake/tests/fake-dom.mjs` and `fake-audio.mjs`, headless Edge over raw CDP for the walk.

**Spec:** `docs/superpowers/specs/2026-10-31-sloedla-fjolspil-design.md` (Icelandic). Fjölspil's own spec: `docs/superpowers/specs/2026-10-24-fjolspil-design.md`.

## Global Constraints

- Worktree `C:\Risaeðla\dino-sloedla-lag`, branch `sloedla-lag`. Commit only there; never merge or push (the repo is public; the owner decides).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files are LF. Edit with Edit/Write; scripts with backslashes or backticks are written with Write and run by path, never through a bash heredoc.
- Never touch `design/` or `dist/` (importing `dist/vendor` is fine). No Claude-drawn art: only the game's own pictures and models.
- Test command (from the worktree root): `npm run test:remake`. The whole suite is green at the end of every task; other Fjölspil games (Háls og hali, Eitt!, Litla Yatzy) behave as before, and a lobby view gains keys only when the song game sets them.
- Solo play is unchanged: with no lineup the game, the player and the chart give exactly today's notes, windows and fall.
- One headless capture at a time: `mkdir C:\Users\fannare\AppData\Roaming\Claude\side-session-notes\local_5af6e842-d0c9-4f2a-92fb-56f234adc53d\sloedla-keppni\rec-lock` before, `rmdir` after.
- DJ lines only through `node remake/tools/sloedla-dj.mjs` (key from the environment, never printed).
- Values from the spec: `REMOTE_GRACE = 0.3` s; clock: 8 asks 50 ms apart before a song, one a second during it, follow only answers within 10 ms of the best trip, at most 2 ms a step; a clock anchor every 2000 ms; 3000 ms of silence → Egill takes the dinosaur; phone when the short side < 600 CSS px (`?taeki=simi|spjald` overrides); vibrate 15 ms on a hit, 30 ms on "Fullkomið!"/"Frábært!"; seats: 3 with "3 eðlur", 2 with "2 eðlur"; room key `mosi-fjolspil-sloedla`; QR at least 28 % of the screen's short side.
- Dinosaur ↔ avatar ↔ role: `kambedla` ↔ `b`, `sloedla` ↔ `a`, `thorsedla` ↔ `c`. `gramedla`, `flugedla`, `uggedla` are never offered.
- Icelandic copy, exactly: „Spilum saman“, „Spila einn“, „Hvaða eðlu spilar þú?“, „Skannaðu til að spila með“, „Laus“, „Krakki eða fullorðinn?“, „Krakki“, „Fullorðinn“, „Egill velur lag…“, „Tilbúin!“, „Þú kemst inn í næsta lagi!“, „Bíðum eftir næsta lagi…“, „Takk fyrir að spila!“, „Allar eðlurnar eru í notkun“, „Keyrðu þjóninn með --lan“. DJ: `saman` „Fáum vini með! Skannið kóðann!“ · „Hver vill spila með?“; `kom` „Nýr spilari kominn!“ · „Velkomin í hljómsveitina!“.
- Guest devices make no sound during a song.
- Rulings already taken in this plan (spec silent or refined), each to be ledgered when built:
  - Notes are thinned **per player** (each player's lanes at that player's level, as alone), not per level: a lone child guest gets a full child's chart on her lane.
  - Every guest receives every lane's notes; a phone draws only its own (simpler than per-device streams; a few KB).
  - When Egill takes a lane, its windows and the density of later sections follow Egill's level; its fall speed stays as it started (falling notes never jump).
  - „Veljum lag →“ waits until Egill has picked his dinosaur in „Spilum saman“.
  - „2 eðlur“ is disabled while a guest holds Kambeðla or two guests are seated.
  - The end line counts „Fullkomið!“ and „Frábært!“ together („Frábært! ×N“) beside the points (spec §15 left it open; the owner may change it).
  - A guest absent at „Spila!“ is dropped by Fjölspil's `dropAbsent`; her phone's next hello seats her again if her dinosaur is free.

## Review Focus

1. A guest's phone locks or backgrounds mid-song and comes back: nothing throws; it shows „Þú kemst inn í næsta lagi!“; its taps for the lane Egill took are ignored (Task 9 test).
2. A tap stamp from a broken or unsynced clock (from the future, or seconds old): never judged (Task 2 `hostSongTime` test, Task 9 test).
3. Egill switches to „2 eðlur“ or changes his dinosaur while guests are seated: never two players on one dinosaur, nobody silently loses a lane (Task 2 `mineFor`/`canTwoLanes` tests).
4. The big screen reloads with guests seated: same room, guests re-seated with their level from their phones' hello (Task 3 test).
5. Notes reach a guest after their time on a slow link (relay): the guest's chart stays in order, nothing throws, they pass as missed (Task 8 test).

---

### Task 1: Per-player notes and per-lane judging

**Files:**
- Modify: `remake/engine/sloedla/chart.js` (`createJudge`, new `REMOTE_GRACE`)
- Modify: `remake/engine/sloedla/v2/chart.js` (new `bandChart`, `expectedOf` takes `groups`)
- Modify: `remake/engine/sloedla/v2/player.js` (`groups`, `onDecide`)
- Test: `remake/tests/sloedla.test.mjs`, `remake/tests/sloedla-v2.test.mjs`

**Interfaces:**
- Produces: `REMOTE_GRACE = 0.3`.
- Produces: `createJudge(notes, { window, early, late, great, near, windowOf = null })`; `windowOf(lane)` → `{ early, late, great, grace }`, any missing key falling back to the judge's own; `grace` (default 0) is added to a note's deadline, `Infinity` means only `settle` resolves it. New method `settle(index, state /* 'hit' | 'missed' */)` → the state it had ('waiting', 'hit', 'missed'); a waiting note counts as resolved once.
- Produces: `bandChart(song, index, variant, { groups, transpose = 0 })` → the union of `sectionChart(song, index, variant, { level, roles, transpose })` for each `{ roles, level }` of `groups`, sorted by `t`.
- Produces: `expectedOf(song, { level, roles, groups = null })` (groups win when given).
- Produces: `createPlayer({ …, groups = null, onDecide = null })`: `groups` an array or a function returning one, read at every decision; default `[{ roles, level }]`; `onDecide(notes, { index, start, variant, transpose })` after a section's notes join `chart`. `roles` stays every role with a lane; `fall` is the longest fall of the lanes (the caller's).

- [ ] **Step 1: Write the failing judge tests** (append to `sloedla.test.mjs`; import `REMOTE_GRACE`)

```js
test('judge: a grown-up lane beside a child\'s keeps the grown-ups\' window', () => {
  const judge = createJudge([{ t: 1, lane: 0 }, { t: 1, lane: 1 }], { windowOf: lane => (lane === 0 ? LEVELS.barn : LEVELS.fullordinn) });
  assert.equal(judge.tap(0, 1.3).kind, 'hit');
  assert.equal(judge.tap(1, 1.3).kind, 'near');
});
test('judge: a guest\'s lane waits REMOTE_GRACE before its note is missed, so a stamped tap that came late still counts', () => {
  const notes = [{ t: 1, lane: 0 }, { t: 1, lane: 1 }, { t: 3, lane: 1 }];
  const judge = createJudge(notes, { windowOf: lane => ({ ...LEVELS.barn, grace: lane === 1 ? REMOTE_GRACE : 0 }) });
  assert.deepEqual(judge.sweep(1.6), [0]);
  assert.equal(judge.tap(1, 1.2).kind, 'hit');
  assert.deepEqual(judge.sweep(3.64), []);
  assert.deepEqual(judge.sweep(3.66), [2]);
});
test('judge: a lane judged elsewhere is never swept; settle gives it the big screen\'s word', () => {
  const judge = createJudge([{ t: 1, lane: 0 }, { t: 1.5, lane: 1 }], { windowOf: lane => ({ ...LEVELS.barn, grace: lane === 1 ? Infinity : 0 }) });
  assert.deepEqual(judge.sweep(9), [0]);
  assert.equal(judge.state(1), 'waiting');
  assert.equal(judge.settle(1, 'hit'), 'waiting');
  assert.equal(judge.settle(0, 'hit'), 'missed');
  assert.equal(judge.left(), 0);
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm run test:remake` → the three new tests fail (`REMOTE_GRACE` undefined / `settle` not a function).
- [ ] **Step 3: Implement** `REMOTE_GRACE`, `windowOf`, `settle` in `chart.js`. `sweep(time)` walks from `first` while `notes[i].t < time`, missing each waiting note whose `t + late + grace < time`, and moves `first` past resolved notes only (a waiting note with grace holds it). `tap`'s reach uses the tapped lane's windows.
- [ ] **Step 4: Run, expect PASS** — `npm run test:remake` → all green (the judge's old tests unchanged).
- [ ] **Step 5: Write the failing chart and player tests** (in `sloedla-v2.test.mjs`; import `bandChart`; `rig` gains `groups` and `onDecide`, passed to `createPlayer`)

```js
test('band chart: each player gets her own notes at her level, as she would alone', () => {
  const song = makeSong();
  const groups = [{ roles: ['a'], level: 'barn' }, { roles: ['b', 'c'], level: 'fullordinn' }];
  timelineOf(song).sections.forEach((_, k) => {
    const band = bandChart(song, k, 'normal', { groups });
    assert.deepEqual(band.filter(n => n.role === 'a'), sectionChart(song, k, 'normal', { level: 'barn', roles: ['a'] }));
    assert.deepEqual(band.filter(n => n.role !== 'a'), sectionChart(song, k, 'normal', { level: 'fullordinn', roles: ['b', 'c'] }));
    assert.ok(band.every((n, i) => i === 0 || band[i - 1].t <= n.t));
  });
});
test('band chart: one player on every lane gets the notes of today', () => {
  const song = makeSong();
  timelineOf(song).sections.forEach((_, k) => assert.deepEqual(
    bandChart(song, k, 'normal', { groups: [{ roles: ROLES, level: 'barn' }] }),
    sectionChart(song, k, 'normal', { level: 'barn', roles: ROLES })));
});
test('v2 player: each section is decided with the groups of that moment and told to onDecide', () => {
  let groups = [{ roles: ROLES, level: 'barn' }];
  const told = [];
  const { song, player, to } = rig({ groups: () => groups, onDecide: (notes, section) => told.push({ notes, section }) });
  player.start(0.4);
  groups = [{ roles: ['b', 'a'], level: 'barn' }, { roles: ['c'], level: 'fullordinn' }];
  to(timelineOf(song).length);
  const last = told.at(-1);
  assert.equal(told.length, timelineOf(song).sections.length);
  assert.deepEqual(last.notes, bandChart(song, last.section.index, last.section.variant, { groups, transpose: last.section.transpose }));
});
```

- [ ] **Step 6: Run, expect FAIL** — `bandChart` not exported.
- [ ] **Step 7: Implement** `bandChart`, `expectedOf({ groups })`, and in `player.js` read `groups` at each `decide(k)` (notes from `bandChart`), call `onDecide`, compute `expected` from the groups at creation.
- [ ] **Step 8: Run, expect PASS** — `npm run test:remake` → all green.
- [ ] **Step 9: Commit**

```bash
git add remake/engine/sloedla/chart.js remake/engine/sloedla/v2/chart.js remake/engine/sloedla/v2/player.js remake/tests/sloedla.test.mjs remake/tests/sloedla-v2.test.mjs
git commit -m "Song multiplayer: each player's notes at her level; each lane judged by its own window, a guest's with grace"
```

### Task 2: The band's rules — lineup and shared clock

**Files:**
- Create: `remake/engine/sloedla/lineup.js`, `remake/engine/sloedla/clock-sync.js`
- Test: `remake/tests/sloedla-fjolspil.test.mjs` (new)

**Interfaces:**
- Consumes: `LEVELS`, `REMOTE_GRACE` (chart.js); `AVATARS` (fjolspil/seats.js).
- Produces (`lineup.js`):
  - `SONG_AVATARS = { b: 'kambedla', a: 'sloedla', c: 'thorsedla' }`; `roleOf(avatarId)` → role or null; `rolesOf(lanes)` → `['b','a','c']` or `['a','c']`.
  - `lobbyOf({ lanes, mine })` → `{ offer, reserved, max }`: `offer` the avatars of `rolesOf(lanes)` without Egill's; `reserved` every other `AVATARS` id; `max` 3 or 2.
  - `lineupOf({ lanes, mine, level, seats })` → `Lane[]` in `rolesOf(lanes)` order, `Lane = { role, player, name, level, judged }`; a present `'remote'` seat holding a lane's avatar plays it (`player` its seat, `name` its name, `level` its level or `'barn'`, `judged: 'grace'`); every other lane is Egill's (`player: 0, name: 'Egill', level, judged: 'here'`).
  - `groupsOf(lineup)` → `[{ player, roles, level }]` in first-lane order.
  - `takeOver(lineup, role, level)` → a new lineup with that lane Egill's at `level`.
  - `laneRules(lane)` → `{ windows: LEVELS[lane.level], fall: LEVELS[lane.level].fall, grace }`, grace `0` for `'here'`, `REMOTE_GRACE` for `'grace'`, `Infinity` for `'outside'`.
  - `canTwoLanes(seats)` → false while a guest seat holds `kambedla` or two guest seats exist.
  - `mineFor({ lanes, mine, seats })` → Egill's role: `mine` when it has a lane and no guest holds it, else the first free role of `rolesOf(lanes)`, else null.
  - `linesOf(lineup, laneScores)` → `[{ player, name, roles, points, great }]`, one per player, Egill first then by seat; `laneScores[lane] = { points, great }`.
- Produces (`clock-sync.js`):
  - `MEASURE = { asks: 8, gapMs: 50 }`, `FOLLOW = { everyMs: 1000, slackMs: 10, stepMs: 2 }`, `CLOCK_EVERY_MS = 2000`, `SILENT_MS = 3000`.
  - `createClockSync()` → `{ request(now) → { sent }, receive({ sent, host }, now) → boolean, measure(), follow(), offset /* ms, null before an answer */, rtt, toHost(ms) }`. Measuring: the shortest trip's offset wins. Following: an answer within `slackMs` of the best trip moves the offset toward its own by at most `stepMs`; a longer one is ignored.
  - `songTimeAt(anchor /* { at, song } */, hostMs)` → `anchor.song + (hostMs - anchor.at) / 1000`.
  - `hostSongTime({ songNow, perfNow, at })` → `songNow - (perfNow - at) / 1000`, or null when `at > perfNow + 50` or `perfNow - at > 2000`.

- [ ] **Step 1: Write the failing tests** (`sloedla-fjolspil.test.mjs`)

```js
const seat = (n, avatar, extra = {}) => ({ seat: n, name: ['Egill', 'Anna', 'Bjarni'][n], avatar, kind: n ? 'remote' : 'host', present: true, level: null, ...extra });
test('lineup: Egill\'s dinosaur is never offered, nor Kambeðla with two; three seats with three dinosaurs, two with two', () => {
  assert.deepEqual(lobbyOf({ lanes: 3, mine: 'a' }).offer, ['kambedla', 'thorsedla']);
  assert.deepEqual(lobbyOf({ lanes: 2, mine: 'c' }).offer, ['sloedla']);
  assert.ok(lobbyOf({ lanes: 3, mine: 'a' }).reserved.includes('sloedla'));
  assert.deepEqual([lobbyOf({ lanes: 3, mine: 'a' }).max, lobbyOf({ lanes: 2, mine: 'a' }).max], [3, 2]);
});
test('lineup: each guest plays her dinosaur at her level; Egill plays every one nobody holds', () => {
  const seats = [seat(0, 'egill'), seat(1, 'thorsedla', { level: 'fullordinn' })];
  const lanes = lineupOf({ lanes: 3, mine: 'a', level: 'barn', seats });
  assert.deepEqual(lanes.map(l => [l.role, l.name, l.level, l.judged]), [['b', 'Egill', 'barn', 'here'], ['a', 'Egill', 'barn', 'here'], ['c', 'Anna', 'fullordinn', 'grace']]);
  assert.deepEqual(groupsOf(lanes), [{ player: 0, roles: ['b', 'a'], level: 'barn' }, { player: 1, roles: ['c'], level: 'fullordinn' }]);
});
test('lineup: an absent guest\'s dinosaur is Egill\'s; a guest who drops out mid-song hands hers to Egill at his level', () => {
  const seats = [seat(0, 'egill'), seat(1, 'kambedla', { present: false })];
  assert.equal(lineupOf({ lanes: 3, mine: 'a', level: 'barn', seats })[0].name, 'Egill');
  const live = lineupOf({ lanes: 3, mine: 'a', level: 'barn', seats: [seat(0, 'egill'), seat(1, 'kambedla', { level: 'fullordinn' })] });
  assert.deepEqual(takeOver(live, 'b', 'barn')[0], { role: 'b', player: 0, name: 'Egill', level: 'barn', judged: 'here' });
});
test('lineup: two dinosaurs only when no guest holds Kambeðla and at most one guest; Egill moves off a dinosaur that leaves', () => {
  assert.equal(canTwoLanes([seat(0, 'egill'), seat(1, 'kambedla')]), false);
  assert.equal(canTwoLanes([seat(0, 'egill'), seat(1, 'sloedla'), seat(2, 'thorsedla')]), false);
  assert.equal(canTwoLanes([seat(0, 'egill'), seat(1, 'sloedla')]), true);
  assert.equal(mineFor({ lanes: 2, mine: 'b', seats: [seat(0, 'egill'), seat(1, 'sloedla')] }), 'c');
  assert.equal(mineFor({ lanes: 3, mine: 'c', seats: [seat(0, 'egill'), seat(1, 'thorsedla')] }), 'b');
});
test('lineup: a lane\'s rules and the end lines', () => {
  assert.deepEqual(laneRules({ level: 'fullordinn', judged: 'grace' }), { windows: LEVELS.fullordinn, fall: 1.6, grace: REMOTE_GRACE });
  assert.equal(laneRules({ level: 'barn', judged: 'outside' }).grace, Infinity);
  const lanes = lineupOf({ lanes: 3, mine: 'a', level: 'barn', seats: [seat(0, 'egill'), seat(1, 'thorsedla')] });
  assert.deepEqual(linesOf(lanes, [{ points: 300, great: 2 }, { points: 500, great: 4 }, { points: 900, great: 7 }]), [
    { player: 0, name: 'Egill', roles: ['b', 'a'], points: 800, great: 6 }, { player: 1, name: 'Anna', roles: ['c'], points: 900, great: 7 }]);
});
test('clock: the shortest round trip sets the shared clock; a stamp becomes the song\'s time within 5 ms', () => {
  const sync = createClockSync();
  sync.receive({ sent: 0, host: 5025 }, 40);     // a slow, lopsided trip says 5005
  sync.receive({ sent: 100, host: 5105 }, 110);  // a quick one says 5000
  assert.equal(sync.offset, 5000);
  const anchor = { at: 9000, song: 12 };
  assert.ok(Math.abs(songTimeAt(anchor, sync.toHost(4500)) - 12.5) < 0.005);
});
test('clock: following, an answer near the best trip moves the clock 2 ms at most; a slow one is not believed', () => {
  const sync = createClockSync();
  sync.receive({ sent: 100, host: 5105 }, 110);
  sync.follow();
  sync.receive({ sent: 200, host: 5225 }, 210); // says 5020
  assert.equal(sync.offset, 5002);
  sync.receive({ sent: 300, host: 5400 }, 350); // a 50 ms trip
  assert.equal(sync.offset, 5002);
});
test('clock: a stamp from the future or two seconds old is no tap', () => {
  assert.equal(hostSongTime({ songNow: 10, perfNow: 5000, at: 4900 }), 9.9);
  assert.equal(hostSongTime({ songNow: 10, perfNow: 5000, at: 5100 }), null);
  assert.equal(hostSongTime({ songNow: 10, perfNow: 5000, at: 2900 }), null);
});
```

- [ ] **Step 2: Run, expect FAIL** — modules missing.
- [ ] **Step 3: Implement** `lineup.js` and `clock-sync.js` as the Interfaces say (pure: no DOM, no timers).
- [ ] **Step 4: Run, expect PASS** — `npm run test:remake`.
- [ ] **Step 5: Commit** — `git add` both modules and the test; message "Song multiplayer: the lineup (seats to dinosaurs and lanes) and the shared clock".

### Task 3: Fjölspil's host learns the song game

**Files:**
- Modify: `remake/engine/fjolspil/seats.js`, `remake/engine/fjolspil/fjolspil.js`
- Test: `remake/tests/fjolspil-seats.test.mjs`, `remake/tests/fjolspil-host.test.mjs`

**Interfaces:**
- Produces (`seats.js`): a seat has `level` (`'barn' | 'fullordinn' | null`; Egill's null); `join({ guestId, name, avatar, level })` keeps a known guest's level when the hello has none; `setLevel(n, level)` (guest seats only, those two values only); `setLimit(max)` (refuses new joins past it, removes nobody).
- Produces (`fjolspil.js`):
  - option `perf = () => win?.performance?.now?.() ?? now()`;
  - `openLobby({ ai = null, offer = null, ask = null, max = null, reserved = [], note = null })`; `setLobby({ offer, ask, max, reserved, note })` changes them while open (any key given) and shows the lobby again;
  - the lobby view carries `offer`, `ask`, `note` only when set;
  - `time { sent }` from a guest is answered `time { sent, host: perf() }` (only for a finite `sent`); `onAlive(fn(seat))` hears every `time` and `act` from a seated guest;
  - `sendSong(n, body)` → `message('song', body)` to seat `n`'s phone; not a view, not kept;
  - `hello` passes `level` to `seats.join`.

- [ ] **Step 1: Write the failing tests**
  - seats: `'a guest\'s level comes with her hello and stays with her seat when she comes back'` — join with `level: 'fullordinn'`, rejoin same guestId without level → seat level still `'fullordinn'`; `'setLevel changes a guest\'s level, never Egill\'s'`; `'setLimit(3): a third guest is refused full'`.
  - host (with the file's `fakeNets` rig): `'a phone asking the time gets the big screen\'s clock and counts as alive'` — guest sends `time { sent: 12 }`, `perf` returns 777 → the guest got `{ type: 'time', body: { sent: 12, host: 777 } }` and the `onAlive` listener heard its seat; `'sendSong reaches the seat\'s phone as a song message, not a view'`; `'the song game\'s lobby offers only its dinosaurs, asks for a level and carries its note'` — `openLobby({ offer: ['kambedla', 'thorsedla'], ask: 'level', max: 3, reserved: ['sloedla', 'gramedla', 'flugedla', 'uggedla'], note: { text: 'Egill velur lag…' } })` → delivered lobby view has those three keys and `available` without `sloedla`; `hello { name: 'Anna', avatar: 'thorsedla', level: 'fullordinn' }` → `seats.bySeat(1).level === 'fullordinn'`; `setLobby({ note: null })` → next lobby view has no `note`; `'a reloaded big screen seats a known phone again with its level'` (new session on the same storage, hello with level → seat level kept).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** as the Interfaces say. `openLobby` resets the song keys each time it opens (another game's lobby has none).
- [ ] **Step 4: Run, expect PASS** — `npm run test:remake` (every `fjolspil-*` and `yatzy-junior-*` test still green).
- [ ] **Step 5: Commit** — "Fjölspil: a seat's level, a lobby's offer, question and note, the time and song messages".

### Task 4: The guest page learns the song game

**Files:**
- Modify: `remake/engine/fjolspil/guest.js`, `remake/spil.css`
- Test: `remake/tests/fjolspil-guest.test.mjs` (with `fjolspil-guest-rig.mjs`)

**Interfaces:**
- Consumes: the lobby view keys `offer`, `ask`, `note` (Task 3); seat `level`.
- Produces:
  - join screen: with `offer` only those avatars show; with `ask === 'level'` a row „Krakki eða fullorðinn?“ with two big buttons (🧒 „Krakki“, 🧑 „Fullorðinn“, `aria-pressed`), one of them needed before „Tilbúin/n“ sends; `hello { name, avatar, level }`;
  - the phone remembers `level` beside name and avatar (`mosi-fjolspil-guest`), and pre-picks it;
  - lobby screen: `note.text` (and `note.picture`, an `<img>` under `remake/`) under „Þú ert með!“; with `ask === 'level'` the two level buttons, the seat's level pressed, a tap sending `act { type: 'level', level }`;
  - a game screen's context gains `post(type, body)` (a raw message to the big screen) and `listen(type, fn)` → unsubscribe (every message whose type is not `view`/`seat` goes to its listeners);
  - with `offer` and none of its avatars free, the join screen says „Allar eðlurnar eru í notkun“ and waits (a lobby view with one free shows them again);
  - demo `?demo=saman` (the join screen of a song lobby: offer `kambedla`, `thorsedla`, ask level).

- [ ] **Step 1: Write the failing tests** — `'a song lobby shows only its dinosaurs and asks krakki or fullorðinn; the hello carries the level'` (lobby view with `offer: ['kambedla','thorsedla'], ask: 'level'` → two avatar buttons; „Tilbúin/n“ sends nothing until a level is tapped; then hello body has `level: 'fullordinn'`); `'the level is remembered for next time'` (storage holds `level`; a new page pre-presses it); `'the lobby screen shows the big screen\'s note and lets her change her level'` (seated lobby view with `note: { text: 'Egill velur lag…' }` → text shown; tap „Krakki“ → `act { type: 'level', level: 'barn' }` sent); `'a game screen can post a message and hear the big screen\'s other messages'` (a view renderer receives `post`/`listen`; a `song` message reaches its listener; `post('time', { sent: 1 })` is sent).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** in `guest.js` (strings exactly as Global Constraints) and the level row's look in `spil.css` (same family as the avatar buttons, 88 px at least).
- [ ] **Step 4: Run, expect PASS** — `npm run test:remake`.
- [ ] **Step 5: Commit** — "Fjölspil guest page: a song lobby's dinosaurs and level, its note, and raw messages for a game screen".

### Task 5: The band on the big screen (game.js)

**Files:**
- Modify: `remake/engine/sloedla/game.js`, `remake/engine/sloedla/lab.js` (the look parameter only)
- Test: suite + a headless look

**Interfaces:**
- Consumes: `laneRules`, `linesOf` (Task 2); `createJudge({ windowOf })`, `settle` (Task 1).
- Produces: `createSongGame({ …, lineup = null, onJudged = null })`:
  - `lineup`: `Lane[]` one per lane (`{ role, player, name, level, judged }`). Null: every lane uses `windows`, `fall`, grace 0, player 0, no name — today.
  - per lane: the judge's windows and grace (`laneRules`), the word's grade (`gradeOf(offset, windows of the lane)`), the star meter's fill (`1 / windows.meter` of the lane), the fall speed of its notes and beat lines (fixed at creation), and the recentring centre per `player`;
  - `onJudged({ index, lane, role, kind: 'hit' | 'miss', grade })` at every hit and every swept miss;
  - `setLineup(lineup)`: new windows, grace, names, judged (fall stays); a tag whose name changed blinks twice;
  - a name tag under each lane's button when any lane has a name (cream on dark glass, Nunito, at most 0.6 of the lane's width);
  - `result().players = linesOf(lineup, laneScores)` where a lane's points are the points each hit counted (doubled in Stjörnukraftur) and `great` its „Fullkomið!“ + „Frábært!“; `players` is `[]` with no lineup.
- Produces (lab, for a look without phones): `?gestur=<role>:<level>` makes that lane a grown-up's or a child's with the tag „Gestur“, played on the big screen.

- [ ] **Step 1: Implement** the above. With no lineup, every path is today's: the solo `createJudge` gets no `windowOf`.
- [ ] **Step 2: Run** `npm run test:remake` → green.
- [ ] **Step 3: Look headless** (rec-lock): `http://localhost:4231/remake/sloedla-lab.html?lag=boogie&sjalf=1&gestur=c:fullordinn` at 1280×800 and 390×844: Þórseðla's lane falls faster with more notes, the three tags show, the round ends with `window.__sloedlaResult.players` of two lines, no console errors; and `?lag=boogie&sjalf=1` alone ends with `players: []` and the same `total` and `points` in `window.__sloedlaResult` as a run of the same address on the commit before this task (run that one first and note them).
  The game's drawing has no unit test (a canvas); its rules are Task 1's and Task 2's tests, and this look is its check (ledger it).
- [ ] **Step 4: Commit** — "Song game: each lane its own level, grace and name; who played what at the end".

### Task 6: „Spilum saman“ — the band host and the menu's logic

**Files:**
- Create: `remake/engine/sloedla/fjolspil-song.js` (menu half), `remake/engine/sloedla/band-lobby.js`
- Modify: `remake/engine/sloedla/menu.js`, `remake/engine/sloedla/stage-motion.js`
- Test: `remake/tests/sloedla-fjolspil.test.mjs`, `remake/tests/sloedla-menu.test.mjs`, `remake/tests/sloedla-stage.test.mjs`

**Interfaces:**
- Consumes: `createFjolspil` with `setLobby`, `onAlive`, `sendSong` (Task 3); `lobbyOf`, `mineFor`, `canTwoLanes` (Task 2); `qrSvg` (fjolspil/qr.js).
- Produces (`band-lobby.js`): `createBandLobby(doc, { seats, win, audio, timers, onStart, onClose })` — the lobby maker `createFjolspil` takes (`lobby:` option) — returning `{ show({ joinUrl, code, lanMissing }), refresh(), hide(), isOpen(), waitFor(), hideWaiting(), start(), close() }`. It draws only the QR card in `#saman` (QR, the four letters, „Skannaðu til að spila með“, „Keyrðu þjóninn með --lan“ when `lanMissing`); `waitFor`/`hideWaiting` do nothing (no turns); `start()`/`close()` hide it and call `onStart`/`onClose`.
- Produces (`fjolspil-song.js`): `createBandHost({ fjolspil, perf, timers, onSeats = () => {}, onJoin = () => {} })` with
  - `open({ lanes, mine, level })` → promise of the seats at „Spila!“ (null at „Spila einn“): `fjolspil.openLobby({ ...lobbyOf({ lanes, mine }), ask: 'level', note: { text: 'Egill velur lag…' } })`;
  - `update({ lanes, mine, level, song = null })` → `setLobby` with the new offer/reserved/max and the note (with the picked song's name and card picture when there is one);
  - `start()` (the band lobby's `start`), `close()` (its `close`, then every seated phone gets the view `{ screen: 'sloedla', phase: 'bless' }`);
  - `onSeats(list)` whenever the seats change; `onJoin(seat)` once for each new guest seat;
  - an `act { type: 'level', level }` sets that seat's level;
  - the room is opened with `storageKey: 'mosi-fjolspil-sloedla'` and `lobby: createBandLobby`.
- Produces (`menu.js`): state `together` (false), `mine` (null); `together()` → `[{ hush: true }, { say: 'saman' }]` (heard only after unlock); `alone()` → `[{ hush: true }]`; `setMine(role)` → `[]`; `joined()` → `[{ say: 'kom' }]` while together; `toSongs()` → null while together and `mine` is null; `play()` adds `together` and `mine`.
- Produces (`stage-motion.js`): `nearestFriend(feet, x, y, { reach })` → the id (`'b' | 'a' | 'c'`, never `'egill'`) whose feet are nearest `x` within `reach` px and above whose feet `y` lies, or null.

- [ ] **Step 1: Write the failing tests**
  - menu: `'Spilum saman: the DJ says saman, and the songs wait for Egill\'s dinosaur'`; `'a guest joining: the DJ says kom'`; `'Spila einn: one player again, the songs open'`.
  - stage: `'a tap on the stage finds the dinosaur over whose feet it is, never Egill'` (feet `[{id:'egill',x:100,y:500},{id:'b',x:300,y:500},{id:'a',x:500,y:480},{id:'c',x:700,y:470}]`: (310, 400) → 'b'; (505, 300) → 'a'; (100, 400) → null; (1000, 400) → null with reach 120).
  - band host (fake `fjolspil` object recording calls, with `seats` from `createSeats`): `'the song lobby offers the free dinosaurs, asks a level and closes at three'` (`open({ lanes: 3, mine: 'a', level: 'barn' })` → `openLobby` got offer `['kambedla','thorsedla']`, `max: 3`, `ask: 'level'`); `'a guest\'s level act sets her seat\'s level'`; `'a new guest is told once'`; `'Spila einn tells every phone thanks for playing'`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** — `npm run test:remake`.
- [ ] **Step 5: Commit** — "Song multiplayer: the band host, the stage's lobby and the menu's together step".

### Task 7: „Spilum saman“ on the stage — button, picking a dinosaur, QR card, name tags

**Files:**
- Modify: `remake/engine/sloedla/menu-view.js`, `remake/engine/sloedla/stage.js`, `remake/engine/sloedla/stage-flat.js`, `remake/sloedla-lab.html`, `remake/sloedla.css`, `remake/engine/sloedla/lab.js`
- Test: `remake/tests/sloedla-stage.test.mjs`, headless look

**Interfaces:**
- Consumes: Task 6's host, menu and `nearestFriend`; `canTwoLanes`, `mineFor` (Task 2).
- Produces (stages): `pick(id)` on both stages — that friend cheers once (stage.js: her cheer clip and her floodlight flashing twice; stage-flat.js: her picture hops).
- Produces (`menu-view.js`): options `onTogether()`, `onAlone()`, `onMine(role)`; method `setBand({ together, mine, seats })`; in step 1 a button `[data-together]` („Spilum saman“ with a small QR mark, „Spila einn“ while together); while together without `mine` the words „Hvaða eðlu spilar þú?“ in place of the title and a tap on the stage (`nearestFriend`, reach 0.12 of the screen's width) calls `onMine`; tags `.sl-tag[data-tag=b|a|c]` placed at each friend's feet every frame (as the beams are): „Egill“, the guest's name, or „Laus“ (`.free`, faint), `.away` with „…“ while a guest is absent; „Veljum lag →“ and „2 eðlur“ disabled as the rulings say.
- Produces (`sloedla-lab.html`): `<section class="sl-saman" id="saman" hidden>` in the scene's top-right corner (QR at least 28 % of the short side, light card); the tags' container in `.sl-cast`.
- Produces (`lab.js`): the host made at load (`createFjolspil(document, { storageKey: 'mosi-fjolspil-sloedla', lobby: createBandLobby, audio: { sfx: () => chimes?.sparkle(880) } })`), wired: together → `menu.together()` + `host.open(...)`; mine → `mineFor` + `stage.pick` + `host.update`; joins → `menu.joined()` + `stage.pick(role)` + sparkle; level/lanes changes and a song card picked → `host.update` (with the song, so the phones see its name and picture); „Spila einn“ → `host.close()`. In step 2 the QR card shrinks to half its size in the same corner, and guests may still join.

- [ ] **Step 1: Write the failing test** — `'the flat stage: a picked friend hops'` (stage-flat `pick('c')` then `frame(0.1)` → Þórseðla's picture lifted; the others not).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the view, stages, page and wiring.
- [ ] **Step 4: Run** `npm run test:remake` → green.
- [ ] **Step 5: Look headless** (rec-lock) at 1280×800 and 390×844: tap „Spilum saman“, tap Slóeðla on the stage → her tag „Egill“, the QR card in the corner, „Laus“ under the others; open `spil.html?r=<code>` in a second browser context, join as Anna on Þórseðla → her tag on the big screen; no console errors. Shots to `qa/remake/sloedla/fjolspil/` for the owner.
- [ ] **Step 6: Commit** — "Song multiplayer: „Spilum saman“ on the stage — pick a dinosaur, the QR card, everyone's name under her dinosaur".

### Task 8: The guest's screen

**Files:**
- Create: `remake/engine/sloedla/friends.js` (moved from lab.js's `FRIENDS`, pictures as paths under `remake/assets/`), `remake/engine/sloedla/remote-round.js`, `remake/engine/fjolspil/guest-sloedla.js`
- Modify: `remake/engine/sloedla/game.js` (guest mode, `judged`), `remake/engine/sloedla/lab.js` (imports `FRIENDS`), `remake/spil.html`, `remake/spil.css`
- Test: `remake/tests/sloedla-fjolspil.test.mjs`, `remake/tests/fjolspil-guest.test.mjs`

**Interfaces:**
- Consumes: `createClockSync`, `songTimeAt`, `MEASURE`, `FOLLOW` (Task 2); `post`/`listen` (Task 4); `settle` (Task 1).
- Produces (`remote-round.js`): `createRemoteRound({ sync, now = () => performance.now() })` → `{ conductor, clock, receive(body) }`:
  - `receive` takes the `song` messages: `start { song: { id, name, bpm, length }, lanes, levels, names, mine }` (`lanes` roles in lane order; `levels`/`names` by role; `mine` this guest's role), `clock { at, song }`, `notes { section: { index, start, variant }, list: [{ id, t, role }] }`, `played { id, role, kind, grade }`, `end`; returns `{ kind: 'played', index, verdict: { kind, grade } }` for a played note this guest has, else null;
  - `conductor`: `{ chart, expected: 0, length, beat, bpm, hit: () => false, miss() {}, stray() {}, setTier() {}, sectionAt(time) }`, `chart` growing in time order with each note's `section`;
  - `clock`: `{ time(), timeAt(stamp), contextTimeOf: () => null, latency: () => 0 }` from the newest anchor and `sync.toHost`.
- Produces (`game.js`): `mode = 'band' | 'guest'`; guest: no end (the round plays until it is dropped), no star bar, counter or meter, no „… er með!“; lanes with `judged: 'outside'` drawn at 0.35 opacity; with one lane (a phone) the button is about a third of the screen's width across and a tap anywhere plays it. `verdict(index, { kind, grade })` → `settle`, and for a lane not `'here'` its burst (dim) or grey puff.
- Produces (`guest-sloedla.js`): `deviceOf(width, height, override = null)` → `'simi' | 'spjald'`; `renderSloedla(root, view, { send, doc, post, listen })` for the views `{ screen: 'sloedla', phase }`:
  - `'ready' { song: { name, picture } }`: „Tilbúin!“ with the picture; measures the clock (8 asks 50 ms apart); with no answer yet it says „Tengist…“ and draws no notes until the clock is there; on `start` the canvas fills the page and a guest-mode game runs — phone: only her lane (cast of one, lineup `[{ role: mine, level, judged: 'here', name: null }]`) with her name and dinosaur at the top, tablet: every lane, hers `'here'`, the others `'outside'` with their names, the Fen behind; asks the time every second; a tap on her lane → `game.tap(lane, clock.timeAt(stamp))`, `send({ type: 'tap', at: sync.toHost(stamp) })`, vibrate 15 or 30 ms; `played` → `game.verdict`; screen kept awake (`navigator.wakeLock`, released at the end).
  - `'late' { song }`: „Þú kemst inn í næsta lagi!“ with the picture.
  - `'end' { stars, line: { name, roles, points, great } }`: the band's stars (★ of five) and her line, then „Bíðum eftir næsta lagi…“.
  - `'bless'`: „Takk fyrir að spila!“.
  - `window.__sloedlaGuest = { state(), clock }` for the walk (her lane's notes and her words).
- Produces (`spil.html`): `views.sloedla = renderSloedla`.

- [ ] **Step 1: Write the failing tests** — `'remote round: notes fall in time order with the big screen\'s ids; played finds the guest\'s own'` (two `notes` messages, ids 4 and 9 for her role; `played { id: 9 }` → index 1); `'remote round: the guest\'s song time follows the anchors through the shared clock'` (offset 5000, anchor `{ at: 9000, song: 12 }`, `now` 4500 → `clock.time()` 12.5 within 0.005); `'remote round: notes that come after their time keep the chart in order and throw nothing'`; `'device: 390×844 is a phone, 1180×820 a tablet, ?taeki overrides'`; guest page (fake-dom): `'the end shows the band\'s stars and her own line'`, `'thanks for playing'`, `'late: she is in next time'`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** — `npm run test:remake`.
- [ ] **Step 5: Commit** — "Song multiplayer: the guest's screen — her lane on a phone, the whole stage on a tablet, the word at once".

### Task 9: The round over the net

**Files:**
- Modify: `remake/engine/sloedla/fjolspil-song.js` (round half), `remake/engine/sloedla/lab.js`
- Test: `remake/tests/sloedla-fjolspil.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces (`createBandHost`, round half):
  - `ready(song)` at „Spila!“, as the loading show begins: every seated guest gets the view `{ screen: 'sloedla', phase: 'ready', song: { name, picture } }` (her phone measures the clock while the song loads);
  - `beginRound({ song, lineup, clock, level, game })` as the round starts: every seated guest gets `song start` (her `mine`, everyone's `levels` and `names`) and a `clock` anchor `{ at: perf(), song: clock.time() }`, anchors every `CLOCK_EVERY_MS`; the silence watch starts;
  - `decided(notes, section)` (the player's `onDecide`) → `song notes` to every guest, `{ id: index in the chart, t, role }`;
  - `judged(result)` (the game's `onJudged`) → `song played` to every guest;
  - a guest's `act { type: 'tap', at }` → if her seat holds a lane judged `'grace'`: `game.tap(lane, hostSongTime({ songNow: clock.time(), perfNow: perf(), at }))` unless null;
  - silence: no `time`/`act` from a guest playing a lane for `SILENT_MS`, or her presence false → `takeOver(lineup, role, level)`, `game.setLineup`, the player's groups follow (`groupsOf` of the new lineup); when she is heard again she gets the view `{ phase: 'late', song }`;
  - `endRound(result)`: each guest the view `{ phase: 'end', stars: result.stars, line }` (her player's line from `result.players`); timers stop.
  - `lineup()` the current lineup (the lab's input filter).
- Produces (`lab.js`): together at „Spila!“ → `host.start()` and `host.ready(song)` as the loading show begins; the seats → `lineupOf`; the player gets `groups: () => groupsOf(host.lineup())`, `onDecide: host.decided`, `fall` = the longest lane fall; the game gets `lineup`, `onJudged: host.judged`; `host.beginRound({ …, game })` as the round starts; „Spilum aftur“ calls `host.ready` too; pointer and keys play only lanes judged `'here'`; `finish` → `host.endRound(result)`; „Annað lag“ opens the lobby again (`host.open`), „Spilum aftur“ goes straight to the round with the same seats; the record is Egill's (`options.level`) as today.

- [ ] **Step 1: Write the failing tests** (fake fjolspil, fake game recording `tap`/`setLineup`, fake clock `time()`, fake `perf`, fake timers):
  - `'a guest\'s tap is judged on her own lane at its stamp'` (lineup Anna on c; `perf` 10000, `clock.time()` 20, act `{ type: 'tap', at: 9950 }` → `game.tap(2, 19.95)`);
  - `'a tap from the future or two seconds old is not judged'`;
  - `'three silent seconds give her dinosaur to Egill at his level; heard again she learns she is in next time'`;
  - `'a decided section and every verdict reach every phone'`;
  - `'a tap from a guest whose dinosaur Egill took is not heard'`;
  - `'the end gives each guest the band\'s stars and her own line'`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the round half and the lab wiring.
- [ ] **Step 4: Run, expect PASS** — `npm run test:remake`.
- [ ] **Step 5: Commit** — "Song multiplayer: the round over the net — stamped taps judged with grace, notes and verdicts out, Egill takes a silent dinosaur".

### Task 10: DJ lines, the end's lines, and the walk

**Files:**
- Modify: `remake/engine/sloedla/dj.js` (`saman`, `kom`), `remake/assets/audio/sloedla/dj/` (new takes, `dj.json`), `remake/engine/sloedla/menu-view.js` (`showEnd` lines), `remake/sloedla-lab.html`, `remake/sloedla.css`
- Create: `remake/tools/sloedla-fjolspil-walk.mjs`
- Test: suite (the DJ test that every line has its takes on disk), the walk

**Interfaces:**
- Consumes: `result.players` (Task 5), the host and guest pieces.
- Produces: `DJ_LINES.saman`, `DJ_LINES.kom` (copy in Global Constraints); `showEnd(result, rose)` shows, when `result.players` has two or more, one line each under the stars before the buttons rise: the dinosaurs' pictures, the name, the points (`pointsText`), „Frábært! ×N“ — rising one by one with a bell (`chimes.sparkle`), the buttons after them.
- Produces (walk): `node remake/tools/sloedla-fjolspil-walk.mjs [base]` (default `http://localhost:4231/remake/`) in headless Edge over raw CDP (as the scratchpad's `end-walk.mjs`), three isolated browser contexts (`Target.createBrowserContext`): big 1280×800, Anna on a phone 390×844 (`?taeki=simi`, Kambeðla, Fullorðinn), Bjarni on a tablet 1180×820 (Þórseðla, Krakki). Egill picks Slóeðla, „Veljum lag →“, Rokkhopp, „Spila!“. The guests tap their notes on time through pointer events at their lanes (from `__sloedlaGuest.state()`). Checks: no console errors on any page; every guest word equals the big screen's verdict for that note; the big screen's tags, the phone's single lane and the tablet's dim lanes; Bjarni's context closed mid-song → within 4 s Þórseðla's tag is „Egill“ and her lane takes the big screen's taps; the end shows three lines and Anna's phone her line; `mosi-sloedla-met` on the big screen holds `boogie/barn`. Shots and `report.json` to `qa/remake/sloedla/fjolspil/`. Takes the rec-lock.

- [ ] **Step 1: Record the lines** — `node remake/tools/sloedla-dj.mjs --only saman,kom`; listen to each take (the tool's check), keep `dj.json`.
- [ ] **Step 2: Implement** `showEnd`'s lines and their look.
- [ ] **Step 3: Run** `npm run test:remake` → green.
- [ ] **Step 4: Write and run the walk** (rec-lock) → every check passes; fix what fails (each fix with its test first where a unit can hold it).
- [ ] **Step 5: Commit** — "Song multiplayer: the DJ's saman and kom, everyone's line at the end, the walk with a phone and a tablet".
- [ ] **Step 6: The owner's hand check** (he runs it; the list goes in the message): the dev server with `--lan`; a real phone scans the QR; a real tablet joins; one song with Egill; a phone locked mid-song and opened again; „Spila einn“.
