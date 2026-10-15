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
| `chapter=grunnur` | which chapter module in `chapters/` to load (default `grunnur`, the foundation test scene; `lineup` puts the characters side by side for look checks) |
| `quality=low\|tablet\|high` | quality preset (default `tablet`) |
| `look=morning\|golden\|evening` | override the chapter's light |
| `shot=hero` | hold a static review shot instead of playing the scene |
| `t=12` | seek to 12 s and freeze (deterministic captures) |
| `play=1` | start at once, without the start button |
| `orbit=1` | free camera instead of the director |
| `debug=1` | frame stats, scene time and camera mode |

## Layout

- `engine/`: clock, renderer, looks, lighting, fog, sky, wind, stats, actors and their footing
  (planted feet that never slide, on four legs or two: walking, stopping, standing and turning on
  the spot), point specs.
- `engine/camera/director.js`: the camera director.
- `engine/scene/`: the scheduler, the scene API, captions and choices, voice playback.
- `world/forest/`: the forest system (`createForest(world, layout)`).
- `chapters/`: one module per chapter: layout, actors, cast, lines, shots and the script.
- `assets/`: models and generated data (`assets/audio/lines.json` holds every recorded line's length).
- `prompts/`: image prompts for new Tripo characters, following `design/mosi`.
- `tools/`: `serve.mjs`, `capture.mjs` (headless screenshots and GPU benchmark), `audio-lines.mjs`,
  and for new Tripo characters `blender-decimate.py`, the bake tool in `bake/` (`bake-character.mjs`
  runs `bake-biped` for two-legged characters, `bake-tailed-biped` for tailed ones such as
  Grameðla and `bake-quadruped` for four-legged ones such as Kambeðla) and `prep-character.mjs`
  for static models (see
  STYLE.md section 12).
- `tests/`: `npm run test:remake`.

## Writing a chapter

A chapter exports `chapter` with `layout` (for the forest), `actors`, `cast`, `lines`, `shots` and
`script`. Shots are data: `{ position, target, fov }` or `{ position, frame: { subject, screen: [u, v] }, fov }`.
Positions, targets and subjects are point specs: `[x, y, z]`, `'mosi'`, `'mosi.head'`, `'camera'`
or `{ actor, part, offset, local }`, so a shot can follow a character. A walk can head for one too:
`walkTo` takes `[x, z]` points or point specs, read where they are when the walk starts.

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
  yield s.say('mosi', 'welcome');                    // caption + recording, timed by lines.json
  const answer = yield s.choose([{ label: 'Já!', value: 'yes' }, { label: 'Seinna', value: 'later' }]);
  yield s.camera.orbit({ around: 'mosi', degrees: -50, duration: 8.5 });
}
```

| Call | Waits for |
|---|---|
| `s.wait(seconds)` or a number | scene time, with exact deadlines |
| `s.all(...)`, `s.race(...)` | every item, or the first (the rest are cancelled) |
| `s.camera.cut / move / orbit / push / lookAt / zoom` | the camera move; `follow` and `handheld` return at once |
| `s.actor(name).walkTo / turnTo` | arrival; `play`, `lookAt` and `place` return at once |
| `s.say(speaker, line)` | the line's length plus a short hold |
| `s.choose(options)` | the child's tap (in captures: the first option after 3 s) |
| `s.fade(level, seconds)` | the fade |
| `s.after(seconds, () => item)` | a delayed start; pass a function so a move starts late, not now |
| `s.ready()` | the start button |

The director warns in the console when a move breaks the STYLE.md speed limits or a shot is cut
shorter than 2.5 s. Moves without a `duration` pick the shortest comfortable one.

## The forest

`world/forest/` builds the whole environment from a chapter's `layout` (seed, clearing, forest
edge, path), deterministically. All look and density settings live in `world/forest/config.js`.
Plants come from a species registry (`species.js`): broadleaf trees, araucarias, tree ferns,
cycads, bushes, ferns, horsetails, flowers, mushrooms, rocks and a log, each built in code with
three detail levels, so a Tripo model can replace one kind later. The planner keeps every authored
shot clear (no trunk in the lens, no crowns or fronds right behind Mosi's head), and the forest
culls and picks detail per view, with separate low-detail meshes for the shadow pass.
Forest tools are in `tools/world/` (`forest-round.mjs` captures the review set with figure-ground
checks; `forest-stats.mjs` estimates calls and triangles in Node). Reports and reviews are in
`qa/remake/reports/`.

## Checking work

```bash
npm run test:remake
```

```bash
node remake/tools/capture.mjs --out qa/remake/shots/check --size 1280x800 --bench 120 --shot hero="shot=hero&t=2" --shot intro="t=31"
```

The budget for the tablet preset is in STYLE.md section 11: at most 6 ms GPU per frame at
1280x800 on the reference laptop, 100 draw calls, 250k triangles and 96 MB of textures.
