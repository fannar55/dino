# Kafli 4: the flight as a film (Flugmynd)

Status: written 2026-11-15 from the owner's words of the same day. Not yet approved.
Branch `kafli4-flugmynd`, worktree `C:/Risaeðla/dino-kafli4-flugmynd` (from main b820bc1), launch `kafli4-flugmynd` on port 4266.
Builds on: `2026-11-01-kafli-4-bod-til-flugedlu-design.md` (spec 5 and 6), `2026-11-05-kafli-4-lif-i-fluginu-design.md` (the life).

## Intent

The owner, 2026-11-15 (verbatim): "tökum út að ýta til hliðar, smella hraðar, ýta niður til að snerta vatn, og að smella á dýrin
svo flugeðla kalli. þetta er allt of mikið fyrir stutt flug og rennur allt saman. frekar skulum við endurskjóta flugið, flugeðla
kallar á alla, svipað atriði og við höfum núna, en meiri cinematic myndataka, t.d setja myndavél hjá smáeðlum, þær eru að borða
með haus niður, svo kemur flugeðla og kallar, þá haus upp, myndavél sér haus koma upp og við sjáum flugeðlu koma framhjá, allir
byrja hlaupa með. og meira af svona skotum."

Asked how much to re-shoot, he picked **"Bara dýrin"**: new shots only where the animals are. Then he approved the shot list
("Já, skrifa upp").

So the flight (170 s, beats A to G) becomes a film that Egill, who is six, watches without touching it. His part of the chapter
is still the gusts that get her off the ground before the flight (unchanged). The story stays the same: she calls the whole
forest to the festival, and the animals come along. What changes is how we see it. Several times the camera waits down with a
group. They eat or drink with their heads down, hear her call, look up, and she sweeps past through the frame. Then they run,
jump or fly after her.

## Goals

- Remove all four of the flight's controls (spec 6) and everything that only served them.
- Six new "call shots" from the animals' side, as listed below, cut into the flight at the seconds where she passes them.
- Keep the beats' seconds (A 0, B 15, C 35, D 80, E 105, F 125, G 150, END 170), so the owner's song "Vængir yfir dalnum"
  (made to those seconds) still hits its marks.
- Keep the parts he approved as they are: the take-off (A), down to the river (B), Mosi's two cameos, the gorge's quick shots,
  the falls and the slow second (E), the golden vista, Grameðla's lines and roar (F), and the glide and landing (G).

## Non-goals

- No new models. The animals' clips already exist: the lizards have drink, idle, look and run; the grazers have graze, look,
  walk and trot; the flyers perch and take off.
- No change to the chapter outside the flight: the white tree, the gusts, the far pool and scene 7 stay as they are.
- No new route or schedule for her (engine/flier.js and kafli4-route.js KEYS stay). Only the animal groups may move along the
  river so that their shots fit (see the call shot rules).

## Anti-goals (a failure even if it works)

- A camera that swings or shakes. STYLE §8 and FLIGHT_RULES hold. She is too fast (14–16 m/s, a few metres off) for a still
  camera to turn after her, so she flies through a still frame. No flashing.
- Shots so short or so many that it still "runs together". Each call shot holds long enough to read: heads down, the call, heads
  up, her pass, the run.
- A new shot that drops the tablet under budget: ≤6 ms GPU at 1280x800, ≤100 draw calls, ≤250k triangles, ≤96 MB of textures.
- Animals that pop in, pass into each other or into her, or stand inside plants in a close shot.

## What goes out

From `chapters/kafli4-flight-play.js` and its callers (`kafli4-flight.js`, `flug.js`, `flug-track.js`, `kafli4.js` where it applies):

- Steering by a sideways drag, and the drag down to skim with its splashes, rings, striders and Egill's laughs.
- The „Hraðar!“ button and her bursts. With them go camera.boost, the speed lines of a burst, FASTER_LAST's use in the flight,
  his shouts, her answers and the bank whoosh while steered.
- Tap targets on the groups and on the land, the glitter over the nearest group, the tap chime and the gold burst.
- Her four guide lines (PLAY.guide: k4_flugedla_steer, _faster, _skim, _animals).
- Lines no longer played: k4_egill_faster1/2, k4_flugedla_holdon/2/3, k4_egill_laugh, k4_egill_splash, k4_egill_laugh2, and the
  four guide lines. Remove them from the chapter's line lists and lines-source. Git keeps their takes; the builder decides whether
  the mp3s go too, as a ledgered ruling.
- `?chapter=flug&play=track1` (a recorded child's hands) has nothing left to play: remove it or reduce it to the untouched flight.

What stays from the play file: the line queue; her calls to each group, by herself (the 'auto' path), and each group's answer and
sound from its side; the big call in F, now only by itself at 135 s; the life heard along the way; the flyers' cry. The speed
lens with her speed in the chase (SPEED_LENS) is not a control and stays. Whether engine/flier.js keeps its unused steer, skim and
burst API is the builder's call (other tests, e.g. flier-saddle, use the flier), ledgered.

## The call shots

A call shot is a still camera placed down with a group, low (0.4–1.5 m over the ground or the water, never under CLEAR), so that
the animals fill the near frame and the way she comes is behind them. About 6 s, in this order (seconds from the cut, adjusted per
shot at the key-frame step):

1. 0 to 1.5: at rest, heads down (the lizards drink at the edge, the frogs sit, the birds sit in their tree, the grazers graze).
2. About 1.5: her call is heard from where she is, coming (one of her three call lines in turn, panned to her side). It must
   come early enough that heads are up before she passes (today she calls 25 m, about 1.6 s, ahead; a call shot needs about 2.5 s).
3. About 2.2: heads up, turned toward her (the look clip).
4. About 3.5 to 4: she sweeps through the frame, low and fast. Her shadow crosses them, the wingbeat and a whoosh from her side.
5. 4 to 6: they answer. The lizards squeak and run after her, the frogs jump in with splashes, the birds burst up and fly with
   her, the grazers walk and trot off. Then cut back to her, and Egill's line for that kind plays over the next shot.

Rules for every call shot: the camera stands still or turns slowly (≤40 deg/s, the fixed rule). No tree, rock or bank stands
between the camera and the group, nor between the camera and her pass (the tree-probe test of chapter 4's F1 fixes does this).
Plants keep out of the shot's view as the other stills do (`flight-camera.js stillViews`, `banks.js`). The ground in view is the
drawn ground. In a ground shot the wind in Egill's ears goes down (flight-sounds: the wind bed follows the camera, not her), and
the bank's own sound and the water come up, until she passes.

### The list (owner-approved order; the seconds are where she passes today)

| # | Where | Group | Replaces | The shot |
|---|-------|-------|----------|----------|
| 1 | River, C | lizards-1 (passes 43.1 s) | part of the chase and the side shot at 44.5 | Low on the bank among the lizards drinking at the edge. Egill: „Eðlurnar hlaupa með!“ |
| 2 | River, C | frogs-2 (51.9 s) | waterLevel #2 (51–53.6) | At the water by the lily pads. They jump in with splashes. Egill: „Froskarnir svara!“ |
| – | River, C | Mosi in the shallows | – | Kept as it is (57.5–63) |
| 3 | River, C | birds-2 (64.0 s) | bankShadow (63–68) | Under their tree, looking up into the crown. They burst up and fly with her. Egill: „Fuglarnir fljúga!“ |
| 4 | River, C | lizards-2 and lizards-3 (68.0, 76.0 s) | the chase and side shots of 68–80 | **The run-along**: the camera moves along the bank beside lizards that are already running. She comes over and ahead of them, and more join from the bank. |
| 5 | Gorge, D | a flyer on its ledge (NESTS, 83.8–99.7 s) | gorgeHigh (90.5–96) | On the ledge beside it, looking down the gorge. It turns its head as she comes up below, she passes, and it leaps off after her. Egill: „Sjáðu, þau fljúga með okkur!“ |
| 6 | Land, F | the herd's stepNorth group (-1367, 31) | the first ~6 s of the orbit (from 135) | Down among the grazers. The big call echoes, heads come up, and she glides high overhead against the gold. They trot off, and the lizard rows stream out of the groves behind. Then the orbit's last part, and „Ég sé allt!“ |

Correction to what the owner was told in chat: shot 5 was described as taking the place of one of the three quick shots between
the rocks. The ledges fit better where the high gorge shot is, so all three quick shots stay. Tell him this with the stills.

The groups the camera does not visit (frogs-1, birds-1, the turtles, the dragonflies) are still called by her and answer as they
do now, seen and heard from the shots on her back.

**Shot 4, the run-along**, is the one new kind of camera: a still camera's rules on a moving stand. It moves along the bank at
the lizards' pace (RUN: 24 m in 4 s) at a steady speed, eased in and out, at their height, a few metres from them, looking across.
It never rolls, and it turns ≤40 deg/s. It is linted like the others (a new FLIGHT_RULES entry). Under reduced motion it is a
still shot. Shot 4 may join lizards-2 and lizards-3 into one larger running group, and its run may last longer than today's 5 s.

**Moving groups**: shots 1 to 4 need about 3.5–4 s before her pass inside the shot. Where two shots or Mosi's cameo crowd each
other (birds-2 at 64.0 comes 1 s after Mosi's cameo ends), a group moves along the river (its `d` in GROUPS), or a shot's window
moves, within C. Each such move is a ledgered ruling, and the key-frame stills show the result.

**Seeks and captures**: as everywhere in the flight, each call's second and each group's pose are functions of the flight's
time, worked out at build (life.js and animals.js triggers), so a seek, a review link (`t=…&play=1`) or a capture finds them where
playing would have. The earlier call of a call shot is a fixed second, not "when she is so far ahead".

**Close animals**: the crowd models are at most 400 triangles, drawn larger than life (SCALE). If a close shot shows them too
coarse, the camera stands further back first. A finer near level of detail is a question for the owner, not a silent change.

## Lines

- Her calls: the three call lines in turn (k4_flugedla_call1–3), as now.
- Egill's reactions, already recorded: k4_egill_lizards, k4_egill_frogs, k4_egill_birds and k4_egill_flyers. They play over the
  shot after the call shot, waiting for the line playing (`ifFree`), once each.
- Possibly one new Egill line for shot 6 (for example „Sjáðu, allir koma með!“), only if the stills show the shot needs it.
  Then it goes through the repo's voice tools and onto a yes/no page.
- The owner never saved a yes/no page for chapter 4 (there is no heard file for it). So every chapter 4 line the new cut plays
  goes on a yes/no page with the step 2 cut, and its verdicts are imported with heard.mjs.
- Already on this branch: k4_flugedla_biggest is now „Stærsta rándýrið!“ (25cfd33), with its yes/no page at
  `/qa/remake/voices/janei/kafli4.html`.

## How it is shown to the owner (three steps, each ending with his look)

1. **Key-frame stills**: each of the six shots at three moments (heads down, her pass, the run), from the game at the real
   seconds, at both capture sizes (1280x800 and 820x1180). Also a short note on any group moved or window shifted.
2. **The cut**: the whole flight with the new shots, the controls gone, the sound. A video at both sizes plus a phone copy, the
   bench at both sizes (its frames include the heaviest second of each new shot), and the yes/no page for the lines. The review
   chapter `?chapter=flug` still plays the flight alone, and the full chapter plays it in place.
3. **Finish**: his fixes, the full suite, and a merge into main only on his word, then a push only on his word.

## Tests (child-facing, lean)

- A drag or a tap anywhere during the flight changes nothing: her pose, the lines and the shots are those of the untouched flight.
- No „Hraðar!“ button, tap target or glitter exists in the flight's page or world.
- Each call shot: its group is called before she passes and is looking up (the look clip) when she is in frame; nothing stands
  between the camera and the group or her pass (tree-probe); the camera is never under the ground or water.
- The camera rules: every shot ≥2.5 s except the quick ones; the fixed and the run-along pans ≤40 deg/s; no roll; the run-along
  is a still shot under reduced motion.
- The beats' seconds and the song's start are unchanged.
- The tests of the removed controls go (flug, flier, flight-camera, kafli4 tests that drive steer, skim, faster or taps).

## Left to the builder

The exact camera places and seconds (settled in step 1 with the owner), which nest for shot 5, any group moves, whether flier.js
keeps its unused API, whether the dropped takes leave the repo, and how the wind bed knows a ground shot. All are ledgered.

## Process

As the owner's builds go: a builder agent in this worktree builds in chunks and commits WIP at least every 20 minutes. A
20-minute status cron reports to him while it builds. No reviewer agents. Measure only when the machine is quiet. Keep each file's
line endings (`* -text`; check `git ls-files --eol` and `git diff --stat` before each commit). Never print ELEVENLABS_API_KEY.
No merge or push without his word.
