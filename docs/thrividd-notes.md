# Þrívídd (anaglyph POC) notes

## Chunk 1: gler.js (2026-11-11)
- Works: `?gler=1` on any chapter; off-axis eyes, Dubois/half/grey/blue, swap, panel + test card, localStorage `mosi.gler.v1`. Without the parameter the game is pixel-identical (lineup hero diff 0).
- Gotcha: a linear float target blended the mist/light shafts in linear light (hazy darks). Eyes now render as the screen does (tone-mapped, sRGB, 8-bit) by marking the targets `isXRRenderTarget`; strength 0 + `adferd=pass` matches the normal render (0.16 % pixels > 8/255).
- Lineup hero numbers: far tree red shift -15 px (-0.012 W), Parasaurolophus head +19 px (+0.015 W; in front of D, which follows the look target). Next: the museum chapter.

## Chunk 2: safn3d (2026-11-11)
- Works: `?chapter=safn3d` turns the glasses on; seven friends round the clearing, all in the overview; tap -> glide (near) or fade (far) to a portrait, the friend looks at the camera, steps in (Þórseðla also brings her head down with lowerHead held at 0.62), name + fact lines with captions, back, sparkle; all seven -> sparkles over everyone + the sun's hug. A seek through all seven (t=262) runs without errors.
- Comfort: D every frame = nearer of the ground at the bottom edge, the friend's body and any friend at/inside the frame edge; held while the head is out. The portrait camera (eye height 0.5-1.3 m, step, distance) is solved per friend so the head bone sits at 0.6 D (Mosi 0.67, Grameðla 0.66): measured head parallax +0.015..+0.023 W, far trees -0.009..-0.016 W.
- Not great: Mosi's head fills ~0.6 of the frame (the ground edge keeps D small for a low wide head); his 32 s horns caption is a big box under his face. Eye targets with 4x MSAA cost ~3x GPU (lineup 7.0 -> 20.2 ms); `glersamples=0` gives 10.0 ms. Next: the owner's look through real glasses.
