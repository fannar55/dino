// Slóeðla's song game, the round itself, drawn on one canvas (cheap on a tablet, and recordable with its sound: lab.js ?upptaka=1):
// lanes down the screen, each ending in a big round button with its dinosaur; glowing notes fall in time with the song, and the
// child taps the lane when a note reaches the dinosaur, who then plays it on her instrument, hops and sparkles. A note missed just
// fades away. A run of hits makes the sky glitter more and the audience (Mosi and the small animals the child has met) bounce and
// cheer louder; the bar at the top fills with every note played and lights its three stars as the share passes each one. At the end
// of the song the stars won rise one by one. Nobody loses.
//
// It takes the song's time from `clock` (song-clock.js: the heard time of the audio that plays it), so the notes keep to the music
// even when frames come late, and a tap from tap(lane, time) is judged at the song time given (the page passes its event's time).
// Where the taps come from is the page's business: the canvas's pointers and the keyboard here, a phone later (Fjölspil).

import { danceGrid, beatAt } from '../beat.js';
import { HIT_WINDOW, NEAR_WINDOW, STAR_SHARES, createJudge, createScore, count, shareOf, starsFor, tierOf } from './chart.js';

const WORDS = ['', 'Flott!', 'Vá!', 'Frábært!']; // a run reaching tier 1, 2, 3 (a six-year-old is starting to read: short words)
const MORE = ['Áfram svona!', 'Stórkostlegt!', 'Ótrúlegt!']; // every eight hits further on
const END_WORDS = ['Spilum aftur saman!', 'Vel gert!', 'Flott!', 'Frábært!'];
const END_AFTER = 1.2; // s after the last note before the round ends
const STAR_GAP = 0.75; // s between the stars rising at the end

/**
 * A round. `canvas` to draw on; `cast` one entry a lane, left to right ({ role, name, hue, light, dark, image }); `notes` the
 * sheet's notes, each with its `lane`; `fall` how long a note takes to fall; `song` the song's grid ({ bpm, beatOffset,
 * danceBeats }); `clock` its clock; `sounds` the instruments (sounds.js); `audience` images ({ image, big }); `random`.
 * Returns { tap(lane, time), frame(), resize(), state(), finish() }; frame() is called every animation frame; `onEnd(result)`
 * when the stars have risen.
 */
export function createSongGame({ canvas, cast, notes, fall, song, clock, sounds, audience = [], random = Math.random, onEnd = () => {}, debug = false }) {
  const ctx = canvas.getContext('2d');
  const lanes = cast.length;
  const judge = createJudge(notes);
  const score = createScore(notes.length);
  const dance = danceGrid({ bpm: song.bpm, beatOffset: song.beatOffset, danceBeats: song.danceBeats ?? 2 });
  const first = notes[0]?.t ?? 0;
  const last = notes.at(-1)?.t ?? 0;

  let w = 0, h = 0, dpr = 1, portrait = false;
  let laneW = 0, laneX = [], dinoR = 0, hitY = 0, topY = 0, seats = [], bar = null;
  let background = null; // the sky and the lanes, drawn once a size
  let glows = []; // a note's glow, one a lane
  let buttons = []; // a dinosaur's round button, one a lane
  let spark = null; // a little four-pointed star
  const twinkles = Array.from({ length: 70 }, () => ({ x: random(), y: random() * 0.62, r: 0.6 + random() * 1.6, phase: random() * 6.28, tier: Math.floor(random() * 4) }));

  // what is moving: bursts of sparks, rings, hops, floating notes, words, falling stars
  const sparks = [];
  const rings = [];
  const hops = new Array(lanes).fill(-Infinity); // the song time each dinosaur last hopped
  const flashes = new Array(lanes).fill(-Infinity); // the song time each lane was last tapped
  const floaters = [];
  const words = [];
  const shooting = [];
  let starsLit = 0; // markers lit on the bar
  let cheerAt = -Infinity; // the last time the audience jumped for a run
  let phase = 'play'; // 'play' → 'end' (the stars rise) → 'done'
  let endAt = null; // song time the end began
  let endStars = 0;
  let starsShown = 0;
  let lastTime = 0;
  let fps = { frames: 0, since: 0, value: 0 };

  // ---------------------------------------------------------------------------------------------------------------------------
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
    // the bar and its stars at the top, the audience on both sides (in a wide screen) or along the top (upright)
    const barW = Math.min(w * (portrait ? 0.7 : 0.42), 520);
    bar = { x: (w - barW) / 2, y: Math.max(22, h * 0.045), w: barW, h: Math.max(18, Math.min(26, h * 0.03)) };
    topY = bar.y + bar.h + (portrait ? h * 0.12 : h * 0.06);
    seats = [];
    const people = audience.length;
    if (portrait) {
      const r = Math.min(w / (people * 2.6), 40);
      for (let i = 0; i < people; i++) seats.push({ x: (w * (i + 0.5)) / people, y: bar.y + bar.h + r + 16, r: r * (audience[i].big ? 1.2 : 1) });
    } else {
      const side = x0 - gap; // room each side of the lanes
      const r = Math.max(22, Math.min(side / 3.2, h * 0.075, 64));
      const half = Math.ceil(people / 2);
      for (let i = 0; i < people; i++) {
        const left = i < half;
        const k = left ? i : i - half;
        const n = left ? half : people - half;
        const y = h * 0.3 + (k * (h * 0.48)) / Math.max(1, n - 1);
        const inward = (k % 2 ? 0.62 : 0.38) * side;
        seats.push({ x: left ? inward : w - inward, y, r: r * (audience[i].big ? 1.2 : 1) });
      }
    }
    paintBackground();
    paintSprites();
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
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1b2150');
    sky.addColorStop(0.55, '#3d3b78');
    sky.addColorStop(0.85, '#6c578a');
    sky.addColorStop(1, '#8c6a8c');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // a soft hill of the festival's meadow along the bottom
    g.fillStyle = 'rgba(40, 70, 70, 0.55)';
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, h * 0.86);
    g.quadraticCurveTo(w * 0.5, h * 0.74, w, h * 0.86);
    g.lineTo(w, h);
    g.fill();
    // the lanes: soft light columns, warmer at the foot, ending in the dinosaur's circle
    for (let i = 0; i < lanes; i++) {
      const x = laneX[i] - laneW / 2;
      const column = g.createLinearGradient(0, topY, 0, hitY);
      column.addColorStop(0, 'rgba(255,255,255,0)');
      column.addColorStop(0.35, 'rgba(255,255,255,0.05)');
      column.addColorStop(1, hexAlpha(cast[i].hue, 0.28));
      g.fillStyle = column;
      roundRect(g, x, topY - 30, laneW, hitY - topY + 30, laneW * 0.3);
      g.fill();
      // a guide line down the middle, dotted, for the eye
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

  function paintSprites() {
    const size = laneW * 0.78;
    glows = cast.map(({ hue }) => {
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
    });
    buttons = cast.map(({ hue, light, image }) => {
      const pad = 12;
      const d = dinoR * 2 + pad * 2;
      const [c, g] = offscreen(d, d);
      const r = dinoR;
      g.save();
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
      g.restore();
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

  // ---------------------------------------------------------------------------------------------------------------------------
  // Play

  /** The step the lane's instrument plays for `note`: its own, or, for a note written for someone else, the nearest of hers. */
  function stepFor(role, note) {
    if (note.role === role) return note.step;
    const degree = ((note.step % 5) + 5) % 5;
    if (role === 'c') return degree >= 3 ? 3 : 0;
    if (role === 'b') return 5 + degree;
    return degree;
  }

  function burst(lane, great) {
    const x = laneX[lane], y = hitY;
    const many = great ? 18 : 11;
    for (let i = 0; i < many; i++) {
      const a = (i / many) * Math.PI * 2 + random() * 0.4;
      const speed = (great ? 260 : 190) * (0.6 + random() * 0.6);
      sparks.push({ x, y: y - dinoR * 0.2, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 120, life: 0, max: 0.55 + random() * 0.35, size: (great ? 22 : 16) * (0.7 + random() * 0.6) });
    }
    rings.push({ lane, at: lastTime, hue: cast[lane].hue, great });
  }

  function say(text, { x = w / 2, y = h * 0.4, size = 54, hue = '#fff6c8' } = {}) {
    words.push({ text, x, y, size, hue, at: lastTime });
    if (words.length > 3) words.shift();
  }

  /** A tap on `lane` at song time `time`. */
  function tap(lane, time = clock.time()) {
    if (phase !== 'play' || !(lane >= 0 && lane < lanes)) return null;
    const role = cast[lane].role;
    flashes[lane] = time;
    const result = judge.tap(lane, time);
    if (result.kind === 'hit') {
      sounds.play(role, stepFor(role, result.note));
      hops[lane] = time;
      burst(lane, result.great);
      floaters.push({ lane, at: time, wobble: random() * 2 - 1 });
      const tier = count(score, result);
      if (tier) {
        sounds.cheer(tier);
        cheerAt = time;
        say(WORDS[tier]);
      } else if (score.streak >= 24 && score.streak % 8 === 0) {
        sounds.cheer(3);
        cheerAt = time;
        say(MORE[(score.streak / 8) % MORE.length]);
      }
      const lit = STAR_SHARES.filter(least => shareOf(score) >= least).length;
      if (lit > starsLit) {
        starsLit = lit;
        sounds.sparkle(5 + lit * 2);
      }
    } else {
      // early, late or no note at all: she still plays, softly, so tapping is always music; a stray (no note near, while the
      // notes are coming) breaks the run
      sounds.play(role, role === 'b' ? 5 : 0, { soft: true });
      if (result.kind === 'stray' && time > first - 1 && time < last + NEAR_WINDOW) count(score, result);
    }
    return result;
  }

  function update(time, dt) {
    if (phase === 'play') {
      for (const index of judge.sweep(time)) count(score, { kind: 'miss', index });
      if (time > last + HIT_WINDOW + END_AFTER) {
        phase = 'end';
        endAt = time;
        endStars = starsFor(score);
      }
    } else if (phase === 'end') {
      const due = Math.min(endStars, Math.floor((time - endAt - 0.6) / STAR_GAP) + 1);
      while (starsShown < due) {
        starsShown++;
        sounds.star(starsShown);
      }
      if (time - endAt > 0.6 + STAR_GAP * Math.max(1, endStars) + 0.4) {
        phase = 'done';
        onEnd(result());
      }
    }
    for (const s of sparks) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 380 * dt;
      s.vx *= 1 - 1.5 * dt;
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life > sparks[i].max) sparks.splice(i, 1);
    // at the highest tier a star now and then shoots across the sky
    const tier = tierOf(score.streak);
    if (phase === 'play' && tier >= 3 && random() < dt * 0.6) shooting.push({ x: random() * w * 0.6, y: random() * h * 0.25, at: time });
    while (shooting.length && time - shooting[0].at > 1.2) shooting.shift();
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  // Draw

  function draw(time) {
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(background, 0, 0, w, h);
    const tier = tierOf(score.streak);
    const beat = beatAt(Math.max(0, time), dance);
    const pulse = Math.max(0, 1 - beat.phase * 3); // a flash on each danced beat, gone a third of the way through it

    // the sky twinkles, more of it the longer the run
    for (const star of twinkles) {
      if (star.tier > tier) continue;
      const a = 0.35 + 0.35 * Math.sin(time * 2.2 + star.phase) + pulse * 0.25 * (star.tier > 0 ? 1 : 0.4);
      g.globalAlpha = Math.max(0, Math.min(1, a));
      g.fillStyle = '#fff8dc';
      g.beginPath();
      g.arc(star.x * w, star.y * h, star.r * (1 + tier * 0.15), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    for (const s of shooting) {
      const p = (time - s.at) / 1.2;
      const x = s.x + p * w * 0.35, y = s.y + p * h * 0.12;
      const trail = g.createLinearGradient(x - 90, y - 30, x, y);
      trail.addColorStop(0, 'rgba(255,248,220,0)');
      trail.addColorStop(1, `rgba(255,248,220,${(1 - p) * 0.9})`);
      g.strokeStyle = trail;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x - 90, y - 30);
      g.lineTo(x, y);
      g.stroke();
    }

    // a tapped lane lights for a moment
    for (let i = 0; i < lanes; i++) {
      const since = time - flashes[i];
      if (since >= 0 && since < 0.25) {
        g.globalAlpha = (1 - since / 0.25) * 0.22;
        g.fillStyle = cast[i].hue;
        roundRect(g, laneX[i] - laneW / 2, topY, laneW, hitY - topY, laneW * 0.3);
        g.fill();
      }
    }
    g.globalAlpha = 1;

    drawAudience(g, time, beat, tier);
    drawNotes(g, time);
    drawDinosaurs(g, time, tier);
    drawEffects(g, time);
    drawBar(g, time);
    if (phase !== 'play') drawEnd(g, time);
    if (debug) drawDebug(g, time);
  }

  function drawNotes(g, time) {
    const span = hitY - topY;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const ahead = note.t - time;
      if (ahead > fall + 0.1) break;
      const state = judge.state(i);
      if (state === 'hit') continue;
      const gone = -ahead; // how long ago it reached the dinosaur
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
      const sprite = glows[note.lane];
      const size = laneW * 0.78 * scale;
      g.globalAlpha = Math.max(0, alpha);
      g.drawImage(sprite, laneX[note.lane] - size / 2, y - size / 2, size, size);
      // the note's mark at its heart
      g.fillStyle = cast[note.lane].dark;
      g.font = `900 ${Math.round(size * 0.24)}px Nunito, ui-rounded, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('♪', laneX[note.lane], y + size * 0.01);
    }
    g.globalAlpha = 1;
  }

  function drawDinosaurs(g, time, tier) {
    for (let i = 0; i < lanes; i++) {
      // a ring that brightens as the next note comes near, to say "now!"
      let soon = Infinity;
      for (let k = 0; k < notes.length; k++) {
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
      if (soon < 0.6 || tier >= 2) {
        const glow = Math.max(soon < 0.6 ? 1 - soon / 0.6 : 0, tier >= 2 ? 0.35 + 0.1 * tier : 0);
        g.globalAlpha = Math.min(1, glow);
        g.strokeStyle = '#fff6c8';
        g.lineWidth = 6 + glow * 6;
        g.shadowColor = cast[i].hue;
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
    }
  }

  function drawAudience(g, time, beat, tier) {
    const cheering = time - cheerAt < 1.2;
    const bounce = [3, 7, 12, 18][tier] + (cheering ? 16 : 0);
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      const own = audience[i];
      const offbeat = i % 2 ? 0.5 : 0; // half of them bounce between the others' beats
      const p = (beat.phase + offbeat) % 1;
      const up = Math.abs(Math.sin(p * Math.PI)) * bounce;
      const y = seat.y - up;
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.3)';
      g.shadowBlur = 8;
      g.fillStyle = '#fffaf0';
      g.beginPath();
      g.arc(seat.x, y, seat.r + 4, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.beginPath();
      g.arc(seat.x, y, seat.r, 0, Math.PI * 2);
      g.clip();
      const image = own.image;
      if (image?.naturalWidth) {
        const scale = (seat.r * 2 * (own.zoom ?? 1)) / Math.min(image.naturalWidth, image.naturalHeight);
        const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
        if (own.big) {
          g.fillStyle = '#e7ecd6';
          g.fillRect(seat.x - seat.r, y - seat.r, seat.r * 2, seat.r * 2);
        }
        g.drawImage(image, seat.x - iw / 2 + (own.dx ?? 0) * seat.r, y - ih / 2 + (own.dy ?? 0) * seat.r, iw, ih);
      }
      g.restore();
      // while they cheer, a few sparks go up from them
      if (cheering && tier >= 1) {
        const k = (time - cheerAt) / 1.2;
        g.globalAlpha = 1 - k;
        for (let j = 0; j < 3; j++) {
          const sx = seat.x + (j - 1) * seat.r * 0.7;
          const sy = y - seat.r - 10 - k * 60 - j * 8;
          g.drawImage(spark, sx - 9, sy - 9, 18, 18);
        }
        g.globalAlpha = 1;
      }
    }
  }

  function drawEffects(g, time) {
    for (const s of sparks) {
      const k = s.life / s.max;
      g.globalAlpha = 1 - k * k;
      const size = s.size * (1 - k * 0.4);
      g.drawImage(spark, s.x - size / 2, s.y - size / 2, size, size);
    }
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
    g.globalAlpha = 1;
    // the note she played floats up out of her
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
    // words
    for (let i = words.length - 1; i >= 0; i--) {
      const word = words[i];
      const k = (time - word.at) / 1.1;
      if (k > 1 || k < 0) { if (k > 1) words.splice(i, 1); continue; }
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.3);
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      outlined(g, word.text, word.x, word.y - k * 30, Math.round(word.size * pop), word.hue);
    }
    g.globalAlpha = 1;
    // the run, while there is one
    if (score.streak >= 3 && phase === 'play') {
      const y = bar.y + bar.h + (portrait ? 70 : 34);
      outlined(g, `${score.streak} í röð`, w / 2, portrait ? y + 40 : y, portrait ? 26 : 28, '#fff6c8');
    }
  }

  function drawBar(g, time) {
    const { x, y, w: bw, h: bh } = bar;
    const share = shareOf(score);
    g.fillStyle = 'rgba(20, 18, 50, 0.55)';
    roundRect(g, x - 4, y - 4, bw + 8, bh + 8, (bh + 8) / 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(g, x, y, bw, bh, bh / 2);
    g.fill();
    if (share > 0) {
      const fill = g.createLinearGradient(x, 0, x + bw, 0);
      fill.addColorStop(0, '#f2b630');
      fill.addColorStop(1, '#ffe27a');
      g.fillStyle = fill;
      roundRect(g, x, y, Math.max(bh, bw * share), bh, bh / 2);
      g.fill();
    }
    STAR_SHARES.forEach((least, i) => {
      const lit = share >= least;
      const sx = x + bw * least;
      star(g, sx, y + bh / 2, bh * (lit ? 1.05 : 0.85), lit ? '#f2b630' : 'rgba(255,255,255,0.35)', lit ? '#fff6c8' : 'rgba(255,255,255,0.5)');
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
      const shownAt = endAt + 0.6 + i * STAR_GAP;
      const won = i < endStars;
      const since = time - shownAt;
      if (won && since >= 0) {
        const pop = since < 0.25 ? 0.4 + (since / 0.25) * 0.8 : 1.2 - Math.min(0.2, (since - 0.25) * 0.8);
        star(g, sx, cy - (i === 1 ? size * 0.3 : 0), size * pop, '#f2b630', '#fff6c8', 6);
      } else star(g, sx, cy - (i === 1 ? size * 0.3 : 0), size * 0.9, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.35)', 4);
    }
    if (time - endAt > 0.6 + STAR_GAP * Math.max(1, endStars) - 0.2) {
      outlined(g, END_WORDS[endStars], w / 2, cy + size * 1.6, portrait ? 40 : 52, '#fff6c8');
      outlined(g, `Þú spilaðir ${score.hits} af ${score.total} tónum`, w / 2, cy + size * 1.6 + (portrait ? 50 : 60), portrait ? 24 : 30, '#e7e0ff');
    }
  }

  function drawDebug(g, time) {
    const offsets = score.offsets;
    const mean = offsets.length ? (offsets.reduce((a, b) => a + b, 0) / offsets.length) * 1000 : 0;
    const lines = [
      `tími ${time.toFixed(2)} s · ${fps.value} fps`,
      `seinkun hljóðs ${(clock.latency() * 1000).toFixed(0)} ms`,
      `hitt ${score.hits}/${score.total} · mis ${score.misses} · auka ${score.strays} · best ${score.best}`,
      `meðalskekkja ${mean >= 0 ? '+' : ''}${mean.toFixed(0)} ms (${offsets.length})`,
    ];
    g.font = '600 14px ui-monospace, monospace';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(8, h - 14 - lines.length * 18, 330, lines.length * 18 + 8);
    g.fillStyle = '#fff';
    lines.forEach((line, i) => g.fillText(line, 14, h - 10 - (lines.length - i) * 18));
  }

  // ---------------------------------------------------------------------------------------------------------------------------

  function result() {
    return { stars: starsFor(score), share: shareOf(score), hits: score.hits, total: score.total, misses: score.misses, strays: score.strays, best: score.best, great: score.great };
  }

  let lastPerf = null;
  resize();
  return {
    tap,
    resize,
    /** One animation frame: the song's time from the clock, the round moved on to it, and drawn. */
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
    /** The lane under a point on the canvas (CSS pixels), or -1 when it is far from every lane. */
    laneAt(x) {
      let best = -1, gap = Infinity;
      laneX.forEach((lx, i) => { const d = Math.abs(x - lx); if (d < gap) { gap = d; best = i; } });
      return gap <= laneW * 0.9 ? best : -1;
    },
    state: () => ({ phase, time: lastTime, score: { ...score, offsets: undefined }, stars: starsFor(score), share: shareOf(score), tier: tierOf(score.streak) }),
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

/** A five-pointed star of radius `r` at (x, y). */
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

/** Big words with a dark outline, centred at (x, y). */
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

/** `#rrggbb` as rgba with `alpha`. */
function hexAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
