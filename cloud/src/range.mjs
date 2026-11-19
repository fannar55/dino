// Byte ranges of a sound or video, answered by the Worker (spec §11: the theme plays in Safari from the cloud). A browser moves about in
// a sound or video by asking for ranges of the file, and Safari will not play from a host that gives none (remake/README.md,
// Deploying); under wrangler dev the static assets answered a range with 200 and the whole file. So the audio and video paths run the
// Worker first, and a 200 from the assets (or a slice from R2) is cut here as tools/serve.mjs cuts it at home: bytes=a-b, bytes=a- (to the end),
// bytes=-n (the last n); an end past the file's end is the file's end; a start past it, or after the end asked for, is 416.

const RANGE = /^bytes=(\d*)-(\d*)$/;

/** Whether a Range header is one of the three forms answered here (one range, at least one number); anything else gets the whole file. */
export function isByteRange(rangeHeader) {
  const range = RANGE.exec(rangeHeader ?? '');
  return range !== null && (range[1] !== '' || range[2] !== '');
}

/**
 * The bounds of a byte range inside a file of `total` bytes: { valid: true, start, end, length, total }, or
 * { valid: false, total } when the range lies past the end (416). Null when the header is not a byte range.
 */
export function parseRange(rangeHeader, total) {
  if (!isByteRange(rangeHeader)) return null;
  const [, first, last] = RANGE.exec(rangeHeader);
  const start = first ? Number(first) : Math.max(0, total - Number(last));
  const end = first && last ? Math.min(Number(last), total - 1) : total - 1;
  if (start >= total || start > end) return { valid: false, total };
  return { valid: true, start, end, length: end - start + 1, total };
}

/**
 * The part of `body` (an ArrayBuffer or a Uint8Array, the whole file) a byte range asks for: { status: 206, headers, body } with
 * the slice, or { status: 416, headers, body: null } when it lies past the end. Null when the header is not a byte range.
 */
export function sliceRange(rangeHeader, body, contentType) {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const cut = parseRange(rangeHeader, bytes.length);
  if (!cut) return null;
  if (!cut.valid) return { status: 416, headers: { 'Content-Range': `bytes */${cut.total}` }, body: null };
  const headers = {
    'Content-Range': `bytes ${cut.start}-${cut.end}/${cut.total}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(cut.length),
  };
  if (contentType) headers['Content-Type'] = contentType;
  return { status: 206, headers, body: bytes.slice(cut.start, cut.end + 1) };
}
