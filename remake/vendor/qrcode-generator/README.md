# qrcode-generator 1.4.4

The QR encoder behind `engine/fjolspil/qr.js` (the join address as a QR code on the big screen, spec §3), vendored as
one file so the remake keeps no npm dependencies and no build step.

- Package: `qrcode-generator`, version `1.4.4`, by Kazuhiko Arase
- Source: https://unpkg.com/qrcode-generator@1.4.4/qrcode.js
- `qrcode.js`: 56694 bytes, sha256 `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`, copied byte
  for byte (its own LF line endings), not edited
- Licence: MIT. The npm package 1.4.4 ships no licence file (unpkg answers 404 for
  https://unpkg.com/qrcode-generator@1.4.4/LICENSE), so the grant is the MIT notice in qrcode.js's own header,
  reproduced in `LICENSE` with the MIT licence text written out for it.
- Downloaded: 2026-10-24

In the browser it is a classic script, `<script src="./vendor/qrcode-generator/qrcode.js"></script>` before the module
script, which defines the global `qrcode`; in Node (the tests) `require` gives the same function through the file's UMD
tail.

`package.json` here holds only `"type": "commonjs"`, in place of the package's own, which was not vendored. The repo's
root package.json says `"type": "module"`, under which Node would load qrcode.js as an ES module, and its UMD tail
would then export nothing. Browsers ignore it.
