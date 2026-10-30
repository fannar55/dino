# Söngur Slóeðlu: nýtt lagakerfi (lög úr línum) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new song system for Slóeðla's song game where every song owns everything it plays (its start, sounds, form and tap rhythm), with a player that keeps the old conductor's interface, two tools (stem charts, variety check), and three proof-of-concept songs: a recording (boogie), a composed song with its own band (chiptune) and a hybrid (funky hip-hop).

**Architecture:** A song is a list of layers (`remake/engine/sloedla/v2/songs/<id>.js`), each a recorded stem or a composed part on the song's own instrument, owned by a dinosaur or by the song. `v2/player.js` plays every layer from the first beat and answers the child: a hit plays the same note louder (a sample-aligned copy of the stem, or the part's note struck hard), a miss mutes her layers until the next hit. The lab picks the player by `song.version`; `game.js` and everything around it stay as they are.

**Tech Stack:** plain ES modules, Web Audio, Node test runner with `remake/tests/fake-audio.mjs`, ElevenLabs Music (`remake/tools/sloedla-music.mjs`), ffmpeg, headless Edge (CDP).

**Spec:** `docs/superpowers/specs/2026-10-30-sloedla-lagakerfi-design.md`

## Global Constraints

- Work only in worktree `C:\Risaeðla\dino-sloedla-lag`, branch `sloedla-lag`. Commit after each step that leaves the tests green (WIP commits are fine). Merge and push only when the owner asks. Never touch `design/` or `dist/`. Never a bare `git stash`.
- Keep each file's line endings (`.gitattributes` is `* -text`): every file touched here is LF, new files LF. Check with `file <path>` after editing.
- Ask the owner before downloading anything (name, source, size). Making music with ElevenLabs through `remake/tools/sloedla-music.mjs` is allowed; the key is read from `ELEVENLABS_API_KEY` only and is never printed, logged or written.
- The old engine stays unchanged: `conductor.js`, `song.js`, `band.js`, `voices.js`, `songs/*`. `sounds.js` gains one method (Task 3), `lab.js` the wiring (Task 4).
- Nothing shared between v2 songs: a v2 song file imports nothing except its own `./<id>.chart.js`; every sound it makes is its own instrument (`song.instruments`) or its own stem. No pulse, pad or band that songs share.
- Tests, the owner's lean rule: add only the tests each task names, in `remake/tests/sloedla-v2.test.mjs` (Tasks 1–4) and `remake/tests/sloedla-v2-tools.test.mjs` (Tasks 5–6). Run one file from `remake/`: `node --import ./tests/setup.mjs --test tests/sloedla-v2.test.mjs`. At the end of each task run the whole remake suite once, in the background (about 4 minutes): from the worktree root `npm run -s test:remake`. Never the root `npm test`.
- The dev server is the preview `sloedla` (port 4231). Links for the owner are `http://localhost:4231/...` only.
- One headless capture at a time: take the lock by `mkdir C:\Users\fannare\AppData\Roaming\Claude\side-session-notes\local_5af6e842-d0c9-4f2a-92fb-56f234adc53d\sloedla-keppni\rec-lock` and remove it after. No heavy runs while the owner is testing.
- Save as you go: after each step, one line in the ledger `C:\Users\fannare\AppData\Roaming\Claude\side-session-notes\local_5af6e842-d0c9-4f2a-92fb-56f234adc53d\sdd-ledgers\2026-10-30-sloedla-lagakerfi-progress.md` (what, commit hash).
- Talk to the owner in Icelandic. Show him each song when it plays (link and a short capture) and go on; his ear decides.

## Decisions made here (not in the spec)

- **Where the child's notes live.** A composed part's notes come from its `!` marks when the section is played. A stem's notes are data in `v2/songs/<id>.chart.js` (written by the stem-chart tool, imported by the song), so a song with no owned stems needs no chart file.
- **What a charted note does.** A charted part note sounds only when tapped, as now. A charted stem note is always in the stem; a hit adds the accent copy over it.
- **One gate per dinosaur,** shared by all the layers she owns.
- **Grown-ups' gap:** ½ beat across all lanes, as the old engine has it. That keeps the spec's ½ beat per lane and was tested in the game.
- **No note before 2.5 s** of song time (it must have time to fall).
- **`lift` is refused in a song with a stem** (a recording cannot change key). `key.cents` tunes composed parts to a recording (theme-tempo's `tuningCents`).
- **Big and calm on the whole song:** big = ×1.12 and a +3 dB high shelf at 4 kHz; calm = a 1400 Hz low-pass and ×0.85. A stem has no versions; a part has its own lines for them.
- **A tap at no note** on a stem owner plays 0.12 s of her stem at −12 dB at the current place; on a part owner, a soft note of her instrument on the key's root.
- **Rokkhopp has no star layers** (recording only). The run still shows in claps, crowd and DJ. Pixlaferð and Fönkhopp have composed star layers.
- **Names** (the owner may rename): `boogie` Rokkhopp, `pixel` Pixlaferð, `fonk` Fönkhopp.

## Review Focus

1. A round started again (Spila aftur, or another song mid-song): the old player's stems, accents and timer all stop, never two songs at once. Test in Task 3.
2. The tablet sleeps or the tab hides mid-song (the context suspended, or the timer throttled while the audio runs on): stems stay on the audio clock; composed notes more than 0.05 s late are dropped, not played in a heap. Test in Task 3.
3. A late tap (barn allows 0.35 s) on a short stem note: the accent never runs past the note's end into the next one; after the end there is no accent, only her line opening. Test in Task 3.
4. A stem that fails to load (404, a decode error on an old iPad): that layer is left out with a console warning and the round plays. Test in Task 3.
5. Grown-up level and two lanes on every v2 song give a playable chart: nothing falls in a missing lane, and `b`'s layers play ungated. Test in Task 4.

---

### Task 1: The song format and composed parts

**Files:**
- Create: `remake/engine/sloedla/v2/format.js`, `remake/engine/sloedla/v2/parts.js`
- Create: `remake/tests/sloedla-v2-fixture.mjs`, `remake/tests/sloedla-v2.test.mjs`

**Interfaces:**
- Consumes: `pitchOf`, `rootHz` from `engine/sloedla/song.js` (read only).
- Produces:
  - `format.js`: `ROLES = ['a','b','c']`; `FIRST_NOTE = 2.5`; `timelineOf(song) → { beat, bar, length, sections: [{ index, name, bars, start, end, startBeat, fixed, lift }] }` (seconds from the first beat; `beat = 60 / tempo.bpm`); `validateSong(song) → string[]` (empty when good).
  - `parts.js`: `pitchOfKey(key, transpose = 0) → (step, octave = 0) => Hz` (`key.root` in octave 3 as `rootHz`, `key.scale` as `pitchOf`, times `2 ** ((key.cents ?? 0) / 1200)`); `partNotes(song, layer, index, variant = 'normal', transpose = 0) → [{ t, beat, dur, freq, step, mark, vel }]` (`t`, `dur` in s; `beat` from the song's first beat).
  - fixture: `makeSong(change = {}) → song`, shallow-merged with `change`.

The song shape is the spec's section 3. A section is `{ name, bars, fixed?, lift? }`. A layer is `{ id, owner: 'a'|'b'|'c'|null, gain?, tier?: 1|2|3, when?: 'big'|'calm', stem?: '<file>' , part?: { instrument, unit?: 8|16, octave?, vel?, sections: { '<name>' | '<name>/big' | '<name>/calm': line } } }`. A chart entry is `{ beat, owner, layer, dur? (beats, 0.5), pitch? (scale step or null), pinned? }`.

`partNotes` reads the line `sections['<name>/<variant>'] ?? sections[name]` with song.js's part notation (scale steps, `_` hold, `.` rest, `!` the child's note, `|` ignored, 8ths unless `unit: 16`), repeated to fill the section; a section with no line, or a layer whose `when` is not this variant, gives `[]`.

`validateSong` problems, each a line that contains the word in brackets: version not 2, bad id or name; bpm outside 60–200 or offset not ≥ 0 (`tempo`); unknown root or scale (`key`); no sections, a section's bars not a whole number ≥ 1, length outside 60–240 s (`length`); layer ids not unique (`id`); a layer with both or neither of stem and part (`stem or a part`); owner not a, b, c or null (`owner`); `tier` on an owned layer or outside 1–3 (`tier`); `when` on a stem (`when`); a part instrument not in `song.instruments` (`instrument`); a part line for a section the song does not have (`section`); a dinosaur with no layer (`owns nothing`); `lift` in a song with a stem (`lift`); a chart entry naming a missing layer or one its owner does not own (`owned`), before 2.5 s (`2.5`), or past the end (`length`); owned stems but no `chart.barn` or `chart.fullordinn` (`chart`).

- [ ] **Step 1: Write the fixture.** `makeSong()`: 120 bpm, offset 0.03, C major; sections intro 2 bars (fixed), vers 8, kor 8, vers 8, endir 4 (60 s); layers `trommur` (c, `drums.mp3`), `bassi` (b, `bass.mp3`, gain 1.1), `lag` (a, part on `blip`; `kor`'s line starts with a note, and `kor/big` is a line of its own), `grunnur` (null, `other.mp3`), `glimmer` (null, tier 2, part on `blip`); `instruments: { blip: tools => opts => {} }`; `chart.barn` and `chart.fullordinn` with at least 8 notes each for `b` and `c`, taking turns (a `bassi` note within 3 s after every `trommur` note), at least 2 beats from each other and from `lag`'s marks (barn), and at least 8 marks in `lag`.
- [ ] **Step 2: Write the failing test** `'v2 song: its timeline, the rules a song keeps, and composed notes'`:

```js
const song = makeSong();
assert.deepEqual(validateSong(song), []);
const { beat, sections, length } = timelineOf(song);
assert.equal(beat, 0.5); assert.equal(sections[1].start, 4); assert.equal(sections[1].startBeat, 8); assert.equal(length, 60);
const lag = song.layers.find(l => l.id === 'lag');
for (const [change, word] of [
  [{ layers: [...song.layers, { id: 'x', owner: 'd', stem: 'x.mp3' }] }, 'owner'],
  [{ layers: [...song.layers, { id: 'y', owner: 'a', part: { instrument: 'horn', sections: {} } }] }, 'instrument'],
  [{ layers: [...song.layers, { id: 'z', owner: 'a', stem: 'z.mp3', part: lag.part }] }, 'stem or a part'],
  [{ sections: song.sections.map(s => (s.name === 'kor' ? { ...s, lift: 2 } : s)) }, 'lift'],
  [{ chart: { ...song.chart, barn: [{ beat: 2, owner: 'c', layer: 'trommur' }, ...song.chart.barn] } }, '2.5'],
  [{ chart: { ...song.chart, barn: [...song.chart.barn, { beat: 100, owner: 'b', layer: 'trommur' }] } }, 'owned'],
]) assert.ok(validateSong({ ...song, ...change }).some(p => p.includes(word)), word);
const notes = partNotes(song, lag, 2);                       // kor, normal
assert.equal(notes[0].t, 20); assert.equal(notes[0].beat, 40);
assert.ok(notes.some(n => n.mark));
assert.notDeepEqual(partNotes(song, lag, 2, 'big').map(n => n.step), notes.map(n => n.step));
const tuned = partNotes({ ...song, key: { ...song.key, cents: 30 } }, lag, 2);
assert.ok(Math.abs(tuned[0].freq / notes[0].freq - 2 ** (30 / 1200)) < 1e-9);
```

- [ ] **Step 3: Run it; it fails** (modules missing).
- [ ] **Step 4: Implement `format.js` and `parts.js`** to the interfaces above.
- [ ] **Step 5: Run it; it passes.** Then commit: `git add remake/engine/sloedla/v2 remake/tests/sloedla-v2*.mjs && git commit -m "Slóeðla's song game v2: the song format and composed parts"` (with the Co-Authored-By line).

### Task 2: The child's notes, section by section

**Files:**
- Create: `remake/engine/sloedla/v2/chart.js`
- Test: `remake/tests/sloedla-v2.test.mjs`

**Interfaces:**
- Consumes: `timelineOf`, `ROLES`, `FIRST_NOTE` (Task 1); `partNotes`, `pitchOfKey` (Task 1).
- Produces: `GAP = { barn: 2, fullordinn: 0.5 }` (beats, doubled in a calm section); `sectionChart(song, index, variant = 'normal', { level = 'barn', roles = ROLES, transpose = 0 } = {}) → [{ t, beat, role, layer, freq, dur, section, index, part }]` by time (`dur` s; `part` true for a composed note, whose `index` is its place in `partNotes(...)` of that layer; `index` null for a stem note); `expectedOf(song, { level, roles }) → number` (every section, normal); `chartProblems(notes, { level, beat, roles = ROLES, calm = false, whole = true }) → string[]`.

`sectionChart` takes the section's stem notes from `song.chart[level]` (owner in `roles`; `freq` from `pitch` by `pitchOfKey`, or the key's root in octave 3 when `pitch` is null; `dur = (entry.dur ?? 0.5) * beat`) and the part notes of layers owned by a role in `roles` (barn: the marked ones; fullordinn: all), then thins them as song.js `chartOf` does: strongest first (song.js `weightOf`, +0.25 for role `a`, +10 for a `pinned` entry), a note kept only if no kept note is closer than `GAP[level]` beats (doubled when calm), none before `FIRST_NOTE`. `chartProblems` checks that gap over the list and, when `whole` and level is barn, that every role in `roles` has at least 8 notes.

- [ ] **Step 1: Write the failing test** `'v2 charts: two beats apart for the child (four when calm), half a beat for grown-ups, every lane 8 times, two lanes leave b out'`:

```js
const song = makeSong(); const { beat, sections } = timelineOf(song);
const all = (variant, o) => sections.flatMap((_, i) => sectionChart(song, i, variant, o));
for (const variant of ['normal', 'big', 'calm'])
  assert.deepEqual(chartProblems(all(variant), { level: 'barn', beat, calm: variant === 'calm', whole: variant === 'normal' }), [], variant);
const child = all('normal');
assert.ok(child.every(n => n.t >= FIRST_NOTE));
assert.equal(expectedOf(song, { level: 'barn', roles: ROLES }), child.length);
const grown = all('normal', { level: 'fullordinn' });
assert.deepEqual(chartProblems(grown, { level: 'fullordinn', beat }), []);
assert.ok(grown.length > child.length);
assert.ok(!all('normal', { roles: ['a', 'c'] }).some(n => n.role === 'b'));
```

- [ ] **Step 2: Run it; it fails.**
- [ ] **Step 3: Implement `chart.js`.**
- [ ] **Step 4: Run it; it passes.** Commit: `"Slóeðla's song game v2: the child's notes, section by section"`.

### Task 3: The player

**Files:**
- Create: `remake/engine/sloedla/v2/player.js`
- Modify: `remake/engine/sloedla/sounds.js` (the returned object, after `note()` at about line 210)
- Test: `remake/tests/sloedla-v2.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–2; `sounds.oops(role, { freq, into })` (as now).
- Produces:
  - `sounds.play(instrument, { freq, step, at, dur, vel = 1, into, soft = false, tapped = false })`: the named instrument (the song's own, or a known one) gets these options as they are, `at` no earlier than now; an unknown name plays nothing.
  - `createPlayer({ context, song, clock, sounds, out, level = 'barn', roles = ROLES, fall = 2.3 })` with the conductor's interface: `start(lead = 0.4)`, `stop()`, `pump()`, `hit(note, offset = 0) → boolean` (she came back in), `miss(note)`, `stray(role)`, `setTier(n)`, `sectionAt(time) → { index, name, variant, start, end, hits, misses } | null`, `isOpen(role)`, `chart` (grows a section at a time), `expected`, `length`, `beat`, `bpm`, `hits` ({ a, b, c } gain nodes into `out`), `totals` ({ hits, misses }). A stem layer brings its decoded buffer as `layer.buffer` (the lab sets it); a stem layer without one is left out with a `console.warn`.

The graph: stem source → layer gain (`layer.gain ?? 1`) → (owned, owner in `roles`) her chain: low-pass → gate gain → song bus; (owner `null`, or `b` with two lanes) straight to the song bus; tier layers → tier gain (0 until `setTier`) → song bus. Song bus: low-pass (18 kHz; calm 1400 Hz) → high shelf at 4 kHz (0; big +3 dB) → gain (1; big 1.12; calm 0.85) → `out`. Composed parts are scheduled `LOOKAHEAD` ahead by a `TICK` timer through `sounds.play` into the same places (charted notes skipped); `pump` does nothing while the context is not running and drops events more than 0.05 s late. Sections are decided `fall + 0.7` s before they start, as `conductor.js` `decide` does (`BIG`, `CALM`, `DECIDE_AFTER`, `fixed`, `lift`), and their chart notes join `chart`.

The constants: `LOOKAHEAD 0.15` s, `TICK 25` ms, `BIG 0.75`, `CALM 0.45`, `DECIDE_AFTER 3`, `SNAP_EARLY 0.15` s, `OPEN_TAU 0.007`, `CLOSE_TAU 0.015`, `OUT_LEVEL 0.18`, `OUT_FILTER 600` Hz, `GHOST_LEVEL 0.38` (low-pass 2400 Hz) after `GHOST_AFTER 3` misses for one bar, `ACCENT_GAIN 1` (×the layer's gain: the copy doubles the note, about +6 dB), `ACCENT_ATTACK 0.002` s, `ACCENT_MAX 0.25` s, accent edge a high shelf at 3 kHz +6 dB, `STRAY_GAIN 0.25`, `STRAY_LENGTH 0.12` s.

- `start`: `clock.start(null, lead)`; every stem starts at `fileStart = clock.contextTimeOf(0) - tempo.offset` (or now, with the file offset that has passed); every gate open; decide section 0 (and 1 if it is due); start the timer.
- `hit`: counts; opens her chain (`OPEN_TAU`). A stem note: `when = at > now && offset >= -SNAP_EARLY ? at : now` with `at = clock.contextTimeOf(note.t)`; a new source of the same buffer starts at `when` with file offset `tempo.offset + note.t + (when - at)`, through the edge shelf and an envelope (0 → `ACCENT_GAIN × layer gain` in `ACCENT_ATTACK`, down to 0 at the note's end, at most `ACCENT_MAX`) into `hits[role]`; none if `when` is past the note's end. A part note: `sounds.play(instrument, { ..., tapped: true, into: hits[role] })` at `when`.
- `miss`: counts; for a role in `roles`, `sounds.oops` and her chain closes to `OUT_LEVEL` behind `OUT_FILTER` (`CLOSE_TAU`); the third in a row brings the ghost for a bar.
- `stray`: as in "Decisions" above, into a quiet bus past her chain.
- `stop`: clears the timer, fades the song bus to 0 in 0.05 s, stops every source it made (stems and accents) at now + 0.3.
- No bed duck: the kick of a hit comes from the note itself.

- [ ] **Step 1: Write the failing test** `'v2 player: the whole song from the first beat; a hit plays the same place of the same file louder, never past the note'`, with the fake context (`createFakeContext({ state: 'running' })`), each stem layer given `context.createBuffer(2, 44100 * 61, 44100)`, `clock = { start() {}, contextTimeOf: t => 0.4 + t }`, `sounds = { play: (name, o) => plays.push({ name, ...o }), oops() {} }`:

```js
// the song plays on as the game's timer would move it: small steps, a pump each (sections are decided as time passes)
const to = t => { while (context.currentTime < 0.4 + t - 1e-9) { context.advance(Math.min(0.1, 0.4 + t - context.currentTime)); player.pump(); } };
player.start(0.4);
const stems = context.bufferSources.slice();
assert.equal(stems.length, 3);
for (const s of stems) { assert.ok(Math.abs(s.starts[0].when - 0.37) < 1e-9); assert.equal(s.starts[0].offset, 0); }
assert.ok(ROLES.every(r => player.isOpen(r)));
to(10);
const drums = song.layers.find(l => l.id === 'trommur');
const note = player.chart.find(n => n.layer === 'trommur' && n.t > 11);
to(note.t - 0.05);
player.hit(note, -0.03);
const accent = context.bufferSources.at(-1);
assert.equal(accent.buffer, drums.buffer);
assert.ok(Math.abs(accent.starts[0].when - (0.4 + note.t)) < 1e-9);
assert.ok(Math.abs(accent.starts[0].offset - (0.03 + note.t)) < 1e-9);
assert.ok(accent.stopTime <= accent.starts[0].when + Math.min(note.dur, 0.25) + 1e-6);
const late = player.chart.find(n => n.layer === 'bassi' && n.t > note.t);
to(late.t + late.dur + 0.01);
const made = context.bufferSources.length;
player.hit(late, 0.3);
assert.equal(context.bufferSources.length, made);   // past its end: no accent
assert.ok(player.isOpen('b'));
player.stop();                                       // every test ends so: the timer would keep the test running
```

- [ ] **Step 2: Write the failing test** `'v2 player: a miss leaves a hole until the next hit, three make a ghost; the song's lines and b with two lanes never close; parts sound charted notes only when tapped; tiers; a sleeping tablet; stop'`:
  - after `miss` of an `a` note: her gate is at `0.18 ± 0.02` and her low-pass at `600 ± 30` Hz 0.2 s later; after the next `hit` it is above 0.9 within 0.05 s; three misses in a row: 0.38 for a bar, then 0.18;
  - with `roles: ['a','c']`, `miss` of a `b` note changes nothing and no chart note has role `b`;
  - after `pump()` past a section start, `plays` holds `lag`'s uncharted notes and none of its charted ones; `hit` of a charted part note adds one play with `tapped: true` into `player.hits.a`;
  - `setTier(2)`: tier 1 and 2 gains go to 1, tier 3 stays 0;
  - a stem layer with no buffer: `start` does not throw and the other stems start;
  - suspended: after `context.setState('suspended')`, `pump()` plays nothing; a stalled timer (the context runs 1 s on with no `pump()`, as in a hidden tab): the next `pump()` plays none of the events more than 0.05 s late;
  - `stop()`: every source made has `stopTime <= currentTime + 0.3`, and `pump()` after it plays nothing.
- [ ] **Step 3: Run them; they fail.**
- [ ] **Step 4: Implement `sounds.play` and `player.js`.**
- [ ] **Step 5: Run them; they pass.** Run the whole remake suite in the background (green). Commit: `"Slóeðla's song game v2: the player, a hit doubles the song's own note, a miss leaves a hole"`.

### Task 4: Pixlaferð (composed, its own band) and the lab

**Files:**
- Create: `remake/engine/sloedla/v2/songs/index.js`, `remake/engine/sloedla/v2/songs/pixel.js`
- Modify: `remake/engine/sloedla/lab.js` (imports at about line 27–32; `start()` at 140–176; the song buttons at 280–282)
- Test: `remake/tests/sloedla-v2.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `SONGS_V2 = [{ id, name, file, load }]` and `loadSongV2(id)` in `v2/songs/index.js` (as `songs/index.js`, a `file` that is not there yet is skipped by tests).

Pixlaferð: an 8-bit adventure, 140 bpm, A minor, every sound its own (square, pulse, triangle and noise from the tools `tone` and `puff`, or its own oscillators from `context`). Sections: `byrjun` 2 (fixed), `A` 8, `B` 8, `A` 8, `brot` 4, `B` 8 (`lift: 2`), `endir` 2 (fixed): 40 bars, about 69 s. It starts with its own sound: Kambeðla's arpeggio alone for the two bars, climbing. Slóeðla (`a`) the square-wave tune (a two-bar motif and its answer), Kambeðla (`b`) 16th arpeggios on a thin pulse, Þórseðla (`c`) the drums on one instrument that reads `step` (0 kick: a fast triangle drop; 1 snare: noise; 2 hat: short high noise), the song's own triangle bass (`null`), star layers: tier 1 the tune an octave up as an echo, tier 2 a sparkle arpeggio, tier 3 a noise sweep into every fourth bar. `big` and `calm` lines in `A` and `B`. Marks: at least 8 for each dinosaur, on strong beats mostly.

- [ ] **Step 1: Write the failing test** `'every v2 song: valid, nothing shared, playable at both levels and with two lanes'`: for each made entry of `SONGS_V2`: `validateSong(song)` is `[]`; its file's source has no `import` but `./<id>.chart.js`; for `level` barn and fullordinn and `roles` `['a','b','c']` and `['a','c']`, the normal whole-song chart passes `chartProblems` (barn: `whole`), and no note has a role outside `roles`.
- [ ] **Step 2: Write `index.js` and `pixel.js`.** Run the test; it passes.
- [ ] **Step 3: Wire the lab.** The song buttons list `SONGS` then `SONGS_V2`. In `start()`, a v2 id loads through `loadSongV2`; its stems are fetched from `asset('audio/sloedla/v2/<id>/<stem>')` and decoded one at a time into `layer.buffer` (a failure leaves it unset, with a `console.warn`); `createSongSounds({ context, output: music, room, instruments: song.instruments })`; `createPlayer({ context, song, clock, sounds, out: music, level, roles, fall })` in place of the band and the conductor; the chimes' root is `rootHz(song.key.root) * 2`. Old songs go the old way unchanged.
- [ ] **Step 4: Check in the browser.** Start the preview `sloedla`, open `http://localhost:4231/remake/sloedla-lab.html?lag=pixel&sjalf=1&debug=1`: no console errors, the music is full from the first second (not bare), the debug line shows the sections turning big and about 60 fps; then `?lag=pixel&stig=fullordinn&brautir=2&sjalf=1`; then an old song (`?lag=hus`) still plays. Screenshot at 1280×800.
- [ ] **Step 5: Commit** (`"Slóeðla's song game v2: Pixlaferð, the first song with its own band, in the lab"`), run the whole remake suite in the background, and show the owner: the link `http://localhost:4231/remake/sloedla-lab.html?lag=pixel` and the screenshot. Go on to Task 5 without waiting.

### Task 5: The variety check

**Files:**
- Create: `remake/tools/sloedla-variety.mjs`, `remake/tests/sloedla-v2-tools.test.mjs`

**Interfaces:**
- Consumes: `SONGS` and song.js `timeline`, `compileSection`, `chartOf` (old songs); `SONGS_V2`, `timelineOf`, `sectionChart` (v2).
- Produces: `tapsOf(song) → string[]` (one string a bar: the barn notes of the normal version as `role + eighth` (0–7 in the bar), sorted, joined by `,`); `formOf(song) → string` (bars and a letter per section name in first-seen order, e.g. `'2A 8B 8C 8B 4D 8C 2E'`); `tapLikeness(a, b) → 0..1` (bars in order, over the shorter, with the very same string); `varietyProblems(newSongs, otherSongs) → string[]` (each new song against every other: likeness ≥ 0.6, or the same form).

The command `node remake/tools/sloedla-variety.mjs` prints each v2 song's form and its highest tap likeness, and exits 1 on any problem. `--starts [--seconds 8] [--lock <dir>]` records, in headless Edge against the running preview, the first seconds of every song with nobody playing (`sloedla-lab.html?hljod=0&dj=0&ahorfendur=0&sjalf=ekkert&lag=<id>`, the glue's output, MediaRecorder), and compares the 24-band spectrum shape (50 Hz–10 kHz, log bands minus their mean, cosine) of every v2 song with every other; it prints each v2 song's highest, and exits 1 above 0.85 (the goal is under 0.80). Port the recording and the comparison from `side-session-notes/.../sloedla-lag/starts.mjs` and `starts-compare.mjs`.

- [ ] **Step 1: Write the failing test** `'variety: taps, form and likeness; every v2 song is its own'`: `formOf` of the fixture is `'2A 8B 8C 8B 4D'`; `tapLikeness(['a0','b4'], ['a0','c4']) === 0.5`; `varietyProblems` of the made `SONGS_V2` against all other made songs (old and v2) is `[]`.
- [ ] **Step 2: Run it; it fails. Implement. Run it; it passes.**
- [ ] **Step 3: Run `node remake/tools/sloedla-variety.mjs --starts --lock <the rec-lock>`** and write Pixlaferð's highest start likeness in the ledger. Commit: `"Slóeðla's song game v2: a check that every song is its own"`.

### Task 6: The music tool's own forms, and the stem-chart tool

**Files:**
- Modify: `remake/tools/sloedla-music.mjs` (`STRUCTURE` at line 52, `sectionsOf` at 197, `planOf` at 209, `fileOf`, `stems()` at 483)
- Create: `remake/tools/sloedla-stem-chart.mjs`
- Test: `remake/tests/sloedla-v2-tools.test.mjs`

**Interfaces:**
- Produces (music tool): a preset may have `form: [[name, kind, bars, styles?]]` (in place of `STRUCTURE`), `kinds` (merged over `KINDS`), `negative` (in place of `NEGATIVE`) and `folder` (its files are `remake/assets/audio/sloedla/<folder>/song.mp3`, `song.json`, and stems `<folder>/<stem>.mp3`). `sectionsOf(presetOrName)` and `planOf(presetOrName, version)` take a preset object too. Presets without these fields give the same plans and files as before.
- Produces (stem chart): `onsetStrength(samples, rate = 22050) → { hop, values }` (spectral flux: Hann 1024, hop 256, half-wave rectified rise of log magnitude, summed); `gridOnsets(strength, { bpm, offset, slotsPerBeat, length }) → [{ beat, strength }]` (the peak within ±35 ms of each slot, kept when at least the larger of 0.15 × the stem's 95th percentile and median + 2 × MAD); `pickChart({ onsets, layers, level, bpm, length, fixed = [] }) → [{ beat, owner, layer }]` (`onsets` and `layers` by owner).

`pickChart`, barn: walk the beats from the first at or after 2.5 s. A beat is free when no chosen or fixed note is closer than 2 beats. At a free beat the candidates are the owners with an onset on it; choose the one with the fewest notes so far (ties: the stronger onset). At a free off-beat (2 or 4 of the bar) take a note only if the next beat has no candidate. Fullorðinn: the same on 8ths with ½ beat. `fixed` are the composed parts' marks (normal version) and pinned entries.

The command `node remake/tools/sloedla-stem-chart.mjs <id> [--write]` reads the song (`v2/songs/<id>.js`), decodes each owned stem with ffmpeg (mono, 22050 Hz), picks both levels, prints the count per owner and `chartProblems` of the whole song, and with `--write` writes `v2/songs/<id>.chart.js` (`export default { barn: [...], fullordinn: [...] };`, one entry a line, a header naming the tool), keeping every `pinned` entry as it is.

- [ ] **Step 1: Write the failing test** `'music tool: a preset's own form and words; old presets as before'`: `sectionsOf('rokk')` has 8 sections and 60 bars; `planOf('rokk').chunks[0].negative_styles` includes `'prominent lead melody'`; for `{ ...PRESETS.rokk, form: [['Intro', 'intro', 2, ['drums alone']], ['A', 'verse', 8]], negative: ['x'] }` the sections' bars are `[2, 8]`, chunk 0's positive styles include `'drums alone'` and its negative styles are `['x']`.
- [ ] **Step 2: Write the failing test** `'stem chart: onsets on the beat from a click track; the child's notes two beats apart, shared fairly, never on top of a fixed note'`: a 60 s click every 0.5 s at 22050 Hz gives `gridOnsets` at 120 bpm on every beat from 1 to 118 (none between beats at `slotsPerBeat: 2`); `pickChart` with three owners clicking on every beat and `fixed: [{ beat: 41, owner: 'a' }]`: no two notes closer than 2 beats, none before 2.5 s, none closer than 2 beats to beat 41, the owners' counts within 1 of each other.
- [ ] **Step 3: Run them; they fail. Implement both. Run them; they pass.** Commit: `"Slóeðla's song game v2: the music tool's own forms, and charts from stems"`.

### Task 7: Rokkhopp (a recording)

**Files:**
- Modify: `remake/tools/sloedla-music.mjs` (a preset `boogie`)
- Create: `remake/assets/audio/sloedla/v2/boogie/*` (song.mp3, song.json, stems), `remake/engine/sloedla/v2/songs/boogie.js`, `boogie.chart.js`
- Modify: `remake/engine/sloedla/v2/songs/index.js`

The preset: `folder: 'v2/boogie'`, 150 bpm, C major, the 12-bar blues (`I I I I IV IV I I V IV I V`, a chord a bar). Form: Intro 4 (`solo boogie-woogie piano, rolling left hand; the bass and drums come in on the last bar`), Verse 1 12, Verse 2 12, Bridge 8 (`stop-time breaks: the band hits on beat one, the piano answers`), Verse 3 12 (final), Outro 4: 52 bars, about 83 s. Core: a happy 1950s rock-and-roll boogie for kids, a trio of boogie-woogie piano, a walking upright double bass, and a swinging drum kit with a snare backbeat; no guitar, no saxophone, no synths. `kinds` for verse and final without "leaves open space for a lead melody" (the piano is the lead, Slóeðla's); `negative` is `NEGATIVE` without `prominent lead melody` and `lead solo`, plus `electric guitar`, `saxophone`, `synthesizer`.

- [ ] **Step 1:** `--plan` (read it), `--credits`, then make it: `node remake/tools/sloedla-music.mjs boogie`.
- [ ] **Step 2:** `--vocals` (no words), `--measure`: keep the track if bpm is within 1 of 150, `|driftMs|` ≤ 40, the key C major, and every section's grid offset within ±60 ms. If not, make `--version 2` once; if that fails too, stop and ask the owner.
- [ ] **Step 3:** `--stems`. Each stem's mean level (ffmpeg `volumedetect`) is above −40 dB; drums → `c`, bass → `b`, piano → `a`, anything else → `null` (one layer each).
- [ ] **Step 4:** Write `boogie.js` (`tempo.offset` = the measured `beatOffset` modulo a beat, the sections as the form) and an empty `boogie.chart.js` (`{ barn: [], fullordinn: [] }`), then `node remake/tools/sloedla-stem-chart.mjs boogie --write`; every dinosaur at least 8 at barn. Add it to `SONGS_V2`. The Task 4 and 5 tests pass.
- [ ] **Step 5:** In the browser: `?lag=boogie&sjalf=1&debug=1`, no errors, the piano intro first; a hit is heard over the note. Commit (the mp3s too), run the suite in the background, show the owner the link and a screenshot.

### Task 8: Fönkhopp (a hybrid)

**Files:**
- Modify: `remake/tools/sloedla-music.mjs` (a preset `fonk`)
- Create: `remake/assets/audio/sloedla/v2/fonk/*`, `remake/engine/sloedla/v2/songs/fonk.js`, `fonk.chart.js`
- Modify: `remake/engine/sloedla/v2/songs/index.js`

The preset: `folder: 'v2/fonk'`, 95 bpm, E minor (`i VI III VII`: Em C G D, a chord a bar). Form: Intro 2 (`the drums alone: a funky breakbeat`), Verse 1 8, Hook 1 4, Verse 2 8, Hook 2 4, Bridge 4 (`drums and bass break down, then build`), Hook 3 4 (final), Outro 2: 36 bars, about 91 s. Core: a funky hip-hop beat for kids, crisp boom-bap drums, a deep funky bass guitar, only drums and bass; `negative` adds `piano`, `guitar`, `synth lead`, `strings`, `melody`.

- [ ] **Step 1:** make it, check vocals, measure (as Task 7 step 2, 95 bpm, E minor); stems: drums → `c`, bass → `b`, anything else → `null`.
- [ ] **Step 2:** Write `fonk.js`: `tempo.offset` measured, `key: { root: 'E', scale: 'minor', cents: <tuningCents> }`; Slóeðla's tune (`a`) composed on an instrument of the song's own (a breathy whistle-like lead from `tone` and `puff`), a catchy four-bar hook in the hooks and a looser line in the verses, `big` lines in the hooks; star layers of its own: tier 1 a call-and-response answer an octave down, tier 2 a short bright stab on beat 4. Marks: at least 8, mostly where the drums leave room.
- [ ] **Step 3:** Empty chart file, `sloedla-stem-chart.mjs fonk --write` (the tune's marks are fixed, so the stems' notes fall around them). Add it to `SONGS_V2`; the tests pass.
- [ ] **Step 4:** In the browser as Task 7 step 5; listen that the tune sits on the beat (the owner's ear decides; note what you measured). Commit, suite in the background, show the owner.

### Task 9: Measurements, videos and the report

**Files:** none in git (results in `qa/remake/sloedla/v2/` and the ledger).

- [ ] **Step 1: Starts.** `node remake/tools/sloedla-variety.mjs --starts --lock <rec-lock>`: every v2 song's highest start likeness is under 0.85, the goal under 0.80 (it was 0.98).
- [ ] **Step 2: The hit's kick.** For each v2 song: `node <notes>/sloedla-lag/meter.mjs qa/remake/sloedla/v2/meter-<id>.json "http://127.0.0.1:4231/remake/sloedla-lab.html?lag=<id>&sjalf=1&dj=0&ahorfendur=0&hljod=0" 60`, then `meter-report.mjs`: the median "tablet louder by" is at least +3 dB for each dinosaur. If not, raise `ACCENT_GAIN` (up to 1.6) or the edge shelf (up to +9 dB), re-run Task 3's tests, measure again.
- [ ] **Step 3: No clipping, 60 fps.** `rec.mjs` at 1280×800 and 390×844 for each v2 song (`?lag=<id>&sjalf=1&upptaka=1&hljod=0`): ffmpeg `volumedetect` max under −0.5 dB; the debug fps 58 or more. Re-encode each with `-fflags +genpts -vf fps=30 -af aresample=async=1` to `qa/remake/sloedla/v2/<id>-<w>x<h>.mp4`.
- [ ] **Step 4: Report.** Send the owner the six videos (SendUserFile), the three links, and in a few Icelandic lines the numbers (starts before and after, the kick per dinosaur), and ask him to play and listen. Nothing is merged.
