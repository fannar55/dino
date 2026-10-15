import { seededRandom } from './random.js';

// Talking: while a character speaks a line (scene.say), its mouth follows the voice and its head moves
// a little with it. The voice is the line's mouth track: how loud it is, 20 times a second, one hex
// digit a frame (0 shut, f wide open). Recorded lines have theirs in remake/assets/audio/lines.json
// (tools/audio-lines.mjs measures it); a line without a recording gets one from its text
// (mouthFromText), so captions alone still move the mouth in time.
//
// createTalk is the timing alone, on the game clock: say() starts a line, update(dt) returns the
// pose to lay on top of the clip, and the actor turns the bones (actor.js): the jaw opens with the
// voice (a character with a Jaw bone, such as Grameðla), the head dips a little on the loud, stressed
// parts and rises in the pauses, and tilts gently from side to side while the line goes on. A
// character without a jaw talks with its head alone, until it has a mouth that can open.

export const MOUTH_RATE = 20; // frames a second
export const TALK = {
  jaw: 10, // degrees the jaw opens at the loudest (Grameðla's roar opens 26)
  shape: 1.4, // the jaw opens as the loudness to this power, so it shuts between syllables
  nod: 1.6, // degrees the head dips with the line's loudness
  beat: 1.4, // degrees more on a stressed syllable, above the line's running loudness
  tilt: 1.3, // degrees of gentle side-to-side tilt while speaking
  attack: 0.035, // seconds: how fast the mouth opens on a sound
  release: 0.07, // and closes after it
  follow: 0.32, // seconds: the head's slower following of the loudness
  ease: 0.18, // seconds to start and to settle after the line
};

const VOWELS = /[aáeéiíoóuúyýæöAÁEÉIÍOÓUÚYÝÆÖ]+/g;

/**
 * A mouth track for a line without a recording, from its text and the time it takes: its syllables
 * (vowel groups) spread over the line, with breaths at commas and full stops; the first syllable of a
 * word is the loudest (Icelandic stresses the first syllable). The same text gives the same track.
 */
export function mouthFromText(text, duration) {
  const frames = Math.max(1, Math.round(duration * MOUTH_RATE));
  const random = seededRandom(text);
  const beats = []; // { pause } or { loud }
  for (const token of text.split(/(\s+|[,.;:!?…]+)/).filter(Boolean)) {
    if (/^[,;:]+$/.test(token)) beats.push({ pause: 0.22 });
    else if (/^[.!?…]+$/.test(token)) beats.push({ pause: 0.4 });
    else if (/\S/.test(token)) {
      const syllables = Math.max(1, (token.match(VOWELS) || []).length);
      for (let k = 0; k < syllables; k++) beats.push({ loud: k === 0 ? 0.85 + 0.15 * random() : 0.5 + 0.3 * random() });
    }
  }
  while (beats.length && beats.at(-1).pause) beats.pop();
  const paused = beats.reduce((sum, b) => sum + (b.pause || 0), 0);
  const syllables = beats.filter(b => b.loud).length;
  // Pauses give way first if the line is short for its words.
  const squeeze = Math.min(1, (0.75 * duration) / Math.max(paused, 1e-6));
  const each = Math.max(0.08, (duration - paused * squeeze) / Math.max(1, syllables));
  const open = new Float32Array(frames);
  let t = 0;
  for (const b of beats) {
    if (b.pause) { t += b.pause * squeeze; continue; }
    // A syllable: the mouth opens fast and closes a little before the next one.
    for (let f = Math.floor(t * MOUTH_RATE); f < Math.min(frames, Math.ceil((t + each) * MOUTH_RATE)); f++) {
      const x = (f / MOUTH_RATE - t) / each;
      if (x < 0 || x > 1) continue;
      open[f] = Math.max(open[f], b.loud * Math.sin(Math.PI * Math.min(1, x / 0.85)) ** 0.6);
    }
    t += each;
  }
  return Array.from(open, v => Math.round(Math.min(1, v) * 15).toString(16)).join('');
}

/** How open a mouth track is at time t (0 to 1), between its frames. */
export function mouthAt(mouth, t) {
  if (!mouth || t < 0) return 0;
  const x = t * MOUTH_RATE;
  const i = Math.floor(x);
  if (i >= mouth.length) return 0;
  const a = parseInt(mouth[i], 16) / 15;
  const b = i + 1 < mouth.length ? parseInt(mouth[i + 1], 16) / 15 : 0;
  return a + (b - a) * (x - i);
}

/**
 * The talking of one character. say({ mouth, duration, text }) starts a line and returns its token;
 * stop(token) ends it (only that line: a newer one goes on). update(dt) returns the pose to lay on the
 * clip, in radians: { jaw (opening), nod (head down), tilt (head to its right) }, or null when quiet.
 */
export function createTalk(options = {}) {
  const k = { ...TALK, ...options };
  const rad = Math.PI / 180;
  let line = null;
  let tokens = 0;
  let weight = 0; // eases in at a line's start and out after it
  let fast = 0; // the mouth: follows the voice quickly
  let slow = 0; // the head: follows it slowly
  let time = 0; // runs while speaking, for the tilt
  const pose = { jaw: 0, nod: 0, tilt: 0 };

  return {
    get speaking() { return Boolean(line); },
    /** How open the mouth is now (0 to 1). */
    get open() { return fast * weight; },
    say({ mouth = null, duration = 0, text = '' } = {}) {
      const track = mouth || (text ? mouthFromText(text, duration) : null);
      line = { mouth: track, duration: duration || (track ? track.length / MOUTH_RATE : 0), t: 0, token: ++tokens };
      return line.token;
    },
    stop(token) { if (line && (token === undefined || token === line.token)) line = null; },
    update(dt) {
      let target = 0;
      if (line) {
        line.t += dt;
        target = mouthAt(line.mouth, line.t);
        if (line.t >= line.duration) line = null;
      }
      const speaking = Boolean(line);
      weight += ((speaking ? 1 : 0) - weight) * (1 - Math.exp(-dt / k.ease));
      fast += (target - fast) * (1 - Math.exp(-dt / (target > fast ? k.attack : k.release)));
      slow += (target - slow) * (1 - Math.exp(-dt / k.follow));
      if (!line && weight < 0.01 && fast < 0.01) { weight = 0; fast = 0; slow = 0; time = 0; return null; }
      time += dt;
      pose.jaw = k.jaw * rad * fast ** k.shape * Math.min(1, weight * 1.5);
      pose.nod = (k.nod * slow + k.beat * Math.max(0, fast - slow)) * rad * weight;
      pose.tilt = k.tilt * rad * Math.sin(2 * Math.PI * 0.23 * time) * weight;
      return pose;
    },
  };
}
