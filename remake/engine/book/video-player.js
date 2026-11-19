import { pressable, reducedMotion, sparkle } from './fx.js';
import { ICONS } from './icons.js';

// The book's video player: a warm, illustrated frame over the spread (#book) that grows out of the video tile (or the card's
// video button) and plays a short educational MP4 from /myndbond/<id>.mp4. All controls are chunky 88 px targets for a six-year-old:
// a big play/pause button on the bar, a central play button when paused, a wide scrubbing bar with a round thumb, and the top-right
// close button. Opening a video stops the book's narrator so the two never speak at once, and closing pauses and unloads the stream.

const GROW_MS = 440;
const SHRINK_MS = 260;
const FADE_MS = 160;
const SAFETY_MS = 300;
const GROW_EASE = 'cubic-bezier(.3, .72, .3, 1.07)';
const SHRINK_EASE = 'cubic-bezier(.5, 0, .8, .3)';
const LIFT = 'translateY(28px) scale(.86)';

export function formatVideoTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function createVideoPlayer(doc, root, { audio = null, win = globalThis.window, onClose = null } = {}) {
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  const control = (className, label, icon = '') => {
    const element = make('button', className);
    element.setAttribute('type', 'button');
    element.setAttribute('aria-label', label);
    element.innerHTML = icon;
    return element;
  };

  const closeButton = control('video-close chunky', 'Loka myndbandi', ICONS.close);
  const screen = make('video', 'video-screen');
  screen.setAttribute('playsinline', '');
  screen.setAttribute('preload', 'metadata');
  screen.playsInline = true;
  const centerPlay = control('video-center-play chunky', 'Spila myndband', ICONS.play);
  const stage = make('div', 'video-stage');
  stage.append(screen, centerPlay);

  const toggleButton = control('video-toggle chunky', 'Spila myndband', ICONS.play);
  const title = make('h2', 'video-title');
  const fill = make('div', 'video-fill');
  const thumb = make('div', 'video-thumb');
  const track = make('div', 'video-track');
  track.append(fill, thumb);
  const time = make('span', 'video-time');
  time.textContent = '0:00 / 0:00';
  const meta = make('div', 'video-meta');
  meta.append(title, time);
  const progress = make('div', 'video-progress');
  progress.setAttribute('role', 'slider');
  progress.setAttribute('aria-label', 'Staða í myndbandi');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  progress.setAttribute('aria-valuenow', '0');
  progress.append(meta, track);

  const bar = make('div', 'video-bar');
  bar.append(toggleButton, progress);

  const frame = make('div', 'video-frame');
  frame.append(closeButton, stage, bar);

  const player = make('section', 'video-player');
  player.setAttribute('role', 'dialog');
  player.setAttribute('aria-modal', 'true');
  player.hidden = true;
  player.append(frame);
  root.append(player);

  let current = null;
  let isOpen = false;
  let playing = false;
  let origin = null;
  let motion = null;
  let scrubbing = null; // pointerId while dragging the progress bar

  const canAnimate = () => typeof frame.animate === 'function';

  function setPlaying(next) {
    playing = Boolean(next);
    player.classList.toggle('playing', playing);
    player.classList.toggle('paused', !playing);
    centerPlay.hidden = playing;
    toggleButton.innerHTML = playing ? ICONS.pause : ICONS.play;
    toggleButton.setAttribute('aria-label', playing ? 'Gera hlé á myndbandi' : 'Spila myndband');
  }

  function syncTime() {
    const cur = Number.isFinite(screen.currentTime) && screen.currentTime > 0 ? screen.currentTime : 0;
    const dur = Number.isFinite(screen.duration) && screen.duration > 0 ? screen.duration : 0;
    const ratio = dur > 0 ? Math.max(0, Math.min(1, cur / dur)) : 0;
    const pct = `${(ratio * 100).toFixed(2)}%`;
    fill.style.setProperty('width', pct);
    thumb.style.setProperty('left', pct);
    progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    time.textContent = `${formatVideoTime(cur)} / ${formatVideoTime(dur)}`;
  }

  function playMedia() {
    if (!isOpen) return;
    const dur = Number.isFinite(screen.duration) && screen.duration > 0 ? screen.duration : 0;
    if (screen.ended || (dur > 0 && screen.currentTime >= dur)) {
      try { screen.currentTime = 0; } catch {}
    }
    if (typeof screen.play === 'function') {
      setPlaying(true);
      const promise = screen.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {
          if (isOpen) setPlaying(false);
        });
      }
    } else {
      screen.paused = false;
      screen.ended = false;
      setPlaying(true);
    }
  }

  function pauseMedia() {
    if (typeof screen.pause === 'function') {
      try { screen.pause(); } catch {}
    } else {
      screen.paused = true;
    }
    setPlaying(false);
  }

  function toggle() {
    if (!isOpen) return false;
    audio?.sfx?.('tap');
    if (playing) pauseMedia();
    else playMedia();
    return playing;
  }

  function seek(seconds) {
    if (!isOpen) return false;
    const dur = Number.isFinite(screen.duration) && screen.duration > 0 ? screen.duration : 0;
    const target = dur > 0 ? Math.max(0, Math.min(dur, seconds)) : Math.max(0, seconds);
    try {
      screen.currentTime = target;
    } catch {}
    syncTime();
    return true;
  }

  function scrubAt(clientX) {
    const rect = track.getBoundingClientRect();
    const box = rect.width > 0 ? rect : progress.getBoundingClientRect();
    if (!(box.width > 0)) return;
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const dur = Number.isFinite(screen.duration) && screen.duration > 0 ? screen.duration : 0;
    if (dur > 0) seek(ratio * dur);
  }

  progress.addEventListener('pointerdown', event => {
    if (!isOpen || event.button > 0) return;
    scrubbing = event.pointerId;
    progress.setPointerCapture?.(event.pointerId);
    scrubAt(event.clientX);
  });
  progress.addEventListener('pointermove', event => {
    if (scrubbing !== event.pointerId || !isOpen) return;
    scrubAt(event.clientX);
  });
  const endScrub = event => {
    if (scrubbing !== event.pointerId) return;
    scrubbing = null;
    progress.releasePointerCapture?.(event.pointerId);
  };
  progress.addEventListener('pointerup', endScrub);
  progress.addEventListener('pointercancel', endScrub);

  screen.addEventListener('play', () => { if (isOpen) setPlaying(true); });
  screen.addEventListener('playing', () => { if (isOpen) setPlaying(true); });
  screen.addEventListener('pause', () => { if (isOpen && !screen.ended) setPlaying(false); });
  screen.addEventListener('ended', () => {
    if (!isOpen) return;
    setPlaying(false);
    sparkle(toggleButton, 10, win);
  });
  screen.addEventListener('timeupdate', () => { if (isOpen) syncTime(); });
  screen.addEventListener('loadedmetadata', () => { if (isOpen) syncTime(); });
  screen.addEventListener('durationchange', () => { if (isOpen) syncTime(); });

  // ---- Motion ------------------------------------------------------------------------------------------------------

  function here() {
    if (!motion || !win?.getComputedStyle) return null;
    return { transform: win.getComputedStyle(frame).transform, opacity: Number(win.getComputedStyle(frame).opacity) };
  }

  function halt() {
    const at = here();
    for (const animation of motion?.animations ?? []) animation.cancel();
    motion = null;
    return at;
  }

  function over(rect) {
    const whole = frame.getBoundingClientRect();
    const picture = stage.getBoundingClientRect();
    if (!(rect?.width > 0) || !(picture.width > 0) || !(whole.width > 0)) return LIFT;
    const scale = rect.width / picture.width;
    const [cx, cy] = [whole.left + whole.width / 2, whole.top + whole.height / 2];
    const [px, py] = [picture.left + picture.width / 2, picture.top + picture.height / 2];
    const [ox, oy] = [rect.left + rect.width / 2, rect.top + rect.height / 2];
    return `translate(${(ox - cx - scale * (px - cx)).toFixed(1)}px, ${(oy - cy - scale * (py - cy)).toFixed(1)}px) scale(${scale.toFixed(4)})`;
  }

  function grow() {
    const at = halt();
    player.classList.remove('closing');
    if (!canAnimate()) return;
    const animations = reducedMotion(win)
      ? [frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS })]
      : [
        frame.animate([{ transform: at?.transform ?? over(origin) }, { transform: 'none' }], { duration: GROW_MS, easing: GROW_EASE }),
        frame.animate([{ opacity: at?.opacity ?? 0 }, { opacity: 1 }], { duration: GROW_MS * 0.35, easing: 'ease-out' }),
      ];
    const mine = { animations };
    motion = mine;
    const settle = () => { if (motion === mine) motion = null; };
    animations[0].onfinish = settle;
    setTimeout(settle, GROW_MS + SAFETY_MS)?.unref?.();
  }

  function finishClose() {
    halt();
    player.hidden = true;
    player.classList.remove('closing', 'playing', 'paused');
    screen.removeAttribute?.('src');
    screen.src = '';
    screen.load?.();
  }

  function shrink() {
    const at = halt();
    if (!canAnimate() || player.hidden) {
      finishClose();
      return;
    }
    player.classList.add('closing');
    const from = at?.opacity ?? 1;
    const animations = reducedMotion(win)
      ? [frame.animate([{ opacity: from }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' })]
      : [
        frame.animate([{ transform: at?.transform ?? 'none' }, { transform: over(origin) }], { duration: SHRINK_MS, easing: SHRINK_EASE, fill: 'forwards' }),
        frame.animate([{ opacity: from }, { opacity: from, offset: 0.55 }, { opacity: 0 }], { duration: SHRINK_MS, fill: 'forwards' }),
      ];
    const mine = { animations };
    motion = mine;
    const settle = () => { if (motion === mine) finishClose(); };
    animations[0].onfinish = settle;
    setTimeout(settle, SHRINK_MS + SAFETY_MS)?.unref?.();
  }

  function open(video, fromRect = null) {
    if (isOpen || !video?.src) return false;
    halt();
    scrubbing = null;
    audio?.stop?.();
    current = video;
    origin = fromRect;
    isOpen = true;
    player.setAttribute('data-video', video.id);
    player.setAttribute('aria-label', video.title ?? video.name ?? 'Myndband');
    frame.style.setProperty('--hue', video.hue ?? '#868862');
    title.textContent = video.title ?? video.name ?? '';
    screen.poster = video.poster ?? '';
    screen.src = video.src;
    try { screen.currentTime = 0; } catch {}
    syncTime();
    player.hidden = false;
    grow();
    playMedia();
    return true;
  }

  function close(instant = false) {
    if (!isOpen) return false;
    const shut = current;
    isOpen = false;
    scrubbing = null;
    pauseMedia();
    if (instant) finishClose();
    else shrink();
    onClose?.(shut);
    return true;
  }

  pressable(closeButton, { audio, win, onTap: () => close() });
  pressable(toggleButton, { audio, sound: null, win, onTap: () => toggle() });
  pressable(centerPlay, { audio, sound: null, win, onTap: () => toggle() });
  screen.addEventListener('click', () => { if (isOpen && playing) toggle(); });

  return {
    open,
    close,
    toggle,
    seek,
    get video() { return current; },
    get isOpen() { return isOpen; },
    get paused() { return !playing; },
    get screen() { return screen; },
  };
}
