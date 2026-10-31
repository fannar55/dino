// The rules of the app's download (docs/superpowers/specs/2026-10-31-forrit-an-nets-design.md §7), apart from the browser so
// they can be tested: the line under Byrja in the owner's words, which files are still to fetch, how far the download is, which
// stored files no list uses any more, and who downloads at all. forrit.js runs the download with them.
//
// A list is the cloud's offline.json: { version, files: { '/remake/…': { size, hash } } }. `stored` is the set of fingerprints
// already in the device's store.

const NB = ' '; // a no-break space, so the number and its % stay on one line

/** The line under Byrja for a phase of the download: 'first', 'update', 'ready', 'needNet' or 'full'. */
export function lineFor({ phase, percent = 0 }) {
  switch (phase) {
    case 'first': return `Sæki leikinn í tækið … ${percent}${NB}%`;
    case 'update': return `Sæki nýja útgáfu … ${percent}${NB}%`;
    case 'ready': return 'Tilbúinn án nets ✓';
    case 'needNet': return `Vantar net til að klára (${percent}${NB}%)`;
    case 'full': return 'Ekki nóg pláss í tækinu';
    default: return '';
  }
}

/** The files still to fetch: one per fingerprint not yet stored, under the first path that has it. */
export function missingOf(list, stored) {
  const wanted = new Map();
  for (const path of Object.keys(list.files).sort()) {
    const { size, hash } = list.files[path];
    if (!stored.has(hash) && !wanted.has(hash)) wanted.set(hash, { path, size, hash });
  }
  return [...wanted.values()];
}

/** How far the download is, in whole percent of the list's bytes: 100 only when every file is stored (or the list is empty). */
export function percentOf(list, stored) {
  const files = Object.values(list.files);
  if (files.every(({ hash }) => stored.has(hash))) return 100;
  const total = files.reduce((sum, { size }) => sum + size, 0);
  const have = files.reduce((sum, { size, hash }) => sum + (stored.has(hash) ? size : 0), 0);
  return total ? Math.min(99, Math.floor((have / total) * 100)) : 0;
}

/** The stored fingerprints that none of `lists` uses. */
export function unusedOf(stored, lists) {
  const used = new Set(lists.flatMap(list => Object.values(list.files).map(({ hash }) => hash)));
  return [...stored].filter(hash => !used.has(hash));
}

const isLocal = location => location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const forritParam = location => new URLSearchParams(location.search).get('forrit');
const shownAs = (win, display) => Boolean(win.matchMedia?.(`(display-mode: ${display})`)?.matches);

/** Whether the game runs as the installed app (full screen or standalone, or the iPad's home-screen app), or as the walk's stand-in. */
export function isInstalled(win) {
  if (shownAs(win, 'fullscreen') || shownAs(win, 'standalone') || win.navigator?.standalone === true) return true;
  return isLocal(win.location) && forritParam(win.location) === 'uppsett';
}

/** Whether the page may register the service worker: in the cloud (https), or at home only when asked to with ?forrit=. */
export function mayRegister(win) {
  if (!win.navigator?.serviceWorker) return false;
  if (win.location.protocol === 'https:') return true;
  return isLocal(win.location) && ['1', 'uppsett'].includes(forritParam(win.location));
}
