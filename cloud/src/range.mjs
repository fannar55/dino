// Byte ranges of a sound, answered by the Worker (spec §11: the theme plays in Safari from the cloud). A browser moves about in
// a sound by asking for ranges of the file, and Safari will not play the theme from a host that gives none (remake/README.md,
// Deploying); under wrangler dev the static assets answered a range with 200 and the whole file. So the audio paths run the
// Worker first, and a 200 from the assets is cut here as tools/serve.mjs cuts it at home: bytes=a-b, bytes=a- (to the end),
// bytes=-n (the last n); an end past the file's end is the file's end; a start past it, or after the end asked for, is 416.

const RANGE = /^bytes=(\d*)-(\d*)$/;

/** Whether a Range header is one of the three forms answered here (one range, at least one number); anything else gets the whole file. */
export function isByteRange(rangeHeader) {
  const range = RANGE.exec(rangeHeader ?? '');
  return range !== null && (range[1] !== '' || range[2] !== '');
}

/**
 * The part of `body` (an ArrayBuffer or a Uint8Array, the whole file) a byte range asks for: { status: 206, headers, body } with
 * the slice, or { status: 416, headers, body: null } when it lies past the end. Null when the header is not a byte range.
 */
export function sliceRange(rangeHeader, body, contentType) {
  if (!isByteRange(rangeHeader)) return null;
  const [, first, last] = RANGE.exec(rangeHeader);
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const total = bytes.length;
  const start = first ? Number(first) : Math.max(0, total - Number(last));
  const end = first && last ? Math.min(Number(last), total - 1) : total - 1;
  if (start >= total || start > end) return { status: 416, headers: { 'Content-Range': `bytes */${total}` }, body: null };
  const headers = {
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1),
  };
  if (contentType) headers['Content-Type'] = contentType;
  return { status: 206, headers, body: bytes.slice(start, end + 1) };
}
