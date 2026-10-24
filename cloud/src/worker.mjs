// The game in the cloud (spec §9.2): one Worker with the staged site (cloud/stage.mjs) as Workers Static Assets and the
// rooms as Durable Objects. A request for a file in the site is answered by the assets before this Worker runs, except under
// the audio paths (run_worker_first in wrangler.toml), whose byte ranges the Worker cuts itself (range.mjs). What comes here:
// / goes on to /remake/, /fjolspil/ws/<code> to that code's Room (room-object.mjs, one object per code by idFromName), a
// sound to the assets and then range.mjs, and anything else to the assets, which answer 404.

import { normalizeCode } from '../../remake/engine/fjolspil/protocol.js';
import { isByteRange, sliceRange } from './range.mjs';
import { ROOM_PATH } from './room-object.mjs';

export { Room } from './room-object.mjs';

/** The paths wrangler.toml runs the Worker first for: the game's sounds and the old game's voice lines. */
const AUDIO_PATH = /^\/(?:remake|dist)\/assets\/audio\//;

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

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/') return new Response(null, { status: 302, headers: { location: '/remake/' } });
    if (AUDIO_PATH.test(pathname)) return sound(request, env);
    const path = ROOM_PATH.exec(pathname);
    if (!path) return env.ASSETS.fetch(request);
    const code = normalizeCode(path[1]);
    if (!code) return new Response(null, { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};
