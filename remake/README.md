# Mosi remake

A cinematic remake of the game, built one chapter at a time next to the current game in `dist/`.
Plain ES modules on three.js r180 (`dist/vendor/`), no build step, works offline.
The look is set by [STYLE.md](STYLE.md); the plan and its decisions live in the plan doc.

## Run it

```bash
node remake/tools/serve.mjs
```

Then open http://127.0.0.1:4190/remake/ (add `--lan` to reach it from a tablet on the same Wi-Fi).

| Parameter | Effect |
|---|---|
| `chapter=grunnur` | which chapter module in `chapters/` to load (default `grunnur`, the foundation test scene; `kafli1` is chapter 1, Boð til kambeðlunnar; `lineup` puts the characters side by side for look checks) |
| `quality=low\|tablet\|high` | quality preset (default `tablet`) |
| `look=morning\|golden\|evening` | override the chapter's light |
| `shot=hero` | hold a static review shot instead of playing the scene (silent; in the start place) |
| `t=12` | seek to 12 s and freeze (deterministic captures; silent, and the save stays in memory, so a capture never changes the child's progress) |
| `play=1` | start at once, without the start button |
| `orbit=1` | free camera instead of the director |
| `debug=1` | frame stats, scene time and camera mode |

## Litla Yatzy við Mosa

The simplified game is at `/remake/yatzy-junior.html`:
`npm run start:yatzy-junior`, then open http://127.0.0.1:4197/remake/yatzy-junior.html.
It has five cards: one pair, two distinct pairs, three alike, the 1–5 straight,
and Yatzy. Each player uses each card once over five rounds, with up to three
rolls per turn. Points are counted automatically from the matching dice; the
straight gives 15 and Yatzy gives 50. No Chance, upper section or bonus. A
nonmatching card can be closed for zero after confirmation.

The existing Mosi table, autonomous black cup, close dice camera, models,
animations, effects and sound effects are shared. Both players' totals stay
visible beside five illustrated goal cards. The full game below remains intact.
Junior's save and preferences use their own `mosi.yatzy.junior.*.v1` keys.

The lesson uses one centered caption, then keeps it above the dice during actual
play. Spoken explanations advance on the recording's real end; action steps
advance when the child casts, keeps dice or chooses the correct card. Two
hold/reroll sequences provide repetition. There is no sequence of Next pages.
Practice hands use the real scoring and animation, never write the normal save,
and restore the exact committed hand when finished or interrupted.

All instructions, card explanations, feedback, points and results are recorded
Icelandic speech in the established Mosi voice, using ElevenLabs `eleven_v4`.
The 163 local MP3s include every reachable total; the short captions support the
spoken sentences. Replay, sound toggle, pause, tab visibility and mouth motion
follow the current recording. Menu narration starts with “Heyra Mosa” because
browsers require a gesture before playing audio. The static game needs no API
key. `engine/yatzy-junior/voice-lines.js` is the script;
`tools/yatzy-junior-voices.mjs` generates and verifies cached, mastered takes
using `ELEVENLABS_API_KEY` only in the local generation process.

`npm run test:yatzy-junior` covers all 7,776 dice hands, complete matches,
practice hands, save validation, narration lifecycle and real audio coverage.
`npm run check:yatzy-junior` exercises the voiced lesson, pause, mobile layout,
practice exit and a complete match in the browser. Captures and the report go
to `qa/yatzy-junior/`.

## Yatzy við Mosa — full rules, preserved

The table game is at `/remake/yatzy-mosi.html`. Run `npm run start:yatzy-mosi`
and open http://127.0.0.1:4197/remake/yatzy-mosi.html.
It uses this remake's real Mosi model, eyelids, actor control, forest, lighting,
character illustrations and Nunito font. Its source is in `engine/yatzy-mosi/`;
the earlier Slóeðla game in `engine/yatzy/` is separate.

Five rounded 3D dice, enlarged by 18%, carry both numbers and dinosaur pictures. A black textured
Yatzy cup has opaque walls, an open mouth, a thick rim and dark felt inside.
The cup floats above the middle of the table without a hand. A soft halo and
glints invite a click when the human can throw; it parks to the left of the
result so it stays clickable without hiding dice. It collects and shakes the
unheld dice by itself, then releases them sequentially through its mouth. On a
new turn the cup glides back to the middle with the dice already inside. Gravity
trajectories, decreasing rebounds, continuous rotation and
frictional settling lead to the rules engine's already committed result; this
is authored motion, not a general rigid-body simulation. Visual variation never
consumes gameplay randomness. The actual upward faces match the scored hand.

After each throw, Mosi reacts before the camera moves above the dice and smoothly
dollies in to their actual settled layout. Holding a die gently reframes its
destination; both held rows stay clear of controls on desktop and mobile. The
parked cup shrinks to about half its throwing size and moves to the near-left
side. Its tight hit area follows the actual cup silhouette, with dice taking
pointer priority and an extra near-die guard against accidental rerolls. Its
invitation stays inside the cup outline and hides while the result camera or a
held die is moving; the separate roll button remains available.
The camera returns across the table for the next throw or score, freezes in
pause, and snaps in reduced-motion mode. Mosi's anticipation, good/great casts,
near misses, disappointment and Yatzy celebrations have distinct head, jaw,
eyelid, body and paw gestures. Feedback uses the current player's open score
categories. Mosi watches the autonomous cup with a smooth gaze and planted
forelegs; celebratory paw taps happen after the throw.

One frame loop drives the character, cup, dice, camera and forest. Projected
hit targets reuse their records, update labels only on game state changes, and
move through cached CSS transforms without per-frame layout reads. Number badges
and hold marks sit outside each die's projected silhouette, keeping its artwork
clear while the camera moves. Two bounded
instance pools provide felt dust, contact waves, release glints and celebrations.
Web Audio provides muted cup thuds, dice rattles, felt impacts, hold notes and
different good/bad result cues. Enabling calm mode clears active effects and
finishes the current throw without another shake.

Both totals and score columns remain visible. On a narrow screen the board is
above a scrolling scorecard. Click dice or press 1–5 to hold/release; use the
floating cup, roll button or Space to throw, then choose an open score cell.
Zero scores ask for confirmation. The pause menu offers reduced motion and a new game. Progress
and preferences save locally, including a roll committed before its animation,
so reloading does not grant another throw. Dialogs and hidden tabs pause the game.

“Læra með Mosa” opens a hands-on Icelandic lesson from the welcome screen or Help.
Its original instructions and illustrated examples cover the complete rules:
two guided turns teach casting, keeping and releasing dice, repeating a hold,
using three rolls, scoring early, and taking turns with Mosi. Small visual
questions explain every score category, Chance, the upper bonus, used rows and
zero scores. A wrong answer gives a gentle hint and another try. The coach stays
beside the table, highlights only the required control, waits for camera motion,
and supports mouse, touch and keyboard. Children can exit at any step or repeat
the lesson at the end. Teaching hands are selected examples using the real rules,
models and animations; practice never writes to the normal game save. Exiting
restores the committed normal hand, including when the lesson was interrupted.

Rules follow the Scandinavian 15-category game: three rolls, 50 bonus points at
63 in the upper section, exact 3+2 full house, and 50 for Yatzy. Pair and kind
scores count only the matching dice. See the [Alga Yatzy rules](https://algaspel.se/wp-content/uploads/2023/10/yatzyrese.pdf).
Mosi uses the same visible hand and rules, without inspecting future random rolls.

`npm run test:yatzy-mosi` checks scoring (all 7,776 hands), complete AI matches,
controller transitions and saves, real model poses, dice orientation/contact,
particle limits, sound lifecycle and disposal. With the server already running,
`npm run check:yatzy-mosi` runs normal browser interaction, camera/cup/reaction
captures, independent mesh/overlay readability and near-edge cup/dice tap checks,
complete teaching flows with save-preservation checks, a complete match with
reloads, and a hardware-rendered frame-time/resource
check, sequentially. The performance report separates dice rolls and both camera
transitions, and compares resource counts only after returning to the same view.
These browser tools require Playwright (or `PLAYWRIGHT_PATH` pointing to its
installed package), and Edge on Windows. They write reports and screenshots under
the ignored `qa/yatzy-mosi/` directory. The `?qa` URL enables their inspection hooks;
the normal game does not expose them. Frame-time results are device-specific.

## Layout

- `engine/`: clock, renderer, looks, lighting, fog, sky, wind, stats, actors and their footing
  (planted feet that never slide, on four legs or two: walking, stopping, standing and turning on
  the spot), eyelids that blink (`eyelids.js`), talking (`talk.js`: the jaw and head follow the
  voice), point specs; the sun's shadow map as a depth texture (`shadows.js`), and characters'
  distance LODs and low-poly shadow casters (`character-lod.js`, made by `simplify.js` in a worker).
  Also: a chapter's places, switched under a fade (`locations.js`); what the child has earned, kept in
  the browser and in memory when storage fails (`save.js`); the saddle that pops onto Mosi's back,
  Egill's float up into it and down again, and riding (`riding.js`); short-lived things on the game
  clock, such as a burst of sparkles (`effects.js`, updated after the actors); Kambeðla's plates
  lighting row by row (`plate-glow.js`); the smiling sun, which blinks, changes its mouth and waves or hugs itself
  with two cartoon hands, and the cloud shaped like Mosi (`sun-face.js`); the beat clock, the theme's tempo as a pure function of the music's time
  (`beat.js`: `followBeat`, the beat count the forest's waves and the flowers' nod and the mushrooms'
  hop ride, which follows the music's grid without jumping when the playhead jumps); the warm-up draw
  that builds every shader behind the black before it is seen (`warm-up.js`); and a guard that keeps
  one failing part of a frame from stopping the rest (`guard.js`).
- `engine/input/pointer.js`: taps on named targets in the world (spheres round point specs) and drags.
- `engine/hand-hold.js`: hands that hold something, each wrist reaching its point by two-bone IK laid over a
  character's own pose after the actors update (Egill's two hands on his posy).
- `engine/camera/director.js`: the camera director, with the child's free look (`explore`, `look`, `hint`).
- `engine/scene/`: the scheduler, the scene API, captions and choices, voice playback; the search
  with its hints (`search.js`), the explorer's journal (`journal.js`, whose button opens the book in
  `engine/book/`), the star that rises
  to be tapped (`star-sprite.js`).
- `engine/audio/`: the theme, streamed from `assets/audio/theme.mp3` and lowered under the voice
  (`music.js`); the sound effects, made in Web Audio as in the old game (`sfx.js`); what holds the
  sound while the book is open or the tab hidden (`hold.js`); the one audio context (`output.js`).
- `engine/book/`: the book, Egill's journal opened over the paused game; its look is `book.css`. `book.js` is the shell
  (the spread, the ribbons that turn its pages, the close, the Stjörnur page); `animals-page.js` the animals page, a taped
  photo of each animal that is found, new or an unfound silhouette; `card-viewer.js` a card that grows out of its tile, a
  picture and a sentence at a time, read aloud; `zoom.js` a picture taken to the whole screen, with pinch and drag; `fx.js`
  the squash, sparkle and sound of every touch, counting a tap as the game does; `book-audio.js` the book's own narrator and
  effects, and `book-sounds.js` the effects, made with the game's tools in the theme's key; `cards.js` and `media.js` read
  and check its data (`parseCards`, `parseManifest`, `checkMedia`). Under reduced motion it moves as fades.
- `world/forest/`: the forest system (`createForest(world, layout)`), with the clearing's pale
  butterflies as tap targets (`butterflies.js`).
- `world/props/`: the glow flowers (`glow-flower.js`), sparkle bursts and trails (`sparkles.js`),
  the pollen when Mosi sneezes (`pollen.js`: `pollenBurst(world, point)`) and the footprints his feet
  press into the path (`footprints.js`).
- `world/critters/`: a frog, a snail, a beetle and little birds the child can tap (`critters.js`, the
  models in `models.js`).
- `chapters/`: one module per chapter: layout (or locations), actors, cast, lines, shots and the
  script. `kafli1.js` is chapter 1.
- `assets/`: models and generated data (`assets/audio/lines.json` holds every recorded line's length
  and its mouth track, the voice's loudness 20 times a second; `tools/audio-lines.mjs` makes it), and the
  typeface in `assets/fonts/`: Nunito (`nunito-latin.woff2`, the Latin subset of Google Fonts' variable font, with
  every Icelandic letter; both pages preload it) and its licence `OFL.txt` (SIL Open Font License 1.1), which must
  stay beside it wherever the font goes.
- `assets/book/`: the book's data. `cards.json` has the seven cards, page by page (each page's picture, text, narrator's
  line and the sources of its facts); `media-manifest.json` lists every picture with its licence, credit and source
  (`tests/media.test.mjs` runs `checkMedia`: an outside picture needs its credit, open licence, source and sha256, and every
  picture is at most 1024 px and JPEG or WebP); `images/` holds the pictures, each with a 320 px thumbnail, the game's own
  renders of Mosi and Kambeðla among them (`tools/bake/book-render.html`); `lab/` holds the lab's placeholder drawings.
- `assets/audio/book/`: the narrator's lines for the cards (`book_<card>_<page>.mp3` and `book_find_me.mp3`) and their texts in
  `lines-source.json`. `node remake/tools/voice-lines.mjs --set book` voices them with ElevenLabs, as it voices a chapter's
  lines, and their lengths and mouth tracks go into `assets/audio/lines.json` with the chapter's.
- `book-lab.html`: the book's lab page, never linked from the game: the real book over a stand-in for the forest, on the real
  cards, with a save in memory. `?state=animals|stars|card|zoom|info`, `?card=<id>&page=<n>` and `?found=all` open it where you
  want it, for `tools/capture.mjs`.
- `prompts/`: image prompts for new Tripo characters, following `design/mosi`.
- `tools/`: `serve.mjs`, `capture.mjs` (headless screenshots and GPU benchmark), `sound-check.mjs` (the sound in a
  real browser, 61 checks, on this computer or on the tablet over USB debugging), `audio-lines.mjs`,
  `theme-tempo.mjs` (measures the theme once: tempo, beat and key, into `assets/audio/theme.json`),
  `voice-lines.mjs` (voices a chapter's lines with ElevenLabs Eleven v3 from
  `assets/audio/kafli1/lines-source.json`, never making over a line marked `kept`, a take the owner
  chose by ear, whose MP3 must be there; and auditions voices),
  and for new Tripo characters `blender-decimate.py`, the bake tool in `bake/` (`bake-character.mjs`
  runs `bake-biped` for two-legged characters, `bake-tailed-biped` for tailed ones such as
  Grameðla and Uggeðla and `bake-quadruped` for four-legged ones such as Kambeðla, with `kind=sauropod` for
  long-necked ones such as Þórseðla, `kind=pterosaur` for winged ones such as Flugeðla and
  `kind=hadrosaur` for crested ones such as Slóeðla), the
  face pass `bake/face.html` that finds the painted eyes for the eyelids after every bake, the mouth pass
  `bake/mouth.html` that cuts a jaw for a character without one (Mosi's beak), `bake/book-render.html` that renders the
  book's pictures of Mosi and Kambeðla from their models (its header has the commands), and
  `prep-character.mjs` for static models (see STYLE.md section 12).
- `tests/`: `npm run test:remake`.

## Writing a chapter

A chapter exports `chapter` with `layout` (for the forest), `actors`, `cast`, `lines`, `shots` and
`script`. A chapter in several places gives `locations` (`{ name: { layout, shots } }`) and `start`
instead of `layout`: each place keeps its own shots clear of plants and says where its actors stand
(`layout.actors`), and `s.goTo(name)` changes places. The actors are the chapter's, in every place.
Shots are data: `{ position, target, fov }` or `{ position, frame: { subject, screen: [u, v] }, fov }`.
Positions, targets and subjects are point specs: `[x, y, z]`, `'mosi'`, `'mosi.head'`, `'camera'`
or `{ actor, part, offset, local }`, so a shot can follow a character. A walk can head for one too:
`walkTo` takes `[x, z]` points or point specs, read where they are when the walk starts, and walks
with the `walk` clip or another walking clip (`{ clip: 'wade' }`: Uggeðla wading in shallow water).
A chapter can also give `warmUp(world, { place })`, which returns `{ objects, shots, tray, dispose }`:
what to draw once where nobody sees a frame stall so nothing builds its shaders while the child watches
(the actors, and throwaways of what comes later), from which shots, and the tray's items. `place` is the
place it is drawn for (the start place behind the start button, another as main.js draws it or the scene
comes there, `null` for everything): a place can bring only what shows there first. A place adds its own
shots (`locations[name].warmUp`). `prepare: ['place']` builds a place once the start button shows, a slice
at a time (`world/forest/slices.js`), and draws it while the button still waits, so going there later is
only the two fades; `yield s.prepare('place')` waits for that build (a child who tapped before it was done
waits under the black), and `s.goTo(name, { hold })` keeps the black until the promise `hold()` returns
settles (models the chapter makes there). `later: { fetch, make }` is what main.js fetches as the button
shows and makes once the places are, if the button still waits (chapter 2's far friends), and `firstFind`
names the first animal the chapter puts in the book, whose drawing is shown once beforehand.

The script is a generator function. It yields what it waits for, and everything runs on the game
clock, so pausing, seeking and cancelling work:

```js
*script(s) {
  const mosi = s.actor('mosi');
  yield mosi.place(-12.5, 3.4, -19);
  yield s.camera.cut('opening');
  yield s.ready();                                   // the start button
  const walk = mosi.walkTo([[-6, 1.5], [0, 0]], { speed: 0.65 });
  yield s.all(s.fade(0, 2.5), s.camera.move('openingIn', { duration: 9 }));
  yield s.camera.follow('mosi', { offset: [4, 1.3, 5.4] });
  yield walk;
  yield s.say('mosi', 'welcome');                    // caption + recording, timed by lines.json; he talks
  const answer = yield s.choose([{ label: 'Já!', value: 'yes' }, { label: 'Seinna', value: 'later' }]);
  yield s.camera.orbit({ around: 'mosi', degrees: -50, duration: 8.5 });
}
```

| Call | Waits for |
|---|---|
| `s.wait(seconds)` or a number | scene time, with exact deadlines |
| `s.all(...)`, `s.race(...)` | every item, or the first (the rest are cancelled) |
| `s.camera.cut / move / orbit / push / lookAt / zoom` | the camera move; `follow` and `handheld` return at once |
| `s.actor(name).walkTo / turnTo` | arrival; `play`, `lookAt` and `place` return at once (a clip marked `once`, such as Þórseðla's `lowerHead`, plays once and holds its last pose) |
| `s.say(speaker, line)` | the line's length plus a short hold |
| `s.choose(options)` | the child's tap (in captures: the first option after 3 s) |
| `s.fade(level, seconds)` | the fade |
| `s.after(seconds, () => item)` | a delayed start; pass a function so a move starts late, not now |
| `s.ready()` | the start button |
| `s.goTo(name, { fade })` | a fade to black, the change of place (a place's forest is built the first time) and the fade back |
| `s.target(name, { point, radius })`, `s.onTap(name, fn)` | nothing: a tap target round a point spec (metres; `null` takes it away), and a function for every tap on it |
| `s.tap(names)` | the child's tap on one of the targets (seeking: the first after 2 s); race it with `s.wait` so it ends by itself |
| `s.lookAround(limits, seconds)` | the seconds, while the child's drags turn the camera within the limits |
| `s.search({ explore, targets, onFound })` | every target found by a tap; a hint every 12 s and, after three, found for the child (seeking: one every 3 s) |
| `s.drag(items, target, { radius, idle })` | a tray item (an id, or any of a list of ids) let go within `radius` px of the target on the screen: one id resolves `'dropped'`, or `'idle'` after `idle` s, when it leaves the tray; a list resolves `{ id, how }`, the item dropped or after `idle` s the first on the list (seeking: the first, after 2 s) |
| `s.star(id, from)` | the star rising from a point, tapped or left 8 s (seeking 1.5 s), and its flight into the journal |
| `s.found(id, from)`, `s.tray.show/hide`, `s.journal.open/close`, `s.sun.wink()` | nothing: an animal into the journal (a new one's picture flies from `from`, the tap's `{ name, x, y }`, into the book's button, or from the middle of the screen without it), the tray, the book open on its stars (a script's book, which pauses nothing until the child taps inside it), the sun's wink |
| `s.sun.wave()`, `s.sun.hug()`, `s.sun.mouth(shape, seconds)` | the sun's gesture, which starts at once: one hand up beside the face, four swings and down (2.3 s); both hands across the front of the disc, two squeezes and a grin (2.4 s); the mouth `'grin'` or `'oh'` until the smile is back after `seconds` (1.5 by default), or `'smile'` at once. A gesture asked for while another goes on begins when that one is over, a newer mouth cuts an older one short, and a mouth asked while a hug waits its turn leaves the hug its grin. A handle that is cancelled (a race lost, the scene stopped) drops a gesture still waiting its turn, and those behind it move up; a gesture under way finishes; a mouth goes back to the smile at once, through the in-between. Between them the sun smiles and blinks by itself every 3 to 6 s |
| `s.sfx(name)` | nothing: forest (a quiet loop, once), step, frog, snail, beetle, birds, butterfly, flower, plate, star, journal, saddle or float, each at least a short gap after the last of its name (flower 0.15 s, butterfly 0.25 s, critters 0.4 to 0.5 s) and at most 48 at once; silent while seeking |

The director warns in the console when a move breaks the STYLE.md speed limits or a shot is cut
shorter than 2.5 s. Moves without a `duration` pick the shortest comfortable one.

Sound and time: the theme's file, tempo and key are in `assets/audio/theme.json` (`src` is read
against theme.json: `theme.mp3`, 96 kbps, streamed through an `<audio>` element, so the host must
answer byte-range requests, as `serve.mjs` does). The music's playhead is the game clock's, and the
wind uniforms carry the beat: `uBeats`, the beat count, which the forest moves with smoothly (the
trees sway once in four beats, the ferns and bushes once in two, the grass ripples down the wind
every beat), and `uDance` for the flowers' nod and the mushrooms' hop on the strong beats. The count
follows the music's grid and eases back onto it within a beat or two when the playhead jumps (at the
first touch, where the theme loops), and is the grid exactly while seeking. So the forest moves in
time with what is heard, and a capture lands on the same beat. For a look inside a
running page: `window.__world`, `__scene`, `__director`, `__journal`, `__book`, `__save`, `__music`, `__sfx`
and `__audio`.

## The forest

`world/forest/` builds the whole environment from a chapter's `layout` (seed, clearing, forest
edge, path), deterministically. All look and density settings live in `world/forest/config.js`.
Plants come from a species registry (`species.js`): broadleaf trees, araucarias, tree ferns,
cycads, bushes, ferns, horsetails, flowers, mushrooms, rocks and a log, each built in code with
three detail levels, so a Tripo model can replace one kind later. The planner keeps every authored
shot clear (no trunk in the lens, no crowns or fronds right behind Mosi's head), and the forest
culls and picks detail per view, with separate low-detail meshes for the shadow pass.
A layout may also carry `glade: { ferns, shafts }` (a fern glade: a lusher rim of ferns, light shafts
landing in the clearing, leaf shadows), `leafShadows: true` (leaf shadows drifting over the floor) and
`actors` (who stands in that place, kept clear). The grass lies down and the ferns lean aside round a
footprint under each actor: Mosi-sized unless an actor sets `footprintScale` (Egill 0.3; a bigger friend
will want more than 1). Forest tools are in `tools/world/`
(`forest-round.mjs` captures the review set with figure-ground checks; `forest-stats.mjs` estimates
calls and triangles in Node, `--location <name>` for one place of a chapter with locations).
Reports and reviews are in `qa/remake/reports/`.

## Checking work

```bash
npm run test:remake
```

```bash
node remake/tools/capture.mjs --out qa/remake/shots/check --size 1280x800 --bench 120 --shot hero="shot=hero&t=2" --shot intro="t=31"
```

The budget for the tablet preset is in STYLE.md section 11: at most 6 ms GPU per frame at
1280x800 on the reference laptop, 100 draw calls, 250k triangles and 96 MB of textures.

```bash
node remake/tools/sound-check.mjs
```

checks the sound in headless Chrome as a child meets it: nothing before the first touch, the theme streamed and
looping, the book's pause, a hidden tab, a tablet waking from sleep, the voice ducking the music, every effect, and
silent captures. `--browser edge` uses Edge; its header says how to run it on the tablet's Chrome.

## Deploying

The page is static: serve the folder that holds both `remake/` and `dist/` (it reads `dist/vendor` and the
welcome line in `dist/assets`), as `tools/serve.mjs` does. The host, and any proxy, cache or service worker in
front of it, must answer byte-range requests for `remake/assets/audio/theme.mp3` with 206 Partial Content
(`Accept-Ranges: bytes`, `Content-Range`): Safari will not play the theme without them, and other browsers cannot
move it, so the music can no longer follow the game's clock (after the book, a hidden tab or a long frame it just
plays on, and the beat follows it instead). The theme must come from the page's own origin: it plays through Web
Audio, which hears silence from media on another origin without CORS.
