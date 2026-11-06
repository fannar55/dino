# Memory-game character art — first playable review

`triceratops-baby.glb` is a newly authored **baby adaptation of Mosi**, using the
owner's existing textured Tripo model. It is a review candidate, not final art
approval or a claim of a new Tripo generation. No paid generation was used.

The same painted sage skin, cream underside, amber eyes and friendly beak remain.
The torso and tail are shorter, the legs are shorter, the head and eye sockets
are proportionally larger, the frill is lower, and all three horns are smaller.
The brow horns use their actual source mesh parts, with the same shortening
factor on both sides. Welded seam copies receive the same deformation.

The original 25,222 triangles, UVs, textures and skin weights are retained.
The bind skeleton, animation translation tracks and eyelid metadata are adapted
to the new anatomy. Original idle and walk clips remain. The actor controller
adds reveal, greeting, mismatch and nuzzle gestures and uses the game's existing
eyelid renderer. The GLB has a measured beak landmark for pair contact.

## Baby Brontosaurus and Stegosaurus (review candidates)

`brontosaurus-baby.glb` (Þórseðla) and `stegosaurus-baby.glb` (Kambeðla) are
computed the same way from the owner's game models: no drawing, sculpting or new
modelling. The values are factors on each source part. Kambeðla (approved by the
owner as first baked): head ×1.4 with larger eye sockets, neck ×0.85, torso ×0.85,
tail ×0.8 and legs ×0.75 (length only; their girth follows the torso); her eleven
plates and two tail-spike parts also shrink ×0.8 toward their own foot.
Þórseðla, second pass after the first read as a small adult: head ×1.7 with the
eye region ×1.5 on top, torso girth ×1.2 (deeper above the belly line and wider),
tail ×0.65, legs ×0.75 long and ×1.15 thick, neck ×0.85, torso ×0.85. The GLB is
normalized afterwards, so only the ratios show (her head is 2.0 times larger
against the torso, Kambeðla's 1.65). In the game Þórseðla is shown larger than
the others (`MEMORY_CHARACTER_ART.brontosaurus.lengthFactor`), so she stands
tallest. Every triangle, UV, texture, skin weight and clip is kept (Þórseðla:
idle, walk, kink, lowerHead, liftUp, happy; Kambeðla: idle, walk, kink, eat,
happy, and the `_PLATEROW` plate mask). Þórseðla's GLB carries `nose` (snout tip)
and `support` (skull crown) landmarks. The values, measured head bands and part
summary are in each `-source.json`.

The owner approved Kambeðla's baby as first baked and asked for the stronger
Þórseðla pass; the game now loads all three babies (`MEMORY_CHARACTER_ART`,
`roster.json`). `baby-actors.js` places Þórseðla's nose and branch support on her
GLB landmarks; Kambeðla's nose and bark-carry point are measured from her Head
and Jaw skin as before. For the larger Þórseðla the round needed small offsets:
her reach goes 53 % into `lowerHead` (`reach` in `MEMORY_CHARACTER_ART`) so her
crown comes under the resting branch, her gestures keep the common size, her
lift stand-off and crossing wait scale with her size, the face shot frames both
crowns, the nuzzle spacing grows with size, her rest spot is (−6.9, −1.25), a
crossing may start beside her by the measured bodies, and the held branch's bend
toward the trunk rises with the first crown.

## Baby Flugeðla (pteranodon, level 2; review candidate)

`pteranodon-baby.glb` is computed the same way from the owner's flying model (`../characters/pteranodon.glb`, 39,154 triangles): no
drawing, sculpting or new modelling. Her map has its own function in the bake (`babyPterosaur`), since she stands upright with both
wings spread: head ×1.35 (with her crest and beak; it grows about the top of her neck, fading in across a band along the plane between
the neck and the head, and out toward the wings), wings ×0.75 (along their span only, from 0.35 to 0.85 m out of the middle and only
above 0.8 to 1.1 m, so the legs keep their stance; the chord and the membranes' hang are kept), legs ×0.8 (in length only; the hips and
all above them come down with them), and the eye sockets grow as the others'. The body, neck and tail are unchanged. Every triangle (the
same 39,154, the heaviest baby, Þórseðla, has 39,214), UV, texture, skin weight and the nine clips (idle, walk, takeOff, fly, glide,
land, kink, happy, carry; takeOff and land play once) are kept; the GLB carries the `nose` landmark (the beak's tip). The values and
bands are in `pteranodon-baby-source.json`; the baby is not in a level until the owner approves it.

In the game (`MEMORY_CHARACTER_ART.pteranodon`, `winged: true`) she stands on two jointed legs (footing as for Egill and the other
bipeds) and the actor has three flight helpers, which play her flight clips on the game's clock: `fly(points, { speed, glide,
onDone })` (a smooth path from where she is; she takes off first if she is on the ground, hovers at the end), `land(point, { yaw,
onDone })` and `carry(on)` (the clip with a child on her back). `getFlight()` reports the phase. Her fail gesture is
`fail-pteranodon` (she pecks at the stone three times, "tikk", then tilts her head and shrugs her wings), her call a bright three-chirp
motif (`audio.js`), her portrait `portraits/pteranodon.webp` (`book-render` shot `memory-pteranodon`).

## Source and rights

- Sources: `../characters/mosi.glb`, `../characters/brontosaurus.glb`,
  `../characters/stegosaurus.glb`, `../characters/pteranodon.glb`.
- Original provenance and rights: `../characters/{mosi,brontosaurus,stegosaurus,pteranodon}-source.json`.
- Derived-asset details: `{triceratops,brontosaurus,stegosaurus,pteranodon}-baby-source.json`
  (all but the first repeat the parent's author, license and rights note).
- No new license is assigned; the existing source rights apply.
- This is a stylized infant for the storybook game, not an anatomical or acoustic
  reconstruction of a real hatchling.

## Reproduce and inspect

From the repository root:

```sh
node scripts/memory-baby-bake.mjs                      # Triceratops (the default)
node scripts/memory-baby-bake.mjs --species brontosaurus
node scripts/memory-baby-bake.mjs --species stegosaurus
node scripts/memory-baby-bake.mjs --species pteranodon
node scripts/memory-art-check.mjs [--species brontosaurus|stegosaurus|pteranodon]
node remake/tools/bake/bake-character.mjs --page book-render --out remake/assets/memory/portraits/pteranodon.webp --query "who=memory-pteranodon&width=512"
```

The baker validates finite vertices/normals, rejects a sampled local surface
fold (the Jacobian at every vertex) and rejects any triangle that turns over
(slivers under 0.02 % of the length are only counted). The Triceratops bake has
22 small turned triangles at its three horn feet, recorded as known. It
normalizes the GLB to one unit of nose-to-tail length; the game controls display
size. Mosi's horn-part ranges and Kambeðla's tail-spike ranges are tied to these
versions of their source bakes and must be reviewed if a source mesh changes.

The art check uses Playwright and Edge; set `PLAYWRIGHT_PATH` on another machine.
It loads the baby through the game's actor controller in its species' place (so
a baby can be reviewed before the game switches to it), captures front, side,
three-quarter, walking and blinking views (Þórseðla also her reach and lift) in
`qa/memory/art/` (Triceratops) or `qa/memory/art/<species>/`, checks browser
errors, and writes `report.json`.

`baby-actors.js` exports `createBabyActors({scene,length,instancesPerSpecies})`.
World placement belongs to each actor's `root`. Motion belongs to its internal
model. `noseLocal` gives its neutral contact point and `getNosePosition(out)`
returns the animated contact point in world space. `nuzzle()` adds a gentle
head tip; the scene positions the two characters for contact.

## Review scope

All three friends are babies in the game (`isBaby: true` in actor metadata).
The inherited adult sculpt and painted skin are still visible
in the adapted baby; this pass asks whether its proportions and expression fit
the intended family and whether the character reads at actual game size.
