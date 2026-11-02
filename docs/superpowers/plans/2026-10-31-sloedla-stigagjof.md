# Söngur Slóeðlu: stigagjöf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Points by how close each tap was, five stars from those points, full house and a perfect game, the points shown in play and at the end, records of five stars and points, new DJ lines, and Stjörnukraftur a little harder to get.

**Architecture:** The rules stay pure in `engine/sloedla/chart.js` (points per grade, base points and Stjörnukraftur bonus, stars from the base-points share, `fullHouse`, `perfectGame`); `dj.js` picks the end line from them, so the screen and the DJ always agree. `game.js` feeds each hit's grade and whether Stjörnukraftur burns into `count`, and draws the bar's five stars, the points counter, "+100" and the end screen; the five end stars' places and timings are pure in `star-motion.js`. `best.js` keeps stars and points under a new key; `menu-view.js` shows them.

**Tech Stack:** Plain ES modules, canvas 2D, three.js star view (unchanged), node:test with `remake/tests/setup.mjs`, ElevenLabs via `remake/tools/sloedla-dj.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-31-sloedla-stigagjof-design.md`

## Global Constraints

- Points: Fullkomið! **100**, Frábært! **80**, Fínt! **60**, OK! **40**, missir **0**; a hit during Stjörnukraftur adds its base points again as bonus.
- Stars 0–5 from the base points only, as a share of 100 × the song's notes: **15 / 35 / 55 / 70 / 85 %**; a perfect game is always 5★.
- Strays: free up to `STRAY_SPARE` (¼ of the notes); each one past that takes **50** from the share's points (never below 0); the shown number never goes down.
- Fullt hús = every note played. Fullkominn leikur = every note played, each at least "Frábært!", no counted stray; it outranks fullt hús.
- Simulated children (binding targets): 85 % of notes tapped at 150 ms spread → **3★**; all tapped at 150 ms → **4★**; all tapped at 100 ms → **5★**. The share thresholds may be tuned to meet them (ledger a ruling).
- Stjörnukraftur after **15** hits (barn), **30** (fullordinn).
- End screen: five stars in an arc (middle biggest and highest), **0,45 s** between launches, all five turn together; the word, then the points large and gold counting up ("7.480 stig"), then "Þú spilaðir X af Y tónum" and "Lengsta röð: N"; "Nýtt met!" when stars or points beat the song's record at that level.
- Points written with a full stop as thousands separator ("4.250", "1.234.567").
- Page words "Slóeðla syngur með þér á hátíðinni!" at **4★ or more**.
- Records under a new key (`mosi-sloedla-met`), `{ stars, points }` per song and level; the old 3-star key is ignored.
- Answer the owner in Icelandic. Commit on `sloedla-lag` only; never merge or push. Never touch `design/` or `dist/`.
- Keep each file's line endings (all these files are CRLF; `.gitattributes` is `* -text`): use the Edit tool, or scripts written with Write that keep `\r\n`. Bash heredocs mangle backslashes.
- One headless capture at a time: `mkdir C:\Users\fannare\AppData\Roaming\Claude\side-session-notes\local_5af6e842-d0c9-4f2a-92fb-56f234adc53d\sloedla-keppni\rec-lock` before, `rmdir` after.
- ElevenLabs key is in the environment; never print it.
- Tests: child-facing only (lean). Song tests: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla*.test.mjs`; suite: `npm run -s test:remake`.

## Review Focus

1. Five end stars and the words under them on a phone (390×844) and a laptop (1280×800): nothing leaves the screen or overlaps the buttons — pinned by an `endSpots` fit test (Task 6) and screenshots (Task 7).
2. Stjörnukraftur doubling must never change the stars (only the shown number) — pinned in Task 1.
3. Old 3-star records on a device must not show as records out of five — pinned in Task 5 (old key ignored).
4. Tapping every lane all the time must not reach the top stars or a perfect game — pinned in Task 1 (strays past the spare).
5. A big number on a narrow screen (a round with long Stjörnukraftur, "15.840") stays inside the screen right of / under the bar — screenshot at 390×844 in Task 7, with `?lokaskjar=` and a self-played round.

---

### Task 1: The rules — points, five stars, perfect game, meter

**Files:**
- Modify: `remake/engine/sloedla/chart.js` (constants at the top, `LEVELS`, `createScore`, `count`, `shareOf`, `starsFor`; header comment)
- Test: `remake/tests/sloedla.test.mjs` (replace the test "stars: one to three…"; add new tests)

**Interfaces:**
- Produces:
  - `POINTS = { perfect: 100, great: 80, fine: 60, ok: 40 }`, `STAR_SHARES = [0.15, 0.35, 0.55, 0.7, 0.85]`, `STRAY_COST = 50`
  - `LEVELS.barn.meter === 15`, `LEVELS.fullordinn.meter === 30`
  - `createScore(total)` → adds `points: 0` (base), `bonus: 0` (Stjörnukraftur), `belowGreat: 0` (hits graded fine or ok)
  - `count(score, result)`: a hit is `{ kind: 'hit', offset, great, grade, double }` (`grade` one of the `POINTS` keys, missing → `'ok'`; `double` true while Stjörnukraftur burns). Adds `POINTS[grade]` to `points`, the same to `bonus` when `double`, `belowGreat++` for fine/ok. Return value unchanged (tier crossed).
  - `shareOf({ points, strays, total })` → 0..1: `(points − STRAY_COST × max(0, strays − ceil(total × STRAY_SPARE))) / (100 × total)`, clamped.
  - `perfectGame(score)` → `total > 0 && hits >= total && belowGreat === 0 && strays === 0`
  - `starsFor(score)` → 5 for a perfect game, else the count of `STAR_SHARES` the share reaches
  - `pointsOf(score)` → `points + bonus` (the number shown)
  - `fullHouse` unchanged

- [ ] **Step 1: Write the failing tests**

```js
test('points: 100 right on, 80 close, 60 and 40 further off, nothing for a miss; Stjörnukraftur doubles the number, not the stars', () => {
  const score = createScore(4);
  for (const grade of ['perfect', 'great', 'fine', 'ok']) count(score, { kind: 'hit', offset: 0, grade });
  assert.equal(score.points, 280);
  assert.equal(pointsOf(score), 280);
  const star = createScore(4);
  for (const grade of ['perfect', 'great', 'fine', 'ok']) count(star, { kind: 'hit', offset: 0, grade, double: true });
  assert.equal(pointsOf(star), 560, 'every note twice in Stjörnukraftur');
  assert.equal(starsFor(star), starsFor(score), 'the doubling never changes the stars');
});

test('stars: zero to five from the points; strays past a spare few cost the stars but never the number shown', () => {
  const at = share => starsFor({ points: share * 100 * 100, strays: 0, total: 100, hits: 100, belowGreat: 1 });
  assert.deepEqual([0, 0.14, 0.15, 0.35, 0.55, 0.7, 0.85, 1].map(at), [0, 0, 1, 2, 3, 4, 5, 5]);
  assert.equal(starsFor({ points: 8000, strays: 25, total: 100, hits: 100, belowGreat: 10 }), 4, 'a quarter of the notes in strays is free');
  const spam = { points: 9000, strays: 400, total: 100, hits: 100, belowGreat: 10 };
  assert.equal(starsFor(spam), 0, 'tapping everywhere all the time is no way to the stars');
  assert.equal(pointsOf({ ...spam, bonus: 0 }), 9000, 'the number shown does not go down');
});

test('fullkominn leikur: every note at least Frábært! and no stray, always five stars; above fullt hús', () => {
  const play = (grades, strays = 0) => {
    const score = createScore(grades.length);
    for (let i = 0; i < strays; i++) count(score, { kind: 'stray' });
    for (const grade of grades) count(score, { kind: 'hit', offset: 0, grade });
    return score;
  };
  const great = play(Array(50).fill('great'));
  assert.equal(perfectGame(great), true);
  assert.equal(starsFor(great), 5, '80 % of the points, yet five stars');
  assert.equal(perfectGame(play([...Array(49).fill('perfect'), 'fine'])), false, 'one Fínt! is not perfect');
  assert.equal(fullHouse(play([...Array(49).fill('perfect'), 'fine'])), true, 'but it is a full house');
  assert.equal(perfectGame(play(Array(50).fill('perfect'), 1)), false, 'a stray takes it away');
  assert.equal(perfectGame(createScore(0)), false);
});

test('Stjörnukraftur takes a quarter more hits to reach: 15 for a child, 30 for grown-ups', () => {
  assert.equal(LEVELS.barn.meter, 15);
  assert.equal(LEVELS.fullordinn.meter, 30);
});

// the owner (2026-10-31): not too hard; the stars held by children who play as six-year-olds do (Bonacina 2019: ~180 ms)
test('simulated children: 85 % at 150 ms gets three stars, all at 150 ms four, all at 100 ms five', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    assert.equal(childStars({ seed, tapped: 0.85, spread: 0.15 }), 3, `seed ${seed}: 85 % at 150 ms`);
    assert.equal(childStars({ seed, tapped: 1, spread: 0.15 }), 4, `seed ${seed}: all at 150 ms`);
    assert.equal(childStars({ seed, tapped: 1, spread: 0.1 }), 5, `seed ${seed}: all at 100 ms`);
  }
});
```

`childStars({ seed, tapped, spread })` is a helper in the test file: 200 notes in one lane 2 s apart; `seededRandom(\`child-${seed}\`)` from `../engine/random.js`; each note is tapped with probability `tapped` at `note.t + spread × normal()` (Box–Muller); `createJudge(notes, LEVELS.barn)`; a `'hit'` counts with `grade: gradeOf(result.offset, LEVELS.barn)` (from `../engine/sloedla/text.js`); after the last tap `judge.sweep(Infinity)` and count each swept note as a miss; returns `starsFor(score)`. Update the old "stars: one to three…" test: keep only its `tierOf` and `crossed` assertions (rename it "the run raises tiers"), and add `grade: 'perfect'` to its hits.

- [ ] **Step 2: Run the song tests to verify they fail**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla.test.mjs`
Expected: FAIL — `pointsOf`/`perfectGame` not exported, `meter` 12.

- [ ] **Step 3: Implement in `remake/engine/sloedla/chart.js`** the Produces block above; rewrite the header comment's star sentence (points by grade, five stars, full house, perfect game).

- [ ] **Step 4: Run the song tests to verify they pass**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla*.test.mjs`
Expected: PASS. If a simulated-child target fails, tune `STAR_SHARES` (keep the order, the spec's three targets binding) and ledger `Task 1: Ruling: STAR_SHARES → […] — <which target> — <cost>`.

- [ ] **Step 5: Commit** `chart.js` and the test: "Points by grade, five stars from them, fullkominn leikur; Stjörnukraftur after 15".

### Task 2: The DJ — new lines and the end line

**Files:**
- Modify: `remake/engine/sloedla/dj.js` (`DJ_LINES`, `END`, `endLineOf`, header comment)
- Create (recorded): `remake/assets/audio/sloedla/dj/fullkominn-1..4.mp3`, `fimm-1..3.mp3`, `stjornukraftur-5.mp3`, `stjornukraftur-6.mp3`, entries in `dj.json`
- Test: `remake/tests/sloedla.test.mjs` (the DJ test)

**Interfaces:**
- Consumes: nothing from Task 1 (it takes plain values).
- Produces: `DJ_LINES.fullkominn` = `['Fullkominn leikur!', 'Vá, fullkominn leikur!', 'Fullkominn leikur, hver einasti tónn!', 'Fullkominn leikur, ótrúlegt!']`; `DJ_LINES.fimm` = `['Fimm stjörnur!', 'Fimm stjörnur, vá!', 'Fimm stjörnur, þú ert stjarna!']`; `DJ_LINES.stjornukraftur` gains `'Stjörnukraftur, tvöföld stig!'` and `'Tvöföld stig, allir saman!'` at its end; `endLineOf({ stars = 0, misses = 0, full = false, perfect = false })` → `'fullkominn'` › `'fullthus'` › `'naestum'` (misses 1–2 and stars ≥ 4) › by stars `['aftur', 'velgert', 'velgert', 'flott', 'frabaert', 'fimm'][stars]`. The `end` event carries `perfect`.

- [ ] **Step 1: Write the failing test** (in the DJ test):

```js
assert.equal(endLineOf({ stars: 5, misses: 0, full: true, perfect: true }), 'fullkominn');
assert.equal(endLineOf({ stars: 5, misses: 0, full: true }), 'fullthus');
assert.equal(endLineOf({ stars: 4, misses: 2 }), 'naestum');
assert.equal(endLineOf({ stars: 3, misses: 2 }), 'flott', 'almost full, but not near the top stars');
assert.deepEqual([0, 1, 2, 3, 4, 5].map(stars => endLineOf({ stars, misses: 9 })), ['aftur', 'velgert', 'velgert', 'flott', 'frabaert', 'fimm']);
assert.equal(djCueOf({ kind: 'end', stars: 5, misses: 0, full: true, perfect: true }, 70.1, {}), 'fullkominn');
```

Also replace `endLineOf({ stars: 3, misses: 2 })` → `'naestum'` with the `stars: 4` form above, and `stars: 3, misses: 5` → `'frabaert'` with `stars: 4`. The existing "every take on disk" assertion covers the new takes.

- [ ] **Step 2: Run to verify it fails**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla.test.mjs`
Expected: FAIL on `'fullkominn'`.

- [ ] **Step 3: Implement** the Produces block in `dj.js`.

- [ ] **Step 4: Record the new takes**

Run: `node remake/tools/sloedla-dj.mjs --list` (check the sent text of the new ids), then `node remake/tools/sloedla-dj.mjs --only fullkominn,fimm,stjornukraftur-5,stjornukraftur-6`
Expected: 9 new mp3s and `dj.json` entries whose `heard` matches the text (the tool transcribes); listen to any whose `heard` differs and re-make it (`--force --only <id>`) with a respelling from the memory note on Icelandic pronunciation.

- [ ] **Step 5: Run the song tests to verify they pass**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla*.test.mjs`
Expected: PASS (takes on disk included).

- [ ] **Step 6: Commit** `dj.js`, the test, the 9 mp3s and `dj.json`: "DJ: fullkominn leikur, fimm stjörnur, tvöföld stig".

### Task 3: The game counts points and ends by the new rules

**Files:**
- Modify: `remake/engine/sloedla/game.js` (`tap` hit branch ~l. 585–592, the end ~l. 733–745, `result()` ~l. 1690, `state()` ~l. 1713, the header comment), `remake/engine/sloedla/lab.js` (`lokaskjar` ~l. 23 and 82, `finish` ~l. 261)
- Test: `remake/tests/sloedla.test.mjs`

**Interfaces:**
- Consumes: Task 1's `count` hit shape, `perfectGame`, `pointsOf`, `starsFor`; Task 2's `endLineOf({ …, perfect })`.
- Produces: `game.result()` → adds `points` (shown number), `base` (base points), `perfect` (bool), `full` (bool); `game.state().score` includes `points`, `bonus`, `belowGreat`. `createSongGame({ endNow })` accepts `0..5` or `'fullkominn'`. `lab.js` `?lokaskjar=0..5|fullkominn`.

- [ ] **Step 1: Write the failing test**

```js
test('the end of a look (?lokaskjar=): any of 0 to 5 stars, or a perfect game', async () => {
  const { lookScore } = await import('../engine/sloedla/game.js');
  for (const stars of [0, 1, 2, 3, 4, 5]) assert.equal(starsFor(lookScore(stars, 80)), stars, `${stars} stars`);
  const best = lookScore('fullkominn', 80);
  assert.equal(perfectGame(best), true);
  assert.ok(pointsOf(best) > pointsOf(lookScore(5, 80)), 'a perfect game shows more points (it had Stjörnukraftur too)');
});
```

`lookScore(endNow, total)` (exported from `game.js`, pure) builds the score a look shows: for a number, hits and grades whose base share lands mid-way in that star's band (0★ → 5 %); for `'fullkominn'`, every note `great` or `perfect`, a third of them doubled.

- [ ] **Step 2: Run to verify it fails**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla.test.mjs`
Expected: FAIL — `lookScore` is not a function.

- [ ] **Step 3: Implement**
  - In `tap`'s hit branch, move the `grades[lane] = …` line before `count` and call `count(score, { ...result, grade: grades[lane].grade, double: starMode })`; keep `grades[lane].points` = the points this tap added (for Task 4's "+100").
  - At the end: `endStars = starsFor(score)` (or the look's), `endLine = endLineOf({ stars, misses, full: fullHouse(score), perfect: perfectGame(score) })`, `call({ kind: 'end', …, perfect })`; a look uses `lookScore(endNow, conductor.expected)`.
  - `result()` and `state()` per Produces. In `lab.js`: `?lokaskjar` accepts `0`–`5` and `fullkominn`; the page words at `result.stars >= 4`.

- [ ] **Step 4: Run the song tests, then the suite**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla*.test.mjs` then `npm run -s test:remake`
Expected: PASS both.

- [ ] **Step 5: Commit**: "The round counts points; the end by stars, fullt hús and fullkominn leikur".

### Task 4: In play — five stars on the bar, the points counter, "+100"

**Files:**
- Modify: `remake/engine/sloedla/game.js` (`barLitAt` l. 131 → five, `drawBar`, the counter near `counterY`, the grade word drawing), `remake/engine/sloedla/text.js` (`pointsText`)
- Test: `remake/tests/sloedla.test.mjs`

**Interfaces:**
- Consumes: Task 1's `STAR_SHARES` (five), `pointsOf`; Task 3's `grades[lane].points`.
- Produces: `pointsText(n)` in `text.js` → `'0'`, `'4.250'`, `'1.234.567'` (full stop thousands); used by Tasks 5 and 6.

- [ ] **Step 1: Write the failing test**

```js
test('points are written the Icelandic way: a full stop between thousands', () => {
  assert.deepEqual([0, 40, 4250, 15840, 1234567].map(pointsText), ['0', '40', '4.250', '15.840', '1.234.567']);
});
```

- [ ] **Step 2: Run to verify it fails** — `pointsText` not exported.

- [ ] **Step 3: Implement**
  - `pointsText` in `text.js`.
  - `barLitAt` sized from `STAR_SHARES.length` (five `Infinity`).
  - The counter: `outlined`/`drawWord` gold, right of the bar (`bar.x + bar.w + 14`, left-aligned, vertically on the bar) when there is room for "88.888" at the bar's font, else right-aligned under the bar's right end at `counterY` (opposite "N í röð"). It eases to `pointsOf(score)` (about 0.3 s), pops a little on each hit, rainbow style while `starMode`.
  - "+100": under the grade word over her dinosaur, `'+' + points`, in the grade's `GRADES` style at 0.55 of the word's size, fading with it (`GRADE_LIFE`).

- [ ] **Step 4: Run the song tests** — Expected: PASS.

- [ ] **Step 5: Look** (lock taken): a self-played round (`?sjalf=1`) at 1280×800 and 390×844, shots at ~20 s and ~60 s (`scratchpad/bar-shots.mjs`-style): five stars on the bar facing front, the counter readable and on screen, "+100"/"+80" under the words. Fix what looks wrong before committing.

- [ ] **Step 6: Commit**: "In play: five stars on the bar, the points counter, +100 under the word".

### Task 5: Records and the menu cards

**Files:**
- Modify: `remake/engine/sloedla/best.js`, `remake/engine/sloedla/menu-view.js` (l. 90–96), `remake/sloedla.css` (`.sl-stars`, a `.sl-met` line), `remake/engine/sloedla/lab.js` (`bestBefore`, `best.record`), `remake/engine/sloedla/star-motion.js` (`isNewBest`), `remake/engine/sloedla/game.js` (its one `isNewBest` call, `bestBefore` default)
- Test: `remake/tests/sloedla-menu.test.mjs`, `remake/tests/sloedla-stars.test.mjs`

**Interfaces:**
- Consumes: Task 3's `result.points`/`result.stars`, Task 4's `pointsText`.
- Produces: `createBest(storage)` → `get(songId, level)` → `{ stars, points }` (zeros by default); `record(songId, level, { stars, points })` keeps the higher of each separately and returns true if either rose; storage key `mosi-sloedla-met`. `isNewBest({ stars, points }, before = { stars: 0, points: 0 })` → true when `stars > before.stars` or `points > before.points` (and points > 0); `createSongGame({ bestBefore = { stars: 0, points: 0 } })`.

- [ ] **Step 1: Write the failing tests** (replace the two "best stars" tests):

```js
test('records: stars and points kept per song and level, each only ever higher', () => {
  const storage = memoryStorage();
  const best = createBest(storage);
  assert.deepEqual(best.get('pixel', 'barn'), { stars: 0, points: 0 });
  assert.equal(best.record('pixel', 'barn', { stars: 3, points: 6000 }), true);
  assert.equal(best.record('pixel', 'barn', { stars: 2, points: 7000 }), true, 'more points is a record');
  assert.equal(best.record('pixel', 'barn', { stars: 2, points: 5000 }), false);
  assert.deepEqual(createBest(storage).get('pixel', 'barn'), { stars: 3, points: 7000 }, 'kept on the device');
});

test('records: the old three-star records are not read as five', () => {
  const storage = memoryStorage({ 'mosi-sloedla-best': JSON.stringify({ 'pixel/barn': 3 }) });
  assert.deepEqual(createBest(storage).get('pixel', 'barn'), { stars: 0, points: 0 });
});
```

In `sloedla-stars.test.mjs`, replace the old `isNewBest` assertions with:

```js
test('a new record is more stars or more points', () => {
  assert.equal(isNewBest({ stars: 3, points: 5000 }, { stars: 3, points: 4000 }), true);
  assert.equal(isNewBest({ stars: 3, points: 4000 }, { stars: 4, points: 9000 }), false);
  assert.equal(isNewBest({ stars: 0, points: 0 }), false);
});
```

Keep the "storage that throws, or none" test, in the new shape. `memoryStorage(seed)` is the test file's existing in-memory storage (extend it to take initial entries if it does not). The card test (if one asserts `★★☆`) becomes five places and "Met: 7.480".

- [ ] **Step 2: Run to verify it fails**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla-menu.test.mjs remake/tests/sloedla-stars.test.mjs`
Expected: FAIL on `get` returning a number.

- [ ] **Step 3: Implement** `best.js` per Produces; `menu-view.js`: `'★'.repeat(n) + '☆'.repeat(5 - n)`, `aria-label` "`n` af 5 stjörnum", and a `.sl-met` line "Met: `pointsText(points)`" shown only when points > 0; `lab.js`: `bestBefore: best.get(...)`, `best.record(song, level, { stars: result.stars, points: result.points })`; `isNewBest` per Produces and `game.js` calls it with `{ stars: endStars, points: pointsOf(score) }`.

- [ ] **Step 4: Run the song tests, then the suite** — Expected: PASS both.

- [ ] **Step 5: Commit**: "Records of five stars and points; the cards show them".

### Task 6: The end screen — five stars in an arc, the points

**Files:**
- Modify: `remake/engine/sloedla/star-motion.js` (`END.gap`, `endTimes`; new `endSpots`), `remake/engine/sloedla/game.js` (`endSpot` → `endSpots`, `starStates` loop of five, `drawEnd`), `remake/engine/sloedla/sounds.js` (`star(n)` for 1–5)
- Test: `remake/tests/sloedla-stars.test.mjs`

**Interfaces:**
- Consumes: Task 3's `result`/score fields, Task 4's `pointsText`, Task 5's `isNewBest` and `bestBefore` `{ stars, points }`.
- Produces: `endSpots({ w, h, portrait, count = 5 })` → `[{ x, y, size }]`; `endTimes(stars)` with `END.gap = 0.45` and `together` when `stars === 5`.

- [ ] **Step 1: Write the failing tests**

```js
test('five end stars in an arc: the middle biggest and highest, the sides even, all on a phone and a laptop', () => {
  for (const [w, h, portrait] of [[390, 844, true], [1280, 800, false], [768, 1024, true]]) {
    const spots = endSpots({ w, h, portrait });
    assert.equal(spots.length, 5);
    assert.ok(spots.every(s => s.x - s.size >= w * 0.02 && s.x + s.size <= w * 0.98), `${w}×${h}: inside`);
    assert.ok(spots[2].size > spots[1].size && spots[1].size > spots[0].size, 'bigger to the middle');
    assert.ok(spots[2].y < spots[1].y && spots[1].y < spots[0].y, 'higher to the middle');
    assert.ok(Math.abs((spots[0].x + spots[4].x) / 2 - w / 2) < 1 && Math.abs(spots[0].y - spots[4].y) < 1e-9, 'even');
    for (let i = 0; i < 4; i++) assert.ok(spots[i + 1].x - spots[i].x >= spots[i].size + spots[i + 1].size * 0.9, 'they do not overlap');
  }
});

test('five stars land 0.45 s apart and turn together', () => {
  const times = endTimes(5);
  assert.ok(Math.abs(times.launches[4] - times.launches[0] - 4 * 0.45) < 1e-9);
  assert.ok(times.together > times.lands[4]);
  assert.equal(endTimes(4).together, null);
});
```

Update the existing star tests that assume three (`endTimes(3)`, "three together"): the facing-front test uses `endTimes(5)` and checks after `together + END.together` (the turn's end).

- [ ] **Step 2: Run to verify they fail**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla-stars.test.mjs`
Expected: FAIL — `endSpots` not exported.

- [ ] **Step 3: Implement**
  - `endSpots` in `star-motion.js` (the arc; sizes about 0.8 / 0.9 / 1.1 of the middle's, lowered outwards).
  - `game.js`: `endSpot(i)` → `endSpots(...)[i]`; `starStates` loops `STAR_SHARES.length`; `drawEnd` order: the word (`'rainbow'` for fullkominn or 5★, `'gold'` for fullthus or 4★, else `'lilac'`; fullkominn adds fireworks and glitter as five together do), `pointsText(countUp(...)) + ' stig'` big and gold counting up from `countFrom` to `countTo`, then "Þú spilaðir …" and "Lengsta röð: …" smaller; "Nýtt met!" as Task 5 left it.
  - `sounds.js` `star(n)`: ratios `[1, 1.125, 1.25, 1.5, 1.667]` for n 1–5, the chord on the fifth.

- [ ] **Step 4: Run the star and song tests** — Expected: PASS.

- [ ] **Step 5: Look** (lock taken): `?lokaskjar=0`, `3`, `5` and `fullkominn` at 1280×800 and 390×844 (screenshot after ~6 s): stars in the arc, facing front, nothing off screen, buttons below the words; also `?lokaskjar=5&3d=0` (the flat stars follow). Fix before committing.

- [ ] **Step 6: Commit**: "End screen: five stars in an arc, the points counting up".

### Task 7: Look at it all, and hand over

**Files:** none in the repo beyond fixes; scratchpad scripts; memory note `sloedla-lag-state.md`.

- [ ] **Step 1:** (lock) A full round with the perfect pretend child (`scratchpad/full-house.mjs` without its stray) → "Fullkominn leikur!", 5★, the DJ's `fullkominn`, the points; with its stray → "Fullt hús!" and no "fullkominn".
- [ ] **Step 2:** (lock) A `?sjalf=1` round at 390×844 and 1280×800: bar, counter, "+100", end screen, then the menu card with its record; a short screencast video of the end screen with five stars.
- [ ] **Step 3:** Run the suite: `npm run -s test:remake` — Expected: all pass.
- [ ] **Step 4:** Update the memory note (scoring state, commits) and send the owner the shots and the video; ask before any merge or push.
