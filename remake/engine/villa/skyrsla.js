// The bug report's contents ("skýrsla" = report), as pure functions the tool (villa.js) and the dev server (tools/serve.mjs) share:
// buildReport gathers what the game knows at the moment of the report, section by section, so one part that throws costs only
// its own section; the box helpers turn the owner's drags into rectangles in screen and in screenshot pixels; snapshotHtml is the
// page the dev server can show again over the screenshot (the HTML layers that lay over the canvas: the caption, the book, a
// game); and the folder name is where the server files it all.

/** `fn()`'s value, or { error } when it throws: a report section never takes the others down with it. */
export function section(fn) {
  try {
    return fn();
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

/** A value, or the value of a thunk, read through `section`. */
const read = value => (typeof value === 'function' ? section(value) : value === undefined ? null : value);

export const round = (n, digits = 3) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(digits)) : n);
const roundAll = list => (Array.isArray(list) ? list.map(n => round(n)) : list);

/**
 * The report. `ctx` holds plain values or thunks (main.js hands the game's parts as thunks, so each is read at the moment of the
 * report and a part that throws is reported as such): chapterId, params, canvas { width, height }, window { width, height, dpr },
 * screen { width, height }, navigator { userAgent, platform, language }, clock, stage, location, panels, caption, voice, actors,
 * camera, save, quality, stats, gpu, audio, fjolspil, memory, consoleLog; `text` and `boxes` are the owner's, `screenshot` says
 * which image was taken ({ width, height, mayBeBlank }).
 */
export function buildReport(ctx, { now = new Date() } = {}) {
  const camera = read(ctx.camera);
  return {
    about: 'Villutilkynning úr Mosa-leiknum (engine/villa). Tímar í sekúndum, staðir í metrum (+Y upp), skjáskotið er WebGL-ramminn; spjold.html eru HTML-lögin sem lágu yfir honum.',
    time: now.toISOString(),
    page: { href: read(ctx.href), params: read(ctx.params) },
    build: null, // the dev server fills in the commit and the branch when it files the report
    chapter: { id: read(ctx.chapterId), location: read(ctx.location), clock: read(ctx.clock), stage: read(ctx.stage) },
    panels: read(ctx.panels),
    caption: read(ctx.caption),
    voice: read(ctx.voice),
    actors: section(() => (read(ctx.actors) ?? []).map(actor => ({ ...actor, position: roundAll(actor.position), heading: round(actor.heading, 1) }))),
    camera: camera && !camera.error ? { ...camera, position: roundAll(camera.position), target: roundAll(camera.target), fov: round(camera.fov, 1) } : camera,
    save: read(ctx.save),
    display: {
      quality: read(ctx.quality),
      canvas: read(ctx.canvas),
      window: read(ctx.window),
      screen: read(ctx.screen),
      screenshot: read(ctx.screenshot),
    },
    device: { ...read(ctx.navigator), gpu: read(ctx.gpu), memory: read(ctx.memory) },
    performance: read(ctx.stats),
    audio: read(ctx.audio),
    fjolspil: read(ctx.fjolspil),
    console: read(ctx.consoleLog) ?? [],
    text: typeof ctx.text === 'string' ? ctx.text : '',
    boxes: Array.isArray(ctx.boxes) ? ctx.boxes : [],
  };
}

/** The rectangle between two points of a drag, as whole CSS pixels: { x, y, w, h } with w and h >= 0. */
export function normalizeBox(a, b) {
  const x = Math.round(Math.min(a.x, b.x)), y = Math.round(Math.min(a.y, b.y));
  return { x, y, w: Math.round(Math.max(a.x, b.x)) - x, h: Math.round(Math.max(a.y, b.y)) - y };
}

/**
 * A screen box in the screenshot's pixels: the screenshot covers the view the box was drawn in (`box.view`, or `view`; both
 * { width, height }), so a box keeps its place in the picture whatever the window did since.
 */
export function boxToImage(box, view, image) {
  const from = box.view ?? view;
  const sx = image.width / from.width, sy = image.height / from.height;
  return { x: Math.round(box.x * sx), y: Math.round(box.y * sy), w: Math.round(box.w * sx), h: Math.round(box.h * sy) };
}

/**
 * The page that shows the HTML layers again over the screenshot: `styles` are the page's stylesheet paths (root-relative, so the
 * dev server serves them to this page wherever it is filed), `parts` the outerHTML of each visible layer, `width`/`height` the
 * view they were laid out for, `screenshot` the image file beside it. Opened from qa/villur/<report>/spjold.html on the dev server.
 */
export function snapshotHtml({ title = 'Villutilkynning', width, height, styles = [], bodyClass = '', parts = [], screenshot = 'skjaskot.png', note = '' }) {
  const links = styles.map(href => `<link rel="stylesheet" href="${escapeAttr(href)}">`).join('\n');
  return `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<title>${escapeText(title)}</title>
${links}
<style>
  /* The view the layers were laid out for, with the screenshot behind them: what the owner saw, less the live canvas. */
  html, body { margin: 0; width: ${Number(width) || 0}px; height: ${Number(height) || 0}px; overflow: hidden; }
  body { background: #000 url("${escapeAttr(screenshot)}") no-repeat 0 0 / 100% 100%; position: relative; }
</style>
</head>
<body class="${escapeAttr(bodyClass)}">
<!-- ${escapeText(note)} -->
${parts.join('\n')}
</body>
</html>
`;
}

const escapeText = text => String(text).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const escapeAttr = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 2026-10-25_183205 for a Date, local time: the folder's name sorts by time. */
export function fileStamp(date) {
  const two = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}_${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}

/** The report's folder name: the stamp and the chapter, in characters a file name allows. */
export function folderName(date, chapter) {
  const safe = String(chapter ?? 'leikur').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'leikur';
  return `${fileStamp(date)}-${safe}`;
}
