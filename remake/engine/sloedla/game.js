// Slóeðla's song game, the round itself, drawn on one canvas (cheap on a tablet, and recordable with its sound: lab.js ?upptaka=1):
// lanes down the screen, each ending in a big round button with its dinosaur; glowing notes fall in time with the song, and the
// child taps the lane when a note reaches the dinosaur. The song is played by the conductor (conductor.js), and the round tells it
// what the child does: a hit keeps that dinosaur's part playing, a miss lets it drop out of the song (her button dims until she is
// hit again), a run of hits brings in more of the band. Around the lanes the sky answers the music: northern lights that sway on
// the beat and grow brighter the better it goes, a constellation that draws itself star by star as the notes are played (a section
// played well flashes it), fireworks when a section comes in big, and at the top of a run everything turns gold. Nobody loses: a
// missed note fades away, the song plays to its end, and the stars won rise one by one.
//
// The song's time comes from `clock` (song-clock.js: the heard time of the audio context), so the notes keep to the music even when
// frames come late; tap(lane, time) is judged at the song time given (the page passes its event's time).

import { danceGrid, beatAt } from '../beat.js';
import { HIT_WINDOW, NEAR_WINDOW, STAR_SHARES, createJudge, createScore, count, laneOf, shareOf, starsFor, tierOf } from './chart.js';
import { seededRandom } from '../random.js';

const WORDS = ['', 'Flott!', 'Vá!', 'Stjörnukraftur!']; // a run reaching tier 1, 2, 3 (a six-year-old is starting to read)
const MORE = ['Áfram svona!', 'Stórkostlegt!', 'Ótrúlegt!']; // every eight hits further on
const END_WORDS = ['Spilum aftur saman!', 'Vel gert!', 'Flott!', 'Frábært!'];
const END_AFTER = 0.6; // s after the song's last bar before the stars
const STAR_GAP = 0.75; // s between the stars rising at the end
const GOLD = '#f2b630';

/**
 * A round. `canvas` to draw on; `cast` one entry a lane, left to right ({ role, name, hue, light, dark, image }); `conductor` the
 * song (conductor.js, started by the page); `fall` how long a note takes to fall; `clock` the song's clock; `chimes` the end's bells
 * ({ star(n) }). Returns { tap(lane, time), frame(), resize(), laneAt(x), state(), result() }; `onEnd(result)` when the stars rose.
 */
export function createSongGame({ canvas, cast, conductor, fall, clock, chimes = null, random = Math.random, onEnd = () => {}, debug = false }) {
  const ctx = canvas.getContext('2d');
  const lanes = cast.length;
  const notes = conductor.chart; // grows a section at a time
  const judge = createJudge(notes);
  const score = createScore(conductor.expected);
  const dance = danceGrid({ bpm: conductor.bpm, beatOffset: 0, danceBeats: 2 });

  let w = 0, h = 0, dpr = 1, portrait = false;
  let laneW = 0, laneX = [], dinoR = 0, hitY = 0, topY = 0, bar = null, sky = null;
  let background = null;
  let glows = [], goldGlow = null, buttons = [], spark = null;
  let laned = 0; // notes given their lane so far

  const twinkles = Array.from({ length: 80 }, () => ({ x: random(), y: random() * 0.7, r: 0.5 + random() * 1.5, phase: random() * 6.28 }));
  const sparks = []; // short-lived glitter: { x, y, vx, vy, life, max, size, gold }
  const rings = [];
  const waves = []; // Slóeðla's sound waves, Þórseðla's ground wave
  const hops = new Array(lanes).fill(-Infinity);
  const flashes = new Array(lanes).fill(-Infinity);
  const floaters = [];
  const words = [];
  const rockets = []; // fireworks on their way up: { x, y, vy, burstAt, hue }
  const constellations = []; // one a section: { section, stars: [{ x, y, lit }], lit, flashAt, good }
  let shakeAt = -Infinity;
  let starsLit = 0;
  let phase = 'play';
  let endAt = null, endStars = 0, starsShown = 0;
  let lastTime = 0;
  let lastSection = -1;
  let tierNow = 0;
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
    topY = bar.y + bar.h + (portrait ? h * 0.06 : h * 0.06);
    // where the constellations may go: the sky beside the lanes (or above them, upright)
    const left = x0 - gap, right = w - (x0 + span + gap);
    sky = portrait || left < 120
      ? [{ x: w * 0.08, y: topY, w: w * 0.84, h: h * 0.22 }]
      : [{ x: w * 0.03, y: h * 0.14, w: left - w * 0.03, h: h * 0.5 }, { x: x0 + span + gap, y: h * 0.14, w: right - w * 0.03, h: h * 0.5 }];
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

  function paintBackground() {
    const [c, g] = offscreen(w, h);
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#10173f');
    gradient.addColorStop(0.5, '#2c2c66');
    gradient.addColorStop(0.85, '#5b4a82');
    gradient.addColorStop(1, '#7a5d88');
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(24, 44, 70, 0.92)';
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, h * 0.87);
    g.quadraticCurveTo(w * 0.5, h * 0.75, w, h * 0.87);
    g.lineTo(w, h);
    g.fill();
    for (let i = 0; i < lanes; i++) {
      const x = laneX[i] - laneW / 2;
      const column = g.createLinearGradient(0, topY, 0, hitY);
      column.addColorStop(0, 'rgba(255,255,255,0)');
      column.addColorStop(0.35, 'rgba(255,255,255,0.05)');
      column.addColorStop(1, hexAlpha(cast[i].hue, 0.3));
      g.fillStyle = column;
      roundRect(g, x, topY - 30, laneW, hitY - topY + 30, laneW * 0.3);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.10)';
      g.setLineDash([4, 14]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(laneX[i], topY);
      g.lineTo(laneX[i], hitY - dinoR);
      g.stroke();
      g.setLineDash([]);
    }
    background = c;
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

  function paintSprites() {
    const size = laneW * 0.95;
    glows = cast.map(({ hue }) => glowSprite(hue, size));
    goldGlow = glowSprite(GOLD, size);
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
      c = { section, seed: seededRandom(`stjornumerki-${section}`), stars: Array.from({ length: count }, () => ({ lit: -Infinity })), lit: 0, flashAt: -Infinity, good: false };
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
    const many = great ? 18 : 11;
    for (let i = 0; i < many; i++) {
      const a = (i / many) * Math.PI * 2 + random() * 0.4;
      const speed = (great ? 260 : 190) * (0.6 + random() * 0.6);
      sparks.push({ x, y: y - dinoR * 0.2, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 120, life: 0, max: 0.55 + random() * 0.35, size: (great ? 22 : 16) * (0.7 + random() * 0.6), gravity: 380 });
    }
    rings.push({ lane, at: lastTime, hue: gold ? GOLD : cast[lane].hue, great });
  }

  function firework(x, y, hue) {
    rockets.push({ x, y: h * 0.85, vy: -(h * 0.9), target: y, hue });
  }

  function say(text, { y = h * 0.4, size = 54, hue = '#fff6c8' } = {}) {
    words.push({ text, x: w / 2, y, size, hue, at: lastTime });
    if (words.length > 3) words.shift();
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

  /** A tap on `lane` at song time `time`. */
  function tap(lane, time = clock.time()) {
    if (phase !== 'play' || !(lane >= 0 && lane < lanes)) return null;
    giveLanes();
    const role = cast[lane].role;
    flashes[lane] = time;
    const result = judge.tap(lane, time);
    if (result.kind === 'hit') {
      conductor.hit(result.note);
      hops[lane] = time;
      const gold = tierNow >= 3;
      burst(lane, result.great, gold);
      floaters.push({ lane, at: time, wobble: random() * 2 - 1 });
      // what the instrument looks like when it plays: her horn's waves, the drum's thump, the plates' glitter
      const noteRole = result.note.role;
      if (noteRole === 'a') waves.push({ lane, at: time, kind: 'horn' });
      else if (noteRole === 'c') { waves.push({ lane, at: time, kind: 'ground' }); shakeAt = time; }
      else for (let i = 0; i < 8; i++) sparks.push({ x: laneX[lane] + (random() - 0.5) * dinoR, y: hitY - dinoR * 0.5, vx: (random() - 0.5) * 60, vy: -120 - random() * 120, life: 0, max: 0.9, size: 12, gravity: -20 });
      const c = constellationFor(result.note.section);
      if (c.lit < c.stars.length) c.stars[c.lit++].lit = time;
      count(score, result);
      const crossed = setTier();
      if (crossed) say(WORDS[crossed]);
      else if (score.streak >= 24 && score.streak % 8 === 0) say(MORE[(score.streak / 8) % MORE.length]);
      const lit = STAR_SHARES.filter(least => shareNow() >= least).length;
      if (lit > starsLit) {
        starsLit = lit;
        chimes?.sparkle?.();
      }
    } else {
      conductor.stray(role);
      if (result.kind === 'stray' && notes.length && time > notes[0].t - 1 && time < conductor.length) {
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
        conductor.miss(notes[index]);
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
          say('Allir með!', { y: h * 0.32 });
        }
      }
      if (time > conductor.length + END_AFTER) {
        phase = 'end';
        endAt = time;
        score.total = notes.length;
        endStars = starsFor(score);
        if (endStars === 3) for (let i = 0; i < 6; i++) firework(w * (0.1 + 0.8 * random()), h * (0.1 + random() * 0.3), [GOLD, '#ff7eb6', '#7fe3ff'][i % 3]);
      }
    } else if (phase === 'end') {
      const due = Math.min(endStars, Math.floor((time - endAt - 0.6) / STAR_GAP) + 1);
      while (starsShown < due) chimes?.star?.(++starsShown);
      if (time - endAt > 0.6 + STAR_GAP * Math.max(1, endStars) + 0.4) {
        phase = 'done';
        onEnd(result());
      }
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
    if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Draw

  function draw(time) {
    const g = ctx;
    const since = time - shakeAt;
    const shake = since >= 0 && since < 0.18 ? (1 - since / 0.18) * 5 : 0;
    g.setTransform(dpr, 0, 0, dpr, shake ? (random() - 0.5) * shake * dpr : 0, shake ? (random() - 0.5) * shake * dpr : 0);
    g.drawImage(background, 0, 0, w, h);
    const beat = beatAt(Math.max(0, time), dance);
    const pulse = Math.max(0, 1 - beat.phase * 3);
    const section = conductor.sectionAt(time);
    const big = section?.variant === 'big';
    const calm = section?.variant === 'calm';

    for (const star of twinkles) {
      g.globalAlpha = Math.max(0, Math.min(1, 0.3 + 0.3 * Math.sin(time * 2.2 + star.phase) + pulse * 0.15 * (tierNow + 1) * 0.5));
      g.fillStyle = '#fff8dc';
      g.beginPath();
      g.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    drawAurora(g, time, pulse, big, calm);
    drawConstellations(g, time);

    // the lanes' edges glow on the beat; gold at the top of a run
    for (let i = 0; i < lanes; i++) {
      const x = laneX[i] - laneW / 2;
      const edge = tierNow >= 3 ? GOLD : cast[i].hue;
      g.globalAlpha = 0.12 + pulse * (0.25 + tierNow * 0.08);
      g.strokeStyle = edge;
      g.lineWidth = 3;
      roundRect(g, x, topY - 30, laneW, hitY - topY + 30, laneW * 0.3);
      g.stroke();
      const tapped = time - flashes[i];
      if (tapped >= 0 && tapped < 0.25) {
        g.globalAlpha = (1 - tapped / 0.25) * 0.22;
        g.fillStyle = cast[i].hue;
        roundRect(g, x, topY, laneW, hitY - topY, laneW * 0.3);
        g.fill();
      }
    }
    g.globalAlpha = 1;

    drawDinosaurs(g, time);
    drawNotes(g, time);
    drawEffects(g, time);
    drawBar(g);
    if (phase !== 'play') drawEnd(g, time);
    if (debug) drawDebug(g, time, section);
  }

  // Northern lights: three ribbons over the sky, swaying slowly, brightening on the beat and with the run, quieter when calm
  function drawAurora(g, time, pulse, big, calm) {
    const strength = (calm ? 0.06 : 0.11) + tierNow * 0.05 + (big ? 0.08 : 0) + pulse * 0.05;
    const colours = tierNow >= 3 ? ['#ffd36b', '#ff9de0', '#8ff7c1'] : ['#5effa0', '#4fd8ff', '#b07cff'];
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const base = h * (0.1 + k * 0.08);
      const height = h * (0.16 + 0.04 * Math.sin(time * 0.4 + k));
      const gradient = g.createLinearGradient(0, base - height * 0.4, 0, base + height);
      gradient.addColorStop(0, hexAlpha(colours[k], 0));
      gradient.addColorStop(0.35, hexAlpha(colours[k], strength));
      gradient.addColorStop(1, hexAlpha(colours[k], 0));
      g.fillStyle = gradient;
      g.beginPath();
      const steps = 36;
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * w;
        const y = base + Math.sin(x * 0.006 + time * (0.5 + k * 0.17) + k * 2) * h * 0.04 + Math.sin(x * 0.017 - time * 0.9) * h * 0.012;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const x = (i / steps) * w;
        const y = base + height + Math.sin(x * 0.005 + time * 0.35 + k) * h * 0.05;
        g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
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

  function drawNotes(g, time) {
    const span = hitY - topY;
    const gold = tierNow >= 3;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const ahead = note.t - time;
      if (ahead > fall + 0.1) break;
      const state = judge.state(i);
      if (state === 'hit') continue;
      const gone = -ahead;
      if (state === 'missed' && gone > HIT_WINDOW + 0.35) continue;
      const y = hitY - (ahead / fall) * span;
      if (y < topY - laneW) continue;
      const near = 1 - Math.min(1, Math.max(0, ahead) / fall);
      let alpha = Math.min(1, (y - topY + laneW) / (laneW * 0.9));
      let scale = 0.62 + near * 0.38;
      if (state === 'missed') {
        const fade = Math.min(1, (gone - HIT_WINDOW) / 0.35);
        alpha *= 1 - fade;
        scale *= 1 - fade * 0.5;
      }
      const sprite = gold ? goldGlow : glows[note.lane];
      const size = laneW * 0.95 * scale;
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
      let soon = Infinity;
      for (let k = Math.max(0, judge.first ?? 0); k < notes.length; k++) {
        const note = notes[k];
        if (note.t - time > 0.6) break;
        if (note.lane !== i || judge.state(k) !== 'waiting') continue;
        soon = Math.min(soon, Math.abs(note.t - time));
      }
      const x = laneX[i];
      const since = time - hops[i];
      const hop = since >= 0 && since < 0.32 ? Math.sin((since / 0.32) * Math.PI) : 0;
      const y = hitY - hop * dinoR * 0.32;
      const s = 1 + hop * 0.08;
      if (soon < 0.6 || tierNow >= 2) {
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
      const { canvas: button, size } = buttons[i];
      const d = size * s;
      g.drawImage(button, x - d / 2, y - d / 2, d, d);
      // her part has dropped out of the song: her button dims until a note of hers is hit again
      if (!conductor.isOpen(cast[i].role)) {
        g.globalAlpha = 0.42;
        g.fillStyle = '#1b1840';
        g.beginPath();
        g.arc(x, y, dinoR * s, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    }
  }

  function drawEffects(g, time) {
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
      g.strokeStyle = cast[wave.lane].hue === undefined ? '#fff' : '#e6f0ff';
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
      const k = (time - word.at) / 1.1;
      if (k > 1 || k < 0) { if (k > 1) words.splice(i, 1); continue; }
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.3);
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      outlined(g, word.text, word.x, word.y - k * 30, Math.round(word.size * pop), word.hue);
    }
    g.globalAlpha = 1;
    if (score.streak >= 3 && phase === 'play') {
      const y = bar.y + bar.h + (portrait ? 30 : 34);
      outlined(g, `${score.streak} í röð`, w / 2, y, portrait ? 26 : 28, tierNow >= 3 ? '#ffe27a' : '#fff6c8');
    }
  }

  function drawBar(g) {
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
    }
    STAR_SHARES.forEach(least => {
      const lit = share >= least;
      star(g, x + bw * least, y + bh / 2, bh * (lit ? 1.05 : 0.85), lit ? GOLD : 'rgba(255,255,255,0.35)', lit ? '#fff6c8' : 'rgba(255,255,255,0.5)');
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
      outlined(g, END_WORDS[endStars], w / 2, cy + size * 1.6, portrait ? 40 : 52, '#fff6c8');
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
      `meðalskekkja ${mean >= 0 ? '+' : ''}${mean.toFixed(0)} ms (${offsets.length})`,
    ];
    g.font = '600 14px ui-monospace, monospace';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(8, h - 14 - lines.length * 18, 420, lines.length * 18 + 8);
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
    state: () => ({ phase, time: lastTime, section: conductor.sectionAt(lastTime)?.name ?? null, variant: conductor.sectionAt(lastTime)?.variant ?? null, score: { ...score, offsets: undefined, total: notes.length }, stars: starsFor({ ...score, total: Math.max(1, notes.length) }), share: shareNow(), tier: tierNow }),
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
