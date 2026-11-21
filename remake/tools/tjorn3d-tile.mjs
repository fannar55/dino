#!/usr/bin/env node
// Uggeðla í tjörninni's tile in the book (engine/book/videos.js BOOK_3D): its picture, made again from the show itself, and the
// walk a child takes from the book into the show and back, with real presses in the headless browser the captures use.
//
//   node remake/tools/tjorn3d-tile.mjs --poster [--t 38] [--view sjon|mono] [--crop 332,222,640,360]
//                                      [--out remake/assets/book/videos/tjorn3d-thumb.webp] [--png qa/tjorn3d/bok/poster.png]
//       the tile's picture: the show stood at second --t (?chapter=tjorn3d&t=<s>, a 10,5 inch screen, a page of 1280 x 800) in
//       plain colours, as the viewer sees it from the seat (sjon=1: an ordinary camera between the eyes; the screen's outline, a
//       review aid, is taken off) or as the screen shows it without the glasses (mono: gler=0, the stretched picture). The crop
//       (x,y,width,height in the page's pixels, 16:9) is drawn at twice its size and scaled to 640 x 360, WebP, as the other
//       shows' pictures are. --png keeps the whole page as it was drawn, to choose a crop from. ffmpeg must be on the PATH.
//
//   node remake/tools/tjorn3d-tile.mjs --walk [--whole] [--size 1280x800] [--shots qa/tjorn3d/bok] [--json qa/tjorn3d/bok/walk.json]
//       the game's own page, Byrja, the book's button, the Myndbönd ribbon, the tile, the glasses, the whole show, "Hætta": each a
//       real press (the browser's own mouse), so the page's asking for the whole screen is answered as a tap's is. Says at each
//       stop whether the page has the whole screen and whose it is, what plays in the book's frame, how the book's own sound
//       stands, and at the end that the book is there again as it was. --whole: the book's page has the whole screen before the
//       tile is pressed (as an app that is whole-screen already), and must still have it after.
//
//   node remake/tools/tjorn3d-tile.mjs --shelf [--sizes 1280x800,820x1180] [--shots qa/tjorn3d/bok] [--drop tjorn3d]
//       the book's Myndbönd page (book-lab.html?state=videos) at each size: whether the "3D myndbönd" column, its heading and every
//       tile lie inside their page, one under the other, each name whole; and a picture of the page. --drop takes a tile off the
//       page first (the page as it was before that show had one), to compare.
//
// Exit code 1 when the page throws, a stop is not reached, the book is not as it was when the show is left, or a tile does not fit.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sleep, launchBrowser, stopBrowser } from './veiddu-video.mjs';
import { LENGTH } from '../chapters/tjorn3d/show.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
export const POSTER = { t: 38, view: 'sjon', crop: [332, 222, 640, 360], size: [640, 360], inches: 10.5, page: '1280x800', out: 'remake/assets/book/videos/tjorn3d-thumb.webp' };

function parseArgs(argv) {
  const o = { poster: false, walk: false, shelf: false, sizes: '1280x800,820x1180', drop: null, whole: false, t: POSTER.t, view: POSTER.view, crop: POSTER.crop, out: POSTER.out, png: null, size: POSTER.page, shots: null, json: null, timeout: 180 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--poster') o.poster = true;
    else if (a === '--walk') o.walk = true;
    else if (a === '--whole') o.whole = true;
    else if (a === '--shelf') o.shelf = true;
    else if (a === '--sizes') o.sizes = next();
    else if (a === '--drop') o.drop = next();
    else if (a === '--t') o.t = Number(next());
    else if (a === '--view') o.view = next();
    else if (a === '--crop') o.crop = next().split(',').map(Number);
    else if (a === '--out') o.out = next();
    else if (a === '--png') o.png = next();
    else if (a === '--size') o.size = next();
    else if (a === '--shots') o.shots = next();
    else if (a === '--json') o.json = next();
    else if (a === '--timeout') o.timeout = Number(next());
    else throw new Error(`Unknown argument ${a}`);
  }
  if ([o.poster, o.walk, o.shelf].filter(Boolean).length !== 1) throw new Error('Say --poster, --walk or --shelf');
  if (!['sjon', 'mono'].includes(o.view)) throw new Error('--view is sjon or mono');
  if (o.crop.length !== 4 || o.crop.some(n => !Number.isFinite(n))) throw new Error('--crop is x,y,width,height');
  return o;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const stat = await fsp.stat(file);
      const target = stat.isDirectory() ? path.join(file, 'index.html') : file;
      const body = await fsp.readFile(target);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Opens a page in the headless browser and runs `fn({ send, evaluate, until, press, shot, errors })` on it. */
async function withPage(o, { scale = 1 }, fn) {
  const [W, H] = o.size.split('x').map(Number);
  let browser = null;
  for (let tries = 0; !browser; tries++) { // the browser now and then fails to start on a busy machine
    try { browser = await launchBrowser({ browser: 'edge', width: W, height: H }); } catch (e) { if (tries >= 2) throw e; await sleep(2000); }
  }
  const { cdp } = browser;
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const errors = [];
    cdp.handlers.add(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
      else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: scale, mobile: false });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const until = async (what, test, seconds = o.timeout) => {
      const t0 = Date.now();
      for (;;) {
        let is = false;
        try { is = await evaluate(`Boolean(${test})`); } catch { /* loading */ }
        if (is) return;
        if (Date.now() - t0 > seconds * 1000) throw new Error(`${what}${errors.length ? ': ' + errors[0] : ''}`);
        await sleep(200);
      }
    };
    /** A real press: the browser's own mouse, down and up, at the middle of what `find` (an expression) gives in the top page's pixels. */
    const press = async (what, find) => {
      const at = await evaluate(`(() => { const r = (${find}); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`);
      if (!at || !at.w || !at.h) throw new Error(`Nothing to press: ${what}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y, button: 'none', buttons: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1 });
      await sleep(60);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1 });
      return at;
    };
    const shot = async (file, clip = null) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      const png = Buffer.from(data, 'base64');
      if (file) {
        fs.mkdirSync(path.dirname(path.resolve(ROOT, file)), { recursive: true });
        fs.writeFileSync(path.resolve(ROOT, file), png);
      }
      return png;
    };
    return await fn({ send, evaluate, until, press, shot, errors });
  } finally {
    await stopBrowser(browser);
  }
}

// ---------------------------------------------------------------------------------------------
// the tile's picture

async function poster(o, base) {
  const [x, y, w, h] = o.crop;
  if (Math.abs(w / h - POSTER.size[0] / POSTER.size[1]) > 0.01) throw new Error(`The crop is ${w} x ${h}: it must be 16:9 as the tiles' pictures are`);
  let png = null, stood = null, errors = [];
  await withPage({ ...o, size: POSTER.page }, { scale: 2 }, async page => {
    const query = `chapter=tjorn3d&t=${o.t}&skjar=${POSTER.inches}&${o.view === 'sjon' ? 'sjon=1' : 'gler=0'}`;
    await page.send('Page.navigate', { url: `${base}?${query}` });
    await page.until('the show did not come to its second', `window.__demoReady && window.__world?.tjorn?.time?.showing && Math.abs(window.__world.tjorn.view.t - ${o.t}) < 0.05`);
    // the screen's outline on the seat's view is a review aid, not the show's picture
    await page.evaluate('(async () => { window.__world.tjorn.stage.frame.visible = false; for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); })()');
    await sleep(600);
    stood = await page.evaluate('({ t: window.__world.tjorn.view.t, part: window.__world.tjorn.view.key?.name, mode: window.__world.tjorn.view.mode, inches: window.__world.tjorn.view.inches, px: [innerWidth, innerHeight], ratio: devicePixelRatio })');
    if (o.png) await page.shot(o.png);
    png = await page.shot(null, { x, y, width: w, height: h });
    errors = [...page.errors];
  });
  const out = path.resolve(ROOT, o.out);
  const made = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', '-i', 'pipe:0',
    '-vf', `scale=${POSTER.size[0]}:${POSTER.size[1]}:flags=lanczos`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '84', '-preset', 'picture',
    '-map_metadata', '-1', '-fflags', '+bitexact', out], { input: png, maxBuffer: 1 << 28 });
  if (made.error || made.status !== 0) throw new Error(`ffmpeg failed: ${made.error?.message ?? String(made.stderr).trim().split('\n').pop()}`);
  console.log(`The tile's picture: ${o.out}, ${POSTER.size.join(' x ')}, ${fs.statSync(out).size} bytes`);
  console.log(`From the show at ${stood.t.toFixed(2)} s (${stood.part}), view ${stood.mode}, a ${stood.inches} inch screen, a page of ${stood.px.join(' x ')} drawn at ${stood.ratio} times; crop ${w} x ${h} from (${x}, ${y})`);
  if (o.png) console.log(`The whole page: ${o.png}`);
  if (errors.length) console.log(`The page said: ${errors.join(' | ')}`);
  return { result: { stood, crop: o.crop, out: o.out }, bad: errors.length > 0 };
}

// ---------------------------------------------------------------------------------------------
// the walk: book, tile, show, book

/** What the page is like, asked in the top page: the whole screen, the book, the show's frame and the book's own sound. */
const LOOK = `(() => {
  const frame = document.querySelector('.show-frame');
  const inner = (() => { try { return frame?.contentWindow ?? null; } catch { return null; } })();
  const show = inner?.__world?.tjorn ?? null;
  const fs = document.fullscreenElement;
  const sound = window.__world?.sound;
  const book = document.getElementById('book');
  const tile = document.querySelector('[data-video="tjorn3d"]');
  return {
    whole: fs ? (fs === document.documentElement ? 'the page' : fs === frame ? 'the show' : fs.tagName.toLowerCase()) : null,
    showWhole: inner ? Boolean(inner.document.fullscreenElement) : null,
    page: [innerWidth, innerHeight],
    bookOpen: Boolean(book && !book.hidden),
    tab: book?.getAttribute('data-tab') ?? null,
    player: (() => { const p = document.querySelector('.show-player'); return p ? !p.hidden : false; })(),
    frame: frame ? frame.getAttribute('src') : null,
    frames: document.querySelectorAll('iframe').length,
    tile: tile ? { new: tile.classList.contains('new'), found: tile.classList.contains('found'), label: tile.getAttribute('aria-label') } : null,
    bookSound: sound?.context?.state ?? null,
    music: (() => { try { const m = window.__world?.music; return m ? { muted: Boolean(m.muted), at: +(+m.position).toFixed(2) } : null; } catch { return null; } })(),
    show: show ? { t: +(show.view.t ?? 0).toFixed(2), showing: Boolean(show.time?.showing), context: inner.__world.sound?.context?.state ?? null, running: Boolean(show.sound?.running), sounding: show.sound?.sounding?.() ?? null, page: [inner.innerWidth, inner.innerHeight], card: Boolean(inner.document.querySelector('.dans-end')) } : null,
  };
})()`;
const INNER = "document.querySelector('.show-frame')?.contentWindow";
/** The rectangle of something inside the show's frame, in the top page's pixels. */
const inFrame = selector => `(() => { const f = document.querySelector('.show-frame'); const e = f?.contentDocument?.querySelector(${JSON.stringify(selector)}); if (!e) return null; const a = f.getBoundingClientRect(), b = e.getBoundingClientRect(); return { left: a.left + b.left, top: a.top + b.top, width: b.width, height: b.height }; })()`;

async function walk(o, base) {
  const stops = [];
  let errors = [], bad = [];
  await withPage(o, {}, async page => {
    const stop = async (name, shot = true) => {
      const look = await page.evaluate(LOOK);
      stops.push({ name, ...look });
      if (shot && o.shots) await page.shot(`${o.shots}/${String(stops.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
      return look;
    };
    // a child who has Kambeðla's star (chapter 1 played): the book's button is on the page from the start, and the game opens on chapter 2
    await page.send('Page.navigate', { url: `${base}manifest.webmanifest` });
    await page.until('the server did not answer', "document.readyState === 'complete'", 20);
    await page.evaluate(`localStorage.setItem('mosi-remake-v1', JSON.stringify({ stars: ['k1_kambedla'], findings: [], seen: [], places: [] }))`);
    await page.send('Page.navigate', { url: base });
    await page.until('the start did not come', "window.__demoReady && document.getElementById('start') && !document.getElementById('start').hidden");
    await page.press('Byrja', "document.getElementById('start').getBoundingClientRect()");
    await page.until('the book\'s button did not come', "!document.getElementById('journal-button').hidden && document.getElementById('journal-button').getBoundingClientRect().width > 0");
    await sleep(1500);
    if (o.whole) {
      // the page has the whole screen before the book is opened, as an app that is whole-screen already (asked for as a press would)
      await page.send('Runtime.evaluate', { expression: 'document.documentElement.requestFullscreen()', userGesture: true, awaitPromise: true });
      await page.until('the page did not get the whole screen', 'document.fullscreenElement === document.documentElement', 10);
    }
    await stop('the game');
    await page.press('the book\'s button', "document.getElementById('journal-button').getBoundingClientRect()");
    await page.until('the book did not open', "document.getElementById('book') && !document.getElementById('book').hidden", 20);
    await sleep(1200);
    await page.press('the Myndbönd ribbon', "document.querySelector('.ribbon[data-tab=\"videos\"]').getBoundingClientRect()");
    await page.until('the Myndbönd page did not come', "document.getElementById('book').getAttribute('data-tab') === 'videos'", 20);
    await sleep(1800);
    const before = await stop('the book, Myndbönd');
    await page.press('the tile', "document.querySelector('[data-video=\"tjorn3d\"]').getBoundingClientRect()");
    await page.until('the show\'s frame did not come', `${INNER}?.document?.querySelector('.gler-start') && !${INNER}.document.querySelector('.gler-start-wrap').hidden`);
    await sleep(800);
    await stop('the glasses');
    await page.press('the glasses', inFrame('.gler-start'));
    await page.until('the show did not start', `${INNER}.__world?.tjorn?.time?.showing && ${INNER}.__world.tjorn.sound?.running`);
    await sleep(3000);
    await stop('the show, a few seconds in');
    const began = Date.now();
    let middle = false;
    for (;;) {
      await sleep(500);
      const t = await page.evaluate(`${INNER}.__world.tjorn.view.t`);
      if (!middle && t >= 38) { middle = true; await stop('the show, her head up'); }
      if (t >= LENGTH - 1e-3 || Date.now() - began > (LENGTH + 40) * 1000) break;
    }
    await page.until('the end card did not come', `${INNER}.document.querySelector('.dans-end button')`, 20);
    await sleep(800);
    const end = await stop('the end card');
    await page.press('Hætta', `(() => { const f = document.querySelector('.show-frame'); const e = [...f.contentDocument.querySelectorAll('.dans-end button')].find(b => b.textContent === 'Hætta'); const a = f.getBoundingClientRect(), b = e.getBoundingClientRect(); return { left: a.left + b.left, top: a.top + b.top, width: b.width, height: b.height }; })()`);
    await page.until('the frame did not go', "!document.querySelector('.show-frame')", 10);
    await sleep(1500);
    const after = await stop('the book again');
    errors = [...page.errors];

    // the book is there again as it was
    const during = stops.find(s => s.name === 'the show, a few seconds in');
    const was = o.whole ? 'the page' : null;
    if (before.whole !== was) bad.push(`before the tile the whole screen was ${before.whole}, not ${was}`);
    if (after.whole !== was) bad.push(`after the show the whole screen is ${after.whole}, not ${was} as before`);
    if (after.page.join() !== before.page.join()) bad.push(`the page is ${after.page.join(' x ')}, it was ${before.page.join(' x ')}`);
    if (!after.bookOpen || after.tab !== 'videos') bad.push('the book is not open on Myndbönd');
    if (after.player || after.frame !== null || after.frames !== before.frames) bad.push('the show\'s frame is still there');
    if (after.bookSound !== before.bookSound) bad.push(`the book's sound is ${after.bookSound}, it was ${before.bookSound}`);
    if (after.music?.muted !== before.music?.muted) bad.push(`the book's music is ${after.music?.muted ? 'muted' : 'not muted'}, it was ${before.music?.muted ? 'muted' : 'not muted'}`);
    if (!before.tile?.new || after.tile?.new || !after.tile?.found) bad.push('the tile\'s Nýtt! mark did not go with the press');
    if (!during?.show?.running) bad.push('the show\'s sound was not running in the show');
    if (end.show?.running || end.show?.sounding) bad.push('the show\'s sound had not ended at the end card');
    if (!/chapter=tjorn3d&syning=1/.test(during?.frame ?? '')) bad.push(`the frame played ${during?.frame}`);
  });

  console.log(`The walk${o.whole ? ' (the page whole-screen before the book is opened)' : ''}, a page of ${o.size}: each stop as the top page stands\n`);
  for (const s of stops) {
    console.log(`${s.name}`);
    console.log(`  whole screen: ${s.whole ?? 'no'}${s.showWhole === null ? '' : ` (the show's own page: ${s.showWhole ? 'whole' : 'not whole'})`}; the page ${s.page.join(' x ')}; the book ${s.bookOpen ? `open on ${s.tab}` : 'shut'}; the show's player ${s.player ? `open, ${s.frame}` : 'shut'}`);
    console.log(`  the book's sound: ${s.bookSound}${s.music ? `, its music ${s.music.muted ? 'muted' : 'not muted'}, ${s.music.at} s into the theme` : ''}${s.tile ? `; the tile ${s.tile.new ? 'new' : s.tile.found ? 'seen' : 'locked'}` : ''}`);
    if (s.show) console.log(`  the show: at ${s.show.t} s, ${s.show.showing ? 'showing' : 'not showing'}, its page ${s.show.page.join(' x ')}, its audio context ${s.show.context}, the show's sound ${s.show.running ? 'playing' : 'not playing'}, ${s.show.sounding} sources sounding${s.show.card ? ', the end card up' : ''}`);
  }
  console.log(bad.length ? `\nNOT AS IT WAS: ${bad.join('; ')}` : '\nThe book is there again as it was: the whole screen given back (or left as it was), the frame gone and its sound with it, the book\'s own sound as before, the tile seen.');
  if (errors.length) console.log(`The page said: ${errors.join(' | ')}`);
  return { result: { stops, bad, errors }, bad: bad.length > 0 || errors.length > 0 };
}

// ---------------------------------------------------------------------------------------------
// the shelf: the Myndbönd page with its "3D myndbönd" column

/**
 * The page's boxes, asked in the lab's page: the right page, the column, its heading, each of its tiles and the book's close button.
 * A tile is a sticker laid a little askew: "box" is what it covers as drawn, "layout" its own width and height before the turn.
 */
const SHELF = `(() => {
  const column = document.querySelector('.video-3d-column');
  const box = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(n => Math.round(n * 10) / 10); };
  const tile = t => {
    const name = t.querySelector('.tile-name'), picture = t.querySelector('.tile-picture'), img = t.querySelector('img');
    return { id: t.getAttribute('data-video'), box: box(t), layout: [t.offsetWidth, t.offsetHeight], picture: [picture.offsetWidth, picture.offsetHeight], name: name.textContent,
      nameOver: Math.max(0, name.scrollWidth - name.clientWidth, name.scrollHeight - name.clientHeight), font: getComputedStyle(name).fontSize,
      drawn: Boolean(img.complete && img.naturalWidth), new: t.classList.contains('new'), label: t.getAttribute('aria-label') };
  };
  const pageOf = e => e.closest('.book-page');
  const close = [...document.querySelectorAll('#book button')].find(b => /loka/i.test(b.getAttribute('aria-label') ?? '') && b.getBoundingClientRect().width > 0);
  return {
    page: box(pageOf(column)), column: box(column), over: column.scrollHeight - column.clientHeight, head: box(column.querySelector('.video-3d-head')),
    close: close ? box(close) : null,
    tiles: [...column.querySelectorAll('.video-tile-3d')].map(tile),
    videos: [...document.querySelectorAll('.book-leaf[data-tab="videos"] .video-tile:not(.video-tile-3d)')].map(t => ({ ...tile(t), page: box(pageOf(t)) })),
  };
})()`;
const NAME_SLACK = 4; // px a name may reach past its line before it counts as cut (the four tiles before this one had as much on a narrow page)

async function shelf(o, base) {
  const rows = [];
  let bad = false;
  for (const size of o.sizes.split(',')) {
    let m = null, errors = [];
    await withPage({ ...o, size }, {}, async page => {
      await page.send('Page.navigate', { url: `${base}book-lab.html?state=videos` });
      await page.until('the book did not open on Myndbönd', "window.__demoReady && document.querySelector('.video-3d-column')");
      if (o.drop) await page.evaluate(`document.querySelector('.video-3d-column [data-video=${JSON.stringify(o.drop)}]').remove()`);
      await sleep(1500);
      m = await page.evaluate(SHELF);
      if (o.shots) await page.shot(`${o.shots}/hilla-${size}${o.drop ? '-an-' + o.drop : ''}.png`);
      errors = [...page.errors];
    });
    const inside = (b, p) => b[0] >= p[0] - 0.5 && b[1] >= p[1] - 0.5 && b[2] <= p[2] + 0.5 && b[3] <= p[3] + 0.5;
    const meet = (b, c) => b[0] < c[2] && c[0] < b[2] && b[1] < c[3] && c[1] < b[3];
    const wrong = [];
    if (!inside(m.column, m.page)) wrong.push('the column reaches out of its page');
    if (m.over > 1) wrong.push(`the column's tiles are ${m.over} px taller than it`);
    if (!inside(m.head, m.page)) wrong.push('the heading is not inside the page');
    if (m.close && meet(m.head, m.close)) wrong.push('the heading lies under the book\'s close button');
    m.tiles.forEach(t => {
      if (!inside(t.box, m.page)) wrong.push(`${t.id} reaches out of its page`);
      if (m.close && meet(t.box, m.close)) wrong.push(`${t.id} lies under the book's close button`);
      if (t.nameOver > NAME_SLACK) wrong.push(`${t.id}'s name is cut by ${t.nameOver} px`);
      if (!t.drawn) wrong.push(`${t.id}'s picture did not load`);
    });
    for (const v of m.videos) if (!inside(v.box, v.page)) wrong.push(`${v.id} reaches out of its page`);
    rows.push({ size, ...m, wrong, errors });
    console.log(`${size}: the right page ${m.page.map(Math.round).join(', ')}; the column ${m.column.map(Math.round).join(', ')}; ${m.tiles.length} tiles under "3D myndbönd"`);
    for (const t of m.tiles) console.log(`  ${t.id.padEnd(11)} ${t.layout.join(' x ')} from y ${Math.round(t.box[1])} to ${Math.round(t.box[3])}, its picture ${t.picture.join(' x ')}, "${t.name}" at ${t.font}${t.nameOver ? ` (${t.nameOver} px past its line)` : ''}${t.new ? ', Nýtt!' : ''}`);
    console.log(`  the other videos: ${m.videos.map(v => `${v.id} ${v.layout.join(' x ')}`).join(', ')}`);
    console.log(wrong.length ? `  DOES NOT FIT: ${wrong.join('; ')}` : `  all inside the page and clear of the close button, the column no taller than its room, every name whole; ${Math.round(m.page[3] - m.tiles.at(-1).box[3])} px under the last tile, ${Math.round(m.head[1] - m.page[1])} px over the heading`);
    if (errors.length) console.log(`  The page said: ${errors.join(' | ')}`);
    if (wrong.length || errors.length) bad = true;
  }
  return { result: rows, bad };
}

const o = parseArgs(process.argv.slice(2));
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/remake/`;
let bad = false;
try {
  const { result, bad: wrong } = o.poster ? await poster(o, base) : o.shelf ? await shelf(o, base) : await walk(o, base);
  bad = wrong;
  if (o.json) {
    const file = path.resolve(ROOT, o.json);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(result, null, 1));
    console.log(`Written: ${o.json}`);
  }
} catch (e) {
  console.error(e.message);
  bad = true;
} finally {
  server.close();
}
process.exit(bad ? 1 : 0);
