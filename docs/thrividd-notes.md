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

## Round 4: the show over the book, no 3D button, the glasses start (2026-11-11)
- `engine/book/show-player.js`: a 3D tile opens a full-screen `<iframe>` of this page at `?chapter=<show>&syning=1` (quality and debug kept) inside #book, over the open book, with the video player's close button (top right). Escape closes it, on the page or in the frame (main.js posts `mosi-syning-loka` up). Closing removes the frame (its WebGL, sound and clock go with it) and renders the Myndbönd page again; the chapter behind is exactly where it was. The Round 3 `fra` / "Til baka" navigation is gone; `?chapter=fidrildi3d` still works on its own.
- While a show is open the parent's animation loop returns at once (no update, no draw) and its AudioContext is suspended (resumed on close); the child's book already held its clock. Measured over chapter 4 (play=1): 0 WebGL draw calls on the parent canvas during five open/close rounds; suspend verified in the real browser pane (headless Edge runs with --mute-audio and never settles a suspend, so headless shows "running").
- `syning=1` in main.js: no book button (journal.show(false)), no app line/download (forrit stub), no book cards read; Escape goes up.
- Gler: `createGler({ panel })`; a chapter's `gler: { panel: false }` leaves out the "3D" button and panel. Fiðrildadansinn uses it; safn3d (`gler: true`) and `?gler=1` keep the button; saved settings and URL knobs still apply.
- Start: `chapter.startButton(doc)` (main.js) may give the chapter its own start instead of Byrja; its button's click is Byrja's (begin + music.start, the touch that unlocks sound). Fiðrildadansinn shows Openclipart's "Anaglyph Glasses" (`assets/book/gleraugu-3d.svg`, public domain, CREDITS.md) as an `<img>` 60vmin wide, pulsing 1 s (scale 1.06 + drop-shadow glow; glow only, 2.4 s, under reduced motion), with "Rauða glerið á vinstra auga." under it. If the picture cannot load, main.js shows the Byrja pill so the show never stands stuck.
- Save: neither the frame nor the direct link writes anything (checked with a filled save: before == after, at the start and after 12 s of play); the show calls no star/find/place. Only the tile tap writes `video:fidrildi3d` seen, as every video tile does.
- Costs (this laptop, Iris Xe, headless Edge, quality=tablet): parent chapter 4 heap 115 MB (after gc), textures 77.7 MB, 195k tris; the show 56.2 MB textures, 481k tris (both eyes), 125 calls; both pages 248 MB heap. GPU in the frame over chapter 4: 21.0-21.5 ms; the show alone: 19.1-21.0 ms (same within noise). Tap to tappable glasses: 6.2-8.6 s (frame DOM ready ~0.5 s, files ~3.5-4.3 s, warm-up draw the rest); the show loaded alone takes about the same. After close: longest parent frame 150-200 ms (frame teardown), no lost contexts; heap after five rounds and gc 250 MB (one show's worth not yet returned, no growth across rounds).
- Captures: `qa/thrividd/bok4/` upphaf-1280, upphaf-820 (glasses over the book), midja-1280 (t=30 in the frame, no 3D button), endir-1280 (the "Aftur" card), lokad-1280 (the book after closing, tile no longer Nýtt!), minni/ and kostnadur/ (measurements). Chapter 1 captures identical (k1-after4).

## Round 5: no butterfly through Mosi or Þórseðla (2026-11-11)
- The owner: "fiðrildi klippa í gegnum Mosa og Þórseðlu". Cause: every flight is drawn in the frame (u, v, k), not round the bodies, and the swarm's ring (k 1.15-1.45 round the view axis) is where Mosi's head and body stand (k 1-1.6); once Þórseðla has come her neck runs from k 0.6 to 1.25 and her chest is at 1.35, right of the middle. The four sitters sat at a world-up offset from her Head bone, which is low in her skull, so inside it. The hero's pass "by the horn" (9.5 s, u 0.47) went through Mosi's head.
- `engine/shell.js` (off unless a chapter makes one): capsules fitted from each animal's skinned mesh, one per bone (small bones merged into their parent), and spokes for parts wider than 3 % of the body (Mosi's head with its frill was one ball 1.4 m across). Mosi 97 capsules, Þórseðla 82; 99.7 % / 99.5 % of the skin within 1 cm of them, the farthest vertex 3 / 8 cm out. `update()` once a frame after the actors (an effect); the capsules are placed again only when a push comes near (an animal far from every butterfly costs nothing).
- `pushOut(point, capsules, { margin, forward })`: stateless (a seek lands on the same frame). The capsules make one blended field (distance outside, less the margin); a point inside the soft zone (0.3 m past the margin) or the body flows out along the field's slope plus a lean up and a little away from the camera, to h = (0.3 + h)² / 1.2 (out by the margin from deep inside, meeting the drawn point at the zone's edge). Nothing toward the camera. Continuous through the middle of a body; the one seam is at the shell's underside (a body rising into a butterfly, or one flying up into it from below, would jump over it), which the choreography avoids and the probe measures.
- The fixed stage (d990ece): every place and flight of the show is solved once in a stage camera of its own, `stageCam`, a fixed 16:10 frame (STAGE_ASPECT, the show's FOV) at the camera's place, not in the screen's frame. `framePoint(u, v, k)` and the staging (Mosi's head at u 0.36, her head beat, the swarm, the moths, the sitters' approach) use it, and the shells' push leans away along its direction, so every shape of screen (4:3 tablet, 16:10, 16:9, a phone's 2.17:1) has the same world paths, the same pushes and the same probe numbers; only how much of the stage shows at the sides changes. `frameOf(p)` is the screen's own frame (for comfort and captures), `frameOf(p, stageCam)` the stage's. The probe takes `--size WxH` / `--sizes all` (1024x768, 1280x800, 1280x720, 1170x540) and `--quality`.
- Margins: the hero model's bounding-sphere reach at HERO_SCALE (measured in the page) + 8 cm for the hero and both moths; 0.21 + 8 cm for the swarm. Shells on Mosi, Þórseðla, Slóeðla and Kambeðla (the last two never come near).
- Meant contact: the hero's horn landing (17.4 s to a second after it is blown off, the push coming in over that second) and its final settle (the butterflies' own landing, untouched). The four sitters have seats on the top of her skull, read off her posed skin with the head held down and kept in her Head bone's frame, 2.5 cm over the surface; they come down onto them from 0.5 m straight above, sit about two seconds, and go up and back off them before her head lifts; the push fades out only on that last stretch down and first up.
- Choreography changed (the owner will see): the swarm rises from the grass right of Mosi (not behind and under him); its ring turns right of him behind the screen and when it comes through it (centre 0.12-0.14 of the width further right; out in front its middle is at 0.59, was 0.53); once Þórseðla is there (43-50 s) it goes back behind the screen smaller (55 %) and high, between Mosi's frill and her back, behind her neck, so her head comes down in front of it. The moths' ring is smaller (0.2 of the width, was 0.3); moth-a crosses in front of Mosi's face before it joins and both leave the ring at 40.6 s while it is out in front (was 43.5); moth-a keeps more in front on the left (k 0.66-0.72) and goes out wider; moth-b stays high on the right in front of her neck (42-55 s) and leaves to the left behind Mosi (it went right, through her rising head). The hero passes Mosi's horn just right of his frill (u 0.56, was 0.47). The sitters come 48-48.75 s and leave 52-52.45 s (they rode her head up and left from 55: that took them out of the top of the frame in front of the screen). Butterflies near a body bend round it, at most 0.86 m off their drawn path (s24 at 42.9 s); the hero at most 0.44 m (10.6 s).
- The probe: `node remake/tools/clip-probe.mjs [--json out.json] [--from s --to s] [--step 1/30] [--clearance 0.02] [--trace name] [--jump 0.3]` from the repo root (headless Edge; one to two minutes for the whole show on this laptop). It plays the show in fixed steps (`window.__advance`, main.js, after a `t=` seek) and asks `engine/clip-probe.js` at every step: a centre inside a posed body (two ray-parity tests on the full-detail mesh) or a wing nearer it than the clearance, not in a meant contact, fails it (exit 1). It prints seconds inside, butterflies through each animal, the worst moment, the smallest clearance and when, the largest jump (a move in one step less the drawn one) and the largest detours. The chapter tells it its butterflies: `world.dans.butterflies()` → [{ name, p, wing, contact }]; `world.dans.clipProbe(names)` gives the probe in the page. It needs a browser (the posed skinned meshes), so `npm run test:remake` does not run it; `tests/shell.test.mjs` holds the maths (out by the margin, the soft zone, smooth through the middle, never toward the camera, stateless, the fit, the seam where it is meant).
- Before and after (the probe, steps of 1/30 s, at 6ab6a1e and now):

| | before | after |
|---|---|---|
| seconds with a centre inside a body | 20.87 | 0 |
| butterflies through Mosi / Þórseðla | 27 / 6 (swarm 24 / 5) | 0 / 0 |
| worst moment | 7 inside at 43.4 s | none |
| smallest wing clearance, not in contact | -0.206 m (s18 by Mosi, 45.4 s) | 0.102 m (s23 by Mosi, 42.8 s) |
| steps with a wing under 2 cm | 1588 | 0 |
| largest jump in one step | | 0.24 m (moth-b by her neck, 47.9 s); swarm 0.17 m |

  The coordinator's hand count at 6ab6a1e (real time, larger steps) was 18.4 s inside, 22/25 of the swarm through Mosi and 10/25 through Þórseðla, worst 8 inside at 53.8 s; the fixed-step probe also caught the hero in Mosi's head at 9.6-10.3 s and one of the swarm waiting in his foot in the grass at 29.5 s.
- Comfort on the flights as flown (`measure().flown`, every butterfly, every frame of a show): no samples in front of the screen at an edge, none nearer than k 0.6 outside the middle 60 %; nearest k 0.483 (the hero, in the middle, as before), swarm 0.527, moths 0.60. `measure().moths` (drawn): moth-a and moth-b near 0.6, far 2.9, no edge samples.
- Cost: the shells take 0.2-0.4 ms a frame on this laptop with three butterflies near and 0.9-2 ms with the swarm round both animals (45-55 s), of a 2-3.6 ms update; the render is unchanged (26-27 ms a frame with the glasses at 1280x800, GPU-bound). Chapter 1 pixel-identical (k1-before vs skel/k1-after: 0 pixels differ).
- Captures: `qa/thrividd/skel/` g0-/g1- at 33, 35, 44.5, 50, 53.8, 55 s, g0-51.5 and g0-52.8 (the sitters on her skull); probe-before/after .txt/.json; measure-after.json.

## Round 6: her walk clear of the trees, two thirds of the swarm in front, "Hætta" (2026-11-12)
- The owner (2026-11-11 ~23:35): her head clipped a tree as she walked in; with her head down all the pale butterflies went back, many should stay in front of her and Mosi; the end card had only "Aftur", no way to stop.
- The walk. Before (d990ece, tablet, 1280x800, 20-44 s, `--trees`): 488 of 720 steps with her shell inside a plant; her head through the crown of the broadleaf at (19.2, -15.3) 20.0-30.1 s, 2.89 m deep at 26.1 s; also the araucaria at (33, -16.2), a horsetail, three bushes and a tree fern (hips 2.08 m in). The only gap at head height near the old line was 0.2 m wide. Now she comes along a new line, `THOR_FROM` (35, -12.5) → (28, -8.6) → (21, -7.0) → (16, -6.1), then the same 7 m straight to the same spot and heading; same arrival (43.23 s, settled 43.27), same walk speed (clip at 1.264x), 33.2 m (was 28.9), starting at 17.06 s (was 20.4).
- What she would still touch is left out by a rule that follows from the route: `chapters/fidrildi3d-walk.js` is her walk's sweep (`node remake/tools/clip-probe.mjs --sweep remake/chapters/fidrildi3d-walk.js --size 1280x800`: 264 root poses along the walk and her shell's capsules in her own frame standing, at four phases of the walk cycle and turning), and `layout.leaveOut` (a new forest hook, world/forest/forest.js: plants dropped from the plan before anything is built, so moss and birds are placed without them; no other chapter sets it) drops any plant 1.2 m or taller whose fitted volume (engine/tree-probe.js: each piece of its model cut into 0.35 m discs) her shell would come within 0.15 m of at any pose. At every quality. tablet 11 plants, low 10, high 15; the corner broadleaf (#9, the one her head went through) stays. `?skog=heill` turns the rule off (before/after pictures). Regenerate the sweep whenever the route, the spot or her walk changes (tests/fidrildi3d.test.mjs checks it matches THOR_FROM).
- After: `--trees` 0 of 1797 steps inside a plant from 0.1 to 60 s at low, tablet and high (qa/thrividd/umferd6/trees-after.txt). In frame of the plants taken: at 1170x540 the broadleaf at (24.1, -1.5) at u 0.94-0.99 (all qualities) and the tree fern at (23.2, -10.2) at u 0.96-0.98 (tablet, high); at high also the broadleaf at (34, -15.8) (u 0.95-0.99, 1170x540) and the 9.4 m broadleaf at (20.2, -11.3), u 0.92-0.99 at 1024x768, 0.93-1 at 1280x800, 0.88-1 at 1280x720, 0.81-0.99 at 1170x540 (its box; mostly behind other crowns: qa/thrividd/umferd6/skogur/ fyrir/eftir at t=30). Chapters 1 and 2 pixel-identical (md5 of kafli1 t=8/20/95 and kafli2 t=8/30 at 1280x800, before and after).
- Her walk in the frame: first in frame (a bone inside it) 30.57 s at 1280x800 (was 26.67) and 26.6 s at 1170x540 (was 21.4): the new line keeps her further right and deeper, so she is seen about 4 s later. Her nearest at an edge is k 0.888 (was 0.891): the same raised neck at the top edge in her last seconds (the round 4 exception). Footfalls: the chapter's own foot-drop rule finds 17 falls 17.7-43.2 s (it found 5 on the old line; the rule misses many steps on both). No critter comes within 3.1 m of her shell (birds, lizards, snails 17-44 s).
- The swarm: from 41.4 s two thirds (16 of 25: FRONT_MOSI and FRONT_HER, every other two, not the sitters) leave the spiral where it is, in front, over 3 s. Mosi's eight circle the left of his face (u 0.19-0.31, v 0.22-0.62, k 0.61-0.65), one turn in 14 s, until 55.4 s, then up past his frill's left into the trees. Hers wait high over his frill (u 0.21-0.31, v 0.135-0.175, k 0.65) while her head comes down, go along the top of the frame to a small ring over her lowered head (u 0.725-0.805, v 0.15-0.21, k 0.62) 48.3-50 s, back 51.4-53.2 s before it lifts, and leave up between the two at 55.6 s. The other nine and the four sitters do as in round 5. Nothing can be in front of her face itself: her snout comes to k 0.44 (the comfort floor is 0.52) and her head's shell, a ball a metre round, fills the frame nearer than k 0.6 round it and reaches u 0.33 as it moves, so the front groups keep left of it and over it.
- moth-b's twitch (round 5's 0.24 m step at 47.9 s, her neck coming down into it high on the right): it now stays low on the right in front of her chest 44.5-55.2 s and leaves low in front of Mosi and up round his frill's left (58.4 s) into the trees, resting at 59.5 s (was 59.2). moth-a keeps its round-5 path (a key up his left at 55.4 s took it under k 0.6 outside the middle of the frame, so it went).
- The probe, 0-60 s at the four shapes (1024x768, 1280x800, 1280x720, 1170x540; the same numbers at each, the stage being fixed): 0 s with a centre inside a body; smallest clearance 0.104 m (the hero by Mosi, 57.6 s); largest jump 0.196 m (s20 at 36.07 s, as Mosi glances at her: his head turns towards her new line; 0.17 m at weight 0.3, left at 0.45); plain move per step hero 0.404 m (55.23 s, the landing start), moths 0.32 m, swarm 0.30 m. The sixteen in front: largest push 0.10 m, change in one step at most 0.025 m. Over the limits (0.15 m, 0.03 m a step) still: the hero (0.44 m at 10.6 s), moth-a (0.60 m at 4.5 s; 0.21 m by Mosi's head at 54.6 s), moth-b (0.38 m at 33.6 s), and of the swarm behind s0, s3, s12, s15, s16, s17, s18, s20, s21, s24 (s24 0.86 m at 42.9 s), all before 41.4 s or in the group behind, as in round 5. moth-b at 47.9 s: no push (its largest after 41 s is 0.08 m). qa/thrividd/umferd6/probe-4shapes.txt.
- Comfort as flown (`measure().flown`, 1280x800, the whole show): no sample in front of the screen at an edge, none nearer than k 0.6 outside the middle 60 %; nearest the hero k 0.483, swarm 0.527, moths 0.603 / 0.613.
- "Hætta": `endCard(doc, { onAgain, onQuit })` in the chapter, "Aftur" first (green, bigger type), "Hætta" beside it (white, green border, the same height: 62 px at 1024 and 1280); `leaveShow(win)` in engine/book/show-player.js: in the book's frame (syning=1 with a parent) it posts SHOW_CLOSE up and the book closes the frame and shows Myndbönd; on its own it goes to this page with only quality and debug. tests/book.test.mjs. Tried in a browser: in the frame over kafli1 (headless Edge: card, then Hætta, then the book on Myndbönd: qa/thrividd/umferd6/haetta/, haetta2/) and on the direct link in the app's browser pane (?chapter=fidrildi3d&t=59.6&quality=high&debug=1 → Hætta → index.html?quality=high&debug=1, the start page with Byrja).
- Cost with the glasses (capture --bench 90, 1280x800, tablet): GPU 15.3-16.0 ms median, 17.4-19.3 ms a frame at 33, 47, 52 s; without glasses 5.3 / 7.2 ms at 52 s. Round 5's run said 23-24 / 26-27 ms on the same laptop; the laptop's state differs between runs, so read these as no worse, not as faster.
- Suite: `npm run test:remake` 2008/2008. Captures: qa/thrividd/umferd6/1280/ (g0-, g1- at 28, 31, 34, 38, 44.5, 47.9, 50, 53.8, 55, 59.5 s), 1024/ (g0-), endir-1280.png (the card in the book's frame), skogur/ (fyrir = ?skog=heill, eftir), k1-after/ and k2-before/ (chapters 1 and 2).

## Gljúfraflugið (chapter gljufur3d), chunk 1: rough cut (2026-11-12)

What is built: `?chapter=gljufur3d` (chapters/gljufur3d.js) plays the whole show with the glasses on from the start (glasses picture, no
3D button) and ends on the end card (Aftur, Hætta). The end card and the glasses picture moved to engine/book/show-cards.js, which
fidrildi3d also uses now. `t=` seeks and `__advance` step it, and the timeline is a pure function of τ: the slow motion goes through
`clock.setScale`, which seeks ignore. Up to the burst (τ 44) the path is chapter 4's own, at flight time τ + 75. After that the show
sets its own points and keys through new options that only it passes: `createRoute({ points, keys })`, the `flyersAway` option of
createArdalur/createLife (the gorge flyers peel away before the reveal), and `lightAt` exported from kafli4-flight.js.

Beats as built (τ, room seconds):

| τ | Beat |
|---|---|
| 0–7.5 | Chase over the rapids. "Haltu þér fast!" at 1.0 |
| 7.5–20.5 | Side, then chase through the gorge. "Sjáðu, þau fljúga með okkur!" at 10 |
| 20.5–23.55 | Front shot from the river's middle: she comes straight at us. Small slow moment at 23.0–23.55 (0.45) |
| 23.55–30 | Skim with splashes |
| 30–39.8 | Chase, then climb up the falls. "Sjáðu fossinn!" at 31, "Upp með honum!" at 33.3 |
| 39.8–44 | Burst out of the spray. The orchestra hit lands about τ 41.5; golden light follows |
| 44–46 | Reveal of Grameðla |
| 46–51.5 | Roar shot. Roar at 46.7, slow motion 47.0–48.4 at 0.35 (about 4 s of room time), "Vááá!" at 47.4, the pass at τ 48 |
| 51.5–59 | Circle. "Vúhú! Hér förum við!" at 54.5, her huff and nod at 57.4 |
| 59–70 | Golden glide away in chase. Fade 70–71.5, then the card |

Grameðla stands at (-1385, 100), ground 51.0, by the lip on the north bank, facing 135° (south-west, across the river). That is
where the climb's line comes over the lip, so the burst can lead straight into the reveal. The far land's own Grameðla is never
loaded, so there are not two of her. Plants are cleared around her (r 11), along the show's path from τ 42 (r 7) and at the roar
camera (r 10).

Comfort, measured at 1280×800 with tools/gljufur-probe.mjs (every 1/30 s, 0–71.5 s, depth probe from engine/depth-probe.js):

| Shot | D (m) | Middle nearest k | Note |
|---|---|---|---|
| chase | 5.3–5.7 | 0.97 | |
| side | 3.9–4.0 | 0.865 | wing |
| front | 11 | 0.585 | 2 steps under 0.6 D outside the middle: her head at v 0.16, the cut's last frame |
| skim | 5.07–10.1 | 0.93 | largest D step 0.51 m at 28.8 (the eased ground limit) |
| climb | 6.5 | 0.92 | |
| burst | 14 | 0.56 | |
| reveal | 8.3 | 0.94 | |
| roar | 9.23, held | 0.69 | Grameðla's snout in the lunge; her head reaches k 0.99 |
| circle | 6.2–7.6 | 0.91 | |
| away | 5.4 | 0.975 | |

- Edge violations (something nearer than D along the 1 % border): 0 in every shot after the last two fixes (the roar's D is 0.82
  of her head's depth, because her jaw and neck cross the bottom edge; the flyers leave a second earlier). The reveal was measured
  again from 39.7 to 46.1 s and the roar from 45.9 to 51.6 s; the full run before those fixes had them as the only violations.
- Clip (--clip, subsampled: every 12th vertex against the ground, every 48th against Grameðla): no skin under the ground or in a
  wall (smallest 2.18 m, skim), none under the water (smallest 0.60 m, skim), nothing inside Grameðla.
- Frame cost (capture.mjs --bench, Iris Xe, quality tablet, 1280×800), GPU median with the glasses: 10.7 ms in the gorge
  (τ 17), 10.7 ms in the roar (47.8), 13.6 ms in the circle (55). The roar without the glasses is 5.3 ms.
- Captures: qa/thrividd/gljufur/final/ (g1- with the glasses, g0- with gler=0, at 4, 12, 17, 23.4, 26.5, 33, 37, 43.6, 45.2, 47.8,
  55 and 70 s). The probes' JSON is in qa/thrividd/gljufur/.

Weak, or not measured:
- The roar shot frames Grameðla well, but Flugeðla passes cut off at the top edge (she is behind the screen there, k ≥ 1.07). The
  pop is weaker than planned: 0.69 at the nearest.
- In the circle (τ 55) Egill is hard to see: the camera is under her wing. The side shot's wing comes to k 0.865.
- The burst's hit is at τ ≈ 41.5, not at 44.
- The flyers' peel-away is quick and plain. The flyers under her in the skim are not checked against the water. Plants are not
  probed for clipping. The spray, splashes and mist write no depth, so the probe does not see them.
- Only 1280×800 was measured; the other three shapes were not. There is no node test of the show yet.
- Not checked: Aftur's replay, playback in real time with sound, how it looks through real glasses, and how long the start's
  `forest.buildAll()` takes. Reduced motion (reduced=1) only loads without errors.

## Grameðla kemur!, step 0: the stage and the calibration (2026-11-12)

The plan is `docs/superpowers/specs/2026-11-12-gramedla-kemur-3d-design.md`.

**Gljúfraflugið removed.** The owner set it aside. `chapters/gljufur3d.js` and `tools/gljufur-probe.mjs` are gone. Chapter 4's
files are back as on 43df2db (kafli4-flight.js, kafli4-route.js, world/ardalur/index.js and life.js; only the flight show's commits
had touched them). What the new show uses stays: `engine/book/show-cards.js` and `engine/depth-probe.js`. The depth probe now also
gives the shares of the picture in front of the screen, at it, behind it and in the sky, the farthest depth, and, with
`isGround`, the floor along the border apart from the rest.

**The shared stage.** `engine/stage3d.js` holds the still stage of Fiðrildadansinn: the camera's tilt solved for the ground,
`framePoint`, `frameOf`, `groundEdgeDepth` (now at any point across the bottom edge) and the fixed 16:10 frame. fidrildi3d.js imports
it. Its stills at 20 and 47 s (glasses and plain) are byte for byte what they were, and its tests pass untouched.

**The stage of the new show** (`chapters/gramedla3d.js`, seed 37):
- A clearing (radius 8 at [0, 2]) with a footpath that runs straight up -Z from the camera through the forest.
- `layout.keepOut` clears two areas: a lane 2 × 3.4 m wide to z -48, and, nearer than 14 m, the whole view of the widest screen.
- `layout.lifeKeepOut` keeps the critters off the same ground. It is a new, show-only option of `world/forest/life.js`; other
  chapters do not set it, so nothing changes for them.
- Morning mist at [0, -32] (radius 9, 4.5 m high), four glade shafts and 70 motes of its own. The motes come in front of the screen
  only in the middle half of the frame.
- The clearing's own butterflies are hidden for now.
- Camera: [0, 1.7, 8], looking -Z, fov 46. It tilts up 6.75° (11.25° on 4:3) to keep the ground at the bottom edge at 0.86 D.
- **D = 6.5 m**, not the plan's 9.5. This model is a chibi standing upright: her toes reach about 3.5 m nearer than her snout's
  depth would suggest. With D 9.5 her toes crossed the bottom edge in front of the screen above about 2 %, and the measurements
  ruled that out. At 6.5 they stay at the floor's depth (k ≥ 0.85) up to 4.7 %.

**The lean.** It is a pure function of `out` (k = 1 / (1 + out / 0.02)) and is solved once at the start (`world.gramedla.state.solved`):
- She is held at the idle's first pose; the mixer is stopped. Each frame starts again from that pose.
- Spine, chest and neck bend by 0.22 / 0.30 / 0.48 of one angle. The head's standing pitch is given back, then it tilts half the
  angle down to the lens and turns a little so its outline is centred on the snout.
- The angle (bisected) and where she stands put the snout tip, the forward-most vertex of the upper jaw within 12 cm of the head's
  middle, at (0.5, 0.56) of the stage frame at k·D.
- She breathes by tilting her chest 0.8° every 4.2 s, and blinks on her own. Her snout's k moves by at most 0.002.

| Out | Lean | Stands at z | Snout depth |
|---|---|---|---|
| 2 % | 78° | -0.38 | 3.25 m |
| 3 % | 79° | 0.28 | 2.60 m |
| 4 % | 78° | 0.71 | 2.17 m |
| 4.7 % | 76° | 0.91 | 1.94 m |
| 6 % | 69° | 1.16 | 1.62 m |
| 8 % | 46° | 1.47 | 1.30 m |

Her body passes back through the screen plane inside the frame (u about 0.46): at 4.7 % chest k 0.93, spine 1.02, hips 1.12.

**The calibration**, `?chapter=gramedla3d&kvordun=1` (`&stilling=1..6&styrkur=0.03` for one at once):
- Arrows or three buttons: ‹ and › in the bottom corners, "styrkur" in the top right.
- The label in the top left gives the real parallax, e.g. „Trýnið 7,0 % út · styrkur 0,03 · 4 af 6“.
- The strength is set from the label, pop is held at 1, and nothing is saved. There is no 3D panel.
- Without `kvordun` the chapter shows the stage at 4.7 % for 20 s and then the end card. It is a placeholder until step 2.

**Measured** with `tools/gramedla-probe.mjs --sizes all` at 1280×800, 1024×768, 1280×720 and 1170×540. Files:
qa/thrividd/gramedla/kvordun/maelingar*.

| Out | Snout k | Parallax 0.02 / 0.03 | In front / at / behind / sky (1280×800) | Head share, high × wide | Edge rule | Floor at bottom edge |
|---|---|---|---|---|---|---|
| 2 % | 0.499 | 2.0 / 3.0 % | 18 / 2 / 79 / 0.6 % | 59 × 34 % | holds, all four shapes | 0.866 |
| 3 % | 0.399 | 3.0 / 4.5 % | 24 / 3 / 73 / 0.6 % | 67 × 40 % | holds, all four | 0.866 |
| 4 % | 0.334 | 4.0 / 6.0 % | 30 / 4 / 66 / 0.6 % | 73 × 46 % | holds, all four | 0.866 |
| 4.7 % | 0.299 | 4.7 / 7.0 % | 35 / 3 / 61 / 0.6 % | 78 × 50 % | holds, all four | 0.866; **0.852 on 4:3** (her toes) |
| 6 % | 0.249 | 6.0 / 9.0 % | 44 / 3 / 53 / 0.1 % | 89 × 56 % | **broken**: skull top at the top edge, k 0.41 (holds on 4:3) | 0.851; **0.822 on 4:3** (toes) |
| 8 % | 0.200 | 8.0 / 12.0 % | 55 / 2 / 43 / 0 % | 115 × 67 % | **broken** everywhere: the head is taller than the frame, k 0.20–0.33 | **0.79–0.80** |

- The ground along the bottom edge (rays): 0.859–0.86 D everywhere.
- The far background: +1.8 % at 0.02, +2.7 % at 0.03 (the lane's end, about 10 D). The sky is +2 / +3 %.
- No plant: her capsules reach into none of the plants near the lane.
- Stills: qa/thrividd/gramedla/kvordun/, g1- (glasses) and g0- (plain), 1280×800, `<n>-trynid<out>-styrkur<s>`.
- Frame cost (Iris Xe, quality tablet, 1280×800), GPU median: 13.6 ms with the glasses at 4.7 % (26.6 ms a frame on the wall),
  14.9 ms at 8 %; 4.9 ms plain. Over a 60 Hz budget with the glasses on.

**Looking at the plain stills.** From 2 to 6 % she reads as an animal leaning down to sniff: a deep bow, her head held level,
looking at us. It does not read as a broken toy. At 8 % her face fills the frame and her skull is cut at the top.

**Weak:**
- One eye shows and the other hides behind the snout's ridge, so the face reads turned a little to her right, even after the
  outline turn.
- The bow is very deep (76–79°), with the chest folded under the head. A dedicated lean-and-sniff animation would do it better.
- Her toes at the bottom edge on 4:3 are counted with the floor (within 0.35 m of the ground). Strictly they are her skin at k 0.85.
- The motes are faint in the stills. The mist lies at the lane's far end; its cards fade beyond 40 m.
- The frame cost with the glasses is not yet within budget.

### Step 1: seven key-frame stills (2026-11-12)

The review page is `?chapter=gramedla3d&lykill=1` (or `4a`, `7b`). The arrows or the two corner buttons step through it, and it
wraps. The label is in Icelandic and carries the measured number. `kvordun=1` works as before. Strength is 0.02, D 6.5, pop 1,
and nothing is saved.

**Code.** The code is split into `remake/chapters/gramedla3d/`:
- `stage.js`: camera, lane and mist.
- `keys.js`: the key-frame table. The page is set from its rows alone.
- `pose.js`: her lean, the held clip, `solveNearest` (her nearest skin, not only the snout tip, held to the row's k) and `standAt`.
- `cast.js`:
  - the butterfly and the birds (fugl.glb);
  - Flugeðla with Egill in the saddle (her beak held each frame);
  - the specks (glints and leaf ovals);
  - the trees' bend.
- `measure.js`: the numbers.
- `review.js`: the review controls.
- `calibration.js`: step 0.

The probe is `tools/gramedla-probe.mjs --lykill all`. The test is `tests/gramedla3d-keys.test.mjs` (6 tests).

**Results at 1280×800.** All four sizes are in `qa/thrividd/gramedla/lyklar/maelingar.txt`.

| Frame | What leads | Other measures |
|---|---|---|
| 1 | Butterfly 2.0 % out | 26 motes at 1–2 % |
| 2 | Seven birds at 2.0–2.5 % | Trees bent at 22–50 m |
| 3 | Beak 1.5 % | Wingtips 5.6 % from the right edge |
| 4 | Snout at k 1.0 | — |
| 4a | Her shape 31 m in | — |
| 5 | Nearest skin 4.0 % | Puffs at 3.6 / 3.0 / 2.3 % |
| 6 | Roar head 1.77 % | Blast nearest at 3.45 % |
| 7 | Snout 3.0 % | Butterfly on the snout tip |
| 7b | Butterfly 3.7 % | Snout 2.5 % |

These hold in all frames at all sizes:
- The edge rule.
- The ground at the bottom edge, k 0.859–0.86.
- The far background at +1.8 %.
- Nothing passes through anything.

**The middle-60 % rule is broken** in frames 5 and 7 at all sizes, and in 7b on 4:3:
- A head at 3–4 % is taller than 60 % of the frame. In 5 the chin reaches v 0.80 at k ~0.38; in 7 the skull top reaches v 0.17 at k 0.57.
- The approved calibration pose broke it the same way.

**Roar.** The nearest roar pose that keeps the edges at all four sizes is k 0.53, so 1.77 % out, well under 4 %.

**Colours.** The birds are rust brown with a cream belly, average rgb(147, 96, 57): warm, with some ghost risk. The butterfly hero
is orange, not pale.

**Cost.** GPU median with the glasses, quality tablet:

| Frame | GPU median | Wall time per frame |
|---|---|---|
| 5 (heaviest) | 19.3 ms | 29.0 ms |
| 6 | 18.7 ms | 28 ms |
| 6, plain | 8.5 ms | — |

**Fiðrildadansinn** is unchanged: the stills at 20 s and 47 s are identical, byte for byte.

**Weak spots:**
- Egill is small and partly hidden. His pointing arm is short.
- The mist band is bright.
- The trees bend as a whole lean.
- The roar mouth is pink inside.
- Frame 4's front share is floor only.
- The mouth-corner seam (a pale patch on her left cheek) shows at every head turn tried. The model is not edited.
- A turn of −0.25 shows both eyes but needs u 0.44 to stay central.

## Grameðla kemur!: step 2, the motion (2026-11-12)

The show runs at `http://localhost:4300/remake/?chapter=gramedla3d` for 74.8 s from the glasses start, then shows the end card
("Aftur" replays, "Hætta" leaves). `&t=` seeks and stays paused (`window.__advance` steps on); `lykill=N` and `kvordun=1` still work.
No sound, no speech, no book tile. The cue times are kept in one place as named data: `CUES` and `cues(rig)` in
`remake/chapters/gramedla3d/timeline.js`.

**Files.**
- `timeline.js` is pure: what everything is doing at second t.
- `director.js` applies the timeline to the world.
- `cast.js` poses the cast.
- `pose.js` holds `guardBones` and `leanNow`.
- `measure.js` has a `sample()` per step.
- The probe is `remake/tools/gramedla-probe.mjs --hreyfing`.

The keys test now also checks that at each key's second the timeline is that key's row.

**Frame 3.** Egill is seen: yaw 20, neck 12, beak at u 0.42, flap clip at 0. The beak is 1.5 % out and the wings clear the edges.

**Key times moved.** 4a is at 29 s (walk second 1.29, so she reaches frame 4's spot at the walk phase nearest her idle stance) and 4 at
38 s. The other key times are unchanged.

**Her feet.** The walk clip's second follows the metres walked. In the walk-in that is about 2.5 m/s at timeScale about 2.2.

**Rest at the screen plane.** Between the sniff, the roar and the butterfly she steps back (backing walk) to frame 4's own spot and pose,
where her snout is at the screen plane:
- rest 51.8–52.9 s;
- rest 58.4–59.4 s.

**Exit.** She backs out, still facing us, to z −7 behind the screen. She cannot turn round: a 12 m animal in the 6.8 m lane would sweep
the trees. She stops short of the cycad and the broadleaf that flank the lane at z −10, and the fade covers her.

**Measures.**
- The clearances now place the actors' shells each frame. Before this they were stale.
- Small things are tested against the plants' own volumes, height and all.

The full numbers are in `qa/thrividd/gramedla/hreyfing/maelingar.txt`.
