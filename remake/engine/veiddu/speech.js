import { createVoice } from '../scene/voice.js';
import { SEAT } from './minds.js';

// The voices of "Veiddu" (spec section 6): one line at a time, the lines of the veiddu set in lines.json (assets/audio/veiddu/).
// Eitt!'s queue (eitt/table.js: say, nextLine, voiceGuard) made a module of its own, so the order and the manners of the voices can be
// tested without a page. The table (table.js) asks for a line by its id and gets back the seconds until it will have been said.
//
//   - One voice at a time. A line asked for while another speaks waits until it has ended, and the lines waiting go in order of who
//     matters most (priorityOf): Egill's own, then Mosi's advice and the tutorial, then the asks and answers of the game, then chatter.
//   - A line that waits too long (`within`, ms) or is no longer true when its turn comes (`still()`) is dropped. A newer piece of
//     Mosi's advice takes the place of one still waiting, and a line asked for twice waits once.
//   - A line that is not recorded yet, or a muted game, is not said: its `onStart` runs at once and it takes no time (0 seconds).
//   - A voice whose end never comes (a file that stalls, an element that never reports) is stopped after its length and GUARD_MS,
//     so the game never hangs on it.
//   - The music ducks while a line sounds (onDuck), and `onLine({ id, line, sound })` says when a line begins (sound: true) or is
//     passed over silently (sound: false; line is null when it is not recorded), which is where Uggeðla's mouth is moved.

/** How long past its length a voice may go on before it is stopped (ms). */
export const GUARD_MS = 1500;

/** The line ids' speakers by seat (minds.js SEAT). */
const SPEAKERS = [];
SPEAKERS[SEAT.child] = 'egill';
SPEAKERS[SEAT.uggedla] = 'uggedla';
SPEAKERS[SEAT.mosi] = 'mosi';

const part = text => text.replaceAll('-', '_'); // a kind id's dash is an underscore in a line id ('fiskur-raudur' -> 'fiskur_raudur')

/** Egill reads the name of the card he lifts. */
export const nameLine = kind => `veiddu_egill_name_${part(kind)}`;
/** `seat` asks "Áttu ...?" for `kind`. */
export const askLine = (seat, kind) => `veiddu_${SPEAKERS[seat]}_ask_${part(kind)}`;
/** `seat` answers: 'yes' (Já, gjörðu svo vel!), 'no' (Nei! Farðu að veiða!) or 'lucky' (Ég veiddi það!). */
export const answerLine = (seat, answer) => `veiddu_${SPEAKERS[seat]}_${answer}`;
/** Mosi's reason for the card he means, as bestAsk names it ('they-asked', 'mosi-asked', 'guess', 'fish'). */
export const whyLine = reason => `veiddu_mosi_why_${part(reason)}`;
export const HINT_LINE = 'veiddu_mosi_give_hint'; // Mosi: the child holds the animal asked for and has not given it
export const EMPTY_LINE = 'veiddu_uggedla_empty'; // Uggeðla: the pond is empty
export const NUDGE_LINE = 'veiddu_uggedla_your_turn'; // Uggeðla: the child's turn has waited

/**
 * The line that ends a round. One winner says "Ég vann!" and, when it is the child, the other two take turns at "Þú vannst! Vel
 * gert!" (Uggeðla on the first round, whose sticker it is); on a tie Mosi says "Jafntefli! Við unnum saman!". `round` is how many
 * rounds have been dealt.
 */
export function endLine(winners, round) {
  if (winners.length > 1) return 'veiddu_mosi_tie';
  const [winner] = winners;
  if (winner === SEAT.child) return `veiddu_${round % 2 ? 'uggedla' : 'mosi'}_you_won`;
  return `veiddu_${SPEAKERS[winner]}_won`;
}

/** Whether the line is Uggeðla's: her mouth follows it. */
export const isHers = id => id.startsWith('veiddu_uggedla_');

/**
 * Who is heard first when lines wait: 3 Egill's own lines (the names, his asks and answers), 2 Mosi's advice and the tutorial,
 * 1 the asks and answers and the ends of the game, 0 chatter ("Þú átt leik, Egill!").
 */
export function priorityOf(id) {
  if (id.startsWith('veiddu_egill_')) return 3;
  if (/^veiddu_(mosi_why_|mosi_give_hint$|tut_)/.test(id)) return 2;
  if (id === NUDGE_LINE) return 0;
  return 1;
}

const defaultClock = () => globalThis.performance?.now?.() ?? Date.now();

/**
 * The speech of one table. `lines` is lines.json ({ id: { src, duration, mouth } }); a line's `src` is resolved against `base`. The
 * rest is for tests: the voice (a createVoice's shape), the clock (ms) and the timers.
 * Returns
 *   say(id, { still, within, onStart })   says a line now or once the one sounding has ended; returns the seconds until it will have been said
 *   cut(priority)   drops the lines waiting at that priority and stops the one sounding if it has it; true when it stopped one
 *   hush()          drops every line waiting (the one sounding ends by itself)
 *   stop()          drops them all and stops the one sounding
 *   preload(prefix) fetches the recorded lines whose id starts with prefix ahead, in the background
 *   talking, current ({ id, priority } or null), waiting (how many), muted
 */
export function createSpeech({
  lines = {}, base = import.meta.url, makeVoice = createVoice, clock = defaultClock,
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id), onDuck = null, onLine = null, muted: startMuted = false,
} = {}) {
  let talking = false; // a line is sounding
  let voiceUntil = 0; // and ends about then (clock ms)
  let guard = null;
  let current = null; // the item sounding: { id, line, priority, still, by, onStart }
  let muted = false;
  const queue = []; // the lines waiting, the next first
  const voice = makeVoice({
    onSpeaking: on => {
      onDuck?.(on);
      talking = on;
      if (!on) {
        current = null;
        nextLine();
      }
    },
  });

  function startLine(item) {
    const seconds = item.line.duration ?? 1;
    voiceUntil = clock() + seconds * 1000;
    clearTimer(guard);
    guard = setTimer(() => { if (talking) voice.stop(); else nextLine(); }, seconds * 1000 + GUARD_MS); // its end never came: go on
    current = item;
    voice.play(new URL(item.line.src, base).href);
    onLine?.({ id: item.id, line: item.line, sound: true });
    item.onStart?.();
  }

  /** The line that was sounding is over: the next one waiting that is still worth saying begins. */
  function nextLine() {
    clearTimer(guard);
    voiceUntil = 0;
    while (queue.length && !talking) {
      const item = queue.shift();
      if ((item.by !== null && clock() > item.by) || (item.still && !item.still())) continue;
      startLine(item);
    }
  }

  function say(id, { still = null, within = null, onStart = null } = {}) {
    const line = lines[id];
    if (!line?.src || muted) {
      onLine?.({ id, line: line ?? null, sound: false });
      onStart?.();
      return 0;
    }
    const item = { id, line, priority: priorityOf(id), still, by: within === null ? null : clock() + within, onStart };
    if (!talking && !queue.length) {
      startLine(item);
      return line.duration ?? 0;
    }
    for (let k = queue.length - 1; k >= 0; k--) if (queue[k].id === id || (item.priority === 2 && queue[k].priority === 2)) queue.splice(k, 1);
    const at = queue.findIndex(waiting => waiting.priority < item.priority);
    queue.splice(at < 0 ? queue.length : at, 0, item);
    let ms = Math.max(0, voiceUntil - clock());
    for (const ahead of queue) {
      if (ahead === item) break;
      ms += (ahead.line.duration ?? 0) * 1000;
    }
    return ms / 1000 + (line.duration ?? 0);
  }

  function cut(priority) {
    for (let k = queue.length - 1; k >= 0; k--) if (queue[k].priority === priority) queue.splice(k, 1);
    if (talking && current?.priority === priority) {
      voice.stop();
      return true;
    }
    return false;
  }

  const hush = () => { queue.length = 0; };

  function stop() {
    queue.length = 0;
    clearTimer(guard);
    voiceUntil = 0;
    voice.stop();
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (muted) queue.length = 0;
    voice.muted = muted;
  }
  setMuted(startMuted);

  return {
    say,
    cut,
    hush,
    stop,
    preload: (prefix = 'veiddu_') => voice.preload?.(Object.keys(lines).filter(id => id.startsWith(prefix) && lines[id]?.src).map(id => new URL(lines[id].src, base).href)),
    get talking() { return talking; },
    get current() { return current ? { id: current.id, priority: current.priority } : null; },
    get waiting() { return queue.length; },
    get muted() { return muted; },
    set muted(value) { setMuted(value); },
  };
}
