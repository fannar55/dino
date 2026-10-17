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
  lighting row by row (`plate-glow.js`); the smiling sun and the cloud shaped like Mosi
  (`sun-face.js`); the beat clock, the theme's tempo as a pure function of the music's time
  (`beat.js`: `followBeat`, the beat count the forest's waves and the flowers' nod and the mushrooms'
  hop ride, which follows the music's grid without jumping when the playhead jumps).
- `engine/input/pointer.js`: taps on named targets in the world (spheres round point specs) and drags.
- `engine/hand-hold.js`: hands that hold something, each wrist reaching its point by two-bone IK laid over a
  character's own pose after the actors update (Egill's two hands on his posy).
- `engine/camera/director.js`: the camera director, with the child's free look (`explore`, `look`, `hint`).
- `engine/scene/`: the scheduler, the scene API, captions and choices, voice playback; the search
  with its hints (`search.js`), the explorer's journal and its page (`journal.js`), the star that rises
  to be tapped (`star-sprite.js`).
- `engine/audio/`: the theme, streamed from `assets/audio/theme.mp3` and lowered under the voice
  (`music.js`); the sound effects, made in Web Audio as in the old game (`sfx.js`); what holds the
  sound while the book is open or the tab hidden (`hold.js`); the one audio context (`output.js`).
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
  and its mouth track, the voice's loudness 20 times a second; `tools/audio-lines.mjs` makes it).
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
  `bake/mouth.html` that cuts a jaw for a character without one (Mosi's beak), and
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
| `s.found(id)`, `s.tray.show/hide`, `s.journal.open/close`, `s.sun.wink()` | nothing: an animal into the journal, the tray, the journal's page (which does not pause the game), the sun's wink |
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
running page: `window.__world`, `__scene`, `__director`, `__journal`, `__save`, `__music`, `__sfx`
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
`actors` (who stands in that place, kept clear). Forest tools are in `tools/world/`
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
