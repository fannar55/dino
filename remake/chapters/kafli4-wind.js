// Scene 3 of chapter 4 (spec 4.3): Egill makes the wind. Flugeðla sits on the top of the white snag with her wings spread and cannot
// take off, for there is no wind. A stroke up the screen, anywhere on it, is a gust, and a tap half of one, so a child who taps gets
// there too; six fill the wind.
//
//   yield* theWind(s, c);   // c: the chapter's state: world, mosi, egill, flugedla, perch (kafli4-flugedla.js), lines (lineQueue),
//                           // sounds (engine/audio/flight-sounds.js), doc (the page for the hint, or null)
//
// Each gust is seen and heard: the wind's strength rises to 2.2 and eases back over 1.2 s (the reeds and the grass lean with it,
// world/forest/materials.js), leaves and seeds fly up along the stroke, her wings stir, and a gust sounds. Egill blows along on every
// second gust and Mosi on every third, and she cheers after the third: „Meira! Ég finn hann!“. A child who does nothing gets a hint
// after 6 s (a glowing finger strokes up and Mosi says „Strjúktu upp, Egill!“), Mosi shows how he blows after 12 s („Svona! Fúúú!“,
// a gust of his), and from 20 s a gust comes by itself every 4 s, so the wind always fills. Full: a big gust, the clouds set off,
// „Nú!“, and she lifts off the top. The scene is over once she is up (scene 4 takes her round the tree).
//
// The juice review of 2026-11-07 added: Mosi's „Strjúktu upp, Egill!“ as the scene opens (the hint's first line is then the other
// way of saying it, „Strjúktu fingrinum upp skjáinn!“); her „Ó! Smá vindur!“ after the first gust and „Næstum því!“ as the wind is
// all but full; Egill's own „Fúúú!“ the first two times he blows, and a breath heard when a mouth only puffs; each gust a little
// higher than the one before. leafPuff (below) is the gust's leaves and seeds in a puff, for her take-off and landings.
//
// What happened is in c.wind, for tests and probes: { filled, gusts: [{ by, at, n }], blows: [{ who, gust, at }], hints: [at],
// showedAt, almost, fullAt, bigAt, endedAt, cloudSpeed, lifted }. `by` is 'up', 'tap', 'mosi' or 'auto'; `n` the gust's number; a blow
// of Egill's has `said` when he said his line.
import * as THREE from 'three';
import { glints, run } from '../world/props/sparkles.js';

export const WIND = {
  fill: 6, // gusts that fill the wind
  count: { up: 1, tap: 0.5, mosi: 1, auto: 1 }, // what each kind of gust counts
  calm: 0.08, // the wind's strength before the first gust (kafli4.js: CALM)
  gust: 2.2, // its strength at the height of a gust
  rise: 0.15, // seconds a gust takes to blow up
  ease: 1.2, // and to ease back
  big: 3, // the big gust once the wind is full
  bigHold: 1.4, // seconds the big gust holds before it eases back to full wind
  hintAfter: 6, // seconds without a gust of the child's before the hint
  hintSaid: 2, // times Mosi says the hint at most
  showAfter: 12, // before Mosi shows how
  autoAfter: 20, // before a gust comes by itself
  autoEvery: 4, // and then one every so often
  cheerAt: 3, // her "Meira!" after this gust
  egillEvery: 2, // Egill blows along on every second gust
  mosiEvery: 3, // and Mosi on every third
  clouds: 12, // how fast the clouds go once the wind is up
  lift: 0.6, // metres she rises off the top on the big gust
  // the juice review of 2026-11-07: a gust's pitch, [the first's, the rise each gust after it] (0.96 up to 1.11 by the sixth);
  // the times Egill says his „Fúúú!“ as he blows at most (after that his mouth only puffs, as Mosi's does)
  pitch: [0.96, 0.03],
  egillSays: 2,
};

const FLUGEDLA_HEAD = { actor: 'flugedla', part: 'head' };
// Mosi's hint, in turn: the second way first, as the scene's opening line said the first (the juice review of 2026-11-07)
const HINTS = ['k4_mosi_swipe2', 'k4_mosi_swipe'];
// Blowing: the mouth opens for a long puff (talk.js: one hex digit a frame, 20 frames a second)
const PUFF = '258bdeeeeeeeeedca8641';
// How a gust looks: leaves and seeds, soft and of sizes that differ, flying up along the stroke (the sparkles' machinery, sparkles.js)
const LEAVES = { colour: '#c9a640', heart: '#e8d37a', size: 0.34, count: 22 }; // dry fen leaves: gold reads on the green and the sky
const SEEDS = { colour: '#f3efe2', heart: '#ffffff', size: 0.16, count: 26 }; // white fluff
const FLYING = { glow: 0.5, falloff: 2, star: 0, twinkle: 0, rim: 1, vary: 1, swirl: 3, blending: THREE.NormalBlending, floor: -0.2, span: 1.2 };
// The way an auto gust's leaves fly when no finger drew one: up the screen from low on the left (normalized device coordinates)
const AUTO_STROKE = [[-0.35, -0.75], [0.1, 0.35]];

export function* theWind(s, c) {
  const { world } = c;
  const wind = (c.wind = { filled: 0, gusts: [], blows: [], hints: [], showedAt: null, almost: null, fullAt: null, bigAt: null, endedAt: null, cloudSpeed: 1, lifted: 0 });
  const strength = world.wind?.uniforms?.uWindStrength ?? { value: WIND.calm };
  strength.value = WIND.calm;
  let pulse = null; // the gust blowing: { at, from, peak, hold, ease, base }
  let since = s.time; // the last gust of the child's (or the scene's start)
  let hint = null; // the glowing finger, while it shows
  let said = 0; // times Mosi has said the hint
  let nextAuto = null;
  const base = () => WIND.calm + (1 - WIND.calm) * Math.min(1, wind.filled / WIND.fill);

  function blowUp(peak, { hold = 0, ease = WIND.ease } = {}) {
    pulse = { at: s.time, from: strength.value, peak, hold, ease };
  }
  function windFrame() {
    if (!pulse) {
      strength.value = base();
      return;
    }
    const t = s.time - pulse.at;
    const after = base();
    if (t < WIND.rise) strength.value = pulse.from + (pulse.peak - pulse.from) * smooth(t / WIND.rise);
    else if (t < WIND.rise + pulse.hold) strength.value = pulse.peak;
    else {
      const k = Math.min(1, (t - WIND.rise - pulse.hold) / pulse.ease);
      strength.value = pulse.peak + (after - pulse.peak) * smooth(k);
      if (k >= 1) pulse = null;
    }
  }

  function gust(by, stroke) {
    if (wind.fullAt !== null) return;
    const n = wind.gusts.length + 1;
    wind.gusts.push({ by, at: s.time, n });
    wind.filled = Math.min(WIND.fill, wind.filled + WIND.count[by]);
    if (by === 'up' || by === 'tap') {
      since = s.time;
      showHint(false);
    }
    blowUp(WIND.gust);
    c.perch.stir(1);
    // a little higher with each gust, as the wind grows (the juice review: no gust sounds the same as the one before)
    if (!s.seeking) c.sounds?.gust({ rate: WIND.pitch[0] + WIND.pitch[1] * Math.min(n - 1, WIND.fill) });
    leavesAlong(stroke, `gust ${n}`);
    // Egill and Mosi blow along: Egill on every second gust, Mosi on every third (one who is speaking just speaks)
    if (n % WIND.egillEvery === 0) blow('egill', n);
    if (n % WIND.mosiEvery === 0 && by !== 'mosi') blow('mosi', n);
    if (n === WIND.cheerAt) s.after(0.5, () => c.lines.say('flugedla', 'k4_flugedla_more').task);
    // her other cheers (the juice review): she feels the first gust, and the wind all but full; each only when no line plays
    if (n === 1) s.after(0.5, () => { c.lines.say('flugedla', 'k4_flugedla_breeze', { ifQuiet: true }); return null; });
    if (wind.filled >= WIND.fill - 1 && wind.filled < WIND.fill && !wind.almost) {
      wind.almost = s.time;
      s.after(0.5, () => { if (wind.fullAt === null) c.lines.say('flugedla', 'k4_flugedla_almost', { ifQuiet: true }); return null; });
    }
    if (wind.filled >= WIND.fill) wind.fullAt = s.time;
  }

  // Where a gust's leaves fly: a stroke on the screen, as normalized device coordinates, from where it began to where it went, out in
  // front of Mosi and Egill (between them and the camera, a little over halfway to them)
  const camera = world.camera;
  function inFront([x, y], out) {
    const reach = THREE.MathUtils.clamp(camera.position.distanceTo(c.mosi.raw.root.position) * 0.5, 4, 12);
    out.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
    return out.multiplyScalar(reach).add(camera.position);
  }
  const ndc = (x, y, width, height) => [(x / width) * 2 - 1, 1 - (y / height) * 2];
  function leavesAlong(stroke, seed) {
    if (!world.effects || !world.scene || !camera) return;
    const from = new THREE.Vector3(), to = new THREE.Vector3();
    if (stroke?.points) {
      from.copy(stroke.points[0]);
      to.copy(stroke.points[1]);
    } else {
      const [a, b] = stroke?.ndc ?? AUTO_STROKE;
      inFront(a, from);
      inFront(b, to);
    }
    for (const kind of [LEAVES, SEEDS]) flyAlong(from, to, kind, `${seed} ${kind.size}`);
  }
  const flyAlong = (from, to, kind, seed) => leavesFly(world, from, to, kind, seed);

  function blow(who, n) {
    const actor = c[who];
    if (!actor?.raw || actor.raw.talking) return;
    wind.blows.push({ who, gust: n, at: s.time });
    // Egill says his „Fúúú!“ the first times he blows, when no line plays; else (and Mosi always) the mouth puffs and a breath is heard
    const said = who === 'egill' && wind.blows.filter(b => b.who === 'egill' && b.said).length < WIND.egillSays
      && c.lines.say('egill', 'k4_egill_blow', { ifQuiet: true }) !== null;
    wind.blows.at(-1).said = said;
    if (!said) {
      actor.raw.talk({ mouth: PUFF, duration: PUFF.length / 20 });
      if (!s.seeking) s.sfx('blow', { pan: who === 'mosi' ? -0.25 : 0.25, level: who === 'mosi' ? 1.2 : 0.8 });
    }
    const head = actor.raw.headPosition(new THREE.Vector3());
    const her = world.resolvePoint(FLUGEDLA_HEAD, new THREE.Vector3());
    flyAlong(head, head.clone().lerp(her, 0.35), SEEDS, `${who} blows ${n}`);
  }

  function showHint(on) {
    if (on && !hint && c.doc) {
      hint = c.doc.createElement('div');
      hint.className = 'wind-hint';
      hint.setAttribute('aria-hidden', 'true');
      c.doc.body.append(hint);
    } else if (!on && hint) {
      hint.remove();
      hint = null;
    }
  }

  // The help, by the seconds since the child's last gust (or the scene's start)
  function helpFrame() {
    const idle = s.time - since;
    if (idle >= WIND.hintAfter && !wind.hints.some(at => at >= since)) {
      wind.hints.push(s.time);
      showHint(true);
      if (said < WIND.hintSaid) {
        said++;
        c.lines.say('mosi', HINTS[(said - 1) % HINTS.length]);
      }
    }
    if (idle >= WIND.showAfter && wind.showedAt === null) {
      wind.showedAt = s.time;
      // Mosi shows how: "Svona!", and at his "Fúúú!" a gust of his, from his mouth to her
      const line = c.lines.say('mosi', 'k4_mosi_blow');
      const at = 0.55 * s.lineDuration('k4_mosi_blow');
      s.after(at, () => {
        const head = c.mosi.raw.headPosition(new THREE.Vector3());
        const her = world.resolvePoint(FLUGEDLA_HEAD, new THREE.Vector3());
        gust('mosi', { points: [head.clone().lerp(her, 0.08), head.clone().lerp(her, 0.6)] });
        return null;
      });
      void line;
    }
    if (idle >= WIND.autoAfter) {
      nextAuto ??= since + WIND.autoAfter;
      if (s.time >= nextAuto - 1e-6) {
        gust('auto', null);
        nextAuto += WIND.autoEvery;
      }
    } else nextAuto = null;
  }

  // Mosi tells him how as the scene opens (the juice review: the hint's line, at once); the hint after 6 s says it the other way
  c.lines.say('mosi', 'k4_mosi_swipe');
  const off = s.onSwipe(event => {
    const width = event.width ?? 1280, height = event.height ?? 800;
    if (event.kind === 'up') gust('up', { ndc: [ndc(event.x0, event.y0, width, height), ndc(event.x, event.y, width, height)] });
    else gust('tap', { ndc: [ndc(event.x, event.y, width, height), ndc(event.x, event.y - 0.2 * height, width, height)] });
  });
  try {
    while (wind.fullAt === null) {
      windFrame();
      helpFrame();
      yield;
    }
  } finally {
    off();
    showHint(false);
  }

  // Full: a big gust, the clouds set off, "Nú!", and she lifts off the top on the wind
  yield s.wait(0.35);
  wind.bigAt = s.time;
  blowUp(WIND.big, { hold: WIND.bigHold, ease: 2 });
  c.perch.stir(2);
  if (!s.seeking) {
    c.sounds?.gust();
    s.after(0.3, () => { c.sounds?.gust(); return null; });
  }
  leavesAlong(null, 'big gust');
  leavesAlong({ ndc: [[0.3, -0.8], [0.55, 0.4]] }, 'big gust 2');
  wind.cloudSpeed = WIND.clouds;
  world.sky?.setCloudSpeed?.(WIND.clouds);
  const now = c.lines.say('flugedla', 'k4_flugedla_now');
  c.perch.lift(WIND.lift, 1.2);
  const end = s.time + Math.max(1.6, WIND.bigHold + WIND.rise);
  while (s.time < end || !now.task || !now.task.done) {
    windFrame();
    wind.lifted = c.perch.lifted;
    yield;
  }
  wind.lifted = c.perch.lifted;
  wind.endedAt = s.time;
}

const smooth = k => k * k * (3 - 2 * k);

/** `kind`'s leaves or seeds (LEAVES, SEEDS) flying from `from` toward `to`, born along the first half of the way over 0.35 s. */
function leavesFly(world, from, to, kind, seed, count = kind.count) {
  const way = to.clone().sub(from);
  const look = { ...FLYING, core: kind.heart, rise: Math.max(0.8, way.y * 0.6), drift: [way.x * 0.6, way.z * 0.6] };
  const life = 1.5;
  const set = glints(world, { count, life, spread: 1.1, fall: 0, size: kind.size, colour: kind.colour, seed, look });
  for (let i = 0; i < count; i++) {
    const k = i / count;
    set.position.set([from.x + way.x * k * 0.5, from.y + way.y * k * 0.5, from.z + way.z * k * 0.5], i * 3); // the first half of the stroke
    set.birth[i] = k * 0.35; // born as the finger goes by
  }
  return run(world, set, life + 0.4, 'wind leaves');
}

/**
 * A puff of the snag's dry leaves and seeds where her wings beat at `at` (a THREE.Vector3), blown along `way` ([x, y, z] m): as she
 * leaps off the snag into the flight, and where she lands (chapters/kafli4.js, kafli4-flight.js; the juice review of 2026-11-07).
 * Two sets of glints (two draw calls) for about 2 s; `share` of the gust's numbers of them.
 */
export function leafPuff(world, at, { way = [0, 2.5, 0], share = 1, seed = 'leaf puff' } = {}) {
  if (!world?.effects || !world?.scene) return;
  const to = at.clone().add(new THREE.Vector3(...way));
  for (const kind of [LEAVES, SEEDS]) leavesFly(world, at, to, kind, `${seed} ${kind.size}`, Math.max(4, Math.round(kind.count * share)));
}
