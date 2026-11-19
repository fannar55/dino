// The game in the cloud (spec §9.2): one Worker with the staged site (cloud/stage.mjs) as Workers Static Assets, the educational
// videos in R2 (env.VIDEOS), and the rooms as Durable Objects. A request for a file in the site is answered by the assets before
// this Worker runs, except under the audio and video paths (run_worker_first in wrangler.toml), whose byte ranges the Worker
// cuts itself (range.mjs). What comes here: / goes on to /remake/, /fjolspil/ws/<code> to that code's Room (room-object.mjs, one
// object per code by idFromName), /myndbond/<name>.mp4 to the R2 bucket with byte-range streaming, a sound to the assets and then
// range.mjs, and anything else to the assets, which answer 404. A sound or video, whole or cut, keeps in the browser for a day
// (cache.mjs), as the site's pictures and models do by site/_headers, which does not touch the Worker's answers.

import { normalizeCode } from '../../remake/engine/fjolspil/protocol.js';
import { folderName } from '../../remake/engine/villa/skyrsla.js';
import { MEDIA_CACHE, isKeptSound } from './cache.mjs';
import { isByteRange, parseRange, sliceRange } from './range.mjs';
import { ROOM_PATH } from './room-object.mjs';

export { Room } from './room-object.mjs';

/** The paths wrangler.toml runs the Worker first for: the game's sounds, the old game's voice lines, the book's videos, and /villa. */
const AUDIO_PATH = /^\/(?:remake|dist)\/assets\/audio\//;
const VIDEO_PATH = /^\/myndbond\/([a-z0-9-]+\.mp4)$/;
const REPORT_LIMIT = 25 * 1024 * 1024;
const REPORT_FILES = {
  'skjaskot.jpg': { kind: 'data', prefix: 'data:image/jpeg;base64,', type: 'image/jpeg' },
  'merkt.jpg': { kind: 'data', prefix: 'data:image/jpeg;base64,', type: 'image/jpeg' },
  'skjaskot.png': { kind: 'data', prefix: 'data:image/png;base64,', type: 'image/png' },
  'merkt.png': { kind: 'data', prefix: 'data:image/png;base64,', type: 'image/png' },
  'spjold.html': { kind: 'text', type: 'text/html; charset=utf-8' },
};

/**
 * A sound from the assets, as a 206 of the range asked for when the assets answered 200 with the whole file. Without a byte
 * range, or when the assets answered anything else (a 206 of their own, a 304, a 404), their answer goes through as it is.
 */
async function sound(request, env) {
  const range = request.headers.get('range');
  if (!isByteRange(range)) return env.ASSETS.fetch(request);
  const head = request.method === 'HEAD';
  const asset = await env.ASSETS.fetch(head ? new Request(request, { method: 'GET' }) : request); // a HEAD needs the file's length
  if (asset.status !== 200) return head ? new Response(null, asset) : asset;
  const cut = sliceRange(range, await asset.arrayBuffer(), asset.headers.get('content-type'));
  return new Response(head ? null : cut.body, { status: cut.status, headers: cut.headers });
}

/**
 * An educational video from the R2 bucket (`env.VIDEOS`), streamed whole (200) or as the byte range asked for (206, or 416 when
 * past the end). Streaming R2's body directly keeps even 500+ MB videos out of the Worker's memory.
 */
async function video(request, env, key) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
  if (!env.VIDEOS) return new Response(null, { status: 404 });
  const head = request.method === 'HEAD';
  const range = request.headers.get('range');
  if (isByteRange(range)) {
    const meta = await env.VIDEOS.head(key);
    if (!meta) return new Response(null, { status: 404 });
    const cut = parseRange(range, meta.size);
    if (!cut.valid) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${cut.total}` } });
    const headers = {
      'Content-Range': `bytes ${cut.start}-${cut.end}/${cut.total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(cut.length),
      'Content-Type': 'video/mp4',
      'Cache-Control': MEDIA_CACHE,
    };
    if (meta.httpEtag) headers.ETag = meta.httpEtag;
    if (head) return new Response(null, { status: 206, headers });
    const part = await env.VIDEOS.get(key, { range: { offset: cut.start, length: cut.length } });
    if (!part) return new Response(null, { status: 404 });
    return new Response(part.body, { status: 206, headers });
  }
  const obj = head ? await env.VIDEOS.head(key) : await env.VIDEOS.get(key);
  if (!obj) return new Response(null, { status: 404 });
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Length': String(obj.size),
    'Content-Type': 'video/mp4',
    'Cache-Control': MEDIA_CACHE,
  };
  if (obj.httpEtag) headers.ETag = obj.httpEtag;
  return new Response(head ? null : obj.body, { status: 200, headers });
}

/** The Worker's answer for a sound with the day of cache.mjs; a list (dj.json), a 304, a 404 or a 416 as it is. */
function keep(response) {
  if (!isKeptSound(response)) return response;
  const kept = new Response(response.body, response);
  kept.headers.set('cache-control', MEDIA_CACHE);
  return kept;
}

function decodeBase64(b64) {
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(b64);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Files a bug report from the game (engine/villa/villa.js) into R2 under `villur/<time>-<chapter>/` when `env.VIDEOS` is bound. */
async function villa(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return new Response(null, { status: 204, headers: { 'X-Villa': '1', 'Cache-Control': 'no-store' } });
  }
  if (request.method !== 'POST') return new Response('not found', { status: 404 });
  const reqOrigin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if ((reqOrigin && reqOrigin !== new URL(request.url).origin) || fetchSite === 'cross-site') {
    return new Response('forbidden', { status: 403 });
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (declaredLength > REPORT_LIMIT) return new Response(`the report is over ${REPORT_LIMIT} bytes`, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > REPORT_LIMIT) return new Response(`the report is over ${REPORT_LIMIT} bytes`, { status: 413 });
  let sent;
  try {
    sent = JSON.parse(rawBody);
  } catch {
    return new Response('the report is not JSON', { status: 400 });
  }
  if (!sent || typeof sent !== 'object' || !sent.report || typeof sent.report !== 'object' || !sent.files || typeof sent.files !== 'object') {
    return new Response('a report is { report, files }', { status: 400 });
  }
  const now = new Date();
  const baseName = folderName(now, sent.report.chapter?.id);
  let folder = `villur/${baseName}`;
  if (env.VIDEOS?.head) {
    let n = 2;
    while (n <= 25 && await env.VIDEOS.head(`${folder}/skyrsla.json`)) {
      folder = `villur/${baseName}-${n++}`;
    }
    if (n > 25 && await env.VIDEOS.head(`${folder}/skyrsla.json`)) {
      folder = `villur/${baseName}-${crypto.randomUUID().slice(0, 8)}`;
    }
  }
  const report = { ...sent.report, saved: { folder, at: now.toISOString() } };
  if (env.VIDEOS?.put) {
    await env.VIDEOS.put(`${folder}/skyrsla.json`, `${JSON.stringify(report, null, 2)}\n`, { httpMetadata: { contentType: 'application/json' } });
    for (const [file, spec] of Object.entries(REPORT_FILES)) {
      const value = sent.files[file];
      if (typeof value !== 'string') continue;
      if (spec.kind === 'text') {
        const httpMetadata = { contentType: spec.type };
        if (spec.type.startsWith('text/html')) httpMetadata.contentDisposition = 'attachment';
        await env.VIDEOS.put(`${folder}/${file}`, value, { httpMetadata });
      } else if (value.startsWith(spec.prefix)) {
        let bytes;
        try {
          bytes = decodeBase64(value.slice(spec.prefix.length));
        } catch {
          continue;
        }
        await env.VIDEOS.put(`${folder}/${file}`, bytes, { httpMetadata: { contentType: spec.type } });
      }
    }
  }
  return new Response(JSON.stringify({ folder }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export default {
  fetch(request, env) {
    const { pathname, search } = new URL(request.url);
    if (pathname === '/') return new Response(null, { status: 302, headers: { location: `/remake/${search}` } });
    if (pathname === '/villa') return villa(request, env);
    if (AUDIO_PATH.test(pathname)) return sound(request, env).then(keep);
    const vid = VIDEO_PATH.exec(pathname);
    if (vid) return video(request, env, vid[1]);
    const path = ROOM_PATH.exec(pathname);
    if (!path) return env.ASSETS.fetch(request);
    const code = normalizeCode(path[1]);
    if (!code) return new Response(null, { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};
