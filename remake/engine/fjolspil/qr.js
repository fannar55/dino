// The QR code of "Fjölspil" (spec §3): the phone page's join address, `.../remake/spil.html?r=<code>`, as the picture the
// lobby shows on the big screen and a phone's camera opens (spec §4 step 2). The encoding is Kazuhiko Arase's
// qrcode-generator 1.4.4 (MIT), vendored unmodified in remake/vendor/qrcode-generator/ with its licence beside it, since
// the remake has no npm packages and no build step. It is a classic script that defines the global `qrcode`, which the
// page loads before its module script; the tests hand the same function in as `lib`, from require.
//
// This module only draws. qrModules lets the encoder pick the smallest version that holds the text (type number 0) at the
// error-correction level asked for, in byte mode; the addresses are plain ASCII, which that mode takes as they are.
// qrSvg turns the dark modules into one path of unit squares inside a quiet zone, filled with currentColor and without a
// width or height, so the lobby's CSS gives it its colour (dark on light paper) and its size (spec §8).

const NOT_LOADED = 'QR: the encoder is not loaded (vendor/qrcode-generator/qrcode.js)';

/** `text` as a QR code: its size in modules, and whether the module at (row, col) is dark. */
export function qrModules(text, { lib = globalThis.qrcode, level = 'M' } = {}) {
  if (typeof lib !== 'function') throw new Error(NOT_LOADED);
  const qr = lib(0, level);
  qr.addData(text);
  qr.make();
  return { size: qr.getModuleCount(), dark: (row, col) => qr.isDark(row, col) };
}

/** `text` as an SVG QR code with `quiet` light modules round it, one unit per module; CSS colours it and sizes it. */
export function qrSvg(text, { lib, level, quiet = 4 } = {}) {
  const { size, dark } = qrModules(text, { lib, level });
  const side = size + 2 * quiet;
  let d = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) if (dark(row, col)) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img" aria-label="QR-kóði">`
    + `<path fill="currentColor" d="${d}"/></svg>`;
}
