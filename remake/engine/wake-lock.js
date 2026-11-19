// Keeps a tablet or phone screen from dimming and going to sleep while a scene, book or game is played
// (Screen Wake Lock API, navigator.wakeLock). Browsers release a screen lock automatically whenever the tab
// or installed app goes into the background, and some wait for a touch before granting one, so the lock is
// asked for again whenever the page comes back into view, regains focus or is touched while active.

const WAKE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'];

export function keepScreenAwake({
  doc = globalThis.document,
  win = doc?.defaultView ?? globalThis.window,
  active = true,
} = {}) {
  let wanted = Boolean(active);
  let sentinel = null;
  let asking = false;
  let disposed = false;

  const isHidden = () => Boolean(doc?.hidden || doc?.visibilityState === 'hidden');

  function releaseNow() {
    const held = sentinel;
    sentinel = null;
    held?.release?.()?.catch?.(() => {});
  }

  function acquire() {
    if (disposed || !wanted || isHidden() || asking || (sentinel && !sentinel.released)) return;
    const wakeLock = win?.navigator?.wakeLock;
    if (typeof wakeLock?.request !== 'function') return;
    asking = true;
    let request;
    try {
      request = wakeLock.request('screen');
    } catch {
      asking = false;
      return;
    }
    Promise.resolve(request).then(lock => {
      asking = false;
      if (!lock) return;
      if (disposed || !wanted || isHidden()) {
        lock.release?.()?.catch?.(() => {});
        return;
      }
      sentinel = lock;
      lock.addEventListener?.('release', () => {
        if (sentinel === lock) sentinel = null;
      });
    }).catch(() => {
      asking = false;
    });
  }

  function setActive(on) {
    if (disposed) return;
    wanted = Boolean(on);
    if (wanted) acquire();
    else releaseNow();
  }

  const onWake = () => { if (!isHidden()) acquire(); };

  for (const type of WAKE_EVENTS) doc?.addEventListener?.(type, onWake, { capture: true, passive: true });
  doc?.addEventListener?.('visibilitychange', onWake);
  win?.addEventListener?.('visibilitychange', onWake);
  win?.addEventListener?.('pageshow', onWake);
  win?.addEventListener?.('focus', onWake);

  if (wanted) acquire();

  function dispose() {
    if (disposed) return;
    disposed = true;
    wanted = false;
    for (const type of WAKE_EVENTS) doc?.removeEventListener?.(type, onWake, { capture: true });
    doc?.removeEventListener?.('visibilitychange', onWake);
    win?.removeEventListener?.('visibilitychange', onWake);
    win?.removeEventListener?.('pageshow', onWake);
    win?.removeEventListener?.('focus', onWake);
    releaseNow();
  }

  return {
    acquire,
    setActive,
    dispose,
    get active() { return Boolean(sentinel && !sentinel.released); },
    get wanted() { return wanted; },
  };
}
