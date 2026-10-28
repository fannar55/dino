# Hvar er vinur minn? — review slice

The current milestone revises the connected three-task woodland journey for
clearer child-facing choices and continuous movement. Every pair has a different
role; one contextual button starts its work. Completed paths lead the friends
onward automatically. An illustrated trail, Mosi's speech bubble and an in-world
marker guide the next action. A camera director alternates stable play views
with action closeups and a whole-route overview. This remains a playable review
slice for the owner's visual and pacing evaluation.

## Play

From the repository root:

```text
npm run start:memory
```

Open `http://127.0.0.1:4206/remake/minnisspil.html`.
The page is standalone; the existing minigame menu and other games are unchanged.
`?seed=251025` gives a repeatable shuffle for review. `?play=1` bypasses the welcome
dialog for screenshots; browser audio still requires a gesture.

## Review scope

- A larger connected woodland board: six domed leaf hiding places, natural rest
  patches, a winding shallow river, a staging clearing, a marsh and a berry grove.
- Two matching instances each of triceratops, stegosaurus, and brontosaurus.
- The triceratops is a newly proportioned baby derived from the owner's textured
  Mosi mesh. See `assets/memory/triceratops-baby-source.json` and
  `scripts/memory-baby-bake.mjs` for provenance and repeatable processing.
- Stegosaurus and brontosaurus retain adult reference meshes for this milestone.
  Their final baby designs are deliberately deferred until the art review.
- A new local ElevenLabs woodland theme (45-second seamless loop), 15 recorded
  cues for the three species, footsteps, leaves, construction, river and rewards,
  and 14 Icelandic Mosi lines. Music stays audible during construction and ducks
  under speech; pause preserves the music and narration playheads.
- Reveal, mismatch, match transfer, end celebration, interactive nests, pause,
  reduced motion, mute, and replay. No timer or score penalty.
- Current review — the route to the berry grove: Brontosaurus lifts and holds
  a branch while Triceratops rolls a large hollow trunk into a permanent bridge.
  Holding stays idle so the player can continue matching or select the other pair.
  All three pairs must be found and physically settled before crossing. All six
  automatically walk across the broad log surface to staging. When all friends
  are ready, the builders stay beside their finished bridge instead of returning
  to their old resting patch first. Stegosaurus then carries three
  substantial bark panels broadside, low in front of both mouths, and slides
  them down into a walkway across the marsh. Completing that walkway sends all
  six onward to the berry grove automatically; only their arrival completes the journey. The prior
  rock modules remain as history.
- The camera stays still during memory turns. Valid actions get eased closeups,
  with action motion waiting until focus settles. The overview button shows the
  entire route and disables world input; “Nær” returns to the playable view.
  Pause freezes camera and action clocks, and reduced motion skips camera travel.
- Wider leaf aisles and parallel resting places use measured animal dimensions.
  Home transfers plan around closed leaves, other animals, Mosi, the log and
  river, including the other friend's eventual resting place. The pair uses
  the nearer of its two widened home bays and timed body reservations, so the
  second friend can depart before the first arrives. Shared routes wait only
  while occupied. Cooperative routes also account for
  tails, heads and the carried bark rather than checking feet alone.
  Helpers now depart as a spaced group: each walker has its own clock, so
  planning the next route never freezes a friend already on the way. A follower
  can enter a shared lane before the leader reaches its destination, once their
  predicted body and tail positions leave enough room. Approaches, returns and
  both crossings use these timed reservations; the group finishes only after
  every helper arrives. A failed route lets committed walkers reach safe ground
  before returning control to the player.
  Helpers approach contact poses from a stand-off, align with the log ramps,
  and keep the carried panel broadside through placement. Both upper-beak
  supports meet the actual uneven underside of the slab. Parking fills the
  farther Stegosaurus bay first so an incoming helper does not cross a parked
  tail. After the wedged log is free, the branch springs back above the walking
  route when released.
- Walk playback follows distance traveled instead of a fixed animation rate.
  Planted feet keep their world position as the body passes over them; the same
  solver supports scaled babies, reversing and inclined bridge surfaces.
  Authored work/contact poses keep control of their legs during construction.
- Warm fill light, soft character shadows, painted leaf veins and bark grain,
  visible flowing river and marsh water, drifting foam, moving foliage and
  dappled light. Varied bankside leaves, ferns, grasses and butterflies enrich
  the forest. A shared particle batch supplies match/reunion sparkles, grounded
  foot dust and leaf fragments. Effects follow the game clock and reduced-motion setting.
- The HUD keeps progress in one illustrated trail panel, with large quiet
  controls and a single gold work button beside Mosi. The work button also
  selects the correct helpers; choosing a pair and then a separate object is
  no longer required. Work requested while another matched pair is walking
  stays queued until they arrive, so starting an action never freezes them
  halfway home. Overview, pause and camera focus hold automatic travel safely.

The new baby art and recorded speech remain subject to human visual/listening
review. This milestone does not claim final AA quality or measured tablet FPS.

## Verification

```text
npm run test:memory
npm run check:memory
node remake/tools/memory-voices.mjs --verify
node remake/tools/memory-sound-design.mjs --audit
```

The unit checks use the bundled Three.js through the test setup; no install is
needed. The browser check uses the
project's existing Playwright convention (`PLAYWRIGHT_PATH`, or the installed
Codex runtime) and a self-contained temporary local server. Its report and
screenshots are written to `qa/memory/three-step/check/` by default. The older
smaller-board evidence remains at `qa/memory/check/`. The approved mock and
development captures live alongside the new report folder.

The browser check covers complete rounds, mismatches, pause, sound cancellation,
restart during travel, accessible labels without hidden-species leaks, nest
interaction, and tablet/phone target bounds. Visual acceptance needs the
screenshots and live review as well as these automated checks.
The current checks cover all six helper discovery orders, holding a branch
while matching, lowering and reopening it, a permanent bridge, all-six crossing,
three placed panels and final arrival. Actual actor roots and feet are sampled
against the curved river, diagonal deck, marsh and placed panel surfaces.
Camera input gating, pause and restart are checked through cooperative actions.
The gate remains 250k triangles / 100 draw calls, separate from device FPS.
The earlier two-stone report and screenshots are kept in `qa/memory/two-stones-final/`.
The preceding river-only board's complete gameplay gate passed at **230,039 triangles / 92 draw
calls**, including valid rapid matching while four babies were still walking.
All four helpers and their feet were measured crossing the deck and reaching
dry ground. The report is `qa/memory/large-board/check/report.json`. Final narrow
camera/transit visibility checks are saved in `qa/memory/large-board/final-visibility/`.
That preceding revision passed all three viewport sizes at **224,332 triangles / 93
draw calls**, with complete leaf rims, visible Stegosaurus transit, and no target,
caption or movement-geometry violations.
These figures describe the preserved river-only revision, not the new journey.
The new journey's measured results live in `qa/memory/three-step/`. Actual tablet
FPS and the owner's evaluation of readability/play value remain separate reviews.

The preserved three-task milestone passed **60 unit tests**. Its functional journey
(`three-step/final-check-r2/report.json`) sampled **12,580 frames** with no geometry,
camera, layout or runtime errors: all six helpers crossed both surfaces, all
three final greetings responded, and pause/reduced-motion/restart passed. That
run identified an overview rendering overrun; the subsequent bounded rendering
gate (`three-step/render-final/report.json`) passes at **245,502 triangles / 97
draw calls** across **6,840 frames**, including rapid greetings followed by
overview transitions at desktop, portrait-tablet and phone sizes. The final
construction-visibility correction separately verifies ramp draw ranges of
0/144/144/288 vertices for zero/one/two/three placed panels and zero after reset;
it leaves completed geometry and draw count unchanged.

`node remake/tools/memory-render-check.mjs` repeats the bounded rendering review.
`node remake/tools/memory-look.mjs` captures initial glade/overview framing only.
The 3D Mosi hosts the first clearing; his portrait continues guiding the later
stages while all six playable friends remain in the world.

The audio/visual/clearance revision passes **89 unit tests**. Its evidence is
separate under `qa/memory/polish/` and `qa/memory/soundscape-generation/`. The new
anatomical audit follows oriented skin envelopes attached to the actual animated
bones, including tails and heads, and distinguishes narrow intentional working
contacts from incidental intersections. Earlier foot/water checks alone did not
establish that whole bodies were clear of one another.
Offline route validation covers 90 first-pair arrangements and 36 crowded final
arrivals with the other five helpers parked. Rejected or timed-out work routes
return control without moving through obstacles or granting unfinished rewards;
these failure and retry cases are included in the automated checks.
The partial-board navigation regression retains captured actor/prop envelopes
and checks all 15 possible closed-cover pairs plus nearby head-height variants.
The roll stand-off is offset into the open clearing before the existing brace
motion, keeping its approach clear of both the branch and its holding helper.

The final review record is `qa/memory/polish/final-acceptance.json`. It combines
the completed r6 journey with the final isolated head/log contact correction;
the original r6 report retains its one contact failure. That journey verified
all six crossings of both obstacles, three placed panels, all three greetings,
camera/overview/pause behavior and phone replay. Its **25,440 surface frames**
had no unsupported feet, layout or runtime errors. Peak rendering was
**222,540 triangles / 81 draw calls**, at resolution scale 1; this is not a
physical-device FPS measurement.

The final correction clears all **5,408 weighted head/jaw vertices** in the
captured failing pose. Separate current-source checks cover **145 roll poses**,
**40 withdrawal/post-withdrawal frames** and both resulting return routes, with
no forbidden contacts or skin penetrations. Initial withdrawal retains only
the same bounded nose-local work contact; ordinary return travel is excluded.
The final record preserves each source report and hashes the reviewed runtime.

The preserved group-travel revision passes **99 unit tests**. Its
review record is `qa/memory/convoy/acceptance.json`. In the same actual-world
journey, river crossing falls from **64.03 to 21.97 game seconds**, with up to
five animals walking at once; marsh crossing falls from **51.63 to 17.20 seconds**,
with all six walking together. Followers depart before their leaders arrive.
Every required route starts and physically reaches its destination. The full
journey checks **3,788 surface frames**, **629 articulated clearance samples**
and 12 pauses with multiple active walkers, with no forbidden contacts or
unsupported feet. A separate lift/roll/return case leaves both Stegosaurus
covers closed and passes another **242 clearance samples**. Failure/retry tests
preserve friends already across either obstacle; reset cancels all travelers.

`node remake/tools/memory-convoy-check.mjs` repeats this targeted gate. Its
isolated browser uses the actual production scene, models, terrain, navigation
and camera. Drawing is suppressed between captured frames to avoid software
rasterization dominating the check; game clocks and animation still advance.
The before/after measurements are game time, not a device FPS benchmark.
`MEMORY_CONVOY_SCOPE=partial` runs the bounded closed-cover case. The acceptance
record verifies the exact saved runtime hashes and preserves earlier failed
diagnostic reports separately.

The child-flow revision's current review record is
`qa/memory/playful/acceptance.json`. Its actual controller/DOM journey is
`qa/memory/playful/flow-final/report.json`: three direct work clicks complete
the journey, including both automatic crossings, with all six friends walking
at once. A work click made while another matched pair is traveling stays queued
and starts without a second click. Four viewport sizes, ending and replay pass
without runtime/resource errors. Runtime, shared footing, HTML and CSS hashes
are checked before and after the run.

The final revision passes **217 targeted regressions**, including the shared
footing's existing actor consumers. Its full physical journey at
`qa/memory/playful/anatomy-final/report.json` checks **496 articulated poses**,
**3,325 supporting-surface frames** and **13 pauses** with multiple travelers.
There are no forbidden intersections, unsupported feet or browser/resource
errors. All six animals move concurrently during each crossing. Captured
rendering peaks at **207,401 triangles / 75 draw calls**, inside the unchanged
250k / 100 limits. The source manifest includes the optional shared footing
change; the old actors retain its original default behavior.

First-pair navigation evidence lives in `qa/memory/playflow/`. All **45 of 45**
possible first-pair placements now allow overlapping travel, up from **34 of 45**
in the saved baseline, with no route failures. Mean pair completion in that
bounded fixture falls from **6.32 to 4.53 game seconds**; this is not a device
performance measurement. The final actual-model/browser run in
`motion-final/report.json` confirms all three pairs overlap with **102 anatomical
samples** and no forbidden contacts. Eight original motion frames per species
and `motion-final/review.html` support visual review. The gait regression uses
the actual GLTF feet on flat ground and an 18% incline, in both directions;
planted-foot median movement stays below 5 cm/s, with pause and stop checked.

The environment check at `qa/memory/living-forest/report.json` verifies visible
river motion, frozen effects during pause and the unchanged rendering budget.
The HUD has a separate twelve-view layout review in
`qa/memory/playful-ui/report.json`; actual enabled desktop and phone work states
are captured alongside it. These checks do not replace the owner's play-feel,
art-quality or physical-device FPS review.

All 16 new soundscape assets decode without clipping or unexpected silence;
the loop-seam audit and actual browser playback check pass. The browser check
confirmed all 15 effects loaded, recorded cues played, music advanced, and speech
resumed from its paused playhead. Human listening remains part of this review.

The tablet view uses the existing eye-preserving character index LODs with a
local screen-size factor of .8; world-space animal sizes are unchanged. Baby
shadows use separate simplified index buffers with the same rigs and skin
weights. Their combined measured simplification error is below .7 sun-shadow
texel. High quality keeps the engine's original visible-model LOD thresholds.

## Ownership and boundaries

`rules.js` owns shuffled cards and clock-driven transitions. `game.js` owns DOM,
input, narration, music and the RAF. `world.js` owns the scene/camera; `world-props.js`
owns the leaf/nest geometry; `baby-actors.js` owns the character rigs. `audio.js`
owns recorded SFX, their local synthesized fallbacks and sound cancellation;
`presentation-audio.js` owns gesture-gated music and the queued Mosi narration.
`bridge-rules.js` owns helper selection and cooperative bridge progress;
`bridge-adventure.js` owns the physical branch, log, carrying and crossings on the
shared game clock. `build-props.js` owns the marsh and bark walkway; the camera
director owns framing, motion and input readiness. `adventure-rules.js` /
`rock-adventure.js` are the earlier two-stone slice.
`world-home-nav.js` owns the incremental clearance planner and route reservations;
`travel-traffic.js` checks when cooperative routes can overlap safely in time;
`memory-clearance.js` supplies measured skin envelopes and the independent
anatomical audit. `world-fx.js` batches dust/leaves and emits timed foot contacts;
`world-surface-fx.js` supplies procedural bark, water flow and soft foam.
`world-forest-visibility.js` cuts away foreground plant ranges that obstruct the
traveling camera, including their shadow ranges, while preserving distant trees.

No credentials are shipped to the browser. The voice generator uses the existing
environment-only ElevenLabs key and the approved Mosi voice. Generating new
recordings is a separate, potentially billable operation; normal play and all
checks use only local files.

`memory-sound-design.mjs` retains the original ElevenLabs outputs by content hash
and masters local copies. The shipped soundscape manifest records provenance,
durations and playback levels. The source cache is under
`qa/memory/soundscape-generation/`; it is not required to play. Regeneration is
billable; `--audit` and normal testing do not generate audio or spend credits.
