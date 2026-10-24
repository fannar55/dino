// The game in the cloud (spec §9.2): one Worker with the staged site (cloud/stage.mjs) as Workers Static Assets and the
// rooms as Durable Objects. A request for a file in the site is answered by the assets before this Worker runs; what is
// left comes here: / goes on to /remake/, /fjolspil/ws/<code> to that code's Room (room-object.mjs, one object per code
// by idFromName), and anything else to the assets, which answer 404.

import { normalizeCode } from '../../remake/engine/fjolspil/protocol.js';
import { ROOM_PATH } from './room-object.mjs';

export { Room } from './room-object.mjs';

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/') return new Response(null, { status: 302, headers: { location: '/remake/' } });
    const path = ROOM_PATH.exec(pathname);
    if (!path) return env.ASSETS.fetch(request);
    const code = normalizeCode(path[1]);
    if (!code) return new Response(null, { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};
