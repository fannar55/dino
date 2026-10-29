// Slóeðla's song game, the round itself, drawn on one canvas (cheap on a tablet, and recordable with its sound: lab.js ?upptaka=1):
// lanes down the screen, each ending in a big round button with its dinosaur; glowing notes fall in time with the song, and the
// child taps the lane when a note reaches the dinosaur. The song is played by the conductor (conductor.js), and the round tells it
// what the child does: a hit plays that dinosaur's note and keeps her part in the song, a miss lets it drop out (she falls asleep
// until she is hit again), a run of hits brings in more of the band. Nobody loses: a missed note sinks away grey, the song plays to
// its end, and the stars won rise one by one.
//
// Around the lanes the evening answers the music. Behind: a night sky over the game's own forest (a render of the 3D world, tinted
// to night, when the page gives one), northern lights with rays that sway on the beat and grow brighter the better it goes, falling
// stars on a good run, a constellation a section that draws itself star by star as its notes are played, mist and fireflies over
// the ground, and a pair of stage lights for each dinosaur that shine while she plays and go dark while she sleeps. On the lanes:
// beat lines falling with the notes, a ring closing on the button as a note comes (tap when it touches), the button squashing under
// the finger, a pillar of light up the lane and sparks on a hit, the run's count popping, stars flying up into the bar as they are
// won, and at the top of a run everything turns gold. Words come with juice (text.js): over the dinosaur she tapped, how close to
// the beat it was ("Fullkomið!" in a rainbow right on it, "Frábært!", "Fínt!", "OK!"); a run's milestones ("10 í röð!", "15 í
// röð!" ...) rise from low on the screen, letter by letter, in the rainbow from twenty. Now and then a crowd is heard (crowd.js): a "vá!", an "æææ" when a long run
// breaks, cheering for a section that comes in big, applause at the end.
//
// The song's time comes from `clock` (song-clock.js: the heard time of the audio context), so the notes keep to the music even when
// frames come late; tap(lane, time) is judged at the song time given (the page passes its event's time).

import { danceGrid, beatAt } from '../beat.js';
import { LEVELS, RECENTRE, STAR_SHARES, createJudge, createScore, count, laneOf, shareOf, starsFor, tierOf } from './chart.js';
import { BROKE_AT, cueOf } from './crowd.js';
import { GRADES, drawWord, gradeOf, milestoneOf } from './text.js';
import { seededRandom } from '../random.js';

const WORDS = ['', 'Flott!', 'Vá!', 'Stjörnukraftur!']; // a run reaching tier 1, 2, 3 (a six-year-old is starting to read)
const WORD_STYLES = ['cream', 'gold', 'sky', 'rainbow']; // and their colours (text.js)
const GRADE_LIFE = 0.9; // s a grade word stays over the dinosaur (it comes often, and its colour says it too)
const SAY_LIFE = 1.8; // s a word in the middle stays (an early reader needs one or two seconds for a new word)
const SAY_TURN = 1.1; // s a word in the middle has to itself before the next may come
const RISE_LIFE = 2.2; // s a milestone takes to rise and fade
const END_WORDS = ['Spilum aftur saman!', 'Vel gert!', 'Flott!', 'Frábært!'];
const END_AFTER = 0.6; // s after the song's last bar before the stars
const STAR_GAP = 0.75; // s between the stars rising at the end
const GOLD = '#f2b630';
const FLY = 0.7; // s a won star takes to fly from the button up into the bar
const APPROACH = 0.9; // s before a note arrives that its ring starts closing on the button

/**
 * A round. `canvas` to draw on; `cast` one entry a lane, left to right ({ role, name, hue, light, dark, image }); `conductor` the
 * song (conductor.js, started by the page); `fall` how long a note takes to fall; `clock` the song's clock; `chimes` the end's bells
 * ({ star(n), sparkle() }); `crowd` the festival's voice (crowd.js createCrowd, or null for none); `backdrop` the forest behind
 * ({ image, upright, fade, fadeUpright }: renders of the 3D world, wide and upright, and where in shares of the picture's height its
 * own sky gives way to the night's) or null.
 * Returns { tap(lane, time), frame(), resize(), laneAt(x), state(), result() }; `onEnd(result)` when the stars rose.
 */
export function createSongGame({ canvas, cast, conductor, fall, clock, windows = LEVELS.barn, chimes = null, crowd = null, backdrop = null, random = Math.random, onEnd = () => {}, debug = false }) {
  const ctx = canvas.getContext('2d');
  const lanes = cast.length;
  const notes = conductor.chart; // grows a section at a time
  const judge = createJudge(notes, { early: windows.early, late: windows.late, great: windows.great });
  // the window follows the child: the median of her last hits' errors (late children tap late), at most RECENTRE.most either way
  const errors = [];
  let centre = 0;
  const score = createScore(conductor.expected);
  const dance = danceGrid({ bpm: conductor.bpm, beatOffset: 0, danceBeats: 2 });
  const beatLength = 60 / conductor.bpm;

  let w = 0, h = 0, dpr = 1, portrait = false;
  let laneW = 0, laneX = [], dinoR = 0, hitY = 0, topY = 0, bar = null, sky = null, counterY = 0;
  let background = null, vignetteGold = null, horizonGlow = null, mist = null, firefly = null;
  let glows = [], goldGlow = null, buttons = [], spark = null, beams = [];
  const raySprites = new Map(); // a soft-edged ray of the northern lights, one a colour
  let laned = 0; // notes given their lane so far

  const twinkles = Array.from({ length: 110 }, () => ({ x: random(), y: random() * 0.62, r: 0.4 + random() * 1.6, phase: random() * 6.28, speed: 1.2 + random() * 2.4 }));
  const fireflies = Array.from({ length: 30 }, () => ({ x: random(), y: random(), phase: random() * 6.28, speed: 0.4 + random() * 0.8 }));
  const sparks = []; // short-lived glitter: { x, y, vx, vy, life, max, size, gravity, hue }
  const rings = [];
  const waves = []; // Slóeðla's sound waves, Þórseðla's ground wave
  const pillars = []; // light going up a lane on a hit
  const puffs = []; // a grey puff where a note was missed
  const flyers = []; // stars won, on their way up into the bar
  const meteors = []; // falling stars
  const hops = new Array(lanes).fill(-Infinity);
  const flashes = new Array(lanes).fill(-Infinity); // any tap (the button squashes)
  const hitAt = new Array(lanes).fill(-Infinity);
  const missAt = new Array(lanes).fill(-Infinity);
  const lights = cast.map(() => 0); // each dinosaur's stage lights, 0 dark to 1 (follows whether she plays)
  const floaters = [];
  const words = []; // the middle's words: { text, x, y, size, style, at }
  const grades = new Array(lanes).fill(null); // the word over each dinosaur for her last tapped note: { grade, at }
  const rises = []; // a run's milestones rising: { count, style, at }
  const rockets = []; // fireworks on their way up: { x, y, vy, target, hue }
  const constellations = []; // one a section: { section, stars: [{ x, y, lit }], lit, flashAt, good }
  const crowdMemory = {};
  const heard = []; // [song time, sound] each time the crowd made a sound (state() and the debug corner show them)
  let shakeAt = -Infinity;
  let punchAt = -Infinity, punchAmp = 0; // the whole picture leans in a little on a great moment
  let comboAt = -Infinity, comboBigAt = -Infinity, broken = null; // the run's count: last pop, last round number, the one that broke
  let barPop = { at: -Infinity, index: -1 };
  let nextMeteor = 6;
  let embers = 0;
  let moodBig = 0, moodCalm = 0; // the sky's colour follows the section, smoothly
  let starsLit = 0;
  let phase = 'play';
  let endAt = null, endStars = 0, starsShown = 0;
  let lastTime = 0;
  let lastSection = -1;
  let tierNow = 0;
  let beatNow = { index: 0, phase: 0 }; // the song's own beat (not the slower dance grid), which the dinosaurs dance to
  const fps = { frames: 0, since: 0, value: 0 };

  // -------------------------------------------------------------------------------------------------------------------------
  // Size

  function resize() {
    dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || 1280;
    h = canvas.clientHeight || 800;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    portrait = h > w * 1.05;
    laneW = portrait ? Math.min((w * 0.86) / lanes, 230) : Math.min(w * 0.17, 220, h * 0.3);
    if (lanes === 2) laneW *= portrait ? 0.85 : 1.1;
    const gap = laneW * 0.16;
    const span = lanes * laneW + (lanes - 1) * gap;
    const x0 = (w - span) / 2;
    laneX = Array.from({ length: lanes }, (_, i) => x0 + laneW / 2 + i * (laneW + gap));
    dinoR = Math.min(laneW * 0.5, h * 0.13);
    hitY = h - dinoR - Math.max(14, h * 0.035);
    const barW = Math.min(w * (portrait ? 0.7 : 0.42), 520);
    bar = { x: (w - barW) / 2, y: Math.max(22, h * 0.045), w: barW, h: Math.max(18, Math.min(26, h * 0.03)) };
    topY = bar.y + bar.h + h * 0.06;
    counterY = bar.y + bar.h + (portrait ? 30 : 34);
    // where the constellations may go: the sky beside the lanes (or above them, upright)
    const left = x0 - gap, right = w - (x0 + span + gap);
    sky = portrait || left < 120
      ? [{ x: w * 0.08, y: topY, w: w * 0.84, h: h * 0.22 }]
      : [{ x: w * 0.03, y: h * 0.14, w: left - w * 0.03, h: h * 0.42 }, { x: x0 + span + gap, y: h * 0.14, w: right - w * 0.03, h: h * 0.42 }];
    paintBackground();
    paintSprites();
    for (const c of constellations) place(c);
  }

  function offscreen(width, height) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(width * dpr));
    c.height = Math.max(1, Math.round(height * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    return [c, g];
  }

  /** A canvas for something soft (a glow, mist, a light's cone) at a fraction of the screen's resolution: drawn larger, it looks
   * the same, and a tablet keeps its memory. Drawn in the same units as offscreen()'s. */
  function softscreen(width, height, share = 0.25) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(width * share));
    c.height = Math.max(1, Math.round(height * share));
    const g = c.getContext('2d');
    g.scale(share, share);
    return [c, g];
  }

  /** The still part of the picture, painted once a size: the sky, the forest at night (or a hill), the lanes' glass, a vignette. */
  function paintBackground() {
    const [c, g] = offscreen(w, h);
    const night = g.createLinearGradient(0, 0, 0, h);
    night.addColorStop(0, '#0a1036');
    night.addColorStop(0.45, '#22245e');
    night.addColorStop(0.75, '#4a3d7c');
    night.addColorStop(1, '#6b4f86');
    g.fillStyle = night;
    g.fillRect(0, 0, w, h);
    const image = portrait && backdrop?.upright?.naturalWidth ? backdrop.upright : backdrop?.image;
    if (image?.naturalWidth) {
      // the game's own forest, rendered in the evening, turned to night: covering the picture's width, standing on its bottom edge
      const scale = Math.max(w / image.naturalWidth, (h * 0.75) / image.naturalHeight);
      const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
      const iy = h - ih;
      const [from, to] = (image === backdrop.upright ? backdrop.fadeUpright : backdrop.fade) ?? [0.2, 0.5];
      const [f, fg] = offscreen(w, h);
      fg.drawImage(image, (w - iw) / 2, iy, iw, ih);
      fg.globalCompositeOperation = 'multiply';
      fg.fillStyle = '#6170c4';
      fg.fillRect(0, 0, w, h);
      fg.globalCompositeOperation = 'source-over';
      fg.fillStyle = 'rgba(8, 10, 38, 0.3)';
      fg.fillRect(0, 0, w, h);
      // the render's own sky fades out into the night above it
      fg.globalCompositeOperation = 'destination-in';
      const fade = fg.createLinearGradient(0, iy + ih * from, 0, iy + ih * to);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,1)');
      fg.fillStyle = fade;
      fg.fillRect(0, 0, w, h);
      g.drawImage(f, 0, 0, w, h);
    } else {
      g.fillStyle = 'rgba(24, 40, 70, 0.92)';
      g.beginPath();
      g.moveTo(0, h);
      g.lineTo(0, h * 0.87);
      g.quadraticCurveTo(w * 0.5, h * 0.75, w, h * 0.87);
      g.lineTo(w, h);
      g.fill();
    }
    // the lanes: dark glass the notes read well on, warming to each dinosaur's colour near her
    for (let i = 0; i < lanes; i++) {
      const x = laneX[i] - laneW / 2;
      const column = g.createLinearGradient(0, topY, 0, hitY);
      column.addColorStop(0, 'rgba(10, 8, 34, 0)');
      column.addColorStop(0.18, 'rgba(10, 8, 34, 0.42)');
      column.addColorStop(0.8, 'rgba(10, 8, 34, 0.5)');
      column.addColorStop(1, 'rgba(10, 8, 34, 0.35)');
      g.fillStyle = column;
      roundRect(g, x, topY - 30, laneW, hitY - topY + 30, laneW * 0.3);
      g.fill();
      const warm = g.createLinearGradient(0, topY, 0, hitY);
      warm.addColorStop(0, 'rgba(255,255,255,0)');
      warm.addColorStop(0.55, 'rgba(255,255,255,0.03)');
      warm.addColorStop(1, hexAlpha(cast[i].hue, 0.34));
      g.fillStyle = warm;
      roundRect(g, x, topY - 30, laneW, hitY - topY + 30, laneW * 0.3);
      g.fill();
    }
    const edge = g.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.max(w, h) * 0.75);
    edge.addColorStop(0, 'rgba(4, 3, 20, 0)');
    edge.addColorStop(1, 'rgba(4, 3, 20, 0.55)');
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
    background = c;

    // gold at the screen's edges at the top of a run, and the warm glow over the horizon when a section comes in big
    const [v, vg] = softscreen(w, h);
    const gold = vg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
    gold.addColorStop(0, 'rgba(242, 182, 48, 0)');
    gold.addColorStop(1, 'rgba(242, 182, 48, 0.5)');
    vg.fillStyle = gold;
    vg.fillRect(0, 0, w, h);
    vignetteGold = v;
    const [z, zg] = softscreen(w, h * 0.6);
    zg.scale(1, 0.45);
    const warmth = zg.createRadialGradient(w / 2, h * 1.2, 0, w / 2, h * 1.2, w * 0.7);
    warmth.addColorStop(0, 'rgba(255, 140, 200, 0.55)');
    warmth.addColorStop(0.5, 'rgba(255, 120, 160, 0.18)');
    warmth.addColorStop(1, 'rgba(255, 120, 160, 0)');
    zg.fillStyle = warmth;
    zg.fillRect(0, 0, w, h * 1.4);
    horizonGlow = z;
    // mist: soft banks of light, drawn twice side by side and drifting
    const [m, mg] = softscreen(w, h * 0.3, 0.35);
    const mistRandom = seededRandom('sloedla-mist');
    for (let i = 0; i < 14; i++) {
      const mx = mistRandom() * w, my = h * 0.15 + (mistRandom() - 0.5) * h * 0.12, mr = h * (0.08 + mistRandom() * 0.1);
      mg.save();
      mg.translate(mx, my);
      mg.scale(2.6, 1);
      const blob = mg.createRadialGradient(0, 0, 0, 0, 0, mr);
      blob.addColorStop(0, 'rgba(200, 210, 255, 0.10)');
      blob.addColorStop(1, 'rgba(200, 210, 255, 0)');
      mg.fillStyle = blob;
      mg.fillRect(-mr, -mr, mr * 2, mr * 2);
      mg.restore();
    }
    mist = m;
  }

  function glowSprite(hue, size) {
    const [c, g] = offscreen(size, size);
    const r = size / 2;
    const glow = g.createRadialGradient(r, r, 0, r, r, r);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.2, 'rgba(255,255,255,0.95)');
    glow.addColorStop(0.32, hexAlpha(hue, 0.95));
    glow.addColorStop(0.55, hexAlpha(hue, 0.35));
    glow.addColorStop(1, hexAlpha(hue, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);
    return c;
  }

  /** One ray of the northern lights: a soft strand, brightest a little below its top, fading down and at its sides. */
  function raySprite(hue) {
    if (raySprites.has(hue)) return raySprites.get(hue);
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 128;
    const g = c.getContext('2d');
    const down = g.createLinearGradient(0, 0, 0, 128);
    down.addColorStop(0, hexAlpha(hue, 0));
    down.addColorStop(0.18, hexAlpha(hue, 1));
    down.addColorStop(1, hexAlpha(hue, 0));
    g.fillStyle = down;
    g.fillRect(0, 0, 16, 128);
    g.globalCompositeOperation = 'destination-in';
    const across = g.createLinearGradient(0, 0, 16, 0);
    across.addColorStop(0, 'rgba(0,0,0,0)');
    across.addColorStop(0.5, 'rgba(0,0,0,1)');
    across.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = across;
    g.fillRect(0, 0, 16, 128);
    raySprites.set(hue, c);
    return c;
  }

  /** A stage light's cone, pointing up from its foot at the bottom middle, in a dinosaur's colour. */
  function beamSprite(hue, width, length) {
    const [c, g] = softscreen(width, length, 160 / width);
    const fade = g.createLinearGradient(0, length, 0, 0);
    fade.addColorStop(0, hexAlpha(hue, 0.9));
    fade.addColorStop(0.25, hexAlpha(hue, 0.4));
    fade.addColorStop(1, hexAlpha(hue, 0));
    g.fillStyle = fade;
    g.beginPath();
    g.moveTo(width / 2 - width * 0.03, length);
    g.lineTo(0, 0);
    g.lineTo(width, 0);
    g.lineTo(width / 2 + width * 0.03, length);
    g.closePath();
    g.fill();
    return c;
  }

  function paintSprites() {
    const size = laneW * 0.95;
    glows = cast.map(({ hue }) => glowSprite(hue, size));
    goldGlow = glowSprite(GOLD, size);
    firefly = glowSprite('#fff1a8', 28);
    beams = cast.map(({ hue }) => beamSprite(hue, Math.max(w, h) * 0.32, Math.max(w, h) * 1.05));
    buttons = cast.map(({ hue, light, image }) => {
      const pad = 12;
      const d = dinoR * 2 + pad * 2;
      const [c, g] = offscreen(d, d);
      const r = dinoR;
      g.translate(d / 2, d / 2);
      g.shadowColor = 'rgba(0,0,0,0.35)';
      g.shadowBlur = 14;
      g.shadowOffsetY = 5;
      g.fillStyle = light;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.shadowColor = 'transparent';
      g.save();
      g.beginPath();
      g.arc(0, 0, r - 5, 0, Math.PI * 2);
      g.clip();
      const inner = g.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
      inner.addColorStop(0, '#fffaf0');
      inner.addColorStop(1, light);
      g.fillStyle = inner;
      g.fillRect(-r, -r, r * 2, r * 2);
      if (image?.naturalWidth) {
        const scale = (r * 2.25) / Math.max(image.naturalWidth, image.naturalHeight * 1.25);
        const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
        g.drawImage(image, -iw / 2, -ih / 2 + r * 0.06, iw, ih);
      }
      g.restore();
      g.lineWidth = 6;
      g.strokeStyle = hue;
      g.beginPath();
      g.arc(0, 0, r - 3, 0, Math.PI * 2);
      g.stroke();
      return { canvas: c, size: d };
    });
    const s = 32;
    const [c, g] = offscreen(s, s);
    g.translate(s / 2, s / 2);
    g.fillStyle = '#fff6c8';
    g.shadowColor = '#ffe27a';
    g.shadowBlur = 8;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 ? s * 0.12 : s * 0.42;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    spark = c;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Constellations: one a section, a little walk of stars in the sky beside the lanes, lit one by one as its notes are played

  function constellationFor(section) {
    let c = constellations.find(x => x.section === section);
    if (!c) {
      const count = Math.max(4, Math.min(12, notes.filter(n => n.section === section).length));
      c = { section, stars: Array.from({ length: count }, () => ({ lit: -Infinity })), lit: 0, flashAt: -Infinity, good: false };
      place(c);
      constellations.push(c);
    }
    return c;
  }

  /** Lays a constellation's stars out in its part of the sky (again after a resize: the same walk, scaled). */
  function place(c) {
    const random = seededRandom(`stjornumerki-${c.section}`);
    const zone = sky[c.section % sky.length];
    const step = Math.min(zone.w, zone.h) * 0.2;
    let x = zone.x + zone.w * (0.25 + random() * 0.5), y = zone.y + zone.h * (0.2 + random() * 0.6);
    let angle = random() * Math.PI * 2;
    for (const star of c.stars) {
      star.x = x;
      star.y = y;
      angle += (random() - 0.5) * 1.8;
      x = Math.max(zone.x, Math.min(zone.x + zone.w, x + Math.cos(angle) * step * (0.7 + random() * 0.6)));
      y = Math.max(zone.y, Math.min(zone.y + zone.h, y + Math.sin(angle) * step * (0.7 + random() * 0.6)));
      star.r = 2.2 + random() * 1.6;
    }
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Play

  function burst(lane, great, gold) {
    const x = laneX[lane], y = hitY;
    const many = great ? 22 : 13;
    for (let i = 0; i < many; i++) {
      const a = (i / many) * Math.PI * 2 + random() * 0.4;
      const speed = (great ? 300 : 210) * (0.6 + random() * 0.6);
      sparks.push({ x, y: y - dinoR * 0.2, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 140, life: 0, max: 0.55 + random() * 0.35, size: (great ? 22 : 16) * (0.7 + random() * 0.6), gravity: 420 });
    }
    rings.push({ lane, at: lastTime, hue: gold ? GOLD : cast[lane].hue, great });
    pillars.push({ lane, at: lastTime, hue: gold ? GOLD : cast[lane].hue, great });
  }

  function firework(x, y, hue) {
    rockets.push({ x, y: h * 0.85, vy: -(h * 0.9), target: y, hue });
  }

  function meteor() {
    const fromLeft = random() < 0.5;
    const speed = Math.max(w, h) * (0.9 + random() * 0.5);
    const angle = (fromLeft ? 0.35 : Math.PI - 0.35) + (random() - 0.5) * 0.3;
    meteors.push({ x: fromLeft ? w * (0.05 + random() * 0.35) : w * (0.6 + random() * 0.35), y: h * (0.03 + random() * 0.18), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, at: lastTime, life: 0.7 + random() * 0.3 });
  }

  /** The picture leans in a little (a great hit on a run, a new tier, a big section); a bigger lean wins over a smaller one. */
  function punch(amp) {
    const now = punchAmp * Math.exp(-(lastTime - punchAt) * 9);
    if (amp >= now) { punchAt = lastTime; punchAmp = amp; }
  }

  /**
   * A word in the middle of the screen, popping in letter by letter in `style` (text.js). One big word at a time: while a run's
   * milestone is rising, the word waits until it has gone, and a word waits SAY_TURN s after the one before (which then goes).
   */
  function say(text, { y = h * 0.37, size = 54, style = 'cream' } = {}) {
    const busy = rises.length ? rises[rises.length - 1].at + RISE_LIFE - 0.4 : -Infinity;
    const turn = words.length ? words[words.length - 1].at + SAY_TURN : -Infinity;
    words.push({ text, x: w / 2, y, size, style, at: Math.max(lastTime, busy, turn) });
    if (words.length > 3) words.shift();
  }

  /** A run's milestone, rising from low on the screen, with a puff of glitter where it starts. */
  function rise(count, style) {
    rises.push({ count, style, at: lastTime });
    if (rises.length > 2) rises.shift();
    const y = hitY - dinoR * 0.3;
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (random() - 0.5) * 2.4;
      const speed = 160 + random() * 200;
      sparks.push({ x: w / 2 + (random() - 0.5) * w * 0.25, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0, max: 0.7 + random() * 0.4, size: 14 + random() * 10, gravity: 180, hue: style === 'rainbow' ? `hsl(${Math.floor(random() * 360)}, 100%, 70%)` : GOLD });
    }
  }

  /** The crowd answers now and then (crowd.js cueOf decides when). */
  function cheer(event, gain = 1) {
    if (!crowd) return;
    const sound = cueOf(event, lastTime, crowdMemory, random);
    if (sound && crowd.play(sound, { gain })) heard.push([Number(lastTime.toFixed(2)), sound]);
  }

  function giveLanes() {
    for (; laned < notes.length; laned++) notes[laned].lane = laneOf(notes[laned].role, lanes);
  }

  function setTier() {
    const next = tierOf(score.streak);
    if (next === tierNow) return 0;
    const up = next > tierNow;
    tierNow = next;
    conductor.setTier(next);
    return up ? next : 0;
  }

  /** The run is broken (a miss, or a tap at nothing): its count tumbles away, and the crowd may sigh. */
  function breakRun(time, byMiss) {
    if (score.streak >= 3) broken = { value: score.streak, at: time };
    if (byMiss && score.streak >= BROKE_AT) cheer('broke', 0.9);
  }

  /** A tap on `lane` at song time `time`. */
  function tap(lane, time = clock.time()) {
    if (phase !== 'play' || !(lane >= 0 && lane < lanes)) return null;
    giveLanes();
    const role = cast[lane].role;
    flashes[lane] = time;
    const result = judge.tap(lane, time - centre);
    if (result.kind === 'hit') {
      errors.push(result.offset + centre);
      if (errors.length > RECENTRE.taps) errors.shift();
      if (errors.length >= 4) {
        const sorted = [...errors].sort((x, y) => x - y);
        centre = Math.max(-RECENTRE.most, Math.min(RECENTRE.most, sorted[Math.floor(sorted.length / 2)]));
      }
      const joined = conductor.hit(result.note, result.offset);
      if (joined) {
        // she comes back into the song: her name over her lane
        const friend = cast.find(c => c.role === result.note.role) ?? cast[lane];
        say(`${friend.name} er með!`, { y: h * 0.5, size: 40, style: ['#ffffff', friend.light, friend.hue] });
        cheer('rejoin', 0.8);
      }
      hops[lane] = time;
      hitAt[lane] = time;
      const gold = tierNow >= 3;
      burst(lane, result.great, gold);
      floaters.push({ lane, at: time, wobble: random() * 2 - 1 });
      grades[lane] = { grade: gradeOf(result.offset, windows), at: time };
      if (grades[lane].grade === 'perfect') {
        // right on the beat: a few twinkles round the word
        for (let i = 0; i < 7; i++) sparks.push({ x: laneX[lane] + (random() - 0.5) * laneW * 0.8, y: hitY - dinoR * (1.25 + random() * 0.5), vx: (random() - 0.5) * 50, vy: -40 - random() * 60, life: 0, max: 0.5 + random() * 0.3, size: 9 + random() * 7, gravity: -10, hue: `hsl(${Math.floor(random() * 360)}, 100%, 78%)` });
      }
      // what the instrument looks like when it plays: her horn's waves, the drum's thump, the plates' glitter
      const noteRole = result.note.role;
      if (noteRole === 'a') waves.push({ lane, at: time, kind: 'horn' });
      else if (noteRole === 'c') { waves.push({ lane, at: time, kind: 'ground' }); shakeAt = time; }
      else for (let i = 0; i < 8; i++) sparks.push({ x: laneX[lane] + (random() - 0.5) * dinoR, y: hitY - dinoR * 0.5, vx: (random() - 0.5) * 60, vy: -120 - random() * 120, life: 0, max: 0.9, size: 12, gravity: -20 });
      const c = constellationFor(result.note.section);
      if (c.lit < c.stars.length) c.stars[c.lit++].lit = time;
      count(score, result);
      comboAt = time;
      if (score.streak % 10 === 0) comboBigAt = time;
      if (result.great && tierNow >= 2) punch(0.012);
      const crossed = setTier();
      if (crossed) {
        say(WORDS[crossed], { style: WORD_STYLES[crossed] });
        punch(0.02 + crossed * 0.006);
        meteor();
        if (crossed === 2) cheer('tier2');
        if (crossed === 3) cheer('tier3');
      } else if (score.streak >= 24 && score.streak % 8 === 0) cheer('more', 0.85);
      if (milestoneOf(score.streak)) rise(score.streak, score.streak >= 20 ? 'rainbow' : 'gold');
      const lit = STAR_SHARES.filter(least => shareNow() >= least).length;
      if (lit > starsLit) {
        for (let k = starsLit; k < lit; k++) flyers.push({ x: laneX[lane], y: hitY - dinoR, index: k, at: time });
        starsLit = lit;
        chimes?.sparkle?.();
      }
    } else {
      conductor.stray(role);
      if (result.kind === 'stray' && notes.length && time > notes[0].t - 1 && time < conductor.length) {
        breakRun(time, false);
        count(score, result);
        setTier();
      }
    }
    return result;
  }

  /** The share played so far, against the song as written until the end (when the notes that fell are all that count). */
  function shareNow() {
    return shareOf({ ...score, total: Math.max(score.total, notes.length) });
  }

  function update(time, dt) {
    giveLanes();
    if (phase === 'play') {
      for (const index of judge.sweep(time)) {
        const note = notes[index];
        conductor.miss(note);
        missAt[note.lane] = time;
        for (let i = 0; i < 5; i++) puffs.push({ x: laneX[note.lane] + (random() - 0.5) * laneW * 0.3, y: hitY - dinoR * 1.1, vx: (random() - 0.5) * 40, vy: -20 - random() * 30, at: time, r: laneW * (0.06 + random() * 0.05) });
        breakRun(time, true);
        count(score, { kind: 'miss' });
        setTier();
      }
      // a new section: a section that comes in big brings fireworks; the constellation of the one before flashes if it went well
      const section = conductor.sectionAt(time);
      if (section && section.index !== lastSection) {
        const before = constellations.find(c => c.section === lastSection);
        if (before && before.lit >= before.stars.length * 0.75) { before.good = true; before.flashAt = time; }
        lastSection = section.index;
        if (section.variant === 'big') {
          for (let i = 0; i < 4; i++) firework(w * (0.15 + 0.7 * random()), h * (0.12 + random() * 0.25), [GOLD, '#ff7eb6', '#7fe3ff', '#b8ff8a'][i]);
          for (let i = 0; i < 3; i++) meteor();
          say('Allir með!', { y: h * 0.32, style: 'lilac' });
          punch(0.035);
          cheer('big');
        }
      }
      if (time > conductor.length + END_AFTER) {
        phase = 'end';
        endAt = time;
        score.total = notes.length;
        endStars = starsFor(score);
        if (endStars === 3) for (let i = 0; i < 6; i++) firework(w * (0.1 + 0.8 * random()), h * (0.1 + random() * 0.3), [GOLD, '#ff7eb6', '#7fe3ff'][i % 3]);
        cheer('end', 0.55 + endStars * 0.15);
      }
      // falling stars now and then while a run is going
      if (tierNow >= 1 && time > nextMeteor) {
        meteor();
        nextMeteor = time + 7 - tierNow * 1.5 + random() * 4;
      }
    } else if (phase === 'end') {
      const due = Math.min(endStars, Math.floor((time - endAt - 0.6) / STAR_GAP) + 1);
      while (starsShown < due) chimes?.star?.(++starsShown);
      if (time - endAt > 0.6 + STAR_GAP * Math.max(1, endStars) + 0.4) {
        phase = 'done';
        onEnd(result());
      }
    }
    // the stage lights follow whether each dinosaur plays; the sky's colour follows the section
    const ease = Math.min(1, dt * 3);
    cast.forEach((c, i) => { lights[i] += ((conductor.isOpen(c.role) ? 1 : 0) - lights[i]) * ease; });
    const variant = conductor.sectionAt(time)?.variant;
    moodBig += ((variant === 'big' ? 1 : 0) - moodBig) * Math.min(1, dt * 1.5);
    moodCalm += ((variant === 'calm' ? 1 : 0) - moodCalm) * Math.min(1, dt * 1.5);
    // gold: embers rise from the ground the whole time
    if (tierNow >= 3 && phase === 'play') {
      embers += dt * 26;
      for (; embers >= 1; embers--) sparks.push({ x: random() * w, y: h + 10, vx: (random() - 0.5) * 30, vy: -(60 + random() * 120), life: 0, max: 2 + random() * 1.5, size: 6 + random() * 8, gravity: -12 });
    }
    for (const s of sparks) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += (s.gravity ?? 380) * dt;
      s.vx *= 1 - 1.5 * dt;
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life > sparks[i].max) sparks.splice(i, 1);
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y += r.vy * dt;
      if (r.y <= r.target) {
        rockets.splice(i, 1);
        for (let k = 0; k < 36; k++) {
          const a = (k / 36) * Math.PI * 2;
          const v = 120 + random() * 110;
          sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1.1 + random() * 0.5, size: 10, gravity: 90, hue: r.hue });
        }
      }
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      if (time - f.at < FLY) continue;
      flyers.splice(i, 1);
      const to = barStar(f.index);
      barPop = { at: time, index: f.index };
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        sparks.push({ x: to.x, y: to.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 0, max: 0.6, size: 14, gravity: 120 });
      }
    }
    if (sparks.length > 450) sparks.splice(0, sparks.length - 450);
  }

  const barStar = index => ({ x: bar.x + bar.w * STAR_SHARES[index], y: bar.y + bar.h / 2 });

  // -------------------------------------------------------------------------------------------------------------------------
  // Draw

  function draw(time) {
    const g = ctx;
    const since = time - shakeAt;
    const shake = since >= 0 && since < 0.18 ? (1 - since / 0.18) * 5 : 0;
    const leaned = time >= punchAt ? punchAmp * Math.exp(-(time - punchAt) * 9) : 0;
    const zoom = 1 + leaned;
    const sx = shake ? (random() - 0.5) * shake : 0, sy = shake ? (random() - 0.5) * shake : 0;
    g.setTransform(dpr * zoom, 0, 0, dpr * zoom, (sx + (w / 2) * (1 - zoom)) * dpr, (sy + (h / 2) * (1 - zoom)) * dpr);
    g.drawImage(background, 0, 0, w, h);
    const beat = beatAt(Math.max(0, time), dance);
    beatNow = beatAt(Math.max(0, time), { bpm: conductor.bpm, beatOffset: 0 });
    const pulse = Math.max(0, 1 - beat.phase * 3);
    const kick = Math.max(0, 1 - beatNow.phase * 4);
    const section = conductor.sectionAt(time);
    const big = section?.variant === 'big';
    const calm = section?.variant === 'calm';

    drawSky(g, time, pulse);
    drawAurora(g, time, pulse, big, calm);
    drawConstellations(g, time);
    drawBeams(g, time, kick);
    drawGround(g, time);
    drawLanes(g, time, pulse);
    drawDinosaurs(g, time);
    drawNotes(g, time, kick);
    drawEffects(g, time);
    drawBar(g, time);
    if (tierNow >= 3) {
      g.globalAlpha = 0.22 + pulse * 0.12;
      g.drawImage(vignetteGold, 0, 0, w, h);
      g.globalAlpha = 1;
    }
    if (phase !== 'play') drawEnd(g, time);
    if (debug) drawDebug(g, time, section);
  }

  // The sky: its colour with the section (deeper when calm, warm over the horizon when big), the twinkling stars, falling stars
  function drawSky(g, time, pulse) {
    if (moodCalm > 0.01) {
      g.globalAlpha = moodCalm * 0.35;
      g.fillStyle = '#060a2a';
      g.fillRect(0, 0, w, h);
    }
    if (moodBig > 0.01) {
      g.globalAlpha = moodBig * (0.55 + pulse * 0.25);
      g.drawImage(horizonGlow, 0, h * 0.42, w, h * 0.6);
    }
    g.fillStyle = '#fff8dc';
    for (const star of twinkles) {
      g.globalAlpha = Math.max(0, Math.min(1, 0.28 + 0.32 * Math.sin(time * star.speed + star.phase) + pulse * 0.08 * (tierNow + 1)));
      g.beginPath();
      g.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      const k = (time - m.at) / m.life;
      if (k > 1 || k < 0) { if (k > 1) meteors.splice(i, 1); continue; }
      const x = m.x + m.vx * (time - m.at), y = m.y + m.vy * (time - m.at);
      const tail = g.createLinearGradient(x - m.vx * 0.16, y - m.vy * 0.16, x, y);
      tail.addColorStop(0, 'rgba(255, 246, 200, 0)');
      tail.addColorStop(1, `rgba(255, 246, 220, ${0.9 * Math.sin(k * Math.PI)})`);
      g.strokeStyle = tail;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(x - m.vx * 0.16, y - m.vy * 0.16);
      g.lineTo(x, y);
      g.stroke();
    }
    g.restore();
  }

  // Northern lights: three curtains over the sky with rays hanging from them, swaying slowly, brightening on the beat and with the
  // run, quieter when calm
  function drawAurora(g, time, pulse, big, calm) {
    const strength = (calm ? 0.06 : 0.11) + tierNow * 0.05 + (big ? 0.08 : 0) + pulse * 0.05;
    const colours = tierNow >= 3 ? ['#ffd36b', '#ff9de0', '#8ff7c1'] : ['#5effa0', '#4fd8ff', '#b07cff'];
    g.save();
    g.globalCompositeOperation = 'lighter';
    const steps = 36;
    for (let k = 0; k < 3; k++) {
      const base = h * (0.08 + k * 0.08);
      const height = h * (0.16 + 0.04 * Math.sin(time * 0.4 + k));
      const top = x => base + Math.sin(x * 0.006 + time * (0.5 + k * 0.17) + k * 2) * h * 0.04 + Math.sin(x * 0.017 - time * 0.9) * h * 0.012;
      // the curtain fades in from nothing at its wavy top edge, so it has no hard rim
      const gradient = g.createLinearGradient(0, base - h * 0.055, 0, base + height);
      gradient.addColorStop(0, hexAlpha(colours[k], 0));
      gradient.addColorStop(0.3, hexAlpha(colours[k], strength));
      gradient.addColorStop(1, hexAlpha(colours[k], 0));
      g.fillStyle = gradient;
      g.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * w;
        if (i === 0) g.moveTo(x, top(x)); else g.lineTo(x, top(x));
      }
      for (let i = steps; i >= 0; i--) {
        const x = (i / steps) * w;
        g.lineTo(x, base + height + Math.sin(x * 0.005 + time * 0.35 + k) * h * 0.05);
      }
      g.closePath();
      g.fill();
      // the rays: soft strands hanging down from the curtain's edge, each its own length and brightness, shimmering
      const ray = raySprite(colours[k]);
      const strands = 48, rayW = Math.max(10, w / 70);
      for (let i = 0; i < strands; i++) {
        const x = ((i + 0.5) / strands) * w;
        const shimmer = 0.5 + 0.5 * Math.sin(x * 0.051 + time * 1.7 + k * 7) * Math.sin(x * 0.013 - time * 0.45 + k);
        if (shimmer < 0.3) continue;
        g.globalAlpha = Math.min(1, strength * 2.2 * (shimmer - 0.3));
        g.drawImage(ray, x - rayW / 2, top(x) - height * 0.1, rayW, height * (0.5 + shimmer * 0.9));
      }
      g.globalAlpha = 1;
    }
    g.restore();
  }

  function drawConstellations(g, time) {
    for (const c of constellations) {
      const flash = time - c.flashAt;
      const glow = flash >= 0 && flash < 1.2 ? 1 - flash / 1.2 : 0;
      const base = c.section === lastSection ? 1 : c.good ? 0.7 : 0.4;
      g.strokeStyle = `rgba(255, 246, 200, ${0.25 * base + glow * 0.6})`;
      g.lineWidth = 1.5 + glow * 2;
      g.beginPath();
      for (let i = 1; i < c.lit; i++) {
        g.moveTo(c.stars[i - 1].x, c.stars[i - 1].y);
        g.lineTo(c.stars[i].x, c.stars[i].y);
      }
      g.stroke();
      for (const star of c.stars) {
        const lit = Number.isFinite(star.lit);
        const pop = lit ? Math.max(0, 1 - (time - star.lit) / 0.4) : 0;
        g.globalAlpha = lit ? Math.min(1, base + glow) : 0.18;
        g.fillStyle = lit ? '#fff6c8' : '#c8c3ff';
        g.beginPath();
        g.arc(star.x, star.y, star.r * (1 + pop * 1.5 + glow * 0.6), 0, Math.PI * 2);
        g.fill();
        if (pop > 0 || glow > 0) {
          const size = 26 * (pop + glow);
          g.globalAlpha = Math.min(1, pop + glow);
          g.drawImage(spark, star.x - size / 2, star.y - size / 2, size, size);
        }
      }
      g.globalAlpha = 1;
    }
  }

  // Each dinosaur's pair of stage lights, from the bottom of the picture (the left, the middle, the right), sweeping slowly and
  // brighter on the beat: lit while she plays, dark while she sleeps
  function drawBeams(g, time, kick) {
    const feet = lanes === 3 ? [0.05, 0.5, 0.95] : [0.05, 0.95];
    const lean = lanes === 3 ? [0.42, 0, -0.42] : [0.42, -0.42];
    const length = Math.max(w, h) * 1.05, width = Math.max(w, h) * 0.32;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lanes; i++) {
      const level = lights[i];
      if (level < 0.02) continue;
      const strength = level * (0.08 + kick * 0.07 + tierNow * 0.025 + moodBig * 0.06);
      for (let pair = 0; pair < 2; pair++) {
        const sway = Math.sin(time * (0.45 + pair * 0.2) + i * 2.1 + pair * 2.5) * 0.28;
        const angle = lean[i] + (pair ? -0.22 : 0.22) + sway;
        g.save();
        g.translate(feet[i] * w, h + 8);
        g.rotate(angle);
        g.globalAlpha = strength;
        g.drawImage(beams[i], -width / 2, -length, width, length);
        g.restore();
      }
    }
    g.restore();
  }

  // Over the ground: mist drifting, and fireflies (more of them, and brighter, the better it goes)
  function drawGround(g, time) {
    const drift = (time * 14) % w;
    g.globalAlpha = 0.45;
    g.drawImage(mist, -drift, h * 0.6, w, h * 0.3);
    g.drawImage(mist, w - drift, h * 0.6, w, h * 0.3);
    g.globalAlpha = 1;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const shown = Math.round(fireflies.length * (0.45 + tierNow * 0.18));
    for (let i = 0; i < shown && i < fireflies.length; i++) {
      const f = fireflies[i];
      const x = (f.x + Math.sin(time * 0.21 * f.speed + f.phase) * 0.04) * w;
      const y = h * (0.58 + f.y * 0.32) + Math.sin(time * 0.7 * f.speed + f.phase * 2) * h * 0.02;
      const glow = Math.max(0, Math.sin(time * 1.3 * f.speed + f.phase));
      if (glow < 0.05) continue;
      const size = 10 + glow * 12;
      g.globalAlpha = glow * 0.75;
      g.drawImage(firefly, x - size / 2, y - size / 2, size, size);
    }
    g.restore();
    g.globalAlpha = 1;
  }

  // The lanes: beat lines falling with the notes (brighter on a bar's first beat), edges that glow on the beat and run with light
  // on a run, a flash under the finger, and the pillars of light that go up a lane on a hit
  function drawLanes(g, time, pulse) {
    const span = hitY - topY;
    const first = Math.ceil((time - 0.2) / beatLength), last = Math.floor((time + fall) / beatLength);
    for (let i = 0; i < lanes; i++) {
      const x = laneX[i] - laneW / 2;
      for (let k = Math.max(0, first); k <= last; k++) {
        const y = hitY - ((k * beatLength - time) / fall) * span;
        if (y < topY || y > hitY) continue;
        const near = 1 - (hitY - y) / span;
        g.globalAlpha = (k % 4 === 0 ? 0.22 : 0.08) * (0.3 + near * 0.7);
        g.fillStyle = k % 4 === 0 ? '#fff6c8' : '#d8d0ff';
        g.fillRect(x + laneW * 0.1, y - (k % 4 === 0 ? 1.5 : 1), laneW * 0.8, k % 4 === 0 ? 3 : 2);
      }
      const edge = tierNow >= 3 ? GOLD : cast[i].hue;
      g.globalAlpha = (0.12 + pulse * (0.25 + tierNow * 0.08)) * (0.5 + lights[i] * 0.5);
      g.strokeStyle = edge;
      g.lineWidth = 3;
      roundRect(g, x, topY - 30, laneW, hitY - topY + 30, laneW * 0.3);
      g.stroke();
      if (tierNow >= 1) {
        // a run: light runs up the lane's edges
        g.globalAlpha = 0.25 + tierNow * 0.12;
        g.strokeStyle = tierNow >= 3 ? '#ffe9a8' : '#ffffff';
        g.lineWidth = 3.5;
        g.setLineDash([laneW * 0.1, laneW * 0.32]);
        g.lineDashOffset = time * 220;
        g.stroke();
        g.setLineDash([]);
      }
      const tapped = time - flashes[i];
      if (tapped >= 0 && tapped < 0.25) {
        g.globalAlpha = (1 - tapped / 0.25) * 0.2;
        g.fillStyle = cast[i].hue;
        roundRect(g, x, topY, laneW, hitY - topY, laneW * 0.3);
        g.fill();
      }
      const missed = time - missAt[i];
      if (missed >= 0 && missed < 0.4) {
        // a miss: the lane goes dim for a moment (no red)
        g.globalAlpha = (1 - missed / 0.4) * 0.3;
        g.fillStyle = '#0b0920';
        roundRect(g, x, topY, laneW, hitY - topY, laneW * 0.3);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = pillars.length - 1; i >= 0; i--) {
      const p = pillars[i];
      const k = (time - p.at) / (p.great ? 0.45 : 0.35);
      if (k > 1 || k < 0) { if (k > 1) pillars.splice(i, 1); continue; }
      const x = laneX[p.lane];
      const width = laneW * (p.great ? 0.7 : 0.5) * (1 - k * 0.6);
      const reach = span * (0.6 + k * 0.5);
      const light = g.createLinearGradient(0, hitY, 0, hitY - reach);
      light.addColorStop(0, hexAlpha(p.hue, 0.65 * (1 - k)));
      light.addColorStop(0.4, `rgba(255, 255, 255, ${0.28 * (1 - k)})`);
      light.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = light;
      g.fillRect(x - width / 2, hitY - reach, width, reach);
    }
    g.restore();
  }

  function drawNotes(g, time, kick) {
    const span = hitY - topY;
    const gold = tierNow >= 3;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const ahead = note.t - time;
      if (ahead > fall + 0.1) break;
      const state = judge.state(i);
      if (state === 'hit') continue;
      const gone = -ahead;
      if (state === 'missed' && gone > windows.late + 0.6) continue;
      const y = hitY - (ahead / fall) * span;
      if (y < topY - laneW) continue;
      const near = 1 - Math.min(1, Math.max(0, ahead) / fall);
      let alpha = Math.min(1, (y - topY + laneW) / (laneW * 0.9));
      let scale = (0.62 + near * 0.38) * (1 + kick * 0.05);
      if (state === 'missed') {
        const fade = Math.min(1, (gone - windows.late) / 0.6);
        alpha *= 1 - fade;
        scale *= 1 - fade * 0.5;
      }
      const size = laneW * 0.95 * scale;
      g.globalAlpha = Math.max(0, alpha);
      if (state === 'missed') {
        // a missed note goes grey and sinks away: no red, no cross
        const fade = Math.min(1, (gone - windows.late) / 0.6);
        g.fillStyle = 'rgba(150, 150, 175, 0.75)';
        g.beginPath();
        g.arc(laneX[note.lane], y + fade * 40, size * 0.2, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      const sprite = gold ? goldGlow : glows[note.lane];
      // a comet's tail above the note, the way it came
      g.globalAlpha = Math.max(0, alpha) * 0.3;
      g.drawImage(sprite, laneX[note.lane] - size * 0.22, y - size * 1.05, size * 0.44, size * 1.1);
      g.globalAlpha = Math.max(0, alpha);
      g.drawImage(sprite, laneX[note.lane] - size / 2, y - size / 2, size, size);
      g.fillStyle = gold ? '#7a4e00' : cast[note.lane].dark;
      g.font = `900 ${Math.round(size * 0.24)}px Nunito, ui-rounded, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(gold ? '★' : '♪', laneX[note.lane], y + size * 0.01);
    }
    g.globalAlpha = 1;
  }

  function drawDinosaurs(g, time) {
    for (let i = 0; i < lanes; i++) {
      // the next note coming down her lane: a ring closes on her button, touching it when it is time to tap
      let ahead = Infinity;
      for (let k = Math.max(0, judge.first ?? 0); k < notes.length; k++) {
        const note = notes[k];
        if (note.t - time > APPROACH) break;
        if (note.lane !== i || judge.state(k) !== 'waiting') continue;
        if (note.t - time > -0.15) { ahead = note.t - time; break; }
      }
      const x = laneX[i];
      const since = time - hops[i];
      const hop = since >= 0 && since < 0.32 ? Math.sin((since / 0.32) * Math.PI) : 0;
      // a dinosaur who is in the song dances on every beat; one who is out sits still, asleep
      const playing = conductor.isOpen(cast[i].role);
      const step = playing ? Math.max(0, 1 - beatNow.phase * 4) : 0;
      const y = hitY - hop * dinoR * 0.32 - step * dinoR * 0.07;
      const s = 1 + hop * 0.08 + step * 0.03;
      // squash under the finger, then a springy bounce back
      const pressed = time - flashes[i];
      const spring = pressed >= 0 && pressed < 0.5 ? Math.exp(-pressed * 9) * Math.cos(pressed * 34) : 0;
      const sxScale = s * (1 + spring * 0.12), syScale = s * (1 - spring * 0.12);
      // a miss: she shakes her head, gently
      const missed = time - missAt[i];
      const turn = missed >= 0 && missed < 0.6 ? Math.sin(missed * 30) * 0.1 * Math.exp(-missed * 6) : 0;
      if (ahead < APPROACH || tierNow >= 2) {
        const soon = Math.abs(ahead);
        const glow = Math.max(soon < 0.6 ? 1 - soon / 0.6 : 0, tierNow >= 2 ? 0.35 + 0.1 * tierNow : 0);
        g.globalAlpha = Math.min(1, glow);
        g.strokeStyle = tierNow >= 3 ? GOLD : '#fff6c8';
        g.lineWidth = 6 + glow * 6;
        g.shadowColor = tierNow >= 3 ? GOLD : cast[i].hue;
        g.shadowBlur = 24 * glow;
        g.beginPath();
        g.arc(x, hitY, dinoR + 8 + glow * 4, 0, Math.PI * 2);
        g.stroke();
        g.shadowBlur = 0;
        g.shadowColor = 'transparent';
        g.globalAlpha = 1;
      }
      if (ahead >= 0 && ahead < APPROACH) {
        const k = ahead / APPROACH;
        g.globalAlpha = (1 - k) * 0.85;
        g.strokeStyle = tierNow >= 3 ? '#ffe9a8' : '#ffffff';
        g.lineWidth = 3 + (1 - k) * 2;
        g.beginPath();
        g.arc(x, hitY, (dinoR + 8) * (1 + k * 0.9), 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
      const { canvas: button, size } = buttons[i];
      g.save();
      g.translate(x, y);
      if (turn) g.rotate(turn);
      g.drawImage(button, (-size * sxScale) / 2, (-size * syScale) / 2, size * sxScale, size * syScale);
      // a hit: the button flashes white for a moment
      const lit = time - hitAt[i];
      if (lit >= 0 && lit < 0.14) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (1 - lit / 0.14) * 0.55;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(0, 0, dinoR * sxScale, dinoR * syScale, 0, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      // her part has dropped out of the song: her button dims until a note of hers is hit again
      if (!playing) {
        g.globalAlpha = 0.42;
        g.fillStyle = '#1b1840';
        g.beginPath();
        g.ellipse(0, 0, dinoR * sxScale, dinoR * syScale, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      g.globalAlpha = 1;
      if (!playing) {
        // z z z rising from her, slowly
        for (let z = 0; z < 3; z++) {
          const k = ((time * 0.45 + z / 3) % 1);
          g.globalAlpha = Math.sin(k * Math.PI) * 0.9;
          outlined(g, 'z', x + dinoR * (0.45 + k * 0.4), y - dinoR * (0.5 + k * 0.9), Math.round(dinoR * (0.22 + k * 0.18)), '#e7e0ff');
        }
        g.globalAlpha = 1;
      }
    }
  }

  function drawEffects(g, time) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      const k = (time - p.at) / 0.6;
      if (k > 1 || k < 0) { if (k > 1) puffs.splice(i, 1); continue; }
      g.globalAlpha = (1 - k) * 0.35;
      g.fillStyle = '#9b98b8';
      g.beginPath();
      g.arc(p.x + p.vx * k, p.y + p.vy * k, p.r * (1 + k), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      const k = s.life / s.max;
      g.globalAlpha = 1 - k * k;
      if (s.hue) {
        // a firework's spark: a coloured dot with a short tail behind it
        g.strokeStyle = s.hue;
        g.lineWidth = 3.2 * (1 - k * 0.5);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(s.x - s.vx * 0.06, s.y - s.vy * 0.06);
        g.lineTo(s.x, s.y);
        g.stroke();
      } else {
        const size = s.size * (1 - k * 0.4);
        g.drawImage(spark, s.x - size / 2, s.y - size / 2, size, size);
      }
    }
    for (const r of rockets) {
      g.globalAlpha = 1;
      g.fillStyle = r.hue;
      g.beginPath();
      g.arc(r.x, r.y, 3, 0, Math.PI * 2);
      g.fill();
    }
    // stars won, flying up into the bar on a curve, glitter behind them
    for (const f of flyers) {
      const k = Math.min(1, Math.max(0, (time - f.at) / FLY));
      const to = barStar(f.index);
      const e = 1 - (1 - k) * (1 - k);
      const x = f.x + (to.x - f.x) * e + Math.sin(k * Math.PI) * (f.x < w / 2 ? -1 : 1) * w * 0.08;
      const y = f.y + (to.y - f.y) * e;
      g.globalAlpha = 1;
      star(g, x, y, bar.h * (1.6 - k * 0.6), GOLD, '#fff6c8', 3);
      if (random() < 0.7) sparks.push({ x, y, vx: (random() - 0.5) * 40, vy: (random() - 0.5) * 40, life: 0, max: 0.4, size: 10, gravity: 60 });
    }
    g.restore();
    g.globalAlpha = 1;
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      const k = (time - ring.at) / 0.45;
      if (k > 1 || k < 0) { if (k > 1) rings.splice(i, 1); continue; }
      g.globalAlpha = 1 - k;
      g.strokeStyle = ring.great ? '#fff6c8' : ring.hue;
      g.lineWidth = 8 * (1 - k) + 2;
      g.beginPath();
      g.arc(laneX[ring.lane], hitY, dinoR * (1 + k * (ring.great ? 0.75 : 0.5)), 0, Math.PI * 2);
      g.stroke();
    }
    // Slóeðla's sound going up out of her crest in arcs; Þórseðla's thump rolling out along the ground
    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i];
      const k = (time - wave.at) / 0.7;
      if (k > 1 || k < 0) { if (k > 1) waves.splice(i, 1); continue; }
      const x = laneX[wave.lane];
      g.globalAlpha = (1 - k) * 0.8;
      g.strokeStyle = '#e6f0ff';
      g.lineWidth = 4 * (1 - k) + 1;
      if (wave.kind === 'horn') {
        for (let j = 0; j < 3; j++) {
          const r = dinoR * (0.6 + k * 1.6 + j * 0.3);
          g.beginPath();
          g.arc(x, hitY - dinoR * 0.4, r, Math.PI * 1.2, Math.PI * 1.8);
          g.stroke();
        }
      } else {
        g.strokeStyle = '#ffe2a8';
        g.beginPath();
        g.ellipse(x, hitY + dinoR * 0.85, dinoR * (0.8 + k * 2.2), dinoR * (0.12 + k * 0.25), 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      const k = (time - f.at) / 0.9;
      if (k > 1 || k < 0) { if (k > 1) floaters.splice(i, 1); continue; }
      g.globalAlpha = 1 - k;
      g.fillStyle = '#fff6c8';
      g.font = `900 ${Math.round(dinoR * 0.5)}px Nunito, ui-rounded, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('♪', laneX[f.lane] + f.wobble * dinoR * 0.5 + Math.sin(k * 6) * 8, hitY - dinoR - k * dinoR * 1.6);
    }
    g.globalAlpha = 1;
    for (let i = words.length - 1; i >= 0; i--) {
      const word = words[i];
      const age = time - word.at;
      const k = age / SAY_LIFE;
      if (k > 1 || k < 0) { if (k > 1) words.splice(i, 1); continue; }
      // the next word has come: this one goes quickly
      const next = words[i + 1];
      const giving = next && time >= next.at ? Math.max(0, 1 - (time - next.at) / 0.2) : 1;
      if (giving <= 0) { words.splice(i, 1); continue; }
      drawWord(g, word.text, word.x, word.y - k * 30, Math.round(word.size * (1 + 0.08 * Math.sin(age * 9) * Math.exp(-age * 3))), {
        style: word.style, time, age, wave: 0.05, alpha: (k > 0.8 ? (1 - k) / 0.2 : 1) * giving, fit: w * 0.92,
      });
    }
    drawGrades(g, time);
    drawRises(g, time);
    drawCounter(g, time);
  }

  // The word over each dinosaur for her last tapped note: it pops up over the button, drifts up a little and fades
  function drawGrades(g, time) {
    grades.forEach((entry, lane) => {
      if (!entry) return;
      const age = time - entry.at;
      if (age < 0 || age > GRADE_LIFE) { if (age > GRADE_LIFE) grades[lane] = null; return; }
      const look = GRADES[entry.grade];
      const size = Math.round(Math.min(dinoR * 0.62, portrait ? 30 : 40) * look.size);
      const y = hitY - dinoR * 1.42 - Math.min(1, age / GRADE_LIFE) * dinoR * 0.45;
      drawWord(g, look.text, laneX[lane], y, size, {
        style: look.style, time, age, stagger: 0.025, pop: 0.16, wave: entry.grade === 'perfect' ? 0.06 : 0,
        // it leaves in its last 0.18 s by flattening out wide as it fades (the arcade dance games' exit)
        alpha: age > GRADE_LIFE - 0.18 ? (GRADE_LIFE - age) / 0.18 : 1, fit: laneW * 0.98, glow: entry.grade !== 'ok',
        squash: age > GRADE_LIFE - 0.18 ? [1 + 0.25 * (1 - (GRADE_LIFE - age) / 0.18), 1 - 0.45 * (1 - (GRADE_LIFE - age) / 0.18)] : null,
      });
    });
  }

  // A run's milestones: they rise from the dinosaurs to the middle of the screen, the letters popping in one by one and bobbing
  // as they go, then fade; the number big (a six-year-old reads numbers to a hundred more easily than words)
  function drawRises(g, time) {
    for (let i = rises.length - 1; i >= 0; i--) {
      const r = rises[i];
      const age = time - r.at;
      if (age < 0 || age > RISE_LIFE) { if (age > RISE_LIFE) rises.splice(i, 1); continue; }
      const k = Math.min(1, age / 1.3);
      const eased = 1 - (1 - k) ** 3;
      const from = hitY - dinoR * 0.3, to = h * 0.5;
      const size = Math.round((portrait ? 44 : 60) * (1 + 0.12 * Math.sin(age * 6) * Math.exp(-age * 2)));
      drawWord(g, [[String(r.count), 1.4], [' í röð!', 0.85]], w / 2, from + (to - from) * eased, size, {
        style: r.style, time, age, stagger: 0.05, pop: 0.28, wave: 0.07,
        alpha: age > RISE_LIFE - 0.5 ? (RISE_LIFE - age) / 0.5 : 1, fit: w * 0.9,
      });
    }
  }

  // The run's count under the bar: it pops on every hit and more on every tenth; a broken run's count tumbles away, grey
  function drawCounter(g, time) {
    const size = portrait ? 26 : 28;
    if (broken) {
      const k = (time - broken.at) / 0.9;
      if (k > 1 || k < 0) broken = null;
      else {
        g.save();
        g.translate(w / 2 + k * 30, counterY + k * k * 120);
        g.rotate(k * 0.6);
        g.globalAlpha = 1 - k;
        outlined(g, `${broken.value} í röð`, 0, 0, size, '#b9b4d6');
        g.restore();
        g.globalAlpha = 1;
      }
    }
    if (score.streak < 3 || phase !== 'play') return;
    const hit = time - comboAt, round = time - comboBigAt;
    const pop = (hit >= 0 ? 0.3 * Math.exp(-hit * 12) : 0) + (round >= 0 && round < 0.6 ? 0.6 * Math.exp(-round * 7) : 0);
    if (round >= 0 && round < 0.5) {
      g.globalAlpha = 1 - round / 0.5;
      g.strokeStyle = tierNow >= 3 ? GOLD : '#fff6c8';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(w / 2, counterY, size * (2.6 + round * 4), size * (0.9 + round * 1.6), 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    drawWord(g, `${score.streak} í röð`, w / 2, counterY, Math.round(size * (1 + pop)), { style: score.streak >= 20 ? 'rainbow' : score.streak >= 10 ? 'gold' : 'cream', time, pop: 0, glow: score.streak >= 10 });
  }

  function drawBar(g, time) {
    const { x, y, w: bw, h: bh } = bar;
    const share = shareNow();
    g.fillStyle = 'rgba(20, 18, 50, 0.55)';
    roundRect(g, x - 4, y - 4, bw + 8, bh + 8, (bh + 8) / 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(g, x, y, bw, bh, bh / 2);
    g.fill();
    if (share > 0) {
      const fill = g.createLinearGradient(x, 0, x + bw, 0);
      fill.addColorStop(0, GOLD);
      fill.addColorStop(1, '#ffe27a');
      g.fillStyle = fill;
      roundRect(g, x, y, Math.max(bh, bw * share), bh, bh / 2);
      g.fill();
      // a shine running along the gold
      const shineX = x + ((time * 0.35) % 1) * bw * share;
      const shine = g.createLinearGradient(shineX - bh * 2, 0, shineX + bh * 2, 0);
      shine.addColorStop(0, 'rgba(255,255,255,0)');
      shine.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = shine;
      roundRect(g, x, y, Math.max(bh, bw * share), bh, bh / 2);
      g.fill();
    }
    STAR_SHARES.forEach((least, index) => {
      const lit = share >= least && !flyers.some(f => f.index === index);
      const since = barPop.index === index ? time - barPop.at : Infinity;
      const pop = since >= 0 && since < 0.5 ? 1 + 0.6 * Math.sin((since / 0.5) * Math.PI) : 1;
      star(g, x + bw * least, y + bh / 2, bh * (lit ? 1.05 : 0.85) * pop, lit ? GOLD : 'rgba(255,255,255,0.35)', lit ? '#fff6c8' : 'rgba(255,255,255,0.5)');
    });
  }

  function drawEnd(g, time) {
    const k = Math.min(1, (time - endAt) / 0.5);
    g.globalAlpha = k * 0.55;
    g.fillStyle = '#120f2e';
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
    const cy = portrait ? h * 0.36 : h * 0.34;
    const size = Math.min(w, h) * (portrait ? 0.12 : 0.11);
    for (let i = 0; i < 3; i++) {
      const sx = w / 2 + (i - 1) * size * 2.3;
      const since = time - (endAt + 0.6 + i * STAR_GAP);
      if (i < endStars && since >= 0) {
        const pop = since < 0.25 ? 0.4 + (since / 0.25) * 0.8 : 1.2 - Math.min(0.2, (since - 0.25) * 0.8);
        star(g, sx, cy - (i === 1 ? size * 0.3 : 0), size * pop, GOLD, '#fff6c8', 6);
      } else star(g, sx, cy - (i === 1 ? size * 0.3 : 0), size * 0.9, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.35)', 4);
    }
    if (time - endAt > 0.6 + STAR_GAP * Math.max(1, endStars) - 0.2) {
      const total = notes.length;
      const since = time - (endAt + 0.4 + STAR_GAP * Math.max(1, endStars));
      drawWord(g, END_WORDS[endStars], w / 2, cy + size * 1.6, portrait ? 40 : 52, { style: endStars === 3 ? 'rainbow' : endStars === 2 ? 'gold' : 'lilac', time, age: since, wave: 0.05, fit: w * 0.92 });
      outlined(g, `Þú spilaðir ${score.hits} af ${total} ${total % 10 === 1 && total % 100 !== 11 ? 'tóni' : 'tónum'}`, w / 2, cy + size * 1.6 + (portrait ? 50 : 60), portrait ? 24 : 30, '#e7e0ff');
    }
  }

  function drawDebug(g, time, section) {
    const offsets = score.offsets;
    const mean = offsets.length ? (offsets.reduce((a, b) => a + b, 0) / offsets.length) * 1000 : 0;
    const gates = cast.map(c => `${c.name[0]}${conductor.isOpen(c.role) ? '+' : '-'}`).join(' ');
    const lines = [
      `tími ${time.toFixed(2)} s · ${fps.value} fps · ${section ? `${section.name} (${section.variant})` : ''}`,
      `seinkun hljóðs ${(clock.latency() * 1000).toFixed(0)} ms · rásir ${gates} · stig ${tierNow}`,
      `hitt ${score.hits}/${notes.length} · mis ${score.misses} · auka ${score.strays} · best ${score.best}`,
      `meðalskekkja ${mean >= 0 ? '+' : ''}${mean.toFixed(0)} ms (${offsets.length}) · neistar ${sparks.length}${heard.length ? ` · áhorfendur ${heard.at(-1)[1]} ${heard.at(-1)[0]} s` : ''}`,
    ];
    g.font = '600 14px ui-monospace, monospace';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(8, h - 14 - lines.length * 18, 440, lines.length * 18 + 8);
    g.fillStyle = '#fff';
    lines.forEach((line, i) => g.fillText(line, 14, h - 10 - (lines.length - i) * 18));
  }

  // -------------------------------------------------------------------------------------------------------------------------

  function result() {
    const final = { ...score, total: notes.length };
    return { stars: starsFor(final), share: shareOf(final), hits: score.hits, total: notes.length, misses: score.misses, strays: score.strays, best: score.best, great: score.great };
  }

  let lastPerf = null;
  resize();
  return {
    tap,
    resize,
    frame(perf = performance.now()) {
      const time = clock.time();
      const dt = lastPerf === null ? 0 : Math.min(0.1, Math.max(0, (perf - lastPerf) / 1000));
      lastPerf = perf;
      fps.frames++;
      if (perf - fps.since > 1000) { fps.value = Math.round((fps.frames * 1000) / (perf - fps.since)); fps.frames = 0; fps.since = perf; }
      lastTime = Number.isFinite(time) ? time : 0;
      update(lastTime, dt);
      draw(lastTime);
    },
    laneAt(x) {
      let best = -1, gap = Infinity;
      laneX.forEach((lx, i) => { const d = Math.abs(x - lx); if (d < gap) { gap = d; best = i; } });
      return gap <= laneW * 0.9 ? best : -1;
    },
    state: () => ({ phase, time: lastTime, section: conductor.sectionAt(lastTime)?.name ?? null, variant: conductor.sectionAt(lastTime)?.variant ?? null, score: { ...score, offsets: undefined, total: notes.length }, stars: starsFor({ ...score, total: Math.max(1, notes.length) }), share: shareNow(), tier: tierNow, crowd: heard.slice() }),
    result,
  };
}

// -----------------------------------------------------------------------------------------------------------------------------
// Little drawing helpers

function roundRect(g, x, y, width, height, r) {
  const radius = Math.max(0, Math.min(r, width / 2, height / 2));
  g.beginPath();
  g.moveTo(x + radius, y);
  g.arcTo(x + width, y, x + width, y + height, radius);
  g.arcTo(x + width, y + height, x, y + height, radius);
  g.arcTo(x, y + height, x, y, radius);
  g.arcTo(x, y, x + width, y, radius);
  g.closePath();
}

function star(g, x, y, r, fill, line, width = 2) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.46 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineJoin = 'round';
  g.lineWidth = width;
  g.strokeStyle = line;
  g.stroke();
}

function outlined(g, text, x, y, size, fill) {
  g.font = `900 ${size}px Nunito, ui-rounded, "Arial Rounded MT Bold", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(4, size * 0.16);
  g.strokeStyle = 'rgba(30, 20, 60, 0.85)';
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function hexAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
