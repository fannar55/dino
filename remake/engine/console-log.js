// The last lines the console was given, kept for the bug report (engine/villa): what console.log, info, warn, error and debug were
// told, uncaught errors and unhandled promise rejections, each with the time since the page began, in a ring of `limit` entries.
// main.js installs it before anything else says a word, so what a frame said before the owner pressed F1 is in the report.
// The console itself goes on as before: every line still reaches the browser's own console.

/** Installs the ring on `con` and `win`; returns { entries(), clear() }. `now` is for tests. */
export function installConsoleLog({ limit = 300, con = console, win = globalThis, now = () => performance.now() } = {}) {
  const entries = [];
  const t0 = now();
  function push(level, text) {
    entries.push({ t: Math.round(now() - t0), level, text });
    if (entries.length > limit) entries.splice(0, entries.length - limit);
  }
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = typeof con[level] === 'function' ? con[level].bind(con) : null;
    if (!original) continue;
    con[level] = (...args) => {
      try { push(level, args.map(value => describe(value)).join(' ')); } catch { /* the report never breaks the console */ }
      original(...args);
    };
  }
  win.addEventListener?.('error', event => {
    const where = event.filename ? ` (${event.filename.split('/').pop()}:${event.lineno}:${event.colno})` : '';
    push('uncaught', describe(event.error ?? event.message) + where);
  });
  win.addEventListener?.('unhandledrejection', event => push('unhandled', describe(event.reason)));
  return {
    /** The entries, oldest first, as copies: { t (ms since the page began), level, text }. */
    entries: () => entries.map(entry => ({ ...entry })),
    clear() { entries.length = 0; },
  };
}

/** One console argument as a line of text: an Error with its first stack lines, an object as JSON (cut at `max` characters). */
export function describe(value, max = 600) {
  if (value instanceof Error) {
    const stack = String(value.stack || '').split('\n').slice(1, 4).map(line => line.trim()).join(' < ');
    return `${value.name}: ${value.message}${stack ? ` [${stack}]` : ''}`;
  }
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}…` : value;
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return `[function ${value.name || ''}]`;
  let text;
  try {
    text = JSON.stringify(value, (key, inner) => (typeof inner === 'bigint' ? `${inner}n` : inner));
  } catch {
    text = String(value); // circular, or something JSON cannot say
  }
  if (text === undefined) text = String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
