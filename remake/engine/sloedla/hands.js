// The crowd's hands in Slóeðla's song game: while the crowd claps along in Stjörnukraftur (game.js starTime, claps.js), black
// raised hands come up along the bottom of the picture, like a concert's front row in front of the stage, and clap on every beat.
// They stand behind everything the child must see: drawn after the ground and before the lanes, so the notes, the dinosaur buttons
// and the star meter all come on top, and a little fainter inside the lanes, where the notes come. A few people at first, at the
// edges, then more as more join in (claps.js peopleOf: 4, 12, 24, the whole hall), filling in towards the middle; each pair rises
// from below to land on a beat, and they all sink away when Stjörnukraftur ends.
//
// The hands are real pictures: "Raised Hand in Silhouette" by dripsandcastle on Openclipart, 21 hands, public domain
// (assets/sloedla/hendur/, KREDIT.md). Each is one SVG path, filled here in the night's near-black (the far row a little lighter).
//
// On the beat a person's palms meet: each hand narrows (the palms turn to face each other), the pair squashes a little and a small
// light flashes where they meet; between beats they spring apart, leaning out, and swing in faster and faster to the next clap.
// The beat comes from the song's time given to draw (the song's clock), never from frames, and each person is a hundredth or two of
// a second off the beat, as people are.

import { peopleOf } from './claps.js';

export const HAND_IDS = Object.freeze([167357, 167359, 167360, 167361, 167362, 167363, 167364, 167365, 167366, 167367, 167368, 167369, 167370, 167371, 167372, 167373, 167374, 167375, 167376, 167377, 167378]);
const FULL = peopleOf(1e6); // the whole hall
const RISE = 0.4; // s: a pair coming up from below, to land on its first clap
const SINK = 0.9; // s: all of them going down when the clapping stops
const OPEN = 0.42; // of a beat: the hands spring apart until here, then swing in to the next clap
const SPREAD = 0.012; // s: the bell curve of how far off the beat a person is (at most 0.03)
const INSIDE = 0.5; // how much of a hand shows inside a lane
const INK = ['#080614', '#1b1730']; // near, far
const ALPHA = [0.92, 0.78];
const SHADE = 'rgba(8, 6, 20, 0.78)'; // the front of the crowd in shadow, along the bottom

/**
 * How many people's pairs of hands show along the bottom when `people` clap, out of `slots` places: in twos (one at each edge
 * first), two at least, all of them when the whole hall claps.
 */
export function pairsOf(people, slots) {
  if (!(people > 0) || slots < 1) return 0;
  const share = Math.sqrt(Math.min(1, people / FULL));
  return Math.max(Math.min(2, slots), Math.min(slots, 2 * Math.round((slots * share) / 2)));
}

/**
 * A person's hands at `phase` of a beat (0 on the beat): `together` 1 = palms meeting, 0 = wide apart (they spring apart and
 * swing back in faster and faster); `hit` the clap's jolt, 1 on the beat and gone in a tenth of a beat.
 */
export function clapPose(phase) {
  const p = phase - Math.floor(phase);
  const together = p < OPEN ? 1 - easeOut(p / OPEN) : easeIn((p - OPEN) / (1 - OPEN));
  return { together, hit: Math.exp(-p * 16) };
}

const easeOut = t => 1 - (1 - t) ** 3;
const easeIn = t => t * t;
const clamp01 = t => Math.max(0, Math.min(1, t));

/** The SVG's path and its offset ({ d, dx, dy }), from the file's text (one path in a translated group, as these are). */
export function shapeOf(svg) {
  const d = /<path\b[^>]*?\sd="([^"]+)"/.exec(svg)?.[1];
  if (!d) return null;
  const move = /translate\(\s*([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/.exec(svg);
  const box = /viewBox="\s*([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)\s*"/.exec(svg);
  return { d, dx: move ? Number(move[1]) : 0, dy: move ? Number(move[2]) : 0, view: box ? { w: Number(box[3]), h: Number(box[4]) } : { w: 420, h: 480 } };
}

/**
 * The clapping hands. `src(id)` is where a hand's SVG is. load() fetches them; reset() for a new round; start(beat) when the crowd
 * will begin clapping (the index of the first clapped beat, song time beat · beatLength; again if it moves); stop(time) when it ends;
 * draw(g, view) each frame, after the ground and before the lanes, with view { time, beatLength, w, h, dpr, portrait, laneX,
 * laneW, top, bottom } (the lanes' middles and width, from the top of the lanes to the buttons' middle).
 */
export function createClapHands({ src, random = Math.random }) {
  const shapes = new Map(); // id -> { path, dx, dy, box: { x, y, w, h }, wrist } in the SVG's own units
  const bell = () => (random() + random() + random() - 1.5) / 0.5;
  // the people along the bottom, made once: how far off the middle of their place, how far off the beat, which two hands
  const people = Array.from({ length: 16 }, () => {
    const left = Math.floor(random() * HAND_IDS.length);
    const right = (left + 1 + Math.floor(random() * (HAND_IDS.length - 1))) % HAND_IDS.length;
    return { jitter: random() * 2 - 1, off: Math.max(-0.03, Math.min(0.03, bell() * SPREAD)), left: HAND_IDS[left], right: HAND_IDS[right], sway: random() * 6.28 };
  });
  let first = null; // the first clapped beat's index, or null while nobody claps
  let stopAt = Infinity; // song time the clapping stopped
  const joined = []; // song time each person (in the order they join) began to rise
  let size = null; // { key, slots, order, sprites, outside, inside, shade }

  async function load() {
    await Promise.all(HAND_IDS.map(async id => {
      try {
        const shape = shapeOf(await fetch(src(id)).then(r => r.text()));
        if (shape) shapes.set(id, measure(shape));
      } catch { /* that hand stays out */ }
    }));
    size = null;
  }

  // where the hand is in its picture, and the middle of its forearm at the bottom (the pivot it turns on)
  function measure(shape) {
    const path = new Path2D(shape.d);
    const k = 0.5;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(shape.view.w * k);
    canvas.height = Math.ceil(shape.view.h * k);
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.setTransform(k, 0, 0, k, shape.dx * k, shape.dy * k);
    c.fill(path);
    const { data, width, height } = c.getImageData(0, 0, canvas.width, canvas.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] < 128) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return { path, dx: shape.dx, dy: shape.dy, box: { x: 0, y: 0, w: shape.view.w, h: shape.view.h }, wrist: shape.view.w / 2 };
    let a = -1, b = -1;
    const row = Math.max(y0, y1 - 2);
    for (let x = x0; x <= x1; x++) {
      if (data[(row * width + x) * 4 + 3] < 128) continue;
      if (a < 0) a = x;
      b = x;
    }
    return { path, dx: shape.dx, dy: shape.dy, box: { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k }, wrist: a < 0 ? (x0 + x1) / 2 / k : (a + b) / 2 / k };
  }

  function reset() {
    first = null;
    stopAt = Infinity;
    joined.length = 0;
  }

  function start(beat) {
    if (first === null || stopAt !== Infinity) joined.length = 0;
    first = beat;
    stopAt = Infinity;
  }

  function stop(time) {
    if (first !== null && stopAt === Infinity) stopAt = time;
  }

  function layoutFor(v) {
    const key = `${v.w}x${v.h}x${v.dpr}x${v.laneX.join(',')}x${v.laneW}`;
    if (size?.key === key) return size;
    const n = v.portrait ? 7 : Math.max(8, Math.min(14, Math.round((12 * (v.w / v.h)) / 1.6)));
    const slots = Array.from({ length: n }, (_, i) => {
      const p = people[i % people.length];
      const far = i % 2;
      const length = v.h * ((v.portrait ? 0.3 : 0.31) - far * 0.04);
      return { x: ((i + 0.5) / n + p.jitter * 0.015) * v.w, base: v.h * (1.05 + far * 0.03), length, far, left: p.left, right: p.right, off: p.off, sway: p.sway };
    });
    // they join from the edges in towards the middle
    const order = slots.map((_, i) => i).sort((a, b) => Math.abs(slots[b].x / v.w - 0.5) - Math.abs(slots[a].x / v.w - 0.5));
    const lanes = new Path2D();
    for (const x of v.laneX) lanes.rect(x - v.laneW / 2, v.top, v.laneW, v.h - v.top);
    const outside = new Path2D();
    outside.rect(0, 0, v.w, v.h);
    outside.addPath(lanes);
    size = { key, slots, order, sprites: new Map(), outside, inside: lanes, shadeTop: v.h * (v.portrait ? 0.78 : 0.7), shade: null };
    return size;
  }

  // a hand drawn once at its size, in its colour (near or far)
  function spriteOf(id, slot, dpr) {
    const key = `${id}-${slot.far}`;
    let sprite = size.sprites.get(key);
    if (sprite) return sprite;
    const shape = shapes.get(id) ?? shapes.values().next().value;
    const k = slot.length / shape.box.h; // px a unit
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(shape.box.w * k * dpr) + 2;
    canvas.height = Math.ceil(slot.length * dpr) + 2;
    const c = canvas.getContext('2d');
    c.setTransform(k * dpr, 0, 0, k * dpr, (shape.dx - shape.box.x) * k * dpr + 1, (shape.dy - shape.box.y) * k * dpr + 1);
    c.fillStyle = INK[slot.far];
    c.fill(shape.path);
    sprite = { canvas, w: canvas.width / dpr, h: canvas.height / dpr, ax: (shape.wrist - shape.box.x) * k + 1 / dpr };
    size.sprites.set(key, sprite);
    return sprite;
  }

  function hand(g, sprite, mirror, x, y, lean, narrow, squash) {
    g.save();
    g.translate(x, y);
    g.rotate(lean);
    g.scale(mirror ? -narrow : narrow, squash);
    g.drawImage(sprite.canvas, -sprite.ax, -sprite.h, sprite.w, sprite.h);
    g.restore();
  }

  function draw(g, v) {
    if (first === null || !shapes.size) return;
    const t = v.time;
    const firstAt = first * v.beatLength;
    if (t < firstAt - RISE) return;
    const sunk = stopAt === Infinity ? 0 : clamp01((t - stopAt) / SINK);
    if (sunk >= 1) { reset(); return; }
    const { slots, order } = layoutFor(v);
    if (stopAt === Infinity) {
      // as claps.js counts the crowd: the beat each new pair will first clap on, RISE ahead
      const beats = Math.max(0, Math.floor((t + RISE) / v.beatLength) - first);
      const count = pairsOf(peopleOf(beats), slots.length);
      for (let j = joined.length; j < count; j++) joined.push((first + beats) * v.beatLength - RISE);
    }
    if (!joined.length) return;
    const shown = clamp01((t - joined[0]) / RISE) * (1 - sunk);
    // the front of the crowd in shadow
    if (!size.shade) {
      size.shade = g.createLinearGradient(0, size.shadeTop, 0, v.h);
      size.shade.addColorStop(0, 'rgba(8, 6, 20, 0)');
      size.shade.addColorStop(1, SHADE);
    }
    g.save();
    g.globalAlpha = shown;
    g.fillStyle = size.shade;
    g.fillRect(0, size.shadeTop, v.w, v.h - size.shadeTop);
    g.restore();
    // where each person is now
    const now = [];
    for (let j = 0; j < joined.length; j++) {
      const s = slots[order[j]];
      const up = easeOut(clamp01((t - joined[j]) / RISE));
      const { together, hit } = clapPose((t - s.off) / v.beatLength);
      now.push({ s, j, up, together, hit });
    }
    now.sort((a, b) => b.s.far - a.s.far);
    // outside the lanes in full, inside them fainter
    for (const [clip, alpha] of [[size.outside, 1], [size.inside, INSIDE]]) {
      g.save();
      if (clip === size.outside) g.clip(clip, 'evenodd');
      else g.clip(clip);
      for (const { s, j, up, together, hit } of now) {
        const down = (1 - up) * s.length * 0.95 + easeIn(sunk) * s.length;
        const narrow = 1 - 0.42 * together;
        const apart = s.length * (0.72 - 0.5 * together);
        const lean = ((-9 * (1 - together) + 4 * together) * Math.PI) / 180 + Math.sin(t * 0.9 + s.sway) * 0.012;
        const squash = 1 - 0.06 * hit;
        const y = s.base + down + s.length * 0.025 * hit;
        g.globalAlpha = ALPHA[s.far] * alpha;
        hand(g, spriteOf(s.left, s, v.dpr), true, s.x - apart / 2, y, lean, narrow, squash);
        hand(g, spriteOf(s.right, s, v.dpr), false, s.x + apart / 2, y, -lean, narrow, squash);
        // a small light where the palms meet, in the star's rainbow
        if (!s.far && hit > 0.05 && up > 0.6) {
          const gx = s.x, gy = y - s.length * 0.72 * squash;
          const r = s.length * 0.07 * (0.6 + hit * 0.6);
          const light = g.createRadialGradient(gx, gy, 0, gx, gy, r);
          light.addColorStop(0, `rgba(255, 255, 255, ${0.95 * hit})`);
          light.addColorStop(0.35, `hsla(${(t * 200 + j * 47) % 360}, 100%, 75%, ${0.6 * hit})`);
          light.addColorStop(1, 'hsla(0, 0%, 100%, 0)');
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = alpha * (1 - sunk);
          g.fillStyle = light;
          g.fillRect(gx - r, gy - r, r * 2, r * 2);
          g.globalCompositeOperation = 'source-over';
        }
      }
      g.restore();
    }
  }

  return { load, reset, start, stop, draw, get ready() { return shapes.size > 0; } };
}
