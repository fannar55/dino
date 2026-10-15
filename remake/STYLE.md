# Mosi remake: style guide

Foundation version, 2026-10-15. Binding for every asset, scene and screen in `remake/`.
The Icelandic team copy lives in the plan doc, tab "Stílforskrift". When the two disagree, fix both.

Conventions: metres, +Y up. Heading 0 faces +X and 90 faces +Z (`actor.place`); sun azimuth uses
the same sense. Colours are sRGB hex; three.js converts them to linear.

## 1. Target

- **Audience:** five-year-olds, Icelandic voice. A warm, cinematic storybook adventure at the
  quality of the new Mosi, at 30 fps on a mid-range Android tablet (Samsung Galaxy Tab A9+ class).
- **Mood:** safe, sunny, curious. Morning light through a prehistoric storybook forest, soft mist
  in the depth, everything a little rounded. Nothing threatening; no darkness without a warm light.
- **Readability before detail:** a child finds Mosi, the speaking animal and the thing to tap
  within one second. Detail that competes with that is removed.

## 2. Shape language

- Soft, chunky, rounded forms with exaggerated but believable proportions.
- Big, medium, small in every composition: one big mass, a few medium shapes, many small accents.
- Silhouettes read in solid black. Trunks taper and flare into roots. Canopies are clusters of
  soft lobes: never one sphere, never single leaves at a distance.
- No sharp points aimed at the camera; horn and leaf tips are rounded.
- Prehistoric storybook flavour: broad round-crowned trees, araucaria-like conifers, tree ferns,
  cycads, horsetails, giant ferns, mossy logs and boulders, mushrooms. Friendly, never jungle horror.

## 3. Characters and the species colour map

- Every animal and Egill follows the new Mosi: soft friendly cartoon, expressive eyes with lids
  that blink (code), painted matte skin, a pale belly as a family trait, no scary teeth (the T. rex
  too), a closed kind smile at rest.
- Each species owns ONE main hue a child can tell apart across the clearing. No two species share
  a slot, and no species except Mosi uses the forest-green band. Hues are chosen against the
  habitat where the animal appears (orange and violet against green forest, gold and pink against
  sky, coral against water, blue against golden reeds). The story may change the roster; the rule
  stays and a new species takes a free slot.
- Scale: real sizes. Each species is scaled so its length from nose to tail tip matches a real
  adult's (the Size column); Egill is 1.1 m tall, a real five- to six-year-old. A cartoon head can
  make a species a little taller than the real animal; keep the length right.
- Budget per dinosaur: at most 40k triangles, two 1024 JPEG maps, roughness about 0.62.

| Character | Species | Size | Main hue | Main | Light (belly) | Dark | Accent |
|---|---|---|---|---|---|---|---|
| Mosi | Triceratops | 8.5 m long (8 to 9) | sage green (fixed) | `#868862` | `#c8c395` | `#4f5433` | ivory horns `#ede0bf`, amber eyes |
| Egill | boy explorer | 1.1 m tall | cream and denim blue | shirt `#e6dcc4` | skin `#e9c4a2` | jeans `#4f6670` | boots `#6f5440`, hair `#eadbbd` |
| Kambeðla | Stegosaurus | 7 m long (6.5 to 9) | violet | `#8f6cc9` | `#e2d6f1` | `#5b4590` | plates teal `#3f9c95` |
| Þórseðla | Brachiosaurus | 20 m long (18 to 22) | golden yellow | `#e6bf55` | `#f6e6b8` | `#a9813a` | soft patches `#b98a4e` |
| Grameðla | T. rex | 12 m long (12 to 12.8), hips 3.7 to 4 m | terracotta | `#b37955` | `#ead0b4` | cocoa back `#87532e` | ivory claws `#efe2c8`, amber eyes |
| Uggeðla | Spinosaurus | 14 m long | coral red | `#e06a55` | `#f6d2c2` | `#a5433a` | sail gold `#f2b04a` |
| Slóeðla | Parasaurolophus | 7.5 m long (up to 9.5) | blue | `#5f8fd6` | `#dce7f6` | `#3c5f9e` | crest `#a9c6ee` |
| Flugeðla | Pteranodon | 6 m wingspan (5.6 to 7.6) | pink | `#ea8db3` | `#f8dfe8` | `#a95a7e` | wing membrane `#f6c2a0` |

Grameðla keeps the terracotta of the owner's Tripo model (2026-10-15), and Kambeðla moved from
orange to the free violet slot. Uggeðla's coral is Grameðla's nearest neighbour: check the two side
by side when Uggeðla is made. Sizes are adult estimates from the species' Wikipedia pages
([Triceratops](https://en.wikipedia.org/wiki/Triceratops),
[Tyrannosaurus](https://en.wikipedia.org/wiki/Tyrannosaurus),
[Stegosaurus](https://en.wikipedia.org/wiki/Stegosaurus),
[Brachiosaurus](https://en.wikipedia.org/wiki/Brachiosaurus),
[Spinosaurus](https://en.wikipedia.org/wiki/Spinosaurus),
[Parasaurolophus](https://en.wikipedia.org/wiki/Parasaurolophus),
[Pteranodon](https://en.wikipedia.org/wiki/Pteranodon), October 2026).

## 4. Environment palette

The forest is cooler and darker than Mosi; the ground around him is warmer and lighter.

| Group | Role | Hex |
|---|---|---|
| Ground | grass in sun | `#a6b84a` |
| | grass tips, golden | `#dccb6e` |
| | grass base | `#55703a` |
| | grass in shade | `#3f5f3c` |
| | moss | `#6f8f3c` |
| | clover and low plants | `#7fa046` |
| | soil / dark soil | `#a07d52` / `#6e5236` |
| | path / path edge | `#c2a273` / `#8f6f49` |
| | leaf litter accents | `#b8743c`, `#d29a4a` |
| Trees and plants | canopy in shadow | `#2e5544` |
| | canopy mid | `#3f6c4c` |
| | canopy sunlit edge | `#7fa64c` |
| | canopy far, before fog | `#3b6260` |
| | conifer / conifer tips | `#2c4f45` / `#4f7a5a` |
| | fern fronds / backlit | `#5f8f3e` / `#9cc25a` |
| | cycad / horsetail | `#4e7b47` / `#6f9a4a` |
| | bark / crevice / highlight | `#6e5440` / `#4a382b` / `#8d7058` |
| | moss on bark | `#6d8c3d` |
| Rock and wood | rock light / mid / dark | `#a39d8f` / `#7a756a` / `#57534b` |
| | moss cap | `#7c9a44` |
| | log / cut wood | `#7a5a40` / `#d8b27a` |
| Accents (clusters of 3 to 7) | buttercup, coral, pink, white | `#f2c443`, `#ef8a5a`, `#f0a3b6`, `#f6f1e4` |
| | violet, rare | `#9c83d4` |
| | mushroom cap / spots / stem | `#d9573b` / `#f7efdc` / `#ece0c4` |
| | berries | `#c8414a` |
| Atmosphere | per look in `engine/looks.js` | morning fog `#d6e2dc`, sun-side fog `#f6e2bf`, sun `#ffe3b8` |
| | light shafts | `#fff1cf` at low strength |

## 5. Figure and ground: the Mosi rules

Mosi is mid-value, low-saturation olive-sage: `#383c23 #4f5433 #636846 #747854 #868862 #979874
#a8a97f #c8c395`. Green on green disappears unless these hold:

1. The ground within about 3 m of a character is warmer and lighter than him: sunlit grass with
   golden tips, soil or path. No large olive-sage areas (`#636846` to `#979874`) around him.
2. Whatever sits behind his outline in a shot is clearly darker and bluer (forest wall, canopy
   shade) or clearly lighter (sky, misty depth, sunlit clearing): at least 25 % luminance
   difference along the outline.
3. Warm key, cool fill. Hero shots put the sun 35 to 150 degrees off the camera axis so his edge
   catches light.
4. Every character has a soft contact shadow at every quality level.
5. The most saturated colours in a frame belong to characters, eyes and interactive objects.

Value plan, brightest to darkest: sky, sunlit clearing, characters (with local contrast at the
face), misty far forest, forest wall.

## 6. Light

- One sun as the warm key, plus sky fill (hemisphere light and sky image-based lighting). Shadows
  are never black or neutral grey; they lean blue-green.
- Looks live in `engine/looks.js`: `morning` (default, sun azimuth 135, elevation 32), `golden`
  (late afternoon, elevation 15) and `evening` (sunset, elevation 6). A chapter picks one. Looks
  change only between chapters or as a slow authored change.
- The shadow map covers the hero focus (10 to 20 m) and stays sharp near the camera. Beyond it,
  shade is faked: darker vertex colour under trees and dappled light as cheap patterns, not more
  shadow maps.
- Light shafts are a few soft additive cards that respect fog. Never a full-screen pass on tablet.

## 7. Materials

- Environment: `MeshStandardMaterial`, or a `ShaderMaterial` built on three's chunks that includes
  the fog chunks (see `engine/fog.js`). Metalness 0, roughness 0.75 to 1.0.
- Colour comes from vertex colours and gradient ramps. Textures only where they earn their cost:
  small, tileable, at most 512 px. No photo textures, no normal maps on vegetation.
- Foliage gets gentle wrap lighting and a glow when backlit by the sun. Wind comes from the shared
  uniforms in `engine/wind.js`; tall plants sway at most 3 degrees, leaves flutter a little.
- Opaque geometry first. Alpha test only where the shape needs it (grass blades, fern cards), with
  alpha-to-coverage when MSAA is on. No sorted transparency in the forest.
- Characters keep their Tripo textures as baked (1024 JPEG), roughness about 0.62, and render
  single-sided: the bake tools weld Tripo's open part shells into one closed skin (a double-sided
  Mosi cost about 0.9 ms more in close frames). The shadow pass draws front faces
  (`shadowSide = FrontSide`, set in `engine/actor.js`), so creases keep their shadows.
- Nothing is glossy except eyes and water.

## 8. Camera

- **Lens** (vertical fov): normal 38 to 45, close-up 28 to 34, wide or awe 45 to 55. Above 55 only
  for a deliberate low awe shot.
- **Height:** 0.8 to 1.6 m for shots of the characters; a child's eye is about 1.1 m. Low hero
  angles at 0.3 to 0.6 m make the dinosaurs grand. Wide opening shots may rise to about 7 m. Never
  look down more than 35 degrees: no top-down views.
- **Movement:** always eased in and out (a sine curve by default) and slow. Dolly at most 1.2 m/s, pan 15 deg/s,
  orbit 10 deg/s, zoom 8 deg of fov per second. Never shaky. Optional breathing handheld of at most
  0.25 degrees and 1.5 cm at 0.35 Hz, switched off while the child must tap.
- **Cuts:** a shot lasts at least 2.5 s. Hard cuts only inside a scene and without crossing the
  line. Between places, a slow pan along the path or a fade of at least 0.6 s.
- **Framing:** rule of thirds, look room in front of the face, faces above the bottom 30 % (the
  caption box) and nothing important in the top 8 % (the star counter). Shots are authored at 16:10
  and the whole authored frame always stays visible: a narrower screen (4:3) widens the lens, a
  wider one (16:9) sees more at the sides. The director warns when a move breaks these limits.
- **Shot grammar** from the plan: opening is wide with a slow dolly in; an introduction is a low
  angle with a soft push to the face; dialogue is over Egill's shoulder with the face centred; a
  search is a soft pan that follows the hint, and the child may drag; a celebration is a slow
  orbit; a transition is a pan along the path or a fade.

## 9. Motion

- Always alive: breathing idle, blinks every 2 to 6 s, glances at the camera, tail sway.
- Walk speed matches the clip stride so feet never slide. Turns follow arcs.
- Ease everything, anticipate big moves, hold a reaction after a line.
- Pace for five-year-olds: one important motion at a time while a line plays.
- Environment: wind waves with travelling gusts, drifting motes in light, slow clouds, a few
  butterflies on curved paths.

## 10. UI: the explorer's journal

- Paper `#f6efdf`, card `#fffaf0`, ink `#3b2f25`, soft ink `#6b5a4a`, accent orange `#e07a3f`,
  accent teal `#2f8f86`, star gold `#f2b630`, success green `#6fae4f`.
- Touch targets at least 64 px on tablet (the plan's floor is 44 pt). Corner radius 18 to 24 px,
  soft shadows, hand-drawn frame lines.
- One rounded, legible typeface bundled locally for offline play, with all Icelandic letters.
  Captions at least 24 px. The speaker's name is shown in the speaker's main hue.
- Mini-games share the journal look; their pieces use the character hues.

## 11. Performance budget (tablet preset)

- Reference laptop (Iris Xe, 1280x800): `__benchmark(120)` GPU median at most 6.0 ms in `tablet`
  and 3.5 ms in `low`. The device gate is 30 fps on the test tablet.
- In any shot: at most 100 draw calls, 250k triangles and 96 MB of textures. A dinosaur is at most
  40k triangles.
- The forest's share in clearing shots: at most 3.5 ms, 60 draw calls and 150k triangles.
- No full-screen post-processing on tablet: no bloom, SSAO or depth-of-field passes. Use instancing,
  merged static geometry, distance LOD, and cards or impostors for the far forest.
- Dynamic resolution may drop to 0.6 on slow devices; art must still read at that scale.

## 12. Asset pipeline

Characters (decision: always our bake tool, four-legged and two-legged alike):

1. Concept image in two passes, using `design/mosi/*-prompt.txt` as templates. First a personality
   reference: species, personality, palette from section 3, friendly face, front three-quarter
   view, plain off-white background. Then a rest-pose source: simplified matte surfaces, symmetric
   neutral stance, straight spine and tail, all feet flat, near-orthographic view about 60 degrees
   from the front, plain light grey background, no accessories. A two-legged character stands in
   an A- or T-pose with the arms clear of the body (Egill arrived in an A-pose); Egill's two
   prompts are in `remake/prompts/`.
2. Tripo image-to-3D from the rest-pose image: about 30 to 40k faces, 2K textures, exported in parts.
3. Bake tool: rig, soft weights, clips, one skinned mesh, 1024 JPEG, the bone names the game
   expects, at most 40k triangles.
4. Life in code: blinking eyelids, look-at, breathing, celebration.
5. Check: fixed comparison shots, GPU ms in the tablet preset, provenance in `visual-assets.json`,
   review against this guide. Reject it if it fails.

Mosi was baked with `lab/gfx-demo/tools/bake-mosi.mjs`. Two-legged characters go through
`remake/tools/bake/`: `bake-biped` for Egill, `bake-tailed-biped` for the theropods (Grameðla). An
unrigged Tripo export comes in many parts and far over budget (Egill arrived in 11 parts with 395k
triangles, Grameðla in 17 with 390k), so it is first decimated in Blender, keeping the parts:

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python remake/tools/blender-decimate.py -- <tripo.glb> <parts.glb> 20000 tripo_part_0 parts
```

The script welds the vertices the GLB splits along UV seams before it decimates (decimating split
seams opens thin cracks that show as dark lines and specks). It also welds the seams between parts:
where a vertex of one part lies on an edge of the other it splits the edge, and it fills the
pinholes left where seams meet, so the surface is closed. Then it decimates the whole mesh at once
and splits it back into its parts, with the normals of the whole mesh, so the seams stay closed and
shade alike. (Tripo's own seams have hairline cracks and normals that disagree, by up to 33
degrees across the back of Grameðla's neck and 150 at her lips: the thin dark line on her back was
the seam between body and head.) The head keeps relatively more detail, and
`keep=<part>` keeps a part's seams as Tripo made them: Grameðla's lower jaw, whose seam with the
face becomes her lips (`37600 tripo_part_2,tripo_part_7,tripo_part_10,tripo_part_12 parts
keep=tripo_part_7`). Then the bake, in headless Edge:

```bash
node remake/tools/bake/bake-character.mjs --page bake-biped --out <name>.glb --query "src=<parts.glb, relative to the page>&height=1.1&yaw=90&name=<Name>&out=<name>.glb"
```

`bake-biped` stands the model at the origin facing +X, tells the parts apart by position (head,
torso, hips, upper arms, forearms with hands, legs, feet), places 20 humanoid joints from the seams
between parts, gives every vertex smooth weights that agree on both sides of each seam, and authors
the clips in code (`biped-clips.js`: idle, walk, wave, waveLeft, point, sit, lifted). Rest
rotations are identity, so a clip turns bones about the character's own axes (X forward, Y up,
Z right). A child's arms are short against his head: a raised hand reads by staying out to the
side, and past about 165 degrees from hanging the forearm folds over the head.
The walk is authored from the feet, not from joint angles (`WALK` in `biped-clips.js`): at its
own speed (0.55 m/s, 0.8 s a stride, 150 steps a minute) a foot lands flat and stays put while the
body passes over it; just after the other foot lands, its heel peels up about the toe, which stays
put too; then it swings forward, toes up late in the swing, and comes straight down flat. Two-bone
IK (the knee a hinge about the thigh's Z axis) reaches each foot, and the hips are as high as the
legs allow at 99.5 % of their length, smoothed, so the bob (about 2 cm) follows the stride. The arms
swing 18 degrees against the legs. In a scene, `engine/footing.js` plants a biped's feet as it does
Mosi's, in walks, starts, stops and turns on the spot: the legs reach a planted foot by the same IK
and the hips sink when a leg could not reach it otherwise. A clip that leaves the legs at rest (idle,
wave, point) keeps the feet where they stand. Footing's distances and times are tuned per body plan
(`QUADRUPED` on Mosi as he is today, `BIPED` on Egill) and scale with each actor's legs, measured
from the skeleton in the bind pose: lengths in proportion, times by the square root. A character
re-baked at another size (Mosi at 8.5 m) steps in proportion without retuning; its walking speed
should grow with the square root of its size too.
`bake-tailed-biped` (`--query "src=<parts.glb>&length=12&name=Grameðla&out=trex.glb"`) stands the
model at the origin facing +X at its length nose to tail. It finds the heading from the footprint
and the left and right pairs, tells the parts apart by position and shared seams (body, tail, head,
lower jaw, thighs, feet and claws, arms; one side's upper arm may hide in the body part), flattens
the soles onto the ground and places 25 joints: Hips, Spine, Chest, Neck, Head, Jaw, Tail1 to Tail6,
short arms, and digitigrade legs rigged as the engine's footing expects a biped's: Thigh, Shin and
Foot, the Foot (at the raised heel) carrying the metatarsus, toes and claws as one, so a heel peels
up about the toes. Weights come from the spine by position along the body, from the legs and arms
by the planes that halve each joint, and from the jaw by position along it; the copies of a position
share a weight, and a few rounds of smoothing over the surface take out the steps at the seams.
The front of the lip seam opens: the jaw side gets vertices of its own, and a pocket (palate and
tongue, painted into a free corner of the colour map) fills the mouth, so the roar shows a pink
mouth with no teeth. The clips are in `tailed-biped-clips.js`: idle, walk and roar, the legs posed
by the same two-bone IK as footing (`engine/ik.js`). In the walk a foot lands flat and sweeps back
at exactly stride per cycle (2.8 m in 2.5 s, 1.12 m/s), its heel peels up about the toes as the
other foot lands, and it swings forward in an arc; in a scene footing plants her feet in walks,
starts, stops and turns as it does Egill's.
`remake/tools/prep-character.mjs` stays for static models (stand, scale, face +X, 1024 px
textures, matte). Render characters single-sided when the mesh is closed: a double-sided character
that fills the frame costs about 0.7 ms more on the reference laptop.

Environment:

- Built in code first: procedural, instanced and ready for wind. A Tripo plant or rock replaces a
  code-built kind only when a side-by-side capture shows it is better and it fits the budget: tree
  at most 6k triangles at LOD0, bush 1.5k, fern 600, flower 200, rock 1k, one 512 to 1024 texture
  per kind.
- Tripo prompt for vegetation: "Stylized storybook [plant] for a children's dinosaur adventure,
  soft chunky rounded shapes, broad simple leaf clusters, hand-painted matte texture in [hexes from
  section 4], no tiny leaves, no photo detail, one isolated object, front three-quarter view, plain
  light grey background, soft even light."

## 13. Review checklist

Reject the work if any of these fail:

- Mosi and the speaking character read at once in a greyscale thumbnail of the frame.
- No green-on-green mush around Mosi, and his contact shadow is present.
- No flicker or shimmer (alpha edges, shadow acne, z-fighting), no floating or sunken objects, no
  visible repetition.
- Camera rules hold: lens, speed, holds and safe areas.
- The budget holds in the tablet preset on every review shot.
