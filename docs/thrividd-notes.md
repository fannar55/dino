# Þrívídd (anaglyph POC) notes

## Chunk 1: gler.js (2026-11-11)
- Works: `?gler=1` on any chapter; off-axis eyes, Dubois/half/grey/blue, swap, panel + test card, localStorage `mosi.gler.v1`. Without the parameter the game is pixel-identical (lineup hero diff 0).
- Gotcha: a linear float target blended the mist/light shafts in linear light (hazy darks). Eyes now render as the screen does (tone-mapped, sRGB, 8-bit) by marking the targets `isXRRenderTarget`; strength 0 + `adferd=pass` matches the normal render (0.16 % pixels > 8/255).
- Lineup hero numbers: far tree red shift -15 px (-0.012 W), Parasaurolophus head +19 px (+0.015 W; in front of D, which follows the look target). Next: the museum chapter.
