// RFC 9110 section 14: support a single byte range from a complete cached audio
// response. Ignore malformed/unsupported ranges rather than inventing a 206.
export async function cachedAudioResponse(request, response) {
  const range = request.headers.get('range');
  const audio = /^audio\//i.test(response.headers.get('content-type') || '') || /\.(?:mp3|m4a|aac|ogg|wav|flac)$/i.test(new URL(request.url).pathname);
  if (!range || request.method !== 'GET' || response.status !== 200 || !audio) return response;
  // Fetch exposes decoded bytes. They cannot be used as offsets into a coded
  // representation; normal MP3 responses have no HTTP Content-Encoding.
  const encoding = response.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') return response;
  const match = /^bytes=\s*(\d*)-(\d*)\s*$/i.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return response;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if (first !== null && last !== null && last < first) return response;

  const condition = request.headers.get('if-range');
  if (condition) {
    const etag = response.headers.get('etag');
    const modified = response.headers.get('last-modified');
    const date = Date.parse(response.headers.get('date') || '');
    const stamp = Date.parse(modified || '');
    const strongTag = condition.startsWith('"') && condition === etag;
    const strongDate = condition === modified && Number.isFinite(stamp) && date - stamp >= 60000;
    if (!strongTag && !strongDate) return response;
  }

  const body = await response.clone().blob();
  const size = body.size;
  // Ignoring ranges on empty representations is permitted and avoids 0--1.
  if (!size) return response;
  const headers = new Headers(response.headers);
  headers.set('accept-ranges', 'bytes');
  // These describe a whole response body rather than its selected slice.
  for (const key of ['content-md5', 'digest', 'content-digest']) headers.delete(key);
  if (first === null ? last === 0 : first >= size) {
    headers.set('content-range', `bytes */${size}`);
    headers.set('content-length', '0');
    return new Response(null, { status: 416, statusText: 'Range Not Satisfiable', headers });
  }
  // Very large decimal numerals may parse as Infinity. Clamp them before
  // slicing: huge ends/suffixes mean EOF, while huge starts were rejected above.
  const start = first === null ? Math.max(0, size - last) : first;
  const end = first === null || last === null ? size - 1 : Math.min(last, size - 1);
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

// Kept pure so tests execute the exact worker without packaging a release.
export function createServiceWorkerSource(revision, files) {
  // The adventure remains available offline immediately. Large museum scans,
  // detail photographs and optional reading audio are fetched when explored.
  const optional = files.filter(file => file.startsWith('./assets/encyclopedia/') || file.startsWith('./assets/audio/encyclopedia_'));
  const core = files.filter(file => !optional.includes(file));
  return `// Generated from the exact self-contained release. No external services.
const CACHE=${JSON.stringify('stjornufar-' + revision)};
const FILES=${JSON.stringify(core)};
const OPTIONAL=new Set(${JSON.stringify(optional)}.map(path=>new URL(path,self.registration.scope).href));
${cachedAudioResponse.toString()}
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('stjornufar-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(event.request);if(cached)return cachedAudioResponse(event.request,cached);if(event.request.mode==='navigate'){const index=await cache.match(new URL('./index.html',self.registration.scope));if(index)return index;}const response=await fetch(event.request);if(OPTIONAL.has(event.request.url)&&response.status===200&&!response.headers.has('content-range')){try{await cache.put(event.request,response.clone());}catch{/* Full storage must not prevent viewing a museum object. */}}return response;}));});
`;
}
