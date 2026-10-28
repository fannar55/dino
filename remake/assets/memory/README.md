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

## Source and rights

- Source: `../characters/mosi.glb`.
- Original provenance and rights: `../characters/mosi-source.json`.
- Derived-asset details: `triceratops-baby-source.json`.
- No new license is assigned; the existing Mosi source rights apply.
- This is a stylized infant for the storybook game, not an anatomical or acoustic
  reconstruction of a real hatchling.

## Reproduce and inspect

From the repository root:

```sh
node scripts/memory-baby-bake.mjs
node scripts/memory-art-check.mjs
```

The baker validates finite vertices/normals and rejects a sampled local surface
fold. It normalizes the GLB to one unit of nose-to-tail length; the game controls
display size. The horn-part ranges are tied to this version of Mosi's source
bake and must be reviewed if that source mesh changes.

The art check uses Playwright and Edge; set `PLAYWRIGHT_PATH` on another machine.
It captures front, side, three-quarter, walking and blinking views in
`qa/memory/art/`, checks browser errors, and writes `report.json`.

`baby-actors.js` exports `createBabyActors({scene,length,instancesPerSpecies})`.
World placement belongs to each actor's `root`. Motion belongs to its internal
model. `noseLocal` gives its neutral contact point and `getNosePosition(out)`
returns the animated contact point in world space. `nuzzle()` adds a gentle
head tip; the scene positions the two characters for contact.

## Review scope

Only Triceratops has the new baby design in this slice. Stegosaurus and
Brontosaurus use the existing adult assets temporarily, clearly marked in
`roster.json` and in actor metadata (`isBaby: false`). Their baby designs have
not been created. The inherited adult sculpt and painted skin are still visible
in the adapted baby; this pass asks whether its proportions and expression fit
the intended family and whether the character reads at actual game size.
