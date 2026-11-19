# Kafli 5: Boð til Slóeðlu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project builders work in chunks and the owner reviews after each chunk (no reviewer agents); see Global Constraints.

**Goal:** Build chapter 5 of the remake: at the far pool where chapter 4 ends, the animals that came along each sing one tone, Egill leads them (first following a light, then from memory) so Slóeðla's forgotten song comes back phrase by phrase, she comes out of the reed, plays it whole, and Grameðla answers from far away.

**Architecture:** The chapter stands in chapter 4's Árdalurinn, built only round the far pool (`createArdalur(..., { at })`). The task is a pure state machine (`kafli5-choir.js`) driven by the scene and the game clock, so every rule (order, wrong taps, help, hands-off play) is tested without a browser. The song is data (`kafli5-song.js`: five tones, 14 melody notes in four phrases, tempo and key); its tones are played by made sounds first (chunk 1) and by the owner's picked recordings later (chunk 3), over a stems player (`engine/audio/stems.js`) whose layers join after each phrase (chunk 4). The same stems become "Lag Slóeðlu" in Söngur Slóeðlu (chunk 7).

**Tech Stack:** three.js (`dist/vendor/three.module.js`), the remake engine (scene scheduler, director, actors, crowds, sfx/music, beat clock), node test runner, CDP capture tools (`capture.mjs`, `chapter-video.mjs`), ElevenLabs v4 voices, ElevenLabs Music (`tools/sloedla-music.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-07-kafli-5-bod-til-sloedlu-design.md` (Icelandic; the binding authority). Script: `docs/superpowers/specs/2026-10-28-handrit-leiksins.md`. Chapter 4 (`chapters/kafli4.js`, `chapters/kafli4-route.js`, `world/ardalur/*`) is the model for everything here.

## Global Constraints

- Work on branch `kafli5-sloedla` in worktree `C:/Risaeðla/dino-kafli5-sloedla`, cut from main, dev server port 4280 (launch entry `kafli5` in `C:/Risaeðla/.claude/launch.json`, serving that worktree). Nothing is merged into main or pushed unless the owner says so.
- Builders commit WIP often and write a one-line progress note per step in `.superpowers/sdd/kafli5/progress.md`; after each chunk the owner gets a video (and stills at 1280x800 and 800x1280) and decides before the next chunk starts.
- Child-facing text is Icelandic and copied verbatim from the spec (or this plan's WORDS, Task 4). Line ids are `k5_<speaker>_<name>`, speakers `mosi`, `egill`, `sloedla`, `flugedla`.
- The child can never fail: a wrong animal sings happily and nothing says no; help comes at 5, 10 and 18 s without a correct tap, and at 18 s the right animal sings by itself and it counts.
- The melody is 14 notes in four phrases of 2, 3, 4 and 5 notes; phrases 1–2 the right group lights up one at a time, phrases 3–4 Slóeðla plays the phrase first and Egill repeats it.
- The five tones are degrees 1, 2, 3, 5, 6 of the song's major pentatonic, one per group, low to high: grazers, turtles, frogs, small lizards, small flyers.
- Length: about 6 minutes for a child who touches nothing; never over 10 minutes.
- Performance per key shot on the `tablet` preset (Iris Xe, 1280x800 and 800x1280): GPU median ≤ 6.0 ms (`__benchmark(120)`), ≤ 100 draw calls, ≤ 250k triangles (STYLE.md §11). Measure only when no other session is capturing.
- Physical sounds are real recordings (Freesound CC0 or CC BY, credited in `assets/audio/kafli5/CREDITS.md`) or ElevenLabs sound effects the owner picks by ear. Ask the owner before any download, giving the name, source and size.
- No Claude-drawn art. Models are the ones in `assets/characters` and `assets/critters`; anything new comes from the owner's Tripo.
- Voices follow the repo's `CLAUDE.md`: `voice-lines.mjs` only, `--dry` first, Ný 3 for every new take of Mosi, `fixes` on every line with its own say/context, the owner's yes/no page imported with `heard.mjs`, `pronunciation.json` edited only with node.
- Never print, paste or log `ELEVENLABS_API_KEY`. Never touch `design/` or `dist/` (except reading `dist/vendor`).
- Every file keeps its own line endings (`.gitattributes * -text`). `remake/main.js` and `remake/engine/book/book.js` are CRLF; specs and plans are CRLF. Check `git diff --stat` and the CR count before each commit.
- Run tests from the repo root with `node --import ./remake/tests/setup.mjs --test --test-reporter=tap remake/tests/<file>.test.mjs`; the whole suite with `npm run test:remake`.

## Review Focus

1. **Taps while Slóeðla shows a phrase (phrases 3–4) or while she echoes:** the animal tapped just sings; the tap neither counts toward the phrase nor breaks the order, and the phrase is waited for again once she is done. Pinned in Task 3.
2. **An upright tablet (800x1280):** the choir shot shows all five groups and her reed, and no two groups' tap circles overlap on the screen. Pinned in Task 1 (screen projection at aspect 0.625 and 1.6).
3. **The book or a hidden tab mid-phrase or mid-song:** the help timers stand still with the game clock and the stems stay on the beat after the pause. Pinned in Task 3 (choir clock) and Task 7 (stems with the harness's `pauses`).
4. **Reduced motion** (`reduced` in the harness): the notes fade between the animals and her instead of flying, the camera does not turn, and the chapter still plays to the end. Pinned in Task 4.
5. **Playing chapter 5 again after its star:** it plays as the first time, no second star, and the Leikir tile shows once. Pinned in Task 9.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `remake/chapters/kafli5-pool.js` (new) | The pool as chapter 5's place: the five choir spots (`CHOIR`), Slóeðla's four steps out of the reed (`STEPS`), where everyone stands, the shots and who each is for (`SHOWS`). Pure data and small pure helpers. |
| `remake/chapters/kafli5-song.js` (new) | The song as data: `TONES` (degree and group, low to high), `MELODY` (four phrases of group ids), `TEMPO`, `KEY`, `toneHz(i, key)`, `PHRASE_LAYERS` (which stem joins after which phrase). |
| `remake/chapters/kafli5-choir.js` (new) | The task as a state machine: phrases, follow/remember, taps, wrong taps, help, hands-off play, the free play's beat-quantized taps. No drawing, no sound. |
| `remake/chapters/kafli5-sloedla.js` (new) | Her life: hidden with the crest showing, the peek, the four steps out, blowing the horn (crest up), walking into the pool. |
| `remake/chapters/kafli5.js` (new) | The chapter: scenes 1–7, `WORDS`, the `chapter` export; drives the choir from taps and the clock and turns its events into light, sound and motion. |
| `remake/engine/audio/choir-sounds.js` (new) | The tones: each group's sound at a pitch (made in chunk 1, recordings plus an instrument layer in chunk 3), her horn true at a pitch and false. |
| `remake/engine/audio/stems.js` (new) | Stems on the game clock: decoded buffers started together, one gain per layer (fade in/out), held with the game, `beatAt`/`nextBeat` from the measured tempo. |
| `remake/world/ardalur/index.js` (modify) | `createArdalur(..., { at })`: builds at once only the sections whose land is within `SIGHT` of `at`, and shows them with no flight. |
| `remake/world/ardalur/life.js` (modify) | `life.moveTo(member, { at, heading, seconds })` and `life.hop(member, { height, seconds })` for the choir; frogs and turtles at given spots (`life.addPoolGroups(spots)`). |
| `remake/engine/looks.js` (modify) | `LOOKS.goldenAfternoon`. |
| `remake/engine/save.js` (modify) | `defaultChapter` knows chapter 5. |
| `remake/chapters/kafli4.js` (modify) | `next: 'kafli5'` (Task 9). |
| `remake/tools/audio-lines.mjs` (modify) | `kafli5` in `SETS`. |
| `remake/assets/audio/kafli5/` (new) | `lines-source.json`, recorded lines, `hljod/` (picked tones and horn), `song.json` (measured tempo and key), `CREDITS.md`. |
| `remake/tools/sloedla-music.mjs` (modify) | Preset `sloedla` (folder `v2/sloedla`): her song's backing, composed round the melody's tempo and key. |
| `remake/engine/sloedla/v2/songs/sloedla.js` (new), `songs/index.js` (modify) | "Lag Slóeðlu" in the song game (Task 10). |
| `remake/engine/book/book.js` (modify, CRLF), `remake/main.js` (modify, CRLF), `remake/sloedla.html` (new) | The Leikir tile for Söngur Slóeðlu with `k5_sloedla`, and the game opening over the book (Task 10). |
| `remake/tests/kafli5-pool.test.mjs`, `kafli5-song.test.mjs`, `kafli5-choir.test.mjs`, `choir-sounds.test.mjs`, `stems.test.mjs`, `kafli5.test.mjs` (new) | Tests per unit. |

**Departures from the spec (rulings, spec §8):**
- The spec's three new chapter files are kept, and two more are added: `kafli5-pool.js` (place data, as `kafli4-route.js` holds `FAR_POOL`) and the engine pieces `choir-sounds.js` and `stems.js`, since sound playing belongs in `engine/audio`, not in a chapter.
- The far land is not built for the roar: scene 7 turns everyone toward Grameðla's ridge point (`world/ardalur/far-land.js`) and pans the roar there. If the scene 7 shot shows the western skyline, Task 9 adds the far land and measures it.
- Scene 1 gets a map line the spec does not give (`k5_mosi_map`), and the help gets Mosi's five names (the spec gives „Froskarnir!“ as the example). The owner can change any wording on the yes/no page.
- Chunk 1 is "grey" only in its sound and her motion: the pool, the animals and Slóeðla's model already exist in their real look, so chunk 1 uses them, with made tones, no stems and placeholder poses.

---

## Chunk 1: The grey chapter

### Task 1: Worktree, the place and the light

**Files:**
- Create: `remake/chapters/kafli5-pool.js`
- Modify: `remake/world/ardalur/index.js`, `remake/engine/looks.js`, `C:/Risaeðla/.claude/launch.json` (entry `kafli5`, port 4280, the worktree)
- Test: `remake/tests/kafli5-pool.test.mjs`

**Interfaces:**
- Consumes: `FAR_POOL`, `POOL` (`chapters/kafli4-route.js`); `createArdalur`, `SIGHT` (`world/ardalur/index.js`); `LIMITS` (`engine/camera/director.js`); `blendLooks`, `LOOKS` (`engine/looks.js`).
- Produces:
  - `CHOIR`: `{ grazers, turtles, frogs, lizards, flyers }`, each `{ at: [x, z], heading, radius }` (radius of its tap circle in metres, ≥ 2.5), in a bow round the pool between Egill's bank and the far reed, every spot dry or (frogs) on lily pads in the shallows.
  - `STEPS`: four `{ at: [x, z], heading, show: 'crest' | 'head' | 'neck' | 'whole' }`, from deep in `FAR_POOL.farReed` to the shallows.
  - `SPOTS`: `{ egill, mosi, flugedla }` for scenes 2–7 (Flugeðla keeps `FAR_POOL.landing`).
  - `SHOTS`: at least `pool_open` (scene 1), `reed_close` (scene 2), `choir_wide` (scenes 3–6), `sloedla_out` (scene 6), `west_listen` (scene 7); `SHOWS`: `{ shot: [who must be in frame] }`.
  - `createArdalur(world, { ..., at: [x, z] })`: sections within `SIGHT` of `at` built at once, shown with `world.flightU` null; `stats.built` lists them.
  - `LOOKS.goldenAfternoon`: `blendLooks(LOOKS.lateMorning, LOOKS.golden, 0.7)` with sun azimuth 215 (as `earlyAfternoon`, so the pool's shots keep the sun behind) and elevation 14.

- [ ] **Step 1: Create the worktree and launch entry.** `git worktree add C:/Risaeðla/dino-kafli5-sloedla -b kafli5-sloedla main`; copy the voice cache in (`cp -n` of `.tools/elevenlabs-remake/*` from main's checkout); add the `kafli5` launch entry; start it and open `http://localhost:4280/remake/index.html`.
- [ ] **Step 2: Write the failing tests:**

```js
test('every choir spot is in the pool shot, at 16:10 and upright, and no two tap circles overlap on the screen', ...);
// project each CHOIR spot (and its radius) through choir_wide at aspect 1.6 and 0.625: inside the frame, above its bottom 15 %,
// centres at least (r1 + r2) apart in screen pixels
test('the five groups stand low to high from the left of choir_wide to its right', ...); // grazers, turtles, frogs, lizards, flyers
test('her four steps go from inside the far reed to the shallows, each nearer Egill than the last', ...);
test('every chapter 5 shot keeps the director quiet (LIMITS) and shows who SHOWS names', ...);
test('createArdalur at the pool builds only the sections within SIGHT and nothing is late', ...);
test('goldenAfternoon: the sun lower than earlyAfternoon, from the same way', () => {
  assert.ok(LOOKS.goldenAfternoon.sun.elevation < LOOKS.earlyAfternoon.sun.elevation);
  assert.equal(LOOKS.goldenAfternoon.sun.azimuth, 215);
});
```

- [ ] **Step 3:** Run them to check they fail. **Step 4:** Implement. **Step 5:** Run them to check they pass, with `ardalur.test.mjs` and `kafli4.test.mjs`.
- [ ] **Step 6:** Commit: "kafli5: the far pool as chapter 5's place, the choir's spots and the golden afternoon".

### Task 2: The song as data and the made tones

**Files:**
- Create: `remake/chapters/kafli5-song.js`, `remake/engine/audio/choir-sounds.js`
- Test: `remake/tests/kafli5-song.test.mjs`, `remake/tests/choir-sounds.test.mjs`

**Interfaces:**
- Consumes: `tests/fake-audio.mjs` (a running fake context).
- Produces:
  - `GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers']`; `TONES = { grazers: 1, turtles: 2, frogs: 3, lizards: 5, flyers: 6 }` (degrees of the major pentatonic).
  - `MELODY`: four arrays of group ids, lengths 2, 3, 4, 5. A first draft for chunk 1 (the builder writes one that sings well and ends on degree 1); the owner hears it in the chunk 1 video and it is fixed before Task 7.
  - `TEMPO = { bpm: 84, offset: 0 }` and `KEY = { root: 'F', a4: 440 }` as placeholders until Task 7 measures the song; `toneHz(group, key = KEY, octave = 0)`; `nextBeat(time, tempo = TEMPO)` → the time of the first beat at or after `time` (`engine/beat.js` `beatAt`).
  - `PHRASE_LAYERS = [['pad'], ['bass'], ['beat'], ['lead']]`: the stem layers that join after phrases 1–4 (Task 7 names the real stems).
  - `createChoirSounds({ context, output, key })` → `{ sing(group, { at?, level?, pan? }), horn(group, { at?, pan? }), falseHorn({ pan? }), stop() }`; chunk 1: `sing` is a made marimba-like note at `toneHz` with a short animal colour per group (a low bowed swell for grazers, a hollow knock for turtles, a croak-shaped blip for frogs, a chirp for lizards, a high whistle for flyers); `horn` is the made horn of `sfx.js` `sloedlaHorn` at the tone, with its wobble off; `falseHorn` is `sloedlaHorn` as chapter 4 has it.

- [ ] **Step 1: Write the failing tests:**

```js
test('the melody is 2 + 3 + 4 + 5 notes of the five groups and ends on degree 1', () => {
  assert.deepEqual(MELODY.map(p => p.length), [2, 3, 4, 5]);
  for (const g of MELODY.flat()) assert.ok(GROUPS.includes(g));
  assert.equal(TONES[MELODY[3].at(-1)], 1);
});
test('the tones rise from grazers to flyers and are the key\'s pentatonic', ...); // toneHz strictly rising; ratios 1, 9/8, 5/4, 3/2, 5/3 within 5 cents
test('every phrase but the first starts on a different group than the last ended on', ...); // a repeated tap is no phrase
test('sing and horn each start one sound at the asked time and level, and stop() silences them', ...); // fake-audio
test('the horn of a group sounds at that group\'s tone; the false horn is off the key by more than 30 cents', ...);
```

- [ ] **Step 2:** Run to check they fail. **Step 3:** Implement. **Step 4:** Run to check they pass.
- [ ] **Step 5:** Commit: "kafli5: her song as data and the choir's made tones".

### Task 3: The choir, as a state machine

**Files:**
- Create: `remake/chapters/kafli5-choir.js`
- Test: `remake/tests/kafli5-choir.test.mjs`

**Interfaces:**
- Consumes: `MELODY`, `GROUPS` (Task 2).
- Produces: `createChoir({ melody = MELODY, help = HELP })` with
  - `HELP = { glow: 5, point: 10, auto: 18 }` (seconds without a correct tap);
  - `choir.start(time)`; `choir.tap(group, time)` → `{ counted: boolean }`; `choir.update(time)`;
  - `choir.events()`: drains the events since the last call, in order, each `{ type, time, ... }`: `'show'` `{ phrase, index, group }` (phrases 3–4: she plays one note of the phrase), `'light'` `{ group }` (phrases 1–2: the next group lights up), `'sing'` `{ group, counted }`, `'echo'` `{ group }` (she answers a counted note), `'help'` `{ level: 'glow' | 'point' | 'auto', group }`, `'phrase'` `{ phrase }` (a phrase is done: she plays it whole), `'done'`;
  - `choir.state()` → `{ phrase, index, mode: 'follow' | 'remember', waiting: boolean, busyUntil }`.
  - Timing constants it owns: `NOTE = 0.6` s between shown notes, `ECHO = 0.5` s from a counted note to her echo, `WHOLE = 0.6` s a note when she plays a finished phrase.
- Rules (spec §5): phrases 1–2 `light` the next group as soon as the last is echoed; phrases 3–4 first `show` every note, then wait. A tap while she shows or echoes (`busyUntil` not passed) sings and is not counted. A wrong tap sings, is not counted, and resets the help timer to its start for the same note. The help clock is the game time given to `update`, so a paused game holds it.

- [ ] **Step 1: Write the failing tests:**

```js
test('a child who taps nothing gets every phrase on the help and is done before 4 minutes', ...); // update in 0.1 s steps
test('the help comes at 5, 10 and 18 s without a correct tap, and the auto note counts', ...);
test('a wrong tap sings, is not counted, and the same note is still wanted', ...);
test('a tap while she shows or echoes a phrase sings and is not counted, and the phrase waits for her', ...); // Review Focus 1
test('phrases 1 and 2 light each note; phrases 3 and 4 show the whole phrase before the first wanted note', ...);
test('a phrase event comes after its last echo, and done after the fourth', ...);
test('time that does not pass holds the help: no help while update is not called', ...); // Review Focus 3
test('a child who taps right at once finishes all 14 notes with no help event', ...);
```

- [ ] **Step 2:** Run to check they fail. **Step 3:** Implement. **Step 4:** Run to check they pass.
- [ ] **Step 5:** Commit: "kafli5: the choir's rules (follow, remember, wrong taps and help)".

### Task 4: kafli5.js, all seven scenes in grey, and the first two videos

**Files:**
- Create: `remake/chapters/kafli5.js`, `remake/chapters/kafli5-sloedla.js` (placeholder poses only: hidden, each `STEPS` spot reached by a cut-hidden move, idle)
- Modify: `remake/world/ardalur/life.js` (`moveTo`, `hop`, `addPoolGroups`)
- Test: `remake/tests/kafli5.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3; `mapMoment(s, c, { pieces: ['e'], line: 'k5_mosi_map', speak })` (`engine/scene/map-moment-scene.js`); `s.target`, `s.onTap`, `s.tap`, `s.star`, `s.sfx('gramedlaRoar', { level, pan })`, `s.journal.open`; `life.arrive()`, `life.arrivals`; `loadCritters` (`world/ardalur/animals.js`); `playUnattended` (`tests/chapter-harness.mjs`).
- Produces:
  - `export const chapter = { id: 'kafli5', title: 'Boð til Slóeðlu', next: null, look: 'goldenAfternoon', start: 'tjorn', locations: { tjorn }, actors: { mosi, egill, sloedla, flugedla }, cast, lines, startShot: 'pool_open', readyFirst: ['tjorn'], *script }`, with `tjorn: { build: async world => createArdalur(world, { grey: false, route: createRoute(), at: FAR_POOL.center, critters: await loadCritters(world) }), shots: SHOTS }` (`createRoute` from `kafli4-route.js`), `sloedla: { url: '../assets/characters/parasaurolophus.glb', ... }`, cast colour of Slóeðla the dark tone of her main hue (STYLE.md §3).
  - `WORDS` (verbatim; the plan's own lines marked *):

```js
const WORDS = {
  k5_mosi_again: 'Þarna aftur!',
  k5_flugedla_reed: 'Hún er í sefinu.',
  k5_mosi_map: 'Að tjörninni hennar Slóeðlu.', // *
  k5_mosi_invite: 'Halló, Slóeðla! Viltu koma á Stjörnuhátíðina í kvöld?',
  k5_sloedla_forgot: 'Ég… ég man ekki lagið mitt. Og ég þori ekki að syngja.',
  k5_mosi_animals: 'Dýrin sungu alltaf með þér. Þau muna það!',
  k5_mosi_help: 'Hjálpaðu þeim, Egill. Pikkaðu á dýrið sem lýsist upp.',
  k5_sloedla_mine: 'Þetta… þetta var lagið mitt!',
  k5_mosi_remember: 'Nú manst þú röðina, Egill!',
  k5_sloedla_thanks: 'Takk, Egill. Ég skal leiða sönginn á hátíðinni!',
  k5_mosi_star: 'Fimmta stjarnan!',
  k5_mosi_gramedla: 'Grameðla… hún heyrði lagið.',
  k5_egill_next: 'Förum við þangað næst?',
  k5_mosi_longest: 'Lengsta ferðin. Yfir ána við fossinn.',
  k5_mosi_grazers: 'Grasbítarnir!', k5_mosi_turtles: 'Skjaldbökurnar!', k5_mosi_frogs: 'Froskarnir!', // *
  k5_mosi_lizards: 'Smáeðlurnar!', k5_mosi_flyers: 'Flugdýrin!', // *
};
```

  - Scenes per spec §4, `mark(c, n)` at each (as kafli4.js), the reed a tap target (`'reed'`, 8 s to peek by itself); in scene 3 each group walks (`life.moveTo`) to its `CHOIR` spot and sings its tone once, low to high; scenes 4–5 turn choir events into: a glow ring on the group's spot (`light`, `help: glow`), a hop and its tone (`sing`), a glowing note from the group to her crest (`echo`; from her crest to the group for `show`; a fade with `world.reduced`), her horn at the tone, Mosi's name line (`help: point`), her next `STEPS` spot (`phrase`). Scene 6: the melody on the horn at `TEMPO`, taps on any group sing on the next beat (Task 2's `nextBeat`; the stems' own from Task 7), Flugeðla's wings and a splash on every second beat, the gift line, `s.star('k5_sloedla', ...)`. Scene 7: `gramedlaRoar` at level 0.3 panned to the ridge, everyone turns there, the lines, the book like chapter 4's end.
  - `c.choirLog`: every choir event with its time, for the tests.

- [ ] **Step 1: Write the failing tests:**

```js
test('nobody touching: the chapter plays to its end in 5 to 7 minutes, the star given', ...); // playUnattended seeking false
test('nobody touching: every phrase comes on the help, and Mosi names the group at each point', ...);
test('a child who taps everything at once (eager) finishes the choir in under 90 s and no help is heard', ...);
test('a child who taps the wrong group every time still ends the chapter, under 10 minutes', ...);
test('in the free play a tap on any group sings on the next beat of TEMPO', ...);
test('reduced motion: the notes fade instead of flying and the choir shot holds still, to the end', ...); // Review Focus 4
test('every line of WORDS is said once at least, and the captions name Slóeðla in her colour', ...);
test('upright (aspect 0.625): the choir shot shows all five groups and the reed the whole task', ...);
```

- [ ] **Step 2:** Run to check they fail. **Step 3:** Implement. **Step 4:** Run to check they pass, with the suite.
- [ ] **Step 5:** Two videos with `node remake/tools/chapter-video.mjs --out qa/remake/kafli5/butur1-ekkert --chapter kafli5 --size 1280x800 --max 600 --sound --stats` (untouched) and an input track that taps right, wrong and during her phrase (`--out qa/remake/kafli5/butur1-pikk`); phone copies `simi.mp4` (960x600, h264 ~480 kbps, AAC 96 kbps); upright stills of scenes 2–6.
- [ ] **Step 6:** Commit, ledger, send both videos to the owner. Ask: does the pacing and the task feel right, does the melody draft sing. **Do not start chunk 2 before his yes.**

## Chunk 2: Slóeðla

### Task 5: Her life in the reed and out of it

**Files:**
- Modify: `remake/chapters/kafli5-sloedla.js`, `remake/chapters/kafli5.js`
- Test: `remake/tests/kafli5.test.mjs`

**Interfaces:**
- Consumes: `STEPS` (Task 1); her clips idle, walk, kink, happy, eat, call; the actor's bones (`head`, `neck`) and `lookAt`.
- Produces: `hide(c)`, `peek(c)` (eyes and crest over the reed, head bones in code), `stepOut(c, n)` (walks to `STEPS[n]`, shy: head low, slow), `blow(c, { seconds })` (head up, crest raised, `call` clip blended), `wade(c)` (into the shallows, whole). Shy to brave: the head held lower and the walk slower at steps 1–2, upright and nearer at 3–4 (one `courage` 0..1 the scenes set).

- [ ] **Step 1: Write the failing tests:** `'she is out of sight but her crest in reed_close until the peek'`, `'each phrase takes her one step nearer, and never through Egill, Mosi or a group'`, `'nothing of her jumps more than 8 degrees or 0.1 m in a frame from scene 2 to scene 6'` (as kafli4's no-jump test).
- [ ] **Step 2:** Fail. **Step 3:** Implement. **Step 4:** Pass.
- [ ] **Step 5:** Stills of her beside Egill and Mosi (both sizes), a video of scenes 2–6. Commit, send, wait for his yes.

## Chunk 3: The animals' tones and her horn

### Task 6: Recorded tones with an instrument under them

**Files:**
- Create: `remake/tools/kafli5-sounds.mjs` (masters the picks into `assets/audio/kafli5/hljod/` and writes `sounds.json`), `remake/assets/audio/kafli5/CREDITS.md`
- Modify: `remake/engine/audio/choir-sounds.js`, `remake/chapters/kafli5.js`
- Test: `remake/tests/choir-sounds.test.mjs`

**Interfaces:**
- Consumes: the owner's picks from a listening page (`qa/remake/kafli5/hljod/index.html` → `hljod-val.json`): per group 3–5 animal candidates (the chapter 4 recordings in `assets/audio/kafli4/hljod`, new ElevenLabs takes, Freesound CC0/CC BY), 3 instrument candidates for the layer under them, and 4–6 horn candidates (true tone and false).
- Produces: `createChoirSounds({ context, output, key, recordings })` keeps its interface; with `recordings` each `sing(group)` plays the animal take pitched (playbackRate) to within 50 cents of its tone and the instrument sample at the exact tone, mixed by `sounds.json` levels; `horn(group)` the picked horn pitched to the tone; made sounds stay the fallback when a file fails to load.

- [ ] **Step 1:** Make the candidates and the page. Ask the owner before any Freesound download (name, source, size of each).
- [ ] **Step 2: Write the failing tests:** `'with recordings each group sings its picked take within 50 cents of its tone, and the instrument exactly on it'`, `'a recording that fails to load falls back to the made tone'`, `'every recording is in CREDITS.md with its licence'`.
- [ ] **Step 3:** Fail. **Step 4:** Implement on his picks. **Step 5:** Pass.
- [ ] **Step 6:** Video of scenes 3–6 with the sounds. Commit, send, wait for his yes.

## Chunk 4: The song

### Task 7: Her song's backing, its stems and the layers that join

**Files:**
- Create: `remake/engine/audio/stems.js`, `remake/assets/audio/kafli5/song.json`
- Modify: `remake/tools/sloedla-music.mjs` (preset `sloedla`, folder `v2/sloedla`), `remake/chapters/kafli5-song.js` (`TEMPO`, `KEY`, `PHRASE_LAYERS` from the pick), `remake/chapters/kafli5.js`
- Test: `remake/tests/stems.test.mjs`, `remake/tests/kafli5-song.test.mjs`, `remake/tests/kafli5.test.mjs`

**Interfaces:**
- Consumes: Task 2's `MELODY` (fixed now, with the owner's word on the chunk 1 draft); `tools/sloedla-music.mjs` (`--plan`, compose, `--measure`, `--stems`); `tools/theme-tempo.mjs`; `engine/audio/hold.js`.
- Produces:
  - Preset `sloedla`: calm and warm, about 84 bpm (the builder may move it within 76–92 if the candidates need it), major key that suits the horn's low register, instrumental, room for a lead, sections that loop for scene 6; 3–4 candidates on a page (`qa/remake/kafli5/lag/index.html` → `lag-val.json`); the pick measured (`--measure`) and split (`--stems`, at most 4 stems for a tablet's memory).
  - `song.json`: `{ bpm, beatOffset, key: [five Hz, root first], stems: { layer: file } }`, as `theme.json` is written.
  - `createStems({ context, output, stems, bpm, beatOffset })` → `{ load(): Promise, play(at), layer(id, level, seconds), beatAt(time), nextBeat(time), stop(seconds), hold(bool) }`, every stem started on the same audio time, levels per layer.
  - In the chapter (spec §6: her song is the chapter's only music, low and sparse at first): the stems start with scene 1, the pad alone and low (about -12 dB), `PHRASE_LAYERS[n]` fades in over 1.5 s after phrase n, all layers in scene 6; the horn melody and the free taps on `nextBeat`; `KEY` from `song.json` so tones and horn sit in the song.

- [ ] **Step 1:** `--plan`, then the candidates, the page, his pick. (ElevenLabs Music is allowed by the owner; it costs credits: say how many before composing.)
- [ ] **Step 2: Write the failing tests:**

```js
test('every stem starts on the same audio time and a layer fades to its level in the asked seconds', ...); // fake-audio
test('nextBeat lands on the measured grid from song.json', ...);
test('after a pause the stems resume on the beat they stood on', ...); // harness pauses, Review Focus 3
test('the melody\'s tones are the song\'s key: toneHz(group, KEY) matches song.json key within 5 cents', ...);
test('in the chapter each phrase brings in its layer and scene 6 has them all', ...);
```

- [ ] **Step 3:** Fail. **Step 4:** Implement. **Step 5:** Pass.
- [ ] **Step 6:** Video of scenes 4–6. Commit, send, wait for his yes.

## Chunk 5: Her voice and the lines

### Task 8: Slóeðla's voice and every line

This task may start beside chunk 1 (the spec allows it), in the same worktree, between the chunk 1 builder's commits.

**Files:**
- Create: `remake/assets/audio/kafli5/lines-source.json` (every `WORDS` line, `{ id, speaker, text }`, Mosi's with Ný 3 as `--dry` names it)
- Modify: `remake/tools/audio-lines.mjs` (`kafli5: 'remake/assets/audio/kafli5'` in `SETS`), `remake/assets/audio/voices.json` (`sloedla`)
- Test: the kafli5 lines test in `remake/tests/kafli5.test.mjs` (every `WORDS` id has its mp3 and its entry)

- [ ] **Step 1:** `node remake/tools/design-voice.mjs --name sloedla --description "<a native Icelandic woman, young, soft, shy and gentle, warmer and surer as she goes>" --preview "Ég… ég man ekki lagið mitt. Og ég þori ekki að syngja." --count 6 --out qa/remake/kafli5/rodd`; send the page link (localhost only); `--keep <id>` on his pick writes `voices.json` `sloedla`.
- [ ] **Step 2:** `node remake/tools/voice-lines.mjs --dry --set kafli5`, read every note (REJECTED, "fixed on its own line"); words without a book entry get one with a `hratt` recipe (node only).
- [ ] **Step 3:** Record: `node remake/tools/voice-lines.mjs --set kafli5`. Run the lines test.
- [ ] **Step 4:** His yes/no page (`qa/remake/voices/janei/kafli5.html`); import his `jano-kafli5.json` with `heard.mjs` and commit what it writes; 3–4 candidates for each line he rejects; `--plan` clean.
- [ ] **Step 5:** Commit.

## Chunk 6: The start, the end and the whole chapter

### Task 9: Map, star, roar, book, save order, the whole play

**Files:**
- Modify: `remake/engine/save.js`, `remake/chapters/kafli4.js` (`next: 'kafli5'`), `remake/tests/kafli4.test.mjs` (its `next` assertion), `remake/chapters/kafli5.js`
- Test: `remake/tests/kafli5.test.mjs`

**Interfaces:**
- Produces: `defaultChapter(save)` opens `kafli5` once `k4_flugedla` is there (and still with `k5_sloedla`); every earlier answer stays. Map piece e drawn in scene 1 and starred with `k5_sloedla`. The scene 7 shot checked toward the west (the departure above).

- [ ] **Step 1: Write the failing tests:**

```js
test('defaultChapter opens chapter 5 after Flugeðla and keeps every earlier answer', () => {
  const cases = [[[], 'kafli1'], [['k1_kambedla'], 'kafli2'], [['k1_kambedla', 'k2_uggedla'], 'kafli3'],
    [['k1_kambedla', 'k2_uggedla', 'k2_thorsedla'], 'kafli4'],
    [['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla'], 'kafli5'],
    [['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla', 'k5_sloedla'], 'kafli5']];
  for (const [stars, want] of cases) assert.equal(defaultChapter(fakeSave(stars)), want);
});
test('kafli4 hands over to kafli5', () => assert.equal(kafli4.chapter.next, 'kafli5'));
test('scene 1 draws map piece e, and the star stars it', ...);
test('played again with k5_sloedla already in the save: no second star, the book shows her once', ...); // Review Focus 5
test('the roar comes from the west and everyone turns toward it within 2 s', ...);
test('the chapter ends in the book on the dinosaurs with Slóeðla nodding, then the map', ...); // journal.open('dinosaurs', { nod: 'sloedla' })
```

- [ ] **Step 2:** Fail. **Step 3:** Implement. **Step 4:** Pass, with `save.test.mjs`, `kafli4.test.mjs` and the suite.
- [ ] **Step 5:** Measure: bench of every key shot at both sizes (≤ 6 ms, ≤ 100 calls, ≤ 250k), whole-chapter video (`qa/remake/kafli5/butur6`), the start button's wait.
- [ ] **Step 6:** Commit, send, wait for his yes.

## Chunk 7: Lag Slóeðlu in the song game

### Task 10: The song in Söngur Slóeðlu and its tile on the Leikir page

Before this task, merge main into the branch (the Flugeðla tile and its frame from the memory-game session may have changed how a game opens over the book; use main's way).

**Files:**
- Create: `remake/engine/sloedla/v2/songs/sloedla.js` (+ its chart), `remake/sloedla.html` (the song game without the lab's tools)
- Modify: `remake/engine/sloedla/v2/songs/index.js` (`{ id: 'sloedla', name: 'Lag Slóeðlu', ... }`), `remake/engine/book/book.js` (CRLF), `remake/main.js` (CRLF)
- Test: `remake/tests/sloedla.test.mjs` (the song's simulated children's stars, as the other songs), `remake/tests/book.test.mjs` (the tile)

**Interfaces:**
- Consumes: Task 7's stems in `assets/audio/sloedla/v2/sloedla/`; the v2 format (`engine/sloedla/v2/format.js`); main's frame for a game over the book (`engine/yatzy-junior/frame.js` or its successor).
- Produces: a v2 song whose stems are Task 7's, with her horn melody as Slóeðla's ('a') composed part on the song's own horn instrument, Kambeðla and Þórseðla on the other stems; the Leikir tile shown when `k5_sloedla` is in the save, opening `sloedla.html` over the book.

- [ ] **Step 1: Write the failing tests:** `'Lag Slóeðlu holds the five-star bands for simulated children like the other songs'`, `'the Leikir page shows Söngur Slóeðlu only with k5_sloedla, once'`.
- [ ] **Step 2:** Fail. **Step 3:** Implement. **Step 4:** Pass, with the suite.
- [ ] **Step 5:** Video of the song game playing Lag Slóeðlu from the book. Commit, send.
- [ ] **Step 6:** When he approves: final self-review of the whole branch (no reviewer agents), then ask him about merging into main and pushing.
