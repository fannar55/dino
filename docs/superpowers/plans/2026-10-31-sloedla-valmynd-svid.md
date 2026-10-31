# Söngur Slóeðlu: the menu on a living stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The menu of the song game becomes one stage in the evening Fen with the Tripo cast in 3D: step 1 reacts to picks, step 2's cards set everyone dancing on the beat of a looping preview, the wait while a song loads becomes a show ("Byrjum!"), and the end gets new buttons while the lane pads sink away.

**Architecture:** Pure rules in a new `engine/sloedla/stage-motion.js` (cast, layout, reactions, beat bounce, clip time, the loading ring), tested in node. A new `engine/sloedla/stage.js` draws the cast with three.js on its own canvas (loaded with `import()` like `star-view.js`; null without WebGL), and `engine/sloedla/stage-flat.js` is the same interface with the game's pictures. `menu.js` gains the new cues; `menu-view.js` drives the screens (`data-screen` on `.sl`), the beams, the words (`drawWord`) and the loading show; `lab.js` reports loading progress and starts the round when the show says so; `brot.js` loops and counts beats; `game.js` sinks the pads at the end.

**Tech Stack:** Plain ES modules, three.js (`dist/vendor`, `GLTFLoader`), canvas 2D (`text.js` `drawWord`), Web Audio (`sounds.js` bells, `brot.js`, `dj.js`), node:test with `remake/tests/setup.mjs`, ElevenLabs via `remake/tools/sloedla-dj.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-31-sloedla-valmynd-svid-design.md`. Reference mockup (outside git, the look to match): `qa/remake/sloedla/valmynd-mock/svid.html` (`?skjar=lag|hlada|lok`).

## Global Constraints

- The cast: Egill (`egill.glb`), Kambeðla (`stegosaurus.glb`, role `b`), Slóeðla (`parasaurolophus.glb`, role `a`), Þórseðla (`brontosaurus.glb`, role `c`), from `assets/characters/`, with their own clips only.
- Out of the round: Kambeðla with **2 eðlur** (`eat`, dark), Egill with **Fullorðinn** (`sit`, dark); dark = colour × **0.3**, beam off.
- Step-1 reactions: Barn → Egill `wave` once; 3 eðlur → Kambeðla `happy` once; Slóeðla `call` and Þórseðla `happy` once at every pick.
- Dance: clips `happy` (dinosaurs) and `hop` (Egill), their time set from the preview's beats; a squash on every beat; the out ones do not dance.
- Cards fly in **0.09 s** apart (first after 0.15 s); a bell as each lands, rising.
- Loading ring: never ahead of the real share of stems decoded, never full sooner than **1.5 s**, never jumps; a tick at each tenth; "Byrjum!" not before the DJ has finished `tilbuin`; "Byrjum!" lasts **0.9 s**, then a white flash, then the round. "Spilum aftur": ring full at once, no DJ line (about **1.2 s**).
- DJ lines (exact): `barn` „Egill spilar, frábært!“ · „Já, Egill spilar!“; `fullordinn` „Fullorðinn spilar, til í þetta?“ · „Nú spila þau fullorðnu!“; `thrjar` „Allar þrjár eðlurnar með!“ · „Kambeðla, Slóeðla og Þórseðla!“; `tvaer` „Slóeðla og Þórseðla spila!“ · „Tvær eðlur í dag!“; `tilbuin` „Eru allir tilbúnir?“ · „Gerum okkur klár!“ · „Allir á sinn stað!“.
- three.js only through `import()` in `lab.js`: the game and the tests never import `stage.js`. The stage draws only while the menu shows, at most **1.5** canvas pixels per CSS pixel.
- Fallback to `stage-flat.js` (pictures `assets/eitt/*.webp`): no WebGL, a model that cannot be loaded, or `?3d=0`.
- `prefers-reduced-motion`: screens change without sliding, no dance or squash, no fly-ins, no flash, no sparks.
- `?sjalf=` still opens on step 2 with `#play`; the DJ is silent there, so the loading waits only for the song.
- Answer the owner in Icelandic. Commit on `sloedla-lag` only; never merge or push. Never touch `design/` or `dist/` (importing `dist/vendor` is fine).
- Keep each file's line endings (most existing files here are CRLF, `.gitattributes` is `* -text`; new files LF like `star-motion.js`): use the Edit tool, or scripts written with Write. Bash heredocs mangle backslashes.
- One headless capture at a time: `mkdir C:\Users\fannare\AppData\Roaming\Claude\side-session-notes\local_5af6e842-d0c9-4f2a-92fb-56f234adc53d\sloedla-keppni\rec-lock` before, `rmdir` after.
- ElevenLabs key is in the environment; never print it.
- Tests: child-facing only (lean). Song tests: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla*.test.mjs`; suite: `npm run -s test:remake`.

## Review Focus

1. A child taps card after card quickly: one preview at a time, the dance follows the newest song's tempo from its own start — pinned in Task 1.
2. A tablet without WebGL (or a model that 404s): the menu shows the friends as pictures and still works — pinned in Task 4 (`createStage` resolves null in node; a failed model calls `onLost`, Task 5 swaps in the pictures), checked with `?3d=0` in Task 9.
3. A double tap on "Spila!" (or "Spilum aftur"): one load, one round — pinned in Task 3 (`go()`/`again()` give nothing while loading).
4. The tablet turned between upright and wide in the menu: the cast re-lays for the new shape — pinned in Task 2 (`castLayout`), seen in Task 9.
5. No sound yet, or `?dj=0`: the loading must not wait for a line nobody says — pinned in Task 2 (`loadingDone` with `talkUntil` 0).

---

### Task 1: Song tempos and the looping preview

**Files:**
- Modify: `remake/engine/sloedla/v2/songs/index.js` (each entry gets `bpm`; header comment)
- Modify: `remake/engine/sloedla/brot.js` (`bpmOf` option, `loop`, `beats()`; header comment)
- Modify: `remake/engine/sloedla/lab.js` (pass `bpmOf` to `createBrot`)
- Test: `remake/tests/sloedla-menu.test.mjs`

**Interfaces:**
- Produces: `SONGS_V2[i].bpm` (pixel 140, boogie 150, fonk 95, stattu-upp 130); `createBrot({ context, output, src, bpmOf })` where `bpmOf(id) → number | null`; the preview source has `loop = true`; `brot.beats() → number | null` = `((now − start) mod buffer.duration) × bpm / 60` for the playing preview, null when none plays (or its bpm is unknown); `play(id)` / `stop()` unchanged.

- [ ] **Step 1: Write the failing tests**

```js
test('every song says its tempo in the list, the same as the song itself', async () => {
  for (const entry of SONGS_V2) assert.equal(entry.bpm, (await entry.load()).default.tempo.bpm, entry.id);
});

test('the preview goes round while its card is picked, and counts its beats from its own start', async () => {
  // fetch stubbed as in 'the preview player' test; a fake context whose decode gives a 10 s buffer
  const context = createFakeContext({ state: 'running' });
  context.decodeAudioData = async () => context.createBuffer(2, context.sampleRate * 10, context.sampleRate);
  const brot = createBrot({ context, output: context.destination, src: id => id, bpmOf: id => ({ a: 120, b: 150 })[id] ?? null });
  assert.equal(brot.beats(), null);
  await brot.play('a');
  assert.equal(context.bufferSources.at(-1).loop, true);
  context.advance(1);
  assert.ok(Math.abs(brot.beats() - 2) < 1e-6, 'two beats in a second at 120');
  await brot.play('b');
  context.advance(0.4);
  assert.ok(Math.abs(brot.beats() - 1) < 1e-6, 'the newest song, at its tempo, from its start');
  context.advance(10);
  assert.ok(Math.abs(brot.beats() - 1) < 1e-6, 'round again after its ten seconds');
  brot.stop();
  assert.equal(brot.beats(), null);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla-menu.test.mjs`
Expected: FAIL (`entry.bpm` undefined; `brot.beats` is not a function)

- [ ] **Step 3: Add `bpm` to the four entries, and `bpmOf` / `loop` / `beats()` to `brot.js`**

`brot.js` keeps `{ source, gain, start, length, bpm }` in `playing`. In `lab.js`: `bpmOf: id => SONGS_V2.find(song => song.id === id)?.bpm ?? null`.

- [ ] **Step 4: Run to see them pass**, then the song tests: `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla*.test.mjs` — all pass.

- [ ] **Step 5: Commit** — `git add` the four files; message "Menu: the preview loops and counts its beats; the songs list their tempos".

---

### Task 2: The stage's rules (pure)

**Files:**
- Create: `remake/engine/sloedla/stage-motion.js`
- Test: Create `remake/tests/sloedla-stage.test.mjs`

**Interfaces:**
- Produces (all exported from `stage-motion.js`):
  - `CAST` — `{ egill: { file: 'egill', x: -2.9, z: 1.9, height: 0.85, heading: 60, rest: 'idle', cheer: 'wave', away: 'sit', dance: 'hop' }, b: { file: 'stegosaurus', x: -1.85, z: 0, height: 1.05, heading: 70, rest: 'idle', cheer: 'happy', away: 'eat', dance: 'happy' }, a: { file: 'parasaurolophus', x: 0.05, z: -0.4, height: 1.6, heading: 88, rest: 'idle', cheer: 'call', away: 'idle', dance: 'happy' }, c: { file: 'brontosaurus', x: 2.1, z: -0.1, height: 1.85, heading: 108, rest: 'idle', cheer: 'happy', away: 'idle', dance: 'happy' } }` (heading in degrees; three.js `rotation.y = −heading°` faces the camera at 90).
  - `CAMERA` — `{ wide: { fov: 32, position: [0, 1.15, 9.2], look: [0, 0.5, 0] }, tall: { fov: 50, position: [0, 1.5, 10.5], look: [0, 0.55, 0] } }`.
  - `castLayout(portrait: boolean) → { [id]: { x, z } }` — wide: `CAST`'s x, z; upright: x × **0.56**, Egill at (**−1.15**, **2.6**).
  - `outOf({ lanes, level }) → { egill: boolean, b: boolean, a: false, c: false }`.
  - `reactions(before, after) → Array<{ id, clip, once, out }>` — `before` null (first call): `[]`. Otherwise: Egill `{ clip: out ? 'sit' : 'wave', once: !out }` if his out changed; Kambeðla `{ clip: out ? 'eat' : 'happy', once: !out }` if hers changed; always `a` `{ clip: 'call', once: true, out: false }` and `c` `{ clip: 'happy', once: true, out: false }`.
  - `bounce(beats) → 0..1` — `f = beats mod 1`; `f < 0.5 ? sin(f / 0.5 · π) : 0`.
  - `loopBeats(clipSeconds, bpm) → 1 | 2 | 4 | 8` — the power of two nearest (in log2) to `clipSeconds / (60 / bpm)`, clamped to 1..8.
  - `clipTime(beats, loop, clipSeconds) → seconds` — `((beats mod loop) / loop) × clipSeconds`.
  - `RING_MIN = 1.5`; `ringStep(shown, real, dt) → 0..1` — `max(shown, min(real, shown + dt / RING_MIN))`, clamped to 0..1.
  - `loadingDone({ shown, now, talkUntil }) → boolean` — `shown >= 1 && now >= talkUntil`.

- [ ] **Step 1: Write the failing tests** in `sloedla-stage.test.mjs`:

```js
test('the friends hop on every beat and rest the second half of it', () => {
  assert.equal(bounce(0), 0);
  assert.ok(Math.abs(bounce(0.25) - 1) < 1e-9 && Math.abs(bounce(3.25) - 1) < 1e-9);
  assert.ok(bounce(0.5) < 1e-9 && bounce(0.75) === 0);
});

test('a dance move spans 1, 2, 4 or 8 beats, as near its own length as can be, and starts on the beat', () => {
  assert.equal(loopBeats(1.1, 150), 2);   // Egill's hop at Rokkhopp
  assert.equal(loopBeats(2.4, 95), 4);    // a happy dance at Fönkhopp
  assert.equal(loopBeats(0.1, 120), 1);
  assert.equal(loopBeats(30, 60), 8);
  assert.deepEqual([0, 2, 4, 5].map(b => clipTime(b, 4, 2.4)), [0, 1.2, 0, 0.6]);
});

test('the loading ring: never ahead of the song, never full before a second and a half, never a jump, never back', () => {
  let shown = 0, t = 0;
  while (shown < 1 && t < 5) { const next = ringStep(shown, 1, 0.1); assert.ok(next - shown <= 0.1 / RING_MIN + 1e-9); shown = next; t += 0.1; }
  assert.ok(t >= RING_MIN - 1e-9, `full after ${t.toFixed(1)} s`);
  assert.equal(ringStep(0, 0.3, 1), 0.3, 'not ahead of what has come');
  assert.equal(ringStep(0.5, 0.4, 0.1), 0.5, 'never back');
  assert.equal(ringStep(1, 1, 0), 1, 'again: full at once');
});

test('"Byrjum!" waits for the DJ to finish, and for nobody when he is silent', () => {
  assert.equal(loadingDone({ shown: 1, now: 2, talkUntil: 2.4 }), false);
  assert.equal(loadingDone({ shown: 1, now: 2.5, talkUntil: 2.4 }), true);
  assert.equal(loadingDone({ shown: 0.9, now: 9, talkUntil: 0 }), false);
  assert.equal(loadingDone({ shown: 1, now: 0.2, talkUntil: 0 }), true);
});

test('the stage answers the picks: Fullorðinn, Egill sits in the dark; 2 eðlur, Kambeðla eats in the dark; the others cheer', () => {
  const by = list => Object.fromEntries(list.map(r => [r.id, r]));
  assert.deepEqual(reactions(null, { lanes: 3, level: 'barn' }), []);
  const two = by(reactions({ lanes: 3, level: 'barn' }, { lanes: 2, level: 'barn' }));
  assert.deepEqual(two.b, { id: 'b', clip: 'eat', once: false, out: true });
  assert.equal(two.egill, undefined);
  assert.deepEqual([two.a.clip, two.c.clip], ['call', 'happy']);
  const grown = by(reactions({ lanes: 2, level: 'barn' }, { lanes: 2, level: 'fullordinn' }));
  assert.deepEqual(grown.egill, { id: 'egill', clip: 'sit', once: false, out: true });
  const back = by(reactions({ lanes: 2, level: 'fullordinn' }, { lanes: 3, level: 'barn' }));
  assert.deepEqual([back.egill.clip, back.b.clip, back.b.out], ['wave', 'happy', false]);
});

test('on an upright screen the friends stand closer, Egill in front', () => {
  const wide = castLayout(false), tall = castLayout(true);
  for (const id of ['b', 'a', 'c']) assert.ok(Math.abs(tall[id].x - wide[id].x * 0.56) < 1e-9, id);
  assert.deepEqual(tall.egill, { x: -1.15, z: 2.6 });
});

test('every friend on the stage is on disk with every move the stage asks of her', () => {
  // read each GLB's JSON chunk (bytes 20 .. 20 + readUInt32LE(12)) and its animations' names
  for (const [id, c] of Object.entries(CAST)) {
    const names = clipNamesOf(new URL(`../assets/characters/${c.file}.glb`, import.meta.url));
    for (const clip of [c.rest, c.cheer, c.away, c.dance]) assert.ok(names.includes(clip), `${id} ${c.file}: ${clip}`);
  }
});
```

- [ ] **Step 2: Run to see them fail** — `node --import ./remake/tests/setup.mjs --test remake/tests/sloedla-stage.test.mjs`. Expected: FAIL (module not found).

- [ ] **Step 3: Write `stage-motion.js`** with the exports above and a header comment on what the stage is.

- [ ] **Step 4: Run to see them pass.**

- [ ] **Step 5: Commit** — "Menu stage: its rules (cast, reactions, dance on the beat, loading ring)".

---

### Task 3: The DJ's new lines and the menu's cues

**Files:**
- Modify: `remake/engine/sloedla/dj.js` (`DJ_LINES` gets `barn`, `fullordinn`, `thrjar`, `tvaer`, `tilbuin`, texts exactly as in Global Constraints; header comment on the menu's lines)
- Create (by the tool): `remake/assets/audio/sloedla/dj/{barn,fullordinn,thrjar,tvaer}-{1,2}.mp3`, `tilbuin-{1,2,3}.mp3`; Modify `dj.json`
- Modify: `remake/engine/sloedla/menu.js`, `remake/engine/sloedla/menu-view.js` (`go()` → `menu.go()`)
- Test: `remake/tests/sloedla-menu.test.mjs`; the on-disk check already in `sloedla.test.mjs` ('the DJ calls the milestones…') covers the new takes

**Interfaces:**
- Produces (`menu.js`):
  - `choose(name, value)` → once heard: `[{ hush: true }, { say: 'barn' | 'fullordinn' | 'thrjar' | 'tvaer' }]` (the hush cuts the greeting when the first tap is a pick); before: `[]`.
  - `pick(id)` → `[]` when `id` is the picked song and its preview is still playing (no new line, no restart); otherwise as now.
  - `go()` → `null` while no song is picked or while loading; else `[{ hush: true }, { stop: true }, { say: 'tilbuin' }]` (say only once heard) and `step` becomes `'hlada'`.
  - `again()` → `null` while loading; else `[{ hush: true }]`, `step` `'hlada'`.
  - `begun()` — the round began: `step` `'umferd'`.
  - `play()` unchanged (the choice); `back()`, `other()`, `toSongs()` stop the "playing" mark as the preview stops.

- [ ] **Step 1: Write the failing tests**

```js
test('menu: a pick in step 1 is said, and the first tap that is a pick cuts the greeting', () => {
  const menu = createMenu({ songs });
  assert.deepEqual(menu.choose('stig', 'fullordinn'), [], 'nothing before the sound is open');
  assert.deepEqual(menu.unlock(), [{ say: 'hverspilar' }]);
  assert.deepEqual(menu.choose('stig', 'barn'), [{ hush: true }, { say: 'barn' }]);
  assert.deepEqual(menu.choose('stig', 'fullordinn'), [{ hush: true }, { say: 'fullordinn' }]);
  assert.deepEqual(menu.choose('brautir', 2), [{ hush: true }, { say: 'tvaer' }]);
  assert.deepEqual(menu.choose('brautir', 3), [{ hush: true }, { say: 'thrjar' }]);
});

test('menu: the same card again says and plays nothing new while its bit plays', () => {
  const menu = createMenu({ songs });
  menu.unlock();
  menu.toSongs();
  assert.equal(menu.pick('pixel').length, 4);
  assert.deepEqual(menu.pick('pixel'), []);
  menu.other();
  assert.equal(menu.pick('pixel').length, 4, 'after a round its bit is not playing: it plays again');
});

test('menu: Spila! gets everyone ready once; Spilum aftur says nothing; no second start while one loads', () => {
  const menu = createMenu({ songs });
  menu.unlock();
  assert.equal(menu.go(), null, 'no song, no start');
  menu.pick('pixel');
  assert.deepEqual(menu.go(), [{ hush: true }, { stop: true }, { say: 'tilbuin' }]);
  assert.equal(menu.state().step, 'hlada');
  assert.equal(menu.go(), null, 'a double tap starts one round');
  assert.equal(menu.again(), null);
  menu.begun();
  assert.deepEqual(menu.again(), [{ hush: true }]);
  assert.equal(menu.again(), null);
});
```

Update the existing 'menu: who plays, then the songs…' test: `choose('stig', 'fullordinn')` → `[{ hush: true }, { say: 'fullordinn' }]`.

- [ ] **Step 2: Run to see them fail** (song tests). Expected: FAIL on the new cues; and the DJ on-disk test once `DJ_LINES` has the keys (`barn-1.mp3 is there`).

- [ ] **Step 3: Write the lines in `dj.js` and the cues in `menu.js`; in `menu-view.js`, `go()` runs `menu.go()` (or `menu.again()` from `[data-again]`), returns early on null, then calls `onPlay(menu.play(), { again })`.**

- [ ] **Step 4: Record the takes:** `node remake/tools/sloedla-dj.mjs --only barn,fullordinn,thrjar,tvaer,tilbuin` (the tool checks each take by speech-to-text and retries). Check its log says every take was heard as written; listen-check is the tool's STT match.

- [ ] **Step 5: Run the song tests** — all pass (new takes on disk, `dj.json` texts match).

- [ ] **Step 6: Commit** — the dj.js, menu.js, menu-view.js, test and the new mp3s + dj.json; "Menu: the DJ says the picks and gets everyone ready; one start at a time".

---

### Task 4: The stage in 3D, and in pictures

**Files:**
- Create: `remake/engine/sloedla/stage.js` (three.js)
- Create: `remake/engine/sloedla/stage-flat.js` (DOM pictures)
- Test: `remake/tests/sloedla-stage.test.mjs`

**Interfaces:**
- Consumes: Task 2's `CAST`, `CAMERA`, `castLayout`, `outOf`, `reactions`, `bounce`, `loopBeats`, `clipTime`.
- Produces — both modules return the same `Stage`:
  - `createStage({ canvas, asset, win = globalThis, onLost = () => {} }) → Promise<Stage | null>` — null when the renderer cannot be made (no WebGL); otherwise resolves as soon as the renderer is up, and loads the four models in the background: each friend drops in (from 0.6 above, 0.4 s, a squash on landing) when hers is in, already in the current choice's state (sitting dark if out). If any model fails, the stage stops drawing, clears its canvas, disposes everything and calls `onLost()` once.
  - `createFlatStage({ root, asset, win = globalThis }) → Stage` — `<img>`s of `eitt/stegosaurus-tail.webp`, `eitt/parasaurolophus.webp`, `eitt/brontosaurus.webp` (and no Egill) in `root`, bobbing, dark when out, hopping on the beat.
  - `Stage.setChoice({ lanes, level })` — out-ness from `outOf`; plays `reactions(previous, now)` (nothing the first time).
  - `Stage.cheer()` — the friends who are in play their cheer once, **0.12 s** apart.
  - `Stage.frame(dt, beats, bpm)` — `beats` null: rest clips (`away` when out). Otherwise the ones in dance: their `dance` clip held at `clipTime(beats, loopBeats(clip.duration, bpm), clip.duration)` (action `timeScale` 0, crossfade 0.25 s), scale `y × (1 + 0.05·bounce)`, `x, z × (1 − 0.025·bounce)`. Dimming eases toward 0.3 (out) or 1 over about 0.25 s by multiplying each material's own colour. Renders.
  - `Stage.feet() → Array<{ id, x, y, out }>` — each friend's feet in CSS pixels of the stage's box (for the beams); only the friends that are there (the flat stage has no Egill, so his beam stays off).
  - `Stage.resize()` — renderer size, `CAMERA.wide` or `.tall`, `castLayout` by the box's shape.
- Look (from the mockup): `HemisphereLight('#9fb2ff', '#2a1f4a', 1.4)`, key `DirectionalLight('#ffe6b8', 2.2)` at (−3, 6, 6), rim `('#8fe0ff', 1.4)` at (4, 3, −4); a soft round shadow plane under each (`height × 1.3` by `height × 0.7`); each model scaled to its `height`, feet on y 0; `mixer.timeScale` 0.9–1.1 each; renderer `alpha: true, antialias: true`, pixel ratio ≤ 1.5.

- [ ] **Step 1: Write the failing test**

```js
test('with no WebGL the stage is null, so the page shows the friends as pictures', async () => {
  const { createStage } = await import('../engine/sloedla/stage.js');
  assert.equal(await createStage({ canvas: {}, asset: path => path, win: { devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 } }), null);
});
```

- [ ] **Step 2: Run to see it fail** (module not found).

- [ ] **Step 3: Write `stage.js` and `stage-flat.js`** (renderer creation in try/catch → null; model loads in try/catch → dispose and null).

- [ ] **Step 4: Run the song tests** — pass.

- [ ] **Step 5: Commit** — "Menu stage: the cast in 3D, and in pictures where 3D cannot be".

---

### Task 5: The stage on the page, and step 1

**Files:**
- Modify: `remake/sloedla-lab.html` (layers inside `.sl`, in order: `canvas.sl-sky`, `.sl-aurora`, `.sl-world` holding `.sl-bg` (`assets/sloedla/kvold-fen.webp`, `kvold-fen-upright.webp` when upright, faded out at its top and bottom 16 %), four `.sl-beam` (`data-beam="egill|b|a|c"`) and `canvas.sl-stage`; `.sl-night`; then the field and stars canvases as now; `canvas.sl-words` for `drawWord`; the `<h1>` kept but visually hidden; step 1's buttons as in the mockup)
- Modify: `remake/sloedla.css` (the new look: dark-glass buttons, gold when pressed, the big gold breathing button with its shine; `.sl[data-screen=…] .sl-world` transforms: `lag` `translateY(-17vh)` wide / `-15vh` upright, `hlada` `translateY(27vh) scale(1.06)` wide / `translateY(24vh) scale(1.02)` upright, 1.1 s; `.sl-night` 0.5 opacity on `lag`; world and night hidden on `umferd` and `lok`; step 1's buttons rise in from below; `.sl-dj[data-talking]` wiggles faster; `prefers-reduced-motion` per Global Constraints; the old flat menu background goes)
- Modify: `remake/engine/sloedla/menu-view.js` (sets `data-screen` on `.sl`: `hver | lag | hlada | lok | umferd`; owns a frame loop that runs only while the screen is `hver`, `lag` or `hlada`: sky stars, words, `stage.frame`, beams from `stage.feet()`; `stage.setChoice` on every pick; a `chimes.sparkle(880)` on step-1 picks; `data-talking` on `.sl-dj` for the seconds `dj.play` returned, off at `hush`)
- Modify: `remake/engine/sloedla/lab.js` (makes the stage: `options.stars3d` false → flat; else `import('./stage.js').then(m => m.createStage({ …, onLost }))`, null → flat; `onLost` → `view.useStage(createFlatStage(…))`; the menu bells: `createSongSounds({ context, output: mix })`, passed as `chimes`; `?3d=0` documented as covering the stage too)

**Interfaces:**
- Consumes: Task 3's cues; Task 4's `Stage`.
- Produces: `createMenuView({ …, chimes: { sparkle(freq), tick(freq), star(n) } | null, reduced: boolean })`; `view.useStage(stage)` (the menu works with no stage; a new one gets the current choice, with no reactions); `view.screen(name)` (sets `data-screen`, starts or stops the loop); the title drawn with `drawWord(g, 'Söngur Slóeðlu', …, { style: 'rainbow', stagger: 0.05, pop: 0.35, wave: 0.06 })` at 17 % of the height wide, 20 % upright, size `min(9 % of width, 84 wide / 54 upright)`.

- [ ] **Step 1: Build it** (no unit test: the look is checked in the browser; the logic it uses is tested in Tasks 2–4).

- [ ] **Step 2: Look at it** — headless Edge at 1280×800 and 390×844 (a walk script in the scratchpad, like `mock-walk.mjs`, against `remake/sloedla-lab.html`): step 1 at rest; after "2 eðlur" Kambeðla is dark and eating; after "Fullorðinn" Egill sits, dark. No page errors. Compare with the mockup's step 1.

- [ ] **Step 3: Run the song tests** — pass. **Commit** — "Menu: the stage in the evening Fen, and step 1 on it".

---

### Task 6: Step 2 — the cards and the dance

**Files:**
- Modify: `remake/engine/sloedla/menu-view.js` (cards: `.sl-cardpic` popping over the top on a ring of the song's hue, name, `by`, stars as `<b>★…</b>★…` of five, "Met: …"; `--i` for the fly-in; a `chimes.sparkle(660 × r)` as each lands, `r` from `[1, 1.125, 1.25, 1.5, 1.667]` cycling, at `0.38 + i × 0.09` s; the picked card gets `just` (pop) and sparks, also when it is tapped again (then nothing else happens); each frame on `lag`: `stage.frame(dt, reduced ? null : brot.beats(), bpm of the picked song)`, beams `--beam` = the hue at 0.55 alpha and `brightness(1 + 0.9 × bounce)`, the picked card's `--hop` = `bounce`; "← Til baka" clears the hue)
- Modify: `remake/sloedla.css` (cards as in the mockup: dark glass of the hue, light rim, picture 112 % wide with −46 px top margin wide / 74 % and −30 px upright; one row wide, two by two upright; picked: lifted, `scale(1.07)`, glow; others 0.6 opacity, `scale(0.94)`; "Spila!" keeps its place hidden until a pick, then pops)
- Modify: `remake/sloedla-lab.html` (step 2's row: "← Til baka" and the gold "Spila!" with `#play`)

**Interfaces:**
- Consumes: Task 1's `brot.beats()` and `SONGS_V2[i].bpm`; Task 2's `bounce`; Task 3's `pick` (same card → `[]`).

- [ ] **Step 1: Build it.**
- [ ] **Step 2: Look at it** — the walk at both sizes: cards landed; a card picked (two frames 170 ms apart differ in the dancers); upright, the cast stands clear above the cards and under the DJ. No page errors.
- [ ] **Step 3: Run the song tests** — pass. **Commit** — "Menu: song cards on the stage; everyone dances to the picked song".

---

### Task 7: The loading show

**Files:**
- Modify: `remake/sloedla-lab.html` (a `#loading` section: vignette, `.sl-disc` with halo, face, `<img>`, ring, tip `★`; a `.sl-flash`)
- Modify: `remake/sloedla.css` (as in the mockup: disc at 30 % of the height wide / 27 % upright, size `min(36 vh, 62 vw)`; ring `conic-gradient` by `--p`, 14 px; vignette; flash)
- Modify: `remake/engine/sloedla/menu-view.js` (`showLoading(song, { again })`)
- Modify: `remake/engine/sloedla/lab.js` (`start({ again })`: show the loading, report progress per stem, await the show, then start the round and `menu.begun()`)

**Interfaces:**
- Consumes: Task 2's `ringStep`, `loadingDone`; Task 3's `go()`/`again()`/`begun()`; Task 4's `stage.cheer()`.
- Produces: `view.showLoading(song, { again: boolean }) → { progress(share: number): void, finished: Promise<void> }` — screen `hlada`; `#start` and `#end` hidden (so Enter and space do nothing while it loads: `enter()` already returns when both are hidden); words: the song's name (rainbow, `min(10 % width, 60)`) under the disc and `by` (cream) under it; `stage.cheer()` after 0.3 s; each frame `shown = ringStep(shown, real, dt)` (`again`: `shown = real = 1` at once); a `chimes.tick(1100 + 130 × k)` at each new tenth `k`; when `loadingDone({ shown, now, talkUntil })` (`talkUntil` = the loop's clock when the cues ran + the seconds `dj.play('tilbuin')` returned; 0 when he said nothing): "Byrjum!" (rainbow, over the disc, `min(17 % width, 120)`), `chimes.star(5)`, two sparks bursts (hue, gold), `stage.cheer()`; 0.9 s later the flash (0.65 s); `finished` resolves at the flash's peak and the screen becomes `umferd`. Reduced motion: no flash, no sparks.
- `lab.js`: `progress(done / total)` after each stem (a failed one counts as done); `progress(1)` when all are in (and at once when there is nothing to fetch).

- [ ] **Step 1: Build it.**
- [ ] **Step 2: Look at it** — the walk: shots during the ring and at "Byrjum!", both sizes; the round starts after; `window.__sloedla.state().phase` is the round's. Run `full-house.mjs` (scratchpad) once to see the measuring path (`?sjalf=…` + `#play`) still reaches the end with no errors.
- [ ] **Step 3: Run the song tests** — pass. **Commit** — "Menu: the wait while a song loads is a show".

---

### Task 8: The end — pads sink, new buttons

**Files:**
- Modify: `remake/engine/sloedla/star-motion.js` (`padSink`)
- Modify: `remake/engine/sloedla/game.js` (`drawDinosaurs`: each pad's y + `padSink(t, endPlan) × (h − hitY + dinoR × 1.4)` once the end has begun; `t` as the end's other timings)
- Modify: `remake/sloedla-lab.html` (`#end`: `canvas.sl-end-words` for the words; "Spilum aftur" (gold, the arrow `svg` as now) and "Annað lag" (glass, `.sl-fan` of the songs' pictures))
- Modify: `remake/sloedla.css` (dark floor `linear-gradient` under the buttons, 30 vh wide / 36 vh upright; buttons rise 0.6–0.7 s after showing; the arrow turns once on showing and on hover; side by side wide, stacked upright)
- Modify: `remake/engine/sloedla/menu-view.js` (`showEnd` draws `#end-words`' text with `drawWord` cream, wave 0.08, at 78.5 % wide / 65.5 % upright of the height, size `min(7 % width, 34)`; two `chimes.sparkle` at 0.65 s and 0.75 s; "Spilum aftur" → `again()` → `onPlay(…, { again: true })`; "Annað lag" → screen `lag`, cards fly in, `menu.other()`)
- Modify: `remake/engine/sloedla/lab.js` (`onPlay` passes `{ again }` to `start`)
- Test: `remake/tests/sloedla-stars.test.mjs`

**Interfaces:**
- Produces: `padSink(t, times) → 0..1` — 0 until `times.countTo`, eased (`easeOut`) to 1 at `times.done` (= `countTo + END.rest`), 1 after.

- [ ] **Step 1: Write the failing test**

```js
test('the dinosaur pads sink away after the count, gone by the time the buttons come', () => {
  for (const stars of [0, 3, 5]) {
    const times = endTimes(stars);
    assert.equal(padSink(times.countTo, times), 0);
    assert.ok(padSink((times.countTo + times.done) / 2, times) > 0.4);
    assert.equal(padSink(times.done, times), 1);
    assert.equal(padSink(times.done + 5, times), 1);
  }
});
```

- [ ] **Step 2: Run to see it fail** (`padSink` not exported).
- [ ] **Step 3: Write `padSink`; use it in `game.js`; build the end's buttons and words.**
- [ ] **Step 4: Run the song tests** — pass. Look: `?lokaskjar=4` and `?lokaskjar=fullkominn` at both sizes, buttons on a dark floor, no pads under them; "Spilum aftur" goes through the short loading (ring full at once, no line) into the round; "Annað lag" shows the stage and the cards.
- [ ] **Step 5: Commit** — "End: the pads sink away; new buttons in the game's look".

---

### Task 9: The whole way through, both sizes; the fallback; the suite

**Files:**
- Create (scratchpad, not committed): a walk script for `remake/sloedla-lab.html?lokaskjar=4` (real pointer clicks: Barn, 2 eðlur, 3 eðlur, Veljum lag, a card, Spila, wait, end, Spilum aftur, wait, end, Annað lag)
- Output: `qa/remake/sloedla/valmynd-svid/` (gitignored)

- [ ] **Step 1: Walk** at 1280×800 and 390×844 (lock as in Global Constraints): a shot of each screen; no page errors; then `?3d=0` at 1280×800, steps 1 and 2 (the pictures, dark when out, hopping on the beat).
- [ ] **Step 2: Suite** — `npm run -s test:remake`; all pass.
- [ ] **Step 3: Self-review** of `git diff 4c58c5a..HEAD` against the spec (the owner's rule: no reviewer agents); fix what it finds with a test first where a test can show it.
- [ ] **Step 4: Show the owner** the shots (SendUserFile), with the localhost link `http://localhost:4231/remake/sloedla-lab.html`, and the two open points from the spec (should the DJ name Egill; the new lines' wording).
- [ ] **Step 5: Commit** any fixes; update the memory file `sloedla-lag-state.md` (menu stage built, commits, not merged).
