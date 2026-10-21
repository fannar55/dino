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
  that blink (code), painted matte skin, a pale belly as a family trait, no scary teeth (the T. rex's
  few teeth are soft and rounded), a closed kind smile at rest.
- Eyes stay painted as Tripo made them; the lids are code (`engine/eyelids.js`): skin-coloured lids
  (the skin just above and just below each eye) with a dark lash line, fading into the painted skin.
  A shut eye is a soft downward curve, the content closed eye, never a squint. Scenes may rest the
  eyes half shut (sleepy) or shut; the blinks go on over half-shut eyes.
- Mouths (the owner, 2026-10-15): a character with a jaw opens it when it speaks, about 10 degrees on
  the loudest syllables, and wide (26 degrees) only for Grameðla's friendly roar; inside is a pink
  pocket. Only the T. rex has teeth: a few soft, rounded ivory ones, set in from the lips, so a closed
  mouth keeps its smile and an open one shows them. Mosi's beak opens a little when he speaks, with
  no teeth. Egill does not need to talk: his lips stay closed in his smile. Everyone who speaks also
  nods and tilts the head a little.
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
| Kambeðla | Stegosaurus | 7 m long (6.5 to 9) | violet | `#8f6aa3` | `#cfb6c6` | plum back `#5d4370` | lilac plates `#ab85c1`, ivory tail spikes `#d2bda9` |
| Þórseðla | Brontosaurus | 22 m long (21 to 22) | golden yellow | `#e9b14d` | `#e7c181` | `#89682e` | caramel patches `#be8c40`, beige throat `#c2a270` |
| Grameðla | T. rex | 12 m long (12 to 12.8), hips 3.7 to 4 m | terracotta | `#b37955` | `#ead0b4` | cocoa back `#87532e` | ivory claws `#efe2c8`, amber eyes |
| Uggeðla | Spinosaurus | 14 m long | teal | `#47908a` | `#b1cbb4` | `#3a604f` | coral sail `#ed715d` with peach stripes `#fb8d72`, amber eyes, beige claws |
| Slóeðla | Parasaurolophus | 7.5 m long (up to 9.5) | blue | `#6793d0` | `#8b9ebb` | back stripe `#4b6fa4` | pale blue crest `#aac3e6`, beige toenails, amber eyes |
| Flugeðla | Pteranodon | 7.5 m wingspan (5.6 to 7.6) | pink | `#dc8090` | `#f0ccb7` | raspberry crest `#955055` | peach wing membrane `#ebaf98`, cream beak, amber eyes |

Grameðla keeps the terracotta of the owner's Tripo model (2026-10-15), and Kambeðla moved from
orange to the free violet slot; its Tripo model (2026-10-15) gives the violet row its values, with
lilac plates. Þórseðla is a Brontosaurus, as her Icelandic name says (2026-10-16), and her Tripo
model gives the golden row its values. Flugeðla's wingspan is the upper end of the range so she can
carry Egill, and her Tripo model (2026-10-16) gives the pink row its values; that pink leans to coral.
Slóeðla's Tripo model (2026-10-16) gives the blue row its values, close to the row it replaced.
Uggeðla is teal (the owner's choice, 2026-10-16, instead of coral red), and her Tripo model
(2026-10-17) gives the teal row its values, with the coral sail of the owner's concept; only her
sail is warm, so the warm bodies stay with Grameðla and Flugeðla. Her teal is well apart in hue from
the forest's greens and from Slóeðla's blue; the far canopy before the fog has nearly her hue but is
darker and greyer, so keep her clear of it in wide shots. Sizes are adult estimates from the
species' Wikipedia pages
([Triceratops](https://en.wikipedia.org/wiki/Triceratops),
[Tyrannosaurus](https://en.wikipedia.org/wiki/Tyrannosaurus),
[Stegosaurus](https://en.wikipedia.org/wiki/Stegosaurus),
[Brontosaurus](https://en.wikipedia.org/wiki/Brontosaurus),
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
- Looks live in `engine/looks.js`: `morning` (default, sun azimuth 135, elevation 32), `lateMorning`
  (chapter 2: later the same morning, azimuth 150, elevation 26, a warmer sun and a lighter mist),
  `golden` (late afternoon, elevation 15) and `evening` (sunset, elevation 6). A chapter picks one.
  Looks change only between chapters or as a slow authored change.
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

- Always alive: breathing idle, blinks every 2 to 6 s (now and then two in a row, and one with each
  new thing a character looks at), glances at the camera, tail sway.
- Speaking: the speaker's mouth follows its line: the recording's loudness (`assets/audio/lines.json`),
  or the syllables of a line without a recording. The head dips a little on the stressed syllables
  and tilts gently while the line goes on: small, so the line stays the one important motion.
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
- One rounded, legible typeface bundled locally for offline play, with all Icelandic letters: Nunito (the owner's
  choice, 2026-10-17), under the SIL Open Font License 1.1, in `remake/assets/fonts/`: `nunito-latin.woff2`, Google
  Fonts' Latin subset of the variable font (declared for weights 400 to 900), and `OFL.txt`, which stays beside it.
  The subset covers Latin-1, so every Icelandic letter is there: á é í ó ú ý þ ð æ ö and their capitals. `style.css`
  and `book.css` each declare the one `@font-face` (the book's lab links only book.css and the game only style.css, so
  the two rules are alike word for word), both pages preload the file, and the page's font and the book's
  `--book-font` are `"Nunito", ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`: a
  tablet's own face is reached only for a glyph Nunito lacks. Captions at least 24 px. The speaker's name is shown in
  the speaker's main hue.
- Mini-games share the journal look; their pieces use the character hues.
- **Interaction**, as chapter 1 plays it (2026-10-17):
  - No fail states. Every wait for the child ends by itself, a tap on something optional (a critter, a butterfly,
    Mosi's nose) never holds up the story, and a flower let go in the wrong place goes back to the tray.
  - Every required wait races an idle timer: Egill waves by himself 4 s after Mosi has stopped, floats up into the
    saddle after 6 s and says yes to the choice after 25 s; in the drags Mosi says it again at 12 s and Egill gives
    the next flower himself at 20 s; a star nobody taps flies into the book after 8 s.
  - A search gives a hint at 12, 24 and 36 s (a line and a pan to the place), and at 48 s the thing is found for
    the child. A find stops a hint; a drag takes the camera back from its pan at once.
  - Handheld sway is off before every required tap and before a choice, so the camera is still when the child aims.
  - A drag hits when the item is let go within 90 px of the target, where the child sees the target at that moment.
    The carried item floats 18 px above the finger, so the finger does not hide it, and that point is what counts.
  - Tap first: a press let go within 12 px is a tap, however long it was held (no 300 ms limit), and what the finger
    landed on is what was tapped. Taps come from pointer events on a canvas with `touch-action: none`, so there is
    no 300 ms click delay, and a long press opens no menu. Every finger counts on its own, so a thumb resting on the
    glass stops neither another finger's tap nor its look: the first finger to move 12 px drags, one drag at a time.
  - Tap targets: a target in the world is a sphere round a point, sized in metres (Mosi's nose 0.45, Egill 0.7, a
    glow flower 0.55, the star 0.85) and never less than 44 px across on the screen; tray items are 64 to 88 px,
    the journal's button 64 px, and the choice buttons 64 px high, side by side with each label on one line
    (they fit a tablet held upright). Captions are 24 px or more and stand over the fade and the open book.
- **The book** (the education book: `engine/book/` and `book.css`, 2026-10-18) keeps the journal's look and these rules:
  - Every control is at least 80 px across, and the book makes them 88 px (`--book-target`): the arrows, the close buttons,
    the speaker, the ribbons, the tiles and the ⓘ (a small dot in a full-size hit area), whatever they look like.
  - The type is Nunito (`--book-font`), as everywhere, with few words and big: a card's sentence and a tile's name.
  - The book's sounds are made on the spot with the game's own tools, and every note is a note of the theme's key
    (`theme.json`) or an octave of one, so they sit in the music (`engine/book/book-sounds.js`). They dip under the narrator
    as the music does under a line.
  - Motion is transform and opacity only. When the tablet asks for less motion (`prefers-reduced-motion`) the book holds
    still and moves as fades: it opens, closes, turns a page and zooms a picture as a fade, a press is a short fade and the
    sparkles fade where they are; no tile breathes or rocks, and only the twinkle goes on, fading in and out where it is.
    The sounds are the same.

## 11. Performance budget (tablet preset)

- Reference laptop (Iris Xe, 1280x800): `__benchmark(120)` GPU median at most 6.0 ms in `tablet`
  and 3.5 ms in `low`. The device gate is 30 fps on the test tablet.
- In any shot: at most 100 draw calls, 250k triangles and 96 MB of textures. A dinosaur is at most
  40k triangles.
- The forest's share in clearing shots: at most 3.5 ms, 60 draw calls and 150k triangles.
- No full-screen post-processing on tablet: no bloom, SSAO or depth-of-field passes. Use instancing,
  merged static geometry, distance LOD, and cards or impostors for the far forest.
- Characters draw at half their triangles below 700 px on screen and a quarter below 200 px (the
  bind-pose diagonal) or out of view, and cast the sun shadow with the quarter
  (`engine/character-lod.js`). The sun's shadow map is a depth texture (`engine/shadows.js`). Wide
  real-size shots with three characters stay under 250k triangles this way.
- Dynamic resolution may drop to 0.6 on slow devices; art must still read at that scale.

Measured costs, chapter 1 (2026-10-17): whole frames with the shadow pass on the reference laptop (Iris Xe, Edge, 1280x800,
tablet preset), one key frame a scene or two. GPU is the median of 24 interleaved pairs of 60-frame medians in one page load,
the method the part costs below need; the budget above is one `__benchmark(120)` median, which reads a little differently, and
either checks it. The same frame measured 1 to 2.3 ms more when the laptop was warm and busy than when it was quiet, so both are
given: quiet is one round on a cool laptop with nothing else drawing, warm is the worse of two rounds on a laptop warm from an
hour of GPU work and sharing its power with a busy CPU. The forest's main pass is counted by the renderer with everything else
hidden. t is where a capture (`?t=`) shows the frame.

| Scene | Frame | t (s) | GPU ms, quiet / warm | Calls | Triangles | Forest main pass |
|---|---|---|---|---|---|---|
| 1 | the clearing, waiting, three shafts | 19.5 | 3.46 / 5.38 | 39 | 153,574 | 124,971 |
| 2 | Mosi walks in (track) | 36 | 3.34 / 5.60 | 38 | 168,459 | 111,851 |
| 3 | the sneeze, pollen 0.4 s on | 66 | 3.31 / 5.12 | 40 | 177,070 | 118,106 |
| 4 | Mosi close, a butterfly on his horn | 79.0 | 3.08 / 4.17 | 38 | 170,246 | 110,959 |
| 5 | Egill floats up | 122.5 | 3.46 / 5.27 | 44 | 171,719 | 114,502 |
| 6 | rideWide, birds flying up | 137.4 | 3.39 / 4.87 | 60 | 178,955 | 130,079 |
| 6 | rideFeet, the footprints | 153.5 | 3.29 / 5.10 | 55 | 182,287 | 120,259 |
| 7 | the glade, four shafts | 186.0 | 3.73 / 5.70 | 56 | 214,446 | 126,942 |
| 7 | Kambeðla close (overEgill) | 204.0 | 3.80 / 5.91 | 44 | 221,415 | 102,999 |
| 8 | the search, a glow flower | 224.5 | 3.58 / 5.36 | 45 | 221,918 | 123,613 |
| 9 | feeding, the posy in his hands | 248.5 | 4.10 / 5.94 | 51 | 211,851 | 107,279 |
| 10 | the invitation | 278.4 | 4.05 / 6.01 | 57 | 214,990 | 136,829 |

Re-measured after the sun got its hands and Egill his hop (2026-10-17): the frames land at the same t, since the capture's
timeline is what it was, and the calls and triangles above are this round's. Kambeðla's mouth pass adds 1,556 triangles where
she is near (1,160 at her half detail), the sun's overlay 1 call and 6 triangles wherever its bounding sphere, which takes in
the hands, reaches into the frame (the glade's arrival looks toward the sun), and an eyelid shell 1 call while its lids close
(Egill's 351 triangles, mid-blink at 186.0); a few
triangles more or less elsewhere are not traced. GPU in this round, on a warm laptop: 3.21 to 4.98 ms, each frame between its
quiet and warm figures, the worst single pair 6.00 ms (the search).

Textures are 37.6 MB in every frame: the characters' six maps 31.9, the environment map 3.0, the sun's face 1.0 (three frames)
and the sheet of its mouths and hands 0.7, the Mosi cloud 0.7, the sky's noise 0.3. The glade's two-shots have no headroom on a
warm laptop. What each part adds, from the same pairs (the frame with it against the frame without it, the mean of three page
loads unless it says one):

- three light shafts in the clearing: +0.46 ms, 2 calls (the shafts and their motes); four in the glade: +0.26 ms, 2 calls
  (+0.30 ms in the invitation, one load);
- the leaf shadows on the floor and on the grass: +0.03 to +0.06 ms in the invitation, the feeding, Kambeðla's close-up and the
  waiting shot (one load each), and their part on the grass alone is within the noise (+0.03 on average) while it carries most
  of the dapple: without it the clumps all but vanish from the grass;
- a glade shaft that fades in further from the camera (`shaft.near` [2.5, 6.5] m instead of [1.5, 5]): no cost and no pixel
  changes in the arrival or the invitation, whose cameras stand more than 6.5 m from every shaft. A shaft's fragments are drawn
  whatever their alpha, so only drawing less of a shaft would save anything;
- Kambeðla's plate glow close up: +0.12 ms, no calls or triangles;
- the pollen of a sneeze 4.6 m from the camera: +0.11 ms, 1 call (its specks are about 80 px there);
- the ride's critters (six birds in one instanced call, a beetle, a frog, a snail): +0.15 ms, 4 calls, 2,656 triangles;
- Mosi's footprints, about 20 alive: +0.04 ms, 1 call, 144 triangles a print;
- a glow flower: no cost that shows; 2 calls and 218 triangles glimmering, 1 call held in a hand;
- the invitation's large parts, each taken out whole (one warm load): the grass +1.29 ms, the three characters +1.09, the
  trees, ferns and other plants +0.83, the ground +0.60, the shafts and their motes +0.30.

A material's first frame builds its shaders. On a child's first play (a cold browser cache) that was a frame of 0.2 to 0.6 s
on the reference laptop wherever something was drawn for the first time (the first blink's eyelids, Kambeðla's skin, the
critters, the glow flowers), the first change of place held the screen black 1.8 to 2.5 s (the glade's forest was built in a
1.2 to 1.8 s frame, its first frame took 0.6 s), and a frame over 0.2 s makes the music jump back to the game's clock. So the
chapter is drawn once behind the black before the start button shows (`engine/warm-up.js`, `chapter.warmUp`: 17 programs
in about 2 s on a cold cache), the glade is built and drawn then too (`chapter.prepare`), and a change of place is drawn
once more under the black while the music moves its playhead instead of jumping back (`music.lenient`). In two cold first
plays (2026-10-17) the button came 0.9 and 4.0 s later than in one before, the frames over 100 ms after the touch went from
11 to 2 and 1, the black between the ride and the glade from 1.8 s beyond its fades to 0.2 s, and the music's jumps from 5 to
2 and 0 (the 2 after a 0.9 s frame in the search that built nothing: the browser itself stalled).

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
4. Life in code: the face pass (below) finds the painted eyes; the engine gives every character
   blinking eyelids, talking, look-at, breathing and celebration.
5. Check: fixed comparison shots, GPU ms in the tablet preset, provenance in `visual-assets.json`,
   review against this guide. Reject it if it fails.

Mosi was baked with `lab/gfx-demo/tools/bake-mosi.mjs`; the remake bakes him at his real size with
`--query "length=8.5"` (one uniform scale on the root node), while the game keeps the fitted size.
Two-legged characters go through `remake/tools/bake/`: `bake-biped` for Egill, `bake-tailed-biped`
for the theropods (Grameðla). An unrigged Tripo export comes in many parts and far over budget (Egill
arrived in 11 parts with 395k triangles, Grameðla in 17 with 390k), so it is first decimated in
Blender, keeping the parts:

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
the seam between body and head.) The head keeps relatively more detail (1.6 times the share of the
rest; `detail=<x>` gives a small head seen close up more: Þórseðla 4.5), and `keep=<part>` keeps a
part's seams as Tripo made them: Grameðla's lower jaw, whose seam with the face becomes her lips
(`37600 tripo_part_2,tripo_part_7,tripo_part_10,tripo_part_12 parts keep=tripo_part_7`). Then the
bake, in headless Edge:

```bash
node remake/tools/bake/bake-character.mjs --page bake-biped --out <name>.glb --query "src=<parts.glb, relative to the page>&height=1.1&yaw=90&name=<Name>&out=<name>.glb"
```

`bake-biped` stands the model at the origin facing +X, tells the parts apart by position (head,
torso, hips, upper arms, forearms with hands, legs, feet), places 20 humanoid joints from the seams
between parts, gives every vertex smooth weights that agree on both sides of each seam, and authors
the clips in code (`biped-clips.js`: idle, walk, wave, waveLeft, point, sit, lifted, hop). Rest
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
and the hips sink when a leg could not reach it otherwise. A step footing takes itself is over its
spot a fifth of its time before it lands, so it comes straight down. A clip that leaves the legs at
rest (idle, wave, point) keeps the feet where they stand. The hop (`HOP`, 1.15 s, played once) is
authored from the feet too: they stay on their spots while the hips sink 65 mm and spring 0.30 m,
draw up a little in the air and land where they were, and it starts and ends in idle's first pose;
a clip that moves the legs, as it does, has them until the next walk or turn. Footing's distances and times are tuned
per body plan (`QUADRUPED` on Mosi as he is today, `BIPED` on Egill) and scale with each actor's
legs, measured from the skeleton in the bind pose: lengths in proportion, times by the square root.
A character re-baked at another size (Mosi at 8.5 m) steps in proportion without retuning; its
walking speed should grow with the square root of its size too.
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
mouth; on the pocket stand 15 soft rounded teeth (`teeth`: 8 upper on the head, 7 lower on the jaw,
450 triangles, ivory painted into another free corner), set in from the lips and leaning into the
mouth so closed lips cover them. The clips are in `tailed-biped-clips.js`: idle, walk and roar, the legs posed
by the same two-bone IK as footing (`engine/ik.js`). In the walk a foot lands flat and sweeps back
at exactly stride per cycle (2.8 m in 2.5 s, 1.12 m/s), its heel peels up about the toes as the
other foot lands, and it swings forward in an arc; in a scene footing plants her feet in walks,
starts, stops and turns as it does Egill's.
Uggeðla (the Spinosaurus) goes through the same tool, cut differently by Tripo: her legs and arms are
one part each (hip to toes, shoulder to claws), her head holds both jaws, and a sail stands on her back
and tail's root, a closed shell 15 to 40 cm thick welded into the skin, so the single-sided material
shows it from both sides
(`--query "src=<parts.glb>&length=14&yaw=180&name=Uggeðla&out=spinosaurus.glb&teeth=0&ahead=1&neck=0.7&stride=3.2&cycle=2.8&clips=idle,walk,kink,happy,wade"`).
A ground part that reaches past a third of her height is a whole leg; Tripo stood her in mid-stride, so
each leg keeps its own knee, heel and toes (only the hips are mirrored) and footing plants her feet
where they stand. An arm of one part gets its elbow and wrist where its centre line, measured over its
surface from the shoulder's seam, bends most. Her sail rides the back below it (Hips, Spine, Chest and
the tail's first bones, never the neck), and with a sail the clips bend those a third as much, so the
sail never stretches or folds (its top edge keeps its length within 1 % in every clip). `ahead=1` turns
her neck and head back to face +X (Tripo turned them 16 degrees to her left) about the vertical where
the head's own axis crosses her midline, fading down the neck. `neck=0.7` puts the Head joint at the
top of her neck (the middle of the head's seam with the body) and the Neck joint 0.7 m down it, and the
head rides its bone whole, so her long snout never bends. `clips=` picks the clips from
`tailed-biped-clips.js`: idle, walk (3.2 m in 2.8 s, 1.14 m/s), kink (a friendly nod), happy (two bobs
on bent knees, the tail swishing) and wade (slow steps through shallow water: lower and leaning
forward, the neck bent down and the head turned back up so the snout hangs about 1.9 m up over the
water, the feet lifted high, the tail sweeping for balance; 2.2 m in 4.2 s). A scene wades her with
`walkTo(points, { clip: 'wade' })`: the actor measures each walking clip's own speed. Her jaw comes
from the mouth pass (below), with `corners=1` (a triangle goes to the side its corners are on, so the
long thin ones along her snout's mouth line do not stretch across it) and `fold=0.04,0.01` (the
pocket's channel lies higher, so it stays inside her rounded snout tip with the mouth shut); she talks
with the jaw opening 6 degrees, and has no teeth.
After every bake, the face pass finds the eyes painted into the colour map and writes them into the
GLB as extras on the skinned mesh (`face.eyes`); geometry and textures stay byte for byte:

```bash
node remake/tools/bake/bake-character.mjs --page face --out remake/assets/characters/<name>.glb --query "src=../../assets/characters/<name>.glb&out=<name>.glb"
```

`face.js` (with `eyes.js`) maps every texel of the head onto the surface, takes dark blobs as pupil
candidates and keeps the two whose surroundings are not skin (an iris, a sclera paler than the skin,
highlights), in front of the head's pivot and side by side, so nostrils and ear holes drop out. Each
eye's outline is an ellipse with its own heights above and below the centre (almond eyes), grown over
the rim the eye is painted in; the lids take their colours from the skin above and below it.
`preview=1` shows what it found; if it ever picks wrong, `eyes=x,y;x,y` gives colour-map pixels near
the pupils. The engine's eyelids are copies of the skin's triangles over each eye (300 to 1,300
triangles a character), skinned by the same bones and drawn only where a lid covers: one draw call
per character while a lid moves, nothing while the eyes are open.

A character without a jaw whose mouth should open gets one from the mouth pass, after the face pass
(it takes the head's frame from the eyes). Mosi's beak is one Tripo part and his lower jaw belongs to
the head part, so there is no seam to open as Grameðla's: `mouth.js` cuts one along a mouth line given
in the head's frame (f forward and u up from the eyes' midpoint, read off a gridded side view):

```bash
node remake/tools/bake/bake-character.mjs --page mouth --out remake/assets/characters/mosi.glb --query "src=../../assets/characters/mosi.glb&out=mosi.glb&line=<f,u;f,u;...>&front=<f>&cut=<f>&hinge=<f,u>&talk=7"
```

Below the line, behind `front` (the hook of the upper beak) is the jaw. In front of `cut` the triangles
that cross the line are split along it and the jaw side gets vertices of its own, so the lips open;
behind it the line stays closed and the cheek stretches. A Jaw bone under the Head at `hinge` takes the
jaw (its share grows from the hinge to the cut, smoothed over the surface), a pocket (palate and
tongue) fills the mouth, and `face.mouth.talk` says how far the jaw opens when the character talks
(Mosi 7 degrees). The pass re-exports the GLB (textures 1024 JPEG) with the node names as they were;
`preview=1&deg=8` shows it open, and `snap=<metres>` counts vertices that close to the line as on it,
so a vertex a hair off the line leaves no sliver across the open mouth (Þórseðla: 0.003). Mosi: 55
triangles split, 54 lip vertices opened, a 1,176-triangle pocket, 25,222 triangles in all; the
game's `dist` model is untouched.
`remake/tools/prep-character.mjs` stays for static models (stand, scale, face +X, 1024 px
textures, matte). Render characters single-sided when the mesh is closed: a double-sided character
that fills the frame costs about 0.7 ms more on the reference laptop.
Four-legged characters (Kambeðla) go through `bake-quadruped`
(`--query "src=<parts.glb>&length=7&yaw=180&name=Kambeðla&out=stegosaurus.glb"`): `quadruped-rig.js`
rigs and weights the model, `quadruped-clips.js` authors the clips. Their Tripo parts meet along
seams, so they are decimated as one mesh and split back (Kambeðla: `38000 tripo_part_3 parts`).
The bake stands the model facing +X at its length nose to tail, with the root midway between the
feet, and tells the parts apart by position: the four that stand on the ground are the legs, the
biggest of the rest is the body, the biggest part ahead of the fore legs is the head, and every
other part (plates, spikes, horns) rides rigidly on the bone under its base, seam and all, the skin
around its foot blending out from that bone, so a bend next to a plate never folds it. Bones have identity
rest rotations: Hips over the hind legs, Spine, Chest over the fore legs, Neck, Neck2, Head (under
the top of the skull), Tail1 to Tail6 on a smooth line, and Mosi's legs with the names footing
plants, one rigid bone each hanging from the root (FrontLeg, BackLeg .L/.R) with the foot below
(FrontFoot, BackFoot). The parts weld into one closed skin, so the material is single-sided, and
the copies of a seam vertex share one set of weights. Each chain bone holds the stretch from its
joint to the next, blended around the joints. A leg holds its part up to where it meets the body
and, fading out toward a pivot at half the height, the bulge above it; the body around it follows
as heat would spread over the surface (a harmonic field), so a deep belly squeezed between a fore
and a hind leg is shared out evenly instead of folding where a fade ends. A float attribute
`plateRow` (`_PLATEROW` in the GLB, `geometry.attributes._platerow` once three loads it) is 0 off
the plates and counts the plates on the back in rows from the head (plates side by side share a row,
the rows hold about equal plate area; Kambeðla has 3: neck and shoulders, the two big back plates,
hips and tail), so the runtime can light them row by row. Clips: idle (4 s), kink (2.4 s: the chin
lifts a little, the head nods twice, the second time less), eat (2 s: the head comes down in front
of her until the mouth is about a metre above the ground, where a child holds up a flower, nips,
chews three times and goes back up), happy (1.5 s: a crouch, a hop that lifts all four feet about
9 cm, a soft landing and a wiggle; the clip keys the legs, so footing hands them to it) and the walk, four
beats in lateral sequence, a foot down 55 % of the time, a stride of 1.18 times the pivot height
at a Froude number of 0.045 (Kambeðla: 2.21 m in 2.43 s, 0.91 m/s). A planted foot sweeps back at
exactly that speed and passes under its pivot (Tripo stands a hind foot behind the hip), and each
girdle rides as high as its planted legs reach at their rest length, smoothed, so a rigid leg
slides along its axis only in the swing. Footing plants the feet in walks, starts, stops and turns,
and keeps them where they stand in idle, kink and eat.
A sauropod (Þórseðla) goes through `bake-quadruped` with `kind=sauropod`
(`--query "src=<parts.glb>&length=22&yaw=180&name=Þórseðla&out=brontosaurus.glb&kind=sauropod&neck=5&tail=8&atlas=0.82&brow=1"`).
Her parts are a head, a neck, a body cut in two and four legs with their toenails: the head is the
part that holds the nose, the trunk is every part on the way along the seams from the head to the
body, and a part that sits on a leg alone (a toenail) rides that leg's foot. Her neck rises at about
45 degrees, so its joints (Neck to Neck5, a metre apart) are spaced along its centre line, and the
skin follows the chain by where it lies along the line through the joints, a point far from the
line (the chest under the neck) blending the stretches nearly as close; the head is rigid in front
of its joint, so the eyes and the mouth move as one. The tail has eight bones. Tripo gave her small
head about 1 % of the texture, a hundred texels across at 1024 px: `atlas=0.82` narrows the rest of
the atlas to 82 % of its width and copies the head's islands from the 2048 px source into the column
that frees up, at twice their old size (`atlas.js`; an island only moves and scales, so the normal
map stays right). Her brow ridges overhung the eyes and read stern: `brow=1` smooths the skin over
each eye along its normals until the ridge and the crease under it melt into one soft slope, the
eye's outline untouched (`brow.js`). The clips are in `sauropod-clips.js`: idle (6 s), a slow walk
(four beats, a foot down 62 % of the time, a stride of 0.9 times the pivot height at a Froude number
of 0.025: 3.88 m in 3.77 s, 1.03 m/s), kink (2.8 s), lowerHead (4.5 s: the neck curves down in front
of her until her eyes, found as the face pass finds them, are at a child's eye height, 0.95 m),
liftUp (8 s: from that pose the neck rises slowly to its full height, her eyes 9.4 m up, the head
level all the way so a child on it stays on) and happy (2.4 s: she rocks back so her front feet leave
the ground by up to half a metre, stamps them down and wiggles her neck and tail). lowerHead and
liftUp carry `once` in their extras: the actor plays such a clip once and holds its last pose until
the next one.
A pterosaur (Flugeðla) goes through `bake-quadruped` with `kind=pterosaur`
(`--query "src=<parts.glb>&span=7.5&yaw=90&name=Flugeðla&out=pteranodon.glb&kind=pterosaur"`):
`winged-rig.js` rigs and weights her, `winged-clips.js` authors the clips, and the weld, the surface
distances, the harmonic fields and the weighting along a chain that they share with `quadruped-rig.js`
are in `skin.js`. She is scaled to her wingspan. Her parts are two legs (on the ground), two wings
(reaching out more than 0.4 of the span), the head with its crest (the highest part), the beak (it holds
the nose and touches the head; the mouth pass cuts the jaw out of it), the body (it touches both legs)
and two arms (each between a wing and the body); the head and the beak ride the Head rigidly, crest and
all. Tripo turned her head 19 degrees to one side: the bake turns it back about the top of the neck,
fading down the neck. Bones, with identity rest rotations: root, Hips, Spine, Chest, Neck to Neck3,
Head, Tail1 to Tail3, the legs as Grameðla's (Thigh, Shin and Foot, Left and Right, as footing plants
a biped) and on each wing UpperArm, Forearm, Wrist, Claws (the three small clawed fingers) and Finger1
to Finger3 (the long fourth finger along the membrane's leading edge). Her membranes are closed thin
shells about 3.5 cm thick, not open sheets, so they stay in the one closed, single-sided skin. A
membrane is held along its seams (the arm's, the body's and the thigh's weights there) and along its
leading edge (the finger and the arm by where they lie along the line through their joints);
everywhere else its weights are a harmonic field of all those bones at once, so it blends smoothly
between the long finger, the forearm, the body and the thigh. A point on one face and the point
facing it across the shell share their weights, so the faces bend as one. Folded on the ground
(`FOLD`), a wing's plane is turned along her side and folded in it like a fan, the knuckle of the
long finger on the ground: she walks on her feet and those knuckles, which two-bone IK places in the
wing's plane. Along the middle of her back a strip as wide as her shoulders follows the spine alone,
so a seat there stays put while the wings beat: the bake finds it (the top of her back between the
wings in carry, on Spine) and writes the bone and the point into its report, for a saddle. Clips:
idle (4 s, the wings folded), walk (1.6 s, 1.15 m, 0.72 m/s, a foot down 62.5 % of the time and the
knuckle on its side a quarter cycle later), kink (2.4 s), happy (2.4 s: a hop with a flutter of
half-open wings), takeOff (3.2 s, once, ending in fly's first pose), fly (a 1.4 s wingbeat with the
hips held 2.6 m up; a scene moves her root through the air), glide (6 s, banking 9 degrees each way),
land (3 s, once, from fly's first pose to idle's) and carry (3.6 s: two slow, shallow beats, the back
steady and level under the seat). Her mouth is a long slot along the beak: the mouth pass's
`channel=1` runs the pocket along the middle of the beak under the lips instead of back into the
head, so the open beak shows no hole.
A hadrosaur (Slóeðla) goes through `bake-quadruped` with `kind=hadrosaur`
(`--query "src=<parts.glb>&length=7.5&yaw=180&name=Slóeðla&out=parasaurolophus.glb&kind=hadrosaur&neck=3&tail=6&atlas=0.75&touch=4&brow=1&even=4"`),
decimated with her head and crest keeping the head's share (`37500 tripo_part_4,tripo_part_6 parts`).
Her body is cut in two across the hips, so the trunk runs from the head through the front half on to
the part that holds the tail's tip (the part furthest back on the centre line; a tail spike stands out
to one side). Her neck rises steeply in an S, so its three joints are spaced along its centre line as a
sauropod's are. Her crest rides the head, and with a crest on top (`crest`) the head's joint goes to the
back of the skull, under the back end of the crest's base, midway up the head part's own section, and
the line the skin follows runs on through the head to the tip of her bill (`tip` in `skin.js`), so her
long head stays rigid in front of its joint, crest and all. The bake and the face pass take `touch=4`:
a dark crease under each heavy brow lies close over the pupil, and blobs merge only when their texels
come within four texels' spacing. Her brows are softened with `brow=1&even=4`: four rounds even out the
moves over the surface, so her coarse brow ridge keeps a smooth outline. The clips are in
`hadrosaur-clips.js`: idle (5 s), walk (four beats, a foot down 58 % of the time, a stride as long as the
hind pivots are high at a Froude number of 0.04: 2.79 m in 2.67 s, 1.05 m/s), kink (2.4 s), happy (2.4 s:
she rears onto her hind legs, her front feet up to 0.44 m), eat (3.6 s: grazing, the neck curving down
until the tip of her bill is 0.12 m above the grass in front of her feet, two crops and chewing) and
call (5 s: her horn call through the crest; a deep breath fills her chest, the Spine bone growing 6 %
while the Chest scales back so the neck and head keep their size, her head rises 30 degrees until the
crest lies back over her neck, and her bill opens as she blows, the head trembling a little). A clip
that opens the jaw carries `jaw` in its extras (degrees at each key), and the mouth pass, which cuts the
jaw after the bake, turns that into the jaw's track (eat and call).

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
