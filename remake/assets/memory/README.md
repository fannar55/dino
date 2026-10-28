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
modelling. The owner's starting values are factors on each source part: head
×1.4 with larger eye sockets, neck ×0.85, torso ×0.85, tail ×0.8 and legs ×0.75
(length only; their girth follows the torso); Kambeðla's eleven plates and two
tail-spike parts also shrink ×0.8 toward their own foot. The GLB is normalized
afterwards, so only the ratios show (the head is 1.65 times larger against the
torso). Every triangle, UV, texture, skin weight and clip is kept (Þórseðla:
idle, walk, kink, lowerHead, liftUp, happy; Kambeðla: idle, walk, kink, eat,
happy, and the `_PLATEROW` plate mask). Þórseðla's GLB carries `nose` (snout tip)
and `support` (skull crown) landmarks. The values, measured head bands and part
summary are in each `-source.json`.

The game does not load them yet: `MEMORY_CHARACTER_ART` and `roster.json` still
name the adults until the owner approves the babies.

## Source and rights

- Sources: `../characters/mosi.glb`, `../characters/brontosaurus.glb`,
  `../characters/stegosaurus.glb`.
- Original provenance and rights: `../characters/{mosi,brontosaurus,stegosaurus}-source.json`.
- Derived-asset details: `{triceratops,brontosaurus,stegosaurus}-baby-source.json`
  (the two new ones repeat the parent's author, license and rights note).
- No new license is assigned; the existing source rights apply.
- This is a stylized infant for the storybook game, not an anatomical or acoustic
  reconstruction of a real hatchling.

## Reproduce and inspect

From the repository root:

```sh
node scripts/memory-baby-bake.mjs                      # Triceratops (the default)
node scripts/memory-baby-bake.mjs --species brontosaurus
node scripts/memory-baby-bake.mjs --species stegosaurus
node scripts/memory-art-check.mjs [--species brontosaurus|stegosaurus]
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

Only Triceratops has the new baby design in the game so far. Stegosaurus and
Brontosaurus use the existing adult assets temporarily, clearly marked in
`roster.json` and in actor metadata (`isBaby: false`); their baby candidates
above wait for the owner's review. The inherited adult sculpt and painted skin are still visible
in the adapted baby; this pass asks whether its proportions and expression fit
the intended family and whether the character reads at actual game size.
