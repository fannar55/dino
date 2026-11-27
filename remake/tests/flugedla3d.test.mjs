import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute, filmRoute, FILM_CHANGES, TURN, BEND, LANE_H, CLOUD, whiteAt } from '../chapters/flugedla3d/route.js';
import { D, NEAR, CLEAR, tanH, tanV43, sweptHit, SLALOM, GATE, POSES, POSES_FINE, plants, cloudBalls } from '../chapters/flugedla3d/stage.js';

// Flugeðla og fiðrildið (chapters/flugedla3d/): the camera's route, the swept frame rule, the stage's places, the key frames' table
// and the trials' players.

test('the camera: level, its one turn under 10 degrees a second, every change of a rate eased over a second or more', () => {
  const r = filmRoute();
  assert.ok(r.stats.maxTurn <= 10, `turn ${r.stats.maxTurn}`);
  for (const c of FILM_CHANGES) if (c.jump === undefined) assert.ok(c.over >= 1, `a change at ${c.t} s over ${c.over} s`);
  let worst = 0;
  for (let t = 0; t < r.length; t += 0.01) worst = Math.max(worst, Math.abs(r.rates.turn(t)));
  assert.ok(worst <= 10 + 1e-9, `the turn rate reaches ${worst}`);
});

test('the S-bend: two arcs of 40 degrees (about 35 m radius), the heading back to straight after them', () => {
  const r = filmRoute();
  let most = 0;
  for (let t = 29; t < 42; t += 0.01) most = Math.max(most, r.at(t).yaw);
  assert.ok(Math.abs(most - 40) < 0.3, `the first arc turns ${most.toFixed(2)} degrees`);
  assert.ok(Math.abs(r.at(42).yaw) < 0.05, `heading after the bend ${r.at(42).yaw}`);
  const radius = 6 / ((TURN * Math.PI) / 180);
  assert.ok(radius > 33 && radius < 38, `radius ${radius.toFixed(1)} m`);
  assert.ok(BEND.hold > 0);
});

test('the heights: the lane at LANE_H (the ground beyond D at a 4:3 bottom edge), the climb above the cloud, the stop on the lane', () => {
  const r = filmRoute();
  assert.ok(LANE_H >= D * tanV43, `${LANE_H} m against ${(D * tanV43).toFixed(2)} m`);
  assert.equal(r.at(10).y, LANE_H);
  assert.ok(r.at(56).y > CLOUD.top + CLOUD.clear + 20, `over the cloud at ${r.at(56).y.toFixed(1)} m`);
  assert.ok(Math.abs(r.at(75).y - LANE_H) < 0.05, `back on the lane at ${r.at(75).y.toFixed(2)} m`);
  assert.ok(r.at(75).back < 1e-6, 'the camera has stopped');
});

test('the white: whole wherever the cloud would come within 7 m of the camera, none far from it', () => {
  for (let y = CLOUD.base - CLOUD.clear; y <= CLOUD.top + CLOUD.clear; y += 0.5) assert.equal(whiteAt(y), 1, `at ${y} m`);
  assert.equal(whiteAt(LANE_H), 0);
  assert.equal(whiteAt(CLOUD.top + CLOUD.clear + CLOUD.ease[1]), 0);
  assert.equal(whiteAt(CLOUD.base - CLOUD.clear - CLOUD.ease[0]), 0);
  // it never jumps: under 0.03 of white per 10 cm of height
  for (let y = 0; y < 130; y += 0.1) assert.ok(Math.abs(whiteAt(y + 0.1) - whiteAt(y)) < 0.03, `at ${y.toFixed(1)} m`);
});

test('the dive: the camera\'s height skips only inside the full white, each white a second or so; 12 m/s through her approach and hold', () => {
  const r = filmRoute();
  const jumps = FILM_CHANGES.filter(c => c.jump !== undefined);
  assert.equal(jumps.length, 2);
  for (const j of jumps) {
    assert.equal(whiteAt(r.at(j.t - 0.05).y), 1, `before the jump at ${j.t.toFixed(2)} s`);
    assert.equal(whiteAt(r.at(j.t + 0.05).y), 1, `after the jump at ${j.t.toFixed(2)} s`);
  }
  // each full white lasts 1 to 1.5 s
  let start = null;
  const whites = [];
  for (let t = 40; t < 72; t += 0.01) {
    const full = whiteAt(r.at(t).y) >= 1;
    if (full && start === null) start = t;
    if (!full && start !== null) { whites.push(t - start); start = null; }
  }
  assert.equal(whites.length, 2);
  for (const w of whites) assert.ok(w >= 0.9 && w <= 1.5, `a white of ${w.toFixed(2)} s`);
  // out of the white by the approach (63.75), then 12 m/s down through the hold to the brake
  assert.ok(whiteAt(r.at(63.75).y) < 0.2);
  for (let t = 63.75; t <= 67; t += 0.05) assert.ok(Math.abs(r.at(t).up + 12) < 1e-9, `down at ${-r.at(t).up} m/s at ${t.toFixed(2)} s`);
  assert.equal(whiteAt(r.at(65).y), 0);
});

test('the swept frame rule: a thing in the still picture nearer than NEAR is hit, one beyond it or beside the lane is not', () => {
  const still = makeRoute([], { start: { x: 0, y: 7, z: 0, yaw: 0 }, length: 1 });
  const list = [];
  for (let t = 0; t <= 1; t += 0.1) { const p = still.at(t); list.push({ t, x: p.x, y: p.y, z: p.z, s: 0, c: 1 }); }
  assert.notEqual(sweptHit([0, 7, -10], 0.2, { list }), null);
  assert.equal(sweptHit([0, 7, -20], 0.2, { list }), null);
  assert.equal(sweptHit([CLEAR, 7, -12], 0, { list, margin: 0 }), null, 'at the lane rule\'s width the side edge meets it beyond D');
  assert.ok(CLEAR >= D * tanH, 'the lane rule');
  assert.ok(NEAR > D);
  assert.ok(POSES.length > 700);
});

test('the wood\'s mouth: five slalom trunks at the plan\'s depths, alternating sides; the gate 11 m wide just behind the screen plane', () => {
  assert.deepEqual(SLALOM.map(s => s[1]), [60, 48, 37, 27, 19]);
  for (let i = 1; i < SLALOM.length; i++) assert.ok(Math.sign(SLALOM[i][0]) !== Math.sign(SLALOM[i - 1][0]));
  assert.equal(GATE[1][0] - GATE[0][0], 11);
  assert.ok(GATE[0][1] > D && GATE[0][1] < D + 2);
  // their trunks never come into the near part of the picture
  for (const [x, z] of [...SLALOM, ...GATE].map(([a, d]) => [a, -90 - d])) for (let h = 0.5; h < 20; h += 1) assert.equal(sweptHit([x, h, z], 0.5), null);
});

test('no planted trunk and no cloud ball is ever in the near part of the picture', () => {
  for (const p of plants()) {
    if (p.slim) continue;
    assert.equal(sweptHit([p.position[0], 1, p.position[1]], 0.6), null, `${p.name} at ${p.position}`);
  }
  for (const b of cloudBalls()) assert.equal(sweptHit(b, b[3], { list: POSES_FINE }), null);
});

test('the fast take (fjor.js): its camera within the brief, its white short, the butterfly never parked', async () => {
  const { fjorRoute, cameraAt, LENGTH, FJOR_CHANGES, CLOUD_Y, herAt, butterflyAt, VALLEY } = await import('../chapters/flugedla3d/fjor.js');
  const r = fjorRoute();
  let last = cameraAt(r, 0), yawRate = 0;
  for (let t = 0.01; t <= LENGTH; t += 0.01) {
    const c = cameraAt(r, t);
    // (round 3: up to 55 degrees up at her in the head-first dive, 58 down at her up the falls)
    assert.ok(Math.abs(c.roll) <= 20 + 1e-9 && Math.abs(c.pitch) <= 60 + 1e-9, `roll ${c.roll} pitch ${c.pitch} at ${t.toFixed(2)} s`);
    if (Math.abs(t - VALLEY.t) > 0.02) yawRate = Math.max(yawRate, Math.abs(c.yaw - last.yaw) / 0.01); // (the valley's path begins in the white)
    last = c;
  }
  assert.ok(yawRate <= 60.5, `yaw ${yawRate.toFixed(1)} deg/s`);
  for (const c of FJOR_CHANGES) if (c.jump === undefined) assert.ok(c.over >= 0.3, `a change at ${c.t} s over ${c.over} s`);
  for (const j of FJOR_CHANGES.filter(c => c.jump !== undefined)) {
    for (const dt of [-0.05, 0.05]) { const y = r.at(j.t + dt).y; assert.ok(y >= CLOUD_Y.lo && y <= CLOUD_Y.hi, `the skip at ${j.t.toFixed(2)} s is in the full white (${y.toFixed(1)} m)`); }
  }
  // the butterfly: in u 0.25-0.75, no further out than k 0.27, and it moves at least 0.05 of the frame every second
  let anchor = null;
  for (let t = 0; t <= LENGTH; t += 0.05) {
    const b = butterflyAt(t, herAt(t)).at;
    assert.ok(b[0] >= 0.25 && b[0] <= 0.75 && b[2] >= 0.27 - 1e-9, `the butterfly at ${b.map(x => x.toFixed(2))} at ${t.toFixed(2)} s`);
    if (!anchor || Math.hypot(b[0] - anchor.b[0], b[1] - anchor.b[1]) > 0.05) anchor = { t, b };
    assert.ok(t - anchor.t <= 1.0 + 1e-9, `the butterfly parked from ${anchor.t.toFixed(2)} s`);
  }
});

// ---- the show (step 3): the take played once from the glasses' start to the end card, Flugeðla's three lines, the book's tile ----
test('the show: it starts from the glasses picture and ends in the end card ("Aftur" plays it again, "Hætta" leaves), no loop', async () => {
  const fs = await import('node:fs');
  const { chapter } = await import('../chapters/flugedla3d.js');
  const { glassesStart } = await import('../engine/book/show-cards.js');
  assert.equal(chapter.startButton, glassesStart, 'the glasses picture starts it');
  assert.equal(chapter.start, 'skogur');
  const src = fs.readFileSync(new URL('../chapters/flugedla3d.js', import.meta.url), 'utf8');
  assert.match(src, /endCard\(document, \{ onAgain: [^}]*\}, onQuit: \(\) => \{ player\.soundEnd\(\); leaveShow\(window\); \} \}\)/, 'the end card: Aftur again, Hætta stops the sound and leaves');
  assert.doesNotMatch(src, /% length/, 'the take is not looped');
  assert.doesNotMatch(src, /lykill|trialAt|keys\.js/, "step 1's key frames and trials are gone");
});

test("the show: Flugeðla's three lines are in lines.json and cued inside the take, on beats, clear of the slow stretches and the dip", async () => {
  const fs = await import('node:fs');
  const { chapter } = await import('../chapters/flugedla3d.js');
  const { LINES, LINE_TEXT } = await import('../chapters/flugedla3d/fjor-play.js');
  const { warp, BEAT, TIP } = await import('../chapters/flugedla3d/fjor.js');
  const lines = JSON.parse(fs.readFileSync(new URL('../assets/audio/lines.json', import.meta.url), 'utf8'));
  const source = JSON.parse(fs.readFileSync(new URL('../assets/audio/flugedla3d/lines-source.json', import.meta.url), 'utf8'));
  assert.deepEqual(source.map(l => [l.id, l.speaker, l.text]), [
    ['f3_flugedla_fidrildi', 'flugedla', 'Fiðrildi!'], ['f3_flugedla_jibbi', 'flugedla', 'Jibbí!'], ['f3_flugedla_tharna', 'flugedla', 'Þarna ertu.'],
  ]);
  assert.deepEqual(Object.keys(chapter.cast), ['flugedla']);
  const W = warp(true);
  assert.equal(LINES.length, 3);
  for (const [at, id] of LINES) {
    const entry = lines[id];
    assert.ok(entry, `${id} in lines.json`);
    assert.equal(entry.src, `assets/audio/flugedla3d/${id}.mp3`);
    assert.ok(fs.existsSync(new URL(`../${entry.src}`, import.meta.url)), `${id}'s recording`);
    assert.ok(entry.duration > 0.5 && entry.duration < 3, `${id}: ${entry.duration} s`);
    assert.equal(chapter.lines[id].text, LINE_TEXT[id]);
    assert.equal(chapter.lines[id].audio, id);
    assert.ok(Math.abs(at / BEAT - Math.round(at / BEAT)) < 1e-9, `${id} on a beat`);
    assert.ok(at >= 0.35 && at + entry.duration <= W.length - 0.35, `${id} inside the take, before the dip`);
    for (const [a, b] of W.slows) assert.ok(at + entry.duration <= a || at >= b, `${id} clear of the slow stretch ${a}-${b}`);
  }
  assert.ok(Math.abs(LINES[1][0] - W.real(TIP)) < 0.25, '"Jibbí!" as she noses over into the dive');
});

test('the show: its tile in the book, the third under "3D myndbönd", with a poster of its own', async () => {
  const fs = await import('node:fs');
  const { BOOK_3D } = await import('../engine/book/videos.js');
  assert.deepEqual(BOOK_3D.map(v => v.id).slice(0, 3), ['fidrildi3d', 'gramedla3d', 'flugedla3d']);
  const tile = BOOK_3D[2];
  assert.equal(tile.title, 'Flugeðla og fiðrildið');
  assert.equal(tile.chapter, 'flugedla3d');
  assert.match(tile.poster, /flugedla3d-thumb\.webp$/);
  assert.ok(fs.existsSync(new URL('../assets/book/videos/flugedla3d-thumb.webp', import.meta.url)));
});
