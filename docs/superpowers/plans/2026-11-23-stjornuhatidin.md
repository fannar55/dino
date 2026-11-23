# Stjörnuhátíðin: the finale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project builders work in chunks and the owner reviews after each chunk (no reviewer agents); see Global Constraints.

**Goal:** Build the end of story 1: on Grameðla's mountain top, where chapter 6 ends, the five other friends come up out of the sea of cloud, Egill waves the sun to sleep, Grameðla roars, the six stars fly out of the book and Egill lights them, each drawing its friend's constellation; the half moon in a party hat blows "Tút!" and the top becomes a concert stage for a four-minute show locked to a new festival song; then a seventh, unknown star lifts Egill, laughing and waving, up into the sky, where the ride back (a separate build) takes over.

**Architecture:** One chapter, `hatid`, on one place (`world/fjall/top.js` `createTop`), in four scenes. The story scenes (1, 2 and 4) are scripts on the game clock with three tap tasks on chapter 6's help ladder (`kafli6-help.js`); the stars are a pure state machine (`hatid-stars.js`). The party (scene 3) is a show with no taps: one generator, `theParty`, plays the song with `engine/audio/song.js` and every frame hands the song's beat to pure functions (`hatid-stage.js`, `hatid-band.js`, `hatid-dance.js`, the camera's cut list in `hatid-score.js`), so `?t=`, a pause and the book's tile (`chapters/veisla.js`) give the same picture at the same beat. The sky is three new engine files the ride back uses too: `engine/night-sky.js`, `engine/constellations.js` (each friend's skeleton as stars and lines, read from her live pose, so it dances as she does) and `engine/moon-face.js` (painted in code as the sun is). The sun's setting is new engine work. The song is composed, picked by ear, measured and mixed first; its beat map is a generated module (`hatid-song.js`).

**Tech Stack:** three.js (`dist/vendor/three.module.js`), the remake engine (scene scheduler, director, actors, riding, locations, sfx/music/song), chapter 5's show primitives (`engine/show/lights.js`, `rings.js`, `dusk.js`), node test runner with `tests/chapter-harness.mjs` (`playUnattended`), CDP capture tools (`capture.mjs`, `chapter-video.mjs`), ElevenLabs Music through `tools/sloedla-music.mjs`, ffmpeg, ElevenLabs v4 voices through `voice-lines.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-21-stjornuhatidin-design.md` (Icelandic; the binding authority; the owner's "Já, stenst" of 2026-11-23). The ride back, `2026-11-23-ferdin-til-baka-design.md`, is a later plan on its own branch; this plan leaves it the three sky files and the hand-over of Task 18. Chapter 6 (`chapters/kafli6.js`, plan `2026-11-21-kafli-6-gramedla.md`) is the model for the story scenes and chapter 5's show (`kafli5.js` `theSet` and `show`, `djamm.js`) for the party's technique, never for its song or its dances.

## Global Constraints

- Work on branch `hatid` in worktree `C:/Risaeðla/dino-hatid`, cut from main, dev server port 4350 (launch entry `hatid` in `C:/Risaeðla/.claude/launch.json`, serving that worktree). Give the owner only localhost links.
- Builders build chunk by chunk, commit WIP at least every 20 minutes and write a one-line progress note per step in `.superpowers/sdd/hatid/progress.md`. Every chunk ends by showing the owner what its last step names (video and stills at 1280x800 and 800x1280) and stopping for his yes. No reviewer agents.
- Ask the owner before any merge, push or download (name, source, size). Deploy only on his own word. Never touch `design/` or `dist/` (except reading `dist/vendor`). Never bare `git stash`. Never delete permanently.
- Child-facing text is Icelandic and copied verbatim from the spec (this plan's `WORDS`, Task 5). The line set is `hatid`, ids `h_<speaker>_<name>`, speakers `mosi`, `egill`, `kambedla`, `uggedla`, `thorsedla`, `flugedla`, `sloedla`. Grameðla never speaks: she roars, snorts and stomps. The moon has no voice: its "Tút!" is a party blower.
- Voices follow the repo's `CLAUDE.md`: `voice-lines.mjs` only, `--dry` first, Ný 3 for every new take of Mosi, `fixes` on every line with its own say or context, the owner's yes/no page imported with `heard.mjs`, `pronunciation.json` edited only with node. Never print, log or write `ELEVENLABS_API_KEY`.
- Physical sounds (cheering, stomps, the party blower, bursts) are real recordings from Freesound (CC0 or CC BY), layered, credited in `assets/audio/hatid/CREDITS.md`. Nothing is downloaded before the owner has allowed it by name, source and size.
- No Claude-drawn art and no new models. The constellations are generated from each model's own skeleton (stars on joints, light lines along bones); the moon is painted in code the way the sun is (`engine/sun-face.js`; the owner asked for it "eins og sólin"). The owner sees stills of both before either goes into the festival (Task 11).
- Fun before realism in the party (the owner's rule): the stage, the lights and the effects need not be physically plausible.
- The party is a show like a video: no tap does anything in it, and everything that moves in it is a pure function of the song's clock. Nothing of chapter 5's song or dances is used; its technique may be. No light flashes more than twice a second anywhere.
- The child can never fail and nothing says no. A child who touches nothing sees the whole festival: the sun after 6 and 12 s, the roar after 6 and 12 s, a star after 5 and 12 s (waits halved once the help has lit one), and from the arrival to Egill lifting it takes under 10½ minutes. The end is glad: Egill laughs and waves, Mosi is surprised and never afraid.
- Raw song material and stems never go into the repo: they stay under `qa/remake/hatid/lag/` (git ignores `qa/`). Only the mixed song, its beat map and their credits are committed.
- Tests are lean and child-facing (what the child sees and hears and cannot break), in the suite's style. Run from the repo root: `node --import ./remake/tests/setup.mjs --test --test-reporter=tap remake/tests/<file>.test.mjs`; the whole suite with `npm run test:remake`.
- Performance per key shot on the `tablet` preset (Iris Xe, both sizes): GPU median ≤ 6.0 ms (`__benchmark(120)`), ≤ 100 draw calls, ≤ 250k triangles (STYLE.md §11). Stage lights are glowing cards and points, never real lights; at most one light casts a shadow. The grey version measures the widest party shot before anything is polished (Task 6); the fallbacks are spec §10's. Measure only when no other session is capturing.
- Every file keeps its own line endings (`.gitattributes * -text`): check `git ls-files --eol <file>` before editing and `git diff --stat` before each commit. `remake/main.js` and `engine/book/book.js` are CRLF; the engine and chapter files this plan touches are LF.

## Review Focus

1. **An upright tablet (800x1280) and the three tap layouts:** the sun is in frame with a tap circle of 60 px or more; Grameðla is in frame whole enough to tap; the six stars are in frame, each over its own friend, no two tap circles overlapping. Pinned in Task 3 (`hatid-route.test.mjs`, aspects 1.6 and 0.625) and played in Task 5.
2. **The book or a hidden tab:** in a tap wait the help's seconds stand still with the game clock; in the party the song and the picture stop together and go on together, on the same beat. Pinned in Task 4 and Task 5 (the harness's `pauses`).
3. **A tap at the wrong moment:** the sun before Mosi has asked; a star still flying out of the book; a star already lit; two stars in one instant; anything during the party and after it. Each has one written outcome (Task 4's rulings); none is counted twice and none leaves a task waiting for ever.
4. **Reduced motion:** the camera does not tremble at a stomp, shooting stars fade instead of bursting, half the fireflies, the northern lights stand still, and the festival still plays to the end. Pinned in Tasks 5, 9 and 17.
5. **The same picture at the same time:** the party in the chapter, on the book's tile and at `?t=`; and a festival seen a second time gives no star, records `hatid` once and leaves the six stars as they were. Pinned in Tasks 5 and 19.

## File Structure

| File | Responsibility |
| --- | --- |
| `remake/tools/hatid-lag/form.mjs`, `page.mjs`, `render.mjs` (+ `lib/`), `remake/tools/hatid-song.mjs` (new); `tools/sloedla-music.mjs` (modify) | The song: its form in bars, the candidates' presets, the listening page, the arrangement and mix, and what carries the mix and its beat map into the game. |
| `remake/assets/audio/hatid/song/hatid.mp3`, `song.json`, `CREDITS.md`, `SOURCES.md`; `remake/chapters/hatid-song.js` (generated) | The mixed song and its beat map, as a file and as a module. |
| `remake/chapters/hatid-score.js` (new) | The song's clock for the picture: beats, sections, solos, calls, and the camera's cut list. Pure. |
| `remake/chapters/hatid-route.js` (new); `kafli6-route.js`, `kafli6.js` (modify) | The top as data: where everyone stands in each scene, the stage's place, the sky's places, every shot and who it is for; `topEnd(top)` shared with chapter 6. |
| `remake/chapters/hatid-stars.js` (new) | The six stars: the flight out of the book, the tap rules as a state machine, the tones, the help. |
| `remake/chapters/hatid.js`, `veisla.js`, `hatid-demo.js`, `hatid-himinn.js` (new) | The chapter (four scenes, `WORDS`, `chapter`, `party`); the party alone for the book; a child's hands for the owner's videos (`?hatid=pikk`); a look-check page for the constellations and the moon. |
| `remake/chapters/hatid-looks.js`, `hatid-arrival.js`, `hatid-guests.js` (new) | The light from sunset to party night; each friend's coming up out of the cloud and the sun's goodbye; the small animals round the edge. |
| `remake/chapters/hatid-stage.js`, `hatid-band.js`, `hatid-dance.js` (new) | The stage and its lights; each friend's part in the band and her solo; the called dance. All pure functions of the beat. |
| `remake/chapters/hatid-seventh.js`, `hatid-ride.js` (new) | The seventh star, its light, the lift, the moth, Mosi staying; the hook the ride back fills. |
| `remake/engine/night-sky.js`, `constellations.js`, `moon-face.js` (new) | The night sky, the constellations and the moon: the festival's and the ride back's. |
| `remake/engine/sun-face.js`, `sky.js`, `points.js`, `scene/scene.js`, `riding.js` (modify) | The sun can set, wave with both hands and yawn; `floatTo` can leave him unseated. |
| `remake/world/props/glow-floor.js`, `remake/engine/show/beams.js` (new); `world/fjall/top.js` (modify) | The dance floor of glow flowers in one draw call; light cones in one draw call; the sea's glow in a colour and ripples as a function. |
| `remake/engine/save.js`, `engine/book/cards.js`, `engine/book/videos.js`, `engine/scene/journal.js`, `journal-data.js`, `remake/style.css` (modify) | The save opens the festival; a tile that opens at a seen chapter; the tile "Stjörnuhátíðin"; `seen`; the seventh, empty slot. |
| `remake/tools/hatid-sounds.mjs`, `remake/assets/audio/hatid/` (new); `engine/audio/sfx.js`, `tools/audio-lines.mjs` (modify) | The picked recordings as samples; the line set `hatid`, its lines and credits. |
| `remake/tests/hatid-*.test.mjs`, `night-sky`, `constellations`, `moon-face` `.test.mjs` (new) | Tests per unit; existing tests are modified where a task names them. |

**Departures from the spec and rulings where it is silent (spec §9–§12):**
- **The form is in bars, not seconds.** The owner picks the tempo by ear, so the spec's section lengths become 24 + 32 + 24 + 12 + 24 + 4 = 120 bars of 4/4 (240 s at 120 bpm). The spec's "8 slög" a solo cannot be eight beats (six solos would take 24 s of the 50): it is eight dance beats of two beats each, as chapter 5's `danceBeats`, so a solo is four bars.
- **Files.** The spec's files are kept; `hatid-song.js` is generated (as `kafli5-set.js`), so its helpers and the camera live in `hatid-score.js`. The other added files are in the table above.
- **Nothing is imported from chapter 5's score or set** (`kafli5-show-score.js` loads its whole set): the festival's fireflies, fireworks and looks are its own, over `engine/show/lights.js` and `rings.js`; the night colours are copied into `hatid-looks.js` and a test holds them to chapter 5's.
- **Where it starts.** Chapter 6 places Grameðla and Mosi from `top.wayUp(126°)` and constants private to `kafli6.js`; `kafli6-route.js` `TOP`, which the spec names, is not used. Task 3 moves the constants into `kafli6-route.js` as `topEnd(top)` for both chapters. The sun wears its nightcap from the first frame, as chapter 6 leaves it. The festival is its own page ("Áfram" loads `hatid`).
- **Music before the song.** Mosi's travel theme (`kafli2/theme.json`, as chapter 6 ends) plays low under the arrival and goes to nothing as the sun sinks.
- **The layout** (open until chunk 2's still): the sun sets in the south-west (bearing −145, where the top's bank rises); the stage rises in the north-east (bearing 45) with the moon behind it; in the party everyone faces the child, as a band on a stage does.
- **The six stars hang on the sky sphere,** over each friend as the one still tap shot sees it, in two rows so six tap circles fit an upright screen; each becomes the star on its constellation's `Head`. Six stars fly whatever the save holds and none is added; the journal's slots stay lit meanwhile.
- **Tap rules** (Task 4): a tap on no star is nothing and brings no hint; the help lights unlit stars in the book's order; two taps in one instant light two stars, their tones 0.25 s apart.
- **A constellation may have tips:** a point rigid to a bone where the skeleton has no joint for what makes the friend herself (crest, sail, plates), measured on the model's own skin, never drawn by hand; the owner sees them with and without in Task 11.
- **Egill comes down to the ground** beside Mosi (`floatDown`), not into the saddle: they dance.
- **The calls** (open until chunk 6): the spec's four, each once in the first dance and once in the last chorus, so the song leaves eight one-bar gaps. They are ordinary lines said on the beat, not part of the song's file; cheers and bursts are samples on the song's cues, so the approved mix is never rendered again.
- **Save.** `hatid` goes into `seen` through a new `s.journal.seen(id)`. Once the festival has been seen the save opens chapter 6 again, as today (the spec says only "until it has been seen"); the owner is asked in Task 19. The tile's id is `veisla`; `unlock: { seen: 'hatid' }` is new in `cards.js`. The seventh slot is not a seventh `FRIENDS` entry.
- **The ride back** is called through `chapters/hatid-ride.js`, a stub with the ride's signature that the ride's build re-exports from `ferdin-ride.js`; a dynamic import of a missing file would fail every capture.

## Chunk 1: The song

### Task 1: Worktree, the song's form, the candidates and the listening page

**Files:**
- Create: `remake/tools/hatid-lag/form.mjs`, `remake/tools/hatid-lag/page.mjs`
- Modify: `remake/tools/sloedla-music.mjs` (presets `hatid-a` … `hatid-d`, a preset's `out`), `C:/Risaeðla/.claude/launch.json` (entry `hatid`, port 4350)
- Test: `remake/tests/hatid-form.test.mjs`

**Interfaces:**
- Consumes: `PRESETS`, `presetOf`, `planOf`, `sectionsOf` (`tools/sloedla-music.mjs`: a preset's `form` is `[[name, kind, bars, styles?]]`, `--plan`, `--credits`, `--measure`, `--stems`, `--vocals`, `--cache`); `tools/theme-tempo.mjs` (bpm, beatOffset, key, tuning); `tools/kafli5-lag/djamm-1/` as the model of an arrangement tool.
- Produces:
  - `FORM = [{ id, nameIs, bars }]`: `intro` „Inngangur“ 24, `dance` „Fyrsti dans“ 32, `solos` „Sólóin“ 24, `quiet` „Kyrra stundin“ 12, `chorus` „Síðasta viðlagið“ 24, `chord` „Lokahljómur“ 4. `BEATS_PER_BAR = 4`, `DANCE_BEATS = 2`, `TEMPO = { from: 108, to: 122 }`, `TAIL_SECONDS = 2.5`.
  - `ENTRIES = ['sloedla', 'gramedla', 'kambedla', 'uggedla', 'thorsedla', 'flugedla', 'choir']` with their sounds (horn, stomp, plates, tail, deep tone, scratches, choir): the horn alone for 4 bars, then one entry every 3 bars, the last 2 bars a build. `SOLOS = ['kambedla', 'uggedla', 'thorsedla', 'flugedla', 'sloedla', 'gramedla']`, 4 bars each. `CALLS = ['up', 'stomp', 'spin', 'hop']`: a one-bar gap in the melody at the first bar of each 8-bar phrase of `dance` and of each 6-bar phrase of `chorus`. `MOTIF = [1, 2, 3, 5, 6, 8]` (degrees of the major scale: six rising notes, the stars' tones and the horn's opening).
  - `beatsOf(form = FORM)` → `[{ id, startBeat, beats }]`; `secondsOf(bpm)` → the song's length without its tail.
  - Four presets, each the whole form at one tempo and key, instrumental, festive, none in A major and none at 125 bpm (chapter 5's), each a different feel (first values: a village brass band in D at 112, a carnival march in F at 116, a folk dance with hand drums in G at 120, a toy-orchestra parade in C at 118). A preset's `out` (a folder under `qa/`) takes the place of `folder`, so nothing of the festival's is written under `remake/assets`.
  - `writePage(folder, candidates)` → `index.html` there (paper and Nunito as `tools/voice-pages.mjs`; opens on a phone): each candidate with its player and its six sections as jump buttons, one radio a candidate and a note box, „Vista val“ saving `lag-val.json` (`{ pick, notes }`).

- [ ] **Step 1: Worktree and launch entry.** `git worktree add C:/Risaeðla/dino-hatid -b hatid main`; copy the voice cache in (`cp -n` of `.tools/elevenlabs-remake/*` from main's checkout); add the launch entry; open `http://localhost:4350/remake/index.html`.
- [ ] **Step 2: Write the failing tests:**

```js
test('the form is the spec\'s six sections in whole bars: 120 bars, four minutes at 120 bpm', () => {
  assert.deepEqual(FORM.map(part => [part.id, part.bars]), [['intro', 24], ['dance', 32], ['solos', 24], ['quiet', 12], ['chorus', 24], ['chord', 4]]);
  assert.equal(secondsOf(120), 240);
  assert.ok(secondsOf(TEMPO.from) < 270 && secondsOf(TEMPO.to) > 230);
});
test('six solos of eight dance beats fill the solo section, in the spec\'s order', () => {
  const solos = beatsOf().find(part => part.id === 'solos');
  assert.equal(SOLOS.length * 8 * DANCE_BEATS, solos.beats);
  assert.deepEqual(SOLOS, ['kambedla', 'uggedla', 'thorsedla', 'flugedla', 'sloedla', 'gramedla']);
});
test('the intro has room for seven entries: the horn alone, then one every three bars', ...);
test('the motif is six rising notes', ...);
test('every festival preset asks for the whole form, no singing, and neither chapter 5\'s key nor its tempo', ...);
// planOf(preset): chunks whose bars are FORM's, 'instrumental' in every chunk's styles, vocals in its negative styles, bpm inside TEMPO, key not A
test('a festival preset writes under qa/, never under remake/assets', ...);
```

- [ ] **Step 3:** Run `node --import ./remake/tests/setup.mjs --test --test-reporter=tap remake/tests/hatid-form.test.mjs`; see it fail (`Cannot find module`). **Step 4:** Implement. **Step 5:** Run; see it pass. Commit: "hátíð: the song's form and its four presets".
- [ ] **Step 6: Compose.** `node remake/tools/sloedla-music.mjs --credits`, then `<preset> --plan` for each; note the credits and the plans in the progress file. Compose the four (`--cache qa/remake/hatid/lag/cache`), `--measure` each (tempo, drift, key) and `--vocals` each (nobody sings). A candidate that drifts more than 40 ms over its length, changes key or has a voice is made again with another seed, once; then it is left out and said so. No more than six compositions without asking.
- [ ] **Step 7:** Build the page (`node remake/tools/hatid-lag/page.mjs`) into `qa/remake/hatid/lag/`. **Show the owner and stop:** the link `http://localhost:4350/qa/remake/hatid/lag/index.html`, with each candidate's measured tempo and key in one line. He picks by ear and saves `lag-val.json`. Do not start Task 2 before his pick.

### Task 2: The pick arranged, mixed for small speakers, and its beat map

**Files:**
- Create: `remake/tools/hatid-lag/render.mjs` (and its `lib/`), `remake/tools/hatid-song.mjs`, `remake/chapters/hatid-score.js`
- Create (written by the tools): `remake/assets/audio/hatid/song/hatid.mp3`, `song.json`, `CREDITS.md`, `SOURCES.md`, `remake/chapters/hatid-song.js`
- Test: `remake/tests/hatid-song.test.mjs`

**Interfaces:**
- Consumes: Task 1; `lag-val.json`; the pick's stems (`sloedla-music.mjs <pick> --stems`); instruments the game already has (Slóeðla's horn and the animals' recordings in `assets/audio/kafli5/hljod/`, her footfall `assets/audio/gramedla3d/hljod/thump.mp3`; not chapter 5's song); `tools/kafli5-lag/djamm-1/lib/` (copied into `hatid-lag/lib/` where used) and its `--prufa` small-speaker fixes; `tools/kafli5-song.mjs` as the model of the carrying tool.
- Produces:
  - `render.mjs`: deterministic. From the pick's stems it lays the form: the intro's entries one at a time (the horn plays `MOTIF` alone, twice), the calls' gaps, six solo slots each led by its friend's sound, the quiet part with no drums, the last chorus the loudest part of the song (integrated loudness at least 2 LU over the first dance), the final chord ringing out over `TAIL_SECONDS` into silence. Writes `qa/remake/hatid/lag/<pick>/`: `mix.mp3` (−16 LUFS, true peak −1.5 dB), `stems/{drums,bass,music,horn,choir,friends}.mp3` (kept for the ride back's remix), `song.json`, `click.mp3` (the mix with a click on every beat and a bell on every section), `checks.json`.
  - `hatid-song.mjs` (`--check` writes nothing): carries `mix.mp3` to `assets/audio/hatid/song/hatid.mp3` and writes `song.json`, `chapters/hatid-song.js` (`export const SONG = …`, "do not edit by hand"), `CREDITS.md`, and `SOURCES.md` (every raw file and stem under `qa/remake/hatid/lag/` with bytes and md5; nothing is uploaded anywhere without the owner's word).
  - `song.json`: `{ about, name, bpm, beatOffset, beatsPerBar: 4, danceBeats: 2, driftMs, key: [5 Hz, root first], keyName: { root, mode }, motif: [6 Hz, rising], song: { src: 'hatid.mp3', seconds, endBeat, tail, loudness: { lufs, truePeak }, sections: [{ id, nameIs, startBeat, beats }], entries: [{ who, sound, beat }], solos: [{ who, startBeat, beats }], calls: [{ move, section, beat, beats: 4, doBeat }], cues: [{ beat, kind: 'stomp' | 'plate' | 'tail' | 'scratch' | 'horn' | 'hit' | 'roar' | 'burst', who? }] } }`. `doBeat` is the first beat of the bar after the gap: where everyone does the move. `roar` and `burst` cues lie only in `chorus`; `hit` is the band's accents. The time of bar n is `beatOffset + n × 4 × 60 / bpm`: the tempo is fixed and `driftMs` says how true the file is to it.
  - `hatid-score.js` (pure, reads `SONG`): `BEAT` (s), `END_BEAT`, `beatAt(seconds)`, `secondsAt(beat)`, `sectionAt(beat)` (null before 0 and after the tail), `soloAt(beat)` → `{ who, u }` | null, `callAt(beat)` → `{ move, u, doing }` | null (`doing` from `doBeat` for 8 dance beats), `entered(who, beat)` → 0..1 (eased over a bar from her entry), `energyAt(beat)` (0 quiet … 1 last chorus), `pulseAt(beat)` (1 on a beat, falling), `cuesIn(kind, from, to)`.

- [ ] **Step 1: Write the failing tests:**

```js
test('the beat map is the form: six sections end to end, in order, and the song ends on its last bar', () => {
  const { sections, endBeat } = SONG.song;
  assert.deepEqual(sections.map(part => part.id), ['intro', 'dance', 'solos', 'quiet', 'chorus', 'chord']);
  sections.reduce((at, part) => { assert.equal(part.startBeat, at); return at + part.beats; }, 0);
  assert.equal(endBeat, 480);
  assert.ok(Math.abs(SONG.song.seconds - (endBeat * 60 / SONG.bpm + SONG.song.tail)) < 0.05);
});
test('one tempo, one key: the file drifts under 20 ms from its grid, and it is not chapter 5\'s song', ...); // driftMs; not (bpm 125 and root A)
test('the motif is six rising notes of the song\'s key, each within 5 cents', ...);
test('seven entries in the intro, Slóeðla\'s horn first and alone for four bars', ...);
test('six solos of 16 beats, back to back, filling the solo section', ...);
test('eight calls: the four moves in the first dance and again in the last chorus, each a bar\'s gap, done on the next bar', ...);
test('the quiet part has no stomp, plate, tail or hit; roars and bursts are only in the last chorus', ...);
test('the last chorus is the loudest part and the chord dies into silence', ...); // checks.json as written into song.json's about/loudness per section
test('the module is the file: hatid-song.js is song.json, and --check finds nothing to write', ...);
test('sectionAt, soloAt and callAt read the map: who has the spotlight at each solo\'s first and last beat', ...);
```

- [ ] **Step 2:** Run `hatid-song.test.mjs`; see it fail. **Step 3:** Fetch the pick's stems, implement `render.mjs`, render, read `checks.json`; implement `hatid-song.mjs` and `hatid-score.js`; carry the song in. **Step 4:** Run; see it pass, with `hatid-form.test.mjs`.
- [ ] **Step 5:** A second page, `qa/remake/hatid/lag/blanda.html`: the mix, the click version, the six sections as jump buttons with their seconds, and the six stars' tones as six buttons. Listen on a phone's own speaker before sending.
- [ ] **Step 6:** Commit ("hátíð: the festival song and its beat map"; `git status` shows nothing under `qa/`). **Show the owner and stop:** `http://localhost:4350/qa/remake/hatid/lag/blanda.html`, with the measured tempo, key and length. Ask: the mix on his phone, the six sections' lengths, the horn's opening. **Do not start chunk 2 before his yes;** everything after this is locked to this file.

## Chunk 2: The grey festival, locked to the song

### Task 3: The top as data: stands, the stage's place, the sky's places, the shots

**Files:**
- Create: `remake/chapters/hatid-route.js`
- Modify: `remake/chapters/kafli6-route.js` (`TOP_END`, `topEnd`), `remake/chapters/kafli6.js` (uses them; nothing it does changes)
- Test: `remake/tests/hatid-route.test.mjs`; `kafli6.test.mjs`, `kafli6-route.test.mjs`, `kafli6-snerting.test.mjs` unchanged and green

**Interfaces:**
- Consumes: `createTop`, `topRooms()` (`world/fjall/top.js`: `radius` 45, `edge(angle)`, `wayUp(angle)` → three points from under the sea to 8 m inside the rim, `room`, a free 12 m middle, the bank at bearing −145), `FJALL` (`world/fjall/ground.js`); `kafli6.js`'s private `TOP_WAY = 126`, `TOP_WALK = 4`, `RUN_SIDE = 5.5` and its `aside`; `HEAD_SEAT` (`kafli6-seat.js`); `LIMITS` (`engine/camera/director.js`); STYLE.md §3 (the friends' lengths).
- Produces:
  - In `kafli6-route.js`: `TOP_END = { way: 126, walk: 4, side: 5.5 }`; `topEnd(top)` → `{ her: { at, heading }, mosi: { at, heading } }`, exactly where chapter 6's last scene stops them.
  - `BEARING = { sun: -145, stage: 45, child: -135 }` (degrees, from +x toward +z, as the looks' azimuth). `floorPoint(across, depth)` → `[x, z]`: `depth` m from the middle toward the stage, `across` to the child's right.
  - `FRIENDS8 = ['gramedla', 'mosi', 'egill', 'flugedla', 'kambedla', 'uggedla', 'thorsedla', 'sloedla']`; `MODELS` (friend → file in `assets/characters/`, as `fjall-toppur.js`).
  - `standsOf(top)` → `{ start, farewell, dark, party, gather }`, each `{ friend: { at: [x, z], heading } }`. `start`: `topEnd(top)`, Egill on her head. `farewell` and `dark`: an arc open to the sun, every big friend 6 m or more from the next, Mosi beside Grameðla. `party` (first values, `floorPoint`): Slóeðla `[0, 30]` and Flugeðla `[6, 29]` on the stage, Grameðla `[-17, 20]`, Þórseðla `[17, 22]`, Uggeðla `[-13, 4]`, Kambeðla `[12, 5]`, Mosi `[-2, -9]`, Egill `[2.5, -11]`, all facing the child. `gather`: a ring round Egill, 7 m or more from him.
  - `STAGE = { centre: floorPoint(0, 30), stones: 9, arc: 150, radius: 9, height: [0.6, 1.4] }`; `FLOOR = { radius: 30, count: 420 }`.
  - `ARRIVALS = [{ friend, way (bearing), seconds: 15, line }]` in the spec's order: Flugeðla −20, Kambeðla −60, Uggeðla 10, Þórseðla −95, Slóeðla 70 (first values; none in the south-west, where Grameðla came up).
  - `SKY = { stars: { friend: { azimuth, elevation } }, first, moon: { azimuth: 45, elevation: 7 }, seventh: { azimuth: 45, elevation: 58 } }`, the six in two rows (elevations 26 and 38, first values); `STAR_TAP = 3.6` (degrees round a star: its tap circle); `SUN_TAP = 6.5`; `starOver(friend, stands, shot)` → the azimuth that puts a star over its friend in `shot`.
  - `SHOTS` (one place, `toppur`): `top_empty`, `arrive_<friend>` × 5, `lineup_sun`, `sun_faces`, `dark_wait`, `first_star`, `roar_up`, `sea_ring`, `stars_wide`, `egill_down`, `moon_peek`, `stage_front`, `party_wide`, `party_high`, `floor_low`, `egill_mosi`, `sky_dance`, `solo_<friend>` × 6, `moon_close`, `final_pose`, `gather`, `seventh_sky`, `lift_side`, `mosi_up`, `rise_down`; `SHOWS` (shot → who must be in frame); `tallShot(name)` (the upright frame where one is needed); `sunShot(aspect)`, `starsShot(aspect)` (still shots: the camera does not move while a tap waits).

- [ ] **Step 1: Write the failing tests:**

```js
test('the festival starts where chapter 6 ends: topEnd is the stop of its last scene', ...); // against the constants kafli6.js used: wayUp(126°)[2], 4 m on toward her room, Mosi 5.5 m to her right and 1 m back
test('everyone has a stand in every scene, inside the flat, no two bodies overlapping', ...); // discs of half each friend's length, as top.room
test('in the party everyone faces the child and nobody stands between the child and Egill', ...);
test('upright and wide: the sun is in sunShot with a tap circle of 60 px or more, clear of every friend', ...); // Review Focus 1
test('upright and wide: the six stars are in starsShot, each within its friend\'s span on the screen and above her, tap circles apart', () => {
  for (const aspect of [1.6, 0.625]) {
    const view = project(starsShot(aspect), aspect);
    const stars = FRIENDS.map(f => view.sky(SKY.stars[f.key], STAR_TAP));
    for (const [i, star] of stars.entries()) {
      assert.ok(view.inFrame(star, 0.04), `${FRIENDS[i].key} at ${aspect}`);
      assert.ok(star.y < view.head(FRIENDS[i].key).y, 'above its friend');
      for (const other of stars.slice(i + 1)) assert.ok(Math.hypot(star.x - other.x, star.y - other.y) >= star.r + other.r);
    }
  }
}); // Review Focus 1
test('no arrival comes up within 30 degrees of another or of the south-west', ...);
test('every shot keeps the director quiet (LIMITS) and shows who SHOWS names, wide and upright', ...);
test('party_wide holds all eight, the stage and the moon\'s place; no solo shot holds more than three big friends', ...);
```

- [ ] **Step 2:** Run `hatid-route.test.mjs`; see it fail. **Step 3:** Implement. **Step 4:** Run it with `kafli6.test.mjs`, `kafli6-route.test.mjs`, `kafli6-snerting.test.mjs`; see them pass. **Step 5:** Commit: "hátíð: the top as data (stands, stage, sky, shots); chapter 6's last stop shared".

### Task 4: The three taps as rules

**Files:**
- Create: `remake/chapters/hatid-stars.js` (the machine; its drawing comes in Task 12)
- Test: `remake/tests/hatid-stars.test.mjs`

**Interfaces:**
- Consumes: `createHelp({ hint, name, auto })` (`kafli6-help.js`: `want`, `update`, `wrong`, `done`, `times`, `quick`); `FRIENDS` (`engine/scene/journal-data.js`: the book's order); `SONG.motif`.
- Produces:
  - `TAP_HELP = { sun: { hint: 6, auto: 12 }, roar: { hint: 6, auto: 12 }, stars: { hint: 5, auto: 12 } }`; `TONE_GAP = 0.25` (s between two tones).
  - `createOneTap({ help })` → `{ start(time), tap(time) → { counted }, update(time), events(), state() → { waiting, done } }`: events `'want'`, `'help' { level: 'hint' }` (Mosi says his line again), `'go' { by: 'child' | 'help' }`. One tap counts; any tap before `start` or after `'go'` is `{ counted: false }`.
  - `createStars({ friends = FRIENDS.map(f => f.key), help = TAP_HELP.stars } = {})` → `{ start(time), tap(friend, time) → { counted }, update(time), events(), state() → { lit: [friend], waiting, done } }`, shaped as `createPrints`. Events: `'want'`, `'light' { friend, n, tone, at, by: 'child' | 'help' }` (`n` 0 to 5 in the order lit, `tone` `SONG.motif[n]`, `at` the time its tone sounds: never within `TONE_GAP` of the tone before), `'help' { level: 'hint', friend }` (that star glows stronger and bobs), `'all' { at }` (the sixth is lit: the hundreds come), `'done'`.
  - Rules: any unlit star may be tapped at any time after `start`, in any order, several at once. A lit star, a star not yet arrived, and a tap on no star (`friend` null) are `{ counted: false }` with no event and no hint. The ladder is wanted from `start` and again from each `'light'`; its hint and its auto take the first unlit friend in `friends`' order; `done('auto')` halves the waits until the child next lights one.

- [ ] **Step 1: Write the failing tests:**

```js
test('the stars light in any order and the tones still rise: every order of taps gives motif 0 to 5 in turn', () => {
  for (const order of [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0], [3, 0, 5, 1, 4, 2]]) {
    const stars = createStars(); stars.start(0);
    order.forEach((k, i) => stars.tap(FRIENDS[k].key, 1 + i));
    stars.update(10);
    const lights = stars.events().filter(e => e.type === 'light');
    assert.deepEqual(lights.map(e => e.friend), order.map(k => FRIENDS[k].key));
    assert.deepEqual(lights.map(e => e.tone), SONG.motif);
  }
});
test('a child who taps nothing: the first star glows at 5 s and lights itself at 12 s, the rest at 2.5 and 6 s each, in the book\'s order', ...);
test('after a star lit itself the waits are halved, and whole again when the child lights one', ...);
test('a lit star tapped again, a tap on no star and a tap before the stars have arrived count nothing and bring no hint', ...); // Review Focus 3
test('two stars tapped in the same instant light both, their tones 0.25 s apart, the lower first', ...); // Review Focus 3
test('the sixth star gives `all` once, then `done`', ...);
test('one tap is all the sun and the roar take: a second tap counts nothing; untouched, the line again at 6 s and it happens by itself at 12 s', ...);
test('time that does not pass holds every wait', ...); // Review Focus 2
```

- [ ] **Step 2:** Run `hatid-stars.test.mjs`; see it fail. **Step 3:** Implement. **Step 4:** Run; see it pass. **Step 5:** Commit: "hátíð: the rules of the three taps".

### Task 5: hatid.js: all four scenes in grey, the party on the song's clock, veisla.js

**Files:**
- Create: `remake/chapters/hatid.js`, `veisla.js` (`export { party as chapter } from './hatid.js';`), `hatid-demo.js`, `hatid-ride.js` (the stub), `remake/assets/audio/hatid/lines-source.json` (the texts only; nothing recorded yet)
- Test: `remake/tests/hatid.test.mjs`

**Interfaces:**
- Consumes: Tasks 2–4; `createSong` (`engine/audio/song.js`: `play(at)`, `update()`, `setPaused`, `position`), held with the game's sound as `kafli5.js` `setUp` holds it; `createSeat(host, HEAD_SEAT)`, `ride`, `floatDown`, `floatTo` (`engine/riding.js`); `gramedlaLife(s, c)` (`kafli6-gramedla.js`: `headDown()`, `rise()`, `nod()`); `beckon`, `unbeckon` (`kafli6-glitter.js`); `s.sun.wave()`, `s.sun.hug()`, `s.sun.cap()`; `top.sea.wave`; `world.music.setLevel`; `endCard`, `playStart` (`engine/book/show-cards.js`), `leaveShow`; `playUnattended` (`onFrame`, `pointer.tap`, `pauses`, `reduced`, `aspect`, `savedWith`).
- Produces:
  - `export const chapter = { id: 'hatid', title: 'Stjörnuhátíðin', next: null, look: 'sunset', theme: 'kafli2/theme.json', start: 'toppur', locations: { toppur: { build: world => createTop(world), shots: SHOTS } }, actors (the eight, from `MODELS`), cast (the seven speakers in the hues of `journal-data.js` `FRIENDS`, Mosi's and Egill's as chapter 6; Grameðla none), lines, startShot: 'top_empty', warmUp, shots: {}, *script(s) }`.
  - `WORDS` (verbatim from the spec):

```js
export const WORDS = {
  h_egill_where: 'Hvar eru allir?', h_mosi_wait: 'Bíddu bara. Þau koma.',
  h_flugedla_forest: 'Allur skógurinn er á leiðinni!', h_kambedla_light: 'Ég kom með ljósið!', h_uggedla_river: 'Allir komnir yfir ána!',
  h_thorsedla_late: 'Er ég of sein?', h_sloedla_song: 'Ég man lagið!',
  h_mosi_sleep: 'Sólin er að fara að sofa. Vinkaðu henni, Egill!', h_mosi_wave: 'Vinkaðu henni, Egill!', h_mosi_goodnight: 'Góða nótt, sól!',
  h_mosi_first: 'Nú bíðum við eftir fyrstu stjörnunni.', h_thorsedla_there: 'Þarna! Ég sé hana!', h_mosi_now: 'Núna, Egill!',
  h_mosi_light: 'Kveiktu á þeim, Egill!', h_mosi_summer: 'Fyrstu stjörnur sumarsins! Gleðilega Stjörnuhátíð!',
  h_sloedla_up: 'Hendur upp!', h_sloedla_stomp: 'Stappa!', h_sloedla_spin: 'Snúa!', h_sloedla_hop: 'Hoppa!',
  h_mosi_thanks: 'Takk, Egill. Þetta var besti dagur í heimi.', h_thorsedla_more: 'Bíddu … þarna er ein í viðbót.',
  h_egill_fly: 'Mosi, sjáðu! Ég flýg!', h_mosi_where: 'Egill! Hvert ertu að fara?', h_egill_bye: 'Ég veit það ekki! Sjáumst!', h_mosi_find: 'Ég finn þig, Egill!',
};
```

  - `CAMERA` in `hatid-score.js`: `[{ beat, cut, quick?, then? }]` as `kafli5-video.js` `CAMERA` (a cut on a beat; a shot lasts a bar at least unless `quick`; `then` a push, orbit or zoom over so many beats, inside STYLE.md §8's speeds). Grey first cut: `stage_front` at 0, a cut to each friend as she enters, `party_wide` on the first beat of `dance` and of `chorus`, `solo_<who>` on each solo's first beat, `sky_dance` in the quiet part, `final_pose` on the chord.
  - Scenes, `mark(c, n)` at each, every line through `say(s, c, speaker, id)`, every tap target through `aim(s, c, name, point, radius)`, every sound through `sound(s, c, name, detail)` (as `kafli6.js`); `c.taskLog` (the machines' events), `c.partyLog` (`{ type: 'cut' | 'cue' | 'call' | 'section', beat, … }`):
    1. `arrival`: `standsOf(top).start`, the seat, `s.sun.cap(1)`, the theme at 0.5; the two opening lines; the five of `ARRIVALS`, 15 s each, each walking (Flugeðla: appearing) from her `wayUp` to her `farewell` stand with her line; all turn to the sun; `h_mosi_sleep`; `createOneTap(TAP_HELP.sun)` with the sun aimed (`'sun'`, `SUN_TAP`) and glittering: hint → `h_mosi_wave`, go → `s.sun.wave()` and everyone's wave; `s.sun.hug()`; `h_mosi_goodnight`; the light to dark over 12 s (grey: `easeLight` to `LOOKS.evening` and on to a flat dark blue), the theme to 0, the wind alone.
    2. `stars`: `h_mosi_first`; `h_thorsedla_there` and one grey star; `h_mosi_now`, `createOneTap(TAP_HELP.roar)` with Grameðla and Egill aimed: go → her `roar` clip, `top.sea.wave({ from: her, strength: 3, seconds: 5 })`; six grey stars to `SKY.stars`; `h_mosi_light`; `createStars()` with the six aimed (`skyPoint`, Task 9; grey: a point 450 m out along the direction); `'light'` → the star takes its friend's colour and `starTone(n)` (grey: `s.sfx('star', { rate })`), the friend plays `happy` (Grameðla nods); `'all'` → `h_mosi_summer`; her `headDown()`, `floatDown` to Egill's `party` stand, `rise()`; everyone walks to her `party` stand; the moon (grey: a pale disc at `SKY.moon`) rises over 3 s; „Tút!“ (grey: `s.sfx('horn')`).
    3. `theParty(s, c)`: `c.partyStart = s.time`; `c.song.play(0)`; each frame `beat = (s.time - c.partyStart) / BEAT` is handed to `c.stage.update(beat)`, `c.band.update(beat)`, `c.dance.update(beat)` (grey: each friend's `idle` with a bob on `pulseAt(beat)`, her `happy` in her solo; a disc of light (`engine/show/rings.js`) under whoever `soloAt` names); the cuts of `CAMERA` and the calls of `SONG.song.calls` (each said by Slóeðla on its beat) are walked by beat, as `kafli5.js` `theSet` walks `SET_BEATS`; it ends at `END_BEAT × BEAT + SONG.song.tail`. No target is aimed and no `s.onTap` is asked for while it runs.
    4. `seventh`: everyone to `gather`; `h_mosi_thanks`; `h_thorsedla_more`, a grey star at `SKY.seventh`; Egill is lifted (grey: `floatTo` a point 9 m up over 6 s) with the four lines; `s.journal.seen('hatid')` is asked for as his feet leave the ground (Task 19 makes it real; until then the call is skipped when absent); `yield* ride(s, c, hand)` (`hatid-ride.js`); then `s.journal.open('dinosaurs')`.
  - `hatid-ride.js`: `export function* ride(s, c, hand)`, the stub: `rise_down` for 6 s as he goes up out of frame, then returns. `hand = { egill, moth, mosi, top, sky, constellations, moon, seventh: { azimuth, elevation, colour }, lifted: { at: [x, y, z], time } }` (grey: the sky parts null).
  - `export const party = { ...chapter, id: 'veisla', title: 'Stjörnuhátíðin', next: null, lines: (the four calls), startShot: 'moon_peek', startsItself: true, startButton: playStart, *script }`: `asParty(s, c)` puts everyone on her `party` stand in the party's light with the six stars lit and the moon up, behind the black; then the moon's „Tút!“, `theParty`, and the end card (`endCard`: „Aftur“ plays it again with a new song object, „Hætta“ `leaveShow`), as `kafli5.js` `show`. `ALONE = { fadeIn: 0.8, toot: 2 }`; `partyTime(beat)` → the tile's second of a beat (for `?chapter=veisla&t=`).
  - `demoAsked()` (`?hatid=pikk`), `startDemoChild(s, c)` as `kafli6-demo.js`. It taps: the sun 2 s after Mosi asks; a tap on the sky first, then Grameðla; the stars in the order Slóeðla, Kambeðla, a lit one again, Grameðla, then waits for the glow and taps that one, then the last two at once; and the screen every 3 s through the party.

- [ ] **Step 1: Write the failing tests:**

```js
test('nobody touching: from the arrival to Egill lifting takes under 10½ minutes, and the festival plays to its end', ...); // playUnattended(hatid, { seeking: false, limit: 700, shaped: true }): the 'lifted' log entry before 630 s
test('nobody touching: the sun waves, she roars and all six stars light, each on its help; all eight are on the top when the song starts', ...);
test('the first frame is chapter 6\'s last: Grameðla and Mosi within 0.1 m and 2 degrees of topEnd, Egill on her head, LOOKS.sunset, the sun in its cap', ...);
test('the five come in the spec\'s order, 15 s apart, each with her line', ...);
test('a child who taps the stars backwards hears the six tones rise all the same, and each star takes its own friend\'s colour', ...);
test('taps in the party change nothing: a child tapping all over the screen every 0.7 s gets the partyLog and the poses of the untouched play', ...); // partyFrame(c) at beats 8, 100, 200, 300, 400
test('the party is the song\'s clock: every cut, call and section of partyLog is on its beat of the map, within a frame', ...);
test('the book open for 30 s in the first dance: the song\'s position and the beat stop together and go on together', ...); // Review Focus 2
test('the party on the tile is the party in the chapter: the same partyFrame at the same beats, and the same partyLog', ...); // Review Focus 5
test('the tile plays from the moon\'s Tút to the last chord, says only the four calls, gives no star and leaves the save as it was', ...);
test('reduced motion: no handheld, and the festival plays to its end', ...); // Review Focus 4
test('upright (aspect 0.625): every aimed target is on the screen whenever its task waits', ...); // Review Focus 1
test('every line of WORDS is said in the untouched play but h_mosi_wave, which the help says', ...);
```

`partyFrame(c)` (exported for the tests and the probes): each actor's root position and heading and the quaternions of her `Head`, `Neck` and `Tail1`, the camera's position and target, and `c.stage.state()`.

- [ ] **Step 2:** Run `hatid.test.mjs`; see it fail. **Step 3:** Implement. **Step 4:** Run; see it pass, with the suite.
- [ ] **Step 5:** Commit: "hátíð: the whole festival in grey, the party on the song's clock, the party alone".

### Task 6: The widest shot measured, the standing still, the two videos

**Files:**
- Modify: `remake/chapters/hatid-route.js` (the party's stands and `party_wide` as the numbers ask), `remake/chapters/hatid.js`
- Test: `remake/tests/hatid-route.test.mjs`, `remake/tests/hatid.test.mjs`

**Interfaces:**
- Consumes: `capture.mjs --bench 120` (`quality=tablet`), `window.__demoStats`; `prepareCharacter`, `updateCharacterLods` (`engine/character-lod.js`: half the triangles below 700 px on screen, a quarter below 200 px and for the shadow); `loadCritters`, `createCrowds` (stand-ins for Task 8's guests: 23 placed at the rim).
- Produces: `qa/remake/hatid/butur2/maeling.md`: `party_wide` at beat 100 of `?chapter=veisla` at both sizes, all eight in frame with 23 guests, the grey stage and 600 light points: GPU median, draw calls, triangles, and the triangles each friend draws. The models together are 281k triangles at full detail, so the levers are applied in this order until the shot holds, and what was applied is written into `hatid-route.js` as `BUDGET` and into the constraints of chunks 5 and 6: (1) the four friends furthest from the camera stand where they draw under 200 px (the quarter); (2) those four cast no shadow in the party; (3) guests from 23 to 14; (4) `party_wide` held 4 bars at the most. Never more than three big friends near the camera in one shot.

- [ ] **Step 1: Write the failing tests:** `'in party_wide no more than three big friends draw over 700 px wide and at least four draw under 200 px, at 1280x800 and 800x1280'`, `'BUDGET says what was measured: its three numbers are inside the budget at both sizes'`, `'no wide shot of CAMERA lasts longer than BUDGET.wideBars'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Measure, apply the levers, write `maeling.md` and `BUDGET`. **Step 4:** Run; see them pass.
- [ ] **Step 5:** The still of where everyone stands: `party_high` (from above) and `party_wide` with each friend's name written over her, at both sizes, and the same pair for the farewell arc. Two videos: `node remake/tools/chapter-video.mjs --out qa/remake/hatid/butur2-ekkert --chapter hatid --size 1280x800 --max 720 --sound --stats` (untouched) and the same with `--query "hatid=pikk" --out qa/remake/hatid/butur2-pikk`; phone copies `simi.mp4` of each (960x600, h264 about 480 kbps, AAC 96 kbps: the full videos are over what the phone app shows). Upright stills (800x1280) of the three taps as they wait.
- [ ] **Step 6:** Commit, progress note. **Show the owner and stop:** the two phone videos, the four standing stills, the three upright tap stills and the measured numbers in one line. Ask: where everyone stands and where the stage rises (spec §12), the timing of the four scenes, the three taps. **Do not start chunk 3 before his yes.**

## Chunk 3: The arrival and the sun's goodbye

### Task 7: A sun that sets, and the light from sunset to dark

**Files:**
- Create: `remake/chapters/hatid-looks.js`
- Modify: `remake/engine/sun-face.js`, `remake/engine/sky.js`, `remake/engine/points.js`, `remake/engine/scene/scene.js`
- Test: `remake/tests/sun-face.test.mjs`, `remake/tests/hatid-looks.test.mjs`

**Interfaces:**
- Consumes: `createSunFace` (its `direction` is taken once; `cap(amount)` is "a number to show"; gestures queue and never overlap; `WAVE_SECONDS`, `MOUTHS`); the dome's `uSunDir` and `uCover` uniforms (`engine/sky.js`); the `'sun'` point (`engine/points.js`); `lightTo`, `easeLight` (`engine/light-blend.js`); `LOOKS.sunset`, `blendLooks`; chapter 5's `LOOKS.night` and chapter 6's `NEARLY_NIGHT` as the source of the night's colours.
- Produces:
  - `sun.drop(degrees)`: the face, its mouth, hands and cap hang that many degrees straight below the sun's own place (0: where it is). A number to show, as `cap`. `sun.dropDeg`. `sun.waveBoth()` → Handle: both hands up beside the face, four swings and down, in `WAVE_SECONDS`. `sun.yawn()` → Handle: `YAWN_SECONDS = 2.4`, the mouth to "o" and wider, the eyes shut, and half shut after. Both queue as `wave` and `hug` do and are pure functions of the clock.
  - `sky.setSunDrop(degrees)`: the dome's own disc and glow turn down by as much, from the look's direction; 0 gives the look's back.
  - `s.sun.waveBoth()`, `s.sun.yawn()`, `s.sun.drop(degrees)`: the last sets the face and the dome together and `world.sunDrop`, which the `'sun'` point follows, so a target on the sun stays on it.
  - `SUNSET = { under: 14, seconds: 14 }` (degrees that take it under the sea's horizon from the farewell shot; first values).
  - `HATID_LOOKS = { sunset, red, blue, dark, night }`, each with every field `LOOKS.morning` has and the sun at azimuth 215, elevation 10: `red` (the gold gone red, the sun's light at 0.6 of sunset's), `blue` (the sky blue, the sun's light at 0.2), `dark` (deep blue, fog `#16204a`, the sun's light 0.12 and blue: a rim on a silhouette, the hemisphere 0.25), `night` (the party's base: chapter 5's night colours, bright and warm, exposure 1.0, the hemisphere 0.8). `lookAt(u)` → a look, `u` 0 (sunset) to 3 (dark), blended in between.
  - The fog's own sun is compiled and stays; it fades with `fog.sunStrength`, which each look after `red` has at 0.

- [ ] **Step 1: Write the failing tests:** `'drop hangs the face, its hands and its cap lower by the same angle, and 0 puts them back to the last bit'`, `'the dome\'s disc drops with the face: the two stay within 0.2 degrees of each other'`, `'at SUNSET.under the face\'s whole disc is below the sea\'s horizon from sun_faces and lineup_sun'`, `'the sun point follows the drop'`, `'waveBoth: both hands rise, swing four times, mirror each other, and come down; yawn: the mouth opens wide with the eyes shut'`, `'the same clock gives the same picture with a drop, a yawn and a two-hand wave under way'`, `'the five looks have every field morning has and one sun; each is darker than the one before but night, which is brighter than dark'` (`kafli6-looks.js` `brightness`), `'night\'s colours are chapter 5\'s night'`.
- [ ] **Step 2:** Run both files; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with `kafli5-show.test.mjs`, `kafli6-ljos.test.mjs` and `light-blend.test.mjs` (the sun as every other chapter has it). **Step 5:** Commit: "the sun can set: drop, a two-hand wave and a yawn; the festival's light from sunset to night".

### Task 8: Each friend's coming, the guests, and the sun's goodbye

**Files:**
- Create: `remake/chapters/hatid-arrival.js`, `remake/chapters/hatid-guests.js`
- Modify: `remake/chapters/hatid.js`, `hatid-route.js`
- Test: `remake/tests/hatid.test.mjs`, `remake/tests/hatid-route.test.mjs`

**Interfaces:**
- Consumes: Task 7; `top.wayUp`, `top.veil`, the cloud cards' `setGlow(v, colour)` (`world/fjall/look.js`); `addPlateGlow` (`engine/plate-glow.js`); `holdHer`, `flyPath` (`kafli4-flugedla.js`); the clips `liftUp`, `lowerHead` (Þórseðla), `call` (Slóeðla), `wade` (Uggeðla); `sloedlaLife(sloedla).blow` (`kafli5-sloedla.js`); `loadCritters` (`world/ardalur/animals.js`), `createCrowds` (`world/critters/crowd.js`); chapter 5's `CHOIR` (`kafli5-pool.js`) for how many of each kind there are.
- Produces:
  - `*arrive(s, c, entry)` for each of `ARRIVALS`, known before she is seen whole, about 15 s:
    - Flugeðla: a speck far out over the sea, a lap round the top (`flyPath`), her landing on her stand; the flyers come down onto the top's rocks.
    - Kambeðla: her plates glow lilac inside the cloud (`addPlateGlow`, a light on the rim's cards over her way) for 3 s before she steps out.
    - Uggeðla: her sail alone cuts along the rim's cloud for 20 m like a boat, then she climbs out; frogs, turtles and small lizards hop off her back.
    - Þórseðla: her head rises out of the sea 9 m up, looks about, then the rest of her.
    - Slóeðla: one clear horn note from inside the cloud (`blow`), then she walks up with the choir behind her.
  - `createGuests(world, { top, models, budget = BUDGET.guests })` → `{ ready, set(group, phase, u), update(camera, time), dispose() }`: `GUESTS = { flyers: 6, frogs: 5, turtles: 3, lizards: 6, grazers: 3 }` (chapter 5's choir and two more flyers; cut to the budget from the back), each with a seat on the rim (`guestSeat(group, k)`, none inside a friend's stand or the floor) and three phases: `'away'`, `'coming'` (u 0 to 1 along its way), `'there'`. One draw call a kind and level.
  - `*sunGoodbye(s, c)`: everyone turns to the sun; `h_mosi_sleep`; the tap; `s.sun.waveBoth()` while all eight wave in their own way (Egill `wave`, the big ones a lift of the head or a wing); `s.sun.yawn()`, `s.sun.hug()`; `s.sun.drop` eased 0 to `SUNSET.under` over `SUNSET.seconds` while the light goes `lookAt(0 → 3)` on the same seconds; `h_mosi_goodnight` as its top goes under; the theme to 0 over the sinking; then 4 s of wind alone.

- [ ] **Step 1: Write the failing tests:** `'each friend is known before she is seen: the plates\' glow, the sail, the head, the horn and the speck come 2 s or more before her body is on the top'`, `'Þórseðla\'s head is over the sea before any of her feet are on the top; Slóeðla\'s note sounds before she is in frame'`, `'the guests come with their friends: the flyers with Flugeðla, frogs, turtles and lizards with Uggeðla, the grazers with Slóeðla; none stands in a friend\'s stand or on the floor'`, `'the sun waves with both hands when tapped, and everyone on the top waves with it'`, `'the sun goes under in SUNSET.seconds and the light is dark when it has; the music is at 0 from then to the song'`, `'nothing of anyone jumps more than 8 degrees or 0.15 m in a frame through the arrival'`, `'no arrival shot holds more than three big friends'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with the suite.
- [ ] **Step 5:** A video of scene 1 at 1280x800 (`--query "hatid=pikk"`, `--max 150`) with a phone copy; stills at both sizes of each of the five entrances at its telling moment, the line-up facing the sun, the sun waving, and the light at `lookAt(0, 1, 2, 3)`; bench `arrive_thorsedla`, `lineup_sun` and `sun_faces`.
- [ ] **Step 6:** Commit, progress note. **Show the owner and stop:** the video and the eleven stills. Ask: each entrance, the sun's goodbye, the colours on the way to dark, the silence. **Wait for his yes.**

## Chunk 4: The dark, the roar, the stars, the constellations and the moon

### Task 9: The night sky

**Files:**
- Create: `remake/engine/night-sky.js`
- Test: `remake/tests/night-sky.test.mjs`

**Interfaces:**
- Consumes: `farPlaneDepth` (private to `sun-face.js`: export it) and the way the sun's face hangs from the camera; the dome's `uCover`; the `MosiCloud` sprite; `engine/sloedla/game.js`'s flat stars, shooting stars and northern lights as the model of the look, not of the code; `seededRandom`.
- Produces:
  - `SKY_DISTANCE = 450` (m from the camera: inside the dome, beyond everything on the top). `skyDirection(azimuth, elevation, out)` (unit vector; azimuth as the looks' and the top's bearings); `skyPoint(camera, azimuth, elevation, out)` (a live point: a tap target's).
  - `NIGHT = { stars: 700, low: 6, shooting: 12, sparks: 40, bands: 3 }`.
  - `createNightSky(world, { count = NIGHT.stars, seed = 7, first = SKY.first, clear = [], reduced = false } = {})` → `{ group, set({ dark, first, many, time }), shoot(list), aurora(level, time, colours), starAt(i), update(camera), restore(), dispose() }`:
    - `set`: `dark` 0 to 1 thins the dome's clouds to none and fades the Mosi cloud; `first` is the first star's light; `many` 0 to 1 brings the hundreds out, each at its own moment of it (near the zenith first), so the same numbers are the same sky; `time` is the twinkle's. No star lies under `NIGHT.low` degrees or inside a `clear` disc (`{ azimuth, elevation, degrees }`: the six stars' and the moon's places).
    - `shoot(list)`: this frame's shooting stars, `[{ from: [az, el], to: [az, el], u, colour, burst }]`: a head and a tail at `u` along its way, and after it `burst` 0 to 1, `NIGHT.sparks` sparks spreading and fading in `colour`, each spark's way from the star's index. With `reduced` a burst is one soft glow that fades.
    - `aurora(level, time, colours)`: `NIGHT.bands` ribbons high over the whole sky, waving on `time`; with `reduced` they stand still.
    - Three draw calls (the stars; the shooting stars and their sparks; the ribbons), no fog, not tone mapped, no triangles but the ribbons'. Nothing moves by itself: everything is what it was last told. `restore()` gives the dome's cover and the Mosi cloud back.

- [ ] **Step 1: Write the failing tests:** `'no star before many, one star at first, and the hundreds come out as many rises: over 500 lit at 1, the zenith\'s before the horizon\'s'`, `'the same numbers are the same sky, whatever was set before'`, `'no star lies in a cleared disc or under 6 degrees'`, `'a shooting star is on its way at u and has burst into its colour after it; twelve at once are drawn, a thirteenth is dropped'`, `'reduced: a burst is one glow, and the northern lights are the same at two times'`, `'the sky hangs from the camera: it is where it was on the screen after the camera has moved 40 m'`, `'three draw calls, and restore leaves the dome\'s cover and the Mosi cloud as they were'`.
- [ ] **Step 2:** Run `night-sky.test.mjs`; see it fail. **Step 3:** Implement. **Step 4:** Run; see it pass, with `sun-face.test.mjs`. **Step 5:** Commit: "engine: the night sky (stars, shooting stars, northern lights)".

### Task 10: The constellations

**Files:**
- Create: `remake/engine/constellations.js`, `remake/chapters/hatid-himinn.js`
- Test: `remake/tests/constellations.test.mjs`

**Interfaces:**
- Consumes: each actor's skeleton (`assets/characters/*.glb`: 22 to 32 joints; the bones' world matrices after the actor's update); `FRIENDS` (the hues); `skyDirection`, `SKY_DISTANCE` (Task 9); `skinPoints` (`kafli6-seat.js`) for measuring a tip on a model's skin.
- Produces:
  - `STAR_BONE = 'Head'`. `skeletonLines(actor, { tips = [] } = {})` → `{ joints: [name], lines: [[joint, parent]], order: [line] }`: every bone of the skin but `root` is a star, every bone and its parent a line, and `order` is the lines breadth first out from `STAR_BONE`. A tip is `{ name, bone, at: [x, y, z] }`, a star rigid to `bone` in its frame, joined to it.
  - `TIPS = { sloedla: [crest], uggedla: [sail × 3], kambedla: [plates × 4], flugedla: [crest] }`, measured on each model's skin by `hatid-himinn.js` (`?measure=1` prints them) and pasted in.
  - `createConstellations(world, { capacity = 6 } = {})` → `{ group, add(key, actor, { colour, azimuth, elevation, span = 16, facing = 1, tips = [] }), set(key, { drawn = 1, level = 1, breath = 0, look = null }), starOf(key) → { azimuth, elevation }, pointsOf(key, out), update(camera), dispose() }`:
    - The picture is the actor's pose this frame, seen from her side in her own root's frame (where she stands and which way she faces on the top do not move it), her bind pose's length covering `span` degrees of sky, her `Head` at `(azimuth, elevation)`. So a constellation moves as its friend does, with no dance of its own.
    - `drawn` 0 to 1 draws the lines in `order`, a line at a time, each growing from the star's side; `level` is its light; `breath` a slow swell of the stars' size; `look` (`{ azimuth, elevation }`) turns the head's star and its neck's toward a place in the sky. The star on `STAR_BONE` is the brightest and twice the size.
    - Two draw calls for all six: the stars (points) and the lines. No fog, not tone mapped.
  - `hatid-himinn.js` (`?chapter=hatid-himinn&show=merki|tungl`, `friend=<key>|all`, `tips=0|1`, `pose=idle|walk|happy`, `drawn=<0..1>`, `face=<name>`, `measure=1`): the top at night with the sky, one constellation large or all six where the festival has them, each with its friend standing under it. Never part of the game.

- [ ] **Step 1: Write the failing tests:** `'a constellation is its friend\'s skeleton: for each of the six, a star on every joint but the root and a line from every bone to its parent (one line fewer than stars)'`, `'it draws out from the head: at drawn 0.5 half the lines show, and every line shown touches one shown before it or the head'`, `'the head\'s star is the brightest, and is where starOf says'`, `'it moves as she does: her neck turned 30 degrees turns the head\'s star about the neck\'s, and her walk moves its feet'`, `'where she stands and which way she faces on the top leave it where it was'`, `'look turns the head toward a place in the sky and leaves the body'`, `'a tip rides its bone: Slóeðla\'s crest follows her head'`, `'six constellations are two draw calls'`.
- [ ] **Step 2:** Run `constellations.test.mjs`; see it fail. **Step 3:** Implement; measure the tips. **Step 4:** Run; see it pass. **Step 5:** Commit: "engine: constellations from the friends' own skeletons". (Their stills are shown with the moon's, Task 11.)

### Task 11: The moon, and the stills of both for the owner

**Files:**
- Create: `remake/engine/moon-face.js`
- Modify: `remake/chapters/hatid-himinn.js`
- Test: `remake/tests/moon-face.test.mjs`

**Interfaces:**
- Consumes: `engine/sun-face.js` as the model in every way: `drawSunFrames` (a strip of three frames for the eyes), `drawSunSheet` (the mouths and the hand), `drawSunCap`, the two draws (a sprite and one overlay mesh flat to the screen), `SUN_DISTANCE`, the blink every 3 to 6 s as a function of the clock, the tests' stand-in textures; the sun's gold, ink and cheeks as the palette's kin (the moon: pale cream, the same ink, a cool cheek).
- Produces:
  - `MOON = { radiusDeg: 3.4, under: -6, hat: 0.9, hand: 0.6 }`; `MOON_MOUTHS = ['smile', 'grin', 'oh', 'blow']`; `MOON_ACTS = { peek: 3, toot: 2, fixHat: 1.6, wave: 2.3, tipHat: 2 }` (seconds).
  - `drawMoonFrames()` (a half moon in profile with one eye: open, half shut, shut), `drawMoonSheet()` (the four mouths, its one small hand, the party hat, the blower rolled up and blown out); null with no canvas.
  - `createMoonFace({ scene, texture, sheet, azimuth = SKY.moon.azimuth, elevation = SKY.moon.elevation })` → `{ sprite, overlay, set(pose), pose, update(camera), dispose() }`. `pose = { rise, sway, eye, mouth, hand: { kind: 'rest' | 'wave' | 'hat' | 'tip', u }, hat, blower }`: `rise` 0 (at `MOON.under`, below the sea) to 1 (its place); `sway` degrees it rocks; `hat` degrees the hat sits askew; `blower` 0 to 1 unrolled. A number to show: the same pose is the same picture.
  - `moonPose(acts, time)` → pose, pure: `acts = [{ kind: 'peek' | 'smile' | 'toot' | 'askew' | 'fixHat' | 'oh' | 'wave' | 'tipHat' | 'rock', at, seconds?, bpm? }]`. `peek`: up over the cloud to its eye, a look left and right, then all the way. `toot`: the mouth to `blow`, the blower out and back twice. `askew` knocks the hat 25 degrees and `fixHat` puts it right with the hand. `rock` sways on a beat and holds the hat. `tipHat` lifts the hat off and on (the ride back's goodbye). It blinks by itself between.
  - Two draws, never fogged, hidden by what is nearer (the stage, the sea's heaps), as the sun.

- [ ] **Step 1: Write the failing tests:** `'at rise 0 the whole moon is under the sea\'s horizon from party_wide and moon_peek; at 1 it is above it, hat and all, behind the stage'`, `'peek: first only the eye and the hat\'s tip show, it looks both ways, then it is up'`, `'toot: the mouth blows and the blower is out twice in two seconds'`, `'a roar knocks the hat askew and the hand puts it right'`, `'rock sways on the beat it is given and the hand is on the hat'`, `'the same acts and time give the same pose, whatever was asked before; it blinks every 3 to 6 s'`, `'the moon is two draws and its textures are small: a strip of three frames and one sheet'`, `'in party_wide the moon covers under 2 % of the frame'` (it livens the picture and never takes it).
- [ ] **Step 2:** Run `moon-face.test.mjs`; see it fail. **Step 3:** Implement. **Step 4:** Run; see it pass. **Step 5:** Commit: "engine: the moon, painted as the sun is".
- [ ] **Step 6: The stills, before either goes into the festival.** With `hatid-himinn.js`, at 1280x800 and 800x1280: each of the six constellations large beside its friend in the same pose, with and without its tips; all six in the sky over the friends as `stars_wide` and `party_wide` see them; one constellation at `drawn` 0.25, 0.5 and 1; the moon large with each face (smiling, blinking, grinning, "o", blowing with the blower out, the hat askew, the hand on the hat, waving, the hat lifted), and small behind the stage in `party_wide`.
- [ ] **Step 7:** Progress note. **Show the owner and stop:** the constellation stills (24) and the moon's sheet of faces (10 and the wide one). Ask: does he know each friend by her constellation; tips or none; the moon's face, hat and size. **Do not put either into the festival before his yes.**

### Task 12: The dark, the roar, the stars out of the book, and the moon's "Tút!"

**Files:**
- Modify: `remake/chapters/hatid-stars.js`, `hatid.js`, `hatid-route.js`, `remake/engine/scene/journal.js`, `remake/engine/scene/scene.js`
- Test: `remake/tests/hatid.test.mjs`, `remake/tests/hatid-stars.test.mjs`, `remake/tests/journal.test.mjs`

**Interfaces:**
- Consumes: Tasks 4, 7 and 9–11; the journal's flights (`FLIGHT_SECONDS`, its private `fly` and `place`, the slots' rectangles); `createStarSprite` (`engine/scene/star-sprite.js`) as the look of a star; `gramedlaRoar`, `gramedlaThump` and the tuned bells (`engine/audio/sfx.js`); `top.sea.wave`; `s.camera.handheld`.
- Produces:
  - `journal.launchStars(to, { seconds = 1.4, gap = 0.18 })` → Handle, and `s.journal.launchStars(points)`: the journal's book swells in the middle of the screen (a copy of the button's book, 0.6 s), and one star for each of `FRIENDS` flies from it to `to[k]` (screen pixels), the journal's flight backwards, `gap` s apart, with a rocket's short tail; then the copy shrinks back to the button. On the game clock (`update(dt)`), so a pause holds them in the air. The save and the six slots are not touched.
  - `createSkyStars(world, { sky, constellations, places = SKY.stars })` → `{ arrive(friend), dim(friend), glow(friend, on), light(friend, colour) → Handle, pointOf(friend), update(camera, time), dispose() }`: the six as they hang on the sky: dim when they arrive, glowing stronger and bobbing as the help's hint, and at `light` bursting into the friend's colour and becoming the head star of her constellation, which draws itself over `DRAW_SECONDS = 2.6`.
  - `starTone(s, n)`: the effects' bell at `SONG.motif[n]`, as `'light'`'s `at` says.
  - Scene 2 whole: the light `HATID_LOOKS.dark`, `sky.set({ dark: 1 })`; Kambeðla's plates beat slowly, 50 a minute, the only light; `h_mosi_first` (a whisper: its take decides in Task 21); Þórseðla's head to its full height and `h_thorsedla_there`, `sky.set({ first: 1 })` in `first_star`. Grameðla glitters (`beckon`); `h_mosi_now`; the tap. She breathes in (1 s), the guests hide behind Mosi (`guests.set(group, 'hiding', u)`), she roars up at the sky (`roar_up`), the camera trembles (not with reduced motion), and a ring rolls out over the sea (`sea_ring`: `top.sea.wave({ from: her, strength: 4, seconds: 6 })`). `stars_wide`: `launchStars`, then each `skyStars.arrive`. `h_mosi_light`; the six aimed at `skyPoint` with `STAR_TAP`; the machine's events drive `glow`, `light`, `starTone` and each friend's joy in her own way (`happy`; Grameðla's `nod`; Kambeðla's plates flare); `'all'` → `sky.set({ many })` eased 0 to 1 over 5 s and `h_mosi_summer`. `egill_down`: `headDown()`, `floatDown` to his `party` stand, `rise()`, everyone to her `party` stand. `moon_peek`: `peek`, a smile, `toot` with the blower's sound; the party starts `TOOT_GAP = 1.2` s after it.

- [ ] **Step 1: Write the failing tests:** `'six stars leave the book 0.18 s apart and reach their places on the sky; a paused game holds them in the air; the save\'s stars and the six slots are as they were'` (journal.test.mjs), `'in the dark only Kambeðla\'s plates give light, beating 45 to 55 times a minute'`, `'Þórseðla\'s head is the highest thing on the top when she says she sees it, and the first star lights with her line'`, `'the roar: the guests are behind Mosi before it, a ring runs out over the sea from her, and the stars leave the book after it'`, `'each star lights in its own friend\'s colour, its constellation is whole 2.6 s later, and its friend is glad'`, `'a star tapped while it still flies out of the book does nothing'` (Review Focus 3), `'the hundreds come out only when the sixth is lit, and then Mosi wishes a glad festival'`, `'Egill is on the ground beside Mosi before the moon rises, and never falls: his feet come down under 1 m/s'`, `'the moon peeks, smiles and blows, and the song starts 1.2 s after'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with the suite.
- [ ] **Step 5:** A video of scene 2 at 1280x800 (`--query "hatid=pikk"`) with a phone copy; upright stills of the roar's wait and of the six stars' wait with their tap circles drawn (`debug=1`); stills at both sizes of the dark, the first star, the roar's ring, the stars leaving the book, three stars lit with their constellations, the whole sky, the moon peeking; bench `stars_wide` with all six constellations and the full sky.
- [ ] **Step 6:** Commit, progress note. **Show the owner and stop:** the video and the nine stills. Ask: the dark (too dark for a six-year-old?), the roar, the stars and their tones, the moon's entrance. **Wait for his yes.**

## Chunk 5: The stage and the lights

### Task 13: The stage's tools: the floor of glow flowers, light cones, a sea that glows in colours

**Files:**
- Create: `remake/world/props/glow-floor.js`, `remake/engine/show/beams.js`
- Modify: `remake/world/fjall/top.js`
- Test: `remake/tests/hatid-stage.test.mjs`, `remake/tests/fjall.test.mjs`

**Interfaces:**
- Consumes: the glow flower's own shape and colours (`world/props/glow-flower.js`: its `buildBody`, `giveOutOwnColour`; export what is needed); `createLightPoints`, `createRings` (their begin, add, end way of being written anew each frame); the cloud cards' `setGlow(v, colour)`; `top.sea`'s cards and their rest heights.
- Produces:
  - `createGlowFloor(world, { count = FLOOR.count, radius = FLOOR.radius, heightAt, keep = [], seed = 6 } = {})` → `{ mesh, spots, set({ open, pulse, colour, steps }), dispose() }`: the glow flower's bloom small and many, one instanced mesh, one draw call, under 12k triangles. `open` is a radius in metres from the top's middle within which the flowers have sprung open (a wave when it grows); `pulse` 0 to 1 their common light; `colour`; `steps` up to 16 `[x, z, radius, level]`: light under a foot. All uniforms: nothing is written a flower at a time. None stands inside a `keep` disc (the stage's stones).
  - `createBeams(world, { capacity = 10 } = {})` → `{ mesh, begin(), beam(from, to, width, r, g, b, level), end(), dispose() }`: cones of light from a point to a place on the ground, soft at the edges, added to the picture, one draw call, no light on anything (a `rings.disc` where it lands is the stage's to add).
  - `top.sea.setGlow(v, colour)` (the colour is new; without it, as before) and `top.sea.ripples(list)`: this frame's swells, `[{ from: [x, z], front, strength }]`, at most four, the cards' heights their rest and the sum; `ripples([])` is the rest. `sea.wave` stays as it is.

- [ ] **Step 1: Write the failing tests:** `'the floor is one draw call and under 12k triangles; no flower stands on the stage'`, `'open is a wave: at 10 m the flowers within 10 m of the middle are open and those beyond are buds'`, `'a step lights the flowers under it and no others'`, `'the same numbers are the same floor'`, `'ten beams are one draw call'`, `'the sea glows in the colour it is given, and with none as it did'`, `'ripples are a function: the same list gives the same sea, an empty one its rest; sea.wave still runs out and ends at rest'` (fjall.test.mjs).
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with `kafli6.test.mjs` (the top as chapter 6 builds it is unchanged). **Step 5:** Commit: "the stage's tools: a floor of glow flowers, light cones, the sea's colours and ripples".

### Task 14: The stage lights up with the intro, and the lights follow the song

**Files:**
- Create: `remake/chapters/hatid-stage.js`
- Modify: `remake/chapters/hatid.js`, `hatid-looks.js`
- Test: `remake/tests/hatid-stage.test.mjs`, `remake/tests/hatid.test.mjs`

**Interfaces:**
- Consumes: Task 13; `hatid-score.js` (`entered`, `sectionAt`, `soloAt`, `energyAt`, `pulseAt`, `cuesIn`); `createDusk(world)` → `mix(parts, lift)`, `restore()` (`engine/show/dusk.js`: a memoryless blend of looks); `createSpeciesLibrary(seed)` (`rock`; `world/forest/species.js`) for the stage's stones; `FRIENDS`' hues; `BUDGET` (Task 6); `constellations.pointsOf` (where a string of lights hangs from).
- Produces:
  - `STAGE_PARTS = [{ part, with }]`: what lights with whom in the intro: the stones and Slóeðla's cone with `sloedla`; the floor with `gramedla` (her first stomp springs it open in a wave from her feet); the strings with `kambedla`; the sea's colours with `uggedla`; the spotlights with `thorsedla`; the fireflies with `flugedla`; everything at full with `choir`.
  - Pure functions of the beat: `stonesAt(beat)` (each stone's rise, 0 to 1, one after another over a bar), `spotsAt(beat)` → `[{ from, to, colour, level }]` (four spotlights that are swarms of fireflies high over the floor, sweeping on the bar; in a solo all four on `soloAt(beat).who`; dark in the quiet part), `stringsAt(beat)` (120 lights on six catenaries from the constellations' feet down to the stage, a run of light along them on the beat), `firefliesAt(beat, i, out)` (`FIREFLIES = { count: 240 }`: loose swarms, drawn up Þórseðla's neck in a spiral when she plays, drifting free in the quiet part), `seaAt(beat)` → `{ glow, colour, ripples }` (a friend's hue a bar, beating with the pulse; a ripple from every `stomp` cue), `floorAt(beat)` → `{ open, pulse, colour, steps }`, `partyLook(beat)` → the looks and weights for `dusk.mix` (`HATID_LOOKS.night` as the base, tinted a little toward the section's hue; the quiet part two thirds of the way back to `dark`; a soft lift on a `hit`, never two inside a second).
  - `createStage(c)` → `{ update(beat), state(), dispose() }`: builds the stones (the game's own `rock`, nine of them, one instanced mesh), the floor, the beams, the light points (`capacity` 600) and the rings; `update` writes them all from the functions above and nothing else; `state()` is what was written (for `partyFrame`). With `c.reduced`: half the fireflies, no sweep, no lift.
  - Draw calls of the stage: stones 1, floor 1, beams 1, points 1, rings 1.

- [ ] **Step 1: Write the failing tests:** `'the stage lights a part with each friend who comes into the song, in the intro\'s order, and all of it is on by the first dance'`, `'the stones rise before Slóeðla is lit and none moves after the intro'`, `'the floor springs open from Grameðla\'s feet on her first stomp and is whole a bar later'`, `'in every solo all four spotlights are on the soloist; in the quiet part every spotlight is dark and the fireflies drift'`, `'the sea beats with the song: its glow is highest on the beat, and a ripple leaves Grameðla on every stomp'`, `'the party\'s light is a function of the beat: bright and warm in the dance (brighter than dark by half or more), dim in the quiet part, and never two lifts inside a second'`, `'the stage draws the same picture at the same beat, in five draw calls'`, `'reduced: half the fireflies, the spotlights still, no lift'` (Review Focus 4).
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with the suite.
- [ ] **Step 5:** A video of the whole party from the tile (`--chapter veisla`, 1280x800, with sound) and a phone copy; stills at both sizes of the stage as each part lights (7), `party_wide` in the dance, a solo's spotlights, the quiet part; bench `party_wide` and `party_high` at both sizes against `BUDGET`.
- [ ] **Step 6:** Commit, progress note. **Show the owner and stop:** the party's video and the ten stills, with the measured numbers. Ask: the stage, the lights' colours and how bright the night is, anything more "skemmtilegt en ekki raunverulegt" he wants on it. **Wait for his yes.**

## Chunk 6: The band, the dance, the solos, the quiet moment and the last chorus

### Task 15: The called dance, and the constellations dancing with it

**Files:**
- Create: `remake/chapters/hatid-dance.js`
- Modify: `remake/chapters/hatid.js`
- Test: `remake/tests/hatid-party.test.mjs`

**Interfaces:**
- Consumes: `callAt(beat)`, `pulseAt`, `sectionAt`; `actor.setOverlay(fn)` (`engine/actor.js`: laid over the clip each frame) and `guardBones` (`engine/pose/lean.js`), as `kafli6-mosi.js` `smallRoar` uses them; `rotateBoneWorld`; each model's bones (Task 10's list); Egill's clips `wave`, `hop`; `constellations.update` (Task 10: it reads the pose after the overlay).
- Produces:
  - `MOVES = ['up', 'stomp', 'spin', 'hop']`; `CALL_LINE = { up: 'h_sloedla_up', stomp: 'h_sloedla_stomp', spin: 'h_sloedla_spin', hop: 'h_sloedla_hop' }`.
  - `moveOf(friend, move, u, out)` → the pose laid over her clip at `u` (0 to 1 over one dance beat of the move, repeated eight times): bone turns in degrees and a lift of her root, each friend in her own body (first values): `up`: Egill both arms up, Mosi his head and horn, Þórseðla her whole neck, Uggeðla her arms and sail, Flugeðla both wings, Kambeðla her tail and plates' glow, Slóeðla her crest back, Grameðla her little arms and her jaw; `stomp`: a foot up and down on the beat (Grameðla's lands on the map's `stomp` cue); `spin`: a turn on the spot over two dance beats (Þórseðla and Grameðla only their heads and tails round); `hop`: off the ground by `HOP = { egill: 0.35, mosi: 0.3, kambedla: 0.12, sloedla: 0.2, uggedla: 0.15, flugedla: 0.8, thorsedla: 0, gramedla: 0 }` m (the two biggest bounce on bent legs).
  - `grooveOf(friend, beat, out)`: what she does between calls: a bob and a sway on the dance beat, in her own way. `createDance(c)` → `{ update(beat), dispose() }`: for each of the eight, `grooveOf` and, while `callAt(beat).doing`, `moveOf`, blended in over a quarter beat. Simple enough to copy in a living room: a move is one thing, done eight times.
  - Nothing here is `kafli5-dances.js`'s: no import from it, and no move of its `PARTS`.

- [ ] **Step 1: Write the failing tests:** `'each call is followed by its move: everyone does it on the bar after the gap, eight times, and it is the move she named'`, `'each friend does a move in her own body: up lifts Þórseðla\'s head 2 m or more and both of Egill\'s hands over his head; hop takes Egill\'s feet 0.3 m or more off the ground and none of Grameðla\'s'`, `'Grameðla\'s stomp lands on the beat, within a frame'`, `'the dance is a function of the beat: the same beat gives the same pose whatever came before, and nothing jumps more than 12 degrees or 0.2 m in a frame at 30 frames a second'`, `'the constellations dance with them: in the hop each friend\'s constellation rises and falls with her, and in up Þórseðla\'s head star climbs'`, `'nobody\'s feet leave her stand: every root stays within 1.5 m of it through the dance'`, `'the dance module imports nothing of chapter 5\'s'`.
- [ ] **Step 2:** Run `hatid-party.test.mjs`; see it fail. **Step 3:** Implement. **Step 4:** Run; see it pass, with `hatid.test.mjs`. **Step 5:** Commit: "hátíð: the called dance, each in her own body, the constellations with them".

### Task 16: The band and the six solos

**Files:**
- Create: `remake/chapters/hatid-band.js`
- Modify: `remake/chapters/hatid.js`, `hatid-guests.js`, `hatid-score.js` (the solos' shots)
- Test: `remake/tests/hatid-party.test.mjs`

**Interfaces:**
- Consumes: `cuesIn`, `entered`, `soloAt`; `addPlateGlow` (`setRow`, its `uPlateGlow` colour); the Fen's fish (`world/critters/models.js`, as `chapters/tjorn3d/cast.js` draws it); `berryGeometry` (`world/props/berries.js`); the clips `fly`, `glide`, `call`, `roar`; `stage` (Task 14); `top.sea.ripples`; `guests`.
- Produces:
  - `ROLES`, each a pure function of the beat laid over the dance: Grameðla the bass drum (every `stomp` cue: her foot, a tremble of the camera unless reduced, a ripple on the sea, a step of light in the floor); Kambeðla the light show (her plates blink row by row on `plate` cues, and four small lizards sit along her back and strike them like a xylophone); Uggeðla beats time with her tail on `tail` cues and her sail changes hue a bar (`addSailGlow(actor)`: as `plate-glow.js`, the sail found on her own skin as the vertices more than 0.5 m over her spine's bones in the bind pose; if that mask is rough, a row of light points along the sail's edge instead: decide from a still); Þórseðla the light tower (her neck swaying, the fireflies up it); Flugeðla the DJ beside Slóeðla (a wing scratching a flat stone on `scratch` cues, her head nodding); Slóeðla the lead (her horn up on every `horn` cue, turned to whoever she calls); Mosi and Egill in front.
  - `SOLO_TRICKS`, 16 beats each, `trickOf(who, u, out)`: Kambeðla's plates run through every hue, a row at a time; fish leap out of the sea of cloud beside Uggeðla (five arcs) and she snaps one out of the air on beat 12; Þórseðla's head goes up into the strings of lights and red berries rain down (60, one instanced mesh); Flugeðla takes off, laps the top once (a circle of 32 m, her `fly` clip driven by the beat) and her wind blows the fireflies after her; Slóeðla's horn solo, her crest lit note by note; Grameðla: three stomps and a roar, and three giant prints light in the floor.
  - `createBand(c)` → `{ update(beat), dispose() }`. In a solo the others keep the groove at half its size and look at the soloist.
  - `CAMERA`'s solos: `solo_<who>` on each solo's first beat, one more angle at its ninth, and the trick's own moment in frame (the fish, the berries, her lap, the prints).

- [ ] **Step 1: Write the failing tests:** `'everyone has a part and plays it on her cues: Grameðla\'s foot is down on every stomp cue, Uggeðla\'s tail on every tail cue, Flugeðla\'s wing on every scratch, Slóeðla\'s horn up on every horn cue'`, `'a friend plays only once she has entered: before her entry she stands and watches'`, `'the six solos come in the map\'s order, each with the spotlights and a close shot on her from its first beat'`, `'each trick is seen: Kambeðla\'s plates show six hues or more; a fish is in Uggeðla\'s jaws on beat 12; berries fall past Þórseðla\'s head; Flugeðla is back on her stand by her last beat; three prints are lit after Grameðla\'s third stomp'`, `'a solo shot holds its trick in frame, wide and upright, and no more than three big friends'`, `'in a solo the others dance at half the size and look at the soloist'`, `'the band is a function of the beat, and nothing jumps in a frame'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with the suite. **Step 5:** Commit: "hátíð: the band's parts and the six solos".

### Task 17: The quiet moment, the last chorus, and the camera's final cut

**Files:**
- Modify: `remake/chapters/hatid-stage.js`, `hatid-band.js`, `hatid-score.js` (`CAMERA`, `FIREWORKS`), `hatid.js`
- Test: `remake/tests/hatid-party.test.mjs`, `remake/tests/hatid.test.mjs`

**Interfaces:**
- Consumes: `sky.shoot`, `sky.aurora`, `sky.set` (Task 9); `constellations.set(key, { breath })`; `moonPose` acts `rock`, `askew`, `fixHat` (Task 11); `cuesIn('burst' | 'roar', …)`; `FRIENDS`' hues; `LIMITS` and STYLE.md §8's camera speeds; `kafli5-video.test.mjs`'s camera tests as the model.
- Produces:
  - The quiet part: the spotlights out, the fireflies loose and slow, the constellations breathing (one breath in four bars), the moon rocking slowly and blinking, everyone swaying; the camera on `sky_dance` and one slow push.
  - The last chorus: everything on at the first beat. `FIREWORKS` (pure, from the map's `burst` cues): each a shooting star that crosses the sky over two beats and bursts on its cue in a friend's hue, the six hues in turn, never more than `NIGHT.shooting` at once; `auroraAt(beat)` (up over the first bar of the chorus, waving on the bar, down over the chord). Grameðla roars on each `roar` cue (her `roar` clip set to end on it; the sea ripples; the moon's hat goes askew and its hand puts it right). The moon rocks on the beat with its hand on its hat.
  - The chord: everyone stops in an end pose on its first beat (`END_POSE` a friend: Egill's arms up, Mosi's head high, Þórseðla's neck straight up, Flugeðla's wings wide, Kambeðla's plates full, Uggeðla's sail lit, Slóeðla's horn up, Grameðla's jaws open at the sky) and holds it while the chord and the lights die over the tail.
  - `CAMERA`, final: directed as a concert video: wide shots of all (inside `BUDGET.wideBars`), close ones in the solos, every cut on a beat, a shot a bar long at least but for `quick` runs of two beats in the last chorus, no cut inside a call's gap (Slóeðla is in frame when she calls), Egill in frame doing each move long enough to copy, the sky in frame for at least two bursts and for the northern lights.

- [ ] **Step 1: Write the failing tests:** `'the quiet part: no spotlight, no stomp, the constellations breathe and the moon rocks'`, `'the last chorus is the biggest: more light than any part before it (the stage\'s state summed), every burst on its cue in a friend\'s hue, the northern lights up'`, `'Grameðla roars on the map\'s roar cues, and the moon\'s hat is askew after each and straight again within two bars'`, `'on the chord everyone holds her end pose from its first beat to the end of the tail, and the stage\'s light is under a tenth of its most when the tail ends'`, `'the camera is cut to the song: every cut on a beat, a bar or more but for the quick ones, none in a call\'s gap, every solo close, every wide shot inside the budget'`, `'Egill is in frame, whole, for four dance beats or more of each called move'`, `'every move of the camera is slow enough for the style and over before the next cut'`, `'reduced: bursts are glows, the northern lights stand, the camera only cuts'` (Review Focus 4), `'never two lifts or bursts of light inside half a second'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement. **Step 4:** Run; see them pass, with the suite (and Task 5's "the party on the tile is the party in the chapter", "taps change nothing").
- [ ] **Step 5:** The whole party from the tile at 1280x800 and at 800x1280, with sound and `--stats`, and phone copies; stills at both sizes of each solo's trick (6), the quiet part, a burst over the stage, the northern lights, the end pose; bench every shot of `CAMERA` once at both sizes (a table in `qa/remake/hatid/butur6/maeling.md`); the group still the ride back asks for (`party_wide` on the first beat of the chorus, 1600x1200) saved as `qa/remake/hatid/butur6/hopmynd.png`.
- [ ] **Step 6:** Commit, progress note. **Show the owner and stop:** the two party videos and the ten stills, with the worst shot's numbers. Ask: the dance (can Egill dance along?), the calls' words and which moves (spec §12), each solo, the quiet moment, the fireworks and northern lights. **Wait for his yes.**

## Chunk 7: The seventh star and the end

### Task 18: The seventh star, the lift, Mosi staying, and the hand-over to the ride

**Files:**
- Create: `remake/chapters/hatid-seventh.js`
- Modify: `remake/chapters/hatid.js`, `hatid-ride.js`, `remake/engine/riding.js`, `remake/tools/hatid-lag/render.mjs` (the motif's candidates), `remake/tools/hatid-song.mjs`
- Test: `remake/tests/hatid.test.mjs`, `remake/tests/riding.test.mjs`

**Interfaces:**
- Consumes: `floatTo` (it sits him on the seat for its last 0.6 s); the hero butterfly's model `assets/critters/butterfly.glb` as `chapters/tjorn3d/cast.js` loads and poses it (the forest's `HERO` in `world/forest/butterflies.js` needs a forest, and the top has none); `createBeams`; `constellations.set(key, { look })`; `moonPose` acts `oh`, `wave`; Egill's `lifted` and `wave` clips; `SKY.seventh`.
- Produces:
  - `floatTo(..., { sit = true })`: with `sit: false` he keeps `lifted` to the end and is held at the seat's point, not sat on it.
  - `SEVENTH = { colour: '#c8ff5e', seconds: { near: 8, lift: 9 }, height: 14 }` (a hue none of the six has; first values). `createSeventh(c)` → `{ show(level), near(u), light(u), point, dispose() }`: the unknown star at `SKY.seventh`, blinking, coming nearer (growing), and a soft cone of its light falling on Egill (`createBeams`, with a disc where it lands).
  - `createMoth(world, { horn })` → `{ ready, sitOn(point), follow(point, time), dispose() }`: the hero butterfly sitting on Mosi's horn from the festival's first frame and, as Egill rises, flying up round him.
  - The motif: `render.mjs --stef` writes three candidates of a few bright, strange tones outside the song's scale (`qa/remake/hatid/lag/stef/a|b|c.mp3`); the owner's pick is carried to `assets/audio/hatid/seventh.mp3` with its notes in `song.json` (`seventh: { src, notes: [Hz], seconds }`: the ride back ends on its two last tones).
  - Scene 4 whole: the song over, everyone cheers and the stage's lights sink to a third (`stage.rest(level)`), the fireflies drift; all to `gather`; `h_mosi_thanks`. `h_thorsedla_more` with her head high; the seventh shows and nears while the motif plays; every constellation turns its head to it (`look`), the moon's mouth is "o". Its light falls on Egill; he rises slowly (`floatTo` a seat `SEVENTH.height` m over him, `sit: false`, `SEVENTH.seconds.lift`), laughing: `h_egill_fly`, `h_mosi_where`, `h_egill_bye` with his `wave`; Mosi, surprised and not afraid, waves with the others and calls `h_mosi_find`; the moth leaves his horn and follows; the moon waves. `s.journal.seen('hatid')` as his feet leave the ground. The camera follows him up (`lift_side`, then `rise_down`: the top small and glowing below, an island of light in the sea of cloud), and with no fade `yield* ride(s, c, hand)`; when it returns, `s.journal.open('dinosaurs')`.
  - `export function* asLifted(s, c)`: everything as it is the moment the ride takes over, set at once behind the black (the night, the full sky, six constellations, the moon up, the stage's lights at rest, everyone at `gather` waving, Egill in the light at `SEVENTH.height`, the moth with him): what `chapters/ferdin.js` calls before `ride`. `hand` as Task 5 has it, now whole.

- [ ] **Step 1: Write the failing tests:** `'floatTo with sit false ends with him held at the point in his lifted pose'` (riding.test.mjs), `'the seventh star is none of the six friends\' hues, and it shows only after Mosi\'s thanks'`, `'every constellation\'s head turns to it and the moon\'s mouth is "o"'`, `'Egill rises slowly (never over 2 m/s), waves, and says his two lines; Mosi stays on the ground, waves and says he will find him'`, `'the moth sits on Mosi\'s horn from the first frame to the lift and is within 3 m of Egill from then on'`, `'the ride is handed everything it needs (egill, moth, mosi, top, sky, constellations, moon, the seventh\'s place and hue) and the screen is never black between the lift and the ride'`, `'asLifted gives the state the played festival has at the hand-over: everyone within 0.2 m and the same light'`, `'no tap changes anything after the song: a child tapping through scene 4 gets the untouched play'`.
- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement with the first motif candidate. **Step 4:** Run; see them pass, with the suite. **Step 5:** Commit: "hátíð: the seventh star, the lift and the hand-over to the ride".

### Task 19: The save, the order of the chapters, the book's tile and the seventh slot

**Files:**
- Modify: `remake/engine/save.js`, `remake/engine/book/cards.js`, `remake/engine/book/videos.js`, `remake/engine/scene/journal.js`, `journal-data.js`, `scene.js`, `remake/style.css`, `remake/chapters/kafli6.js` (`next: 'hatid'`), `remake/assets/book/videos/veisla-thumb.webp` (a still of the party)
- Test: `remake/tests/save.test.mjs`, `kafli6.test.mjs` (its `next` and `defaultChapter` cases), `journal.test.mjs`, `cards.test.mjs`, `book.test.mjs`, `hatid.test.mjs`

**Interfaces:**
- Consumes: `defaultChapter(save)` (now `kafli6` once `k5_sloedla` is there, for ever); `matchesUnlock` (`cards.js`: `start`, `found`, `place`, `fossil`, `star`); `BOOK_SHOWS`, `isVideoUnlocked`, `videoSeenId` (`videos.js`); `save.addSeen`; `onwardChapter`, `chapterDone`, `storyChapter` (`engine/book/map-chapters.js`: `hatid` is no row of its table, so it is never "played again" and has no place on the map); the journal's `slots`, `render`.
- Produces:
  - `journal.addSeen(id)` and `s.journal.seen(id)`: `save.addSeen(id)`, once, and the book refreshed.
  - `defaultChapter(save)`: `hatid` when `k5_sloedla` and `k6_gramedla` are both in the stars and `hatid` is not in `seen`; otherwise as today (so a save that has seen the festival opens chapter 6 again, and "Áfram" at its end leads to the festival). `kafli6.chapter.next === 'hatid'`; `hatid.chapter.next === null`.
  - `matchesUnlock`: `'seen' in unlock` → `state.seen` has it. `BOOK_SHOWS` gets `{ id: 'veisla', name: 'Stjörnuhátíðin', title: 'Stjörnuhátíðin', chapter: 'veisla', poster: videoUrl('veisla-thumb.webp'), hue: '#3d4f9a', unlock: { seen: 'hatid' }, label: 'Stjörnuhátíðin, veislan úr leiknum' }`, after "Djamm skógarins"; "Nýtt!" until it has been opened, as the videos.
  - `SEVENTH_SLOT = { key: 'seventh', colour: SEVENTH.colour }` in `journal-data.js`, beside `FRIENDS`, which stays six in its order. The journal draws a seventh, empty slot after the six once `hatid` is in `seen`: an outline that blinks slowly (`.star-slot.unknown` in `style.css`; steady with reduced motion), never `earned`. Every other place that draws the six from `FRIENDS` (grep `FRIENDS` in `engine/book/` and `engine/scene/`) is left as it is.

- [ ] **Step 1: Write the failing tests:**

```js
test('the save opens the festival after Grameðla\'s star until it has been seen, and keeps every earlier answer', () => {
  const SIX = ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla', 'k5_sloedla', 'k6_gramedla'];
  const cases = [[[], [], 'kafli1'], [SIX.slice(0, 4), [], 'kafli5'], [SIX.slice(0, 5), [], 'kafli6'], [SIX, [], 'hatid'], [SIX, ['hatid'], 'kafli6'],
    [[...SIX.slice(0, 4), 'k6_gramedla'], [], 'kafli5'], // Grameðla's star alone does not skip Slóeðla
    [SIX.slice(0, 5), ['hatid'], 'kafli6']];
  for (const [stars, seen, want] of cases) assert.equal(defaultChapter(saveWith(stars, seen)), want, `${stars.length} stars, seen ${seen}`);
});
test('kafli6 hands over to the festival, and the festival to none', ...);
test('the festival gives no star: six before, the same six after, in the same order; hatid is in seen once, from the moment Egill lifts', ...);
test('a child who leaves during the ride has still seen the festival', ...); // the run stopped 2 s after the lift: seen has hatid
test('seen a second time: no star, hatid once, the six as they were', ...); // Review Focus 5
test('the tile Stjörnuhátíðin is a "?" until hatid is seen, opens with Nýtt! after, and plays the chapter veisla', ...);
test('the six slots are as they were; the seventh comes only when the festival has been seen, after them, empty', ...);
test('an old save loses nothing: its stars, places, finds and seen are all there at the end', ...);
```

- [ ] **Step 2:** Run; see them fail. **Step 3:** Implement; capture the tile's poster from `?chapter=veisla&t=…`. **Step 4:** Run; see them pass, with `npm run test:remake`.
- [ ] **Step 5:** A whole play: chapter 6's last scene, "Áfram", the festival to the end of the stub ride and the book, at 1280x800 with sound, and a phone copy; the three motif candidates on a small listening page (`qa/remake/hatid/lag/stef/index.html`); stills at both sizes of the seventh star nearing, Egill in its light, Mosi waving, the top from above, the book with its seventh slot, and the Myndbönd page with the tile locked and open.
- [ ] **Step 6:** Commit, progress note. **Show the owner and stop:** the whole play, the motif page, the eight stills. Ask: is the lift glad enough (a six-year-old must not think Egill was taken); the seventh star's hue; which motif; and his three open proposals, now that he can see them: the festival recorded as seen when Egill lifts, the tile in the book, and what the game opens on once the festival has been seen (this plan: chapter 6, as today). **Wait for his yes.**

## Chunk 8: Lines and sounds

### Task 20: The sounds

**Files:**
- Create: `remake/tools/hatid-sounds.mjs` (as `kafli6-sounds.mjs`: `--list`, `--fetch`, the page, masters the picks into `assets/audio/hatid/hljod/`), `remake/assets/audio/hatid/CREDITS.md`
- Modify: `remake/engine/audio/sfx.js` (`SAMPLES`), `remake/chapters/hatid.js`
- Test: `remake/tests/sfx.test.mjs`, `remake/tests/hatid.test.mjs`

**Interfaces:**
- Consumes: `SAMPLES`, `preloadSamples`, `s.sfx(name, { level, pan, rate })` (`engine/audio/sfx.js`); the sounds the game has (`gramedlaRoar`, `gramedlaThump`, `mountainWind`, `float`, `star`, the horn, wing beats, the small animals' calls); `cuesIn('burst' | 'roar', …)`; `kafli6-sounds.mjs`'s page (which saves `hljod-val.json`).
- Produces: the owner's listening page `qa/remake/hatid/hljod/index.html` with 3 to 4 candidates each for: the party blower (the moon's „Tút!“), small animals cheering (a layered crowd of real animals' calls and claps, not people's voices alone), a firework's soft burst and crackle (far off, no bang that could frighten), a big stomp on rock if `gramedlaThump` does not carry, and a hush of wind on a mountain top if `mountainWind` is too rough for the silence. Samples `partyBlower`, `cheer`, `starBurst` (and `topWind`, `bigStomp` if picked), each with a made sound `instead` until its file has decoded. The top's own sound: `mountainWind` soft from the first frame, the forest only faintly far below; in the silence after the sun nothing but the wind; in the party nothing but the song and, on its cues, `starBurst` (level by the burst's place in the sky, never over the song) and `cheer` at the first beat of the last chorus and after the chord.

- [ ] **Step 1:** Make the candidate list (name, author, licence, source, size of each). **Ask the owner before any download.** Fetch what he allows, build the page, send the link (localhost only).
- [ ] **Step 2: Write the failing tests:** `'every festival sample has its file, a made sound instead, and a line in CREDITS.md with its author and licence'`, `'the silence is silent: from the sun going under to Mosi\'s whisper no music and no sound plays but the wind'`, `'the moon\'s Tút is the blower and no line'`, `'a burst sounds on its cue and never louder than 0.5; no sample plays in the party but on a cue of the map'`, `'no line is said over the song but Slóeðla\'s calls, each in its gap'`.
- [ ] **Step 3:** Run; see them fail. **Step 4:** Implement on his picks. **Step 5:** Run; see them pass. **Step 6:** Commit: "hátíð: the picked recordings".

### Task 21: Every line

**Files:**
- Modify: `remake/assets/audio/hatid/lines-source.json` (every `WORDS` line, `[{ id, speaker, text }]`), `remake/tools/audio-lines.mjs` (`hatid: 'remake/assets/audio/hatid'` in `SETS`); `remake/assets/audio/lines.json`, `voices-made.json`, `heard/` (written by the tools)
- Test: `remake/tests/hatid-lines.test.mjs` (as `kafli6-lines.test.mjs`); `voice-lines.test.mjs`, `heard.test.mjs`, `pronunciation.test.mjs` stay green

- [ ] **Step 1: Write the failing tests:** `'every festival line is a line of the hatid set with the same words, its id h_<speaker>_<name>, named for its speaker; Grameðla has none'`, `'every festival line has its recording, in lines.json and in voices-made.json, with a mouth that opens'`, `'each of Slóeðla\'s four calls is shorter than its gap in the song'`. Run; see them fail.
- [ ] **Step 2:** `node remake/tools/voice-lines.mjs --dry --set hatid`; read every note (REJECTED, "fixed on its own line"; Ný 3 named under each of Mosi's eleven). Words without a book entry (Stjörnuhátíð, stjörnunni, sumarsins, Gleðilega, Vinkaðu, flýg) get one with a `hratt` recipe, with node only. `h_mosi_first` is a whisper and `h_thorsedla_more` trails off: each carries `"fixes": "line"` or `"punctuation"` with its note if it needs a say or a context of its own.
- [ ] **Step 3:** Record: `node remake/tools/voice-lines.mjs --set hatid`, then `node remake/tools/audio-lines.mjs`. Measure the four calls against their gaps (one bar); a call that is longer is made again shorter, never sped up. Run the lines test; see it pass.
- [ ] **Step 4:** His yes/no page (`node remake/tools/voice-lines.mjs --yesno hatid`) and a whole-festival video with sounds and lines. Import his `jano-hatid.json` with `node remake/tools/heard.mjs` and commit what it writes; 3 to 4 candidates for each line he rejects; `--plan` clean.
- [ ] **Step 5:** Commit. **Show the owner and stop:** `http://localhost:4350/qa/remake/voices/janei/hatid.html` (25 lines), the sounds in the video, and the calls heard over the song. **Wait for his yes on the lines and the sounds.**

### Task 22: The measurements, the whole suite, and the whole festival

**Files:**
- Modify: whatever the measurements ask of `hatid-route.js` (`BUDGET`) and `hatid-score.js` (`CAMERA`)
- Test: `npm run test:remake`

- [ ] **Step 1:** Bench every key shot at 1280x800 and 800x1280 on the `tablet` preset (≤ 6.0 ms, ≤ 100 calls, ≤ 250k triangles): the five arrivals, `lineup_sun`, `stars_wide` with the full sky, every shot of `CAMERA`, `gather`, `rise_down`; the start button's wait; the whole chapter's `--stats` (no second under 30 frames). A shot over the budget takes spec §10's fallbacks in Task 6's order; if `party_wide` still does not hold, stop and tell the owner with the numbers.
- [ ] **Step 2:** `npm run test:remake`, all green; spec §10's five proofs named one by one in the progress file with the test that holds each.
- [ ] **Step 3:** Two whole videos from chapter 6's last scene through the hand-over to the book (`qa/remake/hatid/butur8-ekkert`, `butur8-pikk`) with phone copies, and the party alone from the tile at 800x1280.
- [ ] **Step 4:** A last read of the whole branch against the spec, section by section (no reviewer agents); `git diff --stat main` and `git ls-files --eol` checked for every touched file; `git status` shows nothing of `qa/` or of the song's raw material.
- [ ] **Step 5:** Commit, progress note. **Show the owner and stop:** the two whole videos, the upright party, the table of measurements. When he approves, ask him about merging `hatid` into main and pushing; nothing is deployed without his own word. Note for the ride back's plan, in the progress file: the three sky files, `asLifted`, the hook `chapters/hatid-ride.js`, the group still `qa/remake/hatid/butur6/hopmynd.png` and the stems listed in `assets/audio/hatid/song/SOURCES.md`.
