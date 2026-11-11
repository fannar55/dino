# Þrívídd (anaglyph POC) notes

## Chunk 1: gler.js (2026-11-11)
- Works: `?gler=1` on any chapter; off-axis eyes, Dubois/half/grey/blue, swap, panel + test card, localStorage `mosi.gler.v1`. Without the parameter the game is pixel-identical (lineup hero diff 0).
- Gotcha: a linear float target blended the mist/light shafts in linear light (hazy darks). Eyes now render as the screen does (tone-mapped, sRGB, 8-bit) by marking the targets `isXRRenderTarget`; strength 0 + `adferd=pass` matches the normal render (0.16 % pixels > 8/255).
- Lineup hero numbers: far tree red shift -15 px (-0.012 W), Parasaurolophus head +19 px (+0.015 W; in front of D, which follows the look target). Next: the museum chapter.

## Chunk 2: safn3d (2026-11-11)
- Works: `?chapter=safn3d` turns the glasses on; seven friends round the clearing, all in the overview; tap -> glide (near) or fade (far) to a portrait, the friend looks at the camera, steps in (Þórseðla also brings her head down with lowerHead held at 0.62), name + fact lines with captions, back, sparkle; all seven -> sparkles over everyone + the sun's hug. A seek through all seven (t=262) runs without errors.
- Comfort: D every frame = nearer of the ground at the bottom edge, the friend's body and any friend at/inside the frame edge; held while the head is out. The portrait camera (eye height 0.5-1.3 m, step, distance) is solved per friend so the head bone sits at 0.6 D (Mosi 0.67, Grameðla 0.66): measured head parallax +0.015..+0.023 W, far trees -0.009..-0.016 W.
- Not great: Mosi's head fills ~0.6 of the frame (the ground edge keeps D small for a low wide head); his 32 s horns caption is a big box under his face. Eye targets with 4x MSAA cost ~3x GPU (lineup 7.0 -> 20.2 ms); `glersamples=0` gives 10.0 ms. Next: the owner's look through real glasses.

## After the build (controller, 2026-11-11)
- Mosi says his own short line (`mosi`, 9.6 s, he mouths it) instead of the 32 s horns entry; no name line for him.
- New knob "Út úr skjánum" (`pop`, `?ut=`, 0.6-2, default 1) scales D: at 1.8 in the overview Flugeðla sits at the screen (+0.002 W), Mosi +0.014, trees +0.017, the ground at the bottom edge -0.016.
- Checked by projecting points through both eye cameras: 0 at D, +0.0199 at 1000 m, -0.02 at D/2 (strength 0.02). A tap on a friend starts its visit.

## Fiðrildadansinn (`?chapter=fidrildi3d`, 2026-11-11)
- A 60 s passive show: start card, the show, an end card with "Aftur" that plays it again. `t=` seeks show time exactly.
- Depth is laid out in the frame: (u, v, k), k = depth / D, D = Mosi's head (6.80 m, constant, before the pop share). Flights are timed (u, v, k) keys, Hermite-smoothed, on the scene clock. `world.dans.measure()` prints the parallax table through both eye cameras.
- Staging is solved once: camera at a child's eye (0.95 m), tilted up 14° so the ground at the bottom edge is 0.858 D; Mosi moved until his head sits at u 0.36 at 6.8 m, facing the camera; Þórseðla's lowerHead held at 0.70 so her Head bone (low in her skull) comes to (0.6, 0.6, 0.6), her root 38° to the right of straight behind it so her body stands to the right, not over Mosi. Slóeðla and Kambeðla stand far back as depth layers.
- World side (chapter 1 unchanged, before/after kafli1 captures identical): `pollenBurst` takes `direction` and `cone` (default path untouched); `butterflies.follow(name, path)` flies a butterfly along a function until land/flutter takes it; `world/forest/swarm.js` is the pale butterflies again, as many as asked, every one placed by code, one draw call. Swarm scale 1.25, hero moth model 1.5.
- Comfort: hero hover k 0.483 (+0.021 W), pollen reach k 0.40 (+0.030 W, cone 0.14 rad aimed at u 0.47), swarm nearest k 0.527 inside the middle 60 %, Þórseðla's head k 0.600, final moth k 1.003 (-0.0001 W). Þórseðla's raised neck crosses the top edge at k 0.98 (0.0004 W in front): negligible but not strictly behind.
- Frame time, quality=tablet, Iris Xe: 24.1 ms GPU with glasses (113 calls), 6.9 ms without.

## Fiðrildadansinn round 2 (2026-11-11)
- Þórseðla walks in: from (30, -14), deep in the forest off the right of the frame, via (19, -11) and 7 m straight along her final heading to the solved spot (head beat unchanged: k 0.600, u 0.601, v 0.612). 28.9 m with walkTo at 1.3 m/s (walk clip at 1.26x its own speed, so no sliding), starting at 20.4 s, first in frame 26.7 s (k ~3), arriving 43.2 s; her footfalls are Mosi's chapter-1 `step` sfx on her four foot bones, louder as she nears. No camera nudge. Mosi glances at her 36-43.8 s.
- Two more moths: `butterflies.addHero(name, { tint })` (off unless a chapter calls it; chapter 1 captures identical), the hero's model with its materials copied and multiplied by the pale butterflies' colours (#f2dc94, #f3b996), scale 1.5. They fly (u, v, k) keys plus a lively loop, k 0.55-0.95 most of the show, join the swarm's ring 30.5-45 s, and drift back to k 2.9 in the upper corners by 58 s. Checked over the whole show every 0.05 s: nearest k 0.562 / 0.548, no sample in front of the screen outside u, v 0.12-0.88, fastest depth change 0.7 k/s.
- The blown-off hero now waits at the top middle (k 3.0), not on the right where she walks in.
- Comfort exception: in the last ~4 s of her walk her raised neck crosses the top edge at k 0.89 (+0.0025 W, ~3 px at 1280); standing at her spot it is k 0.97-0.98 (+0.0004 W).
- Frame time, quality=tablet, glasses on: 19.8-20.2 ms GPU (125 calls).

## Round 3: "3D myndbönd" in the book (2026-11-11)
- `videos.js` exports `BOOK_3D` (entries with `chapter` instead of `src`; one with `src` would play in the normal player): Fiðrildadansinn, open from the start, seen id `video:fidrildi3d`, no card links. `BOOK_VIDEOS` keeps its nine mp4 entries untouched.
- Myndbönd leaf: both pages are 3 x 2 grids. Left: heimur, grannar, thorsedla, gramedla, landrek (unlock order kept: landrek moved left). Right: fuglar, raf, steinn, tennur in two columns, then the "3D myndbönd" column (dashed rule, faint green wash, room for two tiles). "3D" in the heading and the tile's badge is plain text with red and cyan offset copies (text-shadow).
- A tap on the 3D tile marks it seen and calls `onOpenShow(entry)`; book.js passes it to main.js, which goes to `?chapter=fidrildi3d&fra=<chapter>` keeping quality and debug. With `fra` the show's start and end cards get "Til baka" (to `?chapter=<fra>`).
- Coming back restarts that chapter from its beginning (Byrja first): the save keeps stars, finds, places and seen, but no chapter keeps a point inside itself. The book does not reopen on Myndbönd (no existing way; a `book.open('videos', 'child')` at load would fight the Byrja screen).
- Poster `fidrildi3d-thumb.webp`: 640x360 webp from a gler=0 capture at 36.5 s.
